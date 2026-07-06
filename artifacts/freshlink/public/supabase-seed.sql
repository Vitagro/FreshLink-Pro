-- ═══════════════════════════════════════════════════════════════════════════
-- VITA FRESH — Supabase Seed SQL (v2 — compatible colonne nomAr existante)
-- Exécuter dans : https://supabase.com/dashboard/project/jwdrwapuetqoqnankgma/sql/new
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Table fl_site_access (contrôle d'accès appareils) ─────────────────────
CREATE TABLE IF NOT EXISTS public.fl_site_access (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  device_id       TEXT NOT NULL UNIQUE,
  nom             TEXT,
  telephone       TEXT,
  statut          TEXT NOT NULL DEFAULT 'en_attente',
  gps_lat         DOUBLE PRECISION,
  gps_lng         DOUBLE PRECISION,
  gps_precision   FLOAT,
  user_agent      TEXT,
  first_visit_at  TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  autorise_par    TEXT,
  autorise_at     TIMESTAMPTZ,
  bloque_at       TIMESTAMPTZ,
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_fl_site_access_device ON public.fl_site_access (device_id);
CREATE INDEX IF NOT EXISTS idx_fl_site_access_statut ON public.fl_site_access (statut);

ALTER TABLE public.fl_site_access DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.fl_site_access TO anon, authenticated, service_role;

-- ── 2. Table fl_account_requests (demandes de compte depuis le site) ─────────
CREATE TABLE IF NOT EXISTS public.fl_account_requests (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  type        TEXT NOT NULL DEFAULT 'client',
  sous_type   TEXT DEFAULT '',
  nom         TEXT NOT NULL,
  email       TEXT,
  telephone   TEXT NOT NULL,
  societe     TEXT,
  ice         TEXT,
  ville       TEXT,
  message     TEXT,
  statut      TEXT NOT NULL DEFAULT 'en_attente',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  traite_par  TEXT,
  traite_at   TIMESTAMPTZ,
  notes_admin TEXT
);

CREATE INDEX IF NOT EXISTS idx_fl_account_requests_statut    ON public.fl_account_requests (statut);
CREATE INDEX IF NOT EXISTS idx_fl_account_requests_telephone ON public.fl_account_requests (telephone);

ALTER TABLE public.fl_account_requests DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.fl_account_requests TO anon, authenticated, service_role;

-- ── 3. Table fl_commandes_web (commandes depuis vitafresh.vercel.app) ─────────
CREATE TABLE IF NOT EXISTS public.fl_commandes_web (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  numero            TEXT NOT NULL UNIQUE,
  client_id         TEXT,
  prospect_id       TEXT,
  nom_client        TEXT NOT NULL,
  telephone         TEXT NOT NULL,
  email             TEXT,
  adresse_livraison TEXT,
  lignes            JSONB DEFAULT '[]',
  montant_total     NUMERIC(10,2) DEFAULT 0,
  date_souhaitee    DATE,
  creneau           TEXT,
  instructions      TEXT,
  statut            TEXT NOT NULL DEFAULT 'nouveau',
  source            TEXT DEFAULT 'site_web',
  ip_address        TEXT,
  traite_par        TEXT,
  traite_at         TIMESTAMPTZ,
  notes_admin       TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fl_commandes_web_statut    ON public.fl_commandes_web (statut);
CREATE INDEX IF NOT EXISTS idx_fl_commandes_web_telephone ON public.fl_commandes_web (telephone);
CREATE INDEX IF NOT EXISTS idx_fl_commandes_web_created   ON public.fl_commandes_web (created_at DESC);

ALTER TABLE public.fl_commandes_web DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.fl_commandes_web TO anon, authenticated, service_role;

-- ── 4. Table fl_articles — créer si elle n'existe pas ────────────────────────
-- Convertir toutes les colonnes générées en colonnes normales (évite l'erreur 428C9)
DO $$
DECLARE
  col TEXT;
  cols TEXT[] := ARRAY['nom', 'nomAr', 'famille', 'unite', 'prix_public',
                        'marketplace_actif', 'marketplace_prix_public',
                        'image_url', 'description', 'tags', 'ordre', 'statut'];
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'fl_articles') THEN
    FOREACH col IN ARRAY cols LOOP
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'fl_articles'
          AND column_name = col
          AND is_generated = 'ALWAYS'
      ) THEN
        EXECUTE format('ALTER TABLE public.fl_articles ALTER COLUMN %I DROP EXPRESSION', col);
      END IF;
    END LOOP;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.fl_articles (
  id                      TEXT PRIMARY KEY,
  nom                     TEXT NOT NULL,
  "nomAr"                 TEXT DEFAULT '',
  famille                 TEXT DEFAULT '',
  unite                   TEXT DEFAULT 'kg',
  prix_public             NUMERIC(10,2) DEFAULT 0,
  marketplace_actif       BOOLEAN DEFAULT true,
  marketplace_prix_public NUMERIC(10,2) DEFAULT 0,
  image_url               TEXT DEFAULT '',
  description             TEXT DEFAULT '',
  tags                    JSONB DEFAULT '[]',
  ordre                   INT DEFAULT 99,
  statut                  TEXT DEFAULT 'actif',
  updated_at              TIMESTAMPTZ DEFAULT now()
);

-- Ajouter les colonnes manquantes si la table existait déjà sans elles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fl_articles' AND column_name='nomAr') THEN
    ALTER TABLE public.fl_articles ADD COLUMN "nomAr" TEXT DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fl_articles' AND column_name='marketplace_actif') THEN
    ALTER TABLE public.fl_articles ADD COLUMN marketplace_actif BOOLEAN DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fl_articles' AND column_name='marketplace_prix_public') THEN
    ALTER TABLE public.fl_articles ADD COLUMN marketplace_prix_public NUMERIC(10,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fl_articles' AND column_name='image_url') THEN
    ALTER TABLE public.fl_articles ADD COLUMN image_url TEXT DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fl_articles' AND column_name='description') THEN
    ALTER TABLE public.fl_articles ADD COLUMN description TEXT DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fl_articles' AND column_name='tags') THEN
    ALTER TABLE public.fl_articles ADD COLUMN tags JSONB DEFAULT '[]';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fl_articles' AND column_name='ordre') THEN
    ALTER TABLE public.fl_articles ADD COLUMN ordre INT DEFAULT 99;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fl_articles' AND column_name='statut') THEN
    ALTER TABLE public.fl_articles ADD COLUMN statut TEXT DEFAULT 'actif';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fl_articles' AND column_name='famille') THEN
    ALTER TABLE public.fl_articles ADD COLUMN famille TEXT DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fl_articles' AND column_name='unite') THEN
    ALTER TABLE public.fl_articles ADD COLUMN unite TEXT DEFAULT 'kg';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fl_articles' AND column_name='prix_public') THEN
    ALTER TABLE public.fl_articles ADD COLUMN prix_public NUMERIC(10,2) DEFAULT 0;
  END IF;
END $$;

ALTER TABLE public.fl_articles DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.fl_articles TO anon, authenticated, service_role;

-- ── 5. Vue marketplace (utilise "nomAr" avec guillemets) ──────────────────────
DROP VIEW IF EXISTS public.v_marketplace_catalogue;
CREATE VIEW public.v_marketplace_catalogue AS
SELECT
  id, nom, "nomAr", famille, unite,
  prix_public, marketplace_actif, marketplace_prix_public,
  image_url, description, tags, ordre, statut, updated_at
FROM public.fl_articles
WHERE marketplace_actif = true AND statut = 'actif';

GRANT SELECT ON public.v_marketplace_catalogue TO anon, authenticated;

-- ── 6. Seed catalogue complet (33 produits) ───────────────────────────────────
INSERT INTO public.fl_articles
  (id, nom, "nomAr", famille, unite, prix_public, marketplace_actif, marketplace_prix_public, image_url, description, tags, ordre, statut)
VALUES
-- FRUITS
('fruit-tomate','Tomates','طماطم','Fruits','kg',4.5,true,4.5,'https://images.unsplash.com/photo-1546094096-0df4bcaad337?w=400&h=400&fit=crop&auto=format&q=80','Tomates fraîches de saison, gorgées de soleil. Idéales pour salades, sauces et tajines.','["frais","local","saison"]',1,'actif'),
('fruit-orange','Oranges','برتقال','Fruits','kg',5,true,5,'https://images.unsplash.com/photo-1547514701-42782101795e?w=400&h=400&fit=crop&auto=format&q=80','Oranges juteuses du Maroc, riches en vitamine C.','["vitaminé","jus","local"]',2,'actif'),
('fruit-pomme','Pommes','تفاح','Fruits','kg',7,true,7,'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=400&h=400&fit=crop&auto=format&q=80','Pommes croquantes et sucrées, variétés sélectionnées.','["croquant","sucré"]',3,'actif'),
('fruit-banane','Bananes','موز','Fruits','kg',6,true,6,'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=400&h=400&fit=crop&auto=format&q=80','Bananes mûres à point, riches en potassium.','["énergie","sport"]',4,'actif'),
('fruit-citron','Citrons','ليمون','Fruits','kg',5,true,5,'https://images.unsplash.com/photo-1590502593747-42a996133562?w=400&h=400&fit=crop&auto=format&q=80','Citrons frais acides et parfumés. Indispensables en cuisine marocaine.','["acidulé","cuisine","vitaminé"]',5,'actif'),
('fruit-pasteque','Pastèque','دلاح','Fruits','pièce',20,true,20,'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=400&h=400&fit=crop&auto=format&q=80','Pastèque fraîche et sucrée. Désaltérante en été.','["été","frais","sucré"]',6,'actif'),
('fruit-raisin','Raisin','عنب','Fruits','kg',12,true,12,'https://images.unsplash.com/photo-1537640538966-79f369143f8f?w=400&h=400&fit=crop&auto=format&q=80','Raisin frais, noir et blanc. Goût sucré intense.','["sucré","premium"]',7,'actif'),
('fruit-fraise','Fraises','فراولة','Fruits','kg',15,true,15,'https://images.unsplash.com/photo-1464965911861-746a04b4bca6?w=400&h=400&fit=crop&auto=format&q=80','Fraises rouges et parfumées du Maroc.','["dessert","parfumé","premium"]',8,'actif'),
('fruit-peche','Pêches','خوخ','Fruits','kg',9,true,9,'https://images.unsplash.com/photo-1595475207225-428b62bda831?w=400&h=400&fit=crop&auto=format&q=80','Pêches juteuses et sucrées de saison.','["saison","juteux"]',9,'actif'),
('fruit-melon','Melon','بطيخ أصفر','Fruits','pièce',18,true,18,'https://images.unsplash.com/photo-1571575173700-afb9492d8584?w=400&h=400&fit=crop&auto=format&q=80','Melon jaune sucré et parfumé. Chair fondante.','["été","sucré","parfumé"]',10,'actif'),
('fruit-clementine','Clémentines','يوسفي','Fruits','kg',6,true,6,'https://images.unsplash.com/photo-1580005893-e3c284cc0ae1?w=400&h=400&fit=crop&auto=format&q=80','Clémentines marocaines sans pépins.','["hiver","vitaminé","sans pépins"]',11,'actif'),
('fruit-avocat','Avocats','أفوكادو','Fruits','pièce',5,true,5,'https://images.unsplash.com/photo-1550258987-190a2d41a8ba?w=400&h=400&fit=crop&auto=format&q=80','Avocats crémeux, riches en bons lipides.','["healthy","premium","tendance"]',12,'actif'),
('fruit-grenade','Grenade','رمان','Fruits','pièce',4,true,4,'https://images.unsplash.com/photo-1615485736778-ca0a23af9993?w=400&h=400&fit=crop&auto=format&q=80','Grenade fraîche aux arilles rubis, riche en antioxydants.','["antioxydant","hiver","local"]',13,'actif'),
-- LÉGUMES
('leg-carotte','Carottes','جزر','Légumes','kg',3,true,3,'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?w=400&h=400&fit=crop&auto=format&q=80','Carottes fraîches et croquantes, riches en bêta-carotène.','["vitaminé","croquant","local"]',20,'actif'),
('leg-pomme-de-terre','Pommes de terre','بطاطس','Légumes','kg',3.5,true,3.5,'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=400&h=400&fit=crop&auto=format&q=80','Pommes de terre fraîches pour toutes préparations.','["polyvalent","local","essentiel"]',21,'actif'),
('leg-oignon','Oignons','بصل','Légumes','kg',2.5,true,2.5,'https://images.unsplash.com/photo-1618512496248-a4f7b6ed0e3d?w=400&h=400&fit=crop&auto=format&q=80','Oignons rouges et blancs, base de toute bonne cuisine.','["essentiel","cuisine","local"]',22,'actif'),
('leg-courgette','Courgettes','كوسة','Légumes','kg',4,true,4,'https://images.unsplash.com/photo-1566842600175-97dca3c5ad8d?w=400&h=400&fit=crop&auto=format&q=80','Courgettes tendres. Excellentes grillées ou en tajine.','["léger","été","tajine"]',23,'actif'),
('leg-concombre','Concombres','خيار','Légumes','kg',3.5,true,3.5,'https://images.unsplash.com/photo-1604977042946-1eecc30f269e?w=400&h=400&fit=crop&auto=format&q=80','Concombres frais et croquants. Parfaits en salades.','["frais","salade","hydratant"]',24,'actif'),
('leg-poivron','Poivrons','فلفل أحمر','Légumes','kg',8,true,8,'https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?w=400&h=400&fit=crop&auto=format&q=80','Poivrons rouges, verts et jaunes, sucrés et croquants.','["coloré","vitaminé","cuisine"]',25,'actif'),
('leg-aubergine','Aubergines','باذنجان','Légumes','kg',5,true,5,'https://images.unsplash.com/photo-1501426026826-31c667bdf23d?w=400&h=400&fit=crop&auto=format&q=80','Aubergines brillantes, idéales pour zaalouk et tajine.','["zaalouk","tajine","marocain"]',26,'actif'),
('leg-chou','Chou','كرنب','Légumes','pièce',4,true,4,'https://images.unsplash.com/photo-1598030304671-5aa1d6f2e82c?w=400&h=400&fit=crop&auto=format&q=80','Chou vert tendre et croquant. Excellent en salade.','["hivernal","fibre"]',27,'actif'),
('leg-haricot','Haricots verts','لوبيا خضراء','Légumes','kg',7,true,7,'https://images.unsplash.com/photo-1556030814-1b8dd21f9a25?w=400&h=400&fit=crop&auto=format&q=80','Haricots verts fins et tendres. En tajine ou vapeur.','["fin","vapeur","tajine"]',28,'actif'),
('leg-piment','Piments','هريسة خضراء','Légumes','kg',6,true,6,'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop&auto=format&q=80','Piments verts et rouges frais. Cuisine marocaine.','["épicé","marocain","cuisine"]',29,'actif'),
('leg-epinard','Épinards','سبانخ','Légumes','botte',4,true,4,'https://images.unsplash.com/photo-1576045057995-568f1167e03e?w=400&h=400&fit=crop&auto=format&q=80','Épinards frais et tendres. Riches en fer.','["santé","fer","vitamines"]',30,'actif'),
('leg-ail','Ail','ثوم','Légumes','tête',2,true,2,'https://images.unsplash.com/photo-1622205313610-696b0f8c9d0f?w=400&h=400&fit=crop&auto=format&q=80','Ail frais blanc. Indispensable en cuisine marocaine.','["aromate","essentiel","marocain"]',31,'actif'),
-- HERBES
('herbe-menthe','Menthe fraîche','نعناع','Herbes','botte',2,true,2,'https://images.unsplash.com/photo-1628556270448-4d4e4148e1b1?w=400&h=400&fit=crop&auto=format&q=80','Menthe fraîche marocaine. Thé à la menthe et cuisine.','["thé","marocain","parfumé","essentiel"]',40,'actif'),
('herbe-coriandre','Coriandre','قصبر','Herbes','botte',2,true,2,'https://images.unsplash.com/photo-1607305387299-a3d9611cd469?w=400&h=400&fit=crop&auto=format&q=80','Coriandre fraîche. Base de la cuisine marocaine.','["marocain","essentiel","parfumé"]',41,'actif'),
('herbe-persil','Persil','معدنوس','Herbes','botte',2,true,2,'https://images.unsplash.com/photo-1574481611-04f3d34cfade?w=400&h=400&fit=crop&auto=format&q=80','Persil plat frais et parfumé. Pour toutes les sauces.','["essentiel","sauce","garnir"]',42,'actif'),
('herbe-thym','Thym','زعتر','Herbes','botte',3,true,3,'https://images.unsplash.com/photo-1543158181-e6f9f6f6b8b0?w=400&h=400&fit=crop&auto=format&q=80','Thym frais, aromatique. Pour grillades et marinades.','["aromatique","grillades","marinade"]',43,'actif'),
('herbe-romarin','Romarin','إكليل الجبل','Herbes','botte',3,true,3,'https://images.unsplash.com/photo-1591922959680-3b4dbfb0f01a?w=400&h=400&fit=crop&auto=format&q=80','Romarin frais au parfum méditerranéen intense.','["méditerranéen","viande","rôti"]',44,'actif'),
('herbe-basilic','Basilic','ريحان','Herbes','botte',3,true,3,'https://images.unsplash.com/photo-1629397685945-4a4c2f6cb8e7?w=400&h=400&fit=crop&auto=format&q=80','Basilic frais au parfum délicat. Salades et sauces.','["délicat","salade","italienne"]',45,'actif')
ON CONFLICT (id) DO UPDATE SET
  nom                     = EXCLUDED.nom,
  "nomAr"                 = EXCLUDED."nomAr",
  famille                 = EXCLUDED.famille,
  unite                   = EXCLUDED.unite,
  prix_public             = EXCLUDED.prix_public,
  marketplace_actif       = EXCLUDED.marketplace_actif,
  marketplace_prix_public = EXCLUDED.marketplace_prix_public,
  image_url               = EXCLUDED.image_url,
  description             = EXCLUDED.description,
  tags                    = EXCLUDED.tags,
  ordre                   = EXCLUDED.ordre,
  statut                  = EXCLUDED.statut,
  updated_at              = now();

-- ── 7. Vérification ───────────────────────────────────────────────────────────
SELECT famille, count(*) as total FROM public.fl_articles GROUP BY famille ORDER BY famille;
SELECT id, statut, nom, telephone FROM public.fl_site_access ORDER BY first_visit_at DESC LIMIT 10;
