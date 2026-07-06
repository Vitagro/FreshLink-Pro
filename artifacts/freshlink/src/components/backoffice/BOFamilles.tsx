"use client"

// ══════════════════════════════════════════════════════════════════════════
// BOFamilles — Gestion des Familles d'articles
//
// Zone dédiée pour éliminer la confusion des familles créées "à la volée"
// depuis la fiche article (doublons type "Herbes" vs "Herbes aromatiques").
// Ici : créer une famille explicitement, voir tous ses articles, en
// ajouter/retirer en masse, renommer (fusionne si le nouveau nom existe
// déjà) ou supprimer (uniquement si plus aucun article ne l'utilise).
// ══════════════════════════════════════════════════════════════════════════

import { useState, useMemo } from "react"
import { store, type Article, type User, getAllFamilles, addCustomFamille, removeCustomFamille, getCustomFamilles, desactiverFamille, FAMILLES_ARTICLES } from "@/lib/store"

interface Props { user: User }

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim()
}

export default function BOFamilles({ user: _user }: Props) {
  const [articles, setArticles] = useState<Article[]>(() => store.getArticles())
  const [tick, setTick] = useState(0) // force re-render après create/rename/delete famille perso
  const [selected, setSelected] = useState<string | null>(null)
  const [newFamille, setNewFamille] = useState("")
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [addSearch, setAddSearch] = useState("")
  const [toAdd, setToAdd] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 5000) }

  const refreshArticles = () => setArticles(store.getArticles())

  const pushArticles = async (ids: string[], all: Article[]) => {
    try {
      const db = await import("@/lib/supabase/db")
      for (const id of ids) { const a = all.find(x => x.id === id); if (a) await db.upsertArticle(a) }
    } catch { /* offline — resync plus tard */ }
  }

  // ── Familles connues (prédéfinies + perso + utilisées par des articles) ──
  const familles = useMemo(() => {
    void tick
    const custom = new Set(getCustomFamilles())
    const noms = getAllFamilles(articles.map(a => a.famille))
    return noms
      .map(nom => ({
        nom,
        count: articles.filter(a => a.famille === nom).length,
        isCustom: custom.has(nom),
        isPredefinie: FAMILLES_ARTICLES.includes(nom),
      }))
      .sort((a, b) => b.count - a.count || a.nom.localeCompare(b.nom, "fr"))
  }, [articles, tick])

  const sansFamille = useMemo(() => articles.filter(a => !a.famille?.trim()).length, [articles])

  const articlesDansSelection = useMemo(
    () => selected ? articles.filter(a => a.famille === selected).sort((a, b) => a.nom.localeCompare(b.nom, "fr")) : [],
    [articles, selected],
  )

  const articlesDisponibles = useMemo(() => {
    if (!selected) return []
    const q = norm(addSearch)
    return articles
      .filter(a => a.famille !== selected)
      .filter(a => !q || norm(a.nom).includes(q) || norm(a.nomAr ?? "").includes(q) || norm(a.famille ?? "").includes(q))
      .sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
      .slice(0, 200)
  }, [articles, selected, addSearch])

  // ── Actions ────────────────────────────────────────────────────────────
  const createFamille = () => {
    const nom = newFamille.trim()
    if (!nom) return
    const exists = familles.some(f => norm(f.nom) === norm(nom))
    if (exists) { flash(false, `« ${nom} » existe déjà.`); return }
    addCustomFamille(nom)
    setNewFamille(""); setTick(t => t + 1)
    setSelected(nom)
    flash(true, `Famille « ${nom} » créée.`)
  }

  const startRename = (nom: string) => { setRenaming(nom); setRenameValue(nom) }

  const confirmRename = async (oldNom: string) => {
    const newNom = renameValue.trim()
    setRenaming(null)
    if (!newNom || newNom === oldNom) return
    const merging = familles.some(f => norm(f.nom) === norm(newNom) && f.nom !== oldNom)
    if (merging && !window.confirm(`« ${newNom} » existe déjà. Fusionner « ${oldNom} » dedans (tous ses articles seront déplacés) ?`)) return
    setBusy(true)
    const touchedIds = store.reassignFamille(oldNom, newNom)
    // Met à jour la liste des familles perso : retire l'ancien nom, ajoute le nouveau si besoin
    removeCustomFamille(oldNom)
    if (!familles.some(f => norm(f.nom) === norm(newNom))) addCustomFamille(newNom)
    const all = store.getArticles()
    await pushArticles(touchedIds, all)
    refreshArticles(); setTick(t => t + 1)
    setSelected(newNom)
    setBusy(false)
    flash(true, `${touchedIds.length} article(s) déplacé(s) vers « ${newNom} ».`)
  }

  const deleteFamille = (nom: string, isPredefinie: boolean) => {
    const count = articles.filter(a => a.famille === nom).length
    if (count > 0) { flash(false, `Impossible : ${count} article(s) utilisent encore « ${nom} ». Réaffectez-les d'abord.`); return }
    if (!window.confirm(`Supprimer la famille « ${nom} » ?`)) return
    // Prédéfinie (constante en dur) -> masquée de la liste. Perso -> retirée.
    if (isPredefinie) desactiverFamille(nom)
    else removeCustomFamille(nom)
    setTick(t => t + 1)
    if (selected === nom) setSelected(null)
    flash(true, `Famille « ${nom} » supprimée.`)
  }

  const retirerArticle = async (a: Article) => {
    const all = store.getArticles()
    const idx = all.findIndex(x => x.id === a.id)
    if (idx < 0) return
    all[idx] = { ...all[idx], famille: "" }
    store.saveArticles(all)
    await pushArticles([a.id], all)
    refreshArticles()
  }

  const assignerSelection = async () => {
    if (!selected || toAdd.size === 0) return
    setBusy(true)
    const all = store.getArticles().map(a => toAdd.has(a.id) ? { ...a, famille: selected } : a)
    store.saveArticles(all)
    await pushArticles([...toAdd], all)
    refreshArticles()
    flash(true, `${toAdd.size} article(s) ajouté(s) à « ${selected} ».`)
    setToAdd(new Set()); setAddSearch("")
    setBusy(false)
  }

  const toggleAdd = (id: string) => setToAdd(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl bg-gradient-to-br from-emerald-700 via-emerald-800 to-slate-900 p-5 text-white">
        <h2 className="text-lg font-black">🗂️ Gestion des Familles</h2>
        <p className="text-sm text-white/75 mt-1">Créez les familles ici et affectez les articles — plus de doublons créés au hasard depuis une fiche article.</p>
      </div>

      {msg && <div className={`px-4 py-2.5 rounded-xl text-sm font-semibold shadow ${msg.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>{msg.text}</div>}

      {sansFamille > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-sm px-4 py-2.5">
          ⚠️ {sansFamille} article(s) sans famille assignée.
        </div>
      )}

      <div className="grid md:grid-cols-[320px_1fr] gap-4">
        {/* ── Colonne familles ───────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-2xl flex flex-col overflow-hidden">
          <div className="p-3 border-b border-border flex gap-2">
            <input value={newFamille} onChange={e => setNewFamille(e.target.value)}
              onKeyDown={e => e.key === "Enter" && createFamille()}
              placeholder="+ Nouvelle famille..."
              className="flex-1 px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            <button onClick={createFamille} disabled={!newFamille.trim()}
              className="px-3 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-40" style={{ background: "oklch(0.38 0.2 260)" }}>
              Créer
            </button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto divide-y divide-border">
            {familles.map(f => (
              <div key={f.nom}
                onClick={() => setSelected(f.nom)}
                className={`px-4 py-2.5 cursor-pointer transition-colors ${selected === f.nom ? "bg-primary/10" : "hover:bg-muted/50"}`}>
                {renaming === f.nom ? (
                  <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                    <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && confirmRename(f.nom)}
                      className="flex-1 px-2 py-1 rounded-lg border border-border bg-background text-sm" />
                    <button onClick={() => confirmRename(f.nom)} className="text-emerald-600 text-xs font-bold px-1">✓</button>
                    <button onClick={() => setRenaming(null)} className="text-muted-foreground text-xs font-bold px-1">✕</button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{f.nom}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {f.count} article(s){f.isPredefinie ? " · prédéfinie" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{f.count}</span>
                      <button onClick={e => { e.stopPropagation(); startRename(f.nom) }} title="Renommer / fusionner"
                        className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={e => { e.stopPropagation(); deleteFamille(f.nom, f.isPredefinie) }} title="Supprimer"
                        className="p-1 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Colonne détail / affectation ───────────────────────────────── */}
        <div className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-4">
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground py-16 gap-2">
              <p className="text-4xl">🗂️</p>
              <p className="font-semibold">Choisissez ou créez une famille à gauche</p>
              <p className="text-sm">{familles.length} famille(s) · {articles.length} articles au total</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-foreground">{selected}</h3>
                <span className="text-sm text-muted-foreground">{articlesDansSelection.length} article(s)</span>
              </div>

              {/* Articles déjà dans la famille */}
              <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
                {articlesDansSelection.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic py-3">Aucun article dans cette famille pour l&apos;instant.</p>
                ) : articlesDansSelection.map(a => (
                  <div key={a.id} className="flex items-center gap-3 px-3 py-2 rounded-xl border border-border">
                    <img src={a.photo || "https://placehold.co/32x32/e2e8f0/64748b?text=Art"} alt={a.nom}
                      className="w-8 h-8 rounded-lg object-cover border border-border shrink-0"
                      onError={e => { e.currentTarget.src = "https://placehold.co/32x32/e2e8f0/64748b?text=Art" }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{a.nom}</p>
                      {a.nomAr && <p className="text-[10px] text-muted-foreground" dir="rtl" lang="ar">{a.nomAr}</p>}
                    </div>
                    <button onClick={() => retirerArticle(a)} title="Retirer de cette famille"
                      className="text-[11px] font-semibold text-red-600 hover:underline shrink-0">Retirer</button>
                  </div>
                ))}
              </div>

              <div className="border-t border-border pt-4 flex flex-col gap-2">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Ajouter des articles à « {selected} »</p>
                <div className="flex items-center gap-2">
                  <input value={addSearch} onChange={e => setAddSearch(e.target.value)}
                    placeholder="Rechercher un article (nom, arabe, famille actuelle)..."
                    className="flex-1 px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  <button onClick={assignerSelection} disabled={toAdd.size === 0 || busy}
                    className="px-3 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-40 whitespace-nowrap"
                    style={{ background: "oklch(0.38 0.2 260)" }}>
                    {busy ? "…" : `Assigner (${toAdd.size})`}
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto flex flex-col gap-1 mt-1">
                  {articlesDisponibles.map(a => (
                    <label key={a.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-muted/50 cursor-pointer">
                      <input type="checkbox" checked={toAdd.has(a.id)} onChange={() => toggleAdd(a.id)} className="w-4 h-4 accent-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{a.nom}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{a.famille || "— sans famille —"}</p>
                      </div>
                    </label>
                  ))}
                  {articlesDisponibles.length === 0 && (
                    <p className="text-sm text-muted-foreground italic py-3">Aucun article trouvé.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
