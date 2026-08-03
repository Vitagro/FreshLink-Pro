"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { store, type User, type Client, type Visite } from "@/lib/store"

interface Props { user: User }

interface TrackedUser {
  id: string
  name: string
  role: string
  lat: number
  lng: number
  hasPosition: boolean   // false = aucune position GPS reelle jamais recue (pas une position inventee)
  accuracy: number
  speed: number | null
  heading: number | null
  timestamp: number
  status: "actif" | "inactif" | "en_route" | "en_pause"
  city?: string
  address?: string
}

interface CameraState {
  open: boolean
  stream: MediaStream | null
  photo: string | null
  recording: boolean
  audioBlob: string | null
  mediaRecorder: MediaRecorder | null
}

const ROLE_LABELS: Record<string, string> = {
  livreur: "Livreur",
  prevendeur: "Commercial / Prevendeur",
  commercial: "Commercial",
  logistique: "Logistique",
  admin: "Administrateur",
  super_admin: "Super Admin",
}

const ROLE_COLORS: Record<string, string> = {
  livreur: "bg-yellow-500",
  prevendeur: "bg-emerald-500",
  commercial: "bg-emerald-500",
  logistique: "bg-cyan-500",
  admin: "bg-blue-500",
  super_admin: "bg-violet-500",
}

// Mêmes couleurs que ROLE_COLORS mais en hex — nécessaire pour le HTML inline
// des divIcon Leaflet (les classes Tailwind ne s'appliquent pas dans ce contexte).
const ROLE_COLOR_HEX: Record<string, string> = {
  livreur: "#eab308",
  prevendeur: "#10b981",
  commercial: "#10b981",
  logistique: "#06b6d4",
  admin: "#3b82f6",
  super_admin: "#8b5cf6",
}

