/**
 * @jest-environment node
 */

/**
 * Stuck reviews (spec §4): a `running` review is dead 10 minutes after it
 * started; a `queued` one only when its BullMQ job is missing or failed and
 * the row is over 2 minutes old. Job states are read before the transaction
 * and passed in, so the reap makes no Redis call. `markReviewFailed` fences a
 * run's failure on its token, and the crash fallback keeps a stored code.
 */

import type { JobState } from "bullmq"
import { mockReset } from "jest-mock-extended"

import { asAppTransactionClient, prismaMock } from "@/__tests__/helpers/prisma-mock"
import { useReviewTable } from "@/__tests__/helpers/review-table"

import { reviewJobId } from "../job-state"
import { markReviewFailed, readQueuedJobStates, reapStaleReviews } from "../stale"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)

const NOW = new Date("2026-11-19T22:00:00Z")
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000)
const tx = asAppTransactionClient(prismaMock)

type ReadState = JobState | null | "unknown"
const reap = (jobStates: Map<string, ReadState>, conversationId: string | null = null, now = NOW) =>
  reapStaleReviews(tx, conversationId, { jobStates, now })

beforeEach(() => mockReset(prismaMock))

describe("reapStaleReviews", () => {
  it("stale: running with startedAt 11 min ago is reaped, 9 min is not", async () => {
    const rows = useReviewTable([
      { id: "old", status: "running", startedAt: minutesAgo(11), createdAt: minutesAgo(60) },
      { id: "young", status: "running", startedAt: minutesAgo(9), createdAt: minutesAgo(60) },
    ])

    await expect(reap(new Map())).resolves.toBe(1)

    expect(rows.get("old")).toMatchObject({ status: "failed", errorCode: "STALE" })
    expect(rows.get("young")).toMatchObject({ status: "running", errorCode: null })
  })

  it("stale: queued with a waiting or delayed job is never reaped however old; queued with a missing job is reaped only once the row is over 2 minutes old", async () => {
    const rows = useReviewTable([
      { id: "waiting", status: "queued", createdAt: minutesAgo(3 * 24 * 60) },
      { id: "delayed", status: "queued", createdAt: minutesAgo(3 * 24 * 60) },
      { id: "missing-new", status: "queued", createdAt: minutesAgo(1) },
      { id: "missing-old", status: "queued", createdAt: minutesAgo(3) },
      { id: "failed-job", status: "queued", createdAt: minutesAgo(3) },
    ])
    const states = new Map<string, ReadState>([
      ["waiting", "waiting"],
      ["delayed", "delayed"],
      ["missing-new", null],
      ["missing-old", null],
      ["failed-job", "failed"],
    ])

    await expect(reap(states)).resolves.toBe(2)

    expect(rows.get("waiting")?.status).toBe("queued")
    expect(rows.get("delayed")?.status).toBe("queued")
    expect(rows.get("missing-new")?.status).toBe("queued")
    expect(rows.get("missing-old")).toMatchObject({ status: "failed", errorCode: "STALE" })
    expect(rows.get("failed-job")).toMatchObject({ status: "failed", errorCode: "STALE" })

    // The young one is reaped once it passes 2 minutes
    await expect(reap(states, null, new Date(NOW.getTime() + 2 * 60_000))).resolves.toBe(1)
    expect(rows.get("missing-new")).toMatchObject({ status: "failed", errorCode: "STALE" })
  })

  it("only reaps the named conversation's reviews when given one", async () => {
    const rows = useReviewTable([
      { id: "mine", conversationId: "conversation-1", status: "running", startedAt: minutesAgo(30) },
      { id: "other", conversationId: "conversation-2", status: "running", startedAt: minutesAgo(30) },
      { id: "other-queued", conversationId: "conversation-2", status: "queued", createdAt: minutesAgo(30) },
    ])

    await expect(reap(new Map([["other-queued", null]]), "conversation-1")).resolves.toBe(1)

    expect(rows.get("mine")?.status).toBe("failed")
    expect(rows.get("other")?.status).toBe("running")
    expect(rows.get("other-queued")?.status).toBe("queued")
  })
})

describe("readQueuedJobStates", () => {
  it("a queued review whose job waits under reviewJobId is not reaped", async () => {
    const rows = useReviewTable([{ id: "r1", status: "queued", createdAt: minutesAgo(30) }])
    const getJobState = jest.fn(async (jobId: string): Promise<ReadState> => (jobId === reviewJobId("r1") ? "waiting" : null))

    const states = await readQueuedJobStates(null, getJobState)

    await expect(reap(states)).resolves.toBe(0)
    expect(getJobState).toHaveBeenCalledWith("judge-review-r1")
    expect(rows.get("r1")?.status).toBe("queued")
  })

  it("readQueuedJobStates keys each queued review's job state by review id, and a queued review with no entry in jobStates is not reaped", async () => {
    const rows = useReviewTable([
      { id: "r1", conversationId: "conversation-1", status: "queued", createdAt: minutesAgo(30) },
      { id: "r2", conversationId: "conversation-1", status: "queued", createdAt: minutesAgo(30) },
      { id: "r3", conversationId: "conversation-1", status: "running", startedAt: minutesAgo(1) },
      { id: "r4", conversationId: "conversation-2", status: "queued", createdAt: minutesAgo(30) },
    ])
    const getJobState = jest.fn(async (jobId: string): Promise<ReadState> => (jobId === reviewJobId("r1") ? "delayed" : null))

    const states = await readQueuedJobStates("conversation-1", getJobState)

    expect(states).toEqual(new Map([["r1", "delayed"], ["r2", null]]))
    expect(getJobState).toHaveBeenCalledTimes(2)

    // A review queued after the read has no entry, so it is never reaped on this pass
    rows.set("r5", { ...rows.get("r2")!, id: "r5" })
    await expect(reap(states, "conversation-1")).resolves.toBe(1)
    expect(rows.get("r2")).toMatchObject({ status: "failed", errorCode: "STALE" })
    expect(rows.get("r5")?.status).toBe("queued")
    expect(rows.get("r1")?.status).toBe("queued")
  })
})

describe("markReviewFailed", () => {
  it("with a runToken, fails only that run's running review", async () => {
    const rows = useReviewTable([{ id: "r1", status: "running", runToken: 2 }])

    await markReviewFailed("r1", "SCHEMA", 1)
    expect(rows.get("r1")).toMatchObject({ status: "running", errorCode: null })

    await markReviewFailed("r1", "SCHEMA", 2)
    expect(rows.get("r1")).toMatchObject({ status: "failed", errorCode: "SCHEMA" })
  })

  it("markReviewFailed without a runToken keeps a stored errorCode and writes its code only when none is stored", async () => {
    const rows = useReviewTable([
      { id: "coded", status: "queued", errorCode: "PROVIDER" },
      { id: "plain", status: "running" },
      { id: "done", status: "done" },
    ])

    await markReviewFailed("coded", "JOB_FAILED")
    await markReviewFailed("plain", "JOB_FAILED")
    await markReviewFailed("done", "JOB_FAILED")

    expect(rows.get("coded")).toMatchObject({ status: "failed", errorCode: "PROVIDER" })
    expect(rows.get("plain")).toMatchObject({ status: "failed", errorCode: "JOB_FAILED" })
    expect(rows.get("done")).toMatchObject({ status: "done", errorCode: null })
  })
})
