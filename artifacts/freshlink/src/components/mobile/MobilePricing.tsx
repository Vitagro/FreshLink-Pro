"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { store, type PriceEntry, type PriceEntryType, type PriceSource, type Article, type User } from "@/lib/store"
import ComboBox, { type ComboItem } from "@/components/ui/ComboBox"

const GRADES   = ["A+", "A", "B", "C"]
const UNITES   = ["kg", "tonne", "caisse", "palette", "unité", "lot", "sac"]
const SOURCES: { id: PriceSource; emoji: string; label: string }[] = [
  { id: "visite",    emoji: "📍", label: "Visite" },
  { id: "marche",    emoji: "🏪", label: "Marché" },
  { id: "telephone", emoji: "📞", label: "Appel" },
  { id: "whatsapp",  emoji: "💬", label: "WhatsApp" },
  { id: "email",     emoji: "📧", label: "Email" },
  { id: "autre",     emoji: "📝", label: "Autre" },
]

function uid() { return `pe_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` }
function today() { return new Date().toISOString().split("T")[0] }

function calcEvolution(current: number, prev?: number): "hausse" | "baisse" | "stable" | undefined {
  if (!prev || prev === 0) return undefined
  const diff = ((current - prev) / prev) * 100
  if (Math.abs(diff) < 1) return "stable"
  return diff > 0 ? "hausse" : "baisse"
}

interface Props { user: User }

