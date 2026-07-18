-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION 0006 — Amorçage du nouveau projet Supabase (pwhycjgrwxnokudaidmm)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Le projet Supabase précédent (bxdqkigoidwnscsjafwd) a été supprimé — ses
-- données ne sont pas récupérables. Ce script réamorce le strict nécessaire
-- pour que l'ERP soit utilisable dès la première connexion : le compte
-- super_super_admin (Jawad), les coordonnées entreprise, et le barème
-- fiscal (SMIG/CNSS/AMO). Tout le reste (clients, articles, commandes,
-- salariés...) doit être ressaisi via le back-office — il n'y a pas de
-- raccourci pour ces données métier, elles n'existent plus nulle part.
--
-- Valeurs alignées sur les fallbacks déjà codés dans lib/store.ts
-- (JAWAD_USER, DEFAULT_FISCAL_CONFIG, getCompanyConfig) — le compte/mot de
-- passe sont donc identiques à ce que l'app aurait de toute façon créé
-- localement à la première visite ; ce script évite juste de dépendre de
-- quel appareil se connecte en premier.
--
-- Idempotent (upsert par id) — rejouable sans risque.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── fl_users — compte super_super_admin (Jawad) ─────────────────────────────
INSERT INTO public.fl_users (id, payload, updated_at)
VALUES (
  'VFU00001',
  jsonb_build_object(
    'id', 'VFU00001',
    'name', 'Jawad',
    'email', 'jawad@vita-fresh.ma',
    'telephone', '0647333456',
    'password', 'Medghaly@22',
    'role', 'super_super_admin',
    'actif', true,
    'canViewAchat', true, 'canViewCommercial', true, 'canViewLogistique', true,
    'canViewStock', true, 'canViewCash', true, 'canViewFinance', true, 'canViewRecap', true,
    'canViewDatabase', true, 'canViewExternal', true, 'canCreateCommandeBO', true,
    'canViewRH', true, 'canViewInvestisseur', true,
    'notifAchat', true, 'notifCommercial', true, 'notifLivraison', true,
    'notifRecap', true, 'notifBesoinAchat', true
  ),
  now()
)
ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now();

-- ── fl_company — identité entreprise (config, ligne unique id="config") ─────
INSERT INTO public.fl_company (id, payload, updated_at)
VALUES (
  'config',
  jsonb_build_object(
    'nom', 'Vita Fresh',
    'adresse', '',
    'ville', 'Casablanca',
    'pays', 'Maroc',
    'telephone', '',
    'email', '',
    'couleurEntete', '#1a4f2a',
    'appName', 'FreshLink Pro',
    'appSlogan', 'Vita Fresh'
  ),
  now()
)
ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now();

-- ── fl_fiscal_config — SMIG/CNSS/AMO/IR (config, ligne unique id="config") ──
INSERT INTO public.fl_fiscal_config (id, payload, updated_at)
VALUES (
  'config',
  jsonb_build_object(
    'tauxTVA', 0,
    'tauxCotisationMinimale', 0.5,
    'tauxChargesPatronales', 20.5,
    'seuilAlerteMasseSalariale', 20,
    'joursOuvresParMois', 26,
    'tauxDroitTimbre', 0.25,
    'plafondCashAchatJour', 5000,
    'plafondCashVenteFacture', 10000,
    'smigHoraireDH', 17.05,
    'smigMensuelDH', 3111,
    'heuresMensuellesReference', 191,
    'tauxCnssSalarial', 6.74,
    'tauxCnssPatronal', 8.98,
    'plafondCnssMensuelDH', 6000,
    'tauxPrestationsFamilialesPatronal', 6.4,
    'tauxFormationProfessionnellePatronal', 1.6,
    'tauxAmoSalarial', 4.52,
    'tauxAmoPatronal', 4.11,
    'fraisProfessionnelsTauxIR', 20,
    'fraisProfessionnelsPlafondIR', 2500,
    'baremeIR', jsonb_build_array(
      jsonb_build_object('id','t1','plafondMensuel',2500,'taux',0,'sommeADeduire',0),
      jsonb_build_object('id','t2','plafondMensuel',4166,'taux',10,'sommeADeduire',250.00),
      jsonb_build_object('id','t3','plafondMensuel',5000,'taux',20,'sommeADeduire',666.60),
      jsonb_build_object('id','t4','plafondMensuel',6666,'taux',30,'sommeADeduire',1166.60),
      jsonb_build_object('id','t5','plafondMensuel',15000,'taux',34,'sommeADeduire',1433.24),
      jsonb_build_object('id','t6','plafondMensuel',null,'taux',38,'sommeADeduire',2033.24)
    )
  ),
  now()
)
ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now();

COMMIT;

-- ── Vérification ──────────────────────────────────────────────────────────
-- SELECT id, payload->>'name' AS name, payload->>'role' AS role FROM public.fl_users;
-- SELECT payload->>'nom' AS company FROM public.fl_company WHERE id = 'config';
