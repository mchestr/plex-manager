/**
 * Tests for actions/chatbot/executors/scrub.ts
 *
 * scrubForDiscord() is the PII/data-leak firewall for the Discord context: it
 * projects a tool's raw output down to a per-tool allowlist of safe fields
 * (`RegisteredTool.discordFields`) BEFORE the LLM ever sees the result.
 *
 * Security invariants exercised here:
 * - Only allowlisted leaf keys survive; sibling PII (email/username/user_id/
 *   ip/last_seen/token) is dropped even when nested under wrapper objects.
 * - Deep projection: allowlisted leaves survive through arbitrary wrapper
 *   layers (response.data.x, MediaContainer.Metadata[].x).
 * - Robustness: JSON-string OR object input; arrays of records; empty/malformed
 *   input never throws.
 * - FAIL CLOSED: a discordSafe tool with NO discordFields yields a redacted
 *   marker, never raw data. An unknown / non-discordSafe tool also fails closed.
 */

import { scrubForDiscord, DISCORD_REDACTED_MARKER } from "../scrub"
import { getRegisteredTool } from "@/actions/chatbot/tools"
import type { RegisteredTool } from "@/actions/chatbot/tools"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  })),
}))

jest.mock("@/actions/chatbot/tools", () => {
  const actual = jest.requireActual("@/actions/chatbot/tools")
  return {
    ...actual,
    getRegisteredTool: jest.fn(actual.getRegisteredTool),
  }
})

const mockGetRegisteredTool = getRegisteredTool as jest.MockedFunction<typeof getRegisteredTool>

function fakeTool(overrides: Partial<RegisteredTool>): RegisteredTool {
  return {
    type: "function",
    function: { name: "fake_tool", description: "", parameters: { type: "object", properties: {} } },
    ...overrides,
  } as RegisteredTool
}

function parse(result: string): unknown {
  return JSON.parse(result)
}

