"use client"

// ============================================================
// MobileBLValidation — Interface mobile-first pour valider
// les Bons de Livraison sur le terrain + impression mobile.
// Rôle cible : livreur
// ============================================================

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { store } from "@/lib/store"

// ── Types ─────────────────────────────────────────────────────

interface LigneBL {
  article_id?: string
  article_nom?: string
  qte_commandee?: number
  qte_livree?: number
  unite?: string
  prix_u?: number
  montant?: number
}

interface BonLivraison {
  id: string
  numero: string
  client_id?: string
  client_nom: string
  livreur_id?: string
  livreur_nom?: string
  date_livraison: string
  heure_livraison?: string
  heure_livraison_reelle?: string
  lignes: LigneBL[]
  montant_total: number
  montant_encaisse?: number
  statut: "en_attente" | "en_cours" | "livre" | "partiel" | "retour" | "annule"
  signature_url?: string
  photo_preuve?: string
  gps_lat_livraison?: number
  gps_lng_livraison?: number
  notes?: string
  // Internes (mapping JSONB) — payload brut + état de validation BO
  _payload?: Record<string, unknown>
  _validated?: boolean       // true si le BL est validé au BO (statut ≠ brouillon)
  _boStatut?: string
}

// BO statut (fl_bons_livraison.payload.statut) → statut mobile
function mapStatutMobile(bo: string): BonLivraison["statut"] {
  switch (bo) {
    case "livre": return "livre"
    case "retour_partiel": return "partiel"
    case "retour": return "retour"
    case "annule": return "annule"
    case "brouillon": return "en_attente"
    default: return "en_cours"   // valide / en_livraison / émis → à livrer
  }
}

// Ligne {id, payload} JSONB → BonLivraison du mobile
function mapBL(row: { id: string; payload?: Record<string, unknown> }): BonLivraison {
  const p = (row.payload ?? {}) as Record<string, unknown>
  const boStatut = String(p.statut ?? p.statutLivraison ?? "")
  const rawLignes = Array.isArray(p.lignes) ? p.lignes as Record<string, unknown>[] : []
  const lignes: LigneBL[] = rawLignes.map(l => ({
    article_id:    String(l.articleId ?? ""),
    article_nom:   String(l.articleNom ?? l.nom ?? "Article"),
    qte_commandee: Number(l.qteCommande ?? l.quantite ?? 0) || 0,
    qte_livree:    Number(l.qteLivree ?? l.quantite ?? 0) || 0,
    unite:         String(l.unite ?? "kg"),
    prix_u:        Number(l.prixUnit ?? l.prixUnitaire ?? 0) || 0,
    montant:       Number(l.totalLigne ?? l.total ?? 0) || 0,
  }))
  return {
    id: row.id,
    numero: String(p.numero ?? row.id),
    client_id: p.clientId ? String(p.clientId) : undefined,
    client_nom: String(p.clientNom ?? p.client ?? "—"),
    livreur_id: p.livreurId ? String(p.livreurId) : undefined,
    livreur_nom: p.livreurNom ? String(p.livreurNom) : undefined,
    date_livraison: String(p.date ?? p.dateLivraisonPrevue ?? "").slice(0, 10),
    lignes,
    montant_total: Number(p.totalTTC ?? p.montantTTC ?? p.totalHT ?? p.montantTotal ?? 0) || 0,
    montant_encaisse: Number(p.montantEncaisse ?? 0) || undefined,
    statut: mapStatutMobile(boStatut),
    notes: p.notesBL ? String(p.notesBL) : (p.notes ? String(p.notes) : undefined),
    signature_url: p.signatureClient ? String(p.signatureClient) : undefined,
    _payload: p,
    _validated: boStatut !== "brouillon" && boStatut !== "",
    _boStatut: boStatut,
  }
}

const DH = (n: number) =>
  `${Number(n ?? 0).toLocaleString("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`

