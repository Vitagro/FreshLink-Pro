"use client"

import { useState, useEffect, useMemo } from "react"
import { store, type User, type UserRole, userHasRole } from "@/lib/store"

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type BonusMalusType =
  | "tonnage" | "visite" | "nouveau_client" | "retour_client"
  | "delai_livraison" | "fiabilite_stock" | "rupture_stock" | "retard_livraison"
  | "respect_cutoff" | "zero_retour_qualite" | "retour_qualite"
  | "custom"

export type EmployeeGroup = "prevendeur" | "logistique" | "achat" | "admin" | "autre"

export interface RegleBonus {
  id: string
  nom: string
  groupe: EmployeeGroup
  type: BonusMalusType
  valeur: number          // montant DH ou % selon unite
  unite: "dh_par_tonne" | "dh_par_visite" | "dh_par_client" | "dh_fixe" | "pct_salaire"
  signe: "bonus" | "malus"
  description?: string
  actif: boolean
}

export interface GrilleSalaire {
  id: string
  userId: string
  userName: string
  userRole: UserRole
  groupe: EmployeeGroup
  salaireFixe: number
  reglesIds: string[]      // references to RegleBonus ids
  actionnaire: boolean
  tauxBenef?: number       // % benefice pour actionnaires
  tauxSalaireBenef?: number // % supplement salaire sur benef
  updatedAt: string
}

export interface FichePayroll {
  id: string
  userId: string
  userName: string
  userRole: UserRole
  groupe: EmployeeGroup
  periode: string          // "2025-06" format
  salaireFixe: number
  lignesBonus: { regleId: string; nom: string; signe: "bonus" | "malus"; montant: number; detail: string }[]
  totalBonus: number
  totalMalus: number
  salaireVarible: number
  salaireBrut: number
  statut: "brouillon" | "validé_rh" | "transmis_azmi" | "payé"
  noteRH?: string
  // Actionnaire fields — calculated by Azmi
  benefEntreprise?: number
  partBenef?: number
  totalActionnaire?: number
  noteAzmi?: string
  validéAzmi?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// STORE HELPERS — localStorage
// ─────────────────────────────────────────────────────────────────────────────

// Write-through Supabase (service-role) — les réglages RH ne sont plus
// localStorage-only : ils se partagent entre appareils/utilisateurs.
function syncPush<T>(table: string, rows: T[], idOf: (x: T) => string) {
  try {
    const now = new Date().toISOString()
    fetch("/api/sync-write", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table, upserts: rows.map(r => ({ id: idOf(r), payload: r, updated_at: now })) }),
    }).catch(() => {})
  } catch { /* offline */ }
}

const LS = {
  getRegles: (): RegleBonus[] => {
    try { return JSON.parse(localStorage.getItem("fl_regles_bonus") ?? "[]") }
    catch { return [] }
  },
  saveRegles: (r: RegleBonus[]) => { localStorage.setItem("fl_regles_bonus", JSON.stringify(r)); syncPush("fl_regles_bonus", r, x => (x as RegleBonus).id) },
  getGrilles: (): GrilleSalaire[] => {
    try { return JSON.parse(localStorage.getItem("fl_grilles_salaire") ?? "[]") }
    catch { return [] }
  },
  saveGrilles: (g: GrilleSalaire[]) => { localStorage.setItem("fl_grilles_salaire", JSON.stringify(g)); syncPush("fl_grilles_salaire", g, x => (x as GrilleSalaire).userId) },
  getFiches: (): FichePayroll[] => {
    try { return JSON.parse(localStorage.getItem("fl_fiches_payroll") ?? "[]") }
    catch { return [] }
  },
  saveFiches: (f: FichePayroll[]) => { localStorage.setItem("fl_fiches_payroll", JSON.stringify(f)); syncPush("fl_fiches_payroll", f, x => { const o = x as FichePayroll; return o.id ?? `${o.userId}_${o.periode}` }) },
}

// Hydrate depuis Supabase au montage : fusionne les lignes distantes dans
// localStorage avant que les onglets ne lisent (clé d'identité par table).
async function hydrateRH(): Promise<void> {
  const pulls: Array<[string, string, (r: { id: string; payload?: Record<string, unknown> }) => Record<string, unknown>]> = [
    ["fl_regles_bonus",    "id",     r => ({ ...(r.payload ?? {}), id: r.id })],
    ["fl_grilles_salaire", "userId", r => ({ ...(r.payload ?? {}), userId: r.id })],
    ["fl_fiches_payroll",  "id",     r => ({ ...(r.payload ?? {}), id: r.id })],
  ]
  await Promise.all(pulls.map(async ([table, key, map]) => {
    try {
      const res = await fetch(`/api/sync-read?table=${table}`, { cache: "no-store" })
      if (!res.ok) return
      const j = await res.json() as { data?: { id: string; payload?: Record<string, unknown> }[] }
      const remote = (j?.data ?? []).map(map)
      if (!remote.length) return
      const lsKey = table
      let local: Record<string, unknown>[] = []
      try { local = JSON.parse(localStorage.getItem(lsKey) ?? "[]") } catch { /* */ }
      const ids = new Set(local.map(l => String(l[key])))
      const merged = [...local, ...remote.filter(r => !ids.has(String(r[key])))]
      localStorage.setItem(lsKey, JSON.stringify(merged))
    } catch { /* offline */ }
  }))
}

