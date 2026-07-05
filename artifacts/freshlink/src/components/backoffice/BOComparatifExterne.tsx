// ═══════════════════════════════════════════════════════════════════════════
//  BOComparatifExterne — Comparatif données externes (GestFlux & Iziry) vs FreshLink
//  Tables GestFlux  : reception (4600), products (261), profiles (18)
//  Tables Iziry     : commandes (1991), factures (1978), bons_livraison (1977),
//                     articles (263), clients (702), lignes_facture (11247),
//                     lignes_bl (11366), lignes_commande (11650),
//                     bons_chargement (384), avoirs (73), retours (323), profiles (54)
//  Sync : premier chargement = depuis avril 2026 ; quotidien = aujourd'hui
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useMemo } from "react"
import { store, type User, type HistoriquePrixAchat } from "@/lib/store"

// ── Types ─────────────────────────────────────────────────────────────────────
interface GfReception {
  id: string; date: string; produit_id: string; article: string
  qte_recue: number; nb_caisses: number; num_voyage: string; heure: string
}
interface GfProduct {
  id: string; ref: string; nom_fr: string; nom_ar: string
  famille: string; prix_achat: number; unite: string; marque: string
}
// Table "achat" GestFlux — le prix REELLEMENT negocie du jour (table
// "reception" ne porte aucun prix ; "products.prix_achat" est un prix
// catalogue generique, pas le prix du jour — verifie via /synthese-achat).
// statut "non_traite" = demande pas encore achetee (qte_achetee/prix = 0).
interface GfAchat {
  id: string; date: string; produit_id: string | null; article: string
  qte_demandee: number; qte_achetee: number; nb_caisses: number
  prix: number; statut: string; frais_supp: number; gratuite: number
  acheteur_name: string | null
}
interface IzCommande {
  id: string; numero: string; client_id: string; prevendeur_id: string
  statut: string; montant_total: number; notes: string; created_at: string
}
interface IzBL {
  id: string; numero: string; client_id: string; commande_id: string
  statut: string; montant_ht: number; montant_ttc: number; droits_timbre: number; created_at: string
}
interface IzFacture {
  id: string; numero: string; bon_livraison_id: string; client_id: string
  date_facture: string; montant_ht: number; montant_ttc: number
  droits_timbre: number; statut: string
}
interface IzLigneFacture {
  id: string; facture_id: string; article_id: string
  quantite: number; prix_unitaire: number; montant: number
}
interface IzClient {
  id: string; code: string; raison_sociale: string; ville: string
}
interface IzArticle {
  id: string; reference: string; libelle: string; unite: string; actif: boolean
}

type SyncStatus = "idle" | "loading" | "ok" | "error"

// ── Mapping types ──────────────────────────────────────────────────────────────
type MappingStatus = "approved" | "rejected"
interface MappingEntry { flNorm: string; flNom: string; status: MappingStatus }
type MappingStore = Record<string, MappingEntry>   // key = "gf:norm" | "iz:norm"

// ── Cache keys ────────────────────────────────────────────────────────────────
const CACHE = {
  gfRecep:      "fl_ext_gf_reception",
  gfProducts:   "fl_ext_gf_products",
  gfAchat:      "fl_ext_gf_achat",
  izCommandes:  "fl_ext_iz_commandes",
  izBL:         "fl_ext_iz_bl",
  izFact:       "fl_ext_iz_factures",
  izLignesFact: "fl_ext_iz_lignes_fact",
  izClients:    "fl_ext_iz_clients",
  izArticles:   "fl_ext_iz_articles",
  lastSync:     "fl_ext_last_sync",
  mapping:      "fl_ext_art_mapping",
}

function loadCache<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) ?? "[]") } catch { return [] }
}
// Notifie les autres onglets/ecrans (Prix, Pricing, Intelligence Prix, Flux)
// deja montes dans la meme session qu'une nouvelle sync est disponible — sans
// ca, ils gardaient le cache lu a leur propre montage (avant la sync) jusqu'au
// prochain rechargement complet de la page.
function saveCache(key: string, data: unknown[]) {
  try {
    localStorage.setItem(key, JSON.stringify(data))
    window.dispatchEvent(new CustomEvent("fl_ext_sync_updated", { detail: key }))
  } catch { /* quota */ }
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────
async function getToken(source: "gestflux" | "iziry"): Promise<string | null> {
  try {
    const res = await fetch("/api/ext/db-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source,
        email:    source === "gestflux" ? "hamza@alephcapital.io" : "hamza@iziry.local",
        password: source === "gestflux" ? "comptable1" : "123456",
      }),
    })
    if (!res.ok) return null
    const j = await res.json() as { ok: boolean; access_token?: string }
    return j.access_token ?? null
  } catch { return null }
}

async function sbFetch<T>(
  url: string, anonKey: string, token: string | null, table: string, qs: string
): Promise<T[]> {
  const bearer = token ?? anonKey
  try {
    const res = await fetch(`${url}/rest/v1/${table}?${qs}`, {
      headers: {
        "apikey": anonKey, "Authorization": `Bearer ${bearer}`,
        "Accept": "application/json", "Prefer": "count=exact",
      },
    })
    if (!res.ok) return []
    return await res.json() as T[]
  } catch { return [] }
}

const GF_URL = "https://dngqklliynfoqkalttpu.supabase.co"
const GF_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRuZ3FrbGxpeW5mb3FrYWx0dHB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MTY3NTQsImV4cCI6MjA4OTQ5Mjc1NH0.wJADBNlsyDq7t1wAPZkNpJkPZFpfUrbczdphoXZVyhA"
const IZ_URL = "https://gmbvrjxteoxbiyternfz.supabase.co"
const IZ_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtYnZyanh0ZW94Yml5dGVybmZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1OTgxNjAsImV4cCI6MjA5MTE3NDE2MH0.lZ53-ZzyM9hdV2AE1N6OyPRj9_45mwlKXFglA9ZlJBE"

const APRIL = "2026-04-01"

