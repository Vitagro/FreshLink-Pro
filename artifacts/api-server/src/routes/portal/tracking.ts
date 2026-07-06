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

const STEPS = ["recue", "preparation", "chargement", "route", "livree"] as const;
type Step = (typeof STEPS)[number];

router.post("/", async (req: Request, res: Response) => {
  if (!SB_SRV) { res.status(500).json({ error: "service-role unavailable" }); return; }
  const body = req.body as Record<string, unknown>;
  const commandeId = String(body.commandeId ?? "").trim();
  const etape = String(body.etape ?? "").trim() as Step;
  if (!commandeId) { res.status(400).json({ error: "commandeId required" }); return; }
  if (!STEPS.includes(etape)) { res.status(400).json({ error: `etape must be one of ${STEPS.join(", ")}` }); return; }

  const headers = { apikey: SB_SRV, Authorization: `Bearer ${SB_SRV}`, "Content-Type": "application/json" };
  const existingRes = await fetch(
    `${SB_URL}/rest/v1/fl_tracking?payload->>commandeId=eq.${encodeURIComponent(commandeId)}&select=id,payload&limit=1`,
    { headers }
  );
  const existing = (existingRes.ok ? await existingRes.json() : []) as Array<{ id?: string; payload?: Record<string, unknown> }>;
  const prev: Record<string, unknown> = existing[0]?.payload ?? {};
  const prevPipeline: { step: Step; at: string }[] = Array.isArray(prev.pipeline) ? prev.pipeline : [];
  const now = new Date().toISOString();
  const newPipeline = [...prevPipeline.filter((s) => s.step !== etape), { step: etape, at: now }];

  const newPayload = {
    ...prev,
    commandeId,
    etape,
    chauffeur: body.chauffeur ?? prev.chauffeur ?? null,
    eta: body.eta ?? prev.eta ?? null,
    gpsLat: body.gpsLat ?? prev.gpsLat ?? null,
    gpsLng: body.gpsLng ?? prev.gpsLng ?? null,
    position: body.position ?? prev.position ?? null,
    pipeline: newPipeline,
    updated_at: now,
  };

  const id = existing[0]?.id ?? "TRK" + commandeId;
  const upsertRes = await fetch(`${SB_URL}/rest/v1/fl_tracking`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id, payload: newPayload, updated_at: now }),
  });

  if (!upsertRes.ok) {
    res.status(500).json({ error: await upsertRes.text() });
    return;
  }
  res.json({ ok: true, commandeId, etape, pipelineLength: newPipeline.length });
});

export default router;
