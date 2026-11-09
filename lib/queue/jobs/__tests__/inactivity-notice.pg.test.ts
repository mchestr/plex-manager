/**
 * @jest-environment node
 */

/**
 * The warning email job on PostgreSQL: two jobs that run at once for one
 * notice row send one email. The claim (`pending` to `sending`) is a
 * compare-and-set, so the second job finds the row taken and stops. The mail
 * transport is a mock; the row, the member and the settings are real.
 *
 * Gated by `describePg`. The suite touches only rows it created, keyed by its
 * own run prefix, and puts the shared settings row back as it found it. A
 * second case checks that a stale run before the run that planned a row does
 * not cancel it while that run is still in progress.
 */

import { randomUUID } from "node:crypto"
import { PrismaPg } from "@prisma/adapter-pg"

import { describePg } from "@/__tests__/helpers/integration"
import { getActiveService } from "@/lib/data/active-service"
import { getEmailConfig } from "@/lib/email/config"
import { loadEmailContext } from "@/lib/email/context"
import { sendEmail } from "@/lib/email/transport"
import { PrismaClient, type InactivitySettings } from "@/lib/generated/prisma/client"
import { startOfDay } from "@/lib/inactivity/notices"
import { getAppSettings } from "@/lib/settings/app-settings"
import { dayKey, zonedParts } from "@/lib/utils/zoned-time"

import { JOB_TYPES } from "../../types"
import { getInactivityNoticeProcessor } from "../inactivity-notice"

let mockDb: PrismaClient
jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockDb
  },
}))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))
jest.mock("@/lib/queue/client", () => ({ addJob: jest.fn() }))
jest.mock("@/lib/data/active-service", () => ({ getActiveService: jest.fn() }))
jest.mock("@/lib/email/config", () => ({ getEmailConfig: jest.fn() }))
jest.mock("@/lib/email/context", () => ({ loadEmailContext: jest.fn() }))
jest.mock("@/lib/settings/app-settings", () => ({ getAppSettings: jest.fn() }))
jest.mock("@/lib/utils/server-zone", () => ({ serverZone: jest.fn(async () => "America/Toronto") }))
jest.mock("@/lib/email/transport", () => ({ ...jest.requireActual("@/lib/email/transport"), sendEmail: jest.fn() }))

const RUN = `notice-${randomUUID().slice(0, 8)}`
const MEMBER = `${RUN}-member`
const DAY = 86_400_000
const processor = getInactivityNoticeProcessor(JOB_TYPES.INACTIVITY_NOTICE)!

/** A zone where it is between 09:00 and 20:00 now, so the job sends at once. */
function zoneInWindow(now: number): string {
  const zones = ["Pacific/Honolulu", "America/Toronto", "Europe/London", "Asia/Kolkata", "Asia/Tokyo", "Australia/Sydney"]
  return zones.find((zone) => {
    const { hour } = zonedParts(now, zone)
    return hour >= 9 && hour < 19
  })!
}

