"use client"

import { useState, useRef, useEffect } from "react"
import { store, type Feedback, type FeedbackSource, type FeedbackStatut, type User } from "@/lib/store"

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props { user: User }

// ─── Bilingual labels ──────────────────────────────────────────────────────
const SOURCE_LABELS: Record<FeedbackSource, { fr: string; ar: string }> = {
  client:      { fr: "Client",         ar: "زبون" },
  fournisseur: { fr: "Fournisseur",    ar: "مورد" },
  equipe:      { fr: "Equipe Interne", ar: "فريق داخلي" },
}

const STATUT_LABELS: Record<FeedbackStatut, { fr: string; ar: string }> = {
  nouveau: { fr: "Nouveau", ar: "جديد" },
  lu:      { fr: "Lu",      ar: "مقروء" },
  traite:  { fr: "Traité",  ar: "معالج" },
}

const SOURCE_COLORS: Record<FeedbackSource, string> = {
  client:      "#10b981",
  fournisseur: "#f59e0b",
  equipe:      "#6366f1",
}

const STATUT_COLORS: Record<FeedbackStatut, string> = {
  nouveau: "#ef4444",
  lu:      "#f59e0b",
  traite:  "#10b981",
}

// ─── Predefined sujet categories (FR + AR) ────────────────────────────────
const SUJET_OPTIONS: { fr: string; ar: string }[] = [
  { fr: "Qualite produit",         ar: "جودة المنتج" },
  { fr: "Délai de livraison",      ar: "وقت التسليم" },
  { fr: "Service client",          ar: "خدمة الزبائن" },
  { fr: "Prix / Tarification",     ar: "الأسعار" },
  { fr: "Manque de stock",         ar: "نقص المخزون" },
  { fr: "Erreur de commande",      ar: "خطأ في الطلبية" },
  { fr: "Comportement livreur",    ar: "سلوك المندوب" },
  { fr: "Facturation / Avoir",     ar: "الفواتير والأرصدة" },
  { fr: "Retour marchandise",      ar: "إرجاع البضاعة" },
  { fr: "Suggestion amélioration", ar: "اقتراح تحسين" },
  { fr: "Félicitations",           ar: "مجاملة وشكر" },
  { fr: "Réclamation urgente",     ar: "شكوى عاجلة" },
]

