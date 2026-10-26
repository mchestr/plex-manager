import { quotaCopy, quotaForTier, sameQuota, type Quota } from "../quota"

const quota = (movie: number | null, movieDays: number | null, tv: number | null, tvDays: number | null): Quota => ({
  movieQuotaLimit: movie,
  movieQuotaDays: movieDays,
  tvQuotaLimit: tv,
  tvQuotaDays: tvDays,
})

describe("quotaForTier", () => {
  it("sets both periods from the tier", () => {
    expect(quotaForTier({ overHours: 24, movieLimit: 4, tvLimit: 2, days: 7 })).toEqual(quota(4, 7, 2, 7))
  })
})

describe("sameQuota", () => {
  it("is true for equal quotas", () => {
    expect(sameQuota(quota(4, 7, 2, 7), quota(4, 7, 2, 7))).toBe(true)
  })

  it("is false when a limit or a period differs", () => {
    expect(sameQuota(quota(4, 7, 2, 7), quota(6, 7, 2, 7))).toBe(false)
    expect(sameQuota(quota(4, 7, 2, 7), quota(4, 14, 2, 7))).toBe(false)
  })

  it("treats 0 and none as the same unlimited, whatever the period", () => {
    expect(sameQuota(quota(0, 7, 0, 7), quota(null, null, null, null))).toBe(true)
    expect(sameQuota(quota(0, 7, 2, 7), quota(null, 30, 2, 7))).toBe(true)
  })

  it("tells unlimited from limited", () => {
    expect(sameQuota(quota(0, 7, 2, 7), quota(1, 7, 2, 7))).toBe(false)
  })
})

describe("quotaCopy", () => {
  it("reads like the Windmill summary", () => {
    expect(quotaCopy(quota(4, 7, 2, 7))).toBe("4 movies/week, 2 TV/week")
    expect(quotaCopy(quota(0, 7, 0, 7))).toBe("unlimited movies, unlimited TV")
    expect(quotaCopy(quota(3, 30, 1, 14))).toBe("3 movies/30d, 1 TV/14d")
  })
})
