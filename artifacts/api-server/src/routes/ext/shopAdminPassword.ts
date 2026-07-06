import { Router } from "express";
import type { Request, Response } from "express";
import { rateLimit } from "../../lib/ext/rateLimit.js";
import { changeShopAdminPassword, shopAdminConfigured } from "../../lib/ext/shopAdminPwd.js";

// /ext/shop-admin-password — change le mot de passe admin du shop.
// POST { currentPassword, newPassword } → vérifie l'actuel (hash Supabase ou
// env), écrit le nouveau hash bcrypt dans Supabase (fl_notices id=shop_admin_secret).
// GET → { configured } (l'UI sait s'il faut afficher le formulaire).

const router = Router();

router.use((req: Request, res: Response, next) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
});

router.get("/", async (_req: Request, res: Response) => {
  res.json({ ok: true, configured: await shopAdminConfigured() });
});

router.post("/", async (req: Request, res: Response) => {
  // Anti-bruteforce : 5 tentatives / 5 min / IP.
  if (rateLimit(req, res, { key: "shop-admin-pwd", limit: 5, windowMs: 5 * 60_000 })) return;

  const body = req.body as { currentPassword?: string; newPassword?: string };
  const err = await changeShopAdminPassword(body.currentPassword ?? "", body.newPassword ?? "");
  if (err) {
    const status = err === "Mot de passe actuel incorrect." ? 401 : 400;
    res.status(status).json({ ok: false, error: err });
    return;
  }
  res.json({ ok: true });
});

export default router;
