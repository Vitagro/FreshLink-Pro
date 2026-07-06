import { useState, useCallback, useEffect, useRef } from "react"

// ── Types ──────────────────────────────────────────────────────────────────────
interface DbSource {
  id:       string
  label:    string
  color:    string
  url:      string
  anonKey:  string
  email:    string
  password: string
  tables:   string[]
}

type LoadState  = "idle" | "loading" | "ok" | "error"
type AuthState  = "idle" | "signing" | "ok" | "error"

// ── Constants ──────────────────────────────────────────────────────────────────
const SOURCES: DbSource[] = [
  {
    id:       "gestflux",
    label:    "GestFlux",
    color:    "blue",
    url:      import.meta.env.VITE_GESTFLUX_URL ?? "https://dngqklliynfoqkalttpu.supabase.co",
    anonKey:  import.meta.env.VITE_GESTFLUX_ANON_KEY ?? "",
    email:    "hamza@alephcapital.io",
    password: "comptable1",
    tables:   ["products", "categories", "suppliers", "users", "orders", "stock"],
  },
  {
    id:       "iziry",
    label:    "Iziry",
    color:    "violet",
    url:      import.meta.env.VITE_IZIRY_URL ?? "https://gmbvrjxteoxbiyternfz.supabase.co",
    anonKey:  import.meta.env.VITE_IZIRY_ANON_KEY ?? "",
    email:    "hamza@iziry.local",
    password: "123456",
    tables:   ["commandes", "factures", "articles", "depots", "clients", "profiles", "livraisons"],
  },
]

const COLOR: Record<string, Record<string, string>> = {
  blue:   { badge: "bg-blue-100 text-blue-700",   dot: "bg-blue-500",   btn: "bg-blue-600 hover:bg-blue-700",   ring: "ring-blue-400",   header: "from-blue-50 to-blue-100" },
  violet: { badge: "bg-violet-100 text-violet-700", dot: "bg-violet-500", btn: "bg-violet-600 hover:bg-violet-700", ring: "ring-violet-400", header: "from-violet-50 to-violet-100" },
}

const PAGE_SIZE = 50

// ── Auth helper — via api-server proxy to avoid CORS on Supabase auth ──────────
async function signIn(src: DbSource): Promise<string | null> {
  try {
    const res = await fetch("/api/ext/db-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: src.id, email: src.email, password: src.password }),
    })
    if (!res.ok) return null
    const json = await res.json() as { ok: boolean; access_token?: string }
    return json.access_token ?? null
  } catch {
    return null
  }
}

// ── Data helpers ───────────────────────────────────────────────────────────────
function makeHeaders(src: DbSource, token: string | null) {
  const bearer = token ?? src.anonKey
  return {
    "apikey":        src.anonKey,
    "Authorization": `Bearer ${bearer}`,
    "Accept":        "application/json",
    "Prefer":        "count=exact",
  }
}

async function fetchTable(
  src: DbSource,
  token: string | null,
  table: string,
  page: number,
  search: string,
): Promise<{ rows: Record<string, unknown>[]; count: number; error?: string }> {
  const offset = page * PAGE_SIZE
  const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) })
  if (search.trim()) {
    params.set("or", `(nom.ilike.*${search}*,nom_fr.ilike.*${search}*,ref.ilike.*${search}*,raison_sociale.ilike.*${search}*,code.ilike.*${search}*)`)
  }
  try {
    const res = await fetch(`${src.url}/rest/v1/${table}?${params}`, { headers: makeHeaders(src, token) })
    if (!res.ok) {
      const text = await res.text()
      return { rows: [], count: 0, error: `${res.status} — ${text.slice(0, 300)}` }
    }
    const rows = await res.json() as Record<string, unknown>[]
    const hdr   = res.headers.get("content-range")
    const count = hdr ? parseInt(hdr.split("/")[1] ?? "0") : rows.length
    return { rows, count }
  } catch (e: unknown) {
    return { rows: [], count: 0, error: String(e) }
  }
}

async function pingTable(src: DbSource, token: string | null, table: string): Promise<boolean> {
  try {
    const res = await fetch(`${src.url}/rest/v1/${table}?limit=1`, { headers: makeHeaders(src, token) })
    return res.ok
  } catch {
    return false
  }
}

