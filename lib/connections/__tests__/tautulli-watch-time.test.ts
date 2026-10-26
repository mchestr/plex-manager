/**
 * @jest-environment node
 */

import { tautulliCommand } from "@/lib/connections/tautulli"
import { getAllTimeWatchHours, listTautulliUserIds } from "@/lib/connections/tautulli-watch-time"

jest.mock("@/lib/connections/tautulli", () => ({ tautulliCommand: jest.fn() }))

const config = { url: "http://tautulli.local:8181", apiKey: "k" }
const command = tautulliCommand as jest.Mock

beforeEach(() => command.mockReset())

describe("listTautulliUserIds", () => {
  it("returns every user_id", async () => {
    command.mockImplementation(async (_config, _cmd, _params, schema) => ({ ok: true, data: schema.parse([{ user_id: 1, username: "a" }, { user_id: 2 }]) }))
    await expect(listTautulliUserIds(config)).resolves.toEqual({ ok: true, data: [1, 2] })
    expect(command.mock.calls[0]![1]).toBe("get_users")
  })

  it("passes a failure on", async () => {
    command.mockResolvedValue({ ok: false, code: "TIMEOUT" })
    await expect(listTautulliUserIds(config)).resolves.toEqual({ ok: false, code: "TIMEOUT" })
  })
})

describe("getAllTimeWatchHours", () => {
  const answer = (rows: unknown) => command.mockImplementation(async (_config, _cmd, _params, schema) => ({ ok: true, data: schema.parse(rows) }))

  it("asks for all time and converts seconds to hours", async () => {
    answer([{ query_days: 0, total_time: 90_000, total_plays: 5 }])
    await expect(getAllTimeWatchHours(config, 7)).resolves.toEqual({ ok: true, data: 25 })
    expect(command).toHaveBeenCalledWith(config, "get_user_watch_time_stats", { user_id: 7, query_days: 0 }, expect.anything(), {})
  })

  it("takes the all-time row when Tautulli sends several", async () => {
    answer([{ query_days: 1, total_time: 3600 }, { query_days: "0", total_time: "7200" }])
    await expect(getAllTimeWatchHours(config, 7)).resolves.toEqual({ ok: true, data: 2 })
  })

  it("is zero hours for a member who never watched", async () => {
    answer([])
    await expect(getAllTimeWatchHours(config, 7)).resolves.toEqual({ ok: true, data: 0 })
  })

  it("passes a failure on", async () => {
    command.mockResolvedValue({ ok: false, code: "TAUTULLI_ERROR" })
    await expect(getAllTimeWatchHours(config, 7)).resolves.toEqual({ ok: false, code: "TAUTULLI_ERROR" })
  })
})
