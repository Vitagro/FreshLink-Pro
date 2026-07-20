-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION 0006 — Registre chèques & virements (Cash Man + Finance)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Nouvelle table fl_reglements_cv (schéma générique id/payload/updated_at,
-- comme le reste des tables fl_*, cf. lib/supabase/db.ts). Suit les chèques
-- et virements reçus des clients jusqu'à leur encaissement effectif en
-- banque (ou leur rejet) — distinct de fl_caisse_entries (espèces).
--
-- Verrouillée comme les autres tables financières (fl_caisse_entries,
-- fl_paiements) : RLS forcée, aucun accès anon/authenticated, uniquement
-- service_role (le serveur, via /api/sync-read /api/sync-write).
--
-- Idempotent — rejouable sans risque.
-- À exécuter dans l'éditeur SQL Supabase du projet, PUIS ajouter
-- "fl_reglements_cv" à ALLOWED_TABLES dans syncRead.ts et syncWrite.ts
-- (déjà fait côté code dans ce commit).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.fl_reglements_cv (
  id          TEXT PRIMARY KEY,
  payload     JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.fl_reglements_cv ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fl_reglements_cv FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.fl_reglements_cv FROM anon, authenticated;
GRANT ALL ON public.fl_reglements_cv TO service_role;

COMMIT;
