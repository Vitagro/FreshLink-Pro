# Module « Coût Prévendeur & Coût par Trajet »

Spécification fonctionnelle et technique — FreshLink Pro
Version 1.0

---

## 0. Point de départ : ce qui existe déjà dans FreshLink

Avant de spécifier du neuf, il faut cadrer ce qui est déjà en place, pour ne pas
construire un module parallèle qui diverge du reste de l'ERP.

| Brique | État actuel | Verdict |
|---|---|---|
| Notion de journée opérationnelle | `store.getCommandeCutoffConfig()` → `{ heureDebut: "14:00", heureFin: "04:00" }`, `store.commandeOperationalDate()`, `store.commandeCycleBounds(date)` | **Existe, mais réservée aux commandes.** À généraliser. |
| Trajets | `Trip` (`id`, `date`, `livreurId/Nom`, `commandeIds`, `heureDepart`, `vehicule`…) | Existe, mais orienté **livraison**, pas **prévente**. |
| Visites prévente | `Visite` (`prevendeurId`, `clientId`, `date`, `resultat`) | Existe → source des KPI de la part variable. |
| Primes / incentives | `BOPerformanceIncentives`, `fl_primes_nouveaux_clients` | Existe → à **relier**, pas à dupliquer. |
| Coût de livraison | `BOCoutLivraison` | Existe côté **aval** (livraison). Le présent module couvre l'**amont** (prévente). |

> **Principe directeur n°1** — La journée opérationnelle devient un concept
> transverse du noyau (`lib/businessDay.ts`), et `commandeCycleBounds` devient
> un simple appelant de ce noyau. On ne veut pas deux définitions du « jour J »
> qui divergent, comme cela s'est déjà produit dans ce code (deux copies du
> cutoff codées en dur à 14h, déconnectées de la config).

---

## 1. Journée Opérationnelle (Business Day)

### 1.1 Définition

Une **journée opérationnelle** `D` est un intervalle semi-ouvert `[début, fin)`
d'horodatages réels, associé à une **date comptable** `D` (format `YYYY-MM-DD`).

```
D = 2026-08-05,  heureDebut = 14:00 (J-1),  heureFin = 04:00 (J)
  → [ 2026-08-04 14:00:00 , 2026-08-05 04:00:00 )
```

Toute commande, dépense, visite ou tournée dont l'horodatage tombe dans cet
intervalle est **imputée à la date comptable `2026-08-05`**, quelle que soit sa
date calendaire.

### 1.2 Pourquoi semi-ouvert `[début, fin)`

Une borne fermée des deux côtés fait qu'un enregistrement pile à `04:00`
appartient à la fois à la journée `D` et à la journée `D+1` — il serait compté
**deux fois** dans le CA et **deux fois** dans les coûts. Le semi-ouvert garantit
une **partition stricte** de l'axe du temps : chaque instant appartient à
exactement une journée opérationnelle, ou à aucune (cf. § 1.4).

### 1.3 Profils multiples

Un seul cut-off global ne suffit pas : la prévente tourne la nuit (J-1 14:00 →
J 04:00) mais la livraison tourne le matin (J 04:00 → J 14:00). Le paramétrage
est donc **par profil**, chaque profil étant rattaché à un ou plusieurs types
d'enregistrement.

| Profil | Début | Fin | Entités rattachées |
|---|---|---|---|
| `PREVENTE` | J-1 14:00 | J 04:00 | `commande`, `visite`, `trajet_prevente`, `depense_prevente` |
| `LIVRAISON` | J 04:00 | J 14:00 | `trip`, `bon_livraison`, `retour` |
| `ACHAT` | J-1 22:00 | J 10:00 | `bon_achat`, `reception` |
| `DEFAUT` | J 00:00 | J+1 00:00 | tout le reste (= date calendaire) |

### 1.4 Le trou de couverture (point critique souvent oublié)

Avec `PREVENTE` = J-1 14:00 → J 04:00, la plage **04:00 → 14:00 n'appartient à
aucune journée opérationnelle de prévente**. Une commande saisie à 09:00 ne
serait rattachée à rien et **disparaîtrait de tous les rapports**.

Trois politiques possibles, à choisir explicitement dans la configuration
(champ `politiqueHorsPlage`) — jamais implicitement :

| Politique | Comportement | Recommandation |
|---|---|---|
| `RATTACHER_SUIVANT` | Un enregistrement hors plage est imputé à la prochaine journée qui s'ouvre. 09:00 → journée `J+1`. | **Recommandé par défaut.** Aucune perte, sémantique intuitive (« c'est déjà pour demain »). |
| `RATTACHER_PRECEDENT` | Imputé à la journée qui vient de se fermer. 09:00 → journée `J`. | À réserver aux profils où la saisie tardive est une régularisation. |
| `REJETER` | Saisie bloquée hors plage, message explicite à l'utilisateur. | Uniquement si le métier l'exige vraiment ; sinon source de blocages terrain. |

