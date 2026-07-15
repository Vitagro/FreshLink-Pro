"use client"

import { useState, useEffect, useMemo } from "react"
import type { User } from "@/lib/store"
import { store, MODALITE_LABELS } from "@/lib/store"
import {
  printBLFromBO,
  downloadBLFromBO,
  sendWhatsApp,
  buildBLWhatsAppText,
  type PrintBLOpts,
} from "@/lib/print"
import { sendEmail } from "@/lib/email"

// ─── Types ────────────────────────────────────────────────────────────────────

export type BLStatut =
  | "brouillon" | "valide" | "en_livraison" | "livre" | "retour_partiel" | "annule"

export type BLLigne = {
  id: string
  articleId: string
  articleNom: string
  articleNomAr?: string
  unite: string
  qteCommande: number
  qteLivree: number
  prixUnit: number
  totalLigne: number
  noteQC?: string       // QC note per line
  qcOk?: boolean
}

export interface BonLivraison {
  id: string
  numero: string         // "BL-2025-0047"
  commandeId?: string
  commandeIds?: string[] // toutes les commandes regroupées sur ce BL (client unique, plusieurs commandes)
  clientId: string
  clientNom: string
  clientAdresse?: string
  livreurId?: string
  livreurNom?: string
  transporteur: "honda_1" | "honda_2" | "honda_3" | "honda_4" | "honda_5" | "externe" | "non_affecte"
  statut: BLStatut
  date: string
  dateLivraisonPrevue?: string
  lignes: BLLigne[]
  totalHT: number
  totalTTC: number
  tva: number           // taux TVA %
  notesBL?: string
  qcObligatoire: boolean
  qcValidePar?: string
  qcValideAt?: string
  signatureClient?: string   // base64
  photos?: string[]          // base64 proofs
  createdBy: string
  updatedAt: string
  // Commercial / legal fields
  clientIce?: string              // ICE du client (Identifiant Commun de l'Entreprise)
  clientModalitePaiement?: string // modalite de paiement
  clientCreditSolde?: number      // encours credit actuel
  clientCreditAutorise?: boolean  // credit autorise ou non
  clientDelaiRecouvrement?: string
}

const TRANSPORTEURS: { v: BonLivraison["transporteur"]; l: string }[] = [
  { v: "honda_1",     l: "Honda — Livreur 1" },
  { v: "honda_2",     l: "Honda — Livreur 2" },
  { v: "honda_3",     l: "Honda — Livreur 3" },
  { v: "honda_4",     l: "Honda — Livreur 4" },
  { v: "honda_5",     l: "Honda — Livreur 5" },
  { v: "externe",     l: "Transporteur externe" },
  { v: "non_affecte", l: "Non affecte" },
]

const STATUT_LABELS: Record<BLStatut, string> = {
  brouillon:      "Brouillon",
  valide:         "Valide",
  en_livraison:   "En livraison",
  livre:          "Livre",
  retour_partiel: "Retour partiel",
  annule:         "Annule",
}

const STATUT_COLORS: Record<BLStatut, string> = {
  brouillon:      "bg-slate-100 text-slate-600",
  valide:         "bg-blue-100 text-blue-700",
  en_livraison:   "bg-amber-100 text-amber-700",
  livre:          "bg-emerald-100 text-emerald-700",
  retour_partiel: "bg-orange-100 text-orange-700",
  annule:         "bg-red-100 text-red-600",
}

// Unified key — matches store.getBonsLivraison() / store.saveBonsLivraison()
const LS_BL = "fl_bons_livraison"

// Statuts valides reconnus par cet écran (clés de STATUT_LABELS)
const VALID_STATUTS = new Set<BLStatut>(["brouillon", "valide", "en_livraison", "livre", "retour_partiel", "annule"])

// ── Normalisation défensive ───────────────────────────────────────────────────
// Les BL peuvent arriver de plusieurs sources (éditeur BO, import préparation,
// injection trip/dispatch, commandes web). Certains payloads n'ont PAS le format
// attendu (ex: pas de `numero`, lignes en {prixUnitaire,quantite,total}, statut
// "émis"…). On normalise à la LECTURE pour ne jamais crasher (`b.numero.includes`)
// et pour que ces BL deviennent visibles dans la liste.
function normalizeLigne(l: Record<string, unknown>): BLLigne {
  const prixUnit    = Number(l.prixUnit ?? l.prixUnitaire ?? 0) || 0
  const qteLivree   = Number(l.qteLivree ?? l.quantite ?? 0) || 0
  const qteCommande = Number(l.qteCommande ?? l.quantite ?? qteLivree) || 0
  const totalLigne  = Number(l.totalLigne ?? l.total ?? qteLivree * prixUnit) || 0
  return {
    id:           String(l.id ?? genId()),
    articleId:    String(l.articleId ?? ""),
    articleNom:   String(l.articleNom ?? l.nom ?? "Article"),
    articleNomAr: l.articleNomAr ? String(l.articleNomAr) : undefined,
    unite:        String(l.unite ?? "kg"),
    qteCommande, qteLivree, prixUnit, totalLigne,
    noteQC:       l.noteQC ? String(l.noteQC) : undefined,
    qcOk:         l.qcOk !== false,
  }
}

function normalizeBL(raw: Record<string, unknown>): BonLivraison {
  const lignes = (Array.isArray(raw.lignes) ? raw.lignes : []).map(l => normalizeLigne(l as Record<string, unknown>))
  // Statut : mappe les valeurs externes ("émis", statutLivraison…) vers un BLStatut valide
  let statut = String(raw.statut ?? "")
  if (statut === "émis" || statut === "emis") statut = "valide"
  if (!VALID_STATUTS.has(statut as BLStatut)) {
    const sl = String(raw.statutLivraison ?? "")
    statut = sl === "livre" ? "livre" : (VALID_STATUTS.has(statut as BLStatut) ? statut : "valide")
  }
  // TVA : certaines sources stockent 0.2 (fraction) au lieu de 20 (%)
  let tva = Number(raw.tva ?? 20)
  if (tva > 0 && tva < 1) tva = Math.round(tva * 100)
  const totalHT  = Number(raw.totalHT  ?? raw.montantTotal ?? lignes.reduce((s, l) => s + l.totalLigne, 0)) || 0
  const totalTTC = Number(raw.totalTTC ?? raw.montantTTC   ?? totalHT) || 0
  return {
    ...(raw as object),
    id:           String(raw.id ?? genId()),
    numero:       String(raw.numero ?? raw.id ?? ""),
    clientId:     String(raw.clientId ?? ""),
    clientNom:    String(raw.clientNom ?? raw.client ?? "—"),
    transporteur: (raw.transporteur as BonLivraison["transporteur"]) ?? "non_affecte",
    statut:       statut as BLStatut,
    date:         String(raw.date ?? raw.created_at ?? new Date().toISOString().split("T")[0]),
    lignes,
    totalHT, totalTTC, tva,
    qcObligatoire: raw.qcObligatoire === true,
    createdBy:    String(raw.createdBy ?? ""),
    updatedAt:    String(raw.updatedAt ?? raw.updated_at ?? new Date().toISOString()),
  } as BonLivraison
}

function getBLs(): BonLivraison[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_BL) ?? "[]")
    if (!Array.isArray(raw)) return []
    return raw.map(b => normalizeBL(b as Record<string, unknown>))
  } catch { return [] }
}
function saveBLs(bls: BonLivraison[]) {
  localStorage.setItem(LS_BL, JSON.stringify(bls))
}
function genId() { return `VFBL${Date.now().toString(36).toUpperCase().slice(-3)}${Math.floor(Math.random()*9999).toString().padStart(4,"0")}` }
function genNumero() {
  const y = new Date().getFullYear()
  const existing = getBLs().filter(b => (b.numero ?? "").includes(`BL-${y}`))
  const n = (existing.length + 1).toString().padStart(4, "0")
  return `BL-${y}-${n}`
}

