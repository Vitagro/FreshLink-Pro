"use client"

import bcrypt from "bcryptjs"

// ============================================================
// TYPES
// ============================================================


export type UserRole =
  | "super_super_admin"
  | "super_admin" | "admin" | "resp_commercial" | "team_leader"
  | "prevendeur" | "resp_logistique" | "magasinier" | "dispatcheur" | "livreur"
  | "acheteur" | "ctrl_achat" | "ctrl_prep"
  | "cash_man" | "financier"
  | "rh_manager" | "comptable"
  | "client" | "client_proprietaire" | "client_gerant" | "fournisseur"
  | "investisseur" | "qualite" | "it_admin" | "auditeur"
  | "chef_depot" | "resp_achat" | "suivi_commande" | "charge_recouvrement"

export const JAWAD_ID = "VFU00001"
export function isSuperSuperAdmin(user: { role: string }): boolean {
  return user.role === "super_super_admin"
}

export function hasInvestorAccess(user: { role: string }): boolean {
  return user.role === "super_super_admin" || user.role === "super_admin" || user.role === "investisseur"
}

// Message de confirmation bilingue FR/AR affiché (mobile + BO) quand un PA
// saisi s'écarte fortement du PA précédent — cf. store.checkPaDeviationSuspecte.
export function paDeviationConfirmMessage(info: { articleNom: string; ancienPa: number; nouveauPa: number; deviationPct: number }): string {
  const fmt = (n: number) => n.toLocaleString("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (
    `⚠️ Merci de vérifier le prix\n` +
    `${info.articleNom} : vous avez saisi ${fmt(info.nouveauPa)} DH alors que le prix précédent était ${fmt(info.ancienPa)} DH (écart ${info.deviationPct}%).\n\n` +
    `⚠️ يرجى التحقق من السعر\n` +
    `${info.articleNom} : لقد أدخلت ${fmt(info.nouveauPa)} درهم بينما كان السعر السابق ${fmt(info.ancienPa)} درهم (فرق ${info.deviationPct}%).\n\n` +
    `Confirmer ce nouveau prix ? / هل تؤكد هذا السعر الجديد؟`
  )
}

export type UserAccessType = "mobile" | "backoffice" | "both"

export type Civilite = "M." | "Mme" | "Dr." | "Pr."

export interface User {
  id: string
  name: string
  email: string
  password: string
  civilite?: Civilite        // M. / Mme / Dr. / Pr.
  // Dual passwords for users with accessType === "both"
  // If set, passwordMobile is used for mobile access, passwordBO for back-office
  passwordMobile?: string   // e.g. "1234"
  passwordBO?: string       // e.g. "BO1234"
  role: UserRole
  accessType?: UserAccessType   // "mobile" | "backoffice" | "both" — overrides role-based routing
  secteur?: string
  // Équipe/groupe : id de l'admin racine du groupe auquel ce compte appartient.
  // Un admin sans groupeId explicite est lui-même racine de son propre groupe
  // (voir effectiveGroupId). undefined pour un compte non-admin = hérite du
  // groupe de l'admin qui l'a créé (posé explicitement à la création).
  groupeId?: string
  phone?: string
  actif: boolean
  mustChangePassword?: boolean  // true = must change on first login
  // permissions
  canViewAchat?: boolean
  canViewCommercial?: boolean
  canViewLogistique?: boolean
  canViewStock?: boolean
  canViewCash?: boolean
  canViewFinance?: boolean
  canViewRecap?: boolean
  canViewDatabase?: boolean
  canViewRH?: boolean
  canViewInvestisseur?: boolean   // CONFIDENTIEL — accordé uniquement par super_super_admin
  // Comptes externes (clients + fournisseurs) — visible uniquement pour resp_commercial, resp_achat, admin
  canViewExternal?: boolean
  // Peut creer/modifier des commandes depuis le back-office (resp_commercial + admin)
  canCreateCommandeBO?: boolean
  // objectifs prevendeur — journalier / hebdomadaire / mensuel
  objectifClients?: number
  objectifTonnage?: number
  objectifJournalierCA?: number
  objectifHebdomadaireCA?: number
  objectifMensuelCA?: number
  objectifJournalierClients?: number
  objectifHebdomadaireClients?: number
  objectifMensuelClients?: number
  // Spécialisation acheteur : familles (ou produits) qu'il achète. Filtre par
  // défaut son catalogue mobile Achat (avec option « voir tout »). Vide = tout.
  specialitesAchat?: string[]
  // workflow notifications
  notifAchat?: boolean
  notifCommercial?: boolean
  notifLivraison?: boolean
  notifRecap?: boolean
  notifBesoinAchat?: boolean
  // Portal linking — links a user account to a fournisseur or client record
  fournisseurId?: string   // for role === "fournisseur" — their fournisseur record id
  clientId?: string        // for role === "client" — their client record id
  // Subtype — categorise client (particulier/marchand/chr) or fournisseur (ferme/vendeur/intermediaire)
  subtype?: "particulier" | "marchand" | "chr" | "ferme" | "vendeur" | "intermediaire"
  telephone?: string       // WhatsApp number for notifications (intl format ex: 212661234567)
  // Profile photo — base64 data URL or external URL
  photoUrl?: string
  // Super admin decides: this user MUST activate camera + mic before accessing app
  requireCameraAuth?: boolean
  // Multi-depot: which depot this user is assigned to (magasinier, acheteur...)
  depotId?: string
  // ── Multi-role support ─────────────────────────────────────────────────────
  // A user can hold multiple roles simultaneously (e.g. acheteur + prevendeur).
  // `roles` is the full list; `activeRole` is the currently selected view.
  // When `roles` is undefined/empty, fall back to the single `role` field.
  roles?: UserRole[]
  activeRole?: UserRole
  // Compte de démonstration — écriture bloquée, visible dans la liste déroulante
  // de connexion. Ne peut être coché qu'à la création par Jawad (super_super_admin).
  isDemo?: boolean
}

// Matrice RBAC + assignation automatique des droits : voir lib/rolePermissions.ts
// (autoAssignPermissions / mergeRolePermissions, appelées à la création de compte).

export type ModalitePaiement = "cash" | "cheque" | "virement" | "traite_30" | "traite_60" | "traite_90" | "credit_7" | "credit_15" | "credit_30"

export const MODALITE_LABELS: Record<ModalitePaiement, string> = {
  cash: "Cash / نقدا",
  cheque: "Chèque",
  virement: "Virement bancaire",
  traite_30: "Traite 30j",
  traite_60: "Traite 60j",
  traite_90: "Traite 90j",
  credit_7: "Crédit 7j",
  credit_15: "Crédit 15j",
  credit_30: "Crédit 30j",
}

export type ClientType =
  | "marchand" | "snack" | "epicerie" | "boucherie" | "restaurant" | "superette"
  | "grossiste" | "hypermarche" | "traiteur" | "hotel" | "marche" | "cafeteria"
  | "cantina" | "collectivite" | "autre"

export type DelaiRecouvrement = "jour_meme" | "24h" | "48h" | "1_semaine" | "1_mois" | "a_definir"

export const DELAI_RECOUVREMENT_LABELS: Record<DelaiRecouvrement, string> = {
  jour_meme:  "La journee meme",
  "24h":      "24 heures",
  "48h":      "48 heures",
  "1_semaine":"1 semaine",
  "1_mois":   "1 mois",
  a_definir:  "A definir",
}

export interface Client {
  id: string
  nom: string
  secteur: string
  zone: string
  type: ClientType
  typeAutre?: string
  taille: "50-100kg" | "150-300kg" | "350-500kg" | "500kg+"
  typeProduits: "haute_gamme" | "moyenne" | "entree_gamme"
  rotation: "journalier" | "4j/6" | "3/6" | "2/6" | "moins"
  modalitePaiement?: ModalitePaiement
  plafondCredit?: number
  // Credit management
  creditAutorise?: boolean              // is credit allowed for this client
  delaiRecouvrement?: DelaiRecouvrement // payment recovery delay
  creditWorkflowValidateur?: string     // user ID of the person who must approve credit
  creditWorkflowValidateurNom?: string  // display name
  creditStatut?: "ok" | "attente_validation" | "refuse"  // current credit authorization status
  creditSolde?: number                  // current outstanding balance DH
  gpsLat?: number
  gpsLng?: number
  telephone?: string
  email?: string
  adresse?: string
  ice?: string // Identifiant Commun de l'Entreprise (Maroc)
  notes?: string
  heureLivraison?: string  // "HH:MM" — créneau de livraison par défaut de ce client, saisi à la création
  // ── Photo du client (logo/devanture/photo de profil) ──
  // Affichée dans le BO, l'app mobile commercial, et le portail web client
  photo?: string  // URL (Unsplash, Supabase Storage, base64, etc.)
  logo?: string   // alias pour les CHR/marchands avec logo
  createdBy: string
  createdAt: string
  // Workflow linking: client → prevendeur → team_lead
  prevendeurId?: string    // ID of the assigned prevendeur user
  teamLeadId?: string      // ID of the team_leader user overseeing this client's prevendeur
  defaultHeureLivraison?: string   // "HH:MM" — saved automatically after first confirmed order
  // Loyalty & Rewards
  segment?: ClientSegment   // "standard" | "vip" | "grossiste" | "fidele"
  loyaltyPoints?: number    // cached total — updated by loyalty engine
  loyaltyOptIn?: boolean    // client opted into loyalty program
  categorie?: "chr" | "marchand" | "particulier"   // category group for pricing
  // Hiérarchie CHR : le propriétaire pilote la gestion via l'ERP, le gérant commande via le shop.
  // Détermine le rôle du compte de connexion (client_proprietaire / client_gerant).
  chrRole?: "proprietaire" | "gerant"
  // Remises & Promotions
  remisePct?: number        // remise globale % accordée à ce client (ex: 5 = 5%)
  remiseActive?: boolean    // true = la remise est appliquée sur ses achats
  promotions?: string[]     // codes / libellés de promotions actives
  // Échelle client (tarification) — distincte de `segment` (loyalty)
  echelle?: Tier
  // Équipe/groupe propriétaire de ce client (id de l'admin racine du groupe).
  // undefined = legacy/partagé par toutes les équipes (transition douce).
  groupeId?: string
}

// Échelle client utilisée pour la tarification par palier
export type Tier = "vip" | "gold" | "titanium" | "silver"
export const TIER_LABELS: Record<Tier, string> = {
  vip:      "VIP",
  gold:     "Gold",
  titanium: "Titanium",
  silver:   "Silver",
}

// ── Visite prevendeur ──────────────────────────────────────────────────────
export type VisiteResultat = "commande" | "sans_commande"

export interface Visite {
  id: string
  date: string
  prevendeurId: string
  prevendeurNom: string
  clientId: string
  clientNom: string
  commandeId?: string            // set if resultat === "commande"
  resultat: VisiteResultat
  raisonSansCommande?: string    // required if resultat === "sans_commande"
  notes?: string
  gpsLat?: number            // GPS latitude at time of visit
  gpsLng?: number            // GPS longitude at time of visit
}

export interface HistoriquePrixAchat {
  date: string
  fournisseurId: string
  fournisseurNom: string
  prixAchat: number        // DH / UM
  quantite?: number
}

export interface LotReception {
  lotId: string           // ex: "LOT-2025-06-01"
  dateReception: string   // ISO date
  quantite: number        // kg receptionnes dans ce lot
  fournisseurNom?: string
}

export interface Article {
  id: string
  nom: string
  nomAr: string
  famille: string
  // Unite de mesure principale (kg, tonne, caisse, carton, piece...)
  unite: string
  // Unite de Mesure commerciale (ex: caisse 15kg, carton 10kg)
  um?: string              // libelle UM ex: "Caisse", "Carton", "Palette"
  colisageParUM?: number   // quantite en unite de base par UM (ex: 15 kg/caisse)
  // Calcul caisses pour PO consolidé
  colisageCaisses?: number   // kg par caisse standard (ex: 30 pour gros, 15 pour demi) — sert a calculer nb caisses dans PO
  colisageDemiCaisses?: number // kg par demi-caisse (si different de colisageCaisses/2)
  // Stock
  stockDisponible: number
  stockDefect: number
  // Stock reel saisi par magasinier (inventaire physique)
  stockReel?: number            // saisi manuellement apres comptage physique
  stockReelDate?: string        // date de la derniere saisie stock reel
  stockReelSaisiPar?: string    // nom du magasinier
  // Stock theorique = stock_j-1 + receptions + retours - facturations
  stockTheorique?: number       // calcule automatiquement
  // Shelf life
  shelfLifeJours?: number       // duree de vie en jours (ex: 7 pour fraises)
  alerteShelfLifeJours?: number // alerter X jours avant expiration (defaut: 2)
  prixLiquidation?: number      // prix propose en cas de stock en degradation
  // Tracabilite lots
  lots?: LotReception[]
  // Prix
  prixAchat: number        // DH / unite de base
  pvMethode: "pourcentage" | "montant" | "manuel"
  pvValeur: number
  // Marge
  margeMethode?: "pourcentage" | "montant"   // affichage marge (auto calculee)
  // Historique PA par fournisseur
  historiquePrixAchat?: HistoriquePrixAchat[]
  photo?: string
  photos?: string[]           // galerie multi-photos
  // ── Activation stock / catalogue ─────────────────────────────
  actif?: boolean             // true = actif (default), false = désactivé globalement
  catalogueVisible?: boolean  // true = visible portail externe (default true)
  // ── Marketplace ──────────────────────────────────────────────
  marketplaceActif?: boolean  // publié sur marketplace/site web
  marketplaceStatut?: "disponible" | "hors_saison" | "out_of_stock" | "short_stock" | "nouveau" | "promo"
  marketplaceCommentaire?: string   // message affiché publiquement (ex: "Hors saison jusqu'à mars")
  marketplacePrixPublic?: number    // prix affiché sur le site (peut différer du PV interne)
  marketplacePromo?: {
    actif: boolean
    prixPromo: number
    dateDebut?: string
    dateFin?: string
    etiquette?: string         // ex: "Offre spéciale", "-20%"
  }
  marketplaceSeuilShortStock?: number  // (legacy) si stock < seuil → statut = short_stock
  marketplaceStock?: number           // ⚡ stock WEB alloué (indépendant du stock réel) : >0=dispo, 0=rupture
  marketplaceTags?: string[]          // tags SEO / filtres site
  marketplaceOrdre?: number           // ordre d'affichage sur le site
  marketplaceDescription?: string     // description publique longue
  marketplaceDescriptionAr?: string
  prixCHR?: number        // prix spécifique CHR/HORECA
  prixMarchand?: number   // prix spécifique marchand
  prixParticulier?: number // prix spécifique particulier
  promoCHR?: number       // remise % CHR
  promoMarchand?: number  // remise % marchand
  promoParticulier?: number // remise % particulier
  // Ajustement PV en DH (signé : négatif = remise, positif = marge) — s'ajoute
  // au prix de vente du segment APRÈS la remise %. Indépendant de promo* (% pur).
  ajustCHR?: number
  ajustMarchand?: number
  ajustParticulier?: number
  // Taux de marge CIBLE (%) par segment — purement informatif (n'affecte pas
  // le calcul du prix final), pour comparer la marge visée à la marge réelle
  // (PV final vs PA+charge) directement sur l'écran Tarifs par Catégorie.
  tauxMargeCHR?: number
  tauxMargeMarchand?: number
  tauxMargeParticulier?: number
  clientPrices?: Record<string, { prix?: number; promo?: number; ajust?: number }> // overrides par client individuel
  secteurPrices?: Record<string, { prix?: number; promo?: number; ajust?: number }> // overrides par secteur
  echellePrices?: Partial<Record<Tier, { prix?: number; promo?: number; ajust?: number }>> // overrides par échelle client (VIP/Gold/Titanium/Silver)
  // Charge appliquée à cet article pour le calcul du coût de revient
  // (transport, manutention, perte…) — référence un ChargeArticle du catalogue.
  chargeArticleId?: string
  // ── Pricing concurrentiel (module Pricing) ───────────────────────────────
  pvImbattable?: number        // PV imbattable conseillé (calculé vs concurrent), diffusé à la force de vente
  pvImbattableMaj?: string     // date ISO de la dernière diffusion à la force de vente
}

// Catalogue de charges applicables par article (coût de revient).
// Distinct des charges comptables (interface Charge / fl_charges).
export interface ChargeArticle {
  id: string
  nom: string        // ex: "Transport", "Manutention", "Perte"
  montant: number    // DH par unité, ajouté au prix d'achat
}

// Première liste par défaut (alimentée/éditable depuis le back-office › Achat).
// Sert à ne JAMAIS avoir une liste roulante vide ; les montants sont à 0 tant que
// le back-office ne les renseigne pas. Ids stables (clés React + sélection).
export const DEFAULT_CHARGES_ARTICLE: ChargeArticle[] = [
  { id: "chg-manutention", nom: "Manutention",     montant: 0 },
  { id: "chg-chariots",    nom: "Chariots",        montant: 0 },
  { id: "chg-balance",     nom: "Balance",         montant: 0 },
  { id: "chg-transport",   nom: "Transport",       montant: 0 },
  { id: "chg-emballage",   nom: "Emballage",       montant: 0 },
  { id: "chg-perte",       nom: "Perte / Freinte", montant: 0 },
]

// Gestion caisses vides
export type TypeCaisse = "gros" | "demi"

export interface CaisseVide {
  id: string
  type: TypeCaisse          // "gros" | "demi"
  libelle: string           // ex: "Gros caisse 30kg"
  capaciteKg: number        // capacite en kg
  capaciteUnites?: number   // nb unites par caisse
  stock: number             // nb caisses en stock
  enCirculation: number     // nb caisses sorties chez clients/livreurs
  prixUnitaire?: number     // DH par caisse (si facturation)
  notes?: string
}

export const TYPES_CAISSE_LABELS: Record<TypeCaisse, string> = {
  gros: "Gros caisse",
  demi: "Demi caisse",
}

// ── Contenants / Tares configurables ──────────────────────────────────────────
// Tout objet dont on soustrait le poids pour obtenir le poids net
// Exemples: caisse plastique 2.8kg, petit caisse 2kg, chario 15kg, palette 20kg
export interface ContenantTare {
  id: string
  nom: string           // ex: "Caisse plastique", "Petit caisse", "Chario", "Palette"
  poidsKg: number       // poids tare en kg
  actif: boolean
  notes?: string
}

export const DEFAULT_CONTENANTS_TARE: ContenantTare[] = [
  { id: "ct1", nom: "Caisse plastique (gros)", poidsKg: 2.8,  actif: true,  notes: "Caisse standard 30kg" },
  { id: "ct2", nom: "Caisse demi (petit)",     poidsKg: 1.5,  actif: true,  notes: "Demi-caisse 15kg" },
  { id: "ct3", nom: "Dolly (bois)",             poidsKg: 4.5,  actif: true,  notes: "Caisse bois type dolly" },
  { id: "ct4", nom: "Chariot",                 poidsKg: 25.0, actif: true,  notes: "Tare chariot standard — ajuster selon modele" },
  { id: "ct5", nom: "Palette bois",            poidsKg: 20.0, actif: false, notes: "Palette europeenne standard" },
]

// ── Mouvement caisses vides ────────────────────────────────────────────────────
// Chaque fois qu'on charge/decharge des caisses (ctrl achat, reception, expedition)
export type CaisseSourceOperation = "ctrl_achat" | "reception" | "expedition" | "achat" | "retour" | "manuel"

export interface CaisseVideMouvement {
  id: string
  date: string
  heure?: string
  typeOperation: CaisseSourceOperation
  sens: "sortie" | "entree"   // sortie = on donne des caisses, entree = on recupere des caisses
  nbCaisseGros: number
  nbCaisseDemi: number
  nbCaisseDollar?: number     // dolly / caisse bois
  nbChariot?: number          // chariot / palette roulante
  referenceDoc?: string       // ID du bon achat, BA, reception, etc.
  articleNom?: string
  operateurId: string
  operateurNom: string
  notes?: string
}

export const SPECIALITES_FRUITS_LEGUMES = [
  "Légumes feuilles", "Légumes racines", "Légumes fruits", "Agrumes",
  "Fruits tropicaux", "Fruits rouges", "Herbes aromatiques", "Champignons",
  "Primeurs", "Fruits secs", "Dattes", "Olives & huile d'olive",
  "Céréales & légumineuses", "Épices & condiments", "Fleurs comestibles",
  "Pommes", "Poires", "Raisins", "Melons & pastèques", "Pêches & abricots",
  "Figues", "Grenades", "Clémentines", "Citrons", "Pamplemousses",
  "Tomates cerises", "Concombres", "Aubergines", "Artichauds", "Brocolis",
  "Choux-fleurs", "Épinards", "Poireaux", "Céleri", "Persil & coriandre",
  "Avocat", "Mangue", "Ananas", "Kiwi", "Fraises", "Framboises", "Myrtilles",
]

export interface ItinerairePoint {
  nom: string       // Nom du lieu (ex: Souk Had Soualem)
  lat?: number
  lng?: number
  jour?: string     // ex: Lundi, Mardi, ...
  heureDepart?: string
  heureArrivee?: string
}

export type FournisseurType = "marche_gros" | "ferme" | "intermediaire" | "autre"
export const FOURNISSEUR_TYPE_LABELS: Record<FournisseurType, string> = {
  marche_gros: "Marché de gros",
  ferme: "Ferme / Producteur",
  intermediaire: "Intermédiaire",
  autre: "Autre",
}

export interface Fournisseur {
  id: string
  nom: string
  contact: string
  telephone?: string
  email: string
  adresse?: string
  ville?: string
  region?: string
  type?: FournisseurType          // categorie du fournisseur (choisie a la creation)
  specialites: string[]           // fruits & légumes fournis
  modalitePaiement?: ModalitePaiement
  delaiPaiement?: number          // jours
  plafondCredit?: number          // plafond de crédit accordé par le fournisseur (DH)
  ice?: string                    // Identifiant commun entreprise Maroc
  rc?: string                     // Registre de commerce
  notes?: string
  itineraires: ItinerairePoint[]  // tournées/marchés approvisionnement
  gpsVerifie?: boolean            // false = position saisie sans confirmation sur place
}

export interface Livreur {
  id: string
  type: "interne" | "externe"
  nom: string
  prenom: string
  telephone: string
  // interne
  cin?: string
  photoCin?: string
  photoPerso?: string
  // vehicule — commun interne/externe
  typeVehicule?: "camion" | "camionnette" | "fourgon" | "moto" | "autre"
  marqueVehicule?: string
  matricule?: string
  capaciteCaisses?: number
  capaciteTonnage?: number    // en kg
  photoCartGrise?: string
  photoPermis?: string
  // externe / transporteur (auto-entrepreneur ou société)
  societe?: string
  ice?: string        // Identifiant Commun de l'Entreprise
  rc?: string         // Registre de Commerce (ex: 12345/Casa)
  ifFiscal?: string   // Identifiant Fiscal
  cnss?: string       // N° CNSS
  // Carburant : avec = on fournit/paie le carburant (→ analyse conso) ;
  // sans = forfait, carburant à la charge du transporteur/livreur.
  carburantInclus?: boolean        // true = "avec carburant"
  consommationL100?: number        // consommation moyenne L/100km (estimation)
  notes?: string
  actif: boolean
  // Compte ERP du livreur : créé en attente, activé après validation admin (Demandes de comptes)
  compteStatut?: "en_attente" | "valide" | "rejete"
}

export interface MotifRetour {
  id: string
  label: string
  labelAr: string
  actif: boolean
}

export interface LigneAchat {
  articleId: string
  articleNom: string
  quantite: number
  prixAchat: number
}

// ── Motif de non-achat (quand l'acheteur ne peut pas acheter un besoin) ─────
export type MotifNonAchatCode =
  | "prix_eleve" | "qualite_insuffisante" | "non_dispo_marche"
  | "oubli" | "manque_liquidite" | "retard_communication" | "autre"

export const MOTIF_NON_ACHAT_LABELS: Record<MotifNonAchatCode, string> = {
  prix_eleve:           "Prix trop élevé",
  qualite_insuffisante: "Qualité insuffisante",
  non_dispo_marche:     "Non disponible au marché",
  oubli:                "Oubli",
  manque_liquidite:     "Manque de liquidité (argent)",
  retard_communication: "Retard de communication du besoin",
  autre:                "Autre",
}

export interface NonAchatSignalement {
  id: string
  date: string
  acheteurId: string
  acheteurNom: string
  articleId: string
  articleNom: string
  besoinQte: number      // quantite qui etait demandee
  motif: MotifNonAchatCode
  commentaire?: string
  statut: "signale" | "pris_en_compte" | "resolu"
  // workflow — envoi automatique au responsable achat
  notifieA?: string[]    // IDs des utilisateurs notifies
}

export interface BonAchat {
  id: string
  date: string
  createdVia?: "mobile" | "backoffice"   // origine reelle de la creation — sert a scoper les suppressions "donnees mobile"
  acheteurId: string
  acheteurNom: string
  fournisseurId: string
  fournisseurNom: string
  lignes: LigneAchat[]
  statut: "brouillon" | "validé" | "receptionné"
  emailDestinataire: string
  // Multi-depot — which depot this bon is destined for
  depotId?: string
  depotNom?: string
}

export interface LigneCommande {
  articleId: string
  articleNom: string
  unite?: string          // unite de mesure
  // UM (Unite de Mesure)
  um?: string             // libelle UM ex: "Caisse 15kg"
  colisageParUM?: number  // kg par UM
  quantiteUM?: number     // quantite en UM (ex: 3 caisses)
  quantite: number        // quantite en unites de base (kg) = quantiteUM * colisageParUM
  prixUnitaire: number    // prix par unite de base
  prixVente: number       // alias for prixUnitaire (used by MobileCommercial)
  prixUM?: number         // prix par UM = prixUnitaire * colisageParUM
  total: number
}

export type WorkflowValidation = "direct" | "responsable" | "admin"

export interface Commande {
  id: string
  date: string
  createdAt?: string   // vrai timestamp ISO de la prise de commande (distinct de `heurelivraison`, qui est l'heure de livraison souhaitée)
  createdVia?: "mobile" | "backoffice"   // origine reelle de la creation — sert a scoper les suppressions "donnees mobile" sans jamais toucher les commandes creees depuis le BO
  commercialId: string
  commercialNom: string
  clientId: string
  clientNom: string
  secteur: string
  zone: string
  gpsLat: number
  gpsLng: number
  lignes: LigneCommande[]
  heurelivraison: string
  statut: "en_attente" | "en_attente_approbation" | "valide" | "en_preparation" | "charge" | "refuse" | "en_transit" | "livre" | "retour"
  emailDestinataire: string
  // workflow linking
  teamLeadId?: string      // team_lead who must approve
  teamLeadNom?: string
  // approval workflow
  approbateur?: string
  approbateurId?: string
  dateApprobation?: string
  motifRefus?: string
  commentaire?: string
  notes?: string
}

export interface Reception {
  id: string
  date: string
  bonAchatId: string         // empty string if manual
  purchaseOrderId?: string   // PO ref if from PO
  fournisseurNom?: string
  source: "bon_achat" | "purchase_order" | "manuel"
  lignes: {
    articleId: string
    articleNom: string
    quantiteCommandee: number  // qty du bon achat / PO (ce qui était facturé/commandé)
    quantiteRecue: number      // qty réellement reçue à la réception physique
    quantiteFacturee?: number  // qty sur la facture fournisseur (peut différer de commandée)
    ecartQte?: number          // auto: quantiteRecue - quantiteFacturee
    prixAchat?: number
    prixFacture?: number       // prix sur facture (peut différer du bon achat)
    ecartPrix?: number         // auto: prixFacture - prixAchat
    motifReliquat?: string
  }[]
  statut: "en_attente" | "stand_by" | "partielle" | "validée"
  operateurId: string
  notes?: string
}

export interface Trip {
  id: string           // auto-number: T001, T002…
  numero?: string      // display number e.g. "T001"
  date: string
  livreurId: string
  livreurNom: string
  vehicule: string
  commandeIds: string[]
  statut: "planifié" | "en_cours" | "terminé"
  itineraire: { lat: number; lng: number; clientNom: string; ordre: number }[]
  sequenceMode?: "horaire" | "itineraire"  // mode chosen by dispatcher
  // KM logistique — obligatoire avant départ + après arrivée
  kmDepart?: number        // saisie obligatoire par le livreur avant de démarrer
  kmArrivee?: number       // saisie obligatoire à l'arrivée
  kmTotal?: number         // auto-calculé: kmArrivee - kmDepart
  // Caisses par article — saisie obligatoire par le contrôleur avant validation
  nbCaissesByArticle?: Record<string, { gros: number; demi: number; articleNom: string }>
  caissesValidees?: boolean  // true une fois le contrôleur a saisi toutes les caisses
  kmDepartConfirme?: boolean // true une fois le livreur a saisi le KM départ
  // Carburant / coût voyage
  carburantInclus?: boolean      // true = trip "avec carburant" (on paie le carburant → analyse conso)
  carburantReelLitres?: number   // litres réellement consommés (saisie au retour)
  coutEstime?: number            // coût estimé du voyage (DH) — snapshot à la planification
  // Estimation à l'affectation (avant tout trajet réel) — distance à vol
  // d'oiseau entre arrêts de l'itinéraire, majorée d'un facteur route.
  kmEstime?: number               // km estimé au moment de l'affectation
  litresEstimeAffectation?: number
}

export interface LigneRetour {
  commandeId: string
  clientNom: string
  articleId: string
  articleNom: string
  quantite: number      // quantite retournee (peut etre partielle)
  quantiteCmd?: number  // quantite originale commandee
  motif: string
  motifQualite?: boolean  // true = qualite motif → stock NON reintegre
}

export interface Retour {
  id: string
  date: string
  tripId: string
  livreurNom: string
  lignes: LigneRetour[]
  statut: "en_attente" | "validé"
  validePar?: string
  dateValidation?: string
}

export interface LigneBL {
  articleNom: string
  unite?: string            // kg, caisse, carton…
  quantite: number
  quantiteUM?: number       // quantite en UM (ex: 3 caisses)
  um?: string               // libelle UM
  prixUnitaire: number
  total: number
}

// Caisse pricing config — global defaults, can be overridden per BL
export interface CaissePricing {
  prixGrosseCaisse: number    // DH par grosse caisse (default: 70 DH)
  prixDemiCaisse: number      // DH par demi-caisse (default: 50 DH)
}

export const DEFAULT_CAISSE_PRICING: CaissePricing = {
  prixGrosseCaisse: 70,
  prixDemiCaisse: 50,
}

// Frais supplementaires BL (impression + service)
export interface FraisBlConfig {
  fraisImpressionParFeuille: number   // DH / feuille (ex: 2)
  nbFeuilles: number                  // nb feuilles par BL (ex: 1)
  fraisServiceParCaisse: number       // DH / caisse (gros+demi) (ex: 5)
}

export const DEFAULT_FRAIS_BL: FraisBlConfig = {
  fraisImpressionParFeuille: 0,
  nbFeuilles: 1,
  fraisServiceParCaisse: 0,
}

