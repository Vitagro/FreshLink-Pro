"use client"
// ════════════════════════════════════════════════════════════════════════════
//  CallCenter — appels audio 1:1 DANS l'ERP (hors WhatsApp).
//  • Média : WebRTC (RTCPeerConnection) + micro (getUserMedia).
//  • Signalisation : Supabase Realtime broadcast, canal "fl-calls" (offer/
//    answer/ice/hangup), filtrée par destinataire (to === user.id).
//  • NAT : STUN public Google. ⚠ Pour une fiabilité 4G/NAT symétrique il faut
//    un serveur TURN (à provisionner) — sans lui, l'appel peut échouer sur
//    certains réseaux mobiles. Le composant accepte un TURN optionnel via
//    NEXT_PUBLIC_TURN_URL / _USER / _CRED.
//  Monté une fois par layout (mobile + back-office). L'appel se déclenche par
//  un évènement window "fl-call-start" {detail:{id,name}} (depuis la messagerie).
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { RealtimeChannel } from "@supabase/supabase-js"
import type { User } from "@/lib/store"
import { ring, notify } from "@/lib/notify"

type Phase = "idle" | "calling" | "incoming" | "connected"
type Signal = { kind: "offer" | "answer" | "ice" | "hangup"; to: string; from: { id: string; name: string }; data?: unknown }

// Repli STUN + TURN public gratuit (identifiants publics, pas un secret) si
// /api/turn est indisponible ou si le quota mensuel Cloudflare est atteint.
const STATIC_FALLBACK: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
]

