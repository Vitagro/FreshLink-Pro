"use client"

import { useState, useEffect, useMemo } from "react"
import { store, type User } from "@/lib/store"

// ══════════════════════════════════════════════════════════════════════════════
// Alertes articles par client — version BACK-OFFICE
// Port de la logique mobile (components/mobile/MobileAlertes.tsx, section articles).
// Un article habituellement commandé par un client mais non recommandé depuis
// N jours = alerte. Seuils configurables via store.getAlertConfig() :
//   articleAbsenceJours  → seuil minimal d'affichage
//   articleAbsenceMedium → bascule badge "Moyen" (orange)
//   articleAbsenceUrgent → bascule badge "Urgent" (rouge)
// Données lues directement depuis le store localStorage (synchronisé Supabase).
// ══════════════════════════════════════════════════════════════════════════════

interface Props { user: User }

type Severity = "urgent" | "medium" | "info"

interface ClientArticleAlert {
  key: string
  clientId: string
  clientNom: string
  prevendeurId: string
  prevendeurNom: string
  articleId: string
  articleNom: string
  articleNomAr?: string
  famille: string
  joursAbsence: number
  nbCommandes: number
  lastDate: string
  prixVente: number
  avgQuantite: number
  valeurEstimee: number
  stockDisponible: number
  severity: Severity
}

const money = (n: number) => `${Math.round(n ?? 0).toLocaleString("fr-MA")} DH`

const SEV: Record<Severity, { row: string; badge: string; label: string; icon: string }> = {
  urgent: { row: "hover:bg-red-50/60",   badge: "bg-red-100 text-red-700",     label: "Urgent", icon: "🚨" },
  medium: { row: "hover:bg-amber-50/60", badge: "bg-amber-100 text-amber-700", label: "Moyen",  icon: "⚠️" },
  info:   { row: "hover:bg-blue-50/60",  badge: "bg-blue-100 text-blue-700",   label: "Info",   icon: "📋" },
}

// Rôles avec vision globale ; les autres sont restreints à leurs propres clients
const GLOBAL_ROLES = ["super_super_admin", "super_admin", "admin", "resp_commercial"]

