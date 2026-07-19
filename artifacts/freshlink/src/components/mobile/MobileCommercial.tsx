"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { store, type Article, type User, type Client, type Commande, type Visite, DELAI_RECOUVREMENT_LABELS, type DelaiRecouvrement, MODALITE_LABELS, type ModalitePaiement, getAllSecteurs, VILLES_MAROC, ROLE_LABELS } from "@/lib/store"
import { sendEmail, buildCommandeEmail } from "@/lib/email"
import ArticleCombobox from "@/components/ui/ArticleCombobox"
import SwipeToDelete from "@/components/ui/SwipeToDelete"
import { resolveArticlePhoto } from "@/lib/articlePhotoHelper"
import { loadZonesConfig, zoneOfSecteur, type ZonesConfig } from "@/lib/commercial/zones"

interface Props { user: User }

interface LigneForm {
  articleId: string
  quantite: string    // always the count IN the chosen unit (UM count or base units)
  prixVente: string   // DH per base unit (kg / piece / ...)
  uniteMode: string   // "base" = article.unite, or art.um label = UM mode
}

type CommTab = "nouvelle" | "mes_commandes" | "habitudes"
type ArticleSort = "rotation" | "stock" | "tous" | "famille"

// How many ms before a commande becomes locked (1 hour)
const EDIT_WINDOW_MS = 60 * 60 * 1000

type FilterKey = "nom" | "taille" | "rotation" | "type" | "proche"

const TAILLE_LABELS: Record<string, string> = {
  "50-100kg": "50–100 kg", "150-300kg": "150–300 kg",
  "350-500kg": "350–500 kg", "500kg+": "+500 kg",
}
const ROTATION_LABELS: Record<string, string> = {
  journalier: "Journalier / يومي", "4j/6": "4j/6", "3/6": "3/6", "2/6": "2/6", moins: "< 2/6",
}
const TYPE_LABELS: Record<string, string> = {
  marchand: "Marchand / بائع",
  snack: "Snack / سناك",
  epicerie: "Epicerie / بقالة",
  boucherie: "Boucherie / جزارة",
  restaurant: "Restaurant / مطعم",
  superette: "Superette / سوبيريت",
  grossiste: "Grossiste / جملة",
  hypermarche: "Hypermarche / هايبر",
  traiteur: "Traiteur / خدمات طعام",
  hotel: "Hotel / فندق",
  marche: "Marche / سوق",
  cafeteria: "Cafeteria / كافيتيريا",
  cantina: "Cantine / مطعم مدرسة",
  collectivite: "Collectivite / جماعة",
  autre: "Autre / أخرى",
}

function distKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function MobileCommercial({ user }: Props) {
  const [articles, setArticles] = useState<Article[]>([])
  const [clients, setClients] = useState<Client[]>([])
  // Config Zones & Secteurs (même pool que le BO — plus de liste de secteurs
  // déconnectée) — chargée une fois, affiche la zone commerciale du secteur.
  const [zonesCfg, setZonesCfg] = useState<ZonesConfig | null>(null)
  useEffect(() => { loadZonesConfig().then(setZonesCfg) }, [])
  const zoneLabelOf = (secteur: string) => zonesCfg ? zoneOfSecteur(zonesCfg, secteur)?.label ?? null : null
  const [selectedClientId, setSelectedClientId] = useState("")
  const [heurelivraison, setHeureLivraison] = useState("")
  // Une fois qu'un client a un horaire habituel enregistré, on masque le champ
  // par défaut (le prévendeur n'a plus à le ressaisir à chaque commande) — un
  // lien "Modifier" permet de le rouvrir si l'horaire doit exceptionnellement
  // changer pour cette commande.
  const [showHeureEdit, setShowHeureEdit] = useState(false)
  const [lignes, setLignes] = useState<LigneForm[]>([{ articleId: "", quantite: "", prixVente: "", uniteMode: "base" }])

  // Vendeur selector — only admins / resp_commercial can pick a different vendeur
  const isAdmin = user.role === "super_super_admin" || user.role === "super_admin" || user.role === "admin" || user.role === "resp_commercial"
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [vendeurId, setVendeurId] = useState(user.id)
  const [vendeurNom, setVendeurNom] = useState(user.name)
  const [gpsLat, setGpsLat] = useState<number | null>(null)
  const [gpsLng, setGpsLng] = useState<number | null>(null)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [gpsStatus, setGpsStatus] = useState<"loading" | "granted" | "denied">("loading")
  const [sending, setSending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [successWorkflow, setSuccessWorkflow] = useState<string | null>(null)

  // Client filters
  const [filterKey, setFilterKey] = useState<FilterKey>("nom")
  const [searchNom, setSearchNom] = useState("")
  const [filterTaille, setFilterTaille] = useState("")
  const [filterRotation, setFilterRotation] = useState("")
  const [filterType, setFilterType] = useState("")
  const [showClientDropdown, setShowClientDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Add new client
  const [showAddClient, setShowAddClient] = useState(false)
  // Modification d'un client existant — réutilise le formulaire "Nouveau
  // client" pré-rempli ; null = mode création.
  const [editingClientId, setEditingClientId] = useState<string | null>(null)
  const openEditClient = (c: Client) => {
    setEditingClientId(c.id)
    setNewClient({
      nom: c.nom, secteur: c.secteur || user.secteur || "", zone: c.zone || "Casablanca",
      type: c.type, typeAutre: c.typeAutre || "",
      taille: c.taille, typeProduits: c.typeProduits, rotation: c.rotation,
      telephone: c.telephone || "", email: c.email || "", adresse: c.adresse || "",
      categorie: c.categorie, heureLivraison: c.defaultHeureLivraison || c.heureLivraison || lastHeureLivraison(),
    })
    setShowAddClient(true)
  }
  // Heure de livraison par défaut = la dernière choisie par CE prévendeur —
  // masquée par défaut dans le formulaire (pas de saisie supplémentaire à
  // faire à chaque client), affichable/modifiable au besoin.
  const LAST_HEURE_KEY = `fl_last_heure_livraison_${user.id}`
  const lastHeureLivraison = () => {
    try { return localStorage.getItem(LAST_HEURE_KEY) || "08:00" } catch { return "08:00" }
  }
  const [showHeureLivraison, setShowHeureLivraison] = useState(false)
  const [newClient, setNewClient] = useState({
    nom: "", secteur: user.secteur || "", zone: "Casablanca",
    type: "marchand" as Client["type"], typeAutre: "",
    taille: "150-300kg" as Client["taille"],
    typeProduits: "moyenne" as Client["typeProduits"],
    rotation: "journalier" as Client["rotation"],
    telephone: "", email: "", adresse: "",
    categorie: "marchand" as "chr" | "marchand" | "particulier" | undefined,
    heureLivraison: lastHeureLivraison(),
  })

  // Proximity radius (km) — configurable by prevendeur
  const [proximiteKm, setProximiteKm] = useState(5)
  const [showProximiteSlider, setShowProximiteSlider] = useState(false)

  // Visite sans commande
  const [showVisiteForm, setShowVisiteForm] = useState(false)
  const [visiteClientId, setVisiteClientId] = useState("")
  const [visiteRaison, setVisiteRaison] = useState("")
  const RAISONS_SANS_COMMANDE = [
    "Client absent", "Client a deja du stock", "Client ne veut pas commander",
    "Prix trop eleve", "Probleme de paiement", "Rupture de gamme souhaitee", "Autre",
  ]

  // Tab state
  const [commTab, setCommTab] = useState<CommTab>("nouvelle")
  const [habitudeSearch, setHabitudeSearch] = useState("")

  // Client habits: articleId -> { count, lastDate, qteTotal, dernierQte, dernierQteUM, dernierUM } — computed when client changes
  const [clientHabits, setClientHabits] = useState<Record<string, { count: number; lastDate: string; qteTotal: number; dernierQte: number; dernierQteUM?: number; dernierUM?: string }>>({})
  const [showMissedAlert, setShowMissedAlert] = useState(false)

  // Inline article selector state
  const [articleSearch, setArticleSearch] = useState("")
  // Badges de stock (dispo/rupture) masqués par défaut — sur un catalogue de
  // dizaines d'articles, ces badges répétés sur chaque ligne prenaient trop
  // de place visuelle sur mobile. Le prévendeur peut les réafficher au besoin.
  const [showStockBadges, setShowStockBadges] = useState(false)
  const [articleSort, setArticleSort] = useState<ArticleSort>("tous")

  // Global article rotation: how many times each article was ordered across ALL commandes
  const globalRotation = useMemo(() => {
    const map: Record<string, number> = {}
    store.getCommandes().forEach(cmd => {
      cmd.lignes.forEach(l => {
        if (l.articleId) map[l.articleId] = (map[l.articleId] ?? 0) + 1
      })
    })
    return map
  }, [])

  // Liste COMPLÈTE dédupliquée par id (NON filtrée par la recherche du picker).
  // Sert au sélecteur de chaque ligne (ArticleCombobox) pour qu'un article déjà
  // choisi reste toujours affichable même si la recherche du haut a changé.
  const allArticlesDedup = useMemo(() => {
    const seen = new Set<string>()
    return articles.filter(a => {
      if (!a || !a.id || seen.has(a.id)) return false
      if (a.actif === false) return false   // désactivé globalement → jamais proposé au prévendeur
      seen.add(a.id)
      return true
    })
  }, [articles])

  // Inline article list — filtered + sorted (picker du haut, checkbox)
  const pickerArticles = useMemo(() => {
    let list = [...allArticlesDedup]
    if (articleSearch.trim()) {
      const q = articleSearch.trim().toLowerCase()
      // 🛡️ Null-safety : sécurise nom/nomAr/famille contre undefined (fix crash client-side)
      list = list.filter(a => {
        const nom = (a.nom ?? "").toLowerCase()
        const nomAr = a.nomAr ?? ""
        const famille = (a.famille ?? "").toLowerCase()
        return nom.includes(q) || nomAr.includes(q) || famille.includes(q)
      })
    }
    if (articleSort === "rotation") list.sort((a, b) => (globalRotation[b.id] ?? 0) - (globalRotation[a.id] ?? 0))
    else if (articleSort === "stock") list.sort((a, b) => (Number(b.stockDisponible) || 0) - (Number(a.stockDisponible) || 0))
    else if (articleSort === "famille") list.sort((a, b) => (a.famille ?? "").localeCompare(b.famille ?? "") || (a.nom ?? "").localeCompare(b.nom ?? ""))
    else list.sort((a, b) => (a.nom ?? "").localeCompare(b.nom ?? ""))
    return list
  }, [allArticlesDedup, articleSearch, articleSort, globalRotation])

  // Articles sorted by habit frequency for current client
  const sortedArticles = useMemo(() => {
    if (!selectedClientId || Object.keys(clientHabits).length === 0) return articles
    return [...articles].sort((a, b) => {
      const fa = clientHabits[a.id]?.count ?? 0
      const fb = clientHabits[b.id]?.count ?? 0
      return fb - fa
    })
  }, [articles, clientHabits, selectedClientId])

  // Articles in habits but NOT in current cart — ordered more than inactivityDays ago
  const missedArticles = useMemo(() => {
    if (!selectedClientId || Object.keys(clientHabits).length === 0) return []
    const inCart = new Set(lignes.map(l => l.articleId))
    const inactivityDays = store.getAlertConfig?.()?.inactivityDays ?? 30
    const threshold = new Date(); threshold.setDate(threshold.getDate() - inactivityDays)
    const thresholdStr = threshold.toISOString().slice(0, 10)
    return Object.entries(clientHabits)
      .filter(([artId, h]) => !inCart.has(artId) && h.count >= 2 && h.lastDate < thresholdStr)
      .sort(([,a],[,b]) => b.count - a.count)
      .slice(0, 5)
      .map(([artId]) => articles.find(a => a.id === artId))
      .filter(Boolean) as Article[]
  }, [clientHabits, lignes, articles, selectedClientId])

  // My commandes — show last 7 days (not only today) so prevendeur can always see their history
  const [myCommandes, setMyCommandes] = useState(
    store.getCommandes().filter(c => c.commercialId === user.id)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 50)
  )
  const refreshMyCommandes = () =>
    setMyCommandes(
      store.getCommandes().filter(c => c.commercialId === user.id)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 50)
    )

  // Edit commande state — opens inline editor
  const [editCmd, setEditCmd] = useState<Commande | null>(null)
  const [editLignes, setEditLignes] = useState<LigneForm[]>([])
  const [editHeure, setEditHeure] = useState("")
  const [editSaving, setEditSaving] = useState(false)

  // Check if a commande is still within 1-hour edit window
  const canEdit = (cmd: Commande) => {
    // Use date + current time. Since we only store date (YYYY-MM-DD), we allow edits
    // all day if statut is still en_attente or en_attente_approbation
    if (cmd.statut === "livre" || cmd.statut === "en_transit" || cmd.statut === "retour" || cmd.statut === "refuse") return false
    // Check creation time via localStorage timestamp if stored, otherwise allow if today
    const ts = typeof window !== "undefined"
      ? parseInt(localStorage.getItem(`fl_cmd_ts_${cmd.id}`) ?? "0", 10)
      : 0
    if (ts > 0) return Date.now() - ts < EDIT_WINDOW_MS
    return cmd.date === store.today()  // fallback: allow if today's commande
  }

  const openEdit = (cmd: Commande) => {
    setEditCmd(cmd)
    setEditHeure(cmd.heurelivraison)
    setEditLignes(cmd.lignes.map(l => {
      const art = articles.find(a => a.id === l.articleId)
      const inUMMode = !!(l.quantiteUM && l.um && art?.um === l.um)
      return {
        articleId: l.articleId,
        quantite: inUMMode ? String(l.quantiteUM) : String(l.quantite),
        prixVente: String(l.prixVente),
        uniteMode: inUMMode ? (art?.um ?? "base") : "base",
      }
    }))
    setCommTab("mes_commandes")
  }

  const handleSaveEdit = async () => {
    if (!editCmd) return
    setEditSaving(true)
    const all = store.getCommandes()
    const idx = all.findIndex(c => c.id === editCmd.id)
    if (idx >= 0) {
      const editClient = clients.find(c => c.id === editCmd.clientId)
      const lignesData = editLignes.map(l => {
        const art = articles.find(a => a.id === l.articleId)!
        const pv = Number(l.prixVente) || store.computePrixEffectif(art, editClient)
        const inUMMode = !!(art.um && art.colisageParUM && l.uniteMode === art.um)
        const qtyUM = inUMMode ? Number(l.quantite) : undefined
        const qtyBase = inUMMode ? Number(l.quantite) * (art.colisageParUM ?? 1) : Number(l.quantite)
        return {
          articleId: l.articleId, articleNom: art.nom, articleNomAr: art.nomAr ?? "", unite: art.unite,
          um: art.um, colisageParUM: art.colisageParUM, quantiteUM: qtyUM,
          quantite: qtyBase, prixUnitaire: pv, prixVente: pv,
          prixUM: inUMMode && art.colisageParUM ? pv * art.colisageParUM : undefined,
          total: qtyBase * pv,
        }
      })
      all[idx] = { ...all[idx], lignes: lignesData, heurelivraison: editHeure }
      store.saveCommandes(all)
      // Sync la modification vers Supabase (back-office)
      const editedCmd = all[idx]
      import("@/lib/supabase/db").then(db => db.upsertCommande(editedCmd)).catch(e => console.error("[MobileCommercial] sync edit error:", e))
      refreshMyCommandes()
    }
    setEditSaving(false)
    setEditCmd(null)
  }

  useEffect(() => {
    setArticles(store.getArticles())
    setClients(store.getClients())
    if (isAdmin) setAllUsers(store.getUsers().filter(u => ["prevendeur","resp_commercial","team_leader","admin","super_admin"].includes(u.role) && u.actif))
    // Pull fresh data from Supabase in background to hydrate habits
    import("@/lib/supabase/db").then(async (db) => {
      try {
        const [cmdsFromSB, { clients: cFromSB }, arts] = await Promise.all([
          db.fetchCommandes(),
          db.fetchClients(),
          db.fetchArticles(),
        ])
        if (cmdsFromSB?.length) refreshMyCommandes()
        if (cFromSB?.length) setClients(cFromSB)
        if (arts?.length) setArticles(arts)
      } catch { /* offline — localStorage already shown */ }
    })
  }, [])

  // Auto-capture GPS on mount — GPS is MANDATORY
  useEffect(() => {
    if (!navigator.geolocation) { setGpsStatus("denied"); return }
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGpsLat(pos.coords.latitude)
        setGpsLng(pos.coords.longitude)
        setGpsStatus("granted")
      },
      () => { setGpsStatus("denied") },
      { timeout: 10000, enableHighAccuracy: true }
    )
  }, [])

  // Auto-fill heure de livraison from client's saved default when client changes
  useEffect(() => {
    if (!selectedClientId) return
    const client = clients.find(c => c.id === selectedClientId)
    if (client?.defaultHeureLivraison) {
      setHeureLivraison(client.defaultHeureLivraison)
    }
    setShowHeureEdit(false)
    setHabitudeSearch("")
  }, [selectedClientId, clients])

  // Compute article habits from past commandes for selected client
  // Depends on both selectedClientId AND articles so it re-runs once articles are loaded
  useEffect(() => {
    if (!selectedClientId) { setClientHabits({}); return }
    // Guard: if articles not yet loaded, skip (will re-run when articles arrive)
    if (articles.length === 0) return
    const allCmds = store.getCommandes()
    const pastCmds = allCmds
      .filter(c => c.clientId === selectedClientId)
      .sort((a, b) => a.date.localeCompare(b.date))   // oldest first so dernierQte = latest

    if (pastCmds.length === 0) {
      setClientHabits({})
      setShowMissedAlert(false)
      return
    }

    const habitsMap: Record<string, { count: number; lastDate: string; qteTotal: number; dernierQte: number; dernierQteUM?: number; dernierUM?: string }> = {}
    pastCmds.forEach(cmd => {
      cmd.lignes.forEach(l => {
        if (!l.articleId) return
        if (!habitsMap[l.articleId]) habitsMap[l.articleId] = { count: 0, lastDate: "", qteTotal: 0, dernierQte: 0 }
        const qte = l.quantite ?? 0
        habitsMap[l.articleId].count    += 1
        habitsMap[l.articleId].qteTotal += qte
        // Since sorted oldest→newest, the last cmd we encounter is the most recent
        if (!habitsMap[l.articleId].lastDate || cmd.date >= habitsMap[l.articleId].lastDate) {
          habitsMap[l.articleId].lastDate  = cmd.date
          habitsMap[l.articleId].dernierQte = qte
          // Also store UM info if the order used UM
          if (l.quantiteUM && l.um) {
            habitsMap[l.articleId].dernierQteUM = l.quantiteUM
            habitsMap[l.articleId].dernierUM = l.um
          } else {
            habitsMap[l.articleId].dernierQteUM = undefined
            habitsMap[l.articleId].dernierUM = undefined
          }
        }
      })
    })
    // Only keep habits for articles that still exist in the catalog
    const validMap: typeof habitsMap = {}
    Object.entries(habitsMap).forEach(([artId, h]) => {
      if (articles.some(a => a.id === artId)) validMap[artId] = h
    })
    setClientHabits(validMap)
    setShowMissedAlert(false)
  }, [selectedClientId, articles])

  const getGPS = () => {
    setGpsLoading(true)
    setGpsStatus("loading")
    if (!navigator.geolocation) { setGpsStatus("denied"); setGpsLoading(false); return }
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGpsLat(pos.coords.latitude)
        setGpsLng(pos.coords.longitude)
        setGpsStatus("granted")
        setGpsLoading(false)
      },
      () => { setGpsStatus("denied"); setGpsLoading(false) },
      { timeout: 10000, enableHighAccuracy: true }
    )
  }

  // ── Filter clients ────────────────────────────────────────────────────────
  // Règles (validées 2026-07-19) :
  //  - admin / team_leader / resp_commercial : voient TOUS les clients.
  //  - prévendeur SANS AUCUN client affecté (assignedCount === 0) : voit TOUS
  //    les clients, qu'il ait un secteur ou non (prévendeur "volant" tant que
  //    personne ne lui a explicitement affecté de client).
  //  - prévendeur AVEC au moins un client affecté :
  //      • prévendeur SANS secteur : voit TOUS les clients.
  //      • prévendeur AVEC secteur :
  //          - client affecté à un prévendeur → visible seulement par CE prévendeur ;
  //          - client SANS secteur → visible par TOUS les prévendeurs ;
  //          - sinon → visible si même secteur que le prévendeur.
  const isPrevendeur = user.role === "prevendeur"
  const assignedCount = clients.filter(c => c.prevendeurId === user.id).length
  const myClients = clients.filter(c => {
    if (!isPrevendeur) return true            // admin / responsable : tout
    if (assignedCount === 0) return true      // prévendeur sans aucun client affecté : voit tout
    if (!user.secteur) return true            // prévendeur sans secteur : voit tout
    if (c.prevendeurId) return c.prevendeurId === user.id  // client affecté : seulement le sien
    if (!c.secteur) return true               // client sans secteur : visible par tous
    return c.secteur === user.secteur         // sinon : même secteur
  })

  const filteredClients = myClients.filter(c => {
    if (filterKey === "nom") return c.nom.toLowerCase().includes(searchNom.toLowerCase())
    if (filterKey === "taille") return filterTaille === "" || c.taille === filterTaille
    if (filterKey === "rotation") return filterRotation === "" || c.rotation === filterRotation
    if (filterKey === "type") return filterType === "" || c.type === filterType
    if (filterKey === "proche") {
      if (!gpsLat || !gpsLng || !c.gpsLat || !c.gpsLng) return true
      return distKm(gpsLat, gpsLng, c.gpsLat, c.gpsLng) <= proximiteKm
    }
    return true
  }).sort((a, b) => {
    if (filterKey === "proche" && gpsLat && gpsLng && a.gpsLat && b.gpsLat) {
      return distKm(gpsLat!, gpsLng!, a.gpsLat, a.gpsLng ?? 0) - distKm(gpsLat!, gpsLng!, b.gpsLat, b.gpsLng ?? 0)
    }
    return a.nom.localeCompare(b.nom)
  })

  const selectedClient = clients.find(c => c.id === selectedClientId)

  const openGPSGuide = (c: Client) => {
    if (!c.gpsLat || !c.gpsLng) return
    const lat = c.gpsLat
    const lng = c.gpsLng
    // Use geo: URI for native apps (Android/iOS), fallback to google maps web
    const isIOS = /iphone|ipad|ipod/i.test(typeof navigator !== "undefined" ? navigator.userAgent : "")
    const url = isIOS
      ? `maps:0,0?q=${lat},${lng}`
      : `https://maps.google.com/maps?q=${lat},${lng}`
    const link = document.createElement("a")
    link.href = url
    link.target = "_blank"
    link.rel = "noopener noreferrer"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Refaire le recensement GPS d'un client déjà existant (adresse changée,
  // premier recensement imprécis, nouveau point de vente…).
  const [recensementLoadingId, setRecensementLoadingId] = useState<string | null>(null)
  const recenserClientGPS = (c: Client) => {
    if (!navigator.geolocation) { alert("Géolocalisation indisponible sur cet appareil."); return }
    setRecensementLoadingId(c.id)
    navigator.geolocation.getCurrentPosition(
      pos => {
        const updates = { gpsLat: pos.coords.latitude, gpsLng: pos.coords.longitude }
        store.updateClient(c.id, updates)
        setClients(store.getClients())
        import("@/lib/supabase/db").then(db => db.upsertClient({ ...c, ...updates })).catch(() => {})
        setRecensementLoadingId(null)
      },
      () => { alert("Impossible d'obtenir la position — vérifiez l'autorisation de localisation."); setRecensementLoadingId(null) },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    )
  }

  const handleAddClient = () => {
    if (!newClient.nom.trim()) return

    if (editingClientId) {
      // Mode édition — garde l'id, la date/auteur de création et le GPS
      // existants (le GPS se change via le bouton "Refaire le recensement"
      // dédié dans la liste, pas depuis ce formulaire).
      const existing = clients.find(c => c.id === editingClientId)
      const updates: Partial<Client> = {
        nom: newClient.nom, secteur: newClient.secteur, zone: newClient.zone,
        type: newClient.type, typeAutre: newClient.typeAutre,
        taille: newClient.taille, typeProduits: newClient.typeProduits, rotation: newClient.rotation,
        telephone: newClient.telephone, email: newClient.email, adresse: newClient.adresse,
        categorie: newClient.categorie,
        heureLivraison: newClient.heureLivraison,
        defaultHeureLivraison: newClient.heureLivraison,
      }
      store.updateClient(editingClientId, updates)
      const merged = existing ? { ...existing, ...updates } : null
      if (merged) import("@/lib/supabase/db").then(db => db.upsertClient(merged)).catch(e => console.error("[MobileCommercial] sync client error:", e))
      setClients(store.getClients())
      setEditingClientId(null)
      setShowAddClient(false)
      setShowHeureLivraison(false)
      setNewClient({ nom: "", secteur: user.secteur || "", zone: "Casablanca", type: "marchand", typeAutre: "",
        taille: "150-300kg", typeProduits: "moyenne", rotation: "journalier",
        telephone: "", email: "", adresse: "", categorie: "marchand", heureLivraison: newClient.heureLivraison })
      return
    }

    const client: Client = {
      id: store.genId(),
      nom: newClient.nom,
      secteur: newClient.secteur,
      zone: newClient.zone,
      type: newClient.type,
      typeAutre: newClient.typeAutre,
      taille: newClient.taille,
      typeProduits: newClient.typeProduits,
      rotation: newClient.rotation,
      telephone: newClient.telephone,
      email: newClient.email,
      adresse: newClient.adresse,
      gpsLat: gpsLat ?? undefined,
      gpsLng: gpsLng ?? undefined,
      createdBy: user.id,
      createdAt: store.today(),
      prevendeurId: user.id,
      categorie: newClient.categorie,
      heureLivraison: newClient.heureLivraison,
      // Alimente aussi defaultHeureLivraison — c'est CE champ que l'écran
      // "Nouvelle commande" relit pour pré-remplir l'heure automatiquement
      // (voir plus bas) ; sans ça la valeur saisie ici ne servirait à rien
      // avant la toute première commande de ce client.
      defaultHeureLivraison: newClient.heureLivraison,
    }
    store.addClient(client)
    // Sync le nouveau client vers Supabase (back-office)
    import("@/lib/supabase/db").then(db => db.upsertClient(client)).catch(e => console.error("[MobileCommercial] sync client error:", e))
    // Mémorise cette heure comme défaut pour le PROCHAIN client créé par ce prévendeur
    try { localStorage.setItem(LAST_HEURE_KEY, newClient.heureLivraison) } catch { /* noop */ }
    setClients(store.getClients())
    setSelectedClientId(client.id)
    setShowAddClient(false)
    setShowHeureLivraison(false)
    setNewClient({ nom: "", secteur: user.secteur || "", zone: "Casablanca", type: "marchand", typeAutre: "",
      taille: "150-300kg", typeProduits: "moyenne", rotation: "journalier",
      telephone: "", email: "", adresse: "", categorie: "marchand", heureLivraison: newClient.heureLivraison })
  }

  // Returns the quantity in BASE units (kg/piece/...) regardless of input mode
  const baseQty = (l: LigneForm): number => {
    const art = articles.find(a => a.id === l.articleId)
    if (!art || !l.quantite) return 0
    const raw = Number(l.quantite)
    if (art.um && art.colisageParUM && l.uniteMode === art.um) {
      return raw * art.colisageParUM   // e.g. 3 caisses × 10 kg = 30 kg
    }
    return raw   // already in base units
  }

  const updateLigne = (i: number, field: keyof LigneForm, value: string) => {
    setLignes(prev => {
      const updated = [...prev]
      if (!updated[i]) return prev
      updated[i] = { ...updated[i], [field]: value }
      if (field === "articleId") {
        const art = articles.find(a => a.id === value)
        if (art) {
          const selClient = clients.find(c => c.id === selectedClientId)
          updated[i].prixVente = store.computePrixEffectif(art, selClient).toString()
          const selArt = articles.find(a => a.id === value)
          updated[i].uniteMode = (selArt?.um) ? selArt.um : "base"
          updated[i].quantite = "1"
        }
      }
      return updated
    })
  }

  const totalGeneral = lignes.reduce((sum, l) => {
    if (!l.articleId || !l.quantite || !l.prixVente) return sum
    return sum + baseQty(l) * Number(l.prixVente)
  }, 0)

  const totalTonnage = lignes.reduce((sum, l) => {
    if (!l.articleId || !l.quantite) return sum
    return sum + baseQty(l)
  }, 0)

  const handleSubmit = async () => {
    const valid = lignes.every(l => l.articleId && Number(l.quantite) > 0)
    if (!valid || !selectedClientId || !heurelivraison) return
    setSending(true)
    const client = clients.find(c => c.id === selectedClientId)!
    const lignesData = lignes.map(l => {
      const art = articles.find(a => a.id === l.articleId)!
      const pv = Number(l.prixVente) || store.computePrixEffectif(art, client)
      const inUMMode = !!(art.um && art.colisageParUM && l.uniteMode === art.um)
      const qtyUM = inUMMode ? Number(l.quantite) : undefined
      const qtyBase = baseQty(l)   // always kg / base unit
      return {
        articleId: l.articleId,
        articleNom: art.nom,
        articleNomAr: art.nomAr ?? "",
        unite: art.unite,
        // UM fields
        um: art.um,
        colisageParUM: art.colisageParUM,
        quantiteUM: qtyUM,
        // quantite = base units (kg/piece/...)
        quantite: qtyBase,
        prixUnitaire: pv,
        prixVente: pv,
        prixUM: inUMMode && art.colisageParUM ? pv * art.colisageParUM : undefined,
        total: qtyBase * pv,
      }
    })

    // Read workflow config — determine initial statut
    // Also check if client has a team_lead (then route to en_attente_approbation regardless)
    const workflow = store.getWorkflowConfig()
    const teamLeadId = client.teamLeadId
    const teamLead = teamLeadId ? store.getUsers().find(u => u.id === teamLeadId) : null
    const statutInitial: "en_attente" | "valide" | "en_attente_approbation" =
      workflow.validationCommande === "direct" && !teamLeadId ? "valide" : "en_attente_approbation"

    // GPS capturé automatiquement en fin de process (position réelle au moment de la prise de commande)
    const fresh = await new Promise<{ lat: number; lng: number } | null>(resolve => {
      if (typeof navigator === "undefined" || !navigator.geolocation) { resolve(null); return }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 0 }
      )
    })
    if (fresh) { setGpsLat(fresh.lat); setGpsLng(fresh.lng) }

    const commande = {
      id: store.genCommande(), date: store.today(), createdAt: new Date().toISOString(),
      createdVia: "mobile" as const,
      commercialId: vendeurId, commercialNom: vendeurNom,
      clientId: client.id, clientNom: client.nom,
      secteur: client.secteur, zone: client.zone,
      gpsLat: fresh?.lat ?? gpsLat ?? client.gpsLat ?? 0,
      gpsLng: fresh?.lng ?? gpsLng ?? client.gpsLng ?? 0,
      lignes: lignesData, heurelivraison,
      statut: statutInitial,
      emailDestinataire: store.getEmailConfig().commercial,
      teamLeadId: teamLeadId,
      teamLeadNom: teamLead?.name,
    }
    store.addCommande(commande)
    // Persist heurelivraison as the default for this client (auto-filled next time)
    if (heurelivraison) {
      const allClients = store.getClients()
      const cIdx = allClients.findIndex(c => c.id === client.id)
      if (cIdx >= 0 && allClients[cIdx].defaultHeureLivraison !== heurelivraison) {
        allClients[cIdx] = { ...allClients[cIdx], defaultHeureLivraison: heurelivraison }
        store.saveClients(allClients)
      }
    }
    // Save creation timestamp for 1-hour edit window
    try { localStorage.setItem(`fl_cmd_ts_${commande.id}`, String(Date.now())) } catch { /* noop */ }
    // Record visite
    const visite: Visite = {
      id: store.genId(),
      date: store.today(),
      prevendeurId: vendeurId,
      prevendeurNom: vendeurNom,
      clientId: client.id,
      clientNom: client.nom,
      commandeId: commande.id,
      resultat: "commande",
      gpsLat: gpsLat ?? undefined,
      gpsLng: gpsLng ?? undefined,
    }
    store.addVisite(visite)
    // ⚡ Sync Supabase — INDISPENSABLE : sans ça la commande reste sur le
    // téléphone du prévendeur et n'apparaît jamais au back-office (qui lit
    // fl_commandes via /api/sync-read). Corrige aussi la perte des chiffres :
    // fetchCommandes() écrasait le localStorage par Supabase (vide) au remount
    // ou au changement de rôle prévendeur→acheteur.
    try {
      const dbmod = await import("@/lib/supabase/db")
      await dbmod.upsertCommande(commande)
      await dbmod.upsertVisite(visite)
    } catch (e) {
      console.error("[MobileCommercial] sync commande/visite error:", e)
    }
    await sendEmail({ to_email: commande.emailDestinataire, subject: `Commande - ${client.nom} - ${store.today()}`, body: buildCommandeEmail(commande) })
    setSuccess(true); setSending(false)
    setSuccessWorkflow(workflow.validationCommande)
    // Reset form for next order — do NOT clear everything, just articles
    setLignes([{ articleId: "", quantite: "", prixVente: "", uniteMode: "base" }])
    setHeureLivraison("")
    // Keep client selected so prevendeur can quickly add another order for same client
    // but clear the client after 4s so they can pick another
    refreshMyCommandes()
    setTimeout(() => {
      setSuccess(false)
      setSuccessWorkflow(null)
      setSelectedClientId("")  // now clear so they can pick next client
    }, 4000)
  }

  const handleVisiteSansCommande = () => {
    if (!visiteClientId || !visiteRaison) return
    const client = clients.find(c => c.id === visiteClientId)
    if (!client) return
    const visite: Visite = {
      id: store.genId(),
      date: store.today(),
      prevendeurId: user.id,
      prevendeurNom: user.name,
      clientId: client.id,
      clientNom: client.nom,
      resultat: "sans_commande",
      raisonSansCommande: visiteRaison,
      gpsLat: gpsLat ?? undefined,
      gpsLng: gpsLng ?? undefined,
    }
    store.addVisite(visite)
    // Sync la visite vers Supabase (suivi terrain au back-office)
    import("@/lib/supabase/db").then(db => db.upsertVisite(visite)).catch(e => console.error("[MobileCommercial] sync visite error:", e))
    setVisiteClientId("")
    setVisiteRaison("")
    setShowVisiteForm(false)
  }

  // Auto-fill panier from client's last order
  const autoFillPanier = () => {
    if (!selectedClientId) return
    const lastCmd = store.getCommandes()
      .filter(c => c.clientId === selectedClientId)
      .sort((a, b) => b.date.localeCompare(a.date))[0]
    if (!lastCmd) return
    const panierClient = clients.find(c => c.id === selectedClientId)
    const newLignes: LigneForm[] = lastCmd.lignes
      .filter(l => l.articleId)
      .map(l => {
        const art = articles.find(a => a.id === l.articleId)
        const pv = art ? store.computePrixEffectif(art, panierClient) : (l.prixVente ?? 0)
        // Restore UM mode if the last order used UM
        const wasUM = !!(l.quantiteUM && l.um && art?.um && art.um === l.um && art.colisageParUM)
        const displayQty = wasUM
          ? String(l.quantiteUM)   // show UM count (e.g. 3 Caisses)
          : String(l.quantite)     // show base units (e.g. 90 kg)
        return {
          articleId: l.articleId,
          quantite: displayQty,
          prixVente: String(pv),
          uniteMode: wasUM ? (art!.um as string) : "base",
        }
      })
    if (newLignes.length > 0) {
      setLignes(newLignes)
      setCommTab("nouvelle")
    }
  }

  const handleDeleteCommande = (id: string) => {
    store.deleteCommande(id)
    refreshMyCommandes()
  }

  // ── GPS blocking screens ──────────────────────────────────────────────────
  if (gpsStatus === "loading") {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6 p-8 text-center">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
          <svg className="w-10 h-10 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <div>
          <p className="text-lg font-bold text-foreground">Activation GPS en cours...</p>
          <p className="text-sm text-muted-foreground mt-1">جارٍ تفعيل تحديد الموقع...</p>
          <p className="text-xs text-muted-foreground mt-3">Veuillez autoriser l&apos;accès à votre position lorsque le navigateur vous le demande.</p>
        </div>
        <button onClick={getGPS} disabled={gpsLoading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "oklch(0.38 0.2 260)" }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          Réessayer
        </button>
      </div>
    )
  }

  if (gpsStatus === "denied") {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-5 p-8 text-center">
        <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center">
          <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6" />
          </svg>
        </div>
        <div>
          <p className="text-lg font-bold text-red-600">GPS requis / تحديد الموقع مطلوب</p>
          <p className="text-sm text-foreground mt-2 font-medium">L&apos;activation du GPS est indispensable pour utiliser l&apos;application prévendeur.</p>
          <p className="text-sm text-muted-foreground mt-1">يجب تفعيل تحديد الموقع لاستخدام تطبيق البائع.</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left text-xs text-amber-800 flex flex-col gap-1.5 w-full max-w-sm">
          <p className="font-bold text-sm">Comment activer le GPS :</p>
          <p>• Sur iPhone : Réglages → Confidentialité → Service de localisation → Activer</p>
          <p>• Sur Android : Paramètres → Localisation → Activer</p>
          <p>• Dans votre navigateur : cliquez sur le cadenas 🔒 dans la barre d&apos;adresse → Localisation → Autoriser</p>
        </div>
        <button onClick={getGPS} disabled={gpsLoading}
          className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-50 w-full max-w-sm justify-center"
          style={{ background: "oklch(0.38 0.2 260)" }}>
          {gpsLoading
            ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Localisation en cours...</>
            : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>Réessayer l&apos;activation GPS</>}
        </button>
      </div>
    )
  }

  return (
    <div className="p-4 flex flex-col gap-4 pb-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">
          Prise de Commande <span className="text-muted-foreground font-normal text-base">/ تسجيل الطلبية</span>
        </h2>
        <p className="text-xs text-muted-foreground">{user.name} — {store.today()}</p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted">
        <button onClick={() => { setCommTab("nouvelle"); setEditCmd(null) }}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${commTab === "nouvelle" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          Nouvelle commande
        </button>
        <button onClick={() => setCommTab("mes_commandes")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all ${commTab === "mes_commandes" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          Mes cmds
          {myCommandes.length > 0 && (
            <span className="w-4 h-4 rounded-full text-white text-[10px] font-bold flex items-center justify-center" style={{ background: "oklch(0.38 0.2 260)" }}>
              {myCommandes.length}
            </span>
          )}
        </button>
        <button onClick={() => setCommTab("habitudes")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all ${commTab === "habitudes" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          Habitudes
          {Object.keys(clientHabits).length > 0 && (
            <span className="w-4 h-4 rounded-full text-white text-[10px] font-bold flex items-center justify-center bg-amber-500">
              {Object.keys(clientHabits).length}
            </span>
          )}
        </button>
      </div>

      {commTab === "nouvelle" && (<>

      {success && (
        <div className={`rounded-xl p-4 flex items-start gap-3 border ${successWorkflow === "direct" ? "bg-green-50 border-green-300" : "bg-amber-50 border-amber-300"}`}>
          <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${successWorkflow === "direct" ? "bg-green-100" : "bg-amber-100"}`}>
            <svg className={`w-5 h-5 ${successWorkflow === "direct" ? "text-green-600" : "text-amber-600"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {successWorkflow === "direct"
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              }
            </svg>
          </div>
          <div className="flex-1">
            <p className={`text-sm font-bold ${successWorkflow === "direct" ? "text-green-700" : "text-amber-700"}`}>
              {successWorkflow === "direct" ? "Commande validee directement" : "Commande en attente d'approbation"}
            </p>
            <p className={`text-xs mt-0.5 ${successWorkflow === "direct" ? "text-green-600" : "text-amber-600"}`}>
              {successWorkflow === "direct"
                ? "La commande est automatiquement validee et sera preparee pour livraison."
                : "Votre commande a ete soumise et attend l'approbation d'un responsable. Elle ne sera traitee qu'apres validation."}
            </p>
            {successWorkflow !== "direct" && (
              <p className="text-[11px] mt-1 font-semibold text-amber-700 bg-amber-100 px-2 py-1 rounded-lg inline-block">
                Statut: EN ATTENTE APPROBATION
              </p>
            )}
          </div>
        </div>
      )}

      {/* VENDEUR SELECTOR — admin / resp_commercial only */}
      {isAdmin && (
        <div className="bg-card rounded-xl border border-border p-4 flex flex-col gap-2">
          <label className="text-sm font-bold text-foreground flex items-center gap-2">
            <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Vendeur / البائع
          </label>
          <select
            value={vendeurId}
            onChange={e => {
              const u = allUsers.find(u => u.id === e.target.value)
              setVendeurId(e.target.value)
              setVendeurNom(u?.name || user.name)
            }}
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
            {allUsers.map(u => (
              <option key={u.id} value={u.id}>{u.name} — {ROLE_LABELS[u.role] ?? u.role}</option>
            ))}
          </select>
        </div>
      )}

      {/* PREVENDEUR — Mes clients banner */}
      {isPrevendeur && (
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-indigo-50 border border-indigo-200">
          <svg className="w-4 h-4 text-indigo-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-indigo-800">
              {assignedCount} client(s) affecté(s) à vous
              {user.secteur ? ` · Secteur : ${user.secteur}` : ""}
            </p>
            <p className="text-[11px] text-indigo-600">
              {assignedCount === 0
                ? "Aucun client ne vous est encore affecté : vous voyez tous les clients."
                : "Vous ne voyez que vos clients et ceux non encore affectés dans votre secteur."}
            </p>
          </div>
        </div>
      )}

      {/* CLIENT SELECTION */}
      <div className="bg-card rounded-xl border border-border p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground">Client / الزبون</h3>
          <button onClick={() => setShowAddClient(!showAddClient)}
            className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-dashed border-primary/40 text-primary hover:bg-primary/5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Nouveau client
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {([
            { key: "nom", label: "Nom" },
            { key: "proche", label: "Le plus proche" },
            { key: "taille", label: "Taille" },
            { key: "rotation", label: "Rotation" },
            { key: "type", label: "Type" },
          ] as { key: FilterKey; label: string }[]).map(f => (
            <button key={f.key} onClick={() => { setFilterKey(f.key); setShowClientDropdown(true) }}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${filterKey === f.key ? "text-white" : "bg-muted text-muted-foreground"}`}
              style={filterKey === f.key ? { background: "oklch(0.38 0.2 260)" } : {}}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Filter inputs */}
        {filterKey === "nom" && (
          <div className="relative" ref={dropdownRef}>
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input type="text" value={searchNom} onChange={e => { setSearchNom(e.target.value); setShowClientDropdown(true) }}
              onFocus={() => setShowClientDropdown(true)}
              placeholder="Rechercher un client..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
        )}
        {filterKey === "taille" && (
          <select value={filterTaille} onChange={e => { setFilterTaille(e.target.value); setShowClientDropdown(true) }}
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
            <option value="">Toutes les tailles</option>
            {Object.entries(TAILLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        )}
        {filterKey === "rotation" && (
          <select value={filterRotation} onChange={e => { setFilterRotation(e.target.value); setShowClientDropdown(true) }}
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
            <option value="">Toutes les rotations</option>
            {Object.entries(ROTATION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        )}
        {filterKey === "type" && (
          <select value={filterType} onChange={e => { setFilterType(e.target.value); setShowClientDropdown(true) }}
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
            <option value="">Tous les types</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        )}
        {filterKey === "proche" && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {gpsLat ? `Position: ${gpsLat.toFixed(4)}, ${gpsLng?.toFixed(4)}` : "Localisation en cours..."}
              </p>
              <button onClick={() => setShowProximiteSlider(p => !p)}
                className="text-xs text-primary font-semibold hover:underline">
                Rayon: {proximiteKm} km
              </button>
            </div>
            {showProximiteSlider && (
              <div className="flex items-center gap-3 px-1">
                <span className="text-xs text-muted-foreground">1 km</span>
                <input type="range" min={1} max={50} step={1} value={proximiteKm}
                  onChange={e => setProximiteKm(Number(e.target.value))}
                  className="flex-1 accent-primary" />
                <span className="text-xs text-muted-foreground">50 km</span>
              </div>
            )}
          </div>
        )}

        {/* Dropdown list */}
        <div className="flex flex-col gap-1 max-h-52 overflow-y-auto">
          {filteredClients.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-xs text-muted-foreground">Aucun client trouvé</p>
              {isPrevendeur && myClients.length === 0 && (
                <p className="text-[11px] text-amber-600 mt-1">
                  Aucun client n&apos;existe encore dans le système.
                  Contactez votre responsable.
                </p>
              )}
            </div>
          ) : filteredClients.map(c => {
            const dist = gpsLat && c.gpsLat ? distKm(gpsLat, gpsLng!, c.gpsLat, c.gpsLng!) : null
            return (
              <button key={c.id} onClick={() => { setSelectedClientId(c.id); setShowClientDropdown(false) }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all border ${selectedClientId === c.id ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted/60"}`}>
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                  {c.nom[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-foreground truncate">{c.nom}</p>
                    {isPrevendeur && c.prevendeurId === user.id && (
                      <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">MON CLIENT</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{c.secteur} · {TYPE_LABELS[c.type]} · {TAILLE_LABELS[c.taille]}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {dist !== null && <span className="text-xs text-muted-foreground">{dist.toFixed(1)}km</span>}
                  {c.gpsLat && (
                    <div role="button" tabIndex={0}
                      onClick={e => { e.stopPropagation(); openGPSGuide(c) }}
                      onKeyDown={e => { if (e.key === "Enter") { e.stopPropagation(); openGPSGuide(c) }}}
                      className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 cursor-pointer select-none">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                    </div>
                  )}
                  <div role="button" tabIndex={0} title="Refaire le recensement GPS (position actuelle)"
                    onClick={e => { e.stopPropagation(); recenserClientGPS(c) }}
                    onKeyDown={e => { if (e.key === "Enter") { e.stopPropagation(); recenserClientGPS(c) } }}
                    className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 cursor-pointer select-none">
                    {recensementLoadingId === c.id ? (
                      <div className="w-3.5 h-3.5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    )}
                  </div>
                  <div role="button" tabIndex={0} title="Modifier les infos du client"
                    onClick={e => { e.stopPropagation(); openEditClient(c) }}
                    onKeyDown={e => { if (e.key === "Enter") { e.stopPropagation(); openEditClient(c) } }}
                    className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer select-none">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {selectedClient && (
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl" style={{ background: "oklch(0.38 0.2 260 / 0.08)", border: "1px solid oklch(0.38 0.2 260 / 0.2)" }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: "oklch(0.38 0.2 260)" }}>
              {selectedClient.nom[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground">{selectedClient.nom}</p>
              <p className="text-xs text-muted-foreground">{selectedClient.telephone} · {selectedClient.secteur}</p>
            </div>
            {selectedClient.gpsLat && (
              <button onClick={() => openGPSGuide(selectedClient)} title="Itinéraire"
                className="p-2 rounded-xl text-white flex items-center gap-1 text-xs font-semibold"
                style={{ background: "oklch(0.60 0.16 195)" }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                Guide
              </button>
            )}
            {selectedClient.telephone && (
              <a href={`https://wa.me/${selectedClient.telephone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer"
                className="p-2 rounded-xl flex items-center gap-1 text-xs font-semibold text-white"
                style={{ background: "#25D366" }}>
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347" /></svg>
                WA
              </a>
            )}
          </div>
        )}
      </div>

      {/* ADD/EDIT CLIENT FORM */}
      {showAddClient && (
        <div className="bg-card rounded-xl border border-border p-4 flex flex-col gap-3">
          <h3 className="text-sm font-bold text-foreground">
            {editingClientId ? "Modifier client / بدّل الزبون" : "Nouveau client / زبون جديد"}
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2 flex flex-col gap-1">
              <label className="text-xs font-semibold text-foreground">Nom *</label>
              <input type="text" value={newClient.nom} onChange={e => setNewClient({ ...newClient, nom: e.target.value })}
                className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Nom du client" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-foreground">Téléphone</label>
              <input type="tel" value={newClient.telephone} onChange={e => setNewClient({ ...newClient, telephone: e.target.value })}
                className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="0661234567" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-foreground">Secteur</label>
              <select value={newClient.secteur} onChange={e => {
                const secteur = e.target.value
                // Zone auto-déduite du secteur : zone la plus fréquente parmi
                // les clients existants de ce même secteur (pas de GPS payant).
                const zonesDuSecteur = store.getClients().filter(c => c.secteur === secteur && c.zone).map(c => c.zone)
                const zoneAuto = zonesDuSecteur.length
                  ? [...zonesDuSecteur].sort((a, b) => zonesDuSecteur.filter(z => z === b).length - zonesDuSecteur.filter(z => z === a).length)[0]
                  : newClient.zone
                setNewClient({ ...newClient, secteur, zone: zoneAuto })
              }}
                className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">— Choisir —</option>
                {/* Secteurs unifiés : prédéfinis + perso + déjà utilisés + pool Zones & Secteurs (BO) */}
                {getAllSecteurs([newClient.secteur, ...store.getClients().map(c => c.secteur || ""), ...(zonesCfg?.allSecteurs ?? [])]).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {/* Zone commerciale rattachée à ce secteur (gérée dans le BO —
                  Commercial & Ventes > Zones & Secteurs) */}
              {newClient.secteur && (
                zoneLabelOf(newClient.secteur)
                  ? <span className="mt-1 inline-block w-fit text-[10px] px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">🗺️ {zoneLabelOf(newClient.secteur)}</span>
                  : <span className="mt-1 inline-block text-[10px] text-amber-600">⚠️ Secteur sans zone assignée</span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-foreground">Ville</label>
              <select value={newClient.zone} onChange={e => setNewClient({ ...newClient, zone: e.target.value })}
                className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">— Choisir —</option>
                {newClient.zone && !VILLES_MAROC.includes(newClient.zone) && (
                  <option value={newClient.zone}>{newClient.zone}</option>
                )}
                {VILLES_MAROC.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-foreground">Type</label>
              <select value={newClient.type} onChange={e => setNewClient({ ...newClient, type: e.target.value as Client["type"] })}
                className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {newClient.type === "autre" && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-foreground">Type (préciser)</label>
                <input type="text" value={newClient.typeAutre} onChange={e => setNewClient({ ...newClient, typeAutre: e.target.value })}
                  className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-foreground">Catégorie tarifaire</label>
              <select
                value={newClient.categorie ?? ""}
                onChange={e => setNewClient({ ...newClient, categorie: (e.target.value as "chr"|"marchand"|"particulier") || undefined })}
                className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">Standard</option>
                <option value="chr">CHR / HORECA</option>
                <option value="marchand">Marchand</option>
                <option value="particulier">Particulier</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-foreground">Taille / capacité</label>
              <select value={newClient.taille} onChange={e => setNewClient({ ...newClient, taille: e.target.value as Client["taille"] })}
                className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                {Object.entries(TAILLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-foreground">Rotation</label>
              <select value={newClient.rotation} onChange={e => setNewClient({ ...newClient, rotation: e.target.value as Client["rotation"] })}
                className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                {Object.entries(ROTATION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-foreground">Gamme produits</label>
              <select value={newClient.typeProduits} onChange={e => setNewClient({ ...newClient, typeProduits: e.target.value as Client["typeProduits"] })}
                className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="haute_gamme">Haute gamme</option>
                <option value="moyenne">Moyenne gamme</option>
                <option value="entree_gamme">Entrée de gamme</option>
              </select>
            </div>
            <div className="col-span-2 flex flex-col gap-1">
              <label className="text-xs font-semibold text-foreground">Adresse</label>
              <input type="text" value={newClient.adresse} onChange={e => setNewClient({ ...newClient, adresse: e.target.value })}
                className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Rue, ville..." />
            </div>
            <div className="col-span-2 flex flex-col gap-1">
              <label className="text-xs font-semibold text-foreground">Email (optionnel)</label>
              <input type="email" value={newClient.email} onChange={e => setNewClient({ ...newClient, email: e.target.value })}
                className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            {/* Heure de livraison — masquée par défaut, pré-remplie avec la dernière heure utilisée */}
            <div className="col-span-2">
              {!showHeureLivraison ? (
                <button type="button" onClick={() => setShowHeureLivraison(true)}
                  className="text-xs font-semibold text-primary underline">
                  Livraison par défaut : {newClient.heureLivraison} · Modifier
                </button>
              ) : (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-foreground">Heure de livraison par défaut</label>
                  <input type="time" value={newClient.heureLivraison}
                    onChange={e => setNewClient({ ...newClient, heureLivraison: e.target.value })}
                    className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              )}
            </div>
            {/* Credit section */}
            <div className="col-span-2 border-t border-border pt-3 flex flex-col gap-2">
              <p className="text-xs font-bold text-foreground uppercase tracking-wide">Credit / الائتمان</p>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-foreground">
                  <input type="checkbox"
                    checked={!!(newClient as { creditAutorise?: boolean }).creditAutorise}
                    onChange={e => setNewClient({ ...newClient, creditAutorise: e.target.checked } as typeof newClient)}
                    className="w-4 h-4 rounded accent-primary" />
                  Credit autorise
                </label>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-foreground">Delai de recouvrement</label>
                <select
                  value={(newClient as { delaiRecouvrement?: string }).delaiRecouvrement ?? ""}
                  onChange={e => setNewClient({ ...newClient, delaiRecouvrement: e.target.value as DelaiRecouvrement } as typeof newClient)}
                  className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="">-- Non defini --</option>
                  {Object.entries(DELAI_RECOUVREMENT_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          {!editingClientId && gpsLat && <p className="text-xs text-green-600">Position GPS actuelle sera associée au client</p>}
          {editingClientId && (
            <p className="text-[11px] text-muted-foreground">
              Le GPS ne change pas ici — utilisez &quot;Refaire le recensement&quot; dans la liste des clients.
            </p>
          )}
          <div className="flex gap-2">
            <button onClick={() => { setShowAddClient(false); setEditingClientId(null) }}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted">Annuler</button>
            <button onClick={handleAddClient} disabled={!newClient.nom.trim()}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
              style={{ background: "oklch(0.38 0.2 260)" }}>{editingClientId ? "Enregistrer" : "Créer le client"}</button>
          </div>
        </div>
      )}

      {/* Heure livraison — masquée si déjà renseignée pour ce client (horaire
          habituel), un lien "Modifier" la rouvre au besoin. */}
      {(() => {
        const cl = clients.find(c => c.id === selectedClientId)
        const dejaRenseignee = !!cl?.defaultHeureLivraison
        if (dejaRenseignee && !showHeureEdit) {
          return (
            <div className="bg-card rounded-xl border border-border p-4 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-foreground">
                  Heure de livraison <span className="text-muted-foreground font-normal">/ وقت التسليم</span>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{heurelivraison} — Horaire habituel</p>
              </div>
              <button type="button" onClick={() => setShowHeureEdit(true)}
                className="text-xs font-semibold text-primary underline shrink-0">Modifier</button>
            </div>
          )
        }
        return (
          <div className="bg-card rounded-xl border border-border p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-foreground">
                Heure de livraison <span className="text-muted-foreground font-normal">/ وقت التسليم</span>
              </label>
              {dejaRenseignee && cl?.defaultHeureLivraison === heurelivraison && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300">
                  Horaire habituel
                </span>
              )}
            </div>
            <input type="time" value={heurelivraison} onChange={e => setHeureLivraison(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            <p className="text-[11px] text-muted-foreground">
              L&apos;horaire sera enregistre comme defaut pour ce client apres confirmation de la commande.
            </p>
          </div>
        )
      })()}

      {/* GPS capture — coordinates hidden, only status indicator shown */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-card">
        <button onClick={getGPS} disabled={gpsLoading}
          className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${gpsLat ? "text-green-700" : "text-muted-foreground"}`}>
          {gpsLoading
            ? <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            : <svg className={`w-3.5 h-3.5 ${gpsLat ? "text-green-600" : "text-muted-foreground"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>}
          {gpsLat ? "GPS capturé" : "GPS non capturé"}
        </button>
        {/* Coordinates intentionally hidden from prevendeur screen */}
      </div>

      {/* INLINE ARTICLE SELECTOR ─────────────────────────────────────────── */}
      <div className="bg-card rounded-xl border border-border flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <p className="text-sm font-bold text-foreground">Articles / المنتجات</p>
            <p className="text-xs text-muted-foreground">{pickerArticles.length} articles</p>
          </div>
          {selectedClientId && Object.keys(clientHabits).length > 0 && (
            <button onClick={autoFillPanier}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-amber-300 text-amber-700 bg-amber-50">
              Auto-panier
            </button>
          )}
        </div>

        {/* Search field */}
        <div className="px-3 py-2.5 border-b border-border">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-background">
            <svg className="w-4 h-4 text-muted-foreground shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" value={articleSearch} onChange={e => setArticleSearch(e.target.value)}
              placeholder="Rechercher par nom..."
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none" />
            {articleSearch && (
              <button onClick={() => setArticleSearch("")} className="text-muted-foreground hover:text-foreground">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
          <button onClick={() => setShowStockBadges(v => !v)}
            className={`mt-2 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${showStockBadges ? "bg-primary/10 border-primary text-primary" : "border-border text-muted-foreground"}`}>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showStockBadges ? "M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" : "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"} /></svg>
            {showStockBadges ? "Masquer le stock" : "Afficher le stock"}
          </button>
        </div>

        {/* Sort toggles */}
        <div className="flex gap-2 px-3 py-2 border-b border-border">
          {([
            { key: "stock",    label: "Trier par stock" },
            { key: "rotation", label: "Best sellers" },
            { key: "tous",     label: "Alphabetique" },
            { key: "famille",  label: "Par famille" },
          ] as { key: ArticleSort; label: string }[]).map(s => (
            <button key={s.key} onClick={() => setArticleSort(s.key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${articleSort === s.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {s.label}
            </button>
          ))}
        </div>

        {/* Checkbox list */}
        <div className="max-h-72 overflow-y-auto divide-y divide-border">
          {pickerArticles.length === 0 ? (
            <div className="py-8 flex flex-col items-center gap-2 text-center">
              <p className="text-sm text-muted-foreground">Aucun article trouve</p>
              <button onClick={() => setArticleSearch("")} className="text-xs text-primary underline">Effacer</button>
            </div>
          ) : pickerArticles.map(a => {
            const inCart = lignes.some(l => l.articleId === a.id)
            const pv = store.computePrixEffectif(a, clients.find(c => c.id === selectedClientId))
            const globalCount = globalRotation[a.id] ?? 0
            const habitCount = clientHabits[a.id]?.count ?? 0
            return (
              <label key={a.id}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${inCart ? "bg-primary/5" : "hover:bg-muted/50"}`}>
                <input type="checkbox" checked={inCart} readOnly={false}
                  onChange={e => {
                    const checked = e.target.checked
                    // Mise à jour fonctionnelle UNIQUE : évite la perte d'articles quand on coche
                    // plusieurs articles rapidement (le closure `lignes` serait périmé entre 2 clics).
                    setLignes(prev => {
                      if (checked) {
                        if (prev.some(l => l.articleId === a.id)) return prev   // déjà présent
                        const emptyIdx = prev.findIndex(l => !l.articleId)
                        if (emptyIdx >= 0) {
                          const updated = [...prev]
                          updated[emptyIdx] = { ...updated[emptyIdx], articleId: a.id, prixVente: String(pv), uniteMode: a.um ?? "base", quantite: "1" }
                          return updated
                        }
                        return [...prev, { articleId: a.id, quantite: "1", prixVente: String(pv), uniteMode: a.um ?? "base" }]
                      }
                      // décocher : retirer la ligne ; garder au moins une ligne vide
                      const next = prev.filter(l => l.articleId !== a.id)
                      return next.length === 0 ? [{ articleId: "", quantite: "", prixVente: "", uniteMode: "base" }] : next
                    })
                  }}
                  className="w-4 h-4 rounded accent-primary shrink-0" />
                <img src={resolveArticlePhoto(a)}
                  alt={`${a.nom} produit frais article`}
                  className="w-10 h-10 rounded-xl object-cover border border-border shrink-0"
                  onError={e => { e.currentTarget.src = "https://placehold.co/40x40/e2e8f0/64748b?text=Art" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{a.nom}</p>
                  {a.nomAr && <p className="text-xs text-muted-foreground font-arabic" dir="rtl" lang="ar">{a.nomAr}</p>}
                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                    {showStockBadges && (() => {
                      const vs = store.getVirtualStock(a.id)
                      const ok = vs.available > 0
                      return (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-lg ${ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                          {ok ? `${vs.available} ${a.unite} dispo` : "Rupture"}
                          {vs.pending > 0 && ok && <span className="ml-1 font-normal text-slate-600">(-{vs.pending} en cmd)</span>}
                        </span>
                      )
                    })()}
                    {globalCount > 0 && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-lg bg-blue-100 text-blue-700">{globalCount} cmd</span>}
                    {habitCount >= 2 && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-lg bg-amber-100 text-amber-700">{habitCount}x client</span>}
                  </div>
                </div>
                <span className="text-sm font-bold text-primary shrink-0">{pv} DH</span>
              </label>
            )
          })}
        </div>
      </div>

      {/* ARTICLES lines ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">

        {lignes.map((ligne, i) => {
          const art = articles.find(a => a.id === ligne.articleId)
          const pvCalc = art ? store.computePrixEffectif(art, clients.find(c => c.id === selectedClientId)) : 0
          return (
            <div key={i} className="bg-card rounded-xl border border-border p-3 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Article #{i + 1}</span>
                {lignes.length > 1 && (
                  <button onClick={() => setLignes(prev => prev.filter((_, j) => j !== i))} className="text-destructive p-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                )}
              </div>

              {/* Article selector — liste COMPLÈTE (pas la recherche du picker) pour
                  que l'article coché reste toujours affiché dans la ligne */}
              <ArticleCombobox
                articles={allArticlesDedup}
                value={ligne.articleId}
                onChange={(artId, artObj) => {
                  if (!artObj) { updateLigne(i, "articleId", ""); return }
                  updateLigne(i, "articleId", artId)
                }}
              />

              {art && (() => {
                const vStock = store.getVirtualStock(art.id)
                const isPrev = user.role === "prevendeur"
                const canEditPrice = !isPrev && (user.role === "admin" || user.role === "super_admin" || user.role === "super_super_admin" || user.role === "resp_commercial")
                return (
                  <div className="flex flex-col gap-1.5 px-1">
                    <div className="flex items-center gap-2 text-xs flex-wrap">
                      {/* PA hidden for prevendeur role */}
                      {!isPrev && (
                        <>
                          <span className="text-slate-500">PA: <strong className="text-slate-900">{art.prixAchat} DH/{art.unite}</strong></span>
                          <span className="text-slate-300">·</span>
                        </>
                      )}
                      <span className="text-slate-500">PV: <strong className="text-green-700">{pvCalc} DH/{art.unite}</strong></span>
                      {art.um && art.colisageParUM && (
                        <>
                          <span className="text-slate-300">·</span>
                          <span className="text-blue-700 font-semibold">{art.um} = {art.colisageParUM} {art.unite}</span>
                        </>
                      )}
                    </div>
                    {/* ATP — Available-to-Promise stock indicator (high contrast) */}
                    <div className={`rounded-xl border-2 px-3 py-2 flex flex-col gap-1 ${
                      vStock.available > 0
                        ? "bg-emerald-50 border-emerald-400"
                        : vStock.physical > 0
                          ? "bg-amber-50 border-amber-400"
                          : "bg-red-50 border-red-500"
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <svg className={`w-3.5 h-3.5 shrink-0 ${vStock.available > 0 ? "text-emerald-700" : "text-red-700"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={vStock.available > 0 ? "M5 13l4 4L19 7" : "M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"} />
                          </svg>
                          <span className="text-xs font-black text-slate-900 uppercase tracking-wide">
                            ATP — Disponible a la vente
                          </span>
                        </div>
                        <span className={`text-sm font-black ${vStock.available > 0 ? "text-emerald-800" : "text-red-800"}`}>
                          {vStock.available} {art.unite}
                        </span>
                      </div>
                      {vStock.pending > 0 && (
                        <div className="flex items-center justify-between text-[11px] font-medium text-slate-900 border-t border-slate-200/60 pt-1 mt-0.5">
                          <span>Stock physique: <strong className="text-slate-900">{vStock.physical} {art.unite}</strong></span>
                          <span className="text-amber-800 font-bold">- {vStock.pending} en cmds en attente</span>
                        </div>
                      )}
                      {vStock.available === 0 && vStock.physical === 0 && (
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-red-900 bg-red-100 rounded-lg px-2 py-1 mt-0.5">
                          <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                          </svg>
                          Demande d&apos;Achat (DA) sera declenchee automatiquement
                        </div>
                      )}
                      {vStock.available === 0 && vStock.physical > 0 && (
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-900 bg-amber-100 rounded-lg px-2 py-1 mt-0.5">
                          <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Stock virtuel epuise — tout le physique est en commandes en attente
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}

              {/* UM / Unite mode selector — simple 2-button toggle */}
              {art && art.um && art.colisageParUM && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-foreground">
                      Saisir par / وحدة الطلب
                    </label>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200">
                      1 {art.um} = {art.colisageParUM} {art.unite}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {/* Base unit button — single atomic update to avoid stale-closure */}
                    <button type="button"
                      onClick={() => {
                        setLignes(prev => {
                          const updated = [...prev]
                          const cur = Number(updated[i].quantite) || 0
                          const isUM = updated[i].uniteMode === art.um
                          const newQty = isUM && cur > 0 ? String(cur * art.colisageParUM!) : updated[i].quantite
                          updated[i] = { ...updated[i], uniteMode: "base", quantite: newQty }
                          return updated
                        })
                      }}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-bold border-2 transition-all ${ligne.uniteMode !== art.um ? "border-green-500 text-white" : "border-border bg-background text-foreground"}`}
                      style={ligne.uniteMode !== art.um ? { background: "oklch(0.45 0.18 145)" } : {}}>
                      <span className="text-sm font-black">{art.unite}</span>
                      <span className="block text-[10px] font-normal opacity-80 mt-0.5">unite de base</span>
                    </button>
                    {/* UM button — single atomic update */}
                    <button type="button"
                      onClick={() => {
                        setLignes(prev => {
                          const updated = [...prev]
                          const cur = Number(updated[i].quantite) || 0
                          const isBase = updated[i].uniteMode !== art.um
                          const newQty = isBase && cur > 0 && art.colisageParUM
                            ? String(Math.round((cur / art.colisageParUM!) * 100) / 100)
                            : updated[i].quantite
                          updated[i] = { ...updated[i], uniteMode: art.um!, quantite: newQty }
                          return updated
                        })
                      }}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-bold border-2 transition-all ${ligne.uniteMode === art.um ? "border-blue-500 text-white" : "border-border bg-background text-blue-700"}`}
                      style={ligne.uniteMode === art.um ? { background: "oklch(0.45 0.18 240)" } : {}}>
                      <span className="text-sm font-black">{art.um}</span>
                      <span className="block text-[10px] font-normal opacity-80 mt-0.5">= {art.colisageParUM} {art.unite}</span>
                    </button>
                  </div>
                  {/* Live bidirectional conversion display */}
                  {ligne.quantite && Number(ligne.quantite) > 0 && (() => {
                    const qty = Number(ligne.quantite)
                    const isUM = ligne.uniteMode === art.um
                    if (isUM) {
                      // UM mode → show base total
                      const baseTotal = qty * art.colisageParUM!
                      return (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-50 border border-blue-300">
                          <svg className="w-4 h-4 text-blue-700 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                          </svg>
                          <span className="text-sm font-black text-blue-900">
                            {qty} {art.um} &rarr; <strong>{baseTotal % 1 === 0 ? baseTotal : baseTotal.toFixed(1)} {art.unite}</strong>
                          </span>
                        </div>
                      )
                    } else {
                      // Base mode → show UM equivalent
                      const umEquiv = qty / art.colisageParUM!
                      const umWhole = Math.floor(umEquiv)
                      const remainder = qty - umWhole * art.colisageParUM!
                      return (
                        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${remainder === 0 ? "bg-green-50 border-green-300" : "bg-amber-50 border-amber-300"}`}>
                          <svg className="w-4 h-4 shrink-0" style={{ color: remainder === 0 ? "#166534" : "#92400e" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                          </svg>
                          <span className={`text-sm font-black ${remainder === 0 ? "text-green-900" : "text-amber-900"}`}>
                            {qty} {art.unite} &rarr;&nbsp;
                            {remainder === 0
                              ? <strong>{umWhole} {art.um}</strong>
                              : <><strong>{umWhole} {art.um}</strong> + {remainder} {art.unite} hors UM</>
                            }
                          </span>
                        </div>
                      )
                    }
                  })()}
                </div>
              )}

              {(() => {
                const isPrev = user.role === "prevendeur"
                const canEditPx = !isPrev && (user.role === "admin" || user.role === "super_admin" || user.role === "super_super_admin" || user.role === "resp_commercial" || user.role === "team_leader")
                return (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-slate-800">
                        Qte ({ligne.uniteMode === art?.um ? art?.um : art?.unite || "unite"}) / الكمية
                      </label>
                      <input type="number" min="0" step={ligne.uniteMode === art?.um ? "1" : "0.5"}
                        value={ligne.quantite} onChange={e => updateLigne(i, "quantite", e.target.value)}
                        className="px-3 py-2 rounded-xl border border-border bg-background text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary" placeholder="0" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <label className="text-xs font-bold text-slate-800">
                          PV DH/{art?.unite || "unite"} / السعر
                        </label>
                        {isPrev && (
                          <span className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-800 text-white border border-slate-700">
                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            PRIX FIXE
                          </span>
                        )}
                      </div>
                      {canEditPx ? (
                        <input type="number" min="0" step="0.01" value={ligne.prixVente}
                          onChange={e => updateLigne(i, "prixVente", e.target.value)}
                          className="px-3 py-2 rounded-xl border border-border bg-background text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary" placeholder="0.00" />
                      ) : (
                        <div className="px-3 py-2 rounded-xl border-2 border-slate-300 bg-slate-100 text-sm font-black text-slate-900 select-none cursor-not-allowed flex items-center justify-between gap-2">
                          <span>{ligne.prixVente || art ? (Number(ligne.prixVente) || (art ? store.computePrixEffectif(art, clients.find(c => c.id === selectedClientId)) : 0)).toFixed(2) : "—"} DH</span>
                          <div className="flex items-center gap-1 shrink-0">
                            <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            <span className="text-[10px] font-black text-slate-700 uppercase tracking-wide">Verrou</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}

              {art && ligne.quantite && Number(ligne.quantite) > 0 && (() => {
                const bq = baseQty(ligne)
                const vStock = store.getVirtualStock(art.id)
                const ok = bq <= vStock.available
                const needPR = !ok && bq > vStock.physical
                return (
                  <div className={`flex items-start justify-between text-xs rounded-xl px-3 py-2 gap-2 ${
                    ok ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"
                  }`}>
                    <div className="flex flex-col gap-0.5">
                      <span className={`font-bold ${ok ? "text-emerald-800" : "text-red-700"}`}>
                        {ok ? "Stock disponible" : needPR ? "DA auto-declenchee" : "Stock virtuel insuffisant"}
                        {" "}&mdash; {bq.toFixed(1)} {art.unite} demandes
                      </span>
                      {!ok && (
                        <span className="text-red-600 font-normal">
                          {needPR
                            ? `Stock physique insuffisant (${vStock.physical} ${art.unite}) — une DA sera creee automatiquement`
                            : `${vStock.pending} ${art.unite} deja en commande en attente (stock virtuel = ${vStock.available} ${art.unite})`
                          }
                        </span>
                      )}
                    </div>
                    <span className="font-bold text-slate-900 shrink-0">
                      {(bq * Number(ligne.prixVente || pvCalc)).toLocaleString("fr-MA", { minimumFractionDigits: 2 })} DH
                    </span>
                  </div>
                )
              })()}
            </div>
          )
        })}
      </div>

      {/* Totals */}
      <div className="bg-card rounded-xl border border-border p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Tonnage total / إجمالي الوزن</span>
          <span className="font-bold text-foreground">{totalTonnage.toLocaleString("fr-MA")} kg</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="font-bold text-foreground">
            Total Commande / مجموع الطلبية
          </span>
          <span className="text-xl font-extrabold text-green-600">
            {totalGeneral.toLocaleString("fr-MA", { minimumFractionDigits: 2 })} DH
          </span>
        </div>
      </div>

      {/* Articles not ordered recently — shown before confirm */}
      {selectedClientId && missedArticles.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl overflow-hidden">
          <button onClick={() => setShowMissedAlert(s => !s)}
            className="w-full flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-bold text-amber-800">
                {missedArticles.length} article(s) non commandes depuis longtemps
              </p>
            </div>
            <svg className={`w-4 h-4 text-amber-600 transition-transform ${showMissedAlert ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showMissedAlert && (
            <div className="px-4 pb-4 flex flex-col gap-2">
              <p className="text-xs text-amber-700">Ces articles ont ete commandes par ce client mais pas recemment. Voulez-vous les ajouter ?</p>
              {missedArticles.map(art => (
                <div key={art.id} className="flex items-center justify-between bg-white rounded-xl border border-amber-200 px-3 py-2.5">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{art.nom}</p>
                    {art.nomAr && <p className="text-xs text-muted-foreground font-arabic" dir="rtl" lang="ar">{art.nomAr}</p>}
                    <p className="text-xs text-muted-foreground">
                      Derniere commande : {clientHabits[art.id]?.lastDate ?? "—"}
                      {" "}· {clientHabits[art.id]?.count}x commande(s)
                    </p>
                  </div>
                  <button onClick={() => {
                    const pv = store.computePrixEffectif(art, clients.find(c => c.id === selectedClientId))
                    const hab = clientHabits[art.id]
                    const hasUM = !!(hab?.dernierQteUM && hab?.dernierUM && art.um && hab.dernierUM === art.um)
                    const dq = hab?.dernierQte ?? 0
                    const prefillQty = hasUM ? String(hab!.dernierQteUM) : dq > 0 ? String(dq) : ""
                    const prefillMode = hasUM ? art.um! : "base"
                    setLignes(prev => [...prev, { articleId: art.id, quantite: prefillQty, prixVente: String(pv), uniteMode: prefillMode }])
                  }}
                    className="ml-3 px-3 py-1.5 rounded-xl text-xs font-bold text-white shrink-0"
                    style={{ background: "oklch(0.65 0.17 145)" }}>
                    + Ajouter
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Submit */}
      <button onClick={handleSubmit}
        disabled={sending || !selectedClientId || !heurelivraison || lignes.some(l => !l.articleId || !l.quantite)}
        className="w-full py-4 rounded-xl font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
        style={{ background: "oklch(0.65 0.17 145)" }}>
        {sending
          ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Envoi...</>
          : <><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>Enregistrer la commande / تسجيل الطلبية</>}
      </button>

      {/* ── VISITE SANS COMMANDE ───────────────────────────────────── */}
      <div className="bg-card rounded-xl border border-border p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-foreground">Visite sans commande / زيارة بدون طلب</h3>
            <p className="text-xs text-muted-foreground">Enregistrer une visite client non convertie</p>
          </div>
          <button onClick={() => setShowVisiteForm(v => !v)}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-dashed border-amber-400 text-amber-700 hover:bg-amber-50">
            {showVisiteForm ? "Annuler" : "+ Visite"}
          </button>
        </div>
        {showVisiteForm && (
          <div className="flex flex-col gap-3">
            <select value={visiteClientId} onChange={e => setVisiteClientId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">Choisir un client</option>
              {filteredClients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-foreground">Raison / السبب *</label>
              <div className="flex flex-wrap gap-2">
                {RAISONS_SANS_COMMANDE.map(r => (
                  <button key={r} type="button" onClick={() => setVisiteRaison(r)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${visiteRaison === r ? "bg-amber-500 text-white border-amber-500" : "border-border text-muted-foreground hover:bg-muted"}`}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={handleVisiteSansCommande}
              disabled={!visiteClientId || !visiteRaison}
              className="w-full py-2.5 rounded-xl text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50 transition-colors">
              Enregistrer la visite
            </button>
          </div>
        )}
      </div>

      {/* END nouvelle commande tab */}
      </>)}

      {/* ── HABITUDES TAB ─────────────────────────────────────────────────── */}
      {(commTab as string) === "habitudes" && (
        <div className="flex flex-col gap-3">
          {/* Header */}
          <div className="bg-card rounded-xl border border-border p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-foreground">Habitudes d&apos;achat / عادات الشراء</h3>
                <p className="text-xs text-muted-foreground">
                  {selectedClientId
                    ? `${Object.keys(clientHabits).length} article(s) commandes regulierement`
                    : "Selectionnez un client pour voir ses habitudes"}
                </p>
              </div>
              {selectedClientId && Object.keys(clientHabits).length > 0 && (
                <button
                  onClick={() => { autoFillPanier(); setCommTab("nouvelle") }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Auto-panier
                </button>
              )}
            </div>

            {/* Search */}
            {selectedClientId && Object.keys(clientHabits).length > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-background">
                <svg className="w-4 h-4 text-muted-foreground shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={habitudeSearch}
                  onChange={e => setHabitudeSearch(e.target.value)}
                  placeholder="Filtrer les articles..."
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
                {habitudeSearch && (
                  <button onClick={() => setHabitudeSearch("")} className="text-muted-foreground hover:text-foreground">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Habits list */}
          {!selectedClientId ? (
            <div className="bg-card rounded-xl border border-border p-10 text-center">
              <svg className="w-10 h-10 mx-auto text-muted-foreground mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <p className="text-sm font-semibold text-muted-foreground">Selectionnez un client</p>
              <p className="text-xs text-muted-foreground mt-1">Les habitudes d&apos;achat s&apos;affichent apres avoir choisi un client</p>
            </div>
          ) : Object.keys(clientHabits).length === 0 ? (
            <div className="bg-card rounded-xl border border-border p-10 text-center">
              <svg className="w-10 h-10 mx-auto text-muted-foreground mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-sm font-semibold text-muted-foreground">Aucune habitude enregistree</p>
              <p className="text-xs text-muted-foreground mt-1">Ce client n&apos;a pas encore de commandes repetees</p>
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="divide-y divide-border">
                {Object.entries(clientHabits)
                  .filter(([artId]) => {
                    const art = articles.find(a => a.id === artId)
                    if (!art) return false
                    if (!habitudeSearch.trim()) return true
                    const q = habitudeSearch.trim().toLowerCase()
                    return (art.nom ?? "").toLowerCase().includes(q) || (art.nomAr ?? "").includes(q)
                  })
                  .sort(([, a], [, b]) => b.count - a.count)
                  .map(([artId, hab]) => {
                    const art = articles.find(a => a.id === artId)
                    if (!art) return null
                    const pv = store.computePrixEffectif(art, clients.find(c => c.id === selectedClientId))
                    const inCart = lignes.some(l => l.articleId === artId)
                    const stockOk = art.stockDisponible > 0
                    return (
                      <div key={artId} className="flex items-center gap-3 px-4 py-3">
                        <img
                          src={resolveArticlePhoto(art)}
                          alt={`${art.nom} habitude`}
                          className="w-10 h-10 rounded-xl object-cover border border-border shrink-0"
                          onError={e => { e.currentTarget.src = "https://placehold.co/40x40/e2e8f0/64748b?text=Art" }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-foreground truncate">{art.nom}</p>
                          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-lg bg-amber-100 text-amber-700">
                              {hab.count}x commande(s)
                            </span>
                            {showStockBadges && (
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-lg ${stockOk ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                                {stockOk ? `${art.stockDisponible} ${art.unite} dispo` : "Rupture"}
                              </span>
                            )}
                            <span className="text-[10px] text-muted-foreground">
                              Derniere: {hab.lastDate}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-sm font-bold text-primary">{pv} DH</span>
                          <button
                            onClick={() => {
                              const hasUM = !!(hab.dernierQteUM && hab.dernierUM && art.um && hab.dernierUM === art.um)
                              const dq = hab.dernierQte ?? 0
                              const prefillQty = hasUM ? String(hab.dernierQteUM) : dq > 0 ? String(dq) : ""
                              const prefillMode = hasUM ? art.um! : "base"
                              if (inCart) {
                                const idx = lignes.findIndex(l => l.articleId === artId)
                                if (idx >= 0) setLignes(prev => prev.filter((_, j) => j !== idx))
                              } else {
                                setLignes(prev => [...prev, { articleId: artId, quantite: prefillQty, prixVente: String(pv), uniteMode: prefillMode }])
                                setCommTab("nouvelle")
                              }
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${inCart ? "bg-red-50 text-red-600 border border-red-200" : "text-white"}`}
                            style={inCart ? {} : { background: "oklch(0.65 0.17 145)" }}>
                            {inCart ? "Retirer" : "Commander"}
                          </button>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── MES COMMANDES TAB ─────────────────────────────────────── */}
      {commTab === "mes_commandes" && (
        <div className="flex flex-col gap-3">
          {myCommandes.length === 0 ? (
            <div className="bg-card rounded-xl border border-border p-10 text-center">
              <svg className="w-10 h-10 mx-auto text-muted-foreground mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-sm font-semibold text-muted-foreground">Aucune commande aujourd&apos;hui</p>
              <button onClick={() => setCommTab("nouvelle")} className="mt-3 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: "oklch(0.38 0.2 260)" }}>
                Passer une commande
              </button>
            </div>
          ) : (
            <>
              {/* Edit form */}
              {editCmd && (
                <div className="bg-card rounded-2xl border border-primary/30 p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-foreground">Modifier — {editCmd.clientNom}</p>
                      <p className="text-xs text-muted-foreground">Modification possible dans le delai d&apos;1 heure apres creation</p>
                    </div>
                    <button onClick={() => setEditCmd(null)} className="p-1.5 rounded-lg bg-muted text-muted-foreground">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>

                  {/* Edit heure livraison */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-foreground">Heure de livraison</label>
                    <input type="time" value={editHeure} onChange={e => setEditHeure(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>

                  {/* Edit article lignes */}
                  {editLignes.map((ligne, i) => {
                    const art = articles.find(a => a.id === ligne.articleId)
                    return (
                      <div key={i} className="bg-muted/30 rounded-xl p-3 flex flex-col gap-2">
                        <p className="text-xs font-semibold text-foreground">{art?.nom ?? "Article"}</p>
                        {art?.um && art.colisageParUM && (
                          <div className="flex gap-2">
                            <button type="button" onClick={() => { const u = [...editLignes]; u[i] = { ...u[i], uniteMode: "base", quantite: "" }; setEditLignes(u) }}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${ligne.uniteMode !== art.um ? "border-primary text-white" : "border-border text-muted-foreground"}`}
                              style={ligne.uniteMode !== art.um ? { background: "oklch(0.45 0.18 145)" } : {}}>
                              {art.unite}
                            </button>
                            <button type="button" onClick={() => { const u = [...editLignes]; u[i] = { ...u[i], uniteMode: art.um!, quantite: "" }; setEditLignes(u) }}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${ligne.uniteMode === art.um ? "border-blue-500 text-white" : "border-border text-blue-600"}`}
                              style={ligne.uniteMode === art.um ? { background: "oklch(0.45 0.18 240)" } : {}}>
                              {art.um} = {art.colisageParUM}{art.unite}
                            </button>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex flex-col gap-1">
                            <label className="text-xs text-muted-foreground">Qte ({ligne.uniteMode === art?.um ? art?.um : art?.unite})</label>
                            <input type="number" min="0" value={ligne.quantite}
                              onChange={e => { const u = [...editLignes]; u[i] = { ...u[i], quantite: e.target.value }; setEditLignes(u) }}
                              className="px-3 py-2 rounded-lg border border-border bg-background text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary" />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-xs text-muted-foreground">PV DH/{art?.unite}</label>
                            <input type="number" min="0" step="0.01" value={ligne.prixVente}
                              onChange={e => { const u = [...editLignes]; u[i] = { ...u[i], prixVente: e.target.value }; setEditLignes(u) }}
                              className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                          </div>
                        </div>
                        {art?.um && art.colisageParUM && ligne.uniteMode === art.um && ligne.quantite && Number(ligne.quantite) > 0 && (
                          <p className="text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg">
                            {ligne.quantite} {art.um} = {(Number(ligne.quantite) * art.colisageParUM).toFixed(1)} {art.unite}
                          </p>
                        )}
                      </div>
                    )
                  })}

                  <div className="flex gap-2">
                    <button onClick={() => setEditCmd(null)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted">Annuler</button>
                    <button onClick={handleSaveEdit} disabled={editSaving}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-60"
                      style={{ background: "oklch(0.38 0.2 260)" }}>
                      {editSaving ? "Sauvegarde..." : "Enregistrer modifications"}
                    </button>
                  </div>
                </div>
              )}

              {/* Commandes list — grouped by date */}
              {(() => {
                // Group commandes by date for visual clarity
                const grouped: Record<string, typeof myCommandes> = {}
                myCommandes.forEach(cmd => {
                  if (!grouped[cmd.date]) grouped[cmd.date] = []
                  grouped[cmd.date].push(cmd)
                })
                return Object.entries(grouped)
                  .sort(([a], [b]) => b.localeCompare(a))
                  .map(([date, cmds]) => (
                    <div key={date} className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${date === store.today() ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                          {date === store.today() ? "Aujourd\'hui" : date}
                        </span>
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-[11px] text-muted-foreground">{cmds.length} cmd(s)</span>
                      </div>
                      {cmds.map(cmd => {
                const lignesCmd = cmd.lignes ?? []
                const total = lignesCmd.reduce((s, l) => s + (Number(l.total) || 0), 0)
                const tonn  = lignesCmd.reduce((s, l) => s + (Number(l.quantite) || 0), 0)
                const editable = canEdit(cmd)
                const isActive = editCmd?.id === cmd.id
                const card = (
                  <div className={`rounded-xl border p-4 flex flex-col gap-2.5 ${isActive ? "border-primary/50 bg-primary/3" : "border-border bg-card"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-foreground">{cmd.clientNom}</p>
                        <p className="text-xs text-muted-foreground">{cmd.secteur} · {cmd.heurelivraison}</p>
                        <p className="text-xs text-muted-foreground font-mono">{cmd.id}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                        cmd.statut === "valide" ? "bg-blue-100 text-blue-700" :
                        cmd.statut === "livre" ? "bg-green-100 text-green-700" :
                        cmd.statut === "en_attente_approbation" ? "bg-orange-100 text-orange-700" :
                        "bg-yellow-100 text-yellow-700"}`}>
                        {cmd.statut}
                      </span>
                    </div>

                    {/* Article lines summary */}
                    <div className="flex flex-col gap-1">
                      {lignesCmd.map((l, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-foreground">{l.articleNom}{(l as unknown as { articleNomAr?: string }).articleNomAr ? <span className="block text-[10px] text-muted-foreground font-arabic" dir="rtl" lang="ar">{(l as unknown as { articleNomAr?: string }).articleNomAr}</span> : null}</span>
                          <span className="font-semibold text-muted-foreground">
                            {l.quantiteUM ? `${l.quantiteUM} ${l.um} = ` : ""}{l.quantite} {l.unite} · {(Number(l.total) || 0).toLocaleString("fr-MA")} DH
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-border">
                      <span className="text-xs text-amber-600 font-semibold">{tonn.toLocaleString("fr-MA")} kg</span>
                      <span className="text-sm font-extrabold text-primary">{total.toLocaleString("fr-MA")} DH</span>
                    </div>

                    <div className="flex gap-2">
                      {editable && !isActive && (
                        <button onClick={() => openEdit(cmd)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold border border-primary/30 text-primary hover:bg-primary/5 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          Modifier (1h)
                        </button>
                      )}
                      {editable && (
                        <button onClick={() => handleDeleteCommande(cmd.id)}
                          className="flex items-center justify-center gap-1 py-2 px-3 rounded-xl text-xs font-bold bg-red-50 text-red-600 hover:bg-red-100 transition-colors border border-red-200">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          Supprimer
                        </button>
                      )}
                      {!editable && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground px-2">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                          Verrouillee
                        </div>
                      )}
                    </div>
                  </div>
                )
                return editable ? (
                  <SwipeToDelete key={cmd.id} onDelete={() => handleDeleteCommande(cmd.id)} label="Retirer" confirmLabel="Confirmer">
                    {card}
                  </SwipeToDelete>
                ) : <div key={cmd.id}>{card}</div>
              })}
                    </div>
                  ))
              })()}
            </>
          )}
        </div>
      )}
    </div>
  )
}
