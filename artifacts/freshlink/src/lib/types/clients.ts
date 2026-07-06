/**
 * Types for Clients & Web Registration Analysis
 * Updated: 2026-06-05
 *
 * Includes:
 * - Enhanced Client type with web registration tracking
 * - Merchant location classification
 * - Web registration analytics
 */

// ═══════════════════════════════════════════════════════════════════════════
// ENUMS
// ═══════════════════════════════════════════════════════════════════════════

export enum LieuType {
  MAGASIN = "magasin",        // Small shop/grocery
  BIDANE = "bidane",          // Fish market stall
  TABLE = "table",            // Mobile vendor/table
  MARCHE = "marche",          // Covered market
  KIOSK = "kiosk",            // Kiosk
  RESTAURANT = "restaurant",  // Restaurant/Hotel
  DEPOT = "depot",            // Storage/warehouse
  COOPÉRATIVE = "coopérative", // Cooperative
  GROSSISTE = "grossiste",    // Wholesale
  FERME = "ferme",            // Farm/producer
  AUTRE = "autre",            // Other
}

export enum WebRegistrationSource {
  WEBSITE = "website",
  APP = "app",
  DIRECT = "direct",
}

export enum WebVerificationStatus {
  PENDING = "pending",
  VERIFIED = "verified",
  REJECTED = "rejected",
}

export enum SourceAcquisition {
  GOOGLE = "google",
  FACEBOOK = "facebook",
  RECOMMENDATION = "recommendation",
  SALESMAN = "salesman",
  EVENT = "event",
  WORD_OF_MOUTH = "word_of_mouth",
  OTHER = "other",
}

export enum DecisionFactor {
  PRIX = "prix",
  QUALITE = "qualite",
  FACILITE = "facilite",
  LIVRAISON = "livraison",
  CREDIT = "credit",
  SERVICE = "service",
  INNOVATION = "innovation",
  AUTRE = "autre",
}

export enum LieuCaracteristic {
  CLIMATISE = "climatise",
  ETAGERES = "etageres",
  CONGELATEUR = "congelateur",
  FRIGO = "frigo",
  STOCKAGE = "stockage",
  LIVRAISON = "livraison",
  AUTRE = "autre",
}

export enum DeviceType {
  DESKTOP = "desktop",
  MOBILE = "mobile",
  TABLET = "tablet",
}

export enum RegistrationStatus {
  COMPLETED = "completed",
  ABANDONED = "abandoned",
  ERROR = "error",
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPES: Client Web Registration
// ═══════════════════════════════════════════════════════════════════════════

export interface ClientWebRegistration {
  // Registration date/source
  webRegistrationDate?: string;
  webRegistrationSource?: WebRegistrationSource;
  webRegistrationReferrer?: string;

  // Pre-registration behavior
  webAnalysisVisits: number;
  webAnalysisTimeSpent: number; // seconds
  webAnalysisPagesViewed: number;

  // Profile completion
  webProfileCompletion: number; // 0-100

  // Documents
  webDocumentUploads: DocumentUpload[];

  // Verification
  webVerificationStatus: WebVerificationStatus;
  webVerificationDate?: string;
  webVerificationNotes?: string;
}

export interface DocumentUpload {
  type: "ICE" | "RC" | "AUTORISATION" | "AUTRE";
  filename: string;
  size: number; // bytes
  uploadedAt: string;
  verifiedAt?: string;
  notes?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPES: Merchant Location
// ═══════════════════════════════════════════════════════════════════════════

export interface MerchantLocation {
  lieuType?: LieuType;
  lieuTypeAutre?: string; // if lieuType === "autre"
  lieuDescription?: string;
  lieuSuperficie?: number; // m²
  lieuCaracteristiques: LieuCaracteristic[];
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPES: Client Acquisition
// ═══════════════════════════════════════════════════════════════════════════

export interface ClientAcquisition {
  sourceAcquisition?: SourceAcquisition;
  sourceAcquisitionDetail?: string;
  decisionFactors: DecisionFactor[];
  expectedAnnualVolume?: number; // kg
  expectationsText?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN TYPE: Enhanced Client
// ═══════════════════════════════════════════════════════════════════════════

export interface Client {
  id: string;
  nom: string;

  // Classification
  secteur: string;
  zone: string;
  type: "marchand" | "restaurant" | "depot" | "autre";
  typeAutre?: string;

  // Merchant location (new)
  lieuType?: LieuType;
  lieuTypeAutre?: string;
  lieuDescription?: string;
  lieuSuperficie?: number;
  lieuCaracteristiques?: LieuCaracteristic[];

  // Operations
  taille: string;
  typeProduits: string;
  rotation: string;

  // Payment & Credit
  modalitePaiement?: string;
  plafondCredit: number;
  creditAutorise: boolean;
  delaiRecouvrement?: string;
  creditWorkflowValidateur?: string;
  creditWorkflowValidateurNom?: string;
  creditStatut: string;
  creditSolde: number;

  // Location
  gpsLat?: number;
  gpsLng?: number;
  telephone?: string;
  email?: string;
  adresse?: string;

  // Documents
  ice?: string;
  notes?: string;

  // Web Registration Analysis (new)
  webRegistrationDate?: string;
  webRegistrationSource?: WebRegistrationSource;
  webRegistrationReferrer?: string;
  webAnalysisVisits: number;
  webAnalysisTimeSpent: number;
  webAnalysisPagesViewed: number;
  webProfileCompletion: number;
  webDocumentUploads?: DocumentUpload[];
  webVerificationStatus: WebVerificationStatus;
  webVerificationDate?: string;
  webVerificationNotes?: string;

