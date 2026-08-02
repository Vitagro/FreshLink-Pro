// ============================================================
// FRESHLINK PRO — DOCUMENT ENGINE v2  (International Grade)
// BL · Facture · Bon de Commande · Facture Transport
// RH: Contrat · Bulletins · Attestations · Disciplinaire · Rupture
// Droit marocain — Code du Travail Loi 65-99 — CNSS 2024
// ============================================================

import type { BonLivraison, PurchaseOrder, Salarie } from "@/lib/store"
import { store } from "@/lib/store"

// ── Brand Config ──────────────────────────────────────────────────────────────
export interface CompanyConfig {
  nom: string
  adresse?: string
  ville?: string
  telephone?: string
  email?: string
  ice?: string
  rc?: string
  if_fiscal?: string
  patente?: string
  logo?: string
  couleurEntete?: string
  mentionsBL?: string
  mentionsFacture?: string
  logoFondBL?: string
  logoFondBLActif?: boolean
}

// ── HR Doc Data ───────────────────────────────────────────────────────────────
export interface HRDocData {
  docType: string
  titre?: string
  contenu?: string
  employe?: string
  poste?: string
  dateDoc?: string
  societe?: string
  salaire?: number
  salaireNet?: number
  periode?: string
  heuresSup?: number
  primes?: number
  modePaie?: string
  cin?: string
  cnss?: string
  employeNom?: string
  employeRole?: string
  employeEmail?: string
  employePhone?: string
  societeNom?: string
  societeAdresse?: string
  societeTel?: string
  societeIce?: string
  societeRC?: string
  societeIF?: string
  societeLogo?: string
  societeVille?: string
  societePiedPage?: string
  salaireBrut?: number
  netAPayer?: number
  cnssRetenue?: number
  amoRetenue?: number
  irRetenue?: number
  amo?: number
  ir?: number
  modePaie2?: string
  datePaie?: string
  ville?: string
  motif?: string
  civilite?: string
  employeMatricule?: string
  dateEmbauche?: string
}

// ── Payroll calculations — Droit marocain 2026 (CNSS + AMO + IR) ──────────────
// Meme bareme que BOHRDocuments.tsx (seule source jusqu'ici, dupliquee ici avec
// des taux 2024 perimes — CNSS 4.48%/AMO 2.26% au lieu de 6.74%/4.52% — un
// meme salaire brut donnait un net different selon l'ecran d'origine).
export function calcPayroll(brut: number, avances = 0) {
  // CNSS salariale : 6.74% plafonnee a 6 000 DH/mois de brut
  const cnss    = Math.min(brut, 6000) * 0.0674
  // AMO (CNOPS) : 4.52% sans plafond
  const amo     = brut * 0.0452
  // Base IR = Brut - CNSS - AMO - Abattement forfaitaire 20% plafonne 2500 DH/mois
  const brutIR  = brut - cnss - amo
  const abat    = Math.min(brut * 0.20, 2500)
  const baseIR  = Math.max(0, brutIR - abat)
  // Barème IR mensuel 2026
  let ir = 0
  if      (baseIR <= 2500)  ir = 0
  else if (baseIR <= 4166)  ir = baseIR * 0.10 - 250.00
  else if (baseIR <= 5000)  ir = baseIR * 0.20 - 666.60
  else if (baseIR <= 6666)  ir = baseIR * 0.30 - 1166.60
  else if (baseIR <= 15000) ir = baseIR * 0.34 - 1433.24
  else                      ir = baseIR * 0.38 - 2033.24
  ir = Math.max(0, ir)
  const totalRetenues = cnss + amo + ir + avances
  const net = Math.max(0, brut - cnss - amo - ir - avances)
  return { cnss, amo, ir, totalRetenues, net, brutIR, baseIR }
}

// ── Company default ───────────────────────────────────────────────────────────
export const vita_fresh_CONFIG: CompanyConfig = {
  nom:           "Vita Fresh",
  adresse:       "Zone Industrielle, Lot 42, Route d'Ouled Salah",
  ville:         "Casablanca 20000 — Maroc",
  telephone:     "+212 5XX-XXXXXX",
  email:         "contact@vita-fresh.co.site",
  ice:           "000000000000000",
  rc:            "XXXXXX",
  if_fiscal:     "XXXXXXXX",
  patente:       "XXXXXXXX",
  logo:          "/vita-fresh-logo.png",
  couleurEntete: "#1a4f2a",
  mentionsBL:    "Marchandises voyageant aux risques et périls du destinataire. Tout litige doit être signalé dans les 48h. Vita Fresh — Distribution Fruits & Légumes, Casablanca.",
  mentionsFacture: "Règlement à 30 jours date facture. Tout retard entraîne des pénalités de 1,5% par mois. ICE inclus sur la présente facture conformément à la loi 24-09.",
}

// ─────────────────────────────────────────────────────────────────────────────
//  SHARED CSS ENGINE
// ─────────────────────────────────────────────────────────────────────────────
const FONT = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');`

function baseCss(accent: string, gold = "#b8962e") {
  return `
${FONT}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter','Helvetica Neue',Arial,sans-serif;color:#0f172a;background:#fff;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:12px}
@page{margin:12mm;size:A4}
@media print{body{-webkit-print-color-adjust:exact}
  .no-print{display:none!important}}

/* ─── Header stripe ─── */
.stripe{height:5px;background:linear-gradient(90deg,${accent},${gold});border-radius:0}

/* ─── Letterhead ─── */
.lh{display:flex;align-items:flex-start;justify-content:space-between;
  padding:20px 0 16px;border-bottom:3px solid ${accent};margin-bottom:20px}
.lh-brand{display:flex;align-items:center;gap:12px}
.lh-logo{width:84px;height:84px;object-fit:contain}
.lh-co{display:flex;flex-direction:column;gap:2px}
.lh-tag{font-size:8px;font-weight:800;color:${gold};letter-spacing:1.8px;text-transform:uppercase;margin-top:2px}
.lh-meta{font-size:9.5px;color:#475569;line-height:1.65;margin-top:3px}
.lh-doc{text-align:right}
.lh-title{font-size:24px;font-weight:900;color:#0f172a;text-transform:uppercase;letter-spacing:-0.5px}
.lh-accent{width:36px;height:4px;background:${gold};margin:5px 0 5px auto;border-radius:2px}
.lh-num{font-size:13px;font-weight:800;color:${accent}}
.lh-date{font-size:10px;color:#64748b;margin-top:2px}

/* ─── Info cards ─── */
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px}
.info-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px}
.ic-title{font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:1.2px;color:#94a3b8;margin-bottom:5px}
.ic-val{font-size:12px;font-weight:700;color:#0f172a;line-height:1.3}
.ic-sub{font-size:10px;color:#64748b;margin-top:2px;line-height:1.5}

/* ─── Table ─── */
table{width:100%;border-collapse:collapse;margin-bottom:16px}
thead tr{background:${accent}}
thead th{padding:9px 11px;text-align:left;font-size:9.5px;font-weight:800;
  text-transform:uppercase;letter-spacing:0.5px;color:#fff}
th.r,td.r{text-align:right}
tbody tr{border-bottom:1px solid #f1f5f9}
tbody tr:nth-child(even){background:#fafbfc}
tbody td{padding:8px 11px;font-size:11px;color:#1e293b}
td.bold{font-weight:700}
tr.subtotal{background:#f0fdf4!important}
tr.subtotal td{font-weight:800;color:#15803d}

/* ─── Totals block ─── */
.totals{display:flex;justify-content:flex-end;margin-bottom:18px}
.totals-inner{width:290px}
.tot-row{display:flex;justify-content:space-between;padding:5px 0;
  border-bottom:1px solid #f1f5f9;font-size:11px}
.tot-row .lbl{color:#64748b;font-weight:500}
.tot-row .val{font-weight:700;color:#0f172a}
.tot-final{padding:10px 0;border-top:2.5px solid ${accent};border-bottom:none}
.tot-final .lbl{font-size:13px;font-weight:900;color:#0f172a}
.tot-final .val{font-size:16px;font-weight:900;color:${accent}}

/* ─── NET block (payslip) ─── */
.net-block{background:${accent};color:#fff;border-radius:12px;
  padding:16px 20px;display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
.net-lbl{font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:0.5px}
.net-sub{font-size:9px;opacity:0.8;margin-top:2px}
.net-amt{font-size:26px;font-weight:900}

/* ─── Signature ─── */
.sig-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;
  margin-top:28px;border-top:1px solid #e2e8f0;padding-top:18px}
.sig-box{text-align:center}
.sig-lbl{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;color:#94a3b8;margin-bottom:42px}
.sig-line{border-top:1px dashed #cbd5e1;padding-top:5px;font-size:10px;color:#475569;font-weight:600}
.stamp{width:90px;height:90px;border:2px dashed #cbd5e1;border-radius:50%;
  display:flex;align-items:center;justify-content:center;margin:0 auto 8px;
  font-size:8px;color:#cbd5e1;font-weight:800;text-align:center;text-transform:uppercase}

/* ─── Badges ─── */
.badge{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;
  border-radius:20px;font-size:9.5px;font-weight:800;letter-spacing:0.3px}
.b-green{background:#dcfce7;color:#15803d}
.b-blue{background:#dbeafe;color:#1d4ed8}
.b-amber{background:#fef3c7;color:#b45309}
.b-red{background:#fee2e2;color:#b91c1c}
.b-gray{background:#f1f5f9;color:#475569}

/* ─── Mentions ─── */
.mentions{margin-top:18px;font-size:8.5px;color:#94a3b8;
  border-top:1px solid #f1f5f9;padding-top:10px;text-align:center;line-height:1.6}
.confidential{text-align:center;margin-top:20px;font-size:8px;color:#cbd5e1;
  font-weight:800;text-transform:uppercase;letter-spacing:2px}

/* ─── Alert/notice boxes ─── */
.notice{border-left:4px solid ${accent};background:${accent}0a;padding:10px 14px;
  border-radius:0 8px 8px 0;margin-bottom:14px;font-size:11px;color:#1e293b}
.notice strong{color:${accent}}
.notice-red{border-left-color:#dc2626;background:#fef2f2}
.notice-amber{border-left-color:#d97706;background:#fffbeb}

/* ─── Employee info box ─── */
.emp-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:13px 16px;margin:14px 0}
.emp-row{display:flex;gap:8px;font-size:11px;margin-bottom:3px}
.emp-lbl{font-weight:700;min-width:145px;color:#64748b}
.emp-val{color:#0f172a;font-weight:500}

/* ─── HR body text ─── */
.hr-body{font-size:12px;line-height:2;color:#1e293b;text-align:justify}
.hr-art{font-weight:800;color:${accent};font-size:11.5px;
  text-transform:uppercase;letter-spacing:0.5px;margin:16px 0 4px}
.hr-subject{font-size:13px;font-weight:800;color:${accent};
  padding:10px 14px;border-left:4px solid ${accent};background:${accent}0a;
  border-radius:0 8px 8px 0;margin-bottom:18px}
`
}

