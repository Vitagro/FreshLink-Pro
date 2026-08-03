import { Router } from "express";
import type { Request, Response } from "express";
import { requireDeviceApi } from "../../lib/deviceGuard.js";

// ══════════════════════════════════════════════════════════════════
// /api/ext/gifts — Centre Cadeaux Incentives (Section 1.1)
//
//   Protege par requireDeviceApi (device BO connu) — seul BOGifts.tsx
//   appelle cette route ; sans garde-fou, n'importe qui pouvait
//   attribuer des cadeaux (decremente le stock reel) a distance.
//
//  GET  ?scope=materials    → catalogue des matériels (Balance, Pack couteaux)
//  GET  ?scope=attributions → historique des attributions (joint material)
//  GET  ?clientId=VFC00012  → attributions d'un client précis
//
//  POST { scope:"material",    nom, segment, seuil_type, seuil_valeur, stock_qte, ... }
//  POST { scope:"attribution", clientId, materialId, segment?, declencheParAuto? }
//        → trigger SQL fl_notify_gift décrémente le stock + push notif Direction
//
//  PATCH { id, statut: "a_livrer"|"livre"|"annule" }
//  PATCH { id, scope:"material", stock_qte, actif? }
//  DELETE ?id=...&scope=material|attribution
// ══════════════════════════════════════════════════════════════════

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

function corsHeaders(origin: string | undefined) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

router.use((req: Request, res: Response, next) => {
  Object.entries(corsHeaders(req.headers.origin)).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") { res.sendStatus(204); return; }
  if (requireDeviceApi(req)) { res.status(401).json({ ok: false, error: "Device non autorisé" }); return; }
  next();
});

async function sbFetch(path: string, init: RequestInit = {}): Promise<globalThis.Response> {
  return fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      apikey: SB_SRV,
      Authorization: `Bearer ${SB_SRV}`,
    },
  });
}

// Schéma JSONB unifié {id, payload, updated_at} : aplatit le payload (les colonnes
// plates segment/stock_qte/etc. n'existent pas → on lit/écrit tout dans payload).
type Row = { id: string; [k: string]: unknown };
function flatten(rows: { id: string; payload?: Record<string, unknown> }[]): Row[] {
  return (Array.isArray(rows) ? rows : []).filter(r => !String(r.id).startsWith("__")).map(r => ({ id: r.id, ...(r.payload ?? {}) }));
}
async function readRows(table: string): Promise<Row[]> {
  const res = await sbFetch(`${table}?select=id,payload&limit=5000`);
  if (!res.ok) throw new Error(await res.text());
  return flatten((await res.json()) as { id: string; payload?: Record<string, unknown> }[]);
}
async function upsertRow(table: string, id: string, payload: Record<string, unknown>): Promise<boolean> {
  const res = await sbFetch(table, {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id, payload, updated_at: new Date().toISOString() }),
  });
  return res.ok;
}

