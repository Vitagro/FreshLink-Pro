"use client"

import { useState, useEffect } from "react"
import {
  store, type Fournisseur, type ItinerairePoint,
  SPECIALITES_FRUITS_LEGUMES, MODALITE_LABELS, type ModalitePaiement,
  FOURNISSEUR_TYPE_LABELS, type FournisseurType, type UserRole,
} from "@/lib/store"
import BOFournisseurDetail from "./BOFournisseurDetail"
import { hasPermission } from "@/lib/permissions"
import { logAction } from "@/lib/auditLog"

const JOURS = ["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"]

const emptyFournisseur = (): Omit<Fournisseur, "id"> => ({
  nom: "", contact: "", telephone: "", email: "", adresse: "", ville: "Casablanca", region: "Casablanca-Settat",
  type: undefined,
  specialites: [], modalitePaiement: "cash", delaiPaiement: 0, plafondCredit: 0, ice: "", rc: "", notes: "", itineraires: [],
})

// Push d'un fournisseur vers Supabase (service-role {id, payload}) — partagé avec le portail boutique
async function pushFournisseur(f: Fournisseur): Promise<boolean> {
  try {
    const { id, ...payload } = f
    const res = await fetch("/api/sync-write", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "fl_fournisseurs", upserts: [{ id, payload, updated_at: new Date().toISOString() }] }),
    })
    return (await res.json()).ok === true
  } catch { return false }
}

const emptyPoint = (): ItinerairePoint => ({ nom: "", lat: undefined, lng: undefined, jour: "", heureDepart: "", heureArrivee: "" })

