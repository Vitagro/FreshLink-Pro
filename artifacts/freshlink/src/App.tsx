"use client"

import { Suspense, lazy, useState, useEffect } from "react"
import { Router as WouterRouter, Switch, Route } from "wouter"
import { store, type User, getUserInterface } from "@/lib/store"

const LoginPage          = lazy(() => import("@/components/auth/LoginPage"))
const MobileLayout       = lazy(() => import("@/components/mobile/MobileLayout"))
const BackOfficeLayout   = lazy(() => import("@/components/backoffice/BackOfficeLayout"))
const PortailClient      = lazy(() => import("@/components/portail/PortailClient"))
const PortailFournisseur = lazy(() => import("@/components/portail/PortailFournisseur"))
const SecurityGuard      = lazy(() => import("@/components/SecurityGuard"))
const CutoffNotifier     = lazy(() => import("@/components/CutoffNotifier"))
const DeviceBlockedPage  = lazy(() => import("@/pages/DeviceBlockedPage"))
const AdminUsersPage     = lazy(() => import("@/pages/admin/UsersPage"))

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-500 text-sm font-sans">Chargement Vita Fresh ERP…</p>
      </div>
    </div>
  )
}

function MainApp() {
  const [user, setUser]       = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView]       = useState<"mobile" | "backoffice">("backoffice")
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    try {
      const session = store.getSession()
      setUser(session)
      if (session) {
        const iface = getUserInterface(session)
        setView(iface === "mobile" ? "mobile" : "backoffice")
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  // Obtenir le cookie d'appareil (fl_device_token) DÈS LE CHARGEMENT DE L'APP,
  // avant toute connexion — INDISPENSABLE : /api/sync-read et /api/sync-write
  // le refusent sans lui (401 "Device non autorisé"), et le login lui-même
  // appelle sync-read (fetchUsers) pour vérifier les identifiants. Gater ce
  // fetch derrière `user` créait une impasse : impossible de se connecter la
  // première fois sur un appareil neuf (aucun cookie -> fetchUsers échoue
  // silencieusement -> liste d'utilisateurs vide/périmée -> "identifiants
  // incorrects" même avec le bon mot de passe).
  useEffect(() => {
    import("@/lib/deviceFingerprint").then(async ({ getDeviceFingerprint }) => {
      const fp = await getDeviceFingerprint()
      if (!fp) return
      try {
        await fetch("/api/device/check-and-token", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fingerprint: fp }),
        })
      } catch { /* hors-ligne : on reste sur le cache local */ }
      fetch("/api/device/seen", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fingerprint: fp, userAgent: navigator.userAgent }),
      }).catch(() => {})
    }).catch(() => {})
  }, [])

  // Une fois connecté (cookie déjà posé par l'effet ci-dessus) : resynchro complète.
  useEffect(() => {
    if (!user) return
    import("@/lib/deviceFingerprint").then(async ({ getDeviceFingerprint }) => {
      const fp = await getDeviceFingerprint()
      if (!fp) return
      // Ré-enregistre l'appareil avec le nom de l'utilisateur maintenant connu.
      fetch("/api/device/seen", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fingerprint: fp, nom: user.name, userAgent: navigator.userAgent }),
      }).catch(() => {})
    }).catch(() => {})
    import("@/lib/supabase/db").then(({ syncFromSupabase, hydrateConfigs }) => {
      syncFromSupabase().then(() => {
        window.dispatchEvent(new CustomEvent("fl_store_updated", { detail: { table: "all" } }))
      }).catch(() => {})
      // Recharge process/workflow/alertes/email config à chaque ouverture de
      // l'app (pas juste au login) — sinon un utilisateur qui reste connecté
      // (session persistée) garde un cache de config périmé indéfiniment :
      // un admin qui désactive "Photo achat obligatoire" côté BO n'a aucun
      // effet chez un acheteur déjà connecté tant qu'il ne se reconnecte pas.
      hydrateConfigs().catch(() => {})
    }).catch(() => {})
    // Enregistrement push natif (no-op hors app mobile Capacitor, cf. notify.ts).
    import("@/lib/notify").then(({ registerPush }) => { void registerPush(user.id) }).catch(() => {})
  }, [user])

  const handleLogin = (loggedUser: User, forceView?: "mobile" | "backoffice") => {
    try {
      store.setSession(loggedUser)
      setUser(loggedUser)
      import("@/lib/notify").then(({ requestNotifyPermission, unlockAudio }) => { unlockAudio(); void requestNotifyPermission() }).catch(() => {})
      if (forceView) {
        setView(forceView)
      } else {
        const iface = getUserInterface(loggedUser)
        setView(iface === "mobile" ? "mobile" : "backoffice")
      }
      import("@/lib/supabase/db").then(({ syncFromSupabase, hydrateConfigs }) => {
        syncFromSupabase().then(({ ok, tables }) => {
          console.log(`[FreshLink] Sync login — ${tables.length} tables chargées depuis Supabase`)
          if (ok) {
            try {
              const fresh = store.getUsers().find(u => u.id === loggedUser.id)
              if (fresh) { store.setSession(fresh); setUser(fresh) }
            } catch { /* noop */ }
            window.dispatchEvent(new CustomEvent("fl_store_updated", { detail: { table: "all" } }))
          }
        }).catch(() => {})
        hydrateConfigs().catch(() => {})
      })

      if (["super_super_admin", "super_admin", "admin"].includes(loggedUser.role)) {
        import("@/lib/deviceFingerprint").then(async ({ isMasterDevice }) => {
          if (!(await isMasterDevice())) {
            console.log("[FreshLink] Appareil NON-maître → pas de push global")
            return
          }
          try {
            const allUsers = store.getUsers()
            if (allUsers.length > 3) {
              const upserts = allUsers.map(u => { const { id, ...payload } = u; return { id, payload, updated_at: new Date().toISOString() } })
              fetch("/api/sync-write", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ table: "fl_users", upserts }),
              }).catch(() => {})
            }
            const allArticles = store.getArticles()
            if (allArticles.length > 0) {
              const upserts = allArticles.map(a => { const { id, ...payload } = a; return { id, payload, updated_at: new Date().toISOString() } })
              fetch("/api/sync-write", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ table: "fl_articles", upserts }),
              }).catch(() => {})
            }
            const allClients = store.getClients()
            if (allClients.length > 0) {
              const upserts = allClients.map(c => { const { id, ...payload } = c; return { id, payload, updated_at: new Date().toISOString() } })
              fetch("/api/sync-write", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ table: "fl_clients", upserts }),
              }).catch(() => {})
            }
          } catch { /* offline OK */ }
        }).catch(() => {})
      }
    } catch (e: unknown) {
      console.error("Login error:", e)
    }
  }

  const handleLogout = () => {
    try { store.logout() } catch (_) {}
    setUser(null)
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full bg-white border border-red-200 rounded-2xl p-8 space-y-4 shadow-lg">
          <p className="text-lg font-bold text-slate-800">Erreur de demarrage</p>
          <p className="text-sm font-mono text-red-600 bg-red-50 rounded-xl p-3 break-all">{error}</p>
          <button
            onClick={() => { try { localStorage.clear() } catch(_){} window.location.reload() }}
            className="w-full py-3 rounded-xl font-bold text-white text-sm bg-green-600 hover:bg-green-700 transition-colors">
            Reinitialiser et recharger
          </button>
        </div>
      </div>
    )
  }

  if (loading) return <Spinner />

  if (!user) {
    return (
      <Suspense fallback={<Spinner />}>
        <LoginPage onLogin={handleLogin} />
      </Suspense>
    )
  }

  if (user.role === "fournisseur") {
    return (
      <Suspense fallback={<Spinner />}>
        <PortailFournisseur user={user} onLogout={handleLogout} />
      </Suspense>
    )
  }

  if (user.role === "client" || user.role === "client_proprietaire" || user.role === "client_gerant") {
    const sousType = (user as any).sousType ?? (user as any).categorie ?? ""
    const isPro = ["chr", "marchand", "professionnel"].includes(String(sousType).toLowerCase())
                  || user.role === "client_proprietaire"
                  || user.role === "client_gerant"
    if (isPro) {
      return (
        <Suspense fallback={<Spinner />}>
          <PortailClient user={user} onLogout={handleLogout} />
        </Suspense>
      )
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-sm w-full bg-white rounded-2xl border border-slate-200 shadow-lg p-8 flex flex-col items-center gap-5 text-center">
          <div className="w-14 h-14 rounded-2xl bg-green-100 flex items-center justify-center text-3xl">🌐</div>
          <div>
            <p className="text-base font-bold text-slate-800">Bonjour {user.name} !</p>
            <p className="text-sm text-slate-500 mt-2">Votre espace commande est sur notre site web.</p>
          </div>
          <a href="https://shop.vita-core.org"
            className="w-full py-2.5 rounded-xl text-sm font-bold text-white text-center"
            style={{ background: "linear-gradient(135deg,#1a4f2a,#2d7a46)" }}>
            Ouvrir shop.vita-core.org →
          </a>
          <button onClick={handleLogout}
            className="w-full py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
            Se déconnecter
          </button>
        </div>
      </div>
    )
  }

  const iface = getUserInterface(user)

  const bothSwitcher = iface === "both" ? (
    <div className="fixed bottom-4 right-4 z-50">
      <button
        onClick={() => setView(v => v === "backoffice" ? "mobile" : "backoffice")}
        className="flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg text-white text-xs font-bold bg-indigo-600 hover:bg-indigo-700 transition-colors">
        {view === "backoffice" ? "Vue Mobile" : "Vue Back-office"}
      </button>
    </div>
  ) : null

  if (iface === "mobile" || (iface === "both" && view === "mobile")) {
    const isSuperAdmin  = user.role === "super_admin" || user.role === "super_super_admin"
    const isDemoAccount = user.name.toLowerCase().startsWith("demo")
    const needsGuard    = !isSuperAdmin && !isDemoAccount && (user as any).requireCameraAuth === true
    const content = (
      <Suspense fallback={<Spinner />}>
        <MobileLayout user={user} onLogout={handleLogout} />
      </Suspense>
    )
    return (
      <>
        {needsGuard ? (
          <Suspense fallback={<Spinner />}>
            <SecurityGuard skipGps={false}>{content}</SecurityGuard>
          </Suspense>
        ) : content}
        {bothSwitcher}
        <Suspense fallback={null}>
          <CutoffNotifier user={user} />
        </Suspense>
      </>
    )
  }

  return (
    <>
      <Suspense fallback={<Spinner />}>
        <BackOfficeLayout user={user} onLogout={handleLogout} />
      </Suspense>
      {bothSwitcher}
      <Suspense fallback={null}>
        <CutoffNotifier user={user} />
      </Suspense>
    </>
  )
}

export default function App() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "") ?? ""}>
      <Switch>
        <Route path="/device-blocked" component={() => (
          <Suspense fallback={<Spinner />}>
            <DeviceBlockedPage />
          </Suspense>
        )} />
        <Route path="/admin/users" component={() => (
          <Suspense fallback={<Spinner />}>
            <AdminUsersPage />
          </Suspense>
        )} />
        <Route component={MainApp} />
      </Switch>
    </WouterRouter>
  )
}
