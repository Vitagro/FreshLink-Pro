import { Router } from "express";
import { randomInt, randomUUID } from "node:crypto";
import { requireAccount } from "../../lib/adminAuth.js";
import { rateLimit } from "../../lib/ext/rateLimit.js";

const router = Router();
const url = process.env.VITE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.service_role || process.env.SUPABASE_SERVICE_KEY;
const configId = "__loterie_config", winnersId = "__loterie_winners";
type Segment = { id: string; label: string; type: string; montant: number; poids: number; dateDebut?: string; dateFin?: string; maxGagnants?: number; ciblesAutorisees: string[]; code?: string };
async function db(path: string, method = "GET", body?: unknown): Promise<any[]> {
  if (!url || !key) throw Error("configuration");
  const r = await fetch(`${url}/rest/v1/${path}`, { method, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw Error(`database-${r.status}`);
  const data = await r.json();
  if (!Array.isArray(data)) throw Error("invalid-database-response");
  return data;
}
async function read(id: string) { return (await db(`fl_notices?id=eq.${id}&select=payload,updated_at`))[0]; }
function eligible(s: Segment, counts: Record<string, any>, audience?: string) {
  const now = Date.now();
  return typeof s.id === "string" && s.id.length < 100 && typeof s.label === "string" &&
    ["reduction", "pourcentage", "freeship", "cadeau", "code"].includes(s.type) &&
    Number.isFinite(s.montant) && s.montant >= 0 && (s.type !== "pourcentage" || s.montant <= 100) &&
    Number.isFinite(s.poids) && s.poids > 0 && s.poids <= 100000 &&
    (!s.dateDebut || Date.parse(s.dateDebut) <= now) &&
    (!s.dateFin || Date.parse(s.dateFin.length === 10 ? s.dateFin + "T23:59:59Z" : s.dateFin) >= now) &&
    (s.maxGagnants == null || Number(counts[s.id]?.count || 0) < s.maxGagnants) &&
    Array.isArray(s.ciblesAutorisees) && s.ciblesAutorisees.length > 0 &&
    (!audience || s.ciblesAutorisees.includes("tous") || s.ciblesAutorisees.includes(audience));
}
function publicReward(s: Segment) { return { id: s.id, label: s.label.slice(0,160), type: s.type, montant: s.montant }; }
router.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
router.get("/", async (_req, res) => {
  try {
    const cfg = (await read(configId))?.payload;
    const counts = (await read(winnersId))?.payload || {};
    const rewards = cfg?.active === true && Array.isArray(cfg.segments) ? cfg.segments.filter((s: Segment) => eligible(s, counts)).map(publicReward) : [];
    res.json({ active: cfg?.active === true, rewards, seuilCible: Number(cfg?.seuilCible) || 0, loginRequired: true });
  } catch { res.status(503).json({ error: "Offres momentanément indisponibles." }); }
});
router.post("/", requireAccount, async (req, res) => {
  if (rateLimit(req, res, { key: "shop-lottery", limit: 5, windowMs: 60000 })) return;
  const account = res.locals.account;
  // Audience comes from the verified account, never from a submitted userId.
  const audience = account.role === "fournisseur" ? "fournisseur" : ["client", "particulier", "chr", "marchand"].includes(account.role) ? "client" : "other";
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const cfg = (await read(configId))?.payload;
      if (cfg?.active !== true) { res.status(409).json({ error: "Offre désactivée." }); return; }
      let stored = await read(winnersId);
      if (!stored) {
        try { await db("fl_notices", "POST", { id: winnersId, payload: { _revision: randomUUID(), _claims: {} }, updated_at: new Date().toISOString() }); } catch { /* another request may have initialized it */ }
        stored = await read(winnersId);
      }
      if (!stored) throw Error("state");
      const state = stored.payload || {}, claims = state._claims || {};
      let claim = claims[account.id];
      if (!claim) {
        const choices: Segment[] = (cfg.segments || []).filter((s: Segment) => eligible(s, state, audience));
        if (!choices.length) { res.status(409).json({ error: "Aucune récompense éligible pour ce compte actuellement." }); return; }
        const total = choices.reduce((n,s) => n + Math.max(1, Math.round(s.poids * 100)), 0);
        let pick = randomInt(total), reward = choices[0];
        for (const s of choices) { pick -= Math.max(1, Math.round(s.poids * 100)); if (pick < 0) { reward = s; break; } }
        claim = { reward: publicReward(reward), coupon: { code: reward.type === "code" ? reward.code : "VF-" + randomUUID().replace(/-/g, "").toUpperCase(), type: reward.type === "pourcentage" ? "pourcentage" : reward.type === "freeship" ? "livraison_gratuite" : reward.type === "cadeau" ? "article_gratuit" : "montant", valeur: reward.montant, label: reward.label, minCommande: Number(cfg.seuilCible) || 0, actif: true, usageMax: 1, usageCount: 0 }, createdAt: new Date().toISOString() };
        if (!claim.coupon.code) throw Error("coupon");
        const next = { ...state, _revision: randomUUID(), _claims: { ...claims, [account.id]: claim }, [reward.id]: { count: Number(state[reward.id]?.count || 0) + 1 } };
        // Compare-and-swap: a concurrent winner cannot spend the same remaining quota.
        const filter = state._revision ? `payload->>_revision=eq.${encodeURIComponent(state._revision)}` : `updated_at=eq.${encodeURIComponent(stored.updated_at)}`;
        const updated = await db(`fl_notices?id=eq.${winnersId}&${filter}`, "PATCH", { payload: next, updated_at: new Date().toISOString() });
        if (!updated.length) continue;
      }
      const code = claim.coupon.code;
      const existing = await db(`fl_coupons?id=eq.${encodeURIComponent(code)}&select=id`);
      if (!existing.length) {
        if (claim.reward.type === "code") throw Error("missing-existing-coupon");
        try { await db("fl_coupons", "POST", { id: code, payload: claim.coupon, updated_at: new Date().toISOString() }); }
        catch { if (!(await db(`fl_coupons?id=eq.${encodeURIComponent(code)}&select=id`)).length) throw Error("coupon-save"); }
      }
      res.json({ ok: true, reward: claim.reward, coupon: claim.coupon }); return;
    }
    res.status(409).json({ error: "Une autre participation est en cours. Réessayez." });
  } catch { res.status(503).json({ error: "Participation indisponible. Aucun nouveau tirage ne sera effectué lors de la reprise." }); }
});
export default router;
