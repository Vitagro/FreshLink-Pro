'use client'
// 🔐 CONFIDENTIEL — Dashboard Investisseur Vita Fresh
// Accès restreint: Super Administrateur uniquement
// CHEMIN VS CODE : components/investisseur/InvestisseurDashboard.tsx
// Stratégie d'investissement Vita Fresh & ELT
// Règle d'or : 40% autofinancement avant chaque expansion
// P1:1.5M | P2:3M | P3:5M | P4:8M | P5:13M | P6:21M | P7:34M | P8:55M
import React, { useState, useEffect } from 'react'
import { TrendingUp, Shield, Target, ChevronDown, ChevronUp, CheckCircle2, Clock, AlertTriangle, Banknote, BarChart3, Leaf, Truck, Star, Lock, Unlock, ArrowRight, PieChart, Globe } from 'lucide-react'

// ── Réel P1 — suivi trésorerie agrégé (source : VitaFresh_Dossier_Financier, export ERP) ──
// Données mensuelles AGRÉGÉES (pas un grand-livre) — fallback si l'ERP fl_finance_mensuel est vide.
type MoisReel = { mois: string; volume: number; marge: number; transport: number; masse: number; ebitda: number }
const REAL_P1_FALLBACK: MoisReel[] = [
  { mois: 'Mars 2026',  volume: 31200, marge: 34320, transport: 6500,  masse: 43200, ebitda: -15380 },
  { mois: 'Avril 2026', volume: 52000, marge: 57200, transport: 10400, masse: 43200, ebitda: 3600 },
  { mois: 'Mai 2026',   volume: 52000, marge: 57200, transport: 10400, masse: 43200, ebitda: 3600 },
  { mois: 'Juin 2026*', volume: 24700, marge: 27170, transport: 4750,  masse: 3737,  ebitda: 18683 },
]
const DH = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} DH`
const KGn = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} kg`

interface Phase {
  id: number; label: string; capital: number; autofinancement: number; externe: number
  period: string; status: 'complete'|'active'|'locked'
  roi: number; payback: number; ca_cible: number; marge: number
  tonnage_jour: number    // tonnes distribuées/jour cible
  tonnage_mois: number    // tonnes distribuées/mois cible
  prix_moyen_kg: number   // prix moyen DH/kg
  objectifs: string[]; risques: string[]; kpis: string[]
  entities: { name: string; part: number; role: string }[]
}

