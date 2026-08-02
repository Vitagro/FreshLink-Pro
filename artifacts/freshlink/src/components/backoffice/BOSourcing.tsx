"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { store, type SourcingEntry, type SourcingGrade, type SourcingStatut, type Article, type Fournisseur, type UserRole } from "@/lib/store"
import { hasPermission } from "@/lib/permissions"
import { logAction } from "@/lib/auditLog"
import ArticleCombobox from "@/components/ui/ArticleCombobox"

const CATEGORIES = ["Légumes fruits","Légumes racines","Légumes feuilles","Herbes aromatiques","Agrumes","Fruits tropicaux","Fruits rouges","Fruits secs","Céréales","Autre"]
const REGIONS = ["Casablanca","Agadir","Marrakech","Fès","Meknès","Rabat","Salé","Oujda","Tétouan","Dakhla","Souss","Gharb","Autre"]
const UNITES = ["kg","tonne","caisse","palette","unité","lot","sac"]
const DELAIS = ["Immédiat","J+1","24h","48h","72h","1 semaine","Sur commande"]

const GRADE_COLORS: Record<SourcingGrade, string> = {
  "A+": "bg-emerald-100 text-emerald-800 border-emerald-300",
  "A":  "bg-blue-100 text-blue-800 border-blue-300",
  "B":  "bg-yellow-100 text-yellow-800 border-yellow-300",
  "C":  "bg-red-100 text-red-800 border-red-300",
}
const STATUT_COLORS: Record<SourcingStatut, string> = {
  disponible: "bg-green-100 text-green-700 border-green-200",
  epuise:     "bg-red-100 text-red-700 border-red-200",
  commande:   "bg-blue-100 text-blue-700 border-blue-200",
  annule:     "bg-slate-100 text-slate-500 border-slate-200",
}
const STATUT_LABELS: Record<SourcingStatut, string> = {
  disponible: "Disponible",
  epuise:     "Épuisé",
  commande:   "Commandé",
  annule:     "Annulé",
}

function uid() { return `src_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` }

const EMPTY_FORM = (): Omit<SourcingEntry, "id" | "createdAt" | "updatedAt" | "userId" | "userName"> => ({
  articleId: "",
  articleNom: "",
  categorie: "Légumes fruits",
  produitAValider: false,
  fournisseurId: "",
  fournisseurNom: "",
  fournisseurTel: "",
  fournisseurContact: "",
  fournisseurAValider: false,
  region: "Casablanca",
  marche: "",
  adresse: "",
  gpsLat: undefined,
  gpsLng: undefined,
  prixUnitaire: 0,
  prixNegociable: false,
  prixMin: undefined,
  unite: "kg",
  quantiteDisponible: 0,
  quantiteMin: undefined,
  qualiteGrade: "A",
  photoUrls: [],
  disponibleJusquA: "",
  delaiLivraison: "Immédiat",
  notes: "",
  statut: "disponible",
})

