import { Router } from "express";
import type { Request, Response } from "express";
import { requireDeviceApi } from "../lib/deviceGuard.js";

// Liens d'invitation WhatsApp — jamais en VITE_* (finiraient dans le bundle JS
// public, visible par n'importe qui). Lus uniquement côté serveur, injectés
// en prod via SetEnv (.htaccess Hostinger, cf. deploy.yml).

const router = Router();

router.get("/", (req: Request, res: Response) => {
  if (requireDeviceApi(req)) {
    res.status(401).json({ ok: false, error: "Device non autorisé" });
    return;
  }
  res.json({
    pv: process.env.WA_GROUP_PV_URL ?? "",
    alert: process.env.WA_GROUP_ALERT_URL ?? "",
  });
});

export default router;
