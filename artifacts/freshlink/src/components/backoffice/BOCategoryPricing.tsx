"use client"
import { useState, useEffect, useRef } from "react"
import * as XLSX from "xlsx"
import { store } from "@/lib/store"
import type { Article, Client } from "@/lib/store"

type Cat = "chr" | "marchand" | "particulier"
type Mode = "segment" | "client"

const CAT_LABELS: Record<Cat, string> = { chr: "CHR / HORECA", marchand: "Marchand", particulier: "Particulier" }
const CAT_COLORS: Record<Cat, string> = {
  chr:         "bg-purple-100 text-purple-700 border-purple-200",
  marchand:    "bg-blue-100   text-blue-700   border-blue-200",
  particulier: "bg-green-100  text-green-700  border-green-200",
}

// ── Export / Import helpers (CSV · Excel · JSON) ─────────────────────────────
const EXPORT_FIELDS = ["id","nom","famille","unite","prixAchat","prixCHR","prixMarchand","prixParticulier","promoCHR","promoMarchand","promoParticulier","ajustCHR","ajustMarchand","ajustParticulier","tauxMargeCHR","tauxMargeMarchand","tauxMargeParticulier"] as const

function articleToObj(a: Article): Record<string, unknown> {
  const r = a as unknown as Record<string, unknown>
  const o: Record<string, unknown> = {}
  EXPORT_FIELDS.forEach(f => { o[f] = r[f] ?? "" })
  return o
}
const stamp = () => new Date().toISOString().slice(0, 10)
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a"); a.href = url; a.download = filename
  a.click(); URL.revokeObjectURL(url)
}

function exportCSV(articles: Article[]) {
  const rows = [[...EXPORT_FIELDS], ...articles.map(a => { const o = articleToObj(a); return EXPORT_FIELDS.map(f => o[f]) })]
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n")
  downloadBlob(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }), `tarifs_${stamp()}.csv`)
}

function exportJSON(articles: Article[]) {
  downloadBlob(new Blob([JSON.stringify(articles.map(articleToObj), null, 2)], { type: "application/json" }), `tarifs_${stamp()}.json`)
}

function exportExcel(articles: Article[]) {
  const ws = XLSX.utils.json_to_sheet(articles.map(articleToObj), { header: [...EXPORT_FIELDS] })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Tarifs")
  XLSX.writeFile(wb, `tarifs_${stamp()}.xlsx`)
}

const numOrU = (v: unknown) => { const s = String(v ?? "").trim(); return s === "" ? undefined : Number(s) }
function rowToArticle(row: Record<string, unknown>): Partial<Article> {
  return {
    id:               String(row.id ?? "").trim(),
    prixCHR:          numOrU(row.prixCHR),
    prixMarchand:     numOrU(row.prixMarchand),
    prixParticulier:  numOrU(row.prixParticulier),
    promoCHR:         numOrU(row.promoCHR),
    promoMarchand:    numOrU(row.promoMarchand),
    promoParticulier: numOrU(row.promoParticulier),
    ajustCHR:         numOrU(row.ajustCHR),
    ajustMarchand:    numOrU(row.ajustMarchand),
    ajustParticulier: numOrU(row.ajustParticulier),
    tauxMargeCHR:         numOrU(row.tauxMargeCHR),
    tauxMargeMarchand:    numOrU(row.tauxMargeMarchand),
    tauxMargeParticulier: numOrU(row.tauxMargeParticulier),
  } as Partial<Article>
}

function parseCSV(text: string): Record<string, unknown>[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim())
  return lines.slice(1).map(line => {
    const vals = line.split(",").map(v => v.replace(/^"|"$/g, ""))
    const row: Record<string, unknown> = {}
    headers.forEach((h, i) => { row[h] = vals[i] ?? "" })
    return row
  })
}

