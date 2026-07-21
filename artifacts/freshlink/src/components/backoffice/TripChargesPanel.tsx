"use client"

// ════════════════════════════════════════════════════════════════════════
// Analyse Coût Trajet (remplace l'ancienne saisie manuelle des charges)
// Pour chaque trip de livraison (fl_trips) :
//   - KM théorique calculé depuis le GPS des commandes assignées (itinéraire)
//   - KM réel relevé (kmDépart → kmArrivée) + écart
//   - Carburant : réel (litres saisis) vs théorique (km × conso véhicule)
//   - Charges diverses (carburant, assurance, amortissement, divers)
//   - Coût total, coût/km, coût/caisse, coût/commande
// Valeurs pré-remplies depuis ce qui existe déjà (prix carburant = EmailConfig,
// conso = fiche livreur). Le reste est éditable dans la barre de config.
// ════════════════════════════════════════════════════════════════════════

import { useState, useMemo } from "react"
import { store, type Trip } from "@/lib/store"
import {
  Truck, MapPin, Fuel, Calendar, Hash, Package, ChevronDown, ChevronUp,
  Settings2, Route, AlertTriangle, CheckCircle2,
} from "lucide-react"

// ── Config locale (non synchronisée — clé hors tables FL) ─────────────────
interface CoutTrajetConfig {
  depotLat: number
  depotLng: number
  roadFactor: number       // distance route ≈ distance à vol d'oiseau × facteur
  consoDefautL100: number  // conso par défaut si la fiche livreur n'en a pas
  prixCarburantL: number   // DH / litre
  assuranceJour: number    // DH / trip (≈ par jour)
  amortissementJour: number
  diversJour: number
}

const CFG_KEY = "fl_cout_trajet_cfg"

function loadCfg(): CoutTrajetConfig {
  const fuel = store.getEmailConfig().prixCarburantL ?? 15
  const defaults: CoutTrajetConfig = {
    depotLat: 0, depotLng: 0, roadFactor: 1.3, consoDefautL100: 12,
    prixCarburantL: fuel, assuranceJour: 50, amortissementJour: 100, diversJour: 0,
  }
  try {
    const raw = localStorage.getItem(CFG_KEY)
    if (raw) return { ...defaults, ...JSON.parse(raw) }
  } catch { /* noop */ }
  return defaults
}

function saveCfg(c: CoutTrajetConfig) {
  try { localStorage.setItem(CFG_KEY, JSON.stringify(c)) } catch { /* noop */ }
}

// Distance à vol d'oiseau entre deux points GPS (km)
function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371
  const dLat = (bLat - aLat) * Math.PI / 180
  const dLng = (bLng - aLng) * Math.PI / 180
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

const DH = (n: number) => `${n.toLocaleString("fr-MA", { maximumFractionDigits: 0 })} DH`
const N1 = (n: number) => n.toLocaleString("fr-MA", { maximumFractionDigits: 1 })

interface TripAnalyse {
  trip: Trip
  kmTheo: number
  kmReel: number | null
  ecartKm: number | null
  conso: number
  litresTheo: number
  litresReel: number | null
  coutCarburant: number
  chargesDiverses: number
  coutTotal: number
  nbCaisses: number
  nbCommandes: number
  coutParKm: number | null
  coutParCaisse: number | null
  nbPoints: number
}

