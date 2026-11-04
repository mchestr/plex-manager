/**
 * @jest-environment node
 */

/** Appearance: admins only; blanks clear, colours normalise, and both caches expire. */

import { mockReset } from "jest-mock-extended"
import { getServerSession } from "next-auth"

import { removeBrandAsset, uploadBrandAsset } from "@/actions/admin/brand-assets"
import { updateAppearance } from "@/actions/admin/branding"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { expireTag } from "@/lib/actions/invalidate"
import { canDrawIcon } from "@/lib/og/brand-images"
import { consume } from "@/lib/security/rate-limit"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))
jest.mock("@/lib/actions/invalidate", () => ({ expireTag: jest.fn() }))
jest.mock("@/lib/security/rate-limit", () => ({ consume: jest.fn(), actionClientIp: jest.fn() }))
jest.mock("@/lib/og/brand-images", () => ({ canDrawIcon: jest.fn() }))
jest.mock("@/lib/security/audit-log", () => ({
  ...jest.requireActual("@/lib/security/audit-log"),
  logAuditEvent: jest.fn(),
}))

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]

beforeEach(() => {
  jest.clearAllMocks()
  mockReset(prismaMock)
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: "admin-1", isAdmin: true }, expires: "" })
  jest.mocked(consume).mockResolvedValue({ ok: true })
  jest.mocked(canDrawIcon).mockResolvedValue(true)
})

describe("updateAppearance", () => {
  it("saves trimmed values, clears blanks and upper-cases the colour", async () => {
    prismaMock.config.findUnique.mockResolvedValue(null)
    const result = await updateAppearance({ serverName: " Mikeflix ", loginSubtitle: "  ", accentColor: "#e4202b" })
    const saved = { serverName: "Mikeflix", loginSubtitle: null, accentColor: "#E4202B" }
    expect(result).toEqual({ success: true, data: saved })
    expect(prismaMock.config.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { ...saved, updatedBy: "admin-1" } })
    )
    expect(expireTag).toHaveBeenCalledWith("app-settings")
    expect(expireTag).toHaveBeenCalledWith("branding")
  })

  it("refuses a colour that is not #RRGGBB", async () => {
    const result = await updateAppearance({ serverName: "", loginSubtitle: "", accentColor: "red" })
    expect(result).toMatchObject({ success: false, code: "VALIDATION", fieldErrors: { accentColor: [expect.any(String)] } })
    expect(prismaMock.config.upsert).not.toHaveBeenCalled()
  })

  it("refuses Support", async () => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { id: "s-1", isAdmin: false, role: "support" }, expires: "" })
    await expect(updateAppearance({ serverName: "", loginSubtitle: "", accentColor: "" })).resolves.toMatchObject({ code: "FORBIDDEN" })
  })
})

describe("uploadBrandAsset", () => {
  it("stores the sniffed type and the hash, never the claimed type", async () => {
    const file = new File([new Uint8Array(PNG)], "logo.svg", { type: "image/svg+xml" })
    const result = await uploadBrandAsset({ kind: "icon", file })
    expect(result).toMatchObject({ success: true, data: { kind: "icon", url: expect.stringMatching(/^\/api\/branding\/icon\?v=[0-9a-f]{16}$/) } })
    expect(prismaMock.brandAsset.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { kind: "icon" },
        update: expect.objectContaining({ contentType: "image/png", size: PNG.length, updatedBy: "admin-1" }),
      })
    )
    expect(consume).toHaveBeenCalledWith("admin", "admin-1")
    expect(expireTag).toHaveBeenCalledWith("branding")
  })

  it("refuses a type the slot does not take", async () => {
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50])
    const result = await uploadBrandAsset({ kind: "favicon", file: new File([webp], "f.webp") })
    expect(result).toEqual({ success: false, code: "VALIDATION", error: "Favicon must be a PNG, JPEG or SVG image" })
    expect(prismaMock.brandAsset.upsert).not.toHaveBeenCalled()
  })

  it("refuses an icon the icon renderer cannot draw", async () => {
    jest.mocked(canDrawIcon).mockResolvedValue(false)
    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'], "icon.svg")
    const result = await uploadBrandAsset({ kind: "icon", file: svg })
    expect(result).toEqual({ success: false, code: "VALIDATION", error: "Logo (icon) could not be drawn. Use a PNG, or an SVG with a viewBox" })
    expect(canDrawIcon).toHaveBeenCalledWith("image/svg+xml", expect.any(Uint8Array))
    expect(prismaMock.brandAsset.upsert).not.toHaveBeenCalled()
  })

  it("does not draw-check a wordmark", async () => {
    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], "w.svg")
    await expect(uploadBrandAsset({ kind: "wordmark", file: svg })).resolves.toMatchObject({ success: true })
    expect(canDrawIcon).not.toHaveBeenCalled()
  })

  it("refuses an empty file", async () => {
    await expect(uploadBrandAsset({ kind: "icon", file: new File([], "x.png") })).resolves.toMatchObject({ code: "VALIDATION" })
  })
})

describe("removeBrandAsset", () => {
  it("deletes the slot's image", async () => {
    prismaMock.brandAsset.deleteMany.mockResolvedValue({ count: 1 })
    await expect(removeBrandAsset("wordmark")).resolves.toEqual({ success: true, data: { kind: "wordmark" } })
    expect(prismaMock.brandAsset.deleteMany).toHaveBeenCalledWith({ where: { kind: "wordmark" } })
  })
})