export interface BonLivraison {
  id: string
  date: string
  tripId: string
  commandeId: string          // back-compat — première commande regroupée
  commandeIds?: string[]      // TOUTES les commandes regroupées sur ce BL (1 client = 1 BL, jamais 2 clients différents)
  clientId?: string
  clientNom: string
  secteur: string
  zone: string
  livreurNom: string
  prevendeurNom: string
  lignes: LigneBL[]
  montantTotal: number
  tva: number
  montantTTC: number
  statut: "émis" | "encaissé" | "retour_partiel"
  statutLivraison: "livre" | "premier_passage" | "deuxieme_passage" | "retour"
  motifRetour?: string
  valideMagasinier?: boolean
  // Timing: heure effective de livraison enregistrée par le livreur
  heureLivraisonReelle?: string   // "HH:MM" — saisie par le livreur à la livraison
  heureEffective?: string         // alias legacy
  // Nombre de colis / tonnage livré
  nbColis?: number
  // Caisses — liees au ctrl prep ou saisie manuelle
  nbCaisseGros?: number           // nb grosses caisses livrees
  nbCaisseDemi?: number           // nb demi-caisses livrees
  montantCaisses?: number         // total DH caisses (gros × 70 + demi × 50)
  caissePricing?: CaissePricing   // tarif utilise pour ce BL
  // Frais supplementaires imprimes sur le BL
  fraisImpressionParFeuille?: number   // DH par feuille (ex: 2 DH/feuille)
  nbFeuilles?: number                  // nb de feuilles (defaut: 1)
  fraisServiceParCaisse?: number       // DH par caisse (gros + demi) (ex: 5 DH/caisse)
  // Facturation — id de la facture (fl_invoices) qui regroupe ce BL.
  // Présent => le BL a déjà été facturé et ne doit plus être re-regroupé.
  factureId?: string
}

export interface PurchaseOrder {
  id: string
  date: string
  articleId: string
  articleNom: string
  articleUnite: string
  fournisseurId: string
  fournisseurNom: string
  fournisseurEmail: string
  quantite: number
  prixUnitaire: number
  total: number
  statut: "ouvert" | "envoyé" | "receptionné" | "annulé"
  notes: string
  createdBy: string
  createdVia?: "mobile" | "backoffice" | "system"   // origine reelle de la creation — sert a scoper les suppressions "donnees mobile"
  // besoin calcul fields
  commandeQty?: number
  stockQty?: number
  retourQty?: number
  // payment tracking
  montantPaye?: number
  statutPaiement?: "impaye" | "partiel" | "solde"
  datePaiement?: string
  notePaiement?: string
  // Charges par article (coût de revient) — saisies/confirmées à l'achat
  chargeArticleId?: string
  chargesIds?: string[]                            // plusieurs charges par article (chariot, manutention…)
  chargesDetail?: { nom: string; montant: number }[]  // détail des charges retenues (pour affichage)
  chargeMontant?: number        // DH par unité = SOMME des charges retenues
  coutRevientUnitaire?: number  // prixUnitaire + chargeMontant
  totalCharges?: number         // chargeMontant × quantité
  // Multi-depot
  depotId?: string
  depotNom?: string
  // PO workflow — acheteur refusal tracking
  // A PO is auto-generated from besoinNet; each acheteur can accept or refuse it.
  // A DA (Demande d'Achat) is generated ONLY when ALL acheteurs have refused the PO.
  // If there is only one acheteur and they refuse, it also triggers DA.
  acheteurRefusals?: {
    acheteurId: string
    acheteurNom: string
    refusedAt: string
    motif?: string
  }[]
  totalAcheteurs?: number    // how many acheteurs were notified
  daGenere?: boolean         // true once DA has been auto-generated
  daId?: string              // reference to the generated DA
  genereAuto?: boolean       // true = auto-generated from besoinNet

  // ── Flux d'achat (conformité CGI Maroc — secteur fruits/légumes) ────────────
  // 3 circuits distincts, comptabilisés différemment :
  //  - marche_gros       : bordereau/carreau de gros, taxe communale 7% en
  //                        CHARGE (classe 6), jamais de TVA récupérable.
  //  - agriculteur_direct : auto-facturation interne, TVA 0% (exonéré),
  //                        nom + CIN agriculteur obligatoires.
  //  - societe_structuree : fournisseur avec ICE, TVA 0% (exonéré, fruits/
  //                        légumes frais non transformés).
  typeFlux?: "marche_gros" | "agriculteur_direct" | "societe_structuree"
  taxeCommunale?: number       // DH — 7% du total, marché de gros uniquement
  agriculteurNom?: string      // obligatoire si typeFlux = agriculteur_direct
  agriculteurCIN?: string      // obligatoire si typeFlux = agriculteur_direct
}

// Demande d'Achat (DA) — created automatically when all acheteurs refuse a PO
export interface DemandeAchat {
  id: string
  date: string
  poId: string               // source PO id
  articleId: string
  articleNom: string
  articleUnite: string
  quantite: number
  besoinNet: number
  statut: "ouverte" | "en_cours" | "traitee" | "annulee"
  createdBy: string          // "system" or user id
  notes?: string
  fournisseurId?: string
  fournisseurNom?: string
  // Acheteur assignment
  assigneA?: string          // acheteur id who will handle
  assigneNom?: string
  traiteeAt?: string
  // If partially filled
  quantiteAchetee?: number
  prixAchat?: number
  totalAchat?: number
}

export interface TransfertStock {
  id: string
  date: string
  articleId: string
  articleNom: string
  quantite: number
  sens: "conforme_vers_defect" | "defect_vers_conforme"
  motif: string
  operateurId: string
}

export interface Message {
  id: string
  senderId: string
  senderName: string
  role: UserRole
  text: string
  createdAt: string
  channel?: string        // fil de discussion ("general" par défaut ; "dm:..." ; "group:...")
  audience?: string[]     // rôles destinataires ; vide/absent = tout le monde
  toUserId?: string       // message DIRECT à une personne précise
  groupId?: string        // message de GROUPE
  readBy?: string[]       // ids des utilisateurs ayant lu
}

// Groupe de discussion (messagerie) — synchronisé via fl_notices id="__msg_groups".
export interface MessageGroup {
  id: string
  name: string
  memberIds: string[]     // membres (le créateur inclus)
  createdBy: string
  createdAt: string
}

// ── Depot (multi-entrepot) ────────────────────────────────────────────────────
export interface Depot {
  id: string
  nom: string
  adresse?: string
  ville?: string
  actif: boolean
  responsableNom?: string
  notes?: string
  // GPS & Circuit de livraison
  gpsLat?: number
  gpsLng?: number
  gpsAdresseComplete?: string
  circuitNom?: string            // Nom du circuit ex: "Zone Nord Casablanca"
  circuitOrdre?: number          // Ordre dans la tournée
  zoneCouverte?: string          // ex: "Maarif, Racine, Gauthier"
  heureOuverture?: string        // "06:00"
  heureFermeture?: string        // "22:00"
  capaciteKg?: number            // Capacité stockage kg
  telephone?: string
  email?: string
  typeDepot?: "principal" | "secondaire" | "transit" | "froid"
}

export const DEFAULT_DEPOT: Depot = {
  id: "DEPOT_PRINCIPAL",
  nom: "Depot Principal",
  actif: true,
}

export interface Notice {
  id: string
  titre: string
  contenu: string
  auteurId: string
  auteurNom: string
  date: string
  type: "notice" | "reclamation"
  statut: "ouvert" | "traité"
  destinataire: string
}

export type ModePreparation = "par_trip" | "par_client" | "par_article"
export type TypePreparation = "cross_dock" | "stockage"
export type FormatPreparation = "papier" | "numerique"

export interface LignePreparation {
  articleId: string
  articleNom: string
  unite: string
  // per client quantities keyed by clientId  (order = sequenced delivery order)
  qtesParClient: Record<string, number>
  // total commanded
  qteCommandee: number
  // what was actually picked (validated on tablet)
  qtePrepared: number
  valide: boolean
}

export type SequenceModePrep = "horaire" | "itineraire"

export interface ClientSequenceInfo {
  clientId: string
  clientNom: string
  secteur: string
  zone: string
  heurelivraison?: string   // requested delivery time
  ordre: number             // GPS route order (itinéraire)
  gpsLat?: number
  gpsLng?: number
}

export interface BonPreparation {
  id: string
  nom: string
  date: string
  mode: ModePreparation
  type: TypePreparation
  format: FormatPreparation
  tripId?: string
  clientIds: string[]
  // enriched client info for sequencing
  clientsInfo?: ClientSequenceInfo[]
  // sequencing mode chosen by dispatcher
  sequenceMode?: SequenceModePrep
  lignes: LignePreparation[]
  statut: "brouillon" | "en_cours" | "valide"
  createdBy: string
  validatedAt?: string
  validatedBy?: string
}

// ============================================================
// FINANCE TYPES
// ============================================================

export type PeriodeDistribution = "journalier" | "hebdomadaire" | "mensuel"

export interface Actionnaire {
  id: string
  nom: string
  prenom: string
  telephone?: string
  cotisation: number          // montant investi (DH)
  dateEntree: string          // date of entry
  periodeDistribution: PeriodeDistribution
  actif: boolean
}

export type CategorieCharge =
  | "transport" | "equipement" | "salaire" | "loyer" | "energie"
  | "maintenance" | "communication" | "assurance" | "impots" | "autre"

export const CATEGORIE_CHARGE_LABELS: Record<CategorieCharge, string> = {
  transport: "Transport (Honda, chario, véhicule)",
  equipement: "Equipement (balance, caisses, frigo)",
  salaire: "Salaires & charges sociales",
  loyer: "Loyer & charges locatives",
  energie: "Eau, Electricité, Gaz",
  maintenance: "Maintenance & réparations",
  communication: "Communication & internet",
  assurance: "Assurance",
  impots: "Impôts & taxes",
  autre: "Autres charges",
}

export interface Charge {
  id: string
  date: string
  libelle: string             // description libre
  categorie: CategorieCharge
  montant: number             // DH
  recurrente: boolean         // mensuelle / ponctuelle
  createdBy: string
}

export interface CaisseEntry {
  id: string
  date: string
  libelle: string
  type: "entree" | "sortie"
  categorie: "vente" | "achat" | "charge" | "salaire" | "distribution_actionnaire" | "reserve_caisse" | "autre"
  montant: number
  reference?: string         // BL ref, bon achat ref...
  createdBy: string
}

// Historique des reserves caisse par actionnaire
export interface ReserveCaisseSnap {
  id: string
  date: string
  periode: string            // ex: "2025-03"
  beneficeNet: number
  tauxReserve: number
  montantReserve: number
  repartition: { actionnaireId: string; nom: string; prenom: string; part: number; montant: number }[]
  createdBy: string
}

// Salaries
export type StatutSalarie = "actif" | "conge" | "periode_essai" | "inactif"
export type TypeContrat = "cdi" | "cdd" | "interim" | "saisonnier"

export const STATUT_SALARIE_LABELS: Record<StatutSalarie, string> = {
  actif:         "Actif",
  conge:         "En conge",
  periode_essai: "Periode d'essai",
  inactif:       "Inactif",
}

export const TYPE_CONTRAT_LABELS: Record<TypeContrat, string> = {
  cdi:       "CDI — Contrat a Duree Indeterminee",
  cdd:       "CDD — Contrat a Duree Determinee",
  interim:   "Interim",
  saisonnier:"Contrat Saisonnier",
}

export interface Salarie {
  id: string
  civilite: Civilite           // M. ou Mme (obligatoire)
  nom: string
  prenom: string
  poste: string
  departement?: string
  telephone?: string
  email?: string
  adresse?: string
  ville?: string
  cin?: string                 // Carte Nationale d'Identite
  cnss?: string                // Numero affiliation CNSS
  numCompteBancaire?: string   // RIB / IBAN
  banque?: string              // Nom de la banque
  dateEmbauche: string
  datefinCdd?: string          // pour CDD — date fin de contrat
  typeContrat: TypeContrat
  salaireBrut: number          // DH brut mensuel
  salaireNet?: number          // DH net (calcule automatiquement si vide)
  avances: number              // avances sur salaire DH
  modePaiement?: "virement" | "cheque" | "especes"
  nationalite?: string
  dateNaissance?: string
  lieuNaissance?: string
  diplome?: string
  experienceAns?: number
  statutFamilial?: "celibataire" | "marie" | "divorce" | "veuf"
  nbEnfants?: number
  statut: StatutSalarie
  notes?: string
  // Metadata
  createdBy: string
  createdAt: string
  updatedBy?: string
  updatedAt?: string
  // Dossier administratif complet (RH doit remplir apres creation par admin)
  dossierComplet?: boolean
}

// ── RH Notification — admin cree un user, RH doit completer le dossier ─────
export type RHNotifType = "nouveau_salarie" | "dossier_incomplet" | "contrat_expire" | "conge_demande"

export interface RHNotification {
  id: string
  type: RHNotifType
  titre: string
  message: string
  salarieId?: string
  salarieNom?: string
  userId?: string      // user systeme lie
  createdBy: string    // qui a declenche la notif
  createdAt: string
  lu: boolean          // vu par RH
  traite: boolean      // traite par RH
}

export interface PaiementSalaire {
  id: string
  salarieId: string
  salarieNom: string
  mois: string               // "2025-03"
  salaireBrut: number
  avance: number
  salaireNet: number
  datePaiement: string
  createdBy: string
}

// ── Retenue Caisse Acheteur → RH ──────────────────────────────────────────────
// Écart de caisse positif transmis à la RH : à déduire automatiquement du salaire.
export interface RetenueCaisse {
  id: string
  acheteurNom: string
  mois: string               // "2026-06" (déduction sur ce mois de paie)
  montant: number            // DH à déduire (écart positif)
  date: string               // date de transmission RH
  ref: string                // clé unique de la ligne caisse (anti-doublon)
}

// ── Transport Company ─────────────────────────────────────────────────────────
export interface TransportCompany {
  id: string
  nom: string
  ice?: string           // Identifiant Commun Entreprise (20 chiffres)
  patente?: string
  rc?: string
  if_fiscal?: string
  tp?: string
  cnss?: string
  telephone?: string
  email?: string
  adresse?: string
  ville?: string
  contact?: string
  actif: boolean
  notes?: string
  // Auto-entrepreneur fields
  isAutoEntrepreneur?: boolean
  ribBancaire?: string
  banque?: string
  // Driver / Vehicle documents (URLs or base64)
  photoConducteur?: string    // Photo du conducteur
  scanPermis?: string         // Scan du permis de conduire
  scanCarteGrise?: string     // Scan de la carte grise
  scanCin?: string            // Scan de la CIN
  dateExpiryPermis?: string   // Date d'expiration permis
  dateExpiryAssurance?: string
  typeVehicule?: string       // ex: "Camion frigo 3.5T", "Utilitaire", "Fourgon"
  immatriculation?: string
  capaciteKg?: number
  tarifKm?: number
  tarifCaisse?: number
  // Link to internal user (livreur)
  userId?: string
}

export interface CompanyConfig {
  nom: string
  adresse: string
  ville: string
  pays: string
  telephone: string
  email: string
  siteWeb?: string
  ice?: string                 // Identifiant commun entreprise Maroc
  rc?: string                  // Registre de commerce
  if_fiscal?: string           // Identifiant fiscal
  tp?: string                  // Taxe professionnelle
  patente?: string             // Patente / Taxe professionnelle
  cnss?: string
  logo?: string                // base64 ou URL — used in sidebar + documents
  couleurEntete?: string
  mentionsBL?: string
  mentionsFacture?: string
  // ── Application branding ──────────────────────────────────────
  appName?: string             // Display name in sidebar/login (default: FreshLink Pro)
  appSlogan?: string           // Sub-label in sidebar (default: company nom)
}

// ── Coordonnées publiques — synchronisées avec Supabase ───────
export interface CompanyContacts {
  // Téléphones
  tel_principal?: string
  tel_secondaire?: string
  tel_urgence?: string
  // WhatsApp
  whatsapp_principal?: string
  whatsapp_commercial?: string
  whatsapp_livraison?: string
  // Emails
  email_principal?: string
  email_commercial?: string
  email_comptabilite?: string
  email_rh?: string
  // Adresse postale
  adresse_ligne1?: string
  adresse_ligne2?: string
  code_postal?: string
  ville?: string
  pays?: string
  // Réseaux sociaux
  instagram?: string
  facebook?: string
  linkedin?: string
  tiktok?: string
  // Horaires
  horaires_ouverture?: string
  horaires_livraison?: string
  zone_livraison?: string
  // GPS siège
  gps_lat?: number
  gps_lng?: number
}

// ── BPM Workflow Steps ────────────────────────────────────────────────────────
// Each step can be enabled/disabled independently. Gate steps can be bypassed.
export interface WorkflowStep {
  id: string
  label: string
  labelAr: string
  description: string
  enabled: boolean        // false = step is skipped entirely
  canBypass: boolean      // true = admin can mark "bypass" in Settings
  bypassed?: boolean      // true = step is currently bypassed by admin
  mandatory: boolean      // true = cannot be disabled (e.g. Order Placement)
  gate?: boolean          // true = this is a quality control gate step
}

export interface WorkflowConfig {
  // "direct" = commande auto-validée, "responsable" = besoin resp_commercial/admin, "admin" = besoin admin/super_admin
  validationCommande: WorkflowValidation
  // BPM — 9 process steps
  steps: WorkflowStep[]
}

// ── Process Config — choix du mode opératoire ─────────────────────────────────
// "prevendeur_direct"  → Prévendeur saisit + valide directement (pas besoin de logistique)
// "prevendeur_logistique" → Prévendeur saisit, Logistique valide et imprime BL
// "commercial_classique" → Commercial saisit, Resp commercial approuve, Logistique prépare
// "full_process"       → Processus complet : Commande → Achat → Réception → Prépa → Livraison
export type ProcessMode =
  | "prevendeur_direct"
  | "prevendeur_logistique"
  | "commercial_classique"
  | "full_process"

export interface ProcessConfig {
  mode: ProcessMode
  enableAchat: boolean           // Module achat activé
  enableReception: boolean       // Réception marchandise activée
  enablePreparation: boolean     // Préparation commandes activée
  enableLogistiqueValidation: boolean  // Logistique doit valider avant livraison
  enableBLPrint: boolean         // Impression BL obligatoire
  enableTripDispatch: boolean    // Dispatch tournées activé
  enableCaisse: boolean          // Module caisse/cash activé
  enableQualiteControle: boolean // Contrôle qualité activé
  // New control steps (activatable per process)
  enableControlAchat: boolean    // Contrôle achat (ctrl_achat scanne la marchandise achetée)
  enableControlPreparation: boolean // Contrôle préparation (ctrl_prep vérifie colis avant chargement)
  enableControlExpedition: boolean  // Contrôle expédition (ctrl_exp vérifie avant départ camion)
  // Dispatch commandes — optionnel selon process
  enableDispatchCommandes: boolean  // Le dispatcheur affecte les commandes aux trips
  // Camera toggles per stage
  cameraReception?: boolean      // Camera autorisée pour réception
  cameraPreparation?: boolean    // Camera autorisée pour préparation
  cameraLivraison?: boolean      // Camera autorisée pour livraison
  cameraControlAchat?: boolean   // Camera autorisée pour contrôle achat
  cameraControlPrep?: boolean    // Camera autorisée pour contrôle préparation
  cameraRetour?: boolean         // Camera autorisée pour retours
  cameraSignature?: boolean      // Camera pour photo signature
  // Photo marchandise obligatoire pour confirmer un achat (mobile acheteur).
  // false = la photo devient facultative. Défaut: true (comportement actuel).
  photoAchatObligatoire?: boolean
  // Mode crossdocking : commercial saisit → acheteur (PO) → logistique prépare/valide/charge
  // → rapport d'écart achat vs préparation → livraison → passage cash-man en fin de livraison
  modeCrossdocking?: boolean
  notes?: string
  // Familles d'articles personnalisées (créées depuis Catalogue Produits /
  // Gestion des Familles). Stockées ici (et non dans leur propre clé locale)
  // pour beneficier gratuitement du meme mecanisme de sync cross-appareil que
  // le reste de ProcessConfig — sinon une famille creee sur un appareil
  // restait invisible des autres, source de doublons/confusion (ex: "Herbes"
  // vs "Herbes aromatiques" saisis independamment).
  famillesCustom?: string[]
  // Familles "supprimées" par l'utilisateur (prédéfinies masquées ou perso
  // retirées) — voir getAllFamilles/desactiverFamille dans ce fichier.
  famillesDesactivees?: string[]
}

export const DEFAULT_PROCESS_CONFIG: ProcessConfig = {
  mode: "prevendeur_logistique",
  enableAchat: true,
  enableReception: true,
  enablePreparation: true,
  enableLogistiqueValidation: true,
  enableBLPrint: true,
  enableTripDispatch: true,
  enableCaisse: true,
  enableQualiteControle: false,
  enableControlAchat: false,
  enableControlPreparation: false,
  enableControlExpedition: false,
  enableDispatchCommandes: true,
  cameraReception: true,
  cameraPreparation: true,
  cameraLivraison: true,
  cameraControlAchat: true,
  cameraControlPrep: true,
  cameraRetour: true,
  cameraSignature: true,
  photoAchatObligatoire: true,
  modeCrossdocking: false,
}

// ── Fiscalité & Fiduciaire (Maroc) — taux configurables, à valider avec le
// fiduciaire avant toute déclaration réelle. Le module BOFiscalite les
// applique aux données réelles de l'ERP (CA, tonnage, masse salariale).
export interface FiscalConfig {
  tauxTVA: number                    // % — 0 par défaut : fruits/légumes frais non transformés = hors champ TVA (CGI Maroc)
  tauxCotisationMinimale: number     // % du CA HT — plancher IS (~0.25 à 0.5%)
  tauxChargesPatronales: number      // % du brut — CNSS+AMO+formation patronales (~20-21%)
  seuilAlerteMasseSalariale: number  // % — ratio masse salariale/CA au-delà duquel on alerte
  joursOuvresParMois: number         // pour l'extrapolation CA/tonnage
  tauxDroitTimbre: number            // % du TTC — droit de timbre 0,25% sur règlement espèces (CGI Maroc)
  plafondCashAchatJour: number       // DH/jour/fournisseur — seuil de déductibilité fiscale des achats espèces
  plafondCashVenteFacture: number    // DH/facture/client — plafond légal cash sur les ventes
}

export const DEFAULT_FISCAL_CONFIG: FiscalConfig = {
  tauxTVA: 0,
  tauxCotisationMinimale: 0.5,
  tauxChargesPatronales: 20.5,
  seuilAlerteMasseSalariale: 20,
  joursOuvresParMois: 26,
  tauxDroitTimbre: 0.25,
  plafondCashAchatJour: 5000,
  plafondCashVenteFacture: 10000,
}

export const DEFAULT_WORKFLOW_STEPS: WorkflowStep[] = [
  {
    id: "order_placement",
    label: "Prise de Commande",
    labelAr: "استلام الطلب",
    description: "Verification du stock virtuel disponible. Si stock insuffisant, declenchement d'une Demande d'Achat (DA) automatique.",
    enabled: true, mandatory: true, canBypass: false,
  },
  {
    id: "procurement",
    label: "Achat Marche de Gros",
    labelAr: "الشراء من سوق الجملة",
    description: "L'acheteur se rend au marche de gros pour acheter les quantites manquantes selon la DA.",
    enabled: true, mandatory: true, canBypass: false,
  },
  {
    id: "market_qc",
    label: "Controle Qualite Marche (Porte 1)",
    labelAr: "مراقبة الجودة عند الشراء",
    description: "Verification qualite des produits achetes avant chargement. Ce controle peut etre contourne en mode urgence.",
    enabled: true, mandatory: false, canBypass: true, bypassed: false, gate: true,
  },
  {
    id: "transfer",
    label: "Transfert vers Entrepot",
    labelAr: "النقل إلى المستودع",
    description: "Transport des produits du marche vers l'entrepot / depot de distribution.",
    enabled: true, mandatory: false, canBypass: false,
  },
  {
    id: "receiving",
    label: "Reception & Tri Entrepot",
    labelAr: "الاستلام والفرز",
    description: "Reception physique en entrepot, pesee, tri par qualite et affectation aux commandes.",
    enabled: true, mandatory: false, canBypass: false,
  },
  {
    id: "preparation",
    label: "Preparation (Picking & Packing)",
    labelAr: "التحضير والتعبئة",
    description: "Preparation des commandes selon bons de preparation: picking par client, packing et etiquetage.",
    enabled: true, mandatory: false, canBypass: false,
  },
  {
    id: "loading_qc",
    label: "Controle Chargement (Porte 2)",
    labelAr: "مراقبة التحميل",
    description: "Verification qualite et quantite avant chargement sur camion. Peut etre contourne si operateurs certifies.",
    enabled: true, mandatory: false, canBypass: true, bypassed: false, gate: true,
  },
  {
    id: "delivery",
    label: "Livraison & Validation (Preuve)",
    labelAr: "التسليم والتحقق",
    description: "Livraison au client, signature electronique ou photo preuve de livraison, gestion des retours sur place.",
    enabled: true, mandatory: true, canBypass: false,
  },
  {
    id: "cash_collection",
    label: "Retour Fonds (Cash Collection)",
    labelAr: "تحصيل المبالغ",
    description: "Remise des fonds collectes aupres des clients au cash man. Reconciliation en fin de journee.",
    enabled: true, mandatory: false, canBypass: false,
  },
]

// ── Granular RBAC Permissions ────────────────────────────────────────────────
// Each permission is a COMPLETELY INDEPENDENT boolean — no auto-grouping
export interface GranularPermissions {
  // Commercial
  perm_view_commercial?: boolean
  perm_create_order?: boolean
  perm_edit_order?: boolean
  perm_delete_order?: boolean
  perm_view_clients?: boolean
  perm_create_client?: boolean
  perm_edit_client?: boolean
  perm_delete_client?: boolean
  perm_view_price?: boolean
  perm_edit_price?: boolean     // CAN modify sales price
  perm_apply_discount?: boolean // CAN grant discounts
  perm_view_margin?: boolean    // CAN see PA/marge (managers only)
  // Achat
  perm_view_achat?: boolean
  perm_create_bon_achat?: boolean
  perm_edit_bon_achat?: boolean
  perm_validate_achat?: boolean
  // Logistique
  perm_view_logistique?: boolean
  perm_create_trip?: boolean
  perm_validate_trip?: boolean
  perm_view_livraison?: boolean
  perm_validate_bl?: boolean
  perm_manage_retour?: boolean
  // Workflow gates — bypass permissions
  perm_bypass_market_qc?: boolean   // can skip Gate 1 (market quality control)
  perm_bypass_loading_qc?: boolean  // can skip Gate 2 (loading control)
  // Stock
  perm_view_stock?: boolean
  perm_edit_stock?: boolean
  perm_do_inventaire?: boolean
  // Finance & Cash
  perm_view_cash?: boolean
  perm_validate_cash?: boolean
  perm_view_finance?: boolean
  perm_view_recap?: boolean
  // Admin
  perm_view_database?: boolean
  perm_manage_users?: boolean
  perm_manage_workflow?: boolean
  perm_view_rh?: boolean
}

// ── Inventory Log ─────────────────────────────────────────────────────────────
export type InventoryLogType =
  | "reception"       // stock added after reception
  | "commande"        // stock decremented when order placed
  | "retour"          // stock re-integrated after return
  | "transfert"       // moved between depots
  | "ajustement"      // manual admin adjustment
  | "perte"           // loss/waste declaration
  | "inventaire"      // physical inventory count

export interface InventoryLog {
  id: string
  date: string
  time?: string
  articleId: string
  articleNom: string
  type: InventoryLogType
  quantiteBefore: number
  delta: number             // positive = added, negative = removed
  quantiteAfter: number
  referenceDoc?: string     // commandeId, bonAchatId, receptionId...
  operateurId: string
  operateurNom: string
  motif?: string
  depotId?: string
}

// ── Price Entry — price survey for fournisseurs and clients ───────────────────
export type PriceEntryType = "fournisseur" | "client"
export type PriceSource    = "visite" | "telephone" | "whatsapp" | "email" | "marche" | "autre"
export type PriceEvolution = "hausse" | "baisse" | "stable"

export interface PriceEntry {
  id: string
  createdAt: string
  updatedAt: string
  // Article
  articleId?: string
  articleNom: string
  categorie: string
  // Source type
  type: PriceEntryType
  // Fournisseur (when type === "fournisseur")
  fournisseurNom?: string
  fournisseurTel?: string
  region?: string
  marche?: string
  // Client (when type === "client")
  clientNom?: string
  clientTel?: string
  clientRegion?: string
  // Price details
  prixUnitaire: number
  unite: string
  prixMin?: number           // negotiated floor
  prixMax?: number           // ceiling / posted price
  qualiteGrade?: string      // A+ A B C
  // Context
  source: PriceSource
  date: string               // ISO date YYYY-MM-DD
  notes?: string
  // Trend vs previous entry for same article+type
  prixPrecedent?: number
  evolution?: PriceEvolution
  // Metadata
  userId: string
  userName: string
}

// ── Sourcing Entry — agent sourcing marketplace data ──────────────────────────
export type SourcingStatut = "disponible" | "epuise" | "commande" | "annule"
export type SourcingGrade  = "A+" | "A" | "B" | "C"

export interface SourcingEntry {
  id: string
  createdAt: string
  updatedAt: string
  // Article
  articleId?: string           // optional link to catalog
  articleNom: string           // free text name (mandatory)
  categorie: string            // Légumes, Fruits, Herbes, Agrumes...
  // Supplier
  fournisseurId?: string       // lien optionnel vers fl_fournisseurs
  fournisseurNom: string
  fournisseurTel?: string
  fournisseurContact?: string  // contact person name
  // Produit/fournisseur HORS liste → proposés, à valider par un admin avant ajout
  // aux catalogues (le relevé reste utilisable, mais rien n'est créé sans approbation)
  produitAValider?: boolean
  fournisseurAValider?: boolean
  // Location
  region: string               // city/region (Casablanca, Agadir, Marrakech...)
  marche: string               // souk/market name
  adresse?: string
  gpsLat?: number
  gpsLng?: number
  // Pricing & Quantity
  prixUnitaire: number         // price per unit in MAD
  prixNegociable: boolean
  prixMin?: number             // min negotiated price
  unite: string                // kg, unité, caisse, palette, t
  quantiteDisponible: number
  quantiteMin?: number         // minimum order quantity
  qualiteGrade: SourcingGrade
  // Media
  photoUrls?: string[]         // base64 or URL (up to 4 photos)
  // Availability
  disponibleJusquA?: string    // ISO date
  delaiLivraison?: string      // "J+1", "24h", "immédiat"
  // Metadata
  notes?: string
  userId: string
  userName: string
  statut: SourcingStatut
}

// ── Client Smart Basket ───────────────────────────────────────────────────────
export interface ClientBasket {
  clientId: string
  clientNom: string
  generatedAt: string     // ISO date
  aiSuggested: boolean    // true = AI generated, false = manually saved
  lignes: {
    articleId: string
    articleNom: string
    quantiteHabituelle: number   // average qty from last 5+ orders
    unite: string
    prixVente: number
    frequence: number            // how many times ordered in last 30 orders
    dernierAchat?: string
  }[]
  notes?: string
}

export interface EmailConfig {
  achat: string
  commercial: string
  recap: string
  besoinAchat: string
  recapHeure: string
  recapAuto: boolean
  besoinAuto: boolean
  besoinHeure: string
  // Besoin achat push — delay in minutes before sending to acheteur mobile after commande validated
  besoinDelaiMinutes: number   // default 0 = immediate, configurable up to 480 min (8h)
  besoinPushAuto: boolean      // if true, notify acheteur mobile automatically
  // Multi-address support — extra CC/BCC recipients
  achatCC?: string[]
  commercialCC?: string[]
  recapCC?: string[]
  // Livreur pay config
  tarifKmLivreur: number        // DH per km — default 0.45
  prixCarburantL?: number       // prix du litre de carburant (DH) — pour l'estimation conso
  tarifCaisseLivreur: number    // DH per caisse — default 0.80
  tarifClientLivreur: number    // DH per client — default 2.50
  primePonctualite: number      // bonus ponctualité — default 30
  // Custom primes for any role
  customPrimes: {
    id: string
    label: string
    role: string
    montant: number
    condition: string          // ex: "Taux service ≥ 95%"
    type: "bonus" | "malus"
    actif: boolean
  }[]
}

