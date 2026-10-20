/**
 * Poster pixels for the Rewind poster route (design 5.8): sized WebP in full
 * colour, or a duotone between two Rewind inks.
 *
 * ## Duotone
 *
 * `grayscale()` then `normalise()` stretches the art's tones over the full
 * range; a 256-entry lookup table then maps each luminance between the
 * pair's darker ink (black) and lighter ink (white), so every pixel lies on
 * the line between the two inks and the art prints like the page.
 *
 * ## Clash
 *
 * A full-colour hero slot sends its page's pair as `clash`. The duotone is
 * served instead when the art would not sit on the page: its mean luminance
 * is outside 0.08 to 0.92 (near black or near white), or its aspect ratio is
 * more than 10% off 2:3.
 *
 * @module lib/rewind/poster/image
 */

import "server-only"

import sharp from "sharp"

import { toneHexes, type TonePair } from "@/lib/rewind/media/tone"

const FULL_QUALITY = 76
const DUOTONE_QUALITY = 72
const LUMA_MIN = 0.08
const LUMA_MAX = 0.92
const ASPECT = 2 / 3
const ASPECT_SLACK = 0.1

type Rgb = [number, number, number]

const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb

/** WCAG relative luminance, to order the two inks. */
function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/**
 * The lookup table: entry `l` is the colour for luminance `l`, from the
 * darker ink at 0 to the lighter at 255.
 *
 * @example
 * ```ts
 * const lut = duotoneLut({ spot: "marigold", field: "marigold" })
 * lut[0]   // [31, 19, 6]: marigold's own ink, #1f1306
 * lut[255] // [254, 182, 68]: the marigold field, #feb644
 * ```
 *
 * @internal
 */
export function duotoneLut(pair: TonePair): Rgb[] {
  const hexes = toneHexes(pair)
  const [dark, light] = [rgb(hexes.spot), rgb(hexes.field)].sort((a, b) => luminance(a) - luminance(b))
  return Array.from({ length: 256 }, (_, l) => dark.map((d, c) => Math.round(d + ((light[c] - d) * l) / 255)) as Rgb)
}

/** Whether full-colour art clashes with its page (see the module doc). @internal */
export async function clashes(input: Buffer): Promise<boolean> {
  const image = sharp(input)
  const { width = 0, height = 0 } = await image.metadata()
  if (width === 0 || height === 0) return true
  if (Math.abs(width / height - ASPECT) / ASPECT > ASPECT_SLACK) return true
  const { channels } = await sharp(input).grayscale().stats()
  const mean = channels[0].mean / 255
  return mean < LUMA_MIN || mean > LUMA_MAX
}

/** The duotone as raw RGB pixels, before encoding. @internal */
export async function duotoneRaw(input: Buffer, w: number, pair: TonePair): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(input)
    .resize(w, Math.round(w * 1.5), { fit: "cover" })
    .grayscale()
    .normalise()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const lut = duotoneLut(pair)
  const out = Buffer.alloc(info.width * info.height * 3)
  for (let i = 0; i < info.width * info.height; i++) {
    const [r, g, b] = lut[data[i * info.channels]]
    out[i * 3] = r
    out[i * 3 + 1] = g
    out[i * 3 + 2] = b
  }
  return { data: out, width: info.width, height: info.height }
}

/**
 * The served image: full colour at quality 76, or the duotone at 72 when a
 * tone is asked for or the art clashes with the `clash` pair.
 */
export async function renderPoster(input: Buffer, { w, tone, clash }: { w: number; tone: TonePair | null; clash: TonePair | null }): Promise<Buffer> {
  const pair = tone ?? (clash && (await clashes(input)) ? clash : null)
  if (!pair) {
    return sharp(input).resize(w, Math.round(w * 1.5), { fit: "cover" }).webp({ quality: FULL_QUALITY }).toBuffer()
  }
  const raw = await duotoneRaw(input, w, pair)
  return sharp(raw.data, { raw: { width: raw.width, height: raw.height, channels: 3 } })
    .webp({ quality: DUOTONE_QUALITY })
    .toBuffer()
}