const GROUPES: { key: EmployeeGroup; label: string; color: string }[] = [
  { key: "prevendeur",  label: "Prévendeurs",  color: "bg-blue-100 text-blue-700" },
  { key: "logistique",  label: "Logistique",   color: "bg-emerald-100 text-emerald-700" },
  { key: "achat",       label: "Achat",        color: "bg-amber-100 text-amber-700" },
  { key: "admin",       label: "Admin / RH",   color: "bg-purple-100 text-purple-700" },
  { key: "autre",       label: "Autre",        color: "bg-slate-100 text-slate-700" },
]

function groupeForRole(role: UserRole): EmployeeGroup {
  if (["prevendeur", "resp_commercial", "team_leader"].includes(role)) return "prevendeur"
  if (["livreur", "magasinier", "dispatcheur", "resp_logistique"].includes(role)) return "logistique"
  if (["acheteur", "ctrl_achat"].includes(role)) return "achat"
  if (["super_super_admin", "admin", "super_admin", "financier", "cash_man", "ctrl_prep", "rh_manager", "comptable"].includes(role)) return "admin"
  return "autre"
}

const genId = () => Math.random().toString(36).slice(2, 10)
const nowIso = () => new Date().toISOString()

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT REGLES
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_REGLES: RegleBonus[] = [
  // Prévendeurs
  { id: "r1", nom: "Prime tonnage prévendeur", groupe: "prevendeur", type: "tonnage", valeur: 10, unite: "dh_par_tonne", signe: "bonus", description: "10 DH par tonne vendue", actif: true },
  { id: "r2", nom: "Prime visite client", groupe: "prevendeur", type: "visite", valeur: 5, unite: "dh_par_visite", signe: "bonus", description: "5 DH par visite effectuée", actif: true },
  { id: "r3", nom: "Prime nouveau client", groupe: "prevendeur", type: "nouveau_client", valeur: 100, unite: "dh_par_client", signe: "bonus", description: "100 DH par nouveau client validé", actif: true },
  { id: "r4", nom: "Malus retour client", groupe: "prevendeur", type: "retour_client", valeur: 50, unite: "dh_par_client", signe: "malus", description: "50 DH par retour imputable au commercial", actif: true },
  // Logistique
  { id: "r5", nom: "Prime délai livraison", groupe: "logistique", type: "delai_livraison", valeur: 200, unite: "dh_fixe", signe: "bonus", description: "Prime mensuelle si taux livraison à temps > 95%", actif: true },
  { id: "r6", nom: "Prime fiabilité stock", groupe: "logistique", type: "fiabilite_stock", valeur: 150, unite: "dh_fixe", signe: "bonus", description: "Prime mensuelle si 0 rupture injustifiée", actif: true },
  { id: "r7", nom: "Malus retard livraison", groupe: "logistique", type: "retard_livraison", valeur: 100, unite: "dh_fixe", signe: "malus", description: "Malus si taux livraisons tardives > 10%", actif: true },
  { id: "r8", nom: "Malus rupture stock", groupe: "logistique", type: "rupture_stock", valeur: 50, unite: "dh_fixe", signe: "malus", description: "50 DH par rupture de stock constatée", actif: true },
  // Achat
  { id: "r9", nom: "Prime respect cut-off", groupe: "achat", type: "respect_cutoff", valeur: 200, unite: "dh_fixe", signe: "bonus", description: "Prime si 100% des POs envoyés avant cut-off", actif: true },
  { id: "r10", nom: "Prime 0 retour qualité", groupe: "achat", type: "zero_retour_qualite", valeur: 300, unite: "dh_fixe", signe: "bonus", description: "Prime mensuelle si 0 retour motif qualité", actif: true },
  { id: "r11", nom: "Malus retour qualité", groupe: "achat", type: "retour_qualite", valeur: 100, unite: "dh_fixe", signe: "malus", description: "100 DH par retour motif qualité constaté", actif: true },
]

// ─────────────────────────────────────────────────────────────────────────────
// BADGE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

