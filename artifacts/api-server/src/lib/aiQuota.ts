import { SB_URL, SB_SERVICE_KEY, sbServiceHeaders } from "./ext/supabaseEnv.js";
export async function reserveAiCall(userId:string):Promise<boolean> {
  if(!SB_SERVICE_KEY)throw Error("QUOTA_UNAVAILABLE");
  const response=await fetch(`${SB_URL}/rest/v1/rpc/fl_ai_reserve`,{
    method:"POST",headers:sbServiceHeaders(),signal:AbortSignal.timeout(5000),
    body:JSON.stringify({p_user:userId,p_daily:100,p_global:1000,p_minute:10}),
  });
  if(!response.ok)throw Error("QUOTA_UNAVAILABLE");
  const allowed=await response.json();
  if(typeof allowed!=="boolean")throw Error("QUOTA_UNAVAILABLE");
  return allowed;
}