type PriceField = "prix" | "promo" | "ajust" | "taux"
const FIELD_MAP: Record<Cat, { prix: keyof Article; promo: keyof Article; ajust: keyof Article; taux: keyof Article }> = {
  chr:         { prix: "prixCHR" as keyof Article,         promo: "promoCHR" as keyof Article,         ajust: "ajustCHR" as keyof Article,         taux: "tauxMargeCHR" as keyof Article },
  marchand:    { prix: "prixMarchand" as keyof Article,    promo: "promoMarchand" as keyof Article,    ajust: "ajustMarchand" as keyof Article,    taux: "tauxMargeMarchand" as keyof Article },
  particulier: { prix: "prixParticulier" as keyof Article, promo: "promoParticulier" as keyof Article, ajust: "ajustParticulier" as keyof Article, taux: "tauxMargeParticulier" as keyof Article },
}
const getField = (cat: Cat): { prix: keyof Article; promo: keyof Article; ajust: keyof Article; taux: keyof Article } => FIELD_MAP[cat]

export default function BOCategoryPricing() {
  const [articles, setArticles]     = useState<Article[]>([])
  const [clients, setClients]       = useState<Client[]>([])
  const [search, setSearch]         = useState("")
  const [showInactive, setShowInactive] = useState(true)   // show ALL articles by default
  const [mode, setMode]             = useState<Mode>("segment")
  const [activeCat, setActiveCat]   = useState<Cat>("chr")
  const [selectedClient, setSelectedClient] = useState<string>("")
  const [edits, setEdits]           = useState<Record<string, { prix?: number; promo?: number; ajust?: number; taux?: number }>>({})
  const [saved, setSaved]           = useState(false)
  const [importMsg, setImportMsg]   = useState<{ ok: boolean; text: string } | null>(null)
  const fileRef                     = useRef<HTMLInputElement>(null)
  // Pricing par famille (application en masse sur le segment actif)
  const [famPanel, setFamPanel]     = useState(false)
  const [famSel, setFamSel]         = useState("")
  // Base de marge : "cout" = PA+charge · "pv" = prix de vente standard · "fixe" = prix absolu
  const [famBase, setFamBase]       = useState<"cout" | "pv" | "fixe">("cout")
  // Type de marge : "pct" = pourcentage % · "dh" = montant fixe en DH (+x DH)
  const [famType, setFamType]       = useState<"pct" | "dh">("pct")
  const [famValeur, setFamValeur]   = useState("")
  // Charges article (PA+charge) — pour la base "cout"
  const [chargesArt, setChargesArt] = useState<{ id: string; nom: string; montant: number }[]>([])

  // Ajustement PV par segment (colonne « Ajust. PV (DH) ») — interprétation d'affichage
  // du signe : on stocke un nombre signé par article (négatif = remise, positif = marge).

  useEffect(() => {
    setArticles(store.getArticles())
    setClients(store.getClients().filter(c => (c as unknown as Record<string,unknown>).actif !== false))
    try { setChargesArt(store.getChargesArticle()) } catch { setChargesArt([]) }
  }, [])

  // Charge unitaire (DH) appliquée à un article via son chargeArticleId
  const chargeOf = (art: Article): number => {
    if (!art.chargeArticleId) return 0
    return Number(chargesArt.find(c => c.id === art.chargeArticleId)?.montant ?? 0) || 0
  }

  const filtered = articles.filter(a => {
    const matchSearch = (a.nom ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (a.famille ?? "").toLowerCase().includes(search.toLowerCase())
    const matchActive = showInactive || a.actif
    return matchSearch && matchActive
  })

  // ── Import handler ──────────────────────────────────────────────────────────
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const name = file.name.toLowerCase()
    const isExcel = name.endsWith(".xlsx") || name.endsWith(".xls")
    const isJSON = name.endsWith(".json")
    const fmt = isExcel ? "Excel" : isJSON ? "JSON" : "CSV"
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        let rawRows: Record<string, unknown>[] = []
        if (isJSON) {
          const parsed = JSON.parse(ev.target?.result as string)
          const arr = Array.isArray(parsed) ? parsed : (parsed as { articles?: unknown[] })?.articles
          rawRows = (Array.isArray(arr) ? arr : []) as Record<string, unknown>[]
        } else if (isExcel) {
          const wb = XLSX.read(ev.target?.result as ArrayBuffer, { type: "array" })
          const ws = wb.Sheets[wb.SheetNames[0]]
          rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" })
        } else {
          rawRows = parseCSV(ev.target?.result as string)
        }
        const rows = rawRows.map(rowToArticle).filter(r => r.id)
        if (rows.length === 0) { setImportMsg({ ok: false, text: "Aucune ligne valide trouvée dans le fichier." }); return }
        const all = store.getArticles()
        let updated = 0
        rows.forEach(row => {
          const idx = all.findIndex(a => a.id === row.id)
          if (idx < 0) return
          const a = all[idx] as unknown as Record<string, unknown>
          if (row.prixCHR !== undefined)          a.prixCHR         = row.prixCHR
          if (row.prixMarchand !== undefined)     a.prixMarchand    = row.prixMarchand
          if (row.prixParticulier !== undefined)  a.prixParticulier = row.prixParticulier
          if (row.promoCHR !== undefined)         a.promoCHR        = row.promoCHR
          if (row.promoMarchand !== undefined)    a.promoMarchand   = row.promoMarchand
          if (row.promoParticulier !== undefined) a.promoParticulier = row.promoParticulier
          if ((row as Record<string,unknown>).ajustCHR !== undefined)         a.ajustCHR         = (row as Record<string,unknown>).ajustCHR
          if ((row as Record<string,unknown>).ajustMarchand !== undefined)    a.ajustMarchand    = (row as Record<string,unknown>).ajustMarchand
          if ((row as Record<string,unknown>).ajustParticulier !== undefined) a.ajustParticulier = (row as Record<string,unknown>).ajustParticulier
          if ((row as Record<string,unknown>).tauxMargeCHR !== undefined)         a.tauxMargeCHR         = (row as Record<string,unknown>).tauxMargeCHR
          if ((row as Record<string,unknown>).tauxMargeMarchand !== undefined)    a.tauxMargeMarchand    = (row as Record<string,unknown>).tauxMargeMarchand
          if ((row as Record<string,unknown>).tauxMargeParticulier !== undefined) a.tauxMargeParticulier = (row as Record<string,unknown>).tauxMargeParticulier
          updated++
        })
        store.saveArticles(all)
        setArticles([...all])
        setImportMsg({ ok: true, text: `${updated} article(s) mis à jour depuis le fichier ${fmt}.` })
        setTimeout(() => setImportMsg(null), 4000)
      } catch {
        setImportMsg({ ok: false, text: `Erreur lors de la lecture du fichier ${fmt}.` })
      }
      if (fileRef.current) fileRef.current.value = ""
    }
    if (isExcel) reader.readAsArrayBuffer(file)
    else reader.readAsText(file, "utf-8")
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  const getSegVal = (art: Article, cat: Cat, field: PriceField): string => {
    const key = getField(cat)[field]
    const edited = edits[art.id]?.[field]
    if (edited !== undefined) return String(edited)
    return String((art as unknown as Record<string, unknown>)[key as string] ?? "")
  }

  const getClientVal = (art: Article, field: PriceField): string => {
    if (!selectedClient) return ""
    const edited = edits[art.id]?.[field]
    if (edited !== undefined) return String(edited)
    const override = field === "taux" ? undefined : art.clientPrices?.[selectedClient]?.[field]
    if (override !== undefined) return String(override)
    return ""
  }

  const setVal = (artId: string, field: PriceField, val: string) => {
    setEdits(prev => ({
      ...prev,
      [artId]: { ...prev[artId], [field]: val === "" ? undefined : Number(val) },
    }))
  }

  // Liste des familles distinctes
  const familles = Array.from(new Set(articles.map(a => a.famille).filter(Boolean))).sort() as string[]

  // Applique un pricing en masse à tous les articles d'une famille → pré-remplit
  // les edits du segment actif (l'utilisateur valide ensuite avec « Enregistrer »).
  const applyFamillePricing = () => {
    const v = Number(famValeur)
    if (!famSel || isNaN(v)) return
    const cible = famSel === "__ALL__" ? articles : articles.filter(a => a.famille === famSel)
    const famLabel = famSel === "__ALL__" ? "Toutes les familles" : famSel
    setEdits(prev => {
      const next = { ...prev }
      cible.forEach(a => {
        const pa     = Number(a.prixAchat) || 0
        const cout   = pa + chargeOf(a)              // PA + charge
        const pv     = store.computePV(a)            // prix de vente standard
        let prix: number
        if (famBase === "fixe") {
          prix = v                                    // prix absolu en DH
        } else {
          const base = famBase === "cout" ? cout : pv
          prix = famType === "pct" ? base * (1 + v / 100) : base + v
        }
        next[a.id] = { ...next[a.id], prix: Math.round(prix * 100) / 100 }
      })
      return next
    })
    const baseLbl = famBase === "fixe" ? "Prix fixe" : famBase === "cout" ? "PA+charge" : "PV"
    const valLbl  = famBase === "fixe" ? `${v} DH` : famType === "pct" ? `${v >= 0 ? "+" : ""}${v}%` : `${v >= 0 ? "+" : ""}${v} DH`
    setImportMsg({ ok: true, text: `${cible.length} article(s) de « ${famLabel} » → ${baseLbl} ${valLbl} sur ${CAT_LABELS[activeCat]}. Cliquez « Enregistrer » pour appliquer.` })
    setTimeout(() => setImportMsg(null), 6000)
  }

  const clientCat = (clientId: string): Cat => {
    const c = clients.find(cl => cl.id === clientId)
    return (c?.categorie as Cat) ?? "particulier"
  }

  const effectivePrix = (art: Article): number => {
    if (mode === "client" && selectedClient) {
      const override = edits[art.id]?.prix ?? art.clientPrices?.[selectedClient]?.prix
      const promo  = Number(getClientVal(art, "promo")) || 0
      const ajust  = Number(getClientVal(art, "ajust")) || 0
      let base: number
      if (override && override > 0) base = override
      else {
        const cat = clientCat(selectedClient)
        const catPrix = (art as unknown as Record<string, unknown>)[getField(cat).prix as string] as number
        base = catPrix > 0 ? catPrix : store.computePV(art)
      }
      return Math.round((base * (1 - promo / 100) + ajust) * 100) / 100
    }
    const catPrix = Number(getSegVal(art, activeCat, "prix")) || 0
    const promo   = Number(getSegVal(art, activeCat, "promo")) || 0
    const ajust   = Number(getSegVal(art, activeCat, "ajust")) || 0
    const base    = catPrix > 0 ? catPrix : store.computePV(art)
    return Math.round((base * (1 - promo / 100) + ajust) * 100) / 100
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    const all = store.getArticles()
    const touchedIds: string[] = []
    for (const [artId, edit] of Object.entries(edits)) {
      const idx = all.findIndex(a => a.id === artId)
      if (idx < 0) continue
      touchedIds.push(artId)
      if (mode === "segment") {
        const { prix: prixKey, promo: promoKey, ajust: ajustKey, taux: tauxKey } = getField(activeCat)
        if (edit.prix  !== undefined) (all[idx] as unknown as Record<string, unknown>)[prixKey  as string] = edit.prix
        if (edit.promo !== undefined) (all[idx] as unknown as Record<string, unknown>)[promoKey as string] = edit.promo
        if (edit.ajust !== undefined) (all[idx] as unknown as Record<string, unknown>)[ajustKey as string] = edit.ajust
        if (edit.taux  !== undefined) (all[idx] as unknown as Record<string, unknown>)[tauxKey  as string] = edit.taux
      } else if (selectedClient) {
        if (!all[idx].clientPrices) all[idx].clientPrices = {}
        const prev = all[idx].clientPrices![selectedClient] ?? {}
        all[idx].clientPrices![selectedClient] = {
          ...prev,
          ...(edit.prix  !== undefined ? { prix:  edit.prix  } : {}),
          ...(edit.promo !== undefined ? { promo: edit.promo } : {}),
          ...(edit.ajust !== undefined ? { ajust: edit.ajust } : {}),
        }
        if (edit.prix === undefined && edit.promo === undefined && edit.ajust === undefined)
          delete all[idx].clientPrices![selectedClient]
      }
    }
    store.saveArticles(all)
    setArticles(all)
    setEdits({})
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    // Synchronise vers Supabase pour propager les tarifs aux mobiles
    // (prévendeurs/acheteurs voient le prix CHR/Marchand/Particulier mis à jour).
    const { upsertArticle } = await import("@/lib/supabase/db")
    for (const id of touchedIds) {
      const art = all.find(a => a.id === id)
      if (art) upsertArticle(art)
    }
  }

  const clearClientOverride = async (artId: string) => {
    const all = store.getArticles()
    const idx = all.findIndex(a => a.id === artId)
    if (idx >= 0 && all[idx].clientPrices?.[selectedClient]) {
      delete all[idx].clientPrices![selectedClient]
      store.saveArticles(all)
      setArticles(all)
      setEdits(prev => { const n = { ...prev }; delete n[artId]; return n })
      const { upsertArticle } = await import("@/lib/supabase/db")
      upsertArticle(all[idx])
    }
  }

  const currentClient = clients.find(c => c.id === selectedClient)
  const currentClientCat = selectedClient ? clientCat(selectedClient) : "particulier"

  return (
    <div className="flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Tarifs par Catégorie</h2>
          <p className="text-xs text-muted-foreground">
            {articles.length} articles · Prix par segment ou par client individuel
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Exports : CSV · Excel · JSON */}
          <div className="flex items-center rounded-xl border border-border bg-card overflow-hidden">
            <span className="px-2 text-xs text-muted-foreground border-r border-border self-stretch flex items-center">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            </span>
            <button onClick={() => exportCSV(articles)} title="Exporter en CSV" className="px-3 py-2 text-sm font-semibold hover:bg-muted transition-colors">CSV</button>
            <button onClick={() => exportExcel(articles)} title="Exporter en Excel (.xlsx)" className="px-3 py-2 text-sm font-semibold border-l border-border hover:bg-muted transition-colors">Excel</button>
            <button onClick={() => exportJSON(articles)} title="Exporter en JSON" className="px-3 py-2 text-sm font-semibold border-l border-border hover:bg-muted transition-colors">JSON</button>
          </div>
          {/* Import : CSV · Excel · JSON */}
          <label
            title="Importer des tarifs (CSV, Excel ou JSON)"
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-card text-sm font-semibold hover:bg-muted transition-colors cursor-pointer">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Importer
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.json" onChange={handleImport} className="hidden" />
          </label>
          {/* Save */}
          <button
            onClick={handleSave}
            disabled={Object.keys(edits).length === 0}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-opacity"
            style={{ background: "oklch(0.38 0.2 260)" }}>
            {saved ? "✓ Sauvegardé" : "Enregistrer les tarifs"}
          </button>
        </div>
      </div>

      {/* Import feedback */}
      {importMsg && (
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm border ${importMsg.ok ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={importMsg.ok ? "M5 13l4 4L19 7" : "M6 18L18 6M6 6l12 12"} />
          </svg>
          {importMsg.text}
        </div>
      )}

      {/* Mode toggle */}
      <div className="flex items-center gap-1 p-1 bg-muted rounded-xl w-fit border border-border">
        <button
          onClick={() => { setMode("segment"); setEdits({}) }}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${mode === "segment" ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          Par segment
        </button>
        <button
          onClick={() => { setMode("client"); setEdits({}) }}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${mode === "client" ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          Par client individuel
        </button>
      </div>

      {/* Segment tabs OR client selector */}
      {mode === "segment" ? (
        <div className="flex gap-2 flex-wrap">
          {(["chr", "marchand", "particulier"] as Cat[]).map(cat => (
            <button
              key={cat}
              onClick={() => { setActiveCat(cat); setEdits({}) }}
              className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
                activeCat === cat
                  ? CAT_COLORS[cat] + " shadow-sm"
                  : "border-border text-muted-foreground hover:text-foreground bg-card"
              }`}>
              {CAT_LABELS[cat]}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-60">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <select
                value={selectedClient}
                onChange={e => { setSelectedClient(e.target.value); setEdits({}) }}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary appearance-none">
                <option value="">-- Sélectionner un client --</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.nom} {c.categorie ? `(${CAT_LABELS[c.categorie as Cat] ?? c.categorie})` : ""}
                  </option>
                ))}
              </select>
            </div>
            {currentClient && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold ${CAT_COLORS[currentClientCat]}`}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                Segment : {CAT_LABELS[currentClientCat]}
              </div>
            )}
          </div>
          {selectedClient && (
            <p className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Les prix sauvegardés ici s'appliquent uniquement à <strong>{currentClient?.nom}</strong> et
              remplacent les tarifs du segment {CAT_LABELS[currentClientCat]}.
            </p>
          )}
        </div>
      )}

      {/* Search + filter */}
      <div className="flex gap-2 items-center flex-wrap">
        <div className="relative flex-1 min-w-52">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un article ou famille..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)}
            className="w-4 h-4 rounded text-primary" />
          Inclure inactifs
        </label>
        <span className="text-xs text-muted-foreground bg-muted rounded-lg px-2 py-1.5 font-medium">
          {filtered.length}/{articles.length} articles
        </span>
        {mode === "segment" && (
          <button onClick={() => setFamPanel(v => !v)}
            className="text-xs font-bold px-3 py-1.5 rounded-lg border border-primary/30 text-primary hover:bg-primary/5">
            🏷️ Pricing par famille
          </button>
        )}
      </div>

      {/* Pricing par famille — application en masse sur le segment actif */}
      {mode === "segment" && famPanel && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-bold text-foreground">🏷️ Prix de vente par famille — segment {CAT_LABELS[activeCat]}</h3>
            <span className="text-[11px] text-muted-foreground">Applique un prix/marge à tous les articles d&apos;une famille en une fois</span>
          </div>
          <div className="grid sm:grid-cols-5 gap-2 items-end">
            <label className="flex flex-col gap-1 text-[11px] font-semibold text-foreground">
              Famille
              <select value={famSel} onChange={e => setFamSel(e.target.value)}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">— Choisir —</option>
                <option value="__ALL__">🌐 Toutes les familles</option>
                {familles.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-semibold text-foreground">
              Base de marge
              <select value={famBase} onChange={e => setFamBase(e.target.value as "cout" | "pv" | "fixe")}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="cout">Sur PA + charge</option>
                <option value="pv">Sur PV standard</option>
                <option value="fixe">Prix fixe (DH)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-semibold text-foreground">
              Type de marge
              <select value={famType} onChange={e => setFamType(e.target.value as "pct" | "dh")}
                disabled={famBase === "fixe"}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50">
                <option value="pct">Pourcentage %</option>
                <option value="dh">Montant + DH</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-semibold text-foreground">
              {famBase === "fixe" ? "Prix (DH)" : famType === "pct" ? "Marge (%)" : "Marge (DH)"}
              <input type="number" step="0.01" value={famValeur} onChange={e => setFamValeur(e.target.value)}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-primary" />
            </label>
            <button onClick={applyFamillePricing} disabled={!famSel || famValeur === ""}
              className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-primary disabled:opacity-50">
              Appliquer
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            <strong>Base</strong> : « PA + charge » = coût de revient (prix d&apos;achat + charge article) · « PV standard » = prix de vente calculé · « Prix fixe » = montant absolu.
            <strong> Type</strong> : % (ex : +25 %) ou montant en DH (ex : +3 DH). Valeur négative = remise.
          </p>
          <p className="text-[11px] text-amber-700">⚠️ « Appliquer » pré-remplit les prix ; cliquez ensuite <strong>Enregistrer</strong> pour sauvegarder.</p>
        </div>
      )}

      {/* Empty state for client mode without selection */}
      {mode === "client" && !selectedClient && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center bg-card rounded-xl border border-border">
          <svg className="w-10 h-10 text-muted-foreground/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <p className="text-sm font-medium text-muted-foreground">Sélectionnez un client pour voir et modifier ses tarifs individuels</p>
        </div>
      )}

      {/* Table */}
      {(mode === "segment" || selectedClient) && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Article</th>
                  <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Prix standard (DH)</th>
                  {mode === "segment" ? (
                    <>
                      <th className="text-center px-4 py-3 font-semibold">
                        <span className={`px-2 py-0.5 rounded-full text-xs border ${CAT_COLORS[activeCat]}`}>{CAT_LABELS[activeCat]}</span>
                        {" "}Prix (DH)
                      </th>
                      <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Remise %</th>
                      <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Ajust. PV (DH)</th>
                      <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Taux marge cible (%)</th>
                    </>
                  ) : (
                    <>
                      <th className="text-center px-4 py-3 font-semibold">
                        <span className={`px-2 py-0.5 rounded-full text-xs border ${CAT_COLORS[currentClientCat]}`}>{CAT_LABELS[currentClientCat]}</span>
                        {" "}Prix segment
                      </th>
                      <th className="text-center px-4 py-3 font-semibold text-amber-700">Override prix (DH)</th>
                      <th className="text-center px-4 py-3 font-semibold text-amber-700">Override remise %</th>
                      <th className="text-center px-4 py-3 font-semibold text-amber-700">Ajust. PV (DH)</th>
                    </>
                  )}
                  <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Prix final</th>
                  {mode === "client" && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {filtered.map(art => {
                  const stdPrix = store.computePV(art)
                  const final   = effectivePrix(art)
                  const hasOverride = mode === "client" && selectedClient && !!art.clientPrices?.[selectedClient]

                  if (mode === "segment") {
                    const catPrix  = Number(getSegVal(art, activeCat, "prix"))  || 0
                    const catPromo = Number(getSegVal(art, activeCat, "promo")) || 0
                    const catAjust = Number(getSegVal(art, activeCat, "ajust")) || 0
                    const hasCustom = catPrix > 0 || catPromo > 0 || catAjust !== 0
                    return (
                      <tr key={art.id} className={`border-b border-border last:border-0 hover:bg-muted/20 ${hasCustom ? "bg-primary/[0.03]" : ""} ${!art.actif ? "opacity-60" : ""}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-foreground">{art.nom}</p>
                            {!art.actif && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">Inactif</span>}
                          </div>
                          <p className="text-xs text-muted-foreground">{art.famille} · {art.unite}{art.um ? ` / ${art.um}` : ""}</p>
                        </td>
                        <td className="px-4 py-3 text-center text-muted-foreground font-mono">{stdPrix} DH</td>
                        <td className="px-4 py-3 text-center">
                          <input type="number" min={0} step={0.5}
                            value={getSegVal(art, activeCat, "prix")}
                            onChange={e => setVal(art.id, "prix", e.target.value)}
                            placeholder={String(stdPrix)}
                            className="w-24 px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-primary" />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <input type="number" min={0} max={100} step={1}
                              value={getSegVal(art, activeCat, "promo")}
                              onChange={e => setVal(art.id, "promo", e.target.value)}
                              placeholder="0"
                              className="w-16 px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-primary" />
                            <span className="text-xs text-muted-foreground">%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <input type="number" step={0.5}
                              value={getSegVal(art, activeCat, "ajust")}
                              onChange={e => setVal(art.id, "ajust", e.target.value)}
                              placeholder="0"
                              title="Ajustement PV en DH : négatif = remise, positif = marge (appliqué après la remise %)"
                              className="w-20 px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-primary" />
                            <span className="text-xs text-muted-foreground">DH</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {(() => {
                            const cout = (Number(art.prixAchat) || 0) + chargeOf(art)
                            const margeReelle = final > 0 ? ((final - cout) / final) * 100 : 0
                            const tauxCible = Number(getSegVal(art, activeCat, "taux")) || 0
                            const sousCible = tauxCible > 0 && margeReelle < tauxCible
                            return (
                              <div className="flex flex-col items-center gap-0.5">
                                <div className="flex items-center justify-center gap-1">
                                  <input type="number" min={0} max={100} step={0.5}
                                    value={getSegVal(art, activeCat, "taux")}
                                    onChange={e => setVal(art.id, "taux", e.target.value)}
                                    placeholder="0"
                                    title="Taux de marge cible (%) — indicatif, n'affecte pas le prix final"
                                    className="w-16 px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-primary" />
                                  <span className="text-xs text-muted-foreground">%</span>
                                </div>
                                <span className={`text-[10px] font-semibold ${sousCible ? "text-red-600" : "text-muted-foreground"}`}>
                                  réel : {margeReelle.toFixed(1)}%
                                </span>
                              </div>
                            )
                          })()}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-bold font-mono ${hasCustom ? "text-primary" : "text-muted-foreground"}`}>
                            {final.toFixed(2)} DH
                          </span>
                        </td>
                      </tr>
                    )
                  }

                  // ── Par client ─────────────────────────────────────────
                  const segPrixKey = getField(currentClientCat).prix
                  const segPrix = (art as unknown as Record<string, unknown>)[segPrixKey as string] as number || stdPrix
                  return (
                    <tr key={art.id} className={`border-b border-border last:border-0 hover:bg-muted/20 ${hasOverride ? "bg-amber-50/50" : ""} ${!art.actif ? "opacity-60" : ""}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-foreground">{art.nom}</p>
                          {!art.actif && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">Inactif</span>}
                        </div>
                        <p className="text-xs text-muted-foreground">{art.famille} · {art.unite}{art.um ? ` / ${art.um}` : ""}</p>
                        {hasOverride && (
                          <span className="inline-block mt-0.5 text-[10px] font-bold text-amber-700 bg-amber-100 rounded-full px-1.5 py-0.5">override actif</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground font-mono">{stdPrix} DH</td>
                      <td className="px-4 py-3 text-center text-muted-foreground font-mono">{segPrix} DH</td>
                      <td className="px-4 py-3 text-center">
                        <input type="number" min={0} step={0.5}
                          value={getClientVal(art, "prix")}
                          onChange={e => setVal(art.id, "prix", e.target.value)}
                          placeholder="—"
                          className="w-24 px-2 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-amber-400" />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <input type="number" min={0} max={100} step={1}
                            value={getClientVal(art, "promo")}
                            onChange={e => setVal(art.id, "promo", e.target.value)}
                            placeholder="—"
                            className="w-16 px-2 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-amber-400" />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <input type="number" step={0.5}
                            value={getClientVal(art, "ajust")}
                            onChange={e => setVal(art.id, "ajust", e.target.value)}
                            placeholder="—"
                            title="Ajustement PV en DH : négatif = remise, positif = marge (appliqué après la remise %)"
                            className="w-20 px-2 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-amber-400" />
                          <span className="text-xs text-muted-foreground">DH</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-bold font-mono ${hasOverride ? "text-amber-700" : "text-muted-foreground"}`}>
                          {final.toFixed(2)} DH
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {hasOverride && (
                          <button
                            onClick={() => clearClientOverride(art.id)}
                            title="Supprimer override"
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="text-center py-12 text-muted-foreground text-sm">Aucun article trouvé</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
