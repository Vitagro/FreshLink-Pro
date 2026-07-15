"use client"

import { useState, useEffect } from "react"
import { store, type EchelonClient, type User } from "@/lib/store"
import { hasPermission } from "@/lib/permissions"
import { logAction } from "@/lib/auditLog"

// ══════════════════════════════════════════════════════════════════════════════
// Échelons Client — liste dynamique des paliers de tarification (VIP/Gold/...).
// Créer, renommer, réordonner, désactiver ou supprimer un échelon. Chaque
// échelon peut définir des seuils d'attribution automatique (tonnage,
// fréquence de commande, CA) sur une fenêtre glissante — cf. computeEchelonAuto
// dans lib/store.ts. Le mode manuel/auto se choisit par client (fiche client,
// Comptes Externes) ; ce bouton "Recalculer" met à jour le cache des clients
// en mode auto.
// ══════════════════════════════════════════════════════════════════════════════

const COULEURS: { value: string; label: string }[] = [
  { value: "bg-amber-100 text-amber-700 border-amber-200",   label: "Ambre" },
  { value: "bg-yellow-100 text-yellow-700 border-yellow-200",label: "Jaune" },
  { value: "bg-slate-100 text-slate-700 border-slate-200",   label: "Ardoise" },
  { value: "bg-zinc-100 text-zinc-700 border-zinc-200",      label: "Zinc" },
  { value: "bg-purple-100 text-purple-700 border-purple-200",label: "Violet" },
  { value: "bg-blue-100 text-blue-700 border-blue-200",      label: "Bleu" },
  { value: "bg-green-100 text-green-700 border-green-200",   label: "Vert" },
  { value: "bg-rose-100 text-rose-700 border-rose-200",      label: "Rose" },
]

type FormState = {
  id: string
  nom: string
  couleur: string
  actif: boolean
  autoActif: boolean
  minTonnageKg: string
  minCommandes: string
  minCADh: string
  periodeJours: string
}

const EMPTY_FORM: FormState = {
  id: "", nom: "", couleur: COULEURS[0].value, actif: true,
  autoActif: false, minTonnageKg: "", minCommandes: "", minCADh: "", periodeJours: "90",
}

function slugify(nom: string): string {
  return nom.trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `echelon-${Date.now()}`
}

