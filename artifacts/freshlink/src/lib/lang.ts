const KEY = "fl_lang"
export type AppLang = "fr" | "ar" | "en" | "fr-ar"

export function getLang(): AppLang {
  if (typeof window === "undefined") return "fr-ar"
  return (localStorage.getItem(KEY) as AppLang) ?? "fr-ar"
}

export function setLang(lang: AppLang) {
  localStorage.setItem(KEY, lang)
  const dir = lang === "ar" ? "rtl" : "ltr"
  const htmlLang = lang === "ar" ? "ar" : lang === "en" ? "en" : "fr"
  document.documentElement.dir  = dir
  document.documentElement.lang = htmlLang
  window.dispatchEvent(new CustomEvent("fl_lang_change", { detail: lang }))
}

export function applyStoredLang() {
  const lang = getLang()
  document.documentElement.dir  = lang === "ar" ? "rtl" : "ltr"
  document.documentElement.lang = lang === "ar" ? "ar" : lang === "en" ? "en" : "fr"
}
