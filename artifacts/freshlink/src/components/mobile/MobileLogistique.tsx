"use client"

import { useState, useEffect, useRef } from "react"
import {
  store,
  type Commande, type Trip, type User, type BonLivraison, type MotifRetour, type Client, type Reception, type Article, type Fournisseur, DELAI_RECOUVREMENT_LABELS
} from "@/lib/store"
import { printBL } from "@/lib/print"
import ArticleCombobox from "@/components/ui/ArticleCombobox"
import NavMenu from "@/components/ui/NavMenu"

interface Props { user: User }

type LogTab = "validation" | "trip" | "map" | "reception"

// ── tiny icon helper ─────────────────────────────────────────────────────────
function Icon({ d, className = "w-5 h-5" }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
    </svg>
  )
}

// Ouvre une URL dans un nouvel onglet (contourne le sandbox iframe)
function openNewTab(url: string) {
  const link = document.createElement("a")
  link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer"
  document.body.appendChild(link); link.click(); document.body.removeChild(link)
}

// ── Statut badge ──────────────────────────────────────────────────────────────
const STATUT_BL_COLORS: Record<string, string> = {
  livre: "bg-green-100 text-green-800",
  premier_passage: "bg-blue-100 text-blue-800",
  deuxieme_passage: "bg-orange-100 text-orange-800",
  retour: "bg-red-100 text-red-800",
}
const STATUT_BL_LABELS: Record<string, string> = {
  livre: "Livré",
  premier_passage: "1er passage",
  deuxieme_passage: "2e passage",
  retour: "Retour",
}

