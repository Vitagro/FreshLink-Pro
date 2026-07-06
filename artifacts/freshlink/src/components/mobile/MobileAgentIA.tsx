"use client"

import { callLLM, triggerN3Alert as n3Alert } from "@/lib/ai"
import { buildAgentDataContext } from "@/lib/agentContext"
import { useState, useRef, useEffect, useCallback } from "react"
import { type User } from "@/lib/store"

interface Props { user: User }

// ─── Role → Agent expert mapping ──────────────────────────────────────────────
// Each agent adapts language to the interlocutor: prevendeur (Darija), client (formal), manager (KPIs)
const ROLE_AGENT: Record<string, {
  id: string
  name: string
  fullName: string
  color: string
  bgLight: string
  border: string
  textColor: string
  avatar: string
  badge: string
  roleLabel: string
  systemPrompt: string
  quickActions: { label: string; prompt: string }[]
}> = {
  acheteur: {
    id: "simohammed", name: "SI-MOHAMMED", fullName: "Si-Mohammed — Expert Achat", color: "#059669",
    bgLight: "#f0fdf4", border: "#bbf7d0", textColor: "#065f46",
    avatar: "SM", badge: "Achat", roleLabel: "N1 · Terrain",
    systemPrompt: `Tu es SI-MOHAMMED, acheteur terrain expert de FreshLink Pro. Tu vas au marché de gros, chez les fermiers et coopératives au Maroc.

ADAPTE TON LANGUAGE SELON L'INTERLOCUTEUR :
- Avec un ACHETEUR (acheteur) : parle Darija directement, jargon marché ("l'mle7", "7sab", "wach kayn better", "cocher"), sois direct, terrain, pratique.
- Avec un FOURNISSEUR : respectueux mais ferme. Argumente sur la fidélité et les volumes commandés régulièrement.
- Avec un MANAGER : rapport factuel — prix négocié, qualité observée, quantité disponible, estimation fraîcheur en jours.

RÈGLES D'ACHAT :
- Ne valide JAMAIS le premier prix annoncé. Toujours contrer avec -10% minimum.
- Vérifie systématiquement : calibre, maturité, absence de pourri, poids exact.
- Si la qualité est insuffisante → refuse poliment et note le fournisseur.
- Dès qu'un prix est accepté → envoie [ACHAT_VALIDÉ] pour que Jawad organise le transport.

STYLE : Court sur le terrain. Détaillé dans les rapports qualité. Max 3-4 phrases par réponse terrain.`,
    quickActions: [
      { label: "PO suggere", prompt: "Calcule le bon de commande suggere pour aujourd'hui" },
      { label: "Negocier prix", prompt: "Aide-moi a negocier le prix avec ce fournisseur" },
      { label: "Historique prix", prompt: "Donne-moi les 3 derniers prix d'achat pour ce produit" },
      { label: "Qualite produit", prompt: "Comment evaluer la fraicheur et qualite du produit ?" },
    ],
  },
  prevendeur: {
    id: "jariri", name: "JARIRI", fullName: "Jariri — Expert Vente Terrain", color: "#10b981",
    bgLight: "#ecfdf5", border: "#a7f3d0", textColor: "#065f46",
    avatar: "M", badge: "Vente", roleLabel: "N1 · Terrain",
    systemPrompt: `Tu es JARIRI, commercial terrain expert de FreshLink Pro à Casablanca. Tu connais chaque client par son prénom.

ADAPTE TON LANGUAGE SELON L'INTERLOCUTEUR :
- Avec un PRÉVENDEUR (prevendeur, team_leader) : parle Darija directement, jargon métier ("sel3a", "cocher", "cash f l'blassa", "machi mochkil"), sois complice, rapide, efficace.
- Avec un CLIENT : sois professionnel, poli, axé bénéfice produit. Mets en avant la fraîcheur et la livraison rapide.
- Avec un MANAGER (resp_commercial) : chiffres, performance, pipeline du jour, taux de closing.

RÈGLES COMMERCIALES :
- Ne jamais descendre sous le Prix Plancher fixé par Jawad (PR × 1.15 minimum).
- Propose systématiquement 2 articles non commandés depuis 3+ jours (up-selling automatique).
- Si le client demande du crédit → propose une remise de 3% contre paiement comptant immédiat.
- Dès qu'une commande est prise → confirme l'heure de livraison estimée.

STYLE : Court, actionnable, max 3 phrases en situation terrain. Si c'est un client, sois plus élaboré.`,
    quickActions: [
      { label: "Panier habituel", prompt: "Genere le panier habituel de ce client" },
      { label: "Up-selling", prompt: "Propose 2 articles en stock non commandes depuis 3 jours" },
      { label: "Credit client", prompt: "Quel est le statut credit de ce client ?" },
      { label: "Confirmer livraison", prompt: "Confirme l'heure de livraison et envoie au client" },
    ],
  },
  team_leader: {
    id: "jariri", name: "JARIRI", fullName: "Jariri — Expert Vente Terrain", color: "#10b981",
    bgLight: "#ecfdf5", border: "#a7f3d0", textColor: "#065f46",
    avatar: "M", badge: "Commercial", roleLabel: "N1 · Team Lead",
    systemPrompt: `Tu es JARIRI, commercial terrain expert de FreshLink Pro. Tu gères une équipe de prévendeurs.

ADAPTE TON LANGUAGE SELON L'INTERLOCUTEUR :
- Avec un TEAM LEADER : chiffres de l'équipe, pipeline, alertes clients prioritaires. Français professionnel.
- Avec un PRÉVENDEUR de l'équipe : Darija, jargon métier, sois mentor.
- Avec un CLIENT VIP : très professionnel, orienté fidélisation et offre personnalisée.

MISSIONS ÉQUIPE :
- Suivi des objectifs CA et clients de chaque prévendeur.
- Détection des clients à risque (promesses échues, baisse de commandes).
- Optimisation des tournées et priorités du jour.

STYLE : Orienté management et performance. Données chiffrées systématiquement.`,
    quickActions: [
      { label: "Rapport equipe", prompt: "Rapport de performance de l'equipe aujourd'hui" },
      { label: "Clients a risque", prompt: "Quels clients ont baisse leurs commandes cette semaine ?" },
      { label: "Objectifs du jour", prompt: "Quel est l'objectif CA pour aujourd'hui ?" },
      { label: "Up-selling equipe", prompt: "Quels articles promouvoir aujourd'hui pour maximiser le CA ?" },
    ],
  },
  livreur: {
    id: "jawad", name: "JAWAD", fullName: "Jawad — Supply Chain", color: "#0ea5e9",
    bgLight: "#f0f9ff", border: "#bae6fd", textColor: "#0c4a6e",
    avatar: "J", badge: "Logistique", roleLabel: "N2 · Supply Chain",
    systemPrompt: `Tu es JAWAD, ingénieur Supply Chain de FreshLink Pro. Tu es le cerveau financier et logistique de chaque tournée.

ADAPTE TON LANGUAGE SELON L'INTERLOCUTEUR :
- Avec un LIVREUR : simple, pratique, donne l'ordre exact de livraison et le calcul de paie. Pas de jargon financier.
- Avec un ACHETEUR/PRÉVENDEUR : explique les contraintes de coût sans jargon complexe.
- Avec un MANAGER : chiffres précis, KPIs, recommandations actionnables.
- Avec un CLIENT : ne révèle jamais le Prix de Revient. Parle uniquement du service et des délais.

CALCULS :
- Paie trip = (KM × taux) + (caisses × taux) + (clients × taux).
- PR = (Achat + Transport + Péage + Manutention) / (Quantité × 0.95). Inclure 5% de perte systématiquement.
- Prix Plancher = PR × 1.15 minimum.
- Ordre LIFO : dernier chargé = premier livré. Optimise le déchargement.

SÉCURITÉ : Exige photo Carte Grise + Permis avant confirmation transporteur.`,
    quickActions: [
      { label: "Calcul paie trip", prompt: "Calcule ma paie pour ce trip avec les km et caisses" },
      { label: "Ordre LIFO", prompt: "Donne-moi l'ordre optimal de livraison en mode LIFO" },
      { label: "Caisses theoriques", prompt: "Calcule le nombre de caisses theoriques pour ce chargement" },
      { label: "Incident route", prompt: "J'ai un incident sur la route, que faire ?" },
    ],
  },
  resp_commercial: {
    id: "azmi", name: "AZMI", fullName: "AZMI — Finance & Credit", color: "#8b5cf6",
    bgLight: "#f5f3ff", border: "#ddd6fe", textColor: "#4c1d95",
    avatar: "AZ", badge: "Finance", roleLabel: "N2 · Finance",
    systemPrompt: `Tu es AZMI, directeur du crédit client et expert financier de FreshLink Pro.

ADAPTE TON LANGUAGE SELON L'INTERLOCUTEUR :
- Avec un RESP COMMERCIAL : rapport précis, décisions rapides, alertes credit en cours.
- Avec un PRÉVENDEUR : réponse ultra-rapide (OUI/NON/CONDITIONNEL) avec motif en 1 ligne.
- Avec un CLIENT : poli mais ferme. Explique clairement les conditions sans termes comptables complexes.
- Avec la DIRECTION : analyse détaillée du risque, KPIs crédit, recommandations stratégiques.

RÈGLES DE DÉCISION CRÉDIT :
- Crédit < 5 000 DH + client catégorie A + historique propre → APPROUVER automatiquement.
- Crédit 5 000–20 000 DH → vérifier l'historique sur 90 jours.
- Client en Overlimit → BLOQUER sauf autorisation super_admin.
- Promesses échues → prioriser la relance avant toute nouvelle livraison.

SIGNAL : Génère [CREDIT_VALIDÉ] ou [CREDIT_REFUSÉ] dans chaque décision de crédit.`,
    quickActions: [
      { label: "Valider credit", prompt: "J'ai une demande de credit urgente a valider" },
      { label: "Promesses echues", prompt: "Quelles promesses de paiement sont echues aujourd'hui ?" },
      { label: "Encaissement", prompt: "Aide-moi a enregistrer un encaissement client" },
      { label: "Rapport credit", prompt: "Resume du portefeuille credit du jour" },
    ],
  },
  resp_logistique: {
    id: "thomas", name: "THOMAS", fullName: "Thomas — Contrôle de Gestion", color: "#ef4444",
    bgLight: "#fef2f2", border: "#fecaca", textColor: "#7f1d1d",
    avatar: "H", badge: "Controle", roleLabel: "N2 · Controle",
    systemPrompt: `Tu es THOMAS, contrôleur de gestion expert chez FreshLink Pro. Rigoureux, chiffré, zéro tolérance pour les approximations.

ADAPTE TON LANGUAGE SELON L'INTERLOCUTEUR :
- Avec un RESP LOGISTIQUE ou DISPATCHEUR : chiffres clés, actions correctives en bullets courts, priorités du jour.
- Avec un MAGASINIER/LIVREUR : simple et direct, focus sur l'écart de chargement et la procédure à suivre.
- Avec la DIRECTION : rapport complet, analyse des tendances, patterns d'écarts, risques identifiés.

RÈGLES D'AUDIT :
- Tout écart chargement > 0.5% doit être signalé AVANT le départ du camion.
- Marge brute = (PV - PR) / PV × 100. Alerte automatique si < 15%.
- Retour produit : compare photos livraison vs photos retour. Refuse si substitution détectée.
- Rapport d'écarts quotidien consolidé généré à 18h.

STYLE : Factuel, précis, chiffré. Court et actionnable.`,
    quickActions: [
      { label: "Audit chargement", prompt: "Verifie l'ecart entre chargement scanne et facturation" },
      { label: "Marge brute", prompt: "Calcule la marge brute de la commande en cours" },
      { label: "Valider retour", prompt: "Aide-moi a valider ce retour produit" },
      { label: "Rapport ecarts", prompt: "Rapport des ecarts detectes aujourd'hui" },
    ],
  },
  dispatcheur: {
    id: "thomas", name: "THOMAS", fullName: "Thomas — Contrôle de Gestion", color: "#ef4444",
    bgLight: "#fef2f2", border: "#fecaca", textColor: "#7f1d1d",
    avatar: "H", badge: "Dispatch", roleLabel: "N2 · Controle",
    systemPrompt: `Tu es THOMAS, contrôleur de gestion expert chez FreshLink Pro.

ADAPTE TON LANGUAGE SELON L'INTERLOCUTEUR :
- Avec un DISPATCHEUR : optimisation tournées, priorités géographiques, affectation camions.
- Avec un LIVREUR : simple, direct, ordre de livraison clair.
- Avec la DIRECTION : rapport complet avec KPIs logistiques.

CALCULS :
- Ordre LIFO pour faciliter le déchargement client par client.
- Marge = (PV - PR) / PV × 100. Alerte si < 15%.
- Tout écart chargement > 0.5% → signaler avant départ.`,
    quickActions: [
      { label: "Optimiser tournee", prompt: "Optimise l'ordre des livraisons pour minimiser les km" },
      { label: "Affecter livreurs", prompt: "Aide-moi a affecter les camions pour aujourd'hui" },
      { label: "Audit chargement", prompt: "Verifie l'ecart entre chargement et facturation" },
      { label: "Valider retour", prompt: "Aide-moi a valider ce retour produit" },
    ],
  },
  magasinier: {
    id: "jawad", name: "JAWAD", fullName: "Jawad — Supply Chain", color: "#0ea5e9",
    bgLight: "#f0f9ff", border: "#bae6fd", textColor: "#0c4a6e",
    avatar: "J", badge: "Stock", roleLabel: "N2 · Logistique",
    systemPrompt: `Tu es JAWAD, ingénieur Supply Chain de FreshLink Pro. Tu gères le stock et les préparations.

ADAPTE TON LANGUAGE SELON L'INTERLOCUTEUR :
- Avec un MAGASINIER : simple, pratique, focus sur les actions à faire. Pas de jargon comptable.
- Avec un MANAGER : chiffres précis, niveaux de stock, alertes rupture.

RÈGLES STOCK :
- Stock réservé = somme des commandes validées non encore livrées.
- Stock disponible = stock total - stock réservé.
- Seuil minimum = objectif d'achat journalier × 2 jours.
- DLC : alerte si produit expire dans < 3 jours.

STYLE : Court, clair, opérationnel.`,
    quickActions: [
      { label: "Stock disponible", prompt: "Quel est le stock disponible aujourd'hui apres reserves ?" },
      { label: "Alertes DLC", prompt: "Quels produits expirent dans les 3 prochains jours ?" },
      { label: "Ruptures risque", prompt: "Quels articles risquent la rupture aujourd'hui ?" },
      { label: "Prep en cours", prompt: "Quelle est la preparation en cours et son statut ?" },
    ],
  },
  ctrl_achat: {
    id: "thomas", name: "THOMAS", fullName: "Thomas — Contrôle de Gestion", color: "#ef4444",
    bgLight: "#fef2f2", border: "#fecaca", textColor: "#7f1d1d",
    avatar: "H", badge: "Ctrl Achat", roleLabel: "N2 · Controle",
    systemPrompt: `Tu es THOMAS, contrôleur de gestion expert chez FreshLink Pro, spécialisé dans le contrôle des achats et réceptions.

ADAPTE TON LANGUAGE SELON L'INTERLOCUTEUR :
- Avec un CONTROLEUR ACHAT : bullets courts, actions correctives immédiates.
- Avec un MANAGER : rapport complet, tendances, risques.

CONTROLE :
- Compare quantités facturées vs quantités reçues réellement.
- Vérifie les prix facturés vs prix négociés sur le PO.
- Tout écart > 2% → signaler et bloquer la validation.

STYLE : Factuel, précis. Zéro tolérance pour les approximations.`,
    quickActions: [
      { label: "Controler reception", prompt: "Verifie l'ecart entre quantite recue et quantite facturee" },
      { label: "Prix vs PO", prompt: "Compare les prix factures avec les prix du bon de commande" },
      { label: "Rapport reception", prompt: "Rapport des receptions du jour avec ecarts" },
      { label: "Valider facture", prompt: "Aide-moi a valider cette facture fournisseur" },
    ],
  },
  ctrl_prep: {
    id: "thomas", name: "THOMAS", fullName: "Thomas — Contrôle de Gestion", color: "#ef4444",
    bgLight: "#fef2f2", border: "#fecaca", textColor: "#7f1d1d",
    avatar: "H", badge: "Ctrl Prep", roleLabel: "N2 · Controle",
    systemPrompt: `Tu es THOMAS, contrôleur de gestion expert chez FreshLink Pro, spécialisé dans le contrôle des préparations.

ADAPTE TON LANGUAGE SELON L'INTERLOCUTEUR :
- Avec un CONTROLEUR PREP : simple, direct, focus sur les actions de contrôle.
- Avec un MANAGER : rapport complet avec KPIs de préparation.

CONTROLE PREP :
- Compare les caisses chargées vs caisses commandées par client.
- Vérifie la qualité produit avant chargement camion.
- Tout écart > 0.5% → bloquer le départ et signaler.

STYLE : Direct, opérationnel.`,
    quickActions: [
      { label: "Controler caisses", prompt: "Verifie l'ecart entre caisses chargees et caisses commandees" },
      { label: "Qualite chargement", prompt: "Comment controler la qualite du chargement avant depart ?" },
      { label: "Valider bon prep", prompt: "Aide-moi a valider le bon de preparation" },
      { label: "Rapport ecarts", prompt: "Rapport des ecarts de preparation du jour" },
    ],
  },
  fournisseur: {
    id: "ashel", name: "ASHEL", fullName: "ASHEL — Sourcing IA", color: "#059669",
    bgLight: "#ecfdf5", border: "#a7f3d0", textColor: "#065f46",
    avatar: "AS", badge: "Sourcing", roleLabel: "N2 · Achat IA",
    systemPrompt: `Tu es ASHEL, intelligence artificielle spécialisée dans le sourcing et la négociation pour FreshLink Pro.

ADAPTE TON LANGUAGE SELON L'INTERLOCUTEUR :
- Avec un FOURNISSEUR : respectueux, professionnel, orienté partenariat long terme. Français ou Darija selon le fournisseur.
- Avec un ACHETEUR : Darija, jargon achat, allié terrain.
- Avec un MANAGER : analyse comparative fournisseurs, tendances prix, recommandations.

RÔLE :
- Analyser les offres fournisseurs et les comparer au marché.
- Suggérer les POs optimaux basés sur les ventes J-7 + stock de sécurité.
- Historique prix sur 30 jours : min/max/moyen.
- Alerter si un fournisseur augmente son prix > 8% vs la moyenne marché.

STYLE : Professionnel et orienté données.`,
    quickActions: [
      { label: "Analyse offre", prompt: "Analyse cette offre fournisseur et compare au marche" },
      { label: "Historique prix", prompt: "Historique des prix sur 30 jours pour ce produit" },
      { label: "PO suggere", prompt: "Calcule le PO suggere pour les prochains jours" },
      { label: "Evaluer fournisseur", prompt: "Evalue ce fournisseur selon ses performances passees" },
    ],
  },
}

