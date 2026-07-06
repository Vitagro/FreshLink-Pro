"use client"

import { useState, useRef } from "react"
import { store, type User, type HRCustomTemplate, type HRTemplateType } from "@/lib/store"

function Icon({ d, className = "w-5 h-5" }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
    </svg>
  )
}

const TEMPLATE_TYPE_LABELS: Record<HRTemplateType, string> = {
  contrat:              "Contrat de travail",
  attestation_travail:  "Attestation de travail",
  attestation_salaire:  "Attestation de salaire",
  fiche_paie:           "Bulletin de paie",
  avertissement:        "Avertissement",
  mise_en_demeure:      "Mise en demeure",
  bon_livraison:        "Bon de livraison",
  facture:              "Facture",
  purchase_order:       "Bon de commande (PO)",
}

const TEMPLATE_TYPE_COLORS: Record<HRTemplateType, string> = {
  contrat:              "bg-blue-100 text-blue-800",
  attestation_travail:  "bg-emerald-100 text-emerald-800",
  attestation_salaire:  "bg-teal-100 text-teal-800",
  fiche_paie:           "bg-violet-100 text-violet-800",
  avertissement:        "bg-red-100 text-red-800",
  mise_en_demeure:      "bg-orange-100 text-orange-800",
  bon_livraison:        "bg-cyan-100 text-cyan-800",
  facture:              "bg-amber-100 text-amber-800",
  purchase_order:       "bg-indigo-100 text-indigo-800",
}

// Default variable sets by type
const TEMPLATE_VARS: Record<HRTemplateType, string[]> = {
  contrat:             ["{{nom}}", "{{prenom}}", "{{civilite}}", "{{poste}}", "{{departement}}", "{{dateEmbauche}}", "{{salaireBrut}}", "{{typeContrat}}", "{{datefinCdd}}", "{{ville}}", "{{societe}}", "{{dateDoc}}"],
  attestation_travail: ["{{nom}}", "{{prenom}}", "{{civilite}}", "{{poste}}", "{{dateEmbauche}}", "{{societe}}", "{{ville}}", "{{dateDoc}}"],
  attestation_salaire: ["{{nom}}", "{{prenom}}", "{{civilite}}", "{{poste}}", "{{salaireBrut}}", "{{salaireNet}}", "{{societe}}", "{{ville}}", "{{dateDoc}}"],
  fiche_paie:          ["{{nom}}", "{{prenom}}", "{{civilite}}", "{{poste}}", "{{cin}}", "{{cnss}}", "{{salaireBrut}}", "{{salaireNet}}", "{{totalRetenues}}", "{{periode}}", "{{modePaie}}", "{{societe}}"],
  avertissement:       ["{{nom}}", "{{prenom}}", "{{civilite}}", "{{poste}}", "{{motif}}", "{{dateDoc}}", "{{societe}}", "{{ville}}"],
  mise_en_demeure:     ["{{nom}}", "{{prenom}}", "{{civilite}}", "{{motif}}", "{{dateDoc}}", "{{societe}}", "{{ville}}"],
  bon_livraison:       ["{{clientNom}}", "{{secteur}}", "{{zone}}", "{{livreurNom}}", "{{dateDoc}}", "{{montantTTC}}", "{{societe}}"],
  facture:             ["{{clientNom}}", "{{factureNum}}", "{{dateDoc}}", "{{montantHT}}", "{{montantTTC}}", "{{societe}}"],
  purchase_order:      ["{{fournisseurNom}}", "{{articleNom}}", "{{quantite}}", "{{prixUnitaire}}", "{{total}}", "{{dateDoc}}", "{{societe}}"],
}

