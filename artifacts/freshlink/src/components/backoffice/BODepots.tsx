"use client"

import { useState, useEffect } from "react"
import { store, type Depot, type User, DEFAULT_DEPOT } from "@/lib/store"

const EMPTY_FORM: Omit<Depot, "id"> = {
  nom: "", adresse: "", ville: "Casablanca", actif: true,
  responsableNom: "", notes: "", gpsLat: undefined, gpsLng: undefined,
  gpsAdresseComplete: "", circuitNom: "", circuitOrdre: 1, zoneCouverte: "",
  heureOuverture: "06:00", heureFermeture: "22:00", capaciteKg: undefined,
  telephone: "", email: "", typeDepot: "secondaire",
}

const TYPE_DEPOT_LABELS: Record<string, string> = {
  principal: "🏭 Principal", secondaire: "🏪 Secondaire",
  transit: "🚛 Transit / Relais", froid: "❄️ Chambre froide",
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}

const inp = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
const sel = inp + " cursor-pointer"

export default function BODepots({ user }: { user: User }) {
  const [depots, setDepots] = useState<Depot[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [editing, setEditing] = useState<Depot | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Omit<Depot, "id">>(EMPTY_FORM)
  const [search, setSearch] = useState("")
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [expandedDepot, setExpandedDepot] = useState<string | null>(null)

  const isSuperAdmin = user.role === "super_admin" || user.role === "super_super_admin"

  const notify = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const refresh = () => {
    setDepots(store.getDepots())
    setUsers(store.getUsers())
  }

  useEffect(() => { refresh() }, [])

  const getUsersForDepot = (depotId: string) => users.filter(u => u.depotId === depotId)

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowForm(true) }

  const openEdit = (d: Depot) => {
    setEditing(d)
    setForm({
      nom: d.nom, adresse: d.adresse ?? "", ville: d.ville ?? "Casablanca",
      actif: d.actif, responsableNom: d.responsableNom ?? "", notes: d.notes ?? "",
      gpsLat: d.gpsLat, gpsLng: d.gpsLng, gpsAdresseComplete: d.gpsAdresseComplete ?? "",
      circuitNom: d.circuitNom ?? "", circuitOrdre: d.circuitOrdre ?? 1,
      zoneCouverte: d.zoneCouverte ?? "", heureOuverture: d.heureOuverture ?? "06:00",
      heureFermeture: d.heureFermeture ?? "22:00", capaciteKg: d.capaciteKg,
      telephone: d.telephone ?? "", email: d.email ?? "", typeDepot: d.typeDepot ?? "secondaire",
    })
    setShowForm(true)
  }

  const detectGPS = () => {
    if (!navigator.geolocation) { notify("Géolocalisation non supportée", "err"); return }
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm(f => ({ ...f, gpsLat: +pos.coords.latitude.toFixed(6), gpsLng: +pos.coords.longitude.toFixed(6) }))
        setGpsLoading(false)
        notify("📍 Position GPS détectée !")
      },
      () => { setGpsLoading(false); notify("Impossible de détecter la position GPS", "err") },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const openGoogleMaps = (lat: number, lng: number) =>
    window.open(`https://www.google.com/maps?q=${lat},${lng}&z=16`, "_blank")

  const handleSave = () => {
    if (!form.nom.trim()) { notify("Le nom du dépôt est obligatoire", "err"); return }
    setSaving(true)
    if (editing) {
      store.updateDepot(editing.id, form)
      notify("✅ Dépôt mis à jour")
    } else {
      store.addDepot({ id: genDepotId(), ...form })
      notify("✅ Dépôt créé")
    }
    setSaving(false)
    setShowForm(false)
    refresh()
  }

  const handleToggleActif = (d: Depot) => {
    if (d.id === DEFAULT_DEPOT.id) { notify("Le dépôt principal ne peut pas être désactivé", "err"); return }
    store.updateDepot(d.id, { actif: !d.actif })
    refresh()
  }

  const handleDelete = (d: Depot) => {
    if (d.id === DEFAULT_DEPOT.id) { notify("Dépôt principal non supprimable", "err"); return }
    const assigned = getUsersForDepot(d.id)
    if (assigned.length > 0) { notify(`${assigned.length} utilisateur(s) affectés — réassignez-les d'abord.`, "err"); return }
    if (!confirm(`Supprimer "${d.nom}" ?`)) return
    store.deleteDepot(d.id)
    notify("Dépôt supprimé")
    refresh()
  }

  const filtered = depots.filter(d =>
    d.nom.toLowerCase().includes(search.toLowerCase()) ||
    (d.ville ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (d.circuitNom ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (d.responsableNom ?? "").toLowerCase().includes(search.toLowerCase())
  )

  const actifs = depots.filter(d => d.actif).length
  const avecGPS = depots.filter(d => d.gpsLat && d.gpsLng).length
  const circuits = [...new Set(depots.map(d => d.circuitNom).filter(Boolean))]

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-6xl mx-auto">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-xl text-sm font-semibold ${toast.type === "ok" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <span>🏭</span> Multi-Dépôts & Circuits
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Entrepôts, GPS et circuits de livraison</p>
        </div>
        {isSuperAdmin && (
          <button onClick={openCreate} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm shadow transition-colors">
            <Icon d="M12 4v16m8-8H4" /> Nouveau Dépôt
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Dépôts", val: depots.length, icon: "🏭", bg: "bg-slate-50 border-slate-200" },
          { label: "Actifs", val: actifs, icon: "✅", bg: "bg-emerald-50 border-emerald-200" },
          { label: "Avec GPS", val: avecGPS, icon: "📍", bg: "bg-blue-50 border-blue-200" },
          { label: "Circuits", val: circuits.length, icon: "🗺️", bg: "bg-orange-50 border-orange-200" },
        ].map(k => (
          <div key={k.label} className={`${k.bg} border rounded-xl p-4`}>
            <div className="text-2xl">{k.icon}</div>
            <div className="text-2xl font-black text-slate-900">{k.val}</div>
            <div className="text-xs font-medium text-slate-500">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="m21 21-4.35-4.35" />
        </svg>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher dépôt, ville, circuit..."
          className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filtered.length === 0 && (
          <div className="col-span-2 text-center py-16 text-slate-400">
            <div className="text-5xl mb-3">🏭</div>
            <p className="font-semibold">Aucun dépôt trouvé</p>
          </div>
        )}
        {filtered.map(d => {
          const assignedUsers = getUsersForDepot(d.id)
          const isExpanded = expandedDepot === d.id
          const hasGPS = !!(d.gpsLat && d.gpsLng)
          return (
            <div key={d.id} className={`bg-white border-2 rounded-2xl overflow-hidden shadow-sm transition-all ${d.actif ? "border-slate-200 hover:border-emerald-300" : "border-red-200 opacity-70"}`}>
              <div className="p-4 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${d.actif ? "bg-emerald-100" : "bg-red-100"}`}>
                    {d.typeDepot === "froid" ? "❄️" : d.typeDepot === "transit" ? "🚛" : d.typeDepot === "principal" ? "🏭" : "🏪"}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 text-sm flex items-center gap-2 flex-wrap">
                      {d.nom}
                      {!d.actif && <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-xs font-semibold">Inactif</span>}
                      {d.id === DEFAULT_DEPOT.id && <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-semibold">Principal</span>}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{d.ville && `📍 ${d.ville}`}{d.typeDepot && ` — ${TYPE_DEPOT_LABELS[d.typeDepot]}`}</div>
                    {d.circuitNom && <div className="text-xs text-emerald-700 font-semibold mt-1">🗺️ {d.circuitNom}{d.circuitOrdre ? ` — #${d.circuitOrdre}` : ""}</div>}
                    <div className="flex items-center gap-2 mt-1">
                      {hasGPS && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-semibold">📍 GPS</span>}
                      {assignedUsers.length > 0 && <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">👥 {assignedUsers.length}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {hasGPS && (
                    <button onClick={() => openGoogleMaps(d.gpsLat!, d.gpsLng!)} title="Google Maps" className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg">
                      <Icon d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </button>
                  )}
                  <button onClick={() => setExpandedDepot(isExpanded ? null : d.id)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg">
                    <Icon d={isExpanded ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
                  </button>
                  {isSuperAdmin && (
                    <>
                      <button onClick={() => openEdit(d)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg">
                        <Icon d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </button>
                      <button onClick={() => handleToggleActif(d)} className={`p-1.5 rounded-lg ${d.actif ? "text-red-400 hover:bg-red-50" : "text-emerald-500 hover:bg-emerald-50"}`}>
                        <Icon d={d.actif ? "M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" : "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"} />
                      </button>
                      {d.id !== DEFAULT_DEPOT.id && (
                        <button onClick={() => handleDelete(d)} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg">
                          <Icon d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-slate-100 bg-slate-50 p-4 flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {d.adresse && <div><span className="text-slate-500 font-medium">Adresse :</span><div className="text-slate-800">{d.adresse}</div></div>}
                    {d.responsableNom && <div><span className="text-slate-500 font-medium">Responsable :</span><div className="font-semibold text-slate-800">{d.responsableNom}</div></div>}
                    {d.telephone && <div><span className="text-slate-500 font-medium">Tél :</span><div>{d.telephone}</div></div>}
                    {d.email && <div><span className="text-slate-500 font-medium">Email :</span><div>{d.email}</div></div>}
                    {(d.heureOuverture || d.heureFermeture) && <div><span className="text-slate-500 font-medium">Horaires :</span><div>{d.heureOuverture} → {d.heureFermeture}</div></div>}
                    {d.capaciteKg && <div><span className="text-slate-500 font-medium">Capacité :</span><div>{d.capaciteKg.toLocaleString()} kg</div></div>}
                    {d.zoneCouverte && <div className="col-span-2"><span className="text-slate-500 font-medium">Zones :</span><div>{d.zoneCouverte}</div></div>}
                  </div>
                  {hasGPS ? (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold text-blue-800">📍 Coordonnées GPS</div>
                        <div className="text-xs font-mono text-blue-700">Lat: {d.gpsLat} | Lng: {d.gpsLng}</div>
                        {d.gpsAdresseComplete && <div className="text-xs text-blue-600">{d.gpsAdresseComplete}</div>}
                      </div>
                      <button onClick={() => openGoogleMaps(d.gpsLat!, d.gpsLng!)} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 whitespace-nowrap">📍 Maps</button>
                    </div>
                  ) : (
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-xs text-orange-700">⚠️ Aucun GPS — modifier pour ajouter</div>
                  )}
                  {assignedUsers.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-slate-600 mb-1.5">👥 Équipe ({assignedUsers.length})</div>
                      <div className="flex flex-wrap gap-1.5">{assignedUsers.map(u => <span key={u.id} className="px-2 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-medium">{u.name}</span>)}</div>
                    </div>
                  )}
                  {d.notes && <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-xs"><span className="font-semibold">Notes : </span>{d.notes}</div>}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.55)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-slate-100 flex items-center justify-between rounded-t-2xl z-10">
              <h2 className="text-lg font-black text-slate-900">{editing ? "✏️ Modifier le Dépôt" : "➕ Nouveau Dépôt"}</h2>
              <button onClick={() => setShowForm(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl">
                <Icon d="M6 18L18 6M6 6l12 12" />
              </button>
            </div>
            <div className="p-6 flex flex-col gap-6">
              {/* Infos générales */}
              <div>
                <h3 className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-3 flex items-center gap-1.5"><span>📋</span> Informations générales</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Nom du dépôt *"><input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} className={inp} placeholder="Ex: Dépôt Maarif" /></Field>
                  <Field label="Type de dépôt">
                    <select value={form.typeDepot ?? "secondaire"} onChange={e => setForm(f => ({ ...f, typeDepot: e.target.value as Depot["typeDepot"] }))} className={sel}>
                      {Object.entries(TYPE_DEPOT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </Field>
                  <Field label="Adresse"><input value={form.adresse} onChange={e => setForm(f => ({ ...f, adresse: e.target.value }))} className={inp} placeholder="Rue, numéro..." /></Field>
                  <Field label="Ville"><input value={form.ville} onChange={e => setForm(f => ({ ...f, ville: e.target.value }))} className={inp} placeholder="Casablanca" /></Field>
                  <Field label="Responsable"><input value={form.responsableNom} onChange={e => setForm(f => ({ ...f, responsableNom: e.target.value }))} className={inp} placeholder="Nom du responsable" /></Field>
                  <Field label="Téléphone"><input value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))} className={inp} placeholder="06xxxxxxxx" /></Field>
                  <Field label="Email"><input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inp} placeholder="depot@vita-fresh.ma" /></Field>
                  <Field label="Capacité (kg)"><input type="number" value={form.capaciteKg ?? ""} onChange={e => setForm(f => ({ ...f, capaciteKg: e.target.value ? +e.target.value : undefined }))} className={inp} placeholder="5000" /></Field>
                  <Field label="Heure ouverture"><input type="time" value={form.heureOuverture ?? "06:00"} onChange={e => setForm(f => ({ ...f, heureOuverture: e.target.value }))} className={inp} /></Field>
                  <Field label="Heure fermeture"><input type="time" value={form.heureFermeture ?? "22:00"} onChange={e => setForm(f => ({ ...f, heureFermeture: e.target.value }))} className={inp} /></Field>
                </div>
              </div>

              {/* GPS */}
              <div>
                <h3 className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-3 flex items-center gap-1.5"><span>📍</span> Coordonnées GPS</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Latitude GPS"><input type="number" step="0.000001" value={form.gpsLat ?? ""} onChange={e => setForm(f => ({ ...f, gpsLat: e.target.value ? +e.target.value : undefined }))} className={inp} placeholder="33.572672" /></Field>
                  <Field label="Longitude GPS"><input type="number" step="0.000001" value={form.gpsLng ?? ""} onChange={e => setForm(f => ({ ...f, gpsLng: e.target.value ? +e.target.value : undefined }))} className={inp} placeholder="-7.589843" /></Field>
                  <div className="md:col-span-2">
                    <Field label="Adresse GPS complète"><input value={form.gpsAdresseComplete ?? ""} onChange={e => setForm(f => ({ ...f, gpsAdresseComplete: e.target.value }))} className={inp} placeholder="Ex: 45 Rue Abou Bakr Seddik, Maarif, Casablanca" /></Field>
                  </div>
                  <div className="md:col-span-2 flex flex-wrap gap-3">
                    <button type="button" onClick={detectGPS} disabled={gpsLoading} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-60">
                      <Icon d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      {gpsLoading ? "Détection..." : "📍 Détecter ma position"}
                    </button>
                    {form.gpsLat && form.gpsLng && (
                      <button type="button" onClick={() => openGoogleMaps(form.gpsLat!, form.gpsLng!)} className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold">
                        🗺️ Voir sur Maps
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Circuit */}
              <div>
                <h3 className="text-xs font-bold text-orange-700 uppercase tracking-wide mb-3 flex items-center gap-1.5"><span>🗺️</span> Circuit de Livraison</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Nom du circuit"><input value={form.circuitNom ?? ""} onChange={e => setForm(f => ({ ...f, circuitNom: e.target.value }))} className={inp} placeholder="Ex: Zone Nord Casa, Circuit Maarif..." /></Field>
                  <Field label="Ordre dans la tournée"><input type="number" min={1} value={form.circuitOrdre ?? 1} onChange={e => setForm(f => ({ ...f, circuitOrdre: +e.target.value }))} className={inp} /></Field>
                  <div className="md:col-span-2">
                    <Field label="Zones couvertes"><input value={form.zoneCouverte ?? ""} onChange={e => setForm(f => ({ ...f, zoneCouverte: e.target.value }))} className={inp} placeholder="Ex: Maarif, Gauthier, Racine, Ain Diab..." /></Field>
                  </div>
                </div>
              </div>

              <Field label="Notes internes">
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className={inp + " min-h-[70px] resize-none"} placeholder="Informations importantes..." />
              </Field>

              <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative">
                  <input type="checkbox" className="sr-only" checked={form.actif} onChange={e => setForm(f => ({ ...f, actif: e.target.checked }))} />
                  <div className={`w-12 h-6 rounded-full transition-colors ${form.actif ? "bg-emerald-500" : "bg-slate-300"}`} />
                  <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.actif ? "translate-x-6" : ""}`} />
                </div>
                <span className="text-sm font-semibold text-slate-700">{form.actif ? "Dépôt actif" : "Dépôt inactif"}</span>
              </label>
            </div>
            <div className="sticky bottom-0 bg-white px-6 py-4 border-t border-slate-100 flex justify-end gap-3 rounded-b-2xl">
              <button onClick={() => setShowForm(false)} className="px-5 py-2.5 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl">Annuler</button>
              <button onClick={handleSave} disabled={saving} className="px-6 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl disabled:opacity-60 shadow-sm">
                {saving ? "Enregistrement..." : editing ? "✅ Mettre à jour" : "✅ Créer le dépôt"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function genDepotId() {
  return "DEPOT_" + Math.random().toString(36).substring(2, 9).toUpperCase()
}
