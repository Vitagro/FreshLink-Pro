"use client"
// @ts-ignore — shared AI helper
import { callLLM, triggerN3Alert } from "@/lib/ai"
import { useState, useRef, useCallback } from "react"

interface AnalysisResult {
  isMarchandise: boolean
  etat: "excellent" | "bon" | "moyen" | "degrade" | "expire"
  shelfLifeEstime: string
  prixSuggest: number | null
  recommandation: string
  details: string
}

interface Props {
  articleNom?: string
  onValidate?: (result: AnalysisResult, photoBase64: string) => void
  onCancel?: () => void
}

export default function CameraIARetour({ articleNom, onValidate, onCancel }: Props) {
  const videoRef    = useRef<HTMLVideoElement>(null)
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const streamRef   = useRef<MediaStream | null>(null)

  const [step, setStep]         = useState<"start"|"camera"|"preview"|"analysing"|"result">("start")
  const [photo, setPhoto]       = useState<string | null>(null)
  const [result, setResult]     = useState<AnalysisResult | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [prixAchat, setPrixAchat] = useState("")

  const startCamera = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play() }
      setStep("camera")
    } catch {
      setError("Camera inaccessible. Verifiez les permissions.")
    }
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  const takePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return
    const w = videoRef.current.videoWidth
    const h = videoRef.current.videoHeight
    canvasRef.current.width  = w
    canvasRef.current.height = h
    canvasRef.current.getContext("2d")?.drawImage(videoRef.current, 0, 0, w, h)
    const b64 = canvasRef.current.toDataURL("image/jpeg", 0.85)
    setPhoto(b64)
    stopCamera()
    setStep("preview")
  }, [stopCamera])

  async function analysePhoto() {
    if (!photo) return
    setStep("analysing")
    setError(null)
    try {
      const base64Data = photo.split(",")[1]
      const res = await fetch("https://llm.blackbox.ai/chat/completions", {
        method: "POST",
        headers: {
          // blackbox-legacy-key — move to env var BLACKBOX_CUSTOMER_ID
          "Content-Type": "application/json",
          // blackbox-legacy-auth — move to env var BLACKBOX_API_KEY
        },
        body: JSON.stringify({
          model: "openrouter/claude-sonnet-4",
          messages: [
            {
              role: "system",
              content: `Tu es un expert qualite pour une societe de distribution de fruits et legumes.
Analyse la photo fournie et reponds en JSON pur (aucun texte hors JSON) avec ce format exact:
{
  "isMarchandise": boolean,
  "etat": "excellent"|"bon"|"moyen"|"degrade"|"expire",
  "shelfLifeEstime": "X jours" ou "< 24h" ou "expire",
  "prixSuggest": nombre ou null,
  "recommandation": "courte recommandation en francais",
  "details": "description visuelle du produit"
}
Article concerne: ${articleNom ?? "fruits ou legumes"}.
Prix achat reference: ${prixAchat || "inconnu"} MAD/kg.
Sois precis sur: fraicheur, couleur, texture visible, signes de degradation.`
            },
            {
              role: "user",
              content: [
                { type: "text", text: "Analyse ce retour produit et donne moi le JSON d'evaluation qualite." },
                { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Data}` } }
              ]
            }
          ],
          max_tokens: 500,
        })
      })

      if (!res.ok) throw new Error(`API erreur ${res.status}`)
      const data = await res.json()
      const content = data.choices?.[0]?.message?.content ?? ""
      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error("Format de reponse invalide")
      const parsed: AnalysisResult = JSON.parse(jsonMatch[0])
      setResult(parsed)
      setStep("result")
    } catch (e) {
      setError(`Analyse echouee: ${e instanceof Error ? e.message : "erreur inconnue"}`)
      setStep("preview")
    }
  }

  const etatColor = (etat: AnalysisResult["etat"]) => {
    if (etat === "excellent") return "bg-green-100 text-green-800 border-green-300"
    if (etat === "bon")       return "bg-emerald-100 text-emerald-800 border-emerald-300"
    if (etat === "moyen")     return "bg-amber-100 text-amber-800 border-amber-300"
    if (etat === "degrade")   return "bg-orange-100 text-orange-800 border-orange-300"
    return                          "bg-red-100 text-red-800 border-red-300"
  }

  return (
    <div className="flex flex-col gap-4 p-4 max-w-md mx-auto">
      <canvas ref={canvasRef} className="hidden" />

      {/* Start */}
      {step === "start" && (
        <div className="flex flex-col items-center gap-5 py-8">
          <div className="w-20 h-20 rounded-full bg-blue-100 border-2 border-blue-300 flex items-center justify-center">
            <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div className="text-center">
            <h3 className="font-bold text-foreground">Analyse IA — Retour produit</h3>
            {articleNom && <p className="text-sm text-muted-foreground mt-1">Article : <strong>{articleNom}</strong></p>}
            <p className="text-xs text-muted-foreground mt-2">Prenez une photo du retour. L&apos;IA analysera la qualite, le shelf life et proposera un prix.</p>
          </div>
          <div className="w-full">
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Prix d&apos;achat (MAD/kg) — optionnel</label>
            <input type="number" value={prixAchat} onChange={e=>setPrixAchat(e.target.value)} placeholder="ex: 3.50"
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div className="flex gap-3 w-full">
            {onCancel && (
              <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground">Annuler</button>
            )}
            <button onClick={startCamera} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: "oklch(0.38 0.18 260)" }}>
              Ouvrir camera
            </button>
          </div>
        </div>
      )}

      {/* Camera */}
      {step === "camera" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-bold text-foreground text-center">Cadrez le produit retourne</p>
          <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3]">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            <div className="absolute inset-0 border-2 border-dashed border-white/40 rounded-2xl pointer-events-none" />
          </div>
          <div className="flex gap-3">
            <button onClick={() => { stopCamera(); setStep("start") }}
              className="flex-1 py-3 rounded-xl border border-border text-sm font-semibold text-muted-foreground">Annuler</button>
            <button onClick={takePhoto}
              className="flex-1 py-3 rounded-xl text-sm font-bold text-white" style={{ background: "oklch(0.38 0.18 260)" }}>
              Prendre photo
            </button>
          </div>
        </div>
      )}

      {/* Preview */}
      {step === "preview" && photo && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-bold text-foreground text-center">Photo prise</p>
          <img src={photo} alt="Photo retour produit" className="rounded-2xl w-full object-cover aspect-[4/3]" />
          {error && <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">{error}</div>}
          <div className="flex gap-3">
            <button onClick={() => setStep("start")}
              className="flex-1 py-3 rounded-xl border border-border text-sm font-semibold text-muted-foreground">Reprendre</button>
            <button onClick={analysePhoto}
              className="flex-1 py-3 rounded-xl text-sm font-bold text-white" style={{ background: "oklch(0.65 0.17 145)" }}>
              Analyser avec IA
            </button>
          </div>
        </div>
      )}

      {/* Analysing */}
      {step === "analysing" && (
        <div className="flex flex-col items-center gap-4 py-12">
          <div className="w-14 h-14 rounded-full border-4 border-t-transparent animate-spin"
            style={{ borderColor: "oklch(0.65 0.17 145)", borderTopColor: "transparent" }} />
          <p className="font-semibold text-foreground text-sm">Analyse IA en cours...</p>
          <p className="text-xs text-muted-foreground text-center">Evaluation de la qualite, shelf life et prix recommande</p>
          {photo && <img src={photo} alt="Photo en cours d'analyse" className="rounded-xl w-40 h-32 object-cover opacity-50" />}
        </div>
      )}

      {/* Result */}
      {step === "result" && result && photo && (
        <div className="flex flex-col gap-4">
          <p className="text-sm font-bold text-foreground text-center">Resultat analyse IA</p>
          <div className="flex gap-3">
            <img src={photo} alt="Photo analysee" className="w-24 h-20 rounded-xl object-cover shrink-0" />
            <div className="flex-1 flex flex-col gap-1.5">
              <span className={`self-start text-[11px] px-2.5 py-1 rounded-full border font-bold ${etatColor(result.etat)}`}>
                Etat : {result.etat}
              </span>
              <p className="text-xs text-muted-foreground">
                Notre marchandise : <strong className={result.isMarchandise ? "text-green-600" : "text-red-600"}>
                  {result.isMarchandise ? "Oui" : "Non"}
                </strong>
              </p>
              <p className="text-xs text-muted-foreground">
                Shelf life : <strong className="text-foreground">{result.shelfLifeEstime}</strong>
              </p>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-2.5">
            <p className="text-xs font-bold text-foreground">Recommandation IA</p>
            <p className="text-sm text-foreground">{result.recommandation}</p>
            <p className="text-xs text-muted-foreground">{result.details}</p>
            {result.prixSuggest && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 mt-1">
                <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                <span className="text-sm font-bold text-amber-800">
                  Prix de vente suggere : {result.prixSuggest} MAD
                </span>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep("start")}
              className="flex-1 py-3 rounded-xl border border-border text-sm font-semibold text-muted-foreground">Refaire</button>
            {onValidate && (
              <button onClick={() => onValidate(result, photo)}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-white" style={{ background: "oklch(0.65 0.17 145)" }}>
                Valider & Enregistrer
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