  // Acquisition & Decision (new)
  sourceAcquisition?: SourceAcquisition;
  sourceAcquisitionDetail?: string;
  decisionFactors?: DecisionFactor[];
  expectedAnnualVolume?: number;
  expectationsText?: string;

  // Audit
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
  prevendeurId?: string;
  teamLeadId?: string;
  defaultHeureLivraison?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPES: Web Registration Session Tracking
// ═══════════════════════════════════════════════════════════════════════════

export interface WebRegistrationSession {
  id: string;
  clientId?: string;

  // Timing
  sessionStart: string;
  sessionEnd?: string;
  durationSeconds?: number;

  // Navigation
  firstPage?: string;
  lastPage?: string;
  pagesVisited: PageVisit[];
  referrer?: string; // Google, Facebook, etc

  // Form interaction
  formStarted?: string;
  formCompleted?: string;
  formAbandonments: number;
  formFieldsFilled: Record<string, boolean>;

  // Documents
  documentsUploaded?: DocumentUpload[];

  // Device info
  browserInfo?: string;
  deviceType?: DeviceType;
  ipAddress?: string;

  // Result
  registrationStatus: RegistrationStatus;
  registrationDate?: string;

  // Notes
  notes?: string;

  // Audit
  createdAt: string;
}

export interface PageVisit {
  page: string;
  timeSpent: number; // seconds
  order: number;
  timestamp: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPES: Supplier/Merchant (Fournisseur)
// ═══════════════════════════════════════════════════════════════════════════

export interface Fournisseur {
  id: string;
  nom: string;
  contact: string;
  telephone?: string;
  email: string;

  // Location (new)
  lieuType?: LieuType;
  lieuTypeAutre?: string;
  lieuDescription?: string;
  lieuCaracteristiques?: LieuCaracteristic[];
  gpsLat?: number;
  gpsLng?: number;

  // Operations
  specialites: string[];
  capaciteStock?: number; // tonnes
  volumeHebdo?: number; // kg
  modalitePaiement?: string;
  delaiPaiement?: number;

  // Documents
  ice?: string;
  rc?: string;

  // Logistics (new)
  joursLivraison?: string[]; // [lundi, mardi, ...]
  horairesLivraison?: string;
  itineraires?: Record<string, any>[];

  // Notes
  notes?: string;

  // Audit
  createdAt: string;
  updatedAt?: string;
  adresse?: string;
  ville?: string;
  region?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPES: Analytics Reports
// ═══════════════════════════════════════════════════════════════════════════

export interface WebRegistrationAnalytics {
  period: {
    startDate: string;
    endDate: string;
  };

  // Summary
  totalRegistrations: number;
  conversionRate: number; // %
  averageSessionDuration: number; // seconds
  averageProfileCompletion: number; // %

  // By source
  bySource: Record<WebRegistrationSource, number>;

  // By location type
  byLocationTypes: Record<LieuType, number>;

  // By decision factors
  decisionFactorFrequency: Record<DecisionFactor, number>;

  // Documents
  documentUploadStats: {
    ice: number;
    rc: number;
    autres: number;
  };

  // Acquisition
  acquisitionSourceStats: Record<SourceAcquisition, number>;

  // Volume expectations
  expectedAnnualVolumeAverage: number;
  expectedAnnualVolumeTotal: number;

  // Status breakdown
  statusBreakdown: Record<WebVerificationStatus, number>;
}

export interface ClientSimilarityMetrics {
  clientId: string;
  clientName: string;
  similarTo: string[]; // IDs of similar clients
  matchScore: number; // 0-100
  likelyNeeds: string[]; // Predicted needs based on similar clients
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════════════════

export const LIEU_TYPE_LABELS: Record<LieuType, string> = {
  [LieuType.MAGASIN]: "Magasin/Épicerie",
  [LieuType.BIDANE]: "Bidane (Marché Poisson)",
  [LieuType.TABLE]: "Vendeur Ambulant/Table",
  [LieuType.MARCHE]: "Marché Couvert",
  [LieuType.KIOSK]: "Kiosque",
  [LieuType.RESTAURANT]: "Restaurant/Hôtel",
  [LieuType.DEPOT]: "Dépôt/Stockage",
  [LieuType.COOPÉRATIVE]: "Coopérative",
  [LieuType.GROSSISTE]: "Grossiste",
  [LieuType.FERME]: "Ferme/Producteur",
  [LieuType.AUTRE]: "Autre",
};

export const SOURCE_ACQUISITION_LABELS: Record<SourceAcquisition, string> = {
  [SourceAcquisition.GOOGLE]: "Recherche Google",
  [SourceAcquisition.FACEBOOK]: "Publicité Facebook",
  [SourceAcquisition.RECOMMENDATION]: "Recommandation",
  [SourceAcquisition.SALESMAN]: "Commercial",
  [SourceAcquisition.EVENT]: "Événement/Salon",
  [SourceAcquisition.WORD_OF_MOUTH]: "Bouche à oreille",
  [SourceAcquisition.OTHER]: "Autre",
};

export const DECISION_FACTOR_LABELS: Record<DecisionFactor, string> = {
  [DecisionFactor.PRIX]: "Meilleur Prix",
  [DecisionFactor.QUALITE]: "Qualité Produits",
  [DecisionFactor.FACILITE]: "Facilité Plateforme",
  [DecisionFactor.LIVRAISON]: "Rapidité Livraison",
  [DecisionFactor.CREDIT]: "Conditions Crédit",
  [DecisionFactor.SERVICE]: "Qualité Service",
  [DecisionFactor.INNOVATION]: "Innovation",
  [DecisionFactor.AUTRE]: "Autre",
};
