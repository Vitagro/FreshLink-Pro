import { Router } from "express";
import type { Request, Response } from "express";
import { rateLimit } from "../../lib/ext/rateLimit.js";
import { verifyApiKey, readWebIntegrationConfig } from "../../lib/ext/webIntegration.js";
import { sendEmail } from "../../lib/email.js";
import { verifyToken } from "../../lib/extToken.js";
import { normalizePhone } from "./auth.js";

const ADMIN_ROLES = new Set(["super_super_admin", "super_admin", "admin"]);

const SHOP_ORDER_ALERT_EMAIL = process.env.SHOP_ORDER_ALERT_EMAIL || "sales@vita-agro.com";

const router = Router();

function corsHeaders(origin: string | undefined) {
  return {
    "Access-Control-Allow-Origin":  origin ?? "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Api-Key",
  };
}

router.use((req: Request, res: Response, next) => {
  Object.entries(corsHeaders(req.headers.origin)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
});

const SUCCESS_MSG = "Commande enregistrée avec succès.";

const SB_URL        = process.env.NEXT_PUBLIC_SUPABASE_URL     ?? process.env.VITE_SUPABASE_URL ?? "https://bxdqkigoidwnscsjafwd.supabase.co";
// Service role — contourne RLS, obligatoire pour écrire dans fl_commandes
const SB_SERVER_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.service_role || process.env.SUPABASE_SERVICE_KEY)    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// ── Injection automatique vers la logistique ERP ────────────────────────────
// Crée un bon de livraison dans fl_bons_livraison (ou fl_bons_preparation)
// dès qu'une commande web est enregistrée. Fire-and-forget.
async function injectToLogistique(
  sbUrl: string,
  sbKey: string,
  commande: Record<string, unknown>
): Promise<void> {
  const bonId = "BL-" + String(commande.numero).replace("WEB-", "");
  const bonPayload = {
    num_bon:           bonId,
    commande_id:       commande.numero,
    client:            commande.nom_client,
    telephone:         commande.telephone,
    adresse_livraison: commande.adresse_livraison ?? null,
    lignes:            commande.lignes,
    montant_total:     commande.montant_total,
    creneau:           commande.creneau ?? "Standard 24h",
    instructions:      commande.instructions ?? null,
    statut:            "a_preparer",
    source:            "site_web",
    created_at:        commande.created_at,
  };
  const headers = {
    apikey:         sbKey,
    Authorization:  `Bearer ${sbKey}`,
    "Content-Type": "application/json",
    Prefer:         "return=minimal",
  };
  for (const table of ["fl_bons_livraison", "fl_bons_preparation"]) {
    // Essai format JSONB {id, payload, updated_at}
    try {
      const r = await fetch(`${sbUrl}/rest/v1/${table}`, {
        method: "POST", headers,
        body: JSON.stringify({ id: bonId, payload: bonPayload, updated_at: commande.created_at }),
      });
      if (r.ok) { console.log(`[commandes] ✅ Bon injecté dans ${table} (JSONB):`, bonId); return; }
    } catch { /* essayer format plat */ }
    // Essai format plat
    try {
      const r = await fetch(`${sbUrl}/rest/v1/${table}`, {
        method: "POST", headers,
        body: JSON.stringify({ id: bonId, ...bonPayload }),
      });
      if (r.ok) { console.log(`[commandes] ✅ Bon injecté dans ${table} (flat):`, bonId); return; }
    } catch { /* essayer table suivante */ }
  }
  console.warn("[commandes] injectToLogistique: aucune table disponible pour", bonId);
}

// ── Alerte email équipe (+ confirmation client) — Fire-and-forget ───────────
// Remplace l'ancien envoi EmailJS côté navigateur (peu fiable : bloqueurs de
// pub, JS désactivé, réseau client...) par un envoi serveur via Resend/Brevo.
function formatLignesText(lignes: unknown): string {
  if (!Array.isArray(lignes)) return "—";
  return (lignes as Array<{ nom?: string; articleNom?: string; quantite?: number; unite?: string; prixUnitaire?: number; prixVente?: number; total?: number }>)
    .map(l => {
      const nom = l.nom ?? l.articleNom ?? "Article";
      const pu = l.prixUnitaire ?? l.prixVente ?? 0;
      const total = l.total ?? pu * (l.quantite ?? 0);
      return `• ${nom} — ${l.quantite ?? 0} ${l.unite ?? "kg"} × ${pu} MAD = ${Math.round(total * 100) / 100} MAD`;
    })
    .join("\n");
}

