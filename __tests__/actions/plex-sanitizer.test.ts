import { sanitizePlexSessionsPayload } from "@/lib/chatbot/executors/plex-sanitizer"

describe("sanitizePlexSessionsPayload", () => {
  it("removes personal identifiers and keeps useful playback details", () => {
    const raw = {
      MediaContainer: {
        size: 2,
        Metadata: [
          {
            type: "movie",
            title: "How to Train Your Dragon",
            year: 2010,
            duration: 600000,
            viewOffset: 300000,
            librarySectionTitle: "Family Movies",
            User: {
              id: "123",
              title: "michael",
              username: "mikeflix",
            },
            Player: {
              product: "Plex for Android",
              platform: "Android",
              device: "Pixel",
              state: "playing",
            },
            Session: {
              id: "session-1",
              location: "lan",
              bandwidth: 4800,
              ipAddress: "192.168.1.226",
            },
            Media: [
              {
                videoResolution: "1080",
                videoCodec: "h264",
                audioCodec: "aac",
                bitrate: 8200,
              },
            ],
          },
          {
            type: "episode",
            grandparentTitle: "Murdoch Mysteries",
            parentTitle: "Season 2",
            title: "Shades of Grey",
            year: 2009,
            parentIndex: 2,
            index: 3,
            duration: 3600000,
            viewOffset: 1200000,
            librarySectionTitle: "TV Shows",
            Player: {
              product: "Plex Web",
              platform: "Chrome",
              device: "Windows",
              state: "buffering",
            },
            Session: {
              location: "wan",
              bandwidth: 3200,
              ipAddress: "38.30.147.163",
            },
          },
        ],
      },
    }

    const sanitized = sanitizePlexSessionsPayload(raw)

    expect(sanitized.totalSessions).toBe(2)
    expect(sanitized.sessions[0].viewerLabel).toBe("Viewer 1")
    expect(sanitized.sessions[0].mediaTitle).toBe("How to Train Your Dragon")
    expect(sanitized.sessions[0].location).toBe("local")
    expect(sanitized.sessions[0].progressPercent).toBe(50)
    expect(sanitized.sessions[0].notes).toEqual(
      expect.arrayContaining(["Resolution: 1080p", "Video codec: h264", "Audio codec: aac"])
    )
    expect(sanitized.sessions[1].seasonEpisode).toBe("S02E03")
    expect(sanitized.sessions[1].location).toBe("remote")

    const serialized = JSON.stringify(sanitized).toLowerCase()
    expect(serialized).not.toContain("michael")
    expect(serialized).not.toContain("mikeflix")
    expect(serialized).not.toContain("192.168.1.226")
    expect(serialized).not.toContain("38.30.147.163")
  })

  it("returns an empty collection when the payload is missing", () => {
    const sanitized = sanitizePlexSessionsPayload(undefined)
    expect(sanitized.totalSessions).toBe(0)
    expect(sanitized.sessions).toHaveLength(0)
    expect(sanitized.privacy).toBeDefined()
  })
})