async function syncAll(full: boolean, gToken: string | null, iToken: string | null): Promise<{
  gfRecep: GfReception[]; gfProducts: GfProduct[]; gfAchat: GfAchat[]
  izCommandes: IzCommande[]; izBL: IzBL[]; izFact: IzFacture[]
  izLignesFact: IzLigneFacture[]; izClients: IzClient[]; izArticles: IzArticle[]
}> {
  const today = new Date().toISOString().slice(0, 10)
  const since = full ? APRIL : today

  const [
    gfRecep, gfProducts, gfAchat,
    izCommandes, izBL, izFact, izLignesFact, izClients, izArticles,
  ] = await Promise.all([
    // GestFlux
    sbFetch<GfReception>(GF_URL, GF_KEY, gToken, "reception",
      `select=id,date,produit_id,article,qte_recue,nb_caisses,num_voyage,heure&date=gte.${since}&order=date.desc&limit=3000`),
    // GestFlux products always fresh (small table)
    sbFetch<GfProduct>(GF_URL, GF_KEY, gToken, "products",
      "select=id,ref,nom_fr,nom_ar,famille,prix_achat,unite,marque&limit=500"),
    // GestFlux achat — SEULE source du prix d'achat reellement negocie du jour
    sbFetch<GfAchat>(GF_URL, GF_KEY, gToken, "achat",
      `select=id,date,produit_id,article,qte_demandee,qte_achetee,nb_caisses,prix,statut,frais_supp,gratuite,acheteur_name&date=gte.${since}&order=date.desc&limit=${full ? 6000 : 500}`),

    // Iziry commandes
    sbFetch<IzCommande>(IZ_URL, IZ_KEY, iToken, "commandes",
      `select=id,numero,client_id,prevendeur_id,statut,montant_total,notes,created_at&created_at=gte.${since}T00:00:00&order=created_at.desc&limit=2000`),
    // Iziry BL
    sbFetch<IzBL>(IZ_URL, IZ_KEY, iToken, "bons_livraison",
      `select=id,numero,client_id,commande_id,statut,montant_ht,montant_ttc,droits_timbre,created_at&created_at=gte.${since}T00:00:00&order=created_at.desc&limit=2000`),
    // Iziry factures
    sbFetch<IzFacture>(IZ_URL, IZ_KEY, iToken, "factures",
      `select=id,numero,bon_livraison_id,client_id,date_facture,montant_ht,montant_ttc,droits_timbre,statut&date_facture=gte.${since}T00:00:00&order=date_facture.desc&limit=2000`),
    // Iziry lignes_facture for avg price per article
    sbFetch<IzLigneFacture>(IZ_URL, IZ_KEY, iToken, "lignes_facture",
      `select=id,facture_id,article_id,quantite,prix_unitaire,montant&order=created_at.desc&limit=${full ? 5000 : 500}`),
    // Reference tables always fresh
    sbFetch<IzClient>(IZ_URL, IZ_KEY, iToken, "clients",
      "select=id,code,raison_sociale,ville&limit=800"),
    sbFetch<IzArticle>(IZ_URL, IZ_KEY, iToken, "articles",
      "select=id,reference,libelle,unite,actif&limit=400"),
  ])

  return { gfRecep, gfProducts, gfAchat, izCommandes, izBL, izFact, izLignesFact, izClients, izArticles }
}

// ── Utility ───────────────────────────────────────────────────────────────────
function fmt(n: number, d = 0) { return n.toLocaleString("fr-MA", { minimumFractionDigits: d, maximumFractionDigits: d }) }
function fmtDate(s: string) { return s ? s.slice(0, 10) : "—" }
function normName(s: unknown): string {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u0600-\u06ff]/g, " ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()
}

// Jaccard token similarity (0–1)
function similarity(a: string, b: string): number {
  const wa = new Set(a.split(" ").filter(Boolean))
  const wb = new Set(b.split(" ").filter(Boolean))
  if (wa.size === 0 && wb.size === 0) return 0
  const common = [...wa].filter(w => wb.has(w)).length
  const union = new Set([...wa, ...wb]).size
  return union === 0 ? 0 : common / union
}

