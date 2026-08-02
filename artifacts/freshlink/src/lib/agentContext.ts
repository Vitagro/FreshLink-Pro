"use client"

// ══════════════════════════════════════════════════════════════════════════
// agentContext — injecte de VRAIES données de l'ERP dans le prompt des agents
// IA (mobile + back-office).
//
// Avant ce fichier, chaque agent (JARIRI, SI-MOHAMMED, JAWAD...) n'avait
// qu'un system prompt "roleplay" (règles, ton, jargon) SANS AUCUNE DONNÉE
// RÉELLE — l'IA ne pouvait donc que produire du texte plausible générique
// ("calcule le PO suggéré" → aucune commande/stock réel à regarder). C'est
// la cause racine du reproche "agit comme un raccourci de menu, pas
// vraiment intelligent". Ce module construit, pour chaque agent, un
// résumé chiffré ACTUEL (stock, crédit, commandes, RH...) à partir des
// getters store.ts déjà existants, à ajouter au system prompt avant l'appel LLM.
// ══════════════════════════════════════════════════════════════════════════

import { store, type User } from "./store"

function money(n: number): string { return `${Math.round(n || 0).toLocaleString("fr-MA")} DH` }
function dateNJoursAgo(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

// ── JARIRI — Commercial / Vente terrain ─────────────────────────────────────
function contextCommercial(user: User): string {
  const clients = store.getVisibleClients()
  const mesClients = user.role === "prevendeur" ? clients.filter(c => c.prevendeurId === user.id)
    : user.role === "team_leader" ? clients.filter(c => c.teamLeadId === user.id)
    : clients
  const cutoff7j = dateNJoursAgo(7)
  const commandesRecentes = store.getVisibleCommandes().filter(c => c.date >= cutoff7j)
  const caParClient = new Map<string, number>()
  commandesRecentes.forEach(c => caParClient.set(c.clientId, (caParClient.get(c.clientId) ?? 0) + c.lignes.reduce((s, l) => s + (l.total || 0), 0)))
  const topClients = [...mesClients].map(c => ({ c, ca: caParClient.get(c.id) ?? 0 })).sort((a, b) => b.ca - a.ca).slice(0, 8)
  const clientsCreditBloque = mesClients.filter(c => c.creditStatut === "refuse" || c.creditStatut === "attente_validation")
  const lignes = topClients.map(({ c, ca }) => {
    const basket = store.getClientBasket(c.id)
    const articles = basket?.lignes?.slice(0, 4).map(l => l.articleNom).join(", ") || "—"
    return `  • ${c.nom} (${c.secteur}) — CA 7j: ${money(ca)} — panier habituel: ${articles}${c.creditStatut && c.creditStatut !== "ok" ? ` — ⚠️ crédit: ${c.creditStatut}` : ""}`
  }).join("\n")
  return `DONNÉES ACTUELLES (réelles, à utiliser dans tes réponses) :
Portefeuille : ${mesClients.length} client(s) assigné(s).
Top clients (CA sur 7 jours) :
${lignes || "  Aucune commande sur 7 jours."}
${clientsCreditBloque.length ? `\n⚠️ ${clientsCreditBloque.length} client(s) avec crédit bloqué/en attente : ${clientsCreditBloque.map(c => c.nom).join(", ")}` : ""}`
}

// ── SI-MOHAMMED — Achat terrain ─────────────────────────────────────────────
function contextAchat(_user: User): string {
  const demandes = store.getDemandesAchat().filter(d => d.statut === "ouverte" || d.statut === "en_cours")
  const articles = store.getArticles()
  const crossdock = store.isCrossdockMode()
  const lignesDemandes = demandes.slice(0, 15).map(d => `  • ${d.articleNom} : besoin ${d.besoinNet} ${d.articleUnite} (${d.statut})${d.fournisseurNom ? ` — fournisseur habituel: ${d.fournisseurNom}` : ""}`).join("\n")
  if (crossdock) {
    return `DONNÉES ACTUELLES (réelles) — Mode crossdocking : pas de stock entrepot, l'achat se fait directement sur les commandes.
Besoins d'achat ouverts (${demandes.length}) :
${lignesDemandes || "  Aucun besoin ouvert actuellement."}`
  }
  const ruptures = articles.filter(a => a.stockDisponible <= 0).slice(0, 10).map(a => `  • ${a.nom} (${a.famille})`).join("\n")
  return `DONNÉES ACTUELLES (réelles) :
Besoins d'achat ouverts (${demandes.length}) :
${lignesDemandes || "  Aucun besoin ouvert actuellement."}
Articles en rupture de stock (${articles.filter(a => a.stockDisponible <= 0).length}) :
${ruptures || "  Aucune rupture."}`
}

// ── JAWAD — Supply Chain / Logistique ───────────────────────────────────────
function contextSupplyChain(_user: User): string {
  const today = store.today()
  const trips = store.getTrips().filter(t => t.date === today)
  const receptions = store.getReceptions().filter(r => r.date === today)
  const bls = store.getBonsLivraison().filter(b => b.date === today)
  const totalCaisses = bls.reduce((s, b) => s + (b.nbCaisseGros ?? 0) + (b.nbCaisseDemi ?? 0), 0)
  return `DONNÉES ACTUELLES (réelles, aujourd'hui ${today}) :
Trips du jour : ${trips.length}
Réceptions fournisseur du jour : ${receptions.length}
Bons de livraison du jour : ${bls.length} (${totalCaisses} caisse(s) au total)`
}

// ── AZMI — Finance & Crédit ──────────────────────────────────────────────────
function contextCredit(_user: User): string {
  const clients = store.getVisibleClients()
  const enAttente = clients.filter(c => c.creditStatut === "attente_validation")
  const overLimit = clients.filter(c => (c.creditSolde ?? 0) > (c.plafondCredit ?? Infinity))
  const soldeTotal = clients.reduce((s, c) => s + (c.creditSolde ?? 0), 0)
  const lignesAttente = enAttente.slice(0, 10).map(c => `  • ${c.nom} — solde ${money(c.creditSolde ?? 0)} / plafond ${money(c.plafondCredit ?? 0)}`).join("\n")
  const lignesOver = overLimit.slice(0, 10).map(c => `  • ${c.nom} — solde ${money(c.creditSolde ?? 0)} > plafond ${money(c.plafondCredit ?? 0)}`).join("\n")
  return `DONNÉES ACTUELLES (réelles) :
Encours crédit total : ${money(soldeTotal)}
Demandes en attente de validation (${enAttente.length}) :
${lignesAttente || "  Aucune."}
Clients en dépassement de plafond (${overLimit.length}) :
${lignesOver || "  Aucun."}`
}

// ── THOMAS — Contrôle de gestion / Qualité ──────────────────────────────────
function contextControle(_user: User): string {
  const today = store.today()
  const receptions = store.getReceptions().filter(r => r.date === today)
  let ecartsQte = 0, ecartsPrix = 0
  receptions.forEach(r => r.lignes.forEach(l => {
    if (l.quantiteFacturee != null && Math.abs((l.quantiteRecue ?? 0) - l.quantiteFacturee) > 0.01) ecartsQte++
    if (l.ecartPrix && Math.abs(l.ecartPrix) > 0.01) ecartsPrix++
  }))
  const articles = store.getArticles()
  const margeMoyenne = (() => {
    const withPa = articles.filter(a => a.prixAchat > 0)
    if (!withPa.length) return 0
    const pct = withPa.map(a => { const pv = store.computePV(a); return pv > 0 ? ((pv - a.prixAchat) / pv) * 100 : 0 })
    return pct.reduce((s, v) => s + v, 0) / pct.length
  })()
  return `DONNÉES ACTUELLES (réelles, aujourd'hui ${today}) :
Réceptions du jour : ${receptions.length} (${ecartsQte} écart(s) quantité, ${ecartsPrix} écart(s) prix détecté(s))
Marge brute moyenne catalogue : ${margeMoyenne.toFixed(1)}%${margeMoyenne < 15 ? " ⚠️ sous le seuil d'alerte (15%)" : ""}`
}

// ── OURAI — Ressources Humaines ──────────────────────────────────────────────
function contextRH(_user: User): string {
  const salaries = store.getSalaries()
  const parDepartement = new Map<string, number>()
  salaries.forEach(s => parDepartement.set(s.departement || "Non renseigné", (parDepartement.get(s.departement || "Non renseigné") ?? 0) + 1))
  const cddBientotFin = salaries.filter(s => s.datefinCdd && s.datefinCdd <= dateNJoursAgo(-30) && s.datefinCdd >= store.today())
  const lignesDept = [...parDepartement.entries()].map(([d, n]) => `  • ${d} : ${n}`).join("\n")
  return `DONNÉES ACTUELLES (réelles) :
Effectif total : ${salaries.length}
Par département :
${lignesDept || "  Non renseigné."}
${cddBientotFin.length ? `\n⚠️ ${cddBientotFin.length} CDD arrivant à échéance sous 30 jours.` : ""}`
}

// ── ASHEL — Sourcing / Achat IA ──────────────────────────────────────────────
function contextSourcing(user: User): string {
  // Réutilise la logique achat (besoins + ruptures) + historique PA récent.
  const base = contextAchat(user)
  const articles = store.getArticles().filter(a => (a.historiquePrixAchat?.length ?? 0) > 0).slice(0, 8)
  const histo = articles.map(a => {
    const h = (a.historiquePrixAchat ?? []).slice(0, 3).map(e => `${e.prixAchat} DH (${e.fournisseurNom || "?"})`).join(" · ")
    return `  • ${a.nom} : ${h || "—"}`
  }).join("\n")
  return `${base}\n\nHistorique PA récent (derniers achats) :\n${histo || "  Aucun historique."}`
}

// ── ZIZI — Prospection / Chasse commerciale ─────────────────────────────────
// Pas de table "prospects" dédiée dans store.ts — on donne le contexte
// commercial global (secteurs couverts, clients par zone) pour situer
// où prospecter en priorité.
function contextProspection(_user: User): string {
  const clients = store.getVisibleClients()
  const parSecteur = new Map<string, number>()
  clients.forEach(c => parSecteur.set(c.secteur || "Non renseigné", (parSecteur.get(c.secteur || "Non renseigné") ?? 0) + 1))
  const lignes = [...parSecteur.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([s, n]) => `  • ${s} : ${n} client(s) actif(s)`).join("\n")
  return `DONNÉES ACTUELLES (réelles) :
Répartition des clients actifs par secteur (identifie les zones sous-couvertes à prospecter) :
${lignes || "  Aucun client enregistré."}`
}

const BUILDERS: Record<string, (user: User) => string> = {
  jariri: contextCommercial,
  simohammed: contextAchat,
  jawad: contextSupplyChain,
  azmi: contextCredit,
  thomas: contextControle,
  ourai: contextRH,
  ashel: contextSourcing,
  zizi: contextProspection,
}

/** Construit le résumé de données réelles pour l'agent donné — chaîne vide si
 * l'agent n'a pas de contexte dédié (fallback générique) ou en cas d'erreur
 * (jamais bloquant : mieux vaut un agent sans données qu'un agent qui plante). */
export function buildAgentDataContext(agentId: string, user: User): string {
  try {
    return BUILDERS[agentId]?.(user) ?? ""
  } catch {
    return ""
  }
}
