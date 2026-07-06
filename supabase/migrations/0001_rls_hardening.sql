-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION C1 — Durcissement RLS (Row Level Security)
-- ════════════════════════════════════════════════════════════════════════════
--
-- MISE À JOUR (2026-07-01) : ce fichier a été resynchronisé avec l'état RÉEL
-- de la base de production (projet bxdqkigoidwnscsjafwd), qui avait déjà été
-- durci manuellement (RLS activée + forcée sur les 65 tables fl_*, et 8
-- policies anon créées) sans jamais être reporté ici. Vérifié empiriquement
-- (lecture/écriture anon testées en direct) le 2026-07-01.
--
-- Ce script est IDEMPOTENT : il peut être rejoué sans risque sur la base de
-- prod actuelle (aucun changement d'effet), ou sur une base fraîche pour la
-- reprovisionner à l'identique (disaster recovery).
--
-- État actuel (déjà en place, ce script le documente + le garantit) :
--   - RLS activée + FORCÉE sur toutes les tables fl_* → sans policy, anon et
--     authenticated n'ont accès à AUCUNE ligne, même s'ils ont un GRANT.
--   - GRANT ALL à anon/authenticated est encore présent au niveau table sur
--     la plupart des fl_* (inoffensif tant que RLS reste forcée, mais c'est
--     un filet de sécurité manquant si RLS était un jour désactivée par
--     erreur) → ce script les révoque explicitement (défense en profondeur).
--   - service_role garde tous les droits (il contourne RLS de toute façon).
--   - 8 policies anon légitimes existent déjà pour des besoins publics précis
--     (catalogue, feedbacks, news, contact, stats shop, veille concurrence) :
--     ce script les recrée explicitement pour que ce fichier soit la source
--     de vérité, au lieu de policies ad-hoc non versionnées.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. RLS forcée + révocation des GRANT ALL hérités sur toutes les fl_* ─────
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename LIKE 'fl_%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    -- Plus aucun droit direct pour les rôles publics : tout passe par le
    -- serveur (service_role) OU par une policy explicite créée ci-dessous.
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    -- service_role conserve tous les droits (il contourne RLS de toute façon).
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- ── 2. Catalogue marketplace : lecture publique (le shop en a besoin) ────────
-- La vue n'expose que les colonnes publiques (jamais prixAchat, marge, stock réel).
GRANT SELECT ON public.v_marketplace_catalogue TO anon, authenticated;

-- ── 3. Policies anon déjà en place en prod — recréées ici explicitement ──────
-- (constatées en base le 2026-07-01, absentes de toute migration versionnée
--  jusqu'ici ; ce bloc les rend reproductibles et documentées)

-- fl_company_contacts : lecture publique des coordonnées de l'entreprise
GRANT SELECT ON public.fl_company_contacts TO anon, authenticated;
DROP POLICY IF EXISTS anon_read_contacts ON public.fl_company_contacts;
CREATE POLICY anon_read_contacts ON public.fl_company_contacts
  FOR SELECT TO anon, authenticated USING (true);

-- fl_feedbacks : lecture publique + dépôt d'avis client (pas de update/delete)
GRANT SELECT, INSERT ON public.fl_feedbacks TO anon, authenticated;
DROP POLICY IF EXISTS anon_read_feedbacks ON public.fl_feedbacks;
CREATE POLICY anon_read_feedbacks ON public.fl_feedbacks
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS anon_insert_feedbacks ON public.fl_feedbacks;
CREATE POLICY anon_insert_feedbacks ON public.fl_feedbacks
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- fl_notices : uniquement la ligne 'site_news' (actualités publiques du site)
GRANT SELECT ON public.fl_notices TO anon, authenticated;
DROP POLICY IF EXISTS anon_read_news ON public.fl_notices;
CREATE POLICY anon_read_news ON public.fl_notices
  FOR SELECT TO anon, authenticated USING (id = 'site_news');

-- fl_shop_analytics : uniquement la ligne '__config' (config publique du shop)
GRANT SELECT ON public.fl_shop_analytics TO anon, authenticated;
DROP POLICY IF EXISTS anon_read_shop_config ON public.fl_shop_analytics;
CREATE POLICY anon_read_shop_config ON public.fl_shop_analytics
  FOR SELECT TO anon, authenticated USING (id = '__config');

-- fl_conc_pv / fl_conc_ventes_daily : lecture publique (veille concurrentielle affichée)
GRANT SELECT ON public.fl_conc_pv TO anon, authenticated;
DROP POLICY IF EXISTS anon_read ON public.fl_conc_pv;
CREATE POLICY anon_read ON public.fl_conc_pv
  FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON public.fl_conc_ventes_daily TO anon, authenticated;
DROP POLICY IF EXISTS anon_read ON public.fl_conc_ventes_daily;
CREATE POLICY anon_read ON public.fl_conc_ventes_daily
  FOR SELECT TO anon, authenticated USING (true);

-- fl_intel_prix : lecture publique (intelligence prix affichée)
GRANT SELECT ON public.fl_intel_prix TO anon, authenticated;
DROP POLICY IF EXISTS anon_read ON public.fl_intel_prix;
CREATE POLICY anon_read ON public.fl_intel_prix
  FOR SELECT TO anon, authenticated USING (true);

-- ── 4. (Non appliqué) Realtime sur fl_articles / fl_prospects / fl_commandes_web
--      Ces tables N'ONT PAS de policy anon aujourd'hui (vérifié empiriquement :
--      lecture ET écriture anon directes sont bloquées). Le code frontend qui
--      y accède encore en direct (lib/supabase/useRealtimeSync.ts,
--      lib/auth/supabaseAuth.ts) est donc déjà non-fonctionnel via RLS et doit
--      être audité séparément (dead code probable, cf. échange du 2026-07-01)
--      avant d'envisager d'ouvrir de nouvelles policies ici.
--
-- ALTER TABLE public.fl_commandes_web ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY anon_read_commandes_web ON public.fl_commandes_web
--   FOR SELECT TO anon USING (true);
-- GRANT SELECT ON public.fl_commandes_web TO anon;

COMMIT;

-- ── 5. Vérification post-migration ────────────────────────────────────────
-- Doit retourner 0 ligne (aucune table fl_* sans RLS) :
--   SELECT tablename FROM pg_tables
--   WHERE schemaname='public' AND tablename LIKE 'fl_%' AND rowsecurity = false;
--
-- Doit lister exactement : v_marketplace_catalogue (lecture) + les tables du
-- bloc 3 ci-dessus, rien d'autre, pour anon :
--   SELECT DISTINCT table_name FROM information_schema.role_table_grants
--   WHERE grantee = 'anon' AND table_schema = 'public' AND privilege_type = 'SELECT';
