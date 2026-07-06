"use client"
// @ts-ignore — shared AI helper
import { callLLM, triggerN3Alert } from "@/lib/ai"

import { useState, useCallback, useRef } from "react"
import { store, type User, type Client } from "@/lib/store"

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

type Activite = "restaurant" | "marchand" | "distributeur" | "grossiste" | "superette" | "hotel" | "traiteur" | "autre"
type Potentiel = "faible" | "moyen" | "fort"
type ProspTab = "liste" | "analyse_ia" | "convertis"

interface ProspectClient {
  id: string
  nom: string
  activite: Activite
  ville: string
  zone: string
  secteur: string
  telephone: string
  email: string
  contact: string
  adresse: string
  potentiel: Potentiel
  notes: string
  articlesInterets: string[]
  createdAt: string
  convertedClientId?: string   // set when converted to real client
  iaAnalyse?: IaAnalyse        // cached IA analysis
  lastAnalysedAt?: string
}

interface IaAnalyse {
  score: number          // 0-100
  potentiel: Potentiel
  pitch: string          // recommended sales pitch (Arabic + French)
  produits: string[]     // top recommended products
  frequence: string      // suggested delivery frequency
  volumeEstime: string   // estimated weekly volume
  risques: string        // risks / objections
  strategie: string      // approach strategy
  resume: string         // short executive summary
}

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

const ACTIVITES: { value: Activite; label: string; labelAr: string; color: string }[] = [
  { value: "restaurant",   label: "Restaurant / Café",     labelAr: "مطعم / قهوة",    color: "#ef4444" },
  { value: "marchand",     label: "Marchand légumes",       labelAr: "بائع خضر",       color: "#22c55e" },
  { value: "distributeur", label: "Distributeur",           labelAr: "موزع",           color: "#3b82f6" },
  { value: "grossiste",    label: "Grossiste",              labelAr: "تاجر الجملة",    color: "#8b5cf6" },
  { value: "superette",    label: "Supérette / Epicerie",   labelAr: "سوبيريت",        color: "#f97316" },
  { value: "hotel",        label: "Hotel / Résidence",      labelAr: "فندق / إقامة",   color: "#14b8a6" },
  { value: "traiteur",     label: "Traiteur / Catering",    labelAr: "طباخ / تيتراور", color: "#ec4899" },
  { value: "autre",        label: "Autre",                  labelAr: "أخرى",           color: "#6b7280" },
]

const VILLES_MA = [
  "Casablanca", "Rabat", "Marrakech", "Fès", "Tanger", "Agadir", "Meknès", "Oujda",
  "Kénitra", "Tétouan", "Salé", "Mohammedia", "Béni Mellal", "El Jadida", "Nador",
  "Settat", "Safi", "Khémisset", "Berkane", "Tiznit",
]

const ARTICLES_SUGGESTIONS: Record<Activite, string[]> = {
  restaurant:   ["Tomates", "Oignons", "Pommes de terre", "Herbes fraîches", "Citrons", "Ail", "Carottes", "Courgettes", "Poivrons", "Salade verte"],
  marchand:     ["Tomates", "Poivrons", "Aubergines", "Courgettes", "Pommes de terre", "Oignons", "Oranges", "Pommes", "Bananes", "Raisin"],
  distributeur: ["Tomates 10kg", "Oignons sac 25kg", "Pommes de terre 25kg", "Carottes vrac", "Bananes régime", "Caisses oranges"],
  grossiste:    ["Palettes tomates", "Caisses oranges", "Pommes de terre 50kg", "Oignons vrac", "Bananes carton", "Avocats carton"],
  superette:    ["Tomates sachet", "Fruits frais emballés", "Salades", "Herbes fraîches", "Citrons filet", "Concombres"],
  hotel:        ["Fraises", "Framboises", "Mangue", "Avocat", "Herbes aromatiques", "Fleurs comestibles", "Asperges", "Figues"],
  traiteur:     ["Légumes découpés", "Herbes fraîches", "Fleurs comestibles", "Fruits exotiques", "Champignons", "Artichauts"],
  autre:        ["Tomates", "Oignons", "Pommes de terre", "Carottes", "Oranges"],
}

const POTENTIEL_CFG: Record<Potentiel, { label: string; labelAr: string; cls: string; dot: string }> = {
  fort:   { label: "Fort",   labelAr: "عالي",    cls: "bg-green-50 text-green-700 border-green-200",   dot: "bg-green-500" },
  moyen:  { label: "Moyen",  labelAr: "متوسط",   cls: "bg-amber-50 text-amber-700 border-amber-200",   dot: "bg-amber-500" },
  faible: { label: "Faible", labelAr: "ضعيف",    cls: "bg-slate-100 text-slate-600 border-slate-200",  dot: "bg-slate-400" },
}

const LS_KEY = "fl_prospects_v2"
const LS_CONV_KEY = "fl_prospects_converted"