// Bouton "Retour" injecté en tête de chaque document imprimable — ces documents
// s'ouvrent dans une fenêtre/onglet séparé sans aucun chrome d'appli (pas de
// barre de nav), donc sans ce bouton l'utilisateur (surtout sur mobile) n'a
// aucun moyen de revenir à l'écran précédent une fois la boîte d'impression
// fermée. Masqué à l'impression via .no-print (déjà défini dans baseCss).
const BACK_BUTTON_HTML = `<button class="no-print" onclick="window.close()" style="display:flex;align-items:center;gap:6px;margin:0 0 14px;padding:9px 16px;border-radius:10px;border:none;background:#1a4f2a;color:#fff;font-family:Inter,Arial,sans-serif;font-size:13px;font-weight:700;cursor:pointer">← Retour</button>`

function open(html: string, w = 850, h = 1150) {
  if (typeof window === "undefined") return
  const win = window.open("", "_blank", `width=${w},height=${h}`)
  if (win) {
    const withBack = html.replace("<body>", `<body>${BACK_BUTTON_HTML}`)
    win.document.write(withBack)
    win.document.close()
  }
}
function dl(html: string, filename: string) {
  if (typeof window === "undefined") return
  const blob = new Blob([html], { type: "text/html;charset=utf-8" })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement("a")
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}
function fmtDH(n: number) {
  return n.toLocaleString("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " DH"
}
function fmtDate(d?: string) {
  if (!d) return new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
  try { return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }) } catch { return d }
}
// Filigrane (logo d'arrière-plan) sur le BL — s'affiche derrière le contenu, sur chaque page imprimée
function watermarkHtml(cfg: { logoFondBL?: string; logoFondBLActif?: boolean }) {
  if (!cfg.logoFondBLActif || !cfg.logoFondBL) return ""
  return `<img src="${cfg.logoFondBL}" onerror="this.style.display='none'" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:60%;height:60%;opacity:0.12;z-index:0;pointer-events:none;object-fit:contain;-webkit-print-color-adjust:exact;print-color-adjust:exact"/>`
}

