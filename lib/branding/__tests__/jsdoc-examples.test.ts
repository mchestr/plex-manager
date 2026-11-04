import { accentStyleSheet, accentTokens } from "@/lib/branding/accent"
import { acceptsType, brandAssetUrl, sniffImageType } from "@/lib/branding/assets"

describe("JSDoc Documentation Examples", () => {
  it("lib/branding/assets", () => {
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png")
    expect(acceptsType("favicon", "image/webp")).toBe(false)
    expect(brandAssetUrl("icon", "0123456789abcdef0123")).toBe("/api/branding/icon?v=0123456789abcdef")
  })

  it("lib/branding/accent", () => {
    expect(accentTokens("#E4202B").light["primary-foreground"]).toBe("#fafafa")
    expect(accentStyleSheet("not a colour")).toBe("")
  })
})
