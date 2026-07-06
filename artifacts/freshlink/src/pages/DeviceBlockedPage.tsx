"use client"

import { useState, useEffect, useRef, Suspense } from "react"
import { useLocation, useRouter } from 'wouter'

// ── Types ──────────────────────────────────────────────────────────────────────
type Step = "form" | "waiting" | "blocked" | "approved"

interface GpsCoords {
  lat: number
  lng: number
  accuracy: number
}

// ── Fingerprint (browser-side) ─────────────────────────────────────────────────
async function generateFingerprint(): Promise<string> {
  const parts = [
    navigator.userAgent,
    navigator.language,
    `${screen.width}x${screen.height}`,
    String(screen.colorDepth),
    String(new Date().getTimezoneOffset()),
    String(navigator.hardwareConcurrency ?? 0),
    navigator.platform ?? "",
  ]
  try {
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    if (ctx) {
      ctx.textBaseline = "top"
      ctx.font = "14px Arial"
      ctx.fillText("VitaFresh🌿", 2, 2)
      parts.push(canvas.toDataURL().slice(-32))
    }
  } catch {}
  const raw = parts.join("|")
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw))
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
}

// ── GPS en arrière-plan (silencieux) ──────────────────────────────────────────
function requestGpsSilent(): Promise<GpsCoords | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      () => resolve(null),
      { timeout: 10_000, maximumAge: 0, enableHighAccuracy: true }
    )
  })
}

// ── Supabase (depuis les variables d'env publiques) ────────────────────────────
function getSupabase() {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  return { url, key }
}

// ── Numéro WhatsApp de Jawad (super admin) ─────────────────────────────────────
const JAWAD_WA = "212647333456"
const STORAGE_KEY = "vf_erp_gate_v1"

