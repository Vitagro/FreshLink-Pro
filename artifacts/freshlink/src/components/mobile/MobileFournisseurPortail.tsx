"use client"

import { useState, useEffect, useCallback } from "react"
import { store, type User, type PurchaseOrder } from "@/lib/store"

interface Props { user: User }

type SubTab = "paiements" | "demandes"

function fmt(n: number) {
  return n.toLocaleString("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const PAIEMENT_LABELS: Record<string, string> = {
  impaye:  "Impayé",
  partiel: "Partiel",
  solde:   "Soldé",
}
const PAIEMENT_COLORS: Record<string, string> = {
  impaye:  "bg-red-100 text-red-700 border-red-200",
  partiel: "bg-amber-100 text-amber-700 border-amber-200",
  solde:   "bg-emerald-100 text-emerald-700 border-emerald-200",
}

const STATUT_PO_LABELS: Record<string, string> = {
  ouvert:       "En attente",
  "envoyé":     "Envoyée",
  "receptionné":"Reçue",
  "annulé":     "Annulée",
}
const STATUT_PO_COLORS: Record<string, string> = {
  ouvert:       "bg-amber-100 text-amber-700 border-amber-200",
  "envoyé":     "bg-blue-100 text-blue-700 border-blue-200",
  "receptionné":"bg-emerald-100 text-emerald-700 border-emerald-200",
  "annulé":     "bg-slate-100 text-slate-500 border-slate-200",
}

// Dispo confirmations stored locally: fl_fournisseur_dispos
interface DispoConfirm {
  poId: string
  confirmedAt: string
  note?: string
  dispoQty?: number
}
function getDispos(): DispoConfirm[] {
  try { return JSON.parse(localStorage.getItem("fl_fournisseur_dispos") ?? "[]") } catch { return [] }
}
function saveDispos(d: DispoConfirm[]) {
  localStorage.setItem("fl_fournisseur_dispos", JSON.stringify(d))
}

// Payment confirmations from fournisseur side
interface FourPayConfirm {
  poId: string
  montant: number
  date: string
  note?: string
  confirmedAt: string
}
function getFourPays(): FourPayConfirm[] {
  try { return JSON.parse(localStorage.getItem("fl_fournisseur_payments") ?? "[]") } catch { return [] }
}
function saveFourPays(p: FourPayConfirm[]) {
  localStorage.setItem("fl_fournisseur_payments", JSON.stringify(p))
}

export default function MobileFournisseurPortail({ user }: Props) {
  const [subTab, setSubTab]   = useState<SubTab>("paiements")
  const [orders, setOrders]   = useState<PurchaseOrder[]>([])
  const [dispos, setDispos]   = useState<DispoConfirm[]>([])
  const [pays, setPays]       = useState<FourPayConfirm[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)

  // Dispo modal
  const [dispoModal, setDispoModal]   = useState<PurchaseOrder | null>(null)
  const [dispoQty, setDispoQty]       = useState("")
  const [dispoNote, setDispoNote]     = useState("")
  const [confirming, setConfirming]   = useState(false)

  // Pay confirm modal
  const [payModal, setPayModal]       = useState<PurchaseOrder | null>(null)
  const [payMontant, setPayMontant]   = useState("")
  const [payNote, setPayNote]         = useState("")
  const [paying, setPaying]           = useState(false)

  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null)

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = useCallback(() => {
    const allOrders = store.getPurchaseOrders()
    // Filter by fournisseurId if linked, else by fournisseurNom matching user name
    const myOrders = allOrders.filter(po =>
      user.fournisseurId
        ? po.fournisseurId === user.fournisseurId
        : po.fournisseurNom?.toLowerCase() === user.name?.toLowerCase()
    )
    myOrders.sort((a, b) => b.date.localeCompare(a.date))
    setOrders(myOrders)
    setDispos(getDispos())
    setPays(getFourPays())
  }, [user.fournisseurId, user.name])

  useEffect(() => { load() }, [load])

  // ── Confirm dispo ─────────────────────────────────────────────────────────
  async function handleConfirmDispo() {
    if (!dispoModal) return
    const qty = parseInt(dispoQty)
    if (isNaN(qty) || qty < 0) { showToast("Quantité invalide", "err"); return }
    setConfirming(true)
    const d: DispoConfirm = {
      poId: dispoModal.id,
      confirmedAt: new Date().toISOString(),
      note: dispoNote.trim() || undefined,
      dispoQty: qty,
    }
    const updated = [...dispos.filter(x => x.poId !== dispoModal.id), d]
    saveDispos(updated)
    setDispos(updated)
    // Update PO statut to "envoyé" (meaning fournisseur confirmed availability)
    store.updatePurchaseOrder(dispoModal.id, { statut: "envoyé", notes: dispoModal.notes ? `${dispoModal.notes} | Dispo confirmée: ${qty} u.` : `Dispo confirmée: ${qty} u.` })
    setDispoModal(null)
    setDispoQty("")
    setDispoNote("")
    setConfirming(false)
    load()
    showToast(`Disponibilité confirmée (${qty} unités) ✓`)
  }

  // ── Confirm payment receipt ───────────────────────────────────────────────
  async function handleConfirmPay() {
    if (!payModal) return
    const amount = parseFloat(payMontant.replace(",", "."))
    if (isNaN(amount) || amount <= 0) { showToast("Montant invalide", "err"); return }
    setPaying(true)
    const p: FourPayConfirm = {
      poId: payModal.id,
      montant: amount,
      date: new Date().toLocaleDateString("fr-MA"),
      note: payNote.trim() || undefined,
      confirmedAt: new Date().toISOString(),
    }
    const updated = [...pays, p]
    saveFourPays(updated)
    setPays(updated)

    // Update PO payment status
    const totalPaid = updated.filter(x => x.poId === payModal.id).reduce((s, x) => s + x.montant, 0)
    const newStatut: "impaye" | "partiel" | "solde" =
      totalPaid >= payModal.total ? "solde" :
      totalPaid > 0 ? "partiel" : "impaye"
    store.updatePurchaseOrder(payModal.id, {
      montantPaye: totalPaid,
      statutPaiement: newStatut,
      datePaiement: new Date().toLocaleDateString("fr-MA"),
    })

    setPayModal(null)
    setPayMontant("")
    setPayNote("")
    setPaying(false)
    load()
    showToast(`Paiement de ${fmt(amount)} DH confirmé ✓`)
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const totalOrders   = orders.length
  const openOrders    = orders.filter(o => o.statut === "ouvert").length
  const totalImpaye   = orders.filter(o => (o.statutPaiement ?? "impaye") === "impaye" && o.statut !== "annulé")
    .reduce((s, o) => s + (o.total ?? 0), 0)
  const totalDu       = orders.reduce((s, o) => s + Math.max(0, (o.total ?? 0) - (o.montantPaye ?? 0)), 0)

  function paidForPO(poId: string) {
    return pays.filter(p => p.poId === poId).reduce((s, p) => s + p.montant, 0)
  }

  const demandes = orders.filter(o => o.statut === "ouvert" || o.statut === "envoyé")

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
          { label: "Commandes",  value: String(totalOrders), color: "text-blue-700 bg-blue-50 border-blue-200" },
          { label: "En attente", value: String(openOrders),  color: "text-amber-700 bg-amber-50 border-amber-200" },
          { label: "Non payé",   value: `${fmt(totalDu)} DH`, color: "text-red-700 bg-red-50 border-red-200" },
        ].map(k => (
          <div key={k.label} className={`rounded-xl p-3 border ${k.color} text-center`}>
            <div className="text-base font-black leading-tight">{k.value}</div>
            <div className="text-[10px] font-semibold opacity-80 mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      {/* ── Sub-tabs ──────────────────────────────────────────────────────── */}
      <div className="flex gap-2 px-3 mb-3">
        {(["paiements", "demandes"] as SubTab[]).map(t => (
          <button key={t} onClick={() => setSubTab(t)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all
              ${subTab === t ? "bg-green-700 text-white border-green-700 shadow" : "bg-white text-slate-600 border-slate-200"}`}>
            {t === "paiements"
              ? `💰 Paiements${totalDu > 0 ? ` (${fmt(totalDu)} DH)` : ""}`
              : `📦 Demandes${openOrders > 0 ? ` (${openOrders})` : ""}`}
          </button>
        ))}
      </div>

      {/* ════════════════ PAIEMENTS ════════════════ */}
      {subTab === "paiements" && (
        <div className="px-3 space-y-3">
          {orders.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-semibold">Aucune commande</p>
            </div>
          )}

          {/* Summary card */}
          {orders.length > 0 && (
            <div className="bg-gradient-to-br from-green-900 to-green-800 rounded-2xl p-4 text-white mb-2">
              <div className="text-xs font-semibold text-green-300 mb-3">Bilan paiements</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-xl font-black">{orders.filter(o => (o.statutPaiement ?? "impaye") === "solde").length}</div>
                  <div className="text-[10px] text-green-300">Soldés</div>
                </div>
                <div>
                  <div className="text-xl font-black text-amber-300">{orders.filter(o => o.statutPaiement === "partiel").length}</div>
                  <div className="text-[10px] text-green-300">Partiels</div>
                </div>
                <div>
                  <div className="text-xl font-black text-red-300">{orders.filter(o => !o.statutPaiement || o.statutPaiement === "impaye").length}</div>
                  <div className="text-[10px] text-green-300">Impayés</div>
                </div>
              </div>
              <div className="mt-3 border-t border-green-700 pt-3 text-center">
                <div className="text-lg font-black text-red-300">{fmt(totalDu)} DH</div>
                <div className="text-[10px] text-green-300">Total à recevoir</div>
              </div>
            </div>
          )}

          {orders.filter(o => o.statut !== "annulé").map(po => {
            const statPay    = po.statutPaiement ?? "impaye"
            const isOpen     = expanded === po.id
            const localPaid  = paidForPO(po.id)
            const totalPaid  = (po.montantPaye ?? 0) + localPaid
            const du         = Math.max(0, (po.total ?? 0) - totalPaid)
            const pct        = po.total > 0 ? Math.min(100, (totalPaid / po.total) * 100) : 0

            return (
              <div key={po.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <button className="w-full text-left px-4 py-3" onClick={() => setExpanded(isOpen ? null : po.id)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-slate-700">{po.articleNom}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${PAIEMENT_COLORS[statPay]}`}>
                          {PAIEMENT_LABELS[statPay]}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {po.date} · {po.quantite} {po.articleUnite}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-black text-slate-800">{fmt(po.total ?? 0)} DH</div>
                      {du > 0 && <div className="text-[10px] font-bold text-red-600">Dû : {fmt(du)} DH</div>}
                    </div>
                  </div>

                  {/* Payment bar */}
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${pct === 100 ? "bg-emerald-500" : pct > 0 ? "bg-amber-400" : "bg-red-300"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-slate-400 w-8 text-right">{Math.round(pct)}%</span>
                  </div>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 border-t border-slate-100 pt-3">
                    <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                      <div className="bg-slate-50 rounded-lg px-3 py-2">
                        <div className="text-[10px] text-slate-400 font-semibold">Total commande</div>
                        <div className="font-black text-slate-700">{fmt(po.total ?? 0)} DH</div>
                      </div>
                      <div className="bg-emerald-50 rounded-lg px-3 py-2">
                        <div className="text-[10px] text-emerald-600 font-semibold">Payé</div>
                        <div className="font-black text-emerald-700">{fmt(totalPaid)} DH</div>
                      </div>
                    </div>

                    {/* Payment history */}
                    {pays.filter(p => p.poId === po.id).map((p, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                        <span>💳 {p.date}{p.note ? ` — ${p.note}` : ""}</span>
                        <span className="font-bold text-emerald-600">+{fmt(p.montant)} DH</span>
                      </div>
                    ))}

                    {/* Confirm payment button */}
                    {du > 0 && (
                      <button
                        onClick={() => { setPayModal(po); setPayMontant(String(du.toFixed(2))); setPayNote("") }}
                        className="mt-2 w-full py-2.5 bg-green-700 hover:bg-green-800 text-white text-xs font-bold rounded-xl transition-colors">
                        ✅ Confirmer réception paiement ({fmt(du)} DH)
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ════════════════ DEMANDES ════════════════ */}
      {subTab === "demandes" && (
        <div className="px-3 space-y-3">
          <div className="text-xs text-slate-500 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-start gap-2">
            <span className="text-base">📦</span>
            <span>Les demandes d'approvisionnement envoyées par l'équipe apparaissent ici. Confirmez la disponibilité pour chaque article.</span>
          </div>

          {demandes.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              <p className="text-sm font-semibold">Aucune demande en attente</p>
              <p className="text-xs mt-1 opacity-70">Toutes les demandes ont été traitées</p>
            </div>
          )}

          {demandes.map(po => {
            const dispo     = dispos.find(d => d.poId === po.id)
            const confirmed = !!dispo
            const isOpen    = expanded === `d_${po.id}`

            return (
              <div key={po.id} className={`bg-white rounded-2xl border overflow-hidden shadow-sm
                ${po.statut === "ouvert" && !confirmed ? "border-amber-300" : "border-slate-200"}`}>
                <button className="w-full text-left px-4 py-3" onClick={() => setExpanded(isOpen ? null : `d_${po.id}`)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-slate-700">{po.articleNom}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUT_PO_COLORS[po.statut] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
                          {STATUT_PO_LABELS[po.statut] ?? po.statut}
                        </span>
                        {confirmed && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700 border border-green-200">
                            ✓ Confirmé
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {po.date} · Qté demandée : <strong>{po.quantite} {po.articleUnite}</strong>
                      </div>
                      {po.notes && (
                        <div className="text-[11px] text-slate-400 italic mt-0.5 truncate">{po.notes}</div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-black text-slate-800">{fmt(po.total ?? 0)} DH</div>
                      <div className="text-[10px] text-slate-400">{po.prixUnitaire} DH/{po.articleUnite}</div>
                    </div>
                  </div>

                  {/* Dispo confirmation info */}
                  {confirmed && dispo && (
                    <div className="mt-2 px-3 py-1.5 bg-green-50 rounded-lg text-[11px] text-green-700 font-medium">
                      ✅ Disponibilité confirmée : {dispo.dispoQty} {po.articleUnite}
                      {dispo.note && <span className="text-green-600"> — {dispo.note}</span>}
                    </div>
                  )}
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 border-t border-slate-100 pt-3">
                    {/* Order detail */}
                    <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                      <div className="bg-slate-50 rounded-lg px-3 py-2">
                        <div className="text-[10px] text-slate-400 font-semibold">Qté commandée</div>
                        <div className="font-black text-slate-700">{po.quantite} {po.articleUnite}</div>
                      </div>
                      <div className="bg-slate-50 rounded-lg px-3 py-2">
                        <div className="text-[10px] text-slate-400 font-semibold">Prix unitaire</div>
                        <div className="font-black text-slate-700">{fmt(po.prixUnitaire)} DH</div>
                      </div>
                      {po.commandeQty != null && (
                        <div className="bg-blue-50 rounded-lg px-3 py-2">
                          <div className="text-[10px] text-blue-500 font-semibold">Cdes clients</div>
                          <div className="font-black text-blue-700">{po.commandeQty} {po.articleUnite}</div>
                        </div>
                      )}
                      {po.stockQty != null && (
                        <div className="bg-purple-50 rounded-lg px-3 py-2">
                          <div className="text-[10px] text-purple-500 font-semibold">Stock actuel</div>
                          <div className="font-black text-purple-700">{po.stockQty} {po.articleUnite}</div>
                        </div>
                      )}
                    </div>

                    {/* Action : confirm dispo */}
                    {!confirmed && po.statut === "ouvert" && (
                      <button
                        onClick={() => { setDispoModal(po); setDispoQty(String(po.quantite)); setDispoNote("") }}
                        className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm">
                        📦 Valider la disponibilité
                      </button>
                    )}

                    {confirmed && (
                      <div className="py-3 text-center text-sm text-green-700 font-bold bg-green-50 rounded-xl">
                        ✅ Disponibilité confirmée
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ════ Modal : Valider disponibilité ════ */}
      {dispoModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-t-3xl w-full max-w-md p-6 pb-10 shadow-2xl">
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5" />
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-xl">📦</div>
              <div>
                <div className="font-black text-slate-800">Valider la disponibilité</div>
                <div className="text-xs text-slate-500">{dispoModal.articleNom}</div>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Confirmez la quantité disponible que vous pouvez livrer pour cette commande.
            </p>

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Quantité disponible ({dispoModal.articleUnite})
                </label>
                <input
                  type="number"
                  value={dispoQty}
                  onChange={e => setDispoQty(e.target.value)}
                  placeholder={`Max: ${dispoModal.quantite}`}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <div className="text-[11px] text-slate-400 mt-1">Commandé : {dispoModal.quantite} {dispoModal.articleUnite}</div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Note (optionnel)</label>
                <input
                  type="text"
                  value={dispoNote}
                  onChange={e => setDispoNote(e.target.value)}
                  placeholder="Ex: Disponible dès demain matin..."
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setDispoModal(null)}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm">
                Annuler
              </button>
              <button onClick={handleConfirmDispo} disabled={confirming}
                className="flex-1 py-3 rounded-xl bg-amber-600 text-white font-bold text-sm disabled:opacity-60">
                {confirming ? "..." : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════ Modal : Confirmer paiement reçu ════ */}
      {payModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-t-3xl w-full max-w-md p-6 pb-10 shadow-2xl">
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5" />
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center text-xl">✅</div>
              <div>
                <div className="font-black text-slate-800">Confirmer paiement reçu</div>
                <div className="text-xs text-slate-500">{payModal.articleNom} — {payModal.date}</div>
              </div>
            </div>

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Montant reçu (DH)</label>
                <input
                  type="number"
                  value={payMontant}
                  onChange={e => setPayMontant(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Mode de paiement</label>
                <input
                  type="text"
                  value={payNote}
                  onChange={e => setPayNote(e.target.value)}
                  placeholder="Ex: Virement, Chèque, Espèces..."
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setPayModal(null)}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm">
                Annuler
              </button>
              <button onClick={handleConfirmPay} disabled={paying}
                className="flex-1 py-3 rounded-xl bg-green-700 text-white font-bold text-sm disabled:opacity-60">
                {paying ? "..." : "Confirmer réception"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