export default function BOSourcing({ user }: { user?: { id: string; name: string; role?: UserRole } }) {
  const [entries, setEntries]     = useState<SourcingEntry[]>([])
  const [articles, setArticles]   = useState<Article[]>([])
  // Nom arabe — uniquement pour les entrees liees a un article du catalogue
  // (produits hors catalogue, en attente de validation, n'en ont pas).
  const nomArOf = (articleId?: string) => (articleId ? articles.find(a => a.id === articleId)?.nomAr ?? "" : "")
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([])
  const [view, setView]           = useState<"list" | "form" | "detail">("list")
  const [editId, setEditId]       = useState<string | null>(null)
  const [selected, setSelected]   = useState<SourcingEntry | null>(null)
  const [search, setSearch]       = useState("")
  const [filterCat, setFilterCat] = useState("all")
  const [filterReg, setFilterReg] = useState("all")
  const [filterStat, setFilterStat] = useState<"all" | SourcingStatut>("all")
  const [filterGrade, setFilterGrade] = useState<"all" | SourcingGrade>("all")
  const [form, setForm]           = useState(EMPTY_FORM())
  const [gpsLoading, setGpsLoading] = useState(false)
  const [saved, setSaved]         = useState("")
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    setEntries(store.getSourcingEntries())
    setArticles(store.getArticles())
    setFournisseurs(store.getFournisseurs())
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = entries.filter(e => {
    if (filterCat !== "all" && e.categorie !== filterCat) return false
    if (filterReg !== "all" && e.region !== filterReg) return false
    if (filterStat !== "all" && e.statut !== filterStat) return false
    if (filterGrade !== "all" && e.qualiteGrade !== filterGrade) return false
    if (search) {
      const q = search.toLowerCase()
      if (
        !e.articleNom.toLowerCase().includes(q) &&
        !e.fournisseurNom.toLowerCase().includes(q) &&
        !e.marche.toLowerCase().includes(q)
      ) return false
    }
    return true
  })

  const stats = {
    total: entries.length,
    dispo: entries.filter(e => e.statut === "disponible").length,
    regions: [...new Set(entries.map(e => e.region))].length,
    avgPrice: entries.length > 0 ? (entries.reduce((s, e) => s + e.prixUnitaire, 0) / entries.length) : 0,
  }

  function openNew() {
    setForm(EMPTY_FORM())
    setEditId(null)
    setView("form")
  }

  function openEdit(e: SourcingEntry) {
    setForm({
      articleId: e.articleId ?? "",
      articleNom: e.articleNom,
      categorie: e.categorie,
      fournisseurNom: e.fournisseurNom,
      fournisseurTel: e.fournisseurTel ?? "",
      fournisseurContact: e.fournisseurContact ?? "",
      region: e.region,
      marche: e.marche,
      adresse: e.adresse ?? "",
      gpsLat: e.gpsLat,
      gpsLng: e.gpsLng,
      prixUnitaire: e.prixUnitaire,
      prixNegociable: e.prixNegociable,
      prixMin: e.prixMin,
      unite: e.unite,
      quantiteDisponible: e.quantiteDisponible,
      quantiteMin: e.quantiteMin,
      qualiteGrade: e.qualiteGrade,
      photoUrls: e.photoUrls ?? [],
      disponibleJusquA: e.disponibleJusquA ?? "",
      delaiLivraison: e.delaiLivraison ?? "",
      notes: e.notes ?? "",
      statut: e.statut,
    })
    setEditId(e.id)
    setView("form")
  }

  function handleGPS() {
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setForm(f => ({ ...f, gpsLat: pos.coords.latitude, gpsLng: pos.coords.longitude }))
        setGpsLoading(false)
      },
      () => setGpsLoading(false),
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    files.slice(0, 4 - (form.photoUrls?.length ?? 0)).forEach(file => {
      const reader = new FileReader()
      reader.onload = ev => {
        const url = ev.target?.result as string
        setForm(f => ({ ...f, photoUrls: [...(f.photoUrls ?? []), url].slice(0, 4) }))
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ""
  }

  function handleSave() {
    if (!form.articleNom.trim() || !form.fournisseurNom.trim()) {
      alert("Nom article et fournisseur obligatoires")
      return
    }
    const now = new Date().toISOString()
    if (editId) {
      const existing = entries.find(e => e.id === editId)!
      store.updateSourcingEntry({ ...existing, ...form, updatedAt: now })
    } else {
      store.addSourcingEntry({
        id: uid(),
        createdAt: now,
        updatedAt: now,
        userId: user?.id ?? "unknown",
        userName: user?.name ?? "Inconnu",
        ...form,
      })
    }
    setSaved("Fiche sauvegardée !")
    setTimeout(() => setSaved(""), 2000)
    load()
    setView("list")
  }

  function handleDelete(id: string) {
    if (!hasPermission(user?.role, "supprimer_article")) { logAction(user as { id: string; name: string; role: UserRole } | undefined, "supprimer_article", "denied", { type: "sourcing_entry", id }); return }
    logAction(user as { id: string; name: string; role: UserRole } | undefined, "supprimer_article", "success", { type: "sourcing_entry", id })
    store.deleteSourcingEntry(id)
    load()
    setConfirmDelete(null)
    if (view === "detail") setView("list")
  }

  function formatGMapsUrl(lat: number, lng: number) {
    return `https://maps.google.com/?q=${lat},${lng}`
  }

  function formatWA(entry: SourcingEntry) {
    const txt = `🛒 *Sourcing FreshLink Pro*\n\n*Article:* ${entry.articleNom} (${entry.categorie})\n*Grade:* ${entry.qualiteGrade} | *Statut:* ${STATUT_LABELS[entry.statut]}\n*Prix:* ${entry.prixUnitaire} MAD/${entry.unite}\n*Qté dispo:* ${entry.quantiteDisponible} ${entry.unite}\n*Fournisseur:* ${entry.fournisseurNom}\n*Marché:* ${entry.marche} — ${entry.region}\n*Délai:* ${entry.delaiLivraison ?? "?"}`
    return `https://wa.me/?text=${encodeURIComponent(txt)}`
  }

  if (view === "detail" && selected) {
    return (
      <div className="flex flex-col gap-4 max-w-2xl mx-auto">
        <button onClick={() => setView("list")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground self-start">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Retour
        </button>

        {/* Photos */}
        {(selected.photoUrls ?? []).length > 0 && (
          <div className="flex gap-2 overflow-x-auto">
            {selected.photoUrls!.map((url, i) => (
              <img key={i} src={url} alt={`photo ${i+1}`} className="h-40 w-40 object-cover rounded-xl border border-border shrink-0" />
            ))}
          </div>
        )}

        {/* Header */}
        <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-xl font-black text-foreground">{selected.articleNom}</h2>
              {nomArOf(selected.articleId) && <p className="text-sm text-muted-foreground font-arabic" dir="rtl" lang="ar">{nomArOf(selected.articleId)}</p>}
              <p className="text-sm text-muted-foreground">{selected.categorie}</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${GRADE_COLORS[selected.qualiteGrade]}`}>Grade {selected.qualiteGrade}</span>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${STATUT_COLORS[selected.statut]}`}>{STATUT_LABELS[selected.statut]}</span>
            </div>
          </div>

          {/* Price */}
          <div className="flex items-center gap-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
            <div>
              <p className="text-2xl font-black text-emerald-800">{selected.prixUnitaire.toFixed(2)} <span className="text-sm">MAD/{selected.unite}</span></p>
              {selected.prixNegociable && selected.prixMin && (
                <p className="text-xs text-emerald-600">Négociable à partir de {selected.prixMin} MAD/{selected.unite}</p>
              )}
            </div>
            <div className="ml-auto text-right">
              <p className="text-lg font-bold text-foreground">{selected.quantiteDisponible} {selected.unite}</p>
              <p className="text-xs text-muted-foreground">disponibles</p>
              {selected.quantiteMin && <p className="text-xs text-amber-600">Min commande: {selected.quantiteMin} {selected.unite}</p>}
            </div>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex flex-col gap-0.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Fournisseur</p>
              <p className="font-semibold text-foreground">{selected.fournisseurNom}</p>
              {selected.fournisseurContact && <p className="text-xs text-muted-foreground">{selected.fournisseurContact}</p>}
              {selected.fournisseurTel && (
                <a href={`tel:${selected.fournisseurTel}`} className="text-xs text-blue-600 hover:underline">{selected.fournisseurTel}</a>
              )}
            </div>
            <div className="flex flex-col gap-0.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Localisation</p>
              <p className="font-semibold text-foreground">{selected.marche}</p>
              <p className="text-xs text-muted-foreground">{selected.region}</p>
              {selected.adresse && <p className="text-xs text-muted-foreground">{selected.adresse}</p>}
            </div>
            {selected.delaiLivraison && (
              <div className="flex flex-col gap-0.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Délai livraison</p>
                <p className="font-semibold text-foreground">{selected.delaiLivraison}</p>
              </div>
            )}
            {selected.disponibleJusquA && (
              <div className="flex flex-col gap-0.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Disponible jusqu&apos;au</p>
                <p className="font-semibold text-foreground">{new Date(selected.disponibleJusquA).toLocaleDateString("fr-MA")}</p>
              </div>
            )}
          </div>

          {selected.notes && (
            <div className="bg-muted/40 rounded-xl px-4 py-3">
              <p className="text-xs text-muted-foreground">{selected.notes}</p>
            </div>
          )}

          {/* GPS */}
          {selected.gpsLat && selected.gpsLng && (
            <a href={formatGMapsUrl(selected.gpsLat, selected.gpsLng)} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-sm font-semibold hover:bg-blue-100 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              Voir sur Google Maps ({selected.gpsLat.toFixed(4)}, {selected.gpsLng.toFixed(4)})
            </a>
          )}

          {/* Actions */}
          <div className="flex gap-2 flex-wrap pt-1">
            <button onClick={() => openEdit(selected)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:opacity-90">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              Modifier
            </button>
            <a href={selected.fournisseurTel ? `https://wa.me/${selected.fournisseurTel.replace(/\D/g,"")}` : formatWA(selected)}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-500 text-white text-sm font-semibold hover:bg-green-600">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347" /></svg>
              WhatsApp Fournisseur
            </a>
            <button onClick={() => setConfirmDelete(selected.id)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              Supprimer
            </button>
          </div>
        </div>

        {/* Confirm delete */}
        {confirmDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-card rounded-2xl border border-border shadow-xl p-6 flex flex-col gap-4 w-80">
              <p className="font-bold text-foreground">Supprimer cette fiche de sourcing ?</p>
              <p className="text-sm text-muted-foreground">Cette action est irréversible.</p>
              <div className="flex gap-2">
                <button onClick={() => handleDelete(confirmDelete)} className="flex-1 py-2 rounded-xl bg-red-600 text-white font-bold text-sm">Supprimer</button>
                <button onClick={() => setConfirmDelete(null)} className="flex-1 py-2 rounded-xl border border-border text-sm font-semibold">Annuler</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (view === "form") {
    return (
      <div className="flex flex-col gap-5 max-w-2xl mx-auto">
        <div className="flex items-center justify-between gap-3">
          <button onClick={() => setView("list")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Annuler
          </button>
          <h2 className="font-bold text-foreground">{editId ? "Modifier la fiche" : "Nouvelle fiche sourcing"}</h2>
        </div>

        {/* Article */}
        <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-4">
          <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-black">1</span>
            Informations Produit / معلومات المنتج
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2 flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted-foreground">Nom article *</label>
              <div className="flex gap-2">
                <input value={form.articleNom}
                  onChange={e => setForm(f => ({ ...f, articleNom: e.target.value, articleId: "", produitAValider: !!e.target.value.trim() }))}
                  placeholder="Choisir dans le catalogue, ou saisir un nouveau produit →"
                  className="flex-1 px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                {articles.length > 0 && (
                  <ArticleCombobox
                    articles={articles}
                    value={form.articleId ?? ""}
                    onChange={(artId, art) => {
                      if (art) setForm(f => ({ ...f, articleId: art.id, articleNom: art.nom, categorie: art.famille ?? f.categorie, unite: art.unite ?? f.unite, produitAValider: false }))
                    }}
                    placeholder="Catalogue..."
                    className="w-48"
                  />
                )}
              </div>
              {form.produitAValider && form.articleNom.trim() && (
                <p className="text-[11px] text-amber-600 font-semibold">⏳ Nouveau produit hors catalogue — sera proposé à la validation d&apos;un admin (non ajouté automatiquement).</p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted-foreground">Catégorie</label>
              <select value={form.categorie} onChange={e => setForm(f => ({ ...f, categorie: e.target.value }))}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted-foreground">Grade qualité</label>
              <div className="flex gap-2">
                {(["A+","A","B","C"] as SourcingGrade[]).map(g => (
                  <button key={g} type="button" onClick={() => setForm(f => ({ ...f, qualiteGrade: g }))}
                    className={`flex-1 py-2 rounded-xl border-2 text-sm font-bold transition-all ${form.qualiteGrade === g ? GRADE_COLORS[g] + " border-current" : "border-border text-muted-foreground"}`}>
                    {g}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Supplier */}
        <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-4">
          <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-black">2</span>
            Fournisseur / المورد
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">Fournisseur *</label>
              <select
                value={form.fournisseurAValider ? "__autre" : (form.fournisseurId || "")}
                onChange={e => {
                  const v = e.target.value
                  if (v === "__autre") { setForm(f => ({ ...f, fournisseurId: "", fournisseurNom: "", fournisseurAValider: true })) }
                  else if (v === "") { setForm(f => ({ ...f, fournisseurId: "", fournisseurNom: "", fournisseurAValider: false })) }
                  else {
                    const fr = fournisseurs.find(x => x.id === v)
                    if (fr) setForm(f => ({ ...f, fournisseurId: fr.id, fournisseurNom: fr.nom, fournisseurTel: fr.telephone ?? f.fournisseurTel, fournisseurContact: fr.contact ?? f.fournisseurContact, fournisseurAValider: false }))
                  }
                }}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">— Choisir un fournisseur —</option>
                {fournisseurs.map(fr => <option key={fr.id} value={fr.id}>{fr.nom}</option>)}
                <option value="__autre">➕ Autre / nouveau fournisseur (à valider)</option>
              </select>
              {form.fournisseurAValider && (
                <>
                  <input value={form.fournisseurNom} onChange={e => setForm(f => ({ ...f, fournisseurNom: e.target.value }))}
                    placeholder="Nom du nouveau fournisseur / المورد"
                    className="mt-1 px-3 py-2 rounded-xl border border-amber-300 bg-amber-50 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                  <p className="text-[11px] text-amber-600 font-semibold">⏳ Nouveau fournisseur hors liste — sera proposé à la validation d&apos;un admin (non ajouté automatiquement).</p>
                </>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted-foreground">Téléphone / WhatsApp</label>
              <input value={form.fournisseurTel} onChange={e => setForm(f => ({ ...f, fournisseurTel: e.target.value }))}
                placeholder="+212 6..."
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="sm:col-span-2 flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted-foreground">Personne de contact</label>
              <input value={form.fournisseurContact} onChange={e => setForm(f => ({ ...f, fournisseurContact: e.target.value }))}
                placeholder="Nom du contact"
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
        </div>

        {/* Location */}
        <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-4">
          <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-black">3</span>
            Localisation & GPS
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted-foreground">Région / المدينة</label>
              <select value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                {REGIONS.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted-foreground">Marché / السوق</label>
              <input value={form.marche} onChange={e => setForm(f => ({ ...f, marche: e.target.value }))}
                placeholder="Marché de gros, Souk..."
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="sm:col-span-2 flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted-foreground">Adresse précise</label>
              <input value={form.adresse} onChange={e => setForm(f => ({ ...f, adresse: e.target.value }))}
                placeholder="Adresse, numéro de stand..."
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="sm:col-span-2 flex gap-2 items-end">
              <div className="flex-1 flex flex-col gap-1">
                <label className="text-xs font-semibold text-muted-foreground">Latitude GPS</label>
                <input type="number" step="0.000001" value={form.gpsLat ?? ""}
                  onChange={e => setForm(f => ({ ...f, gpsLat: e.target.value ? parseFloat(e.target.value) : undefined }))}
                  placeholder="33.5731..."
                  className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="flex-1 flex flex-col gap-1">
                <label className="text-xs font-semibold text-muted-foreground">Longitude GPS</label>
                <input type="number" step="0.000001" value={form.gpsLng ?? ""}
                  onChange={e => setForm(f => ({ ...f, gpsLng: e.target.value ? parseFloat(e.target.value) : undefined }))}
                  placeholder="-7.5898..."
                  className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <button type="button" onClick={handleGPS} disabled={gpsLoading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 shrink-0">
                {gpsLoading ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                )}
                Ma position
              </button>
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-4">
          <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-black">4</span>
            Prix & Quantité / السعر والكمية
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted-foreground">Prix unitaire (MAD)</label>
              <input type="number" step="0.01" min="0" value={form.prixUnitaire || ""}
                onChange={e => setForm(f => ({ ...f, prixUnitaire: parseFloat(e.target.value) || 0 }))}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted-foreground">Unité</label>
              <select value={form.unite} onChange={e => setForm(f => ({ ...f, unite: e.target.value }))}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                {UNITES.map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted-foreground">Qté disponible</label>
              <input type="number" min="0" value={form.quantiteDisponible || ""}
                onChange={e => setForm(f => ({ ...f, quantiteDisponible: parseFloat(e.target.value) || 0 }))}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted-foreground">Qté min commande</label>
              <input type="number" min="0" value={form.quantiteMin ?? ""}
                onChange={e => setForm(f => ({ ...f, quantiteMin: e.target.value ? parseFloat(e.target.value) : undefined }))}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          {/* Negotiable */}
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setForm(f => ({ ...f, prixNegociable: !f.prixNegociable }))}
              className={`relative w-10 h-6 rounded-full transition-colors ${form.prixNegociable ? "bg-emerald-500" : "bg-slate-200"}`}>
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${form.prixNegociable ? "left-5" : "left-1"}`} />
            </button>
            <label className="text-sm font-medium text-foreground">Prix négociable</label>
            {form.prixNegociable && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs text-muted-foreground">Prix min:</span>
                <input type="number" step="0.01" min="0" value={form.prixMin ?? ""}
                  onChange={e => setForm(f => ({ ...f, prixMin: e.target.value ? parseFloat(e.target.value) : undefined }))}
                  placeholder="Min MAD"
                  className="w-24 px-2 py-1.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            )}
          </div>
        </div>

        {/* Availability & Status */}
        <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-4">
          <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-xs font-black">5</span>
            Disponibilité & Statut
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted-foreground">Statut</label>
              <select value={form.statut} onChange={e => setForm(f => ({ ...f, statut: e.target.value as SourcingStatut }))}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                {Object.entries(STATUT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted-foreground">Disponible jusqu&apos;au</label>
              <input type="date" value={form.disponibleJusquA} onChange={e => setForm(f => ({ ...f, disponibleJusquA: e.target.value }))}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted-foreground">Délai livraison</label>
              <select value={form.delaiLivraison} onChange={e => setForm(f => ({ ...f, delaiLivraison: e.target.value }))}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                {DELAIS.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Photos */}
        <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-4">
          <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center text-xs font-black">6</span>
            Photos produit (max 4)
          </h3>
          <div className="flex gap-3 flex-wrap">
            {(form.photoUrls ?? []).map((url, i) => (
              <div key={i} className="relative w-24 h-24">
                <img src={url} alt={`photo ${i+1}`} className="w-24 h-24 object-cover rounded-xl border border-border" />
                <button type="button" onClick={() => setForm(f => ({ ...f, photoUrls: f.photoUrls!.filter((_, idx) => idx !== i) }))}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-black hover:bg-red-600">
                  ×
                </button>
              </div>
            ))}
            {(form.photoUrls?.length ?? 0) < 4 && (
              <button type="button" onClick={() => photoInputRef.current?.click()}
                className="w-24 h-24 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                <span className="text-[10px]">Ajouter</span>
              </button>
            )}
          </div>
          <input ref={photoInputRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={handlePhotoUpload} />
        </div>

        {/* Notes */}
        <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-2">
          <label className="text-xs font-semibold text-muted-foreground">Notes / ملاحظات</label>
          <textarea rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Informations supplémentaires sur ce produit ou fournisseur..."
            className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
        </div>

        {saved && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            {saved}
          </div>
        )}

        <button onClick={handleSave}
          className="flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-700 text-white font-bold text-sm hover:bg-emerald-800 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          {editId ? "Mettre à jour" : "Enregistrer la fiche sourcing"}
        </button>
      </div>
    )
  }

  // LIST VIEW
  return (
    <div className="flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-black text-foreground">Sourcing Marché / تحديد المصادر</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Catalogue des prix et disponibilités du marché de gros</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-800 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Nouvelle fiche
        </button>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total fiches", value: stats.total, color: "bg-slate-50 border-slate-200" },
          { label: "Disponibles", value: stats.dispo, color: "bg-green-50 border-green-200" },
          { label: "Régions couvertes", value: stats.regions, color: "bg-blue-50 border-blue-200" },
          { label: "Prix moy.", value: stats.avgPrice > 0 ? `${stats.avgPrice.toFixed(1)} MAD` : "-", color: "bg-amber-50 border-amber-200" },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border p-3 ${s.color}`}>
            <p className="text-xl font-black text-foreground">{s.value}</p>
            <p className="text-[11px] text-muted-foreground font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..."
          className="flex-1 min-w-[160px] px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
          className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
          <option value="all">Toutes catégories</option>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={filterReg} onChange={e => setFilterReg(e.target.value)}
          className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
          <option value="all">Toutes régions</option>
          {REGIONS.map(r => <option key={r}>{r}</option>)}
        </select>
        <select value={filterStat} onChange={e => setFilterStat(e.target.value as typeof filterStat)}
          className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
          <option value="all">Tous statuts</option>
          {Object.entries(STATUT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterGrade} onChange={e => setFilterGrade(e.target.value as typeof filterGrade)}
          className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
          <option value="all">Tous grades</option>
          {(["A+","A","B","C"] as SourcingGrade[]).map(g => <option key={g} value={g}>Grade {g}</option>)}
        </select>
      </div>

      {/* Cards grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <svg className="w-12 h-12 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <p className="text-sm font-semibold">Aucune fiche de sourcing</p>
          <button onClick={openNew} className="text-xs text-emerald-600 hover:underline font-semibold">+ Créer la première fiche</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(entry => (
            <div key={entry.id}
              className="bg-card rounded-2xl border border-border overflow-hidden hover:shadow-md transition-shadow cursor-pointer group"
              onClick={() => { setSelected(entry); setView("detail") }}>
              {/* Photo or placeholder */}
              <div className="h-36 bg-gradient-to-br from-slate-100 to-slate-200 relative overflow-hidden">
                {(entry.photoUrls ?? []).length > 0 ? (
                  <img src={entry.photoUrls![0]} alt={entry.articleNom} className="w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-10 h-10 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
                <div className="absolute top-2 left-2 flex gap-1">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${GRADE_COLORS[entry.qualiteGrade]}`}>
                    {entry.qualiteGrade}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUT_COLORS[entry.statut]}`}>
                    {STATUT_LABELS[entry.statut]}
                  </span>
                </div>
                {(entry.photoUrls?.length ?? 0) > 1 && (
                  <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-md">
                    +{entry.photoUrls!.length - 1} photos
                  </div>
                )}
              </div>
              <div className="p-4 flex flex-col gap-2">
                <div>
                  <h3 className="font-bold text-foreground text-sm leading-tight">{entry.articleNom}</h3>
                  {nomArOf(entry.articleId) && <p className="text-[11px] text-muted-foreground font-arabic" dir="rtl" lang="ar">{nomArOf(entry.articleId)}</p>}
                  <p className="text-[11px] text-muted-foreground">{entry.categorie}</p>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-black text-emerald-700">{entry.prixUnitaire.toFixed(2)} <span className="text-xs font-semibold">MAD/{entry.unite}</span></span>
                  <span className="text-xs text-muted-foreground font-medium">{entry.quantiteDisponible} {entry.unite}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /></svg>
                  {entry.marche} — {entry.region}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground border-t border-border pt-2">
                  <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                  {entry.fournisseurNom}
                  {entry.delaiLivraison && <span className="ml-auto font-semibold text-blue-600">{entry.delaiLivraison}</span>}
                </div>
                {entry.prixNegociable && (
                  <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full self-start">
                    Prix négociable
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
