// ══════════════════════════════════════════════════════════════════════════════
// auditLog.ts — Journal d'activité : qui fait quoi et quand.
//
// S'appuie sur le même vocabulaire d'actions que lib/permissions.ts (PermKey) —
// chaque action déjà gatée par hasPermission() peut être loguée avec la même
// clé, sans dupliquer de liste. Isolation par équipe (comme isClientVisible) :
// une équipe ne voit que son propre historique, seul super_super_admin (et les
// rôles ayant voir_toutes_equipes) ont la vision globale consolidée.
//
// logAction() est fire-and-forget : le logging ne doit JAMAIS faire échouer
// l'action métier qu'il accompagne.
// ══════════════════════════════════════════════════════════════════════════════

import { getLS, setLS, effectiveGroupId, canSeeAllGroups, type UserRole, type User } from "@/lib/store"
import { PERMISSIONS, type PermKey } from "@/lib/permissions"

// Certains écrans typent leur prop `user` avec un sous-ensemble minimal de
// User (ex: { id, name, role }) plutôt que le type complet — logAction()
// accepte cette forme réduite pour rester utilisable partout sans forcer
// chaque appelant à recharger un User complet juste pour logger.
type ActorLike = { id: string; name: string; role: UserRole; groupeId?: string }

export interface AuditLogEntry {
  id: string
  timestamp: string   // ISO
  userId: string
  userName: string
  userRole: UserRole
  groupeId: string          // équipe de l'acteur au moment de l'action (cf. effectiveGroupId)
  action: PermKey
  actionLabel: string       // libellé mis en cache — survit à un futur renommage dans PERMISSIONS
  category: string          // catégorie mise en cache
  entityType?: string       // "commande" | "client" | "article" | "echelon" | "utilisateur"...
  entityId?: string
  entityLabel?: string      // libellé lisible (numéro de commande, nom client...)
  result: "success" | "denied"
}

const LS_KEY = "fl_audit_log"
// Cap de rétention — au-delà, les entrées les plus anciennes sont purgées pour
// ne pas faire grossir indéfiniment le localStorage / la table Supabase.
const MAX_ENTRIES = 5000

function genLogId(): string {
  return `log_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function getAuditLog(): AuditLogEntry[] {
  return getLS<AuditLogEntry[]>(LS_KEY, [])
}

// Journal visible par l'utilisateur connecté — filtré par équipe, sauf pour
// les comptes voyant toutes les équipes (super_super_admin).
export function getVisibleAuditLog(user: User | null | undefined): AuditLogEntry[] {
  const all = getAuditLog()
  if (canSeeAllGroups(user)) return all
  if (!user) return []
  const myGroup = effectiveGroupId(user)
  return all.filter(e => e.groupeId === myGroup)
}

export function logAction(
  user: ActorLike | null | undefined,
  action: PermKey,
  result: "success" | "denied",
  entity?: { type?: string; id?: string; label?: string },
): void {
  try {
    if (!user) return
    const def = PERMISSIONS.find(p => p.key === action)
    const entry: AuditLogEntry = {
      id: genLogId(),
      timestamp: new Date().toISOString(),
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      groupeId: user.groupeId ?? user.id,
      action,
      actionLabel: def?.label ?? action,
      category: def?.category ?? "",
      entityType: entity?.type,
      entityId: entity?.id,
      entityLabel: entity?.label,
      result,
    }
    const all = getAuditLog()
    all.push(entry)
    const trimmed = all.length > MAX_ENTRIES ? all.slice(all.length - MAX_ENTRIES) : all
    setLS(LS_KEY, trimmed)
  } catch {
    /* le logging ne doit jamais bloquer l'action métier */
  }
}
