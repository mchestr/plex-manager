import localFont from "next/font/local"

/**
 * Rewind's web fonts (P2.13's subset, renamed OFL files in `_fonts/`), loaded
 * through `next/font/local` so a build never fetches a font. The variables
 * feed `--font-display`, `--font-text` and `--font-lead` in the Rewind block
 * of `app/globals.css` (Rewind 5.1, NFR-5).
 */

/** Archivo, variable width and weight 600-900: headlines, numerals and chrome. Blocks so a fit never reflows. */
const rwArchivo = localFont({
  src: "./_fonts/archivo-vf.woff2",
  variable: "--font-rw-archivo",
  weight: "600 900",
  style: "normal",
  display: "block",
  preload: true,
  adjustFontFallback: "Arial",
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
})

/** Newsreader Text roman and italic at opsz 16: decks and body copy. */
const rwNewsreader = localFont({
  src: [
    { path: "./_fonts/newsreader-text.woff2", weight: "400", style: "normal" },
    { path: "./_fonts/newsreader-text-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-rw-newsreader",
  display: "swap",
  preload: false,
  adjustFontFallback: "Times New Roman",
})

/**
 * Newsreader Display Italic at opsz 72: the leads. It shares weight and style
 * with Text Italic, so it is its own family rather than a face of that one.
 */
const rwNewsreaderDisplay = localFont({
  src: "./_fonts/newsreader-display-italic.woff2",
  variable: "--font-rw-newsreader-display",
  weight: "400",
  style: "italic",
  display: "swap",
  preload: true,
  adjustFontFallback: "Times New Roman",
})

/** The classes that define the three font variables, for the scope root and its popups. */
export const rewindFontVariables = [rwArchivo.variable, rwNewsreader.variable, rwNewsreaderDisplay.variable].join(" ")
