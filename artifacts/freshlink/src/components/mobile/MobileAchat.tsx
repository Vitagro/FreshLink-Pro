"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { store, type Article, type LigneAchat, type User, type Fournisseur, type HistoriquePrixAchat, type Client, type TypeCaisse, type CaisseEtrangere, TYPES_CAISSE_LABELS, FOURNISSEUR_TYPE_LABELS, paDeviationConfirmMessage } from "@/lib/store"
import { sendEmail, buildAchatEmail } from "@/lib/email"
import ArticleCombobox from "@/components/ui/ArticleCombobox"
import { CameraQualiteIA, ComparatifFournisseurs, NouveauFournisseurModal } from "@/components/mobile/AchatIAModules"

interface Props { user: User }

// Two calculation modes:
// "unit"  → qty × PA unitaire = total (classic)
// "total" → total payé ÷ qty = PA unitaire (deduced from total amount paid)
type CalcMode = "unit" | "total"

interface LigneForm {
  articleId: string
  // UM selector: "base" = article.unite, or the UM label (e.g. "Caisse")
  uniteMode: string
  quantite: string    // count in chosen unit
  prixAchat: string   // PA per BASE unit (always DH/kg or DH/pce...)
  totalPaye: string   // total amount paid — used when calcMode === "total"
  calcMode: CalcMode
}

const EMPTY_LIGNE = (): LigneForm => ({
  articleId: "", uniteMode: "base", quantite: "", prixAchat: "", totalPaye: "", calcMode: "unit"
})

// Resolve base-unit PA from a ligne — returns NaN if not enough info
function resolvePA(l: LigneForm): number {
  if (l.calcMode === "total") {
    const qty = Number(l.quantite)
    const total = Number(l.totalPaye)
    if (qty > 0 && total > 0) return total / qty
    return NaN
  }
  return Number(l.prixAchat)
}

// Resolve base-unit quantity from a ligne
function resolveQty(l: LigneForm, art?: Article): number {
  const raw = Number(l.quantite)
  if (!art || !art.um || !art.colisageParUM || l.uniteMode === "base") return raw
  // UM mode: convert to base units
  return raw * art.colisageParUM
}

// ── Besoin achat par SKU ─────────────────────────────────────────────────────
interface BesoinSKU {
  articleId: string
  articleNom: string
  unite: string
  stockDispo: number
  qteCommandee: number    // sum of validated orders for today
  besoinNet: number       // qteCommandee - stockDispo: >0 = DA required, <=0 = RAS
  dernierPrixAchat: number
  totalEstime: number     // besoinNet * dernierPrixAchat (0 when covered)
  lancerDA: boolean       // true when besoinNet > 0 → must create Purchase Order
}

// Exclut les articles désactivés globalement (BOArticles → actif=false) —
// souvent d'anciens doublons de catalogue jamais supprimés. Mobile Commercial
// les filtre déjà (allArticlesDedup) ; Mobile Achat ne le faisait pas encore,
// d'où des doublons visibles côté acheteur (ex: "Abricot beldi 10kg" en
// double) alors qu'un seul apparaissait côté prévendeur.
function onlyActiveArticles(list: Article[]): Article[] {
  return list.filter(a => a.actif !== false)
}

// Computes DA table:
//   besoinNet = qteCommandee - stockDispo
//   besoinNet > 0  → LANCER DA (red, purchase required)
//   besoinNet <= 0 → RAS (green, stock sufficient)
// Shows ALL articles that have active orders today for complete visibility
function calcBesoinSKU(articles: Article[]): BesoinSKU[] {
  const besoinRaw = store.computeBesoinNet()
  return besoinRaw
    .map(b => {
      const art = articles.find(a => a.id === b.articleId)
      // Real besoin = commandes - stock (not clamped — negative = surplus)
      const besoinNet = b.commandeQty - b.stockQty
      const lancerDA = besoinNet > 0
      return {
        articleId: b.articleId,
        articleNom: b.articleNom,
        unite: b.unite,
        stockDispo: b.stockQty,
        qteCommandee: b.commandeQty,
        besoinNet,          // can be negative (surplus) or positive (DA needed)
        lancerDA,
        dernierPrixAchat: art?.prixAchat ?? 0,
        totalEstime: lancerDA ? besoinNet * (art?.prixAchat ?? 0) : 0,
      }
    })
    .sort((a, b) => b.besoinNet - a.besoinNet) // most urgent first (highest deficit)
}

// ── Self-contained camera capture — isolates useRef from MobileAchat ─────────
function POCameraCapture({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [active, setActive] = useState(false)
  const streamRef = useRef<MediaStream | null>(null)

  const start = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      streamRef.current = s
      setActive(true)
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = s }, 80)
    } catch { /* camera not available, user can use gallery */ }
  }

  const stop = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setActive(false)
  }

  useEffect(() => () => { stop() }, [])

  const capture = () => {
    const v = videoRef.current
    if (!v) return
    const c = document.createElement("canvas")
    c.width = v.videoWidth || 640; c.height = v.videoHeight || 480
    c.getContext("2d")?.drawImage(v, 0, 0)
    onChange(c.toDataURL("image/jpeg", 0.85))
    stop()
  }

  if (value) return (
    <div className="relative rounded-xl overflow-hidden border-2 border-green-400">
      <img src={value} alt="Photo marchandise" className="w-full max-h-48 object-cover" />
      <button onClick={() => onChange("")}
        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-bold shadow">X</button>
      <span className="absolute bottom-2 left-2 bg-green-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">Photo valide</span>
    </div>
  )

  if (active) return (
    <div className="flex flex-col gap-2 rounded-xl overflow-hidden border border-slate-200">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video ref={videoRef} autoPlay playsInline className="w-full max-h-48 object-cover bg-black" />
      <div className="flex gap-2 px-2 pb-2">
        <button onClick={capture}
          className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-xs font-bold flex items-center justify-center gap-1.5">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Capturer
        </button>
        <button onClick={stop} className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200">Annuler</button>
      </div>
    </div>
  )

  return (
    <div className="flex gap-2">
      <button onClick={start}
        className="flex-1 py-2.5 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 text-amber-700 text-xs font-bold flex items-center justify-center gap-1.5">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Camera
      </button>
      <label className="flex-1 py-2.5 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50 text-blue-700 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        Galerie
        <input type="file" accept="image/*" capture="environment" className="hidden"
          onChange={e => {
            const file = e.target.files?.[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = ev => onChange(ev.target?.result as string)
            reader.readAsDataURL(file)
          }} />
      </label>
    </div>
  )
}

