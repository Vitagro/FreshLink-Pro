"use client"

import { useEffect, useState, useCallback, useRef } from "react"

// ══════════════════════════════════════════════════════════════════
//  BONotificationsBell — Centre de notifications BO temps réel
//   - Cloche dans le header (badge nb non-lus)
//   - Drawer latéral avec filtres par service
//   - Polling 10s + animation pop sur nouvelles notifs
//   - Mark as read individuel + global
//  Branchée sur /api/ext/notifications (table fl_notifications V3)
// ══════════════════════════════════════════════════════════════════

interface Notification {
  id: string
  service: "achats" | "sales" | "transport" | "direction" | "prevendeur" | "client" | "all"
  destinataire_id: string | null
  type: string
  titre: string
  corps: string | null
  priorite: "basse" | "normale" | "haute" | "critique"
  lu: boolean
  payload: Record<string, unknown>
  created_at: string
}

const SERVICE_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  achats:     { label: "Achats",     icon: "🛒", color: "from-blue-500 to-blue-600" },
  sales:      { label: "Commercial", icon: "💼", color: "from-emerald-500 to-green-600" },
  transport:  { label: "Transport",  icon: "🚚", color: "from-amber-500 to-orange-600" },
  direction:  { label: "Direction",  icon: "👔", color: "from-purple-500 to-indigo-600" },
  prevendeur: { label: "Prévendeur", icon: "📱", color: "from-cyan-500 to-blue-500" },
  client:     { label: "Client",     icon: "👥", color: "from-pink-500 to-rose-500" },
  all:        { label: "Général",    icon: "📢", color: "from-slate-500 to-slate-600" },
}

const PRIORITE_CONFIG: Record<string, { cls: string; ring: string; icon: string }> = {
  basse:    { cls: "text-slate-600 bg-slate-50 border-slate-200",          ring: "",                    icon: "" },
  normale:  { cls: "text-blue-700 bg-blue-50 border-blue-200",             ring: "",                    icon: "" },
  haute:    { cls: "text-amber-700 bg-amber-50 border-amber-200",          ring: "ring-1 ring-amber-200", icon: "⚠️" },
  critique: { cls: "text-rose-700 bg-rose-50 border-rose-300",             ring: "ring-2 ring-rose-300", icon: "🚨" },
}

interface Props {
  /** Filtre optionnel par service (ex: "achats" pour un user du service achats) */
  scopeService?: Notification["service"]
}

