"use client"

import { useState, useEffect } from "react"

interface SiteEntry {
  id:           string
  name:         string
  nameAr:       string
  url:          string
  description:  string
  descriptionAr:string
  color:        string
  bgCard:       string
  border:       string
  badgeColor:   string
}

const DEFAULT_SITES: SiteEntry[] = [
  {
    id: "vita_fresh", name: "Vita Fresh", nameAr: "فيتا فريش",
    url: "https://shop.vita-core.org/",
    description: "Site vitrine et catalogue en ligne — présentez vos produits à vos clients",
    descriptionAr: "موقع العرض والكتالوج الإلكتروني",
    color: "bg-emerald-600", bgCard: "from-emerald-50 to-green-50",
    border: "border-emerald-200", badgeColor: "bg-emerald-100 text-emerald-800 border-emerald-300",
  },
]

const COLOR_OPTIONS = [
  { value: "bg-emerald-600", label: "🟢 Vert",   bgCard: "from-emerald-50 to-green-50",  border: "border-emerald-200", badge: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  { value: "bg-blue-600",    label: "🔵 Bleu",    bgCard: "from-blue-50 to-sky-50",       border: "border-blue-200",    badge: "bg-blue-100 text-blue-800 border-blue-300" },
  { value: "bg-violet-600",  label: "🟣 Violet",  bgCard: "from-violet-50 to-purple-50",  border: "border-violet-200",  badge: "bg-violet-100 text-violet-800 border-violet-300" },
  { value: "bg-amber-600",   label: "🟡 Jaune",   bgCard: "from-amber-50 to-yellow-50",   border: "border-amber-200",   badge: "bg-amber-100 text-amber-800 border-amber-300" },
  { value: "bg-rose-600",    label: "🔴 Rouge",   bgCard: "from-rose-50 to-pink-50",      border: "border-rose-200",    badge: "bg-rose-100 text-rose-800 border-rose-300" },
  { value: "bg-slate-700",   label: "⚫ Ardoise", bgCard: "from-slate-50 to-gray-50",     border: "border-slate-200",   badge: "bg-slate-100 text-slate-800 border-slate-300" },
]

const LS_KEY = "fl_external_links"
const ALLOWED_EDIT = ["super_super_admin","super_admin","admin"]

function loadSites(): SiteEntry[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "null") ?? DEFAULT_SITES } catch { return DEFAULT_SITES }
}
function saveSites(sites: SiteEntry[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(sites)) } catch {}
}
function genId() { return `site_${Date.now()}_${Math.random().toString(36).slice(2,6)}` }

const EMPTY_FORM = (): Omit<SiteEntry,"id"> => ({
  name: "", nameAr: "", url: "https://", description: "", descriptionAr: "",
  color: "bg-emerald-600", bgCard: "from-emerald-50 to-green-50",
  border: "border-emerald-200", badgeColor: "bg-emerald-100 text-emerald-800 border-emerald-300",
})

