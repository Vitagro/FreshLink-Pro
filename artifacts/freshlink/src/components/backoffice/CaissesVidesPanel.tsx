"use client"

import { useState, useEffect, useMemo } from "react"
import {
  store,
  CaisseVide, CaisseVideMouvement,
  CaisseReference, CaisseOrigine, CaisseTaille,
  CAISSE_ORIGINE_LABELS, computeCaisseSoldes,
} from "@/lib/store"
import {
  Package, ArrowDownCircle, ArrowUpCircle, RefreshCw,
  AlertTriangle, ChevronDown, ChevronUp, Globe2, MapPin, Plus
} from "lucide-react"

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const OPERATION_LABELS: Record<string, string> = {
  ctrl_achat:  "Contrôle Achat",
  reception:   "Réception",
  expedition:  "Expédition / BL",
  achat:       "Achat",
  retour:      "Retour livreur",
  manuel:      "Manuel",
  trip:        "Charges Trip",
  "ctrl_prep": "Contrôle Préparation",
  bl:          "Bon Livraison",
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-sync from all flows for today
// ─────────────────────────────────────────────────────────────────────────────

function syncCaissesFromFlows(today: string) {
  const existing = store.getCaissesMovements()
  const existingRefs = new Set(existing.map(m => m.referenceDoc))

  // 1 — BL (Bons Livraison) → sortie caisses vers clients
  const bls = store.getBonsLivraison().filter(bl => bl.date === today)
  for (const bl of bls) {
    const ref = `bl_${bl.id}`
    if (existingRefs.has(ref)) continue
    const gros = (bl as { nbCaisseGros?: number }).nbCaisseGros ?? 0
    const demi = (bl as { nbCaisseDemi?: number }).nbCaisseDemi ?? 0
    if (gros === 0 && demi === 0) continue
    store.addCaisseMouvement({
      id: store.genId(),
      date: today,
      typeOperation: "expedition",
      sens: "sortie",
      nbCaisseGros: gros,
      nbCaisseDemi: demi,
      referenceDoc: ref,
      articleNom: (bl as { clientNom?: string }).clientNom ?? "",
      operateurId: "auto",
      operateurNom: "Auto-BL",
      notes: `BL auto-sync — client: ${(bl as { clientNom?: string }).clientNom ?? bl.id}`,
    })
    existingRefs.add(ref)
  }

  // 2 — Retours → entrée caisses depuis livreur
  const retours = store.getRetours().filter(r => r.date === today)
  for (const retour of retours) {
    const ref = `retour_${retour.id}`
    if (existingRefs.has(ref)) continue
    const gros = (retour as { nbCaisseGros?: number }).nbCaisseGros ?? 0
    const demi = (retour as { nbCaisseDemi?: number }).nbCaisseDemi ?? 0
    if (gros === 0 && demi === 0) continue
    store.addCaisseMouvement({
      id: store.genId(),
      date: today,
      typeOperation: "retour",
      sens: "entree",
      nbCaisseGros: gros,
      nbCaisseDemi: demi,
      referenceDoc: ref,
      operateurId: "auto",
      operateurNom: "Auto-Retour",
      notes: `Retour auto-sync — livreur: ${retour.livreurNom ?? retour.id}`,
    })
    existingRefs.add(ref)
  }

  // 3 — Bons Préparation (ctrl_prep) → sortie caisses pour préparation
  const preps = store.getBonsPreparation().filter(p => p.date === today && p.statut === "valide")
  for (const prep of preps) {
    const ref = `prep_${prep.id}`
    if (existingRefs.has(ref)) continue
    const totalKg = prep.lignes.reduce((s, l) => s + (l.qteCommandee ?? 0), 0)
    const gros = Math.ceil(totalKg / 30)
    if (gros === 0) continue
    store.addCaisseMouvement({
      id: store.genId(),
      date: today,
      typeOperation: "expedition",
      sens: "sortie",
      nbCaisseGros: gros,
      nbCaisseDemi: 0,
      referenceDoc: ref,
      operateurId: "auto",
      operateurNom: "Auto-Prep",
      notes: `Bon prép auto-sync — ${prep.nom} (${totalKg.toLocaleString("fr-MA")} kg)`,
    })
    existingRefs.add(ref)
  }

  // 4 — Réceptions marché besoin achat → entrée caisses
  const receptions = store.getReceptions().filter(r => r.date === today)
  for (const rec of receptions) {
    const ref = `rec_${rec.id}`
    if (existingRefs.has(ref)) continue
    const gros = (rec as { nbCaisseGros?: number }).nbCaisseGros ?? 0
    const demi = (rec as { nbCaisseDemi?: number }).nbCaisseDemi ?? 0
    if (gros === 0 && demi === 0) continue
    store.addCaisseMouvement({
      id: store.genId(),
      date: today,
      typeOperation: "reception",
      sens: "entree",
      nbCaisseGros: gros,
      nbCaisseDemi: demi,
      referenceDoc: ref,
      operateurId: "auto",
      operateurNom: "Auto-Reception",
      notes: `Réception auto-sync — ${rec.id}`,
    })
    existingRefs.add(ref)
  }

  // 5 — Bons Achat (marché) → entrée caisses du marché
  const bonsAchat = store.getBonsAchat().filter(ba => ba.date === today)
  for (const ba of bonsAchat) {
    const ref = `ba_${ba.id}`
    if (existingRefs.has(ref)) continue
    const gros = (ba as { nbCaisseGros?: number }).nbCaisseGros ?? 0
    const demi = (ba as { nbCaisseDemi?: number }).nbCaisseDemi ?? 0
    if (gros === 0 && demi === 0) continue
    store.addCaisseMouvement({
      id: store.genId(),
      date: today,
      typeOperation: "achat",
      sens: "entree",
      nbCaisseGros: gros,
      nbCaisseDemi: demi,
      referenceDoc: ref,
      operateurId: "auto",
      operateurNom: "Auto-Achat",
      notes: `Bon achat auto-sync — ${(ba as { fournisseurNom?: string }).fournisseurNom ?? ba.id}`,
    })
    existingRefs.add(ref)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────────────────────────

function CaisseCard({ caisse }: { caisse: CaisseVide }) {
  const total = caisse.stock + (caisse.enCirculation ?? 0)
  const pctCirculation = total > 0 ? Math.round(((caisse.enCirculation ?? 0) / total) * 100) : 0
  const low = caisse.stock < 5

  return (
    <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: "#0f1623", border: `1px solid ${low ? "#3b1515" : "#1a2535"}` }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#0a0f18" }}>
            <Package className="w-4.5 h-4.5" style={{ color: caisse.type === "gros" ? "#f59e0b" : "#06b6d4" }} />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: "#f1f5f9" }}>{caisse.libelle}</p>
            <p className="text-xs" style={{ color: "#4b5563" }}>Capacité {caisse.capaciteKg} kg</p>
          </div>
        </div>
        {low && <AlertTriangle className="w-4 h-4 text-red-400" />}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { l: "En stock", v: caisse.stock, c: low ? "#ef4444" : "#10b981" },
          { l: "En circulation", v: caisse.enCirculation ?? 0, c: "#f59e0b" },
          { l: "Total", v: total, c: "#94a3b8" },
        ].map(({ l, v, c }) => (
          <div key={l} className="rounded-xl py-2 px-1" style={{ background: "#0a0f18" }}>
            <p className="text-xs" style={{ color: "#4b5563" }}>{l}</p>
            <p className="text-lg font-bold" style={{ color: c }}>{v}</p>
          </div>
        ))}
      </div>

      {/* Progress: en circulation */}
      {total > 0 && (
        <div>
          <div className="flex justify-between text-xs mb-1" style={{ color: "#374151" }}>
            <span>En circulation</span>
            <span>{pctCirculation}%</span>
          </div>
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "#1a2535" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${pctCirculation}%`, background: "#f59e0b" }} />
          </div>
        </div>
      )}
    </div>
  )
}

function MouvementRow({ m }: { m: CaisseVideMouvement }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 text-xs" style={{ borderBottom: "1px solid #1a253520" }}>
      <div className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 ${m.sens === "sortie" ? "bg-red-900/30" : "bg-emerald-900/30"}`}>
        {m.sens === "sortie"
          ? <ArrowUpCircle className="w-4 h-4 text-red-400" />
          : <ArrowDownCircle className="w-4 h-4 text-emerald-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate" style={{ color: "#e2e8f0" }}>
          {OPERATION_LABELS[m.typeOperation] ?? m.typeOperation}
          {m.articleNom && <span style={{ color: "#4b5563" }}> — {m.articleNom}</span>}
        </p>
        <p style={{ color: "#374151" }}>{m.notes ?? m.referenceDoc ?? "—"}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p style={{ color: m.sens === "sortie" ? "#f87171" : "#6ee7b7" }}>
          {m.sens === "sortie" ? "−" : "+"}{m.nbCaisseGros}G / {m.nbCaisseDemi}D
        </p>
        <p style={{ color: "#374151" }}>{m.date}</p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Panel
// ─────────────────────────────────────────────────────────────────────────────

export default function CaissesVidesPanel() {
  const today = store.today()
  const [caisses, setCaisses] = useState<CaisseVide[]>([])
  const [mouvements, setMouvements] = useState<CaisseVideMouvement[]>([])
  const [references, setReferences] = useState<CaisseReference[]>([])
  const [syncing, setSyncing] = useState(false)
  const [showManuel, setShowManuel] = useState(false)
  const [showAllMvts, setShowAllMvts] = useState(false)
  const [showRefs, setShowRefs] = useState(false)
  const [newRef, setNewRef] = useState<{ code: string; taille: CaisseTaille; origine: CaisseOrigine }>({ code: "", taille: "petit", origine: "locale" })
  const [manualForm, setManualForm] = useState<{
    typeOperation: CaisseVideMouvement["typeOperation"]
    sens: "sortie" | "entree"
    nbCaisseGros: number
    nbCaisseDemi: number
    notes: string
    referenceId: string
    quantite: number
    origine: CaisseOrigine
  }>({ typeOperation: "manuel", sens: "sortie", nbCaisseGros: 0, nbCaisseDemi: 0, notes: "", referenceId: "", quantite: 0, origine: "locale" })

  const reload = () => {
    setCaisses(store.getCaissesVides())
    setMouvements(store.getCaissesMovements())
    setReferences(store.getCaisseReferences())
  }

  const soldes = useMemo(() => computeCaisseSoldes(mouvements, references), [mouvements, references])
  const soldesParOrigine = useMemo(() => {
    const acc: Record<CaisseOrigine, number> = { locale: 0, etranger_achat: 0, etranger_expedition: 0 }
    for (const l of soldes) acc[l.origine] += l.solde
    return acc
  }, [soldes])

  // Auto-sync on mount
  useEffect(() => {
    syncCaissesFromFlows(today)
    reload()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSync = () => {
    setSyncing(true)
    syncCaissesFromFlows(today)
    setTimeout(() => { reload(); setSyncing(false) }, 300)
  }

  const saveManual = () => {
    const hasLegacy = manualForm.nbCaisseGros > 0 || manualForm.nbCaisseDemi > 0
    const hasRef = !!manualForm.referenceId && manualForm.quantite > 0
    if (!hasLegacy && !hasRef) return
    store.addCaisseMouvement({
      id: store.genId(),
      date: today,
      typeOperation: manualForm.typeOperation,
      sens: manualForm.sens,
      nbCaisseGros: manualForm.nbCaisseGros,
      nbCaisseDemi: manualForm.nbCaisseDemi,
      referenceId: manualForm.referenceId || undefined,
      quantite: manualForm.referenceId ? manualForm.quantite : undefined,
      origine: manualForm.origine,
      operateurId: "user",
      operateurNom: "Saisie manuelle",
      notes: manualForm.notes || undefined,
    })
    setManualForm({ typeOperation: "manuel", sens: "sortie", nbCaisseGros: 0, nbCaisseDemi: 0, notes: "", referenceId: "", quantite: 0, origine: "locale" })
    setShowManuel(false)
    reload()
  }

  const addReference = () => {
    if (!newRef.code.trim()) return
    const label = `Référence ${newRef.code.trim()} ${newRef.taille === "petit" ? "Petit" : "Grand"}`
    store.addCaisseReference({
      id: store.genId(), code: newRef.code.trim(), taille: newRef.taille,
      label, origine: newRef.origine, actif: true,
    })
    setNewRef({ code: "", taille: "petit", origine: "locale" })
    reload()
  }

  const toggleReferenceActif = (r: CaisseReference) => {
    store.updateCaisseReference(r.id, { actif: !r.actif })
    reload()
  }

  const todayMvts = mouvements.filter(m => m.date === today)
  const allMvts = showAllMvts ? mouvements : todayMvts

  const totalSortieGros = todayMvts.filter(m => m.sens === "sortie").reduce((s, m) => s + m.nbCaisseGros, 0)
  const totalEntreeGros = todayMvts.filter(m => m.sens === "entree").reduce((s, m) => s + m.nbCaisseGros, 0)

  return (
    <div className="h-full flex flex-col gap-4 p-4" style={{ background: "#080c14" }}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-bold" style={{ color: "#f1f5f9" }}>
            Gestion Caisses Vides <span style={{ color: "#374151" }}>/ الصناديق الفارغة</span>
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "#374151" }}>
            Auto-synchronisé depuis: Marché · Contrôle Marché · Réception · Contrôle Préparation · BL · Retours
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleSync}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: "#0d2e18", color: "#6ee7b7", border: "1px solid #15352a" }}>
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Sync..." : "Re-sync"}
          </button>
          <button onClick={() => setShowRefs(!showRefs)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: "#1e293b", color: "#c4b5fd", border: "1px solid #2e2a4a" }}>
            <Globe2 className="w-3.5 h-3.5" />
            Références &amp; Origine
          </button>
          <button onClick={() => setShowManuel(!showManuel)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
            style={{ background: "#1d4ed8" }}>
            Mouvement Manuel
          </button>
        </div>
      </div>

      {/* Today stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { l: "Sorties Gros Auj.", v: totalSortieGros, c: "#ef4444" },
          { l: "Entrées Gros Auj.", v: totalEntreeGros, c: "#10b981" },
          { l: "Mouvements Auj.", v: todayMvts.length, c: "#06b6d4" },
          { l: "Mouvements Total", v: mouvements.length, c: "#f59e0b" },
        ].map(s => (
          <div key={s.l} className="rounded-xl p-3 flex items-center justify-between" style={{ background: "#0f1623", border: "1px solid #1a2535" }}>
            <p className="text-xs" style={{ color: "#4b5563" }}>{s.l}</p>
            <p className="text-sm font-bold" style={{ color: s.c }}>{s.v}</p>
          </div>
        ))}
      </div>

      {/* Solde par origine — Locale / Étranger Achat / Étranger Expédition */}
      <div className="grid grid-cols-3 gap-3">
        {(Object.keys(CAISSE_ORIGINE_LABELS) as CaisseOrigine[]).map(o => (
          <div key={o} className="rounded-xl p-3 flex flex-col gap-1" style={{ background: "#0f1623", border: "1px solid #1a2535" }}>
            <div className="flex items-center gap-1.5">
              {o === "locale" ? <MapPin className="w-3.5 h-3.5" style={{ color: "#60a5fa" }} /> : <Globe2 className="w-3.5 h-3.5" style={{ color: "#f59e0b" }} />}
              <p className="text-[11px]" style={{ color: "#4b5563" }}>{CAISSE_ORIGINE_LABELS[o]}</p>
            </div>
            <p className="text-lg font-bold" style={{ color: soldesParOrigine[o] < 0 ? "#f87171" : "#e2e8f0" }}>
              {soldesParOrigine[o]} <span className="text-xs font-normal" style={{ color: "#4b5563" }}>caisses</span>
            </p>
          </div>
        ))}
      </div>

      {/* Références & gestion — code, taille, origine par défaut */}
      {showRefs && (
        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #2e2a4a" }}>
          <div className="px-4 py-3" style={{ background: "#151129", borderBottom: "1px solid #2e2a4a" }}>
            <p className="text-xs font-bold" style={{ color: "#c4b5fd" }}>Références de caisses (ex: &laquo; 226 Petit &raquo;, &laquo; 226 Grand &raquo;)</p>
          </div>
          <div className="p-4 flex flex-col gap-3" style={{ background: "#0f1623" }}>
            <div className="grid grid-cols-4 gap-2 items-end">
              <div>
                <p className="text-xs mb-1" style={{ color: "#4b5563" }}>Code référence</p>
                <input value={newRef.code} onChange={e => setNewRef(f => ({ ...f, code: e.target.value }))}
                  placeholder="ex: 226"
                  className="w-full px-3 py-2 rounded-xl text-xs outline-none" style={{ background: "#0a0f18", border: "1px solid #1a2535", color: "#e2e8f0" }} />
              </div>
              <div>
                <p className="text-xs mb-1" style={{ color: "#4b5563" }}>Taille</p>
                <select value={newRef.taille} onChange={e => setNewRef(f => ({ ...f, taille: e.target.value as CaisseTaille }))}
                  className="w-full px-3 py-2 rounded-xl text-xs outline-none" style={{ background: "#0a0f18", border: "1px solid #1a2535", color: "#e2e8f0" }}>
                  <option value="petit">Petit</option>
                  <option value="grand">Grand</option>
                </select>
              </div>
              <div>
                <p className="text-xs mb-1" style={{ color: "#4b5563" }}>Origine par défaut</p>
                <select value={newRef.origine} onChange={e => setNewRef(f => ({ ...f, origine: e.target.value as CaisseOrigine }))}
                  className="w-full px-3 py-2 rounded-xl text-xs outline-none" style={{ background: "#0a0f18", border: "1px solid #1a2535", color: "#e2e8f0" }}>
                  {Object.entries(CAISSE_ORIGINE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <button onClick={addReference}
                className="flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-bold text-white" style={{ background: "#7c3aed" }}>
                <Plus className="w-3.5 h-3.5" /> Ajouter
              </button>
            </div>
            <div className="flex flex-col gap-1.5">
              {references.length === 0 && <p className="text-xs text-center py-3" style={{ color: "#374151" }}>Aucune référence configurée.</p>}
              {references.map(r => (
                <div key={r.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl" style={{ background: "#0a0f18", border: "1px solid #1a2535" }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-semibold" style={{ color: r.actif ? "#e2e8f0" : "#4b5563" }}>{r.label}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: "#1a2535", color: "#94a3b8" }}>{CAISSE_ORIGINE_LABELS[r.origine]}</span>
                  </div>
                  <button onClick={() => toggleReferenceActif(r)}
                    className="px-2 py-1 rounded-lg text-[10px] font-bold flex-shrink-0"
                    style={{ background: r.actif ? "#0d2e18" : "#2e1515", color: r.actif ? "#6ee7b7" : "#f87171" }}>
                    {r.actif ? "Actif" : "Inactif"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Solde par référence */}
      {soldes.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #1a2535" }}>
          <div className="px-4 py-3" style={{ background: "#0a0f18", borderBottom: "1px solid #1a2535" }}>
            <p className="text-xs font-semibold" style={{ color: "#94a3b8" }}>Solde de caisses par référence</p>
          </div>
          <div className="divide-y" style={{ borderColor: "#1a253520" }}>
            {soldes.map(l => (
              <div key={l.referenceId} className="flex items-center justify-between px-4 py-2.5 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span style={{ color: "#e2e8f0" }}>{l.referenceLabel}</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: "#1a2535", color: "#94a3b8" }}>{l.taille === "petit" ? "Petit" : "Grand"}</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: "#1a2535", color: "#94a3b8" }}>{CAISSE_ORIGINE_LABELS[l.origine]}</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0" style={{ color: "#4b5563" }}>
                  <span>+{l.entree}</span>
                  <span>−{l.sortie}</span>
                  <span className="font-bold" style={{ color: l.solde < 0 ? "#f87171" : "#6ee7b7" }}>= {l.solde}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Caisse cards */}
      <div className="grid grid-cols-2 gap-3">
        {caisses.map(c => <CaisseCard key={c.id} caisse={c} />)}
        {caisses.length === 0 && (
          <div className="col-span-2 text-center py-8 text-xs" style={{ color: "#374151" }}>
            Aucune caisse configurée — vérifiez le stock initial
          </div>
        )}
      </div>

      {/* Manual movement form */}
      {showManuel && (
        <div className="rounded-2xl p-4 space-y-3" style={{ background: "#0f1623", border: "1px solid #1a2535" }}>
          <p className="text-xs font-bold" style={{ color: "#94a3b8" }}>Mouvement Manuel</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs mb-1" style={{ color: "#4b5563" }}>Type opération</p>
              <select value={manualForm.typeOperation}
                onChange={e => setManualForm(f => ({ ...f, typeOperation: e.target.value as CaisseVideMouvement["typeOperation"] }))}
                className="w-full px-3 py-2 rounded-xl text-xs outline-none" style={{ background: "#0a0f18", border: "1px solid #1a2535", color: "#e2e8f0" }}>
                {Object.entries(OPERATION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: "#4b5563" }}>Sens</p>
              <select value={manualForm.sens}
                onChange={e => setManualForm(f => ({ ...f, sens: e.target.value as "sortie" | "entree" }))}
                className="w-full px-3 py-2 rounded-xl text-xs outline-none" style={{ background: "#0a0f18", border: "1px solid #1a2535", color: "#e2e8f0" }}>
                <option value="sortie">Sortie (vers livreur/client)</option>
                <option value="entree">Entrée (retour livreur/marché)</option>
              </select>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: "#4b5563" }}>Nb Gros Caisses</p>
              <input type="number" min={0} value={manualForm.nbCaisseGros || ""}
                onChange={e => setManualForm(f => ({ ...f, nbCaisseGros: +e.target.value }))}
                className="w-full px-3 py-2 rounded-xl text-xs outline-none" style={{ background: "#0a0f18", border: "1px solid #1a2535", color: "#e2e8f0" }} />
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: "#4b5563" }}>Nb Demi Caisses</p>
              <input type="number" min={0} value={manualForm.nbCaisseDemi || ""}
                onChange={e => setManualForm(f => ({ ...f, nbCaisseDemi: +e.target.value }))}
                className="w-full px-3 py-2 rounded-xl text-xs outline-none" style={{ background: "#0a0f18", border: "1px solid #1a2535", color: "#e2e8f0" }} />
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: "#4b5563" }}>Référence (optionnel)</p>
              <select value={manualForm.referenceId}
                onChange={e => setManualForm(f => ({ ...f, referenceId: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl text-xs outline-none" style={{ background: "#0a0f18", border: "1px solid #1a2535", color: "#e2e8f0" }}>
                <option value="">— Aucune (gros/demi générique) —</option>
                {references.filter(r => r.actif).map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>
            {manualForm.referenceId && (
              <div>
                <p className="text-xs mb-1" style={{ color: "#4b5563" }}>Nb caisses (référence)</p>
                <input type="number" min={0} value={manualForm.quantite || ""}
                  onChange={e => setManualForm(f => ({ ...f, quantite: +e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl text-xs outline-none" style={{ background: "#0a0f18", border: "1px solid #1a2535", color: "#e2e8f0" }} />
              </div>
            )}
            <div>
              <p className="text-xs mb-1" style={{ color: "#4b5563" }}>Origine</p>
              <select value={manualForm.origine}
                onChange={e => setManualForm(f => ({ ...f, origine: e.target.value as CaisseOrigine }))}
                className="w-full px-3 py-2 rounded-xl text-xs outline-none" style={{ background: "#0a0f18", border: "1px solid #1a2535", color: "#e2e8f0" }}>
                {Object.entries(CAISSE_ORIGINE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div>
            <p className="text-xs mb-1" style={{ color: "#4b5563" }}>Notes</p>
            <input value={manualForm.notes}
              onChange={e => setManualForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Observations..."
              className="w-full px-3 py-2 rounded-xl text-xs outline-none" style={{ background: "#0a0f18", border: "1px solid #1a2535", color: "#e2e8f0" }} />
          </div>
          <button onClick={saveManual} className="w-full py-2 rounded-xl text-xs font-bold text-white" style={{ background: "#15803d" }}>
            Enregistrer Mouvement
          </button>
        </div>
      )}

      {/* Movements history */}
      <div className="rounded-2xl overflow-hidden flex-1" style={{ border: "1px solid #1a2535" }}>
        <button
          className="w-full flex items-center justify-between px-4 py-3"
          style={{ background: "#0a0f18", borderBottom: "1px solid #1a2535" }}
          onClick={() => setShowAllMvts(!showAllMvts)}>
          <p className="text-xs font-semibold" style={{ color: "#94a3b8" }}>
            Historique mouvements {showAllMvts ? "(tous)" : "(aujourd'hui)"}
            <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px]" style={{ background: "#1a2535", color: "#60a5fa" }}>
              {allMvts.length}
            </span>
          </p>
          {showAllMvts ? <ChevronUp className="w-4 h-4" style={{ color: "#374151" }} /> : <ChevronDown className="w-4 h-4" style={{ color: "#374151" }} />}
        </button>
        <div className="overflow-y-auto" style={{ maxHeight: 320 }}>
          {allMvts.length === 0
            ? <p className="text-center py-8 text-xs" style={{ color: "#374151" }}>Aucun mouvement {showAllMvts ? "" : "aujourd'hui"}</p>
            : allMvts.map((m, i) => <MouvementRow key={i} m={m} />)}
        </div>
      </div>
    </div>
  )
}