function analyse(trip: Trip, cfg: CoutTrajetConfig): TripAnalyse {
  const livreurs = store.getLivreurs()
  const liv = livreurs.find(l => l.id === trip.conducteurId)
    ?? livreurs.find(l => l.id === trip.livreurId || `${l.nom} ${l.prenom ?? ""}`.trim() === trip.livreurNom || l.nom === trip.livreurNom)
  const conso = (liv?.consommationL100 && liv.consommationL100 > 0) ? liv.consommationL100 : cfg.consoDefautL100

  // Points de l'itinéraire (commandes assignées) triés par ordre
  const pts = [...(trip.itineraire ?? [])]
    .filter(p => typeof p.lat === "number" && typeof p.lng === "number")
    .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))
  const route: { lat: number; lng: number }[] = []
  const hasDepot = cfg.depotLat !== 0 && cfg.depotLng !== 0
  if (hasDepot) route.push({ lat: cfg.depotLat, lng: cfg.depotLng })
  for (const p of pts) route.push({ lat: p.lat as number, lng: p.lng as number })
  if (hasDepot) route.push({ lat: cfg.depotLat, lng: cfg.depotLng })

  let straight = 0
  for (let i = 1; i < route.length; i++) {
    straight += haversineKm(route[i - 1].lat, route[i - 1].lng, route[i].lat, route[i].lng)
  }
  const kmTheo = straight * cfg.roadFactor

  const kmReel = (typeof trip.kmDepart === "number" && typeof trip.kmArrivee === "number" && trip.kmArrivee > trip.kmDepart)
    ? trip.kmArrivee - trip.kmDepart
    : (typeof trip.kmTotal === "number" && trip.kmTotal > 0 ? trip.kmTotal : null)
  const ecartKm = kmReel !== null ? kmReel - kmTheo : null

  const kmBase = kmReel ?? kmTheo
  const litresTheo = kmBase * conso / 100
  const litresReel = typeof trip.carburantReelLitres === "number" ? trip.carburantReelLitres : null
  const coutCarburant = (litresReel ?? litresTheo) * cfg.prixCarburantL
  const chargesDiverses = cfg.assuranceJour + cfg.amortissementJour + cfg.diversJour
  const coutTotal = coutCarburant + chargesDiverses

  const caisses = trip.nbCaissesByArticle ?? {}
  const nbCaisses = Object.values(caisses).reduce((s, c) => s + (c.gros ?? 0) + (c.demi ?? 0), 0)
  const nbCommandes = trip.commandeIds?.length ?? 0

  return {
    trip, kmTheo, kmReel, ecartKm, conso, litresTheo, litresReel,
    coutCarburant, chargesDiverses, coutTotal, nbCaisses, nbCommandes,
    coutParKm: kmReel && kmReel > 0 ? coutTotal / kmReel : null,
    coutParCaisse: nbCaisses > 0 ? coutTotal / nbCaisses : null,
    nbPoints: pts.length,
  }
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-base font-extrabold mt-0.5" style={color ? { color } : undefined}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

function TripCard({ a }: { a: TripAnalyse }) {
  const [open, setOpen] = useState(false)
  const t = a.trip
  // Surconsommation = carburant réel nettement > théorique
  const surconso = a.litresReel !== null && a.litresReel > a.litresTheo * 1.15
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={() => setOpen(o => !o)}>
        <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
          <Truck className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-foreground">{t.numero ?? t.id.slice(0, 6)}</span>
            <span className="text-xs text-muted-foreground">{t.livreurNom}</span>
            {surconso && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 flex items-center gap-0.5"><AlertTriangle className="w-2.5 h-2.5" />surconso</span>}
          </div>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{t.date}</span>
            <span className="flex items-center gap-1"><Package className="w-3 h-3" />{a.nbCommandes} cmd</span>
            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{a.nbPoints} pts</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-extrabold text-amber-600">{DH(a.coutTotal)}</p>
          {a.coutParKm !== null && <p className="text-[10px] text-muted-foreground">{N1(a.coutParKm)} DH/km</p>}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </div>

      {open && (
        <div className="px-3 pb-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="KM théorique (GPS)" value={`${N1(a.kmTheo)} km`} sub={`${a.nbPoints} points × route`} />
          <Stat label="KM réel (relevé)" value={a.kmReel !== null ? `${N1(a.kmReel)} km` : "—"}
            sub={a.kmReel === null ? "km non saisis" : undefined} />
          <Stat label="Écart KM" value={a.ecartKm !== null ? `${a.ecartKm >= 0 ? "+" : ""}${N1(a.ecartKm)} km` : "—"}
            color={a.ecartKm !== null && a.ecartKm > a.kmTheo * 0.2 ? "#dc2626" : "#16a34a"}
            sub={a.ecartKm !== null && a.ecartKm > a.kmTheo * 0.2 ? "détour important" : undefined} />
          <Stat label="Conso véhicule" value={`${N1(a.conso)} L/100`} />

          <Stat label="Carburant théorique" value={`${N1(a.litresTheo)} L`} />
          <Stat label="Carburant réel" value={a.litresReel !== null ? `${N1(a.litresReel)} L` : "—"}
            color={a.litresReel !== null && a.litresReel > a.litresTheo * 1.15 ? "#dc2626" : undefined} />
          <Stat label="Coût carburant" value={DH(a.coutCarburant)} color="#d97706" />
          <Stat label="Charges diverses" value={DH(a.chargesDiverses)} sub="assur. + amort. + divers" />

          <Stat label="Coût / km" value={a.coutParKm !== null ? `${N1(a.coutParKm)} DH` : "—"} color="#0ea5e9" />
          <Stat label="Coût / caisse" value={a.coutParCaisse !== null ? `${N1(a.coutParCaisse)} DH` : "—"} sub={`${a.nbCaisses} caisses`} />
          <Stat label="Coût / commande" value={a.nbCommandes > 0 ? `${N1(a.coutTotal / a.nbCommandes)} DH` : "—"} />
          <Stat label="Coût total trajet" value={DH(a.coutTotal)} color="#dc2626" />
        </div>
      )}
    </div>
  )
}

