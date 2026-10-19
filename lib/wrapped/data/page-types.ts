/**
 * The page ids of a v3 Rewind: the 18 pages of the slide catalogue
 * (design 4.2), in issue order, plus the pocket edition's `short-list`.
 *
 * @module lib/wrapped/data/page-types
 */

import { z } from "zod"

const PAGE_TYPES = [
  "cover",
  "number",
  "bookends",
  "guess",
  "top-shows",
  "top-films",
  "taste",
  "people",
  "clock",
  "calendar",
  "race",
  "records",
  "setup",
  "requests",
  "standing",
  "centrefold",
  "next-year",
  "back-cover",
  "short-list",
] as const

export const PageTypeSchema = z.enum(PAGE_TYPES)

/** @internal */
export type PageType = z.infer<typeof PageTypeSchema>
