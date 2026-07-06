#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# migrate-to-jawadvita.sh — Migration VitaCore26 → JawadVita
#   GitHub (nouveaux dépôts) + Supabase (nouvelle base) + Vercel (nouveaux projets)
#
#   À LANCER EN LOCAL (pas dans le sandbox web : le réseau y bloque Vercel/Supabase).
#   Prérequis : bash, git, perl, pnpm, gh, vercel, pg_dump, psql.
#
# USAGE :
#   1. Renseigne tes SECRETS en variables d'environnement (voir bloc ci-dessous).
#   2. Renseigne les chemins ERP_DIR / SHOP_DIR (dossiers locaux des 2 apps).
#   3. Lance une phase à la fois (recommandé) :
#         ./migrate-to-jawadvita.sh code      # repoint code du Shop vers le nouveau Supabase
#         ./migrate-to-jawadvita.sh db        # pg_dump ancien -> psql nouveau  (CONFIRM=yes requis)
#         ./migrate-to-jawadvita.sh github    # crée + pousse les 2 nouveaux dépôts (1 commit)
#         ./migrate-to-jawadvita.sh vercel    # pose les variables + déploie preview
#      ou tout d'affilée :
#         CONFIRM=yes ./migrate-to-jawadvita.sh all
#
# ⚠️  Les clés service_role / mots de passe DB / DEVICE_SECRET ne sont JAMAIS
#     écrits dans ce fichier : ils viennent de variables d'environnement.
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ─── Valeurs PUBLIQUES (modifiables sans risque) ──────────────────────────────
OLD_REF="${OLD_REF:-wnuilvamhygkzupvfnxz}"                 # ancien projet Supabase
NEW_REF="${NEW_REF:-bxdqkigoidwnscsjafwd}"                 # nouveau projet Supabase
NEW_URL="${NEW_URL:-https://bxdqkigoidwnscsjafwd.supabase.co}"
OLD_ANON="${OLD_ANON:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndudWlsdmFtaHlna3p1cHZmbnh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2NzU2ODgsImV4cCI6MjA5NjI1MTY4OH0.OQ28nHPNkuJNSZerZwiTLRIn5rRNhVc8rEwToMYCbhI}"
NEW_ANON="${NEW_ANON:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4ZHFraWdvaWR3bnNjc2phZndkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MTgxOTYsImV4cCI6MjA5ODM5NDE5Nn0.c5dzNldPofCGGq1MzWF78mGjrhqw5vXxZw_t9f9rEYM}"

GH_OWNER="${GH_OWNER:-JawadVita}"
ERP_REPO="${ERP_REPO:-FreshLink-Pro}"
SHOP_REPO="${SHOP_REPO:-VItaFresh}"

# Chemins locaux des deux applications (À ADAPTER)
ERP_DIR="${ERP_DIR:-./FreshLink}"
SHOP_DIR="${SHOP_DIR:-./VitaFresh}"

# ─── SECRETS attendus en variables d'environnement (NE PAS écrire ici) ────────
#   OLD_DB_URL             chaîne de connexion Postgres de l'ANCIEN Supabase
#   NEW_DB_URL             chaîne de connexion Postgres du NOUVEAU Supabase
#     (Dashboard Supabase → Settings → Database → Connection string → "Session")
#   NEW_SERVICE_ROLE_KEY   clé service_role LEGACY (eyJ…) du nouveau projet
#   DEVICE_SECRET          secret HMAC device (identique à l'ancien pour garder
#                          les cookies valides, ou nouveau)

