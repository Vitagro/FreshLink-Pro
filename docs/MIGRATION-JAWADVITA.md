# Runbook de migration — VitaCore26 → JawadVita (GitHub + Vercel + Supabase)

> Objectif : déplacer les deux applications vers de nouveaux dépôts GitHub, de
> nouveaux projets Vercel et un nouveau projet Supabase, **sans coupure** et
> **sans écrire par erreur dans l'ancienne base**.

| Élément            | AVANT (VitaCore26)                         | APRÈS (JawadVita)                    |
|--------------------|--------------------------------------------|--------------------------------------|
| ERP — GitHub       | `VitaCore26/FreshLink`                     | `JawadVita/FreshLink-Pro`            |
| ERP — Vercel       | projet `fresh-link`                        | nouveau projet (ex. `freshlink-pro`) |
| Shop — GitHub      | `VitaCore26/VitaFresh`                      | `JawadVita/VItaFresh`                |
| Shop — Vercel      | projet `vita-fresh`                         | nouveau projet (ex. `vitafresh`)     |
| Base de données    | Supabase `wnuilvamhygkzupvfnxz`            | **NOUVEAU** projet Supabase          |

---

## ⚠️ Ce qui est codé en dur dans le code (à traiter AVANT la bascule)

La bascule Supabase n'est pas qu'une affaire de variables Vercel : l'ancien
projet est **écrit en dur en repli** dans le code. Si une variable manque au
build, l'app repart **silencieusement** sur l'ancienne base.

Dans le dépôt ERP (FreshLink) :
- `artifacts/freshlink/src/lib/supabase/client.ts` — **URL + clé anon** de l'ancien projet en repli
- `artifacts/freshlink/src/lib/supabase/server.ts` — **URL + clé anon** en repli
- **27 fichiers** `artifacts/api-server/src/**` — URL `https://wnuilvamhygkzupvfnxz.supabase.co` en repli
- `replit.md` — documentation à mettre à jour

> Le dépôt **Shop (VitaFresh)** contient très probablement les mêmes replis codés
> en dur → même traitement à appliquer côté shop.

**Recommandation : rendre les variables OBLIGATOIRES (supprimer le repli).**
Ainsi, si une variable Supabase manque, l'app échoue franchement au lieu
d'écrire dans l'ancienne base. C'est exactement le comportement voulu pendant
une migration.

Hors périmètre (ne PAS toucher) : `BOComparatifExterne.tsx` (`GF_KEY`, `IZ_KEY`)
et `DeployGuidePanel.tsx` contiennent des clés d'**autres** projets Supabase
(sources externes de veille concurrentielle / exemples de doc), sans rapport
avec la base applicative.

---

## Ordre d'exécution (pour éviter toute coupure)

L'ancienne prod reste en ligne pendant toute la préparation. On ne coupe qu'à
l'étape 6.

### 1. Nouveau projet Supabase
1. Créer le projet sur https://supabase.com/dashboard (même région que l'actuel).
2. Noter : **Project ref**, **URL**, **clé anon** (`eyJ…`), **clé service_role**
   (`eyJ…` — la LEGACY, pas `sb_secret_…`), et le **JWT secret**.
3. Recréer le bucket Storage `freshlink-media` (public).

### 2. Migrer le schéma + les données
Toutes les tables `fl_*` sont au format JSONB `{id, payload, updated_at}` → dump/restore direct.

```bash
# Chaînes de connexion : Supabase → Settings → Database → Connection string (mode "Session").
# Dump complet (schéma + données + droits + policies RLS) de l'ancien projet :
pg_dump \
  "postgresql://postgres:[ANCIEN_MDP]@db.wnuilvamhygkzupvfnxz.supabase.co:5432/postgres" \
  --schema=public --no-owner --quote-all-identifiers \
  -f freshlink_public.sql

# Restaurer dans le NOUVEAU projet :
psql \
  "postgresql://postgres:[NOUVEAU_MDP]@db.[NOUVEAU_REF].supabase.co:5432/postgres" \
  -f freshlink_public.sql
```

- **Auth** : l'app utilise une auth maison (localStorage + HMAC) et stocke les
  utilisateurs dans la table `fl_users` (JSONB). **Aucune migration de
  `auth.users` n'est nécessaire** — les comptes suivent la donnée.
- **Storage** : les objets du bucket ne sont pas copiés par `pg_dump`. Les
  recopier via le CLI Supabase ou `rclone` (source → destination). À planifier
  si le bucket contient des fichiers (photos articles, signatures, documents…).