// Sample content per type
const SAMPLE_CONTENT: Record<HRTemplateType, string> = {
  contrat: `Entre les soussignes :

La societe {{societe}}, ci-apres denominee "l'Employeur",

ET

{{civilite}} {{nom}} {{prenom}}, ci-apres denomme(e) "l'Employe(e)",

Il a ete convenu ce qui suit :

Article 1 — ENGAGEMENT
{{civilite}} {{nom}} {{prenom}} est engage(e) au poste de {{poste}} au sein du departement {{departement}}.

Article 2 — TYPE DE CONTRAT
Le present contrat est conclu pour une duree {{typeContrat}}, prenant effet le {{dateEmbauche}}.

Article 3 — REMUNERATION
La remuneration mensuelle brute est fixee a {{salaireBrut}} DH.

Article 4 — LIEU DE TRAVAIL
Le lieu de travail habituel est fixe a {{ville}}.

Fait a {{ville}}, le {{dateDoc}}`,

  attestation_travail: `Je soussigne(e), representant legal de la societe {{societe}}, certifie que {{civilite}} {{nom}} {{prenom}} est employe(e) au sein de notre etablissement en qualite de {{poste}} depuis le {{dateEmbauche}}.

La presente attestation est delivree a la demande de l'interesse(e) pour servir et valoir ce que de droit.

Fait a {{ville}}, le {{dateDoc}}`,

  attestation_salaire: `La societe {{societe}} atteste que {{civilite}} {{nom}} {{prenom}}, employe(e) au poste de {{poste}}, percoit une remuneration mensuelle brute de {{salaireBrut}} DH, soit un salaire net de {{salaireNet}} DH.

La presente attestation est delivree pour valoir ce que de droit, notamment dans le cadre d'une demande de credit/visa.

Fait a {{ville}}, le {{dateDoc}}`,

  fiche_paie: `BULLETIN DE PAIE — {{periode}}

Employe: {{civilite}} {{nom}} {{prenom}}
Poste: {{poste}} | CIN: {{cin}} | CNSS: {{cnss}}

GAINS:
- Salaire brut: {{salaireBrut}} DH

RETENUES:
- CNSS salariale + AMO + IR: {{totalRetenues}} DH

NET A PAYER: {{salaireNet}} DH
Mode: {{modePaie}}`,

  avertissement: `Nous vous notifions par la presente lettre d'avertissement pour le motif suivant :

{{motif}}

Vous disposez d'un delai de 48 heures pour presenter vos observations ecrites.
En cas de recidive, des mesures disciplinaires plus severes seront envisagees.

Fait a {{ville}}, le {{dateDoc}}

Direction — {{societe}}`,

  mise_en_demeure: `Par la presente, nous vous mettons en demeure de vous conformer a vos obligations contractuelles concernant :

{{motif}}

A defaut de reponse sous 8 jours, nous nous verrons dans l'obligation d'engager toute procedure judiciaire appropriee.

Fait a {{ville}}, le {{dateDoc}}`,

  bon_livraison: `BON DE LIVRAISON

Client: {{clientNom}}
Secteur: {{secteur}} — Zone: {{zone}}
Livreur: {{livreurNom}}
Date: {{dateDoc}}

TOTAL TTC: {{montantTTC}} DH`,

  facture: `FACTURE N° {{factureNum}}

Client: {{clientNom}}
Date: {{dateDoc}}
Societe: {{societe}}

Montant HT: {{montantHT}} DH
Montant TTC: {{montantTTC}} DH`,

  purchase_order: `BON DE COMMANDE

Fournisseur: {{fournisseurNom}}
Article: {{articleNom}}
Quantite: {{quantite}}
Prix unitaire: {{prixUnitaire}} DH
TOTAL: {{total}} DH
Date: {{dateDoc}}`,
}

interface Props { user: User }

