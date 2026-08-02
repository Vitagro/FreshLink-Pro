"use client"

import { useState, useEffect } from "react"
import { store, type Article, type TransfertStock, type CaisseVide, type CaisseVideMouvement, type ContenantTare, DEFAULT_CONTENANTS_TARE, FAMILLES_ARTICLES, type BonLivraison, type Retour, paDeviationConfirmMessage } from "@/lib/store"
import { hasPermission } from "@/lib/permissions"
import { logAction } from "@/lib/auditLog"
import ArticleCombobox from "@/components/ui/ArticleCombobox"
import { deleteArticle } from "@/lib/supabase/db"

const DH = (n: number) => `${n.toLocaleString("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`

function computePV(a: Article): number {
  switch (a.pvMethode) {
    case "pourcentage": return Math.round(a.prixAchat * (1 + a.pvValeur / 100) * 100) / 100
    case "montant": return Math.round((a.prixAchat + a.pvValeur) * 100) / 100
    case "manuel": default: return a.pvValeur
  }
}

const PV_METHODE_LABELS: Record<string, string> = {
  pourcentage: "% marge",
  montant: "+ montant",
  manuel: "Manuel",
}

// Default UM options — user can add more
const DEFAULT_UM_OPTIONS = ["Caisse", "Carton", "Palette", "Cagette", "Barquette", "Sac", "Botte", "Lot", "Pack"]