// ── Couleurs statut ────────────────────────────────────────────

const STATUT_STYLE: Record<string, string> = {
  en_attente: "bg-yellow-100 text-yellow-800",
  en_cours:   "bg-blue-100 text-blue-800",
  livre:      "bg-green-100 text-green-800",
  partiel:    "bg-orange-100 text-orange-800",
  retour:     "bg-red-100 text-red-800",
  annule:     "bg-slate-100 text-slate-500",
}
const STATUT_LABEL: Record<string, string> = {
  en_attente: "En attente",
  en_cours:   "En cours",
  livre:      "Livré",
  partiel:    "Partiel",
  retour:     "Retour",
  annule:     "Annulé",
}

// ── Génération HTML pour impression mobile ─────────────────────

function buildBLHtml(bl: BonLivraison, company: { nom?: string; adresse?: string; telephone?: string; logo?: string }): string {
  const lignesHtml = bl.lignes.map(l => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:13px">${l.article_nom ?? "—"}</td>
      <td style="padding:6px 8px;text-align:center;border-bottom:1px solid #e5e7eb;font-size:13px">${l.qte_livree ?? l.qte_commandee ?? 0}</td>
      <td style="padding:6px 8px;text-align:center;border-bottom:1px solid #e5e7eb;font-size:13px">${l.unite ?? "kg"}</td>
      <td style="padding:6px 8px;text-align:right;border-bottom:1px solid #e5e7eb;font-size:13px;font-weight:600">${DH(l.montant ?? 0)}</td>
    </tr>`).join("")

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>BL ${bl.numero}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; font-size:14px; color:#111; background:#fff; padding:16px; max-width:400px; margin:0 auto; }
  .header { text-align:center; margin-bottom:16px; border-bottom:2px solid #1a4f2a; padding-bottom:12px; }
  .co-name { font-size:18px; font-weight:900; color:#1a4f2a; }
  .doc-title { font-size:15px; font-weight:700; margin-top:8px; }
  .doc-num { font-size:22px; font-weight:900; color:#1a4f2a; }
  .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:12px 0; }
  .info-item { display:flex; flex-direction:column; gap:2px; }
  .info-label { font-size:10px; font-weight:700; text-transform:uppercase; color:#9ca3af; }
  .info-value { font-size:13px; font-weight:600; }
  table { width:100%; border-collapse:collapse; margin:12px 0; }
  thead th { background:#1a4f2a; color:#fff; padding:8px; font-size:11px; text-align:left; }
  .total-row { font-size:15px; font-weight:800; color:#1a4f2a; border-top:2px solid #1a4f2a; }
  .total-row td { padding:8px; }
  .sig-section { margin-top:24px; display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  .sig-box { text-align:center; }
  .sig-label { font-size:10px; font-weight:700; text-transform:uppercase; color:#6b7280; margin-bottom:4px; }
  .sig-line { border-bottom:1px solid #d1d5db; height:48px; }
  .footer { margin-top:16px; font-size:10px; color:#9ca3af; text-align:center; }
  .back-btn { display:flex; align-items:center; gap:6px; margin-bottom:12px;
    padding:9px 16px; border-radius:10px; border:none; background:#1a4f2a; color:#fff;
    font-family:Arial,sans-serif; font-size:13px; font-weight:700; cursor:pointer; }
  @media print { @page { margin: 8mm; size: A5 portrait; } body { padding:0; } .no-print { display:none !important; } }
</style>
</head>
<body>
  <button class="back-btn no-print" onclick="window.close()">← Retour</button>
  <div class="header">
    ${company.logo ? `<img src="${company.logo}" style="height:50px;margin-bottom:8px" />` : ""}
    <div class="co-name">${company.nom ?? "Vita Fresh"}</div>
    ${company.adresse ? `<div style="font-size:11px;color:#6b7280">${company.adresse}</div>` : ""}
    ${company.telephone ? `<div style="font-size:11px;color:#6b7280">Tél : ${company.telephone}</div>` : ""}
    <div class="doc-title">BON DE LIVRAISON</div>
    <div class="doc-num">N° ${bl.numero}</div>
  </div>

  <div class="info-grid">
    <div class="info-item"><div class="info-label">Client</div><div class="info-value">${bl.client_nom}</div></div>
    <div class="info-item"><div class="info-label">Date livraison</div><div class="info-value">${new Date(bl.date_livraison).toLocaleDateString("fr-FR")}</div></div>
    ${bl.livreur_nom ? `<div class="info-item"><div class="info-label">Livreur</div><div class="info-value">${bl.livreur_nom}</div></div>` : ""}
    ${bl.heure_livraison_reelle ? `<div class="info-item"><div class="info-label">Heure réelle</div><div class="info-value">${bl.heure_livraison_reelle}</div></div>` : ""}
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:45%">Produit</th>
        <th style="width:15%;text-align:center">Qté</th>
        <th style="width:15%;text-align:center">Unité</th>
        <th style="width:25%;text-align:right">Montant</th>
      </tr>
    </thead>
    <tbody>${lignesHtml}</tbody>
    <tfoot>
      <tr class="total-row"><td colspan="3">TOTAL</td><td style="text-align:right">${DH(bl.montant_total)}</td></tr>
      ${(bl.montant_encaisse ?? 0) > 0 ? `<tr><td colspan="3" style="padding:4px 8px;font-size:12px">Encaissé</td><td style="padding:4px 8px;text-align:right;font-size:12px">${DH(bl.montant_encaisse ?? 0)}</td></tr>` : ""}
    </tfoot>
  </table>

  ${bl.notes ? `<div style="margin:8px 0;padding:8px;background:#f9fafb;border-radius:6px;font-size:12px;color:#374151">Note : ${bl.notes}</div>` : ""}

  <div class="sig-section">
    <div class="sig-box">
      <div class="sig-label">Signature livreur</div>
      <div class="sig-line"></div>
      <div style="font-size:11px;color:#6b7280;margin-top:4px">${bl.livreur_nom ?? ""}</div>
    </div>
    <div class="sig-box">
      <div class="sig-label">Signature client</div>
      <div class="sig-line"></div>
      <div style="font-size:11px;color:#6b7280;margin-top:4px">${bl.client_nom}</div>
    </div>
  </div>

  <div class="footer">Merci pour votre confiance — ${company.nom ?? "Vita Fresh"}</div>
</body>
</html>`
}

// ── Pad de signature ────────────────────────────────────────────

function SignaturePad({ onSave, onCancel }: { onSave: (dataUrl: string) => void; onCancel: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing   = useRef(false)

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top }
  }

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    const c = canvasRef.current; if (!c) return
    drawing.current = true
    const ctx = c.getContext("2d")!
    const p = getPos(e, c)
    ctx.beginPath(); ctx.moveTo(p.x, p.y)
    e.preventDefault()
  }
  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current) return
    const c = canvasRef.current; if (!c) return
    const ctx = c.getContext("2d")!
    const p = getPos(e, c)
    ctx.lineTo(p.x, p.y); ctx.stroke()
    e.preventDefault()
  }
  const stop = () => { drawing.current = false }

  const clear = () => {
    const c = canvasRef.current; if (!c) return
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height)
  }

  const save = () => {
    const c = canvasRef.current; if (!c) return
    onSave(c.toDataURL("image/png"))
  }

  useEffect(() => {
    const c = canvasRef.current; if (!c) return
    const ctx = c.getContext("2d")!
    ctx.strokeStyle = "#1a4f2a"; ctx.lineWidth = 2.5; ctx.lineCap = "round"
  }, [])

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center p-0">
      <div className="bg-background w-full max-w-lg rounded-t-3xl p-5 shadow-2xl">
        <h3 className="text-base font-bold text-center mb-1">Signature client</h3>
        <p className="text-xs text-center text-muted-foreground mb-4">Signez dans le cadre ci-dessous</p>
        <canvas
          ref={canvasRef} width={380} height={180}
          className="w-full rounded-xl border-2 border-border bg-white touch-none"
          onMouseDown={start} onMouseMove={draw} onMouseUp={stop}
          onTouchStart={start} onTouchMove={draw} onTouchEnd={stop}
        />
        <div className="flex gap-3 mt-4">
          <button onClick={clear} className="flex-1 py-3 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-colors">Effacer</button>
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl border border-border text-sm font-semibold text-red-500 hover:bg-red-50 transition-colors">Annuler</button>
          <button onClick={save} className="flex-1 py-3 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors">Valider</button>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// COMPOSANT PRINCIPAL
