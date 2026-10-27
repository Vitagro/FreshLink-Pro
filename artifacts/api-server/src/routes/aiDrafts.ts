import { Router } from "express";
import { requireAccount } from "../lib/adminAuth.js";
import { requireDeviceApi } from "../lib/deviceGuard.js";
import { CONTRACTS, generateDraft, transcribeAudio, type DraftTask } from "../lib/aiDrafts.js";
import { reserveAiCall } from "../lib/aiQuota.js";
const router = Router();
// Per-instance pilot guard, not a distributed billing quota.
const requests = new Map<string,{start:number;count:number}>();
router.use(requireAccount);
router.use((req,res,next) => {
  res.setHeader("Cache-Control","no-store");
  if (requireDeviceApi(req)) { res.status(401).json({ok:false,error:"Appareil non autorisé."}); return; }
  if (process.env.AI_DRAFTS_ENABLED !== "true") { res.status(503).json({ok:false,error:"Pilote IA non activé."}); return; }
  const users = (process.env.AI_PILOT_USER_IDS ?? "").split(",").map(s=>s.trim()).filter(Boolean);
  const id = String(res.locals.account.id);
  if (!users.includes(id)) { res.status(403).json({ok:false,error:"Compte hors pilote IA."}); return; }
  const now = Date.now();
  for (const [key,value] of requests) if (now-value.start >= 60000) requests.delete(key);
  const counter = requests.get(id) ?? {start:now,count:0};
  if (counter.count >= 10) { res.setHeader("Retry-After","60"); res.status(429).json({ok:false,error:"Trop de demandes. Réessayez dans une minute."}); return; }
  counter.count++; requests.set(id,counter); next();
});
router.post("/",async(req,res) => {
  const {task,text,image,audio,mime} = req.body ?? {};
  if (task === "transcribe") {
    if (typeof audio !== "string" || audio.length > 2666668 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(audio) || typeof mime !== "string") {
      res.status(400).json({ok:false,error:"Audio invalide (2 Mo maximum)."}); return;
    }
  } else if (typeof task !== "string" || !Object.hasOwn(CONTRACTS,task) ||
      typeof text !== "string" || text.length > 12000 || (!text.trim() && !image) ||
      (image !== undefined && (typeof image !== "string" || image.length > 2800000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image)))) {
    res.status(400).json({ok:false,error:"Demande invalide : texte 12 000 caractères maximum, image JPEG/PNG/WebP compressée."}); return;
  }
  const started = Date.now();
  try {
    if (process.env.OLLAMA_API_KEY) {
      if (task === "transcribe" || task === "quality" || image) throw Error("OLLAMA_TEXT_ONLY");
    } else if(!process.env.OPENAI_API_KEY || !(task === "transcribe" ? process.env.OPENAI_TRANSCRIBE_MODEL : process.env.OPENAI_DRAFT_MODEL)) throw Error("NOT_CONFIGURED");
    if(!await reserveAiCall(String(res.locals.account.id))) {res.status(429).json({ok:false,error:"Quota IA atteint. Réessayez plus tard ou contactez votre administrateur."});return;}
    const result = task === "transcribe"
      ? {text:await transcribeAudio(Buffer.from(audio,"base64"),mime),requiresHumanReview:true}
      : await generateDraft(task as DraftTask,text,image);
    req.log?.info({task,durationMs:Date.now()-started,outcome:"success"},"ai_draft");
    res.json({ok:true,...result});
  } catch (error) {
    const code = error instanceof Error ? error.message : "FAILED";
    req.log?.warn({task,durationMs:Date.now()-started,outcome:"failed"},"ai_draft");
    const status = ["NOT_CONFIGURED","QUOTA_UNAVAILABLE"].includes(code) ? 503 : ["INVALID_AUDIO","OLLAMA_TEXT_ONLY"].includes(code) ? 400 : 502;
    res.status(status).json({ok:false,error:code === "OLLAMA_TEXT_ONLY" ? "Le modèle Ollama configuré accepte le texte uniquement. Saisissez ou collez le contenu ; les photos et la transcription audio ne sont pas activées." : code === "NOT_CONFIGURED" ? "Clé ou modèle IA serveur non configuré." : "Analyse indisponible ou résultat invalide. Aucune donnée métier enregistrée."});
  }
});
export default router;
