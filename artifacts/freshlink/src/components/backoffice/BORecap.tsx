"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { store, type Article, type Fournisseur } from "@/lib/store"
import {
  sendEmail,
  sendEmailMulti,
  buildRecapJournalier,
  buildBesoinAchatEmail,
  buildBesoinAchatParFournisseur,
  isEmailJSConfigured,
  type BesoinLigneEmail,
  type BesoinParFournisseur,
} from "@/lib/email"

// ─── Types ──────────────────────────────────────────────────────────────────

interface DailyStats {
  date: string
  totalAchats: number
  totalCommandes: number
  totalLivraisons: number
  totalRetours: number
  totalCash: number
  marge: number
  nbBonsAchat: number
  nbCommandes: number
  nbLivraisons: number
  nbRetours: number
  creditFournisseurs: number
  nbCreditFournisseurs: number
  creditClients: number
  nbCreditClients: number
}

interface BesoinRow extends BesoinLigneEmail {
  articleId: string
  fournisseurId: string
  selected: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeStats(date: string): DailyStats {
  const bonsAchat   = store.getBonsAchat().filter(b => b.date === date)
  // "refuse" = commande annulée ou supprimée par le commercial (soft-delete,
  // cf. MobileCommercial.handleDeleteCommande) — gardée en historique mais
  // exclue de tout indicatif commercial (CA du jour ici).
  const commandes   = store.getVisibleCommandes().filter(c => c.date === date && c.statut !== "refuse")
  const bls         = store.getVisibleBonsLivraison().filter(b => b.date === date)
  const retours     = store.getRetours().filter(r => r.date === date)
  const articles    = store.getArticles()

  const totalAchats     = bonsAchat.reduce((s, b) => s + b.lignes.reduce((ls, l) => ls + l.quantite * l.prixAchat, 0), 0)
  const totalCommandes  = commandes.reduce((s, c) => s + c.lignes.reduce((ls, l) => ls + l.quantite * l.prixVente, 0), 0)
  const totalLivraisons = bls.reduce((s, b) => s + b.montantTotal, 0)
  const totalRetours    = retours.reduce((s, r) => s + r.lignes.reduce((ls, l) => {
    const art = articles.find(a => a.id === l.articleId)
    const pv = art ? (art.pvMethode === "pourcentage" ? art.prixAchat * (1 + art.pvValeur / 100) : art.pvMethode === "montant" ? art.prixAchat + art.pvValeur : art.pvValeur) : 0
    return ls + l.quantite * pv
  }, 0), 0)
  const totalCash = bls.filter(b => b.statut === "encaissé").reduce((s, b) => s + b.montantTotal, 0)
  const marge     = totalLivraisons - totalAchats

  // Crédits EN COURS (soldes actuels, non datés) — fournisseurs (dû) + clients (à recouvrer)
  let creditFournisseurs = 0, nbCreditFournisseurs = 0
  try {
    const credits = JSON.parse(localStorage.getItem("fl_credits_fournisseurs") ?? "[]") as { montant?: number; montantPaye?: number; statut?: string }[]
    const fourSet = new Set<number>()
    credits.forEach((l, i) => {
      const reste = (Number(l.montant) || 0) - (Number(l.montantPaye) || 0)
      if (l.statut !== "solde" && reste > 0) { creditFournisseurs += reste; fourSet.add(i) }
    })
    nbCreditFournisseurs = fourSet.size
  } catch { /* noop */ }
  const clientsAvecCredit = store.getVisibleClients().filter(c => (Number(c.creditSolde) || 0) > 0)
  const creditClients   = clientsAvecCredit.reduce((s, c) => s + (Number(c.creditSolde) || 0), 0)
  const nbCreditClients = clientsAvecCredit.length

  return {
    date, totalAchats, totalCommandes, totalLivraisons, totalRetours, totalCash, marge,
    nbBonsAchat: bonsAchat.length, nbCommandes: commandes.length,
    nbLivraisons: bls.length, nbRetours: retours.length,
    creditFournisseurs, nbCreditFournisseurs, creditClients, nbCreditClients,
  }
}

/** Retourne le fournisseur habituel d'un article (basé sur l'historique des bons d'achat) */
function getFournisseurHabituel(articleId: string): { id: string; nom: string; email: string } | null {
  const bons = store.getBonsAchat()
    .filter(b => b.lignes.some(l => l.articleId === articleId) && b.statut !== "brouillon")
    .sort((a, b) => b.date.localeCompare(a.date)) // plus récent en premier
  if (!bons.length) return null
  return { id: bons[0].fournisseurId, nom: bons[0].fournisseurNom, email: "" }
}

/**
 * Calcul besoin d'achat net :
 *  besoin = MAX(0, commandes prévendeurs du jour – stock disponible – retours validés)
 */
function computeBesoinRows(): BesoinRow[] {
  const articles    = store.getArticles()
  const fournisseurs = store.getFournisseurs()
  const today       = store.today()

  // Commandes actives du jour (prévendeurs)
  const commandes = store.getCommandes().filter(c =>
    c.date === today && (c.statut === "en_attente" || c.statut === "valide")
  )
  // Retours validés du jour remis en stock
  const retours = store.getRetours().filter(r =>
    r.date === today && r.statut === "validé"
  )

  return articles
    .map((art): BesoinRow => {
      const commandeTotal = commandes.reduce((s, c) => {
        const l = c.lignes.find(l => l.articleId === art.id)
        return s + (l?.quantite ?? 0)
      }, 0)
      const retourQty = retours.reduce((s, r) => {
        const l = r.lignes.find(l => l.articleId === art.id)
        return s + (l?.quantite ?? 0)
      }, 0)
      const besoinNet = Math.max(0, commandeTotal - art.stockDisponible - retourQty)

      // Trouver le fournisseur habituel
      const fHabituel = getFournisseurHabituel(art.id)
      const fournisseur = fHabituel
        ? fournisseurs.find(f => f.id === fHabituel.id) ?? null
        : null

      return {
        articleId:      art.id,
        articleNom:     art.nom,
        fournisseurId:  fournisseur?.id   ?? "inconnu",
        fournisseurNom: fournisseur?.nom  ?? "Fournisseur inconnu",
        commandeTotal,
        stockActuel:    art.stockDisponible,
        retours:        retourQty,
        besoinNet,
        unite:          art.unite,
        selected:       besoinNet > 0,
      }
    })
    .filter(r => r.commandeTotal > 0)
}

/** Regroupe les lignes besoin par fournisseur */
function groupByFournisseur(
  rows: BesoinRow[],
  fournisseurs: Fournisseur[]
): BesoinParFournisseur[] {
  const map = new Map<string, BesoinParFournisseur>()
  for (const r of rows) {
    if (!r.selected) continue
    if (!map.has(r.fournisseurId)) {
      const f = fournisseurs.find(f => f.id === r.fournisseurId)
      map.set(r.fournisseurId, {
        fournisseurNom:   r.fournisseurNom ?? "",
        fournisseurEmail: f?.email ?? "",
        lignes: [],
      })
    }
    map.get(r.fournisseurId)!.lignes.push(r)
  }
  return Array.from(map.values())
}

// ─── Composant ───────────────────────────────────────────────────────────────

export default function BORecap() {
  const today         = store.today()
  const fournisseurs  = store.getFournisseurs()
  const emailCfg      = store.getEmailConfig()

  const [selectedDate, setSelectedDate]   = useState(today)
  const [stats, setStats]                 = useState<DailyStats>(() => computeStats(today))
  const [rows, setRows]                   = useState<BesoinRow[]>(() => computeBesoinRows())
  const [activeTab, setActiveTab]         = useState<"recap" | "besoin" | "config">("recap")

  // --- Recap send state ---
  const [recapTo, setRecapTo]             = useState(emailCfg.recap)
  const [sendingRecap, setSendingRecap]   = useState(false)
  const [recapAuto, setRecapAuto]         = useState(emailCfg.recapAuto)
  const [recapHeure, setRecapHeure]       = useState(emailCfg.recapHeure)
  const [nextAutoStr, setNextAutoStr]     = useState<string | null>(null)
  const autoTimerRef                      = useRef<ReturnType<typeof setTimeout> | null>(null)

  // --- Besoin send state ---
  // Destinataires : email libre + fournisseurs avec email
  const [besoinFreeEmail, setBesoinFreeEmail] = useState(emailCfg.besoinAchat)
  const [fournisseurChecked, setFournisseurChecked] = useState<Record<string, boolean>>({})
  const [sendMode, setSendMode] = useState<"consolide" | "par_fournisseur">("consolide")
  const [sendingBesoin, setSendingBesoin] = useState(false)

  // --- Global feedback ---
  const [feedback, setFeedback]           = useState<{ type: "ok" | "err" | "warn"; msg: string } | null>(null)
  const showFeedback = (type: "ok" | "err" | "warn", msg: string) => {
    setFeedback({ type, msg })
    setTimeout(() => setFeedback(null), 7000)
  }

  // --- Config tab ---
  const [cfgEmails, setCfgEmails] = useState({ ...emailCfg })

  // Les emails partent via Resend (serveur, /api/send-email) — la config est côté
  // serveur (RESEND_API_KEY). On ne bloque donc plus sur EmailJS (supprimé) ; les
  // erreurs éventuelles (clé absente/invalide) remontent au moment de l'envoi.
  const ejsOk = true
  void isEmailJSConfigured

  const refreshAll = useCallback(() => {
    setStats(computeStats(selectedDate))
    setRows(computeBesoinRows())
  }, [selectedDate])

  useEffect(() => { refreshAll() }, [refreshAll])

  // Init fournisseurs checkbox (ceux avec email)
  useEffect(() => {
    const defaults: Record<string, boolean> = {}
    for (const f of fournisseurs) {
      if (f.email) defaults[f.id] = false
    }
    setFournisseurChecked(defaults)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto scheduler pour récap
  useEffect(() => {
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current)
    if (!recapAuto) { setNextAutoStr(null); return }
    const [h, m] = recapHeure.split(":").map(Number)
    const target = new Date()
    target.setHours(h, m, 0, 0)
    if (target <= new Date()) target.setDate(target.getDate() + 1)
    setNextAutoStr(target.toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }))
    autoTimerRef.current = setTimeout(async () => {
      const result = await sendEmail({
        to_email: recapTo,
        subject:  `Récap journalier FreshLink — ${today}`,
        body:     buildRecapJournalier(stats),
      })
      showFeedback(result.ok ? "ok" : "err", result.ok
        ? `Récap automatique envoyé à ${recapTo}`
        : `Echec envoi automatique: ${result.error}`
      )
    }, target.getTime() - Date.now())
    return () => { if (autoTimerRef.current) clearTimeout(autoTimerRef.current) }
  }, [recapAuto, recapHeure]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Envoi récap ────────────────────────────────────────────────────────────

  const handleSendRecap = async () => {
    if (!ejsOk) {
      showFeedback("err", "EmailJS non configuré. Allez dans Paramètres → EmailJS (SMTP).")
      return
    }
    setSendingRecap(true)
    const result = await sendEmail({
      to_email: recapTo,
      subject:  `Récap journalier FreshLink Pro — ${stats.date}`,
      body:     buildRecapJournalier(stats),
    })
    setSendingRecap(false)
    showFeedback(result.ok ? "ok" : "err",
      result.ok
        ? `Récap envoyé avec succès à ${recapTo}.`
        : `Erreur: ${result.error}`
    )
  }

  const saveRecapConfig = () => {
    store.saveEmailConfig({ ...emailCfg, recap: recapTo, recapAuto, recapHeure })
    showFeedback("ok", "Configuration sauvegardée.")
  }

  // ── Envoi besoin d'achat ───────────────────────────────────────────────────

  const selectedRows    = rows.filter(r => r.selected)
  const rowsWithBesoin  = selectedRows.filter(r => r.besoinNet > 0)
  const groupes         = groupByFournisseur(rows.filter(r => r.selected), fournisseurs)
  const groupesWithBesoin = groupes.filter(g => g.lignes.some(l => l.besoinNet > 0))

  const handleSendBesoin = async () => {
    if (!ejsOk) {
      showFeedback("err", "EmailJS non configuré. Allez dans Paramètres → EmailJS (SMTP).")
      return
    }
    if (rowsWithBesoin.length === 0) {
      showFeedback("warn", "Aucun article avec besoin net > 0 sélectionné.")
      return
    }

    setSendingBesoin(true)
    let totalSent = 0
    const errors: string[] = []

    if (sendMode === "consolide") {
      // Tous les destinataires sélectionnés + email libre
      const recipients: string[] = []
      if (besoinFreeEmail && besoinFreeEmail.includes("@")) recipients.push(besoinFreeEmail)
      for (const [fId, checked] of Object.entries(fournisseurChecked)) {
        if (checked) {
          const f = fournisseurs.find(x => x.id === fId)
          if (f?.email) recipients.push(f.email)
        }
      }
      if (recipients.length === 0) {
        setSendingBesoin(false)
        showFeedback("warn", "Aucun destinataire sélectionné.")
        return
      }
      const body = buildBesoinAchatEmail(rowsWithBesoin, { date: store.today() })
      const { sent, failed } = await sendEmailMulti(
        recipients,
        `Besoin d'achat net FreshLink Pro — ${store.today()}`,
        body
      )
      totalSent = sent.length
      errors.push(...failed.map(f => `${f.email}: ${f.error}`))

    } else {
      // Mode par fournisseur — un email par fournisseur
      const emailsParFournisseur = buildBesoinAchatParFournisseur(groupesWithBesoin, store.today())
      for (const item of emailsParFournisseur) {
        const dest = item.fournisseurEmail || ""
        if (!dest || !dest.includes("@")) {
          errors.push(`${item.fournisseurNom}: email manquant`)
          continue
        }
        const result = await sendEmail({ to_email: dest, subject: item.subject, body: item.body })
        if (result.ok) totalSent++
        else errors.push(`${item.fournisseurNom}: ${result.error}`)
        await new Promise(r => setTimeout(r, 400))
      }
    }

    setSendingBesoin(false)
    if (errors.length === 0) {
      showFeedback("ok", `Besoin d'achat envoyé avec succès (${totalSent} email(s)).`)
    } else if (totalSent > 0) {
      showFeedback("warn", `${totalSent} email(s) envoyé(s). Erreurs: ${errors.join(" | ")}`)
    } else {
      showFeedback("err", `Echec: ${errors.join(" | ")}`)
    }
  }

  const saveCfg = () => {
    store.saveEmailConfig(cfgEmails)
    showFeedback("ok", "Configuration emails sauvegardée.")
  }

  // ─── Aperçu email besoin ───────────────────────────────────────────────────

  const besoinPreviewText = rowsWithBesoin.length > 0
    ? buildBesoinAchatEmail(rowsWithBesoin, { date: store.today() })
    : "Aucune ligne avec besoin net sélectionnée."

  // ─── Render ───────────────────────────────────────────────────────────────

  const TABS = [
    { id: "recap" as const,  label: "Récap journalier", icon: "📊" },
    { id: "besoin" as const, label: "Besoin d'achat", icon: "🛒" },
    { id: "config" as const, label: "Configuration", icon: "⚙️" },
  ]

  return (
    <div className="flex flex-col gap-5">

      {/* EmailJS status banner */}
      {!ejsOk && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-800 text-sm">
          <svg className="w-5 h-5 shrink-0 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <span>
            <strong>EmailJS non configuré</strong> — les emails ne peuvent pas être envoyés.{" "}
            <button
              onClick={() => setActiveTab("config")}
              className="underline font-semibold hover:text-amber-900"
            >
              Configurer maintenant →
            </button>
          </span>
        </div>
      )}

      {/* Feedback banner */}
      {feedback && (
        <div className={`flex items-start gap-3 px-4 py-3 rounded-xl text-sm border font-sans ${
          feedback.type === "ok"   ? "bg-green-50 border-green-200 text-green-800" :
          feedback.type === "err"  ? "bg-red-50 border-red-200 text-red-800" :
                                     "bg-amber-50 border-amber-200 text-amber-800"
        }`}>
          {feedback.type === "ok"
            ? <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            : <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
          }
          <span className="leading-relaxed">{feedback.msg}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold font-sans transition-all ${
              activeTab === t.id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══════════════ RECAP JOURNALIER ═══════════════ */}
      {activeTab === "recap" && (
        <div className="flex flex-col gap-5">

          {/* Date picker */}
          <div className="flex items-center gap-3">
            <label className="text-sm text-muted-foreground">Date :</label>
            <input type="date" value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm font-sans focus:outline-none focus:ring-2 focus:ring-primary" />
            <button onClick={refreshAll}
              className="px-3 py-2 rounded-lg border border-border text-sm hover:bg-muted flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              Actualiser
            </button>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "Achats",       value: stats.totalAchats,     count: stats.nbBonsAchat,   color: "text-blue-600",   bg: "bg-blue-50"   },
              { label: "Commandes",    value: stats.totalCommandes,  count: stats.nbCommandes,   color: "text-indigo-600", bg: "bg-indigo-50" },
              { label: "Livraisons",   value: stats.totalLivraisons, count: stats.nbLivraisons,  color: "text-green-600",  bg: "bg-green-50"  },
              { label: "Retours",      value: stats.totalRetours,    count: stats.nbRetours,     color: "text-red-600",    bg: "bg-red-50"    },
              { label: "Cash encaissé",value: stats.totalCash,       count: null,                color: "text-emerald-600",bg: "bg-emerald-50"},
              { label: "Marge brute",  value: stats.marge,           count: null,
                color: stats.marge >= 0 ? "text-green-700" : "text-red-600",
                bg:    stats.marge >= 0 ? "bg-green-50" : "bg-red-50" },
            ].map(c => (
              <div key={c.label} className={`${c.bg} rounded-xl border border-border p-4`}>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{c.label}</p>
                <p className={`text-xl font-bold ${c.color}`}>
                  {c.value.toLocaleString("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH
                </p>
                {c.count !== null && (
                  <p className="text-xs text-muted-foreground mt-1">{c.count} opération{c.count !== 1 ? "s" : ""}</p>
                )}
              </div>
            ))}
          </div>

          {/* Email preview */}
          <div className="bg-card rounded-xl border border-border p-5">
            <h3 className="font-semibold text-foreground mb-3">Apercu de l&apos;email recap</h3>
            <pre className="text-xs text-muted-foreground font-mono bg-muted rounded-lg p-4 overflow-x-auto whitespace-pre-wrap leading-relaxed">
              {buildRecapJournalier(stats)}
            </pre>
          </div>

          {/* Send panel */}
          <div className="bg-card rounded-xl border border-border p-5 flex flex-col gap-4">
            {/* Action row: Print + WhatsApp + Email */}
            <div className="flex flex-wrap gap-2">
              {/* Print button */}
              <button
                onClick={() => {
                  const win = window.open("", "_blank", "width=700,height=600")
                  if (!win) return
                  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Recap ${stats.date}</title><style>body{font-family:Arial,sans-serif;padding:24px;font-size:11pt}pre{white-space:pre-wrap;font-family:monospace;font-size:10pt}@media print{body{padding:0}}</style></head><body><pre>${buildRecapJournalier(stats)}</pre><script>window.onload=function(){window.print()}</script></body></html>`)
                  win.document.close()
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-background text-sm font-semibold hover:bg-muted transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                Imprimer
              </button>

              {/* WhatsApp — open chat with recap text */}
              <button
                onClick={() => {
                  const text = encodeURIComponent(`*Recap journalier FreshLink — ${stats.date}*\n\nCommandes: ${stats.totalCommandes.toLocaleString("fr-MA")} DH (${stats.nbCommandes})\nLivraisons: ${stats.totalLivraisons.toLocaleString("fr-MA")} DH (${stats.nbLivraisons})\nCash: ${stats.totalCash.toLocaleString("fr-MA")} DH\nMarge: ${stats.marge.toLocaleString("fr-MA")} DH`)
                  const url = `https://wa.me/?text=${text}`
                  const a = document.createElement("a"); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; document.body.appendChild(a); a.click(); document.body.removeChild(a)
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500 text-white text-sm font-semibold hover:bg-green-600 transition-colors">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                WhatsApp immediat
              </button>
            </div>

            {/* Destinataire */}
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-sm font-medium text-foreground w-28 shrink-0">Destinataire :</label>
              <input type="email" value={recapTo} onChange={e => setRecapTo(e.target.value)}
                className="flex-1 min-w-48 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="admin@exemple.com" />
              <button onClick={handleSendRecap} disabled={sendingRecap || !ejsOk}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 shrink-0"
                style={{ background: ejsOk ? "oklch(0.38 0.2 260)" : undefined, backgroundColor: !ejsOk ? "oklch(0.65 0.01 240)" : undefined }}>
                {sendingRecap
                  ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                }
                Envoyer par email
              </button>
            </div>

            {/* Auto planification */}
            <div className="border-t border-border pt-4">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="text-sm font-medium text-foreground">Envoi automatique :</span>
                <div onClick={() => setRecapAuto(v => !v)}
                  className={`w-11 h-6 rounded-full cursor-pointer relative transition-colors ${recapAuto ? "bg-indigo-600" : "bg-muted-foreground/30"}`}>
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${recapAuto ? "left-6" : "left-1"}`} />
                </div>
                {recapAuto && (
                  <>
                    <input type="time" value={recapHeure} onChange={e => setRecapHeure(e.target.value)}
                      className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    {nextAutoStr && (
                      <span className="text-xs text-green-600 font-medium">Prochain : {nextAutoStr}</span>
                    )}
                  </>
                )}
                <button onClick={saveRecapConfig}
                  className="ml-auto px-4 py-1.5 rounded-lg border border-border text-sm hover:bg-muted transition-colors">
                  Sauvegarder
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ BESOIN D'ACHAT ═══════════════ */}
      {activeTab === "besoin" && (
        <div className="flex flex-col gap-5">

          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-semibold text-foreground">Besoin d'achat net — {today}</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Formule : Commandes prévendeurs du jour − Stock disponible − Retours validés
              </p>
            </div>
            <button onClick={refreshAll}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm hover:bg-muted">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              Recalculer
            </button>
          </div>

          {/* Tableau besoin */}
          {rows.length === 0 ? (
            <div className="bg-card rounded-xl border border-border p-10 text-center">
              <svg className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
              <p className="text-muted-foreground text-sm">Aucune commande active aujourd&apos;hui</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm font-sans">
                <thead>
                  <tr className="bg-muted">
                    <th className="px-3 py-3 w-8">
                      <input type="checkbox"
                        checked={rows.every(r => r.selected)}
                        onChange={e => setRows(prev => prev.map(r => ({ ...r, selected: e.target.checked })))}
                        className="w-4 h-4 rounded" />
                    </th>
                    {["Article", "Fournisseur", "Commandes", "Stock", "Retours", "Besoin net"].map(h => (
                      <th key={h} className="text-left px-3 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.articleId}
                      className={`border-t border-border transition-colors ${r.selected ? "bg-primary/5" : "hover:bg-muted/20"} ${!r.selected ? "opacity-60" : ""}`}>
                      <td className="px-3 py-3">
                        <input type="checkbox" checked={r.selected}
                          onChange={() => setRows(prev => prev.map(x => x.articleId === r.articleId ? { ...x, selected: !x.selected } : x))}
                          className="w-4 h-4 rounded" />
                      </td>
                      <td className="px-3 py-3 font-semibold text-foreground">{r.articleNom}</td>
                      <td className="px-3 py-3 text-muted-foreground text-xs">{r.fournisseurNom}</td>
                      <td className="px-3 py-3 text-center font-medium">{r.commandeTotal} {r.unite}</td>
                      <td className={`px-3 py-3 text-center font-semibold ${r.stockActuel === 0 ? "text-red-600" : r.stockActuel < r.commandeTotal ? "text-amber-600" : "text-green-600"}`}>
                        {r.stockActuel}
                      </td>
                      <td className="px-3 py-3 text-center text-emerald-600 font-medium">{r.retours > 0 ? `+${r.retours}` : "—"}</td>
                      <td className="px-3 py-3 text-center">
                        {r.besoinNet > 0
                          ? <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                              {r.besoinNet} {r.unite}
                            </span>
                          : <span className="text-green-600 text-xs font-semibold">Stock OK</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {rows.length > 0 && (
            <>
              {/* ── Destinataires ── */}
              <div className="bg-card rounded-xl border border-border p-5 flex flex-col gap-4">
                <h4 className="font-semibold text-foreground text-sm">Destinataires de l&apos;email</h4>

                {/* Mode d'envoi */}
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mode :</span>
                  {[
                    { id: "consolide"      as const, label: "Email consolidé (un seul email)" },
                    { id: "par_fournisseur" as const, label: "Par fournisseur (email séparé)" },
                  ].map(m => (
                    <button key={m.id} onClick={() => setSendMode(m.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        sendMode === m.id
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}>
                      {m.label}
                    </button>
                  ))}
                </div>

                {sendMode === "consolide" && (
                  <div className="flex flex-col gap-3">
                    {/* Email libre */}
                    <div className="flex items-center gap-3">
                      <label className="text-xs font-semibold text-foreground w-32 shrink-0">Email libre :</label>
                      <input type="email" value={besoinFreeEmail} onChange={e => setBesoinFreeEmail(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="acheteur@exemple.com" />
                    </div>
                    {/* Fournisseurs avec email */}
                    {fournisseurs.filter(f => f.email).length > 0 && (
                      <div className="flex flex-col gap-2">
                        <span className="text-xs font-semibold text-muted-foreground">Fournisseurs avec email :</span>
                        <div className="flex flex-wrap gap-2">
                          {fournisseurs.filter(f => f.email).map(f => (
                            <label key={f.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border hover:bg-muted cursor-pointer text-xs">
                              <input type="checkbox"
                                checked={!!fournisseurChecked[f.id]}
                                onChange={e => setFournisseurChecked(prev => ({ ...prev, [f.id]: e.target.checked }))}
                                className="w-3.5 h-3.5 rounded" />
                              <span className="font-medium text-foreground">{f.nom}</span>
                              <span className="text-muted-foreground">{f.email}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {sendMode === "par_fournisseur" && (
                  <div className="flex flex-col gap-2">
                    {groupesWithBesoin.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Aucun fournisseur avec besoin net identifié.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-border">
                        <table className="w-full text-sm">
                          <thead className="bg-muted">
                            <tr>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fournisseur</th>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email</th>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Articles</th>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Statut</th>
                            </tr>
                          </thead>
                          <tbody>
                            {groupesWithBesoin.map(g => (
                              <tr key={g.fournisseurNom} className="border-t border-border">
                                <td className="px-4 py-3 font-semibold text-foreground">{g.fournisseurNom}</td>
                                <td className="px-4 py-3 text-sm">
                                  {g.fournisseurEmail
                                    ? <span className="text-primary">{g.fournisseurEmail}</span>
                                    : <span className="text-red-500 text-xs">Email manquant</span>
                                  }
                                </td>
                                <td className="px-4 py-3 text-muted-foreground text-xs">
                                  {g.lignes.filter(l => l.besoinNet > 0).map(l => `${l.articleNom} (${l.besoinNet} ${l.unite ?? ""})`).join(", ")}
                                </td>
                                <td className="px-4 py-3">
                                  {g.fournisseurEmail
                                    ? <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">Prêt</span>
                                    : <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">Email manquant</span>
                                  }
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Bouton envoi */}
                <div className="flex items-center gap-3 pt-2 border-t border-border">
                  <button onClick={handleSendBesoin}
                    disabled={sendingBesoin || !ejsOk || rowsWithBesoin.length === 0}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: ejsOk && rowsWithBesoin.length > 0 ? "oklch(0.38 0.2 260)" : undefined,
                             backgroundColor: (!ejsOk || rowsWithBesoin.length === 0) ? "oklch(0.65 0.01 240)" : undefined }}>
                    {sendingBesoin
                      ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    }
                    {sendMode === "consolide"
                      ? `Envoyer besoin (${rowsWithBesoin.length} article${rowsWithBesoin.length !== 1 ? "s" : ""})`
                      : `Envoyer à ${groupesWithBesoin.filter(g => g.fournisseurEmail).length} fournisseur(s)`
                    }
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {rowsWithBesoin.length} article(s) avec besoin net &gt; 0 sélectionné(s)
                  </span>
                </div>
              </div>

              {/* Aperçu email */}
              <div className="bg-card rounded-xl border border-border p-5">
                <h4 className="font-semibold text-foreground mb-3">
                  Aperçu de l'email
                  {sendMode === "par_fournisseur" && " (premier fournisseur)"}
                </h4>
                <pre className="text-xs text-muted-foreground font-mono bg-muted rounded-lg p-4 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                  {sendMode === "consolide"
                    ? besoinPreviewText
                    : groupesWithBesoin[0]
                      ? buildBesoinAchatParFournisseur(groupesWithBesoin, store.today())[0]?.body ?? besoinPreviewText
                      : "Aucun groupe avec besoin net."
                  }
                </pre>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══════════════ CONFIGURATION ═══════════════ */}
      {activeTab === "config" && (
        <div className="flex flex-col gap-5">

          {/* Statut EmailJS */}
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm ${
            ejsOk
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}>
            {ejsOk
              ? <svg className="w-5 h-5 shrink-0 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              : <svg className="w-5 h-5 shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            }
            {ejsOk
              ? "Emails via Resend (serveur) — prêts à être envoyés. En cas d'échec, vérifiez RESEND_API_KEY et le domaine vérifié."
              : "Emails non disponibles."
            }
          </div>

          {/* Adresses email */}
          <div className="bg-card rounded-xl border border-border p-5 flex flex-col gap-4">
            <h3 className="font-semibold text-foreground text-sm">Adresses email de notification</h3>
            <div className="grid grid-cols-1 gap-3">
              {([
                { key: "achat"      as const, label: "Email — Validation achats",       placeholder: "acheteur@exemple.com"  },
                { key: "commercial" as const, label: "Email — Validation commandes",    placeholder: "commercial@exemple.com" },
                { key: "recap"      as const, label: "Email — Récap journalier",        placeholder: "admin@exemple.com"     },
                { key: "besoinAchat"as const, label: "Email — Besoin d'achat net",      placeholder: "acheteur@exemple.com"  },
              ]).map(f => (
                <div key={f.key} className="flex items-center gap-3 flex-wrap">
                  <label className="text-sm font-medium text-foreground w-52 shrink-0">{f.label}</label>
                  <input type="email" value={cfgEmails[f.key] as string}
                    onChange={e => setCfgEmails({ ...cfgEmails, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    className="flex-1 min-w-48 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              ))}
            </div>
          </div>

          {/* Auto */}
          <div className="bg-card rounded-xl border border-border p-5 flex flex-col gap-4">
            <h3 className="font-semibold text-foreground text-sm">Envoi automatique</h3>
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-sm text-foreground">Récap journalier auto :</span>
              <div onClick={() => setCfgEmails(c => ({ ...c, recapAuto: !c.recapAuto }))}
                className={`w-11 h-6 rounded-full cursor-pointer relative transition-colors ${cfgEmails.recapAuto ? "bg-indigo-600" : "bg-muted-foreground/30"}`}>
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${cfgEmails.recapAuto ? "left-6" : "left-1"}`} />
              </div>
              {cfgEmails.recapAuto && (
                <input type="time" value={cfgEmails.recapHeure}
                  onChange={e => setCfgEmails(c => ({ ...c, recapHeure: e.target.value }))}
                  className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              )}
            </div>
          </div>

          <button onClick={saveCfg}
            className="self-start flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: "oklch(0.38 0.2 260)" }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            Sauvegarder la configuration
          </button>
        </div>
      )}
    </div>
  )
}
