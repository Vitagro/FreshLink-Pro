"use client"
// @ts-ignore — shared AI helper
import { callLLM, triggerN3Alert } from "@/lib/ai"
import { useState, useRef, useEffect } from "react"
import { store } from "@/lib/store"

interface Message {
  role: "user" | "assistant"
  content: string
  ts: string
}

interface MarketSnapshot {
  article: string
  sourceMarchePrix?: number
  sourceFermePrix?: number
  sourceMarcheGros?: number
  saison?: string
  tendance?: string
  note?: string
}

const SYSTEM_PROMPT = `Tu es ASHEL, un agent IA expert en approvisionnement fruits et legumes au Maroc.
Tu connais parfaitement:
1. La logique des marches de gros (Casablanca, Rabat, Marrakech) — prix journaliers, saisonnalite, grossistes
2. La logique des fermes (livraison directe, contrats saison, qualite superieure, prix nego)
3. Les circuits courts (cooperatives, producteurs locaux)
4. La saisonnalite des produits marocains
5. Les ecarts de prix habituels entre circuits

Tu aides l'acheteur a:
- Comprendre pourquoi un prix est haut ou bas aujourd'hui
- Choisir la meilleure source (marche, ferme, grossiste) selon le contexte
- Anticiper les variations de prix saisonnieres
- Negocier avec les fournisseurs

Tu reponds en francais, de facon concise et pratique.
Contexte article disponible ci-dessous (extrait du catalogue):
{{ARTICLES_CONTEXT}}`

