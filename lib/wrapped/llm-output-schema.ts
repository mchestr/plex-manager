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

import { ARCHETYPE_IDS, getArchetype } from "@/lib/wrapped/archetypes/catalogue"

/**
 * The curated archetypes now live in `lib/wrapped/archetypes/catalogue.ts`
 * (P2.9); v2 keeps reading them from here. The LLM selects one id (enforced
 * by the schema enum) and writes the tagline and dedication.
 */
export { getArchetype }

export const wrappedLLMOutputSchema = z.object({
  archetype: z.object({
    id: z.enum(ARCHETYPE_IDS),
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
    funFacts: z.array(z.string().min(1)).min(3).max(7),
  }),
  summary: z.string().min(1),
})

export type WrappedLLMOutput = z.infer<typeof wrappedLLMOutputSchema>
