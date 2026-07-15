"use client"

import { useState, useEffect } from "react"
import { store, type AccountRequest, type User, type Client, type Fournisseur } from "@/lib/store"
import { hasPermission } from "@/lib/permissions"
import { logAction } from "@/lib/auditLog"

function generatePassword(len = 10): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
}

interface Props { user: User }

const STATUT_CFG: Record<string, { label: string; cls: string; icon: string }> = {
  en_attente: { label: "En attente", cls: "bg-amber-100 text-amber-700 border-amber-300",  icon: "⏳" },
  approuve:   { label: "Approuvé",   cls: "bg-green-100 text-green-700 border-green-300",  icon: "✅" },
  rejete:     { label: "Rejeté",     cls: "bg-red-100 text-red-700 border-red-300",         icon: "❌" },
}

function canAccess(user: User): boolean {
  return [
    "master_admin", "super_admin", "admin", "super_super_admin",
    "directeur_general", "directeur_commercial",
    "resp_commercial", "resp_logistique", "resp_achat",
  ].includes(user.role)
}

export default function BODemandesComptes({ user }: Props) {
  const [requests, setRequests]     = useState<AccountRequest[]>([])
  const [filter, setFilter]         = useState<"tous" | "en_attente" | "approuve" | "rejete">("en_attente")
  const [selected, setSelected]     = useState<AccountRequest | null>(null)
  const [msg, setMsg]               = useState<{ ok: boolean; text: string } | null>(null)

  // ── Paramètres d'auto-validation (règles d'approbation automatique) ──────────
  const [showAutoCfg, setShowAutoCfg] = useState(false)
  const [autoCfg, setAutoCfg] = useState<{ enabled: boolean; autoTypes: string[]; phonePrefixes: string; gpsLat: string; gpsLng: string; gpsRadius: string }>(
    { enabled: false, autoTypes: [], phonePrefixes: "", gpsLat: "", gpsLng: "", gpsRadius: "5" }
  )
  useEffect(() => {
    fetch("/api/sync-read?table=fl_account_requests", { cache: "no-store" })
      .then(r => r.json()).then(j => {
        const row = (j?.data ?? []).find((x: { id: string }) => x.id === "__autoapprove")
        const p = row?.payload
        if (p) {
          const z = (Array.isArray(p.gpsZones) && p.gpsZones[0]) ? p.gpsZones[0] : {}
          setAutoCfg({
            enabled: p.enabled === true,
            autoTypes: Array.isArray(p.autoTypes) ? p.autoTypes : [],
            phonePrefixes: Array.isArray(p.phonePrefixes) ? p.phonePrefixes.join(", ") : "",
            gpsLat: z.lat != null ? String(z.lat) : "",
            gpsLng: z.lng != null ? String(z.lng) : "",
            gpsRadius: z.radiusKm != null ? String(z.radiusKm) : "5",
          })
        }
      }).catch(() => {})
  }, [])
  async function saveAutoCfg() {
    const payload: Record<string, unknown> = {
      enabled: autoCfg.enabled,
      autoTypes: autoCfg.autoTypes,
      phonePrefixes: autoCfg.phonePrefixes.split(",").map(s => s.trim()).filter(Boolean),
      gpsZones: (autoCfg.gpsLat && autoCfg.gpsLng)
        ? [{ lat: Number(autoCfg.gpsLat), lng: Number(autoCfg.gpsLng), radiusKm: Number(autoCfg.gpsRadius) || 5 }]
        : [],
      updated_at: new Date().toISOString(),
    }
    try {
      const r = await fetch("/api/sync-write", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: "fl_account_requests", upserts: [{ id: "__autoapprove", payload, updated_at: new Date().toISOString() }] }) })
      const j = await r.json()
      if (!j.ok) throw new Error("save")
      setMsg({ ok: true, text: "✅ Règles d'auto-validation enregistrées." })
      setShowAutoCfg(false)
    } catch { setMsg({ ok: false, text: "Erreur d'enregistrement des règles." }) }
    setTimeout(() => setMsg(null), 4000)
  }
  function toggleAutoType(t: string) {
    setAutoCfg(c => ({ ...c, autoTypes: c.autoTypes.includes(t) ? c.autoTypes.filter(x => x !== t) : [...c.autoTypes, t] }))
  }

  // ── Approve form ────────────────────────────────────────────────────────────
  const [approveForm, setApproveForm] = useState({ email: "", nom: "", password: "" })
  const [showApprove, setShowApprove] = useState(false)

  // ── Reject form ─────────────────────────────────────────────────────────────
  const [rejectReason, setRejectReason] = useState("")
  const [showReject, setShowReject]     = useState(false)

  // ── Edit form ───────────────────────────────────────────────────────────────
  const [showEdit, setShowEdit]         = useState(false)
  const [editForm, setEditForm]         = useState({
    nom: "", telephone: "", email: "", ville: "", societe: "", message: "", statut: "en_attente",
  })

  // ── LocalStorage helpers (cache hors-ligne uniquement) ──────────────────────
  const getAccountRequests = (): AccountRequest[] => {
    try { return JSON.parse(localStorage.getItem("fl_account_requests") ?? "[]") } catch { return [] }
  }
  const saveAccountRequests = (arr: AccountRequest[]) => {
    try { localStorage.setItem("fl_account_requests", JSON.stringify(arr)) } catch {}
  }

  const refresh = () => setRequests(getAccountRequests())

  // ── Sync depuis Supabase (service_role, format JSONB {id, payload}) ──────────
  // Supabase = source de vérité ; le localStorage sert seulement de cache hors-ligne.
  const syncFromSupabase = async () => {
    try {
      const res  = await fetch("/api/sync-read?table=fl_account_requests", { cache: "no-store" })
      const json = await res.json()
      if (!json?.ok) return
      const rows = (json.data ?? []) as { id: string; payload?: Record<string, unknown> }[]
      const fromSb: AccountRequest[] = rows
        .filter(r => !String(r.id).startsWith("__"))
        .map(r => {
          const p = r.payload ?? {}
          return {
            id:        r.id,
            type:      String(p.type ?? "client") as "client" | "fournisseur" | "livreur",
            sous_type: p.sous_type ? String(p.sous_type) : undefined,
            nom:       String(p.nom ?? ""),
            email:     String(p.email ?? ""),
            telephone: String(p.telephone ?? ""),
            societe:   String(p.societe ?? ""),
            ice:       p.ice as string | undefined,
            ville:     p.ville as string | undefined,
            message:   p.message as string | undefined,
            statut:    String(p.statut ?? "en_attente") as AccountRequest["statut"],
            createdAt: String(p.created_at ?? new Date().toISOString()),
            _linkedClientId:      p._linkedClientId as string | undefined,
            _linkedFournisseurId: p._linkedFournisseurId as string | undefined,
            _linkedUserId:        p._linkedUserId as string | undefined,
          } as AccountRequest
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      setRequests(fromSb)
      saveAccountRequests(fromSb)
    } catch { /* hors ligne → garde le cache local */ }
  }

  // ── Helpers écriture Supabase (service_role) ─────────────────────────────────
  async function writeRequestStatut(reqId: string, statut: string, extra: Record<string, unknown> = {}) {
    const cur = requests.find(r => r.id === reqId)
    const payload = {
      type: cur?.type, sous_type: cur?.sous_type, nom: cur?.nom, email: cur?.email,
      telephone: cur?.telephone, societe: cur?.societe, ice: cur?.ice, ville: cur?.ville,
      message: cur?.message, created_at: cur?.createdAt,
      _linkedClientId: cur?._linkedClientId, _linkedUserId: (cur as { _linkedUserId?: string })?._linkedUserId,
      statut, updated_at: new Date().toISOString(), ...extra,
    }
    try {
      await fetch("/api/sync-write", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: "fl_account_requests", upserts: [{ id: reqId, payload, updated_at: new Date().toISOString() }] }) })
    } catch {}
  }
  async function setUserActifSb(userId: string, actif: boolean) {
    if (!userId) return
    try {
      const r = await fetch("/api/sync-read?table=fl_users", { cache: "no-store" })
      const j = await r.json()
      const row = (j?.data ?? []).find((x: { id: string }) => x.id === userId) as { payload?: Record<string, unknown> } | undefined
      const payload = { ...(row?.payload ?? {}), actif }
      await fetch("/api/sync-write", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: "fl_users", upserts: [{ id: userId, payload, updated_at: new Date().toISOString() }] }) })
    } catch {}
  }

  useEffect(() => { refresh(); syncFromSupabase() }, [])

  if (!canAccess(user)) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center">
          <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <p className="text-lg font-bold text-foreground">Accès restreint</p>
        <p className="text-sm text-muted-foreground">Section réservée aux responsables et administrateurs.</p>
      </div>
    )
  }

  const filtered = requests.filter(r => filter === "tous" || r.statut === filter)
  const countPending = requests.filter(r => r.statut === "en_attente").length

  // ── Open modals ─────────────────────────────────────────────────────────────
  const openApprove = (req: AccountRequest) => {
    const pwd = generatePassword()
    setSelected(req)
    setApproveForm({ email: req.email, nom: req.nom, password: pwd })
    setShowApprove(true)
    setShowReject(false)
    setShowEdit(false)
    setMsg(null)
  }

  const openReject = (req: AccountRequest) => {
    setSelected(req)
    setRejectReason("")
    setShowReject(true)
    setShowApprove(false)
    setShowEdit(false)
    setMsg(null)
  }

  const openEdit = (req: AccountRequest) => {
    setSelected(req)
    setEditForm({
      nom:       req.nom,
      telephone: req.telephone,
      email:     req.email,
      ville:     req.ville ?? "",
      societe:   req.societe ?? "",
      message:   req.message ?? "",
      statut:    req.statut,
    })
    setShowEdit(true)
    setShowApprove(false)
    setShowReject(false)
    setMsg(null)
  }

  // ── CRUD actions ─────────────────────────────────────────────────────────────

  const handleApprove = async () => {
    if (!selected) return
    // Fournisseur/client ont chacun leur permission dédiée ; le type "livreur"
    // n'a pas de clé dédiée dans la matrice — non gaté volontairement plutôt
    // que de deviner la bonne permission.
    const approvePerm = selected.type === "fournisseur" ? "approuver_compte_fournisseur"
      : selected.type === "client" ? "approuver_compte_client" : null
    if (approvePerm) {
      if (!hasPermission(user.role, approvePerm)) { logAction(user, approvePerm, "denied", { type: "demande_compte", label: selected.nom }); return }
      logAction(user, approvePerm, "success", { type: "demande_compte", label: selected.nom })
    }
    const phone = selected.telephone?.replace(/\D/g, "") ?? ""
    const linkedUserId = (selected as { _linkedUserId?: string })._linkedUserId

    if (linkedUserId) {
      // ── Compte déjà existant (web Supabase OU livreur créé via Dispatch).
      //    On l'ACTIVE (Supabase + local) + on marque la demande « approuvée ».
      //    Aucune création en double.
      await setUserActifSb(linkedUserId, true)
      // Activation LOCALE du compte (livreur créé depuis Dispatch)
      try {
        const usersLocal = store.getUsers().map(u => u.id === linkedUserId ? { ...u, actif: true } : u)
        store.saveUsers(usersLocal)
      } catch { /* noop */ }
      // Activer aussi le livreur lié
      if (selected.type === "livreur" && selected._linkedLivreurId) {
        try {
          const livreurs = store.getLivreurs().map(l =>
            l.id === selected._linkedLivreurId ? { ...l, actif: true, compteStatut: "valide" as const } : l)
          store.saveLivreurs(livreurs)
        } catch { /* noop */ }
      }
      await writeRequestStatut(selected.id, "approuve", { approvedBy: user.id, approvedAt: new Date().toISOString() })
      setRequests(prev => prev.map(r => r.id === selected.id ? { ...r, statut: "approuve" as const } : r))
      if (phone) {
        const waMsg = encodeURIComponent(
          `Bonjour ${selected.nom} 👋\n\n✅ Votre compte Vita Fresh est *validé* !\n\n` +
          `🌐 Connectez-vous avec le téléphone/email et le mot de passe reçus à l'inscription.\n\n— Vita Fresh 🍃`)
        setTimeout(() => window.open(`https://wa.me/${phone}?text=${waMsg}`, "_blank"), 400)
      }
      setShowApprove(false); setSelected(null)
      setMsg({ ok: true, text: `✅ Compte validé pour ${selected.nom}.${phone ? " WhatsApp ouvert !" : ""}` })
      setTimeout(() => setMsg(null), 7000)
      return
    }

    // ── Demande MANUELLE (legacy, sans compte lié) : on crée le compte ──────────
    if (!approveForm.email.trim() || !approveForm.nom.trim() || !approveForm.password.trim()) {
      setMsg({ ok: false, text: "Tous les champs sont requis." }); return
    }
    const role: User["role"] = selected.type === "client" ? "client" : selected.type === "livreur" ? "livreur" : "fournisseur"
    const newUser: User = {
      id: store.genId(), name: approveForm.nom.trim(), email: approveForm.email.trim(),
      telephone: selected.telephone,
      password: approveForm.password.trim(),
      role,
      actif: true, accessType: selected.type === "livreur" ? "mobile" : "both",
      ...(selected.type === "client" && selected._linkedClientId ? { clientId: selected._linkedClientId } : {}),
      ...(selected.type === "fournisseur" && selected._linkedFournisseurId ? { fournisseurId: selected._linkedFournisseurId } : {}),
    }
    // Livreur : activer le compte du livreur lié (créé "en_attente" depuis Dispatch)
    if (selected.type === "livreur" && selected._linkedLivreurId) {
      const livreurs = store.getLivreurs().map(l =>
        l.id === selected._linkedLivreurId ? { ...l, actif: true, compteStatut: "valide" as const } : l)
      store.saveLivreurs(livreurs)
    }
    if (selected.type === "client" && !selected._linkedClientId) {
      const client: Client = {
        id: store.genId(), nom: selected.societe || selected.nom, secteur: "", zone: "", type: "autre",
        taille: "50-100kg", typeProduits: "moyenne", rotation: "journalier",
        telephone: selected.telephone, email: selected.email, adresse: selected.ville ?? "",
        createdBy: user.id, createdAt: new Date().toISOString(),
      }
      store.addClient(client); newUser.clientId = client.id
    }
    if (selected.type === "fournisseur" && !selected._linkedFournisseurId) {
      const fourn: Fournisseur = {
        id: store.genId(), nom: selected.societe || selected.nom, contact: selected.nom,
        telephone: selected.telephone, email: selected.email, ville: selected.ville,
        ice: selected.ice, specialites: [], itineraires: [],
      }
      store.saveFournisseurs([...store.getFournisseurs(), fourn]); newUser.fournisseurId = fourn.id
    }
    // Anti-doublon : si un compte existe déjà (même email, ou même nom + téléphone),
    // on le MET À JOUR (réactive + nouveau mot de passe) plutôt que d'empiler un
    // doublon — c'est l'origine des comptes multiples (4× Zouhaidi, 3× Bentaib…)
    // qui font matcher le mauvais enregistrement au login.
    const existingUsers = store.getUsers()
    const emailKey = newUser.email?.trim().toLowerCase() ?? ""
    const phoneKey = (selected.telephone ?? "").replace(/[\s\-.+]/g, "")
    const nameKey  = newUser.name.trim().toLowerCase()
    const dupIdx = existingUsers.findIndex(u =>
      (!!emailKey && (u.email ?? "").trim().toLowerCase() === emailKey) ||
      (!!phoneKey && (u.telephone ?? "").replace(/[\s\-.+]/g, "") === phoneKey && (u.name ?? "").trim().toLowerCase() === nameKey)
    )
    if (dupIdx >= 0) {
      existingUsers[dupIdx] = { ...existingUsers[dupIdx], ...newUser, id: existingUsers[dupIdx].id }
      store.saveUsers(existingUsers)
    } else {
      store.saveUsers([...existingUsers, newUser])
    }
    await writeRequestStatut(selected.id, "approuve", { approvedBy: user.id, approvedAt: new Date().toISOString() })
    setRequests(prev => prev.map(r => r.id === selected.id ? { ...r, statut: "approuve" as const } : r))
    if (phone) {
      const waMsg = encodeURIComponent(
        `Bonjour ${approveForm.nom} 👋\n\n✅ Votre compte Vita Fresh a été créé !\n\n` +
        `🔑 Connexion :\n• Email : ${approveForm.email}\n• Mot de passe : ${approveForm.password}\n\n` +
        `🌐 https://vitafresh.vita-core.org\n\n— Vita Fresh 🍃`)
      setTimeout(() => window.open(`https://wa.me/${phone}?text=${waMsg}`, "_blank"), 400)
    }
    setShowApprove(false); setSelected(null)
    setMsg({ ok: true, text: `✅ Compte créé pour ${approveForm.nom}.${phone ? " WhatsApp ouvert !" : ""}` })
    setTimeout(() => setMsg(null), 9000)
  }

  const handleReject = async () => {
    if (!selected) return
    if (!hasPermission(user.role, "rejeter_demande_compte")) { logAction(user, "rejeter_demande_compte", "denied", { type: "demande_compte", label: selected.nom }); return }
    logAction(user, "rejeter_demande_compte", "success", { type: "demande_compte", label: selected.nom })
    const linkedUserId = (selected as { _linkedUserId?: string })._linkedUserId
    if (linkedUserId) await setUserActifSb(linkedUserId, false)  // désactive le compte web
    await writeRequestStatut(selected.id, "rejete", { rejectedBy: user.id, rejectedAt: new Date().toISOString(), rejectReason })
    setRequests(prev => prev.map(r => r.id === selected.id ? { ...r, statut: "rejete" as const } : r))
    setShowReject(false); setSelected(null)
    setMsg({ ok: false, text: "Demande rejetée — compte désactivé." })
    setTimeout(() => setMsg(null), 4000)
  }

  const handleEdit = async () => {
    if (!selected) return
    const { nom, telephone, email, ville, societe, message, statut } = editForm
    if (!nom.trim() || !telephone.trim()) {
      setMsg({ ok: false, text: "Nom et téléphone sont requis." })
      return
    }
    // Update localStorage
    const updated = requests.map(r =>
      r.id === selected.id
        ? { ...r, nom: nom.trim(), telephone: telephone.trim(), email: email.trim(),
            ville: ville.trim() || undefined, societe: societe.trim() || undefined,
            message: message.trim() || undefined,
            statut: statut as AccountRequest["statut"] }
        : r
    )
    saveAccountRequests(updated)
    setRequests(updated)
    // Sync to Supabase (service_role, JSONB)
    await fetch("/api/sync-write", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "fl_account_requests", upserts: [{ id: selected.id, payload: {
        type: selected.type, sous_type: selected.sous_type,
        nom: nom.trim(), telephone: telephone.trim(), email: email.trim(),
        ville: ville.trim() || null, societe: societe.trim() || null, message: message.trim() || null,
        ice: selected.ice, statut, created_at: selected.createdAt,
        _linkedUserId: (selected as { _linkedUserId?: string })._linkedUserId, _linkedClientId: selected._linkedClientId,
        updated_at: new Date().toISOString(),
      }, updated_at: new Date().toISOString() }] }) })
    setShowEdit(false)
    setSelected(null)
    setMsg({ ok: true, text: "✅ Demande mise à jour." })
    setTimeout(() => setMsg(null), 4000)
  }

  const handleDelete = async (req: AccountRequest) => {
    if (!confirm(`Supprimer la demande de ${req.nom} ? Cette action est irréversible.`)) return
    const updated = requests.filter(r => r.id !== req.id)
    saveAccountRequests(updated)
    setRequests(updated)
    await fetch("/api/sync-write", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "fl_account_requests", deletes: [req.id] }) })
    setMsg({ ok: true, text: `🗑️ Demande de ${req.nom} supprimée.` })
    setTimeout(() => setMsg(null), 4000)
  }

  const handleChangeStatut = async (req: AccountRequest, newStatut: AccountRequest["statut"]) => {
    const updated = requests.map(r =>
      r.id === req.id ? { ...r, statut: newStatut } : r
    )
    saveAccountRequests(updated)
    setRequests(updated)
    await writeRequestStatut(req.id, newStatut)
    setMsg({ ok: true, text: `Statut mis à jour → ${STATUT_CFG[newStatut]?.label}` })
    setTimeout(() => setMsg(null), 3000)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            📋 Demandes de compte
            {countPending > 0 && (
              <span className="px-2 py-0.5 text-xs font-black rounded-full bg-amber-100 text-amber-700 border border-amber-300">
                {countPending} en attente
              </span>
            )}
          </h2>
          <p className="text-sm text-muted-foreground">Demandes de création de compte depuis le portail externe</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowAutoCfg(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors">
            ⚙️ Auto-validation
          </button>
          <button onClick={() => { refresh(); syncFromSupabase() }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold transition-colors">
            🔄 Actualiser
          </button>
        </div>
      </div>

      {/* ── Modale : Règles d'auto-validation ─────────────────────────────── */}
      {showAutoCfg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowAutoCfg(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800 mb-1">⚙️ Auto-validation des comptes web</h3>
            <p className="text-sm text-slate-500 mb-4">Les comptes qui correspondent à ces règles sont <strong>activés automatiquement</strong> (sans validation manuelle). Les autres restent « en attente ».</p>

            <label className="flex items-center gap-2 mb-4 p-3 rounded-xl border border-emerald-200 bg-emerald-50 cursor-pointer">
              <input type="checkbox" checked={autoCfg.enabled} onChange={e => setAutoCfg(c => ({ ...c, enabled: e.target.checked }))} className="w-5 h-5 accent-emerald-600" />
              <span className="text-sm font-semibold text-emerald-800">Activer les règles d'auto-validation</span>
            </label>

            <div className="mb-4">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Par type de client (auto-validés)</div>
              <div className="flex flex-wrap gap-2">
                {[["particulier","🏠 Particulier"],["client","👤 Client"],["chr","🍽️ CHR"],["marchand","🏪 Marchand"],["fournisseur","🚚 Fournisseur"]].map(([v,lab]) => (
                  <button key={v} type="button" onClick={() => toggleAutoType(v)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${autoCfg.autoTypes.includes(v) ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-300"}`}>
                    {lab}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Par préfixe de téléphone (séparés par virgule)</label>
              <input value={autoCfg.phonePrefixes} onChange={e => setAutoCfg(c => ({ ...c, phonePrefixes: e.target.value }))}
                placeholder="Ex : 0661, 0770" className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>

            <div className="mb-5">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Par zone GPS (rayon autour d'un point)</div>
              <div className="grid grid-cols-3 gap-2">
                <input value={autoCfg.gpsLat} onChange={e => setAutoCfg(c => ({ ...c, gpsLat: e.target.value }))} placeholder="Latitude" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                <input value={autoCfg.gpsLng} onChange={e => setAutoCfg(c => ({ ...c, gpsLng: e.target.value }))} placeholder="Longitude" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                <input value={autoCfg.gpsRadius} onChange={e => setAutoCfg(c => ({ ...c, gpsRadius: e.target.value }))} placeholder="Rayon km" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Astuce : récupère lat/lng sur Google Maps (clic droit → coordonnées).</p>
            </div>

            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAutoCfg(false)} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold">Annuler</button>
              <button onClick={saveAutoCfg} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold">💾 Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {/* Message */}
      {msg && (
        <div className={`flex items-start gap-2 px-4 py-3 rounded-xl border text-sm ${msg.ok ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
          <span className="font-medium">{msg.text}</span>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted overflow-x-auto w-fit">
        {([
          { v: "en_attente", label: "En attente" },
          { v: "approuve",   label: "Approuvées" },
          { v: "rejete",     label: "Rejetées" },
          { v: "tous",       label: "Toutes" },
        ] as const).map(f => (
          <button key={f.v} onClick={() => setFilter(f.v)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${filter === f.v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {f.label}
            {f.v !== "tous" && (
              <span className="ml-1.5 text-[10px] font-black">{requests.filter(r => r.statut === f.v).length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── APPROVE MODAL ───────────────────────────────────────────────────── */}
      {showApprove && selected && (
        <div className="bg-card border-2 border-green-300 rounded-2xl p-6 flex flex-col gap-4 shadow-md">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-green-700 flex items-center gap-2">✅ Approuver — Créer le compte</h3>
            <button onClick={() => setShowApprove(false)} className="text-muted-foreground hover:text-foreground">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-800">
            <p><strong>Demandeur :</strong> {selected.nom} — {selected.societe}</p>
            <p><strong>Type :</strong> {selected.type === "client" ? "Client" : "Fournisseur"}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {([
              { f: "nom", label: "Nom affiché *", type: "text" },
              { f: "email", label: "Email de connexion *", type: "email" },
            ] as const).map(({ f, label, type }) => (
              <div key={f} className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-foreground">{label}</label>
                <input type={type} value={approveForm[f]}
                  onChange={e => setApproveForm(p => ({ ...p, [f]: e.target.value }))}
                  className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-foreground">Mot de passe initial *</label>
            <div className="flex gap-2">
              <input type="text" value={approveForm.password}
                onChange={e => setApproveForm(p => ({ ...p, password: e.target.value }))}
                className="flex-1 px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary" />
              <button onClick={() => setApproveForm(f => ({ ...f, password: generatePassword() }))}
                className="px-3 py-2 rounded-xl border border-border text-xs hover:bg-muted transition-colors">
                Générer
              </button>
            </div>
          </div>
          <div className="flex gap-3 pt-2 border-t border-border">
            <button onClick={handleApprove}
              className="px-5 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors">
              ✅ Approuver & Créer le compte
            </button>
            <button onClick={() => setShowApprove(false)}
              className="px-5 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors">
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* ── REJECT MODAL ────────────────────────────────────────────────────── */}
      {showReject && selected && (
        <div className="bg-card border-2 border-red-300 rounded-2xl p-6 flex flex-col gap-4 shadow-md">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-red-700">❌ Rejeter la demande</h3>
            <button onClick={() => setShowReject(false)} className="text-muted-foreground hover:text-foreground">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <p className="text-sm text-foreground">Demande de <strong>{selected.nom}</strong> ({selected.societe})</p>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold">Motif du rejet (optionnel)</label>
            <textarea rows={2} value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              placeholder="Raison du refus…" />
          </div>
          <div className="flex gap-3">
            <button onClick={handleReject}
              className="px-5 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors">
              Confirmer le rejet
            </button>
            <button onClick={() => setShowReject(false)}
              className="px-5 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors">
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* ── EDIT MODAL ──────────────────────────────────────────────────────── */}
      {showEdit && selected && (
        <div className="bg-card border-2 border-blue-300 rounded-2xl p-6 flex flex-col gap-4 shadow-md">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-blue-700">✏️ Modifier la demande</h3>
            <button onClick={() => setShowEdit(false)} className="text-muted-foreground hover:text-foreground">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {([
              { f: "nom",       label: "Nom *",       type: "text"  },
              { f: "telephone", label: "Téléphone *",  type: "tel"   },
              { f: "email",     label: "Email",        type: "email" },
              { f: "ville",     label: "Ville",        type: "text"  },
              { f: "societe",   label: "Société",      type: "text"  },
            ] as const).map(({ f, label, type }) => (
              <div key={f} className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-foreground">{label}</label>
                <input type={type} value={editForm[f]}
                  onChange={e => setEditForm(p => ({ ...p, [f]: e.target.value }))}
                  className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            ))}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-foreground">Statut</label>
              <select value={editForm.statut} onChange={e => setEditForm(p => ({ ...p, statut: e.target.value }))}
                className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="en_attente">⏳ En attente</option>
                <option value="approuve">✅ Approuvé</option>
                <option value="rejete">❌ Rejeté</option>
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-foreground">Message / Notes</label>
            <textarea rows={2} value={editForm.message} onChange={e => setEditForm(p => ({ ...p, message: e.target.value }))}
              className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
          </div>
          <div className="flex gap-3 pt-2 border-t border-border">
            <button onClick={handleEdit}
              className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors">
              💾 Enregistrer
            </button>
            <button onClick={() => setShowEdit(false)}
              className="px-5 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors">
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* ── LISTE ───────────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          <p className="text-sm">Aucune demande dans cette catégorie</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(req => {
            const cfg = STATUT_CFG[req.statut] ?? { label: req.statut, cls: "bg-muted text-muted-foreground border-border", icon: "?" }
            return (
              <div key={req.id} className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-3">

                {/* Top row */}
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${req.type === "client" ? "bg-blue-50" : "bg-amber-50"}`}>
                      <svg className={`w-5 h-5 ${req.type === "client" ? "text-blue-600" : "text-amber-600"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        {req.type === "client"
                          ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        }
                      </svg>
                    </div>
                    <div>
                      <p className="font-bold text-foreground text-sm">{req.nom}</p>
                      <p className="text-xs text-muted-foreground">{req.societe}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(req.createdAt).toLocaleDateString("fr-MA", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${cfg.cls}`}>{cfg.icon} {cfg.label}</span>
                    <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${req.type === "client" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}>
                      {req.sous_type
                        ? ({ chr: "CHR", marchand: "Marchand", particulier: "Particulier", fournisseur: "Fournisseur", client: "Client" }[String(req.sous_type)] ?? String(req.sous_type))
                        : (req.type === "client" ? "Client" : "Fournisseur")
                      }
                    </span>
                  </div>
                </div>

                {/* Details */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  {[
                    { label: "Email",     value: req.email },
                    { label: "Téléphone", value: req.telephone },
                    { label: "Ville",     value: req.ville },
                    { label: "ICE",       value: req.ice },
                  ].filter(r => r.value).map(r => (
                    <div key={r.label} className="bg-muted/50 rounded-xl px-3 py-2">
                      <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">{r.label}</p>
                      <p className="text-foreground font-semibold mt-0.5 break-all">{r.value}</p>
                    </div>
                  ))}
                </div>

                {req.message && (
                  <div className="bg-muted/40 rounded-xl px-3 py-2 text-xs text-foreground italic">
                    {req.message}
                  </div>
                )}

                {req.rejectReason && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
                    <strong>Motif rejet :</strong> {req.rejectReason}
                  </div>
                )}

                {/* ── Actions ────────────────────────────────────────────── */}
                <div className="flex gap-2 pt-2 border-t border-border flex-wrap">

                  {/* Approuver — disponible si pas encore approuvé */}
                  {req.statut !== "approuve" && (
                    <button onClick={() => openApprove(req)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-600 text-white text-xs font-semibold hover:bg-green-700 transition-colors">
                      ✅ Approuver
                    </button>
                  )}

                  {/* Rejeter — disponible si pas encore rejeté */}
                  {req.statut !== "rejete" && (
                    <button onClick={() => openReject(req)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-300 text-red-600 text-xs font-semibold hover:bg-red-50 transition-colors">
                      ❌ Rejeter
                    </button>
                  )}

                  {/* Remettre en attente */}
                  {req.statut !== "en_attente" && (
                    <button onClick={() => handleChangeStatut(req, "en_attente")}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-300 text-amber-700 text-xs font-semibold hover:bg-amber-50 transition-colors">
                      ⏳ En attente
                    </button>
                  )}

                  {/* Modifier */}
                  <button onClick={() => openEdit(req)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-blue-300 text-blue-700 text-xs font-semibold hover:bg-blue-50 transition-colors">
                    ✏️ Modifier
                  </button>

                  {/* Supprimer */}
                  <button onClick={() => handleDelete(req)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-semibold hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-colors ml-auto">
                    🗑️ Supprimer
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
