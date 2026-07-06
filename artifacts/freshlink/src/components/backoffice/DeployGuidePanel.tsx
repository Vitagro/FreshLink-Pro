"use client"

import { useState } from "react"

// ─── Icons ────────────────────────────────────────────────────────────────────
function CopyIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  )
}
function CheckIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  )
}
function ExternalIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  )
}

// ─── Code block ───────────────────────────────────────────────────────────────
function Code({ code, lang = "bash" }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="rounded-xl overflow-hidden border border-slate-200 mt-2 mb-1">
      <div className="flex items-center justify-between px-4 py-1.5 bg-slate-100 border-b border-slate-200">
        <span className="text-[10px] font-mono font-semibold text-slate-400 uppercase">{lang}</span>
        <button
          onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${copied ? "text-green-700 bg-green-100" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200"}`}
        >
          {copied ? <><CheckIcon /> Copie !</> : <><CopyIcon /> Copier</>}
        </button>
      </div>
      <pre className="px-4 py-3 text-xs font-mono overflow-x-auto leading-relaxed bg-slate-800 text-slate-100">
        <code>{code}</code>
      </pre>
    </div>
  )
}

// ─── Step header ──────────────────────────────────────────────────────────────
function StepHeader({ n, title, sub, color = "blue" }: { n: number; title: string; sub: string; color?: "blue"|"green"|"purple"|"amber"|"emerald" }) {
  const colors = {
    blue:    { bg: "bg-blue-600",    text: "text-blue-800",   light: "bg-blue-50",   border: "border-blue-200" },
    green:   { bg: "bg-green-600",   text: "text-green-800",  light: "bg-green-50",  border: "border-green-200" },
    purple:  { bg: "bg-violet-600",  text: "text-violet-800", light: "bg-violet-50", border: "border-violet-200" },
    amber:   { bg: "bg-amber-500",   text: "text-amber-800",  light: "bg-amber-50",  border: "border-amber-200" },
    emerald: { bg: "bg-emerald-600", text: "text-emerald-800",light: "bg-emerald-50",border: "border-emerald-200" },
  }
  const c = colors[color]
  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl border ${c.light} ${c.border} mb-3`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black text-white shrink-0 ${c.bg}`}>{n}</div>
      <div>
        <p className={`text-sm font-black ${c.text}`}>{title}</p>
        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{sub}</p>
      </div>
    </div>
  )
}

// ─── Info box ─────────────────────────────────────────────────────────────────
function Info({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-xs leading-relaxed mb-3">
      <svg className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>{children}</span>
    </div>
  )
}

// ─── Warn box ─────────────────────────────────────────────────────────────────
function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs leading-relaxed mb-3">
      <svg className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>{children}</span>
    </div>
  )
}

// ─── Section title ────────────────────────────────────────────────────────────
function Section({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mt-6 mb-3">
      <div className="w-6 h-6 rounded-lg bg-slate-800 flex items-center justify-center text-white shrink-0">{icon}</div>
      <h3 className="text-sm font-black text-slate-800">{title}</h3>
      <div className="flex-1 h-px bg-slate-200" />
    </div>
  )
}

