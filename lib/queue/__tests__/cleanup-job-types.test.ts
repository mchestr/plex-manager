/**
 * @jest-environment node
 */

/**
 * The media cleanup job types (TS 9.1) and their ids (TS 9.2). BullMQ is
 * replaced by an in-memory queue that honours `deduplication` the way BullMQ
 * does: a second add with a live id joins the first job.
 */

import { addJob } from "@/lib/queue/client"
import { jobIdOptions } from "@/lib/queue/job-id"
import {
  JOB_ID_POLICY,
  JOB_TYPE_LABELS,
  JOB_TYPES,
  jobTypeLabel,
  MAIN_QUEUE_JOB_TYPES,
  type CleanupRunPayload,
} from "@/lib/queue/types"

const mockJobs = new Map<string, { name: string; data: unknown }>()
const mockDeduplication = new Map<string, string>()
const mockAdd = jest.fn(async (name: string, data: unknown, opts: { deduplication?: { id: string } }) => {
  const live = opts.deduplication && mockDeduplication.get(opts.deduplication.id)
  if (live) return { id: live }
  const id = String(mockJobs.size + 1)
  mockJobs.set(id, { name, data })
  if (opts.deduplication) mockDeduplication.set(opts.deduplication.id, id)
  return { id }
})

jest.mock("bullmq", () => ({ Queue: jest.fn(() => ({ add: mockAdd })), QueueEvents: jest.fn() }))
jest.mock("@/lib/queue/connection", () => ({ getRedisConnection: jest.fn() }))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

beforeEach(() => {
  mockJobs.clear()
  mockDeduplication.clear()
  mockAdd.mockClear()
})

const CLEANUP_TYPES = [
  JOB_TYPES.CLEANUP_READ,
  JOB_TYPES.CLEANUP_RUN,
  JOB_TYPES.CLEANUP_ACT,
  JOB_TYPES.CLEANUP_COLLECTIONS,
] as const

/** The deduplication id `addJob` gives a `cleanup:run` payload. */
function runId(data: CleanupRunPayload): string | undefined {
  return jobIdOptions(JOB_TYPES.CLEANUP_RUN, data).deduplication?.id
}

/** The deduplication id `addJob` gives a `cleanup:act` with `waits`. */
function actId(waits?: number): string | undefined {
  return jobIdOptions(JOB_TYPES.CLEANUP_ACT, { trigger: "approval", actorId: "admin-1", waits }).deduplication?.id
}

describe("registration", () => {
  it("names the four job types", () => {
    expect(CLEANUP_TYPES).toEqual(["cleanup:read", "cleanup:run", "cleanup:act", "cleanup:collections"])
  })

  it("labels each one for the Queues page", () => {
    expect(CLEANUP_TYPES.map((type) => JOB_TYPE_LABELS[type])).toEqual([
      "Media cleanup library read",
      "Media cleanup run",
      "Media cleanup deletions",
      "Media cleanup Plex collections",
    ])
    expect(jobTypeLabel("cleanup:act")).toBe("Media cleanup deletions")
  })

  it("lists them on the main queue right after the conversation review sweep", () => {
    const sweep = MAIN_QUEUE_JOB_TYPES.indexOf(JOB_TYPES.CONVERSATION_REVIEW_SWEEP)

    expect(MAIN_QUEUE_JOB_TYPES.slice(sweep + 1, sweep + 1 + CLEANUP_TYPES.length)).toEqual([...CLEANUP_TYPES])
  })

  it("gives every one a deduplication id, never a caller's or the clock's", () => {
    for (const type of CLEANUP_TYPES) expect("deduplication" in JOB_ID_POLICY[type]).toBe(true)
  })
})

describe("cleanup:read and cleanup:collections", () => {
  it("share one id per type, whatever the payload", () => {
    expect(jobIdOptions(JOB_TYPES.CLEANUP_READ, { trigger: "scheduled", chain: true })).toEqual({
      deduplication: { id: "cleanup:read" },
    })
    expect(
      jobIdOptions(JOB_TYPES.CLEANUP_READ, { trigger: "admin", actorId: "admin-1", chain: false, thenDryRunRuleIds: ["r1"] })
    ).toEqual({ deduplication: { id: "cleanup:read" } })
    expect(jobIdOptions(JOB_TYPES.CLEANUP_COLLECTIONS, { reason: "scheduled" })).toEqual({
      deduplication: { id: "cleanup:collections" },
    })
    expect(jobIdOptions(JOB_TYPES.CLEANUP_COLLECTIONS, { reason: "change" })).toEqual({
      deduplication: { id: "cleanup:collections" },
    })
  })
})

