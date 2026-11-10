/**
 * The admin options of media cleanup (TS 3.3), stored in the one Json column
 * `CleanupSettings.options`. Client-safe.
 *
 * G1 (member Keep) and G3 (admin exclusion) are always on (E30) and have no
 * options. `members.keepsEnabled` stops new Keeps only.
 *
 * @module lib/validations/cleanup-options
 */

import { z } from "zod"

import { createLogger } from "@/lib/utils/logger"
import { GiB, TiB } from "@/lib/validations/cleanup-vocabulary"

const logger = createLogger("CLEANUP_OPTIONS")

const days = (min: number, max: number, dflt: number) => z.number().int().min(min).max(max).default(dflt)
const toggle = (dflt: boolean) => z.boolean().default(dflt)

export const protectionsOptionsSchema = z.object({
  g2: z.object({ enabled: toggle(true) }).default({ enabled: true }),
  g4: z.object({ enabled: toggle(true), days: days(1, 3650, 30) }).default({ enabled: true, days: 30 }),
  g5: z.object({ enabled: toggle(true), days: days(1, 3650, 180) }).default({ enabled: true, days: 180 }),
  g6: z.object({ enabled: toggle(true), days: days(1, 3650, 30) }).default({ enabled: true, days: 30 }),
  g7: z.object({ enabled: toggle(true), days: days(1, 3650, 90) }).default({ enabled: true, days: 90 }),
  g8: z.object({ enabled: toggle(true) }).default({ enabled: true }),
  g9: z
    .object({ enabled: toggle(true), tags: z.array(z.string().trim().min(1).max(64)).max(20).default(["keep"]) })
    .default({ enabled: true, tags: ["keep"] }),
  g10: z.object({ enabled: toggle(true) }).default({ enabled: true }),
  g11: z.object({ enabled: toggle(true) }).default({ enabled: true }),
  g12: z.object({ enabled: toggle(true), days: days(1, 3650, 365) }).default({ enabled: true, days: 365 }),
  g13: z
    .object({ enabled: toggle(false), collections: z.array(z.string().trim().min(1).max(200)).max(20).default([]) })
    .default({ enabled: false, collections: [] }),
})
export type ProtectionsOptions = z.infer<typeof protectionsOptionsSchema>

export const cleanupOptionsSchema = z.object({
  version: z.literal(1).default(1),
  budget: z
    .object({
      items: z.number().int().min(1).max(500).default(20),
      bytes: z
        .number()
        .int()
        .min(GiB)
        .max(50 * TiB)
        .default(500 * GiB),
    })
    .default({ items: 20, bytes: 500 * GiB }),
  entryCheck: z
    .object({ count: z.number().int().min(1).max(1000).default(50), percent: z.number().int().min(1).max(100).default(10) })
    .default({ count: 50, percent: 10 }),
  automaticMinGraceDays: days(7, 3650, 7),
  defaults: z.object({ graceDays: days(1, 3650, 30), importListExclusion: toggle(true) }).default({ graceDays: 30, importListExclusion: true }),
  plex: z
    .object({ showCollections: toggle(true), ownHome: toggle(true), sharedHome: toggle(true), recommended: toggle(false) })
    .default({ showCollections: true, ownHome: true, sharedHome: true, recommended: false }),
  members: z
    .object({
      keepsEnabled: toggle(true),
      keepDays: days(7, 365, 90),
      keepLimit: z.number().int().min(1).max(100).default(20),
      pageEnabled: toggle(true),
    })
    .default({ keepsEnabled: true, keepDays: 90, keepLimit: 20, pageEnabled: true }),
  protections: protectionsOptionsSchema.default(protectionsOptionsSchema.parse({})),
})
export type CleanupOptions = z.infer<typeof cleanupOptionsSchema>

/** One top-level section, or its defaults when it does not parse. Each section has a default, so `parse(undefined)` cannot fail. */
function section<S extends z.ZodType>(schema: S, value: unknown, key: string, dropped: string[]): z.output<S> {
  const parsed = schema.safeParse(value)
  if (parsed.success) return parsed.data
  for (const issue of parsed.error.issues) dropped.push([key, ...issue.path.map(String)].join("."))
  return schema.parse(undefined)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

/**
 * The stored options with every default filled in. Each top-level section
 * parses on its own: a bad section falls back to its defaults, and the others
 * keep their values. Logs `cleanup.parse_dropped` with the issue paths only.
 * Never throws. Treat the result as read only: defaults share nested arrays.
 */
export function parseCleanupOptions(raw: unknown): CleanupOptions {
  const stored = isRecord(raw) ? raw : {}
  const dropped: string[] = raw === undefined || raw === null || isRecord(raw) ? [] : ["(root)"]
  const shape = cleanupOptionsSchema.shape
  const options: CleanupOptions = {
    version: section(shape.version, stored.version, "version", dropped),
    budget: section(shape.budget, stored.budget, "budget", dropped),
    entryCheck: section(shape.entryCheck, stored.entryCheck, "entryCheck", dropped),
    automaticMinGraceDays: section(shape.automaticMinGraceDays, stored.automaticMinGraceDays, "automaticMinGraceDays", dropped),
    defaults: section(shape.defaults, stored.defaults, "defaults", dropped),
    plex: section(shape.plex, stored.plex, "plex", dropped),
    members: section(shape.members, stored.members, "members", dropped),
    protections: section(shape.protections, stored.protections, "protections", dropped),
  }
  if (dropped.length > 0) logger.warn("cleanup.parse_dropped", { document: "options", paths: [...new Set(dropped)].slice(0, 10) })
  return options
}

/** Every option at its default value. */
export const DEFAULT_CLEANUP_OPTIONS: CleanupOptions = cleanupOptionsSchema.parse({})
