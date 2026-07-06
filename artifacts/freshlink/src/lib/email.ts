"use client"

/**
 * lib/email.ts — FreshLink Pro Notification System
 *
 * Email  : Resend API via /api/send-email  (gratuit, 3000 emails/mois)
 * Config : RESEND_API_KEY dans .env.local (https://resend.com — inscription gratuite)
 * Fallback SMTP : SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS
 *
 * ⚠️  EmailJS est supprimé — plus de configuration côté client requise.
 * Tous les envois passent par l'API route serveur (/api/send-email).
 */

// ── Config expéditeur (stockée en localStorage par l'admin) ───────────────────
const LS_FROM_KEY  = "fl_email_from"
const LS_REPLY_KEY = "fl_email_reply_to"

export interface EmailConfig {
  from:    string   // ex: "FreshLink Pro <noreply@vitafresh.ma>"
  replyTo?: string  // ex: "contact@vitafresh.ma"
}

export function getEmailConfig(): EmailConfig {
  if (typeof window === "undefined") return { from: "" }
  try {
    const raw = localStorage.getItem(LS_FROM_KEY)
    return raw ? JSON.parse(raw) as EmailConfig : { from: "" }
  } catch { return { from: "" } }
}

export function saveEmailConfig(cfg: EmailConfig): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(LS_FROM_KEY, JSON.stringify(cfg))
  }
}

export function isEmailConfigured(): boolean {
  // Email works as long as the server has RESEND_API_KEY set — always return true
  // The API route handles the "not configured" error gracefully
  return true
}

// Legacy compat — anciens composants appellent ces fonctions
export function saveEmailJSConfig(cfg: { serviceId: string; templateId: string; publicKey: string }): void {
  // no-op — EmailJS est remplacé par Resend
}
export function getEmailJSConfigPublic() {
  return { serviceId: "", templateId: "", publicKey: "" }
}
export function isEmailJSConfigured(): boolean { return false }

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EmailPayload {
  to_email: string
  subject:  string
  body:     string    // plain text body — auto-wrapped in HTML
  html?:    string    // optional override HTML
}

export interface SendResult {
  ok:     boolean
  error?: string
  status?: number
}

// ── Core sender ───────────────────────────────────────────────────────────────

export async function sendEmail(payload: EmailPayload): Promise<SendResult> {
  if (!payload.to_email?.includes("@")) {
    return { ok: false, error: "Adresse email destinataire invalide." }
  }

  try {
    // Route serveur Brevo/Resend (auto-réparation domaine) — même endpoint que la boutique
    const res = await fetch("/api/ext/send-email", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to:      payload.to_email,
        subject: payload.subject,
        html:    payload.html ?? bodyToHtml(payload.body),
        text:    payload.body,
      }),
    })

    const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string }

    if (data.ok) return { ok: true }
    return { ok: false, status: res.status, error: data.error ?? "Erreur envoi email" }
  } catch (err) {
    return { ok: false, error: `Réseau : ${err instanceof Error ? err.message : String(err)}` }
  }
}

export async function sendEmailMulti(
  to_emails: string[],
  subject: string,
  body: string
): Promise<{ sent: string[]; failed: Array<{ email: string; error: string }> }> {
  const sent:   string[] = []
  const failed: Array<{ email: string; error: string }> = []

  for (const email of to_emails) {
    const result = await sendEmail({ to_email: email, subject, body })
    if (result.ok) sent.push(email)
    else failed.push({ email, error: result.error ?? "Erreur inconnue" })
    await new Promise(r => setTimeout(r, 200))
  }

  return { sent, failed }
}

export async function testEmailConnection(toEmail = "support@vita-core.org"): Promise<SendResult> {
  return sendEmail({
    to_email: toEmail,
    subject:  "Test envoi — Vita Fresh (support@vita-core.org)",
    body:     "Ceci est un test de la configuration email Vita Fresh (Resend, expéditeur support@vita-core.org).",
  })
}

