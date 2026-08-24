# Supabase self-hosted sur VPS Hostinger

Stack officielle Supabase (Postgres + GoTrue/Auth + PostgREST + Storage +
Realtime + Kong) sur un VPS dédié, pour remplacer le projet Supabase cloud
sans réécrire le code applicatif (`@supabase/supabase-js` continue de
fonctionner, seule l'URL/les clés changent).

## 1. Provisionner le VPS

- Hostinger → VPS → KVM 1 (2 vCPU / 8 Go RAM suffisent largement pour ce
  volume de données) → OS **Ubuntu 24.04 LTS**.
- Notez l'IP publique. Ajoutez un enregistrement DNS `A` dans hPanel :
  `db.vita-agro.com → <IP du VPS>` (zone du domaine `vita-agro.com`,
  **sans toucher aux MX/SPF/DKIM existants**).

## 2. Setup de base

```bash
ssh root@<IP_VPS>

apt update && apt upgrade -y
apt install -y docker.io docker-compose-plugin ufw fail2ban nginx certbot python3-certbot-nginx

# Firewall : seulement SSH, HTTP (redirige vers HTTPS), HTTPS
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# Utilisateur non-root pour Docker (évite de tourner la stack en root)
adduser --disabled-password --gecos "" supabase
usermod -aG docker supabase
```

## 3. Déployer la stack Supabase

```bash
su - supabase
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env
```

Éditer `.env` — au minimum :

```
POSTGRES_PASSWORD=<générer avec: openssl rand -base64 32>
JWT_SECRET=<générer avec: openssl rand -base64 48>
ANON_KEY=<générer via https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys avec le JWT_SECRET ci-dessus>
SERVICE_ROLE_KEY=<idem, rôle service_role>
SITE_URL=https://erp.vita-agro.com
API_EXTERNAL_URL=https://db.vita-agro.com
SUPABASE_PUBLIC_URL=https://db.vita-agro.com
DASHBOARD_USERNAME=<un login pour l'UI Supabase Studio>
DASHBOARD_PASSWORD=<générer avec: openssl rand -base64 24>
```

```bash
docker compose pull
docker compose up -d
docker compose ps   # tous les services doivent être "healthy"
```

Kong (le reverse proxy interne de Supabase) écoute sur `127.0.0.1:8000` par
défaut dans cette stack — ne l'exposez jamais directement sur Internet,
seulement via Nginx + TLS (étape suivante). Ne mappez jamais le port 5432 de
Postgres sur `0.0.0.0` dans `docker-compose.yml` : gardez-le en
`127.0.0.1:5432:5432` ou retirez le mapping et passez par le réseau Docker
interne.

## 4. Nginx + Let's Encrypt devant Kong

```bash
exit   # retour root
cp /home/supabase/supabase/... # (voir nginx-supabase-vhost.conf de ce dossier)
```

Copiez `nginx-supabase-vhost.conf` (dans ce même dossier) vers
`/etc/nginx/sites-available/db.vita-agro.com`, adaptez si besoin, puis :

```bash
ln -s /etc/nginx/sites-available/db.vita-agro.com /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d db.vita-agro.com
```

Vérifiez : `curl -I https://db.vita-agro.com/rest/v1/` doit répondre (401
sans clé API est normal — ça prouve que PostgREST répond).

## 5. Migration des données

Voir `scripts/migrate-supabase-to-selfhosted.sh` à la racine du repo.

## 6. Migration du Storage

```bash
# Sur votre machine, avec rclone installé
rclone config
# remote "supabase-cloud" : type S3, endpoint = https://<project-ref>.supabase.co/storage/v1/s3,
#   access_key_id / secret_access_key = depuis Supabase Dashboard > Storage > S3 Access Keys
# remote "supabase-selfhosted" : type S3, endpoint = https://db.vita-agro.com/storage/v1/s3,
#   access_key_id / secret_access_key = SERVICE_ROLE_KEY côté self-hosted

rclone sync supabase-cloud:<bucket> supabase-selfhosted:<bucket> --progress --checksum
```

Répétez pour chaque bucket utilisé par `storageUsage.ts`.

## 7. Sauvegardes automatiques sur le VPS (remplace `backup-data.yml`)

```bash
crontab -e -u supabase
# Ajouter :
0 3 * * * docker exec supabase-db pg_dump -U postgres -Fc postgres > /home/supabase/backups/db-$(date +\%F).dump && find /home/supabase/backups -mtime +90 -delete
```

Pensez à créer `/home/supabase/backups` et, idéalement, à rapatrier
périodiquement ces dumps hors du VPS (rsync vers le compte hPanel existant,
qui a déjà un répertoire privé `~/backups/freshlink`).

## Pièges connus

- **Extensions Postgres** : vérifiez `\dx` sur l'instance cloud avant le
  dump (`pgcrypto`, `uuid-ossp` généralement déjà présentes dans l'image
  self-hosted, mais à confirmer).
- **RLS** : les policies définies côté cloud dépendent de `auth.uid()` —
  importez bien le schéma `auth` en plus de `public`, sinon les policies
  bloquent tout silencieusement après la bascule.
- **Séquences** : testez un insert juste après le `pg_restore` pour vérifier
  que les `SERIAL`/`IDENTITY` ne repartent pas de 1.
- **Ne jamais exposer Postgres (5432) ou Kong (8000) directement** sur
  Internet — uniquement via Nginx/TLS ou `127.0.0.1`.
