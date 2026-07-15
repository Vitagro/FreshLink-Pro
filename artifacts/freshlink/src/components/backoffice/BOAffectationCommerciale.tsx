"use client"

import { useState, useEffect, useMemo } from "react"
import { store, type User, type Client, ROLE_LABELS, getAllSecteurs } from "@/lib/store"
import { loadZonesConfig, zoneOfSecteur, type ZonesConfig } from "@/lib/commercial/zones"

interface Props { user: User }

export default function BOAffectationCommerciale({ user }: Props) {
  const [clients, setClients]     = useState<Client[]>([])
  const [users, setUsers]         = useState<User[]>([])
  const [saved, setSaved]         = useState(false)
  const [tab, setTab]             = useState<"clients" | "prevendeurs">("clients")
  // Config Zones & Secteurs — même pool que l'écran dédié, pour ne plus avoir
  // deux listes de secteurs déconnectées l'une de l'autre.
  const [zonesCfg, setZonesCfg]   = useState<ZonesConfig | null>(null)
  // search
  const [searchClient, setSearchClient]       = useState("")
  const [filterSecteur, setFilterSecteur]     = useState("")
  const [filterPrevendeur, setFilterPrevendeur] = useState("")

  const reload = () => {
    setClients(store.getVisibleClients())
    setUsers(store.getUsers())
  }

  useEffect(() => { reload(); loadZonesConfig().then(setZonesCfg) }, [])

  // derived lists
  const prevendeurs = useMemo(
    () => users.filter(u => u.role === "prevendeur" && u.actif),
    [users]
  )
  const teamLeads = useMemo(
    () => users.filter(u => (u.role === "team_leader" || u.role === "resp_commercial") && u.actif),
    [users]
  )
  const secteurs = useMemo(
    () => getAllSecteurs([
      ...clients.map(c => c.secteur),
      ...prevendeurs.map(u => u.secteur || ""),
      ...(zonesCfg?.allSecteurs ?? []),
    ]).sort(),
    [clients, prevendeurs, zonesCfg]
  )
  // Zone d'un secteur (affichage seulement — la gestion se fait dans l'écran
  // dédié Zones & Secteurs, Commercial & Ventes).
  const zoneLabelOf = (secteur: string) => zonesCfg ? zoneOfSecteur(zonesCfg, secteur)?.label ?? null : null

  // ── filtered clients ──────────────────────────────────────────────────────
  const filteredClients = useMemo(() => {
    return clients.filter(c => {
      const matchSearch = !searchClient || c.nom.toLowerCase().includes(searchClient.toLowerCase())
      const matchSecteur = !filterSecteur || c.secteur === filterSecteur
      const matchPrev = !filterPrevendeur || c.prevendeurId === filterPrevendeur
      return matchSearch && matchSecteur && matchPrev
    })
  }, [clients, searchClient, filterSecteur, filterPrevendeur])

  // ── save helpers ──────────────────────────────────────────────────────────
  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 2000) }

  const assignClientSecteur = (clientId: string, secteur: string) => {
    store.updateClient(clientId, { secteur })
    reload(); flash()
  }

  // Resolve teamLeadId from a prevendeur's secteur
  const resolveTeamLead = (prev: User | undefined): string | undefined => {
    if (!prev?.secteur) return undefined
    return users.find(u =>
      (u.role === "team_leader" || u.role === "resp_commercial") && u.secteur === prev.secteur
    )?.id
  }

  const assignClientPrevendeur = (clientId: string, prevendeurId: string) => {
    const prev = users.find(u => u.id === prevendeurId)
    store.updateClient(clientId, {
      prevendeurId: prevendeurId || undefined,
      teamLeadId:  resolveTeamLead(prev),
    })
    reload(); flash()
  }

  const assignPrevendeurSecteur = (userId: string, secteur: string) => {
    const all = store.getUsers()
    const idx = all.findIndex(u => u.id === userId)
    if (idx >= 0) {
      all[idx] = { ...all[idx], secteur }
      store.saveUsers(all)
      // Cascade: update all clients already assigned to this prevendeur
      const myClients = clients.filter(c => c.prevendeurId === userId)
      const tl = users.find(u => (u.role === "team_leader" || u.role === "resp_commercial") && u.secteur === secteur)
      myClients.forEach(c => store.updateClient(c.id, { teamLeadId: tl?.id }))
    }
    reload(); flash()
  }

  // ── AUTO-AFFECTATION ──────────────────────────────────────────────────────
  // For each client without a prevendeurId, try to find a prevendeur in the same secteur.
  // If multiple prevendeurs in the same secteur, assign round-robin.
  const autoAffecterTous = () => {
    const unassigned = clients.filter(c => !c.prevendeurId && c.secteur)
    if (unassigned.length === 0) return
    const countByPrev: Record<string, number> = {}
    prevendeurs.forEach(p => { countByPrev[p.id] = clients.filter(c => c.prevendeurId === p.id).length })

    unassigned.forEach(c => {
      const prevInSecteur = prevendeurs.filter(p => p.secteur === c.secteur)
      if (prevInSecteur.length === 0) return
      // pick the one with least assigned clients
      const pick = prevInSecteur.sort((a, b) => (countByPrev[a.id] ?? 0) - (countByPrev[b.id] ?? 0))[0]
      const tl = resolveTeamLead(pick)
      store.updateClient(c.id, { prevendeurId: pick.id, teamLeadId: tl })
      countByPrev[pick.id] = (countByPrev[pick.id] ?? 0) + 1
    })
    reload(); flash()
  }

  const unassignedCount = clients.filter(c => !c.prevendeurId && c.secteur).length

  // stats
  const clientsWithPrev   = clients.filter(c => c.prevendeurId).length
  const clientsWithSecteur = clients.filter(c => c.secteur).length
  const prevWithSecteur   = prevendeurs.filter(u => u.secteur).length

  return (
    <div className="flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-foreground">
            Affectation Commerciale
            <span className="text-muted-foreground font-normal text-base mr-2"> / التوزيع التجاري</span>
          </h2>
          <p className="text-sm text-muted-foreground">
            Affecter les clients à un secteur et à un prévendeur — Le Team Lead est résolu automatiquement.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {unassignedCount > 0 && tab === "clients" && (
            <button
              onClick={autoAffecterTous}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors shadow">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Auto-affecter ({unassignedCount})
            </button>
          )}
          {saved && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              Affectation sauvegardée
            </div>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Clients total", value: clients.length, color: "bg-blue-50 border-blue-200 text-blue-700" },
          { label: "Avec secteur", value: clientsWithSecteur, color: "bg-indigo-50 border-indigo-200 text-indigo-700" },
          { label: "Avec prévendeur", value: clientsWithPrev, color: "bg-green-50 border-green-200 text-green-700" },
          {
            label: "Sans prévendeur",
            value: unassignedCount,
            sub: unassignedCount > 0 ? "→ Auto-affecter" : "✓ Tout affecté",
            color: unassignedCount > 0 ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-green-50 border-green-200 text-green-700",
          },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border p-3 ${s.color}`}>
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-xs font-medium">{s.label}</p>
            {s.sub && <p className="text-[10px] opacity-70">{s.sub}</p>}
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted border border-border w-fit">
        {(["clients", "prevendeurs"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t ? "bg-card shadow text-foreground border border-border" : "text-muted-foreground hover:text-foreground"}`}>
            {t === "clients" ? `Clients (${clients.length})` : `Prévendeurs (${prevendeurs.length})`}
          </button>
        ))}
      </div>

      {/* ── TAB: CLIENTS ─────────────────────────────────────────────────────── */}
      {tab === "clients" && (
        <div className="flex flex-col gap-4">

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <input
              type="text" value={searchClient} onChange={e => setSearchClient(e.target.value)}
              placeholder="Rechercher un client..."
              className="flex-1 min-w-40 px-3 py-2 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            <select value={filterSecteur} onChange={e => setFilterSecteur(e.target.value)}
              className="px-3 py-2 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">Tous les secteurs</option>
              {secteurs.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterPrevendeur} onChange={e => setFilterPrevendeur(e.target.value)}
              className="px-3 py-2 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">Tous les prévendeurs</option>
              {prevendeurs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Table */}
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-sidebar text-sidebar-foreground">
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide">Client</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide">Secteur</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide">Prévendeur</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide">Team Lead</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                        Aucun client trouvé
                      </td>
                    </tr>
                  ) : filteredClients.map((c, i) => {
                    const assignedPrev = users.find(u => u.id === c.prevendeurId)
                    const assignedTL   = users.find(u => u.id === c.teamLeadId)
                    return (
                      <tr key={c.id} className={i % 2 === 0 ? "bg-card" : "bg-muted/30"} style={{ borderTop: "1px solid var(--border)" }}>
                        {/* Client name + type */}
                        <td className="px-4 py-3">
                          <p className="font-semibold text-foreground">{c.nom}</p>
                          <p className="text-xs text-muted-foreground capitalize">{c.type} — {c.zone || "—"}</p>
                        </td>

                        {/* Secteur selector */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <select
                              value={c.secteur || ""}
                              onChange={e => assignClientSecteur(c.id, e.target.value)}
                              className="flex-1 min-w-28 px-2 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary">
                              <option value="">-- Secteur --</option>
                              {secteurs.map(s => <option key={s} value={s}>{s}</option>)}
                              <option value="__new__" disabled>+ Nouveau secteur (modifier ci-dessous)</option>
                            </select>
                            {/* Inline new secteur input */}
                            {c.secteur === "" && (
                              <input
                                type="text"
                                placeholder="Nouveau secteur"
                                className="w-28 px-2 py-1.5 rounded-lg border border-dashed border-primary/40 bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                                onBlur={e => { if (e.target.value) assignClientSecteur(c.id, e.target.value) }}
                                onKeyDown={e => { if (e.key === "Enter" && (e.target as HTMLInputElement).value) assignClientSecteur(c.id, (e.target as HTMLInputElement).value) }}
                              />
                            )}
                          </div>
                          {/* Zone commerciale rattachée à ce secteur (gérée dans
                              Commercial & Ventes > Zones & Secteurs) */}
                          {c.secteur && (
                            zoneLabelOf(c.secteur)
                              ? <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">🗺️ {zoneLabelOf(c.secteur)}</span>
                              : <span className="inline-block mt-1 text-[10px] text-amber-600">⚠️ Secteur sans zone</span>
                          )}
                        </td>

                        {/* Prevendeur selector */}
                        <td className="px-4 py-3">
                          <select
                            value={c.prevendeurId || ""}
                            onChange={e => assignClientPrevendeur(c.id, e.target.value)}
                            className="w-full min-w-36 px-2 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary">
                            <option value="">-- Non affecté --</option>
                            {prevendeurs.map(p => (
                              <option key={p.id} value={p.id}>
                                {p.name}{p.secteur ? ` (${p.secteur})` : ""}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Team Lead — auto-resolved or manual override */}
                        <td className="px-4 py-3">
                          {assignedTL ? (
                            <div className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                              <span className="text-xs text-foreground">{assignedTL.name}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">— auto</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {filteredClients.length} client(s) affiché(s) sur {clients.length} — Le Team Lead est automatiquement résolu depuis le secteur du prévendeur.
          </p>
        </div>
      )}

      {/* ── TAB: PREVENDEURS ─────────────────────────────────────────────────── */}
      {tab === "prevendeurs" && (
        <div className="flex flex-col gap-4">

          {/* Info banner */}
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-xs">
            <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p>
              Affecter un secteur à chaque prévendeur. Les clients de ce secteur lui seront automatiquement associés lors de la prise de commande mobile. Un team lead du même secteur supervisera ses commandes.
            </p>
          </div>

          {/* Prevendeurs table */}
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-sidebar text-sidebar-foreground">
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide">Prévendeur</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide">Rôle</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide">Secteur affecté</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide">Clients du secteur</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide">Clients affectés</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide">Team Lead</th>
                  </tr>
                </thead>
                <tbody>
                  {prevendeurs.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Aucun prévendeur actif</td></tr>
                  ) : prevendeurs.map((p, i) => {
                    const clientsSecteur = clients.filter(c => c.secteur === p.secteur)
                    const clientsAffectes = clients.filter(c => c.prevendeurId === p.id)
                    const tl = teamLeads.find(t => t.secteur === p.secteur)
                    return (
                      <tr key={p.id} className={i % 2 === 0 ? "bg-card" : "bg-muted/30"} style={{ borderTop: "1px solid var(--border)" }}>
                        {/* Name */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                              {p.name[0]}
                            </div>
                            <div>
                              <p className="font-semibold text-foreground">{p.name}</p>
                              <p className="text-[10px] text-muted-foreground">{p.email}</p>
                            </div>
                          </div>
                        </td>
                        {/* Role */}
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary">
                            {ROLE_LABELS[p.role]}
                          </span>
                        </td>
                        {/* Secteur */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <select
                              value={p.secteur || ""}
                              onChange={e => assignPrevendeurSecteur(p.id, e.target.value)}
                              className="flex-1 min-w-28 px-2 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary">
                              <option value="">-- Aucun secteur --</option>
                              {secteurs.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            {/* Type new secteur inline */}
                            <input
                              type="text"
                              placeholder="Nouveau…"
                              className="w-24 px-2 py-1.5 rounded-lg border border-dashed border-primary/30 bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                              onBlur={e => { if (e.target.value.trim()) { assignPrevendeurSecteur(p.id, e.target.value.trim()); e.target.value = "" } }}
                              onKeyDown={e => { if (e.key === "Enter" && (e.target as HTMLInputElement).value.trim()) { assignPrevendeurSecteur(p.id, (e.target as HTMLInputElement).value.trim()); (e.target as HTMLInputElement).value = "" } }}
                            />
                          </div>
                        </td>
                        {/* Clients in secteur */}
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${clientsSecteur.length > 0 ? "bg-blue-100 text-blue-700" : "bg-muted text-muted-foreground"}`}>
                            {clientsSecteur.length} client(s)
                          </span>
                        </td>
                        {/* Clients directly assigned */}
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${clientsAffectes.length > 0 ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                            {clientsAffectes.length} affecté(s)
                          </span>
                        </td>
                        {/* Team lead auto-resolved */}
                        <td className="px-4 py-3">
                          {tl ? (
                            <div className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                              <span className="text-xs text-foreground">{tl.name}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">Aucun team lead dans ce secteur</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Team leads info */}
          {teamLeads.length > 0 && (
            <div className="bg-card rounded-xl border border-border p-4">
              <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">
                Team Leads / Responsables commerciaux
              </h4>
              <div className="flex flex-wrap gap-2">
                {teamLeads.map(tl => (
                  <div key={tl.id} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-muted border border-border text-xs">
                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                      {tl.name[0]}
                    </div>
                    <span className="font-semibold text-foreground">{tl.name}</span>
                    {tl.secteur && <span className="text-muted-foreground">— {tl.secteur}</span>}
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                      {ROLE_LABELS[tl.role]}
                    </span>
                    {!tl.secteur && (
                      <span className="text-[10px] text-red-500">Secteur manquant</span>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Pour associer un team lead à un secteur, modifiez son secteur dans Utilisateurs et Roles.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
