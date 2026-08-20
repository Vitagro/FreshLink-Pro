#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Publie chaque site de sites/ dans son propre depot GitHub (compte Vitagro).
#
# Convention de nommage existante : vita-agro-site, vita-fresh-site, vita-tech-site
#   sites/vita-fresh  -> Vitagro/vita-fresh-site
#   sites/vita-logi   -> Vitagro/vita-logi-site
#   sites/vita-trad   -> Vitagro/vita-trad-site
#   sites/vita-stores -> Vitagro/vita-stores-site
#
# Usage :
#   ./scripts/publish-site-repos.sh                  # tous les sites publies
#   ./scripts/publish-site-repos.sh vita-logi        # un seul site
#
# Prerequis : git, et soit la CLI `gh` authentifiee (creation auto du depot),
# soit les depots deja crees a la main sur github.com/new.
# ---------------------------------------------------------------------------
set -euo pipefail

OWNER="Vitagro"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="${TMPDIR:-/tmp}/vita-site-repos"

SITES=("$@")
if [ ${#SITES[@]} -eq 0 ]; then
  SITES=(vita-fresh vita-logi vita-trad vita-stores)
fi

for site in "${SITES[@]}"; do
  src="$ROOT/sites/$site"
  repo="${site}-site"
  [ -d "$src" ] || { echo "!! dossier introuvable : $src"; exit 1; }

  echo "=== $site -> $OWNER/$repo"

  # 1. Creer le depot s'il n'existe pas (necessite la CLI gh authentifiee)
  if command -v gh >/dev/null 2>&1; then
    if ! gh repo view "$OWNER/$repo" >/dev/null 2>&1; then
      gh repo create "$OWNER/$repo" --public \
        --description "$(head -1 "$src/README.md" | sed 's/^# //')"
    fi
  else
    echo "   (gh absent : le depot $OWNER/$repo doit exister au prealable)"
  fi

  # 2. Recuperer le depot existant, ou en initialiser un s'il est vide
  dst="$WORK/$repo"
  rm -rf "$dst"
  if git ls-remote --heads "https://github.com/$OWNER/$repo.git" | grep -q .; then
    git clone --depth 1 "https://github.com/$OWNER/$repo.git" "$dst"
  else
    mkdir -p "$dst"
    git -C "$dst" init -q -b main
    git -C "$dst" remote add origin "https://github.com/$OWNER/$repo.git"
  fi

  # 3. Synchroniser le contenu du site (sans toucher a .git)
  find "$dst" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
  cp -a "$src/." "$dst/"

  # 4. Commit + push sur main, en conservant l'historique distant
  if [ -z "$(git -C "$dst" status --porcelain)" ]; then
    echo "   deja a jour, rien a pousser"
    continue
  fi
  git -C "$dst" add -A
  git -C "$dst" commit -q -m "chore: mise a jour du site $site depuis FreshLink-Pro"
  git -C "$dst" push -u origin main

  echo "   OK -> https://github.com/$OWNER/$repo"
done

echo "Termine."