export default function BOStock({ user }: { user: { id: string; name: string } }) {
  const [articles, setArticles] = useState<Article[]>([])
  const [transferts, setTransferts] = useState<TransfertStock[]>([])
  const [tab, setTab] = useState<"stock" | "articles" | "transferts" | "pv" | "inventaire" | "caisses">("stock")
  const [caissesVides, setCaissesVides] = useState<CaisseVide[]>([])
  const [caissesMovements, setCaissesMovements] = useState<CaisseVideMouvement[]>([])
  const [contenants, setContenants] = useState<ContenantTare[]>([])
  const [caisseFilterDate, setCaisseFilterDate] = useState("")
  const [caisseFilterSens, setCaisseFilterSens] = useState<"" | "sortie" | "entree">("")
  // For stock J-1 / theorique / reel / ecart
  const [stockJ1Gros, setStockJ1Gros] = useState<number | null>(null)
  const [stockJ1Demi, setStockJ1Demi] = useState<number | null>(null)
  const [editingJ1, setEditingJ1] = useState(false)
  const [j1InputGros, setJ1InputGros] = useState("")
  const [j1InputDemi, setJ1InputDemi] = useState("")
  const [bonLivraisons, setBonLivraisons] = useState<BonLivraison[]>([])
  const [retours, setRetours] = useState<Retour[]>([])
  const [ecartFilter, setEcartFilter] = useState<"client" | "livreur">("client")
  const [showContenantForm, setShowContenantForm] = useState(false)
  const [contenantForm, setContenantForm] = useState<Partial<ContenantTare>>({ nom: "", poidsKg: 0, actif: true })

  // Custom UM options persisted in localStorage
  const [umOptions, setUmOptions] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("fl_um_options")
      return saved ? JSON.parse(saved) : DEFAULT_UM_OPTIONS
    } catch { return DEFAULT_UM_OPTIONS }
  })
  const [showAddUM, setShowAddUM] = useState(false)
  const [newUMInput, setNewUMInput] = useState("")

  const handleAddUM = () => {
    const val = newUMInput.trim()
    if (!val || umOptions.includes(val)) { setNewUMInput(""); setShowAddUM(false); return }
    const updated = [...umOptions, val]
    setUmOptions(updated)
    try { localStorage.setItem("fl_um_options", JSON.stringify(updated)) } catch { /* noop */ }
    setArtForm(prev => ({ ...prev, um: val } as typeof prev))
    setNewUMInput("")
    setShowAddUM(false)
  }

  const handleRemoveUM = (val: string) => {
    const updated = umOptions.filter(u => u !== val)
    setUmOptions(updated)
    try { localStorage.setItem("fl_um_options", JSON.stringify(updated)) } catch { /* noop */ }
  }

  // Inventaire state — maps articleId -> { qteUM, qteBase, stockReel }
  const [invEntries, setInvEntries] = useState<Record<string, { qteUM: string; qteBase: string; stockReel: string }>>({})
  const [invSaved, setInvSaved] = useState(false)
  // Ecart alerts after saving inventory
  const [invEcarts, setInvEcarts] = useState<{ nom: string; ecart: number; unite: string }[]>([])

  const handleInvChange = (artId: string, field: "qteUM" | "qteBase" | "stockReel", value: string, art: Article) => {
    setInvEntries(prev => {
      const entry = { ...(prev[artId] ?? { qteUM: "", qteBase: "", stockReel: "" }), [field]: value }
      if (field === "qteUM" && art.um && art.colisageParUM && value !== "") {
        entry.qteBase = (Number(value) * art.colisageParUM).toFixed(2)
      }
      if (field === "qteBase" && art.um && art.colisageParUM && value !== "") {
        entry.qteUM = (Number(value) / art.colisageParUM).toFixed(2)
      }
      return { ...prev, [artId]: entry }
    })
  }

  const handleSaveInventaire = () => {
    const session = store.getSession()
    if (!hasPermission(session?.role, "faire_inventaire")) { logAction(session, "faire_inventaire", "denied"); return }
    logAction(session, "faire_inventaire", "success", { label: `${Object.keys(invEntries).length} article(s)` })
    const all = store.getArticles()
    const ecarts: { nom: string; ecart: number; unite: string }[] = []
    const now = store.today()
    Object.entries(invEntries).forEach(([artId, e]) => {
      const idx = all.findIndex(a => a.id === artId)
      if (idx < 0) return
      const art = all[idx]
      const updates: Partial<Article> = {}
      // Update stock conforme (inventaire)
      const newStock = Number(e.qteBase)
      if (e.qteBase !== "" && !isNaN(newStock) && newStock >= 0) {
        updates.stockDisponible = newStock
      }
      // Update stock reel saisi manuellement
      if (e.stockReel !== "" && !isNaN(Number(e.stockReel))) {
        updates.stockReel = Number(e.stockReel)
        updates.stockReelDate = now
        updates.stockReelSaisiPar = user.name
        // Calculate ecart: stockReel - stockTheorique (or stockDisponible)
        const theorique = art.stockTheorique ?? art.stockDisponible
        const ecart = Number(e.stockReel) - theorique
        if (Math.abs(ecart) > 0.01) {
          ecarts.push({ nom: art.nom, ecart, unite: art.unite })
        }
      }
      all[idx] = { ...art, ...updates }
    })
    store.saveArticles(all)
    reload()
    setInvEntries({})
    setInvSaved(true)
    setInvEcarts(ecarts)
    setTimeout(() => setInvSaved(false), 2500)
  }

  // Reset stock to 0 for all (filtered) or selected articles in inventory —
  // confirmation inline en deux temps (pas de confirm() natif), meme pattern que BOArticles.
  const [pendingReset, setPendingReset] = useState<{ field: "stockDisponible" | "stockDefect"; scope: "global" | "selection" } | null>(null)
  const doResetStockInventaire = () => {
    if (!pendingReset) return
    const { field, scope } = pendingReset
    const ids = scope === "selection" ? selectedStockIds : undefined
    const session = store.getSession()
    const label = field === "stockDisponible" ? "stock CONFORME" : "stock DEFECT"
    const count = ids ? ids.size : filtered.length
    if (!hasPermission(session?.role, "ajuster_stock")) { logAction(session, "ajuster_stock", "denied", { label: `${label} — ${count} article(s)` }); setPendingReset(null); return }
    logAction(session, "ajuster_stock", "success", { label: `${label} — ${count} article(s)` })
    const all = store.getArticles()
    all.forEach((a, i) => {
      if (ids ? ids.has(a.id) : filtered.some(f => f.id === a.id)) {
        all[i] = { ...a, [field]: 0 }
      }
    })
    store.saveArticles(all)
    reload()
    setSaved(`${label} remis a 0 pour ${count} article(s)`)
    setTimeout(() => setSaved(""), 2500)
    if (scope === "selection") setSelectedStockIds(new Set())
    setPendingReset(null)
  }
  const [search, setSearch] = useState("")
  const [famille, setFamille] = useState("")
  const [sortName, setSortName] = useState<"none" | "az" | "za">("none")
  const [selectedStockIds, setSelectedStockIds] = useState<Set<string>>(new Set())

  // Article form
  const [showArtForm, setShowArtForm] = useState(false)
  const [editArt, setEditArt] = useState<Article | null>(null)
  const [artForm, setArtForm] = useState<Omit<Article, "id">>({
    nom: "", nomAr: "", famille: "Légumes fruits", unite: "kg",
    stockDisponible: 0, stockDefect: 0, prixAchat: 0,
    pvMethode: "pourcentage", pvValeur: 60,
  })

  // Transfert form
  const [showTransfert, setShowTransfert] = useState(false)
  const [transForm, setTransForm] = useState<{
    articleId: string; quantite: number; sens: "conforme_vers_defect" | "defect_vers_conforme"; motif: string
  }>({ articleId: "", quantite: 0, sens: "conforme_vers_defect", motif: "" })

  const [saved, setSaved] = useState("")

  const reload = () => {
    setArticles(store.getArticles())
    setTransferts(store.getTransferts ? store.getTransferts() : [])
    setCaissesVides(store.getCaissesVides())
    setCaissesMovements(store.getCaissesMovements())
    setContenants(store.getContenantsConfig())
    setBonLivraisons(store.getBonsLivraison())
    setRetours(store.getRetours())
    // Load stock J-1 from localStorage snapshot
    try {
      const snap = JSON.parse(localStorage.getItem("fl_caisses_stock_j1") ?? "null")
      if (snap) {
        setStockJ1Gros(snap.gros ?? null)
        setStockJ1Demi(snap.demi ?? null)
      }
    } catch { /* noop */ }
  }

  useEffect(() => { reload() }, [])

  const filtered = articles.filter(a => {
    const matchSearch = (a.nom ?? "").toLowerCase().includes(search.toLowerCase()) || (a.nomAr ?? "").includes(search)
    const matchFam = famille === "" || a.famille === famille
    return matchSearch && matchFam
  }).sort((a, b) => {
    if (sortName === "none") return 0
    const cmp = (a.nom ?? "").localeCompare(b.nom ?? "", "fr", { sensitivity: "base" })
    return sortName === "az" ? cmp : -cmp
  })

  // Détection des articles EN DOUBLE (même nom normalisé) — pour nettoyage
  const dupNames = (() => {
    const counts = new Map<string, number>()
    for (const a of articles) {
      const k = (a.nom ?? "").trim().toLowerCase()
      if (k) counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k))
  })()
  const isDup = (a: Article) => dupNames.has((a.nom ?? "").trim().toLowerCase())
  const nbDupArticles = articles.filter(isDup).length

  // ---- Article CRUD ----
  const openNewArt = () => {
    setEditArt(null)
    setArtForm({ nom: "", nomAr: "", famille: "Légumes fruits", unite: "kg", stockDisponible: 0, stockDefect: 0, prixAchat: 0, pvMethode: "pourcentage", pvValeur: 60 })
    setShowArtForm(true)
  }

  const openEditArt = (a: Article) => {
    setEditArt(a)
    setArtForm({ nom: a.nom, nomAr: a.nomAr, famille: a.famille, unite: a.unite, stockDisponible: a.stockDisponible, stockDefect: a.stockDefect, prixAchat: a.prixAchat, pvMethode: a.pvMethode, pvValeur: a.pvValeur })
    setShowArtForm(true)
  }

  const handleSaveArt = () => {
    if (!artForm.nom.trim()) return
    const all = store.getArticles()
    if (editArt) {
      const idx = all.findIndex(a => a.id === editArt.id)
      if (idx >= 0) { all[idx] = { ...all[idx], ...artForm }; store.saveArticles(all) }
    } else {
      all.push({ ...artForm, id: store.genId() })
      store.saveArticles(all)
    }
    reload(); setShowArtForm(false)
    setSaved("Article sauvegardé"); setTimeout(() => setSaved(""), 2000)
  }

  const handleDeleteArt = (a: Article) => {
    const session = store.getSession()
    if (!hasPermission(session?.role, "supprimer_article")) { logAction(session, "supprimer_article", "denied", { type: "article", id: a.id, label: a.nom }); return }
    if (!confirm(`Supprimer l'article "${a.nom}" ?`)) return
    logAction(session, "supprimer_article", "success", { type: "article", id: a.id, label: a.nom })
    deleteArticle(a.id).catch(e => console.error("[BOStock] delete sync error:", e))
    reload()
  }

  // ---- Transfert stock ----
  const handleTransfert = () => {
    if (!transForm.articleId || transForm.quantite <= 0) return
    const art = articles.find(a => a.id === transForm.articleId)
    if (!art) return
    const t: TransfertStock = {
      id: store.genId(), date: store.today(),
      articleId: art.id, articleNom: art.nom, quantite: transForm.quantite,
      sens: transForm.sens, motif: transForm.motif, operateurId: user.id,
    }
    // store.addTransfert applique deja le mouvement de stock conforme<->defect en interne —
    // ne pas le refaire ici, sous peine de doubler le mouvement (bug precedent).
    store.addTransfert(t)
    reload(); setShowTransfert(false)
    setSaved("Transfert enregistré"); setTimeout(() => setSaved(""), 2000)
  }

  const totalStock = articles.reduce((s, a) => s + a.stockDisponible, 0)
  const totalDefect = articles.reduce((s, a) => s + a.stockDefect, 0)
  const valeurStock = articles.reduce((s, a) => s + a.stockDisponible * a.prixAchat, 0)
  const alertArticles = articles.filter(a => a.stockDisponible < 50)

  // ── Import/Export CSV des prix de vente ─────────────────────────────────────
  const exportPrixCSV = () => {
    const esc = (v: string | number) => { const s = String(v ?? ""); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const headers = ["id", "nom", "famille", "unite", "prixAchat", "pvMethode", "pvValeur", "prixVente"]
    const lines = articles.map(a => [a.id, a.nom, a.famille ?? "", a.unite ?? "kg", Number(a.prixAchat) || 0, a.pvMethode, Number(a.pvValeur) || 0, computePV(a)].map(esc).join(";"))
    const csv = [headers.join(";"), ...lines].join("\n")
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob); const link = document.createElement("a")
    link.href = url; link.download = `prix-vente-${store.today()}.csv`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1500)
    setSaved("Export CSV téléchargé"); setTimeout(() => setSaved(""), 2500)
  }
  const importPrixCSV = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? "").replace(/\r/g, "")
      const rows = text.split("\n").filter(l => l.trim())
      if (rows.length < 2) { setSaved("CSV vide"); setTimeout(() => setSaved(""), 2500); return }
      const sep = rows[0].includes(";") ? ";" : ","
      const head = rows[0].split(sep).map(h => h.trim().toLowerCase())
      const idx = (k: string) => head.indexOf(k)
      const all = store.getArticles()
      let updated = 0
      const suspects: NonNullable<ReturnType<typeof store.checkPaDeviationSuspecte>>[] = []
      for (const line of rows.slice(1)) {
        const c = line.split(sep).map(x => x.trim().replace(/^"|"$/g, ""))
        const id = idx("id") >= 0 ? c[idx("id")] : ""
        const nom = idx("nom") >= 0 ? c[idx("nom")] : ""
        const art = all.find(a => (id && a.id === id) || (nom && a.nom.toLowerCase() === nom.toLowerCase()))
        if (!art) continue
        const num = (k: string) => { const j = idx(k); if (j < 0) return undefined; const n = parseFloat(String(c[j]).replace(",", ".")); return isNaN(n) ? undefined : n }
        const pa = num("prixachat")
        if (pa !== undefined) {
          const deviation = store.checkPaDeviationSuspecte(art.id, pa)
          if (deviation) suspects.push(deviation)
          art.prixAchat = pa
        }
        const meth = idx("pvmethode") >= 0 ? c[idx("pvmethode")] : ""
        if (meth === "pourcentage" || meth === "montant" || meth === "manuel") art.pvMethode = meth
        const pvVal = num("pvvaleur"); if (pvVal !== undefined) art.pvValeur = pvVal
        // Si seul prixVente est fourni (pas de pvValeur) → fixe en manuel
        const pvDirect = num("prixvente")
        if (pvVal === undefined && pvDirect !== undefined) { art.pvMethode = "manuel"; art.pvValeur = pvDirect }
        updated++
      }
      // Garde-fou anti-faute-de-frappe (FR + AR) : un seul recap pour tout le
      // fichier plutot qu'une popup par ligne.
      if (suspects.length > 0) {
        const liste = suspects.slice(0, 10).map(d => `• ${paDeviationConfirmMessage(d)}`).join("\n\n")
        const suite = suspects.length > 10 ? `\n\n… +${suspects.length - 10} autre(s) écart important(s)` : ""
        if (!window.confirm(`⚠️ ${suspects.length} écart(s) de prix important(s) détecté(s) dans ce fichier :\n\n${liste}${suite}\n\nImporter quand même ?`)) return
      }
      store.saveArticles(all); setArticles(store.getArticles())
      setSaved(`${updated} prix mis à jour depuis le CSV`); setTimeout(() => setSaved(""), 3500)
    }
    reader.readAsText(file)
  }
  // ── Prix de vente par famille ───────────────────────────────────────────────
  const [pfFamille, setPfFamille] = useState("")
  const [pfMethode, setPfMethode] = useState<Article["pvMethode"]>("pourcentage")
  const [pfValeur, setPfValeur] = useState("")
  const applyPrixFamille = () => {
    if (!pfFamille) { setSaved("Choisissez une famille"); setTimeout(() => setSaved(""), 2500); return }
    const val = parseFloat(pfValeur); if (isNaN(val)) { setSaved("Valeur invalide"); setTimeout(() => setSaved(""), 2500); return }
    const all = store.getArticles()
    let n = 0
    for (const a of all) { if (a.famille === pfFamille) { a.pvMethode = pfMethode; a.pvValeur = val; n++ } }
    store.saveArticles(all); setArticles(store.getArticles())
    setSaved(`${n} article(s) de « ${pfFamille} » mis à jour`); setTimeout(() => setSaved(""), 3500)
  }

  const TABS = [
    { id: "stock" as const, label: "Stock général", labelAr: "المخزون" },
    { id: "articles" as const, label: "Articles", labelAr: "المنتجات" },
    { id: "inventaire" as const, label: "Inventaire", labelAr: "الجرد" },
    { id: "pv" as const, label: "Prix de vente", labelAr: "أسعار البيع" },
    { id: "transferts" as const, label: "Transferts", labelAr: "التحويلات" },
    { id: "caisses" as const, label: "Caisses vides", labelAr: "الصناديق الفارغة" },
  ]

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Stock <span className="text-muted-foreground font-normal text-base mr-1">/ المخزون</span></h2>
          <p className="text-sm text-muted-foreground">{articles.length} articles — valeur totale: {DH(valeurStock)}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={reload}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold border border-border text-muted-foreground hover:bg-muted transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            Actualiser
          </button>
          <button onClick={() => { setShowTransfert(true) }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-amber-400 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
            Transfert stock
          </button>
          <button onClick={openNewArt}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: "oklch(0.38 0.2 260)" }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Nouvel article
          </button>
        </div>
      </div>

      {saved && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          {saved}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Stock conforme (kg)", labelAr: "مخزون سليم", value: `${totalStock.toLocaleString("fr-MA")} kg`, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
          { label: "Stock défect (kg)", labelAr: "مخزون تالف", value: `${totalDefect.toLocaleString("fr-MA")} kg`, color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
          { label: "Valeur stock", labelAr: "قيمة المخزون", value: DH(valeurStock), color: "text-indigo-600", bg: "bg-indigo-50 border-indigo-200" },
          { label: "Alertes stock", labelAr: "تنبيهات", value: `${alertArticles.length} articles`, color: "text-red-600", bg: "bg-red-50 border-red-200" },
        ].map(k => (
          <div key={k.label} className={`rounded-2xl border p-4 ${k.bg}`}>
            <p className="text-xs font-medium text-muted-foreground mb-0.5">{k.label}</p>
            <p className={`text-lg font-bold ${k.color}`}>{k.value}</p>
            <p className="text-[10px] text-muted-foreground">{k.labelAr}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Search + famille filter */}
      {(tab === "stock" || tab === "articles" || tab === "pv") && (
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher article..." className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <select value={famille} onChange={e => setFamille(e.target.value)} className="px-3 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary">
            <option value="">Toutes familles</option>
            {FAMILLES_ARTICLES.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <button type="button"
            onClick={() => setSortName(s => s === "az" ? "za" : s === "za" ? "none" : "az")}
            title="Trier les articles par nom"
            className={`px-3 py-2.5 rounded-xl border text-sm font-semibold flex items-center gap-1.5 transition-colors ${sortName !== "none" ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground"}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9M3 12h5m4 0l4 4m0 0l4-4m-4 4V4" /></svg>
            Nom {sortName === "az" ? "(A→Z)" : sortName === "za" ? "(Z→A)" : ""}
          </button>
        </div>
      )}

      {/* Stock view */}
      {tab === "stock" && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                  <th className="px-4 py-3 w-10">
                    <input type="checkbox"
                      checked={filtered.length > 0 && filtered.every(a => selectedStockIds.has(a.id))}
                      onChange={e => {
                        if (e.target.checked) setSelectedStockIds(new Set(filtered.map(a => a.id)))
                        else setSelectedStockIds(new Set())
                      }}
                      className="w-4 h-4 rounded accent-blue-400 cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide">Article / المنتج</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide">Famille</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide">Conforme (kg) / سليم</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide">Defect (kg) / تالف</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide">Valeur stock / القيمة</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide">Statut</th>
                </tr>
              </thead>
              <tbody>
                {selectedStockIds.size > 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-2.5 bg-blue-50 border-b border-blue-200">
                      <div className="flex items-center gap-3 flex-wrap text-sm text-blue-800">
                        <span className="font-bold">{selectedStockIds.size} article(s) selectionne(s)</span>
                        {pendingReset?.scope === "selection" ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-red-700">
                              Confirmer remise a 0 du {pendingReset.field === "stockDisponible" ? "stock CONFORME" : "stock DEFECT"} pour {selectedStockIds.size} article(s) ?
                            </span>
                            <button onClick={doResetStockInventaire} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-600 hover:bg-red-700">Oui, remettre</button>
                            <button onClick={() => setPendingReset(null)} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-border hover:bg-muted">Annuler</button>
                          </div>
                        ) : (
                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={() => setPendingReset({ field: "stockDisponible", scope: "selection" })}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-100 text-red-700 border border-red-200 hover:bg-red-200 transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            Remettre stock a 0
                          </button>
                          <button
                            onClick={() => setPendingReset({ field: "stockDefect", scope: "selection" })}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200 hover:bg-amber-200 transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            Remettre defect a 0
                          </button>
                          <button onClick={() => setSelectedStockIds(new Set())} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-blue-200 text-blue-600 hover:bg-blue-100 transition-colors">
                            Deselectionner tout
                          </button>
                        </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                {filtered.length === 0
                  ? <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Aucun article</td></tr>
                  : filtered.map((a, i) => (
                    <tr key={a.id} style={{ borderTop: "1px solid oklch(0.87 0.012 240)", background: selectedStockIds.has(a.id) ? "oklch(0.95 0.04 250)" : (i % 2 === 0 ? "white" : "oklch(0.975 0.003 240)") }}>
                      <td className="px-4 py-3 w-10" onClick={e => e.stopPropagation()}>
                        <input type="checkbox"
                          checked={selectedStockIds.has(a.id)}
                          onChange={e => {
                            const next = new Set(selectedStockIds)
                            if (e.target.checked) next.add(a.id)
                            else next.delete(a.id)
                            setSelectedStockIds(next)
                          }}
                          className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-foreground">{a.nom}</p>
                        <p className="font-arabic text-sm text-muted-foreground" dir="rtl" lang="ar">{a.nomAr}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{a.famille}</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-600">{a.stockDisponible.toLocaleString("fr-MA")} {a.unite}</td>
                      <td className="px-4 py-3 text-right font-semibold text-amber-600">{a.stockDefect.toLocaleString("fr-MA")} {a.unite}</td>
                      <td className="px-4 py-3 text-right font-bold text-indigo-600">{DH(a.stockDisponible * a.prixAchat)}</td>
                      <td className="px-4 py-3">
                        {a.stockDisponible < 50
                          ? <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">Alerte</span>
                          : a.stockDisponible < 150
                            ? <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Faible</span>
                            : <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">OK</span>}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Articles (CRUD) */}
      {tab === "articles" && (
        <div className="flex flex-col gap-3">
          {nbDupArticles > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-50 border border-orange-200 text-sm text-orange-800">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" /></svg>
              <span><strong>{nbDupArticles} article(s) en double</strong> (même nom) — marqués <span className="px-1.5 py-0.5 rounded bg-orange-200 text-orange-900 text-[10px] font-bold">DOUBLON</span> ci-dessous. Pour les fusionner/nettoyer : <strong>Bons d'achat → « Fusionner les doublons »</strong>.</span>
            </div>
          )}
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide">Article</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide">Famille</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide">Prix achat (DH)</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide">Prix vente (DH)</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide">Méthode PV</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a, i) => (
                  <tr key={a.id} style={{ borderTop: "1px solid oklch(0.87 0.012 240)", background: isDup(a) ? "oklch(0.97 0.04 70)" : i % 2 === 0 ? "white" : "oklch(0.975 0.003 240)" }}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-foreground flex items-center gap-1.5">
                        {a.nom}
                        {isDup(a) && <span className="px-1.5 py-0.5 rounded bg-orange-200 text-orange-900 text-[10px] font-bold" title="Article en double (même nom)">DOUBLON</span>}
                      </p>
                      <p className="font-arabic text-sm text-muted-foreground" dir="rtl" lang="ar">{a.nomAr}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{a.famille}</td>
                    <td className="px-4 py-3 text-right font-semibold">{DH(a.prixAchat)}</td>
                    <td className="px-4 py-3 text-right font-bold text-indigo-600">{DH(computePV(a))}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">{PV_METHODE_LABELS[a.pvMethode]} ({a.pvValeur}{a.pvMethode === "pourcentage" ? "%" : " DH"})</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEditArt(a)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                        <button onClick={() => handleDeleteArt(a)} className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </div>
      )}

      {/* PV tab */}
      {tab === "pv" && (
        <div className="flex flex-col gap-3">
          {/* Outils prix : import/export CSV + prix par famille */}
          <div className="flex flex-col gap-3 bg-indigo-50/60 border border-indigo-200 rounded-2xl p-4">
            <div className="flex flex-wrap gap-2 items-center">
              <button onClick={exportPrixCSV} className="px-3 py-2 rounded-xl text-sm font-bold bg-emerald-600 text-white">⬇ Télécharger les prix (CSV)</button>
              <label className="px-3 py-2 rounded-xl text-sm font-bold bg-blue-600 text-white cursor-pointer">
                ⬆ Importer des prix (CSV)
                <input type="file" accept=".csv,text/csv" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) importPrixCSV(f); e.target.value = "" }} />
              </label>
              <span className="text-[11px] text-indigo-700">Colonnes : <code>id;nom;famille;unite;prixAchat;pvMethode;pvValeur;prixVente</code> (prixVente seul → prix manuel)</span>
            </div>
            <div className="h-px bg-indigo-200" />
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-indigo-800 uppercase tracking-wide">Prix de vente par famille</label>
                <select value={pfFamille} onChange={e => setPfFamille(e.target.value)} className="px-3 py-2 rounded-xl border border-indigo-300 bg-white text-sm">
                  <option value="">— Choisir une famille —</option>
                  {FAMILLES_ARTICLES.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <select value={pfMethode} onChange={e => setPfMethode(e.target.value as Article["pvMethode"])} className="px-3 py-2 rounded-xl border border-indigo-300 bg-white text-sm">
                <option value="pourcentage">% de marge</option>
                <option value="montant">+ Montant (DH)</option>
                <option value="manuel">Prix manuel (DH)</option>
              </select>
              <input type="number" step="0.01" value={pfValeur} onChange={e => setPfValeur(e.target.value)}
                placeholder={pfMethode === "pourcentage" ? "ex: 60 (%)" : "ex: 5 (DH)"}
                className="w-32 px-3 py-2 rounded-xl border border-indigo-300 bg-white text-sm" />
              <button onClick={applyPrixFamille} className="px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white">Appliquer à la famille</button>
            </div>
          </div>

        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide">Article / المنتج</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide">PA (DH/kg) / سعر الشراء</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide">Méthode PV / طريقة البيع</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide">Valeur</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide">PV calculé (DH) / سعر البيع</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide">Marge (DH)</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide">Modifier</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a, i) => {
                  const pv = computePV(a)
                  const marge = pv - a.prixAchat
                  const margePct = a.prixAchat > 0 ? Math.round(marge / a.prixAchat * 100) : 0
                  return (
                    <tr key={a.id} style={{ borderTop: "1px solid oklch(0.87 0.012 240)", background: i % 2 === 0 ? "white" : "oklch(0.975 0.003 240)" }}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-foreground">{a.nom}</p>
                        <p className="font-arabic text-sm text-muted-foreground" dir="rtl" lang="ar">{a.nomAr}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">{DH(a.prixAchat)}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">{PV_METHODE_LABELS[a.pvMethode]}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{a.pvValeur}{a.pvMethode === "pourcentage" ? "%" : " DH"}</td>
                      <td className="px-4 py-3 text-right font-bold text-indigo-600">{DH(pv)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-semibold ${marge >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {DH(marge)} ({margePct}%)
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => openEditArt(a)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        </div>
      )}

      {/* Transferts */}
      {tab === "transferts" && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide">Article</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide">Quantité (kg)</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide">Sens</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide">Motif</th>
                </tr>
              </thead>
              <tbody>
                {transferts.length === 0
                  ? <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Aucun transfert enregistré</td></tr>
                  : transferts.map((t, i) => (
                    <tr key={t.id} style={{ borderTop: "1px solid oklch(0.87 0.012 240)", background: i % 2 === 0 ? "white" : "oklch(0.975 0.003 240)" }}>
                      <td className="px-4 py-3 text-muted-foreground">{t.date}</td>
                      <td className="px-4 py-3 font-semibold text-foreground">{t.articleNom}</td>
                      <td className="px-4 py-3 text-right font-semibold">{t.quantite} kg</td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${t.sens === "conforme_vers_defect" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                          {t.sens === "conforme_vers_defect" ? "Conforme → Défect" : "Défect → Conforme"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{t.motif || "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Inventaire tab */}
      {tab === "inventaire" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-sm font-bold text-foreground">Inventaire physique / الجرد الفعلي</h3>
              <p className="text-xs text-muted-foreground">Saisie stock theorique (UM/base) + stock reel magasinier. Le systeme calcule et alerte les ecarts +/-.</p>
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              {pendingReset?.scope === "global" ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-red-700">
                    Confirmer RAZ {pendingReset.field === "stockDisponible" ? "stock conforme" : "defect"} pour {filtered.length} article(s) ?
                  </span>
                  <button onClick={doResetStockInventaire} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-600 hover:bg-red-700">Oui, remettre</button>
                  <button onClick={() => setPendingReset(null)} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-border hover:bg-muted">Annuler</button>
                </div>
              ) : (
              <>
              <button onClick={() => setPendingReset({ field: "stockDisponible", scope: "global" })}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                RAZ Stock conforme
              </button>
              <button onClick={() => setPendingReset({ field: "stockDefect", scope: "global" })}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                RAZ Defect
              </button>
              </>
              )}
              {invSaved && (
                <span className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-50 border border-green-200 text-green-700 text-xs font-semibold">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  Inventaire sauvegarde
                </span>
              )}
              <button onClick={handleSaveInventaire}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: "oklch(0.38 0.2 260)" }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                Valider inventaire
              </button>
            </div>
          </div>

          {/* Ecart alerts */}
          {invEcarts.length > 0 && (
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                <span className="font-bold text-amber-800 text-sm">{invEcarts.length} ecart(s) detecte(s) entre stock reel et stock theorique</span>
                <button onClick={() => setInvEcarts([])} className="ml-auto text-xs text-amber-600 underline hover:text-amber-800">Fermer</button>
              </div>
              <div className="flex flex-col gap-1.5">
                {invEcarts.map((e, i) => (
                  <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs ${e.ecart > 0 ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"}`}>
                    <span className="font-semibold">{e.nom}</span>
                    <span className={`font-bold px-2 py-0.5 rounded-full text-xs ${e.ecart > 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                      Ecart: {e.ecart > 0 ? "+" : ""}{e.ecart.toFixed(2)} {e.unite} — {e.ecart > 0 ? "Excedent (stock reel > theorique)" : "Manquant (stock reel < theorique)"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide">Article</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide">UM</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide">Stock theorique</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide">Qte en UM</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide">Qte base (nouvel inv.)</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide text-amber-200">Stock reel (magasinier)</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide">Ecart</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a, i) => {
                    const entry = invEntries[a.id] ?? { qteUM: "", qteBase: "", stockReel: "" }
                    const hasUM = !!(a.um && a.colisageParUM)
                    const stockTheorique = a.stockTheorique ?? a.stockDisponible
                    const qteBaseNum = entry.qteBase !== "" ? Number(entry.qteBase) : null
                    const diffInv = qteBaseNum !== null ? qteBaseNum - stockTheorique : null
                    const stockReelNum = entry.stockReel !== "" ? Number(entry.stockReel) : null
                    const ecartReel = stockReelNum !== null ? stockReelNum - stockTheorique : null
                    return (
                      <tr key={a.id} style={{ borderTop: "1px solid oklch(0.87 0.012 240)", background: i % 2 === 0 ? "white" : "oklch(0.975 0.003 240)" }}>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-foreground">{a.nom}</p>
                          <p className="font-arabic text-sm text-muted-foreground" dir="rtl" lang="ar">{a.nomAr}</p>
                          {a.stockReelDate && (
                            <p className="text-[10px] text-blue-500 mt-0.5">Reel saisit: {a.stockReel} {a.unite} ({a.stockReelDate})</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {hasUM
                            ? <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">{a.um} = {a.colisageParUM} {a.unite}</span>
                            : <span className="text-xs text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <p className="font-semibold text-foreground">{stockTheorique} {a.unite}</p>
                          {a.stockTheorique !== undefined && a.stockTheorique !== a.stockDisponible && (
                            <p className="text-[10px] text-muted-foreground">Conforme: {a.stockDisponible}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {hasUM ? (
                            <input
                              type="number" min="0" step="0.01"
                              value={entry.qteUM}
                              onChange={e => handleInvChange(a.id, "qteUM", e.target.value, a)}
                              placeholder="nb UM..."
                              className="w-24 px-2 py-1.5 rounded-lg border border-border bg-background text-sm font-bold text-right focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                          ) : <span className="text-xs text-muted-foreground">N/A</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input
                            type="number" min="0" step="0.01"
                            value={entry.qteBase}
                            onChange={e => handleInvChange(a.id, "qteBase", e.target.value, a)}
                            placeholder={`${a.unite}...`}
                            className="w-24 px-2 py-1.5 rounded-lg border border-border bg-background text-sm font-bold text-right focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                          {diffInv !== null && Math.abs(diffInv) > 0.01 && (
                            <span className={`block text-[10px] font-bold mt-0.5 ${diffInv > 0 ? "text-emerald-600" : "text-red-600"}`}>
                              {diffInv > 0 ? "+" : ""}{diffInv.toFixed(1)}
                            </span>
                          )}
                        </td>
                        {/* Stock reel — saisi par magasinier */}
                        <td className="px-4 py-3 text-right bg-amber-50/40">
                          <input
                            type="number" min="0" step="0.01"
                            value={entry.stockReel}
                            onChange={e => handleInvChange(a.id, "stockReel", e.target.value, a)}
                            placeholder={`reel ${a.unite}...`}
                            className="w-24 px-2 py-1.5 rounded-lg border border-amber-300 bg-white text-sm font-bold text-right focus:outline-none focus:ring-2 focus:ring-amber-400"
                          />
                        </td>
                        {/* Ecart reel vs theorique */}
                        <td className="px-4 py-3">
                          {hasUM && entry.qteUM && entry.qteBase ? (
                            <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded-lg block mb-1">
                              {entry.qteUM} {a.um} = {entry.qteBase} {a.unite}
                            </span>
                          ) : null}
                          {ecartReel !== null && (
                            <span className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg ${ecartReel > 0 ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : ecartReel < 0 ? "bg-red-50 text-red-700 border border-red-200" : "bg-muted text-muted-foreground"}`}>
                              {ecartReel > 0 ? <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                                : ecartReel < 0 ? <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                                : null}
                              {ecartReel > 0 ? "+" : ""}{ecartReel.toFixed(2)} {a.unite}
                              {ecartReel > 0 ? " Excedent" : ecartReel < 0 ? " Manquant" : " OK"}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal Article */}
      {showArtForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={e => e.target === e.currentTarget && setShowArtForm(false)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="font-bold text-foreground">{editArt ? "Modifier l'article" : "Nouvel article"} / {editArt ? "تعديل المنتج" : "منتج جديد"}</h3>
              <button onClick={() => setShowArtForm(false)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-foreground">Nom (Français) *</label>
                  <input value={artForm.nom} onChange={e => setArtForm({ ...artForm, nom: e.target.value })} className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Tomates" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-foreground">Nom (Arabe) / الاسم العربي</label>
                  <input value={artForm.nomAr} onChange={e => setArtForm({ ...artForm, nomAr: e.target.value })} dir="rtl" className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="طماطم" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-foreground">Famille</label>
                  <select value={artForm.famille} onChange={e => setArtForm({ ...artForm, famille: e.target.value })} className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                    {FAMILLES_ARTICLES.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-foreground">Unité</label>
                  <select value={artForm.unite} onChange={e => setArtForm({ ...artForm, unite: e.target.value })} className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                    {["kg", "caisse", "pièce", "botte", "sac"].map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-foreground">Prix achat (DH/{artForm.unite})</label>
                  <input type="number" step="0.01" value={artForm.prixAchat} onChange={e => setArtForm({ ...artForm, prixAchat: Number(e.target.value) })} className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-foreground">Méthode prix de vente</label>
                  <select value={artForm.pvMethode} onChange={e => setArtForm({ ...artForm, pvMethode: e.target.value as Article["pvMethode"] })} className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                    <option value="pourcentage">% marge sur PA</option>
                    <option value="montant">+ montant fixe sur PA</option>
                    <option value="manuel">Prix de vente manuel</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1 col-span-2">
                  <label className="text-xs font-semibold text-foreground">
                    {artForm.pvMethode === "pourcentage" ? "Pourcentage de marge (%)" : artForm.pvMethode === "montant" ? "Montant à ajouter (DH)" : "Prix de vente manuel (DH)"}
                  </label>
                  <input type="number" step="0.01" value={artForm.pvValeur} onChange={e => setArtForm({ ...artForm, pvValeur: Number(e.target.value) })} className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  {artForm.prixAchat > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      PV calculé: <strong className="text-indigo-600">
                        {DH(artForm.pvMethode === "pourcentage" ? artForm.prixAchat * (1 + artForm.pvValeur / 100) : artForm.pvMethode === "montant" ? artForm.prixAchat + artForm.pvValeur : artForm.pvValeur)}
                      </strong>
                    </p>
                  )}
                </div>
                {/* UM fields */}
                <div className="col-span-2">
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 flex flex-col gap-2">
                    <p className="text-xs font-bold text-blue-800 uppercase tracking-wide">Unite de Mesure (UM) commerciale</p>
                    <p className="text-[11px] text-blue-700">Ex: "Caisse", "Carton", "Palette". Le prevendeur saisira en UM et le systeme convertit automatiquement en {artForm.unite}.</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-foreground">Libelle UM</label>
                        {/* Dropdown with existing options + add new */}
                        <div className="flex gap-1">
                          <select
                            value={(artForm as { um?: string }).um ?? ""}
                            onChange={e => {
                              if (e.target.value === "__add__") { setShowAddUM(true); return }
                              setArtForm({ ...artForm, um: e.target.value } as typeof artForm)
                            }}
                            className="flex-1 px-3 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                            <option value="">-- Aucune UM --</option>
                            {umOptions.map(u => (
                              <option key={u} value={u}>{u}</option>
                            ))}
                            <option value="__add__">+ Ajouter une UM...</option>
                          </select>
                          {/* Remove current UM from list */}
                          {(artForm as { um?: string }).um && umOptions.includes((artForm as { um?: string }).um!) && (
                            <button type="button"
                              onClick={() => handleRemoveUM((artForm as { um?: string }).um!)}
                              className="px-2 py-1 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 border border-red-200 text-xs font-bold"
                              title="Supprimer cette UM de la liste">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                        {/* Inline add new UM */}
                        {showAddUM && (
                          <div className="flex gap-1 mt-1">
                            <input
                              autoFocus
                              value={newUMInput}
                              onChange={e => setNewUMInput(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") handleAddUM(); if (e.key === "Escape") { setShowAddUM(false); setNewUMInput("") } }}
                              placeholder="Ex: Plateau, Filet..."
                              className="flex-1 px-2 py-1.5 rounded-lg border border-blue-400 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                            />
                            <button type="button" onClick={handleAddUM}
                              className="px-2.5 py-1.5 rounded-lg text-white text-xs font-bold"
                              style={{ background: "oklch(0.38 0.2 260)" }}>OK</button>
                            <button type="button" onClick={() => { setShowAddUM(false); setNewUMInput("") }}
                              className="px-2.5 py-1.5 rounded-lg border border-border text-xs text-muted-foreground">X</button>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-foreground">{artForm.unite} par UM</label>
                        <input type="number" min="0" step="0.1"
                          value={(artForm as { colisageParUM?: number }).colisageParUM ?? ""}
                          onChange={e => setArtForm({ ...artForm, colisageParUM: Number(e.target.value) } as typeof artForm)}
                          className="px-3 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="15" />
                      </div>
                    </div>
                    {(artForm as { um?: string; colisageParUM?: number }).um && (artForm as { colisageParUM?: number }).colisageParUM && (
                      <p className="text-xs font-bold text-blue-700 bg-white rounded-lg px-3 py-1.5 border border-blue-200">
                        1 {(artForm as { um?: string }).um} = {(artForm as { colisageParUM?: number }).colisageParUM} {artForm.unite}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-foreground">Stock conforme ({artForm.unite})</label>
                  <input type="number" value={artForm.stockDisponible} onChange={e => setArtForm({ ...artForm, stockDisponible: Number(e.target.value) })} className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-foreground">Stock défect ({artForm.unite})</label>
                  <input type="number" value={artForm.stockDefect} onChange={e => setArtForm({ ...artForm, stockDefect: Number(e.target.value) })} className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowArtForm(false)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors">Annuler</button>
                <button onClick={handleSaveArt} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: "oklch(0.38 0.2 260)" }}>Sauvegarder</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====== CAISSES VIDES ====== */}
      {tab === "caisses" && (() => {
        const filteredMvts = caissesMovements
          .filter(m => !caisseFilterDate || m.date === caisseFilterDate)
          .filter(m => !caisseFilterSens || m.sens === caisseFilterSens)

        const totalSortieGros = filteredMvts.filter(m => m.sens === "sortie").reduce((s, m) => s + m.nbCaisseGros, 0)
        const totalSortieDemi = filteredMvts.filter(m => m.sens === "sortie").reduce((s, m) => s + m.nbCaisseDemi, 0)
        const totalEntreeGros = filteredMvts.filter(m => m.sens === "entree").reduce((s, m) => s + m.nbCaisseGros, 0)
        const totalEntreeDemi = filteredMvts.filter(m => m.sens === "entree").reduce((s, m) => s + m.nbCaisseDemi, 0)

        const SOURCE_LABELS: Record<string, string> = {
          ctrl_achat: "Ctrl Achat (chargement)",
          reception: "Reception fournisseur",
          expedition: "Expedition client",
          achat: "Achat mobile",
          retour: "Retour livreur",
          manuel: "Saisie manuelle",
        }

        // ── Calculs journaliers (today) ──────────────────────────
        const today = store.today()
        const todayMvts = caissesMovements.filter(m => m.date === today)
        const todaySortieGros = todayMvts.filter(m => m.sens === "sortie").reduce((s, m) => s + m.nbCaisseGros, 0)
        const todaySortieDemi = todayMvts.filter(m => m.sens === "sortie").reduce((s, m) => s + m.nbCaisseDemi, 0)
        const todayRetourGros = todayMvts.filter(m => m.sens === "entree").reduce((s, m) => s + m.nbCaisseGros, 0)
        const todayRetourDemi = todayMvts.filter(m => m.sens === "entree").reduce((s, m) => s + m.nbCaisseDemi, 0)

        const grosseCV = caissesVides.find(c => c.type === "gros")
        const demiCV   = caissesVides.find(c => c.type === "demi")
        const stockReelGros = grosseCV?.stock ?? 0
        const stockReelDemi = demiCV?.stock ?? 0

        // Theorique = J-1 + retournes - sorties
        const j1Gros = stockJ1Gros ?? null
        const j1Demi = stockJ1Demi ?? null
        const stockTheoGros = j1Gros !== null ? j1Gros + todayRetourGros - todaySortieGros : null
        const stockTheoDemi = j1Demi !== null ? j1Demi + todayRetourDemi - todaySortieDemi : null
        const ecartGros = stockTheoGros !== null ? stockReelGros - stockTheoGros : null
        const ecartDemi = stockTheoDemi !== null ? stockReelDemi - stockTheoDemi : null

        // Synthèse écart par client — from BLs today with caisses
        const todayBLs = bonLivraisons.filter(bl => bl.date === today && ((bl.nbCaisseGros ?? 0) > 0 || (bl.nbCaisseDemi ?? 0) > 0))
        const ecartParClient: Record<string, { nom: string; gros: number; demi: number; livree: number; retour: number; ecart: number }> = {}
        todayBLs.forEach(bl => {
          if (!ecartParClient[bl.clientNom]) ecartParClient[bl.clientNom] = { nom: bl.clientNom, gros: 0, demi: 0, livree: 0, retour: 0, ecart: 0 }
          ecartParClient[bl.clientNom].gros += bl.nbCaisseGros ?? 0
          ecartParClient[bl.clientNom].demi += bl.nbCaisseDemi ?? 0
          ecartParClient[bl.clientNom].livree += (bl.nbCaisseGros ?? 0) + (bl.nbCaisseDemi ?? 0)
        })
        // Retours livrés par client
        const todayRetours = retours.filter(r => r.date === today)
        todayRetours.forEach(r => { /* caisses dans retour: not directly tracked, skip for now */ })

        // Synthèse par livreur
        const ecartParLivreur: Record<string, { nom: string; gros: number; demi: number; retourGros: number; retourDemi: number; ecartGros: number; ecartDemi: number }> = {}
        todayBLs.forEach(bl => {
          if (!ecartParLivreur[bl.livreurNom]) ecartParLivreur[bl.livreurNom] = { nom: bl.livreurNom, gros: 0, demi: 0, retourGros: 0, retourDemi: 0, ecartGros: 0, ecartDemi: 0 }
          ecartParLivreur[bl.livreurNom].gros += bl.nbCaisseGros ?? 0
          ecartParLivreur[bl.livreurNom].demi += bl.nbCaisseDemi ?? 0
        })
        todayMvts.filter(m => m.sens === "entree" && m.operateurNom).forEach(m => {
          if (!ecartParLivreur[m.operateurNom]) return
          ecartParLivreur[m.operateurNom].retourGros += m.nbCaisseGros
          ecartParLivreur[m.operateurNom].retourDemi += m.nbCaisseDemi
        })
        Object.values(ecartParLivreur).forEach(l => {
          l.ecartGros = l.retourGros - l.gros   // negative = pas encore retourne
          l.ecartDemi = l.retourDemi - l.demi
        })

        return (
          <div className="flex flex-col gap-5">
            {/* ── Stock J-1 / Theorique / Reel / Ecart table ── */}
            <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-foreground text-sm uppercase tracking-wide">Bilan Stock Caisses — {today}</h3>
                <div className="flex gap-2">
                  {!editingJ1 ? (
                    <button onClick={() => { setEditingJ1(true); setJ1InputGros(String(stockJ1Gros ?? 0)); setJ1InputDemi(String(stockJ1Demi ?? 0)) }}
                      className="px-3 py-1.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted">
                      Saisir Stock J-1
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input type="number" min="0" value={j1InputGros} onChange={e => setJ1InputGros(e.target.value)}
                        placeholder="J-1 Gros" className="w-20 px-2 py-1.5 rounded-xl border border-amber-300 bg-amber-50 text-xs font-bold text-amber-900 focus:outline-none" />
                      <input type="number" min="0" value={j1InputDemi} onChange={e => setJ1InputDemi(e.target.value)}
                        placeholder="J-1 Demi" className="w-20 px-2 py-1.5 rounded-xl border border-cyan-300 bg-cyan-50 text-xs font-bold text-cyan-900 focus:outline-none" />
                      <button onClick={() => {
                        const g = Number(j1InputGros)||0, d = Number(j1InputDemi)||0
                        setStockJ1Gros(g); setStockJ1Demi(d)
                        localStorage.setItem("fl_caisses_stock_j1", JSON.stringify({ gros: g, demi: d, date: today }))
                        setEditingJ1(false)
                      }} className="px-3 py-1.5 rounded-xl bg-green-600 text-white text-xs font-bold hover:bg-green-700">
                        Valider
                      </button>
                      <button onClick={() => setEditingJ1(false)} className="px-3 py-1.5 rounded-xl border border-border text-xs text-muted-foreground hover:bg-muted">
                        Annuler
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Tableau bilan */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                      {["Type caisse", "Stock J-1", "Retournes auj.", "Sorties auj.", "Stock Theorique", "Stock Reel", "Ecart"].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: "Grosse caisse (70 DH)", j1: j1Gros, retour: todayRetourGros, sortie: todaySortieGros, theo: stockTheoGros, reel: stockReelGros, ecart: ecartGros },
                      { label: "Demi-caisse (50 DH)",   j1: j1Demi, retour: todayRetourDemi, sortie: todaySortieDemi, theo: stockTheoDemi, reel: stockReelDemi, ecart: ecartDemi },
                    ].map(row => (
                      <tr key={row.label} className="border-t border-border hover:bg-muted/20">
                        <td className="px-4 py-3 font-semibold text-foreground">{row.label}</td>
                        <td className="px-4 py-3 text-center">
                          {row.j1 !== null ? <span className="font-bold text-foreground">{row.j1}</span> : <span className="text-muted-foreground/50 italic text-xs">non saisi</span>}
                        </td>
                        <td className="px-4 py-3 text-center"><span className="font-bold text-green-700">{row.retour}</span></td>
                        <td className="px-4 py-3 text-center"><span className="font-bold text-red-700">{row.sortie}</span></td>
                        <td className="px-4 py-3 text-center">
                          {row.theo !== null ? <span className="font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded-lg">{row.theo}</span> : <span className="text-muted-foreground/50 italic text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center"><span className="font-black text-foreground">{row.reel}</span></td>
                        <td className="px-4 py-3 text-center">
                          {row.ecart !== null ? (
                            <span className={`font-black px-2.5 py-1 rounded-full text-xs ${
                              row.ecart === 0 ? "bg-green-100 text-green-700" :
                              row.ecart > 0 ? "bg-blue-100 text-blue-700" :
                              "bg-red-100 text-red-700"
                            }`}>
                              {row.ecart > 0 ? "+" : ""}{row.ecart}
                            </span>
                          ) : <span className="text-muted-foreground/50 text-xs">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Synthese ecart caisses ── */}
            <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-foreground text-sm uppercase tracking-wide">Synthese Ecart Caisses</h3>
                <div className="flex rounded-xl overflow-hidden border border-border">
                  {(["client", "livreur"] as const).map(f => (
                    <button key={f} onClick={() => setEcartFilter(f)}
                      className={`px-4 py-1.5 text-xs font-bold transition-colors ${ecartFilter === f ? "text-white" : "text-muted-foreground bg-card"}`}
                      style={ecartFilter === f ? { background: "oklch(0.38 0.2 260)" } : {}}>
                      Par {f === "client" ? "Client" : "Livreur"}
                    </button>
                  ))}
                </div>
              </div>

              {ecartFilter === "client" ? (
                Object.keys(ecartParClient).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Aucune caisse livree aujourd&apos;hui</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: "oklch(0.93 0.012 245)" }}>
                          {["Client", "Gros livres", "Demi livres", "Total livres"].map(h => (
                            <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Object.values(ecartParClient).sort((a, b) => b.livree - a.livree).map(row => (
                          <tr key={row.nom} className="border-t border-border hover:bg-muted/20">
                            <td className="px-4 py-3 font-semibold text-foreground">{row.nom}</td>
                            <td className="px-4 py-3 text-center font-bold text-amber-700">{row.gros}</td>
                            <td className="px-4 py-3 text-center font-bold text-cyan-700">{row.demi}</td>
                            <td className="px-4 py-3 text-center font-black">{row.livree}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                Object.keys(ecartParLivreur).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Aucune caisse en circulation aujourd&apos;hui</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: "oklch(0.93 0.012 245)" }}>
                          {["Livreur", "Gros sortis", "Demi sortis", "Gros retournes", "Demi retournes", "Ecart Gros", "Ecart Demi"].map(h => (
                            <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Object.values(ecartParLivreur).sort((a, b) => a.nom.localeCompare(b.nom)).map(row => (
                          <tr key={row.nom} className="border-t border-border hover:bg-muted/20">
                            <td className="px-4 py-3 font-semibold text-foreground">{row.nom}</td>
                            <td className="px-4 py-3 text-center font-bold text-red-700">{row.gros}</td>
                            <td className="px-4 py-3 text-center font-bold text-red-700">{row.demi}</td>
                            <td className="px-4 py-3 text-center font-bold text-green-700">{row.retourGros}</td>
                            <td className="px-4 py-3 text-center font-bold text-green-700">{row.retourDemi}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`font-black px-2 py-0.5 rounded-full text-xs ${row.ecartGros === 0 ? "bg-green-100 text-green-700" : row.ecartGros > 0 ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"}`}>
                                {row.ecartGros >= 0 ? "+" : ""}{row.ecartGros}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`font-black px-2 py-0.5 rounded-full text-xs ${row.ecartDemi === 0 ? "bg-green-100 text-green-700" : row.ecartDemi > 0 ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"}`}>
                                {row.ecartDemi >= 0 ? "+" : ""}{row.ecartDemi}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>

            {/* Filtres mouvements */}
            <div className="flex gap-3 flex-wrap">
              <input type="date" value={caisseFilterDate} onChange={e => setCaisseFilterDate(e.target.value)}
                className="px-3 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              <select value={caisseFilterSens} onChange={e => setCaisseFilterSens(e.target.value as "" | "sortie" | "entree")}
                className="px-3 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">Tous les mouvements</option>
                <option value="sortie">Sorties (OUT)</option>
                <option value="entree">Entrees (IN)</option>
              </select>
              {(caisseFilterDate || caisseFilterSens) && (
                <button onClick={() => { setCaisseFilterDate(""); setCaisseFilterSens("") }}
                  className="px-3 py-2 rounded-xl border border-border text-xs text-muted-foreground hover:bg-muted">
                  Reinitialiser filtres
                </button>
              )}
              <span className="ml-auto text-sm text-muted-foreground self-center">{filteredMvts.length} mouvement(s)</span>
            </div>

            {/* Tableau mouvements */}
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                      {["Date / Heure", "Source", "Sens", "Gros caisses", "Demi-caisses", "Total", "Ref. doc", "Operateur", "Notes"].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMvts.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground text-sm">
                          Aucun mouvement de caisses enregistre
                          <p className="text-xs mt-1 text-muted-foreground">Les mouvements apparaissent automatiquement lors des validations de ctrl achat, reception et expedition.</p>
                        </td>
                      </tr>
                    ) : filteredMvts.map((m, i) => (
                      <tr key={m.id} style={{ borderTop: "1px solid oklch(0.87 0.012 240)", background: i % 2 === 0 ? "white" : "oklch(0.975 0.003 240)" }}>
                        <td className="px-4 py-3">
                          <p className="font-mono text-xs text-foreground">{m.date}</p>
                          {m.heure && <p className="text-[10px] text-muted-foreground">{m.heure}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                            {SOURCE_LABELS[m.typeOperation] ?? m.typeOperation}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${m.sens === "sortie" ? "bg-red-50 text-red-700 border border-red-200" : "bg-green-50 text-green-700 border border-green-200"}`}>
                            {m.sens === "sortie" ? "OUT" : "IN"} {m.sens === "sortie" ? "(sortie)" : "(retour)"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-bold">{m.nbCaisseGros}</td>
                        <td className="px-4 py-3 text-center font-bold">{m.nbCaisseDemi}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-black text-foreground">{m.nbCaisseGros + m.nbCaisseDemi}</span>
                        </td>
                        <td className="px-4 py-3">
                          {m.referenceDoc && (
                            <span className="font-mono text-[10px] text-muted-foreground">{m.referenceDoc.slice(0, 12)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{m.operateurNom}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground italic">{m.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Contenants / Tares */}
            <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-foreground">Contenants & Tares configurables</h3>
                  <p className="text-xs text-muted-foreground">Poids soustrait pour calculer le poids net. Ex: caisse 2.8kg, chario 15kg</p>
                </div>
                <button onClick={() => setShowContenantForm(true)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-white"
                  style={{ background: "oklch(0.38 0.2 260)" }}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Ajouter contenant
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {contenants.map(c => (
                  <div key={c.id} className={`rounded-xl border p-3 flex items-center justify-between gap-2 ${c.actif ? "border-border bg-muted/20" : "border-dashed border-muted-foreground/20 opacity-50"}`}>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{c.nom}</p>
                      <p className="text-xs text-muted-foreground">{c.poidsKg} kg de tare</p>
                      {c.notes && <p className="text-[10px] text-muted-foreground italic">{c.notes}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => store.updateContenant(c.id, { actif: !c.actif })} className={`text-xs px-2 py-0.5 rounded-full font-semibold ${c.actif ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                        {c.actif ? "Actif" : "Inactif"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })()}

      {showTransfert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={e => e.target === e.currentTarget && setShowTransfert(false)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="font-bold text-foreground">Transfert de stock / تحويل المخزون</h3>
              <button onClick={() => setShowTransfert(false)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-foreground">Article / المنتج</label>
                <ArticleCombobox
                  articles={articles}
                  value={transForm.articleId}
                  onChange={(artId, _art) => setTransForm({ ...transForm, articleId: artId })}
                  placeholder="Sélectionner un article..."
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-foreground">Sens du transfert / اتجاه التحويل</label>
                <select value={transForm.sens} onChange={e => setTransForm({ ...transForm, sens: e.target.value as typeof transForm.sens })} className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="conforme_vers_defect">Conforme vers Défect (تالف)</option>
                  <option value="defect_vers_conforme">Défect vers Conforme (تصحيح)</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-foreground">Quantité (kg)</label>
                <input type="number" min="1" value={transForm.quantite} onChange={e => setTransForm({ ...transForm, quantite: Number(e.target.value) })} className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-foreground">Motif / السبب</label>
                <input value={transForm.motif} onChange={e => setTransForm({ ...transForm, motif: e.target.value })} className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Avarie, contrôle qualité..." />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowTransfert(false)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors">Annuler</button>
                <button onClick={handleTransfert} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 transition-colors">Transférer</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
