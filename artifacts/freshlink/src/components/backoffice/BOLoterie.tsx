"use client"

import { useState, useEffect } from "react"
import type { User } from "@/lib/store"

type Cible = "tous" | "nouveau" | "client" | "vip" | "fournisseur"
interface Segment {
  id: string; label: string; montant: number; type: string; code?: string; image?: string
  poids: number; dateDebut?: string; dateFin?: string; maxGagnants?: number | null; ciblesAutorisees: Cible[]
}
interface LoterieCfg { active: boolean; seuilCible: number; segments: Segment[] }

const TYPES = [["reduction", "Réduction (DH)"], ["pourcentage", "Réduction (%)"], ["freeship", "Livraison offerte"], ["cadeau", "Cadeau"], ["code", "Code promo"]]
const CIBLES: Cible[] = ["tous", "nouveau", "client", "vip", "fournisseur"]

export default function BOLoterie({ user }: { user: User }) {
  const [cfg, setCfg] = useState<LoterieCfg>({ active: false, seuilCible: 5000, segments: [] })
  const [winners, setWinners] = useState<Record<string, { count: number }>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const canEdit = ["super_super_admin", "super_admin", "admin", "resp_commercial"].includes(user.role)

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/sync-read?table=fl_notices", { cache: "no-store" })
        const j = await res.json()
        const data = (j?.data ?? []) as { id: string; payload?: Record<string, unknown> }[]
        const c = data.find(r => r.id === "__loterie_config")?.payload as LoterieCfg | undefined
        if (c) setCfg({ active: !!c.active, seuilCible: Number(c.seuilCible) || 5000, segments: Array.isArray(c.segments) ? c.segments : [] })
        const w = data.find(r => r.id === "__loterie_winners")?.payload as Record<string, { count: number }> | undefined
        if (w) setWinners(w)
      } catch { /* hors ligne */ }
      setLoading(false)
    })()
  }, [])

  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 4000) }
  const upd = (fn: (c: LoterieCfg) => LoterieCfg) => setCfg(c => fn(structuredClone(c)))

  const addSeg = () => upd(c => {
    c.segments.push({ id: "s" + Date.now().toString(36), label: "Nouvelle récompense", montant: 0, type: "reduction", poids: 1, ciblesAutorisees: ["tous"] })
    return c
  })
  const setSeg = (i: number, patch: Partial<Segment>) => upd(c => { c.segments[i] = { ...c.segments[i], ...patch }; return c })
  const delSeg = (i: number) => upd(c => { c.segments.splice(i, 1); return c })
  const toggleCible = (i: number, cible: Cible) => upd(c => {
    const set = new Set(c.segments[i].ciblesAutorisees)
    set.has(cible) ? set.delete(cible) : set.add(cible)
    c.segments[i].ciblesAutorisees = [...set] as Cible[]
    return c
  })

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/sync-write", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: "fl_notices", upserts: [{ id: "__loterie_config", payload: cfg, updated_at: new Date().toISOString() }] }),
      })
      const j = await res.json()
      flash(j.ok === true, j.ok ? "✅ Loterie enregistrée." : "Erreur d'enregistrement.")
    } catch { flash(false, "Erreur réseau.") }
    setSaving(false)
  }

  if (loading) return <div className="p-8 text-center text-sm text-muted-foreground">Chargement…</div>
  if (!canEdit) return <div className="p-8 text-center text-sm text-muted-foreground">🔒 Réservé aux responsables.</div>

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-black text-foreground flex items-center gap-2">🎡 Loterie / Roue</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Récompenses, quotas et période. La roue n&apos;apparaît sur la boutique que si « Activée ».</p>
        </div>
        <button onClick={save} disabled={saving} className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50">{saving ? "…" : "💾 Enregistrer"}</button>
      </div>

      {msg && <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-semibold ${msg.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>{msg.text}</div>}

      {/* Activation + seuil */}
      <div className={`rounded-2xl border p-4 mb-5 flex items-center justify-between gap-4 flex-wrap ${cfg.active ? "border-emerald-200 bg-emerald-50/40" : "border-amber-300 bg-amber-50/50"}`}>
        <div>
          <div className="font-bold text-foreground text-sm">{cfg.active ? "🟢 Roue ACTIVÉE sur la boutique" : "⚪ Roue désactivée"}</div>
          <p className="text-xs text-muted-foreground mt-0.5">Palier pour débloquer une réduction :
            <input type="number" value={cfg.seuilCible} onChange={e => upd(c => ({ ...c, seuilCible: Number(e.target.value) || 0 }))}
              className="ml-1 w-24 px-2 py-1 rounded border border-border bg-background text-foreground" /> DH
          </p>
        </div>
        <button onClick={() => upd(c => ({ ...c, active: !c.active }))}
          role="switch" aria-checked={cfg.active}
          className={`relative inline-flex h-7 w-14 shrink-0 items-center rounded-full transition-colors ${cfg.active ? "bg-emerald-500" : "bg-gray-300"}`}>
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${cfg.active ? "translate-x-8" : "translate-x-1"}`} />
        </button>
      </div>

      {/* Segments */}
      <div className="flex items-center justify-between mb-2">
        <p className="font-bold text-foreground text-sm">Récompenses ({cfg.segments.length})</p>
        <button onClick={addSeg} className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold">＋ Récompense</button>
      </div>
      {cfg.segments.length === 0 && <p className="text-xs text-muted-foreground italic mb-3">Aucune récompense. Sinon la roue utilisera automatiquement vos Codes Promo actifs.</p>}

      <div className="flex flex-col gap-3">
        {cfg.segments.map((s, i) => (
          <div key={s.id} className="rounded-2xl border border-border bg-card p-3 grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
            <Field label="Libellé"><input value={s.label} onChange={e => setSeg(i, { label: e.target.value })} className="inp" /></Field>
            <Field label="Type">
              <select value={s.type} onChange={e => setSeg(i, { type: e.target.value })} className="inp">{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </Field>
            <Field label="Montant"><input type="number" value={s.montant} onChange={e => setSeg(i, { montant: Number(e.target.value) || 0 })} className="inp" /></Field>
            <Field label="Code (optionnel)"><input value={s.code ?? ""} onChange={e => setSeg(i, { code: e.target.value })} className="inp" /></Field>
            <Field label="Image (URL)"><input value={s.image ?? ""} onChange={e => setSeg(i, { image: e.target.value })} className="inp" placeholder="https://…" /></Field>
            <Field label="Poids (proba)"><input type="number" value={s.poids} onChange={e => setSeg(i, { poids: Number(e.target.value) || 1 })} className="inp" /></Field>
            <Field label="Max gagnants"><input type="number" value={s.maxGagnants ?? ""} onChange={e => setSeg(i, { maxGagnants: e.target.value === "" ? null : Number(e.target.value) })} className="inp" placeholder="∞" /></Field>
            <Field label="Date fin"><input type="date" value={s.dateFin ?? ""} onChange={e => setSeg(i, { dateFin: e.target.value })} className="inp" /></Field>
            <div className="col-span-2 md:col-span-4 flex items-center justify-between flex-wrap gap-2">
              <div className="flex flex-wrap gap-1.5">
                {CIBLES.map(cb => (
                  <button key={cb} onClick={() => toggleCible(i, cb)}
                    className={`text-[11px] px-2 py-1 rounded-full border ${s.ciblesAutorisees.includes(cb) ? "bg-emerald-100 border-emerald-300 text-emerald-700 font-semibold" : "border-border text-muted-foreground"}`}>{cb}</button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-muted-foreground">Gagnants : {winners[s.id]?.count ?? 0}{s.maxGagnants ? ` / ${s.maxGagnants}` : ""}</span>
                <button onClick={() => delSeg(i)} className="text-xs text-red-500 hover:text-red-700 font-semibold">🗑 Supprimer</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <style>{`.inp{width:100%;padding:6px 8px;border-radius:8px;border:1px solid hsl(var(--border));background:hsl(var(--background));color:hsl(var(--foreground));font-size:13px}`}</style>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1"><span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>{children}</label>
}