> **Principe directeur n°2** — Aucune politique ne doit pouvoir faire
> *disparaître* silencieusement un enregistrement. C'est exactement la classe de
> bug qui a déjà coûté cher ici (commandes invisibles parce que hors du filtre).
> Le rapport de contrôle du § 4.3 existe pour rendre ce risque visible.

### 1.5 Fuseau horaire et heure légale

Tous les calculs se font en **heure locale de l'entreprise** (`Africa/Casablanca`),
jamais en UTC. `new Date().toISOString().slice(0,10)` donne la date **UTC** et
décale d'un jour selon l'heure — bug déjà corrigé à plusieurs reprises dans ce
code (rounds 17 à 20). La règle est donc :

* stockage : horodatage ISO complet avec offset (`2026-08-04T14:00:00+01:00`) ;
* calcul de la date opérationnelle : **toujours** via les helpers locaux ;
* changement d'heure légale : une journée peut durer 23 h ou 25 h. Le calcul
  s'appuie sur les bornes construites en heure locale, jamais sur `+24h` en
  millisecondes.

---

## 2. Modèle de données

### 2.1 Paramètres horaires

```sql
CREATE TABLE business_day_profile (
  id                   TEXT PRIMARY KEY,          -- 'PREVENTE'
  libelle              TEXT NOT NULL,
  heure_debut          TIME NOT NULL,             -- '14:00'
  debut_jour_offset    SMALLINT NOT NULL DEFAULT -1,  -- -1 = la veille (J-1)
  heure_fin            TIME NOT NULL,             -- '04:00'
  fin_jour_offset      SMALLINT NOT NULL DEFAULT 0,   --  0 = le jour J
  politique_hors_plage TEXT NOT NULL DEFAULT 'RATTACHER_SUIVANT'
                       CHECK (politique_hors_plage IN
                              ('RATTACHER_SUIVANT','RATTACHER_PRECEDENT','REJETER')),
  fuseau               TEXT NOT NULL DEFAULT 'Africa/Casablanca',
  actif                BOOLEAN NOT NULL DEFAULT TRUE,
  valide_a_partir_de   DATE NOT NULL,             -- versionnement (cf. §2.7)
  cree_le              TIMESTAMPTZ NOT NULL DEFAULT now(),
  cree_par             TEXT NOT NULL
);

CREATE TABLE business_day_mapping (
  profile_id   TEXT NOT NULL REFERENCES business_day_profile(id),
  type_entite  TEXT NOT NULL,   -- 'commande' | 'visite' | 'trajet_prevente' | ...
  PRIMARY KEY (type_entite)     -- une entité → un seul profil, sans ambiguïté
);
```

> La clé primaire sur `type_entite` seul est **volontaire** : elle rend
> structurellement impossible qu'une même entité soit rattachée à deux profils,
> ce qui produirait un double comptage indétectable en lecture.

### 2.2 Prévendeur

```sql
CREATE TABLE prevendeur (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT REFERENCES fl_users(id),   -- compte ERP si interne
  nom                TEXT NOT NULL,
  type_contrat       TEXT NOT NULL
                     CHECK (type_contrat IN ('SALARIE','FREELANCE','PRESTATAIRE')),
  date_entree        DATE NOT NULL,
  date_sortie        DATE,
  secteur_defaut     TEXT,
  grille_salariale_id TEXT REFERENCES grille_salariale(id),
  regle_freelance_id  TEXT REFERENCES regle_freelance(id),
  vehicule_id        TEXT REFERENCES vehicule(id),
  actif              BOOLEAN NOT NULL DEFAULT TRUE
);
```

Contrainte métier (à valider applicativement) : un `SALARIE` doit avoir une
`grille_salariale_id` ; un `FREELANCE`/`PRESTATAIRE` doit avoir une
`regle_freelance_id`. Un prévendeur **peut** avoir les deux (salarié avec part
variable) — le moteur additionne alors les deux blocs.

### 2.3 Grille salariale (coûts fixes)

```sql
CREATE TABLE grille_salariale (
  id                     TEXT PRIMARY KEY,
  libelle                TEXT NOT NULL,
  salaire_brut_mensuel   NUMERIC(12,2) NOT NULL,
  taux_charges_patronales NUMERIC(5,4) NOT NULL DEFAULT 0.2000,  -- 20 %
  prime_panier_jour      NUMERIC(10,2) NOT NULL DEFAULT 0,
  forfait_telecom_mois   NUMERIC(10,2) NOT NULL DEFAULT 0,
  amortissement_materiel_mois NUMERIC(10,2) NOT NULL DEFAULT 0,  -- PDA, smartphone
  jours_travailles_mois  NUMERIC(5,2) NOT NULL DEFAULT 26,
  heures_par_jour        NUMERIC(5,2) NOT NULL DEFAULT 8,
  base_repartition       TEXT NOT NULL DEFAULT 'DUREE'
                         CHECK (base_repartition IN ('DUREE','FREQUENCE','FORFAIT_JOUR')),
  valide_du              DATE NOT NULL,
  valide_au              DATE
);
```

