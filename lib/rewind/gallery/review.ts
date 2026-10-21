/**
 * The review fixtures of the gallery (P7.11, design 10.3) and the addresses
 * its frames and cards load: the admin page and `npm run rewind:gallery`
 * both read them, so the two show the same set. Client-safe.
 *
 * @module lib/rewind/gallery/review
 */

/** Every review fixture covers this year. */
export const REVIEW_YEAR = 2026

export const REVIEW_FIXTURES = [
  { id: "heavy", label: "Heavy" },
  { id: "median", label: "Median" },
  { id: "light", label: "Light (pocket)" },
  { id: "postcard", label: "Postcard" },
  { id: "extreme", label: "Extreme" },
] as const

export type ReviewFixtureId = (typeof REVIEW_FIXTURES)[number]["id"]

export const REVIEW_FIXTURE_IDS = REVIEW_FIXTURES.map((fixture) => fixture.id) as [ReviewFixtureId, ...ReviewFixtureId[]]

/** `selected` replays the bake-off winner's recordings; `templates` is "Templates only". */
export type GalleryCopy = "selected" | "templates"

/** The phone frame and the desktop spread, in CSS pixels. */
export const GALLERY_VIEWPORTS = {
  phone: { width: 390, height: 844 },
  spread: { width: 1440, height: 900 },
} as const

export type GalleryView = keyof typeof GALLERY_VIEWPORTS

/** The story opened on one page and settled (`page` and `still` work only with `preview`). */
export function pageFrameUrl(previewId: string, page: string): string {
  return `/rewind/${REVIEW_YEAR}?preview=${previewId}&page=${page}&still=1`
}

/** A dry run's card with Daily detail on, so the calendar card exists. */
export function previewCardUrl(previewId: string, page: string): string {
  return `/api/rewind/card/preview/${previewId}/${page}?daily=1`
}

/** "04-top-shows": the folio, two digits, and the page type. */
export function frameName(folio: number, page: string): string {
  return `${String(folio).padStart(2, "0")}-${page}`
}
