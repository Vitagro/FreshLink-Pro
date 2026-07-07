import { Router } from "express";
import type { Request, Response } from "express";
import { requireDeviceApi } from "../../lib/deviceGuard.js";
import { SB_URL, SB_SERVICE_KEY, sbServiceHeaders } from "../../lib/ext/supabaseEnv.js";

// ══════════════════════════════════════════════════════════════
// GET /api/ext/storage-usage
// Calcule la taille totale utilisée dans le bucket Supabase Storage
// "freshlink-media" (Supabase n'expose pas d'API d'usage agrégé côté
// client/service_role — on doit donc parcourir récursivement les
// dossiers et sommer metadata.size de chaque fichier).
// ══════════════════════════════════════════════════════════════

const router = Router();
const BUCKET = "freshlink-media";

interface StorageEntry {
  name: string;
  id: string | null;
  metadata?: { size?: number } | null;
}

async function listFolderBytes(prefix: string): Promise<number> {
  let total = 0;
  let offset = 0;
  const limit = 1000;
  for (;;) {
    const r = await fetch(`${SB_URL}/storage/v1/object/list/${BUCKET}`, {
      method: "POST",
      headers: sbServiceHeaders(),
      body: JSON.stringify({ prefix, limit, offset, sortBy: { column: "name", order: "asc" } }),
    });
    if (!r.ok) break;
    const entries = (await r.json()) as StorageEntry[];
    if (!Array.isArray(entries) || entries.length === 0) break;
    for (const entry of entries) {
      if (entry.metadata && typeof entry.metadata.size === "number") {
        total += entry.metadata.size;
      } else if (entry.id === null) {
        // sous-dossier — on descend d'un niveau
        const subPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
        total += await listFolderBytes(subPrefix);
      }
    }
    if (entries.length < limit) break;
    offset += limit;
  }
  return total;
}

router.get("/", async (req: Request, res: Response) => {
  if (requireDeviceApi(req)) {
    res.status(401).json({ ok: false, error: "Device non autorisé" });
    return;
  }
  if (!SB_SERVICE_KEY) {
    res.status(500).json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY manquante" });
    return;
  }
  try {
    const totalBytes = await listFolderBytes("");
    res.json({ ok: true, bucket: BUCKET, totalBytes, checkedAt: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
