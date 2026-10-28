import type { MissionAlert } from "@/lib/missionGuidance"
export default function MissionAlerts({alerts}:{alerts:MissionAlert[]}){
 if(!alerts.length)return null;
 return <section aria-label="Conseils avant validation" className="rounded-xl border border-amber-300 bg-card p-4 space-y-3"><h3 className="font-semibold text-foreground">Points à vérifier avant validation</h3><p className="text-xs text-muted-foreground">Contrôles calculés sur votre saisie et les données chargées. Ils ne réservent pas le stock.</p><ul className="space-y-3">{alerts.map(a=><li key={a.code}><p className="font-medium text-sm text-foreground">{a.message}</p><p className="text-sm text-muted-foreground">{a.action}</p></li>)}</ul></section>
}
