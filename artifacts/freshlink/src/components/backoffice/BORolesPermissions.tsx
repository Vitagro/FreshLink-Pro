"use client"

import { useMemo, useState } from "react"
import type { UserRole } from "@/lib/store"
import { autoAssignPermissions, ROLE_LABELS_FR, type RolePermissions } from "@/lib/rolePermissions"

// ══════════════════════════════════════════════════════════════════════════════
// Rôles & Permissions — matrice RBAC en lecture (séparée de la gestion des
// Utilisateurs). Source unique : lib/rolePermissions.ts — ces droits sont
// assignés AUTOMATIQUEMENT à la création d'un compte et au changement de rôle.
// Les ajustements individuels se font dans Administration → Utilisateurs.
// ══════════════════════════════════════════════════════════════════════════════

const MODULES: { key: keyof RolePermissions; label: string; emoji: string }[] = [
  { key: "canViewCommercial",   label: "Commercial",   emoji: "🛒" },
  { key: "canViewAchat",        label: "Achats",       emoji: "🛍️" },
  { key: "canViewLogistique",   label: "Logistique",   emoji: "🚚" },
  { key: "canViewStock",        label: "Stock",        emoji: "📦" },
  { key: "canViewCash",         label: "Cash",         emoji: "💵" },
  { key: "canViewFinance",      label: "Finance",      emoji: "💰" },
  { key: "canViewRH",           label: "RH",           emoji: "🧑‍💼" },
  { key: "canViewRecap",        label: "Récap",        emoji: "📊" },
  { key: "canViewExternal",     label: "Tiers",        emoji: "🤝" },
  { key: "canViewDatabase",     label: "Admin/DB",     emoji: "🗄️" },
  { key: "canCreateCommandeBO", label: "Créer Cmd",    emoji: "➕" },
  { key: "canViewInvestisseur", label: "Investisseur", emoji: "🔒" },
]

const GROUPES: { titre: string; roles: UserRole[] }[] = [
  { titre: "Direction & Admin", roles: ["super_super_admin", "super_admin", "admin", "it_admin", "auditeur"] },
  { titre: "Commercial",        roles: ["resp_commercial", "team_leader", "prevendeur", "suivi_commande", "charge_recouvrement"] },
  { titre: "Achats",            roles: ["resp_achat", "acheteur", "ctrl_achat"] },
  { titre: "Logistique & Stock",roles: ["resp_logistique", "chef_depot", "magasinier", "dispatcheur", "livreur", "conducteur", "preparateur", "ctrl_prep", "qualite"] },
  { titre: "Finance & RH",      roles: ["financier", "comptable", "cash_man", "rh_manager"] },
  { titre: "Externes",          roles: ["client", "client_proprietaire", "client_gerant", "fournisseur", "investisseur"] },
]

const ACCESS_LABEL: Record<string, { txt: string; cls: string }> = {
  both:       { txt: "BO + Mobile", cls: "bg-violet-100 text-violet-700" },
  backoffice: { txt: "Back-office", cls: "bg-blue-100 text-blue-700" },
  mobile:     { txt: "Mobile",      cls: "bg-emerald-100 text-emerald-700" },
}

export default function BORolesPermissions() {
  const [search, setSearch] = useState("")

  const matrix = useMemo(() => {
    const out: { role: UserRole; label: string; perms: RolePermissions }[] = []
    GROUPES.forEach(g => g.roles.forEach(role => {
      out.push({ role, label: ROLE_LABELS_FR[role] ?? role, perms: autoAssignPermissions(role) })
    }))
    return out
  }, [])

  const q = search.trim().toLowerCase()

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">🛡️ Rôles & Permissions</h1>
          <p className="text-sm text-slate-500 mt-1">
            Droits assignés <strong>automatiquement</strong> par profil à la création d&apos;un compte.
            Ajustements individuels : Administration → <strong>Utilisateurs</strong>.
          </p>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Filtrer un rôle…"
          className="px-3 py-2 rounded-lg border border-slate-200 text-sm w-56" />
      </div>

      {/* Process d'assignation */}
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 text-xs text-emerald-900 leading-relaxed">
        <strong>Processus :</strong> création / changement de rôle → <code className="bg-white px-1 rounded">autoAssignPermissions(rôle)</code> applique
        les modules ci-dessous + le type d&apos;accès (Mobile / Back-office / les deux). Multi-rôles : les droits se cumulent.
        🔒 Investisseur n&apos;est jamais auto-accordé (octroi manuel super admin uniquement).
      </div>

      {GROUPES.map(g => {
        const rows = matrix.filter(m => g.roles.includes(m.role) && (!q || m.label.toLowerCase().includes(q) || m.role.includes(q)))
        if (!rows.length) return null
        return (
          <div key={g.titre} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
              <h2 className="text-sm font-bold text-slate-700">{g.titre}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-4 py-2 text-[11px] font-semibold text-slate-500 sticky left-0 bg-white">Rôle</th>
                    <th className="px-2 py-2 text-[11px] font-semibold text-slate-500">Accès</th>
                    {MODULES.map(m => (
                      <th key={m.key} className="px-1.5 py-2 text-[10px] font-semibold text-slate-500 text-center" title={m.label}>
                        <span className="block">{m.emoji}</span>{m.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const acc = ACCESS_LABEL[String(r.perms.accessType ?? "mobile")] ?? ACCESS_LABEL.mobile
                    return (
                      <tr key={r.role} className="border-b border-slate-50 hover:bg-slate-50/60">
                        <td className="px-4 py-2 sticky left-0 bg-white">
                          <p className="font-semibold text-slate-900">{r.label}</p>
                          <p className="text-[10px] font-mono text-slate-400">{r.role}</p>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${acc.cls}`}>{acc.txt}</span>
                        </td>
                        {MODULES.map(m => (
                          <td key={m.key} className="px-1.5 py-2 text-center">
                            {r.perms[m.key]
                              ? <span className="inline-block w-5 h-5 rounded-md bg-emerald-100 text-emerald-700 text-xs leading-5 font-bold">✓</span>
                              : <span className="inline-block w-5 h-5 rounded-md bg-slate-50 text-slate-300 text-xs leading-5">·</span>}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      <p className="text-[11px] text-slate-400">
        Pour modifier les droits par défaut d&apos;un rôle : <code>lib/rolePermissions.ts</code> ·
        Documentation complète : <code>docs/RBAC-DROITS-PROFILS.md</code>
      </p>
    </div>
  )
}
