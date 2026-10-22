/** Deterministic planning. No provider, business writes, or inferred unit conversions. */
export type PlanningArticle = {
  id: string;
  nom: string;
  unite: string;
  stockDisponible?: number;
  actif?: boolean;
};
type PlanningOrder = {
  id: string;
  date: string;
  statut: string;
  isSimulation?: boolean;
  sourceImport?: string;
  lignes?: { articleId: string; quantite: number; unite?: string }[];
};
const dayMs = 86400000;
const normalize = (value: string) => value.trim().toLocaleLowerCase("fr");
export function forecastDemand(
  articles: PlanningArticle[],
  orders: PlanningOrder[],
  asOf: string,
) {
  const end = Date.parse(`${asOf}T00:00:00Z`);
  if (
    !Number.isFinite(end) ||
    new Date(end).toISOString().slice(0, 10) !== asOf
  )
    throw Error("Date de prévision invalide");
  const start = end - 28 * dayMs;
  let excludedOrders = 0,
    excludedLines = 0;
  const days = new Map<string, Map<string, number>>();
  const catalogue = new Map(articles.map((a) => [a.id, a]));
  const seen = new Set<string>();
  for (const order of orders) {
    if (seen.has(order.id)) continue;
    seen.add(order.id);
    const timestamp = Date.parse(`${order.date.slice(0, 10)}T00:00:00Z`);
    if (
      order.isSimulation === true ||
      order.id.startsWith("SIM-") ||
      order.sourceImport?.startsWith("simulation_") ||
      order.statut !== "livre" ||
      !Number.isFinite(timestamp) ||
      timestamp < start ||
      timestamp >= end
    ) {
      excludedOrders++;
      continue;
    }
    for (const line of order.lignes ?? []) {
      const article = catalogue.get(line.articleId);
      if (
        !article ||
        !line.unite ||
        normalize(line.unite) !== normalize(article.unite) ||
        !Number.isFinite(line.quantite) ||
        line.quantite <= 0
      ) {
        excludedLines++;
        continue;
      }
      const series = days.get(article.id) ?? new Map<string, number>();
      const date = new Date(timestamp).toISOString().slice(0, 10);
      series.set(date, (series.get(date) ?? 0) + line.quantite);
      days.set(article.id, series);
    }
  }
  return {
    period: {
      start: new Date(start).toISOString().slice(0, 10),
      end: new Date(end - dayMs).toISOString().slice(0, 10),
    },
    excludedOrders,
    excludedLines,
    lines: articles
      .filter((a) => a.actif !== false)
      .map((article) => {
        const series = days.get(article.id) ?? new Map<string, number>();
        const sum = [...series.values()].reduce((a, b) => a + b, 0);
        const activeDays = series.size;
        // Sparse histories remain unknown rather than a confident zero-sales forecast.
        const forecast = activeDays >= 4 ? sum / 28 : null;
        const sameWeekday = [7, 14, 21, 28].map(
          (offset) =>
            series.get(
              new Date(end - offset * dayMs).toISOString().slice(0, 10),
            ) ?? 0,
        );
        return {
          articleId: article.id,
          articleNom: article.nom,
          unite: article.unite,
          activeDays,
          total: sum,
          daily:
            forecast === null
              ? null
              : Math.round(
                  (0.5 * forecast +
                    (0.5 * sameWeekday.reduce((a, b) => a + b, 0)) / 4) *
                    100,
                ) / 100,
          stock:
            Number.isFinite(article.stockDisponible) &&
            article.stockDisponible! >= 0
              ? article.stockDisponible!
              : null,
        };
      }),
  };
}
export function replenishment(
  daily: number | null,
  leadDays: number,
  safety: number,
  usableStock: number,
  incoming: number,
) {
  if (daily === null) return null;
  if (
    ![daily, leadDays, safety, usableStock, incoming].every(Number.isFinite) ||
    daily < 0 ||
    leadDays < 1 ||
    leadDays > 30 ||
    safety < 0 ||
    usableStock < 0 ||
    incoming < 0
  )
    throw Error("Paramètres de réassort invalides");
  return (
    Math.ceil(
      Math.max(0, daily * leadDays + safety - usableStock - incoming) * 100,
    ) / 100
  );
}
export type Point = { lat: number; lng: number };
export const validPoint = (p: Point) =>
  Number.isFinite(p.lat) &&
  Number.isFinite(p.lng) &&
  Math.abs(p.lat) <= 90 &&
  Math.abs(p.lng) <= 180;
export function distanceKm(a: Point, b: Point) {
  const rad = Math.PI / 180,
    dLat = (b.lat - a.lat) * rad,
    dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
/** Open route, fixed departure. Missing GPS stays at the end; no road/ETA claims. */
export function proposeRoute(
  start: Point,
  stops: ({ id: string } & Partial<Point>)[],
) {
  if (
    !validPoint(start) ||
    stops.length > 150 ||
    new Set(stops.map((s) => s.id)).size !== stops.length
  )
    throw Error("Départ invalide, doublon ou plus de 150 arrêts");
  const located = stops.filter((s) => validPoint(s as Point)) as ({
    id: string;
  } & Point)[];
  const missing = stops.filter((s) => !validPoint(s as Point)).map((s) => s.id);
  const length = (route: typeof located) =>
    route.reduce(
      (total, p, i) => total + distanceKm(i ? route[i - 1] : start, p),
      0,
    );
  const original = length(located),
    remaining = [...located],
    nearest: typeof located = [];
  let current = start;
  while (remaining.length) {
    let best = 0;
    for (let i = 1; i < remaining.length; i++)
      if (
        distanceKm(current, remaining[i]) < distanceKm(current, remaining[best])
      )
        best = i;
    current = remaining[best];
    nearest.push(remaining.splice(best, 1)[0]);
  }
  let route = length(nearest) < original ? nearest : [...located];
  // Bounded 2-opt improves the proposal without ever increasing straight-line distance.
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let i = 0; i < route.length - 1; i++)
      for (let j = i + 1; j < route.length; j++) {
        const before = i ? route[i - 1] : start,
          after = route[j + 1];
        const old =
          distanceKm(before, route[i]) +
          (after ? distanceKm(route[j], after) : 0);
        const next =
          distanceKm(before, route[j]) +
          (after ? distanceKm(route[i], after) : 0);
        if (next + 1e-8 < old) {
          route = [
            ...route.slice(0, i),
            ...route.slice(i, j + 1).reverse(),
            ...route.slice(j + 1),
          ];
          changed = true;
        }
      }
    if (!changed) break;
  }
  return {
    ids: [...route.map((s) => s.id), ...missing],
    missing,
    beforeKm: original,
    afterKm: length(route),
  };
}