const EMPTY_LIGNE: Omit<BLLigne, "id" | "totalLigne"> = {
  articleId: "", articleNom: "", unite: "kg",
  qteCommande: 0, qteLivree: 0, prixUnit: 0, noteQC: "", qcOk: true,
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatutBadge({ statut }: { statut: BLStatut }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${STATUT_COLORS[statut]}`}>
      {STATUT_LABELS[statut]}
    </span>
  )
}

function Divider() { return <div className="border-t border-slate-100 my-2" /> }

// ─── EDITOR ───────────────────────────────────────────────────────────────────

function BLEditor({
  bl, onSave, onCancel, currentUser, qcObligatoire,
}: {
  bl: Partial<BonLivraison>
  onSave: (b: BonLivraison) => void
  onCancel: () => void
  currentUser: User
  qcObligatoire: boolean
}) {
  const todayStr = new Date().toISOString().split("T")[0]
  const [form, setForm] = useState<Partial<BonLivraison>>({
    numero: genNumero(),
    transporteur: "non_affecte",
    statut: "brouillon",
    date: todayStr,
    // Livraison prévue = date du BL par défaut — l'utilisateur peut la changer.
    dateLivraisonPrevue: todayStr,
    lignes: [],
    totalHT: 0, totalTTC: 0, tva: 20,
    qcObligatoire,
    notesBL: "",
    ...bl,
  })
  const [clients] = useState(() => store.getClients())
  const [articles] = useState(() => store.getArticles().slice().sort((a, b) => a.nom.localeCompare(b.nom, "fr")))
  // Rattrapage URGENT : les BL générés automatiquement depuis une préparation
  // (autoGenerateBLs, MobilePreparation.tsx) utilisent le type LigneBL de
  // store.ts qui n'a JAMAIS eu de champ articleId (seulement articleNom) —
  // le <select> ci-dessous, lié à articleId, affichait donc "— Article —"
  // sur TOUTES les lignes malgré des quantités/prix corrects. On retrouve
  // l'articleId manquant par correspondance exacte sur le nom.
  const [lignes, setLignes] = useState<BLLigne[]>(() => (bl.lignes ?? []).map(l => {
    if (l.articleId && articles.some(a => a.id === l.articleId)) return l
    const match = articles.find(a => a.nom === l.articleNom)
    return match ? { ...l, articleId: match.id, articleNomAr: l.articleNomAr ?? match.nomAr } : l
  }))
  const [users] = useState(() => store.getUsers())
  const livreurs = users.filter(u => u.role === "livreur")
  // Champs secondaires (statut, TVA, QC, ICE, compte, tel, modalité, adresse,
  // notes) masqués par défaut — auto-remplis depuis la fiche client, à
  // afficher seulement si l'utilisateur veut les vérifier/adapter.
  const [showAdvanced, setShowAdvanced] = useState(false)
  // Import préparation ouvert par défaut sur un BL neuf (sans lignes) — les
  // articles doivent venir de la préparation/commande, pas d'une saisie
  // manuelle depuis zéro.
  const [showImport, setShowImport] = useState(() => !bl.lignes || bl.lignes.length === 0)

  // ── P5a: filter clients to prep/trip if BL is linked to a prep bon ──────────
  const prepBonId = (bl as Record<string, unknown>).prepId as string | undefined
  const filteredClients = prepBonId
    ? (() => {
        const bon = store.getBonsPreparation().find(b => b.id === prepBonId)
        const prepClientIds = new Set(bon?.clientIds ?? [])
        return prepClientIds.size > 0 ? clients.filter(c => prepClientIds.has(c.id)) : clients
      })()
    : clients

  // ── Livreur pré-sélectionné depuis l'affectation de la tournée liée ─────────
  useEffect(() => {
    if (form.livreurId || !prepBonId) return
    const bon = store.getBonsPreparation().find(b => b.id === prepBonId)
    if (!bon?.tripId) return
    const trip = store.getTrips().find(t => t.id === bon.tripId)
    if (trip?.livreurId) setForm(f => (f.livreurId ? f : { ...f, livreurId: trip.livreurId, livreurNom: trip.livreurNom }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepBonId])

  // ── Auto-fill client fields when a client is selected ──────────────────────
  const autoFillClient = (clientId: string) => {
    const c = clients.find(c => c.id === clientId)
    if (!c) return
    setForm(f => ({
      ...f,
      clientNom:               c.nom,
      clientId:                c.id,
      clientAdresse:           f.clientAdresse || c.adresse || "",
      clientIce:               f.clientIce     || c.ice     || "",
      clientModalitePaiement:  f.clientModalitePaiement || (c.modalitePaiement ?? ""),
      clientCreditSolde:       f.clientCreditSolde   ?? c.creditSolde,
      clientCreditAutorise:    f.clientCreditAutorise ?? c.creditAutorise,
      clientDelaiRecouvrement: f.clientDelaiRecouvrement || (c.delaiRecouvrement ?? ""),
      clientTelephone: (f as {clientTelephone?: string}).clientTelephone || c.telephone || "",
    } as typeof f))
  }

  // ── Auto-fill article fields when an article is selected in a ligne ─────────
  const selectArticleLigne = (ligneId: string, artId: string) => {
    const art = articles.find(a => a.id === artId)
    setLignes(prev => prev.map(l => {
      if (l.id !== ligneId) return l
      if (!art) return { ...l, articleId: "", articleNom: "", articleNomAr: undefined }
      const blClient = clients.find(c => c.id === form.clientId)
      const prixUnit = l.prixUnit || store.computePrixEffectif(art, blClient) || 0
      return {
        ...l,
        articleId:    art.id,
        articleNom:   art.nom,
        articleNomAr: art.nomAr ?? undefined,
        unite:        art.unite ?? l.unite,
        prixUnit,
        totalLigne:   (l.qteLivree ?? 0) * prixUnit,
      }
    }))
  }

  // ── Import depuis BonPreparation validé ────────────────────────────────────
  // Exclut les préparations déjà liées à un AUTRE BL existant — sinon un
  // second import de la même préparation créerait un BL en double (fausse
  // les chiffres). Le BL en cours d'édition garde le droit de réimporter
  // sa propre préparation déjà liée (pas une nouvelle, juste un refresh).
  const bonsPrep = useMemo(() => {
    const usedPrepIds = new Set(
      store.getBonsLivraison()
        .filter(existingBl => existingBl.id !== bl.id)
        .map(existingBl => (existingBl as unknown as { prepId?: string }).prepId)
        .filter((id): id is string => !!id)
    )
    return store.getBonsPreparation().filter(b => b.statut === "valide" && !usedPrepIds.has(b.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const importFromPrep = (bonId: string) => {
    const bon = bonsPrep.find(b => b.id === bonId)
    if (!bon) return
    // Build lignes BL from preparation qtePrepared values
    const newLignes: BLLigne[] = bon.lignes.map(l => {
      // Find prix from commandes linked to this bon
      let prixUnit = 0
      const commandes = store.getCommandes().filter(c => bon.clientIds.includes(c.clientId))
      for (const cmd of commandes) {
        const cl = cmd.lignes.find(cl => cl.articleId === l.articleId)
        if (cl) { prixUnit = cl.prixVente ?? cl.prixUnitaire ?? 0; break }
      }
      const qte = l.qtePrepared > 0 ? l.qtePrepared : l.qteCommandee
      return {
        id: genId(),
        articleId: l.articleId,
        articleNom: l.articleNom,
        unite: l.unite,
        qteCommande: l.qteCommandee,
        qteLivree: qte,   // quantity prepared — can still be rectified
        prixUnit,
        totalLigne: qte * prixUnit,
        qcOk: true,
        noteQC: "",
      }
    })
    setLignes(newLignes)
    // Auto-fill client info from first commande linked to the bon
    const firstCmd = store.getCommandes().find(c => bon.clientIds.includes(c.clientId))
    // Lie ce BL à sa préparation source — indispensable pour que le filtre
    // anti-doublon (usedPrepIds ci-dessus) puisse la détecter la prochaine fois.
    setForm(f => ({
      ...f,
      ...(firstCmd && !f.clientNom ? { clientNom: firstCmd.clientNom, clientId: firstCmd.clientId } : {}),
      prepId: bon.id,
    } as typeof f))
    setShowImport(false)
  }

  // Recalculate totals when lines change
  useEffect(() => {
    const totalHT = lignes.reduce((s, l) => s + l.totalLigne, 0)
    const tva = form.tva ?? 20
    const totalTTC = totalHT * (1 + tva / 100)
    setForm(f => ({ ...f, lignes, totalHT, totalTTC }))
  }, [lignes, form.tva])

  const addLigne = () => {
    const l: BLLigne = { ...EMPTY_LIGNE, id: genId(), totalLigne: 0 }
    setLignes(prev => [...prev, l])
  }

  const updateLigne = (id: string, field: keyof BLLigne, val: unknown) => {
    setLignes(prev => prev.map(l => {
      if (l.id !== id) return l
      const updated = { ...l, [field]: val }
      updated.totalLigne = (updated.qteLivree ?? 0) * (updated.prixUnit ?? 0)
      return updated
    }))
  }

  const removeLigne = (id: string) => setLignes(prev => prev.filter(l => l.id !== id))

  const canSave = (form.clientNom ?? "").trim().length > 0 && lignes.length > 0

  const handleSave = () => {
    if (!canSave) return
    const now = new Date().toISOString()
    const saved: BonLivraison = {
      id: bl.id ?? genId(),
      numero: form.numero ?? genNumero(),
      clientId: form.clientId ?? "",
      clientNom: form.clientNom ?? "",
      clientAdresse: form.clientAdresse,
      livreurId: form.livreurId,
      livreurNom: form.livreurNom,
      transporteur: form.transporteur ?? "non_affecte",
      statut: form.statut ?? "brouillon",
      date: form.date ?? now.split("T")[0],
      dateLivraisonPrevue: form.dateLivraisonPrevue,
      lignes,
      totalHT: form.totalHT ?? 0,
      totalTTC: form.totalTTC ?? 0,
      tva: form.tva ?? 20,
      notesBL: form.notesBL,
      qcObligatoire: form.qcObligatoire ?? false,
      qcValidePar: form.qcValidePar,
      qcValideAt: form.qcValideAt,
      createdBy: bl.createdBy ?? currentUser.id,
      updatedAt: now,
      commandeId: bl.commandeId,
      clientIce: form.clientIce,
      clientModalitePaiement: form.clientModalitePaiement,
      clientCreditSolde: form.clientCreditSolde,
      clientCreditAutorise: form.clientCreditAutorise,
      clientDelaiRecouvrement: form.clientDelaiRecouvrement,
    }
    // prepId (lien préparation source) : pas dans l'interface BonLivraison
    // locale mais utilisé partout ailleurs via cast — cf. bonsPrep/deleteBL.
    const prepIdToSave = (form as unknown as { prepId?: string }).prepId ?? (bl as unknown as { prepId?: string }).prepId
    if (prepIdToSave) (saved as unknown as { prepId: string }).prepId = prepIdToSave
    onSave(saved)
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={onCancel} className="p-1.5 rounded-xl hover:bg-slate-100 transition-colors text-slate-500">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h2 className="font-bold text-slate-900">{bl.id ? "Modifier BL" : "Nouveau BL"}</h2>
            <p className="text-xs text-slate-500 font-mono">
              Bon de livraison N° {(form.numero ?? "").replace(/^(BL[-_])+/i, "")}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
            Annuler
          </button>
          <button onClick={handleSave} disabled={!canSave}
            className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-40 shadow-sm">
            {bl.id ? "Enregistrer" : "Creer BL"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5 bg-slate-50">

        {/* Section 1 — Infos generales */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
            <span className="w-5 h-5 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-black">1</span>
            Informations generales
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Client */}
            <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-2">
              <label className="text-xs font-semibold text-slate-600">Client *</label>
              <select
                value={form.clientId ?? ""}
                onChange={e => {
                  if (e.target.value) autoFillClient(e.target.value)
                  else setForm(f => ({ ...f, clientId: "", clientNom: "" }))
                }}
                className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
                <option value="">— Choisir un client —</option>
                {filteredClients.slice().sort((a, b) => a.nom.localeCompare(b.nom, "fr")).map(c => (
                  <option key={c.id} value={c.id}>{c.nom}</option>
                ))}
              </select>
              {prepBonId && filteredClients.length < clients.length && (
                <p className="text-[10px] text-blue-600 mt-0.5">Filtrés : {filteredClients.length} client(s) du bon de préparation</p>
              )}
              {form.clientId && (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <svg className="w-3 h-3 text-emerald-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-[10px] text-emerald-600 font-medium">Donnees client auto-renseignees — modifiables ci-dessous</span>
                </div>
              )}
            </div>

            {/* Date — modifiable uniquement par le super administrateur */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600">
                Date BL{store.getSession()?.role !== "super_super_admin" && <span className="text-slate-400 font-normal"> (verrouillée)</span>}
              </label>
              <input type="date" value={form.date ?? ""}
                onChange={e => { if (store.getSession()?.role === "super_super_admin") setForm(f => ({ ...f, date: e.target.value })) }}
                disabled={store.getSession()?.role !== "super_super_admin"}
                title={store.getSession()?.role === "super_super_admin" ? "" : "Seul le super administrateur peut modifier la date du BL"}
                className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed" />
            </div>

            {/* Date livraison prevue */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600">Livraison prevue</label>
              <input type="date" value={form.dateLivraisonPrevue ?? ""}
                onChange={e => setForm(f => ({ ...f, dateLivraisonPrevue: e.target.value }))}
                className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
            </div>

            {/* Transporteur */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600">Transporteur / Honda</label>
              <select value={form.transporteur ?? "non_affecte"}
                onChange={e => setForm(f => ({ ...f, transporteur: e.target.value as BonLivraison["transporteur"] }))}
                className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
                {TRANSPORTEURS.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
              </select>
            </div>

            {/* Livreur */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600">Livreur</label>
              <select value={form.livreurId ?? ""}
                onChange={e => {
                  const u = livreurs.find(u => u.id === e.target.value)
                  setForm(f => ({ ...f, livreurId: e.target.value, livreurNom: u?.name ?? "" }))
                }}
                className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
                <option value="">-- Choisir livreur --</option>
                {livreurs.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>

          {/* Champs avancés — masqués par défaut (auto-remplis depuis la fiche
              client), à afficher seulement si besoin de vérifier/adapter. */}
          <button type="button" onClick={() => setShowAdvanced(v => !v)}
            className="mt-3 text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1">
            {showAdvanced ? "▾ Masquer les informations avancées" : "▸ Afficher les informations avancées (statut, TVA, ICE, tél, adresse…)"}
          </button>

          {showAdvanced && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
            {/* Statut */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600">Statut</label>
              <select value={form.statut ?? "brouillon"}
                onChange={e => setForm(f => ({ ...f, statut: e.target.value as BLStatut }))}
                className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
                {Object.entries(STATUT_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>

            {/* TVA */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600">TVA (%)</label>
              <select value={form.tva ?? 20}
                onChange={e => setForm(f => ({ ...f, tva: Number(e.target.value) }))}
                className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
                {[0, 7, 10, 14, 20].map(v => <option key={v} value={v}>{v}%</option>)}
              </select>
            </div>

            {/* QC toggle */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600">Controle QC obligatoire</label>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, qcObligatoire: !f.qcObligatoire }))}
                className={`relative w-11 h-6 rounded-full transition-colors ${form.qcObligatoire ? "bg-emerald-500" : "bg-slate-200"}`}>
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${form.qcObligatoire ? "left-6" : "left-1"}`} />
              </button>
              <p className="text-[10px] text-slate-400">{form.qcObligatoire ? "Validation QC requise avant expedition" : "QC optionnel"}</p>
            </div>

            {/* ICE client */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600">
                ICE Client
                {form.clientIce && <span className="ml-1.5 text-[9px] font-bold text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded-full">auto</span>}
              </label>
              <input value={form.clientIce ?? ""} onChange={e => setForm(f => ({ ...f, clientIce: e.target.value }))}
                placeholder="Ex: 001234567000089"
                className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 font-mono" />
            </div>

            {/* Num compte client */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600">Num compte client</label>
              <input value={(form as {clientNumCompte?: string}).clientNumCompte ?? ""}
                onChange={e => setForm(f => ({ ...f, clientNumCompte: e.target.value } as typeof f))}
                placeholder="Ex: CLI-0042"
                className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 font-mono" />
            </div>

            {/* Telephone client */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600">
                Tel client (WhatsApp)
                {(form as {clientTelephone?: string}).clientTelephone && <span className="ml-1.5 text-[9px] font-bold text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded-full">auto</span>}
              </label>
              <input value={(form as {clientTelephone?: string}).clientTelephone ?? ""}
                onChange={e => setForm(f => ({ ...f, clientTelephone: e.target.value } as typeof f))}
                placeholder="212661234567"
                className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
            </div>

            {/* Modalite paiement */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600">
                Modalite de paiement
                {form.clientModalitePaiement && <span className="ml-1.5 text-[9px] font-bold text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded-full">auto</span>}
              </label>
              <select value={form.clientModalitePaiement ?? ""}
                onChange={e => setForm(f => ({ ...f, clientModalitePaiement: e.target.value }))}
                className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
                <option value="">-- Choisir --</option>
                {Object.entries(MODALITE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>

            {/* Credit solde */}
            {(form.clientCreditSolde !== undefined && form.clientCreditSolde !== null) && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-600">Encours credit (DH)</label>
                <div className={`px-3 py-2.5 border rounded-xl text-sm font-bold ${
                  (form.clientCreditAutorise) ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"
                }`}>
                  {(form.clientCreditSolde).toFixed(2)} DH
                  <span className="ml-2 text-[10px] font-normal">
                    {form.clientCreditAutorise ? "(credit autorise)" : "(credit non autorise)"}
                  </span>
                </div>
              </div>
            )}

            {/* Adresse client */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600">
                Adresse client
                {form.clientAdresse && <span className="ml-1.5 text-[9px] font-bold text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded-full">auto</span>}
              </label>
              <input value={form.clientAdresse ?? ""} onChange={e => setForm(f => ({ ...f, clientAdresse: e.target.value }))}
                placeholder="Rue, quartier, ville..."
                className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
            </div>

            {/* Notes */}
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label className="text-xs font-semibold text-slate-600">Notes BL</label>
              <textarea value={form.notesBL ?? ""} onChange={e => setForm(f => ({ ...f, notesBL: e.target.value }))}
                rows={2} placeholder="Instructions speciales, conditions de livraison..."
                className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none" />
            </div>
          </div>
          )}
        </div>

        {/* Section 2 — Import depuis preparation + Lignes articles */}
        {/* Import from BonPreparation validated */}
        {bonsPrep.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-bold text-amber-800">
                  {bonsPrep.length} bon{bonsPrep.length > 1 ? "s" : ""} de preparation valide{bonsPrep.length > 1 ? "s" : ""} disponible{bonsPrep.length > 1 ? "s" : ""}
                </p>
                <p className="text-xs text-amber-600 mt-0.5">Importez les quantites preparees directement avec possibilite de rectification</p>
              </div>
              <button
                onClick={() => setShowImport(!showImport)}
                className="flex items-center gap-2 px-3 py-2 bg-amber-600 text-white text-xs font-bold rounded-xl hover:bg-amber-700 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                {showImport ? "Fermer" : "Importer preparation"}
              </button>
            </div>
            {showImport && (
              <div className="mt-3 flex flex-col gap-2 max-h-48 overflow-y-auto">
                {bonsPrep.map(bon => (
                  <button key={bon.id}
                    onClick={() => importFromPrep(bon.id)}
                    className="flex items-center justify-between p-3 bg-white border border-amber-200 rounded-xl hover:bg-amber-50 transition-colors text-left">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{bon.nom}</p>
                      <p className="text-xs text-slate-500">{bon.date} — {bon.lignes.length} article(s) — {bon.clientIds.length} client(s)</p>
                    </div>
                    <span className="text-xs font-semibold text-amber-700 px-2 py-1 bg-amber-100 rounded-lg shrink-0">Importer</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <span className="w-5 h-5 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-black">2</span>
              Lignes articles ({lignes.length})
            </h3>
            <button onClick={addLigne}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-700 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              Ajouter ligne
            </button>
          </div>

          {lignes.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-slate-400">
              <svg className="w-8 h-8 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              <p className="text-sm font-medium">Aucune ligne — cliquez &quot;Ajouter ligne&quot;</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Article</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Unite</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Qte cmd</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Qte livree</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Prix/u (DH)</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">QC</th>
                    <th className="px-2 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {lignes.map(l => (
                    <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-2">
                        <select
                          value={l.articleId || ""}
                          onChange={e => selectArticleLigne(l.id, e.target.value)}
                          className="w-full min-w-[160px] px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400/30 bg-white">
                          <option value="">— Article —</option>
                          {articles.map(a => (
                            <option key={a.id} value={a.id}>{a.nom}{a.nomAr ? ` / ${a.nomAr}` : ""}</option>
                          ))}
                        </select>
                        {l.articleNomAr && (
                          <p className="text-[10px] text-slate-500 mt-0.5 font-arabic" dir="rtl" lang="ar">{l.articleNomAr}</p>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <select value={l.unite} onChange={e => updateLigne(l.id, "unite", e.target.value)}
                          className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none bg-white">
                          {["kg", "piece", "caisse", "sac"].map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min={0} step={0.1} value={l.qteCommande || ""}
                          onChange={e => updateLigne(l.id, "qteCommande", parseFloat(e.target.value) || 0)}
                          className="w-20 px-2 py-1.5 border border-slate-200 rounded-lg text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-400/30 bg-white" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min={0} step={0.1} value={l.qteLivree || ""}
                          onChange={e => updateLigne(l.id, "qteLivree", parseFloat(e.target.value) || 0)}
                          className={`w-20 px-2 py-1.5 border rounded-lg text-xs text-right font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400/30 ${
                            l.qteLivree < l.qteCommande && l.qteCommande > 0
                              ? "border-amber-300 bg-amber-50 text-amber-700"
                              : "border-slate-200 bg-white"
                          }`} />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min={0} step={0.01} value={l.prixUnit || ""}
                          onChange={e => updateLigne(l.id, "prixUnit", parseFloat(e.target.value) || 0)}
                          className="w-24 px-2 py-1.5 border border-slate-200 rounded-lg text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-400/30 bg-white" />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="font-bold text-slate-800 text-xs">{l.totalLigne.toFixed(2)}</span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button type="button" onClick={() => updateLigne(l.id, "qcOk", !l.qcOk)}
                          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                            l.qcOk ? "bg-emerald-500 border-emerald-500 text-white" : "border-red-400 bg-red-50 text-red-400"
                          }`}>
                          {l.qcOk
                            ? <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                            : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                          }
                        </button>
                      </td>
                      <td className="px-2 py-2">
                        <button onClick={() => removeLigne(l.id)}
                          className="p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Récap BL : valeur / tonnage / nb articles / estimation caisses */}
          {lignes.length > 0 && (() => {
            const qOf = (l: typeof lignes[number]) => l.qteLivree || l.qteCommande || 0
            const valeur = lignes.reduce((s, l) => s + (l.totalLigne || 0), 0)
            const tonnageKg = lignes.filter(l => l.unite === "kg").reduce((s, l) => s + qOf(l), 0)
            const nbArticles = lignes.length
            // Estimation caisses : caisse comptée directement, kg → /30kg, sac → 1/u
            const nbCaisses = lignes.reduce((s, l) => {
              const q = qOf(l)
              if (l.unite === "caisse") return s + Math.ceil(q)
              if (l.unite === "kg") return s + Math.ceil(q / 30)
              if (l.unite === "sac") return s + Math.ceil(q)
              return s
            }, 0)
            const cards = [
              { l: "Valeur marchandise", v: `${valeur.toLocaleString("fr-MA", { maximumFractionDigits: 2 })} DH`, c: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
              { l: "Tonnage", v: `${tonnageKg.toLocaleString("fr-MA", { maximumFractionDigits: 1 })} kg`, c: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
              { l: "Articles", v: String(nbArticles), c: "text-violet-700", bg: "bg-violet-50 border-violet-200" },
              { l: "Caisses (est.)", v: `≈ ${nbCaisses}`, c: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
            ]
            return (
              <div className="px-5 py-3 grid grid-cols-2 sm:grid-cols-4 gap-2 border-t border-slate-100 bg-white">
                {cards.map(k => (
                  <div key={k.l} className={`${k.bg} border rounded-xl px-3 py-2 text-center`}>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{k.l}</p>
                    <p className={`text-sm font-extrabold ${k.c} mt-0.5`}>{k.v}</p>
                  </div>
                ))}
              </div>
            )
          })()}

          {/* Totals + Frais rectifiables */}
          {lignes.length > 0 && (
            <div className="border-t border-slate-100 bg-slate-50">
              {/* Frais + TVA rectifiables */}
              <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 border-b border-slate-100">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">TVA (%)</label>
                  <input type="number" min={0} max={100} step={1}
                    value={form.tva ?? 20}
                    onChange={e => setForm(f => ({ ...f, tva: parseFloat(e.target.value) || 0 }))}
                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400/30" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Droit de timbre (DH)</label>
                  <input type="number" min={0} step={0.01}
                    value={(form as {droitTimbre?: number}).droitTimbre ?? ""}
                    onChange={e => setForm(f => ({ ...f, droitTimbre: parseFloat(e.target.value) || 0 } as typeof f))}
                    placeholder="0.00"
                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400/30" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Frais de service (DH)</label>
                  <input type="number" min={0} step={0.01}
                    value={(form as {fraisService?: number}).fraisService ?? ""}
                    onChange={e => setForm(f => ({ ...f, fraisService: parseFloat(e.target.value) || 0 } as typeof f))}
                    placeholder="0.00"
                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400/30" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Frais d&apos;impression (DH)</label>
                  <input type="number" min={0} step={0.01}
                    value={(form as {fraisImpression?: number}).fraisImpression ?? ""}
                    onChange={e => setForm(f => ({ ...f, fraisImpression: parseFloat(e.target.value) || 0 } as typeof f))}
                    placeholder="0.00"
                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400/30" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Autres impots/frais (DH)</label>
                  <input type="number" min={0} step={0.01}
                    value={(form as {autresFrais?: number}).autresFrais ?? ""}
                    onChange={e => setForm(f => ({ ...f, autresFrais: parseFloat(e.target.value) || 0 } as typeof f))}
                    placeholder="0.00"
                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400/30" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Libelle frais supp.</label>
                  <input type="text"
                    value={(form as {autresFraisLibelle?: string}).autresFraisLibelle ?? ""}
                    onChange={e => setForm(f => ({ ...f, autresFraisLibelle: e.target.value } as typeof f))}
                    placeholder="Frais transport..."
                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400/30" />
                </div>
              </div>
              {/* Grand totals */}
              <div className="flex flex-wrap justify-end gap-4 px-5 py-4">
                <div className="text-right">
                  <p className="text-xs text-slate-500 font-medium">Total HT</p>
                  <p className="font-bold text-slate-800">{(form.totalHT ?? 0).toFixed(2)} DH</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500 font-medium">TVA ({form.tva ?? 20}%)</p>
                  <p className="font-semibold text-slate-600">{((form.totalHT ?? 0) * (form.tva ?? 20) / 100).toFixed(2)} DH</p>
                </div>
                {((form as {droitTimbre?: number}).droitTimbre ?? 0) > 0 && (
                  <div className="text-right">
                    <p className="text-xs text-slate-500 font-medium">Droit timbre</p>
                    <p className="font-semibold text-slate-600">{((form as {droitTimbre?: number}).droitTimbre ?? 0).toFixed(2)} DH</p>
                  </div>
                )}
                {((form as {fraisService?: number}).fraisService ?? 0) > 0 && (
                  <div className="text-right">
                    <p className="text-xs text-slate-500 font-medium">Frais service</p>
                    <p className="font-semibold text-slate-600">{((form as {fraisService?: number}).fraisService ?? 0).toFixed(2)} DH</p>
                  </div>
                )}
                {((form as {fraisImpression?: number}).fraisImpression ?? 0) > 0 && (
                  <div className="text-right">
                    <p className="text-xs text-slate-500 font-medium">Frais impression</p>
                    <p className="font-semibold text-slate-600">{((form as {fraisImpression?: number}).fraisImpression ?? 0).toFixed(2)} DH</p>
                  </div>
                )}
                {((form as {autresFrais?: number}).autresFrais ?? 0) > 0 && (
                  <div className="text-right">
                    <p className="text-xs text-slate-500 font-medium">{(form as {autresFraisLibelle?: string}).autresFraisLibelle || "Autres frais"}</p>
                    <p className="font-semibold text-slate-600">{((form as {autresFrais?: number}).autresFrais ?? 0).toFixed(2)} DH</p>
                  </div>
                )}
                <div className="text-right bg-white rounded-xl px-4 py-2 border border-slate-200 shadow-sm">
                  <p className="text-xs text-slate-500 font-medium">Total TTC</p>
                  <p className="font-black text-blue-700 text-lg">
                    {(
                      (form.totalTTC ?? 0) +
                      ((form as {droitTimbre?: number}).droitTimbre ?? 0) +
                      ((form as {fraisService?: number}).fraisService ?? 0) +
                      ((form as {fraisImpression?: number}).fraisImpression ?? 0) +
                      ((form as {autresFrais?: number}).autresFrais ?? 0)
                    ).toFixed(2)} DH
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

type BLMainTab = "en_cours" | "historique"

// Roles allowed to transfer a BL to invoice
const FACTURE_ROLES = ["cash_man", "finance", "admin", "super_admin", "super_super_admin"]

// BL "en cours" = not yet delivered or cancelled
const EN_COURS_STATUTS: BLStatut[] = ["brouillon", "valide", "en_livraison", "retour_partiel"]
const HISTORIQUE_STATUTS: BLStatut[] = ["livre", "annule"]

export default function BOBonLivraison({ user }: { user: User }) {
  const [bls, setBLs] = useState<BonLivraison[]>(getBLs)
  const [editing, setEditing] = useState<Partial<BonLivraison> | null>(null)
  const [mainTab, setMainTab] = useState<BLMainTab>("en_cours")
  const [search, setSearch] = useState("")
  const [filterStatut, setFilterStatut] = useState<BLStatut | "">("")
  const [filterTrip, setFilterTrip] = useState("")
  const [filterClient, setFilterClient] = useState("")
  const [filterLivreur, setFilterLivreur] = useState("")
  const [sortMode, setSortMode] = useState<"date" | "alpha">("date")
  const [filterArticle, setFilterArticle] = useState("")
  const [showAdvFilters, setShowAdvFilters] = useState(false)
  const [showPrintSettings, setShowPrintSettings] = useState(false)
  const [showImportPrep, setShowImportPrep] = useState(false)
  const [importMode, setImportMode] = useState<"trip" | "client" | "article">("trip")
  const [importTripId, setImportTripId] = useState("")
  const [importClientId, setImportClientId] = useState("")
  const [importArticleId, setImportArticleId] = useState("")
  const [factureSuccess, setFactureSuccess] = useState<string | null>(null)
  // ── Facturation groupée (multi-BL + plage de dates) ────────────────────────
  const [showFactureGroup, setShowFactureGroup] = useState(false)
  const [factureFrom, setFactureFrom] = useState("")
  const [factureTo, setFactureTo] = useState("")
  const [selectedFacture, setSelectedFacture] = useState<Set<string>>(new Set())

  // ── Print customization ────────────────────────────────────────────────────
  // Pré-rempli depuis la fiche société (BO > Paramètres) au lieu de partir
  // vide — l'utilisateur n'a plus qu'à adapter ce qui diffère, pas tout
  // retaper depuis zéro (nom, adresse, tél, ICE, RC, IF, patente). Le logo
  // n'est PLUS personnalisable ici : source unique = fiche société, pour
  // éviter que deux logos différents cohabitent selon l'écran.
  const [printOpts, setPrintOpts] = useState<PrintBLOpts>(() => {
    let saved: PrintBLOpts = {}
    try { saved = JSON.parse(localStorage.getItem("fl_print_opts_bl") ?? "{}") } catch { /* noop */ }
    const cfg = store.getCompanyConfig()
    return {
      ...saved,
      nomSocieteOverride: saved.nomSocieteOverride || cfg.nom || "",
      adresseOverride:    saved.adresseOverride    || cfg.adresse || "",
      telOverride:        saved.telOverride        || cfg.telephone || "",
      iceOverride:        saved.iceOverride        || cfg.ice || "",
      rcOverride:         saved.rcOverride         || cfg.rc || "",
      ifOverride:         saved.ifOverride         || cfg.if_fiscal || "",
      patentOverride:     saved.patentOverride     || cfg.patente || "",
    }
  })
  const savePrintOpts = (opts: PrintBLOpts) => {
    setPrintOpts(opts)
    localStorage.setItem("fl_print_opts_bl", JSON.stringify(opts))
  }

  // ── Envoi BL (WhatsApp/Email) — popup de confirmation obligatoire ──────────
  interface PendingSend {
    bl: BonLivraison
    channel: "whatsapp" | "email"
    recipientLabel: string
    recipientName: string
    contact: string
  }
  const [pendingSend, setPendingSend] = useState<PendingSend | null>(null)
  const [sendingConfirm, setSendingConfirm] = useState(false)
  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const executeSend = async () => {
    if (!pendingSend) return
    setSendingConfirm(true)
    const { bl, channel, contact } = pendingSend
    const txt = buildBLWhatsAppText(bl.numero, bl.clientNom, new Date(bl.date).toLocaleDateString("fr-FR"),
      bl.lignes.map(l => ({ nom: l.articleNom, quantite: l.qteLivree, unite: l.unite, total: l.totalLigne })), bl.totalTTC, bl.clientModalitePaiement)
    if (channel === "whatsapp") {
      sendWhatsApp(contact, txt)
      setSendResult({ ok: true, msg: "WhatsApp ouvert — confirmez l'envoi dans l'application." })
    } else {
      const res = await sendEmail({ to_email: contact, subject: `Bon de livraison ${bl.numero}`, body: txt.replace(/\*/g, "") })
      setSendResult({ ok: res.ok, msg: res.ok ? "Email envoyé." : (res.error ?? "Échec de l'envoi email.") })
    }
    setSendingConfirm(false)
    setPendingSend(null)
    setTimeout(() => setSendResult(null), 4000)
  }

  const handlePrint = (bl: BonLivraison) => {
    const allClients = store.getClients()
    const client = allClients.find(c => c.id === bl.clientId || c.nom === bl.clientNom)
    const allArticles = store.getArticles()
    printBLFromBO({
      ...bl,
      clientIce:               bl.clientIce ?? client?.ice,
      clientModalitePaiement:  bl.clientModalitePaiement ?? (client?.modalitePaiement ?? ""),
      clientCreditSolde:       bl.clientCreditSolde ?? client?.creditSolde,
      clientCreditAutorise:    bl.clientCreditAutorise ?? client?.creditAutorise,
      // Enrichit chaque ligne avec l'UM (caisse/carton...) de l'article pour
      // le calcul "nombre d'UM" affiché à côté de la quantité livrée.
      lignes: bl.lignes.map(l => {
        const art = allArticles.find(a => a.id === l.articleId || a.nom === l.articleNom)
        return { ...l, um: art?.um, colisageParUM: art?.colisageParUM }
      }),
    }, printOpts, store.getCompanyConfig())
  }

  const qcObligatoire = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("fl_workflow_config") ?? "{}")?.qcObligatoireBL ?? false } catch { return false }
  }, [])

  useEffect(() => { setBLs(getBLs()) }, [])

  const canEdit = user.role === "super_super_admin" || user.role === "admin" || user.role === "super_admin" ||
    user.role === "resp_logistique" || user.role === "dispatcheur" || user.role === "magasinier" || user.role === "cash_man"
  const canFacture = FACTURE_ROLES.includes(user.role)

  // ── Bons de preparation valides, pas encore utilisés pour un BL ──────────
  // Exclut TOUT bon déjà lié à un BL existant, quel que soit son statut
  // (brouillon/valide/livré) — sinon un import groupé répété créerait un
  // second BL en double pour la même préparation (fausse les chiffres).
  const today = new Date().toISOString().split("T")[0]
  const bonsPrep = useMemo(() => {
    return store.getBonsPreparation().filter(b =>
      b.statut === "valide" &&
      !bls.some(bl => (bl as unknown as { prepId?: string }).prepId === b.id)
    )
  }, [bls])

  // Trips, clients, articles from validated bons de prep
  const prepTrips = useMemo(() => {
    const tripIds = [...new Set(bonsPrep.map(b => b.tripId).filter(Boolean))]
    return tripIds.map(tid => {
      const bon = bonsPrep.find(b => b.tripId === tid)!
      return { id: tid!, label: `Trip ${tid} — ${bon.clientIds?.length ?? 0} clients` }
    })
  }, [bonsPrep])

  const prepClients = useMemo(() => {
    const allClientIds = new Set<string>()
    bonsPrep.forEach(b => b.clientIds?.forEach(cid => allClientIds.add(cid)))
    const clients = store.getClients()
    return [...allClientIds].map(cid => {
      const c = clients.find(x => x.id === cid)
      return { id: cid, label: c?.nom ?? cid }
    }).sort((a, b) => a.label.localeCompare(b.label))
  }, [bonsPrep])

  const prepArticles = useMemo(() => {
    const artMap = new Map<string, string>()
    bonsPrep.forEach(b => b.lignes?.forEach(l => { if (l.articleId) artMap.set(l.articleId, l.articleNom) }))
    return [...artMap.entries()].map(([id, nom]) => ({ id, label: nom })).sort((a, b) => a.label.localeCompare(b.label))
  }, [bonsPrep])

  // ── Import depuis preparation ────────────────────────────────────────────
  const importFromPrep = () => {
    let matchBons = bonsPrep
    if (importMode === "trip" && importTripId)
      matchBons = bonsPrep.filter(b => b.tripId === importTripId)
    else if (importMode === "client" && importClientId)
      matchBons = bonsPrep.filter(b => b.clientIds?.includes(importClientId))
    else if (importMode === "article" && importArticleId)
      matchBons = bonsPrep.filter(b => b.lignes?.some(l => l.articleId === importArticleId))

    if (matchBons.length === 0) return

    const allBLs = getBLs()
    const newBLs: BonLivraison[] = []

    for (const bon of matchBons) {
      // Per-client BL if we have clientsInfo, otherwise one global BL
      const clientIds = importMode === "client" && importClientId
        ? [importClientId]
        : (bon.clientIds ?? [])

      const cmds = store.getCommandes()
      const storeClients = store.getClients()

      if (clientIds.length === 0) {
        // One BL for the whole prep bon
        const lignes: BLLigne[] = (bon.lignes ?? []).map(l => {
          const prixUnit = cmds.reduce((p, c) => {
            const cl = c.lignes.find(x => x.articleId === l.articleId); return cl ? cl.prixVente ?? cl.prixUnitaire ?? p : p
          }, 0)
          const qte = l.qtePrepared > 0 ? l.qtePrepared : l.qteCommandee
          return { id: genId(), articleId: l.articleId, articleNom: l.articleNom, articleNomAr: (l as unknown as { articleNomAr?: string }).articleNomAr, unite: l.unite, qteCommande: l.qteCommandee, qteLivree: qte, prixUnit, totalLigne: qte * prixUnit, qcOk: true }
        })
        const totalHT = lignes.reduce((s, l) => s + l.totalLigne, 0)
        const bl: BonLivraison = {
          id: genId(), numero: genNumero(), transporteur: "non_affecte",
          statut: "valide", date: today, lignes, totalHT, totalTTC: totalHT * 1.2, tva: 20,
          qcObligatoire, clientId: "", clientNom: bon.nom ?? "—",
          createdBy: user.id, updatedAt: new Date().toISOString(),
          notesBL: `Importe depuis Bon Prep: ${bon.nom}`,
        } as unknown as BonLivraison
        ;(bl as unknown as { prepId: string }).prepId = bon.id
        newBLs.push(bl)
      } else {
        for (const cid of clientIds) {
          // Anti-doublon: ne pas créer un 2e BL pour le même client/prep sauf si le BL existant est un retour_partiel
          const existsBL = allBLs.find(b =>
            b.clientId === cid && b.date === today && b.statut !== "annule" &&
            (b as unknown as { prepId?: string }).prepId === bon.id
          )
          if (existsBL && existsBL.statut !== "retour_partiel") continue
          const client = storeClients.find(c => c.id === cid)
          const clientCmds = cmds.filter(c => c.clientId === cid)
          let blLignes: BLLigne[]
          if (importMode === "article" && importArticleId) {
            blLignes = (bon.lignes ?? [])
              .filter(l => l.articleId === importArticleId)
              .map(l => {
                const prixUnit = clientCmds.reduce((p, c) => { const cl = c.lignes.find(x => x.articleId === l.articleId); return cl ? cl.prixVente ?? cl.prixUnitaire ?? p : p }, 0)
                const qte = l.qtePrepared > 0 ? l.qtePrepared : l.qteCommandee
                return { id: genId(), articleId: l.articleId, articleNom: l.articleNom, articleNomAr: (l as unknown as { articleNomAr?: string }).articleNomAr, unite: l.unite, qteCommande: l.qteCommandee, qteLivree: qte, prixUnit, totalLigne: qte * prixUnit, qcOk: true }
              })
          } else {
            // All lignes for this client
            const clientCmd = clientCmds.find(c => c.date === today) ?? clientCmds[0]
            blLignes = (bon.lignes ?? []).map(l => {
              const prixUnit = clientCmd?.lignes.find(x => x.articleId === l.articleId)?.prixVente ?? 0
              const qte = l.qtePrepared > 0 ? l.qtePrepared : l.qteCommandee
              return { id: genId(), articleId: l.articleId, articleNom: l.articleNom, articleNomAr: (l as unknown as { articleNomAr?: string }).articleNomAr, unite: l.unite, qteCommande: l.qteCommandee, qteLivree: qte, prixUnit, totalLigne: qte * prixUnit, qcOk: true }
            })
          }
          if (blLignes.length === 0) continue
          const totalHT = blLignes.reduce((s, l) => s + l.totalLigne, 0)
          const bl: BonLivraison = {
            id: genId(), numero: genNumero(), transporteur: "non_affecte",
            statut: "valide", date: today, lignes: blLignes, totalHT, totalTTC: totalHT * 1.2, tva: 20,
            qcObligatoire, clientId: cid, clientNom: client?.nom ?? cid,
            clientAdresse: client?.adresse, clientIce: client?.ice,
            clientModalitePaiement: client?.modalitePaiement,
            createdBy: user.id, updatedAt: new Date().toISOString(),
            notesBL: `Importe depuis Bon Prep: ${bon.nom}`,
          } as unknown as BonLivraison
          ;(bl as unknown as { prepId: string }).prepId = bon.id
          newBLs.push(bl)
        }
      }
    }

    if (newBLs.length === 0) return
    const updated = [...newBLs, ...allBLs]
    saveBLs(updated)
    store.saveBonsLivraison(updated as unknown as import("@/lib/store").BonLivraison[])
    setBLs(updated)
    setShowImportPrep(false)
    setMainTab("en_cours")
  }

  // ── Save / Delete / Validate ───────────────────────────────────────────────
  const handleSave = (bl: BonLivraison) => {
    const existing = bls.find(b => b.id === bl.id)
    const updated = existing ? bls.map(b => b.id === bl.id ? bl : b) : [bl, ...bls]
    saveBLs(updated)
    store.saveBonsLivraison(updated as unknown as import("@/lib/store").BonLivraison[])
    setBLs(updated)
    setEditing(null)

    // ── Propagation automatique statut → commande liée ──────────────────────
    if (bl.commandeId) {
      const statutMap: Partial<Record<BLStatut, string>> = {
        en_livraison: "charge",   // BL parti → commande "chargé"
        livre:        "livre",    // BL livré → commande "livré"
      }
      const newCmdStatut = statutMap[bl.statut]
      if (newCmdStatut) {
        const cmds = store.getCommandes()
        const updatedCmds = cmds.map(c =>
          c.id === bl.commandeId ? { ...c, statut: newCmdStatut as typeof c.statut } : c
        )
        store.saveCommandes(updatedCmds)
      }
    }
  }

  // Suppression BL — deux garde-fous obligatoires (jamais fausser les chiffres) :
  //  1. BL déjà livré (validé par le livreur) OU déjà facturé → suppression
  //     BLOQUÉE, la commande/facture réelle ne doit jamais perdre sa trace.
  //  2. Sinon, si un bon de préparation est lié, il doit être supprimé EN
  //     MÊME TEMPS (sinon il reste orphelin, prêt à régénérer un doublon de
  //     BL) — confirmation obligatoire avant cette suppression en cascade.
  const deleteBL = (id: string) => {
    const bl = bls.find(b => b.id === id)
    if (!bl) return
    const isFacture = (bl as unknown as { factureCreee?: boolean }).factureCreee
    if (bl.statut === "livre" || isFacture) {
      alert(`Impossible de supprimer ce BL : ${isFacture ? "il est déjà facturé" : "il est déjà livré (validé par le livreur)"}. Une suppression fausserait les chiffres réels.`)
      return
    }
    const prepId = (bl as unknown as { prepId?: string }).prepId
    const prep = prepId ? store.getBonsPreparation().find(p => p.id === prepId) : null
    const confirmMsg = prep
      ? `Supprimer ce BL supprimera AUSSI le bon de préparation lié ("${prep.nom ?? prep.id}") — sinon il resterait orphelin et pourrait régénérer un doublon de BL. Confirmer la suppression des deux ?`
      : "Confirmer la suppression de ce BL ?"
    if (!confirm(confirmMsg)) return

    const updated = bls.filter(b => b.id !== id)
    saveBLs(updated)
    store.saveBonsLivraison(updated as unknown as import("@/lib/store").BonLivraison[])
    fetch("/api/sync-write", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "fl_bons_livraison", deletes: [id] }),
    }).catch(e => console.error("[BOBonLivraison] delete sync error:", e))
    setBLs(updated)

    if (prep) {
      store.saveBonsPreparation(store.getBonsPreparation().filter(p => p.id !== prep.id))
      fetch("/api/sync-write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: "fl_bons_preparation", deletes: [prep.id] }),
      }).catch(e => console.error("[BOBonLivraison] delete prep sync error:", e))
    }
  }

  const validateBL = (id: string) => {
    const updated = bls.map(b => b.id === id
      ? { ...b, statut: "valide" as BLStatut, qcValidePar: user.name, qcValideAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      : b)
    saveBLs(updated)
    store.saveBonsLivraison(updated as unknown as import("@/lib/store").BonLivraison[])
    setBLs(updated)
  }

  // ── Transfert BL -> Facture (cash_man / finance only, statut = livre) ──────
  const transferToFacture = (bl: BonLivraison) => {
    if (!canFacture || bl.statut !== "livre") return
    // Build a clean display numero for the facture
    const rawNum = bl.numero ?? bl.id.slice(-6).toUpperCase()
    const cleanNum = rawNum.replace(/^(BL[-_])+/i, "")
    const factureNumero = `Facture N° ${cleanNum}`
    const blSource = `Bon de livraison ${cleanNum}`
    // Mark BL as facture in BL record
    const updated = bls.map(b => b.id === bl.id
      ? {
          ...b,
          factureCreee: true,
          factureCreeeAt: new Date().toISOString(),
          factureCreeeBy: user.name,
          factureNumero,
          blSource,
          updatedAt: new Date().toISOString(),
        } as unknown as BonLivraison
      : b)
    saveBLs(updated)
    store.saveBonsLivraison(updated as unknown as import("@/lib/store").BonLivraison[])
    setBLs(updated)
    setFactureSuccess(`${factureNumero} créée — source: ${blSource}`)
    setTimeout(() => setFactureSuccess(null), 4000)
  }

  // ── Facturation groupée : transfert de PLUSIEURS BL en facture d'un coup ────
  const transferManyToFacture = (ids: string[]) => {
    if (!canFacture || ids.length === 0) return
    const idSet = new Set(ids)
    const now = new Date().toISOString()
    let n = 0
    const updated = bls.map(b => {
      if (!idSet.has(b.id) || b.statut !== "livre" || (b as unknown as { factureCreee?: boolean }).factureCreee) return b
      n++
      const cleanNum = (b.numero ?? b.id.slice(-6).toUpperCase()).replace(/^(BL[-_])+/i, "")
      return {
        ...b,
        factureCreee: true,
        factureCreeeAt: now,
        factureCreeeBy: user.name,
        factureNumero: `Facture N° ${cleanNum}`,
        blSource: `Bon de livraison ${cleanNum}`,
        updatedAt: now,
      } as unknown as BonLivraison
    })
    if (n === 0) { setFactureSuccess("Aucun BL éligible dans la sélection (déjà facturé ou non livré)."); setTimeout(() => setFactureSuccess(null), 4000); return }
    saveBLs(updated)
    store.saveBonsLivraison(updated as unknown as import("@/lib/store").BonLivraison[])
    setBLs(updated)
    setSelectedFacture(new Set())
    setFactureSuccess(`✅ ${n} facture(s) créée(s) à partir des BL sélectionnés.`)
    setTimeout(() => setFactureSuccess(null), 5000)
  }

  // BL éligibles à la facturation groupée : livrés, non encore facturés, dans la plage
  const facturables = useMemo(() => {
    return bls.filter(b => {
      if (b.statut !== "livre" || (b as unknown as { factureCreee?: boolean }).factureCreee) return false
      const d = String(b.date ?? "").slice(0, 10)
      if (factureFrom && d < factureFrom) return false
      if (factureTo && d > factureTo) return false
      return true
    }).sort((a, b) => String(a.date).localeCompare(String(b.date)))
  }, [bls, factureFrom, factureTo])

  const toggleFactureSel = (id: string) => {
    setSelectedFacture(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  const selectAllFacturables = () => setSelectedFacture(new Set(facturables.map(b => b.id)))
  const clearFactureSel = () => setSelectedFacture(new Set())
  const selectedFactureList = useMemo(() => facturables.filter(b => selectedFacture.has(b.id)), [facturables, selectedFacture])
  const selectedFactureTotal = useMemo(() => selectedFactureList.reduce((s, b) => s + (Number(b.totalTTC) || 0), 0), [selectedFactureList])

  // ── Filtering ─────────────────────────────────────────────────────────────
  const allClients = useMemo(() => [...new Set(bls.map(b => b.clientNom).filter(Boolean))].sort(), [bls])
  const allLivreurs = useMemo(() => [...new Set(bls.map(b => b.livreurNom).filter(Boolean))].sort(), [bls])
  const allTrips = useMemo(() => [...new Set(bls.map(b => (b as unknown as { tripId?: string }).tripId ?? "").filter(Boolean))].sort(), [bls])
  const allArticles = useMemo(() => { const s = new Set<string>(); bls.forEach(b => b.lignes.forEach(l => l.articleNom && s.add(l.articleNom))); return [...s].sort() }, [bls])

  const applyFilters = (list: BonLivraison[]) => list.filter(b => {
    const q = search.toLowerCase()
    return (!q || (b.clientNom ?? "").toLowerCase().includes(q) || (b.numero ?? "").toLowerCase().includes(q) || (b.livreurNom ?? "").toLowerCase().includes(q)) &&
      (!filterStatut || b.statut === filterStatut) &&
      (!filterClient || b.clientNom === filterClient) &&
      (!filterLivreur || b.livreurNom === filterLivreur) &&
      (!filterTrip || (b as unknown as { tripId?: string }).tripId === filterTrip) &&
      (!filterArticle || (b.lignes ?? []).some(l => l.articleNom === filterArticle))
  }).sort((a, b) => sortMode === "alpha"
    ? (a.clientNom ?? "").localeCompare(b.clientNom ?? "", "fr")
    : String(b.date ?? "").localeCompare(String(a.date ?? "")))

  // Isolation par équipe : `bls` reste la liste complète (base des sauvegardes
  // via saveBLs) — on ne filtre que la dérivation affichée, ici.
  const visibleClientIds = useMemo(() => new Set(store.getVisibleClients().map(c => c.id)), [])
  const blsVisibles = useMemo(() => bls.filter(b => !b.clientId || visibleClientIds.has(b.clientId)), [bls, visibleClientIds])

  const enCours   = useMemo(() => applyFilters(blsVisibles.filter(b => EN_COURS_STATUTS.includes(b.statut))), [blsVisibles, search, filterStatut, filterClient, filterLivreur, filterTrip, filterArticle])
  const historique = useMemo(() => applyFilters(blsVisibles.filter(b => HISTORIQUE_STATUTS.includes(b.statut))), [blsVisibles, search, filterStatut, filterClient, filterLivreur, filterTrip, filterArticle])
  const displayed  = mainTab === "en_cours" ? enCours : historique

  const totalTTC  = blsVisibles.reduce((s, b) => s + b.totalTTC, 0)
  const nbLivre   = bls.filter(b => b.statut === "livre").length
  const nbEnCours = bls.filter(b => b.statut === "en_livraison").length

  if (editing !== null) {
    return <BLEditor bl={editing} onSave={handleSave} onCancel={() => setEditing(null)} currentUser={user} qcObligatoire={qcObligatoire} />
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 min-h-screen">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Bons de Livraison</h1>
            <p className="text-sm text-slate-500 mt-0.5">Edition, suivi, transfert en facture</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setShowPrintSettings(s => !s)}
              className={`flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-xl border transition-colors ${showPrintSettings ? "bg-amber-50 border-amber-300 text-amber-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Impression
            </button>
            {canFacture && (
              <button
                onClick={() => { setShowFactureGroup(s => !s); setMainTab("historique") }}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-xl border transition-colors ${showFactureGroup ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
                </svg>
                Facturation groupée
              </button>
            )}
            {canEdit && (
              <button
                onClick={() => setShowImportPrep(s => !s)}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-xl border transition-colors ${showImportPrep ? "bg-violet-50 border-violet-300 text-violet-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 12V4m0 0L8 8m4-4l4 4" />
                </svg>
                Depuis preparation
                {bonsPrep.length > 0 && (
                  <span className="w-5 h-5 bg-violet-600 text-white rounded-full text-[10px] font-black flex items-center justify-center">{bonsPrep.length}</span>
                )}
              </button>
            )}
            {canEdit && (
              <button onClick={() => setEditing({})}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Nouveau BL
              </button>
            )}
          </div>
        </div>

        {/* Facture success toast */}
        {factureSuccess && (
          <div className="mt-3 flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm font-semibold">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {factureSuccess}
          </div>
        )}

        {/* ── Panel import depuis preparation ────────────────────────────── */}
        {showImportPrep && (
          <div className="mt-4 p-4 bg-violet-50 border border-violet-200 rounded-2xl">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-black text-violet-800">Alimenter BL depuis les preparations du jour</p>
              <span className="text-xs text-violet-600 bg-violet-100 px-2 py-0.5 rounded-full font-semibold">
                {bonsPrep.length} bon{bonsPrep.length !== 1 ? "s" : ""} disponible{bonsPrep.length !== 1 ? "s" : ""}
              </span>
            </div>
            {bonsPrep.length === 0 ? (
              <p className="text-sm text-violet-600 font-medium py-2">
                Aucun bon de preparation valide disponible (deja tous livres ou aucun cree aujourd&apos;hui).
              </p>
            ) : (
              <>
                {/* Mode de selection */}
                <div className="flex gap-2 mb-4 flex-wrap">
                  {([
                    ["trip",    "Par Trip",    "M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z"],
                    ["client",  "Par Client",  "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"],
                    ["article", "Par Article", "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"],
                  ] as [typeof importMode, string, string][]).map(([mode, label, path]) => (
                    <button key={mode} onClick={() => setImportMode(mode)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border transition-all ${importMode === mode ? "bg-violet-600 text-white border-violet-600 shadow-sm" : "bg-white border-violet-200 text-violet-700 hover:border-violet-400"}`}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
                      </svg>
                      {label}
                    </button>
                  ))}
                </div>

                {/* Selection selon mode */}
                {importMode === "trip" && (
                  <div className="flex flex-col gap-1 mb-3">
                    <label className="text-xs font-bold text-violet-700">Selectionner un Trip</label>
                    <select value={importTripId} onChange={e => setImportTripId(e.target.value)}
                      className="px-3 py-2 text-sm border border-violet-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-violet-400/30">
                      <option value="">-- Tous les trips disponibles --</option>
                      {prepTrips.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                    {prepTrips.length === 0 && <p className="text-xs text-violet-500 mt-1">Aucun trip dans les bons de preparation.</p>}
                  </div>
                )}
                {importMode === "client" && (
                  <div className="flex flex-col gap-1 mb-3">
                    <label className="text-xs font-bold text-violet-700">Selectionner un Client</label>
                    <select value={importClientId} onChange={e => setImportClientId(e.target.value)}
                      className="px-3 py-2 text-sm border border-violet-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-violet-400/30">
                      <option value="">-- Choisir un client --</option>
                      {prepClients.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </div>
                )}
                {importMode === "article" && (
                  <div className="flex flex-col gap-1 mb-3">
                    <label className="text-xs font-bold text-violet-700">Selectionner un Article</label>
                    <select value={importArticleId} onChange={e => setImportArticleId(e.target.value)}
                      className="px-3 py-2 text-sm border border-violet-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-violet-400/30">
                      <option value="">-- Choisir un article --</option>
                      {prepArticles.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                    </select>
                  </div>
                )}

                {/* Liste des bons de prep disponibles */}
                <div className="flex flex-col gap-2 max-h-48 overflow-y-auto mb-3">
                  {bonsPrep.map(bon => (
                    <div key={bon.id} className="flex items-center gap-3 px-3 py-2 bg-white rounded-xl border border-violet-100">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-700 truncate">{bon.nom}</p>
                        <p className="text-[10px] text-slate-500">{bon.clientIds?.length ?? 0} clients — {bon.lignes?.length ?? 0} articles</p>
                      </div>
                      <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">Valide</span>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <button onClick={importFromPrep}
                    className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white text-sm font-bold rounded-xl hover:bg-violet-700 transition-colors shadow-sm">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 12V4m0 0L8 8m4-4l4 4" />
                    </svg>
                    Generer les BLs
                  </button>
                  <button onClick={() => setShowImportPrep(false)}
                    className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 rounded-xl transition-colors">
                    Annuler
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Print settings */}
        {showPrintSettings && (
          <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
            <p className="text-xs font-black text-amber-800 uppercase tracking-wide mb-3">Personnalisation du modele d&apos;impression BL</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {([
                ["nomSocieteOverride",  "Nom societe",          "FreshLink Pro"],
                ["adresseOverride",     "Adresse",              "Rue, Ville"],
                ["telOverride",         "Telephone",            "0522..."],
                ["iceOverride",         "ICE societe",          "001..."],
                ["rcOverride",          "RC",                   "12345"],
                ["ifOverride",          "IF (Identif. Fiscal)", "45678901"],
                ["patentOverride",      "Numero patente",       "..."],
              ] as [keyof PrintBLOpts, string, string][]).map(([key, label, ph]) => (
                <div key={key} className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">{label}</label>
                  <input value={(printOpts[key] as string | undefined) ?? ""} onChange={e => savePrintOpts({ ...printOpts, [key]: e.target.value })}
                    placeholder={ph} className="px-2.5 py-1.5 border border-amber-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/30" />
                </div>
              ))}
              <p className="col-span-2 sm:col-span-3 lg:col-span-4 text-[10px] text-amber-600">
                Le logo n&apos;est plus personnalisable ici — il vient toujours de la fiche société (BO &gt; Paramètres), pour éviter deux logos différents.
              </p>
              <div className="flex flex-col gap-1 col-span-2 sm:col-span-3 lg:col-span-4">
                <label className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">Pied de page</label>
                <input value={printOpts.piedDePageOverride ?? ""} onChange={e => savePrintOpts({ ...printOpts, piedDePageOverride: e.target.value })}
                  placeholder="Capital DH — RC — IF — ICE — Patente" className="px-2.5 py-1.5 border border-amber-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/30" />
              </div>
              {/* Type de document + mentions légales */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">Type de document</label>
                <select value={printOpts.docType ?? "bl"} onChange={e => savePrintOpts({ ...printOpts, docType: e.target.value as "bl" | "facture" })}
                  className="px-2.5 py-1.5 border border-amber-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/30">
                  <option value="bl">Bon de Livraison</option>
                  <option value="facture">Facture</option>
                </select>
              </div>
              <label className="flex items-center gap-2 col-span-2 cursor-pointer mt-4">
                <input type="checkbox" checked={printOpts.showLegal !== false}
                  onChange={e => savePrintOpts({ ...printOpts, showLegal: e.target.checked })}
                  className="w-4 h-4 accent-amber-500" />
                <span className="text-xs font-bold text-amber-800">Afficher les mentions légales (société + client)</span>
              </label>
              {/* Cases granulaires ICE / IF / RC (BL et Facture) */}
              {printOpts.showLegal !== false && (
                <div className="col-span-2 flex flex-wrap gap-4 pl-6">
                  {([["showICE", "ICE"], ["showIF", "IF"], ["showRC", "RC"]] as [keyof PrintBLOpts, string][]).map(([key, lbl]) => (
                    <label key={key} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={printOpts[key] !== false}
                        onChange={e => savePrintOpts({ ...printOpts, [key]: e.target.checked })}
                        className="w-3.5 h-3.5 accent-amber-500" />
                      <span className="text-[11px] font-semibold text-amber-700">Afficher {lbl}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <p className="text-[10px] text-amber-600 mt-2">Ce choix s&apos;applique à l&apos;impression et au téléchargement (BL ou Facture, avec ou sans identifiants légaux).</p>
          </div>
        )}

        {/* ── Panneau Facturation groupée (multi-BL + plage de dates) ───────── */}
        {showFactureGroup && canFacture && (
          <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <div>
                <p className="text-sm font-black text-emerald-800">Facturation groupée — sélectionnez plusieurs BL livrés sur une plage de dates</p>
                <p className="text-xs text-emerald-600 mt-0.5">Seuls les BL <strong>livrés</strong> et <strong>non encore facturés</strong> sont éligibles.</p>
              </div>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full">{facturables.length} BL éligible{facturables.length !== 1 ? "s" : ""}</span>
            </div>

            {/* Plage de dates */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">Du (date BL)</label>
                <input type="date" value={factureFrom} onChange={e => setFactureFrom(e.target.value)}
                  className="px-3 py-2 text-sm border border-emerald-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400/30" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">Au (date BL)</label>
                <input type="date" value={factureTo} onChange={e => setFactureTo(e.target.value)}
                  className="px-3 py-2 text-sm border border-emerald-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400/30" />
              </div>
              <div className="flex items-end gap-2 col-span-2">
                <button onClick={selectAllFacturables}
                  className="flex-1 px-3 py-2 text-xs font-bold text-emerald-700 bg-white border border-emerald-300 rounded-xl hover:bg-emerald-100 transition-colors">
                  Tout sélectionner ({facturables.length})
                </button>
                <button onClick={clearFactureSel}
                  className="px-3 py-2 text-xs font-semibold text-slate-500 hover:text-red-500 bg-white border border-slate-200 rounded-xl transition-colors">
                  Vider
                </button>
              </div>
            </div>
            {(factureFrom || factureTo) && (
              <button onClick={() => { setFactureFrom(""); setFactureTo("") }}
                className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-800 mb-2">↺ Réinitialiser la plage de dates</button>
            )}

            {/* Liste BL éligibles avec cases à cocher */}
            <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto mb-3">
              {facturables.length === 0 ? (
                <p className="text-sm text-emerald-600 font-medium py-3 text-center">Aucun BL livré non facturé sur cette plage.</p>
              ) : facturables.map(b => {
                const checked = selectedFacture.has(b.id)
                const cleanNum = (b.numero ?? b.id.slice(-6).toUpperCase()).replace(/^(BL[-_])+/i, "")
                return (
                  <label key={b.id}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl border cursor-pointer transition-colors ${checked ? "bg-emerald-100 border-emerald-300" : "bg-white border-emerald-100 hover:border-emerald-300"}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggleFactureSel(b.id)} className="w-4 h-4 accent-emerald-600" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-700 truncate">BL N° {cleanNum} — {b.clientNom}</p>
                      <p className="text-[10px] text-slate-500">{new Date(b.date).toLocaleDateString("fr-FR")} · {b.lignes.length} article(s) · {b.livreurNom ?? "—"}</p>
                    </div>
                    <span className="text-xs font-bold text-slate-700 shrink-0">{(Number(b.totalTTC) || 0).toFixed(2)} DH</span>
                  </label>
                )
              })}
            </div>

            {/* Récap + action */}
            <div className="flex items-center justify-between gap-3 flex-wrap border-t border-emerald-200 pt-3">
              <div className="text-sm text-emerald-800">
                <strong>{selectedFacture.size}</strong> BL sélectionné{selectedFacture.size !== 1 ? "s" : ""} —
                Total TTC : <strong>{selectedFactureTotal.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DH</strong>
              </div>
              <button onClick={() => transferManyToFacture([...selectedFacture])} disabled={selectedFacture.size === 0}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-40">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
                </svg>
                Facturer la sélection ({selectedFacture.size})
              </button>
            </div>
          </div>
        )}

        {/* KPIs */}
        <div className="flex gap-3 mt-4 flex-wrap">
          {[
            { label: "Total BL", val: bls.length, col: "bg-slate-50 border-slate-200 text-slate-700" },
            { label: "En livraison", val: nbEnCours, col: "bg-amber-50 border-amber-200 text-amber-700" },
            { label: "Livres", val: nbLivre, col: "bg-emerald-50 border-emerald-200 text-emerald-700" },
            { label: "CA TTC", val: `${totalTTC.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DH`, col: "bg-blue-50 border-blue-200 text-blue-700" },
          ].map(k => (
            <div key={k.label} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${k.col}`}>
              <span className="text-base font-black">{k.val}</span>
              <span className="text-xs font-medium opacity-70">{k.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tabs En cours / Historique ─────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-6 pt-3">
        <div className="flex gap-0">
          {([
            ["en_cours",   `En cours (${enCours.length})`,    "Brouillon, valide, en livraison"],
            ["historique", `Historique (${historique.length})`, "Livre, annule"],
          ] as [BLMainTab, string, string][]).map(([tab, label, sub]) => (
            <button key={tab} onClick={() => setMainTab(tab)}
              className={`flex flex-col items-start px-4 py-2.5 text-sm font-bold border-b-2 transition-colors mr-2 ${mainTab === tab ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
              {label}
              <span className="text-[10px] font-normal text-slate-400 mt-0.5">{sub}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="px-6 py-3 bg-white border-b border-slate-100">
        <div className="flex gap-3 flex-wrap items-center">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher BL, client, livreur..."
            className="flex-1 min-w-[200px] px-3 py-2 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
          <select value={filterStatut} onChange={e => setFilterStatut(e.target.value as BLStatut | "")}
            className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
            <option value="">Tous statuts</option>
            {Object.entries(STATUT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
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
          <button onClick={() => setShowAdvFilters(f => !f)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-xl border transition-colors ${showAdvFilters || filterTrip || filterClient || filterLivreur || filterArticle ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
            Filtres avances
            {(filterTrip || filterClient || filterLivreur || filterArticle) && (
              <span className="ml-1 w-5 h-5 bg-white text-blue-600 rounded-full text-[10px] font-black flex items-center justify-center">
                {[filterTrip, filterClient, filterLivreur, filterArticle].filter(Boolean).length}
              </span>
            )}
          </button>
          {(filterTrip || filterClient || filterLivreur || filterArticle) && (
            <button onClick={() => { setFilterTrip(""); setFilterClient(""); setFilterLivreur(""); setFilterArticle("") }}
              className="px-3 py-2 text-xs font-semibold text-slate-500 hover:text-red-500 transition-colors">
              Effacer filtres
            </button>
          )}
        </div>
        {showAdvFilters && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Par Trip",    val: filterTrip,    set: setFilterTrip,    opts: allTrips },
              { label: "Par Client",  val: filterClient,  set: setFilterClient,  opts: allClients },
              { label: "Par Livreur", val: filterLivreur, set: setFilterLivreur, opts: allLivreurs },
              { label: "Par Article", val: filterArticle, set: setFilterArticle, opts: allArticles },
            ].map(f => (
              <div key={f.label} className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{f.label}</label>
                <select value={f.val} onChange={e => f.set(e.target.value)}
                  className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
                  <option value="">Tous</option>
                  {f.opts.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto px-4 py-4">
        {displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
            <svg className="w-12 h-12 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm font-semibold">
              {mainTab === "en_cours" ? "Aucun BL en cours" : "Aucun BL dans l'historique"}
            </p>
            {mainTab === "en_cours" && canEdit && bonsPrep.length > 0 && (
              <button onClick={() => setShowImportPrep(true)}
                className="mt-1 flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 transition-colors">
                Importer depuis preparation ({bonsPrep.length})
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {["Numero", "Client", "Date", "Livreur", "Articles", "Total TTC", "Statut", "QC",
                      ...(mainTab === "historique" ? ["Facture"] : []),
                      "Actions"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayed.map(bl => {
                    const isFacture = (bl as unknown as { factureCreee?: boolean }).factureCreee
                    return (
                    <tr key={bl.id} className={`hover:bg-slate-50 transition-colors ${isFacture ? "bg-emerald-50/30" : ""}`}>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-bold text-slate-700">
                          {/* Affichage: "Bon de livraison N° 26042" au lieu de "BL-BL-26042" */}
                          {bl.numero
                            ? `BL N° ${bl.numero.replace(/^BL[-_]/i, "").replace(/^BL[-_]/i, "")}`
                            : `BL N° ${bl.id.slice(-6).toUpperCase()}`}
                        </span>
                        {(bl as unknown as { prepId?: string }).prepId && (
                          <span className="block text-[9px] text-violet-500 font-semibold mt-0.5">Depuis prep.</span>
                        )}
                        {/* Numéro(s) de commande d'origine — obligatoire, même en cas de regroupement */}
                        {(bl.commandeIds?.length ? bl.commandeIds : bl.commandeId ? [bl.commandeId] : []).length > 0 && (
                          <span className="block text-[9px] text-slate-400 font-mono mt-0.5">
                            Cmd: {(bl.commandeIds?.length ? bl.commandeIds : [bl.commandeId]).join(", ")}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-800 text-sm">{bl.clientNom}</span>
                        {bl.clientAdresse && <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[120px]">{bl.clientAdresse}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {new Date(bl.date).toLocaleDateString("fr-FR")}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">{bl.livreurNom ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 text-center font-semibold">{bl.lignes.length}</td>
                      <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap text-sm">
                        {bl.totalTTC.toFixed(2)} DH
                      </td>
                      <td className="px-4 py-3"><StatutBadge statut={bl.statut} /></td>
                      <td className="px-4 py-3 text-center">
                        {bl.qcObligatoire
                          ? bl.qcValidePar
                            ? <span className="text-xs text-emerald-600 font-semibold">OK</span>
                            : <span className="text-xs text-amber-600 font-semibold">Attente</span>
                          : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      {/* Facture column — historique only */}
                      {mainTab === "historique" && (
                        <td className="px-4 py-3">
                          {isFacture ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              Facture
                            </span>
                          ) : bl.statut === "livre" && canFacture ? (
                            <button onClick={() => transferToFacture(bl)}
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100 px-2 py-1 rounded-full transition-colors">
                              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
                              </svg>
                              En facture
                            </button>
                          ) : bl.statut === "livre" ? (
                            <span className="text-[10px] text-slate-400 font-medium">Non autorise</span>
                          ) : (
                            <span className="text-[10px] text-slate-300">—</span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex gap-1 flex-wrap items-center">
                          {/* Imprimer */}
                          <button onClick={() => handlePrint(bl)} title="Imprimer"
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                            </svg>
                          </button>
                          {/* Telecharger */}
                          <button onClick={() => {
                            const c = store.getClients().find(c => c.id === bl.clientId || c.nom === bl.clientNom)
                            downloadBLFromBO({ ...bl, clientIce: bl.clientIce ?? c?.ice, clientModalitePaiement: bl.clientModalitePaiement ?? (c?.modalitePaiement ?? ""), clientCreditSolde: bl.clientCreditSolde ?? c?.creditSolde, clientCreditAutorise: bl.clientCreditAutorise ?? c?.creditAutorise }, printOpts, store.getCompanyConfig())
                          }} title="Telecharger"
                            className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors border border-blue-200">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          </button>
                          {/* WhatsApp livreur */}
                          {bl.livreurNom && (() => {
                            const lu = store.getUsers().find(u => u.role === "livreur" && (u.name === bl.livreurNom || u.id === bl.livreurId))
                            const ph = lu?.telephone ?? lu?.phone ?? ""
                            if (!ph) return null
                            return (
                              <button onClick={() => setPendingSend({ bl, channel: "whatsapp", recipientLabel: "Livreur", recipientName: bl.livreurNom!, contact: ph })}
                                title={`WhatsApp livreur (${bl.livreurNom})`}
                                className="p-1.5 text-green-600 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors border border-green-200">
                                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                              </button>
                            )
                          })()}
                          {/* WhatsApp client */}
                          {(() => {
                            const c = store.getClients().find(c => c.id === bl.clientId || c.nom === bl.clientNom)
                            if (!c?.telephone) return null
                            return (
                              <button onClick={() => setPendingSend({ bl, channel: "whatsapp", recipientLabel: "Client", recipientName: bl.clientNom, contact: c.telephone! })}
                                title={`WhatsApp client`}
                                className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors border border-emerald-200">
                                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                              </button>
                            )
                          })()}
                          {/* Email client */}
                          {(() => {
                            const c = store.getClients().find(c => c.id === bl.clientId || c.nom === bl.clientNom)
                            if (!c?.email) return null
                            return (
                              <button onClick={() => setPendingSend({ bl, channel: "email", recipientLabel: "Client", recipientName: bl.clientNom, contact: c.email! })}
                                title="Email client"
                                className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors border border-blue-200">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                              </button>
                            )
                          })()}
                          {canEdit && mainTab === "en_cours" && (
                            <button onClick={() => setEditing(bl)} title="Modifier"
                              className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          )}
                          {canEdit && bl.statut === "brouillon" && (
                            <button onClick={() => validateBL(bl.id)} title="Valider"
                              className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            </button>
                          )}
                          {canEdit && mainTab === "en_cours" && (
                            <button onClick={() => deleteBL(bl.id)} title="Supprimer"
                              className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Popup de confirmation obligatoire avant tout envoi WhatsApp/Email ── */}
      {pendingSend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !sendingConfirm && setPendingSend(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5 flex flex-col gap-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-slate-800">
              Confirmer l&apos;envoi {pendingSend.channel === "whatsapp" ? "WhatsApp" : "Email"}
            </h3>
            <div className="text-xs text-slate-600 bg-slate-50 rounded-xl p-3 flex flex-col gap-1">
              <p><span className="text-slate-400">Document :</span> <strong>BL {pendingSend.bl.numero}</strong></p>
              <p><span className="text-slate-400">Destinataire :</span> <strong>{pendingSend.recipientLabel} — {pendingSend.recipientName}</strong></p>
              <p><span className="text-slate-400">Coordonnées :</span> <strong>{pendingSend.contact}</strong></p>
            </div>
            <div className="flex gap-2 mt-1">
              <button onClick={executeSend} disabled={sendingConfirm}
                className="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors disabled:opacity-60">
                {sendingConfirm ? "Envoi…" : "Confirmer l'envoi"}
              </button>
              <button onClick={() => setPendingSend(null)} disabled={sendingConfirm}
                className="flex-1 py-2 rounded-xl text-xs font-semibold border border-border hover:bg-muted transition-colors">
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
      {sendResult && (
        <div className={`fixed bottom-4 right-4 z-50 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-lg ${sendResult.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
          {sendResult.ok ? "✓ " : "✗ "}{sendResult.msg}
        </div>
      )}
    </div>
  )
}
