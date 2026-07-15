import { Router } from "express";
import type { Request, Response } from "express";
import { createHash, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { signToken } from "../../lib/extToken.js";
import { rateLimit } from "../../lib/ext/rateLimit.js";

const router = Router();

const SB_URL =
  process.env.VITE_SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://bxdqkigoidwnscsjafwd.supabase.co";

const SB_SERVER_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.service_role ||
  process.env.SUPABASE_SERVICE_KEY ||
  "";

// Message générique unique pour tout échec d'authentification : évite de
// révéler si un identifiant existe, est désactivé, ou si seul le mot de
// passe est faux (énumération de comptes).
const GENERIC_AUTH_ERROR = "Identifiants incorrects ou compte indisponible.";

export function normalizePhone(raw: string) {
  const d = raw.replace(/[\s\-\.\(\)\+]/g, "");
  let base = d;
  if (base.startsWith("00212")) base = base.slice(5);
  else if (base.startsWith("212")) base = base.slice(3);
  else if (base.startsWith("0")) base = base.slice(1);
  return { local: "0" + base, intl: "212" + base, intlPlus: "+212" + base };
}

// Comparaison à temps constant pour l'ancien format mot de passe en clair.
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

// Un compte trouvé avec un mot de passe stocké en clair (legacy) est
// automatiquement migré vers un hash bcrypt dès la première connexion
// réussie, pour réduire au minimum la fenêtre d'exposition en clair.
async function upgradeToBcrypt(userId: string, currentPayload: Record<string, unknown>, plain: string): Promise<void> {
  if (!SB_SERVER_KEY) return;
  try {
    const hash = await bcrypt.hash(plain, 10);
    const { id: _id, ...rest } = currentPayload;
    await fetch(`${SB_URL}/rest/v1/fl_users?id=eq.${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: {
        apikey: SB_SERVER_KEY,
        Authorization: `Bearer ${SB_SERVER_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ payload: { ...rest, password: hash } }),
    });
  } catch {
    /* migration best-effort — ne doit jamais bloquer le login */
  }
}

async function getAllUsers(): Promise<Record<string, unknown>[]> {
  if (!SB_SERVER_KEY) return [];
  try {
    const res = await fetch(`${SB_URL}/rest/v1/fl_users?select=id,payload&limit=1000`, {
      headers: { apikey: SB_SERVER_KEY, Authorization: `Bearer ${SB_SERVER_KEY}` },
    });
    if (!res.ok) return [];
    const rows = await res.json() as { id: string; payload: Record<string, unknown> }[];
    return rows.map((r) => ({ id: r.id, ...r.payload }));
  } catch {
    return [];
  }
}

router.options("/", (req: Request, res: Response) => {
  const origin = req.headers.origin ?? "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.sendStatus(204);
});

router.post("/", async (req: Request, res: Response) => {
  const origin = req.headers.origin ?? "*";
  res.setHeader("Access-Control-Allow-Origin", origin);

  // Anti brute-force : 8 tentatives / 5 min par IP sur le login.
  if (rateLimit(req, res, { key: "auth-login", limit: 8, windowMs: 5 * 60_000 })) return;

  if (!SB_SERVER_KEY) {
    res.status(503).json({ ok: false, error: "Service non disponible" });
    return;
  }

  const { phone, email, password } = req.body as { phone?: string; email?: string; password?: string };
  if (!password || (!phone && !email)) {
    res.status(400).json({ ok: false, error: "Identifiant et mot de passe requis" });
    return;
  }

  const users = await getAllUsers();
  if (users.length === 0) {
    res.status(503).json({ ok: false, error: "Service utilisateurs indisponible" });
    return;
  }

  let found: Record<string, unknown> | undefined;

  if (phone) {
    const { local, intl, intlPlus } = normalizePhone(phone);
    found = users.find((u) => {
      const t = String(u.telephone ?? "");
      return t === local || t === intl || t === intlPlus || t === phone;
    });
  }
  if (!found && email) {
    found = users.find(
      (u) => String(u.email ?? "").toLowerCase() === email.toLowerCase()
    );
  }

  // Ces trois cas (compte introuvable / désactivé / mauvais mot de passe)
  // renvoient volontairement le même message et le même statut pour ne pas
  // permettre à un attaquant d'énumérer les comptes existants.
  if (!found || !found.actif) {
    res.status(401).json({ ok: false, error: GENERIC_AUTH_ERROR });
    return;
  }

  const stored = String(found.password ?? "");
  if (!stored) {
    res.status(401).json({ ok: false, error: GENERIC_AUTH_ERROR });
    return;
  }

  const isBcrypt = stored.startsWith("$2");
  const match = isBcrypt ? await bcrypt.compare(password, stored) : safeEqual(stored, password);

  if (!match) {
    res.status(401).json({ ok: false, error: GENERIC_AUTH_ERROR });
    return;
  }

  // Legacy : mot de passe encore stocké en clair → migration silencieuse
  // vers bcrypt maintenant qu'on vient de le vérifier avec succès.
  if (!isBcrypt) {
    void upgradeToBcrypt(String(found.id), found, password);
  }

  const token = signToken({
    sub: found.id,
    name: found.name,
    role: found.role,
    email: found.email,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
  });

  const { password: _p, ...safeUser } = found;
  res.json({ ok: true, token, user: safeUser });
});

export default router;
