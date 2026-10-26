/**
 * @jest-environment node
 */

jest.mock("@/lib/discord/channel-stats/run", () => ({ runChannelStats: jest.fn(async () => ({ renamed: 1 })) }))
jest.mock("@/lib/request-tiers/run", () => ({ runRequestTierSync: jest.fn(async () => ({ runId: "r1" })) }))

import type { Job } from "bullmq"

import { runChannelStats } from "@/lib/discord/channel-stats/run"
import { runRequestTierSync } from "@/lib/request-tiers/run"

import { JOB_TYPES } from "../../types"
import { getJobProcessor } from "../index"

const job = (triggeredBy: string) => ({ data: { triggeredBy } }) as unknown as Job

describe("community stats processors", () => {
  it("runs the stat channels job as scheduled or as an admin", async () => {
    const processor = getJobProcessor(JOB_TYPES.DISCORD_CHANNEL_STATS)!
    await expect(processor(job("scheduled"))).resolves.toEqual({ renamed: 1 })
    await processor(job("admin"))
    expect(jest.mocked(runChannelStats).mock.calls.map(([trigger]) => trigger)).toEqual(["scheduled", "admin"])
  })

  it("runs the request tier job as scheduled or as an admin", async () => {
    const processor = getJobProcessor(JOB_TYPES.REQUEST_TIER_SYNC)!
    await expect(processor(job("scheduled"))).resolves.toEqual({ runId: "r1" })
    await processor(job("admin"))
    expect(jest.mocked(runRequestTierSync).mock.calls.map(([trigger]) => trigger)).toEqual(["scheduled", "admin"])
  })

  it("has no processor for another type", () => {
    expect(getJobProcessor("nope")).toBeNull()
  })
})
