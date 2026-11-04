/**
 * @jest-environment node
 */

/** GET /api/branding/[kind]/[version]: the stored bytes with their sniffed type and nosniff, cached for good only at the current version. */

import { mockReset } from "jest-mock-extended"

import { GET } from "@/app/api/branding/[kind]/[version]/route"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("next/server", () => ({ ...jest.requireActual("next/server"), connection: jest.fn() }))

const SHA = "ab".repeat(32)
const CURRENT = SHA.slice(0, 16)
const row = (contentType: string, bytes: number[]) => ({
  kind: "wordmark",
  contentType,
  data: new Uint8Array(bytes),
  sha256: SHA,
  size: bytes.length,
  updatedAt: new Date(),
  updatedBy: null,
})
const get = (kind: string, version: string, headers: HeadersInit = {}) =>
  GET(new Request(`http://localhost/api/branding/${kind}/${version}`, { headers }), { params: Promise.resolve({ kind, version }) })

function stored(found: ReturnType<typeof row> | null) {
  prismaMock.brandAsset.findUnique.mockResolvedValue(found)
}

beforeEach(() => mockReset(prismaMock))

it("serves the image with its type and nosniff, cached for good at the current version", async () => {
  stored(row("image/svg+xml", [60, 115, 118, 103, 62]))
  const response = await get("wordmark", CURRENT)
  expect(response.status).toBe(200)
  expect(response.headers.get("Content-Type")).toBe("image/svg+xml")
  expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
  expect(response.headers.get("Cache-Control")).toContain("immutable")
  expect(await response.text()).toBe("<svg>")
})

it("serves an older link the current image for five minutes only", async () => {
  stored(row("image/png", [1]))
  const response = await get("icon", "0000000000000000")
  expect(response.status).toBe(200)
  expect(response.headers.get("Cache-Control")).toBe("public, max-age=300")
})

it("answers a matching If-None-Match with a 304 and never reads the bytes", async () => {
  stored(row("image/png", [1]))
  const response = await get("icon", CURRENT, { "If-None-Match": `"${SHA}"` })
  expect(response.status).toBe(304)
  expect(prismaMock.brandAsset.findUnique).toHaveBeenCalledTimes(1)
  expect(prismaMock.brandAsset.findUnique).toHaveBeenCalledWith({ where: { kind: "icon" }, select: { sha256: true } })
})

it("is a 404 for a slot with no image, a kind that is not a slot and a malformed version", async () => {
  stored(null)
  expect((await get("favicon", CURRENT)).status).toBe(404)
  expect((await get("../config", CURRENT)).status).toBe(404)
  expect((await get("icon", "a")).status).toBe(404)
  expect((await get("icon", `${CURRENT}0`)).status).toBe(404)
})
