import { randomBytes } from "crypto"

import { generateShareToken } from "@/lib/utils"

import { ratingKeySchema, recordIdSchema, shareTokenSchema, yearParamSchema } from "../params"

describe("params", () => {
  describe("shareTokenSchema", () => {
    it("accepts every token generateShareToken makes", () => {
      for (let i = 0; i < 50; i++) {
        expect(shareTokenSchema.safeParse(generateShareToken()).success).toBe(true)
      }
    })

    it.each([
      ["31 bytes", randomBytes(31).toString("base64url")],
      ["33 bytes", randomBytes(33).toString("base64url")],
      ["standard base64 with padding", randomBytes(32).toString("base64")],
      ["a slash", `${"a".repeat(42)}/`],
      ["a dot", `${"a".repeat(42)}.`],
      ["empty", ""],
    ])("rejects %s", (_label, token) => {
      expect(shareTokenSchema.safeParse(token).success).toBe(false)
    })
  })

  describe("ratingKeySchema", () => {
    it.each(["1", "123456789012"])("accepts %s", (key) => {
      expect(ratingKeySchema.safeParse(key).success).toBe(true)
    })

    it.each(["../1", "1a", "", "1234567890123", "-1"])("rejects %s", (key) => {
      expect(ratingKeySchema.safeParse(key).success).toBe(false)
    })
  })

  describe("yearParamSchema", () => {
    it("parses a four-digit year", () => {
      expect(yearParamSchema.parse("2026")).toBe(2026)
    })

    it.each(["abc", "0x7EA", "2026.0", "1999", "202"])("rejects %s", (year) => {
      expect(yearParamSchema.safeParse(year).success).toBe(false)
    })
  })

  describe("recordIdSchema", () => {
    it.each(["cmgx1y2z30000abcdefghijkl", "visual-rewind", "wrapped_1"])("accepts %s", (id) => {
      expect(recordIdSchema.safeParse(id).success).toBe(true)
    })

    it.each(["../etc", "a.b", "a/b", "", "x".repeat(65)])("rejects %s", (id) => {
      expect(recordIdSchema.safeParse(id).success).toBe(false)
    })
  })
})
