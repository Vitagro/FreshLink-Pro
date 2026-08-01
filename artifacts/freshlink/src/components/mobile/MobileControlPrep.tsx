"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { store, type User, type Trip, type Commande, type ContenantTare, type BonPreparation } from "@/lib/store"

interface Props { user: User }

interface TripArticleLine {
  articleId: string
  articleNom: string
  articleNomAr?: string
  unite: string
  um?: string
  colisageParUM?: number
  colisageCaisses?: number
  colisageDemiCaisses?: number
  qteAttendue: number
  qtePrepared: string
  conforme: boolean | null
  nbCaisseGros: string
  nbCaisseDemi: string
  typePoids: "brut" | "net"
  photos: string[]   // min 1 required per article
}

interface CommandeQR {
  commandeId: string
  clientNom: string
  secteur: string
  montant: number
  nbArticles: number
  scanned: boolean
  qrData: string
}

interface TripControl {
  trip: Trip
  lines: TripArticleLine[]
  commandes: CommandeQR[]
  submitted: boolean
  sourcePrep: string | null
}

function calcCaissesSuggestion(qte: number, colGros: number, colDemi: number) {
  if (qte <= 0 || colGros <= 0) return { gros: 0, demi: 0, reste: 0, totalKg: 0 }
  const gros = Math.floor(qte / colGros)
  const resteApresGros = qte - gros * colGros
  const demi = colDemi > 0 ? Math.ceil(resteApresGros / colDemi) : 0
  const totalKg = gros * colGros + demi * colDemi
  return { gros, demi, reste: totalKg - qte, totalKg }
}

