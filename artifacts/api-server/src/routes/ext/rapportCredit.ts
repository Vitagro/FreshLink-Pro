import { Router } from "express";
import type { Request, Response } from "express";
import { requireDeviceApi } from "../../lib/deviceGuard.js";

// ══════════════════════════════════════════════════════════════════════════════
// /api/ext/rapport-credit — Analyse des crédits FOURNISSEURS + CLIENTS
//
//   GET                  → rapport JSON du jour (device connu requis, cf. requireDeviceApi)
//   GET ?date=YYYY-MM-DD → rapport pour une autre journée
//   GET ?send=1&key=…    → calcule ET envoie le rapport par email
//                          (device connu OU clé = CRON_SECRET/DEVICE_BYPASS_KEY)
//                          destinataire : ?to=… ou REPORT_EMAIL ou EMAIL_FROM
//
// Sources :
//   Fournisseurs : fl_credits_fournisseurs (lignes de crédit, statut≠solde)
//                  + fl_bons_achat (valeur achat du jour)
//   Clients      : fl_bons_livraison — crédit = BL « émis » non encaissés
//                  (montantTTC, prevendeurNom, clientNom, date)
//
// Un cron quotidien appelle ?send=1 avec la clé (aucun device cookie disponible).
// ══════════════════════════════════════════════════════════════════════════════

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
// Pas de valeur par défaut : si ni CRON_SECRET ni DEVICE_BYPASS_KEY ne sont
// configurés, l'envoi via clé reste indisponible (échec fermé) plutôt que de
// retomber sur un secret public connu (qui était visible dans le bundle client).
const SEND_KEY = process.env.CRON_SECRET || process.env.DEVICE_BYPASS_KEY || "";

function corsHeaders(origin: string | undefined) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