// ─────────────────────────────────────────────────────────────────────────────
//  BON DE LIVRAISON  (international grade)
// ─────────────────────────────────────────────────────────────────────────────
export function printBL(bl: BonLivraison, company?: CompanyConfig) {
  const cfg    = { ...vita_fresh_CONFIG, ...company }
  const accent = cfg.couleurEntete ?? "#1a4f2a"
  const gold   = "#b8962e"
  const blId   = (bl as unknown as { numero?: string }).numero ?? bl.id
  const dateStr = fmtDate(bl.date)
  const subtotal = bl.lignes.reduce((s, l) => s + l.total, 0)
  const caisses  = bl.montantCaisses ?? 0
  const totalTTC = bl.montantTTC + caisses

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>
<title>BL ${blId}</title>
<style>${baseCss(accent, gold)}</style></head><body>
${watermarkHtml(cfg)}
<div style="max-width:794px;margin:0 auto;padding:24px 28px;position:relative;z-index:1">
<div class="stripe"></div>
<div class="lh">
  <div class="lh-brand">
    <img src="${cfg.logo}" class="lh-logo" onerror="this.style.display='none'" alt="${cfg.nom}"/>
    <div class="lh-co">
      <div class="lh-tag">Fruits &amp; Légumes — Distribution Maroc</div>
      <div class="lh-meta">${cfg.adresse}<br>${cfg.ville}<br>Tél: ${cfg.telephone} — Email: ${cfg.email}<br>ICE: ${cfg.ice} — IF: ${cfg.if_fiscal} — RC: ${cfg.rc}</div>
    </div>
  </div>
  <div class="lh-doc">
    <div class="lh-title">Bon de Livraison</div>
    <div class="lh-accent"></div>
    <div class="lh-num">${blId}</div>
    <div class="lh-date">${dateStr}</div>
    ${(() => {
      const ids = bl.commandeIds?.length ? bl.commandeIds : (bl.commandeId ? [bl.commandeId] : [])
      if (!ids.length) return ""
      return `<div style="margin-top:4px;font-size:10px;font-weight:700;color:${accent}">Commande${ids.length > 1 ? "s" : ""} d'origine : ${ids.join(", ")}</div>`
    })()}
    <div style="margin-top:8px"><span class="badge b-green">LIVRÉ</span></div>
  </div>
</div>
<div class="info-grid">
  <div class="info-card">
    <div class="ic-title">Client / Destinataire</div>
    <div class="ic-val">${(bl as unknown as { clientNom?: string }).clientNom ?? "—"}</div>
    <div class="ic-sub">${(bl as unknown as { clientAdresse?: string }).clientAdresse ?? ""}</div>
  </div>
  <div class="info-card">
    <div class="ic-title">Informations expédition</div>
    <div class="ic-val">${cfg.nom}</div>
    <div class="ic-sub">Date livraison: ${dateStr}</div>
    <div class="ic-sub">Livreur: ${(bl as unknown as { livreurNom?: string }).livreurNom ?? "—"}</div>
  </div>
</div>
<table>
  <thead><tr>
    <th style="width:38%">Désignation</th><th>Unité</th>
    <th class="r">Qté livrée</th><th class="r">Prix U. HT</th><th class="r">Total HT</th>
  </tr></thead>
  <tbody>
  ${bl.lignes.map(l => `<tr><td class="bold">${l.articleNom}</td><td>${l.unite ?? "kg"}</td>
    <td class="r">${(l as any).qteLivree ?? (l as unknown as {quantite?:number}).quantite ?? 0}</td>
    <td class="r">${fmtDH((l as any).prixUnit ?? (l as any).prixUnitaire ?? 0)}</td>
    <td class="r bold">${fmtDH(l.total)}</td></tr>`).join("")}
  <tr class="subtotal"><td colspan="4" class="r">Sous-total HT</td><td class="r">${fmtDH(subtotal)}</td></tr>
  ${caisses > 0 ? `<tr><td colspan="4" class="r">Caisses / Emballages</td><td class="r">${fmtDH(caisses)}</td></tr>` : ""}
  </tbody>
</table>
<div class="totals"><div class="totals-inner">
  <div class="tot-row"><span class="lbl">Total HT</span><span class="val">${fmtDH(subtotal)}</span></div>
  <div class="tot-row"><span class="lbl">TVA (0% — Exonéré)</span><span class="val">0.00 DH</span></div>
  <div class="tot-row tot-final"><span class="lbl">TOTAL TTC</span><span class="val">${fmtDH(totalTTC)}</span></div>
</div></div>
<div class="sig-grid">
  <div class="sig-box"><div class="sig-lbl">Signature Livreur</div><div class="sig-line">${(bl as unknown as {livreurNom?:string}).livreurNom ?? cfg.nom}</div></div>
  <div class="sig-box"><div class="sig-lbl">Signature Client &amp; Cachet</div><div class="sig-line">${(bl as unknown as {clientNom?:string}).clientNom ?? "—"}</div></div>
</div>
<div class="mentions">${cfg.mentionsBL}</div>
</div><script>window.onload=()=>{window.print()}</script></body></html>`
  open(html)
}

// ─────────────────────────────────────────────────────────────────────────────
//  FACTURE COMMERCIALE (niveau DHL / grands distributeurs)
// ─────────────────────────────────────────────────────────────────────────────
export function printFacture(bl: BonLivraison, factureNum: string, company?: CompanyConfig) {
  const cfg    = { ...vita_fresh_CONFIG, ...company }
  const accent = cfg.couleurEntete ?? "#1a4f2a"
  const gold   = "#b8962e"
  const dateStr = fmtDate(bl.date)
  const echeance = new Date(bl.date ?? Date.now())
  echeance.setDate(echeance.getDate() + 30)
  const subtotal = bl.lignes.reduce((s, l) => s + l.total, 0)
  const caisses  = bl.montantCaisses ?? 0
  const totalTTC = bl.montantTTC + caisses

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>
<title>Facture ${factureNum}</title>
<style>${baseCss(accent, gold)}
.facture-band{background:${accent};color:#fff;padding:10px 28px;display:flex;justify-content:space-between;align-items:center;margin:-24px -28px 20px}
.fb-title{font-size:22px;font-weight:900;text-transform:uppercase;letter-spacing:1px}
.fb-num{font-size:13px;font-weight:700;opacity:0.85}
</style></head><body>
<div style="max-width:794px;margin:0 auto;padding:24px 28px">
<div class="facture-band">
  <div><div class="fb-title">Facture</div><div class="fb-num">${factureNum}</div></div>
  <div style="text-align:right;font-size:10px;opacity:0.85">${dateStr}<br>Échéance: ${echeance.toLocaleDateString("fr-FR",{day:"2-digit",month:"long",year:"numeric"})}</div>
</div>
<div class="lh" style="border-bottom-width:2px">
  <div class="lh-brand">
    <img src="${cfg.logo}" class="lh-logo" onerror="this.style.display='none'" alt="${cfg.nom}"/>
    <div class="lh-co">
      <div class="lh-tag">Fruits &amp; Légumes — Distribution Maroc</div>
      <div class="lh-meta">${cfg.adresse}<br>${cfg.ville}<br>Tél: ${cfg.telephone}<br>ICE: ${cfg.ice} — IF: ${cfg.if_fiscal} — RC: ${cfg.rc}</div>
    </div>
  </div>
  <div class="lh-doc">
    <div style="font-size:11px;color:#64748b;margin-bottom:4px">Facturé à</div>
    <div style="font-size:14px;font-weight:900;color:#0f172a">${(bl as unknown as {clientNom?:string}).clientNom ?? "—"}</div>
    <div style="font-size:10px;color:#64748b;margin-top:4px">${(bl as unknown as {clientAdresse?:string}).clientAdresse ?? ""}</div>
    ${(bl as unknown as {clientIce?:string}).clientIce ? `<div style="font-size:10px;color:#64748b">ICE: ${(bl as unknown as {clientIce?:string}).clientIce}</div>` : ""}
  </div>
</div>
<table>
  <thead><tr>
    <th style="width:38%">Désignation</th><th>Unité</th>
    <th class="r">Quantité</th><th class="r">Prix U. HT</th><th class="r">Total HT</th>
  </tr></thead>
  <tbody>
  ${bl.lignes.map((l, i) => `<tr><td><strong>${l.articleNom}</strong></td><td>${l.unite ?? "kg"}</td>
    <td class="r">${(l as any).qteLivree ?? (l as unknown as {quantite?:number}).quantite ?? 0}</td>
    <td class="r">${fmtDH((l as any).prixUnit ?? (l as any).prixUnitaire ?? 0)}</td>
    <td class="r bold">${fmtDH(l.total)}</td></tr>`).join("")}
  ${caisses > 0 ? `<tr><td>Emballages / Caisses</td><td>—</td><td class="r">1</td><td class="r">${fmtDH(caisses)}</td><td class="r bold">${fmtDH(caisses)}</td></tr>` : ""}
  </tbody>
</table>
<div class="totals"><div class="totals-inner">
  <div class="tot-row"><span class="lbl">Sous-total HT</span><span class="val">${fmtDH(subtotal + caisses)}</span></div>
  <div class="tot-row"><span class="lbl">TVA (0% — Produits alimentaires exonérés)</span><span class="val">0,00 DH</span></div>
  <div class="tot-row"><span class="lbl">Remise / Avoir</span><span class="val">0,00 DH</span></div>
  <div class="tot-row tot-final"><span class="lbl">TOTAL TTC</span><span class="val">${fmtDH(totalTTC)}</span></div>
</div></div>
<div class="notice"><strong>Conditions de règlement:</strong> 30 jours date facture. Mode: ${(bl as unknown as {modalitePaiement?:string}).modalitePaiement ?? "Virement / Chèque"}. Réf BL: ${(bl as unknown as {numero?:string}).numero ?? bl.id}</div>
<div class="sig-grid">
  <div class="sig-box"><div class="sig-lbl">Émis par</div><div class="stamp">CACHET<br>&amp;<br>SIGN.</div><div class="sig-line">${cfg.nom}</div></div>
  <div class="sig-box"><div class="sig-lbl">Bon pour accord client</div><div style="height:90px;border:1px dashed #e2e8f0;border-radius:8px;margin-bottom:8px"></div><div class="sig-line">${(bl as unknown as {clientNom?:string}).clientNom ?? "—"}</div></div>
</div>
<div class="mentions">${cfg.mentionsFacture}<br><strong>Conformément à la loi 24-09 portant sur la facturation électronique au Maroc.</strong></div>
</div><script>window.onload=()=>{window.print()}</script></body></html>`
  open(html)
}

