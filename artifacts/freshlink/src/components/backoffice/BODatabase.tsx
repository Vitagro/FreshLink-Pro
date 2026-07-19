"use client"

import { useState, useEffect, useRef } from "react"
import { store, type Client } from "@/lib/store"
import { hasPermission } from "@/lib/permissions"
import { logAction } from "@/lib/auditLog"
import { fetchClients, upsertClient, importClients, getLastSupabaseError } from "@/lib/supabase/db"
import { createClient } from "@/lib/supabase/client"

const DH = (n: number) => `${n.toLocaleString("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`

// ── CSV parser ──────────────────────────────────────────────────────────────
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = lines[0].split(",").map(h => h.trim().replace(/"/g, ""))
  return lines.slice(1).map(line => {
    const vals = line.split(",").map(v => v.trim().replace(/"/g, ""))
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]))
  })
}

// Map a raw CSV row → Client (best-effort field matching)
function csvRowToClient(row: Record<string, string>, createdBy: string): Client {
  const get = (...keys: string[]) => keys.map(k => row[k] || row[k.toLowerCase()] || "").find(v => v) || ""
  return {
    id: get("id") || store.genId(),
    nom: get("nom", "name", "client"),
    secteur: get("secteur", "sector", "quartier"),
    zone: get("zone", "region"),
    type: (get("type") as Client["type"]) || "autre",
    taille: (get("taille", "volume") as Client["taille"]) || "50-100kg",
    typeProduits: (get("type_produits", "gamme") as Client["typeProduits"]) || "moyenne",
    rotation: (get("rotation") as Client["rotation"]) || "journalier",
    telephone: get("telephone", "tel", "phone"),
    email: get("email"),
    adresse: get("adresse", "address"),
    ice: get("ice"),
    notes: get("notes"),
    gpsLat: parseFloat(get("gps_lat", "lat")) || undefined,
    gpsLng: parseFloat(get("gps_lng", "lng")) || undefined,
    createdBy,
    createdAt: new Date().toISOString(),
  }
}

type Section = "achats" | "commandes" | "receptions" | "stock" | "livraisons" | "retours" | "trips" | "trip_charges" | "caisses_mvt" | "clients" | "users"

