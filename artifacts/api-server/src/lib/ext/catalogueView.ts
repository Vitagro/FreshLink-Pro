/** Preserve the already-computed public fields of the Supabase catalogue view.
 * Missing stock is unknown, not zero: older views do not expose that column.
 */
export function catalogueViewFields(row: Record<string, unknown>): Record<string, unknown> {
  const price = Number(row.prix_public ?? row.marketplace_prix_public ?? 0);
  const promoPrice = row.promo_prix == null ? null : Number(row.promo_prix);
  const promoActive = row.promo_actif !== false && promoPrice != null && promoPrice > 0;
  const stock = row.stock_disponible == null ? null : Number(row.stock_disponible);
  return {
    prix_public: price,
    prixVente: price,
    prix: promoActive ? promoPrice : price,
    promo_prix: promoActive ? promoPrice : null,
    etiquette: promoActive ? row.etiquette ?? null : null,
    statut: row.statut ?? (stock == null ? "disponible" : stock > 0 ? "disponible" : "out_of_stock"),
    stock_disponible: stock,
    stockDisponible: stock,
    description: row.description ?? "",
    ordre: Number(row.ordre ?? 999),
    marketplace_actif: row.marketplace_actif === true,
  };
}
