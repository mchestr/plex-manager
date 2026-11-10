/**
 * @jest-environment node
 *
 * The member's problem report actions: report and follow need an active
 * membership; cancel needs only a session, so a lapsed member can still
 * withdraw their own report (docs/problem-reports.md). The service is mocked;
 * `lib/problem-reports/__tests__/service.test.ts` covers it.
 */

import { getServerSession } from 'next-auth'

import { askServerAdmin, cancelProblemReport, followProblemReport, reportProblem } from '@/actions/problem-reports'
import { hasEntitlement } from '@/lib/actions/entitlement'
import * as askAdmin from '@/lib/problem-reports/ask-admin'
import * as service from '@/lib/problem-reports/service'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('@/lib/actions/entitlement', () => ({
  hasEntitlement: jest.fn(),
  NOT_ENTITLED_MESSAGE: 'This needs an active membership.',
}))
jest.mock('@/lib/problem-reports/service', () => ({
  reportProblem: jest.fn(),
  followProblemReport: jest.fn(),
  cancelProblemReport: jest.fn(),
}))
jest.mock('@/lib/problem-reports/ask-admin', () => ({ askServerAdmin: jest.fn() }))

const REPORT_ID = 'c0ffee00000000000000000000'

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: 'member-1', isAdmin: false } })
  jest.mocked(hasEntitlement).mockResolvedValue(true)
})

describe('reportProblem', () => {
  it('needs an active membership', async () => {
    jest.mocked(hasEntitlement).mockResolvedValue(false)

    await expect(reportProblem({ ratingKey: '555', problem: 'wont_start' })).resolves.toMatchObject({ success: false, code: 'NOT_ENTITLED' })
    expect(service.reportProblem).not.toHaveBeenCalled()
  })

  it('says when the member joined an open report', async () => {
    jest.mocked(service.reportProblem).mockResolvedValue({ ok: true, outcome: 'joined', reportId: REPORT_ID })

    await expect(reportProblem({ ratingKey: '555', problem: 'wont_start' })).resolves.toEqual({
      success: true,
      data: { reportId: REPORT_ID, outcome: 'joined', answer: null, action: null },
    })
    expect(service.reportProblem).toHaveBeenCalledWith(expect.objectContaining({ userId: 'member-1', ratingKey: '555', problem: 'wont_start', note: null }))
  })

  it('answers missing episodes that have not aired without a report', async () => {
    const answer = { kind: 'NOT_AIRED' as const, season: 2, episode: 6, airsAt: '2026-11-14T02:00:00Z' }
    jest.mocked(service.reportProblem).mockResolvedValue({ ok: true, outcome: 'answered', reportId: null, answer })

    await expect(reportProblem({ ratingKey: '6999', problem: 'missing_episodes' })).resolves.toEqual({
      success: true,
      data: { reportId: null, outcome: 'answered', answer, action: null },
    })
  })

  it('says which fix started, and passes on a report the member sends anyway', async () => {
    jest.mocked(service.reportProblem).mockResolvedValue({ ok: true, outcome: 'fixing', reportId: REPORT_ID, action: 'BETTER_COPY' })

    await expect(reportProblem({ ratingKey: '555', problem: 'blurry', toAdmin: true })).resolves.toEqual({
      success: true,
      data: { reportId: REPORT_ID, outcome: 'fixing', answer: null, action: 'BETTER_COPY' },
    })
    expect(service.reportProblem).toHaveBeenCalledWith(expect.objectContaining({ problem: 'blurry', toAdmin: true }))
  })

  it('says when the member can report again after a rate limit', async () => {
    jest.mocked(service.reportProblem).mockResolvedValue({ ok: false, refusal: 'RATE_LIMITED', retryAfterSec: 120 })

    const result = await reportProblem({ ratingKey: '555', problem: 'wont_start' })

    expect(result).toMatchObject({ success: false, code: 'RATE_LIMITED' })
    expect(!result.success && result.error).toMatch(/^You've sent a lot of reports\. Try again /)
  })
})

describe('followProblemReport', () => {
  it('says a report that closed is closed', async () => {
    jest.mocked(service.followProblemReport).mockResolvedValue({ ok: false, refusal: 'NOT_FOUND' })

    await expect(followProblemReport({ reportId: REPORT_ID })).resolves.toEqual({ success: false, code: 'NOT_FOUND', error: 'This report is closed.' })
  })
})

describe('cancelProblemReport', () => {
  it('lets a member without an active membership cancel their own report', async () => {
    jest.mocked(hasEntitlement).mockResolvedValue(false)
    jest.mocked(service.cancelProblemReport).mockResolvedValue({ ok: true })

    await expect(cancelProblemReport({ reportId: REPORT_ID })).resolves.toEqual({ success: true, data: null })
    expect(service.cancelProblemReport).toHaveBeenCalledWith({ userId: 'member-1', reportId: REPORT_ID })
  })

  it('needs a session', async () => {
    jest.mocked(getServerSession).mockResolvedValue(null)

    await expect(cancelProblemReport({ reportId: REPORT_ID })).resolves.toMatchObject({ success: false, code: 'UNAUTHENTICATED' })
    expect(service.cancelProblemReport).not.toHaveBeenCalled()
  })

  it("says a report that can't be cancelled can't be cancelled now", async () => {
    jest.mocked(service.cancelProblemReport).mockResolvedValue({ ok: false, refusal: 'NOT_FOUND' })

    await expect(cancelProblemReport({ reportId: REPORT_ID })).resolves.toEqual({
      success: false,
      code: 'NOT_FOUND',
      error: "This report can't be cancelled now.",
    })
  })
})

describe('askServerAdmin', () => {
  it('puts the report back with the server admin', async () => {
    jest.mocked(askAdmin.askServerAdmin).mockResolvedValue({ ok: true, reportId: REPORT_ID })

    await expect(askServerAdmin({ reportId: REPORT_ID })).resolves.toEqual({ success: true, data: null })
    expect(askAdmin.askServerAdmin).toHaveBeenCalledWith({ userId: 'member-1', reportId: REPORT_ID })
  })

  it('needs an active membership, since the admins are alerted', async () => {
    jest.mocked(hasEntitlement).mockResolvedValue(false)

    await expect(askServerAdmin({ reportId: REPORT_ID })).resolves.toMatchObject({ success: false, code: 'NOT_ENTITLED' })
    expect(askAdmin.askServerAdmin).not.toHaveBeenCalled()
  })

  it("says a report that can't go back to the server admin can't now", async () => {
    jest.mocked(askAdmin.askServerAdmin).mockResolvedValue({ ok: false, refusal: 'NOT_FOUND' })

    await expect(askServerAdmin({ reportId: REPORT_ID })).resolves.toEqual({
      success: false,
      code: 'NOT_FOUND',
      error: "This report can't go to the server admin now.",
    })
  })
})
