/**
 * Titles for the fixtures, from the shared 200-title list, so every fixture
 * uses public film and TV titles. Keys and runtimes are the fixtures' own.
 *
 * @module evals/rewind/titles
 */

import data from "./data/titles-200.json"
import type { Film, Series } from "./rows"

export interface ListedTitle {
  title: string
  year: number
  kind: "film" | "series"
}

export const TITLES_200 = data.titles as ListedTitle[]

const GENRES = ["Drama", "Comedy", "Science Fiction", "Thriller", "Crime", "Animation", "Fantasy", "Documentary"]
const CAST = ["Rowan Hale", "Mira Okafor", "Tomas Brandt", "Ines Varga", "Calum Reyes", "Noor Haddad", "Jun Ito", "Lena Marsh"]

/** Whether a title stays inside the Archivo/Newsreader subset (Latin-1 and Latin Extended-A). */
function inFontSubset(title: string): boolean {
  return [...title].every((ch) => ch.codePointAt(0)! <= 0x17f)
}

function listed(title: string, kind: ListedTitle["kind"], year?: number): ListedTitle {
  const found = TITLES_200.find((t) => t.title === title && t.kind === kind && (year === undefined || t.year === year))
  if (!found) throw new Error(`Not in titles-200: ${kind} ${title}`)
  return found
}

/** Synthetic genres and cast, chosen by key so they never change between runs. */
function credits(key: number) {
  return {
    genres: [GENRES[key % GENRES.length], GENRES[(key + 3) % GENRES.length]],
    actors: [CAST[key % CAST.length], CAST[(key + 5) % CAST.length]],
  }
}

/** A film from the list, with the fixture's key and runtime. */
export function film(key: number, title: string, minutes: number, extra: Partial<Film> = {}): Film {
  const { year } = listed(title, "film", extra.year)
  return { key: String(key), title, year, minutes, ...credits(key), directors: [CAST[(key + 2) % CAST.length]], ...extra }
}

/** A series from the list, with the fixture's key and its seasons' episode counts. */
export function series(key: number, title: string, seasons: number[], extra: Partial<Series> = {}): Series {
  const { year } = listed(title, "series", extra.year)
  return { key: String(key), title, year, seasons, ...credits(key), ...extra }
}

/** `count` titles of `kind` inside the font subset, in list order, from `first` on. */
export function listRun(kind: ListedTitle["kind"], first: string, count: number): ListedTitle[] {
  const run = TITLES_200.filter((t) => t.kind === kind && inFontSubset(t.title))
  const start = run.findIndex((t) => t.title === first)
  if (start < 0 || start + count > run.length) throw new Error(`No run of ${count} ${kind} titles from ${first}`)
  return run.slice(start, start + count)
}

/** The (season, episode) pairs of a series, in order. */
export function episodes(s: Series): Array<{ season: number; episode: number }> {
  return (s.seasons ?? []).flatMap((count, i) => Array.from({ length: count }, (_, e) => ({ season: i + 1, episode: e + 1 })))
}
