import { Router } from "express";
import type { Request, Response } from "express";
import { requireDeviceApi } from "../lib/deviceGuard.js";

// Proxy Anthropic Claude côté serveur — la clé ANTHROPIC_API_KEY ne quitte
// jamais le backend (SetEnv Hostinger en prod, variable d'env en local).
// Sans ça, une clé VITE_* serait visible dans le bundle client par n'importe
// qui (même faille que le "Faille #7" déjà corrigé pour les liens WhatsApp).

const router = Router();

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const MODEL = "claude-sonnet-4-20250514";

interface AiChatBody {
  system?: string;
  messages?: { role: string; content: string }[];
  max_tokens?: number;
  temperature?: number;
}

router.post("/", async (req: Request, res: Response) => {
  if (requireDeviceApi(req)) {
    res.status(401).json({ ok: false, error: "Device non autorisé" });
    return;
  }
  if (!ANTHROPIC_KEY) {
    res.status(500).json({ ok: false, error: "ANTHROPIC_API_KEY manquante côté serveur" });
    return;
  }
  const { system, messages, max_tokens, temperature } = req.body as AiChatBody;
  if (!system || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ ok: false, error: "system et messages requis" });
    return;
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 25000);
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: max_tokens ?? 1500,
        temperature: temperature ?? 0.65,
        system,
        messages,
      }),
    });
    clearTimeout(t);
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      res.status(502).json({ ok: false, error: `Anthropic ${r.status}: ${txt.slice(0, 300)}` });
      return;
    }
    const data = (await r.json()) as { content?: { text?: string }[] };
    const text = data?.content?.[0]?.text?.trim() ?? "";
    res.json({ ok: true, text });
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : "Erreur interne" });
  }
});

export default router;
