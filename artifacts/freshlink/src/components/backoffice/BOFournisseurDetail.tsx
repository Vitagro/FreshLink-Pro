"use client"

import { useState, useEffect, useCallback } from "react"
import {
  store, type Fournisseur, type PurchaseOrder, type Reception, type BonAchat,
  type TypeCaisse, TYPES_CAISSE_LABELS,
  MODALITE_LABELS,
} from "@/lib/store"

// ══════════════════════════════════════════════════════════════════════════
// BOFournisseurDetail — Fiche fournisseur complète côté ERP (back-office).
// Reprend exactement les données du portail boutique via /api/portal/supplier/[id]
// (service-role, bypass RLS) : commandes (PO), réceptions, paiements & solde dû.
// Ajoute l'historique des prix d'achat (fl_articles) + l'enregistrement d'un
// règlement fournisseur dans fl_paiements via /api/sync-write.
// ══════════════════════════════════════════════════════════════════════════

interface PaiementRow {
  id: string
  montant?: number
  date?: string
  mode?: string
  note?: string
  fournisseurNom?: string
  createdAt?: string
}

interface PaHistoRow {
  date: string
  articleId: string
  articleNom: string
  prixAchat: number
  quantite?: number
  unite?: string
}

interface SupplierData {
  purchaseOrders: PurchaseOrder[]
  bonsAchat: BonAchat[]
  receptions: Reception[]
  payments: PaiementRow[]
  stats: {
    totalPOs: number
    totalReceptions: number
    totalMontant: number
    totalAchats: number
    totalPaye: number
    soldeDu: number
  }
}

type Tab = "identite" | "commandes" | "receptions" | "paiements" | "prix" | "caisses"

