/**
 * Safe-mode titles on cards (design 4.9): text the Archivo card subset
 * cannot set prints in Noto Sans instead of a title-free line.
 *
 * ## Overview
 *
 * The static Noto TTFs (Bold) are committed under `fonts/noto/` with their
 * OFL licences, are about 24 MB and never reach a browser. A card render
 * hands `loadNotoFonts` every string of its input that the card metrics do
 * not cover; each character goes to one face by its Unicode script, and each
 * face is cut to exactly the characters it sets with `subset-font`
 * (harfbuzzjs). Subsets are cached on disk at
 * `${REWIND_CACHE_DIR}/fonts/{sha1(face, glyphs)}.ttf`, so a second render of
 * the same titles reads a few kilobytes instead of cutting a 10 MB face.
 *
 * ## Faces
 *
 * ```
 *  Hiragana, Katakana ............ jp
 *  Hangul ........................ kr
 *  Han ........................... jp with kana, kr with Hangul, else sc
 *  Arabic, Hebrew, Devanagari, Thai  their own face
 *  everything else ............... the CJK face when the text has one
 *                                   (it sets Latin too), else sans (Latin
 *                                   Extended, Greek, Cyrillic, Vietnamese)
 * ```
 *
 * A safe-mode element names its faces in that order (`notoStack`), and each
 * face holds only its own characters, so Satori takes every glyph from the
 * face it was cut for. `noto.test.ts` checks the faces a Japanese and a
 * Romanian title pick, the subset's characters and the cache.
 *
 * @module lib/rewind/cards/noto
 */

import "server-only"

import { createHash, randomBytes } from "node:crypto"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"

import subsetFont from "subset-font"

import { getEnv } from "@/lib/env"

import type { CardFont } from "./fonts"

export type NotoFace = "sans" | "jp" | "sc" | "kr" | "arabic" | "hebrew" | "devanagari" | "thai"

const NOTO_DIR = path.join("lib", "rewind", "cards", "fonts", "noto")

const FACES: Record<NotoFace, { file: string; label: string }> = {
  sans: { file: "NotoSans-Bold.ttf", label: "Sans" },
  jp: { file: "NotoSansJP-Bold.ttf", label: "JP" },
  sc: { file: "NotoSansSC-Bold.ttf", label: "SC" },
  kr: { file: "NotoSansKR-Bold.ttf", label: "KR" },
  arabic: { file: "NotoSansArabic-Bold.ttf", label: "Arabic" },
  hebrew: { file: "NotoSansHebrew-Bold.ttf", label: "Hebrew" },
  devanagari: { file: "NotoSansDevanagari-Bold.ttf", label: "Devanagari" },
  thai: { file: "NotoSansThai-Bold.ttf", label: "Thai" },
}

/** The order faces are named in a font stack: the script faces, then sans. */
const ORDER: readonly NotoFace[] = ["jp", "kr", "sc", "arabic", "hebrew", "devanagari", "thai", "sans"]

/** The family name a face is registered under. */
const notoFamily = (face: NotoFace): string => `Rewind Noto ${FACES[face].label}`

type Script = "kana" | "hangul" | "han" | "cjk-common" | "arabic" | "hebrew" | "devanagari" | "thai" | "basic" | "other"

const inRange = (cp: number, ranges: ReadonlyArray<readonly [number, number]>) => ranges.some(([a, b]) => cp >= a && cp <= b)

function scriptOf(cp: number): Script {
  if (inRange(cp, [[0x3040, 0x30ff], [0x31f0, 0x31ff], [0xff66, 0xff9f]])) return "kana"
  if (inRange(cp, [[0x1100, 0x11ff], [0x3130, 0x318f], [0xa960, 0xa97f], [0xac00, 0xd7ff]])) return "hangul"
  if (inRange(cp, [[0x2e80, 0x2fdf], [0x3400, 0x4dbf], [0x4e00, 0x9fff], [0xf900, 0xfaff], [0x20000, 0x3134f]])) return "han"
  if (inRange(cp, [[0x3000, 0x303f], [0x3200, 0x33ff], [0xfe30, 0xfe4f], [0xff00, 0xff65], [0xffe0, 0xffef]])) return "cjk-common"
  if (inRange(cp, [[0x0600, 0x06ff], [0x0750, 0x077f], [0x0870, 0x08ff], [0xfb50, 0xfdff], [0xfe70, 0xfeff]])) return "arabic"
  if (inRange(cp, [[0x0590, 0x05ff], [0xfb1d, 0xfb4f]])) return "hebrew"
  if (inRange(cp, [[0x0900, 0x097f], [0xa8e0, 0xa8ff]])) return "devanagari"
  if (inRange(cp, [[0x0e00, 0x0e7f]])) return "thai"
  // Basic Latin, Latin-1, Latin Extended-A and General Punctuation: set by a CJK face when there is one.
  if (cp <= 0x017f || inRange(cp, [[0x2000, 0x206f]])) return "basic"
  return "other"
}

