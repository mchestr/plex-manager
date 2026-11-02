/**
 * @jest-environment node
 */

/**
 * A review's BullMQ job state (spec §4, "Stuck reviews"): its id has no `:`,
 * a missing job reads as null, and an unreachable queue reads as `unknown`,
 * which the reap never acts on.
 */

import { mockReset } from "jest-mock-extended"

import { asAppTransactionClient, prismaMock } from "@/__tests__/helpers/prisma-mock"
import { useReviewTable } from "@/__tests__/helpers/review-table"
import { withRequestPathQueue } from "@/lib/queue/request-path"

import { reviewJobId, reviewJobState } from "../job-state"
import { reapStaleReviews } from "../stale"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/queue/request-path", () => ({ withRequestPathQueue: jest.fn() }))

const NOW = new Date("2026-11-19T22:00:00Z")
const DAY_AGO = new Date(NOW.getTime() - 24 * 60 * 60_000)

beforeEach(() => mockReset(prismaMock))

describe("reviewJobId", () => {
  it("prefixes the review id with judge-review- and uses no colon", () => {
    expect(reviewJobId("ck123")).toBe("judge-review-ck123")
    expect(reviewJobId("ck123")).not.toContain(":")
  })
})

describe("reviewJobState", () => {
  it("reviewJobState maps BullMQ unknown to null and an unreachable queue to unknown, which is never reaped", async () => {
    await expect(reviewJobState("judge-review-r1", async () => "unknown")).resolves.toBeNull()
    await expect(reviewJobState("judge-review-r1", async () => "delayed")).resolves.toBe("delayed")
    await expect(reviewJobState("judge-review-r1", async () => Promise.reject(new Error("ECONNREFUSED")))).resolves.toBe("unknown")

    // The default read goes through the request-path queue, and its QUEUE_UNAVAILABLE is unknown too
    const getJobState = jest.fn(async () => "unknown" as const)
    jest.mocked(withRequestPathQueue).mockImplementation(async (label, fn) => {
      expect(label).toBe("judge-review-state")
      return { ok: true, value: await fn({ getJobState } as never) }
    })
    await expect(reviewJobState("judge-review-r1")).resolves.toBeNull()
    expect(getJobState).toHaveBeenCalledWith("judge-review-r1")
    jest.mocked(withRequestPathQueue).mockResolvedValue({ ok: false, code: "QUEUE_UNAVAILABLE" })
    const unreachable = await reviewJobState("judge-review-r1")
    expect(unreachable).toBe("unknown")

    const rows = useReviewTable([{ id: "r1", status: "queued", createdAt: DAY_AGO }])
    const reaped = await reapStaleReviews(asAppTransactionClient(prismaMock), null, { jobStates: new Map([["r1", unreachable]]), now: NOW })
    expect(reaped).toBe(0)
    expect(rows.get("r1")).toMatchObject({ status: "queued", errorCode: null })
  })
})
