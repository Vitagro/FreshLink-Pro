"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/useAuth"
import BOUserManagement from "@/components/backoffice/BOUserManagement"

/**
 * Page d'administration pour créer des utilisateurs
 *
 * SECURITY [P1-006]: Server-side authorization check
 * Cannot be bypassed via DevTools, localStorage, or client-side state modification
 * Verification happens on /api/admin/verify endpoint
 */
export default function AdminUsersPage() {
  const { user, loading } = useAuth()
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (loading) return

    // ✅ Server-side verification instead of client-side check
    verifyAdminAccess()
  }, [user, loading])

  async function verifyAdminAccess() {
    if (!user) {
      setAuthorized(false)
      setError("Non authentifié")
      return
    }

    try {
      // ✅ Call server endpoint to verify admin access
      const response = await fetch("/api/admin/verify", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Include cookies for auth
      })

      if (!response.ok) {
        setAuthorized(false)
        if (response.status === 401) {
          setError("Veuillez vous connecter")
        } else {
          setError("Vous n'avez pas la permission d'accéder à cette page")
        }
        return
      }

      // ✅ Server confirmed admin access
      const data = await response.json()
      setAuthorized(true)
      setError(null)

    } catch (err) {
      console.error("[AdminPage] Vérification échouée:", err)
      setAuthorized(false)
      setError("Impossible de vérifier l'accès")
    }
  }

  // Loading state
  if (loading || authorized === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Vérification d'accès...</p>
        </div>
      </div>
    )
  }

  // Not authorized
  if (!authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50">
        <div className="text-center p-8 max-w-md">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-red-900 mb-2">Accès refusé</h1>
          <p className="text-red-700">{error || "Vous n'avez pas la permission d'accéder à cette page"}</p>
          <a href="/" className="mt-6 inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Retour à l'accueil
          </a>
        </div>
      </div>
    )
  }

  // Authorized - render admin component
  return <BOUserManagement />
}
