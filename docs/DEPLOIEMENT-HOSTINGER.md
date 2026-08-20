# Déploiement des sites vitrines sur Hostinger

Les sites du dossier `sites/` sont **100 % statiques** : aucun build, aucune base de données,
aucun runtime Node côté serveur. Un simple dépôt de fichiers suffit.

## 1. Plan de nommage des domaines

Le site du holding (`vita-agro.com`) référence déjà les filiales sur des sous-domaines :

| Site | Sous-domaine | Dossier à publier |
|---|---|---|
| Vita Fresh | `fresh.vita-agro.com` | `sites/vita-fresh/` |
| Vita Tech | `tech.vita-agro.com` | `sites/vita-tech/` |
| Vita Logi | `logi.vita-agro.com` | `sites/vita-logi/` |
| Vita Trad | `trad.vita-agro.com` | `sites/vita-trad/` |
| Vita Stores | `stores.vita-agro.com` | `sites/vita-stores/` |

> Si vous préférez des domaines dédiés (`vita-logi.com`, `vita-trad.com`, `vita-stores.com`),
> il faut mettre à jour dans chaque `index.html` : la balise `<link rel="canonical">`,
> `og:url`, le JSON-LD (`url`), ainsi que `robots.txt` / `sitemap.xml` et les liens croisés
> du pied de page.

## 2. Créer le sous-domaine dans hPanel

1. hPanel → **Domaines → Sous-domaines**.
2. Créer le sous-domaine (`logi`, `trad`, `stores`) sur le domaine `vita-agro.com`.
3. Hostinger crée automatiquement un dossier, en général `public_html/logi/` (ou un
   `domains/logi.vita-agro.com/public_html/` selon le plan). Notez le chemin exact.

## 3. Publier les fichiers

### Option A — Gestionnaire de fichiers (le plus simple)

1. hPanel → **Fichiers → Gestionnaire de fichiers**.
2. Ouvrir le dossier du sous-domaine.
3. Y déposer **le contenu** du dossier de la filiale (`index.html`, `.htaccess`,
   `robots.txt`, `sitemap.xml`) — pas le dossier lui-même.
4. Vérifier que le gestionnaire affiche bien les fichiers cachés (`.htaccess`).

### Option B — FTP

```bash
# Identifiants FTP : hPanel → Fichiers → Comptes FTP
lftp -u <utilisateur>,<mot_de_passe> ftp://<hôte_ftp> <<'CMD'
mirror -R --delete sites/vita-logi   /public_html/logi
mirror -R --delete sites/vita-trad   /public_html/trad
mirror -R --delete sites/vita-stores /public_html/stores
CMD
```

### Option C — Déploiement Git (Hostinger Business et supérieur)

1. hPanel → **Avancé → Git**.
2. Repository : `https://github.com/Vitagro/FreshLink-Pro`, branche `main`.
3. Répertoire de destination : celui du sous-domaine.
4. Comme le dépôt contient plusieurs sites, il faut ensuite pointer la racine du
   sous-domaine sur `sites/vita-logi` (via **Domaines → Racine du document**), ou copier
   le sous-dossier après chaque `pull`.

## 4. Activer le HTTPS

hPanel → **Sécurité → SSL** → installer le certificat gratuit sur chaque sous-domaine,
puis attendre sa propagation. Le `.htaccess` fourni force ensuite la redirection
`http → https` et `www → apex`.

## 5. Vérifications après mise en ligne

- [ ] La page s'affiche en HTTPS sans avertissement de certificat.
- [ ] Le sélecteur **FR / EN** change bien tous les textes et le choix persiste au rechargement.
- [ ] Le menu burger fonctionne sur mobile (< 640 px).
- [ ] Les liens vers `vita-agro.com` et vers les autres filiales répondent.
- [ ] Le bouton e-mail ouvre bien l'adresse de la filiale.
- [ ] `https://<sous-domaine>/robots.txt` et `/sitemap.xml` sont accessibles.
- [ ] Soumettre le sitemap dans Google Search Console.

## 6. Mise à jour d'un site

Les sites étant mono-fichier, une mise à jour = remplacer `index.html`.
Modifier la source dans `sites/<filiale>/index.html`, commiter, puis redéposer le fichier.

## 7. Adresses e-mail à créer

hPanel → **E-mails → Comptes e-mail**, sur le domaine `vita-agro.com` :

- `vitalogi@vita-agro.com` → Vita Logi
- `vitatrad@vita-agro.com` → Vita Trad
- `vitastores@vita-agro.com` → Vita Stores

(en complément de `contact@vita-agro.com` et `vitafresh@vita-agro.com` déjà utilisées).
