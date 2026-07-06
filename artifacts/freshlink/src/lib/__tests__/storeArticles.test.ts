import { describe, it, expect, beforeEach } from "vitest"
import { store } from "@/lib/store"

function seed(articles: unknown[]) {
  localStorage.setItem("fl_articles", JSON.stringify(articles))
}

beforeEach(() => localStorage.clear())

describe("store.getArticles — déduplication", () => {
  it("déduplique par id (une seule entrée par id)", () => {
    seed([
      { id: "x", nom: "Tomate", prixAchat: 5 },
      { id: "x", nom: "Tomate", prixAchat: 7 },
    ])
    expect(store.getArticles().filter(a => a.id === "x")).toHaveLength(1)
  })

  it("fusionne les doublons de nom (FR) à id différent en gardant le plus complet", () => {
    seed([
      { id: "a1", nom: "Tomate", prixAchat: 5, stockDisponible: 10 },
      { id: "a2", nom: "Tomate", nomAr: "طماطم", prixAchat: 6 },
      { id: "a3", nom: "Carotte", prixAchat: 3 },
    ])
    const arts = store.getArticles()
    const tomates = arts.filter(a => a.nom.toLowerCase() === "tomate")
    expect(tomates).toHaveLength(1)
    // L'enregistrement le plus complet (avec nom arabe) est conservé
    expect(tomates[0].nomAr).toBe("طماطم")
    // Les articles réellement distincts ne sont pas perdus
    expect(arts.some(a => a.nom === "Carotte")).toBe(true)
  })

  it("normalise les champs même si le payload est partiel", () => {
    seed([{ id: "p1" }])
    const a = store.getArticles().find(x => x.id === "p1")!
    expect(typeof a.nom).toBe("string")
    expect(a.unite).toBe("kg")          // défaut
    expect(a.stockDisponible).toBe(0)   // défaut numérique
  })
})
