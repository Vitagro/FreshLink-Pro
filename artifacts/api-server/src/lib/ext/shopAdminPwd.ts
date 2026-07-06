import bcrypt from "bcryptjs";

// Mot de passe admin du shop, modifiable depuis l'UI.
//
// Source de vérité (par ordre de priorité) :
//   1. Hash bcrypt stocké dans Supabase  fl_notices  (id = "shop_admin_secret",
//      payload = { hash }).  → modifiable à chaud par l'admin, sans redéploiement.
//   2. Fallback : variable d'env  SHOP_ADMIN_PASSWORD  (comparaison à temps
//      constant).  → garde la compat tant qu'aucun hash n'a été défini.
//
// Aucune valeur en clair n'est jamais renvoyée au client.

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://bxdqkigoidwnscsjafwd.supabase.co";
const SB_SRV = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.service_role || process.env.SUPABASE_SERVICE_KEY) ?? "";
const ENV_PWD = process.env.SHOP_ADMIN_PASSWORD ?? "";

const SECRET_ID = "shop_admin_secret";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function readStoredHash(): Promise<string | null> {
  if (!SB_SRV) return null;
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/fl_notices?id=eq.${SECRET_ID}&select=payload`,
      { headers: { apikey: SB_SRV, Authorization: `Bearer ${SB_SRV}` } },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as { payload?: { hash?: string } }[];
    const hash = rows?.[0]?.payload?.hash;
    return typeof hash === "string" && hash.length > 0 ? hash : null;
  } catch {
    return null;
  }
}

export async function shopAdminConfigured(): Promise<boolean> {
  if (ENV_PWD) return true;
  return (await readStoredHash()) !== null;
}

export async function verifyShopAdminPassword(candidate: string): Promise<boolean> {
  if (typeof candidate !== "string" || candidate.length === 0) return false;
  const hash = await readStoredHash();
  if (hash) {
    try { return await bcrypt.compare(candidate, hash); } catch { return false; }
  }
  if (ENV_PWD) return safeEqual(candidate, ENV_PWD);
  return false;
}

export async function changeShopAdminPassword(current: string, next: string): Promise<string | null> {
  if (!SB_SRV) return "Service-role Supabase manquante côté serveur — impossible d'enregistrer.";
  if (!(await shopAdminConfigured())) {
    return "Aucun mot de passe admin configuré (ni hash, ni SHOP_ADMIN_PASSWORD). Définissez d'abord SHOP_ADMIN_PASSWORD sur Vercel.";
  }
  if (!(await verifyShopAdminPassword(current))) return "Mot de passe actuel incorrect.";
  if (typeof next !== "string" || next.length < 6) return "Le nouveau mot de passe doit faire au moins 6 caractères.";

  const hash = await bcrypt.hash(next, 10);
  try {
    const res = await fetch(`${SB_URL}/rest/v1/fl_notices`, {
      method: "POST",
      headers: {
        apikey: SB_SRV,
        Authorization: `Bearer ${SB_SRV}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({ id: SECRET_ID, payload: { hash }, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) return `Échec de l'enregistrement (${res.status}).`;
    return null;
  } catch (e) {
    return String(e);
  }
}
