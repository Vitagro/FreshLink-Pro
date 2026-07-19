import { Router } from "express";
import type { Request, Response } from "express";
import { requireDeviceApi } from "../../lib/deviceGuard.js";
import { SB_URL, SB_SERVICE_KEY, sbServiceHeaders } from "../../lib/ext/supabaseEnv.js";

// ══════════════════════════════════════════════════════════════════════════
// GET /api/portal/supplier/:id — dashboard fournisseur pour BOFournisseurDetail
// (commandes/PO, bons d'achat, réceptions, paiements, solde dû). Ce endpoint
// n'existait pas du tout dans ce repo alors que BOFournisseurDetail.tsx
// l'appelait déjà — 404 permanent, l'onglet "Caisses" (et tous les autres :
// Commandes/Réceptions/Paiements) affichait toujours "aucune donnée".
// ══════════════════════════════════════════════════════════════════════════

const router = Router();

type Row = Record<string, unknown>;

async function sbRows(table: string, filter: string, limit = 2000): Promise<Row[]> {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/${table}?${filter}&select=id,payload&limit=${limit}`, {
      headers: sbServiceHeaders(),
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as { id: string; payload?: Row }[];
    return rows.map((r) => ({ id: r.id, ...(r.payload ?? {}) }));
  } catch {
    return [];
  }
}

const N = (x: unknown) => Number(x ?? 0) || 0;

function bonAchatMontant(b: Row): number {
  const direct = N(b.montantTTC ?? b.montantTotal ?? b.total ?? b.montant);
  if (direct) return direct;
  const lignes = Array.isArray(b.lignes) ? (b.lignes as Row[]) : [];
  return lignes.reduce((t, l) => t + N(l.quantite) * N(l.prixAchat ?? l.prix), 0);
}

router.get("/:id", async (req: Request, res: Response) => {
  // Données financières (PO, paiements, solde dû) — même garde que sync-read.
  if (requireDeviceApi(req)) {
    res.status(401).json({ error: "Device non autorisé" });
    return;
  }
  if (!SB_SERVICE_KEY) {
    res.status(500).json({ error: "service-role unavailable" });
    return;
  }
  const fournisseurId = String(req.params.id);
  const eq = `payload->>fournisseurId=eq.${encodeURIComponent(fournisseurId)}`;

  const [purchaseOrders, bonsAchat, allReceptions, payments] = await Promise.all([
    sbRows("fl_purchase_orders", eq),
    sbRows("fl_bons_achat", eq),
    // fl_receptions n'a pas fournisseurId direct (payload.fournisseurNom +
    // liens purchaseOrderId/bonAchatId) — filtré ci-dessous après coup.
    sbRows("fl_receptions", "select=id,payload"),
    sbRows("fl_paiements", eq),
  ]);

  const poIds = new Set(purchaseOrders.map((p) => String(p.id)));
  const baIds = new Set(bonsAchat.map((b) => String(b.id)));
  const fournisseurNom = String(
    purchaseOrders[0]?.fournisseurNom ?? bonsAchat[0]?.fournisseurNom ?? ""
  );
  const receptions = allReceptions.filter((r) => {
    const poId = r.purchaseOrderId ? String(r.purchaseOrderId) : "";
    const baId = r.bonAchatId ? String(r.bonAchatId) : "";
    const nom = String(r.fournisseurNom ?? "");
    return (poId && poIds.has(poId)) || (baId && baIds.has(baId)) || (fournisseurNom && nom === fournisseurNom);
  });

  const totalPOs = purchaseOrders.filter((p) => p.statut !== "annulé").reduce((s, p) => s + N(p.total), 0);
  const totalBonsAchat = bonsAchat.reduce((s, b) => s + bonAchatMontant(b), 0);
  const totalAchats = totalPOs + totalBonsAchat;
  const totalPaye = payments.reduce((s, p) => s + N(p.montant), 0);
  const soldeDu = Math.max(0, totalAchats - totalPaye);

  res.json({
    purchaseOrders,
    bonsAchat,
    receptions,
    payments,
    stats: {
      totalPOs: purchaseOrders.length,
      totalReceptions: receptions.length,
      totalMontant: totalAchats,
      totalAchats,
      totalPaye,
      soldeDu,
    },
  });
});

export default router;
