"use client"

// ============================================================
// FreshLink Pro — DB layer JSONB (Supabase + localStorage fallback)
//
// SCHÉMA SUPABASE : toutes les tables ERP ont le schéma :
//   id TEXT PRIMARY KEY
//   payload JSONB NOT NULL DEFAULT '{}'
//   updated_at TIMESTAMPTZ DEFAULT now()
//
// Chaque objet est stocké entier dans `payload`.
// Pas de mapping colonnes — aucun problème camelCase/snake_case.
//
// Toutes les ÉCRITURES passent par /api/sync-write (service role key).
// Les lectures utilisent le client anon (lecture seule, RLS permissive).
// ============================================================

import { store } from "@/lib/store"
import { suppressAutoSync } from "./autoSync"
import type {
  User, Client, Article, Fournisseur, Livreur, MotifRetour,
  Commande, Visite, BonAchat, PurchaseOrder, Reception,
  Trip, BonLivraison, Retour, BonPreparation,
  TransfertStock, Message, Notice, CaisseEntry,
  LoyaltyTransaction, PrimeNouveauClient, CaisseEtrangere,
} from "@/lib/store"

// ── Helpers JSONB ─────────────────────────────────────────────────────────────

function toRow(item: Record<string, unknown>) {
  return { id: item.id as string, payload: item, updated_at: new Date().toISOString() }
}

function fromRow<T>(row: { id: string; payload: unknown }): T {
  // row.id (la vraie clé primaire) fait toujours foi — certains payloads plus
  // anciens ne contiennent pas leur propre "id", ce qui laissait l'objet
  // reconstitué avec id=undefined (ex: crash "Cannot read properties of null
  // (reading 'sending')" dans la liste Utilisateurs : un id undefined pouvait
  // matcher un état null par coïncidence dans une comparaison).
  if (row.payload && typeof row.payload === "object") return { ...row.payload, id: row.id } as T
  return row as unknown as T
}

// Lecture cross-device via le SERVICE-ROLE (/api/sync-read, protégé par device-guard).
// Les politiques RLS bloquent l'anon → les lectures directes renvoyaient 0 ligne
// (clients/users/commandes invisibles). On passe par l'endpoint service-role.
// Dernière erreur de lecture Supabase (pour diagnostic UI : distingue
// "service-role manquante" (env Vercel) de "Device non autorisé" (cookie) etc.)
let _lastReadError: string | null = null
export function getLastSupabaseError(): string | null { return _lastReadError }

async function readRows(table: string): Promise<{ data: { id: string; payload: unknown }[] | null; error: string | null }> {
  try {
    const res = await fetch(`/api/sync-read?table=${encodeURIComponent(table)}`, { cache: "no-store" })
    const j = await res.json().catch(() => null)
    if (!res.ok || !j?.ok) {
      _lastReadError = (j?.error as string) || `HTTP ${res.status}`
      return { data: null, error: _lastReadError }
    }
    _lastReadError = null
    return { data: Array.isArray(j.data) ? j.data : [], error: null }
  } catch (e) {
    _lastReadError = e instanceof Error ? e.message : String(e)
    return { data: null, error: _lastReadError }
  }
}

// Route all writes through /api/sync-write (service role key bypasses RLS)
async function apiUpsert(table: string, item: Record<string, unknown>): Promise<void> {
  try {
    const res = await fetch("/api/sync-write", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table, upserts: [toRow(item)] }),
    })
    const json = await res.json() as { ok: boolean; errors?: string[] }
    if (!json.ok) console.error(`[db] upsert ${table}:`, json.errors?.join(", "))
  } catch { /* offline */ }
}

async function apiDelete(table: string, id: string): Promise<void> {
  try {
    const res = await fetch("/api/sync-write", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table, deletes: [id] }),
    })
    const json = await res.json() as { ok: boolean; errors?: string[] }
    if (!json.ok) console.error(`[db] delete ${table}/${id}:`, json.errors?.join(", "))
  } catch { /* offline */ }
}

// ── USERS ─────────────────────────────────────────────────────────────────────

