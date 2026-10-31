/**
 * @jest-environment node
 */

import type { z } from "zod"

import { tautulliCommand } from "@/lib/connections/tautulli"
import { listTautulliLastSeen, MAX_PAGES, PAGE_LENGTH } from "@/lib/connections/tautulli-last-seen"

jest.mock("@/lib/connections/tautulli", () => ({ tautulliCommand: jest.fn() }))

const config = { url: "http://tautulli.local:8181", apiKey: "k" }
const command = jest.mocked(tautulliCommand)

/** A `get_users_table` row with the personal fields Tautulli sends. */
const row = (userId: unknown, lastSeen: unknown, extra: Record<string, unknown> = {}) => ({
  user_id: userId,
  last_seen: lastSeen,
  keep_history: 1,
  is_active: 1,
  friendly_name: "Jane Doe",
  email: "jane@example.com",
  ip_address: "203.0.113.7",
  ...extra,
})

/** Answers each call with the next page, parsed by the caller's schema as `tautulliCommand` does. */
function pages(...answers: { rows: unknown[]; total?: number }[]) {
  for (const answer of answers) {
    command.mockImplementationOnce(async (_config, _cmd, _params, schema) => ({
      ok: true,
      data: (schema as z.ZodType).parse({ recordsFiltered: answer.total ?? answer.rows.length, recordsTotal: 99, draw: 1, data: answer.rows }),
    }))
  }
}

beforeEach(() => command.mockReset())

