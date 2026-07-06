"use client"
// ════════════════════════════════════════════════════════════════════════════
//  MessagerieChannel — messagerie d'équipe TEMPS RÉEL (Supabase broadcast +
//  fallback poll). 3 modes : Équipe (par rôle), Direct (1 personne), Groupe.
//  Réutilisé en back-office ET en mobile.
// ════════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef, useCallback } from "react"
import { store, type User, type Message, type MessageGroup } from "@/lib/store"
import { upsertMessage, fetchMessages } from "@/lib/supabase/db"
import { createClient } from "@/lib/supabase/client"
import type { RealtimeChannel } from "@supabase/supabase-js"
import { beep, notify, isHidden } from "@/lib/notify"

const AUDIENCES: { key: string; label: string; roles: string[] }[] = [
  { key: "tous",         label: "Tous",         roles: [] },
  { key: "livreurs",     label: "Livreurs",     roles: ["livreur", "dispatcheur"] },
  { key: "commerciaux",  label: "Commerciaux",  roles: ["prevendeur", "resp_commercial", "team_leader"] },
  { key: "logistique",   label: "Logistique",   roles: ["resp_logistique", "magasinier", "dispatcheur", "chef_depot"] },
  { key: "responsables", label: "Responsables", roles: ["admin", "super_admin", "super_super_admin", "resp_logistique", "resp_commercial"] },
  { key: "clients",      label: "Clients",      roles: ["client", "client_proprietaire", "client_gerant"] },
]

function relTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (isNaN(t)) return ""
  const diff = Date.now() - t
  const m = Math.floor(diff / 60000)
  if (m < 1) return "à l'instant"
  if (m < 60) return `il y a ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `il y a ${h} h`
  return new Date(iso).toLocaleDateString("fr-MA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}

function dmChannel(a: string, b: string): string { return "dm:" + [a, b].sort().join("~") }

type Mode = "equipe" | "direct" | "group"

export default function MessagerieChannel({ user, compact = false }: { user: User; compact?: boolean }) {
  const [mode, setMode]   = useState<Mode>("equipe")
  const [aud, setAud]     = useState("tous")
  const [peerId, setPeerId]   = useState("")
  const [groupId, setGroupId] = useState("")
  const [groups, setGroups]   = useState<MessageGroup[]>(() => store.getMessageGroups())
  const [msgs, setMsgs]   = useState<Message[]>([])
  const [text, setText]   = useState("")
  const [sending, setSending] = useState(false)
  const [callPick, setCallPick] = useState(false)
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [groupName, setGroupName] = useState("")
  const [groupMembers, setGroupMembers] = useState<string[]>([])
  const [live, setLive] = useState(false)
  const endRef  = useRef<HTMLDivElement>(null)
  const chanRef = useRef<RealtimeChannel | null>(null)

  const allUsers = store.getUsers().filter(u => u.id !== user.id && u.actif !== false)
  const myGroups = groups.filter(g => g.memberIds.includes(user.id))
  const peer  = allUsers.find(u => u.id === peerId)
  const group = groups.find(g => g.id === groupId)

  // ── Filtre les messages de la conversation courante ────────────────────────
  const computeMsgs = useCallback(() => {
    const all = store.getMessages()
    let list: Message[]
    if (mode === "direct" && peerId) {
      const ch = dmChannel(user.id, peerId)
      list = all.filter(m => m.channel === ch)
    } else if (mode === "group" && groupId) {
      list = all.filter(m => m.channel === "group:" + groupId)
    } else {
      list = all
        .filter(m => (m.channel ?? "general") === "general")
        .filter(m => m.senderId === user.id || !m.audience || m.audience.length === 0 || m.audience.includes(String(user.role)))
    }
    list.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    setMsgs(list)
  }, [mode, peerId, groupId, user.id, user.role])

  // ── Poll Supabase (fallback fiable, toutes les 4 s) ────────────────────────
  useEffect(() => {
    let active = true
    const refresh = async () => { await fetchMessages(); if (active) computeMsgs() }
    refresh()
    const iv = setInterval(refresh, 4000)
    return () => { active = false; clearInterval(iv) }
  }, [computeMsgs])

  // ── Temps réel (broadcast Supabase) ────────────────────────────────────────
  useEffect(() => {
    const sb = createClient()
    const ch = sb.channel("fl-messages", { config: { broadcast: { self: false } } })
    const isForMe = (m: Message): boolean => {
      if (m.senderId === user.id) return false
      if (m.toUserId) return m.toUserId === user.id
      if (m.groupId) return store.getMessageGroups().some(g => g.id === m.groupId && g.memberIds.includes(user.id))
      return !m.audience || m.audience.length === 0 || m.audience.includes(String(user.role))
    }
    ch.on("broadcast", { event: "msg" }, ({ payload }) => {
      const m = payload as Message
      if (!m || !m.id) return
      const all = store.getMessages()
      const isNew = !all.some(x => x.id === m.id)
      if (isNew) { all.push(m); store.saveMessages(all) }
      computeMsgs()
      if (isNew && isForMe(m)) {
        beep(760, 160, 0.18)                                    // bip à la réception
        if (isHidden()) notify(`💬 ${m.senderName}`, m.text.slice(0, 120), "fl-msg")
      }
    })
    ch.on("broadcast", { event: "del" }, ({ payload }) => {
      const id = (payload as { id?: string })?.id
      if (!id) return
      store.saveMessages(store.getMessages().filter(x => x.id !== id))
      computeMsgs()
    })
    ch.on("broadcast", { event: "groups" }, ({ payload }) => {
      const gs = payload as MessageGroup[]
      if (Array.isArray(gs)) { store.saveMessageGroups(gs); setGroups(gs) }
    })
    ch.subscribe((status) => setLive(status === "SUBSCRIBED"))
    chanRef.current = ch
    return () => { void sb.removeChannel(ch); chanRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { computeMsgs() }, [computeMsgs])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }) }, [msgs.length])

  // ── Charge les groupes depuis le cloud (fl_notices __msg_groups) ───────────
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/sync-read?table=fl_notices", { cache: "no-store" })
        const j = await res.json()
        const row = (j?.data ?? []).find((r: { id: string }) => r.id === "__msg_groups")
        const gs = (row?.payload as { groups?: MessageGroup[] } | undefined)?.groups
        if (Array.isArray(gs)) { store.saveMessageGroups(gs); setGroups(gs) }
      } catch { /* hors ligne */ }
    })()
  }, [])

  const persistGroups = async (gs: MessageGroup[]) => {
    store.saveMessageGroups(gs); setGroups(gs)
    try {
      await fetch("/api/sync-write", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: "fl_notices", upserts: [{ id: "__msg_groups", payload: { groups: gs }, updated_at: new Date().toISOString() }] }),
      })
    } catch { /* sync best-effort */ }
    chanRef.current?.send({ type: "broadcast", event: "groups", payload: gs })
  }

  const createGroup = async () => {
    const name = groupName.trim()
    if (!name || groupMembers.length === 0) return
    const g: MessageGroup = {
      id: `G-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name, memberIds: [user.id, ...groupMembers], createdBy: user.id, createdAt: new Date().toISOString(),
    }
    await persistGroups([...groups, g])
    setShowNewGroup(false); setGroupName(""); setGroupMembers([])
    setGroupId(g.id); setMode("group")
  }

  const send = async () => {
    const t = text.trim()
    if (!t || sending) return
    if (mode === "direct" && !peerId) return
    if (mode === "group" && !groupId) return
    const base = {
      id: `MSG-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      senderId: user.id, senderName: user.name, role: user.role,
      text: t, createdAt: new Date().toISOString(), readBy: [user.id],
    }
    let m: Message
    if (mode === "direct")      m = { ...base, channel: dmChannel(user.id, peerId), toUserId: peerId }
    else if (mode === "group")  m = { ...base, channel: "group:" + groupId, groupId }
    else { const roles = AUDIENCES.find(a => a.key === aud)?.roles ?? []; m = { ...base, channel: "general", audience: roles.length ? roles : undefined } }
    setText(""); setSending(true)
    store.addMessage(m); computeMsgs()                                  // optimiste
    try { await upsertMessage(m) } catch { /* sync best-effort */ }
    chanRef.current?.send({ type: "broadcast", event: "msg", payload: m })  // temps réel
    setSending(false)
  }

  const isAdmin = ["super_super_admin", "super_admin", "admin"].includes(String(user.role))
  const deleteMsg = async (id: string) => {
    if (!confirm("Supprimer ce message ?")) return
    store.saveMessages(store.getMessages().filter(m => m.id !== id)); computeMsgs()
    try {
      await fetch("/api/sync-write", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: "fl_messages", deletes: [id] }),
      })
    } catch { /* sync best-effort */ }
    chanRef.current?.send({ type: "broadcast", event: "del", payload: { id } })   // retire chez les autres
  }

  const canSend = mode === "equipe" || (mode === "direct" && !!peerId) || (mode === "group" && !!groupId)
  const title = mode === "direct" ? (peer?.name ?? "Choisir un contact")
    : mode === "group" ? (group?.name ?? "Choisir un groupe")
    : "Équipe"
  const callContacts = callPick ? allUsers : []

  return (
    <div className="flex flex-col bg-white rounded-2xl border border-slate-200 overflow-hidden" style={{ height: compact ? 460 : 580 }}>
      {/* En-tête + modes */}
      <div className="px-3 py-2.5 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center justify-between mb-2">
          <p className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
            💬 Messagerie
            <span className={`w-1.5 h-1.5 rounded-full ${live ? "bg-emerald-500" : "bg-slate-300"}`} title={live ? "Temps réel actif" : "Hors ligne / reconnexion"} />
          </p>
          <button onClick={() => setCallPick(v => !v)} className="text-xs font-semibold text-emerald-700 px-2 py-1 rounded-lg hover:bg-emerald-50">📞 Appeler</button>
        </div>
        <div className="flex gap-1.5">
          {([["equipe", "👥 Équipe"], ["direct", "👤 Direct"], ["group", "👨‍👩‍👧 Groupes"]] as const).map(([k, lbl]) => (
            <button key={k} onClick={() => setMode(k)}
              className={`flex-1 text-xs font-semibold py-1.5 rounded-lg border transition-colors ${mode === k ? "bg-emerald-600 text-white border-emerald-600" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
              {lbl}
            </button>
          ))}
        </div>

        {/* Sélecteur DIRECT */}
        {mode === "direct" && (
          <select value={peerId} onChange={e => setPeerId(e.target.value)}
            className="mt-2 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white">
            <option value="">— Choisir la personne —</option>
            {allUsers.map(u => <option key={u.id} value={u.id}>{u.name} · {String(u.role)}</option>)}
          </select>
        )}

        {/* Sélecteur GROUPE */}
        {mode === "group" && (
          <div className="mt-2 flex gap-1.5 items-center flex-wrap">
            <select value={groupId} onChange={e => setGroupId(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white min-w-0">
              <option value="">— Choisir un groupe —</option>
              {myGroups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.memberIds.length})</option>)}
            </select>
            <button onClick={() => setShowNewGroup(v => !v)} className="text-xs font-bold text-emerald-700 px-2.5 py-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 whitespace-nowrap">＋ Groupe</button>
          </div>
        )}
      </div>

      {/* Création de groupe */}
      {mode === "group" && showNewGroup && (
        <div className="px-3 py-3 border-b border-slate-200 bg-emerald-50/50">
          <input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="Nom du groupe (ex. Tournée Nord)"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm mb-2" />
          <p className="text-[11px] text-slate-500 mb-1">Membres :</p>
          <div className="flex flex-col gap-1 max-h-32 overflow-y-auto mb-2">
            {allUsers.map(u => {
              const on = groupMembers.includes(u.id)
              return (
                <button key={u.id} onClick={() => setGroupMembers(prev => on ? prev.filter(x => x !== u.id) : [...prev, u.id])}
                  className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-sm ${on ? "bg-emerald-100 text-emerald-800" : "hover:bg-white"}`}>
                  <span className="truncate">{u.name} <span className="text-[11px] text-slate-400">· {String(u.role)}</span></span>
                  <span>{on ? "✓" : "＋"}</span>
                </button>
              )
            })}
          </div>
          <div className="flex gap-2">
            <button onClick={() => void createGroup()} disabled={!groupName.trim() || groupMembers.length === 0}
              className="flex-1 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold disabled:opacity-40">Créer le groupe</button>
            <button onClick={() => { setShowNewGroup(false); setGroupName(""); setGroupMembers([]) }}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm">Annuler</button>
          </div>
        </div>
      )}

      {/* Sélecteur d'appel */}
      {callPick && (
        <div className="px-3 py-2 border-b border-slate-200 bg-white max-h-44 overflow-y-auto">
          <p className="text-[11px] text-slate-400 mb-1">Appel audio dans l'ERP :</p>
          <div className="flex flex-col gap-1">
            {callContacts.length === 0 && <span className="text-xs text-slate-400">Aucun contact.</span>}
            {callContacts.map(c => (
              <button key={c.id}
                onClick={() => { setCallPick(false); window.dispatchEvent(new CustomEvent("fl-call-start", { detail: { id: c.id, name: c.name } })) }}
                className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-emerald-50 text-sm">
                <span className="truncate">{c.name} <span className="text-[11px] text-slate-400">· {String(c.role)}</span></span>
                <span className="text-emerald-600">📞</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Fil */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 bg-slate-50/40">
        {(mode === "direct" && !peerId) ? (
          <p className="text-center text-xs text-slate-400 mt-8">Choisissez une personne pour démarrer une conversation privée.</p>
        ) : (mode === "group" && !groupId) ? (
          <p className="text-center text-xs text-slate-400 mt-8">Choisissez un groupe, ou créez-en un avec « ＋ Groupe ».</p>
        ) : msgs.length === 0 ? (
          <p className="text-center text-xs text-slate-400 mt-8">Aucun message. Démarrez la conversation ci-dessous.</p>
        ) : msgs.map(m => {
          const mine = m.senderId === user.id
          return (
            <div key={m.id} className={`flex flex-col max-w-[85%] ${mine ? "self-end items-end" : "self-start items-start"}`}>
              <div className={`px-3 py-2 rounded-2xl text-sm ${mine ? "bg-emerald-600 text-white rounded-br-sm" : "bg-white border border-slate-200 text-slate-800 rounded-bl-sm"}`}>
                {!mine && <span className="block text-[11px] font-bold text-slate-500 mb-0.5">{m.senderName} · {String(m.role)}</span>}
                <span className="whitespace-pre-wrap break-words">{m.text}</span>
              </div>
              <span className="text-[10px] text-slate-400 mt-0.5 px-1 flex items-center gap-2">
                {relTime(m.createdAt)}
                {(mine || isAdmin) && (
                  <button onClick={() => void deleteMsg(m.id)} className="text-slate-400 hover:text-red-500 transition-colors" title="Supprimer ce message">🗑</button>
                )}
              </span>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      {/* Saisie */}
      <div className="border-t border-slate-200 p-3 bg-white">
        {mode === "equipe" && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {AUDIENCES.map(a => (
              <button key={a.key} onClick={() => setAud(a.key)}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${aud === a.key ? "bg-emerald-50 border-emerald-300 text-emerald-700 font-semibold" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                {a.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send() } }}
            rows={2}
            disabled={!canSend}
            placeholder={canSend ? `Message à « ${mode === "equipe" ? (AUDIENCES.find(a => a.key === aud)?.label) : title} »…` : "Choisissez d'abord un destinataire…"}
            className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:bg-slate-50"
          />
          <button onClick={() => void send()} disabled={!text.trim() || sending || !canSend}
            className="px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 transition-opacity">
            {sending ? "…" : "Envoyer"}
          </button>
        </div>
      </div>
    </div>
  )
}
