"use client"

import { useState } from "react"
import { createUser } from "@/lib/auth/supabaseAuth"
import type { User } from "@/lib/store"
import { ROLE_LABELS, type UserRole } from "@/lib/store"

interface CreateUserForm {
  email: string
  password: string
  name: string
  role: UserRole
}

export default function BOUserManagement() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [form, setForm] = useState<CreateUserForm>({
    email: "",
    password: "",
    name: "",
    role: "prevendeur",
  })

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      // Validation
      if (!form.email || !form.password || !form.name) {
        setError("Tous les champs sont obligatoires")
        setLoading(false)
        return
      }

      if (form.password.length < 8) {
        setError("Le mot de passe doit avoir au moins 8 caractères")
        setLoading(false)
        return
      }

      if (!form.email.includes("@")) {
        setError("Email invalide")
        setLoading(false)
        return
      }

      // Créer l'utilisateur
      const result = await createUser(form.email, form.password, {
        name: form.name,
        role: form.role,
        actif: true,
      })

      if (result.error) {
        setError(result.error)
        setLoading(false)
        return
      }

      setSuccess(`✅ Utilisateur ${form.name} créé avec succès !`)

      // Reset le formulaire
      setForm({
        email: "",
        password: "",
        name: "",
        role: "prevendeur",
      })

      // Effacer le message après 3 secondes
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la création")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* Titre */}
      <div>
        <h1 className="text-3xl font-bold">👥 Gestion des utilisateurs</h1>
        <p className="text-slate-600 mt-1">Créer de nouveaux comptes pour votre équipe</p>
      </div>

      {/* Formulaire de création */}
      <div className="bg-white rounded-lg border border-slate-200 p-8 shadow-sm">
        <h2 className="text-xl font-bold mb-6">➕ Créer un nouvel utilisateur</h2>

        <form onSubmit={handleCreateUser} className="space-y-4">
          {/* Messages */}
          {error && (
            <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              🔴 {error}
            </div>
          )}
          {success && (
            <div className="p-4 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
              {success}
            </div>
          )}

          {/* Champs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Nom */}
            <input
              type="text"
              placeholder="Nom complet"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            />

            {/* Email */}
            <input
              type="email"
              placeholder="Email (ex: mustapha@freshlink.ma)"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            />

            {/* Mot de passe */}
            <input
              type="password"
              placeholder="Mot de passe (min 8 caractères)"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            />

            {/* Rôle */}
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            >
              {Object.entries(ROLE_LABELS).map(([role, label]) => (
                <option key={role} value={role}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Bouton */}
          <button
            type="submit"
            disabled={loading}
            className="w-full px-6 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "⏳ Création en cours..." : "✅ Créer l'utilisateur"}
          </button>
        </form>

        {/* Conseils */}
        <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200 text-sm space-y-2">
          <p className="font-bold text-blue-900">💡 Conseils :</p>
          <ul className="text-blue-800 space-y-1 list-disc list-inside">
            <li>Le mot de passe doit avoir au moins 8 caractères</li>
            <li>Utilisez l'email réel de la personne</li>
            <li>Le rôle détermine ce que l'utilisateur peut voir/faire</li>
            <li>L'utilisateur recevra un email de confirmation</li>
          </ul>
        </div>
      </div>

      {/* Guide des rôles */}
      <div className="bg-slate-50 rounded-lg border border-slate-200 p-8">
        <h2 className="text-xl font-bold mb-4">📋 Guide des rôles</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="border-l-4 border-blue-500 pl-4">
              <h3 className="font-bold">super_admin / admin</h3>
              <p className="text-sm text-slate-600">Accès complet à tout. Création d'utilisateurs, configuration, etc.</p>
            </div>

            <div className="border-l-4 border-green-500 pl-4">
              <h3 className="font-bold">resp_commercial</h3>
              <p className="text-sm text-slate-600">Gère les commandes, clients, caisse, rapports.</p>
            </div>

            <div className="border-l-4 border-purple-500 pl-4">
              <h3 className="font-bold">prevendeur</h3>
              <p className="text-sm text-slate-600">Crée les commandes, suivi clients sur le terrain.</p>
            </div>

            <div className="border-l-4 border-orange-500 pl-4">
              <h3 className="font-bold">resp_logistique</h3>
              <p className="text-sm text-slate-600">Gère stock, réception, livraisons, trips.</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="border-l-4 border-indigo-500 pl-4">
              <h3 className="font-bold">magasinier</h3>
              <p className="text-sm text-slate-600">Gère l'inventaire en entrepôt.</p>
            </div>

            <div className="border-l-4 border-red-500 pl-4">
              <h3 className="font-bold">acheteur</h3>
              <p className="text-sm text-slate-600">Crée les commandes d'achat, gère les fournisseurs.</p>
            </div>

            <div className="border-l-4 border-yellow-500 pl-4">
              <h3 className="font-bold">livreur</h3>
              <p className="text-sm text-slate-600">Effectue les livraisons, confirme les bons.</p>
            </div>

            <div className="border-l-4 border-cyan-500 pl-4">
              <h3 className="font-bold">financier / cash_man</h3>
              <p className="text-sm text-slate-600">Gère la caisse, les paiements, la trésorerie.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
