"use client"

import { useState, useEffect, useMemo } from "react"
import {
  store,
  type User,
  type BonAchat,
  type BonLivraison,
  type Reception,
  type Article,
  type ContenantTare,
  type PurchaseOrder,
  type Depot,
} from "@/lib/store"

// ─────────────────────────────────────────────────────────────
// Unified reception item — abstracts BonAchat + PurchaseOrder
// ─────────────────────────────────────────────────────────────

interface ReceptionLigne {
  articleId: string
  articleNom: string
  unite: string
  quantite: number
  prixAchat: number
}

interface ReceptionItem {
  id: string
  date: string
  source: "bon_achat" | "purchase_order"
  fournisseurNom: string
  lignes: ReceptionLigne[]
  statut: string
  depotId?: string
  depotNom?: string
}

function bonToItem(b: BonAchat, articles: Article[]): ReceptionItem {
  return {
    id: b.id, date: b.date, source: "bon_achat",
    fournisseurNom: b.fournisseurNom, statut: b.statut,
    depotId: b.depotId, depotNom: b.depotNom,
    lignes: (b.lignes ?? []).map(l => ({
      articleId: l.articleId,
      articleNom: l.articleNom,
      unite: articles.find(a => a.id === l.articleId)?.unite ?? "kg",
      quantite: l.quantite,
      prixAchat: l.prixAchat,
    })),
  }
}

function poToItem(po: PurchaseOrder, articles: Article[]): ReceptionItem {
  return {
    id: po.id, date: po.date, source: "purchase_order",
    fournisseurNom: po.fournisseurNom, statut: po.statut,
    depotId: po.depotId, depotNom: po.depotNom,
    lignes: [{
      articleId: po.articleId,
      articleNom: po.articleNom,
      unite: po.articleUnite || articles.find(a => a.id === po.articleId)?.unite || "kg",
      quantite: po.quantite,
      prixAchat: po.prixUnitaire,
    }],
  }
}

// ─────────────────────────────────────────────────────────────
type MagTab = "reception" | "validation_bl" | "po_achat" | "besoin_sku" | "besoin_achat"
interface Props { user: User }
const DH  = (n: number) => n.toLocaleString("fr-MA", { minimumFractionDigits: 2 }) + " DH"
const QTE = (n: number) => n % 1 === 0 ? n.toString() : n.toFixed(2)

const MOTIFS_RELIQUAT = [
  { value: "",                   label: "— Motif (optionnel)" },
  { value: "non_recu",           label: "Non recu" },
  { value: "defect",             label: "Defectueux" },
  { value: "retour_fournisseur", label: "Retour fournisseur" },
  { value: "manque_stock",       label: "Manque stock" },
  { value: "erreur_commande",    label: "Erreur de commande" },
]

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