describe("listTautulliLastSeen", () => {
  it("asks for big pages in a stable order, with a long timeout and one retry", async () => {
    pages({ rows: [row(1, 1_700_000_000)] })
    const signal = new AbortController().signal

    await listTautulliLastSeen(config, { signal })

    expect(command).toHaveBeenCalledWith(
      config,
      "get_users_table",
      { start: 0, length: PAGE_LENGTH, order_column: "friendly_name", order_dir: "asc" },
      expect.anything(),
      { signal, timeoutMs: 60_000, attempts: 2 }
    )
  })

  it("keeps only the id, the newest play and whether history is kept", async () => {
    pages({ rows: [row(7, 1_700_000_000), row(8, null, { keep_history: 0 })] })

    const result = await listTautulliLastSeen(config)

    expect(result).toEqual({
      ok: true,
      data: {
        rows: [
          { userId: 7, lastSeen: new Date(1_700_000_000_000), keepHistory: true },
          { userId: 8, lastSeen: null, keepHistory: false },
        ],
        dropped: 0,
      },
    })
    expect(JSON.stringify(result)).not.toMatch(/Jane|example\.com|203\.0/)
  })

  it.each<[string, unknown, Date | null]>([
    ["epoch seconds", 1_700_000_000, new Date(1_700_000_000_000)],
    ["a numeric string", "1700000000", new Date(1_700_000_000_000)],
    ["null", null, null],
    ["an empty string", "", null],
    ["a missing value", undefined, null],
    ["zero", 0, null],
    ["a negative number", -5, null],
    ["a number too big for a date", 9e15, null],
    ["a numeric string too big for a number", "9".repeat(400), null],
  ])("reads last_seen given as %s", async (_name, lastSeen, expected) => {
    pages({ rows: [row(1, lastSeen)] })
    const result = await listTautulliLastSeen(config)
    expect(result.ok && result.data.rows[0]!.lastSeen).toEqual(expected)
  })

  it.each<[unknown, boolean]>([
    [0, false],
    ["0", false],
    [false, false],
    [1, true],
    ["1", true],
    [true, true],
    [null, true],
    [undefined, true],
  ])("reads keep_history %p as %p", async (keepHistory, expected) => {
    pages({ rows: [row(1, 1, { keep_history: keepHistory })] })
    const result = await listTautulliLastSeen(config)
    expect(result.ok && result.data.rows[0]!.keepHistory).toBe(expected)
  })

  it("reads a numeric string user id, and drops and counts rows that do not parse", async () => {
    pages({
      rows: [
        row("12", 5),
        row("abc", 5),
        row(-1, 5),
        row(1.5, 5),
        row(3, "yesterday"),
        row(4, 5, { keep_history: { on: true } }),
        "not a row",
        { last_seen: 5 },
      ],
    })

    const result = await listTautulliLastSeen(config)

    expect(result).toEqual({ ok: true, data: { rows: [{ userId: 12, lastSeen: new Date(5000), keepHistory: true }], dropped: 7 } })
  })

  it("reads every page until a short one", async () => {
    const full = Array.from({ length: PAGE_LENGTH }, (_, index) => row(index + 1, 100))
    pages({ rows: full, total: PAGE_LENGTH + 2 }, { rows: [row(9001, 100), row(9002, 100)], total: PAGE_LENGTH + 2 })

    const result = await listTautulliLastSeen(config)

    expect(command).toHaveBeenCalledTimes(2)
    expect(command.mock.calls[1]![2]).toMatchObject({ start: PAGE_LENGTH, length: PAGE_LENGTH })
    expect(result.ok && result.data.rows).toHaveLength(PAGE_LENGTH + 2)
  })

  it("stops when the pages reach recordsFiltered, without asking for an empty page", async () => {
    pages({ rows: Array.from({ length: PAGE_LENGTH }, (_, index) => row(index + 1, 100)), total: PAGE_LENGTH })

    await listTautulliLastSeen(config)

    expect(command).toHaveBeenCalledTimes(1)
  })

  it("stops at the page limit with what it read", async () => {
    command.mockImplementation(async (_config, _cmd, params, schema) => ({
      ok: true,
      data: (schema as z.ZodType).parse({
        recordsFiltered: 1_000_000,
        data: Array.from({ length: PAGE_LENGTH }, (_, index) => row(Number(params.start) + index + 1, 100)),
      }),
    }))

    const result = await listTautulliLastSeen(config)

    expect(command).toHaveBeenCalledTimes(MAX_PAGES)
    expect(result.ok && result.data.rows).toHaveLength(MAX_PAGES * PAGE_LENGTH)
  })

  it("merges a user seen on two pages: the newer play, and history kept only if both rows keep it", async () => {
    const full = Array.from({ length: PAGE_LENGTH - 1 }, (_, index) => row(index + 100, 100))
    pages(
      { rows: [row(1, 500), ...full], total: PAGE_LENGTH + 2 },
      { rows: [row(1, 900, { keep_history: 0 }), row(2, null)], total: PAGE_LENGTH + 2 }
    )

    const result = await listTautulliLastSeen(config)
    const rows = result.ok ? result.data.rows : []

    expect(rows.filter((user) => user.userId === 1)).toEqual([{ userId: 1, lastSeen: new Date(900_000), keepHistory: false }])
    expect(rows).toHaveLength(PAGE_LENGTH + 1)
  })

  it("keeps the newer play when the second row has none or an older one", async () => {
    const full = Array.from({ length: PAGE_LENGTH - 2 }, (_, index) => row(index + 100, 100))
    pages({ rows: [row(1, 500), row(2, 500), ...full], total: PAGE_LENGTH + 2 }, { rows: [row(1, null), row(2, 400)], total: PAGE_LENGTH + 2 })

    const result = await listTautulliLastSeen(config)
    const rows = result.ok ? result.data.rows : []

    expect(rows.find((user) => user.userId === 1)?.lastSeen).toEqual(new Date(500_000))
    expect(rows.find((user) => user.userId === 2)?.lastSeen).toEqual(new Date(500_000))
  })

  it("fails the whole read when any page fails", async () => {
    pages({ rows: Array.from({ length: PAGE_LENGTH }, (_, index) => row(index + 1, 100)), total: 2000 })
    command.mockResolvedValueOnce({ ok: false, code: "TIMEOUT" })

    await expect(listTautulliLastSeen(config)).resolves.toEqual({ ok: false, code: "TIMEOUT" })
  })

  it("fails on a page without the DataTables shape", async () => {
    command.mockImplementationOnce(async (_config, _cmd, _params, schema) => {
      const parsed = (schema as z.ZodType).safeParse([{ user_id: 1 }])
      return parsed.success ? { ok: true, data: parsed.data } : { ok: false, code: "INVALID_RESPONSE" }
    })

    await expect(listTautulliLastSeen(config)).resolves.toEqual({ ok: false, code: "INVALID_RESPONSE" })
  })
})