export default function MobilePricing({ user }: Props) {
  const [screen, setScreen] = useState<"home" | "form" | "history">("home")
  const [entries, setEntries]       = useState<PriceEntry[]>([])
  const [articles, setArticles]     = useState<Article[]>([])
  const [fourItems, setFourItems]   = useState<ComboItem[]>([])
  const [clientItems, setClientItems] = useState<ComboItem[]>([])
  const [gpsLoading, setGpsLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [selectedArticle, setSelectedArticle] = useState<string>("")
  const photoRef = useRef<HTMLInputElement>(null)

  // Form
  const [type, setType]           = useState<PriceEntryType>("fournisseur")
  const [articleNom, setArticleNom]     = useState("")
  const [categorie, setCategorie]       = useState("Légumes fruits")
  const [prix, setPrix]                 = useState("")
  const [unite, setUnite]               = useState("kg")
  const [grade, setGrade]               = useState("A")
  const [source, setSource]             = useState<PriceSource>("visite")
  const [nom, setNom]                   = useState("") // fournisseur/client name
  const [tel, setTel]                   = useState("")
  const [region, setRegion]             = useState("")
  const [marche, setMarche]             = useState("")
  const [prixMin, setPrixMin]           = useState("")
  const [prixMax, setPrixMax]           = useState("")
  const [notes, setNotes]               = useState("")
  const [date, setDate]                 = useState(today())
  const [gpsLat, setGpsLat]             = useState<number | undefined>()
  const [gpsLng, setGpsLng]             = useState<number | undefined>()
  const [photoUrl, setPhotoUrl]         = useState<string | undefined>()

  const load = useCallback(() => {
    setEntries(store.getPriceEntries())
    setArticles(store.getArticles())
    setFourItems(
      store.getFournisseurs().map(f => ({
        id: f.id,
        label: f.nom,
        sublabel: f.telephone ?? f.ville ?? undefined,
        badge: f.ville ?? undefined,
        badgeColor: "bg-amber-100 text-amber-700",
      }))
    )
    setClientItems(
      store.getClients().map(c => ({
        id: c.id,
        label: c.nom,
        sublabel: c.telephone ?? c.secteur ?? undefined,
        badge: c.type?.toUpperCase() ?? undefined,
        badgeColor: c.categorie === "chr"
          ? "bg-purple-100 text-purple-700"
          : "bg-blue-100 text-blue-700",
      }))
    )
  }, [])

  useEffect(() => { load() }, [load])

  function resetForm() {
    setType("fournisseur"); setArticleNom(""); setCategorie("Légumes fruits")
    setPrix(""); setUnite("kg"); setGrade("A"); setSource("visite")
    setNom(""); setTel(""); setRegion(""); setMarche("")
    setPrixMin(""); setPrixMax(""); setNotes(""); setDate(today())
    setGpsLat(undefined); setGpsLng(undefined); setPhotoUrl(undefined)
    setSelectedArticle("")
  }

  function openForm(t?: PriceEntryType) {
    resetForm()
    if (t) setType(t)
    setScreen("form")
  }

  function handleGPS() {
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      p => { setGpsLat(p.coords.latitude); setGpsLng(p.coords.longitude); setGpsLoading(false) },
      () => setGpsLoading(false),
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setPhotoUrl(ev.target?.result as string)
    reader.readAsDataURL(file)
    e.target.value = ""
  }

  function handleSave() {
    if (!articleNom.trim() || !prix || parseFloat(prix) <= 0) return
    if (type === "fournisseur" && !nom.trim()) return
    if (type === "client" && !nom.trim()) return

    const prev = entries.find(e =>
      e.articleNom.toLowerCase() === articleNom.toLowerCase() && e.type === type
    )
    const now = new Date().toISOString()
    const entry: PriceEntry = {
      id: uid(), createdAt: now, updatedAt: now,
      userId: user.id, userName: user.name,
      articleNom, categorie, type,
      fournisseurNom: type === "fournisseur" ? nom : undefined,
      fournisseurTel: type === "fournisseur" ? tel : undefined,
      region: type === "fournisseur" ? region : undefined,
      marche: type === "fournisseur" ? marche : undefined,
      clientNom:    type === "client" ? nom : undefined,
      clientTel:    type === "client" ? tel : undefined,
      clientRegion: type === "client" ? region : undefined,
      prixUnitaire: parseFloat(prix),
      unite, qualiteGrade: grade, source, date, notes: notes || undefined,
      prixMin: prixMin ? parseFloat(prixMin) : undefined,
      prixMax: prixMax ? parseFloat(prixMax) : undefined,
      prixPrecedent: prev?.prixUnitaire,
      evolution: calcEvolution(parseFloat(prix), prev?.prixUnitaire),
    }
    store.addPriceEntry(entry)
    load()
    setSaved(true)
    setTimeout(() => { setSaved(false); setScreen("home") }, 1400)
  }

  // Recent entries (last 20)
  const recent = entries.slice(0, 20)

  // --- HOME ---
  if (screen === "home") {
    const todayEntries = entries.filter(e => e.date === today())
    const thisWeek     = entries.filter(e => { const d = new Date(e.date); const n = new Date(); return (n.getTime() - d.getTime()) < 7 * 86400000 })

    return (
      <div className="flex flex-col gap-0 min-h-full">

        {/* Hero panel */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 px-5 pt-5 pb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
              </svg>
            </div>
            <div>
              <h1 className="text-white font-black text-base leading-tight">Relevé de Prix</h1>
              <p className="text-white/50 text-[11px]">رصد الأسعار الميداني</p>
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Aujourd'hui",   labelAr: "اليوم",    value: todayEntries.length, color: "bg-emerald-500/20 border-emerald-500/30 text-emerald-300" },
              { label: "Cette semaine", labelAr: "الأسبوع",  value: thisWeek.length,     color: "bg-blue-500/20 border-blue-500/30 text-blue-300" },
              { label: "Total",         labelAr: "الإجمالي", value: entries.length,       color: "bg-violet-500/20 border-violet-500/30 text-violet-300" },
            ].map(s => (
              <div key={s.label} className={`rounded-2xl border px-3 py-2.5 ${s.color}`}>
                <p className="text-xl font-black">{s.value}</p>
                <p className="text-[10px] font-semibold opacity-80">{s.label}</p>
                <p className="text-[9px] opacity-60" dir="rtl">{s.labelAr}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Quick action buttons */}
        <div className="px-4 -mt-3 flex gap-3">
          <button onClick={() => openForm("fournisseur")}
            className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl bg-amber-500 shadow-lg shadow-amber-500/30 text-white font-bold text-sm active:scale-95 transition-transform">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <div className="text-left">
              <div>Prix Fournisseur</div>
              <div className="text-[10px] font-normal opacity-80" dir="rtl">سعر المورد</div>
            </div>
          </button>
          <button onClick={() => openForm("client")}
            className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl bg-blue-500 shadow-lg shadow-blue-500/30 text-white font-bold text-sm active:scale-95 transition-transform">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <div className="text-left">
              <div>Prix Client</div>
              <div className="text-[10px] font-normal opacity-80" dir="rtl">سعر العميل</div>
            </div>
          </button>
        </div>

        {/* Recent entries */}
        <div className="px-4 mt-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-slate-800 text-sm">Derniers relevés / آخر الإدخالات</h2>
            {entries.length > 0 && (
              <button onClick={() => setScreen("history")} className="text-[11px] text-blue-600 font-semibold">
                Voir tout ({entries.length})
              </button>
            )}
          </div>

          {recent.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-slate-400">
              <svg className="w-10 h-10 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <p className="text-sm font-semibold">Aucun relevé encore</p>
              <p className="text-xs text-center">Utilisez les boutons ci-dessus pour<br />enregistrer vos premiers prix</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {recent.map(e => (
                <div key={e.id}
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl border ${e.type === "fournisseur" ? "bg-amber-50 border-amber-200" : "bg-blue-50 border-blue-200"}`}>
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${e.type === "fournisseur" ? "bg-amber-100" : "bg-blue-100"}`}>
                    <svg className={`w-4 h-4 ${e.type === "fournisseur" ? "text-amber-600" : "text-blue-600"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={e.type === "fournisseur"
                        ? "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1"
                        : "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"} />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-slate-800 text-sm truncate">{e.articleNom}</p>
                      {e.qualiteGrade && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600 shrink-0">
                          {e.qualiteGrade}
                        </span>
                      )}
                    </div>
                    <p className={`text-xs font-medium truncate ${e.type === "fournisseur" ? "text-amber-700" : "text-blue-700"}`}>
                      {e.type === "fournisseur" ? e.fournisseurNom : e.clientNom}
                      {(e.region || e.clientRegion) && ` — ${e.region ?? e.clientRegion}`}
                    </p>
                    <p className="text-[10px] text-slate-400">{new Date(e.date).toLocaleDateString("fr-MA")}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-black text-base ${e.type === "fournisseur" ? "text-amber-700" : "text-blue-700"}`}>
                      {e.prixUnitaire.toFixed(2)}
                    </p>
                    <p className="text-[10px] text-slate-500">MAD/{e.unite}</p>
                    {e.evolution && (
                      <span className={`text-[10px] font-bold ${e.evolution === "hausse" ? "text-red-500" : e.evolution === "baisse" ? "text-emerald-500" : "text-slate-400"}`}>
                        {e.evolution === "hausse" ? "↑" : e.evolution === "baisse" ? "↓" : "→"}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="h-8" />
      </div>
    )
  }

  // --- HISTORY ---
  if (screen === "history") {
    return (
      <div className="flex flex-col gap-0 min-h-full">
        <div className="px-4 py-4 flex items-center gap-3 bg-white border-b border-slate-200 sticky top-0 z-10">
          <button onClick={() => setScreen("home")} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <h2 className="font-bold text-slate-800">Historique complet — {entries.length} relevés</h2>
        </div>
        <div className="px-4 py-3 flex flex-col gap-2">
          {entries.map(e => (
            <div key={e.id}
              className={`flex items-start gap-3 px-4 py-3 rounded-2xl border ${e.type === "fournisseur" ? "bg-amber-50 border-amber-200" : "bg-blue-50 border-blue-200"}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-slate-800 text-sm">{e.articleNom}</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${e.type === "fournisseur" ? "bg-amber-100 border-amber-300 text-amber-700" : "bg-blue-100 border-blue-300 text-blue-700"}`}>
                    {e.type === "fournisseur" ? "Fourn" : "Client"}
                  </span>
                  {e.qualiteGrade && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600">{e.qualiteGrade}</span>}
                </div>
                <p className="text-xs text-slate-600 mt-0.5">{e.type === "fournisseur" ? e.fournisseurNom : e.clientNom} {e.region || e.clientRegion ? `— ${e.region ?? e.clientRegion}` : ""}</p>
                {e.marche && <p className="text-[10px] text-slate-400">{e.marche}</p>}
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[10px] text-slate-400">{new Date(e.date).toLocaleDateString("fr-MA")}</span>
                  <span className="text-[10px] text-slate-400">·</span>
                  <span className="text-[10px] text-slate-400">{SOURCES.find(s => s.id === e.source)?.emoji} {SOURCES.find(s => s.id === e.source)?.label}</span>
                  <span className="text-[10px] text-slate-400">·</span>
                  <span className="text-[10px] text-slate-400">{e.userName}</span>
                </div>
                {e.notes && <p className="text-[10px] text-slate-500 italic mt-0.5">{e.notes}</p>}
              </div>
              <div className="text-right shrink-0">
                <p className={`font-black text-lg ${e.type === "fournisseur" ? "text-amber-700" : "text-blue-700"}`}>{e.prixUnitaire.toFixed(2)}</p>
                <p className="text-[10px] text-slate-500">MAD/{e.unite}</p>
                {e.prixMin && e.prixMax && <p className="text-[10px] text-slate-400">{e.prixMin}–{e.prixMax}</p>}
                {e.evolution && (
                  <span className={`text-xs font-bold ${e.evolution === "hausse" ? "text-red-500" : e.evolution === "baisse" ? "text-emerald-500" : "text-slate-400"}`}>
                    {e.evolution === "hausse" ? "↑" : e.evolution === "baisse" ? "↓" : "→"} {e.prixPrecedent ? `vs ${e.prixPrecedent.toFixed(2)}` : ""}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="h-8" />
      </div>
    )
  }

  // --- FORM ---
  return (
    <div className="flex flex-col gap-0 min-h-full bg-slate-50">

      {/* Sticky header */}
      <div className={`sticky top-0 z-20 px-4 py-3.5 flex items-center gap-3 border-b ${type === "fournisseur" ? "bg-amber-600" : "bg-blue-600"}`}>
        <button onClick={() => setScreen("home")} className="p-1.5 rounded-xl bg-white/20 text-white">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="flex-1">
          <h2 className="text-white font-black text-sm">
            {type === "fournisseur" ? "Prix Fournisseur / سعر المورد" : "Prix Client / سعر العميل"}
          </h2>
          <p className="text-white/70 text-[10px]">Remplissez les champs obligatoires (*)</p>
        </div>
        {/* Type toggle */}
        <div className="flex gap-1 p-0.5 bg-white/20 rounded-xl">
          <button onClick={() => setType("fournisseur")}
            className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${type === "fournisseur" ? "bg-white text-amber-700" : "text-white"}`}>
            Fourn.
          </button>
          <button onClick={() => setType("client")}
            className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${type === "client" ? "bg-white text-blue-700" : "text-white"}`}>
            Client
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4 pt-4 pb-32">

        {/* Article */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-visible">
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wider">Article *</h3>
          </div>
          <div className="p-4 flex flex-col gap-3">
            <ComboBox
              variant="mobile"
              items={articles.map(a => ({
                id: a.id,
                label: a.nom,
                sublabel: a.famille,
                badge: a.unite,
                badgeColor: "bg-slate-100 text-slate-600",
              }))}
              value={selectedArticle}
              inputValue={articleNom}
              allowFreeText
              onChange={(_id, label) => {
                const art = articles.find(a => a.nom === label || a.id === _id)
                setArticleNom(label)
                setSelectedArticle(_id)
                if (art) {
                  setCategorie(art.famille ?? categorie)
                  setUnite(art.unite ?? unite)
                }
              }}
              onInputChange={txt => { setArticleNom(txt); setSelectedArticle("") }}
              placeholder="Nom du produit ex: Tomates…"
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] font-semibold text-slate-500 mb-1">Grade qualité</p>
                <div className="flex gap-1.5">
                  {GRADES.map(g => (
                    <button key={g} type="button" onClick={() => setGrade(g)}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-all ${grade === g ? "bg-slate-900 border-slate-900 text-white" : "border-slate-200 text-slate-400"}`}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-500 mb-1">Unité</p>
                <select value={unite} onChange={e => setUnite(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400">
                  {UNITES.map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Price */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wider">Prix observé *</h3>
          </div>
          <div className="p-4 flex flex-col gap-3">
            {/* Main price — big input */}
            <div className="flex items-center gap-3 px-4 py-4 rounded-2xl bg-slate-50 border border-slate-200">
              <input
                type="number" inputMode="decimal" step="0.01" min="0"
                value={prix}
                onChange={e => setPrix(e.target.value)}
                placeholder="0.00"
                className="flex-1 text-3xl font-black text-slate-900 bg-transparent border-0 outline-none w-0 min-w-0"
              />
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-slate-500">MAD</p>
                <p className="text-xs text-slate-400">/{unite}</p>
              </div>
            </div>
            {/* Min / Max */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] font-semibold text-slate-500 mb-1">Prix min (fourchette)</p>
                <input type="number" inputMode="decimal" step="0.01" value={prixMin} onChange={e => setPrixMin(e.target.value)}
                  placeholder="Ex: 3.50" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-500 mb-1">Prix max (fourchette)</p>
                <input type="number" inputMode="decimal" step="0.01" value={prixMax} onChange={e => setPrixMax(e.target.value)}
                  placeholder="Ex: 4.80" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
            </div>
            {/* Date */}
            <div>
              <p className="text-[10px] font-semibold text-slate-500 mb-1">Date relevé</p>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
          </div>
        </div>

        {/* Fournisseur / Client info */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className={`px-4 py-3 border-b border-slate-100 ${type === "fournisseur" ? "" : ""}`}>
            <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wider">
              {type === "fournisseur" ? "Fournisseur * / المورد" : "Client * / العميل"}
            </h3>
          </div>
          <div className="p-4 flex flex-col gap-3">
            <ComboBox
              variant="mobile"
              items={type === "fournisseur" ? fourItems : clientItems}
              value=""
              inputValue={nom}
              allowFreeText
              onChange={(_id, label) => {
                setNom(label)
                if (type === "fournisseur") {
                  const f = store.getFournisseurs().find(f => f.id === _id)
                  if (f) { setTel(f.telephone ?? ""); setRegion(f.ville ?? "") }
                } else {
                  const c = store.getClients().find(c => c.id === _id)
                  if (c) { setTel(c.telephone ?? ""); setRegion(c.secteur ?? "") }
                }
              }}
              onInputChange={txt => setNom(txt)}
              placeholder={type === "fournisseur" ? "Nom du fournisseur *" : "Nom du client *"}
            />
            <input type="tel" inputMode="tel" value={tel} onChange={e => setTel(e.target.value)}
              placeholder="+212 6..."
              className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            <div className="grid grid-cols-2 gap-2">
              <input value={region} onChange={e => setRegion(e.target.value)}
                placeholder="Région / المدينة"
                className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              {type === "fournisseur" && (
                <input value={marche} onChange={e => setMarche(e.target.value)}
                  placeholder="Marché / السوق"
                  className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              )}
            </div>
          </div>
        </div>

        {/* Source + GPS + Photo */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wider">Source & Localisation</h3>
          </div>
          <div className="p-4 flex flex-col gap-4">
            {/* Source chips */}
            <div>
              <p className="text-[10px] font-semibold text-slate-500 mb-2">Source de l&apos;information</p>
              <div className="flex flex-wrap gap-2">
                {SOURCES.map(s => (
                  <button key={s.id} type="button" onClick={() => setSource(s.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all ${source === s.id ? "bg-slate-900 border-slate-900 text-white" : "border-slate-200 text-slate-500"}`}>
                    <span>{s.emoji}</span>
                    <span>{s.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* GPS */}
            <div>
              <p className="text-[10px] font-semibold text-slate-500 mb-2">Position GPS</p>
              <div className="flex items-center gap-3">
                <button type="button" onClick={handleGPS} disabled={gpsLoading}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-bold transition-all ${gpsLat ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-slate-50 border-slate-200 text-slate-600"} disabled:opacity-50`}>
                  {gpsLoading ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  )}
                  {gpsLoading ? "Localisation..." : gpsLat ? "GPS capturé ✓" : "Capturer GPS"}
                </button>
                {gpsLat && gpsLng && (
                  <a href={`https://maps.google.com/?q=${gpsLat},${gpsLng}`} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-blue-600 font-semibold underline">
                    {gpsLat.toFixed(4)}, {gpsLng.toFixed(4)}
                  </a>
                )}
              </div>
            </div>

            {/* Photo */}
            <div>
              <p className="text-[10px] font-semibold text-slate-500 mb-2">Photo produit / marché</p>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => photoRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  {photoUrl ? "Changer photo" : "Prendre photo"}
                </button>
                {photoUrl && (
                  <div className="relative">
                    <img src={photoUrl} alt="preview" className="w-14 h-14 object-cover rounded-xl border border-slate-200" />
                    <button type="button" onClick={() => setPhotoUrl(undefined)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] font-black">
                      ×
                    </button>
                  </div>
                )}
              </div>
              <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wider">Notes / ملاحظات</h3>
          </div>
          <div className="p-4">
            <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Remarques sur la qualité, les conditions, la disponibilité..."
              className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none" />
          </div>
        </div>
      </div>

      {/* Sticky save button */}
      <div className="fixed bottom-[68px] left-0 right-0 px-4 pb-2 pt-3 bg-gradient-to-t from-slate-50 to-transparent">
        <button
          onClick={handleSave}
          disabled={!articleNom.trim() || !prix || parseFloat(prix) <= 0 || !nom.trim()}
          className={`w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-black text-base transition-all active:scale-98 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg ${saved
            ? "bg-emerald-500 shadow-emerald-500/30"
            : type === "fournisseur"
              ? "bg-amber-500 shadow-amber-500/30"
              : "bg-blue-500 shadow-blue-500/30"} text-white`}>
          {saved ? (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
              Enregistré !
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Enregistrer le relevé
              <span className="text-[11px] font-normal opacity-70">{articleNom && prix ? `${parseFloat(prix).toFixed(2)} MAD/${unite}` : ""}</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
