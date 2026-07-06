"use client"

import { useState, useEffect, useCallback } from "react"
import { store, type User, type Commande } from "@/lib/store"

interface Props { user: User }

type SubTab = "livraisons" | "factures"

const STATUT_ORDER = ["en_attente", "en_attente_approbation", "valide", "en_transit", "livre", "retour", "refuse"]

const STATUT_LABELS: Record<string, string> = {
  en_attente:             "En attente",
  en_attente_approbation: "Approbation",
  valide:                 "Validée",
  en_transit:             "En transit",
  livre:                  "Livrée",
  retour:                 "Retour",
  refuse:                 "Refusée",
}

const STATUT_COLORS: Record<string, string> = {
  en_attente:             "bg-slate-100 text-slate-600 border-slate-200",
  en_attente_approbation: "bg-amber-100 text-amber-700 border-amber-200",
  valide:                 "bg-blue-100 text-blue-700 border-blue-200",
  en_transit:             "bg-orange-100 text-orange-700 border-orange-200",
  livre:                  "bg-emerald-100 text-emerald-700 border-emerald-200",
  retour:                 "bg-red-100 text-red-600 border-red-200",
  refuse:                 "bg-red-100 text-red-700 border-red-200",
}

const TIMELINE_STEPS = ["en_attente", "valide", "en_transit", "livre"] as const

// Payment tracking stored in localStorage: fl_client_payments
interface ClientPayment {
  commandeId: string
  montant: number
  date: string
  note?: string
  confirmedAt: string
}

function getPayments(): ClientPayment[] {
  try { return JSON.parse(localStorage.getItem("fl_client_payments") ?? "[]") } catch { return [] }
}
function savePayments(p: ClientPayment[]) {
  localStorage.setItem("fl_client_payments", JSON.stringify(p))
}

// Reception confirmations
function getReceptions(): string[] {
  try { return JSON.parse(localStorage.getItem("fl_client_receptions") ?? "[]") } catch { return [] }
}
function saveReceptions(ids: string[]) {
  localStorage.setItem("fl_client_receptions", JSON.stringify(ids))
}

