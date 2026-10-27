import { useEffect, useRef, useState } from "react"
import type { OrderDraft } from "@/lib/orderDraft"
import { requestAiDraft } from "@/lib/aiDrafts"

export interface QualityDraft { product:string|null;visibleDefects:string[];limitations:string[];checks:string[] }
const labels:Record<string,string>={customer:"Client",supplier:"Fournisseur",reference:"Référence",date:"Date",lines:"Lignes",article:"Article",quantity:"Quantité",unit:"Unité",unitPrice:"Prix unitaire lu",evidence:"Texte source",questions:"À clarifier",product:"Produit",visibleDefects:"Défauts visibles",limitations:"Limites de l'analyse",checks:"Contrôles à effectuer"}
export function DraftView({value}:{value:unknown}) {
  if(value==null) return <span className="text-amber-700">À préciser</span>
  if(Array.isArray(value)) return value.length ? <ul className="space-y-2">{value.map((v,i)=><li key={i} className="border-l-2 pl-3"><DraftView value={v}/></li>)}</ul> : <span>—</span>
  if(typeof value==="object") return <dl className="space-y-2">{Object.entries(value).map(([k,v])=><div key={k}><dt className="font-semibold">{labels[k]||k}</dt><dd><DraftView value={v}/></dd></div>)}</dl>
  return <span>{String(value)}</span>
}
export async function imageData(file:File):Promise<string> {
  if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>15_000_000) throw Error("Choisissez une image JPEG, PNG ou WebP de moins de 15 Mo.")
  const bitmap=await createImageBitmap(file)
  try {
    const ratio=Math.min(1,1400/Math.max(bitmap.width,bitmap.height)); const canvas=document.createElement("canvas")
    canvas.width=Math.round(bitmap.width*ratio);canvas.height=Math.round(bitmap.height*ratio)
    canvas.getContext("2d")!.drawImage(bitmap,0,0,canvas.width,canvas.height)
    const result=canvas.toDataURL("image/jpeg",0.75)
    if(result.length>2800000) throw Error("Image trop volumineuse. Recadrez le document.")
    return result
  } finally {bitmap.close()}
}
const dataUrl=(blob:Blob)=>new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(Error("Lecture du fichier impossible."));r.readAsDataURL(blob)})