const SCRIPT_FACE: Partial<Record<Script, NotoFace>> = { kana: "jp", hangul: "kr", arabic: "arabic", hebrew: "hebrew", devanagari: "devanagari", thai: "thai" }

/** Each character of `text` with the face that sets it. @internal */
export function assignFaces(text: string): Array<{ char: string; face: NotoFace }> {
  const chars = Array.from(text)
  const scripts = chars.map((char) => scriptOf(char.codePointAt(0) ?? 0))
  const cjk: NotoFace | null = scripts.includes("kana") ? "jp" : scripts.includes("hangul") ? "kr" : scripts.includes("han") ? "sc" : null
  return chars.map((char, i) => {
    const script = scripts[i]
    const own = SCRIPT_FACE[script]
    if (own) return { char, face: own }
    if (script === "han" || script === "cjk-common") return { char, face: cjk ?? "jp" }
    return { char, face: script === "basic" && cjk ? cjk : "sans" }
  })
}

/** The faces `text` prints in, in stack order. @internal Exported for its test. */
export function notoFaces(text: string): NotoFace[] {
  const used = new Set(assignFaces(text).map((a) => a.face))
  return ORDER.filter((face) => used.has(face))
}

/** The CSS font stack of a safe-mode element. */
export const notoStack = (text: string): string => notoFaces(text).map(notoFamily).join(", ")

/** Every face the texts need, with exactly the characters it sets, sorted. @internal Exported for its test. */
export function glyphsByFace(texts: readonly string[]): Map<NotoFace, string> {
  const sets = new Map<NotoFace, Set<string>>()
  for (const text of texts) {
    for (const { char, face } of assignFaces(text)) {
      if (!sets.has(face)) sets.set(face, new Set())
      sets.get(face)!.add(char)
    }
  }
  return new Map(ORDER.filter((face) => sets.has(face)).map((face) => [face, [...sets.get(face)!].sort().join("")]))
}

const fontsDir = () => path.join(getEnv().REWIND_CACHE_DIR, "fonts")

/** The cache file of a face cut to `glyphs`. @internal */
export const subsetFile = (face: NotoFace, glyphs: string) =>
  path.join(fontsDir(), `${createHash("sha1").update(`${face}\0${glyphs}`).digest("hex")}.ttf`)

async function subset(face: NotoFace, glyphs: string): Promise<Buffer> {
  const file = subsetFile(face, glyphs)
  const cached = await readFile(file).catch(() => null)
  if (cached) return cached
  const source = await readFile(path.join(process.cwd(), NOTO_DIR, FACES[face].file))
  const cut = await subsetFont(source, glyphs, { targetFormat: "truetype" })
  await mkdir(fontsDir(), { recursive: true })
  const temp = `${file}.${randomBytes(6).toString("hex")}.tmp`
  await writeFile(temp, cut)
    .then(() => rename(temp, file))
    .catch(() => rm(temp, { force: true }))
  return cut
}

/** The Noto subsets the safe-mode `texts` need, as `ImageResponse` font entries; empty when none does. */
export async function loadNotoFonts(texts: readonly string[]): Promise<CardFont[]> {
  const faces = [...glyphsByFace(texts)]
  return Promise.all(
    faces.map(async ([face, glyphs]) => {
      const bytes = await subset(face, glyphs)
      return { name: notoFamily(face), weight: 700 as const, style: "normal" as const, data: new Uint8Array(bytes).buffer }
    })
  )
}