// ── Composant principal ────────────────────────────────────────────────────────
function AccessGateContent() {
  const [location] = useLocation()
  const router   = useRouter()
  const fromPath = new URLSearchParams(window.location.search).get('from') ?? '/'
  const [_loc, navigate] = useLocation()

  const [step,        setStep]        = useState<Step>("form")
  const [nom,         setNom]         = useState("")
  const [phone,       setPhone]       = useState("")
  const [error,       setError]       = useState("")
  const [loading,     setLoading]     = useState(false)
  const [fingerprint, setFingerprint] = useState("")
  const [pollSeconds, setPollSeconds] = useState(0)

  // ── Admin login caché ──────────────────────────────────────────────────────
  const [logoClicks,   setLogoClicks]   = useState(0)
  const [showAdmin,    setShowAdmin]    = useState(false)
  const [adminEmail,   setAdminEmail]   = useState("")
  const [adminPass,    setAdminPass]    = useState("")
  const [adminError,   setAdminError]   = useState("")
  const [adminLoading, setAdminLoading] = useState(false)

  const pollingRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const logoTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Charger état sauvegardé ────────────────────────────────────────────────
  useEffect(() => {
    generateFingerprint().then(async fp => {
      setFingerprint(fp)
      // Vérification IMMÉDIATE à l'ouverture : si le contrôle d'accès est désactivé
      // (ou si l'appareil est déjà autorisé), check-and-token pose le cookie tout de
      // suite → on entre sans même voir le formulaire. Indispensable : le middleware
      // redirige toujours ici un appareil sans cookie, même contrôle désactivé.
      try {
        const res  = await fetch("/api/device/check-and-token", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fingerprint: fp }),
        })
        const data = await res.json()
        if (data.approved) {
          localStorage.removeItem(STORAGE_KEY)
          setStep("approved")
          // Navigation dure → le middleware revoit la requête AVEC le nouveau cookie.
          setTimeout(() => window.location.replace(fromPath), 500)
          return
        }
      } catch { /* hors ligne → on retombe sur le flux normal ci-dessous */ }
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null")
        if (saved?.fingerprint === fp && saved?.step === "waiting") {
          setNom(saved.nom ?? "")
          setPhone(saved.phone ?? "")
          setStep("waiting")
          startPolling(fp)
        }
      } catch {}
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Clic logo → activer panel admin (5 clics en 3s) ───────────────────────
  function handleLogoClick() {
    const next = logoClicks + 1
    setLogoClicks(next)
    if (logoTimer.current) clearTimeout(logoTimer.current)
    logoTimer.current = setTimeout(() => setLogoClicks(0), 3000)
    if (next >= 5) {
      setLogoClicks(0)
      setShowAdmin(v => !v)
    }
  }

  // ── Login admin (fl_users via /api/ext/auth → sadmin cookie) ─────────────
  async function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault()
    setAdminError(""); setAdminLoading(true)
    try {
      // Détecter si l'identifiant est un téléphone (chiffres/espaces/+) ou un email
      const identifier = adminEmail.trim()
      const isPhone    = /^[\d\s\+\-\.\(\)]{6,}$/.test(identifier)
      const authBody   = isPhone
        ? { phone: identifier, password: adminPass }
        : { email: identifier, password: adminPass }

      // 1. Authentifier via fl_users (service role — bypass RLS)
      const authRes = await fetch("/api/ext/auth", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(authBody),
      })
      const authData = await authRes.json()

      if (!authRes.ok || !authData.user) {
        setAdminError(authData?.error ?? "Identifiant ou mot de passe incorrect.")
        setAdminLoading(false); return
      }

      const { id: userId, role } = authData.user as { id: string; role: string }

      // 2. Seul Jawad (super_super_admin) peut débloquer les appareils.
      //    Un autre admin doit avoir été promu super_super_admin par Jawad.
      if (role !== "super_super_admin") {
        setAdminError("Accès refusé — seul Jawad peut débloquer les appareils.")
        setAdminLoading(false); return
      }

      // 3. Poser le cookie sadmin (bypass device guard)
      const sadminRes = await fetch("/api/admin-session", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ userId }),
      })
      if (!sadminRes.ok) { setAdminError("Erreur serveur."); setAdminLoading(false); return }

      // 4. Rediriger vers l'app
      setStep("approved")
      setTimeout(() => navigate(fromPath), 800)

    } catch (err) {
      setAdminError("Erreur réseau : " + String(err))
    }
    setAdminLoading(false)
  }

  // ── Soumission formulaire utilisateur ──────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nom.trim() || !phone.trim()) { setError("Nom et téléphone sont obligatoires."); return }
    setError(""); setLoading(true)

    // GPS en arrière-plan (silencieux, pas affiché à l'utilisateur)
    const coords = await requestGpsSilent()

    // Enregistrer dans Supabase
    try {
      await fetch("/api/device/request-access", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fingerprint,
          nom:           nom.trim(),
          phone:         phone.trim(),
          gps_lat:       coords?.lat,
          gps_lng:       coords?.lng,
          gps_precision: coords?.accuracy,
          userAgent:     navigator.userAgent,
        }),
      })
    } catch { /* continuer même si Supabase KO */ }

    // WhatsApp vers Jawad (avec GPS pour sa référence, invisible pour l'user)
    const mapsUrl = coords
      ? `https://maps.google.com/?q=${coords.lat.toFixed(6)},${coords.lng.toFixed(6)}`
      : ""

    const msg = [
      "🔐 *DEMANDE D'ACCÈS — FreshLink ERP*",
      "━━━━━━━━━━━━━━━━━━━━",
      `👤 *Nom :* ${nom.trim()}`,
      `📱 *Tél :* ${phone.trim()}`,
      `🔑 *Device ID :* ${fingerprint.slice(0, 16)}...`,
      coords
        ? `📍 *Position :* ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}\n🗺️ *Maps :* ${mapsUrl}\n📐 *Précision :* ${Math.round(coords.accuracy)}m`
        : "📍 *Position :* non disponible",
      `🕒 *Date :* ${new Date().toLocaleString("fr-FR")}`,
      "━━━━━━━━━━━━━━━━━━━━",
      "✅ *Pour autoriser :*",
      "FreshLink ERP → Admin → Accès Appareils → Approuver",
    ].join("\n")

    window.open(`https://wa.me/${JAWAD_WA}?text=${encodeURIComponent(msg)}`, "_blank")

    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      fingerprint, nom: nom.trim(), phone: phone.trim(),
      step: "waiting", sentAt: new Date().toISOString(),
    }))

    setLoading(false)
    setStep("waiting")
    startPolling(fingerprint)
  }

  // ── Polling approbation ────────────────────────────────────────────────────
  function startPolling(fp: string) {
    if (pollingRef.current) clearInterval(pollingRef.current)
    let elapsed = 0
    pollingRef.current = setInterval(async () => {
      elapsed += 30
      setPollSeconds(elapsed)
      try {
        const res  = await fetch("/api/device/check-and-token", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fingerprint: fp }),
        })
        const data = await res.json()
        if (data.approved) {
          if (pollingRef.current) clearInterval(pollingRef.current)
          localStorage.removeItem(STORAGE_KEY)
          setStep("approved")
          setTimeout(() => navigate(fromPath), 1500)
        } else if (data.statut === "bloque") {
          if (pollingRef.current) clearInterval(pollingRef.current)
          setStep("blocked")
        }
      } catch {}
    }, 30_000)
  }

  useEffect(() => () => {
    if (pollingRef.current) clearInterval(pollingRef.current)
    if (logoTimer.current) clearTimeout(logoTimer.current)
  }, [])

  // ── Renvoyer notification ──────────────────────────────────────────────────
  function resend() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")
      const msg = [
        "🔔 *RAPPEL — Demande accès FreshLink ERP*",
        `👤 ${saved.nom ?? "?"}  📱 ${saved.phone ?? "?"}`,
        `🔑 Device : ${fingerprint.slice(0, 16)}...`,
        "✅ Pour autoriser : FreshLink ERP → Admin → Accès Appareils → Approuver",
      ].join("\n")
      window.open(`https://wa.me/${JAWAD_WA}?text=${encodeURIComponent(msg)}`, "_blank")
    } catch {}
  }

  // ── Réinitialiser ─────────────────────────────────────────────────────────
  function reset() {
    localStorage.removeItem(STORAGE_KEY)
    if (pollingRef.current) clearInterval(pollingRef.current)
    setStep("form"); setNom(""); setPhone(""); setError("")
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-5"
      style={{ background: "linear-gradient(135deg,#060d0a 0%,#0d2218 50%,#060d0a 100%)" }}
    >
      {/* Logo (5 clics → panel admin) */}
      <div className="mb-7 flex flex-col items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
        <img
          src="/vita-fresh-logo.svg"
          alt="Vita Fresh"
          className="h-16 w-auto object-contain cursor-pointer select-none"
          onClick={handleLogoClick}
          draggable={false}
          onError={e => {
            const el = e.currentTarget as HTMLImageElement
            el.style.display = "none"
          }}
        />
        <p className="text-xs font-bold tracking-widest uppercase" style={{ color: "#4ade80" }}>
          Vita Fresh ERP — Espace sécurisé
        </p>
      </div>

      {/* ── Panel admin caché ── */}
      {showAdmin && (
        <div
          className="w-full max-w-md rounded-3xl overflow-hidden mb-4"
          style={{ background: "rgba(184,150,46,0.08)", border: "1px solid rgba(184,150,46,0.25)" }}
        >
          <form onSubmit={handleAdminLogin} className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">🔑</span>
              <h3 className="font-black text-sm" style={{ color: "#b8962e" }}>Connexion Administrateur</h3>
            </div>
            <div className="space-y-3 mb-4">
              <input
                type="text"
                value={adminEmail}
                onChange={e => setAdminEmail(e.target.value)}
                placeholder="Email ou téléphone"
                required
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#f1f5f9" }}
              />
              <input
                type="password"
                value={adminPass}
                onChange={e => setAdminPass(e.target.value)}
                placeholder="Mot de passe"
                required
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#f1f5f9" }}
              />
            </div>
            {adminError && (
              <div className="mb-3 px-3 py-2 rounded-lg text-xs" style={{ background: "rgba(220,38,38,0.1)", color: "#fca5a5" }}>
                {adminError}
              </div>
            )}
            <button
              type="submit"
              disabled={adminLoading}
              className="w-full py-2.5 rounded-xl font-bold text-sm"
              style={{ background: adminLoading ? "rgba(184,150,46,0.3)" : "linear-gradient(135deg,#b8962e,#d4a93a)", color: "#fff", cursor: adminLoading ? "not-allowed" : "pointer" }}
            >
              {adminLoading ? "Connexion..." : "Se connecter"}
            </button>
          </form>
        </div>
      )}

      {/* ── Carte principale ── */}
      <div
        className="w-full max-w-md rounded-3xl overflow-hidden"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", backdropFilter: "blur(24px)" }}
      >

        {/* ══ ÉTAPE 1 : Formulaire ══ */}
        {step === "form" && (
          <form onSubmit={handleSubmit} className="p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(220,38,38,0.15)", border: "1px solid rgba(220,38,38,0.3)" }}>
                <svg className="w-5 h-5" fill="none" stroke="#f87171" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <h1 className="text-base font-black" style={{ color: "#f1f5f9" }}>Accès restreint</h1>
                <p className="text-xs" style={{ color: "#64748b" }}>Cet appareil n&apos;est pas encore autorisé</p>
              </div>
            </div>

            <p className="text-sm mb-6 leading-relaxed" style={{ color: "#94a3b8" }}>
              Vita Fresh ERP est réservé aux membres de l&apos;équipe.
              Entrez vos informations pour soumettre une demande d&apos;accès à{" "}
              <strong style={{ color: "#4ade80" }}>Jawad — Super Administrateur</strong>.
            </p>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: "#64748b" }}>
                  Nom complet
                </label>
                <input
                  type="text"
                  value={nom}
                  onChange={e => setNom(e.target.value)}
                  placeholder="Prénom et Nom"
                  required
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(255,255,255,0.1)", color: "#f1f5f9" }}
                  onFocus={e => { e.currentTarget.style.borderColor = "#4ade80" }}
                  onBlur={e  => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)" }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: "#64748b" }}>
                  Téléphone WhatsApp
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="06 XX XX XX XX"
                  required
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(255,255,255,0.1)", color: "#f1f5f9" }}
                  onFocus={e => { e.currentTarget.style.borderColor = "#4ade80" }}
                  onBlur={e  => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)" }}
                />
              </div>
            </div>

            {error && (
              <div className="mb-4 px-4 py-3 rounded-xl text-xs" style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.2)", color: "#fca5a5" }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2"
              style={{
                background: loading ? "rgba(26,79,42,0.4)" : "linear-gradient(135deg,#1a4f2a,#2d7a46)",
                color: loading ? "#4ade8080" : "#fff",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Envoi en cours...
                </>
              ) : (
                "Demander l'accès"
              )}
            </button>

            <p className="mt-4 text-center text-[11px]" style={{ color: "#374151" }}>
              🔒 Votre demande sera examinée par l&apos;administrateur.
            </p>
          </form>
        )}

        {/* ══ ÉTAPE 2 : En attente ══ */}
        {step === "waiting" && (
          <div className="p-8 text-center">
            <div
              className="w-16 h-16 rounded-full mx-auto mb-5 flex items-center justify-center text-2xl"
              style={{ background: "linear-gradient(135deg,#1a4f2a,#2d7a46)", animation: "pulseRing 2s infinite" }}
            >
              ⏳
            </div>
            <h2 className="text-lg font-black mb-2" style={{ color: "#f1f5f9" }}>Demande envoyée !</h2>
            <p className="text-sm leading-relaxed mb-5" style={{ color: "#94a3b8" }}>
              Votre demande a été transmise à{" "}
              <strong style={{ color: "#4ade80" }}>Jawad</strong> via WhatsApp.
              <br /><br />
              L&apos;accès est vérifié automatiquement.<br />
              Durée habituelle : <strong style={{ color: "#f1f5f9" }}>quelques minutes</strong>.
            </p>

            {pollSeconds > 0 && (
              <div className="mb-5 text-xs" style={{ color: "#475569" }}>
                🔄 Dernière vérification : {pollSeconds < 60 ? `${pollSeconds}s` : `${Math.floor(pollSeconds / 60)}min`}
              </div>
            )}

            <div className="flex gap-3 justify-center flex-wrap">
              <button
                onClick={resend}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{ background: "rgba(26,79,42,0.2)", border: "1px solid rgba(74,222,128,0.2)", color: "#4ade80" }}
              >
                🔔 Renvoyer
              </button>
              <button
                onClick={reset}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#64748b" }}
              >
                ↩️ Recommencer
              </button>
            </div>

            <p className="mt-5 text-[11px]" style={{ color: "#1e293b" }}>
              Rechargez la page si vous avez déjà été autorisé (F5).
            </p>
          </div>
        )}

        {/* ══ ÉTAPE 3 : Bloqué ══ */}
        {step === "blocked" && (
          <div className="p-8 text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 text-3xl"
              style={{ background: "rgba(220,38,38,0.15)", border: "1px solid rgba(220,38,38,0.3)" }}
            >
              🚫
            </div>
            <h2 className="text-lg font-black mb-2" style={{ color: "#f1f5f9" }}>Accès refusé</h2>
            <p className="text-sm mb-5" style={{ color: "#94a3b8" }}>
              Votre demande a été refusée par l&apos;administrateur.<br />
              Contactez Jawad pour plus d&apos;informations.
            </p>
            <a
              href={`https://wa.me/${JAWAD_WA}?text=${encodeURIComponent("Bonjour Jawad, mon accès à FreshLink Pro a été refusé. Pouvez-vous m'aider ?")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-6 py-3 rounded-xl text-sm font-bold"
              style={{ background: "#25d366", color: "#fff" }}
            >
              💬 Contacter Jawad
            </a>
          </div>
        )}

        {/* ══ ÉTAPE 4 : Approuvé ══ */}
        {step === "approved" && (
          <div className="p-8 text-center">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 text-3xl"
              style={{ background: "linear-gradient(135deg,#1a4f2a,#2d7a46)", boxShadow: "0 0 32px rgba(26,79,42,.6)" }}
            >
              ✅
            </div>
            <h2 className="text-lg font-black mb-2" style={{ color: "#4ade80" }}>Accès autorisé !</h2>
            <p className="text-sm" style={{ color: "#94a3b8" }}>
              Bienvenue sur Vita Fresh ERP.<br />
              Redirection en cours...
            </p>
            <div className="mt-5">
              <svg className="w-6 h-6 animate-spin mx-auto" fill="none" viewBox="0 0 24 24" style={{ color: "#4ade80" }}>
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <p className="mt-6 text-[10px] font-semibold tracking-wider" style={{ color: "#1e293b" }}>
        ⚡ Vita Fresh ERP · Powered by VitaCore Group
      </p>

      <style>{`
        @keyframes pulseRing {
          0%   { box-shadow: 0 0 0 0   rgba(26,79,42,.4); }
          70%  { box-shadow: 0 0 0 20px rgba(26,79,42,0); }
          100% { box-shadow: 0 0 0 0   rgba(26,79,42,0); }
        }
      `}</style>
    </div>
  )
}

export default function DeviceBlockedPage() {
  return (
    <Suspense>
      <AccessGateContent />
    </Suspense>
  )
}
