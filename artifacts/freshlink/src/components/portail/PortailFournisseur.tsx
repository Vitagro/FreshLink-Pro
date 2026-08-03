"use client"

import { useState, useEffect } from "react"
import { store, type User, type PurchaseOrder, type Article, type Fournisseur, type Reception } from "@/lib/store"
import FreshLinkLogo from "@/components/ui/FreshLinkLogo"

// ─────────────────────────────────────────────────────────────
// CROSS-DOC PREPARATION COMPONENT
// Shows recently received articles from this supplier and allows
// generating a preparation proposal for the next delivery.
// ─────────────────────────────────────────────────────────────

interface CrossDocItem {
  articleId: string
  articleNom: string
  unite: string
  dernierQteRecue: number
  dernierPrix: number
  stockDispo: number
  propositionQte: number
  totalEstime: number
}

interface CrossDocPreparationProps {
  fournisseurId: string
  orders: PurchaseOrder[]         // receptionné POs only
  articles: Article[]
}

function CrossDocPreparation({ fournisseurId, orders, articles }: CrossDocPreparationProps) {
  const [items, setItems] = useState<CrossDocItem[]>([])
  const [propositions, setPropositions] = useState<Record<string, string>>({})
  const [docGenerated, setDocGenerated] = useState(false)
  const [docDate, setDocDate] = useState(store.today())

  useEffect(() => {
    // Build cross-doc items from validated receptions linked to this fournisseur
    const receptions: Reception[] = store.getReceptions().filter(r => {
      // Match by PO fournisseurId or by bonAchat fournisseurId
      const bon = r.bonAchatId ? store.getBonsAchat().find(b => b.id === r.bonAchatId) : null
      if (bon && bon.fournisseurId === fournisseurId) return true
      if (r.source === "purchase_order") {
        const po = orders.find(o => o.id === r.purchaseOrderId)
        return !!po
      }
      return false
    })

    // Aggregate by article — take latest reception data
    const artMap: Record<string, CrossDocItem> = {}
    receptions.forEach(rec => {
      rec.lignes.forEach(ligne => {
        const art = articles.find(a => a.id === ligne.articleId)
        if (!art) return
        const existing = artMap[ligne.articleId]
        const qteRecue = ligne.quantiteRecue || ligne.quantiteCommandee
        if (!existing || rec.date > (artMap[ligne.articleId] ? "0" : "")) {
          artMap[ligne.articleId] = {
            articleId: ligne.articleId,
            articleNom: ligne.articleNom || art.nom,
            unite: art.unite,
            dernierQteRecue: qteRecue,
            dernierPrix: ligne.prixAchat ?? art.prixAchat,
            stockDispo: art.stockDisponible,
            propositionQte: Math.max(0, qteRecue - art.stockDisponible),
            totalEstime: Math.max(0, qteRecue - art.stockDisponible) * (ligne.prixAchat ?? art.prixAchat),
          }
        }
      })
    })

    // Also include articles from receptionné POs
    orders.forEach(po => {
      const art = articles.find(a => a.id === po.articleId || a.nom === po.articleNom)
      if (!art || artMap[art.id]) return
      artMap[art.id] = {
        articleId: art.id,
        articleNom: po.articleNom,
        unite: po.articleUnite,
        dernierQteRecue: po.quantite,
        dernierPrix: art.prixAchat,
        stockDispo: art.stockDisponible,
        propositionQte: Math.max(0, po.quantite - art.stockDisponible),
        totalEstime: Math.max(0, po.quantite - art.stockDisponible) * art.prixAchat,
      }
    })

    const arr = Object.values(artMap).sort((a, b) => b.propositionQte - a.propositionQte)
    setItems(arr)
    const initProps: Record<string, string> = {}
    arr.forEach(i => { initProps[i.articleId] = String(i.propositionQte) })
    setPropositions(initProps)
  }, [fournisseurId, orders, articles])

  const totalEstime = items.reduce((s, it) => {
    const qty = Number(propositions[it.articleId] ?? it.propositionQte)
    return s + qty * it.dernierPrix
  }, 0)

  const printDoc = () => {
    const lines = items
      .filter(it => Number(propositions[it.articleId] ?? 0) > 0)
      .map(it => `${it.articleNom.padEnd(25)} | ${String(Number(propositions[it.articleId])).padEnd(8)} ${it.unite.padEnd(6)} | ${it.dernierPrix.toFixed(2)} DH/${it.unite} | ${(Number(propositions[it.articleId]) * it.dernierPrix).toFixed(2)} DH`)
      .join("\n")
    const content = `BON DE PRÉPARATION CROSS-DOC\n${"=".repeat(60)}\nDate: ${docDate}\nFournisseur: ${fournisseurId || "—"}\n${"=".repeat(60)}\n${"Article".padEnd(25)} | Qté      | Prix unit. | Total\n${"-".repeat(60)}\n${lines}\n${"-".repeat(60)}\nTOTAL ESTIMÉ: ${totalEstime.toLocaleString("fr-MA")} DH\n${"=".repeat(60)}`
    const win = window.open("", "_blank")
    if (win) {
      win.document.write(`<pre style="font-family:monospace;font-size:13px;padding:2rem">${content}</pre>`)
      win.document.close()
      win.print()
    }
    setDocGenerated(true)
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
          <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
        </div>
        <div>
          <p className="font-bold text-foreground">Aucune réception récente</p>
          <p className="text-sm text-muted-foreground mt-1">La préparation cross-doc se basera sur les articles reçus de votre part.</p>
          <p className="text-xs text-muted-foreground/70 mt-0.5">لا توجد استلامات حديثة لإعداد وثيقة التوزيع المتقاطع</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-bold text-foreground text-base">Préparation Cross-Doc</h3>
          <p className="text-xs text-muted-foreground">Basé sur vos {orders.length} livraison(s) réceptionnée(s)</p>
          <p className="text-[10px] text-muted-foreground/70">إعداد وثيقة التوزيع المتقاطع من آخر استلاماتك</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={docDate}
            onChange={e => setDocDate(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none"
          />
          <button
            onClick={printDoc}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-xs font-bold hover:opacity-90 transition-opacity"
            style={{ background: "var(--primary)" }}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Imprimer Doc
          </button>
        </div>
      </div>

      {docGenerated && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-50 border border-green-200 text-green-800 text-xs font-medium">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Bon de préparation cross-doc généré avec succès.
        </div>
      )}

      {/* KPI bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card px-3 py-2.5 text-center">
          <p className="text-xl font-black text-foreground">{items.length}</p>
          <p className="text-[10px] text-muted-foreground">Articles</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-3 py-2.5 text-center">
          <p className="text-xl font-black text-amber-600">
            {items.filter(i => Number(propositions[i.articleId] ?? 0) > 0).length}
          </p>
          <p className="text-[10px] text-muted-foreground">À préparer</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-3 py-2.5 text-center">
          <p className="text-base font-black text-primary">{totalEstime.toLocaleString("fr-MA")} DH</p>
          <p className="text-[10px] text-muted-foreground">Total estimé</p>
        </div>
      </div>

      {/* Article list */}
      <div className="flex flex-col gap-2">
        {items.map(it => {
          const qty = Number(propositions[it.articleId] ?? it.propositionQte)
          const total = qty * it.dernierPrix
          const needsAttention = qty > 0
          return (
            <div key={it.articleId}
              className={`rounded-2xl border p-4 flex flex-col gap-3 ${needsAttention ? "border-amber-200 bg-amber-50/50" : "border-border bg-card"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-foreground text-sm">{it.articleNom}</p>
                  <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
                    <span>Dernière réception: <strong className="text-foreground">{it.dernierQteRecue} {it.unite}</strong></span>
                    <span>Stock dispo: <strong className="text-foreground">{it.stockDispo} {it.unite}</strong></span>
                    <span>PA: <strong className="text-foreground">{it.dernierPrix} DH/{it.unite}</strong></span>
                  </div>
                </div>
                {needsAttention && (
                  <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                    A PRÉPARER
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <label className="text-xs font-semibold text-muted-foreground shrink-0">Qté proposée:</label>
                <input
                  type="number"
                  min="0"
                  value={propositions[it.articleId] ?? it.propositionQte}
                  onChange={e => setPropositions(prev => ({ ...prev, [it.articleId]: e.target.value }))}
                  className="w-24 px-3 py-1.5 rounded-lg border border-border bg-background text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <span className="text-xs text-muted-foreground">{it.unite}</span>
                <span className="ml-auto text-xs font-bold text-foreground">
                  {total > 0 ? `${total.toLocaleString("fr-MA")} DH` : "—"}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────

interface Props { user: User; onLogout: () => void }

const STATUT_CONFIG: Record<string, { label: string; labelAr: string; cls: string }> = {
  ouvert:       { label: "Nouveau",       labelAr: "جديد",        cls: "bg-blue-100 text-blue-800 border-blue-200" },
  envoyé:       { label: "Envoyé",        labelAr: "مُرسَل",       cls: "bg-amber-100 text-amber-800 border-amber-200" },
  receptionné:  { label: "Receptionné",   labelAr: "مُستلَم",     cls: "bg-green-100 text-green-800 border-green-200" },
  annulé:       { label: "Annulé",        labelAr: "ملغى",        cls: "bg-red-100 text-red-800 border-red-200" },
}

type Tab = "commandes" | "paiements" | "catalogue" | "preparation"

interface PaiementRecord {
  id: string
  poId: string
  articleNom: string
  montantTotal: number
  montantPaye: number
  datePaiement: string
  statut: "impaye" | "partiel" | "solde"
  notes: string
}

function loadPaiements(fournisseurId: string): PaiementRecord[] {
  try { return JSON.parse(localStorage.getItem(`fl_paiements_fournisseur_${fournisseurId}`) ?? "[]") } catch { return [] }
}
function savePaiements(fournisseurId: string, list: PaiementRecord[]) {
  localStorage.setItem(`fl_paiements_fournisseur_${fournisseurId}`, JSON.stringify(list))
}

export default function PortailFournisseur({ user, onLogout }: Props) {
  const [tab, setTab] = useState<Tab>("commandes")
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [articles, setArticles] = useState<Article[]>([])
  const [fournisseur, setFournisseur] = useState<Fournisseur | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filterStatut, setFilterStatut] = useState("tous")
  const [searchArticle, setSearchArticle] = useState("")
  const [waEnabled, setWaEnabled] = useState<Record<string, boolean>>({})
  // Paiements state
  const [paiements, setPaiements]         = useState<PaiementRecord[]>([])
  const [payModal, setPayModal]           = useState<PaiementRecord | null>(null)
  const [payAmount, setPayAmount]         = useState("")
  const [payNotes, setPayNotes]           = useState("")

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Supabase-first via the service-role supplier API; localStorage fallback.
  // (On a fresh supplier login, localStorage is empty because anon reads are
  // blocked by RLS — the service-role API is what actually returns data.)
  const refresh = async () => {
    const myFournisseurId = user.fournisseurId
    if (!myFournisseurId) {
      setFournisseur(null); setOrders([]); setArticles(store.getArticles())
      return
    }

    // 1. Articles (anon-readable table, served through service-role sync-read)
    try {
      const res = await fetch(`/api/sync-read?table=fl_articles`, { cache: "no-store" })
      const json = await res.json()
      if (json.ok && Array.isArray(json.data) && json.data.length > 0) {
        const arts = json.data.map((r: { id: string; payload: Record<string, unknown> }) => ({ id: r.id, ...(r.payload ?? {}) }) as Article)
        store.saveArticles(arts)
        setArticles(arts)
      } else {
        setArticles(store.getArticles())
      }
    } catch {
      setArticles(store.getArticles())
    }

    // 2. Supplier dashboard — full PO/reception/bonAchat payloads
    let myOrders: PurchaseOrder[] = []
    try {
      const res = await fetch(`/api/portal/supplier/${encodeURIComponent(myFournisseurId)}`, { cache: "no-store" })
      if (res.ok) {
        const d = await res.json()
        setFournisseur(d.fournisseur ?? null)
        myOrders = (d.purchaseOrders ?? []) as PurchaseOrder[]
        // Hydrate the store so the Cross-Doc tab (which reads store.*) works
        if (Array.isArray(d.purchaseOrders)) store.savePurchaseOrders(d.purchaseOrders)
        if (Array.isArray(d.receptions)) store.saveReceptions(d.receptions)
        if (Array.isArray(d.bonsAchat)) store.saveBonsAchat(d.bonsAchat)
      } else {
        setFournisseur(store.getFournisseurs().find(f => f.id === myFournisseurId) ?? null)
        myOrders = store.getPurchaseOrders().filter(o => o.fournisseurId === myFournisseurId)
      }
    } catch {
      setFournisseur(store.getFournisseurs().find(f => f.id === myFournisseurId) ?? null)
      myOrders = store.getPurchaseOrders().filter(o => o.fournisseurId === myFournisseurId)
    }

    myOrders = myOrders.filter(o => o.fournisseurId === myFournisseurId)
    setOrders([...myOrders].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")))

    // Sync paiements: auto-create a record for each receptionné PO that doesn't have one
    const existing = loadPaiements(myFournisseurId)
    const receptionnes = myOrders.filter(o => o.statut === "receptionné")
    let changed = false
    for (const po of receptionnes) {
      if (!existing.find(p => p.poId === po.id)) {
        existing.push({
          id: Math.random().toString(36).slice(2, 10),
          poId: po.id,
          articleNom: po.articleNom,
          montantTotal: po.total,
          montantPaye: 0,
          datePaiement: "",
          statut: "impaye",
          notes: "",
        })
        changed = true
      }
    }
    if (changed) savePaiements(myFournisseurId, existing)
    setPaiements(existing)
  }

  const filtered = orders.filter(o => {
    if (filterStatut !== "tous" && o.statut !== filterStatut) return false
    if (searchArticle && !o.articleNom.toLowerCase().includes(searchArticle.toLowerCase())) return false
    return true
  })

  const totalPending = orders.filter(o => o.statut === "ouvert" || o.statut === "envoyé").length
  const totalValeur = orders.filter(o => o.statut !== "annulé").reduce((s, o) => s + o.total, 0)

  // Check if WA enabled for a PO (default true if not set)
  const isWaEnabled = (poId: string) => waEnabled[poId] !== false

  // Toggle WA for a PO
  const toggleWa = (poId: string) => {
    setWaEnabled(prev => ({ ...prev, [poId]: !isWaEnabled(poId) }))
  }

  // Send WhatsApp confirmation for a PO (only if waEnabled)
  const openWhatsAppConfirm = (po: PurchaseOrder) => {
    if (!isWaEnabled(po.id)) return
    const phone = (fournisseur?.telephone ?? "").replace(/\D/g, "")
    if (!phone) {
      alert("Aucun numero WhatsApp configure pour ce fournisseur.")
      return
    }
    const msg = encodeURIComponent(
      `Confirmation commande Vita Fresh\n\n` +
      `Ref: ${po.id}\n` +
      `Article: ${po.articleNom}\n` +
      `Quantite: ${po.quantite} ${po.articleUnite}\n` +
      `Date: ${po.date}\n\n` +
      `Merci de confirmer la disponibilite.\nشكرا للتاكيد على التوفر.`
    )
    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank")
  }

  const filteredArticles = articles.filter(a =>
    a.nom.toLowerCase().includes(searchArticle.toLowerCase())
  )

  return (
    <div className="min-h-screen flex flex-col bg-background font-sans">
      {/* Header */}
      <header className="bg-sidebar text-sidebar-foreground px-4 py-3 flex items-center justify-between sticky top-0 z-40 shadow-md">
        <div className="flex items-center gap-3">
          <a href="https://shop.vita-core.org/" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-sidebar-border text-[10px] font-semibold text-sidebar-foreground/70 hover:text-white hover:bg-sidebar-accent transition-colors">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span className="hidden sm:inline">Vita Fresh</span>
          </a>
          <FreshLinkLogo size={34} variant="full-white" />
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs font-bold text-white">{fournisseur?.nom ?? user.name}</p>
            <p className="text-[10px] text-sidebar-foreground/60">Portail Fournisseur / بوابة المورد</p>
          </div>
          <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {(fournisseur?.nom ?? user.name)[0]}
          </div>
          <button onClick={onLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-sidebar-border text-xs text-sidebar-foreground/60 hover:text-white hover:bg-sidebar-accent transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span className="hidden sm:inline">Déconnexion</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6 flex flex-col gap-5">

        {/* Fournisseur info card */}
        {fournisseur && (
          <div className="rounded-2xl border border-border bg-card p-4 flex flex-col sm:flex-row gap-4 items-start">
            <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-foreground text-base">{fournisseur.nom}</h2>
              <p className="text-sm text-muted-foreground">{fournisseur.contact}</p>
              <div className="flex flex-wrap gap-2 mt-2">
                {fournisseur.telephone && (
                  <span className="text-xs px-2 py-1 rounded-lg bg-muted text-muted-foreground">
                    {fournisseur.telephone}
                  </span>
                )}
                {fournisseur.ville && (
                  <span className="text-xs px-2 py-1 rounded-lg bg-muted text-muted-foreground">
                    {fournisseur.ville}
                  </span>
                )}
                {fournisseur.specialites.slice(0, 3).map(s => (
                  <span key={s} className="text-xs px-2 py-1 rounded-lg bg-primary/10 text-primary font-medium">{s}</span>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2 text-center">
              <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
                <p className="text-2xl font-black text-amber-700">{totalPending}</p>
                <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide">En attente</p>
              </div>
            </div>
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: "Total commandes", labelAr: "مجموع الطلبيات", value: orders.length, color: "text-foreground" },
            { label: "En attente", labelAr: "في الانتظار", value: totalPending, color: "text-amber-600" },
            { label: "Valeur totale", labelAr: "القيمة الإجمالية", value: `${totalValeur.toFixed(0)} DH`, color: "text-primary" },
          ].map(s => (
            <div key={s.label} className="rounded-2xl border border-border bg-card px-4 py-3">
              <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-[10px] text-muted-foreground/60">{s.labelAr}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl border border-border bg-card overflow-hidden">
          {([
            { id: "commandes",   label: "Commandes / طلبياتي" },
            { id: "paiements",   label: "Paiements / المدفوعات" },
            { id: "catalogue",   label: "Catalogue / الكتالوج" },
            { id: "preparation", label: "Prépa Cross-Doc" },
          ] as { id: Tab; label: string }[]).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 py-3 text-xs font-semibold transition-colors border-r last:border-r-0 border-border ${tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Filters — hidden on paiements tab */}
        {tab !== "paiements" && (
          <div className="flex gap-2 flex-wrap">
            <input
              value={searchArticle} onChange={e => setSearchArticle(e.target.value)}
              placeholder="Rechercher article..."
              className="flex-1 min-w-[180px] px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            {tab === "commandes" && (
              <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none">
                <option value="tous">Tous statuts</option>
                {Object.entries(STATUT_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* COMMANDES TAB */}
        {tab === "commandes" && (
          <div className="flex flex-col gap-3">
            {filtered.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="font-semibold">Aucune commande</p>
                <p className="text-sm">لا توجد طلبيات</p>
              </div>
            ) : filtered.map(po => {
              const cfg = STATUT_CONFIG[po.statut] ?? STATUT_CONFIG.ouvert
              const isExpanded = expandedId === po.id
              return (
                <div key={po.id} className="rounded-2xl border border-border bg-card overflow-hidden">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : po.id)}
                    className="w-full flex items-center gap-4 px-4 py-4 text-left hover:bg-muted/40 transition-colors">
                    {/* Status indicator */}
                    <div className={`w-2 h-10 rounded-full shrink-0 ${po.statut === "ouvert" ? "bg-blue-500" : po.statut === "envoyé" ? "bg-amber-500" : po.statut === "receptionné" ? "bg-green-500" : "bg-red-400"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-foreground text-sm">{po.articleNom}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.cls}`}>
                          {cfg.label} / {cfg.labelAr}
                        </span>
                      </div>
                      <div className="flex gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                        <span>{po.date}</span>
                        <span>{po.quantite} {po.articleUnite}</span>
                        <span className="font-semibold text-foreground">{po.total.toFixed(2)} DH</span>
                      </div>
                    </div>
                    <svg className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t border-border px-4 py-4 flex flex-col gap-3 bg-muted/20">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Reference</p>
                          <p className="font-mono font-semibold text-foreground">{po.id.slice(0, 14)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Article</p>
                          <p className="font-semibold text-foreground">{po.articleNom}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Quantite demandee</p>
                          <p className="font-bold text-primary text-lg">{po.quantite} {po.articleUnite}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Prix unitaire</p>
                          <p className="font-semibold">{po.prixUnitaire.toFixed(2)} DH/{po.articleUnite}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Total</p>
                          <p className="font-bold text-primary">{po.total.toFixed(2)} DH</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Cree par</p>
                          <p className="font-semibold">{po.createdBy}</p>
                        </div>
                      </div>
                      {po.notes && (
                        <div className="px-3 py-2 rounded-xl bg-blue-50 border border-blue-100 text-sm text-blue-800">
                          <span className="font-semibold">Notes: </span>{po.notes}
                        </div>
                      )}

                      {/* WhatsApp section: toggle + conditional send button */}
                      <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-border bg-muted/30">
                        {/* Toggle checkbox */}
                        <label className="flex items-center gap-2.5 cursor-pointer select-none">
                          <div
                            onClick={() => toggleWa(po.id)}
                            className={`relative w-11 h-6 rounded-full transition-colors ${isWaEnabled(po.id) ? "bg-[#25D366]" : "bg-muted-foreground/30"}`}>
                            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${isWaEnabled(po.id) ? "translate-x-[22px]" : "translate-x-0.5"}`} />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-foreground">
                              Envoi WhatsApp: <span className={isWaEnabled(po.id) ? "text-green-700" : "text-muted-foreground"}>{isWaEnabled(po.id) ? "Oui" : "Non"}</span>
                            </span>
                            <span className="text-[10px] text-muted-foreground">ارسال واتساب</span>
                          </div>
                        </label>

                        {/* Send button — only active when toggle is ON */}
                        <button
                          onClick={() => openWhatsAppConfirm(po)}
                          disabled={!isWaEnabled(po.id)}
                          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all ${isWaEnabled(po.id) ? "opacity-100 hover:opacity-90" : "opacity-40 cursor-not-allowed"}`}
                          style={{ background: "#25D366" }}>
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                          </svg>
                          Envoyer
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* PAIEMENTS TAB */}
        {tab === "paiements" && (
          <div className="flex flex-col gap-4">
            {/* Summary */}
            {(() => {
              const totalDu    = paiements.reduce((s, p) => s + p.montantTotal, 0)
              const totalPaye  = paiements.reduce((s, p) => s + p.montantPaye, 0)
              const totalReste = totalDu - totalPaye
              return (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Total dû",   labelAr: "المبلغ الإجمالي",    value: `${totalDu.toFixed(0)} DH`,    color: "text-foreground" },
                    { label: "Payé",       labelAr: "المدفوع",             value: `${totalPaye.toFixed(0)} DH`,  color: "text-green-700" },
                    { label: "Reste",      labelAr: "المتبقي",             value: `${totalReste.toFixed(0)} DH`, color: "text-red-700" },
                  ].map(s => (
                    <div key={s.label} className="rounded-2xl border border-border bg-card px-3 py-3 text-center">
                      <p className={`text-lg font-black ${s.color}`}>{s.value}</p>
                      <p className="text-[10px] text-muted-foreground">{s.label}</p>
                      <p className="text-[9px] text-muted-foreground/60">{s.labelAr}</p>
                    </div>
                  ))}
                </div>
              )
            })()}

            {paiements.length === 0 ? (
              <div className="text-center py-14 text-muted-foreground">
                <svg className="w-10 h-10 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <p className="font-semibold text-sm">Aucun paiement enregistré</p>
                <p className="text-xs">Les commandes réceptionnées apparaîtront ici</p>
                <p className="text-xs opacity-60">لا يوجد مدفوعات مسجلة</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {paiements.map(p => {
                  const reste = p.montantTotal - p.montantPaye
                  const pct   = p.montantTotal > 0 ? Math.round((p.montantPaye / p.montantTotal) * 100) : 0
                  const statutCls =
                    p.statut === "solde"   ? "bg-green-50 text-green-700 border-green-200" :
                    p.statut === "partiel" ? "bg-amber-50 text-amber-700 border-amber-200" :
                                             "bg-red-50 text-red-700 border-red-200"
                  const statutLabel = p.statut === "solde" ? "Soldé" : p.statut === "partiel" ? "Partiel" : "Impayé"
                  return (
                    <div key={p.id} className="rounded-2xl border border-border bg-card overflow-hidden">
                      <div className="px-4 py-4 flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-foreground text-sm truncate">{p.articleNom}</p>
                            <p className="text-[10px] font-mono text-muted-foreground">Ref: {p.poId.slice(0, 12)}</p>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${statutCls}`}>{statutLabel}</span>
                        </div>

                        {/* Progress bar */}
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-muted-foreground">Payé: <strong className="text-green-700">{p.montantPaye.toFixed(2)} DH</strong></span>
                            <span className="text-muted-foreground">Total: <strong className="text-foreground">{p.montantTotal.toFixed(2)} DH</strong></span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                            <div className="h-2 rounded-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <p className="text-right text-[10px] text-muted-foreground mt-0.5">{pct}% payé</p>
                        </div>

                        {reste > 0 && (
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-red-600">Reste: {reste.toFixed(2)} DH</p>
                            <button
                              onClick={() => { setPayModal(p); setPayAmount(reste.toFixed(2)); setPayNotes("") }}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                              </svg>
                              Valider paiement
                            </button>
                          </div>
                        )}
                        {p.notes && (
                          <p className="text-xs text-muted-foreground italic border-t border-border pt-2">{p.notes}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Payment modal */}
            {payModal && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-4 sm:pb-0">
                <div className="w-full max-w-md bg-background rounded-2xl border border-border shadow-2xl p-6 flex flex-col gap-4">
                  <h3 className="font-black text-foreground text-base">Valider paiement / تأكيد الدفع</h3>
                  <div className="bg-muted/40 rounded-xl p-3 text-sm">
                    <p className="text-muted-foreground">Article: <strong className="text-foreground">{payModal.articleNom}</strong></p>
                    <p className="text-muted-foreground">Total dû: <strong className="text-foreground">{payModal.montantTotal.toFixed(2)} DH</strong></p>
                    <p className="text-muted-foreground">Déjà payé: <strong className="text-green-700">{payModal.montantPaye.toFixed(2)} DH</strong></p>
                    <p className="text-muted-foreground">Reste: <strong className="text-red-700">{(payModal.montantTotal - payModal.montantPaye).toFixed(2)} DH</strong></p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Montant payé maintenant (DH)</label>
                    <input
                      type="number" min="0" step="0.01"
                      value={payAmount}
                      onChange={e => setPayAmount(e.target.value)}
                      className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes</label>
                    <textarea
                      value={payNotes} onChange={e => setPayNotes(e.target.value)} rows={2}
                      className="px-3 py-2 rounded-xl border border-border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="Virement, chèque, espèces..."
                    />
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setPayModal(null)}
                      className="flex-1 py-2.5 rounded-xl border border-border text-muted-foreground text-sm font-semibold hover:bg-muted transition-colors">
                      Annuler
                    </button>
                    <button
                      onClick={() => {
                        const fid = user.fournisseurId ?? ""
                        const amount = parseFloat(payAmount) || 0
                        if (amount <= 0) return
                        const updated = paiements.map(p => {
                          if (p.id !== payModal.id) return p
                          const newPaye = Math.min(p.montantPaye + amount, p.montantTotal)
                          const statut: PaiementRecord["statut"] = newPaye >= p.montantTotal ? "solde" : newPaye > 0 ? "partiel" : "impaye"
                          return { ...p, montantPaye: newPaye, statut, datePaiement: store.today(), notes: payNotes || p.notes }
                        })
                        savePaiements(fid, updated)
                        setPaiements(updated)
                        setPayModal(null)
                      }}
                      className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity">
                      Confirmer paiement
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* PRÉPARATION CROSS-DOC TAB */}
        {tab === "preparation" && (
          <CrossDocPreparation
            fournisseurId={user.fournisseurId ?? ""}
            orders={orders.filter(o => o.statut === "receptionné")}
            articles={articles}
          />
        )}

        {/* CATALOGUE TAB */}
        {tab === "catalogue" && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filteredArticles.length === 0 ? (
              <div className="col-span-full text-center py-16 text-muted-foreground">
                <p className="font-semibold">Aucun article</p>
                <p className="text-sm">لا توجد منتجات</p>
              </div>
            ) : filteredArticles.map(art => (
              <div key={art.id} className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-2">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
                <p className="font-bold text-foreground text-sm">{art.nom}</p>
                <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                  <span>Unite: <strong className="text-foreground">{art.unite}</strong></span>
                  <span>Stock: <strong className="text-foreground">{art.stockDisponible} {art.unite}</strong></span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-border bg-card px-4 py-3 flex items-center justify-center">
        <p className="text-[11px] text-muted-foreground text-center">
          &copy; 2026 <span className="font-semibold text-foreground">Vita Fresh</span> — By{" "}
          <span className="font-bold text-primary">VitaCore Group</span>
          {" "}&mdash; Tous droits reserves / جميع الحقوق محفوظة
        </p>
      </footer>
    </div>
  )
}
