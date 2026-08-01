"use client"
import { useState, useEffect } from "react"
import { store, type User } from "@/lib/store"
import CameraIARetour from "./CameraIARetour"

interface Props { user: User }

interface RetourItem {
  id: string
  commandeId: string
  clientNom: string
  articleNom: string
  qteRetour: number
  unite: string
  photo: string | null
  photoIA: string | null
  analysisResult: RetourAnalysis | null
  statut: "en_attente" | "valide_commercial" | "valide_logistique" | "rejete"
  commentaireCommercial?: string
  commentaireLogistique?: string
  createdAt: string
  createdBy: string
}

interface RetourAnalysis {
  isMarchandise: boolean
  etat: string
  shelfLifeEstime: string
  prixSuggest: number | null
  recommandation: string
  details: string
}

const RETOURS_KEY = "fl_retours_control"

function getRetours(): RetourItem[] {
  try { return JSON.parse(localStorage.getItem(RETOURS_KEY) ?? "[]") } catch { return [] }
}
function saveRetours(items: RetourItem[]) {
  localStorage.setItem(RETOURS_KEY, JSON.stringify(items))
}

const isCommercial = (u: User) => ["commercial", "resp_commercial", "team_leader", "admin", "super_admin", "super_super_admin"].includes(u.role)
const isLogistique = (u: User) => ["responsable_logistique", "resp_logistique", "dispatcheur", "admin", "super_admin", "super_super_admin"].includes(u.role)

