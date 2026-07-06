/**
 * articlePhotoHelper.ts — Helper unifié pour obtenir la photo d'un article.
 * Utilisé partout : BO (Articles, Marketplace), Mobile (Commercial, Achat), API.
 *
 * Ordre de résolution :
 *   1. La photo stockée sur l'article (champ `photo`) — si elle existe
 *   2. Une photo Unsplash basée sur le nom (mapping articlePhotos.ts)
 *   3. Un placeholder coloré par famille
 */

import { getArticlePhoto } from "./articlePhotos"

export interface ArticleLike {
  nom?: string
  photo?: string
  famille?: string
}

/**
 * Retourne TOUJOURS une URL d'image valide pour un article.
 * - Si l'article a déjà une photo, on la retourne
 * - Sinon on cherche dans le mapping Unsplash par nom
 * - Sinon on retourne un placeholder coloré par famille
 *
 * Ne retourne JAMAIS une chaîne vide.
 */
// Un "faux" visuel (placeholder/SVG inline) ne doit PAS bloquer la vraie photo
// par nom : les anciens articles ont souvent une photo = placehold.co/data:svg.
function isPlaceholder(p: string): boolean {
  return !p || /placehold|placeholder|dummyimage|via\.placeholder|data:image\/svg/i.test(p)
}

export function resolveArticlePhoto(article: ArticleLike | null | undefined): string {
  if (!article) return getArticlePhoto("Article", "")
  const stored = (article.photo ?? "").toString().trim()
  if (stored && !isPlaceholder(stored)) return stored
  // Photo absente OU placeholder → vraie photo mappée par nom/famille (jamais vide)
  return getArticlePhoto(article.nom ?? "Article", article.famille ?? "")
}
