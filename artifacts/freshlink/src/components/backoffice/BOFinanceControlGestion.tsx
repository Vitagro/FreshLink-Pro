"use client"
import { useState, useMemo } from "react"
import { store, type User, isSuperSuperAdmin } from "@/lib/store"
import { hasPermission } from "@/lib/permissions"

const JAWAD_EMAIL = "jawad@vita-fresh.ma"

function fmtMAD(n: number) { return new Intl.NumberFormat("fr-MA", { style: "currency", currency: "MAD", maximumFractionDigits: 0 }).format(n) }
function fmtPct(n: number) { return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%` }

const RAPPORT_EMAIL_KEY = "fl_rapport_email"
function getRapportEmail(): string {
  if (typeof window === "undefined") return "fresh.vitafresh.contact@gmail.com"
  return localStorage.getItem(RAPPORT_EMAIL_KEY) || "fresh.vitafresh.contact@gmail.com"
}

// ── Prévisionnels P&L (modifiables par Jawad seulement) ──────────────────────
const DEFAULT_PL = {
  // Revenus
  caJourCible: 45000,        // CA journalier cible (DH)
  nbClientsActifs: 120,      // Clients actifs
  panierMoyen: 375,          // Panier moyen par client (DH)
  // Achats & Matières
  tauxPA: 72,                // % du CA = coût d'achat marchandise
  tauxPertes: 3.5,           // % pertes sur achats
  // Logistique
  coutTransportJour: 2800,   // Coût transport quotidien (DH)
  coutMainoeuvre: 4500,      // Manutention / chargement (DH/jour)
  // Charges fixes mensuelles
  loyerEntrepot: 12000,
  salairesFixesMensuel: 68000,
  fraisGeneraux: 8000,
  amortissements: 5000,
  // Objectifs
  margeBrute_cible: 22,      // % marge brute cible
  cm1_cible: 18,             // CM1 cible %
  cm2_cible: 14,             // CM2 cible %
}

type PLConfig = typeof DEFAULT_PL

function calcPL(cfg: PLConfig, jours = 22) {
  const caTotal = cfg.caJourCible * jours
  const achats = caTotal * cfg.tauxPA / 100
  const pertes = achats * cfg.tauxPertes / 100
  const coutMarchandise = achats + pertes

  // CM1 = CA - Coût marchandise (marge brute)
  const cm1Val = caTotal - coutMarchandise
  const cm1Pct = (cm1Val / caTotal) * 100

  // Charges variables logistique
  const chargesVariables = (cfg.coutTransportJour + cfg.coutMainoeuvre) * jours

  // CM2 = CM1 - Charges variables
  const cm2Val = cm1Val - chargesVariables
  const cm2Pct = (cm2Val / caTotal) * 100

  // Charges fixes mensuelles
  const chargesFixes = cfg.loyerEntrepot + cfg.salairesFixesMensuel + cfg.fraisGeneraux + cfg.amortissements
  const chargesFixesJour = chargesFixes / 22

  // EBITDA = CM2 - Charges fixes
  const ebitda = cm2Val - chargesFixes
  const ebitdaPct = (ebitda / caTotal) * 100

  // Résultat net estimé (après impôts IS 20%)
  const resultAvantIS = ebitda * 0.95 // ajustement financier léger
  const is = resultAvantIS > 0 ? resultAvantIS * 0.20 : 0
  const resultNet = resultAvantIS - is
  const resultNetPct = (resultNet / caTotal) * 100

  // Point mort (CA à partir duquel on est rentable)
  const pointMortJour = chargesFixesJour / (cm2Pct / 100)
  const pointMortMois = chargesFixes / (cm2Pct / 100)

  return {
    caTotal, achats, pertes, coutMarchandise,
    cm1Val, cm1Pct, chargesVariables,
    cm2Val, cm2Pct, chargesFixes,
    ebitda, ebitdaPct,
    resultNet, resultNetPct,
    pointMortJour, pointMortMois,
    roiAnnuel: (resultNet * 12 / caTotal) * 100
  }
}

// ── Axes d'amélioration AUTO : diagnostic calculé (P&L vs cibles) ────────────
type AxeAuto = { sev: "danger" | "warn" | "ok"; titre: string; detail: string }
function autoAxes(cfg: PLConfig, pl: ReturnType<typeof calcPL>): AxeAuto[] {
  const axes: AxeAuto[] = []
  const gapCM1 = pl.cm1Pct - cfg.cm1_cible
  if (gapCM1 < 0) axes.push({ sev: gapCM1 < -3 ? "danger" : "warn", titre: "Marge brute (CM1) sous la cible",
    detail: `CM1 ${pl.cm1Pct.toFixed(1)}% vs cible ${cfg.cm1_cible}% (écart ${gapCM1.toFixed(1)} pt). Levier : baisser le taux d'achat (actuel ${cfg.tauxPA}%) d'environ ${Math.ceil(-gapCM1)} pt, ou réduire les pertes (${cfg.tauxPertes}%).` })
  else axes.push({ sev: "ok", titre: "Marge brute conforme", detail: `CM1 ${pl.cm1Pct.toFixed(1)}% ≥ cible ${cfg.cm1_cible}%.` })

  const logRatio = pl.chargesVariables / pl.caTotal * 100
  if (logRatio > 12) axes.push({ sev: logRatio > 16 ? "danger" : "warn", titre: "Coût logistique trop élevé",
    detail: `Logistique ${logRatio.toFixed(1)}% du CA (> 12%). Transport + manutention = ${fmtMAD(cfg.coutTransportJour + cfg.coutMainoeuvre)}/j : tournées groupées + LIFO + retours chargés.` })

  if (pl.resultNetPct < 8) axes.push({ sev: pl.resultNetPct < 0 ? "danger" : "warn", titre: "Résultat net sous l'objectif",
    detail: `Résultat net ${pl.resultNetPct.toFixed(1)}% (cible ≥ 8%). Agir sur la marge + charges fixes (${fmtMAD(pl.chargesFixes)}/mois).` })

  if (pl.caTotal < pl.pointMortMois) {
    const manque = pl.pointMortMois - pl.caTotal
    axes.push({ sev: "danger", titre: "Sous le point mort", detail: `CA ${fmtMAD(pl.caTotal)} < seuil ${fmtMAD(pl.pointMortMois)}. Manque ${fmtMAD(manque)}/mois ≈ ${Math.ceil(manque / cfg.panierMoyen)} commandes au panier moyen (${fmtMAD(cfg.panierMoyen)}).` })
  } else {
    axes.push({ sev: "ok", titre: "Au-dessus du point mort", detail: `Marge de sécurité ${fmtMAD(pl.caTotal - pl.pointMortMois)}/mois.` })
  }

  if (pl.roiAnnuel < 15) axes.push({ sev: pl.roiAnnuel < 0 ? "danger" : "warn", titre: "ROI annuel faible",
    detail: `ROI ${pl.roiAnnuel.toFixed(1)}% (viser ≥ 15%).` })

  const rank = { danger: 0, warn: 1, ok: 2 }
  return axes.sort((a, b) => rank[a.sev] - rank[b.sev])
}

// ── Daily Report Email ────────────────────────────────────────────────────────
async function sendDailyReport(toEmail: string) {
  const today = new Date().toISOString().split("T")[0]
  const commandes = store.getCommandes().filter((c: {date?: string}) => c.date === today)
  const bonsAchat = store.getBonsAchat().filter((b: {date?: string}) => b.date === today)
  const bls = store.getBonsLivraison ? store.getBonsLivraison().filter((b: {date?: string}) => b.date === today) : []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalVentes = commandes.reduce((s: number, c: any) => s + (c.lignes?.reduce((si: number, l: {total: number}) => si + l.total, 0) ?? 0), 0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalAchats = bonsAchat.reduce((s: number, b: any) => s + (b.lignes?.reduce((si: number, l: {quantite: number, prixUnitaire: number}) => si + l.prixUnitaire * l.quantite, 0) ?? 0), 0)
  const margeJour = totalVentes - totalAchats
  const margePct = totalVentes > 0 ? (margeJour / totalVentes * 100) : 0

  const body = `RAPPORT JOURNALIER — FreshLink Vita Fresh
Date : ${today}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 COMMERCIAL
• Commandes du jour : ${commandes.length}
• Total Ventes : ${fmtMAD(totalVentes)}

🛒 ACHATS
• Bons d'achat : ${bonsAchat.length}
• Total Achats : ${fmtMAD(totalAchats)}

💰 MARGE BRUTE DU JOUR
• Marge : ${fmtMAD(margeJour)} (${margePct.toFixed(1)}%)

🚛 LIVRAISONS
• BL du jour : ${bls.length}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Envoyé automatiquement par FreshLink Vita Fresh
© ${new Date().getFullYear()} Vita Fresh — Casablanca`

  try {
    const res = await fetch("/api/ext/rapport-journalier", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: toEmail, subject: `Rapport Journalier Vita Fresh — ${today}`, body })
    })
    const data = await res.json().catch(() => ({})) as { error?: string }
    return { ok: res.ok, error: data.error }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function BOFinanceControlGestion({ user }: { user: User }) {
  const isJawad = user.email === JAWAD_EMAIL || isSuperSuperAdmin(user)
  const [cfg, setCfg] = useState<PLConfig>(DEFAULT_PL)
  const [jours, setJours] = useState(22)
  const [editMode, setEditMode] = useState(false)
  const [sending, setSending] = useState(false)
  const [sentOk, setSentOk] = useState<boolean | null>(null)
  const [sentError, setSentError] = useState<string>("")
  const [activeTab, setActiveTab] = useState<"pl" | "kpi" | "amelio" | "rapport">("pl")
  const [rapportEmail, setRapportEmail] = useState(() => getRapportEmail())
  const [emailSaved, setEmailSaved] = useState(false)

  const pl = useMemo(() => calcPL(cfg, jours), [cfg, jours])

  const inp = "px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 w-full"
  const numInp = inp + " text-right font-mono"

  const handleSend = async () => {
    if (!hasPermission(user.role, "envoyer_rapports")) return
    setSending(true)
    const { ok, error } = await sendDailyReport(rapportEmail)
    setSentOk(ok)
    setSentError(ok ? "" : (error ?? ""))
    setSending(false)
    setTimeout(() => setSentOk(null), 6000)
  }

  const handleSaveEmail = () => {
    localStorage.setItem(RAPPORT_EMAIL_KEY, rapportEmail)
    setEmailSaved(true)
    setTimeout(() => setEmailSaved(false), 2000)
  }

  const TABS = [
    { id: "pl", label: "📊 P&L Prévisionnel" },
    { id: "kpi", label: "🎯 KPIs Opérationnels" },
    { id: "amelio", label: "💡 Axes d'Amélioration" },
    { id: "rapport", label: "📧 Rapport Journalier" },
  ] as const

  // Real daily data for dynamic axes
  const realData = useMemo(() => {
    const today = new Date().toISOString().split("T")[0]
    const commandes = store.getVisibleCommandes().filter((c: {date?: string}) => c.date === today)
    const bonsAchat = store.getBonsAchat().filter((b: {date?: string}) => b.date === today)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caToday = commandes.reduce((s: number, c: any) => s + (c.lignes?.reduce((si: number, l: {total: number}) => si + l.total, 0) ?? 0), 0)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const achatsToday = bonsAchat.reduce((s: number, b: any) => s + (b.lignes?.reduce((si: number, l: {quantite: number, prixUnitaire: number}) => si + l.prixUnitaire * l.quantite, 0) ?? 0), 0)
    const margeReel = caToday > 0 ? ((caToday - achatsToday) / caToday * 100) : 0
    const margeDiff = margeReel - cfg.cm1_cible
    return { caToday, achatsToday, margeReel, margeDiff }
  }, [cfg.cm1_cible])

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            📊 Finance & Contrôle de Gestion
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Guide prévisionnel P&L · CM1/CM2 · KPIs · Rapport journalier</p>
          {isJawad && (
            <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
              🔐 Mode Jawad — Modification autorisée
            </span>
          )}
        </div>
        {isJawad && (
          <button onClick={() => setEditMode(!editMode)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${editMode ? "bg-red-600 text-white" : "bg-emerald-600 text-white"}`}>
            {editMode ? "✅ Terminer" : "✏️ Modifier paramètres"}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors ${activeTab === t.id ? "bg-emerald-600 text-white shadow" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* P&L Tab */}
      {activeTab === "pl" && (
        <div className="flex flex-col gap-5">
          {/* Paramètres */}
          {(editMode && isJawad) && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
              <h3 className="font-bold text-blue-900 mb-4">⚙️ Paramètres P&L (modifiable par Jawad uniquement)</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { key: "caJourCible", label: "CA journalier cible (DH)", type: "number" },
                  { key: "nbClientsActifs", label: "Clients actifs", type: "number" },
                  { key: "panierMoyen", label: "Panier moyen / client (DH)", type: "number" },
                  { key: "tauxPA", label: "Taux coût achat (%)", type: "number" },
                  { key: "tauxPertes", label: "Taux pertes marchandise (%)", type: "number" },
                  { key: "coutTransportJour", label: "Coût transport / jour (DH)", type: "number" },
                  { key: "coutMainoeuvre", label: "Manutention / jour (DH)", type: "number" },
                  { key: "loyerEntrepot", label: "Loyer entrepôt / mois (DH)", type: "number" },
                  { key: "salairesFixesMensuel", label: "Salaires fixes / mois (DH)", type: "number" },
                  { key: "fraisGeneraux", label: "Frais généraux / mois (DH)", type: "number" },
                  { key: "amortissements", label: "Amortissements / mois (DH)", type: "number" },
                ].map(f => (
                  <div key={f.key} className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-blue-800">{f.label}</label>
                    <input type="number" value={(cfg as Record<string, number>)[f.key]}
                      onChange={e => setCfg({ ...cfg, [f.key]: +e.target.value })}
                      className={numInp} />
                  </div>
                ))}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-blue-800">Jours ouvrés / mois</label>
                  <input type="number" value={jours} onChange={e => setJours(+e.target.value)} className={numInp} min={1} max={31} />
                </div>
              </div>
            </div>
          )}

          {/* P&L Tableau */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="bg-slate-900 text-white px-6 py-4">
              <h3 className="font-black text-lg">📊 Compte de Résultat Prévisionnel — {jours} jours ouvrés</h3>
              <p className="text-slate-400 text-sm">Base : {fmtMAD(cfg.caJourCible)}/jour × {jours}j | {cfg.nbClientsActifs} clients actifs</p>
            </div>
            <div className="divide-y divide-slate-100">
              {[
                { label: "Chiffre d'Affaires (CA)", val: pl.caTotal, pct: 100, bold: true, color: "text-emerald-700 bg-emerald-50" },
                { label: `Coût d'achat marchandise (${cfg.tauxPA}%)`, val: -pl.achats, pct: -cfg.tauxPA, color: "text-slate-600" },
                { label: `Pertes & déchets (${cfg.tauxPertes}%)`, val: -pl.pertes, pct: -(pl.pertes/pl.caTotal*100), color: "text-orange-600" },
                { label: "━ CM1 — Marge Brute", val: pl.cm1Val, pct: pl.cm1Pct, bold: true, color: pl.cm1Pct >= cfg.cm1_cible ? "text-blue-700 bg-blue-50" : "text-red-700 bg-red-50" },
                { label: `Charges variables logistique`, val: -pl.chargesVariables, pct: -(pl.chargesVariables/pl.caTotal*100), color: "text-slate-600" },
                { label: "━ CM2 — Marge sur Coût Variable", val: pl.cm2Val, pct: pl.cm2Pct, bold: true, color: pl.cm2Pct >= cfg.cm2_cible ? "text-violet-700 bg-violet-50" : "text-red-700 bg-red-50" },
                { label: "Charges fixes mensuelles", val: -pl.chargesFixes, pct: -(pl.chargesFixes/pl.caTotal*100), color: "text-slate-600" },
                { label: "━ EBITDA", val: pl.ebitda, pct: pl.ebitdaPct, bold: true, color: pl.ebitda >= 0 ? "text-emerald-700 bg-emerald-50" : "text-red-700 bg-red-50" },
                { label: "IS estimé (20%)", val: -(pl.ebitda > 0 ? pl.ebitda * 0.95 * 0.20 : 0), pct: 0, color: "text-slate-500" },
                { label: "━━ RÉSULTAT NET", val: pl.resultNet, pct: pl.resultNetPct, bold: true, color: pl.resultNet >= 0 ? "text-emerald-800 bg-emerald-100 font-black" : "text-red-800 bg-red-100 font-black" },
              ].map((row, i) => (
                <div key={i} className={`flex items-center justify-between px-6 py-3 ${row.color || ""}`}>
                  <span className={`text-sm ${row.bold ? "font-bold" : "font-medium"}`}>{row.label}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-slate-400 w-12 text-right">{row.pct !== 0 ? `${Math.abs(row.pct).toFixed(1)}%` : ""}</span>
                    <span className={`font-mono text-sm font-bold w-32 text-right ${row.bold ? "text-base" : ""}`}>{fmtMAD(row.val)}</span>
                  </div>
                </div>
              ))}
            </div>
            {/* Point mort */}
            <div className="bg-amber-50 border-t border-amber-200 px-6 py-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-xs font-bold text-amber-800">📍 POINT MORT (Seuil de rentabilité)</p>
                  <p className="text-sm text-amber-700">Atteint à {fmtMAD(pl.pointMortMois)}/mois — {fmtMAD(pl.pointMortJour)}/jour</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-amber-800">ROI Annuel estimé</p>
                  <p className={`text-xl font-black ${pl.roiAnnuel >= 15 ? "text-emerald-700" : "text-red-700"}`}>{fmtPct(pl.roiAnnuel)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPIs Tab */}
      {activeTab === "kpi" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { label: "Taux de service livraison", val: "≥ 94%", cible: "94%", icon: "🚛", status: "ok", desc: "BL livrés / BL affectés" },
            { label: "Taux retours marchandise", val: "≤ 3.5%", cible: "3.5%", icon: "↩️", status: "ok", desc: "Retours / Total livraisons" },
            { label: "DSO — Délai encaissement", val: "≤ 21 jours", cible: "21j", icon: "💰", status: "ok", desc: "Créances clients moyennes" },
            { label: "Rotation stock", val: "1.5 à 3 jours", cible: "2j", icon: "📦", status: "ok", desc: "Produits frais max 3j" },
            { label: "Taux commandes terrain", val: "≥ 72%", cible: "72%", icon: "📋", status: "ok", desc: "Visites converties en commandes" },
            { label: "KM à vide livreurs", val: "≤ 20%", cible: "20%", icon: "🗺️", status: "ok", desc: "% KM sans chargement" },
            { label: "Marge brute / CM1", val: `≥ ${cfg.cm1_cible}%`, cible: `${cfg.cm1_cible}%`, icon: "📊", status: pl.cm1Pct >= cfg.cm1_cible ? "ok" : "nok", desc: `Actuel : ${pl.cm1Pct.toFixed(1)}%` },
            { label: "Résultat net / CA", val: `≥ 8%`, cible: "8%", icon: "💎", status: pl.resultNetPct >= 8 ? "ok" : "nok", desc: `Actuel : ${pl.resultNetPct.toFixed(1)}%` },
            { label: "Satisfaction client (NPS)", val: "≥ 4.2/5", cible: "4.2", icon: "⭐", status: "ok", desc: "Feedbacks livreurs + qualité" },
            { label: "Caisses récupérées", val: "≥ 88%", cible: "88%", icon: "📫", status: "ok", desc: "Caisses retournées par tournée" },
            { label: "Conformité qualité réception", val: "≥ 91%", cible: "91%", icon: "✅", status: "ok", desc: "Produits conformes à l'arrivée" },
            { label: "Coût logistique / CA", val: "≤ 12%", cible: "12%", icon: "⚡", status: (pl.chargesVariables/pl.caTotal*100) <= 12 ? "ok" : "nok", desc: `Actuel : ${(pl.chargesVariables/pl.caTotal*100).toFixed(1)}%` },
          ].map((kpi, i) => (
            <div key={i} className={`bg-white border rounded-xl p-4 ${kpi.status === "ok" ? "border-emerald-200" : "border-red-200"}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-slate-800">{kpi.icon} {kpi.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{kpi.desc}</p>
                </div>
                <span className={`px-2 py-1 rounded-lg text-xs font-black ${kpi.status === "ok" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                  {kpi.val}
                </span>
              </div>
              <div className="mt-2 text-xs text-slate-400">Cible : {kpi.cible}</div>
            </div>
          ))}
        </div>
      )}

      {/* Axes d'amélioration Tab */}
      {activeTab === "amelio" && (
        <div className="flex flex-col gap-4">
          {/* Situation réelle du jour */}
          {(realData.caToday > 0 || realData.achatsToday > 0) && (
            <div className={`rounded-xl p-4 border ${realData.margeDiff >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
              <p className={`text-sm font-bold mb-1 ${realData.margeDiff >= 0 ? "text-emerald-800" : "text-red-800"}`}>
                📊 Situation réelle aujourd&apos;hui — Marge : {realData.margeReel.toFixed(1)}% (cible {cfg.cm1_cible}%)
                {realData.margeDiff >= 0 ? " ✅ Objectif atteint" : ` ⚠️ Écart ${realData.margeDiff.toFixed(1)}%`}
              </p>
              <p className="text-xs text-slate-600">CA : {fmtMAD(realData.caToday)} · Achats : {fmtMAD(realData.achatsToday)}</p>
            </div>
          )}
          {/* Diagnostic prioritaire auto — calculé sur le P&L vs cibles */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">🤖 Diagnostic prioritaire (auto)</h3>
              <span className="text-xs text-slate-400">basé sur le P&amp;L · {jours} j</span>
            </div>
            <div className="p-4 flex flex-col gap-2">
              {autoAxes(cfg, pl).map((a, i) => {
                const c = a.sev === "danger" ? "bg-red-50 border-red-200" : a.sev === "warn" ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"
                const ic = a.sev === "danger" ? "🔴" : a.sev === "warn" ? "🟠" : "🟢"
                return (
                  <div key={i} className={`rounded-xl border px-4 py-3 ${c}`}>
                    <p className="text-sm font-bold text-slate-800">{ic} {a.titre}</p>
                    <p className="text-xs mt-0.5 text-slate-600">{a.detail}</p>
                  </div>
                )
              })}
            </div>
          </div>
          {[
            {
              titre: "🎯 Optimisation Achats (Impact CM1)",
              impact: "+2 à +4% de marge",
              actions: [
                "Négocier contrats cadre avec 3 fournisseurs stratégiques Doukkala → remise volume -8 à -12%",
                "Centraliser achats : 1 bon achat groupé matin au lieu de 3 passages marché = économie transport 800 DH/jour",
                "Mettre en place scoring fournisseur qualité → écarter fournisseurs < 7/10 → moins de pertes",
                "Achat prévisionnel J-1 sur base commandes confirmées → réduire sur-stock de 15 à 20%",
              ]
            },
            {
              titre: "🚛 Optimisation Logistique (Impact CM2)",
              impact: "+1.5 à +3% de marge",
              actions: [
                "Algorithme LIFO + clustering zones → réduire KM total de 15% = économie 400 DH/jour",
                "Viser 22-25 clients/livreur/jour vs 18 actuellement → +25% productivité sans coût fixe",
                "Retours systématiques avec photo IA → identifier causes → réduire retours de 3.5% à 2%",
                "Trip retour avec charge (achats fournisseur en retour) → KM vide 20% → 8%",
              ]
            },
            {
              titre: "💰 Croissance CA (Impact Revenue)",
              impact: "+20 à +40% de CA/an",
              actions: [
                "Prospecter 5 nouveaux clients/semaine via JARIRI + ZIZI → +30 clients/trimestre",
                "Upsell panier : proposer produits complémentaires à chaque commande → +15% panier moyen",
                "Fidélisation : programme points clients → taux de réachat 85% vs 70% actuel",
                "Segment CHR (hôtels 4/5★) : panier 5× moyen, fidélité forte, livraison 6h → cibler 10 hôtels",
              ]
            },
            {
              titre: "📊 Contrôle & Finance (Impact Résultat Net)",
              impact: "+3 à +5% résultat net",
              actions: [
                "Encaissement J+7 max : relance automatique WhatsApp J+5 → DSO 21j → 14j = -30% BFR",
                "Tableau de bord quotidien automatique → décisions en temps réel vs fin de mois",
                "Crédit fournisseur 30j systématique → amélioration BFR 40 000-60 000 DH",
                "Renegocier loyer entrepôt (bail 3 ans) → objectif -15% = économie 1 800 DH/mois",
              ]
            },
            {
              titre: "🌱 Différenciation & Valeur Ajoutée",
              impact: "Marge +5 à +10 points long terme",
              actions: [
                "Labellisation qualité / traçabilité → accès clients premium et export (marge +10%)",
                "Conditionnement à la demande (découpe, préemballage) → valeur ajoutée +20% sur produit",
                "Chambre froide propre → DLC +48h → moins de démarques → gain 2-3% du CA",
                "Diversification : herbes aromatiques, fruits exotiques → niches à marge > 35%",
              ]
            },
          ].map((axe, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-5 py-4 bg-slate-50 border-b border-slate-200">
                <h3 className="font-bold text-slate-900">{axe.titre}</h3>
                <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-black rounded-full">{axe.impact}</span>
              </div>
              <div className="p-5">
                <ul className="flex flex-col gap-2">
                  {axe.actions.map((a, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm text-slate-700">
                      <span className="text-emerald-500 mt-0.5 shrink-0">→</span>
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rapport journalier Tab */}
      {activeTab === "rapport" && (
        <div className="flex flex-col gap-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h3 className="font-bold text-slate-900 mb-2">📧 Rapport Journalier Automatique</h3>
            <div className="flex flex-col gap-1 mb-4">
              <label className="text-xs font-semibold text-slate-600">Adresse email destinataire</label>
              <div className="flex gap-2">
                <input type="email" value={rapportEmail} onChange={e => setRapportEmail(e.target.value)}
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                <button onClick={handleSaveEmail}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors">
                  {emailSaved ? "✓ Sauvegardé" : "Sauvegarder"}
                </button>
              </div>
              <p className="text-xs text-slate-400">Données du jour : ventes, achats, marges, livraisons, retours.</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 font-mono text-xs text-slate-600 mb-4 whitespace-pre-wrap">
{`RAPPORT JOURNALIER — FreshLink Vita Fresh
Date : ${new Date().toISOString().split("T")[0]}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 COMMERCIAL
• Commandes du jour : [N]
• Total Ventes : [XXX DH]

🛒 ACHATS
• Bons d'achat : [N]
• Total Achats : [XXX DH]

💰 MARGE BRUTE DU JOUR
• Marge : [XXX DH] ([X]%)

🚛 LIVRAISONS
• BL du jour : [N]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`}
            </div>
            <button onClick={handleSend} disabled={sending}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-colors disabled:opacity-60">
              {sending ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Envoi...</> : <>📧 Envoyer le rapport maintenant</>}
            </button>
            {sentOk === true && <p className="text-emerald-600 font-semibold text-sm mt-2">✅ Rapport envoyé à {rapportEmail}</p>}
            {sentOk === false && (
              <p className="text-red-600 text-sm mt-2">❌ Erreur d'envoi{sentError ? ` — ${sentError}` : ""}</p>
            )}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            <p className="font-bold mb-1">⚙️ Configuration email automatique</p>
            <p>
              L&apos;envoi (manuel ou automatique) passe par <code className="bg-white border border-amber-300 rounded px-1">/api/ext/send-email</code> (Resend ou Brevo — jamais de SMTP brut). Si l&apos;erreur ci-dessus persiste, vérifiez dans Vercel que <code className="bg-white border border-amber-300 rounded px-1">RESEND_API_KEY</code> ou <code className="bg-white border border-amber-300 rounded px-1">BREVO_API_KEY</code> est bien défini.
            </p>
            <p className="mt-2">Envoi automatique quotidien à 20h : déjà programmé via Vercel Cron (<code className="bg-white border border-amber-300 rounded px-1">vercel.json</code> → <code className="bg-white border border-amber-300 rounded px-1">/api/ext/rapport-journalier?send=1</code>), destinataire = <code className="bg-white border border-amber-300 rounded px-1">REPORT_EMAIL</code> (variable d&apos;env, sinon contact@vita-core.org).</p>
          </div>
        </div>
      )}
    </div>
  )
}
