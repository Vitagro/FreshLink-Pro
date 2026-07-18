"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { store, isMobileRole, effectiveGroupId, isSuperSuperAdmin, type User } from "@/lib/store"

interface Props { user: User }

function canAccess(u: User) {
  return ["super_super_admin", "super_admin", "admin"].includes(u.role)
}

const ROLE_LABELS: Record<string, string> = {
  prevendeur: "Prévendeur", resp_logistique: "Resp. Logistique", magasinier: "Magasinier",
  dispatcheur: "Dispatcheur", livreur: "Livreur", acheteur: "Acheteur",
  ctrl_achat: "Contrôle Achat", ctrl_prep: "Contrôle Préparation",
  chef_depot: "Chef Dépôt", suivi_commande: "Suivi Commande",
  client: "Client", fournisseur: "Fournisseur",
}

// Groupes de données MOBILE pouvant être effacés — jamais les commandes/bons
// créés depuis le back-office ou le site web, même s'ils partagent la même
// table. Le filtre se fait sur le champ `createdVia: "mobile"` de chaque
// enregistrement (absent = créé avant ce champ, ou créé ailleurs → jamais
// supprimé par ce panneau).
const DATA_GROUPS: { key: string; label: string; icon: string; desc: string; tables: string[] }[] = [
  { key: "po",        label: "Commandes fournisseurs (PO)", icon: "📦", desc: "Bons d'achat saisis depuis le mobile uniquement (PO ne sont jamais créés sur mobile).", tables: ["fl_purchase_orders", "fl_bons_achat"] },
  { key: "commandes", label: "Commandes clients",           icon: "🧾", desc: "Commandes prises par les prévendeurs sur mobile uniquement — jamais les commandes back-office ou site web.", tables: ["fl_commandes"] },
]

// ── Droits de suppression par équipe ────────────────────────────────────────
// Un Super Super Administrateur (top admin) peut cibler « Toutes les équipes »
// ou une équipe précise. Un Super Administrateur standard (ou admin) est
// toujours restreint à sa propre équipe (effectiveGroupId), sans sélecteur.
// Aucune des 3 tables mobiles ne porte de `groupeId` propre : on résout
// l'équipe propriétaire via le champ créateur existant de chaque table
// (jamais de nouveau champ requis, jamais de modification des flux mobile).
const OWNER_FIELD: Record<string, string> = {
  fl_purchase_orders: "createdBy",
  fl_bons_achat: "acheteurId",
  fl_commandes: "commercialId",
}
const SCOPE_ALL = "__all__"

function resolveOwnerGroup(table: string, payload: Record<string, unknown> | undefined, usersById: Map<string, User>): string | undefined {
  const field = OWNER_FIELD[table]
  const uid = field && payload ? (payload[field] as string | undefined) : undefined
  const owner = uid ? usersById.get(uid) : undefined
  return owner ? effectiveGroupId(owner) : undefined
}

