/**
 * Refresh the details: gated and recorded, then Plex reads the details
 * again, and the report goes back to the admin to check them.
 */

import { getActivePlexServerConfig } from "@/lib/connections/plex-config"
import { refreshPlexItem } from "@/lib/connections/plex-library-actions"
import { gateAndRecord } from "@/lib/problem-reports/ledger"
import { runRefresh } from "@/lib/problem-reports/steps/refresh"

jest.mock("@/lib/connections/plex-config", () => ({ getActivePlexServerConfig: jest.fn() }))
jest.mock("@/lib/connections/plex-library-actions", () => ({ refreshPlexItem: jest.fn() }))
jest.mock("@/lib/problem-reports/ledger", () => ({ gateAndRecord: jest.fn() }))

const NOW = new Date("2026-11-09T20:00:00Z")
const SERVER = { name: "Home", url: "http://plex.local:32400", token: "owner-token", adminPlexUserId: "owner", machineIdentifier: "m" }
const REPORT = { id: "report-1", runToken: 1, action: "REFRESH" as const, reporterId: "member-1", plexRatingKey: "555" }
const DATA = { reportId: "report-1", runToken: 1, step: "start" as const, trigger: "web" as const, actorUserId: "admin-1" }

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getActivePlexServerConfig).mockResolvedValue(SERVER)
  jest.mocked(gateAndRecord).mockResolvedValue(null)
  jest.mocked(refreshPlexItem).mockResolvedValue(true)
})

describe("runRefresh", () => {
  it("records the run, asks Plex to refresh the item, and hands it back to check", async () => {
    await expect(runRefresh(REPORT, DATA, NOW)).resolves.toEqual({ toAdmin: "REFRESHED" })
    expect(gateAndRecord).toHaveBeenCalledWith(expect.objectContaining({ target: "plex:555", action: "REFRESH", actorUserId: "admin-1", trigger: "web" }), NOW)
    expect(refreshPlexItem).toHaveBeenCalledWith(SERVER, "555")
  })

  it("says when Plex refused, and doesn't refresh twice", async () => {
    jest.mocked(refreshPlexItem).mockResolvedValue(false)
    await expect(runRefresh(REPORT, DATA, NOW)).resolves.toEqual({ toAdmin: "REFRESH_FAILED" })

    jest.mocked(refreshPlexItem).mockClear()
    jest.mocked(gateAndRecord).mockResolvedValue("ALREADY_RAN")
    await expect(runRefresh(REPORT, DATA, NOW)).resolves.toEqual({ toAdmin: "REFRESHED" })
    expect(refreshPlexItem).not.toHaveBeenCalled()
  })

  it("needs a Plex server", async () => {
    jest.mocked(getActivePlexServerConfig).mockResolvedValue(null)
    await expect(runRefresh(REPORT, DATA, NOW)).resolves.toEqual({ toAdmin: "UNAVAILABLE" })
  })
})