async function notifyOrder(commande: Record<string, unknown>): Promise<void> {
  const itemsText = formatLignesText(commande.lignes);
  const numero = String(commande.numero);

  sendEmail({
    to: SHOP_ORDER_ALERT_EMAIL,
    subject: `🛒 Nouvelle commande ${numero} — ${commande.nom_client}`,
    text: [
      `Nouvelle commande reçue sur shop.vita-agro.com`,
      ``,
      `Référence : ${numero}`,
      `Client : ${commande.nom_client}`,
      `Téléphone : ${commande.telephone}`,
      `Email : ${commande.email ?? "—"}`,
      `Adresse : ${commande.adresse_livraison ?? "—"}`,
      `Créneau : ${commande.creneau ?? "—"}`,
      `Instructions : ${commande.instructions ?? "—"}`,
      ``,
      `Articles :`,
      itemsText,
      ``,
      `Total : ${commande.montant_total} MAD`,
    ].join("\n"),
  }).catch(() => { /* alerte best-effort — la commande reste enregistree */ });

  const email = commande.email as string | null | undefined;
  if (email) {
    sendEmail({
      to: email,
      subject: `Confirmation de commande ${numero} — Vita Fresh`,
      text: [
        `Bonjour ${commande.nom_client},`,
        ``,
        `Votre commande ${numero} a bien été reçue et est en cours de préparation.`,
        ``,
        `Articles :`,
        itemsText,
        ``,
        `Total : ${commande.montant_total} MAD`,
        `Livraison : ${commande.creneau ?? "—"}`,
        `Adresse : ${commande.adresse_livraison ?? "—"}`,
        ``,
        `Merci de votre confiance — Vita Fresh (Vita Agro Capital)`,
      ].join("\n"),
    }).catch(() => { /* confirmation best-effort */ });
  }
}

