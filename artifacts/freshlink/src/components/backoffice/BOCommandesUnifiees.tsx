"use client"

import { useState, useEffect, useCallback } from "react"
import { store, type Commande, type LigneCommande } from "@/lib/store"
import type { User } from "@/lib/store"

interface Props { user: User }

// ── Types normalisés ─────────────────────────────────────────────────────────

interface CmdUnifiee {
  id:          string
  numero:      string
  date:        string
  nom_client:  string
  telephone:   string
  adresse?:    string
  lignes:      LigneCmd[]
  montant:     number
  statut:      string
  source:      "web" | "erp"
  prevendeur:  string   // nom du prévendeur (ERP) ou "" pour web
  zone?:       string
  categorie?:  string   // CHR, particulier, marchand, secteur…
  notes?:      string
  table:       "fl_commandes_web" | "fl_commandes"
  rawPayload?: Record<string, unknown>  // payload complet ERP pour mise à jour
  heurelivraison?: string  // heure de livraison souhaitée (préférence client, PAS l'heure de prise de commande)
  heureCommande?: string   // heure réelle de prise de commande (HH:MM), dérivée de createdAtIso
  createdAtIso?: string    // timestamp ISO complet (createdAt/created_at/updated_at) — sert au tri chronologique réel
}

interface LigneCmd {
  nom:      string
  quantite: number
  unite:    string
  prix:     number
  total:    number
}

// ── Config statuts ───────────────────────────────────────────────────────────

const STATUTS_WEB: Record<string, { label: string; color: string; icon: string }> = {
  nouveau:     { label: "Nouveau",      color: "bg-blue-100 text-blue-700 border-blue-200",       icon: "🆕" },
  a_confirmer: { label: "À confirmer",  color: "bg-orange-100 text-orange-700 border-orange-200", icon: "⏳" },
  en_cours:    { label: "En cours",     color: "bg-amber-100 text-amber-700 border-amber-200",    icon: "⏳" },
  prepare:     { label: "Préparé",      color: "bg-purple-100 text-purple-700 border-purple-200", icon: "📦" },
  livre:       { label: "Livré",        color: "bg-green-100 text-green-700 border-green-200",    icon: "✅" },
  annule:      { label: "Annulé",       color: "bg-red-100 text-red-700 border-red-200",          icon: "❌" },
}

const STATUTS_ERP: Record<string, { label: string; color: string; icon: string }> = {
  en_attente:             { label: "En attente",     color: "bg-slate-100 text-slate-600 border-slate-200",    icon: "🕐" },
  en_attente_approbation: { label: "En approbation", color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: "👁️" },
  valide:                 { label: "Validé",         color: "bg-green-100 text-green-700 border-green-200",    icon: "✅" },
  en_preparation:         { label: "En préparation", color: "bg-violet-100 text-violet-700 border-violet-200", icon: "📦" },
  charge:                 { label: "Chargé",         color: "bg-cyan-100 text-cyan-700 border-cyan-200",       icon: "🚛" },
  refuse:                 { label: "Refusé",         color: "bg-red-100 text-red-700 border-red-200",          icon: "🚫" },
  en_transit:             { label: "En transit",     color: "bg-sky-100 text-sky-700 border-sky-200",          icon: "🚚" },
  livre:                  { label: "Livré",          color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: "✅" },
  retour:                 { label: "Retour",         color: "bg-orange-100 text-orange-700 border-orange-200", icon: "↩️" },
}

const NEXT_WEB = ["nouveau", "a_confirmer", "en_cours", "prepare", "livre", "annule"]
const NEXT_ERP = ["en_attente", "en_attente_approbation", "valide", "en_preparation", "charge", "en_transit", "livre", "refuse", "retour"]

function getStatutCfg(statut: string, source: "web" | "erp") {
  const dict = source === "web" ? STATUTS_WEB : STATUTS_ERP
  return dict[statut] ?? { label: statut, color: "bg-slate-100 text-slate-600 border-slate-200", icon: "•" }
}

// ── Normalisation des données ─────────────────────────────────────────────────

