# Livraison opérationnelle sans clé fournisseur — 22 octobre 2026

## Changements livrés

- Prévisions et réassort : lecture Supabase paginée, uniquement commandes réelles marquées livrées, 28 jours UTC terminés, exclusion des unités inconnues et des simulations. Historique insuffisant affiché explicitement. Estimation saisonnière simple, pas de modèle entraîné. Calcul de besoin avec stock utilisable vérifié, arrivages, délai et sécurité saisis par l'opérateur. Aucun fournisseur fictif, aucun achat ni départ automatique annoncé.
- GPS : proposition d'ordre par proximité puis amélioration 2-opt, au plus 150 arrêts. Le trajet à vol d'oiseau ne se dégrade pas ; coordonnées invalides laissées en fin et signalées. Confirmation avant changement du simulateur. Aucune promesse sur trafic, capacité ou fenêtres horaires.
- Commande mobile : le brouillon relu rejoint le formulaire existant ; rapprochement exact et unique du client/article, unités et conditionnements du catalogue, prix ERP. Refus des noms ambigus et prix absents. La saisie habituelle et sa validation restent nécessaires ; aucune création automatique.
- Assistants : prise en charge des commandes affectées par commercialId et prevendeurId ; ordre déterministe des données. Contrôle de chargement des images et d'ouverture du microphone amélioré.
- Lecture serveur : les comptes de portail n'accèdent pas aux tables ERP via sync-read ; séparation des tables RH, finance et configuration sensible pour les rôles internes. Annuaire interne réduit à identifiant, nom, rôle et activité pour les non-administrateurs. Le Super Super Admin conserve son accès.
- Sauvegarde : pagination de la table de quotas sur sa clé composée day/subject. Vérificateur local de manifestes, empreintes, compteurs et clés primaires. Aucune restauration de production effectuée.

## Validation et limites

Les tests isolés couvrent les exclusions de simulation, périodes, unités, historique insuffisant, calcul de réassort, conservation des arrêts, non-dégradation de distance, 150 arrêts, rapprochement et droits serveur. Les tests HTTP vérifient le refus pour un compte commercial malgré un jeton revendiquant un rôle admin : le rôle relu en base prévaut.

Le calcul des prévisions dépend des statuts et quantités présents dans le carnet. Il ne certifie pas la livraison physique et ne corrige pas ruptures, promotions ou retours partiels. Les prix et stocks doivent être confirmés au moment de la décision. Le parcours brouillon nécessite une réponse fournisseur pour un essai de bout en bout ; le moteur de rapprochement est testé sans fournisseur.

Cette livraison n'est pas une certification de tout l'ERP. Restent des travaux distincts : preuve de restauration complète dans une base isolée, essais multi-utilisateurs sous charge réelle, recette des appareils Android/iPhone, audit des accès directs Supabase et des anciennes données locales, autorisations ligne par ligne de tous les flux métier, rapprochement automatisé achat-réception-facture et automatisations externes (WhatsApp, trafic routier). Les contrôles de lecture ajoutés ne purgent pas des données déjà téléchargées dans d'anciennes sessions.

## Utilisation

1. Back-office > Stock & Catalogue > Prévisions & Réassort > Actualiser et calculer.
2. Lire la période, les exclusions et la couverture. Choisir un article puis renseigner les paramètres vérifiés pour obtenir un besoin proposé.
3. GPS > simulateur d'itinéraire : choisir les arrêts et le départ, puis Proposer un ordre géographique. Examiner la proposition avant confirmation.
4. Prise de commande > Brouillon de commande assisté : après activation future du fournisseur, relire le résultat puis Reprendre dans la commande à vérifier. Le formulaire manuel fonctionne sans clé.
5. Vérification d'une sauvegarde privée : `node scripts/verify-backup.mjs <dossier>`. Un résultat integrity=verified confirme les fichiers, pas une restauration SQL ni leur cohérence transactionnelle entre tables.

## Déploiement et retour arrière

Aucune nouvelle dépendance ou migration de données. CI et prévisualisation avant fusion ; pilote IA maintenu désactivé et aucun secret modifié. Restaurer le déploiement Vercel précédent si une régression apparaît ; attention, cela retire aussi les nouveaux contrôles de lecture. Les données métier ne sont pas modifiées par les essais automatisés.
