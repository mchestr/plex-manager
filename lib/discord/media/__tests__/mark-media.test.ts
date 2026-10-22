/**
 * Tests for applyMark. Plex is faked at `fetch` with a recorded plex.tv
 * `/api/v2/resources` response, so the scrobble's token is checked end to end
 * (SEC-48): it is the member's own server token, never the owner's.
 */
import { applyMark } from "../mark-media"
import { watchStatusNote } from "../mark-labels"
import { type PlexMediaItem } from "@/lib/connections/plex"
import { clearMemberTokenCache } from "@/lib/connections/plex-member-token"
import { type PlexServerConfig } from "@/lib/connections/plex-config"
import { prisma } from "@/lib/prisma"
import { MarkType, MediaType } from "@/lib/generated/prisma/client"
import { findRadarrIdByTitle, findSonarrIdByTitle } from "@/lib/utils/media-matching"
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'

jest.mock("@/lib/utils/media-matching")
jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}))

const RESOURCES = jest.requireActual<unknown[]>("./fixtures/plex-tv-resources.json")
const MEMBER_PLEX_SIGN_IN = "member-plex-tv-token"
const MEMBER_SERVER_TOKEN = "member-shared-token-for-this-server"
const mockFindRadarrIdByTitle = findRadarrIdByTitle as jest.MockedFunction<
  typeof findRadarrIdByTitle
>
const mockFindSonarrIdByTitle = findSonarrIdByTitle as jest.MockedFunction<
  typeof findSonarrIdByTitle
>
const mockUpsert = prisma.userMediaMark.upsert as jest.Mock

const plexConfig: PlexServerConfig = {
  name: "Test Server",
  url: "http://localhost:32400",
  token: "owner-token",
  publicUrl: undefined,
  adminPlexUserId: null,
  machineIdentifier: null,
}

function makeItem(overrides: Partial<PlexMediaItem> = {}): PlexMediaItem {
  return {
    ratingKey: "rk-1",
    title: "The Office",
    type: "show",
    year: 2005,
    ...overrides,
  }
}

interface FakePlex {
  resourcesStatus?: number
  scrobbleStatus?: number
  identityFails?: boolean
}

/** A minimal fetch response; jsdom has no `Response`. */
function reply(status: number, body: string) {
  return { ok: status >= 200 && status < 300, status, headers: new Map(), body: null, text: async () => body, json: async () => JSON.parse(body) }
}

/** Answers `/identity`, plex.tv resources and the scrobble; records every call. */
function fakePlex({ resourcesStatus = 200, scrobbleStatus = 200, identityFails = false }: FakePlex = {}) {
  const calls: { url: string; token: string | undefined }[] = []
  const fetchMock = jest.fn()
  global.fetch = fetchMock
  fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
    const url = String(input)
    const headers = (init?.headers ?? {}) as Record<string, string>
    calls.push({ url, token: headers["X-Plex-Token"] })
    if (url === `${plexConfig.url}/identity`) {
      return identityFails
        ? reply(503, "")
        : reply(200, '<MediaContainer size="0" machineIdentifier="this-server-machine-id"/>')
    }
    if (url.startsWith("https://clients.plex.tv/api/v2/resources")) {
      return reply(resourcesStatus, resourcesStatus === 200 ? JSON.stringify(RESOURCES) : "")
    }
    if (url.startsWith(`${plexConfig.url}/:/scrobble`)) {
      return reply(scrobbleStatus, "")
    }
    return reply(404, "")
  })
  return calls
}

const scrobbles = (calls: { url: string; token: string | undefined }[]) => calls.filter((call) => call.url.includes("/:/scrobble"))

afterAll(() => {
  delete process.env.PLEX_CLIENT_IDENTIFIER
})

beforeEach(() => {
  jest.clearAllMocks()
  clearMemberTokenCache()
  process.env.PLEX_CLIENT_IDENTIFIER = "test-client"
  mockUpsert.mockResolvedValue({})
  mockFindRadarrIdByTitle.mockResolvedValue(null)
  mockFindSonarrIdByTitle.mockResolvedValue(null)
  prismaMock.user.findUnique.mockResolvedValue({ plexAuthToken: MEMBER_PLEX_SIGN_IN } as never)
})

