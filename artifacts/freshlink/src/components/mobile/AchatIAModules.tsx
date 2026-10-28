"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import {
  store, type Article, type Fournisseur, type User, type HistoriquePrixAchat,
  type FournisseurType, FOURNISSEUR_TYPE_LABELS, SPECIALITES_FRUITS_LEGUMES,
} from "@/lib/store"
import ArticleCombobox from "@/components/ui/ArticleCombobox"

import AiWorkbench from "@/components/shared/AiWorkbench"
import { purchaseGuidance } from "@/lib/missionGuidance"

interface CameraQualiteIAProps {articles:Article[];fournisseurs:Fournisseur[];user:User}
export function CameraQualiteIA({articles}:CameraQualiteIAProps) {
  const [articleId,setArticleId]=useState("")
  const [offer,setOffer]=useState("")
  const article=articles.find(a=>a.id===articleId)
  return <div className="space-y-3 p-3">
    <label>Article<select className="border rounded p-2 w-full" value={articleId} onChange={e=>setArticleId(e.target.value)}><option value="">Choisir un article</option>{articles.map(a=><option key={a.id} value={a.id}>{a.nom}</option>)}</select></label>
    <AiWorkbench key={articleId} fixedTask="quality" context={`Produit déclaré : ${article?.nom||"à préciser"}`}/>
    {article&&<section className="rounded-xl border bg-card p-3 space-y-2"><h3 className="font-semibold">Avis prix et contrôles du lot</h3><label className="block">Prix proposé en DH / {article.unite}<input inputMode="decimal" className="block w-full rounded border bg-background p-2" value={offer} onChange={e=>setOffer(e.target.value)}/></label><p className="text-sm">{purchaseGuidance(Number(offer.replace(',','.')),article.prixAchat)}</p><p className="text-sm">Avant achat : contrôlez le poids net, le calibre, les défauts physiques et les frais inclus. Une photo ne permet pas de noter la qualité sanitaire ni de certifier un rapport qualité-prix.</p></section>}
    <p className="text-sm text-slate-600">Un constat visuel ne certifie ni la fraîcheur sanitaire, ni une durée de conservation. Prix et décision d'achat restent à valider.</p>
  </div>
}
interface ComparatifFournisseursProps {articles:Article[];fournisseurs:Fournisseur[];user:User}
export function ComparatifFournisseurs({articles,fournisseurs}:ComparatifFournisseursProps) {
  const [articleId,setArticleId]=useState("")
  const [offers,setOffers]=useState([{id:"",price:""},{id:"",price:""}])
  const article=articles.find(a=>a.id===articleId)
  const ranked=offers.filter(o=>o.id&&o.price.trim()&&Number.isFinite(Number(o.price.replace(",",".")))&&Number(o.price.replace(",","."))>0).map(o=>({...o,value:Number(o.price.replace(",","."))})).sort((a,b)=>a.value-b.value)
  const unique=new Set(ranked.map(o=>o.id)).size===ranked.length
  return <section className="space-y-3 p-4 bg-white rounded-xl border">
    <h3 className="font-bold">Comparatif des offres fournisseur</h3>
    <p>Classement calculé sur les prix saisis, pour la même unité et la même base de taxes/transport. Aucun prix de marché n'est inventé.</p>
    <label>Article<select className="w-full border p-2" value={articleId} onChange={e=>{setArticleId(e.target.value);setOffers([{id:"",price:""},{id:"",price:""}])}}><option value="">Choisir</option>{articles.map(a=><option key={a.id} value={a.id}>{a.nom}</option>)}</select></label>
    {offers.map((o,i)=><div className="flex flex-wrap gap-2" key={i}><select aria-label={`Fournisseur ${i+1}`} value={o.id} onChange={e=>setOffers(offers.map((v,j)=>j===i?{...v,id:e.target.value}:v))}><option value="">Fournisseur</option>{fournisseurs.map(f=><option key={f.id} value={f.id}>{f.nom}</option>)}</select><input className="border p-2" aria-label={`Prix fournisseur ${i+1}`} inputMode="decimal" value={o.price} onChange={e=>setOffers(offers.map((v,j)=>j===i?{...v,price:e.target.value}:v))}/><span>DH / {article?.unite||"unité à choisir"}</span></div>)}
    {offers.length<4&&<button className="border rounded p-2" onClick={()=>setOffers([...offers,{id:"",price:""}])}>Ajouter une offre</button>}
    {!unique&&<p role="alert">Choisissez des fournisseurs distincts.</p>}
    {article&&unique&&ranked.length>=2&&<ol className="space-y-2">{ranked.map((o,i)=><li key={o.id}>{i+1}. {fournisseurs.find(f=>f.id===o.id)?.nom} : {o.value.toFixed(2)} DH/{article.unite}</li>)}</ol>}
    {article&&unique&&ranked.length>=2&&<p className="rounded border p-3 text-sm">À qualité, poids net et frais identiques, l’offre de {fournisseurs.find(f=>f.id===ranked[0].id)?.nom} est la moins chère parmi les offres saisies. Écart avec la suivante : {(ranked[1].value-ranked[0].value).toFixed(2)} DH/{article.unite}. Confirmez ces conditions avant de choisir.</p>}
    <p className="text-sm">Vérifiez disponibilité, transport, taxes et qualité physique avant décision. Aucun achat n'est créé automatiquement.</p>
    {article&&<details><summary>Historique des prix enregistrés</summary><ul>{(article.historiquePrixAchat??[]).slice(-20).reverse().map((h,i)=><li key={i}>{h.fournisseurNom||"Fournisseur non précisé"} : {h.prixAchat} DH/{article.unite}</li>)}</ul></details>}
  </section>
}

