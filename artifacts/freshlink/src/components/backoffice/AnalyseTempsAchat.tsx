"use client"

// ════════════════════════════════════════════════════════════════════════
// Analyse Temps Achat
// Estime le temps nécessaire pour une tournée d'achat selon :
//   - le trajet entre les points GPS des fournisseurs (marchés / souks)
//   - le tonnage à acheter (temps de chargement proportionnel)
//   - un temps fixe par arrêt (négociation, paperasse, pesée)
// Le GPS fournisseur = premier point d'itinéraire renseigné.
// ════════════════════════════════════════════════════════════════════════

import { useState, useMemo } from "react"
import { store, type Fournisseur } from "@/lib/store"
import { Clock, MapPin, Truck, Settings2, Route, Weight, CheckSquare, Square } from "lucide-react"

interface Cfg {
  depotLat: number
  depotLng: number
  vitesseKmh: number     // vitesse moyenne tournée
  roadFactor: number
  minParTonne: number    // minutes de chargement par tonne
  minParStop: number     // minutes fixes par fournisseur (négo, pesée, paperasse)
}

const CFG_KEY = "fl_temps_achat_cfg"
const DEFAULT_CFG: Cfg = { depotLat: 0, depotLng: 0, vitesseKmh: 40, roadFactor: 1.3, minParTonne: 20, minParStop: 20 }

function loadCfg(): Cfg {
  try { const r = localStorage.getItem(CFG_KEY); if (r) return { ...DEFAULT_CFG, ...JSON.parse(r) } } catch { /* noop */ }
  return DEFAULT_CFG
}
function saveCfg(c: Cfg) { try { localStorage.setItem(CFG_KEY, JSON.stringify(c)) } catch { /* noop */ } }

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371
  const dLat = (bLat - aLat) * Math.PI / 180
  const dLng = (bLng - aLng) * Math.PI / 180
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

function gpsOf(f: Fournisseur): { lat: number; lng: number } | null {
  const p = (f.itineraires ?? []).find(i => typeof i.lat === "number" && typeof i.lng === "number")
  return p ? { lat: p.lat as number, lng: p.lng as number } : null
}