// ============================================================
// ROLE / APP CONFIG
// ============================================================

export const ROLE_LABELS: Record<UserRole, string> = {
  super_super_admin: "Super Administrateur",
  super_admin: "Super Admin",
  admin: "Admin",
  resp_commercial: "Resp. Commercial",
  team_leader: "Team Leader",
  prevendeur: "Prevendeur",
  resp_logistique: "Resp. Logistique",
  magasinier: "Magasinier",
  dispatcheur: "Dispatcheur",
  livreur: "Livreur",
  acheteur: "Acheteur",
  ctrl_achat: "Controleur Achat",
  ctrl_prep: "Controleur Prep",
  cash_man: "Cash Man",
  financier: "Financier",
  rh_manager: "Responsable RH",
  comptable: "Comptable",
  client: "Client",
  client_proprietaire: "Propriétaire CHR",
  client_gerant: "Gérant CHR",
  fournisseur: "Fournisseur",
  investisseur: "Investisseur",
  qualite: "Responsable Qualité",
  it_admin: "Administrateur IT",
  auditeur: "Auditeur",
  chef_depot: "Chef de Dépôt",
  resp_achat: "Resp. Achats",
  suivi_commande: "Suivi Commandes",
  charge_recouvrement: "Chargé Recouvrement",
}

export const ROLE_LABELS_AR: Record<UserRole, string> = {
  super_super_admin: "المدير الأعلى",
  super_admin: "المدير العام",
  admin: "المسؤول",
  resp_commercial: "مسؤول التجاري",
  team_leader: "قائد الفريق",
  prevendeur: "البائع المتجول",
  resp_logistique: "مسؤول اللوجستيك",
  magasinier: "أمين المخزن",
  dispatcheur: "موزع الرحلات",
  livreur: "السائق",
  acheteur: "المشتري",
  ctrl_achat: "مراقب الشراء",
  ctrl_prep: "مراقب التحضير",
  cash_man: "أمين الصندوق",
  financier: "المالي",
  rh_manager: "مسؤول الموارد البشرية",
  comptable: "المحاسب",
  client: "الزبون",
  client_proprietaire: "مالك المؤسسة",
  client_gerant: "مدير المؤسسة",
  fournisseur: "المورد",
  investisseur: "المستثمر",
  qualite: "مسؤول الجودة",
  it_admin: "مسؤول تقنية المعلومات",
  auditeur: "المدقق",
  chef_depot: "رئيس المستودع",
  resp_achat: "مسؤول المشتريات",
  suivi_commande: "متابعة الطلبيات",
  charge_recouvrement: "مسؤول التحصيل",
}

export const ROLE_COLORS: Record<UserRole, string> = {
  super_super_admin: "bg-yellow-500",
  super_admin: "bg-violet-600",
  admin: "bg-indigo-600",
  resp_commercial: "bg-blue-600",
  team_leader: "bg-cyan-600",
  prevendeur: "bg-green-600",
  resp_logistique: "bg-orange-600",
  magasinier: "bg-amber-600",
  dispatcheur: "bg-rose-600",
  livreur: "bg-yellow-600",
  acheteur: "bg-lime-700",
  ctrl_achat: "bg-sky-700",
  ctrl_prep: "bg-violet-700",
  cash_man: "bg-emerald-600",
  financier: "bg-purple-600",
  rh_manager: "bg-fuchsia-600",
  comptable: "bg-indigo-700",
  client: "bg-teal-600",
  client_proprietaire: "bg-teal-700",
  client_gerant: "bg-teal-500",
  fournisseur: "bg-slate-600",
  investisseur: "bg-yellow-600",
  qualite: "bg-red-600",
  it_admin: "bg-indigo-800",
  auditeur: "bg-slate-700",
  chef_depot: "bg-orange-700",
  resp_achat: "bg-lime-700",
  suivi_commande: "bg-cyan-700",
  charge_recouvrement: "bg-rose-800",
}

/** Familles détaillées (pour fiches articles et stock) */
export const FAMILLES_ARTICLES = [
  // Légumes
  "Légumes feuilles", "Légumes racines", "Légumes fruits",
  // Fruits
  "Fruits tropicaux", "Fruits rouges", "Agrumes", "Fruits secs",
  // Herbes
  "Herbes aromatiques", "Champignons",
  // Autres
  "Autre",
  // Produits transformés (après préparation)
  "Épluché", "Lavé", "Coupé", "Prêt pour cuisson", "Emballé",
]

/** Secteurs de vente (zones commerciales) — listes déroulantes création client */
export const SECTEURS_VENTE = [
  "Anfa", "Maârif", "Sidi Maârouf", "Aïn Sebaâ", "Hay Hassani", "Derb Sultan",
  "Sidi Bernoussi", "Roches Noires", "Oulfa", "Sbata", "Ben M'sick",
  "Centre-ville", "Nord", "Centre", "Sud", "Est", "Ouest",
]

/** Villes du Maroc — liste déroulante création client */
export const VILLES_MAROC = [
  "Casablanca", "Mohammedia", "Rabat", "Salé", "Témara", "Kénitra",
  "Marrakech", "Tanger", "Fès", "Meknès", "Agadir", "Oujda", "Tétouan",
  "Safi", "El Jadida", "Berrechid", "Settat", "Nador", "Khouribga", "Beni Mellal",
]

/** 5 groupes d'affichage → familles détaillées */
export const FAMILLE_GROUPES: Record<string, string[]> = {
  "Légumes":      ["Légumes feuilles", "Légumes racines", "Légumes fruits"],
  "Fruits":       ["Fruits tropicaux", "Fruits rouges", "Agrumes", "Fruits secs"],
  "Herbes":       ["Herbes aromatiques", "Champignons"],
  "Autres":       ["Autre"],
  "Transformés":  ["Épluché", "Lavé", "Coupé", "Prêt pour cuisson", "Emballé"],
}

/** Retourne le groupe parent d'une famille détaillée */
export function getFamilleGroupe(famille: string): string {
  for (const [groupe, familles] of Object.entries(FAMILLE_GROUPES)) {
    if (familles.includes(famille)) return groupe
  }
  return "Autres"
}

// ── Familles personnalisées (créées par l'utilisateur) ─────────────────────────
// Stockées dans ProcessConfig (fl_process_config) — deja synchronise
// cross-appareil via autoSync, contrairement a l'ancienne cle locale
// fl_familles_custom qui restait piegee sur l'appareil ou elle etait creee.
export function getCustomFamilles(): string[] {
  if (typeof window === "undefined") return []
  return store.getProcessConfig().famillesCustom ?? []
}
/** Ajoute une famille perso (si pas déjà présente, insensible à la casse) → liste à jour */
export function addCustomFamille(nom: string): string[] {
  const f = String(nom ?? "").trim()
  const cur = getCustomFamilles()
  if (!f) return cur
  const exists = [...FAMILLES_ARTICLES, ...cur].some(x => x.toLowerCase() === f.toLowerCase())
  if (exists) return cur
  const next = [...cur, f]
  store.saveProcessConfig({ ...store.getProcessConfig(), famillesCustom: next })
  return next
}
export function removeCustomFamille(nom: string): string[] {
  const next = getCustomFamilles().filter(x => x !== nom)
  store.saveProcessConfig({ ...store.getProcessConfig(), famillesCustom: next })
  return next
}
// ── Familles désactivées ("supprimées") — s'applique aussi bien aux familles
// prédéfinies (constantes en dur, donc "supprimer" = masquer de la liste) qu'aux
// familles perso. Une famille encore utilisée par un article reste toujours
// visible (voir getAllFamilles) même si elle est dans cette liste — la
// suppression réelle est bloquée tant que des articles l'utilisent (BOFamilles).
export function getFamillesDesactivees(): string[] {
  if (typeof window === "undefined") return []
  return store.getProcessConfig().famillesDesactivees ?? []
}
export function desactiverFamille(nom: string): string[] {
  const cur = getFamillesDesactivees()
  if (cur.includes(nom)) return cur
  const next = [...cur, nom]
  store.saveProcessConfig({ ...store.getProcessConfig(), famillesDesactivees: next })
  return next
}
export function reactiverFamille(nom: string): string[] {
  const next = getFamillesDesactivees().filter(x => x !== nom)
  store.saveProcessConfig({ ...store.getProcessConfig(), famillesDesactivees: next })
  return next
}

/** Toutes les familles : prédéfinies + perso + celles déjà utilisées par des articles, moins celles désactivées */
export function getAllFamilles(usedFamilles: string[] = []): string[] {
  const used = usedFamilles.filter(Boolean)
  const desactivees = new Set(getFamillesDesactivees())
  const set = new Set<string>([...FAMILLES_ARTICLES, ...getCustomFamilles(), ...used])
  return [...set].filter(f => !desactivees.has(f) || used.includes(f))
}

// ── Secteurs = Zones unifiés (source de vérité unique mobile/BO/shop) ─────────
// On unifie « secteur » (commercial) et « zone » (livraison) : un seul libellé
// fait foi. Les secteurs perso sont partagés via Supabase (autoSync upsert LS).
const LS_SECTEURS_CUSTOM = "fl_secteurs_custom"
export function getCustomSecteurs(): string[] {
  if (typeof window === "undefined") return []
  try { return JSON.parse(localStorage.getItem(LS_SECTEURS_CUSTOM) ?? "[]") } catch { return [] }
}
/** Ajoute un secteur/zone perso (si absent, insensible à la casse) → liste à jour */
export function addCustomSecteur(nom: string): string[] {
  const s = String(nom ?? "").trim()
  const cur = getCustomSecteurs()
  if (!s) return cur
  if ([...SECTEURS_VENTE, ...cur].some(x => x.toLowerCase() === s.toLowerCase())) return cur
  const next = [...cur, s]
  try { localStorage.setItem(LS_SECTEURS_CUSTOM, JSON.stringify(next)) } catch { /* noop */ }
  return next
}
export function removeCustomSecteur(nom: string): string[] {
  const next = getCustomSecteurs().filter(x => x !== nom)
  try { localStorage.setItem(LS_SECTEURS_CUSTOM, JSON.stringify(next)) } catch { /* noop */ }
  return next
}
/** Tous les secteurs/zones : prédéfinis + perso + ceux déjà utilisés (clients) */
export function getAllSecteurs(usedSecteurs: string[] = []): string[] {
  const set = new Set<string>([...SECTEURS_VENTE, ...getCustomSecteurs(), ...usedSecteurs.filter(Boolean)])
  return [...set]
}

// ── Verrou d'édition (anti-falsification des pièces : BL, factures) ───────────
// super_super_admin : toujours autorisé. Sinon :
//  • date seule "YYYY-MM-DD" → éditable uniquement le jour même
//  • horodatage ISO complet  → éditable dans la fenêtre (défaut 30 min)
export function canEditRecord(dateOrIso: string | undefined, user: User, windowMin = 30): boolean {
  if (isSuperSuperAdmin(user)) return true
  if (!dateOrIso) return false
  const s = String(dateOrIso)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s === new Date().toISOString().slice(0, 10)
  const t = new Date(s).getTime()
  if (isNaN(t)) return false
  return (Date.now() - t) <= windowMin * 60_000
}

export function isMobileRole(role: UserRole): boolean {
  return ["prevendeur", "resp_logistique", "magasinier", "dispatcheur", "livreur", "acheteur", "ctrl_achat", "ctrl_prep", "client", "fournisseur", "chef_depot", "suivi_commande"].includes(role)
}

export const JAWAD_USER: User = {
  id: JAWAD_ID,
  name: "Jawad",
  email: "jawad@vita-fresh.ma",
  telephone: "0647333456",
  password: "Medghaly@22",
  role: "super_super_admin",
  actif: true,
  canViewAchat: true, canViewCommercial: true, canViewLogistique: true,
  canViewStock: true, canViewCash: true, canViewFinance: true, canViewRecap: true,
  canViewDatabase: true, canViewExternal: true, canCreateCommandeBO: true, canViewRH: true, canViewInvestisseur: true,
  notifAchat: true, notifCommercial: true, notifLivraison: true, notifRecap: true, notifBesoinAchat: true,
}

export function isBackOfficeRole(role: UserRole): boolean {
  return ["super_super_admin", "super_admin", "admin", "resp_commercial", "team_leader", "cash_man", "financier", "rh_manager", "comptable", "investisseur", "qualite", "it_admin", "auditeur", "resp_achat", "charge_recouvrement"].includes(role)
}

// Returns which interface a user should see based on accessType override or default role routing
export function getUserInterface(user: User): "mobile" | "backoffice" | "both" {
  if (user.accessType) return user.accessType
  return isBackOfficeRole(user.role) ? "backoffice" : "mobile"
}

// ============================================================
// DEFAULT DATA
// ============================================================

const DEFAULT_USERS: User[] = [
  JAWAD_USER,
  // === BACKOFFICE ===
  {
    id: "VFU00002", name: "Super Admin", email: "admin@freshlink.ma", password: "admin2024",
    role: "super_admin", actif: true,
    canViewAchat: true, canViewCommercial: true, canViewLogistique: true,
    canViewStock: true, canViewCash: true, canViewFinance: true, canViewRecap: true, canViewDatabase: true,
    canViewExternal: true, canCreateCommandeBO: true,
    notifAchat: true, notifCommercial: true, notifLivraison: true, notifRecap: true, notifBesoinAchat: true,
  },
  {
    id: "VFU00003", name: "Directeur", email: "directeur@freshlink.ma", password: "admin1234",
    role: "admin", actif: true,
    canViewAchat: true, canViewCommercial: true, canViewLogistique: true,
    canViewStock: true, canViewCash: true, canViewFinance: true, canViewRecap: true, canViewDatabase: true,
    canViewExternal: true, canCreateCommandeBO: true,
    notifAchat: true, notifRecap: true,
  },
  {
    id: "VFU00004", name: "Resp. Commercial", email: "responsable@freshlink.ma", password: "1234",
    role: "resp_commercial", actif: true,
    canViewCommercial: true, canViewCash: true, canViewRecap: true,
    canViewExternal: true, canCreateCommandeBO: true,
    notifCommercial: true,
  },
  // === MOBILE — COMMERCIAL (1 seul prevendeur demo) ===
  {
    id: "VFU00005", name: "Demo Prevendeur", email: "prevendeur@freshlink.ma", password: "1234",
    role: "prevendeur", secteur: "Nord", actif: true,
    objectifClients: 20, objectifTonnage: 500,
    objectifJournalierCA: 2000, objectifHebdomadaireCA: 12000, objectifMensuelCA: 50000,
    objectifJournalierClients: 5, objectifHebdomadaireClients: 25, objectifMensuelClients: 80,
    notifCommercial: true,
  },
  // === MOBILE — LOGISTIQUE ===
  {
    id: "VFU00006", name: "Demo Responsable Logistique", email: "logistique@freshlink.ma", password: "1234",
    role: "resp_logistique", actif: true,
    canViewLogistique: true, canViewStock: true,
    notifLivraison: true,
  },
  {
    id: "VFU00007", name: "Demo Dispatcheur", email: "dispatch@freshlink.ma", password: "1234",
    role: "dispatcheur", actif: true,
    canViewLogistique: true,
  },
  {
    id: "VFU00008", name: "Demo Magasinier", email: "magasin@freshlink.ma", password: "1234",
    role: "magasinier", actif: true,
    canViewStock: true,
  },
  // === BACKOFFICE — CASH MAN ===
  {
    id: "VFU00009", name: "Demo Cash Man", email: "cashman@freshlink.ma", password: "cash2024",
    role: "cash_man", actif: true,
    canViewCash: true, canViewCommercial: true,
  },
  // === BACKOFFICE — FINANCIER ===
  {
    id: "VFU00010", name: "Demo Financier", email: "financier@freshlink.ma", password: "fin2024",
    role: "financier", actif: true,
    canViewFinance: true, canViewCash: true, canViewRecap: true,
  },
  // === RH — OURAI ===
  {
    id: "VFU00011", name: "Ourai", email: "ourai@freshlink.ma", password: "ourai2024",
    role: "rh_manager", actif: true, accessType: "backoffice",
    canViewRH: true, canViewInvestisseur: true,
  },
  // === DEMO — ACHETEUR ===
  {
    id: "VFU00012", name: "Demo Acheteur", email: "acheteur@freshlink.ma", password: "1234",
    role: "acheteur", actif: true,
    notifAchat: true,
  },
  // === DEMO — CONTROLEUR ACHAT ===
  {
    id: "VFU00013", name: "Demo Controleur Achat", email: "ctrl.achat@freshlink.ma", password: "ctrl1234",
    role: "ctrl_achat", actif: true,
  },
  // === DEMO — CONTROLEUR PREPARATION ===
  {
    id: "VFU00014", name: "Demo Controleur Prep", email: "ctrl.prep@freshlink.ma", password: "ctrl1234",
    role: "ctrl_prep", actif: true,
  },
  // === DEMO — LIVREUR ===
  {
    id: "VFU00015", name: "Demo Livreur", email: "livreur@freshlink.ma", password: "1234",
    role: "livreur", actif: true,
  },
  // === DEMO — CLIENT ===
  {
    id: "VFU00016", name: "Demo Client", email: "client.demo@freshlink.ma", password: "1234",
    role: "client", actif: true, phone: "0600000001",
    clientId: "VFC00001",   // linked to Epicerie Al Baraka
  },
  // === DEMO — FOURNISSEUR ===
  {
    id: "VFU00017", name: "Demo Fournisseur", email: "fournisseur.demo@freshlink.ma", password: "1234",
    role: "fournisseur", actif: true,
    fournisseurId: "VFF00001",  // linked to Marche Central Casablanca
    telephone: "212600000001",
  },
  // === PREVENDEUR — JARIRI ===
  {
    id: "VFU00018", name: "Jariri", email: "jariri@freshlink.ma", password: "jariri2024",
    role: "prevendeur", secteur: "Nord", actif: true,
    objectifClients: 25, objectifTonnage: 600,
    objectifJournalierCA: 2500, objectifHebdomadaireCA: 15000, objectifMensuelCA: 60000,
    objectifJournalierClients: 6, objectifHebdomadaireClients: 30, objectifMensuelClients: 100,
    notifCommercial: true,
  },
  // === QUALITE — S. ABDELILAH (Responsable Qualité) ===
  {
    id: "VFU00019", name: "S. Abdelilah", email: "abdelilah@freshlink.ma", password: "abdelilah2024",
    role: "qualite", actif: true, accessType: "backoffice" as const,
    canViewStock: true, canViewAchat: true, canViewCommercial: true,
  },
  // === QUALITE — ABDELALI (Contrôleur Qualité) ===
  {
    id: "VFU00020", name: "Abdelali", email: "abdelali@freshlink.ma", password: "abdelali2024",
    role: "qualite", actif: true, accessType: "backoffice" as const,
    canViewStock: true, canViewAchat: true,
  },
  // === COMPTABLE — THOMAS (Contrôleur de Gestion) ===
  {
    id: "VFU00021", name: "Thomas", email: "thomas@freshlink.ma", password: "thomas2024",
    role: "comptable", actif: true, accessType: "backoffice" as const,
    canViewFinance: true, canViewCash: true, canViewRecap: true, canViewAchat: true,
  },
]

const DEFAULT_CLIENTS: Client[] = [
  // --- Nord / Zone A ---
  { id: "VFC00001",  nom: "Epicerie Al Baraka",        secteur: "Nord",   zone: "Zone A", type: "epicerie",   taille: "150-300kg", typeProduits: "moyenne",       rotation: "journalier", telephone: "0661234567", email: "baraka@epicerie.ma",      adresse: "12 Rue Ibn Battouta, Casablanca",          createdBy: "VFU00005",  createdAt: "2025-01-01", gpsLat: 33.5731, gpsLng: -7.5898 },
  { id: "VFC00002",  nom: "Superette Najah",            secteur: "Nord",   zone: "Zone A", type: "superette",  taille: "500kg+",    typeProduits: "haute_gamme",   rotation: "journalier", telephone: "0664567890", email: "najah@superette.ma",      adresse: "45 Bd Anfa, Casablanca",                   createdBy: "VFU00005",  createdAt: "2025-01-04", gpsLat: 33.5800, gpsLng: -7.6100 },
  { id: "VFC00003",  nom: "Marche Quartier Maarif",     secteur: "Nord",   zone: "Zone A", type: "marche",     taille: "500kg+",    typeProduits: "haute_gamme",   rotation: "journalier", telephone: "0669876543", email: "maarif@marche.ma",        adresse: "Rue Mustapha El Maani, Maarif",             createdBy: "VFU00005",  createdAt: "2025-02-01", gpsLat: 33.5860, gpsLng: -7.6400 },
  { id: "VFC00004", nom: "Hotel Kenzi Tower",          secteur: "Nord",   zone: "Zone A", type: "hotel",      taille: "500kg+",    typeProduits: "haute_gamme",   rotation: "journalier", telephone: "0522480000", email: "achat@kenzi.ma",          adresse: "Bd Zerktouni, Casablanca",                 createdBy: "VFU00005",  createdAt: "2025-02-05", gpsLat: 33.5892, gpsLng: -7.6309 },
  // --- Centre / Zone B ---
  { id: "VFC00005",  nom: "Restaurant Al Fassia",       secteur: "Centre", zone: "Zone B", type: "restaurant", taille: "350-500kg", typeProduits: "haute_gamme",   rotation: "4j/6",       telephone: "0662345678", email: "fassia@resto.ma",         adresse: "55 Bd Ghandi, Casablanca",                 createdBy: "VFU00005",  createdAt: "2025-01-02", gpsLat: 33.5950, gpsLng: -7.6190 },
  { id: "VFC00006",  nom: "Grossiste Derb Omar",        secteur: "Centre", zone: "Zone B", type: "grossiste",  taille: "500kg+",    typeProduits: "moyenne",       rotation: "journalier", telephone: "0665678901", email: "derb@grossiste.ma",       adresse: "Derb Omar, Casablanca",                    createdBy: "VFU00005",  createdAt: "2025-01-06", gpsLat: 33.5970, gpsLng: -7.6050 },
  { id: "VFC00007", nom: "Cafeteria Plaza",            secteur: "Centre", zone: "Zone B", type: "cafeteria",  taille: "150-300kg", typeProduits: "moyenne",       rotation: "4j/6",       telephone: "0661112233", email: "plaza@cafe.ma",           adresse: "Place Mohamed V, Casablanca",              createdBy: "VFU00005", createdAt: "2025-02-10", gpsLat: 33.5921, gpsLng: -7.6188 },
  { id: "VFC00008", nom: "Traiteur Zineb",             secteur: "Centre", zone: "Zone B", type: "traiteur",   taille: "350-500kg", typeProduits: "haute_gamme",   rotation: "3/6",        telephone: "0662223344", email: "zineb@traiteur.ma",       adresse: "Hay Hassani, Casablanca",                  createdBy: "VFU00005", createdAt: "2025-02-12", gpsLat: 33.5620, gpsLng: -7.6720 },
  // --- Sud / Zone C ---
  { id: "VFC00009",  nom: "Boucherie Tazi",             secteur: "Sud",    zone: "Zone C", type: "boucherie",  taille: "50-100kg",  typeProduits: "entree_gamme",  rotation: "3/6",        telephone: "0663456789", email: "tazi@boucherie.ma",       adresse: "Rue Fkih Ben Saleh, Ain Chock",            createdBy: "VFU00005",  createdAt: "2025-01-03", gpsLat: 33.5500, gpsLng: -7.5500 },
  { id: "VFC00010",  nom: "Primeur Sidi Maarouf",       secteur: "Sud",    zone: "Zone C", type: "epicerie",   taille: "150-300kg", typeProduits: "haute_gamme",   rotation: "journalier", telephone: "0666789012", email: "primeur@sidi.ma",         adresse: "Sidi Maarouf, Casablanca",                 createdBy: "VFU00005", createdAt: "2025-01-07", gpsLat: 33.5320, gpsLng: -7.6500 },
  { id: "VFC00011", nom: "Ecole Bab Marrakech",        secteur: "Sud",    zone: "Zone C", type: "cantina",    taille: "350-500kg", typeProduits: "entree_gamme",  rotation: "4j/6",       telephone: "0663334455", email: "cantine@ecole.ma",        adresse: "Bab Marrakech, Casablanca",                createdBy: "VFU00005", createdAt: "2025-02-15", gpsLat: 33.5450, gpsLng: -7.5650 },
  { id: "VFC00012", nom: "Supermarche Marjane Hay",    secteur: "Sud",    zone: "Zone C", type: "superette",  taille: "500kg+",    typeProduits: "haute_gamme",   rotation: "journalier", telephone: "0664445566", email: "achat@marjane-hay.ma",    adresse: "Hay Mohammadi, Casablanca",                createdBy: "VFU00005", createdAt: "2025-02-18", gpsLat: 33.5400, gpsLng: -7.5750 },
  // --- Est / Zone D ---
  { id: "VFC00013",  nom: "Collectivite Oulad Hlima",   secteur: "Est",    zone: "Zone D", type: "collectivite",taille:"500kg+",    typeProduits: "entree_gamme",  rotation: "journalier", telephone: "0667890123", email: "oulad@collectivite.ma",   adresse: "Oulad Hlima, Province Settat",             createdBy: "VFU00005", createdAt: "2025-01-08", gpsLat: 33.3900, gpsLng: -7.4800 },
  { id: "VFC00014",  nom: "Hotel Atlas Berrechid",      secteur: "Est",    zone: "Zone D", type: "hotel",      taille: "350-500kg", typeProduits: "haute_gamme",   rotation: "4j/6",       telephone: "0668901234", email: "atlas@hotel-berrechid.ma", adresse: "Route Nationale 1, Berrechid",             createdBy: "VFU00005", createdAt: "2025-01-09", gpsLat: 33.2660, gpsLng: -7.5890 },
  { id: "VFC00015", nom: "Lycee Ben Youssef",          secteur: "Est",    zone: "Zone D", type: "cantina",    taille: "150-300kg", typeProduits: "entree_gamme",  rotation: "4j/6",       telephone: "0665556677", email: "cantine@lycee-by.ma",     adresse: "Hay El Farah, Berrechid",                  createdBy: "VFU00005", createdAt: "2025-02-20", gpsLat: 33.2710, gpsLng: -7.5820 },
]