function genId() { return Math.random().toString(36).slice(2, 10) }
function loadProspects(): ProspectClient[] {
  // migrate from old key
  try {
    const v1 = localStorage.getItem("fl_prospects")
    const v2 = localStorage.getItem(LS_KEY)
    if (!v2 && v1) {
      const migrated: ProspectClient[] = (JSON.parse(v1) as ProspectClient[]).map(p => ({
        ...p,
        adresse: (p as ProspectClient & { adresse?: string }).adresse ?? "",
      }))
      localStorage.setItem(LS_KEY, JSON.stringify(migrated))
      return migrated
    }
    return JSON.parse(v2 ?? "[]")
  } catch { return [] }
}
function saveProspects(p: ProspectClient[]) { localStorage.setItem(LS_KEY, JSON.stringify(p)) }

// ─── Export helpers ───────────────────────────────────────────
function exportJSON(prospects: ProspectClient[]) {
  const blob = new Blob([JSON.stringify(prospects, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `prospects_freshlink_${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function exportCSV(prospects: ProspectClient[]) {
  const headers = ["id","nom","activite","ville","zone","secteur","telephone","email","contact","adresse","potentiel","notes","articlesInterets","createdAt","score_ia","resume_ia","convertedClientId"]
  const rows = prospects.map(p => [
    p.id, p.nom, p.activite, p.ville, p.zone, p.secteur,
    p.telephone, p.email, p.contact, p.adresse, p.potentiel,
    `"${(p.notes ?? "").replace(/"/g, "'")}"`,
    `"${p.articlesInterets.join(" | ")}"`,
    p.createdAt,
    p.iaAnalyse?.score ?? "",
    `"${(p.iaAnalyse?.resume ?? "").replace(/"/g, "'")}"`,
    p.convertedClientId ?? "",
  ])
  const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n")
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `prospects_freshlink_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

async function importJSON(file: File): Promise<ProspectClient[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string)
        if (!Array.isArray(data)) throw new Error("Format invalide: le fichier doit contenir un tableau JSON")
        // Basic validation
        const valid = data.filter((item: unknown) =>
          typeof item === "object" && item !== null &&
          "nom" in item && "activite" in item
        ) as ProspectClient[]
        resolve(valid)
      } catch (err) {
        reject(err instanceof Error ? err.message : "Erreur de lecture du fichier")
      }
    }
    reader.onerror = () => reject("Erreur de lecture du fichier")
    reader.readAsText(file)
  })
}

// ─────────────────────────────────────────────────────────────
// ICON HELPER
// ─────────────────────────────────────────────────────────────

function Icon({ d, className = "w-4 h-4" }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────
// AI ANALYSIS — real LLM call
// ─────────────────────────────────────────────────────────────

async function analyserProspect(prospect: ProspectClient, articles: string[]): Promise<IaAnalyse> {
  const act = ACTIVITES.find(a => a.value === prospect.activite)
  const systemPrompt = `Tu es ASHEL, un expert commercial IA spécialisé dans la distribution de fruits et légumes au Maroc (FreshLink).
Tu analyses des prospects clients et génères des recommandations commerciales précises et actionnables.
Tu réponds UNIQUEMENT en JSON valide, aucun texte avant ou après le JSON.`

  const userMsg = `Analyse ce prospect client pour notre activité de distribution F&L:

NOM: ${prospect.nom}
ACTIVITE: ${act?.label ?? prospect.activite} (${act?.labelAr ?? ""})
VILLE: ${prospect.ville}
ZONE/QUARTIER: ${prospect.zone || "Non précisé"}
SECTEUR: ${prospect.secteur || "Non précisé"}
TELEPHONE: ${prospect.telephone || "Non renseigné"}
CONTACT: ${prospect.contact || "Non renseigné"}
POTENTIEL PERÇU: ${prospect.potentiel}
ARTICLES IDENTIFIÉS: ${prospect.articlesInterets.join(", ") || "Aucun encore"}
NOTRE CATALOGUE: ${articles.slice(0, 20).join(", ")}
NOTES: ${prospect.notes || "Aucune note"}

