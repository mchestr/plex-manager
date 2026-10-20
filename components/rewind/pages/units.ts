/**
 * Artboard units (Rewind design 4.7, 5.5): pages are composed on a 390 x 693
 * logical artboard and every size is `calc(var(--u) * N)`. Text under 15 px
 * logical never renders under 12 CSS px.
 */
export const u = (px: number) => `calc(var(--u) * ${px}px)`

/** A text size in logical px, floored at 12 CSS px below 15. */
export const ut = (px: number) => (px < 15 ? `max(12px, ${u(px)})` : u(px))

/** Archivo's axes, for a role: `"wdth" 87.5, "wght" 760`. */
export const axes = (wdth: number, wght: number) => `"wdth" ${wdth}, "wght" ${wght}`

/** The artboard's measure: 390 less two 16 px gutters. */
export const MEASURE = 358

/**
 * A control drawn at artboard scale (design 4.7): an unscaled `::before`
 * centred on it keeps the hit area at least 44 x 44 CSS px, whatever its
 * visible size.
 */
export const ARTBOARD_TARGET =
  "relative before:absolute before:top-1/2 before:left-1/2 before:size-full before:min-h-11 before:min-w-11 before:-translate-x-1/2 before:-translate-y-1/2"

/** A 44 px pill (`size="pill"`) drawn at artboard scale, with its 44 px hit area. */
export const ARTBOARD_PILL = `${ARTBOARD_TARGET} h-[calc(var(--u)*44px)] px-[calc(var(--u)*20px)]`

/**
 * The gap between stacked artboard controls: `px` logical px, or more below
 * the 0.8 scale floor, where the controls draw under 44 CSS px, so their hit
 * areas never overlap.
 */
export const stackGap = (px: number) => `max(${u(px)}, calc(44px - var(--u) * 44px))`

/**
 * A gap of `px` logical px that tightens below the 0.8 scale floor, where
 * text held at its 12 px floor stops scaling with the page: from its full
 * size at 0.8 to a quarter of it at 0.65 and under (design 4.7).
 */
export const tight = (px: number) => `calc(${u(px)} * clamp(0.25, (var(--u) - 0.6) * 5, 1))`