export default function AiWorkbench({fixedTask,context="",onQuality,onOrder}:{fixedTask?:"quality"|"order";context?:string;onOrder?:(draft:OrderDraft)=>void;onQuality?:(draft:QualityDraft,image:string)=>void}) {
  const [task,setTask]=useState<"order"|"document"|"quality">(fixedTask??"order")
  const [text,setText]=useState("");const [image,setImage]=useState<string>();const [draft,setDraft]=useState<unknown>();const [error,setError]=useState("")
  const [busy,setBusy]=useState(false);const [recording,setRecording]=useState(false);const [confirmed,setConfirmed]=useState(false)
  const [capabilities,setCapabilities]=useState<{text:boolean;image:boolean;audio:boolean;audioProvider:string;imageProvider:string}|null>(null)
  const [configurationError,setConfigurationError]=useState("")
  useEffect(()=>{
    const controller=new AbortController()
    fetch("/api/ai-drafts/capabilities",{credentials:"include",cache:"no-store",signal:controller.signal})
      .then(async response=>{const body=await response.json();if(!response.ok||!body.ok)throw Error(body.error||"Configuration IA indisponible.");return body})
      .then(body=>{if(!controller.signal.aborted)setCapabilities(body)})
      .catch(error=>{if(!controller.signal.aborted)setConfigurationError(error instanceof Error?error.message:"Configuration IA indisponible.")})
    return()=>controller.abort()
  },[])
  const recorder=useRef<MediaRecorder|undefined>(undefined);const stream=useRef<MediaStream|undefined>(undefined);const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);const mounted=useRef(true)
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;clearTimeout(timer.current);if(recorder.current?.state==="recording")recorder.current.stop();stream.current?.getTracks().forEach(t=>t.stop())}},[])
  const reset=()=>{setDraft(undefined);setConfirmed(false);setError("")}
  async function transcribe(blob:Blob) {
    if(blob.size>2_000_000) {setError("Enregistrement trop long : limite 2 Mo.");return}
    setBusy(true);reset()
    try {const result=await requestAiDraft({task:"transcribe",audio:(await dataUrl(blob)).split(",")[1],mime:blob.type.split(";")[0]});if(mounted.current)setText(result.text)}
    catch(e){if(mounted.current)setError(e instanceof Error?e.message:"Transcription impossible.")}
    finally{if(mounted.current)setBusy(false)}
  }
  async function startRecording(){
    setError("");setBusy(true)
    try {
      if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined")throw Error("Microphone non disponible. Vous pouvez saisir le texte.")
      const media=await navigator.mediaDevices.getUserMedia({audio:true})
      if(!mounted.current){media.getTracks().forEach(t=>t.stop());return}
      stream.current=media
      const mime=["audio/webm","audio/mp4"].find(t=>MediaRecorder.isTypeSupported(t))
      if(!mime){media.getTracks().forEach(t=>t.stop());throw Error("Format audio non pris en charge sur cet appareil.")}
      const r=new MediaRecorder(media,{mimeType:mime});recorder.current=r;const chunks:Blob[]=[]
      r.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)}
      r.onstop=()=>{clearTimeout(timer.current);media.getTracks().forEach(t=>t.stop());if(mounted.current){setRecording(false);void transcribe(new Blob(chunks,{type:mime}))}}
      r.start();setRecording(true);timer.current=setTimeout(()=>{if(r.state==="recording")r.stop()},60000)
    } catch(e){stream.current?.getTracks().forEach(t=>t.stop());if(mounted.current)setError(e instanceof Error?e.message:"Microphone inaccessible.")} finally{if(mounted.current)setBusy(false)}
  }
  async function analyse(){setBusy(true);reset();try{const result=await requestAiDraft({task,text:[context,text].filter(Boolean).join("\n"),image});if(mounted.current)setDraft(result.draft)}catch(e){if(mounted.current)setError(e instanceof Error?e.message:"Analyse impossible.")}finally{if(mounted.current)setBusy(false)}}
  return <section className="rounded-2xl border bg-white p-4 text-slate-900 space-y-3" aria-label="Atelier IA">
    <h3 className="font-bold">{fixedTask==="quality"?"Constat visuel assisté":"Brouillons assistés : texte, voix et documents"}</h3>
    <p className="text-sm text-slate-600">Vérifiez chaque résultat. Aucune commande, écriture comptable ou modification de stock n'est créée ici.</p>
    <p role="status" className="text-sm text-slate-600">{configurationError || (capabilities ? `Texte : ${capabilities.text?"disponible":"non configuré"} · Voix : ${capabilities.audio?capabilities.audioProvider:"non configurée"} · Images : ${capabilities.image?capabilities.imageProvider:"non configurées"}` : "Vérification des fonctions IA disponibles…")}</p>
    {!fixedTask&&<label className="block">Type de brouillon<select disabled={busy||recording} className="block border rounded p-2" value={task} onChange={e=>{setTask(e.target.value as typeof task);reset();setImage(undefined)}}><option value="order">Commande</option><option value="document">Bon fournisseur</option><option value="quality">Constat qualité</option></select></label>}
    <label className="block">{task==="order"?"Commande dictée ou saisie — vérifiez les quantités et unités":"Informations complémentaires"}<textarea disabled={busy||recording} maxLength={11000} className="w-full border rounded p-2 min-h-24" value={text} onChange={e=>{setText(e.target.value);reset()}}/></label>
    {fixedTask!=="quality"&&<button type="button" disabled={busy||!capabilities?.audio} className="border rounded px-3 py-2 disabled:opacity-50" onClick={()=>recording?recorder.current?.stop():void startRecording()}>{recording?"Arrêter et transcrire":"Dicter (60 secondes maximum)"}</button>}
    <label className="block">Photo ou document<input type="file" capture="environment" accept="image/jpeg,image/png,image/webp" disabled={busy||recording||!capabilities?.image} onChange={async e=>{const f=e.target.files?.[0];reset();setImage(undefined);if(f){setBusy(true);try{const prepared=await imageData(f);if(mounted.current)setImage(prepared)}catch(err){if(mounted.current)setError(err instanceof Error?err.message:"Image invalide.")}finally{if(mounted.current)setBusy(false)}}}}/></label>
    {image&&<img src={image} alt="Document à analyser" className="max-h-48 rounded"/>}
    <p className="text-xs text-slate-600">En lançant l'analyse, le contenu choisi est transmis au fournisseur IA configuré. Évitez les données personnelles inutiles.</p>
    <button type="button" className="bg-emerald-700 text-white rounded px-4 py-2 disabled:opacity-50" disabled={busy||recording||!(image||task==="quality"?capabilities?.image:capabilities?.text)||(!text.trim()&&!image&&!context)} onClick={()=>void analyse()}>{busy?"Traitement…":"Préparer le brouillon"}</button>
    {error&&<p role="alert" className="text-red-700">{error} Votre saisie reste disponible.</p>}
    {draft!==undefined&&<div className="border-t pt-3 space-y-3"><DraftView value={draft}/><label className="flex gap-2"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>J'ai vérifié les informations et les points à clarifier.</label>{onOrder&&task==="order"&&<button type="button" className="border rounded p-2" disabled={!confirmed} onClick={()=>{try{onOrder(draft as OrderDraft)}catch(e){setError(e instanceof Error?e.message:"Rapprochement impossible.")}}}>Reprendre dans la commande à vérifier</button>}{onQuality&&image&&<button type="button" className="border rounded p-2" disabled={!confirmed} onClick={()=>onQuality(draft as QualityDraft,image)}>Joindre le constat au retour</button>}</div>}
  </section>
}