const DEFAULT_ARTICLES: Article[] = [
  // ── Légumes fruits ──────────────────────────────────────────────────────
  { id: "VFP00001",  nom: "Tomates",        nomAr: "طماطم",     famille: "Légumes fruits",   unite: "kg", stockDisponible: 500, stockDefect: 20, prixAchat: 2.5, pvMethode: "pourcentage", pvValeur: 60, photo: "https://placehold.co/120x120/e74c3c/fff?text=Tomates" },
  { id: "VFP00008",  nom: "Poivrons",       nomAr: "فلفل",      famille: "Légumes fruits",   unite: "kg", stockDisponible: 150, stockDefect: 5,  prixAchat: 4.5, pvMethode: "manuel",       pvValeur: 7.0, photo: "https://placehold.co/120x120/e67e22/fff?text=Poivrons" },
  { id: "VFP00009",  nom: "Courgettes",     nomAr: "قرع",       famille: "Légumes fruits",   unite: "kg", stockDisponible: 200, stockDefect: 12, prixAchat: 3.0, pvMethode: "pourcentage", pvValeur: 67, photo: "https://placehold.co/120x120/27ae60/fff?text=Courgettes" },
  { id: "VFP00012",  nom: "Aubergines",     nomAr: "باذنجان",   famille: "Légumes fruits",   unite: "kg", stockDisponible: 180, stockDefect: 7,  prixAchat: 3.2, pvMethode: "pourcentage", pvValeur: 65, photo: "https://placehold.co/120x120/8e44ad/fff?text=Aubergines" },
  { id: "VFP00013", nom: "Concombres",     nomAr: "خيار",      famille: "Légumes fruits",   unite: "kg", stockDisponible: 220, stockDefect: 8,  prixAchat: 2.0, pvMethode: "montant",      pvValeur: 1.5, photo: "https://placehold.co/120x120/1abc9c/fff?text=Concombres" },
  { id: "VFP00014", nom: "Tomates cerises",nomAr: "طماطم كرزي",famille: "Légumes fruits",   unite: "kg", stockDisponible: 80,  stockDefect: 3,  prixAchat: 8.0, pvMethode: "pourcentage", pvValeur: 50, photo: "https://placehold.co/120x120/c0392b/fff?text=T.Cerises" },
  // ── Légumes racines ─────────────────────────────────────────────────────
  { id: "VFP00002",   nom: "Pommes de terre (blanche)",  nomAr: "بطاطا بيضاء",    famille: "Légumes racines",  unite: "kg", stockDisponible: 800, stockDefect: 15, prixAchat: 1.8, pvMethode: "montant",  pvValeur: 1.2, photo: "https://placehold.co/120x120/d4a017/fff?text=P.Terre+Blanche" },
  { id: "VFP00003",  nom: "Pommes de terre (rouge)",   nomAr: "بطاطا حمراء",    famille: "Légumes racines",  unite: "kg", stockDisponible: 400, stockDefect: 8,  prixAchat: 2.2, pvMethode: "montant",  pvValeur: 1.5, photo: "https://placehold.co/120x120/c0392b/fff?text=P.Terre+Rouge" },
  { id: "VFP00004",  nom: "Pommes de terre (frite)",   nomAr: "بطاطا للقلي",   famille: "Légumes racines",  unite: "kg", stockDisponible: 600, stockDefect: 10, prixAchat: 2.0, pvMethode: "montant",  pvValeur: 1.3, photo: "https://placehold.co/120x120/f39c12/fff?text=P.Terre+Frite" },
  { id: "VFP00005",  nom: "Pommes de terre (douce)",   nomAr: "بطاطا حلوة",    famille: "Légumes racines",  unite: "kg", stockDisponible: 250, stockDefect: 5,  prixAchat: 3.5, pvMethode: "pourcentage", pvValeur: 57, photo: "https://placehold.co/120x120/e07b39/fff?text=P.Terre+Douce" },
  { id: "VFP00006",  nom: "Oignons",        nomAr: "بصل",       famille: "Légumes racines",  unite: "kg", stockDisponible: 300, stockDefect: 10, prixAchat: 2.0, pvMethode: "pourcentage", pvValeur: 75, photo: "https://placehold.co/120x120/e8a87c/fff?text=Oignons" },
  { id: "VFP00007",  nom: "Carottes",       nomAr: "جزر",       famille: "Légumes racines",  unite: "kg", stockDisponible: 250, stockDefect: 8,  prixAchat: 2.2, pvMethode: "montant",      pvValeur: 1.6, photo: "https://placehold.co/120x120/e67e22/fff?text=Carottes" },
  { id: "VFP00015", nom: "Betteraves",     nomAr: "شمندر",     famille: "Légumes racines",  unite: "kg", stockDisponible: 120, stockDefect: 4,  prixAchat: 2.5, pvMethode: "pourcentage", pvValeur: 60, photo: "https://placehold.co/120x120/922b21/fff?text=Betteraves" },
  { id: "VFP00016", nom: "Navets",         nomAr: "لفت",       famille: "Légumes racines",  unite: "kg", stockDisponible: 90,  stockDefect: 3,  prixAchat: 1.5, pvMethode: "pourcentage", pvValeur: 67, photo: "https://placehold.co/120x120/f0e68c/333?text=Navets" },
  { id: "VFP00017", nom: "Ail",            nomAr: "ثوم",       famille: "Légumes racines",  unite: "kg", stockDisponible: 60,  stockDefect: 2,  prixAchat: 18.0,pvMethode: "pourcentage", pvValeur: 56, photo: "https://placehold.co/120x120/f5f5dc/333?text=Ail" },
  // ── Légumes feuilles ────────────────────────────────────────────────────
  { id: "VFP00018", nom: "Laitue",         nomAr: "خس",        famille: "Légumes feuilles", unite: "pièce", stockDisponible: 150, stockDefect: 5, prixAchat: 1.5, pvMethode: "montant", pvValeur: 1.0, photo: "https://placehold.co/120x120/2ecc71/fff?text=Laitue" },
  { id: "VFP00019", nom: "Épinards",       nomAr: "سبانخ",     famille: "Légumes feuilles", unite: "kg", stockDisponible: 100, stockDefect: 8,  prixAchat: 4.0, pvMethode: "pourcentage", pvValeur: 50, photo: "https://placehold.co/120x120/196f3d/fff?text=Épinards" },
  { id: "VFP00020", nom: "Poireaux",       nomAr: "كراث",      famille: "Légumes feuilles", unite: "kg", stockDisponible: 80,  stockDefect: 4,  prixAchat: 3.5, pvMethode: "pourcentage", pvValeur: 57, photo: "https://placehold.co/120x120/27ae60/fff?text=Poireaux" },
  { id: "VFP00021", nom: "Choux",          nomAr: "كرنب",      famille: "Légumes feuilles", unite: "kg", stockDisponible: 200, stockDefect: 10, prixAchat: 1.8, pvMethode: "montant",      pvValeur: 1.2, photo: "https://placehold.co/120x120/a9dfbf/333?text=Choux" },
  { id: "VFP00022", nom: "Choufleur",      nomAr: "قرنبيط",    famille: "Légumes feuilles", unite: "pièce", stockDisponible: 100, stockDefect: 5, prixAchat: 5.0, pvMethode: "montant", pvValeur: 3.5, photo: "https://placehold.co/120x120/f9f9f9/333?text=Choufleur" },
  { id: "VFP00023", nom: "Brocolis",       nomAr: "بروكلي",    famille: "Légumes feuilles", unite: "kg", stockDisponible: 70,  stockDefect: 3,  prixAchat: 7.0, pvMethode: "pourcentage", pvValeur: 43, photo: "https://placehold.co/120x120/1e8449/fff?text=Brocolis" },
  { id: "VFP00024", nom: "Artichauds",     nomAr: "أرضي شوكي", famille: "Légumes feuilles", unite: "pièce", stockDisponible: 80, stockDefect: 4, prixAchat: 3.0, pvMethode: "montant", pvValeur: 2.0, photo: "https://placehold.co/120x120/148f77/fff?text=Artichaut" },
  // ── Herbes aromatiques ──────────────────────────────────────────────────
  { id: "VFP00025", nom: "Persil",         nomAr: "معدنوس",    famille: "Herbes aromatiques",unite: "botte", stockDisponible: 200, stockDefect: 10, prixAchat: 1.0, pvMethode: "montant", pvValeur: 0.5, photo: "https://placehold.co/120x120/27ae60/fff?text=Persil" },
  { id: "VFP00026", nom: "Coriandre",      nomAr: "قزبر",      famille: "Herbes aromatiques",unite: "botte", stockDisponible: 180, stockDefect: 8,  prixAchat: 1.0, pvMethode: "montant", pvValeur: 0.5, photo: "https://placehold.co/120x120/1abc9c/fff?text=Coriandre" },
  { id: "VFP00027", nom: "Menthe",         nomAr: "نعناع",     famille: "Herbes aromatiques",unite: "botte", stockDisponible: 150, stockDefect: 5,  prixAchat: 1.2, pvMethode: "montant", pvValeur: 0.8, photo: "https://placehold.co/120x120/2ecc71/fff?text=Menthe" },
  { id: "VFP00028", nom: "Céleri",         nomAr: "كرفس",      famille: "Herbes aromatiques",unite: "botte", stockDisponible: 80, stockDefect: 4,  prixAchat: 2.5, pvMethode: "montant", pvValeur: 1.5, photo: "https://placehold.co/120x120/a9cce3/333?text=Céleri" },
  // ── Agrumes ─────────────────────────────────────────────────────────────
  { id: "VFP00010",  nom: "Oranges",        nomAr: "برتقال",    famille: "Agrumes",          unite: "kg", stockDisponible: 350, stockDefect: 6,  prixAchat: 2.8, pvMethode: "montant",      pvValeur: 1.7, photo: "https://placehold.co/120x120/f39c12/fff?text=Oranges" },
  { id: "VFP00029", nom: "Citrons",        nomAr: "ليمون",     famille: "Agrumes",          unite: "kg", stockDisponible: 200, stockDefect: 5,  prixAchat: 3.5, pvMethode: "pourcentage", pvValeur: 57, photo: "https://placehold.co/120x120/f9e000/333?text=Citrons" },
  { id: "VFP00030", nom: "Clémentines",    nomAr: "كليمانتين", famille: "Agrumes",          unite: "kg", stockDisponible: 300, stockDefect: 8,  prixAchat: 5.0, pvMethode: "pourcentage", pvValeur: 50, photo: "https://placehold.co/120x120/e67e22/fff?text=Clémentines" },
  { id: "VFP00031", nom: "Pamplemousses",  nomAr: "برتقال هندي",famille: "Agrumes",         unite: "kg", stockDisponible: 120, stockDefect: 4,  prixAchat: 4.5, pvMethode: "pourcentage", pvValeur: 44, photo: "https://placehold.co/120x120/f0c07a/333?text=Pamplm." },
  // ── Fruits tropicaux ────────────────────────────────────────────────────
  { id: "VFP00011",  nom: "Bananes",        nomAr: "موز",       famille: "Fruits tropicaux", unite: "kg", stockDisponible: 120, stockDefect: 4,  prixAchat: 3.5, pvMethode: "pourcentage", pvValeur: 57, photo: "https://placehold.co/120x120/f1c40f/333?text=Bananes" },
  { id: "VFP00032", nom: "Mangues",        nomAr: "مانجو",     famille: "Fruits tropicaux", unite: "kg", stockDisponible: 80,  stockDefect: 3,  prixAchat: 12.0,pvMethode: "pourcentage", pvValeur: 50, photo: "https://placehold.co/120x120/f39c12/fff?text=Mangues" },
  { id: "VFP00033", nom: "Avocats",        nomAr: "أفوكادو",   famille: "Fruits tropicaux", unite: "kg", stockDisponible: 60,  stockDefect: 3,  prixAchat: 15.0,pvMethode: "pourcentage", pvValeur: 33, photo: "https://placehold.co/120x120/196f3d/fff?text=Avocats" },
  { id: "VFP00034", nom: "Ananas",         nomAr: "أناناس",    famille: "Fruits tropicaux", unite: "pièce", stockDisponible: 40, stockDefect: 2, prixAchat: 12.0,pvMethode: "montant",  pvValeur: 8.0, photo: "https://placehold.co/120x120/f4d03f/333?text=Ananas" },
  { id: "VFP00035", nom: "Kiwis",          nomAr: "كيوي",      famille: "Fruits tropicaux", unite: "kg", stockDisponible: 50,  stockDefect: 2,  prixAchat: 20.0,pvMethode: "pourcentage", pvValeur: 50, photo: "https://placehold.co/120x120/28b463/fff?text=Kiwis" },
  // ── Fruits rouges ───────────────────────────────────────────────────────
  { id: "VFP00036", nom: "Fraises",        nomAr: "فراولة",    famille: "Fruits rouges",    unite: "kg", stockDisponible: 100, stockDefect: 8,  prixAchat: 18.0,pvMethode: "pourcentage", pvValeur: 44, photo: "https://placehold.co/120x120/c0392b/fff?text=Fraises" },
  { id: "VFP00037", nom: "Raisins",        nomAr: "عنب",       famille: "Fruits rouges",    unite: "kg", stockDisponible: 150, stockDefect: 6,  prixAchat: 12.0,pvMethode: "pourcentage", pvValeur: 50, photo: "https://placehold.co/120x120/7d3c98/fff?text=Raisins" },
  { id: "VFP00038", nom: "Grenades",       nomAr: "رمان",      famille: "Fruits rouges",    unite: "kg", stockDisponible: 120, stockDefect: 4,  prixAchat: 8.0, pvMethode: "pourcentage", pvValeur: 50, photo: "https://placehold.co/120x120/e74c3c/fff?text=Grenades" },
  // ── Autres fruits ───────────────────────────────────────────────────────
  { id: "VFP00039",  nom: "Pommes (rouge/Golden)",    nomAr: "تفاح أحمر/ذهبي", famille: "Fruits tropicaux", unite: "kg", stockDisponible: 400, stockDefect: 10, prixAchat: 4.0, pvMethode: "pourcentage", pvValeur: 50, photo: "https://placehold.co/120x120/e74c3c/fff?text=Pommes+Rouges" },
  { id: "VFP00040", nom: "Pommes (Granny Smith)",   nomAr: "تفاح أخضر",     famille: "Fruits tropicaux", unite: "kg", stockDisponible: 180, stockDefect: 4,  prixAchat: 4.5, pvMethode: "pourcentage", pvValeur: 44, photo: "https://placehold.co/120x120/2ecc71/fff?text=Pommes+Vertes" },
  { id: "VFP00041", nom: "Pommes (Fuji)",           nomAr: "تفاح فوجي",     famille: "Fruits tropicaux", unite: "kg", stockDisponible: 120, stockDefect: 3,  prixAchat: 5.5, pvMethode: "pourcentage", pvValeur: 45, photo: "https://placehold.co/120x120/f8c8d4/333?text=Pommes+Fuji" },
  { id: "VFP00042", nom: "Poires",         nomAr: "إجاص",      famille: "Fruits tropicaux", unite: "kg", stockDisponible: 180, stockDefect: 6,  prixAchat: 5.0, pvMethode: "pourcentage", pvValeur: 40, photo: "https://placehold.co/120x120/a9cce3/333?text=Poires" },
  { id: "VFP00043", nom: "Pastèques",      nomAr: "دلاح",      famille: "Fruits tropicaux", unite: "pièce", stockDisponible: 50, stockDefect: 2, prixAchat: 15.0,pvMethode: "montant",  pvValeur: 10.0, photo: "https://placehold.co/120x120/1abc9c/fff?text=Pastèque" },
  { id: "VFP00044", nom: "Melons",         nomAr: "بطيخ",      famille: "Fruits tropicaux", unite: "pièce", stockDisponible: 40, stockDefect: 2, prixAchat: 10.0,pvMethode: "montant",  pvValeur: 7.0, photo: "https://placehold.co/120x120/f9e000/333?text=Melons" },
  { id: "VFP00045", nom: "Figues",         nomAr: "تين",       famille: "Fruits tropicaux", unite: "kg", stockDisponible: 60,  stockDefect: 3,  prixAchat: 15.0,pvMethode: "pourcentage", pvValeur: 33, photo: "https://placehold.co/120x120/7d3c98/fff?text=Figues" },
  { id: "VFP00046", nom: "Dattes",         nomAr: "تمر",       famille: "Fruits secs",      unite: "kg", stockDisponible: 80,  stockDefect: 2,  prixAchat: 30.0,pvMethode: "pourcentage", pvValeur: 33, photo: "https://placehold.co/120x120/a04000/fff?text=Dattes" },
  // ── Herbes aromatiques ++ ───────────────────────────────────────────────
  { id: "VFP00047", nom: "Romarin",        nomAr: "روزماري",   famille: "Herbes aromatiques",unite: "botte", stockDisponible: 60,  stockDefect: 2,  prixAchat: 3.0, pvMethode: "montant", pvValeur: 2.0,  photo: "https://placehold.co/120x120/1a5276/fff?text=Romarin" },
  { id: "VFP00048", nom: "Thym",           nomAr: "زعتر",      famille: "Herbes aromatiques",unite: "botte", stockDisponible: 70,  stockDefect: 2,  prixAchat: 2.5, pvMethode: "montant", pvValeur: 1.5,  photo: "https://placehold.co/120x120/117a65/fff?text=Thym" },
  { id: "VFP00049", nom: "Basilic",        nomAr: "ريحان",     famille: "Herbes aromatiques",unite: "botte", stockDisponible: 50,  stockDefect: 2,  prixAchat: 3.5, pvMethode: "montant", pvValeur: 2.5,  photo: "https://placehold.co/120x120/1e8449/fff?text=Basilic" },
  { id: "VFP00050", nom: "Laurier",        nomAr: "غار",       famille: "Herbes aromatiques",unite: "botte", stockDisponible: 40,  stockDefect: 1,  prixAchat: 2.0, pvMethode: "montant", pvValeur: 1.2,  photo: "https://placehold.co/120x120/28b463/fff?text=Laurier" },
  { id: "VFP00051", nom: "Sauge",          nomAr: "مريمية",    famille: "Herbes aromatiques",unite: "botte", stockDisponible: 35,  stockDefect: 1,  prixAchat: 3.0, pvMethode: "montant", pvValeur: 2.0,  photo: "https://placehold.co/120x120/2e86c1/fff?text=Sauge" },
  { id: "VFP00052", nom: "Cumin (graines)",nomAr: "كمون",      famille: "Herbes aromatiques",unite: "kg",    stockDisponible: 30,  stockDefect: 0,  prixAchat: 25.0,pvMethode: "pourcentage", pvValeur: 40, photo: "https://placehold.co/120x120/784212/fff?text=Cumin" },
  { id: "VFP00053", nom: "Gingembre frais",nomAr: "زنجبيل",    famille: "Herbes aromatiques",unite: "kg",    stockDisponible: 40,  stockDefect: 2,  prixAchat: 20.0,pvMethode: "pourcentage", pvValeur: 50, photo: "https://placehold.co/120x120/d4ac0d/fff?text=Gingembre" },
  // ── Légumes ++ ─────────────────────────────────────────────────────────
  { id: "VFP00054", nom: "Fenouil",        nomAr: "بسباس",     famille: "Légumes feuilles",  unite: "kg",    stockDisponible: 50,  stockDefect: 2,  prixAchat: 4.0, pvMethode: "pourcentage", pvValeur: 50, photo: "https://placehold.co/120x120/abebc6/333?text=Fenouil" },
  { id: "VFP00055", nom: "Radis",          nomAr: "فجل",       famille: "Légumes racines",   unite: "botte", stockDisponible: 80,  stockDefect: 3,  prixAchat: 1.5, pvMethode: "montant", pvValeur: 1.0,  photo: "https://placehold.co/120x120/e74c3c/fff?text=Radis" },
  { id: "VFP00056", nom: "Piment fort",    nomAr: "فلفل حار",  famille: "Légumes fruits",    unite: "kg",    stockDisponible: 60,  stockDefect: 2,  prixAchat: 6.0, pvMethode: "pourcentage", pvValeur: 50, photo: "https://placehold.co/120x120/c0392b/fff?text=Piment" },
  { id: "VFP00057", nom: "Haricots verts", nomAr: "لوبيا خضراء",famille: "Légumes feuilles", unite: "kg",   stockDisponible: 120, stockDefect: 5,  prixAchat: 5.0, pvMethode: "pourcentage", pvValeur: 40, photo: "https://placehold.co/120x120/27ae60/fff?text=Haricots" },
  { id: "VFP00058", nom: "Petits pois",    nomAr: "جلبانة",    famille: "Légumes feuilles",  unite: "kg",    stockDisponible: 90,  stockDefect: 3,  prixAchat: 6.0, pvMethode: "pourcentage", pvValeur: 50, photo: "https://placehold.co/120x120/2ecc71/fff?text=PetitsPois" },
  { id: "VFP00059", nom: "Champignons",    nomAr: "فطر",       famille: "Légumes feuilles",  unite: "kg",    stockDisponible: 50,  stockDefect: 4,  prixAchat: 18.0,pvMethode: "pourcentage", pvValeur: 33, photo: "https://placehold.co/120x120/a9a9a9/fff?text=Champigons" },
  // ── Fruits ++ ───────────────────────────────────────────────────────────
  { id: "VFP00060", nom: "Peches",         nomAr: "خوخ",       famille: "Fruits rouges",     unite: "kg",    stockDisponible: 80,  stockDefect: 5,  prixAchat: 8.0, pvMethode: "pourcentage", pvValeur: 38, photo: "https://placehold.co/120x120/f1948a/fff?text=Peches" },
  { id: "VFP00061", nom: "Prunes",         nomAr: "برقوق",     famille: "Fruits rouges",     unite: "kg",    stockDisponible: 60,  stockDefect: 4,  prixAchat: 10.0,pvMethode: "pourcentage", pvValeur: 40, photo: "https://placehold.co/120x120/7d3c98/fff?text=Prunes" },
  { id: "VFP00062", nom: "Nectarines",     nomAr: "نكتارين",   famille: "Fruits rouges",     unite: "kg",    stockDisponible: 50,  stockDefect: 3,  prixAchat: 9.0, pvMethode: "pourcentage", pvValeur: 44, photo: "https://placehold.co/120x120/e74c3c/fff?text=Nectarines" },
  { id: "VFP00063", nom: "Cerises",        nomAr: "حب الملوك", famille: "Fruits rouges",     unite: "kg",    stockDisponible: 40,  stockDefect: 3,  prixAchat: 25.0,pvMethode: "pourcentage", pvValeur: 32, photo: "https://placehold.co/120x120/c0392b/fff?text=Cerises" },
  { id: "VFP00064", nom: "Papayes",        nomAr: "بابايا",    famille: "Fruits tropicaux",  unite: "kg",    stockDisponible: 30,  stockDefect: 2,  prixAchat: 15.0,pvMethode: "pourcentage", pvValeur: 33, photo: "https://placehold.co/120x120/f39c12/fff?text=Papayes" },
  { id: "VFP00065", nom: "Litchis",        nomAr: "ليتشي",     famille: "Fruits tropicaux",  unite: "kg",    stockDisponible: 25,  stockDefect: 2,  prixAchat: 30.0,pvMethode: "pourcentage", pvValeur: 33, photo: "https://placehold.co/120x120/e8b4b8/333?text=Litchis" },
  // ── Légumes feuilles supplement ────────────────────────────────────────
  { id: "VFP00066", nom: "Blettes",        nomAr: "سلق",       famille: "Légumes feuilles",  unite: "botte", stockDisponible: 70,  stockDefect: 3,  prixAchat: 2.0, pvMethode: "montant",      pvValeur: 1.5, photo: "https://placehold.co/120x120/1a5c38/fff?text=Blettes" },
  { id: "VFP00067", nom: "Cresson",        nomAr: "جرجير ماء", famille: "Légumes feuilles",  unite: "botte", stockDisponible: 45,  stockDefect: 2,  prixAchat: 2.5, pvMethode: "montant",      pvValeur: 1.8, photo: "https://placehold.co/120x120/2d6a4f/fff?text=Cresson" },
  { id: "VFP00068", nom: "Mache",          nomAr: "خس حمل",    famille: "Légumes feuilles",  unite: "botte", stockDisponible: 35,  stockDefect: 2,  prixAchat: 3.0, pvMethode: "montant",      pvValeur: 2.0, photo: "https://placehold.co/120x120/52b788/fff?text=Mache" },
  { id: "VFP00069", nom: "Roquette",       nomAr: "جرجير",     famille: "Légumes feuilles",  unite: "botte", stockDisponible: 50,  stockDefect: 3,  prixAchat: 3.5, pvMethode: "montant",      pvValeur: 2.5, photo: "https://placehold.co/120x120/3a7d44/fff?text=Roquette" },
  { id: "VFP00070", nom: "Chou rouge",     nomAr: "كرنب أحمر", famille: "Légumes feuilles",  unite: "kg",    stockDisponible: 80,  stockDefect: 3,  prixAchat: 2.0, pvMethode: "pourcentage",  pvValeur: 50,  photo: "https://placehold.co/120x120/7b2d8b/fff?text=Chou+rouge" },
  { id: "VFP00071", nom: "Chou de Bruxelles",nomAr:"كرنب بروكسل",famille: "Légumes feuilles",unite: "kg",    stockDisponible: 40,  stockDefect: 2,  prixAchat: 6.0, pvMethode: "pourcentage",  pvValeur: 50,  photo: "https://placehold.co/120x120/27ae60/fff?text=C.Bruxelles" },
  // ── Légumes fruits supplement ───────────────────────────────────────────
  { id: "VFP00072", nom: "Aubergines",     nomAr: "باذنجان",   famille: "Légumes fruits",    unite: "kg",    stockDisponible: 130, stockDefect: 5,  prixAchat: 3.0, pvMethode: "pourcentage",  pvValeur: 67,  photo: "https://placehold.co/120x120/6c3483/fff?text=Aubergines" },
  { id: "VFP00073", nom: "Courge",         nomAr: "قرع",       famille: "Légumes fruits",    unite: "kg",    stockDisponible: 90,  stockDefect: 3,  prixAchat: 2.5, pvMethode: "pourcentage",  pvValeur: 60,  photo: "https://placehold.co/120x120/e67e22/fff?text=Courge" },
  { id: "VFP00074", nom: "Patate douce",   nomAr: "بطاطا حلوة",famille: "Légumes racines",   unite: "kg",    stockDisponible: 110, stockDefect: 4,  prixAchat: 3.5, pvMethode: "pourcentage",  pvValeur: 57,  photo: "https://placehold.co/120x120/e07b39/fff?text=Pat.douce" },
  { id: "VFP00075", nom: "Maïs",           nomAr: "ذرة",       famille: "Légumes fruits",    unite: "pièce", stockDisponible: 100, stockDefect: 3,  prixAchat: 1.5, pvMethode: "montant",       pvValeur: 1.0, photo: "https://placehold.co/120x120/f4d03f/333?text=Maïs" },
  { id: "VFP00076", nom: "Bette a carde",  nomAr: "سلق أحمر",  famille: "Légumes feuilles",  unite: "botte", stockDisponible: 30,  stockDefect: 1,  prixAchat: 3.0, pvMethode: "montant",       pvValeur: 2.0, photo: "https://placehold.co/120x120/e74c3c/fff?text=Bette" },
  // ── Légumes racines supplement ──────────────────────────────────────────
  { id: "VFP00077", nom: "Celeri-rave",    nomAr: "كرفس جذري", famille: "Légumes racines",   unite: "kg",    stockDisponible: 35,  stockDefect: 2,  prixAchat: 5.0, pvMethode: "pourcentage",  pvValeur: 40,  photo: "https://placehold.co/120x120/a9a9a9/fff?text=Celeri-rave" },
  { id: "VFP00078", nom: "Panais",         nomAr: "جزر أبيض",  famille: "Légumes racines",   unite: "kg",    stockDisponible: 25,  stockDefect: 1,  prixAchat: 4.5, pvMethode: "pourcentage",  pvValeur: 44,  photo: "https://placehold.co/120x120/f5deb3/333?text=Panais" },
  { id: "VFP00079", nom: "Gingembre sec",  nomAr: "زنجبيل يابس",famille: "Herbes aromatiques",unite: "kg",   stockDisponible: 20,  stockDefect: 0,  prixAchat: 35.0,pvMethode: "pourcentage",  pvValeur: 43,  photo: "https://placehold.co/120x120/c8a951/333?text=Gingmb.sec" },
  // ── Herbes aromatiques supplement ──────────────────────────────────────
  { id: "VFP00080", nom: "Origan",         nomAr: "زعتر روماني",famille: "Herbes aromatiques",unite: "botte", stockDisponible: 45,  stockDefect: 1,  prixAchat: 2.5, pvMethode: "montant",       pvValeur: 1.8, photo: "https://placehold.co/120x120/5d6d20/fff?text=Origan" },
  { id: "VFP00081", nom: "Aneth",          nomAr: "شبت",       famille: "Herbes aromatiques",unite: "botte", stockDisponible: 35,  stockDefect: 1,  prixAchat: 2.0, pvMethode: "montant",       pvValeur: 1.5, photo: "https://placehold.co/120x120/3d9970/fff?text=Aneth" },
  { id: "VFP00082", nom: "Estragon",       nomAr: "طرخون",     famille: "Herbes aromatiques",unite: "botte", stockDisponible: 20,  stockDefect: 1,  prixAchat: 3.5, pvMethode: "montant",       pvValeur: 2.5, photo: "https://placehold.co/120x120/1c6e4a/fff?text=Estragon" },
  { id: "VFP00083", nom: "Citronnelle",    nomAr: "ليمون عشبي",famille: "Herbes aromatiques",unite: "botte", stockDisponible: 25,  stockDefect: 1,  prixAchat: 4.0, pvMethode: "montant",       pvValeur: 3.0, photo: "https://placehold.co/120x120/badc58/333?text=Citronnelle" },
  { id: "VFP00084", nom: "Fenugrec frais", nomAr: "حلبة طازجة",famille: "Herbes aromatiques",unite: "botte", stockDisponible: 40,  stockDefect: 2,  prixAchat: 1.5, pvMethode: "montant",       pvValeur: 1.0, photo: "https://placehold.co/120x120/6ab04c/fff?text=Fenugrec" },
  { id: "VFP00085", nom: "Zaatar frais",   nomAr: "زعتر طازج", famille: "Herbes aromatiques",unite: "botte", stockDisponible: 60,  stockDefect: 2,  prixAchat: 1.5, pvMethode: "montant",       pvValeur: 1.0, photo: "https://placehold.co/120x120/4a7c59/fff?text=Zaatar" },
  // ── Agrumes supplement ──────────────────────────────────────────────────
  { id: "VFP00086", nom: "Citrons verts",  nomAr: "ليمون أخضر",famille: "Agrumes",           unite: "kg",    stockDisponible: 80,  stockDefect: 3,  prixAchat: 5.0, pvMethode: "pourcentage",  pvValeur: 60,  photo: "https://placehold.co/120x120/7fba00/fff?text=Citron+vert" },
  { id: "VFP00087", nom: "Kumquats",       nomAr: "كمكوات",    famille: "Agrumes",           unite: "kg",    stockDisponible: 20,  stockDefect: 1,  prixAchat: 22.0,pvMethode: "pourcentage",  pvValeur: 36,  photo: "https://placehold.co/120x120/f97316/fff?text=Kumquats" },
  // ── Fruits tropicaux supplement ─────────────────────────────────────────
  { id: "VFP00088", nom: "Fruits de la passion",nomAr:"فاكهة الشغف",famille: "Fruits tropicaux",unite: "kg", stockDisponible: 15,  stockDefect: 1,  prixAchat: 40.0,pvMethode: "pourcentage",  pvValeur: 25,  photo: "https://placehold.co/120x120/7c3aed/fff?text=Passion" },
  { id: "VFP00089", nom: "Corossol",       nomAr: "قشطة",      famille: "Fruits tropicaux",  unite: "kg",    stockDisponible: 10,  stockDefect: 1,  prixAchat: 35.0,pvMethode: "pourcentage",  pvValeur: 29,  photo: "https://placehold.co/120x120/16a34a/fff?text=Corossol" },
  { id: "VFP00090", nom: "Noix de coco",   nomAr: "جوز الهند", famille: "Fruits tropicaux",  unite: "pièce", stockDisponible: 30,  stockDefect: 1,  prixAchat: 8.0, pvMethode: "montant",       pvValeur: 5.0, photo: "https://placehold.co/120x120/92400e/fff?text=Noix.coco" },
  // ── Légumes supplémentaires ─────────────────────────────────────────────
  { id: "VFP00091", nom: "Asperges",       nomAr: "هليون",     famille: "Légumes feuilles",  unite: "botte", stockDisponible: 30,  stockDefect: 2,  prixAchat: 15.0,pvMethode: "pourcentage",  pvValeur: 40,  photo: "https://placehold.co/120x120/4caf50/fff?text=Asperges" },
  { id: "VFP00092", nom: "Brocoli-rave",   nomAr: "بروكلي إيطالي",famille:"Légumes feuilles",unite: "botte", stockDisponible: 25,  stockDefect: 1,  prixAchat: 8.0, pvMethode: "pourcentage",  pvValeur: 50,  photo: "https://placehold.co/120x120/2e7d32/fff?text=BrocRave" },
  { id: "VFP00093", nom: "Okra",           nomAr: "قلقاس",     famille: "Légumes fruits",    unite: "kg",    stockDisponible: 55,  stockDefect: 2,  prixAchat: 5.0, pvMethode: "pourcentage",  pvValeur: 60,  photo: "https://placehold.co/120x120/33691e/fff?text=Okra" },
  { id: "VFP00094", nom: "Taro",           nomAr: "قلقاس",     famille: "Légumes racines",   unite: "kg",    stockDisponible: 40,  stockDefect: 2,  prixAchat: 4.0, pvMethode: "pourcentage",  pvValeur: 50,  photo: "https://placehold.co/120x120/795548/fff?text=Taro" },
  { id: "VFP00095", nom: "Salsifis",       nomAr: "لسان الثور", famille: "Légumes racines",  unite: "kg",    stockDisponible: 20,  stockDefect: 1,  prixAchat: 8.0, pvMethode: "pourcentage",  pvValeur: 38,  photo: "https://placehold.co/120x120/bcaaa4/333?text=Salsifis" },
  { id: "VFP00096", nom: "Rutabaga",       nomAr: "لفت اسكتلندي",famille:"Légumes racines",  unite: "kg",    stockDisponible: 20,  stockDefect: 1,  prixAchat: 3.5, pvMethode: "pourcentage",  pvValeur: 43,  photo: "https://placehold.co/120x120/f9a825/fff?text=Rutabaga" },
  { id: "VFP00097", nom: "Topinambour",    nomAr: "كمأة الأرض", famille: "Légumes racines",  unite: "kg",    stockDisponible: 15,  stockDefect: 1,  prixAchat: 9.0, pvMethode: "pourcentage",  pvValeur: 33,  photo: "https://placehold.co/120x120/a1887f/fff?text=Topinambour" },
  { id: "VFP00098", nom: "Endives",        nomAr: "هندباء",    famille: "Légumes feuilles",  unite: "pièce", stockDisponible: 40,  stockDefect: 2,  prixAchat: 4.0, pvMethode: "montant",       pvValeur: 2.5, photo: "https://placehold.co/120x120/fff9c4/333?text=Endives" },
  { id: "VFP00099", nom: "Pak Choi",       nomAr: "ملفوف صيني", famille: "Légumes feuilles",  unite: "pièce", stockDisponible: 30,  stockDefect: 1,  prixAchat: 5.0, pvMethode: "montant",       pvValeur: 3.0, photo: "https://placehold.co/120x120/66bb6a/fff?text=PakChoi" },
  // ── Fruits supplémentaires ──────────────────────────────────────────────
  { id: "VFP00100", nom: "Abricots",       nomAr: "مشمش",      famille: "Fruits rouges",     unite: "kg",    stockDisponible: 70,  stockDefect: 4,  prixAchat: 10.0,pvMethode: "pourcentage",  pvValeur: 40,  photo: "https://placehold.co/120x120/ff8f00/fff?text=Abricots" },
  { id: "VFP00101", nom: "Myrtilles",      nomAr: "توت أزرق",  famille: "Fruits rouges",     unite: "kg",    stockDisponible: 20,  stockDefect: 2,  prixAchat: 45.0,pvMethode: "pourcentage",  pvValeur: 33,  photo: "https://placehold.co/120x120/283593/fff?text=Myrtilles" },
  { id: "VFP00102", nom: "Framboises",     nomAr: "توت العُلَّيق",famille:"Fruits rouges",   unite: "kg",    stockDisponible: 15,  stockDefect: 2,  prixAchat: 50.0,pvMethode: "pourcentage",  pvValeur: 30,  photo: "https://placehold.co/120x120/e91e63/fff?text=Framboises" },
  { id: "VFP00103", nom: "Mures",          nomAr: "توت أسود",  famille: "Fruits rouges",     unite: "kg",    stockDisponible: 15,  stockDefect: 1,  prixAchat: 40.0,pvMethode: "pourcentage",  pvValeur: 38,  photo: "https://placehold.co/120x120/4a148c/fff?text=Mures" },
  { id: "VFP00104", nom: "Caramboles",     nomAr: "نجمة الفاكهة",famille:"Fruits tropicaux", unite: "kg",    stockDisponible: 10,  stockDefect: 1,  prixAchat: 35.0,pvMethode: "pourcentage",  pvValeur: 43,  photo: "https://placehold.co/120x120/f9a825/fff?text=Carambole" },
  { id: "VFP00105",nom: "Tamarins",       nomAr: "تمر هندي",  famille: "Fruits tropicaux",  unite: "kg",    stockDisponible: 12,  stockDefect: 1,  prixAchat: 20.0,pvMethode: "pourcentage",  pvValeur: 50,  photo: "https://placehold.co/120x120/4e342e/fff?text=Tamarins" },
  { id: "VFP00106",nom: "Longanes",       nomAr: "عين التنين", famille: "Fruits tropicaux",  unite: "kg",    stockDisponible: 10,  stockDefect: 1,  prixAchat: 30.0,pvMethode: "pourcentage",  pvValeur: 33,  photo: "https://placehold.co/120x120/ffe082/333?text=Longanes" },
  // ── Herbes aromatiques supplémentaires ─────────────────────────────────
  { id: "VFP00107",nom: "Ciboulette",     nomAr: "بصل أخضر",  famille: "Herbes aromatiques",unite: "botte", stockDisponible: 40,  stockDefect: 2,  prixAchat: 1.5, pvMethode: "montant",       pvValeur: 1.0, photo: "https://placehold.co/120x120/558b2f/fff?text=Ciboulette" },
  { id: "VFP00108",nom: "Verveine",       nomAr: "ليمون عشب", famille: "Herbes aromatiques",unite: "botte", stockDisponible: 20,  stockDefect: 1,  prixAchat: 4.0, pvMethode: "montant",       pvValeur: 3.0, photo: "https://placehold.co/120x120/8bc34a/fff?text=Verveine" },
  { id: "VFP00109",nom: "Hibiscus frais", nomAr: "كركدية",    famille: "Herbes aromatiques",unite: "botte", stockDisponible: 15,  stockDefect: 1,  prixAchat: 5.0, pvMethode: "montant",       pvValeur: 3.5, photo: "https://placehold.co/120x120/e53935/fff?text=Hibiscus" },
  { id: "VFP00110",nom: "Sarriette",      nomAr: "صعتر",      famille: "Herbes aromatiques",unite: "botte", stockDisponible: 15,  stockDefect: 1,  prixAchat: 3.0, pvMethode: "montant",       pvValeur: 2.0, photo: "https://placehold.co/120x120/689f38/fff?text=Sarriette" },
  // ── Légumes secs / champignons ──────────────────────────────────────────
  { id: "VFP00111",nom: "Champignons Shiitake",nomAr:"فطر شيتاكي",famille:"Légumes feuilles",unite:"kg",    stockDisponible: 20,  stockDefect: 2,  prixAchat: 40.0,pvMethode: "pourcentage",  pvValeur: 25,  photo: "https://placehold.co/120x120/795548/fff?text=Shiitake" },
  { id: "VFP00112",nom: "Champignons Pleurotes",nomAr:"فطر عيش الغراب",famille:"Légumes feuilles",unite:"kg",stockDisponible:25, stockDefect: 2,  prixAchat: 30.0,pvMethode: "pourcentage",  pvValeur: 33,  photo: "https://placehold.co/120x120/bdbdbd/333?text=Pleurotes" },
  { id: "VFP00113",nom: "Truffes noires", nomAr: "كمأ أسود",  famille: "Légumes feuilles",  unite: "kg",    stockDisponible: 5,   stockDefect: 0,  prixAchat: 800.0,pvMethode: "pourcentage", pvValeur: 25,  photo: "https://placehold.co/120x120/212121/fff?text=Truffes" },
  // ── Agrumes supplémentaires ─────────────────────────────────────────────
  { id: "VFP00114",nom: "Bergamotes",     nomAr: "برغموت",    famille: "Agrumes",           unite: "kg",    stockDisponible: 15,  stockDefect: 1,  prixAchat: 15.0,pvMethode: "pourcentage",  pvValeur: 33,  photo: "https://placehold.co/120x120/ffeb3b/333?text=Bergamote" },
  { id: "VFP00115",nom: "Yuzus",          nomAr: "يوزو",      famille: "Agrumes",           unite: "kg",    stockDisponible: 10,  stockDefect: 1,  prixAchat: 60.0,pvMethode: "pourcentage",  pvValeur: 25,  photo: "https://placehold.co/120x120/fdd835/333?text=Yuzu" },
  // ── Variétés pommes de terre ────────────────────────────────────────────
  { id: "VFP00116",nom: "Pommes de terre rouge",    nomAr: "بطاطا حمراء",    famille: "Légumes racines",  unite: "kg", stockDisponible: 600, stockDefect: 12, prixAchat: 2.0, pvMethode: "montant",     pvValeur: 1.5, shelfLifeJours: 30, photo: "https://placehold.co/120x120/c0392b/fff?text=P.Terre+Rouge" },
  { id: "VFP00117",nom: "Pommes de terre blanche",  nomAr: "بطاطا بيضاء",    famille: "Légumes racines",  unite: "kg", stockDisponible: 900, stockDefect: 15, prixAchat: 1.8, pvMethode: "montant",     pvValeur: 1.2, shelfLifeJours: 30, photo: "https://placehold.co/120x120/f5f5dc/333?text=P.Terre+Blanche" },
  { id: "VFP00118",nom: "Pommes de terre frite",    nomAr: "بطاطا للقلي",    famille: "Légumes racines",  unite: "kg", stockDisponible: 750, stockDefect: 10, prixAchat: 2.2, pvMethode: "montant",     pvValeur: 1.5, shelfLifeJours: 21, photo: "https://placehold.co/120x120/f39c12/fff?text=P.Terre+Frite" },
  { id: "VFP00119",nom: "Pommes de terre douce",    nomAr: "بطاطا حلوة",     famille: "Légumes racines",  unite: "kg", stockDisponible: 200, stockDefect: 6,  prixAchat: 3.5, pvMethode: "pourcentage", pvValeur: 57,  shelfLifeJours: 21, photo: "https://placehold.co/120x120/e07b39/fff?text=P.Terre+Douce" },
  // ── Variétés tomates ────────────────────────────────────────────────────
  { id: "VFP00120",nom: "Tomates rondes",           nomAr: "طماطم مستديرة",  famille: "Légumes fruits",   unite: "kg", stockDisponible: 400, stockDefect: 15, prixAchat: 2.3, pvMethode: "pourcentage", pvValeur: 65,  shelfLifeJours: 7,  photo: "https://placehold.co/120x120/e74c3c/fff?text=Tomate+Ronde" },
  { id: "VFP00121",nom: "Tomates longues",          nomAr: "طماطم طويلة",    famille: "Légumes fruits",   unite: "kg", stockDisponible: 250, stockDefect: 10, prixAchat: 2.6, pvMethode: "pourcentage", pvValeur: 62,  shelfLifeJours: 7,  photo: "https://placehold.co/120x120/c0392b/fff?text=Tomate+Longue" },
  { id: "VFP00122",nom: "Tomates grappe",           nomAr: "طماطم عنقودية",  famille: "Légumes fruits",   unite: "kg", stockDisponible: 150, stockDefect: 5,  prixAchat: 5.0, pvMethode: "pourcentage", pvValeur: 60,  shelfLifeJours: 10, photo: "https://placehold.co/120x120/a93226/fff?text=Tomate+Grappe" },
  // ── Pommes variétés ─────────────────────────────────────────────────────
  { id: "VFP00123",nom: "Pommes Golden",            nomAr: "تفاح ذهبي",      famille: "Fruits tropicaux", unite: "kg", stockDisponible: 300, stockDefect: 8,  prixAchat: 4.5, pvMethode: "pourcentage", pvValeur: 44,  shelfLifeJours: 30, photo: "https://placehold.co/120x120/f4d03f/333?text=Pomme+Golden" },
  { id: "VFP00124",nom: "Pommes Royal Gala",        nomAr: "تفاح غالا",      famille: "Fruits tropicaux", unite: "kg", stockDisponible: 250, stockDefect: 6,  prixAchat: 5.0, pvMethode: "pourcentage", pvValeur: 50,  shelfLifeJours: 30, photo: "https://placehold.co/120x120/e74c3c/fff?text=Pomme+Gala" },
  { id: "VFP00125",nom: "Pommes Granny Smith",      nomAr: "تفاح أخضر",      famille: "Fruits tropicaux", unite: "kg", stockDisponible: 180, stockDefect: 5,  prixAchat: 5.5, pvMethode: "pourcentage", pvValeur: 45,  shelfLifeJours: 35, photo: "https://placehold.co/120x120/27ae60/fff?text=Granny+Smith" },
  // ── Oignons variétés ────────────────────────────────────────────────────
  { id: "VFP00126",nom: "Oignons rouges",           nomAr: "بصل أحمر",       famille: "Légumes racines",  unite: "kg", stockDisponible: 200, stockDefect: 5,  prixAchat: 2.5, pvMethode: "pourcentage", pvValeur: 60,  shelfLifeJours: 45, photo: "https://placehold.co/120x120/8e44ad/fff?text=Oignon+Rouge" },
  { id: "VFP00127",nom: "Oignons blancs",           nomAr: "بصل أبيض",       famille: "Légumes racines",  unite: "kg", stockDisponible: 180, stockDefect: 5,  prixAchat: 2.2, pvMethode: "pourcentage", pvValeur: 64,  shelfLifeJours: 45, photo: "https://placehold.co/120x120/f0f0f0/333?text=Oignon+Blanc" },
  { id: "VFP00128",nom: "Oignons verts",            nomAr: "بصل أخضر",       famille: "Légumes racines",  unite: "botte", stockDisponible: 120, stockDefect: 4, prixAchat: 1.5, pvMethode: "montant", pvValeur: 1.0, shelfLifeJours: 7, photo: "https://placehold.co/120x120/27ae60/fff?text=Oignon+Vert" },
  // ── Poivrons variétés ────────────────────────────────────────────────────
  { id: "VFP00129",nom: "Poivrons rouges",          nomAr: "فلفل أحمر",      famille: "Légumes fruits",   unite: "kg", stockDisponible: 120, stockDefect: 4,  prixAchat: 5.0, pvMethode: "pourcentage", pvValeur: 60,  shelfLifeJours: 14, photo: "https://placehold.co/120x120/e74c3c/fff?text=Poivron+Rouge" },
  { id: "VFP00130",nom: "Poivrons verts",           nomAr: "فلفل أخضر",      famille: "Légumes fruits",   unite: "kg", stockDisponible: 130, stockDefect: 4,  prixAchat: 3.5, pvMethode: "pourcentage", pvValeur: 57,  shelfLifeJours: 14, photo: "https://placehold.co/120x120/27ae60/fff?text=Poivron+Vert" },
  { id: "VFP00131",nom: "Poivrons jaunes",          nomAr: "فلفل أصفر",      famille: "Légumes fruits",   unite: "kg", stockDisponible: 80,  stockDefect: 3,  prixAchat: 6.0, pvMethode: "pourcentage", pvValeur: 50,  shelfLifeJours: 14, photo: "https://placehold.co/120x120/f4d03f/333?text=Poivron+Jaune" },
  // ── Concombres variétés ─────────────────────────────────────────────────
  { id: "VFP00132",nom: "Concombres libanais",      nomAr: "خيار لبناني",    famille: "Légumes fruits",   unite: "kg", stockDisponible: 100, stockDefect: 3,  prixAchat: 3.0, pvMethode: "pourcentage", pvValeur: 67,  shelfLifeJours: 10, photo: "https://placehold.co/120x120/1abc9c/fff?text=Conc+Liban" },
  // ── Courgettes variétés ─────────────────────────────────────────────────
  { id: "VFP00133",nom: "Courgettes rondes",        nomAr: "كوسة مستديرة",   famille: "Légumes fruits",   unite: "kg", stockDisponible: 80,  stockDefect: 3,  prixAchat: 3.5, pvMethode: "pourcentage", pvValeur: 57,  shelfLifeJours: 10, photo: "https://placehold.co/120x120/27ae60/fff?text=Courgette+Ronde" },
  { id: "VFP00134",nom: "Courgettes jaunes",        nomAr: "كوسة صفراء",     famille: "Légumes fruits",   unite: "kg", stockDisponible: 50,  stockDefect: 2,  prixAchat: 4.0, pvMethode: "pourcentage", pvValeur: 50,  shelfLifeJours: 10, photo: "https://placehold.co/120x120/f4d03f/333?text=Courgette+Jaune" },
  // ── Laitues variétés ────────────────────────────────────────────────────
  { id: "VFP00135",nom: "Laitue iceberg",           nomAr: "خس ايسبرغ",      famille: "Légumes feuilles", unite: "pièce", stockDisponible: 80, stockDefect: 3,  prixAchat: 2.5, pvMethode: "montant", pvValeur: 1.5, shelfLifeJours: 7, photo: "https://placehold.co/120x120/a9dfbf/333?text=Iceberg" },
  { id: "VFP00136",nom: "Laitue frisée",            nomAr: "خس مجعد",        famille: "Légumes feuilles", unite: "pièce", stockDisponible: 60, stockDefect: 3,  prixAchat: 2.0, pvMethode: "montant", pvValeur: 1.5, shelfLifeJours: 5, photo: "https://placehold.co/120x120/2ecc71/fff?text=Laitue+Frisee" },
]

