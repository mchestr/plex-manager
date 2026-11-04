/**
 * @jest-environment node
 */

/** GET /api/branding/[kind]: the stored bytes with their sniffed type, sandboxed, cached for good only when versioned. */

import { mockReset } from "jest-mock-extended"

import { GET } from "@/app/api/branding/[kind]/route"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("next/server", () => ({ ...jest.requireActual("next/server"), connection: jest.fn() }))

const SHA = "ab".repeat(32)
const row = (contentType: string, bytes: number[]) => ({
  kind: "wordmark",
  contentType,
  data: new Uint8Array(bytes),
  sha256: SHA,
  size: bytes.length,
  updatedAt: new Date(),
  updatedBy: null,
})
const get = (kind: string, query = "") => GET(new Request(`http://localhost/api/branding/${kind}${query}`), { params: Promise.resolve({ kind }) })

beforeEach(() => mockReset(prismaMock))

it("serves the image with its type and a sandboxing policy", async () => {
  prismaMock.brandAsset.findUnique.mockResolvedValue(row("image/svg+xml", [60, 115, 118, 103, 62]))
  const response = await get("wordmark", `?v=${SHA.slice(0, 16)}`)
  expect(response.status).toBe(200)
  expect(response.headers.get("Content-Type")).toBe("image/svg+xml")
  expect(response.headers.get("Content-Security-Policy")).toContain("sandbox")
  expect(response.headers.get("Cache-Control")).toContain("immutable")
  expect(await response.text()).toBe("<svg>")
})

it("keeps an unversioned or stale link for five minutes only", async () => {
  prismaMock.brandAsset.findUnique.mockResolvedValue(row("image/png", [1]))
  expect((await get("icon")).headers.get("Cache-Control")).toBe("public, max-age=300")
  expect((await get("icon", "?v=0000")).headers.get("Cache-Control")).toBe("public, max-age=300")
})

it("is a 404 for a slot with no image and for a kind that is not a slot", async () => {
  prismaMock.brandAsset.findUnique.mockResolvedValue(null)
  expect((await get("favicon")).status).toBe(404)
  expect((await get("../config")).status).toBe(404)
})