const SECTIONS: { id: Section; label: string; labelAr: string; icon: string }[] = [
  { id: "achats",       label: "Bons d'achat",        labelAr: "وصولات الشراء",    icon: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" },
  { id: "commandes",    label: "Commandes",            labelAr: "الطلبيات",         icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
  { id: "receptions",   label: "Réceptions",           labelAr: "الاستقبال",        icon: "M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" },
  { id: "stock",        label: "Stock articles",       labelAr: "المخزون",          icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" },
  { id: "livraisons",   label: "Bons de livraison",    labelAr: "وصولات التسليم",   icon: "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" },
  { id: "retours",      label: "Retours",              labelAr: "المرتجعات",        icon: "M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" },
  { id: "trips",        label: "Trips / Tournées",     labelAr: "الرحلات",          icon: "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" },
  { id: "trip_charges", label: "Charges Trip",         labelAr: "مصاريف الرحلة",   icon: "M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M12 7h.01M15 7h.01M9 7H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-2M7 7V5a2 2 0 012-2h8a2 2 0 012 2v2" },
  { id: "caisses_mvt",  label: "Caisses Vides (mvt)",  labelAr: "الصناديق الفارغة", icon: "M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" },
  { id: "clients",      label: "Clients",              labelAr: "الزبائن",          icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
  { id: "users",        label: "Utilisateurs",         labelAr: "المستخدمون",       icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" },
]

function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center">
        <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>
      <div className="text-center">
        <p className="text-lg font-bold text-foreground">Acces restreint</p>
        <p className="text-sm text-muted-foreground mt-1">Cette section est reservee aux administrateurs.</p>
      </div>
    </div>
  )
}

export default function BODatabase({ user }: { user: { id: string; role?: string } }) {
  // --- ALL hooks MUST come before any conditional return (Rules of Hooks) ---
  const [section, setSection] = useState<Section>("commandes")
  const [search, setSearch] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any[]>([])
  const [counts, setCounts] = useState<Record<Section, number>>({} as Record<Section, number>)
  const [sbStatus, setSbStatus] = useState<"idle" | "syncing" | "ok" | "local">("idle")
  const [sbMsg, setSbMsg] = useState("")
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ inserted: number; updated: number; errors: number } | null>(null)
  const [syncErrorAlert, setSyncErrorAlert] = useState<{ table: string; error: string; code?: string } | null>(null)
  const [writeTestResult, setWriteTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [writeTestLoading, setWriteTestLoading] = useState(false)
  const [forceSyncLoading, setForceSyncLoading] = useState(false)
  const [forceSyncResult, setForceSyncResult] = useState<{ table: string; count: number; error?: string }[] | null>(null)
  const csvRef = useRef<HTMLInputElement>(null)
  const canAccess = user.role === "super_super_admin" || user.role === "admin" || user.role === "super_admin"

  const ERP_SYNC_KEYS: Record<string, string> = {
    fl_users:            "fl_users",
    fl_clients:          "fl_clients",
    fl_articles:         "fl_articles",
    fl_fournisseurs:     "fl_fournisseurs",
    fl_commandes:        "fl_commandes",
    fl_bons_livraison:   "fl_bons_livraison",
    fl_trips:            "fl_trips",
    fl_retours:          "fl_retours",
    fl_bons_achat:       "fl_bons_achat",
    fl_bons_preparation: "fl_bons_preparation",
    fl_receptions:       "fl_receptions",
    fl_transferts:       "fl_transferts_stock",
    fl_messages:         "fl_messages",
    fl_depots:           "fl_depots",
    fl_livreurs:         "fl_livreurs",
    fl_visites:          "fl_visites",
    fl_demandes_achat:   "fl_demandes_achat",
    fl_notices:          "fl_notices",
    fl_non_achats:       "fl_non_achats",
    fl_caisses_etrangeres: "fl_caisses_etrangeres",
  }

  // ALL useEffects MUST be before any conditional return
  useEffect(() => {
    if (!canAccess) return
    setCounts({
      achats:       store.getBonsAchat().length,
      commandes:    store.getCommandes().length,
      receptions:   store.getReceptions().length,
      stock:        store.getArticles().length,
      livraisons:   store.getBonsLivraison().length,
      retours:      store.getRetours().length,
      trips:        store.getTrips().length,
      trip_charges: store.getTripCharges().length,
      caisses_mvt:  store.getCaissesMovements().length,
      clients:      store.getClients().length,
      users:        store.getUsers().length,
    })
  }, [canAccess])

  // Détecter si l'utilisateur courant est un compte démo
  const isCurrentUserDemo = (() => {
    try {
      const session = store.getSession()
      if (!session) return false
      const demoEmails = new Set(["livreur@freshlink.ma","client.demo@freshlink.ma","fournisseur.demo@freshlink.ma"])
      return demoEmails.has(session.email?.toLowerCase() ?? "") || (session.name?.toLowerCase().startsWith("demo") ?? false)
    } catch { return false }
  })()

  useEffect(() => {
    if (!canAccess) return
    setSbStatus("syncing")
    fetchClients().then(({ clients, source }) => {
      if (source === "supabase") {
        setSbStatus("ok")
        setSbMsg(clients.length > 0
          ? `${clients.length} clients — Supabase actif`
          : `Supabase connecté — prêt à synchroniser`)
      } else {
        setSbStatus("local")
        if (isCurrentUserDemo) {
          setSbMsg(`${clients.length} entrées — compte démo`)
        } else {
          const why = getLastSupabaseError()
          const hint = why
            ? (/service.?role|SUPABASE_SERVICE_ROLE_KEY/i.test(why)
                ? "clé service-role manquante sur Vercel"
                : /device|autoris/i.test(why)
                  ? "appareil non autorisé (reconnexion requise)"
                  : why)
            : "API injoignable"
          setSbMsg(`${clients.length} entrées locales — Supabase non joignable (${hint})`)
        }
      }
    }).catch(() => {
      setSbStatus("local")
      setSbMsg("Supabase inaccessible — données locales affichées")
    })
  }, [canAccess, isCurrentUserDemo])

  // fl_sync_error listener — must be before guard
  useEffect(() => {
    if (!canAccess) return
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { table: string; error: string; code?: string }
      setSyncErrorAlert(detail)
    }
    window.addEventListener("fl_sync_error", handler)
    return () => window.removeEventListener("fl_sync_error", handler)
  }, [canAccess])

  // 3rd useEffect: reload table data when section changes — must also be before guard
  useEffect(() => {
    if (!canAccess) return
    // Pour les comptes non-démo : filtrer les entrées de seed/démo
    // Une entrée est "démo" si createdBy est un compte démo ou si le nom commence par "Demo_"
    const demoCreators = new Set(["u_com_demo","u_liv_demo","demo_admin","demo_seed"])
    const filterDemo = <T extends object>(arr: T[]): T[] => {
      if (isCurrentUserDemo) return arr // démo voit tout
      return arr.filter(item => {
        const rec = item as Record<string, unknown>
        const cb = String(rec.createdBy ?? rec.created_by ?? "")
        const nom = String(rec.nom ?? rec.name ?? rec.libelle ?? "").toLowerCase()
        return !demoCreators.has(cb) && !nom.startsWith("demo_") && !nom.startsWith("__test")
      })
    }
    const loaders: Record<Section, () => unknown[]> = {
      achats:       () => filterDemo(store.getBonsAchat()),
      commandes:    () => filterDemo(store.getCommandes()),
      receptions:   () => filterDemo(store.getReceptions()),
      stock:        () => filterDemo(store.getArticles()),
      livraisons:   () => filterDemo(store.getBonsLivraison()),
      retours:      () => filterDemo(store.getRetours()),
      trips:        () => filterDemo(store.getTrips()),
      trip_charges: () => filterDemo(store.getTripCharges()),
      caisses_mvt:  () => filterDemo(store.getCaissesMovements()),
      clients:      () => filterDemo(store.getClients()),
      users:        () => filterDemo(store.getUsers().map(u => ({ ...u, password: "***" }))),
    }
    setData(loaders[section]())
    setSearch("")
  }, [section, canAccess, isCurrentUserDemo])

  // Guard AFTER all hooks — safe conditional render
  if (!canAccess) return <AccessDenied />

  const handleWriteTest = async () => {
    setWriteTestLoading(true)
    setWriteTestResult(null)
    try {
      const testId = `__test_${Date.now()}`
      const res = await fetch("/api/sync-write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: "fl_clients", upserts: [{ id: testId, payload: { id: testId, nom: "__TEST__" }, updated_at: new Date().toISOString() }] }),
      })
      const json = await res.json() as { ok: boolean; errors?: string[] }
      if (!json.ok) {
        setWriteTestResult({ ok: false, message: `Ecriture echouee via /api/sync-write: ${json.errors?.join(", ")}` })
        setWriteTestLoading(false)
        return
      }
      // cleanup
      await fetch("/api/sync-write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: "fl_clients", deletes: [testId] }),
      })
      setWriteTestResult({ ok: true, message: "Ecriture et suppression reussies via service role — RLS bypasse correctement." })
    } catch (e) {
      setWriteTestResult({ ok: false, message: `Erreur inattendue: ${String(e)}` })
    }
    setWriteTestLoading(false)
  }

  const handleForceSync = async () => {
    const session = store.getSession()
    if (!hasPermission(session?.role, "backup_restore")) { logAction(session, "backup_restore", "denied", { type: "sync_forcee" }); return }
    logAction(session, "backup_restore", "success", { type: "sync_forcee" })
    setForceSyncLoading(true)
    setForceSyncResult(null)
    const results: { table: string; count: number; error?: string }[] = []
    for (const [lsKey, sbTable] of Object.entries(ERP_SYNC_KEYS)) {
      try {
        const raw = localStorage.getItem(lsKey)
        if (!raw) { results.push({ table: sbTable, count: 0 }); continue }
        const items: Array<Record<string, unknown>> = JSON.parse(raw)
        const validItems = Array.isArray(items) ? items.filter(i => i && i.id) : []
        if (validItems.length === 0) { results.push({ table: sbTable, count: 0 }); continue }
        const upserts = validItems.map(item => ({ id: item.id as string, payload: item, updated_at: new Date().toISOString() }))
        // Send in batches of 50 to avoid oversized payloads
        const CHUNK = 50
        let batchOk = true
        let batchErr = ""
        for (let ci = 0; ci < upserts.length; ci += CHUNK) {
          const chunk = upserts.slice(ci, ci + CHUNK)
          const res = await fetch("/api/sync-write", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ table: sbTable, upserts: chunk }),
          })
          if (!res.ok) { batchOk = false; batchErr = `HTTP ${res.status}`; break }
          const json = await res.json() as { ok: boolean; errors?: string[] }
          if (!json.ok) { batchOk = false; batchErr = json.errors?.join(", ") ?? "Erreur inconnue"; break }
        }
        if (!batchOk) {
          results.push({ table: sbTable, count: 0, error: batchErr })
        } else {
          results.push({ table: sbTable, count: upserts.length })
        }
      } catch (e) {
        results.push({ table: sbTable, count: 0, error: String(e) })
      }
    }
    setForceSyncResult(results)
    setForceSyncLoading(false)
  }

  const handleClientImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportResult(null)
    const isExcel = file.name.endsWith(".xlsx") || file.name.endsWith(".xls")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rows: any[] = []
    if (isExcel) {
      try {
        const buffer = await file.arrayBuffer()
        const XLSX = await import("xlsx")
        const wb = XLSX.read(buffer, { type: "array" })
        const ws = wb.Sheets[wb.SheetNames[0]]
        rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" })
      } catch { setImporting(false); alert("Fichier Excel invalide"); return }
    } else {
      const text = await file.text()
      if (file.name.endsWith(".json")) {
        try {
          const parsed = JSON.parse(text)
          rows = Array.isArray(parsed) ? parsed : []
        } catch { setImporting(false); alert("Fichier JSON invalide"); return }
      } else {
        rows = parseCSV(text)
      }
    }
    if (rows.length === 0) { setImporting(false); alert("Aucune ligne valide trouvée dans le fichier."); return }

    let inserted = 0; let updated = 0; let errors = 0

    try {
      if (section === "clients") {
        const clients = rows.filter(r => r.nom || r.name).map(r => csvRowToClient(r, user.id))
        const result = await importClients(clients)
        inserted = result.inserted; updated = result.updated; errors = result.errors
      } else if (section === "stock") {
        const existing = store.getArticles()
        rows.forEach(r => {
          if (!r.nom) { errors++; return }
          const idx = existing.findIndex(a => a.id === r.id || a.nom === r.nom)
          if (idx >= 0) { existing[idx] = { ...existing[idx], ...r }; updated++ }
          else { existing.push({ ...r, id: r.id || store.genId(), stockDefect: r.stockDefect ?? 0, historiquePrixAchat: [] }); inserted++ }
        })
        store.saveArticles(existing)
      } else if (section === "commandes") {
        const existing = store.getCommandes()
        rows.forEach(r => {
          if (!r.id) { errors++; return }
          const idx = existing.findIndex(c => c.id === r.id)
          if (idx >= 0) { existing[idx] = { ...existing[idx], ...r }; updated++ }
          else { existing.push(r); inserted++ }
        })
        store.saveCommandes(existing)
      } else if (section === "trips") {
        const existing = store.getTrips()
        rows.forEach(r => {
          if (!r.id) { errors++; return }
          const idx = existing.findIndex(t => t.id === r.id)
          if (idx >= 0) { existing[idx] = { ...existing[idx], ...r }; updated++ }
          else { existing.push(r); inserted++ }
        })
        store.saveTrips(existing)
      } else if (section === "livraisons") {
        const existing = store.getBonsLivraison()
        rows.forEach(r => {
          if (!r.id) { errors++; return }
          const idx = existing.findIndex(b => b.id === r.id)
          if (idx >= 0) { existing[idx] = { ...existing[idx], ...r }; updated++ }
          else { existing.push(r); inserted++ }
        })
        store.saveBonsLivraison(existing)
      } else if (section === "retours") {
        const existing = store.getRetours()
        rows.forEach(r => {
          if (!r.id) { errors++; return }
          const idx = existing.findIndex(x => x.id === r.id)
          if (idx >= 0) { existing[idx] = { ...existing[idx], ...r }; updated++ }
          else { existing.push(r); inserted++ }
        })
        store.saveRetours(existing)
      } else {
        errors = rows.length
        alert(`Import direct non supporté pour "${section}". Utilisez le backup JSON complet.`)
      }
    } catch {
      errors += rows.length
    }

    setImportResult({ inserted, updated, errors })
    setImporting(false)
    // Refresh counts + table
    setCounts(c => ({ ...c, [section]: (store as unknown as Record<string, () => unknown[]>)[`get${section[0].toUpperCase() + section.slice(1)}`]?.()?.length ?? c[section] }))
    setData((loaders => loaders[section]())({
      achats: () => store.getBonsAchat(),
      commandes: () => store.getCommandes(),
      receptions: () => store.getReceptions(),
      stock: () => store.getArticles(),
      livraisons: () => store.getBonsLivraison(),
      retours: () => store.getRetours(),
      trips: () => store.getTrips(),
      clients: () => store.getClients(),
      users: () => store.getUsers().map(u => ({ ...u, password: "***" })),
    } as Record<Section, () => unknown[]>))
    e.target.value = ""
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filtered = data.filter((row: any) => {
    if (!search && !dateFrom && !dateTo) return true
    const str = JSON.stringify(row).toLowerCase()
    const matchSearch = !search || str.includes(search.toLowerCase())
    const matchDate = !row.date || ((!dateFrom || row.date >= dateFrom) && (!dateTo || row.date <= dateTo))
    return matchSearch && matchDate
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderValue = (v: any): string => {
    if (v === null || v === undefined) return "—"
    if (typeof v === "boolean") return v ? "Oui" : "Non"
    if (typeof v === "object" && !Array.isArray(v)) return JSON.stringify(v)
    if (Array.isArray(v)) return `[${v.length} items]`
    return String(v)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getColumns = (rows: any[]): string[] => {
    if (rows.length === 0) return []
    const priorityCols: Record<Section, string[]> = {
      commandes: ["id", "date", "clientNom", "commercialNom", "secteur", "statut", "heurelivraison"],
      achats: ["id", "date", "fournisseurNom", "acheteurNom", "statut"],
      livraisons: ["id", "date", "clientNom", "livreurNom", "montantTotal", "montantTTC", "statut", "statutLivraison"],
      receptions: ["id", "date", "bonAchatId", "statut", "operateurId"],
      stock: ["id", "nom", "nomAr", "famille", "stockDisponible", "stockDefect", "prixAchat"],
      retours: ["id", "date", "livreurNom", "statut"],
      trips: ["id", "date", "livreurNom", "vehicule", "statut"],
      trip_charges: ["id", "numero", "date", "livreur", "immatricule", "secteur", "nbClients", "validated"],
      caisses_mvt: ["id", "date", "type", "montant", "libelle", "categorie"],
      clients: ["id", "nom", "secteur", "zone", "type", "taille", "telephone"],
      users: ["id", "name", "email", "role", "secteur", "actif"],
    }
    return priorityCols[section] || Object.keys(rows[0]).slice(0, 8)
  }

  const columns = getColumns(filtered)

  // Summary stats
  const totalCA = section === "livraisons" ? filtered.reduce((s: number, r: { montantTTC?: number }) => s + (r.montantTTC || 0), 0) : 0
  const totalCommandes = section === "commandes" ? filtered.reduce((s: number, r: { lignes?: { quantite: number }[] }) => s + (r.lignes?.reduce((ls: number, l: { quantite: number }) => ls + l.quantite, 0) || 0), 0) : 0

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-foreground">Base de données <span className="text-muted-foreground font-normal text-base mr-1">/ قاعدة البيانات</span></h2>
          <p className="text-sm text-muted-foreground">Consultation de toutes les données — synchronisation Supabase</p>
        </div>
        {/* Supabase status pill */}
        <div className="flex flex-col items-end gap-1">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${sbStatus === "ok" ? "bg-green-50 border-green-200 text-green-700" : sbStatus === "local" ? "bg-amber-50 border-amber-200 text-amber-700" : sbStatus === "syncing" ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-muted border-border text-muted-foreground"}`}>
            {sbStatus === "syncing"
              ? <div className="w-2.5 h-2.5 border border-blue-500 border-t-transparent rounded-full animate-spin" />
              : <div className={`w-2 h-2 rounded-full ${sbStatus === "ok" ? "bg-green-500" : sbStatus === "local" ? "bg-amber-500" : "bg-gray-400"}`} />}
            {sbStatus === "syncing" ? "Synchronisation Supabase..." : sbStatus === "ok" ? "✅ Supabase connecté" : sbStatus === "local" ? "🔵 Données locales" : "—"}
          </div>
          {sbMsg && (
            <span className={`text-[11px] font-medium px-2 ${sbStatus === "ok" ? "text-green-600" : sbStatus === "local" ? "text-amber-600" : "text-muted-foreground"}`}>
              {sbMsg}
            </span>
          )}
        </div>
      </div>

      {/* Sync error persistent alert */}
      {syncErrorAlert && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-red-50 border border-red-300 text-red-800 text-sm">
          <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
          <div className="flex-1">
            <p className="font-semibold">Erreur Supabase Sync — table: <span className="font-mono">{syncErrorAlert.table}</span></p>
            <p className="text-xs mt-0.5 opacity-80">{syncErrorAlert.error}{syncErrorAlert.code ? ` (code: ${syncErrorAlert.code})` : ""}</p>
            <p className="text-xs mt-1 opacity-70">Cause probable: RLS non configure, table absente, ou permissions insuffisantes. Consultez Supabase Dashboard → Authentication → Policies.</p>
          </div>
          <button onClick={() => setSyncErrorAlert(null)} className="text-red-400 hover:text-red-700 ml-2 text-lg leading-none">&times;</button>
        </div>
      )}

      {/* Diagnostics Supabase — Test Ecriture + Force Sync */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <h3 className="font-semibold text-amber-900 text-sm">Diagnostics Supabase / تشخيص قاعدة البيانات</h3>
        </div>
        <div className="flex flex-wrap gap-3 items-start">
          {/* Test Ecriture */}
          <div className="flex flex-col gap-2">
            <button
              onClick={handleWriteTest}
              disabled={writeTestLoading}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border transition-colors ${writeTestLoading ? "opacity-60 pointer-events-none" : "hover:bg-amber-100"} bg-white border-amber-300 text-amber-800`}>
              {writeTestLoading
                ? <><div className="w-3.5 h-3.5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /> Test en cours...</>
                : <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg> Test Ecriture (fl_clients)</>}
            </button>
            {writeTestResult && (
              <div className={`px-3 py-2 rounded-xl text-xs font-medium border ${writeTestResult.ok ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
                {writeTestResult.ok ? "✓ " : "✗ "}{writeTestResult.message}
              </div>
            )}
          </div>

          {/* Force Sync Complet */}
          <div className="flex flex-col gap-2 flex-1 min-w-48">
            <button
              onClick={handleForceSync}
              disabled={forceSyncLoading}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-opacity ${forceSyncLoading ? "opacity-60 pointer-events-none" : "hover:opacity-90"}`}
              style={{ background: "oklch(0.55 0.18 40)" }}>
              {forceSyncLoading
                ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sync en cours...</>
                : <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> Force Sync Complet</>}
            </button>
            {forceSyncResult && (
              <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                {forceSyncResult.map(r => (
                  <div key={r.table} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border ${r.error ? "bg-red-50 border-red-200 text-red-800" : r.count === 0 ? "bg-gray-50 border-gray-200 text-gray-500" : "bg-green-50 border-green-200 text-green-800"}`}>
                    <span className="font-mono font-semibold w-44 shrink-0">{r.table}</span>
                    {r.error
                      ? <span className="text-red-700 truncate" title={r.error}>Erreur: {r.error}</span>
                      : <span>{r.count} item(s) poussé(s)</span>}
                  </div>
                ))}
                <div className="px-3 py-1.5 rounded-lg text-xs bg-blue-50 border border-blue-200 text-blue-800 font-semibold">
                  Total: {forceSyncResult.reduce((s, r) => s + r.count, 0)} items — {forceSyncResult.filter(r => r.error).length} erreur(s)
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Universal Import banner — all sections support CSV/JSON import */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-semibold text-blue-900 text-sm">
              Importer {SECTIONS.find(s => s.id === section)?.label} / استيراد البيانات
            </h3>
            <p className="text-xs text-blue-700 mt-0.5">
              Supporte CSV, Excel (.xlsx/.xls) ou JSON. Pour CSV/Excel: la 1ère ligne doit être les noms de colonnes.
              {section === "clients" && " Colonnes: nom, secteur, zone, type, taille, rotation, telephone, adresse, ice, notes, gps_lat, gps_lng"}
              {section === "stock" && " Colonnes: nom, nomAr, famille, unite, stockDisponible, prixAchat, pvMethode, pvValeur"}
              {section === "commandes" && " JSON uniquement recommandé pour les commandes (données structurées)."}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Template CSV download */}
            {(section === "clients" || section === "stock") && (
              <button
                onClick={() => {
                  const templates: Partial<Record<Section, string>> = {
                    clients: "id,nom,secteur,zone,type,taille,rotation,telephone,adresse,ice,notes,gps_lat,gps_lng\n,Mohamed Souk,Derb Omar,Casablanca Centre,epicerie,50-100kg,journalier,0661234567,Rue X,,,33.589,-7.600\n",
                    stock: "id,nom,nomAr,famille,unite,stockDisponible,stockDefect,prixAchat,pvMethode,pvValeur\n,Tomates,طماطم,Légumes,kg,500,0,3.5,pourcentage,30\n",
                  }
                  const csv = templates[section] || ""
                  if (!csv) return
                  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
                  a.download = `modele_import_${section}.csv`; a.click()
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-blue-300 bg-white text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                Modele CSV
              </button>
            )}
            <label className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white cursor-pointer transition-opacity ${importing ? "opacity-60 pointer-events-none" : "hover:opacity-90"}`}
              style={{ background: "oklch(0.38 0.2 260)" }}>
              <input ref={csvRef} type="file" accept=".csv,.json,.xlsx,.xls" className="hidden" onChange={handleClientImport} />
              {importing
                ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Import en cours...</>
                : <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" /></svg> Importer CSV / Excel / JSON</>}
            </label>
          </div>
        </div>
        {importResult && (
          <div className="flex items-center gap-4 px-4 py-2.5 rounded-xl bg-white border border-blue-200 text-xs">
            <span className="text-green-700 font-semibold">{importResult.inserted} ajoutés</span>
            <span className="text-blue-700 font-semibold">{importResult.updated} mis à jour</span>
            {importResult.errors > 0 && <span className="text-red-600 font-semibold">{importResult.errors} erreurs</span>}
            <span className="text-muted-foreground ml-auto">Enregistrés localement</span>
          </div>
        )}
      </div>

      {/* Section tabs (horizontal scrollable) */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setSection(s.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap border transition-all shrink-0 ${section === s.id ? "text-white border-transparent" : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/30"}`}
            style={section === s.id ? { background: "oklch(0.38 0.2 260)" } : {}}>
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={s.icon} />
            </svg>
            {s.label}
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${section === s.id ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"}`}>
              {counts[s.id] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher dans les données..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        {(search || dateFrom || dateTo) && (
          <button onClick={() => { setSearch(""); setDateFrom(""); setDateTo("") }}
            className="px-3 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            Réinitialiser
          </button>
        )}
      </div>

      {/* Summary + Export/Import actions */}
      <div className="flex items-center gap-4 flex-wrap">
        <span className="text-sm font-semibold text-foreground">{filtered.length} enregistrement(s)</span>
        {totalCA > 0 && <span className="text-sm text-muted-foreground">CA TTC: <strong className="text-indigo-600">{DH(totalCA)}</strong></span>}
        {totalCommandes > 0 && <span className="text-sm text-muted-foreground">Qtté totale: <strong className="text-emerald-600">{totalCommandes.toLocaleString("fr-MA")} kg</strong></span>}
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {/* Download this table — CSV with ALL rows */}
          <button
            onClick={() => {
              if (data.length === 0) return
              const allCols = Object.keys(data[0])
              const csv = ["\uFEFF" + allCols.join(","), ...data.map((row: Record<string, unknown>) => allCols.map(c => `"${renderValue(row[c])}"`).join(","))].join("\n")
              const a = document.createElement("a")
              a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }))
              a.download = `freshlink_${section}_${new Date().toISOString().split("T")[0]}.csv`
              a.click()
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            CSV ({data.length} lignes)
          </button>
          {/* Export this table as Excel — ALL rows */}
          <button
            onClick={async () => {
              if (data.length === 0) return
              const XLSX = await import("xlsx")
              const ws = XLSX.utils.json_to_sheet(data)
              const wb = XLSX.utils.book_new()
              XLSX.utils.book_append_sheet(wb, ws, section.slice(0, 31))
              XLSX.writeFile(wb, `freshlink_${section}_${new Date().toISOString().split("T")[0]}.xlsx`)
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            Excel ({data.length} lignes)
          </button>
          {/* Export this table as JSON */}
          <button
            onClick={() => {
              const a = document.createElement("a")
              a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }))
              a.download = `freshlink_${section}_${new Date().toISOString().split("T")[0]}.json`
              a.click()
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            JSON
          </button>
          {/* Download ALL tables as comprehensive JSON */}
          <button
            onClick={() => {
              const session = store.getSession()
              if (!hasPermission(session?.role, "backup_restore")) { logAction(session, "backup_restore", "denied", { type: "export_complet" }); return }
              logAction(session, "backup_restore", "success", { type: "export_complet" })
              const backup = {
                exportedAt: new Date().toISOString(),
                version: "1.0.0",
                bonsAchat: store.getBonsAchat(),
                commandes: store.getCommandes(),
                bonsLivraison: store.getBonsLivraison(),
                receptions: store.getReceptions(),
                retours: store.getRetours(),
                trips: store.getTrips(),
                tripCharges: store.getTripCharges(),
                articles: store.getArticles(),
                clients: store.getClients(),
                fournisseurs: store.getFournisseurs(),
                livreurs: store.getLivreurs(),
                users: store.getUsers().map(u => ({ ...u, password: "***HIDDEN***" })),
                caissesVides: store.getCaissesVides(),
                mouvementsCaisses: store.getCaissesMovements(),
                contenants: store.getContenantsConfig(),
              }
              const a = document.createElement("a")
              a.href = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }))
              a.download = `freshlink_backup_toutes_tables_${new Date().toISOString().split("T")[0]}.json`
              a.click()
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-md hover:opacity-90 transition-opacity"
            style={{ background: "var(--primary)" }}
            title="Télécharger TOUTES les tables — backup complet">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
            Télécharger TOUTES les tables
          </button>
          {/* Import JSON backup */}
          <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-300 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" /></svg>
            Importer backup
            <input type="file" accept=".json" className="hidden" onChange={e => {
              const file = e.target.files?.[0]
              if (!file) return
              const session = store.getSession()
              if (!hasPermission(session?.role, "backup_restore")) { logAction(session, "backup_restore", "denied", { type: "import_backup", label: file.name }); e.target.value = ""; return }
              logAction(session, "backup_restore", "success", { type: "import_backup", label: file.name })
              const reader = new FileReader()
              reader.onload = ev => {
                try {
                  const b = JSON.parse(ev.target?.result as string)
                  if (b.commandes) { store.saveCommandes(b.commandes); }
                  if (b.bonsAchat) { store.saveBonsAchat(b.bonsAchat); }
                  if (b.bonsLivraison) { store.saveBonsLivraison(b.bonsLivraison); }
                  if (b.receptions) { store.saveReceptions(b.receptions); }
                  if (b.retours) { store.saveRetours(b.retours); }
                  if (b.trips) { store.saveTrips(b.trips); }
                  if (b.articles) { store.saveArticles(b.articles); }
                  if (b.clients) { store.saveClients(b.clients); }
                  if (b.fournisseurs) { store.saveFournisseurs(b.fournisseurs); }
                  if (b.livreurs) { store.saveLivreurs(b.livreurs); }
                  alert("Backup importé avec succès. Rechargez la page pour voir les données.")
                } catch { alert("Fichier JSON invalide.") }
              }
              reader.readAsText(file)
              e.target.value = ""
            }} />
          </label>
        </div>
      </div>

      {/* Data table */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "oklch(0.14 0.03 260)", color: "oklch(0.88 0.015 245)" }}>
                {columns.map(col => (
                  <th key={col} className="text-left px-3 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0
                ? <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-muted-foreground">Aucune donnée</td></tr>
                : filtered.slice(0, 200).map((row: Record<string, unknown>, i: number) => (
                  <tr key={i} style={{ borderTop: "1px solid oklch(0.87 0.012 240)", background: i % 2 === 0 ? "white" : "oklch(0.975 0.003 240)" }}>
                    {columns.map(col => (
                      <td key={col} className="px-3 py-2.5 text-xs text-foreground max-w-[180px] truncate" title={renderValue(row[col])}>
                        {col === "statut" || col === "statutLivraison"
                          ? <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              String(row[col]).includes("livr") || String(row[col]).includes("validé") || String(row[col]).includes("terminé") ? "bg-emerald-100 text-emerald-700"
                              : String(row[col]).includes("retour") || String(row[col]).includes("annul") ? "bg-red-100 text-red-700"
                              : "bg-blue-100 text-blue-700"
                            }`}>{renderValue(row[col])}</span>
                          : col.includes("montant") || col.includes("prix") || col.includes("Prix")
                            ? <span className="font-semibold text-indigo-600">{DH(Number(row[col]) || 0)}</span>
                            : renderValue(row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
          {filtered.length > 200 && (
            <div className="px-4 py-3 text-xs text-muted-foreground border-t border-border bg-muted/30">
              Affichage limité à 200 lignes. Utilisez l'export CSV pour télécharger toutes les données.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
