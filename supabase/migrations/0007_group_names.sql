-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION 0007 — Noms d'équipe (BOEquipes)
-- ════════════════════════════════════════════════════════════════════════════
--
-- fl_group_names : config objet unique (ligne id="config", cf.
-- lib/supabase/autoSync.ts CONFIG_KEYS / lib/supabase/db.ts CONFIG_TABLES),
-- comme fl_process_config etc. Associe un libellé libre à un groupeId
-- (id de l'admin racine d'une équipe) — purement cosmétique, affiché dans
-- BOEquipes à la place de "Équipe de <nom de l'admin>".
--
-- Verrouillée comme les autres tables : RLS forcée, aucun accès
-- anon/authenticated, uniquement service_role.
--
-- Idempotent — rejouable sans risque.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.fl_group_names (
  id          TEXT PRIMARY KEY,
  payload     JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.fl_group_names ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fl_group_names FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.fl_group_names FROM anon, authenticated;
GRANT ALL ON public.fl_group_names TO service_role;

COMMIT;
