import { Router } from "express";
import { requireAccount } from "../lib/adminAuth.js";
import { requireDeviceApi } from "../lib/deviceGuard.js";
import { SB_URL, SB_SERVICE_KEY, sbServiceHeaders } from "../lib/ext/supabaseEnv.js";

const router = Router();
router.use(requireAccount);
router.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (requireDeviceApi(req)) { res.status(401).json({ ok:false, error:"Appareil non autorisé." }); return; }
  if (!SB_SERVICE_KEY) { res.status(503).json({ ok:false, error:"Configuration indisponible." }); return; }
  next();
});
router.get("/", async (_req, res) => {
  try {
    const response = await fetch(`${SB_URL}/rest/v1/fl_dashboard_settings?id=eq.global&select=payload&limit=1`, { headers:sbServiceHeaders() });
    if (!response.ok) throw new Error("Read failed");
    const rows = await response.json() as Array<{payload?: {scope?: string}}>;
    const scope = rows[0]?.payload?.scope;
    if (scope !== "real" && scope !== "simulation") throw new Error("Invalid scope");
    res.json({ ok:true, scope, canChange:res.locals.account.role === "super_super_admin" });
  } catch {
    res.status(503).json({ ok:false, error:"Le mode partagé est indisponible. Réessayez après actualisation." });
  }
});
router.post("/", async (req, res) => {
  if (res.locals.account.role !== "super_super_admin") {
    res.status(403).json({ ok:false, error:"Seul le Super Super Admin peut modifier le mode partagé." }); return;
  }
  const scope = req.body?.scope;
  if (scope !== "real" && scope !== "simulation") {
    res.status(400).json({ ok:false, error:"Mode invalide." }); return;
  }
  try {
    const response = await fetch(`${SB_URL}/rest/v1/fl_dashboard_settings`, {
      method:"POST", headers:sbServiceHeaders({Prefer:"resolution=merge-duplicates,return=minimal"}),
      body:JSON.stringify({ id:"global", payload:{scope, changedBy:res.locals.account.id}, updated_at:new Date().toISOString() }),
    });
    if (!response.ok) throw new Error("Save failed");
    res.json({ ok:true, scope, canChange:true });
  } catch {
    res.status(503).json({ ok:false, error:"Le mode n’a pas été enregistré. Réessayez." });
  }
});
export default router;
