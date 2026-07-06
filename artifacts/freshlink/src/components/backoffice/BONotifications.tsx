"use client"

import React, { useEffect, useRef, useState } from "react"
import type { Tab } from "./BackOfficeLayout"

// ─────────────────────────────────────────────────────────────────
// BONotifications — popups en temps quasi-réel pour 3 événements
// sensibles : nouvelle demande de compte web, nouvelle demande
// d'accès appareil, nouvelle commande web. Poll léger (20s) sur les
// mêmes endpoints /api/sync-read déjà utilisés par les panneaux BO.
//
// Au premier montage on "absorbe" l'état courant sans notifier (sinon
// chaque connexion BO déclencherait une rafale pour tout le backlog
// déjà en attente) ; seules les NOUVELLES lignes apparues depuis le
// dernier poll déclenchent un popup.
// ─────────────────────────────────────────────────────────────────

type SourceDef = { table: string; tab: Tab; isPending: (p: Record<string, unknown>) => boolean; label: (p: Record<string, unknown>) => string; icon: string }

const SOURCES: SourceDef[] = [
  {
    table: "fl_account_requests",
    tab: "demandes_comptes",
    isPending: p => p.statut === "en_attente",
    label: p => `Nouvelle demande de compte — ${String(p.nom ?? "")}`.trim(),
    icon: "👤",
  },
  {
    table: "fl_site_access",
    tab: "device_access",
    isPending: p => p.statut === "en_attente",
    label: p => `Nouvel appareil en attente d'accès${p.nom ? " — " + String(p.nom) : ""}`,
    icon: "📱",
  },
  {
    table: "fl_commandes_web",
    tab: "commandes_web",
    isPending: p => p.statut === "nouveau" || !p.statut,
    label: p => `Nouvelle commande web${p.nom_client ? " — " + String(p.nom_client) : ""}`,
    icon: "🛒",
  },
]

const SEEN_KEY = "fl_notif_seen_v1"
const POLL_MS = 20_000

type SeenMap = Record<string, string[]>

function loadSeen(): SeenMap {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}") } catch { return {} }
}
function saveSeen(m: SeenMap) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(m)) } catch { /* noop */ }
}

interface Popup { key: string; icon: string; text: string; tab: Tab }

export default function BONotifications({ navigate }: { navigate: (tab: Tab) => void }) {
  const [popups, setPopups] = useState<Popup[]>([])
  const seenRef = useRef<SeenMap>({})
  const primedRef = useRef<Record<string, boolean>>({})

  useEffect(() => {
    seenRef.current = loadSeen()
    let cancelled = false

    async function pollOnce() {
      for (const src of SOURCES) {
        try {
          const res = await fetch(`/api/sync-read?table=${src.table}`, { cache: "no-store" })
          const json = await res.json() as { ok: boolean; data?: { id: string; payload: Record<string, unknown> }[] }
          if (!json.ok || !json.data) continue
          const pendingIds = json.data.filter(r => src.isPending(r.payload ?? {})).map(r => r.id)
          const seenIds = new Set(seenRef.current[src.table] ?? [])

          if (!primedRef.current[src.table]) {
            // Premier poll de cette table dans cette session : on absorbe le
            // backlog déjà existant sans notifier, puis on arme le suivi.
            primedRef.current[src.table] = true
            seenRef.current = { ...seenRef.current, [src.table]: pendingIds }
            saveSeen(seenRef.current)
            continue
          }

          const fresh = json.data.filter(r => src.isPending(r.payload ?? {}) && !seenIds.has(r.id))
          if (fresh.length && !cancelled) {
            setPopups(prev => [
              ...prev,
              ...fresh.map(r => ({
                key: `${src.table}:${r.id}:${Date.now()}`,
                icon: src.icon,
                text: src.label(r.payload ?? {}),
                tab: src.tab,
              })),
            ])
          }
          seenRef.current = { ...seenRef.current, [src.table]: pendingIds }
          saveSeen(seenRef.current)
        } catch { /* offline — on retentera au prochain tick */ }
      }
    }

    pollOnce()
    const timer = setInterval(pollOnce, POLL_MS)
    return () => { cancelled = true; clearInterval(timer) }
  }, [])

  function dismiss(key: string) {
    setPopups(prev => prev.filter(p => p.key !== key))
  }

  useEffect(() => {
    if (!popups.length) return
    const timers = popups.map(p => setTimeout(() => dismiss(p.key), 10_000))
    return () => timers.forEach(clearTimeout)
  }, [popups])

  if (!popups.length) return null

  return (
    <div style={{
      position: "fixed", top: 16, right: 16, zIndex: 9999,
      display: "flex", flexDirection: "column", gap: 8, maxWidth: 360,
    }}>
      {popups.map(p => (
        <div key={p.key}
          onClick={() => { navigate(p.tab); dismiss(p.key) }}
          style={{
            cursor: "pointer", background: "#fff", borderRadius: 14,
            boxShadow: "0 10px 30px rgba(0,0,0,.18)", border: "1px solid #e5e7eb",
            padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: 10,
            animation: "fl-notif-in .25s ease-out",
          }}>
          <span style={{ fontSize: 22, lineHeight: 1 }}>{p.icon}</span>
          <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#1f2937" }}>{p.text}</div>
          <button
            onClick={e => { e.stopPropagation(); dismiss(p.key) }}
            style={{ border: "none", background: "none", color: "#9ca3af", cursor: "pointer", fontSize: 14, lineHeight: 1 }}
            aria-label="Fermer">✕</button>
        </div>
      ))}
      <style>{`@keyframes fl-notif-in { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:translateX(0); } }`}</style>
    </div>
  )
}
