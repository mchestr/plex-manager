/**
 * Type definitions for the v1 and v2 Plex Wrapped data structure.
 *
 * The shapes are declared once, as the lenient Zod schemas that also parse
 * stored rows (`lib/wrapped/data/schema-legacy.ts`); these are their
 * inferred types.
 */

export type {
  WrappedData,
  WrappedSection,
  WrappedStatistics,
} from "@/lib/wrapped/data/schema-legacy"
