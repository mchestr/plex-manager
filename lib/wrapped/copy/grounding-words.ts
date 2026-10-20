/**
 * Word-level helpers for grounding (design 8.4): tokens become one opaque
 * word, sentences and words are split the same way for every rule, and the
 * vocabularies the rules check against live here.
 *
 * @module lib/wrapped/copy/grounding-words
 * @internal
 */

import { TOKEN_RE } from "./render-copy"
import { COMMON_WORDS } from "./wordlist"

/** One private-use character stands in for each token, so a token is one word. */
export const TOKEN_MARK = "\uE000"

export interface Word {
  /** As written, punctuation trimmed. */
  text: string
  lower: string
  /** The first word of a sentence (tokens count as words). */
  initial: boolean
  token: boolean
}

export function stripTokens(text: string): string {
  return text.replace(TOKEN_RE, TOKEN_MARK)
}

/** Splits text (tokens already stripped) into words, marking sentence starts. */
export function words(stripped: string): Word[] {
  const out: Word[] = []
  let initial = true
  for (const raw of stripped.split(/\s+/)) {
    const text = raw.replace(/^[^\p{L}\p{N}\uE000]+|[^\p{L}\p{N}\uE000]+$/gu, "")
    if (text) {
      out.push({ text, lower: text.toLowerCase().replace(/\u2019/g, "'"), initial, token: text.includes(TOKEN_MARK) })
      initial = false
    }
    if (/[.!?]["'\u2019\u201D)]*$/.test(raw)) initial = true
  }
  return out
}

/** Plain words the design's own headlines start with that the frequency list lacks. */
const HOUSE_WORDS = new Set(["starring", "unfinished"])

const CONTRACTIONS: Record<string, string> = { "won't": "will", "can't": "can", "shan't": "shall" }

/** Whether a sentence may start with this word: it, or its stem, is a common word. */
export function isCommonWord(lower: string): boolean {
  if (COMMON_WORDS.has(lower) || HOUSE_WORDS.has(lower)) return true
  if (CONTRACTIONS[lower]) return true
  const stem = lower.replace(/n't$/, "").replace(/'(s|re|ll|ve|d|m)$/, "")
  if (stem !== lower) return isCommonWord(stem)
  return lower.includes("-") && lower.split("-").every((part) => COMMON_WORDS.has(part))
}

export const NUMBER_WORDS = new Set([
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty", "thirty", "forty",
  "fifty", "sixty", "seventy", "eighty", "ninety", "hundred", "thousand", "million", "dozen", "dozens", "twice",
  "thrice", "double",
])

/** Units and counted nouns a number word must not sit within two words of. */
export const COUNTED = new Set([
  "hour", "hours", "minute", "minutes", "episode", "episodes", "film", "films", "series", "season", "seasons",
  "night", "nights", "day", "days", "week", "weeks", "month", "months", "time", "times", "title", "titles",
  "show", "shows",
])

export const MONTHS = new Set([
  "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
])

export const WEEKDAYS = new Set(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"])

/** Quantifiers and the share each needs, inclusive. */
export const QUANTIFIERS: ReadonlyArray<{ phrase: string; re: RegExp; min: number; max: number }> = [
  { phrase: "nearly all", re: /\bnearly all\b/i, min: 0.85, max: 1 },
  { phrase: "almost all", re: /\balmost all\b/i, min: 0.85, max: 1 },
  { phrase: "the majority", re: /\bthe majority\b/i, min: 0.5, max: 1 },
  { phrase: "the bulk", re: /\bthe bulk\b/i, min: 0.5, max: 1 },
  { phrase: "a good share", re: /\ba good share\b/i, min: 0.3, max: 1 },
  { phrase: "a third", re: /\ba third\b/i, min: 0.3, max: 0.37 },
  { phrase: "a quarter", re: /\ba quarter\b/i, min: 0.22, max: 0.28 },
  { phrase: "half", re: /\bhalf\b/i, min: 0.45, max: 0.55 },
  { phrase: "mostly", re: /\bmostly\b/i, min: 0.5, max: 1 },
  { phrase: "most", re: /\bmost\b/i, min: 0.5, max: 1 },
]

/** Voice: phrases no Rewind copy uses. */
export const BANNED_PHRASES = ["your plex server", "plex rewind", "wrapped", "journey", "dive in", "unleash", "epic", "binge-worthy"]

/** Window words, which only templates may use: a model sentence would go stale in January. */
export const WINDOW_PHRASES = ["so far", "still"]

export const THIRD_PERSON = /\b(the|this) (viewer|member|user|watcher|subscriber)s?\b/i
export const EMOJI = /\p{Extended_Pictographic}/u
export const URL_LIKE = /https?:\/\/|\bwww\.|\b[a-z0-9-]+\.(com|net|org|io|tv|app|dev)\b/i
export const MARKDOWN = /[*_`#~>[\]]|^\s*[-+]\s/m
