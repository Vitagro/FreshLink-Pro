import { useState, type ReactNode } from "react"
export default function CompactAiResponse({text,children}:{text:string;children?:ReactNode}){
 const [expanded,setExpanded]=useState(false)
 const long=text.length>1100
 return <div className="min-w-0 max-w-full break-words">
  {long&&!expanded&&<p className="mb-2 text-xs opacity-75">Aperçu de la réponse — ouvrez le détail avant d’appliquer les conseils.</p>}
  <div className={!long||expanded?"whitespace-pre-wrap":"max-h-48 overflow-hidden whitespace-pre-wrap"}>{children??text}</div>
  {long&&<button type="button" aria-expanded={expanded} className="mt-3 rounded-lg border px-3 py-2 text-xs font-semibold" onClick={()=>setExpanded(v=>!v)}>{expanded?"Réduire la réponse":"Afficher la réponse complète"}</button>}
 </div>
}
