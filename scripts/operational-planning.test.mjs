import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
async function load(path) {
  const code = ts.transpileModule(
    fs.readFileSync(new URL(path, import.meta.url), "utf8"),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    },
  ).outputText;
  return import(
    "data:text/javascript;base64," + Buffer.from(code).toString("base64")
  );
}
const { forecastDemand, replenishment, proposeRoute } = await load(
  "../artifacts/freshlink/src/lib/operationalPlanning.ts",
);
const { resolveOrderDraft } = await load(
  "../artifacts/freshlink/src/lib/orderDraft.ts",
);
const article = { id: "a", nom: "Tomate", unite: "kg", stockDisponible: 10 };
const order = (id, date = "2026-10-21", extra = {}) => ({
  id,
  date,
  statut: "livre",
  lignes: [{ articleId: "a", quantite: 28, unite: "kg" }],
  ...extra,
});
test("forecast excludes all simulation markers, pending, future, old and duplicate orders", () => {
  const source = [
    order("a", "2026-10-21"),
    order("b", "2026-10-14"),
    order("c", "2026-10-07"),
    order("d", "2026-09-30"),
  ];
  const dirty = [
    ...source,
    source[0],
    order("SIM-1"),
    order("s2", undefined, { isSimulation: true }),
    order("s3", undefined, { sourceImport: "simulation_v1" }),
    order("pending", undefined, { statut: "valide" }),
    order("today", "2026-10-22"),
    order("future", "2027-01-01"),
    order("old", "2026-09-01"),
  ];
  assert.deepEqual(
    forecastDemand([article], dirty, "2026-10-22").lines,
    forecastDemand([article], source, "2026-10-22").lines,
  );
  assert.equal(
    forecastDemand([article], dirty, "2026-10-22").lines[0].total,
    112,
  );
});
test("unit mismatch, missing units, negative and invalid quantities never add demand", () => {
  const result = forecastDemand(
    [article],
    [
      order("a", undefined, {
        lignes: [
          { articleId: "a", quantite: 9, unite: "caisse" },
          { articleId: "a", quantite: 9 },
          { articleId: "a", quantite: -9, unite: "kg" },
        ],
      }),
    ],
    "2026-10-22",
  );
  assert.equal(result.excludedLines, 3);
  assert.equal(result.lines[0].daily, null);
});
test("four matching weekdays contribute to demand; insufficient history is unknown", () => {
  const result = forecastDemand(
    [article],
    [7, 14, 21, 28].map((n, i) =>
      order(
        String(i),
        new Date(Date.parse("2026-10-22") - n * 86400000)
          .toISOString()
          .slice(0, 10),
      ),
    ),
    "2026-10-22",
  );
  assert.equal(result.lines[0].daily, 16);
  assert.equal(result.lines[0].activeDays, 4);
  assert.equal(
    forecastDemand([article], [], "2026-10-22").lines[0].daily,
    null,
  );
  assert.throws(() => forecastDemand([], [], "2026-02-30"));
});
test("replenishment subtracts usable stock and incoming, never silently accepts invalid inputs", () => {
  assert.equal(replenishment(10, 3, 5, 8, 7), 20);
  assert.equal(replenishment(10, 1, 0, 100, 0), 0);
  assert.equal(replenishment(null, 1, 0, 0, 0), null);
  assert.throws(() => replenishment(10, 0, 0, 0, 0));
  assert.throws(() => replenishment(10, 1, 0, NaN, 0));
});
test("route conserves stops and improves or keeps distance, valid zero coordinates", () => {
  const result = proposeRoute({ lat: 0, lng: 0 }, [
    { id: "far", lat: 0, lng: 3 },
    { id: "near", lat: 0, lng: 1 },
    { id: "middle", lat: 0, lng: 2 },
    { id: "unknown" },
  ]);
  assert.deepEqual(
    new Set(result.ids),
    new Set(["far", "near", "middle", "unknown"]),
  );
  assert.ok(result.afterKm <= result.beforeKm);
  assert.equal(result.ids.at(-1), "unknown");
  assert.deepEqual(result.missing, ["unknown"]);
  assert.throws(() => proposeRoute({ lat: 91, lng: 0 }, []));
  assert.throws(() =>
    proposeRoute({ lat: 0, lng: 0 }, [{ id: "a" }, { id: "a" }]),
  );
});
test("route remains bounded with 150 stops and no regressions across deterministic samples", () => {
  for (let seed = 1; seed < 8; seed++) {
    const stops = Array.from({ length: 150 }, (_, i) => ({
      id: String(i),
      lat: 30 + Math.sin(i * seed),
      lng: -6 + Math.cos(i * seed),
    }));
    const r = proposeRoute({ lat: 33, lng: -7 }, stops);
    assert.equal(new Set(r.ids).size, 150);
    assert.ok(r.afterKm <= r.beforeKm + 1e-7);
  }
});
const client = { id: "c", nom: "Restaurant Exemple" };
const draft = {
  customer: client.nom,
  lines: [{ article: "Tomate", quantity: 3, unit: "kg" }],
};
test("draft resolves catalogue identities and ERP price, never model price", () => {
  const r = resolveOrderDraft(draft, [client], [article], () => 12);
  assert.equal(r.client.id, "c");
  assert.deepEqual(r.lines, [
    { articleId: "a", quantite: "3", prixVente: "12", uniteMode: "base" },
  ]);
});
test("draft rejects foreign or ambiguous clients, articles, invented units and missing prices", () => {
  assert.throws(() => resolveOrderDraft(draft, [], [article], () => 12));
  assert.throws(() =>
    resolveOrderDraft(
      draft,
      [client, { ...client, id: "d" }],
      [article],
      () => 12,
    ),
  );
  assert.throws(() =>
    resolveOrderDraft(
      draft,
      [client],
      [article, { ...article, id: "b" }],
      () => 12,
    ),
  );
  assert.throws(() => resolveOrderDraft(draft, [client], [article], () => 0));
  assert.throws(() =>
    resolveOrderDraft(
      { ...draft, lines: [{ article: "Tomate", quantity: 3, unit: "caisse" }] },
      [client],
      [article],
      () => 12,
    ),
  );
  assert.throws(() =>
    resolveOrderDraft(
      { ...draft, lines: [{ article: "Tomate", quantity: -3, unit: "kg" }] },
      [client],
      [article],
      () => 12,
    ),
  );
});
test("draft accepts packaging only with explicit catalogue conversion", () => {
  const r = resolveOrderDraft(
    { ...draft, lines: [{ article: "Tomate", quantity: 2, unit: "Caisse" }] },
    [client],
    [{ ...article, um: "Caisse", colisageParUM: 15 }],
    () => 12,
  );
  assert.equal(r.lines[0].uniteMode, "Caisse");
  assert.equal(r.lines[0].quantite, "2");
});