describe("cleanup:run", () => {
  it("keys a dry run by its sorted rule ids, without sorting the payload's own list", () => {
    const dryRunRuleIds = ["rule-b", "rule-c", "rule-a"]

    expect(runId({ trigger: "admin", act: false, dryRunRuleIds })).toBe("cleanup:dry-run:rule-a+rule-b+rule-c")
    expect(runId({ trigger: "create", act: false, dryRunRuleIds: ["rule-c", "rule-a", "rule-b"] })).toBe(
      "cleanup:dry-run:rule-a+rule-b+rule-c"
    )
    expect(dryRunRuleIds).toEqual(["rule-b", "rule-c", "rule-a"])
  })

  it("ends a single-rule dry run's id with the rule revision", () => {
    expect(runId({ trigger: "admin", act: false, dryRunRuleIds: ["rule-a"], dryRunRevision: 4 })).toBe(
      "cleanup:dry-run:rule-a:4"
    )
    expect(runId({ trigger: "admin", act: false, dryRunRuleIds: ["rule-a"] })).toBe("cleanup:dry-run:rule-a")
  })

  it("gives two dry runs of one rule at two revisions two ids", () => {
    const before = runId({ trigger: "admin", act: false, dryRunRuleIds: ["rule-a"], dryRunRevision: 3 })
    const after = runId({ trigger: "admin", act: false, dryRunRuleIds: ["rule-a"], dryRunRevision: 4 })

    expect(before).not.toBe(after)
  })

  it("starts a dry run of the saved definition while one of the old definition still waits", async () => {
    const old = await addJob(JOB_TYPES.CLEANUP_RUN, { trigger: "admin", act: false, dryRunRuleIds: ["rule-a"], dryRunRevision: 3 })
    const again = await addJob(JOB_TYPES.CLEANUP_RUN, { trigger: "admin", act: false, dryRunRuleIds: ["rule-a"], dryRunRevision: 3 })
    const saved = await addJob(JOB_TYPES.CLEANUP_RUN, { trigger: "admin", act: false, dryRunRuleIds: ["rule-a"], dryRunRevision: 4 })

    expect(again).toBe(old)
    expect(saved).not.toBe(old)
    expect(mockJobs.size).toBe(2)
  })

  it("gives the nightly run its own id for each busy retry", () => {
    expect(runId({ trigger: "scheduled", act: true, readStatus: "complete" })).toBe("cleanup:run:nightly:0")
    expect(runId({ trigger: "scheduled", act: true, readStatus: "busy", waits: 0 })).toBe("cleanup:run:nightly:0")
    expect(runId({ trigger: "scheduled", act: true, waits: 1 })).toBe("cleanup:run:nightly:1")
    expect(runId({ trigger: "scheduled", act: true, waits: 2 })).toBe("cleanup:run:nightly:2")
  })

  it("keys an admin run and a run after a create apart from the nightly run", () => {
    expect(runId({ trigger: "admin", actorId: "admin-1", act: false })).toBe("cleanup:run")
    expect(runId({ trigger: "create", act: false, entries: false })).toBe("cleanup:run")
  })

  it("adds the nightly run while an admin run is pending, so the night's act step is never swallowed", async () => {
    const admin = await addJob(JOB_TYPES.CLEANUP_RUN, { trigger: "admin", actorId: "admin-1", act: false })
    const nightly = await addJob(JOB_TYPES.CLEANUP_RUN, { trigger: "scheduled", act: true, readStatus: "complete" })
    const secondAdmin = await addJob(JOB_TYPES.CLEANUP_RUN, { trigger: "admin", actorId: "admin-2", act: false })

    expect(nightly).not.toBe(admin)
    expect(secondAdmin).toBe(admin)
    expect(mockJobs.get(nightly)).toEqual({ name: "cleanup:run", data: { trigger: "scheduled", act: true, readStatus: "complete" } })
    expect(mockJobs.size).toBe(2)
  })
})

describe("cleanup:act", () => {
  it("uses one id for the act step and a distinct id for each retry", () => {
    expect(actId()).toBe("cleanup:act")
    expect(actId(0)).toBe("cleanup:act")
    const retries = [1, 2, 3, 4, 5, 6].map(actId)

    expect(retries).toEqual([1, 2, 3, 4, 5, 6].map((waits) => `cleanup:act:retry:${waits}`))
    expect(new Set([actId(), ...retries]).size).toBe(7)
  })

  it("adds a retry while the act step that added it still runs", async () => {
    const step = await addJob(JOB_TYPES.CLEANUP_ACT, { trigger: "approval", actorId: "admin-1" })
    const retry = await addJob(JOB_TYPES.CLEANUP_ACT, { trigger: "approval", actorId: "admin-1", waits: 1 })
    const approvedAgain = await addJob(JOB_TYPES.CLEANUP_ACT, { trigger: "approval", actorId: "admin-2" })

    expect(retry).not.toBe(step)
    expect(approvedAgain).toBe(step)
    expect(mockJobs.size).toBe(2)
  })
})