function InlineForm({ form, setForm, onSave, onCancel }: {
  form: Omit<SiteEntry,"id">
  setForm: (f: Omit<SiteEntry,"id">) => void
  onSave: () => void
  onCancel: () => void
}) {
  const handleColor = (val: string) => {
    const opt = COLOR_OPTIONS.find(c => c.value === val)
    if (opt) setForm({ ...form, color: val, bgCard: opt.bgCard, border: opt.border, badgeColor: opt.badge })
  }
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {([
          { key:"name",          label:"Nom (FR)",         ph:"ex: Vita Fresh" },
          { key:"nameAr",        label:"Nom (AR)",         ph:"بالعربية" },
          { key:"url",           label:"URL",              ph:"https://..." },
          { key:"description",   label:"Description (FR)", ph:"Courte description" },
          { key:"descriptionAr", label:"Description (AR)", ph:"وصف مختصر" },
        ]).map(f => (
          <div key={f.key} className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-600">{f.label}</label>
            <input type="text" placeholder={f.ph}
              value={(form as Record<string,string>)[f.key] ?? ""}
              onChange={e => setForm({ ...form, [f.key]: e.target.value })}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
        ))}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-600">Couleur de la carte</label>
          <select value={form.color} onChange={e => handleColor(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
            {COLOR_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-100">Annuler</button>
        <button onClick={onSave}   className="px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 shadow">Enregistrer</button>
      </div>
    </div>
  )
}

export default function BOExternalLinks({ user }: { user: { role: string } }) {
  const [sites, setSites]               = useState<SiteEntry[]>([])
  const [activeEmbed, setActiveEmbed]   = useState<string | null>(null)
  const [embedLoading, setEmbedLoading] = useState<Record<string,boolean>>({})
  const [editingId, setEditingId]       = useState<string | null>(null)
  const [editForm, setEditForm]         = useState<Omit<SiteEntry,"id">>(EMPTY_FORM())
  const [addMode, setAddMode]           = useState(false)
  const [addForm, setAddForm]           = useState<Omit<SiteEntry,"id">>(EMPTY_FORM())
  const [flash, setFlash]               = useState<string|null>(null)

  const canEdit = ALLOWED_EDIT.includes(user.role)

  useEffect(() => { setSites(loadSites()) }, [])

  const showFlash = (msg: string) => { setFlash(msg); setTimeout(() => setFlash(null), 2500) }

  const startEdit = (site: SiteEntry) => {
    setEditingId(site.id); setAddMode(false)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, ...rest } = site
    setEditForm(rest)
  }

  const saveEdit = () => {
    const updated = sites.map(s => s.id === editingId ? { ...s, ...editForm } : s)
    saveSites(updated); setSites(updated); setEditingId(null); showFlash("✅ Lien modifié.")
  }

  const handleAdd = () => {
    if (!addForm.name || !addForm.url) return
    const newSite: SiteEntry = { id: genId(), ...addForm }
    const updated = [...sites, newSite]
    saveSites(updated); setSites(updated); setAddMode(false); setAddForm(EMPTY_FORM()); showFlash("✅ Lien ajouté.")
  }

  const handleDelete = (id: string) => {
    if (!confirm("Supprimer ce lien ?")) return
    const updated = sites.filter(s => s.id !== id)
    saveSites(updated); setSites(updated); showFlash("🗑️ Lien supprimé.")
  }

  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">
            Liens Partenaires <span className="text-muted-foreground font-normal text-base">/ روابط الشركاء</span>
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">Accédez rapidement aux plateformes liées à votre activité</p>
        </div>
        {canEdit && !addMode && (
          <button onClick={() => { setAddMode(true); setEditingId(null) }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 shadow">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Ajouter un lien
          </button>
        )}
      </div>

      {/* Flash */}
      {flash && (
        <div className="px-4 py-2.5 rounded-xl bg-green-50 border border-green-200 text-sm font-semibold text-green-700">{flash}</div>
      )}

      {/* Add form */}
      {addMode && canEdit && (
        <InlineForm form={addForm} setForm={setAddForm} onSave={handleAdd} onCancel={() => setAddMode(false)} />
      )}

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sites.map(site => (
          <div key={site.id}>
            {editingId === site.id && canEdit ? (
              <InlineForm form={editForm} setForm={setEditForm} onSave={saveEdit} onCancel={() => setEditingId(null)} />
            ) : (
              <div className={`rounded-2xl border ${site.border} bg-gradient-to-br ${site.bgCard} overflow-hidden`}>
                <div className="p-5 flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl ${site.color} flex items-center justify-center shrink-0 shadow-md`}>
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-black text-slate-900 text-base">{site.name || "—"}</p>
                      {site.nameAr && (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${site.badgeColor}`} dir="rtl">{site.nameAr}</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">{site.description}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 font-mono truncate">{site.url}</p>
                  </div>
                </div>

                <div className="px-5 pb-5 flex gap-2 flex-wrap">
                  <a href={site.url} target="_blank" rel="noopener noreferrer"
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl ${site.color} text-white text-xs font-bold hover:opacity-90 transition-opacity shadow-sm`}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Ouvrir
                  </a>
                  <button onClick={() => {
                    if (activeEmbed === site.id) { setActiveEmbed(null); return }
                    setEmbedLoading(p => ({ ...p, [site.id]: true })); setActiveEmbed(site.id)
                  }} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    {activeEmbed === site.id ? "Fermer" : "Aperçu"}
                  </button>
                  {canEdit && (
                    <>
                      <button onClick={() => startEdit(site)}
                        className="flex items-center gap-1 px-3 py-2 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Modifier
                      </button>
                      {!DEFAULT_SITES.find(d => d.id === site.id) && (
                        <button onClick={() => handleDelete(site.id)}
                          className="flex items-center gap-1 px-3 py-2 rounded-xl border border-red-200 bg-red-50 text-red-600 text-xs font-bold hover:bg-red-100">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Supprimer
                        </button>
                      )}
                    </>
                  )}
                </div>

                {activeEmbed === site.id && (
                  <div className="mx-4 mb-4 rounded-xl overflow-hidden border border-slate-200 bg-white shadow-inner relative" style={{ height: 480 }}>
                    {embedLoading[site.id] && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
                        <svg className="w-8 h-8 animate-spin text-slate-400" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                      </div>
                    )}
                    <iframe src={site.url} title={site.name} className="w-full h-full border-0"
                      onLoad={() => setEmbedLoading(p => ({ ...p, [site.id]: false }))}
                      sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-800">
        <svg className="w-4 h-4 shrink-0 mt-0.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>
          Certains sites bloquent l&apos;aperçu intégré (X-Frame-Options) → utilisez &quot;Ouvrir&quot;.
          {canEdit && <span className="ml-1 font-semibold">Admins : vous pouvez modifier, ajouter et supprimer des liens.</span>}
        </span>
      </div>
    </div>
  )
}