### 2.4 Véhicule (coûts de transport)

```sql
CREATE TABLE vehicule (
  id                    TEXT PRIMARY KEY,
  immatriculation       TEXT NOT NULL,
  mode_detention        TEXT NOT NULL CHECK (mode_detention IN ('PROPRIETE','LOCATION','PERSONNEL')),
  cout_acquisition      NUMERIC(12,2),        -- si PROPRIETE
  duree_amortissement_mois SMALLINT,          -- si PROPRIETE
  loyer_mensuel         NUMERIC(10,2),        -- si LOCATION
  indemnite_km          NUMERIC(8,4),         -- si PERSONNEL (barème km)
  conso_l_100km         NUMERIC(6,2) NOT NULL DEFAULT 8,
  prix_carburant_litre  NUMERIC(8,4) NOT NULL,
  assurance_mois        NUMERIC(10,2) NOT NULL DEFAULT 0,
  entretien_mois        NUMERIC(10,2) NOT NULL DEFAULT 0,
  km_moyens_mois        NUMERIC(10,2) NOT NULL DEFAULT 2000,  -- dénominateur ventilation
  actif                 BOOLEAN NOT NULL DEFAULT TRUE
);
```

> `prix_carburant_litre` est **daté** en pratique (le gasoil bouge). En v1 on
> garde la valeur courante sur le véhicule, mais le coût calculé est **figé sur
> le trajet** à la clôture (§ 3.5) : un changement de prix ne réécrit jamais
> l'historique.

### 2.5 Règle de rémunération freelance

Deux tables : l'en-tête (part fixe) et les paliers (part variable).

```sql
CREATE TABLE regle_freelance (
  id                TEXT PRIMARY KEY,
  libelle           TEXT NOT NULL,
  forfait_par_tournee NUMERIC(10,2) NOT NULL DEFAULT 0,
  forfait_par_jour    NUMERIC(10,2) NOT NULL DEFAULT 0,
  mode_cumul_paliers  TEXT NOT NULL DEFAULT 'PROGRESSIF'
                      CHECK (mode_cumul_paliers IN ('PROGRESSIF','ATTEINT')),
  plafond_variable    NUMERIC(12,2),        -- NULL = pas de plafond
  plancher_garanti    NUMERIC(12,2) NOT NULL DEFAULT 0,
  valide_du         DATE NOT NULL,
  valide_au         DATE
);

CREATE TABLE regle_freelance_palier (
  id            TEXT PRIMARY KEY,
  regle_id      TEXT NOT NULL REFERENCES regle_freelance(id) ON DELETE CASCADE,
  assiette      TEXT NOT NULL CHECK (assiette IN
                ('CA','TONNAGE','NB_CLIENTS_VISITES','NB_COMMANDES','TAUX_CONVERSION','NB_NOUVEAUX_CLIENTS')),
  seuil_min     NUMERIC(14,4) NOT NULL DEFAULT 0,
  seuil_max     NUMERIC(14,4),              -- NULL = infini
  type_calcul   TEXT NOT NULL CHECK (type_calcul IN ('POURCENTAGE','MONTANT_UNITAIRE','FORFAIT')),
  valeur        NUMERIC(12,4) NOT NULL,
  UNIQUE (regle_id, assiette, seuil_min)
);
```

**`mode_cumul_paliers`** — distinction structurante, source classique d'erreurs :

