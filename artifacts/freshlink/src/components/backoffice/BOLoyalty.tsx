"use client"

import { useState, useMemo } from "react"
import {
  store,
  type User,
  type DiscountRule,
  type DiscountScope,
  type DiscountType,
  type ClientSegment,
  type LoyaltyConfig,
  type LoyaltyTransaction,
  type PrimeNouveauClient,
} from "@/lib/store"
import ArticleCombobox from "@/components/ui/ArticleCombobox"

// ─── Icon helper ─────────────────────────────────────────────────────────────
function Icon({ d, className = "w-5 h-5" }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
    </svg>
  )
}

// ─── Badge helpers ────────────────────────────────────────────────────────────
const SEGMENT_COLORS: Record<ClientSegment, string> = {
  standard:  "bg-slate-100 text-slate-700 border border-slate-200",
  vip:       "bg-yellow-100 text-yellow-800 border border-yellow-300",
  grossiste: "bg-blue-100 text-blue-800 border border-blue-200",
  fidele:    "bg-emerald-100 text-emerald-800 border border-emerald-200",
}
const SEGMENT_LABELS: Record<ClientSegment, string> = {
  standard:  "Standard",
  vip:       "VIP",
  grossiste: "Grossiste",
  fidele:    "Fidele",
}

const SCOPE_LABELS: Record<DiscountScope, string> = {
  client:   "Client specifique",
  article:  "Article",
  famille:  "Famille",
  segment:  "Segment (VIP...)",
  global:   "Global (tous)",
}

