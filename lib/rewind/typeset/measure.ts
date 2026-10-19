/**
 * Line widths from built font metrics (design 5.4, step 1).
 *
 * `scripts/build-rewind-fonts.py` writes `metrics.json` from the exact fonts
 * that draw Rewind's type: per face (`"<wdth>/<wght>"`, in units per em) the
 * advance of every covered code point, the `tnum` digit advances, and the
 * kerning as a sparse matrix over shared left and right classes. Pure: the
 * server-only `metrics.ts` loads the JSON.
 *
 * @module lib/rewind/typeset/measure
 */

/** One static face: advances align with `FontMetrics.codepoints`. */
export interface FaceMetrics {
  advances: number[]
  /** Advances of the digits 0-9 under `tnum`. */
  tnum: number[]
  /** Flat `[leftClass, rightClass, units, ...]` triples. */
  kern: number[]
}

/** One metric set: the page faces (variable Archivo) or the card faces. */
export interface FontMetrics {
  unitsPerEm: number
  codepoints: number[]
  /** Code points every Rewind face covers; anything else is safe mode. */
  covered: number[]
  kernLeft: number[]
  kernRight: number[]
  /** Keyed `"<wdth>/<wght>"`, for example `"87.5/760"`. */
  faces: Record<string, FaceMetrics>
}

export interface Measurer {
  /** Is every code point of `text` in the subset? */
  covers(text: string): boolean
  /** The widths (ascending) the set holds at `weight`. */
  widths(weight: number): number[]
  /** Width of `text` in em at `wdth`/`weight`, with `tracking` em per character. */
  em(text: string, wdth: number, weight: number, tracking: number, tnum: boolean): number
}

interface Compiled {
  index: Map<number, number>
  covered: Set<number>
  faces: Map<string, { advances: number[]; tnum: number[]; kern: Map<number, number> }>
}

const compiled = new WeakMap<FontMetrics, Compiled>()
const KERN_STRIDE = 4096

function compile(metrics: FontMetrics): Compiled {
  const cached = compiled.get(metrics)
  if (cached) return cached
  const faces = new Map<string, { advances: number[]; tnum: number[]; kern: Map<number, number> }>()
  for (const [key, face] of Object.entries(metrics.faces)) {
    const kern = new Map<number, number>()
    for (let i = 0; i < face.kern.length; i += 3) kern.set(face.kern[i] * KERN_STRIDE + face.kern[i + 1], face.kern[i + 2])
    faces.set(key, { advances: face.advances, tnum: face.tnum, kern })
  }
  const result: Compiled = {
    index: new Map(metrics.codepoints.map((cp, i) => [cp, i])),
    covered: new Set(metrics.covered),
    faces,
  }
  compiled.set(metrics, result)
  return result
}

/** Builds (once per metric set) the lookups `fitLines` measures with. */
export function measurer(metrics: FontMetrics): Measurer {
  const { index, covered, faces } = compile(metrics)
  return {
    covers: (text) => Array.from(text).every((ch) => covered.has(ch.codePointAt(0) ?? -1)),
    widths: (weight) =>
      Object.keys(metrics.faces)
        .map((key) => key.split("/").map(Number))
        .filter(([, w]) => w === weight)
        .map(([wdth]) => wdth)
        .sort((a, b) => a - b),
    em(text, wdth, weight, tracking, tnum) {
      const face = faces.get(`${wdth}/${weight}`)
      if (!face) throw new Error(`No metrics for width ${wdth} at weight ${weight}`)
      let units = 0
      let previous = -1
      let count = 0
      for (const ch of text) {
        const cp = ch.codePointAt(0) ?? 0
        const i = index.get(cp)
        if (i === undefined) throw new Error(`U+${cp.toString(16).toUpperCase()} is outside the font subset`)
        units += tnum && cp >= 0x30 && cp <= 0x39 ? face.tnum[cp - 0x30] : face.advances[i]
        if (previous >= 0) units += face.kern.get(metrics.kernLeft[previous] * KERN_STRIDE + metrics.kernRight[i]) ?? 0
        previous = i
        count += 1
      }
      return units / metrics.unitsPerEm + count * tracking
    },
  }
}
