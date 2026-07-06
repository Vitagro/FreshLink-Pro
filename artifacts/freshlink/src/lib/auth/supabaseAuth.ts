/**
 * Fresh Link Pro — Supabase Authentication Module
 *
 * Remplace le système localStorage par Supabase Auth réel
 * - Email/password via Supabase
 * - Sessions JWT httpOnly
 * - Multi-utilisateurs
 * - Synchronisation Realtime
 */

import { createClient } from "@/lib/supabase/client"
import { store, type User } from "@/lib/store"

export interface AuthUser {
  id: string
  email: string
  user_metadata?: {
    role?: string
    name?: string
    [key: string]: any
  }
}

export interface AuthSession {
  user: AuthUser
  access_token: string
  refresh_token: string
}

// Ligne de la table fl_users (colonnes snake_case). La table n'ayant pas de
// types Supabase générés, le client retourne `never` ; ce type rétablit le
// typage à la lecture (corrige les ~59 erreurs "Property X on type 'never'").
interface FlUserRow {
  id: string
  name: string
  email: string
  role: User["role"]
  actif: boolean
  access_type?: User["accessType"]
  secteur?: string
  phone?: string
  telephone?: string
  photo_url?: string
  can_view_achat?: boolean
  can_view_commercial?: boolean
  can_view_logistique?: boolean
  can_view_stock?: boolean
  can_view_cash?: boolean
  can_view_finance?: boolean
  can_view_recap?: boolean
  can_view_database?: boolean
  can_view_external?: boolean
  can_create_commande_bo?: boolean
  objectif_clients?: number
  objectif_tonnage?: number
  objectif_journalier_ca?: number
  objectif_hebdomadaire_ca?: number
  objectif_mensuel_ca?: number
  fournisseur_id?: string
  client_id?: string
  depot_id?: string
  require_camera_auth?: boolean
}

/**
 * Signer avec email + password
 * Récupère ensuite le profil utilisateur depuis fl_users
 */
export async function signInWithEmail(
  email: string,
  password: string
): Promise<{ user: User; session: AuthSession } | { error: string }> {
  try {
    const supabase = createClient()

    // 1. Authentifier auprès de Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error || !data.session) {
      return { error: error?.message || "Identifiants invalides" }
    }

    // 2. Récupérer le profil utilisateur depuis fl_users
    const { data: userRowRaw, error: userError } = await supabase
      .from("fl_users")
      .select("*")
      .eq("email", email)
      .single()

    if (userError || !userRowRaw) {
      return {
        error: "Profil utilisateur non trouvé. Contactez l'administrateur.",
      }
    }
    const userRow = userRowRaw as FlUserRow

    // 3. Mapper vers notre type User (snake_case → camelCase)
    const user: User = {
      id: userRow.id,
      name: userRow.name,
      email: userRow.email,
      password: "", // NE PAS STOCKER le vrai password
      role: userRow.role,
      actif: userRow.actif,
      accessType: userRow.access_type,
      secteur: userRow.secteur,
      phone: userRow.phone,
      telephone: userRow.telephone,
      photoUrl: userRow.photo_url,
      canViewAchat: userRow.can_view_achat,
      canViewCommercial: userRow.can_view_commercial,
      canViewLogistique: userRow.can_view_logistique,
      canViewStock: userRow.can_view_stock,
      canViewCash: userRow.can_view_cash,
      canViewFinance: userRow.can_view_finance,
      canViewRecap: userRow.can_view_recap,
      canViewDatabase: userRow.can_view_database,
      canViewExternal: userRow.can_view_external,
      canCreateCommandeBO: userRow.can_create_commande_bo,
      objectifClients: userRow.objectif_clients,
      objectifTonnage: userRow.objectif_tonnage,
      objectifJournalierCA: userRow.objectif_journalier_ca,
      objectifHebdomadaireCA: userRow.objectif_hebdomadaire_ca,
      objectifMensuelCA: userRow.objectif_mensuel_ca,
      fournisseurId: userRow.fournisseur_id,
      clientId: userRow.client_id,
      depotId: userRow.depot_id,
      requireCameraAuth: userRow.require_camera_auth,
    }

    // 4. Sauvegarder la session (sera utilisée pour les requêtes ultérieures)
    const session: AuthSession = {
      user: {
        id: data.session.user.id,
        email: data.session.user.email || "",
        user_metadata: data.session.user.user_metadata,
      },
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token || "",
    }

    return { user, session }
  } catch (e) {
    console.error("[Auth] Erreur signIn:", e)
    return { error: "Erreur de connexion. Vérifiez votre connexion internet." }
  }
}

