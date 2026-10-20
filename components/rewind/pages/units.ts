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
