import { acceptsType, BRAND_ASSET_KINDS, brandAssetUrl, formatList, sniffImageType } from "@/lib/branding/assets"

const bytes = (...values: number[]) => new Uint8Array(values)
const text = (value: string) => new TextEncoder().encode(value)

describe("sniffImageType", () => {
  it("reads PNG, JPEG and WebP signatures", () => {
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("image/png")
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg")
    expect(sniffImageType(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50))).toBe("image/webp")
  })

  it("reads an SVG after a BOM, an XML declaration and a comment", () => {
    expect(sniffImageType(text('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe("image/svg+xml")
    expect(sniffImageType(text('﻿<?xml version="1.0"?>\n<!-- logo -->\n<svg>'))).toBe("image/svg+xml")
  })

  it("refuses anything else, whatever it claims to be", () => {
    expect(sniffImageType(text("<html><svg></svg></html>"))).toBeNull()
    expect(sniffImageType(bytes(0x00, 0x00, 0x01, 0x00))).toBeNull() // ICO
    expect(sniffImageType(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x41, 0x56, 0x49, 0x20))).toBeNull() // AVI
    expect(sniffImageType(new Uint8Array())).toBeNull()
  })
})

describe("the slots", () => {
  it("keeps WebP out of the icons next/og draws", () => {
    expect(acceptsType("icon", "image/webp")).toBe(false)
    expect(acceptsType("favicon", "image/webp")).toBe(false)
    expect(acceptsType("login-background", "image/webp")).toBe(true)
    expect(acceptsType("login-background", "image/svg+xml")).toBe(false)
  })

  it("lists each slot's formats for the copy", () => {
    expect(formatList("wordmark")).toBe("PNG, WebP or SVG")
    expect(BRAND_ASSET_KINDS.map(formatList)).toHaveLength(4)
  })

  it("versions the URL with the hash", () => {
    expect(brandAssetUrl("icon", "0123456789abcdef0123")).toBe("/api/branding/icon?v=0123456789abcdef")
  })
})
