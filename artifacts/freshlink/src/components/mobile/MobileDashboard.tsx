"use client"

import { useState, useEffect, useRef } from "react"
import { store, type User, type Commande, type Message } from "@/lib/store"

interface Props { user: User }

function dateOffset(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split("T")[0]
}
function weekStart() {
  const d = new Date()
  const day = d.getDay()
  d.setDate(d.getDate() - ((day + 6) % 7))
  return d.toISOString().split("T")[0]
}

type Period = "jour" | "j1" | "semaine"

export default function MobileDashboard({ user }: Props) {
  const [commandes, setCommandes] = useState<Commande[]>([])
  const [period, setPeriod] = useState<Period>("jour")
  const [messages, setMessages] = useState<Message[]>([])
  const [newMsg, setNewMsg] = useState("")
  const [showChat, setShowChat] = useState(false)
  const chatRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setCommandes(store.getCommandes())
    setMessages(store.getMessages())
    const interval = setInterval(() => {
      setCommandes(store.getCommandes())
      setMessages(store.getMessages())
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (showChat && chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight
    }
  }, [messages, showChat])

  const today = store.today()
  const yesterday = dateOffset(1)
  const wStart = weekStart()

  const myCommandes = commandes.filter(c => c.commercialId === user.id)

  const forPeriod = myCommandes.filter(c => {
    if (period === "jour") return c.date === today
    if (period === "j1") return c.date === yesterday
    if (period === "semaine") return c.date >= wStart && c.date <= today
    return false
  })

  // Stats
  const totalCA = forPeriod.reduce((s, c) => s + c.lignes.reduce((ls, l) => ls + l.quantite * l.prixVente, 0), 0)
  const totalTonnage = forPeriod.reduce((s, c) => s + c.lignes.reduce((ls, l) => ls + l.quantite, 0), 0)
  const uniqueClients = new Set(forPeriod.map(c => c.clientId)).size
  const uniqueSKUs = new Set(forPeriod.flatMap(c => c.lignes.map(l => l.articleId))).size

  // Objectifs (user params)
  const objCA = user.objectifTonnage ? user.objectifTonnage * 5 : 5000 // rough objective from tonnage
  const objClients = user.objectifClients || 10

  const pctCA = Math.min(100, objCA > 0 ? (totalCA / objCA) * 100 : 0)
  const pctClients = Math.min(100, objClients > 0 ? (uniqueClients / objClients) * 100 : 0)

  // SKU breakdown (today)
  const skuBreakdown: Record<string, { nom: string; quantite: number; ca: number }> = {}
  forPeriod.forEach(c => c.lignes.forEach(l => {
    if (!skuBreakdown[l.articleId]) skuBreakdown[l.articleId] = { nom: l.articleNom, quantite: 0, ca: 0 }
    skuBreakdown[l.articleId].quantite += l.quantite
    skuBreakdown[l.articleId].ca += l.quantite * l.prixVente
  }))

  const sendMessage = () => {
    if (!newMsg.trim()) return
    const msg: Message = {
      id: store.genId(), senderId: user.id, senderName: user.name,
      role: user.role, text: newMsg.trim(), createdAt: new Date().toISOString(),
    }
    store.addMessage(msg)
    setMessages(store.getMessages())
    setNewMsg("")
  }

  const unreadCount = messages.filter(m => m.senderId !== user.id &&
    new Date(m.createdAt) > new Date(Date.now() - 86400000)).length

  const PERIOD_LABELS = { jour: "Aujourd'hui", j1: "Hier J-1", semaine: "Cette semaine" }
  const PERIOD_LABELS_AR = { jour: "اليوم", j1: "أمس", semaine: "هذا الأسبوع" }

  const StatCard = ({ label, labelAr, value, unit, progress, progressLabel, colorClass }: {
    label: string; labelAr: string; value: string | number; unit?: string;
    progress?: number; progressLabel?: string; colorClass: string
  }) => (
    <div className="bg-card rounded-xl border border-border p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-medium">{label} <span className="mr-1">/</span> {labelAr}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-2xl font-extrabold ${colorClass}`}>{value}</span>
        {unit && <span className="text-xs text-muted-foreground font-medium">{unit}</span>}
      </div>
      {progress !== undefined && (
        <div className="flex flex-col gap-1">
          <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full transition-all ${colorClass.replace("text-", "bg-")}`}
              style={{ width: `${progress}%` }} />
          </div>
          {progressLabel && <span className="text-[10px] text-muted-foreground">{progressLabel}</span>}
        </div>
      )}
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      {!showChat ? (
        <div className="flex flex-col gap-4 p-4 pb-20 overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-foreground">
                Tableau de bord <span className="text-muted-foreground font-normal text-base">/ لوحة القيادة</span>
              </h2>
              <p className="text-xs text-muted-foreground">{user.name} — {today}</p>
            </div>
            <button onClick={() => setShowChat(true)} className="relative p-2.5 rounded-xl border border-border bg-card hover:bg-muted transition-colors">
              <svg className="w-5 h-5 text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-[9px] text-white flex items-center justify-center font-bold">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
          </div>

          {/* Period selector */}
          <div className="flex rounded-xl overflow-hidden border border-border bg-muted p-1 gap-1">
            {(["jour", "j1", "semaine"] as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${period === p ? "text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                style={period === p ? { background: "oklch(0.38 0.2 260)" } : {}}>
                <span className="block">{PERIOD_LABELS[p]}</span>
                <span className="text-[10px] opacity-70">{PERIOD_LABELS_AR[p]}</span>
              </button>
            ))}
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Chiffre d'affaires" labelAr="رقم الأعمال" value={totalCA.toLocaleString("fr-MA", { maximumFractionDigits: 0 })} unit="DH"
              progress={pctCA} progressLabel={`${pctCA.toFixed(0)}% de l'objectif (${objCA.toLocaleString()} DH)`}
              colorClass="text-primary" />
            <StatCard label="Clients visités" labelAr="الزبائن" value={uniqueClients} unit="clients"
              progress={pctClients} progressLabel={`${pctClients.toFixed(0)}% de l'objectif (${objClients})`}
              colorClass="text-blue-600" />
            <StatCard label="Tonnage" labelAr="الوزن" value={totalTonnage.toLocaleString("fr-MA")} unit="kg" colorClass="text-amber-600" />
            <StatCard label="SKUs vendus" labelAr="مرجع الأصناف" value={uniqueSKUs} unit="réf." colorClass="text-purple-600" />
          </div>

          {/* SKU Breakdown */}
          {Object.keys(skuBreakdown).length > 0 && (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-sm font-bold text-foreground">
                  Détail par article <span className="text-muted-foreground font-normal">/ تفاصيل الأصناف</span>
                </h3>
              </div>
              <div className="divide-y divide-border">
                {Object.entries(skuBreakdown)
                  .sort(([, a], [, b]) => b.ca - a.ca)
                  .map(([id, sku]) => (
                    <div key={id} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{sku.nom}</p>
                        <p className="text-xs text-muted-foreground">{sku.quantite.toLocaleString("fr-MA")} kg</p>
                      </div>
                      <span className="font-bold text-primary text-sm">
                        {sku.ca.toLocaleString("fr-MA", { minimumFractionDigits: 2 })} DH
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Commandes list */}
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-bold text-foreground">
              Commandes ({forPeriod.length}) <span className="text-muted-foreground font-normal">/ الطلبيات</span>
            </h3>
            {forPeriod.length === 0 ? (
              <div className="bg-card rounded-xl border border-border p-6 flex flex-col items-center gap-2 text-center">
                <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-sm text-muted-foreground">Aucune commande {period === "jour" ? "aujourd'hui" : period === "j1" ? "hier" : "cette semaine"}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {forPeriod.map(c => {
                  const total = c.lignes.reduce((s, l) => s + l.quantite * l.prixVente, 0)
                  const tonnage = c.lignes.reduce((s, l) => s + l.quantite, 0)
                  return (
                    <div key={c.id} className="bg-card rounded-xl border border-border p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-foreground">{c.clientNom}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          c.statut === "livre" ? "bg-green-100 text-green-700" :
                          c.statut === "en_transit" ? "bg-blue-100 text-blue-700" :
                          c.statut === "valide" ? "bg-amber-100 text-amber-700" :
                          "bg-muted text-muted-foreground"}`}>
                          {c.statut === "en_attente" ? "En attente" : c.statut === "valide" ? "Validée" :
                          c.statut === "en_transit" ? "En transit" : c.statut === "livre" ? "Livré" : c.statut}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{c.lignes.length} art. · {tonnage} kg</span>
                        <span>Livr. {c.heurelivraison}</span>
                        <span className="font-bold text-primary mr-auto">
                          {total.toLocaleString("fr-MA", { minimumFractionDigits: 2 })} DH
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* DISCUSSION PANEL */
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
            <button onClick={() => setShowChat(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div>
              <h3 className="text-sm font-bold text-foreground">Discussion équipe <span className="text-muted-foreground font-normal">/ نقاش الفريق</span></h3>
              <p className="text-xs text-muted-foreground">{messages.length} messages</p>
            </div>
          </div>

          <div ref={chatRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {messages.length === 0 && (
              <p className="text-sm text-muted-foreground text-center mt-10">Aucun message — Soyez le premier!</p>
            )}
            {messages.map(m => {
              const isMe = m.senderId === user.id
              return (
                <div key={m.id} className={`flex flex-col gap-0.5 ${isMe ? "items-end" : "items-start"}`}>
                  <div className="flex items-center gap-1.5">
                    {!isMe && <span className="text-[10px] font-semibold text-muted-foreground">{m.senderName}</span>}
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(m.createdAt).toLocaleTimeString("fr-MA", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${isMe ? "text-white rounded-tr-sm" : "bg-card border border-border text-foreground rounded-tl-sm"}`}
                    style={isMe ? { background: "oklch(0.38 0.2 260)" } : {}}>
                    {m.text}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="p-3 border-t border-border bg-card flex items-center gap-2">
            <input type="text" value={newMsg} onChange={e => setNewMsg(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendMessage()}
              placeholder="Votre message... / رسالتك"
              className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            <button onClick={sendMessage} disabled={!newMsg.trim()}
              className="p-2.5 rounded-xl text-white disabled:opacity-50"
              style={{ background: "oklch(0.38 0.2 260)" }}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