// ─────────────────────────────────────────────────────────────────────────────
//  BON DE COMMANDE  (Purchase Order — international)
// ─────────────────────────────────────────────────────────────────────────────
export function printPurchaseOrder(po: PurchaseOrder, company?: CompanyConfig) {
  const cfg    = { ...vita_fresh_CONFIG, ...company }
  const accent = cfg.couleurEntete ?? "#1a4f2a"
  const gold   = "#b8962e"
  const dateStr = fmtDate(po.date)
  const validite = new Date(po.date ?? Date.now())
  validite.setDate(validite.getDate() + 2)

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>
<title>PO ${po.id.slice(0,8).toUpperCase()}</title>
<style>${baseCss(accent, gold)}</style></head><body>
<div style="max-width:794px;margin:0 auto;padding:24px 28px">
<div class="stripe"></div>
<div class="lh">
  <div class="lh-brand">
    <img src="${cfg.logo}" class="lh-logo" onerror="this.style.display='none'" alt="${cfg.nom}"/>
    <div class="lh-co">
      <div class="lh-tag">Acheteur — Fruits &amp; Légumes</div>
      <div class="lh-meta">${cfg.adresse}<br>${cfg.ville}<br>ICE: ${cfg.ice} — IF: ${cfg.if_fiscal} — RC: ${cfg.rc}</div>
    </div>
  </div>
  <div class="lh-doc">
    <div class="lh-title">Bon de Commande</div>
    <div class="lh-accent"></div>
    <div class="lh-num">PO-${po.id.slice(0,8).toUpperCase()}</div>
    <div class="lh-date">${dateStr}</div>
    <div style="margin-top:6px"><span class="badge b-blue">EN COURS</span></div>
  </div>
</div>
<div class="info-grid">
  <div class="info-card">
    <div class="ic-title">Fournisseur</div>
    <div class="ic-val">${po.fournisseurNom}</div>
    <div class="ic-sub">${po.fournisseurEmail ?? ""}</div>
    <div class="ic-sub">Dépôt livraison: ${po.depotNom ?? cfg.adresse}</div>
  </div>
  <div class="info-card">
    <div class="ic-title">Acheteur</div>
    <div class="ic-val">${cfg.nom}</div>
    <div class="ic-sub">Réf: PO-${po.id.slice(0,8).toUpperCase()}</div>
    <div class="ic-sub">Validité: ${validite.toLocaleDateString("fr-FR")} (48h)</div>
  </div>
</div>
<div class="notice"><strong>Conditions de livraison:</strong> Produits frais conformes aux normes sanitaires ONSSA. Calibre et maturité selon spécifications. Refus systématique en cas de non-conformité.</div>
<table>
  <thead><tr>
    <th style="width:38%">Désignation</th><th>Unité</th>
    <th class="r">Qté commandée</th><th class="r">Prix U. HT</th><th class="r">Total HT</th>
  </tr></thead>
  <tbody>
  <tr><td class="bold">${po.articleNom}</td><td>${po.articleUnite}</td>
    <td class="r bold">${po.quantite.toLocaleString("fr-MA")}</td>
    <td class="r">${fmtDH(po.prixUnitaire)}</td>
    <td class="r bold">${fmtDH(po.total)}</td></tr>
  </tbody>
</table>
<div class="totals"><div class="totals-inner">
  <div class="tot-row"><span class="lbl">Total HT</span><span class="val">${fmtDH(po.total)}</span></div>
  <div class="tot-row tot-final"><span class="lbl">TOTAL À RÉGLER</span><span class="val">${fmtDH(po.total)}</span></div>
</div></div>
${po.notes ? `<div class="notice notice-amber"><strong>Notes acheteur:</strong> ${po.notes}</div>` : ""}
<div class="sig-grid">
  <div class="sig-box"><div class="sig-lbl">Approuvé par (Acheteur)</div><div class="stamp">CACHET<br>&amp;<br>SIGN.</div><div class="sig-line">${cfg.nom}</div></div>
  <div class="sig-box"><div class="sig-lbl">Confirmé par (Fournisseur)</div><div style="height:90px;border:1px dashed #e2e8f0;border-radius:8px;margin-bottom:8px"></div><div class="sig-line">${po.fournisseurNom}</div></div>
</div>
<div class="mentions">Bon de commande généré automatiquement — Valable 48h — ${cfg.nom} se réserve le droit de refuser tout produit non conforme aux spécifications.</div>
</div><script>window.onload=()=>{window.print()}</script></body></html>`
  open(html)
}
export const printPO = printPurchaseOrder

// ─────────────────────────────────────────────────────────────────────────────
//  FACTURE DE TRANSPORT  (nouvelle — niveau international)
// ─────────────────────────────────────────────────────────────────────────────
export interface FactureTransportData {
  numero:          string
  date?:           string
  transporteur:    string
  transporteurIce?: string
  transporteurRc?:  string
  transporteurTel?: string
  vehicule?:       string
  chauffeur?:      string
  trajet:          string
  depart:          string
  destination:     string
  dateDepart?:     string
  dateArrivee?:    string
  marchandise:     string
  poids?:          number
  unite?:          string
  lignes:          { designation: string; qte: number; prixUnit: number; total: number }[]
  totalHT:         number
  tva?:            number
  totalTTC:        number
  modalitePaiement?: string
  notes?:          string
}

export function printFactureTransport(data: FactureTransportData, company?: CompanyConfig) {
  const cfg    = { ...vita_fresh_CONFIG, ...company }
  const accent = "#1a4f2a"
  const gold   = "#b8962e"
  const dateStr = fmtDate(data.date)
  const tva     = data.tva ?? 0
  const montantTVA = data.totalHT * (tva / 100)

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>
<title>Facture Transport ${data.numero}</title>
<style>${baseCss(accent, gold)}
.transport-band{display:flex;align-items:center;gap:8px;background:#0f172a;
  color:#fff;padding:10px 20px;border-radius:8px;margin-bottom:18px}
.tb-icon{font-size:20px}
.tb-title{font-size:16px;font-weight:900;letter-spacing:0.5px}
.tb-sub{font-size:9px;color:#94a3b8;letter-spacing:1px;text-transform:uppercase}
.route-card{display:flex;align-items:center;gap:0;margin-bottom:16px;
  border:1px solid #e2e8f0;border-radius:10px;overflow:hidden}
.route-pt{flex:1;padding:12px 16px;background:#f8fafc}
.route-pt-title{font-size:8px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px}
.route-pt-val{font-size:13px;font-weight:800;color:#0f172a}
.route-pt-sub{font-size:10px;color:#64748b;margin-top:1px}
.route-arrow{padding:0 16px;font-size:20px;color:${accent};font-weight:900;background:#fff;
  border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0}
</style></head><body>
<div style="max-width:794px;margin:0 auto;padding:24px 28px">
<div class="stripe"></div>
<div class="lh">
  <div class="lh-brand">
    <img src="${cfg.logo}" class="lh-logo" onerror="this.style.display='none'" alt="${cfg.nom}"/>
    <div class="lh-co">
      <div class="lh-tag">Donneur d'ordre — Transport &amp; Logistique</div>
      <div class="lh-meta">${cfg.adresse} — ${cfg.ville}<br>ICE: ${cfg.ice} — RC: ${cfg.rc}</div>
    </div>
  </div>
  <div class="lh-doc">
    <div class="lh-title">Facture Transport</div>
    <div class="lh-accent"></div>
    <div class="lh-num">FT-${data.numero}</div>
    <div class="lh-date">${dateStr}</div>
  </div>
</div>
<div class="transport-band">
  <div class="tb-icon">🚛</div>
  <div><div class="tb-title">Transporteur: ${data.transporteur}</div>
  <div class="tb-sub">${data.transporteurIce ? "ICE: "+data.transporteurIce+" — " : ""}${data.transporteurRc ? "RC: "+data.transporteurRc : ""}${data.transporteurTel ? " — Tél: "+data.transporteurTel : ""}</div></div>
</div>
<div class="info-grid">
  <div class="info-card">
    <div class="ic-title">Véhicule &amp; Chauffeur</div>
    <div class="ic-val">${data.vehicule ?? "—"}</div>
    <div class="ic-sub">Chauffeur: ${data.chauffeur ?? "—"}</div>
    <div class="ic-sub">Marchandise: ${data.marchandise}${data.poids ? " — "+data.poids+" "+(data.unite??"kg") : ""}</div>
  </div>
  <div class="info-card">
    <div class="ic-title">Dates de transport</div>
    <div class="ic-val">${data.dateDepart ? fmtDate(data.dateDepart) : dateStr}</div>
    <div class="ic-sub">Arrivée: ${data.dateArrivee ? fmtDate(data.dateArrivee) : "—"}</div>
    <div class="ic-sub">Trajet: ${data.trajet}</div>
  </div>
</div>
<div class="route-card">
  <div class="route-pt">
    <div class="route-pt-title">Départ</div>
    <div class="route-pt-val">${data.depart}</div>
    ${data.dateDepart ? `<div class="route-pt-sub">${fmtDate(data.dateDepart)}</div>` : ""}
  </div>
  <div class="route-arrow">→</div>
  <div class="route-pt">
    <div class="route-pt-title">Destination</div>
    <div class="route-pt-val">${data.destination}</div>
    ${data.dateArrivee ? `<div class="route-pt-sub">${fmtDate(data.dateArrivee)}</div>` : ""}
  </div>
</div>
<table>
  <thead><tr>
    <th style="width:45%">Prestation</th><th class="r">Qté / Km</th>
    <th class="r">Prix U. HT</th><th class="r">Total HT</th>
  </tr></thead>
  <tbody>
  ${data.lignes.map(l => `<tr><td class="bold">${l.designation}</td>
    <td class="r">${l.qte}</td><td class="r">${fmtDH(l.prixUnit)}</td>
    <td class="r bold">${fmtDH(l.total)}</td></tr>`).join("")}
  </tbody>
</table>
<div class="totals"><div class="totals-inner">
  <div class="tot-row"><span class="lbl">Total HT</span><span class="val">${fmtDH(data.totalHT)}</span></div>
  <div class="tot-row"><span class="lbl">TVA (${tva}%)</span><span class="val">${fmtDH(montantTVA)}</span></div>
  <div class="tot-row tot-final"><span class="lbl">TOTAL TTC</span><span class="val">${fmtDH(data.totalTTC)}</span></div>
</div></div>
${data.notes ? `<div class="notice notice-amber"><strong>Observations:</strong> ${data.notes}</div>` : ""}
<div class="sig-grid">
  <div class="sig-box"><div class="sig-lbl">Transporteur — Cachet &amp; Signature</div><div class="stamp">CACHET<br>TRANSPORT</div><div class="sig-line">${data.transporteur}</div></div>
  <div class="sig-box"><div class="sig-lbl">Donneur d'ordre — Bon pour paiement</div><div class="stamp">CACHET<br>SOCIÉTÉ</div><div class="sig-line">${cfg.nom}</div></div>
</div>
<div class="mentions">Facture transport soumise aux dispositions du Dahir n° 1-63-260 du 12 novembre 1963 relatif aux transports routiers de marchandises au Maroc. Modalité: ${data.modalitePaiement ?? "Virement bancaire"}</div>
</div><script>window.onload=()=>{window.print()}</script></body></html>`
  open(html)
}

// ─────────────────────────────────────────────────────────────────────────────
//  BON DE LIVRAISON — Backoffice variant
// ─────────────────────────────────────────────────────────────────────────────
export interface PrintBLOpts {
  nomSocieteOverride?: string
  adresseOverride?:    string
  telOverride?:        string
  iceOverride?:        string
  rcOverride?:         string
  ifOverride?:         string
  patentOverride?:     string
  piedDePageOverride?: string
  docType?:            "bl" | "facture"   // titre du document
  showLegal?:          boolean            // afficher RC / ICE / IF (défaut: true)
  showICE?:            boolean            // afficher l'ICE (défaut: true si showLegal)
  showIF?:             boolean            // afficher l'IF (défaut: true si showLegal)
  showRC?:             boolean            // afficher le RC (défaut: true si showLegal)
}

