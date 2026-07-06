import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// ── Auto-reload sur chunk périmé ────────────────────────────────────────────
// Après chaque déploiement, les fichiers JS hashés changent de nom et les
// anciens sont supprimés du serveur. Un onglet resté ouvert (ou un
// index.html en cache) qui tente un import dynamique (React.lazy, utilisé
// partout dans BackOfficeLayout/MobileLayout) reçoit alors un 404 →
// "Failed to fetch dynamically imported module" → écran "Erreur de
// chargement". Un simple rechargement récupère le nouveau index.html avec
// les bonnes références. Garde anti-boucle : un seul rechargement auto par
// session (si ça échoue encore après reload, le problème n'est pas un cache
// périmé et on n'insiste pas indéfiniment).
const RELOAD_GUARD_KEY = "fl_chunk_reload_once";
function reloadOnStaleChunk() {
  try {
    if (sessionStorage.getItem(RELOAD_GUARD_KEY)) return
    sessionStorage.setItem(RELOAD_GUARD_KEY, "1")
  } catch { /* sessionStorage indisponible — on tente quand meme un reload */ }
  window.location.reload()
}
window.addEventListener("vite:preloadError", reloadOnStaleChunk)
window.addEventListener("unhandledrejection", e => {
  const msg = String(e?.reason?.message ?? e?.reason ?? "")
  if (/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(msg)) {
    reloadOnStaleChunk()
  }
})

createRoot(document.getElementById("root")!).render(<App />);