interface NouveauFournisseurModalProps {
  articles: Article[]
  onClose: () => void
  onCreated: (f: Fournisseur) => void
  // Mode édition — quand fourni, le formulaire est pré-rempli, l'étape "type"
  // est sautée (accessible via "← Type" si besoin), et la sauvegarde met à
  // jour ce fournisseur au lieu d'en créer un nouveau.
  fournisseur?: Fournisseur
  onUpdated?: (f: Fournisseur) => void
}

type NFStep = "type" | "form"
type SpecialiteMode = "famille" | "article"

const FOURNISSEUR_TYPES = Object.entries(FOURNISSEUR_TYPE_LABELS) as [FournisseurType, string][]

export function NouveauFournisseurModal({ articles, onClose, onCreated, fournisseur, onUpdated }: NouveauFournisseurModalProps) {
  const isEdit = !!fournisseur
  const [step, setStep] = useState<NFStep>(isEdit ? "form" : "type")
  const [type, setType] = useState<FournisseurType | null>(fournisseur?.type ?? null)
  const [nom, setNom] = useState(fournisseur?.nom ?? "")
  const [contact, setContact] = useState(fournisseur?.contact ?? "")
  const [telephone, setTelephone] = useState(fournisseur?.telephone ?? "")
  const [ville, setVille] = useState(fournisseur?.ville ?? "")
  const [notes, setNotes] = useState(fournisseur?.notes ?? "")
  const [saving, setSaving] = useState(false)
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null)
  const [gpsStatus, setGpsStatus] = useState<"loading" | "granted" | "denied">("loading")

  // Spécialités — soit par famille (catégories génériques), soit article par
  // article (produits précis) — aucune limite de sélection dans les deux cas.
  const [specialiteMode, setSpecialiteMode] = useState<SpecialiteMode>("famille")
  const [specialites, setSpecialites] = useState<string[]>(fournisseur?.specialites ?? [])
  const [articleSearch, setArticleSearch] = useState("")
  const toggleSpecialite = (val: string) => {
    setSpecialites(prev => prev.includes(val) ? prev.filter(x => x !== val) : [...prev, val])
  }
  const filteredArticlesForSpec = articles.filter(a =>
    !articleSearch.trim() || a.nom.toLowerCase().includes(articleSearch.trim().toLowerCase())
  )

  const captureGPS = useCallback(() => {
    setGpsStatus("loading")
    if (!navigator.geolocation) { setGpsStatus("denied"); return }
    navigator.geolocation.getCurrentPosition(
      pos => { setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGpsStatus("granted") },
      () => setGpsStatus("denied"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }, [])

  // Capture automatique dès l'ouverture du formulaire — plus besoin de
  // demander "Êtes-vous chez ce fournisseur ?" : la position est prise en
  // tâche de fond pendant la saisie, prête au moment d'enregistrer.
  useEffect(() => { captureGPS() }, [captureGPS])

  const finalize = async () => {
    if (!nom.trim()) return
    setSaving(true)

    if (isEdit && fournisseur) {
      // Édition — on garde l'historique d'itinéraires existant ; si un nouveau
      // point GPS a été capté automatiquement, on l'AJOUTE (ne remplace jamais
      // tout l'historique, contrairement à la création où la liste est vide au départ).
      const nouveauPoint = gps ? [{ nom: nom.trim() || fournisseur.nom, lat: gps.lat, lng: gps.lng }] : []
      const updates: Partial<Fournisseur> = {
        nom: nom.trim(), contact: contact.trim(), telephone: telephone.trim(),
        ville: ville.trim() || undefined, type: type ?? fournisseur.type, specialites,
        notes: notes.trim() || undefined,
        itineraires: [...(fournisseur.itineraires ?? []), ...nouveauPoint],
        gpsVerifie: fournisseur.gpsVerifie || !!gps,
      }
      store.updateFournisseur(fournisseur.id, updates)
      const merged = { ...fournisseur, ...updates }
      try {
        const db = await import("@/lib/supabase/db")
        await db.upsertFournisseur(merged)
      } catch { /* offline — reste en local, se synchronisera plus tard */ }
      setSaving(false)
      onUpdated?.(merged)
      return
    }

    const created: Fournisseur = {
      id: store.genId(),
      nom: nom.trim(), contact: contact.trim(), telephone: telephone.trim(), email: "",
      ville: ville.trim() || undefined, type: type ?? "autre", specialites,
      notes: notes.trim() || undefined,
      itineraires: gps ? [{ nom: nom.trim() || "Point de création", lat: gps.lat, lng: gps.lng }] : [],
      gpsVerifie: !!gps,
    }
    store.addFournisseur(created)
    try {
      const db = await import("@/lib/supabase/db")
      await db.upsertFournisseur(created)
    } catch { /* offline — reste en local, se synchronisera plus tard */ }
    setSaving(false)
    onCreated(created)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-t-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-green-50 shrink-0">
          <p className="text-sm font-bold text-foreground">{isEdit ? "Modifier fournisseur" : "Nouveau fournisseur"}</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-muted-foreground text-lg leading-none">✕</button>
        </div>

        <div className="p-5 flex flex-col gap-4 overflow-y-auto">
          {step === "type" && (
            <>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Type de fournisseur</p>
              <div className="grid grid-cols-2 gap-2">
                {FOURNISSEUR_TYPES.map(([val, label]) => (
                  <button key={val} type="button" onClick={() => { setType(val); setStep("form") }}
                    className={`px-3 py-4 rounded-xl text-sm font-semibold border-2 transition-colors ${
                      type === val ? "border-green-600 bg-green-50 text-green-700" : "border-border text-muted-foreground hover:border-green-300"
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === "form" && (
            <>
              <button onClick={() => setStep("type")} className="text-xs font-semibold text-muted-foreground hover:text-muted-foreground self-start">← Type : {type ? FOURNISSEUR_TYPE_LABELS[type] : ""}</button>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-foreground">Raison sociale / Nom *</label>
                <input type="text" value={nom} onChange={e => setNom(e.target.value)}
                  className="px-3 py-2.5 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="ex: Souk Had Soualem — Stand 12" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-foreground">Nom du contact</label>
                <input type="text" value={contact} onChange={e => setContact(e.target.value)}
                  className="px-3 py-2.5 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="ex: Ahmed" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-foreground">Téléphone</label>
                <input type="tel" value={telephone} onChange={e => setTelephone(e.target.value)}
                  className="px-3 py-2.5 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="06 00 00 00 00" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-foreground">Ville</label>
                <input type="text" value={ville} onChange={e => setVille(e.target.value)}
                  className="px-3 py-2.5 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Casablanca" />
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground">Spécialités {specialites.length > 0 && <span className="text-green-600">({specialites.length})</span>}</label>
                  <div className="flex rounded-lg border border-border overflow-hidden text-[11px] font-semibold">
                    <button type="button" onClick={() => setSpecialiteMode("famille")}
                      className={`px-2.5 py-1 ${specialiteMode === "famille" ? "bg-green-600 text-white" : "text-muted-foreground"}`}>
                      Par famille
                    </button>
                    <button type="button" onClick={() => setSpecialiteMode("article")}
                      className={`px-2.5 py-1 ${specialiteMode === "article" ? "bg-green-600 text-white" : "text-muted-foreground"}`}>
                      Par article
                    </button>
                  </div>
                </div>

                {specialiteMode === "famille" && (
                  <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-1">
                    {SPECIALITES_FRUITS_LEGUMES.map(s => (
                      <button key={s} type="button" onClick={() => toggleSpecialite(s)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                          specialites.includes(s) ? "bg-green-600 text-white border-green-600" : "border-border text-muted-foreground"
                        }`}>
                        {s}
                      </button>
                    ))}
                  </div>
                )}

                {specialiteMode === "article" && (
                  <div className="flex flex-col gap-2">
                    <input type="text" value={articleSearch} onChange={e => setArticleSearch(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="Rechercher un article..." />
                    <div className="flex flex-col gap-1 max-h-48 overflow-y-auto border border-border rounded-lg p-1.5">
                      {filteredArticlesForSpec.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-2">Aucun article trouvé.</p>
                      )}
                      {filteredArticlesForSpec.map(a => (
                        <label key={a.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted cursor-pointer">
                          <input type="checkbox" checked={specialites.includes(a.nom)} onChange={() => toggleSpecialite(a.nom)}
                            className="w-4 h-4 accent-green-600 shrink-0" />
                          <span className="text-sm text-foreground">{a.nom}</span>
                          <span className="ml-auto text-[10px] text-muted-foreground">{a.famille}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-foreground">Remarques (optionnel)</label>
                <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
                  className="px-3 py-2.5 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                  placeholder="Produits disponibles, horaires, conditions..." />
              </div>

              {/* Position GPS — capturée automatiquement en tâche de fond dès
                  l'ouverture du formulaire, aucune confirmation manuelle requise. */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted border border-border">
                {gpsStatus === "loading" && (
                  <>
                    <span className="w-4 h-4 border-2 border-green-500/40 border-t-green-600 rounded-full animate-spin shrink-0" />
                    <p className="text-xs text-muted-foreground">Localisation automatique en cours...</p>
                  </>
                )}
                {gpsStatus === "granted" && gps && (
                  <>
                    <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <p className="text-xs font-mono text-green-700">📍 Position capturée : {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}</p>
                  </>
                )}
                {gpsStatus === "denied" && (
                  <>
                    <p className="text-xs text-amber-600 flex-1">Position indisponible — vérifiez l&apos;autorisation de localisation.</p>
                    <button onClick={captureGPS} className="text-xs font-semibold text-green-700 underline shrink-0">Réessayer</button>
                  </>
                )}
              </div>

              <button onClick={finalize} disabled={!nom.trim() || saving}
                className="mt-1 py-3 rounded-xl bg-green-600 text-white text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2">
                {saving && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                Enregistrer
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