/**
 * REMOVED: signInWithEmailFallback
 *
 * SECURITY [P0-003]: Never fallback to weak auth if Supabase is unavailable.
 * If Supabase is down, the app should be down (fail secure principle).
 *
 * Always use signInWithEmail() instead, which requires valid Supabase credentials.
 * No fallback to localStorage - no downgrade attacks.
 */

/**
 * Récupérer la session actuellement authentifiée
 */
export async function getAuthSession(): Promise<AuthSession | null> {
  try {
    const supabase = createClient()
    const { data } = await supabase.auth.getSession()
    return data.session as AuthSession | null
  } catch {
    return null
  }
}

/**
 * Récupérer l'utilisateur actuel avec ses données
 */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const supabase = createClient()
    const { data } = await supabase.auth.getUser()

    if (!data.user?.email) return null

    // Récupérer le profil complet depuis fl_users
    const { data: userRowRaw } = await supabase
      .from("fl_users")
      .select("*")
      .eq("email", data.user.email)
      .single()

    if (!userRowRaw) return null
    const userRow = userRowRaw as FlUserRow

    const user: User = {
      id: userRow.id,
      name: userRow.name,
      email: userRow.email,
      password: "",
      role: userRow.role,
      actif: userRow.actif,
      accessType: userRow.access_type,
      secteur: userRow.secteur,
      phone: userRow.phone,
      telephone: userRow.telephone,
      photoUrl: userRow.photo_url,
      canViewAchat: userRow.can_view_achat,
      canViewCommercial: userRow.can_view_commercial,
      canViewLogistique: userRow.can_view_logistique,
      canViewStock: userRow.can_view_stock,
      canViewCash: userRow.can_view_cash,
      canViewFinance: userRow.can_view_finance,
      canViewRecap: userRow.can_view_recap,
      canViewDatabase: userRow.can_view_database,
      canViewExternal: userRow.can_view_external,
      canCreateCommandeBO: userRow.can_create_commande_bo,
      objectifClients: userRow.objectif_clients,
      objectifTonnage: userRow.objectif_tonnage,
      objectifJournalierCA: userRow.objectif_journalier_ca,
      objectifHebdomadaireCA: userRow.objectif_hebdomadaire_ca,
      objectifMensuelCA: userRow.objectif_mensuel_ca,
      fournisseurId: userRow.fournisseur_id,
      clientId: userRow.client_id,
      depotId: userRow.depot_id,
      requireCameraAuth: userRow.require_camera_auth,
    }

    return user
  } catch {
    return null
  }
}

/**
 * Se déconnecter
 */
export async function signOut(): Promise<void> {
  try {
    const supabase = createClient()
    await supabase.auth.signOut()
  } catch (e) {
    console.error("[Auth] Erreur signOut:", e)
  }
}

/**
 * Créer un nouvel utilisateur (admin seulement)
 *
 * NOTE : fl_users est une table JSONB générique (id, payload, updated_at), pas
 * de colonnes plates — et le client navigateur n'a que la clé anon (jamais
 * service_role). `supabase.auth.admin.createUser()` (utilisé ici avant) exige
 * service_role et échouait donc systématiquement. On suit désormais le même
 * schéma que components/backoffice/BOUsers.tsx (le vrai écran de gestion des
 * utilisateurs, fonctionnel) : écriture locale + push via /api/sync-write
 * (service_role côté serveur, contourne la RLS).
 */
export async function createUser(
  email: string,
  password: string,
  userData: Partial<User>
): Promise<{ user: User | null; error: string | null }> {
  try {
    const newUser: User = {
      id: store.genId(),
      name: userData.name || "Nouvel utilisateur",
      email,
      password,
      role: userData.role || "prevendeur",
      actif: true,
      ...userData,
    }

    const all = store.getUsers()
    all.push(newUser)
    store.saveUsers(all)

    const { id, ...payload } = newUser
    const res = await fetch("/api/sync-write", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table: "fl_users",
        upserts: [{ id, payload, updated_at: new Date().toISOString() }],
      }),
    })
    const json = await res.json() as { ok: boolean; errors?: string[] }
    if (!json.ok) {
      return { user: null, error: json.errors?.join(", ") || "Erreur de synchronisation" }
    }

    return { user: newUser, error: null }
  } catch (e) {
    return {
      user: null,
      error: e instanceof Error ? e.message : "Erreur inconnue",
    }
  }
}

/**
 * Réinitialiser le mot de passe
 */
export async function resetPassword(email: string): Promise<{ error: string | null }> {
  try {
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    return { error: error?.message || null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur inconnue" }
  }
}

/**
 * Refresh la session si elle expire
 */
export async function refreshSession(): Promise<AuthSession | null> {
  try {
    const supabase = createClient()
    const { data } = await supabase.auth.refreshSession()
    return data.session as AuthSession | null
  } catch (e) {
    console.error("[Auth] Erreur refresh:", e)
    return null
  }
}
