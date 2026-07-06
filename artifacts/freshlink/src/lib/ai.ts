/**
 * FreshLink Pro — Shared AI/LLM Helper
 * 
 * Provides a robust, model-agnostic callLLM function with:
 * - Anthropic Claude (primary, via direct API)  
 * - OpenRouter fallback chain (if ANTHROPIC_API_KEY not set)
 * - Automatic retry with exponential backoff
 * - Optimized parameters for fruit/vegetable distribution context
 */

export interface MsgLike { role: string; text: string }

// ── Anthropic via proxy serveur (/api/ai-chat) ────────────────────────────────
// La clé ANTHROPIC_API_KEY reste côté serveur (SetEnv Hostinger) — jamais dans
// le bundle client. Voir artifacts/api-server/src/routes/aiChat.ts.

// ── OpenRouter fallback chain ─────────────────────────────────────────────────
const OR_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
const OR_KEY      = import.meta.env.VITE_OPENROUTER_KEY ?? ""

// Updated model chain — claude-sonnet-4 → haiku → gpt-4o-mini → gemini
const OR_MODEL_CHAIN = [
  "anthropic/claude-sonnet-4",          // Meilleure qualité raisonnement métier
  "anthropic/claude-3-5-haiku",         // Rapide + économique
  "openai/gpt-4o-mini",                 // Bon fallback
  "google/gemini-flash-1.5",            // Dernier recours
]

// ── Legacy BlackBox endpoint (kept for backward compat) ───────────────────────
const BB_ENDPOINT = "https://llm.blackbox.ai/chat/completions"
const BB_CUSTOMER_ID = import.meta.env.VITE_BLACKBOX_CUSTOMER_ID ?? "cus_TSL8iYLtbslUQB"
const BB_API_KEY     = import.meta.env.VITE_BLACKBOX_API_KEY ?? "xxx"
const BB_HEADERS  = {
  "Content-Type": "application/json",
  "customerId": BB_CUSTOMER_ID,
  "Authorization": `Bearer ${BB_API_KEY}`,
}
const BB_MODEL_CHAIN = [
  "openrouter/claude-sonnet-4",
  "openrouter/anthropic/claude-3.5-haiku",
  "openrouter/openai/gpt-4o-mini",
  "openrouter/google/gemini-flash-1.5",
]

/**
 * Main LLM call — tries Anthropic direct first, then OpenRouter, then BlackBox
 * 
 * @param systemPrompt  The agent's persona and context
 * @param history       Conversation history (max last 20 messages used)
 * @param options       Optional overrides for temperature, max_tokens
 */
export async function callLLM(
  systemPrompt: string,
  history: MsgLike[],
  options: { temperature?: number; max_tokens?: number; attempt?: number } = {}
): Promise<string> {
  const { temperature = 0.65, max_tokens = 1500, attempt = 0 } = options

  // Keep last 20 turns to stay within context limits while preserving context
  const recentHistory = history.slice(-20).map(m => ({
    role: m.role as "user" | "assistant",
    content: m.text,
  }))

  // ── BlackBox AI first if explicitly configured ───────────────────────────
  const USE_BB_FIRST = import.meta.env.VITE_AI_PROVIDER === "blackbox"
  if (USE_BB_FIRST && BB_API_KEY && BB_API_KEY !== "xxx") {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 30000)
      const res = await fetch(BB_ENDPOINT, {
        method: "POST",
        signal: ctrl.signal,
        headers: BB_HEADERS,
        body: JSON.stringify({
          model: BB_MODEL_CHAIN[0],
          messages: [{ role: "system", content: systemPrompt }, ...recentHistory],
          max_tokens,
          temperature,
          stream: false,
        }),
      })
      clearTimeout(t)
      if (res.ok) {
        const data = await res.json()
        const text = data.choices?.[0]?.message?.content ?? ""
        if (text) return text
      }
    } catch { /* fall through */ }
  }

  // ── Try Anthropic via server proxy (key never leaves the backend) ─────────
  if (attempt === 0) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 25000)
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        credentials: "include",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: systemPrompt,
          messages: recentHistory,
          max_tokens,
          temperature,
        }),
      })
      clearTimeout(t)
      if (res.ok) {
        const data = await res.json()
        const text = data?.text?.trim()
        if (text && text.length > 2) return text
      }
    } catch { /* fall through to OpenRouter */ }
  }

  // ── OpenRouter fallback ───────────────────────────────────────────────────
  if (OR_KEY && attempt < OR_MODEL_CHAIN.length) {
    const model = OR_MODEL_CHAIN[attempt % OR_MODEL_CHAIN.length]
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 28000)
      const res = await fetch(OR_ENDPOINT, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OR_KEY}`,
          "HTTP-Referer": "https://app.vita-fresh.co.site",
          "X-Title": "FreshLink Pro",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            ...recentHistory,
          ],
          max_tokens,
          temperature,
        }),
      })
      clearTimeout(t)
      if (res.status === 429 || res.status === 402) {
        await sleep(800 * (attempt + 1))
        return callLLM(systemPrompt, history, { temperature, max_tokens, attempt: attempt + 1 })
      }
      if (res.ok) {
        const data = await res.json()
        const text = data?.choices?.[0]?.message?.content?.trim()
        if (text && text.length > 2) return text
      }
    } catch {
      if (attempt < OR_MODEL_CHAIN.length - 1) {
        await sleep(600)
        return callLLM(systemPrompt, history, { temperature, max_tokens, attempt: attempt + 1 })
      }
    }
  }

  // ── BlackBox legacy fallback ──────────────────────────────────────────────
  const bbAttempt = attempt % BB_MODEL_CHAIN.length
  const model = BB_MODEL_CHAIN[bbAttempt]
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 30000)
    const res = await fetch(BB_ENDPOINT, {
      method: "POST",
      headers: BB_HEADERS,
      signal: ctrl.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          ...recentHistory,
        ],
        max_tokens,
        temperature,
      }),
    })
    clearTimeout(t)
    if (res.status === 429 || res.status === 402 || res.status === 503) {
      await sleep(800 * (bbAttempt + 1))
      if (bbAttempt < BB_MODEL_CHAIN.length - 1) {
        return callLLM(systemPrompt, history, { temperature, max_tokens, attempt: attempt + 1 })
      }
      throw new Error("QUOTA_EXCEEDED")
    }
    if (!res.ok) throw new Error(`HTTP_${res.status}`)
    const data = await res.json()
    const text = data?.choices?.[0]?.message?.content?.trim()
    if (!text || text.length < 2) throw new Error("EMPTY_RESPONSE")
    return text
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : ""
    if (msg === "QUOTA_EXCEEDED") throw e
    if (bbAttempt < BB_MODEL_CHAIN.length - 1) {
      await sleep(600)
      return callLLM(systemPrompt, history, { temperature, max_tokens, attempt: attempt + 1 })
    }
    throw new Error("QUOTA_EXCEEDED")
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

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
