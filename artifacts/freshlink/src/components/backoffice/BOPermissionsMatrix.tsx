"use client"

import { useState } from "react"
import { type UserRole, ROLE_LABELS } from "@/lib/store"

// ── Permission definitions ─────────────────────────────────────────────────

type PermKey =
  // Account approvals (portail externe)
  | "approuver_compte_client"
  | "approuver_compte_fournisseur"
  | "rejeter_demande_compte"
  | "creer_compte_manuellement"
  // Articles
  | "activer_article"
  | "desactiver_article"
  | "supprimer_article"
  | "modifier_article"
  | "catalogue_toggle"
  // Web integration
  | "voir_api_config"
  | "modifier_api_config"
  // Users
  | "creer_utilisateur"
  | "modifier_utilisateur"
  | "desactiver_utilisateur"

interface PermDef {
  key: PermKey
  label: string
  desc: string
  category: string
}

const PERMISSIONS: PermDef[] = [
  // Portail externe
  { key: "approuver_compte_client",      category: "Portail Client/Fournisseur", label: "Approuver compte Client",      desc: "Valider une demande de compte client et créer le profil" },
  { key: "approuver_compte_fournisseur", category: "Portail Client/Fournisseur", label: "Approuver compte Fournisseur", desc: "Valider une demande de compte fournisseur" },
  { key: "rejeter_demande_compte",       category: "Portail Client/Fournisseur", label: "Rejeter une demande",          desc: "Refuser une demande de création de compte" },
  { key: "creer_compte_manuellement",    category: "Portail Client/Fournisseur", label: "Créer compte manuellement",   desc: "Créer un compte client/fournisseur sans demande externe" },
  // Articles
  { key: "activer_article",   category: "Gestion Articles", label: "Activer un article",             desc: "Remettre en service un article désactivé" },
  { key: "desactiver_article",category: "Gestion Articles", label: "Désactiver un article",          desc: "Désactiver stock + catalogue d'un article" },
  { key: "supprimer_article", category: "Gestion Articles", label: "Supprimer définitivement",       desc: "Suppression irréversible d'un article" },
  { key: "modifier_article",  category: "Gestion Articles", label: "Modifier un article",            desc: "Éditer prix, stock, photos, famille…" },
  { key: "catalogue_toggle",  category: "Gestion Articles", label: "Catalogue portail on/off",       desc: "Afficher/masquer un article sur le portail externe" },
  // Web API
  { key: "voir_api_config",    category: "Intégration Web", label: "Voir configuration API",         desc: "Consulter la clé API et les endpoints" },
  { key: "modifier_api_config",category: "Intégration Web", label: "Modifier configuration API",     desc: "Générer clé, activer/désactiver, gérer origines CORS" },
  // Utilisateurs
  { key: "creer_utilisateur",    category: "Gestion Utilisateurs", label: "Créer un utilisateur",    desc: "Ajouter un nouveau compte utilisateur ERP" },
  { key: "modifier_utilisateur", category: "Gestion Utilisateurs", label: "Modifier un utilisateur", desc: "Changer rôle, mot de passe, accès…" },
  { key: "desactiver_utilisateur",category:"Gestion Utilisateurs", label: "Désactiver un utilisateur",desc: "Bloquer l'accès d'un compte" },
]

// ── Matrix: which roles have which permissions ─────────────────────────────

type PermMatrix = Partial<Record<UserRole, Set<PermKey>>>

const DEFAULT_MATRIX: PermMatrix = {
  super_super_admin: new Set(PERMISSIONS.map(p => p.key)),
  super_admin:       new Set(PERMISSIONS.map(p => p.key)),
  admin: new Set([
    "approuver_compte_client", "approuver_compte_fournisseur",
    "rejeter_demande_compte",  "creer_compte_manuellement",
    "activer_article", "desactiver_article", "supprimer_article", "modifier_article", "catalogue_toggle",
    "voir_api_config", "modifier_api_config",
    "creer_utilisateur", "modifier_utilisateur", "desactiver_utilisateur",
  ]),
  resp_commercial: new Set([
    "approuver_compte_client", "rejeter_demande_compte",
    "creer_compte_manuellement",
    "catalogue_toggle",
    "modifier_article",
  ]),
  resp_logistique: new Set([
    "activer_article", "desactiver_article", "modifier_article", "catalogue_toggle",
    "approuver_compte_fournisseur", "rejeter_demande_compte",
  ]),
  acheteur: new Set([
    "approuver_compte_fournisseur", "rejeter_demande_compte",
    "modifier_article",
  ]),
}

const EDITABLE_ROLES: UserRole[] = [
  "admin", "resp_commercial", "resp_logistique", "acheteur",
  "financier", "resp_achat",
]

const LS_KEY = "fl_permissions_matrix"

function loadMatrix(): PermMatrix {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return DEFAULT_MATRIX
    const parsed = JSON.parse(raw)
    const result: PermMatrix = {}
    for (const [role, perms] of Object.entries(parsed)) {
      result[role as UserRole] = new Set(perms as PermKey[])
    }
    // Always enforce full access for super admins
    result["super_super_admin"] = new Set(PERMISSIONS.map(p => p.key))
    result["super_admin"] = new Set(PERMISSIONS.map(p => p.key))
    return result
  } catch {
    return DEFAULT_MATRIX
  }
}

function saveMatrix(m: PermMatrix) {
  const serializable: Record<string, PermKey[]> = {}
  for (const [role, perms] of Object.entries(m)) {
    serializable[role] = [...(perms ?? [])]
  }
  localStorage.setItem(LS_KEY, JSON.stringify(serializable))
}

