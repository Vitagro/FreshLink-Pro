// Shared client for mobile and back-office. Never contains a provider API key.
export async function requestAiDraft(payload: {task:"order"|"document"|"quality";text:string;image?:string} | {task:"transcribe";audio:string;mime:string}) {
  const response = await fetch("/api/ai-drafts", {
    method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},
    body:JSON.stringify(payload),signal:AbortSignal.timeout(25000),
  });
  const body = await response.json();
  if (!response.ok || !body.ok) throw new Error(body.error || "Analyse indisponible.");
  return body;
}