// ──────────────────────────────────────────────────────────────

export default function MobileBLValidation({ user }: { user: { id: string; name: string; role: string } }) {
  const [bls, setBls]             = useState<BonLivraison[]>([])
  const [selected, setSelected]   = useState<BonLivraison | null>(null)
  const [loading, setLoading]     = useState(true)
  const [showSig, setShowSig]     = useState(false)
  const [encaisse, setEncaisse]   = useState("")
  const [notes, setNotes]         = useState("")
  const [saving, setSaving]       = useState(false)
  const [msg, setMsg]             = useState<{ ok: boolean; text: string } | null>(null)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [gpsCaptured, setGpsCaptured] = useState<{ lat: number; lng: number } | null>(null)
  // Recherche, filtre statut & tri — liste "Mes livraisons"
  const [blSearch, setBlSearch] = useState("")
  const [blStatutFilter, setBlStatutFilter] = useState<"tous" | "livre" | "attente">("tous")
  const [blSort, setBlSort] = useState<"recent" | "ancien" | "montant">("recent")

  const company = store.getCompanyConfig()

  // ── Charger les BL du livreur (table JSONB {id, payload} via service-role) ──
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/sync-read?table=fl_bons_livraison", { cache: "no-store" })
      const json = await res.json()
      const rows: { id: string; payload?: Record<string, unknown> }[] = json?.ok ? (json.data ?? []) : []
      let all = rows.filter(r => r.payload && !String(r.id).startsWith("__")).map(mapBL)
      // Un livreur ne voit QUE ses propres BL (par id OU par nom)
      if (user.role === "livreur") {
        const uname = (user.name ?? "").trim().toLowerCase()
        all = all.filter(b => b.livreur_id === user.id || (b.livreur_nom ?? "").trim().toLowerCase() === uname)
      }
      // On masque les annulés ; on garde les BL validés au BO ou déjà traités
      all = all.filter(b => b.statut !== "annule")
        .sort((a, b) => (b.date_livraison || "").localeCompare(a.date_livraison || ""))
      setBls(all)
    } catch { /* offline */ }
    setLoading(false)
  }, [user.id, user.role, user.name])

  // Persiste un changement de statut dans le payload JSONB (service-role)
  const persistPayload = async (bl: BonLivraison, patch: Record<string, unknown>): Promise<boolean> => {
    try {
      const payload = { ...(bl._payload ?? {}), ...patch }
      const res = await fetch("/api/sync-write", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: "fl_bons_livraison", upserts: [{ id: bl.id, payload, updated_at: new Date().toISOString() }] }),
      })
      return (await res.json())?.ok === true
    } catch { return false }
  }

  useEffect(() => { load() }, [load])

  // ── Capturer GPS ───────────────────────────────────────────
  const captureGPS = () => {
    if (!navigator.geolocation) { setMsg({ ok: false, text: "GPS non disponible sur cet appareil." }); return }
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGpsCaptured({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGpsLoading(false)
      },
      () => {
        setMsg({ ok: false, text: "Impossible d'obtenir la position GPS." })
        setGpsLoading(false)
      },
      { timeout: 10000, enableHighAccuracy: true }
    )
  }

  // Le livreur ne peut PAS changer le statut tant que le BL n'est pas validé au BO
  const guardValidated = (): boolean => {
    if (selected && selected._validated === false) {
      setMsg({ ok: false, text: "⛔ Ce BL n'est pas encore validé au back-office. Vous ne pouvez pas le traiter." })
      setTimeout(() => setMsg(null), 4000)
      return false
    }
    return true
  }

  // ── Valider livraison ──────────────────────────────────────
  const handleValider = async (signatureUrl?: string) => {
    if (!selected || !guardValidated()) return
    setSaving(true)
    const now = new Date()
    const heure = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
    // Patch écrit en camelCase dans le payload (cohérent avec le BO)
    const patch: Record<string, unknown> = {
      statut: "livre",
      heureLivraisonReelle: heure,
      montantEncaisse: Number(encaisse) || selected.montant_total,
      notesBL: notes || selected.notes || "",
      ...(signatureUrl ? { signatureClient: signatureUrl } : {}),
      ...(gpsCaptured ? { gpsLatLivraison: gpsCaptured.lat, gpsLngLivraison: gpsCaptured.lng } : {}),
    }
    const ok = await persistPayload(selected, patch)
    if (!ok) setMsg({ ok: false, text: "Erreur d'enregistrement (réessayez en ligne)." })
    else {
      setMsg({ ok: true, text: "BL validé avec succès !" })
      setBls(b => b.map(x => x.id === selected.id ? { ...x, statut: "livre", _payload: { ...(x._payload ?? {}), ...patch } } : x))
      setSelected(s => s ? { ...s, statut: "livre", _payload: { ...(s._payload ?? {}), ...patch } } : null)
      await maybeRecalerGpsClient(selected, gpsCaptured)
    }
    setSaving(false)
    setShowSig(false)
    setTimeout(() => setMsg(null), 3000)
  }

  // ── Recalage GPS client à la livraison ──────────────────────
  // Le livreur vient de capturer sa position GPS réelle chez le client
  // ("Capturer GPS" ci-dessus) — on lui propose de recaler le point GPS
  // enregistré du client dessus. Verrouillé par défaut (Paramètres →
  // Modules actifs → "Recalage GPS client à la livraison") : tant qu'un
  // admin ne l'a pas explicitement dévérouillé, le point GPS d'un client ne
  // change jamais depuis le mobile. Best-effort, jamais bloquant — le BL est
  // déjà validé au moment où cette fonction s'exécute.
  const maybeRecalerGpsClient = async (bl: BonLivraison, gps: { lat: number; lng: number } | null) => {
    if (!gps || !bl.client_id) return
    try {
      if (!store.getProcessConfig().autoriserModifGpsClientLivraison) return
      const ok = window.confirm(
        `📍 Recaler le point GPS de « ${bl.client_nom} » sur votre position actuelle ?\n\nCela remplace le point GPS enregistré pour ce client (utilisé pour la navigation des prochaines livraisons).`
      )
      if (!ok) return
      store.updateClient(bl.client_id, { gpsLat: gps.lat, gpsLng: gps.lng })
      const client = store.getClients().find(c => c.id === bl.client_id)
      if (client) { const { upsertClient } = await import("@/lib/supabase/db"); await upsertClient(client) }
    } catch { /* offline / noop */ }
  }

  const handlePartiel = async () => {
    if (!selected || !guardValidated()) return
    setSaving(true)
    const patch = { statut: "retour_partiel", montantEncaisse: Number(encaisse) || 0, notesBL: notes || "" }
    const ok = await persistPayload(selected, patch)
    if (ok) {
      setBls(b => b.map(x => x.id === selected.id ? { ...x, statut: "partiel", _payload: { ...(x._payload ?? {}), ...patch } } : x))
      setSelected(s => s ? { ...s, statut: "partiel", _payload: { ...(s._payload ?? {}), ...patch } } : null)
      setMsg({ ok: true, text: "BL marqué comme livraison partielle." })
    } else setMsg({ ok: false, text: "Erreur d'enregistrement." })
    setSaving(false)
    setTimeout(() => setMsg(null), 3000)
  }

  const handleRetour = async () => {
    if (!selected || !guardValidated()) return
    if (!confirm("Confirmer le retour de cette livraison ?")) return
    setSaving(true)
    const patch = { statut: "retour_partiel", notesBL: `RETOUR TOTAL — ${notes || ""}`.trim() }
    const ok = await persistPayload(selected, patch)
    if (ok) {
      setBls(b => b.map(x => x.id === selected.id ? { ...x, statut: "retour", _payload: { ...(x._payload ?? {}), ...patch } } : x))
      setSelected(s => s ? { ...s, statut: "retour", _payload: { ...(s._payload ?? {}), ...patch } } : null)
      setMsg({ ok: true, text: "BL marqué en retour." })
    } else setMsg({ ok: false, text: "Erreur d'enregistrement." })
    setSaving(false)
    setTimeout(() => setMsg(null), 3000)
  }

  // ── Impression ─────────────────────────────────────────────
  const handlePrint = (bl: BonLivraison) => {
    const html = buildBLHtml(bl, { nom: company.nom, adresse: company.adresse, telephone: company.telephone, logo: company.logo })
    const w = window.open("", "_blank", "width=440,height=680")
    if (!w) return
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => { w.print() }, 500)
  }

  // Recherche + filtre statut + tri appliques sur "Mes livraisons"
  const visibleBls = useMemo(() => {
    const q = blSearch.trim().toLowerCase()
    let list = bls.filter(b =>
      (!q || b.client_nom.toLowerCase().includes(q) || b.numero.toLowerCase().includes(q)) &&
      (blStatutFilter === "tous" ||
        (blStatutFilter === "livre" && b.statut === "livre") ||
        (blStatutFilter === "attente" && (b.statut === "en_attente" || b.statut === "en_cours")))
    )
    if (blSort === "ancien") list = [...list].sort((a, b) => (a.date_livraison || "").localeCompare(b.date_livraison || ""))
    else if (blSort === "montant") list = [...list].sort((a, b) => b.montant_total - a.montant_total)
    else list = [...list].sort((a, b) => (b.date_livraison || "").localeCompare(a.date_livraison || ""))
    return list
  }, [bls, blSearch, blStatutFilter, blSort])

  // ─────────────────────────────────────────────────────────────
  // VUE LISTE
  // ─────────────────────────────────────────────────────────────
  if (!selected) return (
    <div className="flex flex-col gap-4 pb-6">
      <div className="sticky top-0 z-10 bg-background pt-4 pb-2 px-0">
        <h2 className="text-xl font-bold text-foreground">Mes livraisons</h2>
        <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString("fr-FR", { weekday:"long", day:"2-digit", month:"long" })}</p>
      </div>

      {msg && (
        <div className={`px-4 py-3 rounded-2xl text-sm font-medium ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{msg.text}</div>
      )}

      {/* Stats rapides — cliquables pour filtrer */}
      <div className="grid grid-cols-3 gap-3">
        {([
          { key: "tous" as const,    label: "Total",       count: bls.length, color: "bg-slate-100 text-slate-700" },
          { key: "livre" as const,   label: "Livrés",      count: bls.filter(b => b.statut === "livre").length, color: "bg-green-100 text-green-700" },
          { key: "attente" as const, label: "En attente",  count: bls.filter(b => b.statut === "en_attente" || b.statut === "en_cours").length, color: "bg-yellow-100 text-yellow-700" },
        ]).map(s => (
          <button key={s.label} onClick={() => setBlStatutFilter(f => f === s.key ? "tous" : s.key)}
            className={`rounded-2xl p-3 text-center transition-all ${s.color} ${blStatutFilter === s.key ? "ring-2 ring-offset-1 ring-green-500" : ""}`}>
            <div className="text-2xl font-black">{s.count}</div>
            <div className="text-xs font-semibold">{s.label}</div>
          </button>
        ))}
      </div>

      {/* Recherche & tri */}
      {bls.length > 0 && (
        <div className="flex items-center gap-2">
          <input type="text" value={blSearch} onChange={e => setBlSearch(e.target.value)}
            placeholder="Rechercher client, numero BL..."
            className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          <select value={blSort} onChange={e => setBlSort(e.target.value as typeof blSort)}
            className="shrink-0 px-2.5 py-2 rounded-xl border border-border bg-background text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary">
            <option value="recent">Plus recent</option>
            <option value="ancien">Plus ancien</option>
            <option value="montant">Montant</option>
          </select>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Chargement…</div>
      ) : bls.length === 0 ? (
        <div className="text-center py-16 flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <p className="font-bold text-slate-700">Aucune livraison aujourd&apos;hui</p>
          <p className="text-sm text-muted-foreground">Vous n&apos;avez pas de BL assigné pour ce jour</p>
        </div>
      ) : visibleBls.length === 0 ? (
        <div className="text-center py-10 flex flex-col items-center gap-2">
          <p className="font-bold text-slate-700 text-sm">Aucune livraison ne correspond</p>
          <p className="text-xs text-muted-foreground">Modifiez la recherche ou le filtre.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visibleBls.map(bl => (
            <button
              key={bl.id}
              onClick={() => { setSelected(bl); setEncaisse(String(bl.montant_total)); setNotes(bl.notes ?? ""); setGpsCaptured(null) }}
              className="w-full text-left rounded-2xl border border-border bg-white p-4 shadow-sm hover:border-green-300 transition-all active:scale-98"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs text-slate-400">{bl.numero}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${STATUT_STYLE[bl.statut]}`}>{STATUT_LABEL[bl.statut]}</span>
                    {bl._validated === false && <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-200 text-slate-600">⛔ Non validé BO</span>}
                  </div>
                  <p className="font-bold text-base text-slate-900">{bl.client_nom}</p>
                  <p className="text-sm text-slate-500 mt-0.5">{bl.lignes.length} article{bl.lignes.length > 1 ? "s" : ""} · {DH(bl.montant_total)}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {bl.heure_livraison && <span className="text-xs font-semibold text-slate-500">{bl.heure_livraison}</span>}
                  <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )

  // ─────────────────────────────────────────────────────────────
  // VUE DÉTAIL BL
  // ─────────────────────────────────────────────────────────────
  const isLivre = selected.statut === "livre"
  const isRetour = selected.statut === "retour"
  const isAnnule = selected.statut === "annule"
  const notValidatedBO = selected._validated === false
  const canValidate = !isLivre && !isRetour && !isAnnule && !notValidatedBO

  return (
    <div className="flex flex-col gap-4 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background pt-4 pb-2">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelected(null)} className="w-10 h-10 rounded-2xl bg-muted flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-mono text-xs text-slate-400">{selected.numero}</p>
            <p className="font-bold text-lg text-foreground truncate">{selected.client_nom}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-bold flex-shrink-0 ${STATUT_STYLE[selected.statut]}`}>{STATUT_LABEL[selected.statut]}</span>
        </div>
      </div>

      {msg && (
        <div className={`px-4 py-3 rounded-2xl text-sm font-medium ${msg.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>{msg.text}</div>
      )}

      {/* Lignes produits */}
      <div className="rounded-2xl border border-border bg-white overflow-hidden shadow-sm">
        <div className="px-4 py-3 bg-muted/60 border-b border-border">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Produits à livrer</p>
        </div>
        {selected.lignes.map((l, i) => (
          <div key={i} className={`px-4 py-3 flex items-center justify-between ${i > 0 ? "border-t border-border" : ""}`}>
            <div>
              <p className="font-semibold text-sm">{l.article_nom ?? "Article"}</p>
              <p className="text-xs text-muted-foreground">{l.qte_livree ?? l.qte_commandee ?? 0} {l.unite ?? "kg"}</p>
            </div>
            <p className="font-bold text-sm">{DH(l.montant ?? 0)}</p>
          </div>
        ))}
        <div className="px-4 py-3 bg-green-50 border-t-2 border-green-200 flex items-center justify-between">
          <p className="font-bold text-green-800">TOTAL</p>
          <p className="text-xl font-black text-green-700">{DH(selected.montant_total)}</p>
        </div>
      </div>

      {/* BL pas encore validé au back-office → traitement bloqué */}
      {notValidatedBO && (
        <div className="px-4 py-3 rounded-2xl bg-slate-100 border border-slate-300 text-slate-700 text-sm font-semibold flex items-center gap-2">
          <span>⛔</span> Ce BL n&apos;est pas encore validé au back-office. Vous pourrez le traiter une fois validé.
        </div>
      )}

      {/* Formulaire validation */}
      {canValidate && (
        <div className="rounded-2xl border border-border bg-white p-4 shadow-sm flex flex-col gap-4">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Validation livraison</p>

          {/* Montant encaissé */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-slate-700">Montant encaissé (DH)</label>
            <input
              type="number"
              value={encaisse}
              onChange={e => setEncaisse(e.target.value)}
              inputMode="decimal"
              className="px-4 py-3 rounded-xl border border-border bg-background text-lg font-semibold"
              placeholder={String(selected.montant_total)}
            />
          </div>

          {/* GPS */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-700">Position GPS</p>
              {gpsCaptured ? (
                <p className="text-xs text-green-600 font-medium">{gpsCaptured.lat.toFixed(5)}, {gpsCaptured.lng.toFixed(5)}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Non capturée</p>
              )}
            </div>
            <button onClick={captureGPS} disabled={gpsLoading} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${gpsCaptured ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
              {gpsLoading ? "…" : gpsCaptured ? "Recapturer" : "Capturer GPS"}
            </button>
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-slate-700">Notes (optionnel)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="px-3 py-2 rounded-xl border border-border bg-background text-sm resize-none" placeholder="Problème, retour partiel…" />
          </div>
        </div>
      )}

      {/* Signature */}
      {showSig && (
        <SignaturePad
          onSave={dataUrl => handleValider(dataUrl)}
          onCancel={() => setShowSig(false)}
        />
      )}

      {/* Boutons action */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border flex flex-col gap-2 z-20">
        {/* Imprimer */}
        <button onClick={() => handlePrint(selected)} className="w-full py-3 rounded-2xl border border-border bg-white text-sm font-semibold text-slate-700 hover:bg-muted transition-colors flex items-center justify-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
          Imprimer / AirPrint
        </button>

        {canValidate && (
          <div className="grid grid-cols-3 gap-2">
            <button onClick={handleRetour} disabled={saving} className="py-3 rounded-2xl bg-red-100 text-red-700 text-sm font-bold hover:bg-red-200 transition-colors">
              Retour
            </button>
            <button onClick={handlePartiel} disabled={saving} className="py-3 rounded-2xl bg-orange-100 text-orange-700 text-sm font-bold hover:bg-orange-200 transition-colors">
              Partiel
            </button>
            <button onClick={() => setShowSig(true)} disabled={saving} className="py-3 rounded-2xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 transition-colors flex items-center justify-center gap-1">
              {saving ? "…" : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  Livré
                </>
              )}
            </button>
          </div>
        )}

        {isLivre && (
          <div className="flex items-center justify-center gap-2 py-2 text-green-700 font-bold">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Livraison confirmée
          </div>
        )}
      </div>
    </div>
  )
}
