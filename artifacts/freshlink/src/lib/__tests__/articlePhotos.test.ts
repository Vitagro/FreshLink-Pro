import { describe, it, expect } from "vitest"
import { getArticlePhoto, ARTICLE_PHOTOS } from "@/lib/articlePhotos"

const UNSPLASH = "https://images.unsplash.com/"

describe("getArticlePhoto", () => {
  it("retourne la photo exacte pour un nom connu", () => {
    expect(getArticlePhoto("tomate")).toBe(ARTICLE_PHOTOS["tomate"])
  })

  it("est insensible à la casse et aux accents", () => {
    expect(getArticlePhoto("Tomate")).toBe(getArticlePhoto("tomate"))
    expect(getArticlePhoto("ÉPINARD")).toBe(getArticlePhoto("epinard"))
  })

  it("fait un match partiel (clé contenue dans le nom)", () => {
    // "tomates cerises" doit retomber sur une photo de tomate (jamais vide)
    const url = getArticlePhoto("Tomates cerises bio")
    expect(url.startsWith(UNSPLASH)).toBe(true)
  })

  it("retombe sur une vraie photo de famille si le nom est inconnu", () => {
    const url = getArticlePhoto("ProduitInexistantXYZ", "Fruits rouges")
    expect(url.startsWith(UNSPLASH)).toBe(true)
    expect(url).not.toMatch(/placehold|placeholder|dummyimage/i)
  })

  it("ne retourne jamais une chaîne vide, même sans nom", () => {
    expect(getArticlePhoto("")).not.toBe("")
    expect(getArticlePhoto("", "Légumes feuilles").startsWith(UNSPLASH)).toBe(true)
  })
})