const DEFAULT_FOURNISSEURS: Fournisseur[] = [
  {
    id: "VFF00001", nom: "Marche Central Casablanca", contact: "Ahmed Tazi", telephone: "0600000001", email: "marche@central.ma",
    adresse: "Bd Mohamed V, Derb Omar", ville: "Casablanca", region: "Casablanca-Settat",
    specialites: ["Legumes fruits", "Legumes racines", "Agrumes"],
    modalitePaiement: "cash",
    itineraires: [
      { nom: "Marche Derb Omar", jour: "Lundi", heureDepart: "05:00", heureArrivee: "07:00", lat: 33.5950, lng: -7.6190 },
      { nom: "Marche de gros Bernoussi", jour: "Jeudi", heureDepart: "04:30", heureArrivee: "06:30", lat: 33.6300, lng: -7.5400 },
    ],
  },
  {
    id: "VFF00002", nom: "Grossiste Sahel Soualem", contact: "Karim Sahel", telephone: "0600000002", email: "sahel@grossiste.ma",
    adresse: "Souk Had Soualem", ville: "Soualem", region: "Casablanca-Settat",
    specialites: ["Fruits tropicaux", "Fruits rouges", "Pommes", "Poires"],
    modalitePaiement: "cheque",
    itineraires: [
      { nom: "Had Soualem", jour: "Dimanche", heureDepart: "06:00", heureArrivee: "08:00", lat: 33.4500, lng: -7.5200 },
    ],
  },
  {
    id: "VFF00003", nom: "Cooperative Atlas Meknes", contact: "Fatima Oumansour", telephone: "0600000003", email: "atlas@coop.ma",
    adresse: "Route de Azrou, Km 5", ville: "Meknes", region: "Fes-Meknes",
    specialites: ["Legumes feuilles", "Herbes aromatiques", "Pommes", "Raisins", "Grenades"],
    modalitePaiement: "traite_30",
    itineraires: [
      { nom: "Marche Meknes", jour: "Mardi", heureDepart: "07:00", heureArrivee: "11:00", lat: 33.8935, lng: -5.5473 },
      { nom: "Depart vers Casablanca", jour: "Mardi", heureDepart: "11:30", heureArrivee: "15:00", lat: 33.5731, lng: -7.5898 },
    ],
  },
  {
    id: "f4", nom: "Agro Souss Agadir", contact: "Rachid Aouad", telephone: "0600000004", email: "aouad@agrosouss.ma",
    adresse: "Zone industrielle Ait Melloul", ville: "Agadir", region: "Souss-Massa",
    specialites: ["Tomates", "Poivrons", "Courgettes", "Agrumes", "Avocats"],
    modalitePaiement: "virement",
    itineraires: [
      { nom: "Livraison Casablanca", jour: "Mercredi", heureDepart: "22:00", heureArrivee: "06:00", lat: 33.5731, lng: -7.5898 },
      { nom: "Livraison Casablanca", jour: "Samedi", heureDepart: "22:00", heureArrivee: "06:00", lat: 33.5731, lng: -7.5898 },
    ],
  },
  {
    id: "f5", nom: "Primeurs Zaer Rabat", contact: "Hassan Zaer", telephone: "0600000005", email: "zaer@primeurs.ma",
    adresse: "Souk Larbaa Oulad Hriz", ville: "Rabat", region: "Rabat-Sale-Kenitra",
    specialites: ["Laitue", "Epinards", "Carottes", "Navets", "Betteraves"],
    modalitePaiement: "cash",
    itineraires: [
      { nom: "Marche de Rabat", jour: "Lundi", heureDepart: "04:00", heureArrivee: "07:00", lat: 34.0209, lng: -6.8416 },
      { nom: "Marche de Rabat", jour: "Vendredi", heureDepart: "04:00", heureArrivee: "07:00", lat: 34.0209, lng: -6.8416 },
    ],
  },
  {
    id: "f6", nom: "Importateur Royal Fruits", contact: "Youssef Benkirane", telephone: "0600000006", email: "royal@importfruits.ma",
    adresse: "Port de Casablanca, Zone franche", ville: "Casablanca", region: "Casablanca-Settat",
    specialites: ["Bananes", "Ananas", "Kiwis", "Mangues", "Dattes importees"],
    modalitePaiement: "traite_60",
    itineraires: [
      { nom: "Debarquement port", jour: "Vendredi", heureDepart: "08:00", heureArrivee: "12:00", lat: 33.6100, lng: -7.6200 },
    ],
  },
]

const DEFAULT_LIVREURS: Livreur[] = [
  { id: "l1", type: "interne", nom: "Alami", prenom: "Hassan", telephone: "0670000001", typeVehicule: "camion", marqueVehicule: "Mercedes Actros", matricule: "123-A-20", capaciteCaisses: 300, capaciteTonnage: 5000, actif: true },
  { id: "l2", type: "interne", nom: "Benali", prenom: "Rachid", telephone: "0670000002", typeVehicule: "camionnette", marqueVehicule: "Renault Master", matricule: "456-B-20", capaciteCaisses: 150, capaciteTonnage: 2000, actif: true },
  { id: "l3", type: "externe", nom: "Belhaj", prenom: "Driss", telephone: "0670000003", societe: "Transport Rapid SARL", typeVehicule: "fourgon", marqueVehicule: "Ford Transit", matricule: "789-C-20", capaciteCaisses: 200, capaciteTonnage: 3000, actif: true },
]

const DEFAULT_MOTIFS_RETOUR: MotifRetour[] = [
  { id: "m1", label: "Fermé", labelAr: "مغلق", actif: true },
  { id: "m2", label: "Pas commandé", labelAr: "لم يطلب", actif: true },
  { id: "m3", label: "Qualité", labelAr: "جودة", actif: true },
  { id: "m4", label: "Prix", labelAr: "السعر", actif: true },
  { id: "m5", label: "Retard", labelAr: "تأخير", actif: true },
  { id: "m6", label: "Problème paiement", labelAr: "مشكل الدفع", actif: true },
  { id: "m7", label: "Responsable absent", labelAr: "المسؤول غائب", actif: true },
  { id: "m8", label: "Autre", labelAr: "أخرى", actif: true },
]

const DEFAULT_EMAIL_CONFIG: EmailConfig = {
  achat: "",
  commercial: "",
  recap: "",
  besoinAchat: "",
  recapHeure: "18:00",
  recapAuto: false,
  besoinAuto: false,
  besoinHeure: "07:00",
  besoinDelaiMinutes: 0,
  besoinPushAuto: true,
  tarifKmLivreur: 0.45,
  prixCarburantL: 15,
  tarifCaisseLivreur: 0.80,
  tarifClientLivreur: 2.50,
  primePonctualite: 30,
  customPrimes: [],
}

// ============================================================
// HELPERS
// ============================================================

function getLS<T>(key: string, def: T): T {
  if (typeof window === "undefined") return def
  try {
    const v = localStorage.getItem(key)
    if (v) return JSON.parse(v)
  } catch { /* fall through to cloned default below */ }
  // Clone plutôt que retourner `def` par référence : un appelant qui fait
  // arr.push(...) sur le résultat (ex: addFournisseur, addX) mutait sinon la
  // constante DEFAULT_* partagée en mémoire — corrompant tous les appels
  // suivants pour le reste de la session (reproduit avec addFournisseur sur
  // un appareil jamais synchronisé : la mutation apparaissait dupliquée dans
  // le state React sans qu'aucun setState en trop ait été appelé).
  try { return JSON.parse(JSON.stringify(def)) } catch { return def }
}

function setLS<T>(key: string, val: T): void {
  if (typeof window === "undefined") return
  const raw = JSON.stringify(val)
  localStorage.setItem(key, raw)
  window.dispatchEvent(new CustomEvent("fl_store_updated", { detail: key }))
  // Write-through Supabase : Supabase est la source de vérité, localStorage
  // n'est qu'un cache/tampon hors-ligne. Fire-and-forget, ignoré si la table
  // n'est pas synchronisée. (import dynamique → client only, pas de cycle)
  import("@/lib/supabase/autoSync").then(m => m.onLocalWrite(key, raw)).catch(() => {})
}

// Propagation explicite d'une suppression vers Supabase (les deletes ne peuvent
// pas être déduits d'un diff localStorage). Sans ça, une ligne supprimée reste
// en base et « revient » au prochain fetch.
function deleteSynced(table: string, ids: string[]): void {
  if (typeof window === "undefined" || ids.length === 0) return
  import("@/lib/supabase/autoSync").then(m => m.syncDelete(table, ids)).catch(() => {})
}

// ============================================================
// DEMO GUARD — demo accounts cannot mutate persistent data
// ============================================================

// Emails of the built-in demo accounts that must stay read-only
// NOTE: super_admin (appprojet2@gmail.com) and admin (admin@freshlink.ma) are NOT demo — they have full write access
const DEMO_EMAILS = new Set([
  "responsable@freshlink.ma",
  "sara@freshlink.ma",
  "karim.v@freshlink.ma",
  "logistique@freshlink.ma",
  "dispatch@freshlink.ma",
  "magasin@freshlink.ma",
  "cashman@freshlink.ma",
  "financier@freshlink.ma",
  "livreur@freshlink.ma",
  "client.demo@freshlink.ma",
  "fournisseur.demo@freshlink.ma",
])

export function isDemoUser(user: User | null): boolean {
  if (!user) return false
  if (user.isDemo === true) return true
  return DEMO_EMAILS.has((user.email ?? "").toLowerCase())
}

// Wraps a write function — silently no-ops for demo users
function guardWrite<T extends unknown[]>(
  fn: (...args: T) => void,
  getCurrentUser: () => User | null
): (...args: T) => void {
  return (...args: T) => {
    const u = getCurrentUser()
    if (isDemoUser(u)) return // block writes for demo accounts
    fn(...args)
  }
}

// Les comptes auto-inscrits (demande de compte web, /api/ext/demande-compte)
// sont stockés avec un mot de passe haché bcrypt ($2a$/$2b$...). Sans ce
// helper, login() comparait en texte brut et ces comptes ne pouvaient JAMAIS
// se connecter (visibles dans Supabase + BO, mais "mot de passe incorrect"
// systématique) — c'est exactement le même algorithme que /api/ext/auth.
export function passwordMatches(stored: string | undefined, input: string): boolean {
  if (!stored) return false
  if (/^\$2[aby]\$/.test(stored)) {
    try { return bcrypt.compareSync(input, stored) } catch { return false }
  }
  return stored === input
}

// ── Équipes/Groupes (isolation des données) ─────────────────────────────────
// Un groupe = un admin racine (super_admin/admin/super_super_admin). Un
// compte sans groupeId explicite est lui-même racine de son propre groupe —
// les comptes créés « sous » cet admin héritent de son id comme groupeId.
export function effectiveGroupId(user: User): string {
  return user.groupeId ?? user.id
}

// Seul Jawad (super_super_admin) voit toutes les équipes combinées.
export function canSeeAllGroups(user: User | null | undefined): boolean {
  return user?.role === "super_super_admin"
}

// Un client est visible si : l'utilisateur voit tout (super_super_admin),
// le client n'est pas encore rattaché à une équipe (legacy/partagé par
// toutes les équipes, transition douce), ou il appartient à l'équipe de
// l'utilisateur connecté.
export function isClientVisible(client: Client, user: User | null | undefined): boolean {
  if (canSeeAllGroups(user)) return true
  if (client.groupeId == null) return true
  if (!user) return false
  return client.groupeId === effectiveGroupId(user)
}

// ============================================================
// STORE API
// ============================================================

