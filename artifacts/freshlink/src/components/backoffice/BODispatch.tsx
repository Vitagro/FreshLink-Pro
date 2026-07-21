"use client"

import { useState, useEffect, useRef } from "react"
import { store, type Commande, type Trip, type Livreur, type TransportCompany, type User, ROLE_COLORS } from "@/lib/store"
import { hasPermission } from "@/lib/permissions"
import { logAction } from "@/lib/auditLog"
import { uploadToStorage } from "@/lib/supabase/client"
import { printBL, printFeuilleRoute, type FeuilleRouteData } from "@/lib/print"

interface Props { user: User }

// Distance à vol d'oiseau (km) entre 2 points GPS (formule de Haversine).
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}

// Majoration route vs vol d'oiseau (pas de routing réel branché) — ratio usuel
// ville/périurbain pour une estimation raisonnable, pas une valeur exacte.
const ROAD_FACTOR = 1.3

// Estime le km total d'une tournée à partir des arrêts GPS de son itinéraire
// (triés par ordre de livraison), départ->arrêt1->arrêt2->...
function estimateTripKm(itineraire: Trip["itineraire"]): number {
  const pts = [...itineraire].sort((a, b) => a.ordre - b.ordre)
  if (pts.length < 2) return 0
  let total = 0
  for (let i = 1; i < pts.length; i++) total += haversineKm(pts[i - 1], pts[i])
  return Math.round(total * ROAD_FACTOR * 10) / 10
}

const EMPTY_LIVREUR: Omit<Livreur, "id"> = {
  type: "interne", nom: "", prenom: "", telephone: "", actif: true,
  matricule: "", capaciteCaisses: 0, capaciteTonnage: 0,
  carburantInclus: false, consommationL100: 0,
}

