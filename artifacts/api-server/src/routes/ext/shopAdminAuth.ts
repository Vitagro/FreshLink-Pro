import { Router } from "express";
import type { Request, Response } from "express";
import { verifyShopAdminPassword, shopAdminConfigured } from "../../lib/ext/shopAdminPwd.js";

// /ext/shop-admin-auth — validation côté serveur du mot de passe admin du
// shop. Remplace le PIN en clair qui était dans le HTML public.
// Source de vérité = hash bcrypt dans Supabase (modifiable depuis l'UI) avec
// fallback sur l'env SHOP_ADMIN_PASSWORD. Le client envoie le mot de passe
// saisi ; on répond { ok } sans jamais exposer la valeur.

const router = Router();

router.use((req: Request, res: Response, next) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
});

router.post("/", async (req: Request, res: Response) => {
  if (!(await shopAdminConfigured())) {
    res.status(500).json({ ok: false, error: "SHOP_ADMIN_PASSWORD non configuré côté serveur." });
    return;
  }
  try {
    const { password } = req.body as { password?: string };
    const ok = typeof password === "string" && (await verifyShopAdminPassword(password));
    res.status(ok ? 200 : 401).json({ ok });
  } catch {
    res.status(400).json({ ok: false });
  }
});

export default router;
