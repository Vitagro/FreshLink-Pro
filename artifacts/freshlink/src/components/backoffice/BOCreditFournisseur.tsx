"use client"

import { useState, useEffect } from "react"
import { store, type User } from "@/lib/store"

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface CreditLigne {
  id: string
  fournisseurId: string
  fournisseurNom: string
  articleNom: string
  acheteurNom: string
  acheteurId: string
  dateAchat: string
  dateEcheance: string
  montant: number
  montantPaye: number
  statut: "impaye" | "partiel" | "solde"
  referenceFacture: string
  notes: string
}

function genId() { return Math.random().toString(36).slice(2, 10) }
function loadCredits(): CreditLigne[] {
  try { return JSON.parse(localStorage.getItem("fl_credits_fournisseurs") ?? "[]") } catch { return [] }
}
function saveCredits(c: CreditLigne[]) {
  localStorage.setItem("fl_credits_fournisseurs", JSON.stringify(c))
  // Sync Supabase (service-role) — alimente le rapport crédit quotidien
  try {
    const now = new Date().toISOString()
    fetch("/api/sync-write", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "fl_credits_fournisseurs", upserts: c.map(l => ({ id: l.id, payload: l, updated_at: now })) }),
    }).catch(() => {})
  } catch { /* offline */ }
}

function Icon({ d }: { d: string }) {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
    </svg>
  )
}

const STATUT_STYLE = {
  impaye: { bg: "bg-red-50",    text: "text-red-700",   border: "border-red-200",   label: "Impaye" },
  partiel: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", label: "Partiel" },
  solde:  { bg: "bg-green-50",  text: "text-green-700", border: "border-green-200", label: "Solde" },
}

type ViewMode = "liste" | "par_fournisseur" | "par_acheteur"

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

