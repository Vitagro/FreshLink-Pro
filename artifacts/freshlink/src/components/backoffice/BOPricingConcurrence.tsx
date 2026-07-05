"use client"

// ══════════════════════════════════════════════════════════════════════════════
//  BOPricingConcurrence — Pricing concurrentiel (centralise PA & PV vs concurrent)
//
//   • Notre PA vs PA concurrent (synthèse achats → fl_intel_prix)
//   • Notre PV vs PV concurrent (prix de vente → fl_conc_pv)
//   • Marge concurrent = PV concurrent − PA concurrent
//   • PV IMBATTABLE proposé :
//       – notre PA ≈ PA concurrent  → PV = PV concurrent − décote (DH ou %)
//       – notre PA <  PA concurrent → PV = notre PA + marge concurrent
//       – notre PA >  PA concurrent → ⚠️ alerte achat (PA trop cher)
//   • Alerte achat si notre PA > PA concurrent (Notice → resp. achat)
//   • Diffusion des PV proposés à la force de vente (Notice + champ pvImbattable)
//
//   Données concurrent partagées entre appareils (Supabase fl_intel_prix / fl_conc_pv).
// ══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo, useCallback } from "react"
import { store, type Article, type User, type Notice } from "@/lib/store"
import { getExternalPricesByArticle } from "@/lib/extCompetitorPrices"

const LS_PRIX = "fl_intel_prix"   // CompetitorEntry[] (PA concurrent)
const LS_PV   = "fl_conc_pv"      // PV concurrent (catalogue — repli)
const LS_VENTES = "fl_conc_ventes" // factures concurrent (PV réel = PU)
const LS_PARAMS = "fl_pricing_params"

// Groupes WhatsApp de diffusion : récupérés via /api/wa-groups (route
// authentifiée), jamais hardcodés ici — sinon ils finiraient dans le bundle
// JS public (_next/static n'est pas protégé par l'auth, faille #7).
async function fetchWaGroupUrl(which: "pv" | "alert"): Promise<string> {
  try {
    const res = await fetch("/api/wa-groups", { cache: "no-store" })
    const j = await res.json() as { pv?: string; alert?: string }
    return j[which] ?? ""
  } catch { return "" }
}

interface CompetitorEntry { sku: string; prixConcurrent: number; source?: string; date?: string }
interface ConcPV { ref: string; libelle: string; unite: string; pv: number }
interface ConcVente { article: string; pu: number; qt: number; secteur: string; client: string; type: string; date: string }
interface PricingParams {
  decoteType: "dh" | "pct"; decoteVal: number; tolPA: number; margeMin: number
  // Rappel programmé (HH:MM, "" = désactivé) — prépare le message et tente
  // d'ouvrir le groupe WhatsApp tout seul à l'heure dite. Un humain doit
  // rester disponible pour coller/valider : pas d'API WhatsApp payante ici,
  // donc pas d'envoi garanti sans personne devant l'écran (cf. discussion).
  scheduleAlertHeure: string
  schedulePvHeure: string
}
const DEFAULT_PARAMS: PricingParams = { decoteType: "dh", decoteVal: 0.5, tolPA: 0.2, margeMin: 8, scheduleAlertHeure: "", schedulePvHeure: "" }
const LS_AUTOSEND_LOG = "fl_pricing_autosend_log" // { alert: "2026-07-05", pv: "2026-07-05" } — anti double-declenchement

