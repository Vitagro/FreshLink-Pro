"use client"

import { useState } from "react"
import { type UserRole, ROLE_LABELS, isSuperSuperAdmin } from "@/lib/store"
import {
  type PermKey, PERMISSIONS, type PermMatrix, DEFAULT_MATRIX,
  loadPermMatrix, savePermMatrix,
} from "@/lib/permissions"

// ── Permission definitions ─────────────────────────────────────────────────
// Matrice éditable, par rôle. Contrairement à Rôles & Permissions (lecture
// seule, reflète lib/rolePermissions.ts appliqué à la création de compte),
// cet écran permet d'ajuster finement les droits de TOUS les rôles internes
// — y compris super_admin. Seul super_super_admin (Jawad) reste toujours
// autorisé sur tout, filet de sécurité pour ne jamais se bloquer soi-même.
// Les définitions (PermKey, PERMISSIONS, DEFAULT_MATRIX) vivent dans
// lib/permissions.ts pour être importables depuis n'importe quel écran
// (hasPermission) sans dépendre de ce composant.

// Rôles internes affichés dans la matrice (les rôles externes — client,
// fournisseur, investisseur — n'ont pas de droits BO à configurer ici).
const ROLE_HEADERS: { role: UserRole; label: string; cls: string }[] = [
  { role: "super_admin",         label: "Super Admin",     cls: "bg-violet-100 text-violet-700" },
  { role: "admin",               label: "Admin",           cls: "bg-blue-100 text-blue-700" },
  { role: "resp_commercial",     label: "Resp. Comm.",     cls: "bg-green-100 text-green-700" },
  { role: "team_leader",         label: "Team Leader",     cls: "bg-green-100 text-green-700" },
  { role: "prevendeur",          label: "Prévendeur",      cls: "bg-green-100 text-green-700" },
  { role: "suivi_commande",      label: "Suivi Cmd",       cls: "bg-green-100 text-green-700" },
  { role: "resp_logistique",     label: "Resp. Logist.",   cls: "bg-amber-100 text-amber-700" },
  { role: "dispatcheur",         label: "Dispatcheur",     cls: "bg-amber-100 text-amber-700" },
  { role: "magasinier",          label: "Magasinier",      cls: "bg-amber-100 text-amber-700" },
  { role: "livreur",             label: "Livreur",         cls: "bg-amber-100 text-amber-700" },
  { role: "chef_depot",          label: "Chef Dépôt",      cls: "bg-amber-100 text-amber-700" },
  { role: "qualite",             label: "Qualité",         cls: "bg-amber-100 text-amber-700" },
  { role: "resp_achat",          label: "Resp. Achat",     cls: "bg-orange-100 text-orange-700" },
  { role: "acheteur",            label: "Acheteur",        cls: "bg-orange-100 text-orange-700" },
  { role: "ctrl_achat",          label: "Ctrl Achat",      cls: "bg-orange-100 text-orange-700" },
  { role: "ctrl_prep",           label: "Ctrl Prép.",      cls: "bg-orange-100 text-orange-700" },
  { role: "financier",           label: "Financier",       cls: "bg-rose-100 text-rose-700" },
  { role: "cash_man",            label: "Cash Man",        cls: "bg-rose-100 text-rose-700" },
  { role: "comptable",           label: "Comptable",       cls: "bg-rose-100 text-rose-700" },
  { role: "charge_recouvrement", label: "Recouvrement",    cls: "bg-rose-100 text-rose-700" },
  { role: "rh_manager",          label: "RH Manager",      cls: "bg-pink-100 text-pink-700" },
  { role: "it_admin",            label: "IT Admin",        cls: "bg-slate-100 text-slate-700" },
  { role: "auditeur",            label: "Auditeur",        cls: "bg-slate-100 text-slate-700" },
]

// ── Component ──────────────────────────────────────────────────────────────

