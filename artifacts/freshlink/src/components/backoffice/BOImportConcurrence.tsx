"use client"

// ══════════════════════════════════════════════════════════════════════════════
//  BOImportConcurrence — Import Excel des données concurrent (Iziry & co.)
//
//  3 types de fichiers Excel (.xlsx) :
//   1. Prix de vente  (catalogue, 1 SEULE FOIS) — Référence | Libellé | Unité | Prix vente
//        → fl_conc_pv
//   2. Facturation    (QUOTIDIEN)  — ventes concurrent : PV, volume par jour /
//        article / client / commercial / secteur            → fl_conc_ventes
//   3. Synthèse achats (QUOTIDIEN) — PA concurrent par article (acheteur, PU, frais)
//        → fl_intel_prix (réutilisé par « PV stratégique » & Intelligence Prix)
//
//  Tout est stocké en localStorage (même architecture que BOConcurrence).
//  Réimporter un même jour REMPLACE les lignes de ce jour (pas de doublon).
// ══════════════════════════════════════════════════════════════════════════════

import { useState, useMemo, useRef } from "react"
import type { User } from "@/lib/store"
import { hasPermission } from "@/lib/permissions"
import { logAction } from "@/lib/auditLog"

// ─── Storage ────────────────────────────────────────────────────────────────
const LS_PRIX   = "fl_intel_prix"     // CompetitorEntry[] (PA concurrent) — partagé
const LS_PV     = "fl_conc_pv"        // prix de vente catalogue concurrent
const LS_VENTES = "fl_conc_ventes"    // facturation concurrent (lignes)

interface CompetitorEntry {
  id: string; concurrentNom: string; sku: string; prixConcurrent: number
  prixNotre: number; unite: string; source?: string; lieu?: string; date: string; note?: string
}
interface ConcPV { ref: string; libelle: string; libelleRaw: string; unite: string; pv: number; date?: string; history?: { date: string; pv: number }[] }
interface ConcVente {
  id: string; type: string; commercial: string; client: string; secteur: string
  codeClient: string; document: string; date: string; article: string; articleRaw: string
  unite: string; qt: number; pu: number; ht: number; ttc: number; remise: number; netFacture: number
}

function getJSON<T>(k: string): T[] { try { return JSON.parse(localStorage.getItem(k) ?? "[]") } catch { return [] } }
function setJSON<T>(k: string, v: T[]) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* quota */ } }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function cleanName(s: unknown): string {
  return String(s ?? "").replace(/[؀-ۿݐ-ݿࢠ-ࣿ]/g, "").replace(/\s+/g, " ").trim()
}
function num(v: unknown): number {
  if (typeof v === "number") return isNaN(v) ? 0 : v
  const n = parseFloat(String(v ?? "").replace(/\s/g, "").replace(",", "."))
  return isNaN(n) ? 0 : n
}
function toISO(v: unknown): string {
  if (v instanceof Date && !isNaN(v.getTime())) {
    const off = v.getTimezoneOffset() * 60000
    return new Date(v.getTime() - off).toISOString().slice(0, 10)
  }
  const s = String(v ?? "").trim()
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m2) return m2[0]
  return ""
}
function fmtMad(n: number) { return `${(n || 0).toLocaleString("fr-MA", { maximumFractionDigits: 0 })} DH` }

// Lit le 1er onglet (ou un onglet nommé) en tableau de lignes + index par entête
async function readSheet(buf: ArrayBuffer, sheetMatch?: string) {
  const XLSX = await import("xlsx")
  const wb = XLSX.read(buf, { type: "array", cellDates: true })
  const name = sheetMatch
    ? (wb.SheetNames.find(n => n.toLowerCase().includes(sheetMatch.toLowerCase())) ?? wb.SheetNames[0])
    : wb.SheetNames[0]
  const ws = wb.Sheets[name]
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "" })
  const headers = (aoa[0] ?? []).map(h => String(h ?? "").trim())
  const idx = (label: string) => headers.findIndex(h => h.toLowerCase() === label.toLowerCase())
  return { rows: aoa.slice(1).filter(r => Array.isArray(r) && r.some(c => c !== "" && c != null)), idx }
}

const CONCURRENT_NOM = "Iziry"

