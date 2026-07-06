import { Router } from "express";
import type { Request, Response } from "express";

const router = Router();

const DB_CONFIGS: Record<string, { url: string; anonKey: string }> = {
  gestflux: {
    url:     process.env.VITE_GESTFLUX_URL     ?? "https://dngqklliynfoqkalttpu.supabase.co",
    anonKey: process.env.VITE_GESTFLUX_ANON_KEY ?? "",
  },
  iziry: {
    url:     process.env.VITE_IZIRY_URL     ?? "https://gmbvrjxteoxbiyternfz.supabase.co",
    anonKey: process.env.VITE_IZIRY_ANON_KEY ?? "",
  },
};

// POST /api/ext/db-login  { source: "gestflux"|"iziry", email, password }
// Returns { ok, access_token } — called from the browser to avoid CORS on Supabase auth
router.post("/", async (req: Request, res: Response) => {
  const { source, email, password } = req.body as {
    source?: string;
    email?: string;
    password?: string;
  };

  if (!source || !email || !password) {
    res.status(400).json({ ok: false, error: "source, email and password required" });
    return;
  }

  const cfg = DB_CONFIGS[source];
  if (!cfg) {
    res.status(400).json({ ok: false, error: `Unknown source: ${source}` });
    return;
  }

  try {
    const sbRes = await fetch(`${cfg.url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "apikey":       cfg.anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const json = await sbRes.json() as Record<string, unknown>;

    if (!sbRes.ok) {
      res.status(401).json({ ok: false, error: json.error_description ?? json.msg ?? "Auth failed" });
      return;
    }

    res.json({ ok: true, access_token: json.access_token });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

export default router;
