"use client"

import { useState, useEffect, useMemo } from "react"
import { store, type User, type Client, DELAI_RECOUVREMENT_LABELS, type Visite } from "@/lib/store"
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from "recharts"

interface Props { user: User }

const DH = (n: number) => `${n.toLocaleString("fr-MA", { maximumFractionDigits: 0 })} DH`
const KG = (n: number) => `${n.toLocaleString("fr-MA", { maximumFractionDigits: 1 })} kg`
// Fresh produce palette: emerald, amber, sky, lime, tomato, teal, orange, yellow, red, green
const CHART_COLORS = ["#10b981", "#f59e0b", "#0ea5e9", "#84cc16", "#ef4444", "#14b8a6", "#f97316", "#eab308", "#dc2626", "#22c55e"]

function dateOffset(base: string, days: number): string {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d.toISOString().split("T")[0]
}
function getWeekRange(dateStr: string) {
  const d = new Date(dateStr)
  const day = d.getDay() === 0 ? 6 : d.getDay() - 1
  const monday = new Date(d); monday.setDate(d.getDate() - day)
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
  return { start: monday.toISOString().split("T")[0], end: sunday.toISOString().split("T")[0] }
}
function getMonthRange(dateStr: string) {
  const d = new Date(dateStr)
  const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split("T")[0]
  return { start, end }
}
function ProgressBar({ value, max, color = "bg-primary" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${value > max && max > 0 ? "bg-emerald-500" : color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-bold w-8 text-right ${pct >= 100 ? "text-emerald-600" : pct >= 80 ? "text-amber-600" : "text-muted-foreground"}`}>{pct}%</span>
    </div>
  )
}

function Delta({ current, previous, label }: { current: number; previous: number; label?: string }) {
  if (previous === 0) return null
  const pct = Math.round(((current - previous) / previous) * 100)
  const up = pct >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${up ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
      {up ? "+" : ""}{pct}% {label ?? "vs J-1"}
    </span>
  )
}

type DashTab = "global" | "graphes" | "retours" | "objectifs" | "credit"

// Delay thresholds in milliseconds for credit overdue detection
const DELAI_MS: Record<string, number> = {
  jour_meme:  0,
  "24h":      24 * 60 * 60 * 1000,
  "48h":      48 * 60 * 60 * 1000,
  "1_semaine":7 * 24 * 60 * 60 * 1000,
  "1_mois":   30 * 24 * 60 * 60 * 1000,
  a_definir:  Infinity,
}

export default function BODashboard({ user }: Props) {
  const [commandes, setCommandes] = useState(store.getVisibleCommandes())
  const [articles, setArticles] = useState(store.getArticles())
  const [clients, setClients] = useState(store.getVisibleClients())
  const [bonsAchat, setBonsAchat] = useState(store.getBonsAchat())
  const [users, setUsers] = useState(store.getUsers())
  const [retours, setRetours] = useState(store.getRetours())
  const [bls, setBls] = useState(store.getVisibleBonsLivraison())
  const [visites, setVisites] = useState(store.getVisites ? store.getVisites() : [])
  const [dashTab, setDashTab] = useState<DashTab>("global")
  // Factures impayées (fl_invoices) → intégrées au crédit (sinon crédit=0 alors
  // qu'une facture est « Impayée » côté Finance).
  const [unpaidByClient, setUnpaidByClient] = useState<Record<string, number>>({})
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/sync-read?table=fl_invoices", { cache: "no-store" })
        const j = await res.json()
        const rows: { payload?: Record<string, unknown> }[] = j?.ok ? (j.data ?? []) : []
        const map: Record<string, number> = {}
        rows.forEach(r => {
          const p = r.payload ?? {}
          if (String(p.statut) !== "impayee") return
          const key = String(p.clientId || p.clientNom || "")
          if (!key) return
          const reste = Number(p.montantTTC ?? 0) - Number(p.montantPaye ?? 0)
          map[key] = (map[key] || 0) + (reste > 0 ? reste : 0)
        })
        setUnpaidByClient(map)
      } catch { /* offline */ }
    })()
  }, [])

  const [lastRefreshed, setLastRefreshed] = useState<Date>(() => new Date())
  const [refreshTick, setRefreshTick] = useState(0)

  const refreshData = () => {
    setCommandes(store.getVisibleCommandes())
    setArticles(store.getArticles())
    setClients(store.getVisibleClients())
    setBonsAchat(store.getBonsAchat())
    setUsers(store.getUsers())
    setRetours(store.getRetours())
    setBls(store.getVisibleBonsLivraison())
    setVisites(store.getVisites ? store.getVisites() : [])
    setLastRefreshed(new Date())
  }

  useEffect(() => { refreshData() }, [])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const id = setInterval(() => {
      refreshData()
      setRefreshTick(t => t + 1)
    }, 30000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-render when Supabase pushes fresh data to localStorage
  useEffect(() => {
    const WATCHED = new Set(["fl_commandes","fl_clients","fl_articles","fl_users","fl_retours","fl_bons_livraison","fl_visites","fl_bons_achat"])
    const handler = (e: Event) => {
      if (WATCHED.has((e as CustomEvent).detail as string)) refreshData()
    }
    window.addEventListener("fl_store_updated", handler)
    return () => window.removeEventListener("fl_store_updated", handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const today = store.today()
  const yesterday = dateOffset(today, -1)
  const lastWeekSameDay = dateOffset(today, -7)
  const weekRange = getWeekRange(today)
  const lastWeekRange = getWeekRange(yesterday)
  const monthRange = getMonthRange(today)

  // Une commande annulée/refusée (statut "refuse", y compris une suppression
  // par le commercial — MobileCommercial route désormais sa "Supprimer" vers
  // ce même statut plutôt qu'un hard-delete) reste dans l'historique mais ne
  // doit compter dans AUCUN indicatif commercial : CA, tonnage, top client,
  // top article, top commercial. Base commune pour tous ces calculs.
  const commandesActives = useMemo(() => commandes.filter(c => c.statut !== "refuse"), [commandes])

  // --- Commandes helpers ---
  const cmdsToday    = useMemo(() => commandesActives.filter(c => c.date === today), [commandesActives, today])
  const cmdsYday     = useMemo(() => commandesActives.filter(c => c.date === yesterday), [commandesActives, yesterday])
  const cmdsLastWkDay= useMemo(() => commandesActives.filter(c => c.date === lastWeekSameDay), [commandesActives, lastWeekSameDay])
  const cmdsWeek     = useMemo(() => commandesActives.filter(c => c.date >= weekRange.start && c.date <= weekRange.end), [commandesActives, weekRange])
  const cmdsLastWeek = useMemo(() => commandesActives.filter(c => c.date >= lastWeekRange.start && c.date <= lastWeekRange.end), [commandesActives, lastWeekRange])
  const cmdsMonth    = useMemo(() => commandesActives.filter(c => c.date >= monthRange.start && c.date <= monthRange.end), [commandesActives, monthRange])

  const caOf   = (arr: typeof commandes) => arr.reduce((s, c) => s + c.lignes.reduce((ls, l) => ls + l.quantite * l.prixVente, 0), 0)
  const tonnOf = (arr: typeof commandes) => arr.reduce((s, c) => s + c.lignes.reduce((ls, l) => ls + l.quantite, 0), 0)

  const caToday     = caOf(cmdsToday)
  const caYday      = caOf(cmdsYday)
  const caLastWkDay = caOf(cmdsLastWkDay)
  const caWeek      = caOf(cmdsWeek)
  const caLastWeek  = caOf(cmdsLastWeek)
  const caMonth     = caOf(cmdsMonth)

  const tonnageToday    = tonnOf(cmdsToday)
  const tonnageYday     = tonnOf(cmdsYday)
  const tonnageLastWkDay= tonnOf(cmdsLastWkDay)

  // --- Visites ---
  const visitesToday  = visites.filter((v: { date: string }) => v.date === today).length
  const visitesYday   = visites.filter((v: { date: string }) => v.date === yesterday).length
  const visitesLastWk = visites.filter((v: { date: string }) => v.date === lastWeekSameDay).length

  // ── Tournees du Jour ──────────────────────────────────────────────────────
  const visitesTodayList = visites.filter((v: { date: string }) => v.date === today) as Visite[]
  const visitesTodayCommandes = visitesTodayList.filter(v => v.resultat === "commande").length
  const tauxConversionJ = visitesTodayList.length > 0
    ? Math.round((visitesTodayCommandes / visitesTodayList.length) * 100)
    : 0
  const pvTourneesMap: Record<string, { nom: string; visites: number; commandes: number }> = {}
  visitesTodayList.forEach(v => {
    if (!pvTourneesMap[v.prevendeurId]) pvTourneesMap[v.prevendeurId] = { nom: v.prevendeurNom, visites: 0, commandes: 0 }
    pvTourneesMap[v.prevendeurId].visites++
    if (v.resultat === "commande") pvTourneesMap[v.prevendeurId].commandes++
  })
  const pvTourneesArr = Object.values(pvTourneesMap).sort((a, b) => b.visites - a.visites)

  // --- Retours ---
  const retoursToday  = retours.filter(r => r.date === today)
  const retoursAll    = retours

  const totalRetourKg = retoursAll.reduce((s, r) => s + r.lignes.reduce((ls, l) => ls + l.quantite, 0), 0)
  const totalRetourKgToday = retoursToday.reduce((s, r) => s + r.lignes.reduce((ls, l) => ls + l.quantite, 0), 0)

  // Taux retour = kg retourne / kg livre
  const totalLivreKg   = bls.reduce((s, b) => s + b.lignes.reduce((ls, l) => ls + l.quantite, 0), 0)
  const tauxRetour     = totalLivreKg > 0 ? Math.round((totalRetourKg / totalLivreKg) * 100) : 0

  // --- Stock ---
  const stockFaible   = articles.filter(a => a.stockDisponible < 50).length
  // "En attente" = pas encore livrée (couvre tout le pipeline : en_attente,
  // en_attente_approbation, valide, en_preparation, charge, en_transit).
  // Compter uniquement le statut brut "en_attente" affichait 0 dès qu'une
  // commande avait avancé dans le flux (valide/en_preparation), ce qui est
  // le cas de la quasi-totalité des commandes réelles.
  const cmdsEnAttente = commandes.filter(c => !["livre", "refuse", "retour"].includes(c.statut)).length
  const totalAchats   = bonsAchat.reduce((s, b) => s + b.lignes.reduce((ls, l) => ls + l.quantite * l.prixAchat, 0), 0)

  // --- Top clients (CA) ---
  const clientsCA: Record<string, { nom: string; ca: number; cmds: number; tonnage: number }> = {}
  commandesActives.forEach(c => {
    const ca = c.lignes.reduce((s, l) => s + l.quantite * l.prixVente, 0)
    if (!clientsCA[c.clientId]) clientsCA[c.clientId] = { nom: c.clientNom, ca: 0, cmds: 0, tonnage: 0 }
    clientsCA[c.clientId].ca += ca
    clientsCA[c.clientId].cmds++
    clientsCA[c.clientId].tonnage += c.lignes.reduce((s, l) => s + l.quantite, 0)
  })
  const top10Clients = Object.entries(clientsCA).sort(([, a], [, b]) => b.ca - a.ca).slice(0, 10)

  // --- Top clients retours ---
  const clientsRetour: Record<string, { nom: string; kg: number; nb: number }> = {}
  retoursAll.forEach(r => r.lignes.forEach(l => {
    if (!clientsRetour[l.clientNom]) clientsRetour[l.clientNom] = { nom: l.clientNom, kg: 0, nb: 0 }
    clientsRetour[l.clientNom].kg += l.quantite
    clientsRetour[l.clientNom].nb++
  }))
  const top10RetourClients = Object.entries(clientsRetour).sort(([, a], [, b]) => b.kg - a.kg).slice(0, 10)

  // --- Top motifs retour ---
  const motifsRetour: Record<string, { motif: string; kg: number; nb: number }> = {}
  retoursAll.forEach(r => r.lignes.forEach(l => {
    if (!motifsRetour[l.motif]) motifsRetour[l.motif] = { motif: l.motif, kg: 0, nb: 0 }
    motifsRetour[l.motif].kg += l.quantite
    motifsRetour[l.motif].nb++
  }))
  const topMotifs = Object.entries(motifsRetour).sort(([, a], [, b]) => b.nb - a.nb).slice(0, 8)

  // --- Top articles retournes ---
  const articlesRetour: Record<string, { nom: string; kg: number; nb: number }> = {}
  retoursAll.forEach(r => r.lignes.forEach(l => {
    if (!articlesRetour[l.articleNom]) articlesRetour[l.articleNom] = { nom: l.articleNom, kg: 0, nb: 0 }
    articlesRetour[l.articleNom].kg += l.quantite
    articlesRetour[l.articleNom].nb++
  }))
  const topArticlesRetour = Object.entries(articlesRetour).sort(([, a], [, b]) => b.kg - a.kg).slice(0, 8)

  // --- Top prevendeurs retour ---
  const pvRetour: Record<string, { nom: string; kg: number; nb: number }> = {}
  retoursAll.forEach(r => {
    // match BL to find prevendeur
    r.lignes.forEach(l => {
      const bl = bls.find(b => b.commandeId === l.commandeId)
      if (!bl) return
      if (!pvRetour[bl.prevendeurNom]) pvRetour[bl.prevendeurNom] = { nom: bl.prevendeurNom, kg: 0, nb: 0 }
      pvRetour[bl.prevendeurNom].kg += l.quantite
      pvRetour[bl.prevendeurNom].nb++
    })
  })
  const topPVRetour = Object.entries(pvRetour).sort(([, a], [, b]) => b.kg - a.kg).slice(0, 6)

  // --- Top livreurs retour ---
  const livRetour: Record<string, { nom: string; kg: number; nb: number }> = {}
  retoursAll.forEach(r => {
    if (!livRetour[r.livreurNom]) livRetour[r.livreurNom] = { nom: r.livreurNom, kg: 0, nb: 0 }
    r.lignes.forEach(l => { livRetour[r.livreurNom].kg += l.quantite })
    livRetour[r.livreurNom].nb++
  })
  const topLivRetour = Object.entries(livRetour).sort(([, a], [, b]) => b.kg - a.kg).slice(0, 6)

  // --- Prevendeurs stats ---
  const prevendeurs = users.filter(u => u.role === "prevendeur" && u.actif)
  const getPrevendeurStats = (pv: User) => {
    const cdJ = commandesActives.filter(c => c.commercialId === pv.id && c.date === today)
    const cdW = commandesActives.filter(c => c.commercialId === pv.id && c.date >= weekRange.start && c.date <= weekRange.end)
    const cdM = commandesActives.filter(c => c.commercialId === pv.id && c.date >= monthRange.start && c.date <= monthRange.end)
    return {
      caJ: caOf(cdJ), caW: caOf(cdW), caM: caOf(cdM),
      tonnageJ: tonnOf(cdJ), tonnageM: tonnOf(cdM),
      clientsJ: new Set(cdJ.map(c => c.clientId)).size,
      clientsW: new Set(cdW.map(c => c.clientId)).size,
      clientsM: new Set(cdM.map(c => c.clientId)).size,
      nbCmdsJ: cdJ.length, nbCmdsM: cdM.length,
    }
  }

  // --- Chart data ---
  // Last 14 days CA + tonnage per day
  const last14Days = Array.from({ length: 14 }, (_, i) => {
    const d = dateOffset(today, -(13 - i))
    const dayStr = d.slice(5) // MM-DD
    const dayCmds = commandesActives.filter(c => c.date === d)
    return { date: dayStr, ca: Math.round(caOf(dayCmds)), tonnage: Math.round(tonnOf(dayCmds)) }
  })

  // CA + tonnage per prevendeur
  const pvChartData = prevendeurs.map(pv => {
    const s = getPrevendeurStats(pv)
    return { name: pv.name.split(" ")[0], ca: Math.round(s.caJ), tonnage: Math.round(s.tonnageJ) }
  })

  // Top articles sold (all time, by kg)
  const artSold: Record<string, { nom: string; kg: number }> = {}
  commandesActives.forEach(c => c.lignes.forEach(l => {
    if (!artSold[l.articleNom]) artSold[l.articleNom] = { nom: l.articleNom, kg: 0 }
    artSold[l.articleNom].kg += l.quantite
  }))
  const artChartData = Object.entries(artSold).sort(([, a], [, b]) => b.kg - a.kg).slice(0, 10)
    .map(([, v]) => ({ name: v.nom, kg: Math.round(v.kg) }))

  // CA per secteur
  const secteurCA: Record<string, number> = {}
  commandesActives.forEach(c => {
    secteurCA[c.secteur] = (secteurCA[c.secteur] ?? 0) + caOf([c])
  })
  const secteurChartData = Object.entries(secteurCA).sort(([, a], [, b]) => b - a).slice(0, 8)
    .map(([s, v]) => ({ name: s, ca: Math.round(v) }))

  const isAdmin = ["super_super_admin", "super_admin", "admin", "resp_commercial", "team_leader"].includes(user.role)

  // ── Credit analysis ────────────────────────────────────────────────────────
  // For each client with credit enabled, compute: solde, delai, statut, overdue flag
  const creditClients = useMemo(() => {
    const now = Date.now()
    const unpaidOf = (c: typeof clients[number]) => Number(unpaidByClient[c.id] ?? unpaidByClient[c.nom] ?? 0) || 0
    return clients
      // inclut aussi les clients ayant une facture impayée (même sans crédit configuré)
      .filter(c => c.creditAutorise || (c.creditSolde ?? 0) > 0 || unpaidOf(c) > 0)
      .map(c => {
        // Solde = solde crédit enregistré + factures impayées non encore intégrées
        const solde = (c.creditSolde ?? 0) + unpaidOf(c)
        const plafond = c.plafondCredit ?? 0
        const delai = c.delaiRecouvrement ?? "a_definir"
        const delaiMs = DELAI_MS[delai] ?? Infinity

        // Last invoice date: find the last BL date for this client
        const clientBLs = bls.filter(b => b.clientId === c.id)
        const lastBLDate = clientBLs.length > 0
          ? clientBLs.sort((a, b2) => b2.date.localeCompare(a.date))[0].date
          : null
        const lastBLMs = lastBLDate ? new Date(lastBLDate).getTime() : null
        const ageMs = lastBLMs ? now - lastBLMs : null

        const overduePct = plafond > 0 ? Math.round((solde / plafond) * 100) : 0
        const isOverdue = ageMs !== null && delaiMs !== Infinity && ageMs > delaiMs && solde > 0
        const isOverPlafond = plafond > 0 && solde > plafond

        return {
          client: c,
          solde,
          plafond,
          delai,
          overduePct,
          isOverdue,
          isOverPlafond,
          lastBLDate,
          ageMs,
          statut: c.creditStatut ?? "ok",
        }
      })
      .sort((a, b) => {
        // Sort: overdue + over plafond first, then overdue, then by solde desc
        if (b.isOverPlafond !== a.isOverPlafond) return a.isOverPlafond ? -1 : 1
        if (b.isOverdue !== a.isOverdue) return a.isOverdue ? -1 : 1
        return b.solde - a.solde
      })
  }, [clients, bls, unpaidByClient])

  const creditAlerts = creditClients.filter(c => c.isOverdue || c.isOverPlafond)
  const totalExposition = creditClients.reduce((s, c) => s + c.solde, 0)
  const totalEnRetard = creditClients.filter(c => c.isOverdue).reduce((s, c) => s + c.solde, 0)
  const totalHorsPlafond = creditClients.filter(c => c.isOverPlafond).reduce((s, c) => s + c.solde, 0)

  // Tab definitions
  const TABS: { id: DashTab; label: string; alert?: number }[] = [
    { id: "global", label: "Vue globale" },
    { id: "graphes", label: "Graphes" },
    { id: "retours", label: "Retours" },
    { id: "objectifs", label: "Objectifs" },
    { id: "credit", label: "Credit", alert: creditAlerts.length },
  ]

  return (
    <div className="flex flex-col gap-5">
      {/* Header — pro grade */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "oklch(0.55 0.18 250)", boxShadow: "0 0 16px oklch(0.55 0.18 250 / 0.35)" }}>
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-foreground">
                Tableau de bord <span className="font-normal text-base text-muted-foreground">/ لوحة القيادة</span>
              </h2>
              {/* LIVE badge */}
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider"
                style={{ background: "oklch(0.18 0.06 148)", color: "oklch(0.72 0.18 148)", border: "1px solid oklch(0.28 0.10 148)" }}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                LIVE
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-muted-foreground">
                {today} — {user.name} — màj {lastRefreshed.toLocaleTimeString("fr-MA", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </p>
              <button
                onClick={() => refreshData()}
                title="Actualiser maintenant"
                className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold transition-colors hover:opacity-80"
                style={{ background: "oklch(0.18 0.030 255)", color: "oklch(0.60 0.12 255)", border: "1px solid oklch(0.25 0.020 255)" }}>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Actualiser
              </button>
            </div>
          </div>
        </div>
        {isAdmin && (
          <div className="flex gap-1 p-1 rounded-xl flex-wrap" style={{ background: "oklch(0.12 0.018 255)", border: "1px solid oklch(0.20 0.016 255)" }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setDashTab(t.id)}
                className="relative px-4 py-2 rounded-lg text-sm font-bold transition-all"
                style={dashTab === t.id
                  ? { background: "oklch(0.55 0.18 250)", color: "#fff", boxShadow: "0 2px 8px oklch(0.55 0.18 250 / 0.3)" }
                  : { color: "oklch(0.50 0.010 255)" }}>
                {t.label}
                {t.alert && t.alert > 0 ? (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-white text-[10px] font-black flex items-center justify-center"
                    style={{ background: "oklch(0.54 0.22 27)" }}>
                    {t.alert > 9 ? "9+" : t.alert}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ============================== CREDIT ALERTS BANNER ============================== */}
      {isAdmin && creditAlerts.length > 0 && (
        <div className="rounded-2xl p-4 flex flex-col gap-3 bg-red-50 border border-red-200">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-red-100">
                <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-red-800">
                  {creditAlerts.length} alerte(s) credit — {DH(totalEnRetard + totalHorsPlafond)} en situation critique
                </p>
                <p className="text-xs text-red-600">Clients hors plafond ou en retard de paiement</p>
              </div>
            </div>
            <button onClick={() => setDashTab("credit")}
              className="px-4 py-1.5 rounded-xl text-xs font-bold text-white transition-opacity hover:opacity-90 bg-red-600">
              Voir Credit
            </button>
          </div>
          {/* Quick preview of top 3 alerts */}
          <div className="flex flex-col gap-1.5">
            {creditAlerts.slice(0, 3).map(c => (
              <div key={c.client.id} className="flex items-center justify-between rounded-xl px-3 py-2 gap-2 bg-card border border-red-200">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {c.isOverPlafond && (
                    <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-300">Hors plafond</span>
                  )}
                  {c.isOverdue && !c.isOverPlafond && (
                    <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-300">En retard</span>
                  )}
                  <span className="text-sm font-semibold truncate text-foreground">{c.client.nom}</span>
                </div>
                <span className="text-sm font-black shrink-0 text-red-600">{DH(c.solde)}</span>
              </div>
            ))}
          </div>
          {creditAlerts.length > 3 && (
            <p className="text-xs text-center text-red-600">+ {creditAlerts.length - 3} autre(s) client(s) — voir onglet Credit</p>
          )}
        </div>
      )}

      {/* ============================== GLOBAL ============================== */}
      {dashTab === "global" && (
        <>
          {/* KPI row 1 — CA */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                label: "CA aujourd'hui", labelAr: "رقم الأعمال اليوم",
                value: DH(caToday), sub: `${cmdsToday.length} commande(s)`,
                delta1: <Delta current={caToday} previous={caYday} label="vs J-1" />,
                delta2: <Delta current={caToday} previous={caLastWkDay} label="vs sem. passee" />,
                icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6", iconBg: "bg-emerald-50", iconClr: "text-emerald-600", valClr: "text-emerald-600",
              },
              {
                label: "CA semaine", labelAr: "رقم الأعمال الأسبوع",
                value: DH(caWeek), sub: `${cmdsWeek.length} commandes`,
                delta1: <Delta current={caWeek} previous={caLastWeek} label="vs S-1" />,
                delta2: null,
                icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z", iconBg: "bg-amber-50", iconClr: "text-amber-600", valClr: "text-amber-600",
              },
              {
                label: "CA mois", labelAr: "رقم الأعمال الشهر",
                value: DH(caMonth), sub: `${cmdsMonth.length} commandes`,
                delta1: null, delta2: null,
                icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z", iconBg: "bg-blue-50", iconClr: "text-blue-600", valClr: "text-blue-600",
              },
            ].map(k => (
              <div key={k.label} className="kpi-card bg-card border border-border rounded-2xl p-4 flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${k.iconBg}`}>
                  <svg className={`w-5 h-5 ${k.iconClr}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={k.icon} />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">{k.label} / {k.labelAr}</p>
                  <p className={`text-2xl font-black ${k.valClr}`}>{k.value}</p>
                  <p className="text-xs text-muted-foreground">{k.sub}</p>
                  {(k.delta1 || k.delta2) && (
                    <div className="flex gap-1 mt-1.5 flex-wrap">{k.delta1}{k.delta2}</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* KPI row 2 — Tonnage + Visites + Retours + Stock */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {[
              {
                label: "Tonnage jour",
                v: KG(tonnageToday),
                clr: "text-amber-600",
                sub: <Delta current={tonnageToday} previous={tonnageYday} label="vs J-1" />,
                sub2: <Delta current={tonnageToday} previous={tonnageLastWkDay} label="vs S-1" />,
              },
              {
                label: "Visites jour",
                v: String(visitesToday),
                clr: "text-blue-600",
                sub: <Delta current={visitesToday} previous={visitesYday} label="vs J-1" />,
                sub2: <Delta current={visitesToday} previous={visitesLastWk} label="vs S-1" />,
              },
              { label: "Retours (kg/j)",  v: KG(totalRetourKgToday), clr: "text-red-600", sub: null, sub2: null },
              { label: "Taux retour",     v: `${tauxRetour}%`, clr: tauxRetour > 10 ? "text-red-600" : tauxRetour > 5 ? "text-amber-600" : "text-emerald-600", sub: null, sub2: null },
              { label: "Cmds en attente", v: String(cmdsEnAttente), clr: "text-yellow-600", sub: null, sub2: null },
              { label: "Stock faible",    v: String(stockFaible), clr: stockFaible > 0 ? "text-red-600" : "text-emerald-600", sub: null, sub2: null },
            ].map(k => (
              <div key={k.label} className="bg-card border border-border rounded-xl p-3">
                <p className="text-[11px] mb-1 truncate text-muted-foreground">{k.label}</p>
                <p className={`text-xl font-black ${k.clr}`}>{k.v}</p>
                {(k.sub || k.sub2) && <div className="flex gap-1 mt-1 flex-wrap">{k.sub}{k.sub2}</div>}
              </div>
            ))}
          </div>

          {/* Alert stock */}
          {stockFaible > 0 && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
              <svg className="w-5 h-5 shrink-0 mt-0.5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="text-sm font-bold text-red-800">Alerte stock faible / تنبيه مخزون</p>
                <p className="text-xs text-red-600">{stockFaible} article(s) sous 50 kg — Passez des commandes fournisseur.</p>
              </div>
            </div>
          )}

          {/* ── Tournees du Jour ───────────────────────────────── */}
          {visitesTodayList.length > 0 && (
            <div className="rounded-2xl overflow-hidden bg-card border border-border">
              <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-2 border-b border-border">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 shrink-0 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                  <h3 className="text-sm font-bold text-foreground">Tournées du Jour / جولات اليوم</h3>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-black px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700">
                    {tauxConversionJ}% conversion
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {visitesTodayList.length} visite(s) · {visitesTodayCommandes} commande(s)
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="text-left px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Prévendeur</th>
                      <th className="text-center px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Visites</th>
                      <th className="text-center px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Commandes</th>
                      <th className="text-center px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Sans cmd</th>
                      <th className="text-center px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Taux</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {pvTourneesArr.map((pv, i) => {
                      const taux = pv.visites > 0 ? Math.round((pv.commandes / pv.visites) * 100) : 0
                      return (
                        <tr key={pv.nom + i}>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold text-white shrink-0 bg-indigo-600">
                                {pv.nom[0]?.toUpperCase()}
                              </div>
                              <span className="text-xs font-medium text-foreground">{pv.nom}</span>
                            </div>
                          </td>
                          <td className="text-center px-3 py-2.5 text-xs font-bold text-foreground">{pv.visites}</td>
                          <td className="text-center px-3 py-2.5 text-xs font-bold text-emerald-600">{pv.commandes}</td>
                          <td className="text-center px-3 py-2.5 text-xs font-bold text-red-600">{pv.visites - pv.commandes}</td>
                          <td className="text-center px-3 py-2.5">
                            <span className={`text-xs font-black ${taux >= 70 ? "text-emerald-600" : taux >= 40 ? "text-amber-600" : "text-red-600"}`}>
                              {taux}%
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top 10 clients CA */}
            <div className="rounded-2xl overflow-hidden bg-card border border-border">
              <div className="px-4 py-3 flex items-center justify-between border-b border-border">
                <h3 className="text-sm font-bold text-foreground">Top 10 clients / أفضل الزبائن</h3>
                <span className="text-xs text-muted-foreground">CA total</span>
              </div>
              {top10Clients.length === 0
                ? <p className="px-4 py-6 text-sm text-center text-muted-foreground">Aucune commande</p>
                : <div className="divide-y divide-border">
                  {top10Clients.map(([id, c], i) => (
                    <div key={id} className="px-4 py-2.5 flex items-center gap-3 row-hover">
                      <span className="w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center shrink-0 bg-emerald-50 text-emerald-700">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate text-foreground">{c.nom}</p>
                        <p className="text-xs text-muted-foreground">{c.cmds} cmd(s) · {KG(c.tonnage)}</p>
                      </div>
                      <span className="font-bold text-sm shrink-0 text-emerald-600">{DH(c.ca)}</span>
                    </div>
                  ))}
                </div>}
            </div>

            {/* Top articles vendus */}
            <div className="rounded-2xl overflow-hidden bg-card border border-border">
              <div className="px-4 py-3 flex items-center justify-between border-b border-border">
                <h3 className="text-sm font-bold text-foreground">Top articles vendus / الأكثر مبيعاً</h3>
                <span className="text-xs text-muted-foreground">Toute periode</span>
              </div>
              {artChartData.length === 0
                ? <p className="px-4 py-6 text-sm text-center text-muted-foreground">Aucune commande</p>
                : <div className="divide-y divide-border">
                  {artChartData.slice(0, 8).map((a, i) => (
                    <div key={a.name} className="px-4 py-2.5 flex items-center gap-3 row-hover">
                      <span className="w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center shrink-0 bg-amber-50 text-amber-700">{i + 1}</span>
                      <p className="flex-1 text-sm font-semibold truncate text-foreground">{a.name}</p>
                      <span className="font-bold text-sm shrink-0 text-amber-600">{KG(a.kg)}</span>
                    </div>
                  ))}
                </div>}
            </div>
          </div>

          {/* Recent commandes */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-bold text-foreground">Dernieres commandes / آخر الطلبيات</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ background: "oklch(0.965 0.005 240)" }}>
                  <tr>
                    {["ID", "Date", "Commercial", "Client", "Secteur", "Tonnage", "Total", "Statut"].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 font-semibold text-xs text-muted-foreground uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[...commandes].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10).map(c => {
                    const total = c.lignes.reduce((s, l) => s + l.quantite * l.prixVente, 0)
                    const tonn = c.lignes.reduce((s, l) => s + l.quantite, 0)
                    return (
                      <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{c.id}</td>
                        <td className="px-3 py-2.5 text-muted-foreground text-xs">{c.date}</td>
                        <td className="px-3 py-2.5 font-medium text-foreground text-xs">{c.commercialNom}</td>
                        <td className="px-3 py-2.5 text-foreground text-xs">{c.clientNom}</td>
                        <td className="px-3 py-2.5 text-muted-foreground text-xs">{c.secteur}</td>
                        <td className="px-3 py-2.5 font-semibold text-amber-600 text-xs">{KG(tonn)}</td>
                        <td className="px-3 py-2.5 font-bold text-primary text-xs">{DH(total)}</td>
                        <td className="px-3 py-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            c.statut === "livre" ? "bg-green-100 text-green-700" :
                            c.statut === "en_transit" ? "bg-blue-100 text-blue-700" :
                            c.statut === "valide" ? "bg-amber-100 text-amber-700" :
                            c.statut === "en_attente_approbation" ? "bg-orange-100 text-orange-700" :
                            "bg-muted text-muted-foreground"}`}>
                            {c.statut}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                  {commandes.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Aucune commande</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ============================== GRAPHES ============================== */}
      {dashTab === "graphes" && (
        <div className="flex flex-col gap-5">

          {/* Shared chart style tokens */}
          {(() => {
            const GRID  = "oklch(0.22 0.012 145)"
            const TICK  = { fontSize: 11, fill: "oklch(0.52 0.010 145)" }
            const TICK_SM = { fontSize: 10, fill: "oklch(0.50 0.010 145)" }
            const TT_STYLE = { background: "oklch(0.12 0.010 145)", border: "1px solid oklch(0.22 0.012 145)", borderRadius: "0.75rem", fontSize: 12, color: "oklch(0.88 0.006 100)" }
            const CARD_STYLE = { background: "oklch(0.12 0.010 145)", border: "1px solid oklch(0.20 0.012 145)" }

            return (
              <>
                {/* CA + Tonnage evolution 14j */}
                <div className="rounded-2xl p-5" style={CARD_STYLE}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold" style={{ color: "oklch(0.88 0.006 100)" }}>Evolution CA &amp; Tonnage — 14 derniers jours</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "oklch(0.18 0.020 148)", color: "oklch(0.65 0.18 148)" }}>14j</span>
                  </div>
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={last14Days} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="4 3" stroke={GRID} />
                      <XAxis dataKey="date" tick={TICK} axisLine={{ stroke: GRID }} tickLine={false} />
                      <YAxis yAxisId="ca" orientation="left" tick={TICK} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                      <YAxis yAxisId="ton" orientation="right" tick={TICK} axisLine={false} tickLine={false} tickFormatter={v => `${v}`} />
                      <Tooltip contentStyle={TT_STYLE} formatter={(v: unknown, name: unknown) => (name as string) === "ca" ? DH(v as number) : KG(v as number)} />
                      <Legend wrapperStyle={{ fontSize: 12, color: "oklch(0.62 0.008 145)" }} />
                      <Line yAxisId="ca" type="monotone" dataKey="ca" stroke="#10b981" strokeWidth={2.5} dot={false} name="CA (DH)" />
                      <Line yAxisId="ton" type="monotone" dataKey="tonnage" stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="5 3" name="Tonnage (kg)" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* CA par prevendeur */}
                {pvChartData.length > 0 && (
                  <div className="rounded-2xl p-5" style={CARD_STYLE}>
                    <h3 className="text-sm font-bold mb-4" style={{ color: "oklch(0.88 0.006 100)" }}>CA &amp; Tonnage par prevendeur — aujourd&apos;hui</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={pvChartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="4 3" stroke={GRID} />
                        <XAxis dataKey="name" tick={TICK} axisLine={{ stroke: GRID }} tickLine={false} />
                        <YAxis yAxisId="ca" orientation="left" tick={TICK} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                        <YAxis yAxisId="ton" orientation="right" tick={TICK} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={TT_STYLE} formatter={(v: unknown, name: unknown) => (name as string) === "ca" ? DH(v as number) : KG(v as number)} />
                        <Legend wrapperStyle={{ fontSize: 12, color: "oklch(0.62 0.008 145)" }} />
                        <Bar yAxisId="ca" dataKey="ca" fill="#10b981" name="CA (DH)" radius={[6, 6, 0, 0]} />
                        <Bar yAxisId="ton" dataKey="tonnage" fill="#f59e0b" name="Tonnage (kg)" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Top articles kg — horizontal bars */}
                {artChartData.length > 0 && (
                  <div className="rounded-2xl p-5" style={CARD_STYLE}>
                    <h3 className="text-sm font-bold mb-4" style={{ color: "oklch(0.88 0.006 100)" }}>Top 10 articles — Tonnage vendu (kg)</h3>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={artChartData} layout="vertical" margin={{ top: 4, right: 56, left: 70, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="4 3" stroke={GRID} horizontal={false} />
                        <XAxis type="number" tick={TICK_SM} axisLine={{ stroke: GRID }} tickLine={false} tickFormatter={v => `${v}kg`} />
                        <YAxis type="category" dataKey="name" tick={TICK_SM} axisLine={false} tickLine={false} width={70} />
                        <Tooltip contentStyle={TT_STYLE} formatter={(v: unknown) => KG(v as number)} />
                        <Bar dataKey="kg" name="Tonnage" radius={[0, 6, 6, 0]}>
                          {artChartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* CA par secteur + Pie */}
                {secteurChartData.length > 0 && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="rounded-2xl p-5" style={CARD_STYLE}>
                      <h3 className="text-sm font-bold mb-4" style={{ color: "oklch(0.88 0.006 100)" }}>CA par secteur</h3>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={secteurChartData} layout="vertical" margin={{ top: 4, right: 56, left: 70, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="4 3" stroke={GRID} horizontal={false} />
                          <XAxis type="number" tick={TICK_SM} axisLine={{ stroke: GRID }} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                          <YAxis type="category" dataKey="name" tick={TICK_SM} axisLine={false} tickLine={false} width={70} />
                          <Tooltip contentStyle={TT_STYLE} formatter={(v: unknown) => DH(v as number)} />
                          <Bar dataKey="ca" name="CA" radius={[0, 6, 6, 0]}>
                            {secteurChartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="rounded-2xl p-5" style={CARD_STYLE}>
                      <h3 className="text-sm font-bold mb-4" style={{ color: "oklch(0.88 0.006 100)" }}>Top 10 clients — Part CA</h3>
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie data={top10Clients.map(([, c]) => ({ name: c.nom, value: Math.round(c.ca) }))}
                            dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} innerRadius={40}
                            label={({ name, percent }: { name?: string; percent?: number }) => `${(name ?? "").split(" ")[0]} ${((percent ?? 0) * 100).toFixed(0)}%`}
                            labelLine={false} fontSize={9}>
                            {top10Clients.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                          </Pie>
                          <Tooltip contentStyle={TT_STYLE} formatter={(v: unknown) => DH(v as number)} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </>
            )
          })()}
        </div>
      )}

      {/* ============================== RETOURS ============================== */}
      {dashTab === "retours" && (
        <div className="flex flex-col gap-5">
          {/* Retour KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Retours aujourd'hui (kg)", v: KG(totalRetourKgToday), c: "text-red-600", bg: "bg-red-50 border-red-200" },
              { label: "Total retours (kg)", v: KG(totalRetourKg), c: "text-red-700", bg: "bg-red-50 border-red-200" },
              { label: "Taux retour global", v: `${tauxRetour}%`, c: tauxRetour > 10 ? "text-red-600" : "text-amber-600", bg: "bg-amber-50 border-amber-200" },
              { label: "Nb bons retour", v: String(retoursAll.length), c: "text-orange-600", bg: "bg-orange-50 border-orange-200" },
            ].map(k => (
              <div key={k.label} className={`rounded-2xl border p-4 ${k.bg}`}>
                <p className="text-xs font-medium text-muted-foreground mb-1">{k.label}</p>
                <p className={`text-xl font-bold ${k.c}`}>{k.v}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top 10 clients qui retournent */}
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-sm font-bold text-red-700">Top clients retours / أكثر زبائن برجوع</h3>
              </div>
              {top10RetourClients.length === 0
                ? <p className="px-4 py-6 text-sm text-muted-foreground text-center">Aucun retour</p>
                : <div className="divide-y divide-border">
                  {top10RetourClients.map(([id, c], i) => (
                    <div key={id} className="px-4 py-2.5 flex items-center gap-3">
                      <span className="w-5 h-5 rounded-full bg-red-100 text-red-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-foreground">{c.nom}</p>
                        <p className="text-xs text-muted-foreground">{c.nb} retour(s)</p>
                      </div>
                      <span className="font-bold text-red-600 text-sm">{KG(c.kg)}</span>
                    </div>
                  ))}
                </div>}
            </div>

            {/* Top motifs */}
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-sm font-bold text-foreground">Top motifs de retour</h3>
              </div>
              {topMotifs.length === 0
                ? <p className="px-4 py-6 text-sm text-muted-foreground text-center">Aucun retour</p>
                : <div className="divide-y divide-border">
                  {topMotifs.map(([id, m], i) => (
                    <div key={id} className="px-4 py-2.5 flex items-center gap-3">
                      <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                      <p className="flex-1 text-sm font-semibold text-foreground truncate">{m.motif || "—"}</p>
                      <div className="text-right">
                        <span className="font-bold text-orange-600 text-sm">{m.nb}x</span>
                        <span className="text-xs text-muted-foreground ml-1">· {KG(m.kg)}</span>
                      </div>
                    </div>
                  ))}
                </div>}
            </div>

            {/* Top articles retournes */}
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-sm font-bold text-foreground">Top articles retournes</h3>
              </div>
              {topArticlesRetour.length === 0
                ? <p className="px-4 py-6 text-sm text-muted-foreground text-center">Aucun retour</p>
                : <div className="divide-y divide-border">
                  {topArticlesRetour.map(([id, a], i) => (
                    <div key={id} className="px-4 py-2.5 flex items-center gap-3">
                      <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                      <p className="flex-1 text-sm font-semibold text-foreground">{a.nom}</p>
                      <div className="text-right">
                        <span className="font-bold text-amber-600 text-sm">{KG(a.kg)}</span>
                        <span className="text-xs text-muted-foreground ml-1">· {a.nb}x</span>
                      </div>
                    </div>
                  ))}
                </div>}
            </div>

            {/* Top livreurs retour */}
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-sm font-bold text-foreground">Top livreurs retours</h3>
              </div>
              {topLivRetour.length === 0
                ? <p className="px-4 py-6 text-sm text-muted-foreground text-center">Aucun retour</p>
                : <div className="divide-y divide-border">
                  {topLivRetour.map(([id, l], i) => (
                    <div key={id} className="px-4 py-2.5 flex items-center gap-3">
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                      <p className="flex-1 text-sm font-semibold text-foreground">{l.nom}</p>
                      <div className="text-right">
                        <span className="font-bold text-blue-600 text-sm">{KG(l.kg)}</span>
                        <span className="text-xs text-muted-foreground ml-1">· {l.nb} bon(s)</span>
                      </div>
                    </div>
                  ))}
                </div>}
            </div>
          </div>

          {/* Top prevendeurs retour */}
          {topPVRetour.length > 0 && (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-sm font-bold text-foreground">Top prevendeurs generant des retours</h3>
              </div>
              <div className="divide-y divide-border">
                {topPVRetour.map(([id, p], i) => (
                  <div key={id} className="px-4 py-2.5 flex items-center gap-3">
                    <span className="w-5 h-5 rounded-full bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                    <p className="flex-1 text-sm font-semibold text-foreground">{p.nom}</p>
                    <div className="text-right">
                      <span className="font-bold text-violet-600 text-sm">{KG(p.kg)}</span>
                      <span className="text-xs text-muted-foreground ml-1">· {p.nb} ligne(s)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Retour chart */}
          {topArticlesRetour.length > 0 && (
            <div className="bg-card rounded-xl border border-border p-4">
              <h3 className="text-sm font-bold text-foreground mb-4">Articles retournes — Tonnage (kg)</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={topArticlesRetour.map(([, a]) => ({ name: a.nom, kg: Math.round(a.kg) }))}
                  layout="vertical" margin={{ top: 4, right: 48, left: 80, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.88 0.01 240)" />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${v}kg`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                  <Tooltip formatter={(v: unknown) => KG(v as number)} />
                  <Bar dataKey="kg" fill="#ef4444" name="Retour (kg)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ============================== OBJECTIFS ============================== */}
      {dashTab === "objectifs" && (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-3 gap-3">
            {[
              { p: "Aujourd'hui", v: DH(caToday), sub: `${cmdsToday.length} commandes · ${KG(tonnageToday)}`, col: "text-sky-600", bg: "bg-sky-50", bd: "border-sky-200" },
              { p: "Semaine",     v: DH(caWeek),  sub: `${cmdsWeek.length} commandes`,  col: "text-violet-600", bg: "bg-violet-50", bd: "border-violet-200" },
              { p: "Mois",        v: DH(caMonth), sub: `${cmdsMonth.length} commandes`, col: "text-emerald-600", bg: "bg-emerald-50", bd: "border-emerald-200" },
            ].map(k => (
              <div key={k.p} className={`${k.bg} ${k.bd} border rounded-xl p-4 text-center`}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{k.p}</p>
                <p className={`text-xl font-extrabold ${k.col}`}>{k.v}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{k.sub}</p>
              </div>
            ))}
          </div>

          {prevendeurs.length === 0 ? (
            <div className="bg-card rounded-xl border border-border p-10 text-center">
              <p className="text-muted-foreground text-sm">Aucun prevendeur actif enregistre.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {prevendeurs.map(pv => {
                const s = getPrevendeurStats(pv)
                return (
                  <div key={pv.id} className="bg-card rounded-xl border border-border overflow-hidden">
                    <div className="flex items-center gap-3 px-5 py-4 border-b border-border" style={{ background: "oklch(0.14 0.03 260)" }}>
                      <div className="w-9 h-9 rounded-full bg-green-600 flex items-center justify-center text-white text-sm font-bold shrink-0">{pv.name[0]}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{pv.name}</p>
                        <p className="text-xs" style={{ color: "oklch(0.60 0.03 245)" }}>
                          {pv.secteur ? `Secteur: ${pv.secteur}` : "Prevendeur"} · {s.nbCmdsJ} cmd(s) · {KG(s.tonnageJ)} · {s.clientsJ} client(s)
                        </p>
                      </div>
                      <div className="flex gap-3 shrink-0">
                        <div className="text-center px-2">
                          <p className="text-xs" style={{ color: "oklch(0.48 0.04 245)" }}>Jour CA</p>
                          <p className="text-sm font-bold text-sky-400">{DH(s.caJ)}</p>
                        </div>
                        <div className="text-center px-2 border-l" style={{ borderColor: "oklch(0.22 0.03 260)" }}>
                          <p className="text-xs" style={{ color: "oklch(0.48 0.04 245)" }}>Mois CA</p>
                          <p className="text-sm font-bold text-emerald-400">{DH(s.caM)}</p>
                        </div>
                        <div className="text-center px-2 border-l" style={{ borderColor: "oklch(0.22 0.03 260)" }}>
                          <p className="text-xs" style={{ color: "oklch(0.48 0.04 245)" }}>Tonnage J</p>
                          <p className="text-sm font-bold text-amber-400">{KG(s.tonnageJ)}</p>
                        </div>
                      </div>
                    </div>
                    <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-5">
                      <div className="flex flex-col gap-3">
                        <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Objectifs CA (DH)</h4>
                        {(pv.objectifJournalierCA ?? 0) > 0 && (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">Journalier</span>
                              <span className="font-semibold">{DH(s.caJ)} / {DH(pv.objectifJournalierCA ?? 0)}</span>
                            </div>
                            <ProgressBar value={s.caJ} max={pv.objectifJournalierCA ?? 0} color="bg-sky-500" />
                          </div>
                        )}
                        {(pv.objectifHebdomadaireCA ?? 0) > 0 && (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">Hebdomadaire</span>
                              <span className="font-semibold">{DH(s.caW)} / {DH(pv.objectifHebdomadaireCA ?? 0)}</span>
                            </div>
                            <ProgressBar value={s.caW} max={pv.objectifHebdomadaireCA ?? 0} color="bg-violet-500" />
                          </div>
                        )}
                        {(pv.objectifMensuelCA ?? 0) > 0 && (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">Mensuel</span>
                              <span className="font-semibold">{DH(s.caM)} / {DH(pv.objectifMensuelCA ?? 0)}</span>
                            </div>
                            <ProgressBar value={s.caM} max={pv.objectifMensuelCA ?? 0} color="bg-emerald-500" />
                          </div>
                        )}
                        {!((pv.objectifJournalierCA ?? 0) > 0 || (pv.objectifHebdomadaireCA ?? 0) > 0 || (pv.objectifMensuelCA ?? 0) > 0) && (
                          <p className="text-xs text-muted-foreground">Pas d&apos;objectifs CA definis</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-3">
                        <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Objectifs Clients visites</h4>
                        {(pv.objectifJournalierClients ?? 0) > 0 && (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">Journalier</span>
                              <span className="font-semibold">{s.clientsJ} / {pv.objectifJournalierClients ?? 0}</span>
                            </div>
                            <ProgressBar value={s.clientsJ} max={pv.objectifJournalierClients ?? 0} color="bg-sky-500" />
                          </div>
                        )}
                        {(pv.objectifMensuelClients ?? 0) > 0 && (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">Mensuel</span>
                              <span className="font-semibold">{s.clientsM} / {pv.objectifMensuelClients ?? 0}</span>
                            </div>
                            <ProgressBar value={s.clientsM} max={pv.objectifMensuelClients ?? 0} color="bg-emerald-500" />
                          </div>
                        )}
                        {!((pv.objectifJournalierClients ?? 0) > 0 || (pv.objectifMensuelClients ?? 0) > 0) && (
                          <p className="text-xs text-muted-foreground">Pas d&apos;objectifs clients definis</p>
                        )}
                      </div>
                      {/* Objectifs Tonnage (kg) */}
                      <div className="flex flex-col gap-3">
                        <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Objectifs Tonnage (kg)</h4>
                        {(() => {
                          const objM = pv.objectifTonnage ?? 0
                          const objJ = objM ? Math.round(objM / 24) : 0
                          if (objM <= 0) return <p className="text-xs text-muted-foreground">Pas d&apos;objectif tonnage défini · réalisé : {KG(s.tonnageJ)} (jour) / {KG(s.tonnageM)} (mois)</p>
                          return (
                            <>
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">Journalier</span>
                                  <span className="font-semibold">{KG(s.tonnageJ)} / {KG(objJ)}</span>
                                </div>
                                <ProgressBar value={s.tonnageJ} max={objJ} color="bg-orange-500" />
                              </div>
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">Mensuel</span>
                                  <span className="font-semibold">{KG(s.tonnageM)} / {KG(objM)}</span>
                                </div>
                                <ProgressBar value={s.tonnageM} max={objM} color="bg-rose-500" />
                              </div>
                            </>
                          )
                        })()}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ============================== CREDIT ============================== */}
      {dashTab === "credit" && isAdmin && (
        <div className="flex flex-col gap-5">
          {/* KPI summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Encours total", labelAr: "إجمالي الرصيد", value: DH(totalExposition), color: "text-primary" },
              { label: "En retard", labelAr: "متأخر عن السداد", value: DH(totalEnRetard), color: "text-orange-600" },
              { label: "Hors plafond", labelAr: "تجاوز السقف", value: DH(totalHorsPlafond), color: "text-red-600" },
              { label: "Alertes actives", labelAr: "تنبيهات", value: String(creditAlerts.length), color: creditAlerts.length > 0 ? "text-red-600" : "text-emerald-600" },
            ].map(k => (
              <div key={k.label} className="bg-card rounded-xl border border-border p-4 flex flex-col gap-0.5">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{k.label}</p>
                <p className="text-[10px] text-muted-foreground" dir="rtl">{k.labelAr}</p>
                <p className={`text-2xl font-extrabold ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>

          {/* Alerts section */}
          {creditAlerts.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-bold text-red-700 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Alertes actives ({creditAlerts.length})
              </h3>
              {creditAlerts.map(c => (
                <div key={c.client.id} className="bg-red-50 border-2 border-red-200 rounded-xl p-4 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <p className="font-bold text-foreground">{c.client.nom}</p>
                      <p className="text-xs text-muted-foreground">{c.client.secteur} — {c.client.zone}</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {c.isOverPlafond && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-200 text-red-800 border border-red-400">Hors plafond</span>
                      )}
                      {c.isOverdue && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-200 text-orange-800 border border-orange-400">Retard paiement</span>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <p className="text-muted-foreground">Encours</p>
                      <p className="font-bold text-red-700 text-base">{DH(c.solde)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Plafond</p>
                      <p className="font-bold">{c.plafond > 0 ? DH(c.plafond) : "Non defini"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Delai</p>
                      <p className="font-bold">{DELAI_RECOUVREMENT_LABELS[c.delai] ?? c.delai}</p>
                    </div>
                  </div>
                  {c.plafond > 0 && (
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Utilisation plafond</span>
                        <span className={`font-bold ${c.overduePct >= 100 ? "text-red-600" : c.overduePct >= 80 ? "text-orange-600" : "text-foreground"}`}>{c.overduePct}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full rounded-full ${c.overduePct >= 100 ? "bg-red-500" : c.overduePct >= 80 ? "bg-orange-500" : "bg-primary"}`}
                          style={{ width: `${Math.min(100, c.overduePct)}%` }} />
                      </div>
                    </div>
                  )}
                  {c.lastBLDate && (
                    <p className="text-[11px] text-muted-foreground">
                      Derniere livraison : {c.lastBLDate}
                      {c.ageMs !== null && c.delai !== "a_definir" ? ` — ${Math.round(c.ageMs / (24 * 3600 * 1000))}j depuis` : ""}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Full credit table */}
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-bold text-foreground">Situation credit par client / وضعية الائتمان</h3>
            <div className="rounded-2xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted border-b border-border">
                      <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wide">Client</th>
                      <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wide">Encours</th>
                      <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wide">Plafond</th>
                      <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wide">Util.%</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wide">Delai</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wide">Statut</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wide">Dern.Livr.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {creditClients.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">Aucun client avec credit configure</td>
                      </tr>
                    ) : creditClients.map(c => (
                      <tr key={c.client.id}
                        className={`transition-colors ${c.isOverPlafond ? "bg-red-50" : c.isOverdue ? "bg-orange-50" : "hover:bg-muted/40"}`}>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-foreground">{c.client.nom}</p>
                          <p className="text-xs text-muted-foreground">{c.client.secteur}</p>
                        </td>
                        <td className={`px-4 py-3 text-right font-bold ${c.isOverPlafond ? "text-red-700" : c.isOverdue ? "text-orange-700" : "text-foreground"}`}>
                          {DH(c.solde)}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {c.plafond > 0 ? DH(c.plafond) : <span className="italic text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {c.plafond > 0 ? (
                            <span className={`font-bold text-xs px-2 py-0.5 rounded-full ${c.overduePct >= 100 ? "bg-red-100 text-red-700" : c.overduePct >= 80 ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
                              {c.overduePct}%
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {DELAI_RECOUVREMENT_LABELS[c.delai] ?? c.delai}
                        </td>
                        <td className="px-4 py-3">
                          {c.isOverPlafond ? (
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-100 text-red-700 border border-red-300">Hors plafond</span>
                          ) : c.isOverdue ? (
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-orange-100 text-orange-700 border border-orange-300">En retard</span>
                          ) : c.solde > 0 ? (
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-yellow-100 text-yellow-700 border border-yellow-300">En cours</span>
                          ) : (
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-green-100 text-green-700 border border-green-300">Solde</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {c.lastBLDate ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