function Badge({ label, color }: { label: string; color: string }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{label}</span>
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: PRODUCTIVITÉ
// ─────────────────────────────────────────────────────────────────────────────

function ProductiviteTab({ users }: { users: User[] }) {
  const visites   = store.getVisites()
  const commandes = store.getCommandes()
  const receptions = store.getReceptions()
  const bls       = store.getBonsLivraison ? store.getBonsLivraison() : []
  const retours   = store.getRetours ? store.getRetours() : []

  const periodes = useMemo(() => {
    const now = new Date()
    const months: string[] = []
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
    }
    return months
  }, [])

  const [periode, setPeriode] = useState(periodes[0])

  const staffUsers = users.filter(u =>
    !["client", "fournisseur"].includes(u.role) && u.actif
  )

  const stats = staffUsers.map(u => {
    const groupe = groupeForRole(u.role)
    if (groupe === "prevendeur") {
      const uvisitp = visites.filter(v => v.prevendeurId === u.id && v.date?.startsWith(periode))
      const ucmds = commandes.filter(c => c.commercialId === u.id && c.date?.startsWith(periode))
      const tonnage = ucmds.reduce((s, c) => s + c.lignes.reduce((a, l) => a + (l.quantite ?? 0), 0), 0)
      const newClients = new Set(ucmds.map(c => c.clientId)).size
      const retourCli = retours.filter((r: any) => r.livreurId === u.id && r.date?.startsWith(periode)).length
      return { u, groupe, kpis: [
        { label: "Visites", value: uvisitp.length, icon: "👁" },
        { label: "Tonnage (kg)", value: tonnage.toFixed(0), icon: "⚖" },
        { label: "Clients actifs", value: newClients, icon: "🧑" },
        { label: "Retours", value: retourCli, icon: "↩", bad: retourCli > 0 },
      ]}
    }
    if (groupe === "logistique") {
      const delivered = bls.filter((b: any) => b.livreurId === u.id && b.date?.startsWith(periode))
      const onTime = delivered.filter((b: any) => b.livreATemps).length
      const late   = delivered.length - onTime
      const taux   = delivered.length > 0 ? Math.round(onTime / delivered.length * 100) : 0
      return { u, groupe, kpis: [
        { label: "BL livrés", value: delivered.length, icon: "🚚" },
        { label: "A temps", value: onTime, icon: "✅" },
        { label: "Retards", value: late, icon: "⏰", bad: late > 0 },
        { label: "Taux (%)", value: taux, icon: "📊", good: taux >= 95 },
      ]}
    }
    if (groupe === "achat") {
      const recs = receptions.filter(r => r.operateurId === u.id && r.date?.startsWith(periode))
      const retourQ = retours.filter((r: any) => r.motif === "qualite" && r.date?.startsWith(periode)).length
      return { u, groupe, kpis: [
        { label: "Réceptions", value: recs.length, icon: "📦" },
        { label: "Retours qualité", value: retourQ, icon: "❌", bad: retourQ > 0 },
      ]}
    }
    return { u, groupe, kpis: [] }
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Productivité de l&apos;équipe</h2>
        <select
          value={periode}
          onChange={e => setPeriode(e.target.value)}
          className="text-sm border border-border rounded-lg px-3 py-1.5 bg-background text-foreground"
        >
          {periodes.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {GROUPES.map(g => {
        const grouped = stats.filter(s => s.groupe === g.key)
        if (grouped.length === 0) return null
        return (
          <div key={g.key} className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge label={g.label} color={g.color} />
              <span className="text-xs text-muted-foreground">{grouped.length} membre{grouped.length > 1 ? "s" : ""}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {grouped.map(({ u, kpis }) => (
                <div key={u.id} className="bg-card border border-border rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-foreground">{u.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{u.role.replace(/_/g, " ")}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {kpis.map(k => (
                      <div key={k.label} className={`rounded-lg px-3 py-2 ${
                        (k as any).bad ? "bg-red-50 border border-red-200" :
                        (k as any).good ? "bg-emerald-50 border border-emerald-200" :
                        "bg-muted/50"
                      }`}>
                        <p className="text-[10px] text-muted-foreground">{k.label}</p>
                        <p className={`text-base font-bold ${(k as any).bad ? "text-red-600" : (k as any).good ? "text-emerald-600" : "text-foreground"}`}>{k.value}</p>
                      </div>
                    ))}
                    {kpis.length === 0 && (
                      <p className="col-span-2 text-xs text-muted-foreground italic">Pas de KPI configuré pour ce rôle</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: CONFIGURATION RÈGLES BONUS/MALUS
// ─────────────────────────────────────────────────────────────────────────────

function ReglesTab({ isAdmin }: { isAdmin: boolean }) {
  const [regles, setRegles] = useState<RegleBonus[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<RegleBonus | null>(null)
  const [form, setForm] = useState<Partial<RegleBonus>>({})

  useEffect(() => {
    const r = LS.getRegles()
    if (r.length === 0) {
      LS.saveRegles(DEFAULT_REGLES)
      setRegles(DEFAULT_REGLES)
    } else {
      setRegles(r)
    }
  }, [])

  const save = () => {
    if (!form.nom || !form.groupe || !form.valeur) return
    const updated = editing
      ? regles.map(r => r.id === editing.id ? { ...editing, ...form } as RegleBonus : r)
      : [...regles, { id: genId(), actif: true, signe: "bonus", unite: "dh_fixe", type: "custom", ...form } as RegleBonus]
    LS.saveRegles(updated)
    setRegles(updated)
    setShowForm(false)
    setEditing(null)
    setForm({})
  }

  const toggle = (id: string) => {
    const updated = regles.map(r => r.id === id ? { ...r, actif: !r.actif } : r)
    LS.saveRegles(updated)
    setRegles(updated)
  }

  const del = (id: string) => {
    const updated = regles.filter(r => r.id !== id)
    LS.saveRegles(updated)
    setRegles(updated)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Règles Bonus / Malus</h2>
        {isAdmin && (
          <button
            onClick={() => { setShowForm(true); setEditing(null); setForm({}) }}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Ajouter règle
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-foreground">{editing ? "Modifier" : "Nouvelle"} règle</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="col-span-2 md:col-span-3">
              <label className="text-xs font-medium text-muted-foreground">Nom de la règle</label>
              <input value={form.nom ?? ""} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} className="w-full mt-1 border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground" placeholder="Ex: Prime assiduité" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Groupe concerné</label>
              <select value={form.groupe ?? ""} onChange={e => setForm(f => ({ ...f, groupe: e.target.value as EmployeeGroup }))} className="w-full mt-1 border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
                <option value="">Choisir...</option>
                {GROUPES.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Bonus ou Malus</label>
              <select value={form.signe ?? "bonus"} onChange={e => setForm(f => ({ ...f, signe: e.target.value as "bonus" | "malus" }))} className="w-full mt-1 border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
                <option value="bonus">Bonus (+)</option>
                <option value="malus">Malus (-)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Montant</label>
              <input type="number" value={form.valeur ?? ""} onChange={e => setForm(f => ({ ...f, valeur: Number(e.target.value) }))} className="w-full mt-1 border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground" placeholder="100" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Unité</label>
              <select value={form.unite ?? "dh_fixe"} onChange={e => setForm(f => ({ ...f, unite: e.target.value as RegleBonus["unite"] }))} className="w-full mt-1 border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
                <option value="dh_fixe">DH fixe / mois</option>
                <option value="dh_par_tonne">DH par tonne</option>
                <option value="dh_par_visite">DH par visite</option>
                <option value="dh_par_client">DH par client</option>
                <option value="pct_salaire">% du salaire fixe</option>
              </select>
            </div>
            <div className="col-span-2 md:col-span-3">
              <label className="text-xs font-medium text-muted-foreground">Description (optionnel)</label>
              <input value={form.description ?? ""} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full mt-1 border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground" placeholder="Condition d'application..." />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={save} className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">Sauvegarder</button>
            <button onClick={() => { setShowForm(false); setEditing(null); setForm({}) }} className="border border-border px-4 py-2 rounded-lg text-sm font-medium hover:bg-muted transition-colors">Annuler</button>
          </div>
        </div>
      )}

      {GROUPES.map(g => {
        const gr = regles.filter(r => r.groupe === g.key)
        if (gr.length === 0) return null
        return (
          <div key={g.key} className="space-y-2">
            <Badge label={g.label} color={g.color} />
            <div className="space-y-2">
              {gr.map(r => (
                <div key={r.id} className={`flex items-center gap-3 bg-card border rounded-lg px-4 py-3 ${r.actif ? "border-border" : "border-border/40 opacity-60"}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${r.signe === "bonus" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                    {r.signe === "bonus" ? "+" : "-"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{r.nom}</p>
                    <p className="text-xs text-muted-foreground">{r.valeur} {r.unite.replace(/_/g, " ")} {r.description ? `— ${r.description}` : ""}</p>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => toggle(r.id)} className={`text-xs px-2 py-1 rounded border font-medium transition-colors ${r.actif ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50" : "border-border text-muted-foreground hover:bg-muted"}`}>
                        {r.actif ? "Actif" : "Inactif"}
                      </button>
                      <button onClick={() => { setEditing(r); setForm(r); setShowForm(true) }} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={() => del(r.id)} className="p-1.5 rounded hover:bg-red-50 transition-colors text-muted-foreground hover:text-red-600">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: GRILLES SALAIRES
// ─────────────────────────────────────────────────────────────────────────────

function GrillesTab({ users, isAdmin }: { users: User[]; isAdmin: boolean }) {
  const [grilles, setGrilles] = useState<GrilleSalaire[]>([])
  const [regles, setRegles] = useState<RegleBonus[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<GrilleSalaire>>({})

  useEffect(() => {
    setGrilles(LS.getGrilles())
    setRegles(LS.getRegles().length ? LS.getRegles() : DEFAULT_REGLES)
  }, [])

  const staff = users.filter(u => !["client", "fournisseur"].includes(u.role) && u.actif)

  const getGrille = (uid: string) => grilles.find(g => g.userId === uid)

  const saveGrille = (uid: string) => {
    if (!form.salaireFixe) return
    const u = staff.find(s => s.id === uid)!
    const existing = grilles.find(g => g.userId === uid)
    const updated = existing
      ? grilles.map(g => g.userId === uid ? { ...g, ...form, updatedAt: nowIso() } : g)
      : [...grilles, {
          id: genId(), userId: uid, userName: u.name, userRole: u.role,
          groupe: groupeForRole(u.role), salaireFixe: form.salaireFixe ?? 3000,
          reglesIds: form.reglesIds ?? [], actionnaire: form.actionnaire ?? false,
          tauxBenef: form.tauxBenef, tauxSalaireBenef: form.tauxSalaireBenef,
          updatedAt: nowIso(),
        } as GrilleSalaire]
    LS.saveGrilles(updated)
    setGrilles(updated)
    setEditing(null)
    setForm({})
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">Grilles Salariales</h2>
      <div className="space-y-3">
        {staff.map(u => {
          const g = getGrille(u.id)
          const isEdit = editing === u.id
          const groupe = GROUPES.find(gp => gp.key === groupeForRole(u.role))
          const applicableRegles = regles.filter(r => r.groupe === groupeForRole(u.role) && r.actif)

          return (
            <div key={u.id} className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center gap-3 p-4">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                  {u.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm text-foreground">{u.name}</p>
                    {g?.actionnaire && <Badge label="Actionnaire" color="bg-purple-100 text-purple-700" />}
                  </div>
                  <p className="text-xs text-muted-foreground">{u.role.replace(/_/g, " ")} · {groupe?.label}</p>
                </div>
                <div className="text-right mr-2">
                  <p className="text-sm font-bold text-foreground">{g ? `${g.salaireFixe.toLocaleString()} DH` : "—"}</p>
                  <p className="text-[10px] text-muted-foreground">Fixe</p>
                </div>
                {isAdmin && (
                  <button
                    onClick={() => { setEditing(u.id); setForm(g ?? { userId: u.id, salaireFixe: 3000, reglesIds: [], actionnaire: false }) }}
                    className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  </button>
                )}
              </div>

              {isEdit && (
                <div className="border-t border-border p-4 bg-muted/30 space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Salaire fixe (DH)</label>
                      <input type="number" value={form.salaireFixe ?? ""} onChange={e => setForm(f => ({ ...f, salaireFixe: Number(e.target.value) }))} className="w-full mt-1 border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground" />
                    </div>
                    <div className="flex items-end gap-2">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={form.actionnaire ?? false} onChange={e => setForm(f => ({ ...f, actionnaire: e.target.checked }))} className="w-4 h-4 rounded" />
                        <span className="text-foreground font-medium">Actionnaire</span>
                      </label>
                    </div>
                    {form.actionnaire && (
                      <>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Taux bénéfice (%)</label>
                          <input type="number" value={form.tauxBenef ?? ""} onChange={e => setForm(f => ({ ...f, tauxBenef: Number(e.target.value) }))} className="w-full mt-1 border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground" placeholder="ex: 10" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Taux salaire sur bénéf (%)</label>
                          <input type="number" value={form.tauxSalaireBenef ?? ""} onChange={e => setForm(f => ({ ...f, tauxSalaireBenef: Number(e.target.value) }))} className="w-full mt-1 border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground" placeholder="ex: 5" />
                        </div>
                      </>
                    )}
                  </div>

                  {applicableRegles.length > 0 && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-2">Règles bonus/malus applicables</label>
                      <div className="space-y-1.5">
                        {applicableRegles.map(r => (
                          <label key={r.id} className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={(form.reglesIds ?? []).includes(r.id)}
                              onChange={e => setForm(f => ({
                                ...f,
                                reglesIds: e.target.checked
                                  ? [...(f.reglesIds ?? []), r.id]
                                  : (f.reglesIds ?? []).filter(id => id !== r.id)
                              }))}
                              className="w-4 h-4 rounded"
                            />
                            <span className={`text-xs font-medium ${r.signe === "bonus" ? "text-emerald-700" : "text-red-700"}`}>{r.signe === "bonus" ? "+" : "-"}</span>
                            <span className="text-foreground">{r.nom}</span>
                            <span className="text-muted-foreground">— {r.valeur} {r.unite.replace(/_/g, " ")}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button onClick={() => saveGrille(u.id)} className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">Sauvegarder</button>
                    <button onClick={() => { setEditing(null); setForm({}) }} className="border border-border px-4 py-2 rounded-lg text-sm font-medium hover:bg-muted transition-colors">Annuler</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: CALCUL SALAIRES (Bulletin mensuel)
// ─────────────────────────────────────────────────────────────────────────────

function CalculSalaireTab({ users }: { users: User[] }) {
  const [grilles, setGrilles] = useState<GrilleSalaire[]>([])
  const [regles, setRegles] = useState<RegleBonus[]>([])
  const [fiches, setFiches] = useState<FichePayroll[]>([])
  const [periode, setPeriode] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  })

  useEffect(() => {
    setGrilles(LS.getGrilles())
    setRegles(LS.getRegles().length ? LS.getRegles() : DEFAULT_REGLES)
    setFiches(LS.getFiches())
  }, [])

  const visites   = store.getVisites()
  const commandes = store.getCommandes()
  const retours   = (store as any).getRetours?.() ?? []
  const bls       = (store as any).getBonsLivraison?.() ?? []
  const receptions = store.getReceptions()

  const staff = users.filter(u => !["client", "fournisseur"].includes(u.role) && u.actif)

  const computeFiche = (u: User): FichePayroll => {
    const g = grilles.find(gr => gr.userId === u.id)
    const salaireFixe = g?.salaireFixe ?? 0
    const applicableRegles = regles.filter(r => (g?.reglesIds ?? []).includes(r.id))
    const groupe = groupeForRole(u.role)

    const lignesBonus: FichePayroll["lignesBonus"] = []

    applicableRegles.forEach(r => {
      let montant = 0
      let detail = ""

      if (groupe === "prevendeur") {
        if (r.type === "tonnage") {
          const ucmds = commandes.filter(c => c.commercialId === u.id && c.date?.startsWith(periode))
          const tonnage = ucmds.reduce((s, c) => s + c.lignes.reduce((a, l) => a + (l.quantite ?? 0), 0), 0)
          montant = r.valeur * tonnage
          detail = `${tonnage.toFixed(1)} tonnes × ${r.valeur} DH`
        } else if (r.type === "visite") {
          const nb = visites.filter(v => v.prevendeurId === u.id && v.date?.startsWith(periode)).length
          montant = r.valeur * nb
          detail = `${nb} visites × ${r.valeur} DH`
        } else if (r.type === "nouveau_client") {
          const ucmds = commandes.filter(c => c.commercialId === u.id && c.date?.startsWith(periode))
          const nb = new Set(ucmds.map(c => c.clientId)).size
          montant = r.valeur * nb
          detail = `${nb} clients × ${r.valeur} DH`
        } else if (r.type === "retour_client") {
          const nb = retours.filter((rt: any) => rt.livreurId === u.id && rt.date?.startsWith(periode)).length
          montant = r.valeur * nb
          detail = `${nb} retours × ${r.valeur} DH`
        }
      } else if (groupe === "logistique") {
        const delivered = bls.filter((b: any) => b.livreurId === u.id && b.date?.startsWith(periode))
        const onTime = delivered.filter((b: any) => b.livreATemps).length
        const late = delivered.length - onTime
        const taux = delivered.length > 0 ? onTime / delivered.length : 0
        if (r.type === "delai_livraison") {
          montant = taux >= 0.95 ? r.valeur : 0
          detail = `Taux ponctualité: ${Math.round(taux * 100)}%`
        } else if (r.type === "fiabilite_stock") {
          const ruptures = retours.filter((rt: any) => rt.motif === "rupture" && rt.date?.startsWith(periode)).length
          montant = ruptures === 0 ? r.valeur : 0
          detail = ruptures === 0 ? "0 rupture" : `${ruptures} ruptures`
        } else if (r.type === "retard_livraison") {
          montant = (late / (delivered.length || 1)) > 0.1 ? r.valeur : 0
          detail = `${late} retards`
        } else if (r.type === "rupture_stock") {
          const nb = retours.filter((rt: any) => rt.motif === "rupture" && rt.date?.startsWith(periode)).length
          montant = r.valeur * nb
          detail = `${nb} ruptures`
        }
      } else if (groupe === "achat") {
        const retourQ = retours.filter((rt: any) => rt.motif === "qualite" && rt.date?.startsWith(periode)).length
        if (r.type === "zero_retour_qualite") {
          montant = retourQ === 0 ? r.valeur : 0
          detail = retourQ === 0 ? "0 retour qualité" : `${retourQ} retours qualité`
        } else if (r.type === "retour_qualite") {
          montant = r.valeur * retourQ
          detail = `${retourQ} retours × ${r.valeur} DH`
        } else if (r.type === "respect_cutoff") {
          // simplified: assume 100% for now, admin can adjust
          montant = r.valeur
          detail = "Cut-off respecté"
        }
      } else {
        // dh_fixe custom rule
        montant = r.valeur
        detail = "Prime fixe"
      }

      if (montant > 0 || r.type.includes("retour") || r.type.includes("malus") || r.type.includes("retard") || r.type.includes("rupture")) {
        lignesBonus.push({ regleId: r.id, nom: r.nom, signe: r.signe, montant, detail })
      }
    })

    // ── Retenue AUTOMATIQUE : écart Caisse Acheteur transmis par la Finance ──
    // (lié au module Caisse Acheteur → déduit du salaire sans ressaisie)
    try {
      const retenues = store.getRetenuesCaisse().filter(rc => rc.mois === periode && rc.acheteurNom === u.name)
      const totalRetenue = retenues.reduce((s, rc) => s + (Number(rc.montant) || 0), 0)
      if (totalRetenue > 0) {
        lignesBonus.push({
          regleId: "retenue_caisse_acheteur",
          nom: "Retenue Caisse Acheteur (écart)",
          signe: "malus",
          montant: Math.round(totalRetenue * 100) / 100,
          detail: `${retenues.length} écart(s) caisse transmis par la Finance`,
        })
      }
    } catch { /* pas de retenue */ }

    const totalBonus = lignesBonus.filter(l => l.signe === "bonus").reduce((s, l) => s + l.montant, 0)
    const totalMalus = lignesBonus.filter(l => l.signe === "malus").reduce((s, l) => s + l.montant, 0)
    const salaireVarible = totalBonus - totalMalus
    const salaireBrut = salaireFixe + salaireVarible

    return {
      id: genId(), userId: u.id, userName: u.name, userRole: u.role,
      groupe: groupeForRole(u.role), periode, salaireFixe,
      lignesBonus, totalBonus, totalMalus, salaireVarible, salaireBrut,
      statut: "brouillon",
    }
  }

  const generateAll = () => {
    const newFiches = staff.map(u => computeFiche(u))
    const existing = fiches.filter(f => f.periode !== periode)
    const updated = [...existing, ...newFiches]
    LS.saveFiches(updated)
    setFiches(updated)
  }

  const transmit = (ficheId: string) => {
    const updated = fiches.map(f => f.id === ficheId ? { ...f, statut: "transmis_azmi" as const } : f)
    LS.saveFiches(updated)
    setFiches(updated)
  }

  const transmitAll = () => {
    const updated = fiches.map(f => f.periode === periode && f.statut === "validé_rh" ? { ...f, statut: "transmis_azmi" as const } : f)
    LS.saveFiches(updated)
    setFiches(updated)
  }

  const validate = (ficheId: string) => {
    const updated = fiches.map(f => f.id === ficheId ? { ...f, statut: "validé_rh" as const } : f)
    LS.saveFiches(updated)
    setFiches(updated)
  }

  const periodeFiches = fiches.filter(f => f.periode === periode)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-foreground flex-1">Bulletins de Salaire</h2>
        <input
          type="month" value={periode}
          onChange={e => setPeriode(e.target.value)}
          className="border border-border rounded-lg px-3 py-1.5 text-sm bg-background text-foreground"
        />
        <button onClick={generateAll} className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
          Générer / Recalculer
        </button>
        {periodeFiches.some(f => f.statut === "validé_rh") && (
          <button onClick={transmitAll} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors">
            Transmettre tout à Azmi
          </button>
        )}
      </div>

      {periodeFiches.length === 0 && (
        <div className="text-center py-16 text-muted-foreground text-sm">
          Cliquez sur Générer pour calculer les salaires de {periode}
        </div>
      )}

      <div className="space-y-3">
        {periodeFiches.map(f => (
          <div key={f.id} className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 p-4">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                {f.userName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm text-foreground">{f.userName}</p>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    f.statut === "payé" ? "bg-emerald-100 text-emerald-700" :
                    f.statut === "transmis_azmi" ? "bg-blue-100 text-blue-700" :
                    f.statut === "validé_rh" ? "bg-amber-100 text-amber-700" :
                    "bg-slate-100 text-slate-600"
                  }`}>{f.statut.replace(/_/g, " ")}</span>
                </div>
                <p className="text-xs text-muted-foreground">{f.userRole.replace(/_/g, " ")}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-foreground">{f.salaireBrut.toLocaleString()} <span className="text-sm font-normal">DH</span></p>
                <p className="text-[10px] text-muted-foreground">Fixe: {f.salaireFixe.toLocaleString()} + Var: <span className={f.salaireVarible >= 0 ? "text-emerald-600" : "text-red-600"}>{f.salaireVarible >= 0 ? "+" : ""}{f.salaireVarible.toLocaleString()}</span></p>
              </div>
            </div>

            {f.lignesBonus.length > 0 && (
              <div className="border-t border-border px-4 py-3 bg-muted/20 space-y-1.5">
                {f.lignesBonus.map((l, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${l.signe === "bonus" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{l.signe === "bonus" ? "+" : "-"}</span>
                      <span className="text-foreground">{l.nom}</span>
                      <span className="text-muted-foreground">({l.detail})</span>
                    </div>
                    <span className={`font-semibold ${l.signe === "bonus" ? "text-emerald-600" : "text-red-600"}`}>
                      {l.signe === "bonus" ? "+" : "-"}{l.montant.toLocaleString()} DH
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 p-3 border-t border-border">
              {f.statut === "brouillon" && (
                <button onClick={() => validate(f.id)} className="text-xs px-3 py-1.5 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50 font-medium transition-colors">
                  Valider RH
                </button>
              )}
              {f.statut === "validé_rh" && (
                <button onClick={() => transmit(f.id)} className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium transition-colors">
                  Transmettre à Azmi
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: BESOIN RECRUTEMENT
// ─────────────────────────────────────────────────────────────────────────────

function RecrutementTab({ users }: { users: User[] }) {
  const commandes = store.getCommandes()
  const now = new Date()
  const periodes = Array.from({ length: 3 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  })

  const prevendeurs = users.filter(u => userHasRole(u, "prevendeur") && u.actif)
  const livreurs    = users.filter(u => userHasRole(u, "livreur") && u.actif)

  const tonnageMensuel = periodes.map(p => ({
    periode: p,
    tonnage: commandes.filter(c => c.date?.startsWith(p)).reduce((s, c) => s + c.lignes.reduce((a, l) => a + (l.quantite ?? 0), 0), 0),
    commandes: commandes.filter(c => c.date?.startsWith(p)).length,
  }))

  const avgTonnage = tonnageMensuel.reduce((s, t) => s + t.tonnage, 0) / (tonnageMensuel.length || 1)
  const avgCmds    = tonnageMensuel.reduce((s, t) => s + t.commandes, 0) / (tonnageMensuel.length || 1)

  // Heuristic: 1 prevendeur ~500kg/mois, 1 livreur ~30 commandes/mois
  const besoingPrev = Math.ceil(avgTonnage / 500)
  const besoingLiv  = Math.ceil(avgCmds / 30)
  const recoPrev = besoingPrev - prevendeurs.length
  const recoLiv  = besoingLiv  - livreurs.length

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-foreground">Analyse Besoin en Recrutement</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {tonnageMensuel.map(t => (
          <div key={t.periode} className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground font-medium">{t.periode}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{t.tonnage.toFixed(0)} <span className="text-sm font-normal">kg</span></p>
            <p className="text-xs text-muted-foreground">{t.commandes} commandes</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={`rounded-xl p-5 border ${recoPrev > 0 ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}>
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-foreground">Prévendeurs</p>
            <Badge label={`${prevendeurs.length} en poste`} color="bg-white text-foreground border border-border" />
          </div>
          <p className="text-3xl font-bold text-foreground mb-1">{besoingPrev}</p>
          <p className="text-sm text-muted-foreground">nécessaires (base: 1 / 500kg)</p>
          <p className={`mt-3 text-sm font-semibold ${recoPrev > 0 ? "text-amber-700" : "text-emerald-700"}`}>
            {recoPrev > 0 ? `Recruter ${recoPrev} prévendeur${recoPrev > 1 ? "s" : ""}` : "Effectif suffisant"}
          </p>
        </div>

        <div className={`rounded-xl p-5 border ${recoLiv > 0 ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}>
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-foreground">Livreurs</p>
            <Badge label={`${livreurs.length} en poste`} color="bg-white text-foreground border border-border" />
          </div>
          <p className="text-3xl font-bold text-foreground mb-1">{besoingLiv}</p>
          <p className="text-sm text-muted-foreground">nécessaires (base: 1 / 30 cmd)</p>
          <p className={`mt-3 text-sm font-semibold ${recoLiv > 0 ? "text-amber-700" : "text-emerald-700"}`}>
            {recoLiv > 0 ? `Recruter ${recoLiv} livreur${recoLiv > 1 ? "s" : ""}` : "Effectif suffisant"}
          </p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <p className="font-semibold text-foreground text-sm">Synthèse RH — Recommandations Ourai</p>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>• Tonnage moyen sur 3 mois : <strong className="text-foreground">{avgTonnage.toFixed(0)} kg / mois</strong></p>
          <p>• Commandes moyennes : <strong className="text-foreground">{avgCmds.toFixed(0)} cmd / mois</strong></p>
          {recoPrev > 0 && <p className="text-amber-700 font-medium">• Besoin identifié : +{recoPrev} prévendeur{recoPrev > 1 ? "s" : ""} pour absorber le flux actuel</p>}
          {recoLiv > 0 && <p className="text-amber-700 font-medium">• Besoin identifié : +{recoLiv} livreur{recoLiv > 1 ? "s" : ""} pour couvrir les tournées</p>}
          {recoPrev <= 0 && recoLiv <= 0 && <p className="text-emerald-700 font-medium">• Les effectifs actuels couvrent les besoins opérationnels</p>}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "productivite", label: "Productivité équipe" },
  { id: "recrutement",  label: "Besoin recrutement" },
  { id: "regles",       label: "Règles bonus/malus" },
  { id: "grilles",      label: "Grilles salariales" },
  { id: "salaires",     label: "Calcul salaires" },
] as const

type SubTab = typeof TABS[number]["id"]

export default function BOResources({ user }: { user: User }) {
  const [tab, setTab] = useState<SubTab>("productivite")
  const [users, setUsers] = useState<User[]>([])
  const [rev, setRev] = useState(0)   // bump après hydratation Supabase → remonte les onglets
  const isAdmin = ["super_super_admin", "super_admin", "admin"].includes(user.role)

  useEffect(() => {
    setUsers(store.getUsers())
    // Fusionne les réglages RH distants puis remonte les onglets
    hydrateRH().then(() => setRev(r => r + 1))
  }, [])

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header — Ourai AI Agent */}
      <div className="rounded-2xl p-5 flex items-start gap-4" style={{ background: "linear-gradient(135deg, oklch(0.15 0.05 260) 0%, oklch(0.20 0.08 280) 100%)", border: "1px solid oklch(0.30 0.1 280)" }}>
        <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-lg font-black"
          style={{ background: "oklch(0.45 0.22 280)", color: "white" }}>
          AI
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-black text-white">OURAI</h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "oklch(0.45 0.22 280)", color: "white" }}>
              AGENT IA RH
            </span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-emerald-400 font-semibold">Actif</span>
          </div>
          <p className="text-sm mt-1" style={{ color: "oklch(0.75 0.06 280)" }}>
            Expert IA en Ressources Humaines, optimisation des coûts de manutention et tracking de rendement.
          </p>
          <div className="flex flex-wrap gap-3 mt-2">
            {["Productivite equipe", "Analyse recrutement", "Calcul salaires variables", "Optimisation couts"].map(cap => (
              <span key={cap} className="text-[10px] px-2 py-0.5 rounded-md font-medium" style={{ background: "oklch(0.28 0.08 280)", color: "oklch(0.80 0.08 280)" }}>
                {cap}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-muted rounded-xl p-1 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content — keyé sur rev : remonte après l'hydratation Supabase */}
      <div key={rev}>
        {tab === "productivite" && <ProductiviteTab users={users} />}
        {tab === "recrutement"  && <RecrutementTab  users={users} />}
        {tab === "regles"       && <ReglesTab        isAdmin={isAdmin} />}
        {tab === "grilles"      && <GrillesTab        users={users} isAdmin={isAdmin} />}
        {tab === "salaires"     && <CalculSalaireTab  users={users} />}
      </div>
    </div>
  )
}
