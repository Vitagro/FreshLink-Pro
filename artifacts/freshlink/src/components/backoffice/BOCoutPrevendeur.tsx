"use client"

// ═══════════════════════════════════════════════════════════════════════════
//  Coût Prévendeur & Trajet — configuration + rapport de rentabilité
//
//  Trois onglets :
//   • Rentabilité : coût ventilé en 4 composantes par prévendeur, marge, KPI.
//   • Paramètres  : grilles salariales, véhicules, prévendeurs suivis.
//   • Journée opérationnelle : profils horaires, avec visualisation du trou de
//     couverture AVANT validation (une fenêtre 14:00→04:00 laisse 10 h non
//     couvertes — mieux vaut le voir que le découvrir dans les chiffres).
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useMemo } from "react"
import { store, type User, userHasRole } from "@/lib/store"
import { hasPermission } from "@/lib/permissions"
import { logAction } from "@/lib/auditLog"
import {
  getBusinessDayProfiles, saveBusinessDayProfiles, heuresNonCouvertes,
  resolveBusinessDay, type BusinessDayProfile, type PolitiqueHorsPlage,
} from "@/lib/businessDay"
import {
  getGrilles, saveGrilles, getVehicules, saveVehicules, getRegles,
  getPrevendeurs, savePrevendeurs, getTrajets, saveTrajets,
  agregerParPrevendeur, coutsNonVentiles, reventilerJournee, cloturerTrajet,
  genCoutId, metriquesTrajet, calculerCoutTrajet, nbTrajetsDuJour,
  type GrilleSalariale, type Vehicule, type PrevendeurCout, type TrajetPrevente,
} from "@/lib/coutPrevendeur"

type Tab = "rentabilite" | "parametres" | "journee"

