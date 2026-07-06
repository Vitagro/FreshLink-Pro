// Lecture/écriture de la config "Intégration Site Web" (clé API + options),
// stockée dans fl_notices (id = "web_integration_config"), même schéma JSONB
// que les autres réglages ponctuels (cf. shopAdminPwd.ts).

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "https://bxdqkigoidwnscsjafwd.supabase.co";
const SB_SRV = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.service_role || process.env.SUPABASE_SERVICE_KEY) ?? "";

const CONFIG_ID = "web_integration_config";

export interface WebIntegrationConfig {
  apiKey: string;
  enabled: boolean;
  allowedOrigins: string[];
  cataloguePublic: boolean;
  commandesPubliques: boolean;
  demandesComptes: boolean;
  webhookUrl?: string;
  webhookSecret?: string;
  updatedAt: string;
  updatedBy?: string;
}

export async function readWebIntegrationConfig(): Promise<WebIntegrationConfig | null> {
  if (!SB_SRV) return null;
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/fl_notices?id=eq.${CONFIG_ID}&select=payload`,
      { headers: { apikey: SB_SRV, Authorization: `Bearer ${SB_SRV}` } },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as { payload?: WebIntegrationConfig }[];
    return rows?.[0]?.payload ?? null;
  } catch {
    return null;
  }
}

export async function writeWebIntegrationConfig(cfg: WebIntegrationConfig): Promise<boolean> {
  if (!SB_SRV) return false;
  try {
    const res = await fetch(`${SB_URL}/rest/v1/fl_notices`, {
      method: "POST",
      headers: {
        apikey: SB_SRV,
        Authorization: `Bearer ${SB_SRV}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({ id: CONFIG_ID, payload: cfg, updated_at: new Date().toISOString() }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Vérifie une clé API candidate envoyée par un site externe (header X-Api-Key).
 * N'est appelé que si le header est présent — sans header, le comportement
 * public existant des routes (catalogue, commandes) reste inchangé.
 */
export async function verifyApiKey(candidate: string | undefined): Promise<boolean> {
  if (!candidate) return false;
  const cfg = await readWebIntegrationConfig();
  if (!cfg || !cfg.enabled || !cfg.apiKey) return false;
  return candidate === cfg.apiKey;
}