test("server read policy blocks portals and separates HR, finance and field accounts", async () => {
  const { canSyncRead, projectSyncRows } = await load(
    "../artifacts/api-server/src/lib/syncReadPolicy.ts",
  );
  for (const role of ["client", "client_gerant", "fournisseur", "unknown"])
    assert.equal(canSyncRead(role, "fl_commandes"), false);
  for (const table of [
    "fl_salaries",
    "fl_contrats",
    "fl_paiements",
    "fl_caisse_entries",
    "fl_email_config",
  ])
    assert.equal(canSyncRead("prevendeur", table), false);
  assert.equal(canSyncRead("rh_manager", "fl_salaries"), true);
  assert.equal(canSyncRead("rh_manager", "fl_paiements"), false);
  assert.equal(canSyncRead("financier", "fl_paiements"), true);
  assert.equal(canSyncRead("financier", "fl_salaries"), false);
  assert.equal(canSyncRead("super_super_admin", "fl_salaries"), true);
  const rows = [
    {
      id: "u",
      payload: {
        name: "Example",
        role: "admin",
        actif: true,
        password: "secret",
        passwordMobile: "secret",
        email: "private",
        salaire: 100,
      },
    },
  ];
  const directory = projectSyncRows("prevendeur", "fl_users", rows);
  assert.deepEqual(Object.keys(directory[0].payload).sort(), [
    "actif",
    "id",
    "name",
    "role",
  ]);
  assert.ok(!JSON.stringify(directory).includes("secret"));
});