export default function ASHELMarketPanel() {
  const [messages, setMessages]   = useState<Message[]>([])
  const [input, setInput]         = useState("")
  const [loading, setLoading]     = useState(false)
  const [snapshots, setSnapshots] = useState<MarketSnapshot[]>([])
  const [snapInput, setSnapInput] = useState({ article: "", marchePrix: "", fermePrix: "", grossPrix: "", saison: "", tendance: "", note: "" })
  const [showSnap, setShowSnap]   = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Load saved market snapshots
  useEffect(() => {
    try {
      const saved = localStorage.getItem("fl_ashel_snapshots")
      if (saved) setSnapshots(JSON.parse(saved))
    } catch { /* noop */ }
    // Welcome message
    setMessages([{
      role: "assistant",
      content: "Bonjour ! Je suis ASHEL, votre conseiller en approvisionnement fruits et legumes. Je comprends la logique des marches de gros, fermes et grossistes au Maroc.\n\nPostez vos questions sur les prix, la saisonnalite, ou le choix entre fournisseurs. Vous pouvez aussi saisir un instantane des prix du marche du jour pour affiner mes conseils.",
      ts: new Date().toISOString()
    }])
  }, [])

  function buildSystemPrompt() {
    const articles = store.getArticles().slice(0, 30).map(a =>
      `${a.nom}: stock=${a.stockDisponible}${a.unite}, prixAchat=${a.prixAchat} MAD, shelfLife=${a.shelfLifeJours ?? "?"}j`
    ).join("\n")
    const snapshotStr = snapshots.length > 0
      ? "\nInstantane prix marche actuel:\n" + snapshots.map(s =>
          `${s.article}: marche=${s.sourceMarchePrix ?? "?"}MAD, ferme=${s.sourceFermePrix ?? "?"}MAD, gros=${s.sourceMarcheGros ?? "?"}MAD${s.tendance ? ` [${s.tendance}]` : ""}${s.note ? ` Note: ${s.note}` : ""}`
        ).join("\n")
      : ""
    return SYSTEM_PROMPT.replace("{{ARTICLES_CONTEXT}}", articles + snapshotStr)
  }

  async function sendMessage() {
    if (!input.trim() || loading) return
    const userMsg: Message = { role: "user", content: input.trim(), ts: new Date().toISOString() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput("")
    setLoading(true)

    try {
      const res = await fetch("https://llm.blackbox.ai/chat/completions", {
        method: "POST",
        headers: {
          // blackbox-legacy-key — move to env var BLACKBOX_CUSTOMER_ID
          "Content-Type": "application/json",
          // blackbox-legacy-auth — move to env var BLACKBOX_API_KEY
        },
        body: JSON.stringify({
          model: "openrouter/claude-sonnet-4",
          messages: [
            { role: "system", content: buildSystemPrompt() },
            ...newMessages.map(m => ({ role: m.role, content: m.content }))
          ],
          max_tokens: 800,
        })
      })
      if (!res.ok) throw new Error(`Erreur API ${res.status}`)
      const data = await res.json()
      const content = data.choices?.[0]?.message?.content ?? "Pas de reponse."
      setMessages(prev => [...prev, { role: "assistant", content, ts: new Date().toISOString() }])
    } catch (e) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `Erreur de connexion: ${e instanceof Error ? e.message : "inconnue"}. Verifiez votre connexion.`,
        ts: new Date().toISOString()
      }])
    } finally {
      setLoading(false)
    }
  }

  function addSnapshot() {
    if (!snapInput.article) return
    const snap: MarketSnapshot = {
      article: snapInput.article,
      sourceMarchePrix: snapInput.marchePrix ? parseFloat(snapInput.marchePrix) : undefined,
      sourceFermePrix:  snapInput.fermePrix  ? parseFloat(snapInput.fermePrix)  : undefined,
      sourceMarcheGros: snapInput.grossPrix  ? parseFloat(snapInput.grossPrix)  : undefined,
      saison:    snapInput.saison    || undefined,
      tendance:  snapInput.tendance  || undefined,
      note:      snapInput.note      || undefined,
    }
    const updated = [...snapshots.filter(s => s.article !== snap.article), snap]
    setSnapshots(updated)
    localStorage.setItem("fl_ashel_snapshots", JSON.stringify(updated))
    setSnapInput({ article: "", marchePrix: "", fermePrix: "", grossPrix: "", saison: "", tendance: "", note: "" })
    setShowSnap(false)
    setMessages(prev => [...prev, {
      role: "assistant",
      content: `Instantane prix enregistre pour ${snap.article}. Je prends en compte ces donnees pour mes conseils.`,
      ts: new Date().toISOString()
    }])
  }

  const quickPrompts = [
    "Quel est le meilleur circuit pour les tomates en ce moment ?",
    "Explique la difference de prix entre marche de gros et ferme pour les pommes",
    "Quand est-ce que les poivrons sont les moins chers ?",
    "Comment negocier avec un fournisseur de marche ?",
    "Analyse mon stock actuel et dis-moi quoi commander en priorite",
  ]

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "oklch(0.18 0.05 150)" }}>
            <svg className="w-5 h-5" style={{ color: "oklch(0.65 0.17 145)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1 1 .03 2.694-1.338 2.694H4.136c-1.368 0-2.337-1.694-1.338-2.694L4 15.3" />
            </svg>
          </div>
          <div>
            <p className="font-black text-sm text-foreground">ASHEL</p>
            <p className="text-[11px] text-muted-foreground">Agent IA — Logique marche & approvisionnement</p>
          </div>
        </div>
        <button onClick={() => setShowSnap(s => !s)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
            showSnap ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"
          }`}>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Prix marche ({snapshots.length})
        </button>
      </div>

      {/* Market snapshot panel */}
      {showSnap && (
        <div className="border-b border-border bg-muted/30 px-5 py-4 shrink-0">
          <p className="text-xs font-bold text-foreground mb-3">Saisir prix du marche aujourd&apos;hui</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
            {[
              { key: "article",    label: "Article",              ph: "ex: Tomates" },
              { key: "marchePrix", label: "Marche local (MAD)",   ph: "ex: 2.50" },
              { key: "fermePrix",  label: "Ferme direct (MAD)",   ph: "ex: 2.00" },
              { key: "grossPrix",  label: "Marche gros (MAD)",    ph: "ex: 1.80" },
              { key: "tendance",   label: "Tendance",             ph: "hausse / stable / baisse" },
              { key: "note",       label: "Note",                 ph: "qualite, disponibilite..." },
            ].map(f => (
              <div key={f.key}>
                <label className="text-[10px] text-muted-foreground font-semibold block mb-1">{f.label}</label>
                <input type="text"
                  value={(snapInput as Record<string, string>)[f.key]}
                  onChange={e => setSnapInput(s => ({ ...s, [f.key]: e.target.value }))}
                  placeholder={f.ph}
                  className="w-full px-2.5 py-2 rounded-xl border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
            ))}
          </div>
          <button onClick={addSnapshot} disabled={!snapInput.article}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50"
            style={{ background: "oklch(0.65 0.17 145)" }}>
            Enregistrer
          </button>
          {/* Existing snapshots */}
          {snapshots.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {snapshots.map(s => (
                <div key={s.article} className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-card border border-border text-xs">
                  <strong>{s.article}</strong>
                  {s.sourceMarchePrix && <span className="text-muted-foreground">M:{s.sourceMarchePrix}</span>}
                  {s.sourceFermePrix  && <span className="text-muted-foreground">F:{s.sourceFermePrix}</span>}
                  {s.tendance && <span className={`font-semibold ${s.tendance.includes("hausse") ? "text-red-600" : s.tendance.includes("baisse") ? "text-green-600" : "text-amber-600"}`}>{s.tendance}</span>}
                  <button onClick={() => {
                    const updated = snapshots.filter(x => x.article !== s.article)
                    setSnapshots(updated)
                    localStorage.setItem("fl_ashel_snapshots", JSON.stringify(updated))
                  }} className="text-muted-foreground hover:text-red-500 ml-1">x</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
              m.role === "user"
                ? "text-white rounded-br-sm"
                : "bg-card border border-border text-foreground rounded-bl-sm"
            }`} style={m.role === "user" ? { background: "oklch(0.38 0.18 260)" } : {}}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
              <div className="flex gap-1">
                {[0,1,2].map(i => (
                  <div key={i} className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce"
                    style={{ animationDelay: `${i*150}ms` }} />
                ))}
              </div>
              <span className="text-xs text-muted-foreground">ASHEL analyse...</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Quick prompts */}
      {messages.length <= 1 && (
        <div className="px-5 pb-2 flex flex-wrap gap-2 shrink-0">
          {quickPrompts.map(p => (
            <button key={p} onClick={() => setInput(p)}
              className="px-3 py-1.5 rounded-xl border border-border bg-card text-xs text-muted-foreground hover:text-foreground hover:border-primary transition-colors text-left">
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-5 py-4 border-t border-border shrink-0">
        <div className="flex items-end gap-3">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
            placeholder="Posez votre question a ASHEL... (Entree pour envoyer)"
            rows={2}
            className="flex-1 px-4 py-3 rounded-2xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
          <button onClick={sendMessage} disabled={!input.trim() || loading}
            className="w-11 h-11 rounded-xl flex items-center justify-center text-white disabled:opacity-40 shrink-0 mb-0.5"
            style={{ background: "oklch(0.65 0.17 145)" }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
