/**
 * deviceGuard.ts — Device fingerprint-based access control (browser-safe)
 *
 * This file runs in the browser. It only exports constants and types.
 * HMAC signing functions are server-only and live in the API server.
 */

export const DEVICE_COOKIE  = "fl_device_token"
export const SADMIN_COOKIE  = "fl_sadmin_bypass"

export interface DeviceEntry {
  id:          string
  fingerprint: string
  label:       string
  userAgent?:  string
  ip?:         string
  active:      boolean
  addedAt:     string
  addedBy:     string
  lastSeen?:   string
}

/** Vérifie si un fingerprint est dans la whitelist */
export function isDeviceAllowed(
  fingerprint: string,
  whitelist: DeviceEntry[]
): boolean {
  if (whitelist.length === 0) return true
  return whitelist.some(d => d.fingerprint === fingerprint && d.active)
}

export const CLIENT_FINGERPRINT_SCRIPT = `
async function generateFingerprint() {
  const parts = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency ?? 0,
    navigator.platform ?? '',
  ]
  try {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    ctx.textBaseline = 'top'
    ctx.font = '14px Arial'
    ctx.fillText('VitaFresh🌿', 2, 2)
    parts.push(canvas.toDataURL().slice(-32))
  } catch {}
  const raw = parts.join('|')
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('')
}
`