export default function BOPermissionsMatrix() {
  const [matrix, setMatrix] = useState<PermMatrix>(() => {
    if (typeof window !== "undefined") return loadPermMatrix()
    return DEFAULT_MATRIX
  })
  const [saved, setSaved] = useState(false)
  const [expandedCat, setExpandedCat] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  const isLockedRole = (role: UserRole) => role === "super_super_admin"

  const categories = Array.from(new Set(PERMISSIONS.map(p => p.category)))
  const q = search.trim().toLowerCase()
  const visibleRoles = ROLE_HEADERS.filter(rh =>
    !q || rh.label.toLowerCase().includes(q) || (ROLE_LABELS[rh.role] ?? "").toLowerCase().includes(q))

  const toggle = (role: UserRole, perm: PermKey) => {
    if (isLockedRole(role)) return
    setMatrix(prev => {
      const rolePerms = new Set(prev[role] ?? [])
      if (rolePerms.has(perm)) rolePerms.delete(perm)
      else rolePerms.add(perm)
      return { ...prev, [role]: rolePerms }
    })
  }

  const toggleAll = (role: UserRole, permsInCat: PermKey[]) => {
    if (isLockedRole(role)) return
    setMatrix(prev => {
      const rolePerms = new Set(prev[role] ?? [])
      const allChecked = permsInCat.every(p => rolePerms.has(p))
      if (allChecked) permsInCat.forEach(p => rolePerms.delete(p))
      else permsInCat.forEach(p => rolePerms.add(p))
      return { ...prev, [role]: rolePerms }
    })
  }

  const handleSave = () => {
    savePermMatrix(matrix)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const handleReset = () => {
    if (!window.confirm("Réinitialiser la matrice aux valeurs par défaut ?")) return
    setMatrix(DEFAULT_MATRIX)
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Matrice des Permissions
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Définissez précisément qui peut faire quoi dans chaque module — y compris Super Admin.</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Filtrer un rôle…"
            className="px-3 py-2 rounded-lg border border-border text-sm w-48" />
          <button onClick={handleReset} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-muted transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            Réinitialiser
          </button>
          <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            Sauvegarder
          </button>
        </div>
      </div>

      {saved && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-green-800 text-sm font-semibold">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          Matrice sauvegardée avec succès.
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-4 flex-wrap text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-green-500" /> Autorisé</div>
        <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-slate-200 border border-slate-300" /> Non autorisé</div>
        <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-violet-200" /> Toujours autorisé (Super Super Admin uniquement)</div>
      </div>

      {/* Matrix by category */}
      {categories.map(category => {
        const permsInCat = PERMISSIONS.filter(p => p.category === category)
        const isExpanded = expandedCat === category || expandedCat === null

        return (
          <div key={category} className="bg-card rounded-2xl border border-border overflow-hidden">
            {/* Category header */}
            <button
              onClick={() => setExpandedCat(expandedCat === category ? null : category)}
              className="w-full flex items-center justify-between px-5 py-3.5 bg-muted/40 border-b border-border hover:bg-muted/60 transition-colors text-left">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-foreground">{category}</span>
                <span className="text-[10px] font-semibold text-muted-foreground px-2 py-0.5 rounded-full bg-muted">{permsInCat.length} permissions</span>
              </div>
              <svg className={`w-4 h-4 text-muted-foreground transition-transform ${expandedCat === null || expandedCat === category ? "" : "rotate-180"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isExpanded && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-5 py-2.5 text-left text-xs font-semibold text-muted-foreground w-56 sticky left-0 bg-card">Permission</th>
                      {visibleRoles.map(rh => (
                        <th key={rh.role} className="px-3 py-2.5 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${rh.cls}`}>{rh.label}</span>
                            {!isLockedRole(rh.role) && (
                              <button
                                onClick={() => toggleAll(rh.role, permsInCat.map(p => p.key))}
                                className="text-[9px] text-muted-foreground hover:text-foreground underline whitespace-nowrap">
                                {permsInCat.every(p => matrix[rh.role]?.has(p.key)) ? "Tout retirer" : "Tout cocher"}
                              </button>
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {permsInCat.map(perm => (
                      <tr key={perm.key} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="px-5 py-3 sticky left-0 bg-card">
                          <p className="text-sm font-medium text-foreground">{perm.label}</p>
                          {perm.desc && <p className="text-[10px] text-muted-foreground mt-0.5">{perm.desc}</p>}
                        </td>
                        {visibleRoles.map(rh => {
                          const locked = isLockedRole(rh.role)
                          const checked = matrix[rh.role]?.has(perm.key) ?? false
                          return (
                            <td key={rh.role} className="px-3 py-3 text-center">
                              <button
                                onClick={() => toggle(rh.role, perm.key)}
                                disabled={locked}
                                className={`w-6 h-6 rounded-md border-2 flex items-center justify-center mx-auto transition-all ${
                                  locked
                                    ? "bg-violet-200 border-violet-300 cursor-default"
                                    : checked
                                      ? "bg-green-500 border-green-600 hover:bg-green-600"
                                      : "bg-card border-slate-200 hover:border-slate-400"
                                }`}>
                                {(checked || locked) && (
                                  <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </button>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}

      {/* Note */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
        <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <span>
          Seul <strong>Super Super Admin</strong> ({isSuperSuperAdmin({ role: "super_super_admin" }) ? "Jawad" : "compte racine"}) a toujours accès à tout et ne peut pas être restreint —
          filet de sécurité pour ne jamais bloquer l&apos;accès à l&apos;ERP. Tous les autres rôles, y compris <strong>Super Admin</strong>, sont configurables ici.
        </span>
      </div>
    </div>
  )
}
