"use client"

import { useState, useEffect, useRef } from "react"
import { store, type Article, type HistoriquePrixAchat, type StatutCaisseEtrangere, type TypeCaisse, STATUT_CAISSE_ETRANGERE_LABELS, TYPES_CAISSE_LABELS, FAMILLE_GROUPES, getAllFamilles, addCustomFamille, paDeviationConfirmMessage } from "@/lib/store"
import { hasPermission } from "@/lib/permissions"
import { logAction } from "@/lib/auditLog"
import { resolveArticlePhoto } from "@/lib/articlePhotoHelper"
import { getArticlePhoto } from "@/lib/articlePhotos"
import { deleteArticle, upsertCaisseEtrangere } from "@/lib/supabase/db"

const DH = (n: number) => `${n.toLocaleString("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`

function computePV(a: Article): number {
  switch (a.pvMethode) {
    case "pourcentage": return Math.round(a.prixAchat * (1 + a.pvValeur / 100) * 100) / 100
    case "montant": return Math.round((a.prixAchat + a.pvValeur) * 100) / 100
    case "manuel": default: return a.pvValeur
  }
}

const FAMILLE_COLORS: Record<string, string> = {
  "Légumes fruits":    "bg-red-50 text-red-700 border-red-200",
  "Légumes racines":   "bg-amber-50 text-amber-700 border-amber-200",
  "Légumes feuilles":  "bg-green-50 text-green-700 border-green-200",
  "Agrumes":           "bg-orange-50 text-orange-700 border-orange-200",
  "Fruits tropicaux":  "bg-yellow-50 text-yellow-700 border-yellow-200",
  "Fruits rouges":     "bg-rose-50 text-rose-700 border-rose-200",
  "Herbes aromatiques":"bg-emerald-50 text-emerald-700 border-emerald-200",
  "Champignons":       "bg-stone-50 text-stone-700 border-stone-200",
  "Fruits secs":       "bg-brown-50 text-amber-900 border-amber-300",
  "Autre":             "bg-slate-50 text-slate-700 border-slate-200",
}

const DEFAULT_PHOTO = "https://placehold.co/120x120/e2e8f0/64748b?text=Article"

// Détection de doublon FR/AR à la création d'un article. Le nom (FR) et le
// nomAr (AR) sont censés être 2 champs du MÊME article, mais en pratique des
// doublons sont créés en tapant les deux langues dans le même champ "nom"
// séparées par "/" (ex: "ail" une fois, puis "ail/ثوم" une autre fois pour ce
// qui est en réalité le même produit). On normalise (minuscule, accents,
// espaces) puis on isole la partie latine et la partie arabe de chaque champ
// (séparateur "/") pour comparer les deux articles partie par partie.
function normArticleName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function splitBilingual(s: string): { latin: string; arabic: string } {
  let latin = "", arabic = ""
  for (const part of (s || "").split("/").map(p => p.trim()).filter(Boolean)) {
    if (/[؀-ۿ]/.test(part)) arabic = arabic ? `${arabic} ${part}` : part
    else latin = latin ? `${latin} ${part}` : part
  }
  return { latin: normArticleName(latin), arabic: normArticleName(arabic) }
}

function findDuplicateArticle(all: Article[], nom: string, nomAr: string, excludeId?: string): Article | undefined {
  const mine = { latin: splitBilingual(nom).latin, arabic: splitBilingual(nom).arabic || splitBilingual(nomAr).arabic }
  return all.find(a => {
    if (a.id === excludeId) return false
    const other = { latin: splitBilingual(a.nom).latin, arabic: splitBilingual(a.nom).arabic || splitBilingual(a.nomAr).arabic }
    return (mine.latin && other.latin && mine.latin === other.latin) ||
      (mine.arabic && other.arabic && mine.arabic === other.arabic)
  })
}

const UM_OPTIONS = ["Caisse", "Demi caisse", "Carton", "Palette", "Sac", "Plateau", "Botte", "Pièce"]

