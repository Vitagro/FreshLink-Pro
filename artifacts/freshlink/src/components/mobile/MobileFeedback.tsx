"use client"

import { useState } from "react"
import { type User, store } from "@/lib/store"

interface Props { user: User }

const CATEGORIES = ["Application", "Achat", "Commercial", "Logistique", "Finance", "Autre"]

export default function MobileFeedback({ user }: Props) {
  const [rating, setRating]       = useState(0)
  const [hovered, setHovered]     = useState(0)
  const [category, setCategory]   = useState("Application")
  const [message, setMessage]     = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [history, setHistory]     = useState<{ rating: number; category: string; message: string; date: string }[]>(() => {
    try { return JSON.parse(localStorage.getItem("fl_feedbacks_" + user.id) ?? "[]") } catch { return [] }
  })

  const submit = async () => {
    if (!rating || !message.trim()) return
    setSaving(true)
    await new Promise(r => setTimeout(r, 600))
    const entry = { rating, category, message: message.trim(), date: new Date().toLocaleString("fr-FR") }
    const updated = [entry, ...history].slice(0, 20)
    localStorage.setItem("fl_feedbacks_" + user.id, JSON.stringify(updated))
    setHistory(updated)
    // Also push to store feedbacks if exists
    try {
      store.addFeedback?.({ id: store.genId(), source: "client", auteur: user.name ?? "", sujet: category, message: entry.message, note: rating, date: entry.date, statut: "nouveau" })
    } catch { /* silent */ }
    setSaving(false)
    setSubmitted(true)
    setRating(0)
    setMessage("")
    setTimeout(() => setSubmitted(false), 3000)
  }

  const STAR_LABELS = ["", "Mauvais", "Peut mieux faire", "Correct", "Bien", "Excellent"]

  return (
    <div className="px-4 py-4 space-y-4">

      {/* Success toast */}
      {submitted && (
        <div className="rounded-2xl px-4 py-3 flex items-center gap-3"
          style={{ background: "oklch(0.16 0.040 148)", border: "1px solid oklch(0.30 0.10 148)" }}>
          <svg className="w-5 h-5 shrink-0" style={{ color: "oklch(0.65 0.18 148)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm font-semibold" style={{ color: "oklch(0.75 0.14 148)" }}>Merci pour votre avis !</p>
        </div>
      )}

      {/* New feedback form */}
      <div className="rounded-2xl p-4 space-y-4"
        style={{ background: "oklch(0.12 0.010 145)", border: "1px solid oklch(0.20 0.012 145)" }}>
        <h3 className="text-sm font-bold" style={{ color: "oklch(0.88 0.006 100)" }}>Laisser un avis</h3>

        {/* Stars */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex gap-2">
            {[1,2,3,4,5].map(s => (
              <button
                key={s}
                onMouseEnter={() => setHovered(s)}
                onMouseLeave={() => setHovered(0)}
                onClick={() => setRating(s)}
                className="transition-transform hover:scale-110 active:scale-95"
              >
                <svg className="w-9 h-9" viewBox="0 0 24 24" fill={(hovered || rating) >= s ? "#f59e0b" : "none"} stroke={(hovered || rating) >= s ? "#f59e0b" : "oklch(0.35 0.008 145)"} strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
              </button>
            ))}
          </div>
          {(hovered || rating) > 0 && (
            <p className="text-xs font-semibold" style={{ color: "#f59e0b" }}>{STAR_LABELS[hovered || rating]}</p>
          )}
        </div>

        {/* Category */}
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setCategory(c)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={category === c
                ? { background: "oklch(0.58 0.18 148)", color: "#fff" }
                : { background: "oklch(0.16 0.010 145)", color: "oklch(0.55 0.008 145)", border: "1px solid oklch(0.22 0.010 145)" }
              }>
              {c}
            </button>
          ))}
        </div>

        {/* Message */}
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Decrivez votre experience, suggestion ou probleme..."
          rows={3}
          className="w-full px-3.5 py-2.5 rounded-xl text-sm resize-none focus:outline-none transition-all"
          style={{ background: "oklch(0.15 0.010 145)", border: "1px solid oklch(0.22 0.010 145)", color: "oklch(0.88 0.006 100)" }}
        />

        <button
          onClick={submit}
          disabled={!rating || !message.trim() || saving}
          className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2"
          style={{ background: "oklch(0.58 0.18 148)" }}
        >
          {saving ? (
            <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Envoi...</>
          ) : "Envoyer l'avis"}
        </button>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-widest px-1" style={{ color: "oklch(0.45 0.010 145)" }}>
            Mes avis precedents
          </h4>
          {history.map((h, i) => (
            <div key={i} className="rounded-xl p-3 space-y-1.5"
              style={{ background: "oklch(0.12 0.010 145)", border: "1px solid oklch(0.18 0.010 145)" }}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex gap-0.5">
                  {[1,2,3,4,5].map(s => (
                    <svg key={s} className="w-3.5 h-3.5" viewBox="0 0 24 24"
                      fill={h.rating >= s ? "#f59e0b" : "none"} stroke={h.rating >= s ? "#f59e0b" : "oklch(0.30 0.008 145)"} strokeWidth={1.5}>
                      <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-2 py-0.5 rounded-full"
                    style={{ background: "oklch(0.16 0.020 148)", color: "oklch(0.65 0.14 148)" }}>{h.category}</span>
                  <span className="text-[10px]" style={{ color: "oklch(0.42 0.008 145)" }}>{h.date}</span>
                </div>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: "oklch(0.65 0.006 100)" }}>{h.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
