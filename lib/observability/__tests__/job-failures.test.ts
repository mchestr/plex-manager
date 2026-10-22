/**
 * @jest-environment node
 */

import { readJobFailures, recordJobFailure } from "@/lib/observability/job-failures"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const flush = () => new Promise((resolve) => setImmediate(resolve))

describe("job failure counts (P11.4)", () => {
  it("adds one to <queue>:<job> in the shared hash, and swallows a Redis error", async () => {
    const hincrby = jest.fn().mockResolvedValueOnce(1).mockRejectedValueOnce(new Error("down"))
    const redis = { hincrby } as never

    recordJobFailure(redis, "rewind-gen", "rewind:generate:user")
    recordJobFailure(redis, "plex-wrapped", undefined)
    await flush()

    expect(hincrby.mock.calls).toEqual([
      ["pm:metrics:job_failures", "rewind-gen:rewind:generate:user", 1],
      ["pm:metrics:job_failures", "plex-wrapped:unknown", 1],
    ])
  })

  it("splits each field at its first colon and skips malformed ones", async () => {
    const hgetall = jest.fn().mockResolvedValue({ "rewind-gen:rewind:generate:user": "3", ":x": "1", "q:j": "NaN" })

    await expect(readJobFailures({ hgetall } as never)).resolves.toEqual([
      { queue: "rewind-gen", job: "rewind:generate:user", count: 3 },
    ])
  })
})