// ── Component ──────────────────────────────────────────────────────────────

export function hasPermission(role: UserRole, perm: PermKey): boolean {
  const m = loadMatrix()
  return m[role]?.has(perm) ?? false
}

export default function BOPermissionsMatrix() {
  const [matrix, setMatrix] = useState<PermMatrix>(() => {
    if (typeof window !== "undefined") return loadMatrix()
    return DEFAULT_MATRIX
  })
  const [saved, setSaved] = useState(false)
  const [expandedCat, setExpandedCat] = useState<string | null>(null)

  const categories = Array.from(new Set(PERMISSIONS.map(p => p.category)))

  const toggle = (role: UserRole, perm: PermKey) => {
    if (role === "super_super_admin" || role === "super_admin") return // immutable
    setMatrix(prev => {
      const rolePerms = new Set(prev[role] ?? [])
      if (rolePerms.has(perm)) rolePerms.delete(perm)
      else rolePerms.add(perm)
      return { ...prev, [role]: rolePerms }
    })
  }

  const toggleAll = (role: UserRole, permsInCat: PermKey[]) => {
    if (role === "super_super_admin" || role === "super_admin") return
    setMatrix(prev => {
      const rolePerms = new Set(prev[role] ?? [])
      const allChecked = permsInCat.every(p => rolePerms.has(p))
      if (allChecked) permsInCat.forEach(p => rolePerms.delete(p))
      else permsInCat.forEach(p => rolePerms.add(p))
      return { ...prev, [role]: rolePerms }
    })
  }

  const handleSave = () => {
    saveMatrix(matrix)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const handleReset = () => {
    if (!window.confirm("Réinitialiser la matrice aux valeurs par défaut ?")) return
    setMatrix(DEFAULT_MATRIX)
  }

  const ROLE_HEADERS: { role: UserRole; label: string; cls: string }[] = [
    { role: "super_admin",    label: "Super Admin",    cls: "bg-violet-100 text-violet-700" },
    { role: "admin",          label: "Admin",          cls: "bg-blue-100 text-blue-700" },
    { role: "resp_commercial",label: "Resp. Comm.",    cls: "bg-green-100 text-green-700" },
    { role: "resp_logistique",label: "Resp. Logist.",  cls: "bg-amber-100 text-amber-700" },
    { role: "acheteur",       label: "Acheteur",       cls: "bg-orange-100 text-orange-700" },
    { role: "financier",      label: "Financier",      cls: "bg-rose-100 text-rose-700" },
  ]

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
          <p className="text-sm text-muted-foreground mt-1">Définissez précisément qui peut faire quoi dans chaque module.</p>
        </div>
        <div className="flex gap-2">
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
        <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-violet-200" /> Toujours autorisé (Super Admin)</div>
      </div>

      {/* Matrix by category */}
      {categories.map(cat => {
        const permsInCat = PERMISSIONS.filter(p => p.category === cat)
        const isExpanded = expandedCat === cat || expandedCat === null

        return (
          <div key={cat} className="bg-card rounded-2xl border border-border overflow-hidden">
            {/* Category header */}
            <button
              onClick={() => setExpandedCat(expandedCat === cat ? null : cat)}
              className="w-full flex items-center justify-between px-5 py-3.5 bg-muted/40 border-b border-border hover:bg-muted/60 transition-colors text-left">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-foreground">{cat}</span>
                <span className="text-[10px] font-semibold text-muted-foreground px-2 py-0.5 rounded-full bg-muted">{permsInCat.length} permissions</span>
              </div>
              <svg className={`w-4 h-4 text-muted-foreground transition-transform ${expandedCat === null || expandedCat === cat ? "" : "rotate-180"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-5 py-2.5 text-left text-xs font-semibold text-muted-foreground w-56">Permission</th>
                    {ROLE_HEADERS.map(rh => (
                      <th key={rh.role} className="px-3 py-2.5 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${rh.cls}`}>{rh.label}</span>
                          {/* Toggle all in category */}
                          {rh.role !== "super_super_admin" && rh.role !== "super_admin" && (
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
                      <td className="px-5 py-3">
                        <p className="text-sm font-medium text-foreground">{perm.label}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{perm.desc}</p>
                      </td>
                      {ROLE_HEADERS.map(rh => {
                        const isLocked = rh.role === "super_super_admin" || rh.role === "super_admin"
                        const checked = matrix[rh.role]?.has(perm.key) ?? false
                        return (
                          <td key={rh.role} className="px-3 py-3 text-center">
                            <button
                              onClick={() => toggle(rh.role, perm.key)}
                              disabled={isLocked}
                              className={`w-6 h-6 rounded-md border-2 flex items-center justify-center mx-auto transition-all ${
                                isLocked
                                  ? "bg-violet-200 border-violet-300 cursor-default"
                                  : checked
                                    ? "bg-green-500 border-green-600 hover:bg-green-600"
                                    : "bg-card border-slate-200 hover:border-slate-400"
                              }`}>
                              {(checked || isLocked) && (
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
          </div>
        )
      })}

      {/* Note */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
        <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <span>Les rôles <strong>Super Super Admin</strong> et <strong>Super Admin</strong> ont toujours accès à tout et ne peuvent pas être restreints. Les permissions sont vérifiées à chaque action sensible dans l'ERP.</span>
      </div>
    </div>
  )
}
