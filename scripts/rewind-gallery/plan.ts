/**
 * What `npm run rewind:gallery` writes (P7.11): one screenshot per page at
 * the phone size and at the desktop spread, one PNG per card, and the
 * contact sheet that links them. Pure, so the plan is tested without a
 * browser.
 *
 * ```
 * gallery/<date>/
 *   index.html
 *   <fixture>/<nn>-<page>.png          390 x 844
 *   <fixture>/spread/<nn>-<page>.png   1440 x 900
 *   <fixture>/cards/<page>.png         the preview card route
 * ```
 *
 * @module scripts/rewind-gallery/plan
 */

import { frameName, pageFrameUrl, previewCardUrl, type GalleryView } from "../../lib/rewind/gallery/review"

/** One fixture's dry run as the gallery page lists it. */
export interface FixtureSet {
  fixture: string
  previewId: string
  pages: ReadonlyArray<{ type: string; folio: number }>
  cards: readonly string[]
}

export type GalleryShot =
  | { kind: "page"; fixture: string; page: string; view: GalleryView; url: string; file: string }
  | { kind: "card"; fixture: string; page: string; url: string; file: string }

/** Every file to write, fixture by fixture: the phone pages, the spread pages, then the cards. */
export function galleryPlan(sets: readonly FixtureSet[]): GalleryShot[] {
  return sets.flatMap(({ fixture, previewId, pages, cards }) => {
    const frames = (view: GalleryView, dir: string): GalleryShot[] =>
      pages.map(({ type, folio }) => ({ kind: "page", fixture, page: type, view, url: pageFrameUrl(previewId, type), file: `${dir}${frameName(folio, type)}.png` }))
    return [
      ...frames("phone", `${fixture}/`),
      ...frames("spread", `${fixture}/spread/`),
      ...cards.map((page): GalleryShot => ({ kind: "card", fixture, page, url: previewCardUrl(previewId, page), file: `${fixture}/cards/${page}.png` })),
    ]
  })
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

function tile(shot: GalleryShot): string {
  const file = escapeHtml(shot.file)
  const label = escapeHtml(shot.kind === "card" ? shot.page : shot.file.split("/").pop()!.replace(/\.png$/, ""))
  return `<figure><a href="${file}"><img src="${file}" alt="${label}" loading="lazy"></a><figcaption>${label}</figcaption></figure>`
}

/** The contact sheet: a section per fixture with its phone pages, its spread and its cards, each linking its file. */
export function contactSheet(shots: readonly GalleryShot[], date: string): string {
  const fixtures = [...new Set(shots.map((shot) => shot.fixture))]
  const row = (title: string, items: readonly GalleryShot[], className: string) =>
    items.length === 0 ? "" : `<h3>${title}</h3><div class="row ${className}">${items.map(tile).join("")}</div>`
  const sections = fixtures.map((fixture) => {
    const mine = shots.filter((shot) => shot.fixture === fixture)
    return [
      `<section id="${escapeHtml(fixture)}"><h2>${escapeHtml(fixture)}</h2>`,
      row("Pages", mine.filter((s) => s.kind === "page" && s.view === "phone"), "phone"),
      row("Desktop spread", mine.filter((s) => s.kind === "page" && s.view === "spread"), "spread"),
      row("Cards", mine.filter((s) => s.kind === "card"), "card"),
      "</section>",
    ].join("")
  })
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Rewind gallery ${escapeHtml(date)}</title>
<style>
:root { color-scheme: light dark; font-family: system-ui, sans-serif; }
body { margin: 0 auto; max-width: 1600px; padding: 16px; }
.row { display: flex; flex-wrap: wrap; gap: 12px; }
figure { margin: 0; font-size: 12px; }
.phone img { width: 195px; } .spread img { width: 360px; } .card img { width: 180px; }
img { display: block; border: 1px solid #8884; border-radius: 6px; }
</style>
</head>
<body>
<h1>Rewind gallery ${escapeHtml(date)}</h1>
<nav>${fixtures.map((f) => `<a href="#${escapeHtml(f)}">${escapeHtml(f)}</a>`).join(" ")}</nav>
${sections.join("\n")}
</body>
</html>
`
}
