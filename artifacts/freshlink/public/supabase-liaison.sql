-- ═══════════════════════════════════════════════════════════════════════════
-- LIAISON SQL — Tables essentielles pour la connexion vitafresh ↔ ERP
-- À exécuter sur : https://supabase.com/dashboard/project/jwdrwapuetqoqnankgma/sql/new
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Demandes de compte (vitafresh → ERP) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fl_account_requests (
  id          UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  type        TEXT         NOT NULL DEFAULT 'client',   -- 'client' | 'fournisseur'
  sous_type   TEXT,                                      -- 'chr' | 'marchand' | 'particulier' | 'fournisseur'
  nom         TEXT         NOT NULL,
  email       TEXT,
  telephone   TEXT,
  societe     TEXT,
  ice         TEXT,
  ville       TEXT,
  message     TEXT,
  statut      TEXT         NOT NULL DEFAULT 'en_attente',
  created_at  TIMESTAMPTZ  DEFAULT now()
);

-- Ajouter sous_type si la table existe déjà sans cette colonne
ALTER TABLE public.fl_account_requests
  ADD COLUMN IF NOT EXISTS sous_type TEXT;

-- ── 2. Commandes web (vitafresh → ERP) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fl_commandes_web (
  id               UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  numero           TEXT         UNIQUE,
  client_id        UUID,
  prospect_id      UUID,
  nom_client       TEXT         NOT NULL,
  telephone        TEXT         NOT NULL,
  email            TEXT,
  adresse_livraison TEXT,
  lignes           JSONB        NOT NULL DEFAULT '[]',
  montant_total    NUMERIC(10,2) DEFAULT 0,
  date_souhaitee   DATE,
  creneau          TEXT,
  instructions     TEXT,
  statut           TEXT         DEFAULT 'nouveau',
  source           TEXT         DEFAULT 'site_web',
  ip_address       TEXT,
  created_at       TIMESTAMPTZ  DEFAULT now()
);

-- ── 3. Accès site / device guard ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fl_site_access (
  id          UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id   TEXT         UNIQUE NOT NULL,
  telephone   TEXT,
  statut      TEXT         DEFAULT 'en_attente',
  notes       TEXT,
  created_at  TIMESTAMPTZ  DEFAULT now()
);

-- ── 4. RLS : autoriser lecture/écriture publique (anon key) ──────────────────
-- (Supabase bloque par défaut — ces policies permettent à l'API de fonctionner)

-- fl_account_requests
ALTER TABLE public.fl_account_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_insert_account_requests" ON public.fl_account_requests;
DROP POLICY IF EXISTS "anon_select_account_requests" ON public.fl_account_requests;
CREATE POLICY "anon_insert_account_requests" ON public.fl_account_requests
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_select_account_requests" ON public.fl_account_requests
  FOR SELECT TO anon USING (true);

-- fl_commandes_web
ALTER TABLE public.fl_commandes_web ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_insert_commandes_web" ON public.fl_commandes_web;
DROP POLICY IF EXISTS "anon_select_commandes_web" ON public.fl_commandes_web;
CREATE POLICY "anon_insert_commandes_web" ON public.fl_commandes_web
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_select_commandes_web" ON public.fl_commandes_web
  FOR SELECT TO anon USING (true);

-- fl_site_access
ALTER TABLE public.fl_site_access ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_site_access" ON public.fl_site_access;
CREATE POLICY "anon_all_site_access" ON public.fl_site_access
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- ── 5. Vérification finale ────────────────────────────────────────────────────
SELECT
  table_name,
  (SELECT count(*) FROM information_schema.columns c WHERE c.table_name = t.table_name) AS nb_colonnes
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN ('fl_account_requests', 'fl_commandes_web', 'fl_site_access')
ORDER BY table_name;
