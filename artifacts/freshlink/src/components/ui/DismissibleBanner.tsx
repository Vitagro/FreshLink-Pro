import { useState, type ReactNode } from "react"

type Tone = "amber" | "blue" | "rose"

const TONE_CLASSES: Record<Tone, string> = {
  amber: "bg-amber-50 border-amber-200 text-amber-800",
  blue: "bg-blue-50 border-blue-200 text-blue-800",
  rose: "bg-rose-50 border-rose-200 text-rose-800",
}

interface DismissibleBannerProps {
  /** Unique key used to persist the collapsed state in localStorage. */
  id: string
  tone?: Tone
  icon: ReactNode
  children: ReactNode
}

const isMobileViewport = () =>
  typeof window !== "undefined" && window.innerWidth < 640

export default function DismissibleBanner({ id, tone = "amber", icon, children }: DismissibleBannerProps) {
  const storageKey = `fl_banner_collapsed_${id}`

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false
    const stored = window.localStorage.getItem(storageKey)
    // First run: default to collapsed on mobile so the banner doesn't eat screen space.
    return stored !== null ? stored === "1" : isMobileViewport()
  })

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev
      window.localStorage.setItem(storageKey, next ? "1" : "0")
      return next
    })
  }

  const toneClass = TONE_CLASSES[tone]

  if (collapsed) {
    return (
      <button
        onClick={toggle}
        className={`flex items-center justify-center gap-1 w-full px-3 py-0.5 border-b text-[10px] shrink-0 opacity-70 hover:opacity-100 transition-opacity ${toneClass}`}
        aria-label="Afficher l'alerte"
        title="Afficher l'alerte"
      >
        <span className="w-3 h-3 shrink-0 [&>svg]:w-full [&>svg]:h-full">{icon}</span>
        <svg className="w-2.5 h-2.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    )
  }

  return (
    <div className={`flex items-center gap-2 px-4 py-2 border-b text-xs shrink-0 ${toneClass}`}>
      <span className="w-3.5 h-3.5 shrink-0 [&>svg]:w-full [&>svg]:h-full">{icon}</span>
      <span className="flex-1 min-w-0">{children}</span>
      <button
        onClick={toggle}
        className="shrink-0 p-1 -m-1 rounded hover:bg-black/5 transition-colors"
        aria-label="Masquer l'alerte"
        title="Masquer l'alerte"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
