"use client"

/**
 * RoleSwitcher — Quick toggle between multiple roles for multi-role users.
 *
 * Displays a compact pill/button strip. Clicking a role immediately switches
 * the active view without logout. Only rendered when user.roles has ≥ 2 entries.
 */

import { useState } from "react"
import { store, type User, type UserRole } from "@/lib/store"
import { ROLE_LABELS_FR } from "@/lib/rolePermissions"

interface Props {
  user: User
  onSwitch: (updated: User, newRole: UserRole) => void
  /** Orientation of the switcher pill */
  layout?: "horizontal" | "vertical"
  /** Optional extra class */
  className?: string
}

const ROLE_ICON: Partial<Record<UserRole, string>> = {
  acheteur:    "🛒",
  prevendeur:  "📋",
  livreur:     "🚚",
  magasinier:  "📦",
  cash_man:    "💵",
  financier:   "📊",
  admin:       "⚙️",
  super_admin: "🔑",
}

export default function RoleSwitcher({ user, onSwitch, layout = "horizontal", className = "" }: Props) {
  const roles: UserRole[] = user.roles && user.roles.length >= 2
    ? user.roles
    : []

  const active = user.activeRole ?? user.role

  const [switching, setSwitching] = useState<UserRole | null>(null)

  if (roles.length < 2) return null   // nothing to switch

  async function handleSwitch(role: UserRole) {
    if (role === active) return
    setSwitching(role)
    try {
      const updated = store.switchActiveRole(user.id, role)
      if (updated) onSwitch(updated, role)
    } finally {
      setSwitching(null)
    }
  }

  return (
    <div
      className={`flex ${layout === "vertical" ? "flex-col" : "flex-row"} gap-1 ${className}`}
      role="group"
      aria-label="Changer de rôle actif"
    >
      {roles.map(role => {
        const isActive = role === active
        const isLoading = switching === role
        return (
          <button
            key={role}
            onClick={() => handleSwitch(role)}
            disabled={isLoading}
            title={ROLE_LABELS_FR[role] ?? role}
            className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold
                       transition-all duration-200 select-none focus:outline-none"
            style={{
              background: isActive
                ? "linear-gradient(135deg,#1a4f2a,#2d7a46)"
                : "rgba(255,255,255,0.07)",
              color: isActive ? "#ffffff" : "#94a3b8",
              border: isActive
                ? "1px solid rgba(74,222,128,0.4)"
                : "1px solid rgba(255,255,255,0.08)",
              boxShadow: isActive ? "0 0 12px rgba(26,79,42,0.5)" : "none",
              opacity: isLoading ? 0.6 : 1,
              cursor: isLoading ? "wait" : isActive ? "default" : "pointer",
              minWidth: 80,
            }}
          >
            <span className="text-sm leading-none">
              {ROLE_ICON[role] ?? "👤"}
            </span>
            <span className="leading-none truncate" style={{ maxWidth: 100 }}>
              {ROLE_LABELS_FR[role] ?? role}
            </span>
            {isActive && (
              <span
                className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
                style={{ background: "#4ade80", boxShadow: "0 0 6px #4ade80" }}
              />
            )}
            {isLoading && (
              <svg className="w-3 h-3 animate-spin ml-1" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"
                  strokeDasharray="60" strokeDashoffset="20" />
              </svg>
            )}
          </button>
        )
      })}
    </div>
  )
}
