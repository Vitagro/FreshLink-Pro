"use client"

// ============================================================
// autoSync — write-through localStorage → Supabase
//
// Objectif : Supabase est la source de vérité ; localStorage n'est qu'un
// cache de lecture synchrone (nécessaire car l'UI React lit en synchrone)
// + un tampon hors-ligne. Toute écriture locale d'une table FL est répercutée
// vers Supabase dès qu'on est en ligne ; sinon elle est mise en file et
// rejouée au retour de la connexion.
//
// SÛRETÉ : on ne fait que des UPSERT (jamais de DELETE déduit d'un diff —
// un cache partiel/filtré pourrait sinon supprimer des lignes valides en base).
// Les suppressions explicites passent toujours par db.deleteX (apiDelete).
// Conséquence : un guard manqué = au pire des écritures redondantes
// (idempotentes), jamais une perte de données.
// ============================================================

// Tables qui existent réellement en Supabase ({id, payload, updated_at}).
const SYNCED_KEYS = new Set<string>([
  "fl_users", "fl_clients", "fl_articles", "fl_fournisseurs", "fl_commandes",
  "fl_bons_achat", "fl_purchase_orders", "fl_receptions", "fl_bons_livraison",
  "fl_retours", "fl_trips", "fl_bons_preparation", "fl_messages", "fl_notices",
  "fl_visites", "fl_demandes_achat", "fl_non_achats", "fl_caisse",
  // fl_loyalty_transactions / fl_primes_nouveaux_clients : jamais synchronisés
  // avant (même bug que fl_caisse/fl_company) — chaque appareil aurait
  // calculé l'éligibilité "Prime nouveau client" indépendamment, risque de
  // double versement au prévendeur si consulté depuis deux appareils.
  "fl_loyalty_transactions", "fl_primes_nouveaux_clients",
  "fl_reglements_cv",
])

// La clé localStorage ne correspond pas toujours 1:1 au nom de la table
// Supabase — "fl_caisse" (store.ts getCaisseEntries/setLS) vit côté serveur
// dans "fl_caisse_entries" (nom déjà utilisé par deleteSynced ailleurs).
// Sans cette table, TOUTE la caisse restait piégée en localStorage,
// jamais synchronisée cross-device — bug critique sur des données
// financières (aucune sauvegarde centrale, perte possible au vidage cache).
const TABLE_NAME_OVERRIDE: Record<string, string> = { fl_caisse: "fl_caisse_entries" }

// Configs (objets uniques, PAS des tableaux) : process, workflow, alertes, emails.
// Stockés en base comme une ligne unique id="config" → propagation cross-device.
// fl_company (nom/logo/RC/ICE/IF/adresse société) manquait ici — jamais
// synchronisé, donc deux appareils/navigateurs pouvaient afficher deux
// logos et deux RC différents sur les BL/factures selon où la config avait
// été saisie (bug critique, source de la "confusion de logos").
const CONFIG_KEYS = new Set<string>([
  "fl_process_config", "fl_workflow_config", "fl_alert_config", "fl_email_config", "fl_fiscal_config",
  "fl_company", "fl_loyalty_config", "fl_group_names", "fl_mobile_tabs_visibility",
])

type Row = { id: string; [k: string]: unknown }

// Snapshot par table : id → JSON de la ligne déjà connue de Supabase.
// Sert à ne pousser QUE les lignes ajoutées/modifiées.
const snapshots: Record<string, Map<string, string>> = {}
const timers: Record<string, ReturnType<typeof setTimeout>> = {}
const QUEUE_KEY = "__fl_sync_queue"
const DELETE_QUEUE_KEY = "__fl_sync_delete_queue"
let replayReady = false
let suppressDepth = 0

function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine
}

function snapshotOf(arr: Row[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const r of arr) if (r && r.id != null) m.set(String(r.id), JSON.stringify(r))
  return m
}

/**
 * Exécute `fn` en mode « hydratation » : les écritures localStorage qu'elle
 * déclenche ne sont PAS repoussées vers Supabase (elles en proviennent), mais
 * servent à initialiser le snapshot. À utiliser autour des lectures
 * Supabase → cache (fetchX, syncFromSupabase).
 */
export function suppressAutoSync<T>(fn: () => T): T {
  suppressDepth++
  try { return fn() } finally { suppressDepth-- }
}

function markDirty(key: string) {
  try {
    const q = new Set<string>(JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]"))
    q.add(key)
    localStorage.setItem(QUEUE_KEY, JSON.stringify([...q]))
  } catch { /* noop */ }
}

