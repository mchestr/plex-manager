/**
 * The built font metrics, for Server Components and the card renderer only:
 * the JSON is about 145 KB and never ships to the browser.
 *
 * - `pageMetrics`: the variable Archivo at widths 62, 75, 87.5, 100, 112.5
 *   and 125 and weights 700, 760, 850 and 900 (the web font).
 * - `cardMetrics`: the eight static Archivo instances the cards embed.
 *
 * Regenerate with `scripts/build-rewind-fonts.py`.
 *
 * @module lib/rewind/typeset/metrics
 */

import "server-only"

import json from "./metrics.json"
import type { FaceMetrics, FontMetrics } from "./measure"

const { page, card, ...shared } = json as unknown as Omit<FontMetrics, "faces"> & {
  page: Record<string, FaceMetrics>
  card: Record<string, FaceMetrics>
}

export const pageMetrics: FontMetrics = { ...shared, faces: page }
export const cardMetrics: FontMetrics = { ...shared, faces: card }
