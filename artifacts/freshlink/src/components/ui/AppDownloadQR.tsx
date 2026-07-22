"use client"

import { useEffect, useRef, useState } from "react"

// QR + lien direct pour installer FreshLink Pro sur un téléphone — utile
// depuis le back-office desktop pour équiper rapidement un nouvel utilisateur.
// Génère le QR côté client (qrcode-generator via CDN, aucune donnée envoyée à
// un tiers) plutôt que d'ajouter une dépendance npm pour un seul composant.
const APK_URL = "https://github.com/Vitagro/FreshLink-Mobile/releases/latest/download/FreshLinkPro.apk"

declare global {
  interface Window {
    qrcode?: (typeVersion: number, errorCorrectionLevel: string) => {
      addData: (data: string) => void
      make: () => void
      createSvgTag: (opts: { cellSize: number; margin: number }) => string
    }
  }
}

let qrLibPromise: Promise<void> | null = null
function loadQrLib(): Promise<void> {
  if (window.qrcode) return Promise.resolve()
  if (qrLibPromise) return qrLibPromise
  qrLibPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script")
    s.src = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js"
    s.onload = () => resolve()
    s.onerror = () => reject(new Error("qrcode lib load failed"))
    document.head.appendChild(s)
  })
  return qrLibPromise
}

export default function AppDownloadQR() {
  const boxRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadQrLib().then(() => {
      if (cancelled || !boxRef.current || !window.qrcode) return
      try {
        const qr = window.qrcode(0, "M")
        qr.addData(APK_URL)
        qr.make()
        boxRef.current.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 4 })
      } catch {
        setError(true)
      }
    }).catch(() => setError(true))
    return () => { cancelled = true }
  }, [])

  return (
    <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 flex items-center gap-3">
      <div ref={boxRef} className="w-16 h-16 shrink-0 bg-white rounded-lg border border-border flex items-center justify-center overflow-hidden">
        {error && <span className="text-[9px] text-muted-foreground text-center px-1">QR indisponible</span>}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-foreground">📱 Application mobile</p>
        <p className="text-[11px] text-muted-foreground mb-1.5">Scannez pour installer FreshLink Pro sur Android.</p>
        <a href={APK_URL} target="_blank" rel="noopener"
          className="text-[11px] font-bold text-primary underline">
          Télécharger le fichier APK →
        </a>
      </div>
    </div>
  )
}
