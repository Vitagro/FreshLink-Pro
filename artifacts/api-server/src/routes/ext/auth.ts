import { Router } from "express";
import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { signToken } from "../../lib/extToken.js";

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

function normalizePhone(raw: string) {
  const d = raw.replace(/[\s\-\.\(\)\+]/g, "");
  let base = d;
  if (base.startsWith("00212")) base = base.slice(5);
  else if (base.startsWith("212")) base = base.slice(3);
  else if (base.startsWith("0")) base = base.slice(1);
  return { local: "0" + base, intl: "212" + base, intlPlus: "+212" + base };
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

  if (!found) {
    res.status(401).json({ ok: false, error: "Utilisateur non trouvé" });
    return;
  }

  if (!found.actif) {
    res.status(403).json({ ok: false, error: "Compte désactivé" });
    return;
  }

  const stored = String(found.password ?? "");
  if (!stored) {
    res.status(401).json({ ok: false, error: "Authentification non configurée" });
    return;
  }

  const match =
    stored.startsWith("$2") ? await bcrypt.compare(password, stored) : stored === password;

  if (!match) {
    res.status(401).json({ ok: false, error: "Mot de passe incorrect" });
    return;
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