// ─── Link button ──────────────────────────────────────────────────────────────
function LinkBtn({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-white hover:bg-slate-700 transition-colors">
      {label} <ExternalIcon />
    </a>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────
const CHAPTERS = [
  "Introduction",
  "Supabase",
  "Vercel",
  "Variables ENV",
  "SQL",
  "Depannage",
]

export default function DeployGuidePanel() {
  const [chapter, setChapter] = useState(0)
  const [stepsDone, setStepsDone] = useState<Set<string>>(new Set())

  const toggle = (id: string) => setStepsDone(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const done = (id: string) => stepsDone.has(id)

  return (
    <div className="flex flex-col lg:flex-row gap-0 bg-slate-50" style={{ minHeight: "calc(100vh - 120px)" }}>

      {/* ── Chapter sidebar ───────────────────────────────────── */}
      <aside className="lg:w-52 shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 p-3 flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-x-visible">
        <div className="hidden lg:flex items-center gap-2 px-3 py-2 mb-2">
          <div className="w-6 h-6 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <p className="text-xs font-black text-slate-800">Guide Deploiement</p>
        </div>
        {CHAPTERS.map((ch, i) => (
          <button key={i} onClick={() => setChapter(i)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap lg:w-full ${chapter === i ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${chapter === i ? "bg-white/20" : "bg-slate-200 text-slate-500"}`}>{i + 1}</span>
            {ch}
          </button>
        ))}
        <div className="hidden lg:block mt-auto px-3 pt-4">
          <p className="text-[10px] text-slate-400 leading-relaxed">
            <span className="font-bold text-emerald-600">FRESH</span>
            <span className="font-bold text-slate-700">LINK</span> PRO
            <br />Guide de connexion
            <br />Supabase + Vercel
          </p>
        </div>
      </aside>

      {/* ── Content ───────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-4 lg:p-6 pb-16">

          {/* ── 0. Introduction ── */}
          {chapter === 0 && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-800">Guide de connexion — de A a Z</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Pour debutants — Supabase + Vercel en 6 etapes</p>
                </div>
              </div>

              <Info>
                Ce guide vous explique comment connecter votre application FreshLink Pro a une vraie base de donnees (Supabase)
                et la deployer en ligne (Vercel). Vous n&apos;avez pas besoin de coder. Suivez les etapes dans l&apos;ordre.
              </Info>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                {[
                  { n:1, t:"Creer un compte Supabase",    icon:"🗄️", color:"bg-emerald-600" },
                  { n:2, t:"Configurer votre projet",      icon:"⚙️", color:"bg-blue-600" },
                  { n:3, t:"Connecter Vercel",             icon:"▲",  color:"bg-slate-800" },
                  { n:4, t:"Ajouter les variables ENV",    icon:"🔑", color:"bg-amber-500" },
                  { n:5, t:"Executer le SQL",              icon:"📊", color:"bg-violet-600" },
                  { n:6, t:"Tester + depanner",            icon:"✓",  color:"bg-green-600" },
                ].map(s => (
                  <div key={s.n} className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black text-white shrink-0 ${s.color}`}>{s.n}</div>
                    <p className="text-xs font-semibold text-slate-700">{s.t}</p>
                  </div>
                ))}
              </div>

              <div className="p-4 rounded-xl bg-slate-800 text-slate-200 text-xs leading-relaxed mb-4">
                <p className="font-black text-white mb-2">Vos identifiants FreshLink Pro</p>
                <p className="mb-1"><span className="text-slate-400">URL Supabase :</span><br/>
                  <span className="font-mono text-emerald-400 text-[11px] break-all">https://jwdrwapuetqoqnankgma.supabase.co</span>
                </p>
                <p className="mb-1"><span className="text-slate-400">Anon Key :</span><br/>
                  <span className="font-mono text-blue-400 text-[10px] break-all">eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ5bmJlamNpdXplZHp1cnhoc3VpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MDg0MjYsImV4cCI6MjA5MDE4NDQyNn0.vPgtRBu37SguLxpb7qs95_17U9ksX1S0tkyJSwP5wBg</span>
                </p>
                <p><span className="text-slate-400">Publishable Key :</span><br/>
                  <span className="font-mono text-purple-400 text-[11px]">sb_publishable_E9U29ypEbSzd40ZJ1AjbVw_SeK7cszs</span>
                </p>
              </div>

              <button onClick={() => setChapter(1)}
                className="w-full py-3 rounded-xl bg-slate-800 text-white text-sm font-bold hover:bg-slate-700 transition-colors flex items-center justify-center gap-2">
                Commencer le guide
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}

          {/* ── 1. Supabase ── */}
          {chapter === 1 && (
            <div>
              <h2 className="text-lg font-black text-slate-800 mb-1">Supabase — Creer votre base de donnees</h2>
              <p className="text-xs text-slate-500 mb-4">Supabase est votre base de donnees en ligne. C&apos;est gratuit pour commencer.</p>

              <StepHeader n={1} title="Creer un compte Supabase" sub="Allez sur supabase.com et creez un compte gratuit." color="emerald" />
              <div className="pl-4 mb-4">
                <div className="space-y-2">
                  {[
                    { id:"s1a", t:"Ouvrir supabase.com dans votre navigateur" },
                    { id:"s1b", t:'Cliquer sur "Start your project" (bouton vert)' },
                    { id:"s1c", t:'Choisir "Continue with GitHub" ou entrer votre email' },
                    { id:"s1d", t:"Confirmer votre email si demande" },
                  ].map(s => (
                    <button key={s.id} onClick={() => toggle(s.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-xs text-left transition-all ${done(s.id) ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"}`}>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${done(s.id) ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300"}`}>
                        {done(s.id) && <CheckIcon />}
                      </div>
                      {s.t}
                    </button>
                  ))}
                </div>
                <div className="mt-3">
                  <LinkBtn href="https://supabase.com" label="Ouvrir Supabase.com" />
                </div>
              </div>

              <StepHeader n={2} title="Creer un nouveau projet" sub="Votre projet est deja cree : jwdrwapuetqoqnankgma. Si vous avez un projet existant, voici comment en creer un nouveau." color="blue" />
              <div className="pl-4 mb-4">
                <div className="space-y-2">
                  {[
                    { id:"s2a", t:'Dans Supabase, cliquer "New Project"' },
                    { id:"s2b", t:"Choisir un nom : freshlink-pro" },
                    { id:"s2c", t:"Choisir un mot de passe pour la base de donnees (notez-le !)" },
                    { id:"s2d", t:'Choisir la region "EU West" (Frankfurt)' },
                    { id:"s2e", t:'Cliquer "Create new project" et attendre 1-2 minutes' },
                  ].map(s => (
                    <button key={s.id} onClick={() => toggle(s.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-xs text-left transition-all ${done(s.id) ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"}`}>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${done(s.id) ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300"}`}>
                        {done(s.id) && <CheckIcon />}
                      </div>
                      {s.t}
                    </button>
                  ))}
                </div>
              </div>

              <StepHeader n={3} title="Recuperer vos cles API" sub="Ces cles permettent a l'application de se connecter a votre base de donnees." color="purple" />
              <div className="pl-4 mb-4">
                <Info>Dans votre projet Supabase : allez dans <strong>Settings → API</strong></Info>
                <div className="space-y-2 mb-3">
                  {[
                    { id:"s3a", t:'Copier "Project URL" → c\'est votre NEXT_PUBLIC_SUPABASE_URL' },
                    { id:"s3b", t:'Copier "anon public" key → c\'est votre NEXT_PUBLIC_SUPABASE_ANON_KEY' },
                  ].map(s => (
                    <button key={s.id} onClick={() => toggle(s.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-xs text-left transition-all ${done(s.id) ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"}`}>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${done(s.id) ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300"}`}>
                        {done(s.id) && <CheckIcon />}
                      </div>
                      {s.t}
                    </button>
                  ))}
                </div>
                <div className="p-3 rounded-xl bg-slate-800 text-xs font-mono text-slate-100">
                  <p className="text-slate-400 mb-1">Vos cles actuelles :</p>
                  <p className="text-emerald-400 break-all text-[10px]">https://jwdrwapuetqoqnankgma.supabase.co</p>
                  <p className="text-blue-400 break-all text-[10px] mt-1">eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..._4bA9RtIVMUjNgxd2ojd9</p>
                </div>
              </div>

              <button onClick={() => setChapter(2)}
                className="w-full py-3 rounded-xl bg-slate-800 text-white text-sm font-bold hover:bg-slate-700 transition-colors flex items-center justify-center gap-2">
                Etape suivante : Vercel
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}

          {/* ── 2. Vercel ── */}
          {chapter === 2 && (
            <div>
              <h2 className="text-lg font-black text-slate-800 mb-1">Vercel — Deployer en ligne</h2>
              <p className="text-xs text-slate-500 mb-4">Vercel met votre application en ligne gratuitement. Aucune carte bancaire requise.</p>

              <StepHeader n={1} title="Creer un compte Vercel" sub="Allez sur vercel.com et connectez-vous avec GitHub." color="blue" />
              <div className="pl-4 mb-4">
                <div className="space-y-2">
                  {[
                    { id:"v1a", t:"Ouvrir vercel.com dans votre navigateur" },
                    { id:"v1b", t:'Cliquer "Sign Up" en haut a droite' },
                    { id:"v1c", t:'Choisir "Continue with GitHub" (recommande)' },
                    { id:"v1d", t:"Autoriser Vercel a acceder a votre GitHub" },
                  ].map(s => (
                    <button key={s.id} onClick={() => toggle(s.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-xs text-left transition-all ${done(s.id) ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"}`}>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${done(s.id) ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300"}`}>
                        {done(s.id) && <CheckIcon />}
                      </div>
                      {s.t}
                    </button>
                  ))}
                </div>
                <div className="mt-3">
                  <LinkBtn href="https://vercel.com" label="Ouvrir Vercel.com" />
                </div>
              </div>

              <StepHeader n={2} title="Importer votre projet GitHub" sub="Si votre code est sur GitHub, importez-le dans Vercel." color="purple" />
              <div className="pl-4 mb-4">
                <Info>Si vous n&apos;avez pas encore GitHub : dans v0.dev, cliquez sur le bouton <strong>Deploy</strong> en haut a droite — Vercel se connecte automatiquement.</Info>
                <div className="space-y-2">
                  {[
                    { id:"v2a", t:'Dans Vercel, cliquer "Add New Project"' },
                    { id:"v2b", t:'Chercher votre depot GitHub "freshlink-pro"' },
                    { id:"v2c", t:'Cliquer "Import"' },
                    { id:"v2d", t:'Ne pas encore cliquer "Deploy" — ajouter d\'abord les variables ENV' },
                  ].map(s => (
                    <button key={s.id} onClick={() => toggle(s.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-xs text-left transition-all ${done(s.id) ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"}`}>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${done(s.id) ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300"}`}>
                        {done(s.id) && <CheckIcon />}
                      </div>
                      {s.t}
                    </button>
                  ))}
                </div>
              </div>

              <StepHeader n={3} title="Activer les mises a jour automatiques" sub="Chaque push sur GitHub redeploit automatiquement." color="emerald" />
              <div className="pl-4 mb-4">
                <Info>Apres le premier deploiement, chaque modification de votre code sera automatiquement mise en ligne par Vercel. Vous n&apos;avez rien a faire manuellement.</Info>
              </div>

              <button onClick={() => setChapter(3)}
                className="w-full py-3 rounded-xl bg-slate-800 text-white text-sm font-bold hover:bg-slate-700 transition-colors flex items-center justify-center gap-2">
                Etape suivante : Variables ENV
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}

          {/* ── 3. Variables ENV ── */}
          {chapter === 3 && (
            <div>
              <h2 className="text-lg font-black text-slate-800 mb-1">Variables d&apos;environnement</h2>
              <p className="text-xs text-slate-500 mb-4">Les variables ENV permettent a votre application de savoir comment se connecter a Supabase, sans exposer vos cles dans le code.</p>

              <Warn>Ne partagez jamais vos cles API publiquement. Les variables ENV sont chiffrees par Vercel.</Warn>

              <StepHeader n={1} title="Dans Vercel — Ajouter les variables" sub="Project → Settings → Environment Variables" color="amber" />
              <div className="pl-4 mb-4">
                <p className="text-xs text-slate-600 font-semibold mb-2">Copiez-collez exactement ces variables :</p>
                <Code lang="env" code={`NEXT_PUBLIC_SUPABASE_URL=https://jwdrwapuetqoqnankgma.supabase.co\nNEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3ZHJ3YXB1ZXRxb3FuYW5rZ21hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0NDE1NzUsImV4cCI6MjA5NDAxNzU3NX0.9l0e2eE9milvCWg29TIoGXgWY-ULOmTVrPmWRCsIvtw`} />
                <Info>Selectionnez <strong>Production, Preview, Development</strong> pour les 3 environnements, puis cliquez Save.</Info>
                <div className="space-y-2 mt-3">
                  {[
                    { id:"e1a", t:"Ouvrir votre projet Vercel → Settings → Environment Variables" },
                    { id:"e1b", t:"Ajouter NEXT_PUBLIC_SUPABASE_URL avec la valeur ci-dessus" },
                    { id:"e1c", t:"Ajouter NEXT_PUBLIC_SUPABASE_ANON_KEY avec la valeur ci-dessus" },
                    { id:"e1d", t:"Cocher Production + Preview + Development" },
                    { id:"e1e", t:'Cliquer "Save"' },
                    { id:"e1f", t:"Redeclencher un deploiement : Deployments → ... → Redeploy" },
                  ].map(s => (
                    <button key={s.id} onClick={() => toggle(s.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-xs text-left transition-all ${done(s.id) ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"}`}>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${done(s.id) ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300"}`}>
                        {done(s.id) && <CheckIcon />}
                      </div>
                      {s.t}
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={() => setChapter(4)}
                className="w-full py-3 rounded-xl bg-slate-800 text-white text-sm font-bold hover:bg-slate-700 transition-colors flex items-center justify-center gap-2">
                Etape suivante : SQL
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}

          {/* ── 4. SQL ── */}
          {chapter === 4 && (
            <div>
              <h2 className="text-lg font-black text-slate-800 mb-1">Creer les tables SQL</h2>
              <p className="text-xs text-slate-500 mb-4">Les tables sont les &quot;feuilles Excel&quot; de votre base de donnees. Vous devez les creer une seule fois.</p>

              <StepHeader n={1} title="Ouvrir l'editeur SQL Supabase" sub="Dans votre projet Supabase, cliquer sur SQL Editor dans le menu gauche." color="green" />
              <div className="pl-4 mb-4">
                <div className="space-y-2">
                  {[
                    { id:"q1a", t:"Aller sur supabase.com → votre projet" },
                    { id:"q1b", t:'Cliquer "SQL Editor" dans le menu gauche' },
                    { id:"q1c", t:'Cliquer "+ New query"' },
                  ].map(s => (
                    <button key={s.id} onClick={() => toggle(s.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-xs text-left transition-all ${done(s.id) ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"}`}>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${done(s.id) ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300"}`}>
                        {done(s.id) && <CheckIcon />}
                      </div>
                      {s.t}
                    </button>
                  ))}
                </div>
              </div>

              <StepHeader n={2} title="Executer ce SQL de base" sub="Copier ce code, coller dans l'editeur SQL, puis cliquer Run." color="purple" />
              <div className="pl-4 mb-4">
                <Code lang="sql" code={`-- Activer l'extension UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table utilisateurs
CREATE TABLE IF NOT EXISTS public.fl_users (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL,
  email      TEXT UNIQUE NOT NULL,
  role       TEXT NOT NULL DEFAULT 'prevendeur',
  phone      TEXT,
  actif      BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table articles (fruits et legumes)
CREATE TABLE IF NOT EXISTS public.fl_articles (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nom         TEXT NOT NULL,
  categorie   TEXT DEFAULT 'fruit',
  unite       TEXT DEFAULT 'kg',
  stock_actif NUMERIC DEFAULT 0,
  prix_achat  NUMERIC DEFAULT 0,
  prix_vente  NUMERIC DEFAULT 0,
  actif       BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Table commandes
CREATE TABLE IF NOT EXISTS public.fl_commandes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_nom  TEXT NOT NULL,
  statut      TEXT DEFAULT 'brouillon',
  total_ht    NUMERIC DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Activer la securite par rangee (RLS)
ALTER TABLE public.fl_users     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fl_articles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fl_commandes ENABLE ROW LEVEL SECURITY;

-- Politique de lecture pour tous les utilisateurs connectes
CREATE POLICY IF NOT EXISTS "lecture_auth" ON public.fl_users
  FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'anon');
CREATE POLICY IF NOT EXISTS "lecture_auth" ON public.fl_articles
  FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "lecture_auth" ON public.fl_commandes
  FOR SELECT USING (true);

-- Donnees de test
INSERT INTO public.fl_articles (nom, categorie, stock_actif, prix_achat, prix_vente)
VALUES
  ('Tomate', 'legume', 500, 2.5, 4.0),
  ('Pomme', 'fruit', 300, 3.0, 5.5),
  ('Banane', 'fruit', 200, 4.0, 7.0),
  ('Carotte', 'legume', 400, 1.5, 3.0),
  ('Orange', 'fruit', 600, 2.0, 4.5)
ON CONFLICT DO NOTHING;`} />
                <div className="space-y-2 mt-3">
                  {[
                    { id:"q2a", t:"Copier tout le code SQL ci-dessus" },
                    { id:"q2b", t:"Coller dans l'editeur SQL Supabase" },
                    { id:"q2c", t:'Cliquer le bouton vert "Run" (ou F5)' },
                    { id:"q2d", t:'Verifier que vous voyez "Success" en bas' },
                  ].map(s => (
                    <button key={s.id} onClick={() => toggle(s.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-xs text-left transition-all ${done(s.id) ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"}`}>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${done(s.id) ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300"}`}>
                        {done(s.id) && <CheckIcon />}
                      </div>
                      {s.t}
                    </button>
                  ))}
                </div>
              </div>

              <StepHeader n={3} title="Verifier vos tables" sub="Dans Supabase, cliquer sur Table Editor pour voir vos tables." color="blue" />
              <div className="pl-4 mb-4">
                <Info>Vous devriez voir les tables : <strong>fl_users</strong>, <strong>fl_articles</strong>, <strong>fl_commandes</strong>.
                Dans fl_articles vous verrez deja 5 produits de test (tomate, pomme, banane, carotte, orange).</Info>
              </div>

              <button onClick={() => setChapter(5)}
                className="w-full py-3 rounded-xl bg-slate-800 text-white text-sm font-bold hover:bg-slate-700 transition-colors flex items-center justify-center gap-2">
                Etape suivante : Depannage
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}

          {/* ── 5. Depannage ── */}
          {chapter === 5 && (
            <div>
              <h2 className="text-lg font-black text-slate-800 mb-1">Depannage — Resoudre les problemes</h2>
              <p className="text-xs text-slate-500 mb-4">Si quelque chose ne fonctionne pas, voici les solutions les plus courantes.</p>

              {[
                {
                  q: "L'application ne se connecte pas a Supabase",
                  a: "Verifiez les variables ENV dans Vercel (Settings → Environment Variables). Assurez-vous que NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY sont correctement saisies. Apres modification, faites un Redeploy.",
                  color: "red",
                },
                {
                  q: "Erreur 'relation does not exist'",
                  a: "Les tables n'ont pas encore ete creees. Allez dans Supabase → SQL Editor et executez le script SQL de l'etape precedente.",
                  color: "amber",
                },
                {
                  q: "Les donnees ne s'affichent pas (table vide)",
                  a: "Verifiez que RLS (Row Level Security) est active avec une politique de lecture. Copiez et executez la partie CREATE POLICY du SQL ci-dessus.",
                  color: "amber",
                },
                {
                  q: "Erreur 401 ou 'JWT expired'",
                  a: "Votre Anon Key est incorrecte ou expiree. Recupérez une nouvelle cle dans Supabase → Settings → API et mettez a jour la variable ENV dans Vercel.",
                  color: "red",
                },
                {
                  q: "Le deploiement Vercel echoue (Build Error)",
                  a: "Lisez le message d'erreur dans Vercel → Deployments → cliquer sur le deploiement echoue → voir les logs. L'erreur indique exactement quel fichier pose probleme.",
                  color: "red",
                },
                {
                  q: "L'application fonctionne en demo mais pas en production",
                  a: "L'application fonctionne en mode demo local quand Supabase n'est pas connecte. Assurez-vous que les variables ENV sont bien ajoutees dans Vercel et faites un Redeploy.",
                  color: "blue",
                },
              ].map((item, i) => (
                <div key={i} className="mb-3">
                  <button onClick={() => toggle(`faq${i}`)}
                    className={`w-full flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${done(`faq${i}`) ? "bg-slate-50 border-slate-200" : "bg-white border-slate-200 hover:border-slate-300"}`}>
                    <div className={`mt-0.5 w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-white text-[10px] font-black ${item.color === "red" ? "bg-red-500" : item.color === "amber" ? "bg-amber-500" : "bg-blue-500"}`}>
                      ?
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-800">{item.q}</p>
                      {done(`faq${i}`) && <p className="text-xs text-slate-600 mt-2 leading-relaxed">{item.a}</p>}
                    </div>
                    <svg className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${done(`faq${i}`) ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              ))}

              <div className="mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                <p className="text-sm font-black text-emerald-800 mb-1">Felicitations !</p>
                <p className="text-xs text-emerald-700 leading-relaxed">
                  Si vous avez suivi toutes les etapes, votre application FreshLink Pro est maintenant connectee
                  a Supabase et deployee sur Vercel. Vos donnees sont sauvegardees dans une vraie base de donnees cloud.
                </p>
              </div>

              <div className="mt-4 flex gap-2 flex-wrap">
                <LinkBtn href="https://supabase.com/dashboard" label="Dashboard Supabase" />
                <LinkBtn href="https://vercel.com/dashboard" label="Dashboard Vercel" />
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  )
}
