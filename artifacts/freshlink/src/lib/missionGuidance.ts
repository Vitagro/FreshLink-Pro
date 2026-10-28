export type MissionAlert={code:string;message:string;action:string}
type Product={id:string;nom:string;unite:string;stockDisponible?:number;prixAchat?:number;actif?:boolean;um?:string;colisageParUM?:number}
type Line={articleId:string;quantite:string;prixVente:string;uniteMode:string}
export function commercialGuidance(lines:Line[],products:Product[]):MissionAlert[]{
 const alerts:MissionAlert[]=[],quantities=new Map<string,number>();
 for(const [i,line] of lines.entries()){
  if(!line.articleId)continue;
  const p=products.find(p=>p.id===line.articleId);if(!p){alerts.push({code:`missing-${i}`,message:"Article absent du catalogue chargé.",action:"Actualisez le catalogue avant validation."});continue;}
  if(p.actif===false)alerts.push({code:`inactive-${i}`,message:`${p.nom} : article désactivé.`,action:"Choisissez un article actif ou contactez le responsable."});
  const qty=Number(line.quantite.replace(',','.')),price=Number(line.prixVente.replace(',','.'));
  if(!Number.isFinite(qty)||qty<=0){alerts.push({code:`qty-${i}`,message:`${p.nom} : quantité à vérifier.`,action:"Saisissez une quantité strictement positive."});continue;}
  const um=line.uniteMode!=="base";
  if(um&&(!p.um||line.uniteMode!==p.um||!p.colisageParUM||p.colisageParUM<=0)){alerts.push({code:`unit-${i}`,message:`${p.nom} : conversion de conditionnement inconnue.`,action:"Choisissez l’unité de base ou faites confirmer le colisage."});continue;}
  quantities.set(p.id,(quantities.get(p.id)||0)+qty*(um?p.colisageParUM!:1));
  if(!line.prixVente.trim()||!Number.isFinite(price)||price<=0)alerts.push({code:`price-${i}`,message:`${p.nom} : prix de vente à confirmer.`,action:"Vérifiez le tarif appliqué avant l’enregistrement."});
  else if(typeof p.prixAchat==='number'&&p.prixAchat>0&&price<p.prixAchat)alerts.push({code:`loss-${i}`,message:`${p.nom} : vente sous le prix d’achat renseigné, avant charges.`,action:"Revoyez le prix ou demandez une validation au responsable."});
 }
 for(const [id,qty] of quantities){const p=products.find(p=>p.id===id)!;
  if(typeof p.stockDisponible==='number'&&Number.isFinite(p.stockDisponible)&&qty>p.stockDisponible)alerts.push({code:`stock-${id}`,message:`${p.nom} : ${qty.toLocaleString('fr-MA')} ${p.unite} demandés pour ${p.stockDisponible.toLocaleString('fr-MA')} ${p.unite} dans le stock chargé.`,action:"Confirmez la disponibilité avec le magasin avant de promettre la livraison."});
  if(lines.filter(l=>l.articleId===id).length>1)alerts.push({code:`duplicate-${id}`,message:`${p.nom} figure sur plusieurs lignes.`,action:"Vérifiez le cumul ou regroupez les lignes si le doublon est involontaire."});
 }
 return alerts;
}
export function purchaseGuidance(price:number,reference:number|undefined):string{
 if(!Number.isFinite(price)||price<=0)return "Saisissez une offre positive dans l’unité de base de l’article.";
 if(typeof reference!=='number'||!Number.isFinite(reference)||reference<=0)return "Prix d’achat de référence absent : comparez des offres de même unité, qualité, taxes et transport avant de décider.";
 const delta=(price-reference)/reference*100;
 return `Offre ${Math.abs(delta).toFixed(1)} % ${delta>=0?'au-dessus':'en dessous'} du prix d’achat renseigné (${reference.toFixed(2)} DH par unité de base). ${delta>0?'Négociez ou vérifiez si la qualité et les frais justifient cet écart.':'Vérifiez la qualité physique, les frais et les conditions avant de retenir cette offre.'} Cette référence n’est pas un prix de marché en temps réel.`;
}
