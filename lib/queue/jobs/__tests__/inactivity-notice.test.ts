/**
 * @jest-environment node
 */

/**
 * The warning email job (`INACTIVITY_NOTICE`): the registry entries, the
 * enqueuer, the send window, the send-time checks, the claim, and what each
 * mail server answer does to the row. The checks' every code has its own
 * test (`lib/inactivity/__tests__/notice-checks.test.ts`); here they run
 * through the job with real rules.
 */

const mockLog = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: (...args: unknown[]) => mockLog.info(...args),
    warn: (...args: unknown[]) => mockLog.warn(...args),
    error: (...args: unknown[]) => mockLog.error(...args),
  }),
}))
jest.mock("@/lib/queue/client", () => ({ addJob: jest.fn() }))
jest.mock("nodemailer", () => ({ createTransport: jest.fn() }))
jest.mock("@/lib/email/config", () => ({ getEmailConfig: jest.fn() }))
jest.mock("@/lib/email/transport", () => ({ ...jest.requireActual("@/lib/email/transport"), sendEmail: jest.fn() }))
jest.mock("@/lib/email/warning-email", () => ({ warningMessage: jest.fn() }))
jest.mock("@/lib/inactivity/members", () => ({ readInactivityMember: jest.fn() }))
jest.mock("@/lib/inactivity/notice-store", () => ({ readNotices: jest.fn() }))
jest.mock("@/lib/inactivity/settings", () => ({ getInactivitySettings: jest.fn(), getInactivityWarnings: jest.fn() }))
jest.mock("@/lib/utils/server-zone", () => ({ serverZone: jest.fn(async () => "America/Toronto") }))
jest.mock("@/lib/data/active-service", () => ({ getActiveService: jest.fn() }))

import { DelayedError } from "bullmq"
import { mockReset } from "jest-mock-extended"
import { createTransport } from "nodemailer"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { getActiveService } from "@/lib/data/active-service"
import { getEmailConfig } from "@/lib/email/config"
import type { EmailConfig } from "@/lib/email/env-rules"
import { sendEmail, type SmtpFailure } from "@/lib/email/transport"
import { warningMessage } from "@/lib/email/warning-email"
import { readInactivityMember } from "@/lib/inactivity/members"
import { readNotices } from "@/lib/inactivity/notice-store"
import type { InactivityMember } from "@/lib/inactivity/rules"
import { getInactivitySettings, getInactivityWarnings } from "@/lib/inactivity/settings"
import { addJob } from "@/lib/queue/client"
import { getJobProcessor } from "@/lib/queue/jobs"

import { JOB_ID_POLICY, JOB_TYPE_LABELS, JOB_TYPES, MAIN_QUEUE_JOB_TYPES } from "../../types"
import { enqueueInactivityNotices, getInactivityNoticeProcessor } from "../inactivity-notice"

const processor = getInactivityNoticeProcessor(JOB_TYPES.INACTIVITY_NOTICE)!

const TORONTO = "America/Toronto"
const LAST_PLAY = new Date("2026-05-02T00:00:00Z")
const PLANNED = new Date("2026-09-28T06:17:00Z")
/** 09:00 on September 28 in Toronto. */
const MORNING = new Date("2026-09-28T13:00:00Z")
const ADDRESS = "member@example.com"

const config: EmailConfig = {
  server: { host: "smtp.example.com", port: 587, secure: false },
  auth: null,
  from: "noreply@example.com",
  replyTo: null,
  postalAddress: null,
}

const member: InactivityMember = {
  id: "u1",
  plexUserId: "42",
  isAdmin: false,
  role: null,
  inactivityExcluded: false,
  subscriptionStatus: null,
  createdAt: new Date("2025-01-01T00:00:00Z"),
  lastSeenAt: LAST_PLAY,
  lastSeenReadAt: null,
  accessEndedAt: null,
  accessRestoredAt: null,
  timezone: TORONTO,
}