// ═══ GET ═══════════════════════════════════════════════════════════
router.get("/", async (req: Request, res: Response) => {
  if (!SB_SRV) { res.status(500).json({ ok: false, error: "service_role manquante" }); return; }

  const scope    = (req.query["scope"] as string | undefined) ?? "materials";
  const clientId = req.query["clientId"] as string | undefined;
  const statut   = req.query["statut"] as string | undefined;

  try {
    if (scope === "materials") {
      const segment = req.query["segment"] as string | undefined;
      let mats = await readRows("fl_gift_materials");
      if (segment) mats = mats.filter(m => String(m.segment ?? "") === segment);
      mats.sort((a, b) => String(a.segment ?? "").localeCompare(String(b.segment ?? "")) || String(a.nom ?? "").localeCompare(String(b.nom ?? "")));
      res.json({ ok: true, data: mats.slice(0, 200) });
      return;
    }

    if (scope === "attributions") {
      let attributions = await readRows("fl_gift_attributions");
      if (clientId) attributions = attributions.filter(a => String(a.client_id ?? "") === clientId);
      if (statut)   attributions = attributions.filter(a => String(a.statut ?? "") === statut);
      attributions.sort((a, b) => String(b.attribue_le ?? "").localeCompare(String(a.attribue_le ?? "")));
      // Joindre le nom du matériel (join JS)
      const materials = await readRows("fl_gift_materials");
      const matMap = new Map(materials.map(m => [m.id, m]));
      const joined = attributions.slice(0, 500).map(a => {
        const m = matMap.get(String(a.material_id));
        return { ...a, material_nom: m?.nom ?? null, material_segment: m?.segment ?? null };
      });
      res.json({ ok: true, data: joined });
      return;
    }

    res.status(400).json({ ok: false, error: `scope inconnu : ${scope}` });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ═══ POST ══════════════════════════════════════════════════════════
router.post("/", async (req: Request, res: Response) => {
  if (!SB_SRV) { res.status(500).json({ ok: false, error: "service_role manquante" }); return; }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const scope = String(body.scope ?? "");
  try {
    if (scope === "material") {
      const segment = String(body.segment ?? "tous");
      if (!["chr", "marchand", "particulier", "tous"].includes(segment)) {
        res.status(400).json({ ok: false, error: "segment invalide" });
        return;
      }
      if (!body.nom || !String(body.nom).trim()) {
        res.status(400).json({ ok: false, error: "nom requis" });
        return;
      }
      const id = body.id ? String(body.id) : "GM_" + Date.now().toString(36).toUpperCase();
      const payload = {
        nom:           String(body.nom).trim(),
        segment,
        description:   body.description   ? String(body.description)   : null,
        photo:         body.photo         ? String(body.photo)         : null,
        stock_qte:     Number(body.stockQte ?? 0) || 0,
        cout_unitaire: Number(body.coutUnitaire ?? 0) || 0,
        seuil_type:    body.seuilType    ? String(body.seuilType)    : null,
        seuil_valeur:  Number(body.seuilValeur ?? 0) || 0,
        actif:         body.actif === false ? false : true,
      };
      if (!await upsertRow("fl_gift_materials", id, payload)) throw new Error("upsert matériel échoué");
      res.json({ ok: true, material: { id, ...payload } });
      return;
    }

    if (scope === "attribution") {
      if (!body.clientId || !body.materialId) {
        res.status(400).json({ ok: false, error: "clientId et materialId requis" });
        return;
      }
      // Vérifier le stock matériel (lecture JSONB)
      const materials = await readRows("fl_gift_materials");
      const mat = materials.find(m => m.id === String(body.materialId));
      if (!mat)                { res.status(404).json({ ok: false, error: "Matériel introuvable" }); return; }
      if (mat.actif === false) { res.status(400).json({ ok: false, error: "Matériel désactivé" }); return; }
      const stockQte = Number(mat.stock_qte ?? 0) || 0;
      if (stockQte <= 0)       { res.status(400).json({ ok: false, error: "Stock matériel épuisé" }); return; }

      const id = "GA" + Date.now().toString(36).toUpperCase();
      const payload = {
        client_id:     String(body.clientId),
        material_id:   String(body.materialId),
        segment:       body.segment      ? String(body.segment)      : String(mat.segment ?? "tous"),
        declenche_par: body.declenchePar ? String(body.declenchePar) : "manuel_bo",
        statut:        "a_livrer",
        attribue_le:   new Date().toISOString(),
      };
      if (!await upsertRow("fl_gift_attributions", id, payload)) throw new Error("upsert attribution échoué");
      // Décrément du stock en code (pas de trigger SQL dans le schéma JSONB)
      const { id: mId, ...matPayload } = mat;
      await upsertRow("fl_gift_materials", mId, { ...matPayload, stock_qte: Math.max(0, stockQte - 1) });
      res.json({
        ok: true,
        attribution: { id, ...payload },
        message: `✅ ${mat.nom} attribué (stock restant : ${Math.max(0, stockQte - 1)})`,
      });
      return;
    }

    // ── scope = seed_defaults : crée une liste de cadeaux par défaut ──
    if (scope === "seed_defaults") {
      const defaults = [
        { id: "GM_BALANCE",  nom: "Balance Numérique Pro 30kg",   segment: "marchand", description: "Balance pro pour épiceries / marchands F&L", seuil_type: "volume_kg",   seuil_valeur: 1000, cout_unitaire: 850 },
        { id: "GM_PACKPRO",  nom: "Pack Pro Couteaux de Chef",    segment: "chr",      description: "Set couteaux pro pour CHR (cafés, hôtels, restaurants)", seuil_type: "volume_kg", seuil_valeur: 800, cout_unitaire: 1200 },
        { id: "GM_CAISSE",   nom: "Lot 10 Caisses Plastiques",    segment: "marchand", description: "Caisses de transport réutilisables", seuil_type: "volume_kg",  seuil_valeur: 500,  cout_unitaire: 350 },
        { id: "GM_TABLIER",  nom: "Tabliers + Toques (x5)",       segment: "chr",      description: "Tenue cuisine brandée Vita Fresh", seuil_type: "montant_mad", seuil_valeur: 20000, cout_unitaire: 400 },
        { id: "GM_FRIGO",    nom: "Vitrine Réfrigérée",           segment: "marchand", description: "Vitrine fraîcheur (gros volume / contrat annuel)", seuil_type: "contrat", seuil_valeur: 1, cout_unitaire: 6500 },
        { id: "GM_PARASOL",  nom: "Parasol + Étal Pro",           segment: "marchand", description: "Étal marché brandé", seuil_type: "volume_kg",  seuil_valeur: 1500,  cout_unitaire: 900 },
        { id: "GM_BONCADO",  nom: "Bon cadeau fidélité 500 MAD",  segment: "tous",     description: "Bon d'achat fidélité tous segments", seuil_type: "montant_mad", seuil_valeur: 50000, cout_unitaire: 500 },
      ];
      let created = 0;
      for (const d of defaults) {
        const { id: dId, ...rest } = d;
        if (await upsertRow("fl_gift_materials", dId, { ...rest, stock_qte: 0, actif: true })) created++;
      }
      res.json({ ok: true, created, total: defaults.length, message: `✅ ${created} cadeaux dans le catalogue` });
      return;
    }

    // ── scope = auto_scan : ALGORITHME d'attribution automatique ──
    //   Scanne fl_clients, cumule leur volume/CA, et attribue les cadeaux
    //   dont le seuil est atteint et pas déjà attribué.
    if (scope === "auto_scan") {
      // 1. Charger matériels actifs en stock (JSONB)
      const materials = (await readRows("fl_gift_materials")).filter(m => m.actif !== false).map(m => ({
        id: m.id, nom: String(m.nom ?? ""), segment: String(m.segment ?? "tous"),
        stock_qte: Number(m.stock_qte ?? 0) || 0, seuil_type: String(m.seuil_type ?? ""), seuil_valeur: Number(m.seuil_valeur ?? 0) || 0,
      }));
      // 2. Charger clients
      const cliRes = await sbFetch("fl_clients?select=id,payload&limit=5000");
      const clients = cliRes.ok ? await cliRes.json() as { id: string; payload: Record<string, unknown> }[] : [];
      // 3. Charger attributions existantes (éviter doublons)
      const existing = await readRows("fl_gift_attributions");
      const dejaAttribue = new Set(existing.map(a => `${a.client_id}|${a.material_id}`));

      const attributions: { client: string; material: string; nom: string }[] = [];
      for (const c of clients) {
        if (String(c.id).startsWith("__")) continue;
        const p = c.payload ?? {};
        const segClient = String(p.categorie ?? p.segment ?? "").toLowerCase();
        const volumeCumule = Number(p.volumeCumuleKg ?? p.tonnageCumule ?? 0) || 0;
        const caCumule = Number(p.caCumule ?? p.chiffreAffaires ?? 0) || 0;
        const aContrat = p.contratSigne === true || p.contrat === true;
        for (const m of materials) {
          if (m.stock_qte <= 0) continue;
          // Segment : "tous" matche tout, sinon doit correspondre
          if (m.segment !== "tous" && !segClient.includes(m.segment)) continue;
          if (dejaAttribue.has(`${c.id}|${m.id}`)) continue;
          // Vérifier le seuil
          let atteint = false;
          if (m.seuil_type === "volume_kg")   atteint = volumeCumule >= m.seuil_valeur;
          else if (m.seuil_type === "montant_mad") atteint = caCumule >= m.seuil_valeur;
          else if (m.seuil_type === "contrat") atteint = aContrat;
          if (!atteint) continue;
          // Attribuer + décrémenter le stock en code (pas de trigger SQL)
          const id = "GA" + Date.now().toString(36).toUpperCase() + Math.floor(Math.random()*99);
          const ok = await upsertRow("fl_gift_attributions", id, { client_id: c.id, material_id: m.id, segment: m.segment, declenche_par: "auto_scan", statut: "a_livrer", attribue_le: new Date().toISOString() });
          if (ok) {
            attributions.push({ client: c.id, material: m.id, nom: m.nom });
            dejaAttribue.add(`${c.id}|${m.id}`); m.stock_qte--;
            await upsertRow("fl_gift_materials", m.id, { nom: m.nom, segment: m.segment, stock_qte: Math.max(0, m.stock_qte), seuil_type: m.seuil_type, seuil_valeur: m.seuil_valeur, actif: true });
          }
        }
      }
      res.json({
        ok: true,
        attribues: attributions.length,
        details: attributions,
        message: attributions.length > 0
          ? `🎁 ${attributions.length} cadeau(x) attribué(s) automatiquement`
          : "Aucun client n'a atteint un seuil cadeau (vérifiez volumeCumuleKg / caCumule / contratSigne dans les profils clients).",
      });
      return;
    }

    res.status(400).json({ ok: false, error: `scope POST inconnu (${scope}). Attendu : material | attribution | seed_defaults | auto_scan` });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ═══ PATCH ═════════════════════════════════════════════════════════
router.patch("/", async (req: Request, res: Response) => {
  if (!SB_SRV) { res.status(500).json({ ok: false, error: "service_role manquante" }); return; }

  const body = (req.body ?? {}) as Record<string, unknown>;
  if (!body.id) { res.status(400).json({ ok: false, error: "id requis" }); return; }

  const id = String(body.id);
  const scope = String(body.scope ?? "attribution");

  try {
    if (scope === "material") {
      const patch: Record<string, unknown> = {};
      if (body.stockQte     !== undefined) patch.stock_qte     = Number(body.stockQte) || 0;
      if (body.coutUnitaire !== undefined) patch.cout_unitaire = Number(body.coutUnitaire) || 0;
      if (body.seuilValeur  !== undefined) patch.seuil_valeur  = Number(body.seuilValeur) || 0;
      if (body.nom         !== undefined)  patch.nom         = String(body.nom);
      if (body.description !== undefined)  patch.description = body.description === null ? null : String(body.description);
      if (body.actif       !== undefined)  patch.actif       = body.actif === true;
      if (Object.keys(patch).length === 0) { res.status(400).json({ ok: false, error: "rien à modifier" }); return; }
      const cur = (await readRows("fl_gift_materials")).find(m => m.id === id);
      if (!cur) { res.status(404).json({ ok: false, error: "Matériel introuvable" }); return; }
      const { id: _mid, ...curPayload } = cur;
      const merged = { ...curPayload, ...patch };
      if (!await upsertRow("fl_gift_materials", id, merged)) throw new Error("upsert matériel échoué");
      res.json({ ok: true, material: { id, ...merged } });
      return;
    }

    // Attribution
    const newStatut = String(body.statut ?? "");
    if (!["a_livrer", "livre", "annule"].includes(newStatut)) {
      res.status(400).json({ ok: false, error: "statut invalide (a_livrer | livre | annule)" });
      return;
    }
    const curAtt = (await readRows("fl_gift_attributions")).find(a => a.id === id);
    if (!curAtt) { res.status(404).json({ ok: false, error: "Attribution introuvable" }); return; }
    const { id: _aid, ...curAttPayload } = curAtt;
    const merged: Record<string, unknown> = { ...curAttPayload, statut: newStatut };
    if (newStatut === "livre") merged.livre_le = new Date().toISOString();
    if (!await upsertRow("fl_gift_attributions", id, merged)) throw new Error("upsert attribution échoué");
    res.json({ ok: true, attribution: { id, ...merged } });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ═══ DELETE ════════════════════════════════════════════════════════
router.delete("/", async (req: Request, res: Response) => {
  if (!SB_SRV) { res.status(500).json({ ok: false, error: "service_role manquante" }); return; }

  const id = req.query["id"] as string | undefined;
  const scope = (req.query["scope"] as string | undefined) ?? "attribution";
  if (!id) { res.status(400).json({ ok: false, error: "id requis" }); return; }

  const table = scope === "material" ? "fl_gift_materials" : "fl_gift_attributions";

  try {
    const r = await sbFetch(`${table}?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!r.ok) throw new Error(await r.text());
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

export default router;
