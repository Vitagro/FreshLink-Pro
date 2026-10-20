export type OrderScope = "real" | "simulation"
export function isSimulationOrder(order: { id: string; isSimulation?: boolean; sourceImport?: string }): boolean {
  return order.isSimulation === true || order.id.startsWith("SIM-") || (order.sourceImport ?? "").startsWith("simulation_")
}
export function selectOrderScope<T extends { id: string; statut: string }>(orders: T[], scope: OrderScope): T[] {
  return orders.filter(order => isSimulationOrder(order) === (scope === "simulation") && !["refuse", "retour"].includes(order.statut))
}
export function lineWeightKg(line: { quantite: number; unite?: string }, catalogueUnit?: string): number {
  const quantity = Number(line.quantite)
  if (!Number.isFinite(quantity) || quantity < 0) return 0
  const unit = (line.unite || catalogueUnit || "").trim().toLowerCase()
  if (["kg", "kilogramme", "kilogrammes"].includes(unit)) return quantity
  if (["t", "tonne", "tonnes"].includes(unit)) return quantity * 1000
  if (["g", "gramme", "grammes"].includes(unit)) return quantity / 1000
  return 0 // No invented conversion for pieces, crates, or unknown units.
}
export function selectPeriod<T extends { date: string }>(orders: T[], start: string, end: string): T[] {
  if (!start || !end || start > end) return []
  return orders.filter(order => order.date >= start && order.date <= end)
}
export const ORDER_STATUS_LABELS: Record<string, string> = {
  en_attente: "À valider", en_attente_approbation: "Approbation attendue", valide: "Validée",
  en_preparation: "En préparation", charge: "Chargée", en_transit: "En livraison",
  livre: "Livrée", refuse: "Refusée", retour: "Retournée",
}
