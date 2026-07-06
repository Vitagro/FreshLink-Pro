"use client"

import { useState } from "react"

const LANG_LABELS = {
  fr: { title: "Dossier Investisseur", sub: "FreshLink Pro — Vita Fresh Distribution" },
  en: { title: "Investor Dossier", sub: "FreshLink Pro — Vita Fresh Distribution" },
  ar: { title: "ملف المستثمر", sub: "فريشلينك برو — توزيع فيتا فريش" },
}

type Lang = "fr" | "en" | "ar"

const SECTIONS = [
  {
    id: "summary",
    icon: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    color: "bg-emerald-100 text-emerald-700",
    border: "border-emerald-200",
    label: { fr: "Résumé Exécutif", en: "Executive Summary", ar: "الملخص التنفيذي" },
    content: {
      fr: [
        { tag: "Vision", text: "FreshLink Pro est la première plateforme ERP tout-en-un dédiée à la distribution de fruits et légumes au Maroc, développée par et pour les opérateurs locaux." },
        { tag: "Traction", text: "Déjà déployée chez Vita Fresh Distribution (Casablanca), l'application gère en temps réel : commandes terrain, stock, logistique, finance et agents IA commerciaux." },
        { tag: "Modèle", text: "SaaS B2B modulaire — abonnement mensuel par utilisateur. Premier client actif. Expansion prévue vers 50+ distributeurs au Maroc dès 2026." },
        { tag: "Levée", text: "Recherche de 2 à 5 M MAD (seed) pour accélérer la commercialisation, l'équipe commerciale et l'hébergement cloud." },
      ],
      en: [
        { tag: "Vision", text: "FreshLink Pro is Morocco's first all-in-one ERP platform dedicated to fruit & vegetable distribution, built by and for local operators." },
        { tag: "Traction", text: "Already live at Vita Fresh Distribution (Casablanca), managing in real-time: field orders, stock, logistics, finance, and AI commercial agents." },
        { tag: "Model", text: "Modular B2B SaaS — monthly per-user subscription. First active client. Expansion target: 50+ Moroccan distributors by 2026." },
        { tag: "Raise", text: "Seeking 2–5 M MAD (seed) to accelerate commercialization, sales team, and cloud infrastructure." },
      ],
      ar: [
        { tag: "الرؤية", text: "فريشلينك برو هو أول منصة ERP متكاملة مخصصة لتوزيع الفواكه والخضروات في المغرب، مصممة من قبل المشغلين المحليين ولأجلهم." },
        { tag: "الانجاز", text: "تعمل بالفعل لدى فيتا فريش للتوزيع (الدار البيضاء)، وتدير في الوقت الفعلي: الطلبات الميدانية، والمخزون، والخدمات اللوجستية، والمالية، ووكلاء الذكاء الاصطناعي التجاري." },
        { tag: "النموذج", text: "SaaS B2B معياري — اشتراك شهري لكل مستخدم. أول عميل نشط. التوسع المستهدف: 50+ موزعاً مغربياً بحلول 2026." },
        { tag: "جمع التمويل", text: "البحث عن 2-5 مليون درهم (seed) لتسريع التسويق وفريق المبيعات والبنية التحتية السحابية." },
      ],
    },
  },
  {
    id: "problem",
    icon: "M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z",
    color: "bg-red-100 text-red-700",
    border: "border-red-200",
    label: { fr: "Le Problème", en: "The Problem", ar: "المشكلة" },
    content: {
      fr: [
        { tag: "Marché fragmenté", text: "Le secteur F&V marocain (30+ Mds MAD/an) fonctionne encore principalement sur papier, WhatsApp et feuilles Excel. Aucun outil adapté à la réalité terrain." },
        { tag: "Perte d'efficacité", text: "30 à 40% des commandes terrain sont mal saisies, les retours non tracés, les stocks mal synchronisés. La finance est réconciliée manuellement chaque soir." },
        { tag: "Zéro visibilité", text: "Le manager ne sait pas, en temps réel, combien de commandes ont été prises, où sont les livreurs, ni quel stock reste en entrepôt." },
        { tag: "Solutions inadaptées", text: "Les ERP génériques (Odoo, SAP) coûtent 5 000–50 000 MAD/mois, nécessitent 6–12 mois d'implémentation, et ne comprennent pas la logique F&V marocaine." },
      ],
      en: [
        { tag: "Fragmented market", text: "Morocco's F&V sector (30+ B MAD/year) still runs mainly on paper, WhatsApp, and Excel. No tool adapted to field reality." },
        { tag: "Efficiency losses", text: "30–40% of field orders are incorrectly entered, returns untracked, stock poorly synced. Finance reconciled manually each evening." },
        { tag: "Zero visibility", text: "The manager doesn't know in real-time how many orders were taken, where drivers are, or what stock remains in the warehouse." },
        { tag: "Unsuitable solutions", text: "Generic ERPs (Odoo, SAP) cost 5,000–50,000 MAD/month, require 6–12 months to implement, and don't understand Moroccan F&V logic." },
      ],
      ar: [
        { tag: "سوق مجزأ", text: "قطاع الفواكه والخضروات في المغرب (أكثر من 30 مليار درهم/سنة) لا يزال يعمل بشكل رئيسي على الورق وواتساب وExcel. لا توجد أداة مناسبة للواقع الميداني." },
        { tag: "فقدان الكفاءة", text: "30-40% من الطلبات الميدانية مدخلة بشكل خاطئ، والمرتجعات غير مُتتبعة، والمخزون غير متزامن. التمويل يُقرأ يدوياً كل مساء." },
        { tag: "صفر رؤية", text: "المدير لا يعرف في الوقت الفعلي كم طلباً تم استلامه، أين السائقون، وما المخزون المتبقي في المستودع." },
        { tag: "حلول غير مناسبة", text: "ERP العامة (Odoo، SAP) تكلف 5,000-50,000 درهم/شهر، وتحتاج 6-12 شهراً للتنفيذ، ولا تفهم منطق الفواكه والخضروات المغربي." },
      ],
    },
  },
  {
    id: "solution",
    icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
    color: "bg-blue-100 text-blue-700",
    border: "border-blue-200",
    label: { fr: "La Solution", en: "The Solution", ar: "الحل" },
    content: {
      fr: [
        { tag: "Application mobile terrain", text: "Prise de commande GPS, habitudes clients, catalogue articles, bon de livraison, agents IA de vente — tout depuis le smartphone du prévendeur." },
        { tag: "Back-office intelligent", text: "Dashboard temps réel, gestion stock, dispatch & tournées, finance, recouvrement, bons d'achat/livraison, PDF automatiques, WhatsApp intégré." },
        { tag: "7 Agents IA spécialisés", text: "ZIZI Prospection, Mustapha Dispatch, Jawad Finance, Hicham Logistique, Azmi Stock, ASHEL Market Intel, Ourai Ops — chaque agent parle la darija ET le français." },
        { tag: "100% Made for Morocco", text: "Interface bilingue FR/AR, unités marocaines, délais de recouvrement locaux, secteurs géographiques Casablanca, format bon de livraison DGI-compatible." },
      ],
      en: [
        { tag: "Mobile field app", text: "GPS order entry, client habits, article catalogue, delivery note, AI sales agents — all from the salesperson's smartphone." },
        { tag: "Smart back-office", text: "Real-time dashboard, stock management, dispatch & routing, finance, recovery, purchase/delivery notes, auto PDFs, integrated WhatsApp." },
        { tag: "7 Specialized AI agents", text: "ZIZI Prospection, Mustapha Dispatch, Jawad Finance, Hicham Logistics, Azmi Stock, ASHEL Market Intel, Ourai Ops — each agent speaks Darija AND French." },
        { tag: "100% Made for Morocco", text: "Bilingual FR/AR interface, Moroccan units, local recovery delays, Casablanca geographic sectors, DGI-compatible delivery note format." },
      ],
      ar: [
        { tag: "تطبيق الميدان المتنقل", text: "أخذ الطلبات بالـGPS، عادات العملاء، كتالوج المواد، وصل التسليم، وكلاء مبيعات بالذكاء الاصطناعي — كل ذلك من هاتف البائع الذكي." },
        { tag: "مكتب خلفي ذكي", text: "لوحة تحكم في الوقت الفعلي، إدارة المخزون، التوزيع والجولات، المالية، التحصيل، وصولات الشراء/التسليم، PDF تلقائية، واتساب مدمج." },
        { tag: "7 وكلاء ذكاء اصطناعي متخصصون", text: "ZIZI للتسويق، مصطفى للتوزيع، جواد للمالية، هشام للخدمات اللوجستية، عزمي للمخزون، ASHEL لاستخبارات السوق، Ourai للعمليات." },
        { tag: "100% صُنع للمغرب", text: "واجهة ثنائية اللغة FR/AR، وحدات مغربية، فترات تحصيل محلية، مناطق جغرافية الدار البيضاء، تنسيق وصل التسليم متوافق مع DGI." },
      ],
    },
  },
  {
    id: "market",
    icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
    color: "bg-violet-100 text-violet-700",
    border: "border-violet-200",
    label: { fr: "Marché & Opportunité", en: "Market & Opportunity", ar: "السوق والفرصة" },
    content: {
      fr: [
        { tag: "TAM — 30+ Mds MAD", text: "Le marché total de la distribution F&V au Maroc. Plus de 3 500 grossistes actifs, 1 200+ points de vente professionnels à Casablanca seule." },
        { tag: "SAM — 3 Mds MAD", text: "Grossistes moyens (10–100 livreurs) cherchant à digitaliser. Environ 350–500 entreprises adressables immédiatement." },
        { tag: "SOM — 150 M MAD/an", text: "Objectif réaliste 3 ans : 50 clients SaaS à 500 MAD/user/mois × 10 utilisateurs = 250 000 MAD/mois = 3 M MAD/an." },
        { tag: "Catalyseur", text: "Pression croissante de l'administration fiscale marocaine pour la traçabilité numérique. Obligation DGI prévue 2025–2026. Timing parfait." },
      ],
      en: [
        { tag: "TAM — 30+ B MAD", text: "Total Moroccan F&V distribution market. Over 3,500 active wholesalers, 1,200+ professional outlets in Casablanca alone." },
        { tag: "SAM — 3 B MAD", text: "Mid-size wholesalers (10–100 drivers) seeking digitalization. ~350–500 immediately addressable companies." },
        { tag: "SOM — 150 M MAD/yr", text: "Realistic 3-year target: 50 SaaS clients at 500 MAD/user/month × 10 users = 250K MAD/month = 3M MAD/year." },
        { tag: "Catalyst", text: "Growing pressure from Moroccan tax authorities for digital traceability. DGI obligation expected 2025–2026. Perfect timing." },
      ],
      ar: [
        { tag: "TAM — أكثر من 30 مليار درهم", text: "إجمالي سوق توزيع الفواكه والخضروات في المغرب. أكثر من 3500 تاجر جملة نشط، وأكثر من 1200 نقطة بيع مهنية في الدار البيضاء وحدها." },
        { tag: "SAM — 3 مليار درهم", text: "تجار الجملة المتوسطون (10-100 سائق) الساعون إلى الرقمنة. حوالي 350-500 شركة قابلة للاستهداف فوراً." },
        { tag: "SOM — 150 مليون درهم/سنة", text: "هدف واقعي لمدة 3 سنوات: 50 عميل SaaS بسعر 500 درهم/مستخدم/شهر × 10 مستخدمين = 250 ألف درهم/شهر = 3 ملايين درهم/سنة." },
        { tag: "المحفز", text: "ضغط متزايد من إدارة الضرائب المغربية على إمكانية التتبع الرقمي. إلزامية DGI متوقعة 2025-2026. توقيت مثالي." },
      ],
    },
  },
  {
    id: "business",
    icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 11v-1m0-8h.01M20 12a8 8 0 11-16 0 8 8 0 0116 0z",
    color: "bg-amber-100 text-amber-700",
    border: "border-amber-200",
    label: { fr: "Modèle Économique", en: "Business Model", ar: "النموذج الاقتصادي" },
    content: {
      fr: [
        { tag: "SaaS mensuel", text: "500 MAD/user/mois — offre Starter (5 users), Growth (15 users), Enterprise (illimité). Facturation annuelle avec remise 20%." },
        { tag: "Onboarding & Formation", text: "Frais uniques de 3 000–10 000 MAD pour setup, migration données, formation équipe. Prestation à forte marge." },
        { tag: "Agents IA à la demande", text: "Abonnement IA Premium (+200 MAD/user/mois) pour accès illimité aux 7 agents IA métier et aux rapports prédictifs." },
        { tag: "Intégrations tierces", text: "Connexion Supabase, Google Sheets, WhatsApp Business API. Revenu additionnel sur intégrations sur-mesure (5 000–20 000 MAD)." },
      ],
      en: [
        { tag: "Monthly SaaS", text: "500 MAD/user/month — Starter (5 users), Growth (15 users), Enterprise (unlimited). Annual billing with 20% discount." },
        { tag: "Onboarding & Training", text: "One-time fee of 3,000–10,000 MAD for setup, data migration, team training. High-margin service." },
        { tag: "AI Agents on demand", text: "AI Premium subscription (+200 MAD/user/month) for unlimited access to 7 specialized AI agents and predictive reports." },
        { tag: "Third-party integrations", text: "Supabase, Google Sheets, WhatsApp Business API connections. Additional revenue from custom integrations (5,000–20,000 MAD)." },
      ],
      ar: [
        { tag: "SaaS شهري", text: "500 درهم/مستخدم/شهر — Starter (5 مستخدمين)، Growth (15 مستخدماً)، Enterprise (غير محدود). فوترة سنوية بخصم 20%." },
        { tag: "الإعداد والتدريب", text: "رسوم لمرة واحدة من 3,000-10,000 درهم للإعداد وترحيل البيانات وتدريب الفريق. خدمة بهامش ربح عالٍ." },
        { tag: "وكلاء الذكاء الاصطناعي عند الطلب", text: "اشتراك AI Premium (+200 درهم/مستخدم/شهر) للوصول غير المحدود إلى 7 وكلاء ذكاء اصطناعي متخصصين وتقارير تنبؤية." },
        { tag: "تكاملات الطرف الثالث", text: "اتصالات Supabase وGoogle Sheets وواتساب Business API. دخل إضافي من التكاملات المخصصة (5,000-20,000 درهم)." },
      ],
    },
  },
  {
    id: "roadmap",
    icon: "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7",
    color: "bg-sky-100 text-sky-700",
    border: "border-sky-200",
    label: { fr: "Roadmap", en: "Roadmap", ar: "خارطة الطريق" },
    content: {
      fr: [
        { tag: "Q2 2026 — Production", text: "Migration complète vers Supabase cloud. Déploiement mobile iOS/Android via PWA. Premier client Enterprise signé." },
        { tag: "Q3 2026 — Expansion", text: "5 clients actifs Casablanca. Lancement offre Grand Casablanca. Recrutement équipe commerciale (2 BDM)." },
        { tag: "Q4 2026 — Scale national", text: "Ouverture Marrakech, Fès, Agadir. 15+ clients. Partenariat avec FENAGRI (Fédération Nationale Agroalimentaire)." },
        { tag: "2027 — Régional", text: "Expansion Afrique francophone (Sénégal, Côte d'Ivoire). Levée Série A 15–30 M MAD. 100+ clients actifs." },
      ],
      en: [
        { tag: "Q2 2026 — Production", text: "Full migration to Supabase cloud. Mobile iOS/Android via PWA. First Enterprise client signed." },
        { tag: "Q3 2026 — Expansion", text: "5 active Casablanca clients. Grand Casablanca offer launch. Sales team recruitment (2 BDMs)." },
        { tag: "Q4 2026 — National scale", text: "Opening Marrakech, Fez, Agadir. 15+ clients. Partnership with FENAGRI (National Agri-Food Federation)." },
        { tag: "2027 — Regional", text: "French-speaking Africa expansion (Senegal, Ivory Coast). Series A 15–30M MAD. 100+ active clients." },
      ],
      ar: [
        { tag: "Q2 2026 — الإنتاج", text: "الترحيل الكامل إلى Supabase السحابي. النشر على iOS/Android عبر PWA. توقيع أول عميل Enterprise." },
        { tag: "Q3 2026 — التوسع", text: "5 عملاء نشطين في الدار البيضاء. إطلاق عرض الكازابلانكا الكبرى. تجنيد فريق المبيعات (2 BDM)." },
        { tag: "Q4 2026 — الحجم الوطني", text: "الافتتاح في مراكش وفاس وأكادير. 15+ عميل. شراكة مع FENAGRI." },
        { tag: "2027 — الإقليمي", text: "التوسع في أفريقيا الفرانكوفونية (السنغال، ساحل العاج). جولة Series A من 15-30 مليون درهم. 100+ عميل نشط." },
      ],
    },
  },
  {
    id: "ask",
    icon: "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z",
    color: "bg-rose-100 text-rose-700",
    border: "border-rose-200",
    label: { fr: "Notre Demande", en: "Our Ask", ar: "طلبنا" },
    content: {
      fr: [
        { tag: "Montant recherché", text: "2 000 000 à 5 000 000 MAD — Round Seed. Ticket minimum 250 000 MAD. Structure : obligations convertibles ou participation minoritaire au choix." },
        { tag: "Utilisation des fonds", text: "40% Infrastructure cloud & sécurité (Supabase prod, CDN, monitoring). 35% Équipe commerciale & marketing. 15% R&D IA avancée. 10% Opérations & légal." },
        { tag: "Retour attendu", text: "Break-even prévu M+18. MRR de 500 000 MAD projeté à 24 mois. Exit possible par acquisition stratégique (Fintech marocaine, ERP régional)." },
        { tag: "Contact", text: "Jawad — Fondateur & CEO | +212 663 898 707 | jawad@VitaFresh.ma | Casablanca, Maroc" },
      ],
      en: [
        { tag: "Amount sought", text: "2,000,000 to 5,000,000 MAD — Seed Round. Minimum ticket 250,000 MAD. Structure: convertible notes or minority stake, your choice." },
        { tag: "Use of funds", text: "40% Cloud infrastructure & security (Supabase prod, CDN, monitoring). 35% Sales team & marketing. 15% Advanced AI R&D. 10% Operations & legal." },
        { tag: "Expected return", text: "Break-even expected M+18. MRR of 500K MAD projected at 24 months. Exit possible via strategic acquisition (Moroccan Fintech, regional ERP)." },
        { tag: "Contact", text: "Jawad — Founder & CEO | +212 663 898 707 | jawad@VitaFresh.ma | Casablanca, Morocco" },
      ],
      ar: [
        { tag: "المبلغ المطلوب", text: "من 2,000,000 إلى 5,000,000 درهم — جولة Seed. الحد الأدنى للتذكرة 250,000 درهم. الهيكل: سندات قابلة للتحويل أو حصة أقلية حسب الاختيار." },
        { tag: "استخدام الأموال", text: "40% البنية التحتية السحابية والأمان. 35% فريق المبيعات والتسويق. 15% بحث وتطوير الذكاء الاصطناعي المتقدم. 10% العمليات والقانوني." },
        { tag: "العائد المتوقع", text: "التعادل متوقع في M+18. MRR من 500,000 درهم متوقع في 24 شهراً. الخروج ممكن عبر الاستحواذ الاستراتيجي." },
        { tag: "التواصل", text: "جواد — المؤسس والرئيس التنفيذي | +212 663 898 707 | jawad@VitaFresh.ma | الدار البيضاء، المغرب" },
      ],
    },
  },
]