// ─── MultiSelect dropdown ─────────────────────────────────────────────────
function MultiSelectSujet({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const toggle = (label: string) => {
    if (value.includes(label)) onChange(value.filter(v => v !== label))
    else onChange([...value, label])
  }

  const addCustom = () => {
    const t = custom.trim()
    if (!t || value.includes(t)) { setCustom(""); return }
    onChange([...value, t])
    setCustom("")
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs outline-none text-left"
        style={{ background: "#0a0f18", border: "1px solid #1a2535", color: value.length > 0 ? "#e2e8f0" : "#4b5563" }}>
        <span className="truncate">
          {value.length === 0 ? "Sélectionner catégorie(s) — اختر الفئة" : value.join(", ")}
        </span>
        <svg className={`w-4 h-4 ml-2 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: "#4b5563" }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {value.map(v => (
            <span key={v} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
              style={{ background: "#1d4ed822", color: "#93c5fd", border: "1px solid #1d4ed844" }}>
              {v}
              <button type="button" onClick={() => toggle(v)} className="hover:text-red-400 transition-colors">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-xl overflow-hidden shadow-2xl"
          style={{ background: "#0f1623", border: "1px solid #1a2535", maxHeight: 300 }}>
          <div className="overflow-y-auto" style={{ maxHeight: 240 }}>
            {SUJET_OPTIONS.map(opt => {
              const checked = value.includes(opt.fr)
              return (
                <button key={opt.fr} type="button" onClick={() => toggle(opt.fr)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5 transition-colors">
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${checked ? "border-blue-500 bg-blue-500" : "border-gray-600"}`}>
                    {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium" style={{ color: "#e2e8f0" }}>{opt.fr}</p>
                    <p className="text-[10px]" dir="rtl" style={{ color: "#4b5563" }}>{opt.ar}</p>
                  </div>
                </button>
              )
            })}
          </div>
          <div className="flex gap-2 p-3 border-t" style={{ borderColor: "#1a2535" }}>
            <input value={custom} onChange={e => setCustom(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addCustom()}
              placeholder="Autre catégorie... / فئة أخرى"
              className="flex-1 px-3 py-1.5 rounded-lg text-xs outline-none"
              style={{ background: "#0a0f18", border: "1px solid #1a2535", color: "#e2e8f0" }} />
            <button type="button" onClick={addCustom}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-white"
              style={{ background: "#1d4ed8" }}>
              + Ajouter
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Stars ────────────────────────────────────────────────────────────────
function Stars({ n, onRate }: { n: number; onRate?: (v: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <button key={i} type="button" onClick={() => onRate?.(i)}
          className={onRate ? "cursor-pointer" : "cursor-default"}>
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24"
            fill={i <= n ? "#f59e0b" : "none"} stroke={i <= n ? "#f59e0b" : "#374151"} strokeWidth={1.5}>
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </button>
      ))}
    </div>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────
function exportCSV(feedbacks: Feedback[]) {
  const cols = ["id", "date", "source", "auteur", "sujet", "note", "message", "statut"]
  const rows = feedbacks.map(f =>
    cols.map(c => `"${String((f as unknown as Record<string, unknown>)[c] ?? "").replace(/"/g, '""')}"`).join(",")
  )
  const blob = new Blob(["\uFEFF" + [cols.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8;" })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = `avis_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

// ─── Submit-only view (non-admin) ─────────────────────────────────────────
function SubmitOnlyView({ user }: { user: User }) {
  const [done, setDone] = useState(false)
  const [form, setForm] = useState({
    source: "client" as FeedbackSource,
    auteur: user.name ?? "",
    sujets: [] as string[],
    message: "",
    note: 5,
  })

  const submit = () => {
    if (!form.auteur.trim() || form.sujets.length === 0 || !form.message.trim()) return
    store.addFeedback({
      id: store.genId(),
      source: form.source,
      auteur: form.auteur,
      sujet: form.sujets.join(", "),
      message: form.message,
      note: form.note,
      date: store.today(),
      statut: "nouveau",
    })
    setDone(true)
  }

  if (done) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-6 p-8" style={{ background: "#080c14" }}>
        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "#0a1a10", border: "2px solid #10b981" }}>
          <svg className="w-8 h-8" fill="none" stroke="#10b981" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-base font-bold" style={{ color: "#f1f5f9" }}>Merci pour votre avis !</p>
          <p className="text-sm mt-1" dir="rtl" style={{ color: "#4b5563" }}>شكراً على رأيك، تم التسجيل بنجاح</p>
        </div>
        <button onClick={() => { setDone(false); setForm(f => ({ ...f, sujets: [], message: "", note: 5 })) }}
          className="px-5 py-2 rounded-xl text-xs font-bold text-white"
          style={{ background: "#1d4ed8" }}>
          Ajouter un autre avis / إضافة رأي آخر
        </button>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8 flex flex-col items-center" style={{ background: "#080c14" }}>
      <div className="w-full max-w-lg space-y-5">

        {/* Header */}
        <div className="text-center mb-2">
          <p className="text-lg font-bold" style={{ color: "#f1f5f9" }}>
            Donner votre avis
          </p>
          <p className="text-sm mt-1" dir="rtl" style={{ color: "#4b5563" }}>
            أخبرنا برأيك — آراؤكم تهمنا
          </p>
          <div className="mt-3 p-3 rounded-xl text-xs" style={{ background: "#0f1a10", border: "1px solid #15352a", color: "#4b6a4b" }}>
            Votre avis est confidentiel — seuls les responsables autorisés peuvent le consulter
            <span className="block" dir="rtl">رأيك سري ولن يطلع عليه سوى المسؤولين المخولين</span>
          </div>
        </div>

        {/* Source */}
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: "#94a3b8" }}>
            Vous êtes / أنتم
          </p>
          <div className="flex gap-2 flex-wrap">
            {(["client", "fournisseur", "equipe"] as FeedbackSource[]).map(s => (
              <button key={s} type="button"
                onClick={() => setForm(f => ({ ...f, source: s }))}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-all border"
                style={form.source === s ? {
                  background: SOURCE_COLORS[s] + "22", color: SOURCE_COLORS[s], border: `1px solid ${SOURCE_COLORS[s]}66`,
                } : { background: "#0a0f18", color: "#4b5563", border: "1px solid #1a2535" }}>
                <span>{SOURCE_LABELS[s].fr}</span>
                <span className="text-[10px] opacity-60" dir="rtl">/ {SOURCE_LABELS[s].ar}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Auteur */}
        <div>
          <p className="text-xs font-semibold mb-1.5" style={{ color: "#94a3b8" }}>
            Votre nom / اسمكم
          </p>
          <input value={form.auteur} onChange={e => setForm(f => ({ ...f, auteur: e.target.value }))}
            placeholder="Nom complet — الاسم الكامل"
            className="w-full px-3 py-2.5 rounded-xl text-xs outline-none"
            style={{ background: "#0a0f18", border: "1px solid #1a2535", color: "#e2e8f0" }} />
        </div>

        {/* Categories */}
        <div>
          <p className="text-xs font-semibold mb-1.5" style={{ color: "#94a3b8" }}>
            Sujet(s) / الموضوع
            <span className="text-[10px] font-normal mr-1" style={{ color: "#374151" }}>— plusieurs choix possibles</span>
          </p>
          <MultiSelectSujet value={form.sujets} onChange={v => setForm(f => ({ ...f, sujets: v }))} />
        </div>

        {/* Note */}
        <div>
          <p className="text-xs font-semibold mb-1.5" style={{ color: "#94a3b8" }}>
            Note / التقييم
          </p>
          <div className="flex items-center gap-3">
            <Stars n={form.note} onRate={v => setForm(f => ({ ...f, note: v }))} />
            <span className="text-base font-bold" style={{ color: "#f59e0b" }}>{form.note}/5</span>
            <span className="text-xs" style={{ color: "#4b5563" }}>
              {form.note === 5 ? "Excellent / ممتاز" :
               form.note === 4 ? "Très bien / جيد جداً" :
               form.note === 3 ? "Bien / جيد" :
               form.note === 2 ? "Moyen / متوسط" : "Insatisfait / غير راضٍ"}
            </span>
          </div>
        </div>

        {/* Message */}
        <div>
          <p className="text-xs font-semibold mb-1.5" style={{ color: "#94a3b8" }}>
            Votre message / رسالتكم
          </p>
          <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
            placeholder="Décrivez votre expérience en détail... / صفوا تجربتكم بالتفصيل..."
            rows={5}
            className="w-full px-3 py-2.5 rounded-xl text-xs outline-none resize-none"
            style={{ background: "#0a0f18", border: "1px solid #1a2535", color: "#e2e8f0" }} />
        </div>

        {/* Submit */}
        <button onClick={submit}
          disabled={!form.auteur.trim() || form.sujets.length === 0 || !form.message.trim()}
          className="w-full py-3 rounded-xl text-sm font-bold text-white transition-opacity disabled:opacity-40"
          style={{ background: "#1d4ed8" }}>
          Envoyer mon avis / إرسال الرأي
        </button>
      </div>
    </div>
  )
}

// ─── Admin list view ──────────────────────────────────────────────────────
function AdminView() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>(() => store.getFeedbacks())
  const [filterSource, setFilterSource] = useState<FeedbackSource | "all">("all")
  const [filterStatut, setFilterStatut] = useState<FeedbackStatut | "all">("all")
  const [selected, setSelected] = useState<Feedback | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({
    source: "client" as FeedbackSource,
    auteur: "",
    sujets: [] as string[],
    message: "",
    note: 5,
  })

  const reload = () => setFeedbacks(store.getFeedbacks())

  const markAs = (id: string, statut: FeedbackStatut) => {
    store.updateFeedbackStatus(id, statut)
    reload()
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, statut } : null)
  }

  const addFeedback = () => {
    if (!form.auteur.trim() || form.sujets.length === 0 || !form.message.trim()) return
    store.addFeedback({
      id: store.genId(),
      source: form.source,
      auteur: form.auteur,
      sujet: form.sujets.join(", "),
      message: form.message,
      note: form.note,
      date: store.today(),
      statut: "nouveau",
    })
    setForm({ source: "client", auteur: "", sujets: [], message: "", note: 5 })
    setShowAdd(false)
    reload()
  }

  const filtered = feedbacks.filter(f =>
    (filterSource === "all" || f.source === filterSource) &&
    (filterStatut === "all" || f.statut === filterStatut)
  )

  const stats = {
    total: feedbacks.length,
    nouveau: feedbacks.filter(f => f.statut === "nouveau").length,
    avgNote: feedbacks.length
      ? (feedbacks.reduce((s, f) => s + f.note, 0) / feedbacks.length).toFixed(1)
      : "—",
    traite: feedbacks.filter(f => f.statut === "traite").length,
  }

  return (
    <div className="h-full flex flex-col gap-4 p-4" style={{ background: "#080c14" }}>

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold" style={{ color: "#f1f5f9" }}>
            Feedbacks & Avis
            <span className="mr-2 font-normal text-base" style={{ color: "#4b5563" }}>/ الآراء والتقييمات</span>
          </h2>
          <p className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: "#374151" }}>
            <svg className="w-3 h-3" fill="none" stroke="#ef4444" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Vue administrateur — المستخدمون لا يرون آراء بعضهم البعض
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => exportCSV(feedbacks)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: "#0f2b1a", border: "1px solid #15352a", color: "#6ee7b7" }}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
            style={{ background: "#1d4ed8" }}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Ajouter / إضافة رأي
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { fr: "Total Avis",  ar: "مجموع الآراء",  v: String(stats.total),    c: "#6366f1" },
          { fr: "Nouveaux",    ar: "الجديدة",        v: String(stats.nouveau),  c: "#ef4444" },
          { fr: "Note Moy.",   ar: "متوسط التقييم", v: `${stats.avgNote}/5`,   c: "#f59e0b" },
          { fr: "Traités",     ar: "المعالجة",       v: String(stats.traite),   c: "#10b981" },
        ].map(s => (
          <div key={s.fr} className="rounded-xl p-3 flex items-center justify-between"
            style={{ background: "#0f1623", border: "1px solid #1a2535" }}>
            <div>
              <p className="text-xs font-medium" style={{ color: "#94a3b8" }}>{s.fr}</p>
              <p className="text-[10px]" dir="rtl" style={{ color: "#374151" }}>{s.ar}</p>
            </div>
            <p className="text-xl font-bold" style={{ color: s.c }}>{s.v}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {(["all", "client", "fournisseur", "equipe"] as const).map(s => (
          <button key={s} onClick={() => setFilterSource(s)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: filterSource === s ? "#1d4ed8" : "#0f1623",
              color: filterSource === s ? "white" : "#4b5563",
              border: `1px solid ${filterSource === s ? "#2563eb" : "#1a2535"}`,
            }}>
            {s === "all" ? "Tous" : SOURCE_LABELS[s as FeedbackSource].fr}
          </button>
        ))}
        <span style={{ color: "#1a2535" }}>|</span>
        {(["all", "nouveau", "lu", "traite"] as const).map(s => (
          <button key={s} onClick={() => setFilterStatut(s)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: filterStatut === s ? "#0f2b1a" : "#0f1623",
              color: filterStatut === s ? "#10b981" : "#4b5563",
              border: `1px solid ${filterStatut === s ? "#15352a" : "#1a2535"}`,
            }}>
            {s === "all" ? "Tous statuts" : STATUT_LABELS[s as FeedbackStatut].fr}
          </button>
        ))}
        <span className="text-xs ml-auto" style={{ color: "#374151" }}>{filtered.length} résultat(s)</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto rounded-xl overflow-hidden" style={{ border: "1px solid #1a2535" }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: "#0a0f18", borderBottom: "1px solid #1a2535" }}>
              {["Date", "Source", "Auteur / الكاتب", "Catégories", "Note", "Statut", "Actions"].map(h => (
                <th key={h} className="text-left px-4 py-2.5 font-medium whitespace-nowrap" style={{ color: "#4b5563" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody style={{ background: "#0f1623" }}>
            {filtered.map(f => (
              <tr key={f.id} style={{ borderBottom: "1px solid #1a253530" }}>
                <td className="px-4 py-3 whitespace-nowrap" style={{ color: "#4b5563" }}>{f.date}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={{ background: SOURCE_COLORS[f.source] + "22", color: SOURCE_COLORS[f.source], border: `1px solid ${SOURCE_COLORS[f.source]}44` }}>
                    {SOURCE_LABELS[f.source].fr}
                  </span>
                </td>
                <td className="px-4 py-3 font-medium" style={{ color: "#e2e8f0" }}>{f.auteur}</td>
                <td className="px-4 py-3" style={{ maxWidth: 200 }}>
                  <div className="flex flex-wrap gap-1">
                    {f.sujet.split(", ").map((s, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                        style={{ background: "#1d4ed822", color: "#93c5fd", border: "1px solid #1d4ed844" }}>
                        {s}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3"><Stars n={f.note} /></td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                    style={{ background: STATUT_COLORS[f.statut] + "22", color: STATUT_COLORS[f.statut], border: `1px solid ${STATUT_COLORS[f.statut]}44` }}>
                    {STATUT_LABELS[f.statut].fr}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setSelected(f)} className="p-1 rounded-lg"
                      style={{ background: "#0a0f18", border: "1px solid #1a2535" }} title="Voir détail">
                      <svg className="w-3 h-3" fill="none" stroke="#60a5fa" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </button>
                    {f.statut !== "traite" && (
                      <button onClick={() => markAs(f.id, f.statut === "nouveau" ? "lu" : "traite")}
                        className="p-1 rounded-lg" style={{ background: "#0a0f18", border: "1px solid #1a2535" }}>
                        <svg className="w-3 h-3" fill="none" stroke="#10b981" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center" style={{ color: "#374151" }}>
                  Aucun avis trouvé — لا توجد آراء
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
          onClick={() => setSelected(null)}>
          <div className="w-full max-w-lg rounded-2xl overflow-hidden"
            style={{ background: "#0f1623", border: "1px solid #1a2535" }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #1a2535" }}>
              <div>
                <p className="font-bold text-sm" style={{ color: "#f1f5f9" }}>Détail Avis / تفاصيل الرأي</p>
                <p className="text-[10px]" style={{ color: "#4b5563" }}>{selected.date}</p>
              </div>
              <button onClick={() => setSelected(null)}>
                <svg className="w-4 h-4" fill="none" stroke="#6b7280" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-1 rounded-full text-xs font-bold"
                  style={{ background: SOURCE_COLORS[selected.source] + "22", color: SOURCE_COLORS[selected.source] }}>
                  {SOURCE_LABELS[selected.source].fr} / {SOURCE_LABELS[selected.source].ar}
                </span>
                <Stars n={selected.note} />
              </div>
              <div>
                <p className="text-xs font-semibold" style={{ color: "#4b5563" }}>Auteur / الكاتب</p>
                <p className="text-sm font-bold" style={{ color: "#f1f5f9" }}>{selected.auteur}</p>
              </div>
              <div>
                <p className="text-xs font-semibold mb-1" style={{ color: "#4b5563" }}>Catégories / الفئات</p>
                <div className="flex flex-wrap gap-1">
                  {selected.sujet.split(", ").map((s, i) => (
                    <span key={i} className="px-2 py-0.5 rounded text-xs font-medium"
                      style={{ background: "#1d4ed822", color: "#93c5fd", border: "1px solid #1d4ed844" }}>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold mb-1" style={{ color: "#4b5563" }}>Message / الرسالة</p>
                <div className="p-3 rounded-xl" style={{ background: "#0a0f18", border: "1px solid #1a2535" }}>
                  <p className="text-xs leading-relaxed" style={{ color: "#94a3b8" }}>{selected.message}</p>
                </div>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{ background: STATUT_COLORS[selected.statut] + "22", color: STATUT_COLORS[selected.statut] }}>
                  {STATUT_LABELS[selected.statut].fr} / {STATUT_LABELS[selected.statut].ar}
                </span>
                <div className="flex gap-2">
                  {selected.statut !== "traite" && (
                    <>
                      {selected.statut === "nouveau" && (
                        <button onClick={() => markAs(selected.id, "lu")}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold"
                          style={{ background: "#78350f33", color: "#fde68a", border: "1px solid #78350f44" }}>
                          Marquer Lu
                        </button>
                      )}
                      <button onClick={() => markAs(selected.id, "traite")}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold"
                        style={{ background: "#0d2e18", color: "#6ee7b7", border: "1px solid #15352a" }}>
                        Traité / معالج
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
          onClick={() => setShowAdd(false)}>
          <div className="w-full max-w-lg rounded-2xl overflow-hidden"
            style={{ background: "#0f1623", border: "1px solid #1a2535" }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #1a2535" }}>
              <p className="font-bold text-sm" style={{ color: "#f1f5f9" }}>Saisir un Avis / رأي جديد</p>
              <button onClick={() => setShowAdd(false)}>
                <svg className="w-4 h-4" fill="none" stroke="#6b7280" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto" style={{ maxHeight: "70vh" }}>
              {/* Source */}
              <div>
                <p className="text-xs font-semibold mb-1.5" style={{ color: "#94a3b8" }}>Source / المصدر</p>
                <div className="flex gap-2 flex-wrap">
                  {(["client", "fournisseur", "equipe"] as FeedbackSource[]).map(s => (
                    <button key={s} type="button" onClick={() => setForm(f => ({ ...f, source: s }))}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-xs font-medium transition-all border"
                      style={form.source === s ? {
                        background: SOURCE_COLORS[s] + "22", color: SOURCE_COLORS[s], border: `1px solid ${SOURCE_COLORS[s]}66`,
                      } : { background: "#0a0f18", color: "#4b5563", border: "1px solid #1a2535" }}>
                      {SOURCE_LABELS[s].fr}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold mb-1.5" style={{ color: "#94a3b8" }}>Auteur / الكاتب</p>
                <input value={form.auteur} onChange={e => setForm(f => ({ ...f, auteur: e.target.value }))}
                  placeholder="Nom du client / fournisseur / employé"
                  className="w-full px-3 py-2.5 rounded-xl text-xs outline-none"
                  style={{ background: "#0a0f18", border: "1px solid #1a2535", color: "#e2e8f0" }} />
              </div>
              <div>
                <p className="text-xs font-semibold mb-1.5" style={{ color: "#94a3b8" }}>
                  Catégories / الفئات
                  <span className="text-[10px] font-normal mr-1" style={{ color: "#374151" }}>— sélection multiple</span>
                </p>
                <MultiSelectSujet value={form.sujets} onChange={v => setForm(f => ({ ...f, sujets: v }))} />
              </div>
              <div>
                <p className="text-xs font-semibold mb-1.5" style={{ color: "#94a3b8" }}>Note / التقييم</p>
                <div className="flex items-center gap-3">
                  <Stars n={form.note} onRate={v => setForm(f => ({ ...f, note: v }))} />
                  <span className="text-sm font-bold" style={{ color: "#f59e0b" }}>{form.note}/5</span>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold mb-1.5" style={{ color: "#94a3b8" }}>Message / الرسالة</p>
                <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                  placeholder="Détails de l'avis..."
                  rows={4}
                  className="w-full px-3 py-2.5 rounded-xl text-xs outline-none resize-none"
                  style={{ background: "#0a0f18", border: "1px solid #1a2535", color: "#e2e8f0" }} />
              </div>
              <button onClick={addFeedback}
                disabled={!form.auteur.trim() || form.sujets.length === 0 || !form.message.trim()}
                className="w-full py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-40"
                style={{ background: "#1d4ed8" }}>
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main export — routes by admin status ─────────────────────────────────
export default function FeedbackPanel({ user }: Props) {
  const isAdmin = user.role === "super_super_admin" || user.role === "super_admin" || user.role === "admin" || user.canViewDatabase
  if (!isAdmin) return <SubmitOnlyView user={user} />
  return <AdminView />
}
