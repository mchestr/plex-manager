/**
 * `CARD_VERSION` names everything a card PNG depends on besides its input:
 * `rewind-cards@<n>+og@<x.y.z>+satori@<x.y.z>+fonts@<sha1-12>` (design 6.4).
 * The card cache key and the card baselines include it, so upgrading Next or
 * rebuilding the fonts invalidates both.
 *
 * `scripts/write-card-version.mjs` generates the value from the installed
 * `next/og` and the font files; a test recomputes it, so a stale value fails CI.
 *
 * @module lib/rewind/cards/version
 */

/**
 * The card renderer's own version. Bump it, then run
 * `npm run rewind:card-version`, whenever a card's pixels change for any
 * other reason: a card component, `CARD_SLACK` or the card metrics.
 * `scripts/card-version/compute.mjs` reads it from this file.
 *
 * @internal
 */
export const CARD_RENDERER_VERSION = 4

export { CARD_VERSION } from "./card-version.generated"