export async function upsertUser(u: User) {
  const all = store.getUsers()
  const idx = all.findIndex(x => x.id === u.id)
  if (idx >= 0) all[idx] = u; else all.push(u)
  store.saveUsers(all)
  await apiUpsert("fl_users", u as unknown as Record<string, unknown>)
}

export async function deleteUser(id: string) {
  store.saveUsers(store.getUsers().filter(u => u.id !== id))
  await apiDelete("fl_users", id)
}

export async function fetchUsers(): Promise<User[]> {
  // ⚠️ Passe par /api/sync-read (service-role) et NON le client anon : fl_users
  // est verrouillé en lecture pour l'anon (RLS), donc une lecture anon renvoie
  // un tableau VIDE — indistinguable d'une table réellement vide — et aurait
  // sinon effacé silencieusement tout le cache local via le "remplace toujours"
  // ci-dessous. Le service-role lit réellement la table, donc [] ici signifie
  // vraiment "vide" (ex. après réinitialisation), pas "accès refusé".
  try {
    const res = await fetch("/api/sync-read?table=fl_users", { cache: "no-store" })
    const json = await res.json() as { ok: boolean; data?: { id: string; payload: unknown }[] }
    if (json.ok && json.data) {
      const users = json.data.map(r => fromRow<User>(r))
      store.saveUsers(users)
      return users
    }
  } catch { /* offline */ }
  return store.getUsers()
}

// ── CLIENTS ───────────────────────────────────────────────────────────────────

export async function upsertClient(c: Client) {
  const all = store.getClients()
  const idx = all.findIndex(x => x.id === c.id)
  if (idx >= 0) all[idx] = c; else all.push(c)
  store.saveClients(all)
  await apiUpsert("fl_clients", c as unknown as Record<string, unknown>)
}

export async function deleteClient(id: string) {
  store.saveClients(store.getClients().filter(c => c.id !== id))
  await apiDelete("fl_clients", id)
}

export async function fetchClients(): Promise<{ clients: Client[]; source: "supabase" | "local" }> {
  try {
    const { data, error } = await readRows("fl_clients")
    if (error) throw error
    // Connexion OK — remplace toujours le cache local, même si la table est
    // vide (ex. apres "Réinitialiser les données" : la vacuité doit se propager).
    if (data) {
      const clients = (data as { id: string; payload: unknown }[]).map(r => fromRow<Client>(r))
      suppressAutoSync(() => store.saveClients(clients))
      return { clients, source: "supabase" }
    }
    return { clients: store.getClients(), source: "supabase" }
  } catch { /* truly offline or unreachable */ }
  return { clients: store.getClients(), source: "local" }
}

export async function importClients(rows: Client[]): Promise<{ inserted: number; updated: number; errors: number }> {
  let inserted = 0, updated = 0, errors = 0
  const existingIds = new Set(store.getClients().map(c => c.id))
  for (const c of rows) {
    try {
      await upsertClient(c)
      existingIds.has(c.id) ? updated++ : inserted++
    } catch { errors++ }
  }
  return { inserted, updated, errors }
}

// ── ARTICLES ──────────────────────────────────────────────────────────────────

export async function upsertArticle(a: Article) {
  const all = store.getArticles()
  const idx = all.findIndex(x => x.id === a.id)
  if (idx >= 0) all[idx] = a; else all.push(a)
  store.saveArticles(all)
  await apiUpsert("fl_articles", a as unknown as Record<string, unknown>)
}

export async function deleteArticle(id: string) {
  store.saveArticles(store.getArticles().filter(a => a.id !== id))
  await apiDelete("fl_articles", id)
}