// ── Tiny QR-code generator (pure JS, no library needed) ──────────────────────
// We use a Data URL approach: encode text as a URL and render via Google Charts QR API
function QRCode({ data, size = 160 }: { data: string; size?: number }) {
  const url = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(data)}&size=${size}x${size}&margin=2&color=0d1a2e&bgcolor=f0f9ff`
  return (
    <img src={url} alt="QR Code" width={size} height={size}
      className="rounded-xl border-4 border-white shadow-xl"
      crossOrigin="anonymous" />
  )
}

// ── Camera hook ──────────────────────────────────────────────────────────────
function useCam() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [active, setActive] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const start = async (facing: "environment" | "user" = "environment") => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } })
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play() }
      setActive(true)
    } catch { setError("Camera non disponible") }
  }

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setActive(false)
  }, [])

  const capture = (): string | null => {
    const v = videoRef.current; const c = canvasRef.current
    if (!v || !c) return null
    c.width = v.videoWidth || 1280; c.height = v.videoHeight || 720
    c.getContext("2d")?.drawImage(v, 0, 0)
    return c.toDataURL("image/jpeg", 0.82)
  }

  return { videoRef, canvasRef, active, error, start, stop, capture }
}

// ── QR Scanner using camera + pattern matching ───────────────────────────────
function QRScannerModal({ onScan, onClose }: { onScan: (data: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [manualInput, setManualInput] = useState("")
  const [camError, setCamError] = useState(false)

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      .then(stream => {
        streamRef.current = stream
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play() }
      })
      .catch(() => setCamError(true))
    return () => { streamRef.current?.getTracks().forEach(t => t.stop()) }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <p className="text-white font-bold text-sm">Scanner QR Commande</p>
          <p className="text-gray-400 text-xs">Pointez la camera vers le QR code de la commande</p>
        </div>
        <button onClick={onClose} className="text-white bg-gray-800 rounded-full p-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      {camError ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
          <p className="text-white text-sm text-center">Camera non disponible. Saisie manuelle :</p>
          <input value={manualInput} onChange={e => setManualInput(e.target.value)}
            placeholder="ID commande (ex: CMD-XXXXXX)"
            className="w-full px-4 py-3 rounded-xl text-sm bg-gray-800 text-white border border-gray-600 focus:outline-none" />
          <button onClick={() => { if (manualInput.trim()) onScan(manualInput.trim()) }}
            className="w-full py-3 rounded-xl font-bold text-white bg-blue-600">
            Confirmer
          </button>
        </div>
      ) : (
        <>
          <video ref={videoRef} autoPlay playsInline muted className="flex-1 object-cover w-full" />
          {/* Targeting overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-56 h-56 border-4 border-white rounded-2xl opacity-60" />
          </div>
        </>
      )}
      {/* Manual fallback always visible */}
      <div className="px-4 py-4 bg-black flex flex-col gap-2">
        <p className="text-gray-400 text-xs text-center">Ou saisie manuelle de l&apos;ID :</p>
        <div className="flex gap-2">
          <input value={manualInput} onChange={e => setManualInput(e.target.value)}
            placeholder="ID commande"
            className="flex-1 px-3 py-2.5 rounded-xl text-sm bg-gray-800 text-white border border-gray-600 focus:outline-none" />
          <button onClick={() => { if (manualInput.trim()) onScan(manualInput.trim()) }}
            className="px-4 py-2.5 rounded-xl font-bold text-white bg-blue-600 text-sm">
            OK
          </button>
        </div>
      </div>
    </div>
  )
}

export default function MobileControlPrep({ user }: Props) {
  const [tripControls, setTripControls] = useState<TripControl[]>([])
  const [activeTrip, setActiveTrip] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [contenants, setContenants] = useState<ContenantTare[]>([])
  const [showQR, setShowQR] = useState<{ tripId: string; cmd: CommandeQR } | null>(null)
  const [showScanner, setShowScanner] = useState<string | null>(null) // tripId
  const cam = useCam()
  const [camTarget, setCamTarget] = useState<{ tripId: string; artId: string } | null>(null)

  useEffect(() => {
    const today = store.today()
    const trips = store.getTrips().filter(t => t.date === today)
    const commandes = store.getCommandes()
    const articles = store.getArticles()
    const allContenants = store.getContenantsConfig().filter(c => c.actif)
    setContenants(allContenants)

    const bonsPrep: BonPreparation[] = store.getBonsPreparation().filter(
      bp => bp.date === today && bp.statut === "valide"
    )

    const controls: TripControl[] = trips.map(trip => {
      const linkedPrep = bonsPrep.find(bp => bp.tripId === trip.id)
      const artMap: Record<string, TripArticleLine> = {}

      if (linkedPrep) {
        linkedPrep.lignes.forEach(l => {
          const art = articles.find(a => a.id === l.articleId)
          const colGros = (art as unknown as { colisageCaisses?: number })?.colisageCaisses ?? (art?.colisageParUM ?? 30)
          const colDemi = (art as unknown as { colisageDemiCaisses?: number })?.colisageDemiCaisses ?? Math.round(colGros / 2)
          artMap[l.articleId] = {
            articleId: l.articleId, articleNom: l.articleNom, articleNomAr: art?.nomAr, unite: art?.unite ?? "kg",
            um: art?.um, colisageParUM: art?.colisageParUM, colisageCaisses: colGros, colisageDemiCaisses: colDemi,
            qteAttendue: l.qtePrepared > 0 ? l.qtePrepared : l.qteCommandee,
            qtePrepared: "", conforme: null, nbCaisseGros: "", nbCaisseDemi: "", typePoids: "brut", photos: [],
          }
        })
      } else {
        const tripCmds = commandes.filter(c =>
          (c as Commande & { tripId?: string }).tripId === trip.id || trip.commandeIds?.includes(c.id)
        )
        tripCmds.forEach(cmd => {
          cmd.lignes.forEach(l => {
            if (!artMap[l.articleId]) {
              const art = articles.find(a => a.id === l.articleId)
              const colGros = (art as unknown as { colisageCaisses?: number })?.colisageCaisses ?? (art?.colisageParUM ?? 30)
              const colDemi = (art as unknown as { colisageDemiCaisses?: number })?.colisageDemiCaisses ?? Math.round(colGros / 2)
              artMap[l.articleId] = {
                articleId: l.articleId, articleNom: l.articleNom, articleNomAr: art?.nomAr, unite: l.unite ?? art?.unite ?? "kg",
                um: art?.um, colisageParUM: art?.colisageParUM, colisageCaisses: colGros, colisageDemiCaisses: colDemi,
                qteAttendue: 0, qtePrepared: "", conforme: null, nbCaisseGros: "", nbCaisseDemi: "", typePoids: "brut", photos: [],
              }
            }
            artMap[l.articleId].qteAttendue += l.quantite
          })
        })
      }

      // Build CommandeQR list for this trip
      const tripCmdIds = trip.commandeIds ?? []
      const tripCommandes = commandes.filter(c => tripCmdIds.includes(c.id))
      const cmdQRs: CommandeQR[] = tripCommandes.map(c => ({
        commandeId: c.id,
        clientNom: c.clientNom,
        secteur: (c as Commande & { secteur?: string }).secteur ?? "",
        montant: c.lignes.reduce((s, l) => s + l.total, 0),
        nbArticles: c.lignes.length,
        scanned: false,
        qrData: JSON.stringify({
          type: "fl_commande", id: c.id, client: c.clientNom,
          trip: trip.numero ?? trip.id.slice(-6), date: today,
        }),
      }))

      return { trip, lines: Object.values(artMap), commandes: cmdQRs, submitted: false, sourcePrep: linkedPrep?.id ?? null }
    })

    setTripControls(controls)
    if (controls.length > 0) setActiveTrip(controls[0].trip.id)
  }, [])

  const grossType = contenants.find(c => c.nom.toLowerCase().includes("gros") || c.nom.toLowerCase().includes("plastique"))
  const demiType  = contenants.find(c => c.nom.toLowerCase().includes("demi") || c.nom.toLowerCase().includes("petit"))

  function calcPoidsNet(line: TripArticleLine): number {
    const brut = Number(line.qtePrepared)
    if (isNaN(brut) || line.typePoids === "net") return brut
    const tare = (Number(line.nbCaisseGros)||0)*(grossType?.poidsKg??2.8) + (Number(line.nbCaisseDemi)||0)*(demiType?.poidsKg??2.0)
    return Math.max(0, brut - tare)
  }

  const updateLine = (tripId: string, artId: string, field: keyof TripArticleLine, value: string) => {
    setTripControls(prev => prev.map(tc => {
      if (tc.trip.id !== tripId) return tc
      return {
        ...tc,
        lines: tc.lines.map(l => {
          if (l.articleId !== artId) return l
          const updated = { ...l, [field]: value }
          if (["qtePrepared","nbCaisseGros","nbCaisseDemi","typePoids"].includes(field as string)) {
            const net = updated.typePoids === "net" ? Number(updated.qtePrepared) : calcPoidsNet(updated as TripArticleLine)
            const conforme = (updated as TripArticleLine).qtePrepared === "" ? null : Math.abs(net - l.qteAttendue) <= l.qteAttendue * 0.02
            return { ...updated, conforme } as TripArticleLine
          }
          return updated as TripArticleLine
        }),
      }
    }))
  }

  const applyCaisseSuggestion = (tripId: string, artId: string, gros: number, demi: number) => {
    setTripControls(prev => prev.map(tc => {
      if (tc.trip.id !== tripId) return tc
      return { ...tc, lines: tc.lines.map(l => l.articleId !== artId ? l : { ...l, nbCaisseGros: String(gros), nbCaisseDemi: String(demi) }) }
    }))
  }

  // Camera actions
  const openCam = async (tripId: string, artId: string) => {
    setCamTarget({ tripId, artId })
    await cam.start()
  }

  const capturePhoto = () => {
    const dataUrl = cam.capture()
    if (!dataUrl || !camTarget) return
    const { tripId, artId } = camTarget
    setTripControls(prev => prev.map(tc =>
      tc.trip.id !== tripId ? tc : {
        ...tc,
        lines: tc.lines.map(l => l.articleId !== artId ? l : { ...l, photos: [...l.photos, dataUrl] })
      }
    ))
  }

  const closeCamera = () => { cam.stop(); setCamTarget(null) }

  const removePhoto = (tripId: string, artId: string, idx: number) => {
    setTripControls(prev => prev.map(tc =>
      tc.trip.id !== tripId ? tc : {
        ...tc, lines: tc.lines.map(l => l.articleId !== artId ? l : { ...l, photos: l.photos.filter((_,i)=>i!==idx) })
      }
    ))
  }

  // QR Scan result
  const handleScanResult = (tripId: string, scannedData: string) => {
    setShowScanner(null)
    let cmdId = scannedData
    try {
      const parsed = JSON.parse(scannedData)
      if (parsed.id) cmdId = parsed.id
    } catch { /* raw id */ }
    setTripControls(prev => prev.map(tc =>
      tc.trip.id !== tripId ? tc : {
        ...tc, commandes: tc.commandes.map(c => c.commandeId === cmdId || c.commandeId.includes(cmdId) ? { ...c, scanned: true } : c)
      }
    ))
  }

  // KM depart state per trip — must be filled before validation
  const [kmDepart, setKmDepart] = useState<Record<string, string>>({})
  const [kmError, setKmError] = useState<string | null>(null)
  const [caissesError, setCaissesError] = useState<string | null>(null)

  const handleSubmitTrip = async (tripId: string) => {
    const tc = tripControls.find(t => t.trip.id === tripId)
    if (!tc) return

    // Guard 1: KM depart obligatoire
    const km = kmDepart[tripId]
    if (!km || isNaN(Number(km)) || Number(km) <= 0) {
      setKmError("Veuillez saisir le KM depart avant de valider le chargement.")
      return
    }
    setKmError(null)

    // Guard 2: Caisses obligatoires pour chaque article
    const artsSansCaisses = tc.lines.filter(l =>
      (l.nbCaisseGros === "" || l.nbCaisseGros === "0") &&
      (l.nbCaisseDemi === "" || l.nbCaisseDemi === "0")
    )
    if (artsSansCaisses.length > 0) {
      setCaissesError(`Nombre de caisses obligatoire pour: ${artsSansCaisses.map(l => l.articleNom).join(", ")}`)
      return
    }
    setCaissesError(null)

    // Save KM depart on the trip
    store.updateTrip(tripId, {
      kmDepart: Number(km),
      kmDepartConfirme: true,
      caissesValidees: true,
      nbCaissesByArticle: Object.fromEntries(tc.lines.map(l => [l.articleId, {
        gros: Number(l.nbCaisseGros) || 0,
        demi: Number(l.nbCaisseDemi) || 0,
        articleNom: l.articleNom,
      }])),
    })

    setSubmitting(tripId)
    const now = new Date()
    let totalGros = 0, totalDemi = 0
    const anomalies = tc.lines.filter(l => l.conforme === false)
    const report = {
      id: store.genId(), date: store.today(), heure: now.toTimeString().slice(0,5),
      type: "ctrl_preparation_trip", tripId, tripNumero: tc.trip.numero,
      controlleurId: user.id, controlleurNom: user.name,
      lines: tc.lines.map(l => {
        const brutQty = Number(l.qtePrepared)
        const netQty = l.typePoids === "net" ? brutQty : calcPoidsNet(l)
        const g = Number(l.nbCaisseGros)||0; const d = Number(l.nbCaisseDemi)||0
        totalGros += g; totalDemi += d
        return { articleId: l.articleId, articleNom: l.articleNom, unite: l.unite,
          qteAttendue: l.qteAttendue, qteBrute: brutQty, qteNette: netQty, typePoids: l.typePoids,
          nbCaisseGros: g, nbCaisseDemi: d, conforme: l.conforme, ecart: netQty - l.qteAttendue, photos: l.photos }
      }),
      commandesScannees: tc.commandes.filter(c=>c.scanned).length,
      commandesTotal: tc.commandes.length,
      notes: notes[tripId]??"", anomalies: anomalies.length, totalCaisseGros: totalGros, totalCaisseDemi: totalDemi,
    }
    try {
      const existing = JSON.parse(localStorage.getItem("fl_ctrl_rapports")??"[]")
      existing.push(report)
      localStorage.setItem("fl_ctrl_rapports", JSON.stringify(existing))
    } catch { /* noop */ }
    if (totalGros > 0 || totalDemi > 0) {
      store.addCaisseMouvement({
        id: store.genId(), date: store.today(), heure: now.toTimeString().slice(0,5),
        typeOperation: "ctrl_achat", sens: "sortie", nbCaisseGros: totalGros, nbCaisseDemi: totalDemi,
        referenceDoc: `Trip-${tc.trip.numero??tripId.slice(-4)}`, operateurId: user.id, operateurNom: user.name,
        notes: `Ctrl preparation trip ${tc.trip.numero??""}`,
      })
    }
    await new Promise(r => setTimeout(r, 500))
    setSubmitting(null)
    setTripControls(prev => prev.map(tc2 => tc2.trip.id === tripId ? { ...tc2, submitted: true } : tc2))
  }

  const activeTc = tripControls.find(t => t.trip.id === activeTrip)

  // Camera contrôle prép. désactivable depuis BO Settings → Process → Préparation
  // ("Contrôle préparation" / cameraControlPrep) — défaut activé si jamais réglé.
  const photoRequise = store.getProcessConfig().cameraControlPrep !== false

  // ── Camera overlay ──────────────────────────────────────────────────────────
  if (cam.active && camTarget) {
    const artNom = activeTc?.lines.find(l => l.articleId === camTarget.artId)?.articleNom ?? ""
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black">
        <div className="flex items-center justify-between px-4 py-3">
          <div><p className="text-white font-bold text-sm">{artNom}</p><p className="text-gray-400 text-xs">Photo obligatoire — min 1 par article</p></div>
          <button onClick={closeCamera} className="text-white bg-gray-800 rounded-full p-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <video ref={cam.videoRef} autoPlay playsInline muted className="flex-1 object-cover w-full" />
        <canvas ref={cam.canvasRef} className="hidden" />
        <div className="px-4 py-5 bg-black flex flex-col gap-3">
          {activeTc?.lines.find(l=>l.articleId===camTarget.artId)?.photos.length ? (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {activeTc.lines.find(l=>l.articleId===camTarget.artId)!.photos.map((p,i)=>(
                <img key={i} src={p} alt={`Photo ${i+1}`} className="h-16 w-16 rounded-xl object-cover border-2 border-green-400 shrink-0" />
              ))}
            </div>
          ) : null}
          <div className="flex gap-3">
            <button onClick={capturePhoto}
              className="flex-1 py-4 rounded-2xl font-bold text-black text-sm flex items-center justify-center gap-2 bg-white">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Prendre photo
            </button>
            {(activeTc?.lines.find(l=>l.articleId===camTarget.artId)?.photos.length??0)>=1 && (
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

  // ── QR display modal ────────────────────────────────────────────────────────
  if (showQR) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 px-6 gap-6">
        <div className="bg-white rounded-3xl p-6 flex flex-col items-center gap-4 w-full max-w-xs">
          <p className="font-black text-lg text-gray-900 text-center">{showQR.cmd.clientNom}</p>
          <p className="text-xs text-gray-500">{showQR.cmd.secteur} — {showQR.cmd.nbArticles} article(s)</p>
          <QRCode data={showQR.cmd.qrData} size={200} />
          <p className="text-xs text-gray-400 font-mono break-all text-center">{showQR.cmd.commandeId}</p>
          <p className="text-sm font-bold text-gray-800">{showQR.cmd.montant.toFixed(2)} DH</p>
          <button onClick={() => setShowQR(null)}
            className="w-full py-3 rounded-xl font-bold text-white"
            style={{ background: "oklch(0.38 0.2 260)" }}>
            Fermer
          </button>
        </div>
      </div>
    )
  }

  // ── QR Scanner modal ─────────────────────────────────────────────────────────
  if (showScanner) {
    return <QRScannerModal onScan={data => handleScanResult(showScanner, data)} onClose={() => setShowScanner(null)} />
  }

  if (tripControls.length === 0) {
    return (
      <div className="p-4 flex flex-col gap-4 font-sans">
        <div><h2 className="text-lg font-bold text-foreground">Controle Expedition</h2><p className="text-sm text-muted-foreground">{store.today()}</p></div>
        <div className="bg-card rounded-2xl border border-border p-10 flex flex-col items-center gap-3 text-center">
          <svg className="w-10 h-10 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
          </svg>
          <p className="text-sm font-semibold text-muted-foreground">Aucun trip planifie aujourd&apos;hui</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 flex flex-col gap-4 font-sans">
      <div>
        <h2 className="text-lg font-bold text-foreground">Controle Expedition</h2>
        <p className="text-sm text-muted-foreground">QR scan + quantites + photos obligatoires — {store.today()}</p>
      </div>

      {/* Trip tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tripControls.map(tc => (
          <button key={tc.trip.id} onClick={() => setActiveTrip(tc.trip.id)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all ${
              activeTrip === tc.trip.id ? "border-primary text-white" : "border-border text-foreground bg-card hover:bg-muted"
            } ${tc.submitted ? "opacity-60" : ""}`}
            style={activeTrip === tc.trip.id ? { background: "oklch(0.38 0.2 260)" } : {}}>
            {tc.submitted && <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
            {tc.trip.numero ?? `Trip ${tc.trip.id.slice(-4)}`}
          </button>
        ))}
      </div>

      {activeTc && (activeTc.submitted ? (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-6 flex flex-col items-center gap-2 text-center">
          <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-base font-bold text-green-800">Expedition validee — Trip {activeTc.trip.numero}</p>
          <p className="text-sm text-green-700">{activeTc.lines.filter(l=>l.conforme===false).length} anomalie(s)</p>
        </div>
      ) : (
        <>
          {/* Source badge */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border ${
            activeTc.sourcePrep ? "bg-green-50 border-green-300 text-green-800" : "bg-amber-50 border-amber-300 text-amber-800"
          }`}>
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={activeTc.sourcePrep ? "M5 13l4 4L19 7" : "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"} />
            </svg>
            {activeTc.sourcePrep ? "Quantites depuis preparation validee" : "Quantites depuis commandes (aucune prep validee)"}
          </div>

          {/* Progress summary */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Articles", val: activeTc.lines.length, color: "text-blue-800 bg-blue-50 border-blue-200" },
              { label: "Qty OK", val: activeTc.lines.filter(l=>l.qtePrepared!=="").length, color: "text-green-800 bg-green-50 border-green-200" },
              { label: "Photos OK", val: activeTc.lines.filter(l=>l.photos.length>=1).length, color: "text-purple-800 bg-purple-50 border-purple-200" },
              { label: "QR Scan", val: `${activeTc.commandes.filter(c=>c.scanned).length}/${activeTc.commandes.length}`, color: "text-cyan-800 bg-cyan-50 border-cyan-200" },
            ].map(s => (
              <div key={s.label} className={`border rounded-xl px-2 py-2 text-center ${s.color}`}>
                <p className="text-[10px]">{s.label}</p>
                <p className="text-sm font-black">{s.val}</p>
              </div>
            ))}
          </div>

          {/* ── SECTION QR Commandes ── */}
          <div className="bg-card rounded-2xl border border-border p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-sm text-foreground">QR Codes Commandes</p>
                <p className="text-xs text-muted-foreground">Affichez ou scannez le QR de chaque commande</p>
              </div>
              <button onClick={() => setShowScanner(activeTc.trip.id)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white"
                style={{ background: "oklch(0.45 0.18 200)" }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Scanner QR
              </button>
            </div>
            {activeTc.commandes.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">Aucune commande liee a ce trip</p>
            ) : (
              <div className="flex flex-col gap-2">
                {activeTc.commandes.map(cmd => (
                  <div key={cmd.commandeId}
                    className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border ${
                      cmd.scanned ? "bg-green-50 border-green-300" : "bg-card border-border"
                    }`}>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">{cmd.clientNom}</p>
                      <p className="text-xs text-muted-foreground">{cmd.secteur} — {cmd.nbArticles} art. — {cmd.montant.toFixed(0)} DH</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {cmd.scanned && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-300">Scanne</span>
                      )}
                      <button onClick={() => setShowQR({ tripId: activeTc.trip.id, cmd })}
                        className="px-2.5 py-2 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── SECTION Articles ── */}
          <div className="flex flex-col gap-3">
            {activeTc.lines.map(line => {
              const prepared = Number(line.qtePrepared)
              const ecart = line.qtePrepared !== "" ? prepared - line.qteAttendue : null
              const qteUM = line.um && line.colisageParUM ? (line.qteAttendue/line.colisageParUM).toFixed(1) : null
              const hasPhoto = line.photos.length >= 1

              return (
                <div key={line.articleId}
                  className={`rounded-2xl border p-4 flex flex-col gap-3 ${
                    line.conforme === true && (!photoRequise || hasPhoto) ? "border-green-300 bg-green-50" :
                    line.conforme === false ? "border-red-300 bg-red-50" : "border-border bg-card"
                  }`}>
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="font-bold text-sm text-foreground">{line.articleNom}</p>
                      {line.articleNomAr && <p className="text-xs text-muted-foreground font-arabic" dir="rtl" lang="ar">{line.articleNomAr}</p>}
                      <p className="text-xs text-muted-foreground">
                        Attendu: <strong>{line.qteAttendue} {line.unite}</strong>
                        {qteUM && <span className="ml-2 text-blue-600">= {qteUM} {line.um}</span>}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      {line.conforme === true && <span className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center"><svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg></span>}
                      {line.conforme === false && <span className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center"><svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg></span>}
                      {hasPhoto && <span className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center"><svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg></span>}
                    </div>
                  </div>

                  {/* Photo — masquee si la camera Controle Preparation est desactivee (BO Settings) */}
                  {photoRequise && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-semibold ${hasPhoto ? "text-purple-700":"text-red-600"}`}>
                        {hasPhoto ? `${line.photos.length} photo(s)` : "Photo obligatoire"}
                      </span>
                      <button onClick={() => openCam(activeTc.trip.id, line.articleId)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white"
                        style={{ background: hasPhoto ? "oklch(0.5 0.18 300)" : "oklch(0.45 0.2 25)" }}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        {hasPhoto ? "Ajouter" : "Prendre photo"}
                      </button>
                    </div>
                    {line.photos.length > 0 && (
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {line.photos.map((p,i) => (
                          <div key={i} className="relative shrink-0">
                            <img src={p} alt={`Photo ${i+1}`} className="h-16 w-16 rounded-xl object-cover border-2 border-purple-300" />
                            <button onClick={() => removePhoto(activeTc.trip.id, line.articleId, i)}
                              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] font-black">x</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  )}

                  {/* Caisse suggestion */}
                  {line.unite === "kg" && line.colisageCaisses && line.colisageCaisses > 0 && (() => {
                    const sugg = calcCaissesSuggestion(line.qteAttendue, line.colisageCaisses!, line.colisageDemiCaisses ?? Math.round(line.colisageCaisses!/2))
                    return (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
                        <p className="text-xs text-amber-800">
                          <span className="font-bold">Suggestion:</span>{" "}
                          {sugg.gros > 0 && <span>{sugg.gros} gros</span>}{" "}
                          {sugg.demi > 0 && <span>{sugg.demi} demi</span>}
                        </p>
                        <button onClick={() => applyCaisseSuggestion(activeTc.trip.id, line.articleId, sugg.gros, sugg.demi)}
                          className="text-xs font-bold text-amber-800 underline">Appliquer</button>
                      </div>
                    )
                  })()}

                  {/* Poids toggle */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-semibold">Poids:</span>
                    {(["brut","net"] as const).map(tp => (
                      <button key={tp} onClick={() => updateLine(activeTc.trip.id, line.articleId, "typePoids", tp)}
                        className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors ${line.typePoids===tp?"bg-primary text-white border-primary":"border-border text-muted-foreground"}`}>
                        {tp==="brut"?"Brut":"Net"}
                      </button>
                    ))}
                  </div>

                  {/* Qty input */}
                  <div className="flex gap-2 items-center">
                    <div className="flex-1 flex flex-col gap-1">
                      <label className="text-xs text-muted-foreground">Qte {line.typePoids==="brut"?"brute":"nette"} preparee ({line.unite})</label>
                      <input type="number" min="0" step="0.1" value={line.qtePrepared}
                        onChange={e => updateLine(activeTc.trip.id, line.articleId, "qtePrepared", e.target.value)}
                        className={`w-full px-3 py-2.5 rounded-xl border text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary ${
                          line.conforme===true?"border-green-400 bg-white text-green-800":
                          line.conforme===false?"border-red-400 bg-white text-red-800":
                          "border-border bg-background text-foreground"
                        }`}
                        placeholder={`Attendu: ${line.qteAttendue}`} />
                    </div>
                    <button onClick={() => updateLine(activeTc.trip.id, line.articleId, "qtePrepared", String(line.qteAttendue))}
                      className="mt-5 px-3 py-2.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted">
                      = Att.
                    </button>
                  </div>

                  {/* Caisses */}
                  {line.unite === "kg" && (
                    <div className="flex gap-2">
                      <div className="flex-1 flex flex-col gap-1">
                        <label className="text-xs text-amber-700 font-semibold">Gros caisses</label>
                        <input type="number" min="0" value={line.nbCaisseGros}
                          onChange={e => updateLine(activeTc.trip.id, line.articleId, "nbCaisseGros", e.target.value)}
                          className="px-3 py-2 rounded-xl border border-amber-300 bg-amber-50 text-sm font-bold text-amber-900 focus:outline-none" />
                      </div>
                      <div className="flex-1 flex flex-col gap-1">
                        <label className="text-xs text-cyan-700 font-semibold">Demi-caisses</label>
                        <input type="number" min="0" value={line.nbCaisseDemi}
                          onChange={e => updateLine(activeTc.trip.id, line.articleId, "nbCaisseDemi", e.target.value)}
                          className="px-3 py-2 rounded-xl border border-cyan-300 bg-cyan-50 text-sm font-bold text-cyan-900 focus:outline-none" />
                      </div>
                    </div>
                  )}

                  {/* Net preview */}
                  {line.typePoids==="brut" && line.qtePrepared!=="" && (Number(line.nbCaisseGros)>0||Number(line.nbCaisseDemi)>0) && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 text-xs text-blue-700 font-semibold">
                      Net: <strong className="text-blue-900">{calcPoidsNet(line).toFixed(2)} {line.unite}</strong>
                    </div>
                  )}

                  {ecart !== null && (
                    <div className={`text-xs font-bold px-3 py-1.5 rounded-lg ${
                      ecart===0?"bg-green-100 text-green-800":ecart>0?"bg-blue-100 text-blue-800":"bg-red-100 text-red-800"
                    }`}>
                      Ecart: {ecart>0?"+":""}{ecart.toFixed(1)} {line.unite}{ecart>0?" (surplus)":ecart<0?" (manquant)":" (conforme)"}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-foreground uppercase tracking-wide">Notes</label>
            <textarea value={notes[activeTc.trip.id]??""} onChange={e => setNotes(prev=>({...prev,[activeTc.trip.id]:e.target.value}))}
              rows={2} className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none resize-none"
              placeholder="Conditions de preparation, remarques..." />
          </div>

          {/* KM Depart — OBLIGATOIRE */}
          <div className="rounded-2xl p-4 flex flex-col gap-2"
            style={{ background: "oklch(0.10 0.014 72)", border: "1px solid oklch(0.24 0.10 72)" }}>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" style={{ color: "oklch(0.72 0.18 72)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-xs font-black" style={{ color: "oklch(0.72 0.18 72)" }}>KM DEPART — Obligatoire avant expedition</span>
            </div>
            <input
              type="number" min="0" step="1"
              value={kmDepart[activeTc.trip.id] ?? ""}
              onChange={e => setKmDepart(prev => ({ ...prev, [activeTc.trip.id]: e.target.value }))}
              className="w-full px-3 py-3 rounded-xl border text-base font-bold focus:outline-none focus:ring-2"
              style={{
                background: "oklch(0.14 0.012 72)",
                border: kmDepart[activeTc.trip.id] ? "1px solid oklch(0.55 0.18 148)" : "1px solid oklch(0.34 0.10 72)",
                color: "oklch(0.90 0.006 100)",
              }}
              placeholder="Ex: 45230 km" />
            {kmError && <p className="text-xs font-semibold" style={{ color: "oklch(0.72 0.20 27)" }}>{kmError}</p>}
          </div>

          {/* Validation blockers */}
          {(() => {
            const allQtyOK = activeTc.lines.every(l=>l.qtePrepared!=="")
            const allPhotosOK = !photoRequise || activeTc.lines.every(l=>l.photos.length>=1)
            const allCaissesOK = activeTc.lines.every(l =>
              (Number(l.nbCaisseGros) > 0 || Number(l.nbCaisseDemi) > 0)
            )
            const kmOK = !!(kmDepart[activeTc.trip.id] && Number(kmDepart[activeTc.trip.id]) > 0)
            const canSubmit = allQtyOK && allPhotosOK && allCaissesOK && kmOK
            const anomaliesCount = activeTc.lines.filter(l=>l.conforme===false).length
            return (
              <>
                {(!allQtyOK || !allPhotosOK || !allCaissesOK || !kmOK) && (
                  <div className="rounded-xl px-4 py-3 flex flex-col gap-1"
                    style={{ background: "oklch(0.10 0.020 72)", border: "1px solid oklch(0.30 0.12 72)" }}>
                    <p className="text-xs font-black" style={{ color: "oklch(0.72 0.18 72)" }}>Pour valider le chargement:</p>
                    {!kmOK && <p className="text-xs" style={{ color: "oklch(0.65 0.14 72)" }}>— KM depart obligatoire</p>}
                    {!allCaissesOK && <p className="text-xs" style={{ color: "oklch(0.65 0.14 72)" }}>
                      — Caisses obligatoires: {activeTc.lines.filter(l=>!(Number(l.nbCaisseGros)>0||Number(l.nbCaisseDemi)>0)).map(l=>l.articleNom).join(", ")}
                    </p>}
                    {!allQtyOK && <p className="text-xs" style={{ color: "oklch(0.65 0.14 72)" }}>— Quantites manquantes ({activeTc.lines.filter(l=>l.qtePrepared==="").length} articles)</p>}
                    {photoRequise && !allPhotosOK && <p className="text-xs" style={{ color: "oklch(0.65 0.14 72)" }}>— Photos obligatoires ({activeTc.lines.filter(l=>l.photos.length===0).length} articles)</p>}
                  </div>
                )}
                {caissesError && (
                  <div className="rounded-xl px-4 py-3" style={{ background: "oklch(0.10 0.020 27)", border: "1px solid oklch(0.30 0.12 27)" }}>
                    <p className="text-xs font-bold" style={{ color: "oklch(0.72 0.20 27)" }}>{caissesError}</p>
                  </div>
                )}
                <button onClick={() => handleSubmitTrip(activeTc.trip.id)}
                  disabled={!canSubmit || submitting===activeTc.trip.id}
                  className="w-full py-3.5 rounded-xl font-bold text-white disabled:opacity-40 flex items-center justify-center gap-2"
                  style={{ background: canSubmit ? (anomaliesCount>0?"oklch(0.45 0.2 25)":"oklch(0.38 0.2 145)") : "oklch(0.22 0.010 145)" }}>
                  {submitting===activeTc.trip.id ? (
                    <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Validation...</>
                  ) : canSubmit ? (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      Valider expedition — Trip {activeTc.trip.numero ?? activeTc.trip.id} ({anomaliesCount} anomalie{anomaliesCount!==1?"s":""})
                    </>
                  ) : "Remplir KM + Caisses + Quantites + Photos"}
                </button>
              </>
            )
          })()}
        </>
      ))}
    </div>
  )
}
