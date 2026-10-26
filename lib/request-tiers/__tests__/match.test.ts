import { matchUsers, type OverseerrQuotaUser } from "../match"

const user = (id: number, plexId: number | null): OverseerrQuotaUser => ({
  id,
  plexId,
  name: `User ${id}`,
  movieQuotaLimit: null,
  movieQuotaDays: null,
  tvQuotaLimit: null,
  tvQuotaDays: null,
})

describe("matchUsers", () => {
  it("pairs Overseerr plexId with Tautulli user_id", () => {
    const result = matchUsers([user(1, 100), user(2, 200)], [100, 200, 300], new Set())
    expect(result.matched.map((match) => [match.overseerr.id, match.tautulliUserId])).toEqual([
      [1, 100],
      [2, 200],
    ])
  })

  it("skips users without a Plex id and counts them", () => {
    const result = matchUsers([user(1, null), user(2, 200)], [200], new Set())
    expect(result.matched).toHaveLength(1)
    expect(result.withoutPlexId).toBe(1)
  })

  it("counts Plex users Tautulli does not know", () => {
    const result = matchUsers([user(1, 100)], [200], new Set())
    expect(result.matched).toHaveLength(0)
    expect(result.withoutTautulli).toBe(1)
  })

  it("marks excluded members by Plex id", () => {
    const result = matchUsers([user(1, 100), user(2, 200)], [100, 200], new Set([200]))
    expect(result.matched.map((match) => match.excluded)).toEqual([false, true])
  })
})
