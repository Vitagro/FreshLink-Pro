"use client"
// @ts-ignore — shared AI helper
import { callLLM, triggerN3Alert } from "@/lib/ai"

import { useState, useRef, useEffect, useCallback } from "react"
import {
  store, type Article, type Fournisseur, type User, type HistoriquePrixAchat,
  type FournisseurType, FOURNISSEUR_TYPE_LABELS, SPECIALITES_FRUITS_LEGUMES,
} from "@/lib/store"
import ArticleCombobox from "@/components/ui/ArticleCombobox"

// ── Shared API call ──────────────────────────────────────────────────────────
async function callAI(messages: { role: string; content: unknown }[], signal?: AbortSignal): Promise<string> {
  const res = await fetch("https://llm.blackbox.ai/chat/completions", {
    method: "POST",
    headers: {
      // blackbox-legacy-key — move to env var BLACKBOX_CUSTOMER_ID
      "Content-Type": "application/json",
      // blackbox-legacy-auth — move to env var BLACKBOX_API_KEY
    },
    body: JSON.stringify({
      model: "openrouter/claude-sonnet-4",
      messages,
    }),
    signal,
  })
  if (!res.ok) throw new Error(`AI error ${res.status}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ""
}

// ── Image → base64 ───────────────────────────────────────────────────────────
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(",")[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function fileToBase64(file: File): Promise<string> {
  return blobToBase64(file)
}

// ────────────────────────────────────────────────────────────────────────────
// CAMERA QUALITE IA
// Analyse la fraîcheur, calibre et état d'un produit via photo
// SI-MOHAMMED utilise cet outil sur le terrain
// ────────────────────────────────────────────────────────────────────────────

interface QualiteResult {
  score: number          // 0-100
  grade: "A" | "B" | "C" | "D"
  fraicheur: string
  calibre: string
  defauts: string[]
  recommandation: "ACHETER" | "NEGOCIER" | "REFUSER"
  prixSuggere?: number
  justification: string
  conseils: string[]
}

interface CameraQualiteIAProps {
  articles: Article[]
  fournisseurs: Fournisseur[]
  user: User
}

export function CameraQualiteIA({ articles, fournisseurs, user }: CameraQualiteIAProps) {
  const [capturedImage, setCapturedImage] = useState<string | null>(null)      // data URL for display
  const [capturedBase64, setCapturedBase64] = useState<string | null>(null)    // base64 for API
  const [capturedMime, setCapturedMime] = useState<string>("image/jpeg")
  const [selectedArticleId, setSelectedArticleId] = useState("")
  const [selectedFournisseurId, setSelectedFournisseurId] = useState("")
  const [quantiteEnvisagee, setQuantiteEnvisagee] = useState("")
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<QualiteResult | null>(null)
  const [error, setError] = useState("")
  const [cameraMode, setCameraMode] = useState<"capture" | "upload">("capture")
  const [cameraActive, setCameraActive] = useState(false)
  const [history, setHistory] = useState<(QualiteResult & { articleNom: string; fournisseurNom: string; date: string; imageUrl: string })[]>([])

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setCameraActive(false)
  }, [])

  useEffect(() => { return () => stopCamera() }, [stopCamera])

  // Attach stream to video element once it mounts — timing-safe
  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(() => {/* autoplay policy — fine on mobile */})
    }
  }, [cameraActive])

  const startCamera = async () => {
    setError("")
    // Stop any existing stream first
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      streamRef.current = stream
      setCameraActive(true) // triggers useEffect above to attach stream
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes("Permission") || msg.includes("NotAllowed") || msg.includes("denied")) {
        setError("Permission camera refusee. Autorisez l'acces camera dans les reglages du navigateur.")
      } else if (msg.includes("NotFound") || msg.includes("DevicesNotFound")) {
        setError("Aucune camera detectee sur cet appareil.")
      } else {
        setError("Camera non disponible. Utilisez l'option galerie.")
      }
      setCameraMode("upload")
    }
  }

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext("2d")!
    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92)
    setCapturedImage(dataUrl)
    setCapturedBase64(dataUrl.split(",")[1])
    setCapturedMime("image/jpeg")
    stopCamera()
    setResult(null)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const dataUrl = URL.createObjectURL(file)
    setCapturedImage(dataUrl)
    const b64 = await fileToBase64(file)
    setCapturedBase64(b64)
    setCapturedMime(file.type || "image/jpeg")
    setResult(null)
  }

  const analyzeQuality = async () => {
    if (!capturedBase64 || !selectedArticleId) {
      setError("Selectionnez un article et capturez une photo d'abord.")
      return
    }
    const article = articles.find(a => a.id === selectedArticleId)!
    const fournisseur = fournisseurs.find(f => f.id === selectedFournisseurId)
    const histPrix = article.historiquePrixAchat ?? []
    const prixMoyen = histPrix.length
      ? (histPrix.reduce((s, h) => s + h.prixAchat, 0) / histPrix.length).toFixed(2)
      : article.prixAchat.toFixed(2)
    const prixMin = histPrix.length ? Math.min(...histPrix.map(h => h.prixAchat)).toFixed(2) : article.prixAchat.toFixed(2)
    const prixMax = histPrix.length ? Math.max(...histPrix.map(h => h.prixAchat)).toFixed(2) : article.prixAchat.toFixed(2)

    setAnalyzing(true)
    setError("")
    setResult(null)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60000) // 60s timeout

    try {
      const systemPrompt = `Tu es SI-MOHAMMED, expert acheteur terrain de FreshLink Pro specialise en fruits et legumes frais.
Tu analyses des photos de produits pour evaluer leur qualite et aider l'acheteur a prendre la meilleure decision.

ARTICLE A EVALUER: ${article.nom} (${article.unite})
FOURNISSEUR: ${fournisseur?.nom ?? "Non specifie"}
PRIX ACTUEL: ${article.prixAchat} DH/${article.unite}
HISTORIQUE PRIX: Min ${prixMin} DH | Moyen ${prixMoyen} DH | Max ${prixMax} DH
QUANTITE ENVISAGEE: ${quantiteEnvisagee || "Non specifiee"} ${article.unite}

Analyse cette photo et reponds UNIQUEMENT en JSON valide avec ce schema exact:
{
  "score": <0-100>,
  "grade": "<A|B|C|D>",
  "fraicheur": "<description courte de la fraicheur observee>",
  "calibre": "<description du calibre/taille>",
  "defauts": ["<defaut1>", "<defaut2>"],
  "recommandation": "<ACHETER|NEGOCIER|REFUSER>",
  "prixSuggere": <prix suggere en DH ou null>,
  "justification": "<explication en 2-3 phrases>",
  "conseils": ["<conseil1>", "<conseil2>"]
}`

      const text = await callAI([
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: `Analyse la qualite de cet article: ${article.nom}. Donne une recommendation d'achat.` },
            { type: "image_url", image_url: { url: `data:${capturedMime};base64,${capturedBase64}` } }
          ]
        }
      ], controller.signal)

      // Parse JSON — strip markdown fences if present
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()

      let parsed: QualiteResult
      try {
        parsed = JSON.parse(cleaned) as QualiteResult
      } catch {
        // Try to extract JSON from response
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]) as QualiteResult
        } else {
          throw new Error("FORMAT_ERROR")
        }
      }

      setResult(parsed)

      // Save to history
      const entry = {
        ...parsed,
        articleNom: article.nom,
        fournisseurNom: fournisseur?.nom ?? "Inconnu",
        date: new Date().toLocaleString("fr-MA"),
        imageUrl: capturedImage!,
      }
      setHistory(prev => [entry, ...prev].slice(0, 10))

    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg === "FORMAT_ERROR") {
        setError("Reponse IA non structuree. Reessayez — la connexion fonctionne mais le format etait inattendu.")
      } else if (msg.includes("AbortError") || msg.includes("abort") || e instanceof DOMException) {
        setError("Delai depasse (60s). Verifiez votre connexion internet et reessayez.")
      } else if (msg.includes("AI error 5")) {
        setError("Serveur IA temporairement indisponible. Reessayez dans quelques secondes.")
      } else if (msg.includes("AI error 4")) {
        setError("Probleme d'acces au service IA. Verifiez que la photo est valide et reessayez.")
      } else if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("ECONNREFUSED")) {
        setError("Pas de connexion internet. Verifiez votre reseau et reessayez.")
      } else {
        setError(`Erreur d'analyse: ${msg.slice(0, 80)}. Reessayez.`)
      }
    } finally {
      clearTimeout(timeout)
      setAnalyzing(false)
    }
  }

  const resetCapture = () => {
    setCapturedImage(null)
    setCapturedBase64(null)
    setResult(null)
    setError("")
    stopCamera()
  }

  const gradeColor = (grade: string) => {
    if (grade === "A") return "text-green-700 bg-green-100 border-green-300"
    if (grade === "B") return "text-blue-700 bg-blue-100 border-blue-300"
    if (grade === "C") return "text-amber-700 bg-amber-100 border-amber-300"
    return "text-red-700 bg-red-100 border-red-300"
  }

  const recoColor = (r: string) => {
    if (r === "ACHETER") return "bg-green-600 text-white"
    if (r === "NEGOCIER") return "bg-amber-500 text-white"
    return "bg-red-600 text-white"
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div>
        <h2 className="text-base font-bold text-foreground">Qualite IA — Analyse Produit</h2>
        <p className="text-xs text-muted-foreground">Capturez une photo pour evaluer la fraicheur et le calibre</p>
      </div>

      {/* Article + Fournisseur selectors */}
      <div className="flex flex-col gap-2">
        <ArticleCombobox
          articles={articles}
          value={selectedArticleId}
          onChange={(artId, _art) => setSelectedArticleId(artId)}
          placeholder="-- Choisir l'article a analyser *"
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            value={selectedFournisseurId}
            onChange={e => setSelectedFournisseurId(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-white text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
            <option value="">-- Fournisseur</option>
            {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
          </select>
          <input
            type="number" min="0" value={quantiteEnvisagee}
            onChange={e => setQuantiteEnvisagee(e.target.value)}
            placeholder="Qte envisagee"
            className="px-3 py-2.5 rounded-xl border border-border bg-white text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-green-400" />
        </div>
      </div>

      {/* Prix history mini card if article selected */}
      {selectedArticleId && (() => {
        const art = articles.find(a => a.id === selectedArticleId)
        if (!art?.historiquePrixAchat?.length) return null
        const hist = art.historiquePrixAchat
        const avg = hist.reduce((s, h) => s + h.prixAchat, 0) / hist.length
        const min = Math.min(...hist.map(h => h.prixAchat))
        const max = Math.max(...hist.map(h => h.prixAchat))
        return (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
            <p className="text-xs font-bold text-blue-800 mb-2">
              Historique prix — {art.nom}
              {art.nomAr && <span className="ml-1 font-normal font-arabic" dir="rtl" lang="ar">({art.nomAr})</span>}
            </p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-sm font-black text-green-700">{min.toFixed(2)} DH</p>
                <p className="text-[10px] text-muted-foreground">Min achete</p>
              </div>
              <div>
                <p className="text-sm font-black text-blue-700">{avg.toFixed(2)} DH</p>
                <p className="text-[10px] text-muted-foreground">Moyenne</p>
              </div>
              <div>
                <p className="text-sm font-black text-amber-700">{max.toFixed(2)} DH</p>
                <p className="text-[10px] text-muted-foreground">Max paye</p>
              </div>
            </div>
            <p className="text-[10px] text-blue-600 mt-1.5 font-semibold">
              Si-Mohammed peut proposer: {(min * 0.95).toFixed(2)} DH (objectif -5% du min historique)
            </p>
          </div>
        )
      })()}

      {/* Camera / Upload toggle */}
      {!capturedImage && (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setCameraMode("capture")}
            className={`py-2 rounded-xl text-xs font-bold border transition-all ${cameraMode === "capture" ? "bg-green-600 text-white border-green-600" : "bg-white text-muted-foreground border-border"}`}>
            Camera
          </button>
          <button
            onClick={() => setCameraMode("upload")}
            className={`py-2 rounded-xl text-xs font-bold border transition-all ${cameraMode === "upload" ? "bg-green-600 text-white border-green-600" : "bg-white text-muted-foreground border-border"}`}>
            Depuis galerie
          </button>
        </div>
      )}

      {/* Camera viewfinder */}
      {!capturedImage && cameraMode === "capture" && (
        <div className="flex flex-col gap-2">
          {cameraActive ? (
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-video">
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />
              {/* Overlay grid for framing */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="w-full h-full border-2 border-white/20" style={{
                  backgroundImage: "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
                  backgroundSize: "33.3% 33.3%"
                }} />
                {/* Center crop guide */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 border-2 border-green-400 rounded-xl opacity-70" />
              </div>
              <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-3">
                <button onClick={capturePhoto}
                  className="w-16 h-16 rounded-full bg-white border-4 border-green-500 shadow-lg flex items-center justify-center hover:scale-105 transition-transform">
                  <div className="w-10 h-10 rounded-full bg-green-600" />
                </button>
                <button onClick={stopCamera}
                  className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center text-white self-center">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ) : (
            <button onClick={startCamera}
              className="w-full py-12 rounded-2xl border-2 border-dashed border-border bg-muted flex flex-col items-center gap-3 text-muted-foreground hover:border-green-400 hover:bg-green-50 transition-colors">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-foreground">Activer la camera</p>
                <p className="text-xs text-muted-foreground">Pointez vers le produit a analyser</p>
              </div>
            </button>
          )}
        </div>
      )}

      {/* File upload */}
      {!capturedImage && cameraMode === "upload" && (
        <div>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-12 rounded-2xl border-2 border-dashed border-border bg-muted flex flex-col items-center gap-3 text-muted-foreground hover:border-green-400 hover:bg-green-50 transition-colors">
            <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center">
              <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-foreground">Choisir une photo</p>
              <p className="text-xs text-muted-foreground">Depuis la galerie de votre telephone</p>
            </div>
          </button>
        </div>
      )}

      {/* Captured image preview */}
      {capturedImage && (
        <div className="flex flex-col gap-3">
          <div className="relative rounded-2xl overflow-hidden aspect-video bg-black">
            <img src={capturedImage} alt="Photo produit capturee" className="w-full h-full object-cover" />
            <button
              onClick={resetCapture}
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {!result && (
            <button
              onClick={analyzeQuality}
              disabled={analyzing || !selectedArticleId}
              className="w-full py-3.5 rounded-xl font-bold text-sm bg-green-600 text-white disabled:opacity-40 flex items-center justify-center gap-2 hover:bg-green-700 transition-colors">
              {analyzing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Analyse en cours...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  Analyser la qualite avec IA
                </>
              )}
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="flex flex-col gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <div className="flex items-start gap-2 text-red-700 text-sm">
            <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
          {capturedImage && selectedArticleId && (
            <button
              onClick={() => { setError(""); analyzeQuality() }}
              className="self-start px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Reessayer l&apos;analyse
            </button>
          )}
          {!capturedImage && (
            <button onClick={() => setError("")}
              className="self-start px-3 py-1.5 rounded-lg bg-muted text-foreground text-xs font-bold">
              Fermer
            </button>
          )}
        </div>
      )}

      {/* Analysis Result */}
      {result && (
        <div className="bg-white border border-border rounded-2xl overflow-hidden">
          {/* Score header */}
          <div className={`px-5 py-4 flex items-center justify-between ${
            result.grade === "A" ? "bg-green-50 border-b border-green-200"
            : result.grade === "B" ? "bg-blue-50 border-b border-blue-200"
            : result.grade === "C" ? "bg-amber-50 border-b border-amber-200"
            : "bg-red-50 border-b border-red-200"
          }`}>
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Resultat analyse</p>
              <div className="flex items-center gap-3 mt-1">
                <span className={`text-3xl font-black border-2 px-3 py-1 rounded-xl ${gradeColor(result.grade)}`}>
                  {result.grade}
                </span>
                <div>
                  <p className="text-lg font-black text-foreground">{result.score}/100</p>
                  <p className="text-xs text-muted-foreground">
                    {articles.find(a => a.id === selectedArticleId)?.nom}
                    {articles.find(a => a.id === selectedArticleId)?.nomAr && (
                      <span className="ml-1 font-arabic" dir="rtl" lang="ar">({articles.find(a => a.id === selectedArticleId)?.nomAr})</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
            <span className={`px-4 py-2 rounded-xl text-sm font-black ${recoColor(result.recommandation)}`}>
              {result.recommandation}
            </span>
          </div>

          <div className="px-5 py-4 flex flex-col gap-4">
            {/* Score bar */}
            <div>
              <div className="flex justify-between text-xs font-semibold text-muted-foreground mb-1">
                <span>Score qualite</span>
                <span>{result.score}%</span>
              </div>
              <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    result.score >= 80 ? "bg-green-500" : result.score >= 60 ? "bg-blue-500" : result.score >= 40 ? "bg-amber-500" : "bg-red-500"
                  }`}
                  style={{ width: `${result.score}%` }}
                />
              </div>
            </div>

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-muted rounded-xl p-3">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Fraicheur</p>
                <p className="text-sm font-semibold text-foreground">{result.fraicheur}</p>
              </div>
              <div className="bg-muted rounded-xl p-3">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Calibre</p>
                <p className="text-sm font-semibold text-foreground">{result.calibre}</p>
              </div>
            </div>

            {/* Defauts */}
            {result.defauts.length > 0 && (
              <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                <p className="text-xs font-bold text-red-700 mb-2">Defauts observes</p>
                <div className="flex flex-col gap-1">
                  {result.defauts.map((d, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-red-700">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                      {d}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Prix suggere */}
            {result.prixSuggere && (
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-green-700">Prix d&apos;achat suggere</p>
                  <p className="text-[10px] text-green-600">Argumente en negociation</p>
                </div>
                <p className="text-xl font-black text-green-700">{result.prixSuggere} DH</p>
              </div>
            )}

            {/* Justification */}
            <div className="bg-muted rounded-xl px-4 py-3">
              <p className="text-xs font-bold text-foreground mb-1">Justification</p>
              <p className="text-sm text-foreground leading-relaxed">{result.justification}</p>
            </div>

            {/* Conseils */}
            {result.conseils.length > 0 && (
              <div>
                <p className="text-xs font-bold text-foreground mb-2">Conseils Si-Mohammed</p>
                <div className="flex flex-col gap-2">
                  {result.conseils.map((c, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-foreground bg-blue-50 rounded-xl px-3 py-2">
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                      {c}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Retry button */}
            <button
              onClick={resetCapture}
              className="w-full py-2.5 rounded-xl border border-border text-sm font-bold text-muted-foreground hover:bg-muted transition-colors">
              Analyser un autre produit
            </button>
          </div>
        </div>
      )}

      {/* Canvas (hidden — for capture) */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// COMPARATIF FOURNISSEURS IA
// Compare plusieurs fournisseurs : historique prix + photos + analyse IA
// ────────────────────────────────────────────────────────────────────────────

interface FournisseurEntry {
  fournisseurId: string
  fournisseurNom: string
  prixPropose: string
  quantiteDisponible: string
  qualiteNotes: string
  photoBase64?: string
  photoMime?: string
  photoUrl?: string
}

interface ComparatifResult {
  meilleurFournisseurNom: string
  classement: { nom: string; rang: number; score: number; raison: string }[]
  analyse: string
  prixNegociation: { fournisseurNom: string; prixCible: string; argument: string }[]
  recommandation: string
  risques: string[]
}

interface ComparatifFournisseursProps {
  articles: Article[]
  fournisseurs: Fournisseur[]
  user: User
}

export function ComparatifFournisseurs({ articles, fournisseurs }: ComparatifFournisseursProps) {
  const [selectedArticleId, setSelectedArticleId] = useState("")
  const [entries, setEntries] = useState<FournisseurEntry[]>([
    { fournisseurId: "", fournisseurNom: "", prixPropose: "", quantiteDisponible: "", qualiteNotes: "" },
    { fournisseurId: "", fournisseurNom: "", prixPropose: "", quantiteDisponible: "", qualiteNotes: "" },
  ])
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<ComparatifResult | null>(null)
  const [error, setError] = useState("")
  const [activeCamera, setActiveCamera] = useState<number | null>(null)
  const [priceHistoryView, setPriceHistoryView] = useState(false)

  const videoRefs = useRef<(HTMLVideoElement | null)[]>([null, null, null, null])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([null, null, null, null])
  const streamRef = useRef<MediaStream | null>(null)

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setActiveCamera(null)
  }, [])

  useEffect(() => { return () => stopCamera() }, [stopCamera])

  const updateEntry = (i: number, patch: Partial<FournisseurEntry>) => {
    setEntries(prev => {
      const updated = [...prev]
      updated[i] = { ...updated[i], ...patch }
      if ("fournisseurId" in patch && patch.fournisseurId) {
        const f = fournisseurs.find(ff => ff.id === patch.fournisseurId)
        if (f) updated[i].fournisseurNom = f.nom
      }
      return updated
    })
  }

  const addEntry = () => {
    if (entries.length >= 5) return
    setEntries(prev => [...prev, { fournisseurId: "", fournisseurNom: "", prixPropose: "", quantiteDisponible: "", qualiteNotes: "" }])
  }

  const startCameraForEntry = async (i: number) => {
    setError("")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      streamRef.current = stream
      if (videoRefs.current[i]) {
        videoRefs.current[i]!.srcObject = stream
        videoRefs.current[i]!.play()
      }
      setActiveCamera(i)
    } catch {
      setError("Camera non disponible. Utilisez la galerie.")
    }
  }

  const captureForEntry = (i: number) => {
    if (!videoRefs.current[i] || !canvasRef.current) return
    const video = videoRefs.current[i]!
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext("2d")!
    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85)
    updateEntry(i, { photoUrl: dataUrl, photoBase64: dataUrl.split(",")[1], photoMime: "image/jpeg" })
    stopCamera()
  }

  const handleFileForEntry = async (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const photoUrl = URL.createObjectURL(file)
    const b64 = await fileToBase64(file)
    updateEntry(i, { photoUrl, photoBase64: b64, photoMime: file.type || "image/jpeg" })
  }

  const analyzeComparatif = async () => {
    const filled = entries.filter(e => e.fournisseurId && e.prixPropose)
    if (filled.length < 2) {
      setError("Selectionnez au moins 2 fournisseurs avec leurs prix.")
      return
    }

    const article = articles.find(a => a.id === selectedArticleId)
    if (!article) { setError("Selectionnez un article."); return }

    const histPrix = article.historiquePrixAchat ?? []
    const prixMoyen = histPrix.length
      ? (histPrix.reduce((s, h) => s + h.prixAchat, 0) / histPrix.length).toFixed(2)
      : article.prixAchat.toFixed(2)

    setAnalyzing(true)
    setError("")
    setResult(null)

    try {
      // Build message content — include photos if available
      const fournisseursInfo = filled.map((e, i) => {
        const hist = histPrix.filter(h => h.fournisseurId === e.fournisseurId)
        const histStr = hist.length
          ? `Historique: min ${Math.min(...hist.map(h => h.prixAchat)).toFixed(2)} / moy ${(hist.reduce((s, h) => s + h.prixAchat, 0) / hist.length).toFixed(2)} / max ${Math.max(...hist.map(h => h.prixAchat)).toFixed(2)} DH`
          : "Pas d'historique"
        return `Fournisseur ${i + 1}: ${e.fournisseurNom}
  - Prix propose: ${e.prixPropose} DH/${article.unite}
  - Quantite disponible: ${e.quantiteDisponible || "Non specifiee"}
  - Notes qualite: ${e.qualiteNotes || "Aucune"}
  - ${histStr}`
      }).join("\n\n")

      const systemPrompt = `Tu es ASHEL, expert IA en sourcing et negociation d'achat pour FreshLink Pro.

ARTICLE: ${article.nom} (${article.unite})
PRIX MOYEN HISTORIQUE: ${prixMoyen} DH/${article.unite}
PRIX ACTUEL EN STOCK: ${article.prixAchat} DH/${article.unite}

FOURNISSEURS COMPARES:
${fournisseursInfo}

${filled.some(e => e.photoBase64) ? "Des photos des produits sont incluses dans cette analyse." : ""}

Fais une analyse comparative experte et reponds UNIQUEMENT en JSON valide:
{
  "meilleurFournisseurNom": "<nom du meilleur>",
  "classement": [
    { "nom": "<nom>", "rang": 1, "score": <0-100>, "raison": "<raison courte>" }
  ],
  "analyse": "<analyse comparative en 3-4 phrases>",
  "prixNegociation": [
    { "fournisseurNom": "<nom>", "prixCible": "<prix a viser en DH>", "argument": "<argument de negociation>" }
  ],
  "recommandation": "<recommandation finale en 2-3 phrases>",
  "risques": ["<risque1>", "<risque2>"]
}`

      // Build content array — text + photos
      const contentParts: unknown[] = [{ type: "text", text: `Compare ces ${filled.length} fournisseurs pour ${article.nom}.` }]
      filled.forEach((e, i) => {
        if (e.photoBase64 && e.photoMime) {
          contentParts.push({ type: "text", text: `Photo fournisseur ${i + 1} — ${e.fournisseurNom}:` })
          contentParts.push({ type: "image_url", image_url: { url: `data:${e.photoMime};base64,${e.photoBase64}` } })
        }
      })

      const text = await callAI([
        { role: "system", content: systemPrompt },
        { role: "user", content: contentParts }
      ])

      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
      const parsed = JSON.parse(cleaned) as ComparatifResult
      setResult(parsed)
    } catch {
      setError("Erreur d'analyse comparative. Reessayez.")
    } finally {
      setAnalyzing(false)
    }
  }

  const article = articles.find(a => a.id === selectedArticleId)
  const histByFournisseur = article?.historiquePrixAchat
    ? fournisseurs.map(f => {
        const hist = article.historiquePrixAchat!.filter(h => h.fournisseurId === f.id)
        if (!hist.length) return null
        return {
          fournisseurNom: f.nom,
          dernierPrix: hist[hist.length - 1].prixAchat,
          moyennePrix: hist.reduce((s, h) => s + h.prixAchat, 0) / hist.length,
          minPrix: Math.min(...hist.map(h => h.prixAchat)),
          nbAchats: hist.length,
        }
      }).filter(Boolean)
    : []

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-bold text-foreground">Comparatif Fournisseurs</h2>
        <p className="text-xs text-muted-foreground">Comparez les offres avec historique prix et photos IA</p>
      </div>

      {/* Article selector */}
      <ArticleCombobox
        articles={articles}
        value={selectedArticleId}
        onChange={(artId, _art) => { setSelectedArticleId(artId); setResult(null) }}
        placeholder="-- Choisir l'article a comparer *"
      />

      {/* Price history for this article */}
      {selectedArticleId && histByFournisseur.length > 0 && (
        <div>
          <button
            onClick={() => setPriceHistoryView(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold">
            <span>Historique prix par fournisseur ({histByFournisseur.length})</span>
            <svg className={`w-4 h-4 transition-transform ${priceHistoryView ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {priceHistoryView && (
            <div className="mt-2 flex flex-col gap-2">
              {histByFournisseur.map((h) => h && (
                <div key={h.fournisseurNom} className="bg-white border border-border rounded-xl px-4 py-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-sm font-bold text-foreground">{h.fournisseurNom}</p>
                    <span className="text-xs text-muted-foreground">{h.nbAchats} achat(s)</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-sm font-black text-green-700">{h.minPrix.toFixed(2)} DH</p>
                      <p className="text-[10px] text-muted-foreground">Min</p>
                    </div>
                    <div>
                      <p className="text-sm font-black text-blue-700">{h.moyennePrix.toFixed(2)} DH</p>
                      <p className="text-[10px] text-muted-foreground">Moy</p>
                    </div>
                    <div>
                      <p className="text-sm font-black text-foreground">{h.dernierPrix.toFixed(2)} DH</p>
                      <p className="text-[10px] text-muted-foreground">Dernier</p>
                    </div>
                  </div>
                  {/* Mini bar */}
                  <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min(100, (h.minPrix / (h.moyennePrix * 1.2)) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Fournisseur entries */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-foreground">Fournisseurs a comparer ({entries.length}/5)</p>
          {entries.length < 5 && (
            <button onClick={addEntry} className="text-xs text-green-600 font-bold flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Ajouter
            </button>
          )}
        </div>

        {entries.map((entry, i) => (
          <div key={i} className="bg-white border border-border rounded-2xl overflow-hidden">
            <div className="px-4 py-3 bg-muted border-b border-border flex items-center justify-between">
              <p className="text-xs font-black text-muted-foreground">Fournisseur {i + 1}</p>
              {entries.length > 2 && (
                <button onClick={() => setEntries(prev => prev.filter((_, j) => j !== i))}
                  className="text-xs text-red-500 font-semibold">Supprimer</button>
              )}
            </div>
            <div className="px-4 py-3 flex flex-col gap-2.5">
              <select
                value={entry.fournisseurId}
                onChange={e => updateEntry(i, { fournisseurId: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-border bg-muted text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
                <option value="">-- Fournisseur *</option>
                {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
              </select>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">
                    Prix propose (DH/{article?.unite ?? "unite"}) *
                  </label>
                  <input type="number" min="0" step="0.01" value={entry.prixPropose}
                    onChange={e => updateEntry(i, { prixPropose: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-2.5 py-2 rounded-xl border border-border bg-muted text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-green-400" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Qte disponible</label>
                  <input type="number" min="0" value={entry.quantiteDisponible}
                    onChange={e => updateEntry(i, { quantiteDisponible: e.target.value })}
                    placeholder="Qte"
                    className="w-full px-2.5 py-2 rounded-xl border border-border bg-muted text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-green-400" />
                </div>
              </div>

              <input type="text" value={entry.qualiteNotes}
                onChange={e => updateEntry(i, { qualiteNotes: e.target.value })}
                placeholder="Notes qualite observee (couleur, fraicheur, calibre...)"
                className="w-full px-3 py-2 rounded-xl border border-border bg-muted text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-green-400" />

              {/* Photo section */}
              <div>
                {entry.photoUrl ? (
                  <div className="relative rounded-xl overflow-hidden aspect-video">
                    <img src={entry.photoUrl} alt={`Photo fournisseur ${i + 1}`} className="w-full h-full object-cover" />
                    <button
                      onClick={() => updateEntry(i, { photoUrl: undefined, photoBase64: undefined })}
                      className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : activeCamera === i ? (
                  <div className="relative rounded-xl overflow-hidden aspect-video bg-black">
                    <video ref={el => { videoRefs.current[i] = el }} playsInline muted autoPlay className="w-full h-full object-cover" />
                    <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-2">
                      <button onClick={() => captureForEntry(i)}
                        className="w-12 h-12 rounded-full bg-white border-4 border-green-500 flex items-center justify-center shadow-lg">
                        <div className="w-7 h-7 rounded-full bg-green-600" />
                      </button>
                      <button onClick={stopCamera}
                        className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white self-center">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input ref={el => { fileInputRefs.current[i] = el }} type="file" accept="image/*"
                      onChange={e => handleFileForEntry(i, e)} className="hidden" />
                    <button onClick={() => startCameraForEntry(i)}
                      className="flex-1 py-2 rounded-xl border border-border text-xs font-semibold text-muted-foreground flex items-center justify-center gap-1.5 hover:bg-muted transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Camera
                    </button>
                    <button onClick={() => fileInputRefs.current[i]?.click()}
                      className="flex-1 py-2 rounded-xl border border-border text-xs font-semibold text-muted-foreground flex items-center justify-center gap-1.5 hover:bg-muted transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Galerie
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      <button
        onClick={analyzeComparatif}
        disabled={analyzing || !selectedArticleId || entries.filter(e => e.fournisseurId && e.prixPropose).length < 2}
        className="w-full py-3.5 rounded-xl font-bold text-sm bg-green-600 text-white disabled:opacity-40 flex items-center justify-center gap-2 hover:bg-green-700 transition-colors">
        {analyzing ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Analyse comparative en cours...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Comparer avec IA
          </>
        )}
      </button>

      {/* Comparison Result */}
      {result && (
        <div className="flex flex-col gap-3">
          {/* Winner */}
          <div className="bg-green-50 border border-green-300 rounded-2xl px-5 py-4">
            <p className="text-xs font-bold text-green-700 uppercase tracking-wider mb-1">Meilleur choix</p>
            <p className="text-xl font-black text-green-800">{result.meilleurFournisseurNom}</p>
            <p className="text-sm text-green-700 mt-1 leading-relaxed">{result.recommandation}</p>
          </div>

          {/* Classement */}
          <div className="bg-white border border-border rounded-2xl overflow-hidden">
            <div className="px-4 py-3 bg-muted border-b border-border">
              <p className="text-xs font-bold text-foreground">Classement</p>
            </div>
            <div className="divide-y divide-border">
              {result.classement.sort((a, b) => a.rang - b.rang).map(c => (
                <div key={c.nom} className="flex items-center gap-3 px-4 py-3">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                    c.rang === 1 ? "bg-amber-400 text-white" : c.rang === 2 ? "bg-slate-300 text-slate-700" : "bg-slate-200 text-slate-500"
                  }`}>{c.rang}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{c.nom}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.raison}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-black text-foreground">{c.score}/100</p>
                    <div className="w-16 h-1.5 bg-muted rounded-full mt-1">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${c.score}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Analyse */}
          <div className="bg-muted rounded-2xl px-4 py-4">
            <p className="text-xs font-bold text-foreground mb-2">Analyse ASHEL</p>
            <p className="text-sm text-foreground leading-relaxed">{result.analyse}</p>
          </div>

          {/* Prix cibles pour negociation */}
          <div className="bg-white border border-border rounded-2xl overflow-hidden">
            <div className="px-4 py-3 bg-amber-50 border-b border-amber-100">
              <p className="text-xs font-bold text-amber-800">Prix cibles pour negociation</p>
            </div>
            <div className="divide-y divide-border">
              {result.prixNegociation.map(p => (
                <div key={p.fournisseurNom} className="px-4 py-3 flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-foreground">{p.fournisseurNom}</p>
                    <span className="text-sm font-black text-green-700">{p.prixCible} DH</span>
                  </div>
                  <p className="text-xs text-muted-foreground italic">{p.argument}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Risques */}
          {result.risques.length > 0 && (
            <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
              <p className="text-xs font-bold text-red-700 mb-2">Risques identifies</p>
              {result.risques.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-red-700 mb-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 mt-1.5" />
                  {r}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// NOUVEAU FOURNISSEUR — creation terrain par l'acheteur
// Flux : 1) type de fournisseur  2) coordonnees  3) capture GPS + confirmation
// "êtes-vous chez le fournisseur ?" — si non, le point GPS (position actuelle
// de l'acheteur, pas celle du fournisseur) est quand meme enregistre mais
// marque comme non verifie pour que le BO sache qu'il faut le corriger.
// ────────────────────────────────────────────────────────────────────────────

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
