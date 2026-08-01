-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION 0009 — Abonnements Web Push (VAPID)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Complément web (PWA) de fl_device_tokens (0002, FCM natif Capacitor) — cette
-- app est distribuée comme PWA installable (voir PWAInstall.tsx), pas comme
-- app native compilée, donc les notifications "app fermée/réduite" pour la
-- majorité des utilisateurs passent par le Web Push API standard (VAPID),
-- pas par Firebase Cloud Messaging.
--
-- Une ligne par (utilisateur, endpoint navigateur) : l'endpoint change si
-- l'utilisateur désinstalle/réinstalle la PWA ou change de navigateur, donc on
-- upsert sur l'endpoint (unique) plutôt que sur user_id seul — un utilisateur
-- peut avoir plusieurs appareils/navigateurs abonnés.
--
-- Accès : uniquement service_role, comme toutes les tables fl_* (voir 0001) —
-- tout accès passe par l'api-server (POST /api/ext/push/web-subscribe),
-- jamais par le client Supabase anon directement.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.fl_web_push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fl_web_push_subscriptions_user_id ON public.fl_web_push_subscriptions (user_id);

ALTER TABLE public.fl_web_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fl_web_push_subscriptions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.fl_web_push_subscriptions FROM anon, authenticated;

DROP POLICY IF EXISTS service_all ON public.fl_web_push_subscriptions;
CREATE POLICY service_all ON public.fl_web_push_subscriptions FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
