"use client"

import { useState, useEffect } from "react"
import { getLang, setLang, applyStoredLang, type AppLang } from "@/lib/lang"

const LANG_OPTIONS: { value: AppLang; flag: string; label: string }[] = [
  { value: "fr-ar", flag: "🇫🇷🇲🇦", label: "FR / AR" },
  { value: "fr",    flag: "🇫🇷",    label: "Français" },
  { value: "ar",    flag: "🇲🇦",    label: "العربية"  },
  { value: "en",    flag: "🇬🇧",    label: "English"  },
]

export default function LangSwitcher({ compact = false }: { compact?: boolean }) {
  const [lang, setLangState] = useState<AppLang>("fr-ar")

  useEffect(() => {
    setLangState(getLang())
    applyStoredLang()
    const handler = (e: Event) => setLangState((e as CustomEvent<AppLang>).detail)
    window.addEventListener("fl_lang_change", handler)
    return () => window.removeEventListener("fl_lang_change", handler)
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value as AppLang
    setLang(next)
    setLangState(next)
  }

  const current = LANG_OPTIONS.find(o => o.value === lang) ?? LANG_OPTIONS[0]

  if (compact) {
    return (
      <select
        value={lang}
        onChange={handleChange}
        title="Langue / Language"
        className="text-[11px] font-bold rounded-lg border border-slate-200 bg-slate-100 px-1.5 py-1 cursor-pointer hover:bg-white transition-colors focus:outline-none focus:ring-1 focus:ring-slate-300"
        style={{ maxWidth: 70 }}
      >
        {LANG_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.flag} {o.label}</option>
        ))}
      </select>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-base leading-none">{current.flag}</span>
      <select
        value={lang}
        onChange={handleChange}
        title="Langue / Language"
        className="text-[11px] font-bold rounded-xl border border-slate-200 bg-slate-100 px-2 py-1.5 cursor-pointer hover:bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300"
      >
        {LANG_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.flag} {o.label}</option>
        ))}
      </select>
    </div>
  )
}
