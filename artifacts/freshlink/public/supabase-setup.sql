-- ══════════════════════════════════════════════════════════════════════════════
-- VITA FRESH — Supabase Complete Setup SQL
-- Projet Supabase : jwdrwapuetqoqnankgma
-- URL Editor     : https://supabase.com/dashboard/project/jwdrwapuetqoqnankgma/sql/new
--
-- INSTRUCTIONS :
--  1. Ouvrir le lien ci-dessus (SQL Editor de votre projet)
--  2. Copier-coller tout ce fichier
--  3. Cliquer "Run"
--  4. Vérifier le message "Success" en bas
--
-- Ce script fait TOUT en une seule exécution :
--  ✅  Supprime les anciennes tables (reset propre)
--  ✅  Crée les 22 tables ERP (schéma JSONB + colonnes générées pour l'API)
--  ✅  Crée fl_web_integration (configuration API site web)
--  ✅  Crée la vue v_marketplace_catalogue (catalogue site web)
--  ✅  Désactive RLS, accorde les permissions anon/authenticated
--  ✅  Active Realtime sur toutes les tables
--  ✅  Insère la configuration web par défaut
--  ✅  Insère les 50+ articles avec photos (fruits, légumes, herbes, agrumes)
--  ✅  Insère les clients et fournisseurs de démonstration
-- ══════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 1 — DROP tables existantes (reset propre)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ DECLARE t TEXT;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND (tablename LIKE 'fl_%' OR tablename = 'v_marketplace_catalogue')
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', t);
  END LOOP;
END $$;

DROP VIEW IF EXISTS public.v_marketplace_catalogue CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 2 — Créer les 22 tables ERP (JSONB + colonnes générées)
--
-- Architecture : chaque objet ERP est stocké entier dans `payload` JSONB.
-- Les colonnes GENERATED ALWAYS AS permettent le filtrage PostgREST direct
-- (ex: ?telephone=eq.0661234567 fonctionne sans modifier les API routes).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── fl_depots ────────────────────────────────────────────────────────────────
CREATE TABLE public.fl_depots (
  id          TEXT PRIMARY KEY,
  payload     JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT now(),
  nom         TEXT GENERATED ALWAYS AS (payload->>'nom') STORED,
  actif       BOOLEAN GENERATED ALWAYS AS (COALESCE((payload->>'actif')::boolean, true)) STORED
);

-- ── fl_users ─────────────────────────────────────────────────────────────────
-- Colonnes générées critiques pour l'API /ext/auth et /ext/mon-compte
CREATE TABLE public.fl_users (
  id              TEXT PRIMARY KEY,
  payload         JSONB NOT NULL DEFAULT '{}',
  updated_at      TIMESTAMPTZ DEFAULT now(),
  -- Colonnes exposées pour PostgREST (filtrage direct)
  name            TEXT     GENERATED ALWAYS AS (payload->>'name') STORED,
  email           TEXT     GENERATED ALWAYS AS (payload->>'email') STORED,
  telephone       TEXT     GENERATED ALWAYS AS (payload->>'telephone') STORED,
  phone           TEXT     GENERATED ALWAYS AS (payload->>'phone') STORED,
  role            TEXT     GENERATED ALWAYS AS (payload->>'role') STORED,
  actif           BOOLEAN  GENERATED ALWAYS AS (COALESCE((payload->>'actif')::boolean, true)) STORED,
  password        TEXT     GENERATED ALWAYS AS (payload->>'password') STORED,
  "passwordMobile" TEXT    GENERATED ALWAYS AS (payload->>'passwordMobile') STORED,
  "clientId"      TEXT     GENERATED ALWAYS AS (payload->>'clientId') STORED,
  "fournisseurId" TEXT     GENERATED ALWAYS AS (payload->>'fournisseurId') STORED
);
CREATE INDEX idx_fl_users_telephone  ON public.fl_users (telephone);
CREATE INDEX idx_fl_users_phone      ON public.fl_users (phone);
CREATE INDEX idx_fl_users_email      ON public.fl_users (email);
CREATE INDEX idx_fl_users_role       ON public.fl_users (role);

-- ── fl_clients ────────────────────────────────────────────────────────────────
CREATE TABLE public.fl_clients (
  id          TEXT PRIMARY KEY,
  payload     JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT now(),
  nom         TEXT     GENERATED ALWAYS AS (payload->>'nom') STORED,
  telephone   TEXT     GENERATED ALWAYS AS (payload->>'telephone') STORED,
  email       TEXT     GENERATED ALWAYS AS (payload->>'email') STORED,
  segment     TEXT     GENERATED ALWAYS AS (payload->>'segment') STORED,
  categorie   TEXT     GENERATED ALWAYS AS (payload->>'categorie') STORED,
  actif       BOOLEAN  GENERATED ALWAYS AS (COALESCE((payload->>'actif')::boolean, true)) STORED
);
CREATE INDEX idx_fl_clients_telephone ON public.fl_clients (telephone);

-- ── fl_fournisseurs ───────────────────────────────────────────────────────────
CREATE TABLE public.fl_fournisseurs (
  id          TEXT PRIMARY KEY,
  payload     JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT now(),
  nom         TEXT GENERATED ALWAYS AS (payload->>'nom') STORED,
  actif       BOOLEAN GENERATED ALWAYS AS (COALESCE((payload->>'actif')::boolean, true)) STORED
);

-- ── fl_articles ───────────────────────────────────────────────────────────────
-- Colonnes critiques pour l'API /ext/catalogue et /ext/commandes
CREATE TABLE public.fl_articles (
  id                    TEXT PRIMARY KEY,
  payload               JSONB NOT NULL DEFAULT '{}',
  updated_at            TIMESTAMPTZ DEFAULT now(),
  nom                   TEXT     GENERATED ALWAYS AS (payload->>'nom') STORED,
  "nomAr"               TEXT     GENERATED ALWAYS AS (payload->>'nomAr') STORED,
  famille               TEXT     GENERATED ALWAYS AS (payload->>'famille') STORED,
  unite                 TEXT     GENERATED ALWAYS AS (payload->>'unite') STORED,
  actif                 BOOLEAN  GENERATED ALWAYS AS (COALESCE((payload->>'actif')::boolean, true)) STORED,
  "marketplaceActif"    BOOLEAN  GENERATED ALWAYS AS (COALESCE((payload->>'marketplaceActif')::boolean, false)) STORED,
  "marketplaceStatut"   TEXT     GENERATED ALWAYS AS (payload->>'marketplaceStatut') STORED,
  "marketplacePrixPublic" NUMERIC GENERATED ALWAYS AS ((payload->>'marketplacePrixPublic')::numeric) STORED,
  marketplace_prix_public NUMERIC GENERATED ALWAYS AS ((payload->>'marketplacePrixPublic')::numeric) STORED,
  pv_valeur             NUMERIC  GENERATED ALWAYS AS ((payload->>'pvValeur')::numeric) STORED,
  pv_methode            TEXT     GENERATED ALWAYS AS (payload->>'pvMethode') STORED,
  prix_achat            NUMERIC  GENERATED ALWAYS AS ((payload->>'prixAchat')::numeric) STORED,
  marketplace_actif     BOOLEAN  GENERATED ALWAYS AS (COALESCE((payload->>'marketplaceActif')::boolean, false)) STORED
);
CREATE INDEX idx_fl_articles_famille         ON public.fl_articles (famille);
CREATE INDEX idx_fl_articles_marketplace     ON public.fl_articles ("marketplaceActif");

-- ── Autres tables ERP (JSONB simple) ─────────────────────────────────────────
CREATE TABLE public.fl_livreurs          (id TEXT PRIMARY KEY, payload JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE public.fl_commandes         (id TEXT PRIMARY KEY, payload JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE public.fl_bons_achat        (id TEXT PRIMARY KEY, payload JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE public.fl_purchase_orders   (id TEXT PRIMARY KEY, payload JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE public.fl_bons_livraison    (id TEXT PRIMARY KEY, payload JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE public.fl_bons_preparation  (id TEXT PRIMARY KEY, payload JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE public.fl_receptions        (id TEXT PRIMARY KEY, payload JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE public.fl_trips             (id TEXT PRIMARY KEY, payload JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE public.fl_retours           (id TEXT PRIMARY KEY, payload JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE public.fl_visites           (id TEXT PRIMARY KEY, payload JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE public.fl_messages          (id TEXT PRIMARY KEY, payload JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE public.fl_transferts_stock  (id TEXT PRIMARY KEY, payload JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE public.fl_demandes_achat    (id TEXT PRIMARY KEY, payload JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE public.fl_notices           (id TEXT PRIMARY KEY, payload JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE public.fl_non_achats        (id TEXT PRIMARY KEY, payload JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE public.fl_demandes_acces    (id TEXT PRIMARY KEY, payload JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE public.fl_documents         (id TEXT PRIMARY KEY, payload JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE public.fl_feedbacks         (id TEXT PRIMARY KEY, payload JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ DEFAULT now(),
  auteur   TEXT GENERATED ALWAYS AS (payload->>'auteur')  STORED,
  source   TEXT GENERATED ALWAYS AS (payload->>'source')  STORED,
  note     INT  GENERATED ALWAYS AS ((payload->>'note')::int) STORED,
  message  TEXT GENERATED ALWAYS AS (payload->>'message') STORED,
  sujet    TEXT GENERATED ALWAYS AS (payload->>'sujet')   STORED,
  statut   TEXT GENERATED ALWAYS AS (payload->>'statut')  STORED,
  date     TEXT GENERATED ALWAYS AS (payload->>'date')    STORED
);

-- ── fl_account_requests — Demandes de compte depuis le site web ───────────────
CREATE TABLE public.fl_account_requests (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  type        TEXT NOT NULL DEFAULT 'client',
  sous_type   TEXT,                  -- 'chr', 'marchand', 'particulier', 'fournisseur'
  nom         TEXT NOT NULL,
  email       TEXT,
  telephone   TEXT NOT NULL,
  societe     TEXT,
  ice         TEXT,
  ville       TEXT,
  message     TEXT,
  statut      TEXT NOT NULL DEFAULT 'en_attente',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_fl_account_requests_telephone ON public.fl_account_requests (telephone);
CREATE INDEX idx_fl_account_requests_statut    ON public.fl_account_requests (statut);
CREATE INDEX idx_fl_account_requests_email     ON public.fl_account_requests (email);


-- ── fl_site_access — Contrôle d'accès portail web (autorisé par Jawad) ───────
-- Chaque appareil doit être approuvé par le super admin avant d'accéder au site
CREATE TABLE public.fl_site_access (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  device_id       TEXT NOT NULL UNIQUE,           -- identifiant unique appareil (localStorage)
  nom             TEXT,
  telephone       TEXT,
  statut          TEXT NOT NULL DEFAULT 'en_attente', -- en_attente | autorise | bloque
  gps_lat         DOUBLE PRECISION,              -- latitude GPS (obligatoire)
  gps_lng         DOUBLE PRECISION,              -- longitude GPS
  gps_precision   FLOAT,                         -- précision en mètres
  user_agent      TEXT,                           -- navigateur / appareil
  first_visit_at  TIMESTAMPTZ DEFAULT now(),      -- première demande
  updated_at      TIMESTAMPTZ DEFAULT now(),
  autorise_par    TEXT,                           -- 'Jawad' ou admin ERP
  autorise_at     TIMESTAMPTZ,                    -- date d'autorisation
  bloque_at       TIMESTAMPTZ,
  notes           TEXT
);
CREATE INDEX idx_fl_site_access_device_id ON public.fl_site_access (device_id);
CREATE INDEX idx_fl_site_access_statut    ON public.fl_site_access (statut);
CREATE INDEX idx_fl_site_access_telephone ON public.fl_site_access (telephone);


-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 3 — fl_web_integration (configuration API site web)
-- Utilisée par /api/ext/catalogue, /api/ext/commandes, /api/ext/auth
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.fl_web_integration (
  id                    TEXT PRIMARY KEY DEFAULT 'main',
  enabled               BOOLEAN NOT NULL DEFAULT true,
  api_key               TEXT NOT NULL DEFAULT 'vf-api-2026',
  catalogue_public      BOOLEAN NOT NULL DEFAULT true,   -- catalogue visible sans clé API
  commandes_publiques   BOOLEAN NOT NULL DEFAULT false,  -- passer commandes = clé requise
  demandes_comptes      BOOLEAN NOT NULL DEFAULT true,   -- demandes d'inscription depuis site web
  allowed_origins       TEXT[] DEFAULT ARRAY[
                          'https://vitafresh.vercel.app',
                          'http://localhost:3000',
                          '*'
                        ],
  webhook_url           TEXT,
  webhook_secret        TEXT,
  whatsapp              TEXT DEFAULT '212600000000',
  company_name          TEXT DEFAULT 'Vita Fresh',
  company_email         TEXT DEFAULT 'contact@vita-fresh.ma',
  company_address       TEXT DEFAULT 'Casablanca, Maroc',
  livraison_standard_dh NUMERIC DEFAULT 15,
  livraison_express_dh  NUMERIC DEFAULT 20,
  livraison_gratuit_min NUMERIC DEFAULT 150,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 4 — Vue v_marketplace_catalogue
-- Utilisée par GET /api/ext/catalogue pour afficher le catalogue sur le site
-- ─────────────────────────────────────────────────────────────────────────────
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
  -- Promo
  (a.payload->'marketplacePromo'->>'prixPromo')::numeric AS promo_prix,
  a.payload->'marketplacePromo'->>'etiquette'    AS etiquette,
  (a.payload->'marketplacePromo'->>'actif')::boolean     AS promo_actif,
  -- Prix par segment
  (a.payload->>'prixCHR')::numeric               AS prix_chr,
  (a.payload->>'prixMarchand')::numeric          AS prix_marchand,
  (a.payload->>'prixParticulier')::numeric       AS prix_particulier,
  -- Champs nécessaires pour /api/ext/commandes
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


-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 5 — Permissions & RLS (désactivé — accès libre pour anon/authenticated)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ DECLARE t TEXT;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename LIKE 'fl_%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT ALL ON public.%I TO anon, authenticated, service_role', t);
  END LOOP;
END $$;

GRANT SELECT ON public.v_marketplace_catalogue TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 6 — Realtime (synchronisation en temps réel)
-- ─────────────────────────────────────────────────────────────────────────────
-- Grant perms on new tables
GRANT ALL ON public.fl_account_requests TO anon, authenticated, service_role;
GRANT ALL ON public.fl_feedbacks        TO anon, authenticated, service_role;
GRANT ALL ON public.fl_site_access      TO anon, authenticated, service_role;
ALTER TABLE public.fl_account_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.fl_feedbacks        DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.fl_site_access      DISABLE ROW LEVEL SECURITY;

ALTER PUBLICATION supabase_realtime ADD TABLE
  public.fl_depots, public.fl_users, public.fl_clients, public.fl_fournisseurs,
  public.fl_articles, public.fl_livreurs, public.fl_commandes, public.fl_bons_achat,
  public.fl_purchase_orders, public.fl_bons_livraison, public.fl_bons_preparation,
  public.fl_receptions, public.fl_trips, public.fl_retours, public.fl_visites,
  public.fl_messages, public.fl_transferts_stock, public.fl_demandes_achat,
  public.fl_notices, public.fl_non_achats, public.fl_demandes_acces,
  public.fl_documents, public.fl_web_integration,
  public.fl_account_requests, public.fl_feedbacks, public.fl_site_access;


-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 7 — Configuration web_integration par défaut
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.fl_web_integration
  (id, enabled, api_key, catalogue_public, commandes_publiques, demandes_comptes, allowed_origins,
   whatsapp, company_name, company_email, company_address)
VALUES
  ('main', true, 'vf-api-2026', true, false, true,
   ARRAY['https://vitafresh.vercel.app','http://localhost:3000','*'],
   '212600000000', 'Vita Fresh', 'contact@vita-fresh.ma', 'Casablanca, Maroc')
ON CONFLICT (id) DO UPDATE
  SET enabled = true, catalogue_public = true, demandes_comptes = true, updated_at = now();


-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 8 — Articles seed data (50+ produits avec photos HD)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.fl_articles (id, payload, updated_at) VALUES

-- ══ LÉGUMES ══════════════════════════════════════════════════════════════════
('seed-art-001', '{
  "id":"seed-art-001","nom":"Tomates Rondes","nomAr":"طماطم","famille":"Légumes",
  "unite":"kg","um":"Caisse","colisageParUM":15,"colisageCaisses":15,
  "stockDisponible":450,"stockDefect":12,"shelfLifeJours":7,"alerteShelfLifeJours":2,
  "prixAchat":3.2,"pvMethode":"pourcentage","pvValeur":35,
  "photo":"https://images.unsplash.com/photo-1546094096-0df4bcaaa337?w=400&h=300&fit=crop&q=80",
  "prixCHR":3.84,"prixMarchand":4.00,"prixParticulier":4.32,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":4.50,"marketplaceOrdre":1,
  "marketplaceDescription":"Tomates rondes fraîches du Souss, récoltées chaque matin. Idéales pour salades, sauces et tajines.",
  "marketplaceTags":["légumes","tomates","frais","local"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

('seed-art-002', '{
  "id":"seed-art-002","nom":"Pommes de Terre","nomAr":"بطاطس","famille":"Légumes",
  "unite":"kg","um":"Caisse","colisageParUM":25,"colisageCaisses":25,
  "stockDisponible":1200,"stockDefect":30,"shelfLifeJours":30,"alerteShelfLifeJours":5,
  "prixAchat":2.1,"pvMethode":"pourcentage","pvValeur":30,
  "photo":"https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=400&h=300&fit=crop&q=80",
  "prixCHR":2.52,"prixMarchand":2.63,"prixParticulier":2.73,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":2.80,"marketplaceOrdre":2,
  "marketplaceDescription":"Pommes de terre de Meknès, variétés Bintje et Charlotte. Parfaites pour les fritures et les gratins.",
  "marketplaceTags":["légumes","pommes de terre","frais"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

('seed-art-006', '{
  "id":"seed-art-006","nom":"Carottes","nomAr":"جزر","famille":"Légumes",
  "unite":"kg","um":"Sac","colisageParUM":20,"colisageCaisses":20,
  "stockDisponible":380,"stockDefect":10,"shelfLifeJours":21,"alerteShelfLifeJours":3,
  "prixAchat":1.8,"pvMethode":"pourcentage","pvValeur":30,
  "photo":"https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?w=400&h=300&fit=crop&q=80",
  "prixCHR":2.16,"prixMarchand":2.25,"prixParticulier":2.34,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":2.40,"marketplaceOrdre":3,
  "marketplaceDescription":"Carottes fraîches de Meknès, croquantes et sucrées. Riches en bêta-carotène.",
  "marketplaceTags":["légumes","carottes","frais"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

('seed-art-009', '{
  "id":"seed-art-009","nom":"Oignons Blancs","nomAr":"بصل أبيض","famille":"Légumes",
  "unite":"kg","um":"Sac","colisageParUM":25,"colisageCaisses":25,
  "stockDisponible":600,"stockDefect":15,"shelfLifeJours":45,"alerteShelfLifeJours":7,
  "prixAchat":1.5,"pvMethode":"pourcentage","pvValeur":33,
  "photo":"https://images.unsplash.com/photo-1508747703725-719777637510?w=400&h=300&fit=crop&q=80",
  "prixCHR":1.80,"prixMarchand":1.88,"prixParticulier":2.00,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":2.00,"marketplaceOrdre":4,
  "marketplaceDescription":"Oignons blancs frais, incontournables de la cuisine marocaine.",
  "marketplaceTags":["légumes","oignons","frais"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

('seed-art-010', '{
  "id":"seed-art-010","nom":"Poivrons Rouges","nomAr":"فلفل أحمر","famille":"Légumes",
  "unite":"kg","um":"Caisse","colisageParUM":10,"colisageCaisses":10,
  "stockDisponible":180,"stockDefect":8,"shelfLifeJours":14,"alerteShelfLifeJours":3,
  "prixAchat":6.0,"pvMethode":"pourcentage","pvValeur":35,
  "photo":"https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?w=400&h=300&fit=crop&q=80",
  "prixCHR":7.20,"prixMarchand":7.50,"prixParticulier":8.10,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":8.50,"marketplaceOrdre":5,
  "marketplaceDescription":"Poivrons rouges charnus du Gharb, riches en vitamine C. Parfaits pour la chermela.",
  "marketplaceTags":["légumes","poivrons","frais","colorés"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

('seed-art-011', '{
  "id":"seed-art-011","nom":"Poivrons Verts","nomAr":"فلفل أخضر","famille":"Légumes",
  "unite":"kg","um":"Caisse","colisageParUM":10,"colisageCaisses":10,
  "stockDisponible":220,"stockDefect":10,"shelfLifeJours":14,"alerteShelfLifeJours":3,
  "prixAchat":4.5,"pvMethode":"pourcentage","pvValeur":33,
  "photo":"https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?w=400&h=300&fit=crop&q=80",
  "prixCHR":5.40,"prixMarchand":5.63,"prixParticulier":5.99,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":6.00,"marketplaceOrdre":6,
  "marketplaceDescription":"Poivrons verts frais, idéaux pour les tajines et les salades cuites.",
  "marketplaceTags":["légumes","poivrons","frais"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

('seed-art-012', '{
  "id":"seed-art-012","nom":"Aubergines","nomAr":"باذنجان","famille":"Légumes",
  "unite":"kg","um":"Caisse","colisageParUM":12,"colisageCaisses":12,
  "stockDisponible":150,"stockDefect":7,"shelfLifeJours":10,"alerteShelfLifeJours":2,
  "prixAchat":4.0,"pvMethode":"pourcentage","pvValeur":38,
  "photo":"https://images.unsplash.com/photo-1659118280850-8ccf0c41e7e1?w=400&h=300&fit=crop&q=80",
  "prixCHR":4.80,"prixMarchand":5.00,"prixParticulier":5.52,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":5.50,"marketplaceOrdre":7,
  "marketplaceDescription":"Aubergines violettes brillantes, tendres et parfumées. Idéales pour le zaâlouk.",
  "marketplaceTags":["légumes","aubergines","frais"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

('seed-art-013', '{
  "id":"seed-art-013","nom":"Concombres","nomAr":"خيار","famille":"Légumes",
  "unite":"kg","um":"Caisse","colisageParUM":15,"colisageCaisses":15,
  "stockDisponible":260,"stockDefect":12,"shelfLifeJours":10,"alerteShelfLifeJours":2,
  "prixAchat":2.5,"pvMethode":"pourcentage","pvValeur":32,
  "photo":"https://images.unsplash.com/photo-1449300079323-02e209d9d3a6?w=400&h=300&fit=crop&q=80",
  "prixCHR":3.00,"prixMarchand":3.13,"prixParticulier":3.30,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":3.50,"marketplaceOrdre":8,
  "marketplaceDescription":"Concombres frais et croquants. Parfaits pour la salade marocaine traditionnelle.",
  "marketplaceTags":["légumes","concombres","frais","salade"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

('seed-art-014', '{
  "id":"seed-art-014","nom":"Courgettes","nomAr":"كوسة","famille":"Légumes",
  "unite":"kg","um":"Caisse","colisageParUM":15,"colisageCaisses":15,
  "stockDisponible":200,"stockDefect":8,"shelfLifeJours":10,"alerteShelfLifeJours":2,
  "prixAchat":3.0,"pvMethode":"pourcentage","pvValeur":35,
  "photo":"https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400&h=300&fit=crop&q=80",
  "prixCHR":3.60,"prixMarchand":3.75,"prixParticulier":4.05,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":4.00,"marketplaceOrdre":9,
  "marketplaceDescription":"Courgettes tendres et savoureuses. Incontournables pour les tajines et les gratins.",
  "marketplaceTags":["légumes","courgettes","frais"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

('seed-art-015', '{
  "id":"seed-art-015","nom":"Ail Frais","nomAr":"ثوم طازج","famille":"Légumes",
  "unite":"kg","um":"Filet","colisageParUM":1,"colisageCaisses":10,
  "stockDisponible":80,"stockDefect":3,"shelfLifeJours":60,"alerteShelfLifeJours":10,
  "prixAchat":12.0,"pvMethode":"pourcentage","pvValeur":38,
  "photo":"https://images.unsplash.com/photo-1587049014078-3e50c0a5e42c?w=400&h=300&fit=crop&q=80",
  "prixCHR":14.40,"prixMarchand":15.00,"prixParticulier":16.56,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":18.00,"marketplaceOrdre":10,
  "marketplaceDescription":"Ail frais de Meknès, très parfumé. Base indispensable de toute cuisine marocaine.",
  "marketplaceTags":["légumes","ail","aromatiques","frais"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

('seed-art-016', '{
  "id":"seed-art-016","nom":"Piments Forts","nomAr":"فلفل حار","famille":"Légumes",
  "unite":"kg","um":"Barquette","colisageParUM":0.5,"colisageCaisses":5,
  "stockDisponible":40,"stockDefect":2,"shelfLifeJours":14,"alerteShelfLifeJours":3,
  "prixAchat":8.0,"pvMethode":"pourcentage","pvValeur":40,
  "photo":"https://images.unsplash.com/photo-1592419044706-39796d40f98c?w=400&h=300&fit=crop&q=80",
  "prixCHR":9.60,"prixMarchand":10.00,"prixParticulier":11.20,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":12.00,"marketplaceOrdre":11,
  "marketplaceDescription":"Piments forts frais pour harissa maison et plats épicés.",
  "marketplaceTags":["légumes","piments","épicé","frais"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

('seed-art-017', '{
  "id":"seed-art-017","nom":"Haricots Verts","nomAr":"لوبيا خضرا","famille":"Légumes",
  "unite":"kg","um":"Caisse","colisageParUM":5,"colisageCaisses":5,
  "stockDisponible":120,"stockDefect":6,"shelfLifeJours":7,"alerteShelfLifeJours":2,
  "prixAchat":7.5,"pvMethode":"pourcentage","pvValeur":36,
  "photo":"https://images.unsplash.com/photo-1582515073490-39981397c445?w=400&h=300&fit=crop&q=80",
  "prixCHR":9.00,"prixMarchand":9.38,"prixParticulier":10.20,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":10.50,"marketplaceOrdre":12,
  "marketplaceDescription":"Haricots verts fins et croquants. Parfaits pour les salades et les tajines.",
  "marketplaceTags":["légumes","haricots verts","frais"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

('seed-art-018', '{
  "id":"seed-art-018","nom":"Épinards Frais","nomAr":"سبانخ","famille":"Légumes",
  "unite":"kg","um":"Botte","colisageParUM":0.5,"colisageCaisses":5,
  "stockDisponible":60,"stockDefect":5,"shelfLifeJours":5,"alerteShelfLifeJours":1,
  "prixAchat":5.0,"pvMethode":"pourcentage","pvValeur":40,
  "photo":"https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=400&h=300&fit=crop&q=80",
  "prixCHR":6.00,"prixMarchand":6.25,"prixParticulier":7.00,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":7.00,"marketplaceOrdre":13,
  "marketplaceDescription":"Épinards frais en bottes, feuilles tendres et nutritives.",
  "marketplaceTags":["légumes","épinards","frais","vert"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

('seed-art-019', '{
  "id":"seed-art-019","nom":"Chou-fleur","nomAr":"قرنبيط","famille":"Légumes",
  "unite":"pièce","um":"Pièce","colisageParUM":1,"colisageCaisses":8,
  "stockDisponible":90,"stockDefect":5,"shelfLifeJours":10,"alerteShelfLifeJours":2,
  "prixAchat":5.0,"pvMethode":"pourcentage","pvValeur":30,
  "photo":"https://images.unsplash.com/photo-1510627489930-0c1b0bfb6785?w=400&h=300&fit=crop&q=80",
  "prixCHR":6.00,"prixMarchand":6.25,"prixParticulier":6.50,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":6.50,"marketplaceOrdre":14,
  "marketplaceDescription":"Chou-fleur blanc et ferme, idéal pour les gratins et les soupes.",
  "marketplaceTags":["légumes","chou-fleur","frais"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

('seed-art-020', '{
  "id":"seed-art-020","nom":"Salade Laitue","nomAr":"خس","famille":"Légumes",
  "unite":"pièce","um":"Pièce","colisageParUM":1,"colisageCaisses":12,
  "stockDisponible":150,"stockDefect":8,"shelfLifeJours":5,"alerteShelfLifeJours":1,
  "prixAchat":2.0,"pvMethode":"pourcentage","pvValeur":38,
  "photo":"https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400&h=300&fit=crop&q=80",
  "prixCHR":2.40,"prixMarchand":2.50,"prixParticulier":2.76,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":3.00,"marketplaceOrdre":15,
  "marketplaceDescription":"Laitue fraîche croquante. Idéale pour les salades légères.",
  "marketplaceTags":["légumes","salade","frais","vert"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

('seed-art-021', '{
  "id":"seed-art-021","nom":"Artichaut","nomAr":"قرشوف","famille":"Légumes",
  "unite":"pièce","um":"Pièce","colisageParUM":1,"colisageCaisses":6,
  "stockDisponible":70,"stockDefect":4,"shelfLifeJours":7,"alerteShelfLifeJours":2,
  "prixAchat":4.0,"pvMethode":"pourcentage","pvValeur":40,
  "photo":"https://images.unsplash.com/photo-1567375698348-5d9d5ae99de0?w=400&h=300&fit=crop&q=80",
  "prixCHR":4.80,"prixMarchand":5.00,"prixParticulier":5.60,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":6.00,"marketplaceOrdre":16,
  "marketplaceDescription":"Artichauts frais de saison, tendres et savoureux.",
  "marketplaceTags":["légumes","artichaut","frais","saisonnier"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

('seed-art-022', '{
  "id":"seed-art-022","nom":"Betteraves Rouges","nomAr":"شمندر أحمر","famille":"Légumes",
  "unite":"kg","um":"Filet","colisageParUM":1,"colisageCaisses":10,
  "stockDisponible":100,"stockDefect":4,"shelfLifeJours":21,"alerteShelfLifeJours":4,
  "prixAchat":3.0,"pvMethode":"pourcentage","pvValeur":33,
  "photo":"https://images.unsplash.com/photo-1593424526416-2e9e5b0abb14?w=400&h=300&fit=crop&q=80",
  "prixCHR":3.60,"prixMarchand":3.75,"prixParticulier":3.99,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":4.00,"marketplaceOrdre":17,
  "marketplaceDescription":"Betteraves rouges sucrées, crues ou cuites. Riches en antioxydants.",
  "marketplaceTags":["légumes","betteraves","frais"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

('seed-art-023', '{
  "id":"seed-art-023","nom":"Navet Blanc","nomAr":"لفت أبيض","famille":"Légumes",
  "unite":"kg","um":"Caisse","colisageParUM":15,"colisageCaisses":15,
  "stockDisponible":120,"stockDefect":5,"shelfLifeJours":21,"alerteShelfLifeJours":4,
  "prixAchat":2.0,"pvMethode":"pourcentage","pvValeur":30,
  "photo":"https://images.unsplash.com/photo-1572859099717-ed3e4bb4f0a8?w=400&h=300&fit=crop&q=80",
  "prixCHR":2.40,"prixMarchand":2.50,"prixParticulier":2.60,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":2.60,"marketplaceOrdre":18,
  "marketplaceDescription":"Navets blancs frais, indispensables dans les couscous et les soupes.",
  "marketplaceTags":["légumes","navet","frais"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

-- ══ FRUITS ═══════════════════════════════════════════════════════════════════
('seed-art-003', '{
  "id":"seed-art-003","nom":"Fraises Kenitra","nomAr":"فراولة","famille":"Fruits",
  "unite":"kg","um":"Barquette","colisageParUM":0.5,
  "stockDisponible":85,"stockDefect":8,"shelfLifeJours":4,"alerteShelfLifeJours":1,
  "prixAchat":18.0,"pvMethode":"pourcentage","pvValeur":40,
  "photo":"https://images.unsplash.com/photo-1601004890657-6646e1ff5e20?w=400&h=300&fit=crop&q=80",
  "prixCHR":21.60,"prixMarchand":22.50,"prixParticulier":25.20,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":28.00,"marketplaceOrdre":20,
  "marketplaceDescription":"Fraises de Kenitra, sucrées et parfumées. Récoltées chaque matin de janvier à avril.",
  "marketplaceTags":["fruits","fraises","frais","saisonnier","nouveau"],
  "marketplacePromo":{"actif":true,"prixPromo":25.00,"etiquette":"Saison Fraises !"},
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

('seed-art-005', '{
  "id":"seed-art-005","nom":"Avocats Hass","nomAr":"أفوكادو","famille":"Fruits",
  "unite":"kg","um":"Caisse","colisageParUM":10,"colisageCaisses":10,
  "stockDisponible":120,"stockDefect":5,"shelfLifeJours":10,"alerteShelfLifeJours":3,
  "prixAchat":22.0,"pvMethode":"pourcentage","pvValeur":38,
  "photo":"https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=400&h=300&fit=crop&q=80",
  "prixCHR":26.40,"prixMarchand":27.50,"prixParticulier":30.36,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":35.00,"marketplaceOrdre":21,
  "marketplaceDescription":"Avocats Hass du Souss, crémeux et nutritifs. Riches en bonnes graisses.",
  "marketplaceTags":["fruits","avocats","frais","premium"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

('seed-art-024', '{
  "id":"seed-art-024","nom":"Pommes Golden","nomAr":"تفاح ذهبي","famille":"Fruits",
  "unite":"kg","um":"Caisse","colisageParUM":18,"colisageCaisses":18,
  "stockDisponible":320,"stockDefect":12,"shelfLifeJours":30,"alerteShelfLifeJours":5,
  "prixAchat":6.0,"pvMethode":"pourcentage","pvValeur":33,
  "photo":"https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?w=400&h=300&fit=crop&q=80",
  "prixCHR":7.20,"prixMarchand":7.50,"prixParticulier":7.98,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":8.50,"marketplaceOrdre":22,
  "marketplaceDescription":"Pommes Golden du Moyen Atlas, croquantes et sucrées.",
  "marketplaceTags":["fruits","pommes","frais"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

('seed-art-025', '{
  "id":"seed-art-025","nom":"Poires Williams","nomAr":"إجاص","famille":"Fruits",
  "unite":"kg","um":"Caisse","colisageParUM":15,"colisageCaisses":15,
  "stockDisponible":140,"stockDefect":8,"shelfLifeJours":14,"alerteShelfLifeJours":3,
  "prixAchat":7.0,"pvMethode":"pourcentage","pvValeur":36,
  "photo":"https://images.unsplash.com/photo-1514756331096-242fdeb70d4a?w=400&h=300&fit=crop&q=80",
  "prixCHR":8.40,"prixMarchand":8.75,"prixParticulier":9.52,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":10.00,"marketplaceOrdre":23,
  "marketplaceDescription":"Poires Williams juteuses et parfumées du Maroc.",
  "marketplaceTags":["fruits","poires","frais"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

('seed-art-026', '{
  "id":"seed-art-026","nom":"Raisins Rouges","nomAr":"عنب أحمر","famille":"Fruits",
  "unite":"kg","um":"Caisse","colisageParUM":8,"colisageCaisses":8,
  "stockDisponible":95,"stockDefect":6,"shelfLifeJours":14,"alerteShelfLifeJours":3,
  "prixAchat":10.0,"pvMethode":"pourcentage","pvValeur":40,
  "photo":"https://images.unsplash.com/photo-1537640538966-cf936f9c6d67?w=400&h=300&fit=crop&q=80",
  "prixCHR":12.00,"prixMarchand":12.50,"prixParticulier":14.00,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":15.00,"marketplaceOrdre":24,
  "marketplaceDescription":"Raisins rouges charnus et sucrés de la région de Meknès.",
  "marketplaceTags":["fruits","raisins","frais"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

('seed-art-027', '{
  "id":"seed-art-027","nom":"Pastèque","nomAr":"دلاح","famille":"Fruits",
  "unite":"kg","um":"Pièce","colisageParUM":8,"colisageCaisses":4,
  "stockDisponible":200,"stockDefect":10,"shelfLifeJours":21,"alerteShelfLifeJours":4,
  "prixAchat":1.8,"pvMethode":"pourcentage","pvValeur":33,
  "photo":"https://images.unsplash.com/photo-1563114773-84221bd62daa?w=400&h=300&fit=crop&q=80",
  "prixCHR":2.16,"prixMarchand":2.25,"prixParticulier":2.40,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":2.50,"marketplaceOrdre":25,
  "marketplaceDescription":"Pastèques sucrées et juteuses, rafraîchissantes en été.",
  "marketplaceTags":["fruits","pastèque","frais","estival"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

('seed-art-028', '{
  "id":"seed-art-028","nom":"Melon Cantaloup","nomAr":"بطيخ أصفر","famille":"Fruits",
  "unite":"kg","um":"Pièce","colisageParUM":2,"colisageCaisses":6,
  "stockDisponible":80,"stockDefect":5,"shelfLifeJours":14,"alerteShelfLifeJours":3,
  "prixAchat":4.0,"pvMethode":"pourcentage","pvValeur":38,
  "photo":"https://images.unsplash.com/photo-1571575173700-afb9492e6a50?w=400&h=300&fit=crop&q=80",
  "prixCHR":4.80,"prixMarchand":5.00,"prixParticulier":5.52,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":6.00,"marketplaceOrdre":26,
  "marketplaceDescription":"Melon cantaloup parfumé et sucré. Idéal pour le dessert.",
  "marketplaceTags":["fruits","melon","frais","estival"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

('seed-art-029', '{
  "id":"seed-art-029","nom":"Mangue Keitt","nomAr":"مانجو","famille":"Fruits Tropicaux",
  "unite":"kg","um":"Caisse","colisageParUM":5,"colisageCaisses":5,
  "stockDisponible":60,"stockDefect":4,"shelfLifeJours":10,"alerteShelfLifeJours":2,
  "prixAchat":14.0,"pvMethode":"pourcentage","pvValeur":43,
  "photo":"https://images.unsplash.com/photo-1601493700631-2b16ec4b4716?w=400&h=300&fit=crop&q=80",
  "prixCHR":16.80,"prixMarchand":17.50,"prixParticulier":20.00,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":22.00,"marketplaceOrdre":27,
  "marketplaceDescription":"Mangues Keitt juteuses et peu fibreuses, importées fraîches.",
  "marketplaceTags":["fruits","mangue","tropical","frais"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

('seed-art-030', '{
  "id":"seed-art-030","nom":"Kiwi","nomAr":"كيوي","famille":"Fruits",
  "unite":"kg","um":"Filet","colisageParUM":1,"colisageCaisses":8,
  "stockDisponible":80,"stockDefect":4,"shelfLifeJours":21,"alerteShelfLifeJours":4,
  "prixAchat":12.0,"pvMethode":"pourcentage","pvValeur":40,
  "photo":"https://images.unsplash.com/photo-1585059895524-72359e06133a?w=400&h=300&fit=crop&q=80",
  "prixCHR":14.40,"prixMarchand":15.00,"prixParticulier":16.80,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":18.00,"marketplaceOrdre":28,
  "marketplaceDescription":"Kiwis verts juteux, riches en vitamine C.",
  "marketplaceTags":["fruits","kiwi","frais"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

('seed-art-031', '{
  "id":"seed-art-031","nom":"Pêches","nomAr":"خوخ","famille":"Fruits",
  "unite":"kg","um":"Caisse","colisageParUM":10,"colisageCaisses":10,
  "stockDisponible":110,"stockDefect":8,"shelfLifeJours":7,"alerteShelfLifeJours":2,
  "prixAchat":8.0,"pvMethode":"pourcentage","pvValeur":38,
  "photo":"https://images.unsplash.com/photo-1629828874514-17c66f7b5d3b?w=400&h=300&fit=crop&q=80",
  "prixCHR":9.60,"prixMarchand":10.00,"prixParticulier":11.04,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":12.00,"marketplaceOrdre":29,
  "marketplaceDescription":"Pêches juteuses et parfumées de la région de Beni Mellal.",
  "marketplaceTags":["fruits","pêches","frais","saisonnier"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

('seed-art-032', '{
  "id":"seed-art-032","nom":"Figues Fraîches","nomAr":"تين طازج","famille":"Fruits",
  "unite":"kg","um":"Caisse","colisageParUM":5,"colisageCaisses":5,
  "stockDisponible":50,"stockDefect":6,"shelfLifeJours":5,"alerteShelfLifeJours":1,
  "prixAchat":15.0,"pvMethode":"pourcentage","pvValeur":40,
  "photo":"https://images.unsplash.com/photo-1601648764658-cf37e8c89b70?w=400&h=300&fit=crop&q=80",
  "prixCHR":18.00,"prixMarchand":18.75,"prixParticulier":21.00,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":22.00,"marketplaceOrdre":30,
  "marketplaceDescription":"Figues fraîches sucrées de Boulemane et Midelt.",
  "marketplaceTags":["fruits","figues","frais","saisonnier"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

('seed-art-033', '{
  "id":"seed-art-033","nom":"Grenade","nomAr":"رمان","famille":"Fruits",
  "unite":"kg","um":"Caisse","colisageParUM":10,"colisageCaisses":10,
  "stockDisponible":130,"stockDefect":6,"shelfLifeJours":30,"alerteShelfLifeJours":5,
  "prixAchat":8.0,"pvMethode":"pourcentage","pvValeur":38,
  "photo":"https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=400&h=300&fit=crop&q=80",
  "prixCHR":9.60,"prixMarchand":10.00,"prixParticulier":11.04,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":12.00,"marketplaceOrdre":31,
  "marketplaceDescription":"Grenades rouges juteuses et antioxydantes du Maroc.",
  "marketplaceTags":["fruits","grenade","frais"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

-- ══ AGRUMES ══════════════════════════════════════════════════════════════════
('seed-art-004', '{
  "id":"seed-art-004","nom":"Oranges Navel","nomAr":"برتقال نافل","famille":"Agrumes",
  "unite":"kg","um":"Filet 5kg","colisageParUM":5,"colisageCaisses":20,
  "stockDisponible":680,"stockDefect":15,"shelfLifeJours":21,"alerteShelfLifeJours":4,
  "prixAchat":4.5,"pvMethode":"pourcentage","pvValeur":25,
  "photo":"https://images.unsplash.com/photo-1547514701-42782101795e?w=400&h=300&fit=crop&q=80",
  "prixCHR":5.40,"prixMarchand":5.63,"prixParticulier":5.63,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":6.00,"marketplaceOrdre":35,
  "marketplaceDescription":"Oranges Navel du Souss, sans pépins et très sucrées. Idéales pour les jus frais.",
  "marketplaceTags":["agrumes","oranges","frais","jus"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

('seed-art-007', '{
  "id":"seed-art-007","nom":"Citrons Eureka","nomAr":"ليمون يوريكا","famille":"Agrumes",
  "unite":"kg","um":"Caisse","colisageParUM":15,"colisageCaisses":15,
  "stockDisponible":210,"stockDefect":4,"shelfLifeJours":28,"alerteShelfLifeJours":5,
  "prixAchat":5.0,"pvMethode":"pourcentage","pvValeur":28,
  "photo":"https://images.unsplash.com/photo-1588165171850-4e5f119d2d78?w=400&h=300&fit=crop&q=80",
  "prixCHR":6.00,"prixMarchand":6.25,"prixParticulier":6.40,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":7.00,"marketplaceOrdre":36,
  "marketplaceDescription":"Citrons Eureka juteux, indispensables pour sauces, marinades et conserves.",
  "marketplaceTags":["agrumes","citrons","frais"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

('seed-art-034', '{
  "id":"seed-art-034","nom":"Clémentines","nomAr":"يوسفي","famille":"Agrumes",
  "unite":"kg","um":"Filet 2kg","colisageParUM":2,"colisageCaisses":15,
  "stockDisponible":450,"stockDefect":15,"shelfLifeJours":21,"alerteShelfLifeJours":4,
  "prixAchat":5.5,"pvMethode":"pourcentage","pvValeur":27,
  "photo":"https://images.unsplash.com/photo-1547514701-42782101795e?w=400&h=300&fit=crop&q=80",
  "prixCHR":6.60,"prixMarchand":6.88,"prixParticulier":6.99,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":7.50,"marketplaceOrdre":37,
  "marketplaceDescription":"Clémentines marocaines (Yousfi) sans pépins, faciles à éplucher.",
  "marketplaceTags":["agrumes","clémentines","frais"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

('seed-art-035', '{
  "id":"seed-art-035","nom":"Pamplemousse","nomAr":"برتقال هندي","famille":"Agrumes",
  "unite":"kg","um":"Filet","colisageParUM":3,"colisageCaisses":10,
  "stockDisponible":90,"stockDefect":5,"shelfLifeJours":28,"alerteShelfLifeJours":5,
  "prixAchat":4.0,"pvMethode":"pourcentage","pvValeur":35,
  "photo":"https://images.unsplash.com/photo-1572144883195-36b50c5a9ce5?w=400&h=300&fit=crop&q=80",
  "prixCHR":4.80,"prixMarchand":5.00,"prixParticulier":5.40,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":5.50,"marketplaceOrdre":38,
  "marketplaceDescription":"Pamplemousses frais, légèrement acidulés. Idéals pour le breakfast.",
  "marketplaceTags":["agrumes","pamplemousse","frais"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

-- ══ FRUITS TROPICAUX ════════════════════════════════════════════════════════
('seed-art-008', '{
  "id":"seed-art-008","nom":"Bananes Cavendish","nomAr":"موز","famille":"Fruits Tropicaux",
  "unite":"kg","um":"Régime","colisageParUM":18,
  "stockDisponible":270,"stockDefect":20,"shelfLifeJours":7,"alerteShelfLifeJours":2,
  "prixAchat":7.5,"pvMethode":"pourcentage","pvValeur":32,
  "photo":"https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=400&h=300&fit=crop&q=80",
  "prixCHR":9.00,"prixMarchand":9.38,"prixParticulier":9.90,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":10.00,"marketplaceOrdre":40,
  "marketplaceDescription":"Bananes Cavendish fraîches importées. Énergétiques et nutritives.",
  "marketplaceTags":["fruits","bananes","tropical","frais"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

-- ══ HERBES & AROMATIQUES ════════════════════════════════════════════════════
('seed-art-036', '{
  "id":"seed-art-036","nom":"Coriandre Fraîche","nomAr":"قزبر","famille":"Herbes",
  "unite":"botte","um":"Botte","colisageParUM":1,
  "stockDisponible":200,"stockDefect":10,"shelfLifeJours":5,"alerteShelfLifeJours":1,
  "prixAchat":1.5,"pvMethode":"pourcentage","pvValeur":67,
  "photo":"https://images.unsplash.com/photo-1600857544200-b2f468e09e53?w=400&h=300&fit=crop&q=80",
  "prixCHR":1.80,"prixMarchand":2.00,"prixParticulier":2.50,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":2.50,"marketplaceOrdre":50,
  "marketplaceDescription":"Coriandre fraîche en bottes, parfum intense. Base de la cuisine marocaine.",
  "marketplaceTags":["herbes","coriandre","aromatiques","frais"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

('seed-art-037', '{
  "id":"seed-art-037","nom":"Persil Plat","nomAr":"معدنوس","famille":"Herbes",
  "unite":"botte","um":"Botte","colisageParUM":1,
  "stockDisponible":180,"stockDefect":8,"shelfLifeJours":5,"alerteShelfLifeJours":1,
  "prixAchat":1.0,"pvMethode":"pourcentage","pvValeur":100,
  "photo":"https://images.unsplash.com/photo-1590301157890-4810ed352733?w=400&h=300&fit=crop&q=80",
  "prixCHR":1.20,"prixMarchand":1.50,"prixParticulier":2.00,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":2.00,"marketplaceOrdre":51,
  "marketplaceDescription":"Persil plat frais en bottes, essentiel pour les sauces et marinades.",
  "marketplaceTags":["herbes","persil","aromatiques","frais"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

('seed-art-038', '{
  "id":"seed-art-038","nom":"Menthe Fraîche","nomAr":"نعناع","famille":"Herbes",
  "unite":"botte","um":"Botte","colisageParUM":1,
  "stockDisponible":250,"stockDefect":12,"shelfLifeJours":5,"alerteShelfLifeJours":1,
  "prixAchat":1.0,"pvMethode":"pourcentage","pvValeur":100,
  "photo":"https://images.unsplash.com/photo-1628556270448-4d4e4148e1b1?w=400&h=300&fit=crop&q=80",
  "prixCHR":1.20,"prixMarchand":1.50,"prixParticulier":2.00,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":2.00,"marketplaceOrdre":52,
  "marketplaceDescription":"Menthe fraîche marocaine, parfum intense. Indispensable pour le thé à la menthe.",
  "marketplaceTags":["herbes","menthe","aromatiques","frais","thé"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

('seed-art-039', '{
  "id":"seed-art-039","nom":"Basilic Frais","nomAr":"ريحان","famille":"Herbes",
  "unite":"botte","um":"Pot","colisageParUM":1,
  "stockDisponible":60,"stockDefect":4,"shelfLifeJours":5,"alerteShelfLifeJours":1,
  "prixAchat":3.0,"pvMethode":"pourcentage","pvValeur":67,
  "photo":"https://images.unsplash.com/photo-1618375531912-867984bdfd87?w=400&h=300&fit=crop&q=80",
  "prixCHR":3.60,"prixMarchand":4.00,"prixParticulier":5.00,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":5.00,"marketplaceOrdre":53,
  "marketplaceDescription":"Basilic frais parfumé, idéal pour les pesto et les plats orientaux.",
  "marketplaceTags":["herbes","basilic","aromatiques","frais"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

('seed-art-040', '{
  "id":"seed-art-040","nom":"Thym Frais","nomAr":"زعتر","famille":"Herbes",
  "unite":"botte","um":"Botte","colisageParUM":1,
  "stockDisponible":80,"stockDefect":4,"shelfLifeJours":7,"alerteShelfLifeJours":2,
  "prixAchat":3.5,"pvMethode":"pourcentage","pvValeur":43,
  "photo":"https://images.unsplash.com/photo-1559589689-577ded92465b?w=400&h=300&fit=crop&q=80",
  "prixCHR":4.20,"prixMarchand":4.50,"prixParticulier":5.00,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":5.00,"marketplaceOrdre":54,
  "marketplaceDescription":"Thym frais parfumé pour les marinades, rôtis et tajines.",
  "marketplaceTags":["herbes","thym","aromatiques","frais"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

('seed-art-041', '{
  "id":"seed-art-041","nom":"Romarin Frais","nomAr":"إكليل الجبل","famille":"Herbes",
  "unite":"botte","um":"Botte","colisageParUM":1,
  "stockDisponible":50,"stockDefect":3,"shelfLifeJours":10,"alerteShelfLifeJours":2,
  "prixAchat":4.0,"pvMethode":"pourcentage","pvValeur":38,
  "photo":"https://images.unsplash.com/photo-1564525632696-6e2d4aafc1e4?w=400&h=300&fit=crop&q=80",
  "prixCHR":4.80,"prixMarchand":5.00,"prixParticulier":5.52,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":6.00,"marketplaceOrdre":55,
  "marketplaceDescription":"Romarin frais très parfumé, idéal pour les viandes grillées.",
  "marketplaceTags":["herbes","romarin","aromatiques","frais"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

('seed-art-042', '{
  "id":"seed-art-042","nom":"Céleri Branche","nomAr":"كرفس","famille":"Herbes",
  "unite":"pièce","um":"Botte","colisageParUM":1,
  "stockDisponible":70,"stockDefect":5,"shelfLifeJours":10,"alerteShelfLifeJours":2,
  "prixAchat":3.0,"pvMethode":"pourcentage","pvValeur":33,
  "photo":"https://images.unsplash.com/photo-1615485736407-5bcb4ea3cf40?w=400&h=300&fit=crop&q=80",
  "prixCHR":3.60,"prixMarchand":3.75,"prixParticulier":3.99,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":4.00,"marketplaceOrdre":56,
  "marketplaceDescription":"Céleri en branches frais, croquant et parfumé pour soupes et sautés.",
  "marketplaceTags":["herbes","céleri","aromatiques","frais"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now()),

('seed-art-043', '{
  "id":"seed-art-043","nom":"Fenouil","nomAr":"بسباس","famille":"Herbes",
  "unite":"pièce","um":"Pièce","colisageParUM":1,
  "stockDisponible":45,"stockDefect":3,"shelfLifeJours":10,"alerteShelfLifeJours":2,
  "prixAchat":5.0,"pvMethode":"pourcentage","pvValeur":40,
  "photo":"https://images.unsplash.com/photo-1615485736407-5bcb4ea3cf40?w=400&h=300&fit=crop&q=80",
  "prixCHR":6.00,"prixMarchand":6.25,"prixParticulier":7.00,
  "marketplaceActif":true,"marketplaceStatut":"disponible",
  "marketplacePrixPublic":7.50,"marketplaceOrdre":57,
  "marketplaceDescription":"Fenouil frais anisé, délicieux cru ou cuit. Très apprécié en cuisine méditerranéenne.",
  "marketplaceTags":["herbes","fenouil","aromatiques","frais"],
  "actif":true,"catalogueVisible":true
}'::jsonb, now())

ON CONFLICT (id) DO UPDATE
  SET payload = EXCLUDED.payload, updated_at = now();


-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 9 — Clients seed data (démonstration)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.fl_clients (id, payload, updated_at) VALUES
('seed-cl-001', '{"id":"seed-cl-001","nom":"Épicerie Al Amal","secteur":"Hay Hassani","zone":"Casablanca Sud","type":"epicerie","taille":"50-100kg","typeProduits":"moyenne","rotation":"journalier","modalitePaiement":"cash","plafondCredit":5000,"creditAutorise":false,"creditSolde":0,"telephone":"0661234567","email":"alaimal@demo.ma","adresse":"12 Rue Al Amal, Hay Hassani","gpsLat":33.536,"gpsLng":-7.655,"createdBy":"seed","createdAt":"2026-04-26","segment":"standard","loyaltyPoints":120,"loyaltyOptIn":true,"actif":true}'::jsonb, now()),
('seed-cl-002', '{"id":"seed-cl-002","nom":"Superette Nour","secteur":"Ain Chock","zone":"Casablanca Est","type":"superette","taille":"150-300kg","typeProduits":"haute_gamme","rotation":"4j/6","modalitePaiement":"credit_7","plafondCredit":20000,"creditAutorise":true,"creditSolde":3200,"telephone":"0662345678","email":"nour.superette@demo.ma","adresse":"45 Bd Hassan II, Ain Chock","gpsLat":33.553,"gpsLng":-7.543,"createdBy":"seed","createdAt":"2026-04-11","segment":"vip","loyaltyPoints":850,"loyaltyOptIn":true,"actif":true}'::jsonb, now()),
('seed-cl-003', '{"id":"seed-cl-003","nom":"Marché Centrale Wholesale","secteur":"Derb Omar","zone":"Casablanca Centre","type":"grossiste","taille":"500kg+","typeProduits":"entree_gamme","rotation":"journalier","modalitePaiement":"virement","plafondCredit":80000,"creditAutorise":true,"creditSolde":15400,"telephone":"0521123456","email":"centrale.wholesale@demo.ma","adresse":"Derb Omar, Marché de Gros","gpsLat":33.591,"gpsLng":-7.617,"createdBy":"seed","createdAt":"2026-03-27","segment":"grossiste","loyaltyPoints":2400,"loyaltyOptIn":false,"actif":true}'::jsonb, now()),
('seed-cl-004', '{"id":"seed-cl-004","nom":"Restaurant Le Patio","secteur":"Anfa","zone":"Casablanca Centre","type":"restaurant","taille":"30-50kg","typeProduits":"haute_gamme","rotation":"4j/6","modalitePaiement":"credit_30","plafondCredit":15000,"creditAutorise":true,"creditSolde":4800,"telephone":"0522345678","email":"lepatio@demo.ma","adresse":"25 Bd d''Anfa, Casablanca","gpsLat":33.586,"gpsLng":-7.632,"createdBy":"seed","createdAt":"2026-04-16","segment":"vip","loyaltyPoints":560,"loyaltyOptIn":true,"categorie":"chr","actif":true}'::jsonb, now()),
('seed-cl-005', '{"id":"seed-cl-005","nom":"Café Atlas","secteur":"Maarif","zone":"Casablanca Centre","type":"cafeteria","taille":"10-30kg","typeProduits":"moyenne","rotation":"hebdo","modalitePaiement":"cash","plafondCredit":0,"creditAutorise":false,"creditSolde":0,"telephone":"0661987654","email":"atlas.cafe@demo.ma","adresse":"7 Rue Maarif, Casablanca","gpsLat":33.578,"gpsLng":-7.641,"createdBy":"seed","createdAt":"2026-04-26","segment":"standard","loyaltyPoints":45,"loyaltyOptIn":true,"categorie":"chr","actif":true}'::jsonb, now())
ON CONFLICT (id) DO UPDATE
  SET payload = EXCLUDED.payload, updated_at = now();


-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 10 — Fournisseurs seed data
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.fl_fournisseurs (id, payload, updated_at) VALUES
('seed-fo-001', '{"id":"seed-fo-001","nom":"Ferme Souss Agri","contact":"Mohammed Ait Benhaddou","telephone":"0661987654","email":"souss.agri@demo.ma","adresse":"Douar Oulad Said, Agadir","ville":"Agadir","region":"Souss-Massa","specialites":["Tomates Rondes","Avocats Hass","Oranges Navel"],"modalitePaiement":"virement","delaiPaiement":30,"ice":"001234567000045","actif":true}'::jsonb, now()),
('seed-fo-002', '{"id":"seed-fo-002","nom":"Coopérative Meknès","contact":"Rachida Benali","telephone":"0535445566","email":"coop.meknes@demo.ma","adresse":"Route d''Azrou, Meknès","ville":"Meknès","region":"Fès-Meknès","specialites":["Pommes de Terre","Carottes","Oignons","Ail"],"modalitePaiement":"cheque","delaiPaiement":15,"actif":true}'::jsonb, now()),
('seed-fo-003', '{"id":"seed-fo-003","nom":"Coopérative Gharb","contact":"Khalid Zemmouri","telephone":"0537789012","email":"gharb.coop@demo.ma","adresse":"Sidi Slimane, Gharb","ville":"Sidi Slimane","region":"Rabat-Salé-Kénitra","specialites":["Fraises Kenitra","Clémentines","Poivrons"],"modalitePaiement":"cash","delaiPaiement":7,"actif":true}'::jsonb, now())
ON CONFLICT (id) DO UPDATE
  SET payload = EXCLUDED.payload, updated_at = now();


-- ─────────────────────────────────────────────────────────────────────────────
-- ✅ SETUP TERMINÉ — Vérification
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  'Tables créées'   AS etape,
  count(*)::text    AS resultat
FROM pg_tables
WHERE schemaname = 'public' AND tablename LIKE 'fl_%'
UNION ALL
SELECT 'Articles insérés', count(*)::text FROM public.fl_articles
UNION ALL
SELECT 'Clients insérés',  count(*)::text FROM public.fl_clients
UNION ALL
SELECT 'Fournisseurs insérés', count(*)::text FROM public.fl_fournisseurs
UNION ALL
SELECT 'Web integration', count(*)::text FROM public.fl_web_integration
UNION ALL
SELECT 'Vue catalogue', count(*)::text FROM public.v_marketplace_catalogue
UNION ALL
SELECT 'Accès site (table)', '✅ créée' FROM pg_tables WHERE tablename='fl_site_access' AND schemaname='public';