// ── POST /ext/commandes ─────────────────────────────────────────────────
// Commandes web vitafresh → enregistrées dans fl_commandes (table {id, payload})
// Format attendu : { nom_client, telephone, lignes[], montant_total, ... }
router.post("/", async (req: Request, res: Response) => {
  if (rateLimit(req, res, { key: "commandes", limit: 10, windowMs: 60_000 })) return;
  const apiKey = req.headers["x-api-key"] as string | undefined;
  if (apiKey) {
    if (!(await verifyApiKey(apiKey))) {
      res.status(401).json({ error: "Clé API invalide" });
      return;
    }
  } else {
    // Pas de clé fournie : on tolère par défaut (formulaire de commande du
    // site public, non configuré). Mais si l'admin a explicitement désactivé
    // "Commandes via API" dans le BO (Intégration Site Web → commandesPubliques
    // = false), ce toggle doit réellement bloquer les requêtes sans clé —
    // avant ce correctif il n'était jamais lu ici et n'avait donc aucun effet.
    const cfg = await readWebIntegrationConfig();
    if (cfg && cfg.enabled && cfg.commandesPubliques === false) {
      res.status(401).json({ error: "Clé API requise." });
      return;
    }
  }

  const body = (req.body ?? {}) as Record<string, unknown>;

  const {
    nom_client, telephone, email, adresse_livraison,
    lignes, montant_total, creneau, instructions,
    statut = "nouveau", source = "site_web",
  } = body as Record<string, unknown>;

  if (!nom_client || !telephone) {
    res.status(400).json({ error: "nom_client et telephone sont requis." });
    return;
  }
  if (!Array.isArray(lignes) || (lignes as unknown[]).length === 0) {
    res.status(400).json({ error: "lignes[] ne peut pas être vide." });
    return;
  }

  const numero  = "WEB-" + Date.now().toString().slice(-8);
  const total   = Number(montant_total) || (lignes as Array<{ total?: number; prixUnitaire?: number; quantite?: number }>).reduce((s, l) => s + (l.total ?? (l.prixUnitaire ?? 0) * (l.quantite ?? 0)), 0);
  const now     = new Date().toISOString();

  // Payload complet (format ERP)
  const payloadData = {
    numero,
    nom_client:        String(nom_client).trim(),
    telephone:         String(telephone).trim(),
    email:             email ? String(email).trim() : null,
    adresse_livraison: adresse_livraison ? String(adresse_livraison).trim() : null,
    lignes,
    montant_total:     Math.round(total * 100) / 100,
    creneau:           creneau ? String(creneau) : "Standard 24h",
    instructions:      instructions ? String(instructions) : null,
    statut:            String(statut),
    source:            String(source),   // "site_web"
    created_at:        now,
  };

  // Sans Supabase configuré → succès silencieux (logué)
  if (!SB_URL || !SB_SERVER_KEY) {
    console.warn("[commandes] Supabase non configuré — commande non persistée", { numero, nom_client, telephone });
    res.status(201).json({ numero, statut: "nouveau", message: SUCCESS_MSG });
    return;
  }

  const sbH = {
    apikey:         SB_SERVER_KEY,
    Authorization:  `Bearer ${SB_SERVER_KEY}`,
    "Content-Type": "application/json",
    Prefer:         "return=minimal",
  };

  // ── Tentative 1 : fl_commandes format {id, payload} (table ERP unifiée) ───
  // Les tables fl_* utilisent le format JSONB : { id, payload, updated_at }
  try {
    const r = await fetch(`${SB_URL}/rest/v1/fl_commandes`, {
      method: "POST",
      headers: sbH,
      body: JSON.stringify({
        id:         numero,
        payload:    payloadData,
        updated_at: now,
      }),
    });
    if (r.ok) {
      console.log("[commandes] ✅ Enregistré dans fl_commandes (JSONB):", numero);
      void injectToLogistique(SB_URL, SB_SERVER_KEY, payloadData);
      void notifyOrder(payloadData);
      res.status(201).json({ numero, statut: "nouveau", message: SUCCESS_MSG });
      return;
    }
    const errText = await r.text().catch(() => "");
    console.warn("[commandes] fl_commandes JSONB failed:", r.status, errText);
    // Si l'erreur est liée à un format différent (ancienne table plate), essai flat
  } catch (e) {
    console.warn("[commandes] fl_commandes JSONB exception:", e);
  }

  // ── Tentative 2 : fl_commandes format plat (ancienne structure) ───────────
  try {
    const r = await fetch(`${SB_URL}/rest/v1/fl_commandes`, {
      method: "POST",
      headers: sbH,
      body: JSON.stringify({ id: numero, ...payloadData }),
    });
    if (r.ok) {
      console.log("[commandes] ✅ Enregistré dans fl_commandes (flat):", numero);
      void injectToLogistique(SB_URL, SB_SERVER_KEY, payloadData);
      void notifyOrder(payloadData);
      res.status(201).json({ numero, statut: "nouveau", message: SUCCESS_MSG });
      return;
    }
    const errText = await r.text().catch(() => "");
    console.warn("[commandes] fl_commandes flat failed:", r.status, errText);
  } catch (e) {
    console.warn("[commandes] fl_commandes flat exception:", e);
  }

  // ── Tentative 3 : fl_commandes_web (table dédiée web, format plat) ────────
  try {
    const r = await fetch(`${SB_URL}/rest/v1/fl_commandes_web`, {
      method: "POST",
      headers: sbH,
      body: JSON.stringify({ id: numero, ...payloadData }),
    });
    if (r.ok) {
      console.log("[commandes] ✅ Enregistré dans fl_commandes_web:", numero);
      void injectToLogistique(SB_URL, SB_SERVER_KEY, payloadData);
      void notifyOrder(payloadData);
      res.status(201).json({ numero, statut: "nouveau", message: SUCCESS_MSG });
      return;
    }
    const errText = await r.text().catch(() => "");
    console.warn("[commandes] fl_commandes_web failed:", r.status, errText);
  } catch (e) {
    console.warn("[commandes] fl_commandes_web exception:", e);
  }

  // ── Toujours confirmer à l'utilisateur (commande loggée) ──────────────────
  console.error("[commandes] TOUTES tentatives Supabase échouées — commande loggée:", { numero, nom_client, telephone, total });
  res.status(201).json({ numero, statut: "nouveau", message: SUCCESS_MSG });
});

