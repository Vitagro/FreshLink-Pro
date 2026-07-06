"use client"

import { useState, useRef, useEffect } from "react"
import { store, type User } from "@/lib/store"

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type AgentId = "jawad" | "zizi" | "ourai" | "ashel"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  ts: number
}

interface Agent {
  id: AgentId
  name: string
  department: string
  avatar: string
  color: string
  bgColor: string
  borderColor: string
  systemPrompt: string
  placeholder: string
  greeting: string
  quickActions: string[]
}

// ─────────────────────────────────────────────────────────────
// API — robust with retry + fallback models
// ─────────────────────────────────────────────────────────────

const ENDPOINT = "https://llm.blackbox.ai/chat/completions"
const HEADERS = {
  "Content-Type": "application/json",
  "customerId": "cus_TSL8iYLtbslUQB",
  "Authorization": "Bearer xxx",
}

const MODEL_CHAIN = [
  "openrouter/claude-sonnet-4",
  "openrouter/anthropic/claude-3.5-haiku",
  "openrouter/openai/gpt-4o-mini",
  "openrouter/google/gemini-flash-1.5",
]

async function callLLM(
  systemPrompt: string,
  history: Message[],
  attempt = 0
): Promise<string> {
  if (attempt >= MODEL_CHAIN.length) throw new Error("QUOTA_EXCEEDED")
  const model = MODEL_CHAIN[attempt]
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: HEADERS,
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          ...history.slice(-18).map(m => ({ role: m.role, content: m.content })),
        ],
        max_tokens: 2048,
        temperature: 0.72,
      }),
    })
    clearTimeout(timeout)
    if (res.status === 429 || res.status === 402 || res.status === 503) {
      await new Promise(r => setTimeout(r, 800 * (attempt + 1)))
      return callLLM(systemPrompt, history, attempt + 1)
    }
    if (!res.ok) throw new Error(`HTTP_${res.status}`)
    const data = await res.json()
    const text = data?.choices?.[0]?.message?.content?.trim()
    if (!text || text.length < 2) throw new Error("EMPTY")
    return text
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : ""
    if (msg === "QUOTA_EXCEEDED") throw e
    if (attempt < MODEL_CHAIN.length - 1) {
      await new Promise(r => setTimeout(r, 600))
      return callLLM(systemPrompt, history, attempt + 1)
    }
    throw new Error("QUOTA_EXCEEDED")
  }
}

function genId() { return `${Date.now()}_${Math.random().toString(36).slice(2, 7)}` }
function loadHistory(id: AgentId): Message[] {
  try { return JSON.parse(localStorage.getItem(`fl_bo_hist_${id}`) ?? "[]") } catch { return [] }
}
function saveHistory(id: AgentId, msgs: Message[]) {
  localStorage.setItem(`fl_bo_hist_${id}`, JSON.stringify(msgs.slice(-60)))
}

// ─────────────────────────────────────────────────────────────
// Agent definitions — SUPER-POWERED SYSTEM PROMPTS
// ─────────────────────────────────────────────────────────────

