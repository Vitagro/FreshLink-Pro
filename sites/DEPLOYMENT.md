# Publication des six sites Vita

Les sources sont les six dépôts publics `Vitagro/vita-*-site`. Les versions
publiées sont fixées dans `deploy-manifest.json`. Pour une nouvelle publication,
mettre à jour le SHA du site concerné dans ce manifeste après validation de son
dépôt. La fusion sur `main` lance `Deploy static Vita sites to Hostinger` ; un
lancement manuel du workflow republie les mêmes versions.

Le domaine principal utilise `/home/u387018932/domains/vita-agro.com/public_html`.
Les sous-domaines `tech`, `fresh`, `stores`, `trad` et `logi` utilisent chacun le
sous-dossier portant leur nom, configuré dans hPanel le 12 octobre 2026.

Le workflow utilise les secrets SSH déjà configurés pour la sauvegarde privée.
Il valide le JavaScript, sauvegarde les quatre fichiers publics remplacés dans
`/home/u387018932/backups/sites/<run>-<attempt>/previous`, puis remplace chaque
fichier de façon atomique. Il ne supprime aucun dossier. ERP et shop restent
sur Vercel et ne sont pas modifiés par cette publication.

Le contrôle final compare le contenu HTTPS de chaque site à son fichier publié.
En cas d'échec, consulter les journaux et corriger DNS, SSL ou cache. La sauvegarde
privée reste disponible pour restaurer les fichiers précédents. Aucun retour
arrière automatique n'est effectué lors d'un retard DNS ou SSL.