router.use((req: Request, res: Response, next) => {
  Object.entries(corsHeaders(req.headers.origin)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
});

type Row = Record<string, unknown>;
async function sbRows(table: string, limit = 2000): Promise<Row[]> {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/${table}?select=id,payload&limit=${limit}`, {
      headers: { apikey: SB_SRV, Authorization: `Bearer ${SB_SRV}` },
    });
    if (!res.ok) return [];
    const rows = await res.json() as { id: string; payload?: Row }[];
    return rows.map(r => ({ id: r.id, ...(r.payload ?? {}) }));
  } catch { return []; }
}

const N = (x: unknown) => Number(x ?? 0) || 0;
const S = (x: unknown) => String(x ?? "");
const money = (n: number) => `${n.toLocaleString("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`;
// "2026-06-11" depuis date payload (tolère ISO complet)
const day = (d: unknown) => S(d).slice(0, 10);

interface CreditEntry { nom: string; date: string; reste: number; extra?: string }
interface SideReport {
  jour: { valeur: number; credit: number; pct: number; nbTiers: number };
  totalCredits: number;
  plusGrand: CreditEntry | null;
  plusAncien: CreditEntry | null;
  top3: { nom: string; total: number }[];
}

function summarize(entries: CreditEntry[], valeurJour: number, creditJour: number, nbTiersJour: number): SideReport {
  const total = entries.reduce((s, e) => s + e.reste, 0);
  const plusGrand = entries.length ? entries.reduce((a, b) => (b.reste > a.reste ? b : a)) : null;
  const dated = entries.filter(e => e.date);
  const plusAncien = dated.length ? dated.reduce((a, b) => (b.date < a.date ? b : a)) : null;
  const byTiers: Record<string, number> = {};
  entries.forEach(e => { byTiers[e.nom] = (byTiers[e.nom] || 0) + e.reste; });
  const top3 = Object.entries(byTiers).map(([nom, total]) => ({ nom, total }))
    .sort((a, b) => b.total - a.total).slice(0, 3);
  return {
    jour: { valeur: valeurJour, credit: creditJour, pct: valeurJour > 0 ? Math.round((creditJour / valeurJour) * 1000) / 10 : 0, nbTiers: nbTiersJour },
    totalCredits: total, plusGrand, plusAncien, top3,
  };
}

async function buildReport(dateJ: string, groupeId?: string | null) {
  // ── FOURNISSEURS ───────────────────────────────────────────────────────────
  const [credits, bonsAchat, bls, clientRows] = await Promise.all([
    sbRows("fl_credits_fournisseurs"),
    sbRows("fl_bons_achat"),
    sbRows("fl_bons_livraison", 4000),
    // Uniquement nécessaire si on filtre par équipe (cf. groupeId ci-dessous) —
    // sert à savoir quel client appartient à quel groupe/équipe.
    groupeId ? sbRows("fl_clients", 5000) : Promise.resolve([] as Row[]),
  ]);

  // ── Isolation par équipe (optionnelle, cf. BOAnalyseCredit.tsx) ─────────────
  // Un client sans groupeId (legacy/partagé) reste visible dans tous les cas.
  let blsFiltered = bls;
  if (groupeId) {
    const groupeById: Record<string, string | undefined> = {};
    const groupeByNom: Record<string, string | undefined> = {};
    clientRows.forEach(c => {
      const cg = c.groupeId != null ? S(c.groupeId) : undefined;
      groupeById[S(c.id)] = cg;
      if (c.nom) groupeByNom[S(c.nom)] = cg;
    });
    blsFiltered = bls.filter(b => {
      const cg = b.clientId ? groupeById[S(b.clientId)] : groupeByNom[S(b.clientNom)];
      return cg == null || cg === groupeId;
    });
  }
  const blsSource = blsFiltered;

  const fOutstanding: CreditEntry[] = credits
    .filter(c => S(c.statut) !== "solde")
    .map(c => ({ nom: S(c.fournisseurNom) || "—", date: day(c.dateAchat ?? c.date), reste: Math.max(0, N(c.montant) - N(c.montantPaye)) }))
    .filter(e => e.reste > 0);

  const bonsJour = bonsAchat.filter(b => day(b.date) === dateJ);
  const valeurAchatJour = bonsJour.reduce((s, b) => {
    const lignes = Array.isArray(b.lignes) ? b.lignes as Row[] : [];
    return s + lignes.reduce((t, l) => t + N(l.quantite) * N(l.prixAchat), 0);
  }, 0);
  const creditFJour = fOutstanding.filter(e => e.date === dateJ).reduce((s, e) => s + e.reste, 0);
  const nbFournisseursJour = new Set(bonsJour.map(b => S(b.fournisseurNom)).filter(Boolean)).size;

  const fournisseurs = summarize(fOutstanding, valeurAchatJour, creditFJour, nbFournisseursJour);

  // ── CLIENTS (crédit = BL « émis » non encaissés) ──────────────────────────
  const clientCredit: CreditEntry[] = blsSource
    .filter(b => S(b.statut) === "émis" || S(b.statut) === "emis")
    .map(b => ({
      nom: S(b.clientNom) || "—",
      date: day(b.date),
      reste: N(b.montantTTC) || N(b.montantTotal),
      extra: S(b.prevendeurNom) || undefined,    // prévendeur porteur du crédit
    }))
    .filter(e => e.reste > 0);

  const blsJour = blsSource.filter(b => day(b.date) === dateJ);
  const valeurVenteJour = blsJour.reduce((s, b) => s + (N(b.montantTTC) || N(b.montantTotal)), 0);
  const creditCJour = clientCredit.filter(e => e.date === dateJ).reduce((s, e) => s + e.reste, 0);
  const nbClientsJour = new Set(blsJour.map(b => S(b.clientNom)).filter(Boolean)).size;

  const clients = summarize(clientCredit, valeurVenteJour, creditCJour, nbClientsJour);

  // Prévendeurs : plus ancien crédit + plus grande valeur
  const byPrev: Record<string, number> = {};
  clientCredit.forEach(e => { if (e.extra) byPrev[e.extra] = (byPrev[e.extra] || 0) + e.reste; });
  const prevPlusGrand = Object.entries(byPrev).sort((a, b) => b[1] - a[1])[0] ?? null;
  const oldest = clients.plusAncien;
  const prevendeurs = {
    plusAncienCredit: oldest ? { prevendeur: oldest.extra ?? "—", client: oldest.nom, date: oldest.date, montant: oldest.reste } : null,
    plusGrandCredit: prevPlusGrand ? { prevendeur: prevPlusGrand[0], montant: prevPlusGrand[1] } : null,
  };

  return { date: dateJ, fournisseurs, clients, prevendeurs, generatedAt: new Date().toISOString() };
}

type Report = Awaited<ReturnType<typeof buildReport>>;

function sideHtml(titre: string, r: SideReport, unit: string): string {
  const row = (k: string, v: string) => `<tr><td style="padding:6px 10px;color:#555">${k}</td><td style="padding:6px 10px;text-align:right;font-weight:700">${v}</td></tr>`;
  return `
  <h3 style="color:#1a4d2e;margin:18px 0 6px">${titre}</h3>
  <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:8px">
    ${row(`Valeur ${unit} (J)`, money(r.jour.valeur))}
    ${row("Valeur crédit (J)", money(r.jour.credit))}
    ${row("% crédit (J)", r.jour.pct + " %")}
    ${row("Nb tiers (J)", String(r.jour.nbTiers))}
    ${row("Total des crédits", `<span style="color:#b91c1c">${money(r.totalCredits)}</span>`)}
    ${row("Plus grand montant", r.plusGrand ? `${money(r.plusGrand.reste)} — ${r.plusGrand.nom} (${r.plusGrand.date})` : "—")}
    ${row("Plus ancien crédit", r.plusAncien ? `${r.plusAncien.date} — ${r.plusAncien.nom} (${money(r.plusAncien.reste)})` : "—")}
    ${row("Top 3 crédits", r.top3.length ? r.top3.map((t, i) => `${i + 1}. ${t.nom} (${money(t.total)})`).join("<br>") : "—")}
  </table>`;
}

function reportHtml(rep: Report): string {
  const p = rep.prevendeurs;
  return `
  <div style="font-family:Inter,Arial,sans-serif;max-width:640px;margin:0 auto;background:#f8faf8;padding:20px;border-radius:12px">
    <h2 style="color:#1a4d2e;margin:0 0 2px">📊 Rapport crédit quotidien — ${rep.date}</h2>
    <p style="color:#777;font-size:12px;margin:0 0 10px">Vita Fresh · VitaCore Group — généré automatiquement</p>
    ${sideHtml("🏭 Fournisseurs", rep.fournisseurs, "achat")}
    ${sideHtml("👥 Clients", rep.clients, "vente")}
    <h3 style="color:#1a4d2e;margin:18px 0 6px">🧑‍💼 Prévendeurs</h3>
    <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:8px">
      <tr><td style="padding:6px 10px;color:#555">Plus ancien crédit</td><td style="padding:6px 10px;text-align:right;font-weight:700">${p.plusAncienCredit ? `${p.plusAncienCredit.prevendeur} — client ${p.plusAncienCredit.client}, ${p.plusAncienCredit.date} (${money(p.plusAncienCredit.montant)})` : "—"}</td></tr>
      <tr><td style="padding:6px 10px;color:#555">Plus grande valeur de crédit</td><td style="padding:6px 10px;text-align:right;font-weight:700">${p.plusGrandCredit ? `${p.plusGrandCredit.prevendeur} (${money(p.plusGrandCredit.montant)})` : "—"}</td></tr>
    </table>
    <p style="color:#999;font-size:11px;margin-top:14px">Détail complet : ERP → Finance & Contrôle → Analyse Crédit</p>
  </div>`;
}

router.get("/", async (req: Request, res: Response) => {
  if (!SB_SRV) { res.status(500).json({ error: "service-role unavailable" }); return; }

  // Lecture protégée par le même device-guard que le reste de l'app (cookie
  // signé posé à la connexion BO) — ce rapport crédit (soldes fournisseurs +
  // clients) ne doit pas rester accessible sans authentification.
  const wantSendPre = (req.query["send"] as string | undefined) === "1";
  const hasValidDevice = !requireDeviceApi(req);
  if (!wantSendPre && !hasValidDevice) {
    res.status(401).json({ error: "Device non autorisé" });
    return;
  }

  const dateJ = (req.query["date"] as string | undefined) || new Date().toISOString().slice(0, 10);
  // groupeId : filtre optionnel côté équipe (BOAnalyseCredit.tsx l'envoie pour
  // un membre d'équipe non super_super_admin — cf. effectiveGroupId côté BO).
  // Absent → rapport global (comportement historique, utilisé aussi par le cron).
  const groupeId = (req.query["groupeId"] as string | undefined) || null;
  const rep = await buildReport(dateJ, groupeId);

  // ── Envoi email (cron quotidien ou bouton « Envoyer maintenant ») ─────────
  // Deux façons d'être autorisé : device BO connu (bouton interactif, cookie
  // signé — pas de clé transmise/exposée côté client), ou clé CRON_SECRET/
  // DEVICE_BYPASS_KEY (cron sans session navigateur). Aucun fallback public.
  const wantSend = (req.query["send"] as string | undefined) === "1";
  if (wantSend) {
    const key = (req.query["key"] as string | undefined) ?? (req.headers.authorization ?? "").replace("Bearer ", "") ?? "";
    if (!hasValidDevice && (!SEND_KEY || key !== SEND_KEY)) {
      res.status(401).json({ error: "clé d'envoi invalide" });
      return;
    }
    const to = (req.query["to"] as string | undefined) || process.env.REPORT_EMAIL || "contact@vita-core.org";
    try {
      // NOTE: /api/ext/send-email n'a pas encore été porté vers Express ;
      // appel best-effort relatif (no-op silencieux si l'endpoint est absent).
      const origin = `${req.protocol}://${req.get("host")}`;
      const sendRes = await fetch(`${origin}/api/ext/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          subject: `📊 Rapport crédit ${rep.date} — F: ${money(rep.fournisseurs.totalCredits)} · C: ${money(rep.clients.totalCredits)}`,
          html: reportHtml(rep),
        }),
      });
      const mail = await sendRes.json().catch(() => ({}));
      res.json({ ...rep, emailSent: sendRes.ok, emailDetail: mail });
      return;
    } catch (e) {
      res.json({ ...rep, emailSent: false, emailDetail: { error: String(e) } });
      return;
    }
  }

  res.json(rep);
});

export default router;
