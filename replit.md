# FreshLink Vita Fresh ERP

Fruit & vegetable distribution management system for Morocco — covers orders, delivery notes, trips, finance, and client/supplier management.

## Run & Operate

- `pnpm --filter @workspace/freshlink run dev` — run the frontend (Vite, port auto-assigned)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind v3 + Wouter (routing)
- API: Express 5 + cookie-parser + @supabase/supabase-js + bcryptjs
- DB: Supabase (PostgreSQL, accessed via REST API and service_role key)
- Auth: Custom HMAC device-fingerprint guard + localStorage user auth

## Where things live

- `artifacts/freshlink/src/` — React frontend
  - `src/App.tsx` — main router (Wouter)
  - `src/components/auth/LoginPage.tsx` — login UI
  - `src/components/backoffice/` — all BO modules
  - `src/lib/supabase/client.ts` — Supabase client (VITE_* env vars)
  - `src/lib/deviceGuard.ts` — browser-safe device guard constants
  - `src/lib/deviceGuard.edge.ts` — edge constants (no Node.js)
- `artifacts/api-server/src/` — Express API server
  - `src/routes/device/` — device check-and-token, request-access, seen
  - `src/routes/admin/` — admin session + verify
  - `src/routes/syncRead.ts` — Supabase service_role read proxy
  - `src/routes/syncWrite.ts` — Supabase service_role write proxy
  - `src/routes/ext/` — external auth + notifications
  - `src/routes/portal/` — tracking
  - `src/lib/deviceGuard.ts` — server-side HMAC signing (Node.js crypto)
  - `src/lib/extToken.ts` — JWT-like HMAC tokens

## Architecture decisions

- Vite dev server proxies `/api/*` to Express API server on port 8080
- All Supabase tables store data as JSONB `{id, payload}` rows — fetch all, filter in JS
- Device fingerprint guard uses HMAC-signed cookies — bypassed by `fl_sadmin_bypass` cookie
- Frontend uses `import.meta.env.VITE_*` env vars (never `process.env`)
- Node.js `crypto` is only used server-side (api-server); frontend uses Web Crypto API

## Product

- Login with Personnel / Équipe tab (staff) or External tab (clients/suppliers)
- Backoffice with modules: commandes, bons de livraison, trips, articles, clients, finance, caisse, etc.
- Device-based access control (fingerprint + HMAC cookies)
- 11 AI agents for business automation
- PWA-ready (manifest, icons, dark mode init script)

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Always restart the api-server workflow after code changes (it does a full esbuild compile on start)
- Frontend `deviceGuard.ts` must NOT import Node.js `crypto` — use Web Crypto API instead
- The 401 on `/api/device/seen` on first load is expected — device not yet approved/cookied
- Supabase credentials: project `bxdqkigoidwnscsjafwd.supabase.co` (hardcoded fallback in client.ts)
- Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` env vars for Supabase connectivity
- Set `SUPABASE_SERVICE_ROLE_KEY` in api-server env for service_role operations

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Migration source: `.migration-backup/` (original Next.js project)
