"use client"

import { useState, useEffect } from "react"
import { store, type User, type BonPreparation, type BonLivraison, type ContenantTare } from "@/lib/store"

interface Props { user: User }

function StatusBadge({ s }: { s: BonPreparation["statut"] }) {
  const map = { brouillon: "bg-gray-100 text-gray-700", en_cours: "bg-amber-100 text-amber-800", valide: "bg-green-100 text-green-700" }
  const labels = { brouillon: "Brouillon", en_cours: "En cours", valide: "Validé" }
  return <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${map[s]}`}>{labels[s]}</span>
}

// Auto-generate un BonLivraison INDIVIDUEL PAR CLIENT depuis une préparation
// validée — jamais un BL mélangeant deux clients différents. Exception : si
// UN client a plusieurs commandes dans cette préparation, elles sont
// REGROUPÉES sur un seul et même BL (commandeIds liste tous les numéros
// d'origine — jamais un seul commandeId qui en oublierait deux sur trois).
export function autoGenerateBLs(bon: BonPreparation, operateurId: string, operateurNom: string): BonLivraison[] {
  const trips = store.getTrips()
  const trip = bon.tripId ? trips.find(t => t.id === bon.tripId) : null
  const commandes = store.getCommandes()
  const existingBLs = store.getBonsLivraison()
  const tripKey = bon.tripId ?? `PREP-${bon.id}`

  // Un client par entrée de bon.clientsInfo (ou, à défaut, par clientIds) —
  // jamais une seule ligne agrégeant tous les clients de la préparation.
  const clientEntries = (bon.clientsInfo?.length ? bon.clientsInfo.map(ci => ({ clientId: ci.clientId, clientNom: ci.clientNom, secteur: ci.secteur, zone: ci.zone }))
    : bon.clientIds.map(id => {
        const c = commandes.find(cm => cm.clientId === id)
        return { clientId: id, clientNom: c?.clientNom ?? id, secteur: c?.secteur ?? "", zone: c?.zone ?? "" }
      }))

  const y = new Date().getFullYear()
  let seqThisYear = existingBLs.filter(b => ((b as unknown as { numero?: string }).numero ?? b.id).includes(`BL-${y}`)).length
  const created: BonLivraison[] = []

  // Ratio de repli, PAR ARTICLE, à appliquer uniquement aux clients SANS
  // suivi précis (qtesPreparedParClient) — jamais le ratio global brut
  // (qtePrepared/qteCommandee) appliqué à tout le monde : ça sur-attribuerait
  // la marchandise déjà comptée en exact pour d'autres clients (ex: 12kg
  // réellement préparés, mais 16kg répartis sur les BL si un client précis
  // à 12kg ET un client au ratio global 40% se cumulent sur la même ligne).
  // On retire donc du total préparé ce qui est déjà attribué en exact, et on
  // ne reproratise que sur la part commandée des clients restants.
  const remainderRatioByArticle = new Map<string, number>()
  for (const l of bon.lignes) {
    const preciseSum = clientEntries.reduce((s, ce) => s + (l.qtesPreparedParClient?.[ce.clientId] ?? 0), 0)
    const remainderOrdered = clientEntries.reduce((s, ce) => {
      const hasPrecise = l.qtesPreparedParClient?.[ce.clientId] !== undefined
      return hasPrecise ? s : s + (l.qtesParClient[ce.clientId] ?? 0)
    }, 0)
    const remainderPrepared = Math.max(0, l.qtePrepared - preciseSum)
    const fallbackRatio = l.qteCommandee > 0 ? l.qtePrepared / l.qteCommandee : 1
    remainderRatioByArticle.set(l.articleId, remainderOrdered > 0 ? remainderPrepared / remainderOrdered : fallbackRatio)
  }

  for (const ce of clientEntries) {
    const alreadyExists = existingBLs.some(bl => {
      const blTripId = (bl as unknown as { tripId?: string }).tripId ?? ""
      return blTripId === tripKey && (bl.clientId === ce.clientId || bl.clientNom === ce.clientNom)
    })
    if (alreadyExists) continue

    // TOUTES les commandes de ce client dans cette prépa — pas seulement la
    // première trouvée — pour ne perdre aucun numéro de commande d'origine.
    const cmdsClient = commandes.filter(c => c.clientId === ce.clientId && c.statut !== "refuse" && c.statut !== "retour")
    const cmd = cmdsClient[0]

    // Quantité par client : priorité à qtesPreparedParClient (montant RÉEL
    // préparé pour CE client — précis même si la prépa est incomplète/en
    // rupture partielle sur certains clients seulement) ; à défaut (anciennes
    // préparations sans suivi par client, ou ligne complétée en bloc via
    // "Valider tout"), on retombe sur le prorata qtePrepared/qteCommandee
    // appliqué à la part commandée de ce client.
    const lignesBL: BonLivraison["lignes"] = bon.lignes
      .filter(l => (l.qtesParClient[ce.clientId] ?? 0) > 0)
      .map(l => {
        const ordered = l.qtesParClient[ce.clientId] ?? 0
        const preciseQte = l.qtesPreparedParClient?.[ce.clientId]
        const ratio = remainderRatioByArticle.get(l.articleId) ?? 1
        const qte = preciseQte !== undefined
          ? Math.round(preciseQte * 100) / 100
          : Math.round(ordered * ratio * 100) / 100
        // Cherche le prix dans N'IMPORTE LAQUELLE des commandes groupées.
        let prixUnitaire = 0
        for (const c of cmdsClient) {
          const cl = c.lignes.find(cl => cl.articleId === l.articleId)
          if (cl) { prixUnitaire = cl.prixVente ?? cl.prixUnitaire ?? 0; break }
        }
        return { articleNom: l.articleNom, unite: l.unite, quantite: qte, prixUnitaire, total: qte * prixUnitaire }
      })
    if (lignesBL.length === 0) continue

    const livreurNom = trip?.livreurNom ?? "Non assigne"
    const prev = store.getUsers().find(u => u.id === cmd?.commercialId)
    const prevendeurNom = prev?.name ?? cmd?.commercialNom ?? operateurNom
    const montantTotal = lignesBL.reduce((s, l) => s + l.total, 0)

    seqThisYear += 1
    const commandeIds = cmdsClient.length ? cmdsClient.map(c => c.id) : [`${bon.id}-${ce.clientId}`]
    const newBL = {
      id: store.genBL(),
      date: store.today(),
      tripId: tripKey,
      commandeId: commandeIds[0],
      commandeIds,
      clientId: ce.clientId,
      clientNom: ce.clientNom,
      secteur: ce.secteur,
      zone: ce.zone,
      livreurNom,
      prevendeurNom,
      lignes: lignesBL,
      montantTotal,
      tva: 0,
      montantTTC: montantTotal,
      statut: "émis" as const,
      statutLivraison: "premier_passage" as const,
      numero: `BL-${y}-${String(seqThisYear).padStart(4, "0")}`,
      createdBy: operateurId,
      updatedAt: new Date().toISOString(),
    } as BonLivraison
    created.push(newBL)
  }

  if (created.length) store.saveBonsLivraison([...existingBLs, ...created])
  return created
}

export default function MobilePreparation({ user }: Props) {
  const [bons, setBons] = useState<BonPreparation[]>([])
  const [activeBon, setActiveBon] = useState<BonPreparation | null>(null)
  const [localQtys, setLocalQtys] = useState<Record<string, number>>({})
  const [generatedBLs, setGeneratedBLs] = useState<BonLivraison[]>([])
  // Pesée brut → net (même logique que la réception : poids brut − tares contenants)
  const [contenants, setContenants] = useState<ContenantTare[]>([])
  const [showPesee, setShowPesee] = useState<Record<string, boolean>>({})
  const [caisseGros, setCaisseGros] = useState<Record<string, string>>({})
  const [caisseDemi, setCaisseDemi] = useState<Record<string, string>>({})
  const [brutPoids, setBrutPoids] = useState<Record<string, string>>({})

  const contenantGros = contenants.find(c => c.nom.toLowerCase().includes("gros") || c.nom.toLowerCase().includes("plastique"))
  const contenantDemi = contenants.find(c => c.nom.toLowerCase().includes("demi") || c.nom.toLowerCase().includes("petit"))

  // Net = brut − (nb caisses × poids unitaire du contenant). Identique à la réception.
  const calcNetPrep = (artId: string): number => {
    const brut = Number(brutPoids[artId]) || 0
    const tare = (Number(caisseGros[artId] ?? 0)) * (contenantGros?.poidsKg ?? 2.8)
              + (Number(caisseDemi[artId] ?? 0)) * (contenantDemi?.poidsKg ?? 2.0)
    return Math.max(0, Math.round((brut - tare) * 100) / 100)
  }

  // Un bon assigné à un préparateur précis (preparateurId) ne doit encombrer
  // que sa liste — les bons non assignés restent visibles de tous, pour ne
  // jamais bloquer un travail urgent faute d'assignation explicite.
  const forMe = (b: BonPreparation) => !b.preparateurId || b.preparateurId === user.id

  useEffect(() => {
    const all = store.getBonsPreparation()
    // Livreurs and magasiniers see only in_cours or brouillon bons
    const relevant = all.filter(b => (b.statut !== "valide" || b.format === "numerique") && forMe(b))
    setBons(relevant)
    setContenants(store.getContenantsConfig().filter(c => c.actif))
  }, [])

  const refresh = () => {
    const all = store.getBonsPreparation().filter(forMe)
    setBons(all)
    if (activeBon) {
      const updated = all.find(b => b.id === activeBon.id)
      if (updated) setActiveBon(updated)
    }
  }

  const openBon = (bon: BonPreparation) => {
    setActiveBon(bon)
    setLocalQtys(Object.fromEntries(bon.lignes.map(l => [l.articleId, l.qtePrepared || l.qteCommandee])))
  }

  const validateLigne = (articleId: string) => {
    if (!activeBon) return
    const arr = store.getBonsPreparation()
    const idx = arr.findIndex(b => b.id === activeBon.id)
    if (idx < 0) return
    const lignIdx = arr[idx].lignes.findIndex(l => l.articleId === articleId)
    if (lignIdx < 0) return
    arr[idx].lignes[lignIdx].qtePrepared = localQtys[articleId] ?? arr[idx].lignes[lignIdx].qteCommandee
    arr[idx].lignes[lignIdx].valide = true
    const gros = Number(caisseGros[articleId]) || 0
    const demi = Number(caisseDemi[articleId]) || 0
    if (gros > 0) arr[idx].lignes[lignIdx].nbCaisseGros = gros
    if (demi > 0) arr[idx].lignes[lignIdx].nbCaisseDemi = demi
    // auto-validate bon if all lignes done
    const allDone = arr[idx].lignes.every(l => l.valide)
    if (allDone) {
      arr[idx].statut = "valide"
      arr[idx].validatedAt = new Date().toISOString()
      arr[idx].validatedBy = user.id
    } else {
      arr[idx].statut = "en_cours"
    }
    store.saveBonsPreparation(arr)
    refresh()
  }

  const [validating, setValidating] = useState(false)
  const validateAll = () => {
    if (!activeBon || validating) return // anti double-clic — jamais deux validations/deux jeux de BL
    setValidating(true)
    const arr = store.getBonsPreparation()
    const idx = arr.findIndex(b => b.id === activeBon.id)
    if (idx < 0) { setValidating(false); return }
    arr[idx].lignes = arr[idx].lignes.map(l => {
      const gros = Number(caisseGros[l.articleId]) || 0
      const demi = Number(caisseDemi[l.articleId]) || 0
      return {
        ...l,
        qtePrepared: localQtys[l.articleId] ?? l.qteCommandee,
        valide: true,
        nbCaisseGros: gros > 0 ? gros : l.nbCaisseGros,
        nbCaisseDemi: demi > 0 ? demi : l.nbCaisseDemi,
      }
    })
    arr[idx].statut = "valide"
    arr[idx].validatedAt = new Date().toISOString()
    arr[idx].validatedBy = user.id
    store.saveBonsPreparation(arr)

    // Auto-generate un BL par client instantanement apres validation
    // Works for both digital and paper formats — no manual re-entry required
    const bls = autoGenerateBLs(arr[idx], user.id, user.name)
    setGeneratedBLs(bls)

    setValidating(false)
    refresh()
  }

  // ============================================================
  // ACTIVE BON VIEW
  // ============================================================
  if (activeBon) {
    const validated = activeBon.lignes.filter(l => l.valide).length
    const total = activeBon.lignes.length
    const progress = total > 0 ? Math.round((validated / total) * 100) : 0

    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-border flex items-center gap-3 sticky top-0 bg-background z-10">
          <button onClick={() => setActiveBon(null)}
            className="p-2 rounded-xl hover:bg-muted text-muted-foreground shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-foreground truncate">{activeBon.nom}</p>
            <p className="text-xs text-muted-foreground">{activeBon.date}</p>
          </div>
          <StatusBadge s={activeBon.statut} />
        </div>

        {/* Progress bar */}
        <div className="px-4 pt-3 pb-1">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-muted-foreground">Progression</span>
            <span className="font-bold text-foreground">{validated}/{total} articles</span>
          </div>
          <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progress}%`,
                background: progress === 100 ? "oklch(0.50 0.18 155)" : "oklch(0.60 0.16 195)"
              }} />
          </div>
        </div>

        {/* Lignes */}
        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
          {activeBon.lignes.map((ligne) => (
            <div key={ligne.articleId}
              className={`rounded-2xl border p-4 transition-all ${ligne.valide ? "border-green-200 bg-green-50" : "border-border bg-card"}`}>
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${ligne.valide ? "bg-green-500" : "bg-muted"}`}>
                  {ligne.valide
                    ? <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                    : <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" /></svg>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-foreground">{ligne.articleNom}</p>
                  <p className="text-xs text-muted-foreground mb-3">
                    A préparer : <strong>{ligne.qteCommandee.toFixed(1)} {ligne.unite}</strong>
                  </p>
                  {/* Quantity input — always editable until bon is fully validated */}
                  {activeBon.statut !== "valide" && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground shrink-0">Qté préparée :</span>
                      <input
                        type="number"
                        value={localQtys[ligne.articleId] ?? ligne.qteCommandee}
                        onChange={e => setLocalQtys(prev => ({ ...prev, [ligne.articleId]: parseFloat(e.target.value) || 0 }))}
                        className={`w-24 px-3 py-2 rounded-xl border text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-primary ${ligne.valide ? "border-green-300 bg-green-50 text-green-800" : "border-border bg-background"}`}
                        min={0} step={0.5}
                      />
                      <span className="text-xs text-muted-foreground">{ligne.unite}</span>
                      {ligne.valide && (
                        <span className="text-[10px] text-amber-600 font-semibold">(rectifier si besoin)</span>
                      )}
                    </div>
                  )}

                  {/* Pesée brut → net (même logique que la réception) */}
                  {activeBon.statut !== "valide" && (
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => setShowPesee(p => ({ ...p, [ligne.articleId]: !p[ligne.articleId] }))}
                        className="flex items-center gap-1.5 text-[11px] font-bold text-blue-700">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9M18 7l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg>
                        {showPesee[ligne.articleId] ? "Masquer la pesée" : "Peser (brut → net)"}
                      </button>
                      {showPesee[ligne.articleId] && (
                        <div className="mt-2 rounded-xl border border-blue-200 bg-blue-50/60 p-3 flex flex-col gap-2">
                          <div className="grid grid-cols-3 gap-2">
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-slate-600">Poids brut (kg)</label>
                              <input type="number" min={0} step={0.1}
                                value={brutPoids[ligne.articleId] ?? ""}
                                onChange={e => setBrutPoids(p => ({ ...p, [ligne.articleId]: e.target.value }))}
                                className="px-2 py-1.5 rounded-lg border border-border bg-background text-sm font-bold text-center" placeholder="0" />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-slate-600">Caisses gros{contenantGros ? ` (${contenantGros.poidsKg}kg)` : ""}</label>
                              <input type="number" min={0} step={1}
                                value={caisseGros[ligne.articleId] ?? ""}
                                onChange={e => setCaisseGros(p => ({ ...p, [ligne.articleId]: e.target.value }))}
                                className="px-2 py-1.5 rounded-lg border border-border bg-background text-sm font-bold text-center" placeholder="0" />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-slate-600">Caisses demi{contenantDemi ? ` (${contenantDemi.poidsKg}kg)` : ""}</label>
                              <input type="number" min={0} step={1}
                                value={caisseDemi[ligne.articleId] ?? ""}
                                onChange={e => setCaisseDemi(p => ({ ...p, [ligne.articleId]: e.target.value }))}
                                className="px-2 py-1.5 rounded-lg border border-border bg-background text-sm font-bold text-center" placeholder="0" />
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-2 pt-1 border-t border-blue-200">
                            <span className="text-xs font-bold text-slate-700">
                              Net = brut − tares = <span className="text-blue-800">{calcNetPrep(ligne.articleId).toFixed(2)} kg</span>
                            </span>
                            <button type="button"
                              onClick={() => setLocalQtys(prev => ({ ...prev, [ligne.articleId]: calcNetPrep(ligne.articleId) }))}
                              className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-white bg-blue-600">
                              Utiliser le net
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {activeBon.statut === "valide" && ligne.valide && (
                    <p className="text-sm font-bold text-green-700">
                      Preparé : {ligne.qtePrepared.toFixed(1)} {ligne.unite}
                      {ligne.qtePrepared !== ligne.qteCommandee && (
                        <span className="text-amber-500 font-normal ml-2">
                          (ecart : {(ligne.qtePrepared - ligne.qteCommandee).toFixed(1)})
                        </span>
                      )}
                      {((ligne.nbCaisseGros ?? 0) > 0 || (ligne.nbCaisseDemi ?? 0) > 0) && (
                        <span className="block text-xs font-semibold text-blue-700 mt-0.5">
                          🧺 {ligne.nbCaisseGros ?? 0} gros + {ligne.nbCaisseDemi ?? 0} demi
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </div>
              {activeBon.statut !== "valide" && !ligne.valide && (
                <button onClick={() => validateLigne(ligne.articleId)}
                  className="w-full mt-3 py-2.5 rounded-xl text-sm font-bold text-white"
                  style={{ background: "oklch(0.38 0.2 260)" }}>
                  Confirmer cet article
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        {activeBon.statut !== "valide" && (
          <div className="px-4 py-4 border-t border-border bg-card shrink-0">
            <button onClick={validateAll} disabled={validating}
              className="w-full py-4 rounded-2xl text-base font-bold text-white disabled:opacity-50"
              style={{ background: "oklch(0.40 0.16 155)" }}>
              {validating ? "Validation…" : `Valider toute la preparation (${total - validated} restants)`}
            </button>
          </div>
        )}

        {activeBon.statut === "valide" && (
          <div className="px-4 py-4 border-t border-green-200 bg-green-50 shrink-0 flex flex-col gap-2">
            <div className="text-center">
              <p className="text-green-700 font-bold text-sm">Preparation completement validee</p>
              {activeBon.validatedAt && (
                <p className="text-xs text-green-600 mt-0.5">{new Date(activeBon.validatedAt).toLocaleString("fr-MA")}</p>
              )}
            </div>
            {/* BL auto-generes — un par client, jamais un seul BL fusionne */}
            {generatedBLs.length > 0 && (
              <div className="flex flex-col gap-2 mt-1">
                <p className="text-xs font-black text-blue-900 uppercase tracking-wide px-1">
                  {generatedBLs.length} BL genere{generatedBLs.length > 1 ? "s" : ""} automatiquement — controle final requis
                </p>
                {generatedBLs.map(bl => (
                  <div key={bl.id} className="flex items-start gap-3 rounded-xl border-2 border-blue-400 bg-blue-50 px-3 py-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-blue-800">{bl.id}</p>
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-blue-700 font-medium">
                        <span>{bl.clientNom}</span>
                        <span>•</span>
                        <span>{bl.montantTotal.toLocaleString("fr-MA")} DH</span>
                        <span>•</span>
                        <span>{bl.lignes.length} article(s)</span>
                      </div>
                    </div>
                    <button onClick={() => setGeneratedBLs(prev => prev.filter(b => b.id !== bl.id))} className="text-blue-400 hover:text-blue-700 p-1 shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
                <p className="text-[10px] text-blue-600 italic px-1">
                  {activeBon.format === "papier"
                    ? "Saisie papier — lignes auto-importees du bon de preparation sans ressaisie"
                    : "Saisie numerique — quantites reelles preparees utilisees"}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ============================================================
  // BON LIST VIEW
  // ============================================================
  const activeBons = bons.filter(b => b.format === "numerique")

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h2 className="text-lg font-bold text-foreground">Bons de Préparation</h2>
        <p className="text-sm text-muted-foreground">Validez les quantités chargees / التحقق من الكميات</p>
      </div>

      {activeBons.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-12 text-center text-muted-foreground flex flex-col items-center gap-3">
          <svg className="w-14 h-14 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
          <div>
            <p className="font-semibold">Aucun bon de preparation</p>
            <p className="text-sm mt-1">Le responsable doit créer un bon numerique depuis le back-office</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {activeBons.map(bon => {
            const validated = bon.lignes.filter(l => l.valide).length
            const total = bon.lignes.length
            const progress = total > 0 ? Math.round((validated / total) * 100) : 0
            return (
              <button key={bon.id} onClick={() => openBon(bon)}
                className="bg-card rounded-2xl border border-border p-4 text-left hover:shadow-sm transition-shadow w-full">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-bold text-foreground">{bon.nom}</p>
                  <StatusBadge s={bon.statut} />
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  {bon.date} — {total} articles — {bon.lignes.reduce((s, l) => s + l.qteCommandee, 0).toFixed(1)} kg
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{
                        width: `${progress}%`,
                        background: progress === 100 ? "oklch(0.50 0.18 155)" : "oklch(0.60 0.16 195)"
                      }} />
                  </div>
                  <span className="text-xs font-bold text-foreground shrink-0">{progress}%</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {validated}/{total} articles validés
                </p>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
