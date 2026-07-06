/**
 * Hook React pour gérer l'authentification Supabase
 * Écoute les changements de session en temps réel
 */

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { getCurrentUser, signOut as supabaseSignOut } from "@/lib/auth/supabaseAuth"
import type { User } from "@/lib/store"

interface UseAuthReturn {
  user: User | null
  loading: boolean
  error: string | null
  signOut: () => Promise<void>
  refreshUser: () => Promise<void>
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refreshUser = useCallback(async () => {
    try {
      const currentUser = await getCurrentUser()
      setUser(currentUser)
      setError(null)
    } catch (err) {
      console.error("[useAuth] Erreur refresh user:", err)
      setError(err instanceof Error ? err.message : "Erreur")
    }
  }, [])

  const handleSignOut = useCallback(async () => {
    try {
      await supabaseSignOut()
      setUser(null)
      setError(null)
    } catch (err) {
      console.error("[useAuth] Erreur signOut:", err)
      setError(err instanceof Error ? err.message : "Erreur logout")
    }
  }, [])

  // Charger l'utilisateur au montage
  useEffect(() => {
    refreshUser().finally(() => setLoading(false))
  }, [refreshUser])

  // Écouter les changements d'auth (logout, session expire, etc)
  useEffect(() => {
    const supabase = createClient()
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "SIGNED_OUT" || !session) {
          setUser(null)
        } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          await refreshUser()
        }
      }
    )

    return () => {
      authListener?.subscription.unsubscribe()
    }
  }, [refreshUser])

  return {
    user,
    loading,
    error,
    signOut: handleSignOut,
    refreshUser,
  }
}