export default function BOAlertesClients({ user }: Props) {
  const isGlobalScope = GLOBAL_ROLES.includes(user.role)
  const crossdock = store.isCrossdockMode()

  const [refreshKey, setRefreshKey] = useState(0)
  const [clientFilter, setClientFilter] = useState("")
  const [prevendeurFilter, setPrevendeurFilter] = useState(isGlobalScope ? "" : user.id)
  const [severityFilter, setSeverityFilter] = useState<"all" | Severity>("all")
  const [search, setSearch] = useState("")

  // Re-render quand Supabase pousse des données fraîches
  useEffect(() => {
    const handler = (e: Event) => {
      const key = (e as CustomEvent).detail as string
      if (key === "fl_commandes" || key === "fl_clients" || key === "fl_articles") {
        setRefreshKey(k => k + 1)
      }
    }
    window.addEventListener("fl_store_updated", handler)
    return () => window.removeEventListener("fl_store_updated", handler)
  }, [])

  // ── Construction des alertes : fréquence (client × article) ─────────────────
  const alerts = useMemo<ClientArticleAlert[]>(() => {
    const cfg       = store.getAlertConfig()
    // Exclut "refuse" (commande annulee/soft-supprimee) — sinon une commande
    // annulee d'un article peut faire croire qu'il vient d'etre re-livre au
    // client (lastDate mis a jour), masquant l'alerte "article absent".
    const commandes = store.getVisibleCommandes().filter(c => c.statut !== "refuse")
    const clientById  = new Map(store.getVisibleClients().map(c => [c.id, c]))
    const articleById = new Map(store.getArticles().map(a => [a.id, a]))
    const userById    = new Map(store.getUsers().map(u => [u.id, u]))
    const today = new Date()

    // freq[`${clientId}|${articleId}`]
    const freq: Record<string, {
      clientId: string; articleId: string; count: number
      lastDate: string; prixVente: number; totalQuantite: number; commercialNom: string
    }> = {}

    commandes.forEach(cmd => {
      cmd.lignes.forEach(l => {
        if (!l.articleId) return
        const k    = `${cmd.clientId}|${l.articleId}`
        const prev = freq[k]
        const isNewer = !prev || cmd.date > prev.lastDate
        freq[k] = {
          clientId: cmd.clientId,
          articleId: l.articleId,
          count: (prev?.count ?? 0) + 1,
          lastDate: isNewer ? cmd.date : prev!.lastDate,
          prixVente: isNewer ? (l.prixVente ?? l.prixUnitaire ?? 0) : prev!.prixVente,
          totalQuantite: (prev?.totalQuantite ?? 0) + (l.quantite ?? 0),
          commercialNom: isNewer ? cmd.commercialNom : prev!.commercialNom,
        }
      })
    })

    const result: ClientArticleAlert[] = []
    for (const [k, info] of Object.entries(freq)) {
      if (info.count < 2) continue                       // article occasionnel → ignoré
      const client = clientById.get(info.clientId)
      const art    = articleById.get(info.articleId)
      if (!client || !art) continue
      const joursAbsence = Math.floor((today.getTime() - new Date(info.lastDate).getTime()) / 86400000)
      if (joursAbsence < cfg.articleAbsenceJours) continue

      const severity: Severity =
        joursAbsence >= cfg.articleAbsenceUrgent ? "urgent" :
        joursAbsence >= cfg.articleAbsenceMedium ? "medium" : "info"

      const prevendeur   = client.prevendeurId ? userById.get(client.prevendeurId) : undefined
      const avgQuantite  = info.count > 0 ? info.totalQuantite / info.count : 0
      const valeurEstimee = avgQuantite * info.prixVente

      result.push({
        key: k,
        clientId: info.clientId,
        clientNom: client.nom,
        prevendeurId: client.prevendeurId ?? "",
        prevendeurNom: prevendeur?.name ?? info.commercialNom ?? "—",
        articleId: info.articleId,
        articleNom: art.nom,
        articleNomAr: art.nomAr,
        famille: art.famille ?? "",
        joursAbsence,
        nbCommandes: info.count,
        lastDate: info.lastDate,
        prixVente: info.prixVente,
        avgQuantite,
        valeurEstimee,
        stockDisponible: art.stockDisponible ?? 0,
        severity,
      })
    }
    return result.sort((a, b) => b.joursAbsence - a.joursAbsence)
  }, [refreshKey])

  // ── Options des filtres (dérivées des alertes existantes) ───────────────────
  const clientOptions = useMemo(() => {
    const m = new Map<string, string>()
    alerts.forEach(a => m.set(a.clientId, a.clientNom))
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [alerts])

  const prevendeurOptions = useMemo(() => {
    const m = new Map<string, string>()
    alerts.forEach(a => { if (a.prevendeurId) m.set(a.prevendeurId, a.prevendeurNom) })
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [alerts])

  // ── Filtrage ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return alerts.filter(a => {
      if (clientFilter && a.clientId !== clientFilter) return false
      if (prevendeurFilter && a.prevendeurId !== prevendeurFilter) return false
      if (severityFilter !== "all" && a.severity !== severityFilter) return false
      if (q && !a.articleNom.toLowerCase().includes(q) && !a.clientNom.toLowerCase().includes(q)) return false
      return true
    })
  }, [alerts, clientFilter, prevendeurFilter, severityFilter, search])

  const kpis = useMemo(() => ({
    total:  filtered.length,
    urgent: filtered.filter(a => a.severity === "urgent").length,
    medium: filtered.filter(a => a.severity === "medium").length,
    valeur: filtered.reduce((s, a) => s + a.valeurEstimee, 0),
  }), [filtered])

  const cfg = store.getAlertConfig()

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto flex flex-col gap-5">

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">📦 Alertes articles par client</h1>
          <p className="text-sm text-slate-500 mt-1">
            Articles habituellement commandés mais non recommandés depuis <b>+{cfg.articleAbsenceJours} jours</b>
            {!isGlobalScope && " — limité à vos clients"}
          </p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Alertes totales"  value={String(kpis.total)} />
        <Kpi label="🚨 Urgentes"       value={String(kpis.urgent)} accent={kpis.urgent > 0 ? "text-red-600" : undefined} />
        <Kpi label="⚠️ Moyennes"       value={String(kpis.medium)} accent={kpis.medium > 0 ? "text-amber-600" : undefined} />
        <Kpi label="Manque à gagner"  value={money(kpis.valeur)} accent="text-emerald-600" />
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Client</label>
          <select value={clientFilter} onChange={e => setClientFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white min-w-[160px]">
            <option value="">Tous les clients</option>
            {clientOptions.map(([id, nom]) => <option key={id} value={id}>{nom}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Prévendeur</label>
          <select value={prevendeurFilter} onChange={e => setPrevendeurFilter(e.target.value)}
            disabled={!isGlobalScope}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white min-w-[160px] disabled:bg-slate-100 disabled:text-slate-400">
            <option value="">Tous les prévendeurs</option>
            {prevendeurOptions.map(([id, nom]) => <option key={id} value={id}>{nom}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Recherche</label>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Article ou client…"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
        </div>
      </div>

      {/* Chips gravité */}
      <div className="flex gap-2 flex-wrap -mt-1">
        {([
          ["all",    "Toutes",     alerts.length],
          ["urgent", "🚨 Urgent",  alerts.filter(a => a.severity === "urgent").length],
          ["medium", "⚠️ Moyen",   alerts.filter(a => a.severity === "medium").length],
          ["info",   "📋 Info",    alerts.filter(a => a.severity === "info").length],
        ] as const).map(([val, lbl, n]) => {
          const active = severityFilter === val
          return (
            <button key={val} onClick={() => setSeverityFilter(val)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border
                ${active
                  ? val === "urgent" ? "bg-red-600 text-white border-red-600"
                    : val === "medium" ? "bg-amber-500 text-white border-amber-500"
                    : val === "info" ? "bg-blue-600 text-white border-blue-600"
                    : "bg-slate-800 text-white border-slate-800"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              {lbl}{val !== "all" ? ` (${n})` : ""}
            </button>
          )
        })}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-2xl border border-slate-200 bg-white">
          <div className="w-16 h-16 rounded-2xl bg-green-50 border border-green-200 flex items-center justify-center text-3xl">✅</div>
          <p className="font-semibold text-sm text-slate-700">Aucune alerte article</p>
          <p className="text-xs text-slate-400 text-center max-w-xs">
            Les articles habituels de vos clients sont à jour, ou aucune commande ne correspond aux filtres.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide text-left">
                  <th className="px-3 py-2.5 font-semibold">Client</th>
                  <th className="px-3 py-2.5 font-semibold">Prévendeur</th>
                  <th className="px-3 py-2.5 font-semibold">Article</th>
                  <th className="px-3 py-2.5 font-semibold text-center">Absence</th>
                  <th className="px-3 py-2.5 font-semibold text-center">Cmd.</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Dernière</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Val. estimée</th>
                  {!crossdock && <th className="px-3 py-2.5 font-semibold text-center">Stock</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(a => {
                  const s = SEV[a.severity]
                  const stockOk = a.stockDisponible > 0
                  return (
                    <tr key={a.key} className={`transition-colors ${s.row}`}>
                      <td className="px-3 py-2.5 font-semibold text-slate-900">{a.clientNom}</td>
                      <td className="px-3 py-2.5 text-slate-500">{a.prevendeurNom}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-slate-800">{a.articleNom}</div>
                        {a.articleNomAr && <div className="text-xs text-slate-400 font-arabic" dir="rtl" lang="ar">{a.articleNomAr}</div>}
                        {a.famille && <div className="text-[11px] text-slate-400">{a.famille}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${s.badge}`}>
                          {s.icon} J-{a.joursAbsence}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center text-slate-600">{a.nbCommandes}×</td>
                      <td className="px-3 py-2.5 text-right text-slate-500 whitespace-nowrap">
                        {new Date(a.lastDate).toLocaleDateString("fr-MA", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-slate-900 whitespace-nowrap">{money(a.valeurEstimee)}</td>
                      {!crossdock && (
                        <td className="px-3 py-2.5 text-center">
                          <span className={`text-[11px] font-semibold ${stockOk ? "text-green-600" : "text-red-500"}`}>
                            {stockOk ? `✓ ${a.stockDisponible}` : "⚠ 0"}
                          </span>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer — légende seuils */}
      <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
        <p className="text-[11px] text-slate-500 leading-relaxed">
          <span className="font-semibold text-blue-600">Info</span> ≥ {cfg.articleAbsenceJours}j ·{" "}
          <span className="font-semibold text-amber-600">Moyen</span> ≥ {cfg.articleAbsenceMedium}j ·{" "}
          <span className="font-semibold text-red-600">Urgent</span> ≥ {cfg.articleAbsenceUrgent}j
          {" "}— seuils configurables dans <b>Paramètres</b>.
        </p>
        <p className="text-[11px] text-slate-400 mt-1">
          « Val. estimée » = quantité moyenne historiquement commandée × dernier prix de vente (manque à gagner potentiel si l'article n'est pas réassorti).
        </p>
      </div>
    </div>
  )
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl bg-white border border-slate-200 px-4 py-3">
      <p className="text-[11px] text-slate-500 truncate">{label}</p>
      <p className={`text-xl font-black mt-0.5 ${accent ?? "text-slate-900"}`}>{value}</p>
    </div>
  )
}