const row = {
  id: "n1",
  userId: "u1",
  cycleAt: LAST_PLAY,
  leadDays: 30,
  removeAfter: new Date("2026-10-28T04:00:00Z"),
  status: "pending",
  attempts: 0,
  zone: TORONTO,
  handledAt: null,
  createdAt: PLANNED,
  updatedAt: PLANNED,
}

/** The row's status in the fake database; each updateMany is a compare-and-set on it. */
let status: string
const moveToDelayed = jest.fn(async () => undefined)
const job = ({ attemptsMade = 0 } = {}) => ({ data: { noticeId: "n1" }, attemptsMade, opts: { attempts: 3 }, moveToDelayed })

const failure = (patch: Partial<SmtpFailure>): { ok: false; failure: SmtpFailure } => ({
  ok: false,
  failure: { kind: "temporary", smtpCode: 451, status: "4.3.0", step: "RCPT TO", ...patch },
})

/** The error a job run throws; fails the test when it resolves. */
async function rejection(run: Promise<unknown>): Promise<Error> {
  try {
    await run
  } catch (error) {
    if (error instanceof Error) return error
  }
  throw new Error("expected the job to throw an Error")
}

const writes = () => prismaMock.inactivityNotice.updateMany.mock.calls.map(([args]) => args.data)

/** The newest finished run: `blocked`, finished `minutes` after the row became pending (negative: before). */
const newestRun = (blocked: string | null, minutes: number) => ({ blocked, finishedAt: new Date(PLANNED.getTime() + minutes * 60_000) })

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.useFakeTimers({ now: MORNING, doNotFake: ["setTimeout", "clearTimeout", "setImmediate", "nextTick", "queueMicrotask"] })
  status = "pending"
  prismaMock.inactivityNotice.findUnique.mockImplementation((async () => ({ ...row, status })) as never)
  prismaMock.inactivityNotice.updateMany.mockImplementation((async (args: { where: { status: string }; data: { status: string } }) => {
    if (args.where.status !== status) return { count: 0 }
    status = args.data.status
    return { count: 1 }
  }) as never)
  prismaMock.user.findUnique.mockResolvedValue({ name: "Sam", email: ADDRESS, disabledAt: null, inactivityEmailsOff: false } as never)
  prismaMock.inactivityRun.findFirst.mockResolvedValue(newestRun(null, -1440) as never)
  jest.mocked(readInactivityMember).mockResolvedValue(member)
  jest.mocked(readNotices).mockResolvedValue([row])
  jest.mocked(getInactivitySettings).mockResolvedValue({ enabled: true, thresholdDays: 180 })
  jest.mocked(getInactivityWarnings).mockResolvedValue({ warningsEnabled: true, warningDays: [30, 7, 1] })
  jest.mocked(getActiveService).mockResolvedValue({ adminPlexUserId: "1" } as never)
  jest.mocked(getEmailConfig).mockReturnValue(config)
  jest.mocked(warningMessage).mockResolvedValue({ subject: "message" })
  jest.mocked(sendEmail).mockResolvedValue({ ok: true, smtpCode: 250 })
})

afterEach(() => {
  jest.useRealTimers()
})

describe("registry", () => {
  it("registers the job on the main queue, labelled and deduplicated by the notice id", () => {
    expect(JOB_TYPES.INACTIVITY_NOTICE).toBe("members:notice")
    expect(MAIN_QUEUE_JOB_TYPES).toContain(JOB_TYPES.INACTIVITY_NOTICE)
    expect(JOB_TYPE_LABELS[JOB_TYPES.INACTIVITY_NOTICE]).toBe("Inactivity email")
    const policy = JOB_ID_POLICY[JOB_TYPES.INACTIVITY_NOTICE]
    expect("deduplication" in policy && policy.deduplication({ noticeId: "n1" })).toBe("members:notice:n1")
    expect(getJobProcessor(JOB_TYPES.INACTIVITY_NOTICE)).toBe(processor)
    expect(getInactivityNoticeProcessor(JOB_TYPES.EMAIL_TEST)).toBeNull()
  })

  it("enqueues one job per row with the notice id only, three attempts and a minute's backoff", async () => {
    await enqueueInactivityNotices(["n1", "n2"])

    expect(addJob).toHaveBeenCalledTimes(2)
    expect(addJob).toHaveBeenNthCalledWith(1, JOB_TYPES.INACTIVITY_NOTICE, { noticeId: "n1" }, { attempts: 3, backoff: { type: "exponential", delay: 60_000 } })
    expect(addJob).toHaveBeenNthCalledWith(2, JOB_TYPES.INACTIVITY_NOTICE, { noticeId: "n2" }, expect.any(Object))
  })
})