export async function fetchArticles(): Promise<Article[]> {
  // Lecture via l'API service-role (/api/sync-read) : le client ANON est
  // bloqué par la RLS sur fl_articles → les articles ne se synchronisaient
  // pas chez les prévendeurs mobiles. Le service-role contourne la RLS.
  try {
    const res = await fetch("/api/sync-read?table=fl_articles", { cache: "no-store" })
    if (res.ok) {
      const j = await res.json() as { ok?: boolean; data?: { id: string; payload?: unknown }[] }
      // j.ok === true avec data=[] signifie "Supabase a répondu, la table est
      // vide" (ex. apres réinitialisation) — on doit alors vider le cache local
      // aussi, pas juste quand il y a des lignes.
      if (j?.ok !== false) {
        const rows = j?.data ?? []
        const articles = rows.map(r => fromRow<Article>(r as { id: string; payload: unknown }))
        suppressAutoSync(() => store.saveArticles(articles))
        return store.getArticles()   // normalisé (nom/famille/unite garantis)
      }
    }
  } catch { /* offline / hors app */ }
  // Repli : client anon (si l'API est inaccessible mais la RLS ouverte)
  try {
    const { data, error } = await readRows("fl_articles")
    if (!error && data) {
      const articles = (data as { id: string; payload: unknown }[]).map(r => fromRow<Article>(r))
      suppressAutoSync(() => store.saveArticles(articles))
      return store.getArticles()
    }
  } catch { /* offline */ }
  return store.getArticles()
}

// ── FOURNISSEURS ──────────────────────────────────────────────────────────────

export async function upsertFournisseur(f: Fournisseur) {
  const all = store.getFournisseurs()
  const idx = all.findIndex(x => x.id === f.id)
  if (idx >= 0) all[idx] = f; else all.push(f)
  store.saveFournisseurs(all)
  await apiUpsert("fl_fournisseurs", f as unknown as Record<string, unknown>)
}

export async function fetchFournisseurs(): Promise<Fournisseur[]> {
  try {
    const { data, error } = await readRows("fl_fournisseurs")
    if (error) throw error
    if (data) {
      const items = (data as { id: string; payload: unknown }[]).map(r => fromRow<Fournisseur>(r))
      suppressAutoSync(() => store.saveFournisseurs(items))
      return items
    }
  } catch { /* offline */ }
  return store.getFournisseurs()
}

// ── COMMANDES ─────────────────────────────────────────────────────────────────

export async function upsertCommande(c: Commande) {
  const all = store.getCommandes()
  const idx = all.findIndex(x => x.id === c.id)
  if (idx >= 0) all[idx] = c; else all.push(c)
  store.saveCommandes(all)
  await apiUpsert("fl_commandes", c as unknown as Record<string, unknown>)
}

export async function deleteCommande(id: string) {
  store.saveCommandes(store.getCommandes().filter(c => c.id !== id))
  await apiDelete("fl_commandes", id)
}

export async function fetchCommandes(dateFilter?: string): Promise<Commande[]> {
  try {
    const { data, error } = await readRows("fl_commandes")
    if (error) throw error
    if (data) {
      const remote = (data as { id: string; payload: unknown }[]).map(r => fromRow<Commande>(r))
      // ⚠️ Fusion NON destructive : on NE remplace PAS le local par Supabase.
      // Sinon une commande créée hors-ligne (pas encore poussée) serait effacée
      // au remount / changement de rôle (bug "chiffres prévendeur disparus").
      // Supabase fait foi pour les ids partagés ; les commandes uniquement
      // locales (non encore synchronisées) sont conservées.
      const byId = new Map<string, Commande>()
      for (const c of store.getCommandes()) byId.set(c.id, c)
      for (const c of remote) byId.set(c.id, c)
      const merged = [...byId.values()]
      suppressAutoSync(() => store.saveCommandes(merged))
      return dateFilter ? merged.filter(c => c.date === dateFilter) : merged
    }
  } catch { /* offline */ }
  const all = store.getCommandes()
  return dateFilter ? all.filter(c => c.date === dateFilter) : all
}

// ── VISITES ───────────────────────────────────────────────────────────────────

export async function upsertVisite(v: Visite) {
  const all = store.getVisites()
  const idx = all.findIndex(x => x.id === v.id)
  if (idx >= 0) all[idx] = v; else all.push(v)
  store.saveVisites(all)
  await apiUpsert("fl_visites", v as unknown as Record<string, unknown>)
}

// ── TRIPS ─────────────────────────────────────────────────────────────────────

