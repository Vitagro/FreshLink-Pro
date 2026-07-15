"use client"

import { useState, useEffect, useCallback } from "react"
import { store, effectiveGroupId, canSeeAllGroups } from "@/lib/store"

// ══════════════════════════════════════════════════════════════════════════════
// Analyse Crédit — fournisseurs + clients (rapport quotidien)
// Source : /api/ext/rapport-credit (BL « émis » + fl_credits_fournisseurs).
// Un cron Vercel envoie ce rapport par email chaque jour ; le bouton
// « Envoyer maintenant » déclenche le même envoi à la demande.
// ══════════════════════════════════════════════════════════════════════════════

interface CreditEntry { nom: string; date: string; reste: number; extra?: string }
interface SideReport {
  jour: { valeur: number; credit: number; pct: number; nbTiers: number }
  totalCredits: number
  plusGrand: CreditEntry | null
  plusAncien: CreditEntry | null
  top3: { nom: string; total: number }[]
}
interface Report {
  date: string
  fournisseurs: SideReport
  clients: SideReport
  prevendeurs: {
    plusAncienCredit: { prevendeur: string; client: string; date: string; montant: number } | null
    plusGrandCredit: { prevendeur: string; montant: number } | null
  }
  generatedAt: string
}

const money = (n: number) => `${(n ?? 0).toLocaleString("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`
const ADMIN_KEY = "vita-bypass-2026"

