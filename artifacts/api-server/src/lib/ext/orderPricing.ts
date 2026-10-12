import { catalogueViewFields } from "./catalogueView.js";

export function priceOrder(lines: unknown[], catalogue: Record<string, unknown>[]) {
  if (!lines.length || lines.length > 200) throw new Error("Panier invalide.");
  const byId = new Map(catalogue.map(a => [String(a.id), a]));
  const result = lines.map(value => {
    if (!value || typeof value !== "object") throw new Error("Article invalide.");
    const line = value as Record<string, unknown>;
    const article = byId.get(String(line.articleId));
    const quantity = Number(line.quantite);
    if (!article || article.marketplace_actif !== true) throw new Error("Article indisponible dans le catalogue.");
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) throw new Error("Quantité invalide.");
    const fields = catalogueViewFields(article);
    const price = Number(fields.prix);
    if (!Number.isFinite(price) || price <= 0) throw new Error("Prix sur devis : contactez notre équipe pour cet article.");
    return { articleId: String(article.id), articleNom: String(article.nom ?? ""), unite: String(article.unite ?? "kg"),
      quantite: quantity, prixUnitaire: price, prixVente: price,
      total: Math.round(price * quantity * 100) / 100, surCommande: fields.statut !== "disponible" };
  });
  return { lignes: result, subtotal: Math.round(result.reduce((s, l) => s + l.total, 0) * 100) / 100 };
}