export default function MobileControlRetour({ user }: Props) {
  const [retours, setRetours]         = useState<RetourItem[]>([])
  const [tab, setTab]                 = useState<"declarer"|"valider">("declarer")
  const [showCamera, setShowCamera]   = useState(false)
  const [selected, setSelected]       = useState<RetourItem | null>(null)
  const [showValidate, setShowValidate] = useState(false)
  const [commentaire, setCommentaire] = useState("")
  const [form, setForm]               = useState({
    commandeId: "", clientNom: "", articleNom: "", qteRetour: "", unite: "kg", photo: null as string | null
  })

  useEffect(() => { setRetours(getRetours()) }, [])

  // ── Listes déroulantes : clients livrés + articles livrés au client ──────────
  const clients = useState(() => store.getClients().map(c => c.nom).filter(Boolean).sort((a, b) => a.localeCompare(b, "fr")))[0]
  // Map nom client (normalisé) → articles qui lui ont été livrés/commandés
  const articlesParClient = useState(() => {
    const norm = (s: string) => String(s ?? "").toLowerCase().trim()
    const m: Record<string, Set<string>> = {}
    const add = (client: string, art: string) => { if (!client || !art) return; const k = norm(client); (m[k] ??= new Set()).add(art) }
    try { store.getCommandes().forEach(c => (c.lignes ?? []).forEach(l => add(c.clientNom, l.articleNom))) } catch { /* noop */ }
    try { store.getBonsLivraison().forEach((b: { clientNom?: string; lignes?: { articleNom?: string }[] }) => (b.lignes ?? []).forEach(l => add(b.clientNom ?? "", l.articleNom ?? ""))) } catch { /* noop */ }
    const out: Record<string, string[]> = {}
    Object.entries(m).forEach(([k, set]) => { out[k] = [...set].sort((a, b) => a.localeCompare(b, "fr")) })
    return out
  })[0]
  const allArticles = useState(() => store.getArticles().map(a => a.nom).filter(Boolean).sort((a, b) => a.localeCompare(b, "fr")))[0]
  // Nom arabe — RetourItem ne stocke qu'un nom libre (pas d'articleId), on
  // retrouve le nomAr par correspondance de nom dans le catalogue.
  const nomArByNom = useState(() => {
    const m: Record<string, string> = {}
    store.getArticles().forEach(a => { if (a.nomAr) m[a.nom.toLowerCase().trim()] = a.nomAr })
    return m
  })[0]
  const nomArOfName = (nom: string) => nomArByNom[String(nom ?? "").toLowerCase().trim()] ?? ""
  const articleOptions = (() => {
    const k = (form.clientNom ?? "").toLowerCase().trim()
    const forClient = k ? articlesParClient[k] : undefined
    return forClient && forClient.length ? forClient : allArticles
  })()

  function addRetour() {
    if (!form.articleNom || !form.qteRetour) return
    const item: RetourItem = {
      id: store.genId(),
      commandeId: form.commandeId,
      clientNom: form.clientNom,
      articleNom: form.articleNom,
      qteRetour: parseFloat(form.qteRetour),
      unite: form.unite,
      photo: form.photo,
      photoIA: null,
      analysisResult: null,
      statut: "en_attente",
      createdAt: new Date().toISOString(),
      createdBy: user.name,
    }
    const updated = [...retours, item]
    setRetours(updated)
    saveRetours(updated)
    setForm({ commandeId: "", clientNom: "", articleNom: "", qteRetour: "", unite: "kg", photo: null })
    setTab("valider")
  }

  function handleIAValidate(retourId: string, result: RetourAnalysis, photoBase64: string) {
    const updated = retours.map(r => r.id === retourId ? { ...r, photoIA: photoBase64, analysisResult: result } : r)
    setRetours(updated)
    saveRetours(updated)
    setShowCamera(false)
  }

  function validerCommercial(retourId: string) {
    const updated = retours.map(r => r.id === retourId
      ? { ...r, statut: "valide_commercial" as const, commentaireCommercial: commentaire }
      : r)
    setRetours(updated)
    saveRetours(updated)
    setShowValidate(false)
    setCommentaire("")
    setSelected(null)
  }

  function validerLogistique(retourId: string) {
    const updated = retours.map(r => r.id === retourId
      ? { ...r, statut: "valide_logistique" as const, commentaireLogistique: commentaire }
      : r)
    setRetours(updated)
    saveRetours(updated)
    setShowValidate(false)
    setCommentaire("")
    setSelected(null)
  }

  function rejeter(retourId: string) {
    const updated = retours.map(r => r.id === retourId ? { ...r, statut: "rejete" as const } : r)
    setRetours(updated)
    saveRetours(updated)
    setShowValidate(false)
    setSelected(null)
  }

  const pending      = retours.filter(r => r.statut === "en_attente")
  const waitingLog   = retours.filter(r => r.statut === "valide_commercial")
  const done         = retours.filter(r => ["valide_logistique","rejete"].includes(r.statut))

  // ── Listes déroulantes : clients livrés + articles livrés à CE client ───────
  const clientsList = store.getClients().slice().sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
  const articlesForClient: string[] = (() => {
    const all = store.getArticles().map(a => a.nom)
    if (!form.clientNom) return all
    const names = new Set<string>()
    store.getBonsLivraison().filter(b => b.clientNom === form.clientNom).forEach(b => (b.lignes ?? []).forEach(l => { if (l.articleNom) names.add(l.articleNom) }))
    store.getCommandes().filter(c => c.clientNom === form.clientNom).forEach(c => (c.lignes ?? []).forEach(l => { if (l.articleNom) names.add(l.articleNom) }))
    return names.size ? [...names].sort((a, b) => a.localeCompare(b, "fr")) : all
  })()

  const statusBadge = (s: RetourItem["statut"]) => {
    if (s === "en_attente")        return "bg-amber-100 text-amber-800 border-amber-300"
    if (s === "valide_commercial") return "bg-blue-100 text-blue-800 border-blue-300"
    if (s === "valide_logistique") return "bg-green-100 text-green-800 border-green-300"
    return "bg-red-100 text-red-800 border-red-300"
  }
  const statusLabel = (s: RetourItem["statut"]) => {
    if (s === "en_attente")        return "En attente"
    if (s === "valide_commercial") return "Valide commercial"
    if (s === "valide_logistique") return "Valide logistique"
    return "Rejete"
  }

  // Camera IA overlay
  if (showCamera && selected) {
    return (
      <div className="fixed inset-0 z-50 bg-background overflow-y-auto p-4">
        <div className="max-w-md mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => setShowCamera(false)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Retour
            </button>
            <p className="font-bold text-sm text-foreground">
              Analyse IA — {selected.articleNom}
              {nomArOfName(selected.articleNom) && <span className="ml-1 font-arabic" dir="rtl" lang="ar">({nomArOfName(selected.articleNom)})</span>}
            </p>
          </div>
          <CameraIARetour
            articleNom={selected.articleNom}
            onValidate={(result, photo) => handleIAValidate(selected.id, result, photo)}
            onCancel={() => setShowCamera(false)}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 max-w-lg mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-lg font-black text-foreground">Control Retour</h2>
        <p className="text-xs text-muted-foreground">Double validation commercial + logistique + analyse IA</p>
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl overflow-hidden border border-border">
        {(["declarer","valider"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-xs font-bold transition-colors ${
              tab === t ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"
            }`}>
            {t === "declarer" ? "Declarer retour" : `Validation (${pending.length + waitingLog.length})`}
          </button>
        ))}
      </div>

      {/* Declarer tab */}
      {tab === "declarer" && (
        <div className="flex flex-col gap-4">
          <div className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-3">
            <p className="text-sm font-bold text-foreground">Nouveau retour livreur</p>
            <select value={form.clientNom} onChange={e=>setForm(f=>({...f,clientNom:e.target.value,articleNom:""}))}
              className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">— Choisir le client à livrer —</option>
              {clientsList.map(c => <option key={c.id} value={c.nom}>{c.nom}</option>)}
            </select>
            <select value={form.articleNom} onChange={e=>setForm(f=>({...f,articleNom:e.target.value}))}
              className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">— Choisir l&apos;article{form.clientNom ? " livré à ce client" : ""} —</option>
              {articlesForClient.map(nom => <option key={nom} value={nom}>{nom}</option>)}
            </select>
            <div className="flex gap-2">
              <input type="number" value={form.qteRetour} onChange={e=>setForm(f=>({...f,qteRetour:e.target.value}))}
                placeholder="Quantite"
                className="flex-1 px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              <select value={form.unite} onChange={e=>setForm(f=>({...f,unite:e.target.value}))}
                className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none">
                <option>kg</option><option>botte</option><option>piece</option><option>caisse</option>
              </select>
            </div>

            {/* Photo */}
            <div>
              {form.photo ? (
                <div className="relative">
                  <img src={form.photo} alt="Photo du retour" className="rounded-xl w-full h-40 object-cover" />
                  <button onClick={() => setForm(f=>({...f,photo:null}))}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white text-xs flex items-center justify-center">x</button>
                  <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-lg bg-green-600 text-white text-[10px] font-bold">Photo prise</div>
                </div>
              ) : (
                <label className="flex flex-col items-center gap-2 py-5 rounded-xl border-2 border-dashed border-border cursor-pointer hover:bg-muted/50 transition-colors">
                  <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-xs font-semibold text-muted-foreground">Photo obligatoire</span>
                  <input type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      const reader = new FileReader()
                      reader.onload = ev => setForm(f=>({...f, photo: ev.target?.result as string}))
                      reader.readAsDataURL(file)
                    }} />
                </label>
              )}
            </div>

            <button onClick={addRetour} disabled={!form.articleNom || !form.qteRetour || !form.photo}
              className="w-full py-3 rounded-xl font-bold text-white disabled:opacity-50"
              style={{ background: "oklch(0.65 0.17 145)" }}>
              Declarer le retour
            </button>
          </div>
        </div>
      )}

      {/* Valider tab */}
      {tab === "valider" && (
        <div className="flex flex-col gap-3">
          {/* Pending */}
          {pending.length > 0 && (
            <div>
              <p className="text-xs font-bold text-amber-700 uppercase mb-2">En attente de validation commercial</p>
              {pending.map(r => (
                <RetourCard key={r.id} r={r}
                  onAnalyseIA={() => { setSelected(r); setShowCamera(true) }}
                  onValidate={isCommercial(user) ? () => { setSelected(r); setShowValidate(true) } : undefined}
                  statusBadge={statusBadge} statusLabel={statusLabel}
                  canValidate={isCommercial(user)} validLabel="Valider (commercial)" />
              ))}
            </div>
          )}

          {/* Waiting logistique */}
          {waitingLog.length > 0 && (
            <div>
              <p className="text-xs font-bold text-blue-700 uppercase mb-2">En attente de validation logistique</p>
              {waitingLog.map(r => (
                <RetourCard key={r.id} r={r}
                  onAnalyseIA={() => { setSelected(r); setShowCamera(true) }}
                  onValidate={isLogistique(user) ? () => { setSelected(r); setShowValidate(true) } : undefined}
                  statusBadge={statusBadge} statusLabel={statusLabel}
                  canValidate={isLogistique(user)} validLabel="Valider (logistique)" />
              ))}
            </div>
          )}

          {/* Done */}
          {done.length > 0 && (
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase mb-2">Traites</p>
              {done.map(r => (
                <RetourCard key={r.id} r={r}
                  onAnalyseIA={undefined}
                  onValidate={undefined}
                  statusBadge={statusBadge} statusLabel={statusLabel}
                  canValidate={false} validLabel="" />
              ))}
            </div>
          )}

          {retours.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">Aucun retour declare.</div>
          )}
        </div>
      )}

      {/* Validation modal */}
      {showValidate && selected && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm bg-card rounded-2xl border border-border p-5 flex flex-col gap-4">
            <p className="font-bold text-foreground">
              Validation — {selected.articleNom}
              {nomArOfName(selected.articleNom) && <span className="ml-1 font-arabic" dir="rtl" lang="ar">({nomArOfName(selected.articleNom)})</span>}
            </p>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Client : <strong>{selected.clientNom}</strong></p>
              <p>Quantite : <strong>{selected.qteRetour} {selected.unite}</strong></p>
              {selected.analysisResult && (
                <p>Analyse IA : <strong className="text-foreground">{selected.analysisResult.etat} — {selected.analysisResult.shelfLifeEstime}</strong></p>
              )}
            </div>
            <textarea value={commentaire} onChange={e=>setCommentaire(e.target.value)}
              placeholder="Commentaire (optionnel)"
              rows={3}
              className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
            <div className="flex gap-2">
              <button onClick={() => rejeter(selected.id)}
                className="flex-1 py-2.5 rounded-xl border border-red-200 text-red-600 text-sm font-semibold">Rejeter</button>
              <button onClick={() => selected.statut === "en_attente" ? validerCommercial(selected.id) : validerLogistique(selected.id)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: "oklch(0.65 0.17 145)" }}>
                Valider
              </button>
            </div>
            <button onClick={() => { setShowValidate(false); setSelected(null) }}
              className="text-xs text-center text-muted-foreground">Annuler</button>
          </div>
        </div>
      )}
    </div>
  )
}

function RetourCard({ r, onAnalyseIA, onValidate, statusBadge, statusLabel, canValidate, validLabel }:
  {
    r: RetourItem
    onAnalyseIA?: () => void
    onValidate?: () => void
    statusBadge: (s: RetourItem["statut"]) => string
    statusLabel: (s: RetourItem["statut"]) => string
    canValidate: boolean
    validLabel: string
  }) {
  const nomAr = store.getArticles().find(a => a.nom.toLowerCase().trim() === String(r.articleNom ?? "").toLowerCase().trim())?.nomAr
  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-3 mb-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-sm text-foreground">{r.articleNom}</p>
          {nomAr && <p className="text-xs text-muted-foreground font-arabic" dir="rtl" lang="ar">{nomAr}</p>}
          <p className="text-xs text-muted-foreground">{r.clientNom} — {r.qteRetour} {r.unite}</p>
          <p className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString("fr-FR")} · {r.createdBy}</p>
        </div>
        <span className={`text-[10px] px-2 py-1 rounded-full border font-bold shrink-0 ${statusBadge(r.statut)}`}>
          {statusLabel(r.statut)}
        </span>
      </div>

      {/* Photos */}
      <div className="flex gap-2">
        {r.photo && (
          <div className="flex-1">
            <p className="text-[10px] text-muted-foreground mb-1 font-semibold">Photo retour</p>
            <img src={r.photo} alt="Photo retour livreur" className="rounded-xl h-20 w-full object-cover" />
          </div>
        )}
        {r.photoIA && (
          <div className="flex-1">
            <p className="text-[10px] text-muted-foreground mb-1 font-semibold">Photo analyse IA</p>
            <img src={r.photoIA} alt="Photo analyse IA" className="rounded-xl h-20 w-full object-cover" />
          </div>
        )}
      </div>

      {/* IA result */}
      {r.analysisResult && (
        <div className="px-3 py-2.5 rounded-xl bg-blue-50 border border-blue-200">
          <p className="text-xs font-bold text-blue-800 mb-1">Analyse IA</p>
          <p className="text-xs text-blue-700">
            Etat : <strong>{r.analysisResult.etat}</strong> ·
            Shelf life : <strong>{r.analysisResult.shelfLifeEstime}</strong> ·
            Notre produit : <strong>{r.analysisResult.isMarchandise ? "Oui" : "Non"}</strong>
          </p>
          {r.analysisResult.prixSuggest && (
            <p className="text-xs text-blue-700 mt-0.5">Prix suggere : <strong>{r.analysisResult.prixSuggest} MAD</strong></p>
          )}
          <p className="text-xs text-blue-600 mt-1 italic">{r.analysisResult.recommandation}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {onAnalyseIA && !r.analysisResult && (
          <button onClick={onAnalyseIA}
            className="flex-1 py-2 rounded-xl border text-xs font-semibold"
            style={{ borderColor: "oklch(0.38 0.18 260)", color: "oklch(0.38 0.18 260)" }}>
            Analyser IA
          </button>
        )}
        {canValidate && onValidate && (
          <button onClick={onValidate}
            className="flex-1 py-2 rounded-xl text-xs font-bold text-white"
            style={{ background: "oklch(0.65 0.17 145)" }}>
            {validLabel}
          </button>
        )}
      </div>
    </div>
  )
}
