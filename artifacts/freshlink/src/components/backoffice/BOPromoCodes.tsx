"use client"

// Gestion des codes promo de la boutique (table fl_coupons).
// La boutique valide via /api/ext/promo?code=...
import { useState, useEffect, useCallback } from "react"
import { Ticket, Plus, Trash2, RefreshCw, Power } from "lucide-react"

interface Coupon {
  code: string
  type: "pourcentage" | "montant" | "livraison_gratuite" | "article_gratuit"
  valeur: number
  label?: string
  actif: boolean
  expiration?: string
  minCommande?: number
  usageMax?: number
  usageCount?: number
}

const EMPTY: Coupon = { code: "", type: "pourcentage", valeur: 10, label: "", actif: true, expiration: "", minCommande: 0, usageMax: 0, usageCount: 0 }

export default function BOPromoCodes() {
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<Coupon>(EMPTY)
  const [msg, setMsg] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/sync-read?table=fl_coupons", { cache: "no-store" })
      const j = await res.json()
      const rows: { id: string; payload: Coupon }[] = j?.ok ? (j.data ?? []) : []
      setCoupons(rows.filter(r => !String(r.id).startsWith("__")).map(r => ({ ...EMPTY, ...r.payload, code: r.payload?.code ?? r.id })))
    } catch { /* offline */ }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(""), 3500) }

  const save = async () => {
    const code = form.code.trim().toUpperCase()
    if (!code) return flash("Code requis")
    if (!(form.valeur > 0)) return flash("Valeur invalide")
    const payload: Coupon = { ...form, code, usageCount: form.usageCount ?? 0 }
    try {
      const res = await fetch("/api/sync-write", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: "fl_coupons", upserts: [{ id: code, payload, updated_at: new Date().toISOString() }] }),
      })
      const j = await res.json()
      if (!j.ok) return flash("Erreur : " + (j.errors?.join(", ") ?? ""))
      flash(`✅ Code ${code} enregistré`)
      setForm(EMPTY)
      load()
    } catch { flash("Erreur réseau") }
  }

  const toggle = async (c: Coupon) => {
    await fetch("/api/sync-write", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "fl_coupons", upserts: [{ id: c.code, payload: { ...c, actif: !c.actif }, updated_at: new Date().toISOString() }] }),
    })
    load()
  }

  const remove = async (code: string) => {
    if (!confirm(`Supprimer le code ${code} ?`)) return
    await fetch("/api/sync-write", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "fl_coupons", deletes: [code] }),
    })
    load()
  }

  return (
    <div className="flex flex-col gap-4 p-1">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground flex items-center gap-2"><Ticket className="w-4 h-4 text-primary" /> Codes Promo</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Codes utilisables au paiement sur la boutique (shop.vita-core.org).</p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-muted hover:bg-muted/70"><RefreshCw className="w-3.5 h-3.5" /> Actualiser</button>
      </div>

      {msg && <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-2 text-xs font-semibold">{msg}</div>}

      {/* Création */}
      <div className="rounded-xl border border-border bg-card p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-muted-foreground">Code</label>
          <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="BIENVENUE10"
            className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-sm font-mono uppercase" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-muted-foreground">Type</label>
          <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as Coupon["type"] }))}
            className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-sm">
            <option value="pourcentage">% remise</option>
            <option value="montant">Montant (DH)</option>
            <option value="livraison_gratuite">🚚 Livraison gratuite</option>
            <option value="article_gratuit">🎁 Article gratuit (valeur DH)</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-muted-foreground">Valeur</label>
          <input type="number" min={0} value={form.valeur} onChange={e => setForm(f => ({ ...f, valeur: Number(e.target.value) }))}
            className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-sm font-mono" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-muted-foreground">Min. commande (DH)</label>
          <input type="number" min={0} value={form.minCommande} onChange={e => setForm(f => ({ ...f, minCommande: Number(e.target.value) }))}
            className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-sm font-mono" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-muted-foreground">Expiration (optionnel)</label>
          <input type="date" value={form.expiration} onChange={e => setForm(f => ({ ...f, expiration: e.target.value }))}
            className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-muted-foreground">Usages max (0 = illimité)</label>
          <input type="number" min={0} value={form.usageMax} onChange={e => setForm(f => ({ ...f, usageMax: Number(e.target.value) }))}
            className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-sm font-mono" />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label className="text-[11px] text-muted-foreground">Libellé (affiché au client)</label>
          <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Offre de bienvenue"
            className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-sm" />
        </div>
        <div className="sm:col-span-4">
          <button onClick={save} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:opacity-90">
            <Plus className="w-4 h-4" /> Enregistrer le code
          </button>
        </div>
      </div>

      {/* Liste */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading ? <p className="p-6 text-center text-sm text-muted-foreground">Chargement…</p> :
          coupons.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">Aucun code promo. Créez-en un ci-dessus.</p> :
          <div className="divide-y divide-border">
            {coupons.map(c => (
              <div key={c.code} className="flex items-center gap-3 px-4 py-2.5">
                <span className="font-mono font-bold text-sm bg-muted px-2 py-1 rounded">{c.code}</span>
                <span className="text-sm text-foreground">{
                  c.type === "livraison_gratuite" ? "🚚 Livraison gratuite"
                  : c.type === "article_gratuit" ? `🎁 Article offert (−${c.valeur} DH)`
                  : c.type === "montant" ? `−${c.valeur} DH`
                  : `−${c.valeur}%`
                }</span>
                {c.minCommande ? <span className="text-[11px] text-muted-foreground">min {c.minCommande} DH</span> : null}
                {c.expiration ? <span className="text-[11px] text-muted-foreground">exp. {c.expiration}</span> : null}
                {c.usageMax ? <span className="text-[11px] text-muted-foreground">{c.usageCount ?? 0}/{c.usageMax} utilisés</span> : null}
                <span className="flex-1" />
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c.actif ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>{c.actif ? "Actif" : "Inactif"}</span>
                <button onClick={() => toggle(c)} title="Activer/désactiver" className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><Power className="w-4 h-4" /></button>
                <button onClick={() => remove(c.code)} title="Supprimer" className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>}
      </div>
    </div>
  )
}
