/**
 * @jest-environment node
 */

import { mkdtempSync, readdirSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import type { Job } from "bullmq"
import { mockReset } from "jest-mock-extended"

import { buildConfig, buildPlexWrapped } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { processRewindCardPrewarm, processRewindCardSweep, registerCardJobs } from "@/lib/queue/jobs/rewind-cards"
import type { RewindCardPrewarmPayload } from "@/lib/queue/types"
import { renderCardPng } from "@/lib/rewind/cards/render"
import { fixtureRewind } from "@/lib/wrapped/data/__tests__/share-fixture"
import { afterRewindCompleted } from "@/lib/wrapped/pipeline/after-complete"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/settings/app-settings", () => ({
  getAppSettings: jest.fn().mockResolvedValue({ serverName: "Chester Family Plex", timeZone: "UTC", locale: "en-US" }),
}))
jest.mock("@/lib/rewind/cards/render", () => ({
  renderCardPng: jest.fn(async () => Buffer.from("png")),
}))
const mockAdd = jest.fn(async () => ({}))
const mockUpsertJobScheduler = jest.fn(async () => ({}))
jest.mock("@/lib/queue/rewind-producers", () => ({
  getRewindQueue: jest.fn(() => ({ add: mockAdd, upsertJobScheduler: mockUpsertJobScheduler })),
}))

const job = (wrappedId: string) => ({ data: { wrappedId } }) as Job<RewindCardPrewarmPayload>

let dir: string

beforeEach(async () => {
  mockReset(prismaMock)
  jest.mocked(renderCardPng).mockClear()
  dir = mkdtempSync(path.join(os.tmpdir(), "rewind-prewarm-"))
  process.env.REWIND_CACHE_DIR = dir
  const rewind = await fixtureRewind("heavy")
  prismaMock.plexWrapped.findUnique.mockResolvedValue(buildPlexWrapped({ data: JSON.stringify(rewind), dataVersion: 3 }))
  prismaMock.config.findUnique.mockResolvedValue(buildConfig())
  prismaMock.rewindPrefs.findUnique.mockResolvedValue(null)
  prismaMock.rewindExclusion.findMany.mockResolvedValue([])
})

afterEach(() => {
  delete process.env.REWIND_CACHE_DIR
  rmSync(dir, { recursive: true, force: true })
})

describe("REWIND_CARD_PREWARM", () => {
  it("renders the cover, centrefold and back cover once", async () => {
    expect(await processRewindCardPrewarm(job("wrapped-1"))).toEqual({ rendered: 3 })
    expect(readdirSync(path.join(dir, "cards"))).toHaveLength(3)
    expect(await processRewindCardPrewarm(job("wrapped-1"))).toEqual({ rendered: 0 })
    expect(renderCardPng).toHaveBeenCalledTimes(3)
  })

  it("does nothing for a row that is gone or not completed", async () => {
    prismaMock.plexWrapped.findUnique.mockResolvedValue(null)
    expect(await processRewindCardPrewarm(job("gone"))).toEqual({ rendered: 0 })
    prismaMock.plexWrapped.findUnique.mockResolvedValue(buildPlexWrapped({ status: "failed" }))
    expect(await processRewindCardPrewarm(job("failed"))).toEqual({ rendered: 0 })
  })
})

describe("REWIND_CARD_SWEEP", () => {
  it("reports how many files it removed", async () => {
    expect(await processRewindCardSweep()).toEqual({ removed: 0 })
  })
})

describe("registerCardJobs", () => {
  it("enqueues the prewarm after a Rewind completes, deduplicated on the facts, and schedules the daily sweep", async () => {
    registerCardJobs()
    await afterRewindCompleted({
      userId: "user-1", year: 2026, wrappedId: "wrapped-1", generationId: "gen-1", factsHash: "abc", edition: "full", first: true,
    })
    expect(mockAdd).toHaveBeenCalledWith(
      "rewind:card:prewarm",
      { wrappedId: "wrapped-1" },
      expect.objectContaining({ deduplication: { id: "rewind:cards:wrapped-1:abc" } })
    )
    expect(mockUpsertJobScheduler).toHaveBeenCalledWith("rewind-card-sweep", { every: 86_400_000 }, expect.objectContaining({ name: "rewind:card:sweep" }))
  })
})