const PHASES: Phase[] = [
  {
    id:1, label:'Phase 1 — 1.6T/jour | Fondation', capital:1_500_000, autofinancement:600_000, externe:900_000,
    period:'Mars – Juin 2026 (Mois 1–4)', status:'complete', roi:28, payback:36, ca_cible:4_200_000, marge:18,
    tonnage_jour:1.6, tonnage_mois:40, prix_moyen_kg:4.5,
    objectifs:["Lancement FreshLink Pro (MVP) — pilotage Jariri", "3 camions frigos opérationnels", "50 clients actifs (restaurants + marchands)", "Certification halal & normes ONSSA", "Thomas : contrôle de gestion", "S.Abdelilah : expert qualité", "Abdelali : contrôle qualité", "Ayoub : responsable affectation transport"],
    risques:["Délais administratifs autorisations", "Trouver les 600K MAD autofinancement", "Acquisition clients premiers mois"],
    kpis:["CA mensuel ≥ 350K MAD à M3", "Taux satisfaction client ≥ 85%", "Taux de livraison à l'heure ≥ 92%"],
    entities:[{name:'Vita Fresh',part:70,role:'Opérationnel & commercial'},{name:'ELT',part:20,role:'Logistique & transport'},{name:'Investisseurs',part:10,role:'Capital amorçage'}]
  },
  {
    id:2, label:'Phase 2 — 3T/jour | Expansion Locale', capital:3_000_000, autofinancement:1_200_000, externe:1_800_000,
    period:'Juin – Septembre 2025 (Mois 4–6)', status:'active', roi:34, payback:30, ca_cible:9_800_000, marge:21,
    tonnage_jour:3.0, tonnage_mois:78, prix_moyen_kg:4.8,
    objectifs:["Extension zone Casablanca + Mohammédia", "Fleet : 8 camions (dont 2 frigo premium)", "200 clients actifs", "Lancement module prévendeur mobile", "Entrepôt 1 200 m² zone industrielle"],
    risques:["Financement entrepôt (bail commercial)", "Recrutement chauffeurs qualifiés", "Concurrence acteurs établis"],
    kpis:["CA mensuel ≥ 820K MAD à M6", "NPS client ≥ 60", "Coût logistique < 18% du CA"],
    entities:[{name:'Vita Fresh',part:65,role:'Opérationnel'},{name:'ELT',part:25,role:'Flotte & entrepôt'},{name:'Investisseurs',part:10,role:'Croissance'}]
  },
  {
    id:3, label:'Phase 3 — 5.5T/jour | Axe Rabat-Tanger', capital:5_000_000, autofinancement:2_000_000, externe:3_000_000,
    period:'Septembre – Décembre 2025 (Mois 7–9)', status:'locked', roi:38, payback:28, ca_cible:18_500_000, marge:23,
    tonnage_jour:5.5, tonnage_mois:143, prix_moyen_kg:5.0,
    objectifs:["Ouverture antennes Rabat & Tanger", "Partenariats 5 grandes surfaces", "Fleet : 15 camions", "Plateforme B2B clients institutionnels", "ISO 22000 alimentation"],
    risques:["Coordination multi-site", "Recrutement superviseurs régionaux", "Volatilité prix approvisionnement"],
    kpis:["CA mensuel ≥ 1.5M MAD à M9", "Part marchés Rabat ≥ 8%", "EBITDA ≥ 22%"],
    entities:[{name:'Vita Fresh',part:60,role:'Hub central'},{name:'ELT',part:30,role:'Réseau régional'},{name:'Investisseurs',part:10,role:'Expansion'}]
  },
  {
    id:4, label:'Phase 4 — 9T/jour | Industrialisation', capital:8_000_000, autofinancement:3_200_000, externe:4_800_000,
    period:'Décembre 2025 – Mars 2026 (Mois 10–12)', status:'locked', roi:42, payback:26, ca_cible:32_000_000, marge:25,
    tonnage_jour:9.0, tonnage_mois:234, prix_moyen_kg:5.2,
    objectifs:["Plateforme logistique centrale 3 500 m²", "Unité de conditionnement & 4ème gamme", "Certification GlobalG.A.P.", "Fleet : 25 camions + 5 frigos", "Lancement offre export Espagne/France"],
    risques:["Investissement industriel lourd", "Normes export européennes", "Change EUR/MAD"],
    kpis:["CA mensuel ≥ 2.7M MAD à M12", "Export ≥ 15% du CA", "Pertes marchandises < 3%"],
    entities:[{name:'Vita Fresh',part:55,role:'Production & export'},{name:'ELT',part:30,role:'Logistique avancée'},{name:'Partenaires industriels',part:15,role:'Cofinancement'}]
  },
  {
    id:5, label:'Phase 5 — 14.5T/jour | Scale National', capital:13_000_000, autofinancement:5_200_000, externe:7_800_000,
    period:'Mars – Juin 2026 (Mois 13–15)', status:'locked', roi:46, payback:24, ca_cible:55_000_000, marge:27,
    tonnage_jour:14.5, tonnage_mois:377, prix_moyen_kg:5.4,
    objectifs:["Couverture nationale : 12 villes", "Hub régionaux : Marrakech, Fès, Agadir", "Fleet : 45 camions", "1 200 clients actifs", "Lancement marque propre produits premium"],
    risques:["Complexité opérationnelle nationale", "Besoin profils managériaux senior", "Pression sur trésorerie croissance"],
    kpis:["CA mensuel ≥ 4.6M MAD à M15", "Part marché national ≥ 4%", "Marge nette ≥ 12%"],
    entities:[{name:'Vita Fresh',part:50,role:'National HQ'},{name:'ELT',part:30,role:'Réseau national'},{name:'Fonds d\'investissement',part:20,role:'Croissance accélérée'}]
  },
  {
    id:6, label:'Phase 6 — 22T/jour | Tech & Data', capital:21_000_000, autofinancement:8_400_000, externe:12_600_000,
    period:'Juin – Septembre 2026 (Mois 16–18)', status:'locked', roi:50, payback:22, ca_cible:88_000_000, marge:29,
    tonnage_jour:22.0, tonnage_mois:572, prix_moyen_kg:5.6,
    objectifs:["Plateforme IA prédictive (gestion stocks)", "Marketplace B2B fruits & légumes Maroc", "API open pour partenaires distributeurs", "R&D blockchain traçabilité", "Fleet : 80 camions + drones dernière mile"],
    risques:["Investissement tech élevé", "Maturité du marché digital B2B", "Recrutement profils tech rares au Maroc"],
    kpis:["Revenus SaaS ≥ 10% du CA", "Réduction pertes IA ≥ 40%", "NPS ≥ 75"],
    entities:[{name:'Vita Fresh',part:45,role:'Opérationnel & commercial'},{name:'ELT',part:25,role:'Infrastructure'},{name:'Tech Fund',part:20,role:'Financement R&D'},{name:'Partenaires data',part:10,role:'Data & IA'}]
  },
  {
    id:7, label:'Phase 7 — 38T/jour | Expansion MENA', capital:34_000_000, autofinancement:13_600_000, externe:20_400_000,
    period:'Septembre – Décembre 2026 (Mois 19–21)', status:'locked', roi:55, payback:20, ca_cible:150_000_000, marge:31,
    tonnage_jour:38.0, tonnage_mois:988, prix_moyen_kg:5.8,
    objectifs:["Ouverture Sénégal, Côte d'Ivoire, Mauritanie", "Joint-ventures partenaires locaux Afrique", "Agrément export vers Golfe (EAU, Qatar)", "Certification BRC Food Safety", "Introduction en bourse partielle (Casablanca Stock Exchange)"],
    risques:["Risques géopolitiques Afrique subsaharienne", "Logistique inter-pays complexe", "Régulation alimentaire par pays"],
    kpis:["CA international ≥ 30% du total", "EBITDA groupe ≥ 28%", "Valorisation ≥ 500M MAD"],
    entities:[{name:'Vita Fresh Holding',part:40,role:'Groupe'},{name:'ELT International',part:25,role:'Logistique MENA'},{name:'Partenaires locaux',part:20,role:'JV par pays'},{name:'Fonds IPO',part:15,role:'Pré-IPO'}]
  },
  {
    id:8, label:'Phase 8 — 70T/jour | Groupe Agro-Alimentaire', capital:55_000_000, autofinancement:22_000_000, externe:33_000_000,
    period:'Décembre 2026 – Mars 2027 (Mois 22–24)', status:'locked', roi:60, payback:18, ca_cible:280_000_000, marge:33,
    tonnage_jour:70.0, tonnage_mois:1820, prix_moyen_kg:6.0,
    objectifs:["Acquisition d'une coopérative agricole (1 500 ha)", "Unités de transformation : jus, conserves, surgelés", "Marque internationale distribuée en GMS Europe", "Fleet : 300+ véhicules dont 50 réfrigérés longue distance", "Cotation bourse & levée de fonds institutionnels"],
    risques:["Complexité intégration verticale amont", "Normes agroalimentaires Europe (IFS, BRC)", "Volatilité climatique sur production"],
    kpis:["CA groupe ≥ 23M MAD/mois", "Capitalisation boursière ≥ 1.2Mrd MAD", "Présence dans ≥ 12 pays"],
    entities:[{name:'Vita Fresh Group SA',part:35,role:'Holding industriel'},{name:'ELT Logistics',part:20,role:'Transport & froid'},{name:'Agro Division',part:25,role:'Production & transformation'},{name:'Investisseurs institutionnels',part:20,role:'Capital marché'}]
  },
]

