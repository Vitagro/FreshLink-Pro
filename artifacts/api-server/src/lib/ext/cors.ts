import type { Request, Response, NextFunction } from "express";

// ─────────────────────────────────────────────────────────────────────────────
// CORS centralisé et pilotable par variable d'environnement.
//
// Comportement par défaut : INCHANGÉ (reflète l'origine de la requête) afin de ne
// rien casser côté shop. Pour DURCIR, définir ALLOWED_ORIGINS dans l'environnement
// (liste CSV), p.ex. :
//   ALLOWED_ORIGINS="https://shop.vita-core.org,https://erp.vita-core.org"
// Dès lors, seules ces origines sont acceptées sur les routes qui utilisent
// `corsMiddleware({ public: false })`. Les routes publiques (catalogue) passent
// `public: true` et restent ouvertes à tous.
// ─────────────────────────────────────────────────────────────────────────────

function allowlist(): string[] {
  return (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function resolveOrigin(reqOrigin: string | undefined, isPublic: boolean): string | null {
  const list = allowlist();
  // Pas d'allowlist configurée → comportement historique : on reflète l'origine.
  if (list.length === 0) return reqOrigin ?? "*";
  // Route publique → toujours ouverte.
  if (isPublic) return reqOrigin ?? "*";
  // Allowlist active → on n'autorise que les origines déclarées.
  if (reqOrigin && list.includes(reqOrigin)) return reqOrigin;
  return null;
}

export interface CorsOptions {
  methods?: string;
  /** true = endpoint public (catalogue) : ignore l'allowlist. */
  public?: boolean;
  headers?: string;
}

export function corsMiddleware(opts: CorsOptions = {}) {
  const methods = opts.methods ?? "GET, POST, OPTIONS";
  const headers = opts.headers ?? "Content-Type, X-Api-Key, Authorization";
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = resolveOrigin(req.headers.origin, opts.public ?? false);
    if (origin === null) {
      // Origine non autorisée (allowlist active) → on bloque le préflight et la requête.
      res.status(403).json({ error: "Origine non autorisée" });
      return;
    }
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", methods);
    res.setHeader("Access-Control-Allow-Headers", headers);
    res.setHeader("Vary", "Origin");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  };
}