const fmtH = (hours: number) => {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`
}
const N1 = (n: number) => n.toLocaleString("fr-MA", { maximumFractionDigits: 1 })

export default function AnalyseTempsAchat() {
  const [cfg, setCfg] = useState<Cfg>(() => loadCfg())
  const [showCfg, setShowCfg] = useState(false)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [tonnage, setTonnage] = useState<Record<string, string>>({}) // kg par fournisseur

  const fournisseurs = useMemo(() => store.getFournisseurs().filter(f => gpsOf(f)), [])

  const updateCfg = (patch: Partial<Cfg>) => setCfg(p => { const n = { ...p, ...patch }; saveCfg(n); return n })
  const toggle = (id: string) => setSelected(s => ({ ...s, [id]: !s[id] }))

  const result = useMemo(() => {
    const picked = fournisseurs.filter(f => selected[f.id])
    if (picked.length === 0) return null
    const hasDepot = cfg.depotLat !== 0 && cfg.depotLng !== 0
    const route: { lat: number; lng: number }[] = []
    if (hasDepot) route.push({ lat: cfg.depotLat, lng: cfg.depotLng })
    for (const f of picked) { const g = gpsOf(f)!; route.push(g) }
    if (hasDepot) route.push({ lat: cfg.depotLat, lng: cfg.depotLng })

    let straight = 0
    for (let i = 1; i < route.length; i++) straight += haversineKm(route[i - 1].lat, route[i - 1].lng, route[i].lat, route[i].lng)
    const km = straight * cfg.roadFactor
    const travelH = cfg.vitesseKmh > 0 ? km / cfg.vitesseKmh : 0

    const totalKg = picked.reduce((s, f) => s + (Number(tonnage[f.id]) || 0), 0)
    const loadingH = (totalKg / 1000) * cfg.minParTonne / 60
    const stopH = picked.length * cfg.minParStop / 60
    const totalH = travelH + loadingH + stopH

    return { picked, km, travelH, loadingH, stopH, totalH, totalKg, hasDepot }
  }, [fournisseurs, selected, tonnage, cfg])

  const cfgFields: { key: keyof Cfg; label: string; step?: number }[] = [
    { key: "vitesseKmh", label: "Vitesse moyenne (km/h)", step: 5 },
    { key: "roadFactor", label: "Facteur route (×)", step: 0.05 },
    { key: "minParTonne", label: "Chargement (min/tonne)", step: 5 },
    { key: "minParStop", label: "Temps fixe / arrêt (min)", step: 5 },
    { key: "depotLat", label: "Dépôt latitude", step: 0.0001 },
    { key: "depotLng", label: "Dépôt longitude", step: 0.0001 },
  ]

  return (
    <div className="flex flex-col gap-4 p-1">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" /> Analyse Temps Achat
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Estime la durée d&apos;une tournée d&apos;achat selon le trajet GPS des fournisseurs et le tonnage à charger.
          </p>
        </div>
        <button onClick={() => setShowCfg(s => !s)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-muted text-foreground hover:bg-muted/70 transition-colors">
          <Settings2 className="w-3.5 h-3.5" /> Paramètres
        </button>
      </div>

      {showCfg && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] text-muted-foreground mb-3">Dépôt GPS optionnel — sinon l&apos;estimation porte sur le trajet entre fournisseurs.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {cfgFields.map(f => (
              <div key={f.key} className="flex flex-col gap-1">
                <label className="text-[11px] text-muted-foreground">{f.label}</label>
                <input type="number" step={f.step ?? 1} value={cfg[f.key]}
                  onChange={e => updateCfg({ [f.key]: Number(e.target.value) } as Partial<Cfg>)}
                  className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Résultat */}
      {result && (
        <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Temps estimé de la tournée</span>
            <span className="text-2xl font-black text-primary">{fmtH(result.totalH)}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="rounded-lg bg-card border border-border p-2">
              <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1"><Route className="w-3 h-3" />Trajet</p>
              <p className="text-sm font-bold text-foreground">{N1(result.km)} km</p>
              <p className="text-[10px] text-muted-foreground">{fmtH(result.travelH)}</p>
            </div>
            <div className="rounded-lg bg-card border border-border p-2">
              <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1"><Weight className="w-3 h-3" />Chargement</p>
              <p className="text-sm font-bold text-foreground">{N1(result.totalKg / 1000)} t</p>
              <p className="text-[10px] text-muted-foreground">{fmtH(result.loadingH)}</p>
            </div>
            <div className="rounded-lg bg-card border border-border p-2">
              <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1"><Truck className="w-3 h-3" />Arrêts</p>
              <p className="text-sm font-bold text-foreground">{result.picked.length}</p>
              <p className="text-[10px] text-muted-foreground">{fmtH(result.stopH)}</p>
            </div>
            <div className="rounded-lg bg-card border border-border p-2">
              <p className="text-[10px] text-muted-foreground">Tonnage total</p>
              <p className="text-sm font-bold text-foreground">{result.totalKg.toLocaleString("fr-MA")} kg</p>
            </div>
          </div>
          {!result.hasDepot && (
            <p className="text-[11px] text-amber-600 mt-2">⚠️ Dépôt GPS non défini — le trajet ne compte pas les allers-retours dépôt. Renseignez-le dans Paramètres.</p>
          )}
        </div>
      )}

      {/* Sélection fournisseurs */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground px-4 py-2.5 border-b border-border">
          Fournisseurs (avec GPS) — cochez la tournée et saisissez le tonnage
        </p>
        {fournisseurs.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <MapPin className="w-7 h-7 mx-auto mb-2 opacity-30" />
            Aucun fournisseur géolocalisé. Ajoutez des points d&apos;itinéraire (lat/lng) aux fiches fournisseurs.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {fournisseurs.map(f => {
              const on = !!selected[f.id]
              return (
                <div key={f.id} className={`flex items-center gap-3 px-4 py-2.5 ${on ? "bg-primary/5" : ""}`}>
                  <button onClick={() => toggle(f.id)} className="shrink-0 text-primary">
                    {on ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 text-muted-foreground" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{f.nom}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {(f.itineraires ?? []).find(i => typeof i.lat === "number")?.nom ?? f.ville ?? "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input type="number" min={0} step={50} placeholder="kg" value={tonnage[f.id] ?? ""}
                      disabled={!on}
                      onChange={e => setTonnage(t => ({ ...t, [f.id]: e.target.value }))}
                      className="w-24 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-mono text-right focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-40" />
                    <span className="text-[11px] text-muted-foreground">kg</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
