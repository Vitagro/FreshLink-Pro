"use client"

// ============================================================
// FreshLink — useRealtimeSync
// Hook React qui maintient une connexion Supabase Realtime
// et propage les changements (INSERT/UPDATE/DELETE) en temps réel.
//
// Usage dans n'importe quel composant :
//   const { articles, prospects, commandesWeb, companyContacts, connected } =
//     useRealtimeSync()
// ============================================================

import { useEffect, useState, useCallback, useRef } from "react"
import { createClient } from "./client"

// ── Types ─────────────────────────────────────────────────────

export interface ArticleWeb {
  id: string
  nom: string
  nom_ar?: string
  famille?: string
  unite?: string
  photo?: string
  description?: string
  statut_web: "disponible" | "rupture" | "liquidation" | "bientot"
  visible_web: boolean
  promo_active: boolean
  promo_taux: number
  promo_label?: string
  promo_fin?: string
  criteres_qualite: Record<string, string>
  tags: string[]
  position_catalogue: number
  prix: number
  prix_promo?: number
  stock_actuel?: number
  dlc_jours?: number
  updated_at: string
}

export interface Prospect {
  id: string
  nom_societe: string
  nom_contact: string
  telephone: string
  whatsapp?: string
  email?: string
  adresse?: string
  ville?: string
  type_activite?: string
  familles_souhaitees?: string[]
  volume_estime?: string
  message?: string
  statut: "nouveau" | "contacte" | "valide" | "refuse" | "attente"
  source?: string
  created_at: string
}

export interface CommandeWeb {
  id: string
  numero: string
  nom_client: string
  telephone: string
  email?: string
  adresse_livraison?: string
  lignes: Array<{
    article_id: string
    nom: string
    qte: number
    unite: string
    prix_u: number
    montant: number
  }>
  montant_total: number
  date_souhaitee?: string
  creneau?: string
  instructions?: string
  statut: string
  created_at: string
}

export interface CompanyContacts {
  id: string
  nom_societe?: string
  slogan?: string
  adresse_ligne1?: string
  adresse_ligne2?: string
  code_postal?: string
  ville?: string
  pays?: string
  tel_principal?: string
  tel_secondaire?: string
  tel_urgence?: string
  whatsapp_principal?: string
  whatsapp_commercial?: string
  whatsapp_livraison?: string
  email_principal?: string
  email_commercial?: string
  email_comptabilite?: string
  email_rh?: string
  instagram?: string
  facebook?: string
  linkedin?: string
  tiktok?: string
  horaires_ouverture?: string
  horaires_livraison?: string
  zone_livraison?: string
  ice?: string
  rc?: string
  if_fiscal?: string
  tp?: string
  cnss?: string
  gps_lat?: number
  gps_lng?: number
  logo_url?: string
  couleur_primaire?: string
  updated_at?: string
}

// ── State ─────────────────────────────────────────────────────

export interface RealtimeSyncState {
  articles: ArticleWeb[]
  prospects: Prospect[]
  commandesWeb: CommandeWeb[]
  companyContacts: CompanyContacts | null
  connected: boolean
  lastSync: Date | null
  errors: string[]
}

const INITIAL_STATE: RealtimeSyncState = {
  articles: [],
  prospects: [],
  commandesWeb: [],
  companyContacts: null,
  connected: false,
  lastSync: null,
  errors: [],
}

// ── Hook ──────────────────────────────────────────────────────