export default function BOMobileGestion({ user }: Props) {
  const [allUsers, setAllUsers]   = useState<User[]>([])
  const [search, setSearch]       = useState("")
  const [msg, setMsg]             = useState<{ ok: boolean; text: string } | null>(null)
  const [confirmUser, setConfirmUser] = useState<User | null>(null)
  const [confirmGroup, setConfirmGroup] = useState<string | null>(null)
  const [busyGroup, setBusyGroup] = useState<string | null>(null)
  const [restartLoading, setRestartLoading] = useState(false)
  const [restartMsg, setRestartMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const isTop = isSuperSuperAdmin(user)
  const myGroup = effectiveGroupId(user)
  const [scope, setScope] = useState<string>(SCOPE_ALL)   // top admin uniquement

  const load = useCallback(() => {
    setAllUsers(store.getUsers())
  }, [])
  useEffect(() => { load() }, [load])

  // Équipes = comptes admin racine (leur propre groupeId), pour le sélecteur top admin.
  const teams = useMemo(() => (
    allUsers
      .filter(u => ["super_super_admin", "super_admin", "admin"].includes(u.role) && effectiveGroupId(u) === u.id)
      .map(u => ({ id: u.id, label: u.name }))
  ), [allUsers])

  // Portée effective de cette session : top admin = ce qu'il a choisi (ou tout) ;
  // super admin / admin standard = toujours sa propre équipe, jamais les autres.
  const effectiveScope = isTop ? scope : myGroup
  const scopeLabel = effectiveScope === SCOPE_ALL ? "toutes les équipes" : (teams.find(t => t.id === effectiveScope)?.label ?? "équipe inconnue")

  const users = useMemo(() => {
    const mobiles = allUsers.filter(u => isMobileRole(u.role))
    if (effectiveScope === SCOPE_ALL) return mobiles
    return mobiles.filter(u => effectiveGroupId(u) === effectiveScope)
  }, [allUsers, effectiveScope])

  if (!canAccess(user)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="text-4xl mb-3">🔒</div>
          <p className="text-sm text-gray-500">Accès réservé aux administrateurs.</p>
        </div>
      </div>
    )
  }

  const filtered = users.filter(u => {
    if (!search) return true
    const q = search.toLowerCase()
    return u.name.toLowerCase().includes(q) || (u.phone ?? "").includes(q) || (ROLE_LABELS[u.role] ?? u.role).toLowerCase().includes(q)
  })

  async function deleteProfile(u: User) {
    setConfirmUser(null)
    // Garde-fou : un super admin/admin standard ne peut jamais supprimer un
    // profil d'une autre équipe, même par appel direct — seul le top admin
    // (super_super_admin) n'est pas restreint.
    if (!isTop && effectiveGroupId(u) !== myGroup) {
      setMsg({ ok: false, text: `⛔ Ce profil appartient à une autre équipe — suppression refusée.` })
      setTimeout(() => setMsg(null), 4000)
      return
    }
    store.saveUsers(store.getUsers().filter(x => x.id !== u.id))
    try {
      await fetch("/api/sync-write", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: "fl_users", deletes: [u.id] }),
      })
    } catch { /* offline */ }
    setMsg({ ok: true, text: `✅ Profil ${u.name} supprimé.` })
    setTimeout(() => setMsg(null), 4000)
    load()
  }

  async function clearGroup(group: typeof DATA_GROUPS[number]) {
    setBusyGroup(group.key); setConfirmGroup(null)
    const usersById = new Map(allUsers.map(u => [u.id, u]))
    try {
      let totalDeleted = 0
      let totalSkippedAutreEquipe = 0
      let sbErrors = 0
      for (const table of group.tables) {
        // Ne jamais faire un clearAll — on ne supprime QUE les lignes dont le
        // payload porte createdVia:"mobile" (jamais les enregistrements
        // back-office/web, ni les anciens enregistrements sans ce champ).
        const readRes = await fetch(`/api/sync-read?table=${table}`, { cache: "no-store" })
        const readData = await readRes.json()
        const rows: { id: string; payload?: Record<string, unknown> }[] = readData?.ok ? (readData.data ?? []) : []
        const mobileRows = rows.filter(r => r.payload?.createdVia === "mobile")
        // Portée équipe : un top admin sur "toutes les équipes" supprime tout ;
        // sinon (top admin sur une équipe précise, ou super admin/admin standard
        // toujours restreint à la sienne) on ne garde que les lignes dont le
        // créateur résolu appartient à cette équipe — un créateur introuvable
        // (compte supprimé, ancien enregistrement) n'est JAMAIS supprimé par un
        // admin non-top, par prudence.
        const eligible = effectiveScope === SCOPE_ALL
          ? mobileRows
          : mobileRows.filter(r => resolveOwnerGroup(table, r.payload, usersById) === effectiveScope)
        totalSkippedAutreEquipe += mobileRows.length - eligible.length
        const mobileIds = eligible.map(r => r.id)
        if (mobileIds.length === 0) continue
        const writeRes = await fetch("/api/sync-write", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ table, deletes: mobileIds }),
        })
        const writeData = await writeRes.json()
        if (!writeData.ok) { sbErrors++; continue }
        totalDeleted += mobileIds.length
        try {
          const local = JSON.parse(localStorage.getItem(table) ?? "[]") as { id: string }[]
          localStorage.setItem(table, JSON.stringify(local.filter(r => !mobileIds.includes(r.id))))
        } catch { /* local cache best-effort */ }
      }
      const restriction = totalSkippedAutreEquipe > 0 ? ` (${totalSkippedAutreEquipe} enregistrement(s) d'autres équipes préservé(s))` : ""
      setMsg(sbErrors > 0
        ? { ok: false, text: `Effacement partiel — ${sbErrors} table(s) Supabase non effacée(s).` }
        : { ok: true, text: `✅ ${totalDeleted} enregistrement(s) mobile effacé(s) dans ${group.label} — ${scopeLabel}${restriction}.` })
    } catch {
      setMsg({ ok: false, text: `Erreur lors de l'effacement de ${group.label}.` })
    }
    setBusyGroup(null)
    setTimeout(() => setMsg(null), 6000)
  }

  async function restartMobiles() {
    setRestartLoading(true); setRestartMsg(null)
    try {
      const { createClient } = await import("@/lib/supabase/client")
      const sb = createClient()
      const channel = sb.channel("freshlink-erp-realtime-v3")
      await channel.subscribe()
      await channel.send({
        type: "broadcast", event: "force_restart",
        payload: { requestedBy: user.name, ts: new Date().toISOString() },
      })
      sb.removeChannel(channel)
      setRestartMsg({ ok: true, text: "✅ Signal envoyé — tous les mobiles connectés vont se recharger d'ici 2 secondes." })
    } catch (e) {
      setRestartMsg({ ok: false, text: `Erreur: ${String(e)}` })
    }
    setRestartLoading(false)
    setTimeout(() => setRestartMsg(null), 8000)
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto flex flex-col gap-6">

      {/* En-tête */}
      <div>
        <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">📱 Gestion Mobile</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Profils des utilisateurs mobile, effacement des données terrain et redémarrage à distance — tout au même endroit.
        </p>
      </div>

      {msg && (
        <div className={`px-4 py-3 rounded-xl text-sm font-semibold border ${msg.ok ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
          {msg.text}
        </div>
      )}

      {/* Portée équipe — top admin choisit, super admin/admin standard est restreint */}
      <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 px-5 py-3.5 flex items-center gap-3 flex-wrap">
        <span className="text-lg">🛡️</span>
        {isTop ? (
          <>
            <label className="text-xs font-bold text-indigo-900">Portée des suppressions (Top Admin) :</label>
            <select
              value={scope} onChange={e => setScope(e.target.value)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold border border-indigo-300 bg-white outline-none focus:border-indigo-500">
              <option value={SCOPE_ALL}>🌐 Toutes les équipes (global)</option>
              {teams.map(t => <option key={t.id} value={t.id}>👥 {t.label}</option>)}
            </select>
            <span className="text-[11px] text-indigo-700">Vous seul pouvez cibler une autre équipe que la vôtre, ou toutes à la fois.</span>
          </>
        ) : (
          <span className="text-xs font-semibold text-indigo-900">
            Restreint à votre équipe (<strong>{scopeLabel}</strong>) — impossible de voir ou supprimer les données des autres équipes.
          </span>
        )}
      </div>

      {/* Redémarrer les mobiles */}
      <div className="rounded-2xl border border-red-200 overflow-hidden">
        <div className="px-5 py-4 bg-red-50 flex items-center gap-3 border-b border-red-200">
          <span className="text-xl">🔄</span>
          <div>
            <p className="font-bold text-red-900 text-sm">Redémarrer les appareils mobile</p>
            <p className="text-xs text-red-700">Force le rechargement immédiat de l&apos;app sur tous les téléphones connectés (prévendeurs, livreurs, acheteurs…).</p>
          </div>
        </div>
        <div className="p-5 bg-white flex flex-col gap-3">
          {restartMsg && (
            <div className={`px-4 py-2.5 rounded-xl text-sm border ${restartMsg.ok ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
              {restartMsg.text}
            </div>
          )}
          <button
            onClick={restartMobiles}
            disabled={restartLoading}
            className="self-start flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-colors disabled:opacity-50 shadow-sm">
            {restartLoading ? "Envoi..." : "Redémarrer tous les mobiles"}
          </button>
        </div>
      </div>

      {/* Effacer des données mobile */}
      <div className="rounded-2xl border border-amber-200 overflow-hidden">
        <div className="px-5 py-4 bg-amber-50 flex items-center gap-3 border-b border-amber-200">
          <span className="text-xl">🗑️</span>
          <div>
            <p className="font-bold text-amber-900 text-sm">Effacer des données mobile</p>
            <p className="text-xs text-amber-700">Vide une catégorie de données (local + Supabase). Irréversible — les mobiles repartiront de zéro sur cette catégorie.</p>
          </div>
        </div>
        <div className="p-5 bg-white grid grid-cols-1 sm:grid-cols-3 gap-4">
          {DATA_GROUPS.map(group => (
            <div key={group.key} className="border-2 border-amber-100 rounded-2xl p-4 bg-amber-50/30 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">{group.icon}</span>
                <p className="text-sm font-black text-amber-800">{group.label}</p>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed flex-1">{group.desc}</p>
              {confirmGroup !== group.key ? (
                <button
                  onClick={() => setConfirmGroup(group.key)}
                  disabled={busyGroup === group.key}
                  className="mt-auto px-3 py-2 rounded-xl text-xs font-bold text-amber-800 bg-amber-100 border border-amber-300 hover:bg-amber-200 transition-colors disabled:opacity-50">
                  {busyGroup === group.key ? "Effacement..." : "Effacer"}
                </button>
              ) : (
                <div className="mt-auto flex flex-col gap-2">
                  <p className="text-[11px] font-bold text-amber-700">Confirmer l&apos;effacement ?</p>
                  <div className="flex gap-2">
                    <button onClick={() => clearGroup(group)}
                      className="flex-1 py-1.5 rounded-lg text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 transition-colors">
                      Oui
                    </button>
                    <button onClick={() => setConfirmGroup(null)}
                      className="flex-1 py-1.5 rounded-lg text-xs font-semibold border border-border hover:bg-muted transition-colors">
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Profils mobile */}
      <div className="rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-4 bg-muted/30 flex items-center justify-between gap-3 flex-wrap border-b border-border">
          <div>
            <p className="font-bold text-gray-900 text-sm">👤 Profils mobile ({users.length})</p>
            <p className="text-xs text-muted-foreground">Prévendeurs, livreurs, acheteurs, magasiniers, dispatcheurs…</p>
          </div>
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Nom, téléphone, rôle..."
            className="px-3 py-1.5 rounded-full text-xs border border-gray-200 outline-none focus:border-blue-400 w-56"
          />
        </div>
        <div className="p-3 flex flex-col gap-2">
          {filtered.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">Aucun profil mobile trouvé.</div>
          ) : filtered.map(u => (
            <div key={u.id} className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-border hover:bg-slate-50 transition-colors flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-gray-900">{u.name}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                    {ROLE_LABELS[u.role] ?? u.role}
                  </span>
                  {!u.actif && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">Inactif</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{u.phone || "—"}</p>
              </div>
              {confirmUser?.id !== u.id ? (
                <button onClick={() => setConfirmUser(u)}
                  className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-red-100 text-gray-600 hover:text-red-600 text-xs font-semibold transition-all shrink-0">
                  🗑️ Supprimer
                </button>
              ) : (
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-bold text-red-700">Confirmer ?</span>
                  <button onClick={() => deleteProfile(u)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-colors">
                    Oui
                  </button>
                  <button onClick={() => setConfirmUser(null)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-border hover:bg-muted transition-colors">
                    Annuler
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