// Partage entre appareils : pousse des lignes {id, payload} vers Supabase (service-role).
async function sbPush(table: string, rows: { id: string; payload: Record<string, unknown> }[]): Promise<boolean> {
  if (rows.length === 0) return true
  try {
    let ok = true
    for (let i = 0; i < rows.length; i += 200) {
      const batch = rows.slice(i, i + 200).map(r => ({ ...r, updated_at: new Date().toISOString() }))
      const res = await fetch("/api/sync-write", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ table, upserts: batch }) })
      const d = await res.json().catch(() => ({ ok: false }))
      if (!d.ok) ok = false
    }
    return ok
  } catch { return false }
}

// ─── Composant ──────────────────────────────────────────────────────────────
export default function BOImportConcurrence({ user }: { user: User }) {
  const [pv, setPv]         = useState<ConcPV[]>(() => getJSON<ConcPV>(LS_PV))
  const [ventes, setVentes] = useState<ConcVente[]>(() => getJSON<ConcVente>(LS_VENTES))
  const [achats, setAchats] = useState<CompetitorEntry[]>(() => getJSON<CompetitorEntry>(LS_PRIX).filter(e => e.source === "synthese_achats"))
  const [jour, setJour]     = useState(new Date().toISOString().slice(0, 10))
  const [msg, setMsg]       = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy]     = useState(false)
  const [view, setView]     = useState<"import" | "prevision">("import")
  const [horizon, setHorizon] = useState<7 | 14 | 30>(30)
  const refPV = useRef<HTMLInputElement>(null)
  const refFA = useRef<HTMLInputElement>(null)
  const refSA = useRef<HTMLInputElement>(null)

  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 6000) }

  // ── 1) Prix de vente (QUOTIDIEN — garde l'historique du PV par article) ──────
  const importPV = async (file: File) => {
    setBusy(true)
    try {
      const { rows, idx } = await readSheet(await file.arrayBuffer(), "prix")
      const iRef = idx("Référence") >= 0 ? idx("Référence") : idx("Reference")
      const iLib = idx("Libellé") >= 0 ? idx("Libellé") : idx("Libelle")
      const iUni = idx("Unité") >= 0 ? idx("Unité") : idx("Unite")
      const iPv  = idx("Prix vente (MAD)") >= 0 ? idx("Prix vente (MAD)") : idx("Prix vente")
      // Fusion avec l'existant : met à jour le PV + ajoute un point d'historique daté
      const existing = new Map(getJSON<ConcPV>(LS_PV).map(e => [e.ref, e]))
      let n = 0
      for (const r of rows) {
        const ref = String(r[iRef] ?? "").trim()
        const lib = String(r[iLib] ?? "").trim()
        if (!ref && !lib) continue
        const key = ref || lib
        const pvv = num(r[iPv])
        const prev = existing.get(key)
        const hist = (prev?.history ?? []).filter(h => h.date !== jour)
        hist.push({ date: jour, pv: pvv })
        existing.set(key, {
          ref: key, libelle: cleanName(lib), libelleRaw: lib,
          unite: String(r[iUni] ?? prev?.unite ?? "kg").trim() || "kg",
          pv: pvv, date: jour, history: hist.sort((a, b) => a.date.localeCompare(b.date)).slice(-60),
        })
        n++
      }
      const out = [...existing.values()]
      setJSON(LS_PV, out); setPv(out)
      const okSb = await sbPush(LS_PV, out.map(e => ({ id: e.ref, payload: e as unknown as Record<string, unknown> })))
      flash(true, `✅ Prix de vente concurrent importé : ${n} article(s) pour le ${jour}.${okSb ? " (partagé)" : " (local — Supabase indispo)"}`)
    } catch (e) { flash(false, `❌ Erreur lecture fichier prix-vente : ${String(e).slice(0, 120)}`) }
    finally { setBusy(false); if (refPV.current) refPV.current.value = "" }
  }

  // ── 2) Facturation (quotidien — remplace les jours présents dans le fichier) ─
  const importFacturation = async (file: File) => {
    setBusy(true)
    try {
      const { rows, idx } = await readSheet(await file.arrayBuffer(), "factur")
      const c = {
        type: idx("Type"), comm: idx("Prévendeur/Livreur") >= 0 ? idx("Prévendeur/Livreur") : idx("Prevendeur/Livreur"),
        client: idx("Client"), secteur: idx("Secteur"), code: idx("CodeClient"), doc: idx("Document"),
        date: idx("Date"), art: idx("Article"), uni: idx("Unité") >= 0 ? idx("Unité") : idx("Unite"),
        qt: idx("QT"), pu: idx("PU"), ht: idx("HT"), ttc: idx("TTC"), rem: idx("Remise"),
        net: idx("NetFacturé") >= 0 ? idx("NetFacturé") : idx("TotalHT"),
      }
      const parsed: ConcVente[] = []
      const datesInFile = new Set<string>()
      rows.forEach((r, i) => {
        const artRaw = String(r[c.art] ?? "").trim()
        if (!artRaw) return
        const d = toISO(r[c.date]) || jour
        datesInFile.add(d)
        parsed.push({
          id: `CV_${d}_${i}_${Math.random().toString(36).slice(2, 6)}`,
          type: String(r[c.type] ?? "").trim(),
          commercial: String(r[c.comm] ?? "").trim(),
          client: String(r[c.client] ?? "").trim(),
          secteur: String(r[c.secteur] ?? "").trim(),
          codeClient: String(r[c.code] ?? "").trim(),
          document: String(r[c.doc] ?? "").trim(),
          date: d, article: cleanName(artRaw), articleRaw: artRaw,
          unite: String(r[c.uni] ?? "kg").trim() || "kg",
          qt: num(r[c.qt]), pu: num(r[c.pu]), ht: num(r[c.ht]), ttc: num(r[c.ttc]),
          remise: num(r[c.rem]), netFacture: num(r[c.net]),
        })
      })
      // Remplace les jours présents dans le fichier (re-import = pas de doublon)
      const kept = getJSON<ConcVente>(LS_VENTES).filter(v => !datesInFile.has(v.date))
      const merged = [...kept, ...parsed]
      setJSON(LS_VENTES, merged); setVentes(merged)
      flash(true, `✅ Facturation concurrent importée : ${parsed.length} ligne(s) sur ${datesInFile.size} jour(s).`)
    } catch (e) { flash(false, `❌ Erreur lecture facturation : ${String(e).slice(0, 120)}`) }
    finally { setBusy(false); if (refFA.current) refFA.current.value = "" }
  }

  // ── 3) Synthèse achats (quotidien — PA concurrent → fl_intel_prix) ──────────
  const importSynthese = async (file: File) => {
    setBusy(true)
    try {
      const { rows, idx } = await readSheet(await file.arrayBuffer(), "synth")
      const c = {
        ach: idx("Acheteur"), art: idx("Article"), fam: idx("Famille"),
        qte: idx("Qté Achetée") >= 0 ? idx("Qté Achetée") : idx("Qte Achetee"),
        pu: idx("Prix Unitaire (DH)"), frais: idx("Frais Supp/U (DH)"),
      }
      const out: CompetitorEntry[] = []
      rows.forEach((r, i) => {
        const artRaw = String(r[c.art] ?? "").trim()
        if (!artRaw) return
        const pa = num(r[c.pu]) + num(r[c.frais])   // coût concurrent = PU + frais/u
        out.push({
          id: `IP_${jour}_${i}_${Math.random().toString(36).slice(2, 6)}`,
          concurrentNom: CONCURRENT_NOM, sku: cleanName(artRaw),
          prixConcurrent: Math.round(pa * 100) / 100, prixNotre: 0,
          unite: "kg", source: "synthese_achats", date: jour,
          note: `Acheteur: ${String(r[c.ach] ?? "").trim()}${r[c.fam] ? " · " + String(r[c.fam]).trim() : ""}`,
        })
      })
      // Conserve les autres relevés + les autres jours, remplace le jour courant
      const others = getJSON<CompetitorEntry>(LS_PRIX).filter(e => !(e.source === "synthese_achats" && e.date === jour))
      const merged = [...others, ...out]
      setJSON(LS_PRIX, merged); setAchats(merged.filter(e => e.source === "synthese_achats"))
      const okSb = await sbPush(LS_PRIX, merged.map(e => ({ id: e.id, payload: e as unknown as Record<string, unknown> })))
      flash(true, `✅ Synthèse achats concurrent importée : ${out.length} article(s) pour le ${jour}.${okSb ? " (partagé)" : " (local — Supabase indispo)"}`)
    } catch (e) { flash(false, `❌ Erreur lecture synthèse achats : ${String(e).slice(0, 120)}`) }
    finally { setBusy(false); if (refSA.current) refSA.current.value = "" }
  }

  const clearVentes = () => {
    if (!hasPermission(user.role, "backup_restore")) { logAction(user, "backup_restore", "denied", { type: "conc_ventes" }); return }
    if (!confirm("Effacer toutes les facturations concurrent importées ?")) return
    logAction(user, "backup_restore", "success", { type: "conc_ventes" })
    setJSON(LS_VENTES, []); setVentes([])
  }
  const clearPV = () => {
    if (!hasPermission(user.role, "backup_restore")) { logAction(user, "backup_restore", "denied", { type: "conc_pv" }); return }
    if (!confirm("Effacer le catalogue prix de vente concurrent ?")) return
    logAction(user, "backup_restore", "success", { type: "conc_pv" })
    setJSON(LS_PV, []); setPv([])
  }
  const clearAchats = () => {
    if (!hasPermission(user.role, "backup_restore")) { logAction(user, "backup_restore", "denied", { type: "conc_achats" }); return }
    if (!confirm("Effacer toutes les synthèses achats concurrent ?")) return
    logAction(user, "backup_restore", "success", { type: "conc_achats" })
    const others = getJSON<CompetitorEntry>(LS_PRIX).filter(e => e.source !== "synthese_achats")
    setJSON(LS_PRIX, others); setAchats([])
  }

  // ── Analytics facturation ────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const ca = ventes.reduce((s, v) => s + (v.netFacture || v.ht || 0), 0)
    const volKg = ventes.filter(v => /kg/i.test(v.unite)).reduce((s, v) => s + v.qt, 0)
    const clients = new Set(ventes.map(v => v.client).filter(Boolean)).size
    const jours = new Set(ventes.map(v => v.date)).size
    const byKey = (sel: (v: ConcVente) => string) => {
      const m: Record<string, { ca: number; vol: number }> = {}
      ventes.forEach(v => { const k = sel(v) || "—"; if (!m[k]) m[k] = { ca: 0, vol: 0 }; m[k].ca += (v.netFacture || v.ht || 0); m[k].vol += v.qt })
      return Object.entries(m).sort((a, b) => b[1].ca - a[1].ca)
    }
    return { ca, volKg, clients, jours, byArticle: byKey(v => v.article), bySecteur: byKey(v => v.secteur), byCommercial: byKey(v => v.commercial) }
  }, [ventes])

  // ── Prévision : projette CA & tonnage futurs (tendance linéaire + moyenne) ───
  const prevision = useMemo(() => {
    const byDate: Record<string, { ca: number; vol: number }> = {}
    ventes.forEach(v => { (byDate[v.date] ??= { ca: 0, vol: 0 }); byDate[v.date].ca += (v.netFacture || v.ht || 0); byDate[v.date].vol += v.qt })
    const dates = Object.keys(byDate).sort()
    const caS = dates.map(d => byDate[d].ca), volS = dates.map(d => byDate[d].vol)
    const n = dates.length
    const meanArr = (a: number[]) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0
    // Projection par régression linéaire (somme des H prochains jours, clampée ≥ 0)
    const proj = (s: number[]) => {
      if (s.length === 0) return 0
      if (s.length === 1) return s[0] * horizon
      const xs = s.map((_, i) => i), mx = meanArr(xs), my = meanArr(s)
      let nu = 0, de = 0
      for (let i = 0; i < s.length; i++) { nu += (xs[i] - mx) * (s[i] - my); de += (xs[i] - mx) ** 2 }
      const slope = de ? nu / de : 0, intercept = my - slope * mx
      let sum = 0; for (let i = 0; i < horizon; i++) sum += Math.max(0, slope * (s.length + i) + intercept)
      return sum
    }
    const fcCA = proj(caS), fcVol = proj(volS)
    const baseCA = meanArr(caS) * horizon, baseVol = meanArr(volS) * horizon
    // Prévision par dimension : total/clé sur la période, mise à l'échelle pro-rata
    const perKey = (sel: (v: ConcVente) => string): [string, { ca: number; vol: number }][] => {
      const m: Record<string, { ca: number; vol: number }> = {}
      ventes.forEach(v => { const k = sel(v) || "—"; (m[k] ??= { ca: 0, vol: 0 }); m[k].ca += (v.netFacture || v.ht || 0); m[k].vol += v.qt })
      const factor = n ? horizon / n : 0
      return Object.entries(m).map(([k, val]) => [k, { ca: val.ca * factor, vol: val.vol * factor }] as [string, { ca: number; vol: number }]).sort((a, b) => b[1].ca - a[1].ca)
    }
    return { n, fcCA, fcVol, baseCA, baseVol, byArticle: perKey(v => v.article), bySecteur: perKey(v => v.secteur), byClient: perKey(v => v.client) }
  }, [ventes, horizon])

  const Card = ({ title, sub, accent, children }: { title: string; sub: string; accent: string; children: React.ReactNode }) => (
    <div className={`rounded-2xl border bg-white p-4 flex flex-col gap-3 ${accent}`}>
      <div><h3 className="text-sm font-black text-slate-900">{title}</h3><p className="text-[11px] text-slate-500">{sub}</p></div>
      {children}
    </div>
  )

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-5 text-white">
        <h2 className="text-lg font-black">📥 Import Excel — Données concurrent</h2>
        <p className="text-sm text-white/75 mt-1">
          Importe les extractions Excel (.xlsx) du concurrent. <strong>Facture</strong> (PV + volume) &amp; <strong>Synthèse achats</strong> (PA) = chaque jour ·
          <strong> Facture globale</strong> (historique) = 1 seule fois. Le PV concurrent est extrait des factures. Données partagées entre appareils.
        </p>
      </div>

      {msg && (
        <div className={`px-4 py-2.5 rounded-xl text-sm font-semibold shadow ${msg.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>{msg.text}</div>
      )}

      {/* Onglets Import / Prévision */}
      <div className="flex gap-2">
        {([["import", "📥 Import & données"], ["prevision", "📈 Prévision"]] as [typeof view, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setView(k)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${view === k ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200"}`}>{l}</button>
        ))}
      </div>

      {view === "import" && (<>
      {/* Date du jour (pour la synthèse achats qui n'a pas de colonne date) */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm font-semibold text-slate-700">Jour d&apos;import (synthèse achats) :</label>
        <input type="date" value={jour} onChange={e => setJour(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-200 text-sm" />
        {busy && <span className="text-xs text-slate-500">⏳ Lecture du fichier…</span>}
      </div>

      {/* 3 zones d'import */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Facturation = source principale (PV extrait + volume + prévision) */}
        <Card title="① Facture concurrent (PV + volume)" sub="QUOTIDIEN (facturation.xlsx) · GLOBALE = 1 fois (facturation - global.xlsx) · le PV concurrent est EXTRAIT du prix unitaire des factures, consolidé jour après jour dans la Prévision" accent="border-emerald-200">
          <span className="inline-block w-fit text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">quotidien · global 1 fois</span>
          <label className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold text-center cursor-pointer hover:bg-emerald-700">
            📂 Choisir facture(.global).xlsx
            <input ref={refFA} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) importFacturation(f) }} />
          </label>
          <p className="text-xs text-slate-600">{ventes.length} ligne(s) · {stats.jours} jour(s) — PV concurrent + volume.</p>
          {ventes.length > 0 && <button onClick={clearVentes} className="text-[11px] text-red-600 hover:underline w-fit">Vider les factures</button>}
        </Card>

        {/* Prix de vente = catalogue de repli (optionnel) */}
        <Card title="② Catalogue prix-vente (optionnel — repli)" sub="Optionnel · utilisé seulement si un article n'apparaît pas dans les factures · Référence · Libellé · Prix vente" accent="border-blue-200">
          <span className="inline-block w-fit text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">repli</span>
          <label className="px-3 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold text-center cursor-pointer hover:bg-blue-700">
            📂 Choisir prix-vente.xlsx
            <input ref={refPV} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) importPV(f) }} />
          </label>
          <p className="text-xs text-slate-600">{pv.length} article(s) en repli.</p>
          {pv.length > 0 && <button onClick={clearPV} className="text-[11px] text-red-600 hover:underline w-fit">Vider le catalogue</button>}
        </Card>

        {/* Synthèse achats */}
        <Card title="③ Synthèse achats (PA)" sub="QUOTIDIEN · prix d'achat concurrent par article" accent="border-amber-200">
          <span className="inline-block w-fit text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">chaque jour</span>
          <label className="px-3 py-2 rounded-xl bg-amber-600 text-white text-sm font-bold text-center cursor-pointer hover:bg-amber-700">
            📂 Choisir synthese_achats.xlsx
            <input ref={refSA} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) importSynthese(f) }} />
          </label>
          <p className="text-xs text-slate-600">{achats.length} relevé(s) PA · alimente « PV stratégique ».</p>
          {achats.length > 0 && <button onClick={clearAchats} className="text-[11px] text-red-600 hover:underline w-fit">Vider les achats</button>}
        </Card>
      </div>

      {/* Analytics facturation concurrent */}
      {ventes.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { l: "CA concurrent", v: fmtMad(stats.ca), i: "💰" },
              { l: "Volume (kg)", v: stats.volKg.toLocaleString("fr-MA", { maximumFractionDigits: 0 }), i: "⚖️" },
              { l: "Clients", v: String(stats.clients), i: "🏪" },
              { l: "Jours couverts", v: String(stats.jours), i: "📅" },
            ].map(k => (
              <div key={k.l} className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-xl">{k.i}</div>
                <div><p className="text-[11px] text-slate-500">{k.l}</p><p className="text-lg font-black text-slate-900">{k.v}</p></div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <TopList title="Top articles (CA)" rows={stats.byArticle} />
            <TopList title="Top secteurs (CA)" rows={stats.bySecteur} />
            <TopList title="Top commerciaux (CA)" rows={stats.byCommercial} />
          </div>
        </div>
      )}

      <p className="text-[11px] text-slate-400 leading-relaxed">
        💡 Les PA &amp; PV concurrent sont <strong>partagés entre appareils</strong> (Supabase). La facturation reste sur cet appareil.
        La <strong>synthèse achats</strong> alimente la rubrique <strong>Pricing</strong> (PA concurrent). Réimporter un même jour <strong>remplace</strong> ce jour (aucun doublon).
      </p>
      </>)}

      {/* ── PRÉVISION ─────────────────────────────────────────────────────── */}
      {view === "prevision" && (
        ventes.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
            <p className="text-4xl mb-2">📈</p>
            <p className="font-semibold">Importe d&apos;abord la facturation concurrent pour générer une prévision.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-semibold text-slate-700">Horizon de prévision :</span>
              {[7, 14, 30].map(h => (
                <button key={h} onClick={() => setHorizon(h as 7 | 14 | 30)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-bold ${horizon === h ? "bg-indigo-600 text-white" : "bg-white text-slate-600 border border-slate-200"}`}>{h} jours</button>
              ))}
              <span className="text-xs text-slate-400">basé sur {prevision.n} jour(s) d&apos;historique</span>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { l: `CA prévu — tendance (${horizon}j)`, v: fmtMad(prevision.fcCA), i: "📈" },
                { l: `Tonnage prévu — tendance (${horizon}j)`, v: prevision.fcVol.toLocaleString("fr-MA", { maximumFractionDigits: 0 }) + " kg", i: "⚖️" },
                { l: `CA prévu — moyenne (${horizon}j)`, v: fmtMad(prevision.baseCA), i: "📊" },
                { l: `Tonnage prévu — moyenne (${horizon}j)`, v: prevision.baseVol.toLocaleString("fr-MA", { maximumFractionDigits: 0 }) + " kg", i: "📊" },
              ].map(k => (
                <div key={k.l} className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-xl">{k.i}</div>
                  <div className="min-w-0"><p className="text-[11px] text-slate-500 truncate">{k.l}</p><p className="text-lg font-black text-indigo-800">{k.v}</p></div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <TopList title={`Prévision CA — par produit (${horizon}j)`} rows={prevision.byArticle} />
              <TopList title={`Prévision CA — par secteur (${horizon}j)`} rows={prevision.bySecteur} />
              <TopList title={`Prévision CA — par client (${horizon}j)`} rows={prevision.byClient} />
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              📈 Prévision = projection de tendance (régression linéaire) des ventes concurrent observées. La répartition par produit / secteur / client
              est mise à l&apos;échelle au pro-rata de l&apos;historique. Plus l&apos;historique est long (facturation globale), plus la prévision est fiable.
            </p>
          </div>
        )
      )}
    </div>
  )
}

function TopList({ title, rows }: { title: string; rows: [string, { ca: number; vol: number }][] }) {
  const top = rows.slice(0, 8)
  const max = top.reduce((m, r) => Math.max(m, r[1].ca), 0) || 1
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-black text-slate-900 mb-3">{title}</h3>
      <div className="flex flex-col gap-2">
        {top.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-slate-700 truncate max-w-[60%]">{k}</span>
              <span className="text-slate-500">{(v.ca || 0).toLocaleString("fr-MA", { maximumFractionDigits: 0 })} DH · {v.vol.toLocaleString("fr-MA", { maximumFractionDigits: 0 })} kg</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-slate-700 to-slate-900" style={{ width: `${Math.max(3, (v.ca / max) * 100)}%` }} />
            </div>
          </div>
        ))}
        {top.length === 0 && <p className="text-xs text-slate-400">Aucune donnée.</p>}
      </div>
    </div>
  )
}
