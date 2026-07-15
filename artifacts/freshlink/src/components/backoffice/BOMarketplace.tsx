"use client"

import { useState, useEffect, useRef } from "react"
import { store, type Article, type User } from "@/lib/store"
import { hasPermission } from "@/lib/permissions"
import { logAction } from "@/lib/auditLog"

// ─── helpers ──────────────────────────────────────────────────────────────────

// Message d'erreur sync diagnostique. La cause #1 = fl_articles en schéma
// plat dans Supabase (erreur "column payload does not exist", code 42703) →
// corrigé en lançant sql/FIX-CORE-TABLES-SCHEMA.sql.
function sbSyncErr(errors: string[]): string {
  const first = errors[0] ?? ""
  if (/payload|42703|column .* does not exist|schema cache/i.test(first)) {
    return "⚠️ Table fl_articles en mauvais schéma sur Supabase. Lancez sql/FIX-CORE-TABLES-SCHEMA.sql (SQL Editor) puis réessayez."
  }
  return `⚠️ Erreur synchronisation Supabase${first ? " : " + first.slice(0, 120) : ""}`
}

// Règle confirmée : PV web (visiteurs sans compte) = moyenne des prix segments
// renseignés (CHR / Marchand / Particulier) pour les clients avec compte —
// jamais plafonné/flooré par le prix système (sinon le calcul affiché diverge
// du résultat réel, ex: CHR=20/Marchand=19/Particulier=17 → 18.67, pas 19.50).
// Repli sur le prix système (PA + pvMethode/pvValeur) si aucun segment renseigné.
function computePV(a: Article): number {
  // ⚠️ Coercition Number obligatoire : les valeurs venant de Supabase/localStorage
  // peuvent être des strings, ce qui casse .toFixed() ("E.toFixed is not a function")
  const rec = a as unknown as Record<string, unknown>
  const seg = [Number(rec.prixCHR) || 0, Number(rec.prixMarchand) || 0, Number(rec.prixParticulier) || 0].filter(p => p > 0)
  if (seg.length) {
    return Math.round((seg.reduce((s, p) => s + p, 0) / seg.length) * 100) / 100
  }
  const prixAchat = Number(a.prixAchat) || 0
  const pvValeur  = Number(a.pvValeur)  || 0
  switch (a.pvMethode) {
    case "pourcentage": return Math.round(prixAchat * (1 + pvValeur / 100) * 100) / 100
    case "montant":     return Math.round((prixAchat + pvValeur) * 100) / 100
    default:            return pvValeur
  }
}

function stockLabel(a: Article): { label: string; labelAr: string; cls: string; icon: string } {
  // ⚡ Basé sur le stock WEB alloué (pas le stock réel)
  const stockWeb = Number((a as any).marketplaceStock ?? a.stockDisponible ?? 0) || 0
  if (!a.actif) return { label: "Désactivé",     labelAr: "معطل",          cls: "bg-slate-100 text-slate-500 border-slate-200",   icon: "🚫" }
  if (a.marketplaceStatut === "hors_saison") return { label: "Hors saison", labelAr: "خارج الموسم", cls: "bg-amber-100 text-amber-700 border-amber-300",   icon: "🍂" }
  if (stockWeb <= 0) return { label: "Rupture (web)", labelAr: "نفاد المخزون", cls: "bg-red-100 text-red-700 border-red-300", icon: "❌" }
  return { label: "Disponible", labelAr: "متوفر", cls: "bg-green-100 text-green-700 border-green-300", icon: "✅" }
}

const STATUT_OPTIONS = [
  { v: "disponible",   label: "Disponible",    icon: "✅", cls: "text-green-700 bg-green-50 border-green-300" },
  { v: "hors_saison",  label: "Hors saison",   icon: "🍂", cls: "text-amber-700 bg-amber-50 border-amber-300" },
  { v: "out_of_stock", label: "Rupture stock", icon: "❌", cls: "text-red-700 bg-red-50 border-red-300" },
  { v: "short_stock",  label: "Stock limité",  icon: "⚠️", cls: "text-orange-700 bg-orange-50 border-orange-300" },
  { v: "nouveau",      label: "Nouveau",       icon: "🆕", cls: "text-blue-700 bg-blue-50 border-blue-300" },
  { v: "promo",        label: "Promo",         icon: "🏷️", cls: "text-purple-700 bg-purple-50 border-purple-300" },
] as const

type MarketplaceStatut = typeof STATUT_OPTIONS[number]["v"]

const TAGS_SUGGESTIONS = [
  "Bio", "Local", "Maroc", "Importé", "Premium", "Saison", "Nouveau",
  "Promo", "BIO Certifié", "Sans pesticides", "Frais du matin",
]

// Tags de transformation (préparation) — affichés sur le site comme badges colorés
// Cochables par article, permettent au client de filtrer par préparation possible
const PREPARATION_TAGS = [
  { id: "epluche", label: "🔪 Épluché", desc: "Disponible épluché sur demande" },
  { id: "lave",    label: "💧 Lavé",    desc: "Disponible lavé sur demande" },
  { id: "coupe",   label: "🔪 Coupé",   desc: "Coupé en morceaux sur demande" },
  { id: "pret_cuisson", label: "🍳 Prêt à cuisiner", desc: "Préparé pour cuisson directe" },
  { id: "emballe", label: "📦 Emballé",  desc: "Emballage spécial conservation" },
] as const

type Tab = "catalogue" | "publie" | "stats" | "api_preview"

// ─── EditDrawer ───────────────────────────────────────────────────────────────

interface EditDrawerProps {
  article: Article
  onClose: () => void
  onSave: (updated: Article) => void
}