export default function BODispatch({ user }: Props) {
  const [activeTab, setActiveTab] = useState<"trips" | "livreurs" | "transporteurs" | "charge">("trips")

  // ---- Charge logistique state ----
  const [chargeForm, setChargeForm] = useState({
    nbClients: 10,
    nbCaisses: 50,
    hasRetour: false,
    avecLivreur: true,
    distanceKm: 80,
    // Tarifs de base configurables
    tarifBase: 150,           // DH par tournee (frais fixe)
    tarifParClient: 15,       // DH par client visite
    tarifParCaisse: 2,        // DH par caisse livree
    tarifRetour: 50,          // supplement retour
    tarifSoloReduction: 20,   // % de reduction si sans livreur (ex: resp logistique seul)
    tarifKm: 1.5,             // DH par km
  })
  const chargeResult = (() => {
    const { nbClients, nbCaisses, hasRetour, avecLivreur, distanceKm,
      tarifBase, tarifParClient, tarifParCaisse, tarifRetour, tarifSoloReduction, tarifKm } = chargeForm
    const fraisFixe = tarifBase
    const fraisClients = nbClients * tarifParClient
    const fraisCaisses = nbCaisses * tarifParCaisse
    const fraisKm = distanceKm * tarifKm
    const fraisRetour = hasRetour ? tarifRetour : 0
    const subtotal = fraisFixe + fraisClients + fraisCaisses + fraisKm + fraisRetour
    const reductionSolo = !avecLivreur ? subtotal * (tarifSoloReduction / 100) : 0
    const total = subtotal - reductionSolo
    return { fraisFixe, fraisClients, fraisCaisses, fraisKm, fraisRetour, reductionSolo, total }
  })()
  const [commandes, setCommandes] = useState<Commande[]>([])
  const [trips, setTrips] = useState<Trip[]>([])
  const [livreurs, setLivreurs] = useState<Livreur[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [transporteurs, setTransporteurs] = useState<TransportCompany[]>([])
  const [showTransportForm, setShowTransportForm] = useState(false)
  const [editingTransport, setEditingTransport] = useState<TransportCompany | null>(null)
  const EMPTY_TC: TransportCompany = { id: "", nom: "", actif: true }
  const [transportForm, setTransportForm] = useState<TransportCompany>(EMPTY_TC)
  const [showTripForm, setShowTripForm] = useState(false)
  const [printOptionsTripId, setPrintOptionsTripId] = useState<string | null>(null)
  const [showLivreurForm, setShowLivreurForm] = useState(false)
  const [editingLivreur, setEditingLivreur] = useState<Livreur | null>(null)
  const [livreurForm, setLivreurForm] = useState<Omit<Livreur, "id">>(EMPTY_LIVREUR)
  // Rôle du compte app créé avec ce profil flotte — conducteur (a un compte,
  // se connecte) ou livreur (idem, simple étiquette différente).
  const [livreurAccountRole, setLivreurAccountRole] = useState<"conducteur" | "livreur">("livreur")
  // Un conducteur (roster flotte, par défaut sans accès app) n'a jamais de
  // compte ERP à créer sauf exception explicitement accordée par le back-office.
  const [createAccountForRoster, setCreateAccountForRoster] = useState(false)
  const [selectedLivreurId, setSelectedLivreurId] = useState("")     // livreur — compte ERP, obligatoire
  const [selectedConducteurId, setSelectedConducteurId] = useState("") // conducteur — profil flotte (roster), obligatoire
  const [livreurSearch, setLivreurSearch] = useState("")
  const [livreurSortMode, setLivreurSortMode] = useState<"recent" | "alpha">("alpha")
  const [vehicule, setVehicule] = useState("")
  const [selectedCmds, setSelectedCmds] = useState<string[]>([])
  const [filterZone, setFilterZone] = useState("")
  const [filterPrevendeur, setFilterPrevendeur] = useState("")
  const [filterClient, setFilterClient] = useState("")
  const [sortMode, setSortMode] = useState<"alpha" | "secteur">("alpha")
  const mapRefs = useRef<Record<string, HTMLDivElement>>({})
  const mapsLoaded = useRef<Set<string>>(new Set())

  useEffect(() => { refresh() }, [])

  // Rechargement Realtime depuis un autre appareil
  useEffect(() => {
    const handler = (e: Event) => {
      const ev = e as CustomEvent<{ table: string }>
      const relevant = ["fl_commandes", "fl_trips", "fl_bons_livraison", "all"]
      if (!ev.detail?.table || relevant.includes(ev.detail.table)) refresh()
    }
    window.addEventListener("fl_store_updated", handler)
    return () => window.removeEventListener("fl_store_updated", handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refresh = () => {
    setCommandes(store.getVisibleCommandes())
    setTrips(store.getTrips())
    setLivreurs(store.getLivreurs())
    setTransporteurs(store.getTransportCompanies())
    setUsers(store.getUsers())
  }

  // LIVREUR = celui qui a le compte ERP, embarque avec le conducteur et
  // utilise l'application. Toujours obligatoire, toujours un compte actif.
  const livreurAccountCandidates = users.filter(u => (u.role === "conducteur" || u.role === "livreur") && u.actif)
  // CONDUCTEUR = celui qui conduit le véhicule (matricule + données) — choisi
  // directement dans le roster flotte, pas dans les comptes Utilisateurs (il
  // n'a besoin d'un compte que si le back-office le lui accorde — cf. lien
  // Livreur.userId, utilisé seulement pour pré-suggérer le livreur du trip).
  const conducteurRoster = livreurs.filter(l => l.actif)
  const findRosterByUserId = (userId: string) => livreurs.find(l => l.userId === userId)

  const saveTransport = () => {
    if (!transportForm.nom.trim()) return
    const all = store.getTransportCompanies()
    if (editingTransport) {
      const idx = all.findIndex(t => t.id === editingTransport.id)
      if (idx >= 0) { all[idx] = { ...transportForm, id: editingTransport.id }; store.saveTransportCompanies(all) }
    } else {
      store.addTransportCompany({ ...transportForm, id: store.genId() })
    }
    setShowTransportForm(false)
    setEditingTransport(null)
    setTransportForm(EMPTY_TC)
    refresh()
  }

  const openNewTransport = () => { setEditingTransport(null); setTransportForm(EMPTY_TC); setShowTransportForm(true) }
  const openEditTransport = (t: TransportCompany) => { setEditingTransport(t); setTransportForm({ ...t }); setShowTransportForm(true) }
  const toggleTransportActive = (t: TransportCompany) => {
    store.updateTransportCompany(t.id, { actif: !t.actif }); refresh()
  }
  const deleteTransport = (id: string) => { store.deleteTransportCompany(id); refresh() }

  // --- TRIPS ---
  const [editingTripId, setEditingTripId] = useState<string | null>(null)
  // Toutes les commandes non encore affectees a un trip — pas besoin de stock disponible.
  // En édition, les commandes du trip lui-même doivent rester sélectionnables
  // (et pré-cochées) même si elles ont déjà basculé en "en_transit" à la
  // création du trip — sinon elles disparaissent purement et simplement de la
  // liste (aucune case à décocher pour les retirer du trip en cours d'édition).
  const editingTrip = trips.find(t => t.id === editingTripId)
  const editingTripOwnCmds = new Set(editingTrip?.commandeIds ?? [])
  const existingTripCmds = new Set(trips.filter(t => t.id !== editingTripId).flatMap(t => t.commandeIds))
  const availableCommandes = commandes.filter(c =>
    !existingTripCmds.has(c.id) &&
    (editingTripOwnCmds.has(c.id) || c.statut === "valide" || c.statut === "en_attente" || c.statut === "en_attente_approbation")
  )
  // Ancienneté d'une commande — J-1 (reçue hier pour livraison aujourd'hui)
  // est le cycle normal, PAS un retard. En retard seulement à partir de J-2.
  const joursDepuisCmd = (c: Commande) => {
    const d = new Date(c.date); d.setHours(0, 0, 0, 0)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return Math.round((today.getTime() - d.getTime()) / 86400000)
  }
  const estEnRetard = (c: Commande) => joursDepuisCmd(c) >= 2

  const filtered = availableCommandes.filter(c => {
    if (filterZone && !c.zone.toLowerCase().includes(filterZone.toLowerCase())) return false
    if (filterPrevendeur && !c.commercialNom.toLowerCase().includes(filterPrevendeur.toLowerCase())) return false
    if (filterClient && !c.clientNom.toLowerCase().includes(filterClient.toLowerCase())) return false
    return true
  }).sort((a, b) => {
    // Les commandes en retard (J-2 et +) sont classées à la fin, quel que
    // soit le tri choisi — la liste principale reste pour le flux normal.
    const rA = estEnRetard(a) ? 1 : 0, rB = estEnRetard(b) ? 1 : 0
    if (rA !== rB) return rA - rB
    if (sortMode === "secteur") {
      const s = (a.secteur || "").localeCompare(b.secteur || "", "fr")
      if (s !== 0) return s
    }
    return a.clientNom.localeCompare(b.clientNom, "fr")
  })
  const zones = [...new Set(availableCommandes.map(c => c.zone).filter(Boolean))]
  const prevendeurs = [...new Set(availableCommandes.map(c => c.commercialNom))]

  // Démarrage / fin de tournée = action exclusive du LIVREUR assigné (le
  // titulaire du compte ERP sur ce trip — rôle "livreur" ou "conducteur" si ce
  // dernier a exceptionnellement un accès). Ni le BO ni l'admin ne peuvent
  // déclencher Départ/Terminée, même avec un rôle "dispatcheur"/"admin" — un
  // autre livreur ne peut pas non plus démarrer la tournée de quelqu'un d'autre.
  const ownsTrip = (t: Trip) => (user.role === "livreur" || user.role === "conducteur") && (t.livreurId === user.id || t.livreurNom === user.name)
  const canRunTrip = (t: Trip) => ownsTrip(t)

  // Estimation coût voyage + analyse carburant (prévu vs réel) d'un trip
  const tripCout = (t: Trip) => {
    const p = store.getEmailConfig()   // tarifs livreur + prixCarburantL vivent dans EmailConfig
    const liv = livreurs.find(l => l.id === t.conducteurId) ?? livreurs.find(l => l.id === t.livreurId)
    const kmReel = t.kmTotal ?? ((t.kmArrivee ?? 0) > 0 && (t.kmDepart ?? 0) > 0 ? (t.kmArrivee! - t.kmDepart!) : 0)
    // Tant que le livreur n'a pas saisi de KM réel, on retombe sur l'estimation
    // calculée à l'affectation (kmEstime) — jamais 0/vide entre planification et départ.
    const km = kmReel > 0 ? kmReel : (t.kmEstime ?? 0)
    const isEstime = kmReel <= 0 && (t.kmEstime ?? 0) > 0
    const avecCarb = t.carburantInclus ?? liv?.carburantInclus ?? false
    const consoL100 = Number(liv?.consommationL100) || 0
    const prixL = Number(p.prixCarburantL) || 15
    const coutKm = km * (Number(p.tarifKmLivreur) || 0)
    const litresPrevu = consoL100 > 0 ? Math.round((km / 100) * consoL100 * 10) / 10 : 0
    const coutCarbPrevu = Math.round(litresPrevu * prixL)
    const litresReel = Number(t.carburantReelLitres) || 0
    const coutCarbReel = Math.round(litresReel * prixL)
    const ecartLitres = litresReel > 0 ? Math.round((litresReel - litresPrevu) * 10) / 10 : 0
    const coutEstime = Math.round(coutKm + (avecCarb ? coutCarbPrevu : 0))
    return { km, isEstime, avecCarb, consoL100, prixL, coutKm: Math.round(coutKm), litresPrevu, coutCarbPrevu, litresReel, coutCarbReel, ecartLitres, coutEstime }
  }
  const setCarbReel = (id: string, litres: number) => { store.updateTrip(id, { carburantReelLitres: litres }); refresh() }
  const toggleTripCarb = (id: string, v: boolean) => { store.updateTrip(id, { carburantInclus: v }); refresh() }

  const toggleCmd = (id: string) =>
    setSelectedCmds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])

  // Choix du conducteur (roster flotte) : auto-remplit le matricule véhicule
  // et, si ce conducteur a exceptionnellement un compte ERP lié (Livreur.userId,
  // accordé par le back-office), pré-suggère ce même compte comme livreur —
  // le dispatcher reste libre de choisir un autre livreur.
  const handleSelectConducteur = (id: string) => {
    setSelectedConducteurId(id)
    if (!id) return
    const liv = livreurs.find(l => l.id === id)
    if (liv?.matricule) setVehicule(liv.matricule)
    if (liv?.userId) {
      const linked = users.find(u => u.id === liv.userId && u.actif)
      if (linked) setSelectedLivreurId(linked.id)
    }
  }

  // Note: stock guard removed — affectation autorisee meme sans stock disponible
  // Le controleur de chargement vérifie les quantités réelles au départ

  const resetTripForm = () => {
    setShowTripForm(false)
    setEditingTripId(null)
    setSelectedLivreurId(""); setSelectedConducteurId(""); setVehicule(""); setSelectedCmds([])
  }

  // Pré-remplit le formulaire avec les données du trip — uniquement pour un
  // trip "planifié" (une fois démarré, le chargement physique a peut-être
  // déjà eu lieu, modifier l'affectation deviendrait incohérent avec le réel).
  const openEditTrip = (trip: Trip) => {
    setEditingTripId(trip.id)
    setSelectedLivreurId(trip.livreurId)
    setSelectedConducteurId(trip.conducteurId ?? "")
    setVehicule(trip.vehicule || "")
    setSelectedCmds(trip.commandeIds)
    setShowTripForm(true)
  }

  const [deletingTripId, setDeletingTripId] = useState<string | null>(null)
  const deleteTrip = (trip: Trip) => {
    if (!hasPermission(user.role, "creer_trip")) { logAction(user, "creer_trip", "denied", { type: "trip", id: trip.id }); return }
    if (trip.statut !== "planifié") return
    if (deletingTripId) return // anti double-clic
    if (!confirm(`Supprimer le trip de ${trip.livreurNom} ? Les ${trip.commandeIds.length} commande(s) affectée(s) redeviendront disponibles.`)) return
    logAction(user, "creer_trip", "success", { type: "trip", id: trip.id, label: `suppression — ${trip.livreurNom}` })
    setDeletingTripId(trip.id)
    trip.commandeIds.forEach(id => store.updateCommande(id, { statut: "valide" }))
    store.deleteTrip(trip.id)
    setDeletingTripId(null)
    if (editingTripId === trip.id) resetTripForm()
    refresh()
  }

  const [creatingTrip, setCreatingTrip] = useState(false)
  const handleCreateTrip = () => {
    // Pas de permission "modifier_trip" distincte dans la matrice — qui peut
    // créer un trip peut aussi le modifier (même granularité que le reste de
    // "Logistique & Livraison" : creer_trip/valider_trip, pas plus fin).
    const perm = "creer_trip"
    if (!hasPermission(user.role, perm)) { logAction(user, perm, "denied"); return }
    if (!selectedLivreurId || !selectedConducteurId || selectedCmds.length === 0) return
    if (creatingTrip) return // anti double-clic — jamais deux tournées/doubles affectations
    setCreatingTrip(true)
    // Livreur = compte ERP (User conducteur/livreur), obligatoire — c'est lui
    // qui utilise l'application. Conducteur = profil flotte (roster), obligatoire
    // — véhicule/matricule/capacité/conso carburant.
    const livreurAccount = users.find(u => u.id === selectedLivreurId)
    const conducteurProfile = livreurs.find(l => l.id === selectedConducteurId)
    if (!livreurAccount || !conducteurProfile) { setCreatingTrip(false); return }
    logAction(user, perm, "success", { type: "livreur", id: livreurAccount.id, label: livreurAccount.name })
    const cmds = commandes.filter(c => selectedCmds.includes(c.id))
    const itineraire = cmds
      .filter(c => c.gpsLat && c.gpsLng)
      .map((c, i) => ({ lat: c.gpsLat, lng: c.gpsLng, clientNom: c.clientNom, ordre: i + 1 }))
    // Calculs à l'affectation : km/carburant/coût estimés — snapshot pris ici,
    // avant tout trajet réel (le livreur saisira les valeurs réelles au retour).
    const kmEstime = estimateTripKm(itineraire)
    const emailCfg = store.getEmailConfig()
    const avecCarb = conducteurProfile?.carburantInclus ?? false
    const consoL100 = Number(conducteurProfile?.consommationL100) || 0
    const prixL = Number(emailCfg.prixCarburantL) || 15
    const litresEstimeAffectation = consoL100 > 0 ? Math.round((kmEstime / 100) * consoL100 * 10) / 10 : 0
    const coutKmEstime = kmEstime * (Number(emailCfg.tarifKmLivreur) || 0)
    const coutCarbEstime = avecCarb ? litresEstimeAffectation * prixL : 0
    const tripFields = {
      livreurId: livreurAccount.id,
      livreurNom: livreurAccount.name,
      conducteurId: conducteurProfile.id,
      conducteurNom: `${conducteurProfile.prenom} ${conducteurProfile.nom}`.trim(),
      vehicule: vehicule || conducteurProfile.matricule || "",
      commandeIds: selectedCmds,
      itineraire,
      kmEstime,
      litresEstimeAffectation,
      coutEstime: Math.round(coutKmEstime + coutCarbEstime),
    }

    if (editingTripId) {
      const before = trips.find(t => t.id === editingTripId)
      store.updateTrip(editingTripId, tripFields)
      // Commandes retirées du trip → redeviennent disponibles ; nouvelles → affectées.
      const beforeIds = before?.commandeIds ?? []
      beforeIds.filter(id => !selectedCmds.includes(id)).forEach(id => store.updateCommande(id, { statut: "valide" }))
      selectedCmds.filter(id => !beforeIds.includes(id)).forEach(id => store.updateCommande(id, { statut: "en_transit" }))
    } else {
      const trip: Trip = { id: store.genTripNumber(), date: store.today(), statut: "planifié", ...tripFields }
      store.addTrip(trip)
      selectedCmds.forEach(id => store.updateCommande(id, { statut: "en_transit" }))
    }
    resetTripForm()
    setCreatingTrip(false)
    refresh()
  }

  const updateTripStatus = (id: string, statut: Trip["statut"]) => {
    if (!hasPermission(user.role, "valider_trip")) { logAction(user, "valider_trip", "denied", { type: "trip", id }); return }
    logAction(user, "valider_trip", "success", { type: "trip", id, label: statut })
    store.updateTrip(id, { statut })
    if (statut === "terminé") {
      const trip = store.getTrips().find(t => t.id === id)
      if (trip) {
        // Préparations numériques validées liées à cette tournée — source de
        // vérité pour les quantités réellement picking (jamais la commande
        // d'origine si une préparation existe : zéro écart toléré entre le
        // préparé validé et le BL).
        const preps = store.getBonsPreparation().filter(p => p.tripId === id && p.statut === "valide")
        trip.commandeIds.forEach(cid => {
          const cmd = store.getCommandes().find(c => c.id === cid)
          if (cmd && cmd.statut === "en_transit") {
            store.updateCommande(cid, { statut: "livre" })
            // Le BL a normalement déjà été généré (un par client) dès la
            // validation de la préparation — ici on ne fait que le marquer
            // livré, jamais un doublon. Le repli "créer un BL" ne sert que
            // si aucune préparation numérique n'a jamais existé pour cette
            // tournée (ex. ancien flux papier sans passage par la prépa).
            const existingBL = store.getBonsLivraison().find(bl => bl.tripId === id && (bl.commandeIds?.includes(cid) ?? bl.commandeId === cid))
            if (existingBL) {
              store.updateBonLivraison(existingBL.id, { statutLivraison: "livre" })
            } else {
              const lignes = cmd.lignes.map(l => {
                let qte = l.quantite
                for (const prep of preps) {
                  const pl = prep.lignes.find(pl => pl.articleId === l.articleId)
                  const ordered = pl?.qtesParClient[cmd.clientId]
                  if (!pl || !ordered) continue
                  const ratio = pl.qteCommandee > 0 ? pl.qtePrepared / pl.qteCommandee : 1
                  qte = ordered * ratio
                  break
                }
                const prixU = l.prixVente ?? l.prixUnitaire ?? 0
                return { articleNom: l.articleNom, quantite: qte, prixUnitaire: prixU, total: qte * prixU }
              })
              const total = lignes.reduce((s, l) => s + l.total, 0)
              const tva = 0.20
              store.addBonLivraison({
                id: store.genBL(), date: store.today(), tripId: id,
                commandeId: cid, commandeIds: [cid], clientId: cmd.clientId, clientNom: cmd.clientNom, secteur: cmd.secteur, zone: cmd.zone,
                livreurNom: trip.livreurNom, prevendeurNom: cmd.commercialNom,
                lignes,
                montantTotal: total, tva, montantTTC: total * (1 + tva),
                statut: "émis", statutLivraison: "livre", valideMagasinier: false,
              })
            }
          }
        })
      }
    }
    refresh()
  }

  // Génère un BL individuel par client (déjà le cas : un fl_bons_livraison par
  // commande, jamais un BL global) + option feuille de route pour la tournée.
  const handlePrintTripBLs = (trip: Trip, withRoute: boolean) => {
    const company = store.getCompanyConfig()
    const bls = store.getBonsLivraison().filter(b => b.tripId === trip.id)
    bls.forEach(bl => printBL(bl, company))

    if (withRoute) {
      const preps = store.getBonsPreparation().filter(p => p.tripId === trip.id && p.statut === "valide")
      const cumulMap = new Map<string, { articleNom: string; unite: string; quantite: number }>()
      preps.forEach(p => p.lignes.forEach(l => {
        const cur = cumulMap.get(l.articleId)
        const qte = l.qtePrepared || l.qteCommandee
        if (cur) cur.quantite += qte
        else cumulMap.set(l.articleId, { articleNom: l.articleNom, unite: l.unite, quantite: qte })
      }))

      const allClients = store.getClients()
      const clients = trip.commandeIds.map(cid => {
        const cmd = commandes.find(c => c.id === cid)
        const stop = trip.itineraire.find(i => i.clientNom === cmd?.clientNom)
        const cl = allClients.find(c => c.id === cmd?.clientId)
        return {
          ordre: stop?.ordre ?? 999,
          clientNom: cmd?.clientNom ?? "—",
          secteur: cmd?.secteur,
          adresse: cl?.adresse,
          heureLivraison: (cmd as unknown as { heureLivraison?: string })?.heureLivraison,
          telephone: cl?.telephone,
        }
      })

      const data: FeuilleRouteData = {
        tripId: trip.id, tripNumero: trip.numero, date: trip.date,
        livreurNom: trip.livreurNom, vehicule: trip.vehicule,
        sequenceMode: trip.sequenceMode,
        articlesCumules: [...cumulMap.values()],
        clients,
      }
      printFeuilleRoute(data, company)
    }
    setPrintOptionsTripId(null)
  }

  // Retire une commande d'une tournée planifiée : repasse en "valide" (à
  // assigner) pour être réaffectée à un autre livreur/tournée. Interdit une
  // fois la tournée démarrée (le chargement physique a peut-être déjà eu
  // lieu) — le garde canRunTrip côté planifié suffit pour l'UI, mais on
  // revérifie ici pour bloquer un appel direct hors bouton.
  const [desassigningId, setDesassigningId] = useState<string | null>(null)
  const desassignerCommande = (tripId: string, cid: string) => {
    if (desassigningId) return // anti double-clic
    const trip = trips.find(t => t.id === tripId)
    if (!trip || trip.statut !== "planifié") return
    setDesassigningId(cid)
    store.updateTrip(tripId, { commandeIds: trip.commandeIds.filter(id => id !== cid), itineraire: trip.itineraire.filter(i => commandes.find(c => c.id === cid)?.clientNom !== i.clientNom) })
    store.updateCommande(cid, { statut: "valide" })
    setDesassigningId(null)
    refresh()
  }

  const loadTripMap = async (trip: Trip, el: HTMLDivElement) => {
    if (mapsLoaded.current.has(trip.id) || !trip.itineraire?.length) return
    try {
      if (!document.getElementById("leaflet-cdn-css")) {
        const link = document.createElement("link")
        link.id = "leaflet-cdn-css"
        link.rel = "stylesheet"
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        document.head.appendChild(link)
      }
      const L = (await import("leaflet")).default
      const map = L.map(el).setView([trip.itineraire[0].lat, trip.itineraire[0].lng], 11)
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OSM" }).addTo(map)
      L.polyline(trip.itineraire.map(p => [p.lat, p.lng] as [number, number]), { color: "#0891b2", weight: 3 }).addTo(map)
      trip.itineraire.forEach(p => {
        const icon = L.divIcon({
          html: `<div style="background:#0891b2;color:white;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;border:2px solid white">${p.ordre}</div>`,
          className: "", iconSize: [22, 22], iconAnchor: [11, 11],
        })
        L.marker([p.lat, p.lng], { icon }).addTo(map).bindPopup(`<b>${p.ordre}. ${p.clientNom}</b>`)
      })
      mapsLoaded.current.add(trip.id)
    } catch { /* no leaflet */ }
  }

  // --- LIVREURS ---
  const openNewLivreur = () => { setEditingLivreur(null); setLivreurForm(EMPTY_LIVREUR); setLivreurAccountRole("livreur"); setCreateAccountForRoster(false); setShowLivreurForm(true) }
  const openEditLivreur = (l: Livreur) => {
    setEditingLivreur(l)
    setLivreurForm({ type: l.type, nom: l.nom, prenom: l.prenom, telephone: l.telephone, actif: l.actif,
      cin: l.cin || "", matricule: l.matricule || "", capaciteCaisses: l.capaciteCaisses || 0, capaciteTonnage: l.capaciteTonnage || 0,
      carburantInclus: l.carburantInclus ?? false, consommationL100: l.consommationL100 ?? 0 })
    setShowLivreurForm(true)
  }

  const saveLivreur = () => {
    if (!livreurForm.nom.trim() || !livreurForm.prenom.trim()) return
    const all = store.getLivreurs()
    if (editingLivreur) {
      const idx = all.findIndex(l => l.id === editingLivreur.id)
      if (idx >= 0) { all[idx] = { ...all[idx], ...livreurForm }; store.saveLivreurs(all) }
    } else {
      // Nouveau conducteur (profil flotte — véhicule/matricule/données). Par
      // défaut PAS de compte ERP : un conducteur ne fait que conduire, il n'a
      // besoin d'un accès à l'application que si le back-office le lui
      // accorde explicitement (case "Créer aussi un compte ERP" cochée).
      const livreurId = store.genId()
      const fullName = `${livreurForm.prenom} ${livreurForm.nom}`.trim()
      const tel = (livreurForm.telephone ?? "").trim()

      if (!createAccountForRoster) {
        store.addLivreur({ ...livreurForm, id: livreurId })
        alert(`Conducteur créé (sans accès à l'application).\n\nIl pourra être choisi comme conducteur lors de la création d'un trip.`)
        setShowLivreurForm(false)
        refresh()
        return
      }

      const userId = store.genId()
      store.addLivreur({ ...livreurForm, id: livreurId, actif: false, compteStatut: "en_attente", userId })

      // ⚡ Synchronisation immédiate avec Utilisateurs & Droits : on crée le COMPTE
      // utilisateur (rôle conducteur/livreur choisi ci-dessus, accès mobile) dès
      // la création du livreur. Il apparaît tout de suite dans « Utilisateurs »
      // et « Roles & Permissions » (inactif/en attente) ; l'approbation
      // l'active sans créer de doublon.
      const newUser: User = {
        id: userId,
        name: fullName || `Livreur ${livreurId.slice(-4)}`,
        email: "",
        telephone: tel,
        phone: tel,
        password: tel || "livreur",          // mot de passe temporaire (= téléphone)
        passwordMobile: tel || "livreur",
        role: livreurAccountRole,
        accessType: "mobile",
        actif: false,                         // en attente de validation admin
        canViewLogistique: true,
        mustChangePassword: true,
      }
      try { store.saveUsers([...store.getUsers(), newUser]) } catch { /* noop */ }

      // Demande de compte ERP livreur → file "Demandes de comptes" (lue en localStorage par le BO)
      try {
        const reqs = JSON.parse(localStorage.getItem("fl_account_requests") ?? "[]")
        reqs.push({
          id: store.genId(),
          type: "livreur",
          nom: fullName,
          email: "",
          telephone: tel,
          societe: livreurForm.societe ?? "",
          message: `Demande de compte ERP livreur (${livreurForm.type}) — créée depuis Dispatch & Livreurs.`,
          statut: "en_attente",
          createdAt: new Date().toISOString(),
          _linkedLivreurId: livreurId,
          _linkedUserId: userId,
        })
        localStorage.setItem("fl_account_requests", JSON.stringify(reqs))
      } catch { /* noop */ }
      alert(`Conducteur créé et compte utilisateur ajouté (Utilisateurs & Droits).\n\nIdentifiants mobile temporaires :\n• Login : ${tel || "(téléphone)"}\n• Mot de passe : ${tel || "livreur"}\n\nLe compte est EN ATTENTE — validez-le dans « Demandes de comptes » pour l'activer.`)
    }
    setShowLivreurForm(false)
    refresh()
  }

  const toggleLivreurActive = (l: Livreur) => {
    const all = store.getLivreurs()
    const idx = all.findIndex(x => x.id === l.id)
    if (idx >= 0) { all[idx].actif = !all[idx].actif; store.saveLivreurs(all); refresh() }
  }

  const deleteLivreur = (l: Livreur) => {
    if (!window.confirm(`Supprimer définitivement le livreur « ${l.prenom} ${l.nom} » ?\n\nCette action retire aussi son compte utilisateur lié (le cas échéant).`)) return
    store.saveLivreurs(store.getLivreurs().filter(x => x.id !== l.id))
    fetch("/api/sync-write", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "fl_livreurs", deletes: [l.id] }),
    }).catch(e => console.error("[BODispatch] livreur delete sync error:", e))
    // Retire le compte utilisateur lié (via Livreur.userId, ou à défaut par
    // nom pour les anciens profils sans lien explicite) s'il existe.
    try {
      const fullName = `${l.prenom} ${l.nom}`.trim().toLowerCase()
      const isLinked = (u: User) => l.userId ? u.id === l.userId : ((u.role === "livreur" || u.role === "conducteur") && (u.name ?? "").trim().toLowerCase() === fullName)
      const linkedUser = store.getUsers().find(isLinked)
      const users = store.getUsers().filter(u => !isLinked(u))
      store.saveUsers(users)
      if (linkedUser) {
        fetch("/api/sync-write", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ table: "fl_users", deletes: [linkedUser.id] }),
        }).catch(e => console.error("[BODispatch] linked user delete sync error:", e))
      }
    } catch { /* noop */ }
    refresh()
  }

  const tripStatusColor: Record<string, string> = {
    "planifié": "bg-amber-100 text-amber-800",
    "en_cours": "bg-orange-100 text-orange-800",
    "terminé": "bg-green-100 text-green-800",
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted w-fit">
        {[
          { id: "trips" as const, label: "Trips & Dispatch", labelAr: "الرحلات" },
          { id: "livreurs" as const, label: "Livreurs", labelAr: "السائقون" },
          { id: "transporteurs" as const, label: "Transporteurs", labelAr: "شركات النقل" },
          { id: "charge" as const, label: "Charge Logistique", labelAr: "تكلفة النقل" },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === t.id ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {t.label} <span className="text-xs opacity-60 mr-1">{t.labelAr}</span>
          </button>
        ))}
      </div>

      {/* ====== TRIPS ====== */}
      {activeTab === "trips" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-foreground">Dispatch / التوزيع</h2>
              <p className="text-sm text-muted-foreground">{availableCommandes.length} commande(s) validée(s) disponible(s)</p>
            </div>
            <button onClick={() => { setEditingTripId(null); setSelectedLivreurId(""); setSelectedConducteurId(""); setVehicule(""); setSelectedCmds([]); setShowTripForm(true) }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: "oklch(0.38 0.2 260)" }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Créer un Trip
            </button>
          </div>

          {/* Trip creation / edit form */}
          {showTripForm && (
            <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-4">
              <h3 className="font-bold text-foreground">{editingTripId ? "Modifier le Trip" : "Nouveau Trip"}</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-foreground">Conducteur (véhicule) *</label>
                  <select value={selectedConducteurId} onChange={e => handleSelectConducteur(e.target.value)}
                    className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                    <option value="">-- Choisir un conducteur --</option>
                    {conducteurRoster.map(l => (
                      <option key={l.id} value={l.id}>
                        {l.prenom} {l.nom}{l.matricule ? ` — ${l.matricule}` : ""}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-muted-foreground">Celui qui conduit le véhicule (matricule + données) — liste tirée du roster Livreurs. N&apos;a besoin d&apos;un accès à l&apos;application que si le back-office le lui accorde explicitement.</p>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-foreground">Livreur (compte ERP) *</label>
                  <select value={selectedLivreurId} onChange={e => setSelectedLivreurId(e.target.value)}
                    className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                    <option value="">-- Choisir un livreur --</option>
                    {livreurAccountCandidates.map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.role === "conducteur" ? "Conducteur" : "Livreur"})</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-muted-foreground">Celui qui a le compte ERP, sort avec le conducteur et utilise l&apos;application (confirmation livraison, GPS, KM…). Toujours obligatoire.</p>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-foreground">Véhicule / matricule</label>
                <input type="text" value={vehicule} onChange={e => setVehicule(e.target.value)}
                  placeholder="Ex: A-12345 MA"
                  className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>

              {/* Info conducteur + capacite bar */}
              {selectedConducteurId && (() => {
                const liv = livreurs.find(l => l.id === selectedConducteurId)
                if (!liv) return null
                // Calculate volume already selected
                const selCmds = commandes.filter(c => selectedCmds.includes(c.id))
                const totalKgAffecte = selCmds.reduce((s, c) => s + c.lignes.reduce((ls, l) => ls + l.quantite, 0), 0)
                const totalCaisses = selCmds.length * 2 // approx 2 caisses/commande
                const capKg = liv.capaciteTonnage || 0
                const capCaisses = liv.capaciteCaisses || 0
                const pctKg = capKg > 0 ? Math.min(100, (totalKgAffecte / capKg) * 100) : 0
                const pctCaisses = capCaisses > 0 ? Math.min(100, (totalCaisses / capCaisses) * 100) : 0
                const overCapacity = capKg > 0 && totalKgAffecte > capKg
                return (
                  <div className="flex flex-col gap-3 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200">
                    <div className="flex items-center gap-3 text-xs text-blue-800">
                      <svg className="w-5 h-5 shrink-0 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        <span><strong>{liv.prenom} {liv.nom}</strong> — {liv.type === "interne" ? "Interne" : "Externe"}</span>
                        {liv.telephone && <span>Tel: {liv.telephone}</span>}
                        {liv.typeVehicule && <span>{liv.marqueVehicule} ({liv.typeVehicule})</span>}
                        {liv.matricule && <span>Matricule: <strong>{liv.matricule}</strong></span>}
                      </div>
                    </div>
                    {/* Capacite bar — tonnage */}
                    {capKg > 0 && (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between text-xs text-blue-800">
                          <span className="font-semibold">Capacite Tonnage</span>
                          <span className={`font-bold ${overCapacity ? "text-red-600" : "text-blue-700"}`}>
                            {totalKgAffecte.toFixed(1)} kg / {capKg} kg ({pctKg.toFixed(0)}%)
                          </span>
                        </div>
                        <div className="h-3 rounded-full bg-blue-100 overflow-hidden border border-blue-200">
                          <div className={`h-full rounded-full transition-all ${overCapacity ? "bg-red-500" : pctKg > 85 ? "bg-amber-500" : "bg-blue-500"}`}
                            style={{ width: `${pctKg}%` }} />
                        </div>
                        {overCapacity && (
                          <p className="text-xs text-red-600 font-semibold">Depassement de capacite (+{(totalKgAffecte - capKg).toFixed(1)} kg)</p>
                        )}
                      </div>
                    )}
                    {/* Capacite caisses */}
                    {capCaisses > 0 && (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between text-xs text-blue-800">
                          <span className="font-semibold">Capacite Caisses (estimation)</span>
                          <span className="font-bold">{totalCaisses} / {capCaisses} caisses ({pctCaisses.toFixed(0)}%)</span>
                        </div>
                        <div className="h-2.5 rounded-full bg-blue-100 overflow-hidden border border-blue-200">
                          <div className={`h-full rounded-full transition-all ${pctCaisses > 100 ? "bg-red-500" : pctCaisses > 85 ? "bg-amber-500" : "bg-cyan-500"}`}
                            style={{ width: `${Math.min(100, pctCaisses)}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Filters */}
              <div className="grid grid-cols-2 gap-3">
                <select value={filterZone} onChange={e => setFilterZone(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none">
                  <option value="">Toutes les zones</option>
                  {zones.map(z => <option key={z} value={z}>{z}</option>)}
                </select>
                <select value={filterPrevendeur} onChange={e => setFilterPrevendeur(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none">
                  <option value="">Tous les prévendeurs</option>
                  {prevendeurs.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input value={filterClient} onChange={e => setFilterClient(e.target.value)} placeholder="🔍 Rechercher un client…"
                  className="flex-1 min-w-[160px] px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none" />
                <div className="flex gap-1 p-1 rounded-xl bg-muted/50">
                  <button type="button" onClick={() => setSortMode("alpha")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold ${sortMode === "alpha" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground"}`}>
                    A → Z
                  </button>
                  <button type="button" onClick={() => setSortMode("secteur")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold ${sortMode === "secteur" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground"}`}>
                    Par secteur
                  </button>
                </div>
              </div>

              {/* Commandes list */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-foreground">Commandes validées ({filtered.length})</p>
                  {filtered.length > 0 && (
                    <button onClick={() => setSelectedCmds(prev => prev.length === filtered.length ? [] : filtered.map(c => c.id))}
                      className="text-xs text-primary hover:underline">
                      {selectedCmds.length === filtered.length ? "Désélectionner tout" : "Tout sélectionner"}
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-2 max-h-64 overflow-y-auto rounded-xl border border-border p-2">
                  {filtered.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">Aucune commande validée</p>
                  ) : filtered.map(c => {
                    const retard = estEnRetard(c)
                    const jours = joursDepuisCmd(c)
                    return (
                    <label key={c.id}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${selectedCmds.includes(c.id) ? "border-primary bg-primary/5" : retard ? "border-red-200 bg-red-50/60 hover:bg-red-50" : "border-transparent hover:bg-muted/40"}`}>
                      <input type="checkbox" checked={selectedCmds.includes(c.id)} onChange={() => toggleCmd(c.id)}
                        className="w-4 h-4 mt-0.5 rounded accent-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className={`font-semibold text-sm ${retard ? "text-red-700" : "text-foreground"}`}>{c.clientNom}</p>
                        <p className="text-xs text-muted-foreground">{c.secteur ? `${c.secteur} · ` : ""}{c.zone} · {c.commercialNom} · {c.heurelivraison}</p>
                        <p className="text-xs text-muted-foreground">{c.lignes.map(l => `${l.articleNom} ×${l.quantite}`).join(", ")}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold" style={{ color: "oklch(0.38 0.2 260)" }}>
                          {store.formatMAD(c.lignes.reduce((s, l) => s + l.quantite * l.prixVente, 0))}
                        </p>
                        {c.gpsLat && <span className="text-[10px] text-green-600 font-semibold">GPS</span>}
                        {retard && (
                          <p className="text-[10px] text-red-600 font-bold mt-0.5">⚠ {jours}j — {new Date(c.date).toLocaleDateString("fr-FR")}</p>
                        )}
                      </div>
                    </label>
                  )})}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {selectedCmds.length} commande(s) sélectionnée(s)
                </p>
                <div className="flex gap-2">
                  <button onClick={() => { resetTripForm(); setFilterZone(""); setFilterPrevendeur("") }}
                    className="px-4 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted">
                    Annuler
                  </button>
                  <button onClick={handleCreateTrip}
                    disabled={creatingTrip || !selectedLivreurId || !selectedConducteurId || selectedCmds.length === 0}
                    className="px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
                    style={{ background: "oklch(0.38 0.2 260)" }}>
                    {editingTripId ? `Enregistrer (${selectedCmds.length})` : `Créer (${selectedCmds.length})`}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Trips list */}
          {trips.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border p-12 text-center text-muted-foreground">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              <p>Aucun trip créé / لا توجد رحلات</p>
            </div>
          ) : trips.map(trip => (
            <div key={trip.id} className="bg-card rounded-2xl border border-border overflow-hidden">
              <div className="p-4 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-bold text-foreground">👤 {trip.livreurNom}</span>
                    {trip.conducteurNom && (
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold">🚚 {trip.conducteurNom}</span>
                    )}
                    {trip.vehicule && <span className="px-2 py-0.5 bg-muted rounded-lg text-xs text-muted-foreground">{trip.vehicule}</span>}
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${tripStatusColor[trip.statut] || "bg-gray-100 text-gray-800"}`}>{trip.statut}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{trip.date} · {trip.commandeIds.length} commandes</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {trip.commandeIds.map(cid => {
                      const cmd = commandes.find(c => c.id === cid)
                      return cmd ? (
                        <span key={cid} className="flex items-center gap-1 px-2 py-0.5 bg-muted rounded-lg text-xs text-foreground">
                          {cmd.clientNom}
                          {trip.statut === "planifié" && (
                            <button onClick={() => desassignerCommande(trip.id, cid)} title="Désassigner cette commande"
                              className="text-muted-foreground hover:text-red-600 leading-none">×</button>
                          )}
                        </span>
                      ) : null
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {trip.statut === "planifié" && (
                    <>
                      <button onClick={() => openEditTrip(trip)} title="Modifier ce trip"
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-border text-muted-foreground hover:bg-muted">
                        Modifier
                      </button>
                      <button onClick={() => deleteTrip(trip)} disabled={deletingTripId === trip.id} title="Supprimer ce trip"
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40">
                        Supprimer
                      </button>
                    </>
                  )}
                  {trip.statut === "planifié" && (
                    canRunTrip(trip) ? (
                      <button onClick={() => updateTripStatus(trip.id, "en_cours")}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-orange-500 hover:opacity-90">
                        Démarrer
                      </button>
                    ) : (
                      <span className="px-3 py-1.5 rounded-xl text-xs font-medium text-muted-foreground bg-muted" title="Seul le livreur assigné démarre sa tournée">
                        En attente du livreur
                      </span>
                    )
                  )}
                  {trip.statut === "en_cours" && canRunTrip(trip) && (
                    <button onClick={() => updateTripStatus(trip.id, "terminé")}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-green-600 hover:opacity-90">
                      Terminer
                    </button>
                  )}
                  {trip.statut === "terminé" && (
                    <button onClick={() => setPrintOptionsTripId(printOptionsTripId === trip.id ? null : trip.id)}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-slate-700 hover:opacity-90">
                      🖨️ Imprimer BL
                    </button>
                  )}
                </div>
              </div>

              {printOptionsTripId === trip.id && (
                <div className="border-t border-border px-4 py-3 bg-slate-50/60 flex items-center gap-3 flex-wrap">
                  <span className="text-xs font-semibold text-slate-600">
                    {store.getBonsLivraison().filter(b => b.tripId === trip.id).length} BL individuel(s) — un par client
                  </span>
                  <button onClick={() => handlePrintTripBLs(trip, false)}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-300 hover:bg-slate-100">
                    Sans feuille de route
                  </button>
                  <button onClick={() => handlePrintTripBLs(trip, true)}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-slate-700 hover:opacity-90">
                    Avec feuille de route
                  </button>
                  <button onClick={() => setPrintOptionsTripId(null)}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100">
                    Annuler
                  </button>
                </div>
              )}

              {/* Estimation coût voyage + analyse carburant (prévu vs réel) */}
              {(() => {
                const c = tripCout(trip)
                return (
                  <div className="border-t border-border px-4 py-3 bg-slate-50/60 flex flex-col gap-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="text-xs font-bold text-slate-700">
                        💰 Coût voyage {c.isEstime ? "estimé (à l'affectation)" : ""} : <span className="text-emerald-700">{c.coutEstime.toLocaleString("fr-MA")} DH</span>
                      </span>
                      <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 cursor-pointer">
                        <input type="checkbox" checked={c.avecCarb} onChange={e => toggleTripCarb(trip.id, e.target.checked)} className="w-3.5 h-3.5 rounded accent-primary" />
                        Avec carburant
                      </label>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                      <div className="rounded-lg bg-white border border-slate-200 px-2 py-1.5"><p className="text-slate-400">Km{c.isEstime ? " (estimé)" : ""}</p><p className="font-bold">{c.km || "—"}</p></div>
                      <div className="rounded-lg bg-white border border-slate-200 px-2 py-1.5"><p className="text-slate-400">Coût km</p><p className="font-bold">{c.coutKm} DH</p></div>
                      {c.avecCarb && <div className="rounded-lg bg-white border border-slate-200 px-2 py-1.5"><p className="text-slate-400">Carb. prévu</p><p className="font-bold">{c.litresPrevu} L · {c.coutCarbPrevu} DH</p></div>}
                      {c.avecCarb && (
                        <div className="rounded-lg bg-white border border-slate-200 px-2 py-1.5">
                          <p className="text-slate-400">Carb. réel (L)</p>
                          <input type="number" step="0.1" defaultValue={c.litresReel || ""} placeholder="saisir"
                            onBlur={e => { const v = Number(e.target.value); if (v !== c.litresReel) setCarbReel(trip.id, v) }}
                            className="w-full font-bold bg-transparent outline-none border-b border-slate-200 focus:border-primary" />
                        </div>
                      )}
                    </div>
                    {c.avecCarb && c.litresReel > 0 && (
                      <p className={`text-[11px] font-semibold ${c.ecartLitres > 0 ? "text-red-600" : "text-emerald-600"}`}>
                        Écart conso : {c.ecartLitres > 0 ? "+" : ""}{c.ecartLitres} L vs prévu ({c.coutCarbReel} DH réel)
                        {c.ecartLitres > 0 ? " — surconsommation à vérifier" : " — conforme/économe"}
                      </p>
                    )}
                  </div>
                )
              })()}

              {trip.itineraire && trip.itineraire.length > 0 && (
                <div className="h-44 border-t border-border"
                  ref={el => { if (el && !mapRefs.current[trip.id]) { mapRefs.current[trip.id] = el; loadTripMap(trip, el) } }} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* ====== LIVREURS ====== */}
      {activeTab === "livreurs" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-foreground">Gestion des Conducteurs / إدارة السائقين</h2>
              <p className="text-sm text-muted-foreground">{livreurs.length} conducteur(s) · {livreurs.filter(l => l.actif).length} actifs — véhicule &amp; matricule ; accès application optionnel</p>
            </div>
            <button onClick={openNewLivreur}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: "oklch(0.38 0.2 260)" }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Nouveau conducteur
            </button>
          </div>

          {/* Livreur form modal */}
          {showLivreurForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={e => e.target === e.currentTarget && setShowLivreurForm(false)}>
              <div className="bg-card rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                  <h3 className="font-bold text-foreground">{editingLivreur ? "Modifier le conducteur" : "Nouveau conducteur"}</h3>
                  <button onClick={() => setShowLivreurForm(false)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                <div className="p-6 flex flex-col gap-4">
                  {/* Type */}
                  <div className="flex gap-2">
                    {(["interne", "externe"] as const).map(t => (
                      <button key={t} onClick={() => setLivreurForm({ ...livreurForm, type: t })}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${livreurForm.type === t ? "text-white border-transparent" : "border-border text-muted-foreground hover:bg-muted"}`}
                        style={livreurForm.type === t ? { background: "oklch(0.38 0.2 260)" } : {}}>
                        {t === "interne" ? "Interne" : "Externe (sous-traitant)"}
                      </button>
                    ))}
                  </div>

                  {!editingLivreur && (
                    <div className="rounded-xl border border-border p-3 flex flex-col gap-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={createAccountForRoster}
                          onChange={e => setCreateAccountForRoster(e.target.checked)}
                          className="w-4 h-4 rounded accent-primary" />
                        <span className="text-sm text-foreground">Créer aussi un compte ERP (accès à l&apos;application)</span>
                      </label>
                      <p className="text-[11px] text-muted-foreground">Un conducteur ne conduit que le véhicule — par défaut, pas besoin d&apos;accès à l&apos;application. Ne cocher que si le back-office accorde exceptionnellement un accès (ex: ce conducteur joue aussi le rôle livreur).</p>
                      {createAccountForRoster && (
                        <div className="flex flex-col gap-1 pt-1">
                          <label className="text-xs font-semibold text-foreground">Rôle du compte créé</label>
                          <div className="flex gap-2">
                            {(["conducteur", "livreur"] as const).map(r => (
                              <button key={r} type="button" onClick={() => setLivreurAccountRole(r)}
                                className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${livreurAccountRole === r ? "text-white border-transparent" : "border-border text-muted-foreground hover:bg-muted"}`}
                                style={livreurAccountRole === r ? { background: "oklch(0.38 0.2 260)" } : {}}>
                                {r === "conducteur" ? "Conducteur" : "Livreur"}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Prénom *", key: "prenom", ph: "Hassan" },
                      { label: "Nom *", key: "nom", ph: "Alami" },
                      { label: "Téléphone", key: "telephone", ph: "0670000000" },
                      { label: livreurForm.type === "interne" ? "N° CIN" : "Matricule véhicule", key: livreurForm.type === "interne" ? "cin" : "matricule", ph: livreurForm.type === "interne" ? "AB123456" : "A-12345" },
                    ].map(f => (
                      <div key={f.key} className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-foreground">{f.label}</label>
                        <input type="text" placeholder={f.ph}
                          value={(livreurForm as Record<string, unknown>)[f.key] as string || ""}
                          onChange={e => setLivreurForm({ ...livreurForm, [f.key]: e.target.value })}
                          className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                    ))}
                  </div>

                  {livreurForm.type === "externe" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-foreground">Capacité (caisses)</label>
                        <input type="number" value={livreurForm.capaciteCaisses || 0}
                          onChange={e => setLivreurForm({ ...livreurForm, capaciteCaisses: Number(e.target.value) })}
                          className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-foreground">Capacité (kg)</label>
                        <input type="number" value={livreurForm.capaciteTonnage || 0}
                          onChange={e => setLivreurForm({ ...livreurForm, capaciteTonnage: Number(e.target.value) })}
                          className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                    </div>
                  )}

                  {/* Carburant : avec / sans + consommation pour l'estimation conso */}
                  <div className="rounded-xl border border-border p-3 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="carbInclus" checked={!!livreurForm.carburantInclus}
                        onChange={e => setLivreurForm({ ...livreurForm, carburantInclus: e.target.checked })}
                        className="w-4 h-4 rounded accent-primary" />
                      <label htmlFor="carbInclus" className="text-sm text-foreground cursor-pointer">
                        Avec carburant <span className="text-xs text-muted-foreground">(on fournit/paie le carburant → analyse conso)</span>
                      </label>
                    </div>
                    {livreurForm.carburantInclus && (
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-foreground">Consommation moyenne (L/100 km)</label>
                        <input type="number" step="0.1" value={livreurForm.consommationL100 || 0}
                          onChange={e => setLivreurForm({ ...livreurForm, consommationL100: Number(e.target.value) })}
                          className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                    )}
                  </div>

                  {/* Véhicule (matricule + marque) */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-foreground">Matricule véhicule</label>
                      <input type="text" placeholder="A-12345" value={livreurForm.matricule || ""}
                        onChange={e => setLivreurForm({ ...livreurForm, matricule: e.target.value })}
                        className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-foreground">Marque / modèle</label>
                      <input type="text" placeholder="Hyundai H100" value={livreurForm.marqueVehicule || ""}
                        onChange={e => setLivreurForm({ ...livreurForm, marqueVehicule: e.target.value })}
                        className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                  </div>

                  {/* Pièces du conducteur — photo / upload (CIN, permis, carte grise) */}
                  <div className="rounded-xl border border-border p-3 flex flex-col gap-2">
                    <p className="text-xs font-bold text-foreground">Pièces du conducteur (photo ou fichier)</p>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { key: "photoCin" as const, label: "CIN" },
                        { key: "photoPermis" as const, label: "Permis" },
                        { key: "photoCartGrise" as const, label: "Carte grise" },
                      ]).map(doc => (
                        <div key={doc.key} className="flex flex-col gap-1">
                          <label className="text-[11px] font-semibold text-muted-foreground">{doc.label}</label>
                          <label className="relative cursor-pointer rounded-lg border border-dashed border-border h-20 flex items-center justify-center overflow-hidden bg-muted/40 hover:bg-muted">
                            {(livreurForm as Record<string, unknown>)[doc.key]
                              ? <img src={(livreurForm as Record<string, unknown>)[doc.key] as string} alt={doc.label} className="w-full h-full object-cover" />
                              : <span className="text-[10px] text-muted-foreground text-center px-1">📷 Photo / Upload</span>}
                            <input type="file" accept="image/*" capture="environment" className="hidden"
                              onChange={e => {
                                const file = e.target.files?.[0]; if (!file) return
                                const reader = new FileReader()
                                reader.onload = ev => setLivreurForm(f => ({ ...f, [doc.key]: ev.target?.result as string }))
                                reader.readAsDataURL(file)
                              }} />
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Transporteur (auto-entrepreneur / société) — ICE, RC, IF, CNSS */}
                  {livreurForm.type === "externe" && (
                    <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-3 flex flex-col gap-2">
                      <p className="text-xs font-bold text-purple-800">Transporteur (auto-entrepreneur / société)</p>
                      <div className="grid grid-cols-2 gap-2">
                        <input type="text" placeholder="Société (raison sociale)" value={livreurForm.societe || ""}
                          onChange={e => setLivreurForm({ ...livreurForm, societe: e.target.value })}
                          className="col-span-2 px-3 py-2 rounded-lg border border-purple-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                        {([
                          { key: "ice" as const, label: "ICE", ph: "000000000000000" },
                          { key: "rc" as const, label: "RC", ph: "12345/Casa" },
                          { key: "ifFiscal" as const, label: "IF Fiscal", ph: "12345678" },
                          { key: "cnss" as const, label: "CNSS", ph: "N° CNSS" },
                        ]).map(f => (
                          <div key={f.key} className="flex flex-col gap-1">
                            <label className="text-[11px] font-semibold text-purple-700">{f.label}</label>
                            <input type="text" placeholder={f.ph}
                              value={(livreurForm as Record<string, unknown>)[f.key] as string || ""}
                              onChange={e => setLivreurForm({ ...livreurForm, [f.key]: e.target.value })}
                              className="px-3 py-2 rounded-lg border border-purple-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="actif" checked={livreurForm.actif}
                      onChange={e => setLivreurForm({ ...livreurForm, actif: e.target.checked })}
                      className="w-4 h-4 rounded accent-primary" />
                    <label htmlFor="actif" className="text-sm text-foreground cursor-pointer">Livreur actif</label>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button onClick={() => setShowLivreurForm(false)}
                      className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted">
                      Annuler
                    </button>
                    <button onClick={saveLivreur}
                      disabled={!livreurForm.nom || !livreurForm.prenom}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
                      style={{ background: "oklch(0.38 0.2 260)" }}>
                      Sauvegarder
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Livreurs table */}
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="flex items-center gap-2 flex-wrap">
              <input value={livreurSearch} onChange={e => setLivreurSearch(e.target.value)} placeholder="🔍 Rechercher un livreur…"
                className="flex-1 min-w-[160px] px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none" />
              <div className="flex gap-1 p-1 rounded-xl bg-muted/50">
                <button type="button" onClick={() => setLivreurSortMode("alpha")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold ${livreurSortMode === "alpha" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground"}`}>
                  A → Z
                </button>
                <button type="button" onClick={() => setLivreurSortMode("recent")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold ${livreurSortMode === "recent" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground"}`}>
                  Plus récent
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "oklch(0.14 0.03 260)", color: "oklch(0.88 0.015 245)" }}>
                    {["Type", "Nom & Prénom", "Téléphone", "Véhicule / CIN", "Capacité", "Statut", "Actions"].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const livreursFiltres = livreurs
                      .filter(l => !livreurSearch.trim() || `${l.prenom} ${l.nom}`.toLowerCase().includes(livreurSearch.trim().toLowerCase()) || (l.telephone ?? "").includes(livreurSearch.trim()))
                      .sort((a, b) => livreurSortMode === "alpha" ? `${a.prenom} ${a.nom}`.localeCompare(`${b.prenom} ${b.nom}`, "fr") : String(b.id).localeCompare(String(a.id)))
                    return livreursFiltres.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">{livreurs.length === 0 ? "Aucun livreur" : "Aucun résultat"}</td></tr>
                  ) : livreursFiltres.map((l, i) => (
                    <tr key={l.id} style={{ borderTop: "1px solid oklch(0.87 0.012 240)", background: i % 2 === 0 ? "white" : "oklch(0.975 0.003 240)" }}>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${l.type === "interne" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                          {l.type === "interne" ? "Interne" : "Externe"}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-foreground">{l.prenom} {l.nom}</td>
                      <td className="px-4 py-3 text-muted-foreground">{l.telephone}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{l.matricule || l.cin || "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {l.type === "externe" ? `${l.capaciteCaisses || 0} cs / ${l.capaciteTonnage || 0} kg` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${l.actif ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                          {l.actif ? "Actif" : "Inactif"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEditLivreur(l)}
                            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          <button onClick={() => toggleLivreurActive(l)}
                            className={`p-1.5 rounded-lg hover:bg-muted transition-colors ${l.actif ? "text-amber-500" : "text-green-600"}`}>
                            {l.actif
                              ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                              : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                          </button>
                          <button onClick={() => deleteLivreur(l)} title="Supprimer le livreur"
                            className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ====== TRANSPORTEURS ====== */}
      {activeTab === "transporteurs" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-foreground">Sociétés de Transport / شركات النقل</h2>
              <p className="text-sm text-muted-foreground">{transporteurs.length} société(s) — {transporteurs.filter(t => t.actif).length} active(s)</p>
            </div>
            <button onClick={openNewTransport}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: "oklch(0.38 0.2 260)" }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Ajouter un transporteur
            </button>
          </div>

          {/* Transport form modal */}
          {showTransportForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={e => e.target === e.currentTarget && setShowTransportForm(false)}>
              <div className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
                  <h3 className="font-bold text-foreground">🚛 {editingTransport ? "Modifier le transporteur" : "Nouveau transporteur"}</h3>
                  <button onClick={() => setShowTransportForm(false)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                <div className="p-6 flex flex-col gap-5">

                  {/* Type */}
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <input type="checkbox" id="tc_auto" checked={transportForm.isAutoEntrepreneur || false}
                      onChange={e => setTransportForm({ ...transportForm, isAutoEntrepreneur: e.target.checked })}
                      className="w-4 h-4 rounded accent-primary" />
                    <label htmlFor="tc_auto" className="text-sm font-semibold text-slate-700 cursor-pointer">
                      Auto-entrepreneur (conducteur indépendant sans société)
                    </label>
                  </div>

                  {/* Infos société / conducteur */}
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">📋 {transportForm.isAutoEntrepreneur ? "Informations conducteur" : "Informations société"}</p>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: (transportForm.isAutoEntrepreneur ? "Nom complet *" : "Raison sociale *"), key: "nom", ph: transportForm.isAutoEntrepreneur ? "Mohamed Alami" : "Transport Express Maroc" },
                        { label: "Téléphone", key: "telephone", ph: "06xxxxxxxx" },
                        { label: "Email", key: "email", ph: "contact@transport.ma" },
                        { label: "Ville", key: "ville", ph: "Casablanca" },
                        ...(!transportForm.isAutoEntrepreneur ? [
                          { label: "ICE", key: "ice", ph: "00000000000000" },
                          { label: "RC", key: "rc", ph: "12345/Casa" },
                          { label: "IF Fiscal", key: "if_fiscal", ph: "12345678" },
                          { label: "CNSS", key: "cnss", ph: "1234567" },
                        ] : [
                          { label: "CIN", key: "cnss", ph: "AB123456" },
                          { label: "RIB Bancaire", key: "ribBancaire", ph: "007 123 0000000123456789 12" },
                        ]),
                        { label: "Contact / Responsable", key: "contact", ph: "M. Hassan" },
                      ].map(f => (
                        <div key={f.key} className="flex flex-col gap-1">
                          <label className="text-xs font-semibold text-foreground">{f.label}</label>
                          <input type="text" placeholder={f.ph}
                            value={(transportForm as unknown as Record<string, string>)[f.key] || ""}
                            onChange={e => setTransportForm({ ...transportForm, [f.key]: e.target.value })}
                            className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Véhicule */}
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">🚛 Véhicule</p>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: "Type véhicule", key: "typeVehicule", ph: "Camion frigo 3.5T" },
                        { label: "Immatriculation", key: "immatriculation", ph: "12345-A-1" },
                        { label: "Capacité (kg)", key: "capaciteKg", ph: "3500", type: "number" },
                        { label: "Tarif / km (DH)", key: "tarifKm", ph: "0.45", type: "number" },
                      ].map(f => (
                        <div key={f.key} className="flex flex-col gap-1">
                          <label className="text-xs font-semibold text-foreground">{f.label}</label>
                          <input type={f.type || "text"} placeholder={f.ph}
                            value={(transportForm as unknown as Record<string, string>)[f.key] || ""}
                            onChange={e => setTransportForm({ ...transportForm, [f.key]: e.target.value })}
                            className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Documents conducteur — always shown, required for auto-entrepreneur */}
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                      📄 Documents conducteur {transportForm.isAutoEntrepreneur ? "(requis)" : "(optionnels — pour le chauffeur désigné)"}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: "📸 Photo conducteur", key: "photoConducteur", accept: "image/*", capture: "user" },
                        { label: "🪪 Scan CIN", key: "scanCin", accept: "image/*,application/pdf", capture: undefined },
                        { label: "🚗 Scan Permis", key: "scanPermis", accept: "image/*,application/pdf", capture: undefined },
                        { label: "📋 Scan Carte Grise", key: "scanCarteGrise", accept: "image/*,application/pdf", capture: undefined },
                      ].map(f => (
                        <div key={f.key} className="flex flex-col gap-1">
                          <label className="text-xs font-semibold text-foreground">{f.label}</label>
                          <div className="flex gap-1.5">
                            <input type="text" placeholder="URL du fichier…"
                              value={(transportForm as unknown as Record<string, string>)[f.key] || ""}
                              onChange={e => setTransportForm({ ...transportForm, [f.key]: e.target.value })}
                              className="flex-1 px-2 py-2 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary min-w-0" />
                            <label className="px-2 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer text-xs font-semibold text-slate-600 whitespace-nowrap transition-colors">
                              📎
                              <input type="file" accept={f.accept} {...(f.capture ? { capture: f.capture as "user"|"environment" } : {})} className="hidden"
                                onChange={async e => {
                                  const file = e.target.files?.[0]
                                  if (!file) return
                                  // Upload vers Supabase Storage (fallback base64 si offline)
                                  const folder = f.key === "scanPermis" ? "permis"
                                    : f.key === "scanCarteGrise" ? "cartes_grises"
                                    : f.key === "photoConducteur" ? "photos_livreurs"
                                    : "conducteurs"
                                  const url = await uploadToStorage(file, folder as Parameters<typeof uploadToStorage>[1])
                                  if (url) setTransportForm(prev => ({ ...prev, [f.key]: url }))
                                }} />
                            </label>
                          </div>
                          {(() => {
                            const val = (transportForm as unknown as Record<string, string>)[f.key]
                            if (!val) return null
                            const isImg = val.startsWith("data:image") || /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(val)
                            return isImg
                              ? <img src={val} alt={f.label} className="w-full h-20 object-cover rounded-lg border border-slate-200 mt-1" />
                              : <a href={val} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 underline mt-1 truncate block">{val}</a>
                          })()}
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2">Photos et scans uploadés dans Supabase Storage (bucket freshlink-media) — fallback base64 si hors-ligne</p>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-foreground">Adresse</label>
                    <input type="text" placeholder="Rue, Quartier, Ville"
                      value={transportForm.adresse || ""}
                      onChange={e => setTransportForm({ ...transportForm, adresse: e.target.value })}
                      className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-foreground">Notes</label>
                    <textarea rows={2} placeholder="Notes internes, conditions, tarifs..."
                      value={transportForm.notes || ""}
                      onChange={e => setTransportForm({ ...transportForm, notes: e.target.value })}
                      className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="tc_actif" checked={transportForm.actif}
                      onChange={e => setTransportForm({ ...transportForm, actif: e.target.checked })}
                      className="w-4 h-4 rounded accent-primary" />
                    <label htmlFor="tc_actif" className="text-sm text-foreground cursor-pointer">Transporteur actif</label>
                  </div>
                  <div className="flex gap-2 pt-2 sticky bottom-0 bg-card pb-2">
                    <button onClick={() => setShowTransportForm(false)}
                      className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted">
                      Annuler
                    </button>
                    <button onClick={saveTransport} disabled={!transportForm.nom.trim()}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
                      style={{ background: "oklch(0.38 0.2 260)" }}>
                      ✅ Sauvegarder
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Transporteurs list */}
          {transporteurs.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border p-12 text-center text-muted-foreground">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 17H5a2 2 0 01-2-2V7a2 2 0 012-2h14a2 2 0 012 2v4m-6 8a2 2 0 01-2-2v-4a2 2 0 012-2h4a2 2 0 012 2v4a2 2 0 01-2 2h-4z" />
              </svg>
              <p className="font-semibold">Aucune société de transport enregistrée</p>
              <p className="text-sm mt-1">Cliquez sur &quot;Ajouter un transporteur&quot; pour commencer.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {transporteurs.map(tc => (
                <div key={tc.id} className={`bg-card rounded-2xl border p-4 flex items-start justify-between gap-3 ${tc.actif ? "border-border" : "border-border opacity-60"}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-bold text-foreground">{tc.nom}</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${tc.actif ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                        {tc.actif ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-0.5 text-xs text-muted-foreground mt-1">
                      {tc.contact && <span>Contact : <strong>{tc.contact}</strong></span>}
                      {tc.telephone && <span>Tél : {tc.telephone}</span>}
                      {tc.email && <span>Email : {tc.email}</span>}
                      {tc.ville && <span>Ville : {tc.ville}</span>}
                      {tc.ice && <span>ICE : {tc.ice}</span>}
                      {tc.rc && <span>RC : {tc.rc}</span>}
                    </div>
                    {tc.notes && <p className="text-xs text-muted-foreground mt-2 italic">{tc.notes}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => openEditTransport(tc)}
                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button onClick={() => toggleTransportActive(tc)}
                      className={`p-1.5 rounded-lg hover:bg-muted transition-colors ${tc.actif ? "text-amber-500" : "text-green-600"}`}>
                      {tc.actif
                        ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                        : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                    </button>
                    <button onClick={() => deleteTransport(tc.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ====== CHARGE LOGISTIQUE ====== */}
      {activeTab === "charge" && (
        <div className="flex flex-col gap-5">
          <div>
            <h2 className="font-bold text-foreground">Charge Logistique / تكلفة النقل</h2>
            <p className="text-sm text-muted-foreground">Calcul manuel et detaille des frais de transport par tournee</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Left — parametres */}
            <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-4">
              <h3 className="font-bold text-sm text-foreground">Parametres de la tournee</h3>

              {/* Nb clients */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-foreground">Nombre de clients visites</label>
                <div className="flex items-center gap-3">
                  <input type="range" min={1} max={50} value={chargeForm.nbClients}
                    onChange={e => setChargeForm(p => ({ ...p, nbClients: Number(e.target.value) }))}
                    className="flex-1 accent-blue-600" />
                  <input type="number" min={1} max={100} value={chargeForm.nbClients}
                    onChange={e => setChargeForm(p => ({ ...p, nbClients: Number(e.target.value) }))}
                    className="w-16 px-2 py-1.5 rounded-lg border border-border bg-background text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </div>

              {/* Nb caisses */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-foreground">Nombre de caisses livrees</label>
                <div className="flex items-center gap-3">
                  <input type="range" min={0} max={300} step={5} value={chargeForm.nbCaisses}
                    onChange={e => setChargeForm(p => ({ ...p, nbCaisses: Number(e.target.value) }))}
                    className="flex-1 accent-blue-600" />
                  <input type="number" min={0} max={500} value={chargeForm.nbCaisses}
                    onChange={e => setChargeForm(p => ({ ...p, nbCaisses: Number(e.target.value) }))}
                    className="w-16 px-2 py-1.5 rounded-lg border border-border bg-background text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </div>

              {/* Distance */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-foreground">Distance totale (km)</label>
                <div className="flex items-center gap-3">
                  <input type="range" min={5} max={500} step={5} value={chargeForm.distanceKm}
                    onChange={e => setChargeForm(p => ({ ...p, distanceKm: Number(e.target.value) }))}
                    className="flex-1 accent-blue-600" />
                  <input type="number" min={1} value={chargeForm.distanceKm}
                    onChange={e => setChargeForm(p => ({ ...p, distanceKm: Number(e.target.value) }))}
                    className="w-20 px-2 py-1.5 rounded-lg border border-border bg-background text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-primary" />
                  <span className="text-xs text-muted-foreground">km</span>
                </div>
              </div>

              {/* Retour */}
              <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-muted">
                <div>
                  <p className="text-xs font-semibold text-foreground">Retour marchandise</p>
                  <p className="text-[10px] text-muted-foreground">Le livreur ramene des produits non livres</p>
                </div>
                <button onClick={() => setChargeForm(p => ({ ...p, hasRetour: !p.hasRetour }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${chargeForm.hasRetour ? "bg-blue-600" : "bg-muted-foreground/30"}`}>
                  <span className={`inline-block w-4 h-4 rounded-full bg-white shadow transition-transform ${chargeForm.hasRetour ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>

              {/* Solo vs avec livreur */}
              <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-muted">
                <div>
                  <p className="text-xs font-semibold text-foreground">Avec livreur dedie</p>
                  <p className="text-[10px] text-muted-foreground">Desactive = tournee solo (resp. log. seul), reduction appliquee</p>
                </div>
                <button onClick={() => setChargeForm(p => ({ ...p, avecLivreur: !p.avecLivreur }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${chargeForm.avecLivreur ? "bg-blue-600" : "bg-muted-foreground/30"}`}>
                  <span className={`inline-block w-4 h-4 rounded-full bg-white shadow transition-transform ${chargeForm.avecLivreur ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>

              {/* Tarifs configurables */}
              <details className="group">
                <summary className="cursor-pointer text-xs font-semibold text-blue-700 hover:text-blue-900 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  Configurer les tarifs de base
                </summary>
                <div className="mt-3 flex flex-col gap-2.5 pl-4">
                  {[
                    { key: "tarifBase", label: "Frais fixe tournee (DH)", step: 10 },
                    { key: "tarifParClient", label: "Frais par client (DH)", step: 1 },
                    { key: "tarifParCaisse", label: "Frais par caisse (DH)", step: 0.5 },
                    { key: "tarifKm", label: "Frais par km (DH/km)", step: 0.1 },
                    { key: "tarifRetour", label: "Supplement retour (DH)", step: 10 },
                    { key: "tarifSoloReduction", label: "Reduction solo (%)", step: 5 },
                  ].map(f => (
                    <div key={f.key} className="flex items-center justify-between gap-3">
                      <label className="text-xs text-muted-foreground">{f.label}</label>
                      <input type="number" min={0} step={f.step}
                        value={(chargeForm as unknown as Record<string, number>)[f.key]}
                        onChange={e => setChargeForm(p => ({ ...p, [f.key]: Number(e.target.value) }))}
                        className="w-20 px-2 py-1 rounded-lg border border-border bg-background text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                  ))}
                </div>
              </details>
            </div>

            {/* Right — resultat */}
            <div className="flex flex-col gap-4">
              {/* Summary card */}
              <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl p-5 text-white flex flex-col gap-3">
                <h3 className="font-bold text-base">Cout total estime</h3>
                <p className="text-4xl font-black">{chargeResult.total.toLocaleString("fr-MA", { minimumFractionDigits: 2 })} DH</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white/10 rounded-xl p-2">
                    <p className="opacity-70">Cout / client</p>
                    <p className="font-bold text-base">{chargeForm.nbClients > 0 ? (chargeResult.total / chargeForm.nbClients).toFixed(2) : "—"} DH</p>
                  </div>
                  <div className="bg-white/10 rounded-xl p-2">
                    <p className="opacity-70">Cout / caisse</p>
                    <p className="font-bold text-base">{chargeForm.nbCaisses > 0 ? (chargeResult.total / chargeForm.nbCaisses).toFixed(2) : "—"} DH</p>
                  </div>
                </div>
              </div>

              {/* Detail */}
              <div className="bg-card rounded-2xl border border-border p-4 flex flex-col gap-2.5">
                <h4 className="text-sm font-bold text-foreground">Detail du calcul</h4>
                {[
                  { label: `Frais fixe tournee`, value: chargeResult.fraisFixe, color: "text-foreground" },
                  { label: `${chargeForm.nbClients} clients × ${chargeForm.tarifParClient} DH`, value: chargeResult.fraisClients, color: "text-foreground" },
                  { label: `${chargeForm.nbCaisses} caisses × ${chargeForm.tarifParCaisse} DH`, value: chargeResult.fraisCaisses, color: "text-foreground" },
                  { label: `${chargeForm.distanceKm} km × ${chargeForm.tarifKm} DH/km`, value: chargeResult.fraisKm, color: "text-foreground" },
                  ...(chargeForm.hasRetour ? [{ label: "Supplement retour marchandise", value: chargeResult.fraisRetour, color: "text-amber-700" }] : []),
                  ...(!chargeForm.avecLivreur ? [{ label: `Reduction solo (−${chargeForm.tarifSoloReduction}%)`, value: -chargeResult.reductionSolo, color: "text-emerald-700" }] : []),
                ].map((row, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                    <span className="text-xs text-muted-foreground">{row.label}</span>
                    <span className={`text-sm font-bold ${row.color}`}>{row.value >= 0 ? "" : "−"}{Math.abs(row.value).toFixed(2)} DH</span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 mt-1 border-t-2 border-primary/20">
                  <span className="text-sm font-bold text-foreground">Total frais de livraison</span>
                  <span className="text-lg font-black text-primary">{chargeResult.total.toFixed(2)} DH</span>
                </div>
              </div>

              {/* Context info */}
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-xs text-blue-800 flex flex-col gap-1.5">
                <p className="font-bold">Logique de calcul :</p>
                <p>Frais fixe (base tournee) + (nb clients × tarif/client) + (nb caisses × tarif/caisse) + (km × tarif/km) + supplement retour − reduction solo</p>
                <p className="text-blue-600 mt-1">Ces tarifs sont indicatifs. Configurez-les en cliquant sur "Configurer les tarifs de base" ci-dessus.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