interface BOBLLigne {
  articleNom:   string
  articleNomAr?: string
  unite:        string
  qteLivree:    number
  prixUnit:     number
  totalLigne:   number
  um?:          string   // libellé unité de conditionnement (ex: "Caisse")
  colisageParUM?: number // quantité en unité de base par UM (ex: 15 kg/caisse)
}
interface BOBonLivraison {
  id:                    string
  numero:                string
  commandeId?:           string
  commandeIds?:          string[]  // toutes les commandes regroupées — affichage obligatoire sur le BL
  clientNom:             string
  clientAdresse?:        string
  livreurNom?:           string
  lignes:                BOBLLigne[]
  totalHT:               number
  totalTTC:              number
  tva?:                  number
  date:                  string
  statut?:               string
  clientIce?:            string
  clientModalitePaiement?: string
  clientCreditSolde?:    number
  clientCreditAutorise?: boolean
  notesBL?:              string
}

function buildBLHtml(bl: BOBonLivraison, opts: PrintBLOpts, company?: CompanyConfig): string {
  const cfg    = { ...vita_fresh_CONFIG, ...company }
  const accent = cfg.couleurEntete ?? "#1a4f2a"
  const gold   = "#b8962e"
  const companyNom = opts.nomSocieteOverride || cfg.nom
  const adresse    = opts.adresseOverride    || cfg.adresse || ""
  const telephone  = opts.telOverride        || cfg.telephone || ""
  const ice        = opts.iceOverride        || cfg.ice || ""
  const rc         = opts.rcOverride         || cfg.rc || ""
  const ifFiscal   = opts.ifOverride         || cfg.if_fiscal || ""
  // Logo : source UNIQUE = fiche société (BO > Paramètres). Avant, un
  // "logoOverride" séparé par document créait deux logos différents selon
  // l'écran où on regardait — source de confusion. Un seul logo, partout.
  const logo       = cfg.logo || "/vita-fresh-logo.png"
  const piedDePage = opts.piedDePageOverride || cfg.mentionsBL || ""
  const dateStr    = fmtDate(bl.date)
  const tva        = bl.tva ?? 0
  const montantTVA = bl.totalHT * (tva / 100)
  // Droit de timbre (0,25% CGI Maroc) — dès que le RC de la société est
  // renseigné, le document devient une pièce comptable officielle et doit
  // porter le droit de timbre (règlement espèces).
  const fiscalCfg  = store.getFiscalConfig()
  const droitTimbre = rc ? Math.round(bl.totalTTC * (fiscalCfg.tauxDroitTimbre / 100) * 100) / 100 : 0
  const totalAvecTimbre = bl.totalTTC + droitTimbre
  const nbArticlesDistincts = new Set(bl.lignes.map(l => l.articleNom)).size
  const poidsTotalKg = bl.lignes.filter(l => (l.unite ?? "kg").toLowerCase() === "kg").reduce((s, l) => s + l.qteLivree, 0)
  const showLegal  = opts.showLegal !== false               // défaut: afficher RC/ICE/IF
  // Toggles granulaires (chacun activable/désactivable séparément, sous showLegal)
  const sICE = showLegal && opts.showICE !== false
  const sIF  = showLegal && opts.showIF  !== false
  const sRC  = showLegal && opts.showRC  !== false
  const isFacture  = opts.docType === "facture"
  const docLabel   = isFacture ? "Facture" : "Bon de Livraison"
  // Ligne d'identifiants légaux société — selon les cases ICE / IF / RC
  const legalParts = [
    sICE && ice ? `ICE: ${ice}` : "",
    sRC && rc ? `RC: ${rc}` : "",
    sIF && ifFiscal ? `IF: ${ifFiscal}` : "",
    opts.patentOverride ? `Patente: ${opts.patentOverride}` : "",
  ].filter(Boolean)
  const legalLine  = legalParts.length ? `<br>${legalParts.join(" — ")}` : ""

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>
<title>${docLabel} ${bl.numero}</title>
<style>${baseCss(accent, gold)}</style></head><body>
${!isFacture ? watermarkHtml(cfg) : ""}
<div style="max-width:794px;margin:0 auto;padding:24px 28px;position:relative;z-index:1">
<div class="stripe"></div>
<div class="lh">
  <div class="lh-brand" style="flex-direction:column;align-items:flex-start;gap:8px">
    <img src="${logo}" class="lh-logo" style="width:150px;height:150px" onerror="this.style.display='none'" alt="${companyNom}"/>
    <div class="lh-meta" style="margin-top:0">${adresse}<br>Tél: ${telephone}${legalLine}</div>
  </div>
  <div class="lh-doc">
    <div class="lh-title">${docLabel}</div>
    <div class="lh-accent"></div>
    <div class="lh-num">${bl.numero}</div>
    <div class="lh-date">${dateStr}</div>
    ${(() => {
      const ids = bl.commandeIds?.length ? bl.commandeIds : (bl.commandeId ? [bl.commandeId] : [])
      if (!ids.length) return ""
      return `<div style="margin-top:4px;font-size:10px;font-weight:700;color:${accent}">Commande${ids.length > 1 ? "s" : ""} d'origine : ${ids.join(", ")}</div>`
    })()}
    <div style="margin-top:8px"><span class="badge ${bl.statut==="livre"||bl.statut==="Livré"?"b-green":bl.statut==="partiel"?"b-amber":"b-blue"}">${(bl.statut??"ÉMIS").toUpperCase()}</span></div>
  </div>
</div>
<div class="info-grid">
  <div class="info-card">
    <div class="ic-title">العميل / المستقبل<br/>Client / Destinataire</div>
    <div class="ic-val">${bl.clientNom}</div>
    <div class="ic-sub">${bl.clientAdresse ?? ""}</div>
    ${sICE && bl.clientIce?`<div class="ic-sub">ICE: ${bl.clientIce}</div>`:""}
    ${bl.clientModalitePaiement?`<div class="ic-sub">Modalité / طريقة الدفع: ${bl.clientModalitePaiement}</div>`:""}
  </div>
  <div class="info-card">
    <div class="ic-title">الشحن / الإرسال<br/>Expédition</div>
    <div class="ic-val">${companyNom}</div>
    <div class="ic-sub">تاريخ / Date: ${dateStr}</div>
    <div class="ic-sub">السائق / Livreur: ${bl.livreurNom ?? "—"}</div>
  </div>
</div>
<table>
  <thead><tr>
    <th style="width:34%">الوصف / Désignation</th><th>الوحدة / Unité</th>
    <th class="r">الكمية المسلمة / Qté livrée</th><th class="r">عدد الوحدات / Nb UM</th><th class="r">السعر / Prix U. HT</th><th class="r">الإجمالي / Total HT</th>
  </tr></thead>
  <tbody>
  ${bl.lignes.map(l => {
    const nbUM = l.colisageParUM && l.colisageParUM > 0 ? l.qteLivree / l.colisageParUM : null
    return `<tr><td class="bold">${l.articleNom}${l.articleNomAr ? `<br><span style="font-family:'Noto Sans Arabic',Arial,sans-serif;font-size:11px;font-weight:400;color:#555;direction:rtl;display:block">${l.articleNomAr}</span>` : ""}</td><td>${l.unite??"kg"}</td>
    <td class="r">${l.qteLivree}</td><td class="r">${nbUM !== null ? `${Math.round(nbUM * 10) / 10} ${l.um ?? ""}` : "—"}</td><td class="r">${fmtDH(l.prixUnit)}</td>
    <td class="r bold">${fmtDH(l.totalLigne)}</td></tr>`
  }).join("")}
  </tbody>
</table>
<div class="totals"><div class="totals-inner">
  <div class="tot-row"><span class="lbl">إجمالي المقالات / Total articles</span><span class="val">${nbArticlesDistincts}</span></div>
  ${poidsTotalKg > 0 ? `<div class="tot-row"><span class="lbl">الوزن الإجمالي / Poids total</span><span class="val">${poidsTotalKg.toFixed(1)} kg</span></div>` : ""}
  <div class="tot-row"><span class="lbl">المجموع قبل الضريبة / Total HT</span><span class="val">${fmtDH(bl.totalHT)}</span></div>
  <div class="tot-row"><span class="lbl">الضريبة على القيمة المضافة / TVA (${tva}%)</span><span class="val">${fmtDH(montantTVA)}</span></div>
  <div class="tot-row tot-final"><span class="lbl">الإجمالي شامل الضريبة / TOTAL TTC</span><span class="val">${fmtDH(bl.totalTTC)}</span></div>
  ${droitTimbre > 0 ? `<div class="tot-row"><span class="lbl">حق الطابع / Droit de timbre (${fiscalCfg.tauxDroitTimbre}%)</span><span class="val">${fmtDH(droitTimbre)}</span></div>
  <div class="tot-row tot-final"><span class="lbl">الإجمالي المستحق / TOTAL À PAYER</span><span class="val">${fmtDH(totalAvecTimbre)}</span></div>` : ""}
</div></div>
${bl.notesBL?`<div class="notice"><strong>ملاحظات / Notes:</strong> ${bl.notesBL}</div>`:""}
${isFacture?`<div class="notice" style="margin-top:8px"><strong>الوثيقة / Document :</strong> فاتورة / Facture${showLegal?" — valant pièce comptable (mentions légales incluses)":""}.</div>`:""}
<div class="sig-grid">
  <div class="sig-box"><div class="sig-lbl">توقيع السائق / Signature Livreur</div><div class="sig-line">${bl.livreurNom??"—"}</div></div>
  <div class="sig-box"><div class="sig-lbl">توقيع العميل والختم / Signature Client &amp; Cachet</div><div class="sig-line">${bl.clientNom}</div></div>
</div>
<div class="mentions">${piedDePage}</div>
</div><script>window.onload=()=>{window.print()}</script></body></html>`
}

export function printBLFromBO(bl: BOBonLivraison, opts: PrintBLOpts = {}, company?: CompanyConfig) {
  open(buildBLHtml(bl, opts, company))
}
export function downloadBLFromBO(bl: BOBonLivraison, opts: PrintBLOpts = {}, company?: CompanyConfig) {
  dl(buildBLHtml(bl, opts, company), `BL-${bl.numero.replace(/[^a-zA-Z0-9-]/g,"_")}.html`)
}

// ─────────────────────────────────────────────────────────────────────────────
//  FEUILLE DE ROUTE — cumul articles (chargement) + ordre de livraison
// ─────────────────────────────────────────────────────────────────────────────
export interface FeuilleRouteData {
  tripId:      string
  tripNumero?: string
  date:        string
  livreurNom:  string
  vehicule?:   string
  sequenceMode?: "horaire" | "itineraire"
  articlesCumules: { articleNom: string; unite: string; quantite: number }[]
  clients: { ordre: number; clientNom: string; secteur?: string; adresse?: string; heureLivraison?: string; telephone?: string }[]
}

function buildFeuilleRouteHtml(data: FeuilleRouteData, company?: CompanyConfig): string {
  const cfg    = { ...vita_fresh_CONFIG, ...company }
  const accent = cfg.couleurEntete ?? "#1a4f2a"
  const gold   = "#b8962e"
  const num    = data.tripNumero ?? data.tripId
  const dateStr = fmtDate(data.date)
  const modeLabel = data.sequenceMode === "horaire" ? "Créneaux horaires" : data.sequenceMode === "itineraire" ? "Optimisation GPS" : "—"

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>
<title>Feuille de route ${num}</title>
<style>${baseCss(accent, gold)}
.fr-table{width:100%;border-collapse:collapse;margin-top:10px}
.fr-table th{background:${accent}11;color:${accent};font-size:9.5px;font-weight:800;
  text-transform:uppercase;letter-spacing:0.4px;text-align:left;padding:7px 10px;border-bottom:2px solid ${accent}33}
.fr-table td{padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:11.5px}
.fr-table tr:nth-child(even) td{background:#f8fafc}
.fr-section-title{font-size:12px;font-weight:800;color:${accent};text-transform:uppercase;
  letter-spacing:0.5px;margin:20px 0 4px;padding-bottom:4px;border-bottom:2px solid ${accent}}
.fr-ordre{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;
  border-radius:50%;background:${accent};color:#fff;font-weight:800;font-size:11px}
</style></head><body>
<div style="max-width:794px;margin:0 auto;padding:24px 28px">
<div class="stripe"></div>
<div class="lh">
  <div class="lh-brand">
    <img src="${cfg.logo}" class="lh-logo" onerror="this.style.display='none'" alt="${cfg.nom}"/>
    <div class="lh-co">
      <div class="lh-tag">Feuille de route — Tournée ${num}</div>
    </div>
  </div>
  <div style="text-align:right;font-size:10px;opacity:0.85">${dateStr}<br>Livreur: ${data.livreurNom}${data.vehicule ? `<br>Véhicule: ${data.vehicule}` : ""}<br>Séquençage: ${modeLabel}</div>
</div>

<div class="fr-section-title">📦 Chargement — cumul par article</div>
<table class="fr-table">
  <thead><tr><th>Article</th><th>Unité</th><th style="text-align:right">Quantité totale</th></tr></thead>
  <tbody>
    ${data.articlesCumules.map(a => `<tr><td>${a.articleNom}</td><td>${a.unite}</td><td style="text-align:right;font-weight:700">${a.quantite.toLocaleString("fr-MA")}</td></tr>`).join("")}
  </tbody>
</table>

<div class="fr-section-title">🚚 Ordre de livraison (${data.clients.length} client${data.clients.length > 1 ? "s" : ""})</div>
<table class="fr-table">
  <thead><tr><th>#</th><th>Client</th><th>Secteur</th><th>Adresse</th><th>Créneau</th><th>Téléphone</th></tr></thead>
  <tbody>
    ${data.clients.sort((a, b) => a.ordre - b.ordre).map(c => `<tr>
      <td><span class="fr-ordre">${c.ordre}</span></td>
      <td style="font-weight:700">${c.clientNom}</td>
      <td>${c.secteur ?? "—"}</td>
      <td>${c.adresse ?? "—"}</td>
      <td>${c.heureLivraison ?? "—"}</td>
      <td>${c.telephone ?? "—"}</td>
    </tr>`).join("")}
  </tbody>
</table>

<div style="margin-top:24px;font-size:9.5px;color:#94a3b8;text-align:center">Feuille de route générée le ${new Date().toLocaleString("fr-FR")} — ${cfg.nom}</div>
</div>
</body></html>`
  return html
}