function topSuggestions(
  sourceNorm: string,
  flByNorm: Record<string, { pa: number; nom: string; unite: string }>,
  n = 4
): { flNorm: string; flNom: string; score: number }[] {
  return Object.entries(flByNorm)
    .map(([flNorm, v]) => ({ flNorm, flNom: v.nom, score: similarity(sourceNorm, flNorm) }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
}

function loadMapping(): MappingStore {
  try { return JSON.parse(localStorage.getItem(CACHE.mapping) ?? "{}") } catch { return {} }
}
function saveMapping(m: MappingStore) {
  try { localStorage.setItem(CACHE.mapping, JSON.stringify(m)) } catch {}
}

type SubTab = "achats" | "commandes" | "livraisons" | "factures" | "articles" | "mapping"

// ── Component ─────────────────────────────────────────────────────────────────
export default function BOComparatifExterne({ user: _user }: { user: User }) {
  const [subTab, setSubTab] = useState<SubTab>("achats")
  const [status, setStatus] = useState<SyncStatus>("idle")
  const [lastSync, setLastSync] = useState<string>(localStorage.getItem(CACHE.lastSync) ?? "")
  const [msg, setMsg] = useState<string | null>(null)

  const [gfRecep,      setGfRecep]      = useState<GfReception[]>(()    => loadCache(CACHE.gfRecep))
  const [gfProducts,   setGfProducts]   = useState<GfProduct[]>(()      => loadCache(CACHE.gfProducts))
  const [gfAchat,      setGfAchat]      = useState<GfAchat[]>(()        => loadCache(CACHE.gfAchat))
  const [izCommandes,  setIzCommandes]  = useState<IzCommande[]>(()     => loadCache(CACHE.izCommandes))
  const [izBL,         setIzBL]         = useState<IzBL[]>(()           => loadCache(CACHE.izBL))
  const [izFact,       setIzFact]       = useState<IzFacture[]>(()      => loadCache(CACHE.izFact))
  const [izLignesFact, setIzLignesFact] = useState<IzLigneFacture[]>(() => loadCache(CACHE.izLignesFact))
  const [izClients,    setIzClients]    = useState<IzClient[]>(()       => loadCache(CACHE.izClients))
  const [izArticles,   setIzArticles]   = useState<IzArticle[]>(()      => loadCache(CACHE.izArticles))

  const [mappings, setMappings] = useState<MappingStore>(() => loadMapping())
  const [search, setSearch] = useState("")
  // Jour opérationnel achat (marché de gros nocturne jusqu'à 8h — cf. store.jourOperationnel) :
  // par défaut on regarde le jour d'achat en cours, pas une plage figée depuis avril.
  const [dateFrom, setDateFrom] = useState(() => store.jourOperationnel("achat"))
  const [dateTo,   setDateTo]   = useState(() => store.jourOperationnel("achat"))
  const [familleFiltre, setFamilleFiltre] = useState("toutes")

  const setMapping = (key: string, entry: MappingEntry | null) => {
    setMappings(prev => {
      const next = { ...prev }
      if (entry === null) { delete next[key] } else { next[key] = entry }
      saveMapping(next)
      return next
    })
  }

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 6000) }

  const runSync = useCallback(async (full: boolean) => {
    setStatus("loading")
    flash(full ? "Chargement depuis avril 2026… (10–15 secondes)" : "Synchronisation du jour…")
    try {
      const [gToken, iToken] = await Promise.all([getToken("gestflux"), getToken("iziry")])
      const data = await syncAll(full, gToken, iToken)

      const merge = <T extends { id: string }>(prev: T[], next: T[]): T[] => {
        const map = new Map<string, T>()
        prev.forEach(r => map.set(r.id, r))
        next.forEach(r => map.set(r.id, r))
        return [...map.values()]
      }

      const newGf    = full ? data.gfRecep       : merge(gfRecep,      data.gfRecep)
      const newGfPro = data.gfProducts.length    ? data.gfProducts    : gfProducts
      const newGfAch = full ? data.gfAchat       : merge(gfAchat,      data.gfAchat)
      const newCmd   = full ? data.izCommandes   : merge(izCommandes,  data.izCommandes)
      const newBL    = full ? data.izBL          : merge(izBL,         data.izBL)
      const newFact  = full ? data.izFact        : merge(izFact,       data.izFact)
      const newLF    = full ? data.izLignesFact  : merge(izLignesFact, data.izLignesFact)
      const newCli   = data.izClients.length     ? data.izClients     : izClients
      const newArt   = data.izArticles.length    ? data.izArticles    : izArticles

      setGfRecep(newGf);           saveCache(CACHE.gfRecep,      newGf)
      setGfProducts(newGfPro);     saveCache(CACHE.gfProducts,   newGfPro)
      setGfAchat(newGfAch);        saveCache(CACHE.gfAchat,      newGfAch)
      setIzCommandes(newCmd);      saveCache(CACHE.izCommandes,  newCmd)
      setIzBL(newBL);              saveCache(CACHE.izBL,         newBL)
      setIzFact(newFact);          saveCache(CACHE.izFact,       newFact)
      setIzLignesFact(newLF);      saveCache(CACHE.izLignesFact, newLF)
      setIzClients(newCli);        saveCache(CACHE.izClients,    newCli)
      setIzArticles(newArt);       saveCache(CACHE.izArticles,   newArt)

      const ts = new Date().toLocaleString("fr-MA")
      setLastSync(ts); localStorage.setItem(CACHE.lastSync, ts)
      setStatus("ok")
      flash(`✓ Sync OK — ${newGf.length} réceptions GF · ${newGfAch.length} achats GF · ${newCmd.length} cmds Iziry · ${newBL.length} BL · ${newFact.length} factures`)
    } catch {
      setStatus("error")
      flash("Erreur de synchronisation. Vérifiez la connexion.")
    }
  }, [gfRecep, gfProducts, gfAchat, izCommandes, izBL, izFact, izLignesFact, izClients, izArticles])

  useEffect(() => {
    if (gfRecep.length === 0 && izBL.length === 0) {
      runSync(true)
    } else {
      runSync(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Date filter ──────────────────────────────────────────────────────────
  const inRange = (d: string) => {
    const x = d.slice(0, 10)
    if (dateFrom && x < dateFrom) return false
    if (dateTo   && x > dateTo)   return false
    return true
  }

  // ── FreshLink articles ────────────────────────────────────────────────────
  const flArticles = store.getArticles()
  const flByNorm   = useMemo(() => {
    const m: Record<string, { pa: number; nom: string; unite: string; famille: string; historique: HistoriquePrixAchat[] }> = {}
    flArticles.forEach(a => { m[normName(a.nom)] = { pa: Number(a.prixAchat) || 0, nom: a.nom, unite: a.unite ?? "kg", famille: a.famille ?? "", historique: a.historiquePrixAchat ?? [] } })
    return m
  }, [flArticles])
  const famillesDisponibles = useMemo(() => [...new Set(flArticles.map(a => a.famille).filter(Boolean))].sort(), [flArticles])

  // "Notre PA" doit refleter le prix d'achat du JOUR selectionne (dateFrom..dateTo),
  // pas le prixAchat courant de l'article (qui reste affiche meme des jours/semaines
  // apres le dernier achat reel, laissant croire a une saisie du jour qui n'existe pas).
  // Moyenne ponderee par quantite quand plusieurs achats du meme jour existent.
  const paDuJour = useCallback((historique: HistoriquePrixAchat[] | undefined): number => {
    const entries = (historique ?? []).filter(h => inRange(h.date))
    if (!entries.length) return 0
    const totalQte = entries.reduce((s, h) => s + (h.quantite ?? 1), 0)
    if (totalQte <= 0) return 0
    return entries.reduce((s, h) => s + h.prixAchat * (h.quantite ?? 1), 0) / totalQte
  }, [dateFrom, dateTo])

  // ── GestFlux products by id ───────────────────────────────────────────────
  const gfProductById = useMemo(() => {
    const m: Record<string, GfProduct> = {}
    gfProducts.forEach(p => { m[p.id] = p })
    return m
  }, [gfProducts])

  // Repli par nom normalisé — les réceptions GestFlux ont très souvent
  // produit_id = null (qualité de donnée côté système externe), ce qui
  // rendait "PA GestFlux" systématiquement vide malgré des prix réels
  // disponibles dans la table products. On retrouve le produit par son
  // nom (reception.article ↔ products.nom_fr), comme déjà fait côté Iziry.
  const gfProductByNormName = useMemo(() => {
    const m: Record<string, GfProduct> = {}
    gfProducts.forEach(p => { if (p.nom_fr) m[normName(p.nom_fr)] = p })
    return m
  }, [gfProducts])

  // ── Iziry articles by id ─────────────────────────────────────────────────
  const izArticleById = useMemo(() => {
    const m: Record<string, IzArticle> = {}
    izArticles.forEach(a => { m[a.id] = a })
    return m
  }, [izArticles])

  // Date de facture par id — pour restreindre le prix de vente Iziry au jour
  // selectionne (les lignes_facture n'ont pas de date propre, seule la
  // facture parente en a une).
  const izFactDateById = useMemo(() => {
    const m: Record<string, string> = {}
    izFact.forEach(f => { m[f.id] = f.date_facture })
    return m
  }, [izFact])

  // ── Iziry avg prix per article (from lignes_facture) ──────────────────────
  // izLignesFact est recupere sans filtre de date (juste les N dernieres
  // lignes) — sans le filtre ci-dessous, la moyenne melangeait plusieurs
  // jours (parfois des semaines) au lieu du seul jour selectionne, rendant
  // le "Prix Vente Iziry" affiche non representatif du jour courant.
  const izPrixByArticleId = useMemo(() => {
    const m: Record<string, { sum: number; count: number }> = {}
    izLignesFact.forEach(l => {
      if (!l.article_id || l.prix_unitaire <= 0) return
      const factDate = izFactDateById[l.facture_id]
      if (!factDate || !inRange(factDate)) return
      const prev = m[l.article_id] ?? { sum: 0, count: 0 }
      prev.sum += l.prix_unitaire
      prev.count += 1
      m[l.article_id] = prev
    })
    const avg: Record<string, number> = {}
    Object.entries(m).forEach(([id, v]) => { avg[id] = v.sum / v.count })
    return avg
  }, [izLignesFact, izFactDateById, dateFrom, dateTo])

  // Iziry avg prix by normalized name (for matching with GF articles)
  const izPrixByNorm = useMemo(() => {
    const m: Record<string, number> = {}
    Object.entries(izPrixByArticleId).forEach(([artId, avg]) => {
      const art = izArticleById[artId]
      if (art) m[normName(art.libelle)] = avg
    })
    return m
  }, [izPrixByArticleId, izArticleById])

  // ── Client & reference maps ───────────────────────────────────────────────
  const clientMap = useMemo(() => {
    const m: Record<string, string> = {}
    izClients.forEach(c => { m[c.id] = c.raison_sociale })
    return m
  }, [izClients])

  // ── GestFlux Achats aggregated ────────────────────────────────────────────
  const gfFiltered = useMemo(() => {
    return gfRecep.filter(r => inRange(r.date) && (
      !search || normName(r.article).includes(normName(search))
    ))
  }, [gfRecep, dateFrom, dateTo, search])

  // Prix REELLEMENT negocie du jour, depuis la table "achat" (celle de
  // /synthese-achat) — "reception" ne porte pas de prix, et products.prix_achat
  // est un prix catalogue generique qui ne reflete pas l'achat du jour.
  // Exclut les lignes "non_traite" (demande pas encore achetee, prix = 0).
  const gfAchatFiltered = useMemo(() => {
    return gfAchat.filter(a => inRange(a.date) && a.qte_achetee > 0 && a.prix > 0 && (
      !search || normName(a.article).includes(normName(search))
    ))
  }, [gfAchat, dateFrom, dateTo, search])

  const gfAchatPrixByNorm = useMemo(() => {
    const m: Record<string, { sum: number; qte: number }> = {}
    gfAchatFiltered.forEach(a => {
      const k = normName(a.article)
      const prev = m[k] ?? { sum: 0, qte: 0 }
      prev.sum += a.prix * a.qte_achetee
      prev.qte += a.qte_achetee
      m[k] = prev
    })
    const avg: Record<string, number> = {}
    Object.entries(m).forEach(([k, v]) => { avg[k] = v.qte > 0 ? v.sum / v.qte : 0 })
    return avg
  }, [gfAchatFiltered])

  const gfAgg = useMemo(() => {
    const m: Record<string, {
      article: string; produit_id: string; qteGf: number; count: number; lastDate: string
    }> = {}
    gfFiltered.forEach(r => {
      const k = normName(r.article)
      const prev = m[k] ?? { article: r.article, produit_id: r.produit_id ?? "", qteGf: 0, count: 0, lastDate: "" }
      prev.qteGf += r.qte_recue
      prev.count += 1
      if (r.date > prev.lastDate) { prev.lastDate = r.date; prev.produit_id = r.produit_id ?? prev.produit_id }
      m[k] = prev
    })
    return Object.entries(m).map(([k, v]) => {
      // Prix = table "achat" (negocie du jour), pas products.prix_achat (catalogue).
      const prixGf  = gfAchatPrixByNorm[k] ?? 0
      const prixIz  = izPrixByNorm[k] ?? 0
      // Apply approved mapping override
      const mapEntry = mappings[`gf:${k}`]
      const resolvedNorm = mapEntry?.status === "approved" ? mapEntry.flNorm : k
      const fl      = flByNorm[resolvedNorm]
      const paFl    = paDuJour(fl?.historique)
      const nomFl   = mapEntry?.status === "approved" ? mapEntry.flNom : (fl?.nom ?? null)
      const mapped  = mapEntry?.status === "approved"
      const diffGf  = prixGf > 0 && paFl > 0 ? ((paFl - prixGf) / prixGf) * 100 : null
      const diffIz  = prixIz > 0 && paFl > 0 ? ((paFl - prixIz) / prixIz) * 100 : null
      return { ...v, prixGf, prixIz, paFl, nomFl, diffGf, diffIz, normKey: k, mapped, famille: fl?.famille ?? "" }
    })
      .filter(r => familleFiltre === "toutes" || r.famille === familleFiltre)
      .sort((a, b) => (a.nomFl ?? a.article).localeCompare(b.nomFl ?? b.article, "fr"))
  }, [gfFiltered, gfAchatPrixByNorm, izPrixByNorm, flByNorm, mappings, familleFiltre, paDuJour])

  // ── Iziry Commandes ───────────────────────────────────────────────────────
  const cmdFiltered = useMemo(() => {
    return izCommandes.filter(r => inRange(r.created_at) && (
      !search || (clientMap[r.client_id] ?? "").toLowerCase().includes(search.toLowerCase()) ||
      r.numero.toLowerCase().includes(search.toLowerCase())
    ))
  }, [izCommandes, dateFrom, dateTo, search, clientMap])

  const cmdStats = useMemo(() => {
    const total = cmdFiltered.reduce((s, r) => s + (r.montant_total ?? 0), 0)
    const byStatus: Record<string, number> = {}
    cmdFiltered.forEach(r => { byStatus[r.statut] = (byStatus[r.statut] ?? 0) + 1 })
    return { total, count: cmdFiltered.length, byStatus }
  }, [cmdFiltered])

  // ── Iziry BL ─────────────────────────────────────────────────────────────
  const blFiltered = useMemo(() => {
    return izBL.filter(r => inRange(r.created_at) && (
      !search || (clientMap[r.client_id] ?? "").toLowerCase().includes(search.toLowerCase()) ||
      r.numero.toLowerCase().includes(search.toLowerCase())
    ))
  }, [izBL, dateFrom, dateTo, search, clientMap])

  const blStats = useMemo(() => {
    const total = blFiltered.reduce((s, r) => s + (r.montant_ttc ?? 0), 0)
    const byStatus: Record<string, number> = {}
    blFiltered.forEach(r => { byStatus[r.statut] = (byStatus[r.statut] ?? 0) + 1 })
    return { total, count: blFiltered.length, byStatus }
  }, [blFiltered])

  // ── Iziry Factures ────────────────────────────────────────────────────────
  const factFiltered = useMemo(() => {
    return izFact.filter(r => inRange(r.date_facture) && (
      !search || (clientMap[r.client_id] ?? "").toLowerCase().includes(search.toLowerCase()) ||
      r.numero.toLowerCase().includes(search.toLowerCase())
    ))
  }, [izFact, dateFrom, dateTo, search, clientMap])

  const factStats = useMemo(() => {
    const total = factFiltered.reduce((s, r) => s + (r.montant_ttc ?? 0), 0)
    const byStatus: Record<string, number> = {}
    factFiltered.forEach(r => { byStatus[r.statut] = (byStatus[r.statut] ?? 0) + 1 })
    return { total, count: factFiltered.length, byStatus }
  }, [factFiltered])

  // ── Iziry Articles ────────────────────────────────────────────────────────
  const artFiltered = useMemo(() => {
    return izArticles.filter(a =>
      !search || normName(a.libelle).includes(normName(search)) ||
      a.reference.toLowerCase().includes(search.toLowerCase())
    )
  }, [izArticles, search])

  const artComp = useMemo(() => {
    return artFiltered.map(a => {
      const norm    = normName(a.libelle)
      const mapEntry = mappings[`iz:${norm}`]
      const resolvedNorm = mapEntry?.status === "approved" ? mapEntry.flNorm : norm
      const fl      = flByNorm[resolvedNorm]
      const prixIz  = izPrixByArticleId[a.id] ?? 0
      const nomFl   = mapEntry?.status === "approved" ? mapEntry.flNom : (fl?.nom ?? null)
      const mapped  = mapEntry?.status === "approved"
      return { ...a, paFl: paDuJour(fl?.historique), nomFl, prixIz, mapped, normKey: norm }
    })
  }, [artFiltered, flByNorm, izPrixByArticleId, mappings, paDuJour])

  // ── UI helpers ────────────────────────────────────────────────────────────
  const diffBadge = (diff: number | null, tooltip?: string) => {
    if (diff === null) return <span className="text-slate-300 text-[10px]">—</span>
    const cls = diff > 5 ? "bg-red-100 text-red-700" : diff < -5 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
    return (
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${cls}`} title={tooltip}>
        {diff > 0 ? "+" : ""}{diff.toFixed(1)}%
      </span>
    )
  }
  const statBadge = (s: string) => {
    const c: Record<string, string> = {
      emise: "bg-blue-100 text-blue-700", payee: "bg-emerald-100 text-emerald-700",
      livre: "bg-emerald-100 text-emerald-700", livree: "bg-emerald-100 text-emerald-700",
      en_cours: "bg-amber-100 text-amber-700", validee: "bg-emerald-100 text-emerald-700",
      annulee: "bg-red-100 text-red-700", brouillon: "bg-slate-100 text-slate-500",
    }
    return <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${c[s] ?? "bg-slate-100 text-slate-500"}`}>{s}</span>
  }
  const prixCell = (p: number, color = "text-slate-700") =>
    p > 0 ? <span className={`font-mono font-bold ${color}`}>{fmt(p, 2)}</span> : <span className="text-slate-300">—</span>

  const approvedCount  = Object.values(mappings).filter(m => m.status === "approved").length
  const rejectedCount  = Object.values(mappings).filter(m => m.status === "rejected").length

  const TABS: [SubTab, string][] = [
    ["achats",      `🛒 Achats GestFlux (${gfRecep.length})`],
    ["commandes",   `📋 Commandes Iziry (${izCommandes.length})`],
    ["livraisons",  `🚚 BL Iziry (${izBL.length})`],
    ["factures",    `🧾 Factures Iziry (${izFact.length})`],
    ["articles",    `📦 Articles (${izArticles.length})`],
    ["mapping",     `🔗 Mapping Articles${approvedCount > 0 ? ` (${approvedCount}✓)` : ""}`],
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-lg font-black text-slate-900">Comparatif Données Externes</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            GestFlux (3 tables) · Iziry (13 tables) vs FreshLink
            {lastSync && <span className="ml-2 text-slate-400">· Sync {lastSync}</span>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => runSync(false)} disabled={status === "loading"}
            className="px-3 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold disabled:opacity-50 hover:bg-slate-700">
            {status === "loading" ? "⏳ Sync…" : "↺ Sync aujourd'hui"}
          </button>
          <button onClick={() => { if (confirm("Charger TOUTES les données depuis avril 2026 ? (15–20s)")) runSync(true) }}
            disabled={status === "loading"}
            className="px-3 py-2 rounded-xl bg-violet-600 text-white text-xs font-bold disabled:opacity-50 hover:bg-violet-700">
            📥 Import complet (avril→)
          </button>
        </div>
      </div>

      {msg && (
        <div className={`px-4 py-2.5 rounded-xl text-sm font-semibold shadow ${status === "error" ? "bg-red-600" : "bg-blue-600"} text-white`}>
          {msg}
        </div>
      )}

      {/* KPI bar */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { l: "Arrivages GF", v: `${gfRecep.length}`, sub: `${fmt(gfRecep.reduce((s, r) => s + r.qte_recue, 0))} kg`, c: "blue" },
          { l: "Produits GestFlux", v: `${gfProducts.length}`, sub: "avec prix achat", c: "indigo" },
          { l: "Commandes Iziry", v: fmt(izCommandes.reduce((s, r) => s + (r.montant_total ?? 0), 0)), sub: `${izCommandes.length} cmds`, c: "orange" },
          { l: "BL Iziry", v: fmt(izBL.reduce((s, r) => s + (r.montant_ttc ?? 0), 0)), sub: `${izBL.length} BL`, c: "violet" },
          { l: "Facturé Iziry", v: fmt(izFact.reduce((s, r) => s + (r.montant_ttc ?? 0), 0)), sub: `${izFact.length} factures`, c: "emerald" },
        ].map(k => (
          <div key={k.l} className="bg-white rounded-xl border border-slate-200 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{k.l}</p>
            <p className={`text-lg font-black mt-0.5 ${
              k.c === "blue" ? "text-blue-700" : k.c === "indigo" ? "text-indigo-700" :
              k.c === "orange" ? "text-orange-700" : k.c === "violet" ? "text-violet-700" : "text-emerald-700"
            }`}>{k.v}</p>
            <p className="text-[10px] text-slate-400">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 bg-white border border-slate-200 rounded-xl p-3">
        <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 flex-1 min-w-[160px]">
          <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher article, client, numéro…"
            className="text-xs bg-transparent focus:outline-none w-full text-slate-700 placeholder:text-slate-400" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-bold text-slate-500 uppercase">Du</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs bg-slate-50" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-bold text-slate-500 uppercase">Au</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs bg-slate-50" />
        </div>
        <select value={familleFiltre} onChange={e => setFamilleFiltre(e.target.value)}
          className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs bg-slate-50">
          <option value="toutes">Toutes les familles</option>
          {famillesDisponibles.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        {(dateFrom !== store.jourOperationnel("achat") || dateTo !== store.jourOperationnel("achat") || familleFiltre !== "toutes") && (
          <button onClick={() => { setDateFrom(store.jourOperationnel("achat")); setDateTo(store.jourOperationnel("achat")); setFamilleFiltre("toutes") }}
            className="text-xs text-slate-400 hover:text-red-500">↺ Réinit</button>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setSubTab(k)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${subTab === k ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300"}`}>
            {l}
          </button>
        ))}
      </div>

      {/* ── Achats GestFlux — 3 prix côte à côte ─────────────────────────── */}
      {subTab === "achats" && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-sm font-black text-slate-800">Comparatif 3 Prix — GestFlux · Iziry · FreshLink</p>
              <p className="text-[11px] text-slate-400">{gfAgg.length} articles · GestFlux = PA achat (comparable) · Iziry = prix de VENTE à leurs clients (inclut leur marge, pas un prix d&apos;achat) · Rouge = notre PA supérieur · Vert = avantage</p>
            </div>
            <div className="flex gap-4 text-xs">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"/><span className="text-slate-500">PA GestFlux (achat)</span></span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-orange-400 inline-block"/><span className="text-slate-500">Prix Vente Iziry (moy.)</span></span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate-600 inline-block"/><span className="text-slate-500">Notre PA</span></span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wide">
                  <th className="px-4 py-2.5 text-left font-bold">Article</th>
                  <th className="px-3 py-2.5 text-right font-bold">Qté (kg)</th>
                  <th className="px-3 py-2.5 text-right font-bold">PA GestFlux</th>
                  <th className="px-3 py-2.5 text-center font-bold">Δ GF</th>
                  <th className="px-3 py-2.5 text-right font-bold" title="Prix de VENTE d'Iziry à ses clients — pas un prix d'achat, marge incluse">Prix Vente Iziry</th>
                  <th className="px-3 py-2.5 text-center font-bold">Δ Iz</th>
                  <th className="px-3 py-2.5 text-right font-bold">Notre PA</th>
                  <th className="px-3 py-2.5 text-left font-bold">Article FL</th>
                  <th className="px-3 py-2.5 text-center font-bold">Passages</th>
                  <th className="px-3 py-2.5 text-left font-bold">Dernier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {gfAgg.slice(0, 120).map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-800 max-w-[180px] truncate" title={r.article}>{r.article}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-600">{fmt(r.qteGf, 1)}</td>
                    <td className="px-3 py-2 text-right">{prixCell(r.prixGf, "text-blue-700")}</td>
                    <td className="px-3 py-2 text-center">{diffBadge(r.diffGf, "Notre PA vs GestFlux (achat)")}</td>
                    <td className="px-3 py-2 text-right">{prixCell(r.prixIz, "text-orange-600")}</td>
                    <td className="px-3 py-2 text-center">{diffBadge(r.diffIz, "Notre PA vs prix de VENTE Iziry — pas comparable 1:1, marge incluse")}</td>
                    <td className="px-3 py-2 text-right">{prixCell(r.paFl)}</td>
                    <td className="px-3 py-2 text-slate-500 max-w-[140px] truncate">
                      {r.nomFl ?? <span className="text-slate-300 italic">Non trouvé</span>}
                    </td>
                    <td className="px-3 py-2 text-center text-slate-500">{r.count}</td>
                    <td className="px-3 py-2 text-slate-400">{fmtDate(r.lastDate)}</td>
                  </tr>
                ))}
                {gfAgg.length === 0 && (
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                    Aucun arrivage. Cliquez sur "Import complet (avril→)".
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          {gfAgg.length > 120 && <p className="text-center text-xs text-slate-400 py-2">100 premiers sur {gfAgg.length} articles</p>}
        </div>
      )}

      {/* ── Commandes Iziry ──────────────────────────────────────────────── */}
      {subTab === "commandes" && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
              <p className="text-[10px] font-bold uppercase text-slate-400">CA Commandes</p>
              <p className="text-2xl font-black text-orange-700">{fmt(cmdStats.total)} DH</p>
              <p className="text-xs text-slate-400">{cmdStats.count} commandes</p>
            </div>
            {Object.entries(cmdStats.byStatus).slice(0, 3).map(([s, n]) => (
              <div key={s} className="bg-white rounded-xl border border-slate-200 p-3 text-center">
                <p className="text-[10px] font-bold uppercase text-slate-400">{s}</p>
                <p className="text-xl font-black text-slate-700">{n}</p>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="text-sm font-black text-slate-800">Commandes — Iziry</p>
              <p className="text-[11px] text-slate-400">{cmdFiltered.length} commandes sur la période</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wide">
                    <th className="px-4 py-2.5 text-left font-bold">Numéro</th>
                    <th className="px-3 py-2.5 text-left font-bold">Client</th>
                    <th className="px-3 py-2.5 text-center font-bold">Statut</th>
                    <th className="px-3 py-2.5 text-right font-bold">Montant Total</th>
                    <th className="px-3 py-2.5 text-left font-bold">Date</th>
                    <th className="px-3 py-2.5 text-left font-bold">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {cmdFiltered.slice(0, 100).map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-mono text-slate-700 text-[11px]">{r.numero}</td>
                      <td className="px-3 py-2 text-slate-600 max-w-[160px] truncate">{clientMap[r.client_id] ?? r.client_id?.slice(0, 8)}</td>
                      <td className="px-3 py-2 text-center">{statBadge(r.statut)}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-orange-700">{fmt(r.montant_total ?? 0, 2)}</td>
                      <td className="px-3 py-2 text-slate-400">{fmtDate(r.created_at)}</td>
                      <td className="px-3 py-2 text-slate-400 max-w-[200px] truncate">{r.notes ?? "—"}</td>
                    </tr>
                  ))}
                  {cmdFiltered.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Aucune commande sur cette période.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {cmdFiltered.length > 100 && <p className="text-center text-xs text-slate-400 py-2">Affichage des 100 premiers sur {cmdFiltered.length}</p>}
          </div>
        </div>
      )}

      {/* ── BL Iziry ────────────────────────────────────────────────────── */}
      {subTab === "livraisons" && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
              <p className="text-[10px] font-bold uppercase text-slate-400">BL total TTC</p>
              <p className="text-2xl font-black text-violet-700">{fmt(blStats.total)} DH</p>
              <p className="text-xs text-slate-400">{blStats.count} bons</p>
            </div>
            {Object.entries(blStats.byStatus).slice(0, 3).map(([s, n]) => (
              <div key={s} className="bg-white rounded-xl border border-slate-200 p-3 text-center">
                <p className="text-[10px] font-bold uppercase text-slate-400">{s}</p>
                <p className="text-xl font-black text-slate-700">{n}</p>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="text-sm font-black text-slate-800">Bons de Livraison — Iziry</p>
              <p className="text-[11px] text-slate-400">{blFiltered.length} BL sur la période</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wide">
                    <th className="px-4 py-2.5 text-left font-bold">Numéro</th>
                    <th className="px-3 py-2.5 text-left font-bold">Client</th>
                    <th className="px-3 py-2.5 text-center font-bold">Statut</th>
                    <th className="px-3 py-2.5 text-right font-bold">Montant HT</th>
                    <th className="px-3 py-2.5 text-right font-bold">Timbre</th>
                    <th className="px-3 py-2.5 text-right font-bold">Montant TTC</th>
                    <th className="px-3 py-2.5 text-left font-bold">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {blFiltered.slice(0, 100).map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-mono text-slate-700 text-[11px]">{r.numero}</td>
                      <td className="px-3 py-2 text-slate-600 max-w-[160px] truncate">{clientMap[r.client_id] ?? r.client_id?.slice(0, 8)}</td>
                      <td className="px-3 py-2 text-center">{statBadge(r.statut)}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-700">{fmt(r.montant_ht ?? 0, 2)}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-400">{fmt(r.droits_timbre ?? 0, 2)}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-violet-700">{fmt(r.montant_ttc ?? 0, 2)}</td>
                      <td className="px-3 py-2 text-slate-400">{fmtDate(r.created_at)}</td>
                    </tr>
                  ))}
                  {blFiltered.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Aucun BL sur cette période.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {blFiltered.length > 100 && <p className="text-center text-xs text-slate-400 py-2">Affichage des 100 premiers sur {blFiltered.length}</p>}
          </div>
        </div>
      )}

      {/* ── Factures Iziry ──────────────────────────────────────────────── */}
      {subTab === "factures" && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
              <p className="text-[10px] font-bold uppercase text-slate-400">Facturé TTC</p>
              <p className="text-2xl font-black text-emerald-700">{fmt(factStats.total)} DH</p>
              <p className="text-xs text-slate-400">{factStats.count} factures</p>
            </div>
            {Object.entries(factStats.byStatus).slice(0, 3).map(([s, n]) => (
              <div key={s} className="bg-white rounded-xl border border-slate-200 p-3 text-center">
                <p className="text-[10px] font-bold uppercase text-slate-400">{s}</p>
                <p className="text-xl font-black text-slate-700">{n}</p>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="text-sm font-black text-slate-800">Factures — Iziry</p>
              <p className="text-[11px] text-slate-400">{factFiltered.length} factures sur la période</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wide">
                    <th className="px-4 py-2.5 text-left font-bold">Numéro</th>
                    <th className="px-3 py-2.5 text-left font-bold">Client</th>
                    <th className="px-3 py-2.5 text-center font-bold">Statut</th>
                    <th className="px-3 py-2.5 text-right font-bold">Montant HT</th>
                    <th className="px-3 py-2.5 text-right font-bold">Timbre</th>
                    <th className="px-3 py-2.5 text-right font-bold">Montant TTC</th>
                    <th className="px-3 py-2.5 text-left font-bold">Date facture</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {factFiltered.slice(0, 100).map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-mono text-slate-700 text-[11px]">{r.numero}</td>
                      <td className="px-3 py-2 text-slate-600 max-w-[160px] truncate">{clientMap[r.client_id] ?? r.client_id?.slice(0, 8)}</td>
                      <td className="px-3 py-2 text-center">{statBadge(r.statut)}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-700">{fmt(r.montant_ht ?? 0, 2)}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-400">{fmt(r.droits_timbre ?? 0, 2)}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">{fmt(r.montant_ttc ?? 0, 2)}</td>
                      <td className="px-3 py-2 text-slate-400">{fmtDate(r.date_facture)}</td>
                    </tr>
                  ))}
                  {factFiltered.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Aucune facture sur cette période.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {factFiltered.length > 100 && <p className="text-center text-xs text-slate-400 py-2">Affichage des 100 premiers sur {factFiltered.length}</p>}
          </div>
        </div>
      )}

      {/* ── Articles comparatif ──────────────────────────────────────────── */}
      {subTab === "articles" && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-sm font-black text-slate-800">Catalogue Iziry vs FreshLink — 3 prix</p>
              <p className="text-[11px] text-slate-400">
                {artComp.length} articles · {artComp.filter(a => a.nomFl).length} matchés FreshLink ·
                {artComp.filter(a => a.prixIz > 0).length} avec prix de vente Iziry (pas un prix d&apos;achat — marge incluse, écart non comparable 1:1 à notre PA)
              </p>
            </div>
            <div className="flex gap-3 text-xs">
              <span className="text-emerald-600 font-bold">{artComp.filter(a => a.nomFl).length} matchés</span>
              <span className="text-slate-400">{artComp.filter(a => !a.nomFl).length} non matchés</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wide">
                  <th className="px-4 py-2.5 text-left font-bold">Réf Iziry</th>
                  <th className="px-3 py-2.5 text-left font-bold">Article Iziry</th>
                  <th className="px-3 py-2.5 text-left font-bold">Unité</th>
                  <th className="px-3 py-2.5 text-center font-bold">Actif</th>
                  <th className="px-3 py-2.5 text-right font-bold" title="Prix de VENTE d'Iziry à ses clients — pas un prix d'achat">Prix Vente Iziry (moy.)</th>
                  <th className="px-3 py-2.5 text-left font-bold">Article FreshLink</th>
                  <th className="px-3 py-2.5 text-right font-bold">Notre PA</th>
                  <th className="px-3 py-2.5 text-center font-bold">Écart</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {artComp.slice(0, 150).map((a, i) => {
                  const diff = a.prixIz > 0 && a.paFl > 0 ? ((a.paFl - a.prixIz) / a.prixIz) * 100 : null
                  return (
                    <tr key={i} className={`hover:bg-slate-50 ${a.nomFl ? "" : "opacity-60"}`}>
                      <td className="px-4 py-2 font-mono text-slate-500 text-[10px]">{a.reference}</td>
                      <td className="px-3 py-2 font-medium text-slate-800 max-w-[180px] truncate" title={a.libelle}>{a.libelle}</td>
                      <td className="px-3 py-2 text-slate-500">{a.unite}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${a.actif ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>
                          {a.actif ? "✓" : "✗"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">{prixCell(a.prixIz, "text-orange-600")}</td>
                      <td className="px-3 py-2 text-slate-600 max-w-[160px] truncate">
                        {a.nomFl
                          ? <span className="text-emerald-700 font-semibold">{a.nomFl}</span>
                          : <span className="text-slate-300 italic">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right">{prixCell(a.paFl)}</td>
                      <td className="px-3 py-2 text-center">{diffBadge(diff)}</td>
                    </tr>
                  )
                })}
                {artComp.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Aucun article chargé.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Mapping Articles ─────────────────────────────────────────────── */}
      {subTab === "mapping" && (
        <MappingTab
          gfProducts={gfProducts}
          izArticles={izArticles}
          flByNorm={flByNorm}
          mappings={mappings}
          setMapping={setMapping}
          approvedCount={approvedCount}
          rejectedCount={rejectedCount}
        />
      )}
    </div>
  )
}

// ── MappingTab component ───────────────────────────────────────────────────────
interface MappingTabProps {
  gfProducts: GfProduct[]
  izArticles: IzArticle[]
  flByNorm: Record<string, { pa: number; nom: string; unite: string }>
  mappings: MappingStore
  setMapping: (key: string, entry: MappingEntry | null) => void
  approvedCount: number
  rejectedCount: number
}

type MappingFilter = "all" | "unmatched" | "approved" | "rejected"

function MappingTab({ gfProducts, izArticles, flByNorm, mappings, setMapping, approvedCount, rejectedCount }: MappingTabProps) {
  const [filter, setFilter] = useState<MappingFilter>("unmatched")
  const [mapSearch, setMapSearch] = useState("")
  const [source, setSource] = useState<"both" | "gf" | "iz">("both")

  // Build unified candidate list: { prefix, norm, label, ref }
  const candidates = useMemo(() => {
    const list: { key: string; prefix: "gf" | "iz"; norm: string; label: string; ref: string }[] = []
    gfProducts.forEach(p => {
      const n = normName(p.nom_fr || p.nom_ar || p.ref)
      if (n) list.push({ key: `gf:${n}`, prefix: "gf", norm: n, label: p.nom_fr || p.nom_ar || p.ref, ref: p.ref })
    })
    izArticles.forEach(a => {
      const n = normName(a.libelle)
      if (n) list.push({ key: `iz:${n}`, prefix: "iz", norm: n, label: a.libelle, ref: a.reference })
    })
    // Deduplicate by key
    const seen = new Set<string>()
    return list.filter(c => { if (seen.has(c.key)) return false; seen.add(c.key); return true })
  }, [gfProducts, izArticles])

  const filtered = useMemo(() => {
    return candidates.filter(c => {
      if (source !== "both" && c.prefix !== source) return false
      if (mapSearch && !c.norm.includes(normName(mapSearch)) && !c.label.toLowerCase().includes(mapSearch.toLowerCase())) return false
      const entry = mappings[c.key]
      const directMatch = !!flByNorm[c.norm]
      if (filter === "unmatched") return !directMatch && entry?.status !== "approved"
      if (filter === "approved")  return entry?.status === "approved"
      if (filter === "rejected")  return entry?.status === "rejected"
      return true  // "all"
    })
  }, [candidates, filter, source, mapSearch, mappings, flByNorm])

  const unmatchedCount = useMemo(() =>
    candidates.filter(c => !flByNorm[c.norm] && mappings[c.key]?.status !== "approved").length,
  [candidates, flByNorm, mappings])

  const FILTERS: [MappingFilter, string][] = [
    ["unmatched", `⚠ Non matchés (${unmatchedCount})`],
    ["approved",  `✓ Approuvés (${approvedCount})`],
    ["rejected",  `✗ Ignorés (${rejectedCount})`],
    ["all",       "Tous"],
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-black text-slate-800">Mapping Articles GestFlux / Iziry → FreshLink</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Associez manuellement les articles non-détectés automatiquement.
              Les mappings approuvés sont utilisés dans le comparatif 3-prix.
            </p>
          </div>
          <div className="flex gap-2 items-center text-xs">
            <span className="text-emerald-600 font-bold">{approvedCount} approuvés</span>
            <span className="text-slate-300">·</span>
            <span className="text-red-500 font-bold">{rejectedCount} ignorés</span>
            <span className="text-slate-300">·</span>
            <span className="text-amber-600 font-bold">{unmatchedCount} en attente</span>
            {approvedCount + rejectedCount > 0 && (
              <button onClick={() => { if (confirm("Réinitialiser tous les mappings ?")) { Object.keys(mappings).forEach(k => setMapping(k, null)) } }}
                className="ml-2 px-2 py-1 rounded bg-red-50 text-red-500 text-[10px] font-bold hover:bg-red-100">
                🗑 Reset tout
              </button>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-3 mt-3">
          <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 flex-1 min-w-[160px]">
            <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input value={mapSearch} onChange={e => setMapSearch(e.target.value)} placeholder="Filtrer article…"
              className="text-xs bg-transparent focus:outline-none w-full text-slate-700 placeholder:text-slate-400" />
          </div>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-[10px] font-bold">
            {(["both", "gf", "iz"] as const).map(s => (
              <button key={s} onClick={() => setSource(s)}
                className={`px-3 py-2 ${source === s ? "bg-slate-800 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                {s === "both" ? "GF + Iziry" : s === "gf" ? "GestFlux" : "Iziry"}
              </button>
            ))}
          </div>
        </div>

        {/* Filter pills */}
        <div className="flex gap-2 mt-3 flex-wrap">
          {FILTERS.map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${filter === k ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex flex-col gap-2">
        {filtered.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">
            {filter === "unmatched" ? "✓ Tous les articles sont matchés !" : "Aucun article dans cette catégorie."}
          </div>
        )}
        {filtered.slice(0, 80).map(c => {
          const entry = mappings[c.key]
          const directMatch = flByNorm[c.norm]
          const suggestions = topSuggestions(c.norm, flByNorm, 4)
          const isApproved = entry?.status === "approved"
          const isRejected = entry?.status === "rejected"

          return (
            <div key={c.key} className={`bg-white rounded-xl border p-4 transition-colors ${
              isApproved ? "border-emerald-200 bg-emerald-50/30" :
              isRejected ? "border-slate-100 opacity-60" :
              directMatch ? "border-blue-100 bg-blue-50/20" :
              "border-slate-200"
            }`}>
              {/* Article header */}
              <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                    c.prefix === "gf" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"
                  }`}>{c.prefix === "gf" ? "GestFlux" : "Iziry"}</span>
                  <span className="text-sm font-bold text-slate-800">{c.label}</span>
                  <span className="text-[10px] text-slate-400 font-mono">{c.ref}</span>
                </div>
                <div className="flex items-center gap-2">
                  {directMatch && !isApproved && (
                    <span className="text-[11px] text-blue-600 font-semibold">
                      ✓ Déjà matchée → <span className="font-bold">{directMatch.nom}</span>
                    </span>
                  )}
                  {isApproved && (
                    <span className="text-[11px] text-emerald-600 font-bold">
                      ✓ Associé à : {entry.flNom}
                    </span>
                  )}
                  {isRejected && <span className="text-[11px] text-slate-400 italic">Ignoré</span>}
                  {(isApproved || isRejected) && (
                    <button onClick={() => setMapping(c.key, null)}
                      className="text-[10px] text-slate-400 hover:text-red-500 px-1.5 py-0.5 rounded bg-slate-100 hover:bg-red-50">
                      Annuler
                    </button>
                  )}
                  {!isApproved && !isRejected && (
                    <button onClick={() => setMapping(c.key, { flNorm: "", flNom: "", status: "rejected" })}
                      className="text-[10px] text-slate-400 hover:text-red-500 px-1.5 py-0.5 rounded bg-slate-100 hover:bg-red-50">
                      ✗ Ignorer
                    </button>
                  )}
                </div>
              </div>

              {/* Suggestions */}
              {!isApproved && !isRejected && !directMatch && (
                <div className="flex flex-wrap gap-2">
                  {suggestions.length === 0 ? (
                    <span className="text-[11px] text-slate-400 italic">Aucune suggestion disponible</span>
                  ) : (
                    <>
                      <span className="text-[10px] text-slate-400 self-center">Suggestions :</span>
                      {suggestions.map(s => (
                        <button key={s.flNorm} onClick={() => setMapping(c.key, { flNorm: s.flNorm, flNom: s.flNom, status: "approved" })}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 transition-colors group">
                          <span className="text-xs font-semibold text-slate-700 group-hover:text-emerald-700">{s.flNom}</span>
                          <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${
                            s.score > 0.6 ? "bg-emerald-100 text-emerald-700" :
                            s.score > 0.3 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
                          }`}>{Math.round(s.score * 100)}%</span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
              {!isApproved && !isRejected && directMatch && suggestions.length > 1 && (
                <div className="flex flex-wrap gap-2 mt-1">
                  <span className="text-[10px] text-slate-400 self-center">Autres suggestions :</span>
                  {suggestions.filter(s => s.flNorm !== c.norm).slice(0, 3).map(s => (
                    <button key={s.flNorm} onClick={() => setMapping(c.key, { flNorm: s.flNorm, flNom: s.flNom, status: "approved" })}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 hover:border-violet-300 hover:bg-violet-50 transition-colors group">
                      <span className="text-xs font-semibold text-slate-700 group-hover:text-violet-700">{s.flNom}</span>
                      <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-slate-100 text-slate-500">{Math.round(s.score * 100)}%</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {filtered.length > 80 && (
          <p className="text-center text-xs text-slate-400 py-2">Affichage de 80 premiers sur {filtered.length}</p>
        )}
      </div>
    </div>
  )
}
