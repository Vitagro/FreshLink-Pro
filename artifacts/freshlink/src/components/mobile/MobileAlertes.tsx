"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { store, type User, type Client, type Commande } from "@/lib/store"
import { sendWhatsApp } from "@/lib/print"

interface Props { user: User }

interface AlertItem {
  id: string
  type: "inactivity" | "credit" | "retard_paiement" | "objectif" | "visite_sans_commande"
  severity: "high" | "medium" | "low"
  title: string
  subtitle: string
  clientId?: string
  clientNom?: string
  clientPhone?: string
  value?: string | number
  icon: string
  traite?: boolean
}

interface ArticleAlert {
  articleId: string; articleNom: string; articleNomAr?: string; famille: string
  joursAbsence: number; nbCommandesHistorique: number
  stockDisponible?: number; prixVente?: number
}

const TREATED_KEY = "fl_alertes_traitees"

function getTreated(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(TREATED_KEY) ?? "[]")) } catch { return new Set() }
}
function saveTreated(s: Set<string>) {
  localStorage.setItem(TREATED_KEY, JSON.stringify([...s]))
}

export default function MobileAlertes({ user }: Props) {
  const crossdock = store.isCrossdockMode()
  const [alerts, setAlerts]               = useState<AlertItem[]>([])
  const [filter, setFilter]               = useState<"all" | "high" | "medium" | "low">("all")
  const [showTreated, setShowTreated]     = useState(false)
  const [loading, setLoading]             = useState(true)
  const [selectedClientId, setSelectedClientId] = useState("")
  const [treated, setTreated]             = useState<Set<string>>(new Set())
  const [waStatus, setWaStatus]           = useState<Record<string, "sent">>({})

  // Reload treated from localStorage
  useEffect(() => { setTreated(getTreated()) }, [])

  const toggleTreated = useCallback((id: string) => {
    setTreated(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      saveTreated(next)
      return next
    })
  }, [])

  // ── Generate alerts ─────────────────────────────────────────────────────────
  useEffect(() => {
    const alertConfig   = store.getAlertConfig()
    const inactivityDays = alertConfig.inactivityDays ?? 30
    const allClients    = store.getVisibleClients().filter(c => c.prevendeurId === user.id || !c.prevendeurId)
    const allCommandes  = store.getVisibleCommandes()
    const allVisites    = store.getVisites()
    const today         = new Date()
    const generated: AlertItem[] = []

    // 1. Clients inactifs
    allClients.forEach(client => {
      const clientCmds = allCommandes
        .filter(c => c.clientId === client.id)
        .sort((a, b) => b.date.localeCompare(a.date))
      const lastCmd = clientCmds[0]

      if (!lastCmd) {
        generated.push({
          id: `inact_${client.id}`, type: "inactivity", severity: "high",
          title: client.nom, subtitle: "Aucune commande enregistrée — client jamais commandé",
          clientId: client.id, clientNom: client.nom,
          clientPhone: client.telephone, value: "Jamais", icon: "⚠️",
        })
        return
      }

      const diffDays = Math.floor((today.getTime() - new Date(lastCmd.date).getTime()) / 86400000)
      if (diffDays >= inactivityDays) {
        generated.push({
          id: `inact_${client.id}`, type: "inactivity",
          severity: diffDays >= inactivityDays * 2 ? "high" : "medium",
          title: client.nom,
          subtitle: `Dernière commande il y a ${diffDays} jour${diffDays > 1 ? "s" : ""}`,
          clientId: client.id, clientNom: client.nom,
          clientPhone: client.telephone, value: `J-${diffDays}`, icon: "🕐",
        })
      }
    })

    // 2. Crédit dépassé
    allClients.forEach(client => {
      const solde  = client.creditSolde ?? 0
      const plafond = client.plafondCredit ?? 0
      if (solde > 0 && plafond > 0 && solde >= plafond * 0.9) {
        generated.push({
          id: `credit_${client.id}`, type: "credit",
          severity: solde >= plafond ? "high" : "medium",
          title: client.nom,
          subtitle: solde >= plafond
            ? `Plafond dépassé — ${solde.toLocaleString("fr-MA")} / ${plafond.toLocaleString("fr-MA")} DH`
            : `90% plafond atteint — ${solde.toLocaleString("fr-MA")} / ${plafond.toLocaleString("fr-MA")} DH`,
          clientId: client.id, clientNom: client.nom,
          clientPhone: client.telephone,
          value: `${solde.toLocaleString("fr-MA")} DH`, icon: "💳",
        })
      } else if (solde > 500 && plafond === 0) {
        generated.push({
          id: `credit_nolimit_${client.id}`, type: "retard_paiement", severity: "low",
          title: client.nom,
          subtitle: `Solde impayé ${solde.toLocaleString("fr-MA")} DH — aucun plafond défini`,
          clientId: client.id, clientNom: client.nom,
          clientPhone: client.telephone,
          value: `${solde.toLocaleString("fr-MA")} DH`, icon: "💰",
        })
      }
    })

    // 3. Visites sans commande répétées
    const recentVisites = allVisites.filter(v => {
      if (v.prevendeurId !== user.id || v.resultat !== "sans_commande") return false
      const diffDays = Math.floor((today.getTime() - new Date(v.date).getTime()) / 86400000)
      return diffDays <= 7
    })
    const visiteSansCmd: Record<string, number> = {}
    recentVisites.forEach(v => { visiteSansCmd[v.clientId] = (visiteSansCmd[v.clientId] ?? 0) + 1 })
    Object.entries(visiteSansCmd).forEach(([clientId, count]) => {
      if (count < 2) return
      const client = allClients.find(c => c.id === clientId)
      if (!client) return
      generated.push({
        id: `visite_${clientId}`, type: "visite_sans_commande",
        severity: count >= 3 ? "high" : "medium",
        title: client.nom, subtitle: `${count} visites sans commande en 7 jours`,
        clientId: client.id, clientNom: client.nom,
        clientPhone: client.telephone, value: `${count}×`, icon: "🚫",
      })
    })

    // 4. Objectifs journaliers
    // store.today() (calendaire local), pas today.toISOString() (UTC) — sinon
    // une commande saisie apres minuit heure locale au Maroc (date locale
    // correcte) ne matchait plus todayStr entre 00h00 et 00h59.
    const todayStr  = store.today()
    // Exclut "refuse" (soft-delete) — meme regle que BODashboard/BORecap/MobileObjectifs.
    const todayCmds = allCommandes.filter(c => c.date === todayStr && c.commercialId === user.id && c.statut !== "refuse")
    const todayCA   = todayCmds.reduce((s, c) => s + c.lignes.reduce((t, l) => t + l.total, 0), 0)
    const todayClients = new Set(todayCmds.map(c => c.clientId)).size
    const objCA     = user.objectifJournalierCA ?? 0
    const objCli    = user.objectifJournalierClients ?? 0

    if (objCA > 0) {
      const pct = Math.round((todayCA / objCA) * 100)
      if (pct < 70) {
        generated.push({
          id: "objectif_ca", type: "objectif",
          severity: pct < 40 ? "high" : "medium",
          title: "Objectif CA journalier",
          subtitle: `${todayCA.toLocaleString("fr-MA")} DH / ${objCA.toLocaleString("fr-MA")} DH visés`,
          value: `${pct}%`, icon: "📈",
        })
      }
    }
    if (objCli > 0 && todayClients < objCli) {
      const pct = Math.round((todayClients / objCli) * 100)
      generated.push({
        id: "objectif_clients", type: "objectif",
        severity: pct < 40 ? "high" : "low",
        title: "Objectif clients journalier",
        subtitle: `${todayClients} / objectif ${objCli} clients`,
        value: `${todayClients}/${objCli}`, icon: "👤",
      })
    }

    const ORDER = { high: 0, medium: 1, low: 2 }
    generated.sort((a, b) => ORDER[a.severity] - ORDER[b.severity])
    setAlerts(generated)
    setLoading(false)
  }, [user])

  // ── WhatsApp action ─────────────────────────────────────────────────────────
  // Ouvre directement wa.me — /api/send-whatsapp n'existe pas côté serveur
  // (route jamais implémentée), l'ancien code passait systématiquement en
  // erreur. Même mécanisme que BOBonLivraison/BOHRDocuments, qui fonctionnent.
  function handleWhatsApp(alert: AlertItem) {
    if (!alert.clientPhone) return
    const message = buildWAMessage(alert)
    sendWhatsApp(alert.clientPhone, message)
    setWaStatus(s => ({ ...s, [alert.id]: "sent" }))
    setTimeout(() => setWaStatus(s => { const n = { ...s }; delete n[alert.id]; return n }), 4000)
  }

  function buildWAMessage(alert: AlertItem): string {
    const nom  = alert.clientNom ?? "Client"
    const prv  = user.name
    if (alert.type === "inactivity")
      return `Bonjour ${nom} 👋\n\nVotre commercial *${prv}* vous contacte de la part de *Vita Fresh*.\n\nNous avons remarqué que vous n'avez pas passé de commande récemment. Avez-vous besoin de quelque chose ?\n\n🌿 Vita Fresh`
    if (alert.type === "credit" || alert.type === "retard_paiement")
      return `Bonjour ${nom},\n\nUn rappel concernant votre solde en cours chez *Vita Fresh* (${alert.value}).\n\nMerci de régulariser au plus tôt ou de contacter votre commercial *${prv}*.\n\n🌿 Vita Fresh`
    if (alert.type === "visite_sans_commande")
      return `Bonjour ${nom} 👋\n\nVotre commercial *${prv}* de *Vita Fresh* vous relance suite à ses dernières visites.\n\nNous avons de belles arrivages cette semaine ! Intéressé ?\n\n🌿 Vita Fresh`
    return `Bonjour ${nom},\n\nMessage de votre commercial *${prv}* — *Vita Fresh*.\n\n🌿 Vita Fresh`
  }

  // ── Computed ─────────────────────────────────────────────────────────────────
  const activeAlerts = useMemo(() =>
    alerts.filter(a => !treated.has(a.id)),
    [alerts, treated]
  )
  const treatedAlerts = useMemo(() =>
    alerts.filter(a => treated.has(a.id)),
    [alerts, treated]
  )
  const filtered = useMemo(() => {
    const base = showTreated ? treatedAlerts : activeAlerts
    return filter === "all" ? base : base.filter(a => a.severity === filter)
  }, [activeAlerts, treatedAlerts, filter, showTreated])

  const allClientsForSelect = useMemo(() =>
    store.getVisibleClients().filter(c => c.prevendeurId === user.id || !c.prevendeurId)
      .sort((a, b) => a.nom.localeCompare(b.nom)),
    [user.id]
  )

  const articleAlerts = useMemo((): ArticleAlert[] => {
    if (!selectedClientId) return []
    // Exclut "refuse" (commande annulee/soft-supprimee) — sinon une commande
    // annulee d'un article peut faire croire qu'il vient d'etre re-livre au
    // client (lastDate mis a jour), masquant l'alerte "article absent".
    const commandes = store.getCommandes().filter(c => c.clientId === selectedClientId && c.statut !== "refuse")
    if (!commandes.length) return []
    const today    = new Date()
    const articles = store.getArticles()
    const freq: Record<string, { count: number; lastDate: string; prixVente?: number }> = {}
    commandes.forEach(cmd => {
      cmd.lignes.forEach(l => {
        if (!l.articleId) return
        const prev = freq[l.articleId]
        if (!prev || cmd.date > prev.lastDate) {
          freq[l.articleId] = { count: (prev?.count ?? 0) + 1, lastDate: cmd.date, prixVente: l.prixVente ?? l.prixUnitaire }
        } else {
          freq[l.articleId] = { ...prev, count: prev.count + 1 }
        }
      })
    })
    return Object.entries(freq).reduce<ArticleAlert[]>((acc, [artId, info]) => {
      if (info.count < 2) return acc
      const art = articles.find(a => a.id === artId)
      if (!art) return acc
      const joursAbsence = Math.floor((today.getTime() - new Date(info.lastDate).getTime()) / 86400000)
      if (joursAbsence < store.getAlertConfig().articleAbsenceJours) return acc
      acc.push({ articleId: artId, articleNom: art.nom, articleNomAr: art.nomAr, famille: art.famille ?? "", joursAbsence, nbCommandesHistorique: info.count, stockDisponible: art.stockDisponible, prixVente: info.prixVente })
      return acc
    }, []).sort((a, b) => b.joursAbsence - a.joursAbsence)
  }, [selectedClientId])

  const counts = useMemo(() => ({
    all:    activeAlerts.length,
    high:   activeAlerts.filter(a => a.severity === "high").length,
    medium: activeAlerts.filter(a => a.severity === "medium").length,
    low:    activeAlerts.filter(a => a.severity === "low").length,
  }), [activeAlerts])

  const SEVERITY_STYLE: Record<string, { bg: string; border: string; badge: string; label: string; dot: string }> = {
    high:   { bg: "bg-red-50",    border: "border-red-200",    badge: "bg-red-100 text-red-700",     label: "Urgent",    dot: "bg-red-500" },
    medium: { bg: "bg-amber-50",  border: "border-amber-200",  badge: "bg-amber-100 text-amber-700",  label: "Attention", dot: "bg-amber-500" },
    low:    { bg: "bg-blue-50",   border: "border-blue-200",   badge: "bg-blue-100 text-blue-700",    label: "Info",      dot: "bg-blue-500" },
  }
  const TYPE_LABEL: Record<string, string> = {
    inactivity: "Inactivité client", credit: "Crédit & Encours",
    retard_paiement: "Impayé", objectif: "Objectif journalier",
    visite_sans_commande: "Visite sans commande",
  }

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-muted-foreground">Analyse des alertes…</p>
    </div>
  )

  return (
    <div className="flex flex-col gap-4 p-4 pb-28">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </div>
        <div className="flex-1">
          <h2 className="font-bold text-base text-foreground">Alertes & Rappels</h2>
          <p className="text-xs text-muted-foreground">
            {counts.all === 0 ? "Aucune alerte active" : `${counts.all} alerte${counts.all > 1 ? "s" : ""} · ${counts.high > 0 ? `${counts.high} urgente${counts.high > 1 ? "s" : ""}` : "aucune urgente"}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {treatedAlerts.length > 0 && (
            <button onClick={() => setShowTreated(s => !s)}
              className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-colors ${showTreated ? "bg-slate-200 text-slate-700 border-slate-300" : "bg-white text-slate-500 border-slate-200"}`}>
              {showTreated ? `↩ Actives` : `✓ ${treatedAlerts.length} traité${treatedAlerts.length > 1 ? "s" : ""}`}
            </button>
          )}
          {counts.high > 0 && !showTreated && (
            <span className="w-6 h-6 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center animate-pulse">
              {counts.high}
            </span>
          )}
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {(["all", "high", "medium", "low"] as const).map(f => {
          const LABELS = { all: "Toutes", high: "🔴 Urgent", medium: "🟡 Attention", low: "🔵 Info" }
          const isAct  = filter === f
          return (
            <button key={f} onClick={() => setFilter(f)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors
                ${isAct
                  ? f === "high" ? "bg-red-600 text-white" : f === "medium" ? "bg-amber-500 text-white" : f === "low" ? "bg-blue-600 text-white" : "bg-slate-800 text-white"
                  : "bg-white border border-slate-200 text-slate-600"}`}>
              {LABELS[f]}{counts[f] > 0 && f !== "all" ? ` (${counts[f]})` : ""}
            </button>
          )
        })}
      </div>

      {/* Alert list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-16 h-16 rounded-2xl bg-green-50 border border-green-200 flex items-center justify-center text-3xl">✅</div>
          <p className="font-semibold text-sm text-foreground">{showTreated ? "Aucune alerte traitée" : "Tout est en ordre !"}</p>
          <p className="text-xs text-muted-foreground text-center max-w-xs">
            {showTreated ? "Aucune alerte marquée comme traitée." : "Aucune alerte active — vos clients sont bien suivis."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(alert => {
            const s         = SEVERITY_STYLE[alert.severity]
            const isTreated = treated.has(alert.id)
            const waS       = waStatus[alert.id]
            const hasPhone  = !!alert.clientPhone

            return (
              <div key={alert.id}
                className={`${s.bg} ${s.border} border rounded-2xl p-4 flex flex-col gap-2.5 ${isTreated ? "opacity-50" : ""}`}>

                {/* Main row */}
                <div className="flex items-start gap-3">
                  <span className="text-xl shrink-0 mt-0.5">{alert.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-bold text-sm text-foreground leading-tight truncate pr-1">{alert.title}</p>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.badge}`}>{s.label}</span>
                        {alert.value != null && <span className="text-xs font-mono font-bold text-slate-700">{alert.value}</span>}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground leading-snug">{alert.subtitle}</p>
                    <p className="text-[10px] text-muted-foreground/50 mt-1.5 uppercase tracking-wider font-semibold">{TYPE_LABEL[alert.type]}</p>
                  </div>
                </div>

                {/* Action buttons */}
                {!isTreated && (
                  <div className="flex gap-2 flex-wrap">

                    {/* Appel téléphonique */}
                    {hasPhone && (
                      <a href={`tel:${alert.clientPhone}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        Appeler
                      </a>
                    )}

                    {/* WhatsApp */}
                    {hasPhone && (
                      <button
                        onClick={() => handleWhatsApp(alert)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors
                          ${waS === "sent"
                            ? "bg-green-100 text-green-700 border border-green-300"
                            : "bg-[#25D366]/10 text-[#128C7E] border border-[#25D366]/30 hover:bg-[#25D366]/20"}`}>
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                        {waS === "sent" ? "Envoyé ✓" : "WhatsApp"}
                      </button>
                    )}

                    {/* Marquer traité */}
                    <button onClick={() => toggleTreated(alert.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-colors ml-auto">
                      ✓ Traité
                    </button>
                  </div>
                )}

                {/* Restore if treated */}
                {isTreated && (
                  <button onClick={() => toggleTreated(alert.id)}
                    className="text-[11px] text-slate-400 underline text-left">
                    Marquer comme active
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Section alertes articles par client */}
      <div className="flex flex-col gap-3 mt-2 border-t border-slate-100 pt-4">
        <div className="flex items-center gap-2">
          <span className="text-base">📦</span>
          <h3 className="font-bold text-sm text-foreground">Alertes articles par client</h3>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">Articles habituellement commandés mais absents depuis +{store.getAlertConfig().articleAbsenceJours} jours</p>

        <select value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-400">
          <option value="">— Sélectionner un client —</option>
          {allClientsForSelect.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>

        {selectedClientId && articleAlerts.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8">
            <span className="text-3xl">✅</span>
            <p className="text-sm font-semibold text-foreground">Tous les articles sont à jour</p>
          </div>
        )}

        {articleAlerts.length > 0 && (
          <div className="flex flex-col gap-2">
            {articleAlerts.map(a => {
              const _ac = store.getAlertConfig()
              const isUrgent = a.joursAbsence >= _ac.articleAbsenceUrgent
              const isMedium = a.joursAbsence >= _ac.articleAbsenceMedium
              const bg    = isUrgent ? "bg-red-50 border-red-200" : isMedium ? "bg-amber-50 border-amber-200" : "bg-blue-50 border-blue-200"
              const badge = isUrgent ? "bg-red-100 text-red-700" : isMedium ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
              const stockOk = (a.stockDisponible ?? 0) > 0
              return (
                <div key={a.articleId} className={`${bg} border rounded-xl p-3 flex items-start gap-3`}>
                  <span className="text-lg shrink-0">{isUrgent ? "🚨" : isMedium ? "⚠️" : "📋"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold text-sm text-foreground leading-tight">{a.articleNom}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${badge}`}>J-{a.joursAbsence}</span>
                    </div>
                    {a.articleNomAr && <p className="text-xs text-muted-foreground font-arabic" dir="rtl" lang="ar">{a.articleNomAr}</p>}
                    <p className="text-xs text-muted-foreground mt-0.5">{a.famille}</p>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      <span className="text-[10px] text-slate-500">📊 {a.nbCommandesHistorique}× commandé</span>
                      {a.prixVente != null && <span className="text-[10px] text-slate-500">💰 {a.prixVente.toLocaleString("fr-MA")} DH</span>}
                      {!crossdock && (
                        <span className={`text-[10px] font-semibold ${stockOk ? "text-green-600" : "text-red-500"}`}>
                          {stockOk ? `✓ Stock: ${a.stockDisponible} kg` : "⚠ Stock indispo"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 mt-1">
        <p className="text-[10px] text-slate-500 leading-relaxed">
          <span className="font-semibold text-red-600">Urgent</span> = action immédiate ·{" "}
          <span className="font-semibold text-amber-600">Attention</span> = sous 48h ·{" "}
          <span className="font-semibold text-blue-600">Info</span> = à surveiller
        </p>
        <p className="text-[10px] text-slate-400 mt-1">Seuil inactivité : {store.getAlertConfig().inactivityDays}j · configurable dans Paramètres</p>
      </div>
    </div>
  )
}
