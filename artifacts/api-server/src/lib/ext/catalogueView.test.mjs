import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogueViewFields } from "./catalogueView.ts";

test("flat Supabase view keeps its selling price and availability without inventing stock", () => {
  const result = catalogueViewFields({ prix_public: 17, statut: "disponible", marketplace_actif: true, ordre: 0 });
  assert.equal(result.prix_public, 17);
  assert.equal(result.prix, 17);
  assert.equal(result.statut, "disponible");
  assert.equal(result.stock_disponible, null);
  assert.equal(result.ordre, 0);
});

test("explicit stock, seasonal status and zero price are preserved", () => {
  const result = catalogueViewFields({ prix_public: 0, marketplace_prix_public: 20, statut: "hors_saison", stock_disponible: 0 });
  assert.equal(result.prix, 0);
  assert.equal(result.statut, "hors_saison");
  assert.equal(result.stock_disponible, 0);
});

test("active promotion uses the promotional price; disabled promotion does not", () => {
  assert.equal(catalogueViewFields({ prix_public: 17, promo_prix: 12, promo_actif: true }).prix, 12);
  assert.equal(catalogueViewFields({ prix_public: 17, promo_prix: 12, promo_actif: false }).prix, 17);
});

test("public mapping does not pass through purchase prices or private payload", () => {
  const result = catalogueViewFields({ prix_public: 17, prix_achat: 8, payload: { secret: true } });
  assert.equal("prix_achat" in result, false);
  assert.equal("payload" in result, false);
});
