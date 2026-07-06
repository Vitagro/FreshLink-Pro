"use client"

import { useEffect, useState, useCallback } from "react"

// ══════════════════════════════════════════════════════════════════
//  BOGifts — Centre Cadeaux Incentives (Section 1.1)
//   Branché sur /api/ext/gifts (fl_gift_materials + fl_gift_attributions)
//   Le trigger SQL fl_notify_gift décrémente le stock et notifie Direction
// ══════════════════════════════════════════════════════════════════

interface Material {
  id: string
  nom: string
  segment: "chr" | "marchand" | "particulier" | "tous"
  description: string | null
  photo: string | null
  stock_qte: number
  cout_unitaire: number
  seuil_type: "volume_kg" | "montant_mad" | "contrat" | null
  seuil_valeur: number
  actif: boolean
  created_at: string
  updated_at: string
}

interface Attribution {
  id: string
  client_id: string
  material_id: string
  segment: string | null
  declenche_par: string | null
  statut: "a_livrer" | "livre" | "annule"
  attribue_le: string
  livre_le: string | null
  material_nom: string | null
  material_segment: string | null
}

const SEGMENT_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  chr:         { label: "CHR (Café/Hôtel/Resto)", icon: "🏨", color: "from-purple-500 to-fuchsia-600" },
  marchand:    { label: "Marchand",               icon: "🏪", color: "from-amber-500 to-orange-600" },
  particulier: { label: "Particulier",            icon: "🏠", color: "from-blue-500 to-cyan-600" },
  tous:        { label: "Tous segments",          icon: "🌐", color: "from-slate-500 to-slate-700" },
}

