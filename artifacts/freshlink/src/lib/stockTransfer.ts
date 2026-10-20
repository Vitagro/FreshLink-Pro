export function transferBalances(available: number, defective: number, quantity: number, direction: string) {
  if (![available, defective, quantity].every(Number.isFinite) || available < 0 || defective < 0 || quantity <= 0)
    throw new Error("Quantité ou stock invalide.")
  if (direction !== "conforme_vers_defect" && direction !== "defect_vers_conforme")
    throw new Error("Sens du transfert invalide.")
  const source = direction === "conforme_vers_defect" ? available : defective
  if (quantity > source) throw new Error("Quantité supérieure au stock disponible à transférer.")
  return direction === "conforme_vers_defect"
    ? { stockDisponible: available - quantity, stockDefect: defective + quantity }
    : { stockDisponible: available + quantity, stockDefect: defective - quantity }
}
