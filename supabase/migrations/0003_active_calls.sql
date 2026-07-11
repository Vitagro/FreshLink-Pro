-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION 0003 — Appels en attente (pour retrouver un appel manqué à la
-- réouverture de l'app, quand le signal temps réel a été manqué pendant que
-- la WebView était en arrière-plan).
-- ════════════════════════════════════════════════════════════════════════════
--
-- Une ligne par DESTINATAIRE (un seul appel entrant "affichable" à la fois,
-- comme le reste de CallCenter.tsx) : upsert sur target_id à chaque nouvel
-- appel. Consultée par l'app au chargement/retour au premier plan pour
-- reconstituer le bandeau "Accepter" même si le broadcast Supabase Realtime
-- (l'offer WebRTC) a été manqué. Nettoyée par le client (accepté/raccroché/
-- sonnerie expirée) ; une ligne orpheline se rend simplement invisible après
-- ~40s côté client (created_at trop ancien), pas besoin de cron de purge.
--
-- Accès : uniquement service_role, comme toutes les tables fl_* (voir 0001).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.fl_active_calls (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id    TEXT NOT NULL UNIQUE,
  caller_id    TEXT NOT NULL,
  caller_name  TEXT NOT NULL,
  offer        JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fl_active_calls_target_id ON public.fl_active_calls (target_id);

ALTER TABLE public.fl_active_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fl_active_calls FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.fl_active_calls FROM anon, authenticated;

DROP POLICY IF EXISTS service_all ON public.fl_active_calls;
CREATE POLICY service_all ON public.fl_active_calls FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