const STATUS_CONFIG = {
  actif:    { label: "Actif",    class: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  inactif:  { label: "Inactif",  class: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
  en_route: { label: "En route", class: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  en_pause: { label: "En pause", class: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
}

const GPS_STORAGE_KEY = "freshlink_gps_positions"

function savePosition(userId: string, pos: Omit<TrackedUser, "id" | "name" | "role" | "hasPosition">) {
  try {
    const all = JSON.parse(localStorage.getItem(GPS_STORAGE_KEY) || "{}")
    all[userId] = { ...all[userId], ...pos, timestamp: Date.now() }
    localStorage.setItem(GPS_STORAGE_KEY, JSON.stringify(all))
  } catch { /* ignore */ }
}

function loadAllPositions(): Record<string, Partial<TrackedUser>> {
  try {
    return JSON.parse(localStorage.getItem(GPS_STORAGE_KEY) || "{}")
  } catch { return {} }
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Casablanca depot coordinates (default)
const DEPOT_LAT = 33.5731
const DEPOT_LNG = -7.5898

function timeSince(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return `il y a ${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `il y a ${m}min`
  const h = Math.floor(m / 60)
  return `il y a ${h}h`
}

export default function BOGPSTracker({ user }: Props) {
  const [allUsers] = useState<User[]>(() => store.getUsers().filter(u => u.actif))
  const [tracked, setTracked] = useState<TrackedUser[]>([])
  const [selected, setSelected] = useState<TrackedUser | null>(null)
  const [myPosition, setMyPosition] = useState<GeolocationPosition | null>(null)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [myStatus, setMyStatus] = useState<TrackedUser["status"]>("actif")
  const [filter, setFilter] = useState<"all" | "livreur" | "prevendeur" | "commercial">("all")
  // Carte live (Leaflet + OpenStreetMap, gratuit, sans clé API) — affiche TOUS
  // les acteurs traces simultanement (un seul user a la fois avec un iframe
  // Google Maps avant ; en plus l'iframe etait bloque par la CSP frame-src).
  const mapElRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletMapRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<Record<string, any>>({})
  const [mapReady, setMapReady] = useState(false)
  // ETA estimator state
  const [etaClients, setEtaClients] = useState<Client[]>([])
  const [etaStartLat, setEtaStartLat] = useState<number | null>(null)
  const [etaStartLng, setEtaStartLng] = useState<number | null>(null)
  const [etaStartTime, setEtaStartTime] = useState<string>(() => {
    const now = new Date()
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
  })
  const [etaIntervalMin, setEtaIntervalMin] = useState<number>(20) // minutes at each client
  const [etaSpeedKmh, setEtaSpeedKmh] = useState<number>(30)      // avg city speed
  const [etaOrderedIds, setEtaOrderedIds] = useState<string[]>([])
  const [etaClientSearch, setEtaClientSearch] = useState("")
  const [showEtaPanel, setShowEtaPanel] = useState(false)
  const [gpsTrackerTab, setGpsTrackerTab] = useState<"live" | "visites">("live")
  const [visitesData, setVisitesData] = useState<Visite[]>(() => store.getVisites())
  const [visitDateFilter, setVisitDateFilter] = useState<"today" | "week" | "all">("today")
  const heatmapRef = useRef<HTMLCanvasElement>(null)
  const [camera, setCamera] = useState<CameraState>({
    open: false, stream: null, photo: null,
    recording: false, audioBlob: null, mediaRecorder: null,
  })
  const videoRef = useRef<HTMLVideoElement>(null)
  const watchIdRef = useRef<number | null>(null)
  // Verrou d'écran (Wake Lock) — empêche le téléphone de s'éteindre pendant le
  // suivi, seul moyen web de garder le GPS actif de façon fiable quand l'app
  // reste ouverte mais que l'utilisateur n'y touche pas. Ne garantit RIEN une
  // fois l'app réellement réduite/l'écran éteint — limitation navigateur, pas
  // corrigible côté app (surtout marquée sur iOS Safari).
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const wantTrackingRef = useRef(false)
  const isSuperAdmin = user.role === "super_admin" || user.role === "admin" || user.role === "super_super_admin"
  const canUseCamera = user.role === "super_admin" || user.role === "super_super_admin"

  // ── Load saved positions from localStorage and merge with users ──
  const refreshTracked = useCallback(() => {
    const saved = loadAllPositions()
    const merged: TrackedUser[] = allUsers
      .filter(u => ["livreur", "prevendeur", "commercial", "logistique"].includes(u.role))
      .map(u => {
        const pos = saved[u.id]
        const hasPosition = pos?.lat != null && pos?.lng != null
        return {
          id: u.id,
          name: u.name,
          role: u.role,
          // Pas de position connue → on ancre au dépôt sans la considérer comme réelle
          // (hasPosition=false) : jamais de coordonnées inventées affichées comme vraies.
          lat: hasPosition ? pos!.lat! : DEPOT_LAT,
          lng: hasPosition ? pos!.lng! : DEPOT_LNG,
          hasPosition,
          accuracy: pos?.accuracy ?? 0,
          speed: pos?.speed ?? null,
          heading: pos?.heading ?? null,
          timestamp: pos?.timestamp ?? 0,
          status: (pos?.status as TrackedUser["status"]) ?? "inactif",
        }
      })
    setTracked(merged)
  }, [allUsers])

  // ── Load clients for ETA ──
  useEffect(() => {
    const all = store.getVisibleClients().filter(c => c.gpsLat && c.gpsLng)
    setEtaClients(all)
  }, [])

  // ── Start GPS watch on mount ──
  useEffect(() => {
    refreshTracked()
    const interval = setInterval(refreshTracked, 10000)
    return () => clearInterval(interval)
  }, [refreshTracked])

  // Wake Lock — maintient l'écran allumé pendant le suivi (Chrome/Edge Android
  // + Safari iOS 16.4+). Best-effort : ignore silencieusement si l'API est
  // absente ou si le navigateur refuse (onglet pas visible, batterie faible…).
  const acquireWakeLock = useCallback(async () => {
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> } }
      if (!nav.wakeLock) return
      wakeLockRef.current = await nav.wakeLock.request("screen")
      wakeLockRef.current.addEventListener("release", () => { wakeLockRef.current = null })
    } catch { /* refusé (onglet caché, économie d'énergie…) — pas bloquant */ }
  }, [])

  const releaseWakeLock = useCallback(() => {
    try { void wakeLockRef.current?.release() } catch { /* noop */ }
    wakeLockRef.current = null
  }, [])

  // ── Track current user's position ──
  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError("GPS non disponible sur cet appareil")
      return
    }
    wantTrackingRef.current = true
    setGpsLoading(true)
    setGpsError(null)
    void acquireWakeLock()
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsLoading(false)
        setGpsError(null)
        setMyPosition(pos)
        // Save this user's position
        savePosition(user.id, {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed,
          heading: pos.coords.heading,
          timestamp: Date.now(),
          status: myStatus,
        })
        refreshTracked()
      },
      (err) => {
        setGpsLoading(false)
        // Erreur transitoire (timeout, position indisponible un instant) : le
        // suivi reste "actif" côté utilisateur et on retente au lieu de tout
        // arrêter silencieusement — un simple timeout GPS ne doit pas couper
        // le tracking en pleine tournée. Seul un refus explicite de permission
        // (code 1) arrête vraiment le suivi, car retenter ne sert à rien.
        setGpsError(err.message || "Erreur GPS — nouvelle tentative…")
        if (err.code === err.PERMISSION_DENIED) { wantTrackingRef.current = false; releaseWakeLock(); return }
        if (wantTrackingRef.current) setTimeout(() => { if (wantTrackingRef.current) startTracking() }, 5000)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    )
  }, [user.id, myStatus, refreshTracked, acquireWakeLock, releaseWakeLock])

  const stopTracking = useCallback(() => {
    wantTrackingRef.current = false
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    releaseWakeLock()
    setMyPosition(null)
  }, [releaseWakeLock])

  // Reprise : le Wake Lock est automatiquement relâché par le navigateur quand
  // l'onglet passe en arrière-plan (spec) — on le ré-acquiert dès que l'app
  // redevient visible si le suivi est toujours voulu, pour limiter au maximum
  // la fenêtre où l'écran peut s'éteindre pendant une tournée.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && wantTrackingRef.current) void acquireWakeLock()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [acquireWakeLock])

  useEffect(() => { return () => {
    wantTrackingRef.current = false
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
    try { void wakeLockRef.current?.release() } catch { /* noop */ }
  } }, [])

  // ── Camera ──────────────────────────────────────────────────
  const openCamera = async () => {
    if (!canUseCamera) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      setCamera(c => ({ ...c, open: true, stream, photo: null, audioBlob: null }))
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = stream }, 100)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Acces camera refuse"
      setGpsError(`Camera: ${msg}`)
    }
  }

  const takePhoto = () => {
    if (!videoRef.current || !camera.stream) return
    const canvas = document.createElement("canvas")
    canvas.width = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    canvas.getContext("2d")?.drawImage(videoRef.current, 0, 0)
    setCamera(c => ({ ...c, photo: canvas.toDataURL("image/jpeg", 0.85) }))
  }

  const startRecordAudio = () => {
    if (!camera.stream) return
    const audioTracks = camera.stream.getAudioTracks()
    if (audioTracks.length === 0) return
    const audioStream = new MediaStream(audioTracks)
    const mr = new MediaRecorder(audioStream)
    const chunks: BlobPart[] = []
    mr.ondataavailable = e => chunks.push(e.data)
    mr.onstop = () => {
      const blob = new Blob(chunks, { type: "audio/webm" })
      setCamera(c => ({ ...c, audioBlob: URL.createObjectURL(blob), recording: false }))
    }
    mr.start()
    setCamera(c => ({ ...c, mediaRecorder: mr, recording: true }))
  }

  const stopRecordAudio = () => {
    camera.mediaRecorder?.stop()
  }

  const closeCamera = () => {
    camera.stream?.getTracks().forEach(t => t.stop())
    setCamera({ open: false, stream: null, photo: null, recording: false, audioBlob: null, mediaRecorder: null })
  }

  // ── Visit heatmap data ──────────────────────────────────────────────────
  const todayStr = store.today()
  const weekStart = (() => {
    const d = new Date()
    const day = d.getDay() === 0 ? 6 : d.getDay() - 1
    d.setDate(d.getDate() - day)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  })()
  const filteredVisites = useMemo(() => visitesData.filter(v => {
    if (visitDateFilter === "today") return v.date === todayStr
    if (visitDateFilter === "week") return v.date >= weekStart
    return true
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [visitesData, visitDateFilter])
  const pvStats = useMemo(() => {
    const stats: Record<string, { nom: string; visites: number; commandes: number }> = {}
    filteredVisites.forEach(v => {
      if (!stats[v.prevendeurId]) stats[v.prevendeurId] = { nom: v.prevendeurNom, visites: 0, commandes: 0 }
      stats[v.prevendeurId].visites++
      if (v.resultat === "commande") stats[v.prevendeurId].commandes++
    })
    return Object.values(stats).sort((a, b) => b.visites - a.visites)
  }, [filteredVisites])
  useEffect(() => {
    if (gpsTrackerTab === "visites") setVisitesData(store.getVisites())
  }, [gpsTrackerTab])
  useEffect(() => {
    if (gpsTrackerTab !== "visites") return
    const canvas = heatmapRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const W = canvas.width, H = canvas.height
    ctx.fillStyle = "#0f172a"; ctx.fillRect(0, 0, W, H)
    for (let i = 0; i <= 10; i++) {
      ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(i * W / 10, 0); ctx.lineTo(i * W / 10, H); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, i * H / 10); ctx.lineTo(W, i * H / 10); ctx.stroke()
    }
    const withGPS = filteredVisites.filter(v => v.gpsLat && v.gpsLng)
    if (withGPS.length === 0) {
      ctx.fillStyle = "#4b5563"; ctx.font = "13px system-ui"; ctx.textAlign = "center"
      ctx.fillText("Aucune visite avec coordonnées GPS disponibles", W / 2, H / 2)
      ctx.fillStyle = "#374151"; ctx.font = "11px system-ui"
      ctx.fillText("Les visites enregistrées avec GPS apparaîtront ici", W / 2, H / 2 + 20)
      return
    }
    const lats = withGPS.map(v => v.gpsLat!), lngs = withGPS.map(v => v.gpsLng!)
    const latMin = Math.min(...lats) - 0.008, latMax = Math.max(...lats) + 0.008
    const lngMin = Math.min(...lngs) - 0.015, lngMax = Math.max(...lngs) + 0.015
    const pad = 24, mW = W - pad * 2, mH = H - pad * 2
    const toX = (lng: number) => pad + ((lng - lngMin) / (lngMax - lngMin || 0.001)) * mW
    const toY = (lat: number) => H - pad - ((lat - latMin) / (latMax - latMin || 0.001)) * mH
    withGPS.forEach(v => {
      const x = toX(v.gpsLng!), y = toY(v.gpsLat!)
      const isCmd = v.resultat === "commande"
      const g = ctx.createRadialGradient(x, y, 0, x, y, 26)
      g.addColorStop(0, isCmd ? "rgba(16,185,129,0.45)" : "rgba(239,68,68,0.4)")
      g.addColorStop(1, isCmd ? "rgba(16,185,129,0)" : "rgba(239,68,68,0)")
      ctx.beginPath(); ctx.arc(x, y, 26, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill()
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2)
      ctx.fillStyle = isCmd ? "#10b981" : "#ef4444"; ctx.fill()
      ctx.strokeStyle = isCmd ? "#34d399" : "#f87171"; ctx.lineWidth = 1.5; ctx.stroke()
    })
    ctx.fillStyle = "#10b981"; ctx.beginPath(); ctx.arc(pad + 7, H - pad - 20, 5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = "#ef4444"; ctx.beginPath(); ctx.arc(pad + 7, H - pad - 6, 5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = "#94a3b8"; ctx.font = "11px system-ui"; ctx.textAlign = "left"
    ctx.fillText("Commande", pad + 16, H - pad - 16)
    ctx.fillText("Sans commande", pad + 16, H - pad - 2)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gpsTrackerTab, filteredVisites])

  const filteredTracked = tracked.filter(t => {
    if (filter === "all") return true
    if (filter === "livreur") return t.role === "livreur"
    if (filter === "prevendeur") return t.role === "prevendeur" || t.role === "commercial"
    return true
  })

  // ── Carte Leaflet/OSM — initialisation (une fois par passage sur l'onglet "live") ──
  // Remplace l'ancien <iframe src="openstreetmap.org/export/embed.html"> : en plus
  // d'être limité à un seul acteur à la fois, cet iframe était bloqué par la CSP
  // (frame-src absent → repli sur default-src 'self', qui interdit les iframes
  // externes — message Chrome "Ce contenu est bloqué..."). Leaflet rend les tuiles
  // en <img> (déjà autorisées par img-src), donc pas de souci CSP, et affiche TOUS
  // les acteurs simultanément avec des marqueurs live, sans clé API ni quota.
  useEffect(() => {
    if (gpsTrackerTab !== "live") return
    let cancelled = false
    ;(async () => {
      if (!mapElRef.current || leafletMapRef.current) return
      if (!document.getElementById("leaflet-cdn-css")) {
        const link = document.createElement("link")
        link.id = "leaflet-cdn-css"
        link.rel = "stylesheet"
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        document.head.appendChild(link)
      }
      try {
        const L = (await import("leaflet")).default
        if (cancelled || !mapElRef.current) return
        const map = L.map(mapElRef.current).setView([DEPOT_LAT, DEPOT_LNG], 11)
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(map)
        leafletMapRef.current = map
        setMapReady(true)
      } catch { /* leaflet indisponible */ }
    })()
    return () => {
      cancelled = true
      leafletMapRef.current?.remove()
      leafletMapRef.current = null
      markersRef.current = {}
      setMapReady(false)
    }
  }, [gpsTrackerTab])

  // ── Carte Leaflet — synchronisation des marqueurs (tous les acteurs + moi) ──
  useEffect(() => {
    if (!mapReady || !leafletMapRef.current) return
    let cancelled = false
    ;(async () => {
      const L = (await import("leaflet")).default
      if (cancelled) return
      const map = leafletMapRef.current
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const upsert = (key: string, lat: number, lng: number, html: string, popupHtml: string, onClick?: () => void) => {
        const icon = L.divIcon({ html, className: "", iconSize: [28, 28], iconAnchor: [14, 14] })
        const existing = markersRef.current[key]
        if (existing) {
          existing.setLatLng([lat, lng])
          existing.setIcon(icon)
          existing.setPopupContent(popupHtml)
        } else {
          const marker = L.marker([lat, lng], { icon }).addTo(map).bindPopup(popupHtml)
          if (onClick) marker.on("click", onClick)
          markersRef.current[key] = marker
        }
      }

      if (myPosition) {
        upsert(
          "__me__", myPosition.coords.latitude, myPosition.coords.longitude,
          `<div style="background:#2563eb;color:#fff;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;border:3px solid white;box-shadow:0 0 0 4px rgba(37,99,235,.25)">MOI</div>`,
          `<b>Moi (${user.name})</b>`
        )
      } else if (markersRef.current.__me__) {
        markersRef.current.__me__.remove()
        delete markersRef.current.__me__
      }

      filteredTracked.forEach(t => {
        if (!t.hasPosition) {
          if (markersRef.current[t.id]) { markersRef.current[t.id].remove(); delete markersRef.current[t.id] }
          return
        }
        const initial = t.name[0]?.toUpperCase() ?? "?"
        const bg = ROLE_COLOR_HEX[t.role] ?? "#6b7280"
        upsert(
          t.id, t.lat, t.lng,
          `<div style="background:${bg};color:#fff;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;border:2px solid white">${initial}</div>`,
          `<b>${t.name}</b><br/>${ROLE_LABELS[t.role] ?? t.role}<br/>${STATUS_CONFIG[t.status].label}`,
          () => setSelected(t)
        )
      })

      // Retire les marqueurs des acteurs qui ne sont plus dans la liste filtrée
      const validIds = new Set(["__me__", ...filteredTracked.filter(t => t.hasPosition).map(t => t.id)])
      Object.keys(markersRef.current).forEach(k => {
        if (!validIds.has(k)) { markersRef.current[k].remove(); delete markersRef.current[k] }
      })
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracked, filter, myPosition, mapReady, user.name])

  // ── ETA calculations ────────────────────────────────────────────
  const etaResults = useMemo(() => {
    if (!etaStartLat || !etaStartLng || etaOrderedIds.length === 0) return []

    const ordered = etaOrderedIds.map(id => etaClients.find(c => c.id === id)).filter(Boolean) as Client[]
    if (ordered.length === 0) return []

    let currentLat = etaStartLat
    let currentLng = etaStartLng
    const [startHour, startMin] = etaStartTime.split(":").map(Number)
    let currentMin = startHour * 60 + startMin // minutes since midnight

    const results: { client: Client; distanceKm: number; travelMin: number; arriveMin: number; arriveTime: string }[] = []
    ordered.forEach(c => {
      if (!c.gpsLat || !c.gpsLng) return
      const distKm = haversineKm(currentLat, currentLng, c.gpsLat, c.gpsLng)
      const travelMin = (distKm / etaSpeedKmh) * 60
      const arriveMin = currentMin + travelMin
      const arriveHour = Math.floor(arriveMin / 60) % 24
      const arriveMn = Math.floor(arriveMin % 60)
      const arriveTime = `${String(arriveHour).padStart(2, "0")}:${String(arriveMn).padStart(2, "0")}`
      results.push({ client: c, distanceKm: distKm, travelMin, arriveMin, arriveTime })
      // next start = this client's location + interval
      currentLat = c.gpsLat
      currentLng = c.gpsLng
      currentMin = arriveMin + etaIntervalMin
    })
    return results
  }, [etaStartLat, etaStartLng, etaStartTime, etaOrderedIds, etaClients, etaSpeedKmh, etaIntervalMin])

  const zoomToUser = (t: TrackedUser) => {
    setSelected(t)
    if (t.hasPosition && leafletMapRef.current) {
      leafletMapRef.current.flyTo([t.lat, t.lng], 14, { duration: 0.6 })
      markersRef.current[t.id]?.openPopup()
    }
  }

  const activeCount = tracked.filter(t => t.status === "actif" || t.status === "en_route").length
  const inRouteCount = tracked.filter(t => t.status === "en_route").length

  // ── ETA helper: use my GPS as start point ──────────────────────
  const useMyGPSAsStart = () => {
    if (myPosition) {
      setEtaStartLat(myPosition.coords.latitude)
      setEtaStartLng(myPosition.coords.longitude)
    }
  }

  // ── ETA helper: add client to ordered list ─────────────────────
  const addClientToRoute = (c: Client) => {
    if (!etaOrderedIds.includes(c.id)) setEtaOrderedIds([...etaOrderedIds, c.id])
  }
  const removeClientFromRoute = (id: string) => {
    setEtaOrderedIds(etaOrderedIds.filter(cid => cid !== id))
  }
  const moveClientUp = (id: string) => {
    const i = etaOrderedIds.indexOf(id)
    if (i <= 0) return
    const arr = [...etaOrderedIds]
    ;[arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]
    setEtaOrderedIds(arr)
  }
  const moveClientDown = (id: string) => {
    const i = etaOrderedIds.indexOf(id)
    if (i < 0 || i === etaOrderedIds.length - 1) return
    const arr = [...etaOrderedIds]
    ;[arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]
    setEtaOrderedIds(arr)
  }

  // ── Nearest-neighbor route optimizer ──────────────────────────
  const optimizeRouteNearestNeighbor = useCallback(() => {
    if (!etaStartLat || !etaStartLng || etaOrderedIds.length < 2) return
    const remaining = [...etaOrderedIds]
    let currentLat = etaStartLat
    let currentLng = etaStartLng
    const result: string[] = []
    while (remaining.length > 0) {
      let nearestIdx = 0
      let nearestDist = Infinity
      remaining.forEach((id, i) => {
        const c = etaClients.find(cl => cl.id === id)
        // Client sans GPS : ne sert de repli que si aucun candidat valide n'a
        // encore ete trouve dans ce passage (sinon il ecrasait a tort le plus
        // proche reel trouve plus tot dans le forEach).
        if (!c?.gpsLat || !c?.gpsLng) { if (nearestDist === Infinity) nearestIdx = i; return }
        const d = haversineKm(currentLat, currentLng, c.gpsLat, c.gpsLng)
        if (d < nearestDist) { nearestDist = d; nearestIdx = i }
      })
      const nextId = remaining[nearestIdx]
      result.push(nextId)
      remaining.splice(nearestIdx, 1)
      const nextClient = etaClients.find(cl => cl.id === nextId)
      if (nextClient?.gpsLat && nextClient?.gpsLng) {
        currentLat = nextClient.gpsLat
        currentLng = nextClient.gpsLng
      }
    }
    setEtaOrderedIds(result)
  }, [etaStartLat, etaStartLng, etaOrderedIds, etaClients])

  return (
    <div className="flex flex-col gap-5">

      {/* Header KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total Acteurs" value={tracked.length.toString()} icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" color="blue" />
        <KpiCard label="En activite" value={activeCount.toString()} icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" color="emerald" />
        <KpiCard label="En route" value={inRouteCount.toString()} icon="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" color="cyan" />
        <KpiCard label="Mon GPS" value={myPosition ? "Actif" : "Inactif"} icon="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" color={myPosition ? "emerald" : "gray"} />
      </div>

      {/* ── Tab Bar ──────────────────────────────────────────── */}
      <div className="flex gap-1 p-1 rounded-xl bg-gray-900 border border-gray-800 w-fit">
        {([
          { id: "live" as const, label: "Positions Live", icon: "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" },
          { id: "visites" as const, label: "Visites & Heatmap", icon: "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setGpsTrackerTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              gpsTrackerTab === t.id
                ? "bg-blue-600 text-white shadow-md"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={t.icon} />
            </svg>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── LIVE TAB ───────────────────────────────────────── */}
      {gpsTrackerTab === "live" && (<>

      {/* GPS control bar */}
      <div className="flex flex-wrap items-center gap-3 p-4 bg-gray-900 rounded-2xl border border-gray-800">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${myPosition ? "bg-emerald-500 animate-pulse" : "bg-gray-500"}`} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">
              {myPosition
                ? `Position GPS: ${myPosition.coords.latitude.toFixed(5)}, ${myPosition.coords.longitude.toFixed(5)}`
                : "GPS non actif — cliquez sur Activer pour partager votre position"}
            </p>
            {myPosition && (
              <p className="text-xs text-gray-400">
                Precision: {myPosition.coords.accuracy.toFixed(0)}m
                {myPosition.coords.speed != null && ` — Vitesse: ${(myPosition.coords.speed * 3.6).toFixed(1)} km/h`}
              </p>
            )}
            {gpsError && <p className="text-xs text-red-400 mt-0.5">{gpsError}</p>}
          </div>
        </div>

        {/* Status selector */}
        <select
          value={myStatus}
          onChange={e => setMyStatus(e.target.value as TrackedUser["status"])}
          className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-xl text-xs text-gray-200 focus:outline-none focus:border-blue-500"
        >
          <option value="actif">Actif</option>
          <option value="en_route">En route</option>
          <option value="en_pause">En pause</option>
          <option value="inactif">Inactif</option>
        </select>

        {/* GPS toggle */}
        {!myPosition ? (
          <button
            onClick={startTracking}
            disabled={gpsLoading}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl text-sm font-medium text-white transition-colors"
          >
            {gpsLoading ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            )}
            Activer GPS
          </button>
        ) : (
          <button
            onClick={stopTracking}
            className="flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 rounded-xl text-sm font-medium text-red-400 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Arreter GPS
          </button>
        )}
        {myPosition && (
          <span className="text-[10px] text-gray-500 max-w-xs">
            Reste actif tant que l&apos;app est ouverte (écran verrouillé/appli fermée = coupé par le téléphone, limitation système — surtout iPhone).
          </span>
        )}

        {/* Camera button — super_admin only */}
        {canUseCamera && (
          <button
            onClick={openCamera}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600/20 hover:bg-violet-600/40 border border-violet-500/30 rounded-xl text-sm font-medium text-violet-400 transition-colors"
            title="Camera & Micro (super_admin)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Camera & Micro
          </button>
        )}
      </div>

      {/* Main content: map + list */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Live Map */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              Carte en Temps Reel
            </h3>
            {selected && (
              <span className="text-xs text-blue-400 font-medium">{selected.name}</span>
            )}
          </div>
          <div className="relative w-full h-72" style={{ background: "#0f172a" }}>
            <div ref={mapElRef} className="absolute inset-0" />
            {!mapReady && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 gap-3 pointer-events-none">
                <span className="w-5 h-5 border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin" />
                <p className="text-sm">Chargement de la carte...</p>
              </div>
            )}
          </div>
          {/* Google Maps link */}
          {(myPosition || selected) && (
            <div className="px-4 py-3 border-t border-gray-800 flex gap-2">
              {myPosition && (
                <a
                  href={`https://www.google.com/maps?q=${myPosition.coords.latitude},${myPosition.coords.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 rounded-lg text-xs text-blue-400 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Ma position sur Google Maps
                </a>
              )}
              {selected && (
                <a
                  href={`https://www.google.com/maps?q=${selected.lat},${selected.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 rounded-lg text-xs text-emerald-400 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  {selected.name} sur Google Maps
                </a>
              )}
            </div>
          )}
        </div>

        {/* Acteurs list */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 flex-wrap gap-2">
            <h3 className="text-sm font-semibold text-white">Acteurs Trackes</h3>
            <div className="flex gap-1">
              {(["all", "livreur", "prevendeur"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${
                    filter === f ? "bg-blue-600 border-blue-500 text-white" : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {f === "all" ? "Tous" : f === "livreur" ? "Livreurs" : "Commerciaux"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto max-h-80 divide-y divide-gray-800/50">
            {filteredTracked.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">Aucun acteur trace</div>
            ) : (
              filteredTracked.map(t => {
                const distKm = haversineKm(DEPOT_LAT, DEPOT_LNG, t.lat, t.lng)
                const st = STATUS_CONFIG[t.status]
                const isMe = t.id === user.id
                return (
                  <button
                    key={t.id}
                    onClick={() => zoomToUser(t)}
                    className={`w-full flex items-start gap-3 p-4 text-left hover:bg-gray-800/50 transition-colors ${selected?.id === t.id ? "bg-blue-600/10 border-l-2 border-blue-500" : ""}`}
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-bold text-white ${ROLE_COLORS[t.role] ?? "bg-gray-600"}`}>
                      {t.name[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="text-sm font-semibold text-white truncate">{t.name}{isMe ? " (Moi)" : ""}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium flex-shrink-0 ${st.class}`}>{st.label}</span>
                      </div>
                      <p className="text-xs text-gray-400">{ROLE_LABELS[t.role] ?? t.role}</p>
                      {t.hasPosition ? (
                        <>
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            <span className="text-xs text-gray-500">
                              {t.lat.toFixed(4)}, {t.lng.toFixed(4)}
                            </span>
                            <span className="text-xs text-blue-400 font-medium">{distKm.toFixed(1)} km du depot</span>
                            {t.speed != null && (
                              <span className="text-xs text-cyan-400">{(t.speed * 3.6).toFixed(1)} km/h</span>
                            )}
                          </div>
                          <p className="text-[10px] text-gray-600 mt-0.5">{timeSince(t.timestamp)}</p>
                        </>
                      ) : (
                        <p className="text-xs text-gray-600 italic mt-1">Position inconnue — n&apos;a jamais activé son GPS</p>
                      )}
                    </div>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${t.status === "en_route" || t.status === "actif" ? "bg-emerald-500 animate-pulse" : "bg-gray-600"}`} />
                  </button>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Selected user detail */}
      {selected && (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
          <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-base font-bold text-white ${ROLE_COLORS[selected.role] ?? "bg-gray-600"}`}>
                {selected.name[0]?.toUpperCase()}
              </div>
              <div>
                <h3 className="text-base font-bold text-white">{selected.name}</h3>
                <p className="text-sm text-gray-400">{ROLE_LABELS[selected.role] ?? selected.role}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_CONFIG[selected.status].class}`}>
                  {STATUS_CONFIG[selected.status].label}
                </span>
              </div>
            </div>
            <button onClick={() => setSelected(null)} className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {selected.hasPosition ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <InfoBox label="Latitude" value={selected.lat.toFixed(5)} />
            <InfoBox label="Longitude" value={selected.lng.toFixed(5)} />
            <InfoBox label="Dist. Depot" value={`${haversineKm(DEPOT_LAT, DEPOT_LNG, selected.lat, selected.lng).toFixed(2)} km`} />
            <InfoBox label="Precision GPS" value={`${selected.accuracy.toFixed(0)} m`} />
            {selected.speed != null && <InfoBox label="Vitesse" value={`${(selected.speed * 3.6).toFixed(1)} km/h`} />}
            {selected.heading != null && <InfoBox label="Direction" value={`${selected.heading.toFixed(0)}°`} />}
            <InfoBox label="Derniere MAJ" value={timeSince(selected.timestamp)} />
          </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-700 p-4 text-center text-sm text-gray-500">
              Aucune position GPS reçue — cet acteur n&apos;a jamais activé le GPS sur son appareil.
            </div>
          )}
          <div className="flex gap-2 mt-4 flex-wrap">
            {selected.hasPosition && (
            <a
              href={`https://www.google.com/maps?q=${selected.lat},${selected.lng}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 rounded-xl text-sm text-blue-400 font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Voir sur Google Maps
            </a>
            )}
            <a
              href={`https://wa.me/${allUsers.find(u => u.id === selected.id)?.telephone?.replace(/\s/g, "")}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 rounded-xl text-sm text-emerald-400 font-medium transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
              </svg>
              WhatsApp
            </a>
          </div>
        </div>
      )}

      {/* ── ETA ESTIMATOR & ROUTE PANEL ──────────────────── */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800">
        {/* Panel header / toggle */}
        <button
          onClick={() => setShowEtaPanel(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-800/40 transition-colors rounded-2xl"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <svg width="16" height="16" className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-white">Estimateur ETA &amp; Tournée</span>
            {etaOrderedIds.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-600/20 text-blue-400 border border-blue-500/30 font-medium">
                {etaOrderedIds.length} arrêt(s)
              </span>
            )}
          </div>
          <svg width="16" height="16" className={`w-4 h-4 text-gray-400 transition-transform ${showEtaPanel ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showEtaPanel && (
          <div className="border-t border-gray-800 p-4 flex flex-col gap-4">

            {/* ── Start position ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Latitude départ</label>
                <input
                  type="number"
                  step="0.00001"
                  value={etaStartLat ?? ""}
                  onChange={e => setEtaStartLat(parseFloat(e.target.value) || null)}
                  placeholder="33.57310"
                  className="px-3 py-2 rounded-xl text-xs bg-gray-800 border border-gray-700 text-gray-200 focus:outline-none focus:border-amber-500 placeholder-gray-600"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Longitude départ</label>
                <input
                  type="number"
                  step="0.00001"
                  value={etaStartLng ?? ""}
                  onChange={e => setEtaStartLng(parseFloat(e.target.value) || null)}
                  placeholder="-7.58980"
                  className="px-3 py-2 rounded-xl text-xs bg-gray-800 border border-gray-700 text-gray-200 focus:outline-none focus:border-amber-500 placeholder-gray-600"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Heure départ</label>
                <input
                  type="time"
                  value={etaStartTime}
                  onChange={e => setEtaStartTime(e.target.value)}
                  className="px-3 py-2 rounded-xl text-xs bg-gray-800 border border-gray-700 text-gray-200 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Position GPS</label>
                <button
                  onClick={useMyGPSAsStart}
                  disabled={!myPosition}
                  className="px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 text-emerald-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 justify-center"
                >
                  <svg width="12" height="12" className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {myPosition ? "Utiliser mon GPS" : "GPS non actif"}
                </button>
              </div>
            </div>

            {/* ── Speed and interval ── */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Vitesse moy. (km/h)</label>
                <input
                  type="number"
                  min={5} max={120}
                  value={etaSpeedKmh}
                  onChange={e => setEtaSpeedKmh(Math.max(5, parseInt(e.target.value) || 30))}
                  className="px-3 py-2 rounded-xl text-xs bg-gray-800 border border-gray-700 text-gray-200 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Durée par client (min)</label>
                <input
                  type="number"
                  min={1} max={120}
                  value={etaIntervalMin}
                  onChange={e => setEtaIntervalMin(Math.max(1, parseInt(e.target.value) || 20))}
                  className="px-3 py-2 rounded-xl text-xs bg-gray-800 border border-gray-700 text-gray-200 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* ── Client search ── */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Ajouter un client GPS à la tournée</label>
              <div className="relative">
                <svg width="14" height="14" className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={etaClientSearch}
                  onChange={e => setEtaClientSearch(e.target.value)}
                  placeholder="Rechercher par nom..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-gray-800 border border-gray-700 text-gray-200 focus:outline-none focus:border-amber-500 placeholder-gray-600"
                />
              </div>
              {etaClientSearch.trim().length > 0 && (
                <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden max-h-36 overflow-y-auto">
                  {etaClients
                    .filter(c => !etaOrderedIds.includes(c.id) && c.nom.toLowerCase().includes(etaClientSearch.toLowerCase()))
                    .slice(0, 10)
                    .map(c => (
                      <button
                        key={c.id}
                        onClick={() => { addClientToRoute(c); setEtaClientSearch("") }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-700/60 transition-colors text-left border-b border-gray-700/40 last:border-b-0"
                      >
                        <div className="w-6 h-6 rounded-lg bg-blue-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                          {c.nom[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-200 truncate">{c.nom}</p>
                          {c.secteur && <p className="text-[10px] text-gray-500 truncate">{c.secteur} — {c.zone}</p>}
                        </div>
                        <svg width="14" height="14" className="w-3.5 h-3.5 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                    ))
                  }
                  {etaClients.filter(c => !etaOrderedIds.includes(c.id) && c.nom.toLowerCase().includes(etaClientSearch.toLowerCase())).length === 0 && (
                    <div className="p-3 text-center text-xs text-gray-500">Aucun client GPS trouvé</div>
                  )}
                </div>
              )}
            </div>

            {/* ── Route list ── */}
            {etaOrderedIds.length > 0 && (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-semibold text-gray-300">
                    Itinéraire — {etaOrderedIds.length} arrêt(s)
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={optimizeRouteNearestNeighbor}
                      disabled={!etaStartLat || !etaStartLng || etaOrderedIds.length < 2}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-violet-600/20 hover:bg-violet-600/40 border border-violet-500/30 text-violet-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <svg width="14" height="14" className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Optimiser l&apos;itinéraire
                    </button>
                    <button
                      onClick={() => setEtaOrderedIds([])}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 text-red-400 transition-colors"
                    >
                      <svg width="14" height="14" className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Vider
                    </button>
                  </div>
                </div>

                <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 overflow-hidden">
                  {etaOrderedIds.map((id, i) => {
                    const c = etaClients.find(cl => cl.id === id)
                    const eta = etaResults.find(r => r.client.id === id)
                    return (
                      <div key={id} className={`flex items-center gap-2.5 px-3 py-2.5 ${i > 0 ? "border-t border-gray-700/40" : ""}`}>
                        <div className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center text-[10px] font-bold text-gray-300 shrink-0">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-white truncate">{c?.nom ?? id}</p>
                          {eta ? (
                            <p className="text-[10px] text-amber-400 font-mono">
                              Arrivée {eta.arriveTime} · {eta.distanceKm.toFixed(1)} km · {Math.ceil(eta.travelMin)} min de trajet
                            </p>
                          ) : (
                            <p className="text-[10px] text-gray-500">Définir une position de départ pour l&apos;ETA</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => moveClientUp(id)}
                            disabled={i === 0}
                            className="p-1 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-gray-200 disabled:opacity-30 transition-colors"
                          >
                            <svg width="12" height="12" className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                          </button>
                          <button
                            onClick={() => moveClientDown(id)}
                            disabled={i === etaOrderedIds.length - 1}
                            className="p-1 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-gray-200 disabled:opacity-30 transition-colors"
                          >
                            <svg width="12" height="12" className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          <button
                            onClick={() => removeClientFromRoute(id)}
                            className="p-1 rounded-lg hover:bg-red-900/40 text-gray-500 hover:text-red-400 transition-colors"
                          >
                            <svg width="12" height="12" className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* ── ETA Summary ── */}
                {etaResults.length > 0 && (
                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="bg-gray-800/50 rounded-xl p-3 border border-gray-700/50">
                      <p className="text-xs text-gray-500 mb-0.5">Distance totale</p>
                      <p className="text-base font-bold text-amber-400">
                        {etaResults.reduce((s, r) => s + r.distanceKm, 0).toFixed(1)} km
                      </p>
                    </div>
                    <div className="bg-gray-800/50 rounded-xl p-3 border border-gray-700/50">
                      <p className="text-xs text-gray-500 mb-0.5">Durée trajet</p>
                      <p className="text-base font-bold text-cyan-400">
                        {Math.ceil(etaResults.reduce((s, r) => s + r.travelMin, 0))} min
                      </p>
                    </div>
                    <div className="bg-gray-800/50 rounded-xl p-3 border border-gray-700/50">
                      <p className="text-xs text-gray-500 mb-0.5">Fin estimée</p>
                      <p className="text-base font-bold text-emerald-400">
                        {etaResults[etaResults.length - 1].arriveTime}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {etaClients.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-700 p-4 text-center text-xs text-gray-500">
                Aucun client avec coordonnées GPS. Ajoutez des coordonnées GPS aux fiches clients pour utiliser cet estimateur.
              </div>
            )}

          </div>
        )}
      </div>

      </>)}

      {/* ── VISITES & HEATMAP TAB ──────────────────────────── */}
      {gpsTrackerTab === "visites" && (
        <div className="flex flex-col gap-4">

          {/* Date filter */}
          <div className="flex items-center gap-2 flex-wrap">
            {([
              { id: "today" as const, label: "Aujourd'hui" },
              { id: "week" as const, label: "Cette semaine" },
              { id: "all" as const, label: "Tout" },
            ] as const).map(f => (
              <button
                key={f.id}
                onClick={() => setVisitDateFilter(f.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                  visitDateFilter === f.id
                    ? "bg-emerald-600 text-white"
                    : "bg-gray-800 border border-gray-700 text-gray-400 hover:text-gray-200"
                }`}
              >
                {f.label}
              </button>
            ))}
            <span className="text-xs text-gray-500 ml-1">{filteredVisites.length} visite(s) trouvée(s)</span>
          </div>

          {/* Stats banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total visites",    value: filteredVisites.length,                                                                  color: "text-blue-400" },
              { label: "Commandes",        value: filteredVisites.filter(v => v.resultat === "commande").length,                           color: "text-emerald-400" },
              { label: "Sans commande",    value: filteredVisites.filter(v => v.resultat === "sans_commande").length,                      color: "text-red-400" },
              { label: "Taux conversion",  value: filteredVisites.length > 0 ? `${Math.round(filteredVisites.filter(v => v.resultat === "commande").length / filteredVisites.length * 100)}%` : "—", color: "text-amber-400" },
            ].map(s => (
              <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Canvas heatmap */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2 flex-wrap">
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              <h3 className="text-sm font-semibold text-white">Heatmap Visites GPS</h3>
              <span className="text-xs text-gray-500">
                {filteredVisites.filter(v => v.gpsLat && v.gpsLng).length} point(s) géolocalisé(s) · vert = commande · rouge = sans commande
              </span>
            </div>
            <canvas ref={heatmapRef} width={700} height={300} className="w-full" style={{ display: "block" }} />
          </div>

          {/* Per-prevendeur table */}
          {pvStats.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800">
                <h3 className="text-sm font-semibold text-white">Par Commercial / Pré-vendeur</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Prévendeur</th>
                      <th className="text-center px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Visites</th>
                      <th className="text-center px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Commandes</th>
                      <th className="text-center px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Sans cmd</th>
                      <th className="text-center px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Taux</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pvStats.map((pv, i) => {
                      const taux = pv.visites > 0 ? Math.round((pv.commandes / pv.visites) * 100) : 0
                      return (
                        <tr key={pv.nom + i} className={`border-b border-gray-800/40 ${i % 2 === 0 ? "" : "bg-gray-800/20"}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center text-[11px] font-bold text-white shrink-0">
                                {pv.nom[0]?.toUpperCase()}
                              </div>
                              <span className="text-sm font-medium text-white">{pv.nom}</span>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-center font-bold text-white">{pv.visites}</td>
                          <td className="px-3 py-3 text-center font-bold text-emerald-400">{pv.commandes}</td>
                          <td className="px-3 py-3 text-center font-bold text-red-400">{pv.visites - pv.commandes}</td>
                          <td className="px-3 py-3 text-center">
                            <span className={`text-sm font-black ${taux >= 70 ? "text-emerald-400" : taux >= 40 ? "text-amber-400" : "text-red-400"}`}>
                              {taux}%
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Visit history list */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Historique des Visites</h3>
              <span className="text-xs text-gray-500">{filteredVisites.length} visite(s)</span>
            </div>
            <div className="overflow-x-auto">
              <div className="max-h-64 overflow-y-auto">
                {filteredVisites.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 text-sm">Aucune visite dans cette période</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-900 z-10">
                      <tr className="border-b border-gray-800">
                        <th className="text-left px-4 py-2 text-[10px] text-gray-500 uppercase">Date</th>
                        <th className="text-left px-3 py-2 text-[10px] text-gray-500 uppercase">Prévendeur</th>
                        <th className="text-left px-3 py-2 text-[10px] text-gray-500 uppercase">Client</th>
                        <th className="text-left px-3 py-2 text-[10px] text-gray-500 uppercase">Résultat</th>
                        <th className="text-left px-3 py-2 text-[10px] text-gray-500 uppercase">GPS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...filteredVisites].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 100).map(v => (
                        <tr key={v.id} className="border-b border-gray-800/30 hover:bg-gray-800/30 transition-colors">
                          <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">{v.date}</td>
                          <td className="px-3 py-2.5 text-xs text-white">{v.prevendeurNom}</td>
                          <td className="px-3 py-2.5 text-xs text-gray-300 max-w-[120px] truncate">{v.clientNom}</td>
                          <td className="px-3 py-2.5">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              v.resultat === "commande"
                                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                : "bg-red-500/15 text-red-400 border-red-500/30"
                            }`}>
                              {v.resultat === "commande" ? "Commande" : "Sans cmd"}
                            </span>
                            {v.raisonSansCommande && (
                              <span className="ml-1.5 text-[10px] text-gray-500 italic">{v.raisonSansCommande}</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            {v.gpsLat && v.gpsLng ? (
                              <a
                                href={`https://www.google.com/maps?q=${v.gpsLat},${v.gpsLng}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] text-blue-400 hover:text-blue-300 font-mono whitespace-nowrap"
                              >
                                {v.gpsLat.toFixed(4)}, {v.gpsLng.toFixed(4)}
                              </a>
                            ) : (
                              <span className="text-[10px] text-gray-600">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* Camera & Microphone Studio — super_admin only */}
      {camera.open && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Studio Camera & Micro
              </h3>
              <button onClick={closeCamera} className="p-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Video preview */}
              <div className="relative bg-black rounded-xl overflow-hidden aspect-video">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {camera.photo && (
                  <img
                    src={camera.photo}
                    alt="Photo prise"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )}
              </div>

              {/* Controls */}
              <div className="flex flex-wrap gap-2 justify-center">
                <button
                  onClick={takePhoto}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-gray-100 rounded-xl text-sm font-bold text-gray-900 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth={2} />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  </svg>
                  Prendre Photo
                </button>

                {!camera.recording ? (
                  <button
                    onClick={startRecordAudio}
                    className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 rounded-xl text-sm font-medium text-white transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                    Enregistrer Audio
                  </button>
                ) : (
                  <button
                    onClick={stopRecordAudio}
                    className="flex items-center gap-2 px-4 py-2.5 bg-red-600/20 border border-red-500/30 rounded-xl text-sm font-medium text-red-400 transition-colors animate-pulse"
                  >
                    <span className="w-3 h-3 rounded-sm bg-red-500" />
                    Arreter
                  </button>
                )}

                {camera.photo && (
                  <a
                    href={camera.photo}
                    download="photo-freshlink.jpg"
                    className="flex items-center gap-2 px-4 py-2.5 bg-blue-600/20 border border-blue-500/30 rounded-xl text-sm text-blue-400 font-medium transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Sauvegarder
                  </a>
                )}
              </div>

              {/* Audio playback */}
              {camera.audioBlob && (
                <div className="p-3 bg-gray-800 rounded-xl">
                  <p className="text-xs text-gray-400 mb-2">Enregistrement audio:</p>
                  <audio controls src={camera.audioBlob} className="w-full h-8" />
                </div>
              )}

              {/* Recording indicator */}
              {camera.recording && (
                <div className="flex items-center justify-center gap-2 text-red-400 text-sm">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  Enregistrement en cours...
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function KpiCard({ label, value, icon, color }: { label: string; value: string; icon: string; color: string }) {
  const colorMap: Record<string, string> = {
    blue:    "bg-blue-500/10 border-blue-500/20 text-blue-400",
    emerald: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    cyan:    "bg-cyan-500/10 border-cyan-500/20 text-cyan-400",
    gray:    "bg-gray-500/10 border-gray-500/20 text-gray-400",
  }
  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
      <div className={`w-9 h-9 rounded-xl border flex items-center justify-center mb-3 ${colorMap[color] ?? colorMap.gray}`}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={icon} />
        </svg>
      </div>
      <p className="text-xl font-bold text-white">{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{label}</p>
    </div>
  )
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-800/50 rounded-xl p-3">
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-white">{value}</p>
    </div>
  )
}