export async function upsertTrip(t: Trip) {
  const all = store.getTrips()
  const idx = all.findIndex(x => x.id === t.id)
  if (idx >= 0) all[idx] = t; else all.push(t)
  store.saveTrips(all)
  await apiUpsert("fl_trips", t as unknown as Record<string, unknown>)
}

export async function fetchTrips(): Promise<Trip[]> {
  try {
    const { data, error } = await readRows("fl_trips")
    if (error) throw error
    if (data) {
      const items = (data as { id: string; payload: unknown }[]).map(r => fromRow<Trip>(r))
      suppressAutoSync(() => store.saveTrips(items))
      return items
    }
  } catch { /* offline */ }
  return store.getTrips()
}

// ── BONS LIVRAISON ────────────────────────────────────────────────────────────

export async function upsertBonLivraison(b: BonLivraison) {
  const all = store.getBonsLivraison()
  const idx = all.findIndex(x => x.id === b.id)
  if (idx >= 0) all[idx] = b; else all.push(b)
  store.saveBonsLivraison(all)
  await apiUpsert("fl_bons_livraison", b as unknown as Record<string, unknown>)
}

export async function fetchBonsLivraison(): Promise<BonLivraison[]> {
  try {
    const { data, error } = await readRows("fl_bons_livraison")
    if (error) throw error
    if (data) {
      const items = (data as { id: string; payload: unknown }[]).map(r => fromRow<BonLivraison>(r))
      suppressAutoSync(() => store.saveBonsLivraison(items))
      return items
    }
  } catch { /* offline */ }
  return store.getBonsLivraison()
}

// ── RETOURS ───────────────────────────────────────────────────────────────────

export async function upsertRetour(r: Retour) {
  const all = store.getRetours()
  const idx = all.findIndex(x => x.id === r.id)
  if (idx >= 0) all[idx] = r; else all.push(r)
  store.saveRetours(all)
  await apiUpsert("fl_retours", r as unknown as Record<string, unknown>)
}

export async function fetchRetours(): Promise<Retour[]> {
  try {
    const { data, error } = await readRows("fl_retours")
    if (error) throw error
    if (data) {
      const items = (data as { id: string; payload: unknown }[]).map(r => fromRow<Retour>(r))
      suppressAutoSync(() => store.saveRetours(items))
      return items
    }
  } catch { /* offline */ }
  return store.getRetours()
}

// ── BONS ACHAT ────────────────────────────────────────────────────────────────

export async function upsertBonAchat(b: BonAchat) {
  const all = store.getBonsAchat()
  const idx = all.findIndex(x => x.id === b.id)
  if (idx >= 0) all[idx] = b; else all.push(b)
  store.saveBonsAchat(all)
  await apiUpsert("fl_bons_achat", b as unknown as Record<string, unknown>)
}

// ── PURCHASE ORDERS ───────────────────────────────────────────────────────────

export async function upsertPurchaseOrder(p: PurchaseOrder) {
  const all = store.getPurchaseOrders()
  const idx = all.findIndex(x => x.id === p.id)
  if (idx >= 0) all[idx] = p; else all.push(p)
  store.savePurchaseOrders(all)
  await apiUpsert("fl_purchase_orders", p as unknown as Record<string, unknown>)
}

// ── CAISSES ÉTRANGÈRES ────────────────────────────────────────────────────────

export async function upsertCaisseEtrangere(c: CaisseEtrangere) {
  const all = store.getCaissesEtrangeres()
  const idx = all.findIndex(x => x.id === c.id)
  if (idx >= 0) all[idx] = c; else all.unshift(c)
  store.saveCaissesEtrangeres(all)
  await apiUpsert("fl_caisses_etrangeres", c as unknown as Record<string, unknown>)
}

// ── RECEPTIONS ────────────────────────────────────────────────────────────────

export async function upsertReception(r: Reception) {
  const all = store.getReceptions()
  const idx = all.findIndex(x => x.id === r.id)
  if (idx >= 0) all[idx] = r; else all.push(r)
  store.saveReceptions(all)
  await apiUpsert("fl_receptions", r as unknown as Record<string, unknown>)
}

