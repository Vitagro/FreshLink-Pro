-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION 0002 — Tokens d'appareils pour les notifications push (FCM)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Une ligne par (utilisateur, appareil) : le token FCM change quand l'app est
-- réinstallée ou que le token expire côté Firebase, donc on upsert sur le
-- token lui-même (unique) plutôt que sur user_id seul — un utilisateur peut
-- avoir plusieurs appareils enregistrés.
--
-- Accès : uniquement service_role, comme toutes les tables fl_* (voir 0001) —
-- tout accès passe par l'api-server (POST /api/ext/push/register), jamais par
-- le client Supabase anon directement.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.fl_device_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  token       TEXT NOT NULL UNIQUE,
  platform    TEXT NOT NULL DEFAULT 'android',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fl_device_tokens_user_id ON public.fl_device_tokens (user_id);

ALTER TABLE public.fl_device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fl_device_tokens FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.fl_device_tokens FROM anon, authenticated;

DROP POLICY IF EXISTS service_all ON public.fl_device_tokens;
CREATE POLICY service_all ON public.fl_device_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
