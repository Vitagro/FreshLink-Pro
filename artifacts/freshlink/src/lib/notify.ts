"use client"
// ════════════════════════════════════════════════════════════════════════════
//  notify — sons + notifications navigateur (appels, messages, alertes).
//  Fonctionne quand un onglet ERP est OUVERT (1er plan ou arrière-plan). Le push
//  hors-app (téléphone verrouillé) nécessiterait un service worker + Web Push.
//  L'AudioContext doit être "débloqué" par un geste utilisateur → unlockAudio().
// ════════════════════════════════════════════════════════════════════════════

let audioCtx: AudioContext | null = null
function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      audioCtx = new AC()
    }
    return audioCtx
  } catch { return null }
}

// À appeler sur un geste utilisateur (login, clic) → autorise le son ensuite.
export function unlockAudio(): void {
  const c = ctx()
  try { if (c && c.state === "suspended") void c.resume() } catch { /* noop */ }
}

// Bip court (message / alerte).
export function beep(freq = 880, ms = 180, vol = 0.18): void {
  const c = ctx(); if (!c) return
  try {
    if (c.state === "suspended") void c.resume()
    const o = c.createOscillator(), g = c.createGain()
    o.type = "sine"; o.frequency.value = freq
    g.gain.value = vol
    o.connect(g); g.connect(c.destination)
    o.start()
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + ms / 1000)
    o.stop(c.currentTime + ms / 1000)
  } catch { /* noop */ }
}

// Sonnerie d'appel (boucle de deux tons) — renvoie une fonction stop().
export function ring(): () => void {
  let stopped = false
  const tone = () => {
    if (stopped) return
    beep(880, 380, 0.22)
    setTimeout(() => { if (!stopped) beep(660, 380, 0.22) }, 430)
  }
  tone()
  const timer = setInterval(tone, 1500)
  return () => { stopped = true; clearInterval(timer) }
}

// Demande la permission de notifier (idéalement sur un geste utilisateur).
export async function requestNotifyPermission(): Promise<void> {
  try {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission()
    }
  } catch { /* noop */ }
}

// Affiche une notification navigateur (si autorisée). Optionnellement vibre.
export function notify(title: string, body?: string, tag?: string): void {
  try {
    if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return
    const n = new Notification(title, { body, tag, icon: "/icon-192.png", badge: "/icon-192.png" })
    n.onclick = () => { try { window.focus() } catch { /* noop */ } n.close() }
    setTimeout(() => { try { n.close() } catch { /* noop */ } }, 9000)
    try { navigator.vibrate?.([120, 60, 120]) } catch { /* noop */ }
  } catch { /* noop */ }
}

export function isHidden(): boolean {
  return typeof document !== "undefined" && document.hidden
}
