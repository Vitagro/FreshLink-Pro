export interface OrderDraft {
  customer: string | null;
  lines: {
    article: string | null;
    quantity: number | null;
    unit: string | null;
    evidence?: string;
  }[];
  questions?: string[];
}
const name = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
/** Resolve only exact, unique catalogue matches; never invent IDs, units or prices. */
export function resolveOrderDraft<
  C extends { id: string; nom: string },
  A extends {
    id: string;
    nom: string;
    unite: string;
    um?: string;
    colisageParUM?: number;
    actif?: boolean;
  },
>(
  draft: OrderDraft,
  clients: C[],
  articles: A[],
  price: (a: A, c: C) => number,
) {
  if (
    !draft ||
    typeof draft.customer !== "string" ||
    !draft.customer.trim() ||
    !Array.isArray(draft.lines) ||
    !draft.lines.length ||
    draft.lines.length > 100
  )
    throw Error("Client et lignes obligatoires (100 maximum).");
  const candidates = clients.filter(
    (c) => name(c.nom) === name(draft.customer!),
  );
  if (candidates.length !== 1)
    throw Error(
      "Client absent du portefeuille ou nom ambigu : choisissez-le dans le formulaire manuel.",
    );
  const client = candidates[0];
  const lines = draft.lines.map((line) => {
    if (
      typeof line.article !== "string" ||
      typeof line.unit !== "string" ||
      typeof line.quantity !== "number" ||
      !Number.isFinite(line.quantity) ||
      line.quantity <= 0
    )
      throw Error(
        "Chaque ligne exige un article, une quantité positive et une unité.",
      );
    const matches = articles.filter(
      (a) => a.actif !== false && name(a.nom) === name(line.article!),
    );
    if (matches.length !== 1)
      throw Error(`Article absent ou ambigu : ${line.article}`);
    const article = matches[0];
    let uniteMode = "base";
    if (name(line.unit) !== name(article.unite)) {
      if (
        !article.um ||
        name(line.unit) !== name(article.um) ||
        !Number.isFinite(article.colisageParUM) ||
        article.colisageParUM! <= 0
      )
        throw Error(
          `Unité non reconnue : ${line.article} (${line.unit}). Aucune conversion inventée.`,
        );
      uniteMode = article.um;
    }
    const pv = price(article, client);
    if (!Number.isFinite(pv) || pv <= 0)
      throw Error(`Tarif ERP absent : ${article.nom}`);
    return {
      articleId: article.id,
      quantite: String(line.quantity),
      prixVente: String(pv),
      uniteMode,
    };
  });
  return { client, lines };
}