const DH = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString("fr-MA", { maximumFractionDigits: 2 })} DH`

const POLITIQUES: { id: PolitiqueHorsPlage; label: string; aide: string }[] = [
  { id: "RATTACHER_SUIVANT",   label: "Rattacher à la journée suivante",   aide: "Recommandé — aucune perte, « c'est déjà pour demain »." },
  { id: "RATTACHER_PRECEDENT", label: "Rattacher à la journée précédente", aide: "Pour les profils où la saisie tardive est une régularisation." },
  { id: "REJETER",             label: "Refuser la saisie",                 aide: "Bloque l'utilisateur hors fenêtre — source de blocages terrain." },
]

export default function BOCoutPrevendeur({ user }: { user: User }) {
  const [tab, setTab] = useState<Tab>("rentabilite")
  const [profiles, setProfiles] = useState<BusinessDayProfile[]>(getBusinessDayProfiles)
  const [selectedProfile, setSelectedProfile] = useState("PREVENTE")
  const [grilles, setGrilles] = useState<GrilleSalariale[]>(getGrilles)
  const [vehicules, setVehicules] = useState<Vehicule[]>(getVehicules)
  const [prevendeurs, setPrevendeurs] = useState<PrevendeurCout[]>(getPrevendeurs)
  const [trajets, setTrajets] = useState<TrajetPrevente[]>(getTrajets)
  const [msg, setMsg] = useState<string | null>(null)

  const today = store.today()
  const [dateDebut, setDateDebut] = useState(today)
  const [dateFin, setDateFin] = useState(today)
  const [detailTrajetId, setDetailTrajetId] = useState<string | null>(null)

  // Écran financier + paramétrage de rémunération : même garde-fou que les
  // autres écrans de coûts. Sans permission, l'écran reste consultable mais
  // toutes les actions d'écriture sont retirées.
  const canEdit = hasPermission(user.role, "voir_finance")
    || userHasRole(user, "admin") || userHasRole(user, "super_admin") || userHasRole(user, "super_super_admin")

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 4000) }
  const profile = profiles.find(p => p.id === selectedProfile) ?? profiles[0]

  const updateProfile = (patch: Partial<BusinessDayProfile>) =>
    setProfiles(prev => prev.map(p => p.id === selectedProfile ? { ...p, ...patch } : p))

  const handleSaveProfiles = () => {
    if (!canEdit) { logAction(user, "voir_finance", "denied", { type: "business_day_profil" }); return }
    saveBusinessDayProfiles(profiles)
    logAction(user, "voir_finance", "success", { type: "business_day_profil", label: selectedProfile })
    flash("Profils de journée opérationnelle enregistrés.")
  }

  // Impact du profil courant sur les commandes réelles des 30 derniers jours :
  // transforme une décision abstraite (« 10 h non couvertes ») en décision
  // informée (« 47 commandes concernées »).
  const impact = useMemo(() => {
    if (!profile) return { total: 0, horsPlage: 0 }
    const l = new Date(); l.setDate(l.getDate() - 30)
    const limite = `${l.getFullYear()}-${String(l.getMonth() + 1).padStart(2, "0")}-${String(l.getDate()).padStart(2, "0")}`
    const cmds = store.getCommandes().filter(c => c.date >= limite)
    let horsPlage = 0
    for (const c of cmds) {
      if (resolveBusinessDay(c.createdAt ?? `${c.date}T12:00:00`, profile.id).horsPlage) horsPlage++
    }
    return { total: cmds.length, horsPlage }
  }, [profile])

  const lignes = useMemo(() => agregerParPrevendeur(dateDebut, dateFin), [dateDebut, dateFin, trajets])

  const nonVentiles = useMemo(() =>
    getPrevendeurs()
      .filter(p => p.typeContrat === "SALARIE" && p.actif)
      .map(p => ({ nom: p.nom, montant: coutsNonVentiles(p.id, dateDebut, dateFin) }))
      .filter(x => x.montant > 0),
  [dateDebut, dateFin, trajets])

  const totaux = useMemo(() => {
    const t = lignes.reduce((acc, l) => ({
      cout: acc.cout + l.total, marge: acc.marge + l.margeBrute,
      clients: acc.clients + l.nbClientsVisites, anomalies: acc.anomalies + l.anomalies,
    }), { cout: 0, marge: 0, clients: 0, anomalies: 0 })
    const nv = nonVentiles.reduce((s, x) => s + x.montant, 0)
    return { ...t, coutAvecNV: t.cout + nv, nonVentiles: nv }
  }, [lignes, nonVentiles])

  const handleCloturerPeriode = () => {
    if (!canEdit) { logAction(user, "voir_finance", "denied", { type: "cloture_journee_prevente" }); return }
    const enCours = getTrajets().filter(t =>
      t.dateOperationnelle >= dateDebut && t.dateOperationnelle <= dateFin && t.statut === "EN_COURS")
    for (const t of enCours) cloturerTrajet(t.id, user.name)
    const dates = [...new Set(getTrajets()
      .filter(t => t.dateOperationnelle >= dateDebut && t.dateOperationnelle <= dateFin)
      .map(t => t.dateOperationnelle))]
    let reventiles = 0
    for (const d of dates) reventiles += reventilerJournee(d)
    setTrajets(getTrajets())
    logAction(user, "voir_finance", "success", { type: "cloture_journee_prevente", label: `${dateDebut}->${dateFin}` })
    flash(`Clôture effectuée — ${enCours.length} trajet(s) clôturé(s) d'office, ${reventiles} reventilé(s).`)
  }

  const detail = useMemo(() => {
    if (!detailTrajetId) return null
    const t = getTrajets().find(x => x.id === detailTrajetId)
    if (!t) return null
    const m = metriquesTrajet(t)
    const d = calculerCoutTrajet(t, m, { nbTrajetsDuJour: nbTrajetsDuJour(t.prevendeurId, t.dateOperationnelle) })
    return { t, m, d }
  }, [detailTrajetId, trajets])

  const trajetsPeriode = trajets.filter(t => t.dateOperationnelle >= dateDebut && t.dateOperationnelle <= dateFin)

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-black text-slate-900">💰 Coût Prévendeur &amp; Trajet</h1>
        <p className="text-sm text-slate-500 mt-1">
          Coût réel d&apos;une tournée de prévente : salaire au prorata, transport, charges, rémunération externe.
        </p>
      </div>

      {msg && <div className="px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold">{msg}</div>}
      {!canEdit && (
        <div className="px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          Lecture seule — modifier les paramètres de coût requiert la permission « gérer finance ».
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {([
          { id: "rentabilite" as const, label: "📊 Rentabilité" },
          { id: "parametres" as const,  label: "⚙️ Paramètres" },
          { id: "journee" as const,     label: "🕐 Journée opérationnelle" },
        ]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors ${
              tab === t.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══ RENTABILITÉ ═════════════════════════════════════════════════════ */}
      {tab === "rentabilite" && (
        <div className="flex flex-col gap-4">
          <div className="bg-card rounded-2xl border border-border p-4 flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted-foreground">Du</label>
              <input type="date" value={dateDebut} max={dateFin} onChange={e => setDateDebut(e.target.value)}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted-foreground">Au</label>
              <input type="date" value={dateFin} min={dateDebut} onChange={e => setDateFin(e.target.value)}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm" />
            </div>
            {canEdit && (
              <button onClick={handleCloturerPeriode}
                className="px-4 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-muted">
                Clôturer la période
              </button>
            )}
            <span className="text-[11px] text-muted-foreground ml-auto max-w-md">
              ⓘ Dates <strong>opérationnelles</strong> (profil Prévente : J{profile?.debutJourOffset === 0 ? "" : profile?.debutJourOffset}{" "}
              {profile?.heureDebut} → J {profile?.heureFin}), pas les dates calendaires.
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { l: "Coût total", v: DH(totaux.coutAvecNV), c: "text-slate-900" },
              { l: "Marge brute", v: DH(totaux.marge), c: "text-emerald-700" },
              { l: "Coût / client", v: totaux.clients > 0 ? DH(totaux.coutAvecNV / totaux.clients) : "—", c: "text-sky-700" },
              { l: "Ratio coût/marge", v: totaux.marge > 0 ? `${((totaux.coutAvecNV / totaux.marge) * 100).toFixed(1)} %` : "—", c: "text-indigo-700" },
              { l: "Anomalies", v: String(totaux.anomalies), c: totaux.anomalies > 0 ? "text-amber-700" : "text-emerald-700" },
            ].map(k => (
              <div key={k.l} className="bg-card rounded-2xl border border-border p-4">
                <p className="text-[11px] text-muted-foreground font-medium">{k.l}</p>
                <p className={`text-lg font-black mt-1 ${k.c}`}>{k.v}</p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted">
                  {["Prévendeur", "Contrat", "Trajets", "Fixe", "Transport", "Charges", "Freelance", "TOTAL", "Marge nette"].map(h => (
                    <th key={h} className="text-left px-3 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lignes.length === 0 && nonVentiles.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Aucun trajet clôturé sur cette période.
                  </td></tr>
                )}
                {lignes.map(l => (
                  <tr key={l.prevendeurId} className="border-t border-border hover:bg-muted/20">
                    <td className="px-3 py-3 font-semibold text-foreground">
                      {l.nom}
                      <span className="block text-[11px] font-normal text-muted-foreground">
                        {l.nbClientsVisites} client(s) ·{" "}
                        {l.nbClientsVisites > 0 ? `${DH(l.total / l.nbClientsVisites)}/client` : "—"}
                        {l.anomalies > 0 && <span className="text-amber-700 font-semibold"> · ⚠ {l.anomalies}</span>}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{l.typeContrat}</td>
                    <td className="px-3 py-3 text-center">{l.nbTrajets}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{l.fixeSalarial > 0 ? DH(l.fixeSalarial) : "—"}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{l.transport > 0 ? DH(l.transport) : "—"}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{l.charges > 0 ? DH(l.charges) : "—"}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{l.freelance > 0 ? DH(l.freelance) : "—"}</td>
                    <td className="px-3 py-3 text-right tabular-nums font-bold">{DH(l.total)}</td>
                    <td className={`px-3 py-3 text-right tabular-nums font-semibold ${l.margeBrute - l.total >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                      {DH(l.margeBrute - l.total)}
                    </td>
                  </tr>
                ))}
                {/* Les coûts non ventilés sont dans le MÊME tableau, pas dans un
                    onglet à part : les exclure donnerait une vision flatteuse et fausse. */}
                {nonVentiles.map(nv => (
                  <tr key={nv.nom} className="border-t border-border bg-amber-50/40">
                    <td className="px-3 py-3 font-semibold text-amber-900">
                      Non ventilé — {nv.nom}
                      <span className="block text-[11px] font-normal text-amber-700">Jours payés sans aucune tournée</span>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">SALARIE</td>
                    <td className="px-3 py-3 text-center">—</td>
                    <td className="px-3 py-3 text-right tabular-nums">{DH(nv.montant)}</td>
                    <td className="px-3 py-3 text-center">—</td>
                    <td className="px-3 py-3 text-center">—</td>
                    <td className="px-3 py-3 text-center">—</td>
                    <td className="px-3 py-3 text-right tabular-nums font-bold">{DH(nv.montant)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-red-600 font-semibold">{DH(-nv.montant)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-card rounded-2xl border border-border p-4 flex flex-col gap-2">
            <h3 className="text-sm font-bold text-foreground">Trajets de la période</h3>
            {trajetsPeriode.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Aucun trajet enregistré. Les tournées s&apos;ouvrent depuis le mobile prévendeur ;
                le bouton ci-dessous permet d&apos;en créer une manuellement pour valider le calcul.
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {trajetsPeriode.map(t => (
                  <button key={t.id} onClick={() => setDetailTrajetId(t.id === detailTrajetId ? null : t.id)}
                    className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted text-left text-xs">
                    <span className="font-semibold">{t.numero} — {t.prevendeurNom}</span>
                    <span className="text-muted-foreground">
                      {t.dateOperationnelle} · {t.statut} · {t.coutTotal != null ? DH(t.coutTotal) : "non clôturé"}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {canEdit && (
              <button
                onClick={() => {
                  const p = getPrevendeurs()[0]
                  if (!p) { flash("Crée d'abord un prévendeur dans l'onglet Paramètres."); return }
                  const debut = new Date()
                  const t: TrajetPrevente = {
                    id: genCoutId("trj"),
                    numero: `T-${Date.now().toString().slice(-6)}`,
                    prevendeurId: p.id, prevendeurNom: p.nom,
                    vehiculeId: p.vehiculeId, secteur: p.secteurDefaut,
                    dateOperationnelle: resolveBusinessDay(debut, "PREVENTE").date,
                    debutReel: debut.toISOString(), statut: "EN_COURS", kmDebut: 0,
                  }
                  const next = [...getTrajets(), t]; saveTrajets(next); setTrajets(next)
                  flash(`Trajet ${t.numero} ouvert — journée opérationnelle ${t.dateOperationnelle}.`)
                }}
                className="self-start px-3 py-2 rounded-xl border border-border text-xs font-bold hover:bg-muted">
                + Ouvrir un trajet
              </button>
            )}
          </div>

          {detail && (
            <div className="bg-card rounded-2xl border border-primary/40 p-5 flex flex-col gap-2">
              <h3 className="text-sm font-bold text-foreground">
                {detail.t.numero} — {detail.t.prevendeurNom} · journée {detail.t.dateOperationnelle}
              </h3>
              <table className="text-xs w-full max-w-lg">
                <tbody>
                  {([
                    ["Fixe salarial", detail.d.fixeSalarial, `${detail.d.dureeHeures.toFixed(2)} h`],
                    ["Transport", detail.d.transport, `${detail.d.km.toFixed(0)} km`],
                    ["Charges", detail.d.charges, ""],
                    ["Freelance fixe", detail.d.freelanceFixe, ""],
                    ["Freelance variable", detail.d.freelanceVariable, ""],
                  ] as [string, number, string][]).map(([l, v, sub]) => (
                    <tr key={l} className="border-b border-border/50">
                      <td className="py-1.5 text-muted-foreground">{l}</td>
                      <td className="py-1.5 text-[10px] text-muted-foreground">{sub}</td>
                      <td className="py-1.5 text-right tabular-nums font-semibold">{DH(v)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="py-2 font-bold">TOTAL</td><td />
                    <td className="py-2 text-right tabular-nums font-black">{DH(detail.d.total)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground">
                {detail.m.nbClientsVisites} clients · {detail.m.nbCommandes} commandes ·{" "}
                taux conv. {detail.m.tauxConversion == null ? "non évaluable" : `${detail.m.tauxConversion.toFixed(1)} %`} ·{" "}
                CA {DH(detail.m.ca)} · marge {DH(detail.m.margeBrute)}
              </p>
              {detail.d.anomalies.length > 0 && (
                <ul className="text-xs text-amber-700 list-disc pl-5">
                  {detail.d.anomalies.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              )}
              {detail.t.clotureLe && (
                <p className="text-[11px] text-muted-foreground">
                  🔒 Figé le {new Date(detail.t.clotureLe).toLocaleString("fr-FR")} par {detail.t.clotureesPar}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══ PARAMÈTRES ══════════════════════════════════════════════════════ */}
      {tab === "parametres" && (
        <div className="flex flex-col gap-5">
          <ParamSection
            titre="Grilles salariales"
            vide="Aucune grille. Sans grille, le coût fixe d'un salarié ne peut pas être calculé."
            items={grilles.map(g => ({
              id: g.id, principal: g.libelle,
              secondaire: `${DH(g.salaireBrutMensuel)}/mois · charges ${(g.tauxChargesPatronales * 100).toFixed(0)} % · ${g.joursTravaillesMois} j · répartition ${g.baseRepartition}`,
            }))}
            canEdit={canEdit}
            onAdd={() => {
              const g: GrilleSalariale = {
                id: genCoutId("grille"), libelle: "Nouvelle grille",
                salaireBrutMensuel: 5000, tauxChargesPatronales: 0.20,
                primePanierJour: 30, forfaitTelecomMois: 100, amortissementMaterielMois: 80,
                joursTravaillesMois: 26, heuresParJour: 8, baseRepartition: "DUREE",
                valideDu: today,
              }
              const next = [...grilles, g]; setGrilles(next); saveGrilles(next)
              logAction(user, "voir_finance", "success", { type: "grille_salariale", id: g.id })
            }}
            onDelete={id => { const next = grilles.filter(x => x.id !== id); setGrilles(next); saveGrilles(next) }}
          />

          <ParamSection
            titre="Véhicules"
            vide="Aucun véhicule. Sans véhicule rattaché, le coût de transport reste à 0."
            items={vehicules.map(v => ({
              id: v.id, principal: `${v.immatriculation} — ${v.modeDetention}`,
              secondaire: v.modeDetention === "PERSONNEL"
                ? `Barème ${DH(v.indemniteKm ?? 0)}/km`
                : `${v.consoL100km} L/100 · ${DH(v.prixCarburantLitre)}/L · assurance ${DH(v.assuranceMois)}/mois · ${v.kmMoyensMois} km/mois`,
            }))}
            canEdit={canEdit}
            onAdd={() => {
              const v: Vehicule = {
                id: genCoutId("veh"), immatriculation: "NOUVEAU", modeDetention: "PROPRIETE",
                coutAcquisition: 120000, dureeAmortissementMois: 60,
                consoL100km: 8, prixCarburantLitre: 14.8,
                assuranceMois: 400, entretienMois: 300, kmMoyensMois: 2000, actif: true,
              }
              const next = [...vehicules, v]; setVehicules(next); saveVehicules(next)
            }}
            onDelete={id => { const next = vehicules.filter(x => x.id !== id); setVehicules(next); saveVehicules(next) }}
          />

          <ParamSection
            titre="Prévendeurs suivis"
            vide="Aucun prévendeur rattaché au module de coût."
            addLabel="Importer depuis les comptes ERP"
            items={prevendeurs.map(p => ({
              id: p.id, principal: `${p.nom} — ${p.typeContrat}`,
              secondaire: [
                p.grilleSalarialeId ? `grille ${grilles.find(g => g.id === p.grilleSalarialeId)?.libelle ?? "?"}` : null,
                p.regleFreelanceId ? `règle ${getRegles().find(r => r.id === p.regleFreelanceId)?.libelle ?? "?"}` : null,
                p.vehiculeId ? `véhicule ${vehicules.find(v => v.id === p.vehiculeId)?.immatriculation ?? "?"}` : null,
              ].filter(Boolean).join(" · ") || "aucun paramètre rattaché",
            }))}
            canEdit={canEdit}
            onAdd={() => {
              // userHasRole : un compte portant "prevendeur" en rôle SECONDAIRE
              // doit être proposé lui aussi (même angle mort que la préparation).
              const candidats = store.getUsers().filter(u => userHasRole(u, "prevendeur") && u.actif)
              const deja = new Set(prevendeurs.map(p => p.userId))
              const nouveaux = candidats.filter(u => !deja.has(u.id)).map((u): PrevendeurCout => ({
                id: genCoutId("prev"), userId: u.id, nom: u.name,
                typeContrat: "SALARIE", grilleSalarialeId: grilles[0]?.id,
                vehiculeId: vehicules[0]?.id, actif: true,
              }))
              if (nouveaux.length === 0) { flash("Tous les prévendeurs actifs sont déjà suivis."); return }
              const next = [...prevendeurs, ...nouveaux]; setPrevendeurs(next); savePrevendeurs(next)
              flash(`${nouveaux.length} prévendeur(s) importé(s) depuis les comptes ERP.`)
            }}
            onDelete={id => { const next = prevendeurs.filter(x => x.id !== id); setPrevendeurs(next); savePrevendeurs(next) }}
          />
        </div>
      )}

      {/* ══ JOURNÉE OPÉRATIONNELLE ══════════════════════════════════════════ */}
      {tab === "journee" && profile && (
        <div className="flex flex-col gap-4">
          <div className="flex gap-2 flex-wrap">
            {profiles.map(p => (
              <button key={p.id} onClick={() => setSelectedProfile(p.id)}
                className={`px-3 py-2 rounded-xl text-xs font-bold border text-left ${
                  selectedProfile === p.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
                {p.libelle}
                <span className="block text-[10px] font-normal opacity-70">
                  J{p.debutJourOffset === 0 ? "" : p.debutJourOffset} {p.heureDebut} → J{p.finJourOffset === 0 ? "" : `+${p.finJourOffset}`} {p.heureFin}
                </span>
              </button>
            ))}
          </div>

          <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-muted-foreground">Début</label>
                <div className="flex gap-1">
                  <select value={profile.debutJourOffset} disabled={!canEdit}
                    onChange={e => updateProfile({ debutJourOffset: Number(e.target.value) })}
                    className="px-2 py-2 rounded-xl border border-border bg-background text-sm">
                    <option value={-1}>J-1</option><option value={0}>J</option>
                  </select>
                  <input type="time" value={profile.heureDebut} disabled={!canEdit}
                    onChange={e => updateProfile({ heureDebut: e.target.value })}
                    className="px-3 py-2 rounded-xl border border-border bg-background text-sm" />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-muted-foreground">Fin</label>
                <div className="flex gap-1">
                  <select value={profile.finJourOffset} disabled={!canEdit}
                    onChange={e => updateProfile({ finJourOffset: Number(e.target.value) })}
                    className="px-2 py-2 rounded-xl border border-border bg-background text-sm">
                    <option value={0}>J</option><option value={1}>J+1</option>
                  </select>
                  <input type="time" value={profile.heureFin} disabled={!canEdit}
                    onChange={e => updateProfile({ heureFin: e.target.value })}
                    className="px-3 py-2 rounded-xl border border-border bg-background text-sm" />
                </div>
              </div>
            </div>

            {/* Visualisation du trou de couverture, AVANT validation */}
            {(() => {
              const trou = heuresNonCouvertes(profile)
              const couvert = 24 - trou
              return (
                <div className="rounded-xl border border-border p-4 bg-muted/30 flex flex-col gap-2">
                  <div className="flex h-6 rounded-lg overflow-hidden border border-border">
                    <div className="bg-emerald-500 flex items-center justify-center text-[10px] font-bold text-white"
                      style={{ width: `${(couvert / 24) * 100}%` }}>
                      {couvert.toFixed(1)} h couvertes
                    </div>
                    {trou > 0 && (
                      <div className="bg-red-200 flex items-center justify-center text-[10px] font-bold text-red-800"
                        style={{ width: `${(trou / 24) * 100}%` }}>
                        {trou.toFixed(1)} h
                      </div>
                    )}
                  </div>
                  {trou > 0 && (
                    <p className="text-xs text-amber-700 font-semibold">
                      ⚠ {trou.toFixed(1)} h sur 24 ne sont couvertes par aucune journée opérationnelle.
                      Sur les 30 derniers jours, <strong>{impact.horsPlage}</strong> commande(s) sur {impact.total} seraient
                      concernées → traitées selon la politique choisie ci-dessous.
                    </p>
                  )}
                </div>
              )
            })()}

            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Enregistrements hors plage</span>
              {POLITIQUES.map(p => (
                <label key={p.id} className="flex items-start gap-2 text-sm cursor-pointer">
                  <input type="radio" name="politique" checked={profile.politiqueHorsPlage === p.id} disabled={!canEdit}
                    onChange={() => updateProfile({ politiqueHorsPlage: p.id })} className="mt-1" />
                  <span>
                    <span className="font-semibold text-foreground">{p.label}</span>
                    <span className="block text-xs text-muted-foreground">{p.aide}</span>
                  </span>
                </label>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              Types rattachés : {profile.typesEntite.length ? profile.typesEntite.join(", ") : "— (profil de repli)"}
            </p>

            {canEdit && (
              <button onClick={handleSaveProfiles}
                className="self-start px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:opacity-90">
                Enregistrer
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Bloc de paramétrage générique ──────────────────────────────────────────

function ParamSection({ titre, vide, items, canEdit, onAdd, onDelete, addLabel }: {
  titre: string
  vide: string
  items: { id: string; principal: string; secondaire: string }[]
  canEdit: boolean
  onAdd: () => void
  onDelete: (id: string) => void
  addLabel?: string
}) {
  return (
    <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground">{titre}</h3>
        {canEdit && (
          <button onClick={onAdd} className="px-3 py-1.5 rounded-lg border border-border text-xs font-bold hover:bg-muted">
            {addLabel ?? "+ Ajouter"}
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{vide}</p>
      ) : (
        <div className="flex flex-col gap-1">
          {items.map(i => (
            <div key={i.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted/40">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{i.principal}</p>
                <p className="text-[11px] text-muted-foreground truncate">{i.secondaire}</p>
              </div>
              {canEdit && (
                <button onClick={() => onDelete(i.id)}
                  className="px-2 py-1 rounded-lg text-xs text-muted-foreground hover:text-red-600 shrink-0">
                  Supprimer
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