// ── Individual Client Delivery Card ──────────────────────────────────────────
interface DeliveryCardProps {
  commande: Commande
  motifs: MotifRetour[]
  onUpdate: (id: string, statut: BonLivraison["statutLivraison"], motif?: string, heureReelle?: string) => void
}
function DeliveryCard({ commande, motifs, onUpdate }: DeliveryCardProps) {
  const bl = store.getBonsLivraison().find(b => b.commandeId === commande.id)
  const [showMotifs, setShowMotifs] = useState(false)
  const [selectedMotif, setSelectedMotif] = useState("")
  const [showDetails, setShowDetails] = useState(false)
  const [heureReelle, setHeureReelle] = useState<string>(
    () => bl?.heureLivraisonReelle ?? new Date().toTimeString().slice(0, 5)
  )

  const currentStatut = bl?.statutLivraison ?? "premier_passage"
  const totalHT = commande.lignes.reduce((s, l) => s + l.quantite * (l.prixVente ?? l.prixUnitaire ?? 0), 0)

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold text-white text-sm"
            style={{ background: "oklch(0.45 0.18 200)" }}>
            {commande.clientNom[0]}
          </div>
          <div className="text-left">
            <p className="font-bold text-foreground text-sm">{commande.clientNom}</p>
            <p className="text-xs text-muted-foreground">{commande.secteur} — {commande.zone}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${STATUT_BL_COLORS[currentStatut] ?? "bg-gray-100 text-gray-700"}`}>
            {STATUT_BL_LABELS[currentStatut] ?? currentStatut}
          </span>
          <Icon d={showDetails ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} className="w-4 h-4 text-muted-foreground" />
        </div>
      </button>

      {/* Expanded details */}
      {showDetails && (
        <div className="border-t border-border px-4 pb-4 pt-3 flex flex-col gap-3">
          {/* Lines */}
          <div className="bg-muted/40 rounded-xl p-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Articles commandés</p>
            <div className="flex flex-col gap-1.5">
              {commande.lignes.map((l, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-foreground font-medium">
                    {l.articleNom}
                    {l.articleNomAr && <span className="block text-xs text-muted-foreground font-arabic" dir="rtl" lang="ar">{l.articleNomAr}</span>}
                  </span>
                  <span className="text-muted-foreground font-sans">{l.quantite} × {(l.prixVente ?? l.prixUnitaire ?? 0)} DH = <strong>{(l.quantite * (l.prixVente ?? l.prixUnitaire ?? 0)).toLocaleString("fr-MA")} DH</strong></span>
                </div>
              ))}
            </div>
            <div className="mt-2 pt-2 border-t border-border flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Total HT</span>
              <span className="font-bold text-foreground">{totalHT.toLocaleString("fr-MA")} DH</span>
            </div>
          </div>

          {/* Heure de livraison demandée vs réelle */}
          <div className="bg-blue-50 rounded-xl p-3 flex items-center justify-between gap-3 border border-blue-100">
            <div>
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-0.5">Heure demandée</p>
              <p className="font-bold text-blue-900 text-base">{commande.heurelivraison || "—"}</p>
            </div>
            <div className="flex flex-col gap-0.5">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Heure réelle</p>
              <input
                type="time"
                value={heureReelle}
                onChange={e => setHeureReelle(e.target.value)}
                className="px-2 py-1 rounded-lg border border-blue-200 bg-white text-sm font-bold text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>

          {/* Statut change buttons */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Statut de livraison</p>
            <div className="grid grid-cols-2 gap-2">
              {(["livre", "premier_passage", "deuxieme_passage"] as const).map(s => (
                <button
                  key={s}
                  onClick={() => { onUpdate(commande.id, s, undefined, heureReelle); setShowMotifs(false) }}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${currentStatut === s ? "border-transparent text-white" : "border-border text-muted-foreground hover:bg-muted"}`}
                  style={currentStatut === s ? { background: "oklch(0.45 0.18 200)" } : {}}
                >
                  {STATUT_BL_LABELS[s]}
                </button>
              ))}
              <button
                onClick={() => setShowMotifs(!showMotifs)}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${currentStatut === "retour" ? "border-transparent bg-red-500 text-white" : "border-red-200 text-red-600 hover:bg-red-50"}`}
              >
                Retour
              </button>
            </div>
          </div>

          {/* Motif retour picker */}
          {showMotifs && (
            <div className="bg-red-50 rounded-xl p-3 flex flex-col gap-2">
              <p className="text-xs font-semibold text-red-700">Motif du retour</p>
              <div className="flex flex-wrap gap-2">
                {motifs.filter(m => m.actif).map(m => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedMotif(m.label)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${selectedMotif === m.label ? "bg-red-500 text-white" : "bg-white border border-red-200 text-red-700 hover:bg-red-100"}`}
                  >
                    {m.label} / {m.labelAr}
                  </button>
                ))}
              </div>
              {selectedMotif && (
                <button
                  onClick={() => { onUpdate(commande.id, "retour", selectedMotif, heureReelle); setShowMotifs(false) }}
                  className="mt-1 py-2 rounded-xl bg-red-500 text-white text-xs font-bold"
                >
                  Confirmer retour: {selectedMotif}
                </button>
              )}
            </div>
          )}

          {/* BL actions */}
          {bl && (
            <div className="flex gap-2">
              <button
                onClick={() => printBL(bl, store.getCompanyConfig())}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border border-border text-muted-foreground hover:bg-muted transition-colors"
              >
                <Icon d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" className="w-3.5 h-3.5" />
                Imprimer BL
              </button>
            </div>
          )}

          {/* GPS : guidage (navigation) + voir position */}
          {commande.gpsLat && commande.gpsLng && (
            <div className="flex gap-2">
              <NavMenu lat={commande.gpsLat} lng={commande.gpsLng} className="flex-1"
                triggerClassName="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors">
                <Icon d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" className="w-4 h-4" />
                Naviguer
              </NavMenu>
              <button
                onClick={() => openNewTab(`https://maps.google.com/maps?q=${commande.gpsLat},${commande.gpsLng}`)}
                className="flex items-center gap-2 py-2 px-3 rounded-xl bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100 transition-colors"
              >
                <Icon d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z" className="w-4 h-4" />
                Voir
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function MobileLogistique({ user }: Props) {
  const [activeTab, setActiveTab] = useState<LogTab>("validation")
  const [commandes, setCommandes] = useState<Commande[]>([])
  const [trips, setTrips] = useState<Trip[]>([])
  const [motifs, setMotifs] = useState<MotifRetour[]>([])
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [deliveryMode, setDeliveryMode] = useState<"horaire" | "gps">("horaire")
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletMapRef = useRef<unknown>(null)
  // Mini-carte du circuit total — affichée directement dans l'onglet "Trip"
  // (à côté de la liste d'itinéraire texte), sans devoir passer par l'onglet
  // "Carte GPS" séparé. Instance Leaflet indépendante de celle du tab Carte.
  const tripMapRef = useRef<HTMLDivElement>(null)
  const tripLeafletRef = useRef<unknown>(null)
  const [tripMapLoaded, setTripMapLoaded] = useState(false)

  useEffect(() => { refresh() }, [])

  useEffect(() => {
    if (activeTab === "map" && !mapLoaded) loadMap()
  }, [activeTab, mapLoaded])

  useEffect(() => {
    if (activeTab === "trip" && !tripMapLoaded && activeTrip?.itineraire?.length) loadTripInlineMap()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, tripMapLoaded, activeTrip])

  const refresh = () => {
    const allTrips = store.getTrips()
    // Livreur sees ONLY their own trip — matched by name or by user.id
    const myTrip = allTrips.find(t => (t.livreurNom === user.name || t.livreurId === user.id) && t.statut === "en_cours")
      ?? allTrips.find(t => (t.livreurNom === user.name || t.livreurId === user.id) && t.statut === "planifié")
    // For logistique roles (logistique, resp_logistique, magasinier, dispatcheur) show all
    const isLogistiqueAdmin = ["logistique", "resp_logistique", "magasinier", "dispatcheur", "admin", "super_admin", "super_super_admin"].includes(user.role)
    const trip = isLogistiqueAdmin
      ? (allTrips.find(t => t.statut === "en_cours") ?? allTrips.find(t => t.statut === "planifié") ?? myTrip)
      : myTrip
    setActiveTrip(trip ?? null)
    // Charge UNIQUEMENT les commandes pertinentes pour cet utilisateur.
    const allCommandes = store.getCommandes()
    if (trip) {
      if (isLogistiqueAdmin) {
        // Admin/logistique : commandes du trip + toutes celles en attente/validées.
        setCommandes(allCommandes.filter(c => trip.commandeIds.includes(c.id) || c.statut === "en_attente" || c.statut === "valide"))
      } else {
        // LIVREUR : SEULEMENT les commandes affectées à SON trip — jamais la totalité.
        setCommandes(allCommandes.filter(c => trip.commandeIds.includes(c.id)))
      }
    } else if (isLogistiqueAdmin) {
      setCommandes(allCommandes)
    } else {
      // Livreur sans trip : rien (ses commandes apparaîtront une fois dispatchées).
      setCommandes([])
    }
    setTrips(allTrips)
    setMotifs(store.getMotifs())
  }

  const loadMap = async () => {
    if (typeof window === "undefined" || leafletMapRef.current) return
    try {
      if (!document.getElementById("leaflet-cdn-css")) {
        const link = document.createElement("link")
        link.id = "leaflet-cdn-css"
        link.rel = "stylesheet"
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        document.head.appendChild(link)
      }
      const L = (await import("leaflet")).default
      if (!mapRef.current) return
      // Default: Casablanca, Maroc — 33.5731, -7.5898
      const map = L.map(mapRef.current).setView([33.5731, -7.5898], 11)
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(map)

      const numberedIcon = (n: number, delivered: boolean) => L.divIcon({
        html: `<div style="background:${delivered ? "#16a34a" : "#0891b2"};color:#fff;width:22px;height:22px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center">${n}</div>`,
        className: "",
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      })

      // Ordonne le circuit : séquence du trip si dispo, sinon par heure de livraison.
      // ⚠️ On part de `commandes` (déjà filtré au trip du livreur), PAS de toute la base.
      const withGps = commandes.filter(c => c.gpsLat && c.gpsLng)
      const order = new Map((activeTrip?.commandeIds ?? []).map((id, i) => [id, i]))
      const ordered = [...withGps].sort((a, b) =>
        (order.has(a.id) || order.has(b.id))
          ? (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999)
          : String(a.heurelivraison ?? "").localeCompare(String(b.heurelivraison ?? ""))
      )

      const routePts: [number, number][] = []
      const allPts: [number, number][] = []
      ordered.forEach((c, i) => {
        const bl = store.getBonsLivraison().find(b => b.commandeId === c.id)
        const delivered = bl?.statutLivraison === "livre"
        allPts.push([c.gpsLat, c.gpsLng])
        if (!delivered) routePts.push([c.gpsLat, c.gpsLng])
        L.marker([c.gpsLat, c.gpsLng], { icon: numberedIcon(i + 1, delivered) })
          .addTo(map)
          .bindPopup(`<b>${i + 1}. ${c.clientNom}</b><br>${c.statut}<br>${c.heurelivraison ?? ""}`)
      })

      // Tracé du circuit (arrêts restants, dans l'ordre)
      if (routePts.length >= 2) {
        L.polyline(routePts, { color: "#0891b2", weight: 3, opacity: 0.7, dashArray: "6,8" }).addTo(map)
      }
      if (allPts.length) map.fitBounds(allPts, { padding: [30, 30] })

      leafletMapRef.current = map
      setMapLoaded(true)
    } catch { setMapLoaded(true) }
  }

  // Mini-carte du circuit total de la tournée active, affichée directement
  // dans l'onglet "Trip" (basée sur trip.itineraire — mêmes points que la
  // liste texte "Itinéraire" juste au-dessus).
  const loadTripInlineMap = async () => {
    if (typeof window === "undefined" || tripLeafletRef.current || !activeTrip?.itineraire?.length) return
    try {
      if (!document.getElementById("leaflet-cdn-css")) {
        const link = document.createElement("link")
        link.id = "leaflet-cdn-css"
        link.rel = "stylesheet"
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        document.head.appendChild(link)
      }
      const L = (await import("leaflet")).default
      if (!tripMapRef.current) return
      const pts = [...activeTrip.itineraire].sort((a, b) => a.ordre - b.ordre)
      const map = L.map(tripMapRef.current).setView([pts[0].lat, pts[0].lng], 12)
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors" }).addTo(map)

      const numberedIcon = (n: number, delivered: boolean) => L.divIcon({
        html: `<div style="background:${delivered ? "#16a34a" : "#0891b2"};color:#fff;width:22px;height:22px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center">${n}</div>`,
        className: "", iconSize: [22, 22], iconAnchor: [11, 11],
      })

      const allPts: [number, number][] = []
      pts.forEach(p => {
        const bl = bls.find(b => b.clientNom === p.clientNom)
        const delivered = bl?.statutLivraison === "livre"
        allPts.push([p.lat, p.lng])
        L.marker([p.lat, p.lng], { icon: numberedIcon(p.ordre, delivered) })
          .addTo(map)
          .bindPopup(`<b>${p.ordre}. ${p.clientNom}</b>`)
      })
      L.polyline(pts.map(p => [p.lat, p.lng] as [number, number]), { color: "#0891b2", weight: 3, opacity: 0.8 }).addTo(map)
      if (allPts.length) map.fitBounds(allPts, { padding: [24, 24] })

      tripLeafletRef.current = map
      setTripMapLoaded(true)
    } catch { setTripMapLoaded(true) }
  }

  // ── Validation tab: magasinier validates en_attente commandes ──────────────
  const validateCommande = (id: string) => {
    store.updateCommande(id, { statut: "valide" })
    refresh()
  }

  // ── Trip tab: le livreur démarre/termine sa tournée depuis le mobile ───────
  const startTrip = (trip: Trip) => {
    const saisie = window.prompt("KM départ (compteur véhicule) :", trip.kmDepart != null ? String(trip.kmDepart) : "")
    if (saisie === null) return
    const km = saisie.trim() ? Number(saisie) : trip.kmDepart
    if (saisie.trim() && (isNaN(km as number) || (km as number) < 0)) { alert("KM invalide."); return }
    store.updateTrip(trip.id, {
      statut: "en_cours",
      heureDepart: new Date().toISOString(),
      ...(km != null ? { kmDepart: km, kmDepartConfirme: true } : {}),
    })
    refresh()
  }

  const endTrip = (trip: Trip) => {
    const saisie = window.prompt("KM arrivée (compteur véhicule) :", trip.kmArrivee != null ? String(trip.kmArrivee) : "")
    if (saisie === null) return
    const km = saisie.trim() ? Number(saisie) : trip.kmArrivee
    if (saisie.trim() && (isNaN(km as number) || (km as number) < 0)) { alert("KM invalide."); return }
    const kmTotal = (km != null && trip.kmDepart != null && km >= trip.kmDepart) ? km - trip.kmDepart : trip.kmTotal
    store.updateTrip(trip.id, {
      statut: "terminé",
      heureFin: new Date().toISOString(),
      ...(km != null ? { kmArrivee: km } : {}),
      ...(kmTotal != null ? { kmTotal } : {}),
    })
    refresh()
  }

  // ── Trip tab: update BL statut + create BL if not existing ────────────────
  const handleDeliveryUpdate = (commandeId: string, statut: BonLivraison["statutLivraison"], motif?: string, heureReelle?: string) => {
    const commande = store.getCommandes().find(c => c.id === commandeId)
    if (!commande) return

    const tva = 19
    const montantTotal = commande.lignes.reduce((s, l) => s + l.quantite * (l.prixVente ?? l.prixUnitaire ?? 0), 0)
    const montantTTC = Math.round(montantTotal * (1 + tva / 100))

    // ── Auto-fill livreur from active Trip, and client from store ─────────────
    const livreurNomFinal = activeTrip
      ? activeTrip.livreurNom ?? user.name
      : user.name
    const clientRecord = store.getClients().find(cl => cl.id === commande.clientId)

    // ── Find linked BonPreparation for this commande ─────────────────────────
    const bonsPrep = store.getBonsPreparation()
    const linkedPrep = bonsPrep.find(bp =>
      bp.statut === "valide" &&
      (bp.clientIds.includes(commande.clientId) ||
       (bp.tripId && activeTrip && bp.tripId === activeTrip.id))
    )

    // ── Generate numero compatible with BOBonLivraison ───────────────────────
    const existingBLs = store.getBonsLivraison()
    const y = new Date().getFullYear()
    const blsThisYear = existingBLs.filter(b => {
      const num = (b as unknown as { numero?: string }).numero ?? b.id
      return num.includes(`BL-${y}`)
    })
    const newNumero = `BL-${y}-${String(blsThisYear.length + 1).padStart(4, "0")}`

    const existingBL = store.getBonsLivraison().find(b => b.commandeId === commandeId)
    if (existingBL) {
      store.updateBonLivraison(existingBL.id, {
        statutLivraison: statut,
        motifRetour: motif,
        statut: statut === "livre" ? "encaissé" : existingBL.statut,
        heureLivraisonReelle: heureReelle,
        livreurNom: livreurNomFinal,
      })
    } else {
      store.addBonLivraison({
        id: store.genBL(),
        date: store.today(),
        tripId: activeTrip?.id ?? "",
        commandeId,
        clientNom: commande.clientNom,
        secteur: commande.secteur,
        zone: commande.zone,
        livreurNom: livreurNomFinal,
        prevendeurNom: commande.commercialNom,
        lignes: commande.lignes.map(l => ({
          articleNom: l.articleNom,
          unite: l.unite,
          quantite: l.quantite,
          quantiteUM: l.quantiteUM,
          um: l.um,
          prixUnitaire: l.prixVente,
          total: l.quantite * l.prixVente,
        })),
        montantTotal,
        tva,
        montantTTC,
        statut: statut === "livre" ? "encaissé" : "émis",
        statutLivraison: statut,
        motifRetour: motif,
        heureLivraisonReelle: heureReelle,
        // Auto-filled from commande + client record
        ...(clientRecord ? {
          clientAdresse: clientRecord.adresse,
          clientIce: clientRecord.ice,
          clientModalitePaiement: clientRecord.modalitePaiement,
          clientCreditSolde: clientRecord.creditSolde,
          clientCreditAutorise: clientRecord.creditAutorise,
          clientDelaiRecouvrement: clientRecord.delaiRecouvrement,
        } : {}),
        // Link to preparation + trip
        ...(linkedPrep ? { prepId: linkedPrep.id } : {}),
        // BOBonLivraison-compatible fields
        numero: newNumero,
        clientId: commande.clientId,
        transporteur: "non_affecte",
        qcObligatoire: false,
        createdBy: user.id,
        updatedAt: new Date().toISOString(),
      } as BonLivraison)
    }

    // Update commande statut
    const newStatut = statut === "livre" ? "livre" : statut === "retour" ? "retour" : "en_transit"
    store.updateCommande(commandeId, { statut: newStatut as Commande["statut"] })

    // Auto-create CaisseEntry for livré orders (so cash register shows it)
    if (statut === "livre") {
      const bl2 = store.getBonsLivraison().find(b => b.commandeId === commandeId)
      if (bl2) {
        const already = store.getCaisseEntries().some(e => e.reference === bl2.id && e.categorie === "vente")
        if (!already) {
          store.addCaisseEntry({
            id: store.genId(),
            date: store.today(),
            libelle: `Livraison — ${commande.clientNom} (${user.name})`,
            type: "entree",
            categorie: "vente",
            montant: montantTotal,
            reference: bl2.id,
            createdBy: user.id,
          })
        }
      }
    }

    // If retour, add retour record
    if (statut === "retour" && motif) {
      store.addRetour({
        id: store.genId(),
        date: store.today(),
        tripId: activeTrip?.id ?? "",
        livreurNom: user.name,
        lignes: commande.lignes.map(l => ({
          commandeId,
          clientNom: commande.clientNom,
          articleId: l.articleId,
          articleNom: l.articleNom,
          quantite: l.quantite,
          motif: motif,
        })),
        statut: "en_attente",
      })
    }

    // ── Recalage GPS client à la livraison ──────────────────────────────────
    // Le livreur est physiquement chez le client au moment du "Livré" — moment
    // idéal pour corriger un point GPS approximatif/erroné. Verrouillé par
    // défaut (cf. ProcessConfig.autoriserModifGpsClientLivraison, Paramètres)
    // — le point GPS d'un client ne bouge jamais tant qu'un admin ne l'a pas
    // explicitement dévérouillé. Best-effort : jamais bloquant pour la
    // confirmation de livraison elle-même (déjà enregistrée ci-dessus).
    if (statut === "livre" && commande.clientId && typeof navigator !== "undefined" && navigator.geolocation) {
      try {
        const cfg = store.getProcessConfig()
        if (cfg.autoriserModifGpsClientLivraison) {
          navigator.geolocation.getCurrentPosition(
            pos => {
              const { latitude, longitude } = pos.coords
              const ok = window.confirm(
                `📍 Recaler le point GPS de « ${commande.clientNom} » sur votre position actuelle ?\n\nCela remplace le point GPS enregistré pour ce client (utilisé pour la navigation des prochaines livraisons).`
              )
              if (ok) store.updateClient(commande.clientId, { gpsLat: latitude, gpsLng: longitude })
            },
            () => { /* GPS indisponible/refusé — la livraison reste validée normalement */ },
            { enableHighAccuracy: true, timeout: 8000 }
          )
        }
      } catch { /* noop */ }
    }

    refresh()
  }

  // ── Derived data ──────────────────────────────────────────────────────────
  // logistique role + resp_logistique + magasinier + dispatcheur + admin/super_admin can validate
  const isLogistiqueAdmin = ["logistique", "resp_logistique", "magasinier", "dispatcheur", "admin", "super_admin", "super_super_admin"].includes(user.role)
  const pendingCommandes = isLogistiqueAdmin ? commandes.filter(c => c.statut === "en_attente" || c.statut === "valide") : []
  const tripCommandes = activeTrip
    ? commandes.filter(c => activeTrip.commandeIds.includes(c.id))
    : (isLogistiqueAdmin ? commandes.filter(c => c.statut === "valide" || c.statut === "en_transit" || c.statut === "livre") : [])

  const bls = store.getBonsLivraison()
  const tripStats = {
    total: tripCommandes.length,
    livres: tripCommandes.filter(c => c.statut === "livre").length,
    retours: tripCommandes.filter(c => c.statut === "retour").length,
    enCours: tripCommandes.filter(c => c.statut === "en_transit").length,
    totalHT: tripCommandes.reduce((s, c) => {
      const bl = bls.find(b => b.commandeId === c.id)
      return s + (bl?.montantTotal ?? 0)
    }, 0),
  }

  const STAT_COMMANDE_COLORS: Record<string, string> = {
    en_attente: "bg-yellow-100 text-yellow-800",
    valide: "bg-blue-100 text-blue-800",
    en_transit: "bg-orange-100 text-orange-800",
    livre: "bg-green-100 text-green-800",
    retour: "bg-red-100 text-red-800",
  }
  const STAT_COMMANDE_LABELS: Record<string, string> = {
    en_attente: "En attente",
    valide: "Validé",
    en_transit: "En transit",
    livre: "Livré",
    retour: "Retour",
  }

  // Onglets masqués/affichés par le back-office (Paramètres → Onglets Mobile) —
  // cf. store.ts MOBILE_TABS_REGISTRY / isMobileTabVisible.
  const LOG_TAB_IDS = ["validation", "trip", "map", "reception"] as const
  const tabVisible = (id: string) => store.isMobileTabVisible(user.role, "logistique", id)
  const visibleLogTabIds = LOG_TAB_IDS.filter(tabVisible)
  useEffect(() => {
    if (!tabVisible(activeTab) && visibleLogTabIds.length > 0) setActiveTab(visibleLogTabIds[0] as LogTab)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, user.role])

  return (
    <div className="flex flex-col">
      {/* Sub tabs */}
      <div className="flex bg-muted mx-4 mt-4 rounded-xl p-1 gap-1 overflow-x-auto no-scrollbar">
        {([
          { id: "validation", label: "Validation", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z", roles: null },
          { id: "trip",       label: "Tournée",    icon: "M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4", roles: null },
          { id: "map",        label: "Carte GPS",  icon: "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7", roles: null },
          { id: "reception",  label: "Reception",  icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4", roles: ["magasinier", "resp_logistique", "admin", "super_admin", "super_super_admin"] },
        ] as const)
          .filter(t => !t.roles || (t.roles as readonly string[]).includes(user.role))
          .filter(t => tabVisible(t.id))
          .map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as LogTab)}
            className={`flex-1 min-w-max flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium font-sans transition-all ${activeTab === t.id ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}
          >
            <Icon d={t.icon} className="w-4 h-4" />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="px-4 pb-4 pt-3 flex flex-col gap-4">
        {/* ── VALIDATION TAB ───────────────────────────────────────── */}
        {activeTab === "validation" && (
          <>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h2 className="font-bold text-foreground font-sans">Validation Commandes</h2>
                <p className="text-xs text-muted-foreground font-sans">Logistique — validation & impression BL</p>
              </div>
              <div className="flex items-center gap-2">
                {/* Print all validated BLs */}
                {(() => {
                  const blsToPrint = store.getBonsLivraison().filter(bl =>
                    pendingCommandes.some(c => c.id === bl.commandeId)
                  )
                  if (blsToPrint.length === 0) return null
                  return (
                    <button
                      onClick={() => { const cfg = store.getCompanyConfig(); blsToPrint.forEach(bl => printBL(bl, cfg)) }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-border text-muted-foreground hover:bg-muted transition-colors">
                      <Icon d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" className="w-3.5 h-3.5" />
                      Imprimer BL ({blsToPrint.length})
                    </button>
                  )
                })()}
                <span className="px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-800 text-xs font-semibold">{pendingCommandes.length} en attente</span>
              </div>
            </div>

            {pendingCommandes.length === 0 ? (
              <div className="bg-card rounded-2xl border border-border p-8 text-center">
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                  <Icon d="M5 13l4 4L19 7" className="w-6 h-6 text-green-600" />
                </div>
                <p className="font-semibold text-foreground">Tout est validé</p>
                <p className="text-sm text-muted-foreground mt-1">Aucune commande en attente</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {pendingCommandes.map(c => {
                  const clientRecord = store.getClients().find(cl => cl.id === c.clientId)
                  return (
                    <div key={c.id} className="bg-card rounded-2xl border border-border p-4 flex flex-col gap-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-bold text-foreground font-sans text-sm">{c.clientNom}</p>
                          <p className="text-xs text-muted-foreground font-sans">{c.secteur} — {c.zone}</p>
                          <p className="text-xs text-muted-foreground font-sans">Heure: {c.heurelivraison}</p>
                          {/* Credit badge — shown to livreur */}
                          {clientRecord?.creditAutorise !== undefined && (
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              {clientRecord.creditAutorise ? (
                                <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-800 font-semibold border border-green-200">
                                  Credit OK
                                </span>
                              ) : (
                                <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-semibold border border-red-200">
                                  Pas de credit
                                </span>
                              )}
                              {clientRecord.delaiRecouvrement && (
                                <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                  {DELAI_RECOUVREMENT_LABELS[clientRecord.delaiRecouvrement]}
                                </span>
                              )}
                              {clientRecord.creditSolde !== undefined && clientRecord.creditSolde > 0 && (
                                <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold border border-amber-200">
                                  Solde: {clientRecord.creditSolde.toLocaleString("fr-MA")} DH
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${STAT_COMMANDE_COLORS[c.statut] ?? "bg-gray-100"}`}>
                          {STAT_COMMANDE_LABELS[c.statut] ?? c.statut}
                        </span>
                      </div>

                      <div className="bg-muted/40 rounded-xl p-3">
                        {c.lignes.map((l, i) => (
                          <div key={i} className="flex justify-between text-xs py-0.5">
                            <span className="text-foreground">
                              {l.articleNom}
                              {l.articleNomAr && <span className="block text-[10px] text-muted-foreground font-arabic" dir="rtl" lang="ar">{l.articleNomAr}</span>}
                            </span>
                            <span className="text-muted-foreground font-medium">{l.quantite} × {l.prixVente} DH</span>
                          </div>
                        ))}
                        <div className="mt-2 pt-2 border-t border-border flex justify-between text-sm font-bold">
                          <span>Total</span>
                          <span>{c.lignes.reduce((s, l) => s + l.quantite * l.prixVente, 0).toLocaleString("fr-MA")} DH</span>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        {c.statut === "en_attente" && (
                          <button
                            onClick={() => validateCommande(c.id)}
                            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
                            style={{ background: "oklch(0.45 0.18 200)" }}
                          >
                            <Icon d="M5 13l4 4L19 7" className="w-4 h-4" />
                            Valider
                          </button>
                        )}
                        {/* Print BL if a BL exists for this commande */}
                        {(() => {
                          const bl = store.getBonsLivraison().find(b => b.commandeId === c.id)
                          if (!bl) return null
                          return (
                            <button
                              onClick={() => printBL(bl, store.getCompanyConfig())}
                              className="flex items-center gap-1.5 py-2.5 px-4 rounded-xl text-sm font-semibold border border-border text-muted-foreground hover:bg-muted transition-colors"
                            >
                              <Icon d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" className="w-4 h-4" />
                              Imprimer BL
                            </button>
                          )
                        })()}
                        {c.statut !== "en_attente" && !store.getBonsLivraison().find(b => b.commandeId === c.id) && (
                          <button
                            onClick={() => validateCommande(c.id)}
                            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
                            style={{ background: "oklch(0.45 0.18 200)" }}
                          >
                            <Icon d="M5 13l4 4L19 7" className="w-4 h-4" />
                            Re-valider
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* ── TRIP TAB ──────────────────────────────────────────────── */}
        {activeTab === "trip" && (
          <>
            {/* ── PROCHAIN CLIENT: WhatsApp / SMS button ── */}
            {(() => {
              // Find next undelivered client in itinerary order
              const sorted = [...tripCommandes].sort((a, b) => {
                if (deliveryMode === "horaire") {
                  return (a.heurelivraison ?? "99:99").localeCompare(b.heurelivraison ?? "99:99")
                }
                const itineraire = activeTrip?.itineraire ?? []
                return (itineraire.find(p => p.clientNom === a.clientNom)?.ordre ?? 999) -
                       (itineraire.find(p => p.clientNom === b.clientNom)?.ordre ?? 999)
              })
              const nextClient = sorted.find(c => {
                const bl = bls.find(b => b.commandeId === c.id)
                return !bl || (bl.statutLivraison !== "livre" && bl.statutLivraison !== "retour")
              })
              if (!nextClient) return null
              const clientRecord = store.getClients().find(cl => cl.id === nextClient.clientId)
              const phone = clientRecord?.telephone ?? ""
              const totalHT = nextClient.lignes.reduce((s, l) => s + l.quantite * (l.prixVente ?? 0), 0)
              const msgText = `Bonjour ${nextClient.clientNom},\nVotre livraison Vita Fresh est en route !\nMontant: ${totalHT.toLocaleString("fr-MA")} DH HT\nLivreur: ${user.name}\nMerci.`
              const encodedMsg = encodeURIComponent(msgText)
              const cleanPhone = phone.replace(/\D/g, "")
              return (
                <div className="rounded-2xl border-2 border-green-300 bg-green-50 p-4 flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <p className="text-xs font-bold text-green-800 uppercase tracking-wide">Prochain client</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center text-white font-black text-base shrink-0">
                      {nextClient.clientNom[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-foreground text-sm truncate">{nextClient.clientNom}</p>
                      <p className="text-xs text-muted-foreground">{nextClient.secteur} — {nextClient.zone}</p>
                      {nextClient.heurelivraison && (
                        <p className="text-xs text-blue-700 font-semibold">{nextClient.heurelivraison}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-black text-primary text-sm">{totalHT.toLocaleString("fr-MA")} DH</p>
                      <p className="text-[10px] text-muted-foreground">HT</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {/* WhatsApp */}
                    <button
                      onClick={() => {
                        if (!cleanPhone) { alert("Aucun numéro de téléphone enregistré pour ce client."); return }
                        window.open(`https://wa.me/212${cleanPhone.replace(/^0/, "")}?text=${encodedMsg}`, "_blank")
                      }}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
                      style={{ background: "#25D366" }}>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </svg>
                      WhatsApp
                    </button>
                    {/* SMS */}
                    <button
                      onClick={() => {
                        if (!cleanPhone) { alert("Aucun numéro de téléphone enregistré pour ce client."); return }
                        window.open(`sms:${cleanPhone}?body=${encodedMsg}`, "_blank")
                      }}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold border-2 border-blue-400 text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                      </svg>
                      SMS
                    </button>
                  </div>
                  {!phone && (
                    <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                      Aucun numéro dans la fiche client — enregistrez un téléphone pour activer l&apos;envoi.
                    </p>
                  )}
                </div>
              )
            })()}

            {/* Trip info card */}
            <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: "oklch(0.14 0.03 260)", color: "white" }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold opacity-60 uppercase tracking-wide">Tournée active</p>
                  {activeTrip ? (
                    <>
                      <p className="font-bold text-base mt-0.5">{activeTrip.livreurNom}</p>
                      <p className="text-xs opacity-70">{activeTrip.vehicule} — {activeTrip.date}</p>
                    </>
                  ) : (
                    <p className="font-bold text-base mt-0.5">Aucune tournée assignée</p>
                  )}
                </div>
                <div className={`px-3 py-1.5 rounded-xl text-xs font-bold ${activeTrip?.statut === "en_cours" ? "bg-green-400/20 text-green-300" : "bg-white/10 text-white/70"}`}>
                  {activeTrip?.statut === "en_cours" ? "En cours" : activeTrip?.statut === "planifié" ? "Planifié" : "–"}
                </div>
              </div>

              {/* Trip KPIs */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "Total", value: tripStats.total, color: "text-white" },
                  { label: "Livrés", value: tripStats.livres, color: "text-green-400" },
                  { label: "En cours", value: tripStats.enCours, color: "text-orange-400" },
                  { label: "Retours", value: tripStats.retours, color: "text-red-400" },
                ].map(s => (
                  <div key={s.label} className="text-center">
                    <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
                    <p className="text-[10px] opacity-60">{s.label}</p>
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-white/10 flex justify-between items-center">
                <span className="text-xs opacity-60">Total encaissé</span>
                <span className="font-bold text-sm">{tripStats.totalHT.toLocaleString("fr-MA")} DH HT</span>
              </div>

              {/* Départ / Fin de tournée — action du livreur propriétaire du trip */}
              {activeTrip && (activeTrip.livreurId === user.id || activeTrip.livreurNom === user.name) && (
                <div className="pt-2 border-t border-white/10">
                  {activeTrip.statut === "planifié" && (
                    <button
                      onClick={() => startTrip(activeTrip)}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white bg-green-500 hover:bg-green-600 transition-colors">
                      <Icon d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-4 h-4" />
                      Démarrer la tournée
                    </button>
                  )}
                  {activeTrip.statut === "en_cours" && (
                    <button
                      onClick={() => endTrip(activeTrip)}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition-colors">
                      <Icon d="M9 9h6v6H9z M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-4 h-4" />
                      Terminer la tournée
                    </button>
                  )}
                  {activeTrip.statut === "terminé" && (
                    <p className="text-center text-xs opacity-60 py-1">Tournée terminée{activeTrip.kmTotal != null ? ` — ${activeTrip.kmTotal} km` : ""}</p>
                  )}
                </div>
              )}
            </div>

            {/* Mini-carte du circuit total — vue d'ensemble immédiate, sans
                devoir passer par l'onglet "Carte GPS" séparé. */}
            {activeTrip && activeTrip.itineraire.length > 0 && (
              <div className="bg-card rounded-2xl border border-border overflow-hidden">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 pt-4">Circuit total</p>
                <div ref={tripMapRef} className="h-52 mt-2" />
              </div>
            )}

            {/* Itinéraire — ordered list */}
            {activeTrip && activeTrip.itineraire.length > 0 && (
              <div className="bg-card rounded-2xl border border-border p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Itinéraire</p>
                <div className="flex flex-col gap-2">
                  {[...activeTrip.itineraire]
                    .sort((a, b) => a.ordre - b.ordre)
                    .map((stop, i) => {
                      const c = commandes.find(c => c.clientNom === stop.clientNom)
                      const bl = bls.find(b => b.clientNom === stop.clientNom)
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                            style={{ background: bl?.statutLivraison === "livre" ? "#16a34a" : bl?.statutLivraison === "retour" ? "#dc2626" : "oklch(0.45 0.18 200)" }}>
                            {stop.ordre}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{stop.clientNom}</p>
                          </div>
                          {bl && (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold shrink-0 ${STATUT_BL_COLORS[bl.statutLivraison] ?? "bg-gray-100"}`}>
                              {STATUT_BL_LABELS[bl.statutLivraison] ?? bl.statutLivraison}
                            </span>
                          )}
                        </div>
                      )
                    })
                  }
                </div>
              </div>
            )}

            {/* Mode selector: horaire vs GPS */}
            <div className="flex gap-2">
              <button
                onClick={() => setDeliveryMode("horaire")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border transition-all ${deliveryMode === "horaire" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Mode Horaire
              </button>
              <button
                onClick={() => setDeliveryMode("gps")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border transition-all ${deliveryMode === "gps" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Circuit GPS
              </button>
            </div>

            {/* Delivery cards */}
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Clients ({tripCommandes.length}) — {deliveryMode === "horaire" ? "Ordre horaire de livraison" : "Circuit GPS optimal"}
              </p>
              {tripCommandes.length === 0 ? (
                <div className="bg-card rounded-2xl border border-border p-8 text-center">
                  <p className="font-semibold text-foreground">Aucune commande dans cette tournée</p>
                  <p className="text-sm text-muted-foreground mt-1">Les commandes validées apparaîtront ici</p>
                </div>
              ) : (
                (() => {
                  // Sort by chosen mode
                  const sorted = [...tripCommandes].sort((a, b) => {
                    if (deliveryMode === "horaire") {
                      const ha = a.heurelivraison ?? "99:99"
                      const hb = b.heurelivraison ?? "99:99"
                      return ha.localeCompare(hb)
                    }
                    // GPS mode: use trip itineraire order if available
                    const itineraire = activeTrip?.itineraire ?? []
                    const orderA = itineraire.find(p => p.clientNom === a.clientNom)?.ordre ?? 999
                    const orderB = itineraire.find(p => p.clientNom === b.clientNom)?.ordre ?? 999
                    return orderA - orderB
                  })
                  return sorted.map((c, idx) => {
                    const bl = bls.find(b => b.commandeId === c.id)
                    const done = bl?.statutLivraison === "livre" || bl?.statutLivraison === "retour"
                    return (
                      <div key={c.id} className="relative">
                        {/* Sequence badge */}
                        <div className="absolute -left-1 -top-1 z-10 w-6 h-6 rounded-full text-white text-xs font-black flex items-center justify-center shadow-sm"
                          style={{ background: done ? "#16a34a" : "oklch(0.38 0.2 260)", fontSize: "10px" }}>
                          {idx + 1}
                        </div>
                        <div className="pl-3">
                          {/* Heure + mode badge next to client name */}
                          <div className="flex items-center gap-2 px-4 pt-3 pb-1 bg-card rounded-t-2xl border-x border-t border-border">
                            {c.heurelivraison && (
                              <span className="text-xs font-bold text-blue-700 bg-blue-50 rounded-md px-2 py-0.5 border border-blue-200">
                                {c.heurelivraison}
                              </span>
                            )}
                            {deliveryMode === "gps" && activeTrip?.itineraire && (
                              (() => {
                                const pt = activeTrip.itineraire.find(p => p.clientNom === c.clientNom)
                                return pt ? (
                                  <span className="text-xs font-bold text-green-700 bg-green-50 rounded-md px-2 py-0.5 border border-green-200">
                                    GPS #{pt.ordre}
                                  </span>
                                ) : null
                              })()
                            )}
                          </div>
                          <DeliveryCard
                            commande={c}
                            motifs={motifs}
                            onUpdate={handleDeliveryUpdate}
                          />
                        </div>
                      </div>
                    )
                  })
                })()
              )}
            </div>
          </>
        )}

        {/* ── RECEPTION TAB (Magasinier) ────────────────────────────── */}
        {activeTab === "reception" && (
          <MagasinierReceptionTab user={user} />
        )}

        {/* ── MAP TAB ─────────────────────────────────────────────────── */}
        {activeTab === "map" && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-foreground font-sans">Carte GPS Livraisons</h2>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-cyan-500 inline-block" />En cours</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-600 inline-block" />Livré</span>
              </div>
            </div>
            <div
              ref={mapRef}
              className="w-full rounded-2xl overflow-hidden border border-border"
              style={{ height: 420 }}
            >
              {!mapLoaded && (
                <div className="flex items-center justify-center h-full bg-muted">
                  <div className="text-center">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Chargement de la carte...</p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// MAGASINIER RECEPTION TAB
// Réception physique des marchandises : qty reçue, prix facturé, DLC / Shelf Life
// ═════════════════════════════════════════════════════════════════════════════

interface RecepLigneForm {
  articleId: string
  articleNom: string
  unite: string
  quantiteCommandee: number
  quantiteRecue: string
  prixAchat: string
  prixFacture: string
  dlc: string         // date limite de consommation تاريخ الصلاحية
  motifReliquat: string
  // "base" = quantiteRecue saisie en unité de base (kg...), ou le libellé UM
  // de l'article (ex: "Caisse") si reçu en nombre d'UM — converti en unité
  // de base au moment d'enregistrer (cf. RECEP_EMPTY_LIGNE / qtyBaseRecue).
  uniteMode: string
}
const RECEP_EMPTY_LIGNE: RecepLigneForm = {
  articleId: "", articleNom: "", unite: "", quantiteCommandee: 0,
  quantiteRecue: "", prixAchat: "", prixFacture: "", dlc: "", motifReliquat: "", uniteMode: "base",
}
// Quantité reçue convertie en unité de BASE (kg...) — que la saisie ait été
// faite en unité de base ou en nombre d'UM (ex: 3 Caisses × 15kg = 45kg).
function qtyBaseRecue(l: RecepLigneForm, art?: Article): number {
  const raw = Number(l.quantiteRecue) || 0
  if (art?.um && art.colisageParUM && l.uniteMode === art.um) return raw * art.colisageParUM
  return raw
}

function MagasinierReceptionTab({ user }: { user: User }) {
  const [articles, setArticles] = useState<Article[]>([])
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([])
  const [receptions, setReceptions] = useState<Reception[]>([])
  const [pendingPOs, setPendingPOs] = useState(store.getPurchaseOrders().filter(po => po.statut === "envoyé"))

  // form state
  const [showForm, setShowForm] = useState(false)
  const [source, setSource] = useState<"purchase_order" | "manuel">("purchase_order")
  const [selectedPOId, setSelectedPOId] = useState("")
  const [fournisseurId, setFournisseurId] = useState("")
  const [notes, setNotes] = useState("")
  const [lignes, setLignes] = useState<RecepLigneForm[]>([{ ...RECEP_EMPTY_LIGNE }])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const reload = () => {
    setArticles(store.getArticles())
    setFournisseurs(store.getFournisseurs())
    setReceptions(store.getReceptions())
    setPendingPOs(store.getPurchaseOrders().filter(po => po.statut === "envoyé"))
  }

  // Nom arabe de l'article — les lignes PO/reception ne le stockent pas,
  // on le retrouve via l'id dans le catalogue déjà chargé.
  const nomArOf = (articleId: string) => articles.find(a => a.id === articleId)?.nomAr ?? ""

  useEffect(() => { reload() }, [])

  // Helper: compute DLC date from article shelfLifeJours
  const calcDLC = (articleId: string): string => {
    const art = articles.find(a => a.id === articleId)
    if (!art?.shelfLifeJours) return ""
    const d = new Date()
    d.setDate(d.getDate() + art.shelfLifeJours)
    return d.toISOString().split("T")[0]
  }

  // When a PO is selected, pre-fill the single article line
  const handlePOSelect = (poId: string) => {
    setSelectedPOId(poId)
    const po = pendingPOs.find(p => p.id === poId)
    if (!po) { setLignes([{ ...RECEP_EMPTY_LIGNE }]); return }
    setFournisseurId(po.fournisseurId)
    setLignes([{
      articleId: po.articleId,
      articleNom: po.articleNom,
      unite: po.articleUnite,
      quantiteCommandee: po.quantite,
      quantiteRecue: String(po.quantite),
      prixAchat: String(po.prixUnitaire),
      prixFacture: String(po.prixUnitaire),
      dlc: calcDLC(po.articleId),   // auto-fill DLC from shelf life
      motifReliquat: "",
      uniteMode: "base",
    }])
  }

  const updateLigne = (i: number, patch: Partial<RecepLigneForm>) => {
    setLignes(prev => {
      const updated = [...prev]
      updated[i] = { ...updated[i], ...patch }
      // When article changes, pre-fill from article data including DLC
      if ("articleId" in patch && patch.articleId) {
        const art = articles.find(a => a.id === patch.articleId)
        if (art) {
          updated[i].articleNom = art.nom
          updated[i].unite = art.unite
          updated[i].prixAchat = String(art.prixAchat)
          updated[i].prixFacture = String(art.prixAchat)
          updated[i].uniteMode = "base"
          // Auto-fill DLC from shelfLifeJours if defined
          if (art.shelfLifeJours) {
            const d = new Date()
            d.setDate(d.getDate() + art.shelfLifeJours)
            updated[i].dlc = d.toISOString().split("T")[0]
          }
        }
      }
      return updated
    })
  }

  const handleSave = () => {
    const filled = lignes.filter(l => l.articleId && Number(l.quantiteRecue) > 0)
    if (filled.length === 0) return
    setSaving(true)

    const reception: Reception = {
      id: store.genId(),
      date: store.today(),
      bonAchatId: "",
      purchaseOrderId: source === "purchase_order" ? selectedPOId : undefined,
      fournisseurNom: fournisseurs.find(f => f.id === fournisseurId)?.nom ?? "",
      source,
      lignes: filled.map(l => {
        const qteBase = qtyBaseRecue(l, articles.find(a => a.id === l.articleId))
        return {
          articleId: l.articleId,
          articleNom: l.articleNom,
          quantiteCommandee: l.quantiteCommandee,
          quantiteRecue: qteBase,
          quantiteFacturee: qteBase,
          prixAchat: Number(l.prixAchat) || undefined,
          prixFacture: Number(l.prixFacture) || undefined,
          ecartQte: qteBase - l.quantiteCommandee,
          ecartPrix: (Number(l.prixFacture) || 0) - (Number(l.prixAchat) || 0),
          motifReliquat: l.motifReliquat || undefined,
        }
      }),
      statut: filled.some(l => qtyBaseRecue(l, articles.find(a => a.id === l.articleId)) < l.quantiteCommandee) ? "partielle" : "validée",
      operateurId: user.id,
      notes: notes || undefined,
    }

    // Update article stock + DLC in shelf-life store
    const allArticles = store.getArticles()
    filled.forEach(l => {
      const idx = allArticles.findIndex(a => a.id === l.articleId)
      const qteBase = qtyBaseRecue(l, allArticles[idx])
      if (idx >= 0) {
        allArticles[idx] = {
          ...allArticles[idx],
          stockDisponible: allArticles[idx].stockDisponible + qteBase,
          prixAchat: Number(l.prixFacture) || allArticles[idx].prixAchat,
        }
      }
      // Save DLC entry to shelf-life store
      if (l.dlc) {
        const dlcEntries = JSON.parse(localStorage.getItem("fl_shelf_life") ?? "[]")
        dlcEntries.push({
          id: store.genId(),
          articleId: l.articleId,
          articleNom: l.articleNom,
          unite: l.unite,
          dateReception: store.today(),
          dlc: l.dlc,
          quantite: qteBase,
          fournisseurNom: fournisseurs.find(f => f.id === fournisseurId)?.nom ?? "",
          operateurNom: user.name,
        })
        localStorage.setItem("fl_shelf_life", JSON.stringify(dlcEntries))
      }
    })
    store.saveArticles(allArticles)

    // Mark PO as received
    if (source === "purchase_order" && selectedPOId) {
      store.updatePurchaseOrder(selectedPOId, { statut: "receptionné" })
    }

    store.addReception(reception)
    reload()
    setSaving(false)
    setSaved(true)
    setShowForm(false)
    setLignes([{ ...RECEP_EMPTY_LIGNE }])
    setNotes("")
    setSelectedPOId("")
    setTimeout(() => setSaved(false), 3000)
  }

  const sortedReceptions = [...receptions].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-foreground font-sans text-base">Reception Marchandises</h2>
          <p className="text-xs text-muted-foreground">تاريخ الصلاحية DLC — سجل الاستلام</p>
        </div>
        <button
          onClick={() => setShowForm(s => !s)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-600 text-white text-xs font-bold">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nouvelle reception
        </button>
      </div>

      {saved && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-green-700 text-sm font-semibold">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Reception validee — stock mis a jour
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-center">
          <p className="text-xl font-black text-slate-800">{receptions.length}</p>
          <p className="text-[10px] text-slate-500">Total receptions</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-center">
          <p className="text-xl font-black text-amber-700">{pendingPOs.length}</p>
          <p className="text-[10px] text-amber-600">PO a receptionner</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 text-center">
          <p className="text-xl font-black text-blue-700">{receptions.filter(r => r.statut === "partielle").length}</p>
          <p className="text-[10px] text-blue-600">Partielles</p>
        </div>
      </div>

      {/* PO pending alerts */}
      {pendingPOs.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-xs font-bold text-amber-800 mb-2">{pendingPOs.length} bon(s) d&apos;achat en attente de reception</p>
          <div className="flex flex-col gap-1.5">
            {pendingPOs.slice(0, 3).map(po => (
              <div key={po.id} className="flex items-center justify-between text-xs">
                <span className="font-semibold text-amber-900">
                  {po.articleNom}
                  {nomArOf(po.articleId) && <span className="block text-[10px] font-normal font-arabic" dir="rtl" lang="ar">{nomArOf(po.articleId)}</span>}
                </span>
                <span className="text-amber-700">{po.quantite} {po.articleUnite} — {po.fournisseurNom}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-4">
          <p className="text-sm font-bold text-slate-800">Saisir une reception</p>

          {/* Source selector */}
          <div className="grid grid-cols-2 gap-2">
            {(["purchase_order", "manuel"] as const).map(s => (
              <button key={s} type="button"
                onClick={() => { setSource(s); setSelectedPOId(""); setLignes([{ ...RECEP_EMPTY_LIGNE }]) }}
                className={`py-2 rounded-xl text-xs font-bold border transition-all ${source === s ? "bg-green-600 text-white border-green-600" : "bg-white text-slate-600 border-slate-200"}`}>
                {s === "purchase_order" ? "Depuis PO" : "Saisie manuelle"}
              </button>
            ))}
          </div>

          {/* PO selector */}
          {source === "purchase_order" && (
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Bon de commande *</label>
              <select value={selectedPOId} onChange={e => handlePOSelect(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
                <option value="">-- Selectionner un PO --</option>
                {pendingPOs.map(po => (
                  <option key={po.id} value={po.id}>{po.articleNom}{nomArOf(po.articleId) ? ` / ${nomArOf(po.articleId)}` : ""} — {po.quantite} {po.articleUnite} ({po.fournisseurNom})</option>
                ))}
              </select>
            </div>
          )}

          {/* Fournisseur (manual mode) */}
          {source === "manuel" && (
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Fournisseur</label>
              <select value={fournisseurId} onChange={e => setFournisseurId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
                <option value="">-- Fournisseur (optionnel) --</option>
                {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
              </select>
            </div>
          )}

          {/* Lignes articles */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-700">Articles recus</p>
              {source === "manuel" && (
                <button type="button"
                  onClick={() => setLignes(p => [...p, { ...RECEP_EMPTY_LIGNE }])}
                  className="text-xs text-green-600 font-bold flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Ajouter article
                </button>
              )}
            </div>
            {lignes.map((l, i) => (
              <div key={i} className="bg-slate-50 rounded-xl border border-slate-200 p-3 flex flex-col gap-2.5">
                {source === "manuel" ? (
                  <ArticleCombobox
                    articles={articles}
                    value={l.articleId}
                    onChange={(artId, _art) => updateLigne(i, { articleId: artId })}
                    placeholder="-- Article *"
                  />
                ) : (
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-800">
                      {l.articleNom}
                      {nomArOf(l.articleId) && <span className="block text-xs font-normal text-slate-500 font-arabic" dir="rtl" lang="ar">{nomArOf(l.articleId)}</span>}
                    </p>
                    <span className="text-xs text-slate-500">{l.quantiteCommandee} {l.unite} command.</span>
                  </div>
                )}

                {/* Réception par unité de base (kg...) ou par nombre d'UM (ex:
                    Caisse) — uniquement si l'article a une UM commerciale
                    définie. La quantité est toujours convertie en unité de
                    base à l'enregistrement (cf. qtyBaseRecue). */}
                {(() => {
                  const art = articles.find(a => a.id === l.articleId)
                  if (!art?.um || !art.colisageParUM) return null
                  const isUM = l.uniteMode === art.um
                  return (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => updateLigne(i, { uniteMode: "base" })}
                        className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold border-2 transition-colors ${!isUM ? "border-green-600 bg-green-600 text-white" : "border-slate-200 text-slate-600"}`}>
                        Quantité ({art.unite})
                      </button>
                      <button type="button" onClick={() => updateLigne(i, { uniteMode: art.um! })}
                        className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold border-2 transition-colors ${isUM ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 text-blue-600"}`}>
                        Nbr {art.um} <span className="font-normal opacity-80">(= {art.colisageParUM}{art.unite})</span>
                      </button>
                    </div>
                  )
                })()}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    {(() => {
                      const art = articles.find(a => a.id === l.articleId)
                      const isUM = !!(art?.um && art.colisageParUM && l.uniteMode === art.um)
                      const qteBase = qtyBaseRecue(l, art)
                      return (
                        <>
                          <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">
                            Qte recue * ({isUM ? art!.um : l.unite})
                          </label>
                          <input type="number" min="0" step={isUM ? "1" : "0.5"} value={l.quantiteRecue}
                            onChange={e => updateLigne(i, { quantiteRecue: e.target.value })}
                            className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-green-400"
                            placeholder="0" />
                          {isUM && Number(l.quantiteRecue) > 0 && (
                            <p className="text-[10px] text-blue-600 mt-0.5 font-semibold">= {qteBase} {l.unite}</p>
                          )}
                          {l.quantiteCommandee > 0 && qteBase < l.quantiteCommandee && qteBase > 0 && (
                            <p className="text-[10px] text-amber-600 mt-0.5">Reliquat: {(l.quantiteCommandee - qteBase).toFixed(2)} {l.unite}</p>
                          )}
                        </>
                      )
                    })()}
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">Prix facture (DH/{l.unite})</label>
                    <input type="number" min="0" step="0.01" value={l.prixFacture}
                      onChange={e => updateLigne(i, { prixFacture: e.target.value })}
                      className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-green-400"
                      placeholder="0.00" />
                  </div>
                </div>

                {/* DLC — تاريخ الصلاحية */}
                <div>
                  <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">
                    DLC / تاريخ الصلاحية (Shelf Life)
                  </label>
                  <input type="date" value={l.dlc}
                    onChange={e => updateLigne(i, { dlc: e.target.value })}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-green-400" />
                  {l.dlc && (() => {
                    const daysLeft = Math.ceil((new Date(l.dlc).getTime() - Date.now()) / 86400000)
                    return (
                      <p className={`text-[10px] mt-0.5 font-semibold ${daysLeft <= 2 ? "text-red-600" : daysLeft <= 7 ? "text-amber-600" : "text-green-600"}`}>
                        {daysLeft <= 0 ? "EXPIRE" : `${daysLeft} jours restants`}
                      </p>
                    )
                  })()}
                </div>

                {/* Motif reliquat if qty received < commanded */}
                {l.quantiteCommandee > 0 && qtyBaseRecue(l, articles.find(a => a.id === l.articleId)) < l.quantiteCommandee && (
                  <input type="text" value={l.motifReliquat}
                    onChange={e => updateLigne(i, { motifReliquat: e.target.value })}
                    placeholder="Motif reliquat (ex: manque stock fournisseur)"
                    className="w-full px-2.5 py-2 rounded-lg border border-amber-200 bg-amber-50 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400" />
                )}

                {source === "manuel" && lignes.length > 1 && (
                  <button type="button" onClick={() => setLignes(p => p.filter((_, j) => j !== i))}
                    className="text-xs text-red-500 text-right">Supprimer</button>
                )}
              </div>
            ))}
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Notes de reception (optionnel)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Observations, problemes qualite, etc."
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-green-400 resize-none" />
          </div>

          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold border border-slate-200 text-slate-600">
              Annuler
            </button>
            <button onClick={handleSave}
              disabled={saving || lignes.every(l => !l.articleId || !l.quantiteRecue)}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-green-600 text-white disabled:opacity-40 flex items-center justify-center gap-2">
              {saving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              Valider la reception
            </button>
          </div>
        </div>
      )}

      {/* History */}
      {sortedReceptions.length === 0 && !showForm ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
          <p className="text-sm text-slate-500">Aucune reception enregistree</p>
          <p className="text-xs text-slate-400 mt-1">Cliquez &quot;Nouvelle reception&quot; pour commencer</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {sortedReceptions.map(r => (
            <div key={r.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
                <div>
                  <p className="text-xs font-mono text-slate-500">{r.id}</p>
                  <p className="text-sm font-bold text-slate-800">{r.date} — {r.fournisseurNom || "Manuel"}</p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                  r.statut === "validée" ? "bg-green-100 text-green-700"
                  : r.statut === "partielle" ? "bg-amber-100 text-amber-700"
                  : "bg-slate-100 text-slate-600"
                }`}>
                  {r.statut === "validée" ? "Validee" : r.statut === "partielle" ? "Partielle" : r.statut}
                </span>
              </div>
              <div className="px-4 py-3 flex flex-col gap-1.5">
                {r.lignes.map((l, i) => {
                  const shelfLife: { dlc: string; articleId: string }[] = JSON.parse(localStorage.getItem("fl_shelf_life") ?? "[]")
                  const dlcEntry = shelfLife.filter(s => s.articleId === l.articleId && s.dlc).slice(-1)[0]
                  return (
                    <div key={i} className="flex items-start justify-between text-xs">
                      <div>
                        <p className="font-semibold text-slate-800">
                          {l.articleNom}
                          {nomArOf(l.articleId) && <span className="block text-xs font-normal text-slate-500 font-arabic" dir="rtl" lang="ar">{nomArOf(l.articleId)}</span>}
                        </p>
                        <p className="text-slate-500">Recu: <span className="font-bold text-green-700">{l.quantiteRecue}</span> / command: {l.quantiteCommandee}</p>
                        {dlcEntry?.dlc && (
                          <p className="text-[10px] text-blue-600 font-semibold">DLC: {dlcEntry.dlc}</p>
                        )}
                      </div>
                      {l.prixFacture && <span className="font-bold text-slate-700">{l.prixFacture} DH</span>}
                    </div>
                  )
                })}
                {r.notes && <p className="text-[11px] text-slate-500 italic border-t border-slate-100 pt-1.5 mt-1">{r.notes}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
