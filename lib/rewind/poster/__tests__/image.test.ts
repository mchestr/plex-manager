/**
 * @jest-environment node
 */

import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import sharp from "sharp"

import { posterCachePath, readCachedPoster, writeCachedPoster } from "@/lib/rewind/poster/disk-cache"
import { clashes, duotoneLut, duotoneRaw, renderPoster } from "@/lib/rewind/poster/image"

jest.mock("server-only", () => ({}))

const PAIR = { spot: "ultramarine", field: "paper" } as const
const INK = [0x22, 0x38, 0xb8]
const PAPER = [0xf1, 0xea, 0xdc]

/** A 2:3 test card: a left-to-right ramp with coloured stripes, so tones span the range. */
async function poster(width = 200, height = 300, fill?: number): Promise<Buffer> {
  const data = Buffer.alloc(width * height * 3)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3
      const v = fill ?? Math.round((x / (width - 1)) * 255)
      data[i] = v
      data[i + 1] = fill ?? (y % 40 < 20 ? 255 - v : v)
      data[i + 2] = fill ?? 128
    }
  }
  return sharp(data, { raw: { width, height, channels: 3 } }).png().toBuffer()
}

/** Whether a pixel lies on the segment between two colours, within `slack` per channel. */
function onLine(px: number[], a: number[], b: number[], slack = 0): boolean {
  const t = (px[0] - a[0]) / (b[0] - a[0] || 1)
  return px.every((c, i) => Math.abs(c - (a[i] + (b[i] - a[i]) * Math.min(1, Math.max(0, t)))) <= slack + 1)
}

describe("duotoneLut", () => {
  it("runs from the darker ink to the lighter", () => {
    const lut = duotoneLut(PAIR)
    expect(lut).toHaveLength(256)
    expect(lut[0]).toEqual(INK)
    expect(lut[255]).toEqual(PAPER)
  })

  it("uses the field's own ink for a two-ink page", () => {
    const lut = duotoneLut({ spot: "marigold", field: "marigold" })
    expect(lut[0]).toEqual([0x1f, 0x13, 0x06])
    expect(lut[255]).toEqual([0xfe, 0xb6, 0x44])
  })
})

describe("duotoneRaw", () => {
  it("puts every pixel between the two inks, at the served size", async () => {
    const raw = await duotoneRaw(await poster(), 96, PAIR)
    expect([raw.width, raw.height]).toEqual([96, 144])
    for (let i = 0; i < raw.data.length; i += 3) {
      const px = [raw.data[i], raw.data[i + 1], raw.data[i + 2]]
      if (!onLine(px, INK, PAPER)) throw new Error(`pixel ${i / 3} ${px} is off the ink line`)
    }
  })
})

describe("clashes", () => {
  it("is false for mid-tone 2:3 art", async () => {
    expect(await clashes(await poster())).toBe(false)
  })

  it("is true for near-white or near-black art", async () => {
    expect(await clashes(await poster(200, 300, 250))).toBe(true)
    expect(await clashes(await poster(200, 300, 8))).toBe(true)
  })

  it("is true for art more than 10% off 2:3", async () => {
    expect(await clashes(await poster(300, 300))).toBe(true)
    expect(await clashes(await poster(200, 290))).toBe(false)
  })
})

describe("renderPoster", () => {
  async function pixels(webp: Buffer) {
    const { data, info } = await sharp(webp).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    return { data, info }
  }

  it("serves full colour WebP at the asked width", async () => {
    const out = await renderPoster(await poster(), { w: 160, tone: null, clash: null })
    const meta = await sharp(out).metadata()
    expect(meta.format).toBe("webp")
    expect([meta.width, meta.height]).toEqual([160, 240])
  })

  it("serves the clash duotone for near-white art in a hero slot, and full colour otherwise", async () => {
    const white = await pixels(await renderPoster(await poster(200, 300, 250), { w: 96, tone: null, clash: PAIR }))
    // a flat image normalises to one tone of the duotone, never to the art's own white
    const first = [white.data[0], white.data[1], white.data[2]]
    expect(onLine(first, INK, PAPER, 8)).toBe(true)

    const art = await pixels(await renderPoster(await poster(), { w: 96, tone: null, clash: PAIR }))
    const hasColour = Array.from({ length: art.info.width * art.info.height }, (_, i) => [art.data[i * 3], art.data[i * 3 + 1], art.data[i * 3 + 2]]).some(
      (px) => !onLine(px, INK, PAPER, 24)
    )
    expect(hasColour).toBe(true)
  })
})

describe("the disk cache", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "rewind-posters-"))
    jest.replaceProperty(process, "env", { ...process.env, REWIND_CACHE_DIR: dir })
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it("keeps a poster under posters/{key}-{tone}-{w}.webp and reads it back", async () => {
    const file = posterCachePath("123", "ultramarine.paper", 96)
    expect(file).toBe(path.join(dir, "posters", "123-ultramarine.paper-96.webp"))
    expect(await readCachedPoster(file)).toBeNull()

    await writeCachedPoster(file, Buffer.from("webp"))

    expect(await readCachedPoster(file)).toEqual(Buffer.from("webp"))
    expect(await readdir(path.join(dir, "posters"))).toEqual(["123-ultramarine.paper-96.webp"])
  })

  it("serves on when the cache cannot be written", async () => {
    const blocker = path.join(dir, "a-file")
    await writeFile(blocker, "not a directory")
    await expect(writeCachedPoster(path.join(blocker, "posters", "poster.webp"), Buffer.from("x"))).resolves.toBeUndefined()
  })
})