describe("applyMark", () => {
  it("upserts on the (userId, plexRatingKey, markType) composite key", async () => {
    const item = makeItem({ ratingKey: "movie-1", title: "Inception", type: "movie", year: 2010 })

    const result = await applyMark({
      userId: "user-1",
      item,
      markType: MarkType.KEEP_FOREVER,
      markedVia: "discord",
      plexConfig,
      channelId: "chan-1",
    })

    expect(result).toEqual({ ok: true, mediaType: MediaType.MOVIE, watched: "not_applicable" })
    expect(mockUpsert).toHaveBeenCalledWith({
      where: {
        userId_plexRatingKey_markType: {
          userId: "user-1",
          plexRatingKey: "movie-1",
          markType: MarkType.KEEP_FOREVER,
        },
      },
      create: expect.objectContaining({
        userId: "user-1",
        mediaType: MediaType.MOVIE,
        plexRatingKey: "movie-1",
        markType: MarkType.KEEP_FOREVER,
        title: "Inception",
        year: 2010,
        markedVia: "discord",
        discordChannelId: "chan-1",
      }),
      update: {
        markedAt: expect.any(Date),
        discordChannelId: "chan-1",
      },
    })
  })

  it("matches Radarr by title for movies (not Sonarr)", async () => {
    mockFindRadarrIdByTitle.mockResolvedValue({ id: 42, titleSlug: "inception" })
    const item = makeItem({ title: "Inception", type: "movie", year: 2010 })

    await applyMark({
      userId: "user-1",
      item,
      markType: MarkType.KEEP_FOREVER,
      markedVia: "discord",
      plexConfig,
    })

    expect(mockFindRadarrIdByTitle).toHaveBeenCalledWith("Inception", 2010)
    expect(mockFindSonarrIdByTitle).not.toHaveBeenCalled()
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          radarrId: 42,
          radarrTitleSlug: "inception",
          sonarrId: null,
          sonarrTitleSlug: null,
        }),
      })
    )
  })

  it("matches Sonarr by show title for series (not Radarr)", async () => {
    mockFindSonarrIdByTitle.mockResolvedValue({ id: 7, titleSlug: "the-office" })
    const item = makeItem({ title: "The Office", type: "show", year: 2005 })

    await applyMark({
      userId: "user-1",
      item,
      markType: MarkType.KEEP_FOREVER,
      markedVia: "discord",
      plexConfig,
    })

    expect(mockFindSonarrIdByTitle).toHaveBeenCalledWith("The Office", 2005)
    expect(mockFindRadarrIdByTitle).not.toHaveBeenCalled()
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          sonarrId: 7,
          sonarrTitleSlug: "the-office",
          radarrId: null,
          radarrTitleSlug: null,
        }),
      })
    )
  })

  it("matches episodes against the grandparent (show) title via Sonarr", async () => {
    mockFindSonarrIdByTitle.mockResolvedValue({ id: 7, titleSlug: "the-office" })
    const item = makeItem({
      ratingKey: "ep-1",
      title: "Pilot",
      type: "episode",
      grandparentTitle: "The Office",
      parentTitle: "Season 1",
      parentIndex: 1,
      index: 1,
      year: 2005,
    })

    await applyMark({
      userId: "user-1",
      item,
      markType: MarkType.NOT_INTERESTED,
      markedVia: "discord",
      plexConfig,
    })

    expect(mockFindSonarrIdByTitle).toHaveBeenCalledWith("The Office", 2005)
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          mediaType: MediaType.EPISODE,
          seasonNumber: 1,
          episodeNumber: 1,
          parentTitle: "Season 1",
        }),
      })
    )
  })

  it("scrobbles FINISHED_WATCHING with the member's resource token, never the owner's", async () => {
    const calls = fakePlex()
    const item = makeItem({ ratingKey: "movie-1", type: "movie" })

    const result = await applyMark({
      userId: "user-1",
      item,
      markType: MarkType.FINISHED_WATCHING,
      markedVia: "discord",
      plexConfig,
    })

    expect(result).toEqual({ ok: true, mediaType: MediaType.MOVIE, watched: "synced" })
    const resources = calls.find((call) => call.url.startsWith("https://clients.plex.tv/api/v2/resources"))
    expect(resources?.token).toBe(MEMBER_PLEX_SIGN_IN)
    expect(scrobbles(calls)).toHaveLength(1)
    expect(scrobbles(calls)[0].url).toContain("key=movie-1")
    expect(scrobbles(calls)[0].token).toBe(MEMBER_SERVER_TOKEN)
    expect(scrobbles(calls).some((call) => call.token === plexConfig.token)).toBe(false)
  })

  it("reuses the resolved member token for 10 minutes", async () => {
    const calls = fakePlex()
    const mark = () =>
      applyMark({ userId: "user-1", item: makeItem({ type: "movie" }), markType: MarkType.FINISHED_WATCHING, markedVia: "discord", plexConfig })

    await mark()
    await mark()

    expect(calls.filter((call) => call.url.includes("/api/v2/resources"))).toHaveLength(1)
    expect(scrobbles(calls)).toHaveLength(2)
  })

  it("without a stored Plex sign-in, saves the mark and skips the scrobble", async () => {
    const calls = fakePlex()
    prismaMock.user.findUnique.mockResolvedValue({ plexAuthToken: null } as never)

    const result = await applyMark({
      userId: "user-1",
      item: makeItem({ type: "movie" }),
      markType: MarkType.FINISHED_WATCHING,
      markedVia: "discord",
      plexConfig,
    })

    expect(mockUpsert).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ ok: true, mediaType: MediaType.MOVIE, watched: "no_plex_sign_in" })
    expect(calls).toHaveLength(0)
    expect(watchStatusNote("no_plex_sign_in")).toMatch(
      /^Saved\. I can't update your Plex watch status, because Plex Manager doesn't have your Plex sign-in\. Sign in with Plex at \S+, then try again\.$/
    )
  })

  it("when plex.tv rejects the sign-in, saves the mark and skips the scrobble", async () => {
    const calls = fakePlex({ resourcesStatus: 401 })

    const result = await applyMark({
      userId: "user-1",
      item: makeItem({ type: "movie" }),
      markType: MarkType.FINISHED_WATCHING,
      markedVia: "discord",
      plexConfig,
    })

    expect(result).toMatchObject({ ok: true, watched: "no_plex_sign_in" })
    expect(scrobbles(calls)).toHaveLength(0)
  })

  it("when the member's resources lack this server, skips the scrobble", async () => {
    const calls = fakePlex()
    const fetchMock = jest.fn()
    global.fetch = fetchMock
    fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, token: ((init?.headers ?? {}) as Record<string, string>)["X-Plex-Token"] })
      if (url.endsWith("/identity")) {
        return reply(200, '<MediaContainer machineIdentifier="some-other-server"/>')
      }
      return reply(200, JSON.stringify(RESOURCES))
    })

    const result = await applyMark({
      userId: "user-1",
      item: makeItem({ type: "movie" }),
      markType: MarkType.FINISHED_WATCHING,
      markedVia: "discord",
      plexConfig,
    })

    expect(result).toMatchObject({ ok: true, watched: "no_plex_sign_in" })
    expect(scrobbles(calls)).toHaveLength(0)
  })

  it("when the server cannot be reached for its identity, reports a failed update", async () => {
    const calls = fakePlex({ identityFails: true })

    const result = await applyMark({
      userId: "user-1",
      item: makeItem({ type: "movie" }),
      markType: MarkType.FINISHED_WATCHING,
      markedVia: "discord",
      plexConfig,
    })

    expect(result).toMatchObject({ ok: true, watched: "failed" })
    expect(scrobbles(calls)).toHaveLength(0)
  })

  it("does not sync Plex watched state for non-FINISHED_WATCHING marks", async () => {
    const item = makeItem({ ratingKey: "movie-1", type: "movie" })

    await applyMark({
      userId: "user-1",
      item,
      markType: MarkType.KEEP_FOREVER,
      markedVia: "discord",
      plexConfig,
    })

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("tolerates a Plex sync failure: mark still succeeds, watched is failed", async () => {
    fakePlex({ scrobbleStatus: 500 })
    const item = makeItem({ ratingKey: "movie-1", type: "movie" })

    const result = await applyMark({
      userId: "user-1",
      item,
      markType: MarkType.FINISHED_WATCHING,
      markedVia: "discord",
      plexConfig,
    })

    expect(mockUpsert).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ ok: true, mediaType: MediaType.MOVIE, watched: "failed" })
  })

  it("returns an unsupported result (no writes) for an unknown media type", async () => {
    const item = makeItem({ type: "track" })

    const result = await applyMark({
      userId: "user-1",
      item,
      markType: MarkType.FINISHED_WATCHING,
      markedVia: "discord",
      plexConfig,
    })

    expect(result).toEqual({
      ok: false,
      reason: "unsupported_media_type",
      mediaType: "track",
    })
    expect(mockUpsert).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
