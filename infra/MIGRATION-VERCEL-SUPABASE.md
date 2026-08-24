# Migration Vercel → Hostinger / Supabase → self-hosted

Document de suivi de la migration. L'hébergement web (SPA + API Express) est
déjà sur Hostinger via `.github/workflows/deploy.yml` et `deploy-sites.yml`
(compte hPanel mutualisé/cloud, user `u387018932`, Passenger + Node 22).
Ce qui reste : (1) confirmer et couper Vercel, (2) sortir de Supabase
(Postgres + Auth + Storage).

## État des lieux (2026-08-24)

- [ ] Usage Vercel réel identifié (quel domaine/sous-domaine y pointe encore)
- [ ] Disponibilité de PostgreSQL natif sur le plan hPanel actuel
      (`hPanel → Bases de données → Bases de données PostgreSQL`)
- [ ] Décision : PostgreSQL natif hPanel **vs** VPS Hostinger satellite avec
      Supabase self-hosted (recommandé si pas de PG natif, car garde
      `@supabase/supabase-js` fonctionnel sans réécrire Auth/Storage)

## Pourquoi self-hosted Supabase plutôt que Postgres nu

Le code appelle `supabase-js` directement dans plusieurs fichiers pour
Auth et Storage, pas seulement pour la base :
`artifacts/api-server/src/lib/ext/supabaseEnv.ts`,
`artifacts/api-server/src/lib/ext/shopAdminPwd.ts`,
`artifacts/api-server/src/lib/push.ts`,
`artifacts/api-server/src/routes/ext/storageUsage.ts`,
`artifacts/api-server/src/routes/ext/auth.ts`,
`artifacts/api-server/src/routes/admin/index.ts`.
`scripts/backup-tables.mjs` dump aussi via l'API REST PostgREST
(`${SB_URL}/rest/v1/...`), pas via une connexion SQL directe.

Un self-host de la stack officielle Supabase (Postgres + GoTrue + PostgREST +
Storage + Kong) expose la même API REST/Auth/Storage : on ne change que
`SUPABASE_URL` / les clés, aucun de ces fichiers n'a besoin d'être réécrit.
Un Postgres nu obligerait à réécrire l'auth (JWT/bcrypt maison) et le storage
(disque local ou S3-compatible) — plus de risque de régression sur un ERP en
prod pour un gain d'indépendance marginal (on ne dépend déjà plus du service
géré par Supabase Inc., juste du logiciel open source qu'ils publient).

## Étapes

1. Provisionner un VPS Hostinger (KVM 1 suffit pour démarrer), Ubuntu LTS,
   voir `infra/supabase-selfhosted/README.md`.
2. Déployer la stack Supabase self-hosted derrière Nginx + Let's Encrypt sur
   un sous-domaine dédié (proposé : `db.vita-agro.com`).
3. `pg_dump` depuis Supabase cloud (schémas `public`, `auth`, `storage`) →
   `pg_restore` sur l'instance self-hosted. Voir
   `scripts/migrate-supabase-to-selfhosted.sh`.
4. Migrer les fichiers du Storage bucket par bucket (`rclone sync`, voir
   README).
5. Valider en staging (sous-domaine `erp-staging.vita-agro.com` ou
   déploiement manuel `workflow_dispatch`) avant de toucher aux secrets de
   prod.
6. Basculer les GitHub Secrets de prod (`SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`) et re-déployer `deploy.yml`.
   Le health-check existant (`api/sync-read` doit retourner `"ok"`) valide
   automatiquement, avec rollback auto si ça casse.
7. Garder le projet Supabase cloud **en pause** (pas supprimé) pendant 30
   jours après bascule, comme filet de sécurité.
8. Vérifier qu'aucun trafic n'arrive plus sur Vercel (Analytics à zéro
   72h), puis supprimer le projet Vercel.
9. Vérifier SPF/DKIM/DMARC intacts (`mail-tester.com`) après toute
   modification DNS liée à cette migration.

## Secrets à faire tourner après la migration

Tout secret Supabase/Hostinger/Vercel manipulé pendant cette migration
(collé en session, testé en clair) doit être régénéré/révoqué une fois la
bascule validée : `service_role key` Supabase cloud, mot de passe root du
VPS temporaire, token API Vercel utilisé pour la vérification finale.