export default function BOEchelonsClient({ user }: { user: User }) {
  const canCreer = hasPermission(user.role, "creer_echelon")
  const canModifier = hasPermission(user.role, "modifier_echelon")
  const canSupprimer = hasPermission(user.role, "supprimer_echelon")
  const canConfigurerAuto = hasPermission(user.role, "configurer_attribution_auto")

  const [echelons, setEchelons] = useState<EchelonClient[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [confirmDel, setConfirmDel] = useState<EchelonClient | null>(null)
  const [recalcMsg, setRecalcMsg] = useState<string | null>(null)
  const [recalculating, setRecalculating] = useState(false)

  const reload = () => setEchelons([...store.getEchelons()].sort((a, b) => b.ordre - a.ordre))
  useEffect(() => { reload() }, [])

  const openNew = () => { if (!canCreer) return; setEditingId(null); setForm(EMPTY_FORM); setShowForm(true) }
  const openEdit = (e: EchelonClient) => {
    if (!canModifier) return
    setEditingId(e.id)
    setForm({
      id: e.id, nom: e.nom, couleur: e.couleur, actif: e.actif,
      autoActif: !!e.auto,
      minTonnageKg: e.auto?.minTonnageKg != null ? String(e.auto.minTonnageKg) : "",
      minCommandes: e.auto?.minCommandes != null ? String(e.auto.minCommandes) : "",
      minCADh:      e.auto?.minCADh      != null ? String(e.auto.minCADh)      : "",
      periodeJours: String(e.auto?.periodeJours ?? 90),
    })
    setShowForm(true)
  }

  const handleSave = () => {
    if (!form.nom.trim()) return
    const permKey = editingId ? "modifier_echelon" : "creer_echelon"
    if (editingId ? !canModifier : !canCreer) { logAction(user, permKey, "denied", { type: "echelon", label: form.nom }); return }
    logAction(user, permKey, "success", { type: "echelon", id: editingId ?? undefined, label: form.nom })
    const num = (s: string) => (s.trim() === "" ? undefined : Number(s))
    const auto: EchelonClient["auto"] = form.autoActif ? {
      minTonnageKg: num(form.minTonnageKg),
      minCommandes: num(form.minCommandes),
      minCADh:      num(form.minCADh),
      periodeJours: Number(form.periodeJours) || 90,
    } : undefined

    if (editingId) {
      store.updateEchelon(editingId, { nom: form.nom.trim(), couleur: form.couleur, actif: form.actif, auto })
    } else {
      const id = slugify(form.nom)
      const maxOrdre = echelons.reduce((m, e) => Math.max(m, e.ordre), 0)
      store.addEchelon({ id, nom: form.nom.trim(), couleur: form.couleur, ordre: maxOrdre + 1, actif: form.actif, auto })
    }
    setShowForm(false)
    reload()
  }

  const handleDelete = (e: EchelonClient) => {
    if (!canSupprimer) { logAction(user, "supprimer_echelon", "denied", { type: "echelon", id: e.id, label: e.nom }); return }
    logAction(user, "supprimer_echelon", "success", { type: "echelon", id: e.id, label: e.nom })
    store.deleteEchelon(e.id)
    setConfirmDel(null)
    reload()
  }

  const move = (e: EchelonClient, dir: 1 | -1) => {
    if (!canModifier) return
    const sorted = [...echelons].sort((a, b) => a.ordre - b.ordre)
    const idx = sorted.findIndex(x => x.id === e.id)
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    const a = sorted[idx], b = sorted[swapIdx]
    store.updateEchelon(a.id, { ordre: b.ordre })
    store.updateEchelon(b.id, { ordre: a.ordre })
    reload()
  }

  const handleRecalculer = () => {
    if (!canConfigurerAuto) { logAction(user, "configurer_attribution_auto", "denied", { type: "echelon", label: "recalcul auto" }); return }
    logAction(user, "configurer_attribution_auto", "success", { type: "echelon", label: "recalcul auto" })
    setRecalculating(true)
    const n = store.recalculerEchelonsAuto()
    setRecalcMsg(n > 0 ? `${n} client(s) mis à jour.` : "Aucun changement — tous les clients en mode auto sont déjà à jour.")
    setRecalculating(false)
    setTimeout(() => setRecalcMsg(null), 5000)
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">🏆 Échelons Client</h1>
          <p className="text-sm text-slate-500 mt-1">
            Paliers de tarification (VIP, Gold…) — créez, renommez ou supprimez librement.
            Chaque échelon peut aussi être attribué <strong>automatiquement</strong> selon tonnage / fréquence / CA.
          </p>
        </div>
        <div className="flex gap-2">
          {canConfigurerAuto && (
            <button onClick={handleRecalculer} disabled={recalculating}
              className="px-4 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-colors disabled:opacity-50">
              {recalculating ? "Calcul…" : "🔄 Recalculer les échelons auto"}
            </button>
          )}
          {canCreer && (
            <button onClick={openNew}
              className="px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 transition-colors">
              + Nouvel échelon
            </button>
          )}
        </div>
      </div>

      {recalcMsg && (
        <div className="px-4 py-2.5 rounded-xl bg-green-50 border border-green-200 text-green-800 text-sm font-semibold">
          {recalcMsg}
        </div>
      )}

      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Échelon</th>
                <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Ordre</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Attribution auto</th>
                <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Actif</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {[...echelons].sort((a, b) => b.ordre - a.ordre).map(e => (
                <tr key={e.id} className={`border-b border-border last:border-0 hover:bg-muted/20 ${!e.actif ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${e.couleur}`}>{e.nom}</span>
                    <span className="ml-2 text-[10px] text-muted-foreground font-mono">{e.id}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => move(e, 1)} disabled={!canModifier} title="Monter" className="w-6 h-6 rounded hover:bg-muted text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed">▲</button>
                      <span className="w-6 text-center font-mono">{e.ordre}</span>
                      <button onClick={() => move(e, -1)} disabled={!canModifier} title="Descendre" className="w-6 h-6 rounded hover:bg-muted text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed">▼</button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {e.auto ? (
                      <div className="flex flex-col gap-0.5">
                        {e.auto.minTonnageKg != null && <span>≥ {e.auto.minTonnageKg} kg</span>}
                        {e.auto.minCommandes != null && <span>≥ {e.auto.minCommandes} commandes</span>}
                        {e.auto.minCADh != null && <span>≥ {e.auto.minCADh.toLocaleString("fr-MA")} DH</span>}
                        <span className="text-[10px]">sur {e.auto.periodeJours} jours glissants</span>
                      </div>
                    ) : <span className="italic">Manuel uniquement</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => { if (!canModifier) return; store.updateEchelon(e.id, { actif: !e.actif }); reload() }}
                      disabled={!canModifier}
                      className={`relative w-10 h-5 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${e.actif ? "bg-emerald-500" : "bg-slate-200"}`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${e.actif ? "left-5" : "left-0.5"}`} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {canModifier && <button onClick={() => openEdit(e)} className="text-xs font-semibold text-primary hover:underline">Modifier</button>}
                      {canSupprimer && <button onClick={() => setConfirmDel(e)} className="text-xs font-semibold text-red-600 hover:underline">Supprimer</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {echelons.length === 0 && (
                <tr><td colSpan={5} className="text-center py-10 text-muted-foreground text-sm">Aucun échelon défini.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-card rounded-2xl border border-border p-5 max-w-md w-full flex flex-col gap-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-foreground">{editingId ? "Modifier l'échelon" : "Nouvel échelon"}</h3>

            <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
              Nom
              <input type="text" value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm" placeholder="ex: Platine" />
            </label>

            <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
              Couleur
              <select value={form.couleur} onChange={e => setForm({ ...form, couleur: e.target.value })}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm">
                {COULEURS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <span className={`self-start px-2.5 py-1 rounded-full text-xs font-bold border mt-1 ${form.couleur}`}>{form.nom || "Aperçu"}</span>
            </label>

            <label className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <input type="checkbox" checked={form.actif} onChange={e => setForm({ ...form, actif: e.target.checked })} />
              Échelon actif (sélectionnable)
            </label>

            <div className="border-t border-border pt-3 flex flex-col gap-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <input type="checkbox" checked={form.autoActif} onChange={e => setForm({ ...form, autoActif: e.target.checked })} />
                Attribution automatique
              </label>
              {form.autoActif && (
                <div className="grid grid-cols-2 gap-2 pl-6">
                  <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                    Tonnage min. (kg)
                    <input type="number" min={0} value={form.minTonnageKg} onChange={e => setForm({ ...form, minTonnageKg: e.target.value })}
                      className="px-2 py-1.5 rounded-lg border border-border bg-background text-sm" placeholder="—" />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                    Commandes min.
                    <input type="number" min={0} value={form.minCommandes} onChange={e => setForm({ ...form, minCommandes: e.target.value })}
                      className="px-2 py-1.5 rounded-lg border border-border bg-background text-sm" placeholder="—" />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                    CA min. (DH)
                    <input type="number" min={0} value={form.minCADh} onChange={e => setForm({ ...form, minCADh: e.target.value })}
                      className="px-2 py-1.5 rounded-lg border border-border bg-background text-sm" placeholder="—" />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                    Période glissante (jours)
                    <input type="number" min={1} value={form.periodeJours} onChange={e => setForm({ ...form, periodeJours: e.target.value })}
                      className="px-2 py-1.5 rounded-lg border border-border bg-background text-sm" />
                  </label>
                  <p className="col-span-2 text-[10px] text-muted-foreground">Un seuil laissé vide n&apos;est pas pris en compte. Tous les seuils renseignés doivent être atteints.</p>
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-muted">Annuler</button>
              <button onClick={handleSave} disabled={!form.nom.trim()} className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-primary disabled:opacity-40">Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirmDel && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setConfirmDel(null)}>
          <div className="bg-card rounded-2xl border border-border p-5 max-w-sm w-full flex flex-col gap-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-foreground">Supprimer « {confirmDel.nom} » ?</h3>
            <p className="text-xs text-muted-foreground">
              Les clients ayant cet échelon repasseront sans échelle, et les tarifs configurés dessus (écran Tarifs par Catégorie) seront retirés. Action irréversible.
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setConfirmDel(null)} className="px-4 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-muted">Annuler</button>
              <button onClick={() => handleDelete(confirmDel)} className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-700">Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
