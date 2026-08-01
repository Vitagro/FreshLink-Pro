"use client"

import { useState, useEffect } from "react"
import { store, type BonAchat, type PurchaseOrder, type Reception, type Article, type Fournisseur, type ContenantTare, ROLE_LABELS, paDeviationConfirmMessage } from "@/lib/store"
import ArticleCombobox from "@/components/ui/ArticleCombobox"

type SourceTab = "bons" | "po" | "manuel" | "historique"

const DH = (n: number) => n.toLocaleString("fr-MA", { minimumFractionDigits: 2 }) + " DH"

// Roles authorized to perform reception
const RECEPTION_ALLOWED_ROLES = ["super_super_admin", "super_admin", "admin", "resp_logistique", "magasinier", "dispatcheur", "acheteur", "resp_achat", "chef_depot"]

export default function BOReception({ user }: { user: { id: string; name: string; role: string } }) {
  const [tab, setTab] = useState<SourceTab>("bons")
  const [histSearch, setHistSearch] = useState("")
  const [histSortMode, setHistSortMode] = useState<"recent" | "alpha">("recent")
  const [bonsValidés, setBonsValidés] = useState<BonAchat[]>([])
  const [pos, setPos] = useState<PurchaseOrder[]>([])
  const [receptions, setReceptions] = useState<Reception[]>([])
  const [articles, setArticles] = useState<Article[]>([])
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([])
  // Nom arabe — les lignes reception/PO ne le stockent pas, on le retrouve via l'id.
  const nomArOf = (articleId: string) => articles.find(a => a.id === articleId)?.nomAr ?? ""

  // Motif options for reliquat / ecart
  const MOTIFS_RELIQUAT = [
    { value: "",                  label: "— Motif (optionnel)" },
    { value: "non_recu",          label: "Non recu / لم يصل" },
    { value: "defect",            label: "Defectueux / معيب" },
    { value: "retour_fournisseur",label: "Retour fournisseur / مرتجع مورد" },
    { value: "manque_stock",      label: "Manque stock fournisseur / نقص مخزون" },
    { value: "erreur_commande",   label: "Erreur de commande / خطأ في الطلب" },
  ]

  const [contenants, setContenants] = useState<ContenantTare[]>([])

  // Reception modal state (shared for bon + PO)
  const [selectedBon, setSelectedBon] = useState<BonAchat | null>(null)
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null)
  const [quantitesRecues, setQuantitesRecues] = useState<Record<string, string>>({})
  const [prixRecus, setPrixRecus] = useState<Record<string, string>>({})
  // Per-article motif for reliquat
  const [motifsLignes, setMotifsLignes] = useState<Record<string, string>>({})
  // Per-article caisse counts + brut/net
  const [caisseGros, setCaisseGros] = useState<Record<string, string>>({})
  const [caisseDemi, setCaisseDemi] = useState<Record<string, string>>({})
  const [typePoids, setTypePoids] = useState<Record<string, "brut" | "net">>({})

  const contenantGros = contenants.find(c => c.nom.toLowerCase().includes("gros") || c.nom.toLowerCase().includes("plastique"))
  const contenantDemi = contenants.find(c => c.nom.toLowerCase().includes("demi") || c.nom.toLowerCase().includes("petit"))

  function calcNetReception(artId: string, brut: number): number {
    const tp = typePoids[artId] ?? "brut"
    if (tp === "net") return brut
    const tare = (Number(caisseGros[artId] ?? 0)) * (contenantGros?.poidsKg ?? 2.8)
              + (Number(caisseDemi[artId] ?? 0)) * (contenantDemi?.poidsKg ?? 2.0)
    return Math.max(0, brut - tare)
  }

  // Manual reception form
  const [manuelFournisseur, setManuelFournisseur] = useState("")
  const [manuelNotes, setManuelNotes] = useState("")
  const [manuelLignes, setManuelLignes] = useState([{ articleId: "", qteCommandee: "", qteRecue: "", prixAchat: "" }])

  useEffect(() => { refresh() }, [])

  // Se remet à jour si une commande supprimée ailleurs fait réduire/annuler
  // un PO "ouvert"/"envoyé" listé ici (cf. cascadePOAfterCommandeDelete).
  useEffect(() => {
    const WATCHED = new Set(["fl_purchase_orders", "fl_commandes", "fl_bons_achat"])
    const handler = (e: Event) => {
      if (WATCHED.has((e as CustomEvent).detail as string)) refresh()
    }
    window.addEventListener("fl_store_updated", handler)
    return () => window.removeEventListener("fl_store_updated", handler)
  }, [])

  const refresh = () => {
    setBonsValidés(store.getBonsAchat().filter(b => b.statut === "validé"))
    setPos(store.getPurchaseOrders().filter(p => p.statut === "envoyé" || p.statut === "ouvert"))
    setReceptions(store.getReceptions())
    setArticles(store.getArticles())
    setFournisseurs(store.getFournisseurs())
    setContenants(store.getContenantsConfig().filter(c => c.actif))
  }

  // --- Bon achat reception ---
  // Pre-fill with RELIQUAT only: commanded qty minus already received in previous receptions
  const openBonReception = (bon: BonAchat) => {
    setSelectedBon(bon)
    setSelectedPO(null)
    // Sum already received for this bon across all previous receptions
    const prevReceptions = receptions.filter(r => r.bonAchatId === bon.id)
    const alreadyReceived: Record<string, number> = {}
    prevReceptions.forEach(r => {
      r.lignes.forEach(l => {
        alreadyReceived[l.articleId] = (alreadyReceived[l.articleId] ?? 0) + l.quantiteRecue
      })
    })
    const init: Record<string, string> = {}
    bon.lignes.forEach(l => {
      const reste = Math.max(0, l.quantite - (alreadyReceived[l.articleId] ?? 0))
      init[l.articleId] = reste.toString()
    })
    setQuantitesRecues(init)
    setPrixRecus({})
    setMotifsLignes({})
  }

  // Determine reception statut based on quantities
  const getReceptionStatut = (lignes: { quantiteCommandee: number; quantiteRecue: number }[]): Reception["statut"] => {
    const totalCmd = lignes.reduce((s, l) => s + l.quantiteCommandee, 0)
    const totalRecu = lignes.reduce((s, l) => s + l.quantiteRecue, 0)
    if (totalRecu === 0) return "en_attente"
    if (totalRecu < totalCmd) return "partielle"
    return "validée"
  }

  const handleValiderBon = () => {
    if (!selectedBon) return
    let totalGros = 0, totalDemi = 0
    const lignes = selectedBon.lignes.map(l => {
      const brutQty = Number(quantitesRecues[l.articleId] ?? 0)
      const netQty = calcNetReception(l.articleId, brutQty)
      const g = Number(caisseGros[l.articleId] ?? 0)
      const d = Number(caisseDemi[l.articleId] ?? 0)
      totalGros += g
      totalDemi += d
      return {
        articleId: l.articleId,
        articleNom: l.articleNom,
        quantiteCommandee: l.quantite,
        quantiteRecue: netQty,
        quantiteBrute: brutQty,
        nbCaisseGros: g,
        nbCaisseDemi: d,
        typePoids: typePoids[l.articleId] ?? "brut",
        prixAchat: Number(prixRecus[l.articleId] ?? l.prixAchat),
        motifReliquat: motifsLignes[l.articleId] || undefined,
      }
    })
    const statut = getReceptionStatut(lignes)
    const r: Reception = {
      id: store.genId(), date: store.today(),
      bonAchatId: selectedBon.id, source: "bon_achat",
      fournisseurNom: selectedBon.fournisseurNom,
      lignes, statut, operateurId: user.id,
    }
    store.addReception(r)
    if (statut === "validée") {
      store.updateBonAchat(selectedBon.id, { statut: "receptionné" })
    }
    lignes.forEach(l => { if (l.quantiteRecue > 0) store.updateStock(l.articleId, l.quantiteRecue) })
    // Record caisse mouvement (entree a la reception)
    if (totalGros > 0 || totalDemi > 0) {
      store.addCaisseMouvement({
        id: store.genId(), date: store.today(),
        heure: new Date().toTimeString().slice(0, 5),
        typeOperation: "reception", sens: "entree",
        nbCaisseGros: totalGros, nbCaisseDemi: totalDemi,
        referenceDoc: r.id,
        operateurId: user.id, operateurNom: user.name,
        notes: `Reception bon ${selectedBon.id}`,
      })
    }
    setSelectedBon(null)
    setMotifsLignes({})
    setCaisseGros({}); setCaisseDemi({}); setTypePoids({})
    refresh()
  }

  const handleMettreEnStandByBon = () => {
    if (!selectedBon) return
    const lignes = selectedBon.lignes.map(l => ({
      articleId: l.articleId,
      articleNom: l.articleNom,
      quantiteCommandee: l.quantite,
      quantiteRecue: 0,
      prixAchat: Number(prixRecus[l.articleId] ?? l.prixAchat),
    }))
    const r: Reception = {
      id: store.genId(), date: store.today(),
      bonAchatId: selectedBon.id, source: "bon_achat",
      fournisseurNom: selectedBon.fournisseurNom,
      lignes, statut: "stand_by", operateurId: user.id,
      notes: "Mise en stand-by — en attente de disponibilite fournisseur",
    }
    store.addReception(r)
    setSelectedBon(null)
    refresh()
  }

  // --- PO reception ---
  // Pre-fill with RELIQUAT only for PO as well
  const openPOReception = (po: PurchaseOrder) => {
    setSelectedPO(po)
    setSelectedBon(null)
    const prevReceptions = receptions.filter(r => r.purchaseOrderId === po.id)
    const alreadyReceived = prevReceptions.reduce((s, r) => {
      const l = r.lignes.find(l => l.articleId === po.articleId)
      return s + (l?.quantiteRecue ?? 0)
    }, 0)
    const reste = Math.max(0, po.quantite - alreadyReceived)
    setQuantitesRecues({ [po.articleId]: reste.toString() })
    setPrixRecus({ [po.articleId]: po.prixUnitaire.toString() })
    setMotifsLignes({})
  }

  const handleValiderPO = () => {
    if (!selectedPO) return
    const qteRecue = Number(quantitesRecues[selectedPO.articleId] ?? 0)
    const prixAchat = Number(prixRecus[selectedPO.articleId] ?? selectedPO.prixUnitaire)
    const art = articles.find(a => a.id === selectedPO.articleId)
    // Garde-fou anti-faute-de-frappe (FR + AR) avant d'écraser le PA catalogue
    if (prixAchat > 0) {
      const deviation = store.checkPaDeviationSuspecte(selectedPO.articleId, prixAchat)
      if (deviation && !window.confirm(paDeviationConfirmMessage(deviation))) return
    }
    const lignes = [{
      articleId: selectedPO.articleId,
      articleNom: selectedPO.articleNom,
      quantiteCommandee: selectedPO.quantite,
      quantiteRecue: qteRecue,
      prixAchat,
      motifReliquat: motifsLignes[selectedPO.articleId] || undefined,
    }]
    const statut = getReceptionStatut(lignes)
    const r: Reception = {
      id: store.genId(), date: store.today(),
      bonAchatId: "", purchaseOrderId: selectedPO.id,
      source: "purchase_order", fournisseurNom: selectedPO.fournisseurNom,
      lignes, statut, operateurId: user.id,
    }
    store.addReception(r)
    if (statut === "validée") {
      store.updatePurchaseOrder(selectedPO.id, { statut: "receptionné" })
    }
    if (qteRecue > 0) store.updateStock(selectedPO.articleId, qteRecue)
    if (art && prixAchat > 0) {
      store.addHistoriquePrixAchat(selectedPO.articleId, {
        date: new Date().toISOString(),
        fournisseurId: selectedPO.fournisseurId,
        fournisseurNom: selectedPO.fournisseurNom,
        prixAchat, quantite: qteRecue,
      })
    }
    setSelectedPO(null)
    setMotifsLignes({})
    refresh()
  }

  const handleMettreEnStandByPO = () => {
    if (!selectedPO) return
    const r: Reception = {
      id: store.genId(), date: store.today(),
      bonAchatId: "", purchaseOrderId: selectedPO.id,
      source: "purchase_order", fournisseurNom: selectedPO.fournisseurNom,
      lignes: [{ articleId: selectedPO.articleId, articleNom: selectedPO.articleNom, quantiteCommandee: selectedPO.quantite, quantiteRecue: 0 }],
      statut: "stand_by", operateurId: user.id,
      notes: "Mise en stand-by — en attente de disponibilite fournisseur",
    }
    store.addReception(r)
    setSelectedPO(null)
    refresh()
  }

  // --- Manual reception ---
  const handleValiderManuel = () => {
    const lignes = manuelLignes
      .filter(l => l.articleId && l.qteRecue)
      .map(l => {
        const art = articles.find(a => a.id === l.articleId)!
        return {
          articleId: l.articleId, articleNom: art?.nom || "",
          quantiteCommandee: Number(l.qteCommandee) || Number(l.qteRecue),
          quantiteRecue: Number(l.qteRecue),
          prixAchat: Number(l.prixAchat) || 0,
        }
      })
    if (lignes.length === 0) return
    // Garde-fou anti-faute-de-frappe (FR + AR) avant d'écraser le PA catalogue
    for (const l of lignes) {
      if (l.prixAchat <= 0) continue
      const deviation = store.checkPaDeviationSuspecte(l.articleId, l.prixAchat)
      if (deviation && !window.confirm(paDeviationConfirmMessage(deviation))) return
    }
    const fourNom = fournisseurs.find(f => f.id === manuelFournisseur)?.nom || manuelFournisseur
    const r: Reception = {
      id: store.genId(), date: store.today(),
      bonAchatId: "", source: "manuel",
      fournisseurNom: fourNom, notes: manuelNotes,
      lignes, statut: "validée", operateurId: user.id,
    }
    store.addReception(r)
    lignes.forEach(l => {
      if (l.quantiteRecue > 0) store.updateStock(l.articleId, l.quantiteRecue)
      if (l.prixAchat > 0 && manuelFournisseur) {
        store.addHistoriquePrixAchat(l.articleId, {
          date: new Date().toISOString(),
          fournisseurId: manuelFournisseur, fournisseurNom: fourNom,
          prixAchat: l.prixAchat, quantite: l.quantiteRecue,
        })
      }
    })
    setManuelLignes([{ articleId: "", qteCommandee: "", qteRecue: "", prixAchat: "" }])
    setManuelFournisseur("")
    setManuelNotes("")
    refresh()
    setTab("historique")
  }

  const TABS: { id: SourceTab; label: string; count?: number }[] = [
    { id: "bons", label: "Bons d'achat", count: bonsValidés.length },
    { id: "po", label: "Purchase Orders", count: pos.length },
    { id: "manuel", label: "Manuel" },
    { id: "historique", label: "Historique", count: receptions.length },
  ]

  const sourceColor: Record<string, string> = {
    bon_achat: "bg-blue-100 text-blue-800",
    purchase_order: "bg-purple-100 text-purple-800",
    manuel: "bg-amber-100 text-amber-800",
  }
  const sourceLabel: Record<string, string> = {
    bon_achat: "Bon achat", purchase_order: "PO", manuel: "Manuel",
  }
  const statutReceptionConfig: Record<string, { label: string; labelAr: string; cls: string }> = {
    en_attente: { label: "En attente",   labelAr: "في الانتظار",    cls: "bg-yellow-100 text-yellow-800" },
    stand_by:   { label: "Stand-by",     labelAr: "انتظار المورد",  cls: "bg-orange-100 text-orange-700 border border-orange-300" },
    partielle:  { label: "Partielle",    labelAr: "استلام جزئي",    cls: "bg-amber-100 text-amber-800 border border-amber-300" },
    validée:    { label: "Complete",     labelAr: "مكتمل",          cls: "bg-green-100 text-green-800" },
  }

  // Access guard — only logistique + admin can perform reception
  if (!RECEPTION_ALLOWED_ROLES.includes(user.role)) {
    return (
      <div className="flex flex-col items-center justify-center h-80 gap-5">
        <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center">
          <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <div className="text-center">
          <h3 className="text-lg font-bold text-foreground">Acces non autorise</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            La reception de marchandises est reservee exclusivement aux membres de la <strong>Logistique</strong> (Resp. Logistique, Magasinier, Dispatcheur) et aux <strong>Administrateurs</strong>.
          </p>
          <p className="text-xs text-muted-foreground mt-2 font-mono bg-muted px-3 py-1.5 rounded-lg inline-block">
            Votre role: <strong>{(ROLE_LABELS as Record<string, string>)[user.role] ?? user.role}</strong> — non autorise
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">

      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-2xl p-1 w-full">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${tab === t.id ? "text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            style={tab === t.id ? { background: "oklch(0.38 0.2 260)" } : {}}>
            {t.label}
            {t.count !== undefined && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${tab === t.id ? "bg-white/20 text-white" : "bg-muted-foreground/20 text-muted-foreground"}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ═══ BONS D'ACHAT ═══ */}
      {tab === "bons" && (
        <div className="flex flex-col gap-3">
          <h3 className="font-bold text-foreground">Bons d{"'"}achat valides a receptionner / فواتير الشراء للاستلام</h3>
          {bonsValidés.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border p-10 text-center text-muted-foreground">
              Aucun bon en attente de reception
            </div>
          ) : bonsValidés.map(bon => (
            <div key={bon.id} className="bg-card rounded-2xl border border-border p-4 flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-foreground">{bon.fournisseurNom}</p>
                  <span className="text-xs text-muted-foreground">{bon.date}</span>
                  <span className="text-xs text-muted-foreground">• {bon.acheteurNom}</span>
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {bon.lignes.map(l => (
                    <span key={l.articleId} className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                      {l.articleNom} x{l.quantite}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-bold text-primary text-sm">
                  {DH(bon.lignes.reduce((s, l) => s + l.quantite * l.prixAchat, 0))}
                </span>
                <button onClick={() => openBonReception(bon)}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-white hover:opacity-90"
                  style={{ background: "oklch(0.38 0.2 260)" }}>
                  Receptionner
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ PURCHASE ORDERS ═══ */}
      {tab === "po" && (
        <div className="flex flex-col gap-3">
          <h3 className="font-bold text-foreground">Purchase Orders a receptionner / طلبات الشراء للاستلام</h3>
          {pos.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border p-10 text-center text-muted-foreground">
              Aucun PO en attente de reception
            </div>
          ) : pos.map(po => (
            <div key={po.id} className="bg-card rounded-2xl border border-border p-4 flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${po.statut === "envoyé" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>{po.statut}</span>
                  <p className="font-bold text-foreground">
                    {po.articleNom}
                    {nomArOf(po.articleId) && <span className="ml-1.5 font-normal text-muted-foreground font-arabic" dir="rtl" lang="ar">({nomArOf(po.articleId)})</span>}
                  </p>
                  <span className="text-xs text-muted-foreground">•</span>
                  <p className="text-sm text-muted-foreground">{po.fournisseurNom}</p>
                </div>
                <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                  <span>Qte commandee: <strong>{po.quantite} {po.articleUnite}</strong></span>
                  <span>PU: <strong>{DH(po.prixUnitaire)}</strong></span>
                  <span>Total: <strong className="text-primary">{DH(po.total)}</strong></span>
                </div>
                {po.notes && <p className="text-xs text-muted-foreground mt-1 italic">{po.notes}</p>}
              </div>
              <button onClick={() => openPOReception(po)}
                className="px-4 py-2 rounded-xl text-sm font-bold text-white hover:opacity-90 shrink-0"
                style={{ background: "oklch(0.38 0.2 260)" }}>
                Receptionner
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ═══ MANUEL ═══ */}
      {tab === "manuel" && (
        <div className="flex flex-col gap-4">
          <h3 className="font-bold text-foreground">Reception manuelle / استلام يدوي</h3>
          <p className="text-sm text-muted-foreground">Creez une reception sans bon d{"'"}achat ni PO — utile pour les achats au marche.</p>

          <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-4">
            {/* Fournisseur */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-foreground">Fournisseur / المورد</label>
                <select value={manuelFournisseur} onChange={e => setManuelFournisseur(e.target.value)}
                  className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="">-- Choisir ou laisser vide --</option>
                  {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-foreground">Notes</label>
                <input value={manuelNotes} onChange={e => setManuelNotes(e.target.value)}
                  placeholder="Achat marche, source..."
                  className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </div>

            {/* Lignes */}
            <div className="flex flex-col gap-3">
              {manuelLignes.map((l, i) => (
                <div key={i} className="p-3 rounded-xl border border-border bg-muted/20 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-muted-foreground uppercase">Article #{i + 1}</span>
                    {manuelLignes.length > 1 && (
                      <button onClick={() => setManuelLignes(prev => prev.filter((_, j) => j !== i))}
                        className="text-destructive p-1 hover:bg-red-50 rounded-lg">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                  </div>
                  <ArticleCombobox
                    articles={articles}
                    value={l.articleId}
                    onChange={(artId, _art) => { const n = [...manuelLignes]; n[i] = { ...n[i], articleId: artId }; setManuelLignes(n) }}
                    placeholder="Choisir un article"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-muted-foreground">Qte commandee</label>
                      <input type="number" min="0" step="0.1" value={l.qteCommandee}
                        onChange={e => { const n = [...manuelLignes]; n[i] = { ...n[i], qteCommandee: e.target.value }; setManuelLignes(n) }}
                        placeholder="0" className="px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-muted-foreground">Qte recue *</label>
                      <input type="number" min="0" step="0.1" value={l.qteRecue}
                        onChange={e => { const n = [...manuelLignes]; n[i] = { ...n[i], qteRecue: e.target.value }; setManuelLignes(n) }}
                        placeholder="0" className="px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-muted-foreground">PA (DH/kg)</label>
                      <input type="number" min="0" step="0.01" value={l.prixAchat}
                        onChange={e => { const n = [...manuelLignes]; n[i] = { ...n[i], prixAchat: e.target.value }; setManuelLignes(n) }}
                        placeholder="0.00" className="px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <button onClick={() => setManuelLignes(prev => [...prev, { articleId: "", qteCommandee: "", qteRecue: "", prixAchat: "" }])}
                className="text-sm text-primary font-semibold flex items-center gap-1 hover:underline">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Ajouter article
              </button>
              <button onClick={handleValiderManuel}
                disabled={manuelLignes.every(l => !l.articleId || !l.qteRecue)}
                className="px-6 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                style={{ background: "oklch(0.38 0.2 260)" }}>
                Valider la reception
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ HISTORIQUE ═══ */}
      {tab === "historique" && (() => {
        const receptionsFiltrees = receptions
          .filter(r => !histSearch.trim() || (r.fournisseurNom ?? "").toLowerCase().includes(histSearch.trim().toLowerCase()))
          .sort((a, b) => histSortMode === "alpha"
            ? (a.fournisseurNom ?? "").localeCompare(b.fournisseurNom ?? "", "fr")
            : String(b.date ?? "").localeCompare(String(a.date ?? "")))
        return (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-bold text-foreground">Historique des receptions ({receptionsFiltrees.length})</h3>
            <div className="flex items-center gap-2">
              <input value={histSearch} onChange={e => setHistSearch(e.target.value)} placeholder="🔍 Fournisseur…"
                className="px-3 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none" />
              <div className="flex gap-1 p-1 rounded-lg bg-muted/50">
                <button type="button" onClick={() => setHistSortMode("recent")}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${histSortMode === "recent" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground"}`}>
                  Récent
                </button>
                <button type="button" onClick={() => setHistSortMode("alpha")}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${histSortMode === "alpha" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground"}`}>
                  A → Z
                </button>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  {["Date", "Source", "Fournisseur", "Articles", "Statut"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-muted-foreground font-semibold text-xs uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {receptionsFiltrees.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Aucune reception</td></tr>
                ) : receptionsFiltrees.map(r => (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs">{r.date}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sourceColor[r.source] || "bg-muted text-muted-foreground"}`}>
                        {sourceLabel[r.source] || r.source}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">{r.fournisseurNom || "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs">
                      <div className="flex flex-col gap-0.5">
                        {r.lignes.map((l, i) => (
                          <span key={i}>
                            {l.articleNom}{" "}
                            <span className="font-mono text-foreground">{l.quantiteRecue}/{l.quantiteCommandee}</span>
                            {l.motifReliquat && (
                              <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-bold uppercase">
                                {l.motifReliquat.replace(/_/g, " ")}
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const cfg = statutReceptionConfig[r.statut] ?? statutReceptionConfig.en_attente
                        return (
                          <div className="flex flex-col gap-0.5">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full w-fit ${cfg.cls}`}>
                              {cfg.label}
                            </span>
                            <span className="text-[9px] text-muted-foreground">{cfg.labelAr}</span>
                          </div>
                        )
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        )
      })()}

      {/* ═══ MODALS ═══ */}

      {/* Bon achat reception modal */}
      {selectedBon && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={e => { if (e.target === e.currentTarget) setSelectedBon(null) }}>
          <div className="bg-card rounded-2xl p-6 w-full max-w-lg flex flex-col gap-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-foreground">Reception — {selectedBon.fournisseurNom}</h3>
                <p className="text-xs text-muted-foreground font-mono">{selectedBon.id} · {selectedBon.date}</p>
              </div>
              <button onClick={() => setSelectedBon(null)} className="p-2 hover:bg-muted rounded-lg">
                <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Reliquat summary banner */}
            {(() => {
              const prevRec = receptions.filter(r => r.bonAchatId === selectedBon.id)
              if (prevRec.length === 0) return null
              const totalPrevRecu = selectedBon.lignes.reduce((s, l) => {
                const alr = prevRec.reduce((rs, r) => {
                  const rl = r.lignes.find(rl => rl.articleId === l.articleId)
                  return rs + (rl?.quantiteRecue ?? 0)
                }, 0)
                return s + alr
              }, 0)
              const totalCmd = selectedBon.lignes.reduce((s, l) => s + l.quantite, 0)
              return (
                <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <div>
                    <span className="font-bold">2e reception — reliquat uniquement</span>
                    <span className="ml-2 text-amber-700">
                      Deja recu: {totalPrevRecu.toFixed(2)} / {totalCmd.toFixed(2)} — Reste: {(totalCmd - totalPrevRecu).toFixed(2)}
                    </span>
                  </div>
                </div>
              )
            })()}
            <div className="flex flex-col gap-3">
              {selectedBon.lignes.map(l => {
                const qteRecue = Number(quantitesRecues[l.articleId] ?? l.quantite)
                const conforme = qteRecue === l.quantite
                return (
                  <div key={l.articleId} className="p-3 rounded-xl border border-border bg-muted/20">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-semibold text-foreground text-sm">{l.articleNom}</p>
                        {nomArOf(l.articleId) && <p className="text-xs text-muted-foreground font-arabic" dir="rtl" lang="ar">{nomArOf(l.articleId)}</p>}
                      </div>
                      <span className={`w-2 h-2 rounded-full ${conforme ? "bg-green-500" : "bg-yellow-500"}`} />
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mb-2">
                      <span>Commande: <strong>{l.quantite}</strong></span>
                      <span>PA prevu: <strong>{DH(l.prixAchat)}</strong></span>
                    </div>
                    {/* Brut / Net toggle */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-muted-foreground">Poids :</span>
                      {(["brut", "net"] as const).map(tp => (
                        <button key={tp} type="button"
                          onClick={() => setTypePoids(prev => ({ ...prev, [l.articleId]: tp }))}
                          className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-colors ${(typePoids[l.articleId] ?? "brut") === tp ? "bg-primary text-white border-primary" : "border-border text-muted-foreground"}`}>
                          {tp === "brut" ? "Brut" : "Net"}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold">
                          Qte {(typePoids[l.articleId] ?? "brut") === "brut" ? "brute" : "nette"} recue
                        </label>
                        <input type="number" min="0" value={quantitesRecues[l.articleId] ?? l.quantite}
                          onChange={e => setQuantitesRecues(prev => ({ ...prev, [l.articleId]: e.target.value }))}
                          className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold">PA reel (DH)</label>
                        <input type="number" min="0" step="0.01" value={prixRecus[l.articleId] ?? l.prixAchat}
                          onChange={e => setPrixRecus(prev => ({ ...prev, [l.articleId]: e.target.value }))}
                          className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                    </div>
                    {/* Caisses */}
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-amber-700 font-semibold">Nb gros caisses</label>
                        <input type="number" min="0" value={caisseGros[l.articleId] ?? ""}
                          onChange={e => setCaisseGros(prev => ({ ...prev, [l.articleId]: e.target.value }))}
                          placeholder="0"
                          className="px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-cyan-700 font-semibold">Nb demi-caisses</label>
                        <input type="number" min="0" value={caisseDemi[l.articleId] ?? ""}
                          onChange={e => setCaisseDemi(prev => ({ ...prev, [l.articleId]: e.target.value }))}
                          placeholder="0"
                          className="px-3 py-1.5 rounded-lg border border-cyan-300 bg-cyan-50 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-400" />
                      </div>
                    </div>
                    {/* Poids net preview when brut mode */}
                    {(typePoids[l.articleId] ?? "brut") === "brut" &&
                      quantitesRecues[l.articleId] !== undefined &&
                      (Number(caisseGros[l.articleId] ?? 0) > 0 || Number(caisseDemi[l.articleId] ?? 0) > 0) && (
                      <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 text-xs">
                        <span className="text-blue-700 font-semibold">
                          Brut: {quantitesRecues[l.articleId]} kg — Tare: {(Number(caisseGros[l.articleId] ?? 0) * (contenantGros?.poidsKg ?? 2.8) + Number(caisseDemi[l.articleId] ?? 0) * (contenantDemi?.poidsKg ?? 2.0)).toFixed(1)} kg →
                          <strong className="text-blue-900"> Net: {calcNetReception(l.articleId, Number(quantitesRecues[l.articleId])).toFixed(2)} kg</strong>
                        </span>
                      </div>
                    )}
                    {/* Motif reliquat — shown when qty received < ordered */}
                    {Number(quantitesRecues[l.articleId] ?? l.quantite) < l.quantite && (
                      <div className="flex flex-col gap-1 mt-1">
                        <label className="text-xs font-semibold text-amber-700">
                          Motif reliquat ({(l.quantite - Number(quantitesRecues[l.articleId] ?? l.quantite)).toFixed(2)} manquant)
                        </label>
                        <select
                          value={motifsLignes[l.articleId] ?? ""}
                          onChange={e => setMotifsLignes(prev => ({ ...prev, [l.articleId]: e.target.value }))}
                          className="px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-xs font-medium text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-400">
                          {MOTIFS_RELIQUAT.map(m => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {/* Partial notice */}
            {(() => {
              const totalCmd = selectedBon.lignes.reduce((s, l) => s + l.quantite, 0)
              const totalRecu = selectedBon.lignes.reduce((s, l) => s + Number(quantitesRecues[l.articleId] ?? l.quantite), 0)
              if (totalRecu > 0 && totalRecu < totalCmd) {
                return (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Manque detecte — la reception sera marquee <strong className="mx-1">Partielle</strong> / استلام جزئي
                  </div>
                )
              }
              return null
            })()}
            <div className="flex gap-2 pt-2 flex-wrap">
              <button onClick={handleMettreEnStandByBon}
                className="flex-1 py-2.5 rounded-xl border-2 border-orange-300 text-orange-700 bg-orange-50 text-sm font-semibold hover:bg-orange-100 transition-colors">
                Stand-by / انتظار
              </button>
              <button onClick={() => setSelectedBon(null)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold">Annuler</button>
              <button onClick={handleValiderBon} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:opacity-90 transition-opacity">
                Valider la reception
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PO reception modal */}
      {selectedPO && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={e => { if (e.target === e.currentTarget) setSelectedPO(null) }}>
          <div className="bg-card rounded-2xl p-6 w-full max-w-md flex flex-col gap-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-foreground">
                  Reception PO — {selectedPO.articleNom}
                  {nomArOf(selectedPO.articleId) && <span className="ml-1.5 font-normal text-muted-foreground font-arabic" dir="rtl" lang="ar">({nomArOf(selectedPO.articleId)})</span>}
                </h3>
                <p className="text-xs text-muted-foreground">{selectedPO.fournisseurNom} • {selectedPO.date}</p>
              </div>
              <button onClick={() => setSelectedPO(null)} className="p-2 hover:bg-muted rounded-lg">
                <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-3 rounded-xl border border-border bg-muted/20 flex flex-col gap-3">
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>Commande: <strong>{selectedPO.quantite} {selectedPO.articleUnite}</strong></span>
                <span>PU commande: <strong>{DH(selectedPO.prixUnitaire)}</strong></span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-foreground">Qte recue</label>
                  <input type="number" min="0" step="0.1" value={quantitesRecues[selectedPO.articleId] ?? selectedPO.quantite}
                    onChange={e => setQuantitesRecues(prev => ({ ...prev, [selectedPO!.articleId]: e.target.value }))}
                    className="px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-foreground">PA reel (DH/{selectedPO.articleUnite})</label>
                  <input type="number" min="0" step="0.01" value={prixRecus[selectedPO.articleId] ?? selectedPO.prixUnitaire}
                    onChange={e => setPrixRecus(prev => ({ ...prev, [selectedPO!.articleId]: e.target.value }))}
                    className="px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </div>
              {/* Motif reliquat PO */}
              {Number(quantitesRecues[selectedPO.articleId] ?? selectedPO.quantite) < selectedPO.quantite && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-amber-700">
                    Motif reliquat ({(selectedPO.quantite - Number(quantitesRecues[selectedPO.articleId] ?? selectedPO.quantite)).toFixed(2)} {selectedPO.articleUnite} manquant)
                  </label>
                  <select
                    value={motifsLignes[selectedPO.articleId] ?? ""}
                    onChange={e => setMotifsLignes(prev => ({ ...prev, [selectedPO!.articleId]: e.target.value }))}
                    className="px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-xs font-medium text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-400">
                    {MOTIFS_RELIQUAT.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            {/* Partial notice */}
            {(() => {
              const qteRecue = Number(quantitesRecues[selectedPO.articleId] ?? selectedPO.quantite)
              if (qteRecue > 0 && qteRecue < selectedPO.quantite) {
                return (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Manque: <strong className="mx-1">{(selectedPO.quantite - qteRecue).toFixed(2)} {selectedPO.articleUnite}</strong> — statut: <strong className="ml-1">Partielle</strong>
                  </div>
                )
              }
              return null
            })()}
            <div className="flex gap-2 flex-wrap">
              <button onClick={handleMettreEnStandByPO}
                className="flex-1 py-2.5 rounded-xl border-2 border-orange-300 text-orange-700 bg-orange-50 text-sm font-semibold hover:bg-orange-100 transition-colors">
                Stand-by / انتظار
              </button>
              <button onClick={() => setSelectedPO(null)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold">Annuler</button>
              <button onClick={handleValiderPO} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:opacity-90 transition-opacity">
                Valider
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
