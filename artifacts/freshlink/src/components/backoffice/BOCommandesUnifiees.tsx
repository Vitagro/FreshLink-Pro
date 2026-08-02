"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { store, type Commande, type LigneCommande, type Client, type Article, type BonPreparation, type LignePreparation, type BonLivraison, type LigneBL } from "@/lib/store"
import type { User } from "@/lib/store"
import { hasPermission } from "@/lib/permissions"
import { logAction } from "@/lib/auditLog"

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
  en_attente:             { label: "En attente",     color: "bg-muted text-muted-foreground border-border",    icon: "🕐" },
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
  return dict[statut] ?? { label: statut, color: "bg-muted text-muted-foreground border-border", icon: "•" }
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
// jour J court de [J-1 heureDebut] à [J heureFin] — cf. store.getCommandeCutoffConfig
// (par défaut 14h00 → 04h00, modifiable sans redéploiement depuis le BO ou
// l'écran mobile Achat). Avant heureDebut, "aujourd'hui" désigne J ; à partir
// de heureDebut, la collecte de J+1 a déjà commencé.
const commandeOperationalDate = store.commandeOperationalDate
function commandeCycleRange(dateStr: string): { debut: string; fin: string; cutoffLabel: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (!m) return { debut: dateStr, fin: dateStr, cutoffLabel: "" }
  const y = Number(m[1]), mo = Number(m[2]), da = Number(m[3])
  const veille = new Date(y, mo - 1, da - 1)
  const debut = `${veille.getFullYear()}-${String(veille.getMonth() + 1).padStart(2, "0")}-${String(veille.getDate()).padStart(2, "0")}`
  const { heureDebut } = store.getCommandeCutoffConfig()
  return { debut, fin: dateStr, cutoffLabel: `${veille.toLocaleDateString("fr-MA", { day: "2-digit", month: "2-digit" })} ${heureDebut}` }
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

// ── Import commandes — types & helpers ────────────────────────────────────────
// Modèle attendu du fichier importé : une ligne par (Date × Client × Article),
// colonnes Date / Client / Telephone / Secteur / Article / Unite / Quantite /
// PrixVente — regroupées ici en une Commande par (Date, Client).
interface ImportRawLigne {
  date: string
  client: string
  telephone: string
  secteur: string
  articleNom: string
  unite: string
  quantite: number
  prixVente: number
}
interface ImportPreview {
  nbLignes: number
  nbCommandes: number
  clientsExistants: number
  clientsACreer: Map<string, Client>
  articlesExistants: number
  articlesACreer: Map<string, Article>
  commandes: { date: string; clientNom: string; clientId: string; lignes: LigneCommande[] }[]
}

function normImportName(s: string): string {
  return (s ?? "").toString()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().trim().replace(/\s+/g, " ")
}

// Pure date-string arithmetic — deliberately avoids new Date(dateStr) + local
// setDate/toISOString, which round-trips through the browser's local
// timezone and can silently shift the result by a day depending on where
// the browser/server happens to be running (verified: rolled back a full
// day on a non-Morocco-timezone test machine).
function addDaysISO(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  const utcMs = Date.UTC(y, m - 1, d) + n * 86_400_000
  return new Date(utcMs).toISOString().slice(0, 10)
}

function parseImportRows(rows: Record<string, unknown>[]): ImportRawLigne[] {
  return rows
    .map(r => ({
      date: String(r.Date ?? r.date ?? "").slice(0, 10),
      client: String(r.Client ?? r.client ?? "").trim(),
      telephone: String(r.Telephone ?? r.telephone ?? ""),
      secteur: String(r.Secteur ?? r.secteur ?? ""),
      articleNom: String(r.Article ?? r.article ?? "").trim(),
      unite: String(r.Unite ?? r.unite ?? "kg"),
      quantite: Number(r.Quantite ?? r.quantite ?? 0) || 0,
      prixVente: Number(r.PrixVente ?? r.prixVente ?? r["Prix Vente"] ?? 0) || 0,
    }))
    .filter(r => r.date && r.client && r.articleNom && r.quantite > 0)
}

function buildImportPreview(raw: ImportRawLigne[], user: User): ImportPreview {
  const existingClients = store.getClients()
  const existingArticles = store.getArticles()
  const clientIndex = new Map<string, Client>()
  existingClients.forEach(c => { const n = normImportName(c.nom); if (n && !clientIndex.has(n)) clientIndex.set(n, c) })
  const articleIndex = new Map<string, Article>()
  existingArticles.forEach(a => { const n = normImportName(a.nom); if (n && !articleIndex.has(n)) articleIndex.set(n, a) })

  const clientsACreer = new Map<string, Client>()
  const articlesACreer = new Map<string, Article>()
  const groups = new Map<string, { date: string; clientNom: string; clientId: string; lignes: LigneCommande[] }>()

  for (const r of raw) {
    const cKey = normImportName(r.client)
    let client = clientIndex.get(cKey) ?? clientsACreer.get(cKey)
    if (!client) {
      client = {
        id: store.genId("VF"),
        nom: r.client,
        secteur: r.secteur || "Import",
        zone: r.secteur || "",
        type: "autre",
        taille: "150-300kg",
        typeProduits: "moyenne",
        rotation: "journalier",
        telephone: r.telephone || "",
        email: "",
        adresse: "",
        createdBy: user.id,
        createdAt: new Date().toISOString(),
      }
      clientsACreer.set(cKey, client)
      clientIndex.set(cKey, client)
    }

    const aKey = normImportName(r.articleNom)
    let article = articleIndex.get(aKey) ?? articlesACreer.get(aKey)
    if (!article) {
      article = {
        id: store.genId("VF"),
        nom: r.articleNom, nomAr: "", famille: "Autres", unite: r.unite || "kg",
        actif: true, prixAchat: 0, pvMethode: "manuel", pvValeur: r.prixVente,
        stockDisponible: 0, stockDefect: 0,
      }
      articlesACreer.set(aKey, article)
      articleIndex.set(aKey, article)
    }

    const groupKey = `${r.date}|||${client.id}`
    let g = groups.get(groupKey)
    if (!g) { g = { date: r.date, clientNom: client.nom, clientId: client.id, lignes: [] }; groups.set(groupKey, g) }
    g.lignes.push({
      articleId: article.id, articleNom: article.nom, unite: article.unite,
      quantite: r.quantite, prixUnitaire: r.prixVente, prixVente: r.prixVente, total: r.quantite * r.prixVente,
    })
  }

  return {
    nbLignes: raw.length,
    nbCommandes: groups.size,
    clientsExistants: [...groups.values()].filter(g => !clientsACreer.has(normImportName(g.clientNom))).length,
    clientsACreer,
    articlesExistants: existingArticles.length,
    articlesACreer,
    commandes: [...groups.values()],
  }
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
  const [noLignes, setNoLignes]           = useState<{ articleId: string; quantite: string; prixVente: string; uniteMode: string }[]>([{ articleId: "", quantite: "", prixVente: "", uniteMode: "base" }])

  // ── Import commandes (Excel) ────────────────────────────────────────────────
  const [showImport, setShowImport]       = useState(false)
  const [importParsing, setImportParsing] = useState(false)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [importError, setImportError]     = useState("")
  const [importStatut, setImportStatut]   = useState<"en_attente" | "valide" | "livre">("en_attente")
  const [importCommitting, setImportCommitting] = useState(false)
  const importFileRef = useRef<HTMLInputElement>(null)

  const handleImportFile = async (file: File) => {
    setImportParsing(true); setImportError(""); setImportPreview(null)
    try {
      const XLSX = await import("xlsx")
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: "array" })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" })
      const raw = parseImportRows(rows)
      if (raw.length === 0) { setImportError("Aucune ligne valide trouvée (colonnes attendues : Date, Client, Article, Quantite, PrixVente)."); return }
      setImportPreview(buildImportPreview(raw, user))
    } catch (e) {
      setImportError(`Erreur de lecture du fichier : ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setImportParsing(false)
    }
  }

  const confirmImport = async () => {
    if (!importPreview) return
    if (!hasPermission(user.role, "creer_commande")) { logAction(user, "creer_commande", "denied"); return }
    setImportCommitting(true)
    try {
      const db = await import("@/lib/supabase/db").catch(() => null)

      // 1. Nouveaux clients
      const newClients = [...importPreview.clientsACreer.values()]
      newClients.forEach(c => store.addClient(c))
      if (db) await Promise.all(newClients.map(c => db.upsertClient(c).catch(() => {})))

      // 2. Nouveaux articles
      const newArticles = [...importPreview.articlesACreer.values()]
      if (newArticles.length) store.saveArticles([...store.getArticles(), ...newArticles])
      if (db) await Promise.all(newArticles.map(a => db.upsertArticle(a).catch(() => {})))

      // 3. Commandes (+ Préparation/BL générés si statut "livre" — historique déjà abouti)
      for (const g of importPreview.commandes) {
        const cmd: Commande = {
          id: store.genCommande(), date: g.date, createdAt: new Date().toISOString(),
          createdVia: "backoffice",
          commercialId: user.id, commercialNom: `${user.name} (Import)`,
          clientId: g.clientId, clientNom: g.clientNom,
          secteur: "", zone: "", gpsLat: 0, gpsLng: 0,
          lignes: g.lignes, heurelivraison: "", statut: importStatut,
          emailDestinataire: store.getEmailConfig().commercial,
        }
        store.addCommande(cmd)
        if (db) await db.upsertCommande(cmd).catch(() => {})

        if (importStatut === "livre") {
          const lignesBP: LignePreparation[] = g.lignes.map(l => ({
            articleId: l.articleId, articleNom: l.articleNom, unite: l.unite ?? "kg",
            qtesParClient: { [g.clientId]: l.quantite }, qteCommandee: l.quantite,
            qtePrepared: l.quantite, valide: true,
            qtesPreparedParClient: { [g.clientId]: l.quantite },
          }))
          const bp: BonPreparation = {
            id: store.genId("BP"), nom: `Prep import ${g.date}`, date: g.date,
            mode: "par_client", type: "stockage", format: "numerique",
            clientIds: [g.clientId], lignes: lignesBP, statut: "valide",
            createdBy: user.id, validatedAt: new Date().toISOString(), validatedBy: user.id,
          }
          store.addBonPreparation(bp)
          if (db) await db.upsertBonPreparation(bp).catch(() => {})

          const lignesBL: LigneBL[] = g.lignes.map(l => ({
            articleNom: l.articleNom, unite: l.unite, quantite: l.quantite,
            prixUnitaire: l.prixUnitaire, total: l.total,
          }))
          const montantTotal = lignesBL.reduce((s, l) => s + l.total, 0)
          const bl: BonLivraison = {
            id: store.genId("BL"), date: addDaysISO(g.date, 1), tripId: "",
            commandeId: cmd.id, commandeIds: [cmd.id], clientId: g.clientId, clientNom: g.clientNom,
            secteur: "", zone: "", livreurNom: "", prevendeurNom: cmd.commercialNom,
            lignes: lignesBL, montantTotal, tva: 0, montantTTC: montantTotal,
            statut: "émis", statutLivraison: "livre",
          }
          store.addBonLivraison(bl)
          if (db) await db.upsertBonLivraison(bl).catch(() => {})
        }
      }

      logAction(user, "creer_commande", "success", { type: "import", label: `${importPreview.nbCommandes} commande(s) importée(s)` })
      setMsg({ ok: true, text: `✅ Import terminé : ${importPreview.nbCommandes} commande(s), ${newClients.length} nouveau(x) client(s), ${newArticles.length} nouvel(aux) article(s).` })
      setShowImport(false); setImportPreview(null)
      load()
    } catch (e) {
      setImportError(`Erreur lors de l'import : ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setImportCommitting(false)
    }
  }

  const saveNewOrder = async () => {
    if (!hasPermission(user.role, "creer_commande")) { logAction(user, "creer_commande", "denied"); return }
    if (savingOrder) return // anti double-clic — jamais deux commandes identiques
    const client = store.getClients().find(c => c.id === noClientId)
    if (!client) { setMsg({ ok: false, text: "Choisissez un client." }); return }
    logAction(user, "creer_commande", "success", { type: "client", id: client.id, label: client.nom })
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
        const saisie = toNum(l.quantite) || 0
        // Saisie en UM (ex: Caisse) → conversion en unite de base (kg) pour le
        // stockage, comme sur mobile Commercial. quantiteUM garde la saisie
        // d'origine pour l'affichage.
        const inUMMode = !!(art.um && art.colisageParUM && l.uniteMode === art.um)
        const q = inUMMode ? saisie * (art.colisageParUM ?? 1) : saisie
        return {
          articleId: art.id, articleNom: art.nom, articleNomAr: art.nomAr, unite: art.unite,
          quantite: q, prixUnitaire: pv, prixVente: pv, total: q * pv,
          ...(inUMMode ? { um: art.um, colisageParUM: art.colisageParUM, quantiteUM: saisie, prixUM: art.colisageParUM ? pv * art.colisageParUM : undefined } : {}),
        }
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
    setShowNew(false); setNoClientId(""); setNoLignes([{ articleId: "", quantite: "", prixVente: "", uniteMode: "base" }])
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
    if (!hasPermission(user.role, "valider_commande")) { logAction(user, "valider_commande", "denied", { type: "commande", id: cmd.id, label: cmd.numero }); return }
    logAction(user, "valider_commande", "success", { type: "commande", id: cmd.id, label: `${cmd.numero} → ${newStatut}` })
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
    if (!hasPermission(user.role, "supprimer_commande")) { logAction(user, "supprimer_commande", "denied", { type: "commande", id: cmd.id, label: cmd.numero }); return }
    if (!confirm(`⚠️ Supprimer définitivement la commande ${cmd.numero} de ${cmd.nom_client} ?\n\nCette action est irréversible.`)) return
    logAction(user, "supprimer_commande", "success", { type: "commande", id: cmd.id, label: cmd.numero })
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
    if (!hasPermission(user.role, "valider_commande")) { logAction(user, "valider_commande", "denied", { type: "commande", label: `${selectedCmds.length} commande(s) → ${newStatut}` }); return }
    logAction(user, "valider_commande", "success", { type: "commande", label: `${selectedCmds.length} commande(s) → ${newStatut}` })
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
    if (!hasPermission(user.role, "supprimer_commande")) { logAction(user, "supprimer_commande", "denied", { type: "commande", label: `${selectedCmds.length} commande(s)` }); return }
    if (bulkBusy || selectedCmds.length === 0) return // anti double-clic
    if (!confirm(`⚠️ Supprimer définitivement ${selectedCmds.length} commande(s) sélectionnée(s) ?\n\nCette action est irréversible.`)) return
    logAction(user, "supprimer_commande", "success", { type: "commande", label: `${selectedCmds.length} commande(s)` })
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
        <p className="text-base font-semibold text-foreground">Accès restreint</p>
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
  const totalTonnage = filtered.reduce((s, c) => s + c.lignes.reduce((ls, l) => ls + l.quantite, 0), 0)

  const cutoffCfg = store.getCommandeCutoffConfig()

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
    logAction(user, "exporter_donnees", "success", { type: "commandes", label: `${filtered.length} commande(s)` })
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

  // ── Export détaillé — une ligne par (commande × article), TOUS les champs ──
  // utiles à un ré-import (Date/Client/Telephone/Secteur/Article/Unite/
  // Quantite/PrixVente) + contexte (Numero, Statut, Source, Prévendeur,
  // Zone/Categorie, Heure commande, Heure livraison souhaitée).
  const exportDetaille = () => {
    if (filtered.length === 0) return
    logAction(user, "exporter_donnees", "success", { type: "commandes_detail", label: `${filtered.length} commande(s)` })
    import("xlsx").then(XLSX => {
      const rows: Record<string, unknown>[] = []
      filtered.forEach(c => {
        c.lignes.forEach(l => {
          rows.push({
            Numero: c.numero, Date: c.date, "Heure commande": c.heureCommande ?? "",
            "Heure livraison": c.heurelivraison ?? "", Client: c.nom_client, Telephone: c.telephone,
            Secteur: c.zone ?? "", Categorie: c.categorie ?? "", Prevendeur: c.prevendeur, Source: c.source,
            Statut: c.statut, Article: l.nom, Unite: l.unite, Quantite: l.quantite, PrixVente: l.prix,
            "Total ligne": l.total, "Montant commande": c.montant,
          })
        })
      })
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "Commandes détaillées")
      const periode = filterDateDebut || filterDateFin ? `_${filterDateDebut || "debut"}_${filterDateFin || "fin"}` : `_${new Date().toISOString().slice(0, 10)}`
      XLSX.writeFile(wb, `commandes_detail${periode}.xlsx`)
    })
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 space-y-4 max-w-7xl mx-auto">

      {/* ── En-tête ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">📦 Toutes les Commandes</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Vue unifiée — Prévendeurs terrain <span className="text-amber-600 font-semibold">({erpCount} ERP)</span> +
            Site web <span className="text-blue-600 font-semibold">({webCount} Web)</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasPermission(user.role, "creer_commande") && <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Nouvelle commande
          </button>}
          {hasPermission(user.role, "creer_commande") && <button
            onClick={() => { setShowImport(true); setImportPreview(null); setImportError("") }}
            title="Importer un fichier Excel de commandes (Date, Client, Article, Quantite, PrixVente) — crée automatiquement les clients/articles manquants"
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 16V4m0 0L8 8m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
            </svg>
            Importer
          </button>}
          {hasPermission(user.role, "exporter_donnees") && <button
            onClick={exportDetaille}
            disabled={filtered.length === 0}
            title="Exporte le détail complet des commandes filtrées : une ligne par commande × article, tous les champs (date, client, secteur, statut, prévendeur, prix...)"
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-40"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H8a2 2 0 01-2-2V5a2 2 0 012-2h6l6 6v11a2 2 0 01-2 2z" />
            </svg>
            Exporter détaillé
          </button>}
          {hasPermission(user.role, "exporter_donnees") && <button
            onClick={exportParClientArticle}
            disabled={filtered.length === 0}
            title="Exporte les commandes filtrées, une ligne par client × article, avec quantité et montant cumulés"
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-40"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H8a2 2 0 01-2-2V5a2 2 0 012-2h6l6 6v11a2 2 0 01-2 2z" />
            </svg>
            Exporter (client &amp; article)
          </button>}
          <button
            onClick={load}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
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
        <span><strong>{cycleAlerte.livrees}</strong> commande(s) livrée(s) depuis {cycleAlerte.cutoffLabel} (cycle commande J-1 {cutoffCfg.heureDebut} → J {cutoffCfg.heureFin}).</span>
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
                active ? `${activeClass} text-white` : "bg-white border-border hover:bg-muted"}`}>
              <span className={`text-xs font-semibold ${active ? "text-white/90" : "text-muted-foreground"}`}>{label}</span>
              <span className={`text-2xl font-black ${active ? "text-white" : "text-foreground"}`}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* ── Modal : import commandes (Excel) ── */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={e => e.target === e.currentTarget && setShowImport(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-bold text-foreground">Importer des commandes</h3>
              <button onClick={() => setShowImport(false)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground">✕</button>
            </div>
            <div className="p-5 flex flex-col gap-4">
              <div className="rounded-xl bg-muted border border-border p-3 text-xs text-muted-foreground leading-relaxed">
                Fichier Excel avec une ligne par <strong>Client × Article</strong>. Colonnes attendues :
                <code className="block mt-1 px-2 py-1 rounded bg-white border border-border font-mono text-[11px]">
                  Date | Client | Telephone | Secteur | Article | Unite | Quantite | PrixVente
                </code>
                Les clients/articles introuvables dans l&apos;ERP sont créés automatiquement.
              </div>

              <div className="flex items-center gap-3">
                <input
                  ref={importFileRef}
                  type="file" accept=".xlsx,.xls,.csv"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f) }}
                  className="text-sm flex-1"
                />
                {importParsing && <span className="text-xs text-muted-foreground">Lecture...</span>}
              </div>

              {importError && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{importError}</div>
              )}

              {importPreview && (
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-muted border border-border px-3 py-2">
                      <p className="text-[11px] text-muted-foreground">Commandes détectées</p>
                      <p className="text-lg font-bold text-foreground">{importPreview.nbCommandes}</p>
                    </div>
                    <div className="rounded-xl bg-muted border border-border px-3 py-2">
                      <p className="text-[11px] text-muted-foreground">Lignes article</p>
                      <p className="text-lg font-bold text-foreground">{importPreview.nbLignes}</p>
                    </div>
                    <div className={`rounded-xl border px-3 py-2 ${importPreview.clientsACreer.size > 0 ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}>
                      <p className="text-[11px] text-muted-foreground">Nouveaux clients à créer</p>
                      <p className="text-lg font-bold text-foreground">{importPreview.clientsACreer.size}</p>
                    </div>
                    <div className={`rounded-xl border px-3 py-2 ${importPreview.articlesACreer.size > 0 ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}>
                      <p className="text-[11px] text-muted-foreground">Nouveaux articles à créer</p>
                      <p className="text-lg font-bold text-foreground">{importPreview.articlesACreer.size}</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-muted-foreground">Statut de ces commandes</label>
                    <select value={importStatut} onChange={e => setImportStatut(e.target.value as typeof importStatut)}
                      className="px-3 py-2 rounded-xl border border-border text-sm">
                      <option value="en_attente">En attente (nouvelles commandes à traiter normalement)</option>
                      <option value="valide">Validée</option>
                      <option value="livre">Déjà livrée (historique — génère aussi Préparation + BL, livraison = date commande + 1)</option>
                    </select>
                  </div>

                  <button
                    onClick={confirmImport}
                    disabled={importCommitting}
                    className="w-full py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-60"
                  >
                    {importCommitting ? "Import en cours..." : `Confirmer l'import (${importPreview.nbCommandes} commande(s))`}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal : nouvelle commande (création manuelle) ── */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={e => e.target === e.currentTarget && setShowNew(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-bold text-foreground">Nouvelle commande</h3>
              <button onClick={() => setShowNew(false)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground">✕</button>
            </div>
            <div className="p-5 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-muted-foreground">Client *</label>
                  <select value={noClientId} onChange={e => setNoClientId(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-border text-sm">
                    <option value="">— Choisir —</option>
                    {store.getClients().slice().sort((a, b) => a.nom.localeCompare(b.nom)).map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-muted-foreground">Heure de livraison</label>
                  <input type="time" value={noHeure} onChange={e => setNoHeure(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-border text-sm" />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-muted-foreground">Articles</label>
                {/* En-têtes de colonnes — une ligne par article ci-dessous */}
                <div className="hidden sm:flex items-center gap-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  <span className="w-6">#</span>
                  <span className="flex-[2]">Article</span>
                  <span className="w-24 text-center">Quantité</span>
                  <span className="w-24 text-center">Prix vente</span>
                  <span className="w-16 text-center">Unité</span>
                  <span className="w-6" />
                </div>
                {noLignes.map((l, i) => {
                  const art = store.getArticles().find(a => a.id === l.articleId)
                  const hasUM = !!(art?.um && art?.colisageParUM)
                  const inUMMode = hasUM && l.uniteMode === art!.um
                  return (
                    <div key={i} className="flex flex-col gap-2 p-3 rounded-xl border border-border bg-muted">
                      <div className="flex items-center gap-2">
                        <span className="w-6 shrink-0 text-xs font-bold text-muted-foreground text-center">{i + 1}</span>
                        <select value={l.articleId}
                          onChange={e => setNoLignes(prev => prev.map((x, j) => j === i ? { ...x, articleId: e.target.value, uniteMode: "base", quantite: "", prixVente: e.target.value ? String(store.computePrixEffectif(store.getArticles().find(a => a.id === e.target.value)!, store.getClients().find(c => c.id === noClientId))) : "" } : x))}
                          className="flex-[2] min-w-0 px-2 py-2.5 rounded-lg border border-border text-sm">
                          <option value="">— Article —</option>
                          {store.getArticles().slice().sort((a, b) => a.nom.localeCompare(b.nom)).map(a => <option key={a.id} value={a.id}>{a.nom}{a.nomAr ? ` / ${a.nomAr}` : ""}</option>)}
                        </select>
                        <input type="text" inputMode="decimal" placeholder="Qté" value={l.quantite}
                          onChange={e => setNoLignes(prev => prev.map((x, j) => j === i ? { ...x, quantite: e.target.value.replace(",", ".") } : x))}
                          className="w-24 shrink-0 px-2 py-2.5 rounded-lg border border-border text-sm text-center" />
                        <input type="text" inputMode="decimal" placeholder="PV" value={l.prixVente}
                          onChange={e => setNoLignes(prev => prev.map((x, j) => j === i ? { ...x, prixVente: e.target.value.replace(",", ".") } : x))}
                          className="w-24 shrink-0 px-2 py-2.5 rounded-lg border border-border text-sm text-center" />
                        <span className="w-16 shrink-0 text-xs text-muted-foreground text-center">{inUMMode ? art!.um : art?.unite}</span>
                        <span className="w-6 shrink-0 flex justify-center">
                          {noLignes.length > 1 && <button onClick={() => setNoLignes(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-red-600">✕</button>}
                        </span>
                      </div>
                      {hasUM && (
                        <div className="flex items-center gap-2 pl-8">
                          <div className="flex rounded-lg overflow-hidden border border-border bg-white">
                            <button type="button"
                              onClick={() => setNoLignes(prev => prev.map((x, j) => j === i ? { ...x, uniteMode: "base", quantite: "" } : x))}
                              className={`px-2.5 py-1 text-[11px] font-semibold transition-colors ${!inUMMode ? "bg-slate-800 text-white" : "text-muted-foreground"}`}>
                              {art!.unite}
                            </button>
                            <button type="button"
                              onClick={() => setNoLignes(prev => prev.map((x, j) => j === i ? { ...x, uniteMode: art!.um!, quantite: "" } : x))}
                              className={`px-2.5 py-1 text-[11px] font-semibold transition-colors ${inUMMode ? "bg-slate-800 text-white" : "text-muted-foreground"}`}>
                              {art!.um} ({art!.colisageParUM} {art!.unite})
                            </button>
                          </div>
                          {inUMMode && l.quantite && (
                            <span className="text-[11px] text-muted-foreground">= {((Number(l.quantite.replace(",", ".")) || 0) * (art!.colisageParUM ?? 1)).toFixed(1)} {art!.unite}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
                <button onClick={() => setNoLignes(prev => [...prev, { articleId: "", quantite: "", prixVente: "", uniteMode: "base" }])}
                  className="self-start text-sm font-semibold text-emerald-600">+ Ajouter un article</button>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowNew(false)} className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted-foreground">Annuler</button>
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
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white rounded-xl border border-border p-4 text-center">
          <div className="text-2xl font-black text-foreground">{cmds.length}</div>
          <div className="text-xs font-semibold text-muted-foreground mt-1 uppercase">Total</div>
        </div>
        <div className="bg-blue-50 rounded-xl border border-blue-100 p-4 text-center">
          <div className="text-2xl font-black text-blue-700">{webCount}</div>
          <div className="text-xs font-semibold text-blue-400 mt-1 uppercase">🌐 Web</div>
        </div>
        <div className="bg-amber-50 rounded-xl border border-amber-100 p-4 text-center">
          <div className="text-2xl font-black text-amber-700">{erpCount}</div>
          <div className="text-xs font-semibold text-amber-400 mt-1 uppercase">📱 Terrain</div>
        </div>
        <div className="bg-orange-50 rounded-xl border border-orange-100 p-4 text-center">
          <div className="text-lg font-black text-orange-700 leading-tight">
            {totalTonnage.toLocaleString("fr-MA", { maximumFractionDigits: 0 })} kg
          </div>
          <div className="text-xs font-semibold text-orange-400 mt-1 uppercase">Tonnage filtré</div>
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
          className="px-3 py-2 rounded-xl border border-border text-sm font-medium bg-white text-foreground cursor-pointer"
        >
          <option value="tous">📋 Toutes sources</option>
          <option value="web">🌐 Web</option>
          <option value="erp">📱 Terrain</option>
        </select>

        {/* Statut */}
        <select
          value={filterStatut}
          onChange={e => setFilterStatut(e.target.value)}
          className="px-3 py-2 rounded-xl border border-border text-sm font-medium bg-white text-foreground cursor-pointer"
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
            className="px-3 py-2 rounded-xl border border-border text-sm font-medium bg-white text-foreground cursor-pointer"
          >
            <option value="tous">🗺️ Toutes zones</option>
            {zones.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
        )}

        {/* Catégorie : CHR / Particulier / Marchand */}
        <select
          value={filterCategorie}
          onChange={e => setFilterCategorie(e.target.value)}
          className="px-3 py-2 rounded-xl border border-border text-sm font-medium bg-white text-foreground cursor-pointer"
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
          className="px-3 py-2 rounded-xl border border-border text-sm bg-white text-foreground"
        />
        <input
          type="date"
          value={filterDateFin}
          onChange={e => setFilterDateFin(e.target.value)}
          title="Au"
          className="px-3 py-2 rounded-xl border border-border text-sm bg-white text-foreground"
        />
        <button type="button" onClick={() => { const { debut, fin } = commandeCycleRange(commandeOperationalDate()); setFilterDateDebut(debut); setFilterDateFin(fin) }}
          title={`Commandes du cycle J-1 ${cutoffCfg.heureDebut} → J ${cutoffCfg.heureFin}`}
          className="px-3 py-2 rounded-xl text-xs font-bold bg-muted text-muted-foreground hover:bg-muted whitespace-nowrap">
          🌙 Cycle commande
        </button>

        {/* Recherche libre */}
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Client, tél, réf, zone..."
          className="flex-1 min-w-44 px-3 py-2 rounded-xl border border-border text-sm bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-green-500"
        />

        {/* Tri */}
        <div className="flex gap-1 p-1 rounded-xl bg-muted">
          <button type="button" onClick={() => setSortMode("date")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${sortMode === "date" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground"}`}>
            Plus récent
          </button>
          <button type="button" onClick={() => setSortMode("alpha")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${sortMode === "alpha" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground"}`}>
            A → Z
          </button>
        </div>

        {(search || filterStatut !== "tous" || filterSource !== "tous" || filterZone !== "tous" || filterCategorie !== "tous" || !isDefaultDateRange) && (
          <button
            onClick={() => { setSearch(""); setFilterStatut("tous"); setFilterSource("tous"); setFilterZone("tous"); setFilterCategorie("tous"); setFilterDateDebut(cycleDefault.debut); setFilterDateFin(cycleDefault.fin) }}
            className="px-3 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted"
          >
            ✕ Reset
          </button>
        )}

        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} résultat{filtered.length > 1 ? "s" : ""}</span>
      </div>

      {/* ── Barre d'actions groupées ── */}
      {filtered.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap px-4 py-2.5 rounded-xl border border-border bg-muted">
          <button onClick={toggleSelectAll}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-border bg-white hover:bg-muted">
            {allFilteredSelected ? "☑ Tout désélectionner" : "☐ Tout sélectionner"}
          </button>
          {selectedIds.size > 0 && (
            <>
              <span className="text-xs font-bold text-muted-foreground">{selectedIds.size} sélectionnée(s)</span>
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
        <div className="py-16 text-center text-muted-foreground text-sm">⏳ Chargement des commandes...</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground text-sm">Aucune commande trouvée.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-white">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted text-muted-foreground text-xs uppercase tracking-wide">
                <th className="px-4 py-3 w-8">
                  <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll}
                    className="w-4 h-4 rounded accent-primary cursor-pointer" />
                </th>
                <th className="text-left px-4 py-3 font-semibold">Réf.</th>
                <th className="text-left px-4 py-3 font-semibold">Date</th>
                <th className="text-left px-4 py-3 font-semibold">Client</th>
                <th className="text-left px-4 py-3 font-semibold">Articles</th>
                <th className="text-right px-4 py-3 font-semibold">Tonnage</th>
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
                    className={`border-b border-border hover:bg-muted cursor-pointer transition-colors ${i % 2 === 0 ? "" : "bg-muted/40"}`}
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
                    <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                      <div>{fmt(cmd.date)}{cmd.heureCommande ? ` · 📝 ${cmd.heureCommande}` : ""}</div>
                      {cmd.heurelivraison && <div className="text-[11px] text-muted-foreground">🕐 {cmd.heurelivraison}</div>}
                    </td>
                    {/* Client */}
                    <td className="px-4 py-3">
                      <div className="font-semibold text-foreground text-sm">{cmd.nom_client}</div>
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
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                            🗺️ {cmd.zone}
                          </span>
                        )}
                        {cmd.categorie && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                            cmd.categorie === "CHR" ? "bg-purple-100 text-purple-700"
                            : cmd.categorie === "Marchand" ? "bg-amber-100 text-amber-700"
                            : cmd.categorie === "Particulier" ? "bg-blue-100 text-blue-700"
                            : "bg-muted text-muted-foreground"
                          }`}>
                            {cmd.categorie}
                          </span>
                        )}
                      </div>
                    </td>
                    {/* Articles */}
                    <td className="px-4 py-3 text-muted-foreground text-xs max-w-44 truncate" title={articlesLabel}>
                      {articlesLabel}
                    </td>
                    {/* Tonnage */}
                    <td className="px-4 py-3 text-right text-muted-foreground text-xs whitespace-nowrap">
                      {cmd.lignes.reduce((s, l) => s + l.quantite, 0).toLocaleString("fr-MA")} kg
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
                          className="px-2 py-1.5 rounded-lg bg-muted hover:bg-muted text-muted-foreground text-xs border border-border transition-colors"
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
                <h3 className="font-bold text-foreground font-mono">{selected.numero}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {fmt(selected.date)}
                  {selected.heureCommande ? ` · 📝 Prise à ${selected.heureCommande}` : ""}
                  {selected.heurelivraison ? ` · 🕐 Livraison ${selected.heurelivraison}` : ""}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-muted-foreground hover:text-muted-foreground p-2 rounded-lg hover:bg-muted transition-colors"
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
              <div className="bg-muted rounded-xl p-4 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">👤 Client</p>
                <p className="font-bold text-foreground text-base">{selected.nom_client}</p>
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
                  <p className="text-sm text-muted-foreground">📍 {selected.adresse}</p>
                )}
                {selected.zone && (
                  <p className="text-sm text-muted-foreground">🗺️ Zone : {selected.zone}</p>
                )}
              </div>

              {/* Lignes articles */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">
                  🛒 Articles ({selected.lignes.length})
                </p>
                {selected.lignes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun article détaillé.</p>
                ) : (
                  <div className="border border-border rounded-xl overflow-hidden">
                    {selected.lignes.map((l, i) => (
                      <div
                        key={i}
                        className={`flex items-center justify-between px-4 py-3 ${i < selected.lignes.length - 1 ? "border-b border-border" : ""}`}
                      >
                        <div>
                          <p className="text-sm font-semibold text-foreground">{l.nom}</p>
                          {(() => {
                            const nomAr = store.getArticles().find(a => a.nom.toLowerCase() === l.nom.toLowerCase().trim())?.nomAr
                            return nomAr ? <p className="text-xs text-muted-foreground font-arabic" dir="rtl" lang="ar">{nomAr}</p> : null
                          })()}
                          <p className="text-xs text-muted-foreground">{l.quantite} {l.unite}</p>
                        </div>
                        <p className="text-sm font-bold text-green-700">
                          {(l.total > 0 ? l.total : l.prix * l.quantite).toLocaleString("fr-MA", { maximumFractionDigits: 2 })} MAD
                        </p>
                      </div>
                    ))}
                    <div className="flex items-center justify-between px-4 py-3 bg-muted font-bold">
                      <span className="text-foreground">Total</span>
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
                  <p className="text-sm text-foreground">{selected.notes}</p>
                </div>
              )}

              {/* Changer statut */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">🔄 Changer le statut</p>
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
                            : "bg-white border-border text-muted-foreground hover:border-green-400 hover:bg-green-50 active:scale-95 disabled:opacity-40"
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
