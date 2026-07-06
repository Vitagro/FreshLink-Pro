"use client"

import { useState, useEffect } from "react"
import { store, type User, type Client } from "@/lib/store"
import { loadZonesConfig, saveZonesConfig, resolveAffectation, TEAM_LEADS, type ZonesConfig, type ZoneCfg } from "@/lib/commercial/zones"

export default function BOZonesSecteurs({ user }: { user: User }) {
  const [cfg, setCfg]         = useState<ZonesConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [applying, setApplying] = useState(false)
  const [msg, setMsg]         = useState<{ ok: boolean; text: string } | null>(null)
  const [newMaster, setNewMaster] = useState("")
  const [editMaster, setEditMaster] = useState<{ old: string; val: string } | null>(null)
  const [openZone, setOpenZone] = useState<string | null>(null)

  const canEdit = ["super_super_admin", "super_admin", "admin", "resp_commercial"].includes(user.role)
  const prevendeurs = store.getUsers().filter(u =>
    u.actif !== false && (u.role === "prevendeur" || (u.roles?.includes("prevendeur") ?? false)))
  // Team leads réels (team_leader / resp_commercial actifs) — remplace la liste
  // figée à 2 noms codés en dur, qui ne scalait pas au-delà de Zizi/Jariri.
  const teamLeadsReels = store.getUsers().filter(u =>
    u.actif !== false && (u.role === "team_leader" || u.role === "resp_commercial" ||
      (u.roles?.includes("team_leader") ?? false) || (u.roles?.includes("resp_commercial") ?? false)))
  const teamLeadOptions = [
    ...TEAM_LEADS,
    ...teamLeadsReels.filter(u => !TEAM_LEADS.some(tl => tl.id === u.id)).map(u => ({ id: u.id, name: u.name })),
  ]

  useEffect(() => {
    loadZonesConfig().then(c => {
      // Le pool "allSecteurs" démarre vide (config explicite) et ne se
      // remplissait jamais tout seul — un admin sur un ERP déjà en
      // production avec des clients existants voyait "Secteurs (0)" alors
      // que des dizaines de secteurs étaient déjà utilisés sur les fiches
      // clients. On les repêche ici pour pré-remplir le pool (pas
      // sauvegardé automatiquement — juste affiché, à confirmer via
      // "Enregistrer").
      const secteursClients = [...new Set(store.getClients().map(cl => cl.secteur).filter(Boolean))]
      const manquants = secteursClients.filter(s => !c.allSecteurs.includes(s))
      if (manquants.length) c.allSecteurs = [...c.allSecteurs, ...manquants].sort()
      setCfg(c)
      setLoading(false)
    })
  }, [])
  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 4000) }
  const update = (fn: (c: ZonesConfig) => ZonesConfig) => setCfg(c => (c ? fn(structuredClone(c)) : c))

  // ── Gestion du POOL maître des secteurs ─────────────────────────────────────
  const addMaster = () => {
    const name = newMaster.trim(); if (!name) return
    update(c => { if (!c.allSecteurs.includes(name)) c.allSecteurs.push(name); return c })
    setNewMaster("")
  }
  const deleteMaster = (secteur: string) => update(c => {
    c.allSecteurs = c.allSecteurs.filter(s => s !== secteur)
    c.zones.forEach(z => { z.secteurs = z.secteurs.filter(s => s !== secteur) })
    delete c.secteurPrevendeur[secteur]
    return c
  })
  const renameMaster = () => {
    if (!editMaster) return
    const nn = editMaster.val.trim(); const old = editMaster.old
    setEditMaster(null)
    if (!nn || nn === old) return
    update(c => {
      c.allSecteurs = [...new Set(c.allSecteurs.map(s => s === old ? nn : s))]
      c.zones.forEach(z => { z.secteurs = [...new Set(z.secteurs.map(s => s === old ? nn : s))] })
      if (c.secteurPrevendeur[old]) { c.secteurPrevendeur[nn] = c.secteurPrevendeur[old]; delete c.secteurPrevendeur[old] }
      return c
    })
  }

  // ── Affectation secteur → zone (1 secteur = 1 zone) ─────────────────────────
  // Many-to-many : un secteur peut appartenir à PLUSIEURS zones (on ne le retire
  // plus des autres zones quand on le coche ici).
  const toggleSecteurInZone = (zid: string, secteur: string) => update(c => {
    const z = c.zones.find(x => x.id === zid); if (!z) return c
    if (z.secteurs.includes(secteur)) z.secteurs = z.secteurs.filter(s => s !== secteur)
    else z.secteurs.push(secteur)
    return c
  })
  // Affectation rapide depuis le pool de secteurs : une liste à sélection (1
  // zone à la fois, cas le plus courant) — retire des autres zones et affecte
  // à la zone choisie. Le mode many-to-many ci-dessus reste possible depuis
  // chaque carte de zone pour les cas où un secteur doit être dans plusieurs.
  const setSecteurZoneUnique = (secteur: string, zid: string) => update(c => {
    c.zones.forEach(z => { z.secteurs = z.secteurs.filter(s => s !== secteur) })
    if (zid) { const z = c.zones.find(x => x.id === zid); if (z) z.secteurs.push(secteur) }
    return c
  })

  // ── Gestion des ZONES elles-mêmes (créer/supprimer) ─────────────────────────
  const addZone = () => update(c => {
    const id = `zone_${c.zones.length + 1}_${Math.random().toString(36).slice(2, 7)}`
    c.zones.push({ id, label: "Nouvelle zone", teamLeadId: teamLeadOptions[0]?.id ?? "", secteurs: [] })
    return c
  })
  const deleteZone = (zid: string) => {
    if (!confirm("Supprimer cette zone ? Les secteurs qui lui étaient rattachés ne seront plus affectés à aucune zone.")) return
    update(c => { c.zones = c.zones.filter(z => z.id !== zid); return c })
  }

  const setLabel = (zid: string, label: string) => update(c => { const z = c.zones.find(x => x.id === zid); if (z) z.label = label; return c })
  const setLead  = (zid: string, tl: string)    => update(c => { const z = c.zones.find(x => x.id === zid); if (z) z.teamLeadId = tl; return c })
  const setPrevendeur = (secteur: string, prevId: string) =>
    update(c => { if (prevId) c.secteurPrevendeur[secteur] = prevId; else delete c.secteurPrevendeur[secteur]; return c })

  const save = async () => { if (!cfg) return; setSaving(true); const ok = await saveZonesConfig(cfg); setSaving(false); flash(ok, ok ? "✅ Enregistré." : "Erreur d'enregistrement.") }

  const appliquerAuxClients = async () => {
    if (!cfg) return
    setApplying(true)
    await saveZonesConfig(cfg)
    const changed: Client[] = []
    const updated = store.getClients().map(c => {
      if (!c.secteur) return c
      const aff = resolveAffectation(cfg, c.secteur)
      if (aff.prevendeurId && c.prevendeurId !== aff.prevendeurId) { const nc = { ...c, prevendeurId: aff.prevendeurId, zone: aff.zoneId ?? c.zone }; changed.push(nc); return nc }
      return c
    })
    if (changed.length) {
      store.saveClients(updated)
      const { upsertClient } = await import("@/lib/supabase/db")
      for (const c of changed) { try { await upsertClient(c) } catch { /* best-effort */ } }
    }
    setApplying(false)
    flash(true, `✅ ${changed.length} client(s) rattaché(s) à leur prévendeur.`)
  }

  if (loading || !cfg) return <div className="p-8 text-center text-sm text-muted-foreground">Chargement…</div>
  if (!canEdit)        return <div className="p-8 text-center text-sm text-muted-foreground">🔒 Réservé aux responsables.</div>

  // Dans quelle zone se trouve un secteur (pour l'indication dans les cases)
  const zoneOf = (secteur: string) => cfg.zones.find(z => z.secteurs.includes(secteur))?.label ?? null

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-black text-foreground flex items-center gap-2">🗺️ Zones &amp; Secteurs</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Gérez le pool de secteurs, puis cochez ceux de chaque zone et affectez un prévendeur.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={addZone} className="px-4 py-2.5 rounded-xl border border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-sm font-bold">＋ Nouvelle zone</button>
          <button onClick={appliquerAuxClients} disabled={applying || saving} className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-50">{applying ? "…" : "👥 Appliquer aux clients"}</button>
          <button onClick={save} disabled={saving || applying} className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50">{saving ? "…" : "💾 Enregistrer"}</button>
        </div>
      </div>

      {msg && <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-semibold ${msg.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>{msg.text}</div>}

      {/* ── Gestion à part des secteurs (pool maître) ───────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-4 mb-5">
        <p className="font-bold text-foreground text-sm mb-2">📋 Secteurs ({cfg.allSecteurs.length})</p>
        <div className="flex flex-col gap-1.5 mb-3">
          {cfg.allSecteurs.length === 0 && <span className="text-xs text-muted-foreground italic">Aucun secteur. Ajoutez-en ci-dessous.</span>}
          {cfg.allSecteurs.map(s => {
            const zonesDuSecteur = cfg.zones.filter(z => z.secteurs.includes(s))
            return (
              <div key={s} className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-muted flex-wrap">
                {editMaster?.old === s ? (
                  <input autoFocus value={editMaster.val} onChange={e => setEditMaster({ old: s, val: e.target.value })}
                    onKeyDown={e => { if (e.key === "Enter") renameMaster(); if (e.key === "Escape") setEditMaster(null) }} onBlur={renameMaster}
                    className="px-1 py-0.5 rounded border border-border bg-background text-foreground text-sm w-28" />
                ) : (
                  <button onClick={() => setEditMaster({ old: s, val: s })} className="text-sm text-foreground" title="Renommer">📍 {s}</button>
                )}
                {/* Liste à sélection pour affecter ce secteur à une zone */}
                <select value={zonesDuSecteur[0]?.id ?? ""} onChange={e => setSecteurZoneUnique(s, e.target.value)}
                  className="px-2 py-1 rounded-lg border border-border bg-background text-foreground text-xs">
                  <option value="">— Aucune zone —</option>
                  {cfg.zones.map(z => <option key={z.id} value={z.id}>{z.label}</option>)}
                </select>
                {zonesDuSecteur.length > 1 && (
                  <span className="text-[10px] text-amber-600">+ {zonesDuSecteur.slice(1).map(z => z.label).join(", ")}</span>
                )}
                <button onClick={() => deleteMaster(s)} className="text-red-500 hover:text-red-700 text-xs ml-auto" title="Supprimer">✕</button>
              </div>
            )
          })}
        </div>
        <div className="flex gap-1.5 max-w-sm">
          <input value={newMaster} onChange={e => setNewMaster(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addMaster() }}
            placeholder="Ajouter un secteur (ex. Maarif)…" className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm" />
          <button onClick={addMaster} className="px-4 py-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-sm font-bold">＋ Ajouter</button>
        </div>
      </div>

      {/* ── Zones ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {cfg.zones.map((z: ZoneCfg) => (
          <div key={z.id} className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <input value={z.label} onChange={e => setLabel(z.id, e.target.value)} className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm font-bold" />
              <button onClick={() => deleteZone(z.id)} title="Supprimer cette zone"
                className="shrink-0 w-9 h-9 rounded-lg text-red-500 hover:bg-red-50 hover:text-red-700 flex items-center justify-center">✕</button>
            </div>
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-2">👤 Team Lead :
              <select value={z.teamLeadId} onChange={e => setLead(z.id, e.target.value)} className="flex-1 px-2 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm">
                {teamLeadOptions.map(tl => <option key={tl.id} value={tl.id}>{tl.name}</option>)}
              </select>
            </label>

            {/* Liste roulante (cases à cocher) pour affecter les secteurs */}
            <div className="relative">
              <button onClick={() => setOpenZone(openZone === z.id ? null : z.id)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm flex items-center justify-between">
                <span>Secteurs ({z.secteurs.length})</span><span>{openZone === z.id ? "▲" : "▼"}</span>
              </button>
              {openZone === z.id && (
                <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-border bg-popover shadow-xl p-2 flex flex-col gap-1">
                  {cfg.allSecteurs.length === 0 && <span className="text-xs text-muted-foreground italic px-1">Ajoutez d&apos;abord des secteurs au pool.</span>}
                  {cfg.allSecteurs.map(s => {
                    const inThis = z.secteurs.includes(s); const other = zoneOf(s)
                    return (
                      <label key={s} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                        <input type="checkbox" checked={inThis} onChange={() => toggleSecteurInZone(z.id, s)} className="accent-emerald-600 w-4 h-4" />
                        <span className="text-foreground">{s}</span>
                        {!inThis && other && <span className="text-[10px] text-amber-600">aussi: {other}</span>}
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Secteurs affectés à cette zone + prévendeur de chacun */}
            <div className="flex flex-col gap-1.5">
              {z.secteurs.map(secteur => (
                <div key={secteur} className="rounded-lg border border-border p-2 flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground truncate flex-1">📍 {secteur}</span>
                  <select value={cfg.secteurPrevendeur[secteur] ?? ""} onChange={e => setPrevendeur(secteur, e.target.value)} className="px-2 py-1 rounded-lg border border-border bg-background text-foreground text-xs max-w-[55%]">
                    <option value="">— Prévendeur —</option>
                    {prevendeurs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 text-[11px] text-muted-foreground">Une zone regroupe plusieurs secteurs ; un secteur peut appartenir à plusieurs zones (many-to-many) ; chaque secteur a un seul prévendeur, un prévendeur peut couvrir plusieurs secteurs.</p>
    </div>
  )
}
