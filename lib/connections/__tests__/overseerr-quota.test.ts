/**
 * @jest-environment node
 */

/**
 * The Overseerr quota reads and writes of the request-tier sync: every user
 * paged 100 at a time with their current quota, one user's write, and one
 * user's usage in the current period.
 */

import { getOverseerrQuotaMember, getOverseerrUserUsage, listOverseerrQuotaUsers, setOverseerrUserQuota } from "@/lib/connections/overseerr-quota"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const config = { url: "http://overseerr.local:5055/", apiKey: "overseerr-key" }
const mockFetch = jest.fn()
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

beforeEach(() => {
  mockFetch.mockReset()
  global.fetch = mockFetch as unknown as typeof fetch
})

describe("listOverseerrQuotaUsers", () => {
  it("pages through every user, not only the first 100", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      const skip = Number(new URL(url).searchParams.get("skip"))
      return skip === 0
        ? json({ pageInfo: { page: 1, pages: 2 }, results: [{ id: 1, plexId: 11, displayName: "Sam", movieQuotaLimit: 4, movieQuotaDays: 7, tvQuotaLimit: 2, tvQuotaDays: 7 }] })
        : json({ pageInfo: { page: 2, pages: 2 }, results: [{ id: 2, plexId: null, username: "local" }] })
    })

    const result = await listOverseerrQuotaUsers(config)

    expect(result).toEqual({
      ok: true,
      data: [
        { id: 1, plexId: 11, name: "Sam", movieQuotaLimit: 4, movieQuotaDays: 7, tvQuotaLimit: 2, tvQuotaDays: 7 },
        { id: 2, plexId: null, name: "local", movieQuotaLimit: null, movieQuotaDays: null, tvQuotaLimit: null, tvQuotaDays: null },
      ],
    })
    expect(mockFetch.mock.calls.map(([url]) => new URL(String(url)).searchParams.get("skip"))).toEqual(["0", "100"])
    expect(new URL(String(mockFetch.mock.calls[0]![0])).searchParams.get("take")).toBe("100")
  })

  it("fails instead of returning a partial list", async () => {
    mockFetch.mockResolvedValueOnce(json({ pageInfo: { page: 1, pages: 2 }, results: [{ id: 1 }] })).mockResolvedValueOnce(json({}, 500))
    expect(await listOverseerrQuotaUsers(config)).toMatchObject({ ok: false })
  })

  it("names a user with no display name", async () => {
    mockFetch.mockResolvedValue(json({ pageInfo: { page: 1, pages: 1 }, results: [{ id: 9, plexId: 5 }] }))
    const result = await listOverseerrQuotaUsers(config)
    expect(result.ok && result.data[0]!.name).toBe("User 9")
  })
})

describe("getOverseerrQuotaMember", () => {
  const user = { id: 7, plexId: 11, displayName: "Sam", permissions: 32, movieQuotaLimit: 4, movieQuotaDays: 7, tvQuotaLimit: null, tvQuotaDays: null }

  it("reads one user's quota", async () => {
    mockFetch.mockResolvedValue(json(user))

    const result = await getOverseerrQuotaMember(config, 7)

    expect(result).toEqual({
      ok: true,
      data: { id: 7, plexId: 11, name: "Sam", movieQuotaLimit: 4, movieQuotaDays: 7, tvQuotaLimit: null, tvQuotaDays: null, bypassesQuota: false },
    })
    expect(String(mockFetch.mock.calls[0]![0])).toBe("http://overseerr.local:5055/api/v1/user/7")
  })

  it.each([
    ["an admin", { permissions: 2 | 32 }],
    ["a user manager", { permissions: 8 }],
    ["the owner", { id: 1, permissions: 0 }],
  ])("flags %s, whose quota Overseerr ignores", async (_name, overrides) => {
    mockFetch.mockResolvedValue(json({ ...user, ...overrides }))
    const result = await getOverseerrQuotaMember(config, 7)
    expect(result.ok && result.data.bypassesQuota).toBe(true)
  })

  it("reports a user Overseerr does not have", async () => {
    mockFetch.mockResolvedValue(json({ message: "User not found." }, 404))
    expect(await getOverseerrQuotaMember(config, 7)).toMatchObject({ ok: false, code: "HTTP", status: 404 })
  })
})

describe("setOverseerrUserQuota", () => {
  it("posts the four quota fields to the user's main settings", async () => {
    mockFetch.mockResolvedValue(json({}))
    const quota = { movieQuotaLimit: 6, movieQuotaDays: 7, tvQuotaLimit: 3, tvQuotaDays: 7 }

    const result = await setOverseerrUserQuota(config, 42, quota)

    expect(result.ok).toBe(true)
    const [url, init] = mockFetch.mock.calls[0]!
    expect(String(url)).toBe("http://overseerr.local:5055/api/v1/user/42/settings/main")
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body)).toEqual(quota)
    expect(init.headers["X-Api-Key"]).toBe("overseerr-key")
  })

  it("reports a failed write", async () => {
    mockFetch.mockResolvedValue(json({}, 500))
    expect(await setOverseerrUserQuota(config, 1, { movieQuotaLimit: 1, movieQuotaDays: 7, tvQuotaLimit: 1, tvQuotaDays: 7 })).toMatchObject({ ok: false })
  })
})

describe("getOverseerrUserUsage", () => {
  it("reads the requests used and left", async () => {
    mockFetch.mockResolvedValue(
      json({
        movie: { days: 7, limit: 4, used: 1, remaining: 3, restricted: false },
        tv: { days: 7, limit: 0, used: 5, restricted: false },
      })
    )

    const result = await getOverseerrUserUsage(config, 42)

    expect(String(mockFetch.mock.calls[0]![0])).toBe("http://overseerr.local:5055/api/v1/user/42/quota")
    expect(result).toEqual({
      ok: true,
      data: { movie: { limit: 4, days: 7, used: 1, remaining: 3 }, tv: { limit: 0, days: 7, used: 5, remaining: null } },
    })
  })

  it("derives what is left when Overseerr leaves it out", async () => {
    mockFetch.mockResolvedValue(json({ movie: { days: 7, limit: 2, used: 5 }, tv: null }))
    const result = await getOverseerrUserUsage(config, 42)
    expect(result.ok && result.data.movie.remaining).toBe(0)
    expect(result.ok && result.data.tv).toEqual({ limit: 0, days: 0, used: 0, remaining: null })
  })
})
