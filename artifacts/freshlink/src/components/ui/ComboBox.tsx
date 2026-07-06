"use client"

import { useState, useRef, useEffect } from "react"

export interface ComboItem {
  id: string
  label: string
  sublabel?: string
  badge?: string
  badgeColor?: string
}

interface Props {
  items: ComboItem[]
  value: string            // id sélectionné
  inputValue?: string      // texte affiché (si différent du label)
  onChange: (id: string, label: string) => void
  onInputChange?: (text: string) => void  // pour saisie libre
  placeholder?: string
  disabled?: boolean
  className?: string
  variant?: "default" | "mobile"  // mobile = styles adaptés touch
  allowFreeText?: boolean          // autoriser texte libre non dans la liste
}

export default function ComboBox({
  items,
  value,
  inputValue,
  onChange,
  onInputChange,
  placeholder = "Rechercher…",
  disabled = false,
  className = "",
  variant = "default",
  allowFreeText = false,
}: Props) {
  const [query, setQuery]     = useState("")
  const [open, setOpen]       = useState(false)
  const [focused, setFocused] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef     = useRef<HTMLInputElement>(null)

  // Texte affiché dans l'input
  const displayValue = inputValue ?? (value ? (items.find(i => i.id === value)?.label ?? value) : "")

  // Fermer si clic extérieur
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery("")
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  // Filtrer les items
  const q = query.toLowerCase().trim()
  const filtered = q.length === 0
    ? items.slice(0, 40)
    : items.filter(i =>
        i.label.toLowerCase().includes(q) ||
        i.sublabel?.toLowerCase().includes(q) ||
        i.badge?.toLowerCase().includes(q)
      ).slice(0, 20)

  const isMobile = variant === "mobile"

  const inputCls = isMobile
    ? `w-full px-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder:font-normal ${className}`
    : `w-full px-3 py-2 rounded-xl border ${focused ? "border-blue-400 ring-2 ring-blue-100" : "border-border"} bg-background text-sm focus:outline-none transition-shadow ${className}`

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const txt = e.target.value
    setQuery(txt)
    setOpen(true)
    if (allowFreeText) {
      onInputChange?.(txt)
      onChange("", txt)
    }
  }

  const handleSelect = (item: ComboItem) => {
    onChange(item.id, item.label)
    onInputChange?.(item.label)
    setQuery("")
    setOpen(false)
    inputRef.current?.blur()
  }

  const handleFocus = () => {
    setFocused(true)
    setOpen(true)
    setQuery("")
  }

  const handleBlur = () => {
    setFocused(false)
    // petit délai pour que le click sur l'item passe avant la fermeture
    setTimeout(() => setOpen(false), 150)
  }

  const chevron = (
    <svg className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
      fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  )

  const clearBtn = value || (allowFreeText && displayValue) ? (
    <button type="button" tabIndex={-1}
      onMouseDown={e => { e.preventDefault(); onChange("", ""); onInputChange?.(""); setQuery("") }}
      className="w-4 h-4 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center hover:bg-slate-300 transition-colors shrink-0">
      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  ) : null

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={open ? query : displayValue}
          onChange={handleInput}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          className={inputCls}
          autoComplete="off"
        />
        <div className="absolute right-2 flex items-center gap-1.5">
          {clearBtn}
          {chevron}
        </div>
      </div>

      {open && filtered.length > 0 && (
        <div className={`absolute z-50 w-full mt-1 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden ${isMobile ? "max-h-56" : "max-h-64"} overflow-y-auto`}>
          {filtered.map(item => {
            const isSelected = item.id === value
            return (
              <button
                key={item.id}
                type="button"
                onMouseDown={e => { e.preventDefault(); handleSelect(item) }}
                className={`w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-blue-50 transition-colors border-b border-slate-50 last:border-0 ${isSelected ? "bg-blue-50" : ""}`}
              >
                {isSelected && (
                  <svg className="w-3.5 h-3.5 text-blue-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                <div className="flex-1 min-w-0">
                  <span className={`text-sm font-semibold text-slate-800 block truncate ${isSelected ? "text-blue-700" : ""}`}>
                    {item.label}
                  </span>
                  {item.sublabel && (
                    <span className="text-xs text-slate-400 block truncate">{item.sublabel}</span>
                  )}
                </div>
                {item.badge && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${item.badgeColor ?? "bg-slate-100 text-slate-600"}`}>
                    {item.badge}
                  </span>
                )}
              </button>
            )
          })}
          {q.length > 0 && filtered.length === 0 && (
            <div className="px-4 py-3 text-sm text-slate-400 text-center">
              Aucun résultat pour &ldquo;{q}&rdquo;
            </div>
          )}
        </div>
      )}
    </div>
  )
}
