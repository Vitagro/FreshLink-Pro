# Vita Stores — Chaîne de magasins de fruits & légumes

Site vitrine de **Vita Stores**, réseau de magasins de proximité du groupe [Vita Agro Capital](https://vita-agro.com).

- **Domaine cible** : `stores.vita-agro.com`
- **Contact** : vitastores@vita-agro.com
- **Activités** : magasins de quartier, corners et marchés couverts, comptes professionnels — approvisionnés chaque matin par Vita Fresh.

## Contenu

| Fichier | Rôle |
|---|---|
| `index.html` | Page complète — HTML, CSS et JS inline, logo en base64, aucune dépendance externe hors Google Fonts |
| `.htaccess` | Configuration Apache / Hostinger : HTTPS forcé, redirection `www`, compression, cache, en-têtes de sécurité |
| `robots.txt` | Indexation ouverte + référence du sitemap |
| `sitemap.xml` | Sitemap mono-page |

## Caractéristiques

Bilingue FR / EN (bascule dans la navigation, choix mémorisé), responsive, SEO complet
(canonical, Open Graph, JSON-LD `Organization` rattaché à Vita Agro Capital), animations
désactivées si `prefers-reduced-motion`.

## Modifier le site

Tout est dans `index.html` : les textes dans l'objet `T` (`T.fr` / `T.en`, mêmes clés),
les chiffres clés dans `KPIS`, les couleurs dans les variables CSS de `:root`.
Les titres `hero_title` et `contact_title` utilisent `|` comme séparateur de ligne.

## Déploiement

Déposer le contenu du dossier à la racine du sous-domaine sur Hostinger
(hPanel → Gestionnaire de fichiers, FTP, ou déploiement Git).
Procédure détaillée : `docs/DEPLOIEMENT-HOSTINGER.md` du dépôt `FreshLink-Pro`.