// ── BONS PREPARATION ─────────────────────────────────────────────────────────

export async function upsertBonPreparation(b: BonPreparation) {
  const all = store.getBonsPreparation()
  const idx = all.findIndex(x => x.id === b.id)
  if (idx >= 0) all[idx] = b; else all.push(b)
  store.saveBonsPreparation(all)
  await apiUpsert("fl_bons_preparation", b as unknown as Record<string, unknown>)
}

// ── TRANSFERTS STOCK ──────────────────────────────────────────────────────────

export async function upsertTransfert(t: TransfertStock) {
  const all = store.getTransferts()
  const idx = all.findIndex(x => x.id === t.id)
  if (idx >= 0) all[idx] = t; else all.push(t)
  store.saveTransferts(all)
  await apiUpsert("fl_transferts_stock", t as unknown as Record<string, unknown>)
}

// ── LIVREURS ──────────────────────────────────────────────────────────────────

export async function upsertLivreur(l: Livreur) {
  const all = store.getLivreurs?.() ?? []
  const idx = all.findIndex(x => x.id === l.id)
  if (idx >= 0) all[idx] = l; else all.push(l)
  store.saveLivreurs?.(all)
  await apiUpsert("fl_livreurs", l as unknown as Record<string, unknown>)
}

// ── MOTIFS RETOUR ─────────────────────────────────────────────────────────────

export async function upsertMotif(m: MotifRetour) {
  const all = store.getMotifs()
  const idx = all.findIndex(x => x.id === m.id)
  if (idx >= 0) all[idx] = m; else all.push(m)
  store.saveMotifs(all)
  await apiUpsert("fl_non_achats", m as unknown as Record<string, unknown>)
}

// ── MESSAGES ──────────────────────────────────────────────────────────────────

export async function upsertMessage(m: Message) {
  const all = store.getMessages()
  const idx = all.findIndex(x => x.id === m.id)
  if (idx >= 0) all[idx] = m; else all.push(m)
  store.saveMessages(all)
  await apiUpsert("fl_messages", m as unknown as Record<string, unknown>)
}

// Récupère les messages depuis Supabase et les FUSIONNE dans le cache local (par
// id — jamais de wipe). Garantit la réception sans rechargement manuel (poll), en
// complément du temps réel (broadcast). Renvoie la liste locale fusionnée.
export async function fetchMessages(): Promise<Message[]> {
  try {
    const { data, error } = await readRows("fl_messages")
    if (!error && Array.isArray(data) && data.length > 0) {
      const remote = (data as { id: string; payload: unknown }[]).map(r => fromRow<Message>(r))
      const byId = new Map<string, Message>()
      for (const x of store.getMessages()) byId.set(x.id, x)
      for (const x of remote) byId.set(x.id, x)   // le distant prime à id égal
      suppressAutoSync(() => store.saveMessages([...byId.values()]))
    }
  } catch { /* hors ligne — cache local */ }
  return store.getMessages()
}

// ── NOTICES ───────────────────────────────────────────────────────────────────

export async function upsertNotice(n: Notice) {
  const all = store.getNotices()
  const idx = all.findIndex(x => x.id === n.id)
  if (idx >= 0) all[idx] = n; else all.push(n)
  store.saveNotices(all)
  await apiUpsert("fl_notices", n as unknown as Record<string, unknown>)
}

// ── SYNC COMPLET : Supabase → localStorage ────────────────────────────────────

