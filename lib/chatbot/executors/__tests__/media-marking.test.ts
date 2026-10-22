/**
 * The chatbot's `mark_media_finished` tool marks the item watched as the
 * member (SEC-48): the scrobble carries the member's own server token from
 * plex.tv resources, and without a Plex sign-in the mark is saved, nothing is
 * scrobbled, and the reply says why instead of claiming Plex was updated.
 */

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { executeMediaMarkingTool } from "@/lib/chatbot/executors/media-marking"
import { getActivePlexServerConfig } from "@/lib/connections/plex-config"
import { clearMemberTokenCache } from "@/lib/connections/plex-member-token"
import { searchPlexMedia } from "@/lib/connections/plex-search"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/connections/plex-search", () => ({ searchPlexMedia: jest.fn() }))
jest.mock("@/lib/connections/plex-config", () => ({ getActivePlexServerConfig: jest.fn() }))
jest.mock("@/lib/utils/media-matching", () => ({
  findRadarrIdByTitle: jest.fn().mockResolvedValue(null),
  findSonarrIdByTitle: jest.fn().mockResolvedValue(null),
}))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}))

const RESOURCES = jest.requireActual<unknown[]>("@/lib/discord/media/__tests__/fixtures/plex-tv-resources.json")
const SERVER = { name: "Home", url: "http://plex.local:32400", token: "owner-token", adminPlexUserId: "1" }

const calls: { url: string; token: string | undefined }[] = []

function reply(status: number, body: string) {
  return { ok: status < 300, status, headers: new Map(), body: null, text: async () => body, json: async () => JSON.parse(body) }
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  clearMemberTokenCache()
  calls.length = 0
  process.env.PLEX_CLIENT_IDENTIFIER = "test-client"
  jest.mocked(getActivePlexServerConfig).mockResolvedValue(SERVER)
  jest.mocked(searchPlexMedia).mockResolvedValue({
    success: true,
    data: [{ ratingKey: "rk-9", title: "Arrival", type: "movie", year: 2016 }],
  })
  prismaMock.userMediaMark.upsert.mockResolvedValue({} as never)
  const fetchMock = jest.fn()
  global.fetch = fetchMock
  fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, token: ((init?.headers ?? {}) as Record<string, string>)["X-Plex-Token"] })
    if (url.endsWith("/identity")) return reply(200, '<MediaContainer machineIdentifier="this-server-machine-id"/>')
    if (url.includes("/api/v2/resources")) return reply(200, JSON.stringify(RESOURCES))
    return reply(200, "")
  })
})

afterAll(() => {
  delete process.env.PLEX_CLIENT_IDENTIFIER
})

const scrobbles = () => calls.filter((call) => call.url.includes("/:/scrobble"))

describe("mark_media_finished", () => {
  it("scrobbles with the member's resource token and says Plex was updated", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ plexAuthToken: "member-sign-in" } as never)

    const text = await executeMediaMarkingTool("mark_media_finished", { title: "Arrival" }, "user-1", "chatbot")

    expect(scrobbles()).toHaveLength(1)
    expect(scrobbles()[0].token).toBe("member-shared-token-for-this-server")
    expect(scrobbles()[0].token).not.toBe(SERVER.token)
    expect(text).toBe('Marked "Arrival (2016)" as finished watching. Your Plex watch status is updated.')
  })

  it("without a Plex sign-in, saves the mark, skips the scrobble and explains why", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ plexAuthToken: null } as never)

    const text = await executeMediaMarkingTool("mark_media_finished", { title: "Arrival" }, "user-1", "chatbot")

    expect(prismaMock.userMediaMark.upsert).toHaveBeenCalledTimes(1)
    expect(scrobbles()).toHaveLength(0)
    expect(text).toContain("Saved. I can't update your Plex watch status")
    expect(text).not.toMatch(/updated Plex watch status|Your Plex watch status is updated/)
  })
})
