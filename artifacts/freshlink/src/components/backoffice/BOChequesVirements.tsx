"use client"

// ══════════════════════════════════════════════════════════════════════════════
//  BOChequesVirements — Registre des chèques & virements reçus des clients.
//
//  Distinct de la caisse (CaisseEntry, espèces uniquement) : un chèque/
//  virement reçu reste "en attente" jusqu'à son encaissement effectif en
//  banque (ou son rejet). Utilisé par Cash Man (réception physique des
//  règlements) et Finance (suivi/rapprochement bancaire) — même écran monté
//  dans les deux back-offices.
// ══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react"
import { store, type ReglementCV, type TypeReglementCV, type StatutReglementCV, type UserRole } from "@/lib/store"
import { hasPermission } from "@/lib/permissions"
import { logAction } from "@/lib/auditLog"

// N'exige que ce dont ce composant a vraiment besoin (créateur du règlement)
// — monté depuis BOCash et BOFinance, dont les types `user` de props diffèrent.
interface Props { user: { id: string; name: string; role: UserRole } }

const TYPE_LABELS: Record<TypeReglementCV, string> = { cheque: "Chèque", virement: "Virement" }
const STATUT_LABELS: Record<StatutReglementCV, string> = { en_attente: "En attente", encaisse: "Encaissé", rejete: "Rejeté" }
const STATUT_STYLES: Record<StatutReglementCV, string> = {
  en_attente: "bg-amber-100 text-amber-800 border-amber-200",
  encaisse: "bg-green-100 text-green-700 border-green-200",
  rejete: "bg-red-100 text-red-700 border-red-200",
}

const money = (n: number) => `${(n || 0).toLocaleString("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`

const EMPTY_FORM = {
  type: "cheque" as TypeReglementCV,
  date: "",
  clientNom: "",
  montant: "",
  reference: "",
  banque: "",
  dateEcheance: "",
  notes: "",
}

// Sync best-effort vers Supabase — jamais bloquant, mêmes conventions que le
// reste de l'app (ex. BOCash) : store local en source de vérité + push direct.
function syncUpsert(r: ReglementCV) {
  fetch("/api/sync-write", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ table: "fl_reglements_cv", upserts: [{ id: r.id, payload: r }] }),
  }).catch(() => { /* offline */ })
}
function syncDelete(id: string) {
  fetch("/api/sync-write", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ table: "fl_reglements_cv", deletes: [id] }),
  }).catch(() => { /* offline */ })
}

