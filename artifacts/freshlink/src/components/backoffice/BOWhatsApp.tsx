"use client"

import { useState, useEffect } from "react"
import { store, type User, type Client, type BonLivraison, ROLE_LABELS } from "@/lib/store"

interface Props { user: User }

type Cible = "clients" | "fournisseurs" | "equipe"
type ModeleType = "commande_confirmee" | "livraison_en_cours" | "retard" | "promo" | "facture" | "relance_paiement" | "custom"

// Bilingual message builder — FR + AR personalised per recipient type
type MsgContext = {
  cible: Cible
  nom: string
  nomAr?: string
  extra?: string
  // BL data
  numeroBL?: string
  montantBL?: number
  // delay
  retardHeures?: string
}

function buildMessage(type: ModeleType, ctx: MsgContext): string {
  const { cible, nom, extra, numeroBL, montantBL, retardHeures } = ctx
  const grFR = `Bonjour ${nom},`
  const grAR = cible === "equipe" ? `مرحبا ${nom}،` : `السلام عليكم ${nom}،`
  const sig = "— Vita Fresh"

  // Build BL reference string
  const blRef = numeroBL ? ` (BL N° ${numeroBL}${montantBL ? ` — ${montantBL.toLocaleString("fr-MA")} DH` : ""})` : ""
  const blRefAr = numeroBL ? ` (وصل التسليم رقم ${numeroBL}${montantBL ? ` — ${montantBL.toLocaleString("fr-MA")} درهم` : ""})` : ""

  switch (type) {
    case "commande_confirmee":
      if (cible === "clients")
        return `${grFR}\n\nVotre commande${extra ? ` N° ${extra}` : ""}${blRef} a bien été confirmée et sera préparée dans les meilleurs délais.\n\n${grAR}\nتم تأكيد طلبيتك${extra ? ` رقم ${extra}` : ""}${blRefAr} وستتم معالجتها في أقرب وقت.\n\nMerci de votre confiance / شكرا لثقتكم.\n${sig}`
      if (cible === "fournisseurs")
        return `${grFR}\n\nNous confirmons notre commande${extra ? ` N° ${extra}` : ""}${blRef} auprès de vous. Merci de préparer la marchandise selon nos spécifications.\n\n${grAR}\nنؤكد طلبيتنا${extra ? ` رقم ${extra}` : ""}${blRefAr} منكم. يرجى تجهيز البضاعة وفق مواصفاتنا.\n${sig}`
      return `${grFR}\n\nUne nouvelle commande${extra ? ` N° ${extra}` : ""}${blRef} a été validée.\n\n${grAR}\nتم تأكيد طلبية جديدة${extra ? ` رقم ${extra}` : ""}${blRefAr}.\n${sig}`

    case "livraison_en_cours":
      if (cible === "clients")
        return `${grFR}\n\nVotre livraison${blRef} est en route ! Notre livreur sera chez vous dans les prochaines heures.\n\n${grAR}\nطلبيتك${blRefAr} في الطريق إليك! سيصل المندوب قريباً.\n\nPour toute urgence contactez-nous / للتواصل العاجل اتصل بنا.\n${sig}`
      if (cible === "fournisseurs")
        return `${grFR}\n\nNous venons récupérer notre commande${blRef} aujourd'hui. Merci de préparer la marchandise.\n\n${grAR}\nسنمر لاستلام طلبيتنا${blRefAr} اليوم. يرجى تجهيز البضاعة.\n${sig}`
      return `${grFR}\n\nLa tournée de livraison est en cours${extra ? ` — Zone : ${extra}` : ""}. Merci de rester disponible.\n\n${grAR}\nجولة التوصيل جارية${extra ? ` — المنطقة: ${extra}` : ""}. يرجى الاستعداد.\n${sig}`

    case "retard":
      if (cible === "clients") {
        const retardInfo = retardHeures
          ? ` de ${retardHeures} heure${Number(retardHeures) > 1 ? "s" : ""}`
          : extra ? ` (${extra})` : ""
        const retardInfoAr = retardHeures
          ? ` بمقدار ${retardHeures} ساعة`
          : extra ? ` (${extra})` : ""
        return `${grFR}\n\nNous vous informons d'un retard${retardInfo} sur votre livraison${blRef}. Nous mettons tout en œuvre pour vous livrer au plus vite.\n\n${grAR}\nنعتذر منكم، يوجد تأخير${retardInfoAr} في توصيل طلبيتك${blRefAr}. نعمل على حل المشكلة في أسرع وقت.\n\nNos sincères excuses / نعتذر بشدة.\n${sig}`
      }
      if (cible === "fournisseurs") {
        const retardInfo = retardHeures ? ` d'environ ${retardHeures}h` : extra ? ` (${extra})` : ""
        return `${grFR}\n\nNous vous informons que la réception de notre commande${blRef} sera retardée${retardInfo}. Nous vous confirmerons un nouveau créneau.\n\n${grAR}\nنعلمكم أن استلام طلبيتنا${blRefAr} سيتأخر${retardHeures ? ` بنحو ${retardHeures} ساعة` : ""}. سنؤكد موعداً جديداً.\n${sig}`
      }
      return `${grFR}\n\nAttention : la livraison${extra ? ` (zone ${extra})` : ""}${blRef} est retardée${retardHeures ? ` de ${retardHeures}h` : ""}. Merci de prévenir les clients concernés.\n\n${grAR}\nتنبيه: توصيل${extra ? ` منطقة ${extra}` : ""}${blRefAr} متأخر${retardHeures ? ` بمقدار ${retardHeures} ساعة` : ""}. يرجى إبلاغ العملاء المعنيين.\n${sig}`

    case "promo":
      if (cible === "clients")
        return `${grFR}\n\n${extra || "Nous avons une offre spéciale pour vous cette semaine !"}\n\n${grAR}\nعرض خاص لكم هذا الأسبوع! ${extra || "تواصلوا معنا لمعرفة التفاصيل."}\n\nN'hésitez pas à passer votre commande / لا تتردد في تقديم طلبيتك.\n${sig}`
      if (cible === "fournisseurs")
        return `${grFR}\n\n${extra || "Nous souhaitons discuter de nouvelles conditions commerciales avec vous."}\n\n${grAR}\n${extra || "نود مناقشة شروط تجارية جديدة معكم."}\n${sig}`
      return `${grFR}\n\n${extra || "Nouvelle information commerciale à partager avec l'équipe."}\n\n${grAR}\n${extra || "معلومة تجارية جديدة لمشاركتها مع الفريق."}\n${sig}`

    case "facture":
      if (cible === "clients")
        return `${grFR}\n\nNous vous rappelons qu'une facture${blRef}${extra ? ` de ${extra} DH` : ""} est en attente de règlement.\n\n${grAR}\nنذكركم ${nom} بوجود فاتورة${blRefAr}${extra ? ` بمبلغ ${extra} درهم` : ""} في انتظار التسديد.\n\nMerci de procéder au paiement / شكراً للتسديد في أقرب وقت.\n${sig}`
      if (cible === "fournisseurs")
        return `${grFR}\n\nNous souhaitons vous informer qu'une facture${blRef} est prête pour traitement.\n\n${grAR}\nنودّ إعلامكم بوجود فاتورة${blRefAr} جاهزة للمعالجة.\n${sig}`
      return `${grFR}\n\nRappel : les encaissements${extra ? ` du ${extra}` : " de la journée"} doivent être remis en caisse.\n\n${grAR}\nتذكير: يجب تسليم تحصيلات${extra ? ` ${extra}` : " اليوم"} إلى الصندوق.\n${sig}`

    case "relance_paiement":
      if (cible === "clients")
        return `${grFR}\n\nSauf erreur de notre part, votre solde${blRef}${extra ? ` de ${extra} DH` : ""} est toujours en attente. Pourriez-vous nous confirmer la date de règlement ?\n\n${grAR}\nعفواً ${nom}، رصيدكم${blRefAr}${extra ? ` البالغ ${extra} درهم` : ""} لا يزال معلقاً. هل يمكنكم تأكيد تاريخ السداد؟\n${sig}`
      if (cible === "fournisseurs")
        return `${grFR}\n\nNous vous demandons de bien vouloir confirmer la réception du paiement${blRef}${extra ? ` de ${extra} DH` : ""}.\n\n${grAR}\nنرجو تأكيد استلام الدفعة${blRefAr}${extra ? ` بمبلغ ${extra} درهم` : ""}.\n${sig}`
      return `${grFR}\n\nMerci de vérifier les encaissements en attente${extra ? ` — Ref : ${extra}` : ""}.\n\n${grAR}\nيرجى مراجعة التحصيلات المعلقة${extra ? ` — Ref : ${extra}` : ""}.\n${sig}`

    case "custom":
    default:
      return extra || `${grFR}\n\n`
  }
}

