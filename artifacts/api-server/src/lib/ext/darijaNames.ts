/**
 * darijaNames.ts — Noms des produits en DARIJA marocaine.
 * Appliqué au endpoint /api/ext/catalogue : le nom arabe servi (nomAr) est
 * remplacé par son équivalent darija quand on le connaît, sans modifier Supabase.
 * Clé = nom français normalisé (minuscule, sans accent, racine sans pluriel).
 */

const DARIJA: Record<string, string> = {
  // ── Légumes ────────────────────────────────────────────────────────────
  "tomate":            "ماطيشة",
  "tomate cerise":     "ماطيشة كرزية",
  "tomate ronde":      "ماطيشة مدورة",
  "tomate longue":     "ماطيشة طويلة",
  "tomate grappe":     "ماطيشة عنقودية",
  "pomme de terre":    "بطاطا",
  "patate":            "بطاطا",
  "patate douce":      "بطاطا حلوة",
  "oignon":            "بصلة",
  "oignon rouge":      "بصلة حمرا",
  "carotte":           "خيزو",
  "courgette":         "كرعة خضرا",
  "aubergine":         "دنجال",
  "poivron":           "فلفلة",
  "poivron rouge":     "فلفلة حمرا",
  "poivron vert":      "فلفلة خضرا",
  "poivron jaune":     "فلفلة صفرا",
  "piment":            "فلفل حار",
  "piment fort":       "سودانية",
  "concombre":         "خيار",
  "ail":               "تومة",
  "navet":             "لفت",
  "chou":              "كرومب",
  "chou-fleur":        "شيفلور",
  "chou fleur":        "شيفلور",
  "brocoli":           "بروكلي",
  "laitue":            "خص",
  "salade":            "خص",
  "epinard":           "سلق",
  "petit pois":        "جلبانة",
  "pois":              "جلبانة",
  "haricot vert":      "لوبيا خضرا",
  "haricot":           "لوبيا",
  "feve":              "فول",
  "artichaut":         "قوق",
  "artichaud":         "قوق",
  "courge":            "غرعة حمرا",
  "potiron":           "غرعة حمرا",
  "betterave":         "باربا",
  "radis":             "فجل",
  "celeri":            "كرافس",
  "fenouil":           "نافع",
  "navet long":        "لفت",
  "mais":              "درة",
  "okra":              "ملوخية",
  "bamia":             "ملوخية",
  "champignon":        "فقع",
  "asperge":           "سبارا",
  "panais":            "لفت أبيض",
  "taro":              "قلقاس",
  // ── Fruits ─────────────────────────────────────────────────────────────
  "pomme":             "تفاح",
  "banane":            "بنان",
  "orange":            "ليمون",
  "clementine":        "كليمونتين",
  "mandarine":         "مندارين",
  "citron":            "حامض",
  "fraise":            "فريز",
  "raisin":            "عنب",
  "pasteque":          "دلاح",
  "melon":             "بطيخ",
  "peche":             "خوخ",
  "nectarine":         "نكتارين",
  "abricot":           "مشماش",
  "prune":             "برقوق",
  "figue":             "كرموس",
  "figue de barbarie": "كرموس النصارى",
  "grenade":           "رمان",
  "datte":             "تمر",
  "avocat":            "أفوكا",
  "ananas":            "أناناس",
  "mangue":            "مانڭو",
  "kiwi":              "كيوي",
  "poire":             "لنجاص",
  "cerise":            "حب الملوك",
  "coing":             "سفرجل",
  "kaki":              "كاكي",
  // ── Herbes aromatiques ─────────────────────────────────────────────────
  "coriandre":         "قزبر",
  "persil":            "معدنوس",
  "menthe":            "نعناع",
  "basilic":           "حبق",
  "thym":              "زعتر",
  "zaatar":            "زعتر",
  "romarin":           "يازير",
  "verveine":          "لويزة",
  "laurier":           "ورق سيدنا موسى",
  "sauge":             "سالمية",
  "origan":            "زعتر بري",
  "aneth":             "شبت",
  "ciboulette":        "بصيلة",
  "cumin":             "كمون",
  // ── Ajouts (nouveaux produits) ─────────────────────────────────────────
  "papaye":            "بابايا",
  "coco":              "جوز الهند",
  "noix de coco":      "جوز الهند",
  "litchi":            "ليتشي",
  "mure":              "توت",
  "cassis":            "كاسيس",
  "fruit de la passion":"ماراكوجا",
  "pamplemousse":      "بانبلموس",
  "poireau":           "بورو",
  "echalote":          "بصلة صغيرة",
  "gingembre":         "سكنجبير",
  "curcuma":           "خرقوم",
  "pleurote":          "فقع",
  "marjolaine":        "مردقوش",
  "estragon":          "طرخون",
  "roquette":          "روكا",
  "cresson":           "قرة",
  "blette":            "سلق",
  "endive":            "أنديف",
  "poireau vert":      "بورو",
}

export function darijaName(nom: string): string | null {
  if (!nom) return null
  const norm = nom.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim()
  const root = norm.replace(/\([^)]*\)/g, "").trim().replace(/s\b/g, "")
  if (DARIJA[norm]) return DARIJA[norm]
  if (DARIJA[root]) return DARIJA[root]
  // partial : clé la plus longue contenue dans le nom
  const keys = Object.keys(DARIJA).sort((a, b) => b.length - a.length)
  for (const k of keys) {
    if (norm.includes(k) || root.includes(k)) return DARIJA[k]
  }
  return null
}
