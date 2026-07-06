"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { store, type Article } from "@/lib/store"

export interface ArticleSelectorProps {
  value?: string                     // articleId selected
  valueName?: string                 // article name (for display when no id)
  onChange: (article: Article | null) => void
  placeholder?: string
  placeholderAr?: string
  disabled?: boolean
  showStock?: boolean
  showPrice?: boolean
  filterActif?: boolean              // only active articles (default true)
  familleFilter?: string             // filter by famille
  className?: string
  size?: "sm" | "md"
}

export default function ArticleSelector({
  value,
  valueName,
  onChange,
  placeholder = "Rechercher un article...",
  placeholderAr = "بحث عن مادة...",
  disabled = false,
  showStock = false,
  showPrice = false,
  filterActif = true,
  familleFilter,
  className = "",
  size = "md",
}: ArticleSelectorProps) {
  const [articles, setArticles] = useState<Article[]>([])
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Load articles on mount
  useEffect(() => {
    let list = store.getArticles()
    if (filterActif) list = list.filter(a => a.actif !== false)
    if (familleFilter) list = list.filter(a => a.famille === familleFilter)
    setArticles(list)
  }, [filterActif, familleFilter])

  // Display name of selected article
  const selectedArticle = value ? articles.find(a => a.id === value) : null
  const displayName = selectedArticle ? selectedArticle.nom : (valueName ?? "")

  // Filtered list based on search query
  const q = query.trim().toLowerCase()
  const filtered = q.length < 1
    ? articles.slice(0, 50)
    : articles.filter(a =>
        a.nom.toLowerCase().includes(q) ||
        a.nomAr?.includes(q) ||
        a.famille?.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q)
      ).slice(0, 30)

  const select = useCallback((art: Article) => {
    onChange(art)
    setQuery("")
    setOpen(false)
    inputRef.current?.blur()
  }, [onChange])

  const clear = useCallback(() => {
    onChange(null)
    setQuery("")
    setOpen(true)
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [onChange])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery("")
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const inputClass = size === "sm"
    ? "w-full pl-8 pr-8 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
    : "w-full pl-9 pr-9 py-2.5 text-sm rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"

  const stockColor = (art: Article) => {
    if (art.stockDisponible <= 0) return "text-red-500"
    if (art.stockDisponible < 50) return "text-orange-500"
    return "text-green-600"
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Input */}
      <div className="relative">
        {/* Search icon */}
        <svg
          className={`absolute top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 ${size === "sm" ? "left-2 w-3.5 h-3.5" : "left-3 w-4 h-4"}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>

        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          placeholder={selectedArticle || valueName ? displayName : placeholder}
          value={open ? query : (selectedArticle ? selectedArticle.nom : (valueName ?? ""))}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => { setFocused(true); setOpen(true) }}
          onBlur={() => setFocused(false)}
          className={`${inputClass} ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-text"} ${selectedArticle || valueName ? "font-semibold" : ""}`}
          autoComplete="off"
        />

        {/* Clear button */}
        {(selectedArticle || valueName) && !disabled && (
          <button
            type="button"
            onClick={clear}
            className={`absolute top-1/2 -translate-y-1/2 right-2 text-slate-400 hover:text-slate-600 transition-colors`}
            tabIndex={-1}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* Dropdown arrow */}
        {!selectedArticle && !valueName && (
          <button
            type="button"
            onClick={() => { setOpen(!open); inputRef.current?.focus() }}
            tabIndex={-1}
            className="absolute top-1/2 -translate-y-1/2 right-2 text-slate-400 hover:text-slate-600 transition-colors">
            <svg className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && !disabled && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white rounded-xl border border-slate-200 shadow-xl max-h-64 overflow-y-auto thin-scroll">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-slate-400">
              <svg className="w-8 h-8 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Aucun article trouvé
            </div>
          ) : (
            <>
              {/* Header with count */}
              <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                  {filtered.length} article{filtered.length > 1 ? "s" : ""}
                  {q ? ` pour "${q}"` : ""}
                </span>
                {!q && articles.length > 50 && (
                  <span className="text-[10px] text-slate-400">Tapez pour affiner</span>
                )}
              </div>

              {/* Group by famille */}
              {filtered.map((art, idx) => {
                const prevFamille = idx > 0 ? filtered[idx - 1].famille : null
                const showFamilleHeader = art.famille !== prevFamille
                const isSelected = art.id === value

                return (
                  <div key={art.id}>
                    {showFamilleHeader && (
                      <div className="px-3 py-1 bg-slate-50 border-b border-slate-100">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{art.famille}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => select(art)}
                      className={`w-full text-left px-3 py-2.5 hover:bg-blue-50 transition-colors flex items-center gap-3 ${isSelected ? "bg-blue-50" : ""}`}
                    >
                      {/* Photo or emoji */}
                      <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 border border-slate-200 bg-slate-100 flex items-center justify-center">
                        {art.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={art.photo} alt={art.nom} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-base">🥬</span>
                        )}
                      </div>

                      {/* Names */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-semibold truncate ${isSelected ? "text-blue-700" : "text-slate-800"}`}>
                            {art.nom}
                          </span>
                          {isSelected && (
                            <svg className="w-3.5 h-3.5 text-blue-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="font-arabic text-[11px] text-slate-500" dir="rtl" lang="ar">{art.nomAr}</span>
                          <span className="text-[10px] text-slate-300">·</span>
                          <span className="text-[10px] text-slate-400">{art.unite}</span>
                          {showStock && (
                            <>
                              <span className="text-[10px] text-slate-300">·</span>
                              <span className={`text-[10px] font-bold ${stockColor(art)}`}>
                                {art.stockDisponible.toFixed(1)} {art.unite}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Price */}
                      {showPrice && (
                        <div className="shrink-0 text-right">
                          <p className="text-xs font-bold text-slate-700">{art.prixAchat?.toFixed(2)} DH</p>
                          <p className="text-[10px] text-slate-400">PA/{art.unite}</p>
                        </div>
                      )}
                    </button>
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}
    </div>
  )
}
