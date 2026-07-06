"use client"

import { useEffect, useState } from "react"

// Phase 9 — Dark mode toggle. Reads/writes the "vita-theme" key in localStorage,
// applies the `dark` class to <html>. Tailwind is configured with darkMode:['class'].

// "auto" = sombre la nuit (19h–7h), clair le jour · "system" = réglage de l'appareil
type Mode = "light" | "dark" | "system" | "auto"
const STORAGE_KEY = "vita-theme"

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false
}
// Sombre automatiquement entre 19h et 7h
function isNightTime(): boolean {
  const h = new Date().getHours()
  return h >= 19 || h < 7
}

function applyMode(mode: Mode) {
  if (typeof document === "undefined") return
  const isDark =
    mode === "dark" ||
    (mode === "system" && systemPrefersDark()) ||
    (mode === "auto" && isNightTime())
  document.documentElement.classList.toggle("dark", isDark)
  document.documentElement.style.colorScheme = isDark ? "dark" : "light"
}

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<Mode>("system")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    let current: Mode = "auto"
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Mode | null
      if (stored === "light" || stored === "dark" || stored === "system" || stored === "auto") {
        current = stored
      }
    } catch { /* localStorage blocked */ }
    setMode(current)
    applyMode(current)

    // React to system theme changes when mode === system
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = () => {
      try {
        const m = (localStorage.getItem(STORAGE_KEY) as Mode | null) ?? "auto"
        if (m === "system") applyMode("system")
      } catch { /* no-op */ }
    }
    mq.addEventListener?.("change", handler)

    // Mode "auto" : ré-évalue toutes les 10 min pour basculer jour/nuit
    const tick = setInterval(() => {
      try {
        const m = (localStorage.getItem(STORAGE_KEY) as Mode | null) ?? "auto"
        if (m === "auto") applyMode("auto")
      } catch { /* no-op */ }
    }, 10 * 60 * 1000)

    return () => { mq.removeEventListener?.("change", handler); clearInterval(tick) }
  }, [])

  const setAndApply = (m: Mode) => {
    setMode(m)
    applyMode(m)
    try { localStorage.setItem(STORAGE_KEY, m) } catch { /* no-op */ }
  }

  if (!mounted) {
    // Skeleton to avoid hydration flash
    return <div className={compact ? "h-8 w-8" : "h-9 w-24"} />
  }

  if (compact) {
    // Cycle : auto → clair → sombre → auto (l'icône reflète le mode choisi)
    const order: Mode[] = ["auto", "light", "dark"]
    const icon: Record<Mode, string> = { auto: "🕑", light: "☀️", dark: "🌙", system: "🖥" }
    const label: Record<Mode, string> = { auto: "Auto (sombre la nuit)", light: "Mode clair", dark: "Mode sombre", system: "Système" }
    const next = order[(order.indexOf(mode) + 1) % order.length] ?? "auto"
    return (
      <button
        onClick={() => setAndApply(next)}
        title={`${label[mode] ?? "Auto"} — cliquer pour : ${label[next]}`}
        aria-label="Basculer le thème"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted">
        {icon[mode] ?? "🕑"}
      </button>
    )
  }

  return (
    <div className="inline-flex items-center gap-0.5 rounded-xl border border-border bg-card p-0.5">
      {([
        { v: "light", icon: "☀️", title: "Mode clair" },
        { v: "auto", icon: "🕑", title: "Auto (sombre la nuit)" },
        { v: "system", icon: "🖥", title: "Système (appareil)" },
        { v: "dark", icon: "🌙", title: "Mode sombre" },
      ] as { v: Mode; icon: string; title: string }[]).map(o => (
        <button
          key={o.v}
          onClick={() => setAndApply(o.v)}
          title={o.title}
          aria-label={o.title}
          className={`flex h-7 w-7 items-center justify-center rounded-lg text-sm transition-colors ${
            mode === o.v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          }`}>
          {o.icon}
        </button>
      ))}
    </div>
  )
}
