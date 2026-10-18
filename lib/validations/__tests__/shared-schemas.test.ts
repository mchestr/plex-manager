import { randomBytes } from "crypto"

import { generateShareToken } from "@/lib/utils"

import { createServerUrlSchema, createPublicUrlSchema, shareTokenSchema } from "../shared-schemas"

describe("shared-schemas", () => {
  describe("createServerUrlSchema", () => {
    const serverUrlSchema = createServerUrlSchema("8989")

    describe("validation", () => {
      it("should accept valid URLs with protocol and port", () => {
        const result = serverUrlSchema.safeParse("http://localhost:8989")
        expect(result.success).toBe(true)
      })

      it("should accept valid HTTPS URLs", () => {
        const result = serverUrlSchema.safeParse("https://example.com:443")
        expect(result.success).toBe(true)
      })

      it("should accept URLs without explicit port", () => {
        const result = serverUrlSchema.safeParse("https://example.com")
        expect(result.success).toBe(true)
      })

      it("should accept IP addresses", () => {
        const result = serverUrlSchema.safeParse("http://192.168.1.100:8989")
        expect(result.success).toBe(true)
      })

      it("should reject empty strings", () => {
        const result = serverUrlSchema.safeParse("")
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toBe("Server URL is required")
      })

      it("should reject URLs with invalid protocols", () => {
        const result = serverUrlSchema.safeParse("ftp://example.com:8989")
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toContain("Invalid URL format")
      })

      it("should include example port in error message", () => {
        const result = serverUrlSchema.safeParse("ftp://example.com:8989")
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toContain(":8989")
      })

      it("should accept hostname-only URLs (defaults to https)", () => {
        const result = serverUrlSchema.safeParse("example.com")
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data).toBe("https://example.com")
        }
      })
    })

    describe("transformation", () => {
      it("should normalize URL with non-default port", () => {
        const result = serverUrlSchema.parse("http://localhost:8989")
        expect(result).toBe("http://localhost:8989")
      })

      it("should strip default HTTPS port (443)", () => {
        const result = serverUrlSchema.parse("https://example.com:443")
        expect(result).toBe("https://example.com")
      })

      it("should strip default HTTP port (80)", () => {
        const result = serverUrlSchema.parse("http://example.com:80")
        expect(result).toBe("http://example.com")
      })

      it("should keep non-default ports", () => {
        const result = serverUrlSchema.parse("https://example.com:8443")
        expect(result).toBe("https://example.com:8443")
      })

      it("should preserve hostname for IP addresses", () => {
        const result = serverUrlSchema.parse("http://192.168.1.100:7878")
        expect(result).toBe("http://192.168.1.100:7878")
      })
    })

    describe("without example port", () => {
      const schemaWithoutPort = createServerUrlSchema()

      it("should not include port in error message when not provided", () => {
        const result = schemaWithoutPort.safeParse("ftp://example.com")
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toBe(
          "Invalid URL format. Expected format: http://example.com"
        )
      })
    })
  })

  describe("createPublicUrlSchema", () => {
    const publicUrlSchema = createPublicUrlSchema("sonarr.example.com")

    describe("validation", () => {
      it("should accept undefined", () => {
        const result = publicUrlSchema.safeParse(undefined)
        expect(result.success).toBe(true)
        expect(result.data).toBeUndefined()
      })

      it("should accept valid HTTPS URLs", () => {
        const result = publicUrlSchema.safeParse("https://sonarr.example.com")
        expect(result.success).toBe(true)
        expect(result.data).toBe("https://sonarr.example.com")
      })

      it("should accept valid HTTP URLs", () => {
        const result = publicUrlSchema.safeParse("http://sonarr.example.com")
        expect(result.success).toBe(true)
      })

      it("should accept URLs with paths", () => {
        const result = publicUrlSchema.safeParse("https://example.com/sonarr")
        expect(result.success).toBe(true)
      })

      it("should reject invalid URLs", () => {
        const result = publicUrlSchema.safeParse("not a valid url with spaces")
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toContain("Invalid URL format")
      })

      it("should include example domain in error message", () => {
        const result = publicUrlSchema.safeParse("not a valid url")
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toContain("sonarr.example.com")
      })
    })

    describe("without example domain", () => {
      const schemaWithoutDomain = createPublicUrlSchema()

      it("should use default example.com in error message", () => {
        const result = schemaWithoutDomain.safeParse("not a valid url")
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toBe(
          "Invalid URL format. Expected format: https://example.com"
        )
      })
    })
  })

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
})
