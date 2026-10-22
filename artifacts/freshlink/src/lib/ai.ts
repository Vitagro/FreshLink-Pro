/** All assistant requests go through the authenticated ERP backend. */
export interface MsgLike { role: string; text: string }

export async function callLLM(
  systemPrompt: string,
  history: MsgLike[],
  options: { temperature?: number; max_tokens?: number; attempt?: number; agentId?: string } = {}
): Promise<string> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 28000)
  try {
    const res = await fetch("/api/ai-chat", {
      method: "POST", credentials: "include", signal: ctrl.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system: systemPrompt, agentId: options.agentId,
        messages: history.slice(-20).map(m => ({ role: m.role, content: m.text })),
        max_tokens: options.max_tokens ?? 1500, temperature: options.temperature ?? 0.65 }),
    })
    const data = await res.json().catch(() => null)
    if (res.status === 401) throw new Error("Session expirée. Reconnectez-vous à l’ERP.")
    if (res.status === 403) throw new Error("Votre compte ne peut pas accéder au service IA.")
    if (!res.ok) throw new Error(data?.error || "Service IA indisponible. Réessayez plus tard.")
    if (!data?.ok || typeof data.text !== "string" || !data.text.trim()) {
      throw new Error("Le fournisseur IA a renvoyé une réponse vide. Réessayez.")
    }
    return data.text.trim()
  } catch (e) {
    if (ctrl.signal.aborted) throw new Error("Le service IA a dépassé le délai de réponse. Réessayez.")
    if (e instanceof TypeError) throw new Error("Connexion au serveur ERP impossible. Vérifiez votre réseau.")
    throw e
  } finally { clearTimeout(timer) }
}

/**
 * Fire-and-forget N3 alert — non-blocking
 */
export function triggerN3Alert(issue: string): void {
  callLLM(
    `Tu es le système d'alerte critique de FreshLink Pro — distribution fruits & légumes, Casablanca.
Génère un message d'alerte WhatsApp ULTRA-COURT (max 3 lignes) pour la direction (+212663898707).
Format: 🚨 [URGENCE] — [problème en 1 phrase] — [action requise immédiatement]
Sois direct, sans fioritures.`,
    [{ role: "user", text: `Problème non résolu après escalade N1 → N2: ${issue}` }],
    { max_tokens: 200, temperature: 0.3 }
  ).catch(() => { /* silent — never block the UI */ })
}
