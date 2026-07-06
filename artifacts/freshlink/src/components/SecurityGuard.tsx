"use client"

import { useEffect, useState, useCallback } from "react"

interface Props {
  children: React.ReactNode
  /** Skip GPS check for backoffice-only roles that never need location */
  skipGps?: boolean
}

type Phase = "checking" | "requesting_perms" | "fake_gps" | "denied_perms" | "ok"
type PermStep = "idle" | "requesting" | "confirm_retry"

// Known emulator / fake GPS provider package names sent in some browsers
const SUSPICIOUS_PROVIDERS = ["mock", "fused-mock", "test", "fake", "emulator"]

// iOS Safari ne permet PAS de simuler le GPS (aucune API mock sans jailbreak), et
// son watchPosition renvoie des positions identiques très rapprochées → les
// heuristiques de timing/précision y donnent des FAUX POSITIFS. On les saute sur iOS.
function isIOS(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent || ""
  return /iP(hone|ad|od)/.test(ua) || (navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1)
}

function LeafIcon() {
  return (
    <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M12 2C6 2 3 8 3 14c0 3 1.5 5.5 4 7m5-19c6 0 9 6 9 12 0 3-1.5 5.5-4 7M12 21V9m0 0C9 7 7 5 7 3m5 6c3-2 5-4 5-6" />
    </svg>
  )
}

