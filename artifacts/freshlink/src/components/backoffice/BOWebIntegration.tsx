"use client"

import { useState, useEffect } from "react"
import { store, type User, type WebIntegrationConfig } from "@/lib/store"
import { hasPermission } from "@/lib/permissions"
import { logAction } from "@/lib/auditLog"

interface Props { user: User }

function canAccess(u: User) {
  return ["super_super_admin", "super_admin", "admin"].includes(u.role)
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
      {copied
        ? <><svg className="w-3 h-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> Copié</>
        : <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg> Copier</>
      }
    </button>
  )
}

type Tab = "config" | "endpoints" | "snippet" | "architecture"

export default function BOWebIntegration({ user }: Props) {
  const [cfg, setCfg] = useState<WebIntegrationConfig | null>(null)
  const [tab, setTab] = useState<Tab>("config")
  const [newOrigin, setNewOrigin] = useState("")
  const [saved, setSaved] = useState(false)
  const [liveTestResult, setLiveTestResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [liveTestRunning, setLiveTestRunning] = useState(false)

  useEffect(() => { setCfg((store as any).getWebIntegrationConfig()) }, [])

  if (!canAccess(user)) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center">
          <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
        </div>
        <p className="text-lg font-bold text-foreground">Accès restreint — Admins uniquement</p>
      </div>
    )
  }

  if (!cfg) return null

  const patch = (updates: Partial<WebIntegrationConfig>) => setCfg(c => c ? { ...c, ...updates } : c)

  const handleSave = () => {
    if (!cfg) return
    if (!hasPermission(user.role, "modifier_api_config")) { logAction(user, "modifier_api_config", "denied"); return }
    logAction(user, "modifier_api_config", "success")
    const updated = { ...cfg, updatedAt: new Date().toISOString(), updatedBy: user.id }
    ;(store as any).saveWebIntegrationConfig(updated)
    fetch(`${BASE}/api/ext/web-integration-config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    }).catch(() => {})
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const handleGenerateKey = () => {
    if (!window.confirm("Générer une nouvelle clé API ? L'ancienne clé sera invalidée immédiatement.")) return
    patch({ apiKey: (store as any).generateApiKey() })
  }

  const addOrigin = () => {
    if (!newOrigin.trim()) return
    const url = newOrigin.trim().replace(/\/$/, "")
    if (!cfg.allowedOrigins.includes(url)) patch({ allowedOrigins: [...cfg.allowedOrigins, url] })
    setNewOrigin("")
  }

  const removeOrigin = (o: string) => patch({ allowedOrigins: cfg.allowedOrigins.filter(x => x !== o) })

  const runLiveTest = async () => {
    setLiveTestRunning(true)
    setLiveTestResult(null)
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (cfg.apiKey) headers["X-Api-Key"] = cfg.apiKey
      const res = await fetch(`${BASE}/api/ext/catalogue`, { headers })
      if (res.ok) {
        const data = await res.json()
        const count = Array.isArray(data) ? data.length : "?"
        setLiveTestResult({ ok: true, text: `Connexion OK (${count} articles)` })
      } else {
        setLiveTestResult({ ok: false, text: `Erreur ${res.status}: ${res.statusText}` })
      }
    } catch (err: any) {
      setLiveTestResult({ ok: false, text: `Erreur: ${err?.message ?? "Connexion impossible"}` })
    } finally {
      setLiveTestRunning(false)
    }
  }

  const BASE = typeof window !== "undefined" ? window.location.origin : "https://votre-erp.vercel.app"

  const ENDPOINTS = [
    {
      method: "GET",
      path: "/api/ext/catalogue",
      auth: "public (si cataloguePublic=true) ou X-Api-Key",
      desc: "Retourne la liste des articles actifs et visibles dans le catalogue.",
      response: `[{ "id": "...", "nom": "Tomate", "famille": "Légumes fruits", "prixVente": 4.5, "unite": "kg", "stock": 120, "photo": "..." }]`,
    },
    {
      method: "POST",
      path: "/api/ext/commandes",
      auth: "X-Api-Key requis + clientId",
      desc: "Crée une nouvelle commande depuis votre site web.",
      body: `{ "clientId": "...", "lignes": [{ "articleId": "...", "quantite": 10 }], "dateLivraison": "2025-06-01", "notes": "..." }`,
      response: `{ "id": "...", "statut": "en_attente", "total": 45.00 }`,
    },
    {
      method: "POST",
      path: "/api/ext/demande-compte",
      auth: "public (si demandesComptes=true)",
      desc: "Soumet une demande de création de compte client ou fournisseur.",
      body: `{ "type": "client", "nom": "...", "email": "...", "telephone": "...", "societe": "...", "ville": "..." }`,
      response: `{ "id": "...", "statut": "en_attente" }`,
    },
    {
      method: "GET",
      path: "/api/ext/commandes/:clientId",
      auth: "X-Api-Key requis",
      desc: "Liste les commandes d'un client.",
      response: `[{ "id": "...", "date": "...", "statut": "livre", "total": 120 }]`,
    },
    {
      method: "GET",
      path: "/api/ext/mon-compte",
      auth: "Bearer token",
      desc: "Retourne le profil du client authentifié ainsi que ses commandes récentes.",
      response: `{ "client": { "id": "...", "nom": "...", "email": "...", "telephone": "..." }, "commandes": [{ "id": "...", "date": "...", "statut": "...", "total": 0 }] }`,
    },
    {
      method: "POST",
      path: "/api/ext/auth",
      auth: "public",
      desc: "Authentifie un client par téléphone+mot de passe ou email+mot de passe. Retourne un token Bearer.",
      body: `{ "phone": "0600000000", "password": "..." }\n// ou\n{ "email": "client@exemple.ma", "password": "..." }`,
      response: `{ "token": "eyJ...", "user": { "id": "...", "nom": "...", "email": "..." } }`,
    },
    {
      method: "GET",
      path: "/api/ext/demande-acces",
      auth: "X-Api-Key",
      desc: "Liste les demandes de création de compte en attente de validation.",
      response: `[{ "id": "...", "type": "client", "nom": "...", "email": "...", "statut": "en_attente", "createdAt": "..." }]`,
    },
  ]

  const METHOD_CLS: Record<string, string> = {
    GET:  "bg-blue-100 text-blue-700",
    POST: "bg-green-100 text-green-700",
    PUT:  "bg-amber-100 text-amber-700",
  }

  const SNIPPET_JS = `// ── FreshLink ERP — Intégration site web ──────────────────────────
const ERP_URL  = "${BASE}"
const ERP_KEY  = "${cfg.apiKey || "VOTRE_CLE_API"}"
const HEADERS  = { "Content-Type": "application/json", "X-Api-Key": ERP_KEY }

// 1. Charger le catalogue
async function getCatalogue() {
  const res = await fetch(\`\${ERP_URL}/api/ext/catalogue\`, { headers: HEADERS })
  return res.json()   // → Article[]
}

// 2. Passer une commande
async function passerCommande(clientId, lignes, dateLivraison) {
  const res = await fetch(\`\${ERP_URL}/api/ext/commandes\`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ clientId, lignes, dateLivraison }),
  })
  return res.json()   // → { id, statut, total }
}

// 3. Demande de création de compte
async function demanderCompte(data) {
  // data: { type, nom, email, telephone, societe, ville }
  const res = await fetch(\`\${ERP_URL}/api/ext/demande-compte\`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  return res.json()   // → { id, statut: "en_attente" }
}
`

  const SNIPPET_PHP = `<?php
// ── FreshLink ERP — Intégration PHP ───────────────────────────────
define('ERP_URL', '${BASE}');
define('ERP_KEY', '${cfg.apiKey || "VOTRE_CLE_API"}');

function erp_request(string $method, string $path, array $body = []): array {
    $ch = curl_init(ERP_URL . $path);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json', 'X-Api-Key: ' . ERP_KEY],
        CURLOPT_POSTFIELDS     => $method !== 'GET' ? json_encode($body) : null,
    ]);
    $result = curl_exec($ch);
    curl_close($ch);
    return json_decode($result, true) ?? [];
}

// Catalogue
$catalogue = erp_request('GET', '/api/ext/catalogue');

// Passer commande
$cmd = erp_request('POST', '/api/ext/commandes', [
    'clientId' => 'clt_xxx',
    'lignes' => [['articleId' => 'art_xxx', 'quantite' => 5]],
    'dateLivraison' => date('Y-m-d', strtotime('+1 day')),
]);
?>
`

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            Intégration Site Web
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Connectez votre site ou boutique en ligne à l'ERP via l'API sécurisée.</p>
        </div>
        <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold ${cfg.enabled ? "bg-green-50 border-green-300 text-green-700" : "bg-slate-100 border-slate-300 text-slate-500"}`}>
          <div className={`w-2 h-2 rounded-full ${cfg.enabled ? "bg-green-500" : "bg-slate-400"}`} />
          {cfg.enabled ? "API Activée" : "API Désactivée"}
        </div>
      </div>

      {/* Saved banner */}
      {saved && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-green-800 text-sm font-semibold">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          Configuration sauvegardée.
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted w-fit">
        {([
          { id: "config" as Tab, label: "Configuration", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
          { id: "endpoints" as Tab, label: "Endpoints API", icon: "M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
          { id: "snippet" as Tab, label: "Code Exemple", icon: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" },
          { id: "architecture" as Tab, label: "Architecture", icon: "M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" },
        ]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${tab === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={t.icon} /></svg>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: CONFIG ─────────────────────────────────────────────── */}
      {tab === "config" && (
        <div className="flex flex-col gap-5">
          {/* Master switch */}
          <div className="bg-card rounded-2xl border border-border p-5 flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-foreground">Activer l'API externe</p>
              <p className="text-xs text-muted-foreground mt-0.5">Permet à votre site web d'interroger l'ERP via les endpoints REST.</p>
            </div>
            <button onClick={() => patch({ enabled: !cfg.enabled })}
              className={`relative w-12 h-6 rounded-full transition-colors ${cfg.enabled ? "bg-green-500" : "bg-slate-300"}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${cfg.enabled ? "translate-x-6" : ""}`} />
            </button>
          </div>

          {/* API Key */}
          <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-3">
            <p className="font-semibold text-foreground">Clé API secrète</p>
            <p className="text-xs text-muted-foreground">Transmettez cette clé à votre développeur. Ne la partagez jamais publiquement.</p>
            <div className="flex gap-2 flex-wrap">
              <div className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-muted border border-border font-mono text-xs text-foreground break-all">
                {cfg.apiKey || <span className="text-muted-foreground italic">Aucune clé générée</span>}
              </div>
              {cfg.apiKey && <CopyBtn text={cfg.apiKey} />}
            </div>
            <button onClick={handleGenerateKey}
              className="self-start flex items-center gap-2 px-4 py-2 rounded-xl border border-amber-300 text-amber-700 bg-amber-50 text-xs font-semibold hover:bg-amber-100 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              {cfg.apiKey ? "Régénérer la clé" : "Générer une clé"}
            </button>
          </div>

          {/* Allowed origins */}
          <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-3">
            <div>
              <p className="font-semibold text-foreground">Origines autorisées (CORS)</p>
              <p className="text-xs text-muted-foreground mt-0.5">Domaines de votre site web autorisés à appeler l'API (ex: https://monsite.ma).</p>
            </div>
            <div className="flex gap-2">
              <input value={newOrigin} onChange={e => setNewOrigin(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addOrigin()}
                placeholder="https://monsite.ma"
                className="flex-1 px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              <button onClick={addOrigin} className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors">
                Ajouter
              </button>
            </div>
            {cfg.allowedOrigins.length === 0
              ? <p className="text-xs text-muted-foreground italic">Aucune origine configurée — toutes refusées par défaut.</p>
              : (
                <div className="flex flex-wrap gap-2">
                  {cfg.allowedOrigins.map(o => (
                    <div key={o} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted border border-border text-xs font-mono text-foreground">
                      {o}
                      <button onClick={() => removeOrigin(o)} className="text-muted-foreground hover:text-red-600 transition-colors ml-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )
            }
          </div>

          {/* Permissions */}
          <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-3">
            <p className="font-semibold text-foreground">Fonctionnalités exposées</p>
            {[
              { key: "cataloguePublic" as const, label: "Catalogue public", desc: "Le catalogue peut être consulté sans clé API (vitrine)." },
              { key: "commandesPubliques" as const, label: "Commandes via API", desc: "Accepter des commandes créées depuis le site web." },
              { key: "demandesComptes" as const, label: "Demandes de compte", desc: "Recevoir des demandes de création de compte depuis le site." },
            ].map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between gap-4 py-2 border-b border-border last:border-0">
                <div>
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
                <button onClick={() => patch({ [key]: !cfg[key] })}
                  className={`relative shrink-0 w-10 h-5 rounded-full transition-colors ${cfg[key] ? "bg-green-500" : "bg-slate-300"}`}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${cfg[key] ? "translate-x-5" : ""}`} />
                </button>
              </div>
            ))}
          </div>

          {/* Webhook */}
          <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-3">
            <div>
              <p className="font-semibold text-foreground">Webhook (optionnel)</p>
              <p className="text-xs text-muted-foreground mt-0.5">URL à notifier lors d'événements (nouvelle commande, nouvelle demande de compte…).</p>
            </div>
            <input value={cfg.webhookUrl ?? ""} onChange={e => patch({ webhookUrl: e.target.value })}
              placeholder="https://monsite.ma/api/webhook-erp"
              className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button onClick={handleSave}
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              Sauvegarder la configuration
            </button>
            <button onClick={runLiveTest} disabled={liveTestRunning}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold border border-primary text-primary bg-primary/5 hover:bg-primary/10 transition-colors disabled:opacity-60">
              {liveTestRunning
                ? <><svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> Test en cours…</>
                : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg> Test rapide</>
              }
            </button>
          </div>
          {liveTestResult && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-semibold ${liveTestResult.ok ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
              {liveTestResult.ok ? "✅" : "❌"} {liveTestResult.text}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: ENDPOINTS ──────────────────────────────────────────── */}
      {tab === "endpoints" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-xs">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            URL de base : <span className="font-mono font-bold ml-1">{BASE}</span>
            <CopyBtn text={BASE} />
          </div>

          {ENDPOINTS.map((ep, i) => (
            <div key={i} className="bg-card rounded-2xl border border-border overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-3 bg-muted/40 border-b border-border">
                <span className={`px-2.5 py-1 rounded-lg text-xs font-black ${METHOD_CLS[ep.method] ?? "bg-slate-100 text-slate-700"}`}>{ep.method}</span>
                <code className="font-mono text-sm text-foreground font-bold">{ep.path}</code>
                <CopyBtn text={`${BASE}${ep.path}`} />
              </div>
              <div className="px-5 py-4 flex flex-col gap-3">
                <p className="text-sm text-foreground">{ep.desc}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                  <span><strong>Auth :</strong> {ep.auth}</span>
                </div>
                {ep.body && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Body (JSON)</p>
                    <pre className="px-3 py-2.5 rounded-xl bg-muted font-mono text-xs text-foreground overflow-x-auto whitespace-pre-wrap">{ep.body}</pre>
                  </div>
                )}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Réponse</p>
                  <pre className="px-3 py-2.5 rounded-xl bg-muted font-mono text-xs text-foreground overflow-x-auto whitespace-pre-wrap">{ep.response}</pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── TAB: CODE SNIPPETS ──────────────────────────────────────── */}
      {tab === "snippet" && (
        <div className="flex flex-col gap-5">
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 bg-muted/40 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-yellow-100 text-yellow-700 text-xs font-black">JS / TS</span>
                <span className="text-sm font-semibold text-foreground">JavaScript / TypeScript</span>
              </div>
              <CopyBtn text={SNIPPET_JS} />
            </div>
            <pre className="px-5 py-4 font-mono text-xs text-foreground overflow-x-auto whitespace-pre leading-relaxed bg-[#1a1a2e] text-green-300">{SNIPPET_JS}</pre>
          </div>

          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 bg-muted/40 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-violet-100 text-violet-700 text-xs font-black">PHP</span>
                <span className="text-sm font-semibold text-foreground">PHP (cURL)</span>
              </div>
              <CopyBtn text={SNIPPET_PHP} />
            </div>
            <pre className="px-5 py-4 font-mono text-xs text-foreground overflow-x-auto whitespace-pre leading-relaxed bg-[#1a1a2e] text-blue-200">{SNIPPET_PHP}</pre>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 text-sm text-amber-800">
            <svg className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            <span>Ne stockez jamais la clé API dans du code JavaScript côté client (navigateur). Utilisez un backend (Node.js, PHP, etc.) comme proxy pour sécuriser vos appels.</span>
          </div>
        </div>
      )}

      {/* ── TAB: ARCHITECTURE ───────────────────────────────────────── */}
      {tab === "architecture" && (
        <div className="flex flex-col gap-6">
          {/* Data flow diagram */}
          <div className="bg-card rounded-2xl border border-border p-6 flex flex-col gap-4">
            <p className="font-semibold text-foreground">Flux de données</p>
            <p className="text-xs text-muted-foreground">Visualisation du chemin d'une requête depuis votre site web jusqu'à la base de données.</p>
            <div className="flex flex-wrap items-center justify-center gap-2 py-4">
              {/* Node: Site Web */}
              <div className="flex flex-col items-center gap-1.5">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" /></svg>
                </div>
                <div className="px-4 py-2.5 rounded-xl border-2 border-blue-300 bg-blue-50 text-center min-w-[90px]">
                  <p className="text-xs font-bold text-blue-700">Site Web</p>
                  <p className="text-[10px] text-blue-500 mt-0.5">Votre frontend</p>
                </div>
              </div>
              {/* Arrow */}
              <div className="flex flex-col items-center gap-0.5 px-1">
                <p className="text-[10px] text-muted-foreground font-mono">HTTPS</p>
                <div className="flex items-center gap-0.5">
                  <div className="h-0.5 w-8 bg-slate-300 rounded" />
                  <svg className="w-3 h-3 text-slate-400" fill="currentColor" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
                </div>
                <p className="text-[10px] text-muted-foreground font-mono">X-Api-Key</p>
              </div>
              {/* Node: API REST */}
              <div className="flex flex-col items-center gap-1.5">
                <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                </div>
                <div className="px-4 py-2.5 rounded-xl border-2 border-violet-300 bg-violet-50 text-center min-w-[90px]">
                  <p className="text-xs font-bold text-violet-700">API REST</p>
                  <p className="text-[10px] text-violet-500 mt-0.5">/api/ext/*</p>
                </div>
              </div>
              {/* Arrow */}
              <div className="flex flex-col items-center gap-0.5 px-1">
                <p className="text-[10px] text-muted-foreground font-mono">interne</p>
                <div className="flex items-center gap-0.5">
                  <div className="h-0.5 w-8 bg-slate-300 rounded" />
                  <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" /></svg>
                </div>
                <p className="text-[10px] text-muted-foreground font-mono">logique</p>
              </div>
              {/* Node: ERP FreshLink */}
              <div className="flex flex-col items-center gap-1.5">
                <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                </div>
                <div className="px-4 py-2.5 rounded-xl border-2 border-green-300 bg-green-50 text-center min-w-[90px]">
                  <p className="text-xs font-bold text-green-700">ERP FreshLink</p>
                  <p className="text-[10px] text-green-500 mt-0.5">Next.js App</p>
                </div>
              </div>
              {/* Arrow */}
              <div className="flex flex-col items-center gap-0.5 px-1">
                <p className="text-[10px] text-muted-foreground font-mono">queries</p>
                <div className="flex items-center gap-0.5">
                  <div className="h-0.5 w-8 bg-slate-300 rounded" />
                  <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" /></svg>
                </div>
                <p className="text-[10px] text-muted-foreground font-mono">SQL / RLS</p>
              </div>
              {/* Node: Supabase */}
              <div className="flex flex-col items-center gap-1.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>
                </div>
                <div className="px-4 py-2.5 rounded-xl border-2 border-emerald-300 bg-emerald-50 text-center min-w-[90px]">
                  <p className="text-xs font-bold text-emerald-700">Supabase</p>
                  <p className="text-[10px] text-emerald-500 mt-0.5">PostgreSQL</p>
                </div>
              </div>
            </div>
          </div>

          {/* Setup guide */}
          <div className="bg-card rounded-2xl border border-border p-6 flex flex-col gap-4">
            <p className="font-semibold text-foreground">Guide de mise en place</p>
            <div className="flex flex-col gap-3">
              {[
                { step: 1, label: "Activer l'API dans Configuration", detail: "Activez le toggle \"Activer l'API externe\" dans l'onglet Configuration." },
                { step: 2, label: "Générer une clé API secrète", detail: "Cliquez sur \"Générer une clé\" et transmettez-la à votre développeur de façon sécurisée." },
                { step: 3, label: "Ajouter votre domaine dans CORS", detail: "Ajoutez l'URL de votre site (ex: https://monsite.ma) dans la liste des origines autorisées." },
                { step: 4, label: "Activer les fonctionnalités souhaitées", detail: "Activez catalogue, commandes et/ou demandes de compte selon vos besoins." },
                { step: 5, label: "Copier le code depuis \"Code Exemple\"", detail: "Copiez le snippet JavaScript ou PHP et intégrez-le dans votre backend." },
                { step: 6, label: "Tester avec le bouton \"Tester la connexion\"", detail: "Utilisez le test en direct ci-dessous (ou le Test rapide dans Configuration) pour vérifier que tout fonctionne." },
              ].map(({ step, label, detail }) => (
                <div key={step} className="flex items-start gap-4 p-3 rounded-xl hover:bg-muted/50 transition-colors">
                  <div className="shrink-0 w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center text-xs font-black">
                    {step}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Live connection test */}
          <div className="bg-card rounded-2xl border border-border p-6 flex flex-col gap-4">
            <div>
              <p className="font-semibold text-foreground">Tester la connexion en direct</p>
              <p className="text-xs text-muted-foreground mt-0.5">Envoie une requête GET /api/ext/catalogue avec votre clé API actuelle pour vérifier que l'intégration fonctionne.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted border border-border font-mono text-xs text-muted-foreground">
                <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-black text-[10px]">GET</span>
                {BASE}/api/ext/catalogue
              </div>
              <button onClick={runLiveTest} disabled={liveTestRunning}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 transition-colors disabled:opacity-60">
                {liveTestRunning
                  ? <><svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> Test en cours…</>
                  : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg> Tester la connexion</>
                }
              </button>
            </div>
            {liveTestResult && (
              <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-semibold ${liveTestResult.ok ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
                {liveTestResult.ok ? "✅" : "❌"} {liveTestResult.text}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
