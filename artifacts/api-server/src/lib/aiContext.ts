import { SB_URL, SB_SERVICE_KEY, sbServiceHeaders } from "./ext/supabaseEnv.js";
type Account={id:string;role:string};
export async function buildServerAiContext(account:Account):Promise<string> {
  if(!SB_SERVICE_KEY)throw Error("CONTEXT_UNAVAILABLE");
  const privileged=account.role==="super_super_admin";
  const commercial=["prevendeur","commercial"].includes(account.role);
  if(!privileged&&!commercial) return "Aucun accès automatique aux données métier pour ce rôle dans l'assistant. Demander les informations manquantes sans inventer de chiffres.";
  const modeResponse=await fetch(`${SB_URL}/rest/v1/fl_dashboard_settings?id=eq.global&select=payload&limit=1`,{headers:sbServiceHeaders(),signal:AbortSignal.timeout(5000)});
  if(!modeResponse.ok)throw Error("CONTEXT_UNAVAILABLE");
  const modes=await modeResponse.json() as {payload?:{scope?:string}}[];
  const scope=modes[0]?.payload?.scope;
  if(scope!=="real"&&scope!=="simulation")throw Error("CONTEXT_UNAVAILABLE");
  const start=new Date(Date.now()-30*86400000).toISOString().slice(0,10);
  const end=new Date().toISOString().slice(0,10);
  const params=new URLSearchParams({select:"id,payload",limit:"501","payload->>date":`gte.${start}`,and:`(payload->>date.lte.${end})`});
  if(!privileged)params.set("payload->>prevendeurId",`eq.${account.id}`);
  const response=await fetch(`${SB_URL}/rest/v1/fl_commandes?${params}`,{headers:sbServiceHeaders(),signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw Error("CONTEXT_UNAVAILABLE");
  const rows=await response.json() as {id:string;payload:Record<string,unknown>}[];
  if(!Array.isArray(rows))throw Error("CONTEXT_UNAVAILABLE");
  const truncated=rows.length>500;
  const selected=rows.slice(0,500).filter(r=>{
    const p=r.payload;
    if(!p||(!privileged&&p.prevendeurId!==account.id))return false;
    const simulation=p.isSimulation===true||r.id.startsWith("SIM-")||String(p.sourceImport??"").startsWith("simulation_");
    return simulation===(scope==="simulation")&&!["refuse","retour"].includes(String(p.statut));
  });
  // Counts only: do not expose contacts, financial balances, HR, or entire order payloads.
  const counts:Record<string,number>={};for(const r of selected){const status=String(r.payload.statut??"inconnu");counts[status]=(counts[status]??0)+1;}
  return JSON.stringify({source:"fl_commandes",readAt:new Date().toISOString(),period:{start,end},scope,coverage:truncated?"Échantillon limité à 500 lignes, pas un total exhaustif":"Période consultée",access:privileged?"Super Super Admin":"Commandes assignées au compte",count:selected.length,byStatus:counts,sourceIds:selected.slice(0,20).map(r=>r.id),notice:scope==="simulation"?"Données simulées, aucune vente réelle prouvée":"Un carnet de commandes n'est pas un encaissement"});
}