const METRICS = [
  { value: "30+", unit: "Mds MAD", label: { fr: "Marché total Maroc", en: "Total Moroccan market", ar: "إجمالي السوق المغربي" }, color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
  { value: "3 500+", unit: "", label: { fr: "Grossistes cibles", en: "Target wholesalers", ar: "تجار الجملة المستهدفون" }, color: "bg-blue-50 border-blue-200 text-blue-700" },
  { value: "7", unit: "IA", label: { fr: "Agents métier IA", en: "Specialized AI agents", ar: "وكلاء ذكاء اصطناعي" }, color: "bg-violet-50 border-violet-200 text-violet-700" },
  { value: "500", unit: "MAD", label: { fr: "Prix / user / mois", en: "Price / user / month", ar: "السعر / مستخدم / شهر" }, color: "bg-amber-50 border-amber-200 text-amber-700" },
  { value: "2–5M", unit: "MAD", label: { fr: "Levée de fonds Seed", en: "Seed fundraise", ar: "جمع التمويل الأولي" }, color: "bg-rose-50 border-rose-200 text-rose-700" },
  { value: "M+18", unit: "", label: { fr: "Break-even prévu", en: "Expected break-even", ar: "التعادل المتوقع" }, color: "bg-sky-50 border-sky-200 text-sky-700" },
]

export default function BOInvestissement() {
  const [lang, setLang] = useState<Lang>("fr")
  const [openSection, setOpenSection] = useState<string | null>("summary")

  const L = LANG_LABELS[lang]

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">

      {/* Header */}
      <div className="bg-gradient-to-br from-[#0a1f14] to-[#1a4f2a] rounded-2xl p-6 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #4ADE80 1px, transparent 0)", backgroundSize: "20px 20px" }} />
        <div className="absolute -top-16 -right-10 w-48 h-48 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #4ADE80 0%, transparent 70%)" }} />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-10 h-10 rounded-xl bg-green-400/20 border border-green-400/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-green-400">Investment Dossier</span>
            </div>
            <h1 className="text-2xl font-black text-white leading-tight">{L.title}</h1>
            <p className="text-green-300 text-sm mt-1">{L.sub}</p>
            <div className="flex items-center gap-2 mt-3">
              <span className="text-[10px] px-2 py-1 rounded-full bg-green-400/15 border border-green-400/30 text-green-300 font-semibold">Seed Round 2026</span>
              <span className="text-[10px] px-2 py-1 rounded-full bg-white/10 border border-white/20 text-white/70 font-semibold">Confidentiel</span>
            </div>
          </div>
          {/* Language switcher */}
          <div className="flex gap-1 shrink-0">
            {(["fr", "ar", "en"] as Lang[]).map(l => (
              <button key={l} onClick={() => setLang(l)}
                className={`w-8 h-8 rounded-lg text-sm flex items-center justify-center font-bold transition-all ${lang === l ? "bg-green-400 text-green-900" : "bg-white/10 text-white/60 hover:bg-white/20"}`}>
                {l === "fr" ? "🇫🇷" : l === "ar" ? "🇲🇦" : "🇬🇧"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {METRICS.map(m => (
          <div key={m.value} className={`rounded-xl border p-3 flex flex-col items-center text-center ${m.color}`}>
            <p className="text-xl font-black leading-none">{m.value} <span className="text-xs font-bold">{m.unit}</span></p>
            <p className="text-[10px] font-semibold mt-1 leading-tight">{m.label[lang]}</p>
          </div>
        ))}
      </div>

      {/* Accordion sections */}
      <div className="flex flex-col gap-3">
        {SECTIONS.map(sec => {
          const isOpen = openSection === sec.id
          return (
            <div key={sec.id} className={`rounded-xl border bg-card overflow-hidden transition-all ${isOpen ? sec.border : "border-border"}`}>
              <button
                onClick={() => setOpenSection(isOpen ? null : sec.id)}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/40 transition-colors">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${sec.color}`}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={sec.icon} />
                  </svg>
                </div>
                <span className="flex-1 text-sm font-bold text-foreground">{sec.label[lang]}</span>
                <svg className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isOpen && (
                <div className="px-4 pb-4 flex flex-col gap-3">
                  {sec.content[lang].map((item, i) => (
                    <div key={i} className="flex gap-3">
                      <span className={`text-[10px] font-black px-2 py-1 rounded-lg shrink-0 self-start mt-0.5 ${sec.color}`}>
                        {item.tag}
                      </span>
                      <p className="text-sm text-foreground leading-relaxed">{item.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* CTA */}
      <div className="bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-2xl p-6 flex flex-col sm:flex-row items-center gap-4 justify-between">
        <div>
          <p className="text-sm font-black text-emerald-800">
            {lang === "fr" ? "Prêt à discuter ?" : lang === "en" ? "Ready to discuss?" : "هل أنت مستعد للتحدث؟"}
          </p>
          <p className="text-xs text-emerald-600 mt-0.5">
            {lang === "fr" ? "Rencontrez l'équipe fondatrice à Casablanca" : lang === "en" ? "Meet the founding team in Casablanca" : "قابل الفريق المؤسس في الدار البيضاء"}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <a href="tel:+212663898707"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
            +212 663 898 707
          </a>
          <a href={`https://wa.me/212663898707?text=${encodeURIComponent("Bonjour Jawad, je souhaite en savoir plus sur FreshLink Pro — dossier investisseur.")}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-500 text-white text-xs font-bold hover:bg-green-600 transition-colors">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347" /></svg>
            WhatsApp
          </a>
        </div>
      </div>

      {/* Footer note */}
      <p className="text-[10px] text-muted-foreground text-center pb-2">
        {lang === "fr"
          ? "Document confidentiel — FreshLink Pro © 2026 Vita Fresh Distribution. Tous droits réservés."
          : lang === "en"
          ? "Confidential document — FreshLink Pro © 2026 Vita Fresh Distribution. All rights reserved."
          : "وثيقة سرية — فريشلينك برو © 2026 فيتا فريش للتوزيع. جميع الحقوق محفوظة."}
      </p>
    </div>
  )
}
