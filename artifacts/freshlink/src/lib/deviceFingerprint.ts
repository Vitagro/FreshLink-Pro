// ════════════════════════════════════════════════════════════════════════════
//  Empreinte appareil + désignation de l'appareil « maître ».
//
//  POURQUOI : à la connexion d'un admin, l'app pousse tout le snapshot local
//  (users/articles/clients) vers Supabase. Si un 2ᵉ appareil admin a un cache
//  périmé/vide, ce push ÉCRASE la base (→ « base vide » ou « historique
//  supprimé »). On réserve donc le push complet au SEUL appareil maître ; les
//  autres restent en lecture seule (ils lisent Supabase, ne le réécrivent pas).
// ════════════════════════════════════════════════════════════════════════════

// Même algorithme que /device-blocked (generateFingerprint) — gardé identique.
export async function getDeviceFingerprint(): Promise<string> {
  if (typeof navigator === "undefined" || typeof crypto === "undefined" || !crypto.subtle) return ""
  const parts = [
    navigator.userAgent,
    navigator.language,
    `${screen.width}x${screen.height}`,
    String(screen.colorDepth),
    String(new Date().getTimezoneOffset()),
    String(navigator.hardwareConcurrency ?? 0),
    navigator.platform ?? "",
  ]
  try {
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    if (ctx) {
      ctx.textBaseline = "top"
      ctx.font = "14px Arial"
      ctx.fillText("VitaFresh🌿", 2, 2)
      parts.push(canvas.toDataURL().slice(-32))
    }
  } catch { /* canvas indisponible */ }
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts.join("|")))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("")
}

// Préfixes d'empreinte des appareils maîtres autorisés à pousser un snapshot
// complet. Par défaut : le PC super-admin de Jawad (donné dans Accès Appareils).
const MASTER_PREFIXES = ["39005d15bc271d9f59e5"]

// Override manuel : permet de désigner l'appareil courant comme maître depuis la
// console (localStorage.setItem("fl_master_device","1")) sans toucher au code.
export async function isMasterDevice(): Promise<boolean> {
  try {
    const flag = localStorage.getItem("fl_master_device")
    if (flag === "1") return true
    if (flag === "0") return false
  } catch { /* localStorage indisponible */ }
  const fp = await getDeviceFingerprint()
  if (!fp) return false
  return MASTER_PREFIXES.some(p => fp.startsWith(p))
}
