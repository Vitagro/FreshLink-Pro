# 🔴 C1 — Plan de durcissement RLS (base Supabase publique)

> **MISE À JOUR 2026-07-01** : ce plan supposait RLS désactivée + `GRANT ALL`
> à `anon`. Vérification empirique sur la prod (projet `bxdqkigoidwnscsjafwd`,
> et l'ancien projet avant migration) : **RLS est déjà activée et FORCÉE sur
> les 65 tables `fl_*`**, et 8 policies anon légitimes existent déjà (lecture
> catalogue/contacts/feedbacks/news/stats shop, dépôt d'avis). Le "problème"
> décrit ci-dessous est donc déjà résolu en pratique — quelqu'un a durci la
> base sans mettre à jour ce document ni `supabase/migrations/0001_rls_hardening.sql`
> (désormais resynchronisé, voir ce fichier).
>
> Point encore ouvert, sans lien avec RLS : `lib/auth/supabaseAuth.ts` /
> `hooks/useAuth.ts` interrogent `fl_users` comme si elle avait des colonnes
> plates, alors que le schéma réel est `(id, payload jsonb, updated_at)` — ce
> code semble déjà mort ou cassé indépendamment de RLS (le vrai login passe
> par `/api/ext/auth`). À auditer séparément avant de le retoucher ou de le
> supprimer.

## Problème
RLS est **désactivé** et `GRANT ALL TO anon` est appliqué à toutes les tables `fl_*`
(`artifacts/freshlink/public/supabase-setup.sql`, ~l.278-295). La clé `anon` étant
publique (intégrée au bundle JS du navigateur), **n'importe qui peut lire, modifier
et supprimer** toutes les données : clients, utilisateurs, commandes, salaires,
factures, actionnaires.

**Criticité : CRITIQUE.** Fuite totale + sabotage possible.

## Pourquoi on ne peut pas juste activer RLS tout de suite
L'app fait encore **~17 accès Supabase directs** depuis le navigateur avec la clé
anon (lectures *et* écritures), qui dépendent de RLS désactivé. Les couper d'un coup
casserait ces écrans. Bonne nouvelle : **les écritures de masse passent déjà** par
l'API authentifiée (`/api/sync-write`, garde device HMAC + `service_role`).

### Inventaire des accès anon directs à migrer (PHASE 1)
| Fichier | Tables | Type |
|---|---|---|
| `lib/supabase/useRealtimeSync.ts` | abonnements realtime | lecture (realtime) |
| `lib/auth/supabaseAuth.ts` | `fl_users` | lecture (login) |
| `components/backoffice/BackOfficeLayout.tsx` | `fl_config`, `fl_company_contacts`, `fl_prospects`, `fl_articles`… | lecture + écriture |
| `components/backoffice/BODocuments.tsx` | `fl_documents` | écriture |
| `components/SyncBanner.tsx` | `fl_config`/test connexion | lecture |
| (+ uploads) `*.storage.from(...).upload()` ×3 | bucket `freshlink-media` | écriture storage |

## Plan progressif (4 phases)

### PHASE 1 — Supprimer les accès anon directs (côté code, sans risque DB)
Rediriger les ~17 appels `.from('fl_…')` du navigateur vers l'API serveur :
- **Lectures** → `GET /api/sync-read?table=…` (déjà existant, service_role).
- **Écritures** → `POST /api/sync-write` (déjà existant, garde device + whitelist).
- **Login** (`fl_users`) → déjà une route `/api/ext/auth` ; y router `supabaseAuth.ts`.
- **Uploads storage** → endpoint serveur signé (à créer) ou policy bucket restreinte.
- **Realtime** → soit conserver un abonnement anon **SELECT-only** sur les rares
  tables concernées (policy dédiée), soit basculer en polling via l'API.

> Cette phase ne touche PAS la base : aucun risque de perte de données. Testable
> écran par écran.

### PHASE 2 — Policies realtime/storage ciblées
Pour ce qui reste légitimement côté navigateur (realtime, lecture catalogue) :
- `GRANT SELECT` + policy `USING (true)` uniquement sur les tables réellement
  abonnées en realtime.
- Bucket storage : policy de lecture publique, écriture via serveur uniquement.

### PHASE 3 — Appliquer la migration RLS
Exécuter `supabase/migrations/0001_rls_hardening.sql` (active RLS, révoque anon en
écriture, garde la lecture du catalogue public). **Sauvegarde DB recommandée avant.**

### PHASE 4 — Vérification
Requêtes de contrôle en bas du fichier SQL :
- 0 table `fl_*` sans RLS.
- `anon` n'a accès qu'à `v_marketplace_catalogue`.
- Parcours complet ERP + shop OK (login, lecture, écriture, commande web, realtime).

## Rollback
En cas de blocage, réappliquer temporairement le bloc historique
(`DISABLE ROW LEVEL SECURITY` + `GRANT ALL`) le temps de corriger, puis reprendre.

---
**Prochaine étape proposée :** je peux exécuter la PHASE 1 (migration des ~17 accès
directs vers l'API) écran par écran, en vérifiant le build à chaque lot, sur la
branche de travail — sans toucher à ta base Supabase tant que tu n'as pas validé
les phases 3-4.
