"use client"

import { useState, useEffect, useRef } from "react"
import { store, type User, type BonAchat, type Article, type ContenantTare } from "@/lib/store"

interface Props { user: User }

interface ScanEntry {
  articleId: string
  articleNom: string
  unite: string
  um?: string
  colisageParUM?: number
  qteAttendue: number
  qteBesoin: number
  qteScannee: string
  conforme: boolean | null
  nbCaisseGros: string
  nbCaisseDemi: string
  typePoids: "brut" | "net"
  poidsContenants: ContenantTare[]
  photos: string[]          // base64 data URLs — min 1 required per article
}

// ── Camera capture hook ────────────────────────────────────────────────────
function useCameraCapture() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [active, setActive] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const start = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
      setActive(true)
    } catch {
      setError("Camera non disponible. Autorisez l'acces camera et reessayez.")
    }
  }

  const stop = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setActive(false)
  }

  const capture = (): string | null => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return null
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    ctx.drawImage(video, 0, 0)
    return canvas.toDataURL("image/jpeg", 0.82)
  }

  return { videoRef, canvasRef, active, error, start, stop, capture }
}

export default function MobileControlAchat({ user }: Props) {
  const [bons, setBons] = useState<BonAchat[]>([])
  const [articles, setArticles] = useState<Article[]>([])
  const [entries, setEntries] = useState<ScanEntry[]>([])
  const [selectedBonId, setSelectedBonId] = useState<string>("all")
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [notes, setNotes] = useState("")
  const [contenants, setContenants] = useState<ContenantTare[]>([])

  // Camera state
  const cam = useCameraCapture()
  const [camTarget, setCamTarget] = useState<string | null>(null) // articleId currently being photographed

  useEffect(() => {
    const allArts = store.getArticles()
    const todayBons = store.getBonsAchat().filter(b => b.date === store.today())
    const allContenants = store.getContenantsConfig().filter(c => c.actif)
    setArticles(allArts)
    setBons(todayBons)
    setContenants(allContenants)
    buildEntries(todayBons, allArts, "all", allContenants)
  }, [])

  function buildEntries(todayBons: BonAchat[], allArts: Article[], bonFilter: string, allContenants: ContenantTare[]) {
    const sourceBons = bonFilter === "all" ? todayBons : todayBons.filter(b => b.id === bonFilter)
    const besoinMap: Record<string, number> = {}
    try { store.computeBesoinNet().forEach(b => { besoinMap[b.articleId] = b.commandeQty }) } catch { /* noop */ }

    const map: Record<string, ScanEntry> = {}
    sourceBons.forEach(bon => {
      bon.lignes.forEach(l => {
        if (!map[l.articleId]) {
          const art = allArts.find(a => a.id === l.articleId)
          map[l.articleId] = {
            articleId: l.articleId, articleNom: l.articleNom,
            unite: art?.unite ?? "kg", um: art?.um, colisageParUM: art?.colisageParUM,
            qteAttendue: 0, qteBesoin: besoinMap[l.articleId] ?? 0,
            qteScannee: "", conforme: null,
            nbCaisseGros: "", nbCaisseDemi: "", typePoids: "brut",
            poidsContenants: allContenants, photos: [],
          }
        }
        map[l.articleId].qteAttendue += l.quantite
      })
    })
    setEntries(Object.values(map))
  }

  const handleBonFilter = (bonId: string) => {
    setSelectedBonId(bonId)
    buildEntries(bons, articles, bonId, contenants)
  }

  function calcPoidsNet(e: ScanEntry): number {
    const brut = Number(e.qteScannee)
    if (isNaN(brut) || e.typePoids === "net") return brut
    const grossType = e.poidsContenants.find(c => c.nom.toLowerCase().includes("gros") || c.nom.toLowerCase().includes("plastique"))
    const demiType  = e.poidsContenants.find(c => c.nom.toLowerCase().includes("demi") || c.nom.toLowerCase().includes("petit"))
    const tare = (Number(e.nbCaisseGros) || 0) * (grossType?.poidsKg ?? 2.8)
              + (Number(e.nbCaisseDemi) || 0) * (demiType?.poidsKg ?? 2.0)
    return Math.max(0, brut - tare)
  }

  const updateEntry = (artId: string, field: keyof ScanEntry, value: string) => {
    setEntries(prev => prev.map(e => {
      if (e.articleId !== artId) return e
      const updated = { ...e, [field]: value }
      if (["qteScannee","nbCaisseGros","nbCaisseDemi","typePoids"].includes(field as string)) {
        const effectiveQty = updated.typePoids === "net" ? Number(updated.qteScannee) : calcPoidsNet(updated as ScanEntry)
        const conforme = updated.qteScannee === "" ? null : Math.abs(effectiveQty - e.qteAttendue) <= e.qteAttendue * 0.02
        return { ...updated, conforme } as ScanEntry
      }
      return updated as ScanEntry
    }))
  }

  // ── Camera actions ─────────────────────────────────────────────────────────
  const openCamera = async (artId: string) => {
    setCamTarget(artId)
    await cam.start()
  }

  const capturePhoto = () => {
    const dataUrl = cam.capture()
    if (!dataUrl || !camTarget) return
    setEntries(prev => prev.map(e =>
      e.articleId === camTarget ? { ...e, photos: [...e.photos, dataUrl] } : e
    ))
  }

  const closeCamera = () => {
    cam.stop()
    setCamTarget(null)
  }

  const removePhoto = (artId: string, idx: number) => {
    setEntries(prev => prev.map(e =>
      e.articleId === artId ? { ...e, photos: e.photos.filter((_, i) => i !== idx) } : e
    ))
  }

  // Camera contrôle achat désactivable depuis BO Settings → Process → Achat
  // ("Contrôle achat" / cameraControlAchat) — défaut activé si jamais réglé.
  const photoRequise = store.getProcessConfig().cameraControlAchat !== false

  const allQtyFilled = entries.length > 0 && entries.every(e => e.qteScannee !== "")
  const allPhotosTaken = !photoRequise || entries.every(e => e.photos.length >= 1)
  const canSubmit = allQtyFilled && allPhotosTaken
  const anomalies = entries.filter(e => e.conforme === false)
  const conformes = entries.filter(e => e.conforme === true)

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    const now = new Date()
    let totalGros = 0, totalDemi = 0
    const reportEntries = entries.map(e => {
      const brutQty = Number(e.qteScannee)
      const netQty = e.typePoids === "net" ? brutQty : calcPoidsNet(e)
      const gros = Number(e.nbCaisseGros) || 0
      const demi = Number(e.nbCaisseDemi) || 0
      totalGros += gros; totalDemi += demi
      return {
        articleId: e.articleId, articleNom: e.articleNom, unite: e.unite,
        qteAttendue: e.qteAttendue, qteBrute: brutQty, qteNette: netQty,
        typePoids: e.typePoids, nbCaisseGros: gros, nbCaisseDemi: demi,
        conforme: e.conforme, ecart: netQty - e.qteAttendue,
        photos: e.photos,
      }
    })
    const report = {
      id: store.genId(), date: store.today(), heure: now.toTimeString().slice(0, 5),
      type: "ctrl_achat_chargement", controlleurId: user.id, controlleurNom: user.name,
      entries: reportEntries, notes, anomalies: anomalies.length,
      totalCaisseGros: totalGros, totalCaisseDemi: totalDemi,
    }
    try {
      const existing = JSON.parse(localStorage.getItem("fl_ctrl_rapports") ?? "[]")
      existing.push(report)
      localStorage.setItem("fl_ctrl_rapports", JSON.stringify(existing))
    } catch { /* noop */ }
    if (totalGros > 0 || totalDemi > 0) {
      store.addCaisseMouvement({
        id: store.genId(), date: store.today(), heure: now.toTimeString().slice(0, 5),
        typeOperation: "ctrl_achat", sens: "sortie",
        nbCaisseGros: totalGros, nbCaisseDemi: totalDemi,
        referenceDoc: report.id, operateurId: user.id, operateurNom: user.name,
        notes: "Chargement vehicule — ctrl achat",
      })
    }
    await new Promise(r => setTimeout(r, 500))
    setSubmitting(false)
    setSubmitted(true)
  }

  // ── Camera overlay ─────────────────────────────────────────────────────────
  if (cam.active && camTarget) {
    const artNom = entries.find(e => e.articleId === camTarget)?.articleNom ?? ""
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-white font-bold text-sm">{artNom}</p>
            <p className="text-gray-400 text-xs">Prenez au moins 1 photo de la caisse</p>
          </div>
          <button onClick={closeCamera} className="text-white bg-gray-800 rounded-full p-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <video ref={cam.videoRef} autoPlay playsInline muted className="flex-1 object-cover w-full" />
        <canvas ref={cam.canvasRef} className="hidden" />
        <div className="flex flex-col items-center gap-3 px-4 py-5 bg-black">
          {entries.find(e => e.articleId === camTarget)?.photos.length ? (
            <div className="flex gap-2 overflow-x-auto w-full pb-1">
              {entries.find(e => e.articleId === camTarget)!.photos.map((p, i) => (
                <img key={i} src={p} alt={`Photo ${i+1}`} className="h-16 w-16 rounded-xl object-cover shrink-0 border-2 border-green-400" />
              ))}
            </div>
          ) : null}
          <div className="flex gap-3 w-full">
            <button onClick={capturePhoto}
              className="flex-1 py-4 rounded-2xl font-bold text-black text-sm flex items-center justify-center gap-2"
              style={{ background: "white" }}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Prendre photo
            </button>
            {(entries.find(e => e.articleId === camTarget)?.photos.length ?? 0) >= 1 && (
              <button onClick={closeCamera}
                className="flex-1 py-4 rounded-2xl font-bold text-white text-sm"
                style={{ background: "oklch(0.38 0.2 145)" }}>
                Confirmer
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Success screen ─────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="p-4 flex flex-col gap-4 font-sans">
        <div className="bg-green-50 border border-green-200 rounded-2xl p-6 flex flex-col items-center gap-3 text-center">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-base font-bold text-green-800">Controle de chargement valide</p>
          <p className="text-sm text-green-700">
            {conformes.length} article(s) conforme(s){anomalies.length > 0 ? `, ${anomalies.length} anomalie(s) signalee(s)` : " — aucune anomalie"}
          </p>
          <button onClick={() => { setSubmitted(false); setEntries([]); setNotes(""); buildEntries(bons, articles, "all", contenants) }}
            className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-primary">
            Nouveau controle
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 flex flex-col gap-4 font-sans">
      <div>
        <h2 className="text-lg font-bold text-foreground">Controle Chargement Marche</h2>
        <p className="text-sm text-muted-foreground">
          Quantites{photoRequise ? " + photo obligatoire" : ""} par article — {store.today()}
        </p>
      </div>

      {cam.error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{cam.error}</div>
      )}

      {bons.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-10 flex flex-col items-center gap-3 text-center">
          <svg className="w-10 h-10 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <p className="text-sm font-semibold text-muted-foreground">Aucun bon d'achat valide aujourd'hui</p>
        </div>
      ) : (
        <>
          {/* Bon filter */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-foreground uppercase tracking-wide">Filtrer par bon d&apos;achat</label>
            <select value={selectedBonId} onChange={e => handleBonFilter(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="all">Tous les bons du jour ({bons.length})</option>
              {bons.map(b => (
                <option key={b.id} value={b.id}>{b.fournisseurNom} — {b.lignes.length} art. — {b.id.slice(-6)}</option>
              ))}
            </select>
          </div>

          {/* Progress bar */}
          <div className="flex gap-2">
            {[
              { label: "A controler", val: entries.length, bg: "bg-blue-50 border-blue-200", txt: "text-blue-800" },
              { label: "Qty OK", val: entries.filter(e=>e.qteScannee!=="").length, bg: "bg-green-50 border-green-200", txt: "text-green-800" },
              ...(photoRequise ? [{ label: "Photos OK", val: entries.filter(e=>e.photos.length>=1).length, bg: "bg-purple-50 border-purple-200", txt: "text-purple-800" }] : []),
              { label: "Anomalies", val: anomalies.length, bg: "bg-red-50 border-red-200", txt: "text-red-800" },
            ].map(s => (
              <div key={s.label} className={`flex-1 min-w-0 border rounded-xl px-2 py-2 text-center ${s.bg}`}>
                <p className={`text-[10px] ${s.txt}`}>{s.label}</p>
                <p className={`text-base font-black ${s.txt}`}>{s.val}</p>
              </div>
            ))}
          </div>

          {/* Article cards */}
          <div className="flex flex-col gap-3">
            {entries.map(e => {
              const scanned = Number(e.qteScannee)
              const ecart = e.qteScannee !== "" ? scanned - e.qteAttendue : null
              const qteUM = e.um && e.colisageParUM ? (e.qteAttendue / e.colisageParUM).toFixed(1) : null
              const hasPhoto = e.photos.length >= 1

              return (
                <div key={e.articleId}
                  className={`rounded-2xl border p-4 flex flex-col gap-3 transition-colors ${
                    e.conforme === true && (!photoRequise || hasPhoto) ? "border-green-300 bg-green-50" :
                    e.conforme === false ? "border-red-300 bg-red-50" :
                    "border-border bg-card"
                  }`}>

                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="font-bold text-sm text-foreground">{e.articleNom}</p>
                      <p className="text-xs text-muted-foreground">
                        Achete : <strong>{e.qteAttendue} {e.unite}</strong>
                        {qteUM && <span className="ml-2 text-blue-600">= {qteUM} {e.um}</span>}
                      </p>
                      {e.qteBesoin > 0 && (() => {
                        const diff = e.qteAttendue - e.qteBesoin
                        if (diff === 0) return null
                        const isMoins = diff < 0
                        return (
                          <div className={`mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isMoins ? "bg-orange-100 text-orange-800 border border-orange-300"
                                    : "bg-blue-100 text-blue-800 border border-blue-300"
                          }`}>
                            {isMoins ? "▼ Moins" : "▲ Plus"} que besoin : {isMoins?"":"+"}{diff.toFixed(1)} {e.unite}
                            {" "}(besoin : {e.qteBesoin} {e.unite})
                          </div>
                        )
                      })()}
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      {e.conforme === true && <span className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center"><svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg></span>}
                      {e.conforme === false && <span className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center"><svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg></span>}
                      {hasPhoto && <span className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center"><svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg></span>}
                    </div>
                  </div>

                  {/* Photo section — masquee si la camera Controle Achat est desactivee (BO Settings) */}
                  {photoRequise && (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-semibold ${hasPhoto ? "text-purple-700" : "text-red-600"}`}>
                          {hasPhoto ? `${e.photos.length} photo(s)` : "Photo obligatoire — aucune prise"}
                        </span>
                        <button onClick={() => openCamera(e.articleId)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white transition-opacity ${hasPhoto ? "opacity-80" : ""}`}
                          style={{ background: hasPhoto ? "oklch(0.5 0.18 300)" : "oklch(0.45 0.2 25)" }}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          {hasPhoto ? "Ajouter photo" : "Prendre photo"}
                        </button>
                      </div>
                      {e.photos.length > 0 && (
                        <div className="flex gap-2 overflow-x-auto pb-1">
                          {e.photos.map((p, i) => (
                            <div key={i} className="relative shrink-0">
                              <img src={p} alt={`Caisse ${i+1}`} className="h-20 w-20 rounded-xl object-cover border-2 border-purple-300" />
                              <button onClick={() => removePhoto(e.articleId, i)}
                                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] font-black">
                                x
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Brut / Net toggle */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-semibold">Poids :</span>
                    {(["brut", "net"] as const).map(tp => (
                      <button key={tp} type="button" onClick={() => updateEntry(e.articleId, "typePoids", tp)}
                        className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors ${e.typePoids === tp ? "bg-primary text-white border-primary" : "border-border text-muted-foreground"}`}>
                        {tp === "brut" ? "Brut" : "Net"}
                      </button>
                    ))}
                  </div>

                  {/* Qty input */}
                  <div className="flex gap-2 items-center">
                    <div className="flex-1 flex flex-col gap-1">
                      <label className="text-xs text-muted-foreground">Qte {e.typePoids === "brut" ? "brute" : "nette"} chargee ({e.unite})</label>
                      <input type="number" min="0" step="0.1" value={e.qteScannee}
                        onChange={ev => updateEntry(e.articleId, "qteScannee", ev.target.value)}
                        className={`w-full px-3 py-2.5 rounded-xl border text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary ${
                          e.conforme === true ? "border-green-400 bg-white text-green-800" :
                          e.conforme === false ? "border-red-400 bg-white text-red-800" :
                          "border-border bg-background text-foreground"
                        }`}
                        placeholder={`Attendu: ${e.qteAttendue}`} />
                    </div>
                    <button type="button" onClick={() => updateEntry(e.articleId, "qteScannee", String(e.qteAttendue))}
                      className="mt-5 px-3 py-2.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors">
                      = Attendu
                    </button>
                  </div>

                  {/* Caisses */}
                  {e.unite === "kg" && (
                    <div className="flex gap-2">
                      <div className="flex-1 flex flex-col gap-1">
                        <label className="text-xs text-muted-foreground">Nb gros caisses</label>
                        <input type="number" min="0" value={e.nbCaisseGros}
                          onChange={ev => updateEntry(e.articleId, "nbCaisseGros", ev.target.value)}
                          placeholder="0"
                          className="px-3 py-2 rounded-xl border border-amber-300 bg-amber-50 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-400 text-amber-900" />
                      </div>
                      <div className="flex-1 flex flex-col gap-1">
                        <label className="text-xs text-muted-foreground">Nb demi-caisses</label>
                        <input type="number" min="0" value={e.nbCaisseDemi}
                          onChange={ev => updateEntry(e.articleId, "nbCaisseDemi", ev.target.value)}
                          placeholder="0"
                          className="px-3 py-2 rounded-xl border border-cyan-300 bg-cyan-50 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-cyan-400 text-cyan-900" />
                      </div>
                    </div>
                  )}

                  {/* Net preview */}
                  {e.typePoids === "brut" && e.qteScannee !== "" && (Number(e.nbCaisseGros) > 0 || Number(e.nbCaisseDemi) > 0) && (
                    <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 text-xs">
                      <span className="text-blue-700 font-semibold">
                        Brut: {e.qteScannee} kg — Tare: {(Number(e.nbCaisseGros)*2.8+Number(e.nbCaisseDemi)*2).toFixed(1)} kg →
                        <strong className="text-blue-900"> Net: {calcPoidsNet(e).toFixed(2)} kg</strong>
                      </span>
                    </div>
                  )}

                  {/* Ecart */}
                  {ecart !== null && (
                    <div className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg ${
                      ecart === 0 ? "bg-green-100 text-green-800" : ecart > 0 ? "bg-blue-100 text-blue-800" : "bg-red-100 text-red-800"
                    }`}>
                      Ecart : {ecart > 0 ? "+" : ""}{ecart.toFixed(1)} {e.unite}
                      {ecart > 0 ? " (surplus)" : ecart < 0 ? " (manquant)" : " (conforme)"}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-foreground uppercase tracking-wide">Notes / observations</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              placeholder="Conditions de chargement, remarques..." />
          </div>

          {/* Validation blockers info */}
          {(!allQtyFilled || !allPhotosTaken) && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 flex flex-col gap-1">
              <p className="text-xs font-bold text-amber-800">Pour valider le controle :</p>
              {!allQtyFilled && <p className="text-xs text-amber-700">— Renseignez les quantites pour tous les articles ({entries.filter(e=>e.qteScannee==="").length} restants)</p>}
              {photoRequise && !allPhotosTaken && <p className="text-xs text-amber-700">— Prenez au moins 1 photo par article ({entries.filter(e=>e.photos.length===0).length} sans photo)</p>}
            </div>
          )}

          {/* Submit */}
          <button onClick={handleSubmit} disabled={!canSubmit || submitting}
            className="w-full py-3.5 rounded-xl font-bold text-white disabled:opacity-40 transition-opacity flex items-center justify-center gap-2"
            style={{ background: canSubmit ? "oklch(0.38 0.2 260)" : "oklch(0.3 0 0)" }}>
            {submitting ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Validation...</>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                {canSubmit ? `Valider controle (${anomalies.length} anomalie${anomalies.length!==1?"s":""})` : `Completer quantites${photoRequise ? " + photos" : ""} pour valider`}
              </>
            )}
          </button>
        </>
      )}
    </div>
  )
}
