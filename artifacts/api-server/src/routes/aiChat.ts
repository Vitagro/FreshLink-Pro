import { Router } from "express";
import type { Request, Response } from "express";
import { requireDeviceApi } from "../lib/deviceGuard.js";

// Proxy IA côté serveur — les clés (ANTHROPIC_API_KEY, GEMINI_API_KEY) ne
// quittent jamais le backend (SetEnv Hostinger en prod, variable d'env en
// local). Sans ça, une clé VITE_* serait visible dans le bundle client par
// n'importe qui (même faille que le "Faille #7" déjà corrigé pour les liens
// WhatsApp). Anthropic est essayé en premier ; si la clé est absente ou
// l'appel échoue, on retente avec Gemini avant de renvoyer ok:false (le
// client bascule alors sur OpenRouter/BlackBox — voir src/lib/ai.ts).

const router = Router();

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const MODEL = "claude-sonnet-4-20250514";

const GEMINI_KEY = process.env.GEMINI_API_KEY ?? "";
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

interface AiChatBody {
  system?: string;
  messages?: { role: string; content: string }[];
  max_tokens?: number;
  temperature?: number;
}

async function callAnthropic(
  system: string,
  messages: { role: string; content: string }[],
  max_tokens: number,
  temperature: number,
): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: MODEL, max_tokens, temperature, system, messages }),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`Anthropic ${r.status}: ${txt.slice(0, 300)}`);
    }
    const data = (await r.json()) as { content?: { text?: string }[] };
    return data?.content?.[0]?.text?.trim() ?? "";
  } finally {
    clearTimeout(t);
  }
}

async function callGemini(
  system: string,
  messages: { role: string; content: string }[],
  max_tokens: number,
  temperature: number,
): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
    const r = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        generationConfig: { maxOutputTokens: max_tokens, temperature },
      }),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`Gemini ${r.status}: ${txt.slice(0, 300)}`);
    }
    const data = (await r.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
  } finally {
    clearTimeout(t);
  }
}

router.post("/", async (req: Request, res: Response) => {
  if (requireDeviceApi(req)) {
    res.status(401).json({ ok: false, error: "Device non autorisé" });
    return;
  }
  if (!ANTHROPIC_KEY && !GEMINI_KEY) {
    res.status(500).json({ ok: false, error: "Aucune clé IA configurée côté serveur" });
    return;
  }
  const { system, messages, max_tokens, temperature } = req.body as AiChatBody;
  if (!system || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ ok: false, error: "system et messages requis" });
    return;
  }
  const mt = max_tokens ?? 1500;
  const temp = temperature ?? 0.65;

  let lastError = "";
  if (ANTHROPIC_KEY) {
    try {
      const text = await callAnthropic(system, messages, mt, temp);
      if (text) {
        res.json({ ok: true, text });
        return;
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Erreur Anthropic";
    }
  }

  if (GEMINI_KEY) {
    try {
      const text = await callGemini(system, messages, mt, temp);
      if (text) {
        res.json({ ok: true, text });
        return;
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Erreur Gemini";
    }
  }

  res.status(502).json({ ok: false, error: lastError || "Aucun provider IA n'a répondu" });
});

export default router;
