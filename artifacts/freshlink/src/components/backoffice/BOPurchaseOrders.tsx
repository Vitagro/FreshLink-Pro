"use client"

import { useState, useEffect } from "react"
import { store, type PurchaseOrder, type Article, type Fournisseur, type DemandeAchat } from "@/lib/store"
import { sendEmail } from "@/lib/email"
import { printPO } from "@/lib/print"
import ArticleCombobox from "@/components/ui/ArticleCombobox"

const fmtDH = (n: number) => n.toLocaleString("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " DH"
const fmtDate = () => new Date().toLocaleDateString("fr-FR")

// ── Calcul nb caisses pour un article ────────────────────────────────────────
// Logique: qte / colisageCaisses = nb caisses entières + reste → demi-caisses
// Ex: 52 kg, caisse=30kg, demi=15kg → 1 grosse caisse (30), 1 demi (15), reste 7 → arrondi a 1 demi
// On cherche le mix optimal: max caisses grosses, puis demi-caisses pour le reste
function calcCaisses(qteKg: number, colisageGros = 30, colisageDemi = 15): { gros: number; demi: number; reste: number; totalKg: number } {
  if (qteKg <= 0 || colisageGros <= 0) return { gros: 0, demi: 0, reste: 0, totalKg: 0 }
  const gros = Math.floor(qteKg / colisageGros)
  const resteApresGros = qteKg - gros * colisageGros
  const demi = colisageDemi > 0 ? Math.ceil(resteApresGros / colisageDemi) : 0
  const totalKg = gros * colisageGros + demi * colisageDemi
  const reste = totalKg - qteKg  // excedent (on commande un peu plus pour ne pas manquer)
  return { gros, demi, reste: Math.max(0, reste), totalKg }
}

// legacy inline — kept for reference but replaced by lib/print
function _printPOLegacy(po: PurchaseOrder) {
  const company = typeof window !== "undefined" ? (() => {
    try { return JSON.parse(localStorage.getItem("fl_company") || "{}") } catch { return {} }
  })() : {}
  const companyNom = company.nom || "FreshLink Maroc"
  const companyEmail = company.email || "contact@freshlink.ma"
  const companyTel = company.telephone || ""
  const companyAdresse = company.adresse || ""
  const companyLogo = company.logo || null
  const tva = Math.round(po.total * 0.20)
  const ttc = po.total + tva

  const win = window.open("", "_blank", "width=860,height=720")
  if (!win) return
  win.document.write(`<!DOCTYPE html><html lang="fr"><head>
<meta charset="UTF-8">
<title>BC-${po.id.slice(0,8).toUpperCase()} — Bon de Commande Fournisseur</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:10.5pt;color:#1a1a1a;background:#fff;padding:32px 36px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:18px;border-bottom:4px solid #92400e;margin-bottom:22px}
  .brand h1{font-size:22pt;font-weight:900;color:#92400e;letter-spacing:-0.5px;line-height:1}
  .brand .tagline{font-size:8.5pt;color:#6b7280;margin-top:3px}
  .brand .contact{font-size:8pt;color:#9ca3af;margin-top:5px;line-height:1.6}
  .doc-meta{text-align:right}
  .doc-meta .doc-type{font-size:9pt;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:2px}
  .doc-meta .doc-num{font-size:18pt;font-weight:900;color:#92400e;letter-spacing:-0.5px;line-height:1.1}
  .doc-meta .doc-date{font-size:9pt;color:#6b7280;margin-top:4px}
  .badge{display:inline-block;padding:3px 12px;border-radius:20px;font-size:8pt;font-weight:700;text-transform:uppercase;margin-top:6px;border:1px solid}
  .badge-ouvert{background:#dbeafe;color:#1e40af;border-color:#93c5fd}
  .badge-envoye{background:#d1fae5;color:#065f46;border-color:#6ee7b7}
  .badge-receptionne{background:#dcfce7;color:#14532d;border-color:#86efac}
  .badge-annule{background:#fee2e2;color:#991b1b;border-color:#fca5a5}
  .parties{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:22px}
  .party{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 16px}
  .party .label{font-size:7pt;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:#92400e;margin-bottom:6px}
  .party .name{font-size:12pt;font-weight:700;color:#111827}
  .party .sub{font-size:8.5pt;color:#6b7280;margin-top:3px;line-height:1.5}
  table{width:100%;border-collapse:collapse;margin-bottom:20px;font-size:10pt}
  thead tr{background:#92400e;color:#fff}
  thead th{padding:10px 13px;text-align:left;font-size:8pt;font-weight:600;text-transform:uppercase;letter-spacing:.5px}
  th.r,td.r{text-align:right}
  tbody tr{border-bottom:1px solid #f3f4f6}
  tbody tr:nth-child(even){background:#fffbeb}
  tbody td{padding:10px 13px;vertical-align:top}
  .notes-box{background:#f0fdf4;border:1px solid #bbf7d0;border-left:4px solid #16a34a;border-radius:8px;padding:12px 14px;margin-bottom:20px}
  .notes-box h4{font-size:8pt;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px}
  .notes-box p{font-size:10pt;color:#1f2937}
  .totals-wrap{display:flex;justify-content:flex-end;margin-bottom:24px}
  .totals{border:2px solid #92400e;border-radius:10px;padding:14px 18px;min-width:250px}
  .trow{display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:10pt;color:#374151}
  .trow-total{border-top:2px solid #92400e;margin-top:8px;padding-top:10px}
  .trow-total .tl{font-size:11pt;font-weight:800;color:#92400e}
  .trow-total .tv{font-size:14pt;font-weight:900;color:#92400e}
  .footer{margin-top:28px;padding-top:18px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:flex-end}
  .sig-box{text-align:center;min-width:170px}
  .sig-box .sig-label{font-size:8.5pt;font-weight:600;color:#374151;margin-bottom:4px}
  .sig-box .sig-line{width:170px;border-bottom:1px solid #9ca3af;height:50px}
  .watermark{font-size:7.5pt;color:#d1d5db;text-align:right;line-height:1.6}
  @media print{body{padding:16px 20px}}
</style>
</head><body>
<div class="header">
  <div class="brand">
    ${companyLogo
      ? `<img src="${companyLogo}" style="height:52px;object-fit:contain;margin-bottom:4px" alt="logo"/>`
      : `<h1>${companyNom}</h1>`}
    <div class="tagline">Distribution Fruits &amp; Légumes</div>
    <div class="contact">
      ${companyEmail ? `<span>${companyEmail}</span>` : ""}
      ${companyTel ? ` &nbsp;·&nbsp; ${companyTel}` : ""}
      ${companyAdresse ? `<br/>${companyAdresse}` : ""}
    </div>
  </div>
  <div class="doc-meta">
    <div class="doc-type">Bon de Commande Fournisseur</div>
    <div class="doc-num">BC-${po.id.slice(0,8).toUpperCase()}</div>
    <div class="doc-date">Date : ${po.date}</div>
    <div class="doc-date">Créé par : ${po.createdBy}</div>
    <span class="badge badge-${po.statut.replace("é","e").replace("é","e")}">${po.statut.toUpperCase()}</span>
  </div>
</div>

<div class="parties">
  <div class="party">
    <div class="label">Acheteur</div>
    <div class="name">${companyNom}</div>
    <div class="sub">${companyEmail}${companyTel ? "<br/>" + companyTel : ""}</div>
  </div>
  <div class="party">
    <div class="label">Fournisseur</div>
    <div class="name">${po.fournisseurNom}</div>
    <div class="sub">${po.fournisseurEmail}</div>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th style="width:32px">#</th>
      <th>Article / Désignation</th>
      <th>Unité</th>
      <th class="r" style="width:90px">Quantité</th>
      <th class="r" style="width:110px">Prix unit. HT</th>
      <th class="r" style="width:120px">Total HT</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="color:#9ca3af;font-size:9pt">1</td>
      <td style="font-weight:700">${po.articleNom}</td>
      <td>${po.articleUnite}</td>
      <td class="r">${po.quantite.toLocaleString("fr-MA")}</td>
      <td class="r">${fmtDH(po.prixUnitaire)}</td>
      <td class="r" style="font-weight:800">${fmtDH(po.total)}</td>
    </tr>
  </tbody>
</table>

${po.notes ? `<div class="notes-box"><h4>Notes &amp; Observations</h4><p>${po.notes}</p></div>` : ""}

<div class="totals-wrap">
  <div class="totals">
    <div class="trow"><span>Sous-total HT</span><span>${fmtDH(po.total)}</span></div>
    <div class="trow"><span>TVA (20%)</span><span>${fmtDH(tva)}</span></div>
    <div class="trow trow-total"><span class="tl">TOTAL TTC</span><span class="tv">${fmtDH(ttc)}</span></div>
  </div>
</div>

<div class="footer">
  <div class="sig-box"><div class="sig-label">Signature Acheteur</div><div class="sig-line"></div></div>
  <div class="sig-box"><div class="sig-label">Signature Fournisseur</div><div class="sig-line"></div></div>
  <div class="watermark">
    <p>FreshLink Pro — Gestion Distribution</p>
    <p>Imprimé le ${fmtDate()}</p>
  </div>
</div>
<script>window.onload=function(){window.print()}</script>
</body></html>`)
  win.document.close()
}

const STATUT_COLORS: Record<string, string> = {
  ouvert: "bg-blue-100 text-blue-800",
  envoyé: "bg-cyan-100 text-cyan-800",
  receptionné: "bg-green-100 text-green-800",
  annulé: "bg-red-100 text-red-800",
}

export default function BoPurchaseOrders() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [demandesAchat, setDemandesAchat] = useState<DemandeAchat[]>([])
  const [articles, setArticles] = useState<Article[]>([])
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([])
  const [showForm, setShowForm] = useState(false)
  const [poSubmitting, setPoSubmitting] = useState(false)
  const [filterStatut, setFilterStatut] = useState<string>("tous")
  const [filterArticle, setFilterArticle] = useState<string>("")
  const [sortMode, setSortMode] = useState<"recent" | "alpha">("recent")
  const [emailConfig] = useState(store.getEmailConfig().achat)
  const [poTab, setPoTab] = useState<"po" | "da">("po")
  const [autoGenMsg, setAutoGenMsg] = useState<string | null>(null)

  // Form
  const [fArticleId, setFArticleId] = useState("")
  const [fFournisseurId, setFFournisseurId] = useState("")
  const [fQuantite, setFQuantite] = useState("")
  const [fPrix, setFPrix] = useState("")
  const [fNotes, setFNotes] = useState("")
  const [fEmailDest, setFEmailDest] = useState(emailConfig)

  useEffect(() => {
    refresh()
  }, [])

  const refresh = () => {
    setOrders(store.getPurchaseOrders())
    setArticles(store.getArticles())
    setFournisseurs(store.getFournisseurs())
    setDemandesAchat(store.getDemandesAchat())
  }

  // Auto-generate POs from besoin net (called by user or can be automated)
  const handleAutoGenPOs = () => {
    const newPOs = store.autoGeneratePOsFromBesoin()
    if (newPOs.length === 0) {
      setAutoGenMsg("Aucun PO a generer — stock suffisant ou POs deja crees aujourd'hui.")
    } else {
      setAutoGenMsg(`${newPOs.length} PO(s) genere(s) automatiquement depuis le besoin net.`)
    }
    refresh()
    setTimeout(() => setAutoGenMsg(null), 5000)
  }

  const selectedArticle = articles.find(a => a.id === fArticleId)
  const selectedFournisseur = fournisseurs.find(f => f.id === fFournisseurId)
  const totalCalc = Number(fQuantite || 0) * Number(fPrix || 0)

  const handleSubmit = async () => {
    if (!fArticleId || !fFournisseurId || !fQuantite || !fPrix) return
    if (poSubmitting) return // anti double-clic — jamais deux PO identiques
    setPoSubmitting(true)
    const art = articles.find(a => a.id === fArticleId)!
    const fou = fournisseurs.find(f => f.id === fFournisseurId)!
    const po: PurchaseOrder = {
      id: store.genId(),
      date: store.today(),
      articleId: fArticleId,
      articleNom: art.nom,
      articleUnite: art.unite,
      fournisseurId: fFournisseurId,
      fournisseurNom: fou.nom,
      fournisseurEmail: fou.email,
      quantite: Number(fQuantite),
      prixUnitaire: Number(fPrix),
      total: totalCalc,
      statut: "ouvert",
      notes: fNotes,
      createdBy: "Back Office",
    }
    store.addPurchaseOrder(po)

    // WhatsApp auto-notification to fournisseur when PO is created
    const phone = fou.telephone?.replace(/\D/g, "") ?? ""
    if (phone) {
      const msg = encodeURIComponent(
        `📦 Commande FreshLink Pro\n` +
        `Ref: ${po.id.slice(0, 12)}\nDate: ${po.date}\n\n` +
        `Article: ${art.nom}\n` +
        `Quantite: ${po.quantite} ${art.unite}\n` +
        `Prix unitaire: ${po.prixUnitaire.toFixed(2)} DH\n` +
        `Total: ${po.total.toFixed(2)} DH\n\n` +
        (fNotes ? `Notes: ${fNotes}\n\n` : "") +
        `Merci de confirmer la disponibilite. / يرجى تاكيد التوفر.\n— FreshLink Pro`
      )
      window.open(`https://wa.me/${phone}?text=${msg}`, "_blank")
    }

    setShowForm(false)
    setFArticleId(""); setFFournisseurId(""); setFQuantite(""); setFPrix(""); setFNotes("")
    refresh()
    setPoSubmitting(false)

    // Send email
    await sendEmail({
      to_email: fEmailDest || emailConfig,
      subject: `Nouveau Bon de Commande PO #${po.id.slice(0, 10)} — ${po.articleNom}`,
      body: `Bon de Commande Fournisseur\n\nArticle: ${po.articleNom} (${po.articleUnite})\nFournisseur: ${po.fournisseurNom}\nQuantité: ${po.quantite}\nPrix unitaire: ${po.prixUnitaire} DH\nTotal HT: ${po.total} DH\nTotal TTC (19%): ${Math.round(po.total * 1.19)} DH\n\nDate: ${po.date}\nNotes: ${po.notes || "-"}`,
    })
  }

  const handleUpdateStatut = (id: string, statut: PurchaseOrder["statut"]) => {
    store.updatePurchaseOrder(id, { statut })
    refresh()
  }

  const filtered = orders.filter(o => {
    if (filterStatut !== "tous" && o.statut !== filterStatut) return false
    if (filterArticle && !o.articleNom.toLowerCase().includes(filterArticle.toLowerCase())) return false
    return true
  }).sort((a, b) => sortMode === "alpha"
    ? a.articleNom.localeCompare(b.articleNom, "fr")
    : String(b.date ?? "").localeCompare(String(a.date ?? "")))

  const totalValeur = filtered.reduce((s, o) => s + o.total, 0)
  const countOuvert = orders.filter(o => o.statut === "ouvert").length

  return (
    <div className="flex flex-col gap-5">

      {/* Explanation: PO Achat vs PO Consolide */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex flex-col gap-2.5">
        <h3 className="text-sm font-bold text-blue-800 flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          Difference entre Bon d'Achat et PO Consolide
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="bg-white rounded-xl border border-blue-200 p-3 flex flex-col gap-1.5">
            <p className="font-bold text-blue-700">Bon d&apos;Achat (cree par l&apos;acheteur mobile)</p>
            <p className="text-muted-foreground">Cree manuellement par l&apos;<strong>acheteur</strong> depuis son mobile. Il correspond a une commande ponctuelle passee directement aupres d&apos;un fournisseur pour un ou plusieurs articles a la fois. Il est envoye par email et genere une reception.</p>
            <p className="text-muted-foreground">Accessible via: <strong>Achats &rarr; Bons d&apos;achat</strong></p>
          </div>
          <div className="bg-white rounded-xl border border-blue-200 p-3 flex flex-col gap-1.5">
            <p className="font-bold text-blue-700">PO Consolide Fournisseur (cree par le back-office)</p>
            <p className="text-muted-foreground">Genere <strong>automatiquement</strong> par le systeme a partir des besoins calcules (commandes clients validees - stock disponible), ou cree manuellement ici. Il regroupe les besoins de plusieurs articles par fournisseur en <strong>une seule commande</strong> officielle avec prix negocie, TVA, et signature electronique.</p>
            <p className="text-muted-foreground">Accessible via: <strong>Achats → PO Consolide Fournisseur</strong></p>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total PO", value: orders.length, sub: "bons de commande", color: "text-primary" },
          { label: "Ouverts", value: countOuvert, sub: "en attente", color: "text-amber-600" },
          { label: "Valeur filtrée", value: `${totalValeur.toLocaleString("fr-MA")} DH`, sub: "HT", color: "text-primary" },
          { label: "Articles", value: articles.length, sub: "références", color: "text-cyan-600" },
        ].map(k => (
          <div key={k.label} className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs text-muted-foreground font-sans mb-1">{k.label}</p>
            <p className={`text-2xl font-bold font-sans ${k.color}`}>{k.value}</p>
            <p className="text-xs text-muted-foreground font-sans mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* PO / DA Tabs */}
      <div className="flex gap-2 bg-muted p-1 rounded-xl self-start">
        {([
          { id: "po" as const, label: "PO Consolides", count: orders.length },
          { id: "da" as const, label: "Demandes d'Achat (DA)", count: demandesAchat.filter(d => d.statut === "ouverte" || d.statut === "en_cours").length },
        ]).map(t => (
          <button key={t.id} onClick={() => setPoTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${poTab === t.id ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {t.label}
            {t.count > 0 && (
              <span className={`w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center ${poTab === t.id ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20 text-muted-foreground"}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Auto-gen feedback */}
      {autoGenMsg && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-sm font-medium">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          {autoGenMsg}
        </div>
      )}

      {poTab === "po" && (
      <>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white font-sans transition-opacity hover:opacity-90"
          style={{ background: "oklch(0.38 0.2 260)" }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Nouveau PO
        </button>

        <button
          onClick={handleAutoGenPOs}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 font-sans transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          Auto-generer depuis besoin
        </button>

        <select
          value={filterStatut}
          onChange={e => setFilterStatut(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-border bg-card text-sm font-sans focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="tous">Tous les statuts</option>
          <option value="ouvert">Ouvert</option>
          <option value="envoyé">Envoyé</option>
          <option value="receptionné">Receptionné</option>
          <option value="annulé">Annulé</option>
        </select>

        <input
          placeholder="Rechercher article..."
          value={filterArticle}
          onChange={e => setFilterArticle(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-border bg-card text-sm font-sans focus:outline-none focus:ring-2 focus:ring-primary w-48"
        />

        <div className="flex gap-1 p-1 rounded-xl bg-muted/50">
          <button type="button" onClick={() => setSortMode("recent")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${sortMode === "recent" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground"}`}>
            Plus récent
          </button>
          <button type="button" onClick={() => setSortMode("alpha")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${sortMode === "alpha" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground"}`}>
            A → Z
          </button>
        </div>

        <div className="flex-1" />
        <p className="text-sm text-muted-foreground font-sans">{filtered.length} résultat(s)</p>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="bg-card rounded-2xl border border-border p-6 flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-foreground font-sans text-base">Nouveau Bon de Commande Fournisseur (PO)</h3>
            <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Article *</label>
              <ArticleCombobox
                articles={articles}
                value={fArticleId}
                onChange={(artId, artObj) => {
                  setFArticleId(artId)
                  if (artObj) setFPrix(artObj.prixAchat.toString())
                }}
                placeholder="Choisir un article"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fournisseur *</label>
              <select
                value={fFournisseurId}
                onChange={e => {
                  setFFournisseurId(e.target.value)
                  const f = fournisseurs.find(f => f.id === e.target.value)
                  if (f && f.email) setFEmailDest(f.email)
                }}
                className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-sans focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Choisir un fournisseur</option>
                {fournisseurs.map(f => (
                  <option key={f.id} value={f.id}>{f.nom}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quantité *</label>
              <input
                type="number"
                min="0"
                value={fQuantite}
                onChange={e => setFQuantite(e.target.value)}
                placeholder="0"
                className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-sans focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Prix unitaire (DH) *</label>
              <input
                type="number"
                min="0"
                value={fPrix}
                onChange={e => setFPrix(e.target.value)}
                placeholder="0"
                className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-sans focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email destinataire</label>
              <input
                type="email"
                value={fEmailDest}
                onChange={e => setFEmailDest(e.target.value)}
                  placeholder="Email fournisseur..."
                className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-sans focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes</label>
              <input
                type="text"
                value={fNotes}
                onChange={e => setFNotes(e.target.value)}
                placeholder="Observations, conditions..."
                className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-sans focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {/* Summary + Caissage preview */}
          {fArticleId && fFournisseurId && fQuantite && fPrix && (() => {
            const art = selectedArticle
            const colGros = art?.colisageCaisses ?? (art?.colisageParUM ?? 30)
            const colDemi = art?.colisageDemiCaisses ?? Math.round(colGros / 2)
            const isKg = art?.unite === "kg"
            const caisse = isKg ? calcCaisses(Number(fQuantite), colGros, colDemi) : null
            return (
              <div className="flex flex-col gap-3">
                {/* Montant */}
                <div className="rounded-xl p-4 flex items-center justify-between" style={{ background: "oklch(0.38 0.2 260 / 0.08)", border: "1px solid oklch(0.38 0.2 260 / 0.25)" }}>
                  <div>
                    <p className="text-sm font-semibold text-foreground font-sans">{art?.nom} × {fQuantite} {art?.unite}</p>
                    <p className="text-xs text-muted-foreground font-sans">{selectedFournisseur?.nom} — {fPrix} DH/unité</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground font-sans">Total HT</p>
                    <p className="text-xl font-bold font-sans" style={{ color: "oklch(0.38 0.2 260)" }}>{totalCalc.toLocaleString("fr-MA")} DH</p>
                    <p className="text-xs text-muted-foreground font-sans">TTC: {Math.round(totalCalc * 1.19).toLocaleString("fr-MA")} DH</p>
                  </div>
                </div>
                {/* Caissage auto */}
                {caisse && (
                  <div className="rounded-xl p-4 flex flex-col gap-3 bg-amber-50 border border-amber-200">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-amber-700 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                      <span className="text-sm font-bold text-amber-800">Caissage calcule automatiquement</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <div className="bg-white rounded-xl border border-amber-200 p-3 text-center">
                        <p className="text-xs text-muted-foreground">Gros caisses</p>
                        <p className="text-2xl font-black text-amber-800">{caisse.gros}</p>
                        <p className="text-[10px] text-muted-foreground">× {colGros} kg</p>
                      </div>
                      <div className="bg-white rounded-xl border border-cyan-200 p-3 text-center">
                        <p className="text-xs text-muted-foreground">Demi-caisses</p>
                        <p className="text-2xl font-black text-cyan-700">{caisse.demi}</p>
                        <p className="text-[10px] text-muted-foreground">× {colDemi} kg</p>
                      </div>
                      <div className="bg-white rounded-xl border border-border p-3 text-center">
                        <p className="text-xs text-muted-foreground">Total caisse</p>
                        <p className="text-2xl font-black text-foreground">{caisse.gros + caisse.demi}</p>
                        <p className="text-[10px] text-muted-foreground">caisses</p>
                      </div>
                      <div className="bg-white rounded-xl border border-border p-3 text-center">
                        <p className="text-xs text-muted-foreground">Kg total</p>
                        <p className="text-2xl font-black text-foreground">{caisse.totalKg}</p>
                        <p className="text-[10px] text-muted-foreground">{caisse.reste > 0 ? `+${caisse.reste.toFixed(1)}kg excédent` : "exact"}</p>
                      </div>
                    </div>
                    <p className="text-xs text-amber-700">
                      Logique : max gros caisses ({colGros}kg), reste en demi-caisses ({colDemi}kg).
                      {caisse.reste > 0 ? ` Arrondi superieur: +${caisse.reste.toFixed(1)}kg commandes en plus.` : " Quantite exacte couverte."}
                    </p>
                  </div>
                )}
              </div>
            )
          })()}

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2.5 rounded-xl border border-border text-sm font-medium font-sans hover:bg-muted transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleSubmit}
              disabled={poSubmitting || !fArticleId || !fFournisseurId || !fQuantite || !fPrix}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white font-sans transition-opacity hover:opacity-90 disabled:opacity-40 flex items-center gap-2"
              style={{ background: "oklch(0.38 0.2 260)" }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              {poSubmitting ? "Enregistrement..." : "Enregistrer & Envoyer par email"}
            </button>
          </div>
        </div>
      )}

      {/* PO Table */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-sans">
            <thead>
              <tr style={{ background: "oklch(0.14 0.03 260)", color: "oklch(0.88 0.015 245)" }}>
                {["N° PO", "Date", "Article", "Fournisseur", "Qté", "Caissage", "Prix unit.", "Total HT", "Statut", "Actions"].map(h => (
                  <th key={h} className={`text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap ${h === "Caissage" ? "bg-amber-900/30" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground font-sans">
                    Aucun bon de commande trouvé
                  </td>
                </tr>
              ) : filtered.map((po, i) => (
                <tr
                  key={po.id}
                  className="transition-colors"
                  style={{ borderTop: "1px solid oklch(0.87 0.012 240)", background: i % 2 === 0 ? "white" : "oklch(0.975 0.003 240)" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "oklch(0.38 0.2 260 / 0.04)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = i % 2 === 0 ? "white" : "oklch(0.975 0.003 240)"}
                >
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono font-semibold" style={{ color: "oklch(0.38 0.2 260)" }}>
                      {po.id.slice(0, 10).toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{po.date}</td>
                  <td className="px-4 py-3 font-semibold text-foreground">{po.articleNom}
                    <span className="ml-1 text-xs text-muted-foreground font-normal">({po.articleUnite})</span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{po.fournisseurNom}</td>
                  <td className="px-4 py-3 font-semibold text-foreground">
                    {po.quantite} <span className="text-xs font-normal text-muted-foreground">{po.articleUnite}</span>
                  </td>
                  {/* Caissage — calcul automatique */}
                  <td className="px-4 py-3 bg-amber-50/60">
                    {(() => {
                      const art = articles.find(a => a.id === po.articleId)
                      const colGros = art?.colisageCaisses ?? (art?.colisageParUM ?? 30)
                      const colDemi = art?.colisageDemiCaisses ?? Math.round(colGros / 2)
                      if (po.articleUnite !== "kg") return <span className="text-xs text-muted-foreground">N/A</span>
                      const c = calcCaisses(po.quantite, colGros, colDemi)
                      return (
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1 flex-wrap">
                            {c.gros > 0 && (
                              <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-800">
                                {c.gros}G×{colGros}kg
                              </span>
                            )}
                            {c.demi > 0 && (
                              <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-cyan-100 text-cyan-800">
                                {c.demi}D×{colDemi}kg
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground leading-tight">
                            {c.totalKg}kg chargé{c.reste > 0 ? ` / +${c.reste.toFixed(0)}kg excédent` : ""}
                          </p>
                        </div>
                      )
                    })()}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{po.prixUnitaire.toLocaleString("fr-MA")} DH</td>
                  <td className="px-4 py-3 font-bold" style={{ color: "oklch(0.38 0.2 260)" }}>
                    {po.total.toLocaleString("fr-MA")} DH
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUT_COLORS[po.statut]}`}>
                      {po.statut}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {/* Print */}
                      <button
                        onClick={() => printPO(po)}
                        title="Imprimer le PO"
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                      </button>
                      {/* Status actions */}
                      {po.statut === "ouvert" && (
                        <button
                          onClick={() => handleUpdateStatut(po.id, "envoyé")}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-cyan-100 text-cyan-800 hover:bg-cyan-200 transition-colors whitespace-nowrap"
                        >
                          Marquer envoyé
                        </button>
                      )}
                      {po.statut === "envoyé" && (
                        <button
                          onClick={() => handleUpdateStatut(po.id, "receptionné")}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-green-100 text-green-800 hover:bg-green-200 transition-colors whitespace-nowrap"
                        >
                          Marquer recu
                        </button>
                      )}
                      {(po.statut === "ouvert" || po.statut === "envoyé") && (
                        <button
                          onClick={() => handleUpdateStatut(po.id, "annulé")}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-100 text-red-800 hover:bg-red-200 transition-colors"
                        >
                          Annuler
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr style={{ background: "oklch(0.93 0.012 245)", borderTop: "2px solid oklch(0.87 0.012 240)" }}>
                  <td colSpan={7} className="px-4 py-3 text-sm font-bold text-foreground font-sans">
                    Total ({filtered.length} PO)
                  </td>
                  <td className="px-4 py-3 text-sm font-bold font-sans" style={{ color: "oklch(0.38 0.2 260)" }}>
                    {totalValeur.toLocaleString("fr-MA")} DH
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      </>
      )}

      {/* ── DA Tab ────────────────────────────────────────────────────────── */}
      {poTab === "da" && (
        <div className="flex flex-col gap-4">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col gap-2">
            <p className="text-sm font-bold text-amber-800">Demandes d&apos;Achat (DA)</p>
            <p className="text-xs text-amber-700 leading-relaxed">
              Une DA est <strong>generee automatiquement</strong> uniquement lorsque <strong>tous les acheteurs ont refuse un PO</strong> (ou si un seul acheteur existe et refuse).
              Elle signale un besoin non satisfait qui doit etre traite en urgence.
            </p>
          </div>
          {demandesAchat.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <svg className="w-12 h-12 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-sm font-semibold">Aucune DA generee</p>
              <p className="text-xs text-center max-w-xs">Les DAs apparaissent ici quand tous les acheteurs ont refuse un PO.</p>
            </div>
          ) : (
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm font-sans">
                  <thead>
                    <tr className="bg-amber-700 text-white">
                      {["N° DA", "Date", "Article", "Qte", "Fournisseur", "Statut", "Source PO", "Actions"].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {demandesAchat.map((da, i) => {
                      const STATUT_DA: Record<string, string> = {
                        ouverte: "bg-red-100 text-red-800",
                        en_cours: "bg-amber-100 text-amber-800",
                        traitee: "bg-green-100 text-green-800",
                        annulee: "bg-slate-100 text-slate-600",
                      }
                      return (
                        <tr key={da.id} className="border-t border-border hover:bg-muted/30 transition-colors"
                          style={{ background: i % 2 === 0 ? "white" : "oklch(0.975 0.003 240)" }}>
                          <td className="px-4 py-3">
                            <span className="text-xs font-mono font-bold text-amber-700">
                              DA-{da.id.slice(-6).toUpperCase()}
                            </span>
                            {da.statut === "ouverte" && (
                              <span className="block text-[9px] font-bold text-red-600 mt-0.5">URGENT</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{da.date}</td>
                          <td className="px-4 py-3">
                            <span className="font-semibold text-sm">{da.articleNom}</span>
                            <span className="block text-[10px] text-muted-foreground">{da.articleUnite}</span>
                          </td>
                          <td className="px-4 py-3 font-bold text-sm">{da.quantite.toLocaleString("fr-MA")} {da.articleUnite}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{da.fournisseurNom ?? "—"}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${STATUT_DA[da.statut] ?? "bg-slate-100 text-slate-600"}`}>
                              {da.statut.charAt(0).toUpperCase() + da.statut.slice(1)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs font-mono text-muted-foreground">{da.poId.slice(0, 8).toUpperCase()}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              {da.statut === "ouverte" && (
                                <button onClick={() => { store.updateDemandeAchat(da.id, { statut: "en_cours", assigneNom: "Back Office" }); refresh() }}
                                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors whitespace-nowrap">
                                  Prendre en charge
                                </button>
                              )}
                              {da.statut === "en_cours" && (
                                <button onClick={() => { store.updateDemandeAchat(da.id, { statut: "traitee", traiteeAt: new Date().toISOString() }); refresh() }}
                                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-green-100 text-green-800 hover:bg-green-200 transition-colors whitespace-nowrap">
                                  Marquer traitee
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