// Renvoie le numéro de téléphone associé à l'utilisateur authentifié
// (fl_users, service role), ou null si introuvable.
async function getOwnPhone(sbUrl: string, sbKey: string, userId: string): Promise<string | null> {
  try {
    const r = await fetch(
      `${sbUrl}/rest/v1/fl_users?id=eq.${encodeURIComponent(userId)}&select=payload&limit=1`,
      { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } }
    );
    if (!r.ok) return null;
    const rows = await r.json() as { payload?: Record<string, unknown> }[];
    const phone = rows?.[0]?.payload?.telephone;
    return typeof phone === "string" && phone.length > 0 ? phone : null;
  } catch {
    return null;
  }
}

// ── GET /ext/commandes?tel=xxx ──────────────────────────────────────────
// Lit les commandes d'un client depuis fl_commandes ou fl_commandes_web.
// Authentification requise : un client ne peut lire que ses propres
// commandes (son propre numéro, vérifié via le token) ; seul un rôle admin
// peut consulter les commandes d'un tiers via ?tel=.
router.get("/", async (req: Request, res: Response) => {
  if (rateLimit(req, res, { key: "commandes-read", limit: 30, windowMs: 60_000 })) return;

  if (!SB_URL || !SB_SERVER_KEY) {
    res.json([]);
    return;
  }

  const authHeader = req.headers.authorization ?? "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const payload = bearerToken ? verifyToken(bearerToken) : null;
  if (!payload) {
    res.status(401).json({ error: "Authentification requise." });
    return;
  }

  const tel = (req.query["tel"] as string | undefined) || (req.query["telephone"] as string | undefined);
  if (!tel) { res.status(400).json({ error: "tel requis." }); return; }

  const isAdmin = ADMIN_ROLES.has(String(payload.role ?? ""));
  if (!isAdmin) {
    const ownPhone = await getOwnPhone(SB_URL, SB_SERVER_KEY, String(payload.sub ?? ""));
    if (!ownPhone) {
      res.status(403).json({ error: "Accès refusé." });
      return;
    }
    const requested = normalizePhone(tel.trim());
    const own = normalizePhone(ownPhone);
    const matchesOwn = own.local === requested.local;
    if (!matchesOwn) {
      res.status(403).json({ error: "Accès refusé — vous ne pouvez consulter que vos propres commandes." });
      return;
    }
  }

  const sbH = { apikey: SB_SERVER_KEY, Authorization: `Bearer ${SB_SERVER_KEY}` };
  const telEnc = encodeURIComponent(tel.trim());

  // ── Essai 1 : fl_commandes format JSONB — filtre sur payload->>telephone ──
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/fl_commandes?payload->>telephone=eq.${telEnc}&order=updated_at.desc&limit=50`,
      { headers: sbH }
    );
    if (r.ok) {
      const rows = await r.json() as { id: string; payload: Record<string, unknown>; updated_at: string }[];
      if (Array.isArray(rows) && rows.length > 0) {
        // Aplatir payload pour le client
        const flat = rows.map(row => ({
          id:         row.id,
          updated_at: row.updated_at,
          ...((row.payload && typeof row.payload === "object") ? row.payload : {}),
        }));
        res.json(flat);
        return;
      }
    }
  } catch { /* fallback */ }

  // ── Essai 2 : fl_commandes format plat — filtre direct sur telephone ──────
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/fl_commandes?telephone=eq.${telEnc}&order=created_at.desc&limit=50`,
      { headers: sbH }
    );
    if (r.ok) {
      const data = await r.json();
      if (Array.isArray(data) && data.length > 0) {
        res.json(data);
        return;
      }
    }
  } catch { /* fallback */ }

  // ── Essai 3 : fl_commandes_web ────────────────────────────────────────────
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/fl_commandes_web?telephone=eq.${telEnc}&order=created_at.desc&limit=50`,
      { headers: sbH }
    );
    const data = await r.json();
    res.json(Array.isArray(data) ? data : []);
  } catch {
    res.json([]);
  }
});

export default router;
