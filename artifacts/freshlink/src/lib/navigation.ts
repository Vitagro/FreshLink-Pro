// Choix de la méthode de navigation GPS vers un point (client/livraison) —
// centralise les 3 options proposées à l'utilisateur au lieu d'ouvrir
// Google Maps en dur partout dans l'app.
export type NavMethod = "gps" | "google" | "waze"

export const NAV_METHOD_LABELS: Record<NavMethod, { label: string; icon: string }> = {
  gps:    { label: "GPS (méthode actuelle)", icon: "📍" },
  google: { label: "Google Maps",            icon: "🗺️" },
  waze:   { label: "Waze",                   icon: "🚗" },
}

function openUrl(url: string) {
  const link = document.createElement("a")
  link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer"
  document.body.appendChild(link); link.click(); document.body.removeChild(link)
}

// "gps" reproduit exactement le comportement historique de l'app (déjà en
// prod avant l'ajout du choix) : lien directions Google Maps sur
// Android/desktop, deep-link natif Plans sur iOS — pour ne rien changer par
// défaut chez ceux qui ne touchent pas au sélecteur.
export function openNavigation(method: NavMethod, lat: number, lng: number) {
  if (method === "waze") { openUrl(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`); return }
  if (method === "google") { openUrl(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`); return }
  const isIOS = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent)
  openUrl(isIOS ? `maps:0,0?q=${lat},${lng}` : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`)
}
