"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { store, type User, userHasRole } from "@/lib/store"
import { hasPermission } from "@/lib/permissions"
import { logAction } from "@/lib/auditLog"

// ══════════════════════════════════════════════════════════════════
//  BOMoteurCommercial — Moteur commercial V3 (Section 1, 3, 5)
//   3 onglets autonomes :
//     1. Règles de prix (gratuités/remises)  → /api/ext/pricing-rules
//     2. Matrice bonus (Segment × Famille)    → /api/ext/bonus-matrix
//     3. Simulateurs (RPC SQL serveur)        → /api/ext/commercial
//
//   ⚠️ Tous les calculs réels (gratuités, bonus, pricing) sont faits
//   côté SQL → anti-fraude : les prévendeurs mobiles ne peuvent rien
//   manipuler depuis l'app.
// ══════════════════════════════════════════════════════════════════

interface PricingRule {
  id: string
  nom: string
  type: "gratuite_palier" | "remise_pct" | "remise_montant" | "remise_cascade"
  cible_segment: "chr" | "marchand" | "particulier" | "tous"
  cible_famille: string | null
  cible_article: string | null
  palier_qte: number
  palier_offert: number
  remise_valeur: number
  date_debut: string | null
  date_fin: string | null
  priorite: number
  actif: boolean
  created_at: string
  updated_at: string
}

interface BonusCell {
  id: string
  segment: "chr" | "marchand" | "particulier"
  famille: string
  taux_ca: number
  taux_tonnage: number
  coef_marge: number
  actif: boolean
  updated_at: string
}

const TYPE_CONFIG: Record<PricingRule["type"], { label: string; icon: string; color: string }> = {
  gratuite_palier: { label: "Gratuité palier",  icon: "🎁", color: "from-emerald-500 to-green-600" },
  remise_pct:      { label: "Remise %",         icon: "%",  color: "from-blue-500 to-indigo-600" },
  remise_montant:  { label: "Remise MAD",       icon: "💰", color: "from-amber-500 to-orange-600" },
  remise_cascade:  { label: "Remise cascade",   icon: "🪜", color: "from-purple-500 to-fuchsia-600" },
}

const SEGMENT_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  chr:         { label: "CHR",         icon: "🏨", color: "from-purple-500 to-fuchsia-600" },
  marchand:    { label: "Marchand",    icon: "🏪", color: "from-amber-500 to-orange-600" },
  particulier: { label: "Particulier", icon: "🏠", color: "from-blue-500 to-cyan-600" },
  tous:        { label: "Tous",        icon: "🌐", color: "from-slate-500 to-slate-700" },
}