export const store = {
  // --- Users ---
  getUsers: (): User[] => {
    // Seed minimal : sur un appareil neuf (ou après reset), on ne sème QUE le
    // super administrateur — plus de comptes démo/par défaut qui réapparaissent.
    // Les comptes réels arrivent via la synchro Supabase ; le jeu démo complet
    // reste disponible via le bouton « Recharger démo » (seedDemoData).
    const raw: User[] = getLS("fl_users", [JAWAD_USER])
    // Supprimer TOUS les doublons Jawad :
    // - l'ancien ID "u_jawad_root"
    // - tout utilisateur avec l'email jawad@vita-fresh.ma qui n'est pas VFU00001
    const clean = raw.filter(u =>
      u.id !== "u_jawad_root" &&
      !(String(u.email ?? "").toLowerCase() === "jawad@vita-fresh.ma" && u.id !== JAWAD_ID) &&
      // Lignes système (marqueurs internes stockés dans fl_users, ex. révocation
      // de sessions) — jamais de vrais utilisateurs, à ne jamais afficher/lister.
      !String(u.id ?? "").startsWith("__")
    )
    // Migrer localStorage si nécessaire (u_jawad_root présent → on sauvegarde proprement)
    const hadLegacy = raw.some(u => u.id === "u_jawad_root")
    if (hadLegacy) {
      try { localStorage.setItem("fl_users", JSON.stringify(clean)) } catch {}
    }
    const hasJawad = clean.some(u => u.id === JAWAD_ID)
    const base = hasJawad ? clean : [JAWAD_USER, ...clean]
    return base.map(u => {
      if (u.id === JAWAD_ID) return { ...JAWAD_USER, ...u, name: "Jawad", role: "super_super_admin" as UserRole, telephone: "0647333456", password: "Medghaly@22", actif: true }
      if (u.role === "super_super_admin" || u.role === "super_admin" || u.role === "admin")
        return { canViewDatabase: true, canViewExternal: true, canCreateCommandeBO: true, ...u }
      return u
    })
  },
  saveUsers: (u: User[]) => setLS("fl_users", u),

  /** Switch the active role for a user (only if role is in their `roles` list) */
  switchActiveRole: (userId: string, newRole: UserRole): User | null => {
    const users = store.getUsers()
    const idx   = users.findIndex(u => u.id === userId)
    if (idx < 0) return null
    const user = users[idx]
    const available = user.roles && user.roles.length > 0 ? user.roles : [user.role]
    if (!available.includes(newRole)) return null
    const updated: User = { ...user, activeRole: newRole }
    users[idx] = updated
    store.saveUsers(users)
    return updated
  },

  // Returns { user, forcedView } where forcedView is set when a specific dual-password was matched
  login: (identifier: string, password: string): User | null => {
    const users = store.getUsers()
    const id = identifier.trim().toLowerCase()
    // Téléphone normalisé (sans espaces/tirets/points/+/préfixe 212) pour matcher
    // « 0647… », « +212647… » et « 647… » indifféremment — l'UI demande « Numéro
    // ou mot de passe » mais le login ne testait QUE email/nom → échec par numéro.
    const normPhone = (v: string) => v.replace(/[\s\-.+]/g, "").replace(/^212/, "0").replace(/^00212/, "0")
    const idPhone = normPhone(id)
    return users.find(u => {
      const idMatch =
        (u.email ?? "").toLowerCase() === id ||
        (u.name ?? "").toLowerCase() === id ||
        (!!u.telephone && idPhone.length >= 8 && normPhone((u.telephone ?? "").toLowerCase()) === idPhone)
      if (!idMatch || !u.actif) return false
      // Check all password variants
      return (
        passwordMatches(u.password, password) ||
        passwordMatches(u.passwordMobile, password) ||
        passwordMatches(u.passwordBO, password)
      )
    }) || null
  },

  // Returns which view to force based on which dual-password matched
  // Returns null if no dual-password match (use normal routing)
  loginGetForcedView: (identifier: string, password: string): "mobile" | "backoffice" | null => {
    const users = store.getUsers()
    const u = users.find(u => {
      const idMatch =
        (u.email ?? "").toLowerCase() === identifier.toLowerCase() ||
        (u.name ?? "").toLowerCase() === identifier.toLowerCase()
      return idMatch && u.actif
    })
    if (!u) return null
    if (passwordMatches(u.passwordMobile, password)) return "mobile"
    if (passwordMatches(u.passwordBO, password)) return "backoffice"
    return null
  },

  // Client login — by name (case insensitive) for the portal (legacy)
  loginClient: (name: string): User | null => store.loginExternal(name, "client"),

  // External login — by name, phone, or email; subtype filters role
  loginExternal: (identifier: string, subtype?: "client" | "fournisseur" | "chr" | "particulier" | "marchand" | "ferme" | "vendeur" | "intermediaire"): User | null => {
    const users = store.getUsers()
    const raw = identifier.trim()
    const lower = raw.toLowerCase()
    const cleanPhone = raw.replace(/[\s\-\.\(\)]/g, "")
    // Resolve which role this subtype maps to
    const isFournisseurSubtype = subtype === "fournisseur" || subtype === "ferme" || subtype === "vendeur" || subtype === "intermediaire"
    const isClientSubtype     = subtype === "client" || subtype === "chr" || subtype === "particulier" || subtype === "marchand"
    // La famille « client » inclut la hiérarchie CHR : propriétaire (→ accès ERP gestion)
    // et gérant. Sans ça, un compte client_proprietaire ne pourrait pas se connecter à l'ERP.
    const isClientFamily = (r: string) => r === "client" || r === "client_proprietaire" || r === "client_gerant"
    return users.find(u => {
      if (!u.actif) return false
      if (!isClientFamily(u.role) && u.role !== "fournisseur") return false
      if (isFournisseurSubtype && u.role !== "fournisseur") return false
      if (isClientSubtype && !isClientFamily(u.role)) return false
      // If user has a stored subtype, it must match (allows "particulier" to not match a "chr" user)
      if (u.subtype && subtype && u.subtype !== subtype) {
        // Group chr separately; particulier/marchand can cross-match with each other
        const chrOnly = subtype === "chr" || u.subtype === "chr"
        if (chrOnly && subtype !== u.subtype) return false
      }
      if (u.email && u.email.toLowerCase() === lower) return true
      if (u.phone && u.phone.replace(/[\s\-\.\(\)]/g, "") === cleanPhone) return true
      if (u.telephone && u.telephone.replace(/[\s\-\.\(\)]/g, "") === cleanPhone) return true
      if (subtype !== "chr" && u.name && u.name.toLowerCase() === lower) return true
      return false
    }) || null
  },

  // --- Session ---
  getSession: (): User | null => getLS("fl_session", null),
  setSession: (u: User | null) => setLS("fl_session", u),
  logout: () => setLS("fl_session", null),

  // --- Read-only guard ---
  // Returns true if the current session is a demo account (writes should be blocked)
  isReadOnly: (): boolean => {
    const u = getLS<User | null>("fl_session", null)
    return isDemoUser(u)
  },

  // --- Clients ---
  getClients: (): Client[] => {
    const raw = getLS<Client[]>("fl_clients", DEFAULT_CLIENTS)
    if (!Array.isArray(raw)) return DEFAULT_CLIENTS
    // Déduplication par id, puis par nom+téléphone normalisés — corrige les
    // clients affichés 2-3 fois (Affectation Commerciale) et aligne BO ↔ mobile.
    const byId = new Map<string, Client>()
    for (const c of raw) if (c && c.id != null) byId.set(String(c.id), c)
    const norm = (s: unknown) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim()
    const score = (c: Client) =>
      (c.telephone ? 1 : 0) + (c.adresse ? 1 : 0) + (c.secteur ? 1 : 0) +
      ((c as { gpsLat?: number }).gpsLat ? 1 : 0)
    const byKey = new Map<string, Client>()
    for (const c of byId.values()) {
      const nom = norm(c.nom)
      if (!nom) { byKey.set(c.id, c); continue }   // sans nom → on ne fusionne pas
      const key = nom + "|" + norm(c.telephone)
      const prev = byKey.get(key)
      if (!prev) { byKey.set(key, c); continue }
      byKey.set(key, score(c) > score(prev) ? c : prev)
    }
    return [...byKey.values()]
  },
  // Liste des clients visibles par l'utilisateur connecté (isolation par
  // équipe/groupe — cf. isClientVisible). À utiliser pour l'AFFICHAGE
  // (listes, tableaux de bord, recouvrement...) — jamais comme base d'une
  // lecture-modification-écriture (getClients() reste la source complète
  // pour addClient/updateClient/deleteClient, sous peine d'écraser en
  // sauvegarde les clients des autres équipes).
  getVisibleClients: (): Client[] => {
    const me = store.getSession()
    return store.getClients().filter(c => isClientVisible(c, me))
  },
  saveClients: (c: Client[]) => setLS("fl_clients", c),
  // Tague le nouveau client avec le groupe/équipe de son créateur (sauf si un
  // groupeId a déjà été fourni explicitement) — dès sa création, ce client
  // n'est plus visible que par l'équipe qui l'a recruté (cf. isClientVisible).
  addClient: (c: Client) => {
    const me = store.getSession()
    const stamped: Client = { ...c, groupeId: c.groupeId ?? (me ? effectiveGroupId(me) : undefined) }
    const cl = store.getClients(); cl.push(stamped); store.saveClients(cl); return stamped
  },
  updateClient: (id: string, updates: Partial<Client>) => {
    const cl = store.getClients()
    const idx = cl.findIndex(c => c.id === id)
    if (idx >= 0) { cl[idx] = { ...cl[idx], ...updates }; store.saveClients(cl) }
  },
  deleteClient: (id: string) => { store.saveClients(store.getClients().filter(c => c.id !== id)); deleteSynced("fl_clients", [id]) },

  // --- Articles ---
  // Normalisation défensive : un article importé/synchronisé peut arriver
  // sans nom/famille/unité (schéma plat, payload partiel) → garantit des
  // string/number pour que .toLowerCase()/.split()/.toLocaleString() ne
  // crashent plus les écrans (Catalogue, Stock, Tarifs, Marketplace).
  getArticles: (): Article[] => {
    const raw = getLS<Article[]>("fl_articles", DEFAULT_ARTICLES)
    if (!Array.isArray(raw)) return DEFAULT_ARTICLES
    const normalized = raw
      .filter(a => a && (a.id != null))
      .map(a => ({
        ...a,
        nom: String(a.nom ?? a.id ?? ""),
        nomAr: String(a.nomAr ?? ""),
        famille: String(a.famille ?? ""),
        unite: String(a.unite ?? "kg"),
        stockDisponible: Number(a.stockDisponible) || 0,
        stockDefect: Number(a.stockDefect) || 0,
        prixAchat: Number(a.prixAchat) || 0,
      }))
    // Déduplication par id — évite les doublons accumulés lors de syncs précédents
    // (ex: articles vus en double sur mobile acheteur/commercial)
    const byId = new Map<string, Article>()
    for (const a of normalized) byId.set(a.id, a)

    // Déduplication par NOM (FR) normalisé — fusionne les doublons à id différent
    // (ex: PO achat affichait "Tomate" 2 fois : une ligne FR seule, une FR+AR).
    // On garde l'enregistrement le plus complet et on récupère les champs
    // manquants depuis les doublons écartés (nomAr, photo, famille, prixAchat).
    const normNom = (s: string) =>
      s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim()
    const score = (a: Article) =>
      (a.nomAr ? 2 : 0) + (a.photo ? 1 : 0) + (a.famille ? 1 : 0) +
      (a.prixAchat > 0 ? 1 : 0) + (a.stockDisponible > 0 ? 1 : 0) +
      (a.marketplaceActif ? 1 : 0)
    const byNom = new Map<string, Article>()
    for (const a of byId.values()) {
      const key = normNom(a.nom)
      if (!key) { byNom.set(a.id, a); continue } // pas de nom → ne pas fusionner
      const prev = byNom.get(key)
      if (!prev) { byNom.set(key, a); continue }
      // garder le plus complet ; compléter ses trous depuis l'autre
      const keep = score(a) > score(prev) ? a : prev
      const drop = keep === a ? prev : a
      byNom.set(key, {
        ...keep,
        nomAr:   keep.nomAr   || drop.nomAr,
        photo:   keep.photo   || drop.photo,
        famille: keep.famille || drop.famille,
        prixAchat: keep.prixAchat > 0 ? keep.prixAchat : drop.prixAchat,
      })
    }
    return [...byNom.values()]
  },
  saveArticles: (a: Article[]) => setLS("fl_articles", a),

  // Reaffecte en masse tous les articles d'une famille vers une autre (fusion
  // ou renommage) — retourne le nombre d'articles touches. Le caller est
  // responsable de propager vers Supabase (upsertArticle) les ids modifies.
  reassignFamille: (oldNom: string, newNom: string): string[] => {
    const arts = store.getArticles()
    const touchedIds: string[] = []
    arts.forEach((a, i) => {
      if (a.famille === oldNom) { arts[i] = { ...a, famille: newNom }; touchedIds.push(a.id) }
    })
    if (touchedIds.length > 0) store.saveArticles(arts)
    return touchedIds
  },

  // Seuil d'ecart PA jugé suspect (faute de frappe/virgule, ex: 93 au lieu de
  // 9,30) — au-dela, mobile/BO doivent demander confirmation avant d'ecraser
  // le PA courant de l'article (cf. incident Menthe/Tomate Cencara/Mangue AF :
  // un PA errone saisi lors d'un achat écrasait silencieusement le catalogue).
  PA_DEVIATION_SEUIL_PCT: 50,

  // Retourne l'info de deviation si le nouveau PA saisi s'écarte de plus de
  // PA_DEVIATION_SEUIL_PCT% du PA actuel de l'article, sinon null (RAS).
  checkPaDeviationSuspecte: (articleId: string, nouveauPa: number): { articleNom: string; ancienPa: number; nouveauPa: number; deviationPct: number } | null => {
    if (!(nouveauPa > 0)) return null
    const art = store.getArticles().find(a => a.id === articleId)
    if (!art) return null
    const ancienPa = Number(art.prixAchat) || 0
    if (!(ancienPa > 0)) return null // premiere saisie : rien a comparer
    const deviationPct = Math.abs((nouveauPa - ancienPa) / ancienPa) * 100
    if (deviationPct < store.PA_DEVIATION_SEUIL_PCT) return null
    return { articleNom: art.nom, ancienPa, nouveauPa, deviationPct: Math.round(deviationPct) }
  },

  // Enregistrer un historique de prix d'achat pour un article
  addHistoriquePrixAchat: (articleId: string, entry: HistoriquePrixAchat) => {
    const arts = store.getArticles()
    const idx = arts.findIndex(a => a.id === articleId)
    if (idx < 0) return
    if (!arts[idx].historiquePrixAchat) arts[idx].historiquePrixAchat = []
    arts[idx].historiquePrixAchat!.unshift(entry)
    // garder les 50 derniers
    if (arts[idx].historiquePrixAchat!.length > 50) arts[idx].historiquePrixAchat = arts[idx].historiquePrixAchat!.slice(0, 50)
    arts[idx].prixAchat = entry.prixAchat  // mise a jour PA courant
    store.saveArticles(arts)
  },

  updateStock: (articleId: string, delta: number, defect = false) => {
    const articles = store.getArticles()
    const idx = articles.findIndex(a => a.id === articleId)
    if (idx >= 0) {
      if (defect) articles[idx].stockDefect = Math.max(0, articles[idx].stockDefect + delta)
      else articles[idx].stockDisponible = Math.max(0, articles[idx].stockDisponible + delta)
      store.saveArticles(articles)
    }
  },
  computePV: (article: Article, clientCategorie?: "chr" | "marchand" | "particulier"): number => {
    let pv: number
    switch (article.pvMethode) {
      case "pourcentage": pv = Math.round((article.prixAchat * (1 + article.pvValeur / 100)) * 100) / 100; break
      case "montant": pv = Math.round((article.prixAchat + article.pvValeur) * 100) / 100; break
      case "manuel": default: pv = article.pvValeur; break
    }
    if (clientCategorie === "chr" && article.prixCHR && article.prixCHR > 0) return article.prixCHR
    if (clientCategorie === "marchand" && article.prixMarchand && article.prixMarchand > 0) return article.prixMarchand
    if (clientCategorie === "particulier" && article.prixParticulier && article.prixParticulier > 0) return article.prixParticulier
    return pv
  },

  // Prix effectif appliqué à une commande réelle pour un client donné.
  // Priorité (le plus spécifique gagne) : override individuel (clientPrices)
  // > échelle (echellePrices) > secteur (secteurPrices) > catégorie (computePV)
  // > PV standard. La promo % et l'ajustement DH du niveau retenu sont
  // ensuite appliqués (même formule que l'écran Tarifs par Catégorie).
  computePrixEffectif: (article: Article, client?: Client | null): number => {
    let base: number
    let promo = 0
    let ajust = 0

    const clientOverride = client ? article.clientPrices?.[client.id] : undefined
    const echelleOverride = client?.echelle ? article.echellePrices?.[client.echelle] : undefined
    const secteurOverride = client?.secteur ? article.secteurPrices?.[client.secteur] : undefined

    if (clientOverride?.prix !== undefined && clientOverride.prix > 0) {
      base = clientOverride.prix
      promo = clientOverride.promo ?? 0
      ajust = clientOverride.ajust ?? 0
    } else if (echelleOverride?.prix !== undefined && echelleOverride.prix > 0) {
      base = echelleOverride.prix
      promo = echelleOverride.promo ?? 0
      ajust = echelleOverride.ajust ?? 0
    } else if (secteurOverride?.prix !== undefined && secteurOverride.prix > 0) {
      base = secteurOverride.prix
      promo = secteurOverride.promo ?? 0
      ajust = secteurOverride.ajust ?? 0
    } else {
      base = store.computePV(article, client?.categorie)
      // Promo/ajust du segment de catégorie s'appliquent aussi en fallback
      if (client?.categorie === "chr")         { promo = article.promoCHR ?? 0;         ajust = article.ajustCHR ?? 0 }
      else if (client?.categorie === "marchand")    { promo = article.promoMarchand ?? 0;    ajust = article.ajustMarchand ?? 0 }
      else if (client?.categorie === "particulier") { promo = article.promoParticulier ?? 0; ajust = article.ajustParticulier ?? 0 }
    }

    return Math.round((base * (1 - promo / 100) + ajust) * 100) / 100
  },

  // --- Non-achat signalements ---
  getNonAchatSignalements: (): NonAchatSignalement[] => getLS("fl_non_achats", []),
  saveNonAchatSignalements: (a: NonAchatSignalement[]) => setLS("fl_non_achats", a),
  addNonAchatSignalement: (a: NonAchatSignalement) => {
    const arr = store.getNonAchatSignalements(); arr.push(a); store.saveNonAchatSignalements(arr)
  },
  updateNonAchatSignalement: (id: string, updates: Partial<NonAchatSignalement>) => {
    const arr = store.getNonAchatSignalements()
    const idx = arr.findIndex(x => x.id === id)
    if (idx >= 0) { arr[idx] = { ...arr[idx], ...updates }; store.saveNonAchatSignalements(arr) }
  },

  // --- Actionnaires ---
  getActionnaires: (): Actionnaire[] => getLS("fl_actionnaires", []),
  saveActionnaires: (a: Actionnaire[]) => setLS("fl_actionnaires", a),
  addActionnaire: (a: Actionnaire) => { const arr = store.getActionnaires(); arr.push(a); store.saveActionnaires(arr) },
  updateActionnaire: (id: string, updates: Partial<Actionnaire>) => {
    const arr = store.getActionnaires()
    const idx = arr.findIndex(a => a.id === id)
    if (idx >= 0) { arr[idx] = { ...arr[idx], ...updates }; store.saveActionnaires(arr) }
  },
  deleteActionnaire: (id: string) => { store.saveActionnaires(store.getActionnaires().filter(a => a.id !== id)); deleteSynced("fl_actionnaires", [id]) },

  // --- Charges ---
  getCharges: (): Charge[] => getLS("fl_charges", []),
  saveCharges: (c: Charge[]) => setLS("fl_charges", c),
  addCharge: (c: Charge) => { const arr = store.getCharges(); arr.push(c); store.saveCharges(arr) },
  updateCharge: (id: string, updates: Partial<Charge>) => {
    const arr = store.getCharges()
    const idx = arr.findIndex(c => c.id === id)
    if (idx >= 0) { arr[idx] = { ...arr[idx], ...updates }; store.saveCharges(arr) }
  },
  deleteCharge: (id: string) => { store.saveCharges(store.getCharges().filter(c => c.id !== id)); deleteSynced("fl_charges", [id]) },

  // --- Charges par article (coût de revient) ---
  getChargesArticle: (): ChargeArticle[] => {
    const stored = getLS<ChargeArticle[]>("fl_charges_article", [])
    return stored.length > 0 ? stored : DEFAULT_CHARGES_ARTICLE   // jamais vide
  },
  saveChargesArticle: (c: ChargeArticle[]) => setLS("fl_charges_article", c),

  // --- Caisse ---
  getCaisseEntries: (): CaisseEntry[] => getLS("fl_caisse", []),
  saveCaisseEntries: (e: CaisseEntry[]) => setLS("fl_caisse", e),
  // Solde caisse à l'instant T = somme des entrées - somme des sorties.
  getCaisseSolde: (): number => {
    const entries = store.getCaisseEntries()
    return entries.reduce((s, e) => s + (e.type === "entree" ? e.montant : -e.montant), 0)
  },
  // Contrôle caisse négative (hard lock) : toute sortie espèces qui ferait
  // passer le solde sous zéro est refusée — jamais de caisse négative à
  // l'instant T. Retourne { ok:false } au lieu de lancer une exception pour
  // que l'appelant affiche un message clair sans try/catch.
  addCaisseEntry: (e: CaisseEntry): { ok: boolean; error?: string; solde?: number } => {
    if (e.type === "sortie") {
      const soldeActuel = store.getCaisseSolde()
      if (soldeActuel - e.montant < 0) {
        return { ok: false, error: `Solde caisse insuffisant (${soldeActuel.toFixed(2)} DH) pour cette sortie de ${e.montant.toFixed(2)} DH — la caisse ne peut jamais être négative.`, solde: soldeActuel }
      }
    }
    const arr = store.getCaisseEntries(); arr.push(e); store.saveCaisseEntries(arr)
    return { ok: true }
  },
  deleteCaisseEntry: (id: string) => { store.saveCaisseEntries(store.getCaisseEntries().filter(e => e.id !== id)); deleteSynced("fl_caisse_entries", [id]) },

  // --- Reserve caisse historique ---
  getReserveSnaps: (): ReserveCaisseSnap[] => getLS("fl_reserve_snaps", []),
  addReserveSnap: (s: ReserveCaisseSnap) => {
    const arr = getLS<ReserveCaisseSnap[]>("fl_reserve_snaps", [])
    arr.unshift(s)
    setLS("fl_reserve_snaps", arr)
  },

  // --- Salaries ---
  getSalaries: (): Salarie[] => getLS("fl_salaries", []),
  saveSalaries: (s: Salarie[]) => setLS("fl_salaries", s),
  addSalarie: (s: Salarie) => { const arr = store.getSalaries(); arr.push(s); store.saveSalaries(arr) },
  updateSalarie: (id: string, updates: Partial<Salarie>) => {
    const arr = store.getSalaries()
    const idx = arr.findIndex(s => s.id === id)
    if (idx >= 0) { arr[idx] = { ...arr[idx], ...updates }; store.saveSalaries(arr) }
  },
  deleteSalarie: (id: string) => { store.saveSalaries(store.getSalaries().filter(s => s.id !== id)); deleteSynced("fl_salaries", [id]) },

  // --- RH Notifications ---
  getRHNotifications: (): RHNotification[] => getLS("fl_rh_notifications", []),
  saveRHNotifications: (n: RHNotification[]) => setLS("fl_rh_notifications", n),
  addRHNotification: (n: RHNotification) => {
    const arr = store.getRHNotifications()
    arr.unshift(n)
    if (arr.length > 200) arr.splice(200)
    store.saveRHNotifications(arr)
  },
  markRHNotifLu: (id: string) => {
    const arr = store.getRHNotifications()
    const idx = arr.findIndex(n => n.id === id)
    if (idx >= 0) { arr[idx] = { ...arr[idx], lu: true }; store.saveRHNotifications(arr) }
  },
  markRHNotifTraite: (id: string) => {
    const arr = store.getRHNotifications()
    const idx = arr.findIndex(n => n.id === id)
    if (idx >= 0) { arr[idx] = { ...arr[idx], lu: true, traite: true }; store.saveRHNotifications(arr) }
  },
  countRHNotifUnread: (): number => store.getRHNotifications().filter(n => !n.lu).length,

  // --- Paiements salaires ---
  getPaiementsSalaires: (): PaiementSalaire[] => getLS("fl_paiements_salaires", []),
  addPaiementSalaire: (p: PaiementSalaire) => {
    const arr = store.getPaiementsSalaires()
    arr.unshift(p)
    setLS("fl_paiements_salaires", arr)
  },

  // --- Retenues Caisse Acheteur → RH ---
  // Écart positif de caisse transmis à la RH : déduit automatiquement du salaire
  // de l'acheteur (BOResources lit ces retenues par nom + mois).
  getRetenuesCaisse: (): RetenueCaisse[] => getLS("fl_retenues_caisse", []),
  saveRetenuesCaisse: (r: RetenueCaisse[]) => setLS("fl_retenues_caisse", r),
  upsertRetenueCaisse: (r: RetenueCaisse) => {
    const arr = store.getRetenuesCaisse().filter(x => x.ref !== r.ref)  // 1 retenue par ligne caisse
    arr.unshift(r)
    setLS("fl_retenues_caisse", arr)
  },
  removeRetenueCaisse: (ref: string) => {
    setLS("fl_retenues_caisse", store.getRetenuesCaisse().filter(x => x.ref !== ref))
  },

  // --- Caisse Pricing ---
  getCaissePricing: (): CaissePricing => getLS("fl_caisse_pricing", DEFAULT_CAISSE_PRICING),
  saveCaissePricing: (p: CaissePricing) => setLS("fl_caisse_pricing", p),

  // --- Contenants / Tares ---
  getContenantsConfig: (): ContenantTare[] => getLS("fl_contenants_tare", DEFAULT_CONTENANTS_TARE),
  saveContenantsConfig: (c: ContenantTare[]) => setLS("fl_contenants_tare", c),
  addContenant: (c: ContenantTare) => { const arr = store.getContenantsConfig(); arr.push(c); store.saveContenantsConfig(arr) },
  updateContenant: (id: string, updates: Partial<ContenantTare>) => {
    const arr = store.getContenantsConfig()
    const idx = arr.findIndex(c => c.id === id)
    if (idx >= 0) { arr[idx] = { ...arr[idx], ...updates }; store.saveContenantsConfig(arr) }
  },
  deleteContenant: (id: string) => { store.saveContenantsConfig(store.getContenantsConfig().filter(c => c.id !== id)) },

  // --- Mouvements caisses vides ---
  getCaissesMovements: (): CaisseVideMouvement[] => getLS("fl_caisses_mouvements", []),
  saveCaissesMovements: (m: CaisseVideMouvement[]) => setLS("fl_caisses_mouvements", m),
  addCaisseMouvement: (m: CaisseVideMouvement) => {
    const arr = store.getCaissesMovements()
    arr.unshift(m)
    setLS("fl_caisses_mouvements", arr)
    // Auto-update stock caisses vides
    const caisses = store.getCaissesVides()
    const updateCaisse = (type: TypeCaisse, nb: number, sens: "sortie" | "entree") => {
      if (nb <= 0) return
      const idx = caisses.findIndex(c => c.type === type)
      if (idx < 0) return
      if (sens === "sortie") {
        caisses[idx].stock = Math.max(0, caisses[idx].stock - nb)
        caisses[idx].enCirculation = (caisses[idx].enCirculation ?? 0) + nb
      } else {
        caisses[idx].stock += nb
        caisses[idx].enCirculation = Math.max(0, (caisses[idx].enCirculation ?? 0) - nb)
      }
    }
    updateCaisse("gros", m.nbCaisseGros, m.sens)
    updateCaisse("demi", m.nbCaisseDemi, m.sens)
    store.saveCaissesVides(caisses)
  },

  // --- Caisses vides ---
  getCaissesVides: (): CaisseVide[] => getLS("fl_caisses_vides", [
    { id: "cv_gros",  type: "gros",  libelle: "Gros caisse",  capaciteKg: 30, stock: 0, enCirculation: 0 },
    { id: "cv_demi",  type: "demi",  libelle: "Demi caisse",  capaciteKg: 15, stock: 0, enCirculation: 0 },
  ]),
  saveCaissesVides: (c: CaisseVide[]) => setLS("fl_caisses_vides", c),
  updateCaisseVide: (id: string, updates: Partial<CaisseVide>) => {
    const arr = store.getCaissesVides()
    const idx = arr.findIndex(c => c.id === id)
    if (idx >= 0) { arr[idx] = { ...arr[idx], ...updates }; store.saveCaissesVides(arr) }
  },
  // Sortie caisses (vers livreur / client)
  sortieCaissesVides: (id: string, nb: number) => {
    const arr = store.getCaissesVides()
    const idx = arr.findIndex(c => c.id === id)
    if (idx >= 0) {
      const sortie = Math.min(nb, arr[idx].stock)
      arr[idx].stock = Math.max(0, arr[idx].stock - sortie)
      arr[idx].enCirculation += sortie
      store.saveCaissesVides(arr)
    }
  },
  // Retour caisses (du livreur / client)
  retourCaissesVides: (id: string, nb: number) => {
    const arr = store.getCaissesVides()
    const idx = arr.findIndex(c => c.id === id)
    if (idx >= 0) {
      const retour = Math.min(nb, arr[idx].enCirculation)
      arr[idx].stock += retour
      arr[idx].enCirculation = Math.max(0, arr[idx].enCirculation - retour)
      store.saveCaissesVides(arr)
    }
  },

  // --- Company config ---
  getCompanyConfig: (): CompanyConfig => getLS("fl_company", {
    nom: "Vita Fresh", adresse: "", ville: "Casablanca", pays: "Maroc",
    telephone: "", email: "", couleurEntete: "#1a4f2a",
    appName: "FreshLink Pro", appSlogan: "Vita Fresh",
  }),
  saveCompanyConfig: (c: CompanyConfig) => {
    setLS("fl_company", c)
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("fl_company_updated"))
    }
  },

  // --- Company contacts (coordonnées publiques + WhatsApp) ---
  getCompanyContacts: (): CompanyContacts => getLS("fl_company_contacts", {
    tel_principal: "",
    whatsapp_principal: "",
    email_principal: "",
    ville: "Casablanca",
    pays: "Maroc",
    horaires_ouverture: "Lun-Sam : 06h00 - 20h00",
    horaires_livraison: "Lun-Sam : 07h00 - 18h00",
    zone_livraison: "Casablanca et région",
  }),
  saveCompanyContacts: (c: CompanyContacts) => {
    setLS("fl_company_contacts", c)
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("fl_contacts_updated"))
    }
  },

  // --- Fournisseurs ---
  getFournisseurs: (): Fournisseur[] => getLS("fl_fournisseurs", DEFAULT_FOURNISSEURS),
  saveFournisseurs: (f: Fournisseur[]) => setLS("fl_fournisseurs", f),
  addFournisseur: (f: Fournisseur) => { const arr = store.getFournisseurs(); arr.push(f); store.saveFournisseurs(arr); return f },
  updateFournisseur: (id: string, updates: Partial<Fournisseur>) => {
    const arr = store.getFournisseurs()
    const idx = arr.findIndex(f => f.id === id)
    if (idx >= 0) { arr[idx] = { ...arr[idx], ...updates }; store.saveFournisseurs(arr) }
  },
  deleteFournisseur: (id: string) => { store.saveFournisseurs(store.getFournisseurs().filter(f => f.id !== id)); deleteSynced("fl_fournisseurs", [id]) },

  // --- Livreurs ---
  getLivreurs: (): Livreur[] => getLS("fl_livreurs", DEFAULT_LIVREURS),
  saveLivreurs: (l: Livreur[]) => setLS("fl_livreurs", l),
  addLivreur: (l: Livreur) => { const ls = store.getLivreurs(); ls.push(l); store.saveLivreurs(ls); return l },

  // --- Motifs retour ---
  getMotifs: (): MotifRetour[] => getLS("fl_motifs_retour", DEFAULT_MOTIFS_RETOUR),
  saveMotifs: (m: MotifRetour[]) => setLS("fl_motifs_retour", m),

  // --- Bons d'achat ---
  getBonsAchat: (): BonAchat[] => getLS("fl_bons_achat", []),
  saveBonsAchat: (b: BonAchat[]) => setLS("fl_bons_achat", b),
  addBonAchat: (b: BonAchat) => { const bons = store.getBonsAchat(); bons.push(b); store.saveBonsAchat(bons) },
  updateBonAchat: (id: string, updates: Partial<BonAchat>) => {
    const bons = store.getBonsAchat()
    const idx = bons.findIndex(b => b.id === id)
    if (idx >= 0) { bons[idx] = { ...bons[idx], ...updates }; store.saveBonsAchat(bons) }
  },

  // --- Commandes ---
  getCommandes: (): Commande[] => getLS("fl_commandes", []),
  // Commandes des clients visibles par l'utilisateur connecté — pour
  // l'affichage uniquement (mêmes règles que getVisibleClients).
  getVisibleCommandes: (): Commande[] => {
    const visibleIds = new Set(store.getVisibleClients().map(c => c.id))
    return store.getCommandes().filter(cmd => visibleIds.has(cmd.clientId))
  },
  saveCommandes: (c: Commande[]) => setLS("fl_commandes", c),
  addCommande: (c: Commande) => {
    const cmds = store.getCommandes()
    cmds.push(c)
    store.saveCommandes(cmds)
    // --- AUTO-PO: for each ligne, if stock < quantite, create/update a draft PO ---
    const fournisseurs = store.getFournisseurs()
    c.lignes.forEach(l => {
      const art = store.getArticles().find(a => a.id === l.articleId)
      if (!art) return
      const need = l.quantite - art.stockDisponible
      if (need <= 0) return // stock covers it
      // Find or create PO for today+article
      const existingPOs = store.getPurchaseOrders()
      const todayStr = store.today()
      const existingPO = existingPOs.find(po =>
        po.articleId === art.id && po.date === todayStr && po.statut === "ouvert"
      )
      // Best fournisseur: last used from historique
      const hist = art.historiquePrixAchat ?? []
      const bestFour = hist.length > 0
        ? fournisseurs.find(f => f.id === hist[0].fournisseurId) ?? fournisseurs[0]
        : fournisseurs[0]
      if (existingPO) {
        // increase quantity
        store.updatePurchaseOrder(existingPO.id, {
          quantite: existingPO.quantite + need,
          commandeQty: (existingPO.commandeQty ?? 0) + l.quantite,
          stockQty: art.stockDisponible,
          notes: (existingPO.notes ? existingPO.notes + " | " : "") + `+${need} auto (cmd ${c.id})`,
        })
      } else if (bestFour) {
        store.addPurchaseOrder({
          id: store.genId(),
          date: todayStr,
          articleId: art.id,
          articleNom: art.nom,
          articleUnite: art.unite,
          fournisseurId: bestFour.id,
          fournisseurNom: bestFour.nom,
          fournisseurEmail: bestFour.email ?? "",
          quantite: need,
          prixUnitaire: art.prixAchat,
          total: need * art.prixAchat,
          statut: "ouvert",
          notes: `Auto-PO cmd ${c.id} (besoin ${need} ${art.unite}, stock ${art.stockDisponible})`,
          createdBy: c.commercialId,
          commandeQty: l.quantite,
          stockQty: art.stockDisponible,
        })
      }
    })
  },
  updateCommande: (id: string, updates: Partial<Commande>) => {
    const cmds = store.getCommandes()
    const idx = cmds.findIndex(c => c.id === id)
    if (idx >= 0) { cmds[idx] = { ...cmds[idx], ...updates }; store.saveCommandes(cmds) }
  },
  // Répercute la suppression d'une commande sur les PO Achat encore ouverts :
  // la quantité de cette commande avait été comptée dans le besoin qui a
  // généré ces PO (computeBesoinNet ne considère que les commandes du jour,
  // en_attente/valide) — sans ça, le PO restait surdimensionné après coup,
  // l'acheteur commandant plus que nécessaire au fournisseur. Ne touche
  // jamais un PO déjà envoyé/réceptionné (engagement déjà pris auprès du
  // fournisseur). Exportée séparément : le back-office a son propre chemin
  // de suppression (BOCommandesUnifiees.tsx) qui n'appelle pas deleteCommande.
  cascadePOAfterCommandeDelete: (cmd: Commande) => {
    if (!(cmd.date === store.today() && (cmd.statut === "en_attente" || cmd.statut === "valide"))) return
    const orders = store.getPurchaseOrders()
    let changed = false
    cmd.lignes.forEach(ligne => {
      let remaining = ligne.quantite
      if (!remaining) return
      for (const po of orders) {
        if (remaining <= 0) break
        if (po.statut !== "ouvert" || po.articleId !== ligne.articleId) continue
        const deduct = Math.min(remaining, po.quantite)
        if (deduct <= 0) continue
        po.quantite -= deduct
        po.total = po.quantite * po.prixUnitaire
        if (po.commandeQty != null) po.commandeQty = Math.max(0, po.commandeQty - deduct)
        if (po.quantite <= 0) po.statut = "annulé" // besoin entièrement absorbé
        remaining -= deduct
        changed = true
      }
    })
    if (changed) store.savePurchaseOrders(orders)
  },
  deleteCommande: (id: string) => {
    const cmd = store.getCommandes().find(c => c.id === id)
    if (cmd) store.cascadePOAfterCommandeDelete(cmd)
    store.saveCommandes(store.getCommandes().filter(c => c.id !== id))
    deleteSynced("fl_commandes", [id])   // sinon la commande « revient » au prochain fetch
  },

  // --- Visites prevendeur ---
  getVisites: (): Visite[] => getLS("fl_visites", []),
  saveVisites: (v: Visite[]) => setLS("fl_visites", v),
  addVisite: (v: Visite) => { const vs = store.getVisites(); vs.push(v); store.saveVisites(vs) },

  // --- Réceptions ---
  getReceptions: (): Reception[] => getLS("fl_receptions", []),
  saveReceptions: (r: Reception[]) => setLS("fl_receptions", r),
  addReception: (r: Reception) => { const recs = store.getReceptions(); recs.push(r); store.saveReceptions(recs) },
  updateReception: (id: string, updates: Partial<Reception>) => {
    const recs = store.getReceptions()
    const idx = recs.findIndex(r => r.id === id)
    if (idx >= 0) { recs[idx] = { ...recs[idx], ...updates }; store.saveReceptions(recs) }
  },

  // --- Trips ---
  getTrips: (): Trip[] => getLS("fl_trips", []),
  saveTrips: (t: Trip[]) => setLS("fl_trips", t),
  addTrip: (t: Trip) => { const trips = store.getTrips(); trips.push(t); store.saveTrips(trips) },
  updateTrip: (id: string, updates: Partial<Trip>) => {
    const trips = store.getTrips()
    const idx = trips.findIndex(t => t.id === id)
    if (idx >= 0) { trips[idx] = { ...trips[idx], ...updates }; store.saveTrips(trips) }
  },

  // --- Retours ---
  getRetours: (): Retour[] => getLS("fl_retours", []),
  saveRetours: (r: Retour[]) => setLS("fl_retours", r),
  addRetour: (r: Retour) => { const ret = store.getRetours(); ret.push(r); store.saveRetours(ret) },

  // --- Bons de livraison ---
  getBonsLivraison: (): BonLivraison[] => getLS("fl_bons_livraison", []),
  // Bons de livraison des clients visibles par l'utilisateur connecté —
  // pour l'affichage uniquement (mêmes règles que getVisibleClients).
  getVisibleBonsLivraison: (): BonLivraison[] => {
    const visibleIds = new Set(store.getVisibleClients().map(c => c.id))
    return store.getBonsLivraison().filter(bl => !bl.clientId || visibleIds.has(bl.clientId))
  },
  saveBonsLivraison: (b: BonLivraison[]) => setLS("fl_bons_livraison", b),
  addBonLivraison: (b: BonLivraison) => { const bls = store.getBonsLivraison(); bls.push(b); store.saveBonsLivraison(bls) },
  updateBonLivraison: (id: string, updates: Partial<BonLivraison>) => {
    const bls = store.getBonsLivraison()
    const idx = bls.findIndex(b => b.id === id)
    if (idx >= 0) { bls[idx] = { ...bls[idx], ...updates }; store.saveBonsLivraison(bls) }
  },

  // --- Bons de Préparation ---
  getBonsPreparation: (): BonPreparation[] => getLS("fl_bons_preparation", []),
  // Bons de préparation touchant au moins un client visible par l'utilisateur
  // connecté (un bon peut couvrir plusieurs clients de tournées différentes —
  // on ne masque pas tout le bon logistique pour une seule ligne d'une autre
  // équipe). Pour l'affichage uniquement (mêmes règles que getVisibleClients).
  getVisibleBonsPreparation: (): BonPreparation[] => {
    const visibleIds = new Set(store.getVisibleClients().map(c => c.id))
    return store.getBonsPreparation().filter(bp => bp.clientIds.some(id => visibleIds.has(id)))
  },
  saveBonsPreparation: (b: BonPreparation[]) => setLS("fl_bons_preparation", b),
  addBonPreparation: (b: BonPreparation) => { const arr = store.getBonsPreparation(); arr.push(b); store.saveBonsPreparation(arr) },
  updateBonPreparation: (id: string, updates: Partial<BonPreparation>) => {
    const arr = store.getBonsPreparation()
    const idx = arr.findIndex(b => b.id === id)
    if (idx >= 0) { arr[idx] = { ...arr[idx], ...updates }; store.saveBonsPreparation(arr) }
  },

  // --- Purchase Orders ---
  getPurchaseOrders: (): PurchaseOrder[] => getLS("fl_purchase_orders", []),
  savePurchaseOrders: (po: PurchaseOrder[]) => setLS("fl_purchase_orders", po),
  addPurchaseOrder: (po: PurchaseOrder) => { const orders = store.getPurchaseOrders(); orders.push(po); store.savePurchaseOrders(orders) },
  updatePurchaseOrder: (id: string, updates: Partial<PurchaseOrder>) => {
    const orders = store.getPurchaseOrders()
    const idx = orders.findIndex(o => o.id === id)
    if (idx >= 0) { orders[idx] = { ...orders[idx], ...updates }; store.savePurchaseOrders(orders) }
  },

  // --- PO Notifications for Acheteur ---
  // Returns POs in "ouvert" status that the acheteur hasn't acknowledged yet
  getPendingPOsForAcheteur: (): PurchaseOrder[] => {
    return store.getPurchaseOrders().filter(po => po.statut === "ouvert")
  },
  // Mark PO as seen by acheteur (changes statut to "envoyé")
  markPOSeenByAcheteur: (id: string) => {
    store.updatePurchaseOrder(id, { statut: "envoyé" })
  },

  // Auto-generate PO from besoinNet (called from recap/batch logic)
  // Returns newly created POs
  autoGeneratePOsFromBesoin: (): PurchaseOrder[] => {
    const besoin = store.computeBesoinNet()
    const acheteurs = store.getUsers().filter(u => u.role === "acheteur" && u.actif)
    const totalAcheteurs = acheteurs.length
    const existing = store.getPurchaseOrders()
    const today = store.today()
    const newPOs: PurchaseOrder[] = []
    for (const b of besoin) {
      if (b.besoinNet <= 0) continue
      // Check if a PO already exists today for this article
      const alreadyExists = existing.some(po =>
        po.articleId === b.articleId && po.date === today && po.statut !== "annulé" && po.genereAuto
      )
      if (alreadyExists) continue
      const art = store.getArticles().find(a => a.id === b.articleId)
      const fournisseur = store.getFournisseurs()[0] // default first fournisseur
      const po: PurchaseOrder = {
        id: store.genId(),
        date: today,
        articleId: b.articleId,
        articleNom: b.articleNom,
        articleUnite: b.unite,
        fournisseurId: fournisseur?.id ?? "",
        fournisseurNom: fournisseur?.nom ?? "A definir",
        fournisseurEmail: fournisseur?.email ?? "",
        quantite: b.besoinNet,
        prixUnitaire: art?.prixAchat ?? 0,
        total: b.besoinNet * (art?.prixAchat ?? 0),
        statut: "ouvert",
        notes: `PO auto-genere — besoinNet: ${b.besoinNet} ${b.unite} (cmd: ${b.commandeQty}, stock: ${b.stockQty})`,
        createdBy: "system",
        createdVia: "system",
        commandeQty: b.commandeQty,
        stockQty: b.stockQty,
        retourQty: b.retourQty,
        genereAuto: true,
        totalAcheteurs,
        acheteurRefusals: [],
        daGenere: false,
      }
      store.addPurchaseOrder(po)
      newPOs.push(po)
    }
    return newPOs
  },

  // Record acheteur refusal on a PO — if all acheteurs have refused, auto-generate DA
  refuserPO: (poId: string, acheteurId: string, acheteurNom: string, motif?: string): DemandeAchat | null => {
    const orders = store.getPurchaseOrders()
    const idx = orders.findIndex(o => o.id === poId)
    if (idx < 0) return null
    const po = orders[idx]
    // Record refusal
    const refusals = [...(po.acheteurRefusals ?? [])]
    if (!refusals.some(r => r.acheteurId === acheteurId)) {
      refusals.push({ acheteurId, acheteurNom, refusedAt: new Date().toISOString(), motif })
    }
    orders[idx] = { ...po, acheteurRefusals: refusals }
    store.savePurchaseOrders(orders)

    // Check if ALL acheteurs have refused (or there's only one acheteur)
    const totalAcheteurs = po.totalAcheteurs ?? 1
    const allRefused = refusals.length >= totalAcheteurs
    if (allRefused && !po.daGenere) {
      // Auto-generate DA
      const da: DemandeAchat = {
        id: store.genId(),
        date: store.today(),
        poId,
        articleId: po.articleId,
        articleNom: po.articleNom,
        articleUnite: po.articleUnite,
        quantite: po.quantite,
        besoinNet: po.quantite,
        statut: "ouverte",
        createdBy: "system",
        notes: `DA auto-generee suite au refus de tous les acheteurs sur PO ${po.id.slice(0, 8).toUpperCase()}`,
        fournisseurId: po.fournisseurId,
        fournisseurNom: po.fournisseurNom,
      }
      store.addDemandeAchat(da)
      // Mark PO as daGenere
      store.updatePurchaseOrder(poId, { daGenere: true, daId: da.id, statut: "annulé" })
      return da
    }
    return null
  },

  // --- Demandes d'Achat (DA) ---
  getDemandesAchat: (): DemandeAchat[] => getLS("fl_demandes_achat", []),
  saveDemandesAchat: (da: DemandeAchat[]) => setLS("fl_demandes_achat", da),
  addDemandeAchat: (da: DemandeAchat) => { const arr = store.getDemandesAchat(); arr.push(da); store.saveDemandesAchat(arr) },
  updateDemandeAchat: (id: string, updates: Partial<DemandeAchat>) => {
    const arr = store.getDemandesAchat()
    const idx = arr.findIndex(d => d.id === id)
    if (idx >= 0) { arr[idx] = { ...arr[idx], ...updates }; store.saveDemandesAchat(arr) }
  },

  // Calculate besoin net for PO / DA
  // besoinNet = qteCommandee - stockDispo - retourQty
  //   > 0  → LANCER DA (deficit: must purchase)
  //   <= 0 → RAS (stock sufficient)
  // Note: besoinNet is NOT clamped to 0 — negative means surplus
  computeBesoinNet: (): { articleId: string; articleNom: string; unite: string; commandeQty: number; stockQty: number; retourQty: number; besoinNet: number }[] => {
    const today = store.today()
    const articles = store.getArticles()
    const commandes = store.getCommandes().filter(c => c.date === today && (c.statut === "en_attente" || c.statut === "valide"))
    const retours = store.getRetours().filter(r => r.date === today && r.statut === "validé")
    return articles.map(art => {
      const commandeQty = commandes.reduce((s, c) => s + (c.lignes.find(l => l.articleId === art.id)?.quantite ?? 0), 0)
      const retourQty = retours.reduce((s, r) => s + (r.lignes.find(l => l.articleId === art.id)?.quantite ?? 0), 0)
      // NOT clamped — negative = surplus, positive = deficit → DA required
      const besoinNet = commandeQty - art.stockDisponible - retourQty
      return { articleId: art.id, articleNom: `${art.nom} / ${art.nomAr}`, unite: art.unite, commandeQty, stockQty: art.stockDisponible, retourQty, besoinNet }
    }).filter(l => l.commandeQty > 0)
  },

  // --- Stock Transferts ---
  getTransferts: (): TransfertStock[] => getLS("fl_transferts", []),
  saveTransferts: (t: TransfertStock[]) => setLS("fl_transferts", t),
  addTransfert: (t: TransfertStock) => {
    const ts = store.getTransferts(); ts.push(t); store.saveTransferts(ts)
    if (t.sens === "conforme_vers_defect") {
      store.updateStock(t.articleId, -t.quantite, false)
      store.updateStock(t.articleId, t.quantite, true)
    } else {
      store.updateStock(t.articleId, -t.quantite, true)
      store.updateStock(t.articleId, t.quantite, false)
    }
  },

  // --- Notices / Discussions ---
  getNotices: (): Notice[] => getLS("fl_notices", []),
  saveNotices: (n: Notice[]) => setLS("fl_notices", n),
  addNotice: (n: Notice) => { const notices = store.getNotices(); notices.push(n); store.saveNotices(notices) },
  updateNotice: (id: string, updates: Partial<Notice>) => {
    const notices = store.getNotices()
    const idx = notices.findIndex(n => n.id === id)
    if (idx >= 0) { notices[idx] = { ...notices[idx], ...updates }; store.saveNotices(notices) }
  },

  // --- Depots ---
  getDepots: (): Depot[] => {
    const saved = getLS<Depot[]>("fl_depots", [])
    // Always ensure the default depot exists
    if (!saved.find(d => d.id === DEFAULT_DEPOT.id)) {
      saved.unshift(DEFAULT_DEPOT)
    }
    return saved
  },
  saveDepots: (d: Depot[]) => setLS("fl_depots", d),
  addDepot: (d: Depot) => { const depots = store.getDepots(); depots.push(d); store.saveDepots(depots) },
  updateDepot: (id: string, updates: Partial<Depot>) => {
    const depots = store.getDepots()
    const idx = depots.findIndex(d => d.id === id)
    if (idx >= 0) { depots[idx] = { ...depots[idx], ...updates }; store.saveDepots(depots) }
  },
  deleteDepot: (id: string) => {
    if (id === DEFAULT_DEPOT.id) return // cannot delete the principal depot
    const depots = store.getDepots().filter(d => d.id !== id)
    store.saveDepots(depots)
    deleteSynced("fl_depots", [id])
  },

  // --- Messages ---
  getMessages: (): Message[] => getLS("fl_messages", []),
  saveMessages: (m: Message[]) => setLS("fl_messages", m),
  addMessage: (m: Message) => { const msgs = store.getMessages(); msgs.push(m); store.saveMessages(msgs) },
  getMessageGroups: (): MessageGroup[] => getLS("fl_msg_groups", []),
  saveMessageGroups: (g: MessageGroup[]) => setLS("fl_msg_groups", g),

  // --- Alert inactivity config ---
  // inactivityDays      : client sans aucune commande depuis N jours
  // articleAbsenceJours : article habituel d'un client non recommandé depuis N jours (seuil d'alerte)
  // articleAbsenceMedium/Urgent : seuils de gravité (badge orange / rouge)
  getAlertConfig: (): { inactivityDays: number; articleAbsenceJours: number; articleAbsenceMedium: number; articleAbsenceUrgent: number } => {
    const c = getLS<Partial<{ inactivityDays: number; articleAbsenceJours: number; articleAbsenceMedium: number; articleAbsenceUrgent: number }>>("fl_alert_config", {})
    return {
      inactivityDays:       Number(c.inactivityDays)       || 30,
      articleAbsenceJours:  Number(c.articleAbsenceJours)  || 7,
      articleAbsenceMedium: Number(c.articleAbsenceMedium) || 14,
      articleAbsenceUrgent: Number(c.articleAbsenceUrgent) || 21,
    }
  },
  saveAlertConfig: (c: { inactivityDays: number; articleAbsenceJours?: number; articleAbsenceMedium?: number; articleAbsenceUrgent?: number }) => {
    setLS("fl_alert_config", { ...store.getAlertConfig(), ...c })
  },

  // --- Config Marché (planification achat / besoin / camions / heure arrivée) ---
  // capaciteHondaKg     : capacité d'un camion "Honda" en kg
  // heureOuvertureMarche: heure d'ouverture du marché "HH:MM"
  // minutesParTonne     : marge de départ anticipé par tonne (plus de tonnage = départ plus tôt)
  // margeSecuriteMin    : marge fixe de sécurité (minutes)
  getMarcheConfig: (): { capaciteHondaKg: number; heureOuvertureMarche: string; minutesParTonne: number; margeSecuriteMin: number } => {
    const c = getLS<Partial<{ capaciteHondaKg: number; heureOuvertureMarche: string; minutesParTonne: number; margeSecuriteMin: number }>>("fl_marche_config", {})
    return {
      capaciteHondaKg:      Number(c.capaciteHondaKg)   || 1500,
      heureOuvertureMarche: c.heureOuvertureMarche      || "05:00",
      minutesParTonne:      Number(c.minutesParTonne)   || 8,
      margeSecuriteMin:     Number(c.margeSecuriteMin)  || 30,
    }
  },
  saveMarcheConfig: (c: Partial<{ capaciteHondaKg: number; heureOuvertureMarche: string; minutesParTonne: number; margeSecuriteMin: number }>) => {
    setLS("fl_marche_config", { ...store.getMarcheConfig(), ...c })
  },

  // --- Email config ---
  getEmailConfig: (): EmailConfig => getLS("fl_email_config", DEFAULT_EMAIL_CONFIG),
  saveEmailConfig: (c: EmailConfig) => setLS("fl_email_config", c),

  // --- Workflow config v2 (with BPM steps) ---
  getWorkflowConfig: (): WorkflowConfig => {
    const saved = getLS<WorkflowConfig>("fl_workflow_config", {
      validationCommande: "direct",
      steps: DEFAULT_WORKFLOW_STEPS,
    })
    // Ensure steps are always present (migration from v1)
    if (!saved.steps || saved.steps.length === 0) {
      saved.steps = DEFAULT_WORKFLOW_STEPS
    }
    return saved
  },
  saveWorkflowConfig: (c: WorkflowConfig) => setLS("fl_workflow_config", c),

  // --- Process config ---
  getProcessConfig: (): ProcessConfig => ({ ...DEFAULT_PROCESS_CONFIG, ...getLS<Partial<ProcessConfig>>("fl_process_config", {}) }),
  saveProcessConfig: (c: ProcessConfig) => setLS("fl_process_config", c),
  getFiscalConfig: (): FiscalConfig => ({ ...DEFAULT_FISCAL_CONFIG, ...getLS<Partial<FiscalConfig>>("fl_fiscal_config", {}) }),
  saveFiscalConfig: (c: FiscalConfig) => setLS("fl_fiscal_config", c),

  // --- Inventory Logs ---
  getInventoryLogs: (): InventoryLog[] => getLS("fl_inventory_logs", []),
  saveInventoryLogs: (logs: InventoryLog[]) => setLS("fl_inventory_logs", logs),
  addInventoryLog: (log: InventoryLog) => {
    const logs = store.getInventoryLogs()
    logs.unshift(log)
    // Keep last 2000 entries
    if (logs.length > 2000) logs.splice(2000)
    store.saveInventoryLogs(logs)
  },

  // Compute virtual available stock for an article
  // Available = physicalStock - sum(pending order lines for this article)
  getVirtualStock: (articleId: string): { physical: number; pending: number; available: number } => {
    const articles = store.getArticles()
    const art = articles.find(a => a.id === articleId)
    const physical = art?.stockDisponible ?? 0
    const pendingOrders = store.getCommandes().filter(c =>
      c.statut === "en_attente" || c.statut === "en_attente_approbation" || c.statut === "valide"
    )
    const pending = pendingOrders.reduce((sum, cmd) => {
      const line = cmd.lignes.find(l => l.articleId === articleId)
      return sum + (line?.quantite ?? 0)
    }, 0)
    const available = Math.max(0, physical - pending)
    return { physical, pending, available }
  },

  // --- Client Smart Baskets ---
  getClientBaskets: (): ClientBasket[] => getLS("fl_client_baskets", []),
  saveClientBaskets: (b: ClientBasket[]) => setLS("fl_client_baskets", b),
  getClientBasket: (clientId: string): ClientBasket | null => {
    const baskets = store.getClientBaskets()
    return baskets.find(b => b.clientId === clientId) ?? null
  },
  saveClientBasket: (basket: ClientBasket) => {
    const baskets = store.getClientBaskets().filter(b => b.clientId !== basket.clientId)
    baskets.push(basket)
    store.saveClientBaskets(baskets)
  },

  // --- Price entries ---
  getPriceEntries: (): PriceEntry[] => getLS("fl_price_entries", []),
  savePriceEntries: (entries: PriceEntry[]) => setLS("fl_price_entries", entries),
  addPriceEntry: (entry: PriceEntry) => {
    const entries = store.getPriceEntries()
    entries.unshift(entry)
    store.savePriceEntries(entries)
  },
  updatePriceEntry: (entry: PriceEntry) => {
    const entries = store.getPriceEntries().map(e => e.id === entry.id ? entry : e)
    store.savePriceEntries(entries)
  },
  deletePriceEntry: (id: string) => {
    store.savePriceEntries(store.getPriceEntries().filter(e => e.id !== id))
  },

  // --- Sourcing ---
  getSourcingEntries: (): SourcingEntry[] => getLS("fl_sourcing", []),
  saveSourcingEntries: (entries: SourcingEntry[]) => setLS("fl_sourcing", entries),
  addSourcingEntry: (entry: SourcingEntry) => {
    const entries = store.getSourcingEntries()
    entries.unshift(entry)
    store.saveSourcingEntries(entries)
  },
  updateSourcingEntry: (entry: SourcingEntry) => {
    const entries = store.getSourcingEntries().map(e => e.id === entry.id ? entry : e)
    store.saveSourcingEntries(entries)
  },
  deleteSourcingEntry: (id: string) => {
    store.saveSourcingEntries(store.getSourcingEntries().filter(e => e.id !== id))
  },

  // --- Process sub-steps config ---
  getProcessSubSteps: (): Record<string, Record<string, boolean>> =>
    getLS("fl_process_substeps", {}),
  saveProcessSubSteps: (v: Record<string, Record<string, boolean>>) =>
    setLS("fl_process_substeps", v),

  // --- Granular permissions ---
  getGranularPerms: (userId: string): GranularPermissions => {
    const all = getLS<Record<string, GranularPermissions>>("fl_granular_perms", {})
    return all[userId] ?? {}
  },
  saveGranularPerms: (userId: string, perms: GranularPermissions) => {
    const all = getLS<Record<string, GranularPermissions>>("fl_granular_perms", {})
    all[userId] = perms
    setLS("fl_granular_perms", all)
  },

  // --- Utils ---
  // VF-style IDs — prefix + timestamp + random
  genId: (prefix = "VF"): string => {
    const ts  = Date.now().toString(36).toUpperCase().slice(-4)
    const rnd = Math.floor(Math.random() * 9999).toString().padStart(4, "0")
    return `${prefix}${ts}${rnd}`
  },

  // Sequential VF ID — reads existing items from localStorage and increments
  genSeqId: (prefix: string, storageKey: string): string => {
    try {
      const items = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as { id: string }[]
      let max = 0
      const re = new RegExp(`^${prefix}(\\d+)$`)
      for (const item of items) {
        const m = re.exec(item.id)
        if (m) max = Math.max(max, parseInt(m[1], 10))
      }
      return `${prefix}${String(max + 1).padStart(5, "0")}`
    } catch {
      return `${prefix}${String(Date.now()).slice(-5)}`
    }
  },

  // Auto-incremented Trip number: T001, T002…
  genTripNumber: (): string => {
    const trips = getLS<Trip[]>("fl_trips", [])
    // find highest existing T-number
    let max = 0
    for (const t of trips) {
      const m = t.id.match(/^T(\d+)$/)
      if (m) max = Math.max(max, parseInt(m[1], 10))
    }
    return `T${String(max + 1).padStart(3, "0")}` // T001, T002…
  },

  // BL number: BL-260323-001 — sequential per day
  genBL: (): string => {
    const now = new Date()
    const yy = String(now.getFullYear()).slice(-2)
    const mm = String(now.getMonth() + 1).padStart(2, "0")
    const dd = String(now.getDate()).padStart(2, "0")
    const prefix = `BL-${yy}${mm}${dd}`
    const bls = getLS<BonLivraison[]>("fl_bons_livraison", [])
    const todayBLs = bls.filter(b => b.id.startsWith(prefix))
    const seq = String(todayBLs.length + 1).padStart(3, "0")
    return `${prefix}-${seq}` // e.g. "BL-260323-001"
  },

  // Facture number: FAC-2603-001 — sequential per month
  genFacture: (): string => {
    const now = new Date()
    const yy = String(now.getFullYear()).slice(-2)
    const mm = String(now.getMonth() + 1).padStart(2, "0")
    const prefix = `FAC-${yy}${mm}`
    const bls = getLS<BonLivraison[]>("fl_bons_livraison", [])
    const monthBLs = bls.filter(b => b.id.startsWith(prefix))
    const seq = String(monthBLs.length + 1).padStart(3, "0")
    return `${prefix}-${seq}` // e.g. "FAC-2603-001"
  },

  // Commande number: CMD-260323-001
  genCommande: (): string => {
    const now = new Date()
    const yy = String(now.getFullYear()).slice(-2)
    const mm = String(now.getMonth() + 1).padStart(2, "0")
    const dd = String(now.getDate()).padStart(2, "0")
    const prefix = `CMD-${yy}${mm}${dd}`
    const cmds = getLS<Commande[]>("fl_commandes", [])
    const todayCmds = cmds.filter(c => c.id.startsWith(prefix))
    const seq = String(todayCmds.length + 1).padStart(3, "0")
    return `${prefix}-${seq}` // e.g. "CMD-260323-001"
  },

  // Date calendaire LOCALE (pas toISOString(), qui est en UTC — au Maroc
  // (UTC+1, sans heure d'ete), une commande creee entre 00h00 et 00h59
  // heure locale se voyait attribuer la date de la veille, l'UTC n'ayant
  // pas encore bascule sur le jour courant).
  today: () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` },
  now: () => new Date().toISOString(),
  yesterday: () => { const d = new Date(); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` },
  // Date par défaut "jour opérationnel", pour les écrans de reporting
  // (Intelligence Concurrence, Prix/Marge, etc.) — pas la date calendaire brute :
  //  - commandes : cycle du jour clos à 14h → avant 14h on regarde J, après on
  //    bascule sur J-1 (dernier jour dont les commandes sont définitivement closes).
  //  - achat : le marché de gros tourne la nuit jusqu'à 8h du matin → avant 8h
  //    on est encore dans le cycle d'achat de J-1, après 8h on est sur J.
  jourOperationnel: (type: "commande" | "achat"): string => {
    const now = new Date()
    const h = now.getHours()
    const bascule = type === "commande" ? h >= 14 : h < 8
    const d = new Date(now)
    if (bascule) d.setDate(d.getDate() - 1)
    return d.toISOString().split("T")[0]
  },
  lastWeekDay: (d: string) => { const date = new Date(d); date.setDate(date.getDate() - 7); return date.toISOString().split("T")[0] },

  // Format MAD — Dirham marocain
  formatMAD: (n: number) =>
    `${n.toLocaleString("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`,

  // --- Camera permissions ---
  getCameraPermissions: (): Record<string, boolean> => getLS("fl_camera_perms", {}),
  saveCameraPermissions: (p: Record<string, boolean>) => setLS("fl_camera_perms", p),
  grantCamera: (userId: string, granted: boolean) => {
    const perms = store.getCameraPermissions()
    perms[userId] = granted
    setLS("fl_camera_perms", perms)
  },
  userHasCamera: (userId: string, role: UserRole): boolean => {
    if (role === "super_super_admin") return true
    const perms = store.getCameraPermissions()
    return perms[userId] === true
  },

  // --- Cut-off notifications ---
  getCutoffs: (): CutoffNotification[] => getLS("fl_cutoffs", DEFAULT_CUTOFFS),
  saveCutoffs: (c: CutoffNotification[]) => setLS("fl_cutoffs", c),
  getSeuilAlerte: (): SeuilAlerteConfig => ({ ...DEFAULT_SEUIL_ALERTE, ...getLS<Partial<SeuilAlerteConfig>>("fl_seuil_alerte", {}) }),
  saveSeuilAlerte: (c: SeuilAlerteConfig) => setLS("fl_seuil_alerte", c),

  // --- Charge clients (acheteur) ---
  getChargesClient: (): ChargeClientAcheteur[] => getLS("fl_charges_client_acheteur", []),
  saveChargesClient: (c: ChargeClientAcheteur[]) => setLS("fl_charges_client_acheteur", c),

  // --- Trip charges (logistique) ---
  getTripCharges: (): TripCharge[] => getLS("fl_trip_charges", DEFAULT_TRIP_CHARGES),
  saveTripCharges: (t: TripCharge[]) => setLS("fl_trip_charges", t),
  addTripCharge: (t: TripCharge) => { const arr = store.getTripCharges(); arr.unshift(t); store.saveTripCharges(arr) },
  updateTripCharge: (id: string, updates: Partial<TripCharge>) => {
    const arr = store.getTripCharges()
    const idx = arr.findIndex(t => t.id === id)
    if (idx >= 0) { arr[idx] = { ...arr[idx], ...updates }; store.saveTripCharges(arr) }
  },

  // --- Feedbacks / Avis ---
  getFeedbacks: (): Feedback[] => getLS("fl_feedbacks", DEFAULT_FEEDBACKS),
  saveFeedbacks: (f: Feedback[]) => setLS("fl_feedbacks", f),
  addFeedback: (f: Feedback) => { const arr = store.getFeedbacks(); arr.unshift(f); store.saveFeedbacks(arr) },
  updateFeedbackStatus: (id: string, statut: FeedbackStatut) => {
    const arr = store.getFeedbacks()
    const idx = arr.findIndex(f => f.id === id)
    if (idx >= 0) { arr[idx] = { ...arr[idx], statut }; store.saveFeedbacks(arr) }
  },

  // --- Analyse achat vs réception ---
  getAnalyseAchat: (): AnalyseAchat[] => getLS("fl_analyse_achat", DEFAULT_ANALYSE_ACHAT),

  // --- Cmd vs facturation ---
  getCmdVsFacturation: (): CmdVsFacturation[] => getLS("fl_cmd_fact", DEFAULT_CMD_FACT),

  // --- Loyalty Engine ---
  getLoyaltyConfig: (): LoyaltyConfig => getLS("fl_loyalty_config", DEFAULT_LOYALTY_CONFIG),
  saveLoyaltyConfig: (c: LoyaltyConfig) => setLS("fl_loyalty_config", c),
  getLoyaltyTransactions: (): LoyaltyTransaction[] => getLS("fl_loyalty_transactions", []),
  saveLoyaltyTransactions: (t: LoyaltyTransaction[]) => setLS("fl_loyalty_transactions", t),
  addLoyaltyTransaction: (t: LoyaltyTransaction) => {
    const arr = store.getLoyaltyTransactions(); arr.unshift(t)
    if (arr.length > 5000) arr.splice(5000)
    store.saveLoyaltyTransactions(arr)
  },
  getClientPoints: (clientId: string): number => {
    const txs = store.getLoyaltyTransactions().filter(t => t.clientId === clientId && t.statut !== "annule")
    return txs.reduce((s, t) => t.type === "gain" ? s + t.points : s - t.points, 0)
  },

  // --- Prime Nouveau Client (3 commandes OU 1 tonne — une fois par client) ---
  getPrimesNouveauxClients: (): PrimeNouveauClient[] => getLS("fl_primes_nouveaux_clients", []),
  savePrimesNouveauxClients: (p: PrimeNouveauClient[]) => setLS("fl_primes_nouveaux_clients", p),
  /**
   * Scanne tous les clients n'ayant pas encore de prime, calcule leur nombre
   * de commandes (hors refusées) et leur tonnage cumulé, et crée une prime
   * dès que le seuil configuré (commandes OU kg) est atteint. Idempotent :
   * ne recrée jamais une prime pour un client qui en a déjà une. Ajoute
   * aussi les points bonus client via une LoyaltyTransaction "gain".
   * Retourne les NOUVELLES primes créées par cet appel.
   */
  checkPrimesNouveauxClients: (): PrimeNouveauClient[] => {
    const cfg = store.getLoyaltyConfig()
    if (!cfg.primeNouveauClientActif) return []
    const seuilCmd = cfg.primeNouveauClientSeuilCommandes ?? 3
    const seuilKg  = cfg.primeNouveauClientSeuilKg ?? 1000
    const montantPrevendeur = cfg.primeNouveauClientMontantPrevendeur ?? 0
    const pointsClient = cfg.primeNouveauClientPointsClient ?? 0

    const existants = store.getPrimesNouveauxClients()
    const dejaPrimes = new Set(existants.map(p => p.clientId))
    const clients = store.getClients()
    const commandes = store.getCommandes()
    const users = store.getUsers()
    const nouvelles: PrimeNouveauClient[] = []

    for (const client of clients) {
      if (dejaPrimes.has(client.id)) continue
      const cmds = commandes.filter(c => c.clientId === client.id && c.statut !== "refuse")
      if (cmds.length === 0) continue
      const nbCommandes = cmds.length
      const totalKg = cmds.reduce((s, c) => s + c.lignes.reduce((ls, l) => ls + (l.quantite || 0), 0), 0)
      const eligible = nbCommandes >= seuilCmd || totalKg >= seuilKg
      if (!eligible) continue

      const prevendeurId = client.prevendeurId || client.createdBy
      const prevendeur = users.find(u => u.id === prevendeurId)
      const prime: PrimeNouveauClient = {
        id: store.genId(),
        clientId: client.id,
        clientNom: client.nom,
        prevendeurId: prevendeurId ?? "",
        prevendeurNom: prevendeur?.name ?? "—",
        critere: nbCommandes >= seuilCmd ? "commandes" : "tonnage",
        nbCommandes,
        totalKg: Math.round(totalKg * 10) / 10,
        dateEligibilite: store.today(),
        montantPrevendeur,
        pointsClient,
        statutPrevendeur: "en_attente",
        createdAt: new Date().toISOString(),
      }
      nouvelles.push(prime)

      if (pointsClient > 0) {
        store.addLoyaltyTransaction({
          id: store.genId(),
          clientId: client.id,
          clientNom: client.nom,
          type: "gain",
          points: pointsClient,
          motif: `Prime nouveau client (${prime.critere === "commandes" ? `${nbCommandes} commandes` : `${totalKg.toFixed(0)} kg`})`,
          statut: "valide",
          createdBy: "system",
          createdAt: new Date().toISOString(),
        })
      }
    }

    if (nouvelles.length > 0) store.savePrimesNouveauxClients([...existants, ...nouvelles])
    return nouvelles
  },
  payerPrimePrevendeur: (id: string) => {
    const arr = store.getPrimesNouveauxClients()
    const idx = arr.findIndex(p => p.id === id)
    if (idx < 0) return
    arr[idx] = { ...arr[idx], statutPrevendeur: "payee", datePaiementPrevendeur: new Date().toISOString() }
    store.savePrimesNouveauxClients(arr)
  },

  // --- Discount Rules ---
  getDiscountRules: (): DiscountRule[] => getLS("fl_discount_rules", []),
  saveDiscountRules: (r: DiscountRule[]) => setLS("fl_discount_rules", r),
  addDiscountRule: (r: DiscountRule) => { const arr = store.getDiscountRules(); arr.push(r); store.saveDiscountRules(arr) },
  updateDiscountRule: (id: string, updates: Partial<DiscountRule>) => {
    const arr = store.getDiscountRules()
    const idx = arr.findIndex(r => r.id === id)
    if (idx >= 0) { arr[idx] = { ...arr[idx], ...updates }; store.saveDiscountRules(arr) }
  },
  deleteDiscountRule: (id: string) => store.saveDiscountRules(store.getDiscountRules().filter(r => r.id !== id)),

  // --- Driver Performance Bonuses ---
  getDriverBonusConfig: (): DriverBonusConfig => getLS("fl_driver_bonus_config", DEFAULT_DRIVER_BONUS_CONFIG),
  saveDriverBonusConfig: (c: DriverBonusConfig) => setLS("fl_driver_bonus_config", c),
  getDriverBonusRecords: (): DriverBonusRecord[] => getLS("fl_driver_bonus_records", []),
  saveDriverBonusRecords: (r: DriverBonusRecord[]) => setLS("fl_driver_bonus_records", r),
  addDriverBonusRecord: (r: DriverBonusRecord) => {
    const arr = store.getDriverBonusRecords(); arr.unshift(r)
    if (arr.length > 2000) arr.splice(2000)
    store.saveDriverBonusRecords(arr)
  },

  // --- Shareholder Distribution ---
  getShareholderDistributions: (): ShareholderDistribution[] => getLS("fl_shareholder_distributions", []),
  saveShareholderDistributions: (d: ShareholderDistribution[]) => setLS("fl_shareholder_distributions", d),
  addShareholderDistribution: (d: ShareholderDistribution) => {
    const arr = store.getShareholderDistributions(); arr.unshift(d); store.saveShareholderDistributions(arr)
  },

  // --- HR Template Editor ---
  getHRTemplates: (): HRCustomTemplate[] => getLS("fl_hr_templates", []),
  saveHRTemplates: (t: HRCustomTemplate[]) => setLS("fl_hr_templates", t),

  // --- Transport Companies ---
  getTransportCompanies: (): TransportCompany[] => getLS("fl_transport_companies", []),
  saveTransportCompanies: (arr: TransportCompany[]) => setLS("fl_transport_companies", arr),
  addTransportCompany: (c: TransportCompany) => {
    const arr = store.getTransportCompanies(); arr.push(c); store.saveTransportCompanies(arr); return c
  },
  updateTransportCompany: (id: string, updates: Partial<TransportCompany>) => {
    const arr = store.getTransportCompanies()
    const idx = arr.findIndex(c => c.id === id)
    if (idx >= 0) { arr[idx] = { ...arr[idx], ...updates }; store.saveTransportCompanies(arr) }
  },
  deleteTransportCompany: (id: string) => {
    store.saveTransportCompanies(store.getTransportCompanies().filter(c => c.id !== id))
  },
  addHRTemplate: (t: HRCustomTemplate) => { const arr = store.getHRTemplates(); arr.push(t); store.saveHRTemplates(arr) },
  updateHRTemplate: (id: string, updates: Partial<HRCustomTemplate>) => {
    const arr = store.getHRTemplates()
    const idx = arr.findIndex(t => t.id === id)
    if (idx >= 0) { arr[idx] = { ...arr[idx], ...updates }; store.saveHRTemplates(arr) }
  },
  deleteHRTemplate: (id: string) => store.saveHRTemplates(store.getHRTemplates().filter(t => t.id !== id)),
}