export default function BOFournisseurs({ user }: { user: { id: string; name: string; role: UserRole } }) {
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Fournisseur | null>(null)
  const [form, setForm] = useState<Omit<Fournisseur, "id">>(emptyFournisseur())
  const [search, setSearch] = useState("")
  const [activeTab, setActiveTab] = useState<"info" | "specialites" | "itineraires" | "conditions">("info")
  const [saved, setSaved] = useState("")
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [detail, setDetail] = useState<Fournisseur | null>(null)

  const canEdit = ["super_super_admin","super_admin","admin","resp_commercial","resp_achat","team_leader"].includes(user.role) || !!(user as { canViewExternal?: boolean }).canViewExternal

  useEffect(() => { setFournisseurs(store.getFournisseurs()) }, [])

  const refresh = () => setFournisseurs(store.getFournisseurs())

  const openNew = () => {
    setEditing(null)
    setForm(emptyFournisseur())
    setActiveTab("info")
    setShowForm(true)
  }

  const openEdit = (f: Fournisseur) => {
    setEditing(f)
    setForm({
      nom: f.nom, contact: f.contact, telephone: f.telephone || "", email: f.email,
      adresse: f.adresse || "", ville: f.ville || "Casablanca", region: f.region || "Casablanca-Settat",
      type: f.type,
      specialites: f.specialites || [], modalitePaiement: f.modalitePaiement || "cash",
      delaiPaiement: f.delaiPaiement || 0, plafondCredit: f.plafondCredit || 0,
      ice: f.ice || "", rc: f.rc || "",
      notes: f.notes || "", itineraires: f.itineraires || [],
    })
    setActiveTab("info")
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.nom.trim()) return
    const full: Fournisseur = editing
      ? { ...form, id: editing.id }
      : { ...form, id: store.genId() }
    if (editing) {
      store.updateFournisseur(editing.id, form)
    } else {
      store.addFournisseur(full)
    }
    setShowForm(false)
    refresh()
    // ✅ Sync Supabase (service-role) → la boutique et la fiche fournisseur partagent le même enregistrement
    const ok = await pushFournisseur(full)
    setSaved(ok ? "Fournisseur sauvegardé & synchronisé" : "Sauvegardé localement (erreur Supabase)")
    setTimeout(() => setSaved(""), 2500)
  }

  const handleDelete = (id: string) => {
    if (!hasPermission(user.role, "approuver_compte_fournisseur")) { logAction(user, "approuver_compte_fournisseur", "denied", { type: "fournisseur_suppression", id }); return }
    logAction(user, "approuver_compte_fournisseur", "success", { type: "fournisseur_suppression", id })
    store.deleteFournisseur(id)
    fetch("/api/sync-write", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "fl_fournisseurs", deletes: [id] }),
    }).catch(() => {})
    setConfirmDelete(null)
    refresh()
  }

  // Itineraire helpers
  const addPoint = () => setForm(f => ({ ...f, itineraires: [...(f.itineraires || []), emptyPoint()] }))
  const updatePoint = (i: number, key: keyof ItinerairePoint, val: string | number) => {
    const arr = [...(form.itineraires || [])]
    arr[i] = { ...arr[i], [key]: val }
    setForm(f => ({ ...f, itineraires: arr }))
  }
  const removePoint = (i: number) => {
    setForm(f => ({ ...f, itineraires: (f.itineraires || []).filter((_, idx) => idx !== i) }))
  }

  const toggleSpecialite = (s: string) => {
    setForm(f => ({
      ...f,
      specialites: f.specialites.includes(s) ? f.specialites.filter(x => x !== s) : [...f.specialites, s],
    }))
  }

  const filtered = fournisseurs.filter(f =>
    !search || f.nom.toLowerCase().includes(search.toLowerCase()) ||
    (f.ville || "").toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => a.nom.localeCompare(b.nom, "fr"))

  const MODALITE_OPTIONS = Object.entries(MODALITE_LABELS) as [ModalitePaiement, string][]

  // Alertes qualité base : fournisseurs sans téléphone et/ou sans GPS (itinéraires)
  const fNoPhone = (f: typeof fournisseurs[number]) => !String(f.telephone ?? "").replace(/\D/g, "")
  const fNoGps   = (f: typeof fournisseurs[number]) => !(f.itineraires ?? []).some(p => Number(p.lat) || Number(p.lng))
  const missingF = fournisseurs.filter(f => fNoPhone(f) || fNoGps(f))

  return (
    <div className="flex flex-col gap-5">
      {missingF.length > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800">
          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
          <div className="text-sm">
            <strong>{missingF.length} fournisseur(s)</strong> à compléter :
            {" "}{fournisseurs.filter(fNoPhone).length} sans téléphone · {fournisseurs.filter(fNoGps).length} sans GPS (itinéraire).
            <span className="block text-[11px] text-amber-700/80 mt-0.5">Téléphone et point GPS requis pour le sourcing et les notifications.</span>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-foreground text-lg">Fournisseurs / الموردون</h2>
          <p className="text-sm text-muted-foreground">{fournisseurs.length} fournisseur(s) enregistré(s)</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg">{saved}</span>
          )}
          {canEdit && (
            <button onClick={openNew}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: "oklch(0.38 0.2 260)" }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Nouveau fournisseur
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher par nom, ville..."
        className="w-full max-w-sm px-4 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(f => (
          <div key={f.id} className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-3">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <button onClick={() => setDetail(f)} className="text-left min-w-0 group">
                <h3 className="font-bold text-foreground group-hover:text-primary transition-colors truncate">{f.nom}</h3>
                <p className="text-xs text-muted-foreground">{f.ville}{f.region ? ` — ${f.region}` : ""}</p>
              </button>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => setDetail(f)} title="Ouvrir la fiche complète"
                  className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                </button>
                {canEdit && (
                  <>
                    <button onClick={() => openEdit(f)}
                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button onClick={() => setConfirmDelete(f.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Contact */}
            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
              {f.contact && <span>{f.contact}{f.telephone ? ` — ${f.telephone}` : ""}</span>}
              {f.email && <span>{f.email}</span>}
              {f.adresse && <span>{f.adresse}</span>}
            </div>

            {/* Specialites */}
            {f.specialites && f.specialites.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {f.specialites.slice(0, 4).map(s => (
                  <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 font-medium">{s}</span>
                ))}
                {f.specialites.length > 4 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">+{f.specialites.length - 4}</span>
                )}
              </div>
            )}

            {/* Modalite paiement */}
            {f.modalitePaiement && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Paiement :</span>
                <span className="font-semibold text-foreground">{MODALITE_LABELS[f.modalitePaiement]}</span>
                {f.delaiPaiement ? <span className="text-muted-foreground">({f.delaiPaiement}j)</span> : null}
              </div>
            )}

            {/* Itineraires count */}
            {f.itineraires && f.itineraires.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 rounded-lg px-2 py-1.5">
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                {f.itineraires.length} point(s) d&apos;itinéraire — {f.itineraires.filter(p => p.jour).map(p => p.jour).join(", ")}
              </div>
            )}

            {/* ICE / RC */}
            {(f.ice || f.rc) && (
              <div className="text-[10px] font-mono text-muted-foreground border-t border-border pt-2 flex gap-3">
                {f.ice && <span>ICE: {f.ice}</span>}
                {f.rc && <span>RC: {f.rc}</span>}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-3 text-center py-12 text-muted-foreground text-sm">
            Aucun fournisseur trouvé
          </div>
        )}
      </div>

      {/* Fiche fournisseur complète */}
      {detail && (
        <BOFournisseurDetail
          fournisseur={detail}
          user={user}
          canEdit={canEdit}
          onClose={() => setDetail(null)}
          onEdit={(fr) => { setDetail(null); openEdit(fr) }}
        />
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl border border-border p-6 max-w-sm w-full flex flex-col gap-4 shadow-xl">
            <h3 className="font-bold text-foreground">Confirmer la suppression</h3>
            <p className="text-sm text-muted-foreground">Cette action est irréversible. Le fournisseur sera supprimé définitivement.</p>
            <div className="flex gap-2">
              <button onClick={() => handleDelete(confirmDelete)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors">
                Supprimer
              </button>
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-border hover:bg-muted transition-colors">
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-card rounded-2xl border border-border w-full max-w-2xl my-6 flex flex-col shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h3 className="font-bold text-foreground">{editing ? "Modifier" : "Nouveau"} Fournisseur</h3>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-muted rounded-xl transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Sub-tabs */}
            <div className="flex gap-1 p-3 border-b border-border bg-muted/30 overflow-x-auto">
              {[
                { id: "info" as const, label: "Informations" },
                { id: "specialites" as const, label: "Spécialités" },
                { id: "itineraires" as const, label: `Itinéraires (${form.itineraires?.length || 0})` },
                { id: "conditions" as const, label: "Conditions" },
              ].map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${activeTab === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="p-5 flex flex-col gap-4 overflow-y-auto" style={{ maxHeight: "60vh" }}>

              {/* INFO */}
              {activeTab === "info" && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-foreground">Type de fournisseur</label>
                    <div className="flex flex-wrap gap-2">
                      {(Object.entries(FOURNISSEUR_TYPE_LABELS) as [FournisseurType, string][]).map(([val, label]) => (
                        <button key={val} type="button" onClick={() => setForm(f => ({ ...f, type: val }))}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                            form.type === val ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
                          }`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { f: "nom", label: "Raison sociale *", placeholder: "Marché Central" },
                      { f: "contact", label: "Nom du contact", placeholder: "Ahmed Tazi" },
                      { f: "telephone", label: "Téléphone", placeholder: "06 00 00 00 01" },
                      { f: "email", label: "Email", placeholder: "contact@fournisseur.ma" },
                      { f: "adresse", label: "Adresse", placeholder: "Bd Mohamed V" },
                      { f: "ville", label: "Ville", placeholder: "Casablanca" },
                      { f: "region", label: "Région", placeholder: "Casablanca-Settat" },
                    ].map(({ f, label, placeholder }) => (
                      <div key={f} className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-foreground">{label}</label>
                        <input type="text" value={(form as unknown as Record<string,string>)[f] || ""}
                          onChange={e => setForm(prev => ({ ...prev, [f]: e.target.value }))}
                          className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder={placeholder} />
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-foreground">Notes internes</label>
                    <textarea rows={2} value={form.notes || ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                      className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                      placeholder="Remarques, conditions spéciales..." />
                  </div>
                </div>
              )}

              {/* SPECIALITES */}
              {activeTab === "specialites" && (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-muted-foreground">Sélectionnez les fruits et légumes fournis par ce fournisseur :</p>
                  <div className="flex flex-wrap gap-2">
                    {SPECIALITES_FRUITS_LEGUMES.map(s => (
                      <button key={s} onClick={() => toggleSpecialite(s)} type="button"
                        className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${
                          form.specialites.includes(s)
                            ? "bg-green-600 text-white border-green-600"
                            : "bg-background text-muted-foreground border-border hover:border-green-400"
                        }`}>
                        {s}
                      </button>
                    ))}
                  </div>
                  {form.specialites.length > 0 && (
                    <p className="text-xs text-green-700 font-medium">{form.specialites.length} spécialité(s) sélectionnée(s)</p>
                  )}
                </div>
              )}

              {/* ITINERAIRES */}
              {activeTab === "itineraires" && (
                <div className="flex flex-col gap-4">
                  <p className="text-xs text-muted-foreground">Définissez les marchés, souks ou points d&apos;approvisionnement et les jours/horaires de passage :</p>
                  {(form.itineraires || []).map((pt, i) => (
                    <div key={i} className="bg-muted/30 rounded-xl border border-border p-4 flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground">Point {i + 1}</span>
                        <button onClick={() => removePoint(i)} className="p-1 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="flex flex-col gap-1 sm:col-span-2">
                          <label className="text-xs font-semibold">Nom du lieu *</label>
                          <input type="text" value={pt.nom} onChange={e => updatePoint(i, "nom", e.target.value)}
                            placeholder="ex: Had Soualem, Derb Omar..."
                            className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-semibold">Jour</label>
                          <select value={pt.jour || ""} onChange={e => updatePoint(i, "jour", e.target.value)}
                            className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                            <option value="">-- Jour --</option>
                            {JOURS.map(j => <option key={j} value={j}>{j}</option>)}
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-semibold">GPS Latitude</label>
                          <input type="number" step="0.0001" value={pt.lat || ""} onChange={e => updatePoint(i, "lat", parseFloat(e.target.value))}
                            placeholder="33.5731"
                            className="px-3 py-2 rounded-xl border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-semibold">Heure départ</label>
                          <input type="time" value={pt.heureDepart || ""} onChange={e => updatePoint(i, "heureDepart", e.target.value)}
                            className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-semibold">Heure arrivée</label>
                          <input type="time" value={pt.heureArrivee || ""} onChange={e => updatePoint(i, "heureArrivee", e.target.value)}
                            className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                      </div>
                    </div>
                  ))}
                  <button onClick={addPoint} type="button"
                    className="flex items-center gap-2 self-start px-4 py-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    Ajouter un point
                  </button>
                </div>
              )}

              {/* CONDITIONS */}
              {activeTab === "conditions" && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-foreground">Modalité de paiement</label>
                    <select value={form.modalitePaiement || "cash"} onChange={e => setForm(f => ({ ...f, modalitePaiement: e.target.value as ModalitePaiement }))}
                      className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                      {MODALITE_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-foreground">Délai de paiement (jours)</label>
                      <input type="number" min={0} max={180} value={form.delaiPaiement || 0} onChange={e => setForm(f => ({ ...f, delaiPaiement: parseInt(e.target.value) || 0 }))}
                        className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-foreground">Plafond crédit (DH)</label>
                      <input type="number" min={0} value={form.plafondCredit || 0} onChange={e => setForm(f => ({ ...f, plafondCredit: parseFloat(e.target.value) || 0 }))}
                        className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 border-t border-border pt-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold">ICE (20 chiffres)</label>
                      <input type="text" maxLength={20} value={form.ice || ""} onChange={e => setForm(f => ({ ...f, ice: e.target.value }))}
                        placeholder="00000000000000000000"
                        className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold">Registre de commerce</label>
                      <input type="text" value={form.rc || ""} onChange={e => setForm(f => ({ ...f, rc: e.target.value }))}
                        placeholder="123456"
                        className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-5 border-t border-border flex items-center justify-between">
              <button onClick={() => setShowForm(false)} className="px-5 py-2.5 rounded-xl text-sm font-semibold border border-border hover:bg-muted transition-colors">
                Annuler
              </button>
              <button onClick={handleSave}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: "oklch(0.38 0.2 260)" }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                {editing ? "Enregistrer les modifications" : "Créer le fournisseur"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