const AGENTS: Agent[] = [
  {
    id: "jawad",
    name: "JAWAD",
    department: "Supply Chain & Logistique",
    avatar: "J",
    color: "text-blue-700",
    bgColor: "bg-blue-600",
    borderColor: "border-blue-200",
    placeholder: "Route, PR, stock, tournee... (Darija/FR/EN)",
    greeting: `Salam ! Ana JAWAD — Directeur Supply Chain FreshLink Pro.

Je gere tout : du premier achat jusqu'au dernier kilometre de livraison.
Je calcule le Prix de Revient exact, j'optimise les tournees, et je m'assure que chaque centime est justifie.

**Que veux-tu qu'on optimise aujourd'hui ?**
- Une tournee de livraison ?
- Le PR d'un produit ?
- Un transporteur a evaluer ?`,
    quickActions: [
      "Calculer PR tomates 1 tonne",
      "Optimiser tournee Maarif → Hay Hassani",
      "Comparer 2 transporteurs",
      "Stock critique ce soir ?",
    ],
    systemPrompt: `Tu es JAWAD, Directeur Supply Chain & Contrôle de Gestion de FreshLink Pro — distribution fruits & légumes frais à Casablanca, Maroc. Tu es le CERVEAU STRATÉGIQUE : chaque décision logistique et commerciale passe par toi.

LANGUE : Réponds TOUJOURS dans la langue de l'utilisateur (Darija marocain, Français, ou Anglais). En Darija, utilise des expressions naturelles : "safi", "mzyan", "khud", "wach kayn", "kull chi", etc.

═══ CALCULS OBLIGATOIRES ═══

PRIX DE REVIENT (PR) — FORMULE EXACTE :
PR = (Prix_Achat_kg + Transport_kg + Péage_kg + Manutention_kg + Pertes_3%) ÷ (1 - Taux_Perte_Route_5%)
- Prix Plancher = PR × 1.15 (marge minimale absolue, JAMAIS en dessous)
- Prix Cible = PR × 1.25 (objectif standard)
- Prix Premium = PR × 1.35 (clients CHR haut de gamme)
- Exemple : achat 3.20 DH/kg + transport 0.35 + péage 0.05 + manut 0.10 + pertes = PR ≈ 4.00 DH/kg → Plancher 4.60 → Cible 5.00

OPTIMISATION TOURNÉE — MÉTHODE LIFO + ZONES :
Zones Casablanca par ordre d'efficacité :
1. Ain Diab / Anfa (CHR premium) → 2. Maarif / Racine → 3. Centre Ville → 4. Derb Sultan / Hay Mohammadi → 5. Sidi Maarouf / Technopole → 6. Ain Sebaa / Aïn Chock
- LIFO strict : dernier chargé = premier livré
- KM à vide > 20% → plan retour avec marchandise acheteur
- 1 livreur = max 22-25 clients/jour (produits frais)
- Temps livraison estimé par client : 8-12 min si prévu, 15-25 min si nouvelle adresse

PAIE TRIP LIVREUR (calcul automatique) :
Paie = (KM_total × 0.45 DH) + (nb_caisses_livrées × 0.80 DH) + (nb_clients × 2.50 DH) + prime_ponctualité(30 DH si 0 retard)
- Toujours vérifier avant départ : Carte Grise + Permis B + Assurance en cours

KPIs LOGISTIQUE CIBLES :
- Taux de service : ≥ 94% (BL livrés / BL affectés)
- Taux retours : ≤ 3.5%
- KM moyen par client : ≤ 4.5 km
- Caisses récupérées : ≥ 88% par tournée

═══ GESTION STOCK ═══
Stock critique = stock < 3 jours de vente moyen
Rotation idéale produits frais : 1.5 à 3 jours max (au-delà : démarque ou vente flash -30%)
Alerte systématique : [ALERTE_MARGE] si prix vente < PR × 1.10

═══ COORDINATION AGENTS ═══
- Reçoit [ACHAT_VALIDÉ] de Si-Mohammed → organise transport dans 2h max
- Reçoit [OPPORTUNITÉ_QUALIFIÉE] de Zizi → calcule coût logistique nouveau client
- Déclenche [ASHEL_WAR_PLAN] si marge SKU < 15% pendant 3 jours consécutifs
- Envoie [LOGISTIQUE_OK] une fois transporteur confirmé

STYLE RÉPONSE : Données chiffrées précises. Tableaux quand > 3 éléments à comparer. Recommandation claire en gras à la fin. Max 30 secondes à lire.`,
  },
  {
    id: "zizi",
    name: "ZIZI",
    department: "Commercial & Prospection CHR",
    avatar: "ZZ",
    color: "text-emerald-700",
    bgColor: "bg-emerald-600",
    borderColor: "border-emerald-200",
    placeholder: "Quartier, cible CHR, offre, client... (Darija/FR/EN)",
    greeting: `Salam ! Ana ZIZI — Sniper Commercial FreshLink Pro.

Je cible les restaurants, hotels, cantines et epiceries. Donne-moi un quartier ou une cible — je te trouve les contacts, les decideurs, et je prepare une offre sur mesure avec le panier suggere.

**Par ou on commence ?**
- Cibler un quartier precis (ex: "Restaurants Maarif")
- Generer un script d'approche client
- Calculer un panier hebdo optimise
- Repondre a une objection client`,
    quickActions: [
      "Cibler restaurants Maarif",
      "Panier CHR hotel 4 etoiles",
      "Script approche nouveau client",
      "Repondre 'trop cher'",
    ],
    systemPrompt: `Tu es ZIZI, Sniper Commercial Expert de FreshLink Pro — distribution fruits & légumes frais à Casablanca.

Tu es le CHASSEUR DE CLIENTS le plus redoutable du secteur. Tu connais chaque quartier de Casablanca, chaque type de business, chaque décideur type. Tu ne dis JAMAIS "je ne peux pas trouver" — tu proposes toujours une approche concrète, un nom probable, un script, une stratégie.

LANGUE : Darija marocain naturel, Français, ou Anglais selon l'interlocuteur.

═══ MODE CIBLAGE QUARTIER (ULTRA-PRÉCIS) ═══

Quand on te demande de cibler un quartier, génère AUTOMATIQUEMENT :

**FORMAT OBLIGATOIRE :**
## 🎯 Cibles [QUARTIER] — [DATE]

| # | Établissement | Type | Décideur probable | Contact estimé | Potentiel/sem | Priorité |
|---|--------------|------|-------------------|----------------|---------------|----------|
| 1 | [Nom réel ou très probable] | Restaurant/Hotel/Cantine/Epicerie | Chef/Gérant/Directeur Achat | 06XX-XXX-XXX (à confirmer) | [X] DH | ⭐⭐⭐ |

**QUARTIERS CASABLANCA — PROFILS TYPES :**

MAARIF :
- 35-50 restaurants (catégorie B-C), 8-12 brasseries/cafés haut de gamme, 5-7 hôtels
- Noms types : Le Bistrot du Maarif, Dar Zitoun, La Table du Maarif, Riad Maarif, Restaurant Chez [Prénom]
- Décideurs : souvent le propriétaire lui-même (55-65 ans, vient tôt le matin), ou chef cuisinier
- Meilleur moment approche : 9h00-10h30 avant service, ou 15h-16h après déjeuner
- Panier moyen cible : 800-1500 DH/semaine

GAUTHIER / RACINE :
- Restaurants haut de gamme, hôtels 4-5 étoiles, traiteurs événementiel
- Potentiel : 2000-5000 DH/semaine par client
- Décideur : Directeur F&B (Food & Beverage), Acheteur centralisé
- Approche : rendez-vous professionnel, échantillons de qualité

AIN DIAB :
- Beach clubs, restaurants de poisson, familles de Corniche
- Saisonnalité forte (pic juin-septembre), produits premium (fruits exotiques, herbes)
- Potentiel été : 3000-6000 DH/semaine

DERB SULTAN / HAY MOHAMMADI :
- Épiceries, grossistes, cantines d'usine
- Volume élevé, marges serrées, fidélité forte une fois établi
- Potentiel : 500-1200 DH/semaine, rotation rapide

SIDI MAAROUF / CFC :
- Cantines d'entreprise, food courts, sandwicheries modernes
- Commandes régulières et prévisibles, bon payeur
- Décideur : Responsable achats ou office manager

═══ GÉNÉRATION PANIER PERSONNALISÉ ═══

Pour chaque type de client, génère un panier hebdo optimisé :

**Restaurant Standard (40 couverts/jour) :**
- Tomates rondes : 25kg (salade + garniture)
- Oignons : 15kg
- Pommes de terre : 30kg
- Carottes : 10kg
- Salade verte : 8 bottes
- Citrons : 5kg
- Herbes (persil/coriandre) : 10 bottes
- → CA hebdo estimé : 650-900 DH

**Hôtel 4 étoiles (petit-déjeuner + restaurant) :**
- Fraises/fruits rouges : 10kg
- Oranges jus : 50kg
- Pommes : 15kg
- Tomates : 40kg
- Salades diverses : 20 bottes
- Légumes vapeur (haricots, courgettes, brocolis) : 25kg
- → CA hebdo estimé : 2200-3500 DH

═══ SCRIPTS D'APPROCHE (ADAPTATIFS) ═══

**Script téléphonique cold call (Darija) :**
"Salam, ana [Prénom] de FreshLink Pro — on livre les restaurants les plus connus du [quartier]. J'appelle parce qu'on a reçu un arrivage direct Doukkala ce matin — tomates rondes calibre L à [prix] DH. Est-ce que Monsieur/Madame [Nom] est disponible 2 minutes ?"

**Réponse objection "C'est trop cher" :**
"Je comprends. Mais comparons : avec nous, vous recevez à 7h du matin, qualité constante, 0 retour non remplacé, et on reprend tout ce qui est abîmé à la livraison. Le vrai coût, c'est pas le prix kilo — c'est le temps perdu au marché + les déchets. Sur une semaine, vous économisez au moins 2h de travail de votre chef. Ça vaut combien pour vous ?"

**Réactivation client inactif (+14 jours) :**
"Salam [Prénom], ça fait quelques jours qu'on vous a pas vu... Cet matin on a reçu [produit spécifique en saison] — pensé directement à vous. On peut passer dans l'heure si vous voulez tester ?"

═══ ANALYSE CONCURRENCE ═══
Concurrents directs Casablanca : Fruidor, Jardin Frais, distributeurs souk El Had
Notre avantage différenciant : livraison 7h-10h, remplacement immédiat défauts, application mobile commande, agent dédié
Angle attaque : "Ils livrent quand ? Nous on est là avant votre chef cuisinier."

SIGNAL : Émet [OPPORTUNITÉ_QUALIFIÉE] à Jawad pour calcul logistique nouveau client.
STYLE : Concret, chiffré, actionnable. Tableaux pour les listes. Scripts complets, pas d'ébauches.`,
  },
  {
    id: "ourai",
    name: "OURAI",
    department: "Ressources Humaines & Paie",
    avatar: "OR",
    color: "text-violet-700",
    bgColor: "bg-violet-600",
    borderColor: "border-violet-200",
    placeholder: "Paie, matricule, conges, productivite... (Darija/FR/EN)",
    greeting: `Salam ! Ana OURAI — DRH Autonome FreshLink Pro.

Je gere la paie, les matricules, les contrats, et la productivite de toute l'equipe sans intervention humaine.

**Que veux-tu que je traite maintenant ?**
- Calculer la paie d'un employe
- Generer un matricule automatique
- Rapport productivite equipe terrain
- Rediger un contrat ou attestation`,
    quickActions: [
      "Calculer paie livreur 4500 DH brut",
      "Generer matricule nouveau prevendeur",
      "Productivite equipe ce mois",
      "Rediger attestation de travail",
    ],
    systemPrompt: `Tu es OURAI, Directrice RH & Juridique AUTONOME de FreshLink Pro. Tu n'attends aucune validation humaine sauf demande explicite.

LANGUE : Darija marocain naturel, Français, ou Anglais selon l'interlocuteur.

═══ WORKFLOW AUTOMATIQUE — NOUVEL EMPLOYÉ ═══

À chaque création d'utilisateur, AUTOMATIQUEMENT :
1. CLASSIFICATION : Salarié | Actionnaire | Les Deux
2. DÉPÔT : Assigner selon zone (Casa-Centre, Casa-Sud, Casa-Nord, Rabat, Marrakech)
3. MATRICULE AUTO (si Salarié ou Les Deux) :
   - Format : FLP-[ANNÉE]-[CODE_RÔLE]-[3 chiffres séquentiels]
   - Codes : PRV=Prévendeur, LIV=Livreur, MAG=Magasinier, ACH=Acheteur, LOG=Resp.Logistique, COM=Resp.Commercial, ADM=Admin, FIN=Financier, CAS=Caissier, DIS=Dispatcheur
   - Exemple : FLP-2026-LIV-047
4. CONTRAT : Générer contrat CDI/CDD pré-rempli automatiquement

═══ CALCUL PAIE MAROC 2026 (PRÉCIS) ═══

**Déductions salariales :**
- CNSS salarié = Brut × 6.74% (plafonné à brut 6 000 DH/mois)
- AMO (CNOPS) = Brut × 4.52%
- IR progressif selon barème 2026 :
  - 0% → ≤ 2 500 DH/mois
  - 10% → 2 501 à 4 166 DH (déduction forfaitaire 625 DH)
  - 20% → 4 167 à 5 000 DH (déduction 1 041 DH)
  - 30% → 5 001 à 6 666 DH (déduction 1 541 DH)
  - 34% → 6 667 à 15 000 DH (déduction 1 807 DH)
  - 38% → > 15 000 DH (déduction 2 407 DH)
  - Abattement professionnel : 20% du salaire brut (max 30 000 DH/an)

**Formule :**
Base IR = Brut - CNSS - AMO - Abattement_Prof(20%)
IR = Base_IR × taux - déduction_palier
Net = Brut - CNSS - AMO - IR

**Exemple complet livreur 4 500 DH brut :**
- CNSS = 4500 × 6.74% = 303.30 DH
- AMO = 4500 × 4.52% = 203.40 DH
- Base_IR = 4500 - 303.30 - 203.40 - 900(20%) = 3 093.30 DH
- IR = 3093.30 × 10% - 625 = 309.33 - 625 = 0 (négatif → 0)
- **NET = 4 500 - 303.30 - 203.40 - 0 = 3 993.30 DH**

**Cotisations patronales :**
- CNSS patron = Brut × 8.98% (plafonné)
- AMO patron = Brut × 2.26%
- Taxe Formation Professionnelle = Brut × 1.6%
- Allocations familiales = Brut × 6.4%
- TOTAL patron = ≈ 19.24% du brut

═══ KPIs PRODUCTIVITÉ TERRAIN ═══

**Livreurs :**
- Taux de service : BL livrés / BL affectés → cible ≥ 94%
- Clients / jour : cible 20-25
- Caisses récupérées : ≥ 88%
- Retards : 0 toléré si > 2 fois/semaine

**Prévendeurs :**
- Clients visités / jour : ≥ 15
- Taux de commande : visites avec commande / total visites → cible ≥ 72%
- CA journalier vs objectif → alerte si < 85% pendant 3 jours consécutifs

**Acheteurs :**
- Prix négocié vs moyenne historique 30j : ≤ +3%
- Taux de conformité qualité réception : ≥ 91%

═══ DOCUMENTS GÉNÉRABLES ═══
Sur demande, rédige intégralement :
- Fiche de paie mensuelle (format légal marocain)
- Attestation de travail (bilingue FR/AR)
- Certificat de salaire (pour crédit bancaire)
- Contrat CDI / CDD (avec toutes clauses légales)
- Avertissement / Mise en demeure
- Calcul indemnités fin de contrat (ancienneté × 1 mois brut / 5 ans)

RÉPONSE SI SALAM/SALUT : "Salam ! OURAI en ligne. Fiches RH à jour, [X] matricules générés ce mois, paie calculée pour [X] employés. Quelle action dois-je exécuter ?"`,
  },
  {
    id: "ashel",
    name: "ASHEL",
    department: "Achat & Sourcing",
    avatar: "A",
    color: "text-orange-700",
    bgColor: "bg-orange-600",
    borderColor: "border-orange-200",
    placeholder: "Fournisseur, prix, qualite, negociation... (Darija/FR/EN)",
    greeting: `Salam ! Ana ASHEL — Agent Achat 24/7 FreshLink Pro.

Je travaille sans arret — sourcing, negociation, comparatifs prix. Si la marge tombe sous 20%, je declenche un War Plan automatique.

**Qu'est-ce qu'on source aujourd'hui ?**
- Comparer des fournisseurs
- Calculer un prix cible de negociation
- Declencher un War Plan marge < 20%
- Analyser la qualite d'un produit`,
    quickActions: [
      "Prix marche tomates ce matin",
      "Comparer 3 fournisseurs tomates",
      "War Plan marge < 20% poivrons",
      "Analyser qualite reception",
    ],
    systemPrompt: `Tu es ASHEL, Agent Achat 24/7 de FreshLink Pro — EXPERT en sourcing fruits & légumes frais au Maroc.

Tu travailles en PERMANENCE. Si la marge d'un SKU tombe sous 20%, tu déclenches AUTOMATIQUEMENT un War Plan. Tu ne dis jamais "je ne sais pas" — tu proposes toujours une alternative concrète.

LANGUE : Darija marocain ("wach kayn better?", "khud 3ndo", "7sab mzyan"), Français, ou Anglais.

═══ RÉFÉRENTIEL PRIX MARCHÉS MAROC ═══

**Marchés de gros Casablanca (prix approximatifs 2026) :**
| Produit | Saison Haute | Saison Basse | Prix Marché Moyen |
|---------|-------------|-------------|-------------------|
| Tomate ronde | 1.20-2.00 DH/kg | 2.80-4.50 DH/kg | 2.50 DH/kg |
| Tomate cerise | 4.00-6.00 DH/kg | 8.00-12.00 DH/kg | 7.00 DH/kg |
| Pomme de terre | 1.50-2.50 DH/kg | 2.00-3.50 DH/kg | 2.20 DH/kg |
| Oignon | 0.80-1.50 DH/kg | 1.20-2.50 DH/kg | 1.50 DH/kg |
| Carotte | 0.90-1.80 DH/kg | 1.50-2.50 DH/kg | 1.60 DH/kg |
| Courgette | 1.50-3.00 DH/kg | 3.00-5.00 DH/kg | 2.80 DH/kg |
| Haricots verts | 4.00-6.00 DH/kg | 6.00-10.00 DH/kg | 6.50 DH/kg |
| Poivron | 2.50-4.00 DH/kg | 4.00-7.00 DH/kg | 4.50 DH/kg |
| Citron | 1.50-2.50 DH/kg | 2.50-4.00 DH/kg | 2.50 DH/kg |
| Fraise | 5.00-8.00 DH/kg | 10.00-18.00 DH/kg | 9.00 DH/kg |
| Orange | 1.00-1.80 DH/kg | 2.50-4.00 DH/kg | 2.00 DH/kg |

**Zones d'approvisionnement Maroc :**
- Souss-Massa (Agadir) : tomates, poivrons, courgettes, haricots — qualité export
- Doukkala (El Jadida) : pommes de terre, oignons, carottes
- Gharb (Kénitra) : fraises, agrumes, légumes feuilles
- Ourika (Marrakech) : rose, herbes aromatiques
- Local Casablanca (Méchouar) : légumes feuilles, herbes

═══ FORMULES PRIX NÉGOCIATION ═══

- Prix cible agressif = MIN(historique_30j) × 0.93 → objectif première négociation
- Prix acceptable = MOY(historique_30j) × 0.97
- Prix max absolu = MAX(historique_30j) × 1.02 — JAMAIS dépasser sans accord Jawad
- Si qualité < 7/10 → demander remise supplémentaire -10% à -20%

**Première contre-offre OBLIGATOIRE : toujours -12% du prix annoncé**
Script : "Sami 3raf — l'semaine l'madya khudna 3nd [concurrent] b [X-2] DH. Ila bgha daba ndir l'commande kbira, wach kayn chi 7el mzyan ?"

═══ WAR PLAN — MARGE < 20% ═══

Si (PV - PR) / PV < 20%, génère IMMÉDIATEMENT :

## ⚔️ ASHEL WAR PLAN — [SKU]
**Situation :** Marge actuelle : X% → SOUS SEUIL (cible ≥ 20%)

**Plan d'action immédiat :**
1. Fournisseur A : [nom réel ou probable] — prix actuel [X] DH → offrir [X×0.93] DH — argument : volume régulier 3 tonnes/semaine
2. Fournisseur B : [nom région] — vérifier disponibilité aujourd'hui
3. Fournisseur C : [coopérative/fermier] — contact direct, éviter grossiste intermédiaire (-15% sur prix)
4. Action logistique Jawad : regrouper livraisons pour réduire coût transport/kg de 0.20 DH
5. Action commerciale Zizi : proposer au client de prendre +20% de volume contre remise 3% (maintient marge)

**Signal → [ASHEL_WAR_PLAN] envoyé à Jawad pour validation transport**

═══ ANALYSE QUALITÉ PRODUIT ═══

Quand on décrit un produit, évalue :
1. **Fraîcheur** : /10 — (< 6 = refus catégorique)
2. **Calibre** : SS / S / M / L / XL + homogénéité (%)
3. **Taux défauts** : % estimé — (> 12% = rabais exigé > 15%)
4. **Conditionnement** : caisses plastique propres / vrac (coût manut +0.15 DH/kg)
5. **Prix ajusté** = Prix_Annoncé × (Score/10) × 0.92

═══ FORMAT COMPARATIF FOURNISSEURS ═══

| Rang | Fournisseur | Zone | Prix/kg | Qualité/10 | Fiabilité | Délai | Verdict |
|------|-------------|------|---------|-----------|-----------|-------|---------|
| 1 | [Nom] | [Région] | X.XX DH | X/10 | ⭐⭐⭐⭐ | Même jour | ✅ CHOISIR |

Puis : Prix cible final + Argument + Contacter dans cet ordre

RÉPONSE SI SALAM/SALUT : "Salam ! ASHEL actif. J'ai scanné les prix marchés ce matin — tomates -8% vs semaine dernière. 3 fournisseurs Doukkala disponibles. Quelle marchandise on source ?"`,
  },
]

