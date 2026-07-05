import { applyMark } from "../mark-media"
import { markPlexItemWatched, type PlexMediaItem } from "@/lib/connections/plex"
import { type PlexServerConfig } from "@/lib/connections/plex-config"
import { prisma } from "@/lib/prisma"
import { MarkType, MediaType } from "@/lib/generated/prisma/client"
import { findRadarrIdByTitle, findSonarrIdByTitle } from "@/lib/utils/media-matching"

jest.mock("@/lib/connections/plex")
jest.mock("@/lib/utils/media-matching")
jest.mock("@/lib/prisma", () => ({
  prisma: {
    userMediaMark: {
      upsert: jest.fn(),
    },
  },
}))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  }),
}))

const mockMarkPlexItemWatched = markPlexItemWatched as jest.MockedFunction<
  typeof markPlexItemWatched
>
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
  token: "test-token",
  publicUrl: undefined,
  adminPlexUserId: null,
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

beforeEach(() => {
  jest.clearAllMocks()
  mockUpsert.mockResolvedValue({})
  mockFindRadarrIdByTitle.mockResolvedValue(null)
  mockFindSonarrIdByTitle.mockResolvedValue(null)
  mockMarkPlexItemWatched.mockResolvedValue({ success: true })
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

    expect(result).toEqual({ ok: true, mediaType: MediaType.MOVIE, watchedSynced: false })
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

  it("syncs Plex watched state only for FINISHED_WATCHING", async () => {
    const item = makeItem({ ratingKey: "movie-1", type: "movie" })

    const result = await applyMark({
      userId: "user-1",
      item,
      markType: MarkType.FINISHED_WATCHING,
      markedVia: "discord",
      plexConfig,
    })

    expect(mockMarkPlexItemWatched).toHaveBeenCalledWith(plexConfig, "movie-1")
    expect(result).toEqual({ ok: true, mediaType: MediaType.MOVIE, watchedSynced: true })
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

    expect(mockMarkPlexItemWatched).not.toHaveBeenCalled()
  })

  it("tolerates a Plex sync failure: mark still succeeds, watchedSynced is false", async () => {
    mockMarkPlexItemWatched.mockResolvedValue({ success: false, error: "Plex API error" })
    const item = makeItem({ ratingKey: "movie-1", type: "movie" })

    const result = await applyMark({
      userId: "user-1",
      item,
      markType: MarkType.FINISHED_WATCHING,
      markedVia: "discord",
      plexConfig,
    })

    expect(mockUpsert).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ ok: true, mediaType: MediaType.MOVIE, watchedSynced: false })
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
    expect(mockMarkPlexItemWatched).not.toHaveBeenCalled()
  })
})
