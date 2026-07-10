"use client"

import { useState, useEffect, useCallback } from "react"
import { store, type User, type UserRole, ROLE_LABELS, getUserInterface, passwordMatches, isDemoUser } from "@/lib/store"
import FreshLinkLogo from "@/components/ui/FreshLinkLogo"
import { sendEmail } from "@/lib/email"

// ── WebAuthn helpers ───────────────────────────────────────────────────────────

const LS_WEBAUTHN = "fl_webauthn_credentials"

interface StoredCredential {
  userId:       string
  userName:     string
  credentialId: string
  publicKey:    string // base64 stored client-side (demo — real prod uses server)
}

function b64url(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

function getStoredCreds(): StoredCredential[] {
  try { return JSON.parse(localStorage.getItem(LS_WEBAUTHN) ?? "[]") } catch { return [] }
}
function saveStoredCreds(c: StoredCredential[]) {
  localStorage.setItem(LS_WEBAUTHN, JSON.stringify(c))
}

async function registerBiometric(user: User): Promise<boolean> {
  if (!window.PublicKeyCredential) return false
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32))
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: "FreshLink Pro", id: window.location.hostname },
        user: {
          id: new TextEncoder().encode(user.id),
          name: user.email,
          displayName: user.name,
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
        },
        timeout: 60000,
      },
    }) as PublicKeyCredential | null
    if (!cred) return false
    const existing = getStoredCreds().filter(c => c.userId !== user.id)
    saveStoredCreds([...existing, {
      userId:       user.id,
      userName:     user.name,
      credentialId: b64url((cred.rawId as ArrayBuffer)),
      publicKey:    "registered",
    }])
    return true
  } catch { return false }
}

async function authenticateBiometric(): Promise<StoredCredential | null> {
  if (!window.PublicKeyCredential) return null
  const stored = getStoredCreds()
  if (!stored.length) return null
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32))
    await navigator.credentials.get({
      publicKey: {
        challenge,
        userVerification: "required",
        timeout: 60000,
        allowCredentials: stored.map(c => ({
          type: "public-key" as const,
          id: Uint8Array.from(atob(c.credentialId.replace(/-/g, "+").replace(/_/g, "/")), x => x.charCodeAt(0)),
        })),
      },
    })
    // If we reach here the authenticator accepted — return first matching user
    return stored[0]
  } catch { return null }
}

interface Props { onLogin: (user: User, forceView?: "mobile" | "backoffice") => void }

type ExternalType = "particulier" | "marchand" | "chr" | "fournisseur"

// Comptes de démonstration : plus de liste codée en dur — la liste déroulante
// de l'écran de connexion se construit dynamiquement à partir des comptes
// marqués `isDemo` (case à cocher côté BO, réservée à Jawad). Tant qu'aucun
// compte demo n'existe, le bloc reste masqué.
const EXTERNAL_ROLES: UserRole[] = ["client", "client_proprietaire", "client_gerant", "fournisseur"]
const DEMO_GROUP_FALLBACK = "Autres"
const DEMO_ROLE_GROUP: Partial<Record<UserRole, string>> = {
  super_super_admin: "Direction", super_admin: "Direction", admin: "Direction",
  resp_commercial: "Direction", resp_achat: "Direction", rh_manager: "Direction",
  it_admin: "Direction", auditeur: "Direction", investisseur: "Direction",
  cash_man: "Finance", financier: "Finance", comptable: "Finance", charge_recouvrement: "Finance",
  prevendeur: "Commercial", team_leader: "Commercial", suivi_commande: "Commercial",
  resp_logistique: "Logistique", magasinier: "Logistique", dispatcheur: "Logistique", livreur: "Logistique",
  acheteur: "Logistique", ctrl_achat: "Logistique", ctrl_prep: "Logistique", chef_depot: "Logistique", qualite: "Logistique",
}
const DEMO_GROUP_ORDER = ["Direction", "Finance", "Commercial", "Logistique", DEMO_GROUP_FALLBACK]

function generatePassword(len = 10): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#"
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
}

