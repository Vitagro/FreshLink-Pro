# Brancher les sites vitrines sur l'ERP FreshLink

Les sites du groupe peuvent afficher des chiffres **live** issus de FreshLink Pro plutôt que
des valeurs figées dans le code. Le mécanisme est volontairement minimal : une requête
`GET` publique, en lecture seule, exécutée dans le navigateur du visiteur.

| Site | État | URL configurée |
|---|---|---|
| `fresh.vita-agro.com` | **actif** (sync auto au chargement) | `https://erp.vita-agro.com/api/ext/public-stats` |
| `logi.vita-agro.com` | prêt, désactivé | `ERP.url = ''` dans `index.html` |
| `trad.vita-agro.com` | prêt, désactivé | `ERP.url = ''` dans `index.html` |
| `stores.vita-agro.com` | prêt, désactivé | `ERP.url = ''` dans `index.html` |

## 1. Contrat d'API attendu

L'endpoint doit répondre en `application/json` :

```json
{
  "kpis": {
    "clients": "128",
    "orders": "3 450",
    "monthly": "52 t"
  },
  "updated_at": "2026-08-19T06:30:00Z"
}
```

- Les **clés de `kpis`** correspondent au champ `id` des KPI déclarés dans la page
  (tableau `KPIS` pour les sites filiales, `DEFAULT.kpis` pour Vita Fresh).
- Les **valeurs sont des chaînes déjà formatées** (« 52 t », « 3 450 ») : le site les affiche
  telles quelles, il ne fait aucun calcul ni arrondi.
- `updated_at` est optionnel (ISO-8601) ; il alimente la mention « chiffres synchronisés le … ».

Un identifiant absent de la réponse laisse la valeur statique en place. Sur Vita Fresh, un
KPI masqué (`vis:false`) devient visible dès que l'ERP renvoie une valeur pour son `id` —
c'est ainsi que l'on publie un indicateur sans toucher au HTML.

## 2. Côté ERP — ce que l'endpoint doit respecter

- **Lecture seule et public.** Aucune donnée nominative, aucun montant confidentiel :
  la réponse est visible par n'importe quel visiteur. Publiez des agrégats, jamais un détail
  client, une marge ou un prix d'achat.
- **Aucun secret dans l'URL.** Pas de token, pas de clé d'API : elle serait lisible dans le
  code source de la page. Si un filtrage est nécessaire, faites-le par domaine appelant.
- **CORS obligatoire.** L'appel part du navigateur, depuis un autre domaine :

  ```
  Access-Control-Allow-Origin: https://fresh.vita-agro.com
  Access-Control-Allow-Methods: GET, OPTIONS
  ```

  Ajoutez une ligne par sous-domaine autorisé (ou renvoyez l'origine appelante quand elle
  fait partie de la liste blanche). Sans cet en-tête, le navigateur bloque la réponse et le
  site retombe silencieusement sur ses valeurs statiques.
- **Cache court** côté CDN/serveur (`Cache-Control: public, max-age=300`) : les chiffres
  n'ont pas besoin d'être à la seconde, et cela protège l'ERP d'un pic de trafic.
- **Réponse rapide.** Le site abandonne au bout de 6 secondes (`erpTimeoutMs`).

## 3. Comportement côté site

1. Au chargement, la page affiche les valeurs statiques du code — donc jamais de page vide.
2. En arrière-plan, elle interroge l'ERP.
3. Si la réponse est valide, les KPI concernés sont remplacés, le badge « live » et
   l'horodatage apparaissent.
4. En cas d'échec (ERP arrêté, CORS mal configuré, timeout, JSON invalide), **rien ne change
   et aucune erreur n'est montrée au visiteur**. L'incident reste visible dans la console.
5. Les valeurs live ne sont **pas** enregistrées dans le navigateur : elles sont revérifiées
   à chaque visite, ce qui évite d'afficher un chiffre périmé.

## 4. Activer le branchement sur une autre filiale

Dans `sites/<filiale>/index.html`, renseigner l'URL :

```js
const ERP={url:'https://erp.vita-agro.com/api/ext/public-stats',timeoutMs:6000};
```

Puis vérifier que les `id` du tableau `KPIS` correspondent aux clés renvoyées par l'ERP.
Rien d'autre n'est à modifier.

## 5. Désactiver ou reprendre la main (Vita Fresh)

Vita Fresh dispose d'un panneau d'administration (bouton discret en bas à droite, protégé
par un code) qui permet de :

- modifier l'URL de l'ERP,
- activer ou couper la **synchronisation automatique au chargement** (`Auto-sync on page load`),
- déclencher une synchronisation manuelle (`Fetch from ERP`),
- éditer, afficher ou masquer chaque chiffre à la main,
- exporter / importer la configuration en JSON.

Ce panneau est une commodité d'édition côté navigateur, pas un mécanisme de sécurité :
tout ce qu'il expose est public par nature.

## 6. Vérifier que tout fonctionne

```bash
# 1. L'endpoint repond et a le bon format
curl -s https://erp.vita-agro.com/api/ext/public-stats | head -c 400

# 2. Les en-tetes CORS sont presents
curl -sI -H "Origin: https://fresh.vita-agro.com" \
     https://erp.vita-agro.com/api/ext/public-stats | grep -i access-control
```

Puis ouvrir `https://fresh.vita-agro.com` : la mention « chiffres synchronisés depuis l'ERP
FreshLink » doit apparaître sous le chapô de la section des chiffres.
