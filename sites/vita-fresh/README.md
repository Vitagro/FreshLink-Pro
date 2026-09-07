# Vita Fresh — Distribution de fruits, légumes et herbes fraîches

Site vitrine de **Vita Fresh**, filiale de distribution du groupe [Vita Agro Capital](https://vita-agro.com).

- **Domaine cible** : `fresh.vita-agro.com`
- **Contact** : vitafresh@vita-agro.com
- **Activités** : approvisionnement des particuliers, du CHR et des commerçants en fruits, légumes et herbes fraîches.

## Contenu

| Fichier | Rôle |
|---|---|
| `index.html` | Page complète — HTML, CSS et JS inline, logo en base64, aucune dépendance externe hors Google Fonts |
| `.htaccess` | Configuration Apache / Hostinger : HTTPS forcé, redirection `www`, compression, cache, en-têtes de sécurité |
| `robots.txt` | Indexation ouverte + référence du sitemap |
| `sitemap.xml` | Sitemap mono-page |

## Caractéristiques

Bilingue EN / FR (bascule dans la navigation, choix mémorisé), responsive, SEO
(Open Graph, JSON-LD `Organization` rattaché à Vita Agro Capital), animations désactivées
si `prefers-reduced-motion`.

## Chiffres live depuis l'ERP FreshLink

La page interroge au chargement l'endpoint public en lecture seule de FreshLink
(`https://erp.vita-agro.com/api/ext/public-stats`) et remplace ses chiffres statiques par les
valeurs live, avec l'horodatage de la dernière synchronisation. Si l'ERP est injoignable
(arrêt, CORS, timeout de 6 s, JSON invalide), la page conserve ses valeurs statiques sans
afficher d'erreur, et rien n'est mis en cache dans le navigateur.

Contrat d'API, en-têtes CORS attendus et procédure d'activation :
`docs/INTEGRATION-ERP-SITES.md` du dépôt `FreshLink-Pro`.

## Panneau d'administration

Un bouton discret en bas à droite, protégé par un code, permet de modifier l'URL de l'ERP,
d'activer ou couper la synchronisation automatique, de déclencher une synchronisation
manuelle, d'éditer ou masquer chaque chiffre et d'exporter / importer la configuration en
JSON. C'est une commodité d'édition côté navigateur, pas un mécanisme de sécurité : tout ce
qu'il expose est public par nature.

## Modifier le site

Tout est dans `index.html` : les textes dans l'objet `T` (`T.en` / `T.fr`, mêmes clés),
les chiffres dans `DEFAULT.kpis`, les couleurs dans les variables CSS de `:root`.
Les titres `hero_title` et `contact_title` utilisent `|` comme séparateur de ligne.

## Déploiement

Déposer le contenu du dossier à la racine du sous-domaine sur Hostinger
(hPanel → Gestionnaire de fichiers, FTP, ou déploiement Git).
Procédure détaillée : `docs/DEPLOIEMENT-HOSTINGER.md` du dépôt `FreshLink-Pro`.
