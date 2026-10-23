export function markupPercent(cost: number, price: number): number | null {
  return Number.isFinite(cost) && cost > 0 && Number.isFinite(price) ? (price - cost) / cost * 100 : null
}
export function stockTotalsByUnit(articles: {unite?: string; stockDisponible: number; stockDefect: number}[], field: 'stockDisponible' | 'stockDefect'): [string, number][] {
  const totals = new Map<string, number>()
  for (const a of articles) {
    if (!Number.isFinite(a[field])) continue
    const unit = a.unite?.trim() || 'unité non renseignée'
    totals.set(unit, (totals.get(unit) ?? 0) + a[field])
  }
  return [...totals].sort(([a], [b]) => a.localeCompare(b, 'fr'))
}
