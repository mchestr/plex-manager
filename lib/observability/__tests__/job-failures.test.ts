/**
 * @jest-environment node
 */

import { onJobFailed, readJobFailures, recordJobFailure } from "@/lib/observability/job-failures"

const mockError = jest.fn()
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: (...args: unknown[]) => mockError(...args) }),
}))

beforeEach(() => mockError.mockClear())

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

  it("logs queue.job_exhausted only on a job's last attempt (P11.3)", async () => {
    const redis = { hincrby: jest.fn().mockResolvedValue(1) } as never
    const job = (attemptsMade: number) => ({ id: "j1", name: "stripe:webhook", attemptsMade, opts: { attempts: 3 } })
    const unrecoverable = Object.assign(new Error("rejected"), { name: "UnrecoverableError" })

    onJobFailed(redis, "plex-wrapped", job(1), new Error("retry me"))
    expect(mockError).not.toHaveBeenCalled()

    onJobFailed(redis, "plex-wrapped", job(3), new Error("gave up"))
    onJobFailed(redis, "plex-wrapped", job(1), unrecoverable)
    onJobFailed(redis, "plex-wrapped", undefined, new Error("no job"))
    await flush()

    expect(mockError).toHaveBeenCalledTimes(2)
    expect(mockError).toHaveBeenCalledWith("queue.job_exhausted", expect.any(Error), {
      queue: "plex-wrapped",
      jobId: "j1",
      jobType: "stripe:webhook",
      attempts: 3,
    })
    expect((redis as unknown as { hincrby: jest.Mock }).hincrby).toHaveBeenCalledTimes(4)
  })

  it("splits each field at its first colon and skips malformed ones", async () => {
    const hgetall = jest.fn().mockResolvedValue({ "rewind-gen:rewind:generate:user": "3", ":x": "1", "q:j": "NaN" })

    await expect(readJobFailures({ hgetall } as never)).resolves.toEqual([
      { queue: "rewind-gen", job: "rewind:generate:user", count: 3 },
    ])
  })
})
