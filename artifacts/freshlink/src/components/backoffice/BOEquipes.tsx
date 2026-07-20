"use client"

// ══════════════════════════════════════════════════════════════════════════════
//  BOEquipes — Gestion des équipes (isolation des données par groupe).
//
//  Une "équipe" n'est pas une entité à part : c'est l'ensemble des comptes
//  dont effectiveGroupId() pointe vers le même id racine (cf. store.ts). Un
//  admin (super_super_admin/super_admin/admin) sans groupeId explicite EST
//  lui-même la racine de sa propre équipe. Plusieurs super_admin PEUVENT
//  partager la même équipe : il suffit d'assigner le groupeId de l'un vers
//  l'id (ou le groupeId effectif) de l'autre — c'est ce que cet écran permet
//  de faire visuellement, au lieu de devoir rouvrir chaque fiche utilisateur.
//
//  Réservé au super_super_admin (Jawad) : lui seul voit toutes les équipes
//  combinées (cf. canSeeAllGroups) — un super_admin normal ne doit jamais
//  voir la composition des AUTRES équipes (fuite d'isolation).
// ══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react"
import { store, type User, type UserRole, effectiveGroupId, canSeeAllGroups, ROLE_LABELS } from "@/lib/store"

interface Props { user: User }

const ADMIN_ROLES: UserRole[] = ["super_super_admin", "super_admin", "admin"]