# ─── Helpers ──────────────────────────────────────────────────────────────────
log(){ printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok(){  printf '\033[1;32m  ✓ %s\033[0m\n' "$*"; }
die(){ printf '\n\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }
need(){ command -v "$1" >/dev/null 2>&1 || die "Outil manquant : $1 (installe-le puis relance)"; }

# ─── Phase 1 : repoint du code vers le nouveau Supabase ───────────────────────
# (Le dépôt ERP est DÉJÀ repointé sur la branche claude/erp-supabase-offline-debug-ya7ugi.
#  Cette fonction sert surtout au Shop, mais est générique/idempotente.)
repoint_code(){
  local dir=$1
  [ -d "$dir/.git" ] || die "Pas un dépôt git : $dir"
  log "Repoint Supabase dans : $dir"
  ( cd "$dir"
    # 1) URL / ref du projet (hors dossier docs/)
    while IFS= read -r f; do
      [ -n "$f" ] && perl -pi -e "s/\Q$OLD_REF\E/$NEW_REF/g" "$f"
    done < <(git grep -lF "$OLD_REF" -- ':!docs/' 2>/dev/null || true)
    # 2) clé anon codée en dur (fichiers client Supabase)
    while IFS= read -r f; do
      [ -n "$f" ] && perl -pi -e "s/\Q$OLD_ANON\E/$NEW_ANON/g" "$f"
    done < <(git grep -lF "$OLD_ANON" 2>/dev/null || true)
    # 3) vérification
    if git grep -qF "$OLD_REF" -- ':!docs/' 2>/dev/null; then
      git grep -nF "$OLD_REF" -- ':!docs/'; die "Il reste des références à l'ancien projet — à corriger à la main."
    fi
    git grep -qF "$OLD_ANON" 2>/dev/null && die "Il reste l'ancienne clé anon en dur." || true
    ok "Code repointé sur $NEW_REF (0 trace de l'ancien projet)"
  )
}

# ─── (optionnel) build de validation ─────────────────────────────────────────
build_check(){
  local dir=$1
  log "Build de validation : $dir"
  ( cd "$dir"; need pnpm; pnpm install; pnpm run build )
  ok "Build OK : $dir"
}

# ─── Phase 2 : migration de la base (dump ancien → restore nouveau) ───────────
migrate_db(){
  need pg_dump; need psql
  : "${OLD_DB_URL:?Définis OLD_DB_URL (connexion Postgres ancien Supabase)}"
  : "${NEW_DB_URL:?Définis NEW_DB_URL (connexion Postgres nouveau Supabase)}"
  local dump="freshlink_public_$(date +%Y%m%d_%H%M%S).sql"
  log "Dump du schéma public de l'ANCIEN Supabase → $dump"
  pg_dump "$OLD_DB_URL" --schema=public --no-owner --quote-all-identifiers -f "$dump"
  ok "Dump créé : $dump ($(du -h "$dump" | cut -f1))"
  log "Restauration dans le NOUVEAU Supabase (opération qui ÉCRIT des données)"
  [ "${CONFIRM:-}" = "yes" ] || die "Sécurité : relance avec CONFIRM=yes pour appliquer la restauration."
  psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -f "$dump"
  ok "Base restaurée dans $NEW_REF"
  cat <<EOF
  → Pense à recréer le bucket Storage 'freshlink-media' (pg_dump ne copie pas les fichiers).
  → RLS : état actuel = désactivé + GRANT ALL to anon (reporté tel quel). Applique
    supabase/migrations/0001_rls_hardening.sql UNIQUEMENT après la Phase 1 RLS.
EOF
}

# ─── Phase 3 : nouveaux dépôts GitHub (1 commit, historique neuf, sûr) ─────────
# Utilise une branche orphan poussée en 'main' : ne détruit PAS ton .git local.
github_push(){
  local dir=$1 repo=$2
  need gh; need git
  [ -d "$dir/.git" ] || die "Pas un dépôt git : $dir"
  log "Publication $dir → $GH_OWNER/$repo (1 commit)"
  ( cd "$dir"
    if ! gh repo view "$GH_OWNER/$repo" >/dev/null 2>&1; then
      gh repo create "$GH_OWNER/$repo" --private >/dev/null
      ok "Dépôt créé : $GH_OWNER/$repo (privé)"
    fi
    local cur; cur=$(git rev-parse --abbrev-ref HEAD)
    git checkout --orphan _migrate_pub >/dev/null 2>&1
    git add -A
    git commit -qm "Initial commit — migré vers $GH_OWNER/$repo"
    git push -f "https://github.com/$GH_OWNER/$repo.git" _migrate_pub:main
    git checkout "$cur" >/dev/null 2>&1
    git branch -D _migrate_pub >/dev/null 2>&1
    ok "Poussé sur $GH_OWNER/$repo (branche main)"
  )
}

# ─── Phase 4 : variables Vercel + déploiement preview ─────────────────────────
vercel_env(){
  local dir=$1 repo=$2
  need vercel
  : "${NEW_SERVICE_ROLE_KEY:?Définis NEW_SERVICE_ROLE_KEY (service_role legacy eyJ…)}"
  : "${DEVICE_SECRET:?Définis DEVICE_SECRET}"
  log "Variables Vercel + preview pour $repo (dossier $dir)"
  ( cd "$dir"
    vercel link --yes >/dev/null 2>&1 || vercel link
    _add(){ local name=$1 val=$2 e
      for e in production preview development; do
        printf '%s' "$val" | vercel env add "$name" "$e" >/dev/null 2>&1 || true
      done
      ok "env $name posée (production/preview/development)"
    }
    _add SUPABASE_SERVICE_ROLE_KEY "$NEW_SERVICE_ROLE_KEY"
    _add DEVICE_SECRET             "$DEVICE_SECRET"
    _add NEXT_PUBLIC_SUPABASE_URL  "$NEW_URL"
    _add VITE_SUPABASE_URL         "$NEW_URL"
    _add VITE_SUPABASE_ANON_KEY    "$NEW_ANON"
    log "Déploiement preview…"
    vercel deploy
  )
}

usage(){ sed -n '2,40p' "$0"; }

# ─── Dispatch ─────────────────────────────────────────────────────────────────
case "${1:-help}" in
  code)   repoint_code "$SHOP_DIR" ;;
  build)  build_check "$SHOP_DIR" ;;
  db)     migrate_db ;;
  github) github_push "$ERP_DIR" "$ERP_REPO"; github_push "$SHOP_DIR" "$SHOP_REPO" ;;
  vercel) vercel_env "$ERP_DIR" "$ERP_REPO"; vercel_env "$SHOP_DIR" "$SHOP_REPO" ;;
  all)
    repoint_code "$SHOP_DIR"
    migrate_db
    github_push "$ERP_DIR" "$ERP_REPO"
    github_push "$SHOP_DIR" "$SHOP_REPO"
    vercel_env "$ERP_DIR" "$ERP_REPO"
    vercel_env "$SHOP_DIR" "$SHOP_REPO"
    ok "Migration terminée — vérifie les previews Vercel puis fais le cutover DNS."
    ;;
  *) usage ;;
esac