describe("scrubForDiscord", () => {
  describe("allowlist projection", () => {
    it("keeps only allowlisted leaf keys and drops PII siblings", () => {
      // get_tautulli_status allowlist includes tautulli_version + stream_count
      const raw = {
        response: {
          result: "success",
          data: {
            tautulli_version: "2.13.4",
            stream_count: "3",
            // PII / identifying siblings that must be dropped:
            username: "alice",
            email: "alice@example.com",
            user_id: 12345,
            ip_address: "10.0.0.5",
          },
        },
      }

      const scrubbed = parse(scrubForDiscord("get_tautulli_status", raw)) as any

      const flat = JSON.stringify(scrubbed)
      expect(flat).toContain("tautulli_version")
      expect(flat).toContain("stream_count")
      expect(flat).not.toContain("username")
      expect(flat).not.toContain("alice")
      expect(flat).not.toContain("email")
      expect(flat).not.toContain("user_id")
      expect(flat).not.toContain("ip_address")
      expect(flat).not.toContain("10.0.0.5")
    })

    it("drops user_id / ip / last_seen even when they appear at the top level", () => {
      // get_sonarr_status allowlist includes real arr-v3 keys: version + totalRecords.
      const raw = {
        version: "4.0.0",
        totalRecords: 2,
        user_id: 99,
        ip: "192.168.1.1",
        last_seen: 1700000000,
        username: "bob",
      }

      const scrubbed = parse(scrubForDiscord("get_sonarr_status", raw)) as any
      const flat = JSON.stringify(scrubbed)

      expect(flat).toContain("version")
      expect(flat).toContain("totalRecords")
      expect(flat).not.toContain("user_id")
      expect(flat).not.toContain("ip")
      expect(flat).not.toContain("last_seen")
      expect(flat).not.toContain("username")
      expect(flat).not.toContain("bob")
    })

    it("recurses into arrays of records, keeping only allowlisted keys per element", () => {
      // get_sonarr_queue allowlist keeps title/status/progress fields.
      const raw = {
        records: [
          { title: "The Show", status: "downloading", downloadId: "abc", indexer: "SecretIndexer" },
          { title: "Another", status: "completed", downloadId: "def", indexer: "SecretIndexer" },
        ],
      }

      const scrubbed = parse(scrubForDiscord("get_sonarr_queue", raw)) as any
      const flat = JSON.stringify(scrubbed)

      expect(flat).toContain("The Show")
      expect(flat).toContain("Another")
      expect(flat).toContain("downloading")
      expect(flat).not.toContain("downloadId")
      expect(flat).not.toContain("abc")
      expect(flat).not.toContain("SecretIndexer")
      expect(flat).not.toContain("indexer")
    })

    it("accepts a JSON-string input identically to an object input", () => {
      const rawObj = { version: "4.0.0", queueSize: 5, secretToken: "xyz" }
      const rawStr = JSON.stringify(rawObj)

      const fromObj = scrubForDiscord("get_radarr_status", rawObj)
      const fromStr = scrubForDiscord("get_radarr_status", rawStr)

      expect(fromStr).toEqual(fromObj)
      expect(fromStr).not.toContain("secretToken")
      expect(fromStr).not.toContain("xyz")
    })

    it("keeps deeply nested allowlisted leaves through wrapper objects", () => {
      const raw = {
        outer: { middle: { inner: { version: "9", totalRequests: 42, apiKey: "SECRET" } } },
      }

      const scrubbed = parse(scrubForDiscord("get_overseerr_status", raw)) as any
      const flat = JSON.stringify(scrubbed)

      expect(flat).toContain("version")
      expect(flat).toContain("totalRequests")
      expect(flat).toContain("42")
      expect(flat).not.toContain("apiKey")
      expect(flat).not.toContain("SECRET")
    })
  })

  describe("robustness (never throws on unexpected shapes)", () => {
    it("returns the redacted marker for malformed JSON string input", () => {
      const result = scrubForDiscord("get_sonarr_status", "{not valid json")
      expect(result).toContain(DISCORD_REDACTED_MARKER)
    })

    it("handles null / undefined / primitive input without throwing", () => {
      expect(() => scrubForDiscord("get_sonarr_status", null)).not.toThrow()
      expect(() => scrubForDiscord("get_sonarr_status", undefined)).not.toThrow()
      expect(() => scrubForDiscord("get_sonarr_status", 12345)).not.toThrow()
      expect(() => scrubForDiscord("get_sonarr_status", true)).not.toThrow()
    })

    it("returns an empty object projection when no allowlisted keys are present", () => {
      const raw = { totallyUnknown: "value", another: 1 }
      const scrubbed = parse(scrubForDiscord("get_sonarr_status", raw))
      expect(scrubbed).toEqual({})
    })

    it("passes through executor error strings (non-JSON) as the redacted marker", () => {
      const result = scrubForDiscord("get_sonarr_status", "Error: No active Sonarr server configured.")
      expect(result).toContain(DISCORD_REDACTED_MARKER)
      expect(result).not.toContain("Sonarr server configured")
    })
  })

  describe("fail-closed behavior", () => {
    afterEach(() => {
      mockGetRegisteredTool.mockClear()
      mockGetRegisteredTool.mockImplementation(
        jest.requireActual("@/actions/chatbot/tools").getRegisteredTool
      )
    })

    it("fails closed (redacted marker) when a discordSafe tool has NO discordFields", () => {
      mockGetRegisteredTool.mockReturnValue(
        fakeTool({
          discordSafe: true,
          discordFields: undefined,
          function: { name: "safe_but_undefined", description: "", parameters: { type: "object", properties: {} } },
        })
      )

      const result = scrubForDiscord("safe_but_undefined", { version: "1", secret: "leak" })
      expect(result).toContain(DISCORD_REDACTED_MARKER)
      expect(result).not.toContain("secret")
      expect(result).not.toContain("leak")
    })

    it("fails closed (redacted marker) when a discordSafe tool has an EMPTY discordFields array", () => {
      mockGetRegisteredTool.mockReturnValue(
        fakeTool({
          discordSafe: true,
          discordFields: [],
          function: { name: "safe_but_empty", description: "", parameters: { type: "object", properties: {} } },
        })
      )

      const result = scrubForDiscord("safe_but_empty", { version: "1", secret: "leak" })
      expect(result).toContain(DISCORD_REDACTED_MARKER)
      expect(result).not.toContain("leak")
    })

    it("fails closed (redacted marker) for an unknown tool name", () => {
      const result = scrubForDiscord("this_tool_does_not_exist", { version: "1", secret: "y" })
      expect(result).toContain(DISCORD_REDACTED_MARKER)
      expect(result).not.toContain("secret")
    })

    it("fails closed for a non-discordSafe tool even if a field would match", () => {
      // get_plex_library_sections is NOT discordSafe.
      const result = scrubForDiscord("get_plex_library_sections", { version: "1", title: "Movies" })
      expect(result).toContain(DISCORD_REDACTED_MARKER)
    })
  })
})