const MODELES: Record<ModeleType, { label: string; labelAr: string; cibles: Cible[] }> = {
  commande_confirmee: { label: "Commande confirmee", labelAr: "تأكيد الطلبية", cibles: ["clients", "fournisseurs", "equipe"] },
  livraison_en_cours: { label: "Livraison en cours", labelAr: "التوصيل جاري", cibles: ["clients", "fournisseurs", "equipe"] },
  retard:             { label: "Annonce retard",     labelAr: "إشعار تأخير",   cibles: ["clients", "fournisseurs", "equipe"] },
  promo:              { label: "Offre / Actualite",  labelAr: "عرض ترويجي",    cibles: ["clients", "equipe"] },
  facture:            { label: "Facture / Rappel",   labelAr: "تذكير الفاتورة", cibles: ["clients", "fournisseurs", "equipe"] },
  relance_paiement:   { label: "Relance paiement",   labelAr: "تذكير بالدفع",   cibles: ["clients", "fournisseurs", "equipe"] },
  custom:             { label: "Message libre",      labelAr: "رسالة مخصصة",   cibles: ["clients", "fournisseurs", "equipe"] },
}

// Chaîne + groupes communautaires officiels Vita Fresh — accès rapide équipe.
interface Communaute { id: string; label: string; labelAr: string; desc: string; url: string; icon: string }
const COMMUNAUTES: Communaute[] = [
  { id: "channel",     label: "Chaîne Vita Fresh",              labelAr: "قناة فيتا فريش",           desc: "Chaîne officielle de diffusion (annonces, actualités)", url: "https://whatsapp.com/channel/0029Vb8F1Yk0gcfBrER9uO3B", icon: "📣" },
  { id: "particulier", label: "Commandes Particuliers",         labelAr: "طلبيات الأفراد",            desc: "Groupe client — commandes des particuliers",             url: "https://chat.whatsapp.com/CwBMV7tVZRg7PvnGWTolb5",      icon: "🛒" },
  { id: "chr",         label: "Commandes CHR / Horeca",         labelAr: "طلبيات الفنادق والمطاعم",   desc: "Groupe client — hôtels, restaurants, cafés",              url: "https://chat.whatsapp.com/JwBgjvcvzus3mcfwkBpahi",      icon: "🍽️" },
  { id: "marchand",    label: "Commandes Marchands",            labelAr: "طلبيات التجار",             desc: "Groupe client — détaillants et superettes",               url: "https://chat.whatsapp.com/CmZIjLf00uk4oOAGVgtzO6",      icon: "🏪" },
  { id: "sav",         label: "Service Client & Réclamations",  labelAr: "خدمة الزبائن والشكاوى",     desc: "Groupe client — support, suivi commande, réclamations",  url: "https://chat.whatsapp.com/Iu57nM6zLbz5p42FIt707H",      icon: "🎧" },
  { id: "prix_vente",  label: "Prix de vente",                  labelAr: "أثمنة البيع",               desc: "Groupe interne — annonces de changement de prix de vente", url: "https://chat.whatsapp.com/Izfj0BytNmWHtbk6cOX7sb",    icon: "🏷️" },
  { id: "prix_achat",  label: "Hausse prix d'achat",            labelAr: "ارتفاع أثمنة الشراء",       desc: "Groupe interne — alertes hausse des prix d'achat fournisseur", url: "https://chat.whatsapp.com/LSEACEUJ6jcIMg2FcoEGuq",  icon: "📈" },
  { id: "rupture",     label: "Produits manquants / ruptures",  labelAr: "نقص المنتجات",              desc: "Groupe interne — produits non achetés / en rupture",     url: "https://chat.whatsapp.com/ENnYQLwDg5fHd712CMII36",      icon: "⚠️" },
]