const FEATURES = [
  { icon: "M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1 1 .03 2.694-1.338 2.694H4.136c-1.368 0-2.337-1.694-1.338-2.694L4 15.3", label: "11 Agents IA experts metier 24/7", color: "#4ADE80" },
  { icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2", label: "Commandes & BL temps reel", color: "#3b82f6" },
  { icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4", label: "Trips & tournees automatiques", color: "#0ea5e9" },
  { icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2", label: "Finance, credit & caisse", color: "#8b5cf6" },
  { icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z", label: "Dashboard & KPIs avances", color: "#f59e0b" },
]

const IA_AGENTS = [
  { id: 1,  name: "Acheteur Expert",  dept: "Achat",      desc: "Sourcing & négociation prix",    color: "#10b981" },
  { id: 2,  name: "Vendeur Terrain",  dept: "Commercial", desc: "Prospection & tournées terrain",  color: "#10b981" },
  { id: 3,  name: "Supply Chain",     dept: "Logistique", desc: "Optimisation flux & stocks",      color: "#3b82f6" },
  { id: 4,  name: "Expert CHR",       dept: "Commercial", desc: "Restauration, hôtels, traiteur",  color: "#3b82f6" },
  { id: 5,  name: "Logistique IA",    dept: "Dispatch",   desc: "Affectation & livraisons",        color: "#0ea5e9" },
  { id: 6,  name: "Ctrl Gestion",     dept: "Finance",    desc: "P&L & marges temps réel",         color: "#8b5cf6" },
  { id: 7,  name: "Financier IA",     dept: "Finance",    desc: "Trésorerie & recouvrement",       color: "#8b5cf6" },
  { id: 8,  name: "Qualité Produit",  dept: "Qualité",    desc: "DLC, fraîcheur, rotation",        color: "#f59e0b" },
  { id: 9,  name: "Qualité Système",  dept: "Qualité",    desc: "HACCP & processus certifiés",     color: "#f59e0b" },
  { id: 10, name: "RH & Paie",        dept: "RH",         desc: "Équipe, salaires, matricules",    color: "#ec4899" },
  { id: 11, name: "Auditeur IA",      dept: "Audit",      desc: "Contrôle interne & risques",      color: "#06b6d4" },
]

export default function LoginPage({ onLogin }: Props) {
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPwd, setShowPwd] = useState(false)
  const [clientMode, setClientMode] = useState(false)
  const [chrPwd, setChrPwd] = useState("")
  const [pendingUser, setPendingUser] = useState<User | null>(null)
  const [showForgot, setShowForgot] = useState(false)
  const [forgotEmail, setForgotEmail] = useState("")
  const [forgotStatus, setForgotStatus] = useState<"idle" | "sending" | "sent" | "notfound">("idle")
  const [showDemo, setShowDemo] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<string>("")
  const [externalType, setExternalType] = useState<ExternalType>("particulier")
  const [demoInternal, setDemoInternal] = useState<User[]>([])
  const [demoExternal, setDemoExternal] = useState<User[]>([])

  const refreshDemoAccounts = useCallback(() => {
    const demo = store.getUsers().filter(isDemoUser)
    setDemoInternal(demo.filter(u => !EXTERNAL_ROLES.includes(u.role)))
    setDemoExternal(demo.filter(u => EXTERNAL_ROLES.includes(u.role)))
  }, [])

  useEffect(() => {
    refreshDemoAccounts()
    window.addEventListener("fl_store_updated", refreshDemoAccounts)
    return () => window.removeEventListener("fl_store_updated", refreshDemoAccounts)
  }, [refreshDemoAccounts])

  const demoGroups = DEMO_GROUP_ORDER.filter(g =>
    demoInternal.some(u => (DEMO_ROLE_GROUP[u.role] ?? DEMO_GROUP_FALLBACK) === g)
  )
  const activeGroup = demoGroups.includes(selectedGroup) ? selectedGroup : demoGroups[0]
  const hasDemoAccounts = demoInternal.length > 0 || demoExternal.length > 0

  // ── Must-change-password flow ────────────────────────────────────────────────
  const [mustChangePwd, setMustChangePwd]     = useState<User | null>(null)
  const [newPwd1, setNewPwd1]                 = useState("")
  const [newPwd2, setNewPwd2]                 = useState("")
  const [changePwdError, setChangePwdError]   = useState("")
  const [changePwdLoading, setChangePwdLoading] = useState(false)

  const handleChangePassword = async () => {
    if (!mustChangePwd) return
    if (newPwd1.length < 6) { setChangePwdError("Minimum 6 caractères requis"); return }
    if (newPwd1 !== newPwd2) { setChangePwdError("Les mots de passe ne correspondent pas"); return }
    setChangePwdLoading(true)
    const users = store.getUsers()
    const idx = users.findIndex(u => u.id === mustChangePwd.id)
    if (idx >= 0) {
      users[idx] = { ...users[idx], password: newPwd1, mustChangePassword: false }
      store.saveUsers(users)
    }
    const updatedUser = { ...mustChangePwd, password: newPwd1, mustChangePassword: false }
    setChangePwdLoading(false)
    setMustChangePwd(null)
    await offerBiometricAfterLogin(updatedUser)
  }

  // ── Entrance animations ──────────────────────────────────────────────────────
  const [companyBrand, setCompanyBrand] = useState(() => store.getCompanyConfig())
  const [panelIn, setPanelIn] = useState(false)
  const [typedText, setTypedText] = useState("")
  const TYPED_TARGET = "de bout en bout"
  const [heroTilt, setHeroTilt] = useState({ x: 0, y: 0 })
  function onHeroMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    setHeroTilt({ x: (e.clientX - r.left) / r.width - 0.5, y: (e.clientY - r.top) / r.height - 0.5 })
  }
  function onHeroMouseLeave() { setHeroTilt({ x: 0, y: 0 }) }

  useEffect(() => {
    const t = setTimeout(() => setPanelIn(true), 80)
    return () => clearTimeout(t)
  }, [])

  // ── Rafraîchir fl_users depuis Supabase au chargement de la page ───────────
  // store.login() ne lit QUE le cache localStorage : un compte créé sur un
  // autre appareil (visible dans Supabase + BO) restait invisible ici jusqu'à
  // ce qu'une synchro post-connexion se déclenche — sauf qu'il faut déjà être
  // connecté pour ça. On hydrate donc le cache AVANT toute tentative de login.
  useEffect(() => {
    import("@/lib/supabase/db").then(db => db.fetchUsers()).catch(() => { /* offline → cache local existant */ })
  }, [])

  useEffect(() => {
    if (!panelIn) return
    let i = 0
    setTypedText("")
    const tick = setInterval(() => {
      i++
      setTypedText(TYPED_TARGET.slice(0, i))
      if (i >= TYPED_TARGET.length) clearInterval(tick)
    }, 55)
    return () => clearInterval(tick)
  }, [panelIn])

  // ── Biometric / WebAuthn ────────────────────────────────────────────────────
  const [biometricSupported, setBiometricSupported]   = useState(false)
  const [biometricRegistered, setBiometricRegistered] = useState(false)
  const [biometricLoading, setBiometricLoading]       = useState(false)
  const [biometricError, setBiometricError]           = useState("")
  const [showBiometricTip, setShowBiometricTip]       = useState(false)
  const [loggedInUser, setLoggedInUser]               = useState<User | null>(null)

  useEffect(() => {
    const check = async () => {
      if (!window.PublicKeyCredential) return
      const avail = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false)
      setBiometricSupported(avail)
      setBiometricRegistered(getStoredCreds().length > 0)
    }
    check()
  }, [])

  // ── Auto-trigger biometric when credentials already registered ───────────────
  const autoTriggeredRef = { current: false }
  useEffect(() => {
    if (!biometricSupported || !biometricRegistered || autoTriggeredRef.current) return
    autoTriggeredRef.current = true
    const timer = setTimeout(async () => {
      setBiometricLoading(true)
      setBiometricError("")
      setError("")
      const cred = await authenticateBiometric()
      setBiometricLoading(false)
      if (!cred) return // user dismissed — let them use password
      const u = store.getUsers().find(usr => usr.id === cred.userId)
      if (!u) { setBiometricError("Utilisateur introuvable. Connectez-vous manuellement."); return }
      const iface = getUserInterface(u)
      if (iface === "both") {
        const fv = store.loginGetForcedView(u.email, u.password ?? "")
        if (fv) { onLogin(u, fv) } else { setPendingUser(u) }
      } else { onLogin(u) }
    }, 800)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biometricSupported, biometricRegistered])

  // Called right after a successful password login to offer biometric enrollment
  const offerBiometricAfterLogin = useCallback(async (user: User) => {
    setLoggedInUser(user)
    if (!biometricSupported) return
    if (getStoredCreds().some(c => c.userId === user.id)) return
    setShowBiometricTip(true)
  }, [biometricSupported])

  const handleRegisterBiometric = async () => {
    if (!loggedInUser) return
    setBiometricLoading(true); setBiometricError("")
    const ok = await registerBiometric(loggedInUser)
    setBiometricLoading(false)
    if (ok) {
      setBiometricRegistered(true)
      setShowBiometricTip(false)
      // Determine correct view for this user
      const iface = getUserInterface(loggedInUser)
      if (iface === "both") {
        const fv = store.loginGetForcedView(loggedInUser.email, loggedInUser.password ?? "")
        if (fv) { onLogin(loggedInUser, fv) } else { setPendingUser(loggedInUser) }
      } else { onLogin(loggedInUser) }
    } else {
      setBiometricError("Enregistrement annule ou echoue. Connexion classique utilisee.")
      const iface = getUserInterface(loggedInUser)
      setTimeout(() => {
        setShowBiometricTip(false)
        if (iface === "both") {
          const fv = store.loginGetForcedView(loggedInUser!.email, loggedInUser!.password ?? "")
          if (fv) { onLogin(loggedInUser!, fv) } else { setPendingUser(loggedInUser) }
        } else { onLogin(loggedInUser!) }
      }, 1500)
    }
  }

  const handleBiometricLogin = async () => {
    setBiometricLoading(true); setBiometricError(""); setError("")
    const cred = await authenticateBiometric()
    setBiometricLoading(false)
    if (!cred) {
      setBiometricError("Authentification biometrique echouee ou annulee.")
      return
    }
    const user = store.getUsers().find(u => u.id === cred.userId)
    if (!user) { setBiometricError("Utilisateur introuvable. Reconnectez-vous manuellement."); return }
    const iface = getUserInterface(user)
    if (iface === "both") {
      const forcedView = store.loginGetForcedView(user.email, user.password ?? "")
      if (forcedView) { onLogin(user, forcedView) } else { setPendingUser(user) }
    } else { onLogin(user) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError("")
    await new Promise(r => setTimeout(r, 300))
    if (clientMode) {
      if (!identifier.trim()) { setError("Veuillez entrer votre identifiant / دخل اسمك أو رقمك"); setLoading(false); return }
      const raw = identifier.trim()
      const isPhone = /^[\+0]/.test(raw) && raw.replace(/[\s\-\.]/g, "").length >= 8
      const isEmail = raw.includes("@")
      // Map UI type to store login type
      const loginSubtype = externalType  // pass the full subtype directly to loginExternal
      if (externalType === "chr" && !isPhone && !isEmail) {
        setError("CHR : utilisez votre email ou téléphone / CHR: دير الإيميل ولا الهاتف")
        setLoading(false); return
      }
      let extUser = store.loginExternal(raw, loginSubtype)
      if (!extUser) {
        // Cache local pas encore hydraté (compte créé depuis un autre appareil) → un
        // dernier essai après un rafraîchissement explicite avant de déclarer l'échec.
        try { const db = await import("@/lib/supabase/db"); await db.fetchUsers(); extUser = store.loginExternal(raw, loginSubtype) } catch { /* offline */ }
      }
      if (!extUser) { setError("Identifiant non trouvé — contactez votre commercial / ما لقيناكش — تواصل مع المسؤول"); setLoading(false); return }
      // CHR clients require a password
      if (externalType === "chr") {
        if (!chrPwd.trim()) { setError("Mot de passe requis pour les clients CHR / كلمة السر ضرورية"); setLoading(false); return }
        if (extUser.password && !passwordMatches(extUser.password, chrPwd.trim())) {
          setError("Mot de passe incorrect / كلمة السر خاطئة"); setLoading(false); return
        }
      }
      onLogin(extUser)
      return
    }
    if (!identifier.trim() || !password.trim()) { setError("Remplissez tous les champs"); setLoading(false); return }
    let user = store.login(identifier.trim(), password)
    if (!user) {
      // Cache local pas encore hydraté (compte créé/modifié depuis un autre appareil,
      // visible dans Supabase + BO mais absent du cache localStorage de CET appareil)
      // → un dernier essai après un rafraîchissement explicite avant de déclarer l'échec.
      try { const db = await import("@/lib/supabase/db"); await db.fetchUsers(); user = store.login(identifier.trim(), password) } catch { /* offline */ }
    }
    if (user) {
      // ── Super admin bypass: exempt du Device Guard (pas de validation MAC) ──
      if (user.role === "super_super_admin") {
        fetch("/api/admin-session", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ userId: user.id }),
        }).catch(() => {/* silently ignore — app still works without it */})
      }
      // First-login: must change password before continuing
      if (user.mustChangePassword) {
        setMustChangePwd(user)
        setLoading(false)
        return
      }
      // Offer biometric enrollment after first successful password login
      setLoggedInUser(user)
      if (biometricSupported && !getStoredCreds().some(c => c.userId === user.id)) {
        setShowBiometricTip(true)
        setLoading(false)
        return
      }
      const iface = getUserInterface(user)
      if (iface === "both") {
        const forcedView = store.loginGetForcedView(identifier.trim(), password)
        if (forcedView) {
          onLogin(user, forcedView)
        } else { setPendingUser(user); setLoading(false) }
      } else {
        onLogin(user)
      }
    } else { setError("Identifiant ou mot de passe incorrect"); setLoading(false) }
  }

  const handleForgotPassword = async () => {
    if (!forgotEmail.trim() || !forgotEmail.includes("@")) { setForgotStatus("notfound"); return }
    setForgotStatus("sending")
    const users = store.getUsers()
    const found = users.find(u => (u.email ?? "").toLowerCase() === forgotEmail.toLowerCase().trim())
    if (!found) { setForgotStatus("notfound"); return }
    const newPwd = generatePassword()
    const idx = users.findIndex(u => u.id === found.id)
    if (idx >= 0) { users[idx] = { ...users[idx], password: newPwd }; store.saveUsers(users) }
    await sendEmail({ to_email: found.email, subject: "FreshLink Pro — Nouveau mot de passe", body: `Bonjour ${found.name},\n\nVotre nouveau mot de passe FreshLink Pro :\n  Email : ${found.email}\n  Mot de passe : ${newPwd}\n\nMerci de le changer lors de votre prochaine connexion.` })
    setForgotStatus("sent")
  }

  // ── Must-change-password screen ──────────────────────────────────────────────
  if (mustChangePwd) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 font-sans">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-amber-200 shadow-lg p-8 flex flex-col gap-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center">
              <svg className="w-7 h-7 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <div>
              <p className="text-base font-black text-slate-800">Changement de mot de passe requis</p>
              <p className="text-xs text-slate-500 mt-1">Bonjour <strong>{mustChangePwd.name}</strong> — créez votre mot de passe personnel avant de continuer.</p>
              <p className="text-[10px] text-amber-600 mt-1 font-semibold" dir="rtl">مرحبا — يرجى تغيير كلمة السر الخاصة بك</p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600">Nouveau mot de passe</label>
              <input
                type="password"
                value={newPwd1}
                onChange={e => { setNewPwd1(e.target.value); setChangePwdError("") }}
                placeholder="Min. 6 caractères"
                className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600">Confirmer le mot de passe</label>
              <input
                type="password"
                value={newPwd2}
                onChange={e => { setNewPwd2(e.target.value); setChangePwdError("") }}
                placeholder="Répétez le mot de passe"
                className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            {changePwdError && (
              <p className="text-xs text-red-600 font-medium px-1">{changePwdError}</p>
            )}

            {/* Password strength indicator */}
            <div className="flex gap-1">
              {[4, 6, 8, 10].map(min => (
                <div key={min} className={`h-1 flex-1 rounded-full transition-colors ${
                  newPwd1.length >= min ? "bg-green-500" : "bg-slate-200"
                }`} />
              ))}
            </div>
            <p className="text-[10px] text-slate-400 text-center">
              {newPwd1.length < 4 ? "Trop court" : newPwd1.length < 6 ? "Faible" : newPwd1.length < 8 ? "Bon" : "Fort ✓"}
            </p>

            <button
              onClick={handleChangePassword}
              disabled={changePwdLoading || newPwd1.length < 6}
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold transition-colors disabled:opacity-50"
            >
              {changePwdLoading ? "Enregistrement..." : "Confirmer mon mot de passe"}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Interface picker ─────────────────────────────────────────────────────────
  if (pendingUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 font-sans">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-lg p-8 flex flex-col gap-6">
          <div className="flex flex-col items-center gap-3">
            <FreshLinkLogo size={44} />
            <div className="text-center">
              <p className="text-base font-bold text-slate-800">Bonjour, {pendingUser.name}</p>
              <p className="text-sm text-slate-500 mt-0.5">Choisissez votre interface</p>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <button onClick={() => onLogin(pendingUser, "backoffice")}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 transition-colors">
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Back Office — Bureau
            </button>
            <button onClick={() => onLogin(pendingUser, "mobile")}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-green-600 text-white font-semibold text-sm hover:bg-green-700 transition-colors">
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              Application Mobile — Terrain
            </button>
            <button onClick={() => setPendingUser(null)}
              className="text-sm text-slate-400 hover:text-slate-600 transition-colors text-center py-1">
              Retour
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col font-sans" style={{ background: "#f1f5f3" }}>

      {/* ── Mobile top bar — visible on sm only ────────────────────────────────── */}
      <div className="md:hidden flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-white shadow-sm shrink-0"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg overflow-hidden border border-slate-200 shadow-sm shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={companyBrand.logo || "/vita-fresh-logo.png"} alt={companyBrand.appName || "FreshLink Pro"} className="w-full h-full object-contain p-0.5" />
          </div>
          <div>
            <p className="text-sm font-black leading-tight" style={{ color: "#1a4f2a" }}>
              {companyBrand.appName || "FreshLink Pro"}
            </p>
            <p className="text-[10px] font-bold" style={{ color: "#b8962e" }}>{companyBrand.appSlogan || companyBrand.nom || "Vita Fresh"}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border"
          style={{ background: "rgba(26,79,42,0.06)", borderColor: "rgba(26,79,42,0.2)", color: "#1a4f2a" }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#4ADE80" }} />
          Maroc
        </div>
      </div>

      {/* ── Main content row ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

      {/* ── Left brand panel — hidden on mobile, visible md+ ─────────────────── */}
      <div className="hidden md:flex flex-col justify-between w-[360px] lg:w-[420px] shrink-0 px-5 py-7 lg:px-8 lg:py-9 relative overflow-hidden"
        style={{ background: "linear-gradient(160deg, #0a1f14 0%, #0d2a1a 60%, #112d1c 100%)", borderRight: "1px solid rgba(74,222,128,0.08)" }}>

        {/* Grid texture */}
        <div className="absolute inset-0 opacity-[0.035]"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #4ADE80 1px, transparent 0)", backgroundSize: "20px 20px" }} />
        {/* Glow accents */}
        <div className="absolute -top-20 -right-10 w-48 h-48 rounded-full opacity-[0.15]"
          style={{ background: "radial-gradient(circle, #4ADE80 0%, transparent 70%)" }} />
        <div className="absolute -bottom-16 -left-8 w-40 h-40 rounded-full opacity-[0.08]"
          style={{ background: "radial-gradient(circle, #22c55e 0%, transparent 70%)" }} />

        <div className="relative flex flex-col gap-6">
          {/* Logo — scale + fade in */}
          <div style={{
            opacity: panelIn ? 1 : 0,
            transform: panelIn ? "scale(1) translateY(0)" : "scale(0.8) translateY(-8px)",
            transition: "opacity 0.5s ease, transform 0.5s cubic-bezier(0.34,1.56,0.64,1)",
          }}>
            <FreshLinkLogo size={38} variant="full-white" />
          </div>

          {/* Headline — slide up */}
          <div style={{
            opacity: panelIn ? 1 : 0,
            transform: panelIn ? "translateY(0)" : "translateY(16px)",
            transition: "opacity 0.5s ease 0.15s, transform 0.5s ease 0.15s",
          }}>
            <h2 className="text-xl font-black text-white leading-snug mb-2">
              Pilotez vos flux<br/>
              <span style={{ color: "#4ADE80" }}>
                {typedText}
                {typedText.length < TYPED_TARGET.length && (
                  <span className="inline-block w-[2px] h-[1em] ml-0.5 align-middle rounded-sm animate-pulse" style={{ background: "#4ADE80" }} />
                )}
              </span>
            </h2>
            <p className="text-xs leading-relaxed" style={{ color: "#6b9e7e" }}>
              Distribution fruits & légumes — gestion complète en temps réel.
            </p>
          </div>

          {/* Feature bento grid — staggered, per-feature accent color */}
          <div className="grid grid-cols-2 gap-2">
            {FEATURES.map((feat, i) => (
              <div key={feat.label} className="rounded-xl p-2.5 flex flex-col gap-1.5 transition-transform hover:-translate-y-0.5"
                style={{
                  background: `${feat.color}12`,
                  border: `1px solid ${feat.color}28`,
                  opacity: panelIn ? 1 : 0,
                  transform: panelIn ? "translateY(0) scale(1)" : "translateY(10px) scale(0.94)",
                  transition: `opacity 0.4s ease ${0.3 + i * 0.07}s, transform 0.4s ease ${0.3 + i * 0.07}s`,
                }}>
                <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                  style={{ background: `${feat.color}20`, border: `1px solid ${feat.color}38` }}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke={feat.color} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={feat.icon} />
                  </svg>
                </div>
                <span className="text-[10.5px] leading-snug font-medium" style={{ color: "#a8d4b8" }}>{feat.label}</span>
              </div>
            ))}
          </div>

          {/* Agents IA — staggered individual cards */}
          <div style={{
            opacity: panelIn ? 1 : 0,
            transform: panelIn ? "translateY(0)" : "translateY(10px)",
            transition: "opacity 0.5s ease 0.65s, transform 0.5s ease 0.65s",
          }}>
            <div className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(74,222,128,0.12)" }}>
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2.5" style={{ borderBottom: "1px solid rgba(74,222,128,0.08)", background: "rgba(74,222,128,0.04)" }}>
                <p className="text-[9px] font-black tracking-widest uppercase" style={{ color: "#4ADE80" }}>11 AGENTS IA EXPERTS — 24H/7J</p>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full" style={{ background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.2)" }}>
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#4ADE80" }} />
                  <span className="text-[8px] font-black" style={{ color: "#4ADE80" }}>ACTIFS</span>
                </div>
              </div>
              {/* Agent list */}
              <div className="flex flex-col">
                {IA_AGENTS.map((agent, i) => (
                  <div key={agent.id}
                    className="flex items-center gap-2.5 px-3 py-[7px]"
                    style={{
                      borderBottom: i < IA_AGENTS.length - 1 ? "1px solid rgba(255,255,255,0.04)" : undefined,
                      opacity: panelIn ? 1 : 0,
                      transform: panelIn ? "translateX(0)" : "translateX(-10px)",
                      transition: `opacity 0.35s ease ${0.7 + i * 0.04}s, transform 0.35s ease ${0.7 + i * 0.04}s`,
                    }}>
                    {/* Avatar */}
                    <div className="w-[22px] h-[22px] rounded-md flex items-center justify-center text-[8px] font-black text-white shrink-0"
                      style={{ background: agent.color + "dd" }}>
                      {agent.id}
                    </div>
                    {/* Name + desc */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[9.5px] font-bold leading-none truncate" style={{ color: "#c5f5e0" }}>
                        IA {agent.id} — {agent.name}
                      </p>
                      <p className="text-[7.5px] leading-none mt-0.5 truncate" style={{ color: "#4a7a5a" }}>{agent.desc}</p>
                    </div>
                    {/* Dept badge + pulse */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[7px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: agent.color + "20", color: agent.color, border: `1px solid ${agent.color}35` }}>
                        {agent.dept}
                      </span>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: "#4ADE80", opacity: 0.7, animation: `pulse ${1.2 + (i % 4) * 0.4}s ease-in-out infinite` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <p className="relative text-[10px]" style={{ color: "#374f40", opacity: panelIn ? 1 : 0, transition: "opacity 0.5s ease 0.9s" }}>
          &copy; {new Date().getFullYear()} {companyBrand.appName || "FreshLink Pro"}
        </p>
      </div>

      {/* ── Right — login form ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-start overflow-y-auto p-4 sm:p-6 pt-6"
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.035) 1px, transparent 0)",
          backgroundSize: "22px 22px",
        }}>

        {/* ── Hero banner — fraîcheur de la ferme à vous ── */}
        <div className="w-full max-w-[390px] mb-4">
          <style>{`
            @keyframes truck-move {
              0%   { transform: translateX(-8px); }
              50%  { transform: translateX(8px); }
              100% { transform: translateX(-8px); }
            }
            @keyframes leaf-bounce {
              0%, 100% { transform: translateY(0) rotate(-5deg); }
              50%       { transform: translateY(-4px) rotate(5deg); }
            }
            @keyframes dot-flow {
              0%   { opacity: 0.2; transform: scaleX(0.6); }
              50%  { opacity: 1;   transform: scaleX(1); }
              100% { opacity: 0.2; transform: scaleX(0.6); }
            }
            @keyframes fresh-pulse {
              0%, 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.3); }
              50%       { box-shadow: 0 0 0 8px rgba(16,185,129,0); }
            }
          `}</style>

          <div
            onMouseMove={onHeroMouseMove}
            onMouseLeave={onHeroMouseLeave}
            className="relative overflow-hidden rounded-2xl border border-green-200 bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 p-4"
            style={{
              transform: `perspective(700px) rotateX(${heroTilt.y * -6}deg) rotateY(${heroTilt.x * 6}deg)`,
              transition: "transform 0.2s ease-out",
              boxShadow: heroTilt.x !== 0 || heroTilt.y !== 0 ? "0 16px 40px rgba(16,185,129,0.18)" : "0 4px 14px rgba(16,185,129,0.08)",
            }}>
            {/* Top — logo + brand */}
            <div className="flex items-center justify-center gap-3 mb-3">
              <div style={{ animation: "fresh-pulse 2s ease-in-out infinite" }} className="rounded-xl">
                <FreshLinkLogo size={36} />
              </div>
              <div>
                <p className="text-sm font-black text-green-900">
                  {companyBrand.nom || companyBrand.appName || "Vita Fresh"}
                </p>
                <p className="text-[10px] font-semibold text-green-600">Distribution alimentaire professionnelle</p>
              </div>
            </div>

            {/* Journey animation — ferme → camion → vous */}
            <div className="flex items-center justify-between gap-1 px-2">
              {/* Farm */}
              <div className="flex flex-col items-center gap-1 shrink-0">
                <div className="w-11 h-11 rounded-xl bg-white border border-green-200 flex items-center justify-center shadow-sm"
                  style={{ animation: "leaf-bounce 2.5s ease-in-out infinite" }}>
                  <span className="text-xl">🌿</span>
                </div>
                <span className="text-[8px] font-bold text-green-700 uppercase tracking-wide">Ferme</span>
                <span className="text-[8px] text-green-600 font-semibold" dir="rtl">الحقل</span>
              </div>

              {/* Animated dots left */}
              <div className="flex-1 flex items-center justify-center gap-0.5">
                {[0,1,2,3].map(i => (
                  <div key={i} className="h-1 rounded-full bg-green-400"
                    style={{ width: "18%", animation: `dot-flow 1.4s ease-in-out ${i * 0.2}s infinite` }} />
                ))}
              </div>

              {/* Truck */}
              <div className="flex flex-col items-center gap-1 shrink-0">
                <div className="w-11 h-11 rounded-xl bg-white border border-emerald-200 flex items-center justify-center shadow-sm"
                  style={{ animation: "truck-move 2s ease-in-out infinite" }}>
                  <span className="text-xl">🚛</span>
                </div>
                <span className="text-[8px] font-bold text-emerald-700 uppercase tracking-wide">Livraison</span>
                <span className="text-[8px] text-emerald-600 font-semibold" dir="rtl">التوصيل</span>
              </div>

              {/* Animated dots right */}
              <div className="flex-1 flex items-center justify-center gap-0.5">
                {[0,1,2,3].map(i => (
                  <div key={i} className="h-1 rounded-full bg-teal-400"
                    style={{ width: "18%", animation: `dot-flow 1.4s ease-in-out ${i * 0.2 + 0.3}s infinite` }} />
                ))}
              </div>

              {/* You */}
              <div className="flex flex-col items-center gap-1 shrink-0">
                <div className="w-11 h-11 rounded-xl bg-white border border-teal-200 flex items-center justify-center shadow-sm"
                  style={{ animation: "leaf-bounce 2.5s ease-in-out 0.5s infinite" }}>
                  <span className="text-xl">🏪</span>
                </div>
                <span className="text-[8px] font-bold text-teal-700 uppercase tracking-wide">Vous</span>
                <span className="text-[8px] text-teal-600 font-semibold" dir="rtl">ليكم</span>
              </div>
            </div>

            {/* Tagline FR + Darija */}
            <div className="text-center mt-3 space-y-0.5">
              <p className="text-[10px] font-semibold text-green-700 opacity-90">
                ✨ Fraîcheur garantie — de la récolte à votre table
              </p>
              <p className="text-[10px] font-semibold text-green-600 opacity-70" dir="rtl">
                🌟 طازج ومضمون — من الحقل حتى لعندكم
              </p>
            </div>
          </div>
        </div>

        <div className="w-full max-w-[390px] flex flex-col gap-3.5">

          {/* Mobile logo — hidden (now shown in hero) */}
          <div className="md:hidden hidden flex items-center mb-1">
            <FreshLinkLogo size={34} />
          </div>

          {/* Heading */}
          <div>
            <h1 className="text-xl font-black text-slate-800">Connexion</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {clientMode ? "Espace Clients & Fournisseurs / فضاء الزبائن والموردين" : "Email ou nom d'utilisateur"}
            </p>
          </div>

          {/* ── Tab switcher: Personnel | Externe ── */}
          <div className="flex rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 p-1 gap-1">
            <button type="button"
              onClick={() => { setClientMode(false); setIdentifier(""); setPassword(""); setError("") }}
              className={`flex-1 py-2.5 rounded-xl text-[11px] font-bold transition-all flex flex-col items-center gap-0.5 ${
                !clientMode ? "bg-white text-green-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}>
              <span>👔 Personnel / Équipe</span>
              <span className="text-[9px] font-medium opacity-60">فريق العمل</span>
            </button>
            <button type="button"
              onClick={() => { setClientMode(true); setExternalType("particulier"); setIdentifier(""); setChrPwd(""); setError("") }}
              className={`flex-1 py-2.5 rounded-xl text-[11px] font-bold transition-all flex flex-col items-center gap-0.5 ${
                clientMode ? "bg-white text-purple-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}>
              <span>🌐 Externe / خارجي</span>
              <span className="text-[9px] font-medium opacity-60">زبائن وموردين</span>
            </button>
          </div>

          {/* Login form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-2.5" autoComplete="off">

            {/* ── External type selector — Particulier / Marchand / CHR / Fournisseur ── */}
            {clientMode && (
              <div className="grid grid-cols-2 gap-2">
                {([
                  { type: "particulier" as ExternalType, icon: "🛒", label: "Particulier", labelDarija: "زبون عادي", color: "blue" },
                  { type: "marchand"    as ExternalType, icon: "🏪", label: "Marchand",    labelDarija: "تاجر",       color: "amber" },
                  { type: "chr"        as ExternalType, icon: "🏨", label: "CHR / HORECA", labelDarija: "فنادق وماكلة", color: "purple" },
                  { type: "fournisseur" as ExternalType, icon: "🚚", label: "Fournisseur",  labelDarija: "مورد",       color: "emerald" },
                ] satisfies { type: ExternalType; icon: string; label: string; labelDarija: string; color: string }[]).map(opt => {
                  const isSelected = externalType === opt.type
                  const colors: Record<string, string> = {
                    blue:    isSelected ? "border-blue-400 bg-blue-50 text-blue-700"    : "border-slate-200 bg-white text-slate-500",
                    amber:   isSelected ? "border-amber-400 bg-amber-50 text-amber-700"  : "border-slate-200 bg-white text-slate-500",
                    purple:  isSelected ? "border-purple-400 bg-purple-50 text-purple-700": "border-slate-200 bg-white text-slate-500",
                    emerald: isSelected ? "border-emerald-400 bg-emerald-50 text-emerald-700": "border-slate-200 bg-white text-slate-500",
                  }
                  return (
                    <button key={opt.type} type="button"
                      onClick={() => { setExternalType(opt.type); setIdentifier(""); setChrPwd(""); setError("") }}
                      className={`flex flex-col items-center gap-1 py-3 px-2 rounded-xl border-2 transition-all text-center ${colors[opt.color]} ${isSelected ? "shadow-sm" : "hover:border-slate-300"}`}>
                      <span className="text-xl">{opt.icon}</span>
                      <span className="text-[10px] font-bold leading-tight">{opt.label}</span>
                      <span className="text-[9px] opacity-60 leading-tight" dir="rtl">{opt.labelDarija}</span>
                    </button>
                  )
                })}
              </div>
            )}

            {/* Identifier */}
            <div className="relative">
              <svg width="14" height="14" className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {clientMode
                  ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                }
              </svg>
              <input
                type="text"
                value={identifier}
                onChange={e => { setIdentifier(e.target.value); setError("") }}
                placeholder={
                  clientMode
                    ? externalType === "chr"
                      ? "Email ou numéro de téléphone"
                      : "Nom, numéro de téléphone ou email"
                    : "Email ou identifiant"
                }
                className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all shadow-sm"
                autoComplete="off"
                data-lpignore="true"
              />
            </div>
            {/* Smart detection hint */}
            {clientMode && identifier.trim().length > 2 && (
              <p className="text-[10px] text-slate-400 px-1 -mt-1">
                {/^[\+0]/.test(identifier.trim())
                  ? "📱 Numéro de téléphone détecté"
                  : identifier.includes("@")
                    ? "📧 Adresse email détectée"
                    : "👤 Nom d'utilisateur détecté"}
              </p>
            )}

            {/* CHR password field */}
            {clientMode && externalType === "chr" && (
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-purple-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <input
                  type="password"
                  value={chrPwd}
                  onChange={e => { setChrPwd(e.target.value); setError("") }}
                  placeholder="Mot de passe CHR"
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm border border-purple-200 bg-purple-50 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-400/30 focus:border-purple-400 transition-all shadow-sm"
                  autoComplete="off"
                  data-lpignore="true"
                />
              </div>
            )}

            {/* Password */}
            {!clientMode && (
              <div>
                <div className="relative">
                  <svg width="14" height="14" className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <input
                    type={showPwd ? "text" : "password"}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError("") }}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-20 py-2.5 rounded-xl text-sm border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all shadow-sm"
                    autoComplete="off"
                    data-lpignore="true"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button type="button" onClick={() => { setShowForgot(true); setForgotStatus("idle") }}
                      className="text-[10px] text-green-600 hover:text-green-700 font-bold px-1.5 transition-colors">
                      Oublié?
                    </button>
                    <button type="button" onClick={() => setShowPwd(v => !v)}
                      className="text-slate-400 hover:text-slate-600 transition-colors p-0.5">
                      {showPwd
                        ? <svg width="14" height="14" className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                        : <svg width="14" height="14" className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      }
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
                <svg width="14" height="14" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}

            {/* Submit — arrow-box style: colored label + black arrow square */}
            <button type="submit" disabled={loading}
              className="w-full flex items-stretch rounded-xl overflow-hidden text-sm font-bold transition-all disabled:opacity-60 active:scale-[0.98]">
              <span className="flex-1 flex items-center justify-center gap-2 py-3 text-white"
                style={{ background: "linear-gradient(135deg, #16a34a 0%, #15803d 100%)" }}>
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Connexion...
                  </>
                ) : (
                  "Se connecter"
                )}
              </span>
              <span className="w-12 flex items-center justify-center text-white shrink-0" style={{ background: "#0f172a" }}>
                <svg width="16" height="16" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 7L7 17M17 7H7M17 7v10" />
                </svg>
              </span>
            </button>
          </form>

          {/* ── Biometric login button ─── */}
          {biometricSupported && !clientMode && biometricRegistered && (
            <button
              type="button"
              onClick={handleBiometricLogin}
              disabled={biometricLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-bold hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98] transition-all disabled:opacity-60 shadow-sm"
            >
              {biometricLoading ? (
                <span className="w-3.5 h-3.5 border-2 border-slate-400 border-t-slate-800 rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                    d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                </svg>
              )}
              {biometricLoading ? "Vérification..." : "Empreinte / Visage"}
            </button>
          )}

          {/* Biometric enrollment tip */}
          {showBiometricTip && loggedInUser && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-sm p-6 flex flex-col gap-5">
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-green-50 border border-green-200 flex items-center justify-center">
                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                        d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Connexion biométrique</h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Activez la connexion par empreinte ou reconnaissance faciale pour la prochaine fois.
                    </p>
                  </div>
                </div>
                {biometricError && (
                  <p className="text-xs text-red-600 font-medium text-center">{biometricError}</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowBiometricTip(false); onLogin(loggedInUser) }}
                    className="flex-1 py-2.5 rounded-xl text-xs font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                    Ignorer
                  </button>
                  <button
                    onClick={handleRegisterBiometric}
                    disabled={biometricLoading}
                    className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                    {biometricLoading && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                    {biometricLoading ? "Enregistrement..." : "Activer"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Biometric error banner */}
          {biometricError && !showBiometricTip && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {biometricError}
            </div>
          )}

          {/* Demo accounts — masqué tant qu'aucun compte n'est marqué "compte demo" */}
          {hasDemoAccounts && (
            <div className="rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm">
              <button type="button" onClick={() => setShowDemo(v => !v)}
                className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                <span className="flex items-center gap-2">
                  <svg width="14" height="14" className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  Comptes de démonstration
                </span>
                <svg width="14" height="14" className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showDemo ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showDemo && !clientMode && (
                <div className="border-t border-slate-100">
                  {demoInternal.length === 0 ? (
                    <p className="px-3.5 py-3 text-[10px] text-slate-400 text-center">Aucun compte demo equipe.</p>
                  ) : (
                    <>
                      <div className="flex bg-slate-50">
                        {demoGroups.map(g => (
                          <button key={g} type="button" onClick={() => setSelectedGroup(g)}
                            className={`flex-1 py-1.5 text-[10px] font-bold transition-colors border-b-2 ${activeGroup === g ? "border-green-600 text-green-700 bg-white" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
                            {g}
                          </button>
                        ))}
                      </div>
                      <div className="p-1.5 flex flex-col gap-0.5 max-h-40 overflow-y-auto">
                        {demoInternal.filter(u => (DEMO_ROLE_GROUP[u.role] ?? DEMO_GROUP_FALLBACK) === activeGroup).map(u => (
                          <button key={u.id} type="button"
                            onClick={() => {
                              setIdentifier(u.email); setPassword(u.password)
                              setClientMode(false); setError(""); setShowDemo(false)
                            }}
                            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-green-50 transition-colors text-left">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-black text-white shrink-0"
                              style={{ background: "linear-gradient(135deg, #16a34a, #15803d)" }}>
                              {u.name.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-slate-700 truncate">{u.name}</p>
                              <p className="text-[9px] text-slate-400 truncate">{ROLE_LABELS[u.role]}</p>
                            </div>
                            <span className="text-[9px] text-slate-300 font-mono shrink-0 bg-slate-100 px-1.5 py-0.5 rounded">{u.password}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {showDemo && clientMode && (
                <div className="border-t border-slate-100">
                  {demoExternal.length === 0 ? (
                    <p className="px-3.5 py-3 text-[10px] text-slate-400 text-center">Aucun compte demo client/fournisseur.</p>
                  ) : (
                    <div className="p-1.5 flex flex-col gap-1">
                      {demoExternal.map(u => (
                        <button key={u.id} type="button"
                          onClick={() => {
                            setIdentifier(u.email)
                            setExternalType(u.role === "fournisseur" ? "fournisseur" : ((u.subtype as ExternalType) || "particulier"))
                            setClientMode(true); setError(""); setShowDemo(false)
                          }}
                          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border border-slate-100 hover:bg-green-50 transition-colors text-left">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black text-white shrink-0"
                            style={{ background: u.role === "fournisseur" ? "#2563eb" : "#16a34a" }}>
                            {u.role === "fournisseur" ? "F" : "C"}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-bold text-slate-700 truncate">{u.name}</p>
                            <p className="text-[9px] text-slate-400 truncate">{u.email}</p>
                          </div>
                          <span className="text-[9px] font-mono text-slate-300 shrink-0">{u.password}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Forgot password modal */}
          {showForgot && (
            <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-sm p-6 flex flex-col gap-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Réinitialiser le mot de passe</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Un nouveau mot de passe sera envoyé par email.</p>
                </div>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={e => { setForgotEmail(e.target.value); setForgotStatus("idle") }}
                  placeholder="votre@email.com"
                  className="w-full px-4 py-2.5 rounded-xl text-sm border border-slate-200 bg-slate-50 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all"
                />
                {forgotStatus === "notfound" && <p className="text-xs text-red-600 font-medium">Email non trouvé dans le système.</p>}
                {forgotStatus === "sent" && <p className="text-xs text-green-700 font-medium">Nouveau mot de passe envoyé par email.</p>}
                <div className="flex gap-2">
                  <button onClick={() => { setShowForgot(false); setForgotEmail(""); setForgotStatus("idle") }}
                    className="flex-1 py-2.5 rounded-xl text-xs font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                    Annuler
                  </button>
                  <button onClick={handleForgotPassword} disabled={forgotStatus === "sending" || forgotStatus === "sent"}
                    className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-60">
                    {forgotStatus === "sending" ? "Envoi..." : "Envoyer"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Trust strip */}
          <div className="flex items-center justify-center gap-4 pt-1">
            {[
              { d: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z", label: "SSL sécurisé" },
              { d: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z", label: "Sync temps réel" },
              { d: "M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z", label: "Cloud Maroc" },
            ].map(t => (
              <div key={t.label} className="flex items-center gap-1">
                <svg className="w-3 h-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={t.d} />
                </svg>
                <span className="text-[9px] text-slate-400 font-semibold">{t.label}</span>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="flex flex-col items-center justify-center pt-0.5 gap-0.5">
            <p className="text-[10px] text-slate-400">
              &copy; {new Date().getFullYear()} <span className="font-black text-slate-500">FRESHLINK PRO</span>
            </p>
            <p className="text-[9px] font-semibold tracking-wide" style={{ color: "#b8962e" }}>
              ⚡ Powered by <span className="font-black" style={{ color: "#1a4f2a" }}>Vita tech</span>
            </p>
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
