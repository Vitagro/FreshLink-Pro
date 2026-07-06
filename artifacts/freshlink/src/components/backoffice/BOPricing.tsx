"use client"

import { useState, useEffect, useCallback } from "react"
import { store, type PriceEntry, type PriceEntryType, type PriceSource, type PriceEvolution, type Article } from "@/lib/store"
import ArticleCombobox from "@/components/ui/ArticleCombobox"

const CATEGORIES  = ["Légumes fruits","Légumes racines","Légumes feuilles","Herbes aromatiques","Agrumes","Fruits tropicaux","Fruits rouges","Fruits secs","Céréales","Autre"]
const UNITES      = ["kg","tonne","caisse","palette","unité","lot","sac"]
const REGIONS     = ["Casablanca","Agadir","Marrakech","Fès","Meknès","Rabat","Salé","Oujda","Tétouan","Dakhla","Souss","Gharb","Autre"]
const GRADES      = ["A+","A","B","C"]
const SOURCES: { id: PriceSource; label: string; icon: string }[] = [
  { id: "visite",    label: "Visite terrain",  icon: "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" },
  { id: "telephone", label: "Appel téléphone", icon: "M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" },
  { id: "whatsapp",  label: "WhatsApp",        icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" },
  { id: "email",     label: "Email / message", icon: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
  { id: "marche",    label: "Relevé marché",   icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" },
  { id: "autre",     label: "Autre",           icon: "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
]

const EVOL_BADGE: Record<PriceEvolution, string> = {
  hausse: "text-red-600 bg-red-50 border-red-200",
  baisse: "text-emerald-600 bg-emerald-50 border-emerald-200",
  stable: "text-slate-500 bg-slate-50 border-slate-200",
}
const EVOL_ICON: Record<PriceEvolution, string> = {
  hausse: "↑",
  baisse: "↓",
  stable: "→",
}

function uid() { return `pe_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` }
function today() { return new Date().toISOString().split("T")[0] }

function calcEvolution(current: number, prev: number | undefined): PriceEvolution | undefined {
  if (!prev || prev === 0) return undefined
  const diff = ((current - prev) / prev) * 100
  if (Math.abs(diff) < 1) return "stable"
  return diff > 0 ? "hausse" : "baisse"
}

interface ArticleSummary {
  articleNom: string
  categorie: string
  latestFournisseur?: PriceEntry
  latestClient?: PriceEntry
  margin?: number
  fournisseurHistory: PriceEntry[]
  clientHistory: PriceEntry[]
}

export default function BOPricing({ user }: { user?: { id: string; name: string } }) {
  const [entries, setEntries]       = useState<PriceEntry[]>([])
  const [articles, setArticles]     = useState<Article[]>([])
  const [view, setView]             = useState<"list" | "by_article" | "form">("by_article")
  const [editId, setEditId]         = useState<string | null>(null)
  const [filterType, setFilterType] = useState<"all" | PriceEntryType>("all")
  const [filterCat, setFilterCat]   = useState("all")
  const [filterReg, setFilterReg]   = useState("all")
  const [search, setSearch]         = useState("")
  const [saved, setSaved]           = useState("")
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null)

  // Form state
  const emptyForm = (): Omit<PriceEntry, "id" | "createdAt" | "updatedAt" | "userId" | "userName"> => ({
    articleId: "", articleNom: "", categorie: "Légumes fruits",
    type: "fournisseur",
    fournisseurNom: "", fournisseurTel: "", region: "Casablanca", marche: "",
    clientNom: "", clientTel: "", clientRegion: "",
    prixUnitaire: 0, unite: "kg", prixMin: undefined, prixMax: undefined, qualiteGrade: "A",
    source: "visite", date: today(), notes: "",
    prixPrecedent: undefined, evolution: undefined,
  })
  const [form, setForm] = useState(emptyForm())

  const load = useCallback(() => {
    setEntries(store.getPriceEntries())
    setArticles(store.getArticles())
  }, [])

  useEffect(() => { load() }, [load])

  // Compute by-article summaries
  const articleSummaries: ArticleSummary[] = (() => {
    const map = new Map<string, { fournisseur: PriceEntry[]; client: PriceEntry[] }>()
    entries.forEach(e => {
      const key = e.articleNom.toLowerCase().trim()
      if (!map.has(key)) map.set(key, { fournisseur: [], client: [] })
      map.get(key)![e.type].push(e)
    })
    return Array.from(map.entries()).map(([, v]) => {
      const fSorted = [...v.fournisseur].sort((a, b) => b.date.localeCompare(a.date))
      const cSorted = [...v.client].sort((a, b) => b.date.localeCompare(a.date))
      const lf = fSorted[0]
      const lc = cSorted[0]
      const margin = lf && lc ? ((lc.prixUnitaire - lf.prixUnitaire) / lf.prixUnitaire) * 100 : undefined
      return {
        articleNom: (lf || lc)!.articleNom,
        categorie:  (lf || lc)!.categorie,
        latestFournisseur: lf,
        latestClient:      lc,
        margin,
        fournisseurHistory: fSorted,
        clientHistory:      cSorted,
      }
    }).sort((a, b) => a.articleNom.localeCompare(b.articleNom))
  })()

  const filtered = entries.filter(e => {
    if (filterType !== "all" && e.type !== filterType) return false
    if (filterCat  !== "all" && e.categorie !== filterCat) return false
    if (filterReg  !== "all" && e.region !== filterReg && e.clientRegion !== filterReg) return false
    if (search) {
      const q = search.toLowerCase()
      if (!e.articleNom.toLowerCase().includes(q) &&
          !(e.fournisseurNom ?? "").toLowerCase().includes(q) &&
          !(e.clientNom ?? "").toLowerCase().includes(q)) return false
    }
    return true
  })

  const stats = {
    totalEntries:  entries.length,
    articles:      articleSummaries.length,
    thisWeek:      entries.filter(e => { const d = new Date(e.date); const n = new Date(); return (n.getTime() - d.getTime()) < 7*86400000 }).length,
    avgMargin:     articleSummaries.filter(s => s.margin !== undefined).length > 0
      ? articleSummaries.filter(s => s.margin !== undefined).reduce((sum, s) => sum + s.margin!, 0) / articleSummaries.filter(s => s.margin !== undefined).length
      : null,
  }

  function openNew(type?: PriceEntryType) {
    const f = emptyForm()
    if (type) f.type = type
    setForm(f)
    setEditId(null)
    setView("form")
  }

  function openEdit(e: PriceEntry) {
    setForm({
      articleId: e.articleId ?? "",
      articleNom: e.articleNom, categorie: e.categorie, type: e.type,
      fournisseurNom: e.fournisseurNom ?? "", fournisseurTel: e.fournisseurTel ?? "",
      region: e.region ?? "Casablanca", marche: e.marche ?? "",
      clientNom: e.clientNom ?? "", clientTel: e.clientTel ?? "", clientRegion: e.clientRegion ?? "",
      prixUnitaire: e.prixUnitaire, unite: e.unite, prixMin: e.prixMin, prixMax: e.prixMax,
      qualiteGrade: e.qualiteGrade ?? "A",
      source: e.source, date: e.date, notes: e.notes ?? "",
      prixPrecedent: e.prixPrecedent, evolution: e.evolution,
    })
    setEditId(e.id)
    setView("form")
  }

  function handleSave() {
    if (!form.articleNom.trim() || form.prixUnitaire <= 0) {
      alert("Nom article et prix obligatoires")
      return
    }
    if (form.type === "fournisseur" && !form.fournisseurNom?.trim()) {
      alert("Nom fournisseur obligatoire")
      return
    }
    if (form.type === "client" && !form.clientNom?.trim()) {
      alert("Nom client obligatoire")
      return
    }
    // Calculate evolution vs previous
    const prev = entries.find(e =>
      e.id !== editId &&
      e.articleNom.toLowerCase() === form.articleNom.toLowerCase() &&
      e.type === form.type
    )
    const evolution = calcEvolution(form.prixUnitaire, prev?.prixUnitaire)
    const now = new Date().toISOString()
    const entry: PriceEntry = {
      id:            editId ?? uid(),
      createdAt:     editId ? entries.find(e => e.id === editId)!.createdAt : now,
      updatedAt:     now,
      userId:        user?.id   ?? "unknown",
      userName:      user?.name ?? "Inconnu",
      ...form,
      prixPrecedent: prev?.prixUnitaire,
      evolution,
    }
    if (editId) { store.updatePriceEntry(entry) }
    else        { store.addPriceEntry(entry) }
    setSaved("Relevé enregistré !")
    setTimeout(() => setSaved(""), 2000)
    load()
    setView("by_article")
  }

  // ── Form View ──────────────────────────────────────────────────────────────
  if (view === "form") {
    return (
      <div className="flex flex-col gap-5 max-w-2xl mx-auto">
        <div className="flex items-center justify-between gap-3">
          <button onClick={() => setView("by_article")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Annuler
          </button>
          <h2 className="font-bold text-foreground">{editId ? "Modifier le relevé" : "Nouveau relevé de prix"}</h2>
        </div>

        {/* Type selector */}
        <div className="flex gap-2">
          {([
            { id: "fournisseur" as PriceEntryType, label: "Prix Fournisseur", labelAr: "سعر المورد", color: "amber" },
            { id: "client"      as PriceEntryType, label: "Prix Client",      labelAr: "سعر العميل", color: "blue"  },
          ]).map(t => (
            <button key={t.id} type="button"
              onClick={() => setForm(f => ({ ...f, type: t.id }))}
              className={`flex-1 py-3 rounded-2xl border-2 text-sm font-bold transition-all ${form.type === t.id
                ? t.color === "amber" ? "bg-amber-50 border-amber-400 text-amber-800" : "bg-blue-50 border-blue-400 text-blue-800"
                : "border-border text-muted-foreground"}`}>
              <span>{t.label}</span>
              <span className="block text-[10px] font-semibold mt-0.5 opacity-70" dir="rtl">{t.labelAr}</span>
            </button>
          ))}
        </div>

        {/* Article */}
        <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-4">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-black">1</span>
            Article / المنتج
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2 flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted-foreground">Nom article *</label>
              <div className="flex gap-2">
                <input value={form.articleNom} onChange={e => setForm(f => ({ ...f, articleNom: e.target.value }))}
                  placeholder="Ex: Tomates rondes, Oranges Navel..."
                  className="flex-1 px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                {articles.length > 0 && (
                  <ArticleCombobox
                    articles={articles}
                    value={form.articleId ?? ""}
                    onChange={(artId, art) => {
                      if (art) setForm(f => ({ ...f, articleId: art.id, articleNom: art.nom, categorie: art.famille ?? f.categorie, unite: art.unite ?? f.unite }))
                    }}
                    placeholder="Catalogue..."
                    className="w-48"
                  />
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted-foreground">Catégorie</label>
              <select value={form.categorie} onChange={e => setForm(f => ({ ...f, categorie: e.target.value }))}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted-foreground">Grade qualité</label>
              <div className="flex gap-1.5">
                {GRADES.map(g => (
                  <button key={g} type="button" onClick={() => setForm(f => ({ ...f, qualiteGrade: g }))}
                    className={`flex-1 py-2 rounded-xl border text-xs font-bold transition-all ${form.qualiteGrade === g ? "bg-slate-900 border-slate-900 text-white" : "border-border text-muted-foreground"}`}>
                    {g}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Fournisseur or Client */}
        <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-4">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-black">2</span>
            {form.type === "fournisseur" ? "Fournisseur / المورد" : "Client / العميل"}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {form.type === "fournisseur" ? (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-muted-foreground">Nom fournisseur *</label>
                  <input value={form.fournisseurNom} onChange={e => setForm(f => ({ ...f, fournisseurNom: e.target.value }))}
                    placeholder="Nom du fournisseur"
                    className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-muted-foreground">Téléphone</label>
                  <input value={form.fournisseurTel} onChange={e => setForm(f => ({ ...f, fournisseurTel: e.target.value }))}
                    placeholder="+212 6..."
                    className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-muted-foreground">Région</label>
                  <select value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))}
                    className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                    {REGIONS.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-muted-foreground">Marché / Souk</label>
                  <input value={form.marche} onChange={e => setForm(f => ({ ...f, marche: e.target.value }))}
                    placeholder="Marché de gros..."
                    className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-muted-foreground">Nom client *</label>
                  <input value={form.clientNom} onChange={e => setForm(f => ({ ...f, clientNom: e.target.value }))}
                    placeholder="Nom du client"
                    className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-muted-foreground">Téléphone</label>
                  <input value={form.clientTel} onChange={e => setForm(f => ({ ...f, clientTel: e.target.value }))}
                    placeholder="+212 6..."
                    className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div className="sm:col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-semibold text-muted-foreground">Région client</label>
                  <select value={form.clientRegion} onChange={e => setForm(f => ({ ...f, clientRegion: e.target.value }))}
                    className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                    {REGIONS.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Price */}
        <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-4">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-black">3</span>
            Prix observé / السعر المرصود
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">Prix unitaire (MAD) *</label>
              <input type="number" step="0.01" min="0" value={form.prixUnitaire || ""}
                onChange={e => setForm(f => ({ ...f, prixUnitaire: parseFloat(e.target.value) || 0 }))}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted-foreground">Unité</label>
              <select value={form.unite} onChange={e => setForm(f => ({ ...f, unite: e.target.value }))}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                {UNITES.map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted-foreground">Date relevé</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted-foreground">Prix min observé</label>
              <input type="number" step="0.01" min="0" value={form.prixMin ?? ""}
                onChange={e => setForm(f => ({ ...f, prixMin: e.target.value ? parseFloat(e.target.value) : undefined }))}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted-foreground">Prix max observé</label>
              <input type="number" step="0.01" min="0" value={form.prixMax ?? ""}
                onChange={e => setForm(f => ({ ...f, prixMax: e.target.value ? parseFloat(e.target.value) : undefined }))}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="sm:col-span-2 flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted-foreground">Source de l&apos;information</label>
              <div className="flex flex-wrap gap-1.5">
                {SOURCES.map(s => (
                  <button key={s.id} type="button" onClick={() => setForm(f => ({ ...f, source: s.id }))}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all ${form.source === s.id ? "bg-slate-900 border-slate-900 text-white" : "border-border text-muted-foreground hover:border-slate-400"}`}>
                    <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={s.icon} />
                    </svg>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-2">
          <label className="text-xs font-semibold text-muted-foreground">Notes / ملاحظات</label>
          <textarea rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Informations supplémentaires, conditions, remarques sur la qualité..."
            className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
        </div>

        {saved && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            {saved}
          </div>
        )}

        <button onClick={handleSave}
          className="flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-900 text-white font-bold text-sm hover:opacity-90 transition-opacity">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          {editId ? "Mettre à jour" : "Enregistrer le relevé"}
        </button>
      </div>
    )
  }

  // ── By Article View ────────────────────────────────────────────────────────
  const ArticleView = () => (
    <div className="flex flex-col gap-4">
      {articleSummaries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <svg className="w-12 h-12 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p className="text-sm font-semibold">Aucun relevé de prix</p>
          <div className="flex gap-2">
            <button onClick={() => openNew("fournisseur")} className="text-xs text-amber-600 hover:underline font-semibold">+ Prix fournisseur</button>
            <button onClick={() => openNew("client")}      className="text-xs text-blue-600 hover:underline font-semibold">+ Prix client</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {articleSummaries.map(s => {
            const isOpen = expandedArticle === s.articleNom
            return (
              <div key={s.articleNom} className="bg-card rounded-2xl border border-border overflow-hidden">
                {/* Article header row */}
                <button
                  type="button"
                  onClick={() => setExpandedArticle(isOpen ? null : s.articleNom)}
                  className="w-full flex items-center gap-3 px-5 py-4 hover:bg-muted/30 transition-colors text-left">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-foreground">{s.articleNom}</span>
                      <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{s.categorie}</span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 flex-wrap">
                      {s.latestFournisseur && (
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                          <span className="text-xs font-semibold text-amber-700">
                            Fourn: {s.latestFournisseur.prixUnitaire.toFixed(2)} MAD/{s.latestFournisseur.unite}
                          </span>
                          {s.latestFournisseur.evolution && (
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${EVOL_BADGE[s.latestFournisseur.evolution]}`}>
                              {EVOL_ICON[s.latestFournisseur.evolution]}
                            </span>
                          )}
                        </div>
                      )}
                      {s.latestClient && (
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-blue-500" />
                          <span className="text-xs font-semibold text-blue-700">
                            Client: {s.latestClient.prixUnitaire.toFixed(2)} MAD/{s.latestClient.unite}
                          </span>
                          {s.latestClient.evolution && (
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${EVOL_BADGE[s.latestClient.evolution]}`}>
                              {EVOL_ICON[s.latestClient.evolution]}
                            </span>
                          )}
                        </div>
                      )}
                      {s.margin !== undefined && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${s.margin >= 20 ? "bg-emerald-50 border-emerald-200 text-emerald-700" : s.margin >= 10 ? "bg-yellow-50 border-yellow-200 text-yellow-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                          Marge: {s.margin.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button type="button" onClick={e => { e.stopPropagation(); openNew("fournisseur") }}
                      className="text-[10px] px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 font-semibold hover:bg-amber-100">
                      + Fourn
                    </button>
                    <button type="button" onClick={e => { e.stopPropagation(); openNew("client") }}
                      className="text-[10px] px-2.5 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 font-semibold hover:bg-blue-100">
                      + Client
                    </button>
                    <svg className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* Expanded history */}
                {isOpen && (
                  <div className="border-t border-border">
                    <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
                      {/* Fournisseur history */}
                      <div className="p-4">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600 mb-2 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                          Historique Fournisseurs / تاريخ الموردين
                        </p>
                        {s.fournisseurHistory.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Aucun relevé fournisseur</p>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {s.fournisseurHistory.map(e => (
                              <div key={e.id} className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-50/50 border border-amber-100 text-sm">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-amber-900">{e.prixUnitaire.toFixed(2)} MAD/{e.unite}</span>
                                    {e.evolution && (
                                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${EVOL_BADGE[e.evolution]}`}>
                                        {EVOL_ICON[e.evolution]} {e.prixPrecedent ? `vs ${e.prixPrecedent.toFixed(2)}` : ""}
                                      </span>
                                    )}
                                    {e.qualiteGrade && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">Grade {e.qualiteGrade}</span>}
                                  </div>
                                  <p className="text-xs text-amber-700 mt-0.5">{e.fournisseurNom} — {e.marche ?? ""} {e.region ? `(${e.region})` : ""}</p>
                                  {e.prixMin && e.prixMax && (
                                    <p className="text-[10px] text-amber-600">Fourchette: {e.prixMin}–{e.prixMax} MAD</p>
                                  )}
                                  <p className="text-[10px] text-slate-400 mt-0.5">{new Date(e.date).toLocaleDateString("fr-MA")} · {SOURCES.find(s => s.id === e.source)?.label} · {e.userName}</p>
                                  {e.notes && <p className="text-[10px] text-slate-500 mt-0.5 italic">{e.notes}</p>}
                                </div>
                                <div className="flex gap-1 shrink-0">
                                  <button onClick={() => openEdit(e)} className="p-1 rounded-lg hover:bg-amber-100 text-amber-600">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                  </button>
                                  <button onClick={() => setConfirmDelete(e.id)} className="p-1 rounded-lg hover:bg-red-100 text-red-500">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Client history */}
                      <div className="p-4">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-blue-600 mb-2 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-blue-500" />
                          Historique Clients / تاريخ العملاء
                        </p>
                        {s.clientHistory.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Aucun relevé client</p>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {s.clientHistory.map(e => (
                              <div key={e.id} className="flex items-start gap-2 p-2.5 rounded-xl bg-blue-50/50 border border-blue-100 text-sm">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-blue-900">{e.prixUnitaire.toFixed(2)} MAD/{e.unite}</span>
                                    {e.evolution && (
                                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${EVOL_BADGE[e.evolution]}`}>
                                        {EVOL_ICON[e.evolution]} {e.prixPrecedent ? `vs ${e.prixPrecedent.toFixed(2)}` : ""}
                                      </span>
                                    )}
                                    {e.qualiteGrade && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">Grade {e.qualiteGrade}</span>}
                                  </div>
                                  <p className="text-xs text-blue-700 mt-0.5">{e.clientNom} — {e.clientRegion ?? ""}</p>
                                  {e.prixMin && e.prixMax && (
                                    <p className="text-[10px] text-blue-600">Fourchette: {e.prixMin}–{e.prixMax} MAD</p>
                                  )}
                                  <p className="text-[10px] text-slate-400 mt-0.5">{new Date(e.date).toLocaleDateString("fr-MA")} · {SOURCES.find(s => s.id === e.source)?.label} · {e.userName}</p>
                                  {e.notes && <p className="text-[10px] text-slate-500 mt-0.5 italic">{e.notes}</p>}
                                </div>
                                <div className="flex gap-1 shrink-0">
                                  <button onClick={() => openEdit(e)} className="p-1 rounded-lg hover:bg-blue-100 text-blue-600">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                  </button>
                                  <button onClick={() => setConfirmDelete(e.id)} className="p-1 rounded-lg hover:bg-red-100 text-red-500">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  // ── List View ──────────────────────────────────────────────────────────────
  const ListView = () => (
    <div className="flex flex-col gap-3">
      {filtered.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-12">Aucun relevé correspondant aux filtres</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-2.5 text-xs font-bold text-muted-foreground">Date</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-muted-foreground">Article</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-muted-foreground">Type</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-muted-foreground">Fournisseur / Client</th>
                <th className="text-right px-4 py-2.5 text-xs font-bold text-muted-foreground">Prix</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-muted-foreground">Source</th>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-muted-foreground">Tendance</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(e => (
                <tr key={e.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{new Date(e.date).toLocaleDateString("fr-MA")}</td>
                  <td className="px-4 py-2.5">
                    <p className="font-semibold text-foreground whitespace-nowrap">{e.articleNom}</p>
                    <p className="text-[10px] text-muted-foreground">{e.categorie}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${e.type === "fournisseur" ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-blue-50 border-blue-200 text-blue-700"}`}>
                      {e.type === "fournisseur" ? "Fourn." : "Client"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    <p className="font-medium text-foreground">{e.type === "fournisseur" ? e.fournisseurNom : e.clientNom}</p>
                    <p className="text-muted-foreground">{e.type === "fournisseur" ? `${e.marche ?? ""} ${e.region ? `(${e.region})` : ""}` : e.clientRegion ?? ""}</p>
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <span className="font-bold text-foreground">{e.prixUnitaire.toFixed(2)}</span>
                    <span className="text-xs text-muted-foreground"> MAD/{e.unite}</span>
                    {(e.prixMin || e.prixMax) && (
                      <p className="text-[10px] text-muted-foreground">{e.prixMin ?? "?"} — {e.prixMax ?? "?"}</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{SOURCES.find(s => s.id === e.source)?.label ?? e.source}</td>
                  <td className="px-4 py-2.5">
                    {e.evolution ? (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${EVOL_BADGE[e.evolution]}`}>
                        {EVOL_ICON[e.evolution]} {e.prixPrecedent ? `vs ${e.prixPrecedent.toFixed(2)}` : e.evolution}
                      </span>
                    ) : <span className="text-muted-foreground text-[10px]">—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(e)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={() => setConfirmDelete(e.id)} className="p-1 rounded-lg hover:bg-red-100 text-red-500">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )

  // ── Main List Layout ───────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-black text-foreground">Relevé de Prix / رصد الأسعار</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Suivi des prix fournisseurs et clients par article avec tendances</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => openNew("fournisseur")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Prix Fournisseur
          </button>
          <button onClick={() => openNew("client")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Prix Client
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Relevés total",    value: stats.totalEntries, color: "bg-slate-50 border-slate-200" },
          { label: "Articles suivis",  value: stats.articles,     color: "bg-violet-50 border-violet-200" },
          { label: "Relevés cette sem",value: stats.thisWeek,     color: "bg-blue-50 border-blue-200" },
          { label: "Marge moy.",       value: stats.avgMargin !== null ? `${stats.avgMargin.toFixed(1)}%` : "—", color: stats.avgMargin !== null && stats.avgMargin >= 15 ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200" },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border p-3 ${s.color}`}>
            <p className="text-xl font-black text-foreground">{s.value}</p>
            <p className="text-[11px] text-muted-foreground font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 p-1 bg-muted rounded-xl border border-border">
          {[
            { id: "by_article" as const, label: "Par article" },
            { id: "list"       as const, label: "Liste détaillée" },
          ].map(v => (
            <button key={v.id} onClick={() => setView(v.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${view === v.id ? "bg-card shadow text-foreground border border-border" : "text-muted-foreground hover:text-foreground"}`}>
              {v.label}
            </button>
          ))}
        </div>

        {/* Filters — only for list view */}
        {view === "list" && (
          <>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..."
              className="flex-1 min-w-[140px] px-3 py-1.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            <select value={filterType} onChange={e => setFilterType(e.target.value as typeof filterType)}
              className="px-3 py-1.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="all">Tous types</option>
              <option value="fournisseur">Fournisseurs</option>
              <option value="client">Clients</option>
            </select>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="all">Toutes catégories</option>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
            <select value={filterReg} onChange={e => setFilterReg(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="all">Toutes régions</option>
              {REGIONS.map(r => <option key={r}>{r}</option>)}
            </select>
          </>
        )}
      </div>

      {view === "by_article" ? <ArticleView /> : <ListView />}

      {/* Confirm delete */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-card rounded-2xl border border-border shadow-xl p-6 flex flex-col gap-4 w-80">
            <p className="font-bold text-foreground">Supprimer ce relevé de prix ?</p>
            <p className="text-sm text-muted-foreground">Cette action est irréversible.</p>
            <div className="flex gap-2">
              <button onClick={() => { store.deletePriceEntry(confirmDelete); load(); setConfirmDelete(null) }}
                className="flex-1 py-2 rounded-xl bg-red-600 text-white font-bold text-sm">Supprimer</button>
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2 rounded-xl border border-border text-sm font-semibold">Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
