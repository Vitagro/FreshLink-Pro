"use client"
import { useState, useRef, useEffect } from "react"
import { store, type Article } from "@/lib/store"

interface Props {
  articles: Article[]
  value: string       // articleId
  onChange: (articleId: string, article: Article | null) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export default function ArticleCombobox({ articles, value, onChange, placeholder = "Rechercher un article...", className = "", disabled = false }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  const selected = articles.find(a => a.id === value)

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const filtered = articles.filter(a => {
    if (!search) return true
    const q = search.toLowerCase()
    return a.nom.toLowerCase().includes(q) || ((a as {reference?:string}).reference ?? "").toLowerCase().includes(q)
  }).slice(0, 40)

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { setOpen(v => !v); if (!open) setSearch("") }}
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-left transition-all focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50"
      >
        {selected ? (
          <span className="flex-1 flex items-center gap-2 truncate">
            <span className="font-semibold text-foreground truncate">{selected.nom}</span>
            <span className="text-xs text-muted-foreground shrink-0">{store.computePV(selected)} DH/{selected.unite}</span>
            {selected.stockDisponible <= 0 && (
              <span className="text-[9px] font-bold px-1 rounded bg-orange-100 text-orange-600 shrink-0">Rupture</span>
            )}
          </span>
        ) : (
          <span className="flex-1 text-muted-foreground truncate">{placeholder}</span>
        )}
        <svg className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-background border border-border rounded-xl shadow-lg overflow-hidden max-h-64 flex flex-col">
          {/* Search */}
          <div className="px-3 py-2 border-b border-border">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-muted">
              <svg className="w-3.5 h-3.5 text-muted-foreground shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                autoFocus
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Nom ou référence..."
                className="flex-1 bg-transparent text-sm focus:outline-none text-foreground placeholder:text-muted-foreground"
              />
              {search && (
                <button type="button" onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>
          </div>
          {/* List */}
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground text-center">Aucun article trouvé</p>
            ) : (
              filtered.map(art => (
                <button key={art.id} type="button"
                  onClick={() => { onChange(art.id, art); setOpen(false); setSearch("") }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-muted transition-colors ${art.id === value ? "bg-primary/5" : ""}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-foreground truncate">{art.nom}</span>
                      {art.stockDisponible <= 0 && (
                        <span className="text-[9px] font-bold px-1 rounded bg-orange-100 text-orange-600 shrink-0">Rupture</span>
                      )}
                      {art.id === value && (
                        <svg className="w-3.5 h-3.5 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">{store.computePV(art)} DH/{art.unite}{art.stockDisponible > 0 ? ` · Stock: ${art.stockDisponible} ${art.unite}` : ""}</p>
                  </div>
                </button>
              ))
            )}
          </div>
          {/* Clear selection */}
          {value && (
            <div className="border-t border-border">
              <button type="button" onClick={() => { onChange("", null); setOpen(false) }}
                className="w-full px-3 py-2 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors text-left">
                Effacer la sélection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
