"use client"

import { useState, useEffect, useRef } from "react"
import { store, type Commande, type User } from "@/lib/store"

interface Props { user: User }

export default function BOCommercial({ user }: Props) {
  const [commandes, setCommandes] = useState<Commande[]>([])
  const [filter, setFilter] = useState({ statut: "", zone: "", prevendeur: "", date: store.today() })
  const [selected, setSelected] = useState<Commande | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [emailConfig, setEmailConfig] = useState(store.getEmailConfig().commercial)
  const [motifRefus, setMotifRefus] = useState("")
  const [showRefusForm, setShowRefusForm] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState<{
    clientId: string; date: string; heurelivraison: string; lignes: Array<{ articleId: string; qte: number }>
  }>({ clientId: "", date: store.today(), heurelivraison: "08:00", lignes: [{ articleId: "", qte: 1 }] })
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletMapRef = useRef<unknown>(null)

  // Approval permissions
  const workflow = store.getWorkflowConfig()
  const canApprove = (() => {
    if (user.role === "super_super_admin" || user.role === "super_admin" || user.role === "admin") return true
    if (user.role === "resp_commercial") return true
    // team_leader can approve commandes where teamLeadId === user.id
    if (user.role === "team_leader") return true
    return false
  })()

  const canApproveCommande = (cmd: Commande): boolean => {
    if (user.role === "super_super_admin" || user.role === "super_admin" || user.role === "admin" || user.role === "resp_commercial") return true
    if (user.role === "team_leader") return !cmd.teamLeadId || cmd.teamLeadId === user.id
    return false
  }

  useEffect(() => { refresh() }, [])
  useEffect(() => { if (commandes.length > 0) initMap() }, [commandes])

  const refresh = () => setCommandes(store.getCommandes())

  // Re-render when Supabase pushes fresh data
  useEffect(() => {
    const handler = (e: Event) => {
      const key = (e as CustomEvent).detail as string
      if (key === "fl_commandes" || key === "fl_clients") refresh()
    }
    window.addEventListener("fl_store_updated", handler)
    return () => window.removeEventListener("fl_store_updated", handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleApprove = (id: string) => {
    store.updateCommande(id, {
      statut: "valide",
      approbateur: user.name,
      approbateurId: user.id,
      dateApprobation: new Date().toISOString(),
    })
    refresh()
  }

  const handleRefuse = (id: string) => {
    store.updateCommande(id, {
      statut: "refuse",
      approbateur: user.name,
      approbateurId: user.id,
      dateApprobation: new Date().toISOString(),
      motifRefus: motifRefus || "Refusée par le responsable",
    })
    setMotifRefus("")
    setShowRefusForm(null)
    refresh()
  }

  const handleSaveEmail = () => {
    const cfg = store.getEmailConfig()
    store.saveEmailConfig({ ...cfg, commercial: emailConfig })
  }

  const initMap = async () => {
    if (typeof window === "undefined" || leafletMapRef.current) return
    try {
      if (!document.getElementById("leaflet-cdn-css")) {
        const link = document.createElement("link")
        link.id = "leaflet-cdn-css"
        link.rel = "stylesheet"
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        document.head.appendChild(link)
      }
      const L = (await import("leaflet")).default
      if (!mapRef.current) return
      // Default: Casablanca, Maroc — 33.5731, -7.5898
      const map = L.map(mapRef.current).setView([33.5731, -7.5898], 11)
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(map)

      const colors: Record<string, string> = {
        en_attente: "#f59e0b", validée: "#3b82f6", en_livraison: "#f97316", livrée: "#22c55e", retour: "#ef4444"
      }
      commandes.filter(c => c.gpsLat && c.gpsLng).forEach(c => {
        const icon = L.divIcon({
          html: `<div style="background:${colors[c.statut] || "#6b7280"};width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
          className: "", iconSize: [14, 14], iconAnchor: [7, 7],
        })
        L.marker([c.gpsLat, c.gpsLng], { icon })
          .addTo(map)
          .bindPopup(`<b>${c.clientNom}</b><br>Zone: ${c.zone}<br>Commercial: ${c.commercialNom}<br>Statut: ${c.statut}<br>Livraison: ${c.heurelivraison}`)
      })
      leafletMapRef.current = map
    } catch (e) { /* map not available */ }
  }

  const filtered = commandes.filter(c => {
    if (filter.statut && c.statut !== filter.statut) return false
    if (filter.zone && !c.zone.toLowerCase().includes(filter.zone.toLowerCase())) return false
    if (filter.prevendeur && !c.commercialNom.toLowerCase().includes(filter.prevendeur.toLowerCase())) return false
    if (filter.date && c.date !== filter.date) return false
    return true
  })

  const totalCA = filtered.reduce((s, c) => s + c.lignes.reduce((ls, l) => ls + l.quantite * l.prixVente, 0), 0)

  const statutColor: Record<string, string> = {
    en_attente: "bg-yellow-100 text-yellow-800",
    en_attente_approbation: "bg-orange-100 text-orange-800 border border-orange-300",
    valide: "bg-blue-100 text-blue-800",
    refuse: "bg-red-100 text-red-800",
    validée: "bg-blue-100 text-blue-800",
    en_transit: "bg-orange-100 text-orange-800",
    livre: "bg-green-100 text-green-800",
    retour: "bg-red-100 text-red-800",
  }

  const statutLabel: Record<string, string> = {
    en_attente: "En attente",
    en_attente_approbation: "En attente d'approbation",
    valide: "Validée",
    refuse: "Refusée",
    en_transit: "En transit",
    livre: "Livrée",
    retour: "Retour",
  }

  const pendingApproval = commandes.filter(c => c.statut === "en_attente_approbation")

  const zones = [...new Set(commandes.map(c => c.zone).filter(Boolean))]
  const prevendeurs = [...new Set(commandes.map(c => c.commercialNom))]

  // Admin, super_admin, super_super_admin, responsable commercial et team leader
  // peuvent créer des commandes depuis le BO (+ toute perm canCreateCommandeBO).
  const canCreateBO = user.canCreateCommandeBO ||
    ["super_super_admin", "super_admin", "admin", "resp_commercial", "team_leader"].includes(user.role)
  // Seul le super_super_admin peut modifier la date d'une commande / d'un BL.
  const canEditDate = user.role === "super_super_admin"

  // BO commandes show only "commercial" clients (not fournisseur/client portal accounts)
  const boClients = store.getClients().filter(c => {
    // exclude portal-linked accounts — they have their own portal
    const users = store.getUsers()
    const hasClientPortal = users.some(u => u.role === "client" && u.clientId === c.id)
    return !hasClientPortal
  })
  const boArticles = store.getArticles().filter(a => a.actif !== false)

  function handleCreateCommande() {
    const client = boClients.find(c => c.id === createForm.clientId)
    if (!client) return
    const validLignes = createForm.lignes
      .filter(l => l.articleId && l.qte > 0)
      .map(l => {
        const art = boArticles.find(a => a.id === l.articleId)
        if (!art) return null
        const pu = art.pvMethode === "manuel"
          ? art.pvValeur
          : art.pvMethode === "pourcentage"
            ? art.prixAchat * (1 + art.pvValeur / 100)
            : art.prixAchat + art.pvValeur
        return {
          articleId: art.id,
          articleNom: art.nom,
          quantite: l.qte,
          prixUnitaire: pu,
          prixVente: pu,
          total: pu * l.qte,
        }
      })
      .filter(Boolean) as import("@/lib/store").LigneCommande[]
    if (validLignes.length === 0) return
    const cmd: Commande = {
      id: `bo_${Date.now()}`,
      date: createForm.date,
      commercialId: user.id,
      commercialNom: user.name,
      clientId: client.id,
      clientNom: client.nom,
      secteur: client.secteur ?? "",
      zone: client.zone ?? "",
      gpsLat: 0, gpsLng: 0,
      lignes: validLignes,
      heurelivraison: createForm.heurelivraison,
      statut: "valide",
      emailDestinataire: "",
    }
    store.addCommande(cmd)
    setShowCreate(false)
    setCreateForm({ clientId: "", date: store.today(), heurelivraison: "08:00", lignes: [{ articleId: "", qte: 1 }] })
    refresh()
  }

  return (
    <div className="flex flex-col gap-5">

      {/* BO Creation — button + inline form */}
      {canCreateBO && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">Commandes BO — comptes commerciaux uniquement</p>
            <button
              onClick={() => setShowCreate(v => !v)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90 shrink-0"
              style={{ background: "oklch(0.38 0.2 260)" }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Nouvelle commande
            </button>
          </div>

          {showCreate && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col gap-4">
              <h3 className="font-bold text-slate-800 text-sm">Créer une commande Back-Office</h3>

              {/* Client + date */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Client *</label>
                  <select value={createForm.clientId} onChange={e => setCreateForm(f => ({ ...f, clientId: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                    <option value="">-- Sélectionner --</option>
                    {boClients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Date livraison{!canEditDate && <span className="text-slate-400 font-normal"> (verrouillée)</span>}
                  </label>
                  <input type="date" value={createForm.date}
                    onChange={e => canEditDate && setCreateForm(f => ({ ...f, date: e.target.value }))}
                    disabled={!canEditDate}
                    title={canEditDate ? "" : "Seul le super administrateur peut modifier la date"}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Heure livraison</label>
                  <input type="time" value={createForm.heurelivraison} onChange={e => setCreateForm(f => ({ ...f, heurelivraison: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
              </div>

              {/* Lines */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-600">Articles *</label>
                  <button onClick={() => setCreateForm(f => ({ ...f, lignes: [...f.lignes, { articleId: "", qte: 1 }] }))}
                    className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    Ajouter ligne
                  </button>
                </div>
                {createForm.lignes.map((ligne, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <select value={ligne.articleId} onChange={e => setCreateForm(f => ({ ...f, lignes: f.lignes.map((l, j) => j === i ? { ...l, articleId: e.target.value } : l) }))}
                      className="flex-1 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                      <option value="">-- Article --</option>
                      {boArticles.map(a => <option key={a.id} value={a.id}>{a.nom}</option>)}
                    </select>
                    <input type="number" min={1} value={ligne.qte} onChange={e => setCreateForm(f => ({ ...f, lignes: f.lignes.map((l, j) => j === i ? { ...l, qte: Number(e.target.value) } : l) }))}
                      className="w-20 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Qté" />
                    {createForm.lignes.length > 1 && (
                      <button onClick={() => setCreateForm(f => ({ ...f, lignes: f.lignes.filter((_, j) => j !== i) }))}
                        className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex gap-3 justify-end pt-1">
                <button onClick={() => setShowCreate(false)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold border border-slate-300 text-slate-600 hover:bg-slate-100 transition-colors">
                  Annuler
                </button>
                <button
                  onClick={handleCreateCommande}
                  disabled={!createForm.clientId || createForm.lignes.every(l => !l.articleId)}
                  className="px-5 py-2 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={{ background: "oklch(0.38 0.2 260)" }}>
                  Enregistrer la commande
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Email config */}
      <div className="bg-card rounded-xl border border-border p-4 flex items-center gap-3">
        <svg className="w-5 h-5 text-muted-foreground shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        <input type="email" value={emailConfig} onChange={e => setEmailConfig(e.target.value)} className="flex-1 text-sm px-3 py-2 rounded-lg border border-border bg-background font-sans focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Email notification commercial" />
        <button onClick={handleSaveEmail} className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium font-sans hover:opacity-90">Sauvegarder</button>
      </div>

      {/* Approval banner */}
      {canApprove && pendingApproval.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-5 h-5 text-orange-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            <h3 className="font-bold text-orange-800 text-sm">{pendingApproval.length} commande(s) en attente d&apos;approbation</h3>
          </div>
          <div className="flex flex-col gap-2">
            {pendingApproval.map(c => (
              <div key={c.id} className="bg-white rounded-xl border border-orange-200 p-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground">{c.clientNom}</p>
                  <p className="text-xs text-muted-foreground">{c.commercialNom} — {c.zone} — {c.date} — {c.lignes.reduce((s,l) => s + l.quantite * l.prixVente, 0).toLocaleString("fr-MA")} DH</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{c.lignes.map(l => `${l.articleNom} ×${l.quantite}`).join(", ")}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => handleApprove(c.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-green-600 hover:bg-green-700 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    Approuver
                  </button>
                  {showRefusForm === c.id ? (
                    <div className="flex items-center gap-2">
                      <input type="text" value={motifRefus} onChange={e => setMotifRefus(e.target.value)}
                        placeholder="Motif du refus..."
                        className="w-40 px-2 py-1.5 rounded-lg border border-red-300 bg-background text-xs focus:outline-none focus:ring-1 focus:ring-red-400" />
                      <button onClick={() => handleRefuse(c.id)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors">OK</button>
                      <button onClick={() => setShowRefusForm(null)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-border hover:bg-muted transition-colors">Annuler</button>
                    </div>
                  ) : (
                    <button onClick={() => setShowRefusForm(c.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-700 border border-red-300 bg-red-50 hover:bg-red-100 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      Refuser
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Map */}
      <div className="bg-card rounded-xl border border-border overflow-hidden" style={{ height: 300 }}>
        <div ref={mapRef} style={{ height: "100%", width: "100%" }} />
      </div>

      {/* Filters */}
      <div className="bg-card rounded-xl border border-border p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <input type="date" value={filter.date} onChange={e => setFilter({ ...filter, date: e.target.value })} className="px-3 py-2 rounded-lg border border-border bg-background text-sm font-sans focus:outline-none focus:ring-2 focus:ring-primary" />
        <select value={filter.statut} onChange={e => setFilter({ ...filter, statut: e.target.value })} className="px-3 py-2 rounded-lg border border-border bg-background text-sm font-sans focus:outline-none">
          <option value="">Tous statuts</option>
          {Object.entries(statutLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={filter.zone} onChange={e => setFilter({ ...filter, zone: e.target.value })} className="px-3 py-2 rounded-lg border border-border bg-background text-sm font-sans focus:outline-none">
          <option value="">Toutes zones</option>
          {zones.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        <select value={filter.prevendeur} onChange={e => setFilter({ ...filter, prevendeur: e.target.value })} className="px-3 py-2 rounded-lg border border-border bg-background text-sm font-sans focus:outline-none">
          <option value="">Tous prévendeurs</option>
          {prevendeurs.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card rounded-xl border border-border p-4 text-center">
          <p className="text-2xl font-bold text-primary font-sans">{filtered.length}</p>
          <p className="text-sm text-muted-foreground font-sans">Commandes</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 text-center">
          <p className="text-xl font-bold text-green-600 font-sans">{totalCA.toLocaleString("fr-FR")}</p>
          <p className="text-sm text-muted-foreground font-sans">CA (DH)</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 text-center">
          <p className="text-2xl font-bold text-orange-600 font-sans">{filtered.filter(c => c.statut === "en_attente").length}</p>
          <p className="text-sm text-muted-foreground font-sans">En attente</p>
        </div>
      </div>

      {/* Select-all action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-800">
          <span className="font-semibold">{selectedIds.size} commande(s) selectionnee(s)</span>
          <div className="flex-1" />
          {canApprove && (
            <button onClick={() => {
              Array.from(selectedIds).forEach(id => handleApprove(id))
              setSelectedIds(new Set())
            }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-green-600 hover:bg-green-700 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              Approuver tout
            </button>
          )}
          <button onClick={() => setSelectedIds(new Set())} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-blue-300 hover:bg-blue-100 transition-colors">
            Deselectionner tout
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm font-sans">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-3 w-10">
                <input type="checkbox"
                  checked={filtered.length > 0 && filtered.every(c => selectedIds.has(c.id))}
                  onChange={e => {
                    if (e.target.checked) setSelectedIds(new Set(filtered.map(c => c.id)))
                    else setSelectedIds(new Set())
                  }}
                  className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                  title="Tout selectionner / deselectionner"
                />
              </th>
              {["Date", "Client", "Prevendeur", "Zone", "Articles", "Total", "Livraison", "GPS", "Statut"].map(h => (
                <th key={h} className="text-left px-4 py-3 text-muted-foreground font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">Aucune commande</td></tr>
            ) : filtered.map(c => (
              <tr key={c.id}
                className={`border-t border-border hover:bg-muted/30 cursor-pointer transition-colors ${selectedIds.has(c.id) ? "bg-blue-50" : ""}`}
                onClick={() => setSelected(c)}>
                <td className="px-4 py-3 w-10" onClick={e => e.stopPropagation()}>
                  <input type="checkbox"
                    checked={selectedIds.has(c.id)}
                    onChange={e => {
                      const next = new Set(selectedIds)
                      if (e.target.checked) next.add(c.id)
                      else next.delete(c.id)
                      setSelectedIds(next)
                    }}
                    className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                  />
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{c.date}</td>
                <td className="px-4 py-3 font-medium text-foreground">{c.clientNom}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.commercialNom}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.zone || c.secteur}</td>
                <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">
                  {c.lignes.map(l => l.quantiteUM && l.um
                    ? `${l.articleNom} ×${l.quantiteUM} ${l.um} (${l.quantite}${l.unite||""})`
                    : `${l.articleNom} ×${l.quantite}${l.unite||""}`
                  ).join(", ")}
                </td>
                <td className="px-4 py-3 font-semibold text-primary whitespace-nowrap">{c.lignes.reduce((s, l) => s + l.quantite * l.prixVente, 0).toLocaleString("fr-MA")} DH</td>
                <td className="px-4 py-3 whitespace-nowrap">{c.heurelivraison}</td>
                <td className="px-4 py-3">
                  {c.gpsLat ? (
                    <span className="text-xs text-green-600 font-sans">{c.gpsLat.toFixed(4)}, {c.gpsLng.toFixed(4)}</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${statutColor[c.statut] || "bg-gray-100 text-gray-700"}`}>{statutLabel[c.statut] || c.statut}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl p-6 w-full max-w-lg flex flex-col gap-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground font-sans">Détail Commande</h3>
              <button onClick={() => setSelected(null)} className="p-2 hover:bg-muted rounded-lg">
                <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm font-sans">
              <div><span className="text-muted-foreground">Client:</span> <span className="font-medium text-foreground">{selected.clientNom}</span></div>
              <div><span className="text-muted-foreground">Prévendeur:</span> <span className="font-medium text-foreground">{selected.commercialNom}</span></div>
              <div><span className="text-muted-foreground">Zone:</span> <span className="font-medium text-foreground">{selected.zone}</span></div>
              <div><span className="text-muted-foreground">Secteur:</span> <span className="font-medium text-foreground">{selected.secteur}</span></div>
              <div><span className="text-muted-foreground">GPS:</span> <span className="font-medium text-foreground text-xs">{selected.gpsLat.toFixed(5)}, {selected.gpsLng.toFixed(5)}</span></div>
              <div><span className="text-muted-foreground">Livraison:</span> <span className="font-medium text-foreground">{selected.heurelivraison}</span></div>
            </div>
            <div className="border-t border-border pt-3">
              <p className="text-sm font-semibold text-foreground mb-2 font-sans">Articles:</p>
              {selected.lignes.map((l, idx) => (
                <div key={idx} className="py-2 border-b border-border/50 last:border-0">
                  <div className="flex items-center justify-between text-sm font-sans">
                    <span className="font-medium text-foreground">{l.articleNom}</span>
                    <span className="font-bold text-primary">{(l.quantite * l.prixVente).toLocaleString("fr-MA")} DH</span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground font-sans flex-wrap">
                    {l.quantiteUM && l.um ? (
                      <>
                        <span className="font-semibold text-blue-600">{l.quantiteUM} {l.um}</span>
                        <span>→</span>
                        <span>{l.quantite} {l.unite}</span>
                      </>
                    ) : (
                      <span>{l.quantite} {l.unite}</span>
                    )}
                    <span>·</span>
                    <span>PV: {l.prixVente} DH/{l.unite}</span>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between pt-3 mt-1">
                <div>
                  <span className="font-semibold text-foreground font-sans text-sm">Total commande</span>
                  <p className="text-xs text-muted-foreground font-sans">
                    {selected.lignes.reduce((s, l) => s + l.quantite, 0).toFixed(1)} {selected.lignes[0]?.unite || "unités"} au total
                  </p>
                </div>
                <span className="font-bold text-xl text-primary font-sans">{selected.lignes.reduce((s, l) => s + l.quantite * l.prixVente, 0).toLocaleString("fr-MA")} DH</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