// ============================================================
// NEW TYPES — Camera, Cutoff, Trip charges, Feedback, Analyse
// ============================================================

export type FeedbackSource = "client" | "fournisseur" | "equipe"
export type FeedbackStatut = "nouveau" | "lu" | "traite"

export interface Feedback {
  id: string
  source: FeedbackSource
  auteur: string
  sujet: string
  message: string
  note: number        // 1–5
  date: string
  statut: FeedbackStatut
}

export interface CutoffNotification {
  id: string
  label?: string        // nom court de l'étape (ex: "Fin achat légumes")
  time: string          // "HH:MM"
  message: string
  active: boolean
  roles: UserRole[]
  tache?: string        // tâche à accomplir à cette heure (affichée dans la notif)
  assignedUserIds?: string[]  // personnes nommément assignées (en + des rôles)
}

// Seuil d'alerte tonnage : si le tonnage commandé du jour dépasse ce seuil,
// on notifie l'équipe d'une surcharge (0 = désactivé).
export interface SeuilAlerteConfig {
  tonnageMaxJour: number       // kg — au-delà, alerte surcharge
  rolesAlerte: UserRole[]      // qui est notifié
}
export const DEFAULT_SEUIL_ALERTE: SeuilAlerteConfig = {
  tonnageMaxJour: 0,
  rolesAlerte: ["resp_logistique", "dispatcheur", "resp_achat", "admin", "super_admin"],
}

