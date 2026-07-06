"use client"

import { useMemo, useState } from "react"
import { store } from "@/lib/store"

// ══════════════════════════════════════════════════════════════════════════════
// Rapport Besoin Marché — planification de l'achat du jour
//
//  • Agrège les commandes des prévendeurs (mobile) → demande par article
//  • Calcule le besoin net (demande − stock) via store.computeBesoinNet()
//  • Estime l'ESPÈCE nécessaire = Σ besoin × PA moyen (historique d'achat)
//  • Calcule le nombre de camions "Honda" = ⌈tonnage / capacité⌉
//  • Estime l'HEURE DE DÉPART recommandée selon le tonnage
//  • Génère une ALERTE WhatsApp / notification pour prévenir l'équipe
//
//  Les paramètres (capacité Honda, heure marché…) sont dans Paramètres → Marché.
// ══════════════════════════════════════════════════════════════════════════════

const fmtDH = (n: number) => `${Math.round(n).toLocaleString("fr-MA")} DH`
const fmtKg = (n: number) => `${Math.round(n).toLocaleString("fr-MA")} kg`

// PA moyen d'un article depuis son historique (fallback : PA courant)
function paMoyen(articleId: string): number {
  const art = store.getArticles().find(a => a.id === articleId)
  if (!art) return 0
  const hist = (art.historiquePrixAchat ?? []).map(h => Number(h.prixAchat) || 0).filter(p => p > 0)
  if (hist.length) return Math.round((hist.reduce((s, p) => s + p, 0) / hist.length) * 100) / 100
  return Number(art.prixAchat) || 0
}