export default function SecurityGuard({ children, skipGps = false }: Props) {
  const [phase, setPhase]     = useState<Phase>("checking")
  const [detail, setDetail]   = useState("")
  const [permStep, setPermStep] = useState<PermStep>("idle")

  // ── GPS fake detection ──────────────────────────────────────────────────────
  const detectFakeGPS = useCallback(() => {
    return new Promise<"ok" | "fake" | "unavailable">((resolve) => {
      if (!navigator.geolocation) { resolve("unavailable"); return }
      // iOS : impossible de simuler le GPS via Safari → on n'applique aucune
      // heuristique (sinon faux positif « GPS fictif » sur iPhone).
      if (isIOS()) { resolve("ok"); return }

      let sampleCount = 0
      const suspicious: boolean[] = []

      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          sampleCount++
          // Seul signal FIABLE d'émulateur : précision EXACTEMENT 0 (le vrai GPS
          // renvoie toujours une précision > 0). On a retiré le test de timing qui
          // donnait des faux positifs (callbacks rapprochés légitimes sur mobile).
          if (pos.coords.accuracy === 0) suspicious.push(true)

          // Nom de provider explicitement « mock/fake » (rare, Android dev mode).
          const extended = pos as GeolocationPosition & { provider?: string }
          if (extended.provider && SUSPICIOUS_PROVIDERS.some(p => extended.provider!.toLowerCase().includes(p))) {
            suspicious.push(true)
          }

          // Après 3 échantillons : « fake » seulement si signal FORT (≥ 2/3 suspects).
          if (sampleCount >= 3) {
            navigator.geolocation.clearWatch(watchId)
            resolve(suspicious.length >= 2 ? "fake" : "ok")
          }
        },
        () => resolve("unavailable"),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      )

      // Timeout fallback — if we can't get 3 samples, assume ok
      setTimeout(() => {
        navigator.geolocation.clearWatch(watchId)
        resolve("ok")
      }, 10000)
    })
  }, [])

  // ── Permission request ──────────────────────────────────────────────────────
  const requestPermissions = useCallback(async () => {
    setPhase("requesting_perms")
    setDetail("")

    try {
      // Caméra (REQUISE) — contrainte simple { video: true } : facingMode strict
      // échoue sur certains Android et bloquait l'accès à tort.
      const camStream = await navigator.mediaDevices.getUserMedia({ video: true })
      camStream.getTracks().forEach(t => t.stop())
    } catch (err) {
      // On ne BLOQUE que sur un vrai refus (NotAllowedError/SecurityError).
      // Caméra occupée par une autre app, absente ou instable (NotReadableError,
      // NotFoundError, AbortError, OverconstrainedError) ≠ refus → on n'enferme
      // PAS l'utilisateur (cause fréquente de blocage Android). Il pourra prendre
      // ses photos plus tard ; le navigateur redemandera l'accès à ce moment-là.
      const name = (err as DOMException)?.name
      if (name === "NotAllowedError" || name === "SecurityError") {
        setPhase("denied_perms")
        setDetail("camera")
        return
      }
      // sinon : on laisse passer.
    }

    // Micro (OPTIONNEL) — pour l'agent IA vocal uniquement. On le tente mais on ne
    // bloque JAMAIS l'accès s'il est refusé/indisponible (cause de blocage Android).
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      micStream.getTracks().forEach(t => t.stop())
    } catch { /* micro refusé → on continue quand même */ }

    // App accessible IMMÉDIATEMENT après l'autorisation caméra/micro — la détection
    // GPS fictif tourne EN ARRIÈRE-PLAN (n'enferme pas l'utilisateur et ne le fait
    // pas attendre 10 s ; bascule en fake_gps uniquement si réellement avéré).
    setPhase("ok")
    if (!skipGps) detectFakeGPS().then(r => { if (r === "fake") setPhase("fake_gps") }).catch(() => {})
  }, [skipGps, detectFakeGPS])

  // ── Initial check ───────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true

    async function init() {
      // Check if permissions already granted via Permissions API
      try {
        // On ne dépend QUE de la caméra (le micro est optionnel) — interroger
        // « microphone » plante sur certains navigateurs Android et bloquait tout.
        const camPerm = await navigator.permissions.query({ name: "camera" as PermissionName })

        if (camPerm.state === "granted") {
          // Caméra déjà accordée → on ouvre TOUT DE SUITE ; GPS fictif en arrière-plan.
          if (mounted) setPhase("ok")
          if (!skipGps) detectFakeGPS().then(r => { if (mounted && r === "fake") setPhase("fake_gps") }).catch(() => {})
        } else if (camPerm.state === "denied") {
          if (mounted) {
            setPhase("denied_perms")
            setDetail("camera")
          }
        } else {
          // Prompt state — show the request screen
          if (mounted) setPhase("requesting_perms")
        }
      } catch {
        // Permissions API not available — show request screen
        if (mounted) setPhase("requesting_perms")
      }
    }

    init()
    return () => { mounted = false }
  }, [skipGps, detectFakeGPS])

  // ── Render phases ───────────────────────────────────────────────────────────

  if (phase === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "oklch(0.08 0.008 145)" }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "oklch(0.58 0.18 148)" }}>
            <LeafIcon />
          </div>
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "oklch(0.58 0.18 148)", borderTopColor: "transparent" }} />
          <p className="text-sm font-medium" style={{ color: "oklch(0.52 0.010 145)" }}>Verification securite...</p>
        </div>
      </div>
    )
  }

  if (phase === "fake_gps") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "oklch(0.08 0.008 145)" }}>
        <div className="max-w-sm w-full rounded-2xl overflow-hidden" style={{ background: "oklch(0.12 0.010 145)", border: "1px solid oklch(0.28 0.10 27)" }}>
          <div className="h-1" style={{ background: "oklch(0.54 0.22 27)" }} />
          <div className="p-8 flex flex-col items-center gap-5 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "oklch(0.16 0.06 27)" }}>
              <svg className="w-7 h-7" style={{ color: "oklch(0.65 0.22 27)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h2 className="font-bold text-lg mb-1" style={{ color: "oklch(0.96 0.006 100)" }}>GPS fictif detecte</h2>
              <p className="text-sm leading-relaxed" style={{ color: "oklch(0.52 0.010 145)" }}>
                Votre localisation GPS semble falsifiee. L&apos;application FreshLink necessite une position GPS reelle pour fonctionner correctement.
              </p>
            </div>
            <div className="w-full rounded-xl p-4 text-left text-xs leading-relaxed space-y-1" style={{ background: "oklch(0.10 0.008 145)", color: "oklch(0.52 0.010 145)" }}>
              <p className="font-semibold" style={{ color: "oklch(0.65 0.22 27)" }}>Comment resoudre :</p>
              <p>1. Desactivez toute application de simulation GPS.</p>
              <p>2. Desactivez le mode developpeur Android si actif.</p>
              <p>3. Redemarrez l&apos;application apres correction.</p>
            </div>
            <button onClick={() => window.location.reload()}
              className="w-full py-3 rounded-xl font-bold text-sm"
              style={{ background: "oklch(0.54 0.22 27)", color: "#fff" }}>
              Reessayer
            </button>
            {/* Échappatoire : un faux positif GPS (Android) ne doit jamais bloquer. */}
            <button onClick={() => setPhase("ok")}
              className="w-full py-2 text-xs underline transition-all hover:opacity-80"
              style={{ color: "oklch(0.50 0.010 145)" }}>
              Continuer quand même →
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (phase === "denied_perms") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "oklch(0.08 0.008 145)" }}>
        <div className="max-w-sm w-full rounded-2xl overflow-hidden" style={{ background: "oklch(0.12 0.010 145)", border: "1px solid oklch(0.28 0.10 27)" }}>
          <div className="h-1" style={{ background: "oklch(0.54 0.22 27)" }} />
          <div className="p-8 flex flex-col items-center gap-5 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "oklch(0.16 0.06 27)" }}>
              <svg className="w-7 h-7" style={{ color: "oklch(0.65 0.22 27)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {detail === "camera"
                  ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                }
              </svg>
            </div>
            <div>
              <h2 className="font-bold text-lg mb-1" style={{ color: "oklch(0.96 0.006 100)" }}>
                Acces {detail === "camera" ? "camera" : "microphone"} refuse
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "oklch(0.52 0.010 145)" }}>
                FreshLink necessite l&apos;acces {detail === "camera" ? "a la camera" : "au microphone"} pour le controle qualite, les photos de livraison et la verification des produits.
              </p>
            </div>
            <div className="w-full rounded-xl p-4 text-left text-xs leading-relaxed space-y-1.5" style={{ background: "oklch(0.10 0.008 145)", color: "oklch(0.52 0.010 145)" }}>
              <p className="font-semibold" style={{ color: "oklch(0.65 0.22 27)" }}>Activer la caméra :</p>
              <p><span className="font-medium" style={{ color: "oklch(0.75 0.12 100)" }}>Android (Chrome) :</span> touchez l&apos;icône 🔒 / ⓘ à gauche de l&apos;adresse → Autorisations → {detail === "camera" ? "Appareil photo" : "Micro"} → Autoriser, puis « Réessayer ».</p>
              <p><span className="font-medium" style={{ color: "oklch(0.75 0.12 100)" }}>Si « Autoriser » est grisé :</span> Réglages Android → Applications → Chrome → Autorisations → {detail === "camera" ? "Appareil photo" : "Micro"}.</p>
              <p><span className="font-medium" style={{ color: "oklch(0.75 0.12 100)" }}>iPhone :</span> Réglages → Safari → {detail === "camera" ? "Caméra" : "Micro"} → Autoriser.</p>
            </div>
            {/* Two clear choices */}
            <div className="w-full flex flex-col gap-2">
              {/* Choice 1: I went to settings and activated — reload to recheck */}
              <button
                onClick={() => window.location.reload()}
                className="w-full py-3 rounded-xl font-bold text-sm transition-all hover:opacity-90 active:scale-95"
                style={{ background: "oklch(0.58 0.18 148)", color: "#fff" }}
              >
                Activer la permission
              </button>

              {/* Choice 2: show a help tooltip then confirm */}
              {permStep !== "confirm_retry" ? (
                <button
                  onClick={() => setPermStep("confirm_retry")}
                  className="w-full py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-80"
                  style={{ background: "oklch(0.18 0.012 145)", color: "oklch(0.60 0.008 145)", border: "1px solid oklch(0.24 0.012 145)" }}
                >
                  Comment activer ?
                </button>
              ) : (
                <div className="rounded-xl p-4 text-xs space-y-2" style={{ background: "oklch(0.10 0.008 145)", border: "1px solid oklch(0.22 0.012 145)" }}>
                  <p className="font-bold text-sm mb-1" style={{ color: "oklch(0.85 0.006 100)" }}>
                    Activez la permission {detail === "camera" ? "Camera" : "Microphone"} :
                  </p>
                  <p style={{ color: "oklch(0.62 0.008 145)" }}>
                    <span className="font-semibold" style={{ color: "oklch(0.75 0.12 100)" }}>Android : </span>
                    Parametres &gt; Applications &gt; Navigateur &gt; Autorisations
                  </p>
                  <p style={{ color: "oklch(0.62 0.008 145)" }}>
                    <span className="font-semibold" style={{ color: "oklch(0.75 0.12 100)" }}>iPhone : </span>
                    Reglages &gt; Safari &gt; {detail === "camera" ? "Camera" : "Microphone"} &gt; Autoriser
                  </p>
                  <p style={{ color: "oklch(0.62 0.008 145)" }}>
                    <span className="font-semibold" style={{ color: "oklch(0.75 0.12 100)" }}>Chrome : </span>
                    Cadenas dans la barre URL &gt; Autorisations
                  </p>
                  <button
                    onClick={() => window.location.reload()}
                    className="w-full mt-2 py-2.5 rounded-xl font-bold text-sm"
                    style={{ background: "oklch(0.58 0.18 148)", color: "#fff" }}
                  >
                    Confirmer — c&apos;est fait
                  </button>
                </div>
              )}

              {/* Échappatoire : ne jamais enfermer l'utilisateur. Il peut entrer
                  et autoriser la caméra plus tard, au moment de prendre une photo. */}
              <button
                onClick={() => setPhase("ok")}
                className="w-full py-2 text-xs underline mt-1 transition-all hover:opacity-80"
                style={{ color: "oklch(0.50 0.010 145)" }}
              >
                Continuer sans la caméra pour le moment →
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (phase === "requesting_perms") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "oklch(0.08 0.008 145)" }}>
        <div className="max-w-sm w-full rounded-2xl overflow-hidden" style={{ background: "oklch(0.12 0.010 145)", border: "1px solid oklch(0.22 0.012 145)" }}>
          <div className="h-1" style={{ background: "oklch(0.58 0.18 148)" }} />
          <div className="p-8 flex flex-col items-center gap-6 text-center">
            {/* Logo */}
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "oklch(0.58 0.18 148)" }}>
              <LeafIcon />
            </div>
            <div>
              <h1 className="font-bold text-xl mb-1" style={{ color: "oklch(0.96 0.006 100)" }}>Vita Fresh</h1>
              <p className="text-sm" style={{ color: "oklch(0.52 0.010 145)" }}>
                Distribution Fruits &amp; Legumes
              </p>
            </div>

            <p className="text-sm leading-relaxed" style={{ color: "oklch(0.65 0.008 145)" }}>
              Pour fonctionner correctement, FreshLink necessite l&apos;acces a votre <strong style={{ color: "oklch(0.80 0.10 100)" }}>camera</strong>, votre <strong style={{ color: "oklch(0.80 0.10 100)" }}>microphone</strong> et votre <strong style={{ color: "oklch(0.80 0.10 100)" }}>localisation GPS</strong>.
            </p>

            {/* Feature list */}
            <div className="w-full space-y-3">
              {[
                { icon: "M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z", label: "Camera", desc: "Photos de controle qualite et livraison" },
                { icon: "M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z", label: "Microphone", desc: "Agent IA vocal et commandes vocales" },
                { icon: "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z", label: "GPS reel", desc: "Suivi livreurs et verification fraude" },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-3 px-4 py-3 rounded-xl text-left"
                  style={{ background: "oklch(0.16 0.012 145)", border: "1px solid oklch(0.22 0.012 145)" }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "oklch(0.20 0.020 148)" }}>
                    <svg className="w-4 h-4" style={{ color: "oklch(0.65 0.18 148)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: "oklch(0.85 0.008 145)" }}>{item.label}</p>
                    <p className="text-xs" style={{ color: "oklch(0.50 0.008 145)" }}>{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Primary CTA — triggers the real browser permission dialog */}
            <button
              onClick={() => { setPermStep("requesting"); requestPermissions() }}
              disabled={permStep === "requesting"}
              className="w-full py-3.5 rounded-xl font-bold text-sm transition-all hover:opacity-90 active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background: "oklch(0.58 0.18 148)", color: "#fff" }}
            >
              {permStep === "requesting" ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Demande en cours...
                </>
              ) : (
                "Activer les permissions"
              )}
            </button>

            <p className="text-[11px] leading-relaxed" style={{ color: "oklch(0.38 0.008 145)" }}>
              Ces permissions sont requises uniquement pour les fonctionnalites operationnelles. Aucune donnee n&apos;est partagee avec des tiers.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // phase === "ok"
  return <>{children}</>
}
