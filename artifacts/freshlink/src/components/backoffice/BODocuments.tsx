"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { store, isClientVisible, type CompanyConfig, type Client } from "@/lib/store"
import ComboBox, { type ComboItem } from "@/components/ui/ComboBox"

// ──────────────────────────────────────────────────────────────
// TYPES
// ──────────────────────────────────────────────────────────────

type DocType = "devis" | "contrat" | "bl_archive" | "facture"
type DocStatut = "brouillon" | "envoye" | "accepte" | "refuse" | "transforme" | "expire" | "annule"

interface LigneDocument {
  designation: string
  qte: number
  unite: string
  prix_u: number
  montant: number
}

interface Document {
  id: string
  numero: string
  type_doc: DocType
  client_id?: string
  client_nom: string
  lignes: LigneDocument[]
  montant_ht: number
  tva_pct: number
  montant_tva: number
  montant_ttc: number
  remise_pct: number
  montant_net: number
  date_doc: string
  date_validite?: string
  date_debut?: string
  date_fin?: string
  conditions_paiement?: string
  delai_livraison?: string
  frequence_livraison?: string
  clauses_specifiques?: string
  statut: DocStatut
  transforme_en?: string
  signe_client?: boolean
  date_signature?: string
  notes?: string
  created_by?: string
  created_at: string
}

interface ClientRecord {
  id: string
  nom: string
  type?: string
  telephone?: string
  email?: string
  adresse?: string
  ville?: string
}

const DH = (n: number) =>
  `${n.toLocaleString("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`

const TYPE_LABELS: Record<DocType, string> = {
  devis: "Devis",
  contrat: "Contrat CHR/HORECA",
  bl_archive: "BL Archivé",
  facture: "Facture",
}

const STATUT_COLORS: Record<DocStatut, string> = {
  brouillon:  "bg-slate-100 text-slate-700",
  envoye:     "bg-blue-100 text-blue-700",
  accepte:    "bg-green-100 text-green-700",
  refuse:     "bg-red-100 text-red-700",
  transforme: "bg-purple-100 text-purple-700",
  expire:     "bg-orange-100 text-orange-700",
  annule:     "bg-slate-200 text-slate-500",
}

const STATUT_LABELS: Record<DocStatut, string> = {
  brouillon:  "Brouillon",
  envoye:     "Envoyé",
  accepte:    "Accepté",
  refuse:     "Refusé",
  transforme: "Transformé",
  expire:     "Expiré",
  annule:     "Annulé",
}

function genId() { return `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` }

const EMPTY_LIGNE: LigneDocument = { designation: "", qte: 1, unite: "kg", prix_u: 0, montant: 0 }

// ──────────────────────────────────────────────────────────────
// SOUS-COMPOSANT : Formulaire création/édition
// ──────────────────────────────────────────────────────────────

