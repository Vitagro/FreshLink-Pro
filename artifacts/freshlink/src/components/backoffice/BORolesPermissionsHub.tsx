"use client"

import { useState } from "react"
import type { User } from "@/lib/store"
import BORolesPermissions from "./BORolesPermissions"
import BOPermissionsMatrix from "./BOPermissionsMatrix"

// Fusionne les deux anciens items de menu "Rôles & Permissions" (lecture
// seule) et "Matrice des Permissions" (édition fine) qui faisaient doublon
// dans la sidebar Administration — un seul item "🛡️ Rôles & Permissions"
// désormais, avec ces deux vues en onglets.
//
// IMPORTANT — sécurité : l'onglet "Matrice avancée" reste réservé à
// super_super_admin, EXACTEMENT comme l'ancien item de menu qui portait
// `superOnly: true` (voir isVisible() dans BackOfficeLayout.tsx). Ce garde
// est revérifié ici (pas seulement au niveau du menu) car ce composant est
// maintenant atteignable par n'importe quel utilisateur ayant
// `canViewDatabase` — ne pas retirer ce check.
type Tab = "overview" | "matrix"

export default function BORolesPermissionsHub({ user }: { user: User }) {
  const canEditMatrix = user.role === "super_super_admin"
  const [tab, setTab] = useState<Tab>("overview")
  const activeTab = tab === "matrix" && canEditMatrix ? "matrix" : "overview"

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 px-1">
        <button
          onClick={() => setTab("overview")}
          className={`px-4 py-2 text-sm font-bold rounded-t-xl border border-b-0 transition-colors ${
            activeTab === "overview"
              ? "bg-white border-slate-200 text-slate-900"
              : "bg-transparent border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Vue d&apos;ensemble
        </button>
        {canEditMatrix && (
          <button
            onClick={() => setTab("matrix")}
            className={`px-4 py-2 text-sm font-bold rounded-t-xl border border-b-0 transition-colors ${
              activeTab === "matrix"
                ? "bg-white border-slate-200 text-slate-900"
                : "bg-transparent border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Matrice avancée
          </button>
        )}
      </div>

      <div className="rounded-2xl rounded-tl-none bg-white border border-slate-200 -mt-4 pt-4">
        {activeTab === "matrix" ? (
          <div className="px-4 md:px-6 pb-4 md:pb-6">
            <BOPermissionsMatrix />
          </div>
        ) : (
          <BORolesPermissions />
        )}
      </div>
    </div>
  )
}
