/**
 * 04 Guess (design 4.3): which title did the member watch most? The options
 * are the stats' quiz candidates (D7): the top 4 series by minutes, or, with
 * fewer than 3 series, the top titles of either kind. The page omits itself
 * with fewer than 3 candidates or when No. 1 leads No. 2 by 2% or less
 * (`computeTitles` returns no quiz then, and `quiz.gapMinutes` is absent).
 *
 * The order is shuffled once with a seed of `hash(userId, year)` and stored,
 * so the member sees the same order on every visit and the answer is not
 * always first. The answer itself never reaches the server (`QuizContext`).
 *
 * @module lib/rewind/pages/guess
 */

import type { PageDefinition } from "@/lib/rewind/registry"
import type { FactId, RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"
import type { MemberStats } from "@/lib/wrapped/stats/compute"

import { has, issueYear } from "./facts"
import { GuessDataSchema, type GuessData, type QuizOption } from "./guess.schema"
import { ratingKeyOf } from "./title-key.schema"

const MIN_OPTIONS = 3

/** 32-bit FNV-1a: stable everywhere (this module also ships to the player). */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** A Fisher-Yates shuffle driven by mulberry32 from `seed`. @internal */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  let state = fnv1a(seed)
  const random = () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** The fact holding a candidate's minutes: its place in the series or films list. */
function minutesFact(key: string, stats: MemberStats, facts: RewindFactsV3): QuizOption["minutes"] {
  const series = stats.titles.series.findIndex((s) => s.key === key)
  const films = stats.titles.films.findIndex((f) => f.key === key)
  const id = (series >= 0 ? `series[${series + 1}].minutes` : films >= 0 ? `films[${films + 1}].minutes` : null) as FactId | null
  return id && has(facts, id) ? (id as QuizOption["minutes"]) : null
}

export const guessPage: PageDefinition<GuessData> = {
  select: (facts, { stats, userId }) => {
    const quiz = stats.titles.quiz
    if (!quiz || quiz.options.length < MIN_OPTIONS || !has(facts, "quiz.gapMinutes")) return null
    const options = quiz.options.map((key, i) => ({ key, title: quiz.titles[i], rank: i + 1, minutes: minutesFact(key, stats, facts) }))
    return { kind: quiz.kind, options: seededShuffle(options, `${userId ?? ""}:${issueYear(facts)}`) }
  },
  schema: GuessDataSchema,
  srSummary: (data) => `A quiz with ${data.options.length} options: ${data.options.map((o) => o.title).join(", ")}.`,
  share: {
    facts: ["series[1].title", "series[2].title", "series[3].title", "series[4].title"],
    titles: ["series[1].title", "series[2].title", "series[3].title", "series[4].title"],
    // A series quiz's candidates are the top series, so rank n is `series[n]`; a mixed quiz is
    // covered by the lists' keys and by matching titles.
    titleKeys: ({ kind, options }) =>
      kind === "series" ? Object.fromEntries(options.map((o) => [`series[${o.rank}].title`, ratingKeyOf(o.key)])) : {},
  },
}