describe("inactivity notice job", () => {
  it("sends the first warning in the window and marks the row sent", async () => {
    await expect(processor(job())).resolves.toEqual({ status: "sent", code: null })

    expect(writes()).toEqual([
      { status: "sending", attempts: { increment: 1 } },
      { status: "sent", code: null, handledAt: MORNING },
    ])
    expect(warningMessage).toHaveBeenCalledWith(
      config,
      { userId: "u1", name: "Sam", email: ADDRESS },
      { stage: "first", thresholdDays: 180, zone: TORONTO, removeAfter: row.removeAfter, cycleAt: LAST_PLAY, now: MORNING }
    )
    const [usedConfig, message, signal] = jest.mocked(sendEmail).mock.calls[0]
    expect(usedConfig).toBe(config)
    expect(message).toEqual({ subject: "message" })
    expect(signal).toBeInstanceOf(AbortSignal)
    expect(mockLog.info).toHaveBeenCalledWith("inactivity_notice.sent", { noticeId: "n1", userId: "u1", code: null, smtpCode: 250 })
    expect(mockLog.error).not.toHaveBeenCalled()
  })

  it("renders each lead as its stage", async () => {
    jest.mocked(readNotices).mockResolvedValue([{ ...row, leadDays: 7 }])
    prismaMock.inactivityNotice.findUnique.mockResolvedValue({ ...row, leadDays: 7 } as never)
    await processor(job())

    expect(jest.mocked(warningMessage).mock.calls[0][2].stage).toBe("reminder")
  })

  it("delays itself to 09:00 in the row's zone outside the send window, without touching the row", async () => {
    jest.setSystemTime(PLANNED)

    await expect(processor(job(), "token-1")).rejects.toBeInstanceOf(DelayedError)
    expect(moveToDelayed).toHaveBeenCalledWith(MORNING.getTime(), "token-1")
    expect(prismaMock.inactivityNotice.updateMany).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it.each(["sending", "sent", "skipped", "failed", "cancelled"])("stops when the row is %s", async (rowStatus) => {
    status = rowStatus

    await expect(processor(job())).resolves.toEqual({ status: "not_pending" })
    expect(moveToDelayed).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("stops when the row or the member is gone", async () => {
    prismaMock.inactivityNotice.findUnique.mockResolvedValueOnce(null)
    await expect(processor(job())).resolves.toEqual({ status: "not_pending" })

    jest.mocked(readInactivityMember).mockResolvedValueOnce(null)
    await expect(processor(job())).resolves.toEqual({ status: "not_pending" })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it.each<[string, () => void, string]>([
    ["removal is off", () => jest.mocked(getInactivitySettings).mockResolvedValue({ enabled: false, thresholdDays: 180 }), "removal_off"],
    ["warnings are off", () => jest.mocked(getInactivityWarnings).mockResolvedValue({ warningsEnabled: false, warningDays: [30, 7, 1] }), "warnings_off"],
    ["the member played", () => jest.mocked(readInactivityMember).mockResolvedValue({ ...member, lastSeenAt: new Date(MORNING.getTime() - 3600_000) }), "cycle_changed"],
    ["the member is the server owner", () => jest.mocked(getActiveService).mockResolvedValue({ adminPlexUserId: "42" } as never), "protected"],
    ["the member's access ended", () => jest.mocked(readInactivityMember).mockResolvedValue({ ...member, accessEndedAt: MORNING }), "access_ended"],
    ["a run after the planning run stopped on stale data", () => prismaMock.inactivityRun.findFirst.mockResolvedValue(newestRun("tautulli_stale", 60) as never), "stale_data"],
    ["a higher threshold moved the date", () => jest.mocked(getInactivitySettings).mockResolvedValue({ enabled: true, thresholdDays: 240 }), "superseded"],
    ["the first warning is days late", () => jest.setSystemTime(new Date(MORNING.getTime() + 3 * 86_400_000)), "late"],
  ])("cancels the email when %s", async (_name, arrange, code) => {
    arrange()

    await expect(processor(job())).resolves.toEqual({ status: "cancelled", code })
    expect(writes()).toEqual([{ status: "cancelled", code }])
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("sends when the newest finished run is a stale one from before the run that planned the row", async () => {
    // The good run that planned the row is still in progress, so the stale run before it is the newest finished one
    prismaMock.inactivityRun.findFirst.mockResolvedValue(newestRun("tautulli_stale", -60) as never)

    await expect(processor(job())).resolves.toEqual({ status: "sent", code: null })
    expect(prismaMock.inactivityRun.findFirst).toHaveBeenCalledWith({
      where: { finishedAt: { not: null } },
      orderBy: { startedAt: "desc" },
      select: { blocked: true, finishedAt: true },
    })
  })

  it("sends when no run has finished yet", async () => {
    prismaMock.inactivityRun.findFirst.mockResolvedValue(null)

    await expect(processor(job())).resolves.toEqual({ status: "sent", code: null })
  })

  it("protects no one when there is no Plex server", async () => {
    jest.mocked(getActiveService).mockResolvedValue(null)
    await expect(processor(job())).resolves.toEqual({ status: "sent", code: null })
  })

  it("fails the row with no_transport when email is not set up, so the removal waits", async () => {
    jest.mocked(getEmailConfig).mockReturnValue(null)

    await expect(processor(job())).resolves.toEqual({ status: "failed", code: "no_transport" })
    expect(writes()).toEqual([{ status: "failed", code: "no_transport" }])
    expect(mockLog.error).toHaveBeenCalledWith("inactivity_notice.failed", undefined, { noticeId: "n1", userId: "u1", code: "no_transport", smtpCode: null })
  })

  it.each<[string, object, string]>([
    ["no address", { email: null }, "no_email"],
    ["a value that is not one address", { email: "plexuser" }, "invalid_email"],
    ["a disabled member", { disabledAt: new Date() }, "disabled"],
    ["a member who turned the emails off", { inactivityEmailsOff: true }, "unsubscribed"],
  ])("skips %s as handled, without a send", async (_name, patch, code) => {
    prismaMock.user.findUnique.mockResolvedValue({ name: "Sam", email: ADDRESS, disabledAt: null, inactivityEmailsOff: false, ...patch } as never)

    await expect(processor(job())).resolves.toEqual({ status: "skipped", code })
    expect(writes()).toEqual([{ status: "skipped", code, handledAt: MORNING }])
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("sends nothing when another job claimed the row first", async () => {
    jest.mocked(warningMessage).mockImplementation(async () => {
      status = "sending"
      return {}
    })

    await expect(processor(job())).resolves.toEqual({ status: "not_pending" })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("returns not_pending when a run marked the row while it was sent", async () => {
    jest.mocked(sendEmail).mockImplementation(async () => {
      status = "failed"
      return { ok: true, smtpCode: 250 }
    })

    await expect(processor(job())).resolves.toEqual({ status: "not_pending" })
    expect(mockLog.info).not.toHaveBeenCalledWith("inactivity_notice.sent", expect.anything())
  })

  it("skips the row as rejected when the server refuses the mailbox for good", async () => {
    jest.mocked(sendEmail).mockResolvedValue(failure({ kind: "rejected", smtpCode: 550, status: "5.1.1" }))

    await expect(processor(job())).resolves.toEqual({ status: "skipped", code: "rejected" })
    expect(writes().at(-1)).toEqual({ status: "skipped", code: "rejected", handledAt: MORNING })
  })

  it("fails the row with smtp_refused on a 554 at DATA, with no retry, and logs the failure", async () => {
    jest.mocked(sendEmail).mockResolvedValue(failure({ kind: "refused", smtpCode: 554, status: null, step: "DATA" }))

    await expect(processor(job())).resolves.toEqual({ status: "failed", code: "smtp_refused" })
    expect(writes().at(-1)).toEqual({ status: "failed", code: "smtp_refused" })
    expect(mockLog.error).toHaveBeenCalledWith("inactivity_notice.failed", undefined, { noticeId: "n1", userId: "u1", code: "smtp_refused", smtpCode: 554 })
  })

  it("releases the claim and throws the class and code on a 4xx, so the queue tries again", async () => {
    jest.mocked(sendEmail).mockResolvedValue(failure({}))

    const error = await rejection(processor(job()))
    expect(error.message).toBe("smtp_temporary 451")
    expect(status).toBe("pending")
    expect(writes().at(-1)).toEqual({ status: "pending" })
    expect(mockLog.warn).toHaveBeenCalledWith("inactivity_notice.retry", { noticeId: "n1", userId: "u1", kind: "temporary", smtpCode: 451, attempt: 1 })
    expect(mockLog.error).not.toHaveBeenCalled()
  })

  it("keeps the address out of the stored reason, the stack and the logs after a 4xx whose reply holds it", async () => {
    // The real transport classifies a nodemailer error whose reply and command both repeat the address
    jest.mocked(sendEmail).mockImplementation(jest.requireActual<{ sendEmail: typeof sendEmail }>("@/lib/email/transport").sendEmail)
    const reply = Object.assign(new Error(`Can't send mail - all recipients were rejected: 451 4.2.0 <${ADDRESS}> try later`), {
      code: "EENVELOPE",
      responseCode: 451,
      response: `451 4.2.0 <${ADDRESS}> try later`,
      command: `RCPT TO:<${ADDRESS}>`,
    })
    jest.mocked(createTransport).mockReturnValue({ sendMail: jest.fn().mockRejectedValue(reply) } as never)

    const error = await rejection(processor(job()))
    expect(createTransport).toHaveBeenCalledTimes(1)
    expect(error.message).toBe("smtp_temporary 451")
    expect(`${error.message}\n${error.stack}`).not.toContain("@")
    expect(error.cause).toBeUndefined()
    expect(status).toBe("pending")
    expect(JSON.stringify([mockLog.info.mock.calls, mockLog.warn.mock.calls, mockLog.error.mock.calls])).not.toContain("@")
    expect(mockLog.warn).toHaveBeenCalledWith("inactivity_notice.retry", expect.objectContaining({ kind: "temporary", smtpCode: 451 }))
  })

  it("throws a timeout for a retry, too", async () => {
    jest.mocked(sendEmail).mockResolvedValue(failure({ kind: "timeout", smtpCode: null, status: null, step: null }))

    await expect(processor(job({ attemptsMade: 1 }))).rejects.toThrow("smtp_timeout")
    expect(status).toBe("pending")
  })

  it.each<[SmtpFailure["kind"], number | null, string]>([
    ["temporary", 451, "smtp"],
    ["timeout", null, "timeout"],
  ])("fails the row on the last attempt after a %s failure", async (kind, smtpCode, code) => {
    jest.mocked(sendEmail).mockResolvedValue(failure({ kind, smtpCode }))

    await expect(processor(job({ attemptsMade: 2 }))).resolves.toEqual({ status: "failed", code })
    expect(writes().at(-1)).toEqual({ status: "failed", code })
    expect(mockLog.error).toHaveBeenCalledWith("inactivity_notice.failed", undefined, { noticeId: "n1", userId: "u1", code, smtpCode })
  })

  it("counts a job with no attempts option as on its last attempt", async () => {
    jest.mocked(sendEmail).mockResolvedValue(failure({}))

    await expect(processor({ ...job(), opts: {} })).resolves.toEqual({ status: "failed", code: "smtp" })
  })
})