const PO_STATUT: Record<string, { label: string; cls: string; dot: string }> = {
  ouvert:      { label: "Ouvert",      cls: "bg-blue-50 text-blue-700 border-blue-200",   dot: "bg-blue-500" },
  envoyé:      { label: "Envoyé",      cls: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500" },
  receptionné: { label: "Réceptionné", cls: "bg-green-50 text-green-700 border-green-200", dot: "bg-green-500" },
  annulé:      { label: "Annulé",      cls: "bg-red-50 text-red-600 border-red-200",       dot: "bg-red-400" },
}

const REC_STATUT: Record<string, { label: string; cls: string }> = {
  en_attente: { label: "En attente", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  stand_by:   { label: "Stand-by",   cls: "bg-amber-50 text-amber-700 border-amber-200" },
  partielle:  { label: "Partielle",  cls: "bg-orange-50 text-orange-700 border-orange-200" },
  validée:    { label: "Validée",    cls: "bg-green-50 text-green-700 border-green-200" },
}

const PAY_MODES = ["cash", "cheque", "virement", "traite", "autre"]

const dh = (n: number) => `${(Number(n) || 0).toLocaleString("fr-MA", { maximumFractionDigits: 2 })} DH`

// Montant d'un bon d'achat — même logique que l'endpoint portail
function bonAchatMontant(b: BonAchat): number {
  const r = b as unknown as Record<string, unknown>
  const direct = Number(r.montantTTC ?? r.montantTotal ?? r.total ?? r.montant) || 0
  if (direct) return direct
  const lignes = Array.isArray(b.lignes) ? b.lignes : []
  return lignes.reduce((t: number, l) => t + (Number(l.quantite) || 0) * (Number(l.prixAchat ?? (l as unknown as Record<string, number>).prix) || 0), 0)
}

interface Props {
  fournisseur: Fournisseur
  user: { id: string; role: string }
  canEdit: boolean
  onClose: () => void
  onEdit: (f: Fournisseur) => void
}

export default function BOFournisseurDetail({ fournisseur, user, canEdit, onClose, onEdit }: Props) {
  const [tab, setTab] = useState<Tab>("identite")
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<SupplierData | null>(null)
  const [paHisto, setPaHisto] = useState<PaHistoRow[]>([])
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Payment modal
  const [payOpen, setPayOpen] = useState(false)
  const [payAmount, setPayAmount] = useState("")
  const [payDate, setPayDate] = useState(store.today())
  const [payMode, setPayMode] = useState("cash")
  const [payNote, setPayNote] = useState("")
  const [paySaving, setPaySaving] = useState(false)

  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 3500) }

  const fallbackLocal = useCallback((): SupplierData => {
    const pos = store.getPurchaseOrders().filter(o => o.fournisseurId === fournisseur.id)
    const bons = store.getBonsAchat().filter(b => b.fournisseurId === fournisseur.id)
    const bonIds = new Set(bons.map(b => b.id))
    const recs = store.getReceptions().filter(r => (r.bonAchatId && bonIds.has(r.bonAchatId)) || pos.some(o => o.id === r.purchaseOrderId))
    const totalAchats = bons.reduce((s, b) => s + bonAchatMontant(b), 0)
    return {
      purchaseOrders: pos, bonsAchat: bons, receptions: recs, payments: [],
      stats: {
        totalPOs: pos.length, totalReceptions: recs.length,
        totalMontant: pos.reduce((s, o) => s + (Number(o.total) || 0), 0),
        totalAchats, totalPaye: 0, soldeDu: Math.max(0, totalAchats),
      },
    }
  }, [fournisseur.id])

  const load = useCallback(async () => {
    setLoading(true)

    // 1. Historique PA — agrégé depuis fl_articles (historiquePrixAchat filtré par fournisseur)
    try {
      const aRes = await fetch(`/api/sync-read?table=fl_articles`, { cache: "no-store" }).then(r => r.json())
      const arts = (aRes?.data ?? []) as { id: string; payload: Record<string, unknown> }[]
      const rows: PaHistoRow[] = []
      arts.forEach(r => {
        const p = r.payload ?? {}
        const hist = Array.isArray(p.historiquePrixAchat) ? p.historiquePrixAchat : []
        hist.forEach((h: Record<string, unknown>) => {
          if (h.fournisseurId === fournisseur.id) {
            rows.push({
              date: String(h.date ?? ""),
              articleId: r.id,
              articleNom: String(p.nom ?? h.articleNom ?? "—"),
              prixAchat: Number(h.prixAchat) || 0,
              quantite: h.quantite != null ? Number(h.quantite) : undefined,
              unite: String(p.um ?? p.unite ?? ""),
            })
          }
        })
      })
      rows.sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      setPaHisto(rows)
    } catch { setPaHisto([]) }

    // 2. Dashboard fournisseur — PO / réceptions / bons d'achat / paiements / solde dû
    try {
      const res = await fetch(`/api/portal/supplier/${encodeURIComponent(fournisseur.id)}`, { cache: "no-store" })
      if (res.ok) {
        const d = await res.json()
        setData({
          purchaseOrders: (d.purchaseOrders ?? []) as PurchaseOrder[],
          bonsAchat: (d.bonsAchat ?? []) as BonAchat[],
          receptions: (d.receptions ?? []) as Reception[],
          payments: (d.payments ?? []) as PaiementRow[],
          stats: d.stats ?? fallbackLocal().stats,
        })
      } else {
        setData(fallbackLocal())
      }
    } catch {
      setData(fallbackLocal())
    }
    setLoading(false)
  }, [fournisseur.id, fallbackLocal])

  useEffect(() => { load() }, [load])

  // Se remet à jour si une commande supprimée ailleurs fait réduire/annuler
  // un PO de ce fournisseur (cf. cascadePOAfterCommandeDelete).
  useEffect(() => {
    const WATCHED = new Set(["fl_purchase_orders", "fl_commandes"])
    const handler = (e: Event) => {
      if (WATCHED.has((e as CustomEvent).detail as string)) load()
    }
    window.addEventListener("fl_store_updated", handler)
    return () => window.removeEventListener("fl_store_updated", handler)
  }, [load])

  // Enregistrer un règlement fournisseur → fl_paiements (service-role {id, payload})
  const submitPayment = async () => {
    const montant = parseFloat(payAmount) || 0
    if (montant <= 0) { flash(false, "Montant invalide."); return }
    setPaySaving(true)
    const id = store.genId("PF")
    const payload = {
      fournisseurId: fournisseur.id,
      fournisseurNom: fournisseur.nom,
      montant,
      date: payDate,
      mode: payMode,
      note: payNote,
      type: "fournisseur",
      operateurId: user.id,
      createdAt: new Date().toISOString(),
    }
    try {
      const r = await fetch("/api/sync-write", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: "fl_paiements", upserts: [{ id, payload, updated_at: new Date().toISOString() }] }),
      }).then(res => res.json())
      if (!r.ok) throw new Error(r.errors?.join(", ") || "sync-write")
      setPayOpen(false); setPayAmount(""); setPayNote("")
      flash(true, `Règlement de ${dh(montant)} enregistré.`)
      await load()
    } catch (e) {
      flash(false, `Erreur : ${e instanceof Error ? e.message : "enregistrement impossible"}`)
    }
    setPaySaving(false)
  }

  const stats = data?.stats
  const f = fournisseur

  // Caisses fournisseur — solde net par type = reçues - données, sur tous les
  // achats de ce fournisseur (positif = le fournisseur nous doit des caisses).
  const caisseRows = (data?.purchaseOrders ?? []).flatMap(po => po.caissesFournisseur ?? [])
  const caisseBalance = caisseRows.reduce((acc, c) => {
    const delta = c.sens === "recue" ? c.quantite : -c.quantite
    acc[c.type] = (acc[c.type] ?? 0) + delta
    return acc
  }, {} as Record<TypeCaisse, number>)
  const caisseTypesPresents = (Object.keys(caisseBalance) as TypeCaisse[])

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: "identite",   label: "Identité & conditions" },
    { id: "commandes",  label: "Commandes (PO)", badge: data?.purchaseOrders.length },
    { id: "receptions", label: "Réceptions",     badge: data?.receptions.length },
    { id: "paiements",  label: "Paiements & solde" },
    { id: "prix",       label: "Historique PA",  badge: paHisto.length },
    { id: "caisses",    label: "Caisses",        badge: caisseRows.length },
  ]

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-card rounded-2xl border border-border w-full max-w-4xl my-6 flex flex-col shadow-xl">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-foreground text-lg truncate">{f.nom}</h2>
              <p className="text-xs text-muted-foreground truncate">
                {f.contact}{f.ville ? ` — ${f.ville}` : ""}{f.region ? `, ${f.region}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canEdit && (
              <button onClick={() => onEdit(f)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-muted transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                Modifier
              </button>
            )}
            <button onClick={onClose} className="p-2 hover:bg-muted rounded-xl transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Solde dû KPI bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-5 pb-3">
          {[
            { label: "Total achats",  value: dh(stats?.totalAchats ?? 0), cls: "text-foreground" },
            { label: "Total payé",    value: dh(stats?.totalPaye ?? 0),   cls: "text-green-700" },
            { label: "Solde dû",      value: dh(stats?.soldeDu ?? 0),     cls: (stats?.soldeDu ?? 0) > 0 ? "text-red-600" : "text-green-700" },
            { label: "Commandes (PO)", value: String(stats?.totalPOs ?? 0), cls: "text-foreground" },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-border bg-card px-3 py-2.5">
              <p className={`text-lg font-black ${s.cls}`}>{loading ? "…" : s.value}</p>
              <p className="text-[11px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Flash */}
        {msg && (
          <div className={`mx-5 mb-1 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm border ${msg.ok ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={msg.ok ? "M5 13l4 4L19 7" : "M6 18L18 6M6 6l12 12"} />
            </svg>
            {msg.text}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 px-5 py-3 border-b border-border bg-muted/30 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${tab === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {t.label}
              {t.badge != null && t.badge > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">{t.badge}</span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-4 overflow-y-auto" style={{ maxHeight: "55vh" }}>

          {/* ── IDENTITÉ & CONDITIONS ─────────────────────────────────────────── */}
          {tab === "identite" && (
            <div className="flex flex-col gap-5">
              <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { l: "Raison sociale", v: f.nom },
                  { l: "Contact", v: f.contact },
                  { l: "Téléphone", v: f.telephone },
                  { l: "Email", v: f.email },
                  { l: "Adresse", v: f.adresse },
                  { l: "Ville / Région", v: [f.ville, f.region].filter(Boolean).join(", ") },
                ].map(({ l, v }) => (
                  <div key={l} className="flex flex-col gap-0.5">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{l}</span>
                    <span className="text-sm text-foreground">{v || "—"}</span>
                  </div>
                ))}
              </section>

              <section className="rounded-xl border border-border bg-muted/20 p-4 flex flex-col gap-3">
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wide">Conditions commerciales</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] text-muted-foreground">Modalité paiement</span>
                    <span className="font-semibold text-foreground">{f.modalitePaiement ? MODALITE_LABELS[f.modalitePaiement] : "—"}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] text-muted-foreground">Délai paiement</span>
                    <span className="font-semibold text-foreground">{f.delaiPaiement ? `${f.delaiPaiement} j` : "Comptant"}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] text-muted-foreground">Plafond crédit</span>
                    <span className="font-semibold text-foreground">{f.plafondCredit ? dh(f.plafondCredit) : "—"}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] text-muted-foreground">ICE</span>
                    <span className="font-mono text-foreground">{f.ice || "—"}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] text-muted-foreground">RC</span>
                    <span className="font-mono text-foreground">{f.rc || "—"}</span>
                  </div>
                </div>
              </section>

              {f.specialites && f.specialites.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-wide">Spécialités</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {f.specialites.map(s => (
                      <span key={s} className="text-[11px] px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-200 font-medium">{s}</span>
                    ))}
                  </div>
                </section>
              )}

              {f.itineraires && f.itineraires.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-wide">Itinéraires d&apos;approvisionnement</h3>
                  <div className="flex flex-col gap-1.5">
                    {f.itineraires.map((pt, i) => (
                      <div key={i} className="flex items-center gap-3 text-xs px-3 py-2 rounded-lg bg-blue-50 border border-blue-100">
                        <span className="font-semibold text-foreground">{pt.nom || `Point ${i + 1}`}</span>
                        {pt.jour && <span className="text-blue-700">{pt.jour}</span>}
                        {(pt.heureDepart || pt.heureArrivee) && (
                          <span className="text-muted-foreground ml-auto">{pt.heureDepart || "?"} → {pt.heureArrivee || "?"}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {f.notes && (
                <section className="flex flex-col gap-1">
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-wide">Notes internes</h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{f.notes}</p>
                </section>
              )}
            </div>
          )}

          {/* ── COMMANDES (PO) ────────────────────────────────────────────────── */}
          {tab === "commandes" && (
            <div className="flex flex-col gap-2">
              {loading ? (
                <p className="text-sm text-muted-foreground text-center py-8">Chargement…</p>
              ) : (data?.purchaseOrders.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Aucune commande pour ce fournisseur.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] text-muted-foreground uppercase tracking-wide border-b border-border">
                        <th className="text-left py-2 pr-3 font-semibold">Date</th>
                        <th className="text-left py-2 pr-3 font-semibold">Article</th>
                        <th className="text-right py-2 pr-3 font-semibold">Qté</th>
                        <th className="text-right py-2 pr-3 font-semibold">PU</th>
                        <th className="text-right py-2 pr-3 font-semibold">Total</th>
                        <th className="text-left py-2 font-semibold">Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data!.purchaseOrders.map(po => {
                        const cfg = PO_STATUT[po.statut] ?? PO_STATUT.ouvert
                        return (
                          <tr key={po.id} className="border-b border-border/60">
                            <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">{po.date}</td>
                            <td className="py-2 pr-3 font-medium text-foreground">{po.articleNom}</td>
                            <td className="py-2 pr-3 text-right">{po.quantite} {po.articleUnite}</td>
                            <td className="py-2 pr-3 text-right">{dh(po.prixUnitaire)}</td>
                            <td className="py-2 pr-3 text-right font-semibold">{dh(po.total)}</td>
                            <td className="py-2">
                              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.cls}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.label}
                              </span>
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

          {/* ── RÉCEPTIONS ────────────────────────────────────────────────────── */}
          {tab === "receptions" && (
            <div className="flex flex-col gap-3">
              {loading ? (
                <p className="text-sm text-muted-foreground text-center py-8">Chargement…</p>
              ) : (data?.receptions.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Aucune réception enregistrée.</p>
              ) : data!.receptions.map(rec => {
                const cfg = REC_STATUT[rec.statut] ?? REC_STATUT.en_attente
                const totalRecu = rec.lignes.reduce((s, l) => s + (Number(l.quantiteRecue) || 0), 0)
                return (
                  <div key={rec.id} className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="flex items-center justify-between gap-3 px-4 py-3 bg-muted/30 border-b border-border">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-xs text-muted-foreground">{rec.id.slice(0, 12)}</span>
                        <span className="text-xs text-foreground">{rec.date}</span>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${cfg.cls}`}>{cfg.label}</span>
                    </div>
                    <div className="px-4 py-2 flex flex-col gap-1">
                      {rec.lignes.map((l, i) => {
                        const ecart = (Number(l.quantiteRecue) || 0) - (Number(l.quantiteFacturee ?? l.quantiteCommandee) || 0)
                        return (
                          <div key={i} className="flex items-center justify-between gap-3 text-xs py-1 border-b border-border/40 last:border-0">
                            <span className="font-medium text-foreground truncate">{l.articleNom}</span>
                            <div className="flex items-center gap-3 shrink-0 text-muted-foreground">
                              <span>Cmd: <strong className="text-foreground">{l.quantiteCommandee}</strong></span>
                              <span>Reçu: <strong className="text-foreground">{l.quantiteRecue}</strong></span>
                              {ecart !== 0 && (
                                <span className={ecart > 0 ? "text-green-600" : "text-red-600"}>
                                  {ecart > 0 ? "+" : ""}{ecart}
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                      <div className="flex justify-end text-[11px] text-muted-foreground pt-1">
                        Total reçu : <strong className="text-foreground ml-1">{totalRecu}</strong>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── PAIEMENTS & SOLDE ─────────────────────────────────────────────── */}
          {tab === "paiements" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">Solde dû :</span>
                  <span className={`text-2xl font-black ${(stats?.soldeDu ?? 0) > 0 ? "text-red-600" : "text-green-700"}`}>{dh(stats?.soldeDu ?? 0)}</span>
                </div>
                {canEdit && (
                  <button onClick={() => { setPayOpen(true); setPayAmount(String((stats?.soldeDu ?? 0) || "")); setPayMode(f.modalitePaiement?.startsWith("cheque") ? "cheque" : "cash"); setPayNote("") }}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
                    style={{ background: "oklch(0.38 0.2 260)" }}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    Enregistrer un règlement
                  </button>
                )}
              </div>

              {loading ? (
                <p className="text-sm text-muted-foreground text-center py-8">Chargement…</p>
              ) : (data?.payments.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Aucun règlement enregistré pour ce fournisseur.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {data!.payments.map(p => (
                    <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-border bg-card">
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-bold text-green-700">{dh(p.montant ?? 0)}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {p.date || (p.createdAt ?? "").slice(0, 10)}{p.mode ? ` · ${p.mode}` : ""}{p.note ? ` · ${p.note}` : ""}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground shrink-0">{p.id.slice(0, 14)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── HISTORIQUE PA ─────────────────────────────────────────────────── */}
          {tab === "prix" && (
            <div className="flex flex-col gap-2">
              {loading ? (
                <p className="text-sm text-muted-foreground text-center py-8">Chargement…</p>
              ) : paHisto.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Aucun historique de prix d&apos;achat pour ce fournisseur.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] text-muted-foreground uppercase tracking-wide border-b border-border">
                        <th className="text-left py-2 pr-3 font-semibold">Date</th>
                        <th className="text-left py-2 pr-3 font-semibold">Article</th>
                        <th className="text-right py-2 pr-3 font-semibold">Prix d&apos;achat</th>
                        <th className="text-right py-2 font-semibold">Quantité</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paHisto.map((h, i) => (
                        <tr key={`${h.articleId}-${i}`} className="border-b border-border/60">
                          <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">{h.date || "—"}</td>
                          <td className="py-2 pr-3 font-medium text-foreground">{h.articleNom}</td>
                          <td className="py-2 pr-3 text-right font-semibold">{dh(h.prixAchat)}{h.unite ? `/${h.unite}` : ""}</td>
                          <td className="py-2 text-right text-muted-foreground">{h.quantite != null ? `${h.quantite}${h.unite ? ` ${h.unite}` : ""}` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === "caisses" && (
            <div className="flex flex-col gap-4">
              {loading ? (
                <p className="text-sm text-muted-foreground text-center py-8">Chargement…</p>
              ) : caisseRows.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Aucune caisse échangée notée pour ce fournisseur.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {caisseTypesPresents.map(t => {
                      const solde = caisseBalance[t]
                      return (
                        <div key={t} className="rounded-xl border border-border bg-card px-3 py-2.5">
                          <p className={`text-lg font-black ${solde > 0 ? "text-amber-600" : solde < 0 ? "text-red-600" : "text-green-700"}`}>
                            {solde > 0 ? `+${solde}` : solde}
                          </p>
                          <p className="text-[11px] text-muted-foreground">{TYPES_CAISSE_LABELS[t]} — solde</p>
                        </div>
                      )
                    })}
                  </div>
                  <p className="text-[11px] text-muted-foreground -mt-2">
                    Solde positif = le fournisseur nous doit des caisses. Négatif = nous lui devons des caisses.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[11px] text-muted-foreground uppercase tracking-wide border-b border-border">
                          <th className="text-left py-2 pr-3 font-semibold">Achat (PO)</th>
                          <th className="text-left py-2 pr-3 font-semibold">Date</th>
                          <th className="text-left py-2 pr-3 font-semibold">Type</th>
                          <th className="text-left py-2 pr-3 font-semibold">Sens</th>
                          <th className="text-right py-2 font-semibold">Quantité</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data?.purchaseOrders ?? []).flatMap(po =>
                          (po.caissesFournisseur ?? []).map((c, i) => (
                            <tr key={`${po.id}-${i}`} className="border-b border-border/60">
                              <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{po.id}</td>
                              <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">{po.date || "—"}</td>
                              <td className="py-2 pr-3 font-medium text-foreground">{TYPES_CAISSE_LABELS[c.type]}</td>
                              <td className="py-2 pr-3">{c.sens === "recue" ? "Reçue" : "Donnée"}</td>
                              <td className="py-2 text-right font-semibold">{c.quantite}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Payment modal ───────────────────────────────────────────────────── */}
      {payOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-card rounded-2xl border border-border shadow-2xl p-6 flex flex-col gap-4">
            <h3 className="font-bold text-foreground text-base">Règlement fournisseur — {f.nom}</h3>
            <div className="rounded-xl bg-muted/40 p-3 text-sm flex items-center justify-between">
              <span className="text-muted-foreground">Solde dû actuel</span>
              <strong className={`${(stats?.soldeDu ?? 0) > 0 ? "text-red-600" : "text-green-700"}`}>{dh(stats?.soldeDu ?? 0)}</strong>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-foreground">Montant (DH) *</label>
                <input type="number" min={0} step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                  className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-foreground">Date</label>
                <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)}
                  className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-foreground">Mode de paiement</label>
              <select value={payMode} onChange={e => setPayMode(e.target.value)}
                className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                {PAY_MODES.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-foreground">Note / référence</label>
              <textarea rows={2} value={payNote} onChange={e => setPayNote(e.target.value)}
                placeholder="N° chèque, virement, bon d'achat réglé…"
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setPayOpen(false)} disabled={paySaving}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-colors disabled:opacity-50">
                Annuler
              </button>
              <button onClick={submitPayment} disabled={paySaving}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: "oklch(0.38 0.2 260)" }}>
                {paySaving ? "Enregistrement…" : "Confirmer le règlement"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
