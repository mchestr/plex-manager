/**
 * @jest-environment node
 *
 * The file-based icons and the default OG card (P3.9, ui-design-system 7.5):
 * each route builds its image from the committed fonts and never reaches the
 * network, whatever the server name.
 *
 * Jest cannot load `@vercel/og`, so `next/og` is captured here and the image
 * the route built is rendered for real in a child Node process
 * (`lib/og/__tests__/helpers/render-png.cjs`), with `fetch` disabled there too.
 */

import { execFileSync } from "node:child_process"
import path from "node:path"
import { isValidElement, type ReactElement, type ReactNode } from "react"

import AppleIcon from "@/app/apple-icon"
import Icon, { generateImageMetadata } from "@/app/icon"
import manifest from "@/app/manifest"
import OpenGraphImage, { size as ogSize } from "@/app/opengraph-image"
import { getAppSettings } from "@/lib/settings/app-settings"

interface Captured {
  element: ReactElement
  options: { width: number; height: number; fonts: { name: string; weight: number; style: string; data: ArrayBuffer }[] }
}

const captured: Captured[] = []

jest.mock("next/og", () => ({
  ImageResponse: class {
    constructor(element: ReactElement, options: Captured["options"]) {
      captured.push({ element, options })
    }
  },
}))
jest.mock("next/server", () => ({ connection: jest.fn(async () => undefined) }))
jest.mock("@/lib/settings/app-settings", () => ({ getAppSettings: jest.fn() }))

const settings = getAppSettings as jest.Mock
const fetchSpy = jest.fn(async () => {
  throw new Error("network disabled")
})

beforeEach(() => {
  captured.length = 0
  fetchSpy.mockClear()
  global.fetch = fetchSpy as unknown as typeof fetch
})

function named(serverName: string | null) {
  settings.mockResolvedValue({ timeZone: "UTC", locale: "en-US", serverName })
}

/** The element tree with function components called, as plain JSON for the child process. */
function plain(node: ReactNode): unknown {
  if (Array.isArray(node)) return node.map(plain)
  if (!isValidElement(node)) return node
  const { type, props } = node as ReactElement<{ children?: ReactNode }>
  if (typeof type === "function") return plain((type as (p: unknown) => ReactNode)(props))
  return { type, props: { ...props, children: plain(props.children) } }
}

function render({ element, options }: Captured) {
  const input = JSON.stringify({
    element: plain(element),
    width: options.width,
    height: options.height,
    fonts: options.fonts.map((font) => ({ ...font, data: Buffer.from(font.data).toString("base64") })),
  })
  const out = execFileSync(process.execPath, [path.join(__dirname, "../../lib/og/__tests__/helpers/render-png.cjs")], {
    input,
    cwd: path.join(__dirname, "../.."),
  })
  return JSON.parse(out.toString()) as { png: string; bytes: number; fetches: string[] }
}

/** Every string drawn in the image. */
function texts(node: ReactNode): string[] {
  const tree = plain(node)
  const out: string[] = []
  const walk = (n: unknown) => {
    if (typeof n === "string") out.push(n)
    else if (Array.isArray(n)) n.forEach(walk)
    else if (n && typeof n === "object" && "props" in n) walk((n as { props: { children?: unknown } }).props.children)
  }
  walk(tree)
  return out
}

describe("app/icon.tsx", () => {
  it("lists the 32, 192 and 512 icons", () => {
    expect(generateImageMetadata().map(({ id, size }) => [id, size.width])).toEqual([
      ["32", 32],
      ["192", 192],
      ["512", 512],
    ])
  })

  it("draws the monogram of a Latin name", async () => {
    named("Northfield Plex")
    await Icon({ id: Promise.resolve("192") })

    expect(captured[0].options).toMatchObject({ width: 192, height: 192 })
    expect(texts(captured[0].element)).toEqual(["N"])
  })

  it("returns a PNG for a CJK server name and makes no request", async () => {
    named("東京サーバー")
    await Icon({ id: Promise.resolve("512") })

    expect(texts(captured[0].element)).toEqual([])
    const result = render(captured[0])
    expect(result.png).toBe("PNG")
    expect(result.fetches).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("serves an unknown id at 32px", async () => {
    named(null)
    await Icon({ id: Promise.resolve("9999") })
    expect(captured[0].options.width).toBe(32)
  })
})

describe("app/apple-icon.tsx", () => {
  it("draws a 180px square tile", async () => {
    named("Northfield Plex")
    await AppleIcon()
    expect(captured[0].options).toMatchObject({ width: 180, height: 180 })
  })
})

describe("app/opengraph-image.tsx", () => {
  it("draws the monogram and the server name at 1200x630", async () => {
    named("Northfield Plex")
    await OpenGraphImage()

    expect(ogSize).toEqual({ width: 1200, height: 630 })
    expect(captured[0].options).toMatchObject(ogSize)
    expect(texts(captured[0].element)).toEqual(expect.arrayContaining(["N", "Northfield Plex"]))
  })

  it.each([["東京サーバー"], ["مكتبة الأفلام"], ["🎬 Movie Night"]])(
    "returns a PNG for %p and makes no request",
    async (name) => {
      named(name)
      await OpenGraphImage()

      expect(texts(captured[0].element)).not.toContain(name)
      expect(texts(captured[0].element)).toContain("Plex Manager")
      const result = render(captured[0])
      expect(result.png).toBe("PNG")
      expect(result.fetches).toEqual([])
      expect(fetchSpy).not.toHaveBeenCalled()
    },
  )
})

describe("app/manifest.ts", () => {
  it("names the app after the server and points at the 192 and 512 icons", async () => {
    named("Northfield Plex")
    const result = await manifest()

    expect(result).toMatchObject({
      name: "Northfield Plex",
      display: "standalone",
      theme_color: "#1a1c1e",
      background_color: "#1a1c1e",
    })
    expect(result.icons?.map((icon) => icon.src)).toEqual(["/icon/192", "/icon/512"])
  })
})
