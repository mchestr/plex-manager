/**
 * Zod schema for the LLM's creative output (Wrapped v2).
 *
 * ## Overview
 *
 * In the v2 generation architecture the LLM no longer emits the full
 * `sections[]` structure. It returns only creative content — an archetype
 * pick with copy, per-slide narrative text, insights, and a share summary —
 * validated against this schema. `assembleWrappedData` merges the output
 * with code-computed statistics into the final `WrappedData`.
 *
 * ## Structured outputs constraint
 *
 * The schema is designed for OpenAI strict structured outputs: every key is
 * required (`.nullable()` instead of `.optional()` for conditional fields)
 * and objects reject unknown keys, so `z.toJSONSchema` emits an all-required
 * schema with `additionalProperties: false`.
 */

import { z } from "zod"

/**
 * Curated viewer archetypes. The LLM selects one id (enforced by the schema
 * enum) and writes the tagline + dedication; names and motifs are fixed in
 * code so the reveal slide is never off-brand or empty.
 */
export const ARCHETYPES = [
  {
    id: "midnight-marathoner",
    name: "The Midnight Marathoner",
    motif: "Watches deep into the night, one more episode always wins",
  },
  {
    id: "credits-roller",
    name: "The Credits Roller",
    motif: "Finishes what they start — every film watched to the last frame",
  },
  {
    id: "comfort-rewatcher",
    name: "The Comfort Rewatcher",
    motif: "Returns to beloved favorites again and again",
  },
  {
    id: "premiere-chaser",
    name: "The Premiere Chaser",
    motif: "First in line for new releases and fresh episodes",
  },
  {
    id: "series-devourer",
    name: "The Series Devourer",
    motif: "Consumes entire seasons in sittings, binges without mercy",
  },
  {
    id: "weekend-double-feature",
    name: "The Weekend Double Feature",
    motif: "Saves it all up for marathon weekend sessions",
  },
  {
    id: "curator",
    name: "The Curator",
    motif: "A carefully chosen catalog — quality over quantity",
  },
  {
    id: "explorer",
    name: "The Explorer",
    motif: "Always discovering something new, rarely repeats",
  },
  {
    id: "loyalist",
    name: "The Loyalist",
    motif: "Devoted to a handful of shows above all others",
  },
  {
    id: "golden-hour-viewer",
    name: "The Golden Hour Viewer",
    motif: "Reliable evening ritual, the same prime-time slot every day",
  },
  {
    id: "festival-juror",
    name: "The Festival Juror",
    motif: "Broad taste across films — a serious cinema diet",
  },
  {
    id: "casual-critic",
    name: "The Casual Critic",
    motif: "Drops in when something's worth it, watches on their own terms",
  },
] as const

export type ArchetypeId = (typeof ARCHETYPES)[number]["id"]

const archetypeIds = ARCHETYPES.map((a) => a.id) as [
  ArchetypeId,
  ...ArchetypeId[],
]

export function getArchetype(id: ArchetypeId) {
  // Ids come from the schema enum, so the lookup always succeeds
  return ARCHETYPES.find((a) => a.id === id)!
}

export const wrappedLLMOutputSchema = z.object({
  archetype: z.object({
    id: z.enum(archetypeIds),
    tagline: z.string().min(1),
    dedication: z.string().min(1),
  }),
  narratives: z.object({
    opening: z.string().min(1),
    totalWatchTime: z.string().min(1),
    movies: z.string().min(1),
    shows: z.string().min(1),
    topMovies: z.string().min(1),
    topShows: z.string().min(1),
    streaksAndPatterns: z.string().min(1),
    monthlyJourney: z.string().min(1),
    percentile: z.string().nullable(),
    serverStats: z.string().nullable(),
    overseerr: z.string().nullable(),
    finale: z.string().min(1),
  }),
  insights: z.object({
    personality: z.string().min(1),
    topGenre: z.string().min(1),
    bingeWatcher: z.boolean(),
    discoveryScore: z.number().min(0).max(100),
    funFacts: z.array(z.string().min(1)).min(3).max(7),
  }),
  summary: z.string().min(1),
})

export type WrappedLLMOutput = z.infer<typeof wrappedLLMOutputSchema>

/**
 * JSON Schema for OpenAI strict structured outputs
 * (`response_format: { type: "json_schema", ... }`).
 */
export function wrappedOutputJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(wrappedLLMOutputSchema) as Record<string, unknown>
}
