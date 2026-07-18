-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION 0004 — Caisses par référence, RH (absences/paie), rapprochement
-- supply chain, alertes fournisseurs
-- ════════════════════════════════════════════════════════════════════════════
--
-- Toutes les nouvelles tables suivent le schéma générique déjà en place sur
-- les 65 tables fl_* existantes (voir 0001) : {id TEXT PK, payload JSONB,
-- updated_at TIMESTAMPTZ}. L'app sérialise l'objet entier dans `payload` ;
-- aucune colonne métier typée n'est nécessaire (cf. lib/supabase/db.ts
-- toRow()/fromRow()). Chaque table est verrouillée RLS de la même façon que
-- les 65 tables existantes : FORCE ROW LEVEL SECURITY, aucune policy anon/
-- authenticated (accès refusé par défaut), seul service_role (utilisé
-- exclusivement par l'api-server via /api/sync-write et /api/sync-read) peut
-- lire/écrire. Les autorisations fines par rôle (super_super_admin vs
-- super_admin scopé à son équipe, etc.) sont appliquées côté application
-- (lib/store.ts, lib/permissions.ts) — il n'y a pas de session Supabase Auth
-- dans cette architecture, donc pas de policy keyed sur auth.uid().
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── fl_caisse_references — Référentiel des caisses (ex: "226 Petit/Grand") ──
CREATE TABLE IF NOT EXISTS public.fl_caisse_references (
  id          TEXT PRIMARY KEY,
  payload     JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── fl_pointages — Jours de travail effectifs (RH) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.fl_pointages (
  id          TEXT PRIMARY KEY,
  payload     JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── fl_absences — Déclarations et historique d'absences (RH) ───────────────
CREATE TABLE IF NOT EXISTS public.fl_absences (
  id          TEXT PRIMARY KEY,
  payload     JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── fl_relances_fournisseur — Journal des relances / alertes manquants ─────
-- (rapprochement Commande vs Achat vs Réception)
CREATE TABLE IF NOT EXISTS public.fl_relances_fournisseur (
  id          TEXT PRIMARY KEY,
  payload     JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'fl_caisse_references', 'fl_pointages', 'fl_absences', 'fl_relances_fournisseur'
  ])
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

COMMIT;