export function printFeuilleRoute(data: FeuilleRouteData, company?: CompanyConfig) {
  open(buildFeuilleRouteHtml(data, company))
}
export function downloadFeuilleRoute(data: FeuilleRouteData, company?: CompanyConfig) {
  dl(buildFeuilleRouteHtml(data, company), `Feuille-Route-${(data.tripNumero ?? data.tripId).replace(/[^a-zA-Z0-9-]/g,"_")}.html`)
}

// ─────────────────────────────────────────────────────────────────────────────
//  BULLETIN DE PAIE ultra-pro (Droit marocain — CNSS/AMO/IR 2024)
// ─────────────────────────────────────────────────────────────────────────────
export function printFichePaie(
  salarie: Salarie | null,
  brut: number,
  periode: string,
  heuresSup = 0,
  primes = 0,
  modePaie = "virement",
  company?: CompanyConfig
) {
  const cfg       = { ...vita_fresh_CONFIG, ...company }
  const accent    = cfg.couleurEntete ?? "#1a4f2a"
  const gold      = "#b8962e"
  const avances   = salarie?.avances ?? 0
  const brutSup   = heuresSup > 0 ? Math.round((brut / 208) * 1.25 * heuresSup) : 0
  const totalBrut = brut + primes + brutSup
  const calc      = calcPayroll(totalBrut, avances)
  const nbJours   = 26

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>
<title>Bulletin de Paie — ${salarie ? salarie.nom+" "+salarie.prenom : "Salarié"} — ${periode}</title>
<style>${baseCss(accent, gold)}
.slip-top{display:flex;justify-content:space-between;align-items:flex-start;
  padding:16px 0 14px;border-bottom:3px solid ${accent};margin-bottom:18px}
.slip-emp{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}
.slip-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 13px}
.sc-title{font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-bottom:5px}
.sc-row{display:flex;justify-content:space-between;font-size:10.5px;padding:1.5px 0}
.sc-lbl{color:#64748b;font-weight:500}.sc-val{color:#0f172a;font-weight:700}
tr.g-head td{background:#f1f5f9;font-size:9px;font-weight:800;text-transform:uppercase;
  letter-spacing:0.5px;color:#475569;padding:5px 11px}
td.ded{color:#dc2626;font-weight:700;text-align:right}
td.gain{color:#15803d;font-weight:700;text-align:right}
</style></head><body>
<div style="max-width:720px;margin:0 auto;padding:22px 28px">
<div style="height:6px;background:linear-gradient(90deg,${accent},${gold});border-radius:3px;margin-bottom:18px"></div>
<div class="slip-top">
  <div style="display:flex;align-items:center;gap:10px">
    <img src="${cfg.logo}" style="width:66px;height:66px;object-fit:contain" onerror="this.style.display='none'" alt="${cfg.nom}"/>
    <div>
      <div style="font-size:9px;color:#64748b;margin-top:2px;line-height:1.5">${cfg.adresse} — ${cfg.ville}<br>ICE: ${cfg.ice} — RC: ${cfg.rc}</div>
    </div>
  </div>
  <div style="text-align:right">
    <div style="font-size:17px;font-weight:900;text-transform:uppercase;letter-spacing:0.5px;color:#0f172a">Bulletin de Paie</div>
    <div style="font-size:12px;font-weight:700;color:${accent};margin-top:2px">${periode}</div>
    <div style="font-size:9px;color:#64748b;margin-top:2px">Période: ${nbJours} jours ouvrés</div>
  </div>
</div>
<div class="slip-emp">
  <div class="slip-card">
    <div class="sc-title">Salarié(e)</div>
    <div class="sc-row"><span class="sc-lbl">Nom complet</span><span class="sc-val">${salarie?`${salarie.civilite} ${salarie.nom} ${salarie.prenom}`:"—"}</span></div>
    <div class="sc-row"><span class="sc-lbl">Matricule</span><span class="sc-val">${salarie?.cin??"—"}</span></div>
    <div class="sc-row"><span class="sc-lbl">N° CNSS</span><span class="sc-val">${salarie?.cnss??"—"}</span></div>
    <div class="sc-row"><span class="sc-lbl">Poste</span><span class="sc-val">${salarie?.poste??"—"}</span></div>
    <div class="sc-row"><span class="sc-lbl">Dép. / Service</span><span class="sc-val">${salarie?.departement??"—"}</span></div>
    <div class="sc-row"><span class="sc-lbl">Type contrat</span><span class="sc-val">${(salarie?.typeContrat??"CDI").toUpperCase()}</span></div>
    <div class="sc-row"><span class="sc-lbl">Date embauche</span><span class="sc-val">${salarie?.dateEmbauche??"—"}</span></div>
  </div>
  <div class="slip-card">
    <div class="sc-title">Paiement</div>
    <div class="sc-row"><span class="sc-lbl">Période</span><span class="sc-val">${periode}</span></div>
    <div class="sc-row"><span class="sc-lbl">Mode</span><span class="sc-val">${modePaie.toUpperCase()}</span></div>
    <div class="sc-row"><span class="sc-lbl">Banque</span><span class="sc-val">${salarie?.banque??"—"}</span></div>
    <div class="sc-row"><span class="sc-lbl">RIB</span><span class="sc-val">${salarie?.numCompteBancaire??"—"}</span></div>
    <div class="sc-row"><span class="sc-lbl">Ancienneté</span><span class="sc-val">${salarie?.dateEmbauche ? Math.floor((Date.now()-new Date(salarie.dateEmbauche).getTime())/(365.25*24*3600*1000))+" an(s)" : "—"}</span></div>
  </div>
</div>
<table>
  <thead><tr>
    <th style="width:42%">Désignation</th><th class="r">Base</th><th class="r">Taux</th><th class="r">Montant DH</th>
  </tr></thead>
  <tbody>
    <tr class="g-head"><td colspan="4">Éléments de rémunération brute</td></tr>
    <tr><td>Salaire de base mensuel</td><td class="r">${fmtDH(brut)}</td><td class="r">100%</td><td class="r gain">${fmtDH(brut)}</td></tr>
    ${heuresSup>0?`<tr><td>Heures supplémentaires (${heuresSup}h × 125%)</td><td class="r">${heuresSup}h</td><td class="r">125%</td><td class="r gain">${fmtDH(brutSup)}</td></tr>`:""}
    ${primes>0?`<tr><td>Prime / Avantage</td><td class="r">—</td><td class="r">—</td><td class="r gain">${fmtDH(primes)}</td></tr>`:""}
    <tr style="background:#f0fdf4"><td><strong>Total Brut</strong></td><td></td><td></td><td class="r gain"><strong>${fmtDH(totalBrut)}</strong></td></tr>
    <tr class="g-head"><td colspan="4">Cotisations &amp; Retenues légales</td></tr>
    <tr><td>CNSS Salariale (4,48% — plafond 6 000 DH)</td><td class="r">${fmtDH(totalBrut)}</td><td class="r">4,48%</td><td class="r ded">- ${fmtDH(calc.cnss)}</td></tr>
    <tr><td>AMO — Assurance Maladie Obligatoire (2,26%)</td><td class="r">${fmtDH(totalBrut)}</td><td class="r">2,26%</td><td class="r ded">- ${fmtDH(calc.amo)}</td></tr>
    <tr><td>IR — Impôt sur le Revenu (barème progressif 2024)</td><td class="r">${fmtDH(calc.brutIR)}</td><td class="r">Barème</td><td class="r ded">- ${fmtDH(calc.ir)}</td></tr>
    ${avances>0?`<tr><td>Avance sur salaire (récupération)</td><td class="r">—</td><td class="r">—</td><td class="r ded">- ${fmtDH(avances)}</td></tr>`:""}
    <tr style="background:#fef2f2"><td><strong>Total Retenues</strong></td><td></td><td></td><td class="r ded"><strong>- ${fmtDH(calc.totalRetenues)}</strong></td></tr>
  </tbody>
</table>
<div class="net-block">
  <div><div class="net-lbl">Net à Payer</div><div class="net-sub">Mode: ${modePaie.toUpperCase()} — ${periode}</div></div>
  <div class="net-amt">${fmtDH(calc.net)}</div>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;font-size:9.5px">
  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 13px">
    <div style="font-size:8px;font-weight:800;color:#15803d;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">Charges patronales (info)</div>
    <div style="display:flex;justify-content:space-between;margin-bottom:2px"><span style="color:#64748b">CNSS patronale (8,98%)</span><span style="font-weight:700">${fmtDH(totalBrut*0.0898)}</span></div>
    <div style="display:flex;justify-content:space-between;margin-bottom:2px"><span style="color:#64748b">AMO patronale (4,11%)</span><span style="font-weight:700">${fmtDH(totalBrut*0.0411)}</span></div>
    <div style="display:flex;justify-content:space-between"><span style="color:#64748b">CIMR (optionnel)</span><span style="font-weight:700">—</span></div>
  </div>
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 13px">
    <div style="font-size:8px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">Récapitulatif</div>
    <div style="display:flex;justify-content:space-between;margin-bottom:2px"><span style="color:#64748b">Salaire brut</span><span style="font-weight:700">${fmtDH(totalBrut)}</span></div>
    <div style="display:flex;justify-content:space-between;margin-bottom:2px"><span style="color:#64748b">Total retenues</span><span style="color:#dc2626;font-weight:700">- ${fmtDH(calc.totalRetenues)}</span></div>
    <div style="display:flex;justify-content:space-between;border-top:1px solid #e2e8f0;padding-top:4px;margin-top:4px"><span style="font-weight:800">Net à payer</span><span style="font-weight:900;color:${accent}">${fmtDH(calc.net)}</span></div>
  </div>
</div>
<div class="sig-grid">
  <div class="sig-box"><div class="sig-lbl">Signature Employeur</div><div class="stamp">CACHET<br>SOCIÉTÉ</div><div class="sig-line">${cfg.nom}</div></div>
  <div class="sig-box"><div class="sig-lbl">Reçu — Salarié(e)</div><div style="height:70px;border:1px dashed #e2e8f0;border-radius:8px;margin-bottom:8px"></div><div class="sig-line">${salarie?salarie.nom+" "+salarie.prenom:"—"}</div></div>
</div>
<div class="confidential">Bulletin de paie confidentiel — ${cfg.nom} — ${periode} — Loi 65-99 — CNSS 2024</div>
</div><script>window.onload=()=>{window.print()}</script></body></html>`
  open(html, 750, 1200)
}

// ─────────────────────────────────────────────────────────────────────────────
//  DOCUMENTS RH — Moteur HTML (niveau international, droit marocain)
// ─────────────────────────────────────────────────────────────────────────────
export function printHRDoc(data: HRDocData, company?: CompanyConfig) {
  const cfg      = { ...vita_fresh_CONFIG, ...company }
  const accent   = cfg.couleurEntete ?? "#1a4f2a"
  const gold     = "#b8962e"
  const compNom  = data.societe ?? data.societeNom ?? cfg.nom ?? "Vita Fresh"
  const dateDoc  = fmtDate(data.dateDoc)

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>
<title>${data.titre}</title>
<style>${baseCss(accent, gold)}</style></head><body>
<div style="max-width:700px;margin:0 auto;padding:32px 40px">
<div class="stripe"></div>
<div class="lh">
  <div class="lh-brand">
    <img src="${cfg.logo}" class="lh-logo" onerror="this.style.display='none'" alt="${compNom}"/>
    <div class="lh-co">
      <div class="lh-tag">Direction des Ressources Humaines</div>
      <div class="lh-meta">${cfg.adresse} — ${cfg.ville}<br>ICE: ${cfg.ice} — RC: ${cfg.rc}<br>Tél: ${cfg.telephone}</div>
    </div>
  </div>
  <div class="lh-doc">
    <div style="font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:1px">Document RH</div>
    <div class="lh-accent" style="margin-top:4px"></div>
    <div style="font-size:10px;color:#64748b">Ref: ${compNom.slice(0,3).toUpperCase()}-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}</div>
    <div style="font-size:10px;color:#64748b;margin-top:2px">Date: ${dateDoc}</div>
  </div>
</div>
<div class="hr-subject">${data.titre ?? ""}</div>
${data.employe || data.employeNom ? `
<div class="emp-box">
  ${(data.employe||data.employeNom)?`<div class="emp-row"><span class="emp-lbl">Salarié(e)</span><span class="emp-val">${data.employe??data.employeNom}</span></div>`:""}
  ${(data.poste||data.employeRole)?`<div class="emp-row"><span class="emp-lbl">Poste / Fonction</span><span class="emp-val">${data.poste??data.employeRole}</span></div>`:""}
  ${data.cin?`<div class="emp-row"><span class="emp-lbl">CIN</span><span class="emp-val">${data.cin}</span></div>`:""}
  ${data.cnss?`<div class="emp-row"><span class="emp-lbl">N° CNSS</span><span class="emp-val">${data.cnss}</span></div>`:""}
  ${data.dateEmbauche?`<div class="emp-row"><span class="emp-lbl">Date embauche</span><span class="emp-val">${fmtDate(data.dateEmbauche)}</span></div>`:""}
</div>` : ""}
<div class="hr-body">${(data.contenu ?? "").replace(/\n/g, "<br>")}</div>
<div class="sig-grid">
  <div class="sig-box"><div class="sig-lbl">Direction / Employeur</div><div class="stamp">CACHET<br>&amp;<br>SIGN.</div><div class="sig-line">${compNom}</div></div>
  <div class="sig-box"><div class="sig-lbl">${data.employe ?? data.employeNom ?? "Salarié(e)"} — Lu &amp; Approuvé</div><div style="height:70px;border:1px dashed #e2e8f0;border-radius:8px;margin-bottom:8px"></div><div class="sig-line">${data.employe ?? data.employeNom ?? "—"}</div></div>
</div>
<div class="confidential">Document confidentiel — ${compNom} — ${dateDoc}</div>
</div><script>window.onload=()=>{window.print()}</script></body></html>`
  open(html, 750, 1100)
}

// ── Download HR Doc as Word ───────────────────────────────────────────────────
export function downloadHRDocAsWord(data: HRDocData, company?: CompanyConfig) {
  const cfg     = { ...vita_fresh_CONFIG, ...company }
  const compNom = data.societe ?? data.societeNom ?? cfg.nom ?? "Vita Fresh"
  const content = `<html xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="UTF-8"><style>
body{font-family:Times New Roman,serif;font-size:12pt;line-height:2;margin:3cm;color:#000}
h1{font-size:14pt;font-weight:bold;text-align:center;margin-bottom:18pt;text-transform:uppercase}
.header{display:flex;justify-content:space-between;margin-bottom:24pt;padding-bottom:8pt;border-bottom:2pt solid #1a4f2a}
.emp-box{border:1pt solid #ccc;padding:10pt 14pt;margin:16pt 0;background:#f9f9f9}
.sig{margin-top:60pt;display:grid;grid-template-columns:1fr 1fr;gap:40pt}
.sig-box{text-align:center}.sig-line{border-top:1pt solid #000;padding-top:5pt;margin-top:50pt}
</style></head><body>
<div class="header">
  <div><strong>${compNom}</strong><br>${cfg.adresse??""}<br>ICE: ${cfg.ice??""} — RC: ${cfg.rc??""}<br>Tél: ${cfg.telephone??""}</div>
  <div style="text-align:right"><strong>${data.titre??""}</strong><br>Date: ${fmtDate(data.dateDoc)}<br>Réf: ${compNom.slice(0,3).toUpperCase()}-${new Date().getFullYear()}</div>
</div>
<h1>${(data.titre??"").toUpperCase()}</h1>
${data.employe||data.employeNom?`<div class="emp-box"><strong>Salarié(e):</strong> ${data.employe??data.employeNom}${data.poste?" — Poste: "+data.poste:""}${data.cin?" — CIN: "+data.cin:""}${data.cnss?" — CNSS: "+data.cnss:""}</div>`:""}
<div style="white-space:pre-wrap;line-height:2.2;text-align:justify">${data.contenu??""}</div>
<div class="sig">
  <div class="sig-box"><p><strong>Direction</strong></p><div class="sig-line">${compNom}</div></div>
  <div class="sig-box"><p><strong>${data.employe??data.employeNom??"Salarié(e)"}</strong></p><div class="sig-line">&nbsp;</div></div>
</div>
</body></html>`
  const blob = new Blob([content], { type: "application/msword" })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement("a")
  a.href = url
  a.download = `${(data.titre??"doc").replace(/\s+/g,"_")}_${new Date().toISOString().split("T")[0]}.doc`
  a.click(); URL.revokeObjectURL(url)
}

// ── WhatsApp helpers ──────────────────────────────────────────────────────────
export function buildHRWhatsAppText(data: HRDocData): string {
  return `${(data.titre??data.docType??"Document").toUpperCase()}\n\n${data.employe?"Employé: "+data.employe+"\n":""}${data.periode?"Période: "+data.periode+"\n":""}${data.salaireBrut?"Salaire brut: "+data.salaireBrut.toLocaleString("fr-MA")+" DH\n":""}${data.netAPayer?"Net à payer: "+data.netAPayer.toLocaleString("fr-MA")+" DH\n":""}\nDate: ${fmtDate(data.dateDoc)}`
}
export function sendWhatsApp(phone: string, text: string) {
  const clean = phone.replace(/\D/g,"")
  const full  = clean.startsWith("212") ? clean : `212${clean.replace(/^0/,"")}`
  window.open(`https://wa.me/${full}?text=${encodeURIComponent(text)}`, "_blank")
}
export function buildBLWhatsAppText(
  numero: string, clientNom: string, date: string,
  lignes: { nom: string; quantite: number; unite: string; total: number }[],
  totalTTC: number, modalite?: string
): string {
  const lines = lignes.map(l => `  • ${l.nom}: ${l.quantite} ${l.unite} — ${l.total.toLocaleString("fr-MA",{minimumFractionDigits:2})} DH`).join("\n")
  return `*BON DE LIVRAISON ${numero}*\nDate: ${date}\nClient: ${clientNom}\n\n*Articles:*\n${lines}\n\n*TOTAL TTC: ${totalTTC.toLocaleString("fr-MA",{minimumFractionDigits:2})} DH*${modalite?"\nModalité: "+modalite:""}`
}

// ── Export paie Excel/CSV ─────────────────────────────────────────────────────
export function exportPayrollExcel(
  employees: { salarie: Salarie | null; nom: string; brut: number; heuresSup?: number; primes?: number }[],
  periode: string, societe: string
) {
  const headers = ["N°","Civilité","Nom complet","CIN","N° CNSS","Poste","Département","Contrat",
    "Salaire Brut (DH)","Heures Sup (DH)","Primes (DH)","TOTAL BRUT (DH)",
    "CNSS Salariale (DH)","AMO (DH)","IR (DH)","TOTAL RETENUES (DH)","Avances (DH)","NET À PAYER (DH)",
    "Mode paiement","Banque","RIB","Période","Société"]
  const rows = employees.map(({ salarie: s, nom, brut, heuresSup = 0, primes = 0 }, i) => {
    const brutSup  = heuresSup > 0 ? Math.round((brut / 208) * 1.25 * heuresSup) : 0
    const totalBrut = brut + primes + brutSup
    const avances   = s?.avances ?? 0
    const calc      = calcPayroll(totalBrut, avances)
    return [i+1, s?.civilite??"", s?`${s.nom} ${s.prenom}`:nom, s?.cin??"", s?.cnss??"",
      s?.poste??"", s?.departement??"", (s?.typeContrat??"CDI").toUpperCase(),
      brut.toFixed(2), brutSup.toFixed(2), primes.toFixed(2), totalBrut.toFixed(2),
      calc.cnss.toFixed(2), calc.amo.toFixed(2), calc.ir.toFixed(2), calc.totalRetenues.toFixed(2),
      avances.toFixed(2), calc.net.toFixed(2),
      (s?.modePaiement??"virement").toUpperCase(), s?.banque??"", s?.numCompteBancaire??"",
      periode, societe]
  })
  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(";")).join("\n")
  const blob = new Blob(["\uFEFF"+csv], { type: "application/vnd.ms-excel;charset=utf-8" })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement("a")
  a.href = url; a.download = `Paie_${periode.replace(/\s+/g,"_")}_${societe.replace(/\s+/g,"_")}.xls`
  a.click(); URL.revokeObjectURL(url)
}