// Charge acheteur par client (liste déroulante, max 3 types différents)
export type ChargeTypeAcheteur =
  | "transport" | "manutention" | "emballage" | "frais_marche" | "peage" | "autre"

export const CHARGE_TYPE_LABELS: Record<ChargeTypeAcheteur, string> = {
  transport:    "Transport / Déplacement",
  manutention:  "Manutention / Chargement",
  emballage:    "Emballage / Matériel",
  frais_marche: "Frais de marché",
  peage:        "Péage / Droit d'entrée",
  autre:        "Autre charge",
}

export interface ChargeClientAcheteur {
  clientId: string
  clientNom: string
  bonAchatId: string
  date: string
  charges: { type: ChargeTypeAcheteur; montant: number; description?: string }[]
}

// Charge logistique par trip
export type TripChargeType = "carburant" | "peage" | "reparation" | "chargement" | "dechargement" | "parking" | "autre"

export const TRIP_CHARGE_TYPE_LABELS: Record<TripChargeType, string> = {
  carburant:    "Carburant",
  peage:        "Péage",
  reparation:   "Réparation",
  chargement:   "Chargement",
  dechargement: "Déchargement",
  parking:      "Parking",
  autre:        "Autre",
}

export interface RetourMarchandiseItem {
  article: string
  quantite: number
  motif: "pas_notre_variete" | "produit_pourri" | "trop_vieux" | "endommage" | "autre"
  alerte: boolean
  iaObservation?: string
}

export const MOTIF_RETOUR_LABELS: Record<RetourMarchandiseItem["motif"], string> = {
  pas_notre_variete: "Pas notre variété",
  produit_pourri:    "Produit pourri / avarié",
  trop_vieux:        "Trop vieux / dépassé",
  endommage:         "Endommagé (transport)",
  autre:             "Autre motif",
}

export interface ControleRetour {
  date: string
  caissesPrevues: number
  caissesRetournees: number
  caissesMarcheRetour: number
  marchandises: RetourMarchandiseItem[]
  validated: boolean
  observations?: string
}

export interface TripCharge {
  id: string
  numero: string     // auto-generated: TRP-001, TRP-002…
  date: string
  livreur: string
  immatricule: string
  secteur: string
  nbCaissesFact: number
  nbClients: number
  kmDepart: number | null
  kmRetour: number | null
  charges: { type: TripChargeType; montant: number; description?: string }[]
  validated: boolean
  controleRetour?: ControleRetour
}

export interface AnalyseAchat {
  article: string
  qteAchat: number
  valeurAchat: number
  qteReception: number
  valeurReception: number
  valeurRetenue: number    // min(valeurAchat, valeurReception)
  montantDonne: number     // montant donné à l'acheteur
  montantRendu: number
  ecart: number            // montantRendu + valeurRetenue - montantDonne
}

export interface CmdVsFacturation {
  article: string
  client: string
  qteCmdee: number
  prixCmd: number
  qteFact: number
  prixFact: number
  ecartQte: number
  ecartValeur: number
}

// ─── Default data ─────────────────────────────────────────────────────────────
export const DEFAULT_CUTOFFS: CutoffNotification[] = [
  // ── Marché / planification achat ──
  { id: "co13", label: "Préparer espèce marché", time: "03:30", message: "💵 Préparez l'espèce du marché selon le Rapport Besoin Marché (montant + camions).", active: true, roles: ["financier", "cash_man", "resp_achat"] },
  { id: "co14", label: "Préparer camions", time: "03:45", message: "🛻 Préparez les Honda selon le tonnage du jour (voir Rapport Marché).", active: true, roles: ["resp_logistique", "dispatcheur"] },
  { id: "co15", label: "Départ marché", time: "04:00", message: "⏰ Départ marché : respectez l'heure recommandée (selon tonnage).", active: true, roles: ["acheteur", "resp_achat"] },
  // ── Achat (démarrage + fin par famille) ──
  { id: "co1",  label: "Démarrage achat", time: "06:00", message: "🟢 Démarrage achat : le marché est ouvert, commencez vos achats.", active: true, roles: ["acheteur", "resp_achat"] },
  { id: "co17", label: "Fin achat Légumes", time: "08:00", message: "🥦 Cut-off achat LÉGUMES atteint — clôturez vos achats légumes.", active: true, roles: ["acheteur", "resp_achat"] },
  { id: "co18", label: "Fin achat Fruits", time: "08:30", message: "🍎 Cut-off achat FRUITS atteint — clôturez vos achats fruits.", active: true, roles: ["acheteur", "resp_achat"] },
  { id: "co19", label: "Fin achat Herbes", time: "09:00", message: "🌿 Cut-off achat HERBES atteint — clôturez vos achats herbes.", active: true, roles: ["acheteur", "resp_achat"] },
  { id: "co3",  label: "Fin achat (global)", time: "10:00", message: "🔒 Cut-off achats global atteint. Tout achat après sera traité demain.", active: true, roles: ["acheteur", "resp_achat", "ctrl_achat"] },
  { id: "co16", label: "Réception marché", time: "11:00", message: "📦 Réceptionnez et pesez les achats du marché — mettez à jour le stock.", active: true, roles: ["magasinier", "ctrl_achat"] },
  // ── Commercial / Prévente ──
  { id: "co4",  label: "Démarrage prévente", time: "08:00", message: "Bonne tournée ! Saisissez vos commandes au fil des visites.", active: true, roles: ["prevendeur", "team_leader"] },
  { id: "co5",  label: "Rappel cut-off prévente", time: "16:00", message: "⏰ Cut-off prévente à 17h : transmettez les commandes de demain.", active: true, roles: ["prevendeur", "team_leader", "resp_commercial"] },
  { id: "co6",  label: "Fin prévente", time: "17:00", message: "🔒 Clôture prévente. Dernier appel pour les commandes du lendemain.", active: true, roles: ["prevendeur", "team_leader"] },
  // ── Logistique / Préparation ──
  { id: "co7",  label: "Démarrage préparation", time: "14:00", message: "Préparation : vérifiez le stock et lancez le picking.", active: true, roles: ["magasinier", "ctrl_prep", "chef_depot"] },
  { id: "co20", label: "Fin préparation 1", time: "16:00", message: "✅ Fin préparation 1 — clôturez le 1er lot de préparation.", active: true, roles: ["magasinier", "ctrl_prep", "chef_depot"] },
  { id: "co8",  label: "Fin préparation (clôture)", time: "18:00", message: "🔒 Clôture préparation : contrôlez les caisses avant chargement.", active: true, roles: ["magasinier", "ctrl_prep"] },
  { id: "co21", label: "Fin chargement", time: "18:30", message: "🚚 Fin chargement : véhicules chargés, vérifiez le manifeste.", active: true, roles: ["magasinier", "ctrl_prep", "dispatcheur", "resp_logistique"] },
  // ── Dispatch / Livraison ──
  { id: "co22", label: "Départ 1 (livraison)", time: "06:30", message: "🚐 Départ tournée 1 : partez selon votre feuille de route.", active: true, roles: ["livreur", "dispatcheur"] },
  { id: "co9",  label: "Tournées prêtes", time: "07:00", message: "Tournées prêtes : récupérez votre feuille de route et partez.", active: true, roles: ["livreur", "dispatcheur"] },
  { id: "co10", label: "Retour dépôt", time: "19:00", message: "Retour dépôt : déposez caisses, retours et encaissements du jour.", active: true, roles: ["livreur", "dispatcheur", "resp_logistique"] },
  // ── Caisse / Finance ──
  { id: "co11", label: "Cut-off caisse", time: "18:30", message: "Cut-off caisse : transmettez les encaissements pour clôture.", active: true, roles: ["cash_man"] },
  { id: "co12", label: "Clôture financière", time: "19:30", message: "Clôture financière : rapprochez caisse, BL et crédits.", active: true, roles: ["financier", "comptable"] },
]

export const DEFAULT_FEEDBACKS: Feedback[] = [
  { id: "fb1", source: "client",      auteur: "Restaurant Al Fassia",  sujet: "Qualité tomates",  message: "Les tomates de la dernière livraison étaient trop mûres.", note: 3, date: "2024-01-20", statut: "nouveau" },
  { id: "fb2", source: "fournisseur", auteur: "Marché Central Casa",   sujet: "Délai paiement",   message: "Le règlement de la facture F-022 est en retard de 3 jours.", note: 2, date: "2024-01-19", statut: "lu" },
  { id: "fb3", source: "equipe",      auteur: "Demo Livreur",          sujet: "Route difficile",  message: "La route Ain Sebaa est en travaux, prévoir 20 min supplémentaires.", note: 4, date: "2024-01-18", statut: "traite" },
  { id: "fb4", source: "client",      auteur: "Superette Najah",       sujet: "Excellent service",message: "Très satisfait de la ponctualité et qualité des herbes fraîches.", note: 5, date: "2024-01-17", statut: "traite" },
  { id: "fb5", source: "equipe",      auteur: "Demo Acheteur",         sujet: "Stock menthe",     message: "Rupture de stock menthe fraîche deux fois cette semaine.", note: 2, date: "2024-01-16", statut: "nouveau" },
]

export const DEFAULT_TRIP_CHARGES: TripCharge[] = [
  {
    id: "tc1", numero: "TRP-001", date: "2024-01-20", livreur: "Demo Livreur", immatricule: "W-12345-A",
    secteur: "Nord", nbCaissesFact: 48, nbClients: 5,
    kmDepart: 42500, kmRetour: 42578, validated: true,
    charges: [{ type: "carburant", montant: 180 }, { type: "peage", montant: 40 }],
    controleRetour: {
      date: "2024-01-20", caissesPrevues: 48, caissesRetournees: 46,
      caissesMarcheRetour: 3, validated: true,
      observations: "2 caisses manquantes signalées au livreur",
      marchandises: [
        { article: "Tomates Rondes", quantite: 5, motif: "produit_pourri", alerte: true, iaObservation: "Produit pourri détecté — vérifier conditions de transport (chaîne du froid)." },
        { article: "Menthe Fraîche", quantite: 2, motif: "trop_vieux",    alerte: true, iaObservation: "Herbe fanée — délai dépasse 48h depuis réception en entrepôt." },
      ],
    },
  },
  {
    id: "tc2", numero: "TRP-002", date: "2024-01-20", livreur: "Demo Livreur", immatricule: "W-67890-B",
    secteur: "Centre", nbCaissesFact: 32, nbClients: 4,
    kmDepart: 61200, kmRetour: null, validated: false,
    charges: [],
  },
]

export const DEFAULT_ANALYSE_ACHAT: AnalyseAchat[] = [
  { article: "Tomates",         qteAchat: 500, valeurAchat: 1250, qteReception: 480, valeurReception: 1200, valeurRetenue: 1200, montantDonne: 1300, montantRendu: 50,  ecart: -50  },
  { article: "Pommes de terre", qteAchat: 800, valeurAchat: 1440, qteReception: 800, valeurReception: 1440, valeurRetenue: 1440, montantDonne: 1500, montantRendu: 60,  ecart: 0    },
  { article: "Oignons",         qteAchat: 300, valeurAchat: 600,  qteReception: 290, valeurReception: 580,  valeurRetenue: 580,  montantDonne: 620,  montantRendu: 40,  ecart: 0    },
  { article: "Carottes",        qteAchat: 250, valeurAchat: 550,  qteReception: 240, valeurReception: 528,  valeurRetenue: 528,  montantDonne: 560,  montantRendu: 32,  ecart: 0    },
  { article: "Poivrons",        qteAchat: 150, valeurAchat: 675,  qteReception: 145, valeurReception: 652,  valeurRetenue: 652,  montantDonne: 700,  montantRendu: 48,  ecart: 0    },
  { article: "Courgettes",      qteAchat: 200, valeurAchat: 600,  qteReception: 195, valeurReception: 585,  valeurRetenue: 585,  montantDonne: 620,  montantRendu: 35,  ecart: 0    },
]

export const DEFAULT_CMD_FACT: CmdVsFacturation[] = [
  { article: "Tomates",         client: "Epicerie Al Baraka",   qteCmdee: 50, prixCmd: 125,  qteFact: 48, prixFact: 120,  ecartQte: 2, ecartValeur: 5   },
  { article: "Pommes de terre", client: "Restaurant Al Fassia", qteCmdee: 80, prixCmd: 144,  qteFact: 80, prixFact: 144,  ecartQte: 0, ecartValeur: 0   },
  { article: "Oignons",         client: "Superette Najah",      qteCmdee: 30, prixCmd: 60,   qteFact: 28, prixFact: 56,   ecartQte: 2, ecartValeur: 4   },
  { article: "Carottes",        client: "Epicerie Al Baraka",   qteCmdee: 25, prixCmd: 55,   qteFact: 25, prixFact: 55,   ecartQte: 0, ecartValeur: 0   },
  { article: "Tomates cerises", client: "Hotel Kenzi Tower",    qteCmdee: 10, prixCmd: 80,   qteFact: 10, prixFact: 80,   ecartQte: 0, ecartValeur: 0   },
  { article: "Courgettes",      client: "Boucherie Tazi",       qteCmdee: 15, prixCmd: 45,   qteFact: 12, prixFact: 36,   ecartQte: 3, ecartValeur: 9   },
]

// ============================================================
// LOYALTY ENGINE — Points, Rewards, Discounts, Bonuses
// ============================================================

export type ClientSegment = "standard" | "vip" | "grossiste" | "fidele"
export type DiscountType = "pourcentage" | "montant_fixe" | "article_offert"
export type DiscountScope = "client" | "article" | "famille" | "segment" | "global"
export type LoyaltyTransactionType = "gain" | "rachat" | "expiration" | "annule"
export type BonusRedemptionType = "remise_monetaire" | "article_offert" | "code_promo"

export interface DiscountRule {
  id: string
  nom: string
  actif: boolean
  scope: DiscountScope
  // Targets (depends on scope)
  clientId?: string          // scope === "client"
  clientNom?: string
  articleId?: string         // scope === "article"
  articleNom?: string
  famille?: string            // scope === "famille"
  segment?: ClientSegment    // scope === "segment"
  // Discount details
  type: DiscountType
  valeur: number             // % or DH or qty if article_offert
  articleOffertId?: string   // if type === "article_offert"
  articleOffertNom?: string
  articleOffertQte?: number
  // Validity
  dateDebut?: string
  dateFin?: string
  // Conditions
  commandeMinDH?: number     // minimum order value to activate
  appOnly?: boolean          // discount applies only to orders via app
  // WhatsApp
  codePromo?: string         // promo code to share via WhatsApp
  messageWhatsApp?: string   // pre-built WA message
  // Metadata
  createdBy: string
  createdAt: string
}

export interface LoyaltyConfig {
  actif: boolean
  // Points gain rules
  pointsParDH: number              // e.g. 1 point per 10 DH
  bonusZeroRetour: number          // extra points for 0-return orders
  bonusAppOrder: number            // extra points for app orders
  // Redemption thresholds
  pointsParRemiseDH: number        // e.g. 100 points = 10 DH
  minimumPointsRachat: number      // minimum points to redeem
  // Article cadeau threshold
  pointsArticleCadeau: number      // e.g. 500 points = 1 crate free
  articleCadeauId?: string
  articleCadeauNom?: string
  articleCadeauQte?: number
  // Expiry
  expirationJours?: number         // points expire after N days (0 = never)
  // ── Prime nouveau client ──────────────────────────────────────
  // Déclenchée une seule fois par client, dès que le seuil (commandes OU
  // tonnage) est atteint — récompense le prévendeur qui l'a acquis ET
  // le client lui-même (points bonus).
  primeNouveauClientActif?: boolean
  primeNouveauClientSeuilCommandes?: number  // ex: 3
  primeNouveauClientSeuilKg?: number         // ex: 1000 (= 1 tonne)
  primeNouveauClientMontantPrevendeur?: number // DH ajoutés au bonus du prévendeur
  primeNouveauClientPointsClient?: number      // points fidélité bonus pour le client
  // Metadata
  updatedBy: string
  updatedAt: string
}

export const DEFAULT_LOYALTY_CONFIG: LoyaltyConfig = {
  actif: true,
  pointsParDH: 0.1,               // 1 point per 10 DH (0.1 pts/DH)
  bonusZeroRetour: 50,            // 50 bonus points for 0-return trip
  bonusAppOrder: 20,              // 20 bonus points for app orders
  pointsParRemiseDH: 10,          // 10 points = 1 DH discount
  minimumPointsRachat: 100,
  pointsArticleCadeau: 500,
  articleCadeauNom: "Caisse offerte",
  articleCadeauQte: 1,
  expirationJours: 365,
  primeNouveauClientActif: true,
  primeNouveauClientSeuilCommandes: 3,
  primeNouveauClientSeuilKg: 1000,
  primeNouveauClientMontantPrevendeur: 50,
  primeNouveauClientPointsClient: 100,
  updatedBy: "system",
  updatedAt: new Date().toISOString(),
}

export interface LoyaltyTransaction {
  id: string
  clientId: string
  clientNom: string
  commandeId?: string
  type: LoyaltyTransactionType
  points: number                   // positive = gain, always positive here (type determines sign)
  motif: string                    // "Commande app", "Zero retour", "Rachat remise 50DH"...
  redemptionType?: BonusRedemptionType
  redemptionValeur?: number        // DH amount or qty
  redemptionArticleId?: string
  statut: "valide" | "en_attente" | "annule"
  createdBy: string
  createdAt: string
}

// ── Prime Nouveau Client ────────────────────────────────────────────
// Une seule fois par client : déclenchée dès que le seuil (commandes OU
// tonnage cumulé) est atteint. Récompense le prévendeur (montant ajouté à
// son bonus) ET le client (points fidélité bonus).
export interface PrimeNouveauClient {
  id: string
  clientId: string
  clientNom: string
  prevendeurId: string
  prevendeurNom: string
  critere: "commandes" | "tonnage"
  nbCommandes: number
  totalKg: number
  dateEligibilite: string
  montantPrevendeur: number
  pointsClient: number
  statutPrevendeur: "en_attente" | "payee"
  datePaiementPrevendeur?: string
  createdAt: string
}

// ── Driver Performance Bonuses ────────────────────────────────────────────────

export type DriverType = "interne" | "externe"
export type BonusCriteria = "zero_retard" | "zero_retour" | "zero_qualite"

export interface DriverBonusConfig {
  actif: boolean
  // Bonus amounts (DH) per criteria met per trip
  bonusZeroRetard: number          // 0 delays
  bonusZeroRetour: number          // 0 returns
  bonusZeroQualite: number         // 0 quality issues
  // All 3 criteria = jackpot bonus
  bonusParfait: number             // all 3 combined
  // External driver — different scale
  bonusExterneZeroRetard: number
  bonusExterneZeroRetour: number
  bonusExterneZeroQualite: number
  bonusExterneParfait: number
  // Period
  cycleBonus: "par_trip" | "journalier" | "hebdomadaire" | "mensuel"
  updatedBy: string
  updatedAt: string
}

export const DEFAULT_DRIVER_BONUS_CONFIG: DriverBonusConfig = {
  actif: true,
  bonusZeroRetard: 50,
  bonusZeroRetour: 80,
  bonusZeroQualite: 50,
  bonusParfait: 250,
  bonusExterneZeroRetard: 30,
  bonusExterneZeroRetour: 50,
  bonusExterneZeroQualite: 30,
  bonusExterneParfait: 150,
  cycleBonus: "par_trip",
  updatedBy: "system",
  updatedAt: new Date().toISOString(),
}

export interface DriverBonusRecord {
  id: string
  livreurId: string
  livreurNom: string
  driverType: DriverType
  tripId: string
  date: string
  // Performance flags
  zeroRetard: boolean
  zeroRetour: boolean
  zeroQualite: boolean
  // Computed bonus
  montantBonus: number
  criteriaRemplis: BonusCriteria[]
  statut: "calcule" | "valide" | "paye" | "annule"
  validePar?: string
  createdAt: string
}

// ── Shareholder Distributions ─────────────────────────────────────────────────

export interface ShareholderDistribution {
  id: string
  periode: string               // "2025-03" or "2025-W12" or "2025-03-15"
  cycleType: "journalier" | "hebdomadaire" | "mensuel"
  beneficeNet: number
  totalDistribue: number
  lignes: {
    actionnaireId: string
    actionnaireNom: string
    cotisation: number
    part: number                // percentage 0-100
    montant: number
    statut: "en_attente" | "paye" | "annule"
    datePaiement?: string
    modePaiement?: "virement" | "especes" | "cheque"
  }[]
  statut: "brouillon" | "valide" | "distribue"
  validePar?: string
  createdBy: string
  createdAt: string
  notes?: string
}

// ── HR Custom Templates ────────────────────────────────────────────────────────

export type HRTemplateType = "contrat" | "attestation_travail" | "attestation_salaire" | "fiche_paie" | "avertissement" | "mise_en_demeure" | "bon_livraison" | "facture" | "purchase_order"

export interface HRCustomTemplate {
  id: string
  nom: string
  type: HRTemplateType
  description?: string
  contenu: string              // HTML template with {{variables}} placeholders
  variables: string[]          // list of {{variable}} keys used
  actif: boolean
  isDefault?: boolean
  previewHtml?: string         // cached preview
  createdBy: string
  createdAt: string
  updatedAt: string
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNT REQUESTS — Portail externe (clients & fournisseurs)
// ─────────────────────────────────────────────────────────────────────────────

export type AccountRequestStatut = "en_attente" | "approuve" | "rejete"

export interface AccountRequest {
  id: string
  type: "client" | "fournisseur" | "livreur"
  // Sous-type demandé (chr / marchand / particulier / fournisseur / client…)
  sous_type?: string
  nom: string
  email: string
  telephone: string
  societe?: string
  ice?: string
  ville?: string
  adresse?: string
  message?: string
  // Client-specific
  typeClient?: "particulier" | "marchand" | "restaurant" | "hotel" | "traiteur" | "supermarche" | "autre"
  nbCouverts?: number
  nbChambres?: number
  // Fournisseur-specific
  typeFournisseur?: "producteur" | "grossiste" | "importateur" | "transformateur"
  familles?: string[]
  volumeEstime?: string
  zoneLivraison?: string
  statut: AccountRequestStatut
  createdAt: string
  approvedAt?: string
  approvedBy?: string
  rejectedAt?: string
  rejectedBy?: string
  rejectReason?: string
  // Once approved, link to the created record
  _linkedClientId?: string
  _linkedFournisseurId?: string
  _linkedUserId?: string
  _linkedLivreurId?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// WEB INTEGRATION — API key + webhook config for external site link
// ─────────────────────────────────────────────────────────────────────────────

export interface WebIntegrationConfig {
  apiKey: string               // secret token for external site calls
  enabled: boolean
  allowedOrigins: string[]     // CORS whitelist e.g. ["https://monsite.ma"]
  cataloguePublic: boolean     // expose catalogue publicly via API
  commandesPubliques: boolean  // allow order creation via API
  demandesComptes: boolean     // allow account requests via external form
  webhookUrl?: string          // URL to ping on events (new order, new request…)
  webhookSecret?: string
  updatedAt: string
  updatedBy?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// STORE extensions — append to the store object (pattern: module augmentation)
// ─────────────────────────────────────────────────────────────────────────────

// We extend the store object dynamically to keep this file append-only
const storeExtensions = {
  // --- Account Requests ---
  getAccountRequests: (): AccountRequest[] => {
    try { return JSON.parse(localStorage.getItem("fl_account_requests") ?? "[]") } catch { return [] }
  },
  saveAccountRequests: (arr: AccountRequest[]) => {
    try { localStorage.setItem("fl_account_requests", JSON.stringify(arr)) } catch {}
  },
  saveAccountRequest: (req: AccountRequest) => {
    const arr = storeExtensions.getAccountRequests()
    const idx = arr.findIndex(r => r.id === req.id)
    if (idx >= 0) arr[idx] = req; else arr.unshift(req)
    storeExtensions.saveAccountRequests(arr)
  },

  // --- Web Integration Config ---
  getWebIntegrationConfig: (): WebIntegrationConfig => {
    try {
      const raw = localStorage.getItem("fl_web_integration")
      if (raw) return JSON.parse(raw)
    } catch {}
    return {
      apiKey: "",
      enabled: false,
      allowedOrigins: [],
      cataloguePublic: true,
      commandesPubliques: false,
      demandesComptes: true,
      updatedAt: new Date().toISOString(),
    }
  },
  saveWebIntegrationConfig: (c: WebIntegrationConfig) => {
    try { localStorage.setItem("fl_web_integration", JSON.stringify(c)) } catch {}
  },
  generateApiKey: (): string => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    return "fl_" + Array.from({ length: 40 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
  },
}

// Merge extensions onto the store object (safe spread — no type magic needed)
Object.assign(store, storeExtensions)






