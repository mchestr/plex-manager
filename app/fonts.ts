import localFont from "next/font/local"

/**
 * IBM Plex Sans and Plex Mono, the interface faces (ui-design-system 3.6).
 *
 * The files are IBM's own WOFF2 releases, unmodified, committed in
 * `app/_fonts/` with their licence (SIL OFL 1.1) and pinned by
 * `scripts/plex-fonts.lock.json`, so a build never fetches a font. The design
 * names `next/font/google`; the local files keep the same variables and faces
 * without build-time egress or an unpinned upstream.
 *
 * Plex Sans is variable (`wght` 100 to 700, `wdth` 85 to 100; the declared
 * `font-stretch` range lets `font-stretch-85%` and `text-display`'s 92% narrow
 * it). IBM ships it split by script with each file's `unicode-range`.
 * `next/font/local` takes one range per call, so each subset is its own call
 * on one shared family: only Latin is preloaded, and the browser fetches
 * another subset when a page draws one of its characters. The family is
 * `plexSans` because next/font names a call's class and variable after its
 * variable (`--font-plex-sans: "plexSans", "plexSans Fallback"`) whatever
 * `font-family` its `@font-face` declares. `plexFontClassNames` puts every
 * subset's `@font-face` on the page.
 *
 * Plex Mono is 400, 500 and 600, fetched when mono text first renders rather
 * than preloaded on every page.
 */

// latin: preloaded
const plexSans = localFont({
  src: "./_fonts/IBMPlexSansVar-Roman-Latin1.woff2",
  weight: "100 700",
  style: "normal",
  declarations: [
    { prop: "font-family", value: "plexSans" },
    { prop: "font-stretch", value: "85% 100%" },
    { prop: "unicode-range", value: "U+0000, U+000D, U+0020-007E, U+00A0-00FF, U+0131, U+0152-0153, U+02C6, U+02DA, U+02DC, U+2013-2014, U+2018-201A, U+201C-201E, U+2020-2022, U+2026, U+2030, U+2039-203A, U+2044, U+20AC, U+2122, U+2212, U+FB01-FB02" },
  ],
  variable: "--font-plex-sans",
  display: "swap",
})

// latin-ext
const plexSansLatin2 = localFont({
  src: "./_fonts/IBMPlexSansVar-Roman-Latin2.woff2",
  weight: "100 700",
  style: "normal",
  declarations: [
    { prop: "font-family", value: "plexSans" },
    { prop: "font-stretch", value: "85% 100%" },
    { prop: "unicode-range", value: "U+0100-0101, U+0104-0130, U+0132-0151, U+0154-017F, U+018F, U+0192, U+01A0-01A1, U+01AF-01B0, U+01FA-01FF, U+0218-021B, U+0237, U+0259, U+1E80-1E85, U+1E9E, U+20A1, U+20A4, U+20A6, U+20A8-20AA, U+20AD-20AE, U+20B1-20B2, U+20B4-20B5, U+20B8-20BA, U+20BD, U+20BF" },
  ],
  preload: false,
  adjustFontFallback: false,
  display: "swap",
})

// Vietnamese
const plexSansLatin3 = localFont({
  src: "./_fonts/IBMPlexSansVar-Roman-Latin3.woff2",
  weight: "100 700",
  style: "normal",
  declarations: [
    { prop: "font-family", value: "plexSans" },
    { prop: "font-stretch", value: "85% 100%" },
    { prop: "unicode-range", value: "U+0102-0103, U+01CD-01DC, U+1EA0-1EF9, U+20AB" },
  ],
  preload: false,
  adjustFontFallback: false,
  display: "swap",
})

// punctuation, arrows and symbols
const plexSansPi = localFont({
  src: "./_fonts/IBMPlexSansVar-Roman-Pi.woff2",
  weight: "100 700",
  style: "normal",
  declarations: [
    { prop: "font-family", value: "plexSans" },
    { prop: "font-stretch", value: "85% 100%" },
    { prop: "unicode-range", value: "U+0E3F, U+2000-200D, U+2015, U+2028-2029, U+202F, U+2032-2033, U+2070, U+2074-2079, U+2080-2089, U+2113, U+2116, U+2126, U+212E, U+2150-2151, U+2153-215E, U+2190-2199, U+21A9-21AA, U+21B0-21B3, U+21B6-21B7, U+21BA-21BB, U+21C4, U+21C6, U+2202, U+2206, U+220F, U+2211, U+2215, U+221A, U+221E, U+222B, U+2248, U+2260, U+2264-2265, U+25CA, U+2713, U+274C, U+2B0E-2B11, U+ECE0, U+EFCC, U+FEFF, U+FFFD" },
  ],
  preload: false,
  adjustFontFallback: false,
  display: "swap",
})

// Greek
const plexSansGreek = localFont({
  src: "./_fonts/IBMPlexSansVar-Roman-Greek.woff2",
  weight: "100 700",
  style: "normal",
  declarations: [
    { prop: "font-family", value: "plexSans" },
    { prop: "font-stretch", value: "85% 100%" },
    { prop: "unicode-range", value: "U+037E, U+0386-038A, U+038C, U+038E-03A1, U+03A3-03CE" },
  ],
  preload: false,
  adjustFontFallback: false,
  display: "swap",
})

// Cyrillic
const plexSansCyrillic = localFont({
  src: "./_fonts/IBMPlexSansVar-Roman-Cyrillic.woff2",
  weight: "100 700",
  style: "normal",
  declarations: [
    { prop: "font-family", value: "plexSans" },
    { prop: "font-stretch", value: "85% 100%" },
    { prop: "unicode-range", value: "U+0400-045F, U+0462-0463, U+046A-046B, U+0472-0475, U+0490-04C2, U+04CF-04D9, U+04DC-04E9, U+04EE-04F9, U+0524-0525" },
  ],
  preload: false,
  adjustFontFallback: false,
  display: "swap",
})

const plexMono = localFont({
  src: [
    { path: "./_fonts/IBMPlexMono-Regular.woff2", weight: "400", style: "normal" },
    { path: "./_fonts/IBMPlexMono-Medium.woff2", weight: "500", style: "normal" },
    { path: "./_fonts/IBMPlexMono-SemiBold.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
})

/** The classes `<html>` takes: both variables, and the other Sans subsets' faces. */
export const plexFontClassNames = [
  plexSans.variable,
  plexMono.variable,
  ...[plexSansLatin2, plexSansLatin3, plexSansPi, plexSansGreek, plexSansCyrillic].map((font) => font.className),
].join(" ")