export default function BOArticles({ user }: { user: { id: string; name: string } }) {
  const [tab, setTab] = useState<"articles" | "caisses">("articles")
  const [articles, setArticles] = useState<Article[]>([])
  const [search, setSearch] = useState("")
  const [famille, setFamille] = useState("")
  const [view, setView] = useState<"grid" | "table">("grid")
  const [showForm, setShowForm] = useState(false)
  const [editArt, setEditArt] = useState<Article | null>(null)
  const [showHisto, setShowHisto] = useState<Article | null>(null)
  const [caisses, setCaisses] = useState(store.getCaissesVides())
  const [caissesEtr, setCaissesEtr] = useState(store.getCaissesEtrangeres())
  const [caissesEtrFilterStatut, setCaissesEtrFilterStatut] = useState<"" | StatutCaisseEtrangere>("")
  const [caissesEtrFilterFournisseur, setCaissesEtrFilterFournisseur] = useState("")
  // Selection for bulk actions
  const [selectedArticleIds, setSelectedArticleIds] = useState<Set<string>>(new Set())
  // Confirm resets
  const [confirmResetStock, setConfirmResetStock] = useState(false)
  const [confirmResetDefect, setConfirmResetDefect] = useState(false)
  const [syncingAll, setSyncingAll] = useState(false)
  const [syncAllDone, setSyncAllDone] = useState(false)
  const [reloadingFromSb, setReloadingFromSb] = useState(false)
  const [familleTick, setFamilleTick] = useState(0)   // force re-render après ajout d'une famille

  // Toutes les familles (prédéfinies + perso + utilisées) pour les listes déroulantes
  const familleOptions = (() => { void familleTick; return getAllFamilles(articles.map(a => a.famille)) })()
  const promptNewFamille = (apply: (nom: string) => void) => {
    const nom = window.prompt("Nom de la nouvelle famille :")?.trim()
    if (!nom) return
    addCustomFamille(nom)
    setFamilleTick(t => t + 1)
    apply(nom)
  }

  const EMPTY_FORM: Omit<Article, "id"> = {
    nom: "", nomAr: "", famille: "Légumes fruits", unite: "kg",
    um: "", colisageParUM: undefined,
    stockDisponible: 0, stockDefect: 0, prixAchat: 0,
    pvMethode: "pourcentage", pvValeur: 60, photo: "",
  }
  const [form, setForm] = useState(EMPTY_FORM)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoError, setPhotoError] = useState("")
  const [photoUrlInput, setPhotoUrlInput] = useState("")
  const [photoDragOver, setPhotoDragOver] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Chargement local immédiat — pas d'auto-sync !
    // L'auto-sync de TOUT le localStorage à l'ouverture causait des régressions :
    // - Anciens IDs (a1, a2...) repoussés vers Supabase
    // - marketplaceActif:true forcé sur tous les articles
    // - Boutique affichait 287+ articles au lieu de ceux activés manuellement
    //
    // Désormais : le sync se fait UNIQUEMENT lors de toggles explicites
    // via BOMarketplace.handleSave / handleBulkPublish
    // OU via le bouton "🌐 Publier sur le site" (push manuel)
    // OU via le bouton "🔄 Recharger Supabase" (pull manuel)
    setArticles(store.getArticles())
  }, [])

  // Upload photo — tries Supabase Storage first, falls back to base64 local
  const handlePhotoUpload = async (file: File) => {
    setPhotoUploading(true)
    setPhotoError("")

    // Immediate local preview — works without any network
    const localUrl = URL.createObjectURL(file)
    setForm(f => ({ ...f, photo: localUrl }))

    try {
      // Lire le fichier en base64 (data URL)
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(r.result as string)
        r.onerror = () => reject(new Error("lecture fichier"))
        r.readAsDataURL(file)
      })
      // Upload CÔTÉ SERVEUR (service_role) → URL publique permanente
      const resp = await fetch("/api/upload-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, folder: "articles" }),
      })
      const json = await resp.json().catch(() => ({ ok: false, error: "reponse invalide" }))
      if (!json.ok || !json.url) throw new Error(json.error || "upload echoue")
      setForm(f => ({ ...f, photo: json.url }))
      URL.revokeObjectURL(localUrl)
    } catch {
      // Repli : encode en base64 pour que la photo persiste quand même
      const reader = new FileReader()
      reader.onload = ev => {
        setForm(f => ({ ...f, photo: ev.target?.result as string }))
        URL.revokeObjectURL(localUrl)
      }
      reader.readAsDataURL(file)
      setPhotoError("Upload serveur indisponible — photo enregistree localement (base64)")
    } finally {
      setPhotoUploading(false)
    }
  }

  // ── Supabase sync helpers ─────────────────────────────────────────────────
  const syncArticleToSupabase = async (article: Article) => {
    try {
      const { id, ...payload } = article
      await fetch("/api/sync-write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table: "fl_articles",
          upserts: [{ id, payload, updated_at: new Date().toISOString() }],
        }),
      })
    } catch (e) {
      console.error("[BOArticles] syncArticleToSupabase error:", e)
    }
  }

  const syncAllArticlesToSupabase = async () => {
    setSyncingAll(true)
    setSyncAllDone(false)
    try {
      // ── Normaliser ID + Photo + marketplaceActif pour chaque article ────────
      let counter = 1
      const all = store.getArticles().map(a => {
        const { id, ...rest } = a
        const payload = rest as Record<string, unknown>
        // 1. ID propre format VFP00001
        let cleanId = String(id)
        if (!/^VFP\d{5,}$/.test(cleanId)) {
          cleanId = "VFP" + String(counter).padStart(5, "0")
        }
        counter++
        // 2. Photo : vraie photo Unsplash mappée par nom + famille si manquante
        const nom = String(payload.nom ?? "Article")
        const famille = String(payload.famille ?? "")
        const photoStr = String(payload.photo ?? "").trim()
        if (!photoStr || /placehold|placeholder|dummyimage/i.test(photoStr)) {
          payload.photo = getArticlePhoto(nom, famille)
        }
        // 3. marketplaceActif = catalogueVisible !== false
        const catalogueVisible = payload.catalogueVisible !== false
        const marketplaceActif = catalogueVisible && payload.marketplaceActif !== false
        return {
          id: cleanId,
          payload: { ...payload, marketplaceActif, catalogueVisible },
          updated_at: new Date().toISOString(),
        }
      })
      if (all.length === 0) {
        alert("⚠️ Aucun article à publier. Ajoutez d'abord des articles dans le catalogue.")
        setSyncingAll(false)
        return
      }
      // Push en batch de 50 pour éviter timeout
      let pushed = 0
      const errors: string[] = []
      for (let i = 0; i < all.length; i += 50) {
        const batch = all.slice(i, i + 50)
        const res = await fetch("/api/sync-write", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ table: "fl_articles", upserts: batch }),
        })
        const data = await res.json()
        if (data.ok) pushed += batch.length
        else errors.push(...(data.errors ?? [`batch ${i}`]))
      }
      if (errors.length === 0) {
        setSyncAllDone(true)
        alert(`✅ ${pushed} articles publiés sur le site web !`)
        setTimeout(() => setSyncAllDone(false), 5000)
      } else {
        alert(`⚠️ ${pushed} publiés, ${errors.length} erreurs :\n${errors.slice(0, 3).join("\n")}`)
        console.error("[BOArticles] sync errors:", errors)
      }
    } catch (e) {
      alert("❌ Erreur réseau : " + String(e))
      console.error("[BOArticles] syncAllArticlesToSupabase error:", e)
    } finally {
      setSyncingAll(false)
    }
  }

  // ⚡ Recharger depuis Supabase (source de vérité) — efface localStorage local
  // et resynchronise avec ce qui est réellement publié sur le site web.
  // Résout le souci du compteur 287 (localStorage) vs 135 (Supabase).
  const reloadFromSupabase = async () => {
    if (!confirm(
      "Cette action va remplacer le catalogue local (localStorage) par celui de Supabase.\n\n" +
      "Tous les changements non publiés seront perdus.\n\nContinuer ?"
    )) return
    setReloadingFromSb(true)
    try {
      const res = await fetch("/api/sync-read?table=fl_articles", { cache: "no-cache" })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || "sync-read failed")
      // Flatten {id, payload} → Article objects
      const fromSb = (data.data ?? [])
        .filter((r: { id: string }) => !String(r.id).startsWith("__"))
        .map((r: { id: string; payload: Record<string, unknown> }) => ({
          id: r.id,
          ...(r.payload && typeof r.payload === "object" ? r.payload : {}),
        })) as Article[]
      if (fromSb.length === 0) {
        alert("⚠️ Supabase est vide. Aucun article à recharger.")
        return
      }
      // Écraser le localStorage
      try { localStorage.setItem("fl_articles", JSON.stringify(fromSb)) } catch {}
      setArticles(fromSb)
      alert(`✅ ${fromSb.length} articles rechargés depuis Supabase`)
    } catch (e) {
      alert("❌ Erreur : " + String(e))
      console.error("[BOArticles] reloadFromSupabase error:", e)
    } finally {
      setReloadingFromSb(false)
    }
  }

  // Pour le filtre actif : si famille choisie → chercher via groupe.
  // ⚠️ DÉCLARÉ AVANT `filtered` : sinon TDZ en build prod minifié
  // ("Cannot access 'famillesFiltre' before initialization") car
  // le callback de `filtered` lit `famillesFiltre` quand une famille est sélectionnée.
  const famillesFiltre = famille
    ? (FAMILLE_GROUPES[famille] ?? [famille])
    : []

  const filtered = articles.filter(a => {
    const q = search.toLowerCase()
    const matchSearch = !q || a.nom.toLowerCase().includes(q) || a.nomAr.includes(q) || a.famille.toLowerCase().includes(q)
    const matchFamille = !famille
      ? true
      : famille === "catalogue"
        ? (a as any).catalogueVisible !== false && (a as any).marketplaceActif !== false
        : famillesFiltre.length > 0
          ? famillesFiltre.includes(a.famille)
          : a.famille === famille
    return matchSearch && matchFamille
  }).sort((a, b) => a.nom.localeCompare(b.nom, "fr"))

  const openEdit = (a: Article) => {
    setEditArt(a)
    setForm({
      nom: a.nom, nomAr: a.nomAr, famille: a.famille, unite: a.unite,
      um: a.um || "", colisageParUM: a.colisageParUM,
      stockDisponible: a.stockDisponible, stockDefect: a.stockDefect,
      prixAchat: a.prixAchat, pvMethode: a.pvMethode, pvValeur: a.pvValeur, photo: a.photo || "",
    })
    setShowForm(true)
  }

  const handleSave = () => {
    if (!form.nom) return
    const session = store.getSession()
    if (!hasPermission(session?.role, "modifier_article")) { logAction(session, "modifier_article", "denied", { type: "article", label: form.nom }); return }
    logAction(session, "modifier_article", "success", { type: "article", id: editArt?.id, label: form.nom })
    // Garde-fou anti-faute-de-frappe (FR + AR) sur modification manuelle du PA
    if (editArt && form.prixAchat !== editArt.prixAchat) {
      const deviation = store.checkPaDeviationSuspecte(editArt.id, form.prixAchat)
      if (deviation && !window.confirm(paDeviationConfirmMessage(deviation))) return
    }
    const all = store.getArticles()
    let saved: Article | null = null
    if (editArt) {
      const idx = all.findIndex(a => a.id === editArt.id)
      if (idx >= 0) { all[idx] = { ...all[idx], ...form }; store.saveArticles(all); saved = all[idx] }
    } else {
      const dup = findDuplicateArticle(all, form.nom, form.nomAr)
      if (dup && !window.confirm(
        `Un article "${dup.nom}"${dup.nomAr ? ` / "${dup.nomAr}"` : ""} existe déjà et semble être le même produit.\n\n` +
        `Créer un doublon peut disperser stock et historique de prix sur deux fiches.\n` +
        `Préférez plutôt "Modifier" cet article existant pour ajouter le nom manquant (FR ou AR).\n\n` +
        `Créer quand même un nouvel article ?`
      )) return
      const newArt: Article = { ...form, id: store.genId() }
      all.push(newArt)
      store.saveArticles(all)
      saved = newArt
    }
    if (saved) syncArticleToSupabase(saved)
    setArticles(store.getArticles())
    setShowForm(false)
    setEditArt(null)
    setForm(EMPTY_FORM)
  }

  const handleDelete = (id: string) => {
    const session = store.getSession()
    const art = store.getArticles().find(a => a.id === id)
    if (!hasPermission(session?.role, "supprimer_article")) { logAction(session, "supprimer_article", "denied", { type: "article", id, label: art?.nom }); return }
    if (!window.confirm("Supprimer définitivement cet article ? Cette action est irréversible.")) return
    logAction(session, "supprimer_article", "success", { type: "article", id, label: art?.nom })
    deleteArticle(id).catch(e => console.error("[BOArticles] delete sync error:", e))
    setArticles(store.getArticles().filter(a => a.id !== id))
  }

  const handleToggleActif = (id: string) => {
    const session = store.getSession()
    const target = store.getArticles().find(a => a.id === id)
    const willActivate = !(target?.actif ?? true)
    const permKey = willActivate ? "activer_article" : "desactiver_article"
    if (!hasPermission(session?.role, permKey)) { logAction(session, permKey, "denied", { type: "article", id, label: target?.nom }); return }
    logAction(session, permKey, "success", { type: "article", id, label: target?.nom })
    const all = store.getArticles().map(a => a.id === id ? { ...a, actif: !(a.actif ?? true) } : a)
    store.saveArticles(all)
    const updated = all.find(a => a.id === id)
    if (updated) syncArticleToSupabase(updated)
    setArticles(store.getArticles())
  }

  const handleToggleCatalogue = (id: string) => {
    const session = store.getSession()
    if (!hasPermission(session?.role, "catalogue_toggle")) { logAction(session, "catalogue_toggle", "denied", { type: "article", id }); return }
    logAction(session, "catalogue_toggle", "success", { type: "article", id })
    const all = store.getArticles().map(a => a.id === id ? { ...a, catalogueVisible: !(a.catalogueVisible ?? true) } : a)
    store.saveArticles(all)
    const updated = all.find(a => a.id === id)
    if (updated) syncArticleToSupabase(updated)
    setArticles(store.getArticles())
  }

  // Groupes principaux (Légumes, Fruits, Herbes, Autres, Transformés)
  const byGroupe = Object.entries(FAMILLE_GROUPES).map(([groupe, familles]) => ({
    groupe,
    familles,
    count: articles.filter(a => familles.includes(a.famille)).length,
  }))

  const byFamille = familleOptions.map(f => ({
    famille: f,
    count: articles.filter(a => a.famille === f).length,
  })).filter(f => f.count > 0)

  // Reset stock to 0 for selected (or all if none selected)
  const handleResetStock = () => {
    const all = store.getArticles()
    const idsToReset = selectedArticleIds.size > 0 ? selectedArticleIds : new Set(all.map(a => a.id))
    const updated = all.map(a => idsToReset.has(a.id) ? { ...a, stockDisponible: 0 } : a)
    store.saveArticles(updated)
    setArticles(store.getArticles())
    setSelectedArticleIds(new Set())
    setConfirmResetStock(false)
  }

  // Reset defect to 0 for selected (or all if none selected)
  const handleResetDefect = () => {
    const all = store.getArticles()
    const idsToReset = selectedArticleIds.size > 0 ? selectedArticleIds : new Set(all.map(a => a.id))
    const updated = all.map(a => idsToReset.has(a.id) ? { ...a, stockDefect: 0 } : a)
    store.saveArticles(updated)
    setArticles(store.getArticles())
    setSelectedArticleIds(new Set())
    setConfirmResetDefect(false)
  }

  const reloadCaisses = () => setCaisses(store.getCaissesVides())

  const reloadCaissesEtr = () => setCaissesEtr(store.getCaissesEtrangeres())
  // Transition de statut d'une caisse étrangère (reçue → sortie en livraison → retournée)
  const setStatutCaisseEtr = (id: string, statut: StatutCaisseEtrangere) => {
    const now = store.today()
    const updates = statut === "en_livraison" ? { statut, dateSortieLivraison: now }
      : statut === "retournee" ? { statut, dateRetour: now }
      : { statut }
    store.updateCaisseEtrangere(id, updates)
    reloadCaissesEtr()
    const updated = store.getCaissesEtrangeres().find(c => c.id === id)
    if (updated) upsertCaisseEtrangere(updated).catch(e => console.error("[BOArticles] sync caisse etrangere error:", e))
  }

  // Réassigne en masse les articles sélectionnés à une famille (refonte d'assignation)
  const bulkReassignFamille = (fam: string) => {
    if (!fam || selectedArticleIds.size === 0) return
    const all = store.getArticles().map(a => selectedArticleIds.has(a.id) ? { ...a, famille: fam } : a)
    store.saveArticles(all); setArticles(all)
    import("@/lib/supabase/db").then(db => {
      all.filter(a => selectedArticleIds.has(a.id)).forEach(a => { try { db.upsertArticle(a) } catch { /* offline */ } })
    }).catch(() => {})
    setSelectedArticleIds(new Set())
  }

  return (
    <div className="flex flex-col gap-5">

      {/* Tab switcher */}
      <div className="flex items-center gap-2 p-1 bg-muted rounded-2xl w-fit">
        {(["articles", "caisses"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${tab === t ? "text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            style={tab === t ? { background: "oklch(0.38 0.2 260)" } : {}}>
            {t === "articles" ? "Articles / المنتجات" : "Caisses vides / الصناديق"}
          </button>
        ))}
      </div>

      {/* ════ CAISSES VIDES TAB ════ */}
      {tab === "caisses" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-bold text-foreground text-lg">Gestion des caisses vides / الصناديق</h3>
              <p className="text-sm text-muted-foreground">Stock, circulation, capacite transport et tonnage</p>
            </div>
          </div>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {caisses.map(c => (
              <div key={c.id + "kpi"} className={`rounded-2xl border p-4 ${c.type === "gros" ? "bg-blue-50 border-blue-200" : "bg-amber-50 border-amber-200"}`}>
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{c.libelle}</p>
                <p className={`text-2xl font-extrabold mt-1 ${c.type === "gros" ? "text-blue-700" : "text-amber-700"}`}>{c.stock}</p>
                <p className="text-xs text-muted-foreground">stock | {c.enCirculation} en circulation</p>
                <p className="text-xs font-semibold mt-1">{c.capaciteKg} kg/caisse</p>
              </div>
            ))}
            <div className="rounded-2xl border bg-green-50 border-green-200 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Tonnage max (stock)</p>
              <p className="text-2xl font-extrabold mt-1 text-green-700">
                {(caisses.reduce((s, c) => s + (c.stock * c.capaciteKg), 0) / 1000).toFixed(2)} T
              </p>
              <p className="text-xs text-muted-foreground">toutes caisses confondues</p>
            </div>
            <div className="rounded-2xl border bg-purple-50 border-purple-200 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">En circulation</p>
              <p className="text-2xl font-extrabold mt-1 text-purple-700">
                {(caisses.reduce((s, c) => s + (c.enCirculation * c.capaciteKg), 0) / 1000).toFixed(2)} T
              </p>
              <p className="text-xs text-muted-foreground">chez clients / livreurs</p>
            </div>
          </div>

          {/* Caisse cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {caisses.map(c => (
              <div key={c.id} className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-foreground">{c.libelle}</h4>
                    <p className="text-xs text-muted-foreground">{c.capaciteKg} kg/caisse • {c.type === "gros" ? "Gros caisse" : "Demi caisse"}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${c.type === "gros" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>{c.type}</span>
                </div>
                {/* Edit capacity */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-muted-foreground">Capacite (kg)</label>
                    <input type="number" min={1} value={c.capaciteKg}
                      onChange={e => { store.updateCaisseVide(c.id, { capaciteKg: Number(e.target.value) }); reloadCaisses() }}
                      className="px-3 py-2 rounded-xl border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-muted-foreground">Libelle</label>
                    <input value={c.libelle}
                      onChange={e => { store.updateCaisseVide(c.id, { libelle: e.target.value }); reloadCaisses() }}
                      className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                </div>
                {/* Stock & circulation */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-muted rounded-xl p-3">
                    <p className="text-xs text-muted-foreground font-semibold">Stock</p>
                    <p className="text-xl font-extrabold text-foreground">{c.stock}</p>
                  </div>
                  <div className="bg-amber-50 rounded-xl p-3">
                    <p className="text-xs text-muted-foreground font-semibold">Circulation</p>
                    <p className="text-xl font-extrabold text-amber-700">{c.enCirculation}</p>
                  </div>
                  <div className="bg-green-50 rounded-xl p-3">
                    <p className="text-xs text-muted-foreground font-semibold">Total</p>
                    <p className="text-xl font-extrabold text-green-700">{c.stock + c.enCirculation}</p>
                  </div>
                </div>
                {/* Tonnage bar */}
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Tonnage stock : {((c.stock * c.capaciteKg) / 1000).toFixed(2)} T</span>
                    <span>Circulation : {((c.enCirculation * c.capaciteKg) / 1000).toFixed(2)} T</span>
                  </div>
                </div>
                {/* Actions */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold">Entree (approvisionnement)</label>
                    <div className="flex gap-1.5">
                      <input id={`in-${c.id}`} type="number" min={1} defaultValue={1}
                        className="flex-1 px-3 py-2 rounded-xl border border-border bg-background text-sm font-mono focus:outline-none" />
                      <button onClick={() => {
                        const nb = Number((document.getElementById(`in-${c.id}`) as HTMLInputElement).value) || 0
                        store.updateCaisseVide(c.id, { stock: c.stock + nb }); reloadCaisses()
                      }} className="px-3 py-2 rounded-xl bg-green-600 text-white text-xs font-bold hover:bg-green-700">+</button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold">Sortie (vers livreur/client)</label>
                    <div className="flex gap-1.5">
                      <input id={`out-${c.id}`} type="number" min={1} defaultValue={1}
                        className="flex-1 px-3 py-2 rounded-xl border border-border bg-background text-sm font-mono focus:outline-none" />
                      <button onClick={() => {
                        const nb = Number((document.getElementById(`out-${c.id}`) as HTMLInputElement).value) || 0
                        store.sortieCaissesVides(c.id, nb); reloadCaisses()
                      }} className="px-3 py-2 rounded-xl bg-amber-500 text-white text-xs font-bold hover:bg-amber-600">-</button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 col-span-2">
                    <label className="text-xs font-semibold">Retour (du livreur/client)</label>
                    <div className="flex gap-1.5">
                      <input id={`ret-${c.id}`} type="number" min={1} defaultValue={1}
                        className="flex-1 px-3 py-2 rounded-xl border border-border bg-background text-sm font-mono focus:outline-none" />
                      <button onClick={() => {
                        const nb = Number((document.getElementById(`ret-${c.id}`) as HTMLInputElement).value) || 0
                        store.retourCaissesVides(c.id, nb); reloadCaisses()
                      }} className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 flex-1">Retour</button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* ════ CAISSES ÉTRANGÈRES — appartiennent aux fournisseurs ════ */}
          <div className="flex flex-col gap-4 pt-6 border-t border-border">
            <div>
              <h3 className="font-bold text-foreground text-lg">Caisses étrangères / الصناديق ديال الموردين</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Caisses appartenant aux fournisseurs : reçues à l&apos;achat, sorties en livraison chez un client, puis retournées au fournisseur.
              </p>
            </div>

            {/* KPIs par statut */}
            <div className="grid grid-cols-3 gap-3">
              {(["en_stock", "en_livraison", "retournee"] as StatutCaisseEtrangere[]).map(st => {
                const count = caissesEtr.filter(c => c.statut === st).reduce((s, c) => s + c.quantite, 0)
                const cls = st === "en_stock" ? "bg-blue-50 border-blue-200 text-blue-700"
                  : st === "en_livraison" ? "bg-amber-50 border-amber-200 text-amber-700"
                  : "bg-green-50 border-green-200 text-green-700"
                return (
                  <div key={st} className={`rounded-2xl border p-4 ${cls}`}>
                    <p className="text-xs font-bold uppercase tracking-wide opacity-80">{STATUT_CAISSE_ETRANGERE_LABELS[st]}</p>
                    <p className="text-2xl font-extrabold mt-1">{count}</p>
                  </div>
                )
              })}
            </div>

            {/* Filtres */}
            <div className="flex flex-wrap gap-2">
              <select value={caissesEtrFilterStatut} onChange={e => setCaissesEtrFilterStatut(e.target.value as "" | StatutCaisseEtrangere)}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">Tous les statuts</option>
                {(["en_stock", "en_livraison", "retournee"] as StatutCaisseEtrangere[]).map(st => (
                  <option key={st} value={st}>{STATUT_CAISSE_ETRANGERE_LABELS[st]}</option>
                ))}
              </select>
              <input type="text" placeholder="Filtrer par fournisseur..." value={caissesEtrFilterFournisseur}
                onChange={e => setCaissesEtrFilterFournisseur(e.target.value)}
                className="flex-1 min-w-40 px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-muted-foreground uppercase tracking-wide border-b border-border">
                    <th className="text-left py-2 pr-3 font-semibold">Fournisseur</th>
                    <th className="text-left py-2 pr-3 font-semibold">Type</th>
                    <th className="text-left py-2 pr-3 font-semibold">Code</th>
                    <th className="text-right py-2 pr-3 font-semibold">Qté</th>
                    <th className="text-left py-2 pr-3 font-semibold">Statut</th>
                    <th className="text-left py-2 pr-3 font-semibold">Reçue le</th>
                    <th className="text-right py-2 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {caissesEtr
                    .filter(c => !caissesEtrFilterStatut || c.statut === caissesEtrFilterStatut)
                    .filter(c => !caissesEtrFilterFournisseur.trim() || c.fournisseurNom.toLowerCase().includes(caissesEtrFilterFournisseur.trim().toLowerCase()))
                    .map(c => (
                      <tr key={c.id} className="border-b border-border/60">
                        <td className="py-2 pr-3 font-medium text-foreground">{c.fournisseurNom}</td>
                        <td className="py-2 pr-3">{TYPES_CAISSE_LABELS[c.type as TypeCaisse]}</td>
                        <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{c.code || "—"}</td>
                        <td className="py-2 pr-3 text-right font-semibold">{c.quantite}</td>
                        <td className="py-2 pr-3">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                            c.statut === "en_stock" ? "bg-blue-50 text-blue-700 border-blue-200"
                              : c.statut === "en_livraison" ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-green-50 text-green-700 border-green-200"
                          }`}>{STATUT_CAISSE_ETRANGERE_LABELS[c.statut]}</span>
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">{c.dateReception}</td>
                        <td className="py-2 text-right">
                          <div className="flex justify-end gap-1.5">
                            {c.statut === "en_stock" && (
                              <button onClick={() => setStatutCaisseEtr(c.id, "en_livraison")}
                                className="px-2.5 py-1 rounded-lg bg-amber-500 text-white text-[11px] font-bold hover:bg-amber-600">Sortie livraison</button>
                            )}
                            {(c.statut === "en_stock" || c.statut === "en_livraison") && (
                              <button onClick={() => setStatutCaisseEtr(c.id, "retournee")}
                                className="px-2.5 py-1 rounded-lg bg-green-600 text-white text-[11px] font-bold hover:bg-green-700">Retour fournisseur</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  {caissesEtr.length === 0 && (
                    <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">Aucune caisse étrangère enregistrée pour l&apos;instant.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Historique PA modal */}
      {showHisto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={e => { if (e.target === e.currentTarget) setShowHisto(null) }}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg p-6 flex flex-col gap-4 max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-foreground">{showHisto.nom} — Historique PA</h3>
                <p className="text-xs text-muted-foreground">Evolution du prix d{"'"}achat par fournisseur</p>
              </div>
              <button onClick={() => setShowHisto(null)} className="p-2 rounded-lg hover:bg-muted">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {/* Current PA */}
            <div className="flex gap-3">
              <div className="flex-1 bg-primary/5 border border-primary/20 rounded-xl p-3 text-center">
                <p className="text-xs text-muted-foreground font-semibold">PA actuel</p>
                <p className="text-xl font-extrabold text-primary">{DH(showHisto.prixAchat)}</p>
                <p className="text-xs text-muted-foreground">/ {showHisto.unite}</p>
              </div>
              <div className="flex-1 bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                <p className="text-xs text-muted-foreground font-semibold">PV actuel</p>
                <p className="text-xl font-extrabold text-green-700">{DH(computePV(showHisto))}</p>
                <p className="text-xs text-muted-foreground">Marge: {showHisto.prixAchat > 0 ? ((computePV(showHisto) - showHisto.prixAchat) / showHisto.prixAchat * 100).toFixed(1) : 0}%</p>
              </div>
            </div>
            {/* History list */}
            <div className="overflow-y-auto flex-1">
              {(!showHisto.historiquePrixAchat || showHisto.historiquePrixAchat.length === 0) ? (
                <p className="text-center text-sm text-muted-foreground py-8">Aucun historique de prix enregistre.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead><tr className="text-muted-foreground border-b border-border">
                    <th className="text-left py-2 font-semibold">Date</th>
                    <th className="text-left py-2 font-semibold">Fournisseur</th>
                    <th className="text-right py-2 font-semibold">PA (DH)</th>
                    <th className="text-right py-2 font-semibold">Qte</th>
                  </tr></thead>
                  <tbody>
                    {showHisto.historiquePrixAchat!.map((h, i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-2 font-mono">{new Date(h.date).toLocaleDateString("fr-MA")}</td>
                        <td className="py-2">{h.fournisseurNom}</td>
                        <td className="py-2 text-right font-bold font-mono">{DH(h.prixAchat)}</td>
                        <td className="py-2 text-right text-muted-foreground">{h.quantite ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "articles" && (
      <>
      {/* Header stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Total articles</p>
          <p className="text-2xl font-extrabold text-primary mt-1">{articles.length}</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Familles</p>
          <p className="text-2xl font-extrabold text-foreground mt-1">{byFamille.length}</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Stock total</p>
          <p className="text-2xl font-extrabold text-green-600 mt-1">
            {articles.reduce((s, a) => s + a.stockDisponible, 0).toLocaleString("fr-MA")} u.
          </p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Stock defect</p>
          <p className="text-2xl font-extrabold text-red-500 mt-1">
            {articles.reduce((s, a) => s + a.stockDefect, 0).toLocaleString("fr-MA")} u.
          </p>
        </div>
      </div>

      {/* Groupe chips — 5 groupes principaux */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setFamille("")}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${!famille ? "text-white border-transparent" : "text-muted-foreground border-border hover:border-primary"}`}
          style={!famille ? { background: "oklch(0.38 0.2 260)" } : {}}>
          Tous ({articles.length})
        </button>
        {byGroupe.filter(g => g.count > 0).map(g => {
          const GROUPE_COLORS: Record<string, string> = {
            "Légumes":    "bg-green-50 text-green-700 border-green-200",
            "Fruits":     "bg-orange-50 text-orange-700 border-orange-200",
            "Herbes":     "bg-teal-50 text-teal-700 border-teal-200",
            "Autres":     "bg-slate-50 text-slate-700 border-slate-200",
            "Transformés":"bg-purple-50 text-purple-700 border-purple-200",
          }
          const isActive = famille === g.groupe
          return (
            <button key={g.groupe}
              onClick={() => setFamille(isActive ? "" : g.groupe)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${isActive ? "text-white border-transparent" : (GROUPE_COLORS[g.groupe] || "bg-slate-50 text-slate-700 border-slate-200")}`}
              style={isActive ? { background: "oklch(0.38 0.2 260)" } : {}}>
              {g.groupe} ({g.count})
            </button>
          )
        })}
        {/* Chip catalogue (filtre par marketplaceActif) */}
        <button onClick={() => setFamille("catalogue")}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${famille === "catalogue" ? "text-white border-transparent" : "bg-blue-50 text-blue-700 border-blue-200"}`}
          style={famille === "catalogue" ? { background: "oklch(0.38 0.2 260)" } : {}}>
          Catalogue 🌐 ({articles.filter(a => (a as any).catalogueVisible !== false && (a as any).marketplaceActif !== false).length})
        </button>
      </div>

      {/* Selection action bar */}
      {selectedArticleIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-800 flex-wrap">
          <span className="font-semibold">{selectedArticleIds.size} article(s) selectionne(s)</span>
          <div className="flex-1" />
          {!confirmResetStock ? (
            <button onClick={() => setConfirmResetStock(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              Remise a 0 — Stock
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-red-700">Confirmer stock = 0 pour {selectedArticleIds.size} article(s) ?</span>
              <button onClick={handleResetStock} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-600 hover:bg-red-700">Oui, remettre</button>
              <button onClick={() => setConfirmResetStock(false)} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-border hover:bg-muted">Annuler</button>
            </div>
          )}
          {!confirmResetDefect ? (
            <button onClick={() => setConfirmResetDefect(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              Remise a 0 — Defect
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-red-700">Confirmer defect = 0 pour {selectedArticleIds.size} article(s) ?</span>
              <button onClick={handleResetDefect} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-600 hover:bg-red-700">Oui, remettre</button>
              <button onClick={() => setConfirmResetDefect(false)} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-border hover:bg-muted">Annuler</button>
            </div>
          )}
          {/* Réassignation famille en masse */}
          <div className="flex items-center gap-1">
            <select defaultValue="" onChange={e => { bulkReassignFamille(e.target.value); e.target.value = "" }}
              title="Déplacer les articles sélectionnés vers une famille"
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-blue-300 bg-white text-blue-800">
              <option value="">📁 Déplacer vers famille…</option>
              {familleOptions.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <button type="button" onClick={() => promptNewFamille(nom => bulkReassignFamille(nom))}
              title="Créer une famille et y déplacer la sélection"
              className="px-2 py-1.5 rounded-lg text-xs font-bold border border-blue-300 text-blue-700 hover:bg-blue-100">➕</button>
          </div>
          <button onClick={() => setSelectedArticleIds(new Set())} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-blue-300 hover:bg-blue-100 transition-colors">
            Deselectionner tout
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <input placeholder="Rechercher article..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-52 px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        <div className="flex items-center gap-1 p-1 bg-muted rounded-xl">
          <button onClick={() => setView("grid")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${view === "grid" ? "text-white" : "text-muted-foreground"}`}
            style={view === "grid" ? { background: "oklch(0.38 0.2 260)" } : {}}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
          </button>
          <button onClick={() => setView("table")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${view === "table" ? "text-white" : "text-muted-foreground"}`}
            style={view === "table" ? { background: "oklch(0.38 0.2 260)" } : {}}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
          </button>
        </div>
        {/* Global reset buttons (acts on ALL articles) */}
        {!confirmResetStock && !confirmResetDefect && selectedArticleIds.size === 0 && (
          <div className="flex items-center gap-2">
            <button onClick={() => setConfirmResetStock(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              Remise a 0 Stock
            </button>
            <button onClick={() => setConfirmResetDefect(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              Remise a 0 Defect
            </button>
          </div>
        )}
        {/* Global confirm panels (when no selection) */}
        {selectedArticleIds.size === 0 && confirmResetStock && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200">
            <span className="text-xs font-bold text-red-700">Remettre le stock de TOUS les articles a 0 ?</span>
            <button onClick={handleResetStock} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-600 hover:bg-red-700">Confirmer</button>
            <button onClick={() => setConfirmResetStock(false)} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-border hover:bg-muted">Annuler</button>
          </div>
        )}
        {selectedArticleIds.size === 0 && confirmResetDefect && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200">
            <span className="text-xs font-bold text-red-700">Remettre le defect de TOUS les articles a 0 ?</span>
            <button onClick={handleResetDefect} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-600 hover:bg-red-700">Confirmer</button>
            <button onClick={() => setConfirmResetDefect(false)} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-border hover:bg-muted">Annuler</button>
          </div>
        )}
        <button
          onClick={reloadFromSupabase}
          disabled={reloadingFromSb}
          title="Recharge les articles depuis Supabase (résout les compteurs incohérents 287 vs 135)"
          className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold border-2 transition-all disabled:opacity-60 shadow-sm border-blue-600 bg-blue-600 text-white hover:bg-blue-700">
          {reloadingFromSb
            ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />Rechargement...</>
            : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>🔄 Recharger Supabase</>
          }
        </button>
        <button
          onClick={syncAllArticlesToSupabase}
          disabled={syncingAll}
          title={`Publie les ${articles.length} articles ERP sur le site web shop.vita-core.org`}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border-2 transition-all disabled:opacity-60 shadow-sm ${syncAllDone ? "border-emerald-500 bg-emerald-500 text-white" : "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"}`}>
          {syncingAll
            ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />Publication...</>
            : syncAllDone
              ? <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>✅ Publié sur le site !</>
              : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" /></svg>🌐 Publier sur le site</>
          }
        </button>
        <button onClick={() => { setShowForm(true); setEditArt(null); setForm(EMPTY_FORM) }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
          style={{ background: "oklch(0.38 0.2 260)" }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Nouvel article
        </button>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="bg-card rounded-2xl border border-border p-5">
          <h3 className="font-semibold text-sm mb-4">{editArt ? "Modifier l'article" : "Nouvel article"}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">Nom (Francais)</label>
              <input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} placeholder="Tomates"
                className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">Nom (Arabe)</label>
              <input value={form.nomAr} onChange={e => setForm(f => ({ ...f, nomAr: e.target.value }))} placeholder="طماطم" dir="rtl" lang="ar"
                className="font-arabic px-3 py-2.5 rounded-xl border border-border bg-background text-base focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">Famille</label>
              <div className="flex gap-2">
                <select value={form.famille} onChange={e => setForm(f => ({ ...f, famille: e.target.value }))}
                  className="flex-1 px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none">
                  {familleOptions.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <button type="button" onClick={() => promptNewFamille(nom => setForm(f => ({ ...f, famille: nom })))}
                  title="Créer une nouvelle famille"
                  className="px-3 py-2.5 rounded-xl border border-primary/30 text-primary text-sm font-bold hover:bg-primary/5">➕</button>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">Unite de base / وحدة القياس</label>
              <select value={form.unite} onChange={e => setForm(f => ({ ...f, unite: e.target.value }))}
                className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none">
                {["kg", "g", "pièce", "botte", "colis", "carton", "plateau", "tonne"].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            {/* UM — Unite de Mesure commerciale */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">UM (Unite Mesure commerciale)</label>
              <select value={form.um || ""} onChange={e => setForm(f => ({ ...f, um: e.target.value }))}
                className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none">
                <option value="">-- Aucune UM --</option>
                {UM_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            {/* Colisage par UM */}
            {form.um && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold">Colisage par UM ({form.unite}/{form.um})</label>
                <input type="number" min={0} step={0.1} value={form.colisageParUM ?? ""}
                  onChange={e => setForm(f => ({ ...f, colisageParUM: e.target.value ? Number(e.target.value) : undefined }))}
                  placeholder={`ex: 15 ${form.unite} / ${form.um}`}
                  className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">Prix achat (DH/{form.unite})</label>
              <input type="number" min={0} step={0.01} value={form.prixAchat}
                onChange={e => setForm(f => ({ ...f, prixAchat: Number(e.target.value) }))}
                className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">Methode PV</label>
              <select value={form.pvMethode} onChange={e => setForm(f => ({ ...f, pvMethode: e.target.value as Article["pvMethode"] }))}
                className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none">
                <option value="pourcentage">Pourcentage (%)</option>
                <option value="montant">+ Montant fixe (DH)</option>
                <option value="manuel">Manuel (PV direct)</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">
                {form.pvMethode === "pourcentage" ? "Marge %" : form.pvMethode === "montant" ? "Ajout DH" : "PV Manuel DH"}
              </label>
              <input type="number" min={0} step={0.01} value={form.pvValeur}
                onChange={e => setForm(f => ({ ...f, pvValeur: Number(e.target.value) }))}
                className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            {/* ── PHOTO IMPORT (Fichier / Drag-Drop / URL) ── */}
            <div className="flex flex-col gap-2 sm:col-span-2">
              <label className="text-xs font-semibold">Photo article</label>
              <div className="flex gap-3 items-start flex-wrap">
                {/* Preview */}
                <div className="w-20 h-20 rounded-xl border-2 border-dashed border-border flex items-center justify-center bg-muted/40 overflow-hidden shrink-0">
                  {form.photo
                    ? <img src={form.photo} alt="Apercu photo article" className="w-full h-full object-cover" onError={e => { e.currentTarget.src = DEFAULT_PHOTO }} />
                    : <svg className="w-7 h-7 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  }
                </div>
                <div className="flex flex-col gap-2 flex-1 min-w-0">
                  {/* Hidden inputs: gallery + camera */}
                  <input ref={photoInputRef} type="file" accept="image/*" className="hidden"
                    onChange={e => { const file = e.target.files?.[0]; if (file) handlePhotoUpload(file); e.target.value = "" }} />
                  <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={e => { const file = e.target.files?.[0]; if (file) handlePhotoUpload(file); e.target.value = "" }} />
                  {/* Drag & Drop zone */}
                  <div
                    onDragOver={e => { e.preventDefault(); setPhotoDragOver(true) }}
                    onDragLeave={() => setPhotoDragOver(false)}
                    onDrop={e => {
                      e.preventDefault(); setPhotoDragOver(false)
                      const file = e.dataTransfer.files?.[0]
                      if (file && file.type.startsWith("image/")) handlePhotoUpload(file)
                    }}
                    onClick={() => photoInputRef.current?.click()}
                    className={`flex items-center justify-center gap-2 px-3 py-3 rounded-xl border-2 border-dashed cursor-pointer transition-all text-xs font-semibold ${
                      photoDragOver ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/50 hover:bg-muted/50 text-muted-foreground"
                    }`}>
                    {photoUploading
                      ? <><span className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />Chargement...</>
                      : <><svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                        <span>{photoDragOver ? "Deposez l'image ici" : "Cliquer ou glisser-deposer une image"}</span>
                      </>
                    }
                  </div>
                  {/* Quick action buttons: gallery + camera */}
                  <div className="flex gap-2">
                    <button type="button" onClick={() => photoInputRef.current?.click()}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-600 transition-colors">
                      <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Galerie
                    </button>
                    <button type="button" onClick={() => cameraInputRef.current?.click()}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-600 transition-colors">
                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Appareil photo
                    </button>
                  </div>
                  {/* URL input method */}
                  <div className="flex gap-1.5">
                    <input type="url" value={photoUrlInput}
                      onChange={e => setPhotoUrlInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && photoUrlInput.trim()) {
                          setForm(f => ({ ...f, photo: photoUrlInput.trim() }))
                          setPhotoUrlInput("")
                        }
                      }}
                      placeholder="Ou coller une URL d'image (https://...)"
                      className="flex-1 px-3 py-2 rounded-xl border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary min-w-0" />
                    <button type="button"
                      onClick={() => { if (photoUrlInput.trim()) { setForm(f => ({ ...f, photo: photoUrlInput.trim() })); setPhotoUrlInput("") } }}
                      disabled={!photoUrlInput.trim()}
                      className="px-3 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-muted disabled:opacity-40 shrink-0 transition-colors">
                      OK
                    </button>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {form.photo && (
                      <button type="button" onClick={() => setForm(f => ({ ...f, photo: "" }))}
                        className="text-[10px] text-red-500 hover:underline">
                        Supprimer la photo
                      </button>
                    )}
                    <span className="text-[10px] text-muted-foreground">JPG · PNG · WEBP · URL externe acceptes</span>
                  </div>
                  {photoError && (
                    <p className="text-[10px] text-amber-600 flex items-center gap-1">
                      <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                      {photoError}
                    </p>
                  )}
                </div>
              </div>
            </div>
            {/* PV + Marge preview */}
            <div className="flex gap-2 items-end pb-1 sm:col-span-2 lg:col-span-1">
              <div className="flex-1 px-4 py-2.5 rounded-xl border-2 border-primary/30 bg-primary/5 text-center">
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">PV calcule</p>
                <p className="text-lg font-extrabold text-primary">{DH(computePV({ ...form, id: "" }))}</p>
              </div>
              <div className="flex-1 px-4 py-2.5 rounded-xl border-2 border-green-200 bg-green-50 text-center">
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Marge</p>
                {(() => {
                  const pv = computePV({ ...form, id: "" })
                  const marge = pv - form.prixAchat
                  const pct = form.prixAchat > 0 ? (marge / form.prixAchat) * 100 : 0
                  return <p className="text-lg font-extrabold text-green-700">{pct.toFixed(1)}% <span className="text-xs font-normal">{DH(marge)}</span></p>
                })()}
              </div>
              {form.um && form.colisageParUM && (
                <div className="flex-1 px-4 py-2.5 rounded-xl border-2 border-blue-200 bg-blue-50 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold">PV/{form.um}</p>
                  <p className="text-lg font-extrabold text-blue-700">{DH(computePV({ ...form, id: "" }) * form.colisageParUM)}</p>
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleSave}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: "oklch(0.38 0.2 260)" }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              {editArt ? "Sauvegarder" : "Creer l'article"}
            </button>
            <button onClick={() => { setShowForm(false); setEditArt(null) }}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-border hover:bg-muted transition-colors">Annuler</button>
          </div>
        </div>
      )}

      {/* ── GRID VIEW ── */}
      {view === "grid" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filtered.length === 0 ? (
            <div className="col-span-full py-16 text-center text-muted-foreground text-sm">Aucun article trouve.</div>
          ) : filtered.map(a => {
            const pv = computePV(a)
            const marge = pv - a.prixAchat
            const margePct = a.prixAchat > 0 ? (marge / a.prixAchat) * 100 : 0
            return (
              <div key={a.id} className={`bg-card rounded-2xl border overflow-hidden hover:shadow-md transition-all group flex flex-col ${selectedArticleIds.has(a.id) ? "border-blue-400 ring-2 ring-blue-300" : "border-border"} ${!(a.actif ?? true) ? "opacity-60" : ""}`}>
                {/* Image */}
                <div className="relative w-full aspect-square bg-muted/40 overflow-hidden">
                  <img
                    src={resolveArticlePhoto(a)}
                    alt={`${a.nom} — fruit ou legume frais`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    onError={e => { e.currentTarget.src = DEFAULT_PHOTO }}
                  />
                  {/* Select checkbox */}
                  <div className="absolute top-1.5 left-1.5" onClick={e => e.stopPropagation()}>
                    <input type="checkbox"
                      checked={selectedArticleIds.has(a.id)}
                      onChange={e => {
                        const next = new Set(selectedArticleIds)
                        if (e.target.checked) next.add(a.id)
                        else next.delete(a.id)
                        setSelectedArticleIds(next)
                      }}
                      className="w-4 h-4 rounded accent-blue-600 cursor-pointer shadow-sm"
                    />
                  </div>
                  {/* Famille badge */}
                  <div className={`absolute top-1.5 right-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${FAMILLE_COLORS[a.famille] || "bg-slate-50 text-slate-700 border-slate-200"}`}>
                    {a.famille.split(" ").slice(-1)[0]}
                  </div>
                  {/* Stock badge */}
                  <div className={`absolute bottom-1.5 right-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${a.stockDisponible > 0 ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                    {a.stockDisponible > 0 ? `${a.stockDisponible} ${a.unite}` : "Rupture"}
                  </div>
                  {/* Inactive overlay */}
                  {!(a.actif ?? true) && (
                    <div className="absolute inset-0 bg-slate-900/40 flex items-center justify-center">
                      <span className="px-2 py-1 rounded-lg bg-slate-800/80 text-white text-[10px] font-black uppercase tracking-wide">Désactivé</span>
                    </div>
                  )}
                  {/* Catalogue hidden badge */}
                  {(a.actif ?? true) && !(a.catalogueVisible ?? true) && (
                    <div className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-full bg-slate-700/80 text-white text-[9px] font-bold">
                      🚫 Catalogue
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-3 flex flex-col gap-1 flex-1">
                  <p className="font-semibold text-sm text-foreground truncate">{a.nom}</p>
                  <p className="font-arabic text-[12px] text-muted-foreground" dir="rtl" lang="ar">{a.nomAr}</p>
                  <div className="flex justify-between items-center mt-auto pt-2">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Achat</p>
                      <p className="text-xs font-bold font-mono text-red-600">{DH(a.prixAchat)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground">Vente</p>
                      <p className="text-xs font-bold font-mono text-green-600">{DH(pv)}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-muted-foreground">Marge</span>
                    <span className="text-[10px] font-bold text-blue-600">+{margePct.toFixed(0)}%</span>
                  </div>
                  {a.um && a.colisageParUM && (
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-muted-foreground">{a.um}</span>
                      <span className="text-[10px] font-semibold text-purple-600">{a.colisageParUM} {a.unite}</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex border-t border-border">
                  <button onClick={() => setShowHisto(a)}
                    className="flex-1 py-2 text-xs font-semibold text-muted-foreground hover:text-blue-600 hover:bg-blue-50 transition-colors flex items-center justify-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                    Histo PA
                  </button>
                  <button onClick={() => openEdit(a)}
                    className="flex-1 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-1 border-l border-border">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    Modifier
                  </button>
                  <button onClick={() => handleToggleActif(a.id)}
                    title={(a.actif ?? true) ? "Désactiver (stock + catalogue)" : "Réactiver"}
                    className={`flex-1 py-2 text-xs font-semibold transition-colors flex items-center justify-center gap-1 border-l border-border ${(a.actif ?? true) ? "text-muted-foreground hover:text-amber-600 hover:bg-amber-50" : "text-amber-600 hover:bg-amber-50"}`}>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={a.actif ?? true ? "M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" : "M5 13l4 4L19 7"} /></svg>
                    {(a.actif ?? true) ? "Désact." : "Activer"}
                  </button>
                  <button onClick={() => handleDelete(a.id)}
                    className="flex-1 py-2 text-xs font-semibold text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors flex items-center justify-center gap-1 border-l border-border">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    Suppr.
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── TABLE VIEW ── */}
      {view === "table" && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "oklch(0.14 0.03 260)" }}>
                  <th className="px-4 py-3 w-10">
                    <input type="checkbox"
                      checked={filtered.length > 0 && filtered.every(a => selectedArticleIds.has(a.id))}
                      onChange={e => {
                        if (e.target.checked) setSelectedArticleIds(new Set(filtered.map(a => a.id)))
                        else setSelectedArticleIds(new Set())
                      }}
                      className="w-4 h-4 rounded accent-blue-400 cursor-pointer"
                      title="Tout selectionner / deselectionner"
                    />
                  </th>
                  {["Image", "Nom", "Famille", "Unite", "PA (DH)", "Methode PV", "PV (DH)", "Marge", "Stock", "Defect", "Actions"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: "oklch(0.88 0.015 245)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={12} className="px-4 py-10 text-center text-muted-foreground">Aucun article</td></tr>
                ) : filtered.map(a => {
                  const pv = computePV(a)
                  const marge = pv - a.prixAchat
                  const margePct = a.prixAchat > 0 ? (marge / a.prixAchat) * 100 : 0
                  return (
                    <tr key={a.id} className={`border-t border-border hover:bg-muted/30 transition-colors ${selectedArticleIds.has(a.id) ? "bg-blue-50" : ""}`}>
                      <td className="px-4 py-2 w-10" onClick={e => e.stopPropagation()}>
                        <input type="checkbox"
                          checked={selectedArticleIds.has(a.id)}
                          onChange={e => {
                            const next = new Set(selectedArticleIds)
                            if (e.target.checked) next.add(a.id)
                            else next.delete(a.id)
                            setSelectedArticleIds(next)
                          }}
                          className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <img src={resolveArticlePhoto(a)} alt={`${a.nom} produit frais`}
                          loading="lazy" decoding="async"
                          className="w-10 h-10 rounded-xl object-cover border border-border"
                          onError={e => { e.currentTarget.src = DEFAULT_PHOTO }} />
                      </td>
                      <td className="px-4 py-2">
                        <p className="font-semibold text-foreground">{a.nom}</p>
                        <p className="font-arabic text-sm text-muted-foreground" dir="rtl" lang="ar">{a.nomAr}</p>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${FAMILLE_COLORS[a.famille] || "bg-slate-50 text-slate-700 border-slate-200"}`}>
                          {a.famille}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{a.unite}</td>
                      <td className="px-4 py-2 font-mono font-semibold text-red-600">{DH(a.prixAchat)}</td>
                      <td className="px-4 py-2 text-muted-foreground text-xs">{a.pvMethode === "pourcentage" ? `${a.pvValeur}%` : a.pvMethode === "montant" ? `+${a.pvValeur} DH` : "Manuel"}</td>
                      <td className="px-4 py-2 font-mono font-semibold text-green-600">{DH(pv)}</td>
                      <td className="px-4 py-2 font-bold text-blue-600">+{margePct.toFixed(0)}%</td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${a.stockDisponible > 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                          {a.stockDisponible.toLocaleString("fr-MA")} {a.unite}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-red-500 font-mono">{a.stockDefect}</td>
                      <td className="px-4 py-2">
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(a)}
                            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Modifier">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          <button onClick={() => handleToggleActif(a.id)}
                            title={(a.actif ?? true) ? "Désactiver (stock+catalogue)" : "Réactiver"}
                            className={`p-1.5 rounded-lg transition-colors ${(a.actif ?? true) ? "hover:bg-amber-50 text-muted-foreground hover:text-amber-600" : "bg-amber-50 text-amber-600 hover:bg-amber-100"}`}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={(a.actif ?? true) ? "M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" : "M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z"} /></svg>
                          </button>
                          <button onClick={() => handleToggleCatalogue(a.id)}
                            title={(a.catalogueVisible ?? true) ? "Masquer du catalogue portail" : "Afficher dans le catalogue portail"}
                            className={`p-1.5 rounded-lg transition-colors ${(a.catalogueVisible ?? true) ? "hover:bg-blue-50 text-muted-foreground hover:text-blue-600" : "bg-slate-100 text-slate-400 hover:bg-blue-50 hover:text-blue-600"}`}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={(a.catalogueVisible ?? true) ? "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" : "M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"} /></svg>
                          </button>
                          <button onClick={() => handleDelete(a.id)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors" title="Supprimer définitivement">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
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
      </>
      )}
    </div>
  )
}
