#!/usr/bin/env bash
# Dump la base Supabase cloud (schémas public, auth, storage) et la restaure
# vers une instance Postgres/Supabase self-hosted cible.
#
# Usage:
#   SOURCE_URL="postgresql://postgres:PASS@db.PROJECT_REF.supabase.co:5432/postgres" \
#   TARGET_URL="postgresql://postgres:PASS@db.vita-agro.com:5432/postgres" \
#   ./scripts/migrate-supabase-to-selfhosted.sh
#
# Requiert pg_dump/pg_restore (client Postgres 15+) installés localement.
# Ne touche jamais la base source (dump en lecture seule) ; la cible est
# écrasée schéma par schéma (--clean --if-exists) donc à ne lancer que sur
# une instance self-hosted encore vide ou en cours de resync délibérée.

set -euo pipefail

: "${SOURCE_URL:?SOURCE_URL manquant (connection string Supabase cloud, mode Session)}"
: "${TARGET_URL:?TARGET_URL manquant (connection string de l'instance self-hosted)}"

DUMP_FILE="freshlink-migration-$(date +%Y%m%d-%H%M%S).dump"

echo "==> Dump depuis Supabase cloud vers ${DUMP_FILE}"
pg_dump "${SOURCE_URL}" \
  --format=custom \
  --no-owner --no-acl \
  --schema=public --schema=auth --schema=storage \
  --file="${DUMP_FILE}"

echo "==> Dump terminé ($(du -h "${DUMP_FILE}" | cut -f1))"
echo "==> Restauration vers l'instance cible"
echo "    (des erreurs 'already exists' sur des rôles/extensions systèmes sont normales)"

pg_restore "${TARGET_URL}" \
  --no-owner --no-acl \
  --clean --if-exists \
  --verbose \
  "${DUMP_FILE}" || true

echo "==> Vérification rapide"
psql "${TARGET_URL}" -c "select schemaname, count(*) from pg_tables where schemaname in ('public','auth','storage') group by schemaname;"
psql "${TARGET_URL}" -c "select count(*) as rls_policies from pg_policies;"

echo ""
echo "Vérifiez manuellement :"
echo "  - le nombre de lignes par table clé (fl_clients, fl_commandes...) correspond à la source"
echo "  - un insert de test ne repart pas de la séquence 1 (SERIAL/IDENTITY)"
echo "  - le dump ${DUMP_FILE} : à conserver hors serveur puis supprimer une fois validé"
