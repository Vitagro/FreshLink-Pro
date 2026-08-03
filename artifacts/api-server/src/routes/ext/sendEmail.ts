import { Router } from "express";
import type { Request, Response } from "express";
import { sendEmail } from "../../lib/email.js";
import { requireDeviceApi } from "../../lib/deviceGuard.js";

// ══════════════════════════════════════════════════════════════════════════════
// /api/ext/send-email — envoi email côté SERVEUR (clé secrète jamais exposée)
// Logique d'envoi (Brevo/Resend + auto-réparation) partagée dans lib/email.ts —
// aussi utilisée par les notifications internes (ex: alerte commande Shop).
// Body: { to, subject, html?, text?, from?, replyTo? }
//
// Protege par requireDeviceApi (device BO connu) : sans ca, n'importe qui
// pouvait faire envoyer un email arbitraire (sujet/corps HTML libres) depuis
// l'adresse d'expedition de l'app — le seul garde-fou etait un rate-limit par
// IP lu depuis X-Forwarded-For, un en-tete que l'appelant controle lui-meme
// et peut donc varier a chaque requete pour le contourner entierement.
// Les appels internes (cron rapport-credit/rapport-journalier) n'utilisent
// plus cette route HTTP : ils appellent sendEmail() directement en process.
// ══════════════════════════════════════════════════════════════════════════════

const router = Router();

function corsHeaders(origin: string | undefined) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

router.use((req: Request, res: Response, next) => {
  Object.entries(corsHeaders(req.headers.origin)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
});

// ── Rate limit en mémoire (best-effort, par IP) ────────────────────────────────
type Bucket = { count: number; reset: number };
const rlStore = new Map<string, Bucket>();
function rlGc(now: number) {
  if (rlStore.size < 5000) return;
  for (const [k, b] of rlStore) if (b.reset < now) rlStore.delete(k);
}
function clientIp(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff) return xff.split(",")[0].trim();
  return (req.headers["x-real-ip"] as string) ?? req.ip ?? "unknown";
}
function rateLimited(req: Request, opts: { key: string; limit: number; windowMs: number }): { retry: number } | null {
  const now = Date.now();
  rlGc(now);
  const id = `${opts.key}:${clientIp(req)}`;
  let b = rlStore.get(id);
  if (!b || b.reset < now) {
    b = { count: 0, reset: now + opts.windowMs };
    rlStore.set(id, b);
  }
  b.count++;
  if (b.count > opts.limit) {
    const retry = Math.max(1, Math.ceil((b.reset - now) / 1000));
    return { retry };
  }
  return null;
}

// Diagnostic : indique QUELS fournisseurs sont configurés (booléens, jamais les clés)
router.get("/", (_req: Request, res: Response) => {
  res.json({
    providers: { brevo: !!process.env.BREVO_API_KEY, resend: !!process.env.RESEND_API_KEY },
    from: process.env.EMAIL_FROM || "Vita Fresh <support@vita-core.org>",
    preferred: process.env.BREVO_API_KEY ? "brevo" : process.env.RESEND_API_KEY ? "resend" : "none",
  });
});

router.post("/", async (req: Request, res: Response) => {
  if (requireDeviceApi(req)) { res.status(401).json({ ok: false, error: "Device non autorisé" }); return; }
  const limited = rateLimited(req, { key: "send-email", limit: 5, windowMs: 60_000 });
  if (limited) {
    res.setHeader("Retry-After", String(limited.retry));
    res.status(429).json({ ok: false, error: "Trop de requêtes — réessayez dans quelques instants." });
    return;
  }

  const body = (req.body ?? {}) as { to?: string; subject?: string; html?: string; text?: string; from?: string; replyTo?: string };
  const result = await sendEmail({
    to: body.to ?? "", subject: body.subject ?? "", html: body.html, text: body.text, from: body.from, replyTo: body.replyTo,
  });

  if (result.ok) {
    res.json({ ok: true, provider: result.provider, id: result.id, from: result.from, note: result.note });
    return;
  }
  res.status(result.status ?? 502).json({ error: result.error, detail: result.detail, hint: result.hint });
});

export default router;