export default function BOEquipes({ user }: Props) {
  const [users, setUsers] = useState<User[]>([])
  const [groupNames, setGroupNames] = useState<Record<string, string>>({})
  const [editingName, setEditingName] = useState<Record<string, string>>({})
  const [quickUserId, setQuickUserId] = useState("")
  const [quickTargetGroup, setQuickTargetGroup] = useState("")
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const refresh = () => {
    setUsers(store.getUsers())
    setGroupNames(store.getGroupNames())
  }
  useEffect(() => { refresh() }, [])

  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 4000) }

  if (!canSeeAllGroups(user)) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
        <p className="text-4xl mb-2">🔒</p>
        <p className="font-semibold">Réservé au super administrateur.</p>
        <p className="text-sm mt-1">La gestion des équipes n&apos;est visible que par le compte ayant la vision globale (toutes équipes).</p>
      </div>
    )
  }

  // Racines d'équipe = tout admin dont groupeId n'est pas explicitement
  // renseigné (il EST sa propre racine) — même s'il n'a aucun membre.
  const rootAdmins = users.filter(u => ADMIN_ROLES.includes(u.role) && !u.groupeId)
  const rootIds = new Set(rootAdmins.map(a => a.id))

  // Regroupe TOUS les users par équipe effective — inclut aussi les groupes
  // "orphelins" (groupeId pointant vers un compte supprimé) pour ne jamais
  // perdre silencieusement des comptes de la vue.
  const byGroup = new Map<string, User[]>()
  users.forEach(u => {
    const gid = effectiveGroupId(u)
    if (!byGroup.has(gid)) byGroup.set(gid, [])
    byGroup.get(gid)!.push(u)
  })
  rootIds.forEach(id => { if (!byGroup.has(id)) byGroup.set(id, []) })

  const teamLabel = (groupId: string): string => {
    if (groupNames[groupId]) return groupNames[groupId]
    const root = users.find(u => u.id === groupId)
    return root ? `Équipe de ${root.name}` : `Équipe (${groupId.slice(0, 8)})`
  }

  const teams = [...byGroup.keys()].sort((a, b) => teamLabel(a).localeCompare(teamLabel(b), "fr"))

  const saveGroupName = (groupId: string) => {
    const val = editingName[groupId]
    if (val == null) return
    store.setGroupName(groupId, val)
    refresh()
    flash(true, "Nom d'équipe enregistré.")
  }

  const moveUser = (targetUser: User, newGroupId: string) => {
    const all = store.getUsers()
    const idx = all.findIndex(u => u.id === targetUser.id)
    if (idx < 0) return
    // Redevient racine de sa propre équipe si la cible est lui-même.
    all[idx] = { ...all[idx], groupeId: targetUser.id === newGroupId ? undefined : newGroupId }
    store.saveUsers(all)
    refresh()
    flash(true, `${targetUser.name} déplacé(e).`)
  }

  const quickAssign = () => {
    const u = users.find(x => x.id === quickUserId)
    if (!u || !quickTargetGroup) return
    moveUser(u, quickTargetGroup)
    setQuickUserId(""); setQuickTargetGroup("")
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl bg-gradient-to-br from-violet-700 via-violet-800 to-slate-900 p-5 text-white">
        <h2 className="text-lg font-black">👥 Gestion des équipes</h2>
        <p className="text-sm text-white/75 mt-1">
          Une équipe isole les données (clients, etc.) entre plusieurs administrateurs. Plusieurs super admin peuvent partager la même équipe — déplacez un compte pour le rattacher au groupe d&apos;un autre.
        </p>
      </div>

      {msg && <div className={`px-4 py-2.5 rounded-xl text-sm font-semibold shadow ${msg.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>{msg.text}</div>}

      {/* Réaffectation rapide */}
      <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold text-violet-800">Compte à réaffecter</label>
          <select value={quickUserId} onChange={e => setQuickUserId(e.target.value)}
            className="px-3 py-2 rounded-xl border border-violet-200 bg-white text-sm min-w-[220px]">
            <option value="">-- Choisir un compte --</option>
            {users.slice().sort((a, b) => a.name.localeCompare(b.name, "fr")).map(u => (
              <option key={u.id} value={u.id}>{u.name} ({ROLE_LABELS[u.role]})</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold text-violet-800">Équipe cible</label>
          <select value={quickTargetGroup} onChange={e => setQuickTargetGroup(e.target.value)}
            className="px-3 py-2 rounded-xl border border-violet-200 bg-white text-sm min-w-[220px]">
            <option value="">-- Choisir une équipe --</option>
            {teams.map(gid => (
              <option key={gid} value={gid}>{teamLabel(gid)}</option>
            ))}
          </select>
        </div>
        <button onClick={quickAssign} disabled={!quickUserId || !quickTargetGroup}
          className="px-4 py-2.5 rounded-xl bg-violet-700 text-white text-sm font-bold hover:bg-violet-800 disabled:opacity-40">
          Réaffecter
        </button>
      </div>

      {/* Liste des équipes */}
      <div className="grid gap-4 lg:grid-cols-2">
        {teams.map(gid => {
          const members = byGroup.get(gid) ?? []
          const root = users.find(u => u.id === gid)
          const admins = members.filter(m => ADMIN_ROLES.includes(m.role))
          return (
            <div key={gid} className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <input
                  value={editingName[gid] ?? groupNames[gid] ?? teamLabel(gid)}
                  onChange={e => setEditingName(prev => ({ ...prev, [gid]: e.target.value }))}
                  onBlur={() => saveGroupName(gid)}
                  onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }}
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-300"
                />
                <span className="px-2 py-1 rounded-lg bg-slate-100 text-slate-500 text-xs font-semibold whitespace-nowrap">{members.length} compte(s)</span>
              </div>
              {!root && <p className="text-[11px] text-amber-600">⚠️ Équipe orpheline — le compte racine ({gid.slice(0, 8)}…) n&apos;existe plus.</p>}
              {admins.length > 1 && (
                <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
                  ✓ {admins.length} administrateurs partagent cette équipe : {admins.map(a => a.name).join(", ")}
                </p>
              )}
              <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
                {members.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">Aucun compte dans cette équipe.</p>
                ) : members.slice().sort((a, b) => a.name.localeCompare(b.name, "fr")).map(m => (
                  <div key={m.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">
                        {m.name}
                        {m.id === gid && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 font-bold">RACINE</span>}
                      </p>
                      <p className="text-[11px] text-slate-400">{ROLE_LABELS[m.role]}</p>
                    </div>
                    <select value={gid} onChange={e => moveUser(m, e.target.value)}
                      className="px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs shrink-0">
                      {teams.map(t => (
                        <option key={t} value={t}>{teamLabel(t)}</option>
                      ))}
                      {!teams.includes(m.id) && ADMIN_ROLES.includes(m.role) && (
                        <option value={m.id}>— Sa propre équipe —</option>
                      )}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