describePg("inactivity notice job", (databaseUrl) => {
  let settingsBefore: InactivitySettings | null = null
  const runIds: string[] = []

  beforeAll(async () => {
    mockDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
    settingsBefore = await mockDb.inactivitySettings.findUnique({ where: { id: "inactivity" } })
    await mockDb.inactivitySettings.upsert({
      where: { id: "inactivity" },
      create: { id: "inactivity", enabled: true, thresholdDays: 180, warningsEnabled: true, warningDays: [30, 7, 1] },
      update: { enabled: true, thresholdDays: 180, warningsEnabled: true, warningDays: [30, 7, 1] },
    })
    // The newest finished run, so a stale run another suite left behind cannot cancel the email
    const later = new Date(Date.now() + 60 * 60 * 1000)
    const { id: runId } = await mockDb.inactivityRun.create({ data: { trigger: "scheduled", startedAt: later, finishedAt: later, entries: [] }, select: { id: true } })
    runIds.push(runId)

    jest.mocked(getActiveService).mockResolvedValue({ adminPlexUserId: "1" } as never)
    jest.mocked(getEmailConfig).mockReturnValue({
      server: { host: "smtp.example.com", port: 587, secure: false },
      auth: null,
      from: "noreply@example.com",
      replyTo: null,
      postalAddress: null,
    })
    jest.mocked(loadEmailContext).mockResolvedValue({
      serverName: "Northfield Plex",
      appUrl: "https://plex.example.com",
      accent: { fill: "#b45309", ink: "#ffffff" },
      replyTo: null,
      postalAddress: null,
    })
    jest.mocked(getAppSettings).mockResolvedValue({ timeZone: "America/Toronto", locale: "en-US", serverName: "Northfield Plex" })
  })

  afterAll(async () => {
    if (!mockDb) return
    await mockDb.user.deleteMany({ where: { id: { startsWith: RUN } } })
    await mockDb.inactivityRun.deleteMany({ where: { id: { in: runIds } } })
    if (settingsBefore) {
      const { id, enabled, thresholdDays, warningsEnabled, warningDays } = settingsBefore
      await mockDb.inactivitySettings.update({ where: { id }, data: { enabled, thresholdDays, warningsEnabled, warningDays } })
    } else {
      await mockDb.inactivitySettings.deleteMany({ where: { id: "inactivity" } })
    }
    await mockDb.$disconnect()
  })

  it("sends one email when two jobs claim the same row at once", async () => {
    const now = Date.now()
    const zone = zoneInWindow(now)
    const lastPlay = new Date(now - 150 * DAY)
    await mockDb.user.create({
      data: { id: MEMBER, name: "Sam", email: `${RUN}@example.com`, plexUserId: `${RUN}-plex`, timezone: zone, lastSeenAt: lastPlay, createdAt: new Date(now - 1000 * DAY) },
    })
    const removeAfter = startOfDay(dayKey(now + 30 * DAY, zone), zone)
    const { id: noticeId } = await mockDb.inactivityNotice.create({
      data: { userId: MEMBER, cycleAt: lastPlay, leadDays: 30, removeAfter, zone, status: "pending" },
      select: { id: true },
    })
    jest.mocked(sendEmail).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
      return { ok: true, smtpCode: 250 }
    })

    const job = () => ({ data: { noticeId }, attemptsMade: 0, opts: { attempts: 3 }, moveToDelayed: jest.fn(async () => undefined) })
    const results = await Promise.all([processor(job()), processor(job())])

    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(results).toEqual(expect.arrayContaining([{ status: "sent", code: null }, { status: "not_pending" }]))
    const row = await mockDb.inactivityNotice.findUniqueOrThrow({ where: { id: noticeId } })
    expect(row).toMatchObject({ status: "sent", attempts: 1, code: null })
    expect(row.handledAt).toBeInstanceOf(Date)

    await expect(processor(job())).resolves.toEqual({ status: "not_pending" })
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })

  it("sends while the run that planned the row is in progress, after a stale run that finished before it", async () => {
    const now = Date.now()
    const zone = zoneInWindow(now)
    const member = `${RUN}-recovery`
    const lastPlay = new Date(now - 150 * DAY)
    await mockDb.user.create({
      data: { id: member, name: "Alex", email: `${member}@example.com`, plexUserId: `${member}-plex`, timezone: zone, lastSeenAt: lastPlay, createdAt: new Date(now - 1000 * DAY) },
    })
    // Both start after the suite's good run, so the stale run is the newest finished one
    const staleAt = new Date(now + 2 * 60 * 60 * 1000)
    const planningAt = new Date(staleAt.getTime() + 10 * 60 * 1000)
    const stale = await mockDb.inactivityRun.create({
      data: { trigger: "scheduled", startedAt: staleAt, finishedAt: new Date(staleAt.getTime() + 60_000), blocked: "tautulli_stale", entries: [] },
      select: { id: true },
    })
    const planning = await mockDb.inactivityRun.create({ data: { trigger: "admin", startedAt: planningAt, entries: [] }, select: { id: true } })
    runIds.push(stale.id, planning.id)
    const { id: noticeId } = await mockDb.inactivityNotice.create({
      data: {
        userId: member, cycleAt: lastPlay, leadDays: 30, zone, status: "pending", runId: planning.id,
        removeAfter: startOfDay(dayKey(now + 30 * DAY, zone), zone), updatedAt: new Date(planningAt.getTime() + 60_000),
      },
      select: { id: true },
    })
    jest.mocked(sendEmail).mockResolvedValue({ ok: true, smtpCode: 250 })

    const job = { data: { noticeId }, attemptsMade: 0, opts: { attempts: 3 }, moveToDelayed: jest.fn(async () => undefined) }
    await expect(processor(job)).resolves.toEqual({ status: "sent", code: null })
    await expect(mockDb.inactivityNotice.findUniqueOrThrow({ where: { id: noticeId } })).resolves.toMatchObject({ status: "sent", code: null })
  })
})
