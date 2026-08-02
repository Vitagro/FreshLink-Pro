"use client"

import { useEffect, useState, useCallback } from "react"
import { store, type CutoffNotification, type UserRole, type User, ROLE_LABELS } from "@/lib/store"
import { hasPermission } from "@/lib/permissions"
import { logAction } from "@/lib/auditLog"

// Rôles proposés pour cibler une étape (horaire) — les plus opérationnels
const CUTOFF_ROLES: { v: UserRole; l: string }[] = [
  { v: "acheteur", l: "Acheteur" }, { v: "resp_achat", l: "Resp. Achat" },
  { v: "prevendeur", l: "Prévendeur" }, { v: "resp_commercial", l: "Resp. Commercial" },
  { v: "magasinier", l: "Magasinier" }, { v: "dispatcheur", l: "Dispatcheur" },
  { v: "resp_logistique", l: "Resp. Logistique" }, { v: "livreur", l: "Livreur" },
  { v: "admin", l: "Admin" },
]

// ══════════════════════════════════════════════════════════════════
//  BOCutoffs — Centre de régulation des flux (Section 4)
//   - Toggle global ON/OFF par cible (Commandes / Achats)
//   - Création de cutoffs auto (tonnage, capacité)
//   - Liste avec toggle individuel + suppression
//  Branché sur /api/ext/cutoffs (table fl_cutoffs V3)
// ══════════════════════════════════════════════════════════════════

interface Cutoff {
  id: string
  type: "manuel" | "auto_tonnage" | "auto_geo" | "auto_capacite"
  cible: "commande" | "achat" | "tous"
  article_id: string | null
  fournisseur_id: string | null
  seuil_tonnage: number
  tonnage_actuel: number
  capacite_max_kg: number
  charge_actuelle_kg: number
  actif: boolean
  motif: string | null
  active_par: string | null
  created_at: string
  updated_at: string
}

const TYPE_CONFIG: Record<Cutoff["type"], { label: string; icon: string; color: string }> = {
  manuel:        { label: "Manuel",          icon: "🖐️", color: "from-slate-500 to-slate-700" },
  auto_tonnage:  { label: "Auto Tonnage",    icon: "⚖️", color: "from-blue-500 to-blue-700" },
  auto_geo:      { label: "Auto Géo (GPS)",  icon: "📍", color: "from-purple-500 to-fuchsia-600" },
  auto_capacite: { label: "Auto Capacité",   icon: "🚚", color: "from-amber-500 to-orange-600" },
}

const CIBLE_CONFIG: Record<Cutoff["cible"], { label: string; icon: string }> = {
  commande: { label: "Commandes", icon: "🛒" },
  achat:    { label: "Achats",    icon: "📦" },
  tous:     { label: "Tous flux", icon: "🌐" },
}

