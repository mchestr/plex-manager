/**
 * A member's "The title, poster or description is wrong": Refresh the
 * details starts when the service to check Plex's match against is set up.
 */

import { getActiveService } from "@/lib/data/active-service"
import { decideDetailsForMember } from "@/lib/problem-reports/report-details"

jest.mock("@/lib/data/active-service", () => ({ getActiveService: jest.fn() }))

const ROW = { id: "row-1", name: "Arr", url: "http://arr.local", apiKey: "key" }

beforeEach(() => jest.resetAllMocks())

describe("decideDetailsForMember", () => {
  it("starts the refresh for a movie with Radarr, and a show or an episode with Sonarr", async () => {
    jest.mocked(getActiveService).mockResolvedValue(ROW as never)

    await expect(decideDetailsForMember("movie")).resolves.toEqual({ startsFix: true })
    await expect(decideDetailsForMember("episode")).resolves.toEqual({ startsFix: true })
    expect(jest.mocked(getActiveService).mock.calls).toEqual([["radarr"], ["sonarr"]])
  })

  it("says which service is missing", async () => {
    jest.mocked(getActiveService).mockResolvedValue(null)

    await expect(decideDetailsForMember("movie")).resolves.toEqual({ startsFix: false, reason: "NO_RADARR" })
    await expect(decideDetailsForMember("show")).resolves.toEqual({ startsFix: false, reason: "NO_SONARR" })
  })
})
