// lib/vfIds.ts — Vita Fresh ID naming convention reference & utilities

export const VF_PREFIXES = {
  article:      "VFP",
  user:         "VFU",
  client:       "VFC",
  fournisseur:  "VFF",
  commande:     "VFCO",
  bonLivraison: "VFBL",
  bonAchat:     "VFBA",
  bonPrep:      "VFBP",
  trip:         "VFTR",
  livreur:      "VFLV",
  retour:       "VFRT",
  purchaseOrder:"VFPO",
  reception:    "VFRC",
  depot:        "VFDP",
  salarie:      "VFSL",
  document:     "VFDC",
} as const

export type VFPrefix = typeof VF_PREFIXES[keyof typeof VF_PREFIXES]

/** Generate a sequential VF ID by reading existing IDs */
export function genVFId(prefix: string, existingIds: string[]): string {
  let max = 0
  const re = new RegExp(`^${prefix}(\\d+)$`)
  for (const id of existingIds) {
    const m = re.exec(id)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `${prefix}${String(max + 1).padStart(5, "0")}`
}

/** Generate a VF ID with timestamp suffix (for non-sequential use) */
export function genVFTimestampId(prefix: string): string {
  const ts  = Date.now().toString(36).toUpperCase().slice(-4)
  const rnd = Math.floor(Math.random() * 9999).toString().padStart(4, "0")
  return `${prefix}${ts}${rnd}`
}

// ── Article ID mapping (old → new) ───────────────────────────────────────────
export const ARTICLE_ID_MAP: Record<string, string> = {
  "a1":"VFP00001","a2":"VFP00002","a2r":"VFP00003","a2f":"VFP00004","a2d":"VFP00005",
  "a3":"VFP00006","a4":"VFP00007","a5":"VFP00008","a6":"VFP00009","a7":"VFP00010",
  "a8":"VFP00011","a9":"VFP00012","a10":"VFP00013","a11":"VFP00014","a12":"VFP00015",
  "a13":"VFP00016","a14":"VFP00017","a15":"VFP00018","a16":"VFP00019","a17":"VFP00020",
  "a18":"VFP00021","a19":"VFP00022","a20":"VFP00023","a21":"VFP00024","a22":"VFP00025",
  "a23":"VFP00026","a24":"VFP00027","a25":"VFP00028","a26":"VFP00029","a27":"VFP00030",
  "a28":"VFP00031","a29":"VFP00032","a30":"VFP00033","a31":"VFP00034","a32":"VFP00035",
  "a33":"VFP00036","a34":"VFP00037","a35":"VFP00038","a36":"VFP00039","a36g":"VFP00040",
  "a36f":"VFP00041","a37":"VFP00042","a38":"VFP00043","a39":"VFP00044","a40":"VFP00045",
  "a41":"VFP00046","a42":"VFP00047","a43":"VFP00048","a44":"VFP00049","a45":"VFP00050",
  "a46":"VFP00051","a47":"VFP00052","a48":"VFP00053","a49":"VFP00054","a50":"VFP00055",
  "a51":"VFP00056","a52":"VFP00057","a53":"VFP00058","a54":"VFP00059","a55":"VFP00060",
  "a56":"VFP00061","a57":"VFP00062","a58":"VFP00063","a59":"VFP00064","a60":"VFP00065",
  "a61":"VFP00066","a62":"VFP00067","a63":"VFP00068","a64":"VFP00069","a65":"VFP00070",
  "a66":"VFP00071","a67":"VFP00072","a68":"VFP00073","a69":"VFP00074","a70":"VFP00075",
  "a71":"VFP00076","a72":"VFP00077","a73":"VFP00078","a74":"VFP00079","a75":"VFP00080",
  "a76":"VFP00081","a77":"VFP00082","a78":"VFP00083","a79":"VFP00084","a80":"VFP00085",
  "a81":"VFP00086","a82":"VFP00087","a83":"VFP00088","a84":"VFP00089","a85":"VFP00090",
  "a86":"VFP00091","a87":"VFP00092","a88":"VFP00093","a89":"VFP00094","a90":"VFP00095",
  "a91":"VFP00096","a92":"VFP00097","a93":"VFP00098","a94":"VFP00099","a95":"VFP00100",
  "a96":"VFP00101","a97":"VFP00102","a98":"VFP00103","a99":"VFP00104","a100":"VFP00105",
  "a101":"VFP00106","a102":"VFP00107","a103":"VFP00108","a104":"VFP00109","a105":"VFP00110",
  "a106":"VFP00111","a107":"VFP00112","a108":"VFP00113","a109":"VFP00114","a110":"VFP00115",
  "a111":"VFP00116","a112":"VFP00117","a113":"VFP00118","a114":"VFP00119","a115":"VFP00120",
  "a116":"VFP00121","a117":"VFP00122","a118":"VFP00123","a119":"VFP00124","a120":"VFP00125",
  "a121":"VFP00126","a122":"VFP00127","a123":"VFP00128","a124":"VFP00129","a125":"VFP00130",
  "a126":"VFP00131","a127":"VFP00132","a128":"VFP00133","a129":"VFP00134","a130":"VFP00135",
  "a131":"VFP00136",
}

// ── User ID mapping (old → new) ───────────────────────────────────────────────
export const USER_ID_MAP: Record<string, string> = {
  "u_jawad_root":  "VFU00001",
  "u1":            "VFU00002",
  "u_admin":       "VFU00003",
  "u_rc":          "VFU00004",
  "u2":            "VFU00005",
  "u2b":           "VFU00005",
  "u3":            "VFU00006",
  "u5":            "VFU00007",
  "u6":            "VFU00008",
  "u_cash":        "VFU00009",
  "u_fin":         "VFU00010",
  "u_ourai":       "VFU00011",
  "u_acheteur":    "VFU00012",
  "u_ctrl_achat":  "VFU00013",
  "u_ctrl_prep":   "VFU00014",
  "u_liv_demo":    "VFU00015",
  "u_client":      "VFU00016",
  "u_four":        "VFU00017",
  "u_jariri":      "VFU00018",
  "u_abdelilah":   "VFU00019",
  "u_abdelali":    "VFU00020",
  "u_thomas":      "VFU00021",
}

// ── Client ID mapping (old → new) ─────────────────────────────────────────────
export const CLIENT_ID_MAP: Record<string, string> = {
  "c1":"VFC00001","c2":"VFC00002","c9":"VFC00003","c10":"VFC00004",
  "c3":"VFC00005","c5":"VFC00006","c11":"VFC00007","c12":"VFC00008",
  "c4":"VFC00009","c6":"VFC00010","c13":"VFC00011","c14":"VFC00012",
  "c7":"VFC00013","c8":"VFC00014","c15":"VFC00015",
}

// ── Fournisseur ID mapping (old → new) ────────────────────────────────────────
export const FOURNISSEUR_ID_MAP: Record<string, string> = {
  "f1": "VFF00001",
  "f2": "VFF00002",
  "f3": "VFF00003",
}