async function flushKey(key: string, raw: string): Promise<void> {
  let arr: Row[]
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return
    arr = parsed as Row[]
  } catch { return }

  const next = snapshotOf(arr)
  const prev = snapshots[key]

  // Diff : lignes nouvelles ou modifiées (jamais de delete déduit).
  const now = new Date().toISOString()
  const upserts: { id: string; payload: Row; updated_at: string }[] = []
  for (const [id, json] of next) {
    if (!prev || prev.get(id) !== json) {
      upserts.push({ id, payload: JSON.parse(json) as Row, updated_at: now })
    }
  }

  if (upserts.length === 0) { snapshots[key] = next; return }
  if (!isOnline()) { markDirty(key); return }

  try {
    const res = await fetch("/api/sync-write", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: TABLE_NAME_OVERRIDE[key] ?? key, upserts }),
    })
    const json = await res.json() as { ok: boolean }
    if (json.ok) snapshots[key] = next   // succès → le snapshot avance
    else markDirty(key)
  } catch { markDirty(key) }
}

// Pousse une config (objet unique) comme une ligne id="config".
async function flushConfig(key: string, raw: string): Promise<void> {
  let obj: unknown
  try { obj = JSON.parse(raw) } catch { return }
  if (!isOnline()) { markDirty(key); return }
  try {
    const res = await fetch("/api/sync-write", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: key, upserts: [{ id: "config", payload: obj, updated_at: new Date().toISOString() }] }),
    })
    const json = await res.json() as { ok: boolean }
    if (!json.ok) markDirty(key)
  } catch { markDirty(key) }
}

/** Appelé par setLS à chaque écriture localStorage. */
export function onLocalWrite(key: string, raw: string): void {
  ensureReplay()
  if (CONFIG_KEYS.has(key)) {
    if (suppressDepth > 0) return    // écriture issue d'une hydratation
    clearTimeout(timers[key])
    timers[key] = setTimeout(() => { void flushConfig(key, raw) }, 1000)
    return
  }
  if (!SYNCED_KEYS.has(key)) return

  if (suppressDepth > 0) {
    // Écriture issue d'une hydratation Supabase : ces lignes sont déjà en base,
    // on initialise le snapshot sans rien repousser.
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) snapshots[key] = snapshotOf(parsed as Row[])
    } catch { /* noop */ }
    return
  }

  clearTimeout(timers[key])
  timers[key] = setTimeout(() => { void flushKey(key, raw) }, 1000)
}

function flushQueue(): void {
  let q: string[] = []
  try { q = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") } catch { /* noop */ }
  if (q.length === 0) return
  localStorage.removeItem(QUEUE_KEY)
  for (const key of q) {
    const raw = localStorage.getItem(key)
    if (!raw) continue
    if (CONFIG_KEYS.has(key)) void flushConfig(key, raw)
    else void flushKey(key, raw)
  }
}

// ── Suppressions explicites → Supabase ────────────────────────────────────────
// Une suppression NE PEUT PAS être déduite d'un diff localStorage (cf. note en
// tête de fichier). Elle doit être propagée explicitement, sinon la ligne reste
// en base et « revient » au prochain fetch (bug « commandes supprimées qui
// reviennent »). File d'attente hors-ligne rejouée au retour de connexion.
function queueDelete(table: string, id: string): void {
  try {
    const q = JSON.parse(localStorage.getItem(DELETE_QUEUE_KEY) ?? "[]") as { table: string; id: string }[]
    q.push({ table, id })
    localStorage.setItem(DELETE_QUEUE_KEY, JSON.stringify(q))
  } catch { /* noop */ }
}

export async function syncDelete(table: string, ids: string[]): Promise<void> {
  if (typeof window === "undefined" || ids.length === 0) return
  // Retire les ids du snapshot pour éviter tout re-push via un futur diff.
  const snap = snapshots[table]
  if (snap) for (const id of ids) snap.delete(String(id))
  if (!isOnline()) { for (const id of ids) queueDelete(table, id); return }
  try {
    const res = await fetch("/api/sync-write", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table, deletes: ids }),
    })
    const json = await res.json() as { ok: boolean }
    if (!json.ok) for (const id of ids) queueDelete(table, id)
  } catch { for (const id of ids) queueDelete(table, id) }
}

function flushDeleteQueue(): void {
  let q: { table: string; id: string }[] = []
  try { q = JSON.parse(localStorage.getItem(DELETE_QUEUE_KEY) ?? "[]") } catch { /* noop */ }
  if (q.length === 0) return
  localStorage.removeItem(DELETE_QUEUE_KEY)
  const byTable: Record<string, string[]> = {}
  for (const { table, id } of q) (byTable[table] ??= []).push(id)
  for (const [table, ids] of Object.entries(byTable)) void syncDelete(table, ids)
}

/** Installe le rejeu hors-ligne (une seule fois). */
export function ensureReplay(): void {
  if (replayReady || typeof window === "undefined") return
  replayReady = true
  window.addEventListener("online", () => { flushQueue(); flushDeleteQueue() })
  if (isOnline()) { flushQueue(); flushDeleteQueue() }
}
