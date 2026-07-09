import { Router } from "express";
import type { Request, Response } from "express";
import { SB_URL, SB_SERVICE_KEY, sbServiceHeaders } from "../../lib/ext/supabaseEnv.js";

// ══════════════════════════════════════════════════════════════
// GET /api/ext/public-stats
// Endpoint PUBLIC (pas de device-guard, pas d'auth) consomme par le site
// vitrine vita-agro.com (panneau admin "ERP sync"). N'expose QUE des
// agregats deja publics par nature (tonnage arrondi, nombre de clients,
// taux de service) — jamais de PII, prix, ou donnee individuelle.
// CORS herite du middleware global de app.ts (origin: true).
// ══════════════════════════════════════════════════════════════

const router = Router();

interface CommandePayload {
  date?: string;
  statut?: string;
  lignes?: { unite?: string; quantite?: number }[];
}

function fmtTonnes(kg: number): string {
  const t = kg / 1000;
  return `${t >= 10 ? Math.round(t) : Math.round(t * 10) / 10} t`;
}

router.get("/", async (_req: Request, res: Response) => {
  if (!SB_SERVICE_KEY) {
    res.status(500).json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY manquante" });
    return;
  }
  try {
    const [clientsRes, commandesRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/fl_clients?select=payload`, { headers: sbServiceHeaders() }),
      fetch(`${SB_URL}/rest/v1/fl_commandes?select=payload`, { headers: sbServiceHeaders() }),
    ]);
    if (!clientsRes.ok || !commandesRes.ok) {
      res.status(502).json({ ok: false, error: "Supabase inaccessible" });
      return;
    }
    const clients = (await clientsRes.json()) as { payload: { actif?: boolean } }[];
    const commandes = (await commandesRes.json()) as { payload: CommandePayload }[];

    const activeClients = clients.filter((c) => c.payload?.actif !== false).length;

    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    let dailyKg = 0;
    let monthlyKg = 0;
    let livreCount = 0;
    let closedCount = 0;

    for (const row of commandes) {
      const p = row.payload ?? {};
      const statut = String(p.statut ?? "");
      const date = String(p.date ?? "").slice(0, 10);
      const lignes = Array.isArray(p.lignes) ? p.lignes : [];
      const kg = lignes.reduce((sum, l) => {
        const unite = String(l.unite ?? "kg").toLowerCase();
        return sum + (unite === "kg" ? Number(l.quantite ?? 0) : 0);
      }, 0);

      if (statut === "livre") {
        if (date === today) dailyKg += kg;
        if (date.slice(0, 7) === month) monthlyKg += kg;
      }
      if (["livre", "retour", "refuse"].includes(statut)) {
        closedCount++;
        if (statut === "livre") livreCount++;
      }
    }

    const otif = closedCount > 0 ? Math.round((livreCount / closedCount) * 100) : null;

    // ── DEBUG TEMPORAIRE — a retirer une fois le "0 t" diagnostique ──
    // Aggregats uniquement (comptages), aucune PII, aucun prix.
    const statutCounts: Record<string, number> = {};
    const uniteCountsThisMonth: Record<string, number> = {};
    let totalCommandes = 0;
    let livreThisMonth = 0;
    for (const row of commandes) {
      const p = row.payload ?? {};
      totalCommandes++;
      const statut = String(p.statut ?? "(vide)");
      statutCounts[statut] = (statutCounts[statut] ?? 0) + 1;
      const date = String(p.date ?? "").slice(0, 10);
      if (statut === "livre" && date.slice(0, 7) === month) {
        livreThisMonth++;
        const lignes = Array.isArray(p.lignes) ? p.lignes : [];
        for (const l of lignes) {
          const u = String(l.unite ?? "(vide)").toLowerCase();
          uniteCountsThisMonth[u] = (uniteCountsThisMonth[u] ?? 0) + 1;
        }
      }
    }
    const debug = { totalCommandes, statutCounts, livreThisMonth, uniteCountsThisMonth, month };

    res.json({
      ok: true,
      fresh: {
        daily: fmtTonnes(dailyKg),
        monthly: fmtTonnes(monthlyKg),
        clients: String(activeClients),
        otif: otif != null ? `${otif}%` : "—",
      },
      debug,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
