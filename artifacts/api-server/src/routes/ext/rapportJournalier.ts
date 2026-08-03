import { Router } from "express";
import type { Request, Response } from "express";
import { requireDeviceApi } from "../../lib/deviceGuard.js";
import { sendEmail } from "../../lib/email.js";

// ══════════════════════════════════════════════════════════════════════════════
// /api/ext/rapport-journalier — Rapport quotidien (ventes/achats/marge/BL)
//
//   POST { to, subject, body } → envoi manuel (bouton "Envoyer maintenant",
//                                 données calculées côté client depuis le cache)
//                                 device connu requis (cf. requireDeviceApi)
//   GET                        → rapport JSON (device connu requis)
//   GET  ?send=1&key=…&to=…    → calcule (Supabase, données du jour) ET envoie
//                                 (device connu OU clé = CRON_SECRET/DEVICE_BYPASS_KEY)
//                                 Un cron quotidien (20h) appelle cette route avec la clé.
//
// L'envoi passe par /api/ext/send-email (Brevo/Resend, jamais de SMTP brut —
// voir ce fichier pour le détail des fournisseurs).
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
// Pas de valeur par défaut : cf. rapportCredit.ts — un secret public connu en
// fallback annule toute protection par clé.
const SEND_KEY = process.env.CRON_SECRET || process.env.DEVICE_BYPASS_KEY || "";

function corsHeaders(origin: string | undefined) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

router.use((req: Request, res: Response, next) => {
  Object.entries(corsHeaders(req.headers.origin)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
});

type Row = Record<string, unknown>;
async function sbRows(table: string, limit = 4000): Promise<Row[]> {
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
const fmtMAD = (n: number) => `${n.toLocaleString("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`;
const day = (d: unknown) => S(d).slice(0, 10);

async function buildReport(dateJ: string) {
  const [commandes, bonsAchat, bls] = await Promise.all([
    sbRows("fl_commandes"), sbRows("fl_bons_achat"), sbRows("fl_bons_livraison"),
  ]);

  const cmdsJour = commandes.filter(c => day(c.date) === dateJ);
  const bonsJour = bonsAchat.filter(b => day(b.date) === dateJ);
  const blsJour = bls.filter(b => day(b.date) === dateJ);

  const totalVentes = cmdsJour.reduce((s, c) => {
    const lignes = Array.isArray(c.lignes) ? c.lignes as Row[] : [];
    return s + lignes.reduce((t, l) => t + N(l.total), 0);
  }, 0);
  const totalAchats = bonsJour.reduce((s, b) => {
    const lignes = Array.isArray(b.lignes) ? b.lignes as Row[] : [];
    return s + lignes.reduce((t, l) => t + N(l.quantite) * N(l.prixUnitaire ?? l.prixAchat), 0);
  }, 0);
  const margeJour = totalVentes - totalAchats;
  const margePct = totalVentes > 0 ? (margeJour / totalVentes * 100) : 0;

  const body = `RAPPORT JOURNALIER — FreshLink Vita Fresh
Date : ${dateJ}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 COMMERCIAL
• Commandes du jour : ${cmdsJour.length}
• Total Ventes : ${fmtMAD(totalVentes)}

🛒 ACHATS
• Bons d'achat : ${bonsJour.length}
• Total Achats : ${fmtMAD(totalAchats)}

💰 MARGE BRUTE DU JOUR
• Marge : ${fmtMAD(margeJour)} (${margePct.toFixed(1)}%)

🚛 LIVRAISONS
• BL du jour : ${blsJour.length}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Envoyé automatiquement par FreshLink Vita Fresh
© ${new Date().getFullYear()} Vita Fresh — Casablanca`;

  return { dateJ, body, totalVentes, totalAchats, margeJour, nbCommandes: cmdsJour.length, nbBonsAchat: bonsJour.length, nbBls: blsJour.length };
}

// Appel direct en process (pas de round-trip HTTP vers /api/ext/send-email,
// qui exige un device connu — un cron n'en a pas) : sendEmail() reste la
// seule voie d'envoi, mais utilisee ici comme fonction, pas comme route
// publique atteignable sans authentification.
async function sendViaEmailEndpoint(_req: Request, to: string, subject: string, body: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const result = await sendEmail({ to, subject, text: body });
    if (!result.ok) return { ok: false, error: result.error ?? "Email send failed" };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

router.get("/", async (req: Request, res: Response) => {
  if (!SB_SRV) { res.status(500).json({ error: "service-role unavailable" }); return; }

  const dateJ = (req.query["date"] as string | undefined) || new Date().toISOString().slice(0, 10);
  const wantSend = (req.query["send"] as string | undefined) === "1";
  const hasValidDevice = !requireDeviceApi(req);
  if (!wantSend) {
    // Lecture protégée par le device-guard (cookie signé posé à la connexion
    // BO) — ce rapport (CA, achats, marge du jour) ne doit pas être public.
    if (!hasValidDevice) { res.status(401).json({ error: "Device non autorisé" }); return; }
    const rep = await buildReport(dateJ);
    res.json(rep);
    return;
  }

  // Autorisé via device BO connu (pas de clé exposée côté client) ou clé
  // CRON_SECRET/DEVICE_BYPASS_KEY (cron sans session navigateur, aucun fallback).
  const key = (req.query["key"] as string | undefined) ?? (req.headers.authorization ?? "").replace("Bearer ", "") ?? "";
  if (!hasValidDevice && (!SEND_KEY || key !== SEND_KEY)) {
    res.status(401).json({ error: "clé d'envoi invalide" });
    return;
  }
  const to = (req.query["to"] as string | undefined) || process.env.REPORT_EMAIL || "contact@vita-core.org";
  const rep = await buildReport(dateJ);
  const r = await sendViaEmailEndpoint(req, to, `Rapport Journalier Vita Fresh — ${dateJ}`, rep.body);
  if (!r.ok) { res.status(502).json({ ...rep, emailSent: false, error: r.error }); return; }
  res.json({ ...rep, emailSent: true });
});

router.post("/", async (req: Request, res: Response) => {
  // Sans ce garde-fou, ce endpoint servait de relais email ouvert (n'importe
  // qui pouvait faire envoyer un email arbitraire, sujet/corps inclus, depuis
  // l'adresse d'expedition de l'app — abus spam/phishing).
  if (requireDeviceApi(req)) { res.status(401).json({ error: "Device non autorisé" }); return; }
  const payload = (req.body ?? {}) as { to?: string; subject?: string; body?: string };
  const { to, subject, body } = payload;
  if (!to || !subject || !body) {
    res.status(400).json({ error: "Missing fields" });
    return;
  }
  const r = await sendViaEmailEndpoint(req, to, subject, body);
  if (!r.ok) { res.status(502).json({ error: r.error ?? "Email send failed" }); return; }
  res.json({ ok: true });
});

export default router;