export default function BOAnalyseCredit() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [sendTo, setSendTo] = useState("")
  const [sending, setSending] = useState(false)
  const [sendMsg, setSendMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async (d: string) => {
    setLoading(true); setError("")
    try {
      // Isolation par équipe : chaque équipe ne voit que le crédit de ses
      // propres clients — sauf le super administrateur (vision globale).
      const me = store.getSession()
      const groupeParam = me && !canSeeAllGroups(me) ? `&groupeId=${encodeURIComponent(effectiveGroupId(me))}` : ""
      const res = await fetch(`/api/ext/rapport-credit?date=${encodeURIComponent(d)}${groupeParam}`, { cache: "no-store" })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error ?? `HTTP ${res.status}`)
      setReport(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement")
      setReport(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load(date) }, [date, load])

  const sendNow = async () => {
    setSending(true); setSendMsg(null)
    try {
      const to = sendTo.trim()
      const url = `/api/ext/rapport-credit?date=${encodeURIComponent(date)}&send=1&key=${encodeURIComponent(ADMIN_KEY)}${to ? `&to=${encodeURIComponent(to)}` : ""}`
      const res = await fetch(url, { cache: "no-store" })
      const j = await res.json().catch(() => ({})) as { emailSent?: boolean; emailDetail?: { error?: string; hint?: string } }
      if (res.ok && j.emailSent) setSendMsg({ ok: true, text: "✅ Rapport envoyé par email." })
      else setSendMsg({ ok: false, text: `Échec d'envoi : ${j.emailDetail?.error ?? "vérifier RESEND_API_KEY"}${j.emailDetail?.hint ? " — " + j.emailDetail.hint : ""}` })
    } catch { setSendMsg({ ok: false, text: "Erreur réseau." }) }
    setSending(false)
    setTimeout(() => setSendMsg(null), 8000)
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">📊 Analyse Crédit</h1>
          <p className="text-sm text-slate-500 mt-1">Fournisseurs + Clients — rapport envoyé chaque jour par email (cron)</p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Journée</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm" />
          </div>
          <input type="email" value={sendTo} onChange={e => setSendTo(e.target.value)}
            placeholder="email destinataire (optionnel)"
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm w-56" />
          <button onClick={sendNow} disabled={sending || loading}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50">
            {sending ? "Envoi…" : "📧 Envoyer maintenant"}
          </button>
        </div>
      </div>
      {sendMsg && (
        <div className={`px-3 py-2 rounded-xl text-xs font-semibold ${sendMsg.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {sendMsg.text}
        </div>
      )}

      {loading ? (
        <div className="grid md:grid-cols-2 gap-4">{[0, 1].map(i => <div key={i} className="h-72 rounded-2xl bg-slate-100 animate-pulse" />)}</div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">⚠️ {error}</div>
      ) : report && (
        <>
          <div className="grid md:grid-cols-2 gap-4">
            <SideCard titre="🏭 Fournisseurs" unit="achat" r={report.fournisseurs} />
            <SideCard titre="👥 Clients" unit="vente" r={report.clients} />
          </div>

          {/* Prévendeurs */}
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5">
            <h2 className="font-bold text-slate-900 mb-3">🧑‍💼 Prévendeurs</h2>
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-white border border-slate-200 p-4">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Plus ancien crédit</p>
                {report.prevendeurs.plusAncienCredit ? (
                  <p className="mt-1 font-bold text-slate-900">
                    {report.prevendeurs.plusAncienCredit.prevendeur}
                    <span className="block text-xs font-normal text-slate-500 mt-0.5">
                      client {report.prevendeurs.plusAncienCredit.client} · {report.prevendeurs.plusAncienCredit.date} · {money(report.prevendeurs.plusAncienCredit.montant)}
                    </span>
                  </p>
                ) : <p className="mt-1 text-slate-400">—</p>}
              </div>
              <div className="rounded-xl bg-white border border-slate-200 p-4">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Plus grande valeur de crédit</p>
                {report.prevendeurs.plusGrandCredit ? (
                  <p className="mt-1 font-bold text-slate-900">
                    {report.prevendeurs.plusGrandCredit.prevendeur}
                    <span className="block text-xs font-normal text-red-600 mt-0.5">{money(report.prevendeurs.plusGrandCredit.montant)}</span>
                  </p>
                ) : <p className="mt-1 text-slate-400">—</p>}
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-400">
            Crédit client = BL « émis » non encaissés · Crédit fournisseur = écran Crédit Fournisseur (synchronisé).
            Généré {new Date(report.generatedAt).toLocaleString("fr-MA")}.
          </p>
        </>
      )}
    </div>
  )
}

function SideCard({ titre, unit, r }: { titre: string; unit: string; r: SideReport }) {
  const Line = ({ k, v, accent }: { k: string; v: React.ReactNode; accent?: string }) => (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-500">{k}</span>
      <span className={`text-sm font-bold text-right ${accent ?? "text-slate-900"}`}>{v}</span>
    </div>
  )
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="font-bold text-slate-900 mb-1">{titre}</h2>
      <div className="grid grid-cols-2 gap-2 my-3">
        <Kpi label={`Valeur ${unit} (J)`} value={money(r.jour.valeur)} />
        <Kpi label="Crédit (J)" value={money(r.jour.credit)} accent={r.jour.credit > 0 ? "text-amber-600" : undefined} />
        <Kpi label="% crédit (J)" value={`${r.jour.pct} %`} accent={r.jour.pct > 50 ? "text-red-600" : undefined} />
        <Kpi label="Nb tiers (J)" value={String(r.jour.nbTiers)} />
      </div>
      <Line k="Total des crédits" v={money(r.totalCredits)} accent="text-red-600" />
      <Line k="Plus grand montant" v={r.plusGrand ? <>{money(r.plusGrand.reste)}<span className="block text-[11px] font-normal text-slate-500">{r.plusGrand.nom} · {r.plusGrand.date}</span></> : "—"} />
      <Line k="Plus ancien crédit" v={r.plusAncien ? <>{r.plusAncien.date}<span className="block text-[11px] font-normal text-slate-500">{r.plusAncien.nom} · {money(r.plusAncien.reste)}</span></> : "—"} />
      <Line k="Top 3" v={r.top3.length
        ? <span className="flex flex-col gap-0.5">{r.top3.map((t, i) => <span key={t.nom} className="text-xs">{i + 1}. {t.nom} <span className="text-red-600">({money(t.total)})</span></span>)}</span>
        : "—"} />
    </div>
  )
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
      <p className="text-[10px] text-slate-500 truncate">{label}</p>
      <p className={`text-base font-black ${accent ?? "text-slate-900"}`}>{value}</p>
    </div>
  )
}