export default function BORapportMarche() {
  const cfg = store.getMarcheConfig()
  const [sent, setSent] = useState(false)

  const data = useMemo(() => {
    const besoin = store.computeBesoinNet().filter(b => b.besoinNet > 0)
    const lignes = besoin.map(b => {
      const pa = paMoyen(b.articleId)
      return { ...b, paMoyen: pa, espece: b.besoinNet * pa }
    }).sort((a, b) => b.espece - a.espece)

    const totalKg     = lignes.reduce((s, l) => s + l.besoinNet, 0)
    const totalEspece = lignes.reduce((s, l) => s + l.espece, 0)
    const nbHonda     = totalKg > 0 ? Math.ceil(totalKg / cfg.capaciteHondaKg) : 0

    // Heure de départ recommandée = ouverture marché − (tonnage × minutesParTonne) − marge
    const [hh, mm] = cfg.heureOuvertureMarche.split(":").map(Number)
    const openMin  = (hh || 5) * 60 + (mm || 0)
    const anticip  = Math.round((totalKg / 1000) * cfg.minutesParTonne) + cfg.margeSecuriteMin
    let departMin  = openMin - anticip
    while (departMin < 0) departMin += 24 * 60
    const departHeure = `${String(Math.floor(departMin / 60) % 24).padStart(2, "0")}:${String(departMin % 60).padStart(2, "0")}`

    // Rapport commandes par prévendeur (à partir des commandes du jour)
    const today = store.today()
    const cmds = store.getCommandes().filter(c => (c.date ?? "").slice(0, 10) === today)
    const parPrev: Record<string, { nb: number; kg: number; montant: number }> = {}
    cmds.forEach(c => {
      const nom = c.commercialNom || "—"
      const kg  = (c.lignes ?? []).reduce((s, l) => s + (Number(l.quantite) || 0), 0)
      const mt  = (c.lignes ?? []).reduce((s, l) => s + (Number(l.total) || (Number(l.quantite) || 0) * (Number(l.prixVente) || 0)), 0)
      if (!parPrev[nom]) parPrev[nom] = { nb: 0, kg: 0, montant: 0 }
      parPrev[nom].nb += 1; parPrev[nom].kg += kg; parPrev[nom].montant += mt
    })
    const prevendeurs = Object.entries(parPrev).map(([nom, v]) => ({ nom, ...v })).sort((a, b) => b.kg - a.kg)

    return { lignes, totalKg, totalEspece, nbHonda, departHeure, anticip, prevendeurs, nbCommandes: cmds.length }
  }, [cfg.capaciteHondaKg, cfg.heureOuvertureMarche, cfg.minutesParTonne, cfg.margeSecuriteMin])

  const waMessage = useMemo(() => {
    const top = data.lignes.slice(0, 12).map(l => `• ${l.articleNom} : ${fmtKg(l.besoinNet)} (~${fmtDH(l.espece)})`).join("\n")
    return [
      `🚚 *PLAN MARCHÉ — ${new Date().toLocaleDateString("fr-MA", { weekday: "long", day: "2-digit", month: "long" })}*`,
      ``,
      `📦 Tonnage à acheter : *${fmtKg(data.totalKg)}*`,
      `💵 Espèce à prévoir : *${fmtDH(data.totalEspece)}*`,
      `🛻 Camions (Honda) : *${data.nbHonda}* (capacité ${fmtKg(cfg.capaciteHondaKg)})`,
      `⏰ Départ recommandé : *${data.departHeure}* (marché ${cfg.heureOuvertureMarche}, anticipation ${data.anticip} min)`,
      ``,
      `*Besoins principaux :*`,
      top || "Aucun besoin.",
      ``,
      `_FreshLink — ${data.nbCommandes} commande(s) prévendeurs agrégées_`,
    ].join("\n")
  }, [data, cfg])

  const teamWa = (store.getCompanyContacts().whatsapp_principal || store.getCompanyContacts().tel_principal || "").replace(/\D/g, "")
  const waLink = `https://wa.me/${teamWa ? (teamWa.startsWith("212") ? teamWa : "212" + teamWa.replace(/^0/, "")) : ""}?text=${encodeURIComponent(waMessage)}`

  const copier = async () => {
    try { await navigator.clipboard.writeText(waMessage); setSent(true); setTimeout(() => setSent(false), 2500) } catch { /* */ }
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-black text-slate-900">🚚 Rapport Besoin Marché</h1>
        <p className="text-sm text-slate-500 mt-1">Planification de l&apos;achat du jour à partir des commandes prévendeurs · PA moyen historique · capacité camions</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Tonnage à acheter" value={fmtKg(data.totalKg)} emoji="📦" />
        <Kpi label="Espèce à prévoir" value={fmtDH(data.totalEspece)} emoji="💵" accent="text-emerald-700" />
        <Kpi label="Camions (Honda)" value={String(data.nbHonda)} emoji="🛻" sub={`capacité ${fmtKg(cfg.capaciteHondaKg)}`} />
        <Kpi label="Départ recommandé" value={data.departHeure} emoji="⏰" sub={`marché ${cfg.heureOuvertureMarche}`} accent="text-amber-700" />
      </div>

      {/* Alerte WhatsApp / notification */}
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-bold text-slate-900 text-sm">📣 Alerte équipe (heure d&apos;arrivée selon tonnage)</h2>
          <div className="flex gap-2">
            <button onClick={copier} className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold hover:bg-slate-50">
              {sent ? "✓ Copié" : "Copier"}
            </button>
            <a href={waLink} target="_blank" rel="noreferrer"
              className={`px-3 py-1.5 rounded-lg text-xs font-bold text-white ${teamWa ? "bg-green-600 hover:bg-green-700" : "bg-slate-300 pointer-events-none"}`}>
              📲 Envoyer WhatsApp
            </a>
          </div>
        </div>
        <pre className="text-xs whitespace-pre-wrap font-sans text-slate-700 bg-white rounded-xl border border-slate-200 p-3 max-h-64 overflow-auto">{waMessage}</pre>
        {!teamWa && <p className="text-[11px] text-amber-700">⚠️ Numéro WhatsApp équipe non configuré (Paramètres → Coordonnées). Utilisez « Copier ».</p>}
      </div>

      {/* Détail besoins par article */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200"><h2 className="text-sm font-bold text-slate-700">Besoins par article (PA moyen historique)</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead><tr className="border-b border-slate-100 text-[11px] text-slate-500">
              <th className="text-left px-4 py-2">Article</th>
              <th className="text-right px-3 py-2">Besoin</th>
              <th className="text-right px-3 py-2">PA moyen</th>
              <th className="text-right px-4 py-2">Espèce</th>
            </tr></thead>
            <tbody>
              {data.lignes.length === 0 ? (
                <tr><td colSpan={4} className="text-center text-slate-400 py-8">Aucun besoin d&apos;achat aujourd&apos;hui (stock suffisant ou aucune commande).</td></tr>
              ) : data.lignes.map(l => (
                <tr key={l.articleId} className="border-b border-slate-50 hover:bg-slate-50/60">
                  <td className="px-4 py-2 font-semibold text-slate-800">{l.articleNom}</td>
                  <td className="px-3 py-2 text-right">{fmtKg(l.besoinNet)}</td>
                  <td className="px-3 py-2 text-right text-slate-500">{l.paMoyen ? `${l.paMoyen.toFixed(2)} DH/kg` : "—"}</td>
                  <td className="px-4 py-2 text-right font-bold text-emerald-700">{fmtDH(l.espece)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rapport commandes prévendeurs */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200"><h2 className="text-sm font-bold text-slate-700">Commandes prévendeurs (aujourd&apos;hui) — {data.nbCommandes}</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead><tr className="border-b border-slate-100 text-[11px] text-slate-500">
              <th className="text-left px-4 py-2">Prévendeur</th>
              <th className="text-right px-3 py-2">Commandes</th>
              <th className="text-right px-3 py-2">Tonnage</th>
              <th className="text-right px-4 py-2">Montant</th>
            </tr></thead>
            <tbody>
              {data.prevendeurs.length === 0 ? (
                <tr><td colSpan={4} className="text-center text-slate-400 py-8">Aucune commande prévendeur aujourd&apos;hui.</td></tr>
              ) : data.prevendeurs.map(p => (
                <tr key={p.nom} className="border-b border-slate-50 hover:bg-slate-50/60">
                  <td className="px-4 py-2 font-semibold text-slate-800">{p.nom}</td>
                  <td className="px-3 py-2 text-right">{p.nb}</td>
                  <td className="px-3 py-2 text-right">{fmtKg(p.kg)}</td>
                  <td className="px-4 py-2 text-right font-bold text-slate-700">{fmtDH(p.montant)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-slate-400">
        Espèce = besoin net × PA moyen (historique d&apos;achat, alimenté automatiquement par chaque bon d&apos;achat). Paramètres marché (capacité Honda, heure) : Paramètres → Marché.
      </p>
    </div>
  )
}

function Kpi({ label, value, emoji, sub, accent }: { label: string; value: string; emoji: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-[11px] text-slate-500 flex items-center gap-1">{emoji} {label}</p>
      <p className={`text-xl font-black mt-1 ${accent ?? "text-slate-900"}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}
