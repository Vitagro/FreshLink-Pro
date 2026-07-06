import type { Request, Response } from "express";

// ════════════════════════════════════════════════════════════════════════════
//  rateLimit — limiteur de débit en mémoire (par IP + clé de route) pour
//  protéger les endpoints publics /ext/* contre l'abus/spam.
//
//  ⚠️ En mémoire = best-effort par instance. Stoppe le spam naïf / les bursts.
// ════════════════════════════════════════════════════════════════════════════

type Bucket = { count: number; reset: number };
const store = new Map<string, Bucket>();

function gc(now: number) {
  if (store.size < 5000) return;
  for (const [k, b] of store) if (b.reset < now) store.delete(k);
}

function clientIp(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  if (xff) return (Array.isArray(xff) ? xff[0] : xff).split(",")[0].trim();
  return (req.headers["x-real-ip"] as string) ?? req.ip ?? "unknown";
}

/**
 * Retourne true (et envoie une réponse 429) si la limite est dépassée pour
 * (clé de route + IP), sinon false (la requête peut continuer).
 *
 * Usage en tête d'un handler :
 *   if (rateLimit(req, res, { key: "commandes", limit: 10, windowMs: 60_000 })) return
 */
export function rateLimit(
  req: Request,
  res: Response,
  opts: { key: string; limit: number; windowMs: number },
): boolean {
  const now = Date.now();
  gc(now);
  const id = `${opts.key}:${clientIp(req)}`;
  let b = store.get(id);
  if (!b || b.reset < now) {
    b = { count: 0, reset: now + opts.windowMs };
    store.set(id, b);
  }
  b.count++;
  if (b.count > opts.limit) {
    const retry = Math.max(1, Math.ceil((b.reset - now) / 1000));
    res.setHeader("Retry-After", String(retry));
    res.status(429).json({ ok: false, error: "Trop de requêtes — réessayez dans quelques instants." });
    return true;
  }
  return false;
}
