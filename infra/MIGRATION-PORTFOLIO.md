# Migration portfolio Vitagro — au-delà de l'ERP

Périmètre étendu suite à l'audit du compte Vercel (`vita-agro` team) : 5
projets tiers y tournent, sans rapport avec `vita-agro.com`/FreshLink-Pro,
chacun avec son propre dépôt GitHub. Ce document couvre leur migration en
plus de celle de l'ERP (voir `MIGRATION-VERCEL-SUPABASE.md`).

Accès à ces 5 dépôts pendant cette session : **lecture seule** (clonés en
public, pas attachés en écriture). Aucun code n'y a été poussé — ce document
sert de plan de référence à exécuter, sur autorisation, dans une session
dédiée à chaque dépôt.

## Inventaire

| Projet | Dépôt | Stack web | Dépendance Supabase | Hébergement web actuel | État Vercel |
|---|---|---|---|---|---|
| ERP (ce dépôt) | `Vitagro/FreshLink-Pro` | Vite/React + Express | DB + Auth + Storage (`@supabase/supabase-js` dans l'API) | **Déjà sur Hostinger** (`deploy.yml`) | Aucun (jamais branché) |
| Kitea | `Vitagro/kitea` | monorepo : `backend` (Express+Prisma), `frontend` (Vite), `web` (Next.js) | Postgres générique via Prisma (`DATABASE_URL`/`DIRECT_URL`) — pas de service Supabase Auth/Storage, JWT maison | Backend déjà prévu pour **Render.com** (`render.yaml`) | `web/` en échec de build |
| FretBack | `Vitagro/fretback` | Next.js 15 + Capacitor | `@supabase/supabase-js`, projet Supabase dédié | `*.vercel.app` uniquement | Live |
| Sant-Connect | `Vitagro/sant-connect` | Express (pas Next.js), Twilio, 2FA (`speakeasy`) | Supabase complet (`supabase/schema.sql`) | `*.vercel.app` uniquement | Live |
| Logi-IA-Supply | `Vitagro/logi-ia-supply` | Next.js + `@supabase/ssr` (auth via cookies) + Gemini | Projet Supabase dédié | `*.vercel.app` uniquement | Live |
| CargoExpress | `Vitagro/cargoexpress` | Next.js + Capacitor | Supabase complet (`supabase/schema.sql`) | `*.vercel.app` uniquement | Live |

Aucun de ces 5 projets n'a de domaine personnalisé attaché sur Vercel — ils
ne sont accessibles qu'en `*.vercel.app`. Techniquement, on peut donc migrer
chacun sans jamais toucher aux DNS de `vita-agro.com` ; il faudra en
revanche décider si/quels sous-domaines `vita-agro.com` leur donner une fois
sur Hostinger (ex. `fretback.vita-agro.com`, `cargo.vita-agro.com`...).

## ⚠️ Sant-Connect — traiter à part

Plateforme médicale (patients, ordonnances, 2FA). Avant toute migration de
données de santé hors de Supabase :
- Vérifier ce qui est réellement stocké (données patients identifiables ?)
  et sous quel cadre légal (Maroc/UE — CNDP, éventuellement RGPD si patients
  UE).
- Le chiffrement au repos et les contrôles d'accès doivent être au moins
  équivalents sur la cible avant bascule — ne pas migrer "vite" ce dépôt-là.
- Recommandation : migrer Sant-Connect **en dernier**, une fois le
  self-hosted Supabase validé sur les projets sans données sensibles
  (FretBack, Logi-IA-Supply, CargoExpress).

## Stratégie recommandée : une seule instance Supabase self-hosted pour les 4

Plutôt que 4 VPS séparés (un par projet Supabase), une seule stack
Supabase self-hosted (voir `infra/supabase-selfhosted/`, déjà préparée pour
l'ERP) peut héberger **plusieurs bases** — une par projet — sur le même
Postgres, avec des schémas ou des bases distinctes :

```sql
-- Sur l'instance Postgres self-hosted, une base par projet
CREATE DATABASE fretback;
CREATE DATABASE santeconnect;
CREATE DATABASE logiiasupply;
CREATE DATABASE cargoexpress;
-- freshlink (l'ERP) reste sur sa propre base, cf MIGRATION-VERCEL-SUPABASE.md
```

Kong (le gateway API de la stack Supabase) route par sous-domaine ou par
`apikey` JWT vers la bonne base — chaque projet garde ses propres
`ANON_KEY`/`SERVICE_ROLE_KEY` générés avec un `JWT_SECRET` distinct par
projet (isolation entre projets, pas de fuite de données croisée). Ça
multiplie la conteneurisation (une stack Docker complète par projet reste
l'option la plus simple à isoler, au prix de plus de RAM) — **à trancher
selon la charge réelle** : sur un trafic faible (ce sont des apps internes
peu utilisées à en juger par les commits), une seule stack Supabase avec
plusieurs bases suffit largement sur un VPS Hostinger KVM 2 (4 vCPU/16 Go).

## Hébergement web (Next.js/Express) de chacun

Contrairement à l'ERP (Vite SPA + API séparée), FretBack, Logi-IA-Supply et
CargoExpress sont des apps **Next.js** (SSR) — Passenger/hPanel sait faire
tourner du Next.js en mode Node standalone (`next build` + `next start`),
sur le même modèle que l'API Express de l'ERP :

```
PassengerAppType node
PassengerStartupFile server.js   # ou next start via un petit wrapper
```

Sant-Connect est du Express classique (`api/server.js`) — migration directe,
même pattern que l'API de l'ERP.

Kitea est un cas à part : son `backend` cible déjà Render.com (pas Vercel),
donc la question "sortir de Vercel" ne le concerne que pour le `web/`
(frontend Next.js) — à héberger soit sur Hostinger comme les autres, soit
laisser Render pour le backend si ce choix reste satisfaisant (Render a un
tier gratuit, pas de urgence à en sortir si ce n'est pas dans la demande
initiale).

## Priorisation proposée

1. **ERP FreshLink-Pro** (déjà en cours, cf `MIGRATION-VERCEL-SUPABASE.md`) — priorité 1, seul actif business-critique confirmé.
2. **FretBack, Logi-IA-Supply, CargoExpress** — même mécanique, à traiter ensemble une fois la stack Supabase self-hosted validée sur l'ERP.
3. **Kitea** — décision hébergement web à prendre (Hostinger vs garder Render pour le backend), pas de dépendance Supabase à retirer.
4. **Sant-Connect** — en dernier, après revue de conformité sur les données de santé.

## Prochaine étape

Pour chaque dépôt (`fretback`, `logi-ia-supply`, `cargoexpress`, `kitea`,
`sant-connect`), une session Claude Code dédiée avec accès en écriture à ce
dépôt spécifique est nécessaire pour committer les workflows de déploiement
et les changements de config — cette session-ci n'a que des droits de
lecture dessus.