interface MsgLog {
  id: string
  date: string
  cible: string
  nom: string
  telephone: string
  modele: ModeleType
  texte: string
  statut: "envoye" | "ouvert"
}

export default function BOWhatsApp({ user }: Props) {
  const [cible, setCible] = useState<Cible>("clients")
  const [onglet, setOnglet] = useState<"envoyer" | "historique" | "communautes">("envoyer")
  const [clients, setClients] = useState<Client[]>([])
  const [fournisseurs, setFournisseurs] = useState(store.getFournisseurs())
  const [equipe, setEquipe] = useState<User[]>([])
  const [bonsLivraison, setBonsLivraison] = useState<BonLivraison[]>([])
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [modele, setModele] = useState<ModeleType>("commande_confirmee")
  const [extra, setExtra] = useState("")
  const [texteCustom, setTexteCustom] = useState("")
  const [logs, setLogs] = useState<MsgLog[]>([])
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(0)
  // BL linking
  const [selectedBL, setSelectedBL] = useState<BonLivraison | null>(null)
  const [blSearch, setBlSearch] = useState("")
  const [showBLPicker, setShowBLPicker] = useState(false)
  // Retard hours
  const [retardHeures, setRetardHeures] = useState("")

  useEffect(() => {
    setClients(store.getVisibleClients())
    setFournisseurs(store.getFournisseurs())
    setEquipe(store.getUsers().filter(u => u.actif))
    setBonsLivraison(store.getVisibleBonsLivraison().slice(-100).reverse()) // last 100
    setLogs(JSON.parse(localStorage.getItem("fl_whatsapp_logs") || "[]"))
  }, [])

  const getItems = () => {
    if (cible === "clients") return clients.filter(c => c.nom.toLowerCase().includes(search.toLowerCase()) || (c.telephone || "").includes(search))
    if (cible === "fournisseurs") return fournisseurs.filter(f => f.nom.toLowerCase().includes(search.toLowerCase()) || (f.telephone || "").includes(search))
    return equipe.filter(u => u.name.toLowerCase().includes(search.toLowerCase()) || (u.telephone || "").includes(search))
  }

  const items = getItems()

  const getName = (item: Client | Record<string, string>) => "nom" in item && typeof item.nom === "string" ? item.nom : (item as { name: string }).name || ""
  const getTel = (item: Client | Record<string, string>) => (item as { telephone?: string }).telephone || ""

  const toggleAll = () => {
    if (selected.size === items.length) setSelected(new Set())
    else setSelected(new Set(items.map((_, i) => i.toString())))
  }

  const buildMsg = (nom: string) => {
    if (modele === "custom") return texteCustom.replace(/\{nom\}/g, nom)
    return buildMessage(modele, {
      cible, nom, extra,
      numeroBL: selectedBL?.id,
      montantBL: selectedBL?.montantTTC,
      retardHeures: modele === "retard" ? retardHeures : undefined,
    })
  }

  // Live preview of the message for the first selected or first item
  const previewNom = (() => {
    if (selected.size > 0) {
      const first = items[Array.from(selected).map(Number)[0]]
      return first ? getName(first as Client | Record<string, string>) : "Client"
    }
    return items[0] ? getName(items[0] as Client | Record<string, string>) : "Client"
  })()
  const previewText = modele === "custom"
    ? (texteCustom || "(Saisissez votre message...)")
    : buildMessage(modele, {
        cible, nom: previewNom, extra,
        numeroBL: selectedBL?.id,
        montantBL: selectedBL?.montantTTC,
        retardHeures: modele === "retard" ? retardHeures : undefined,
      })

  const openWhatsApp = (telephone: string, texte: string) => {
    const tel = telephone.replace(/\D/g, "").replace(/^0/, "212")
    const url = `https://wa.me/${tel}?text=${encodeURIComponent(texte)}`
    window.open(url, "_blank", "noopener,noreferrer")
  }

  const handleSendSelected = async () => {
    const indices = Array.from(selected).map(Number)
    const targets = indices.map(i => items[i]).filter(Boolean)
    if (targets.length === 0) return
    setSending(true)
    setSent(0)
    const newLogs: MsgLog[] = []
    for (let i = 0; i < targets.length; i++) {
      const item = targets[i]
      const nom = getName(item as Client | Record<string, string>)
      const tel = getTel(item as Client | Record<string, string>)
      const texte = buildMsg(nom)
      if (tel) {
        openWhatsApp(tel, texte)
        newLogs.push({
          id: store.genId(),
          date: new Date().toISOString(),
          cible,
          nom,
          telephone: tel,
          modele,
          texte,
          statut: "envoye",
        })
        setSent(i + 1)
        await new Promise(r => setTimeout(r, 800)) // small delay between tabs
      }
    }
    const all = [...newLogs, ...logs].slice(0, 200)
    localStorage.setItem("fl_whatsapp_logs", JSON.stringify(all))
    setLogs(all)
    setSending(false)
    setSelected(new Set())
  }

  const handleSendOne = (item: Client | Record<string, string>) => {  // eslint-disable-line
    const nom = getName(item as Client | Record<string, string>)
    const tel = getTel(item as Client | Record<string, string>)
    if (!tel) { alert("Pas de numéro de téléphone pour ce contact."); return }
    const texte = buildMsg(nom)
    openWhatsApp(tel, texte)
    const log: MsgLog = { id: store.genId(), date: new Date().toISOString(), cible, nom, telephone: tel, modele, texte, statut: "envoye" }
    const all = [log, ...logs].slice(0, 200)
    localStorage.setItem("fl_whatsapp_logs", JSON.stringify(all))
    setLogs(all)
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "#25D366" }}>
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            </span>
            WhatsApp Pro
            <span className="text-muted-foreground font-normal text-base">/ واتساب</span>
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">Envoi de messages WhatsApp — Clients, Fournisseurs, Equipe</p>
        </div>

        {/* Onglets */}
        <div className="flex gap-1 bg-muted p-1 rounded-xl">
          {([["envoyer", "Envoyer"], ["communautes", "Communautés"], ["historique", "Historique"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setOnglet(k)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${onglet === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {l}
              {k === "historique" && logs.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background: "#25D366", color: "#fff" }}>{logs.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {onglet === "envoyer" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left — contacts list */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            {/* Cible selector */}
            <div className="flex gap-2 flex-wrap">
              {([
                ["clients", "Clients", "الزبائن", clients.length],
                ["fournisseurs", "Fournisseurs", "الموردون", fournisseurs.length],
                ["equipe", "Equipe", "الفريق", equipe.length],
              ] as const).map(([k, l, ar, count]) => (
                <button key={k} onClick={() => { setCible(k); setSelected(new Set()); setSearch("") }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${cible === k ? "border-transparent text-white" : "border-border text-muted-foreground hover:text-foreground bg-card"}`}
                  style={cible === k ? { background: "#25D366" } : {}}>
                  {l} / {ar}
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${cible === k ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"}`}>{count}</span>
                </button>
              ))}
            </div>

            {/* Search + select all */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher par nom ou téléphone..."
                  className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <button onClick={toggleAll}
                className="px-3 py-2.5 rounded-xl border border-border bg-card text-xs font-semibold text-muted-foreground hover:text-foreground whitespace-nowrap">
                {selected.size === items.length && items.length > 0 ? "Désélect. tout" : "Sélect. tout"}
              </button>
            </div>

            {/* Contact cards */}
            <div className="flex flex-col gap-2 max-h-[420px] overflow-y-auto pr-1">
              {items.length === 0 && (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  Aucun contact trouvé — أي جهة اتصال لم تعثر عليها
                </div>
              )}
              {items.map((item, i) => {
                const nom = getName(item as Client | Record<string, string>)
                const tel = getTel(item as Client | Record<string, string>)
                const isChecked = selected.has(i.toString())
                const hasTel = !!tel

                return (
                  <div key={i}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${isChecked ? "border-green-300 bg-green-50" : "border-border bg-card hover:border-muted-foreground/30"} ${!hasTel ? "opacity-50" : ""}`}
                    onClick={() => {
                      if (!hasTel) return
                      const next = new Set(selected)
                      if (next.has(i.toString())) next.delete(i.toString()); else next.add(i.toString())
                      setSelected(next)
                    }}>
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${isChecked ? "border-green-500 bg-green-500" : "border-border"}`}>
                      {isChecked && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                    </div>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                      style={{ background: hasTel ? "#25D366" : "#94a3b8" }}>
                      {nom[0]?.toUpperCase() || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground text-sm truncate">{nom}</p>
                      <p className="text-xs text-muted-foreground">{tel || "Pas de telephone"}</p>
                      {cible === "clients" && (item as Client).secteur && (
                        <p className="text-[10px] text-muted-foreground">{(item as Client).secteur} — {(item as Client).zone}</p>
                      )}
                      {cible === "equipe" && (
                        <p className="text-[10px] text-muted-foreground">{ROLE_LABELS[(item as User).role]}</p>
                      )}
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); handleSendOne(item as Client | Record<string, string>) }}
                      disabled={!hasTel}
                      title="Envoyer un message WhatsApp"
                      className="p-2 rounded-xl transition-colors disabled:opacity-30 hover:bg-green-100 text-green-600 shrink-0">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </svg>
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right — message composer */}
          <div className="flex flex-col gap-4">
            <div className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-4">
              <h3 className="font-bold text-foreground text-sm">Composer le message / كتابة الرسالة</h3>

              {/* Modele picker — filtered by cible */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-foreground">Modele / النموذج</label>
                <p className="text-[10px] text-muted-foreground">Messages bilingues (FR+AR) adaptes au destinataire</p>
                <div className="flex flex-col gap-1">
                  {(Object.keys(MODELES) as ModeleType[])
                    .filter(k => MODELES[k].cibles.includes(cible))
                    .map(k => (
                    <button key={k} onClick={() => setModele(k)}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium border transition-all ${modele === k ? "border-green-400 bg-green-50 text-green-800" : "border-border bg-background text-muted-foreground hover:text-foreground"}`}>
                      <span>{MODELES[k].label}</span>
                      <span className="text-[10px] opacity-60" dir="rtl">{MODELES[k].labelAr}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* BL Picker — link to a specific BL */}
              {(modele === "livraison_en_cours" || modele === "retard" || modele === "facture" || modele === "relance_paiement" || modele === "commande_confirmee") && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Lier un BL / ربط وصل تسليم
                    <span className="text-[10px] font-normal text-muted-foreground mr-1"> (optionnel — injecte N° BL et montant)</span>
                  </label>
                  {selectedBL ? (
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-green-300 bg-green-50">
                      <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-green-800 truncate">BL {selectedBL.id}</p>
                        <p className="text-[10px] text-green-600">
                          {selectedBL.clientNom} — {selectedBL.montantTTC.toLocaleString("fr-MA")} DH
                        </p>
                      </div>
                      <button onClick={() => setSelectedBL(null)}
                        className="p-1 rounded-lg text-red-400 hover:bg-red-50 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <button onClick={() => setShowBLPicker(p => !p)}
                        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-muted-foreground hover:border-primary/40 transition-colors">
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Choisir un BL... / اختر وصل التسليم
                      </button>
                      {showBLPicker && (
                        <div className="absolute top-full left-0 right-0 mt-1 z-40 bg-card border border-border rounded-xl shadow-2xl overflow-hidden" style={{ maxHeight: 280 }}>
                          <div className="p-2 border-b border-border">
                            <input value={blSearch} onChange={e => setBlSearch(e.target.value)}
                              placeholder="Rechercher BL par client ou N°..."
                              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary" />
                          </div>
                          <div className="overflow-y-auto" style={{ maxHeight: 200 }}>
                            {bonsLivraison
                              .filter(bl => bl.clientNom.toLowerCase().includes(blSearch.toLowerCase()) || bl.id.toLowerCase().includes(blSearch.toLowerCase()))
                              .slice(0, 30)
                              .map(bl => (
                                <button key={bl.id}
                                  onClick={() => { setSelectedBL(bl); setShowBLPicker(false); setBlSearch("") }}
                                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted transition-colors border-b border-border/30 last:border-b-0">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-foreground truncate">{bl.id}</p>
                                    <p className="text-[10px] text-muted-foreground">{bl.clientNom} — {bl.date}</p>
                                  </div>
                                  <span className="text-xs font-bold text-emerald-600 shrink-0">{bl.montantTTC.toLocaleString("fr-MA")} DH</span>
                                </button>
                              ))}
                            {bonsLivraison.filter(bl => bl.clientNom.toLowerCase().includes(blSearch.toLowerCase()) || bl.id.toLowerCase().includes(blSearch.toLowerCase())).length === 0 && (
                              <p className="text-xs text-muted-foreground text-center py-6">Aucun BL trouvé</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Retard hours — only for retard model */}
              {modele === "retard" && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Heure de retard estimée / عدد ساعات التأخير
                  </label>
                  <div className="flex gap-2">
                    {["0.5", "1", "1.5", "2", "3", "4"].map(h => (
                      <button key={h} type="button"
                        onClick={() => setRetardHeures(retardHeures === h ? "" : h)}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${retardHeures === h ? "border-orange-400 bg-orange-50 text-orange-700" : "border-border bg-background text-muted-foreground hover:border-orange-300"}`}>
                        {h}h
                      </button>
                    ))}
                  </div>
                  <input value={retardHeures} onChange={e => setRetardHeures(e.target.value)}
                    placeholder="Saisir un nombre d'heures custom... / عدد الساعات"
                    className="px-3 py-2 rounded-xl border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary" />
                  {retardHeures && (
                    <p className="text-[10px] text-orange-600 flex items-center gap-1">
                      <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Nous serons en retard de {retardHeures} heure{Number(retardHeures) > 1 ? "s" : ""}
                      {" / "}سيكون هناك تأخير بمقدار {retardHeures} ساعة
                    </p>
                  )}
                </div>
              )}

              {/* Extra / Ref field for non-custom models */}
              {modele !== "custom" && modele !== "retard" && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    {modele === "facture" || modele === "relance_paiement" ? "Montant / Ref (DH ou N°)" :
                     modele === "commande_confirmee" ? "N° Commande (optionnel)" :
                     modele === "livraison_en_cours" ? "Zone / Info (optionnel)" :
                     "Detail supplementaire (optionnel)"}
                  </label>
                  <input value={extra} onChange={e => setExtra(e.target.value)}
                    placeholder={
                      modele === "facture" ? "1 250.00 DH" :
                      modele === "commande_confirmee" ? "CMD-2025-001" :
                      "Details..."
                    }
                    className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              )}
              {modele === "retard" && !retardHeures && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-foreground">Raison / Zone (optionnel)</label>
                  <input value={extra} onChange={e => setExtra(e.target.value)}
                    placeholder="Ex: problème transport, zone concernée..."
                    className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              )}

              {/* Custom texte libre */}
              {modele === "custom" && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Message libre — utilisez <code className="bg-muted px-1 rounded">{"{nom}"}</code> pour le prenom
                  </label>
                  <textarea value={texteCustom} onChange={e => setTexteCustom(e.target.value)}
                    rows={6}
                    placeholder={"Bonjour {nom},\n\nVotre message ici (FR + AR)...\n\n— Vita Fresh"}
                    className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-sans focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
                </div>
              )}

              {/* Live preview — bilingual */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-muted-foreground">Apercu live / معاينة</label>
                  <span className="text-[10px] text-muted-foreground">Pour : <strong>{previewNom}</strong> ({cible})</span>
                </div>
                <div className="bg-[#ECF3E1] rounded-xl p-4 text-xs text-gray-800 font-sans whitespace-pre-wrap leading-relaxed border border-green-200 max-h-56 overflow-y-auto">
                  {previewText}
                </div>
              </div>

              {/* Send button */}
              <div className="flex flex-col gap-2">
                {selected.size > 0 && (
                  <button onClick={handleSendSelected} disabled={sending}
                    className="w-full py-3 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
                    style={{ background: "#25D366" }}>
                    {sending
                      ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Envoi {sent}/{selected.size}...</>
                      : <>
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                          Envoyer a {selected.size} contact{selected.size > 1 ? "s" : ""}
                        </>
                    }
                  </button>
                )}
                {selected.size === 0 && (
                  <p className="text-xs text-center text-muted-foreground py-2">
                    Selectionnez des contacts pour envoyer en masse,<br/>ou cliquez sur l'icone WhatsApp d'un contact.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Communautés — chaîne + groupes officiels Vita Fresh */}
      {onglet === "communautes" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Chaîne et groupes WhatsApp officiels Vita Fresh — accès rapide pour toute l&apos;équipe.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {COMMUNAUTES.map(c => (
              <div key={c.id} className="flex flex-col gap-2 p-4 rounded-2xl border border-border bg-card">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{c.icon}</span>
                  <div className="min-w-0">
                    <p className="font-bold text-foreground text-sm truncate">{c.label}</p>
                    <p className="text-[10px] text-muted-foreground truncate" dir="rtl">{c.labelAr}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed flex-1">{c.desc}</p>
                <a href={c.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-white text-xs font-bold hover:opacity-90 transition-opacity"
                  style={{ background: "#25D366" }}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Ouvrir
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Historique */}
      {onglet === "historique" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{logs.length} message{logs.length !== 1 ? "s" : ""} envoye{logs.length !== 1 ? "s" : ""}</p>
            {logs.length > 0 && (
              <button onClick={() => { localStorage.removeItem("fl_whatsapp_logs"); setLogs([]) }}
                className="text-xs text-red-500 hover:text-red-700 underline underline-offset-2">
                Effacer l'historique
              </button>
            )}
          </div>

          {logs.length === 0 && (
            <div className="text-center py-16 text-muted-foreground text-sm">Aucun message envoye pour l&apos;instant.</div>
          )}

          {logs.map(log => (
            <div key={log.id} className="bg-card border border-border rounded-xl p-4 flex items-start gap-4">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                style={{ background: "#25D366" }}>
                {log.nom[0]?.toUpperCase() || "?"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-foreground text-sm">{log.nom}</span>
                  <span className="text-xs text-muted-foreground">{log.telephone}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground capitalize">{log.cible}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: "#ECF3E1", color: "#25D366" }}>{MODELES[log.modele]?.label || log.modele}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{log.texte}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {new Date(log.date).toLocaleDateString("fr-MA", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <button
                onClick={() => openWhatsApp(log.telephone, log.texte)}
                title="Renvoyer ce message"
                className="p-2 rounded-xl hover:bg-green-50 text-green-600 shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