export default function MobileAchat({ user }: Props) {
  const [articles, setArticles] = useState<Article[]>([])
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([])
  const [lignes, setLignes] = useState<LigneForm[]>([EMPTY_LIGNE()])
  const [fournisseurId, setFournisseurId] = useState("")
  const [showNewFournisseur, setShowNewFournisseur] = useState(false)
  const [editingFournisseur, setEditingFournisseur] = useState<Fournisseur | null>(null)
  const [sending, setSending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [emailDest, setEmailDest] = useState("")
  // "besoin" is shown first — it displays the Demande d'Achat (DA) based on stock vs orders
  const [activeTab, setActiveTab] = useState<"bon" | "besoin" | "po_push" | "fournisseurs" | "charges" | "camera" | "comparatif" | "avis" | "mes_achats">("besoin")
  const [fournisseurSearch, setFournisseurSearch] = useState("")
  const [clients, setClients] = useState<Client[]>([])
  // PA history modal
  const [historyArtId, setHistoryArtId] = useState<string | null>(null)
  const [besoinSKU, setBesoinSKU] = useState<BesoinSKU[]>([])
  // PO push mode: "auto" = redirect to po_push tab automatically, "click" = badge only
  const [poPushMode, setPoPushMode] = useState<"auto" | "click">("auto")
  const [pendingPOs, setPendingPOs] = useState(store.getPendingPOsForAcheteur())
  // Recherche/filtre/tri des PO en attente — même interface que le sélecteur
  // d'articles de "Bon d'Achat" (recherche, A→Z, filtre par famille).
  const [poSearch, setPoSearch] = useState("")
  const [poFamilyFilter, setPoFamilyFilter] = useState("")

  // ── Depot selector ─────────────────────────────────────────────────────────
  const [depots, setDepots] = useState<import("@/lib/store").Depot[]>([])
  // Pre-select user's assigned depot, otherwise first available
  const [selectedDepotId, setSelectedDepotId] = useState<string>(user.depotId ?? "")

  // ── Article inline selector state ──────────────────────────────────────────
  const [artSearch, setArtSearch] = useState("")
  type ArtSort = "rotation" | "stock" | "nom"
  const [artSort, setArtSort] = useState<ArtSort>("nom")
  // Spécialisation acheteur : familles assignées à cet acheteur (filtre par défaut)
  const specialites = useMemo(() => (user.specialitesAchat ?? []).filter(Boolean), [user.specialitesAchat])
  const [showAllFamilies, setShowAllFamilies] = useState(false)
  const [openFamilies, setOpenFamilies] = useState<Set<string>>(new Set())

  // Zone filtering for articles
  const [zones, setZones] = useState<string[]>([])
  const [zoneFilter, setZoneFilter] = useState("")

  // Global rotation: times each article was purchased across all achats
  const globalRotation = useMemo(() => {
    const map: Record<string, number> = {}
    try {
      const achats: Array<{ lignes?: Array<{ articleId?: string }> }> = JSON.parse(localStorage.getItem("fl_achats") ?? "[]")
      achats.forEach(a => a.lignes?.forEach(l => { if (l.articleId) map[l.articleId] = (map[l.articleId] ?? 0) + 1 }))
    } catch { /* ignore */ }
    return map
  }, [])

  const filteredArticles = useMemo(() => {
    let list = [...articles]
    // Filtre spécialisation : par défaut l'acheteur ne voit que ses familles
    // (sauf s'il a activé « voir tout » ou cherche un terme précis).
    if (specialites.length > 0 && !showAllFamilies && !artSearch.trim()) {
      list = list.filter(a => specialites.includes(a.famille))
    }
    if (artSearch.trim()) {
      const q = artSearch.trim().toLowerCase()
      list = list.filter(a => a.nom.toLowerCase().includes(q) || a.nomAr?.includes(q) || a.famille?.toLowerCase().includes(q))
    }
    // Filter by zone if selected
    if (zoneFilter) {
      list = list.filter(a => a.zones?.includes(zoneFilter))
    }
    if (artSort === "rotation") list.sort((a, b) => (globalRotation[b.id] ?? 0) - (globalRotation[a.id] ?? 0))
    else if (artSort === "stock") list.sort((a, b) => a.stockDisponible - b.stockDisponible) // lowest stock first = urgent
    else list.sort((a, b) => a.nom.localeCompare(b.nom))
    return list
  }, [articles, artSearch, artSort, globalRotation, specialites, showAllFamilies, zoneFilter])

  // Familles présentes parmi les PO en attente (pour les puces de filtre).
  const poFamilies = useMemo(() => {
    const set = new Set<string>()
    pendingPOs.forEach(po => {
      const fam = articles.find(a => a.id === po.articleId)?.famille
      if (fam) set.add(fam)
    })
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [pendingPOs, articles])

  // Zones available in articles
  const availableZones = useMemo(() => {
    const set = new Set<string>()
    articles.forEach(a => {
      if (a.zones) a.zones.forEach(z => set.add(z))
    })
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [articles])

  const filteredPOs = useMemo(() => {
    let list = [...pendingPOs]
    if (poFamilyFilter) {
      list = list.filter(po => articles.find(a => a.id === po.articleId)?.famille === poFamilyFilter)
    }
    if (poSearch.trim()) {
      const q = poSearch.trim().toLowerCase()
      list = list.filter(po => {
        const fam = articles.find(a => a.id === po.articleId)?.famille ?? ""
        return po.articleNom.toLowerCase().includes(q) || fam.toLowerCase().includes(q) || po.fournisseurNom.toLowerCase().includes(q)
      })
    }
    list.sort((a, b) => a.articleNom.localeCompare(b.articleNom))
    return list
  }, [pendingPOs, poSearch, poFamilyFilter, articles])

  // ── PO Detail Modal — opened when acheteur clicks "Prendre en charge" ────────
  const [poModalId, setPoModalId] = useState<string | null>(null)
  const [poDetail, setPoDetail] = useState({
    quantite: "",
    nbUnites: "",   // nombre d'UM (caisses/cartons…) — calcule quantite = nbUnites × colisageParUM
    prixUnitaire: "",
    fournisseurId: "",
    montantPaye: "",
    statutPaiement: "impaye" as "impaye" | "partiel" | "solde",
    notePaiement: "",
    photoAchat: "",       // photo obligatoire avant validation
    chargeIds: [] as string[],  // plusieurs charges par article (chariot, manutention…)
    chargeMontants: {} as Record<number, string>,  // override par ligne — vide = valeur par défaut du BO
    // Flux d'achat (conformité CGI Maroc) — marché de gros / agriculteur
    // direct / société structurée, comptabilisés différemment.
    typeFlux: "marche_gros" as "marche_gros" | "agriculteur_direct" | "societe_structuree",
    agriculteurNom: "",
    agriculteurCIN: "",
    // Caisses vides échangées avec le fournisseur à cet achat
    caissesFournisseur: [] as { type: TypeCaisse; quantite: string; sens: "donnee" | "recue"; code: string }[],
  })
  const [chargesArticle, setChargesArticle] = useState(store.getChargesArticle())
  const [poSaving, setPoSaving] = useState(false)

  // Ajoute une LIGNE de charge vide (l'acheteur choisit ensuite la charge dans le select)
  const addChargeRow = () => setPoDetail(p => ({ ...p, chargeIds: [...p.chargeIds, ""] }))
  const setChargeRow = (idx: number, id: string) => setPoDetail(p => {
    const next = [...p.chargeIds]; next[idx] = id; return { ...p, chargeIds: next }
  })
  // Caisses fournisseur — même pattern que les lignes de charge (add/update/remove).
  // Quantité pré-remplie automatiquement depuis "Nombre d'unités" (nbUnites) déjà
  // saisi pour cet achat — 1 caisse par UM étant le cas normal — mais reste un
  // champ libre : l'acheteur peut la rectifier si le nombre réel de caisses
  // physiques diffère (regroupement, casse, caisses partagées…).
  const addCaisseRow = () => setPoDetail(p => ({
    ...p, caissesFournisseur: [...p.caissesFournisseur, { type: "gros" as TypeCaisse, quantite: p.nbUnites || "", sens: "recue" as const, code: "" }],
  }))
  const setCaisseRow = (idx: number, patch: Partial<{ type: TypeCaisse; quantite: string; sens: "donnee" | "recue"; code: string }>) =>
    setPoDetail(p => {
      const next = [...p.caissesFournisseur]
      next[idx] = { ...next[idx], ...patch }
      return { ...p, caissesFournisseur: next }
    })
  const removeCaisseRow = (idx: number) => setPoDetail(p => ({
    ...p, caissesFournisseur: p.caissesFournisseur.filter((_, i) => i !== idx),
  }))

  const removeChargeRow = (idx: number) => setPoDetail(p => {
    const chargeIds = p.chargeIds.filter((_, i) => i !== idx)
    // Réindexe les overrides restants (les indices se décalent après suppression)
    const chargeMontants: Record<number, string> = {}
    p.chargeIds.forEach((_, i) => { if (i === idx) return; const ni = i > idx ? i - 1 : i; if (p.chargeMontants[i] !== undefined) chargeMontants[ni] = p.chargeMontants[i] })
    return { ...p, chargeIds, chargeMontants }
  })
  const setChargeMontantOverride = (idx: number, v: string) => setPoDetail(p => ({ ...p, chargeMontants: { ...p.chargeMontants, [idx]: v } }))
  // Crée une NOUVELLE charge dans le catalogue (si elle n'existe pas) et l'ajoute en ligne
  const createNewCharge = () => {
    const nom = window.prompt("Nom de la nouvelle charge (ex: Chariot, Manutention) :", "")?.trim()
    if (!nom) return
    const montantStr = window.prompt(`Montant de « ${nom} » (DH par unité) :`, "0")
    const montant = Number(montantStr)
    if (Number.isNaN(montant) || montant < 0) return
    const created = { id: store.genId(), nom, montant }
    const next = [...store.getChargesArticle(), created]
    store.saveChargesArticle(next)
    setChargesArticle(next)
    setPoDetail(p => ({ ...p, chargeIds: [...p.chargeIds, created.id] }))
  }
  const chargeMontantOf = (id: string) => Number(chargesArticle.find(c => c.id === id)?.montant) || 0
  // Valeur par défaut = catalogue BO ; l'acheteur peut la surcharger par ligne de PO
  const chargeMontantAt = (idx: number, id: string) => {
    const override = poDetail.chargeMontants[idx]
    return override !== undefined && override !== "" ? (Number(override) || 0) : chargeMontantOf(id)
  }
  const totalChargeUnit = () => poDetail.chargeIds.reduce((s, id, idx) => s + chargeMontantAt(idx, id), 0)

  const openPOModal = (po: typeof pendingPOs[0]) => {
    // Charge par défaut = celle affectée à l'article (back-office), modifiable ici
    const art = store.getArticles().find(a => a.id === po.articleId)
    setPoDetail({
      quantite: String(po.quantite),
      nbUnites: art?.colisageParUM ? String(Math.round((po.quantite / art.colisageParUM) * 100) / 100) : "",
      prixUnitaire: String(po.prixUnitaire),
      fournisseurId: po.fournisseurId,
      montantPaye: "",
      statutPaiement: "impaye",
      notePaiement: "",
      photoAchat: "",
      chargeIds: (po.chargeArticleId ?? art?.chargeArticleId) ? [po.chargeArticleId ?? art?.chargeArticleId ?? ""] : [],
      chargeMontants: {},
      typeFlux: "marche_gros",
      agriculteurNom: "",
      agriculteurCIN: "",
      caissesFournisseur: [],
    })
    setPoModalId(po.id)
  }

  const confirmPO = () => {
    if (!poModalId) return
    // Photo marchandise obligatoire uniquement si activé dans la config process
    const photoObligatoire = store.getProcessConfig().photoAchatObligatoire !== false
    if (photoObligatoire && !poDetail.photoAchat) {
      alert("Photo obligatoire — veuillez prendre ou importer une photo de la marchandise.")
      return
    }
    // Auto-facturation "Production Agricole" — nom + CIN de l'agriculteur
    // obligatoires (traçabilité fiscale, flux exonéré de TVA).
    if (poDetail.typeFlux === "agriculteur_direct" && (!poDetail.agriculteurNom.trim() || !poDetail.agriculteurCIN.trim())) {
      alert("Nom et CIN de l'agriculteur obligatoires pour ce flux (auto-facturation Production Agricole).")
      return
    }
    // Plafond cash achat/jour/fournisseur (seuil de déductibilité fiscale
    // CGI Maroc) — secteur informel = paiement quasi-systématiquement en
    // espèces ; on cumule le montant réglé aujourd'hui pour ce fournisseur.
    const montantPayeAuj = Number(poDetail.montantPaye) || 0
    if (montantPayeAuj > 0 && poDetail.fournisseurId) {
      const cfg = store.getFiscalConfig()
      const today = store.today()
      const dejaRegleAuj = store.getPurchaseOrders()
        .filter(p => p.fournisseurId === poDetail.fournisseurId && p.date === today && p.id !== poModalId)
        .reduce((s, p) => s + (Number((p as unknown as { montantPaye?: number }).montantPaye) || 0), 0)
      const cumulApres = dejaRegleAuj + montantPayeAuj
      if (cumulApres > cfg.plafondCashAchatJour && !confirm(
        `⚠️ Ce fournisseur atteindra ${cumulApres.toFixed(2)} DH réglés en espèces aujourd'hui, au-dessus du seuil de déductibilité fiscale (${cfg.plafondCashAchatJour} DH/jour). Continuer quand même ?`
      )) return
    }
    setPoSaving(true)
    const qty = Number(poDetail.quantite)
    const pu = Number(poDetail.prixUnitaire)
    const total = qty * pu
    const fourNom = fournisseurs.find(f => f.id === poDetail.fournisseurId)?.nom ?? ""
    const po = store.getPurchaseOrders().find(p => p.id === poModalId)
    // Charges par article (plusieurs possibles) — coût de revient. Le montant
    // retenu est celui affiché à l'écran (override acheteur si saisi, sinon
    // la valeur par défaut du catalogue BO) — jamais divergent de l'aperçu.
    const selectedCharges = poDetail.chargeIds
      .map((id, idx) => {
        const c = chargesArticle.find(c => c.id === id)
        if (!c) return null
        return { id: c.id, nom: c.nom, montant: chargeMontantAt(idx, id) }
      })
      .filter((c): c is { id: string; nom: string; montant: number } => !!c)
    const chargeMontant = selectedCharges.reduce((s, c) => s + (Number(c.montant) || 0), 0)
    // Taxe communale 7% — marché de gros uniquement, comptabilisée comme une
    // CHARGE (classe 6), jamais comme de la TVA récupérable.
    const taxeCommunale = poDetail.typeFlux === "marche_gros" ? Math.round(total * 0.07 * 100) / 100 : undefined
    store.updatePurchaseOrder(poModalId, {
      statut: "envoyé",
      quantite: qty,
      prixUnitaire: pu,
      total,
      fournisseurId: poDetail.fournisseurId,
      fournisseurNom: fourNom,
      montantPaye: Number(poDetail.montantPaye) || 0,
      statutPaiement: poDetail.statutPaiement,
      notePaiement: poDetail.notePaiement,
      chargeArticleId: selectedCharges[0]?.id || undefined,   // back-compat
      chargesIds: selectedCharges.map(c => c.id),
      chargesDetail: selectedCharges.map(c => ({ nom: c.nom, montant: Number(c.montant) || 0 })),
      chargeMontant,
      coutRevientUnitaire: pu + chargeMontant,
      totalCharges: chargeMontant * qty,
      typeFlux: poDetail.typeFlux,
      taxeCommunale,
      agriculteurNom: poDetail.typeFlux === "agriculteur_direct" ? poDetail.agriculteurNom.trim() : undefined,
      agriculteurCIN: poDetail.typeFlux === "agriculteur_direct" ? poDetail.agriculteurCIN.trim() : undefined,
      // La photo était capturée/obligatoire côté UI mais jamais persistée sur
      // le PO (seulement recopiée dans fl_credits_fournisseurs, et uniquement
      // si le paiement n'était pas soldé) — désormais toujours sauvegardée ici.
      photoAchat: poDetail.photoAchat || undefined,
      caissesFournisseur: poDetail.caissesFournisseur
        .filter(c => Number(c.quantite) > 0)
        .map(c => ({ type: c.type, quantite: Number(c.quantite), sens: c.sens, code: c.code.trim() || undefined })),
    })
    // store.updatePurchaseOrder est LOCAL-ONLY (localStorage) — sans cet appel,
    // le PO confirmé (et notamment les caisses fournisseur / photo qu'on vient
    // d'ajouter à cet écran) ne remontait jamais à Supabase, donc n'apparaissait
    // jamais côté back-office (BOFournisseurDetail lit /api/portal/supplier via
    // Supabase, pas le localStorage du téléphone de l'acheteur).
    const updatedPo = store.getPurchaseOrders().find(p => p.id === poModalId)
    if (updatedPo) {
      import("@/lib/supabase/db").then(db => db.upsertPurchaseOrder(updatedPo)).catch(e => console.error("[MobileAchat] sync PO error:", e))
    }

    // ── Caisses étrangères — alimente le suivi de cycle de vie (BO > Gestion
    // des caisses > Caisses étrangères) : une caisse "reçue" entre en stock
    // chez nous ; une caisse "donnée" à l'achat (restitution immédiate, pas
    // liée à une sortie en livraison antérieure) est directement classée
    // retournée.
    if (poDetail.caissesFournisseur.some(c => Number(c.quantite) > 0)) {
      const today = store.today()
      const nouvellesCaisses: CaisseEtrangere[] = poDetail.caissesFournisseur
        .filter(c => Number(c.quantite) > 0)
        .map(c => ({
          id: store.genId(),
          type: c.type,
          quantite: Number(c.quantite),
          code: c.code.trim() || undefined,
          fournisseurId: poDetail.fournisseurId,
          fournisseurNom: fourNom,
          statut: c.sens === "recue" ? "en_stock" : "retournee",
          poId: poModalId,
          dateReception: today,
          dateRetour: c.sens === "donnee" ? today : undefined,
        }))
      nouvellesCaisses.forEach(c => store.addCaisseEtrangere(c))
      import("@/lib/supabase/db").then(db => {
        nouvellesCaisses.forEach(c => db.upsertCaisseEtrangere(c).catch(e => console.error("[MobileAchat] sync caisse etrangere error:", e)))
      })
    }

    // Auto-create credit fournisseur si paiement impaye ou partiel
    if (poDetail.statutPaiement !== "solde") {
      const credits: Array<Record<string, unknown>> = (() => {
        try { return JSON.parse(localStorage.getItem("fl_credits_fournisseurs") ?? "[]") } catch { return [] }
      })()
      const montantPaye = Number(poDetail.montantPaye) || 0
      const echeance = new Date()
      echeance.setDate(echeance.getDate() + 30)
      credits.push({
        id: store.genId(),
        fournisseurId: poDetail.fournisseurId,
        fournisseurNom: fourNom,
        articleNom: po?.articleNom ?? "",
        acheteurNom: user.name,
        acheteurId: user.id,
        dateAchat: store.today(),
        dateEcheance: echeance.toISOString().split("T")[0],
        montant: total,
        montantPaye,
        statut: poDetail.statutPaiement,
        referenceFacture: poModalId,
        notes: poDetail.notePaiement,
        photoAchat: poDetail.photoAchat,
      })
      localStorage.setItem("fl_credits_fournisseurs", JSON.stringify(credits))
    }

    refreshPOs()
    setPoModalId(null)
    setPoSaving(false)
  }

  const refreshPOs = () => setPendingPOs(store.getPendingPOsForAcheteur())

  // Se remet à jour si une commande est supprimée ailleurs (back-office,
  // autre appareil) pendant que cet écran est déjà ouvert — sans ça, la file
  // de PO restait figée sur les anciennes quantités (cf. cascadePOAfterCommandeDelete).
  useEffect(() => {
    const WATCHED = new Set(["fl_purchase_orders", "fl_commandes"])
    const handler = (e: Event) => {
      if (WATCHED.has((e as CustomEvent).detail as string)) refreshPOs()
    }
    window.addEventListener("fl_store_updated", handler)
    return () => window.removeEventListener("fl_store_updated", handler)
  }, [])

  // ── Refus PO par l'acheteur ────────────────────────────────────────────────
  // Si tous les acheteurs ont refusé, une DA est générée automatiquement
  const [poRefusMotif, setPoRefusMotif] = useState<Record<string, string>>({})
  const refuserPO = (poId: string) => {
    const motif = poRefusMotif[poId] || "Indisponible marche"
    const da = store.refuserPO(poId, user.id, user.name, motif)
    refreshPOs()
    if (da) {
      alert(`Tous les acheteurs ont refuse ce PO. Une Demande d'Achat (DA-${da.id.slice(-6).toUpperCase()}) a ete generee automatiquement.`)
    }
  }

  useEffect(() => {
    const arts = onlyActiveArticles(store.getArticles())
    setArticles(arts)
    setFournisseurs(store.getFournisseurs())
    setClients(store.getClients())
    setZones(store.getZones())
    const cfg = store.getEmailConfig()
    setEmailDest(cfg.achat)
    setBesoinSKU(calcBesoinSKU(arts))
    const allDepots = store.getDepots()
    setDepots(allDepots)
    // Pre-select user depot if not already set
    if (!selectedDepotId && allDepots.length > 0) {
      setSelectedDepotId(user.depotId ?? allDepots[0].id)
    }
    // ⚡ Génération AUTOMATIQUE des PO à partir du besoin net, directement sur
    // le mobile acheteur (avant, seul le back-office les générait). Idempotent :
    // le garde alreadyExists (même article + même jour + genereAuto) évite les
    // doublons. Régénère aussi les PO si la sync les a effacés à la reconnexion.
    try { store.autoGeneratePOsFromBesoin() } catch { /* offline / demo */ }
    const pos = store.getPendingPOsForAcheteur()
    setPendingPOs(pos)
    // Auto mode: go directly to PO push tab if there are pending POs
    if (pos.length > 0 && poPushMode === "auto") {
      setActiveTab("po_push")
    }
    // Hydratation depuis Supabase en arrière-plan (cache local seul = vide sur
    // un appareil neuf/jamais synchronisé). Affichage instantané avec le cache
    // local ci-dessus, puis mise à jour silencieuse dès que Supabase répond.
    import("@/lib/supabase/db").then(async db => {
      try {
        const [freshArtsRaw, freshFourns, { clients: freshClients }] = await Promise.all([
          db.fetchArticles(), db.fetchFournisseurs(), db.fetchClients(),
        ])
        const freshArts = onlyActiveArticles(freshArtsRaw ?? [])
        if (freshArts.length) { setArticles(freshArts); setBesoinSKU(calcBesoinSKU(freshArts)) }
        if (freshFourns?.length) setFournisseurs(freshFourns)
        if (freshClients?.length) setClients(freshClients)
      } catch { /* offline */ }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fournisseur = fournisseurs.find(f => f.id === fournisseurId)

  const updateLigne = (i: number, patch: Partial<LigneForm>) => {
    setLignes(prev => {
      const updated = [...prev]
      const next = { ...updated[i], ...patch }
      // When article changes — pre-fill PA from article.prixAchat
      if ("articleId" in patch) {
        const art = articles.find(a => a.id === patch.articleId)
        next.uniteMode = "base"
        next.quantite = ""
        next.totalPaye = ""
        if (art) next.prixAchat = art.prixAchat.toString()
        else next.prixAchat = ""
      }
      updated[i] = next
      return updated
    })
  }

  const addLigne = () => setLignes(prev => [...prev, EMPTY_LIGNE()])
  const removeLigne = (i: number) => setLignes(prev => prev.filter((_, j) => j !== i))

  const totalGeneral = lignes.reduce((sum, l) => {
    const art = articles.find(a => a.id === l.articleId)
    const pa = resolvePA(l)
    const qty = resolveQty(l, art)
    if (!isNaN(pa) && qty > 0) return sum + qty * pa
    return sum
  }, 0)

  const handleSubmit = async () => {
    if (!fournisseurId) return
    const valid = lignes.every(l => {
      const art = articles.find(a => a.id === l.articleId)
      const pa = resolvePA(l)
      const qty = resolveQty(l, art)
      return l.articleId && qty > 0 && !isNaN(pa) && pa > 0
    })
    if (!valid) return

    // Garde-fou anti-faute-de-frappe : si un PA saisi s'écarte fortement du
    // PA precedent de l'article, on demande confirmation (FR + AR) avant
    // d'ecraser le catalogue — evite un incident type "93 DH au lieu de 9,30".
    for (const l of lignes) {
      const art = articles.find(a => a.id === l.articleId)
      if (!art) continue
      const pa = resolvePA(l)
      const deviation = store.checkPaDeviationSuspecte(art.id, pa)
      if (deviation && !window.confirm(paDeviationConfirmMessage(deviation))) return
    }

    setSending(true)

    // Build lignes + update article historique PA
    const lignesData: LigneAchat[] = lignes.map(l => {
      const art = articles.find(a => a.id === l.articleId)!
      const pa = resolvePA(l)
      const qty = resolveQty(l, art)
      return {
        articleId: l.articleId,
        articleNom: art.nom,
        quantite: qty,
        prixAchat: pa,
      }
    })

    // Update historique PA on each article
    const allArticles = store.getArticles()
    const touchedIdx: number[] = []
    lignes.forEach(l => {
      const idx = allArticles.findIndex(a => a.id === l.articleId)
      if (idx < 0) return
      const pa = resolvePA(l)
      const qty = resolveQty(l, allArticles[idx])
      const histEntry: HistoriquePrixAchat = {
        date: store.today(),
        fournisseurId,
        fournisseurNom: fournisseur?.nom ?? "",
        prixAchat: pa,
        quantite: qty,
      }
      const existing = allArticles[idx].historiquePrixAchat ?? []
      allArticles[idx] = {
        ...allArticles[idx],
        historiquePrixAchat: [...existing, histEntry].slice(-20), // keep last 20
        prixAchat: pa, // update current PA
      }
      touchedIdx.push(idx)
    })
    store.saveArticles(allArticles)
    try {
      const { upsertArticle } = await import("@/lib/supabase/db")
      for (const idx of touchedIdx) await upsertArticle(allArticles[idx])
    } catch { /* offline */ }

    const selectedDepot = depots.find(d => d.id === selectedDepotId)
    const bon = {
      id: store.genId(),
      date: store.today(),
      createdVia: "mobile" as const,
      acheteurId: user.id,
      acheteurNom: user.name,
      fournisseurId,
      fournisseurNom: fournisseur!.nom,
      lignes: lignesData,
      statut: "validé" as const,
      emailDestinataire: emailDest,
      depotId: selectedDepotId || undefined,
      depotNom: selectedDepot?.nom || undefined,
    }

    store.addBonAchat(bon)
    try {
      const { upsertBonAchat } = await import("@/lib/supabase/db")
      await upsertBonAchat(bon)
    } catch { /* offline */ }

    await sendEmail({
      to_email: emailDest,
      subject: `Bon d'achat #${bon.id} — ${bon.fournisseurNom} (${user.name})`,
      body: buildAchatEmail(bon),
    })

    setSuccess(true)
    setSending(false)
    setLignes([EMPTY_LIGNE()])
    setFournisseurId("")
    setArticles(onlyActiveArticles(store.getArticles())) // refresh PA
    setTimeout(() => setSuccess(false), 3500)
  }

  // PA history for a given article (latest first)
  const getHistory = (artId: string): HistoriquePrixAchat[] => {
    const art = articles.find(a => a.id === artId)
    return [...(art?.historiquePrixAchat ?? [])].reverse()
  }

  const historyArt = articles.find(a => a.id === historyArtId)

  const urgents = besoinSKU.filter(b => b.lancerDA)
  const totalBesoinEstime = urgents.reduce((s, b) => s + b.totalEstime, 0)

  // Onglets masqués/affichés par le back-office (Paramètres → Onglets Mobile) —
  // cf. store.ts MOBILE_TABS_REGISTRY / isMobileTabVisible.
  const ACHAT_TAB_IDS = ["besoin", "bon", "po_push", "fournisseurs", "charges", "camera", "comparatif", "avis", "mes_achats"] as const
  const tabVisible = (id: string) => store.isMobileTabVisible(user.role, "achat", id)
  const visibleTabIds = ACHAT_TAB_IDS.filter(tabVisible)
  useEffect(() => {
    if (!tabVisible(activeTab) && visibleTabIds.length > 0) setActiveTab(visibleTabIds[0])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, user.role])

  const filteredFournisseurs = fournisseurs.filter(f =>
    !fournisseurSearch.trim() || f.nom.toLowerCase().includes(fournisseurSearch.trim().toLowerCase())
  ).sort((a, b) => a.nom.localeCompare(b.nom, "fr"))

  return (
    <div className="p-4 flex flex-col gap-4 font-sans">
      <div>
        <h2 className="text-lg font-bold text-foreground">Achat / الشراء</h2>
        <p className="text-sm text-muted-foreground">{store.today()} — {user.name}</p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted overflow-x-auto no-scrollbar">
        {tabVisible("besoin") && (
        <button
          onClick={() => setActiveTab("besoin")}
          className={`flex-1 min-w-max py-2 px-3 rounded-lg text-xs font-bold transition-all relative ${activeTab === "besoin" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          DA / Besoin
          {urgents.length > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[1rem] h-4 px-0.5 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center">
              {urgents.length}
            </span>
          )}
        </button>
        )}
        {tabVisible("bon") && (
        <button
          onClick={() => setActiveTab("bon")}
          className={`flex-1 min-w-max py-2 px-3 rounded-lg text-xs font-bold transition-all ${activeTab === "bon" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          Bon d&apos;Achat
        </button>
        )}
        {/* PO Push tab with badge */}
        {tabVisible("po_push") && (
        <button
          onClick={() => { setActiveTab("po_push"); refreshPOs() }}
          className={`flex-1 min-w-max py-2 px-3 rounded-lg text-xs font-bold transition-all relative ${activeTab === "po_push" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          PO Achat
          {pendingPOs.length > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-white text-[10px] font-black flex items-center justify-center"
              style={{ background: "oklch(0.54 0.22 27)" }}>
              {pendingPOs.length}
            </span>
          )}
        </button>
        )}
        {tabVisible("fournisseurs") && (
        <button
          onClick={() => setActiveTab("fournisseurs")}
          className={`flex-1 min-w-max py-2 px-3 rounded-lg text-xs font-bold transition-all ${activeTab === "fournisseurs" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          Fournisseurs
        </button>
        )}
        {tabVisible("charges") && (
        <button
          onClick={() => setActiveTab("charges")}
          className={`flex-1 min-w-max py-2 px-3 rounded-lg text-xs font-bold transition-all ${activeTab === "charges" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          Charges
        </button>
        )}
        {tabVisible("camera") && (
        <button
          onClick={() => setActiveTab("camera")}
          className={`flex-1 min-w-max py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${activeTab === "camera" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Qualite IA
        </button>
        )}
        {tabVisible("comparatif") && (
        <button
          onClick={() => setActiveTab("comparatif")}
          className={`flex-1 min-w-max py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${activeTab === "comparatif" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Comparatif
        </button>
        )}
        {tabVisible("avis") && (
        <button
          onClick={() => setActiveTab("avis")}
          className={`flex-1 min-w-max py-2 px-3 rounded-lg text-xs font-bold transition-all ${activeTab === "avis" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          Avis
        </button>
        )}
        {tabVisible("mes_achats") && (
        <button
          onClick={() => setActiveTab("mes_achats")}
          className={`flex-1 min-w-max py-2 px-3 rounded-lg text-xs font-bold transition-all relative ${activeTab === "mes_achats" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          Mes Achats
        </button>
        )}
      </div>

      {/* Modal Fournisseur (création/édition + recensement GPS) — hors des
          onglets pour rester disponible depuis "Bon d'achat", "PO Achat" ET "Fournisseurs" */}
      {(showNewFournisseur || editingFournisseur) && (
        <NouveauFournisseurModal
          articles={articles}
          fournisseur={editingFournisseur ?? undefined}
          onClose={() => { setShowNewFournisseur(false); setEditingFournisseur(null) }}
          onCreated={f => {
            setFournisseurs(prev => [...prev, f])
            // Auto-sélectionne le fournisseur créé dans le formulaire d'où le
            // "+ Nouveau" a été ouvert (Bon d'achat ou PO Achat).
            if (activeTab === "po_push") setPoDetail(p => ({ ...p, fournisseurId: f.id }))
            else setFournisseurId(f.id)
            setShowNewFournisseur(false)
          }}
          onUpdated={f => {
            setFournisseurs(prev => prev.map(x => x.id === f.id ? f : x))
            setEditingFournisseur(null)
          }}
        />
      )}

      {/* ═══ FOURNISSEURS — création, modification, recensement GPS ═══════════ */}
      {activeTab === "fournisseurs" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <input type="text" value={fournisseurSearch} onChange={e => setFournisseurSearch(e.target.value)}
              placeholder="🔍 Rechercher un fournisseur..."
              className="flex-1 px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            <button onClick={() => setShowNewFournisseur(true)}
              className="px-3 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold whitespace-nowrap">
              + Nouveau
            </button>
          </div>
          <p className="text-xs text-muted-foreground">{filteredFournisseurs.length} fournisseur(s)</p>
          {filteredFournisseurs.length === 0 ? (
            <div className="bg-card rounded-xl border border-border p-8 text-center text-muted-foreground text-sm">
              Aucun fournisseur.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredFournisseurs.map(f => (
                <div key={f.id} className="bg-card rounded-xl border border-border p-3 flex flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{f.nom}</p>
                      <p className="text-xs text-muted-foreground">
                        {f.type ? FOURNISSEUR_TYPE_LABELS[f.type] : "—"}{f.ville ? ` · ${f.ville}` : ""}
                      </p>
                    </div>
                    <button onClick={() => setEditingFournisseur(f)}
                      className="text-xs font-bold text-primary hover:underline shrink-0">✏️ Modifier</button>
                  </div>
                  {f.telephone && <p className="text-xs text-muted-foreground">📞 {f.telephone}</p>}
                  {f.specialites?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {f.specialites.slice(0, 4).map(s => (
                        <span key={s} className="px-2 py-0.5 rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">{s}</span>
                      ))}
                      {f.specialites.length > 4 && <span className="text-[10px] text-muted-foreground">+{f.specialites.length - 4}</span>}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-[10px]">
                    {f.gpsVerifie ? (
                      <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">📍 Position confirmée sur place</span>
                    ) : f.itineraires?.length > 0 ? (
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">⚠️ Position non confirmée</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-semibold">Aucune position GPS</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ PO PUSH — Bons d'achat automatiques a traiter ═══════════════════ */}
      {activeTab === "po_push" && (
        <div className="flex flex-col gap-3">
          {/* Mode toggle */}
          <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: "oklch(0.12 0.010 145)", border: "1px solid oklch(0.20 0.012 145)" }}>
            <p className="text-sm font-bold" style={{ color: "oklch(0.88 0.006 100)" }}>Mode de notification PO</p>
            <div className="flex gap-2">
              <button
                onClick={() => setPoPushMode("auto")}
                className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
                style={poPushMode === "auto" ? { background: "oklch(0.58 0.18 148)", color: "#fff" } : { background: "oklch(0.18 0.012 145)", color: "oklch(0.60 0.008 145)", border: "1px solid oklch(0.24 0.012 145)" }}>
                Automatique
              </button>
              <button
                onClick={() => setPoPushMode("click")}
                className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
                style={poPushMode === "click" ? { background: "oklch(0.58 0.18 148)", color: "#fff" } : { background: "oklch(0.18 0.012 145)", color: "oklch(0.60 0.008 145)", border: "1px solid oklch(0.24 0.012 145)" }}>
                Sur click
              </button>
            </div>
            <p className="text-[11px]" style={{ color: "oklch(0.52 0.010 145)" }}>
              {poPushMode === "auto"
                ? "Les PO automatiques ouvrent cet onglet directement a la connexion."
                : "Les PO automatiques affichent uniquement un badge de notification."}
            </p>
          </div>

          {pendingPOs.length === 0 ? (
            <div className="rounded-2xl border p-10 flex flex-col items-center gap-2 text-center" style={{ background: "oklch(0.12 0.010 145)", border: "1px solid oklch(0.20 0.012 145)" }}>
              <svg className="w-10 h-10" style={{ color: "oklch(0.52 0.010 145)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-semibold" style={{ color: "oklch(0.65 0.008 145)" }}>Aucun PO en attente</p>
              <p className="text-xs" style={{ color: "oklch(0.50 0.008 145)" }}>Tous les bons d&apos;achat automatiques ont ete traites.</p>
            </div>
          ) : (
            <>
              {/* Recherche + tri A→Z + filtre par famille — même interface que "Bon d'Achat" */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "oklch(0.12 0.010 145)", border: "1px solid oklch(0.20 0.012 145)" }}>
                  <svg className="w-4 h-4 shrink-0" style={{ color: "oklch(0.52 0.010 145)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input type="text" value={poSearch} onChange={e => setPoSearch(e.target.value)}
                    placeholder="Rechercher par article, famille ou fournisseur..."
                    className="flex-1 bg-transparent text-sm focus:outline-none" style={{ color: "oklch(0.88 0.006 100)" }} />
                  {poSearch && (
                    <button onClick={() => setPoSearch("")} style={{ color: "oklch(0.52 0.010 145)" }}>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>
                {poFamilies.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto no-scrollbar">
                    <button onClick={() => setPoFamilyFilter("")}
                      className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                      style={!poFamilyFilter ? { background: "oklch(0.58 0.18 148)", color: "#fff" } : { background: "oklch(0.18 0.012 145)", color: "oklch(0.60 0.008 145)", border: "1px solid oklch(0.24 0.012 145)" }}>
                      Toutes ({pendingPOs.length})
                    </button>
                    {poFamilies.map(fam => (
                      <button key={fam} onClick={() => setPoFamilyFilter(fam)}
                        className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                        style={poFamilyFilter === fam ? { background: "oklch(0.58 0.18 148)", color: "#fff" } : { background: "oklch(0.18 0.012 145)", color: "oklch(0.60 0.008 145)", border: "1px solid oklch(0.24 0.012 145)" }}>
                        {fam}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {filteredPOs.length === 0 ? (
                <div className="rounded-2xl border p-8 flex flex-col items-center gap-1 text-center" style={{ background: "oklch(0.12 0.010 145)", border: "1px solid oklch(0.20 0.012 145)" }}>
                  <p className="text-sm font-semibold" style={{ color: "oklch(0.65 0.008 145)" }}>Aucun résultat</p>
                  <p className="text-xs" style={{ color: "oklch(0.50 0.008 145)" }}>Essayez un autre terme ou une autre famille.</p>
                </div>
              ) : (
            <div className="flex flex-col gap-2">
              {filteredPOs.map(po => (
                <div key={po.id} className="rounded-2xl p-4 flex flex-col gap-3"
                  style={{ background: "oklch(0.12 0.010 145)", border: "1px solid oklch(0.28 0.10 72)" }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                          style={{ background: "oklch(0.18 0.06 72)", color: "oklch(0.80 0.18 72)" }}>
                          PO AUTO
                        </span>
                        <span className="text-[10px] font-mono" style={{ color: "oklch(0.52 0.010 145)" }}>{po.id}</span>
                      </div>
                      <p className="font-bold text-sm" style={{ color: "oklch(0.88 0.006 100)" }}>{po.articleNom}</p>
                      <p className="text-xs mt-0.5" style={{ color: "oklch(0.62 0.010 145)" }}>
                        Fournisseur: <span className="font-semibold">{po.fournisseurNom}</span>
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xl font-black" style={{ color: "oklch(0.80 0.18 72)" }}>
                        {po.quantite.toLocaleString("fr-MA")} {po.articleUnite}
                      </p>
                      <p className="text-xs" style={{ color: "oklch(0.65 0.12 148)" }}>
                        {(po.total).toLocaleString("fr-MA")} DH
                      </p>
                    </div>
                  </div>
                  {po.notes && (
                    <p className="text-[11px] px-3 py-2 rounded-lg" style={{ background: "oklch(0.16 0.012 145)", color: "oklch(0.62 0.010 145)" }}>
                      {po.notes}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => openPOModal(po)}
                      className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 bg-green-600 text-white">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Prendre en charge
                    </button>
                    <button
                      onClick={() => { store.updatePurchaseOrder(po.id, { statut: "annulé" }); refreshPOs() }}
                      className="px-4 py-2.5 rounded-xl text-xs font-bold bg-red-50 border border-red-200 text-red-700">
                      Refuser
                    </button>
                  </div>
                </div>
              ))}
            </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══ DEMANDE D'ACHAT (DA) ════════════════════════════════════════════ */}
      {activeTab === "besoin" && (
        <div className="flex flex-col gap-3">
          {/* Section title */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-foreground">Demande d&apos;Achat du Jour</h3>
              <p className="text-xs text-muted-foreground">Commandes vs stock — articles a acheter en priorite</p>
            </div>
            <button onClick={() => setBesoinSKU(calcBesoinSKU(articles))}
              className="p-2 rounded-xl bg-muted hover:bg-muted/80 transition-colors">
              <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>

          {/* KPI bar — DA = besoinNet>0, RAS = besoinNet<=0 */}
          <div className="flex gap-2">
            <div className={`flex-1 rounded-xl px-3 py-2.5 text-center border ${urgents.length > 0 ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-200"}`}>
              <p className={`text-[11px] font-semibold ${urgents.length > 0 ? "text-red-700" : "text-slate-500"}`}>Lancer DA</p>
              <p className={`text-xl font-black ${urgents.length > 0 ? "text-red-800" : "text-slate-600"}`}>{urgents.length}</p>
            </div>
            <div className="flex-1 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 text-center">
              <p className="text-[11px] text-emerald-700 font-semibold">RAS</p>
              <p className="text-xl font-black text-emerald-800">{besoinSKU.filter(b => !b.lancerDA).length}</p>
            </div>
            <div className="flex-1 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-center">
              <p className="text-[11px] text-amber-700 font-medium">Cout estime</p>
              <p className="text-sm font-black text-amber-800">{totalBesoinEstime.toLocaleString("fr-MA")} DH</p>
            </div>
          </div>

          {besoinSKU.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border p-10 flex flex-col items-center gap-2 text-center">
              <svg className="w-10 h-10 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-semibold text-muted-foreground">Aucune commande du jour</p>
              <p className="text-xs text-muted-foreground">Les commandes validees du jour apparaitront ici avec le calcul stock vs commandes.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {besoinSKU.map(b => (
                <div key={b.articleId}
                  className={`rounded-2xl border p-4 flex flex-col gap-2 ${b.lancerDA ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}>

                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="font-bold text-sm text-foreground">{b.articleNom}</p>
                    </div>
                    {b.lancerDA ? (
                      <span className="shrink-0 px-2.5 py-1 rounded-full text-xs font-black bg-red-500 text-white animate-pulse">
                        LANCER DA
                      </span>
                    ) : (
                      <span className="shrink-0 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500 text-white">
                        RAS
                      </span>
                    )}
                  </div>

                  {/* Calcul: Qte commandee - Stock = Besoin */}
                  <div className="grid grid-cols-3 gap-1.5 text-xs">
                    <div className="bg-blue-50 border border-blue-100 rounded-xl px-2 py-2 text-center">
                      <p className="text-blue-500 font-medium text-[10px] mb-0.5">Qte commandee</p>
                      <p className="font-black text-blue-800 text-base leading-tight">{b.qteCommandee}</p>
                      <p className="text-blue-400 text-[10px]">{b.unite}</p>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-center relative">
                      <p className="text-slate-400 font-medium text-[10px] mb-0.5">Stock dispo</p>
                      <p className="font-black text-slate-700 text-base leading-tight">{b.stockDispo}</p>
                      <p className="text-slate-400 text-[10px]">{b.unite}</p>
                      {/* minus sign */}
                      <span className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-200 text-slate-600 text-xs font-black flex items-center justify-center z-10">−</span>
                    </div>
                    <div className={`rounded-xl px-2 py-2 text-center relative ${b.lancerDA ? "bg-red-100 border border-red-300" : "bg-emerald-100 border border-emerald-300"}`}>
                      <p className={`font-medium text-[10px] mb-0.5 ${b.lancerDA ? "text-red-500" : "text-emerald-600"}`}>
                        {b.lancerDA ? "Deficit" : "Surplus"}
                      </p>
                      <p className={`font-black text-base leading-tight ${b.lancerDA ? "text-red-800" : "text-emerald-800"}`}>
                        {b.lancerDA ? `+${b.besoinNet}` : Math.abs(b.besoinNet)}
                      </p>
                      <p className={`text-[10px] ${b.lancerDA ? "text-red-400" : "text-emerald-400"}`}>{b.unite}</p>
                      {/* equals sign */}
                      <span className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-200 text-slate-600 text-xs font-black flex items-center justify-center z-10">=</span>
                    </div>
                  </div>

                  {/* Cout estime si DA */}
                  {b.lancerDA && b.dernierPrixAchat > 0 && (
                    <div className="flex items-center justify-between text-xs bg-red-100/70 border border-red-200 rounded-xl px-3 py-2">
                      <span className="text-red-600 font-medium">Cout estime achat ({b.dernierPrixAchat} DH/{b.unite})</span>
                      <span className="font-black text-red-800">{b.totalEstime.toLocaleString("fr-MA")} DH</span>
                    </div>
                  )}

                  {/* Action: Lancer DA → pre-remplir bon achat */}
                  {b.lancerDA && (
                    <button
                      onClick={() => {
                        setActiveTab("bon")
                        setLignes(prev => {
                          const exists = prev.some(l => l.articleId === b.articleId)
                          if (exists) return prev
                          const emptyIdx = prev.findIndex(l => !l.articleId)
                          const newLignes = [...prev]
                          const art = articles.find(a => a.id === b.articleId)
                          const newLigne: LigneForm = {
                            articleId: b.articleId,
                            uniteMode: "base",
                            quantite: String(b.besoinNet),
                            prixAchat: String(art?.prixAchat ?? ""),
                            totalPaye: "",
                            calcMode: "unit",
                          }
                          if (emptyIdx >= 0) {
                            newLignes[emptyIdx] = newLigne
                          } else {
                            newLignes.push(newLigne)
                          }
                          return newLignes
                        })
                      }}
                      className="w-full py-2.5 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90 bg-red-600">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Lancer DA — Commander {b.besoinNet} {b.unite}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ BON D'ACHAT ══════════════════════════════════════════════════════ */}
      {activeTab === "bon" && (<>

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2">
          <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm text-green-700">Bon validé — workflow notifié et stock mis a jour !</span>
        </div>
      )}

      {/* Depot destination */}
      {depots.length > 0 && (
        <div className="bg-card rounded-xl p-4 border border-border flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <label className="text-xs font-bold text-foreground uppercase tracking-wide">Depot de destination *</label>
            {user.depotId && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold ml-auto shrink-0">Votre depot</span>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {depots.filter(d => d.actif).map(d => (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelectedDepotId(d.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                  selectedDepotId === d.id
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-background text-foreground hover:border-primary/40"
                }`}>
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />
                </svg>
                {d.nom}
                {d.ville && <span className="text-[10px] opacity-70">({d.ville})</span>}
              </button>
            ))}
          </div>
          {selectedDepotId && (
            <p className="text-xs text-muted-foreground">
              Ce bon sera visible par le magasinier du depot <span className="font-semibold text-foreground">{depots.find(d => d.id === selectedDepotId)?.nom ?? selectedDepotId}</span>
            </p>
          )}
        </div>
      )}

      {/* Fournisseur */}
      <div className="bg-card rounded-xl p-4 border border-border flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-foreground uppercase tracking-wide">Fournisseur *</label>
          <button type="button" onClick={() => setShowNewFournisseur(true)}
            className="text-xs font-bold text-primary hover:underline">+ Nouveau</button>
        </div>
        <select value={fournisseurId} onChange={e => setFournisseurId(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
          <option value="">-- Selectionner un fournisseur --</option>
          {fournisseurs.map(f => (
            <option key={f.id} value={f.id}>{f.nom}</option>
          ))}
        </select>
        {fournisseur && (
          <div className="flex items-center justify-between">
            {fournisseur.telephone ? (
              <p className="text-xs text-muted-foreground">Tel: {fournisseur.telephone}</p>
            ) : <span />}
            <button type="button" onClick={() => setEditingFournisseur(fournisseur)}
              className="text-xs font-bold text-primary hover:underline">✏️ Modifier</button>
          </div>
        )}
      </div>

      {/* ── Inline Article Selector ─────────────────────────────────────────── */}
      <div className="bg-card rounded-xl border border-border flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <p className="text-sm font-bold text-foreground">Choisir les articles</p>
            <p className="text-xs text-muted-foreground">
              {lignes.filter(l => l.articleId).length} selectionne(s) — {filteredArticles.length} article(s)
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 py-2.5 border-b border-border">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-background">
            <svg className="w-4 h-4 text-muted-foreground shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" value={artSearch} onChange={e => setArtSearch(e.target.value)}
              placeholder="Rechercher par nom..."
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none" />
            {artSearch && (
              <button onClick={() => setArtSearch("")} className="text-muted-foreground">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
        </div>

        {/* Sort toggles + filtre spécialisation acheteur */}
        <div className="flex gap-2 px-3 py-2 border-b border-border overflow-x-auto">
          {specialites.length > 0 && (
            <button onClick={() => setShowAllFamilies(v => !v)}
              title={specialites.join(", ")}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${showAllFamilies ? "bg-muted text-muted-foreground" : "bg-emerald-600 text-white"}`}>
              {showAllFamilies ? "🔎 Voir tout" : `⭐ Mes familles (${specialites.length})`}
            </button>
          )}
          {([
            { key: "nom",      label: "A→Z" },
            { key: "stock",    label: "Stock" },
            { key: "rotation", label: "Rotation" },
          ] as { key: "nom" | "stock" | "rotation"; label: string }[]).map(s => (
            <button key={s.key} onClick={() => setArtSort(s.key)}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${artSort === s.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {s.label}
            </button>
          ))}
          {zoneFilter && (
            <button onClick={() => setZoneFilter("")}
              className="shrink-0 px-2 py-1.5 rounded-xl text-xs font-bold bg-orange-100 text-orange-700 hover:bg-orange-200">
              ✕ {zoneFilter}
            </button>
          )}
        </div>

        {/* Zone filter chips */}
        {availableZones.length > 0 && (
          <div className="flex gap-2 px-3 py-2 border-b border-border overflow-x-auto flex-wrap">
            {availableZones.map(zone => (
              <button
                key={zone}
                onClick={() => setZoneFilter(zoneFilter === zone ? "" : zone)}
                className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  zoneFilter === zone
                    ? "bg-orange-500 text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/70"
                }`}>
                📍 {zone}
              </button>
            ))}
          </div>
        )}

        {/* Accordion par famille */}
        {(() => {
          if (filteredArticles.length === 0) return (
            <div className="py-8 flex flex-col items-center gap-2 text-center">
              <p className="text-sm text-muted-foreground">Aucun article trouvé</p>
              <button onClick={() => setArtSearch("")} className="text-xs text-primary underline">Effacer la recherche</button>
            </div>
          )
          const grouped: Map<string, typeof filteredArticles> = new Map()
          for (const a of filteredArticles) {
            const fam = a.famille?.trim() || "Autres"
            if (!grouped.has(fam)) grouped.set(fam, [])
            grouped.get(fam)!.push(a)
          }
          const families = [...grouped.keys()].sort((a, b) => a.localeCompare(b, "fr"))
          const ArticleRow = ({ a }: { a: typeof filteredArticles[0] }) => {
            const inCart = lignes.some(l => l.articleId === a.id)
            const rotCount = globalRotation[a.id] ?? 0
            return (
              <label
                className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors border-b border-border last:border-0 ${inCart ? "bg-primary/5" : "hover:bg-muted/50"}`}>
                <input type="checkbox" checked={inCart}
                  onChange={e => {
                    if (e.target.checked) {
                      const emptyIdx = lignes.findIndex(l => !l.articleId)
                      if (emptyIdx >= 0) updateLigne(emptyIdx, { articleId: a.id })
                      else setLignes(prev => [...prev, { ...EMPTY_LIGNE(), articleId: a.id, prixAchat: String(a.prixAchat) }])
                    } else {
                      const idx = lignes.findIndex(l => l.articleId === a.id)
                      if (idx >= 0) {
                        if (lignes.length === 1) setLignes([EMPTY_LIGNE()])
                        else removeLigne(idx)
                      }
                    }
                  }}
                  className="w-4 h-4 rounded accent-primary shrink-0" />
                <img src={a.photo || "https://placehold.co/40x40/e2e8f0/64748b?text=Art"}
                  alt={a.nom}
                  className="w-9 h-9 rounded-lg object-cover border border-border shrink-0"
                  onError={e => { e.currentTarget.src = "https://placehold.co/40x40/e2e8f0/64748b?text=Art" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-foreground truncate">{a.nom}</p>
                  {a.nomAr && <p className="text-[10px] text-muted-foreground font-arabic" dir="rtl" lang="ar">{a.nomAr}</p>}
                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${a.stockDisponible > 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                      {a.stockDisponible > 0 ? `${a.stockDisponible} ${a.unite}` : "Rupture"}
                    </span>
                    {rotCount > 0 && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-700">{rotCount}×</span>}
                  </div>
                </div>
                <span className="text-xs font-bold text-primary shrink-0">{a.prixAchat} DH</span>
              </label>
            )
          }
          return (
            <div className="max-h-80 overflow-y-auto divide-y divide-border">
              {families.map(fam => {
                const arts = grouped.get(fam)!
                const selectedInFam = arts.filter(a => lignes.some(l => l.articleId === a.id)).length
                const isOpen = openFamilies.has(fam)
                return (
                  <div key={fam}>
                    <button
                      type="button"
                      onClick={() => setOpenFamilies(prev => {
                        const next = new Set(prev)
                        if (next.has(fam)) next.delete(fam)
                        else next.add(fam)
                        return next
                      })}
                      className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/60 hover:bg-muted transition-colors text-left">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-foreground uppercase tracking-wide">{fam}</span>
                        <span className="text-[10px] text-muted-foreground">({arts.length})</span>
                        {selectedInFam > 0 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-600 text-white">{selectedInFam} ✓</span>
                        )}
                      </div>
                      <svg className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {isOpen && arts.map(a => <ArticleRow key={a.id} a={a} />)}
                  </div>
                )
              })}
            </div>
          )
        })()}
      </div>

      {/* Articles lines detail */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground">
            Details articles ({lignes.filter(l => l.articleId).length})
          </h3>
        </div>

        {lignes.map((ligne, i) => {
          const art = articles.find(a => a.id === ligne.articleId)
          if (!art) return null  // hide empty lines — selection done via checkboxes above
          const pa = resolvePA(ligne)
          const qty = resolveQty(ligne, art)
          const sousTotal = !isNaN(pa) && qty > 0 ? qty * pa : 0
          const hasUM = !!(art?.um && art?.colisageParUM)
          const history = art ? getHistory(art.id) : []
          const lastPA = history[0]?.prixAchat

          return (
            <div key={i} className="bg-card rounded-xl border border-border p-4 flex flex-col gap-3">
              {/* Header row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <img src={art.photo || "https://placehold.co/32x32/e2e8f0/64748b?text=Art"}
                    alt={`${art.nom} produit selectionne`}
                    className="w-8 h-8 rounded-lg object-cover border border-border shrink-0"
                    onError={e => { e.currentTarget.src = "https://placehold.co/32x32/e2e8f0/64748b?text=Art" }} />
                  <span className="text-sm font-bold text-foreground">{art.nom}</span>
                </div>
                <div className="flex items-center gap-2">
                  {history.length > 0 && (
                    <button type="button" onClick={() => setHistoryArtId(historyArtId === art.id ? null : art.id)}
                      className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                      PA hist.
                    </button>
                  )}
                  <button onClick={() => removeLigne(i)} className="text-destructive p-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Article info + last PA */}
              {art && (
                <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800 flex flex-wrap gap-3">
                  <span>Stock dispo: <strong>{art.stockDisponible} {art.unite}</strong></span>
                  <span>PA ref: <strong>{art.prixAchat} DH/{art.unite}</strong></span>
                  {lastPA !== undefined && (
                    <span className={`font-semibold ${lastPA > art.prixAchat ? "text-red-700" : "text-green-700"}`}>
                      Dernier PA: {lastPA} DH
                      {lastPA > art.prixAchat ? " (+)" : " (-)"}
                    </span>
                  )}
                  {art.um && <span>UM: {art.um} = {art.colisageParUM} {art.unite}</span>}
                </div>
              )}

              {/* PA History inline panel */}
              {historyArtId === art?.id && history.length > 0 && (
                <div className="rounded-lg border border-blue-200 bg-white overflow-hidden">
                  <div className="px-3 py-2 bg-blue-50 flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-800">Historique Prix d'Achat — {art.nom}</span>
                    <button onClick={() => setHistoryArtId(null)}
                      className="text-blue-500 text-xs font-bold">Fermer</button>
                  </div>
                  <div className="divide-y divide-border max-h-48 overflow-y-auto">
                    {history.map((h, hi) => (
                      <div key={hi} className="flex items-center justify-between px-3 py-2 text-xs">
                        <div>
                          <p className="font-semibold text-foreground">{h.fournisseurNom}</p>
                          <p className="text-muted-foreground">{h.date} {h.quantite ? `• ${h.quantite} ${art.unite}` : ""}</p>
                        </div>
                        <span className="font-bold text-primary">{h.prixAchat} DH/{art.unite}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unit mode selector — only when article has UM */}
              {art && hasUM && (
                <div className="flex rounded-lg overflow-hidden border border-border bg-muted">
                  <button type="button" onClick={() => updateLigne(i, { uniteMode: "base", quantite: "", totalPaye: "" })}
                    className={`flex-1 py-1.5 text-xs font-semibold transition-colors ${ligne.uniteMode === "base" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
                    {art.unite}
                  </button>
                  <button type="button" onClick={() => updateLigne(i, { uniteMode: art.um!, quantite: "", totalPaye: "" })}
                    className={`flex-1 py-1.5 text-xs font-semibold transition-colors ${ligne.uniteMode === art.um ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
                    {art.um} ({art.colisageParUM} {art.unite})
                  </button>
                </div>
              )}

              {/* Calc mode: unit price or total paid */}
              <div className="flex rounded-lg overflow-hidden border border-border bg-muted">
                <button type="button" onClick={() => updateLigne(i, { calcMode: "unit" })}
                  className={`flex-1 py-1.5 text-xs font-semibold transition-colors ${ligne.calcMode === "unit" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
                  Qty x PA unitaire
                </button>
                <button type="button" onClick={() => updateLigne(i, { calcMode: "total" })}
                  className={`flex-1 py-1.5 text-xs font-semibold transition-colors ${ligne.calcMode === "total" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
                  Total paye / Qty
                </button>
              </div>

              {/* Inputs depending on calc mode */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">
                    Quantite ({ligne.uniteMode === "base" || !art?.um ? art?.unite ?? "unite" : ligne.uniteMode})
                  </label>
                  <input type="number" min="0" step="0.01"
                    value={ligne.quantite}
                    onChange={e => updateLigne(i, { quantite: e.target.value })}
                    className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="0" />
                  {hasUM && ligne.uniteMode === art?.um && ligne.quantite && art?.colisageParUM && (
                    <p className="text-[11px] text-muted-foreground">= {(Number(ligne.quantite) * art.colisageParUM).toFixed(1)} {art.unite}</p>
                  )}
                </div>

                {ligne.calcMode === "unit" ? (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground">PA unitaire (DH/{art?.unite ?? "u"})</label>
                    <input type="number" min="0" step="0.01"
                      value={ligne.prixAchat}
                      onChange={e => updateLigne(i, { prixAchat: e.target.value })}
                      className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="0.00" />
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground">Total paye (DH)</label>
                    <input type="number" min="0" step="0.01"
                      value={ligne.totalPaye}
                      onChange={e => updateLigne(i, { totalPaye: e.target.value })}
                      className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="0.00" />
                    {!isNaN(pa) && pa > 0 && (
                      <p className="text-[11px] text-blue-700 font-semibold">
                        = {pa.toFixed(2)} DH/{art?.unite ?? "u"}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Sous-total */}
              {sousTotal > 0 && (
                <div className="flex items-center justify-between text-sm font-bold pt-1 border-t border-border">
                  <span className="text-muted-foreground text-xs">Sous-total</span>
                  <span className="text-primary">{sousTotal.toLocaleString("fr-MA", { minimumFractionDigits: 2 })} DH</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Total general */}
      <div className="bg-primary/10 rounded-xl px-4 py-3 flex items-center justify-between border border-primary/20">
        <span className="font-bold text-foreground">Total General</span>
        <span className="text-xl font-black text-primary">{totalGeneral.toLocaleString("fr-MA", { minimumFractionDigits: 2 })} DH</span>
      </div>

      {/* Email notification — read-only for acheteur, configured by admin */}
      <div className="bg-card rounded-xl p-4 border border-border flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-foreground uppercase tracking-wide">Email de notification</label>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted rounded-full px-2 py-0.5">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Configure par l'admin
          </span>
        </div>
        <div className="w-full px-3 py-2.5 rounded-lg border border-border bg-muted text-sm text-muted-foreground font-mono select-none">
          {emailDest || "—"}
        </div>
      </div>

      {/* Submit */}
      <button onClick={handleSubmit}
        disabled={sending || !fournisseurId || lignes.some(l => !l.articleId || !l.quantite || (l.calcMode === "unit" && !l.prixAchat) || (l.calcMode === "total" && !l.totalPaye))}
        className="w-full py-3.5 bg-primary text-primary-foreground rounded-xl font-bold disabled:opacity-50 transition-opacity hover:opacity-90 flex items-center justify-center gap-2">
        {sending ? (
          <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Validation...</>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Valider et envoyer workflow
          </>
        )}
      </button>
      </>)}

      {/* ═══ CHARGES PAR ARTICLE ═════════════════════════════════════════════ */}
      {activeTab === "charges" && (
        <ChargesParArticle articles={articles} acheteurNom={user.name} />
      )}

      {/* ═══ CAMERA QUALITE IA ════════════════════════════════════════════════ */}
      {activeTab === "camera" && (
        <CameraQualiteIA articles={articles} fournisseurs={fournisseurs} user={user} />
      )}

      {/* ═══ COMPARATIF FOURNISSEURS ══════════════════════════════════════════ */}
      {activeTab === "comparatif" && (
        <ComparatifFournisseurs articles={articles} fournisseurs={fournisseurs} user={user} />
      )}

      {/* ═══ AVIS ════════════════════════════════════════════════════════════ */}
      {activeTab === "avis" && (
        <AvisModule user={user} />
      )}

      {/* ═══ MES ACHATS — Historique des bons d'achat de cet acheteur ═══════ */}
      {activeTab === "mes_achats" && (() => {
        const myBons = store.getBonsAchat()
          .filter(b => b.acheteurId === user.id || b.acheteurNom === user.name)
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 60)

        // Group by date
        const grouped: Record<string, typeof myBons> = {}
        myBons.forEach(b => {
          if (!grouped[b.date]) grouped[b.date] = []
          grouped[b.date].push(b)
        })

        return (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-foreground">Mes Bons d&apos;Achat</h3>
                <p className="text-xs text-muted-foreground">{myBons.length} bon(s) enregistre(s)</p>
              </div>
              <button onClick={() => setArticles(onlyActiveArticles(store.getArticles()))}
                className="p-2 rounded-xl bg-muted hover:bg-muted/80 transition-colors">
                <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>

            {myBons.length === 0 ? (
              <div className="bg-card rounded-2xl border border-border p-10 flex flex-col items-center gap-2 text-center">
                <svg className="w-10 h-10 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-sm font-semibold text-muted-foreground">Aucun bon d&apos;achat enregistre</p>
                <button onClick={() => setActiveTab("bon")} className="mt-1 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: "oklch(0.38 0.2 260)" }}>
                  Passer un achat
                </button>
              </div>
            ) : (
              Object.entries(grouped)
                .sort(([a], [b]) => b.localeCompare(a))
                .map(([date, bons]) => (
                  <div key={date} className="flex flex-col gap-2">
                    {/* Date separator */}
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${date === store.today() ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                        {date === store.today() ? "Aujourd\'hui" : date}
                      </span>
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-[11px] text-muted-foreground">
                        {bons.reduce((s, b) => s + b.lignes.reduce((ss, l) => ss + l.quantite * l.prixAchat, 0), 0).toLocaleString("fr-MA")} DH
                      </span>
                    </div>
                    {bons.map(bon => {
                      const total = bon.lignes.reduce((s, l) => s + l.quantite * l.prixAchat, 0)
                      return (
                        <div key={bon.id} className="bg-card rounded-xl border border-border p-4 flex flex-col gap-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-sm text-foreground">{bon.fournisseurNom}</p>
                              <p className="text-xs text-muted-foreground font-mono">{bon.id}</p>
                              {bon.depotNom && (
                                <p className="text-xs text-blue-700 font-medium">Depot: {bon.depotNom}</p>
                              )}
                            </div>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-800 shrink-0">
                              {bon.statut}
                            </span>
                          </div>
                          <div className="flex flex-col gap-1">
                            {bon.lignes.map((l, i) => (
                              <div key={i} className="flex items-center justify-between text-xs">
                                <span className="text-foreground">{l.articleNom}</span>
                                <span className="font-semibold text-muted-foreground">
                                  {l.quantite} × {l.prixAchat} DH = {(l.quantite * l.prixAchat).toLocaleString("fr-MA")} DH
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-border">
                            <span className="text-xs text-muted-foreground">{bon.lignes.length} article(s)</span>
                            <span className="text-sm font-extrabold text-primary">{total.toLocaleString("fr-MA", { minimumFractionDigits: 2 })} DH</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))
            )}
          </div>
        )
      })()}

      {/* ══ PO DETAIL MODAL — Confirmer les détails d'un bon d'achat ════════ */}
      {poModalId && (() => {
        const po = pendingPOs.find(p => p.id === poModalId) ?? store.getPurchaseOrders().find(p => p.id === poModalId)
        if (!po) return null
        const poArt = store.getArticles().find(a => a.id === po.articleId)
        const totalCalc = (Number(poDetail.quantite) || 0) * (Number(poDetail.prixUnitaire) || 0)
        // Le bouton Confirmer ignorait ce réglage et bloquait TOUJOURS sans
        // photo, même config désactivée côté BO — c'était la vraie cause du
        // "camera reste obligatoire malgré la désactivation".
        const photoObligatoire = store.getProcessConfig().photoAchatObligatoire !== false
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={() => setPoModalId(null)}>
            <div className="w-full max-w-lg bg-white rounded-t-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
              {/* Modal header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-green-50">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-green-700">Confirmer le bon d&apos;achat</p>
                  <p className="text-base font-bold text-slate-800 mt-0.5">{po.articleNom}</p>
                  <p className="text-xs text-slate-500 font-mono">{po.id}</p>
                </div>
                <button onClick={() => setPoModalId(null)} className="p-2 rounded-lg hover:bg-green-100 text-slate-500">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="px-5 py-4 flex flex-col gap-4 max-h-[75vh] overflow-y-auto">

                {/* Qty + Prix */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Quantite ({po.articleUnite}) *</label>
                    <input
                      type="number" min="0"
                      value={poDetail.quantite}
                      onChange={e => {
                        const v = e.target.value
                        setPoDetail(p => ({
                          ...p, quantite: v,
                          nbUnites: poArt?.colisageParUM ? String(Math.round(((Number(v) || 0) / poArt.colisageParUM) * 100) / 100) : p.nbUnites,
                        }))
                      }}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-green-400"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Prix unitaire (DH/{po.articleUnite}) *</label>
                    <input
                      type="number" min="0" step="0.01"
                      value={poDetail.prixUnitaire}
                      onChange={e => setPoDetail(p => ({ ...p, prixUnitaire: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-green-400"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                {/* Nombre d'unités (caisses/cartons…) — recalcule la quantité totale */}
                {poArt?.colisageParUM ? (
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Nombre d&apos;unités ({poArt.um ?? "UM"} de {poArt.colisageParUM} {po.articleUnite})
                    </label>
                    <input
                      type="number" min="0" step="0.01"
                      value={poDetail.nbUnites}
                      onChange={e => {
                        const v = e.target.value
                        const nb = Number(v) || 0
                        setPoDetail(p => ({ ...p, nbUnites: v, quantite: String(Math.round(nb * (poArt.colisageParUM ?? 0) * 100) / 100) }))
                      }}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-green-400"
                      placeholder="0"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Modifier ce champ recalcule automatiquement la quantité totale ci-dessus.</p>
                  </div>
                ) : null}

                {/* Flux d'achat (conformité CGI Maroc) — liste déroulante */}
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Type d&apos;achat *</label>
                  {(() => {
                    const TYPE_FLUX_OPTIONS: [typeof poDetail.typeFlux, string, string][] = [
                      ["marche_gros", "Marché de gros", "Bordereau/carreau — taxe communale 7% en charge"],
                      ["agriculteur_direct", "Agriculteur direct", "Auto-facturation — TVA 0%, CIN obligatoire"],
                      ["societe_structuree", "Société structurée", "Fournisseur avec ICE — TVA 0%"],
                    ]
                    const selected = TYPE_FLUX_OPTIONS.find(([val]) => val === poDetail.typeFlux)
                    return (
                      <>
                        <select
                          value={poDetail.typeFlux}
                          onChange={e => setPoDetail(p => ({ ...p, typeFlux: e.target.value as typeof poDetail.typeFlux }))}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-green-400">
                          {TYPE_FLUX_OPTIONS.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                        </select>
                        {selected && <p className="text-[10px] text-slate-500 mt-1">{selected[2]}</p>}
                      </>
                    )
                  })()}
                  {poDetail.typeFlux === "marche_gros" && (
                    <p className="text-[10px] text-slate-400 mt-1">Taxe communale 7% calculée automatiquement sur le total ({(((Number(poDetail.quantite) || 0) * (Number(poDetail.prixUnitaire) || 0)) * 0.07).toFixed(2)} DH).</p>
                  )}
                  {poDetail.typeFlux === "agriculteur_direct" && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <input type="text" placeholder="Nom agriculteur *" value={poDetail.agriculteurNom}
                        onChange={e => setPoDetail(p => ({ ...p, agriculteurNom: e.target.value }))}
                        className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm" />
                      <input type="text" placeholder="CIN *" value={poDetail.agriculteurCIN}
                        onChange={e => setPoDetail(p => ({ ...p, agriculteurCIN: e.target.value }))}
                        className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm" />
                    </div>
                  )}
                  {poDetail.typeFlux === "societe_structuree" && !fournisseurs.find(f => f.id === poDetail.fournisseurId)?.ice && poDetail.fournisseurId && (
                    <p className="text-[10px] text-amber-600 mt-1">⚠️ Ce fournisseur n&apos;a pas d&apos;ICE renseigné — complétez sa fiche pour ce flux.</p>
                  )}
                </div>

                {/* Charges par article (plusieurs possibles) — charge | coût + "+" */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700">Charges (coût de revient)</label>
                    <button type="button" onClick={createNewCharge} className="text-[11px] font-bold text-amber-600 underline">+ Nouvelle charge</button>
                  </div>
                  {/* En-têtes Charge | Coût */}
                  {poDetail.chargeIds.length > 0 && (
                    <div className="flex items-center gap-2 px-1 mb-1">
                      <span className="flex-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Charge</span>
                      <span className="w-24 text-right text-[10px] font-bold uppercase tracking-wide text-slate-400">Coût (DH/u)</span>
                      <span className="w-7" />
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    {poDetail.chargeIds.map((cid, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <select
                          value={cid}
                          onChange={e => setChargeRow(idx, e.target.value)}
                          className="flex-1 px-3 py-2.5 rounded-xl border border-amber-300 bg-amber-50 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
                          <option value="">— Choisir —</option>
                          {chargesArticle.map(c => (
                            <option key={c.id} value={c.id}>{c.nom}</option>
                          ))}
                        </select>
                        <input type="text" inputMode="decimal" className="w-24 px-2 py-2 rounded-lg border border-amber-300 bg-white text-right text-sm font-bold font-mono text-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
                          placeholder={chargeMontantOf(cid).toFixed(2)}
                          value={poDetail.chargeMontants[idx] ?? ""}
                          onChange={e => setChargeMontantOverride(idx, e.target.value.replace(",", "."))} />
                        <button type="button" onClick={() => removeChargeRow(idx)} title="Retirer"
                          className="shrink-0 w-7 h-7 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-red-100 hover:text-red-600">×</button>
                      </div>
                    ))}
                  </div>
                  {/* + ajouter une charge (chariot, manutention…) */}
                  <button type="button" onClick={addChargeRow}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border-2 border-dashed border-amber-300 text-amber-700 text-sm font-bold hover:bg-amber-50">
                    <span className="text-lg leading-none">+</span> Ajouter une charge (chariot, manutention…)
                  </button>
                  {poDetail.chargeIds.length > 0 && (
                    <div className="flex items-center justify-between mt-2 px-1">
                      <span className="text-xs font-semibold text-slate-600">Total charges / unité</span>
                      <span className="text-sm font-black text-amber-800 font-mono">{totalChargeUnit().toFixed(2)} DH</span>
                    </div>
                  )}
                </div>

                {/* Total preview + coût de revient */}
                {totalCalc > 0 && (() => {
                  const cm = totalChargeUnit()
                  const qte = Number(poDetail.quantite) || 0
                  const pu = Number(poDetail.prixUnitaire) || 0
                  const totalCharges = cm * qte
                  return (
                    <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-green-700">Total achat</span>
                        <span className="text-lg font-black text-green-800">{totalCalc.toLocaleString("fr-MA")} DH</span>
                      </div>
                      {cm > 0 && (
                        <>
                          <div className="flex items-center justify-between text-xs text-amber-700">
                            <span>+ Charges ({cm} DH/u × {qte})</span>
                            <span className="font-bold">+{totalCharges.toLocaleString("fr-MA")} DH</span>
                          </div>
                          <div className="flex items-center justify-between border-t border-green-200 pt-1.5">
                            <span className="text-sm font-semibold text-orange-700">Coût de revient ({(pu + cm).toFixed(2)} DH/u)</span>
                            <span className="text-base font-black text-orange-800">{(totalCalc + totalCharges).toLocaleString("fr-MA")} DH</span>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })()}

                {/* Fournisseur */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700">Fournisseur *</label>
                    <button type="button" onClick={() => setShowNewFournisseur(true)}
                      className="text-xs font-bold text-green-700 hover:underline">+ Nouveau</button>
                  </div>
                  <select
                    value={poDetail.fournisseurId}
                    onChange={e => setPoDetail(p => ({ ...p, fournisseurId: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
                    <option value="">-- Selectionner un fournisseur --</option>
                    {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                  </select>
                  {poDetail.fournisseurId && (() => {
                    const poFournisseur = fournisseurs.find(f => f.id === poDetail.fournisseurId)
                    if (!poFournisseur) return null
                    return (
                      <div className="flex items-center justify-between mt-1">
                        {poFournisseur.telephone ? (
                          <p className="text-xs text-slate-500">Tel: {poFournisseur.telephone}</p>
                        ) : <span />}
                        <button type="button" onClick={() => setEditingFournisseur(poFournisseur)}
                          className="text-xs font-bold text-green-700 hover:underline">✏️ Modifier</button>
                      </div>
                    )
                  })()}
                </div>

                {/* Paiement */}
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Etat de paiement *</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["impaye", "partiel", "solde"] as const).map(s => (
                      <button key={s} type="button"
                        onClick={() => setPoDetail(p => ({ ...p, statutPaiement: s }))}
                        className={`py-2.5 rounded-xl text-xs font-bold border transition-all ${
                          poDetail.statutPaiement === s
                            ? s === "solde" ? "bg-green-600 text-white border-green-600"
                              : s === "partiel" ? "bg-amber-500 text-white border-amber-500"
                              : "bg-red-500 text-white border-red-500"
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                        }`}>
                        {s === "impaye" ? "Impaye" : s === "partiel" ? "Partiel" : "Solde"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Montant paye si partiel */}
                {poDetail.statutPaiement === "partiel" && (
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Montant deja paye (DH)</label>
                    <input
                      type="number" min="0" step="0.01"
                      value={poDetail.montantPaye}
                      onChange={e => setPoDetail(p => ({ ...p, montantPaye: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                      placeholder="0.00"
                    />
                  </div>
                )}

                {/* Note */}
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Note de paiement (optionnel)</label>
                  <input
                    type="text"
                    value={poDetail.notePaiement}
                    onChange={e => setPoDetail(p => ({ ...p, notePaiement: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    placeholder="ex: Paye 50% cash, reste en cheque"
                  />
                </div>

                {/* Caisses fournisseur — caisses vides échangées à cet achat */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700">Caisses fournisseur</label>
                    <button type="button" onClick={addCaisseRow} className="text-[11px] font-bold text-green-600 underline">+ Ajouter</button>
                  </div>
                  {poDetail.caissesFournisseur.length > 0 && (
                    <div className="flex flex-col gap-2.5">
                      {poDetail.caissesFournisseur.map((c, idx) => (
                        <div key={idx} className="flex flex-col gap-1.5 p-2 rounded-lg border border-slate-200 bg-slate-50">
                          <div className="flex items-center gap-2">
                            <select
                              value={c.type}
                              onChange={e => setCaisseRow(idx, { type: e.target.value as TypeCaisse })}
                              className="flex-1 px-2 py-2 rounded-lg border border-slate-200 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
                              {(Object.keys(TYPES_CAISSE_LABELS) as TypeCaisse[]).map(t => (
                                <option key={t} value={t}>{TYPES_CAISSE_LABELS[t]}</option>
                              ))}
                            </select>
                            <select
                              value={c.sens}
                              onChange={e => setCaisseRow(idx, { sens: e.target.value as "donnee" | "recue" })}
                              className="px-2 py-2 rounded-lg border border-slate-200 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
                              <option value="recue">Reçue du fournisseur</option>
                              <option value="donnee">Donnée au fournisseur</option>
                            </select>
                            <button type="button" onClick={() => removeCaisseRow(idx)} title="Retirer"
                              className="shrink-0 w-7 h-7 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-red-100 hover:text-red-600">×</button>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 flex flex-col gap-0.5">
                              <label className="text-[10px] text-slate-500">Code caisses (optionnel)</label>
                              <input type="text" placeholder="ex: marquage / N° lot fournisseur" className="w-full px-2 py-2 rounded-lg border border-slate-200 bg-white text-sm"
                                value={c.code}
                                onChange={e => setCaisseRow(idx, { code: e.target.value })} />
                            </div>
                            <div className="w-20 flex flex-col gap-0.5">
                              <label className="text-[10px] text-slate-500">Qté</label>
                              <input type="number" min="0" placeholder="Qté" className="w-full px-2 py-2 rounded-lg border border-slate-200 bg-white text-right text-sm font-bold"
                                value={c.quantite}
                                onChange={e => setCaisseRow(idx, { quantite: e.target.value })} />
                            </div>
                          </div>
                          {poDetail.nbUnites && c.quantite === poDetail.nbUnites && (
                            <p className="text-[10px] text-slate-400">Pré-rempli depuis le nombre d&apos;unités — modifiable si le compte réel diffère.</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {poDetail.caissesFournisseur.length === 0 && (
                    <p className="text-[10px] text-slate-400">Aucune caisse échangée à noter pour cet achat.</p>
                  )}
                </div>

                {/* ── Photo — section entièrement masquée si désactivée côté BO
                       (ProcessConfig.photoAchatObligatoire === false), pas juste
                       affichée en "optionnelle" ── */}
                {photoObligatoire && (
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                      Photo marchandise (obligatoire)
                    </label>
                    <POCameraCapture
                      value={poDetail.photoAchat}
                      onChange={url => setPoDetail(p => ({ ...p, photoAchat: url }))}
                    />
                    {!poDetail.photoAchat && (
                      <p className="text-[11px] text-red-600 font-medium flex items-center gap-1">
                        <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Photo requise — permet a SIMOHAMMED de controler la qualite
                      </p>
                    )}
                  </div>
                )}

                {/* Confirm button */}
                <button
                  onClick={confirmPO}
                  disabled={poSaving || !poDetail.quantite || !poDetail.prixUnitaire || !poDetail.fournisseurId || (photoObligatoire && !poDetail.photoAchat)}
                  className="w-full py-3.5 rounded-xl bg-green-600 text-white font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-2 transition-opacity hover:bg-green-700">
                  {poSaving ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  Confirmer le bon d&apos;achat
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// CHARGES PAR ARTICLE — balance, manutentionnaire, chariot, etc.
// ─────────────────────────────────────────────────────────────

const TYPES_CHARGES = [
  { id: "balance",        label: "Balance",           icon: "M3 6h18M3 12h18M3 18h18" },
  { id: "manutentionnaire",label: "Manutentionnaire", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" },
  { id: "chariot",        label: "Chariot",           icon: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17" },
  { id: "triporteur",     label: "Triporteur",        icon: "M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" },
  { id: "transport",      label: "Transport",         icon: "M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" },
  { id: "dechargement",   label: "Dechargement",      icon: "M19 14l-7 7m0 0l-7-7m7 7V3" },
  { id: "emballage",      label: "Emballage",         icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" },
  { id: "autre",          label: "Autre",             icon: "M12 4v16m8-8H4" },
]

interface ChargeArticle {
  id: string
  articleId: string
  articleNom: string
  unite: string
  date: string
  charges: { typeId: string; montant: number; note: string }[]
  totalCharges: number
  qteAchetee: number
  prixAchat: number
  coutRevientUnitaire: number
}

const CA_KEY = "fl_charges_articles"
function loadCA(): ChargeArticle[] { try { return JSON.parse(localStorage.getItem(CA_KEY) ?? "[]") } catch { return [] } }
function saveCA(l: ChargeArticle[]) { localStorage.setItem(CA_KEY, JSON.stringify(l)) }

function ChargesParArticle({ articles, acheteurNom }: { articles: Article[]; acheteurNom: string }) {
  const [entries, setEntries] = useState<ChargeArticle[]>(() => loadCA())
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    articleId: "",
    qteAchetee: "",
    prixAchat: "",
    charges: TYPES_CHARGES.map(t => ({ typeId: t.id, montant: "", note: "" })),
  })
  const [editId, setEditId] = useState<string | null>(null)

  const totalChargesForForm = form.charges.reduce((s, c) => s + (Number(c.montant) || 0), 0)
  const qteNum = Number(form.qteAchetee) || 0
  const paNum = Number(form.prixAchat) || 0
  const coutRevient = qteNum > 0 ? (qteNum * paNum + totalChargesForForm) / qteNum : 0

  const save = () => {
    const art = articles.find(a => a.id === form.articleId)
    if (!art || !form.qteAchetee || !form.prixAchat) return
    const chargesFilled = form.charges.filter(c => Number(c.montant) > 0).map(c => ({ typeId: c.typeId, montant: Number(c.montant), note: c.note }))
    const entry: ChargeArticle = {
      id: editId ?? store.genId(),
      articleId: art.id,
      articleNom: art.nom,
      unite: art.unite,
      date: store.today(),
      charges: chargesFilled,
      totalCharges: totalChargesForForm,
      qteAchetee: qteNum,
      prixAchat: paNum,
      coutRevientUnitaire: coutRevient,
    }
    const updated = editId ? entries.map(e => e.id === editId ? entry : e) : [entry, ...entries]
    saveCA(updated)
    setEntries(updated)
    setShowForm(false)
    setEditId(null)
    setForm({ articleId: "", qteAchetee: "", prixAchat: "", charges: TYPES_CHARGES.map(t => ({ typeId: t.id, montant: "", note: "" })) })
  }

  const remove = (id: string) => { const u = entries.filter(e => e.id !== id); saveCA(u); setEntries(u) }

  const totalInvesti = entries.reduce((s, e) => s + e.qteAchetee * e.prixAchat + e.totalCharges, 0)

  return (
    <div className="flex flex-col gap-4">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-center">
          <p className="text-xl font-black text-slate-800">{entries.length}</p>
          <p className="text-[10px] text-slate-500">Achats charges</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-center">
          <p className="text-sm font-black text-amber-700">{entries.reduce((s, e) => s + e.totalCharges, 0).toLocaleString("fr-MA")} DH</p>
          <p className="text-[10px] text-amber-600">Total charges</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 text-center">
          <p className="text-sm font-black text-blue-700">{totalInvesti.toLocaleString("fr-MA")} DH</p>
          <p className="text-[10px] text-blue-600">Investi total</p>
        </div>
      </div>

      <button onClick={() => { setShowForm(s => !s); setEditId(null) }}
        className="w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 bg-green-600 text-white">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Ajouter charges pour un achat
      </button>

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col gap-3">
          <p className="text-sm font-bold text-slate-800">Saisir les charges liees a un achat</p>

          <ArticleCombobox
            articles={articles}
            value={form.articleId}
            onChange={(artId, _art) => setForm(p => ({ ...p, articleId: artId }))}
            placeholder="-- Article achete *"
          />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Qte achetee *</label>
              <input type="number" min="0" value={form.qteAchetee}
                onChange={e => setForm(p => ({ ...p, qteAchetee: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                placeholder="0" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Prix achat/unite *</label>
              <input type="number" min="0" step="0.01" value={form.prixAchat}
                onChange={e => setForm(p => ({ ...p, prixAchat: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                placeholder="0.00" />
            </div>
          </div>

          <p className="text-xs font-bold text-slate-700 mt-1">Charges liees (saisir uniquement celles applicables)</p>
          <div className="flex flex-col gap-2">
            {TYPES_CHARGES.map((t, i) => (
              <div key={t.id} className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={t.icon} />
                  </svg>
                </div>
                <span className="text-xs font-semibold text-slate-700 w-28 shrink-0">{t.label}</span>
                <input
                  type="number" min="0" step="0.5"
                  placeholder="DH"
                  value={form.charges[i].montant}
                  onChange={e => setForm(p => {
                    const charges = [...p.charges]
                    charges[i] = { ...charges[i], montant: e.target.value }
                    return { ...p, charges }
                  })}
                  className="flex-1 px-2 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-green-400" />
              </div>
            ))}
          </div>

          {/* Cout de revient preview */}
          {coutRevient > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <p className="text-xs text-green-700 font-semibold mb-1">Cout de revient unitaire estime</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Achat: {(qteNum * paNum).toLocaleString("fr-MA")} DH + Charges: {totalChargesForForm.toLocaleString("fr-MA")} DH</span>
                <span className="text-base font-black text-green-700">{coutRevient.toFixed(2)} DH / unite</span>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold border border-slate-200 text-slate-600">
              Annuler
            </button>
            <button onClick={save}
              disabled={!form.articleId || !form.qteAchetee || !form.prixAchat}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-green-600 text-white disabled:opacity-40">
              Enregistrer
            </button>
          </div>
        </div>
      )}

      {/* Entries list */}
      {entries.length === 0 && !showForm && (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
          <svg className="w-10 h-10 text-slate-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M12 7h.01M9 7H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V9a2 2 0 00-2-2h-2" />
          </svg>
          <p className="text-sm text-slate-500">Aucune charge saisie</p>
          <p className="text-xs text-slate-400 mt-1">Saisissez les charges balance, manutentionnaire, chariot, triporteur, etc.</p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {entries.map(entry => (
          <div key={entry.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="flex items-start justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
              <div>
                <p className="font-bold text-slate-800 text-sm">{entry.articleNom}</p>
                <p className="text-xs text-slate-500">{entry.date} — {entry.qteAchetee} {entry.unite} a {entry.prixAchat} DH</p>
              </div>
              <button onClick={() => remove(entry.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
            <div className="px-4 py-3 flex flex-col gap-2">
              {entry.charges.map(c => {
                const type = TYPES_CHARGES.find(t => t.id === c.typeId)
                return (
                  <div key={c.typeId} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 font-medium">{type?.label ?? c.typeId}</span>
                    <span className="font-bold text-slate-800">{c.montant.toLocaleString("fr-MA")} DH</span>
                  </div>
                )
              })}
              {entry.charges.length === 0 && <p className="text-xs text-slate-400">Aucune charge detail</p>}
              <div className="border-t border-slate-100 pt-2 mt-1 flex items-center justify-between">
                <span className="text-xs text-slate-500">Total charges</span>
                <span className="text-sm font-black text-amber-600">{entry.totalCharges.toLocaleString("fr-MA")} DH</span>
              </div>
              <div className="bg-green-50 border border-green-100 rounded-xl px-3 py-2 flex items-center justify-between">
                <span className="text-xs text-green-700 font-semibold">Cout de revient / unite</span>
                <span className="text-sm font-black text-green-700">{entry.coutRevientUnitaire.toFixed(2)} DH</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// AVIS MODULE (mobile — clients / fournisseurs / équipe)
// ─────────────────────────────────────────────────────────────

interface AvisEntry {
  id: string
  source: "client" | "fournisseur" | "equipe"
  nom: string
  message: string
  note: number     // 1–5
  date: string
  auteurId: string
  auteurNom: string
}

const AVIS_KEY = "fl_avis_mobile"

function loadAvis(): AvisEntry[] {
  try { return JSON.parse(localStorage.getItem(AVIS_KEY) ?? "[]") } catch { return [] }
}
function saveAvis(list: AvisEntry[]) {
  localStorage.setItem(AVIS_KEY, JSON.stringify(list))
}

function AvisModule({ user }: { user: User }) {
  const [avis, setAvis] = useState<AvisEntry[]>(() => loadAvis())
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ source: "client" as AvisEntry["source"], nom: "", message: "", note: 5 })
  const [filterSource, setFilterSource] = useState<AvisEntry["source"] | "all">("all")

  const filtered = avis.filter(a => filterSource === "all" || a.source === filterSource)
    .sort((a, b) => b.date.localeCompare(a.date))

  const submit = async () => {
    if (!form.nom.trim() || !form.message.trim()) return
    const newAvis: AvisEntry = {
      id: store.genId(),
      source: form.source,
      nom: form.nom.trim(),
      message: form.message.trim(),
      note: form.note,
      date: new Date().toISOString(),
      auteurId: user.id,
      auteurNom: user.name,
    }
    // ✅ Sauvegarde locale (optimistic UI — instantané)
    const updated = [newAvis, ...avis]
    saveAvis(updated)
    setAvis(updated)
    setForm({ source: "client", nom: "", message: "", note: 5 })
    setShowForm(false)
    // 🔄 Push vers /api/ext/feedbacks → centralisé fl_feedbacks (BO temps réel)
    try {
      await fetch("/api/ext/feedbacks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auteurId:   user.id,
          auteurNom:  user.name,
          auteurRole: user.role,
          note:       form.note,
          categorie:  form.source,            // client / fournisseur / equipe
          message:    `${form.nom.trim()} — ${form.message.trim()}`,
          source:     "mobile",
        }),
      })
    } catch { /* silencieux — l'avis local reste, sera resync à la prochaine connexion */ }
  }

  const SOURCE_CONFIG = {
    client:      { label: "Client", labelAr: "زبون",    color: "bg-emerald-500", light: "bg-emerald-50 border-emerald-200 text-emerald-800" },
    fournisseur: { label: "Fournisseur", labelAr: "مورد", color: "bg-amber-500",   light: "bg-amber-50 border-amber-200 text-amber-800" },
    equipe:      { label: "Equipe", labelAr: "فريق",    color: "bg-indigo-500",   light: "bg-indigo-50 border-indigo-200 text-indigo-800" },
  }

  const avgNote = avis.length > 0 ? (avis.reduce((s, a) => s + a.note, 0) / avis.length).toFixed(1) : "—"

  return (
    <div className="flex flex-col gap-4">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-card border border-border rounded-xl px-3 py-2.5 text-center">
          <p className="text-xl font-black text-foreground">{avis.length}</p>
          <p className="text-[10px] text-muted-foreground">Total avis</p>
        </div>
        <div className="bg-card border border-border rounded-xl px-3 py-2.5 text-center">
          <p className="text-xl font-black text-amber-500">{avgNote}</p>
          <p className="text-[10px] text-muted-foreground">Note moy./5</p>
        </div>
        <div className="bg-card border border-border rounded-xl px-3 py-2.5 text-center">
          <p className="text-xl font-black text-primary">
            {avis.filter(a => a.source === "client").length}
          </p>
          <p className="text-[10px] text-muted-foreground">Clients</p>
        </div>
      </div>

      {/* Filter + Add */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "client", "fournisseur", "equipe"] as const).map(s => (
          <button key={s} onClick={() => setFilterSource(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${filterSource === s ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>
            {s === "all" ? "Tous" : SOURCE_CONFIG[s].label}
          </button>
        ))}
        <button onClick={() => setShowForm(s => !s)}
          className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border border-primary text-primary hover:bg-primary/10 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nouvel avis
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-card rounded-2xl border border-border p-4 flex flex-col gap-3">
          <h4 className="text-sm font-bold text-foreground">Enregistrer un avis</h4>
          {/* Source */}
          <div className="flex gap-1 p-1 bg-muted rounded-lg">
            {(["client", "fournisseur", "equipe"] as const).map(s => (
              <button key={s} onClick={() => setForm(p => ({ ...p, source: s }))}
                className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-colors ${form.source === s ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
                {SOURCE_CONFIG[s].label}
              </button>
            ))}
          </div>
          <input type="text" placeholder="Nom (client / fournisseur / collaborateur) *"
            value={form.nom} onChange={e => setForm(p => ({ ...p, nom: e.target.value }))}
            className="px-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          <textarea rows={3} placeholder="Message / feedback *"
            value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
          {/* Star rating */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Note:</span>
            {[1,2,3,4,5].map(n => (
              <button key={n} onClick={() => setForm(p => ({ ...p, note: n }))}
                className="transition-transform hover:scale-110">
                <svg className="w-6 h-6" fill={n <= form.note ? "#f59e0b" : "none"} stroke="#f59e0b" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
              </button>
            ))}
            <span className="text-xs font-bold text-amber-500 ml-1">{form.note}/5</span>
          </div>
          <div className="flex gap-2">
            <button onClick={submit}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-primary hover:opacity-90 transition-opacity">
              Enregistrer
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2.5 rounded-xl text-xs font-bold border border-border text-muted-foreground hover:bg-muted transition-colors">
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-10 flex flex-col items-center gap-2 text-center">
          <svg className="w-10 h-10 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <p className="text-sm font-semibold text-muted-foreground">Aucun avis enregistré</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(a => {
            const cfg = SOURCE_CONFIG[a.source]
            return (
              <div key={a.id} className={`rounded-2xl border p-4 flex flex-col gap-2 ${cfg.light}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${cfg.color}`}>{cfg.label}</span>
                      <p className="font-bold text-foreground text-sm">{a.nom}</p>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(a.date).toLocaleDateString("fr-MA")} — par {a.auteurNom}
                    </p>
                  </div>
                  <div className="flex gap-0.5 shrink-0">
                    {[1,2,3,4,5].map(n => (
                      <svg key={n} className="w-3.5 h-3.5" fill={n <= a.note ? "#f59e0b" : "none"} stroke="#f59e0b" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                      </svg>
                    ))}
                  </div>
                </div>
                <p className="text-sm text-foreground leading-relaxed">{a.message}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