function getJSON<T>(k: string): T[] { try { return JSON.parse(localStorage.getItem(k) ?? "[]") } catch { return [] } }
function norm(s: unknown): string {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[؀-ۿ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()
}
function money(n: number) { return `${(n || 0).toLocaleString("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH` }

async function sbPull(table: string): Promise<{ id: string; payload: Record<string, unknown> }[]> {
  try { const r = await fetch(`/api/sync-read?table=${table}`, { cache: "no-store" }); const d = await r.json(); return d.ok ? (d.data ?? []) : [] } catch { return [] }
}

interface Props { user: User }

export default function BOPricingConcurrence({ user }: Props) {
  const [articles, setArticles] = useState<Article[]>([])
  const [paMap, setPaMap] = useState<Record<string, number>>({})
  const [pvMap, setPvMap] = useState<Record<string, number>>({})
  const [params, setParams] = useState<PricingParams>(() => {
    try { return { ...DEFAULT_PARAMS, ...JSON.parse(localStorage.getItem(LS_PARAMS) ?? "{}") } } catch { return DEFAULT_PARAMS }
  })
  const [search, setSearch] = useState("")
  const [onlyAlerts, setOnlyAlerts] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [subtab, setSubtab] = useState<"comparaison" | "marge">("comparaison")
  // Meme defaut que Comparatif Données Externes (jour operationnel achat) —
  // sans ca, "PV concurrent" agregait tout l'historique au lieu du jour choisi
  // et ne correspondait jamais a la colonne "Prix Vente Iziry" de cet ecran.
  const [pricingFrom, setPricingFrom] = useState(() => store.jourOperationnel("achat"))
  const [pricingTo, setPricingTo] = useState(() => store.jourOperationnel("achat"))
  const [margeFrom, setMargeFrom] = useState("")
  const [margeTo, setMargeTo] = useState("")
  const [margeDim, setMargeDim] = useState<"article" | "secteur" | "type">("secteur")

  const inPricingRange = useCallback((d: string) => {
    const x = String(d ?? "").slice(0, 10)
    if (pricingFrom && x < pricingFrom) return false
    if (pricingTo && x > pricingTo) return false
    return true
  }, [pricingFrom, pricingTo])

  const buildMaps = useCallback(() => {
    const pa: Record<string, number[]> = {}
    getJSON<CompetitorEntry>(LS_PRIX).filter(e => (e.source ?? "") === "synthese_achats" || !e.source).filter(e => inPricingRange(e.date ?? "")).forEach(e => {
      const k = norm(e.sku); if (!k) return; (pa[k] ??= []).push(Number(e.prixConcurrent) || 0)
    })
    const paAvg: Record<string, number> = {}
    Object.entries(pa).forEach(([k, arr]) => { const v = arr.filter(x => x > 0); paAvg[k] = v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0 })
    // PV concurrent EXTRAIT DES FACTURES (PU réel, moyenne pondérée par quantité)
    const pvAgg: Record<string, { sum: number; w: number }> = {}
    getJSON<ConcVente>(LS_VENTES).filter(v => inPricingRange(v.date)).forEach(v => {
      const k = norm(v.article); const pu = Number(v.pu) || 0; const q = Number(v.qt) || 0
      if (!k || pu <= 0) return
      const w = q > 0 ? q : 1
      ;(pvAgg[k] ??= { sum: 0, w: 0 }); pvAgg[k].sum += pu * w; pvAgg[k].w += w
    })
    const pv: Record<string, number> = {}
    Object.entries(pvAgg).forEach(([k, a]) => { pv[k] = a.w ? Math.round((a.sum / a.w) * 100) / 100 : 0 })
    // Repli sur le catalogue prix-vente uniquement si la facture ne couvre pas l'article
    getJSON<ConcPV>(LS_PV).forEach(e => { const k = norm(e.libelle || e.ref); if (k && !pv[k]) pv[k] = Number(e.pv) || 0 })
    // Source prioritaire ET MEME PLAGE DE DATES que 🔗 Comparatif Données
    // Externes — sinon "PV concurrent" ne correspondait jamais à la colonne
    // "Prix Vente Iziry" de cet écran (agrégeait tout l'historique au lieu
    // du jour sélectionné).
    Object.entries(getExternalPricesByArticle(pricingFrom, pricingTo)).forEach(([k, v]) => {
      if (v.paGf > 0) paAvg[k] = v.paGf
      if (v.pvIz > 0) pv[k] = v.pvIz
    })
    setPaMap(paAvg); setPvMap(pv)
  }, [inPricingRange, pricingFrom, pricingTo])

  useEffect(() => {
    setArticles(store.getArticles())
    buildMaps()
    ;(async () => {
      try {
        const [pa, pv] = await Promise.all([sbPull(LS_PRIX), sbPull(LS_PV)])
        if (pa.length) { try { localStorage.setItem(LS_PRIX, JSON.stringify(pa.map(r => r.payload))) } catch { /* quota */ } }
        if (pv.length) { try { localStorage.setItem(LS_PV, JSON.stringify(pv.map(r => r.payload))) } catch { /* quota */ } }
        if (pa.length || pv.length) buildMaps()
      } catch { /* offline → local */ }
    })()
  }, [buildMaps])

  // Recalcule des qu'une synchro GestFlux/Iziry (Comparatif Données Externes)
  // met a jour le cache pendant la même session (sinon fige sur l'etat au montage).
  useEffect(() => {
    const onSync = () => buildMaps()
    window.addEventListener("fl_ext_sync_updated", onSync)
    return () => window.removeEventListener("fl_ext_sync_updated", onSync)
  }, [buildMaps])

  const saveParams = (p: PricingParams) => { setParams(p); try { localStorage.setItem(LS_PARAMS, JSON.stringify(p)) } catch { /* noop */ } }
  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 8000) }

  // WhatsApp groupe : les liens d'invitation ne permettent pas de pré-remplir le
  // message → on copie le texte dans le presse-papier puis on ouvre le groupe
  // pour que l'utilisateur colle (Ctrl/Cmd+V) et envoie.
  // Résultat fiable de l'envoi WhatsApp :
  //   "opened"   → l'onglet du groupe s'est bien ouvert (message copié à coller)
  //   "blocked"  → lien OK mais le navigateur a bloqué le popup
  //   "noconfig" → WA_GROUP_*_URL absent côté serveur
  // IMPORTANT : window.open doit garder l'« activation utilisateur ». Comme on
  // appelle cette fonction APRÈS des await (upsert Supabase + fetch des liens),
  // le geste est perdu et le popup serait bloqué. On ouvre donc un onglet vide
  // SYNCHRONEMENT dans le handler (waWin), puis on y charge le lien ici.
  const sendToWhatsAppGroup = async (
    which: "pv" | "alert",
    message: string,
    waWin: Window | null,
  ): Promise<"opened" | "blocked" | "noconfig"> => {
    try { await navigator.clipboard?.writeText(message) } catch { /* noop */ }
    const link = await fetchWaGroupUrl(which)
    if (!link) { try { if (waWin && !waWin.closed) waWin.close() } catch { /* noop */ } return "noconfig" }
    if (waWin && !waWin.closed) { try { waWin.location.href = link; return "opened" } catch { /* noop */ } }
    const w = (() => { try { return window.open(link, "_blank", "noopener") } catch { return null } })()
    return w ? "opened" : "blocked"
  }

  const findComp = useCallback((nom: string, map: Record<string, number>): number => {
    const k = norm(nom); if (!k) return 0
    if (map[k]) return map[k]
    for (const [mk, v] of Object.entries(map)) { if (v > 0 && (mk.includes(k) || k.includes(mk))) return v }
    return 0
  }, [])

  // Charge article (transport/manutention...) — venait de l'onglet "Marges &
  // PV stratégique" (fusionné ici) : le vrai coût de revient est PA + charge,
  // pas juste le PA brut, sinon un PV "imbattable" peut passer sous le coût réel.
  const chargesArticle = useMemo(() => { try { return store.getChargesArticle() } catch { return [] } }, [])

  type Row = ReturnType<typeof computeRow>
  const computeRow = useCallback((a: Article) => {
    const ourPA = Number(a.prixAchat) || 0
    const charge = Number(chargesArticle.find(c => c.id === a.chargeArticleId)?.montant) || 0
    const cout = ourPA + charge
    const ourPV = store.computePV(a)
    const compPA = findComp(a.nom, paMap)
    const compPV = findComp(a.nom, pvMap)
    const compMarge = (compPV > 0 && compPA > 0) ? Math.round((compPV - compPA) * 100) / 100 : null
    const decote = (base: number) => params.decoteType === "dh" ? base - params.decoteVal : base * (1 - params.decoteVal / 100)
    let pvImb = ourPV
    let strat = "—"
    // Comparaison PA vs PA concurrent : brut contre brut (apples-to-apples,
    // le concurrent a lui aussi ses propres charges non connues de nous).
    const alertePA = compPA > 0 && ourPA > compPA + params.tolPA
    if (compPA > 0 && Math.abs(ourPA - compPA) <= params.tolPA) {
      pvImb = decote(compPV > 0 ? compPV : ourPV); strat = `PA ≈ concurrent → PV concurrent − ${params.decoteType === "dh" ? params.decoteVal + " DH" : params.decoteVal + "%"}`
    } else if (compPA > 0 && ourPA < compPA) {
      pvImb = compMarge != null ? ourPA + compMarge : (compPV > 0 ? decote(compPV) : ourPV); strat = "PA < concurrent → notre PA + marge concurrent"
    } else if (alertePA) {
      pvImb = compPV > 0 ? Math.max(decote(compPV), cout * (1 + params.margeMin / 100)) : cout * (1 + params.margeMin / 100)
      strat = "⚠️ PA > concurrent (achat trop cher)"
    } else if (compPV > 0) {
      pvImb = decote(compPV); strat = "Aligné sur PV concurrent − décote"
    }
    // Le plancher est le cout REEL (PA + charge) — jamais en dessous, meme si
    // le PA brut seul aurait laisse passer un PV plus bas.
    pvImb = Math.max(pvImb, cout)
    pvImb = Math.round(pvImb * 100) / 100
    const hasComp = compPA > 0 || compPV > 0
    return { a, ourPA, charge, cout, ourPV, compPA, compPV, compMarge, pvImb, strat, alertePA, hasComp }
  }, [paMap, pvMap, params, findComp, chargesArticle])

  const rows = useMemo(() => {
    const q = norm(search)
    return articles.map(computeRow)
      .filter(r => r.hasComp)
      .filter(r => !onlyAlerts || r.alertePA)
      .filter(r => !q || norm(r.a.nom).includes(q) || norm(r.a.famille).includes(q))
      .sort((a, b) => (b.alertePA ? 1 : 0) - (a.alertePA ? 1 : 0) || a.a.nom.localeCompare(b.a.nom))
  }, [articles, computeRow, search, onlyAlerts])

  const kpis = useMemo(() => {
    const all = articles.map(computeRow).filter(r => r.hasComp)
    return {
      comparables: all.length,
      paPlusCher: all.filter(r => r.alertePA).length,
      pvPlusCher: all.filter(r => r.compPV > 0 && r.ourPV > r.compPV).length,
      gainMoyen: all.length ? all.reduce((s, r) => s + (r.ourPV - r.pvImb), 0) / all.length : 0,
    }
  }, [articles, computeRow])

  // ── Volume vendu (30j) par article — pour estimer l'impact réel (DH) d'un
  // changement de PV, pas juste un écart unitaire sans contexte de volume.
  const volMap30j = useMemo(() => {
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    const m: Record<string, number> = {}
    try {
      store.getCommandes().filter(c => c.date >= cutoff).forEach(c => {
        c.lignes.forEach(l => { m[l.articleId] = (m[l.articleId] ?? 0) + (Number(l.quantite) || 0) })
      })
    } catch { /* noop */ }
    return m
  }, [])

  // ── Regroupement par stratégie — pour les boutons "Appliquer tout" + recap gain/perte ──
  interface StratGroup { label: string; rows: Row[]; nb: number; gainDH: number; perteDH: number; diffDH: number; belowComp: number }
  const strategyGroups = useMemo((): StratGroup[] => {
    const all = articles.map(computeRow).filter(r => r.hasComp && r.strat !== "—" && r.pvImb > 0)
    const byStrat: Record<string, Row[]> = {}
    all.forEach(r => { (byStrat[r.strat] ??= []).push(r) })
    return Object.entries(byStrat).map(([label, grpRows]) => {
      let gainDH = 0, perteDH = 0, belowComp = 0
      grpRows.forEach(r => {
        const vol = volMap30j[r.a.id] ?? 0
        const impact = (r.pvImb - r.ourPV) * vol
        if (impact > 0) gainDH += impact
        else if (impact < 0) perteDH += -impact
        if (r.compPV > 0 && r.pvImb < r.compPV) belowComp++
      })
      return { label, rows: grpRows, nb: grpRows.length, gainDH, perteDH, diffDH: gainDH - perteDH, belowComp }
    }).sort((a, b) => b.nb - a.nb)
  }, [articles, computeRow, volMap30j])

  const applyStrategyGroup = async (group: StratGroup) => {
    if (group.belowComp > 0) {
      const ok = window.confirm(
        `⚠️ ${group.belowComp} article(s) sur ${group.nb} dans « ${group.label} » seront vendus MOINS CHER que le concurrent.\n\nAppliquer le nouveau PV à la totalité des ${group.nb} article(s) de cette stratégie ?`
      )
      if (!ok) return
    } else if (!window.confirm(`Appliquer le nouveau PV à la totalité des ${group.nb} article(s) de « ${group.label} » ?`)) {
      return
    }
    setBusy(true)
    const all = store.getArticles()
    const touchedIds: string[] = []
    group.rows.forEach(r => {
      const idx = all.findIndex(x => x.id === r.a.id)
      if (idx < 0) return
      all[idx] = { ...all[idx], pvMethode: "manuel", pvValeur: r.pvImb, pvImbattable: r.pvImb, pvImbattableMaj: new Date().toISOString() }
      touchedIds.push(r.a.id)
    })
    store.saveArticles(all); setArticles(all)
    try {
      const { upsertArticle } = await import("@/lib/supabase/db")
      for (const id of touchedIds) { const art = all.find(a => a.id === id); if (art) await upsertArticle(art) }
    } catch { /* offline */ }
    setBusy(false)
    flash(true, `✅ ${touchedIds.length} article(s) mis à jour pour « ${group.label} ».`)
  }

  // ── Classification "type client" : on matche le nom du client de la facture
  //    concurrent avec NOTRE base clients pour déduire CHR / Marchand / Particulier.
  const clientCat = useMemo(() => {
    const m: Record<string, string> = {}
    try {
      store.getClients().forEach(c => {
        const k = norm(c.nom); if (!k) return
        const cat = String((c as unknown as { categorie?: string; type?: string }).categorie ?? (c as unknown as { type?: string }).type ?? "")
        if (cat) m[k] = cat
      })
    } catch { /* noop */ }
    return m
  }, [])
  const classifyClient = useCallback((nom: string): string => {
    const k = norm(nom); if (!k) return "Autre"
    let cat = clientCat[k]
    if (!cat) { for (const mk in clientCat) { if (mk && (mk.includes(k) || k.includes(mk))) { cat = clientCat[mk]; break } } }
    if (!cat) return "Autre (non identifié)"
    if (/chr|horeca|hotel|resto|caf/i.test(cat)) return "CHR / HORECA"
    if (/marchand|grossiste|revend/i.test(cat)) return "Marchand"
    if (/particulier/i.test(cat)) return "Particulier"
    return cat
  }, [clientCat])

  // ── Marge concurrent par dimension (article / secteur / type client) ────────
  // Marge ligne = (PU facture − PA concurrent de l'article) × quantité.
  const margeData = useMemo(() => {
    const ventes = getJSON<ConcVente>(LS_VENTES).filter(v => {
      const d = String(v.date ?? "").slice(0, 10)
      if (margeFrom && d < margeFrom) return false
      if (margeTo && d > margeTo) return false
      return true
    })
    const dim = (sel: (v: ConcVente) => string) => {
      const m: Record<string, { ca: number; cout: number; marge: number; vol: number }> = {}
      ventes.forEach(v => {
        const pa = findComp(v.article, paMap)
        const pu = Number(v.pu) || 0, q = Number(v.qt) || 0
        if (pu <= 0) return
        const k = (sel(v) || "—").trim() || "—"
        ;(m[k] ??= { ca: 0, cout: 0, marge: 0, vol: 0 })
        m[k].ca += pu * q
        if (pa > 0) { m[k].cout += pa * q; m[k].marge += (pu - pa) * q }
        m[k].vol += q
      })
      return Object.entries(m).map(([k, val]) => ({ k, ...val, margePct: val.ca ? (val.marge / val.ca) * 100 : 0 }))
        .sort((a, b) => b.marge - a.marge)
    }
    return { byArticle: dim(v => v.article), bySecteur: dim(v => v.secteur), byType: dim(v => classifyClient(v.client)), n: ventes.length }
  }, [paMap, margeFrom, margeTo, findComp, classifyClient])

  const addNotice = (titre: string, contenu: string, destinataire: string, type: Notice["type"]) => {
    store.addNotice({
      id: `NOTE_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      titre, contenu, auteurId: user.id, auteurNom: user.name,
      date: new Date().toISOString(), type, statut: "ouvert", destinataire,
    })
  }

  const diffuserPV = async (auto = false) => {
    const cible = rows.filter(r => r.pvImb > 0)
    if (cible.length === 0) { if (!auto) flash(false, "Aucun PV à diffuser."); return }
    if (!auto && !window.confirm(`Diffuser ${cible.length} PV imbattable(s) à la force de vente ?\nLes prévendeurs verront ces prix conseillés.`)) return
    // Onglet ouvert MAINTENANT (geste utilisateur encore actif) — rempli après les await.
    // En mode auto (déclenché par le planificateur, sans clic), pas de geste
    // utilisateur : le navigateur bloquera très probablement le popup — c'est
    // pris en charge (waRes === "blocked" → message copié quand même).
    const waWin = auto ? null : (() => { try { return window.open("about:blank", "_blank") } catch { return null } })()
    setBusy(true)
    const now = new Date().toISOString()
    const all = store.getArticles()
    const ids: string[] = []
    cible.forEach(r => {
      const idx = all.findIndex(x => x.id === r.a.id)
      if (idx >= 0) { all[idx] = { ...all[idx], pvImbattable: r.pvImb, pvImbattableMaj: now }; ids.push(r.a.id) }
    })
    store.saveArticles(all); setArticles(all)
    try {
      const { upsertArticle } = await import("@/lib/supabase/db")
      for (const id of ids) { const art = all.find(a => a.id === id); if (art) await upsertArticle(art) }
    } catch { /* offline */ }
    const top = cible.slice(0, 40).map(r => `• ${r.a.nom} : ${money(r.pvImb)}`).join("\n")
    const corps = `${cible.length} prix de vente conseillés diffusés par ${user.name}.\n\n${top}${cible.length > 40 ? `\n… +${cible.length - 40} autres` : ""}`
    addNotice(auto ? "💰 Nouveaux PV conseillés (imbattables) — rappel programmé" : "💰 Nouveaux PV conseillés (imbattables)", corps, "commercial", "notice")
    // Diffusion WhatsApp → groupe force de vente
    const waRes = await sendToWhatsAppGroup("pv", `💰 *PV conseillés Vita Fresh* — ${new Date().toLocaleDateString("fr-MA")}\n\n${top}${cible.length > 40 ? `\n… +${cible.length - 40} autres` : ""}`, waWin)
    setBusy(false)
    flash(waRes === "opened",
      waRes === "opened"
        ? `✅ ${cible.length} PV diffusés. Message copié → collez-le (Ctrl+V) dans le groupe WhatsApp qui vient de s'ouvrir.`
        : waRes === "blocked"
        ? `⚠️ ${cible.length} PV diffusés en interne. ${auto ? "Rappel programmé : ouvrez le groupe WhatsApp et collez (Ctrl+V), le message est déjà copié." : "Le navigateur a bloqué l'ouverture de WhatsApp — autorisez les popups pour ce site, le message est déjà copié (Ctrl+V dans le groupe)."}`
        : `⚠️ ${cible.length} PV diffusés en interne (notice envoyée aux prévendeurs) mais le groupe WhatsApp n'est pas configuré côté serveur (WA_GROUP_PV_URL manquant côté serveur) — rien n'a été envoyé sur WhatsApp.`)
  }

  const alerterAchat = async (auto = false) => {
    const cible = articles.map(computeRow).filter(r => r.alertePA)
    if (cible.length === 0) { if (!auto) flash(false, "Aucun écart PA défavorable détecté."); return }
    if (!auto && !window.confirm(`Envoyer une alerte à l'équipe achat pour ${cible.length} article(s) où notre PA > PA concurrent ?`)) return
    // Onglet ouvert MAINTENANT (geste utilisateur encore actif) — rempli après les await.
    const waWin = auto ? null : (() => { try { return window.open("about:blank", "_blank") } catch { return null } })()
    const lignes = cible.slice(0, 40).map(r => `• ${r.a.nom} : notre PA ${money(r.ourPA)} > concurrent ${money(r.compPA)} (écart +${money(r.ourPA - r.compPA)})`).join("\n")
    const corps = `${cible.length} article(s) où notre prix d'achat dépasse celui du concurrent — à renégocier.\n\n${lignes}${cible.length > 40 ? `\n… +${cible.length - 40} autres` : ""}`
    addNotice(auto ? "⚠️ PA plus cher que le concurrent — rappel programmé" : "⚠️ PA plus cher que le concurrent", corps, "resp_achat", "reclamation")
    // Alerte WhatsApp → groupe achat
    const waRes = await sendToWhatsAppGroup("alert", `⚠️ *Alerte achat — PA trop cher* — ${new Date().toLocaleDateString("fr-MA")}\n\n${corps}`, waWin)
    flash(waRes === "opened",
      waRes === "opened"
        ? `🚨 Alerte envoyée pour ${cible.length} article(s). Message copié → collez-le (Ctrl+V) dans le groupe WhatsApp achat ouvert.`
        : waRes === "blocked"
        ? `⚠️ Alerte envoyée en interne pour ${cible.length} article(s). ${auto ? "Rappel programmé : ouvrez le groupe WhatsApp et collez (Ctrl+V), le message est déjà copié." : "Le navigateur a bloqué l'ouverture de WhatsApp — autorisez les popups, le message est déjà copié (Ctrl+V dans le groupe)."}`
        : `⚠️ Alerte envoyée en interne (notice à l'équipe achat) pour ${cible.length} article(s) mais le groupe WhatsApp n'est pas configuré côté serveur (WA_GROUP_ALERT_URL manquant côté serveur) — rien n'a été envoyé sur WhatsApp.`)
  }

  // ── Rappel programmé : verifie chaque minute si l'heure configuree est
  // atteinte, et declenche au plus une fois par jour et par type (alert/pv).
  // Necessite qu'un back-office reste ouvert sur cet ecran a l'heure dite —
  // pas d'envoi garanti sans personne devant l'ecran (pas d'API WhatsApp
  // payante branchee ici, cf. discussion avec Jawad).
  useEffect(() => {
    const check = () => {
      if (!params.scheduleAlertHeure && !params.schedulePvHeure) return
      const now = new Date()
      const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
      const today = store.today()
      let log: Record<string, string> = {}
      try { log = JSON.parse(localStorage.getItem(LS_AUTOSEND_LOG) ?? "{}") } catch { /* noop */ }
      if (params.scheduleAlertHeure && params.scheduleAlertHeure === hhmm && log.alert !== today) {
        log.alert = today
        try { localStorage.setItem(LS_AUTOSEND_LOG, JSON.stringify(log)) } catch { /* quota */ }
        void alerterAchat(true)
      }
      if (params.schedulePvHeure && params.schedulePvHeure === hhmm && log.pv !== today) {
        log.pv = today
        try { localStorage.setItem(LS_AUTOSEND_LOG, JSON.stringify(log)) } catch { /* quota */ }
        void diffuserPV(true)
      }
    }
    const id = setInterval(check, 30000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.scheduleAlertHeure, params.schedulePvHeure, rows, articles])

  const appliquerPV = async (r: Row) => {
    const all = store.getArticles()
    const idx = all.findIndex(x => x.id === r.a.id)
    if (idx < 0) return
    all[idx] = { ...all[idx], pvMethode: "manuel", pvValeur: r.pvImb, pvImbattable: r.pvImb, pvImbattableMaj: new Date().toISOString() }
    store.saveArticles(all); setArticles(all)
    try { const { upsertArticle } = await import("@/lib/supabase/db"); await upsertArticle(all[idx]) } catch { /* offline */ }
    flash(true, `✅ PV de « ${r.a.nom} » fixé à ${money(r.pvImb)} (appliqué).`)
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl bg-gradient-to-br from-indigo-700 via-indigo-800 to-slate-900 p-5 text-white">
        <h2 className="text-lg font-black">🎯 Pricing concurrentiel</h2>
        <p className="text-sm text-white/75 mt-1">Notre PA/PV vs concurrent · marge concurrent · PV imbattable · alerte achat · diffusion force de vente.</p>
      </div>

      {msg && <div className={`px-4 py-2.5 rounded-xl text-sm font-semibold shadow ${msg.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>{msg.text}</div>}

      {/* Sous-onglets */}
      <div className="flex gap-2">
        {([["comparaison", "📊 Comparaison PA / PV"], ["marge", "📈 Marge concurrent"]] as [typeof subtab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setSubtab(k)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${subtab === k ? "bg-indigo-700 text-white" : "bg-white text-slate-600 border border-slate-200"}`}>{l}</button>
        ))}
      </div>

      {subtab === "comparaison" && (<>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold text-slate-600">Du</label>
          <input type="date" value={pricingFrom} onChange={e => setPricingFrom(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold text-slate-600">Au</label>
          <input type="date" value={pricingTo} onChange={e => setPricingTo(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm" />
        </div>
        <button onClick={() => { const t = store.jourOperationnel("achat"); setPricingFrom(t); setPricingTo(t) }}
          className="px-3 py-2.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200">Aujourd&apos;hui</button>
        <p className="text-[11px] text-slate-400 flex-1 min-w-[220px]">PA/PV concurrent = même plage que 🔗 Comparatif Données Externes (par défaut : aujourd&apos;hui).</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { l: "Articles comparables", v: String(kpis.comparables), i: "🔎", c: "text-slate-900" },
          { l: "PA + cher que concurrent", v: String(kpis.paPlusCher), i: "⚠️", c: kpis.paPlusCher > 0 ? "text-red-600" : "text-slate-900" },
          { l: "PV + cher que concurrent", v: String(kpis.pvPlusCher), i: "📈", c: kpis.pvPlusCher > 0 ? "text-amber-600" : "text-slate-900" },
          { l: "Baisse PV moyenne (imbattable)", v: money(kpis.gainMoyen), i: "🏷️", c: "text-indigo-700" },
        ].map(k => (
          <div key={k.l} className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-xl">{k.i}</div>
            <div className="min-w-0"><p className="text-[11px] text-slate-500 truncate">{k.l}</p><p className={`text-lg font-black ${k.c}`}>{k.v}</p></div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold text-indigo-800">Décote PV imbattable</label>
          <div className="flex gap-1">
            <select value={params.decoteType} onChange={e => saveParams({ ...params, decoteType: e.target.value as "dh" | "pct" })}
              className="px-2 py-2 rounded-lg border border-indigo-200 bg-white text-sm">
              <option value="dh">− DH</option><option value="pct">− %</option>
            </select>
            <input type="number" step="0.01" value={params.decoteVal} onChange={e => saveParams({ ...params, decoteVal: Number(e.target.value) || 0 })}
              className="w-20 px-2 py-2 rounded-lg border border-indigo-200 bg-white text-sm text-center font-bold" />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold text-indigo-800">Tolérance « PA égal » (DH)</label>
          <input type="number" step="0.01" value={params.tolPA} onChange={e => saveParams({ ...params, tolPA: Number(e.target.value) || 0 })}
            className="w-24 px-2 py-2 rounded-lg border border-indigo-200 bg-white text-sm text-center" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold text-indigo-800">Marge mini plancher (%)</label>
          <input type="number" step="1" value={params.margeMin} onChange={e => saveParams({ ...params, margeMin: Number(e.target.value) || 0 })}
            className="w-20 px-2 py-2 rounded-lg border border-indigo-200 bg-white text-sm text-center" />
        </div>
        <div className="flex-1" />
        <button onClick={() => alerterAchat()} className="px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700">
          🚨 Alerter achat (PA trop cher)
        </button>
        <button onClick={() => diffuserPV()} disabled={busy} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50">
          {busy ? "⏳…" : "📤 Diffuser PV à la force de vente"}
        </button>
      </div>

      {/* ── Rappel programmé (gratuit) : necessite un back-office ouvert sur
          cet ecran a l'heure dite — pas d'API WhatsApp payante branchee. ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold text-slate-600">⏰ Rappel alerte achat (auto)</label>
          <input type="time" value={params.scheduleAlertHeure} onChange={e => saveParams({ ...params, scheduleAlertHeure: e.target.value })}
            className="w-28 px-2 py-2 rounded-lg border border-slate-200 bg-white text-sm text-center" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold text-slate-600">⏰ Rappel diffusion PV (auto)</label>
          <input type="time" value={params.schedulePvHeure} onChange={e => saveParams({ ...params, schedulePvHeure: e.target.value })}
            className="w-28 px-2 py-2 rounded-lg border border-slate-200 bg-white text-sm text-center" />
        </div>
        {(params.scheduleAlertHeure || params.schedulePvHeure) && (
          <button onClick={() => saveParams({ ...params, scheduleAlertHeure: "", schedulePvHeure: "" })}
            className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 pb-2">✕ Désactiver</button>
        )}
        <p className="text-[11px] text-slate-400 flex-1 min-w-[240px]">À l&apos;heure choisie, si un back-office reste ouvert sur cet écran, le message est préparé et le groupe WhatsApp s&apos;ouvre automatiquement (une personne doit rester disponible pour coller/valider — pas d&apos;envoi 100% automatique sans API WhatsApp payante).</p>
      </div>

      {/* ── Stratégies de pricing — appliquer en masse + recap gain/perte ── */}
      {strategyGroups.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-black text-slate-800">🎯 Stratégies de pricing — vue d&apos;ensemble</h3>
            <span className="text-[11px] text-slate-400">Impact estimé sur le volume vendu des 30 derniers jours</span>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {strategyGroups.map(g => {
              const total = g.gainDH + g.perteDH
              const gainPct = total > 0 ? (g.gainDH / total) * 100 : 50
              return (
                <div key={g.label} className="rounded-2xl border border-slate-200 p-4 flex flex-col gap-2.5">
                  <p className="text-xs font-bold text-slate-700 leading-snug">{g.label}</p>
                  <p className="text-[11px] text-slate-400">{g.nb} article(s){g.belowComp > 0 ? ` · ⚠️ ${g.belowComp} sous le prix concurrent` : ""}</p>

                  {/* Remplissage gain vs perte */}
                  <div className="h-2 rounded-full bg-red-100 overflow-hidden flex">
                    <div className="h-full bg-emerald-500" style={{ width: `${gainPct}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-emerald-700 font-bold">+{money(g.gainDH)}</span>
                    <span className="text-red-600 font-bold">−{money(g.perteDH)}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                    <span className="text-xs font-bold text-slate-600">Différence (gain − perte)</span>
                    <span className={`text-sm font-black ${g.diffDH >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                      {g.diffDH >= 0 ? "+" : ""}{money(g.diffDH)}
                    </span>
                  </div>
                  <button onClick={() => applyStrategyGroup(g)} disabled={busy}
                    className="mt-1 px-3 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold hover:bg-slate-900 disabled:opacity-50">
                    Appliquer tout ({g.nb})
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher article / famille…"
          className="flex-1 min-w-[200px] px-3 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50" />
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <input type="checkbox" checked={onlyAlerts} onChange={e => setOnlyAlerts(e.target.checked)} className="w-4 h-4 accent-red-600" />
          Seulement les alertes PA
        </label>
        <span className="text-xs text-slate-400">{rows.length} ligne(s)</span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
          <p className="text-4xl mb-2">📭</p>
          <p className="font-semibold">Aucune donnée concurrent.</p>
          <p className="text-sm mt-1">Importe d&apos;abord les fichiers (Concurrence &amp; Perf. → 📥 Import Excel).</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm min-w-[1000px]">
            <thead>
              <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-3">Article</th>
                <th className="px-3 py-3 text-right">Notre PA</th>
                <th className="px-3 py-3 text-right" title="Prix d'achat + charge article (transport/manutention...)">Coût réel</th>
                <th className="px-3 py-3 text-right">PA concurrent</th>
                <th className="px-3 py-3 text-right">Notre PV</th>
                <th className="px-3 py-3 text-right">PV concurrent</th>
                <th className="px-3 py-3 text-right">Marge conc.</th>
                <th className="px-3 py-3 text-right">PV imbattable</th>
                <th className="px-3 py-3">Stratégie</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.a.id} className={`border-t border-slate-100 ${r.alertePA ? "bg-red-50/50" : ""}`}>
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-slate-900">{r.a.nom}</p>
                    <p className="text-[11px] text-slate-400">{r.a.famille}</p>
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-slate-700">{money(r.ourPA)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-500">{r.charge > 0 ? money(r.cout) : "—"}</td>
                  <td className={`px-3 py-2.5 text-right font-semibold ${r.alertePA ? "text-red-600" : r.compPA > 0 && r.ourPA < r.compPA ? "text-emerald-600" : "text-slate-700"}`}>
                    {r.compPA > 0 ? money(r.compPA) : "—"}
                    {r.alertePA && <span className="block text-[10px] font-bold">⚠️ +{money(r.ourPA - r.compPA)}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-700">{money(r.ourPV)}</td>
                  <td className={`px-3 py-2.5 text-right ${r.compPV > 0 && r.ourPV > r.compPV ? "text-amber-600 font-semibold" : "text-slate-700"}`}>{r.compPV > 0 ? money(r.compPV) : "—"}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{r.compMarge != null ? money(r.compMarge) : "—"}</td>
                  <td className="px-3 py-2.5 text-right"><span className="inline-block px-2 py-1 rounded-lg bg-indigo-100 text-indigo-800 font-black">{money(r.pvImb)}</span></td>
                  <td className="px-3 py-2.5 text-[11px] text-slate-500 max-w-[200px]">{r.strat}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button onClick={() => appliquerPV(r)} title="Fixer ce PV comme prix de vente de l'article"
                      className="text-[11px] px-2 py-1 rounded-md bg-slate-900 text-white font-semibold hover:bg-slate-700">Appliquer</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-slate-400 leading-relaxed">
        💡 PA concurrent vient de « synthèse achats » ; PV concurrent <strong>extrait des factures</strong> (prix unitaire réel, moyenne pondérée) — onglet Import Excel.
        Données partagées entre appareils (Supabase). « Diffuser » enregistre le <strong>PV conseillé</strong> + notifie la force de vente + WhatsApp. « Appliquer » fixe le PV de vente.
      </p>
      </>)}

      {/* ── MARGE CONCURRENT par article / secteur / type ─────────────────── */}
      {subtab === "marge" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-slate-600">Répartir par</label>
              <select value={margeDim} onChange={e => setMargeDim(e.target.value as "article" | "secteur" | "type")}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm">
                <option value="secteur">Secteur</option>
                <option value="type">Type client</option>
                <option value="article">Produit</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-slate-600">Du</label>
              <input type="date" value={margeFrom} onChange={e => setMargeFrom(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-slate-600">Au</label>
              <input type="date" value={margeTo} onChange={e => setMargeTo(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm" />
            </div>
            {(margeFrom || margeTo) && (
              <button onClick={() => { setMargeFrom(""); setMargeTo("") }} className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 pb-2">↺ Réinitialiser</button>
            )}
            <span className="text-xs text-slate-400 pb-2">{margeData.n} ligne(s) facture</span>
          </div>

          {(() => {
            const rows = margeDim === "article" ? margeData.byArticle : margeDim === "type" ? margeData.byType : margeData.bySecteur
            if (rows.length === 0) return (
              <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
                <p className="text-4xl mb-2">📈</p>
                <p className="font-semibold">Aucune facture concurrent sur cette période.</p>
                <p className="text-sm mt-1">Importe la facturation (Import Excel) pour calculer la marge concurrent.</p>
              </div>
            )
            const tot = rows.reduce((a, r) => ({ ca: a.ca + r.ca, cout: a.cout + r.cout, marge: a.marge + r.marge, vol: a.vol + r.vol }), { ca: 0, cout: 0, marge: 0, vol: 0 })
            return (
              <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
                <table className="w-full text-sm min-w-[760px]">
                  <thead>
                    <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-3">{margeDim === "article" ? "Produit" : margeDim === "type" ? "Type client" : "Secteur"}</th>
                      <th className="px-3 py-3 text-right">CA concurrent</th>
                      <th className="px-3 py-3 text-right">Coût (PA)</th>
                      <th className="px-3 py-3 text-right">Marge</th>
                      <th className="px-3 py-3 text-right">Marge %</th>
                      <th className="px-3 py-3 text-right">Volume</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 60).map(r => (
                      <tr key={r.k} className="border-t border-slate-100">
                        <td className="px-3 py-2.5 font-semibold text-slate-800">{r.k}</td>
                        <td className="px-3 py-2.5 text-right text-slate-700">{money(r.ca)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-500">{money(r.cout)}</td>
                        <td className={`px-3 py-2.5 text-right font-bold ${r.marge >= 0 ? "text-emerald-700" : "text-red-600"}`}>{money(r.marge)}</td>
                        <td className={`px-3 py-2.5 text-right font-semibold ${r.margePct >= 0 ? "text-emerald-700" : "text-red-600"}`}>{r.margePct.toFixed(1)}%</td>
                        <td className="px-3 py-2.5 text-right text-slate-500">{r.vol.toLocaleString("fr-MA", { maximumFractionDigits: 0 })}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                      <td className="px-3 py-3 text-slate-900">TOTAL</td>
                      <td className="px-3 py-3 text-right">{money(tot.ca)}</td>
                      <td className="px-3 py-3 text-right">{money(tot.cout)}</td>
                      <td className={`px-3 py-3 text-right ${tot.marge >= 0 ? "text-emerald-700" : "text-red-600"}`}>{money(tot.marge)}</td>
                      <td className="px-3 py-3 text-right">{tot.ca ? (tot.marge / tot.ca * 100).toFixed(1) : "0"}%</td>
                      <td className="px-3 py-3 text-right">{tot.vol.toLocaleString("fr-MA", { maximumFractionDigits: 0 })}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )
          })()}
          <p className="text-[11px] text-slate-400">📈 Marge concurrent = (PV facture − PA concurrent de l&apos;article) × quantité, agrégée par {margeDim === "article" ? "produit" : margeDim === "type" ? "type client" : "secteur"} sur la période choisie.</p>
        </div>
      )}
    </div>
  )
}