function DocumentForm({
  initial,
  clients,
  onSave,
  onCancel,
  userName,
  company,
}: {
  initial?: Partial<Document>
  clients: ClientRecord[]
  onSave: (doc: Document) => void
  onCancel: () => void
  userName: string
  company: CompanyConfig
}) {
  // Articles du catalogue pour autocomplete des lignes
  const articleItems: ComboItem[] = store.getArticles().map(a => ({
    id: a.id,
    label: a.nom,
    sublabel: a.famille,
    badge: a.unite,
    badgeColor: "bg-slate-100 text-slate-600",
  }))

  // Clients CHR pour autocomplete
  const clientItems: ComboItem[] = clients.map(c => {
    const isChr = c.type === "chr" || (c as unknown as Record<string, unknown>).categorie === "chr"
    const badgeLabel = isChr ? "CHR" : c.type ? c.type.toUpperCase() : undefined
    const badgeColor = isChr ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-500"
    return {
      id: c.id,
      label: c.nom,
      sublabel: c.telephone ?? c.email ?? undefined,
      badge: badgeLabel,
      badgeColor,
    }
  })
  const [form, setForm] = useState<Partial<Document>>({
    type_doc: "devis",
    client_nom: "",
    lignes: [{ ...EMPTY_LIGNE }],
    montant_ht: 0,
    tva_pct: 0,
    montant_tva: 0,
    montant_ttc: 0,
    remise_pct: 0,
    montant_net: 0,
    date_doc: new Date().toISOString().split("T")[0],
    date_validite: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
    conditions_paiement: "30 jours fin de mois",
    delai_livraison: "24h",
    statut: "brouillon",
    ...initial,
  })

  const set = (k: keyof Document, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  const recompute = (lignes: LigneDocument[], remise: number, tva: number) => {
    const ht = lignes.reduce((s, l) => s + l.montant, 0)
    const net = ht * (1 - remise / 100)
    const montantTva = net * (tva / 100)
    const ttc = net + montantTva
    setForm(f => ({ ...f, lignes, montant_ht: ht, montant_net: net, montant_tva: montantTva, montant_ttc: ttc }))
  }

  const updateLigne = (i: number, k: keyof LigneDocument, v: string | number) => {
    const ls = (form.lignes ?? []).map((l, idx) => {
      if (idx !== i) return l
      const updated = { ...l, [k]: v }
      updated.montant = Number(updated.qte) * Number(updated.prix_u)
      return updated
    })
    recompute(ls, form.remise_pct ?? 0, form.tva_pct ?? 0)
  }

  const addLigne = () => {
    const ls = [...(form.lignes ?? []), { ...EMPTY_LIGNE }]
    recompute(ls, form.remise_pct ?? 0, form.tva_pct ?? 0)
  }

  const removeLigne = (i: number) => {
    const ls = (form.lignes ?? []).filter((_, idx) => idx !== i)
    recompute(ls, form.remise_pct ?? 0, form.tva_pct ?? 0)
  }

  const handleClientSelect = (clientId: string) => {
    const c = clients.find(cl => cl.id === clientId)
    if (c) set("client_nom", c.nom)
    set("client_id", clientId)
  }

  const handleSave = () => {
    if (!form.client_nom?.trim()) return
    const doc: Document = {
      id: form.id ?? genId(),
      numero: form.numero ?? `TEMP-${Date.now()}`,
      type_doc: form.type_doc ?? "devis",
      client_id: form.client_id,
      client_nom: form.client_nom ?? "",
      lignes: form.lignes ?? [],
      montant_ht: form.montant_ht ?? 0,
      tva_pct: form.tva_pct ?? 0,
      montant_tva: form.montant_tva ?? 0,
      montant_ttc: form.montant_ttc ?? 0,
      remise_pct: form.remise_pct ?? 0,
      montant_net: form.montant_net ?? 0,
      date_doc: form.date_doc ?? new Date().toISOString().split("T")[0],
      date_validite: form.date_validite,
      date_debut: form.date_debut,
      date_fin: form.date_fin,
      conditions_paiement: form.conditions_paiement,
      delai_livraison: form.delai_livraison,
      frequence_livraison: form.frequence_livraison,
      clauses_specifiques: form.clauses_specifiques,
      statut: form.statut ?? "brouillon",
      notes: form.notes,
      created_by: form.created_by ?? userName,
      created_at: form.created_at ?? new Date().toISOString(),
    }
    onSave(doc)
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-foreground">{form.id ? "Modifier" : "Nouveau"} document</h3>
          {form.numero && <p className="text-sm text-muted-foreground">{form.numero}</p>}
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors">Annuler</button>
          <button onClick={handleSave} className="px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors">Enregistrer</button>
        </div>
      </div>

      {/* Type & Client */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Type de document</label>
          <select value={form.type_doc} onChange={e => set("type_doc", e.target.value)} className="px-3 py-2 rounded-xl border border-border bg-background text-sm">
            {(Object.entries(TYPE_LABELS) as [DocType, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Client CHR / HORECA
          </label>
          <ComboBox
            items={clientItems}
            value={form.client_id ?? ""}
            onChange={(id, label) => { set("client_id", id); set("client_nom", label) }}
            placeholder="Rechercher un client CHR…"
          />
        </div>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-4 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date doc.</label>
          <input type="date" value={form.date_doc ?? ""} onChange={e => set("date_doc", e.target.value)} className="px-3 py-2 rounded-xl border border-border bg-background text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Validité</label>
          <input type="date" value={form.date_validite ?? ""} onChange={e => set("date_validite", e.target.value)} className="px-3 py-2 rounded-xl border border-border bg-background text-sm" />
        </div>
        {form.type_doc === "contrat" && <>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Début contrat</label>
            <input type="date" value={form.date_debut ?? ""} onChange={e => set("date_debut", e.target.value)} className="px-3 py-2 rounded-xl border border-border bg-background text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fin contrat</label>
            <input type="date" value={form.date_fin ?? ""} onChange={e => set("date_fin", e.target.value)} className="px-3 py-2 rounded-xl border border-border bg-background text-sm" />
          </div>
        </>}
      </div>

      {/* Lignes */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Produits / Prestations</label>
          <button onClick={addLigne} className="text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100 transition-colors">+ Ligne</button>
        </div>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Désignation</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground w-20">Qté</th>
                <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground w-20">Unité</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground w-28">Prix unit.</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground w-28">Montant</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {(form.lignes ?? []).map((l, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-2 py-1.5 min-w-[200px]">
                    <ComboBox
                      items={articleItems}
                      value=""
                      inputValue={l.designation}
                      onChange={(artId, label) => {
                        // Remplir désignation + unité + prix depuis le catalogue
                        const art = store.getArticles().find(a => a.id === artId || a.nom === label)
                        const ls = (form.lignes ?? []).map((line, idx) => {
                          if (idx !== i) return line
                          const updated = { ...line, designation: label }
                          if (art?.unite) updated.unite = art.unite
                          if (art) {
                            // Auto-fill price: client override → CHR price → computed PV
                            const clientId = form.client_id
                            const override = clientId ? art.clientPrices?.[clientId]?.prix : undefined
                            const catPrix = (art as unknown as Record<string,unknown>).prixCHR as number | undefined
                            const pv = store.computePV(art)
                            updated.prix_u = override ?? catPrix ?? pv ?? 0
                            updated.montant = Number(updated.qte) * updated.prix_u
                          }
                          return updated
                        })
                        recompute(ls, form.remise_pct ?? 0, form.tva_pct ?? 0)
                      }}
                      onInputChange={txt => updateLigne(i, "designation", txt)}
                      placeholder="Article…"
                      allowFreeText
                      className="px-2 py-1 text-sm rounded-lg"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="number" value={l.qte} onChange={e => updateLigne(i, "qte", Number(e.target.value))} min={0} className="w-full px-2 py-1 rounded-lg border border-border bg-background text-sm text-right" />
                  </td>
                  <td className="px-2 py-1.5">
                    <select value={l.unite} onChange={e => updateLigne(i, "unite", e.target.value)} className="w-full px-2 py-1 rounded-lg border border-border bg-background text-sm">
                      {["kg","caisse","carton","palette","lot","botte","barquette","sac"].map(u => <option key={u}>{u}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="number" value={l.prix_u} onChange={e => updateLigne(i, "prix_u", Number(e.target.value))} min={0} step={0.01} className="w-full px-2 py-1 rounded-lg border border-border bg-background text-sm text-right" />
                  </td>
                  <td className="px-3 py-1.5 text-right font-semibold text-slate-700">{DH(l.montant)}</td>
                  <td className="px-2 py-1.5">
                    <button onClick={() => removeLigne(i)} className="w-6 h-6 rounded-lg text-red-400 hover:bg-red-50 flex items-center justify-center">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Totaux */}
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Remise (%)</label>
          <input type="number" value={form.remise_pct ?? 0} min={0} max={100}
            onChange={e => {
              const r = Number(e.target.value)
              set("remise_pct", r)
              recompute(form.lignes ?? [], r, form.tva_pct ?? 0)
            }}
            className="px-3 py-2 rounded-xl border border-border bg-background text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">TVA (%)</label>
          <select value={form.tva_pct ?? 0}
            onChange={e => {
              const t = Number(e.target.value)
              set("tva_pct", t)
              recompute(form.lignes ?? [], form.remise_pct ?? 0, t)
            }}
            className="px-3 py-2 rounded-xl border border-border bg-background text-sm">
            <option value={0}>0% (Exonéré)</option>
            <option value={10}>10%</option>
            <option value={14}>14%</option>
            <option value={20}>20%</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Statut</label>
          <select value={form.statut} onChange={e => set("statut", e.target.value)} className="px-3 py-2 rounded-xl border border-border bg-background text-sm">
            {(Object.entries(STATUT_LABELS) as [DocStatut, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      {/* Récap montants */}
      <div className="bg-slate-50 border border-border rounded-xl p-4 space-y-1.5 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Montant HT</span><span className="font-semibold">{DH(form.montant_ht ?? 0)}</span></div>
        {(form.remise_pct ?? 0) > 0 && <div className="flex justify-between text-orange-600"><span>Remise ({form.remise_pct}%)</span><span>- {DH((form.montant_ht ?? 0) * (form.remise_pct ?? 0) / 100)}</span></div>}
        {(form.tva_pct ?? 0) > 0 && <div className="flex justify-between text-blue-600"><span>TVA ({form.tva_pct}%)</span><span>+ {DH(form.montant_tva ?? 0)}</span></div>}
        <div className="flex justify-between text-base font-bold text-green-700 pt-1 border-t border-border"><span>TOTAL NET TTC</span><span>{DH(form.montant_ttc ?? form.montant_net ?? 0)}</span></div>
      </div>

      {/* Conditions CHR/HORECA */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Conditions paiement</label>
          <input value={form.conditions_paiement ?? ""} onChange={e => set("conditions_paiement", e.target.value)} className="px-3 py-2 rounded-xl border border-border bg-background text-sm" placeholder="30 jours fin de mois" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Délai livraison</label>
          <input value={form.delai_livraison ?? ""} onChange={e => set("delai_livraison", e.target.value)} className="px-3 py-2 rounded-xl border border-border bg-background text-sm" placeholder="24h" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fréquence livraison</label>
          <input value={form.frequence_livraison ?? ""} onChange={e => set("frequence_livraison", e.target.value)} className="px-3 py-2 rounded-xl border border-border bg-background text-sm" placeholder="Lun, Mer, Ven" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes internes</label>
          <input value={form.notes ?? ""} onChange={e => set("notes", e.target.value)} className="px-3 py-2 rounded-xl border border-border bg-background text-sm" />
        </div>
      </div>

      {/* Clauses particulières (contrats) */}
      {form.type_doc === "contrat" && (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Clauses particulières</label>
          <textarea value={form.clauses_specifiques ?? ""} onChange={e => set("clauses_specifiques", e.target.value)} rows={3} className="px-3 py-2 rounded-xl border border-border bg-background text-sm resize-none" placeholder="Engagements, garanties qualité, pénalités…" />
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// GÉNÉRATION PDF — Template CHR/HORECA
// ──────────────────────────────────────────────────────────────

function generateDocumentHTML(doc: Document, company: CompanyConfig): string {
  const typeLab = TYPE_LABELS[doc.type_doc] ?? doc.type_doc
  const isContrat = doc.type_doc === "contrat"
  const lignesHTML = doc.lignes.map((l, i) => `
    <tr style="background:${i % 2 === 0 ? "#f9fafb" : "#fff"}">
      <td style="padding:8px 12px;font-size:13px">${l.designation}</td>
      <td style="padding:8px 12px;text-align:center;font-size:13px">${l.qte}</td>
      <td style="padding:8px 12px;text-align:center;font-size:13px">${l.unite}</td>
      <td style="padding:8px 12px;text-align:right;font-size:13px">${l.prix_u.toFixed(2)} DH</td>
      <td style="padding:8px 12px;text-align:right;font-size:13px;font-weight:600">${l.montant.toFixed(2)} DH</td>
    </tr>
  `).join("")

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<title>${typeLab} ${doc.numero}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color:#1a202c; background:#fff; }
  .page { max-width: 900px; margin: 0 auto; padding: 40px; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:32px; border-bottom:3px solid #1a4f2a; padding-bottom:20px; }
  .logo-block { display:flex; flex-direction:column; gap:4px; }
  .company-name { font-size:28px; font-weight:900; color:#1a4f2a; letter-spacing:-0.5px; }
  .company-tagline { font-size:11px; font-weight:700; color:#15803d; letter-spacing:2px; text-transform:uppercase; margin-top:2px; }
  .company-sub { font-size:11px; color:#6b7280; margin-top:1px; }
  .doc-block { text-align:right; }
  .doc-type { font-size:22px; font-weight:800; color:#1a4f2a; text-transform:uppercase; }
  .doc-num { font-size:14px; color:#374151; font-weight:600; margin-top:4px; }
  .doc-date { font-size:12px; color:#6b7280; margin-top:2px; }
  .parties { display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-bottom:28px; }
  .party-box { padding:16px; border-radius:10px; background:#f3f4f6; }
  .party-title { font-size:10px; font-weight:700; text-transform:uppercase; color:#9ca3af; letter-spacing:1px; margin-bottom:8px; }
  .party-name { font-size:15px; font-weight:700; color:#111827; }
  .party-info { font-size:12px; color:#4b5563; margin-top:4px; line-height:1.6; }
  .badge { display:inline-block; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; margin-bottom:16px; }
  .badge-devis { background:#dbeafe; color:#1d4ed8; }
  .badge-contrat { background:#dcfce7; color:#15803d; }
  table { width:100%; border-collapse:collapse; margin-bottom:20px; }
  thead th { background:#1a4f2a; color:#fff; padding:10px 12px; font-size:12px; font-weight:600; text-align:left; }
  thead th:last-child,thead th:nth-child(n+2) { text-align:right; }
  thead th:nth-child(2),thead th:nth-child(3) { text-align:center; }
  tfoot td { padding:8px 12px; font-size:13px; font-weight:600; text-align:right; border-top:1px solid #e5e7eb; }
  tfoot .total-row td { font-size:15px; font-weight:800; color:#1a4f2a; border-top:2px solid #1a4f2a; }
  .conditions { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:24px; padding:16px; background:#f0fdf4; border-radius:10px; border:1px solid #bbf7d0; }
  .cond-item { display:flex; flex-direction:column; gap:2px; }
  .cond-label { font-size:10px; font-weight:700; text-transform:uppercase; color:#6b7280; }
  .cond-value { font-size:13px; color:#111827; font-weight:500; }
  .clauses { margin-top:20px; padding:16px; background:#fef3c7; border-radius:10px; border:1px solid #fde68a; }
  .clauses-title { font-size:11px; font-weight:700; text-transform:uppercase; color:#92400e; margin-bottom:8px; }
  .clauses-text { font-size:12px; color:#78350f; line-height:1.7; white-space:pre-wrap; }
  .footer { margin-top:40px; padding-top:20px; border-top:1px solid #e5e7eb; display:flex; justify-content:space-between; align-items:flex-end; }
  .footer-legal { font-size:10px; color:#9ca3af; line-height:1.6; }
  .signature-block { text-align:center; }
  .sig-label { font-size:11px; font-weight:700; color:#6b7280; text-transform:uppercase; margin-bottom:4px; }
  .sig-line { width:200px; border-bottom:1px solid #d1d5db; margin:0 auto 4px; height:50px; }
  @media print { body { -webkit-print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="page">
  <!-- HEADER -->
  <div class="header">
    <div class="logo-block">
      ${company.logo ? `<img src="${company.logo}" style="height:60px;object-fit:contain;margin-bottom:8px" alt="Logo" />` : ""}
      <div class="company-name">${company.nom || "Vita Fresh"}</div>
      <div class="company-tagline">Distribution Alimentaire Professionnelle</div>
      <div class="company-sub" style="margin-top:6px;font-style:italic;color:#6b7280">Qualité • Fiabilité • Fraîcheur</div>
      <div class="company-sub" style="margin-top:6px">${company.adresse || "Zone Industrielle"}${company.ville ? " — " + company.ville : ", Casablanca"}, ${company.pays || "Maroc"}</div>
      <div class="company-sub">Tél : ${company.telephone || "+212 5XX-XXXXXX"}  |  ${company.email || "contact@vita-fresh.ma"}</div>
      ${company.ice ? `<div class="company-sub">ICE : ${company.ice}</div>` : ""}
    </div>
    <div class="doc-block">
      <div class="doc-type">${typeLab}</div>
      <div class="doc-num">N° ${doc.numero}</div>
      <div class="doc-date">Date : ${new Date(doc.date_doc).toLocaleDateString("fr-FR", { day:"2-digit", month:"long", year:"numeric" })}</div>
      ${doc.date_validite ? `<div class="doc-date">Validité : ${new Date(doc.date_validite).toLocaleDateString("fr-FR", { day:"2-digit", month:"long", year:"numeric" })}</div>` : ""}
      ${isContrat && doc.date_debut ? `<div class="doc-date">Période : ${new Date(doc.date_debut).toLocaleDateString("fr-FR", { month:"short", year:"numeric" })} → ${new Date(doc.date_fin ?? "").toLocaleDateString("fr-FR", { month:"short", year:"numeric" })}</div>` : ""}
    </div>
  </div>

  <!-- BADGE -->
  <div class="badge badge-${doc.type_doc === "contrat" ? "contrat" : "devis"}">${typeLab.toUpperCase()}</div>

  <!-- PARTIES -->
  <div class="parties">
    <div class="party-box">
      <div class="party-title">Fournisseur</div>
      <div class="party-name">${company.nom || "Vita Fresh"}</div>
      <div class="party-info">
        ${[company.adresse, company.ville, company.pays].filter(Boolean).join(" — ")}<br/>
        ${company.rc ? "RC : " + company.rc + " — " : ""}${company.ice ? "ICE : " + company.ice : ""}
      </div>
    </div>
    <div class="party-box">
      <div class="party-title">Client / Établissement</div>
      <div class="party-name">${doc.client_nom}</div>
      <div class="party-info">Secteur CHR / HORECA</div>
    </div>
  </div>

  <!-- LIGNES -->
  <table>
    <thead>
      <tr>
        <th style="width:40%">Désignation</th>
        <th style="width:10%">Qté</th>
        <th style="width:10%">Unité</th>
        <th style="width:20%">Prix U. (DH)</th>
        <th style="width:20%">Montant (DH)</th>
      </tr>
    </thead>
    <tbody>${lignesHTML}</tbody>
    <tfoot>
      <tr><td colspan="4">Montant HT</td><td>${doc.montant_ht.toFixed(2)} DH</td></tr>
      ${doc.remise_pct > 0 ? `<tr><td colspan="4">Remise (${doc.remise_pct}%)</td><td>- ${(doc.montant_ht * doc.remise_pct / 100).toFixed(2)} DH</td></tr>` : ""}
      ${doc.tva_pct > 0 ? `<tr><td colspan="4">TVA (${doc.tva_pct}%)</td><td>+ ${doc.montant_tva.toFixed(2)} DH</td></tr>` : ""}
      <tr class="total-row"><td colspan="4">TOTAL NET TTC</td><td>${(doc.tva_pct > 0 ? doc.montant_ttc : doc.montant_net).toFixed(2)} DH</td></tr>
    </tfoot>
  </table>

  <!-- CONDITIONS -->
  <div class="conditions">
    ${doc.conditions_paiement ? `<div class="cond-item"><div class="cond-label">Conditions de paiement</div><div class="cond-value">${doc.conditions_paiement}</div></div>` : ""}
    ${doc.delai_livraison ? `<div class="cond-item"><div class="cond-label">Délai de livraison</div><div class="cond-value">${doc.delai_livraison}</div></div>` : ""}
    ${doc.frequence_livraison ? `<div class="cond-item"><div class="cond-label">Fréquence livraison</div><div class="cond-value">${doc.frequence_livraison}</div></div>` : ""}
    ${company.siteWeb ? `<div class="cond-item"><div class="cond-label">Site web</div><div class="cond-value">${company.siteWeb}</div></div>` : ""}
  </div>

  ${doc.clauses_specifiques ? `
  <div class="clauses">
    <div class="clauses-title">Clauses particulières</div>
    <div class="clauses-text">${doc.clauses_specifiques}</div>
  </div>` : ""}

  <!-- FOOTER & SIGNATURES -->
  <div class="footer">
    <div class="footer-legal">
      ${company.ice ? `ICE : ${company.ice}<br/>` : ""}
      ${company.rc ? `RC : ${company.rc}<br/>` : ""}
      ${company.if_fiscal ? `IF : ${company.if_fiscal}<br/>` : ""}
      ${company.tp ? `TP : ${company.tp}` : ""}
    </div>
    <div style="display:flex;gap:48px">
      <div class="signature-block">
        <div class="sig-label">Fournisseur</div>
        <div class="sig-line"></div>
        <div style="font-size:11px;font-weight:700;color:#1a4f2a">${company.nom || "Vita Fresh"}</div>
        <div style="font-size:10px;color:#6b7280">Distribution Alimentaire Professionnelle</div>
        <div style="font-size:10px;color:#6b7280">${company.email || "contact@vita-fresh.ma"}</div>
      </div>
      <div class="signature-block">
        <div class="sig-label">Client — Lu et approuvé</div>
        <div class="sig-line"></div>
        <div style="font-size:11px;color:#6b7280">${doc.client_nom}</div>
      </div>
    </div>
  </div>
</div>
</body>
</html>`
}

function printDocument(doc: Document, company: CompanyConfig) {
  const html = generateDocumentHTML(doc, company)
  const w = window.open("", "_blank", "width=950,height=700")
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => { w.print() }, 500)
}

function downloadDocument(doc: Document, company: CompanyConfig) {
  const html = generateDocumentHTML(doc, company)
  const blob = new Blob([html], { type: "text/html;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = window.document.createElement("a")
  a.href = url
  a.download = `${doc.type_doc === "devis" ? "Devis" : doc.type_doc === "contrat" ? "Contrat" : "Document"}-${doc.numero}-${doc.client_nom.replace(/\s+/g, "_")}.html`
  a.click()
  URL.revokeObjectURL(url)
}

function shareWhatsApp(doc: Document) {
  const total = doc.tva_pct > 0 ? doc.montant_ttc : doc.montant_net
  const text = `*${TYPE_LABELS[doc.type_doc]} N° ${doc.numero}*\nClient : ${doc.client_nom}\nMontant : ${total.toFixed(2)} DH\nDate : ${new Date(doc.date_doc).toLocaleDateString("fr-FR")}\nStatut : ${STATUT_LABELS[doc.statut]}`
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank")
}

function shareEmail(doc: Document, company: CompanyConfig) {
  const total = doc.tva_pct > 0 ? doc.montant_ttc : doc.montant_net
  const subject = `${TYPE_LABELS[doc.type_doc]} N° ${doc.numero} — ${doc.client_nom}`
  const body = `Bonjour,\n\nVeuillez trouver ci-joint le ${TYPE_LABELS[doc.type_doc].toLowerCase()} N° ${doc.numero}.\n\nClient : ${doc.client_nom}\nMontant total TTC : ${total.toFixed(2)} DH\nDate : ${new Date(doc.date_doc).toLocaleDateString("fr-FR")}${doc.date_validite ? `\nValidité : ${new Date(doc.date_validite).toLocaleDateString("fr-FR")}` : ""}\n\nCordialement,\n${company.nom || "Vita Fresh"}\nDistribution Alimentaire Professionnelle\n${company.email || "contact@vita-fresh.ma"}`
  window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, "_blank")
}

// ──────────────────────────────────────────────────────────────
// COMPOSANT PRINCIPAL
// ──────────────────────────────────────────────────────────────

export default function BODocuments({ user }: { user: { id: string; name: string; role: string } }) {
  const [docs, setDocs]       = useState<Document[]>([])
  const [clients, setClients] = useState<ClientRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView]       = useState<"list" | "form" | "detail">("list")
  const [editing, setEditing] = useState<Partial<Document> | undefined>()
  const [detail, setDetail]   = useState<Document | null>(null)
  const [filter, setFilter]   = useState<"all" | DocType>("all")
  const [statusFilter, setStatusFilter] = useState<"all" | DocStatut>("all")
  const [search, setSearch]   = useState("")
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState<{ ok: boolean; text: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const company = store.getCompanyConfig()

  const sb = createClient()

  const load = useCallback(async () => {
    setLoading(true)

    // Toujours charger le localStorage en premier (fallback quand table Supabase inexistante)
    const localDocs: Document[] = (() => {
      try { return JSON.parse(localStorage.getItem("fl_documents_local") ?? "[]") } catch { return [] }
    })()

    const byDate = (a: Document, b: Document) => (b.created_at ?? "").localeCompare(a.created_at ?? "")
    try {
      // Pattern JSONB service-role {id,payload} — fl_documents n'a PAS de
      // colonnes plates (client_nom…). On lit/écrit via /api/sync-* .
      const res = await fetch("/api/sync-read?table=fl_documents", { cache: "no-store" })
      const j = res.ok ? await res.json() as { data?: { id: string; payload?: Document }[] } : null
      const rows = j?.data ?? []
      if (rows.length) {
        const sbDocs = rows.map(r => ({ ...(r.payload as Document), id: r.id }))
        const sbIds = new Set(sbDocs.map(d => d.id))
        const extra = localDocs.filter(d => !sbIds.has(d.id))
        setDocs([...sbDocs, ...extra].sort(byDate))
      } else {
        setDocs(localDocs.sort(byDate))
      }
    } catch {
      setDocs(localDocs.sort(byDate))
    }

    // Load ALL clients (not just CHR) — show all in ComboBox with CHR badge
    try {
      // 1. Local store immediately (fast)
      const localAll = store.getVisibleClients()
      const toRecord = (c: typeof localAll[0]): ClientRecord => ({
        id: c.id,
        nom: c.nom,
        type: String((c as unknown as Record<string,unknown>).type ?? (c as unknown as Record<string,unknown>).categorie ?? ""),
        telephone: c.telephone,
        email: c.email,
        adresse: c.adresse,
      })
      if (localAll.length > 0) {
        setClients(localAll.map(toRecord).sort((a, b) => a.nom.localeCompare(b.nom, "fr")))
      }

      // 2. Supabase in parallel — always try to get fresh data
      const { data } = await sb.from("fl_clients").select("id, payload")
      if (data && data.length > 0) {
        const me = store.getSession()
        const sbClients = (data as { id: string; payload: Record<string, unknown> }[])
          .filter(r => r.payload?.nom)
          .filter(r => isClientVisible({ groupeId: r.payload?.groupeId as string | undefined } as Client, me))
          .map(r => ({
            id: r.id,
            nom: String(r.payload?.nom ?? ""),
            type: String(r.payload?.type ?? r.payload?.categorie ?? ""),
            telephone: r.payload?.telephone as string | undefined,
            email: r.payload?.email as string | undefined,
            adresse: r.payload?.adresse as string | undefined,
            ville: r.payload?.ville as string | undefined,
          } as ClientRecord))
          .sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
        // Merge: Supabase wins, fill gaps with local
        const ids = new Set(sbClients.map(c => c.id))
        const localExtra = localAll.map(toRecord).filter(c => !ids.has(c.id))
        const merged = [...sbClients, ...localExtra].sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
        if (merged.length > 0) setClients(merged)
      }
    } catch { /* offline — local store data already shown */ }

    setLoading(false)
  }, [sb])

  useEffect(() => { load() }, [load])

  // ── Helpers ──────────────────────────────────────────────────
  const extractError = (e: unknown): string => {
    if (e instanceof Error) return e.message
    const obj = e as Record<string, unknown>
    return (obj?.message as string) ?? (obj?.details as string) ?? (obj?.hint as string) ?? JSON.stringify(e)
  }

  const genNumeroLocal = (type: DocType): string => {
    const prefix = type === "devis" ? "DEV" : type === "contrat" ? "CTR" : type === "facture" ? "FAC" : "DOC"
    const yy = new Date().getFullYear().toString().slice(-2)
    const seq = String(Date.now()).slice(-4)
    return `${prefix}-${yy}-${seq}`
  }

  const saveDocLocal = (doc: Document) => {
    try {
      const stored: Document[] = JSON.parse(localStorage.getItem("fl_documents_local") ?? "[]")
      const idx = stored.findIndex(d => d.id === doc.id)
      if (idx >= 0) stored[idx] = doc; else stored.unshift(doc)
      localStorage.setItem("fl_documents_local", JSON.stringify(stored))
    } catch { /* ignore */ }
  }

  const handleSave = async (doc: Document) => {
    setSaving(true)
    try {
      // 1. Générer numéro (RPC ou fallback local)
      let numero = doc.numero
      if (numero.startsWith("TEMP")) {
        try {
          const { data: numData } = await sb.rpc("generate_document_number", { p_type: doc.type_doc } as any)
          numero = (numData as unknown as string) ?? genNumeroLocal(doc.type_doc)
        } catch {
          numero = genNumeroLocal(doc.type_doc)
        }
      }
      const saveDoc = { ...doc, numero }

      // 2. Sauvegarder via service-role (JSONB {id,payload})
      saveDocLocal(saveDoc)   // copie locale dans tous les cas
      const res = await fetch("/api/sync-write", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: "fl_documents", upserts: [{ id: saveDoc.id, payload: saveDoc, updated_at: new Date().toISOString() }] }),
      })
      const data = await res.json().catch(() => ({ ok: false }))
      if (data.ok) {
        setMsg({ ok: true, text: `✅ Document ${saveDoc.numero} enregistré.` })
      } else {
        setMsg({ ok: true, text: `✅ Document ${saveDoc.numero} sauvegardé localement. (Sync Supabase indisponible — créez la table via sql/CREATE-fl_documents.sql)` })
      }

      // 3. Recharger liste (inclut localStorage)
      await load()
      setView("list")
    } catch (e) {
      setMsg({ ok: false, text: `Erreur: ${extractError(e)}` })
    } finally {
      setSaving(false)
      setTimeout(() => setMsg(null), 5000)
    }
  }

  const handleTransform = async (doc: Document) => {
    if (doc.type_doc !== "devis") return
    const newDoc: Document = {
      ...doc,
      id: genId(),
      numero: `TEMP-${Date.now()}`,
      type_doc: "contrat",
      statut: "brouillon",
      date_debut: new Date().toISOString().split("T")[0],
      date_fin: new Date(Date.now() + 365 * 86400000).toISOString().split("T")[0],
      created_at: new Date().toISOString(),
    }
    // Marquer l'original comme transformé (JSONB service-role)
    const updatedOriginal = { ...doc, statut: "transforme" as DocStatut, transforme_en: newDoc.id }
    saveDocLocal(updatedOriginal)
    await fetch("/api/sync-write", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "fl_documents", upserts: [{ id: doc.id, payload: updatedOriginal, updated_at: new Date().toISOString() }] }),
    }).catch(() => {})
    setEditing(newDoc)
    setView("form")
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce document ?")) return
    // Supprime côté Supabase (service-role) + local
    await fetch("/api/sync-write", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "fl_documents", deletes: [id] }),
    }).catch(() => {})
    try {
      const stored: Document[] = JSON.parse(localStorage.getItem("fl_documents_local") ?? "[]")
      localStorage.setItem("fl_documents_local", JSON.stringify(stored.filter(d => d.id !== id)))
    } catch { /* ignore */ }
    setDocs(d => d.filter(x => x.id !== id))
  }

  // ── Export / Import (sauvegarde, migration, partage de devis) ──
  const handleExportAll = () => {
    const exportSet = filter === "all" ? docs : docs.filter(d => d.type_doc === filter)
    const blob = new Blob([JSON.stringify(exportSet, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `vitafresh-documents-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setMsg({ ok: true, text: `✅ ${exportSet.length} document(s) exporté(s).` })
    setTimeout(() => setMsg(null), 4000)
  }

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const arr: Document[] = Array.isArray(parsed) ? parsed : [parsed]
      const valid = arr.filter(d => d && d.id && d.type_doc)
      if (!valid.length) { setMsg({ ok: false, text: "Fichier invalide : aucun document reconnu." }); return }
      const now = new Date().toISOString()
      valid.forEach(saveDocLocal)
      await fetch("/api/sync-write", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: "fl_documents", upserts: valid.map(d => ({ id: d.id, payload: d, updated_at: now })) }),
      }).catch(() => {})
      await load()
      setMsg({ ok: true, text: `✅ ${valid.length} document(s) importé(s).` })
    } catch {
      setMsg({ ok: false, text: "Échec de l'import (JSON illisible)." })
    }
    setTimeout(() => setMsg(null), 5000)
  }

  const handleUpload = async (docId: string, file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      setMsg({ ok: false, text: "Fichier trop volumineux (max 5 Mo)." })
      setTimeout(() => setMsg(null), 3000)
      return
    }
    setUploading(true)
    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = reader.result as string
      const { error } = await sb.from("fl_documents").update({
        piece_jointe: dataUrl,
        piece_jointe_nom: file.name,
        piece_jointe_type: file.type,
      } as never).eq("id", docId)
      if (error) {
        setMsg({ ok: false, text: `Erreur upload: ${error.message}` })
      } else {
        setMsg({ ok: true, text: `Fichier "${file.name}" joint au document.` })
        await load()
        if (detail?.id === docId) {
          const updated = docs.find(d => d.id === docId)
          if (updated) setDetail({ ...updated, piece_jointe: dataUrl, piece_jointe_nom: file.name } as Document)
        }
      }
      setUploading(false)
      setTimeout(() => setMsg(null), 3000)
    }
    reader.readAsDataURL(file)
  }

  const filtered = docs.filter(d => {
    if (filter !== "all" && d.type_doc !== filter) return false
    if (statusFilter !== "all" && d.statut !== statusFilter) return false
    if (search && !d.client_nom.toLowerCase().includes(search.toLowerCase()) && !d.numero.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // ── LIST VIEW ──────────────────────────────────────────────
  if (view === "list") return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Documents Commerciaux</h2>
          <p className="text-sm text-muted-foreground">Devis, Contrats CHR/HORECA, Factures</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input id="doc-import-input" type="file" accept="application/json,.json" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.currentTarget.value = "" }} />
          <button onClick={() => document.getElementById("doc-import-input")?.click()}
            className="px-3 py-2 rounded-xl border border-border bg-background text-sm font-semibold hover:bg-muted transition-colors flex items-center gap-1.5" title="Importer des devis/contrats (JSON)">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" /></svg>
            Importer
          </button>
          <button onClick={handleExportAll}
            className="px-3 py-2 rounded-xl border border-border bg-background text-sm font-semibold hover:bg-muted transition-colors flex items-center gap-1.5" title="Exporter les documents (JSON)">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5 5 5M12 5v12" /></svg>
            Exporter
          </button>
          <button onClick={() => { setEditing(undefined); setView("form") }} className="px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Nouveau document
          </button>
        </div>
      </div>

      {msg && (
        <div className={`px-4 py-2.5 rounded-xl text-sm font-medium border ${msg.ok ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>{msg.text}</div>
      )}

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Chercher client, numéro…" className="px-3 py-2 rounded-xl border border-border bg-background text-sm flex-1 min-w-48" />
        <select value={filter} onChange={e => setFilter(e.target.value as typeof filter)} className="px-3 py-2 rounded-xl border border-border bg-background text-sm">
          <option value="all">Tous types</option>
          {(Object.entries(TYPE_LABELS) as [DocType, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)} className="px-3 py-2 rounded-xl border border-border bg-background text-sm">
          <option value="all">Tous statuts</option>
          {(Object.entries(STATUT_LABELS) as [DocStatut, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* Tableau */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Chargement…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
            <svg className="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          </div>
          <p className="font-semibold text-slate-600">Aucun document</p>
          <p className="text-sm text-muted-foreground">Créez votre premier devis ou contrat CHR</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">N°</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Client</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Montant</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">Date</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">Statut</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(doc => (
                <tr key={doc.id} className="border-t border-border hover:bg-muted/40 cursor-pointer" onClick={() => { setDetail(doc); setView("detail") }}>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{doc.numero}</td>
                  <td className="px-4 py-3"><span className="text-xs font-semibold">{TYPE_LABELS[doc.type_doc]}</span></td>
                  <td className="px-4 py-3 font-medium">{doc.client_nom}</td>
                  <td className="px-4 py-3 text-right font-semibold">{DH(doc.montant_ttc || doc.montant_net)}</td>
                  <td className="px-4 py-3 text-center text-slate-500">{new Date(doc.date_doc).toLocaleDateString("fr-FR")}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUT_COLORS[doc.statut]}`}>{STATUT_LABELS[doc.statut]}</span>
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => printDocument(doc, company)} className="p-1.5 rounded-lg hover:bg-muted text-slate-500 hover:text-slate-700" title="Imprimer">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                      </button>
                      <button onClick={() => downloadDocument(doc, company)} className="p-1.5 rounded-lg hover:bg-green-50 text-slate-500 hover:text-green-700" title="Télécharger">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                      </button>
                      <button onClick={() => shareWhatsApp(doc)} className="p-1.5 rounded-lg hover:bg-emerald-50 text-slate-500 hover:text-emerald-600" title="Envoyer WhatsApp">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.107.547 4.085 1.504 5.806L0 24l6.345-1.483A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.882a9.869 9.869 0 01-5.032-1.378l-.36-.214-3.735.873.945-3.642-.235-.374A9.868 9.868 0 012.118 12C2.118 6.537 6.537 2.118 12 2.118c5.463 0 9.882 4.419 9.882 9.882 0 5.463-4.419 9.882-9.882 9.882z"/></svg>
                      </button>
                      <button onClick={() => shareEmail(doc, company)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-500 hover:text-blue-600" title="Envoyer par email">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                      </button>
                      <label className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-500 hover:text-blue-700 cursor-pointer" title="Joindre un fichier">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="hidden" onChange={e => { if (e.target.files?.[0]) handleUpload(doc.id, e.target.files[0]); e.target.value = "" }} />
                      </label>
                      {doc.type_doc === "devis" && doc.statut !== "transforme" && (
                        <button onClick={() => handleTransform(doc)} className="p-1.5 rounded-lg hover:bg-purple-50 text-purple-500" title="Transformer en contrat">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                        </button>
                      )}
                      <button onClick={() => { setEditing(doc); setView("form") }} className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500" title="Modifier">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={() => handleDelete(doc.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400" title="Supprimer">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )

  // ── FORM VIEW ──────────────────────────────────────────────
  if (view === "form") return (
    <div className="flex flex-col gap-5">
      {saving && <div className="text-sm text-blue-600 bg-blue-50 px-4 py-2 rounded-xl">Enregistrement…</div>}
      {msg && <div className={`px-4 py-2.5 rounded-xl text-sm font-medium border ${msg.ok ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>{msg.text}</div>}
      <DocumentForm
        initial={editing}
        clients={clients}
        onSave={handleSave}
        onCancel={() => setView("list")}
        userName={user.name}
        company={company}
      />
    </div>
  )

  // ── DETAIL VIEW ────────────────────────────────────────────
  if (view === "detail" && detail) return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <button onClick={() => setView("list")} className="p-2 rounded-xl hover:bg-muted transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="flex-1">
          <h3 className="font-bold text-lg text-foreground">{TYPE_LABELS[detail.type_doc]} — {detail.numero}</h3>
          <p className="text-sm text-muted-foreground">{detail.client_nom}</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${STATUT_COLORS[detail.statut]}`}>{STATUT_LABELS[detail.statut]}</span>
        <button onClick={() => printDocument(detail, company)} className="px-3 py-2 rounded-xl bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700 transition-colors flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
          Imprimer
        </button>
        <button onClick={() => downloadDocument(detail, company)} className="px-3 py-2 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          Télécharger
        </button>
        <button onClick={() => shareWhatsApp(detail)} className="px-3 py-2 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition-colors flex items-center gap-2">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.107.547 4.085 1.504 5.806L0 24l6.345-1.483A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.882a9.869 9.869 0 01-5.032-1.378l-.36-.214-3.735.873.945-3.642-.235-.374A9.868 9.868 0 012.118 12C2.118 6.537 6.537 2.118 12 2.118c5.463 0 9.882 4.419 9.882 9.882 0 5.463-4.419 9.882-9.882 9.882z"/></svg>
          WhatsApp
        </button>
        <button onClick={() => shareEmail(detail, company)} className="px-3 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
          Email
        </button>
        <label className={`px-3 py-2 rounded-xl border border-border text-sm font-semibold flex items-center gap-2 cursor-pointer transition-colors ${uploading ? "opacity-50 pointer-events-none" : "hover:bg-muted"}`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
          {uploading ? "Upload…" : "Joindre"}
          <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="hidden" onChange={e => { if (e.target.files?.[0]) handleUpload(detail.id, e.target.files[0]); e.target.value = "" }} />
        </label>
        <button onClick={() => { setEditing(detail); setView("form") }} className="px-3 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors">Modifier</button>
      </div>

      {/* Aperçu simplifié */}
      <div className="bg-white border border-border rounded-2xl p-6 shadow-sm">
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div><p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">Client</p><p className="font-semibold">{detail.client_nom}</p></div>
          <div><p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">Date</p><p>{new Date(detail.date_doc).toLocaleDateString("fr-FR", { day:"2-digit", month:"long", year:"numeric" })}</p></div>
          {detail.conditions_paiement && <div><p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">Paiement</p><p>{detail.conditions_paiement}</p></div>}
          {detail.delai_livraison && <div><p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">Livraison</p><p>{detail.delai_livraison}</p></div>}
          {detail.frequence_livraison && <div><p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">Fréquence</p><p>{detail.frequence_livraison}</p></div>}
        </div>

        <table className="w-full text-sm mb-4">
          <thead className="bg-slate-50 border border-border">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">Désignation</th>
              <th className="text-center px-3 py-2 text-xs font-semibold text-slate-500">Qté</th>
              <th className="text-center px-3 py-2 text-xs font-semibold text-slate-500">Unité</th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500">Prix U.</th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500">Montant</th>
            </tr>
          </thead>
          <tbody>
            {detail.lignes.map((l, i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-3 py-2">{l.designation}</td>
                <td className="px-3 py-2 text-center">{l.qte}</td>
                <td className="px-3 py-2 text-center">{l.unite}</td>
                <td className="px-3 py-2 text-right">{DH(l.prix_u)}</td>
                <td className="px-3 py-2 text-right font-semibold">{DH(l.montant)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end">
          <div className="space-y-1 text-sm w-64">
            <div className="flex justify-between"><span className="text-muted-foreground">HT</span><span>{DH(detail.montant_ht)}</span></div>
            {detail.remise_pct > 0 && <div className="flex justify-between text-orange-600"><span>Remise {detail.remise_pct}%</span><span>- {DH(detail.montant_ht * detail.remise_pct / 100)}</span></div>}
            {detail.tva_pct > 0 && <div className="flex justify-between text-blue-600"><span>TVA {detail.tva_pct}%</span><span>+ {DH(detail.montant_tva)}</span></div>}
            <div className="flex justify-between font-bold text-base text-green-700 pt-1 border-t border-border"><span>TOTAL NET TTC</span><span>{DH(detail.tva_pct > 0 ? detail.montant_ttc : detail.montant_net)}</span></div>
          </div>
        </div>

        {/* Pièce jointe */}
        {(detail as Document & { piece_jointe?: string; piece_jointe_nom?: string }).piece_jointe && (
          <div className="mt-4 flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl">
            <svg className="w-5 h-5 text-blue-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-blue-800">Pièce jointe</p>
              <p className="text-xs text-blue-600 truncate">{(detail as Document & { piece_jointe_nom?: string }).piece_jointe_nom ?? "Fichier joint"}</p>
            </div>
            <a
              href={(detail as Document & { piece_jointe?: string }).piece_jointe}
              download={(detail as Document & { piece_jointe_nom?: string }).piece_jointe_nom ?? "piece_jointe"}
              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
            >
              Télécharger
            </a>
          </div>
        )}
      </div>
    </div>
  )

  return null
}