// ── Notifications par email (expéditeur support@vita-core.org) ────────────────
export interface NotificationEmail {
  to:      string | string[]
  title:   string                          // titre court de la notification
  message: string                          // corps (texte, sauts de ligne OK)
  cta?:    { label: string; url: string }  // bouton d'action optionnel
}

function notificationHtml(n: NotificationEmail): string {
  const safe = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;background:#f6f8f6;margin:0;padding:24px;color:#14241a">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.06)">
    <div style="background:linear-gradient(135deg,#1a4f2a,#2d7a46);padding:20px 24px;color:#fff">
      <p style="margin:0;font-size:18px;font-weight:800">🌿 Vita Fresh</p>
      <p style="margin:4px 0 0;font-size:12px;opacity:.85">Notification — Distribution Fruits &amp; Légumes</p>
    </div>
    <div style="padding:24px 28px">
      <p style="margin:0 0 10px;font-size:16px;font-weight:800;color:#1a4f2a">${safe(n.title)}</p>
      <div style="font-size:14px;line-height:1.6;color:#374151">${safe(n.message)}</div>
      ${n.cta ? `<a href="${n.cta.url}" style="display:inline-block;margin-top:18px;background:#1a4f2a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:700;font-size:13px">${safe(n.cta.label)} &rarr;</a>` : ""}
    </div>
    <div style="padding:14px 24px;border-top:1px solid #eef2ef;text-align:center;font-size:11px;color:#9ca3af">
      Vita Fresh &middot; support@vita-core.org
    </div>
  </div>
</body></html>`
}

/**
 * Envoie un email de notification (expéditeur support@vita-core.org, défini
 * côté serveur via /api/send-email). Accepte un ou plusieurs destinataires.
 */
export async function sendNotificationEmail(n: NotificationEmail): Promise<{ sent: string[]; failed: string[] }> {
  const recipients = Array.isArray(n.to) ? n.to : [n.to]
  const html = notificationHtml(n)
  const sent: string[] = []
  const failed: string[] = []
  for (const to of recipients) {
    if (!to?.includes("@")) { failed.push(to); continue }
    const r = await sendEmail({ to_email: to, subject: `[Vita Fresh] ${n.title}`, body: n.message, html })
    if (r.ok) sent.push(to); else failed.push(to)
    await new Promise(res => setTimeout(res, 150))
  }
  return { sent, failed }
}

// Legacy alias
export const testEmailJSConnection = testEmailConnection

// ── WhatsApp ──────────────────────────────────────────────────────────────────

export interface WAResult {
  ok:      boolean
  error?:  string
  waLink?: string    // fallback si API non configurée
}

/**
 * Envoie un message WhatsApp via CallMeBot ou Twilio.
 * Sans WhatsApp Business ouvert — 100% API serveur.
 *
 * @param phone  Numéro international (ex: "212661234567" ou "+212661234567")
 * @param message Texte du message
 */
export async function sendWhatsApp(phone: string, message: string): Promise<WAResult> {
  if (!phone) return { ok: false, error: "Numéro de téléphone manquant." }

  try {
    const res = await fetch("/api/send-whatsapp", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, message }),
    })

    const data = await res.json().catch(() => ({})) as {
      ok?: boolean; error?: string; waLink?: string; fallback?: string
    }

    if (data.ok) return { ok: true }

    // Fallback : retourner le lien wa.me si aucune API configurée
    if (data.fallback === "wa_link" && data.waLink) {
      return { ok: false, error: data.error, waLink: data.waLink }
    }

    return { ok: false, error: data.error ?? "Erreur envoi WhatsApp" }
  } catch (err) {
    return { ok: false, error: `Réseau : ${err instanceof Error ? err.message : String(err)}` }
  }
}

// ── Helpers HTML ──────────────────────────────────────────────────────────────

function bodyToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>")

  // ⚠️ Styles 100% INLINE (pas de <style> dans <head>) : de nombreux clients
  // email (Outlook, passerelles d'entreprise) suppriment les balises <style>
  // au filtrage — la couleur de texte blanc du header ET son fond dégradé
  // disparaissaient ENSEMBLE, sauf que ça ne se voit que si l'un survit sans
  // l'autre. Le style inline garantit que fond + texte restent toujours liés.
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b;line-height:1.6;margin:0;padding:20px;background:#f8fafc">
  <div style="background:#fff;border-radius:12px;padding:24px 28px;max-width:600px;margin:0 auto;box-shadow:0 2px 8px rgba(0,0,0,.08)">
    <div style="background:linear-gradient(135deg,#1a4f2a,#2d7a46);color:#fff;padding:16px 24px;border-radius:10px;margin-bottom:20px">
      <h1 style="margin:0;font-size:18px;font-weight:800;color:#fff">🌿 FreshLink Pro</h1>
      <p style="margin:4px 0 0;font-size:12px;color:#fff;opacity:.85">Vita Fresh — Distribution Fruits &amp; Légumes</p>
    </div>
    <pre style="background:#f1f5f9;border-radius:8px;padding:16px;font-size:13px;overflow-x:auto;white-space:pre-wrap;border:1px solid #e2e8f0;color:#1e293b">${escaped}</pre>
    <div style="text-align:center;margin-top:20px;font-size:11px;color:#94a3b8">⚡ Powered by Vita tech · FreshLink Pro</div>
  </div>
</body>
</html>`
}