export default function BOCreditFournisseur({ user }: { user: User }) {
  const [credits, setCredits]       = useState<CreditLigne[]>(loadCredits)
  const [view, setView]             = useState<ViewMode>("liste")
  const [filterStatut, setFilterStatut] = useState<"" | "impaye" | "partiel" | "solde">("")
  const [filterFournisseur, setFilterFournisseur] = useState("")
  const [showForm, setShowForm]     = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [paymentModal, setPaymentModal] = useState<CreditLigne | null>(null)
  const [payAmount, setPayAmount]   = useState("")

  // Load fournisseurs from store
  const [fournisseurs, setFournisseurs] = useState<Array<{ id: string; nom: string }>>([])
  const [users, setUsers]           = useState<Array<{ id: string; name: string }>>([])
  const [articleNoms, setArticleNoms] = useState<string[]>([])

  useEffect(() => {
    const frs = store.getFournisseurs()
    setFournisseurs(frs.map(f => ({ id: f.id, nom: f.nom })))
    setUsers(store.getUsers().map(u => ({ id: u.id, name: u.name })))
    setArticleNoms(Array.from(new Set(store.getArticles().map(a => a.nom).filter(Boolean))).sort())
    // Merge des crédits Supabase (saisis sur d'autres appareils)
    fetch("/api/sync-read?table=fl_credits_fournisseurs", { cache: "no-store" })
      .then(r => r.json())
      .then((j: { data?: { id: string; payload?: Partial<CreditLigne> }[] }) => {
        const remote = (j?.data ?? []).map(r => ({ ...(r.payload ?? {}), id: r.id } as CreditLigne))
        if (!remote.length) return
        setCredits(prev => {
          const ids = new Set(prev.map(p => p.id))
          const merged = [...prev, ...remote.filter(r => !ids.has(r.id))]
          localStorage.setItem("fl_credits_fournisseurs", JSON.stringify(merged))
          return merged
        })
      })
      .catch(() => {})
  }, [])

  const blank = (): Omit<CreditLigne, "id"> => ({
    fournisseurId: fournisseurs[0]?.id ?? "",
    fournisseurNom: fournisseurs[0]?.nom ?? "",
    articleNom: "",
    acheteurNom: user.name,
    acheteurId: user.id,
    dateAchat: store.today(),
    dateEcheance: "",
    montant: 0,
    montantPaye: 0,
    statut: "impaye",
    referenceFacture: "",
    notes: "",
  })
  const [form, setForm] = useState<Omit<CreditLigne, "id">>(blank)

  const filtered = credits.filter(c => {
    if (filterStatut && c.statut !== filterStatut) return false
    if (filterFournisseur && c.fournisseurNom !== filterFournisseur) return false
    return true
  })

  // Aggregations
  const totalImpaye = credits.filter(c => c.statut !== "solde").reduce((s, c) => s + (c.montant - c.montantPaye), 0)
  const totalSolde  = credits.filter(c => c.statut === "solde").reduce((s, c) => s + c.montant, 0)
  const totalGlobal = credits.reduce((s, c) => s + c.montant, 0)
  const fournisseursList = [...new Set(credits.map(c => c.fournisseurNom))]

  const handleSave = () => {
    if (!form.articleNom || form.montant <= 0) return
    const fr = fournisseurs.find(f => f.id === form.fournisseurId)
    const newCredit: CreditLigne = {
      ...form,
      id: genId(),
      fournisseurNom: fr?.nom ?? form.fournisseurNom,
      statut: form.montantPaye >= form.montant ? "solde" : form.montantPaye > 0 ? "partiel" : "impaye",
    }
    const updated = [...credits, newCredit]
    setCredits(updated)
    saveCredits(updated)
    setShowForm(false)
    setForm(blank())
  }

  const handlePayment = () => {
    if (!paymentModal) return
    const amount = Number(payAmount)
    if (isNaN(amount) || amount <= 0) return
    const updated = credits.map(c => {
      if (c.id !== paymentModal.id) return c
      const paid = Math.min(c.montantPaye + amount, c.montant)
      const statut: CreditLigne["statut"] = paid >= c.montant ? "solde" : paid > 0 ? "partiel" : "impaye"
      return { ...c, montantPaye: paid, statut }
    })
    setCredits(updated)
    saveCredits(updated)
    setPaymentModal(null)
    setPayAmount("")
  }

  const handleDelete = (id: string) => {
    const updated = credits.filter(c => c.id !== id)
    setCredits(updated)
    saveCredits(updated)
    fetch("/api/sync-write", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "fl_credits_fournisseurs", deletes: [id] }),
    }).catch(() => {})
    setSelectedId(null)
  }

  // Group by fournisseur
  const byFournisseur: Record<string, CreditLigne[]> = {}
  filtered.forEach(c => {
    if (!byFournisseur[c.fournisseurNom]) byFournisseur[c.fournisseurNom] = []
    byFournisseur[c.fournisseurNom].push(c)
  })

  // Group by acheteur
  const byAcheteur: Record<string, CreditLigne[]> = {}
  filtered.forEach(c => {
    if (!byAcheteur[c.acheteurNom]) byAcheteur[c.acheteurNom] = []
    byAcheteur[c.acheteurNom].push(c)
  })

  const fmt = (n: number) => n.toLocaleString("fr-MA", { minimumFractionDigits: 2 })

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Credit Fournisseurs</h2>
          <p className="text-sm text-muted-foreground">Suivi des achats non regles par article et acheteur</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setForm(blank()) }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm hover:opacity-90 transition-opacity"
          style={{ background: "var(--primary)" }}>
          <Icon d="M12 4v16m8-8H4" />
          Nouveau credit
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total credits", value: `${fmt(totalGlobal)} DH`, sub: `${credits.length} entrees`, color: "text-foreground", bg: "bg-card" },
          { label: "Reste a payer", value: `${fmt(totalImpaye)} DH`, sub: "impaye + partiel", color: "text-red-700", bg: "bg-red-50" },
          { label: "Solde", value: `${fmt(totalSolde)} DH`, sub: `${credits.filter(c => c.statut === "solde").length} factures`, color: "text-green-700", bg: "bg-green-50" },
          { label: "Fournisseurs", value: fournisseursList.length, sub: "avec credit en cours", color: "text-amber-700", bg: "bg-amber-50" },
        ].map(k => (
          <div key={k.label} className={`${k.bg} rounded-2xl border border-border p-4`}>
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className={`text-xl font-black mt-1 ${k.color}`}>{k.value}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* View toggle + Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex rounded-xl overflow-hidden border border-border">
          {([["liste", "Liste"], ["par_fournisseur", "Par Fournisseur"], ["par_acheteur", "Par Acheteur"]] as const).map(([v, l]) => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-2 text-xs font-bold transition-colors ${view === v ? "text-white" : "text-muted-foreground bg-card hover:bg-muted"}`}
              style={view === v ? { background: "var(--primary)" } : {}}>
              {l}
            </button>
          ))}
        </div>
        <select value={filterStatut} onChange={e => setFilterStatut(e.target.value as any)}
          className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none">
          <option value="">Tous statuts</option>
          <option value="impaye">Impaye</option>
          <option value="partiel">Partiel</option>
          <option value="solde">Solde</option>
        </select>
        <select value={filterFournisseur} onChange={e => setFilterFournisseur(e.target.value)}
          className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none">
          <option value="">Tous fournisseurs</option>
          {fournisseursList.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} ligne(s)</span>
      </div>

      {/* Content */}
      {view === "liste" && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              <p className="font-semibold">Aucun credit enregistre</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "oklch(0.14 0.03 260)", color: "oklch(0.88 0.015 245)" }}>
                    {["Fournisseur", "Article", "Acheteur", "Date", "Echeance", "Montant", "Paye", "Reste", "Statut", ""].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => {
                    const st = STATUT_STYLE[c.statut]
                    const reste = c.montant - c.montantPaye
                    const isOverdue = c.dateEcheance && c.dateEcheance < store.today() && c.statut !== "solde"
                    return (
                      <tr key={c.id} className={`border-t border-border hover:bg-muted/20 ${isOverdue ? "bg-red-50/30" : ""}`}>
                        <td className="px-4 py-3 font-semibold">{c.fournisseurNom}</td>
                        <td className="px-4 py-3 text-muted-foreground">{c.articleNom}</td>
                        <td className="px-4 py-3">{c.acheteurNom}</td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{c.dateAchat}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={isOverdue ? "text-red-600 font-bold" : "text-muted-foreground"}>{c.dateEcheance || "—"}</span>
                          {isOverdue && <span className="ml-1 text-[10px] text-red-600 font-bold">RETARD</span>}
                        </td>
                        <td className="px-4 py-3 font-bold text-foreground whitespace-nowrap">{fmt(c.montant)} DH</td>
                        <td className="px-4 py-3 text-green-700 font-semibold whitespace-nowrap">{fmt(c.montantPaye)} DH</td>
                        <td className="px-4 py-3 font-bold whitespace-nowrap">
                          <span className={reste > 0 ? "text-red-700" : "text-green-700"}>{fmt(reste)} DH</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[11px] font-bold px-2 py-1 rounded-full border ${st.bg} ${st.text} ${st.border}`}>
                            {st.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5">
                            {c.statut !== "solde" && (
                              <button onClick={() => { setPaymentModal(c); setPayAmount("") }}
                                className="px-2.5 py-1.5 rounded-lg bg-green-600 text-white text-[11px] font-bold hover:bg-green-700 transition-colors whitespace-nowrap">
                                Payer
                              </button>
                            )}
                            <button onClick={() => handleDelete(c.id)}
                              className="px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 text-[11px] font-bold hover:bg-red-50 transition-colors">
                              <Icon d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {view === "par_fournisseur" && (
        <div className="space-y-4">
          {Object.entries(byFournisseur).map(([nom, lines]) => {
            const total = lines.reduce((s, l) => s + l.montant, 0)
            const paye  = lines.reduce((s, l) => s + l.montantPaye, 0)
            const reste = total - paye
            return (
              <div key={nom} className="bg-card rounded-2xl border border-border overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                  <div>
                    <p className="font-bold text-foreground">{nom}</p>
                    <p className="text-xs text-muted-foreground">{lines.length} ligne(s)</p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-foreground">{fmt(total)} DH total</p>
                    <p className="text-xs text-red-600 font-semibold">{fmt(reste)} DH reste a payer</p>
                  </div>
                </div>
                <div className="divide-y divide-border">
                  {lines.map(l => {
                    const st = STATUT_STYLE[l.statut]
                    return (
                      <div key={l.id} className="flex items-center gap-4 px-5 py-3 text-sm">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground truncate">{l.articleNom}</p>
                          <p className="text-xs text-muted-foreground">Acheteur: {l.acheteurNom} · {l.dateAchat}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold">{fmt(l.montant)} DH</p>
                          <p className="text-xs text-muted-foreground">Paye: {fmt(l.montantPaye)} DH</p>
                        </div>
                        <span className={`text-[11px] font-bold px-2 py-1 rounded-full border ${st.bg} ${st.text} ${st.border} shrink-0`}>{st.label}</span>
                        {l.statut !== "solde" && (
                          <button onClick={() => { setPaymentModal(l); setPayAmount("") }}
                            className="px-2.5 py-1.5 rounded-lg bg-green-600 text-white text-[11px] font-bold hover:bg-green-700 shrink-0">
                            Payer
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {Object.keys(byFournisseur).length === 0 && (
            <div className="text-center py-12 text-muted-foreground">Aucun credit pour ce filtre</div>
          )}
        </div>
      )}

      {view === "par_acheteur" && (
        <div className="space-y-4">
          {Object.entries(byAcheteur).map(([nom, lines]) => {
            const total = lines.reduce((s, l) => s + l.montant, 0)
            const reste = total - lines.reduce((s, l) => s + l.montantPaye, 0)
            return (
              <div key={nom} className="bg-card rounded-2xl border border-border overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                  <div>
                    <p className="font-bold text-foreground">{nom}</p>
                    <p className="text-xs text-muted-foreground">{lines.length} achat(s) non entierement regle(s)</p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-foreground">{fmt(total)} DH engage</p>
                    <p className={`text-xs font-semibold ${reste > 0 ? "text-red-600" : "text-green-600"}`}>{fmt(reste)} DH reste</p>
                  </div>
                </div>
                <div className="divide-y divide-border">
                  {lines.map(l => {
                    const st = STATUT_STYLE[l.statut]
                    return (
                      <div key={l.id} className="flex items-center gap-4 px-5 py-3 text-sm">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{l.articleNom} — {l.fournisseurNom}</p>
                          <p className="text-xs text-muted-foreground">{l.dateAchat}{l.referenceFacture ? ` · Ref: ${l.referenceFacture}` : ""}</p>
                        </div>
                        <p className="font-bold shrink-0">{fmt(l.montant)} DH</p>
                        <span className={`text-[11px] font-bold px-2 py-1 rounded-full border ${st.bg} ${st.text} ${st.border} shrink-0`}>{st.label}</span>
                        {l.statut !== "solde" && (
                          <button onClick={() => { setPaymentModal(l); setPayAmount("") }}
                            className="px-2.5 py-1.5 rounded-lg bg-green-600 text-white text-[11px] font-bold hover:bg-green-700 shrink-0">
                            Valider paiement
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {Object.keys(byAcheteur).length === 0 && (
            <div className="text-center py-12 text-muted-foreground">Aucun credit pour ce filtre</div>
          )}
        </div>
      )}

      {/* Payment modal */}
      {paymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-card rounded-2xl border border-border w-full max-w-md shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-bold text-foreground">Validation de paiement</p>
              <button onClick={() => setPaymentModal(null)} className="p-1 rounded-lg hover:bg-muted text-muted-foreground">
                <Icon d="M6 18L18 6M6 6l12 12" />
              </button>
            </div>
            <div className="bg-muted rounded-xl p-4 space-y-1 text-sm">
              <p><span className="text-muted-foreground">Fournisseur:</span> <strong>{paymentModal.fournisseurNom}</strong></p>
              <p><span className="text-muted-foreground">Article:</span> <strong>{paymentModal.articleNom}</strong></p>
              <p><span className="text-muted-foreground">Montant total:</span> <strong>{fmt(paymentModal.montant)} DH</strong></p>
              <p><span className="text-muted-foreground">Deja paye:</span> <strong className="text-green-700">{fmt(paymentModal.montantPaye)} DH</strong></p>
              <p><span className="text-muted-foreground">Reste:</span> <strong className="text-red-700">{fmt(paymentModal.montant - paymentModal.montantPaye)} DH</strong></p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Montant du paiement (DH)</label>
              <input type="number" min="0.01" step="0.01"
                value={payAmount} onChange={e => setPayAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/30" />
              <div className="flex gap-2 mt-1.5">
                <button onClick={() => setPayAmount(String(Math.round((paymentModal.montant - paymentModal.montantPaye) * 100) / 100))}
                  className="text-xs text-primary underline">Tout regler</button>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setPaymentModal(null)}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted">
                Annuler
              </button>
              <button onClick={handlePayment} disabled={!payAmount || Number(payAmount) <= 0}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 hover:opacity-90"
                style={{ background: "var(--primary)" }}>
                Valider le paiement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-card rounded-2xl border border-border w-full max-w-lg shadow-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <p className="font-bold text-foreground">Nouveau credit fournisseur</p>
              <button onClick={() => setShowForm(false)} className="p-1 rounded-lg hover:bg-muted text-muted-foreground">
                <Icon d="M6 18L18 6M6 6l12 12" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground mb-1 block">Fournisseur</label>
                <select value={form.fournisseurId}
                  onChange={e => {
                    const fr = fournisseurs.find(f => f.id === e.target.value)
                    setForm(f => ({ ...f, fournisseurId: e.target.value, fournisseurNom: fr?.nom ?? "" }))
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none">
                  {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                  {fournisseurs.length === 0 && <option value="">Aucun fournisseur</option>}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground mb-1 block">Article *</label>
                <input list="credit-article-options" value={form.articleNom} onChange={e => setForm(f => ({ ...f, articleNom: e.target.value }))}
                  placeholder="Ex: Tomates 10kg, Oranges carton..."
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                <datalist id="credit-article-options">
                  {articleNoms.map(n => <option key={n} value={n} />)}
                </datalist>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Acheteur</label>
                <select value={form.acheteurId}
                  onChange={e => {
                    const u = users.find(u => u.id === e.target.value)
                    setForm(f => ({ ...f, acheteurId: e.target.value, acheteurNom: u?.name ?? "" }))
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none">
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Reference facture</label>
                <input value={form.referenceFacture} onChange={e => setForm(f => ({ ...f, referenceFacture: e.target.value }))}
                  placeholder="FA-XXXX"
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Montant total (DH) *</label>
                <input type="number" min="0" step="0.01" value={form.montant || ""}
                  onChange={e => setForm(f => ({ ...f, montant: Number(e.target.value) }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Montant deja paye (DH)</label>
                <input type="number" min="0" step="0.01" value={form.montantPaye || ""}
                  onChange={e => setForm(f => ({ ...f, montantPaye: Number(e.target.value) }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Date d&apos;achat</label>
                <input type="date" value={form.dateAchat} onChange={e => setForm(f => ({ ...f, dateAchat: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Date d&apos;echeance</label>
                <input type="date" value={form.dateEcheance} onChange={e => setForm(f => ({ ...f, dateEcheance: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} placeholder="Conditions de paiement, details..."
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none resize-none" />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted">
                Annuler
              </button>
              <button onClick={handleSave} disabled={!form.articleNom || form.montant <= 0}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 hover:opacity-90"
                style={{ background: "var(--primary)" }}>
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