// ── Cell formatting ────────────────────────────────────────────────────────────
function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return "—"
  if (typeof v === "boolean")        return v ? "✓" : "✗"
  if (typeof v === "object")         return JSON.stringify(v).slice(0, 80)
  return String(v)
}
function isBool(v: unknown): boolean { return typeof v === "boolean" }
function isNum(v: unknown): boolean  { return typeof v === "number" }

// ── Main component ─────────────────────────────────────────────────────────────
export default function BOImportExterne() {
  const [activeSource, setActiveSource] = useState<DbSource>(SOURCES[0])
  const [activeTable,  setActiveTable]  = useState<string | null>(null)
  const [tableStatus,  setTableStatus]  = useState<Record<string, boolean>>({})

  const [rows,   setRows]   = useState<Record<string, unknown>[]>([])
  const [count,  setCount]  = useState(0)
  const [page,   setPage]   = useState(0)
  const [search, setSearch] = useState("")
  const [load,   setLoad]   = useState<LoadState>("idle")
  const [error,  setError]  = useState<string | null>(null)

  // Auth tokens per source id
  const [authState,  setAuthState]  = useState<Record<string, AuthState>>({})
  const [authTokens, setAuthTokens] = useState<Record<string, string | null>>({})

  const tokensRef = useRef<Record<string, string | null>>({})

  const cols = rows.length > 0 ? Object.keys(rows[0]) : []

  // ── Auto sign-in for all sources on mount ───────────────────────────────────
  useEffect(() => {
    SOURCES.forEach(src => {
      setAuthState(prev => ({ ...prev, [src.id]: "signing" }))
      signIn(src).then(token => {
        tokensRef.current[src.id] = token
        setAuthTokens(prev => ({ ...prev, [src.id]: token }))
        setAuthState(prev => ({ ...prev, [src.id]: token ? "ok" : "error" }))
      })
    })
  }, [])

  // ── Ping tables when source or token changes ────────────────────────────────
  useEffect(() => {
    const src   = activeSource
    const token = tokensRef.current[src.id] ?? null
    setActiveTable(null)
    setRows([]); setCount(0); setPage(0); setSearch(""); setError(null); setLoad("idle")
    setTableStatus({})
    Promise.all(src.tables.map(async t => ({ t, ok: await pingTable(src, token, t) }))).then(results => {
      const status: Record<string, boolean> = {}
      results.forEach(({ t, ok }) => { status[t] = ok })
      setTableStatus(status)
    })
  }, [activeSource, authTokens])   // re-ping when token arrives

  const loadTable = useCallback(async (src: DbSource, table: string, pg: number, q: string) => {
    const token = tokensRef.current[src.id] ?? null
    setLoad("loading"); setError(null)
    const res = await fetchTable(src, token, table, pg, q)
    if (res.error) { setError(res.error); setLoad("error"); return }
    setRows(res.rows); setCount(res.count); setLoad("ok")
  }, [])

  const selectTable = (table: string) => {
    setActiveTable(table); setPage(0); setSearch(""); setRows([]); setCount(0)
    loadTable(activeSource, table, 0, "")
  }

  const handleSearch = (q: string) => {
    setSearch(q); setPage(0)
    if (activeTable) loadTable(activeSource, activeTable, 0, q)
  }

  const goPage = (p: number) => {
    setPage(p)
    if (activeTable) loadTable(activeSource, activeTable, p, search)
  }

  const totalPages = Math.ceil(count / PAGE_SIZE)

  // Auth badge per source
  const AuthBadge = ({ srcId }: { srcId: string }) => {
    const st = authState[srcId]
    if (st === "signing") return <span className="text-[9px] text-amber-500 font-semibold animate-pulse">Connexion…</span>
    if (st === "ok")      return <span className="text-[9px] text-emerald-600 font-semibold">● Connecté</span>
    if (st === "error")   return <span className="text-[9px] text-red-500 font-semibold">✗ Erreur auth</span>
    return null
  }

  return (
    <div className="flex h-full min-h-[calc(100vh-120px)] bg-slate-50">
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="w-64 shrink-0 flex flex-col border-r border-slate-200 bg-white">
        <div className="px-4 py-4 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-800">Sources externes</h2>
          <p className="text-[11px] text-slate-400 mt-0.5">Lecture seule — 2 bases connectées</p>
        </div>

        {SOURCES.map(src => {
          const c          = COLOR[src.color]
          const accessible = src.tables.filter(t => tableStatus[t] === true)
          const isSrcActive = activeSource.id === src.id
          return (
            <div key={src.id} className="border-b border-slate-100">
              {/* Source header */}
              <button
                onClick={() => setActiveSource(src)}
                className={`w-full flex items-center gap-2.5 px-4 py-3 text-left transition-colors ${isSrcActive ? `bg-gradient-to-r ${c.header}` : "hover:bg-slate-50"}`}>
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.dot}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-bold ${isSrcActive ? "text-slate-800" : "text-slate-600"}`}>{src.label}</p>
                  <p className="text-[10px] text-slate-400 truncate">{src.url.replace("https://", "").split(".")[0]}.supabase.co</p>
                  <AuthBadge srcId={src.id} />
                </div>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${c.badge}`}>{accessible.length}/{src.tables.length}</span>
              </button>

              {/* Tables list */}
              {isSrcActive && (
                <div className="pb-1">
                  {src.tables.map(t => {
                    const ok      = tableStatus[t]
                    const isActive = activeTable === t && activeSource.id === src.id
                    return (
                      <button
                        key={t}
                        disabled={ok === false}
                        onClick={() => ok !== false && selectTable(t)}
                        className={`w-full flex items-center gap-2 pl-8 pr-3 py-2 text-left text-xs transition-colors
                          ${ok === false ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
                          ${isActive ? `${c.badge} font-bold ring-1 ${c.ring} rounded-lg mx-1` : "text-slate-600 hover:bg-slate-50"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ok === true ? "bg-emerald-400" : ok === false ? "bg-red-300" : "bg-slate-300"}`} />
                        <span className="truncate">{t}</span>
                        {ok === undefined && <span className="ml-auto text-[9px] text-slate-300">…</span>}
                        {ok === false && <span className="ml-auto text-[9px] text-red-400">RLS</span>}
                      </button>
                    )
                  })}
                  {/* Custom table input */}
                  <div className="px-3 pt-2 pb-1">
                    <form onSubmit={e => {
                      e.preventDefault()
                      const v = (e.currentTarget.elements.namedItem("t") as HTMLInputElement).value.trim()
                      if (v) { selectTable(v); (e.currentTarget.elements.namedItem("t") as HTMLInputElement).value = "" }
                    }}>
                      <input name="t" placeholder="Autre table…" className="w-full px-2.5 py-1.5 text-[11px] border border-dashed border-slate-300 rounded-lg focus:outline-none focus:border-slate-400 bg-transparent placeholder:text-slate-400" />
                    </form>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {/* Legend */}
        <div className="mt-auto px-4 py-3 border-t border-slate-100 text-[10px] text-slate-400 space-y-1">
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" /> Table accessible</div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-300" /> RLS bloquée</div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-300" /> Vérification…</div>
        </div>
      </aside>

      {/* ── Main panel ──────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {!activeTable ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-slate-700">Sélectionnez une table</p>
              <p className="text-xs text-slate-400 mt-1">Choisissez une source et une table dans le panneau gauche</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {SOURCES.map(src => (
                <div key={src.id} className="text-xs px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-600">
                  <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${COLOR[src.color].dot}`} />
                  {src.label}
                  {authState[src.id] === "ok" && <span className="ml-1.5 text-emerald-500">✓</span>}
                  {authState[src.id] === "signing" && <span className="ml-1.5 text-amber-400 animate-pulse">…</span>}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className={`flex items-center gap-3 px-6 py-3 border-b border-slate-200 bg-gradient-to-r ${COLOR[activeSource.color].header}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${COLOR[activeSource.color].badge}`}>{activeSource.label}</span>
                  <h3 className="text-sm font-bold text-slate-800">{activeTable}</h3>
                  {load === "ok" && <span className="text-[11px] text-slate-500">{count.toLocaleString("fr")} ligne{count > 1 ? "s" : ""}</span>}
                  {authState[activeSource.id] === "ok" && (
                    <span className="text-[9px] text-emerald-600 font-semibold px-1.5 py-0.5 bg-emerald-50 rounded-full border border-emerald-200">
                      ● {activeSource.email}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5 truncate">{activeSource.url}/rest/v1/{activeTable}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* Search */}
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white rounded-lg border border-slate-200 shadow-sm">
                  <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input value={search} onChange={e => handleSearch(e.target.value)}
                    placeholder="Rechercher…"
                    className="w-32 text-xs bg-transparent focus:outline-none text-slate-700 placeholder:text-slate-400" />
                  {search && <button onClick={() => handleSearch("")} className="text-slate-400 hover:text-slate-600">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>}
                </div>
                {/* Refresh */}
                <button onClick={() => loadTable(activeSource, activeTable, page, search)}
                  disabled={load === "loading"}
                  className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-slate-700 shadow-sm disabled:opacity-50">
                  <svg className={`w-3.5 h-3.5 ${load === "loading" ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto">
              {load === "loading" && (
                <div className="flex items-center justify-center h-40 gap-2 text-slate-400">
                  <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span className="text-sm">Chargement…</span>
                </div>
              )}

              {load === "error" && (
                <div className="p-6">
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                    <p className="text-sm font-bold text-red-700 mb-1">Erreur de lecture</p>
                    <p className="text-xs text-red-600 font-mono whitespace-pre-wrap break-all">{error}</p>
                  </div>
                </div>
              )}

              {load === "ok" && rows.length === 0 && (
                <div className="flex flex-col items-center justify-center h-40 text-slate-400">
                  <p className="text-sm">Table vide ou aucun résultat</p>
                  {search && <button onClick={() => handleSearch("")} className="text-xs text-blue-500 mt-1 underline">Effacer la recherche</button>}
                </div>
              )}

              {load === "ok" && rows.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse min-w-max">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-slate-100">
                        {cols.map(c => (
                          <th key={c} className="px-3 py-2 text-left font-semibold text-slate-600 uppercase tracking-wide text-[10px] border-b border-slate-200 whitespace-nowrap">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {rows.map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                          {cols.map(c => {
                            const v = row[c]
                            return (
                              <td key={c} className="px-3 py-2 text-slate-700 max-w-[220px] truncate whitespace-nowrap">
                                {isBool(v) ? (
                                  <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${v ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{v ? "✓ Oui" : "✗ Non"}</span>
                                ) : isNum(v) ? (
                                  <span className="font-mono text-slate-800">{(v as number).toLocaleString("fr")}</span>
                                ) : v === null || v === undefined ? (
                                  <span className="text-slate-300 italic text-[10px]">null</span>
                                ) : (
                                  <span title={fmtVal(v)}>{fmtVal(v)}</span>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Pagination */}
            {load === "ok" && totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-white shrink-0">
                <span className="text-xs text-slate-500">
                  Page {page + 1} / {totalPages} — {count.toLocaleString("fr")} lignes
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => goPage(0)} disabled={page === 0} className="px-2 py-1 rounded text-xs border border-slate-200 text-slate-600 disabled:opacity-30 hover:bg-slate-50">«</button>
                  <button onClick={() => goPage(page - 1)} disabled={page === 0} className="px-2 py-1 rounded text-xs border border-slate-200 text-slate-600 disabled:opacity-30 hover:bg-slate-50">‹</button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, k) => {
                    const p = Math.max(0, Math.min(totalPages - 5, page - 2)) + k
                    return (
                      <button key={p} onClick={() => goPage(p)}
                        className={`w-7 h-7 rounded text-xs border ${p === page ? `${COLOR[activeSource.color].badge} font-bold border-transparent` : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                        {p + 1}
                      </button>
                    )
                  })}
                  <button onClick={() => goPage(page + 1)} disabled={page >= totalPages - 1} className="px-2 py-1 rounded text-xs border border-slate-200 text-slate-600 disabled:opacity-30 hover:bg-slate-50">›</button>
                  <button onClick={() => goPage(totalPages - 1)} disabled={page >= totalPages - 1} className="px-2 py-1 rounded text-xs border border-slate-200 text-slate-600 disabled:opacity-30 hover:bg-slate-50">»</button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
