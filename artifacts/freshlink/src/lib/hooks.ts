/**
 * lib/hooks.ts — Phase 6 + 7 integration hooks
 *
 * Called from BOCommandesUnifiees and mobile when order status changes
 * to trigger referral conversion and tracking state transitions.
 */

/**
 * Phase 6 — Trigger referral conversion when order becomes "livre"
 * Idempotent: safe to call multiple times for the same order.
 */
export async function triggerParrainageConvert(commandeId: string) {
  try {
    const res = await fetch("/api/portal/referrals/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commandeId }),
    })
    if (!res.ok) console.warn("[Parrainage] convert failed", await res.text())
    else console.log("[Parrainage] convert fired for", commandeId)
  } catch (e) {
    console.error("[Parrainage] convert error", e)
  }
}

/**
 * Phase 7 — Push order tracking state to live channel
 * Maps order statut → pipeline step and publishes via Realtime.
 */
export async function triggerTrackingUpdate(
  commandeId: string,
  statut: string,
  tracking?: { chauffeur?: string; eta?: string; gpsLat?: number; gpsLng?: number; position?: string }
) {
  const stepMap: Record<string, string> = {
    en_attente: "recue",
    en_attente_approbation: "recue",
    valide: "preparation",
    en_transit: "route",
    livre: "livree",
  }
  const etape = stepMap[statut] || "recue"

  try {
    const res = await fetch("/api/portal/tracking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commandeId,
        etape,
        ...tracking,
      }),
    })
    if (!res.ok) console.warn("[Tracking] update failed", await res.text())
    else console.log("[Tracking] update fired for", commandeId, "→", etape)
  } catch (e) {
    console.error("[Tracking] update error", e)
  }
}

/**
 * Unified hook — call both Phase 6 + 7 when order transitions.
 * Called from order edit handlers.
 */
export async function onOrderStatusChange(
  commandeId: string,
  newStatut: string,
  tracking?: { chauffeur?: string; eta?: string; gpsLat?: number; gpsLng?: number; position?: string }
) {
  // Always push tracking state
  triggerTrackingUpdate(commandeId, newStatut, tracking)

  // Convert parrainage only when reaching "livre"
  if (newStatut === "livre") {
    triggerParrainageConvert(commandeId)
  }
}