const STATUT_CONFIG: Record<Attribution["statut"], { label: string; icon: string; cls: string }> = {
  a_livrer: { label: "À livrer", icon: "📦", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  livre:    { label: "Livré",    icon: "✅", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  annule:   { label: "Annulé",   icon: "🚫", cls: "bg-rose-100 text-rose-700 border-rose-300" },
}

const SEUIL_TYPE_LABEL: Record<string, string> = {
  volume_kg:   "Volume (kg)",
  montant_mad: "Montant (MAD)",
  contrat:     "Contrat signé",
}

export default function BOGifts() {
  const [tab, setTab] = useState<"attributions" | "catalogue">("attributions")
  const [materials, setMaterials] = useState<Material[]>([])
  const [attributions, setAttributions] = useState<Attribution[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [showAttribForm, setShowAttribForm] = useState(false)
  const [showMatForm, setShowMatForm] = useState(false)
  const [busy, setBusy] = useState(false)

  // Formulaire attribution
  const [attribForm, setAttribForm] = useState({
    clientId: "",
    materialId: "",
    declenchePar: "manuel_bo",
  })

  // Formulaire matériel
  const [matForm, setMatForm] = useState({
    nom: "",
    segment: "marchand" as Material["segment"],
    description: "",
    seuilType: "volume_kg" as NonNullable<Material["seuil_type"]>,
    seuilValeur: 0,
    stockQte: 0,
    coutUnitaire: 0,
  })

  // Filtres
  const [filterStatut, setFilterStatut] = useState<"tous" | Attribution["statut"]>("tous")
  const [filterSegment, setFilterSegment] = useState<"tous" | Material["segment"]>("tous")

  const load = useCallback(async () => {
    try {
      const [matRes, attRes] = await Promise.all([
        fetch("/api/ext/gifts?scope=materials",    { cache: "no-store" }),
        fetch("/api/ext/gifts?scope=attributions", { cache: "no-store" }),
      ])
      const matData = await matRes.json()
      const attData = await attRes.json()
      if (!matData.ok) throw new Error(matData.error ?? "Erreur matériels")
      if (!attData.ok) throw new Error(attData.error ?? "Erreur attributions")
      setMaterials(matData.data ?? [])
      setAttributions(attData.data ?? [])
      setError("")
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  // Polling 15s pour rester sync (les triggers SQL peuvent attribuer auto)
  useEffect(() => {
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [load])

  const attribuer = async () => {
    if (!attribForm.clientId.trim()) { setError("ID client requis"); return }
    if (!attribForm.materialId)      { setError("Choisis un matériel"); return }
    setBusy(true)
    try {
      const res = await fetch("/api/ext/gifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "attribution", ...attribForm }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? "Erreur attribution")
      setShowAttribForm(false)
      setAttribForm({ clientId: "", materialId: "", declenchePar: "manuel_bo" })
      await load()
      setError("")
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  const creerMateriel = async () => {
    if (!matForm.nom.trim()) { setError("Nom du matériel requis"); return }
    setBusy(true)
    try {
      const res = await fetch("/api/ext/gifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "material", ...matForm }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? "Erreur création matériel")
      setShowMatForm(false)
      setMatForm({ nom: "", segment: "marchand", description: "", seuilType: "volume_kg", seuilValeur: 0, stockQte: 0, coutUnitaire: 0 })
      await load()
      setError("")
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  // 📦 Crée la liste de cadeaux par défaut (7 matériels)
  const seedDefaults = async () => {
    if (!window.confirm("Créer la liste de cadeaux par défaut (Balance, Pack couteaux, Caisses, Vitrine, Tabliers, Étal, Bon fidélité) ?")) return
    setBusy(true)
    try {
      const res = await fetch("/api/ext/gifts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "seed_defaults" }),
      })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error)
      await load()
      setError("")
      window.alert(d.message ?? "Catalogue créé. Pensez à mettre le stock réel via +/-.")
    } catch (e) { setError(String(e)) }
    finally { setBusy(false) }
  }

  // 🤖 Lance l'algorithme d'attribution automatique
  const runAutoScan = async () => {
    if (!window.confirm("Lancer l'attribution automatique des cadeaux selon les seuils atteints par les clients (volume / CA / contrat) ?")) return
    setBusy(true)
    try {
      const res = await fetch("/api/ext/gifts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "auto_scan" }),
      })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error)
      await load()
      setError("")
      window.alert(d.message ?? `${d.attribues ?? 0} cadeaux attribués.`)
    } catch (e) { setError(String(e)) }
    finally { setBusy(false) }
  }

  const patchAttribution = async (id: string, statut: Attribution["statut"]) => {
    setAttributions(prev => prev.map(x => x.id === id ? { ...x, statut, livre_le: statut === "livre" ? new Date().toISOString() : x.livre_le } : x))
    try {
      await fetch("/api/ext/gifts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, statut }),
      })
    } catch { load() }
  }

  const supprimerAttribution = async (id: string) => {
    if (!window.confirm("Supprimer cette attribution ?")) return
    setAttributions(prev => prev.filter(x => x.id !== id))
    try {
      await fetch(`/api/ext/gifts?scope=attribution&id=${encodeURIComponent(id)}`, { method: "DELETE" })
    } catch { load() }
  }

  const supprimerMateriel = async (id: string) => {
    if (!window.confirm("Supprimer ce matériel ? Les attributions existantes resteront mais sans nom joint.")) return
    setMaterials(prev => prev.filter(x => x.id !== id))
    try {
      await fetch(`/api/ext/gifts?scope=material&id=${encodeURIComponent(id)}`, { method: "DELETE" })
    } catch { load() }
  }

  const adjustStock = async (m: Material, delta: number) => {
    const newQte = Math.max(0, m.stock_qte + delta)
    setMaterials(prev => prev.map(x => x.id === m.id ? { ...x, stock_qte: newQte } : x))
    try {
      await fetch("/api/ext/gifts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: m.id, scope: "material", stockQte: newQte }),
      })
    } catch { load() }
  }

  // KPIs
  const totalAttrib = attributions.length
  const aLivrer     = attributions.filter(a => a.statut === "a_livrer").length
  const livre       = attributions.filter(a => a.statut === "livre").length
  const valeurStock = materials.reduce((s, m) => s + m.stock_qte * m.cout_unitaire, 0)

  // Listes filtrées
  const matFiltered = materials.filter(m => filterSegment === "tous" || m.segment === filterSegment)
  const attFiltered = attributions.filter(a => filterStatut === "tous" || a.statut === filterStatut)

  const fmtDate = (iso: string | null) => {
    if (!iso) return "—"
    try { return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) }
    catch { return iso }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── Header premium ── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0b3d1a] via-[#1a4f2a] to-[#2d7a46] p-6 sm:p-7 shadow-xl">
        <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-amber-400/15 blur-2xl" />
        <div className="absolute -left-8 -bottom-12 w-40 h-40 rounded-full bg-emerald-400/10 blur-2xl" />
        <div className="relative flex items-start justify-between flex-wrap gap-5">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/12 backdrop-blur-sm flex items-center justify-center text-3xl shadow-lg shrink-0">🎁</div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-2xl font-black text-white tracking-tight">Centre Cadeaux Incentives</h2>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-400/15 border border-emerald-300/30 text-emerald-100 text-[10px] font-bold uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                  Sync live
                </span>
              </div>
              <p className="text-sm text-emerald-50/85 mt-1.5 max-w-xl leading-relaxed">
                Matériel pro de fidélisation : Balance Numérique (Marchands), Pack Couteaux Chef (CHR). Inventaire + attribution + notification direction automatique.
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => { setShowAttribForm(true); setShowMatForm(false) }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-400/90 hover:bg-amber-300 text-[#0b3d1a] text-xs font-black transition-all shadow-sm">
              🎁 Attribuer un cadeau
            </button>
            <button
              type="button"
              onClick={() => { setShowMatForm(true); setShowAttribForm(false) }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/12 backdrop-blur-sm border border-white/20 text-white text-xs font-bold hover:bg-white/20 transition-all">
              ➕ Nouveau matériel
            </button>
            <button
              type="button"
              onClick={seedDefaults}
              disabled={busy}
              title="Crée la liste de cadeaux par défaut (Balance, Pack couteaux, Caisses, Vitrine...)"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/12 backdrop-blur-sm border border-white/20 text-white text-xs font-bold hover:bg-white/20 transition-all">
              📦 Liste par défaut
            </button>
            <button
              type="button"
              onClick={runAutoScan}
              disabled={busy}
              title="Attribue automatiquement les cadeaux aux clients ayant atteint un seuil (volume/CA/contrat)"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-400/90 hover:bg-emerald-300 text-[#0b3d1a] text-xs font-black transition-all shadow-sm">
              🤖 Attribution auto
            </button>
          </div>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total attributions", value: totalAttrib,                icon: "📋", grad: "from-blue-500 to-blue-600",     ring: "ring-blue-200" },
          { label: "À livrer",           value: aLivrer,                    icon: "📦", grad: "from-amber-500 to-orange-600",  ring: "ring-amber-200" },
          { label: "Livrés",             value: livre,                      icon: "✅", grad: "from-emerald-500 to-green-600",  ring: "ring-emerald-200" },
          { label: "Valeur stock (MAD)", value: valeurStock.toLocaleString("fr-MA", { maximumFractionDigits: 0 }), icon: "💰", grad: "from-fuchsia-500 to-purple-600", ring: "ring-fuchsia-200" },
        ].map(s => (
          <div key={s.label} className={`group relative overflow-hidden rounded-2xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 ring-1 ${s.ring}`}>
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${s.grad}`} />
            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${s.grad} flex items-center justify-center text-xl shadow-sm shrink-0`}>
                <span className="drop-shadow-sm">{s.icon}</span>
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-black text-slate-900 leading-none tabular-nums">{s.value}</p>
                <p className="text-[11px] font-bold text-slate-600 mt-1">{s.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Erreur ── */}
      {error && (
        <div className="px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">
          ⚠️ {error}
        </div>
      )}

      {/* ── Formulaire Attribution ── */}
      {showAttribForm && (
        <div className="bg-white border-2 border-amber-200 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-black text-slate-900 mb-4">🎁 Attribuer un cadeau à un client</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-slate-700">ID Client (ex: VFC00012)</label>
              <input
                value={attribForm.clientId}
                onChange={e => setAttribForm(f => ({ ...f, clientId: e.target.value.trim() }))}
                placeholder="VFC00012"
                className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label className="text-[11px] font-bold text-slate-700">Matériel</label>
              <select
                value={attribForm.materialId}
                onChange={e => setAttribForm(f => ({ ...f, materialId: e.target.value }))}
                className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
                <option value="">— Choisir un matériel en stock —</option>
                {materials.filter(m => m.actif && m.stock_qte > 0).map(m => {
                  const cfg = SEGMENT_CONFIG[m.segment] ?? SEGMENT_CONFIG.tous
                  return (
                    <option key={m.id} value={m.id}>
                      {cfg.icon} {m.nom} — {cfg.label} — stock {m.stock_qte}
                    </option>
                  )
                })}
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              type="button"
              onClick={attribuer}
              disabled={busy}
              className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-bold hover:shadow-lg hover:shadow-amber-200 transition-all disabled:opacity-60">
              {busy ? "⏳ Attribution…" : "🎁 Attribuer (décrément stock + notif direction)"}
            </button>
            <button
              type="button"
              onClick={() => setShowAttribForm(false)}
              className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-bold hover:bg-slate-50">
              Annuler
            </button>
          </div>
          <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
            💡 L'attribution déclenche automatiquement : (1) décrément du stock matériel, (2) notification au service Direction.
          </p>
        </div>
      )}

      {/* ── Formulaire Matériel ── */}
      {showMatForm && (
        <div className="bg-white border-2 border-emerald-200 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-black text-slate-900 mb-4">➕ Nouveau matériel cadeau</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-slate-700">Nom du matériel</label>
              <input
                value={matForm.nom}
                onChange={e => setMatForm(f => ({ ...f, nom: e.target.value }))}
                placeholder="Balance Numérique 30kg"
                className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-slate-700">Segment client</label>
              <select
                value={matForm.segment}
                onChange={e => setMatForm(f => ({ ...f, segment: e.target.value as Material["segment"] }))}
                className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
                {Object.entries(SEGMENT_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.icon} {v.label}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2 flex flex-col gap-1">
              <label className="text-[11px] font-bold text-slate-700">Description</label>
              <input
                value={matForm.description}
                onChange={e => setMatForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Balance pro 30kg pour Marchands F&L"
                className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-slate-700">Type de seuil</label>
              <select
                value={matForm.seuilType}
                onChange={e => setMatForm(f => ({ ...f, seuilType: e.target.value as NonNullable<Material["seuil_type"]> }))}
                className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
                <option value="volume_kg">📦 Volume (kg)</option>
                <option value="montant_mad">💰 Montant (MAD)</option>
                <option value="contrat">📝 Contrat signé</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-slate-700">Seuil déclencheur</label>
              <input
                type="number" min={0}
                value={matForm.seuilValeur}
                onChange={e => setMatForm(f => ({ ...f, seuilValeur: Number(e.target.value) || 0 }))}
                className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-slate-700">Stock initial (unités)</label>
              <input
                type="number" min={0}
                value={matForm.stockQte}
                onChange={e => setMatForm(f => ({ ...f, stockQte: Number(e.target.value) || 0 }))}
                className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-slate-700">Coût unitaire (MAD)</label>
              <input
                type="number" min={0}
                value={matForm.coutUnitaire}
                onChange={e => setMatForm(f => ({ ...f, coutUnitaire: Number(e.target.value) || 0 }))}
                className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              type="button"
              onClick={creerMateriel}
              disabled={busy}
              className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white text-sm font-bold hover:shadow-lg hover:shadow-emerald-200 transition-all disabled:opacity-60">
              {busy ? "⏳ Création…" : "✅ Créer le matériel"}
            </button>
            <button
              type="button"
              onClick={() => setShowMatForm(false)}
              className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-bold hover:bg-slate-50">
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-1.5 p-1.5 rounded-2xl bg-slate-100 w-fit overflow-x-auto border border-slate-200/70">
        {([
          { id: "attributions" as const, label: "Attributions", icon: "📋", count: attributions.length },
          { id: "catalogue"    as const, label: "Catalogue matériel", icon: "🎁", count: materials.length },
        ]).map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${tab === t.id ? "bg-white text-slate-900 shadow-md ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800 hover:bg-white/50"}`}>
            <span className="text-sm">{t.icon}</span>{t.label}
            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full tabular-nums ${tab === t.id ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Filtres ── */}
      <div className="flex flex-wrap items-center gap-2 p-3 rounded-2xl bg-white border border-slate-200 shadow-sm">
        {tab === "attributions" && (
          <select
            value={filterStatut}
            onChange={e => setFilterStatut(e.target.value as typeof filterStatut)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer">
            <option value="tous">📋 Tous statuts</option>
            <option value="a_livrer">📦 À livrer</option>
            <option value="livre">✅ Livrés</option>
            <option value="annule">🚫 Annulés</option>
          </select>
        )}
        {tab === "catalogue" && (
          <select
            value={filterSegment}
            onChange={e => setFilterSegment(e.target.value as typeof filterSegment)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer">
            <option value="tous">🌐 Tous segments</option>
            <option value="chr">🏨 CHR</option>
            <option value="marchand">🏪 Marchand</option>
            <option value="particulier">🏠 Particulier</option>
          </select>
        )}
        <button
          type="button"
          onClick={load}
          className="ml-auto px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-bold hover:bg-slate-50">
          🔄 Rafraîchir
        </button>
      </div>

      {loading && (
        <div className="text-center py-10 text-slate-500 text-sm">
          <span className="inline-block w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin align-middle mr-2" />
          Chargement…
        </div>
      )}

      {/* ── Catalogue ── */}
      {!loading && tab === "catalogue" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {matFiltered.length === 0 && (
            <div className="col-span-full text-center py-12 px-6 bg-white rounded-2xl border border-slate-200">
              <div className="text-5xl mb-3">🎁</div>
              <p className="text-sm font-bold text-slate-700">Aucun matériel dans ce filtre</p>
              <p className="text-xs text-slate-500 mt-1">Clique sur « Nouveau matériel » pour en créer un.</p>
            </div>
          )}
          {matFiltered.map(m => {
            const cfg = SEGMENT_CONFIG[m.segment] ?? SEGMENT_CONFIG.tous
            const rupture = m.stock_qte === 0
            return (
              <div key={m.id} className={`bg-white border rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow ${rupture ? "border-rose-200" : "border-slate-200"}`}>
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${cfg.color} flex items-center justify-center text-2xl shadow-sm shrink-0`}>
                    <span className="drop-shadow-sm">{cfg.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-slate-900 truncate">{m.nom}</p>
                    <p className="text-[11px] font-bold text-slate-500">{cfg.label}</p>
                    {!m.actif && <span className="text-[10px] font-bold text-rose-700">🚫 Désactivé</span>}
                  </div>
                </div>
                {m.description && (
                  <p className="text-xs text-slate-600 mb-3 leading-relaxed line-clamp-2">{m.description}</p>
                )}
                {m.seuil_type && (
                  <div className="text-[10px] text-slate-500 mb-3">
                    🎯 Déclencheur : <strong>{SEUIL_TYPE_LABEL[m.seuil_type] ?? m.seuil_type}</strong> ≥ {m.seuil_valeur}
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
                  <div>
                    <p className="text-[10px] text-slate-500">Stock</p>
                    <p className={`text-2xl font-black tabular-nums ${rupture ? "text-rose-600" : "text-emerald-700"}`}>{m.stock_qte}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => adjustStock(m, -1)}
                      disabled={m.stock_qte === 0}
                      aria-label="Diminuer stock"
                      className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-black disabled:opacity-40 disabled:cursor-not-allowed">
                      −
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustStock(m, 1)}
                      aria-label="Augmenter stock"
                      className="w-8 h-8 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-700 font-black">
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => supprimerMateriel(m.id)}
                      aria-label="Supprimer"
                      className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 transition-colors flex items-center justify-center text-sm">
                      🗑️
                    </button>
                  </div>
                </div>
                {m.cout_unitaire > 0 && (
                  <p className="text-[10px] text-slate-400 mt-2 text-right">
                    Valeur : {(m.stock_qte * m.cout_unitaire).toLocaleString("fr-MA")} MAD
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Attributions ── */}
      {!loading && tab === "attributions" && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          {attFiltered.length === 0 && (
            <div className="text-center py-12 px-6">
              <div className="text-5xl mb-3">📋</div>
              <p className="text-sm font-bold text-slate-700">Aucune attribution dans ce filtre</p>
              <p className="text-xs text-slate-500 mt-1">Clique sur « Attribuer un cadeau » pour démarrer.</p>
            </div>
          )}
          {attFiltered.length > 0 && (
            <div className="divide-y divide-slate-100">
              {attFiltered.map(a => {
                const statutCfg = STATUT_CONFIG[a.statut] ?? STATUT_CONFIG.a_livrer
                const segCfg = SEGMENT_CONFIG[a.material_segment ?? "tous"] ?? SEGMENT_CONFIG.tous
                return (
                  <div key={a.id} className="px-4 py-3.5 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${segCfg.color} flex items-center justify-center text-base shadow-sm shrink-0`}>
                        <span className="drop-shadow-sm">{segCfg.icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-slate-900">{a.material_nom ?? a.material_id}</p>
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${statutCfg.cls}`}>
                            <span>{statutCfg.icon}</span>{statutCfg.label}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 flex flex-wrap gap-2">
                          <span>👤 Client <strong className="font-mono">{a.client_id}</strong></span>
                          <span>· {segCfg.label}</span>
                          <span>· Attribué {fmtDate(a.attribue_le)}</span>
                          {a.livre_le && <span>· Livré {fmtDate(a.livre_le)}</span>}
                          {a.declenche_par && <span>· {a.declenche_par}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {a.statut === "a_livrer" && (
                          <>
                            <button
                              type="button"
                              onClick={() => patchAttribution(a.id, "livre")}
                              className="px-3 py-1.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-[11px] font-bold">
                              ✅ Livré
                            </button>
                            <button
                              type="button"
                              onClick={() => patchAttribution(a.id, "annule")}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-700 text-[11px] font-bold">
                              🚫
                            </button>
                          </>
                        )}
                        {a.statut !== "a_livrer" && (
                          <button
                            type="button"
                            onClick={() => patchAttribution(a.id, "a_livrer")}
                            className="px-2.5 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-800 text-[11px] font-bold">
                            ↩ À livrer
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => supprimerAttribution(a.id)}
                          aria-label="Supprimer attribution"
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
      )}

      <p className="text-[10px] text-slate-400 text-center">
        🔄 Sync auto 15s · Le trigger SQL fl_notify_gift gère stock + notif Direction automatiquement.
      </p>
    </div>
  )
}
