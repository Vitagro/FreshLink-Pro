"use client"

// Rapport analytics boutique (shop.vita-core.org) + configuration de
// l'affichage public du compteur. Lit /api/ext/shop-stats.
import { useState, useEffect, useCallback } from "react"
import { BarChart3, Eye, MousePointerClick, MapPin, FileText, RefreshCw, Save, Globe } from "lucide-react"

interface Stats {
  total: { visits: number; clicks: number }
  online?: number
  aujourdhui: { visits: number; clicks: number }
  parJour: { date: string; visits: number; clicks: number }[]
  topPages: { label: string; count: number }[]
  regions: { label: string; count: number }[]
  events: { label: string; count: number }[]
  points: { lat: number; lng: number; region?: string; page?: string; t?: string; acc?: number }[]
  config: { afficher: boolean; showVisits: boolean; showClicks: boolean; showRegions: boolean; titre: string }
}

const DEFAULT_CFG = { afficher: true, showVisits: true, showClicks: false, showRegions: false, titre: "Visiteurs" }

export default function BOShopAnalytics() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [days, setDays] = useState(7)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [cfg, setCfg] = useState(DEFAULT_CFG)
  const [savedMsg, setSavedMsg] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/ext/shop-stats?days=${days}`, { cache: "no-store" })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error ?? "Erreur")
      setStats(d as Stats)
      setCfg({ ...DEFAULT_CFG, ...(d.config ?? {}) })
      setError("")
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => { load() }, [load])

  const saveConfig = async () => {
    try {
      const res = await fetch("/api/ext/shop-stats", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: cfg }),
      })
      const d = await res.json()
      setSavedMsg(d.ok ? "✅ Affichage du site mis à jour" : "Erreur : " + (d.error ?? ""))
      setTimeout(() => setSavedMsg(""), 4000)
    } catch { setSavedMsg("Erreur réseau") }
  }

  const maxDay = Math.max(1, ...(stats?.parJour ?? []).flatMap(d => [d.visits, d.clicks]))

  return (
    <div className="flex flex-col gap-4 p-1">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" /> Compteur Boutique
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Visites, clics, pages les plus vues et régions — shop.vita-core.org</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={days} onChange={e => setDays(Number(e.target.value))}
            className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs">
            {[1, 7, 30, 90].map(n => <option key={n} value={n}>{n === 1 ? "Aujourd'hui" : `${n} jours`}</option>)}
          </select>
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-muted hover:bg-muted/70">
            <RefreshCw className="w-3.5 h-3.5" /> Actualiser
          </button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
      {loading && !stats && <div className="text-sm text-muted-foreground py-8 text-center">Chargement…</div>}

      {stats && (
        <>
          {/* Cartes */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { l: "🟢 En ligne maintenant", v: stats.online ?? 0, icon: <Eye className="w-4 h-4" />, c: "#16a34a" },
              { l: "Visites (période)", v: stats.total.visits, icon: <Eye className="w-4 h-4" />, c: "#0ea5e9" },
              { l: "Visites aujourd'hui", v: stats.aujourdhui.visits, icon: <Eye className="w-4 h-4" />, c: "#16a34a" },
              { l: "Clics (période)", v: stats.total.clicks, icon: <MousePointerClick className="w-4 h-4" />, c: "#d97706" },
              { l: "Régions", v: stats.regions.length, icon: <MapPin className="w-4 h-4" />, c: "#8b5cf6" },
            ].map(k => (
              <div key={k.l} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-center gap-1.5 text-muted-foreground" style={{ color: k.c }}>{k.icon}<span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{k.l}</span></div>
                <p className="text-xl font-extrabold mt-1" style={{ color: k.c }}>{k.v.toLocaleString("fr-MA")}</p>
              </div>
            ))}
          </div>

          {/* Par jour (visites + clics) */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Visites &amp; clics par jour</p>
              <div className="flex items-center gap-3 text-[10px] font-semibold">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-sky-500/80" /> Visites</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500/80" /> Clics</span>
              </div>
            </div>
            <div className="flex items-end gap-1.5 h-28">
              {stats.parJour.slice().reverse().map(d => (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1" title={`${d.date} : ${d.visits} visites, ${d.clicks} clics`}>
                  <div className="w-full flex items-end justify-center gap-0.5 h-full">
                    <div className="w-1/2 rounded-t bg-sky-500/80" style={{ height: `${Math.round((d.visits / maxDay) * 100)}%`, minHeight: d.visits > 0 ? 4 : 0 }} />
                    <div className="w-1/2 rounded-t bg-amber-500/80" style={{ height: `${Math.round((d.clicks / maxDay) * 100)}%`, minHeight: d.clicks > 0 ? 4 : 0 }} />
                  </div>
                  <span className="text-[8px] text-muted-foreground">{d.date.slice(5)}</span>
                </div>
              ))}
              {stats.parJour.length === 0 && <p className="text-xs text-muted-foreground">Aucune donnée encore — le compteur démarre après le déploiement du script sur la boutique.</p>}
            </div>
          </div>

          {/* Top pages + régions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Pages les plus vues</p>
              {stats.topPages.length === 0 ? <p className="text-xs text-muted-foreground">—</p> :
                stats.topPages.map(p => (
                  <div key={p.label} className="flex items-center justify-between py-1 text-sm border-b border-border last:border-0">
                    <span className="text-foreground truncate">{p.label || "accueil"}</span>
                    <span className="font-bold text-sky-600">{p.count}</span>
                  </div>
                ))}
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Lieux des visiteurs</p>
              {stats.regions.length === 0 ? <p className="text-xs text-muted-foreground">—</p> :
                stats.regions.map(r => (
                  <div key={r.label} className="flex items-center justify-between py-1 text-sm border-b border-border last:border-0">
                    <span className="text-foreground truncate">{r.label}</span>
                    <span className="font-bold text-violet-600">{r.count}</span>
                  </div>
                ))}
            </div>
          </div>

          {/* Actions / clics détaillés des visiteurs */}
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5"><MousePointerClick className="w-3.5 h-3.5" /> Actions des visiteurs (clics)</p>
            {(stats.events ?? []).length === 0 ? <p className="text-xs text-muted-foreground">Aucun clic enregistré sur la période.</p> :
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                {stats.events.slice(0, 16).map(ev => (
                  <div key={ev.label} className="flex items-center justify-between py-1 text-sm border-b border-border/60 last:border-0">
                    <span className="text-foreground truncate" title={ev.label}>{ev.label || "—"}</span>
                    <span className="font-bold text-amber-600 ml-2 shrink-0">{ev.count}</span>
                  </div>
                ))}
              </div>}
          </div>

          {/* Points GPS exacts des visiteurs (consentement navigateur) */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Points GPS exacts des visiteurs</p>
              {(stats.points ?? []).length > 0 && (
                <a href={`https://www.google.com/maps?q=${stats.points[0].lat},${stats.points[0].lng}`} target="_blank" rel="noopener noreferrer"
                  className="text-[11px] font-semibold text-sky-600 hover:underline">Voir le plus récent sur la carte →</a>
              )}
            </div>
            {(stats.points ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">Aucun point GPS — un point n&apos;est enregistré que si le visiteur autorise la géolocalisation dans son navigateur (sinon seul le pays · ville via IP est connu).</p>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
                    <th className="py-1.5 pr-2">Quand</th><th className="py-1.5 pr-2">Lieu (IP)</th><th className="py-1.5 pr-2">Page</th>
                    <th className="py-1.5 pr-2">Coordonnées</th><th className="py-1.5">Carte</th>
                  </tr></thead>
                  <tbody>
                    {stats.points.slice(0, 100).map((pt, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-1.5 pr-2 text-muted-foreground whitespace-nowrap">{pt.t ? new Date(pt.t).toLocaleString("fr-MA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                        <td className="py-1.5 pr-2 text-foreground truncate max-w-[120px]" title={pt.region}>{pt.region || "—"}</td>
                        <td className="py-1.5 pr-2 text-muted-foreground truncate max-w-[90px]">{pt.page || "accueil"}</td>
                        <td className="py-1.5 pr-2 font-mono text-foreground">{pt.lat.toFixed(5)}, {pt.lng.toFixed(5)}{pt.acc ? ` (±${pt.acc}m)` : ""}</td>
                        <td className="py-1.5">
                          <a href={`https://www.google.com/maps?q=${pt.lat},${pt.lng}`} target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:underline font-semibold">Ouvrir</a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Config affichage public */}
          <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4 flex flex-col gap-3">
            <p className="text-xs font-bold uppercase tracking-wide text-primary flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> Affichage public sur la boutique</p>
            <p className="text-[11px] text-muted-foreground">Choisissez ce que le compteur montre aux visiteurs du site.</p>
            <div className="flex flex-wrap items-center gap-4">
              {([
                { k: "afficher", label: "Afficher le compteur" },
                { k: "showVisits", label: "Visites" },
                { k: "showClicks", label: "Clics" },
                { k: "showRegions", label: "Région principale" },
              ] as { k: keyof typeof cfg; label: string }[]).map(o => (
                <label key={o.k} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={!!cfg[o.k]} onChange={e => setCfg(c => ({ ...c, [o.k]: e.target.checked }))} className="w-4 h-4 accent-emerald-600" />
                  {o.label}
                </label>
              ))}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Titre :</span>
                <input value={cfg.titre} onChange={e => setCfg(c => ({ ...c, titre: e.target.value }))}
                  className="w-32 px-2 py-1 rounded-lg border border-border bg-background text-sm" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={saveConfig} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:opacity-90">
                <Save className="w-4 h-4" /> Enregistrer l'affichage
              </button>
              {savedMsg && <span className="text-xs font-semibold text-emerald-600">{savedMsg}</span>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
