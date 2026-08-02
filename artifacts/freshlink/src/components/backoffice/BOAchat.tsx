"use client"

import { useState, useEffect } from "react"
import { store, type BonAchat, type Article, type Fournisseur, type ChargeArticle, paDeviationConfirmMessage } from "@/lib/store"
import { hasPermission } from "@/lib/permissions"
import { logAction } from "@/lib/auditLog"
import { sendEmail, buildAchatEmail } from "@/lib/email"
import ArticleCombobox from "@/components/ui/ArticleCombobox"

export default function BOAchat() {
  const [bons, setBons] = useState<BonAchat[]>([])
  const [articles, setArticles] = useState<Article[]>([])
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editArticle, setEditArticle] = useState<Article | null>(null)
  const [editFournisseur, setEditFournisseur] = useState<Fournisseur | null>(null)
  const [showArticleForm, setShowArticleForm] = useState(false)
  const [showFournisseurForm, setShowFournisseurForm] = useState(false)
  const [tab, setTab] = useState<"bons" | "articles" | "fournisseurs">("bons")
  const [emailConfig, setEmailConfig] = useState(store.getEmailConfig().achat)
  // Catalogue de charges (coût de revient) + état du mini-formulaire d'ajout
  const [chargesArticle, setChargesArticle] = useState<ChargeArticle[]>([])
  const [showChargeForm, setShowChargeForm] = useState(false)
  const [newChargeNom, setNewChargeNom] = useState("")
  const [newChargeMontant, setNewChargeMontant] = useState("")
  // Nombre de doublons physiques (ids écartés par la fusion par nom)
  const [dupCount, setDupCount] = useState(0)

  // Form state
  const [formFournisseurId, setFormFournisseurId] = useState("")
  // paMethode: "par_unite" = PA saisi en DH/kg  |  "global" = montant total payé / quantite = PA
  const [formLignes, setFormLignes] = useState([{ articleId: "", quantite: "", prixAchat: "", montantGlobal: "", paMethode: "par_unite" as "par_unite" | "global" }])
  const [formEmail, setFormEmail] = useState("")

  // Helper: compute PA from a ligne based on method
  const computePALigne = (l: typeof formLignes[0]) => {
    if (l.paMethode === "global") {
      const qty = Number(l.quantite)
      const global = Number(l.montantGlobal)
      return qty > 0 ? global / qty : 0
    }
    return Number(l.prixAchat)
  }

  const addFormLigne = () => setFormLignes(prev => [...prev, { articleId: "", quantite: "", prixAchat: "", montantGlobal: "", paMethode: "par_unite" }])

  // Article form
  const [artNom, setArtNom] = useState("")
  const [artNomAr, setArtNomAr] = useState("")
  const [artFamille, setArtFamille] = useState("Légumes fruits")
  const [artUnite, setArtUnite] = useState("kg")
  const [artStock, setArtStock] = useState("")
  const [artPrixAchat, setArtPrixAchat] = useState("")
  const [artPrixVente, setArtPrixVente] = useState("")
  const [artPhoto, setArtPhoto] = useState("")

  const FAMILLES_OPTIONS = [
    "Légumes fruits","Légumes racines","Légumes feuilles",
    "Herbes aromatiques","Agrumes","Fruits tropicaux","Fruits rouges","Fruits secs",
  ]

  // Fournisseur form
  const [fNom, setFNom] = useState("")
  const [fContact, setFContact] = useState("")
  const [fEmail, setFEmail] = useState("")

  useEffect(() => {
    refresh()
    setFormEmail(store.getEmailConfig().achat)
  }, [])

  // Rechargement Realtime depuis un autre appareil
  useEffect(() => {
    const handler = (e: Event) => {
      const ev = e as CustomEvent<{ table: string }>
      const relevant = ["fl_bons_achat", "fl_articles", "fl_fournisseurs", "all"]
      if (!ev.detail?.table || relevant.includes(ev.detail.table)) refresh()
    }
    window.addEventListener("fl_store_updated", handler)
    return () => window.removeEventListener("fl_store_updated", handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refresh = () => {
    setBons(store.getBonsAchat())
    setArticles(store.getArticles())
    setFournisseurs(store.getFournisseurs())
    setChargesArticle(store.getChargesArticle())
    setDupCount(computeDupCount())
  }

  // Compte les ids physiquement en double (présents en localStorage mais
  // écartés par la fusion par nom de store.getArticles()).
  const computeDupCount = (): number => {
    let raw: unknown = []
    try { raw = JSON.parse(localStorage.getItem("fl_articles") || "[]") } catch { return 0 }
    if (!Array.isArray(raw)) return 0
    const kept = new Set(store.getArticles().map(a => a.id))
    const seen = new Set<string>()
    let n = 0
    for (const a of raw as Article[]) {
      const id = a?.id
      if (!id || seen.has(id)) continue
      seen.add(id)
      if (!kept.has(id)) n++
    }
    return n
  }

  // Fusion physique des doublons : garde la version canonique (la plus
  // complète, déjà calculée par getArticles) et supprime définitivement les
  // enregistrements écartés de localStorage ET de Supabase.
  const handleMergeDuplicates = async () => {
    let raw: unknown = []
    try { raw = JSON.parse(localStorage.getItem("fl_articles") || "[]") } catch {}
    const canonical = store.getArticles()
    const keptIds = new Set(canonical.map(a => a.id))
    const dropIds = [...new Set(
      (Array.isArray(raw) ? (raw as Article[]) : [])
        .map(a => a?.id)
        .filter((id): id is string => !!id && !keptIds.has(id))
    )]
    if (dropIds.length === 0) { alert("✅ Aucun doublon à fusionner."); return }
    if (!confirm(
      `${dropIds.length} doublon(s) seront fusionnés dans l'article le plus complet ` +
      `puis supprimés définitivement (localStorage + Supabase).\n\nContinuer ?`
    )) return
    // 1. localStorage = version canonique fusionnée
    store.saveArticles(canonical)
    setArticles(canonical)
    // 2. supprimer les ids écartés de Supabase
    try {
      const { deleteArticle } = await import("@/lib/supabase/db")
      for (const id of dropIds) {
        try { await deleteArticle(id) } catch (e) { console.error("[BOAchat] delete dup error", id, e) }
      }
    } catch (e) {
      console.error("[BOAchat] merge duplicates error:", e)
    }
    setDupCount(0)
    alert(`✅ ${dropIds.length} doublon(s) fusionné(s) et supprimé(s).`)
    refresh()
  }

  // ── Charges coût de revient (catalogue + affectation par article) ─────────
  // fl_charges_article : table partagée Supabase (sync explicite, pas d'auto-diff
  // possible sur un upsert de liste complète sans cle stable -> upsert ligne par ligne).
  const syncChargeArticle = (c: { id: string; nom: string; montant: number }) => {
    fetch("/api/sync-write", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "fl_charges_article", upserts: [{ id: c.id, payload: c, updated_at: new Date().toISOString() }] }),
    }).catch(() => {})
  }
  const handleAddCharge = () => {
    const nom = newChargeNom.trim()
    const montant = Number(newChargeMontant)
    if (!nom || !(montant >= 0) || Number.isNaN(montant)) return
    const charge = { id: store.genId(), nom, montant }
    const next = [...chargesArticle, charge]
    store.saveChargesArticle(next)
    setChargesArticle(next)
    syncChargeArticle(charge)
    setNewChargeNom(""); setNewChargeMontant(""); setShowChargeForm(false)
  }

  // Édition inline de la valeur (montant) d'une charge — colonne Valeur du tableau
  const handleUpdateChargeMontant = (id: string, value: string) => {
    const montant = Number(value)
    const next = chargesArticle.map(c => c.id === id ? { ...c, montant: Number.isNaN(montant) ? 0 : montant } : c)
    store.saveChargesArticle(next)
    setChargesArticle(next)
    const updated = next.find(c => c.id === id)
    if (updated) syncChargeArticle(updated)
  }

  const handleDeleteCharge = (id: string) => {
    const next = chargesArticle.filter(c => c.id !== id)
    store.saveChargesArticle(next)
    setChargesArticle(next)
    fetch("/api/sync-write", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "fl_charges_article", deletes: [id] }),
    }).catch(() => {})
    // Détacher la charge des articles qui la référençaient
    const arts = store.getArticles().map(a => a.chargeArticleId === id ? { ...a, chargeArticleId: undefined } : a)
    store.saveArticles(arts)
    setArticles(arts)
  }

  const handleSetArticleCharge = async (articleId: string, chargeId: string) => {
    const arts = store.getArticles()
    const idx = arts.findIndex(a => a.id === articleId)
    if (idx < 0) return
    arts[idx] = { ...arts[idx], chargeArticleId: chargeId || undefined }
    store.saveArticles(arts)
    setArticles(arts)
    // Sync Supabase (service-role) — comme le pricing par famille
    try {
      const { upsertArticle } = await import("@/lib/supabase/db")
      await upsertArticle(arts[idx])
    } catch (e) {
      console.error("[BOAchat] sync charge article error:", e)
    }
  }

  const handleValidateBon = async (bon: BonAchat) => {
    const session = store.getSession()
    if (!hasPermission(session?.role, "valider_achat")) { logAction(session, "valider_achat", "denied", { type: "bon_achat", id: bon.id }); return }
    logAction(session, "valider_achat", "success", { type: "bon_achat", id: bon.id, label: String(bon.id) })
    store.updateBonAchat(bon.id, { statut: "validé" })
    await sendEmail({
      to_email: bon.emailDestinataire || emailConfig,
      subject: `Bon d'achat validé #${bon.id}`,
      body: buildAchatEmail(bon),
    })
    refresh()
  }

  const handleSaveEmailConfig = () => {
    const cfg = store.getEmailConfig()
    store.saveEmailConfig({ ...cfg, achat: emailConfig })
  }

  const handleSubmitBon = async () => {
    const session = store.getSession()
    if (!hasPermission(session?.role, "creer_bon_achat")) { logAction(session, "creer_bon_achat", "denied"); return }
    const fournisseur = fournisseurs.find(f => f.id === formFournisseurId)
    if (!fournisseur) return
    logAction(session, "creer_bon_achat", "success", { type: "fournisseur", label: fournisseur.nom })
    // Garde-fou anti-faute-de-frappe (FR + AR) avant d'écraser le PA catalogue
    for (const l of formLignes) {
      const pa = computePALigne(l)
      if (pa <= 0) continue
      const deviation = store.checkPaDeviationSuspecte(l.articleId, pa)
      if (deviation && !window.confirm(paDeviationConfirmMessage(deviation))) return
    }
    const lignes = formLignes.map(l => {
      const art = articles.find(a => a.id === l.articleId)!
      const pa = computePALigne(l)
      // Record historique PA in article
      store.addHistoriquePrixAchat(l.articleId, {
        date: new Date().toISOString(),
        fournisseurId: formFournisseurId,
        fournisseurNom: fournisseur.nom,
        prixAchat: pa,
        quantite: Number(l.quantite),
      })
      return { articleId: l.articleId, articleNom: art.nom, quantite: Number(l.quantite), prixAchat: pa }
    })
    const bon: BonAchat = {
      id: store.genId(),
      date: store.today(),
      createdVia: "backoffice",
      acheteurId: "admin",
      acheteurNom: "Back Office",
      fournisseurId: formFournisseurId,
      fournisseurNom: fournisseur.nom,
      lignes,
      statut: "brouillon",
      emailDestinataire: formEmail || emailConfig,
    }
    store.addBonAchat(bon)
    await sendEmail({
      to_email: bon.emailDestinataire,
      subject: `Nouveau bon d'achat #${bon.id}`,
      body: buildAchatEmail(bon),
    })

    // WhatsApp notification to fournisseur
    const phone = fournisseur.telephone?.replace(/\D/g, "") ?? ""
    if (phone) {
      const lignesText = lignes
        .map(l => `• ${l.articleNom}: ${l.quantite} — PA: ${(Number(l.prixAchat) || 0).toFixed(2)} DH`)
        .join("\n")
      const msg = encodeURIComponent(
        `🛒 Nouvelle commande FreshLink Pro\n` +
        `Ref: ${bon.id.slice(0, 12)}\nDate: ${bon.date}\n\n` +
        `${lignesText}\n\n` +
        `Merci de preparer la marchandise. / يرجى تجهيز البضاعة.\n— FreshLink Pro`
      )
      window.open(`https://wa.me/${phone}?text=${msg}`, "_blank")
    }

    setShowForm(false)
    setFormFournisseurId("")
    setFormLignes([{ articleId: "", quantite: "", prixAchat: "", montantGlobal: "", paMethode: "par_unite" }])
    refresh()
  }

  const handleSaveArticle = () => {
    const arts = store.getArticles()
    if (editArticle) {
      const idx = arts.findIndex(a => a.id === editArticle.id)
      if (idx >= 0) arts[idx] = {
        ...editArticle,
        nom: artNom, nomAr: artNomAr, famille: artFamille,
        unite: artUnite, stockDisponible: Number(artStock),
        prixAchat: Number(artPrixAchat),
        ...(artPhoto ? { photo: artPhoto } : {}),
      }
    } else {
      arts.push({
        id: store.genId(), nom: artNom, nomAr: artNomAr, famille: artFamille,
        unite: artUnite, stockDisponible: Number(artStock),
        prixAchat: Number(artPrixAchat), stockDefect: 0,
        pvMethode: "pourcentage", pvValeur: 40,
        ...(artPhoto ? { photo: artPhoto } : {}),
      })
    }
    store.saveArticles(arts)
    setShowArticleForm(false)
    setEditArticle(null)
    setArtNom(""); setArtNomAr(""); setArtFamille("Légumes fruits")
    setArtUnite("kg"); setArtStock(""); setArtPrixAchat(""); setArtPrixVente(""); setArtPhoto("")
    refresh()
  }

  const openEditArticle = (a: Article) => {
    setEditArticle(a)
    setArtNom(a.nom); setArtNomAr(a.nomAr ?? ""); setArtFamille(a.famille ?? "Légumes fruits")
    setArtUnite(a.unite); setArtStock(a.stockDisponible.toString())
    setArtPrixAchat(a.prixAchat.toString()); setArtPrixVente("")
    setArtPhoto(a.photo ?? "")
    setShowArticleForm(true)
  }

  const handleSaveFournisseur = () => {
    const fs = store.getFournisseurs()
    if (editFournisseur) {
      const idx = fs.findIndex(f => f.id === editFournisseur.id)
      if (idx >= 0) fs[idx] = { ...editFournisseur, nom: fNom, contact: fContact, email: fEmail }
    } else {
      fs.push({ id: store.genId(), nom: fNom, contact: fContact, email: fEmail, specialites: [], itineraires: [] })
    }
    store.saveFournisseurs(fs)
    setShowFournisseurForm(false)
    setEditFournisseur(null)
    setFNom(""); setFContact(""); setFEmail("")
    refresh()
  }

  const openEditFournisseur = (f: Fournisseur) => {
    setEditFournisseur(f)
    setFNom(f.nom); setFContact(f.contact); setFEmail(f.email)
    setShowFournisseurForm(true)
  }

  const statutColor: Record<string, string> = {
    brouillon: "bg-yellow-100 text-yellow-800",
    validé: "bg-blue-100 text-blue-800",
    receptionné: "bg-green-100 text-green-800",
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Email config */}
      <div className="bg-card rounded-xl border border-border p-4 flex items-center gap-3">
        <svg className="w-5 h-5 text-muted-foreground shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        <input
          type="email"
          value={emailConfig}
          onChange={e => setEmailConfig(e.target.value)}
          className="flex-1 text-sm px-3 py-2 rounded-lg border border-border bg-background font-sans focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="Email notification achat"
        />
        <button onClick={handleSaveEmailConfig} className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium font-sans hover:opacity-90">
          Sauvegarder
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-xl p-1">
        {[{ id: "bons", label: "Bons d'achat" }, { id: "articles", label: "Articles" }, { id: "fournisseurs", label: "Fournisseurs" }].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as typeof tab)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium font-sans transition-all ${tab === t.id ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Bons d'achat */}
      {tab === "bons" && (
        <div className="flex flex-col gap-4">
          <div className="flex justify-end">
            <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium font-sans hover:opacity-90 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Nouveau bon
            </button>
          </div>

          {showForm && (() => {
            const selectedFour = fournisseurs.find(f => f.id === formFournisseurId)
            const grandTotal = formLignes.reduce((s, l) => s + (computePALigne(l) * Number(l.quantite || 0)), 0)
            const today = new Date().toLocaleDateString("fr-MA", { day: "2-digit", month: "2-digit", year: "numeric" })
            const refNum = store.genBL()
            return (
              <div className="flex flex-col gap-0 rounded-2xl border-2 border-sidebar shadow-xl overflow-hidden">

                {/* ── Toolbar (screen only, not printed) ── */}
                <div className="flex items-center justify-between px-5 py-3 bg-sidebar text-sidebar-foreground print:hidden">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-sidebar-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="text-sm font-bold">Bon de Commande Fournisseur</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => window.print()} title="Imprimer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sidebar-accent text-sidebar-foreground text-xs font-semibold hover:bg-sidebar-border transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                      </svg>
                      Imprimer
                    </button>
                    <button onClick={() => setShowForm(false)}
                      className="p-1.5 rounded-lg hover:bg-sidebar-border text-sidebar-foreground/60 hover:text-sidebar-foreground">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>

                {/* ── Document canvas ── */}
                <div className="bg-white p-6 flex flex-col gap-5">

                  {/* Header: logo + title + ref */}
                  <div className="flex items-start justify-between gap-4 pb-4 border-b-2 border-sidebar">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-sidebar flex items-center justify-center shrink-0">
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l14 9-14 9V3z" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-base font-black text-sidebar tracking-tight">FreshLink Pro</p>
                          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">Distribution Fruits & Legumes</p>
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex flex-col gap-1">
                      <p className="text-xl font-black text-sidebar uppercase tracking-wide">Bon de Commande</p>
                      <p className="text-xs text-muted-foreground">طلبية شراء</p>
                      <div className="mt-1 flex flex-col items-end gap-0.5 text-xs">
                        <span className="font-mono font-bold text-foreground bg-muted px-2 py-0.5 rounded">{refNum}</span>
                        <span className="text-muted-foreground">Date: {today}</span>
                      </div>
                    </div>
                  </div>

                  {/* Two-col: Acheteur + Fournisseur */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Acheteur / Emetteur */}
                    <div className="rounded-xl border border-border p-3 flex flex-col gap-1.5 bg-muted/20">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Commande emise par / المُصدر</p>
                      <p className="font-bold text-foreground text-sm">FreshLink Pro</p>
                      <p className="text-xs text-muted-foreground">Service Achats / قسم المشتريات</p>
                      <p className="text-xs text-muted-foreground">Date: {today}</p>
                      {formEmail && <p className="text-xs text-primary font-medium">{formEmail}</p>}
                    </div>

                    {/* Fournisseur */}
                    <div className="rounded-xl border border-border p-3 flex flex-col gap-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Fournisseur / المورد</p>
                      <select
                        value={formFournisseurId}
                        onChange={e => setFormFournisseurId(e.target.value)}
                        className="px-2.5 py-2 rounded-lg border border-border bg-background text-sm font-sans focus:outline-none focus:ring-2 focus:ring-primary">
                        <option value="">Choisir un fournisseur</option>
                        {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                      </select>
                      {selectedFour && (
                        <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                          {selectedFour.contact && <span>{selectedFour.contact}</span>}
                          {selectedFour.telephone && <span className="font-medium text-foreground">{selectedFour.telephone}</span>}
                          {selectedFour.ville && <span>{selectedFour.ville}</span>}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Email destinataire */}
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-muted-foreground shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)}
                      placeholder="Email destinataire"
                      className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm font-sans focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>

                  {/* Articles table */}
                  <div className="flex flex-col gap-0 rounded-xl border border-border overflow-hidden">
                    {/* Table header */}
                    <div className="grid grid-cols-[2fr_1fr_1fr_1fr_80px_36px] gap-0 bg-sidebar text-sidebar-foreground text-[11px] font-bold uppercase tracking-wide">
                      <div className="px-3 py-2.5">Article / المنتج</div>
                      <div className="px-3 py-2.5">Qte</div>
                      <div className="px-3 py-2.5">PA (DH)</div>
                      <div className="px-3 py-2.5">Methode</div>
                      <div className="px-3 py-2.5 text-right">Total</div>
                      <div className="px-2 py-2.5"></div>
                    </div>

                    {/* Lignes */}
                    {formLignes.map((l, i) => {
                      const art = articles.find(a => a.id === l.articleId)
                      const paCalc = computePALigne(l)
                      const lineTotal = paCalc * Number(l.quantite || 0)
                      return (
                        <div key={i} className={`grid grid-cols-[2fr_1fr_1fr_1fr_80px_36px] gap-0 items-start border-t border-border ${i % 2 === 0 ? "bg-white" : "bg-muted/20"}`}>
                          {/* Article select */}
                          <div className="px-2 py-2">
                            <ArticleCombobox
                              articles={articles}
                              value={l.articleId}
                              onChange={(artId, artObj) => {
                                const n = [...formLignes]; n[i] = { ...n[i], articleId: artId }
                                if (artObj) n[i].prixAchat = artObj.prixAchat.toString()
                                setFormLignes(n)
                              }}
                              placeholder="— Article"
                            />
                            {art && <p className="text-[10px] text-muted-foreground mt-0.5 pl-1">Stock: {art.stockDisponible} {art.unite}</p>}
                          </div>
                          {/* Quantite */}
                          <div className="px-2 py-2">
                            <input type="number" min="0" step="0.1" placeholder="0" value={l.quantite}
                              onChange={e => { const n = [...formLignes]; n[i] = { ...n[i], quantite: e.target.value }; setFormLignes(n) }}
                              className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
                            {art && <p className="text-[10px] text-muted-foreground mt-0.5 pl-1">{art.unite}</p>}
                          </div>
                          {/* PA input */}
                          <div className="px-2 py-2">
                            {l.paMethode === "par_unite" ? (
                              <input type="number" min="0" step="0.01" placeholder="0.00" value={l.prixAchat}
                                onChange={e => { const n = [...formLignes]; n[i] = { ...n[i], prixAchat: e.target.value }; setFormLignes(n) }}
                                className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
                            ) : (
                              <div className="flex flex-col gap-0.5">
                                <input type="number" min="0" step="0.01" placeholder="Total DH" value={l.montantGlobal}
                                  onChange={e => { const n = [...formLignes]; n[i] = { ...n[i], montantGlobal: e.target.value }; setFormLignes(n) }}
                                  className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
                                {paCalc > 0 && <p className="text-[10px] text-primary font-bold pl-1">= {paCalc.toFixed(2)}/u</p>}
                              </div>
                            )}
                          </div>
                          {/* Methode toggle */}
                          <div className="px-2 py-2">
                            <div className="flex rounded-lg border border-border overflow-hidden text-[10px] font-bold">
                              <button type="button"
                                onClick={() => { const n = [...formLignes]; n[i] = { ...n[i], paMethode: "par_unite" }; setFormLignes(n) }}
                                className={`flex-1 py-1.5 transition-colors ${l.paMethode === "par_unite" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}>
                                /u
                              </button>
                              <button type="button"
                                onClick={() => { const n = [...formLignes]; n[i] = { ...n[i], paMethode: "global" }; setFormLignes(n) }}
                                className={`flex-1 py-1.5 transition-colors ${l.paMethode === "global" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}>
                                Tot
                              </button>
                            </div>
                            {art && paCalc > 0 && (
                              <p className={`text-[9px] font-bold mt-0.5 pl-0.5 ${paCalc < art.prixAchat ? "text-green-700" : paCalc > art.prixAchat ? "text-red-600" : "text-muted-foreground"}`}>
                                {paCalc < art.prixAchat ? "Meilleur" : paCalc > art.prixAchat ? `+${((paCalc - art.prixAchat) / art.prixAchat * 100).toFixed(0)}%` : "="}
                              </p>
                            )}
                          </div>
                          {/* Line total */}
                          <div className="px-2 py-2 text-right">
                            <p className="text-xs font-bold text-foreground">{lineTotal > 0 ? lineTotal.toFixed(2) : "—"}</p>
                            {lineTotal > 0 && <p className="text-[10px] text-muted-foreground">DH</p>}
                          </div>
                          {/* Remove ligne */}
                          <div className="px-1 py-2 flex items-start justify-center">
                            {formLignes.length > 1 && (
                              <button type="button" onClick={() => setFormLignes(prev => prev.filter((_, j) => j !== i))}
                                className="p-1 text-destructive hover:bg-red-50 rounded transition-colors">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}

                    {/* Add ligne row */}
                    <div className="border-t border-dashed border-border px-3 py-2 bg-muted/10">
                      <button onClick={addFormLigne}
                        className="flex items-center gap-1.5 text-xs text-primary font-semibold hover:underline">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        Ajouter une ligne / إضافة منتج
                      </button>
                    </div>

                    {/* Grand total row */}
                    <div className="grid grid-cols-[1fr_80px_36px] border-t-2 border-sidebar bg-sidebar/5">
                      <div className="px-3 py-3 col-span-1 flex items-center">
                        <span className="text-xs font-bold uppercase tracking-wide text-sidebar">Total general / المجموع الكلي</span>
                      </div>
                      <div className="px-3 py-3 text-right">
                        <p className="text-base font-black text-sidebar">{grandTotal.toFixed(2)}</p>
                        <p className="text-[10px] text-muted-foreground font-semibold">DH HT</p>
                      </div>
                      <div />
                    </div>
                  </div>

                  {/* Notes / conditions */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Notes / conditions / ملاحظات</label>
                    <textarea rows={2} placeholder="Notes ou conditions particulieres..."
                      className="px-3 py-2 rounded-xl border border-border bg-background text-sm font-sans resize-none focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>

                  {/* Signature line */}
                  <div className="grid grid-cols-2 gap-8 pt-2 border-t border-border">
                    <div className="flex flex-col gap-6">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Emis par / صادر عن</p>
                      <div className="border-b border-dashed border-border w-full h-6" />
                      <p className="text-[10px] text-muted-foreground">Signature et cachet</p>
                    </div>
                    <div className="flex flex-col gap-6">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Lu et accepte par le fournisseur / موافقة المورد</p>
                      <div className="border-b border-dashed border-border w-full h-6" />
                      <p className="text-[10px] text-muted-foreground">Signature et cachet du fournisseur</p>
                    </div>
                  </div>

                  {/* Footer document */}
                  <p className="text-center text-[9px] text-muted-foreground pt-2 border-t border-border">
                    FreshLink Pro — Distribution Fruits & Legumes — &copy; 2026 By Jawad — Tous droits reserves
                  </p>
                </div>

                {/* ── Action bar (screen only) ── */}
                <div className="flex gap-2 justify-end px-5 py-3 bg-muted border-t border-border print:hidden">
                  <button onClick={() => setShowForm(false)}
                    className="px-4 py-2 rounded-xl border border-border text-sm font-sans hover:bg-background transition-colors">
                    Annuler
                  </button>
                  <button onClick={handleSubmitBon}
                    disabled={!formFournisseurId || formLignes.every(l => !l.articleId)}
                    className="px-5 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-bold font-sans hover:opacity-90 disabled:opacity-50 transition-opacity">
                    Enregistrer & Envoyer
                  </button>
                </div>
              </div>
            )
          })()}

          {/* Stats sur les bons d'achat */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-card rounded-xl border border-border p-4 text-center">
              <p className="text-2xl font-bold text-foreground font-sans">{bons.length}</p>
              <p className="text-sm text-muted-foreground font-sans">Bons d&apos;achat</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4 text-center">
              <p className="text-xl font-bold text-yellow-600 font-sans">{bons.filter(b => b.statut === "brouillon").length}</p>
              <p className="text-sm text-muted-foreground font-sans">Brouillons</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4 text-center">
              <p className="text-xl font-bold text-orange-600 font-sans">
                {bons.reduce((s, b) => s + b.lignes.reduce((ls, l) => ls + l.quantite, 0), 0).toLocaleString("fr-MA")} kg
              </p>
              <p className="text-sm text-muted-foreground font-sans">Tonnage</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4 text-center">
              <p className="text-xl font-bold text-primary font-sans">
                {bons.reduce((s, b) => s + b.lignes.reduce((ls, l) => ls + l.quantite * l.prixAchat, 0), 0).toLocaleString("fr-MA")} DH
              </p>
              <p className="text-sm text-muted-foreground font-sans">Montant cumulé</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm font-sans">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">ID</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Date</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Fournisseur</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Acheteur</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium">Total</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Statut</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {bons.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Aucun bon d&apos;achat</td></tr>
                ) : bons.map(b => (
                  <tr key={b.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-xs text-muted-foreground">{b.id.slice(0, 8)}...</td>
                    <td className="px-4 py-3">{b.date}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{b.fournisseurNom}</td>
                    <td className="px-4 py-3 text-muted-foreground">{b.acheteurNom}</td>
                    <td className="px-4 py-3 text-right font-semibold text-primary">{b.lignes.reduce((s, l) => s + l.quantite * l.prixAchat, 0).toLocaleString("fr-MA")} DH</td>
                    <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${statutColor[b.statut]}`}>{b.statut}</span></td>
                    <td className="px-4 py-3">
                      {b.statut === "brouillon" && (
                        <button onClick={() => handleValidateBon(b)} className="px-3 py-1 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90">Valider</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Articles */}
      {tab === "articles" && (
        <div className="flex flex-col gap-4">

          {/* ── Catalogue des charges (coût de revient) ── */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span className="text-sm font-semibold text-amber-800">Charges coût de revient</span>
              <span className="text-xs text-amber-600">— choisissez une charge par article dans le tableau ci-dessous</span>
            </div>

            {chargesArticle.length === 0 && !showChargeForm && (
              <span className="text-xs text-amber-600 italic">Aucune charge définie. Ajoutez transport, manutention, perte…</span>
            )}

            {/* Tableau éditable : Charge | Valeur (DH) éditable | suppr. */}
            {chargesArticle.length > 0 && (
              <div className="bg-white border border-amber-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-amber-100/60 text-amber-800">
                      <th className="text-left px-3 py-2 font-bold">Charge</th>
                      <th className="text-right px-3 py-2 font-bold w-32">Valeur (DH)</th>
                      <th className="px-2 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {chargesArticle.map(c => (
                      <tr key={c.id} className="border-t border-amber-100">
                        <td className="px-3 py-1.5 font-medium text-amber-900">{c.nom}</td>
                        <td className="px-3 py-1.5 text-right">
                          <input type="number" min={0} step={0.01}
                            value={c.montant}
                            onChange={e => handleUpdateChargeMontant(c.id, e.target.value)}
                            className="w-24 px-2 py-1 rounded-md border border-amber-300 bg-amber-50 text-right font-mono text-amber-900 focus:outline-none focus:ring-1 focus:ring-amber-400" />
                          <span className="ml-1 text-amber-500">DH</span>
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <button type="button" onClick={() => handleDeleteCharge(c.id)} title="Supprimer cette charge"
                            className="text-amber-400 hover:text-destructive">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-amber-300 bg-amber-100/40">
                      <td className="px-3 py-2 font-bold text-amber-800">TOTAL charges</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-amber-800">
                        {chargesArticle.reduce((s, c) => s + (Number(c.montant) || 0), 0).toFixed(2)} DH
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Ajouter une charge */}
            <div className="flex flex-wrap items-center gap-2">
              {showChargeForm ? (
                <div className="flex items-center gap-1.5 bg-white border border-amber-300 rounded-full pl-3 pr-1.5 py-1">
                  <input autoFocus value={newChargeNom} onChange={e => setNewChargeNom(e.target.value)}
                    placeholder="Nom (ex: Transport)"
                    className="w-32 bg-transparent text-xs focus:outline-none text-amber-900 placeholder:text-amber-400" />
                  <input type="number" min={0} step={0.01} value={newChargeMontant} onChange={e => setNewChargeMontant(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleAddCharge() }}
                    placeholder="DH"
                    className="w-16 bg-transparent text-xs font-mono focus:outline-none text-amber-900 placeholder:text-amber-400 text-center border-l border-amber-200" />
                  <button type="button" onClick={handleAddCharge} disabled={!newChargeNom.trim()}
                    className="px-2 py-1 rounded-full bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 disabled:opacity-40">OK</button>
                  <button type="button" onClick={() => { setShowChargeForm(false); setNewChargeNom(""); setNewChargeMontant("") }}
                    className="px-1.5 text-amber-400 hover:text-amber-700 text-xs">✕</button>
                </div>
              ) : (
                <button type="button" onClick={() => setShowChargeForm(true)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition-colors">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                  Ajouter une charge
                </button>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            {dupCount > 0 && (
              <button onClick={handleMergeDuplicates}
                title="Fusionner les articles en double (même nom) et supprimer les doublons"
                className="px-4 py-2 bg-orange-100 text-orange-700 border border-orange-300 rounded-lg text-sm font-semibold font-sans hover:bg-orange-200 transition-colors flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                Fusionner les doublons ({dupCount})
              </button>
            )}
            <button onClick={() => { setEditArticle(null); setArtNom(""); setArtUnite("kg"); setArtStock(""); setArtPrixAchat(""); setArtPrixVente(""); setShowArticleForm(true) }} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium font-sans hover:opacity-90 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Nouvel article
            </button>
          </div>

          {showArticleForm && (
            <div className="bg-card rounded-xl border border-border p-5 flex flex-col gap-4">
              <h3 className="font-bold text-foreground">{editArticle ? "Modifier" : "Nouvel"} Article</h3>

              {/* Photo upload row */}
              <div className="flex items-center gap-4">
                <div className="relative shrink-0">
                  {artPhoto ? (
                    <img src={artPhoto} alt="photo article" className="w-16 h-16 rounded-xl object-cover border border-border shadow-sm" />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-muted border border-dashed border-border flex items-center justify-center">
                      <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                  {artPhoto && (
                    <button type="button" onClick={() => setArtPhoto("")}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center text-[10px] font-bold shadow hover:opacity-90">
                      x
                    </button>
                  )}
                </div>
                <div className="flex-1 flex flex-col gap-1">
                  <label className="text-xs font-semibold text-foreground">Photo du produit</label>
                  <label className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors text-xs text-primary font-medium w-fit">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Choisir une image
                    <input type="file" accept="image/*" className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        const reader = new FileReader()
                        reader.onload = ev => setArtPhoto(ev.target?.result as string)
                        reader.readAsDataURL(file)
                      }} />
                  </label>
                  <p className="text-[10px] text-muted-foreground">JPG, PNG, WEBP</p>
                </div>
              </div>

              {/* Fields grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-foreground">Nom (FR) *</label>
                  <input placeholder="ex: Tomates" value={artNom} onChange={e => setArtNom(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-foreground">Nom (AR)</label>
                  <input placeholder="مثال: طماطم" value={artNomAr} onChange={e => setArtNomAr(e.target.value)}
                    dir="rtl"
                    className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary font-sans" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-foreground">Famille</label>
                  <select value={artFamille} onChange={e => setArtFamille(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                    {FAMILLES_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-foreground">Unite</label>
                  <select value={artUnite} onChange={e => setArtUnite(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                    {["kg","g","tonne","pièce","botte","caisse","carton","litre","palette"].map(u =>
                      <option key={u} value={u}>{u}</option>
                    )}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-foreground">Stock initial</label>
                  <input type="number" placeholder="0" value={artStock} onChange={e => setArtStock(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-foreground">Prix achat (DH)</label>
                  <input type="number" placeholder="0.00" value={artPrixAchat} onChange={e => setArtPrixAchat(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowArticleForm(false)} className="px-4 py-2 rounded-lg border border-border text-sm">Annuler</button>
                <button onClick={handleSaveArticle} disabled={!artNom}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50">
                  Sauvegarder
                </button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm font-sans">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-3 py-3 text-muted-foreground font-medium text-xs"></th>
                  <th className="text-left px-3 py-3 text-muted-foreground font-medium text-xs">Article</th>
                  <th className="text-left px-3 py-3 text-muted-foreground font-medium text-xs">Famille</th>
                  <th className="text-left px-3 py-3 text-muted-foreground font-medium text-xs">Unité</th>
                  <th className="text-right px-3 py-3 text-muted-foreground font-medium text-xs">Stock</th>
                  <th className="text-right px-3 py-3 text-muted-foreground font-medium text-xs">PA</th>
                  <th className="text-right px-3 py-3 text-amber-600 font-bold text-xs">Charge</th>
                  <th className="text-right px-3 py-3 text-orange-700 font-bold text-xs">Coût revient</th>
                  <th className="text-right px-3 py-3 text-blue-600 font-bold text-xs">PV</th>
                  <th className="text-right px-3 py-3 text-green-700 font-bold text-xs">Marge nette</th>
                  <th className="text-right px-3 py-3 text-muted-foreground font-medium text-xs">Marge%</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {articles.map(a => {
                  // ⚠️ Coercition numérique : les champs JSONB peuvent revenir en string
                  // ("12") ou undefined → sinon "string".toFixed n'est pas une fonction (crash).
                  const prixAchatN = Number(a.prixAchat) || 0
                  const pvValeurN = Number(a.pvValeur) || 0
                  const stockN = Number(a.stockDisponible) || 0
                  const pv = a.pvMethode === "manuel" ? pvValeurN
                    : a.pvMethode === "pourcentage" ? prixAchatN * (1 + pvValeurN / 100)
                    : prixAchatN + pvValeurN
                  const charge = chargesArticle.find(c => c.id === a.chargeArticleId)
                  const chargeMontant = Number(charge?.montant) || 0
                  const coutRevient = prixAchatN + chargeMontant
                  const margeNette = pv - coutRevient
                  const margePct = pv > 0 ? (margeNette / pv) * 100 : 0
                  return (
                    <tr key={a.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 w-12">
                        {a.photo ? (
                          <img src={a.photo} alt={a.nom} className="w-9 h-9 rounded-lg object-cover border border-border" />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center border border-border">
                            <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01" />
                            </svg>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-semibold text-foreground">{a.nom}</p>
                        {a.nomAr && <p className="font-arabic text-[12px] text-muted-foreground" dir="rtl" lang="ar">{a.nomAr}</p>}
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">{a.famille ?? "—"}</span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{a.unite}</td>
                      <td className={`px-3 py-2 text-right font-semibold tabular-nums ${stockN < 50 ? "text-red-600" : "text-green-600"}`}>
                        {stockN}
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground font-mono text-xs">{prixAchatN.toFixed(2)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1.5">
                          <select
                            value={a.chargeArticleId ?? ""}
                            onChange={e => handleSetArticleCharge(a.id, e.target.value)}
                            disabled={chargesArticle.length === 0}
                            title={chargesArticle.length === 0 ? "Ajoutez d'abord une charge ci-dessus" : "Charge appliquée à cet article"}
                            className="max-w-[110px] px-1.5 py-1 rounded-lg border border-amber-300 bg-white text-[11px] focus:outline-none focus:ring-1 focus:ring-amber-400 disabled:opacity-40">
                            <option value="">—</option>
                            {chargesArticle.map(c => (
                              <option key={c.id} value={c.id}>{c.nom} (+{c.montant})</option>
                            ))}
                          </select>
                          <span className="text-amber-600 font-mono text-xs w-12 text-right shrink-0">+{chargeMontant.toFixed(2)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-orange-700 font-mono font-bold text-xs">{coutRevient.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right text-blue-600 font-mono text-xs">{pv.toFixed(2)}</td>
                      <td className={`px-3 py-2 text-right font-mono font-bold text-xs ${margeNette >= 0 ? "text-green-700" : "text-red-600"}`}>
                        {margeNette >= 0 ? "+" : ""}{margeNette.toFixed(2)}
                      </td>
                      <td className={`px-3 py-2 text-right font-bold text-xs ${margePct >= 20 ? "text-green-600" : margePct >= 10 ? "text-amber-600" : "text-red-600"}`}>
                        {margePct.toFixed(1)}%
                      </td>
                      <td className="px-3 py-2">
                        <button onClick={() => openEditArticle(a)}
                          className="px-3 py-1.5 bg-muted rounded-lg text-xs font-medium hover:bg-muted/70 transition-colors">
                          Modifier
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Fournisseurs */}
      {tab === "fournisseurs" && (
        <div className="flex flex-col gap-4">
          <div className="flex justify-end">
            <button onClick={() => { setEditFournisseur(null); setFNom(""); setFContact(""); setFEmail(""); setShowFournisseurForm(true) }} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium font-sans hover:opacity-90 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Nouveau fournisseur
            </button>
          </div>

          {showFournisseurForm && (
            <div className="bg-card rounded-xl border border-border p-5 grid grid-cols-3 gap-3">
              <h3 className="col-span-3 font-semibold text-foreground font-sans">{editFournisseur ? "Modifier" : "Nouveau"} Fournisseur</h3>
              <input placeholder="Nom" value={fNom} onChange={e => setFNom(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-background text-sm font-sans focus:outline-none focus:ring-2 focus:ring-primary" />
              <input placeholder="Contact" value={fContact} onChange={e => setFContact(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-background text-sm font-sans focus:outline-none focus:ring-2 focus:ring-primary" />
              <input type="email" placeholder="Email" value={fEmail} onChange={e => setFEmail(e.target.value)} className="px-3 py-2 rounded-lg border border-border bg-background text-sm font-sans focus:outline-none focus:ring-2 focus:ring-primary" />
              <div className="col-span-3 flex gap-2 justify-end">
                <button onClick={() => setShowFournisseurForm(false)} className="px-4 py-2 rounded-lg border border-border text-sm font-sans">Annuler</button>
                <button onClick={handleSaveFournisseur} disabled={!fNom} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium font-sans disabled:opacity-50">Sauvegarder</button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm font-sans">
              <thead className="bg-muted"><tr>{["Nom", "Contact", "Email", "Actions"].map(h => <th key={h} className="text-left px-4 py-3 text-muted-foreground font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {fournisseurs.map(f => (
                  <tr key={f.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium text-foreground">{f.nom}</td>
                    <td className="px-4 py-3 text-muted-foreground">{f.contact}</td>
                    <td className="px-4 py-3 text-muted-foreground">{f.email}</td>
                    <td className="px-4 py-3"><button onClick={() => openEditFournisseur(f)} className="px-3 py-1 bg-muted rounded-lg text-xs font-medium hover:bg-muted/70">Modifier</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
