/**
 * Every word of the search has to appear in the row; a word that starts a name counts more.
 * The default fuzzy match of the list found "products" for "cust", which reads as a bug.
 */
export function matchScore(value: string, search: string, keywords: string[] = []): number {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 1
  const text = `${value} ${keywords.join(' ')}`.toLowerCase()
  let score = 0
  for (const word of words) {
    const at = text.indexOf(word)
    if (at === -1) return 0
    const startsName = at === 0 || /[\s._]/.test(text[at - 1]!)
    score += startsName ? 2 : 1
  }
  if (value.toLowerCase().startsWith(words[0]!)) score += 2
  return score / (words.length * 2 + 2)
}
