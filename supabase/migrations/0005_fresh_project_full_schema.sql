-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION 0005 — Schéma complet pour un NOUVEAU projet Supabase vide
-- (FreshLink + Shop, projet pwhycjgrwxnokudaidmm ou équivalent)
-- ════════════════════════════════════════════════════════════════════════════
--
-- À exécuter UNE SEULE FOIS sur un projet fraîchement créé, vide. Recrée
-- toutes les tables fl_* connues (schéma générique id/payload/updated_at,
-- voir lib/supabase/db.ts), + les 2 tables à schéma spécifique
-- (fl_device_tokens, fl_active_calls, cf. migrations 0002/0003), + la vue
-- marketplace, + le verrouillage RLS identique à la prod (0001).
--
-- Reconstruit à partir de : la liste ALLOWED_TABLES de syncWrite.ts/syncRead.ts
-- (source de vérité pour l'ERP back-office) + les tables référencées par les
-- routes publiques /api/ext/* (utilisées par le shop). Certaines tables
-- listées ci-dessous sont "best-effort" (référencées dans le code frontend
-- mais pas confirmées à 100% en prod) — les créer ne coûte rien si elles
-- restent vides/inutilisées.
--
-- Idempotent (CREATE TABLE IF NOT EXISTS partout) — rejouable sans risque.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Tables génériques (id/payload/updated_at) ────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    -- Cœur ERP (ALLOWED_TABLES, syncWrite.ts/syncRead.ts) --------------------
    'fl_users', 'fl_clients', 'fl_articles', 'fl_fournisseurs',
    'fl_commandes', 'fl_commandes_web', 'fl_bons_livraison',
    'fl_bons_preparation', 'fl_retours', 'fl_trips',
    'fl_site_access', 'fl_account_requests', 'fl_prospects',
    'fl_company', 'fl_company_contacts', 'fl_depots', 'fl_documents',
    'fl_bons_achat', 'fl_purchase_orders', 'fl_receptions',
    'fl_caisses_vides', 'fl_charges', 'fl_caisse_entries', 'fl_caisse_references',
    'fl_loyalty_config', 'fl_loyalty_transactions', 'fl_primes_nouveaux_clients',
    'fl_salaries', 'fl_actionnaires', 'fl_livreurs', 'fl_pointages', 'fl_absences',
    'fl_relances_fournisseur',
    'fl_feedbacks', 'fl_gift_materials', 'fl_pa_historique',
    'fl_invoices', 'fl_avoirs', 'fl_wallet_transactions', 'fl_paiements',
    'fl_referrals', 'fl_referral_config', 'fl_tracking',
    'fl_promotions', 'fl_coupons', 'fl_notifications',
    'fl_contrats', 'fl_organisations',
    'fl_process_config', 'fl_workflow_config', 'fl_alert_config', 'fl_email_config', 'fl_fiscal_config',
    'fl_intel_prix', 'fl_conc_pv', 'fl_conc_ventes_daily',
    'fl_notices',
    -- Shop / routes publiques /api/ext/* -------------------------------------
    'fl_bonus_matrix', 'fl_credits_fournisseurs', 'fl_cutoffs',
    'fl_demandes_acces', 'fl_gift_attributions', 'fl_pa_predit',
    'fl_pricing_dynamique', 'fl_pricing_rules', 'fl_shop_analytics',
    -- Primes / RH / commercial (best-effort, référencées côté frontend) ------
    'fl_regles_bonus', 'fl_grilles_salaire', 'fl_fiche_payroll',
    'fl_driver_bonus_config', 'fl_driver_bonus_records',
    'fl_shareholder_distributions', 'fl_perf_commercial'
  ])
  LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.%I (
         id          TEXT PRIMARY KEY,
         payload     JSONB NOT NULL DEFAULT ''{}'',
         updated_at  TIMESTAMPTZ DEFAULT now()
       )', t);
  END LOOP;
END $$;

-- ── 2. Tables à schéma spécifique (cf. 0002/0003) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.fl_device_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  token       TEXT NOT NULL UNIQUE,
  platform    TEXT NOT NULL DEFAULT 'android',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fl_device_tokens_user_id ON public.fl_device_tokens (user_id);

CREATE TABLE IF NOT EXISTS public.fl_active_calls (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id    TEXT NOT NULL UNIQUE,
  caller_id    TEXT NOT NULL,
  caller_name  TEXT NOT NULL,
  offer        JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fl_active_calls_target_id ON public.fl_active_calls (target_id);

-- ── 3. Vue catalogue marketplace (utilisée par GET /api/ext/catalogue) ──────
CREATE OR REPLACE VIEW public.v_marketplace_catalogue AS
SELECT
  a.id,
  a.payload->>'nom'                              AS nom,
  a.payload->>'nomAr'                            AS nom_ar,
  a.payload->>'famille'                          AS famille,
  a.payload->>'unite'                            AS unite,
  a.payload->>'marketplaceStatut'                AS statut,
  a.payload->>'photo'                            AS photo,
  (a.payload->>'marketplacePrixPublic')::numeric AS prix_public,
  a.payload->'marketplaceTags'                   AS tags,
  (a.payload->>'marketplaceOrdre')::int          AS ordre,
  a.payload->>'marketplaceDescription'           AS description,
  a.payload->>'marketplaceDescriptionAr'         AS description_ar,
  (a.payload->'marketplacePromo'->>'prixPromo')::numeric AS promo_prix,
  a.payload->'marketplacePromo'->>'etiquette'    AS etiquette,
  (a.payload->'marketplacePromo'->>'actif')::boolean     AS promo_actif,
  (a.payload->>'prixCHR')::numeric               AS prix_chr,
  (a.payload->>'prixMarchand')::numeric          AS prix_marchand,
  (a.payload->>'prixParticulier')::numeric       AS prix_particulier,
  (a.payload->>'marketplacePrixPublic')::numeric AS marketplace_prix_public,
  a.payload->>'pvMethode'                        AS pv_methode,
  (a.payload->>'pvValeur')::numeric              AS pv_valeur,
  (a.payload->>'prixAchat')::numeric             AS prix_achat,
  COALESCE((a.payload->>'actif')::boolean, true) AS actif,
  COALESCE((a.payload->>'marketplaceActif')::boolean, false) AS marketplace_actif
FROM public.fl_articles a
WHERE COALESCE((a.payload->>'marketplaceActif')::boolean, false) = true
  AND COALESCE((a.payload->>'actif')::boolean, true) = true
ORDER BY
  (a.payload->>'marketplaceOrdre')::int NULLS LAST,
  a.payload->>'nom';

-- ── 4. Verrouillage RLS — identique à la prod (0001) ─────────────────────────
-- Force RLS sur toutes les tables fl_*, aucune policy anon/authenticated par
-- défaut (deny-by-default). service_role (l'API serveur, seule à écrire)
-- contourne RLS de toute façon.
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename LIKE 'fl_%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- ── 5. Policies publiques (lecture anon) — identiques à la prod (0001) ──────
GRANT SELECT ON public.v_marketplace_catalogue TO anon, authenticated;

GRANT SELECT ON public.fl_company_contacts TO anon, authenticated;
DROP POLICY IF EXISTS anon_read_contacts ON public.fl_company_contacts;
CREATE POLICY anon_read_contacts ON public.fl_company_contacts
  FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT, INSERT ON public.fl_feedbacks TO anon, authenticated;
DROP POLICY IF EXISTS anon_read_feedbacks ON public.fl_feedbacks;
CREATE POLICY anon_read_feedbacks ON public.fl_feedbacks
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS anon_insert_feedbacks ON public.fl_feedbacks;
CREATE POLICY anon_insert_feedbacks ON public.fl_feedbacks
  FOR INSERT TO anon, authenticated WITH CHECK (true);

GRANT SELECT ON public.fl_notices TO anon, authenticated;
DROP POLICY IF EXISTS anon_read_news ON public.fl_notices;
CREATE POLICY anon_read_news ON public.fl_notices
  FOR SELECT TO anon, authenticated USING (id = 'site_news');

GRANT SELECT ON public.fl_shop_analytics TO anon, authenticated;
DROP POLICY IF EXISTS anon_read_shop_config ON public.fl_shop_analytics;
CREATE POLICY anon_read_shop_config ON public.fl_shop_analytics
  FOR SELECT TO anon, authenticated USING (id = '__config');

GRANT SELECT ON public.fl_conc_pv TO anon, authenticated;
DROP POLICY IF EXISTS anon_read ON public.fl_conc_pv;
CREATE POLICY anon_read ON public.fl_conc_pv
  FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON public.fl_conc_ventes_daily TO anon, authenticated;
DROP POLICY IF EXISTS anon_read ON public.fl_conc_ventes_daily;
CREATE POLICY anon_read ON public.fl_conc_ventes_daily
  FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON public.fl_intel_prix TO anon, authenticated;
DROP POLICY IF EXISTS anon_read ON public.fl_intel_prix;
CREATE POLICY anon_read ON public.fl_intel_prix
  FOR SELECT TO anon, authenticated USING (true);

COMMIT;

-- ── 6. Vérification post-migration ───────────────────────────────────────────
-- Doit retourner le nombre total de tables fl_* créées :
--   SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'fl_%';
-- Doit retourner 0 ligne (aucune table fl_* sans RLS forcée) :
--   SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'fl_%' AND rowsecurity = false;
