"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { store, type User, type Article, paDeviationConfirmMessage } from "@/lib/store"

// ── Cycle "commande" (confirmé par le client, même règle que BOCommandesUnifiees) ──
// La collecte des commandes pour un jour J court de [J-1 heureDebut] à [J
// heureFin] — cf. store.getCommandeCutoffConfig (par défaut 14h00 → 04h00,
// modifiable sans redéploiement depuis le BO ou l'écran mobile Achat). Avant
// heureDebut, "aujourd'hui" désigne J ; à partir de heureDebut, la collecte
// de J+1 a déjà commencé, donc "aujourd'hui" bascule sur J+1. (Le cycle
// "achat" lui-même reste un jour calendaire classique 00:00-23:59 — non
// modifié ici.)
const commandeOperationalDate = store.commandeOperationalDate
const commandeDayBounds = store.commandeCycleBounds

export default function BOGestionPA({ user }: { user: User }) {
  const [articles, setArticles] = useState<Article[]>([])
  const [search, setSearch] = useState("")
  const [onlyMissing, setOnlyMissing] = useState(true)
  const [scope, setScope] = useState<"all" | "ordered">("ordered")
  const [from, setFrom] = useState(() => commandeOperationalDate())
  const [to, setTo] = useState(() => commandeOperationalDate())
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const canEdit = ["super_super_admin", "super_admin", "admin", "resp_achat", "ctrl_achat"].includes(user.role)
  const cutoffCfg = store.getCommandeCutoffConfig()

  useEffect(() => {
    setArticles(store.getArticles())
    import("@/lib/supabase/db").then(db => db.fetchArticles().then(a => { if (a?.length) setArticles(a) }).catch(() => {}))
  }, [])
  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 6000) }

  // Articles COMMANDÉS — fenêtre "commande" J-1 14h00 -> J 04h00 (voir
  // commandeDayBounds ci-dessus), pas un simple jour calendaire.
  const orderedIds = useMemo(() => {
    const ids = new Set<string>()
    const boundsFrom = from ? commandeDayBounds(from) : null
    const boundsTo   = to   ? commandeDayBounds(to)   : null
    store.getCommandes().forEach(c => {
      const d = new Date((c as { date?: string; createdAt?: string }).date ?? (c as { createdAt?: string }).createdAt ?? 0)
      if (boundsFrom && d < boundsFrom.start) return
      if (boundsTo && d >= boundsTo.end) return
      ;((c as { lignes?: { articleId?: string }[] }).lignes ?? []).forEach(l => { if (l.articleId) ids.add(l.articleId) })
    })
    return ids
  }, [from, to])

  const hasPA = (a: Article) => (Number(a.prixAchat) || 0) > 0
  const filtered = articles
    .filter(a => {
      // Le scope "commandés" n'était appliqué qu'à l'export Excel, jamais à
      // la liste affichée — l'utilisateur voyait tous les articles même en
      // ayant explicitement choisi "Articles commandés".
      if (scope === "ordered" && !orderedIds.has(a.id)) return false
      if (onlyMissing && hasPA(a)) return false
      if (search) { const q = search.toLowerCase(); if (!((a.nom || "").toLowerCase().includes(q) || (a.id || "").toLowerCase().includes(q))) return false }
      return true
    })
    .sort((a, b) => (a.nom ?? "").localeCompare(b.nom ?? ""))
  const missingCount = articles.filter(a => !hasPA(a)).length

  const setPA = (id: string, val: string) => {
    const v = Math.max(0, Number(String(val).replace(",", ".")) || 0)
    const all = store.getArticles(); const i = all.findIndex(a => a.id === id); if (i < 0) return
    all[i] = { ...all[i], prixAchat: v }
    store.saveArticles(all); setArticles(all)
    import("@/lib/supabase/db").then(db => db.upsertArticle(all[i]).catch(() => {}))
  }

  const doExport = async () => {
    const src = scope === "ordered" ? articles.filter(a => orderedIds.has(a.id)) : articles
    if (!src.length) { flash(false, scope === "ordered" ? "Aucun article commandé sur cette période." : "Aucun article."); return }
    const rows = src.map(a => ({ ref: a.id, nom: a.nom, nom_ar: a.nomAr ?? "", famille: a.famille ?? "", unite: a.unite ?? "", PA_actuel: Number(a.prixAchat) || 0 }))
    const XLSX = await import("xlsx")
    const ws = XLSX.utils.json_to_sheet(rows); const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "PA")
    XLSX.writeFile(wb, `PA_${scope === "ordered" ? "commandes" : "tous"}_${new Date().toISOString().slice(0, 10)}.xlsx`)
    flash(true, `📤 Export de ${rows.length} article(s). Remplissez la colonne PA_actuel puis réimportez.`)
  }

  const doImport = async (file: File) => {
    setImporting(true)
    try {
      const buf = await file.arrayBuffer()
      const XLSX = await import("xlsx")
      const wb = XLSX.read(buf, { type: "array" })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" })
      if (!rows.length) { flash(false, "Fichier vide."); setImporting(false); return }
      const cols = Object.keys(rows[0])
      const refKey = cols.find(k => /^(ref|id)$/i.test(k.trim())) ?? cols.find(k => /ref|id/i.test(k))
      const paKey  = cols.find(k => /pa.?actuel|prix.*achat|^pa$|achat/i.test(k))
      if (!refKey || !paKey) { flash(false, "Colonnes attendues introuvables : « ref » et « PA_actuel »."); setImporting(false); return }
      const all = store.getArticles(); let upd = 0, err = 0; const changed: Article[] = []
      rows.forEach(r => {
        const ref = String(r[refKey] ?? "").trim()
        const raw = String(r[paKey] ?? "").trim().replace(",", ".")
        const pa = Number(raw)
        if (!ref || raw === "" || isNaN(pa) || pa < 0) { if (ref || raw) err++; return }
        const i = all.findIndex(a => a.id === ref || (a.nom || "").trim().toLowerCase() === ref.toLowerCase())
        if (i < 0) { err++; return }
        if ((Number(all[i].prixAchat) || 0) !== pa) { all[i] = { ...all[i], prixAchat: pa }; changed.push(all[i]); upd++ }
      })
      // Garde-fou anti-faute-de-frappe (FR + AR) : import en masse -> un seul
      // recap au lieu d'une popup par ligne, sinon inutilisable sur 50+ lignes.
      const suspects = changed
        .map(a => store.checkPaDeviationSuspecte(a.id, a.prixAchat))
        .filter((d): d is NonNullable<typeof d> => d !== null)
      if (suspects.length > 0) {
        const liste = suspects.slice(0, 10).map(d => `• ${paDeviationConfirmMessage(d)}`).join("\n\n")
        const suite = suspects.length > 10 ? `\n\n… +${suspects.length - 10} autre(s) écart important(s) / ${suspects.length - 10} فرق(وق) إضافي(ة) أخرى` : ""
        if (!window.confirm(`⚠️ ${suspects.length} écart(s) de prix important(s) détecté(s) dans ce fichier :\n\n${liste}${suite}\n\nImporter quand même ?`)) {
          setImporting(false); if (fileRef.current) fileRef.current.value = ""; return
        }
      }
      if (changed.length) {
        store.saveArticles(all); setArticles(all)
        const db = await import("@/lib/supabase/db")
        for (const a of changed) { try { await db.upsertArticle(a) } catch { /* best-effort */ } }
      }
      flash(true, `✅ ${upd} article(s) mis à jour · ${err} ligne(s) ignorée(s)/en erreur.`)
    } catch { flash(false, "Erreur de lecture du fichier Excel.") }
    setImporting(false)
    if (fileRef.current) fileRef.current.value = ""
  }

  if (!canEdit) return <div className="p-8 text-center text-sm text-muted-foreground">🔒 Réservé à l&apos;équipe achat.</div>

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="mb-4">
        <h2 className="text-xl font-black text-foreground flex items-center gap-2">💰 Gestion des Prix d&apos;Achat</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Saisissez les PA manquants, ou exportez/importez en Excel. <b className="text-amber-600">{missingCount}</b> article(s) sans PA.</p>
      </div>

      {msg && <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-semibold ${msg.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>{msg.text}</div>}

      {/* Export / Import */}
      <div className="rounded-2xl border border-border bg-card p-4 mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted-foreground">Exporter</span>
            <div className="flex gap-1.5">
              {([["ordered", "Articles commandés"], ["all", "Tous les articles"]] as const).map(([v, l]) => (
                <button key={v} onClick={() => setScope(v)} className={`px-3 py-2 rounded-lg text-sm font-semibold border ${scope === v ? "bg-emerald-600 text-white border-emerald-600" : "bg-background border-border text-muted-foreground"}`}>{l}</button>
              ))}
            </div>
          </div>
          {scope === "ordered" && (
            <div className="flex items-end gap-2">
              <label className="flex flex-col gap-1"><span className="text-[10px] text-muted-foreground">Du</span><input type="date" value={from} onChange={e => setFrom(e.target.value)} className="px-2 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm" /></label>
              <label className="flex flex-col gap-1"><span className="text-[10px] text-muted-foreground">Au</span><input type="date" value={to} onChange={e => setTo(e.target.value)} className="px-2 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm" /></label>
              <span className="text-xs text-muted-foreground pb-2" title={`Fenetre commande : veille ${cutoffCfg.heureDebut} -> jour J ${cutoffCfg.heureFin}`}>{orderedIds.size} commandé(s) · cycle J-1 {cutoffCfg.heureDebut}→J {cutoffCfg.heureFin}</span>
            </div>
          )}
          <button onClick={doExport} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold">📤 Exporter Excel</button>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted-foreground">Importer le fichier complété</span>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" disabled={importing}
              onChange={e => { const f = e.target.files?.[0]; if (f) doImport(f) }}
              className="text-sm file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-emerald-50 file:text-emerald-700 file:font-bold" />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">Colonnes attendues à l&apos;import : <code>ref</code> (ou id article) + <code>PA_actuel</code>. Les lignes invalides sont comptées et ignorées.</p>
      </div>

      {/* Filtres */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher (nom ou réf)…" className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm" />
        <label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={onlyMissing} onChange={e => setOnlyMissing(e.target.checked)} className="accent-emerald-600 w-4 h-4" />PA manquants uniquement</label>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="bg-muted text-muted-foreground text-xs uppercase">
            <th className="text-left px-3 py-2">Article</th><th className="text-left px-3 py-2 hidden sm:table-cell">Réf</th><th className="text-left px-3 py-2 hidden sm:table-cell">Unité</th><th className="text-right px-3 py-2">PA (DH)</th>
          </tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={4} className="text-center py-8 text-muted-foreground text-sm">Aucun article{onlyMissing ? " sans PA" : ""}.</td></tr>}
            {filtered.slice(0, 400).map(a => (
              <tr key={a.id} className="border-t border-border">
                <td className="px-3 py-2 text-foreground font-medium">
                  {a.nom}
                  {a.nomAr && <span dir="rtl" className="block text-xs text-muted-foreground font-normal">{a.nomAr}</span>}
                </td>
                <td className="px-3 py-2 text-muted-foreground font-mono text-xs hidden sm:table-cell">{a.id}</td>
                <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell">{a.unite}</td>
                <td className="px-3 py-2 text-right">
                  <input type="number" min="0" step="0.01" defaultValue={Number(a.prixAchat) || ""} placeholder="—"
                    onBlur={e => { if (e.target.value !== String(a.prixAchat || "")) setPA(a.id, e.target.value) }}
                    onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }}
                    className={`w-24 px-2 py-1 rounded-lg border text-right text-foreground bg-background ${hasPA(a) ? "border-border" : "border-amber-400"}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 400 && <p className="text-center text-[11px] text-muted-foreground py-2">400 premiers affichés — affinez la recherche.</p>}
      </div>
    </div>
  )
}