export default function BOMoteurCommercial({ user }: { user: User }) {
  const [tab, setTab] = useState<"rules" | "matrix" | "simulators">("rules")
  const [rules, setRules] = useState<PricingRule[]>([])
  const [matrix, setMatrix] = useState<BonusCell[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  // ── Articles / familles (pour les listes roulantes — noms, jamais d'ID saisi) ──
  const [articlesRef, setArticlesRef] = useState<{ id: string; nom: string; famille: string }[]>([])
  useEffect(() => {
    try {
      const arts = store.getArticles().map(a => ({ id: a.id, nom: a.nom, famille: a.famille ?? "" }))
      arts.sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
      setArticlesRef(arts)
    } catch { setArticlesRef([]) }
  }, [])
  const famillesRef = useMemo(
    () => [...new Set(articlesRef.map(a => a.famille).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")),
    [articlesRef]
  )
  const nomOfArticle = useCallback(
    (id: string) => articlesRef.find(a => a.id === id)?.nom ?? id,
    [articlesRef]
  )

  // ── Prévendeurs (pour la liste roulante du simulateur de bonus — nom, jamais d'ID saisi) ──
  const [prevendeursRef, setPrevendeursRef] = useState<{ id: string; name: string }[]>([])
  useEffect(() => {
    try {
      const users = store.getUsers()
        .filter(u => userHasRole(u, "prevendeur") && u.actif)
        .map(u => ({ id: u.id, name: u.name }))
      users.sort((a, b) => a.name.localeCompare(b.name, "fr"))
      setPrevendeursRef(users)
    } catch { setPrevendeursRef([]) }
  }, [])

  const [showRuleForm, setShowRuleForm] = useState(false)
  const [ruleForm, setRuleForm] = useState({
    nom: "",
    type: "gratuite_palier" as PricingRule["type"],
    cibleSegment: "tous" as PricingRule["cible_segment"],
    cibleFamille: "",
    cibleArticle: "",
    palierQte: 10,
    palierOffert: 1,
    remiseValeur: 0,
    priorite: 100,
    actif: true,
  })

  const [showMatrixForm, setShowMatrixForm] = useState(false)
  const [matrixForm, setMatrixForm] = useState({
    segment: "chr" as BonusCell["segment"],
    famille: "TOUTES",
    tauxCa: 3.0,
    tauxTonnage: 50,
    coefMarge: 1.0,
    actif: true,
  })

  const [simGratuite, setSimGratuite] = useState({ article: "VFP00001", segment: "chr", qte: 25, result: null as number | null, loading: false })
  const [simBonus,    setSimBonus]    = useState({ prevendeur: "VFU00001", ca: 50000, segment: "chr", famille: "TOUTES", result: null as number | null, loading: false })
  const [simPricing,  setSimPricing]  = useState({ article: "VFP00001", costLog: 0.5, margeCible: 2.0, client: "VFC00001", result: null as number | null, loading: false })
  const [simPa,       setSimPa]       = useState({ article: "VFP00001", result: null as number | null, loading: false })
  const [simCash,     setSimCash]     = useState({ date: new Date().toISOString().slice(0, 10), result: null as number | null, loading: false })

  const loadAll = useCallback(async () => {
    try {
      const [r, m] = await Promise.all([
        fetch("/api/ext/pricing-rules", { cache: "no-store" }),
        fetch("/api/ext/bonus-matrix",  { cache: "no-store" }),
      ])
      const rd = await r.json()
      const md = await m.json()
      if (!rd.ok) throw new Error(rd.error ?? "Erreur règles")
      if (!md.ok) throw new Error(md.error ?? "Erreur matrice")
      setRules(rd.data ?? [])
      setMatrix(md.data ?? [])
      setError("")
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
    const t = setInterval(loadAll, 30000)
    return () => clearInterval(t)
  }, [loadAll])

  const createRule = async () => {
    if (!ruleForm.nom.trim()) { setError("Nom de règle requis"); return }
    setBusy(true)
    try {
      const res = await fetch("/api/ext/pricing-rules", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ruleForm),
      })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error)
      setShowRuleForm(false)
      setRuleForm({
        nom: "", type: "gratuite_palier", cibleSegment: "tous",
        cibleFamille: "", cibleArticle: "",
        palierQte: 10, palierOffert: 1, remiseValeur: 0,
        priorite: 100, actif: true,
      })
      await loadAll()
      setError("")
    } catch (e) { setError(String(e)) }
    finally { setBusy(false) }
  }

  const toggleRule = async (r: PricingRule) => {
    setRules(prev => prev.map(x => x.id === r.id ? { ...x, actif: !x.actif } : x))
    try {
      await fetch("/api/ext/pricing-rules", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: r.id, actif: !r.actif }),
      })
    } catch (e) { setError(String(e)); loadAll() }
  }

  const deleteRule = async (id: string) => {
    if (!hasPermission(user.role, "appliquer_remise")) { logAction(user, "appliquer_remise", "denied", { type: "pricing_rule", id }); return }
    if (!window.confirm("Supprimer cette règle ?")) return
    logAction(user, "appliquer_remise", "success", { type: "pricing_rule", id })
    setRules(prev => prev.filter(x => x.id !== id))
    try { await fetch(`/api/ext/pricing-rules?id=${encodeURIComponent(id)}`, { method: "DELETE" }) }
    catch (e) { setError(String(e)); loadAll() }
  }

  const upsertCell = async () => {
    setBusy(true)
    try {
      const res = await fetch("/api/ext/bonus-matrix", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(matrixForm),
      })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error)
      setShowMatrixForm(false)
      await loadAll()
      setError("")
    } catch (e) { setError(String(e)) }
    finally { setBusy(false) }
  }

  const patchCell = async (id: string, patch: Partial<BonusCell>) => {
    setMatrix(prev => prev.map(x => x.id === id ? { ...x, ...patch } as BonusCell : x))
    try {
      await fetch("/api/ext/bonus-matrix", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          tauxCa:      patch.taux_ca,
          tauxTonnage: patch.taux_tonnage,
          coefMarge:   patch.coef_marge,
          actif:       patch.actif,
        }),
      })
    } catch (e) { setError(String(e)); loadAll() }
  }

  const deleteCell = async (id: string) => {
    if (!hasPermission(user.role, "appliquer_remise")) { logAction(user, "appliquer_remise", "denied", { type: "bonus_matrix_cell", id }); return }
    if (!window.confirm("Supprimer cette cellule de la matrice ?")) return
    logAction(user, "appliquer_remise", "success", { type: "bonus_matrix_cell", id })
    setMatrix(prev => prev.filter(x => x.id !== id))
    try { await fetch(`/api/ext/bonus-matrix?id=${encodeURIComponent(id)}`, { method: "DELETE" }) }
    catch (e) { setError(String(e)); loadAll() }
  }

  const runSim = async (action: string, params: Record<string, unknown>): Promise<unknown> => {
    const res = await fetch("/api/ext/commercial", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...params }),
    })
    const d = await res.json()
    if (!d.ok) throw new Error(d.error)
    return d
  }

  const runSimGratuite = async () => {
    setSimGratuite(s => ({ ...s, loading: true }))
    try {
      const d = await runSim("gratuite", { article: simGratuite.article, segment: simGratuite.segment, qte: simGratuite.qte }) as { qteOfferte?: number }
      setSimGratuite(s => ({ ...s, result: Number(d.qteOfferte ?? 0), loading: false }))
    } catch (e) {
      setError(String(e))
      setSimGratuite(s => ({ ...s, loading: false }))
    }
  }
  const runSimBonus = async () => {
    setSimBonus(s => ({ ...s, loading: true }))
    try {
      const d = await runSim("bonus", { prevendeur: simBonus.prevendeur, ca: simBonus.ca, segment: simBonus.segment, famille: simBonus.famille }) as { bonus?: number }
      setSimBonus(s => ({ ...s, result: Number(d.bonus ?? 0), loading: false }))
    } catch (e) {
      setError(String(e))
      setSimBonus(s => ({ ...s, loading: false }))
    }
  }
  const runSimPricing = async () => {
    setSimPricing(s => ({ ...s, loading: true }))
    try {
      const d = await runSim("pricing", { article: simPricing.article, costLog: simPricing.costLog, margeCible: simPricing.margeCible, client: simPricing.client }) as { prixConseille?: number }
      setSimPricing(s => ({ ...s, result: Number(d.prixConseille ?? 0), loading: false }))
    } catch (e) {
      setError(String(e))
      setSimPricing(s => ({ ...s, loading: false }))
    }
  }
  const runSimPa = async () => {
    setSimPa(s => ({ ...s, loading: true }))
    try {
      const d = await runSim("pa_predit", { article: simPa.article }) as { paPredit?: number }
      setSimPa(s => ({ ...s, result: Number(d.paPredit ?? 0), loading: false }))
    } catch (e) {
      setError(String(e))
      setSimPa(s => ({ ...s, loading: false }))
    }
  }
  const runSimCash = async () => {
    setSimCash(s => ({ ...s, loading: true }))
    try {
      const d = await runSim("cash", { date: simCash.date }) as { cashTerrain?: number }
      setSimCash(s => ({ ...s, result: Number(d.cashTerrain ?? 0), loading: false }))
    } catch (e) {
      setError(String(e))
      setSimCash(s => ({ ...s, loading: false }))
    }
  }

  const fmtMad = (n: number | null) => n == null ? "—" : `${n.toLocaleString("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD`

  return (
    <div className="flex flex-col gap-5">
      {/* Header premium */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0b3d1a] via-[#1a4f2a] to-[#2d7a46] p-6 sm:p-7 shadow-xl">
        <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-amber-400/15 blur-2xl" />
        <div className="absolute -left-8 -bottom-12 w-40 h-40 rounded-full bg-emerald-400/10 blur-2xl" />
        <div className="relative flex items-start justify-between flex-wrap gap-5">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/12 backdrop-blur-sm flex items-center justify-center text-3xl shadow-lg shrink-0">💼</div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-2xl font-black text-white tracking-tight">Moteur Commercial</h2>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-400/15 border border-emerald-300/30 text-emerald-100 text-[10px] font-bold uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                  Calculs serveur · anti-fraude
                </span>
              </div>
              <p className="text-sm text-emerald-50/85 mt-1.5 max-w-2xl leading-relaxed">
                Gratuités, remises, matrice bonus et simulateurs. Tous les calculs sont faits côté SQL : impossibles à manipuler depuis le mobile prévendeur.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 p-1.5 rounded-2xl bg-slate-100 w-fit overflow-x-auto border border-slate-200/70">
        {([
          { id: "rules"      as const, label: "Règles de prix",  icon: "📜", count: rules.length },
          { id: "matrix"     as const, label: "Matrice bonus",   icon: "⚖️", count: matrix.length },
          { id: "simulators" as const, label: "Simulateurs",     icon: "🧮", count: null as number | null },
        ]).map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${tab === t.id ? "bg-white text-slate-900 shadow-md ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800 hover:bg-white/50"}`}>
            <span className="text-sm">{t.icon}</span>{t.label}
            {t.count != null && (
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full tabular-nums ${tab === t.id ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">⚠️ {error}</div>
      )}

      {loading && (
        <div className="text-center py-10 text-slate-500 text-sm">
          <span className="inline-block w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin align-middle mr-2" />
          Chargement…
        </div>
      )}

      {/* ── TAB RULES ── */}
      {!loading && tab === "rules" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">{rules.length} règle{rules.length > 1 ? "s" : ""} · {rules.filter(r => r.actif).length} active{rules.filter(r => r.actif).length > 1 ? "s" : ""}</p>
            <button
              type="button"
              onClick={() => { setShowRuleForm(true); setShowMatrixForm(false) }}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white text-xs font-bold hover:shadow-lg hover:shadow-emerald-200 transition-all">
              ➕ Nouvelle règle
            </button>
          </div>

          {showRuleForm && (
            <div className="bg-white border-2 border-emerald-200 rounded-2xl p-5 shadow-sm">
              <h3 className="text-sm font-black text-slate-900 mb-4">📜 Nouvelle règle de prix</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <label className="text-[11px] font-bold text-slate-700">Nom interne</label>
                  <input
                    value={ruleForm.nom}
                    onChange={e => setRuleForm(f => ({ ...f, nom: e.target.value }))}
                    placeholder="10 caisses bananes achetées = 1 offerte"
                    className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-slate-700">Type</label>
                  <select
                    value={ruleForm.type}
                    onChange={e => setRuleForm(f => ({ ...f, type: e.target.value as PricingRule["type"] }))}
                    className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
                    {Object.entries(TYPE_CONFIG).map(([k, v]) => (
                      <option key={k} value={k}>{v.icon} {v.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-slate-700">Segment cible</label>
                  <select
                    value={ruleForm.cibleSegment}
                    onChange={e => setRuleForm(f => ({ ...f, cibleSegment: e.target.value as PricingRule["cible_segment"] }))}
                    className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
                    {Object.entries(SEGMENT_CONFIG).map(([k, v]) => (
                      <option key={k} value={k}>{v.icon} {v.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-slate-700">Famille (optionnel)</label>
                  <select
                    value={ruleForm.cibleFamille}
                    onChange={e => setRuleForm(f => ({ ...f, cibleFamille: e.target.value }))}
                    className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
                    <option value="">— Toutes les familles —</option>
                    {famillesRef.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-slate-700">Produit (optionnel)</label>
                  <select
                    value={ruleForm.cibleArticle}
                    onChange={e => setRuleForm(f => ({ ...f, cibleArticle: e.target.value }))}
                    className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
                    <option value="">— Tous les produits —</option>
                    {articlesRef
                      .filter(a => !ruleForm.cibleFamille || a.famille === ruleForm.cibleFamille)
                      .map(a => <option key={a.id} value={a.id}>{a.nom}</option>)}
                  </select>
                </div>

                {ruleForm.type === "gratuite_palier" && (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold text-slate-700">Palier qté (achetée)</label>
                      <input
                        type="number" min={1}
                        value={ruleForm.palierQte}
                        onChange={e => setRuleForm(f => ({ ...f, palierQte: Number(e.target.value) || 0 }))}
                        className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold text-slate-700">Qté offerte par palier</label>
                      <input
                        type="number" min={1}
                        value={ruleForm.palierOffert}
                        onChange={e => setRuleForm(f => ({ ...f, palierOffert: Number(e.target.value) || 0 }))}
                        className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                    </div>
                  </>
                )}
                {(ruleForm.type === "remise_pct" || ruleForm.type === "remise_montant" || ruleForm.type === "remise_cascade") && (
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-slate-700">
                      {ruleForm.type === "remise_pct" ? "Remise (%)" : "Remise (MAD)"}
                    </label>
                    <input
                      type="number" min={0} step="0.01"
                      value={ruleForm.remiseValeur}
                      onChange={e => setRuleForm(f => ({ ...f, remiseValeur: Number(e.target.value) || 0 }))}
                      className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-slate-700">Priorité (plus bas = appliqué en premier)</label>
                  <input
                    type="number"
                    value={ruleForm.priorite}
                    onChange={e => setRuleForm(f => ({ ...f, priorite: Number(e.target.value) || 100 }))}
                    className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  type="button"
                  onClick={createRule}
                  disabled={busy}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white text-sm font-bold hover:shadow-lg hover:shadow-emerald-200 transition-all disabled:opacity-60">
                  {busy ? "⏳ Création…" : "✅ Créer la règle"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowRuleForm(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-bold hover:bg-slate-50">
                  Annuler
                </button>
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            {rules.length === 0 ? (
              <div className="text-center py-12 px-6">
                <div className="text-5xl mb-3">📜</div>
                <p className="text-sm font-bold text-slate-700">Aucune règle configurée</p>
                <p className="text-xs text-slate-500 mt-1">Clique sur « Nouvelle règle » pour démarrer.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {rules.map(r => {
                  const tcfg = TYPE_CONFIG[r.type] ?? TYPE_CONFIG.remise_pct
                  const scfg = SEGMENT_CONFIG[r.cible_segment] ?? SEGMENT_CONFIG.tous
                  return (
                    <div key={r.id} className={`px-4 py-3.5 transition-colors ${r.actif ? "" : "opacity-50"}`}>
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${tcfg.color} flex items-center justify-center text-base font-black text-white shadow-sm shrink-0`}>
                          <span className="drop-shadow-sm">{tcfg.icon}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-bold text-slate-900">{r.nom}</p>
                            <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600">{tcfg.label}</span>
                            <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600">{scfg.icon} {scfg.label}</span>
                          </div>
                          <div className="flex items-center gap-3 flex-wrap mt-1 text-[11px] text-slate-500">
                            {r.type === "gratuite_palier" && <span>🎁 <strong>{r.palier_qte} achetés = {r.palier_offert} offert(s)</strong></span>}
                            {r.type === "remise_pct"     && <span>📉 <strong>-{r.remise_valeur}%</strong></span>}
                            {r.type === "remise_montant" && <span>💰 <strong>-{r.remise_valeur} MAD</strong></span>}
                            {r.type === "remise_cascade" && <span>🪜 <strong>-{r.remise_valeur}% cascade</strong></span>}
                            {r.cible_famille && <span>· famille {r.cible_famille}</span>}
                            {r.cible_article && <span>· produit {nomOfArticle(r.cible_article)}</span>}
                            <span>· priorité {r.priorite}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => toggleRule(r)}
                            aria-label={r.actif ? "Désactiver" : "Activer"}
                            className={`relative w-12 h-7 rounded-full transition-colors ${r.actif ? "bg-emerald-500" : "bg-slate-300"}`}>
                            <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${r.actif ? "translate-x-5" : "translate-x-0"}`} />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteRule(r.id)}
                            aria-label="Supprimer"
                            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 transition-colors flex items-center justify-center text-sm">
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB MATRIX ── */}
      {!loading && tab === "matrix" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Bonus calculés côté SQL avec garde-fou plafond <code className="text-[10px] font-mono bg-slate-100 px-1.5 py-0.5 rounded">fl_config_globale.plafonds.bonus_plafond_pct</code>
            </p>
            <button
              type="button"
              onClick={() => { setShowMatrixForm(true); setShowRuleForm(false) }}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white text-xs font-bold hover:shadow-lg hover:shadow-emerald-200 transition-all">
              ➕ Cellule (Segment × Famille)
            </button>
          </div>

          {showMatrixForm && (
            <div className="bg-white border-2 border-emerald-200 rounded-2xl p-5 shadow-sm">
              <h3 className="text-sm font-black text-slate-900 mb-4">⚖️ Nouvelle cellule de matrice</h3>
              <p className="text-[11px] text-slate-500 mb-3">Si (segment, famille) existe déjà, la cellule sera mise à jour.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-slate-700">Segment</label>
                  <select
                    value={matrixForm.segment}
                    onChange={e => setMatrixForm(f => ({ ...f, segment: e.target.value as BonusCell["segment"] }))}
                    className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
                    <option value="chr">🏨 CHR</option>
                    <option value="marchand">🏪 Marchand</option>
                    <option value="particulier">🏠 Particulier</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-slate-700">Famille produit</label>
                  <select
                    value={matrixForm.famille}
                    onChange={e => setMatrixForm(f => ({ ...f, famille: e.target.value }))}
                    className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
                    <option value="TOUTES">TOUTES</option>
                    {famillesRef.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-slate-700">Taux CA (%)</label>
                  <input
                    type="number" step="0.1" min={0}
                    value={matrixForm.tauxCa}
                    onChange={e => setMatrixForm(f => ({ ...f, tauxCa: Number(e.target.value) || 0 }))}
                    className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-slate-700">Taux tonnage (MAD/tonne)</label>
                  <input
                    type="number" min={0}
                    value={matrixForm.tauxTonnage}
                    onChange={e => setMatrixForm(f => ({ ...f, tauxTonnage: Number(e.target.value) || 0 }))}
                    className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-slate-700">Coefficient marge</label>
                  <input
                    type="number" step="0.01" min={0}
                    value={matrixForm.coefMarge}
                    onChange={e => setMatrixForm(f => ({ ...f, coefMarge: Number(e.target.value) || 0 }))}
                    className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  type="button"
                  onClick={upsertCell}
                  disabled={busy}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white text-sm font-bold hover:shadow-lg hover:shadow-emerald-200 transition-all disabled:opacity-60">
                  {busy ? "⏳ Enregistrement…" : "✅ Enregistrer la cellule"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowMatrixForm(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-bold hover:bg-slate-50">
                  Annuler
                </button>
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-x-auto">
            {matrix.length === 0 ? (
              <div className="text-center py-12 px-6">
                <div className="text-5xl mb-3">⚖️</div>
                <p className="text-sm font-bold text-slate-700">Matrice vide</p>
                <p className="text-xs text-slate-500 mt-1">Les seeds V3 créent 3 cellules par défaut (CHR/Marchand/Particulier × TOUTES).</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-600">
                    <th className="text-left px-4 py-2.5 font-bold text-[11px] uppercase tracking-wider">Segment</th>
                    <th className="text-left px-4 py-2.5 font-bold text-[11px] uppercase tracking-wider">Famille</th>
                    <th className="text-right px-3 py-2.5 font-bold text-[11px] uppercase tracking-wider">Taux CA (%)</th>
                    <th className="text-right px-3 py-2.5 font-bold text-[11px] uppercase tracking-wider">Tonnage (MAD/t)</th>
                    <th className="text-right px-3 py-2.5 font-bold text-[11px] uppercase tracking-wider">Coef marge</th>
                    <th className="text-center px-3 py-2.5 font-bold text-[11px] uppercase tracking-wider">Actif</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {matrix.map(c => {
                    const scfg = SEGMENT_CONFIG[c.segment] ?? SEGMENT_CONFIG.tous
                    return (
                      <tr key={c.id} className={`${c.actif ? "" : "opacity-50"} hover:bg-slate-50/60`}>
                        <td className="px-4 py-2.5">
                          <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-bold bg-gradient-to-r ${scfg.color} text-white`}>
                            {scfg.icon} {scfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-700 font-mono text-xs">{c.famille}</td>
                        <td className="px-3 py-2.5 text-right">
                          <input
                            type="number" step="0.1" min={0}
                            value={c.taux_ca}
                            onChange={e => setMatrix(prev => prev.map(x => x.id === c.id ? { ...x, taux_ca: Number(e.target.value) || 0 } : x))}
                            onBlur={() => patchCell(c.id, { taux_ca: c.taux_ca })}
                            className="w-20 text-right px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <input
                            type="number" min={0}
                            value={c.taux_tonnage}
                            onChange={e => setMatrix(prev => prev.map(x => x.id === c.id ? { ...x, taux_tonnage: Number(e.target.value) || 0 } : x))}
                            onBlur={() => patchCell(c.id, { taux_tonnage: c.taux_tonnage })}
                            className="w-20 text-right px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <input
                            type="number" step="0.01" min={0}
                            value={c.coef_marge}
                            onChange={e => setMatrix(prev => prev.map(x => x.id === c.id ? { ...x, coef_marge: Number(e.target.value) || 0 } : x))}
                            onBlur={() => patchCell(c.id, { coef_marge: c.coef_marge })}
                            className="w-20 text-right px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => patchCell(c.id, { actif: !c.actif })}
                            aria-label={c.actif ? "Désactiver" : "Activer"}
                            className={`relative w-10 h-6 rounded-full transition-colors ${c.actif ? "bg-emerald-500" : "bg-slate-300"}`}>
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${c.actif ? "translate-x-4" : "translate-x-0"}`} />
                          </button>
                        </td>
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => deleteCell(c.id)}
                            aria-label="Supprimer"
                            className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 flex items-center justify-center text-xs">
                            🗑️
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── TAB SIMULATORS ── */}
      {!loading && tab === "simulators" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Gratuité */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 bg-gradient-to-r from-emerald-500 to-green-600 text-white">
              <p className="text-xs font-bold uppercase tracking-wider opacity-90">Simulateur</p>
              <h3 className="text-lg font-black mt-1">🎁 Calcul gratuité (paliers)</h3>
              <p className="text-[11px] opacity-85 mt-1">Pour un article + segment + qté achetée → qté offerte selon les règles actives.</p>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <select value={simGratuite.article} onChange={e => setSimGratuite(s => ({ ...s, article: e.target.value }))} className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
                  <option value="">— Produit —</option>
                  {articlesRef.map(a => <option key={a.id} value={a.id}>{a.nom}</option>)}
                </select>
                <select value={simGratuite.segment} onChange={e => setSimGratuite(s => ({ ...s, segment: e.target.value }))} className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
                  <option value="chr">🏨 CHR</option>
                  <option value="marchand">🏪 Marchand</option>
                  <option value="particulier">🏠 Particulier</option>
                  <option value="tous">🌐 Tous</option>
                </select>
                <input type="number" min={0} value={simGratuite.qte} onChange={e => setSimGratuite(s => ({ ...s, qte: Number(e.target.value) || 0 }))} placeholder="Qté" className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
              <button type="button" onClick={runSimGratuite} disabled={simGratuite.loading} className="w-full px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-60">
                {simGratuite.loading ? "⏳ Calcul…" : "🧮 Calculer"}
              </button>
              {simGratuite.result != null && (
                <div className="px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200">
                  <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Résultat SQL</p>
                  <p className="text-2xl font-black text-emerald-800 mt-1 tabular-nums">{simGratuite.result} offert{simGratuite.result > 1 ? "s" : ""}</p>
                </div>
              )}
            </div>
          </div>

          {/* Bonus */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 bg-gradient-to-r from-amber-500 to-orange-600 text-white">
              <p className="text-xs font-bold uppercase tracking-wider opacity-90">Simulateur</p>
              <h3 className="text-lg font-black mt-1">💼 Bonus prévendeur (avec plafond)</h3>
              <p className="text-[11px] opacity-85 mt-1">Bonus calculé selon la matrice + plafonné par <code>fl_config_globale</code>.</p>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <select value={simBonus.prevendeur} onChange={e => setSimBonus(s => ({ ...s, prevendeur: e.target.value }))} className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
                  <option value="">— Prévendeur —</option>
                  {prevendeursRef.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <input type="number" min={0} value={simBonus.ca} onChange={e => setSimBonus(s => ({ ...s, ca: Number(e.target.value) || 0 }))} placeholder="CA (MAD)" className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-400" />
                <select value={simBonus.segment} onChange={e => setSimBonus(s => ({ ...s, segment: e.target.value }))} className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
                  <option value="chr">🏨 CHR</option>
                  <option value="marchand">🏪 Marchand</option>
                  <option value="particulier">🏠 Particulier</option>
                </select>
                <select value={simBonus.famille} onChange={e => setSimBonus(s => ({ ...s, famille: e.target.value }))} className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
                  <option value="TOUTES">TOUTES</option>
                  {famillesRef.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <button type="button" onClick={runSimBonus} disabled={simBonus.loading} className="w-full px-4 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-bold hover:bg-amber-700 disabled:opacity-60">
                {simBonus.loading ? "⏳ Calcul…" : "🧮 Calculer"}
              </button>
              {simBonus.result != null && (
                <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
                  <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">Bonus calculé (plafonné)</p>
                  <p className="text-2xl font-black text-amber-800 mt-1 tabular-nums">{fmtMad(simBonus.result)}</p>
                </div>
              )}
            </div>
          </div>

          {/* Pricing dynamique */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 bg-gradient-to-r from-blue-500 to-indigo-600 text-white">
              <p className="text-xs font-bold uppercase tracking-wider opacity-90">Simulateur</p>
              <h3 className="text-lg font-black mt-1">💎 Pricing dynamique (PV conseillé)</h3>
              <p className="text-[11px] opacity-85 mt-1"><code>PV = PA prédit + Cost log + Marge cible + Risk crédit client</code></p>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <select value={simPricing.article} onChange={e => setSimPricing(s => ({ ...s, article: e.target.value }))} className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                  <option value="">— Produit —</option>
                  {articlesRef.map(a => <option key={a.id} value={a.id}>{a.nom}</option>)}
                </select>
                <input value={simPricing.client} onChange={e => setSimPricing(s => ({ ...s, client: e.target.value }))} placeholder="VFC00001" className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400" />
                <input type="number" min={0} step="0.01" value={simPricing.costLog} onChange={e => setSimPricing(s => ({ ...s, costLog: Number(e.target.value) || 0 }))} placeholder="Cost log" className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-400" />
                <input type="number" min={0} step="0.01" value={simPricing.margeCible} onChange={e => setSimPricing(s => ({ ...s, margeCible: Number(e.target.value) || 0 }))} placeholder="Marge cible" className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <button type="button" onClick={runSimPricing} disabled={simPricing.loading} className="w-full px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-60">
                {simPricing.loading ? "⏳ Calcul…" : "🧮 Calculer"}
              </button>
              {simPricing.result != null && (
                <div className="px-4 py-3 rounded-xl bg-blue-50 border border-blue-200">
                  <p className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">PV conseillé</p>
                  <p className="text-2xl font-black text-blue-800 mt-1 tabular-nums">{fmtMad(simPricing.result)}</p>
                </div>
              )}
            </div>
          </div>

          {/* PA prédit */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white">
              <p className="text-xs font-bold uppercase tracking-wider opacity-90">Simulateur</p>
              <h3 className="text-lg font-black mt-1">🔮 PA prédit</h3>
              <p className="text-[11px] opacity-85 mt-1">Prix d'achat estimé selon l'historique <code>fl_pa_historique</code>.</p>
            </div>
            <div className="p-4 space-y-3">
              <select value={simPa.article} onChange={e => setSimPa(s => ({ ...s, article: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-400">
                <option value="">— Produit —</option>
                {articlesRef.map(a => <option key={a.id} value={a.id}>{a.nom}</option>)}
              </select>
              <button type="button" onClick={runSimPa} disabled={simPa.loading} className="w-full px-4 py-2.5 rounded-xl bg-fuchsia-600 text-white text-sm font-bold hover:bg-fuchsia-700 disabled:opacity-60">
                {simPa.loading ? "⏳ Calcul…" : "🧮 Calculer"}
              </button>
              {simPa.result != null && (
                <div className="px-4 py-3 rounded-xl bg-fuchsia-50 border border-fuchsia-200">
                  <p className="text-[11px] font-bold text-fuchsia-700 uppercase tracking-wider">PA prédit</p>
                  <p className="text-2xl font-black text-fuchsia-800 mt-1 tabular-nums">{fmtMad(simPa.result)}</p>
                </div>
              )}
            </div>
          </div>

          {/* Cash terrain */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden lg:col-span-2">
            <div className="p-4 bg-gradient-to-r from-slate-700 to-slate-900 text-white">
              <p className="text-xs font-bold uppercase tracking-wider opacity-90">Simulateur</p>
              <h3 className="text-lg font-black mt-1">💵 Cash à emporter (Marché de Gros)</h3>
              <p className="text-[11px] opacity-85 mt-1">Somme des PO du jour pour les fournisseurs « cash sur place ».</p>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={simCash.date} onChange={e => setSimCash(s => ({ ...s, date: e.target.value }))} className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
                <button type="button" onClick={runSimCash} disabled={simCash.loading} className="px-4 py-2.5 rounded-xl bg-slate-800 text-white text-sm font-bold hover:bg-slate-900 disabled:opacity-60">
                  {simCash.loading ? "⏳ Calcul…" : "🧮 Calculer cash"}
                </button>
              </div>
              {simCash.result != null && (
                <div className="px-4 py-3 rounded-xl bg-slate-50 border border-slate-300">
                  <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Cash à emporter</p>
                  <p className="text-3xl font-black text-slate-900 mt-1 tabular-nums">{fmtMad(simCash.result)}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <p className="text-[10px] text-slate-400 text-center">
        🔒 Tous les calculs (gratuités, bonus, pricing, cash) sont exécutés côté SQL via les fonctions PL/pgSQL — impossibles à manipuler depuis le mobile.
      </p>
    </div>
  )
}