Génère une analyse complète en JSON avec exactement cette structure:
{
  "score": <nombre 0-100 représentant le score de potentiel commercial>,
  "potentiel": <"faible"|"moyen"|"fort">,
  "pitch": "<pitch de vente personnalisé en 2-3 phrases, mentionner le nom du client, son activité, et nos produits phares — mélange français/darija marocaine>",
  "produits": ["<produit1>", "<produit2>", "<produit3>", "<produit4>", "<produit5>"],
  "frequence": "<fréquence de livraison recommandée ex: quotidien, 3x/semaine, etc.>",
  "volumeEstime": "<volume hebdomadaire estimé en kg ex: 150-300 kg/semaine>",
  "risques": "<principaux risques ou objections à anticiper en 1-2 phrases>",
  "strategie": "<stratégie d'approche recommandée en 2-3 étapes concrètes>",
  "resume": "<résumé exécutif en 1 phrase percutante>"
}`

  const res = await fetch("https://llm.blackbox.ai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openrouter/claude-sonnet-4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userMsg },
      ],
      max_tokens: 800,
      temperature: 0.4,
    }),
  })

  if (!res.ok) throw new Error(`API error ${res.status}`)
  const data = await res.json()
  const raw = data.choices?.[0]?.message?.content ?? "{}"
  // Extract JSON even if wrapped in ```json ... ```
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error("No JSON in response")
  return JSON.parse(jsonMatch[0]) as IaAnalyse
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const radius = 28
  const circumference = 2 * Math.PI * radius
  const pct = Math.min(100, Math.max(0, score))
  const offset = circumference - (pct / 100) * circumference
  const color = pct >= 70 ? "#22c55e" : pct >= 45 ? "#f59e0b" : "#ef4444"
  return (
    <div className="relative w-20 h-20 shrink-0">
      <svg width="80" height="80" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        <circle cx="40" cy="40" r={radius} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 40 40)" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-black" style={{ color }}>{pct}</span>
        <span className="text-[9px] text-muted-foreground leading-none">/100</span>
      </div>
    </div>
  )
}

function AnalyseCard({ analyse, prospect, onClose, onUpdateProspect }: {
  analyse: IaAnalyse
  prospect: ProspectClient
  onClose: () => void
  onUpdateProspect: (p: ProspectClient) => void
}) {
  const ptCfg = POTENTIEL_CFG[analyse.potentiel]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm">
      <div className="bg-background rounded-2xl border border-border w-full max-w-2xl shadow-2xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center gap-3 px-5 py-4 border-b border-border bg-background rounded-t-2xl">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-black text-foreground text-base truncate">{prospect.nom}</p>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${ptCfg.cls}`}>
                {ptCfg.label} · {ptCfg.labelAr}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Analyse IA — ASHEL Commercial</p>
          </div>
          <ScoreRing score={analyse.score} />
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted text-muted-foreground shrink-0">
            <Icon d="M6 18L18 6M6 6l12 12" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Resume */}
          <div className="rounded-xl bg-primary/5 border border-primary/20 px-4 py-3">
            <p className="text-xs font-bold text-primary uppercase tracking-wide mb-1">Resume executif</p>
            <p className="text-sm font-semibold text-foreground">{analyse.resume}</p>
          </div>

          {/* Pitch */}
          <div className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Icon d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              Pitch de vente recommande
            </p>
            <p className="text-sm text-foreground leading-relaxed italic">&ldquo;{analyse.pitch}&rdquo;</p>
          </div>

          {/* Grid: frequence + volume */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-card px-4 py-3">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1">Frequence livraison</p>
              <p className="text-sm font-bold text-foreground">{analyse.frequence}</p>
            </div>
            <div className="rounded-xl border border-border bg-card px-4 py-3">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1">Volume estime</p>
              <p className="text-sm font-bold text-foreground">{analyse.volumeEstime}</p>
            </div>
          </div>

          {/* Top produits */}
          <div className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Icon d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              Produits recommandes
            </p>
            <div className="flex flex-wrap gap-1.5">
              {analyse.produits.map((p, i) => (
                <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary font-semibold border border-primary/20">
                  {p}
                </span>
              ))}
            </div>
          </div>

          {/* Strategie */}
          <div className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Icon d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              Strategie d&apos;approche
            </p>
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{analyse.strategie}</p>
          </div>

          {/* Risques */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-1 flex items-center gap-1.5">
              <Icon d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              Risques et objections
            </p>
            <p className="text-sm text-amber-800 leading-relaxed">{analyse.risques}</p>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            {prospect.telephone && (
              <a
                href={`https://wa.me/212${prospect.telephone.replace(/^0/, "")}`}
                target="_blank" rel="noreferrer"
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-white text-sm font-bold hover:opacity-90 transition-opacity"
                style={{ background: "#25D366" }}>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                WhatsApp
              </a>
            )}
            <button
              onClick={() => {
                const updated: ProspectClient = {
                  ...prospect,
                  potentiel: analyse.potentiel,
                  articlesInterets: analyse.produits,
                  iaAnalyse: analyse,
                  lastAnalysedAt: new Date().toISOString(),
                }
                onUpdateProspect(updated)
                onClose()
              }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90 transition-opacity"
              style={{ background: "var(--primary)" }}>
              <Icon d="M5 13l4 4L19 7" />
              Appliquer et fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────

export default function BOProspection({ user }: { user: User }) {
  const [prospects, setProspects]         = useState<ProspectClient[]>(loadProspects)
  const [tab, setTab]                     = useState<ProspTab>("liste")
  const [filterActivite, setFilterActivite] = useState<Activite | "">("")
  const [filterPotentiel, setFilterPotentiel] = useState<Potentiel | "">("")
  const [filterVille, setFilterVille]     = useState("")
  const [search, setSearch]               = useState("")
  const [showForm, setShowForm]           = useState(false)
  const [selected, setSelected]           = useState<ProspectClient | null>(null)
  const [analyseModal, setAnalyseModal]   = useState<{ prospect: ProspectClient; result: IaAnalyse } | null>(null)
  const [analysingId, setAnalysingId]     = useState<string | null>(null)
  const [analyseError, setAnalyseError]   = useState<string | null>(null)
  const [convertingId, setConvertingId]   = useState<string | null>(null)
  const [convertSuccess, setConvertSuccess] = useState<string | null>(null)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [importStatus, setImportStatus]    = useState<{ type: "success" | "error"; msg: string } | null>(null)
  const [importing, setImporting]          = useState(false)
  const fileInputRef                       = useRef<HTMLInputElement>(null)

  // Form
  const blank = (): Omit<ProspectClient, "id" | "createdAt"> => ({
    nom: "", activite: "restaurant", ville: "Casablanca", zone: "", secteur: "",
    telephone: "", email: "", contact: "", adresse: "", potentiel: "moyen", notes: "", articlesInterets: [],
  })
  const [form, setForm] = useState(blank())

  const articles = store.getArticles().map(a => a.nom)

  const updateList = useCallback((list: ProspectClient[]) => {
    setProspects(list)
    saveProspects(list)
  }, [])

  const handleSave = () => {
    if (!form.nom.trim()) return
    const np: ProspectClient = { ...form, id: genId(), createdAt: new Date().toISOString() }
    updateList([...prospects, np])
    setShowForm(false)
    setForm(blank())
  }

  const handleDelete = (id: string) => {
    updateList(prospects.filter(p => p.id !== id))
    setSelected(null)
  }

  const handleUpdateProspect = useCallback((updated: ProspectClient) => {
    updateList(prospects.map(p => p.id === updated.id ? updated : p))
    setSelected(updated)
  }, [prospects, updateList])

  const handleAnalyse = async (prospect: ProspectClient) => {
    setAnalysingId(prospect.id)
    setAnalyseError(null)
    try {
      const result = await analyserProspect(prospect, articles)
      setAnalyseModal({ prospect, result })
    } catch (e) {
      setAnalyseError(e instanceof Error ? e.message : "Erreur IA")
    } finally {
      setAnalysingId(null)
    }
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportStatus(null)
    try {
      const imported = await importJSON(file)
      // Merge: skip duplicates by id
      const existingIds = new Set(prospects.map(p => p.id))
      const newOnes = imported.map(p => ({
        ...p,
        id: existingIds.has(p.id) ? genId() : p.id,
      }))
      const merged = [...prospects, ...newOnes]
      updateList(merged)
      setImportStatus({ type: "success", msg: `${newOnes.length} prospect(s) importé(s) avec succès.` })
    } catch (err) {
      setImportStatus({ type: "error", msg: err instanceof Error ? err.message : String(err) })
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  // Convert prospect → real Client in store
  const handleConvert = (prospect: ProspectClient) => {
    const alreadyExists = store.getClients().find(
      c => c.nom.toLowerCase() === prospect.nom.toLowerCase() ||
           (prospect.telephone && c.telephone === prospect.telephone)
    )
    if (alreadyExists) {
      setConvertSuccess(`Attention: "${prospect.nom}" existe peut-etre deja dans la base (${alreadyExists.nom})`)
      return
    }
    setConvertingId(prospect.id)

    // Map activite → ClientType
    const typeMap: Record<Activite, Client["type"]> = {
      restaurant: "restaurant", marchand: "marchand", distributeur: "grossiste",
      grossiste: "grossiste", superette: "superette", hotel: "hotel",
      traiteur: "traiteur", autre: "autre",
    }

    const newClient: Client = {
      id: genId(),
      nom: prospect.nom,
      secteur: prospect.secteur || "—",
      zone: prospect.zone || "—",
      type: typeMap[prospect.activite] ?? "autre",
      taille: "50-100kg",
      typeProduits: prospect.potentiel === "fort" ? "haute_gamme" : "moyenne",
      rotation: "journalier",
      telephone: prospect.telephone || undefined,
      email: prospect.email || undefined,
      adresse: `${prospect.ville}${prospect.zone ? `, ${prospect.zone}` : ""}`,
      notes: [
        prospect.notes,
        `Prospect converti le ${new Date().toLocaleDateString("fr-MA")}`,
        prospect.articlesInterets.length > 0 ? `Articles: ${prospect.articlesInterets.join(", ")}` : "",
      ].filter(Boolean).join(" | "),
      createdBy: user.name,
      createdAt: new Date().toISOString(),
    }
    store.addClient(newClient)

    // Mark as converted
    const updated: ProspectClient = { ...prospect, convertedClientId: newClient.id }
    updateList(prospects.map(p => p.id === prospect.id ? updated : p))
    setSelected(updated)
    setConvertSuccess(`"${prospect.nom}" a ete ajoute a la base clients avec succes.`)
    setConvertingId(null)
  }

  // ── Filtered lists ─────────────────────────────────────────
  const active = prospects.filter(p => !p.convertedClientId)
  const converted = prospects.filter(p => !!p.convertedClientId)

  const filtered = active.filter(p => {
    if (filterActivite && p.activite !== filterActivite) return false
    if (filterPotentiel && p.potentiel !== filterPotentiel) return false
    if (filterVille && p.ville !== filterVille) return false
    if (search && !`${p.nom} ${p.contact} ${p.telephone} ${p.ville} ${p.zone}`.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const analysed = active.filter(p => !!p.iaAnalyse).sort((a, b) => (b.iaAnalyse!.score - a.iaAnalyse!.score))

  const kpis = {
    total: active.length,
    fort: active.filter(p => p.potentiel === "fort").length,
    moyen: active.filter(p => p.potentiel === "moyen").length,
    faible: active.filter(p => p.potentiel === "faible").length,
    convertis: converted.length,
    analyses: analysed.length,
  }

  return (
    <div className="space-y-5">

      {/* ── HEADER ───────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-black text-foreground">Prospection Clients IA</h2>
          <p className="text-sm text-muted-foreground">Gerez vos prospects et analysez-les avec ASHEL — الاستهداف الذكي</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Hidden file input for import */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImportFile}
          />

          {/* Import button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-semibold border border-border bg-background hover:bg-muted transition-colors disabled:opacity-50"
            title="Importer des prospects depuis un fichier JSON">
            {importing ? (
              <span className="w-4 h-4 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
            ) : (
              <Icon d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            )}
            Importer
          </button>

          {/* Export dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(v => !v)}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-semibold border border-border bg-background hover:bg-muted transition-colors"
              title="Exporter les prospects">
              <Icon d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              Exporter
              <Icon d="M19 9l-7 7-7-7" className="w-3 h-3" />
            </button>
            {showExportMenu && (
              <div
                className="absolute right-0 mt-1 w-44 bg-background border border-border rounded-xl shadow-lg overflow-hidden z-30"
                onMouseLeave={() => setShowExportMenu(false)}>
                <button
                  onClick={() => { exportJSON(prospects); setShowExportMenu(false) }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm hover:bg-muted transition-colors text-foreground">
                  <Icon d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  JSON complet
                </button>
                <div className="border-t border-border" />
                <button
                  onClick={() => { exportCSV(prospects); setShowExportMenu(false) }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm hover:bg-muted transition-colors text-foreground">
                  <Icon d="M3 10h18M3 6h18M3 14h18M3 18h18" />
                  CSV (Excel)
                </button>
              </div>
            )}
          </div>

          {/* New prospect */}
          <button
            onClick={() => { setShowForm(true); setForm(blank()) }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm hover:opacity-90 transition-opacity"
            style={{ background: "var(--primary)" }}>
            <Icon d="M12 4v16m8-8H4" />
            Nouveau
          </button>
        </div>
      </div>

      {/* ── KPI ROW ──────────────────────────────────────────── */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {[
          { label: "Total actifs",  labelAr: "المجموع",    value: kpis.total,     cls: "text-foreground",   bg: "bg-card" },
          { label: "Fort",          labelAr: "عالي",        value: kpis.fort,      cls: "text-green-700",    bg: "bg-green-50" },
          { label: "Moyen",         labelAr: "متوسط",       value: kpis.moyen,     cls: "text-amber-700",    bg: "bg-amber-50" },
          { label: "Faible",        labelAr: "ضعيف",        value: kpis.faible,    cls: "text-slate-600",    bg: "bg-slate-50" },
          { label: "Analyses IA",   labelAr: "محللون",      value: kpis.analyses,  cls: "text-blue-700",     bg: "bg-blue-50" },
          { label: "Convertis",     labelAr: "تم التحويل",  value: kpis.convertis, cls: "text-purple-700",   bg: "bg-purple-50" },
        ].map(k => (
          <div key={k.label} className={`${k.bg} rounded-2xl border border-border px-3 py-3`}>
            <p className="text-[10px] text-muted-foreground leading-tight">{k.label}</p>
            <p className="text-[9px] text-muted-foreground/60 leading-tight">{k.labelAr}</p>
            <p className={`text-2xl font-black mt-1 ${k.cls}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* ── TABS ─────────────────────────────────────────────── */}
      <div className="flex gap-1 p-1 bg-muted rounded-xl">
        {([
          { id: "liste",      label: `Liste (${active.length})`,       labelAr: "القائمة" },
          { id: "analyse_ia", label: `Analyse IA (${analysed.length})`, labelAr: "تحليل ذكي" },
          { id: "convertis",  label: `Convertis (${converted.length})`, labelAr: "المحولون" },
        ] as { id: ProspTab; label: string; labelAr: string }[]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
              tab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}>
            {t.label}
            <span className="block text-[9px] opacity-60">{t.labelAr}</span>
          </button>
        ))}
      </div>

      {/* ── LISTE TAB ────────────────────────────────────────── */}
      {tab === "liste" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-center">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher prospect..."
              className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 w-44" />
            <select value={filterActivite} onChange={e => setFilterActivite(e.target.value as Activite | "")}
              className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none">
              <option value="">Toutes activites</option>
              {ACTIVITES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
            <select value={filterVille} onChange={e => setFilterVille(e.target.value)}
              className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none">
              <option value="">Toutes villes</option>
              {VILLES_MA.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select value={filterPotentiel} onChange={e => setFilterPotentiel(e.target.value as Potentiel | "")}
              className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none">
              <option value="">Tout potentiel</option>
              <option value="fort">Fort</option>
              <option value="moyen">Moyen</option>
              <option value="faible">Faible</option>
            </select>
            {(filterActivite || filterVille || filterPotentiel || search) && (
              <button onClick={() => { setFilterActivite(""); setFilterVille(""); setFilterPotentiel(""); setSearch("") }}
                className="px-3 py-2 rounded-xl border border-border text-xs text-muted-foreground hover:bg-muted">
                Effacer
              </button>
            )}
            <span className="text-xs text-muted-foreground ml-auto">{filtered.length} prospect(s)</span>
          </div>

          {/* List */}
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-2xl">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="font-semibold">Aucun prospect</p>
              <p className="text-sm">Cliquez sur &ldquo;Nouveau prospect&rdquo; pour commencer</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map(p => {
                const act = ACTIVITES.find(a => a.value === p.activite)
                const ptCfg = POTENTIEL_CFG[p.potentiel]
                return (
                  <div key={p.id} className="bg-card border border-border rounded-2xl p-4 hover:border-primary/30 hover:shadow-sm transition-all">
                    {/* Top row */}
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-base shrink-0"
                        style={{ background: act?.color ?? "#6b7280" }}>
                        {p.nom[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-foreground truncate">{p.nom}</p>
                        <p className="text-xs text-muted-foreground">{act?.label}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs text-muted-foreground">{p.ville}{p.zone ? ` · ${p.zone}` : ""}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${ptCfg.cls}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${ptCfg.dot}`} />
                            {ptCfg.label}
                          </span>
                          {p.iaAnalyse && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                              IA {p.iaAnalyse.score}/100
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Articles */}
                    {p.articlesInterets.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {p.articlesInterets.slice(0, 4).map(a => (
                          <span key={a} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{a}</span>
                        ))}
                        {p.articlesInterets.length > 4 && <span className="text-[10px] text-muted-foreground">+{p.articlesInterets.length - 4}</span>}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-1.5">
                      <button onClick={() => setSelected(p)}
                        className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors">
                        <Icon d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        Detail
                      </button>
                      <button
                        onClick={() => handleAnalyse(p)}
                        disabled={analysingId === p.id}
                        className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-60"
                        style={{ background: "#3b82f6" }}>
                        {analysingId === p.id ? (
                          <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Analyse...</>
                        ) : (
                          <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1 1 .03 2.694-1.338 2.694H4.136c-1.368 0-2.337-1.694-1.338-2.694L4 15.3" />
                          </svg>Analyser IA</>
                        )}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── ANALYSE IA TAB ───────────────────────────────────── */}
      {tab === "analyse_ia" && (
        <div className="space-y-4">
          {analysed.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground border border-dashed border-blue-200 rounded-2xl bg-blue-50/30">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-30 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1 1 .03 2.694-1.338 2.694H4.136c-1.368 0-2.337-1.694-1.338-2.694L4 15.3" />
              </svg>
              <p className="font-semibold text-blue-700">Aucune analyse IA disponible</p>
              <p className="text-sm">Cliquez sur &ldquo;Analyser IA&rdquo; sur une fiche prospect dans l&apos;onglet Liste</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Classement par score IA — du plus au moins prometteur</p>
              {analysed.map(p => {
                const act = ACTIVITES.find(a => a.value === p.activite)
                const ia = p.iaAnalyse!
                const ptCfg = POTENTIEL_CFG[ia.potentiel]
                return (
                  <div key={p.id} className="bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/30 transition-all">
                    <div className="flex items-start gap-4 p-4">
                      <ScoreRing score={ia.score} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-foreground">{p.nom}</p>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${ptCfg.cls}`}>{ptCfg.label}</span>
                          <span className="text-[10px] text-muted-foreground">{act?.label} · {p.ville}</span>
                        </div>
                        <p className="text-sm text-muted-foreground italic mt-1 line-clamp-2">&ldquo;{ia.resume}&rdquo;</p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {ia.produits.slice(0, 5).map((pr, i) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{pr}</span>
                          ))}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-2">
                          {ia.frequence} &middot; {ia.volumeEstime}
                          {p.lastAnalysedAt && ` · Analysé ${new Date(p.lastAnalysedAt).toLocaleDateString("fr-MA")}`}
                        </p>
                      </div>
                    </div>
                    <div className="px-4 pb-4 flex gap-2">
                      <button onClick={() => setAnalyseModal({ prospect: p, result: ia })}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors">
                        <Icon d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        Voir analyse
                      </button>
                      <button
                        onClick={() => handleAnalyse(p)}
                        disabled={analysingId === p.id}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-blue-200 text-xs font-semibold text-blue-700 hover:bg-blue-50 transition-colors disabled:opacity-50">
                        {analysingId === p.id ? "Analyse..." : "Re-analyser"}
                      </button>
                      <button
                        onClick={() => handleConvert(p)}
                        disabled={!!p.convertedClientId || convertingId === p.id}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-40"
                        style={{ background: "var(--primary)" }}>
                        <Icon d="M12 4v16m8-8H4" />
                        {p.convertedClientId ? "Converti" : "Convertir"}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── CONVERTIS TAB ────────────────────────────────────── */}
      {tab === "convertis" && (
        <div className="space-y-4">
          {converted.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground border border-dashed border-purple-200 rounded-2xl bg-purple-50/20">
              <Icon d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" className="w-12 h-12 mx-auto mb-3 opacity-20 text-purple-500" />
              <p className="font-semibold text-purple-700">Aucun prospect converti</p>
              <p className="text-sm">Convertissez un prospect en client via l&apos;onglet Analyse IA</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">{converted.length} prospect(s) converti(s) en clients dans la base</p>
              {converted.map(p => {
                const act = ACTIVITES.find(a => a.value === p.activite)
                const realClient = store.getClients().find(c => c.id === p.convertedClientId)
                return (
                  <div key={p.id} className="bg-card border border-purple-200 rounded-2xl p-4 flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-foreground">{p.nom}</p>
                      <p className="text-xs text-muted-foreground">{act?.label} · {p.ville}{p.zone ? ` · ${p.zone}` : ""}</p>
                      {realClient ? (
                        <p className="text-xs text-purple-700 mt-1 font-semibold">Client ID: {realClient.id.slice(0, 8)}... — dans la base</p>
                      ) : (
                        <p className="text-xs text-red-500 mt-1">Client introuvable dans la base (supprime?)</p>
                      )}
                      {p.telephone && (
                        <p className="text-xs text-muted-foreground mt-0.5">{p.telephone}</p>
                      )}
                    </div>
                    <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-purple-100 text-purple-700 border border-purple-200 shrink-0">Converti</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── IMPORT STATUS TOAST ─────────────────────────────── */}
      {importStatus && (
        <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-semibold flex items-center gap-2 max-w-sm text-center ${
          importStatus.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
        }`}>
          <Icon d={importStatus.type === "success"
            ? "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            : "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"} />
          {importStatus.msg}
          <button onClick={() => setImportStatus(null)} className="ml-2 opacity-70 hover:opacity-100">
            <Icon d="M6 18L18 6M6 6l12 12" />
          </button>
        </div>
      )}

      {/* ── AI ERROR BANNER ──────────────────────────────────── */}
      {analyseError && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-semibold flex items-center gap-2">
          <Icon d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          {analyseError}
          <button onClick={() => setAnalyseError(null)} className="ml-2 opacity-70 hover:opacity-100">
            <Icon d="M6 18L18 6M6 6l12 12" />
          </button>
        </div>
      )}

      {/* ── SUCCESS BANNER ───────────────────────────────────── */}
      {convertSuccess && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-semibold flex items-center gap-2 max-w-sm text-center">
          <Icon d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          {convertSuccess}
          <button onClick={() => setConvertSuccess(null)} className="ml-2 opacity-70 hover:opacity-100">
            <Icon d="M6 18L18 6M6 6l12 12" />
          </button>
        </div>
      )}

      {/* ── ANALYSE MODAL ────────────────────────────────────── */}
      {analyseModal && (
        <AnalyseCard
          analyse={analyseModal.result}
          prospect={analyseModal.prospect}
          onClose={() => setAnalyseModal(null)}
          onUpdateProspect={(updated) => {
            handleUpdateProspect(updated)
            setAnalyseModal(null)
          }}
        />
      )}

      {/* ── DETAIL MODAL ─────────────────────────────────────── */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-card rounded-2xl border border-border w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div>
                <p className="font-black text-foreground text-lg">{selected.nom}</p>
                <p className="text-sm text-muted-foreground">{ACTIVITES.find(a => a.value === selected.activite)?.label}</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 rounded-xl hover:bg-muted text-muted-foreground">
                <Icon d="M6 18L18 6M6 6l12 12" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  { l: "Ville",     v: selected.ville },
                  { l: "Zone",      v: selected.zone || "—" },
                  { l: "Secteur",   v: selected.secteur || "—" },
                  { l: "Potentiel", v: selected.potentiel, badge: true },
                  { l: "Contact",   v: selected.contact || "—" },
                  { l: "Telephone", v: selected.telephone || "—" },
                ].map(r => (
                  <div key={r.l}>
                    <p className="text-xs text-muted-foreground">{r.l}</p>
                    {r.badge
                      ? <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${POTENTIEL_CFG[selected.potentiel].cls}`}>{selected.potentiel}</span>
                      : <p className="font-semibold">{r.v}</p>
                    }
                  </div>
                ))}
                {selected.email && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="font-semibold">{selected.email}</p>
                  </div>
                )}
              </div>

              {selected.articlesInterets.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">Articles identifies</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.articlesInterets.map(a => (
                      <span key={a} className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary font-semibold">{a}</span>
                    ))}
                  </div>
                </div>
              )}

              {selected.notes && (
                <div className="bg-muted rounded-xl p-3 text-sm text-foreground">{selected.notes}</div>
              )}

              {selected.iaAnalyse && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-blue-700">Score IA: {selected.iaAnalyse.score}/100</span>
                  </div>
                  <p className="text-xs text-blue-800 italic">&ldquo;{selected.iaAnalyse.resume}&rdquo;</p>
                </div>
              )}

              <div className="flex gap-2">
                {selected.telephone && (
                  <a href={`https://wa.me/212${selected.telephone.replace(/^0/, "")}`} target="_blank" rel="noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 transition-colors">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                    WhatsApp
                  </a>
                )}
                {!selected.convertedClientId && (
                  <button
                    onClick={() => { handleConvert(selected); setSelected(null) }}
                    disabled={convertingId === selected.id}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                    style={{ background: "var(--primary)" }}>
                    <Icon d="M12 4v16m8-8H4" />
                    Convertir en client
                  </button>
                )}
              </div>
              <button onClick={() => handleDelete(selected.id)}
                className="w-full py-2 rounded-xl border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 transition-colors">
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD FORM MODAL ───────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-card rounded-2xl border border-border w-full max-w-2xl shadow-xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <p className="font-black text-foreground">Nouveau prospect client</p>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-xl hover:bg-muted text-muted-foreground">
                <Icon d="M6 18L18 6M6 6l12 12" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Activite */}
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2 block">Activite / النشاط</label>
                <div className="grid grid-cols-4 gap-2">
                  {ACTIVITES.map(a => (
                    <button key={a.value} type="button"
                      onClick={() => setForm(f => ({ ...f, activite: a.value, articlesInterets: [] }))}
                      className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                        form.activite === a.value
                          ? "text-white shadow-sm"
                          : "border-border text-muted-foreground hover:border-primary/40"
                      }`}
                      style={form.activite === a.value ? { background: a.color, borderColor: a.color } : {}}>
                      <span className="font-bold text-sm">{a.label.split(" ")[0][0]}</span>
                      <span className="text-center leading-tight text-[10px]">{a.label.split(" ")[0]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Basic */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Nom du client / etablissement *</label>
                  <input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="Ex: Restaurant Al Arz" autoFocus />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Ville</label>
                  <select value={form.ville} onChange={e => setForm(f => ({ ...f, ville: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none">
                    {VILLES_MA.map(v => <option key={v} value={v}>{v}</option>)}
                    <option value="Autre">Autre</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Zone / Quartier</label>
                  <input value={form.zone} onChange={e => setForm(f => ({ ...f, zone: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="Ex: Maarif, Guéliz..." />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Secteur</label>
                  <input value={form.secteur} onChange={e => setForm(f => ({ ...f, secteur: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="Ex: Secteur 3..." />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Potentiel</label>
                  <select value={form.potentiel} onChange={e => setForm(f => ({ ...f, potentiel: e.target.value as Potentiel }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none">
                    <option value="fort">Fort</option>
                    <option value="moyen">Moyen</option>
                    <option value="faible">Faible</option>
                  </select>
                </div>
              </div>

              {/* Contacts */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Nom du contact</label>
                  <input value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="Ex: M. Hassan..." />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Telephone</label>
                  <input value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="06XXXXXXXX" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Email</label>
                  <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="contact@..." />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Adresse</label>
                  <input value={form.adresse} onChange={e => setForm(f => ({ ...f, adresse: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="Adresse complete..." />
                </div>
              </div>

              {/* Articles */}
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2 block">
                  Articles suggeres pour ce type de client
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {ARTICLES_SUGGESTIONS[form.activite].map(art => (
                    <button key={art} type="button"
                      onClick={() => setForm(f => ({
                        ...f,
                        articlesInterets: f.articlesInterets.includes(art)
                          ? f.articlesInterets.filter(a => a !== art)
                          : [...f.articlesInterets, art],
                      }))}
                      className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${
                        form.articlesInterets.includes(art)
                          ? "border-primary bg-primary text-white"
                          : "border-border text-muted-foreground hover:border-primary/50"
                      }`}>
                      {art}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Notes / Besoin specifique</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                  placeholder="Besoins, frequence, budget..." />
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors">
                  Annuler
                </button>
                <button onClick={handleSave} disabled={!form.nom.trim()}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
                  style={{ background: "var(--primary)" }}>
                  Enregistrer le prospect
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
