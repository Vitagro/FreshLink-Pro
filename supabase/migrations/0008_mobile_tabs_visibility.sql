-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION 0008 — Visibilité des onglets mobile (BOSettings → Onglets Mobile)
-- ════════════════════════════════════════════════════════════════════════════
--
-- fl_mobile_tabs_visibility : config objet unique (ligne id="config", cf.
-- lib/supabase/autoSync.ts CONFIG_KEYS / lib/supabase/db.ts CONFIG_TABLES),
-- comme fl_process_config / fl_group_names. Stocke, par rôle et par écran
-- mobile (cf. store.ts MOBILE_TABS_REGISTRY), la liste des onglets
-- explicitement masqués par le back-office (ex: masquer "DA" ou "Bon
-- d'achat" pour le rôle acheteur).
--
-- Verrouillée comme les autres tables : RLS forcée, aucun accès
-- anon/authenticated, uniquement service_role.
--
-- Idempotent — rejouable sans risque.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.fl_mobile_tabs_visibility (
  id          TEXT PRIMARY KEY,
  payload     JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.fl_mobile_tabs_visibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fl_mobile_tabs_visibility FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.fl_mobile_tabs_visibility FROM anon, authenticated;
GRANT ALL ON public.fl_mobile_tabs_visibility TO service_role;

COMMIT;