export default function BOChequesVirements({ user }: Props) {
  const [reglements, setReglements] = useState<ReglementCV[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ReglementCV | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [filterType, setFilterType] = useState<"tous" | TypeReglementCV>("tous")
  const [filterStatut, setFilterStatut] = useState<"tous" | StatutReglementCV>("tous")
  const [filterFrom, setFilterFrom] = useState("")
  const [filterTo, setFilterTo] = useState("")
  const [search, setSearch] = useState("")
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [motifRejet, setMotifRejet] = useState("")

  const refresh = () => setReglements(store.getReglementsCV())
  useEffect(() => {
    refresh()
    ;(async () => {
      try {
        const res = await fetch("/api/sync-read?table=fl_reglements_cv", { cache: "no-store" })
        const j = await res.json()
        if (j?.ok && Array.isArray(j.data) && j.data.length) {
          store.saveReglementsCV(j.data.map((r: { payload: ReglementCV }) => r.payload))
          refresh()
        }
      } catch { /* offline */ }
    })()
  }, [])

  const openNew = () => { setEditing(null); setForm({ ...EMPTY_FORM, date: store.today() }); setShowForm(true) }
  const openEdit = (r: ReglementCV) => {
    setEditing(r)
    setForm({
      type: r.type, date: r.date, clientNom: r.clientNom, montant: String(r.montant),
      reference: r.reference ?? "", banque: r.banque ?? "", dateEcheance: r.dateEcheance ?? "", notes: r.notes ?? "",
    })
    setShowForm(true)
  }

  const save = () => {
    if (!form.clientNom.trim() || !(Number(form.montant) > 0) || !form.date) return
    if (editing) {
      const updated: ReglementCV = {
        ...editing, type: form.type, date: form.date, clientNom: form.clientNom.trim(),
        montant: Number(form.montant), reference: form.reference.trim() || undefined,
        banque: form.banque.trim() || undefined, dateEcheance: form.dateEcheance || undefined,
        notes: form.notes.trim() || undefined,
      }
      const arr = store.getReglementsCV()
      const idx = arr.findIndex(r => r.id === editing.id)
      if (idx >= 0) { arr[idx] = updated; store.saveReglementsCV(arr) }
      syncUpsert(updated)
    } else {
      const r: ReglementCV = {
        id: store.genId(), type: form.type, date: form.date, clientNom: form.clientNom.trim(),
        montant: Number(form.montant), reference: form.reference.trim() || undefined,
        banque: form.banque.trim() || undefined, dateEcheance: form.dateEcheance || undefined,
        notes: form.notes.trim() || undefined, statut: "en_attente",
        createdBy: user.id, createdAt: new Date().toISOString(),
      }
      store.addReglementCV(r)
      syncUpsert(r)
    }
    setShowForm(false)
    refresh()
  }

  const marquerEncaisse = (r: ReglementCV) => {
    if (!hasPermission(user.role, "valider_cash")) { logAction(user, "valider_cash", "denied", { type: "reglement_cv", id: r.id, label: `${r.type} ${r.montant}` }); return }
    logAction(user, "valider_cash", "success", { type: "reglement_cv", id: r.id, label: `encaisse — ${r.type} ${r.montant}` })
    store.updateReglementCV(r.id, { statut: "encaisse", dateEncaissement: store.today() })
    const updated = store.getReglementsCV().find(x => x.id === r.id)
    if (updated) syncUpsert(updated)
    refresh()
  }

  const confirmerRejet = (r: ReglementCV) => {
    if (!motifRejet.trim()) return
    if (!hasPermission(user.role, "valider_cash")) { logAction(user, "valider_cash", "denied", { type: "reglement_cv", id: r.id, label: `rejet — ${r.type} ${r.montant}` }); return }
    logAction(user, "valider_cash", "success", { type: "reglement_cv", id: r.id, label: `rejet — ${r.type} ${r.montant}` })
    store.updateReglementCV(r.id, { statut: "rejete", motifRejet: motifRejet.trim() })
    const updated = store.getReglementsCV().find(x => x.id === r.id)
    if (updated) syncUpsert(updated)
    setRejectingId(null); setMotifRejet("")
    refresh()
  }

  const remove = (id: string) => {
    if (!hasPermission(user.role, "valider_cash")) { logAction(user, "valider_cash", "denied", { type: "reglement_cv_suppression", id }); return }
    if (!confirm("Supprimer ce règlement du registre ?")) return
    logAction(user, "valider_cash", "success", { type: "reglement_cv_suppression", id })
    store.deleteReglementCV(id)
    syncDelete(id)
    refresh()
  }

  const filtered = reglements
    .filter(r => filterType === "tous" || r.type === filterType)
    .filter(r => filterStatut === "tous" || r.statut === filterStatut)
    .filter(r => !filterFrom || r.date >= filterFrom)
    .filter(r => !filterTo || r.date <= filterTo)
    .filter(r => !search.trim() || r.clientNom.toLowerCase().includes(search.trim().toLowerCase()) || (r.reference ?? "").toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => b.date.localeCompare(a.date))

  const kpis = {
    enAttenteMontant: reglements.filter(r => r.statut === "en_attente").reduce((s, r) => s + r.montant, 0),
    enAttenteNb: reglements.filter(r => r.statut === "en_attente").length,
    encaisseMontant: reglements.filter(r => r.statut === "encaisse").reduce((s, r) => s + r.montant, 0),
    rejeteNb: reglements.filter(r => r.statut === "rejete").length,
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl bg-gradient-to-br from-teal-700 via-teal-800 to-slate-900 p-5 text-white">
        <h2 className="text-lg font-black">🏦 Chèques &amp; Virements</h2>
        <p className="text-sm text-white/75 mt-1">Registre des règlements reçus — suivi jusqu&apos;à l&apos;encaissement en banque.</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { l: "En attente", v: money(kpis.enAttenteMontant), sub: `${kpis.enAttenteNb} règlement(s)`, i: "⏳", c: "text-amber-600" },
          { l: "Encaissé (total)", v: money(kpis.encaisseMontant), sub: "toutes périodes", i: "✅", c: "text-green-600" },
          { l: "Rejetés", v: String(kpis.rejeteNb), sub: "à relancer", i: "⚠️", c: kpis.rejeteNb > 0 ? "text-red-600" : "text-slate-900" },
          { l: "Total registre", v: String(reglements.length), sub: "chèques + virements", i: "📋", c: "text-slate-900" },
        ].map(k => (
          <div key={k.l} className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-xl">{k.i}</div>
            <div className="min-w-0"><p className="text-[11px] text-slate-500 truncate">{k.l}</p><p className={`text-base font-black ${k.c}`}>{k.v}</p><p className="text-[10px] text-slate-400">{k.sub}</p></div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold text-slate-600">Type</label>
          <select value={filterType} onChange={e => setFilterType(e.target.value as typeof filterType)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm">
            <option value="tous">Tous</option>
            <option value="cheque">Chèque</option>
            <option value="virement">Virement</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold text-slate-600">Statut</label>
          <select value={filterStatut} onChange={e => setFilterStatut(e.target.value as typeof filterStatut)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm">
            <option value="tous">Tous</option>
            <option value="en_attente">En attente</option>
            <option value="encaisse">Encaissé</option>
            <option value="rejete">Rejeté</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold text-slate-600">Du</label>
          <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold text-slate-600">Au</label>
          <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm" />
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Client / n° référence…"
          className="flex-1 min-w-[180px] px-3 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50" />
        <button onClick={openNew} className="px-4 py-2.5 rounded-xl bg-teal-700 text-white text-sm font-bold hover:bg-teal-800">
          + Nouveau règlement
        </button>
      </div>

      {/* Liste */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
          <p className="text-4xl mb-2">🏦</p>
          <p className="font-semibold">Aucun règlement.</p>
          <p className="text-sm mt-1">Enregistre un chèque ou un virement reçu avec « + Nouveau règlement ».</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-3">Date</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Client</th>
                <th className="px-3 py-3">N° / Banque</th>
                <th className="px-3 py-3">Échéance</th>
                <th className="px-3 py-3 text-right">Montant</th>
                <th className="px-3 py-3">Statut</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-3 py-2.5 text-slate-600">{r.date}</td>
                  <td className="px-3 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${r.type === "cheque" ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-sky-50 text-sky-700 border-sky-200"}`}>
                      {r.type === "cheque" ? "📝" : "🏛️"} {TYPE_LABELS[r.type]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-semibold text-slate-900">{r.clientNom}</td>
                  <td className="px-3 py-2.5 text-slate-500 text-xs">
                    {r.reference && <span className="block">{r.reference}</span>}
                    {r.banque && <span className="block">{r.banque}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-slate-500">{r.dateEcheance || "—"}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-slate-900">{money(r.montant)}</td>
                  <td className="px-3 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUT_STYLES[r.statut]}`}>{STATUT_LABELS[r.statut]}</span>
                    {r.statut === "rejete" && r.motifRejet && <span className="block text-[10px] text-red-500 mt-0.5">{r.motifRejet}</span>}
                    {r.statut === "encaisse" && r.dateEncaissement && <span className="block text-[10px] text-green-600 mt-0.5">le {r.dateEncaissement}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {r.statut === "en_attente" && (
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => marquerEncaisse(r)} className="text-[11px] px-2 py-1 rounded-md bg-green-600 text-white font-semibold hover:bg-green-700">Encaissé</button>
                        <button onClick={() => { setRejectingId(r.id); setMotifRejet("") }} className="text-[11px] px-2 py-1 rounded-md bg-red-50 text-red-600 border border-red-200 font-semibold hover:bg-red-100">Rejeté</button>
                      </div>
                    )}
                    <div className="flex items-center justify-end gap-1.5 mt-1">
                      <button onClick={() => openEdit(r)} className="text-[11px] px-2 py-1 rounded-md bg-slate-100 text-slate-600 font-semibold hover:bg-slate-200">Modifier</button>
                      <button onClick={() => remove(r.id)} className="text-[11px] px-2 py-1 rounded-md bg-slate-100 text-slate-400 font-semibold hover:bg-red-50 hover:text-red-500">Suppr.</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Popup rejet */}
      {rejectingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={e => e.target === e.currentTarget && setRejectingId(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 flex flex-col gap-3">
            <h3 className="font-bold text-slate-800">⚠️ Marquer comme rejeté</h3>
            <textarea value={motifRejet} onChange={e => setMotifRejet(e.target.value)} rows={3} autoFocus
              placeholder="Motif du rejet (provision insuffisante, opposition...)"
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-300" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setRejectingId(null)} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-500 hover:bg-slate-100">Annuler</button>
              <button onClick={() => { const r = reglements.find(x => x.id === rejectingId); if (r) confirmerRejet(r) }}
                disabled={!motifRejet.trim()}
                className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-bold disabled:opacity-40">Confirmer le rejet</button>
            </div>
          </div>
        </div>
      )}

      {/* Formulaire nouveau/modifier */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="font-bold text-slate-800">{editing ? "Modifier le règlement" : "Nouveau règlement"}</h3>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <div className="flex gap-2">
                {(["cheque", "virement"] as const).map(t => (
                  <button key={t} type="button" onClick={() => setForm(f => ({ ...f, type: t }))}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all ${form.type === t ? "bg-teal-700 text-white border-transparent" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                    {t === "cheque" ? "📝 Chèque" : "🏛️ Virement"}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-700">Date de réception *</label>
                  <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-700">Montant (DH) *</label>
                  <input type="number" step="0.01" value={form.montant} onChange={e => setForm(f => ({ ...f, montant: e.target.value }))}
                    className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm" />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">Client *</label>
                <input type="text" value={form.clientNom} onChange={e => setForm(f => ({ ...f, clientNom: e.target.value }))}
                  placeholder="Nom du client"
                  className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-700">{form.type === "cheque" ? "N° chèque" : "Référence virement"}</label>
                  <input type="text" value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
                    className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-700">Banque</label>
                  <input type="text" value={form.banque} onChange={e => setForm(f => ({ ...f, banque: e.target.value }))}
                    className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm" />
                </div>
              </div>
              {form.type === "cheque" && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-700">Date d&apos;échéance (chèque différé)</label>
                  <input type="date" value={form.dateEcheance} onChange={e => setForm(f => ({ ...f, dateEcheance: e.target.value }))}
                    className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm w-1/2" />
                </div>
              )}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                  className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm resize-none" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200">
              <button onClick={() => setShowForm(false)} className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Annuler</button>
              <button onClick={save} disabled={!form.clientNom.trim() || !(Number(form.montant) > 0) || !form.date}
                className="px-5 py-2.5 rounded-xl bg-teal-700 text-white text-sm font-bold disabled:opacity-40 hover:bg-teal-800">
                {editing ? "Enregistrer" : "Ajouter au registre"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