export function useRealtimeSync(options?: {
  tables?: Array<"articles" | "prospects" | "commandes_web" | "contacts">
}) {
  const tables = options?.tables ?? ["articles", "prospects", "commandes_web", "contacts"]
  const [state, setState] = useState<RealtimeSyncState>(INITIAL_STATE)
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null)

  const addError = useCallback((msg: string) => {
    setState(s => ({ ...s, errors: [...s.errors.slice(-4), msg] }))
  }, [])

  // ── Chargement initial ──────────────────────────────────────
  const loadInitialData = useCallback(async () => {
    const sb = createClient()

    try {
      const fetches: Promise<void>[] = []

      if (tables.includes("articles")) {
        fetches.push(
          Promise.resolve(sb.from("v_marketplace_catalogue").select("*").order("position_catalogue")
            .then(({ data, error }) => {
              if (error) { addError(`Articles: ${error.message}`); return }
              setState(s => ({ ...s, articles: (data ?? []) as ArticleWeb[] }))
            }))
        )
      }

      if (tables.includes("prospects")) {
        fetches.push(
          Promise.resolve(sb.from("fl_prospects").select("*").order("created_at", { ascending: false }).limit(100)
            .then(({ data, error }) => {
              if (error) { addError(`Prospects: ${error.message}`); return }
              setState(s => ({ ...s, prospects: (data ?? []) as Prospect[] }))
            }))
        )
      }

      if (tables.includes("commandes_web")) {
        fetches.push(
          Promise.resolve(sb.from("fl_commandes_web").select("*").order("created_at", { ascending: false }).limit(200)
            .then(({ data, error }) => {
              if (error) { addError(`Commandes web: ${error.message}`); return }
              setState(s => ({ ...s, commandesWeb: (data ?? []) as CommandeWeb[] }))
            }))
        )
      }

      if (tables.includes("contacts")) {
        fetches.push(
          Promise.resolve(sb.from("fl_company_contacts").select("*").eq("id", "main").single()
            .then(({ data, error }) => {
              if (error && error.code !== "PGRST116") { addError(`Contacts: ${error.message}`); return }
              if (data) setState(s => ({ ...s, companyContacts: data as CompanyContacts }))
            }))
        )
      }

      await Promise.all(fetches)
      setState(s => ({ ...s, lastSync: new Date() }))
    } catch (e) {
      addError(`Chargement: ${e instanceof Error ? e.message : String(e)}`)
    }
  }, [tables, addError])

  // ── Souscription Realtime ───────────────────────────────────
  useEffect(() => {
    const sb = createClient()

    loadInitialData()

    // Un seul channel pour toutes les tables
    const channel = sb.channel("freshlink-realtime-sync", {
      config: { broadcast: { self: true } },
    })

    if (tables.includes("articles")) {
      channel
        .on("postgres_changes", { event: "*", schema: "public", table: "fl_articles" },
          (payload) => {
            setState(s => {
              const { eventType, new: newRec, old: oldRec } = payload
              if (eventType === "INSERT") {
                return { ...s, articles: [...s.articles, newRec as ArticleWeb], lastSync: new Date() }
              }
              if (eventType === "UPDATE") {
                return {
                  ...s,
                  articles: s.articles.map(a => a.id === (newRec as ArticleWeb).id ? { ...a, ...newRec } as ArticleWeb : a),
                  lastSync: new Date(),
                }
              }
              if (eventType === "DELETE") {
                return {
                  ...s,
                  articles: s.articles.filter(a => a.id !== (oldRec as { id: string }).id),
                  lastSync: new Date(),
                }
              }
              return s
            })
          }
        )
    }

    if (tables.includes("prospects")) {
      channel
        .on("postgres_changes", { event: "*", schema: "public", table: "fl_prospects" },
          (payload) => {
            setState(s => {
              const { eventType, new: newRec, old: oldRec } = payload
              if (eventType === "INSERT") {
                return { ...s, prospects: [newRec as Prospect, ...s.prospects], lastSync: new Date() }
              }
              if (eventType === "UPDATE") {
                return {
                  ...s,
                  prospects: s.prospects.map(p => p.id === (newRec as Prospect).id ? { ...p, ...newRec } as Prospect : p),
                  lastSync: new Date(),
                }
              }
              if (eventType === "DELETE") {
                return {
                  ...s,
                  prospects: s.prospects.filter(p => p.id !== (oldRec as { id: string }).id),
                  lastSync: new Date(),
                }
              }
              return s
            })
          }
        )
    }

    if (tables.includes("commandes_web")) {
      channel
        .on("postgres_changes", { event: "*", schema: "public", table: "fl_commandes_web" },
          (payload) => {
            setState(s => {
              const { eventType, new: newRec, old: oldRec } = payload
              if (eventType === "INSERT") {
                return { ...s, commandesWeb: [newRec as CommandeWeb, ...s.commandesWeb], lastSync: new Date() }
              }
              if (eventType === "UPDATE") {
                return {
                  ...s,
                  commandesWeb: s.commandesWeb.map(c => c.id === (newRec as CommandeWeb).id ? { ...c, ...newRec } as CommandeWeb : c),
                  lastSync: new Date(),
                }
              }
              if (eventType === "DELETE") {
                return {
                  ...s,
                  commandesWeb: s.commandesWeb.filter(c => c.id !== (oldRec as { id: string }).id),
                  lastSync: new Date(),
                }
              }
              return s
            })
          }
        )
    }

    if (tables.includes("contacts")) {
      channel
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "fl_company_contacts" },
          (payload) => {
            setState(s => ({
              ...s,
              companyContacts: { ...(s.companyContacts ?? {}), ...(payload.new as CompanyContacts) },
              lastSync: new Date(),
            }))
          }
        )
    }

    channel.subscribe((status) => {
      setState(s => ({ ...s, connected: status === "SUBSCRIBED" }))
      if (status === "CHANNEL_ERROR") addError("Erreur connexion Realtime")
    })

    channelRef.current = channel

    return () => {
      sb.removeChannel(channel)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions CRUD pour l'app ─────────────────────────────────

  const updateArticleWebStatus = useCallback(async (
    articleId: string,
    data: {
      statut_web?: ArticleWeb["statut_web"]
      visible_web?: boolean
      promo_active?: boolean
      promo_taux?: number
      promo_label?: string
      promo_fin?: string
      prix_public?: number
      criteres_qualite?: Record<string, string>
      tags?: string[]
      position_catalogue?: number
    }
  ) => {
    const sb = createClient()
    const { error } = await (sb as any).from("fl_articles").update({ ...data, updated_at: new Date().toISOString() }).eq("id", articleId)
    if (error) { addError(`Mise à jour article: ${error.message}`); return false }
    return true
  }, [addError])

  const updateProspectStatus = useCallback(async (
    prospectId: string,
    statut: Prospect["statut"],
    note?: string
  ) => {
    const sb = createClient()
    const { error } = await (sb as any).from("fl_prospects").update({ statut, note_interne: note, updated_at: new Date().toISOString() }).eq("id", prospectId)
    if (error) { addError(`Mise à jour prospect: ${error.message}`); return false }
    return true
  }, [addError])

  const updateCommandeWebStatus = useCallback(async (
    commandeId: string,
    statut: string,
    note?: string
  ) => {
    const sb = createClient()
    const { error } = await (sb as any).from("fl_commandes_web").update({ statut, note_interne: note, updated_at: new Date().toISOString() }).eq("id", commandeId)
    if (error) { addError(`Mise à jour commande: ${error.message}`); return false }
    return true
  }, [addError])

  const saveCompanyContacts = useCallback(async (contacts: Partial<CompanyContacts>) => {
    const sb = createClient()
    const { error } = await (sb as any).from("fl_company_contacts").upsert({ id: "main", ...contacts, updated_at: new Date().toISOString() })
    if (error) { addError(`Contacts: ${error.message}`); return false }
    setState(s => ({ ...s, companyContacts: { ...(s.companyContacts ?? { id: "main" }), ...contacts } as CompanyContacts }))
    return true
  }, [addError])

  const refresh = useCallback(() => loadInitialData(), [loadInitialData])

  return {
    ...state,
    updateArticleWebStatus,
    updateProspectStatus,
    updateCommandeWebStatus,
    saveCompanyContacts,
    refresh,
  }
}

// ── Utilitaire standalone (hors composant) ─────────────────────

export async function pushArticleStatusToWeb(
  articleId: string,
  statut_web: ArticleWeb["statut_web"],
  promo_active?: boolean,
  promo_taux?: number
) {
  const sb = createClient()
  const updates: Record<string, unknown> = { statut_web, updated_at: new Date().toISOString() }
  if (promo_active !== undefined) updates.promo_active = promo_active
  if (promo_taux !== undefined) updates.promo_taux = promo_taux
  const { error } = await (sb as any).from("fl_articles").update(updates).eq("id", articleId)
  return !error
}

export async function getCompanyContactsPublic(): Promise<CompanyContacts | null> {
  const sb = createClient()
  const { data, error } = await sb.from("fl_company_contacts").select("*").eq("id", "main").single()
  if (error) return null
  return data as CompanyContacts
}