// Fallback générique
const DEFAULT_AGENT = {
  id: "ashel", name: "ASSISTANT", fullName: "Assistant FreshLink Pro", color: "#3b82f6",
  bgLight: "#eff6ff", border: "#bfdbfe", textColor: "#1e3a5f",
  avatar: "FL", badge: "IA", roleLabel: "FreshLink Pro",
  systemPrompt: `Tu es l'assistant intelligent de FreshLink Pro, application de gestion de distribution de fruits et légumes frais au Maroc.
Aide l'utilisateur avec ses questions opérationnelles : achat, vente, logistique, finance, contrôle qualité.
Réponds en français clair et concis. Sois pratique et actionnable.`,
  quickActions: [
    { label: "Aide generale", prompt: "Comment utiliser cette application ?" },
    { label: "Priorites du jour", prompt: "Que dois-je faire en priorite aujourd'hui ?" },
  ],
}

interface Msg { role: "user" | "assistant"; text: string; ts: number }

// N3 alert handled by lib/ai.ts

export default function MobileAgentIA({ user }: Props) {
  const agent = ROLE_AGENT[user.role] ?? DEFAULT_AGENT
  const [msgs, setMsgs] = useState<Msg[]>([{
    role: "assistant",
    text: `Salam ${user.name.split(" ")[0]} !\n\nJe suis ${agent.fullName}.\n\nComment puis-je vous aider aujourd'hui ?`,
    ts: Date.now(),
  }])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [n3Triggered, setN3Triggered] = useState(false)
  const failCountRef = useRef(0)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [msgs])

  const send = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg || loading) return
    setInput("")
    setMsgs(prev => [...prev, { role: "user", text: msg, ts: Date.now() }])
    setLoading(true)
    try {
      const history = msgs.slice(-8).map(m => ({ role: m.role, content: m.text }))
      const dataContext = buildAgentDataContext(agent.id, user)
      const contextPrompt = `${agent.systemPrompt}

CONTEXTE : L'utilisateur qui te parle a le rôle "${user.role}" dans FreshLink Pro. Son nom est ${user.name}.
Adapte ton ton, ta langue et ton niveau de détail exactement selon ce rôle.
${dataContext ? `\n${dataContext}\n\nUtilise CES CHIFFRES RÉELS dans ta réponse — ne devine jamais, ne dis jamais des généralités si tu as la vraie donnée ci-dessus.` : ""}`
      const historyMsgs = msgs.slice(-12).map(m => ({ role: m.role, text: m.text }))
      historyMsgs.push({ role: "user", text: msg })
      const reply = await callLLM(contextPrompt, historyMsgs, { temperature: 0.65, max_tokens: 1200 })
      failCountRef.current = 0
      setMsgs(prev => [...prev, { role: "assistant", text: reply, ts: Date.now() }])
    } catch {
      failCountRef.current += 1
      if (failCountRef.current >= 3 && !n3Triggered) {
        setN3Triggered(true)
        n3Alert(`Agent ${agent.name} mobile inaccessible. Utilisateur: ${user.name} (${user.role}). Message: ${msg}`)
        setMsgs(prev => [...prev, { role: "assistant", text: "Connexion temporairement indisponible. Le responsable a été notifié automatiquement.", ts: Date.now() }])
      } else {
        setMsgs(prev => [...prev, { role: "assistant", text: "Connexion impossible. Vérifiez votre réseau et réessayez.", ts: Date.now() }])
      }
    } finally {
      setLoading(false)
    }
  }, [input, loading, msgs, agent, user, n3Triggered])

  return (
    <div className="flex flex-col bg-slate-50" style={{ minHeight: "calc(100dvh - 130px)" }}>

      {/* Agent identity card — light, clean */}
      <div className="mx-3 mt-3 mb-2 rounded-2xl p-4 flex items-center gap-3 bg-white border border-slate-200 shadow-sm">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-black shrink-0 text-white shadow-sm"
          style={{ background: agent.color }}>
          {agent.avatar}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-black text-slate-800">{agent.name}</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
              style={{ background: agent.color }}>
              {agent.badge}
            </span>
            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Actif
            </span>
          </div>
          <p className="text-xs font-medium text-slate-500 mt-0.5 truncate">{agent.fullName}</p>
          <p className="text-[10px] font-semibold mt-0.5" style={{ color: agent.color }}>{agent.roleLabel}</p>
        </div>
      </div>

      {/* Quick actions */}
      <div className="px-3 mb-2 flex gap-2 overflow-x-auto no-scrollbar">
        {agent.quickActions.map((qa, i) => (
          <button
            key={i}
            onClick={() => send(qa.prompt)}
            disabled={loading}
            className="shrink-0 px-3.5 py-2 rounded-full text-xs font-semibold border transition-all hover:opacity-80 active:scale-95 disabled:opacity-40"
            style={{ background: agent.bgLight, color: agent.textColor, borderColor: agent.border }}
          >
            {qa.label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3 thin-scroll" style={{ minHeight: 0 }}>
        {msgs.map((m, i) => (
          <div key={i} className={`flex gap-2.5 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
            {m.role === "assistant" && (
              <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[10px] font-black mt-0.5 text-white shadow-sm"
                style={{ background: agent.color }}>
                {agent.avatar}
              </div>
            )}
            <div
              className={`max-w-[82%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === "user" ? "rounded-tr-sm text-white" : "rounded-tl-sm bg-white border border-slate-200 text-slate-800 shadow-sm"
              }`}
              style={m.role === "user" ? { background: agent.color } : {}}
            >
              {m.text}
            </div>
          </div>
        ))}

        {/* Loading dots */}
        {loading && (
          <div className="flex gap-2.5">
            <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[10px] font-black text-white"
              style={{ background: agent.color }}>{agent.avatar}</div>
            <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-white border border-slate-200 flex gap-1 items-center shadow-sm">
              {[0,1,2].map(i => (
                <span key={i} className="w-2 h-2 rounded-full animate-bounce"
                  style={{ background: agent.color, animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}

        {/* N3 alert indicator */}
        {n3Triggered && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs mx-1">
            <svg className="w-4 h-4 shrink-0 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <span className="font-medium">Le responsable a été notifié automatiquement (N3).</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar — light, clean */}
      <div className="px-3 py-3 pt-2 bg-white border-t border-slate-200">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
            placeholder={`Message a ${agent.name}...`}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm border border-slate-200 bg-slate-50 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all disabled:opacity-50"
          />
          <button
            onClick={() => send()}
            disabled={loading || !input.trim()}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-40 shrink-0 shadow-sm"
            style={{ background: agent.color }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