function fmt(n: number) {
  return n.toLocaleString("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function MobileClientPortail({ user }: Props) {
  const [subTab, setSubTab]         = useState<SubTab>("livraisons")
  const [commandes, setCommandes]   = useState<Commande[]>([])
  const [payments, setPayments]     = useState<ClientPayment[]>([])
  const [receptions, setReceptions] = useState<string[]>([])
  const [expanded, setExpanded]     = useState<string | null>(null)

  // Payment modal
  const [payModal, setPayModal]     = useState<Commande | null>(null)
  const [payMontant, setPayMontant] = useState("")
  const [payNote, setPayNote]       = useState("")
  const [paying, setPaying]         = useState(false)

  // Confirm reception modal
  const [recepModal, setRecepModal]         = useState<Commande | null>(null)
  const [confirmingRecep, setConfirmingRecep] = useState(false)

  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null)

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = useCallback(() => {
    const allCmds = store.getCommandes()
    // Filter by clientId if linked, else by clientNom matching user name
    const myCmds = allCmds.filter(c =>
      user.clientId
        ? c.clientId === user.clientId
        : c.clientNom?.toLowerCase() === user.name?.toLowerCase()
    )
    // Sort newest first
    myCmds.sort((a, b) => b.date.localeCompare(a.date))
    setCommandes(myCmds)
    setPayments(getPayments())
    setReceptions(getReceptions())
  }, [user.clientId, user.name])

  useEffect(() => { load() }, [load])

  // ── Timeline helper ─────────────────────────────────────────────────────────
  function TimelineBar({ statut }: { statut: string }) {
    const stepIdx = TIMELINE_STEPS.indexOf(statut as (typeof TIMELINE_STEPS)[number])
    const isRefus  = statut === "refuse" || statut === "retour"
    return (
      <div className="flex items-center gap-0 mt-3 mb-1">
        {TIMELINE_STEPS.map((step, i) => {
          const done    = stepIdx >= i && !isRefus
          const current = stepIdx === i && !isRefus
          const labels  = { en_attente: "Reçue", valide: "Validée", en_transit: "Transit", livre: "Livrée" }
          return (
            <div key={step} className="flex-1 flex flex-col items-center">
              <div className="w-full flex items-center">
                {i > 0 && <div className={`flex-1 h-0.5 ${done ? "bg-green-500" : "bg-slate-200"}`} />}
                <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 shrink-0 transition-all
                  ${current ? "border-green-600 bg-green-600 scale-110" :
                    done ? "border-green-500 bg-green-100" : "border-slate-200 bg-white"}`}>
                  {done && !current && (
                    <svg className="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {current && <span className="w-2 h-2 bg-white rounded-full" />}
                </div>
                {i < TIMELINE_STEPS.length - 1 && <div className={`flex-1 h-0.5 ${done && stepIdx > i ? "bg-green-500" : "bg-slate-200"}`} />}
              </div>
              <span className={`text-[9px] mt-1 font-semibold ${current ? "text-green-700" : done ? "text-green-600" : "text-slate-400"}`}>
                {labels[step]}
              </span>
            </div>
          )
        })}
        {isRefus && (
          <div className="ml-2 text-[10px] text-red-600 font-bold">{STATUT_LABELS[statut]}</div>
        )}
      </div>
    )
  }

  // ── Commande total ──────────────────────────────────────────────────────────
  function cmdTotal(c: Commande) {
    return c.lignes.reduce((s, l) => s + l.quantite * l.prixVente, 0)
  }

  // ── Paid amount for a commande ──────────────────────────────────────────────
  function paidFor(cmdId: string) {
    return payments
      .filter(p => p.commandeId === cmdId)
      .reduce((s, p) => s + p.montant, 0)
  }

  // ── Confirm reception ───────────────────────────────────────────────────────
  async function handleConfirmRecep() {
    if (!recepModal) return
    setConfirmingRecep(true)
    // Update commande statut to "livre"
    store.updateCommande(recepModal.id, { statut: "livre" })
    // Mark locally
    const updated = [...receptions, recepModal.id]
    saveReceptions(updated)
    setReceptions(updated)
    setRecepModal(null)
    setConfirmingRecep(false)
    load()
    showToast("Réception confirmée ✓")
  }

  // ── Declare payment ─────────────────────────────────────────────────────────
  async function handlePay() {
    if (!payModal) return
    const amount = parseFloat(payMontant.replace(",", "."))
    if (isNaN(amount) || amount <= 0) { showToast("Montant invalide", "err"); return }
    setPaying(true)
    const p: ClientPayment = {
      commandeId: payModal.id,
      montant: amount,
      date: new Date().toLocaleDateString("fr-MA"),
      note: payNote.trim() || undefined,
      confirmedAt: new Date().toISOString(),
    }
    const updated = [...payments, p]
    savePayments(updated)
    setPayments(updated)
    setPayModal(null)
    setPayMontant("")
    setPayNote("")
    setPaying(false)
    showToast(`Paiement de ${fmt(amount)} DH enregistré ✓`)
  }

  // ── Stats ───────────────────────────────────────────────────────────────────
  const totalCmds   = commandes.length
  const enCours     = commandes.filter(c => !["livre", "retour", "refuse"].includes(c.statut)).length
  const totalChiffre = commandes.filter(c => c.statut === "livre").reduce((s, c) => s + cmdTotal(c), 0)
  const totalDu     = commandes.reduce((s, c) => s + Math.max(0, cmdTotal(c) - paidFor(c.id)), 0)

  return (
    <div className="pb-6">

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {toast && (
        <div className={`fixed top-16 inset-x-4 z-50 px-4 py-3 rounded-xl text-sm font-semibold text-white shadow-lg text-center
          ${toast.type === "ok" ? "bg-emerald-600" : "bg-red-600"}`}>
          {toast.msg}
        </div>
      )}

      {/* ── KPI Strip ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2 p-3">
        {[
          { label: "Commandes", value: String(totalCmds), color: "text-blue-700 bg-blue-50 border-blue-200" },
          { label: "En cours",  value: String(enCours),   color: "text-orange-700 bg-orange-50 border-orange-200" },
          { label: "Dû",        value: `${fmt(totalDu)} DH`, color: "text-red-700 bg-red-50 border-red-200" },
        ].map(k => (
          <div key={k.label} className={`rounded-xl p-3 border ${k.color} text-center`}>
            <div className="text-lg font-black leading-tight">{k.value}</div>
            <div className="text-[10px] font-semibold opacity-80 mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      {/* ── Sub-tabs ──────────────────────────────────────────────────────── */}
      <div className="flex gap-2 px-3 mb-3">
        {(["livraisons", "factures"] as SubTab[]).map(t => (
          <button key={t} onClick={() => setSubTab(t)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all
              ${subTab === t ? "bg-green-700 text-white border-green-700 shadow" : "bg-white text-slate-600 border-slate-200"}`}>
            {t === "livraisons" ? "🚚 Mes Livraisons" : "🧾 Mes Factures"}
          </button>
        ))}
      </div>

      {/* ════════════════ LIVRAISONS ════════════════ */}
      {subTab === "livraisons" && (
        <div className="px-3 space-y-3">
          {commandes.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2" />
              </svg>
              <p className="text-sm font-semibold">Aucune commande trouvée</p>
              <p className="text-xs mt-1 opacity-70">Vos commandes apparaîtront ici</p>
            </div>
          )}

          {commandes.map(cmd => {
            const total   = cmdTotal(cmd)
            const paid    = paidFor(cmd.id)
            const du      = Math.max(0, total - paid)
            const isOpen  = expanded === cmd.id
            const confirmed = receptions.includes(cmd.id)

            return (
              <div key={cmd.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                {/* Card header */}
                <button className="w-full text-left px-4 py-3" onClick={() => setExpanded(isOpen ? null : cmd.id)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-slate-700">#{cmd.id}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUT_COLORS[cmd.statut] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
                          {STATUT_LABELS[cmd.statut] ?? cmd.statut}
                        </span>
                        {confirmed && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700 border border-green-200">
                            ✓ Reçue
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        {cmd.date} · Livraison : <strong>{cmd.heurelivraison || "—"}</strong>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-black text-slate-800">{fmt(total)} DH</div>
                      {du > 0 && <div className="text-[10px] font-bold text-red-600">Dû : {fmt(du)} DH</div>}
                      {du === 0 && total > 0 && <div className="text-[10px] font-bold text-emerald-600">Soldé ✓</div>}
                    </div>
                  </div>

                  {/* Timeline */}
                  <TimelineBar statut={cmd.statut} />
                </button>

                {/* Expanded details */}
                {isOpen && (
                  <div className="px-4 pb-4 border-t border-slate-100 pt-3">
                    {/* Articles */}
                    <div className="space-y-1.5 mb-3">
                      {cmd.lignes.map((l, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-slate-700 font-medium">{l.articleNom}</span>
                          <span className="text-slate-500">{l.quantite} × {fmt(l.prixVente)} DH</span>
                          <span className="font-bold text-slate-700">{fmt(l.quantite * l.prixVente)} DH</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between text-xs font-black text-slate-800 border-t border-dashed border-slate-200 pt-2 mb-3">
                      <span>Total TTC</span>
                      <span>{fmt(total)} DH</span>
                    </div>

                    {/* Payments summary */}
                    {payments.filter(p => p.commandeId === cmd.id).map((p, i) => (
                      <div key={i} className="flex items-center justify-between text-xs text-emerald-700 mb-1">
                        <span>💳 Paiement ({p.date})</span>
                        <span className="font-bold">{fmt(p.montant)} DH</span>
                      </div>
                    ))}

                    {/* Actions */}
                    <div className="flex gap-2 mt-3">
                      {/* Confirm reception — only when en_transit and not already confirmed */}
                      {cmd.statut === "en_transit" && !confirmed && (
                        <button
                          onClick={() => setRecepModal(cmd)}
                          className="flex-1 py-2.5 bg-green-700 hover:bg-green-800 text-white text-xs font-bold rounded-xl transition-colors shadow-sm">
                          ✅ Confirmer réception
                        </button>
                      )}

                      {/* Declare payment — when not fully paid and not refused */}
                      {du > 0 && !["refuse", "retour"].includes(cmd.statut) && (
                        <button
                          onClick={() => { setPayModal(cmd); setPayMontant(String(du)); setPayNote("") }}
                          className="flex-1 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-xl transition-colors shadow-sm">
                          💳 Déclarer paiement
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ════════════════ FACTURES ════════════════ */}
      {subTab === "factures" && (
        <div className="px-3 space-y-3">
          {commandes.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm font-semibold">Aucune facture</p>
            </div>
          )}

          {/* Summary card */}
          {commandes.length > 0 && (
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-4 text-white mb-4">
              <div className="text-xs font-semibold text-slate-400 mb-3">Résumé financier</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-lg font-black">{fmt(totalChiffre)} DH</div>
                  <div className="text-[10px] text-slate-400">CA Livré</div>
                </div>
                <div>
                  <div className={`text-lg font-black ${totalDu > 0 ? "text-red-400" : "text-green-400"}`}>{fmt(totalDu)} DH</div>
                  <div className="text-[10px] text-slate-400">Montant dû</div>
                </div>
              </div>
            </div>
          )}

          {commandes.map(cmd => {
            const total = cmdTotal(cmd)
            const paid  = paidFor(cmd.id)
            const du    = Math.max(0, total - paid)
            const pct   = total > 0 ? Math.min(100, (paid / total) * 100) : 0
            const statPay = du === 0 ? "Soldé" : paid > 0 ? "Partiel" : "Impayé"
            const statColor = du === 0
              ? "bg-emerald-100 text-emerald-700 border-emerald-200"
              : paid > 0
              ? "bg-amber-100 text-amber-700 border-amber-200"
              : "bg-red-100 text-red-700 border-red-200"

            return (
              <div key={cmd.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-xs font-black text-slate-700">Facture #{cmd.id}</div>
                      <div className="text-[11px] text-slate-500">{cmd.date}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUT_COLORS[cmd.statut] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
                        {STATUT_LABELS[cmd.statut]}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statColor}`}>
                        {statPay}
                      </span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex-1 bg-slate-100 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${pct === 100 ? "bg-emerald-500" : pct > 0 ? "bg-amber-400" : "bg-red-300"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-bold text-slate-500 w-8 text-right">{Math.round(pct)}%</span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Total : <strong className="text-slate-700">{fmt(total)} DH</strong></span>
                    <span className="text-slate-500">Payé : <strong className="text-emerald-600">{fmt(paid)} DH</strong></span>
                    {du > 0 && <span className="text-slate-500">Dû : <strong className="text-red-600">{fmt(du)} DH</strong></span>}
                  </div>

                  {/* Payment history */}
                  {payments.filter(p => p.commandeId === cmd.id).length > 0 && (
                    <div className="mt-3 border-t border-dashed border-slate-100 pt-2 space-y-1">
                      {payments.filter(p => p.commandeId === cmd.id).map((p, i) => (
                        <div key={i} className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">💳 {p.date}{p.note ? ` — ${p.note}` : ""}</span>
                          <span className="font-bold text-emerald-600">+{fmt(p.montant)} DH</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Pay button */}
                  {du > 0 && !["refuse", "retour"].includes(cmd.statut) && (
                    <button
                      onClick={() => { setPayModal(cmd); setPayMontant(String(du)); setPayNote("") }}
                      className="mt-3 w-full py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-xl transition-colors">
                      💳 Déclarer paiement ({fmt(du)} DH)
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ════ Modal : Confirmer réception ════ */}
      {recepModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-t-3xl w-full max-w-md p-6 pb-10 shadow-2xl">
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5" />
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center text-xl">✅</div>
              <div>
                <div className="font-black text-slate-800">Confirmer la réception</div>
                <div className="text-xs text-slate-500">Commande #{recepModal.id}</div>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-2">
              En confirmant, vous déclarez avoir bien reçu votre livraison du <strong>{recepModal.date}</strong>.
            </p>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-5">
              ⚠️ Cette action mettra la commande en statut <strong>Livrée</strong> et ne peut pas être annulée.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setRecepModal(null)}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm">
                Annuler
              </button>
              <button onClick={handleConfirmRecep} disabled={confirmingRecep}
                className="flex-1 py-3 rounded-xl bg-green-700 text-white font-bold text-sm disabled:opacity-60">
                {confirmingRecep ? "..." : "Confirmer réception"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════ Modal : Déclarer paiement ════ */}
      {payModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-t-3xl w-full max-w-md p-6 pb-10 shadow-2xl">
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5" />
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-xl">💳</div>
              <div>
                <div className="font-black text-slate-800">Déclarer un paiement</div>
                <div className="text-xs text-slate-500">Commande #{payModal.id}</div>
              </div>
            </div>

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Montant payé (DH)</label>
                <input
                  type="number"
                  value={payMontant}
                  onChange={e => setPayMontant(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Note (optionnel)</label>
                <input
                  type="text"
                  value={payNote}
                  onChange={e => setPayNote(e.target.value)}
                  placeholder="Ex: Virement, Espèces..."
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setPayModal(null)}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm">
                Annuler
              </button>
              <button onClick={handlePay} disabled={paying}
                className="flex-1 py-3 rounded-xl bg-blue-700 text-white font-bold text-sm disabled:opacity-60">
                {paying ? "..." : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
