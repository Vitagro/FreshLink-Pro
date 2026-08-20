# Sites vitrines — Groupe Vita Agro Capital

Ce dossier contient les sites statiques du groupe. Chaque sous-dossier est **autonome** :
un `index.html` sans dépendance externe (hors Google Fonts), prêt à être déposé tel quel
sur un hébergement mutualisé type **Hostinger**.

| Dossier | Filiale | Objet | Domaine cible |
|---|---|---|---|
| `vita-agro/` | Vita Agro Capital | Holding — site institutionnel / investisseurs | `vita-agro.com` |
| `vita-fresh/` | Vita Fresh | Distribution B2B de produits frais | `fresh.vita-agro.com` |
| `vita-tech/` | Vita Tech | Édition logicielle (ERP FreshLink) | `tech.vita-agro.com` |
| `vita-logi/` | Vita Logi | Prestation logistique & solutions transport | `logi.vita-agro.com` |
| `vita-trad/` | Vita Trad | Import / export de fruits, légumes et herbes | `trad.vita-agro.com` |
| `vita-stores/` | Vita Stores | Chaîne de magasins de proximité | `stores.vita-agro.com` |

## Contenu d'un site

```
sites/<filiale>/
├── index.html     # page complète (HTML + CSS + JS inline, logo en base64)
├── .htaccess      # HTTPS forcé, redirection www, compression, cache, en-têtes de sécurité
├── robots.txt
└── sitemap.xml
```

## Structure d'une page filiale

Les sites `vita-logi`, `vita-trad` et `vita-stores` partagent la même trame, pensée pour un
lecteur investisseur autant que pour un client :

1. **Bandeau groupe** — rattachement au holding et accès direct aux cinq filiales.
2. **Hero** — positionnement, promesse, accès à l'espace investisseurs.
3. **Chiffres clés** — engagements de service (branchables sur l'ERP, voir plus bas).
4. **Activités** — trois métiers détaillés.
5. **Méthode / processus** — quatre étapes documentées.
6. **Marché & catalyseurs** — fragmentation actuelle, Had Soualem 2028, Coupe du Monde 2030.
7. **Thèse d'investissement** — intégration verticale, ERP propriétaire, base rentable, catalyseurs datés.
8. **Feuille de route** — quatre jalons avec statut.
9. **Espace investisseurs** — deux tours de financement du holding, emplois des fonds, demande de dossier.
10. **Le groupe** — les cinq filiales, avec lien vers chaque site.
11. **Contact** et pied de page complet.

## Chiffres live depuis l'ERP FreshLink

Chaque page embarque un connecteur ERP en lecture seule. Il est **actif sur Vita Fresh**
(`https://erp.vita-agro.com/api/ext/public-stats`) et **prêt mais désactivé** sur les autres
sites — il suffit d'y renseigner `ERP.url`. En cas d'ERP injoignable, la page conserve ses
valeurs statiques sans afficher d'erreur.

Contrat d'API, exigences CORS et procédure d'activation :
[`docs/INTEGRATION-ERP-SITES.md`](../docs/INTEGRATION-ERP-SITES.md).

## Caractéristiques communes

- **Bilingue FR / EN** — bascule dans la barre de navigation, choix mémorisé dans le navigateur (`localStorage`). Le français est la langue par défaut des sites filiales.
- **Responsive** — desktop, tablette, mobile (menu burger sous 640 px).
- **Identité de groupe** — même typographie (Fraunces / Inter Tight / IBM Plex Mono), même structure,
  palette propre à chaque filiale.
- **Rattachement au holding** — lien vers `vita-agro.com` dans la navigation, la section contact et le pied de page,
  plus les liens croisés vers les cinq filiales.
- **SEO** — `<title>`, meta description, Open Graph, `canonical` et données structurées
  `schema.org/Organization` avec `parentOrganization: Vita Agro Capital`.
- **Accessibilité / performance** — aucune dépendance JS externe, animations désactivées si
  `prefers-reduced-motion`.

## Modifier un site

Tout est dans `index.html` :

- **Textes** : objet `T` en bas de fichier (`T.fr` et `T.en`, mêmes clés des deux côtés).
  Les titres `hero_title` et `contact_title` utilisent `|` comme séparateur de ligne
  (la ligne du milieu est mise en valeur en italique doré).
- **Chiffres clés** : tableau `KPIS`.
- **Couleurs** : variables CSS dans `:root` (`--ink`, `--brand`, `--accent`, `--paper`…).
- **Contact** : l'adresse e-mail apparaît dans le bloc `.contact-actions` et dans le JSON-LD.

## Dépôts GitHub dédiés

Chaque site peut vivre dans son propre dépôt, selon la convention déjà en place sur le compte
[Vitagro](https://github.com/Vitagro) :

| Dossier source | Dépôt GitHub |
|---|---|
| `sites/vita-agro/` | [`Vitagro/vita-agro-site`](https://github.com/Vitagro/vita-agro-site) |
| `sites/vita-fresh/` | [`Vitagro/vita-fresh-site`](https://github.com/Vitagro/vita-fresh-site) |
| `sites/vita-tech/` | [`Vitagro/vita-tech-site`](https://github.com/Vitagro/vita-tech-site) |
| `sites/vita-logi/` | [`Vitagro/vita-logi-site`](https://github.com/Vitagro/vita-logi-site) |
| `sites/vita-trad/` | [`Vitagro/vita-trad-site`](https://github.com/Vitagro/vita-trad-site) |
| `sites/vita-stores/` | [`Vitagro/vita-stores-site`](https://github.com/Vitagro/vita-stores-site) |

Le script [`scripts/publish-site-repos.sh`](../scripts/publish-site-repos.sh) crée le dépôt
(si la CLI `gh` est authentifiée) puis y pousse le contenu du dossier :

```bash
./scripts/publish-site-repos.sh                 # tous les sites publies
./scripts/publish-site-repos.sh vita-logi       # un seul site
```

## Déploiement

Voir [`docs/DEPLOIEMENT-HOSTINGER.md`](../docs/DEPLOIEMENT-HOSTINGER.md).