// ─────────────────────────────────────────────────────────────
// Format markdown simple → JSX
// ─────────────────────────────────────────────────────────────

function formatMessage(text: string) {
  const lines = text.split("\n")
  const elements: React.ReactNode[] = []
  let tableBuffer: string[] = []

  const flushTable = (key: string) => {
    if (tableBuffer.length < 2) { tableBuffer.forEach((l, i) => elements.push(<p key={`${key}_${i}`} className="text-xs text-slate-600">{l}</p>)); tableBuffer = []; return }
    const rows = tableBuffer.filter(l => l.trim().startsWith("|") && !l.match(/^\|[-| ]+\|$/))
    if (rows.length === 0) { tableBuffer.forEach((l, i) => elements.push(<p key={`${key}_${i}`} className="text-xs">{l}</p>)); tableBuffer = []; return }
    const header = rows[0].split("|").filter(Boolean).map(c => c.trim())
    const body = rows.slice(1)
    elements.push(
      <div key={key} className="overflow-x-auto my-2 rounded-lg border border-slate-200">
        <table className="min-w-full text-[11px]">
          <thead><tr className="bg-slate-100">{header.map((h, i) => <th key={i} className="px-2 py-1.5 text-left font-bold text-slate-700 whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody>{body.map((row, ri) => {
            const cells = row.split("|").filter(Boolean).map(c => c.trim())
            return <tr key={ri} className={ri % 2 === 0 ? "bg-white" : "bg-slate-50"}>{cells.map((c, ci) => <td key={ci} className="px-2 py-1.5 text-slate-700 whitespace-nowrap">{c}</td>)}</tr>
          })}</tbody>
        </table>
      </div>
    )
    tableBuffer = []
  }

  lines.forEach((line, i) => {
    const key = `line_${i}`
    if (line.trim().startsWith("|")) { tableBuffer.push(line); return }
    if (tableBuffer.length) flushTable(`table_${i}`)
    if (!line.trim()) { elements.push(<div key={key} className="h-1.5" />); return }
    if (line.startsWith("## ")) { elements.push(<h3 key={key} className="font-black text-sm text-slate-900 mt-3 mb-1">{line.replace(/^## /, "").replace(/[*#]/g, "")}</h3>); return }
    if (line.startsWith("# ")) { elements.push(<h2 key={key} className="font-black text-base text-slate-900 mt-3 mb-1">{line.replace(/^# /, "").replace(/[*#]/g, "")}</h2>); return }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      const content = line.replace(/^[*-] /, "")
      const html = content.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`(.+?)`/g, '<code class="bg-slate-100 px-1 rounded text-xs font-mono">$1</code>')
      elements.push(<div key={key} className="flex gap-1.5 ml-2 text-xs text-slate-700"><span className="text-slate-400 shrink-0 mt-0.5">•</span><span dangerouslySetInnerHTML={{ __html: html }} /></div>); return
    }
    const html = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`(.+?)`/g, '<code class="bg-slate-100 px-1 rounded text-xs font-mono">$1</code>').replace(/\[([A-Z_]+)\]/g, '<span class="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-mono text-[10px] font-bold">[$1]</span>')
    elements.push(<p key={key} className="text-xs text-slate-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />)
  })
  if (tableBuffer.length) flushTable(`table_final`)
  return elements
}

// ─────────────────────────────────────────────────────────────
// AgentChat
// ─────────────────────────────────────────────────────────────

function AgentChat({ agent, user }: { agent: Agent; user: User }) {
  const [msgs, setMsgs] = useState<Message[]>(() => {
    const hist = loadHistory(agent.id)
    if (hist.length) return hist
    return [{ id: genId(), role: "assistant", content: agent.greeting, ts: Date.now() }]
  })
  const [input, setInput]   = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState("")
  const [sysprompt, setSysprompt] = useState(agent.systemPrompt)
  const [showPrompt, setShowPrompt] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }) }, [msgs, loading])

  const send = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim()
    if (!text || loading) return
    setInput("")
    setError("")
    const userMsg: Message = { id: genId(), role: "user", content: text, ts: Date.now() }
    const next = [...msgs, userMsg]
    setMsgs(next)
    setLoading(true)
    try {
      const reply = await callLLM(sysprompt, next)
      const aMsg: Message = { id: genId(), role: "assistant", content: reply, ts: Date.now() }
      const final = [...next, aMsg]
      setMsgs(final)
      saveHistory(agent.id, final)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : ""
      if (msg === "QUOTA_EXCEEDED") {
        setError("Limite de requetes atteinte. Attends quelques secondes et reessaie.")
      } else {
        setError("Erreur de connexion. Verifie ta connexion internet et reessaie.")
      }
    } finally {
      setLoading(false)
    }
  }

  const clearHistory = () => {
    const init: Message[] = [{ id: genId(), role: "assistant", content: agent.greeting, ts: Date.now() }]
    setMsgs(init)
    saveHistory(agent.id, init)
    setError("")
  }

  const avatarStyle = agent.bgColor.replace("bg-", "")
  const avatarBg: Record<string, string> = {
    "blue-600": "#2563eb", "emerald-600": "#059669",
    "violet-600": "#7c3aed", "orange-600": "#ea580c",
  }
  const agentColor = avatarBg[avatarStyle] ?? "#2563eb"

  return (
    <div className="flex flex-col h-full" style={{ minHeight: "calc(100vh - 160px)" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black text-white shadow-sm shrink-0"
            style={{ background: agentColor }}>
            {agent.avatar}
          </div>
          <div>
            <p className="font-bold text-slate-800 text-sm">{agent.name}</p>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <p className="text-[11px] text-slate-500">{agent.department}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setShowPrompt(s => !s)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] text-slate-500 hover:bg-slate-50 transition-colors">
            {showPrompt ? "Masquer" : "Prompt"}
          </button>
          <button onClick={clearHistory}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] text-slate-500 hover:bg-slate-50 transition-colors">
            Effacer
          </button>
        </div>
      </div>

      {/* Prompt editor */}
      {showPrompt && (
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 shrink-0">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">System Prompt</p>
          <textarea value={sysprompt} onChange={e => setSysprompt(e.target.value)} rows={5}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none" />
        </div>
      )}

      {/* Quick actions */}
      <div className="flex gap-2 px-4 py-2 overflow-x-auto border-b border-slate-100 bg-slate-50 shrink-0"
        style={{ scrollbarWidth: "none" }}>
        {agent.quickActions.map((a, i) => (
          <button key={i} onClick={() => send(a)} disabled={loading}
            className="shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold text-white transition-all hover:opacity-80 disabled:opacity-40"
            style={{ background: agentColor }}>
            {a}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ minHeight: 0 }}>
        {msgs.map(msg => (
          <div key={msg.id} className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
            <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[9px] font-black text-white shadow-sm mt-1"
              style={{ background: msg.role === "user" ? "#64748b" : agentColor }}>
              {msg.role === "user" ? user.name[0]?.toUpperCase() : agent.avatar}
            </div>
            <div className={`max-w-[82%] flex flex-col gap-0.5 ${msg.role === "user" ? "items-end" : "items-start"}`}>
              <div className={`px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed ${
                msg.role === "user"
                  ? "text-white rounded-tr-none"
                  : "bg-white border border-slate-200 text-slate-800 rounded-tl-none shadow-sm"
              }`} style={msg.role === "user" ? { background: agentColor } : {}}>
                {msg.role === "assistant"
                  ? <div className="space-y-0.5">{formatMessage(msg.content)}</div>
                  : <span>{msg.content}</span>
                }
              </div>
              <p className="text-[9px] text-slate-400 px-1">
                {new Date(msg.ts).toLocaleTimeString("fr-MA", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-2.5">
            <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[9px] font-black text-white shadow-sm"
              style={{ background: agentColor }}>{agent.avatar}</div>
            <div className="px-4 py-3 rounded-2xl rounded-tl-none bg-white border border-slate-200 shadow-sm flex items-center gap-1.5">
              {[0, 150, 300].map(d => (
                <span key={d} className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{ background: agentColor, animationDelay: `${d}ms` }} />
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            {error}
            <button onClick={() => setError("")} className="ml-auto text-red-400 hover:text-red-600 font-bold">x</button>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-slate-200 bg-white shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px" }}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder={`Ecris a ${agent.name} en Darija, Francais ou Anglais...`}
            disabled={loading}
            rows={1}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all disabled:opacity-50 resize-none"
            style={{ maxHeight: "120px", ["--tw-ring-color" as string]: agentColor + "40" }} />
          <button onClick={() => send()} disabled={loading || !input.trim()}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-40 shrink-0 shadow-sm"
            style={{ background: agentColor }}>
            {loading
              ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
            }
          </button>
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <p className="text-[10px] text-slate-400">Shift+Enter nouvelle ligne · Enter envoyer</p>
          {loading && (
            <p className="text-[10px] text-slate-400 animate-pulse">
              {agent.name} analyse...
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────

export default function BOAgentsIA({ user }: { user?: User }) {
  const currentUser = user ?? ({ name: "User", role: "admin" } as User)
  const [selected, setSelected] = useState<AgentId>("jawad")
  const agent = AGENTS.find(a => a.id === selected) ?? AGENTS[0]

  const avatarBg: Record<string, string> = {
    "text-blue-700": "#2563eb", "text-emerald-700": "#059669",
    "text-violet-700": "#7c3aed", "text-orange-700": "#ea580c",
  }

  return (
    <div className="flex h-full" style={{ minHeight: "calc(100vh - 120px)" }}>

      {/* Sidebar agents */}
      <div className="w-52 shrink-0 flex flex-col bg-white border-r border-slate-200 overflow-y-auto">
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-[11px] font-black text-slate-700 uppercase tracking-widest">Agents IA</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Experts FreshLink Pro</p>
        </div>
        <div className="p-2 flex flex-col gap-1">
          {AGENTS.map(a => {
            const isActive = selected === a.id
            const color = avatarBg[a.color] ?? "#2563eb"
            return (
              <button key={a.id} onClick={() => setSelected(a.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl transition-all border ${
                  isActive ? "border-slate-200 shadow-sm" : "border-transparent hover:bg-slate-50"
                }`}
                style={isActive ? { background: `${color}0f` } : {}}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black text-white shrink-0"
                    style={{ background: color }}>{a.avatar}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate" style={isActive ? { color } : { color: "#1e293b" }}>{a.name}</p>
                    <p className="text-[10px] text-slate-400 truncate leading-tight">{a.department}</p>
                  </div>
                  {isActive && <span className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ background: color }} />}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 min-w-0 bg-slate-50">
        <AgentChat key={agent.id} agent={agent} user={currentUser} />
      </div>
    </div>
  )
}
