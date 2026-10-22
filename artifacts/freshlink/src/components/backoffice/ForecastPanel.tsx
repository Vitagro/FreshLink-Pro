"use client";
import { useState } from "react";
import { type Article, type Commande } from "@/lib/store";
import { readBatchTable } from "@/lib/orderBatch";
import { forecastDemand, replenishment } from "@/lib/operationalPlanning";

type Forecast = ReturnType<typeof forecastDemand>;
export default function ForecastPanel() {
  const [data, setData] = useState<Forecast>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [readAt, setReadAt] = useState("");
  const [articleId, setArticleId] = useState("");
  const [lead, setLead] = useState("1"),
    [safety, setSafety] = useState("0"),
    [stock, setStock] = useState(""),
    [incoming, setIncoming] = useState("0");
  const [confirmed, setConfirmed] = useState(false);
  async function calculate() {
    setBusy(true);
    setError("");
    setData(undefined);
    setConfirmed(false);
    try {
      const [articles, orders] = await Promise.all([
        readBatchTable<Article>("fl_articles"),
        readBatchTable<Commande>("fl_commandes"),
      ]);
      const now = new Date();
      setData(forecastDemand(articles, orders, now.toISOString().slice(0, 10)));
      setReadAt(now.toLocaleString("fr-FR"));
      setArticleId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lecture indisponible");
    } finally {
      setBusy(false);
    }
  }
  const selected = data?.lines.find((l) => l.articleId === articleId);
  let need: number | null = null;
  try {
    if (
      selected &&
      stock.trim() &&
      lead.trim() &&
      safety.trim() &&
      incoming.trim()
    )
      need = replenishment(
        selected.daily,
        Number(lead),
        Number(safety),
        Number(stock),
        Number(incoming),
      );
  } catch {
    /* invalid input must not become a zero requirement */
  }
  return (
    <section className="max-w-6xl mx-auto p-5 space-y-5">
      <h2 className="text-xl font-bold">
        Prévisions et réassort — sans clé IA
      </h2>
      <p>
        Calcul à la demande sur les commandes réelles marquées livrées. Aucune
        commande fournisseur ni livraison automatique.
      </p>
      <button
        disabled={busy}
        onClick={() => void calculate()}
        className="bg-emerald-700 text-white rounded px-4 py-2 disabled:opacity-50"
      >
        {busy ? "Lecture complète…" : "Actualiser et calculer"}
      </button>
      {error && (
        <p role="alert" className="text-red-700">
          {error} Aucun calcul publié.
        </p>
      )}
      {data && (
        <>
          <p role="status">
            Source : Supabase, lecture paginée à {readAt}. Période UTC :{" "}
            {data.period.start} au {data.period.end}. {data.excludedOrders}{" "}
            commandes hors périmètre ; {data.excludedLines} lignes sans
            quantité/unité exploitable exclues.
          </p>
          <p className="text-sm">
            Estimation : 50 % de la moyenne sur 28 jours et 50 % de la moyenne
            des quatre mêmes jours de semaine. Moins de quatre jours de vente :
            historique insuffisant. Les jours sans commande comptent pour zéro ;
            les ruptures, promotions et retours partiels ne sont pas corrigés.
            Vérifiez la couverture métier avant décision.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr>
                  {[
                    "Article",
                    "Unité",
                    "Jours avec ventes",
                    "Demande indicative J",
                    "Stock catalogue",
                  ].map((h) => (
                    <th key={h} className="p-2 border-b">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.lines.map((l) => (
                  <tr key={l.articleId}>
                    <td className="p-2">{l.articleNom}</td>
                    <td>{l.unite}</td>
                    <td>{l.activeDays}/28</td>
                    <td>
                      {l.daily === null
                        ? "Historique insuffisant"
                        : l.daily.toLocaleString("fr-FR")}
                    </td>
                    <td>{l.stock ?? "Inconnu"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-xl border p-4 space-y-3">
            <h3 className="font-bold">Préparer un besoin à vérifier</h3>
            <label className="block">
              Article
              <select
                className="block border p-2"
                value={articleId}
                onChange={(e) => {
                  setArticleId(e.target.value);
                  setStock("");
                  setConfirmed(false);
                }}
              >
                <option value="">Choisir</option>
                {data.lines.map((l) => (
                  <option key={l.articleId} value={l.articleId}>
                    {l.articleNom} ({l.unite})
                  </option>
                ))}
              </select>
            </label>
            {selected && (
              <>
                <p>
                  Unité : {selected.unite}. Le stock utilisable doit exclure les
                  réservations et produits impropres. Le stock catalogue n'est
                  pas validé automatiquement.
                </p>
                {[
                  ["Délai à couvrir (jours)", lead, setLead],
                  ["Stock de sécurité", safety, setSafety],
                  ["Stock utilisable vérifié", stock, setStock],
                  ["Arrivages confirmés sur ce délai", incoming, setIncoming],
                ].map(([label, value, setter]) => (
                  <label className="block" key={String(label)}>
                    {String(label)}
                    <input
                      className="block border p-2"
                      type="number"
                      min={label === "Délai à couvrir (jours)" ? 1 : 0}
                      step="any"
                      value={String(value)}
                      onChange={(e) => {
                        (setter as (v: string) => void)(e.target.value);
                        setConfirmed(false);
                      }}
                    />
                  </label>
                ))}
                <label className="flex gap-2">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  J'ai vérifié l'historique, le stock, les réservations et les
                  arrivages.
                </label>
                <p role="status">
                  {need === null
                    ? "Calcul indisponible : historique ou paramètres insuffisants."
                    : confirmed
                      ? `Besoin proposé : ${need} ${selected.unite}. À saisir dans un bon d’achat après choix du fournisseur et confirmation du tarif.`
                      : "Vérifiez les paramètres pour afficher le besoin proposé."}
                </p>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