* `PROGRESSIF` (barème par tranches, comme l'IR) : 2 % sur la part de CA entre
  0 et 10 000, puis 3 % sur la part au-delà. Pas d'effet de seuil.
* `ATTEINT` (le palier atteint s'applique à **tout** l'assiette) : à 10 001 DH,
  3 % s'appliquent sur la totalité. Crée un saut de rémunération — accepté
  seulement si c'est un choix commercial assumé.

### 2.6 Trajet / tournée de prévente

```sql
CREATE TABLE trajet_prevente (
  id                  TEXT PRIMARY KEY,
  numero              TEXT NOT NULL UNIQUE,
  prevendeur_id       TEXT NOT NULL REFERENCES prevendeur(id),
  vehicule_id         TEXT REFERENCES vehicule(id),
  secteur             TEXT,
  date_operationnelle DATE NOT NULL,        -- imputation comptable (§1)
  debut_reel          TIMESTAMPTZ NOT NULL, -- horodatage brut
  fin_reelle          TIMESTAMPTZ,
  km_debut            NUMERIC(10,2),
  km_fin              NUMERIC(10,2),
  statut              TEXT NOT NULL DEFAULT 'EN_COURS'
                      CHECK (statut IN ('PLANIFIE','EN_COURS','CLOTURE','ANNULE')),
  motif_annulation    TEXT,
  -- Snapshot figé à la clôture (cf. §3.5) — jamais recalculé après coup
  cout_fixe_salarial  NUMERIC(12,2),
  cout_transport      NUMERIC(12,2),
  cout_charges        NUMERIC(12,2),
  cout_freelance_fixe NUMERIC(12,2),
  cout_freelance_var  NUMERIC(12,2),
  cout_total          NUMERIC(12,2),
  ca_genere           NUMERIC(12,2),
  nb_clients_visites  INTEGER,
  nb_commandes        INTEGER,
  tonnage             NUMERIC(12,3),
  cloture_le          TIMESTAMPTZ,
  cloture_par         TEXT,
  parametres_snapshot JSONB               -- copie des taux/grilles utilisés
);

CREATE INDEX idx_trajet_prev_date ON trajet_prevente(date_operationnelle, prevendeur_id);
```

> `parametres_snapshot` est ce qui rend le calcul **auditable** : un an plus tard,
> on peut rejouer exactement le calcul d'un trajet même si la grille salariale, le
> prix du carburant et la règle freelance ont tous changé depuis.

### 2.7 Versionnement des paramètres

Toutes les tables de paramètres portent `valide_du` / `valide_au`. La règle de
résolution est : **on applique la version en vigueur à la
`date_operationnelle` du trajet**, jamais la version courante. Sans cela, une
augmentation de salaire en mars réécrit rétroactivement le coût de janvier et
fausse toute comparaison historique.

---

## 3. Formules et algorithme

### 3.1 Formule générale

$$
\text{Co\hat{u}t}_{\text{trajet}} = C_{\text{fixe}} + C_{\text{transport}} + C_{\text{charges}} + C_{\text{freelance}}
$$

avec

$$
C_{\text{freelance}} = \max\Bigl(\text{plancher},\; F_{\text{fixe}} + \min(V_{\text{variable}},\, \text{plafond})\Bigr)
$$

### 3.2 Coûts fixes salariaux — $C_{\text{fixe}}$

Le coût mensuel chargé est ramené au trajet selon `base_repartition` :

$$
\text{Co\hat{u}t}_{\text{jour}} = \frac{\text{salaire\_brut} \times (1 + \text{taux\_charges})}{\text{jours\_travailles\_mois}}
$$

| `base_repartition` | Formule | Quand l'utiliser |
|---|---|---|
| `DUREE` | $C_{\text{fixe}} = \dfrac{\text{Co\hat{u}t}_{jour}}{\text{heures\_par\_jour}} \times \text{dur\'ee\_trajet}_h$ | Tournées de durées inégales. **Défaut.** |
| `FREQUENCE` | $C_{\text{fixe}} = \dfrac{\text{Co\hat{u}t}_{jour}}{N_{\text{trajets du jour}}}$ | Plusieurs tournées courtes par jour. |
| `FORFAIT_JOUR` | $C_{\text{fixe}} = \text{Co\hat{u}t}_{jour}$ | Une seule tournée par jour. |

**Garde-fou obligatoire sur `FREQUENCE`** : $N$ est le nombre de trajets **non
annulés** du prévendeur sur la même `date_operationnelle`. Ce nombre n'est connu
avec certitude qu'à la clôture de la journée, pas à la clôture du trajet. D'où
la reventilation de fin de journée du § 4.2 — sans elle, le premier trajet clôturé
porterait 100 % du coût journalier et les suivants 0.

**Garde-fou sur `DUREE`** : si `fin_reelle` est nulle ou antérieure à
`debut_reel`, la durée est invalide. On ne calcule pas « 0 h » (ce qui
minorerait silencieusement le coût) : le trajet part en **anomalie** et bascule
sur `FORFAIT_JOUR` avec un drapeau `duree_estimee = true`, visible en rapport.

### 3.3 Coûts de transport — $C_{\text{transport}}$

$$
C_{\text{transport}} = \underbrace{\frac{km \times \text{conso}}{100} \times P_{\text{carburant}}}_{\text{variable}} + \underbrace{\bigl(A + L + I + E\bigr) \times \frac{km}{\text{km\_moyens\_mois}}}_{\text{fixe ventilé}}
$$

où $km = \text{km\_fin} - \text{km\_debut}$, et $A$ = amortissement mensuel
($\text{co\hat{u}t\_acquisition} / \text{dur\'ee\_amortissement}$), $L$ = loyer,
$I$ = assurance, $E$ = entretien.

Cas `mode_detention = 'PERSONNEL'` : on n'applique **ni** amortissement **ni**
loyer (le véhicule n'appartient pas à l'entreprise), seulement le barème
kilométrique :
$$C_{\text{transport}} = km \times \text{indemnite\_km}$$

**Garde-fou** : si `km_fin < km_debut` (compteur remis à zéro, saisie inversée)
ou si `km` dépasse un seuil d'aberration paramétrable (ex. 500 km sur une
tournée urbaine), le trajet part en anomalie et on retient le **km médian
historique du secteur** plutôt qu'une valeur absurde — avec drapeau
`km_estime = true`.

### 3.4 Charges & frais généraux — $C_{\text{charges}}$

$$
C_{\text{charges}} = \text{prime\_panier\_jour} + \frac{\text{forfait\_telecom} + \text{amortissement\_materiel}}{\text{jours\_travailles\_mois}} + \sum \text{d\'epenses\_r\'eelles imput\'ees}
$$

Les charges patronales sont **déjà** dans $C_{\text{fixe}}$ via
`taux_charges_patronales` — ne pas les recompter ici. C'est l'erreur de double
comptage la plus fréquente sur ce type de modèle.

Les `dépenses_réelles` sont les notes de frais rattachées au trajet
(parking, péage, repas exceptionnel), imputées via leur **date opérationnelle**,
pas leur date calendaire.

### 3.5 Rémunération freelance — $C_{\text{freelance}}$

**Part fixe** : `forfait_par_tournee` + (`forfait_par_jour` / nb trajets du jour).

**Part variable** — algorithme :

```
fonction calculerVariable(regle, metriques):
    total = 0
    pour chaque assiette distincte des paliers de la regle:
        valeur = metriques[assiette]          # CA, tonnage, nb clients…
        paliers = paliers(regle, assiette) triés par seuil_min croissant

        si regle.mode_cumul_paliers == 'ATTEINT':
            p = dernier palier dont seuil_min <= valeur
            si p existe: total += appliquer(p, valeur)

        sinon:  # PROGRESSIF
            pour chaque p dans paliers:
                borne_haute = min(valeur, p.seuil_max ?? +inf)
                tranche = max(0, borne_haute - p.seuil_min)
                si tranche > 0: total += appliquer(p, tranche)

    si regle.plafond_variable != NULL:
        total = min(total, regle.plafond_variable)
    retourner total

fonction appliquer(palier, base):
    selon palier.type_calcul:
        'POURCENTAGE'      -> base * palier.valeur / 100
        'MONTANT_UNITAIRE' -> base * palier.valeur      # ex. 5 DH / client visité
        'FORFAIT'          -> palier.valeur             # indépendant de la base
```

**Le piège du `TAUX_CONVERSION`.** Cette assiette est un **ratio**, pas un
volume. Deux conséquences que le moteur doit gérer explicitement :

1. En mode `PROGRESSIF`, découper un ratio « par tranches » n'a aucun sens
   métier. Le moteur **force `ATTEINT`** pour les assiettes de type ratio, et
   l'écran de configuration grise l'option.
2. Le dénominateur peut être nul (aucune visite). Un taux `0/0` n'est pas `0 %`,
   c'est **indéfini**. On ne verse alors aucune part variable sur cette assiette
   et on marque `assiette_non_evaluable`, plutôt que de traiter implicitement
   comme `0 %` — ce qui pénaliserait à tort un prévendeur dont la tournée a été
   annulée pour raison externe.

**Plancher garanti** : appliqué **après** plafond, sur le total fixe + variable.
Un plancher n'est pas un minimum de la part variable seule.

### 3.6 Indicateurs dérivés

$$
\text{Marge}_{\text{trajet}} = \text{Marge brute}_{\text{commandes du trajet}} - \text{Co\hat{u}t}_{\text{trajet}}
$$

$$
\text{Co\hat{u}t par client visit\'e} = \frac{\text{Co\hat{u}t}_{\text{trajet}}}{\text{nb\_clients\_visites}} \qquad
\text{Co\hat{u}t par kg} = \frac{\text{Co\hat{u}t}_{\text{trajet}}}{\text{tonnage}}
$$

> **Attention méthodologique** — la marge par trajet doit se calculer sur la
> **marge brute** des commandes (CA − coût d'achat des marchandises), pas sur le
> CA. Rapporter un coût à un CA donne un ratio, pas une rentabilité. Par ailleurs,
> le numérateur et le dénominateur doivent couvrir **exactement la même fenêtre
> opérationnelle** : filtrer le CA sur une plage horaire sans filtrer les coûts
> de la même façon produit un résultat faux. C'est précisément pour cette raison
> que les écrans Finance de FreshLink n'ont volontairement **pas** reçu le filtre
> horaire (cf. commit « intervalle date + heure »).

### 3.7 Coût global par prévendeur

$$
\text{Co\hat{u}t}_{\text{pr\'evendeur}}(P) = \sum_{t \in \text{trajets}(P)} \text{Co\hat{u}t}_{\text{trajet}}(t) \;+\; \text{Co\hat{u}ts non ventil\'es}(P)
$$

Les **coûts non ventilés** sont les coûts qui subsistent en l'absence de trajet :
congés payés, jours sans tournée d'un salarié, formation. Les ignorer sous-estime
le coût réel du prévendeur. Ils sont calculés en fin de période comme :

$$
\text{Non ventil\'es} = \text{Co\hat{u}t}_{jour} \times \bigl(\text{jours\_travailles\_mois} - \text{jours avec au moins un trajet}\bigr)
$$

Ce montant n'existe **que** pour les `SALARIE`. Un freelance sans tournée ne
coûte rien.

---

## 4. Workflow et règles métier

### 4.1 Cycle de vie d'un trajet

```
  PLANIFIE ──ouverture──> EN_COURS ──clôture──> CLOTURE
      │                       │
      └────annulation─────────┴──> ANNULE
```

**Ouverture** — le prévendeur démarre sa tournée sur mobile. Le système :
1. enregistre `debut_reel` (horodatage réel, avec offset local) ;
2. calcule `date_operationnelle` via le profil `PREVENTE` ;
3. **fige** cette date. Une tournée démarrée à 13h58 et une autre à 14h02
   n'appartiennent pas à la même journée opérationnelle — c'est voulu et cela ne
   doit plus jamais bouger ensuite ;
4. saisit `km_debut` (obligatoire si `vehicule_id` renseigné).

**Clôture** — à la fin de la tournée :
1. saisie `km_fin`, `fin_reelle` ;
2. agrégation des métriques (visites, commandes, CA, tonnage) **sur la
   `date_operationnelle` figée**, pas sur la date calendaire ;
3. résolution des paramètres **en vigueur à cette date** (§ 2.7) ;
4. calcul des 5 composantes de coût ;
5. **écriture du snapshot** dans `parametres_snapshot` + `cout_*` ;
6. écriture d'une trace d'audit (`logAction`) avec l'utilisateur clôturant.

> **Principe directeur n°3** — Après clôture, les montants sont **immuables**.
> Une correction passe par un **avoir de régularisation** (nouvelle ligne
> signée), jamais par une réécriture. C'est ce qui permet de rapprocher la
> comptabilité et l'ERP.

### 4.2 Clôture de journée opérationnelle

Déclenchée automatiquement à `heure_fin + délai de grâce` (défaut : 2 h), ou
manuellement.

1. **Trajets orphelins** — tout trajet `EN_COURS` dont la journée est terminée
   est clôturé d'office avec `fin_reelle` estimée à `heure_fin` et le drapeau
   `cloture_automatique = true`. Sans cela, un prévendeur qui oublie de clôturer
   fait disparaître son coût du rapport.
2. **Reventilation `FREQUENCE`** — $N$ est maintenant connu ; on recalcule
   $C_{\text{fixe}}$ de tous les trajets du jour. C'est la **seule** réécriture
   autorisée après clôture de trajet, elle est bornée à la journée en cours et
   tracée.
3. **Coûts non ventilés** — si aucun trajet pour un salarié actif ce jour-là,
   on génère une ligne de coût non ventilé (§ 3.7).
4. **Verrouillage** — la journée passe en `VERROUILLEE`. Toute écriture
   ultérieure est refusée et doit passer par régularisation.

### 4.3 Rapport de contrôle (obligatoire)

Produit à chaque clôture de journée, il liste tout ce qui a demandé une
hypothèse. Il ne s'agit pas d'un confort mais du garde-fou central de ce module :

| Anomalie | Effet sur le calcul |
|---|---|
| Enregistrement hors plage horaire | Rattaché selon `politiqueHorsPlage` |
| Trajet clôturé automatiquement | Durée estimée à `heure_fin` |
| `km_fin < km_debut` ou km aberrant | Km médian du secteur retenu |
| Durée invalide | Bascule sur `FORFAIT_JOUR` |
| `TAUX_CONVERSION` avec 0 visite | Assiette non évaluable, variable non versée |
| Paramètre absent à la date | Trajet **bloqué**, pas de valeur par défaut silencieuse |

### 4.4 Gestion des exceptions

**Chevauchement de trajets.** Deux trajets simultanés d'un même prévendeur avec
`base_repartition = DUREE` font compter deux fois les mêmes heures.
Règle : le chevauchement est **interdit par défaut** (contrainte à l'ouverture).
S'il est autorisé (option `autoriser_chevauchement`, cas d'un binôme), les
heures de la plage commune sont réparties au prorata entre les trajets — jamais
comptées intégralement dans chacun.

```sql
-- Détection (PostgreSQL, extension btree_gist)
ALTER TABLE trajet_prevente ADD CONSTRAINT trajet_sans_chevauchement
  EXCLUDE USING gist (
    prevendeur_id WITH =,
    tstzrange(debut_reel, COALESCE(fin_reelle,'infinity')) WITH &&
  ) WHERE (statut IN ('EN_COURS','CLOTURE'));
```

**Annulation de trajet.** Trois cas, à ne pas confondre :

| Cas | Coût retenu |
|---|---|
| Annulé **avant** ouverture | 0 — rien n'a été engagé. |
| Annulé **après** ouverture, sans visite | Transport réel (le carburant est consommé) + part fixe au prorata du temps écoulé. **Pas** de part variable. |
| Annulé après des visites | Le trajet n'est pas annulable : il est **clôturé** avec ses métriques réelles. Annuler ferait disparaître des visites réalisées et des coûts engagés. |

**Prévendeur multi-secteurs sur un trajet.** Le coût est réparti entre secteurs
au prorata du **nombre de clients visités** par secteur, pas du CA — le CA
attribuerait tout le coût au secteur riche alors que l'effort commercial est
comparable.

**Changement de contrat en cours de mois** (salarié → freelance). Chaque trajet
utilise le régime en vigueur à sa `date_operationnelle`. Les coûts non ventilés
sont calculés au prorata de la période salariée uniquement.

---

## 5. Interfaces

### 5.1 Écran « Paramètres › Journée Opérationnelle »

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Paramètres système  ›  Journée Opérationnelle          [Historique v]     │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  Profils                                          [ + Nouveau profil ]     │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ ● PRÉVENTE      J-1 14:00 → J 04:00     4 types rattachés   [Modifier]│ │
│  │ ○ LIVRAISON     J   04:00 → J 14:00     3 types rattachés   [Modifier]│ │
│  │ ○ ACHAT         J-1 22:00 → J 10:00     2 types rattachés   [Modifier]│ │
│  │ ○ DÉFAUT        J   00:00 → J+1 00:00   (tout le reste)               │ │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│  ── Profil : PRÉVENTE ──────────────────────────────────────────────────   │
│                                                                            │
│   Début   [ J-1 ▾]  [ 14:00 ]        Fin   [ J ▾]  [ 04:00 ]              │
│   Fuseau  [ Africa/Casablanca ▾ ]                                          │
│                                                                            │
│   ┌── Aperçu de la journée du 05/08/2026 ──────────────────────────────┐   │
│   │  04/08 14:00 ████████████████████████████████ 05/08 04:00          │   │
│   │  ░░░░░░░░░░ 05/08 04:00 → 14:00 : HORS PLAGE (10 h) ░░░░░░░░░░     │   │
│   │  Durée couverte : 14 h · Non couverte : 10 h                       │   │
│   └────────────────────────────────────────────────────────────────────┘   │
│                                                                            │
│   Enregistrements hors plage                                               │
│   ( ) Rattacher à la journée suivante        ← recommandé                  │
│   ( ) Rattacher à la journée précédente                                    │
│   ( ) Refuser la saisie                                                    │
│                                                                            │
│   ⚠  10 h/24 ne sont couvertes par aucune journée. Sur les 30 derniers     │
│      jours, 47 enregistrements seraient concernés → journée suivante.      │
│                            [ Voir le détail des 47 ]                       │
│                                                                            │
│   Types d'enregistrement rattachés                                         │
│   [x] Commande   [x] Visite   [x] Trajet prévente   [x] Dépense prévente   │
│   [ ] Bon de livraison  ← déjà rattaché au profil LIVRAISON                │
│                                                                            │
│   Application  ( ) À partir d'aujourd'hui   ( ) À partir du [__/__/____]   │
│   ⚠  Les journées déjà verrouillées ne seront pas recalculées.             │
│                                                                            │
│                                        [ Annuler ]  [ Simuler ]  [ Valider ]│
└────────────────────────────────────────────────────────────────────────────┘
```

Points de conception non négociables :

* **la barre d'aperçu** rend le trou de couverture visible avant validation —
  c'est le seul moyen d'éviter que quelqu'un configure 14:00→04:00 sans réaliser
  que 10 h de la journée ne sont couvertes par rien ;
* **le compteur d'impact** (« 47 enregistrements concernés ») transforme une
  décision abstraite en décision informée ;
* **`Simuler`** rejoue la configuration sur les 30 derniers jours et montre les
  écarts de rattachement, sans rien écrire ;
* le rattachement d'un type déjà pris par un autre profil est **désactivé**, pas
  seulement déconseillé (cf. contrainte § 2.1).

### 5.2 Écran « Rentabilité Prévente »

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Rentabilité Prévente                                                      │
│  Du [04/08/2026] Au [05/08/2026]   De [__:__] à [__:__]                    │
│  Secteur [Tous ▾]  Prévendeur [Tous ▾]  Contrat [Tous ▾]      [Export ⤓]  │
│  ⓘ Dates opérationnelles (profil PRÉVENTE : J-1 14:00 → J 04:00)           │
├────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │Coût total│ │Marge     │ │Coût/client│ │Coût/kg  │ │Ratio     │          │
│  │ 12 480 DH│ │ 38 200 DH│ │  47,3 DH │ │ 0,82 DH │ │  24,6 %  │          │
│  │  ▲ 3,2 % │ │  ▲ 8,1 % │ │  ▼ 1,4 % │ │  ▬ 0,0 %│ │  ▼ 1,1 pt│          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
│                                                                            │
│  ⚠  3 anomalies sur la période             [ Voir le rapport de contrôle ] │
├────────────────────────────────────────────────────────────────────────────┤
│  Par prévendeur                                    [Trajets] [Prévendeurs] │
│ ┌────────────┬──────┬───────┬────────┬────────┬────────┬────────┬────────┐ │
│ │ Prévendeur │Contr.│Trajets│  Fixe  │Transp. │Charges │Freelanc│  TOTAL │ │
│ ├────────────┼──────┼───────┼────────┼────────┼────────┼────────┼────────┤ │
│ │ H. Ouardi  │ SAL  │   2   │ 1 040  │  312   │  180   │    —   │ 1 532  │ │
│ │ ↳ marge 4 810 DH · 31 clients · 49,4 DH/client · ratio 24,1 %          │ │
│ ├────────────┼──────┼───────┼────────┼────────┼────────┼────────┼────────┤ │
│ │ M. Idrissi │ FREE │   1   │    —   │  148   │    —   │  920 ⚠ │ 1 068  │ │
│ │ ↳ marge 2 240 DH · 18 clients · 59,3 DH/client · ratio 32,3 %          │ │
│ │ ⚠ plafond variable atteint (920 / 920 DH)                              │ │
│ ├────────────┼──────┼───────┼────────┼────────┼────────┼────────┼────────┤ │
│ │ Non ventilé│ SAL  │   —   │   400  │    —   │   60   │    —   │   460  │ │
│ │ ↳ 1 jour sans tournée (K. Benali, 05/08)                               │ │
│ └────────────┴──────┴───────┴────────┴────────┴────────┴────────┴────────┘ │
│                                                                            │
│  Détail du trajet T-2026-0841 — H. Ouardi · 04/08 14:12 → 05/08 01:40      │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Fixe salarial   DUREE · 11,47 h × 90,7 DH/h ................  1 040  │  │
│  │ Transport       62 km · carburant 44 + ventilé 268 .........    312  │  │
│  │ Charges         panier 60 + télécom/matériel 120 ...........    180  │  │
│  │ Freelance       —                                                    │  │
│  │                                                        TOTAL   1 532  │  │
│  │ ── Métriques ──                                                      │  │
│  │ 31 clients visités · 24 commandes · taux conv. 77,4 %                │  │
│  │ CA 19 400 DH · marge brute 6 342 DH · tonnage 1 868 kg              │  │
│  │                                                                      │  │
│  │ 🔒 Calculé le 05/08 06:00 avec la grille « Prévendeur 2026 » (v3)     │  │
│  │    et le carburant à 14,80 DH/L.          [ Voir le snapshot ]        │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

Points de conception :

* la **ventilation en 4 colonnes** est toujours visible : un total seul ne permet
  aucune action corrective, alors que voir « transport = 2× la normale » oriente
  immédiatement ;
* la ligne **« Non ventilé »** est affichée dans le même tableau, pas dans un
  onglet séparé : c'est du coût réel, l'exclure donnerait une vision flatteuse
  et fausse ;
* le **cadenas + snapshot** rappelle que le chiffre est figé et rejouable ;
* le **rappel du profil horaire** sous les filtres évite l'incompréhension
  classique « pourquoi ma commande du 5 août à 9h n'est pas dans le 5 août ».

---

## 6. Plan de mise en œuvre

| Lot | Contenu | Dépendances |
|---|---|---|
| **L1** | `lib/businessDay.ts` : profils, `dateOperationnelle()`, `bornes()`, politique hors plage. Refonte de `commandeCycleBounds` en appelant. Écran de configuration + simulateur. | — |
| **L2** | Tables paramètres (`prevendeur`, `grille_salariale`, `vehicule`, `regle_freelance*`) + écrans CRUD + versionnement. | L1 |
| **L3** | `trajet_prevente` : ouverture/clôture mobile, chevauchement, km. | L2 |
| **L4** | Moteur de calcul + snapshot + clôture de journée + reventilation + rapport de contrôle. | L3 |
| **L5** | Écran Rentabilité Prévente, export, comparaisons. | L4 |
| **L6** | Raccordement aux primes existantes (`BOPerformanceIncentives`) — la part variable calculée ici devient la **source** de la prime versée, au lieu d'un second calcul indépendant. | L4 |

**Le lot L1 est un prérequis strict.** Tant que la journée opérationnelle n'est
pas un concept unique et partagé, tout calcul de coût bâti par-dessus héritera
des divergences de dates — exactement le problème que ce module est censé
résoudre.

---

## 7. Décisions à trancher avant développement

1. **Politique hors plage par profil** — `RATTACHER_SUIVANT` convient-il pour la
   prévente, ou faut-il refuser la saisie hors fenêtre ?
2. **`base_repartition` par défaut** — `DUREE` suppose que les heures de début et
   de fin de tournée sont saisies avec sérieux sur le terrain. Si ce n'est pas
   acquis, `FORFAIT_JOUR` donne un résultat moins fin mais plus fiable.
3. **`mode_cumul_paliers`** — `PROGRESSIF` (pas d'effet de seuil) ou `ATTEINT`
   (effet de motivation plus fort, mais saut de rémunération) ?
4. **Coûts non ventilés** — à intégrer au coût prévendeur (vision coût complet)
   ou à isoler en frais de structure (vision coût direct) ?
5. **Délai de grâce de clôture** — 2 h suffisent-elles avant clôture d'office ?
6. **Marge brute par commande** — le coût d'achat des marchandises est-il
   disponible de manière fiable à la maille commande, ou faut-il se rabattre sur
   un taux de marge moyen par famille pour la v1 ?