const MAD = (n:number) => { if(n>=1_000_000) return `${(n/1_000_000).toFixed(1)}M MAD`; if(n>=1_000) return `${(n/1_000).toFixed(0)}K MAD`; return `${n} MAD` }
const STATUS_META = { complete:{l:'Réalisée',c:'bg-emerald-100 text-emerald-700',dot:'bg-emerald-500'}, active:{l:'En cours',c:'bg-blue-100 text-blue-700',dot:'bg-blue-500 animate-pulse'}, locked:{l:'Planifiée',c:'bg-gray-100 text-gray-500',dot:'bg-gray-300'} }

function AutofinancementBar({auto,total}:{auto:number;total:number}) {
  const pct=Math.round((auto/total)*100)
  const ok=pct>=40
  return(
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-gray-500 flex items-center gap-1">{ok?<CheckCircle2 size={11} className="text-emerald-500"/>:<AlertTriangle size={11} className="text-amber-500"/>}Autofinancement</span>
        <span className={`font-bold ${ok?'text-emerald-600':'text-amber-600'}`}>{pct}% {ok?'✓ Règle d\'or respectée':'⚠ Règle 40% non atteinte'}</span>
      </div>
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-3 rounded-full transition-all ${ok?'bg-emerald-500':'bg-amber-400'}`} style={{width:`${pct}%`}}/>
      </div>
      <div className="flex justify-between text-[10px] text-gray-400">
        <span>Auto : {MAD(auto)}</span><span>Externe : {MAD(total-auto)}</span><span>Total : {MAD(total)}</span>
      </div>
    </div>
  )
}

const LS_PHASES = "fl_investisseur_phases"

function loadPhases(): Phase[] {
  if (typeof window === "undefined") return PHASES
  try {
    const raw = localStorage.getItem(LS_PHASES)
    if (raw) {
      const cached = JSON.parse(raw) as Phase[]
      // Auto-migration : une Phase 1 mise en cache avec l'ancienne date 2025 est
      // re-synchronisée sur le réel 2026 (période/label/tonnage), sans toucher
      // aux autres champs ni aux autres phases. Évite le "Réinitialiser" manuel.
      const c = PHASES.find(p => p.id === 1)
      let changed = false
      const fixed = cached.map(p => {
        if (c && p.id === 1 && typeof p.period === "string" && p.period.includes("2025")) {
          changed = true
          return { ...p, label: c.label, period: c.period, tonnage_jour: c.tonnage_jour, tonnage_mois: c.tonnage_mois }
        }
        return p
      })
      if (changed) { try { localStorage.setItem(LS_PHASES, JSON.stringify(fixed)) } catch { /* noop */ } }
      return fixed
    }
  } catch { /* noop */ }
  return PHASES
}

import { type User, isSuperSuperAdmin } from "@/lib/store"
export default function InvestisseurDashboard({ user }: { user?: User }) {
  const [expanded, setExpanded] = useState<number|null>(1)
  const [activeTab, setActiveTab] = useState<'phases'|'reel'|'synthese'|'regle'|'edit'>('phases')
  const [reel, setReel] = useState<MoisReel[]>(REAL_P1_FALLBACK)

  // Lit le suivi mensuel réel depuis l'ERP (fl_finance_mensuel) ; sinon garde le fallback dossier.
  useEffect(() => {
    let alive = true
    fetch('/api/sync-read?table=fl_finance_mensuel')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!alive || !d) return
        const rows = (Array.isArray(d) ? d : d.rows ?? d.data ?? []) as Array<{ payload?: Partial<MoisReel> }>
        const mapped = rows
          .map(r => r.payload)
          .filter((p): p is MoisReel => !!p && typeof p.volume === 'number' && typeof p.ebitda === 'number')
        if (mapped.length) setReel(mapped)
      })
      .catch(() => { /* offline → fallback dossier */ })
    return () => { alive = false }
  }, [])

  const reelTot = reel.reduce((a, m) => ({
    volume: a.volume + m.volume, marge: a.marge + m.marge,
    transport: a.transport + m.transport, masse: a.masse + m.masse, ebitda: a.ebitda + m.ebitda,
  }), { volume: 0, marge: 0, transport: 0, masse: 0, ebitda: 0 })
  const margeKg = reelTot.volume ? reelTot.marge / reelTot.volume : 0
  const [phases, setPhases] = useState<Phase[]>(loadPhases)
  const [editPhases, setEditPhases] = useState<Phase[]>(loadPhases)
  const [editSaved, setEditSaved] = useState(false)
  const canEdit = user ? (isSuperSuperAdmin(user) || user.role === 'admin' || user.role === 'super_admin') : false

  const totalCapital = phases.reduce((s,p)=>s+p.capital,0)
  const totalAuto = phases.reduce((s,p)=>s+p.autofinancement,0)
  const lastPhase = phases[phases.length-1]

  const handleSavePhases = () => {
    localStorage.setItem(LS_PHASES, JSON.stringify(editPhases))
    setPhases(editPhases)
    setEditSaved(true)
    setTimeout(() => { setEditSaved(false); setActiveTab('phases') }, 1500)
  }

  const updateEditPhase = (id: number, field: keyof Phase, value: number) => {
    setEditPhases(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p))
  }

  return(
    <div className="min-h-screen bg-gray-50">
      {/* HERO */}
      <div className="bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 text-white px-4 sm:px-6 lg:px-8 py-10">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center"><Leaf size={24}/></div>
            <div><p className="text-emerald-400 text-sm font-semibold">Vita Fresh × ELT</p><h1 className="text-2xl sm:text-3xl font-black">Stratégie d'Investissement</h1></div>
          </div>
          <p className="text-slate-300 text-sm sm:text-base max-w-2xl mb-8 leading-relaxed">Plan de développement en 8 phases sur 10 ans. <strong className="text-emerald-400">Règle d'or : 40% d'autofinancement minimum avant chaque nouvelle expansion.</strong></p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              {l:'Capital total 8 phases',v:MAD(totalCapital),i:<Banknote size={18}/>,c:'text-emerald-400'},
              {l:'Autofinancement total',v:MAD(totalAuto),i:<Shield size={18}/>,c:'text-blue-400'},
              {l:'CA cible Phase 8',v:MAD(lastPhase.ca_cible),i:<TrendingUp size={18}/>,c:'text-amber-400'},
              {l:'ROI cible Phase 8',v:`${lastPhase.roi}%`,i:<Target size={18}/>,c:'text-pink-400'},
            ].map(k=>(
              <div key={k.l} className="bg-white/10 backdrop-blur rounded-2xl p-4 border border-white/10">
                <div className={`${k.c} mb-2`}>{k.i}</div>
                <p className="text-xl sm:text-2xl font-black text-white">{k.v}</p>
                <p className="text-xs text-slate-400 mt-0.5">{k.l}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto flex gap-1 py-3 overflow-x-auto">
          {([{k:'phases' as const,l:'8 Phases',i:<BarChart3 size={14}/>},{k:'reel' as const,l:'Réel P1',i:<Banknote size={14}/>},{k:'synthese' as const,l:'Synthèse',i:<PieChart size={14}/>},{k:'regle' as const,l:"Règle d'or 40%",i:<Shield size={14}/>}] as const).map(t=>(
            <button key={t.k} onClick={()=>setActiveTab(t.k)} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${activeTab===t.k?'bg-emerald-50 text-emerald-700 border border-emerald-200':'text-gray-500 hover:bg-gray-100'}`}>{t.i}{t.l}</button>
          ))}
          {canEdit && (
            <button onClick={()=>{ setEditPhases([...phases]); setActiveTab('edit') }} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${activeTab==='edit'?'bg-amber-50 text-amber-700 border border-amber-200':'text-gray-500 hover:bg-gray-100'}`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              Modifier les données
            </button>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">

        {/* ── EDIT TAB ── */}
        {activeTab==='edit'&&canEdit&&(
          <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-amber-50 border-b border-amber-200 flex items-center justify-between gap-3">
              <div>
                <p className="font-bold text-amber-900">Modifier les données d'investissement</p>
                <p className="text-xs text-amber-600 mt-0.5">Les modifications sont sauvegardées localement. Champs numériques en MAD.</p>
              </div>
              <button onClick={handleSavePhases} className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors">
                {editSaved ? '✓ Sauvegardé !' : 'Enregistrer'}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-600">
                    <th className="text-left px-4 py-3 font-semibold">Phase</th>
                    <th className="text-right px-3 py-3 font-semibold">Capital (MAD)</th>
                    <th className="text-right px-3 py-3 font-semibold">Autofinancement</th>
                    <th className="text-right px-3 py-3 font-semibold">Externe</th>
                    <th className="text-right px-3 py-3 font-semibold">CA Cible (MAD)</th>
                    <th className="text-right px-3 py-3 font-semibold">ROI %</th>
                    <th className="text-right px-3 py-3 font-semibold">Marge %</th>
                    <th className="text-right px-3 py-3 font-semibold">T/jour</th>
                    <th className="text-center px-3 py-3 font-semibold">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {editPhases.map(p => (
                    <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2 font-semibold text-gray-700 whitespace-nowrap">P{p.id} — {p.period}</td>
                      {(['capital','autofinancement','externe','ca_cible'] as const).map(f => (
                        <td key={f} className="px-2 py-1">
                          <input type="number" value={f === 'externe' ? p.capital - p.autofinancement : (p as unknown as Record<string,number>)[f]}
                            readOnly={f === 'externe'}
                            onChange={e => updateEditPhase(p.id, f as keyof Phase, Number(e.target.value))}
                            className={`w-28 text-right px-2 py-1 border rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-emerald-400 ${f==='externe'?'bg-gray-50 text-gray-400 cursor-not-allowed':'border-gray-200 bg-white'}`}
                          />
                        </td>
                      ))}
                      {(['roi','marge','tonnage_jour'] as const).map(f => (
                        <td key={f} className="px-2 py-1">
                          <input type="number" value={(p as unknown as Record<string,number>)[f]}
                            onChange={e => updateEditPhase(p.id, f as keyof Phase, Number(e.target.value))}
                            className="w-16 text-right px-2 py-1 border border-gray-200 rounded-lg text-xs font-mono bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400"
                          />
                        </td>
                      ))}
                      <td className="px-2 py-1 text-center">
                        <select value={p.status} onChange={e => setEditPhases(prev => prev.map(ph => ph.id === p.id ? { ...ph, status: e.target.value as Phase['status'] } : ph))}
                          className="text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400">
                          <option value="complete">Réalisée</option>
                          <option value="active">En cours</option>
                          <option value="locked">Planifiée</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
              <button onClick={() => { setEditPhases(PHASES); }} className="text-xs text-gray-500 hover:text-gray-700 underline">Réinitialiser aux valeurs par défaut</button>
              <button onClick={handleSavePhases} className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors">
                {editSaved ? '✓ Sauvegardé !' : 'Enregistrer les modifications'}
              </button>
            </div>
          </div>
        )}

        {/* ── PHASES ── */}
        {activeTab==='phases'&&phases.map(phase=>{
          const sm=STATUS_META[phase.status]; const isExp=expanded===phase.id; const autoOk=phase.autofinancement/phase.capital>=0.4
          return(
            <div key={phase.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-shadow hover:shadow-md ${phase.status==='active'?'border-blue-300':'border-gray-200'}`}>
              <button onClick={()=>setExpanded(isExp?null:phase.id)} className="w-full flex items-start gap-4 px-5 sm:px-6 py-5 text-left">
                {/* Numéro */}
                <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center font-black text-lg shrink-0 ${phase.status==='complete'?'bg-emerald-500 text-white':phase.status==='active'?'bg-blue-600 text-white':'bg-gray-100 text-gray-400'}`}>{phase.id}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="font-bold text-gray-900 text-base">{phase.label}</h3>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${sm.c}`}>{sm.l}</span>
                    {!autoOk&&<span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">⚠ 40% requis</span>}
                    {autoOk&&phase.status!=='locked'&&<span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">✓ Règle d'or OK</span>}
                  </div>
                  <p className="text-xs text-gray-400 mb-2 flex items-center gap-1"><Clock size={11}/>{phase.period}</p>
                  {/* TONNAGE — affichage principal */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 text-sm font-black px-3 py-1 rounded-full">
                      🚛 {phase.tonnage_jour}T/jour
                    </span>
                    <span className="text-xs text-gray-400">{phase.tonnage_mois}T/mois · {phase.prix_moyen_kg} DH/kg moy · CA estimé {MAD(phase.tonnage_mois * 1000 * phase.prix_moyen_kg)}/mois</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div><p className="text-gray-400">Capital requis</p><p className="font-bold text-gray-900">{MAD(phase.capital)}</p></div>
                    <div><p className="text-gray-400">CA cible / an</p><p className="font-bold text-emerald-600">{MAD(phase.ca_cible)}</p></div>
                    <div><p className="text-gray-400">ROI estimé</p><p className="font-bold text-blue-600">{phase.roi}%</p></div>
                    <div><p className="text-gray-400">Payback</p><p className="font-bold text-gray-900">{phase.payback} mois</p></div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {phase.status==='locked'?<Lock size={15} className="text-gray-300"/>:<Unlock size={15} className="text-emerald-500"/>}
                  {isExp?<ChevronUp size={16} className="text-gray-400"/>:<ChevronDown size={16} className="text-gray-400"/>}
                </div>
              </button>

              {isExp&&(
                <div className="border-t border-gray-100 px-5 sm:px-6 pb-6 pt-4 space-y-5">
                  {/* Autofinancement */}
                  <AutofinancementBar auto={phase.autofinancement} total={phase.capital}/>

                  {/* Objectifs + Risques + KPIs */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1"><Target size={11}/>Objectifs</p>
                      <ul className="space-y-1.5">{phase.objectifs.map((o,i)=><li key={i} className="flex items-start gap-1.5 text-xs text-gray-700"><CheckCircle2 size={11} className="text-emerald-500 shrink-0 mt-0.5"/>{o}</li>)}</ul>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1"><AlertTriangle size={11}/>Risques</p>
                      <ul className="space-y-1.5">{phase.risques.map((r,i)=><li key={i} className="flex items-start gap-1.5 text-xs text-gray-600"><AlertTriangle size={11} className="text-amber-500 shrink-0 mt-0.5"/>{r}</li>)}</ul>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1"><BarChart3 size={11}/>KPIs de succès</p>
                      <ul className="space-y-1.5">{phase.kpis.map((k,i)=><li key={i} className="flex items-start gap-1.5 text-xs text-gray-700"><Star size={11} className="text-blue-500 shrink-0 mt-0.5"/>{k}</li>)}</ul>
                    </div>
                  </div>

                  {/* Structure actionnariat */}
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1"><PieChart size={11}/>Structure actionnariat</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {phase.entities.map(e=>(
                        <div key={e.name} className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                          <p className="font-black text-xl text-emerald-600">{e.part}%</p>
                          <p className="font-semibold text-xs text-gray-900 leading-tight mt-0.5">{e.name}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{e.role}</p>
                          <div className="h-1 bg-gray-200 rounded-full mt-2 overflow-hidden"><div className="h-1 bg-emerald-500 rounded-full" style={{width:`${e.part}%`}}/></div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Métriques financières */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[{l:'Marge nette',v:`${phase.marge}%`},{l:'ROI',v:`${phase.roi}%`},{l:'Payback',v:`${phase.payback}m`},{l:'CA annuel',v:MAD(phase.ca_cible)}].map(m=>(
                      <div key={m.l} className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-center"><p className="text-lg font-black text-slate-800">{m.v}</p><p className="text-[10px] text-slate-400">{m.l}</p></div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {/* ── RÉEL P1 (suivi trésorerie agrégé — dossier financier / ERP) ── */}
        {activeTab==='reel'&&(
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
                <div>
                  <h3 className="font-bold text-gray-900 flex items-center gap-2"><Banknote size={16} className="text-emerald-600"/>Résultats réels — Phase 1 (Mars → 19 juin 2026)</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Suivi de trésorerie agrégé · source : dossier financier (export ERP FreshLink Pro) · marge brute 1,1 DH/kg</p>
                </div>
                <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full border border-emerald-200">Données vérifiées · autofinancement intégral</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                {[
                  {l:'Volume traité',v:KGn(reelTot.volume),c:'text-gray-900'},
                  {l:'Marge brute',v:DH(reelTot.marge),c:'text-emerald-600'},
                  {l:'EBITDA cumulé',v:`${reelTot.ebitda>=0?'+':''}${DH(reelTot.ebitda)}`,c:reelTot.ebitda>=0?'text-emerald-600':'text-red-600'},
                  {l:'Marge / kg',v:`${margeKg.toFixed(2)} DH`,c:'text-gray-900'},
                ].map(k=>(
                  <div key={k.l} className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                    <p className={`text-lg font-black ${k.c}`}>{k.v}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{k.l}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100"><h3 className="font-bold text-gray-900">Détail mensuel</h3></div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-gray-50 text-xs text-gray-500">
                    <th className="text-left px-4 py-3">Mois</th>
                    <th className="text-right px-4 py-3">Volume</th>
                    <th className="text-right px-4 py-3">Marge brute</th>
                    <th className="text-right px-4 py-3">Transport</th>
                    <th className="text-right px-4 py-3">Masse salariale</th>
                    <th className="text-right px-4 py-3">EBITDA</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {reel.map(m=>(
                      <tr key={m.mois} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{m.mois}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{KGn(m.volume)}</td>
                        <td className="px-4 py-3 text-right text-emerald-600 font-semibold">{DH(m.marge)}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{DH(m.transport)}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{DH(m.masse)}</td>
                        <td className={`px-4 py-3 text-right font-bold ${m.ebitda>=0?'text-emerald-600':'text-red-600'}`}>{m.ebitda>=0?'+':''}{DH(m.ebitda)}</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-bold text-sm">
                      <td className="px-4 py-3 text-gray-900">TOTAL P1</td>
                      <td className="px-4 py-3 text-right">{KGn(reelTot.volume)}</td>
                      <td className="px-4 py-3 text-right text-emerald-700">{DH(reelTot.marge)}</td>
                      <td className="px-4 py-3 text-right">{DH(reelTot.transport)}</td>
                      <td className="px-4 py-3 text-right">{DH(reelTot.masse)}</td>
                      <td className={`px-4 py-3 text-right ${reelTot.ebitda>=0?'text-emerald-700':'text-red-600'}`}>{reelTot.ebitda>=0?'+':''}{DH(reelTot.ebitda)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 leading-relaxed">
              <p className="flex items-start gap-1.5"><AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5"/><span><strong>Juin (*) non récurrent :</strong> arrêté au 19 (creux Aïd al-Kbir), masse salariale variable (partage des gains ÷6). Run-rate normalisé ≈ avril/mai (+3 600 DH/mois). <strong>Autofinancement :</strong> 78 000 DH apportés sur 100 000 DH requis (critère 20 %) → écart de 22 000 DH à couvrir.</span></p>
            </div>
          </div>
        )}

        {/* ── SYNTHÈSE ── */}
        {activeTab==='synthese'&&(
          <div className="space-y-5">
            {/* Timeline visuelle */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6 overflow-x-auto">
              <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><TrendingUp size={16} className="text-emerald-500"/>Progression du capital — 8 phases</h3>
              <div className="flex items-end gap-2 h-40 min-w-max">
                {phases.map(p=>{
                  const maxCap=55_000_000; const h=Math.round((p.capital/maxCap)*100)
                  return(
                    <div key={p.id} className="flex flex-col items-center gap-1 w-14">
                      <div className="flex flex-col items-center justify-end w-10" style={{height:'120px'}}>
                        <div className={`w-10 rounded-t-lg transition-all ${p.status==='complete'?'bg-emerald-500':p.status==='active'?'bg-blue-500':'bg-gray-200'}`} style={{height:`${h}%`}}/>
                      </div>
                      <p className="text-[9px] font-bold text-gray-500">P{p.id}</p>
                      <p className="text-[8px] text-gray-400">{MAD(p.capital)}</p>
                    </div>
                  )
                })}
              </div>
            </div>
            {/* Tableau synthèse */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100"><h3 className="font-bold text-gray-900">Tableau de bord 8 phases</h3></div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-gray-50 text-xs text-gray-500">
                    <th className="text-left px-4 py-3">Phase</th>
                    <th className="text-right px-4 py-3">Capital</th>
                    <th className="text-right px-4 py-3">Auto (40%)</th>
                    <th className="text-right px-4 py-3">CA cible</th>
                    <th className="text-right px-4 py-3">ROI</th>
                    <th className="text-right px-4 py-3">Marge</th>
                    <th className="text-center px-4 py-3">Statut</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {phases.map(p=>{
                      const sm=STATUS_META[p.status]; const ok=p.autofinancement/p.capital>=0.4
                      return(
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3"><div className="flex items-center gap-2"><div className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold text-white ${p.status==='complete'?'bg-emerald-500':p.status==='active'?'bg-blue-600':'bg-gray-300'}`}>{p.id}</div><span className="font-medium text-gray-900 truncate max-w-28">{p.label.split('—')[1]?.trim()}</span></div></td>
                          <td className="px-4 py-3 text-right font-semibold">{MAD(p.capital)}</td>
                          <td className={`px-4 py-3 text-right font-semibold ${ok?'text-emerald-600':'text-amber-600'}`}>{MAD(p.autofinancement)} {ok?'✓':''}</td>
                          <td className="px-4 py-3 text-right text-emerald-600 font-semibold">{MAD(p.ca_cible)}</td>
                          <td className="px-4 py-3 text-right text-blue-600 font-bold">{p.roi}%</td>
                          <td className="px-4 py-3 text-right text-gray-600">{p.marge}%</td>
                          <td className="px-4 py-3 text-center"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${sm.c}`}>{sm.l}</span></td>
                        </tr>
                      )
                    })}
                    <tr className="bg-slate-50 font-bold text-sm">
                      <td className="px-4 py-3 text-gray-900">TOTAL 10 ANS</td>
                      <td className="px-4 py-3 text-right">{MAD(totalCapital)}</td>
                      <td className="px-4 py-3 text-right text-emerald-600">{MAD(totalAuto)}</td>
                      <td className="px-4 py-3 text-right text-emerald-700">{MAD(lastPhase.ca_cible)}</td>
                      <td className="px-4 py-3 text-right text-blue-700">{lastPhase.roi}%</td>
                      <td className="px-4 py-3 text-right">{lastPhase.marge}%</td>
                      <td/>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── RÈGLE D'OR ── */}
        {activeTab==='regle'&&(
          <div className="space-y-5">
            <div className="bg-gradient-to-br from-emerald-700 to-emerald-600 rounded-2xl p-6 sm:p-8 text-white">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center shrink-0"><Shield size={28}/></div>
                <div>
                  <h2 className="text-2xl font-black mb-2">Règle d'Or — 40% Autofinancement</h2>
                  <p className="text-emerald-100 leading-relaxed">Avant chaque nouvelle phase d'expansion, Vita Fresh & ELT doivent justifier d'un autofinancement d'au moins <strong>40% du capital de la phase</strong>. Cette règle garantit la solidité financière et limite l'exposition aux financeurs externes.</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {phases.map(p=>{
                const pct=Math.round((p.autofinancement/p.capital)*100); const ok=pct>=40
                return(
                  <div key={p.id} className={`bg-white rounded-xl border shadow-sm p-4 ${ok?'border-emerald-200':'border-amber-200'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm text-white ${ok?'bg-emerald-500':'bg-amber-400'}`}>{p.id}</div>
                        <p className="font-semibold text-gray-900 text-sm">{p.label.split('—')[1]?.trim()}</p>
                      </div>
                      {ok?<CheckCircle2 size={18} className="text-emerald-500"/>:<AlertTriangle size={18} className="text-amber-500"/>}
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden mb-2">
                      <div className={`h-3 rounded-full transition-all ${ok?'bg-emerald-500':'bg-amber-400'}`} style={{width:`${Math.min(100,pct)}%`}}/>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className={`font-bold ${ok?'text-emerald-600':'text-amber-600'}`}>{pct}% autofinancé</span>
                      <span className="text-gray-400">{MAD(p.autofinancement)} / {MAD(p.capital)}</span>
                    </div>
                    <p className={`text-xs mt-1.5 font-medium ${ok?'text-emerald-600':'text-amber-600'}`}>{ok?'✓ Règle d\'or respectée — Phase débloquée':'⚠ Atteindre 40% avant de lancer'}</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
