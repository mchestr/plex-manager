import "server-only"

/**
 * Keyword ranking over a knowledge base's Markdown. A term in the path counts
 * five times a term in the text; the first heading is the title.
 *
 * @module lib/chatbot/knowledge/search
 */

const MAX_TERMS = 8
const SNIPPET_CHARS = 300

/** Lower-cased words of two or more characters, at most {@link MAX_TERMS}, without repeats. */
export function searchTerms(query: string): string[] {
  return [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [])].slice(0, MAX_TERMS)
}

/** How well the path and text match the terms; 0 for no match. */
export function scoreDoc(path: string, text: string, terms: string[]): number {
  const lowerPath = path.toLowerCase()
  const lowerText = text.toLowerCase()
  return terms.reduce((score, term) => {
    const inText = Math.min(lowerText.split(term).length - 1, 10)
    return score + (lowerPath.includes(term) ? 5 : 0) + inText
  }, 0)
}

/** The first `#` heading, or the file name. */
export function docTitle(path: string, text: string): string {
  return /^#{1,3}\s+(.+)$/m.exec(text)?.[1].trim() ?? path.split("/").at(-1) ?? path
}

/** Up to two lines that hold a term, each cut to {@link SNIPPET_CHARS}. */
export function snippets(text: string, terms: string[]): string[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim())
  return lines
    .filter((line) => line.length > 0 && terms.some((term) => line.toLowerCase().includes(term)))
    .slice(0, 2)
    .map((line) => line.slice(0, SNIPPET_CHARS))
}