// ── Email body builders (inchangés) ──────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function dateStr(): string {
  return new Date().toLocaleDateString("fr-MA", { day: "2-digit", month: "2-digit", year: "numeric" })
}

export function buildRecapJournalier(data: {
  date: string
  totalAchats: number; totalCommandes: number; totalLivraisons: number
  totalRetours: number; totalCash: number; marge: number
  nbBonsAchat?: number; nbCommandes?: number; nbLivraisons?: number; nbRetours?: number
  creditFournisseurs?: number; nbCreditFournisseurs?: number
  creditClients?: number; nbCreditClients?: number
}): string {
  const line = "─".repeat(48)
  const rows = [
    line,
    "     RÉCAP JOURNALIER — FreshLink Pro",
    `     Date : ${data.date}`,
    line,
    `  Achats du jour        : ${fmt(data.totalAchats)} DH  (${data.nbBonsAchat ?? 0} bons)`,
    `  Commandes validées    : ${fmt(data.totalCommandes)} DH  (${data.nbCommandes ?? 0} commandes)`,
    `  Livraisons effectuées : ${fmt(data.totalLivraisons)} DH  (${data.nbLivraisons ?? 0} BLs)`,
    `  Retours               : ${fmt(data.totalRetours)} DH  (${data.nbRetours ?? 0} retours)`,
    `  Encaissements (Cash)  : ${fmt(data.totalCash)} DH`,
    "  " + "·".repeat(44),
    `  Marge brute estimée   : ${fmt(data.marge)} DH`,
  ]
  // Crédits (dettes en cours) — fournisseurs (ce qu'on doit) + clients (ce qu'on nous doit)
  if (data.creditFournisseurs !== undefined || data.creditClients !== undefined) {
    rows.push("  " + "·".repeat(44))
    rows.push(`  Crédit fournisseurs (dû) : ${fmt(data.creditFournisseurs ?? 0)} DH  (${data.nbCreditFournisseurs ?? 0} fourn.)`)
    rows.push(`  Crédit clients (à recouvrer) : ${fmt(data.creditClients ?? 0)} DH  (${data.nbCreditClients ?? 0} clients)`)
  }
  rows.push(line, "  Rapport généré par FreshLink Pro", line)
  return rows.join("\n")
}