export default function MobileMagasinier({ user }: Props) {
  const [tab, setTab]                 = useState<MagTab>("reception")
  const [items, setItems]             = useState<ReceptionItem[]>([])
  const [bls, setBls]                 = useState<BonLivraison[]>([])
  const [articles, setArticles]       = useState<Article[]>([])
  const [receptions, setReceptions]   = useState<Reception[]>([])
  const [contenants, setContenants]   = useState<ContenantTare[]>([])
  const [depots, setDepots]           = useState<Depot[]>([])
  const [filterDepot, setFilterDepot] = useState<string>("all") // "all" or a depotId
  const [showAll, setShowAll]         = useState(true)          // include already-received bons
  const [allPos, setAllPos]           = useState<PurchaseOrder[]>([])
  const [besoinNet, setBesoinNet]     = useState<ReturnType<typeof store.computeBesoinNet>>([])
  const [bonsAchat, setBonsAchat]     = useState<BonAchat[]>([])

  const myDepotId = user.depotId ?? null

  const refresh = () => {
    try {
      const arts = store.getArticles()
      setArticles(arts)

      // All bons achat that are validé or receptionné (so magasinier can see history too)
      const bonStatuts = new Set(["validé", "receptionné", "brouillon"])
      const bons = store.getBonsAchat().filter(b => bonStatuts.has(b.statut))
      const bonItems = bons.map(b => bonToItem(b, arts))

      // All POs that are envoyé or receptionné
      const poStatuts = new Set(["envoyé", "receptionné"])
      const pos = store.getPurchaseOrders().filter(p => poStatuts.has(p.statut))
      const poItems = pos.map(p => poToItem(p, arts))

      // Merge — deduplicate by id, sort by date desc
      const seen = new Set<string>()
      const merged: ReceptionItem[] = []
      ;[...bonItems, ...poItems].forEach(it => {
        if (!seen.has(it.id)) { seen.add(it.id); merged.push(it) }
      })
      merged.sort((a, b) => b.date.localeCompare(a.date))
      setItems(merged)
    } catch (e) {
      console.error("[MobileMagasinier] refresh items error:", e)
    }

    try {
      setBls(store.getBonsLivraison().filter(bl => !bl.valideMagasinier))
    } catch (e) {
      console.error("[MobileMagasinier] refresh BLs error:", e)
      setBls([])
    }

    try {
      setReceptions(store.getReceptions())
    } catch (e) {
      setReceptions([])
    }

    try {
      setContenants(store.getContenantsConfig().filter(c => c.actif))
    } catch (e) {
      setContenants([])
    }

    try {
      const deps = store.getDepots()
      setDepots(deps)
      // Auto-select user's depot if assigned
      if (user.depotId && filterDepot === "all") setFilterDepot(user.depotId)
    } catch (e) {
      setDepots([])
    }

    try {
      setAllPos(store.getPurchaseOrders())
    } catch (e) {
      setAllPos([])
    }

    try {
      setBesoinNet(store.computeBesoinNet())
    } catch (e) {
      setBesoinNet([])
    }

    try {
      setBonsAchat(store.getBonsAchat())
    } catch (e) {
      setBonsAchat([])
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { refresh() }, [])

  // Pending bons = only those not yet fully received
  const pendingItems = useMemo(() =>
    items.filter(i => i.statut !== "receptionné"),
    [items]
  )

  const displayItems = useMemo(() => {
    let list = showAll ? items : pendingItems
    if (filterDepot !== "all") {
      list = list.filter(i => !i.depotId || i.depotId === filterDepot)
    }
    return list
  }, [items, pendingItems, showAll, filterDepot])

  const myDepot = useMemo(() => myDepotId ? depots.find(d => d.id === myDepotId) : null, [depots, myDepotId])

  const pendingBLs = bls.length

  return (
    <div className="flex flex-col min-h-screen bg-background pb-4">

      {/* Depot banner */}
      {myDepot ? (
        <div className="flex items-center gap-2 px-4 py-2 bg-primary/5 border-b border-primary/20">
          <svg className="w-3.5 h-3.5 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />
          </svg>
          <span className="text-xs font-bold text-primary">{myDepot.nom}</span>
          {myDepot.ville && <span className="text-xs text-muted-foreground">— {myDepot.ville}</span>}
          <span className="ml-auto text-[10px] text-muted-foreground">Votre depot assigne</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200">
          <svg className="w-3.5 h-3.5 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-xs text-amber-700 font-medium">Tous les depots — aucun depot specifique assigne</span>
        </div>
      )}

      {/* Tab switcher — 5 tabs */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-3 pt-3">
        <div className="flex gap-1 bg-muted rounded-xl p-1 overflow-x-auto">
          {([
            { id: "reception",    label: "Reception",       badge: pendingItems.length, icon: "M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" },
            { id: "po_achat",     label: "PO Achat",        badge: allPos.filter(p => p.statut === "ouvert").length, icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
            { id: "besoin_sku",   label: "Besoin SKU",      badge: besoinNet.filter(b => b.besoinNet > 0).length, icon: "M4 6h16M4 10h16M4 14h16M4 18h16" },
            { id: "besoin_achat", label: "Besoin Achat",    badge: bonsAchat.filter(b => b.statut === "brouillon").length, icon: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" },
            { id: "validation_bl",label: "Valid. BL",        badge: pendingBLs, icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" },
          ] as { id: MagTab; label: string; badge: number; icon: string }[]).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-shrink-0 flex items-center justify-center gap-1 px-2.5 py-2 rounded-lg text-xs font-semibold transition-all ${tab === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={t.icon} />
              </svg>
              {t.label}
              {t.badge > 0 && (
                <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center shrink-0">{t.badge > 9 ? "9+" : t.badge}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3 flex flex-col gap-3">

        {tab === "reception" && (
          <ReceptionTab
            user={user}
            items={displayItems}
            allItems={items}
            articles={articles}
            receptions={receptions}
            contenants={contenants}
            depots={depots}
            filterDepot={filterDepot}
            setFilterDepot={setFilterDepot}
            showAll={showAll}
            setShowAll={setShowAll}
            pendingCount={pendingItems.length}
            onRefresh={refresh}
          />
        )}

        {tab === "po_achat" && (
          <POAchatTab pos={allPos} onRefresh={refresh} />
        )}

        {tab === "besoin_sku" && (
          <BesoinSKUTab besoin={besoinNet} />
        )}

        {tab === "besoin_achat" && (
          <BesoinAchatTab bons={bonsAchat} />
        )}

        {tab === "validation_bl" && (
          <ValidationBLTab
            user={user}
            bls={bls}
            articles={articles}
            onRefresh={refresh}
          />
        )}

      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// PO Achat Tab — commandes fournisseurs passees par acheteur
// ─────────────────────────────────────────────────────────────
function POAchatTab({ pos, onRefresh }: { pos: PurchaseOrder[]; onRefresh: () => void }) {
  const DH = (n: number) => n.toLocaleString("fr-MA", { minimumFractionDigits: 2 }) + " DH"
  const STATUT_COLOR: Record<string, string> = {
    ouvert:      "bg-blue-100 text-blue-700",
    "envoyé":    "bg-amber-100 text-amber-700",
    "receptionné":"bg-emerald-100 text-emerald-700",
    annule:      "bg-red-100 text-red-700",
  }

  if (pos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <svg className="w-12 h-12 text-muted-foreground/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-muted-foreground text-sm font-medium">Aucun PO achat</p>
        <p className="text-muted-foreground/60 text-xs">Les commandes passees par les acheteurs apparaissent ici</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground font-medium">{pos.length} commandes fournisseurs</p>
        <button onClick={onRefresh} className="text-xs text-primary font-semibold">Actualiser</button>
      </div>
      {pos.map(po => (
        <div key={po.id} className="bg-card border border-border rounded-2xl p-4 space-y-2 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-bold text-sm text-foreground">{po.articleNom}</p>
              <p className="text-xs text-muted-foreground">{po.fournisseurNom}</p>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUT_COLOR[po.statut] ?? "bg-muted text-muted-foreground"}`}>
              {po.statut}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-muted rounded-xl p-2">
              <p className="text-[10px] text-muted-foreground">Qte</p>
              <p className="text-sm font-bold text-foreground">{po.quantite} {po.articleUnite}</p>
            </div>
            <div className="bg-muted rounded-xl p-2">
              <p className="text-[10px] text-muted-foreground">Prix unit.</p>
              <p className="text-sm font-bold text-foreground">{DH(po.prixUnitaire)}</p>
            </div>
            <div className="bg-muted rounded-xl p-2">
              <p className="text-[10px] text-muted-foreground">Total</p>
              <p className="text-sm font-bold text-primary">{DH(po.total)}</p>
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{po.date}</span>
            <span>{po.id}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Besoin SKU Tab — besoins nets calcules depuis les commandes
// ─────────────────────────────────────────────────────────────
function BesoinSKUTab({ besoin }: { besoin: ReturnType<typeof store.computeBesoinNet> }) {
  if (besoin.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <svg className="w-12 h-12 text-muted-foreground/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
        <p className="text-muted-foreground text-sm font-medium">Aucun besoin SKU aujourd&apos;hui</p>
        <p className="text-muted-foreground/60 text-xs">Apparait quand le stock ne couvre pas les commandes du jour</p>
      </div>
    )
  }

  const urgents = besoin.filter(b => b.besoinNet > 0)
  const couverts = besoin.filter(b => b.besoinNet === 0)

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
          <p className="text-xl font-black text-red-700">{urgents.length}</p>
          <p className="text-[10px] text-red-600 font-semibold">SKU en rupture</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
          <p className="text-xl font-black text-emerald-700">{couverts.length}</p>
          <p className="text-[10px] text-emerald-600 font-semibold">SKU couverts</p>
        </div>
      </div>

      {urgents.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-red-700 uppercase tracking-wider">Ruptures — achat urgent</p>
          {urgents.map(b => (
            <div key={b.articleId} className="bg-red-50 border border-red-200 rounded-2xl p-3 space-y-1.5">
              <p className="font-bold text-sm text-red-900">{b.articleNom}</p>
              <div className="grid grid-cols-3 gap-1 text-center text-[10px]">
                <div className="bg-white rounded-lg p-1.5">
                  <p className="text-muted-foreground">Commande</p>
                  <p className="font-bold text-foreground">{b.commandeQty} {b.unite}</p>
                </div>
                <div className="bg-white rounded-lg p-1.5">
                  <p className="text-muted-foreground">Stock</p>
                  <p className="font-bold text-emerald-700">{b.stockQty} {b.unite}</p>
                </div>
                <div className="bg-red-100 rounded-lg p-1.5">
                  <p className="text-red-600">Besoin</p>
                  <p className="font-bold text-red-700">{b.besoinNet} {b.unite}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {couverts.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Couverts par stock</p>
          {couverts.map(b => (
            <div key={b.articleId} className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-emerald-900">{b.articleNom}</p>
              <span className="text-xs text-emerald-700 font-bold">{b.stockQty} {b.unite} dispo</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Besoin Achat Tab — bons d'achat transmis par acheteur
// ─────────────────────────────────────────────────────────────
function BesoinAchatTab({ bons }: { bons: BonAchat[] }) {
  const DH = (n: number) => n.toLocaleString("fr-MA", { minimumFractionDigits: 2 }) + " DH"
  const STATUT_COLOR: Record<string, string> = {
    brouillon:    "bg-slate-100 text-slate-600",
    "validé":     "bg-amber-100 text-amber-700",
    "receptionné":"bg-emerald-100 text-emerald-700",
  }

  if (bons.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <svg className="w-12 h-12 text-muted-foreground/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4" />
        </svg>
        <p className="text-muted-foreground text-sm font-medium">Aucun bon d&apos;achat</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground font-medium">{bons.length} bon(s) d&apos;achat</p>
      {bons.map(bon => {
        const totalQte = bon.lignes.reduce((s, l) => s + l.quantite, 0)
        const totalMt  = bon.lignes.reduce((s, l) => s + l.quantite * l.prixAchat, 0)
        return (
          <div key={bon.id} className="bg-card border border-border rounded-2xl p-4 space-y-2 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold text-sm text-foreground">{bon.fournisseurNom}</p>
                <p className="text-xs text-muted-foreground">{bon.acheteurNom} — {bon.date}</p>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUT_COLOR[bon.statut] ?? "bg-muted"}`}>
                {bon.statut}
              </span>
            </div>
            <div className="flex gap-3 text-xs">
              <span className="text-muted-foreground">{bon.lignes.length} article(s)</span>
              <span className="text-muted-foreground">{totalQte.toFixed(1)} kg total</span>
              <span className="font-bold text-primary">{DH(totalMt)}</span>
            </div>
            <div className="space-y-1">
              {bon.lignes.slice(0, 3).map((l, i) => (
                <div key={i} className="flex items-center justify-between text-xs bg-muted rounded-lg px-2 py-1">
                  <span className="font-medium text-foreground">{l.articleNom}</span>
                  <span className="text-muted-foreground">{l.quantite} kg @ {DH(l.prixAchat)}</span>
                </div>
              ))}
              {bon.lignes.length > 3 && (
                <p className="text-[10px] text-muted-foreground text-center">+{bon.lignes.length - 3} autres articles</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// RECEPTION TAB
// ─────────────────────────────────────────────────────────────

function ReceptionTab({
  user, items, allItems, articles, receptions, contenants, depots,
  filterDepot, setFilterDepot, showAll, setShowAll, pendingCount, onRefresh,
}: {
  user: User
  items: ReceptionItem[]
  allItems: ReceptionItem[]
  articles: Article[]
  receptions: Reception[]
  contenants: ContenantTare[]
  depots: Depot[]
  filterDepot: string
  setFilterDepot: (v: string) => void
  showAll: boolean
  setShowAll: (v: boolean) => void
  pendingCount: number
  onRefresh: () => void
}) {
  const [selected, setSelected]     = useState<ReceptionItem | null>(null)
  const [qtesRecues, setQtesRecues] = useState<Record<string, string>>({})
  const [prixRecus, setPrixRecus]   = useState<Record<string, string>>({})
  const [motifs, setMotifs]         = useState<Record<string, string>>({})
  const [caisseGros,   setCaisseGros]   = useState<Record<string, string>>({})
  const [caisseDemi,   setCaisseDemi]   = useState<Record<string, string>>({})
  const [caisseDollar, setCaisseDollar] = useState<Record<string, string>>({})
  const [chariot,      setChariot]      = useState<Record<string, string>>({})
  const [saving, setSaving]         = useState(false)
  const [success, setSuccess]       = useState("")
  const [error, setError]           = useState("")

  // Tare weights — lookup from contenants or use standard defaults
  const contenantGros   = contenants.find(c => c.nom.toLowerCase().includes("gros")   || c.nom.toLowerCase().includes("plastique"))
  const contenantDemi   = contenants.find(c => c.nom.toLowerCase().includes("demi")   || c.nom.toLowerCase().includes("petit"))
  const contenantDollar = contenants.find(c => c.nom.toLowerCase().includes("dollar") || c.nom.toLowerCase().includes("bois"))
  const contenantChariot= contenants.find(c => c.nom.toLowerCase().includes("chariot"))

  // Standard tare defaults (kg) when no contenant config found
  const TARE_GROS    = contenantGros?.poidsKg    ?? 2.8
  const TARE_DEMI    = contenantDemi?.poidsKg    ?? 1.5
  const TARE_DOLLAR  = contenantDollar?.poidsKg  ?? 4.5   // caisse bois dollar
  const TARE_CHARIOT = contenantChariot?.poidsKg ?? 25.0  // tare chariot standard

  const calcNet = (artId: string, brut: number) =>
    Math.max(0, brut
      - Number(caisseGros[artId]   ?? 0) * TARE_GROS
      - Number(caisseDemi[artId]   ?? 0) * TARE_DEMI
      - Number(caisseDollar[artId] ?? 0) * TARE_DOLLAR
      - Number(chariot[artId]      ?? 0) * TARE_CHARIOT
    )

  const openItem = (item: ReceptionItem) => {
    setSelected(item)
    setError("")
    const prevRecs = receptions.filter(r =>
      item.source === "purchase_order"
        ? r.purchaseOrderId === item.id
        : r.bonAchatId === item.id
    )
    const already: Record<string, number> = {}
    prevRecs.forEach(r => r.lignes.forEach(l => {
      already[l.articleId] = (already[l.articleId] ?? 0) + l.quantiteRecue
    }))
    const init: Record<string, string> = {}
    item.lignes.forEach(l => {
      const reste = Math.max(0, l.quantite - (already[l.articleId] ?? 0))
      init[l.articleId] = reste > 0 ? String(reste) : ""
    })
    setQtesRecues(init)
    setPrixRecus({})
    setMotifs({})
    setCaisseGros({})
    setCaisseDemi({})
    setCaisseDollar({})
    setChariot({})
  }

  const handleValider = () => {
    if (!selected) return
    setSaving(true)
    setError("")
    try {
      let totalGros = 0, totalDemi = 0, totalDollar = 0, totalChariot = 0
      const lignes = selected.lignes.map(l => {
        const brut = Number(qtesRecues[l.articleId]   ?? 0)
        const net  = calcNet(l.articleId, brut)
        const g    = Number(caisseGros[l.articleId]   ?? 0)
        const d    = Number(caisseDemi[l.articleId]   ?? 0)
        const dol  = Number(caisseDollar[l.articleId] ?? 0)
        const ch   = Number(chariot[l.articleId]      ?? 0)
        totalGros += g; totalDemi += d; totalDollar += dol; totalChariot += ch
        return {
          articleId: l.articleId,
          articleNom: l.articleNom,
          quantiteCommandee: l.quantite,
          quantiteRecue: net,
          prixAchat: Number(prixRecus[l.articleId] ?? l.prixAchat),
          motifReliquat: motifs[l.articleId] || undefined,
        }
      })

      const totalCmd  = lignes.reduce((s, l) => s + l.quantiteCommandee, 0)
      const totalRecu = lignes.reduce((s, l) => s + l.quantiteRecue, 0)
      const statut: Reception["statut"] =
        totalRecu === 0 ? "en_attente"
        : totalRecu < totalCmd ? "partielle"
        : "validée"

      const rec: Reception = {
        id: store.genId(), date: store.today(),
        bonAchatId: selected.source === "bon_achat" ? selected.id : "",
        purchaseOrderId: selected.source === "purchase_order" ? selected.id : undefined,
        source: selected.source,
        fournisseurNom: selected.fournisseurNom,
        lignes, statut,
        operateurId: user.id,
      }
      store.addReception(rec)

      // Mark source doc as received
      if (statut === "validée") {
        if (selected.source === "bon_achat") {
          store.updateBonAchat(selected.id, { statut: "receptionné" })
        } else {
          store.updatePurchaseOrder(selected.id, { statut: "receptionné" })
        }
      }

      // Update stock
      lignes.forEach(l => { if (l.quantiteRecue > 0) store.updateStock(l.articleId, l.quantiteRecue) })

      // Log caisse mouvement
      try {
        if (totalGros > 0 || totalDemi > 0 || totalDollar > 0 || totalChariot > 0) {
          store.addCaisseMouvement({
            id: store.genId(), date: store.today(),
            heure: new Date().toTimeString().slice(0, 5),
            typeOperation: "reception", sens: "entree",
            nbCaisseGros: totalGros, nbCaisseDemi: totalDemi,
            nbCaisseDollar: totalDollar, nbChariot: totalChariot,
            referenceDoc: rec.id,
            operateurId: user.id, operateurNom: user.name,
            notes: `Reception ${selected.source === "purchase_order" ? "PO" : "bon"} ${selected.id}`,
          })
        }
      } catch { /* caisse non obligatoire */ }

      const label = statut === "validée" ? "Reception validee avec succes!" : statut === "partielle" ? "Reception partielle enregistree." : "Reception en attente enregistree."
      setSuccess(label)
      setSelected(null)
      onRefresh()
      setTimeout(() => setSuccess(""), 3500)
    } catch (e) {
      setError(`Erreur lors de la validation: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  // ── Detail view ────────────────────────────────────────────
  if (selected) {
    return (
      <div className="flex flex-col gap-3">
        {/* Back header */}
        <div className="flex items-center gap-2 bg-card rounded-xl border border-border px-4 py-3">
          <button onClick={() => setSelected(null)}
            className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">
              {selected.source === "purchase_order" ? "PO" : "Bon"} — {selected.id}
            </p>
            <p className="text-xs text-muted-foreground">{selected.fournisseurNom} — {selected.date}</p>
          </div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
            selected.statut === "receptionné" ? "bg-emerald-100 text-emerald-700" :
            selected.source === "purchase_order" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
          }`}>
            {selected.statut === "receptionné" ? "Receptionne" : selected.source === "purchase_order" ? "PO" : "Bon achat"}
          </span>
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
            <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}

        {/* Depot badge */}
        {selected.depotNom && (
          <div className="flex items-center gap-1.5 px-3 py-2 bg-primary/5 rounded-xl border border-primary/20">
            <svg className="w-3.5 h-3.5 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />
            </svg>
            <span className="text-xs font-semibold text-primary">Depot: {selected.depotNom}</span>
          </div>
        )}

        {/* Article lines */}
        {selected.lignes.map(l => {
          const brut  = Number(qtesRecues[l.articleId] ?? 0)
          const net   = calcNet(l.articleId, brut)
          const art   = articles.find(a => a.id === l.articleId)
          const unite = l.unite || art?.unite || "kg"
          return (
            <div key={l.articleId} className="bg-card rounded-xl border border-border p-4 flex flex-col gap-3">
              {/* Article header */}
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0 font-bold text-muted-foreground">
                  {(l.articleNom[0] ?? "A").toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{l.articleNom}</p>
                  <p className="text-xs text-muted-foreground">
                    Commande: <span className="font-semibold">{QTE(l.quantite)} {unite}</span>
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-primary">{DH(l.prixAchat)}</p>
                  <p className="text-[10px] text-muted-foreground">/{unite}</p>
                </div>
              </div>

              {/* Quantite recue brut */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Quantite recue (brut) <span className="text-muted-foreground font-normal">({unite})</span>
                </label>
                <input
                  type="number" inputMode="decimal" min="0"
                  value={qtesRecues[l.articleId] ?? ""}
                  onChange={e => setQtesRecues(p => ({ ...p, [l.articleId]: e.target.value }))}
                  placeholder={`Max ${QTE(l.quantite)}`}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Caisses tare — 4 types */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Caisse gros <span className="text-muted-foreground font-normal">({TARE_GROS} kg/u)</span>
                  </label>
                  <input type="number" inputMode="numeric" min="0"
                    value={caisseGros[l.articleId] ?? ""}
                    onChange={e => setCaisseGros(p => ({ ...p, [l.articleId]: e.target.value }))}
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Caisse demi <span className="text-muted-foreground font-normal">({TARE_DEMI} kg/u)</span>
                  </label>
                  <input type="number" inputMode="numeric" min="0"
                    value={caisseDemi[l.articleId] ?? ""}
                    onChange={e => setCaisseDemi(p => ({ ...p, [l.articleId]: e.target.value }))}
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Dolly (bois) <span className="text-muted-foreground font-normal">({TARE_DOLLAR} kg/u)</span>
                  </label>
                  <input type="number" inputMode="numeric" min="0"
                    value={caisseDollar[l.articleId] ?? ""}
                    onChange={e => setCaisseDollar(p => ({ ...p, [l.articleId]: e.target.value }))}
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Chariot <span className="text-muted-foreground font-normal">({TARE_CHARIOT} kg/u)</span>
                  </label>
                  <input type="number" inputMode="numeric" min="0"
                    value={chariot[l.articleId] ?? ""}
                    onChange={e => setChariot(p => ({ ...p, [l.articleId]: e.target.value }))}
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </div>

              {/* Net display */}
              {(Number(caisseGros[l.articleId] ?? 0) > 0 || Number(caisseDemi[l.articleId] ?? 0) > 0
                || Number(caisseDollar[l.articleId] ?? 0) > 0 || Number(chariot[l.articleId] ?? 0) > 0) && (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                  <svg className="w-3.5 h-3.5 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <div className="flex flex-col gap-0.5">
                    <p className="text-xs text-emerald-700 font-bold">
                      Poids net: {QTE(net)} {unite}
                    </p>
                    {brut > 0 && (
                      <p className="text-[10px] text-emerald-600 opacity-80">
                        Brut {QTE(brut)} kg — tare totale {QTE(brut - net)} kg
                        {Number(caisseGros[l.articleId] ?? 0) > 0 && ` | Gros ×${caisseGros[l.articleId]}(${QTE(Number(caisseGros[l.articleId])*TARE_GROS)}kg)`}
                        {Number(caisseDemi[l.articleId] ?? 0) > 0 && ` | Demi ×${caisseDemi[l.articleId]}(${QTE(Number(caisseDemi[l.articleId])*TARE_DEMI)}kg)`}
                        {Number(caisseDollar[l.articleId] ?? 0) > 0 && ` | Dollar ×${caisseDollar[l.articleId]}(${QTE(Number(caisseDollar[l.articleId])*TARE_DOLLAR)}kg)`}
                        {Number(chariot[l.articleId] ?? 0) > 0 && ` | Chariot ×${chariot[l.articleId]}(${QTE(Number(chariot[l.articleId])*TARE_CHARIOT)}kg)`}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Prix achat — read-only, set by acheteur */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Prix achat (DH/{unite}) — fixe par l&apos;acheteur
                </label>
                <input
                  type="number"
                  readOnly
                  disabled
                  value={l.prixAchat}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted text-muted-foreground text-sm cursor-not-allowed opacity-60 select-none" />
              </div>

              {/* Motif ecart */}
              {brut >= 0 && brut < l.quantite && (
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">Motif ecart de quantite</label>
                  <select value={motifs[l.articleId] ?? ""}
                    onChange={e => setMotifs(p => ({ ...p, [l.articleId]: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                    {MOTIFS_RELIQUAT.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              )}
            </div>
          )
        })}

        {/* Submit */}
        <button onClick={handleValider} disabled={saving}
          className="w-full py-3.5 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity bg-primary">
          {saving ? (
            <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
          {saving ? "Enregistrement..." : "Valider la reception"}
        </button>
      </div>
    )
  }

  // ── List ──────────────────────────────────────────────────
  const bonAchatCount = items.filter(i => i.source === "bon_achat").length
  const poCount       = items.filter(i => i.source === "purchase_order").length

  return (
    <div className="flex flex-col gap-3">
      {success && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-emerald-700 text-sm font-semibold">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {success}
        </div>
      )}

      {/* KPI header */}
      <div className="bg-card rounded-xl border border-border p-4 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-foreground">Vision des achats</p>
            <p className="text-xs text-muted-foreground">
              {pendingCount} en attente — {bonAchatCount} bon(s) + {poCount} PO
            </p>
          </div>
          <button onClick={onRefresh}
            className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {/* Filters row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Show all / pending only toggle */}
          <button
            onClick={() => setShowAll(!showAll)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${showAll ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border"}`}>
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
            </svg>
            {showAll ? "Tous les achats" : "En attente seul."}
          </button>

          {/* Depot filter */}
          {depots.length > 0 && (
            <select
              value={filterDepot}
              onChange={e => setFilterDepot(e.target.value)}
              className="flex-1 min-w-0 px-3 py-1.5 rounded-xl border border-border bg-background text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="all">Tous les depots</option>
              {depots.filter(d => d.actif).map(d => (
                <option key={d.id} value={d.id}>{d.nom}{d.ville ? ` — ${d.ville}` : ""}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Debug hint when empty */}
      {allItems.length === 0 && (
        <div className="bg-card rounded-xl border border-border p-5 flex flex-col items-center gap-2 text-center">
          <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
            <svg className="w-6 h-6 text-muted-foreground/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-foreground">Aucun achat trouve</p>
          <p className="text-xs text-muted-foreground">
            Les bons valides par l&apos;acheteur et les PO confirmes apparaissent ici automatiquement.
          </p>
          <p className="text-[11px] text-muted-foreground/70 mt-1">
            Verifiez que l&apos;acheteur a bien soumis un bon (statut validé) ou confirme un PO (statut envoyé).
          </p>
        </div>
      )}

      {allItems.length > 0 && items.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-sm font-semibold text-amber-800">Aucun achat avec ce filtre</p>
          <p className="text-xs text-amber-700 mt-0.5">
            {allItems.length} achat(s) au total — changez le depot ou activez &quot;Tous les achats&quot;
          </p>
        </div>
      )}

      {/* Items list */}
      {items.map(item => {
        const prevRecs  = receptions.filter(r =>
          item.source === "purchase_order"
            ? r.purchaseOrderId === item.id
            : r.bonAchatId === item.id
        )
        const totalQte  = item.lignes.reduce((s, l) => s + l.quantite, 0)
        const totalRecu = prevRecs.reduce((s, r) => s + r.lignes.reduce((ss, l) => ss + l.quantiteRecue, 0), 0)
        const pct       = totalQte > 0 ? Math.min(100, Math.round((totalRecu / totalQte) * 100)) : 0
        const isPO      = item.source === "purchase_order"
        const isDone    = item.statut === "receptionné"

        return (
          <button key={item.id} onClick={() => openItem(item)}
            className={`w-full text-left bg-card rounded-xl border p-4 flex flex-col gap-3 hover:shadow-sm transition-all active:scale-[0.99] ${isDone ? "border-emerald-200 bg-emerald-50/30" : "border-border hover:border-primary/40"}`}>
            <div className="flex items-start gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isDone ? "bg-emerald-100" : isPO ? "bg-blue-100" : "bg-amber-100"}`}>
                <svg className={`w-4 h-4 ${isDone ? "text-emerald-700" : isPO ? "text-blue-700" : "text-amber-700"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {isDone
                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  }
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 justify-between">
                  <p className="text-sm font-bold text-foreground truncate">{item.id}</p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isDone && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Receptionne</span>}
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isPO ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                      {isPO ? "PO" : "Bon achat"}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{item.fournisseurNom} — {item.date}</p>
                <p className="text-xs text-muted-foreground">
                  {item.lignes.length} article(s) — {item.lignes.map(l => `${l.articleNom} (${QTE(l.quantite)} ${l.unite})`).join(", ")}
                </p>
                {item.depotNom && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary mt-0.5">
                    <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />
                    </svg>
                    {item.depotNom}
                  </span>
                )}
              </div>
            </div>

            {/* Progress bar if partial */}
            {prevRecs.length > 0 && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Reception {pct === 100 ? "complete" : "partielle"}</span>
                  <span className="font-semibold">{pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${pct === 100 ? "bg-emerald-500" : "bg-amber-400"}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            )}

            <div className="flex items-center justify-end">
              <span className="text-xs font-semibold text-primary flex items-center gap-1">
                {isDone ? "Voir le detail" : "Receptionner"}
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// VALIDATION BL TAB
// ─────────────────────────────────────────────────────────────

function ValidationBLTab({
  user, bls, articles, onRefresh,
}: {
  user: User
  bls: BonLivraison[]
  articles: Article[]
  onRefresh: () => void
}) {
  const [selectedBL, setSelectedBL] = useState<BonLivraison | null>(null)
  const [note, setNote]             = useState("")
  const [saving, setSaving]         = useState(false)
  const [success, setSuccess]       = useState("")
  const [searchQ, setSearchQ]       = useState("")

  const filtered = useMemo(() => {
    if (!searchQ.trim()) return bls
    const q = searchQ.toLowerCase()
    return bls.filter(b =>
      b.id.toLowerCase().includes(q) ||
      b.clientNom?.toLowerCase().includes(q) ||
      b.livreurNom?.toLowerCase().includes(q)
    )
  }, [bls, searchQ])

  const handleAction = (action: "valider" | "refuser") => {
    if (!selectedBL) return
    if (action === "refuser" && !note.trim()) {
      alert("Note obligatoire en cas de refus.")
      return
    }
    setSaving(true)
    try {
      store.updateBonLivraison(selectedBL.id, {
        valideMagasinier: action === "valider",
        motifRetour: action === "refuser" ? note : undefined,
      })
      setSuccess(action === "valider" ? "BL valide avec succes!" : "BL refuse — note enregistree.")
      setSelectedBL(null)
      setNote("")
      onRefresh()
      setTimeout(() => setSuccess(""), 3500)
    } finally {
      setSaving(false)
    }
  }

  // BL detail view
  if (selectedBL) {
    const totalMontant = (selectedBL.lignes ?? []).reduce((s: number, l: { total?: number }) => s + (l.total ?? 0), 0)
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 bg-card rounded-xl border border-border px-4 py-3">
          <button onClick={() => { setSelectedBL(null); setNote("") }}
            className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">BL {selectedBL.id}</p>
            <p className="text-xs text-muted-foreground">{selectedBL.clientNom} — {selectedBL.date}</p>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0">{selectedBL.statut}</span>
        </div>

        {/* Summary */}
        <div className="bg-card rounded-xl border border-border p-4 flex flex-col gap-2">
          {[
            { label: "Client",       value: selectedBL.clientNom },
            { label: "Livreur",      value: selectedBL.livreurNom ?? "—" },
            { label: "Montant",      value: DH(totalMontant) },
            { label: "Nb articles",  value: `${(selectedBL.lignes ?? []).length} ligne(s)` },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{row.label}</span>
              <span className="text-sm font-semibold text-foreground">{row.value}</span>
            </div>
          ))}
        </div>

        {/* Lines */}
        {(selectedBL.lignes ?? []).map((l: { articleId?: string; articleNom?: string; quantite?: number; total?: number }, i: number) => {
          const art = articles.find(a => a.id === l.articleId)
          return (
            <div key={i} className="bg-card rounded-xl border border-border p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0 font-bold text-muted-foreground text-sm">
                {(l.articleNom ?? art?.nom ?? "A")[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{l.articleNom ?? art?.nom}</p>
                <p className="text-xs text-muted-foreground">{QTE(l.quantite ?? 0)} {art?.unite ?? "kg"}</p>
              </div>
              <span className="text-sm font-bold text-primary shrink-0">{DH(l.total ?? 0)}</span>
            </div>
          )
        })}

        {/* Note */}
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1.5">
            Note magasinier <span className="text-muted-foreground font-normal">(obligatoire si refus)</span>
          </label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={3}
            placeholder="Observations, ecarts, motif de refus..."
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button onClick={() => handleAction("valider")} disabled={saving}
            className="flex-1 py-3.5 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-60 bg-emerald-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Valider BL
          </button>
          <button onClick={() => handleAction("refuser")} disabled={saving}
            className="flex-1 py-3.5 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-60 bg-red-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Refuser BL
          </button>
        </div>
      </div>
    )
  }

  // BL list
  return (
    <div className="flex flex-col gap-3">
      {success && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-emerald-700 text-sm font-semibold">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {success}
        </div>
      )}

      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border bg-card">
        <svg className="w-4 h-4 text-muted-foreground shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input type="text" value={searchQ} onChange={e => setSearchQ(e.target.value)}
          placeholder="Chercher par BL, client, livreur..."
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none" />
        {searchQ && (
          <button onClick={() => setSearchQ("")} className="text-muted-foreground">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="bg-card rounded-xl border border-border p-4">
        <p className="text-sm font-bold text-foreground">BL en attente de validation</p>
        <p className="text-xs text-muted-foreground mt-0.5">{filtered.length} BL(s) retournes par les livreurs</p>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-10 flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
            <svg className="w-6 h-6 text-muted-foreground/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-foreground">Aucun BL en attente</p>
          <p className="text-xs text-muted-foreground">Les BL retournes par les livreurs apparaissent ici.</p>
        </div>
      ) : filtered.map(bl => {
        const totalMontant = (bl.lignes ?? []).reduce((s: number, l: { total?: number }) => s + (l.total ?? 0), 0)
        return (
          <button key={bl.id} onClick={() => setSelectedBL(bl)}
            className="w-full text-left bg-card rounded-xl border border-border p-4 flex flex-col gap-2 hover:border-primary/40 hover:shadow-sm transition-all active:scale-[0.99]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-foreground truncate">{bl.id}</p>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0">{bl.statut}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{bl.clientNom}</span>
              <span className="font-semibold text-primary">{DH(totalMontant)}</span>
            </div>
            {bl.livreurNom && <p className="text-xs text-muted-foreground">Livreur: {bl.livreurNom}</p>}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">{bl.date}</span>
              <span className="text-xs font-semibold text-primary flex items-center gap-1">
                Valider / Refuser
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