export default function BOCutoffs({ user }: { user: User }) {
  const currentUserId = user.id
  const [cutoffs, setCutoffs] = useState<Cutoff[]>([])
  const [seuilTonnage, setSeuilTonnage] = useState(0)
  const [seuilSaved, setSeuilSaved] = useState(false)
  useEffect(() => { try { setSeuilTonnage(store.getSeuilAlerte().tonnageMaxJour) } catch { /* noop */ } }, [])
  const saveSeuil = () => {
    try { const c = store.getSeuilAlerte(); store.saveSeuilAlerte({ ...c, tonnageMaxJour: Number(seuilTonnage) || 0 }); setSeuilSaved(true); setTimeout(() => setSeuilSaved(false), 2500) } catch { /* noop */ }
  }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)

  // ── Horaires & tâches de l'équipe (notifications cut-off temporisées) ──────
  const [timed, setTimed] = useState<CutoffNotification[]>([])
  const [team, setTeam] = useState<User[]>([])
  const [timedSaved, setTimedSaved] = useState(false)
  useEffect(() => {
    try { setTimed(store.getCutoffs()); setTeam(store.getUsers().filter(u => u.actif && !["client", "fournisseur"].includes(u.role))) } catch { /* noop */ }
  }, [])
  const persistTimed = (next: CutoffNotification[]) => {
    setTimed(next)
    try { store.saveCutoffs(next); setTimedSaved(true); setTimeout(() => setTimedSaved(false), 1800) } catch { /* noop */ }
  }
  const patchTimed = (id: string, patch: Partial<CutoffNotification>) => persistTimed(timed.map(c => c.id === id ? { ...c, ...patch } : c))
  const toggleTimedRole = (id: string, role: UserRole) => {
    const c = timed.find(x => x.id === id); if (!c) return
    const roles = c.roles.includes(role) ? c.roles.filter(r => r !== role) : [...c.roles, role]
    patchTimed(id, { roles })
  }
  const addTimed = () => persistTimed([...timed, { id: `co_${Date.now().toString(36)}`, label: "Nouvelle étape", time: "08:00", message: "", active: true, roles: [], tache: "", assignedUserIds: [] }])
  const removeTimed = (id: string) => {
    if (!hasPermission(user.role, "backup_restore")) { logAction(user, "backup_restore", "denied", { type: "cutoff_timed_suppression", id }); return }
    if (!window.confirm("Supprimer cette étape horaire ?")) return
    logAction(user, "backup_restore", "success", { type: "cutoff_timed_suppression", id })
    persistTimed(timed.filter(c => c.id !== id))
  }

  // Formulaire de création
  const [form, setForm] = useState({
    type:   "manuel" as Cutoff["type"],
    cible:  "commande" as Cutoff["cible"],
    motif:  "",
    articleId: "",
    fournisseurId: "",
    seuilTonnage: 0,
    capaciteMaxKg: 0,
    actif: true,
  })

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ext/cutoffs", { cache: "no-store" })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? "Erreur de chargement")
      setCutoffs(data.data ?? [])
      setError("")
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  // Polling 10s pour rester sync (les triggers auto peuvent activer un cutoff)
  useEffect(() => {
    load()
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [load])

  const toggleActif = async (c: Cutoff) => {
    if (!hasPermission(user.role, "backup_restore")) { logAction(user, "backup_restore", "denied", { type: "cutoff", id: c.id }); return }
    logAction(user, "backup_restore", "success", { type: "cutoff", id: c.id, label: !c.actif ? "activation" : "desactivation" })
    setCutoffs(prev => prev.map(x => x.id === c.id ? { ...x, actif: !x.actif } : x))
    try {
      await fetch("/api/ext/cutoffs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, actif: !c.actif, activePar: currentUserId ?? "BO" }),
      })
    } catch (e) {
      setError(String(e))
      load()
    }
  }

  const remove = async (id: string) => {
    if (!hasPermission(user.role, "backup_restore")) { logAction(user, "backup_restore", "denied", { type: "cutoff_suppression", id }); return }
    if (!window.confirm("Supprimer définitivement ce cutoff ?")) return
    logAction(user, "backup_restore", "success", { type: "cutoff_suppression", id })
    setCutoffs(prev => prev.filter(x => x.id !== id))
    try {
      await fetch(`/api/ext/cutoffs?id=${encodeURIComponent(id)}`, { method: "DELETE" })
    } catch (e) {
      setError(String(e))
      load()
    }
  }

  const create = async () => {
    if (form.type !== "manuel" && !form.motif.trim()) {
      setError("Le motif est requis pour un cutoff auto.")
      return
    }
    setCreating(true)
    try {
      const res = await fetch("/api/ext/cutoffs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, activePar: currentUserId ?? "BO" }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? "Erreur création")
      setShowCreate(false)
      setForm({ type: "manuel", cible: "commande", motif: "", articleId: "", fournisseurId: "", seuilTonnage: 0, capaciteMaxKg: 0, actif: true })
      load()
      setError("")
    } catch (e) {
      setError(String(e))
    } finally {
      setCreating(false)
    }
  }

  // Toggle global ultra-rapide : crée OU active un cutoff manuel sur une cible
  const quickToggleCible = async (cible: Cutoff["cible"]) => {
    const existing = cutoffs.find(c => c.cible === cible && c.type === "manuel")
    if (existing) {
      await toggleActif(existing)
      return
    }
    // Pas de cutoff manuel existant → en créer un actif
    try {
      await fetch("/api/ext/cutoffs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "manuel", cible, actif: true,
          motif: `Blocage manuel ${cible} depuis BO`,
          activePar: currentUserId ?? "BO",
        }),
      })
      load()
    } catch (e) {
      setError(String(e))
    }
  }

  const cmdActifs   = cutoffs.filter(c => c.actif && (c.cible === "commande" || c.cible === "tous"))
  const achatActifs = cutoffs.filter(c => c.actif && (c.cible === "achat" || c.cible === "tous"))
  const bloqueCmd   = cmdActifs.length > 0
  const bloqueAchat = achatActifs.length > 0

  return (
    <div className="flex flex-col gap-5">
      {/* ── Header premium ── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0b3d1a] via-[#1a4f2a] to-[#2d7a46] p-6 sm:p-7 shadow-xl">
        <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-emerald-400/10 blur-2xl" />
        <div className="absolute -left-8 -bottom-12 w-40 h-40 rounded-full bg-rose-400/10 blur-2xl" />
        <div className="relative flex items-start justify-between flex-wrap gap-5">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/12 backdrop-blur-sm flex items-center justify-center text-3xl shadow-lg shrink-0">🚦</div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-2xl font-black text-white tracking-tight">Centre Cutoffs</h2>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-400/15 border border-emerald-300/30 text-emerald-100 text-[10px] font-bold uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                  Sync live
                </span>
              </div>
              <p className="text-sm text-emerald-50/85 mt-1.5 max-w-xl leading-relaxed">
                Régulation des flux Commandes / Achats. Toggle manuel instantané ou règles automatiques (tonnage, capacité).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(s => !s)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/12 backdrop-blur-sm border border-white/20 text-white text-xs font-bold hover:bg-white/20 transition-all shadow-sm">
            ➕ Nouveau cutoff
          </button>
        </div>
      </div>

      {/* ── Alerte SURCHARGE tonnage (notifie l'équipe sur téléphone) ── */}
      <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/60 p-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <p className="text-sm font-black text-amber-800 flex items-center gap-1.5">⚖️ Alerte surcharge — seuil tonnage / jour</p>
          <p className="text-[11px] text-amber-700 mt-0.5">Si le tonnage commandé du jour dépasse ce seuil, l&apos;équipe (logistique, achat, admin) reçoit une notification « surcharge ». 0 = désactivé.</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-amber-700">Seuil (kg)</label>
            <input type="number" min={0} value={seuilTonnage} onChange={e => setSeuilTonnage(Number(e.target.value))}
              className="w-32 px-3 py-2 rounded-xl border border-amber-300 bg-white text-sm font-bold" placeholder="ex: 5000" />
          </div>
          <button onClick={saveSeuil} className="px-4 py-2 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600">Enregistrer</button>
          {seuilSaved && <span className="text-xs font-semibold text-emerald-600 self-center">✓ Enregistré</span>}
        </div>
      </div>

      {/* ── Horaires & tâches de l'équipe (notifications temporisées) ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm flex flex-col gap-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-black text-slate-900">⏰ Horaires & tâches de l&apos;équipe</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Chaque étape déclenche une notification (téléphone) à l&apos;heure, pour les rôles/personnes ciblés, avec la tâche à faire.</p>
          </div>
          <div className="flex items-center gap-2">
            {timedSaved && <span className="text-xs font-semibold text-emerald-600">✓ Enregistré</span>}
            <button onClick={addTimed} className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700">➕ Ajouter une étape</button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {[...timed].sort((a, b) => (a.time || "").localeCompare(b.time || "")).map(c => (
            <div key={c.id} className={`rounded-xl border p-3 flex flex-col gap-2 ${c.active ? "border-slate-200 bg-slate-50/60" : "border-slate-100 bg-white opacity-70"}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <input type="time" value={c.time} onChange={e => patchTimed(c.id, { time: e.target.value })}
                  className="px-2 py-1.5 rounded-lg border border-slate-200 text-sm font-bold bg-white w-28" />
                <input value={c.label ?? ""} onChange={e => patchTimed(c.id, { label: e.target.value })}
                  placeholder="Nom de l'étape" className="flex-1 min-w-[140px] px-2 py-1.5 rounded-lg border border-slate-200 text-sm font-semibold bg-white" />
                <button onClick={() => patchTimed(c.id, { active: !c.active })}
                  className={`relative w-11 h-6 rounded-full transition-colors ${c.active ? "bg-emerald-500" : "bg-slate-300"}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${c.active ? "translate-x-5" : "translate-x-0"}`} />
                </button>
                <button onClick={() => removeTimed(c.id)} className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 text-sm">🗑️</button>
              </div>
              <input value={c.tache ?? ""} onChange={e => patchTimed(c.id, { tache: e.target.value })}
                placeholder="Tâche à accomplir (ex : clôturer les achats légumes, charger le camion 1…)"
                className="px-2 py-1.5 rounded-lg border border-slate-200 text-sm bg-white" />
              {/* Rôles ciblés */}
              <div className="flex flex-wrap gap-1.5">
                {CUTOFF_ROLES.map(r => (
                  <button key={r.v} onClick={() => toggleTimedRole(c.id, r.v)}
                    className={`px-2 py-0.5 rounded-full text-[11px] font-bold border transition-colors ${c.roles.includes(r.v) ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-500 border-slate-200 hover:border-emerald-300"}`}>
                    {r.l}
                  </button>
                ))}
              </div>
              {/* Personnes nommément assignées */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold text-slate-500">Personnes :</span>
                <select multiple value={c.assignedUserIds ?? []}
                  onChange={e => patchTimed(c.id, { assignedUserIds: Array.from(e.target.selectedOptions).map(o => o.value) })}
                  className="flex-1 min-w-[180px] px-2 py-1 rounded-lg border border-slate-200 text-xs bg-white max-h-20">
                  {team.map(u => <option key={u.id} value={u.id}>{u.name} ({ROLE_LABELS[u.role] ?? u.role})</option>)}
                </select>
                {(c.assignedUserIds?.length ?? 0) > 0 && <span className="text-[10px] text-emerald-600 font-semibold">{c.assignedUserIds!.length} assigné(s)</span>}
              </div>
            </div>
          ))}
          {timed.length === 0 && <p className="text-xs text-slate-400 py-2">Aucune étape configurée. Cliquez « Ajouter une étape ».</p>}
        </div>
        <p className="text-[10px] text-slate-400">💡 Maintenir Ctrl/Cmd pour sélectionner plusieurs personnes. Les notifications partent sur le téléphone de chaque personne ciblée (app ouverte).</p>
      </div>

      {/* ── Toggle ultra-rapide par cible ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {(["commande", "achat"] as const).map(cible => {
          const bloque = cible === "commande" ? bloqueCmd : bloqueAchat
          const actifs = cible === "commande" ? cmdActifs : achatActifs
          return (
            <div
              key={cible}
              className={`relative overflow-hidden rounded-2xl border-2 p-5 transition-all ${bloque ? "bg-rose-50 border-rose-300" : "bg-emerald-50 border-emerald-200"}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${bloque ? "bg-rose-200" : "bg-emerald-200"}`}>
                    {CIBLE_CONFIG[cible].icon}
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">{CIBLE_CONFIG[cible].label}</h3>
                    <p className={`text-xs font-bold ${bloque ? "text-rose-700" : "text-emerald-700"}`}>
                      {bloque ? `🚫 BLOQUÉ (${actifs.length})` : "✅ Ouvert"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => quickToggleCible(cible)}
                  aria-label={bloque ? `Débloquer ${cible}` : `Bloquer ${cible}`}
                  className={`relative w-16 h-9 rounded-full transition-colors ${bloque ? "bg-rose-500" : "bg-emerald-500"}`}>
                  <span className={`absolute top-0.5 left-0.5 w-8 h-8 rounded-full bg-white shadow-md transition-transform ${bloque ? "translate-x-7" : "translate-x-0"}`} />
                </button>
              </div>
              {bloque && actifs[0]?.motif && (
                <p className="text-xs text-rose-800 bg-white/60 rounded-lg p-2 mt-2 leading-relaxed">
                  💬 {actifs[0].motif}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Formulaire création (drawer inline) ── */}
      {showCreate && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-black text-slate-900 mb-4">➕ Créer un cutoff</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-slate-700">Type</label>
              <select
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value as Cutoff["type"] }))}
                className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
                {Object.entries(TYPE_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.icon} {v.label}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-slate-700">Cible</label>
              <select
                value={form.cible}
                onChange={e => setForm(f => ({ ...f, cible: e.target.value as Cutoff["cible"] }))}
                className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
                {Object.entries(CIBLE_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.icon} {v.label}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2 flex flex-col gap-1">
              <label className="text-[11px] font-bold text-slate-700">Motif (visible dans la notification)</label>
              <input
                value={form.motif}
                onChange={e => setForm(f => ({ ...f, motif: e.target.value }))}
                placeholder="ex : Rupture qualité bananes — bloquer prises de commande"
                className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>

            {/* Champs conditionnels par type */}
            {form.type === "auto_tonnage" && (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-slate-700">ID Article (optionnel)</label>
                  <input
                    value={form.articleId}
                    onChange={e => setForm(f => ({ ...f, articleId: e.target.value }))}
                    placeholder="VFP00046"
                    className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-slate-700">Seuil tonnage (kg)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.seuilTonnage}
                    onChange={e => setForm(f => ({ ...f, seuilTonnage: Number(e.target.value) || 0 }))}
                    className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
              </>
            )}
            {form.type === "auto_capacite" && (
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-700">Capacité max camion (kg)</label>
                <input
                  type="number"
                  min={0}
                  value={form.capaciteMaxKg}
                  onChange={e => setForm(f => ({ ...f, capaciteMaxKg: Number(e.target.value) || 0 }))}
                  className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
            )}

            <div className="flex items-center gap-3 sm:col-span-2 mt-1">
              <input
                id="cutoff-actif-create"
                type="checkbox"
                checked={form.actif}
                onChange={e => setForm(f => ({ ...f, actif: e.target.checked }))}
                className="w-4 h-4 accent-emerald-600 cursor-pointer" />
              <label htmlFor="cutoff-actif-create" className="text-sm font-semibold text-slate-700 cursor-pointer">
                Activer immédiatement
              </label>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button
              type="button"
              onClick={create}
              disabled={creating}
              className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white text-sm font-bold hover:shadow-lg hover:shadow-emerald-200 transition-all disabled:opacity-60">
              {creating ? "⏳ Création…" : "✅ Créer le cutoff"}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-bold hover:bg-slate-50">
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* ── Erreur ── */}
      {error && (
        <div className="px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">
          ⚠️ {error}
        </div>
      )}

      {/* ── Liste détaillée des cutoffs ── */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-900">📋 Tous les cutoffs ({cutoffs.length})</h3>
          <button
            type="button"
            onClick={load}
            className="text-xs text-emerald-600 font-bold hover:text-emerald-800 transition-colors">
            🔄 Rafraîchir
          </button>
        </div>

        {loading && (
          <div className="text-center py-10 text-slate-500 text-sm">
            <span className="inline-block w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin align-middle mr-2" />
            Chargement…
          </div>
        )}

        {!loading && cutoffs.length === 0 && (
          <div className="text-center py-12 px-6">
            <div className="text-5xl mb-3">🟢</div>
            <p className="text-sm font-bold text-slate-700">Aucun cutoff configuré</p>
            <p className="text-xs text-slate-500 mt-1">Tous les flux sont ouverts.</p>
          </div>
        )}

        {!loading && cutoffs.length > 0 && (
          <div className="divide-y divide-slate-100">
            {cutoffs.map(c => {
              const tcfg = TYPE_CONFIG[c.type] ?? TYPE_CONFIG.manuel
              const ccfg = CIBLE_CONFIG[c.cible] ?? CIBLE_CONFIG.tous
              return (
                <div key={c.id} className={`px-4 py-3.5 transition-colors ${c.actif ? "bg-rose-50/40" : ""}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${tcfg.color} flex items-center justify-center text-base shadow-sm shrink-0`}>
                      <span className="drop-shadow-sm">{tcfg.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-900">{tcfg.label}</span>
                        <span className="text-[11px] font-semibold text-slate-500">→ {ccfg.icon} {ccfg.label}</span>
                        {c.actif && (
                          <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-black bg-rose-200 text-rose-800">
                            🚫 ACTIF
                          </span>
                        )}
                      </div>
                      {c.motif && (
                        <p className="text-xs text-slate-700 mt-1 leading-relaxed">{c.motif}</p>
                      )}
                      <div className="flex items-center gap-3 flex-wrap mt-1.5 text-[10px] text-slate-500">
                        {c.type === "auto_tonnage" && c.seuil_tonnage > 0 && (
                          <span>⚖️ Seuil {c.seuil_tonnage} kg · actuel {c.tonnage_actuel} kg</span>
                        )}
                        {c.type === "auto_capacite" && c.capacite_max_kg > 0 && (
                          <span>🚚 Max {c.capacite_max_kg} kg · charge {c.charge_actuelle_kg} kg</span>
                        )}
                        {c.article_id     && <span>📦 {c.article_id}</span>}
                        {c.fournisseur_id && <span>🏭 {c.fournisseur_id}</span>}
                        <span>· id {c.id}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleActif(c)}
                        aria-label={c.actif ? "Désactiver" : "Activer"}
                        className={`relative w-12 h-7 rounded-full transition-colors ${c.actif ? "bg-rose-500" : "bg-slate-300"}`}>
                        <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${c.actif ? "translate-x-5" : "translate-x-0"}`} />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(c.id)}
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

      <p className="text-[10px] text-slate-400 text-center">
        🔄 Sync auto 10s · Cutoffs actifs déclenchent une notification au service ciblé.
      </p>
    </div>
  )
}