- **RLS** : l'état actuel est *RLS désactivé + GRANT ALL to anon*. `pg_dump`
  reporte cet état. C'est le moment idéal pour appliquer le durcissement
  `supabase/migrations/0001_rls_hardening.sql` (voir doc SECURITY-C1) — mais
  **seulement après** avoir fini la Phase 1 (migration des accès anon directs).

### 3. Nouveaux dépôts GitHub (JawadVita)

**Option A — conserver tout l'historique (miroir, recommandé) :**
```bash
# Créer d'abord les dépôts VIDES JawadVita/FreshLink-Pro et JawadVita/VItaFresh
# (sans README/licence/.gitignore) sur github.com.

git clone --mirror https://github.com/VitaCore26/FreshLink.git
cd FreshLink.git
git push --mirror https://github.com/JawadVita/FreshLink-Pro.git
cd ..

git clone --mirror https://github.com/VitaCore26/VitaFresh.git
cd VitaFresh.git
git push --mirror https://github.com/JawadVita/VItaFresh.git
```
Puis, sur chaque nouveau dépôt : régler la branche par défaut sur `main`.
L'ancien dépôt reste intact (copie, pas déplacement).

**Option B — transfert de propriété (garde issues/PR/stars) :**
GitHub → ancien repo → Settings → *Transfer ownership* vers `JawadVita`, puis
renommer en `FreshLink-Pro` / `VItaFresh`. ⚠️ L'ancien dépôt disparaît de
VitaCore26 ; les URLs redirigent automatiquement.

### 4. Préparer le code (pointer sur le nouveau Supabase)
Sur chaque dépôt :
- Supprimer les replis codés en dur (cf. section ⚠️) → variables obligatoires.
- Commit + push sur `main` du **nouveau** dépôt.

### 5. Nouveaux projets Vercel
Pour chaque app :
1. Vercel → *Add New Project* → importer le **nouveau** dépôt GitHub JawadVita.
2. Les réglages de build sont déjà dans `vercel.json` (rien à saisir).
3. Variables d'environnement (pointant vers le **NOUVEAU** Supabase) :

   **ERP (FreshLink-Pro) :**
   | Variable | Valeur |
   |---|---|
   | `SUPABASE_SERVICE_ROLE_KEY` | clé service_role **legacy `eyJ…`** du nouveau projet |
   | `DEVICE_SECRET` | idem qu'avant (garde les cookies device valides) ou nouveau |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://[NOUVEAU_REF].supabase.co` |
   | `VITE_SUPABASE_URL` | `https://[NOUVEAU_REF].supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | clé anon `eyJ…` du nouveau projet |

   **Shop (VItaFresh) :** son propre jeu de variables (mêmes clés Supabase,
   éventuellement `DEVICE_SECRET`/secrets spécifiques au shop).

   > Rappel du bug « offline » : `SUPABASE_SERVICE_ROLE_KEY` DOIT être la clé
   > **service_role legacy `eyJ…`**, jamais `sb_secret_…` (rejetée par PostgREST).
   > Vérifier aussi que les variables sont bien sur le BON projet Vercel.

4. Déployer sur une **preview** d'abord.

### 6. Vérification (preview, avant cutover)
- ERP : se connecter → le bandeau doit passer à **« ✅ Supabase connecté »**.
- Créer une écriture de test → vérifier qu'elle apparaît dans le **nouveau**
  Supabase (Table Editor) et **pas** dans l'ancien.
- Shop : parcours commande de bout en bout sur la preview.
- `pnpm run build` doit passer sur chaque dépôt.

### 7. Cutover
1. Basculer les **domaines personnalisés** des anciens projets Vercel vers les
   nouveaux (DNS). Prévoir un court gel des écritures.
2. Re-dump/restore Supabase **delta** si des données ont changé depuis l'étape 2.
3. Mettre l'ancienne prod en lecture seule / la décommissionner une fois validé.

---

## Ce que je peux faire depuis cette session (contraintes)

- ✅ Préparer le code du dépôt **ERP (FreshLink)** — étape 4 (je suis dans son
  périmètre GitHub).
- ✅ Vérifier par `pnpm run build`.
- ❌ Créer/pousser vers les dépôts `JawadVita/*` (hors périmètre GitHub de la session).
- ❌ Toucher au dépôt **Shop (VitaFresh)** (non cloné, hors périmètre).
- ❌ Créer les projets Vercel / poser les variables (dashboard + réseau bloqué par la policy).
- ❌ Créer le projet Supabase / lancer le dump-restore (dashboard + réseau bloqué).

→ Les étapes 1, 2, 3, 5, 6, 7 s'exécutent de ton côté (tes accès GitHub/Vercel/
Supabase). Je fournis les commandes et je prépare le code (étape 4).