const DTYPE_LABELS: Record<DiscountType, string> = {
  pourcentage:    "Remise %",
  montant_fixe:   "Remise DH fixe",
  article_offert: "Article offert",
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
type LoyaltyTab = "regles_remise" | "points_config" | "transactions" | "rachat" | "prime_nouveau_client"

interface Props { user: User }

export default function BOLoyalty({ user }: Props) {
  const [tab, setTab] = useState<LoyaltyTab>("regles_remise")
  const [config, setConfig] = useState<LoyaltyConfig>(() => store.getLoyaltyConfig())
  const [rules, setRules] = useState<DiscountRule[]>(() => store.getDiscountRules())
  const [transactions] = useState<LoyaltyTransaction[]>(() => store.getLoyaltyTransactions())
  // Calcule les nouvelles primes éligibles à l'ouverture de l'écran (3
  // commandes OU 1 tonne cumulée) — idempotent, ne recrée jamais une prime
  // déjà existante pour un client.
  const [primes, setPrimes] = useState<PrimeNouveauClient[]>(() => {
    store.checkPrimesNouveauxClients()
    return store.getPrimesNouveauxClients()
  })
  const [showNewRule, setShowNewRule] = useState(false)
  const [editingRule, setEditingRule] = useState<DiscountRule | null>(null)
  const [saveMsg, setSaveMsg] = useState("")

  // ── New Rule Form ───────────────────────────────────────────────────────────
  const EMPTY_RULE: Omit<DiscountRule, "id" | "createdBy" | "createdAt"> = {
    nom: "", actif: true, scope: "global",
    type: "pourcentage", valeur: 10,
    appOnly: false,
  }
  const [newRule, setNewRule] = useState<typeof EMPTY_RULE>({ ...EMPTY_RULE })

  const clients = useMemo(() => store.getClients(), [])
  const articles = useMemo(() => store.getArticles(), [])

  const flash = (msg: string) => { setSaveMsg(msg); setTimeout(() => setSaveMsg(""), 3000) }

  // ── Save loyalty config ─────────────────────────────────────────────────────
  const saveConfig = () => {
    store.saveLoyaltyConfig({ ...config, updatedBy: user.id, updatedAt: new Date().toISOString() })
    setConfig(store.getLoyaltyConfig())
    flash("Configuration enregistree.")
  }

  // ── Add / Edit rule ─────────────────────────────────────────────────────────
  const saveRule = () => {
    if (!newRule.nom.trim()) { flash("Nom requis."); return }
    if (editingRule) {
      store.updateDiscountRule(editingRule.id, { ...newRule, updatedAt: new Date().toISOString() } as Partial<DiscountRule>)
    } else {
      const rule: DiscountRule = {
        ...newRule,
        id: store.genId(),
        createdBy: user.id,
        createdAt: new Date().toISOString(),
      }
      store.addDiscountRule(rule)
    }
    setRules(store.getDiscountRules())
    setShowNewRule(false)
    setEditingRule(null)
    setNewRule({ ...EMPTY_RULE })
    flash("Regle sauvegardee.")
  }

  const deleteRule = (id: string) => {
    if (!confirm("Supprimer cette regle ?")) return
    store.deleteDiscountRule(id)
    setRules(store.getDiscountRules())
  }

  const shareViaWhatsApp = (rule: DiscountRule) => {
    const clients_ = rule.clientId ? clients.filter(c => c.id === rule.clientId) : clients
    const msg = rule.messageWhatsApp ||
      `Offre speciale ! ${rule.nom} : ${rule.type === "pourcentage" ? `-${rule.valeur}%` : rule.type === "montant_fixe" ? `-${rule.valeur} DH` : "Article offert"}. ${rule.codePromo ? `Code: ${rule.codePromo}` : ""} Valable jusqu'au ${rule.dateFin ?? "fin de stock"}.`
    const encoded = encodeURIComponent(msg)
    const phone = clients_[0]?.telephone ?? ""
    const cleanPhone = phone.replace(/\D/g, "")
    if (cleanPhone) {
      window.open(`https://wa.me/212${cleanPhone.replace(/^0/, "")}?text=${encoded}`, "_blank")
    } else {
      // Group broadcast — open WA chat
      window.open(`https://wa.me/?text=${encoded}`, "_blank")
    }
  }

  // ── Rachat modal ────────────────────────────────────────────────────────────
  const [rachatClientId, setRachatClientId] = useState("")
  const [rachatPoints, setRachatPoints] = useState(0)
  const [rachatType, setRachatType] = useState<"remise_monetaire" | "article_offert">("remise_monetaire")

  const clientPoints = useMemo(() =>
    rachatClientId ? store.getClientPoints(rachatClientId) : 0,
  [rachatClientId, transactions])

  const cfg = config
  const rachatDH = rachatType === "remise_monetaire"
    ? Math.floor(rachatPoints / cfg.pointsParRemiseDH)
    : 0

  const processRachat = () => {
    if (!rachatClientId || rachatPoints <= 0) return
    if (rachatPoints > clientPoints) { flash("Points insuffisants."); return }
    const client = clients.find(c => c.id === rachatClientId)
    const tx: LoyaltyTransaction = {
      id: store.genId(),
      clientId: rachatClientId,
      clientNom: client?.nom ?? "",
      type: "rachat",
      points: rachatPoints,
      motif: rachatType === "remise_monetaire" ? `Rachat remise ${rachatDH} DH` : `Rachat article cadeau`,
      redemptionType: rachatType,
      redemptionValeur: rachatType === "remise_monetaire" ? rachatDH : cfg.articleCadeauQte ?? 1,
      redemptionArticleId: rachatType === "article_offert" ? cfg.articleCadeauId : undefined,
      statut: "valide",
      createdBy: user.id,
      createdAt: new Date().toISOString(),
    }
    store.addLoyaltyTransaction(tx)
    flash(`Rachat effectue: ${rachatType === "remise_monetaire" ? `${rachatDH} DH de remise` : "Article cadeau accorde"}.`)
    setRachatClientId("")
    setRachatPoints(0)
  }

  const TABS: { id: LoyaltyTab; label: string; icon: string }[] = [
    { id: "regles_remise", label: "Regles de remise",      icon: "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" },
    { id: "points_config", label: "Config fidelite",       icon: "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" },
    { id: "transactions",  label: "Historique points",     icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
    { id: "rachat",        label: "Rachat points",         icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 11v-1m0-2c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
    { id: "prime_nouveau_client", label: "Prime nouveau client", icon: "M12 4.5v15m7.5-7.5h-15" },
  ]

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-foreground">Promotions & Fidelite</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Remises multilevel, points de fidelite, rachat, WhatsApp</p>
        </div>
        {saveMsg && (
          <div className="px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold">
            {saveMsg}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-xl overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${tab === t.id ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <Icon d={t.icon} className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ══ REGLES DE REMISE ══════════════════════════════════════════════════════ */}
      {tab === "regles_remise" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground font-semibold">{rules.length} regle(s) configuree(s)</p>
            <button onClick={() => { setShowNewRule(true); setEditingRule(null); setNewRule({ ...EMPTY_RULE }) }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity">
              <Icon d="M12 4v16m8-8H4" className="w-4 h-4" />
              Nouvelle regle
            </button>
          </div>

          {/* New / Edit Rule Form */}
          {(showNewRule || editingRule) && (
            <div className="bg-card rounded-2xl border-2 border-primary/20 p-5 flex flex-col gap-4">
              <h3 className="font-bold text-foreground text-base">{editingRule ? "Modifier la regle" : "Nouvelle regle de remise"}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-foreground uppercase tracking-wide">Nom de la regle</label>
                  <input value={newRule.nom} onChange={e => setNewRule({ ...newRule, nom: e.target.value })}
                    className="border border-border rounded-xl px-3 py-2 text-sm text-foreground bg-background"
                    placeholder="Ex: Remise VIP 10%" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-foreground uppercase tracking-wide">Portee</label>
                  <select value={newRule.scope} onChange={e => setNewRule({ ...newRule, scope: e.target.value as DiscountScope })}
                    className="border border-border rounded-xl px-3 py-2 text-sm text-foreground bg-background">
                    {(Object.entries(SCOPE_LABELS) as [DiscountScope, string][]).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                {newRule.scope === "client" && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-foreground uppercase tracking-wide">Client</label>
                    <select value={newRule.clientId ?? ""} onChange={e => {
                      const c = clients.find(x => x.id === e.target.value)
                      setNewRule({ ...newRule, clientId: c?.id, clientNom: c?.nom })
                    }} className="border border-border rounded-xl px-3 py-2 text-sm text-foreground bg-background">
                      <option value="">— Choisir un client —</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                    </select>
                  </div>
                )}
                {newRule.scope === "article" && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-foreground uppercase tracking-wide">Article</label>
                    <ArticleCombobox
                      articles={articles}
                      value={newRule.articleId ?? ""}
                      onChange={(artId, art) => setNewRule({ ...newRule, articleId: art?.id, articleNom: art?.nom })}
                      placeholder="— Choisir un article —"
                    />
                  </div>
                )}
                {newRule.scope === "famille" && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-foreground uppercase tracking-wide">Famille</label>
                    <input value={newRule.famille ?? ""} onChange={e => setNewRule({ ...newRule, famille: e.target.value })}
                      className="border border-border rounded-xl px-3 py-2 text-sm text-foreground bg-background"
                      placeholder="Ex: Legumes, Fruits..." />
                  </div>
                )}
                {newRule.scope === "segment" && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-foreground uppercase tracking-wide">Segment</label>
                    <select value={newRule.segment ?? "vip"} onChange={e => setNewRule({ ...newRule, segment: e.target.value as ClientSegment })}
                      className="border border-border rounded-xl px-3 py-2 text-sm text-foreground bg-background">
                      {(Object.entries(SEGMENT_LABELS) as [ClientSegment, string][]).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-foreground uppercase tracking-wide">Type de remise</label>
                  <select value={newRule.type} onChange={e => setNewRule({ ...newRule, type: e.target.value as DiscountType })}
                    className="border border-border rounded-xl px-3 py-2 text-sm text-foreground bg-background">
                    {(Object.entries(DTYPE_LABELS) as [DiscountType, string][]).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-foreground uppercase tracking-wide">
                    {newRule.type === "pourcentage" ? "Valeur (%)" : "Valeur (DH / qte)"}
                  </label>
                  <input type="number" min={0} value={newRule.valeur}
                    onChange={e => setNewRule({ ...newRule, valeur: +e.target.value })}
                    className="border border-border rounded-xl px-3 py-2 text-sm text-foreground bg-background" />
                </div>
                {newRule.type === "article_offert" && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-foreground uppercase tracking-wide">Article offert</label>
                    <ArticleCombobox
                      articles={articles}
                      value={newRule.articleOffertId ?? ""}
                      onChange={(artId, art) => setNewRule({ ...newRule, articleOffertId: art?.id, articleOffertNom: art?.nom })}
                      placeholder="— Choisir —"
                    />
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-foreground uppercase tracking-wide">Code promo (WhatsApp)</label>
                  <input value={newRule.codePromo ?? ""} onChange={e => setNewRule({ ...newRule, codePromo: e.target.value })}
                    className="border border-border rounded-xl px-3 py-2 text-sm text-foreground bg-background uppercase"
                    placeholder="Ex: VIP10" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-foreground uppercase tracking-wide">Montant min. commande (DH)</label>
                  <input type="number" min={0} value={newRule.commandeMinDH ?? 0}
                    onChange={e => setNewRule({ ...newRule, commandeMinDH: +e.target.value })}
                    className="border border-border rounded-xl px-3 py-2 text-sm text-foreground bg-background" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-foreground uppercase tracking-wide">Date debut</label>
                  <input type="date" value={newRule.dateDebut ?? ""} onChange={e => setNewRule({ ...newRule, dateDebut: e.target.value })}
                    className="border border-border rounded-xl px-3 py-2 text-sm text-foreground bg-background" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-foreground uppercase tracking-wide">Date fin</label>
                  <input type="date" value={newRule.dateFin ?? ""} onChange={e => setNewRule({ ...newRule, dateFin: e.target.value })}
                    className="border border-border rounded-xl px-3 py-2 text-sm text-foreground bg-background" />
                </div>
                <div className="md:col-span-2 flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-foreground uppercase tracking-wide">Message WhatsApp personnalise</label>
                  <textarea value={newRule.messageWhatsApp ?? ""} rows={2}
                    onChange={e => setNewRule({ ...newRule, messageWhatsApp: e.target.value })}
                    className="border border-border rounded-xl px-3 py-2 text-sm text-foreground bg-background resize-none"
                    placeholder="Ex: Offre speciale pour nos clients VIP ! Remise 10% sur votre prochaine commande." />
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
                  <input type="checkbox" checked={newRule.actif}
                    onChange={e => setNewRule({ ...newRule, actif: e.target.checked })}
                    className="w-4 h-4 rounded" />
                  Regle active
                </label>
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
                  <input type="checkbox" checked={!!newRule.appOnly}
                    onChange={e => setNewRule({ ...newRule, appOnly: e.target.checked })}
                    className="w-4 h-4 rounded" />
                  App uniquement
                </label>
              </div>
              <div className="flex gap-2">
                <button onClick={saveRule}
                  className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity">
                  {editingRule ? "Mettre a jour" : "Enregistrer la regle"}
                </button>
                <button onClick={() => { setShowNewRule(false); setEditingRule(null) }}
                  className="px-5 py-2.5 rounded-xl border border-border text-foreground text-sm font-semibold hover:bg-muted transition-colors">
                  Annuler
                </button>
              </div>
            </div>
          )}

          {/* Rules list */}
          {rules.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border p-12 text-center">
              <Icon d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-semibold text-foreground">Aucune regle de remise</p>
              <p className="text-sm text-muted-foreground mt-1">Cliquez sur &quot;Nouvelle regle&quot; pour commencer</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {rules.map(rule => (
                <div key={rule.id} className={`bg-card rounded-2xl border ${rule.actif ? "border-border" : "border-border opacity-60"} p-4`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-bold text-foreground">{rule.nom}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${rule.actif ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                          {rule.actif ? "Active" : "Inactive"}
                        </span>
                        {rule.appOnly && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">App only</span>
                        )}
                        {rule.segment && (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${SEGMENT_COLORS[rule.segment]}`}>{SEGMENT_LABELS[rule.segment]}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                        <span className="font-semibold text-foreground">{SCOPE_LABELS[rule.scope]}{rule.clientNom ? `: ${rule.clientNom}` : ""}{rule.articleNom ? `: ${rule.articleNom}` : ""}{rule.famille ? `: ${rule.famille}` : ""}</span>
                        <span className="text-primary font-bold">
                          {rule.type === "pourcentage" ? `-${rule.valeur}%` : rule.type === "montant_fixe" ? `-${rule.valeur} DH` : `Article offert: ${rule.articleOffertNom ?? ""} x${rule.articleOffertQte ?? 1}`}
                        </span>
                        {rule.commandeMinDH && rule.commandeMinDH > 0 && (
                          <span>Min. {rule.commandeMinDH} DH</span>
                        )}
                        {rule.codePromo && <span className="font-mono text-emerald-700 font-bold">{rule.codePromo}</span>}
                        {rule.dateFin && <span>Expire: {rule.dateFin}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {/* WhatsApp share */}
                      <button onClick={() => shareViaWhatsApp(rule)} title="Partager via WhatsApp"
                        className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-green-50 transition-colors text-green-600">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                        </svg>
                      </button>
                      <button onClick={() => { setEditingRule(rule); setNewRule({ nom: rule.nom, actif: rule.actif, scope: rule.scope, clientId: rule.clientId, clientNom: rule.clientNom, articleId: rule.articleId, articleNom: rule.articleNom, famille: rule.famille, segment: rule.segment, type: rule.type, valeur: rule.valeur, articleOffertId: rule.articleOffertId, articleOffertNom: rule.articleOffertNom, articleOffertQte: rule.articleOffertQte, dateDebut: rule.dateDebut, dateFin: rule.dateFin, commandeMinDH: rule.commandeMinDH, appOnly: rule.appOnly, codePromo: rule.codePromo, messageWhatsApp: rule.messageWhatsApp }); setShowNewRule(true) }}
                        className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground">
                        <Icon d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteRule(rule.id)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-50 transition-colors text-red-500">
                        <Icon d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ POINTS CONFIG ═════════════════════════════════════════════════════════ */}
      {tab === "points_config" && (
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-foreground">Configuration programme de fidelite</h2>
            <label className="flex items-center gap-2 text-sm font-semibold text-foreground cursor-pointer">
              <input type="checkbox" checked={config.actif} onChange={e => setConfig({ ...config, actif: e.target.checked })}
                className="w-4 h-4 rounded accent-primary" />
              Programme actif
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Gain Rules */}
            <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-4">
              <h3 className="font-bold text-foreground text-sm uppercase tracking-wide">Regles de gain de points</h3>
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">Points par DH commande</span>
                  <input type="number" step="0.01" min={0} value={config.pointsParDH}
                    onChange={e => setConfig({ ...config, pointsParDH: +e.target.value })}
                    className="w-24 border border-border rounded-lg px-2 py-1 text-sm text-right text-foreground bg-background" />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-semibold text-foreground">Bonus commande via app</span>
                    <p className="text-xs text-muted-foreground">Points supplementaires pour commandes app</p>
                  </div>
                  <input type="number" min={0} value={config.bonusAppOrder}
                    onChange={e => setConfig({ ...config, bonusAppOrder: +e.target.value })}
                    className="w-24 border border-border rounded-lg px-2 py-1 text-sm text-right text-foreground bg-background" />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-semibold text-foreground">Bonus zero retour</span>
                    <p className="text-xs text-muted-foreground">Aucun retour sur la livraison</p>
                  </div>
                  <input type="number" min={0} value={config.bonusZeroRetour}
                    onChange={e => setConfig({ ...config, bonusZeroRetour: +e.target.value })}
                    className="w-24 border border-border rounded-lg px-2 py-1 text-sm text-right text-foreground bg-background" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">Expiration (jours)</span>
                  <input type="number" min={0} value={config.expirationJours ?? 365}
                    onChange={e => setConfig({ ...config, expirationJours: +e.target.value })}
                    className="w-24 border border-border rounded-lg px-2 py-1 text-sm text-right text-foreground bg-background" />
                </div>
              </div>
            </div>

            {/* Redemption */}
            <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-4">
              <h3 className="font-bold text-foreground text-sm uppercase tracking-wide">Regles de rachat (redemption)</h3>
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-semibold text-foreground">Points par DH de remise</span>
                    <p className="text-xs text-muted-foreground">Combien de points = 1 DH de remise</p>
                  </div>
                  <input type="number" min={1} value={config.pointsParRemiseDH}
                    onChange={e => setConfig({ ...config, pointsParRemiseDH: +e.target.value })}
                    className="w-24 border border-border rounded-lg px-2 py-1 text-sm text-right text-foreground bg-background" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">Min. points pour rachat</span>
                  <input type="number" min={0} value={config.minimumPointsRachat}
                    onChange={e => setConfig({ ...config, minimumPointsRachat: +e.target.value })}
                    className="w-24 border border-border rounded-lg px-2 py-1 text-sm text-right text-foreground bg-background" />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-semibold text-foreground">Points pour article cadeau</span>
                    <p className="text-xs text-muted-foreground">Ex: 500 pts = 1 caisse offerte</p>
                  </div>
                  <input type="number" min={0} value={config.pointsArticleCadeau}
                    onChange={e => setConfig({ ...config, pointsArticleCadeau: +e.target.value })}
                    className="w-24 border border-border rounded-lg px-2 py-1 text-sm text-right text-foreground bg-background" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-foreground">Libelle article cadeau</label>
                  <input value={config.articleCadeauNom ?? ""} onChange={e => setConfig({ ...config, articleCadeauNom: e.target.value })}
                    className="border border-border rounded-lg px-3 py-1.5 text-sm text-foreground bg-background"
                    placeholder="Ex: Caisse de fraises offerte" />
                </div>
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-col gap-2">
            <p className="font-bold text-emerald-800 text-sm">Apercu — Pour une commande de 500 DH :</p>
            <div className="flex flex-wrap gap-4 text-sm text-emerald-700">
              <span>Points gagnes: <strong>{Math.round(500 * config.pointsParDH)}</strong> pts base</span>
              <span>+ app: <strong>+{config.bonusAppOrder}</strong> pts</span>
              <span>+ zero retour: <strong>+{config.bonusZeroRetour}</strong> pts</span>
              <span>= max <strong>{Math.round(500 * config.pointsParDH) + config.bonusAppOrder + config.bonusZeroRetour}</strong> pts</span>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-emerald-700">
              <span>{config.pointsArticleCadeau} pts = <strong>Article cadeau: {config.articleCadeauNom}</strong></span>
              <span>{config.minimumPointsRachat} pts min = <strong>{Math.floor(config.minimumPointsRachat / config.pointsParRemiseDH)} DH de remise</strong></span>
            </div>
          </div>

          <button onClick={saveConfig}
            className="self-start px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity">
            Sauvegarder la configuration
          </button>
        </div>
      )}

      {/* ══ TRANSACTIONS HISTORIQUE ═══════════════════════════════════════════════ */}
      {tab === "transactions" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground font-semibold">{transactions.length} transaction(s)</p>
          {transactions.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border p-12 text-center">
              <p className="font-semibold text-foreground">Aucune transaction de fidelite</p>
              <p className="text-sm text-muted-foreground mt-1">Les transactions apparaissent quand des points sont attribues ou rachetes</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted border-b border-border">
                    {["Date", "Client", "Type", "Points", "Motif", "Statut"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-bold text-foreground uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {transactions.slice(0, 100).map(tx => (
                    <tr key={tx.id} className="border-b border-border hover:bg-muted/30">
                      <td className="px-4 py-2.5 text-foreground">{new Date(tx.createdAt).toLocaleDateString("fr-FR")}</td>
                      <td className="px-4 py-2.5 font-semibold text-foreground">{tx.clientNom}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${tx.type === "gain" ? "bg-emerald-100 text-emerald-800" : tx.type === "rachat" ? "bg-blue-100 text-blue-800" : "bg-red-100 text-red-800"}`}>
                          {tx.type === "gain" ? "Gain" : tx.type === "rachat" ? "Rachat" : "Expiration"}
                        </span>
                      </td>
                      <td className={`px-4 py-2.5 font-bold ${tx.type === "gain" ? "text-emerald-700" : "text-red-600"}`}>
                        {tx.type === "gain" ? "+" : "-"}{tx.points} pts
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{tx.motif}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${tx.statut === "valide" ? "bg-green-100 text-green-800" : tx.statut === "en_attente" ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800"}`}>
                          {tx.statut}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══ RACHAT DE POINTS ══════════════════════════════════════════════════════ */}
      {tab === "rachat" && (
        <div className="flex flex-col gap-5 max-w-lg">
          <h2 className="font-bold text-foreground">Echange de points — Redemption</h2>

          <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-foreground uppercase tracking-wide">Client</label>
              <select value={rachatClientId} onChange={e => setRachatClientId(e.target.value)}
                className="border border-border rounded-xl px-3 py-2 text-sm text-foreground bg-background">
                <option value="">— Choisir un client —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </div>

            {rachatClientId && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center gap-3">
                <Icon d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" className="w-5 h-5 text-blue-600" />
                <div>
                  <p className="text-sm font-bold text-blue-900">Solde points disponibles</p>
                  <p className="text-2xl font-black text-blue-700">{clientPoints} pts</p>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-foreground uppercase tracking-wide">Type de rachat</label>
              <div className="flex gap-2">
                <button onClick={() => setRachatType("remise_monetaire")}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-colors ${rachatType === "remise_monetaire" ? "bg-primary text-primary-foreground border-primary" : "border-border text-foreground hover:bg-muted"}`}>
                  Remise DH
                </button>
                <button onClick={() => setRachatType("article_offert")}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-colors ${rachatType === "article_offert" ? "bg-primary text-primary-foreground border-primary" : "border-border text-foreground hover:bg-muted"}`}>
                  Article offert ({config.articleCadeauNom})
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-foreground uppercase tracking-wide">
                Points a racheter (min: {config.minimumPointsRachat})
              </label>
              <input type="number" min={config.minimumPointsRachat} max={clientPoints}
                value={rachatPoints} onChange={e => setRachatPoints(+e.target.value)}
                className="border border-border rounded-xl px-3 py-2 text-sm text-foreground bg-background" />
              {rachatType === "remise_monetaire" && rachatPoints >= config.minimumPointsRachat && (
                <p className="text-sm font-bold text-emerald-700">{rachatPoints} pts = {Math.floor(rachatPoints / config.pointsParRemiseDH)} DH de remise</p>
              )}
              {rachatType === "article_offert" && rachatPoints >= config.pointsArticleCadeau && (
                <p className="text-sm font-bold text-emerald-700">{Math.floor(rachatPoints / config.pointsArticleCadeau)} x {config.articleCadeauNom} offert(e)</p>
              )}
            </div>

            <button onClick={processRachat}
              disabled={!rachatClientId || rachatPoints < config.minimumPointsRachat || rachatPoints > clientPoints}
              className="py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              Valider le rachat
            </button>
          </div>
        </div>
      )}

      {/* ══ PRIME NOUVEAU CLIENT ══════════════════════════════════════════════════ */}
      {tab === "prime_nouveau_client" && (
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-foreground">Prime nouveau client</h2>
            <label className="flex items-center gap-2 text-sm font-semibold text-foreground cursor-pointer">
              <input type="checkbox" checked={config.primeNouveauClientActif ?? true}
                onChange={e => setConfig({ ...config, primeNouveauClientActif: e.target.checked })}
                className="w-4 h-4 rounded accent-primary" />
              Actif
            </label>
          </div>
          <p className="text-sm text-muted-foreground -mt-3">
            Déclenchée automatiquement une seule fois par client, dès que le seuil (commandes OU tonnage cumulé) est atteint — récompense le prévendeur qui l&apos;a acquis ET le client.
          </p>

          <div className="bg-card rounded-2xl border border-border p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-foreground uppercase tracking-wide">Seuil — nombre de commandes</label>
              <input type="number" min={1} value={config.primeNouveauClientSeuilCommandes ?? 3}
                onChange={e => setConfig({ ...config, primeNouveauClientSeuilCommandes: +e.target.value })}
                className="border border-border rounded-lg px-3 py-1.5 text-sm text-foreground bg-background" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-foreground uppercase tracking-wide">Seuil — tonnage cumulé (kg)</label>
              <input type="number" min={1} value={config.primeNouveauClientSeuilKg ?? 1000}
                onChange={e => setConfig({ ...config, primeNouveauClientSeuilKg: +e.target.value })}
                className="border border-border rounded-lg px-3 py-1.5 text-sm text-foreground bg-background" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-foreground uppercase tracking-wide">Prime prévendeur (DH)</label>
              <input type="number" min={0} value={config.primeNouveauClientMontantPrevendeur ?? 0}
                onChange={e => setConfig({ ...config, primeNouveauClientMontantPrevendeur: +e.target.value })}
                className="border border-border rounded-lg px-3 py-1.5 text-sm text-foreground bg-background" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-foreground uppercase tracking-wide">Points bonus client</label>
              <input type="number" min={0} value={config.primeNouveauClientPointsClient ?? 0}
                onChange={e => setConfig({ ...config, primeNouveauClientPointsClient: +e.target.value })}
                className="border border-border rounded-lg px-3 py-1.5 text-sm text-foreground bg-background" />
            </div>
          </div>
          <button onClick={saveConfig}
            className="self-start px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity">
            Sauvegarder la configuration
          </button>

          <div className="flex items-center justify-between mt-2">
            <p className="text-sm font-semibold text-foreground">{primes.length} prime(s) déclenchée(s)</p>
            <button
              onClick={() => { const nouv = store.checkPrimesNouveauxClients(); setPrimes(store.getPrimesNouveauxClients()); flash(nouv.length ? `${nouv.length} nouvelle(s) prime(s) détectée(s).` : "Aucune nouvelle prime.") }}
              className="text-xs font-semibold text-primary hover:underline">
              ↻ Recalculer maintenant
            </button>
          </div>

          {primes.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border p-12 text-center">
              <p className="font-semibold text-foreground">Aucune prime déclenchée pour l&apos;instant</p>
              <p className="text-sm text-muted-foreground mt-1">Apparaît dès qu&apos;un client atteint 3 commandes ou 1 tonne.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted border-b border-border">
                    {["Date", "Client", "Prévendeur", "Critère", "Prime prévendeur", "Points client", "Statut", ""].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-bold text-foreground uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {primes.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(p => (
                    <tr key={p.id} className="border-b border-border hover:bg-muted/30">
                      <td className="px-4 py-2.5 text-foreground">{new Date(p.dateEligibilite).toLocaleDateString("fr-FR")}</td>
                      <td className="px-4 py-2.5 font-semibold text-foreground">{p.clientNom}</td>
                      <td className="px-4 py-2.5 text-foreground">{p.prevendeurNom}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {p.critere === "commandes" ? `${p.nbCommandes} commandes` : `${p.totalKg.toFixed(0)} kg`}
                      </td>
                      <td className="px-4 py-2.5 font-bold text-emerald-700">{p.montantPrevendeur.toFixed(0)} DH</td>
                      <td className="px-4 py-2.5 font-bold text-blue-700">+{p.pointsClient} pts</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${p.statutPrevendeur === "payee" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}>
                          {p.statutPrevendeur === "payee" ? "Payée" : "En attente"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {p.statutPrevendeur === "en_attente" && (
                          <button onClick={() => { store.payerPrimePrevendeur(p.id); setPrimes(store.getPrimesNouveauxClients()) }}
                            className="text-xs font-semibold text-emerald-600 hover:underline">
                            Marquer payée
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