export async function syncFromSupabase(): Promise<{ ok: boolean; tables: string[]; errors: string[] }> {
  const tables: string[] = []
  const errors: string[] = []

  // ── Reset global intentionnel ? (fl_notices __db_reset {at}) ───────────────
  // Le garde anti-perte préserve le local quand le distant est vide. MAIS un vrai
  // « Tout effacer » DOIT vider les autres appareils (sinon les anciennes données
  // « reviennent »). On détecte donc un reset plus récent que celui déjà vu : dans
  // ce cas SEULEMENT on autorise le vidage local. Les vides transitoires (RLS /
  // réseau) n'ont pas de marqueur → local préservé.
  let resetActive = false
  try {
    const res = await fetch("/api/sync-read?table=fl_notices", { cache: "no-store" })
    const j = await res.json()
    const at = (j?.data ?? []).find((r: { id: string }) => r.id === "__db_reset")?.payload?.at as string | undefined
    if (at) {
      const seen = typeof localStorage !== "undefined" ? localStorage.getItem("fl_db_reset_seen") : null
      if (!seen || new Date(at).getTime() > new Date(seen).getTime()) {
        resetActive = true
        try { localStorage.setItem("fl_db_reset_seen", at) } catch { /* noop */ }
      }
    }
  } catch { /* pas de marqueur → garde anti-perte normal */ }

  const ERP_TABLE_MAP: [string, (items: unknown[]) => void, () => unknown[]][] = [
    ["fl_users",            (d) => store.saveUsers(d as User[]),                  () => store.getUsers()],
    ["fl_clients",          (d) => store.saveClients(d as Client[]),              () => store.getClients()],
    ["fl_articles",         (d) => store.saveArticles(d as Article[]),            () => store.getArticles()],
    ["fl_fournisseurs",     (d) => store.saveFournisseurs(d as Fournisseur[]),    () => store.getFournisseurs()],
    ["fl_commandes",        (d) => store.saveCommandes(d as Commande[]),          () => store.getCommandes()],
    ["fl_bons_achat",       (d) => store.saveBonsAchat(d as BonAchat[]),          () => store.getBonsAchat()],
    ["fl_purchase_orders",  (d) => store.savePurchaseOrders(d as PurchaseOrder[]),() => store.getPurchaseOrders()],
    ["fl_receptions",       (d) => store.saveReceptions(d as Reception[]),        () => store.getReceptions()],
    ["fl_bons_livraison",   (d) => store.saveBonsLivraison(d as BonLivraison[]),  () => store.getBonsLivraison()],
    ["fl_retours",          (d) => store.saveRetours(d as Retour[]),              () => store.getRetours()],
    ["fl_trips",            (d) => store.saveTrips(d as Trip[]),                  () => store.getTrips()],
    ["fl_bons_preparation", (d) => store.saveBonsPreparation(d as BonPreparation[]),() => store.getBonsPreparation()],
    ["fl_messages",         (d) => store.saveMessages(d as Message[]),            () => store.getMessages()],
    ["fl_notices",          (d) => store.saveNotices(d as Notice[]),              () => store.getNotices()],
    // fl_caisse_entries (Supabase) <-> fl_caisse (clé locale, store.ts) —
    // absent jusqu'ici : la caisse ne se synchronisait jamais cross-device.
    ["fl_caisse_entries",   (d) => store.saveCaisseEntries(d as CaisseEntry[]),   () => store.getCaisseEntries()],
    // Jamais synchronisés avant (même bug) — la Prime Nouveau Client dépend
    // directement de ces deux tables pour rester cohérente cross-device.
    ["fl_loyalty_transactions", (d) => store.saveLoyaltyTransactions(d as LoyaltyTransaction[]), () => store.getLoyaltyTransactions()],
    ["fl_primes_nouveaux_clients", (d) => store.savePrimesNouveauxClients(d as PrimeNouveauClient[]), () => store.getPrimesNouveauxClients()],
    ["fl_caisses_etrangeres", (d) => store.saveCaissesEtrangeres(d as CaisseEtrangere[]), () => store.getCaissesEtrangeres()],
  ]

  // Requêtes parallèles — toutes les tables en même temps (x10 plus rapide)
  await Promise.all(
    ERP_TABLE_MAP.map(async ([table, save, getLocal]) => {
      try {
        const { data, error } = await readRows(table)
        if (error) { errors.push(`${table}: ${error}`); return }
        if (data && Array.isArray(data)) {
          const items = (data as { id: string; payload: unknown }[]).map(r => fromRow<unknown>(r))
          // ⛔ ANTI-PERTE DE DONNÉES (cause des "base vide / historique disparu") :
          // on ne REMPLACE JAMAIS un cache local NON VIDE par un résultat distant
          // VIDE. Un distant vide arrive aussi quand la lecture anon est filtrée par
          // RLS, lors d'un blip réseau, ou pour des données encore jamais montées
          // sur Supabase (appareil hors-ligne). Dans ces cas on PRÉSERVE le local —
          // le write-through / l'auto-push le repoussera. (Le reset "Tout effacer"
          // vide Supabase ET le local de l'appareil qui l'exécute ; les autres
          // appareils gardent leur cache jusqu'à un effacement explicite.)
          let localCount = 0
          try { localCount = getLocal().length } catch { /* ignore */ }
          // Distant vide + local plein : on préserve le local… SAUF si un reset
          // global récent a été détecté (alors on honore le vidage volontaire).
          if (items.length === 0 && localCount > 0 && !resetActive) {
            console.warn(`[sync] ${table}: distant vide ignoré — ${localCount} ligne(s) locale(s) préservée(s)`)
            // Rattrapage immédiat pour fl_caisse_entries : cette table n'a été
            // ajoutée à la synchro qu'après coup (bug historique — les
            // écritures de caisse ne remontaient jamais vers Supabase). Sans
            // ce push explicite, les données déjà piégées en local
            // n'auraient été repoussées qu'à la PROCHAINE écriture sur ce
            // même appareil — potentiellement jamais si l'appareil n'est
            // plus utilisé pour la caisse. On les pousse donc une fois ici.
            if (table === "fl_caisse_entries") {
              try {
                const local = getLocal() as { id: string }[]
                await fetch("/api/sync-write", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ table, upserts: local.map(e => ({ id: e.id, payload: e, updated_at: new Date().toISOString() })) }),
                })
                console.warn(`[sync] ${table}: rattrapage — ${local.length} ligne(s) locale(s) poussée(s) vers Supabase`)
              } catch { /* best-effort — le write-through habituel reprendra au prochain changement */ }
            }
            return
          }
          suppressAutoSync(() => save(items))
          tables.push(table)
        }
      } catch (e) {
        errors.push(`${table}: ${String(e)}`)
      }
    })
  )

  // ── Garde anti-fantôme : signale les commandes liées à un prévendeur absent ──
  try {
    const userIds = new Set(store.getUsers().map(u => u.id))
    const orphans = store.getCommandes().filter(c => c.commercialId && !userIds.has(c.commercialId))
    if (orphans.length) {
      console.warn(`[sync] ⚠️ ${orphans.length} commande(s) liée(s) à un prévendeur INEXISTANT (fantôme) :`,
        orphans.slice(0, 15).map(c => `${c.id}→${c.commercialId}`))
      errors.push(`⚠️ ${orphans.length} commande(s) à prévendeur fantôme`)
    }
  } catch { /* audit best-effort */ }

  window.dispatchEvent(new CustomEvent("fl_store_updated"))
  return { ok: errors.length === 0, tables, errors }
}

// ── CONFIGS (process / workflow / alertes / emails) ───────────────────────────
// Objets uniques (ligne id="config"). Lecture via /api/sync-read (service_role) car
// ces tables n'ont AUCUNE politique anon. Hydrate le cache local sans réécho Supabase.
const CONFIG_TABLES = ["fl_process_config", "fl_workflow_config", "fl_alert_config", "fl_email_config", "fl_fiscal_config", "fl_company", "fl_loyalty_config"]

export async function hydrateConfigs(): Promise<void> {
  if (typeof window === "undefined") return
  await Promise.all(CONFIG_TABLES.map(async (table) => {
    try {
      const res = await fetch(`/api/sync-read?table=${table}`, { cache: "no-store" })
      const json = await res.json()
      if (!json?.ok) return
      const row = (json.data ?? []).find((r: { id: string }) => r.id === "config")
      if (row?.payload && typeof row.payload === "object") {
        // setItem direct (pas setLS) → n'échote pas vers Supabase
        localStorage.setItem(table, JSON.stringify(row.payload))
      }
    } catch { /* offline — le local fait foi */ }
  }))
  window.dispatchEvent(new CustomEvent("fl_store_updated", { detail: { table: "config" } }))
}