// Récupère des identifiants TURN Cloudflare éphémères via /api/turn (le token API
// reste côté serveur). `usedTurn` = relais dédié servi → on comptabilisera l'appel.
async function fetchIceServers(userId: string): Promise<{ servers: RTCIceServer[]; usedTurn: boolean }> {
  try {
    const r = await fetch("/api/turn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }) })
    if (r.ok) {
      const j = await r.json()
      const ice = Array.isArray(j.iceServers) ? (j.iceServers as RTCIceServer[]) : null
      if (ice && ice.length) return { servers: ice, usedTurn: j.source === "cloudflare" }
    }
  } catch { /* repli ci-dessous */ }
  return { servers: STATIC_FALLBACK, usedTurn: false }
}

export default function CallCenter({ user }: { user: User }) {
  const [phase, setPhase] = useState<Phase>("idle")
  const [peer, setPeer] = useState<{ id: string; name: string } | null>(null)
  const [muted, setMuted] = useState(false)
  const [secs, setSecs] = useState(0)
  const [iceState, setIceState] = useState<string>("")   // diagnostic visible (ex: "checking", "failed")

  const phaseRef = useRef<Phase>("idle")
  const setPhaseR = (p: Phase) => { phaseRef.current = p; setPhase(p) }
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const localRef = useRef<MediaStream | null>(null)
  const chanRef = useRef<RealtimeChannel | null>(null)
  const pendingOffer = useRef<RTCSessionDescriptionInit | null>(null)
  const peerRef = useRef<{ id: string; name: string } | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const secsRef = useRef(0)            // durée courante (pour le suivi quota TURN)
  const usedTurnRef = useRef(false)    // l'appel a-t-il servi le relais Cloudflare ?
  const [note, setNote] = useState<string | null>(null)   // message d'état (hors ligne, micro…)
  const onlineRef = useRef<Set<string>>(new Set())         // utilisateurs en ligne (présence)
  const ringTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const disabledRef = useRef(false)                        // appels désactivés pour CET utilisateur ?
  const pendingIce = useRef<RTCIceCandidateInit[]>([])      // candidats ICE reçus avant la remoteDescription

  // Récupère l'état "appels désactivés" pour cet utilisateur (admin peut le couper).
  useEffect(() => {
    let on = true
    fetch("/api/turn", { cache: "no-store" })
      .then(r => r.json())
      .then(j => { if (on) disabledRef.current = Array.isArray(j.disabled) && j.disabled.includes(user.id) })
      .catch(() => {})
    return () => { on = false }
  }, [user.id])

  const flash = (msg: string) => { setNote(msg); setTimeout(() => setNote(null), 6000) }
  const clearRing = () => { if (ringTimer.current) { clearTimeout(ringTimer.current); ringTimer.current = null } }

  const setPeerR = (p: { id: string; name: string } | null) => { peerRef.current = p; setPeer(p) }
  const send = (s: Signal) => { void chanRef.current?.send({ type: "broadcast", event: "signal", payload: s }) }

  const cleanup = () => {
    // Suivi quota : si l'appel a utilisé le relais Cloudflare, on remonte la durée.
    if (usedTurnRef.current && secsRef.current > 0) {
      try {
        void fetch("/api/turn/usage", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seconds: secsRef.current, userId: user.id, userName: user.name }),
        })
      } catch { /* noop */ }
    }
    usedTurnRef.current = false; secsRef.current = 0
    clearRing()
    try { pcRef.current?.close() } catch { /* noop */ }
    pcRef.current = null
    localRef.current?.getTracks().forEach(t => t.stop()); localRef.current = null
    pendingOffer.current = null
    pendingIce.current = []
    setPhaseR("idle"); setPeerR(null); setMuted(false); setSecs(0); setIceState("")
  }

  // Un candidat ICE peut arriver (canal broadcast) avant que setRemoteDescription()
  // ait fini côté local — addIceCandidate() échoue alors silencieusement et le
  // candidat est perdu pour de bon. On les met en attente et on les rejoue dès que
  // la remoteDescription est posée (offer côté receveur, answer côté appelant).
  const flushIce = async (pc: RTCPeerConnection) => {
    const list = pendingIce.current
    pendingIce.current = []
    for (const c of list) {
      try { await pc.addIceCandidate(c) } catch { /* noop */ }
    }
  }

  const newPC = async (peerId: string) => {
    const { servers, usedTurn } = await fetchIceServers(user.id)
    usedTurnRef.current = usedTurn
    const pc = new RTCPeerConnection({ iceServers: servers })
    pc.onicecandidate = e => { if (e.candidate) send({ kind: "ice", to: peerId, from: { id: user.id, name: user.name }, data: e.candidate.toJSON() }) }
    pc.ontrack = e => { if (audioRef.current) { audioRef.current.srcObject = e.streams[0]; void audioRef.current.play().catch(() => {}) } }
    // Connexion réellement rompue (pas juste un flottement réseau passager, cf.
    // "disconnected" qui se rétablit souvent seul) → on informe et on raccroche
    // proprement plutôt que de laisser l'appel muet indéfiniment.
    pc.oniceconnectionstatechange = () => {
      setIceState(pc.iceConnectionState)
      if (pc.iceConnectionState === "failed" && phaseRef.current === "connected" && peerRef.current) {
        flash("Connexion perdue — réseau instable.")
        hangup()
      }
    }
    pcRef.current = pc
    return pc
  }

  const getMic = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true })
      localRef.current = s
      return s
    } catch (err) {
      throw new Error((err as DOMException)?.name === "NotAllowedError" ? "MIC_DENIED" : "MIC_FAIL")
    }
  }

  const startCall = async (target: { id: string; name: string }) => {
    if (phaseRef.current !== "idle" || target.id === user.id) return
    setNote(null)
    if (disabledRef.current) { flash("Vos appels ont été désactivés par l'administrateur."); return }
    // Présence : indicatif seulement, PAS bloquant. Sur mobile, la présence
    // temps réel tombe dès que l'app passe en arrière-plan (WebSocket suspendu
    // par l'OS) alors que l'app est toujours ouverte et peut revenir au premier
    // plan pendant la sonnerie (35 s) — bloquer ici provoquait des appels
    // refusés à tort ("hors ligne") pour des destinataires bien joignables.
    if (onlineRef.current.size > 0 && !onlineRef.current.has(target.id)) {
      flash(`${target.name} semble hors ligne — tentative d'appel quand même…`)
    }
    try {
      setPeerR(target); setPhaseR("calling")
      // Micro d'abord, réseau ensuite : sur Android WebView, le geste utilisateur
      // qui autorise l'invite de permission micro peut expirer après un await
      // réseau (fetch ICE servers) — le demander en premier évite un refus muet.
      const mic = await getMic()
      const pc = await newPC(target.id)
      mic.getTracks().forEach(t => pc.addTrack(t, mic))
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      send({ kind: "offer", to: target.id, from: { id: user.id, name: user.name }, data: offer })
      // Sonnerie : 35 s sans réponse → on abandonne proprement (pas de "Appel en cours…" infini).
      clearRing()
      ringTimer.current = setTimeout(() => {
        if (phaseRef.current === "calling") { flash(`Pas de réponse de ${target.name}.`); hangup() }
      }, 35000)
    } catch (e) {
      flash((e as Error)?.message === "MIC_DENIED"
        ? "Micro refusé — autorisez le micro pour passer un appel."
        : "Impossible de démarrer l'appel.")
      cleanup()
    }
  }

  const accept = async () => {
    const p = peerRef.current
    if (!p || !pendingOffer.current) return
    try {
      // Même raison que côté appelant : micro avant tout await réseau, sinon
      // le geste de tap sur "Accepter" peut ne plus être considéré "frais" par
      // la WebView Android au moment de la demande getUserMedia().
      const mic = await getMic()
      const pc = await newPC(p.id)
      mic.getTracks().forEach(t => pc.addTrack(t, mic))
      await pc.setRemoteDescription(pendingOffer.current)
      await flushIce(pc)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      send({ kind: "answer", to: p.id, from: { id: user.id, name: user.name }, data: answer })
      setPhaseR("connected")
    } catch (e) {
      flash((e as Error)?.message === "MIC_DENIED" ? "Micro refusé — autorisez le micro." : "Échec de la connexion.")
      hangup()
    }
  }

  const hangup = () => { const p = peerRef.current; if (p) send({ kind: "hangup", to: p.id, from: { id: user.id, name: user.name } }); cleanup() }

  const toggleMute = () => {
    const s = localRef.current; if (!s) return
    const next = !muted; s.getAudioTracks().forEach(t => { t.enabled = !next }); setMuted(next)
  }

  const handleSignal = async (s: Signal) => {
    if (s.kind === "offer") {
      // Appels désactivés pour cet utilisateur → on refuse poliment (pas de sonnerie).
      if (disabledRef.current) { send({ kind: "hangup", to: s.from.id, from: { id: user.id, name: user.name } }); return }
      if (phaseRef.current !== "idle") { send({ kind: "hangup", to: s.from.id, from: { id: user.id, name: user.name } }); return }
      pendingOffer.current = s.data as RTCSessionDescriptionInit
      setPeerR(s.from); setPhaseR("incoming")
    } else if (s.kind === "answer") {
      clearRing()
      const pc = pcRef.current
      try {
        await pc?.setRemoteDescription(s.data as RTCSessionDescriptionInit)
        if (pc) await flushIce(pc)
      } catch { /* noop */ }
      setPhaseR("connected")
    } else if (s.kind === "ice") {
      const pc = pcRef.current
      const data = s.data as RTCIceCandidateInit
      if (pc && pc.remoteDescription) {
        try { await pc.addIceCandidate(data) } catch { /* noop */ }
      } else {
        pendingIce.current.push(data)
      }
    } else if (s.kind === "hangup") {
      cleanup()
    }
  }
  const handlerRef = useRef(handleSignal)
  handlerRef.current = handleSignal

  // Abonnement à la signalisation + PRÉSENCE (qui est en ligne / joignable)
  useEffect(() => {
    if (!user?.id) return
    const sb = createClient()
    const ch = sb.channel("fl-calls", { config: { broadcast: { self: false }, presence: { key: user.id } } })
    ch.on("broadcast", { event: "signal" }, ({ payload }) => {
      const s = payload as Signal
      if (s && s.to === user.id) void handlerRef.current(s)
    })
    ch.on("presence", { event: "sync" }, () => {
      try { onlineRef.current = new Set(Object.keys(ch.presenceState())) } catch { /* noop */ }
    })
    ch.subscribe((status) => {
      // On se déclare « en ligne » dès l'abonnement → les autres peuvent nous appeler.
      if (status === "SUBSCRIBED") { void ch.track({ user_id: user.id, at: Date.now() }) }
    })
    chanRef.current = ch
    return () => { void sb.removeChannel(ch); chanRef.current = null }
  }, [user?.id])

  // Déclenchement depuis la messagerie
  useEffect(() => {
    const onStart = (e: Event) => { const d = (e as CustomEvent).detail as { id: string; name: string }; if (d) void startCall(d) }
    window.addEventListener("fl-call-start", onStart as EventListener)
    return () => window.removeEventListener("fl-call-start", onStart as EventListener)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Chrono appel connecté
  useEffect(() => {
    if (phase !== "connected") return
    const iv = setInterval(() => setSecs(s => { secsRef.current = s + 1; return s + 1 }), 1000)
    return () => clearInterval(iv)
  }, [phase])

  // Sonnerie + notification sur appel ENTRANT (s'arrête dès qu'on décroche/raccroche).
  useEffect(() => {
    if (phase !== "incoming") return
    notify("📞 Appel entrant", `${peerRef.current?.name ?? "Quelqu'un"} vous appelle`, "fl-call")
    const stop = ring()
    return () => stop()
  }, [phase])

  const mmss = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`

  return (
    <>
      <audio ref={audioRef} autoPlay hidden />
      {note && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: phase !== "idle" ? 96 : 16, zIndex: 10000, display: "flex", justifyContent: "center", padding: "0 12px", pointerEvents: "none" }}>
          <div className="max-w-md w-full rounded-xl bg-slate-800 text-white text-sm px-4 py-3 shadow-2xl border border-slate-600 text-center">
            {note}
          </div>
        </div>
      )}
      {phase !== "idle" && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 9999, display: "flex", justifyContent: "center", padding: "12px", pointerEvents: "none" }}>
          <div style={{ pointerEvents: "auto" }} className="w-full max-w-md rounded-2xl bg-slate-900 text-white shadow-2xl border border-slate-700 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-emerald-600 flex items-center justify-center text-lg font-bold">
                {(peer?.name ?? "?").slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold truncate">{peer?.name ?? "Appel"}</p>
                <p className="text-xs text-slate-300">
                  {phase === "calling" ? "Appel en cours…" : phase === "incoming" ? "Appel entrant…" : `En communication · ${mmss}`}
                  {iceState && phase !== "incoming" && <span className="text-slate-500"> · {iceState}</span>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {phase === "incoming" && (
                  <button onClick={() => void accept()} className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-bold">Accepter</button>
                )}
                {phase === "connected" && (
                  <button onClick={toggleMute} className={`px-3 py-2 rounded-xl text-sm font-bold ${muted ? "bg-amber-500" : "bg-slate-700 hover:bg-slate-600"}`}>{muted ? "Activer micro" : "Couper micro"}</button>
                )}
                <button onClick={hangup} className="px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-sm font-bold">
                  {phase === "incoming" ? "Refuser" : "Raccrocher"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