export function buildAchatEmail(bon: {
  id: string; fournisseurNom: string; date: string; acheteurNom: string
  lignes: { articleNom: string; quantite: number; prixAchat: number }[]
}): string {
  const total = bon.lignes.reduce((s, l) => s + l.quantite * l.prixAchat, 0)
  const line = "─".repeat(48)
  return [
    line,
    `  BON D'ACHAT #${bon.id}`,
    `  Date : ${bon.date}`,
    `  Acheteur : ${bon.acheteurNom}`,
    `  Fournisseur : ${bon.fournisseurNom}`,
    line,
    ...bon.lignes.map(l =>
      `  • ${l.articleNom.padEnd(20)} ${String(l.quantite).padStart(6)}  x  ${fmt(l.prixAchat)} DH = ${fmt(l.quantite * l.prixAchat)} DH`
    ),
    line,
    `  TOTAL : ${fmt(total)} DH`,
    line,
  ].join("\n")
}

export function buildCommandeEmail(cmd: {
  id: string; clientNom: string; commercialNom: string; date: string; heurelivraison: string
  lignes: { articleNom: string; quantite: number; prixVente: number }[]
}): string {
  const total = cmd.lignes.reduce((s, l) => s + l.quantite * l.prixVente, 0)
  const line = "─".repeat(48)
  return [
    line,
    `  COMMANDE #${cmd.id}`,
    `  Date : ${cmd.date}     Livraison : ${cmd.heurelivraison}`,
    `  Commercial : ${cmd.commercialNom}`,
    `  Client : ${cmd.clientNom}`,
    line,
    ...cmd.lignes.map(l =>
      `  • ${l.articleNom.padEnd(20)} ${String(l.quantite).padStart(6)}  x  ${fmt(l.prixVente)} DH = ${fmt(l.quantite * l.prixVente)} DH`
    ),
    line,
    `  TOTAL TTC : ${fmt(total)} DH`,
    line,
  ].join("\n")
}

export interface BesoinLigneEmail {
  articleNom: string; fournisseurNom?: string
  commandeTotal: number; stockActuel: number; retours: number; besoinNet: number; unite?: string
}

export function buildBesoinAchatEmail(lignes: BesoinLigneEmail[], options?: { date?: string; titre?: string }): string {
  const d    = options?.date ?? dateStr()
  const line = "─".repeat(56)
  const total = lignes.reduce((s, l) => s + l.besoinNet, 0)
  return [
    line,
    `  BESOIN D'ACHAT NET — FreshLink Pro`,
    `  Date : ${d}`,
    line,
    `  ${"Article".padEnd(22)} ${"Cdes".padStart(6)} ${"Stock".padStart(6)} ${"Retours".padStart(8)} ${"Besoin".padStart(8)}`,
    ...lignes.map(l => {
      const unite = l.unite ? ` ${l.unite}` : ""
      return `  ${l.articleNom.slice(0, 22).padEnd(22)} ${String(l.commandeTotal).padStart(6)} ${String(l.stockActuel).padStart(6)} ${String(l.retours).padStart(8)} ${String(l.besoinNet).padStart(8)}${l.besoinNet > 0 ? `  *** COMMANDER ${l.besoinNet}${unite} ***` : ""}`
    }),
    `  Total besoin net : ${total} unité(s)`,
    line,
  ].join("\n")
}

export interface BesoinParFournisseur {
  fournisseurNom: string; fournisseurEmail?: string; lignes: BesoinLigneEmail[]
}

export function buildBesoinAchatParFournisseur(groupes: BesoinParFournisseur[], date?: string) {
  const d = date ?? dateStr()
  return groupes
    .filter(g => g.lignes.some(l => l.besoinNet > 0))
    .map(g => ({
      fournisseurNom:   g.fournisseurNom,
      fournisseurEmail: g.fournisseurEmail,
      subject: `Commande d'approvisionnement FreshLink — ${g.fournisseurNom} — ${d}`,
      body:    buildBesoinAchatEmail(g.lignes.filter(l => l.besoinNet > 0), { date: d }),
    }))
}
