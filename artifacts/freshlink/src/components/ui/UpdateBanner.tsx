"use client"

import { useEffect, useState } from "react"
import { Capacitor } from "@capacitor/core"

// Ne concerne que l'app mobile empaquetée (Capacitor) — sans effet sur le
// back-office web classique. Compare le versionCode natif installé (App.getInfo)
// au tag de la dernière release GitHub ("v2026.07.11-8" → versionCode 8, le
// suffixe est toujours github.run_number, cf. android-release.yml).
//
// Positionné en `fixed` plutôt qu'en flux normal : ce composant est monté au
// niveau racine de l'app, au-dessus de MobileLayout/BackOfficeLayout qui
// remplissent déjà tout l'écran (h-[100dvh]) — un élément en flux normal se
// retrouverait hors-écran, invisible sans faire défiler.
const REPO = "JawadVita/FreshLink-Mobile"
const APK_URL = `https://github.com/${REPO}/releases/latest/download/FreshLinkPro.apk`

export default function UpdateBanner() {
  const [latestCode, setLatestCode] = useState<number | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let cancelled = false
    ;(async () => {
      try {
        const [{ App }, releaseRes] = await Promise.all([
          import("@capacitor/app"),
          fetch(`https://api.github.com/repos/${REPO}/releases/latest`),
        ])
        if (!releaseRes.ok) return
        const release = (await releaseRes.json()) as { tag_name?: string }
        const match = /-(\d+)$/.exec(String(release.tag_name ?? ""))
        const latest = match ? parseInt(match[1], 10) : null
        if (!latest) return
        const info = await App.getInfo()
        const current = parseInt(info.build, 10)
        if (cancelled || !Number.isFinite(current) || latest <= current) return
        try { setDismissed(window.localStorage.getItem(`fl_update_dismissed_${latest}`) === "1") } catch { /* noop */ }
        setLatestCode(latest)
      } catch { /* best-effort — pas de bannière si la vérification échoue */ }
    })()
    return () => { cancelled = true }
  }, [])

  if (latestCode == null || dismissed) return null

  const dismiss = () => {
    try { window.localStorage.setItem(`fl_update_dismissed_${latestCode}`, "1") } catch { /* noop */ }
    setDismissed(true)
  }

  return (
    <div className="fixed top-0 inset-x-0 z-[10000] flex justify-center px-3 pointer-events-none"
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}>
      <div className="pointer-events-auto flex items-center gap-2 w-full max-w-md rounded-xl border border-blue-200 bg-blue-50 text-blue-800 text-xs px-3 py-2 shadow-lg">
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        <span className="flex-1 min-w-0">
          <strong>Nouvelle version disponible.</strong>{" "}
          <a href={APK_URL} target="_blank" rel="noopener" className="underline font-semibold">Mettre à jour</a>
        </span>
        <button onClick={dismiss} className="shrink-0 p-1 -m-1 rounded hover:bg-black/5 transition-colors" aria-label="Masquer">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
