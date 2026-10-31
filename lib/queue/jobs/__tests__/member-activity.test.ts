/**
 * @jest-environment node
 */

jest.mock("@/lib/inactivity/run", () => ({ runMemberActivity: jest.fn() }))

import { runMemberActivity } from "@/lib/inactivity/run"
import { shutdownSignal } from "@/lib/instrumentation/shutdown"
import { SYSTEM_ACTOR } from "@/lib/session-revocation"

import { JOB_TYPES } from "../../types"
import { getMemberActivityProcessor } from "../member-activity"

const processor = getMemberActivityProcessor(JOB_TYPES.MEMBER_ACTIVITY)!
const finished = { busy: false as const, runId: "run-1", matched: 3, qualified: 1, removed: 1, failed: 0, blocked: null, error: null }

beforeEach(() => {
  jest.mocked(runMemberActivity).mockReset().mockResolvedValue(finished)
})

describe("member activity processor", () => {
  it("runs a scheduled run as the system, with no confirmed count", async () => {
    await expect(processor({ data: { triggeredBy: "scheduled", confirmedRemovals: 5 } })).resolves.toEqual(finished)
    expect(runMemberActivity).toHaveBeenCalledWith("scheduled", { actorId: SYSTEM_ACTOR, confirmedRemovals: undefined, signal: shutdownSignal })
  })

  it("runs an admin run as that admin, with the count they confirmed", async () => {
    await processor({ data: { triggeredBy: "admin", triggeredByUserId: "admin-1", confirmedRemovals: 2 } })
    expect(runMemberActivity).toHaveBeenCalledWith("admin", { actorId: "admin-1", confirmedRemovals: 2, signal: shutdownSignal })
  })

  it("falls back to the system actor for an admin run without a user", async () => {
    await processor({ data: { triggeredBy: "admin" } })
    expect(runMemberActivity).toHaveBeenCalledWith("admin", { actorId: SYSTEM_ACTOR, confirmedRemovals: undefined, signal: shutdownSignal })
  })

  it("reports a busy run and a skipped one", async () => {
    jest.mocked(runMemberActivity).mockResolvedValueOnce({ busy: true }).mockResolvedValueOnce(null)
    await expect(processor({ data: { triggeredBy: "scheduled" } })).resolves.toEqual({ busy: true })
    await expect(processor({ data: { triggeredBy: "scheduled" } })).resolves.toEqual({ skipped: true })
  })

  it("has no processor for another type", () => {
    expect(getMemberActivityProcessor(JOB_TYPES.REQUEST_TIER_SYNC)).toBeNull()
  })
})