function normalizeERP(row: { id: string; payload: Record<string, unknown>; updated_at?: string }): CmdUnifiee {
  const p = row.payload ?? {}
  // Détecte une commande issue du site web (payload {nom_client, source:"site_web", id "WEB-..."})
  // vs une commande ERP interne (payload {clientNom, commercialNom, date}).
  const isWeb = String(p.source ?? "").includes("web") || String(row.id).startsWith("WEB-")
  const lignes = (Array.isArray(p.lignes) ? p.lignes : []) as Record<string, unknown>[]
  const computed = lignes.reduce((sum, l) => {
    const q  = Number(l.quantite ?? 1)
    const pu = Number(l.prixVente ?? l.prixUnitaire ?? 0)
    return sum + q * pu
  }, 0)
  const montant = Number(p.montant_total ?? p.montant ?? 0) || Math.round(computed * 100) / 100
  // Catégorie client : type (chr/particulier/marchand) ou secteur
  const rawType = String(p.clientType ?? p.secteur ?? "")
  const cat = rawType.toLowerCase()
  const categorie = cat.includes("chr") ? "CHR"
    : cat.includes("marchand") ? "Marchand"
    : cat.includes("particulier") ? "Particulier"
    : rawType || undefined
  // Heure réelle de prise de commande : dérivée du vrai timestamp ISO (createdAt
  // pour les commandes ERP/mobile récentes, created_at pour les commandes web).
  // Pour les commandes créées AVANT ce champ (pas de createdAt/created_at), on
  // se rabat sur row.updated_at (horodatage de synchro Supabase) — un proxy
  // imparfait mais bien plus juste que d'afficher heurelivraison (préférence de
  // livraison du client) comme s'il s'agissait de l'heure de prise de commande.
  const createdIso = p.createdAt ? String(p.createdAt) : (p.created_at ? String(p.created_at) : (row.updated_at ? String(row.updated_at) : undefined))
  return {
    id:         row.id,
    numero:     String(p.numero ?? row.id),
    date:       String(p.date ?? p.created_at ?? row.updated_at ?? ""),
    createdAtIso: createdIso,
    heureCommande: timeOnly(createdIso),
    nom_client: String(p.clientNom ?? p.nom_client ?? "—"),
    telephone:  String(p.clientTel ?? p.telephone ?? ""),
    adresse:    p.adresse_livraison ? String(p.adresse_livraison) : (p.adresse ? String(p.adresse) : undefined),
    heurelivraison: p.heurelivraison ? String(p.heurelivraison) : (p.creneau ? String(p.creneau) : undefined),
    lignes: lignes.map(l => ({
      nom:      String(l.articleNom ?? l.nom ?? "Article"),
      quantite: Number(l.quantite ?? 1),
      unite:    String(l.unite ?? "kg"),
      prix:     Number(l.prixVente ?? l.prixUnitaire ?? 0),
      total:    Number(l.total ?? Number(l.quantite ?? 1) * Number(l.prixVente ?? l.prixUnitaire ?? 0)),
    })),
    montant,
    statut:     String(p.statut ?? (isWeb ? "nouveau" : "en_attente")),
    source:     isWeb ? "web" : "erp",
    prevendeur: String(p.commercialNom ?? ""),
    zone:       p.zone ? String(p.zone) : (p.creneau ? String(p.creneau) : undefined),
    categorie,
    notes:      p.notes ? String(p.notes) : (p.instructions ? String(p.instructions) : (p.commentaire ? String(p.commentaire) : undefined)),
    table:      "fl_commandes",
    rawPayload: p as Record<string, unknown>,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function canAccess(u: User): boolean {
  return ["super_super_admin","super_admin","admin","resp_commercial","resp_logistique","livreur","prevendeur"].includes(u.role)
}

/** Peut supprimer ou modifier une commande (admin + responsable commercial) */
function canDeleteModify(u: User): boolean {
  return ["super_super_admin","super_admin","admin","resp_commercial"].includes(u.role)
}

// ── Cycle "commande" (même règle que Gestion des PA) : la collecte pour un
// jour J court de J-1 14h00 à J 04h00. Avant 14h, "aujourd'hui" désigne J ;
// à partir de 14h, la collecte de J+1 a déjà commencé.
function commandeOperationalDate(): string {
  const d = new Date()
  if (d.getHours() >= 14) d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
function commandeCycleRange(dateStr: string): { debut: string; fin: string; cutoffLabel: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (!m) return { debut: dateStr, fin: dateStr, cutoffLabel: "" }
  const y = Number(m[1]), mo = Number(m[2]), da = Number(m[3])
  const veille = new Date(y, mo - 1, da - 1)
  const debut = `${veille.getFullYear()}-${String(veille.getMonth() + 1).padStart(2, "0")}-${String(veille.getDate()).padStart(2, "0")}`
  return { debut, fin: dateStr, cutoffLabel: `${veille.toLocaleDateString("fr-MA", { day: "2-digit", month: "2-digit" })} 14h` }
}

// Les commandes ERP stockent une date-only "YYYY-MM-DD" (store.today(), sans
// heure réelle) alors que les commandes web ont un vrai timestamp
// (created_at). Afficher une heure pour une date-only revient à formater
// minuit UTC en heure locale Maroc → toujours "01:00" affiché, quelle que
// soit l'heure réelle de la commande (bug signalé : "j'ai toujours 01:00").
// On n'affiche l'heure QUE si la valeur porte un vrai composant horaire.
function fmt(iso: string) {
  if (!iso) return "—"
  const hasTime = iso.includes("T") && iso.length > 10
  try {
    return new Date(iso).toLocaleString("fr-MA", hasTime
      ? { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }
      : { day: "2-digit", month: "2-digit", year: "2-digit" })
  } catch { return iso }
}

// Extrait l'heure (HH:MM) d'un vrai timestamp ISO — undefined si la valeur
// est date-only (pas de "T"), pour ne jamais afficher une heure fabriquée.
function timeOnly(iso?: string): string | undefined {
  if (!iso || !iso.includes("T") || iso.length <= 10) return undefined
  try {
    return new Date(iso).toLocaleTimeString("fr-MA", { hour: "2-digit", minute: "2-digit" })
  } catch { return undefined }
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function BOCommandesUnifiees({ user }: Props) {
  const [cmds, setCmds]                   = useState<CmdUnifiee[]>([])
  const [loading, setLoading]             = useState(true)
  const [search, setSearch]               = useState("")
  const [filterStatut, setFilterStatut]   = useState("tous")
  const [flowStage, setFlowStage]         = useState<"tous" | "recues" | "preparation" | "assignees" | "livrees">("tous")
  const [filterSource, setFilterSource]   = useState("tous")
  const [filterZone, setFilterZone]       = useState("tous")
  const [filterCategorie, setFilterCategorie] = useState("tous")
  const [sortMode, setSortMode] = useState<"date" | "alpha">("date")
  // Vue par défaut = cycle commande en cours (J-1 14h → J 4h) — pas l'historique complet.
  const [filterDateDebut, setFilterDateDebut] = useState(() => commandeCycleRange(commandeOperationalDate()).debut)
  const [filterDateFin, setFilterDateFin]     = useState(() => commandeCycleRange(commandeOperationalDate()).fin)
  const [selected, setSelected]           = useState<CmdUnifiee | null>(null)
  const [updating, setUpdating]           = useState(false)
  // Sélection multiple — clé "table-id" pour distinguer fl_commandes / fl_commandes_web
  const [selectedIds, setSelectedIds]     = useState<Set<string>>(new Set())
  const [bulkNewStatut, setBulkNewStatut] = useState("")
  const [bulkBusy, setBulkBusy]           = useState(false)
  const [msg, setMsg]                     = useState<{ ok: boolean; text: string } | null>(null)
  // ── Création manuelle d'une commande (BO) ──────────────────────────────────
  const [showNew, setShowNew]             = useState(false)
  const [savingOrder, setSavingOrder]     = useState(false)
  const [noClientId, setNoClientId]       = useState("")
  const [noHeure, setNoHeure]             = useState("08:00")
  const [noLignes, setNoLignes]           = useState<{ articleId: string; quantite: string; prixVente: string }[]>([{ articleId: "", quantite: "", prixVente: "" }])

  const saveNewOrder = async () => {
    if (savingOrder) return // anti double-clic — jamais deux commandes identiques
    const client = store.getClients().find(c => c.id === noClientId)
    if (!client) { setMsg({ ok: false, text: "Choisissez un client." }); return }
    const articles = store.getArticles()
    // Convertit chiffres arabes-indiens (٠-٩) et persans (۰-۹) en ASCII avant
    // parseFloat — Number()/parseFloat() renvoient NaN sur ces glyphes, ce qui
    // fait échouer silencieusement la validation "quantite > 0" pour tout
    // utilisateur avec un clavier/locale arabe (message trompeur "Ajoutez au
    // moins une ligne valide." alors qu'une quantité est bien saisie à l'écran).
    const toNum = (s: string) => {
      const ascii = String(s).replace(/[٠-٩۰-۹]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d) >= 0 ? "٠١٢٣٤٥٦٧٨٩".indexOf(d) : "۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
      return Number(ascii.replace(",", ".").trim())
    }
    const lignes: LigneCommande[] = noLignes
      .filter(l => l.articleId && toNum(l.quantite) > 0)
      .map(l => {
        const art = articles.find(a => a.id === l.articleId)!
        const pv = toNum(l.prixVente) || store.computePrixEffectif(art, client)
        const q = toNum(l.quantite) || 0
        return { articleId: art.id, articleNom: art.nom, unite: art.unite, quantite: q, prixUnitaire: pv, prixVente: pv, total: q * pv }
      })
    if (lignes.length === 0) { setMsg({ ok: false, text: "Ajoutez au moins une ligne valide." }); return }
    const cmd: Commande = {
      id: store.genCommande(), date: store.today(), createdAt: new Date().toISOString(),
      createdVia: "backoffice",
      commercialId: user.id, commercialNom: user.name + " (BO)",
      clientId: client.id, clientNom: client.nom,
      secteur: client.secteur, zone: client.zone, gpsLat: client.gpsLat ?? 0, gpsLng: client.gpsLng ?? 0,
      lignes, heurelivraison: noHeure, statut: "valide",
      emailDestinataire: store.getEmailConfig().commercial,
    }
    setSavingOrder(true)
    store.addCommande(cmd)
    try { const db = await import("@/lib/supabase/db"); await db.upsertCommande(cmd) } catch { /* offline */ }
    setShowNew(false); setNoClientId(""); setNoLignes([{ articleId: "", quantite: "", prixVente: "" }])
    setMsg({ ok: true, text: `✅ Commande ${cmd.id} créée (${client.nom}).` })
    setSavingOrder(false)
    load()
  }

  // ── Chargement ──────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      // ⚡ Lecture via l'API service_role (/api/sync-read) — le client Supabase ANON
      // est bloqué par la RLS sur fl_commandes (renvoie [] alors que les données existent).
      // Toutes les commandes (web ET ERP) sont stockées dans fl_commandes {id, payload}.
      const res  = await fetch("/api/sync-read?table=fl_commandes", { cache: "no-store" })
      const json = await res.json()
      const rows: { id: string; payload: Record<string, unknown>; updated_at?: string }[] = json?.ok ? (json.data ?? []) : []
      const orders: CmdUnifiee[] = rows
        .filter(r => r.payload && !String(r.id).startsWith("__"))
        .map(r => normalizeERP(r))
      orders.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
      // Isolation par équipe : ces commandes viennent directement de Supabase
      // (contourne store.getCommandes()) et n'ont pas de clientId direct, donc
      // on recoupe par téléphone avec l'ensemble des clients visibles.
      const normTel = (t: string | undefined) => String(t ?? "").replace(/\D/g, "")
      const visibleTels = new Set(store.getVisibleClients().map(c => normTel(c.telephone)).filter(Boolean))
      setCmds(orders.filter(o => !normTel(o.telephone) || visibleTels.has(normTel(o.telephone))))
    } catch (e) {
      console.error("[BOCommandesUnifiees]", e)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [load])

  // ── Mise à jour statut ───────────────────────────────────────────────────────
  const updateStatut = async (cmd: CmdUnifiee, newStatut: string) => {
    setUpdating(true)
    try {
      // Mise à jour du statut dans le payload JSONB via l'API service_role (bypass RLS)
      const mergedPayload = {
        ...(cmd.rawPayload ?? {}),
        statut:     newStatut,
        traite_par: user.name,
        traite_at:  new Date().toISOString(),
      }
      const res = await fetch("/api/sync-write", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table:   "fl_commandes",
          upserts: [{ id: cmd.id, payload: mergedPayload, updated_at: new Date().toISOString() }],
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error((json.errors || []).join(", "))
      setMsg({ ok: true, text: `✅ Statut mis à jour → ${getStatutCfg(newStatut, cmd.source).label}` })
      setSelected(prev => prev ? { ...prev, statut: newStatut } : null)
      // Refresh local state immédiatement
      setCmds(prev => prev.map(c =>
        c.id === cmd.id && c.table === cmd.table ? { ...c, statut: newStatut, rawPayload: mergedPayload } : c
      ))
    } catch {
      setMsg({ ok: false, text: "❌ Erreur lors de la mise à jour." })
    }
    setUpdating(false)
    setTimeout(() => setMsg(null), 3500)
  }

  // ── Supprimer une commande ───────────────────────────────────────────────────
  const deleteCommande = async (cmd: CmdUnifiee) => {
    if (!confirm(`⚠️ Supprimer définitivement la commande ${cmd.numero} de ${cmd.nom_client} ?\n\nCette action est irréversible.`)) return
    try {
      // Commande ERP locale → retirer aussi du store localStorage
      if (cmd.source === "erp") {
        // Répercute sur les PO Achat ouverts AVANT de retirer la commande —
        // CmdUnifiee.lignes n'a pas d'articleId (utilisé pour le rapprochement
        // PO), on relit donc l'objet Commande complet depuis le store local.
        const realCmd = store.getCommandes().find(c => c.id === cmd.id)
        if (realCmd) store.cascadePOAfterCommandeDelete(realCmd)
        store.saveCommandes(store.getCommandes().filter(c => c.id !== cmd.id))
      }
      // Suppression Supabase via l'API service_role — DANS LA BONNE TABLE.
      // Une commande web vit dans fl_commandes_web ; la supprimer de fl_commandes
      // la laissait en base → elle « revenait » au prochain fetch. On cible cmd.table.
      const res = await fetch("/api/sync-write", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: cmd.table, deletes: [cmd.id] }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error((json.errors || []).join(", "))
      setCmds(prev => prev.filter(c => !(c.id === cmd.id && c.table === cmd.table)))
      setSelected(null)
      setMsg({ ok: true, text: `✅ Commande ${cmd.numero} supprimée.` })
    } catch {
      setMsg({ ok: false, text: "❌ Erreur lors de la suppression." })
    }
    setTimeout(() => setMsg(null), 4000)
  }

  // ── Sélection multiple ───────────────────────────────────────────────────────
  const rowKey = (cmd: CmdUnifiee) => `${cmd.table}-${cmd.id}`
  const toggleSelect = (cmd: CmdUnifiee) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      const k = rowKey(cmd)
      if (next.has(k)) next.delete(k); else next.add(k)
      return next
    })
  }
  const bulkUpdateStatut = async (newStatut: string) => {
    if (bulkBusy || !newStatut || selectedCmds.length === 0) return // anti double-clic
    setBulkBusy(true)
    try {
      // Grouper par table — sync-write cible une seule table par appel
      const byTable = new Map<string, CmdUnifiee[]>()
      selectedCmds.forEach(c => byTable.set(c.table, [...(byTable.get(c.table) ?? []), c]))
      for (const [table, cmdsInTable] of byTable) {
        const upserts = cmdsInTable.map(c => ({
          id: c.id,
          payload: { ...(c.rawPayload ?? {}), statut: newStatut, traite_par: user.name, traite_at: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        }))
        const res = await fetch("/api/sync-write", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ table, upserts }),
        })
        const json = await res.json()
        if (!json.ok) throw new Error((json.errors || []).join(", "))
      }
      const changedKeys = new Set(selectedCmds.map(rowKey))
      setCmds(prev => prev.map(c => changedKeys.has(rowKey(c)) ? { ...c, statut: newStatut } : c))
      setMsg({ ok: true, text: `✅ ${selectedCmds.length} commande(s) → ${getStatutCfg(newStatut, selectedCmds[0].source).label}` })
      setSelectedIds(new Set())
      setBulkNewStatut("")
    } catch {
      setMsg({ ok: false, text: "❌ Erreur lors de la mise à jour groupée." })
    }
    setBulkBusy(false)
    setTimeout(() => setMsg(null), 4000)
  }

  const bulkDelete = async () => {
    if (bulkBusy || selectedCmds.length === 0) return // anti double-clic
    if (!confirm(`⚠️ Supprimer définitivement ${selectedCmds.length} commande(s) sélectionnée(s) ?\n\nCette action est irréversible.`)) return
    setBulkBusy(true)
    try {
      const byTable = new Map<string, CmdUnifiee[]>()
      selectedCmds.forEach(c => byTable.set(c.table, [...(byTable.get(c.table) ?? []), c]))
      const erpIds = selectedCmds.filter(c => c.source === "erp").map(c => c.id)
      if (erpIds.length) {
        const localCommandes = store.getCommandes()
        erpIds.forEach(id => {
          const realCmd = localCommandes.find(c => c.id === id)
          if (realCmd) store.cascadePOAfterCommandeDelete(realCmd)
        })
        store.saveCommandes(store.getCommandes().filter(c => !erpIds.includes(c.id)))
      }
      for (const [table, cmdsInTable] of byTable) {
        const res = await fetch("/api/sync-write", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ table, deletes: cmdsInTable.map(c => c.id) }),
        })
        const json = await res.json()
        if (!json.ok) throw new Error((json.errors || []).join(", "))
      }
      const changedKeys = new Set(selectedCmds.map(rowKey))
      setCmds(prev => prev.filter(c => !changedKeys.has(rowKey(c))))
      setMsg({ ok: true, text: `✅ ${selectedCmds.length} commande(s) supprimée(s).` })
      setSelectedIds(new Set())
      setSelected(null)
    } catch {
      setMsg({ ok: false, text: "❌ Erreur lors de la suppression groupée." })
    }
    setBulkBusy(false)
    setTimeout(() => setMsg(null), 4000)
  }

  // ── Injecter commande web dans pipeline logistique ERP ──────────────────────
  const injecterDansERP = async (cmd: CmdUnifiee) => {
    if (cmd.source !== "web") return
    if (!confirm(`Injecter la commande ${cmd.numero} de ${cmd.nom_client} dans la logistique ERP ?\n\nElle apparaîtra dans Préparation, Dispatch et Stock.`)) return

    // Trouver ou créer un client par nom/téléphone
    const clients = store.getClients()
    let client = clients.find(c =>
      c.telephone === cmd.telephone || c.nom.toLowerCase() === cmd.nom_client.toLowerCase()
    )
    if (!client) {
      client = {
        id:           store.genId(),
        nom:          cmd.nom_client,
        secteur:      "Site Web",
        zone:         cmd.zone ?? "Casablanca",
        // Valeurs valides des unions Client (cf. ClientType / taille / typeProduits / rotation)
        type:         "autre",
        taille:       "50-100kg",
        typeProduits: "moyenne",
        rotation:     "moins",
        telephone:    cmd.telephone ?? "",
        email:        "",
        adresse:      cmd.adresse ?? "",
        createdBy:    user.id,
        createdAt:    new Date().toISOString(),
      }
      store.saveClients([...clients, client])
    }

    // Convertir les lignes
    const lignes: LigneCommande[] = cmd.lignes.map(l => {
      // LigneCmd web = { nom, quantite, unite, prix, total }. On lit aussi des
      // champs éventuels (articleId/prixUnitaire) via un cast unknown défensif.
      const lr = l as unknown as Record<string, unknown>
      const prix = l.prix ?? (Number(lr.prixUnitaire) || 0)
      return {
        articleId:    (typeof lr.articleId === "string" ? lr.articleId : "") || store.genId(),
        articleNom:   l.nom ?? "Article",
        unite:        l.unite ?? "kg",
        quantite:     l.quantite,
        prixUnitaire: prix,
        prixVente:    prix,
        total:        l.total ?? prix * l.quantite,
      }
    })

    // Créer la commande ERP pour la logistique.
    // ⚠️ On RÉUTILISE cmd.id (et non store.genId()) : sinon la commande web
    // restait + une nouvelle commande ERP était créée → DOUBLON, et la copie
    // (id non-WEB) était comptée comme commande terrain. Avec le même id, la
    // ligne logistique remplace l'enregistrement web (un seul), et l'id
    // "WEB-…" la garde classée « web » (jamais terrain).
    const newCmd: Commande = {
      id:               cmd.id,
      date:             cmd.date ? cmd.date.split("T")[0] : new Date().toISOString().split("T")[0],
      commercialId:     "site_web",
      commercialNom:    "Site Web",
      clientId:         client.id,
      clientNom:        client.nom,
      secteur:          client.secteur ?? "Site Web",
      zone:             cmd.zone ?? client.zone ?? "Casablanca",
      gpsLat:           0,
      gpsLng:           0,
      lignes,
      heurelivraison:   cmd.zone ?? "Standard 24h",
      statut:           "en_attente",
      emailDestinataire:"",
      notes:            `[Web] Réf: ${cmd.numero}${cmd.notes ? " — " + cmd.notes : ""}`,
    }

    // Upsert localStorage par id (jamais deux fois la même commande)
    const existingCmds = store.getCommandes()
    const idx = existingCmds.findIndex(c => c.id === newCmd.id)
    if (idx >= 0) existingCmds[idx] = newCmd; else existingCmds.push(newCmd)
    store.saveCommandes(existingCmds)

    // Un seul enregistrement fl_commandes (même id) : on conserve l'origine
    // web + on marque l'injection, statut "confirmee" côté web (= remis à la
    // logistique). injectedToErp évite tout retraitement.
    await fetch("/api/sync-write", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table:   "fl_commandes",
        upserts: [{ id: cmd.id, payload: { ...(cmd.rawPayload ?? {}), statut: "confirmee", injectedToErp: true, source: "site_web" }, updated_at: new Date().toISOString() }],
      }),
    })

    setMsg({ ok: true, text: `✅ ${cmd.numero} injectée dans la logistique ERP (Préparation / Dispatch / Stock).` })
    setTimeout(() => setMsg(null), 5000)
    load()
  }

  // ── Accès ────────────────────────────────────────────────────────────────────
  if (!canAccess(user)) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center text-2xl">🔒</div>
        <p className="text-base font-semibold text-slate-700">Accès restreint</p>
      </div>
    )
  }

  // ── Listes dynamiques pour filtres ───────────────────────────────────────────
  const zones = [...new Set(cmds.map(c => c.zone).filter(Boolean))] as string[]
  const categories = [...new Set(cmds.map(c => c.categorie).filter(Boolean))] as string[]

  // ── Flux logistique : Reçues -> En préparation -> Assignées -> Livrées ──────
  const FLOW_STAGES: Record<string, string[]> = {
    recues:       ["en_attente", "en_attente_approbation", "valide", "nouveau", "a_confirmer"],
    preparation:  ["en_preparation", "prepare"],
    assignees:    ["charge", "en_transit", "en_cours"],
    livrees:      ["livre"],
  }

  // ── Filtrage ─────────────────────────────────────────────────────────────────
  const cycleDefault = commandeCycleRange(commandeOperationalDate())
  const isDefaultDateRange = filterDateDebut === cycleDefault.debut && filterDateFin === cycleDefault.fin
  const filtered = cmds.filter(c => {
    if (flowStage !== "tous" && !FLOW_STAGES[flowStage]?.includes(c.statut)) return false
    // Vue par défaut (aucun flux ni statut explicitement demandé) : cache les
    // commandes déjà livrées — onglet "✅ Livrées" ou filtre Statut pour les revoir.
    if (flowStage === "tous" && filterStatut === "tous" && c.statut === "livre") return false
    if (filterSource !== "tous" && c.source !== filterSource) return false
    if (filterStatut !== "tous" && c.statut !== filterStatut) return false
    if (filterZone !== "tous" && c.zone !== filterZone) return false
    if (filterCategorie !== "tous" && c.categorie !== filterCategorie) return false
    if (filterDateDebut && c.date.slice(0, 10) < filterDateDebut) return false
    if (filterDateFin && c.date.slice(0, 10) > filterDateFin) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return (
        c.nom_client.toLowerCase().includes(q) ||
        c.telephone.includes(q) ||
        c.numero.toLowerCase().includes(q) ||
        c.prevendeur.toLowerCase().includes(q) ||
        (c.zone ?? "").toLowerCase().includes(q)
      )
    }
    return true
  }).sort((a, b) => sortMode === "alpha"
    ? a.nom_client.localeCompare(b.nom_client, "fr")
    // Tri chronologique décroissant (plus récent d'abord) — utilise le vrai
    // timestamp (createdAtIso) plutôt que `date` seule (date-only pour les
    // commandes ERP), sinon les commandes du même jour restent dans un ordre
    // arbitraire au lieu d'être classées par heure réelle de prise.
    : new Date(b.createdAtIso || b.date || 0).getTime() - new Date(a.createdAtIso || a.date || 0).getTime())

  const allFilteredSelected = filtered.length > 0 && filtered.every(c => selectedIds.has(rowKey(c)))
  const toggleSelectAll = () => {
    setSelectedIds(allFilteredSelected ? new Set() : new Set(filtered.map(rowKey)))
  }
  const selectedCmds = filtered.filter(c => selectedIds.has(rowKey(c)))

  // ── Compteurs ─────────────────────────────────────────────────────────────────
  const webCount  = cmds.filter(c => c.source === "web").length
  const erpCount  = cmds.filter(c => c.source === "erp").length
  const newCount  = cmds.filter(c => ["nouveau","en_attente"].includes(c.statut)).length
  const totalCA   = filtered.reduce((s, c) => s + c.montant, 0)

  // ── Alerte cycle commande : nb livrées depuis le début du cycle en cours ──
  const cycleAlerte = (() => {
    const { debut, fin, cutoffLabel } = commandeCycleRange(commandeOperationalDate())
    const livrees = cmds.filter(c => c.statut === "livre" && c.date.slice(0, 10) >= debut && c.date.slice(0, 10) <= fin).length
    return { livrees, cutoffLabel }
  })()

  // ── Export modèle : commandes par CLIENT × ARTICLE × QUANTITÉ ─────────────────
  // Respecte les filtres actifs (statut, source, zone, période, recherche...) —
  // une ligne par combinaison client/article, quantités et montants cumulés sur
  // toutes les commandes filtrées.
  const exportParClientArticle = async () => {
    if (filtered.length === 0) return
    const XLSX = await import("xlsx")
    const agg = new Map<string, { client: string; telephone: string; article: string; unite: string; quantite: number; montant: number; nbCommandes: Set<string> }>()
    filtered.forEach(c => {
      c.lignes.forEach(l => {
        const key = `${c.nom_client}|||${l.nom}`
        const prev = agg.get(key) ?? { client: c.nom_client, telephone: c.telephone, article: l.nom, unite: l.unite || "kg", quantite: 0, montant: 0, nbCommandes: new Set<string>() }
        prev.quantite += Number(l.quantite) || 0
        prev.montant += Number(l.total) || 0
        prev.nbCommandes.add(c.numero)
        agg.set(key, prev)
      })
    })
    const rows = [...agg.values()]
      .sort((a, b) => a.client.localeCompare(b.client, "fr") || a.article.localeCompare(b.article, "fr"))
      .map(r => ({
        Client: r.client, Telephone: r.telephone, Article: r.article, Unite: r.unite,
        Quantite: Math.round(r.quantite * 100) / 100, "Nb commandes": r.nbCommandes.size,
        "Montant (DH)": Math.round(r.montant * 100) / 100,
      }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Commandes par client")
    const periode = filterDateDebut || filterDateFin ? `_${filterDateDebut || "debut"}_${filterDateFin || "fin"}` : `_${new Date().toISOString().slice(0, 10)}`
    XLSX.writeFile(wb, `commandes_client_article${periode}.xlsx`)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 space-y-4 max-w-7xl mx-auto">

      {/* ── En-tête ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">📦 Toutes les Commandes</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Vue unifiée — Prévendeurs terrain <span className="text-amber-600 font-semibold">({erpCount} ERP)</span> +
            Site web <span className="text-blue-600 font-semibold">({webCount} Web)</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Nouvelle commande
          </button>
          <button
            onClick={exportParClientArticle}
            disabled={filtered.length === 0}
            title="Exporte les commandes filtrées, une ligne par client × article, avec quantité et montant cumulés"
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H8a2 2 0 01-2-2V5a2 2 0 012-2h6l6 6v11a2 2 0 01-2 2z" />
            </svg>
            Exporter (client &amp; article)
          </button>
          <button
            onClick={load}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Actualiser
          </button>
        </div>
      </div>

      {/* ── Alerte cycle commande ── */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm px-4 py-2.5 flex items-center gap-2">
        <span>✅</span>
        <span><strong>{cycleAlerte.livrees}</strong> commande(s) livrée(s) depuis {cycleAlerte.cutoffLabel} (cycle commande J-1 14h → J 4h).</span>
      </div>

      {/* ── Flux logistique : Reçues -> En préparation -> Assignées -> Livrées ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {([
          { stage: "recues" as const,      label: "📥 Reçues",         active: "bg-slate-600 border-slate-600" },
          { stage: "preparation" as const, label: "📦 En préparation", active: "bg-violet-600 border-violet-600" },
          { stage: "assignees" as const,   label: "🚚 Assignées",      active: "bg-sky-600 border-sky-600" },
          { stage: "livrees" as const,     label: "✅ Livrées",        active: "bg-emerald-600 border-emerald-600" },
        ]).map(({ stage, label, active: activeClass }) => {
          const count = cmds.filter(c => FLOW_STAGES[stage]?.includes(c.statut)).length
          const active = flowStage === stage
          return (
            <button key={stage} onClick={() => setFlowStage(active ? "tous" : stage)}
              className={`flex flex-col items-start gap-0.5 px-4 py-3 rounded-2xl border transition-colors text-left ${
                active ? `${activeClass} text-white` : "bg-white border-slate-200 hover:bg-slate-50"}`}>
              <span className={`text-xs font-semibold ${active ? "text-white/90" : "text-slate-500"}`}>{label}</span>
              <span className={`text-2xl font-black ${active ? "text-white" : "text-slate-800"}`}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* ── Modal : nouvelle commande (création manuelle) ── */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={e => e.target === e.currentTarget && setShowNew(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h3 className="font-bold text-slate-800">Nouvelle commande</h3>
              <button onClick={() => setShowNew(false)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
            </div>
            <div className="p-5 flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-600">Client *</label>
                  <select value={noClientId} onChange={e => setNoClientId(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-slate-200 text-sm">
                    <option value="">— Choisir —</option>
                    {store.getClients().slice().sort((a, b) => a.nom.localeCompare(b.nom)).map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-600">Heure de livraison</label>
                  <input type="time" value={noHeure} onChange={e => setNoHeure(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-600">Articles</label>
                {noLignes.map((l, i) => {
                  const art = store.getArticles().find(a => a.id === l.articleId)
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <select value={l.articleId}
                        onChange={e => setNoLignes(prev => prev.map((x, j) => j === i ? { ...x, articleId: e.target.value, prixVente: e.target.value ? String(store.computePrixEffectif(store.getArticles().find(a => a.id === e.target.value)!, store.getClients().find(c => c.id === noClientId))) : "" } : x))}
                        className="flex-1 px-2 py-2 rounded-lg border border-slate-200 text-sm">
                        <option value="">— Article —</option>
                        {store.getArticles().slice().sort((a, b) => a.nom.localeCompare(b.nom)).map(a => <option key={a.id} value={a.id}>{a.nom}{a.nomAr ? ` / ${a.nomAr}` : ""}</option>)}
                      </select>
                      <input type="text" inputMode="decimal" placeholder="Qté" value={l.quantite}
                        onChange={e => setNoLignes(prev => prev.map((x, j) => j === i ? { ...x, quantite: e.target.value.replace(",", ".") } : x))}
                        className="w-20 px-2 py-2 rounded-lg border border-slate-200 text-sm text-center" />
                      <input type="text" inputMode="decimal" placeholder="PV" value={l.prixVente}
                        onChange={e => setNoLignes(prev => prev.map((x, j) => j === i ? { ...x, prixVente: e.target.value.replace(",", ".") } : x))}
                        className="w-20 px-2 py-2 rounded-lg border border-slate-200 text-sm text-center" />
                      <span className="w-8 text-[10px] text-slate-400">{art?.unite}</span>
                      {noLignes.length > 1 && <button onClick={() => setNoLignes(prev => prev.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600">✕</button>}
                    </div>
                  )
                })}
                <button onClick={() => setNoLignes(prev => [...prev, { articleId: "", quantite: "", prixVente: "" }])}
                  className="self-start text-sm font-semibold text-emerald-600">+ Ajouter un article</button>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowNew(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600">Annuler</button>
                <button onClick={saveNewOrder} disabled={savingOrder}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50">
                  {savingOrder ? "Création..." : "Créer la commande"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Alerte nouvelles commandes ── */}
      {newCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200">
          <span className="text-xl">🔔</span>
          <p className="text-sm font-semibold text-blue-700">
            {newCount} commande{newCount > 1 ? "s" : ""} en attente de traitement
          </p>
        </div>
      )}

      {/* ── Message feedback ── */}
      {msg && (
        <div className={`px-4 py-3 rounded-xl text-sm font-medium border ${
          msg.ok
            ? "bg-green-50 text-green-700 border-green-200"
            : "bg-red-50 text-red-700 border-red-200"
        }`}>
          {msg.text}
        </div>
      )}

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-border p-4 text-center">
          <div className="text-2xl font-black text-slate-800">{cmds.length}</div>
          <div className="text-xs font-semibold text-slate-400 mt-1 uppercase">Total</div>
        </div>
        <div className="bg-blue-50 rounded-xl border border-blue-100 p-4 text-center">
          <div className="text-2xl font-black text-blue-700">{webCount}</div>
          <div className="text-xs font-semibold text-blue-400 mt-1 uppercase">🌐 Web</div>
        </div>
        <div className="bg-amber-50 rounded-xl border border-amber-100 p-4 text-center">
          <div className="text-2xl font-black text-amber-700">{erpCount}</div>
          <div className="text-xs font-semibold text-amber-400 mt-1 uppercase">📱 Terrain</div>
        </div>
        <div className="bg-green-50 rounded-xl border border-green-100 p-4 text-center">
          <div className="text-lg font-black text-green-700 leading-tight">
            {totalCA.toLocaleString("fr-MA", { maximumFractionDigits: 0 })} MAD
          </div>
          <div className="text-xs font-semibold text-green-400 mt-1 uppercase">CA filtré</div>
        </div>
      </div>

      {/* ── Filtres ── */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Source */}
        <select
          value={filterSource}
          onChange={e => setFilterSource(e.target.value)}
          className="px-3 py-2 rounded-xl border border-border text-sm font-medium bg-white text-slate-700 cursor-pointer"
        >
          <option value="tous">📋 Toutes sources</option>
          <option value="web">🌐 Web</option>
          <option value="erp">📱 Terrain</option>
        </select>

        {/* Statut */}
        <select
          value={filterStatut}
          onChange={e => setFilterStatut(e.target.value)}
          className="px-3 py-2 rounded-xl border border-border text-sm font-medium bg-white text-slate-700 cursor-pointer"
        >
          <option value="tous">Tous statuts</option>
          <optgroup label="— Web">
            {NEXT_WEB.map(s => (
              <option key={s} value={s}>{STATUTS_WEB[s]?.icon} {STATUTS_WEB[s]?.label}</option>
            ))}
          </optgroup>
          <optgroup label="— Terrain">
            {NEXT_ERP.map(s => (
              <option key={s} value={s}>{STATUTS_ERP[s]?.icon} {STATUTS_ERP[s]?.label}</option>
            ))}
          </optgroup>
        </select>

        {/* Zone */}
        {zones.length > 0 && (
          <select
            value={filterZone}
            onChange={e => setFilterZone(e.target.value)}
            className="px-3 py-2 rounded-xl border border-border text-sm font-medium bg-white text-slate-700 cursor-pointer"
          >
            <option value="tous">🗺️ Toutes zones</option>
            {zones.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
        )}

        {/* Catégorie : CHR / Particulier / Marchand */}
        <select
          value={filterCategorie}
          onChange={e => setFilterCategorie(e.target.value)}
          className="px-3 py-2 rounded-xl border border-border text-sm font-medium bg-white text-slate-700 cursor-pointer"
        >
          <option value="tous">🏷️ Toutes catégories</option>
          <option value="CHR">🍽️ CHR</option>
          <option value="Particulier">🏠 Particulier</option>
          <option value="Marchand">🏪 Marchand</option>
          {categories.filter(c => !["CHR","Particulier","Marchand"].includes(c)).map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* Plage de dates */}
        <input
          type="date"
          value={filterDateDebut}
          onChange={e => setFilterDateDebut(e.target.value)}
          title="Du"
          className="px-3 py-2 rounded-xl border border-border text-sm bg-white text-slate-700"
        />
        <input
          type="date"
          value={filterDateFin}
          onChange={e => setFilterDateFin(e.target.value)}
          title="Au"
          className="px-3 py-2 rounded-xl border border-border text-sm bg-white text-slate-700"
        />
        <button type="button" onClick={() => { const { debut, fin } = commandeCycleRange(commandeOperationalDate()); setFilterDateDebut(debut); setFilterDateFin(fin) }}
          title="Commandes du cycle J-1 14h → J 4h"
          className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 whitespace-nowrap">
          🌙 Cycle commande
        </button>

        {/* Recherche libre */}
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Client, tél, réf, zone..."
          className="flex-1 min-w-44 px-3 py-2 rounded-xl border border-border text-sm bg-white text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-green-500"
        />

        {/* Tri */}
        <div className="flex gap-1 p-1 rounded-xl bg-slate-100">
          <button type="button" onClick={() => setSortMode("date")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${sortMode === "date" ? "bg-white shadow-sm text-slate-800" : "text-slate-500"}`}>
            Plus récent
          </button>
          <button type="button" onClick={() => setSortMode("alpha")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${sortMode === "alpha" ? "bg-white shadow-sm text-slate-800" : "text-slate-500"}`}>
            A → Z
          </button>
        </div>

        {(search || filterStatut !== "tous" || filterSource !== "tous" || filterZone !== "tous" || filterCategorie !== "tous" || !isDefaultDateRange) && (
          <button
            onClick={() => { setSearch(""); setFilterStatut("tous"); setFilterSource("tous"); setFilterZone("tous"); setFilterCategorie("tous"); setFilterDateDebut(cycleDefault.debut); setFilterDateFin(cycleDefault.fin) }}
            className="px-3 py-2 rounded-xl border border-border text-sm text-slate-500 hover:bg-slate-50"
          >
            ✕ Reset
          </button>
        )}

        <span className="text-xs text-slate-400 ml-auto">{filtered.length} résultat{filtered.length > 1 ? "s" : ""}</span>
      </div>

      {/* ── Barre d'actions groupées ── */}
      {filtered.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap px-4 py-2.5 rounded-xl border border-border bg-slate-50">
          <button onClick={toggleSelectAll}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-border bg-white hover:bg-slate-100">
            {allFilteredSelected ? "☑ Tout désélectionner" : "☐ Tout sélectionner"}
          </button>
          {selectedIds.size > 0 && (
            <>
              <span className="text-xs font-bold text-slate-600">{selectedIds.size} sélectionnée(s)</span>
              <div className="flex items-center gap-1.5 ml-2">
                <select value={bulkNewStatut} onChange={e => setBulkNewStatut(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-border text-xs bg-white">
                  <option value="">— Changer le statut —</option>
                  {NEXT_ERP.map(s => <option key={s} value={s}>{STATUTS_ERP[s]?.label ?? s}</option>)}
                </select>
                <button onClick={() => bulkUpdateStatut(bulkNewStatut)} disabled={bulkBusy || !bulkNewStatut}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40">
                  {bulkBusy ? "…" : "Appliquer"}
                </button>
              </div>
              <button onClick={bulkDelete} disabled={bulkBusy}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 ml-1">
                {bulkBusy ? "…" : `🗑 Supprimer (${selectedIds.size})`}
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Table ── */}
      {loading ? (
        <div className="py-16 text-center text-slate-400 text-sm">⏳ Chargement des commandes...</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-slate-400 text-sm">Aucune commande trouvée.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-white">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <th className="px-4 py-3 w-8">
                  <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll}
                    className="w-4 h-4 rounded accent-primary cursor-pointer" />
                </th>
                <th className="text-left px-4 py-3 font-semibold">Réf.</th>
                <th className="text-left px-4 py-3 font-semibold">Date</th>
                <th className="text-left px-4 py-3 font-semibold">Client</th>
                <th className="text-left px-4 py-3 font-semibold">Articles</th>
                <th className="text-right px-4 py-3 font-semibold">Total</th>
                <th className="text-left px-4 py-3 font-semibold">Source</th>
                <th className="text-left px-4 py-3 font-semibold">Statut</th>
                <th className="text-left px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((cmd, i) => {
                const sc        = getStatutCfg(cmd.statut, cmd.source)
                const nextStats = cmd.source === "web" ? NEXT_WEB : NEXT_ERP
                const tel       = cmd.telephone.replace(/\D/g, "")
                const articlesLabel = cmd.lignes.length > 0
                  ? cmd.lignes.slice(0, 2).map(l => `${l.nom} ×${l.quantite}`).join(", ")
                    + (cmd.lignes.length > 2 ? ` +${cmd.lignes.length - 2}` : "")
                  : "—"

                return (
                  <tr
                    key={`${cmd.table}-${cmd.id}`}
                    className={`border-b border-border hover:bg-slate-50 cursor-pointer transition-colors ${i % 2 === 0 ? "" : "bg-slate-50/40"}`}
                    onClick={() => setSelected(cmd)}
                  >
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.has(rowKey(cmd))} onChange={() => toggleSelect(cmd)}
                        className="w-4 h-4 rounded accent-primary cursor-pointer" />
                    </td>
                    {/* Réf */}
                    <td className="px-4 py-3 font-mono text-xs font-bold text-green-700 whitespace-nowrap">
                      {cmd.numero.slice(0, 16)}
                    </td>
                    {/* Date + heure de prise de commande (📝, vrai timestamp createdAt) +
                        heure de livraison souhaitée (🕐, préférence client — pas la même chose) */}
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                      <div>{fmt(cmd.date)}{cmd.heureCommande ? ` · 📝 ${cmd.heureCommande}` : ""}</div>
                      {cmd.heurelivraison && <div className="text-[11px] text-slate-400">🕐 {cmd.heurelivraison}</div>}
                    </td>
                    {/* Client */}
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800 text-sm">{cmd.nom_client}</div>
                      {tel && (
                        <a
                          href={`https://wa.me/${tel}`} target="_blank"
                          onClick={e => e.stopPropagation()}
                          className="text-xs text-green-600 hover:underline"
                        >
                          📲 {cmd.telephone}
                        </a>
                      )}
                      <div className="flex gap-1 mt-0.5 flex-wrap">
                        {cmd.zone && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">
                            🗺️ {cmd.zone}
                          </span>
                        )}
                        {cmd.categorie && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                            cmd.categorie === "CHR" ? "bg-purple-100 text-purple-700"
                            : cmd.categorie === "Marchand" ? "bg-amber-100 text-amber-700"
                            : cmd.categorie === "Particulier" ? "bg-blue-100 text-blue-700"
                            : "bg-slate-100 text-slate-600"
                          }`}>
                            {cmd.categorie}
                          </span>
                        )}
                      </div>
                    </td>
                    {/* Articles */}
                    <td className="px-4 py-3 text-slate-600 text-xs max-w-44 truncate" title={articlesLabel}>
                      {articlesLabel}
                    </td>
                    {/* Total */}
                    <td className="px-4 py-3 text-right font-bold text-green-700 whitespace-nowrap">
                      {cmd.montant.toLocaleString("fr-MA", { maximumFractionDigits: 2 })} MAD
                    </td>
                    {/* Source */}
                    <td className="px-4 py-3">
                      {cmd.source === "web" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-600 border border-blue-200">
                          🌐 Web
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          👤 {cmd.prevendeur || "Terrain"}
                        </span>
                      )}
                    </td>
                    {/* Statut */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${sc.color}`}>
                        {sc.icon} {sc.label}
                      </span>
                    </td>
                    {/* Actions */}
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        {/* WhatsApp — envoyer statut */}
                        {tel && (
                          <button
                            onClick={() => {
                              const sc = getStatutCfg(cmd.statut, cmd.source)
                              const waMsg = encodeURIComponent(
                                `Bonjour ${cmd.nom_client} 👋\n\nVotre commande N° ${cmd.numero.slice(0,12)} : ${sc.icon} ${sc.label}\n\n— Vita Fresh 🍃`
                              )
                              window.open(`https://wa.me/${tel}?text=${waMsg}`, "_blank")
                            }}
                            title="Notifier par WhatsApp"
                            className="px-2 py-1.5 rounded-lg bg-green-50 hover:bg-green-100 text-green-700 text-xs border border-green-200 transition-colors"
                          >
                            📲
                          </button>
                        )}
                        {/* Injecter dans ERP (commandes web seulement) */}
                        {cmd.source === "web" && cmd.statut !== "confirmee" && cmd.statut !== "livre" && (
                          <button
                            onClick={() => injecterDansERP(cmd)}
                            title="Injecter dans la logistique ERP"
                            className="px-2 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold border border-emerald-200 transition-colors whitespace-nowrap"
                          >
                            🚀 ERP
                          </button>
                        )}
                        {/* Ouvrir le détail */}
                        <button
                          onClick={() => setSelected(cmd)}
                          className="px-2 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs border border-slate-200 transition-colors"
                          title="Voir détail / changer statut"
                        >
                          ✏️
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Drawer détail ── */}
      {selected && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setSelected(null)}>
          <div className="flex-1 bg-black/20" />
          <div
            className="w-full max-w-lg bg-white h-full overflow-y-auto shadow-2xl border-l border-border"
            onClick={e => e.stopPropagation()}
          >
            {/* Header drawer */}
            <div className="sticky top-0 bg-white border-b border-border px-5 py-4 flex items-start justify-between">
              <div>
                <h3 className="font-bold text-slate-800 font-mono">{selected.numero}</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {fmt(selected.date)}
                  {selected.heureCommande ? ` · 📝 Prise à ${selected.heureCommande}` : ""}
                  {selected.heurelivraison ? ` · 🕐 Livraison ${selected.heurelivraison}` : ""}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-slate-400 hover:text-slate-600 p-2 rounded-lg hover:bg-slate-100 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-5">

              {/* Badges source + statut */}
              <div className="flex flex-wrap items-center gap-2">
                {selected.source === "web" ? (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-600 border border-blue-200">
                    🌐 Commande Web
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                    📱 Terrain — {selected.prevendeur || "Prévendeur"}
                  </span>
                )}
                <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getStatutCfg(selected.statut, selected.source).color}`}>
                  {getStatutCfg(selected.statut, selected.source).icon}{" "}
                  {getStatutCfg(selected.statut, selected.source).label}
                </span>
              </div>

              {/* Infos client */}
              <div className="bg-slate-50 rounded-xl p-4 space-y-1">
                <p className="text-xs font-semibold text-slate-500 uppercase mb-2">👤 Client</p>
                <p className="font-bold text-slate-800 text-base">{selected.nom_client}</p>
                {selected.telephone && (
                  <a
                    href={`https://wa.me/${selected.telephone.replace(/\D/g,"")}`}
                    target="_blank"
                    className="text-sm text-green-600 hover:underline block"
                  >
                    📲 {selected.telephone}
                  </a>
                )}
                {selected.adresse && (
                  <p className="text-sm text-slate-500">📍 {selected.adresse}</p>
                )}
                {selected.zone && (
                  <p className="text-sm text-slate-500">🗺️ Zone : {selected.zone}</p>
                )}
              </div>

              {/* Lignes articles */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase mb-3">
                  🛒 Articles ({selected.lignes.length})
                </p>
                {selected.lignes.length === 0 ? (
                  <p className="text-sm text-slate-400">Aucun article détaillé.</p>
                ) : (
                  <div className="border border-border rounded-xl overflow-hidden">
                    {selected.lignes.map((l, i) => (
                      <div
                        key={i}
                        className={`flex items-center justify-between px-4 py-3 ${i < selected.lignes.length - 1 ? "border-b border-border" : ""}`}
                      >
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{l.nom}</p>
                          <p className="text-xs text-slate-400">{l.quantite} {l.unite}</p>
                        </div>
                        <p className="text-sm font-bold text-green-700">
                          {(l.total > 0 ? l.total : l.prix * l.quantite).toLocaleString("fr-MA", { maximumFractionDigits: 2 })} MAD
                        </p>
                      </div>
                    ))}
                    <div className="flex items-center justify-between px-4 py-3 bg-slate-50 font-bold">
                      <span className="text-slate-700">Total</span>
                      <span className="text-green-700 text-base">
                        {selected.montant.toLocaleString("fr-MA", { maximumFractionDigits: 2 })} MAD
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Notes */}
              {selected.notes && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-amber-600 uppercase mb-1">📝 Notes / Instructions</p>
                  <p className="text-sm text-slate-700">{selected.notes}</p>
                </div>
              )}

              {/* Changer statut */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase mb-3">🔄 Changer le statut</p>
                <div className="grid grid-cols-2 gap-2">
                  {(selected.source === "web" ? NEXT_WEB : NEXT_ERP).map(s => {
                    const cfg       = getStatutCfg(s, selected.source)
                    const isActive  = s === selected.statut
                    return (
                      <button
                        key={s}
                        onClick={() => updateStatut(selected, s)}
                        disabled={updating || isActive}
                        className={`px-3 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
                          isActive
                            ? cfg.color + " cursor-default"
                            : "bg-white border-border text-slate-600 hover:border-green-400 hover:bg-green-50 active:scale-95 disabled:opacity-40"
                        }`}
                      >
                        {cfg.icon} {cfg.label}
                        {isActive && " ✓"}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Injecter dans ERP logistique */}
              {selected.source === "web" && selected.statut !== "confirmee" && selected.statut !== "livre" && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col gap-2">
                  <p className="text-xs font-bold text-emerald-700 uppercase">🚀 Logistique ERP</p>
                  <p className="text-xs text-emerald-600">
                    Injecte cette commande web dans la chaîne logistique ERP — elle apparaîtra dans Préparation, Dispatch et Stock.
                  </p>
                  <button
                    onClick={() => { injecterDansERP(selected); setSelected(null) }}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-colors"
                  >
                    🚀 Injecter dans la logistique ERP
                  </button>
                </div>
              )}

              {/* Supprimer (admins seulement) */}
              {canDeleteModify(user) && (
                <div className="border-t border-red-100 pt-4">
                  <button
                    onClick={() => deleteCommande(selected)}
                    className="w-full py-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 text-sm font-bold border border-red-200 transition-colors flex items-center justify-center gap-2"
                  >
                    🗑️ Supprimer cette commande
                  </button>
                </div>
              )}

              {/* Message dans le drawer */}
              {msg && (
                <div className={`px-4 py-3 rounded-xl text-sm font-medium border ${
                  msg.ok
                    ? "bg-green-50 text-green-700 border-green-200"
                    : "bg-red-50 text-red-700 border-red-200"
                }`}>
                  {msg.text}
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  )
}
