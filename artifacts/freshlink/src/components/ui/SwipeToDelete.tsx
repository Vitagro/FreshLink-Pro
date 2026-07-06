"use client"

import { useRef, useState } from "react"

interface Props {
  onDelete: () => void
  children: React.ReactNode
  label?: string
  confirmLabel?: string
  disabled?: boolean
}

const THRESHOLD = 90 // px de swipe avant de révéler l'action
const MAX_DRAG = 140

// Swipe-à-gauche-pour-supprimer, pensé pour un usage au pouce sur le terrain
// (magasinier/livreur/prévendeur). Deux étapes volontaires : swipe révèle le
// bouton rouge, TAP sur le bouton confirme — évite une suppression déclenchée
// par un swipe accidentel pendant le défilement de la liste.
export default function SwipeToDelete({ onDelete, children, label = "Supprimer", confirmLabel = "Confirmer", disabled = false }: Props) {
  const [dragX, setDragX] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const startX = useRef<number | null>(null)
  const dragging = useRef(false)

  const onTouchStart = (e: React.TouchEvent) => {
    if (disabled) return
    startX.current = e.touches[0].clientX
    dragging.current = true
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current || startX.current === null) return
    const dx = e.touches[0].clientX - startX.current
    if (dx < 0) setDragX(Math.max(dx, -MAX_DRAG))
  }
  const onTouchEnd = () => {
    dragging.current = false
    startX.current = null
    if (dragX <= -THRESHOLD) { setDragX(-MAX_DRAG); setRevealed(true) }
    else { setDragX(0); setRevealed(false) }
  }

  const reset = () => { setDragX(0); setRevealed(false); setConfirming(false) }

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div className="absolute inset-y-0 right-0 flex items-center px-3" style={{ width: MAX_DRAG }}>
        <button
          onClick={() => { if (confirming) { onDelete(); reset() } else { setConfirming(true) } }}
          className={`w-full h-full rounded-xl text-white text-xs font-bold flex items-center justify-center ${confirming ? "bg-red-700" : "bg-red-500"}`}>
          {confirming ? confirmLabel : label}
        </button>
      </div>
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={() => { if (revealed) reset() }}
        style={{ transform: `translateX(${dragX}px)`, transition: dragging.current ? "none" : "transform 0.2s ease" }}
        className="relative bg-inherit">
        {children}
      </div>
    </div>
  )
}
