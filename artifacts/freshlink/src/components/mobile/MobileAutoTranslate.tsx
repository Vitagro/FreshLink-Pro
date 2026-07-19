"use client"

// ════════════════════════════════════════════════════════════════════════════
//  MobileAutoTranslate — couche de traduction automatique de l'app mobile.
//
//  Quand la langue = "ar" (Darija) ou "en", parcourt les nœuds texte du conteneur
//  mobile et remplace les phrases FRANÇAISES connues (lib/mobileDict) par leur
//  traduction. Tout ce qui n'est pas dans le dictionnaire reste en FRANÇAIS
//  (repli sûr — jamais de texte cassé). Réversible : en "fr"/"fr-ar" on restaure.
//
//  Sécurités :
//   • N'agit JAMAIS en français (français = source intacte).
//   • Anti-boucle : on ne traduit que FR → cible ; la cible n'est pas une clé FR.
//   • Ignore les champs de saisie de valeur, <script>, <style>, et le sélecteur
//     de langue. Traduit aussi les placeholders et les title/aria-label.
//   • MutationObserver pour le contenu dynamique (debounce rAF).
// ════════════════════════════════════════════════════════════════════════════

import { useEffect } from "react"
import { useLang } from "@/lib/i18n"
import { MOBILE_DICT, type Tr } from "@/lib/mobileDict"

// SELECT/OPTION ne sont PAS ici : un <option> affiche un texte au même titre
// qu'un <button>, ce n'est pas un champ de saisie libre (contrairement à
// INPUT/TEXTAREA) — il doit être traduit comme n'importe quel libellé, sinon
// tous les menus déroulants (type d'achat, type de caisse…) restent bloqués
// en français quel que soit l'onglet de langue choisi.
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "PATH", "INPUT", "TEXTAREA"])

function pick(tr: Tr, lang: string): string { return lang === "ar" ? tr.ar : tr.en }

// Mémorise si une traduction a été appliquée (pour restaurer proprement le FR).
let translatedOnce = false

export default function MobileAutoTranslate({ rootId }: { rootId: string }) {
  const lang = useLang()

  useEffect(() => {
    if (typeof window === "undefined") return
    const target = (lang as string) === "ar" || (lang as string) === "en" ? (lang as string) : null
    const root = document.getElementById(rootId)
    if (!root) return

    // Mémoire des originaux FR (pour restauration locale immédiate)
    const originals = new WeakMap<Node, string>()
    const attrOriginals = new WeakMap<Element, Record<string, string>>()

    document.documentElement.dir = (lang as string) === "ar" ? "rtl" : "ltr"

    if (!target) {
      // Repli FR : si on avait traduit, on recharge une fois pour un rendu 100% FR propre.
      if (translatedOnce) { translatedOnce = false; window.location.reload() }
      return
    }
    translatedOnce = true

    const translateTextNode = (node: Text) => {
      const raw = node.nodeValue ?? ""
      const key = raw.trim()
      if (!key) return
      const tr = MOBILE_DICT[key]
      if (!tr) return
      const out = pick(tr, target)
      if (out && out !== key) {
        if (!originals.has(node)) originals.set(node, raw)
        node.nodeValue = raw.replace(key, out)
      }
    }

    const translateAttrs = (el: Element) => {
      for (const attr of ["placeholder", "title", "aria-label"]) {
        const v = el.getAttribute(attr)
        if (!v) continue
        const tr = MOBILE_DICT[v.trim()]
        if (!tr) continue
        const out = pick(tr, target)
        if (out && out !== v.trim()) {
          const store = attrOriginals.get(el) ?? {}
          if (!(attr in store)) { store[attr] = v; attrOriginals.set(el, store) }
          el.setAttribute(attr, out)
        }
      }
    }

    const walk = (n: Node) => {
      if (n.nodeType === Node.TEXT_NODE) { translateTextNode(n as Text); return }
      if (n.nodeType !== Node.ELEMENT_NODE) return
      const el = n as Element
      if (SKIP_TAGS.has(el.tagName)) return
      if (el.closest("[data-no-translate]")) return
      translateAttrs(el)
      el.childNodes.forEach(walk)
    }

    let scheduled = false
    const pending = new Set<Node>()
    const run = () => {
      scheduled = false
      const nodes = [...pending]; pending.clear()
      try { nodes.forEach(n => { if (n.isConnected) walk(n) }) } catch { /* noop */ }
    }
    const schedule = (n: Node) => { pending.add(n); if (!scheduled) { scheduled = true; requestAnimationFrame(run) } }

    // Premier passage complet
    try { walk(root) } catch { /* noop */ }

    const obs = new MutationObserver(muts => {
      for (const m of muts) {
        if (m.type === "childList") m.addedNodes.forEach(n => schedule(n))
        else if (m.type === "characterData") {
          const k = (m.target.nodeValue ?? "").trim()
          if (k && MOBILE_DICT[k]) schedule(m.target)   // texte FR réapparu (re-render React)
        } else if (m.type === "attributes" && m.target) schedule(m.target)
      }
    })
    obs.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["placeholder", "title", "aria-label"] })

    return () => { obs.disconnect() }
  }, [lang, rootId])

  return null
}
