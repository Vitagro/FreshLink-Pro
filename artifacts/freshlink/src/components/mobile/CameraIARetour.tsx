"use client"
import AiWorkbench, { type QualityDraft } from "@/components/shared/AiWorkbench"
interface AnalysisResult {
  analysisVersion: 2
  isMarchandise: null
  etat: string
  shelfLifeEstime: string
  prixSuggest: null
  recommandation: string
  details: string
  observation: QualityDraft
}
interface Props {articleNom?:string;onValidate?:(result:AnalysisResult,photo:string)=>void;onCancel?:()=>void}
export default function CameraIARetour({articleNom,onValidate,onCancel}:Props) {
  return <div className="space-y-3 p-3">
    {onCancel&&<button onClick={onCancel}>Retour</button>}
    <AiWorkbench fixedTask="quality" context={`Produit déclaré : ${articleNom||"non précisé"}`} onQuality={onValidate?(draft,photo)=>onValidate({
      analysisVersion:2,isMarchandise:null,etat:"À contrôler physiquement",shelfLifeEstime:"Non déterminable sur photo",prixSuggest:null,
      recommandation:draft.checks.join(" · "),details:[...draft.visibleDefects,...draft.limitations].join(" · "),observation:draft,
    },photo):undefined}/>
  </div>
}
