"use client"

import { useEffect, useState } from "react"

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

type BannerMode = "android" | "ios" | null

export default function PWAInstall() {
  const [prompt, setPrompt]       = useState<BeforeInstallPromptEvent | null>(null)
  const [mode, setMode]           = useState<BannerMode>(null)
  const [installed, setInstalled] = useState(false)
  const [visible, setVisible]     = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return

    // Already dismissed or installed
    if (localStorage.getItem("pwa_install_dismissed") === "1") return

    // Register service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js")
        .then(reg => {
          // Tell new SW to take over immediately
          if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" })
        })
        .catch(() => {})
    }

    // iOS detection
    const ua = navigator.userAgent
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as Record<string, unknown>).MSStream
    const isInStandalone = ("standalone" in navigator) && (navigator as unknown as { standalone: boolean }).standalone

    if (isIOS && !isInStandalone) {
      // Show iOS install instructions after a short delay
      const t = setTimeout(() => { setMode("ios"); setVisible(true) }, 3000)
      return () => clearTimeout(t)
    }

    // Android / Chrome — wait for beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault()
      setPrompt(e as BeforeInstallPromptEvent)
      setMode("android")
      setVisible(true)
    }
    const installedHandler = () => setInstalled(true)

    window.addEventListener("beforeinstallprompt", handler)
    window.addEventListener("appinstalled", installedHandler)
    return () => {
      window.removeEventListener("beforeinstallprompt", handler)
      window.removeEventListener("appinstalled", installedHandler)
    }
  }, [])

  const handleInstall = async () => {
    if (!prompt) return
    await prompt.prompt()
    const choice = await prompt.userChoice
    if (choice.outcome === "accepted") setInstalled(true)
    setVisible(false)
    setPrompt(null)
  }

  const handleDismiss = () => {
    setVisible(false)
    localStorage.setItem("pwa_install_dismissed", "1")
  }

  if (installed || !visible || !mode) return null

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[200] flex justify-center px-4 pb-safe"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      <div
        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
        style={{ boxShadow: "0 -4px 40px rgba(26,79,42,0.18), 0 8px 32px rgba(0,0,0,0.12)" }}
      >
        {/* Top accent bar */}
        <div className="h-1 w-full" style={{ background: "linear-gradient(90deg, #1a4f2a, #4ADE80, #b8962e)" }} />

        <div className="p-4 flex items-start gap-3">
          {/* App Icon */}
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm overflow-hidden border border-slate-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/vita-fresh-logo.png" alt="Vita Fresh" className="w-full h-full object-cover" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800 leading-tight">
              Installer Vita Fresh
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
              {mode === "ios"
                ? "Accès rapide depuis votre écran d'accueil, même hors ligne."
                : "Ajoutez l'app sur votre écran d'accueil pour un accès rapide, même hors ligne."
              }
            </p>

            {mode === "android" && (
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleInstall}
                  className="flex-1 py-2 rounded-xl text-xs font-bold text-white transition-all active:scale-95"
                  style={{ background: "linear-gradient(135deg, #1a4f2a, #16a34a)" }}
                >
                  Installer
                </button>
                <button
                  onClick={handleDismiss}
                  className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-500 border border-slate-200 hover:bg-slate-50 transition-all"
                >
                  Plus tard
                </button>
              </div>
            )}

            {mode === "ios" && (
              <div className="mt-3 rounded-xl bg-slate-50 border border-slate-200 p-3">
                <p className="text-[11px] text-slate-600 font-semibold mb-2">Pour installer sur iPhone / iPad :</p>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 text-[11px] text-slate-600">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px] shrink-0">1</span>
                    <span>Appuyez sur <strong>Partager</strong> (icône carrée avec flèche ↑) dans Safari</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-600">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px] shrink-0">2</span>
                    <span>Sélectionnez <strong>"Sur l'écran d'accueil"</strong></span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-600">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px] shrink-0">3</span>
                    <span>Appuyez sur <strong>"Ajouter"</strong></span>
                  </div>
                </div>
                <button
                  onClick={handleDismiss}
                  className="mt-3 w-full py-2 rounded-xl text-xs font-semibold text-slate-500 border border-slate-200 hover:bg-slate-100 transition-all"
                >
                  Compris
                </button>
              </div>
            )}
          </div>

          <button
            onClick={handleDismiss}
            className="text-slate-300 hover:text-slate-500 transition-colors shrink-0 -mt-0.5 p-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
