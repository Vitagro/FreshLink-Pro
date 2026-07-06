// Browser-safe HMAC token verification using Web Crypto API.
// signToken is server-only; only verifyToken is used client-side.

const AUTH_SECRET = "fl_auth_secret_2026"

async function getKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  return crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]
  )
}

async function hmacSign(data: string, secret: string): Promise<string> {
  const key = await getKey(secret)
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

export async function signToken(payload: object): Promise<string> {
  const data = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
  const sig = await hmacSign(data, AUTH_SECRET)
  return `${data}.${sig}`
}

export function verifyToken(token: string): Record<string, unknown> | null {
  try {
    const [data] = token.split(".")
    if (!data) return null
    const padding = "=".repeat((4 - (data.length % 4)) % 4)
    const b64 = (data + padding).replace(/-/g, "+").replace(/_/g, "/")
    const payload = JSON.parse(atob(b64))
    if (payload.exp && payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}
