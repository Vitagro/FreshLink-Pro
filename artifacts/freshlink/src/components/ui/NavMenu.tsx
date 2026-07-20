"use client"

/**
 * NavMenu — bouton de navigation GPS qui laisse le choix de l'app à ouvrir :
 * GPS (méthode actuelle de l'app), Google Maps, ou Waze. Remplace les liens
 * Google Maps codés en dur ; le style/contenu du déclencheur est fourni par
 * l'appelant (children) pour rester visuellement identique à chaque écran.
 *
 * Le menu est rendu via un portail dans document.body (position fixed,
 * calculée depuis getBoundingClientRect du déclencheur) — plusieurs écrans
 * appelants (ex. DeliveryCard) ont un ancêtre `overflow-hidden` qui aurait
 * autrement rogné un menu simplement `position: absolute`.
 */

import { useState, useRef, useEffect, type ReactNode, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import { openNavigation, NAV_METHOD_LABELS, type NavMethod } from "@/lib/navigation"

interface Props {
  lat: number
  lng: number
  children: ReactNode
  className?: string
  triggerClassName?: string
  triggerStyle?: CSSProperties
  title?: string
  menuAlign?: "left" | "right"
}

export default function NavMenu({ lat, lng, children, className, triggerClassName, triggerStyle, title, menuAlign = "right" }: Props) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({
        top: r.bottom + window.scrollY + 4,
        left: menuAlign === "right" ? r.right + window.scrollX - 224 : r.left + window.scrollX,
      })
    }
    setOpen(o => !o)
  }

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [open])

  const choose = (m: NavMethod) => {
    setOpen(false)
    openNavigation(m, lat, lng)
  }

  return (
    <div className={`inline-block ${className ?? ""}`}>
      <button ref={btnRef} type="button" title={title}
        onClick={e => { e.stopPropagation(); toggle() }}
        className={triggerClassName} style={triggerStyle}>
        {children}
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div ref={menuRef}
          style={{ position: "absolute", top: pos.top, left: pos.left, width: 224 }}
          className="z-50 rounded-xl border border-border bg-card shadow-xl overflow-hidden"
          onClick={e => e.stopPropagation()}>
          {(Object.keys(NAV_METHOD_LABELS) as NavMethod[]).map(m => (
            <button key={m} type="button" onClick={() => choose(m)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted text-left transition-colors">
              <span className="text-base">{NAV_METHOD_LABELS[m].icon}</span>
              {NAV_METHOD_LABELS[m].label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