export default function TripChargesPanel() {
  const [cfg, setCfg] = useState<CoutTrajetConfig>(() => loadCfg())
  const [showCfg, setShowCfg] = useState(false)
  const trips = useMemo(() => store.getTrips(), [])

  const analyses = useMemo(
    () => trips.map(t => analyse(t, cfg)).sort((a, b) => b.trip.date.localeCompare(a.trip.date)),
    [trips, cfg]
  )

  const totalCout = analyses.reduce((s, a) => s + a.coutTotal, 0)
  const totalKmReel = analyses.reduce((s, a) => s + (a.kmReel ?? 0), 0)
  const coutMoyenKm = totalKmReel > 0 ? totalCout / totalKmReel : null
  const surconsoCount = analyses.filter(a => a.litresReel !== null && a.litresReel > a.litresTheo * 1.15).length

  const updateCfg = (patch: Partial<CoutTrajetConfig>) => {
    setCfg(prev => { const next = { ...prev, ...patch }; saveCfg(next); return next })
  }

  const cfgFields: { key: keyof CoutTrajetConfig; label: string; step?: number }[] = [
    { key: "prixCarburantL", label: "Prix carburant (DH/L)", step: 0.1 },
    { key: "consoDefautL100", label: "Conso défaut (L/100km)", step: 0.5 },
    { key: "roadFactor", label: "Facteur route (×)", step: 0.05 },
    { key: "assuranceJour", label: "Assurance / trip (DH)", step: 10 },
    { key: "amortissementJour", label: "Amortissement / trip (DH)", step: 10 },
    { key: "diversJour", label: "Divers / trip (DH)", step: 10 },
    { key: "depotLat", label: "Dépôt latitude", step: 0.0001 },
    { key: "depotLng", label: "Dépôt longitude", step: 0.0001 },
  ]

  return (
    <div className="flex flex-col gap-4 p-1">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <Route className="w-4 h-4 text-primary" /> Analyse Coût Trajet
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            KM théorique (GPS commandes) vs réel · carburant réel vs théorique · charges diverses
          </p>
        </div>
        <button onClick={() => setShowCfg(s => !s)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-muted text-foreground hover:bg-muted/70 transition-colors">
          <Settings2 className="w-3.5 h-3.5" /> Paramètres
        </button>
      </div>

      {/* Config */}
      {showCfg && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1">Paramètres de calcul</p>
          <p className="text-[11px] text-muted-foreground mb-3">
            Pré-remplis depuis l&apos;app (prix carburant) et la fiche livreur (conso). Dépôt GPS optionnel — sinon le calcul porte sur le trajet entre clients.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {cfgFields.map(f => (
              <div key={f.key} className="flex flex-col gap-1">
                <label className="text-[11px] text-muted-foreground">{f.label}</label>
                <input type="number" step={f.step ?? 1} value={cfg[f.key]}
                  onChange={e => updateCfg({ [f.key]: Number(e.target.value) } as Partial<CoutTrajetConfig>)}
                  className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats globales */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Trips analysés" value={String(analyses.length)} color="#0ea5e9" />
        <Stat label="Coût total trajets" value={DH(totalCout)} color="#d97706" />
        <Stat label="Coût moyen / km" value={coutMoyenKm !== null ? `${N1(coutMoyenKm)} DH` : "—"} sub={`${N1(totalKmReel)} km réels`} />
        <Stat label="Surconsommation" value={String(surconsoCount)} color={surconsoCount > 0 ? "#dc2626" : "#16a34a"} sub="carburant réel > +15%" />
      </div>

      {/* Liste trips */}
      <div className="flex flex-col gap-2">
        {analyses.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center">
            <Truck className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-30" />
            <p className="text-sm text-muted-foreground font-semibold">Aucun trip à analyser</p>
            <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Les trips planifiés en logistique apparaissent ici automatiquement.
            </p>
          </div>
        ) : analyses.map(a => <TripCard key={a.trip.id} a={a} />)}
      </div>
    </div>
  )
}
