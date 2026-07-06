"use client"

import { useState } from "react"
import { store, User, ROLE_LABELS, isSuperSuperAdmin } from "@/lib/store"
import { Camera, Lock, Unlock, Shield } from "lucide-react"

export default function CameraPermissionsPanel({ currentUser }: { currentUser: User }) {
  // Seul le SUPER SUPER ADMIN peut accorder/révoquer le droit caméra.
  const isSuperAdmin = isSuperSuperAdmin(currentUser)
  const [users] = useState<User[]>(() => store.getUsers())
  const [perms, setPerms] = useState<Record<string, boolean>>(() => store.getCameraPermissions())

  const toggle = (userId: string, currentVal: boolean) => {
    if (!isSuperAdmin) return
    const newVal = !currentVal
    store.grantCamera(userId, newVal)
    setPerms(prev => ({ ...prev, [userId]: newVal }))
  }

  const hasCamera = (u: User) => {
    if (u.role === "super_super_admin") return true
    return perms[u.id] === true
  }

  const eligible = users.filter(u =>
    !["fournisseur", "client"].includes(u.role) && u.role !== "super_super_admin"
  )

  return (
    <div className="h-full flex flex-col gap-4 p-4" style={{ background: "#080c14" }}>
      {/* Header */}
      <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: "#0d1a2e", border: "1px solid #1d3a5e" }}>
        <Shield className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold" style={{ color: "#f1f5f9" }}>Gestion des Droits Caméra</p>
          <p className="text-xs mt-0.5" style={{ color: "#4b5563" }}>
            Le Super Super Admin est le seul à pouvoir accorder ou révoquer l&apos;accès caméra pour les autres utilisateurs. Aucun autre rôle ne peut modifier ces permissions.
          </p>
          {!isSuperAdmin && (
            <p className="text-xs mt-2 font-semibold" style={{ color: "#ef4444" }}>
              Accès lecture seule — seul le Super Super Admin peut modifier ces permissions.
            </p>
          )}
        </div>
      </div>

      {/* Super admin always has camera */}
      <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: "#0d2e18", border: "1px solid #15352a" }}>
        <Camera className="w-4 h-4 text-emerald-400" />
        <div className="flex-1">
          <p className="text-xs font-bold" style={{ color: "#6ee7b7" }}>Super Super Admin — Accès caméra permanent</p>
          <p className="text-[10px]" style={{ color: "#374151" }}>Ce droit ne peut pas être retiré</p>
        </div>
        <Unlock className="w-4 h-4 text-emerald-400" />
      </div>

      {/* Users list */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {eligible.map(u => {
          const granted = hasCamera(u)
          return (
            <div
              key={u.id}
              className="flex items-center gap-3 p-3 rounded-xl transition-colors"
              style={{ background: "#0f1623", border: `1px solid ${granted ? "#10b98130" : "#1a2535"}` }}
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-white flex-shrink-0" style={{ background: granted ? "linear-gradient(135deg,#10b981,#059669)" : "linear-gradient(135deg,#374151,#1f2937)" }}>
                {(u.name?.[0] ?? "?").toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: "#f1f5f9" }}>{u.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "#0a0f18", color: "#4b5563", border: "1px solid #1a2535" }}>
                    {ROLE_LABELS[u.role]}
                  </span>
                  <span className="text-[10px]" style={{ color: "#4b5563" }}>{u.email}</span>
                </div>
              </div>
              <div className="flex items-center gap-2.5 flex-shrink-0">
                <div className="flex items-center gap-1.5">
                  {granted
                    ? <Camera className="w-3.5 h-3.5 text-emerald-400" />
                    : <Lock className="w-3.5 h-3.5" style={{ color: "#6b7280" }} />
                  }
                  <span className="text-xs font-medium" style={{ color: granted ? "#10b981" : "#6b7280" }}>
                    {granted ? "Autorisé" : "Refusé"}
                  </span>
                </div>
                <button
                  onClick={() => toggle(u.id, granted)}
                  disabled={!isSuperAdmin}
                  className="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: granted ? "#10b981" : "#374151" }}
                  title={!isSuperAdmin ? "Seul le Super Admin peut modifier cette permission" : ""}
                >
                  <span
                    className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200"
                    style={{ transform: granted ? "translateX(18px)" : "translateX(2px)", marginTop: "2px" }}
                  />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { l: "Avec accès", v: eligible.filter(u => hasCamera(u)).length + 1, c: "#10b981" },
          { l: "Sans accès", v: eligible.filter(u => !hasCamera(u)).length, c: "#ef4444" },
          { l: "Total utilisateurs", v: eligible.length + 1, c: "#6366f1" },
        ].map(s => (
          <div key={s.l} className="rounded-xl p-3 text-center" style={{ background: "#0f1623", border: "1px solid #1a2535" }}>
            <p className="text-xl font-bold" style={{ color: s.c }}>{s.v}</p>
            <p className="text-[10px] mt-0.5" style={{ color: "#4b5563" }}>{s.l}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