export default function BOTemplateEditor({ user }: Props) {
  const [templates, setTemplates] = useState<HRCustomTemplate[]>(() => store.getHRTemplates())
  const [editing, setEditing] = useState<HRCustomTemplate | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saveMsg, setSaveMsg] = useState("")
  const [preview, setPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<Omit<HRCustomTemplate, "id" | "createdBy" | "createdAt" | "updatedAt">>({
    nom: "", type: "contrat", description: "", contenu: SAMPLE_CONTENT["contrat"],
    variables: TEMPLATE_VARS["contrat"], actif: true,
  })

  const flash = (msg: string) => { setSaveMsg(msg); setTimeout(() => setSaveMsg(""), 3000) }

  const refreshType = (t: HRTemplateType) => {
    setForm(f => ({ ...f, type: t, contenu: SAMPLE_CONTENT[t], variables: TEMPLATE_VARS[t] }))
  }

  const save = () => {
    if (!form.nom.trim()) { flash("Nom requis."); return }
    // Extract variables from content
    const vars = [...new Set((form.contenu.match(/\{\{[a-zA-Z]+\}\}/g) ?? []))]
    if (editing) {
      store.updateHRTemplate(editing.id, { ...form, variables: vars, updatedAt: new Date().toISOString() })
    } else {
      store.addHRTemplate({
        id: store.genId(), ...form, variables: vars, actif: true,
        createdBy: user.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      })
    }
    setTemplates(store.getHRTemplates())
    setShowForm(false)
    setEditing(null)
    flash(editing ? "Modele mis a jour." : "Modele cree.")
  }

  const del = (id: string) => {
    if (!confirm("Supprimer ce modele ?")) return
    store.deleteHRTemplate(id)
    setTemplates(store.getHRTemplates())
  }

  const editTemplate = (t: HRCustomTemplate) => {
    setEditing(t)
    setForm({ nom: t.nom, type: t.type, description: t.description, contenu: t.contenu, variables: t.variables, actif: t.actif })
    setShowForm(true)
  }

  const importFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      setForm(f => ({ ...f, contenu: text, nom: file.name.replace(/\.[^.]+$/, "") }))
      setShowForm(true)
      flash("Fichier importe. Verifiez le contenu avant de sauvegarder.")
    }
    reader.readAsText(file)
    e.target.value = ""
  }

  const showPreview = (t: HRCustomTemplate) => {
    // Simple preview with dummy values
    const dummy: Record<string, string> = {
      nom: "ALAMI", prenom: "Youssef", civilite: "M.", poste: "Responsable Logistique",
      departement: "Logistique", dateEmbauche: "01/01/2023", salaireBrut: "8 000,00",
      salaireNet: "6 750,00", totalRetenues: "1 250,00", typeContrat: "CDI",
      datefinCdd: "", ville: "Casablanca", societe: "Vita Fresh SARL",
      dateDoc: new Date().toLocaleDateString("fr-FR"), cin: "AB123456",
      cnss: "12345678", modePaie: "Virement", periode: "Mai 2026",
      motif: "Absences repetees et non justifiees", clientNom: "Epicerie Al Baraka",
      secteur: "Centre", zone: "Zone A", livreurNom: "Ahmed Tazi",
      montantTTC: "1 200,00", factureNum: "FAC-260501-001", montantHT: "1 200,00",
      fournisseurNom: "Marjane Holding", articleNom: "Tomates Rondes",
      quantite: "500", prixUnitaire: "2.50", total: "1 250,00",
    }
    let html = t.contenu
    Object.entries(dummy).forEach(([k, v]) => { html = html.replaceAll(`{{${k}}}`, v) })
    setPreview(html)
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-foreground">Editeur de Modeles</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Importez et personnalisez vos templates BL, Facture, Contrat, Fiche de paie...</p>
        </div>
        <div className="flex items-center gap-2">
          {saveMsg && <div className="px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold">{saveMsg}</div>}
          <button onClick={() => { fileRef.current?.click() }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-foreground text-sm font-bold hover:bg-muted transition-colors">
            <Icon d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" className="w-4 h-4" />
            Importer fichier
          </button>
          <input ref={fileRef} type="file" accept=".txt,.html,.htm,.doc,.docx" className="hidden" onChange={importFile} />
          <button onClick={() => { setEditing(null); setForm({ nom: "", type: "contrat", description: "", contenu: SAMPLE_CONTENT["contrat"], variables: TEMPLATE_VARS["contrat"], actif: true }); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity">
            <Icon d="M12 4v16m8-8H4" className="w-4 h-4" />
            Nouveau modele
          </button>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-card rounded-2xl border-2 border-primary/20 p-5 flex flex-col gap-4">
          <h3 className="font-bold text-foreground">{editing ? "Modifier le modele" : "Nouveau modele"}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-foreground uppercase tracking-wide">Nom du modele</label>
              <input value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })}
                className="border border-border rounded-xl px-3 py-2 text-sm text-foreground bg-background"
                placeholder="Ex: CDI Standard 2026" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-foreground uppercase tracking-wide">Type</label>
              <select value={form.type} onChange={e => refreshType(e.target.value as HRTemplateType)}
                className="border border-border rounded-xl px-3 py-2 text-sm text-foreground bg-background">
                {(Object.entries(TEMPLATE_TYPE_LABELS) as [HRTemplateType, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-foreground uppercase tracking-wide">Description</label>
              <input value={form.description ?? ""} onChange={e => setForm({ ...form, description: e.target.value })}
                className="border border-border rounded-xl px-3 py-2 text-sm text-foreground bg-background"
                placeholder="Description courte" />
            </div>
          </div>

          {/* Variables legend */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-foreground uppercase tracking-wide">Variables disponibles (cliquer pour inserer)</label>
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATE_VARS[form.type].map(v => (
                <button key={v} onClick={() => setForm(f => ({ ...f, contenu: f.contenu + v }))}
                  className="px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs font-mono font-semibold hover:bg-blue-100 transition-colors">
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-foreground uppercase tracking-wide">Contenu du modele</label>
            <textarea
              value={form.contenu}
              onChange={e => setForm({ ...form, contenu: e.target.value })}
              rows={16}
              className="border border-border rounded-xl px-3 py-2 text-sm text-foreground bg-background font-mono leading-relaxed resize-y"
              placeholder="Contenu du modele avec variables {{nom}}, {{poste}}, etc."
            />
          </div>

          <div className="flex gap-2 flex-wrap">
            <button onClick={save}
              className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity">
              {editing ? "Mettre a jour" : "Enregistrer le modele"}
            </button>
            <button onClick={() => { setShowForm(false); setEditing(null) }}
              className="px-6 py-2.5 rounded-xl border border-border text-foreground text-sm font-semibold hover:bg-muted transition-colors">
              Annuler
            </button>
            {form.contenu && (
              <button onClick={() => {
                const dummy: Record<string, string> = { nom: "ALAMI", prenom: "Youssef", civilite: "M.", poste: "Responsable", societe: "OPTIMFLUX", ville: "Casablanca", dateDoc: "29/04/2026", salaireBrut: "8000", salaireNet: "6750", periode: "Mai 2026", motif: "Test motif", clientNom: "Client Test", dateEmbauche: "01/01/2023", typeContrat: "CDI", totalRetenues: "1250", modePaie: "Virement", cin: "AB123", cnss: "12345" }
                let html = form.contenu
                Object.entries(dummy).forEach(([k, v]) => { html = html.replaceAll(`{{${k}}}`, v) })
                setPreview(html)
              }}
                className="px-6 py-2.5 rounded-xl border border-primary/30 text-primary text-sm font-semibold hover:bg-primary/5 transition-colors">
                Apercu
              </button>
            )}
          </div>
        </div>
      )}

      {/* Preview modal */}
      {preview && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <span className="font-bold text-foreground">Apercu du modele</span>
              <button onClick={() => setPreview(null)} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground">
                <Icon d="M6 18L18 6M6 6l12 12" className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-6">
              <pre className="font-sans text-sm leading-relaxed text-foreground whitespace-pre-wrap">{preview}</pre>
            </div>
          </div>
        </div>
      )}

      {/* Templates list */}
      {templates.length === 0 && !showForm ? (
        <div className="bg-card rounded-2xl border border-border p-12 text-center">
          <Icon d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-semibold text-foreground">Aucun modele personnalise</p>
          <p className="text-sm text-muted-foreground mt-1">Cliquez sur &quot;Nouveau modele&quot; ou importez un fichier existant</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <h3 className="font-bold text-foreground">{templates.length} modele(s) personnalise(s)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {templates.map(t => (
              <div key={t.id} className={`bg-card rounded-2xl border ${t.actif ? "border-border" : "border-border opacity-50"} p-4 flex flex-col gap-3`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-foreground truncate">{t.nom}</p>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold mt-1 ${TEMPLATE_TYPE_COLORS[t.type]}`}>
                      {TEMPLATE_TYPE_LABELS[t.type]}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => showPreview(t)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground" title="Apercu">
                      <Icon d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => editTemplate(t)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground" title="Modifier">
                      <Icon d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => del(t.id)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-50 transition-colors text-red-500" title="Supprimer">
                      <Icon d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                <div className="flex flex-wrap gap-1">
                  {t.variables.slice(0, 5).map(v => (
                    <span key={v} className="px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground font-mono">{v}</span>
                  ))}
                  {t.variables.length > 5 && <span className="text-[10px] text-muted-foreground">+{t.variables.length - 5}</span>}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Cree le {new Date(t.createdAt).toLocaleDateString("fr-FR")} — {t.contenu.length} carac.
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
