import { Router } from "express";
import type { Request, Response } from "express";

const router = Router();

const SB_URL =
  process.env.VITE_SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://bxdqkigoidwnscsjafwd.supabase.co";
const SB_SRV =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.service_role ||
  process.env.SUPABASE_SERVICE_KEY ||
  "";

function corsHeaders(origin: string | undefined) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

router.use((req: Request, res: Response, next) => {
  Object.entries(corsHeaders(req.headers.origin)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
});

// Called by the mobile client (see src/lib/notify.ts:registerPush) once it has
// obtained an FCM token from the OS. Upserts on `token` — a device that
// re-registers (app reinstall, token refresh) just updates its row.
router.post("/register", async (req: Request, res: Response) => {
  if (!SB_SRV) { res.status(500).json({ ok: false, error: "service_role manquante" }); return; }
  const { userId, token, platform } = req.body as { userId?: string; token?: string; platform?: string };
  if (!userId || !token) { res.status(400).json({ ok: false, error: "userId et token requis" }); return; }

  try {
    const r = await fetch(`${SB_URL}/rest/v1/fl_device_tokens?on_conflict=token`, {
      method: "POST",
      headers: {
        apikey: SB_SRV,
        Authorization: `Bearer ${SB_SRV}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        user_id: userId,
        token,
        platform: platform ?? "android",
        updated_at: new Date().toISOString(),
      }),
    });
    if (!r.ok) throw new Error(await r.text());
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

export default router;
