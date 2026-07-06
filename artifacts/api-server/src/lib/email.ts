// ══════════════════════════════════════════════════════════════════════════════
// Envoi email côté SERVEUR (clé secrète jamais exposée) — partagé entre la
// route publique /api/ext/send-email et les notifications internes (ex: alerte
// commande Shop dans routes/ext/commandes.ts).
//
// Fournisseurs (par préférence, détectés via variables d'env) :
//   1. Brevo   — BREVO_API_KEY    (300/jour gratuit) — prioritaire (pas de DNS requis)
//   2. Resend  — RESEND_API_KEY   (3000/mois gratuit)
//
// 🔧 Résilience Resend « domaine non vérifié » :
//   • Si l'envoi échoue car le domaine du FROM n'est pas vérifié, on interroge
//     Resend → /domains pour trouver un domaine VÉRIFIÉ et on réessaie avec
//     noreply@<domaine-vérifié> (auto-réparation : dès que vous vérifiez un
//     domaine dans Resend, l'envoi repart sans changer le code).
//   • En dernier recours, on tente onboarding@resend.dev (uniquement vers
//     l'email du compte Resend) pour ne pas perdre le message.
// ══════════════════════════════════════════════════════════════════════════════

const RESEND_KEY = process.env.RESEND_API_KEY || "";
const BREVO_KEY = process.env.BREVO_API_KEY || "";
export const FROM_DEFAULT = process.env.EMAIL_FROM || "Vita Fresh <support@vita-core.org>";

const displayName = (from: string) => (from.match(/^(.*?)\s*</)?.[1] || "Vita Fresh").trim();

async function brevoSend(from: string, to: string, subject: string, html: string, text: string, replyTo?: string): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const m = from.match(/^(.*?)\s*<(.+)>$/);
  const sender = m ? { name: m[1].trim(), email: m[2].trim() } : { email: from };
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO_KEY, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender, to: [{ email: to }], subject, htmlContent: html || `<p>${text}</p>`, replyTo: replyTo ? { email: replyTo } : undefined }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, data };
}

interface ResendPayload { from: string; to: string[]; subject: string; html?: string; text?: string; reply_to?: string }

async function resendSend(p: ResendPayload): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(p),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
}

// Cherche un domaine VÉRIFIÉ dans le compte Resend → renvoie "Name <noreply@domaine>"
async function resendVerifiedFrom(name: string): Promise<string | null> {
  try {
    const r = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${RESEND_KEY}` } });
    const d = (await r.json().catch(() => ({}))) as { data?: { name?: string; status?: string }[] };
    const list: { name?: string; status?: string }[] = Array.isArray(d?.data) ? d.data : Array.isArray(d) ? (d as unknown as { name?: string; status?: string }[]) : [];
    const verified = list.find(x => String(x.status).toLowerCase() === "verified" && x.name);
    return verified?.name ? `${name} <noreply@${verified.name}>` : null;
  } catch { return null; }
}

export interface SendEmailParams { to: string; subject: string; html?: string; text?: string; from?: string; replyTo?: string }
export interface SendEmailResult {
  ok: boolean;
  provider?: "brevo" | "resend";
  id?: string;
  from?: string;
  note?: string;
  error?: string;
  hint?: string;
  detail?: unknown;
  status?: number;
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const to = String(params.to ?? "").trim();
  const subject = String(params.subject ?? "").trim();
  const html = params.html ?? (params.text ? `<pre style="font-family:inherit">${params.text}</pre>` : "");
  const text = params.text ?? "";
  const from = params.from ?? FROM_DEFAULT;
  if (!to || !subject || (!html && !text)) {
    return { ok: false, error: "to, subject et html/text requis", status: 400 };
  }

  // ── 0. Brevo PRIORITAIRE si configuré (pas de DNS requis, juste un sender vérifié)
  if (BREVO_KEY) {
    const r = await brevoSend(from, to, subject, html, text, params.replyTo);
    if (r.ok) return { ok: true, provider: "brevo", id: (r.data as Record<string, unknown>)?.["messageId"] as string | undefined };
    const bmsg = String((r.data as { message?: string; code?: string })?.message ?? (r.data as { code?: string })?.code ?? "erreur Brevo");
    const bhint = /ip address|authorised_ips|authorized.?ip|unrecognis/i.test(bmsg)
      ? "Brevo bloque l'IP du serveur (fonction de sécurité « IP autorisées »). Les serveurs changent d'IP → DÉSACTIVEZ cette restriction : Brevo → Security → Authorised IPs."
      : /sender|not.*valid|denied|verif/i.test(bmsg)
      ? `Expéditeur non vérifié dans Brevo. Brevo → Senders, ajoutez « ${from.replace(/^.*<|>$/g, "")} » et confirmez.`
      : /api.?key|key not found/i.test(bmsg) ? "Clé BREVO_API_KEY invalide ou révoquée."
      : "Vérifiez l'expéditeur (Brevo → Senders) et la clé BREVO_API_KEY.";
    return { ok: false, error: `Brevo: ${bmsg}`, detail: r.data, hint: bhint, status: 502 };
  }

  // ── 1. Resend (avec auto-réparation du domaine) ───────────────────────────
  if (RESEND_KEY) {
    const base = { to: [to], subject, html: html || undefined, text: text || undefined, reply_to: params.replyTo };
    let r = await resendSend({ from, ...base });
    let usedFrom = from;
    let note: string | undefined;

    if (!r.ok && /not verified|domain|verify/i.test(String((r.data as Record<string, unknown>)?.["message"] ?? ""))) {
      const vFrom = await resendVerifiedFrom(displayName(from));
      if (vFrom && vFrom !== from) {
        const r2 = await resendSend({ from: vFrom, ...base });
        if (r2.ok) { r = r2; usedFrom = vFrom; note = `Domaine ${from} non vérifié → envoyé via ${vFrom}.`; }
        else r = r2;
      }
      if (!r.ok) {
        const fb = `${displayName(from)} <onboarding@resend.dev>`;
        const r3 = await resendSend({ from: fb, ...base });
        if (r3.ok) { r = r3; usedFrom = fb; note = "Aucun domaine vérifié → envoyé via onboarding@resend.dev (livré uniquement à l'email du compte Resend). Vérifiez le domaine dans Resend → Domains pour envoyer à tous."; }
        else r = r3;
      }
    }

    if (r.ok) return { ok: true, provider: "resend", id: (r.data as Record<string, unknown>)?.["id"] as string | undefined, from: usedFrom, note };

    const msg = String((r.data as Record<string, unknown>)?.["message"] ?? "erreur Resend");
    const hint = /not verified|domain|verify/i.test(msg)
      ? "Domaine non vérifié dans Resend. Ajoutez votre domaine dans Resend → Domains et publiez les enregistrements DNS (SPF/DKIM/DMARC)."
      : /api key/i.test(msg) ? "Clé RESEND_API_KEY invalide — recréez une clé dans Resend → API Keys."
      : undefined;
    return { ok: false, error: `Resend: ${msg}`, detail: r.data, hint, status: 502 };
  }

  return {
    ok: false,
    error: "Aucun fournisseur email configuré",
    hint: "Définir RESEND_API_KEY (recommandé) ou BREVO_API_KEY dans les variables d'environnement.",
    status: 501,
  };
}
