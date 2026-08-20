# Vita Logi — Prestation logistique & solutions transport

Site vitrine de **Vita Logi**, filiale logistique du groupe [Vita Agro Capital](https://vita-agro.com).

- **Domaine cible** : `logi.vita-agro.com`
- **Contact** : vitalogi@vita-agro.com
- **Activités** : transport et distribution sous température dirigée, entreposage et cross-dock, optimisation des tournées.

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
