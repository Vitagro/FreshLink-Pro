"use client"
import { useState, useEffect } from "react"
import { getLang, type AppLang } from "./lang"

// ─────────────────────────────────────────────────────────────────
// DICTIONARY — all UI strings in FR / AR / EN
// ─────────────────────────────────────────────────────────────────

export const T = {
  // ── Common actions ───────────────────────────────────────────
  save:          { fr: "Enregistrer",      ar: "حفظ",            en: "Save" },
  cancel:        { fr: "Annuler",          ar: "إلغاء",           en: "Cancel" },
  confirm:       { fr: "Confirmer",        ar: "تأكيد",           en: "Confirm" },
  delete:        { fr: "Supprimer",        ar: "حذف",             en: "Delete" },
  edit:          { fr: "Modifier",         ar: "تعديل",           en: "Edit" },
  add:           { fr: "Ajouter",          ar: "إضافة",           en: "Add" },
  search:        { fr: "Rechercher",       ar: "بحث",             en: "Search" },
  filter:        { fr: "Filtrer",          ar: "تصفية",           en: "Filter" },
  export:        { fr: "Exporter",         ar: "تصدير",           en: "Export" },
  print:         { fr: "Imprimer",         ar: "طباعة",           en: "Print" },
  download:      { fr: "Télécharger",      ar: "تنزيل",           en: "Download" },
  upload:        { fr: "Téléverser",       ar: "رفع الملف",       en: "Upload" },
  close:         { fr: "Fermer",           ar: "إغلاق",           en: "Close" },
  back:          { fr: "Retour",           ar: "عودة",            en: "Back" },
  next:          { fr: "Suivant",          ar: "التالي",          en: "Next" },
  yes:           { fr: "Oui",              ar: "نعم",             en: "Yes" },
  no:            { fr: "Non",              ar: "لا",              en: "No" },
  loading:       { fr: "Chargement...",    ar: "جارٍ التحميل...",  en: "Loading..." },
  sending:       { fr: "Envoi...",         ar: "إرسال...",         en: "Sending..." },
  success:       { fr: "Succès",           ar: "نجح",             en: "Success" },
  error:         { fr: "Erreur",           ar: "خطأ",             en: "Error" },
  warning:       { fr: "Attention",        ar: "تحذير",           en: "Warning" },
  noData:        { fr: "Aucun résultat",   ar: "لا توجد نتائج",   en: "No results" },
  all:           { fr: "Tous",             ar: "الكل",            en: "All" },
  active:        { fr: "Actif",            ar: "نشط",             en: "Active" },
  inactive:      { fr: "Inactif",          ar: "غير نشط",         en: "Inactive" },
  validate:      { fr: "Valider",          ar: "تصديق",           en: "Validate" },
  refresh:       { fr: "Actualiser",       ar: "تحديث",           en: "Refresh" },
  details:       { fr: "Détails",          ar: "التفاصيل",        en: "Details" },
  actions:       { fr: "Actions",          ar: "الإجراءات",       en: "Actions" },
  status:        { fr: "Statut",           ar: "الحالة",          en: "Status" },
  date:          { fr: "Date",             ar: "التاريخ",         en: "Date" },
  total:         { fr: "Total",            ar: "المجموع",         en: "Total" },
  amount:        { fr: "Montant",          ar: "المبلغ",          en: "Amount" },
  quantity:      { fr: "Quantité",         ar: "الكمية",          en: "Quantity" },
  price:         { fr: "Prix",             ar: "السعر",           en: "Price" },
  name:          { fr: "Nom",              ar: "الاسم",           en: "Name" },
  email:         { fr: "Email",            ar: "البريد الإلكتروني", en: "Email" },
  phone:         { fr: "Téléphone",        ar: "الهاتف",          en: "Phone" },
  address:       { fr: "Adresse",          ar: "العنوان",         en: "Address" },
  city:          { fr: "Ville",            ar: "المدينة",         en: "City" },
  notes:         { fr: "Notes",            ar: "ملاحظات",         en: "Notes" },
  new:           { fr: "Nouveau",          ar: "جديد",            en: "New" },
  type:          { fr: "Type",             ar: "النوع",           en: "Type" },
  role:          { fr: "Rôle",             ar: "الدور",           en: "Role" },
  password:      { fr: "Mot de passe",     ar: "كلمة المرور",     en: "Password" },
  language:      { fr: "Langue",           ar: "اللغة",           en: "Language" },

  // ── Navigation groups ────────────────────────────────────────
  "nav.analytics":    { fr: "Analyse & KPI",           ar: "التحليل والأداء",        en: "Analytics & KPI" },
  "nav.purchases":    { fr: "Achat",                   ar: "المشتريات",              en: "Purchases" },
  "nav.commercial":   { fr: "Commercial",               ar: "التجاري",               en: "Commercial" },
  "nav.logistics":    { fr: "Logistique",               ar: "اللوجستيك",              en: "Logistics" },
  "nav.data":         { fr: "Données",                  ar: "البيانات",               en: "Data" },
  "nav.documents":    { fr: "Documents CHR",            ar: "الوثائق التجارية",       en: "CHR Documents" },
  "nav.portal":       { fr: "Portail Externe",          ar: "البوابة الخارجية",       en: "External Portal" },
  "nav.comms":        { fr: "Communication",            ar: "التواصل",               en: "Communication" },
  "nav.ai":           { fr: "Agents IA & GPS",          ar: "عملاء الذكاء",           en: "AI Agents & GPS" },
  "nav.feedback":     { fr: "Avis & Retours",           ar: "الآراء والتقييمات",      en: "Reviews & Returns" },
  "nav.loyalty":      { fr: "Fidélité & Incentives",    ar: "الولاء والمكافآت",       en: "Loyalty & Incentives" },
  "nav.hr":           { fr: "Ressources Humaines",      ar: "الموارد البشرية",        en: "Human Resources" },
  "nav.admin":        { fr: "Administration",           ar: "الإدارة",               en: "Administration" },
  "nav.settings":     { fr: "Paramètres",               ar: "الإعدادات",              en: "Settings" },
  "nav.investment":   { fr: "Investisseur",             ar: "المستثمر",               en: "Investor" },

  // ── Nav items ────────────────────────────────────────────────
  "nav.recap":         { fr: "Synthèse & Recap",         ar: "الملخص",               en: "Summary & Recap" },
  "nav.finance":       { fr: "Finance & Caisse",          ar: "المالية",              en: "Finance & Cash" },
  "nav.rapport_livr":  { fr: "Rapport Livraison",         ar: "تقرير التوصيل",        en: "Delivery Report" },
  "nav.achat":         { fr: "Bons d'achat",              ar: "وصولات الشراء",        en: "Purchase Orders" },
  "nav.po":            { fr: "Commandes Fournisseurs",    ar: "أوامر الشراء",         en: "Supplier Orders" },
  "nav.fournisseurs":  { fr: "Fournisseurs",              ar: "الموردون",             en: "Suppliers" },
  "nav.reception":     { fr: "Réception Achat",           ar: "الاستلام",             en: "Purchase Receipt" },
  "nav.commandes":     { fr: "Commandes",                 ar: "الطلبيات",             en: "Orders" },
  "nav.affectation":   { fr: "Affectation",               ar: "التوزيع التجاري",      en: "Assignment" },
  "nav.cash":          { fr: "Cash & BL",                 ar: "النقديات",             en: "Cash & Delivery" },
  "nav.stock":         { fr: "Stock & Inventaire",        ar: "المخزون",              en: "Stock & Inventory" },
  "nav.dispatch":      { fr: "Dispatch & Livreurs",       ar: "التوزيع",              en: "Dispatch & Drivers" },
  "nav.preparation":   { fr: "Préparation",               ar: "وصولات التحضير",       en: "Preparation" },
  "nav.retours":       { fr: "Retours",                   ar: "المرتجعات",            en: "Returns" },
  "nav.bon_livr":      { fr: "Bons de Livraison",         ar: "وصولات التوصيل",       en: "Delivery Notes" },
  "nav.articles":      { fr: "Catalogue Produits",        ar: "الفواكه والخضر",       en: "Product Catalog" },
  "nav.clients":       { fr: "Clients & Fournisseurs",    ar: "الزبائن والموردون",    en: "Clients & Suppliers" },
  "nav.devis":         { fr: "Devis & Contrats CHR",      ar: "عروض الأسعار والعقود", en: "Quotes & CHR Contracts" },
  "nav.demandes":      { fr: "Demandes Comptes",          ar: "طلبات الحسابات",       en: "Account Requests" },
  "nav.web_int":       { fr: "Intégration Site Web",      ar: "ربط الموقع الإلكتروني", en: "Web Integration" },
  "nav.permissions":   { fr: "Permissions & Rôles",       ar: "الصلاحيات والأدوار",   en: "Permissions & Roles" },
  "nav.whatsapp":      { fr: "WhatsApp Pro",              ar: "واتساب",               en: "WhatsApp Pro" },
  "nav.agents_ia":     { fr: "Agents IA — Équipe",        ar: "فريق الذكاء الاصطناعي", en: "AI Agent Team" },
  "nav.gps":           { fr: "GPS Livreurs",              ar: "تتبع GPS",              en: "Driver GPS Tracking" },
  "nav.users":         { fr: "Utilisateurs & Rôles",      ar: "المستخدمون",           en: "Users & Roles" },
  "nav.settings_tab":  { fr: "Paramètres",                ar: "الإعدادات",             en: "Settings" },

  // ── Users / Roles ─────────────────────────────────────────────
  "users.title":           { fr: "Gestion des Utilisateurs",      ar: "إدارة المستخدمين",       en: "User Management" },
  "users.add":             { fr: "Nouvel utilisateur",            ar: "مستخدم جديد",            en: "New user" },
  "users.role":            { fr: "Rôle",                          ar: "الدور",                  en: "Role" },
  "users.access":          { fr: "Accès",                         ar: "الوصول",                 en: "Access" },
  "users.rights":          { fr: "Droits",                        ar: "الصلاحيات",              en: "Rights" },
  "users.search":          { fr: "Rechercher un utilisateur...",  ar: "ابحث عن مستخدم...",      en: "Search users..." },
  "users.noUser":          { fr: "Aucun utilisateur trouvé",      ar: "لا يوجد مستخدمون",       en: "No users found" },
  "users.deleteConfirm":   { fr: "Supprimer cet utilisateur ?",   ar: "هل تريد حذف هذا المستخدم؟", en: "Delete this user?" },
  "users.dangerZone":      { fr: "Zone Dangereuse",               ar: "منطقة الخطر",            en: "Danger Zone" },
  "users.resetDemo":       { fr: "Réinitialiser les démos",       ar: "إعادة تعيين الحسابات التجريبية", en: "Reset demo accounts" },
  "users.deleteAll":       { fr: "Supprimer tous les comptes",    ar: "حذف جميع الحسابات",      en: "Delete all accounts" },

  // ── Settings ─────────────────────────────────────────────────
  "settings.title":        { fr: "Paramètres",                    ar: "الإعدادات",              en: "Settings" },
  "settings.company":      { fr: "Entreprise",                    ar: "معلومات الشركة",         en: "Company" },
  "settings.contacts":     { fr: "Contacts & Coordonnées",        ar: "أرقام التواصل والعناوين", en: "Contacts & Coordinates" },
  "settings.process":      { fr: "Process Opérationnel",          ar: "اختيار العملية",         en: "Operational Process" },
  "settings.workflow":     { fr: "Validation commandes",          ar: "الموافقة على الطلبيات",  en: "Order Validation" },
  "settings.emails":       { fr: "Emails & Notifications",        ar: "البريد الإلكتروني",      en: "Emails & Notifications" },
  "settings.emailjs":      { fr: "EmailJS (SMTP)",                ar: "إعداد البريد",           en: "EmailJS (SMTP)" },
  "settings.motifs":       { fr: "Motifs retour",                 ar: "أسباب الإرجاع",          en: "Return Reasons" },
  "settings.contenants":   { fr: "Poids contenants",              ar: "أوزان الحاويات",         en: "Container Weights" },
  "settings.dataguard":    { fr: "DataGuard",                     ar: "حماية البيانات",         en: "DataGuard" },
  "settings.ai":           { fr: "IA & Modèles",                  ar: "الذكاء الاصطناعي",       en: "AI & Models" },
  "settings.alertes":      { fr: "Alertes Email",                 ar: "تنبيهات البريد",         en: "Email Alerts" },
  "settings.transport":    { fr: "Transporteurs",                 ar: "شركات النقل",            en: "Carriers" },

  // ── Status labels ────────────────────────────────────────────
  "status.pending":    { fr: "En attente",   ar: "في الانتظار",    en: "Pending" },
  "status.confirmed":  { fr: "Confirmé",     ar: "مؤكد",           en: "Confirmed" },
  "status.delivered":  { fr: "Livré",        ar: "تم التوصيل",     en: "Delivered" },
  "status.cancelled":  { fr: "Annulé",       ar: "ملغى",           en: "Cancelled" },
  "status.validated":  { fr: "Validé",       ar: "تم التصديق",     en: "Validated" },
  "status.inProgress": { fr: "En cours",     ar: "قيد التنفيذ",    en: "In Progress" },
  "status.paid":       { fr: "Payé",         ar: "مدفوع",          en: "Paid" },
  "status.unpaid":     { fr: "Non payé",     ar: "غير مدفوع",      en: "Unpaid" },
  "status.draft":      { fr: "Brouillon",    ar: "مسودة",          en: "Draft" },
  "status.expired":    { fr: "Expiré",       ar: "منتهي الصلاحية", en: "Expired" },

  // ── Login ─────────────────────────────────────────────────────
  "login.title":       { fr: "Connexion",          ar: "تسجيل الدخول",   en: "Sign In" },
  "login.staff":       { fr: "Personnel",          ar: "الموظفون",       en: "Staff" },
  "login.external":    { fr: "Externe",            ar: "خارجي",          en: "External" },
  "login.email":       { fr: "Email ou identifiant", ar: "البريد أو المعرف", en: "Email or username" },
  "login.password":    { fr: "Mot de passe",       ar: "كلمة المرور",    en: "Password" },
  "login.connect":     { fr: "Se connecter",       ar: "تسجيل الدخول",   en: "Sign in" },
  "login.biometric":   { fr: "Connexion biométrique", ar: "الدخول البيومتري", en: "Biometric login" },
  "login.logout":      { fr: "Déconnexion",        ar: "تسجيل الخروج",   en: "Logout" },

  // ── Roles (for BOUsers) ──────────────────────────────────────
  "role.super_super_admin": { fr: "Super Administrateur",   ar: "المدير الأعلى",        en: "Super Administrator" },
  "role.super_admin":       { fr: "Super Admin",            ar: "المشرف العام",          en: "Super Admin" },
  "role.admin":             { fr: "Administrateur",         ar: "المدير",                en: "Administrator" },
  "role.resp_commercial":   { fr: "Resp. Commercial",       ar: "مدير المبيعات",         en: "Sales Manager" },
  "role.team_leader":       { fr: "Team Leader",            ar: "قائد الفريق",           en: "Team Leader" },
  "role.prevendeur":        { fr: "Pré-vendeur",            ar: "البائع المتجول",         en: "Sales Rep" },
  "role.resp_logistique":   { fr: "Resp. Logistique",       ar: "مدير اللوجستيك",        en: "Logistics Manager" },
  "role.magasinier":        { fr: "Magasinier",             ar: "أمين المستودع",          en: "Warehouse Keeper" },
  "role.dispatcheur":       { fr: "Dispatcheur",            ar: "المرسل",                en: "Dispatcher" },
  "role.livreur":           { fr: "Livreur",                ar: "عامل التوصيل",           en: "Delivery Driver" },
  "role.acheteur":          { fr: "Acheteur",               ar: "المشتري",               en: "Buyer" },
  "role.ctrl_achat":        { fr: "Contrôleur Achat",       ar: "مراقب المشتريات",       en: "Purchase Controller" },
  "role.ctrl_prep":         { fr: "Contrôleur Préparation", ar: "مراقب التحضير",         en: "Prep Controller" },
  "role.cash_man":          { fr: "Cash Manager",           ar: "مسؤول الصندوق",          en: "Cash Manager" },
  "role.financier":         { fr: "Financier",              ar: "المسؤول المالي",         en: "Finance Officer" },
  "role.client":            { fr: "Client",                 ar: "الزبون",                en: "Client" },
  "role.fournisseur":       { fr: "Fournisseur",            ar: "المورد",                en: "Supplier" },
  "role.resp_achat":        { fr: "Resp. Achat",            ar: "مدير المشتريات",         en: "Purchase Manager" },
  "role.investisseur":      { fr: "Investisseur",           ar: "المستثمر",               en: "Investor" },

  // ── Process ──────────────────────────────────────────────────
  "process.direct":     { fr: "Pré-vendeur Direct",          ar: "البائع المتجول — مباشر", en: "Direct Sales Rep" },
  "process.logistique": { fr: "Pré-vendeur + Logistique",    ar: "البائع + اللوجستيك",    en: "Sales Rep + Logistics" },
  "process.classique":  { fr: "Commercial Classique",        ar: "التجاري الكلاسيكي",      en: "Classic Commercial" },
  "process.full":       { fr: "Processus Complet (BPM)",     ar: "العملية الكاملة",        en: "Full Process (BPM)" },
} as const

export type TKey = keyof typeof T

/** React hook — re-renders on language change */
export function useLang(): AppLang {
  const [lang, setLangState] = useState<AppLang>("fr-ar")

  useEffect(() => {
    setLangState(getLang())
    const handler = (e: Event) => setLangState((e as CustomEvent<AppLang>).detail)
    window.addEventListener("fl_lang_change", handler)
    return () => window.removeEventListener("fl_lang_change", handler)
  }, [])

  return lang
}

/** Translation function — picks the right language */
export function t(key: TKey, lang?: AppLang): string {
  const l = lang ?? getLang()
  const entry = T[key]
  if (!entry) return key
  if (l === "ar") return entry.ar
  if ((l as string) === "en") return (entry as { fr: string; ar: string; en?: string }).en ?? entry.fr
  return entry.fr // "fr" or "fr-ar" → French text
}

/** Inline trilingual helper: t3("Français", "عربي", "English") */
export function t3(fr: string, ar: string, en: string): string {
  const l = getLang()
  if (l === "ar") return ar
  if ((l as string) === "en") return en
  return fr
}

/** React hook that returns a `t()` bound to current language */
export function useT() {
  const lang = useLang()
  return (key: TKey) => t(key, lang)
}
