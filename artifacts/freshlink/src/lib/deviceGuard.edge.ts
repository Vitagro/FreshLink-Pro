/**
 * deviceGuard.edge.ts — constantes Edge Runtime compatibles
 * Pas d'import Node.js crypto ici.
 * Le middleware importe uniquement depuis ce fichier.
 */

export const DEVICE_COOKIE = "fl_device_token"
// `||` (et non `??`) : une valeur vide "" doit retomber sur le défaut, sinon le bypass admin casse
// et `?bypass=` (vide) laisserait passer n'importe qui vers les API internes. La vraie clé forte
// est dans l'env DEVICE_BYPASS_KEY (à définir sur Vercel).
export const DEVICE_BYPASS = "vita-bypass-2026"
export const SADMIN_COOKIE = "fl_sadmin_bypass"
