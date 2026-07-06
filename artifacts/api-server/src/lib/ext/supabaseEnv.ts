// ─────────────────────────────────────────────────────────────────────────────
// Configuration Supabase centralisée (côté serveur / API).
//
// Avant : l'URL et la clé étaient redéclarées en dur dans ~30 fichiers de routes,
// avec des fallbacks dupliqués. Source de dette et de divergence. On centralise ici.
//
// La clé `anon` est publique par conception ; la clé `service_role` (secrète)
// ne doit JAMAIS être codée en dur — elle vient exclusivement de l'environnement.
// ─────────────────────────────────────────────────────────────────────────────

/** URL du projet Supabase. Fallback = projet de production VitaFresh. */
export const SB_URL: string =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  process.env.VITE_SUPABASE_URL ??
  "https://bxdqkigoidwnscsjafwd.supabase.co";

/**
 * Clé service_role (contourne RLS) — obligatoire pour les écritures serveur.
 * Aucune valeur en dur : si absente, les routes concernées renvoient une erreur
 * explicite plutôt que d'utiliser une clé périmée.
 */
export const SB_SERVICE_KEY: string =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.service_role ||
  process.env.SUPABASE_SERVICE_KEY ||
  "";

/** Clé anon (publique) — lecture seule côté navigateur, repli si pas de service_role. */
export const SB_ANON_KEY: string =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY ??
  "";

/** En-têtes REST Supabase prêts à l'emploi avec la clé service_role. */
export function sbServiceHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: SB_SERVICE_KEY,
    Authorization: `Bearer ${SB_SERVICE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}