export default function BONotificationsBell({ scopeService }: Props) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const [filterService, setFilterService] = useState<string>("tous")
  const [loading, setLoading] = useState(true)
  const [popAnim, setPopAnim] = useState(false)
  const prevCountRef = useRef(0)

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (scopeService) params.set("service", scopeService)
      const url = `/api/ext/notifications${params.toString() ? "?" + params.toString() : ""}`
      const res = await fetch(url, { cache: "no-store" })
      const data = await res.json()
      if (data.ok) {
        const list = (data.data ?? []) as Notification[]
        const unread = list.filter(n => !n.lu).length
        // Animation pop si nouveau non-lu détecté
        if (unread > prevCountRef.current && prevCountRef.current > 0) {
          setPopAnim(true)
          setTimeout(() => setPopAnim(false), 600)
        }
        prevCountRef.current = unread
        setNotifications(list)
      }
    } catch { /* silencieux */ }
    finally { setLoading(false) }
  }, [scopeService])

  // Polling 10s
  useEffect(() => {
    load()
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [load])

  // ESC pour fermer
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  const markRead = async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, lu: true } : n))
    try {
      await fetch("/api/ext/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, lu: true }),
      })
    } catch { /* silencieux : l'UI optimiste a déjà marqué lu */ }
  }

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.lu)
    setNotifications(prev => prev.map(n => ({ ...n, lu: true })))
    for (const n of unread) {
      try {
        await fetch("/api/ext/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: n.id, lu: true }),
        })
      } catch { /* silencieux */ }
    }
  }

  const filtered = notifications.filter(n => filterService === "tous" || n.service === filterService)
  const unreadCount = notifications.filter(n => !n.lu).length

  const services = Object.keys(SERVICE_CONFIG) as (keyof typeof SERVICE_CONFIG)[]

  const timeAgo = (iso: string) => {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000
    if (diff < 60)         return "à l'instant"
    if (diff < 3600)       return `il y a ${Math.floor(diff / 60)} min`
    if (diff < 86400)      return `il y a ${Math.floor(diff / 3600)} h`
    return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })
  }

  return (
    <>
      {/* ── Cloche header ── */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Notifications (${unreadCount} non-lues)`}
        className={`relative inline-flex items-center justify-center w-10 h-10 rounded-xl bg-white border border-slate-200 shadow-sm hover:bg-slate-50 hover:border-slate-300 transition-all ${popAnim ? "animate-bounce" : ""}`}>
        <svg className="w-5 h-5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-gradient-to-br from-rose-500 to-red-600 text-white text-[10px] font-black flex items-center justify-center shadow-md ring-2 ring-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* ── Overlay ── */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[2000] bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
          aria-hidden="true"
        />
      )}

      {/* ── Drawer latéral ── */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Centre de notifications"
        className={`fixed top-0 right-0 z-[2001] h-full w-full sm:w-[420px] bg-white shadow-2xl flex flex-col transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}>
        {/* Header drawer */}
        <div className="relative p-5 bg-gradient-to-br from-[#0b3d1a] via-[#1a4f2a] to-[#2d7a46] text-white overflow-hidden">
          <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-emerald-400/15 blur-2xl" />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black tracking-tight">🔔 Notifications</h2>
              <p className="text-xs text-emerald-50/85 mt-1">
                {unreadCount > 0 ? `${unreadCount} non-lue${unreadCount > 1 ? "s" : ""}` : "Tout est à jour"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fermer"
              className="w-9 h-9 rounded-xl bg-white/12 hover:bg-white/20 transition-colors flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Actions */}
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="relative mt-3 w-full px-3 py-2 rounded-xl bg-white/12 backdrop-blur-sm border border-white/20 text-white text-xs font-bold hover:bg-white/20 transition-all">
              ✅ Tout marquer comme lu
            </button>
          )}
        </div>

        {/* Filtres service (chips horizontales) */}
        <div className="px-4 py-3 border-b border-slate-100 overflow-x-auto">
          <div className="flex gap-1.5 min-w-max">
            <button
              type="button"
              onClick={() => setFilterService("tous")}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-colors ${filterService === "tous" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              📋 Tous ({notifications.length})
            </button>
            {services.map(s => {
              const cfg = SERVICE_CONFIG[s]
              const count = notifications.filter(n => n.service === s).length
              if (count === 0) return null
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFilterService(s)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-colors ${filterService === s ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                  <span className="mr-1">{cfg.icon}</span>{cfg.label} ({count})
                </button>
              )
            })}
          </div>
        </div>

        {/* Liste */}
        <div className="flex-1 overflow-y-auto bg-slate-50/40">
          {loading && (
            <div className="text-center py-10 text-slate-500 text-sm">
              <span className="inline-block w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin align-middle mr-2" />
              Chargement…
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="text-center py-16 px-6">
              <div className="text-5xl mb-3">🌿</div>
              <p className="text-sm font-bold text-slate-700">Aucune notification</p>
              <p className="text-xs text-slate-500 mt-1">
                {filterService !== "tous" ? "dans ce service" : "pour le moment"}
              </p>
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <div className="flex flex-col">
              {filtered.map(n => {
                const cfg = SERVICE_CONFIG[n.service] ?? SERVICE_CONFIG.all
                const pri = PRIORITE_CONFIG[n.priorite] ?? PRIORITE_CONFIG.normale
                return (
                  <div
                    key={n.id}
                    onClick={() => !n.lu && markRead(n.id)}
                    className={`group px-4 py-3.5 border-b border-slate-100 cursor-pointer transition-colors ${n.lu ? "bg-white hover:bg-slate-50/70" : "bg-emerald-50/40 hover:bg-emerald-50"} ${pri.ring}`}>
                    <div className="flex items-start gap-3">
                      {/* Icône service */}
                      <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${cfg.color} flex items-center justify-center text-base shadow-sm shrink-0`}>
                        <span className="drop-shadow-sm">{cfg.icon}</span>
                      </div>

                      {/* Contenu */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <p className={`text-sm leading-tight ${n.lu ? "font-semibold text-slate-700" : "font-bold text-slate-900"}`}>
                            {pri.icon && <span className="mr-1">{pri.icon}</span>}
                            {n.titre}
                          </p>
                          {!n.lu && (
                            <span className="shrink-0 w-2 h-2 rounded-full bg-emerald-500 mt-1.5" aria-hidden="true" />
                          )}
                        </div>

                        {n.corps && (
                          <p className="text-xs text-slate-600 mt-1 leading-relaxed line-clamp-2">{n.corps}</p>
                        )}

                        <div className="flex items-center gap-2 flex-wrap mt-1.5">
                          <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold border ${pri.cls}`}>
                            {n.priorite}
                          </span>
                          <span className="text-[10px] text-slate-500">{timeAgo(n.created_at)}</span>
                          <span className="text-[10px] text-slate-400">· {n.type}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-100 bg-white">
          <p className="text-[10px] text-slate-400 text-center">
            🔄 Sync auto · Polling 10s · Vita Core Live
          </p>
        </div>
      </aside>
    </>
  )
}