function EditDrawer({ article, onClose, onSave }: EditDrawerProps) {
  const pvCalcule = computePV(article)
  const [form, setForm] = useState({
    marketplaceActif:           article.marketplaceActif ?? false,
    marketplaceStatut:          (article.marketplaceStatut ?? "disponible") as MarketplaceStatut,
    marketplaceCommentaire:     article.marketplaceCommentaire ?? "",
    marketplaceDescription:     article.marketplaceDescription ?? "",
    marketplaceDescriptionAr:   article.marketplaceDescriptionAr ?? "",
    // ⚡ Stock WEB alloué — TOTALEMENT indépendant du stock réel ERP.
    // C'est CE chiffre qui décide la dispo sur la boutique (>0 = dispo, =0 = rupture)
    marketplaceStock:           String((article as any).marketplaceStock ?? article.stockDisponible ?? 0),
    marketplaceTags:            article.marketplaceTags ?? [] as string[],
    marketplaceOrdre:           String(article.marketplaceOrdre ?? 0),
    promoActif:                 article.marketplacePromo?.actif ?? false,
    promoPrix:                  String(article.marketplacePromo?.prixPromo ?? ""),
    promoEtiquette:             article.marketplacePromo?.etiquette ?? "",
    promoDateDebut:             article.marketplacePromo?.dateDebut ?? "",
    promoDateFin:               article.marketplacePromo?.dateFin ?? "",
    // stock / catalogue activation
    actif:           article.actif ?? true,
    catalogueVisible: article.catalogueVisible ?? true,
  })
  const [tagInput, setTagInput] = useState("")

  const toggleTag = (tag: string) => {
    setForm(f => ({
      ...f,
      marketplaceTags: f.marketplaceTags.includes(tag)
        ? f.marketplaceTags.filter(t => t !== tag)
        : [...f.marketplaceTags, tag],
    }))
  }

  const addTag = () => {
    const t = tagInput.trim()
    if (t && !form.marketplaceTags.includes(t)) {
      setForm(f => ({ ...f, marketplaceTags: [...f.marketplaceTags, t] }))
    }
    setTagInput("")
  }

  // ⚡ Dispo boutique = basée sur le STOCK WEB alloué (PAS le stock réel ERP)
  //   marketplaceStock > 0  → disponible
  //   marketplaceStock === 0 → rupture
  const autoStatut = (): MarketplaceStatut => {
    const stockWeb = Number(form.marketplaceStock) || 0
    if (stockWeb <= 0) return "out_of_stock"
    // si l'admin a forcé "hors_saison", on garde
    if (form.marketplaceStatut === "hors_saison") return "hors_saison"
    return "disponible"
  }

  const handleSave = () => {
    const updated: Article = {
      ...article,
      actif:                   form.actif,
      catalogueVisible:        form.catalogueVisible,
      marketplaceActif:        form.marketplaceActif,
      marketplaceStatut:       form.marketplaceStatut,
      marketplaceCommentaire:  form.marketplaceCommentaire,
      // Toujours le PV calculé (moyenne des segments) — plus de saisie manuelle
      // qui pouvait diverger du calcul (voir computePV ci-dessus).
      marketplacePrixPublic:   pvCalcule,
      marketplaceDescription:  form.marketplaceDescription,
      marketplaceDescriptionAr:form.marketplaceDescriptionAr,
      // Stock web alloué (indépendant du stock réel) — décide la dispo boutique
      marketplaceStock:        Number(form.marketplaceStock) || 0,
      marketplaceTags:         form.marketplaceTags,
      marketplaceOrdre:        Number(form.marketplaceOrdre) || 0,
      marketplacePromo: form.promoActif ? {
        actif:       true,
        prixPromo:   Number(form.promoPrix) || pvCalcule,
        etiquette:   form.promoEtiquette,
        dateDebut:   form.promoDateDebut || undefined,
        dateFin:     form.promoDateFin || undefined,
      } : undefined,
    }
    onSave(updated)
  }

  const prixPublicNum = pvCalcule
  const promoNum      = Number(form.promoPrix) || 0
  const promoReducPct = prixPublicNum > 0 && promoNum > 0
    ? Math.round((1 - promoNum / prixPublicNum) * 100)
    : 0

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-xl bg-card border-l border-border flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/40">
          <div className="flex items-center gap-3">
            {article.photo && (
              <img src={article.photo} alt={article.nom} className="w-10 h-10 rounded-xl object-cover border border-border" />
            )}
            <div>
              <p className="font-bold text-foreground">{article.nom}</p>
              <p className="text-xs text-muted-foreground">{article.famille} · {article.unite}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted text-muted-foreground transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-6">

          {/* ── SECTION 1: Activation ── */}
          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Activation</h3>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: "actif",            label: "Actif ERP",     desc: "Stock & opérations internes",   icon: "⚙️" },
                { key: "catalogueVisible", label: "Portail client", desc: "Visible sur portail ext.",     icon: "👥" },
                { key: "marketplaceActif", label: "Marketplace",   desc: "Publié sur votre site web",     icon: "🌐" },
              ].map(({ key, label, desc, icon }) => {
                const val = form[key as keyof typeof form] as boolean
                return (
                  <button key={key} onClick={() => setForm(f => ({ ...f, [key]: !val }))}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 text-center transition-all ${val ? "border-green-400 bg-green-50" : "border-slate-200 bg-card hover:bg-muted"}`}>
                    <span className="text-xl">{icon}</span>
                    <span className={`text-xs font-bold ${val ? "text-green-700" : "text-slate-500"}`}>{label}</span>
                    <span className="text-[10px] text-muted-foreground leading-tight">{desc}</span>
                    <div className={`w-8 h-4 rounded-full transition-colors ${val ? "bg-green-500" : "bg-slate-200"} relative mt-0.5`}>
                      <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${val ? "translate-x-4" : "translate-x-0.5"}`} />
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          {/* ── SECTION 2: Statut marketplace ── */}
          {form.marketplaceActif && (
            <section className="flex flex-col gap-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Statut affiché sur le site</h3>
              <div className="grid grid-cols-3 gap-2">
                {STATUT_OPTIONS.map(opt => (
                  <button key={opt.v} onClick={() => setForm(f => ({ ...f, marketplaceStatut: opt.v }))}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all ${form.marketplaceStatut === opt.v ? opt.cls + " border-current font-black" : "border-slate-200 text-slate-500 hover:bg-muted"}`}>
                    <span>{opt.icon}</span>{opt.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-foreground">Commentaire public (affiché sous l'article)</label>
                <input value={form.marketplaceCommentaire} onChange={e => setForm(f => ({ ...f, marketplaceCommentaire: e.target.value }))}
                  placeholder={form.marketplaceStatut === "hors_saison" ? "Ex: Disponible à partir de mars 2026" : form.marketplaceStatut === "short_stock" ? "Ex: Dernières unités disponibles !" : ""}
                  className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              {/* ── Stock WEB alloué (indépendant du stock réel ERP) ── */}
              <div className="flex flex-col gap-2 p-4 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100">
                <div className="flex items-center gap-2">
                  <span className="text-base">📦</span>
                  <label className="text-xs font-bold text-emerald-900">Stock web alloué à la boutique</label>
                </div>
                <div className="flex items-center gap-3">
                  <input type="number" min="0" value={form.marketplaceStock}
                    onChange={e => setForm(f => ({ ...f, marketplaceStock: e.target.value }))}
                    className="w-28 px-3 py-2.5 rounded-xl border border-emerald-200 bg-white text-lg font-black text-emerald-700 text-center focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                  <span className="text-sm font-semibold text-emerald-800">{article.unite}</span>
                  <div className="flex-1 text-right">
                    {Number(form.marketplaceStock) > 0
                      ? <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">✅ Affiché « Disponible »</span>
                      : <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-100 text-rose-700 text-xs font-bold">❌ Affiché « Rupture »</span>}
                  </div>
                </div>
                <p className="text-[11px] text-emerald-700/80 leading-relaxed">
                  💡 Ce stock est <strong>indépendant du stock réel</strong>. Il pilote uniquement l'affichage sur la boutique :
                  <strong> &gt; 0</strong> = Disponible · <strong>= 0</strong> = Rupture.
                  <br/>Stock réel actuel en entrepôt : <strong>{article.stockDisponible} {article.unite}</strong> (non affiché aux clients).
                </p>
              </div>
            </section>
          )}

          {/* ── SECTION 3: Pricing ── */}
          {form.marketplaceActif && (
            <section className="flex flex-col gap-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Prix public</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-foreground">Prix affiché (DH / {article.unite})</label>
                  <input type="text" readOnly value={`${pvCalcule.toFixed(2)} DH`}
                    title="Calculé automatiquement = moyenne des prix CHR/Marchand/Particulier renseignés (ou prix système si aucun segment renseigné). Pour un prix temporaire différent, utilisez le Prix promotionnel ci-dessous."
                    className="px-3 py-2.5 rounded-xl border border-border bg-muted text-sm font-bold text-foreground cursor-not-allowed" />
                  <p className="text-[10px] text-muted-foreground">Calculé automatiquement (moyenne CHR/Marchand/Particulier) — pour un prix différent, utilisez le Prix promotionnel ci-dessous.</p>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-foreground">Ordre d'affichage</label>
                  <input type="number" min="0" value={form.marketplaceOrdre}
                    onChange={e => setForm(f => ({ ...f, marketplaceOrdre: e.target.value }))}
                    className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  <p className="text-[10px] text-muted-foreground">0 = premier affiché</p>
                </div>
              </div>

              {/* Promo */}
              <div className={`rounded-2xl border-2 overflow-hidden transition-all ${form.promoActif ? "border-purple-400" : "border-dashed border-slate-200"}`}>
                <div className="flex items-center justify-between px-4 py-3 bg-muted/30">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🏷️</span>
                    <span className="text-sm font-bold text-foreground">Prix promotionnel</span>
                  </div>
                  <button onClick={() => setForm(f => ({ ...f, promoActif: !f.promoActif }))}
                    className={`relative w-10 h-5 rounded-full transition-colors ${form.promoActif ? "bg-purple-500" : "bg-slate-200"}`}>
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.promoActif ? "translate-x-5" : "translate-x-0.5"}`} />
                  </button>
                </div>
                {form.promoActif && (
                  <div className="px-4 pb-4 grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold">Prix promo (DH)</label>
                      <input type="number" min="0" step="0.5" value={form.promoPrix}
                        onChange={e => setForm(f => ({ ...f, promoPrix: e.target.value }))}
                        className="px-3 py-2.5 rounded-xl border border-purple-200 bg-purple-50 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-purple-400" />
                      {promoReducPct > 0 && <p className="text-[10px] text-purple-700 font-bold">-{promoReducPct}% de réduction</p>}
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold">Étiquette</label>
                      <input value={form.promoEtiquette} onChange={e => setForm(f => ({ ...f, promoEtiquette: e.target.value }))}
                        placeholder="Ex: -20%, Offre spéciale"
                        className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold">Date début</label>
                      <input type="date" value={form.promoDateDebut} onChange={e => setForm(f => ({ ...f, promoDateDebut: e.target.value }))}
                        className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold">Date fin</label>
                      <input type="date" value={form.promoDateFin} onChange={e => setForm(f => ({ ...f, promoDateFin: e.target.value }))}
                        className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none" />
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ── SECTION 4: Description & Tags ── */}
          {form.marketplaceActif && (
            <section className="flex flex-col gap-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Description & SEO</h3>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-foreground">Description publique (FR)</label>
                <textarea rows={2} value={form.marketplaceDescription}
                  onChange={e => setForm(f => ({ ...f, marketplaceDescription: e.target.value }))}
                  placeholder="Description visible par vos clients et fournisseurs sur le site…"
                  className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-foreground">الوصف بالعربية</label>
                <textarea rows={2} dir="rtl" value={form.marketplaceDescriptionAr}
                  onChange={e => setForm(f => ({ ...f, marketplaceDescriptionAr: e.target.value }))}
                  placeholder="وصف المنتج بالعربية…"
                  className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
              </div>
              {/* ── Préparations disponibles (Épluché, Lavé, Coupé...) ─────── */}
              <div className="flex flex-col gap-2 p-4 rounded-2xl bg-blue-50/60 border border-blue-100">
                <div className="flex items-center gap-2">
                  <span className="text-base">🔪</span>
                  <label className="text-xs font-bold text-blue-900">Préparations disponibles sur demande</label>
                </div>
                <p className="text-[11px] text-blue-700/80 leading-relaxed">
                  Cochez les préparations possibles pour cet article. Le client pourra demander cette préparation au moment de la commande.
                </p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {PREPARATION_TAGS.map(prep => {
                    const checked = form.marketplaceTags.includes(prep.id)
                    return (
                      <button key={prep.id} onClick={() => toggleTag(prep.id)}
                        title={prep.desc}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${checked ? "bg-blue-600 text-white border-blue-700 shadow-sm" : "bg-white border-blue-200 text-blue-700 hover:bg-blue-100"}`}>
                        {prep.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-foreground">Tags / Filtres marketing</label>
                <div className="flex flex-wrap gap-1.5">
                  {TAGS_SUGGESTIONS.map(tag => (
                    <button key={tag} onClick={() => toggleTag(tag)}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${form.marketplaceTags.includes(tag) ? "bg-primary text-white border-primary" : "border-slate-200 text-slate-500 hover:bg-muted"}`}>
                      {tag}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addTag()}
                    placeholder="Tag personnalisé…"
                    className="flex-1 px-3 py-2 rounded-xl border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary" />
                  <button onClick={addTag} className="px-3 py-2 rounded-xl bg-muted text-xs font-semibold hover:bg-muted/80">+ Ajouter</button>
                </div>
                {form.marketplaceTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {form.marketplaceTags.map(t => (
                      <span key={t} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-primary/10 text-primary font-semibold">
                        {t}
                        <button onClick={() => setForm(f => ({ ...f, marketplaceTags: f.marketplaceTags.filter(x => x !== t) }))} className="hover:text-red-600">×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ── Live Preview ── */}
          {form.marketplaceActif && (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Aperçu carte site web</h3>
              <div className="rounded-2xl border-2 border-dashed border-slate-200 overflow-hidden">
                <ArticleCard
                  article={{
                    ...article,
                    marketplaceActif: form.marketplaceActif,
                    marketplaceStatut: form.marketplaceStatut,
                    marketplaceCommentaire: form.marketplaceCommentaire,
                    marketplacePrixPublic: pvCalcule,
                    marketplaceTags: form.marketplaceTags,
                    marketplacePromo: form.promoActif ? { actif: true, prixPromo: Number(form.promoPrix), etiquette: form.promoEtiquette } : undefined,
                  }}
                  preview
                />
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex gap-3 bg-card">
          <button onClick={handleSave}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 transition-colors flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            Sauvegarder
          </button>
          <button onClick={onClose} className="px-5 py-3 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors">
            Annuler
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── ArticleCard (preview + catalogue grid) ───────────────────────────────────

function ArticleCard({ article, preview = false, onClick }: { article: Article; preview?: boolean; onClick?: () => void }) {
  const pv = Number(computePV(article)) || 0
  const prix = pv
  const statut = article.marketplaceStatut ?? "disponible"
  const promoPrix = Number(article.marketplacePromo?.prixPromo ?? 0) || 0
  const hasPromo = article.marketplacePromo?.actif && promoPrix > 0
  const statutCfg = STATUT_OPTIONS.find(o => o.v === statut) ?? STATUT_OPTIONS[0]

  const DEFAULT_IMG = "https://placehold.co/400x300/f1f5f9/94a3b8?text=" + encodeURIComponent(article.nom)

  return (
    <div onClick={onClick}
      className={`group bg-white rounded-2xl overflow-hidden border border-slate-200 ${!preview && onClick ? "cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all" : ""} ${!article.marketplaceActif ? "opacity-60 grayscale" : ""}`}>
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
        <img src={article.photo || DEFAULT_IMG} alt={article.nom}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          onError={e => { e.currentTarget.src = DEFAULT_IMG }} />

        {/* Statut badge */}
        <div className={`absolute top-2 left-2 flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black border backdrop-blur-sm ${statutCfg.cls}`}>
          {statutCfg.icon} {statutCfg.label}
        </div>

        {/* Promo badge */}
        {hasPromo && (
          <div className="absolute top-2 right-2 px-2.5 py-1 rounded-full bg-purple-600 text-white text-[10px] font-black">
            {article.marketplacePromo?.etiquette || "Promo"}
          </div>
        )}

        {/* Tags */}
        {(article.marketplaceTags?.length ?? 0) > 0 && (
          <div className="absolute bottom-2 left-2 flex flex-wrap gap-1">
            {article.marketplaceTags!.slice(0, 3).map(t => (
              <span key={t} className="px-1.5 py-0.5 rounded-md bg-white/80 text-[9px] font-bold text-slate-700 backdrop-blur-sm">{t}</span>
            ))}
          </div>
        )}
      </div>

      <div className="p-3">
        <p className="font-bold text-slate-800 text-sm truncate">{article.nom}</p>
        {article.nomAr && <p className="font-arabic text-[12px] text-slate-500 mt-0.5" dir="rtl" lang="ar">{article.nomAr}</p>}
        {article.marketplaceDescription && (
          <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">{article.marketplaceDescription}</p>
        )}
        {article.marketplaceCommentaire && (
          <p className={`text-[11px] mt-1 font-medium italic ${statutCfg.cls.replace("bg-", "text-").split(" ")[0]}`}>
            {statutCfg.icon} {article.marketplaceCommentaire}
          </p>
        )}

        <div className="flex items-end justify-between mt-2 pt-2 border-t border-slate-100">
          <div>
            {hasPromo ? (
              <>
                <span className="text-xs line-through text-slate-400">{prix.toFixed(2)} DH</span>
                <p className="text-sm font-black text-purple-700">{promoPrix.toFixed(2)} DH</p>
              </>
            ) : (
              <p className="text-sm font-black text-slate-900">{prix.toFixed(2)} DH</p>
            )}
            <p className="text-[10px] text-slate-400">/ {article.unite}</p>
          </div>
          {(() => {
            const stockWeb = Number((article as any).marketplaceStock ?? article.stockDisponible ?? 0) || 0
            return (
              <div className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${stockWeb > 0 ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-600 border-red-200"}`}>
                {stockWeb > 0 ? `${stockWeb} ${article.unite}` : "Rupture"}
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}

// ─── Stats bar ────────────────────────────────────────────────────────────────

function StatsBar({ articles }: { articles: Article[] }) {
  const pub = articles.filter(a => a.marketplaceActif)
  const dispo = pub.filter(a => a.marketplaceStatut === "disponible" || !a.marketplaceStatut)
  const rupture = pub.filter(a => {
    const stockWeb = Number((a as any).marketplaceStock ?? a.stockDisponible ?? 0) || 0
    return a.marketplaceStatut === "out_of_stock" || stockWeb <= 0
  })
  const promo = pub.filter(a => a.marketplacePromo?.actif)
  const saison = pub.filter(a => a.marketplaceStatut === "hors_saison")

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        { label: "Publiés",     value: pub.length,     sub: `/ ${articles.length} au total`,   icon: "🌐", grad: "from-blue-500 to-blue-600",     ring: "ring-blue-200" },
        { label: "Disponibles", value: dispo.length,   sub: "en stock & actif",                icon: "✅", grad: "from-emerald-500 to-green-600",  ring: "ring-emerald-200" },
        { label: "Rupture",     value: rupture.length, sub: "hors stock publiés",              icon: "❌", grad: "from-rose-500 to-red-600",       ring: "ring-rose-200" },
        { label: "En promo",    value: promo.length,   sub: "prix promotionnel",               icon: "🏷️", grad: "from-fuchsia-500 to-purple-600", ring: "ring-fuchsia-200" },
      ].map(s => (
        <div key={s.label} className={`group relative overflow-hidden rounded-2xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 ring-1 ${s.ring}`}>
          <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${s.grad}`} />
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${s.grad} flex items-center justify-center text-xl shadow-sm shrink-0`}>
              <span className="drop-shadow-sm">{s.icon}</span>
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-black text-slate-900 leading-none tabular-nums">{s.value}</p>
              <p className="text-[11px] font-bold text-slate-600 mt-1">{s.label}</p>
              <p className="text-[9px] text-slate-400 truncate">{s.sub}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── API Preview Tab ──────────────────────────────────────────────────────────

function ApiPreview({ articles }: { articles: Article[] }) {
  const pub = articles.filter(a => a.marketplaceActif)
  const payload = pub.map(a => ({
    id: a.id,
    nom: a.nom,
    nomAr: a.nomAr,
    famille: a.famille,
    unite: a.unite,
    photo: a.photo ?? null,
    tags: a.marketplaceTags ?? [],
    description: a.marketplaceDescription ?? null,
    descriptionAr: a.marketplaceDescriptionAr ?? null,
    prix: computePV(a),
    promo: a.marketplacePromo?.actif ? { prix: a.marketplacePromo.prixPromo, etiquette: a.marketplacePromo.etiquette ?? null } : null,
    statut: a.marketplaceStatut ?? "disponible",
    commentaire: a.marketplaceCommentaire ?? null,
    stockDisponible: a.stockDisponible,
    ordre: a.marketplaceOrdre ?? 0,
  }))
  const json = JSON.stringify(payload.slice(0, 3), null, 2) + (pub.length > 3 ? "\n// ... " + (pub.length - 3) + " autres articles" : "")
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-800">
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
        <span><strong>GET</strong> /api/ext/catalogue — Retourne {pub.length} articles publiés</span>
      </div>
      <pre className="px-4 py-4 rounded-2xl bg-[#0d1117] text-green-300 font-mono text-xs overflow-x-auto whitespace-pre leading-relaxed">
        {json}
      </pre>
      <p className="text-xs text-muted-foreground">Les champs <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs">statut</code>, <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs">commentaire</code> et <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs">promo</code> sont mis à jour en temps réel dès modification dans l'ERP.</p>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props { user: User }

export default function BOMarketplace({ user }: Props) {
  const [articles, setArticles] = useState<Article[]>([])
  const [tab, setTab] = useState<Tab>("catalogue")
  const [editing, setEditing] = useState<Article | null>(null)
  const [search, setSearch] = useState("")
  const [famille, setFamille] = useState("")
  const [statutFilter, setStatutFilter] = useState<"tous" | MarketplaceStatut | "publie" | "non_publie">("tous")
  const [bulkSaved, setBulkSaved] = useState(false)
  const [publishAll, setPublishAll] = useState(false)
  // ── Allocation par famille (stock web + statut affiché en 1 clic) ──────────
  const [showFamAlloc, setShowFamAlloc] = useState(false)
  const [famAllocSel, setFamAllocSel] = useState("")            // "" = toutes les familles
  const [famAllocStock, setFamAllocStock] = useState("")        // "" = ne pas changer le stock
  const [famAllocStatut, setFamAllocStatut] = useState<"" | MarketplaceStatut>("") // "" = ne pas changer
  const [famAllocPublish, setFamAllocPublish] = useState(true)  // publier en même temps

  const refresh = () => setArticles(store.getArticles())
  useEffect(() => { refresh() }, [])

  const familles = Array.from(new Set(articles.map(a => a.famille).filter(Boolean)))

  const filtered = articles.filter(a => {
    const matchSearch = !search || a.nom.toLowerCase().includes(search.toLowerCase())
    const matchFamille = !famille || a.famille === famille
    const matchStatut =
      statutFilter === "tous"         ? true :
      statutFilter === "publie"       ? !!a.marketplaceActif :
      statutFilter === "non_publie"   ? !a.marketplaceActif :
      a.marketplaceStatut === statutFilter
    return matchSearch && matchFamille && matchStatut
  })

  const published = articles.filter(a => a.marketplaceActif)
  const [syncingToSb, setSyncingToSb] = useState(false)
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // ⚡ AUTO-SYNC : pousse 1 ou N articles vers Supabase via service_role
  // Résout le problème : localStorage ≠ Supabase ≠ Boutique
  async function pushToSupabase(items: Article[]): Promise<{ ok: boolean; pushed: number; errors: string[] }> {
    if (items.length === 0) return { ok: true, pushed: 0, errors: [] }
    const upserts = items.map(a => {
      const { id, ...payload } = a
      // S'assurer que catalogueVisible est aligné avec marketplaceActif
      const marketplaceActif = !!a.marketplaceActif
      return {
        id,
        payload: { ...payload, marketplaceActif, catalogueVisible: marketplaceActif },
        updated_at: new Date().toISOString(),
      }
    })
    // Batch par 50
    let pushed = 0
    const errors: string[] = []
    for (let i = 0; i < upserts.length; i += 50) {
      const batch = upserts.slice(i, i + 50)
      try {
        const res = await fetch("/api/sync-write", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ table: "fl_articles", upserts: batch }),
        })
        const data = await res.json()
        if (data.ok) pushed += batch.length
        else errors.push(...(data.errors ?? [`batch ${i}`]))
      } catch (e) {
        errors.push(String(e))
      }
    }
    return { ok: errors.length === 0, pushed, errors }
  }

  const handleSave = async (updated: Article) => {
    if (!hasPermission(user.role, "catalogue_toggle")) { logAction(user, "catalogue_toggle", "denied", { type: "article", id: updated.id, label: updated.nom }); return }
    logAction(user, "catalogue_toggle", "success", { type: "article", id: updated.id, label: updated.nom })
    const all = articles.map(a => a.id === updated.id ? updated : a)
    store.saveArticles(all)
    setArticles(all)
    setEditing(null)
    // ✅ Push immédiat vers Supabase pour que le site web voit le changement
    setSyncingToSb(true)
    const { ok, errors } = await pushToSupabase([updated])
    setSyncingToSb(false)
    if (ok) {
      setSyncMsg({
        ok: true,
        text: updated.marketplaceActif
          ? `✅ "${updated.nom}" publié sur le site web !`
          : `✅ "${updated.nom}" retiré du site web`,
      })
    } else {
      setSyncMsg({ ok: false, text: `Sauvegardé localement. ${sbSyncErr(errors)}` })
    }
    setTimeout(() => setSyncMsg(null), 4000)
  }

  const handleBulkPublish = async () => {
    if (!hasPermission(user.role, "catalogue_toggle")) { logAction(user, "catalogue_toggle", "denied", { type: "articles", label: `${filtered.length} article(s)` }); return }
    if (!window.confirm(`Publier ${filtered.length} articles filtrés sur le site web ?`)) return
    logAction(user, "catalogue_toggle", "success", { type: "articles", label: `publier ${filtered.length} article(s)` })
    const toPublish: Article[] = []
    const all = articles.map(a => {
      if (filtered.find(f => f.id === a.id)) {
        // Stock web alloué par défaut = stock réel actuel (l'admin peut ajuster ensuite)
        const stockWeb = Number((a as any).marketplaceStock ?? a.stockDisponible ?? 0) || 0
        const updated = { ...a, marketplaceActif: true, marketplaceStock: stockWeb, marketplaceStatut: (stockWeb > 0 ? "disponible" : "out_of_stock") as MarketplaceStatut }
        toPublish.push(updated)
        return updated
      }
      return a
    })
    store.saveArticles(all)
    setArticles(all)
    setSyncingToSb(true)
    const { ok, pushed, errors } = await pushToSupabase(toPublish)
    setSyncingToSb(false)
    setSyncMsg(ok
      ? { ok: true, text: `✅ ${pushed} articles publiés sur le site web !` }
      : { ok: false, text: sbSyncErr(errors) })
    setBulkSaved(true)
    setTimeout(() => { setBulkSaved(false); setSyncMsg(null) }, 4000)
  }

  const handleBulkUnpublish = async () => {
    if (!hasPermission(user.role, "catalogue_toggle")) { logAction(user, "catalogue_toggle", "denied", { type: "articles", label: `${filtered.length} article(s)` }); return }
    if (!window.confirm(`Dépublier ${filtered.length} articles filtrés du site web ?`)) return
    logAction(user, "catalogue_toggle", "success", { type: "articles", label: `dépublier ${filtered.length} article(s)` })
    const toUnpublish: Article[] = []
    const all = articles.map(a => {
      if (filtered.find(f => f.id === a.id)) {
        const updated = { ...a, marketplaceActif: false }
        toUnpublish.push(updated)
        return updated
      }
      return a
    })
    store.saveArticles(all)
    setArticles(all)
    setSyncingToSb(true)
    const { ok, pushed, errors } = await pushToSupabase(toUnpublish)
    setSyncingToSb(false)
    setSyncMsg(ok
      ? { ok: true, text: `✅ ${pushed} articles retirés du site web` }
      : { ok: false, text: sbSyncErr(errors) })
    setBulkSaved(true)
    setTimeout(() => { setBulkSaved(false); setSyncMsg(null) }, 4000)
  }

  // Recopie le stock réel ERP → stock web alloué (pour les articles publiés)
  // Pratique pour aligner d'un coup, puis ajuster manuellement si besoin.
  const handleAutoSync = async () => {
    if (!window.confirm("Recopier le stock réel actuel vers le stock web alloué de tous les articles publiés ?")) return
    const toSync: Article[] = []
    const all = articles.map(a => {
      if (!a.marketplaceActif) return a
      const stockWeb = Number(a.stockDisponible) || 0
      const updated = { ...a, marketplaceStock: stockWeb, marketplaceStatut: (stockWeb > 0 ? "disponible" : "out_of_stock") as MarketplaceStatut }
      toSync.push(updated)
      return updated
    })
    store.saveArticles(all)
    setArticles(all)
    setSyncingToSb(true)
    const { ok, pushed, errors } = await pushToSupabase(toSync)
    setSyncingToSb(false)
    setSyncMsg(ok
      ? { ok: true, text: `✅ Stock web aligné sur le stock réel (${pushed} articles)` }
      : { ok: false, text: sbSyncErr(errors) })
    setTimeout(() => setSyncMsg(null), 4000)
  }

  // ── Allocation par famille : stock web + statut affiché, en 1 clic ──────────
  // famAllocSel "" = toutes les familles (= tous les articles).
  const applyFamilyAllocation = async () => {
    const cible = articles.filter(a => !famAllocSel || a.famille === famAllocSel)
    if (cible.length === 0) { setSyncMsg({ ok: false, text: "Aucun article dans cette famille." }); return }
    const changeStock = famAllocStock.trim() !== ""
    const stockVal = Number(famAllocStock) || 0
    const changeStatut = famAllocStatut !== ""
    if (!changeStock && !changeStatut && !famAllocPublish) {
      setSyncMsg({ ok: false, text: "Renseignez un stock, un statut, ou activez la publication." }); return
    }
    const libelle = famAllocSel || "TOUTES les familles"
    if (!window.confirm(
      `Appliquer à ${cible.length} article(s) de « ${libelle} » ?\n` +
      (changeStock ? `• Stock web = ${stockVal}\n` : "") +
      (changeStatut ? `• Statut affiché = ${famAllocStatut}\n` : "") +
      (famAllocPublish ? "• Publier sur le site\n" : "")
    )) return

    const touched: Article[] = []
    const all = articles.map(a => {
      if (famAllocSel && a.famille !== famAllocSel) return a
      const updated: Article = { ...a }
      if (changeStock) updated.marketplaceStock = stockVal
      if (famAllocPublish) updated.marketplaceActif = true
      if (changeStatut) {
        updated.marketplaceStatut = famAllocStatut as MarketplaceStatut
      } else if (changeStock) {
        // Auto : si on alloue du stock sans choisir de statut, dispo/rupture auto
        updated.marketplaceStatut = (stockVal > 0 ? "disponible" : "out_of_stock") as MarketplaceStatut
      }
      touched.push(updated)
      return updated
    })
    store.saveArticles(all)
    setArticles(all)
    setSyncingToSb(true)
    const { ok, pushed, errors } = await pushToSupabase(touched)
    setSyncingToSb(false)
    setSyncMsg(ok
      ? { ok: true, text: `✅ ${pushed} article(s) de « ${libelle} » mis à jour sur le site.` }
      : { ok: false, text: sbSyncErr(errors) })
    setTimeout(() => setSyncMsg(null), 5000)
  }

  return (
    <div className="flex flex-col gap-5">

      {/* ── Header premium (bannière gradient) ── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0b3d1a] via-[#1a4f2a] to-[#2d7a46] p-6 sm:p-7 shadow-xl">
        {/* Décor */}
        <div className="absolute -right-12 -top-12 w-56 h-56 rounded-full bg-emerald-400/10 blur-2xl" />
        <div className="absolute -left-8 -bottom-16 w-48 h-48 rounded-full bg-amber-300/10 blur-2xl" />
        <div className="relative flex items-start justify-between flex-wrap gap-5">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/12 backdrop-blur-sm flex items-center justify-center text-3xl shadow-lg shrink-0">🛒</div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-2xl font-black text-white tracking-tight">Marketplace & Catalogue Web</h2>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-400/15 border border-emerald-300/30 text-emerald-100 text-[10px] font-bold uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                  Live · shop.vita-core.org
                </span>
              </div>
              <p className="text-sm text-emerald-50/80 mt-1.5 max-w-xl leading-relaxed">
                Pilotez la publication de vos articles sur la boutique en ligne et les portails clients. Chaque modification est synchronisée en temps réel.
              </p>
              <div className="flex items-center gap-4 mt-3 text-emerald-50/90">
                <span className="flex items-center gap-1.5 text-xs font-semibold"><span className="text-emerald-300">●</span> {published.length} publié{published.length > 1 ? "s" : ""}</span>
                <span className="flex items-center gap-1.5 text-xs font-semibold"><span className="text-amber-300">●</span> {articles.length} au total</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setShowFamAlloc(s => !s)}
              title="Allouer le stock web et le statut affiché à toute une famille en 1 clic"
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl backdrop-blur-sm border text-xs font-bold transition-all shadow-sm ${showFamAlloc ? "bg-white text-emerald-800 border-white" : "bg-white/12 border-white/20 text-white hover:bg-white/20"}`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
              Allocation par famille
            </button>
            <button onClick={handleAutoSync}
              title="Recopie le stock réel actuel vers le stock web alloué (articles publiés)"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/12 backdrop-blur-sm border border-white/20 text-white text-xs font-bold hover:bg-white/20 transition-all shadow-sm">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              Stock réel → web
            </button>
          </div>
        </div>
      </div>

      {syncingToSb && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-sm font-semibold">
          <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
          Synchronisation avec le site web en cours…
        </div>
      )}

      {syncMsg && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold border ${syncMsg.ok ? "bg-green-50 border-green-200 text-green-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={syncMsg.ok ? "M5 13l4 4L19 7" : "M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z"} />
          </svg>
          {syncMsg.text}
        </div>
      )}

      {/* ── Allocation par famille (stock web + statut affiché, en 1 clic) ── */}
      {showFamAlloc && (
        <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/60 p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">🗂️</span>
              <h3 className="text-sm font-black text-emerald-900">Allocation par famille — Stock web & Statut affiché</h3>
            </div>
            <span className="text-[11px] text-emerald-700">Choisissez une famille (ou toutes) puis appliquez en 1 clic à tous ses articles.</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-emerald-800">Famille cible</label>
              <select value={famAllocSel} onChange={e => setFamAllocSel(e.target.value)}
                className="px-3 py-2.5 rounded-xl border border-emerald-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
                <option value="">🌐 Toutes les familles ({articles.length} articles)</option>
                {familles.map(f => {
                  const n = articles.filter(a => a.famille === f).length
                  return <option key={f} value={f}>{f} ({n})</option>
                })}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-emerald-800">Stock web alloué</label>
              <input type="number" min="0" value={famAllocStock} onChange={e => setFamAllocStock(e.target.value)}
                placeholder="laisser vide = inchangé"
                className="px-3 py-2.5 rounded-xl border border-emerald-200 bg-white text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-emerald-800">Statut affiché sur le site</label>
              <select value={famAllocStatut} onChange={e => setFamAllocStatut(e.target.value as "" | MarketplaceStatut)}
                className="px-3 py-2.5 rounded-xl border border-emerald-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
                <option value="">— Auto (selon stock) —</option>
                {STATUT_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.icon} {o.label}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-emerald-800 cursor-pointer select-none pb-2.5">
              <input type="checkbox" checked={famAllocPublish} onChange={e => setFamAllocPublish(e.target.checked)}
                className="w-4 h-4 accent-emerald-600" />
              Publier sur le site
            </label>
            <button onClick={applyFamilyAllocation}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white text-sm font-bold hover:shadow-lg hover:shadow-emerald-200 transition-all">
              ✅ Appliquer à la famille
            </button>
          </div>
          <p className="text-[11px] text-emerald-700/80">
            💡 « Stock web » pilote la dispo boutique (&gt; 0 = Disponible · = 0 = Rupture). Si vous laissez le statut sur « Auto », il est déduit du stock.
            Laissez « Stock web » vide pour ne changer que le statut.
          </p>
        </div>
      )}

      {/* ── Stats ── */}
      <StatsBar articles={articles} />

      {/* ── Tabs premium ── */}
      <div className="flex gap-1.5 p-1.5 rounded-2xl bg-slate-100 w-fit overflow-x-auto border border-slate-200/70">
        {([
          { id: "catalogue" as Tab,    label: "Tous les articles",   icon: "📦", count: articles.length },
          { id: "publie" as Tab,       label: "Publiés sur le site", icon: "🌐", count: published.length },
          { id: "api_preview" as Tab,  label: "Aperçu API",          icon: "{ }", count: null },
        ]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${tab === t.id ? "bg-white text-slate-900 shadow-md ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800 hover:bg-white/50"}`}>
            <span className="text-sm">{t.icon}</span>
            {t.label}
            {t.count !== null && (
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full tabular-nums ${tab === t.id ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── API Preview ── */}
      {tab === "api_preview" && <ApiPreview articles={articles} />}

      {/* ── Catalogue / Published ── */}
      {(tab === "catalogue" || tab === "publie") && (
        <>
          {/* Filters premium */}
          <div className="flex flex-wrap items-center gap-2 p-3 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <div className="relative flex-1 min-w-[180px]">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un article…"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:bg-white transition-all" />
            </div>
            <select value={famille} onChange={e => setFamille(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer">
              <option value="">🗂️ Toutes familles</option>
              {familles.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <select value={statutFilter} onChange={e => setStatutFilter(e.target.value as any)}
              className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer">
              <option value="tous">Tous statuts</option>
              <option value="publie">🌐 Publiés</option>
              <option value="non_publie">🔒 Non publiés</option>
              {STATUT_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.icon} {o.label}</option>)}
            </select>

            {/* Bulk actions */}
            {filtered.length > 0 && (
              <div className="flex gap-2 ml-auto">
                <button onClick={handleBulkPublish}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white text-xs font-bold hover:shadow-lg hover:shadow-emerald-200 transition-all">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  Publier ({filtered.length})
                </button>
                <button onClick={handleBulkUnpublish}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-bold hover:bg-slate-50 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59" /></svg>
                  Dépublier
                </button>
              </div>
            )}
          </div>

          {/* Grid */}
          {filtered.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <span className="text-5xl">🛒</span>
              <p className="text-sm font-medium mt-3">Aucun article dans cette catégorie</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {(tab === "publie" ? filtered.filter(a => a.marketplaceActif) : filtered).map(a => (
                <div key={a.id} className="relative group">
                  <ArticleCard article={a} onClick={() => setEditing(a)} />
                  {/* Quick toggle overlay */}
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1">
                    <button
                      onClick={e => { e.stopPropagation(); handleSave({ ...a, marketplaceActif: !a.marketplaceActif }) }}
                      title={a.marketplaceActif ? "Dépublier" : "Publier"}
                      className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs shadow-md ${a.marketplaceActif ? "bg-red-500 text-white" : "bg-green-500 text-white"}`}>
                      {a.marketplaceActif ? "🔒" : "🌐"}
                    </button>
                  </div>
                  {/* Status indicator bottom */}
                  <div className="mt-1 flex items-center justify-between px-1">
                    <div className="flex items-center gap-1">
                      <div className={`w-2 h-2 rounded-full ${a.marketplaceActif ? "bg-green-500" : "bg-slate-300"}`} />
                      <span className="text-[10px] text-muted-foreground">{a.marketplaceActif ? "Publié" : "Non publié"}</span>
                    </div>
                    <button onClick={() => setEditing(a)}
                      className="text-[10px] text-primary font-semibold hover:underline">
                      Configurer →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Edit Drawer ── */}
      {editing && (
        <EditDrawer article={editing} onClose={() => setEditing(null)} onSave={handleSave} />
      )}
    </div>
  )
}
