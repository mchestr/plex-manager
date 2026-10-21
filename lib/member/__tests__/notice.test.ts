/**
 * The member shell's one notice (P6.3, ui-design-system 6.1): the priority
 * order, nothing from Stripe while it is off, and home hiding the Rewind one.
 */

import { mockReset } from 'jest-mock-extended'

import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { buildConfig } from '@/__tests__/helpers/factories'
import { getPrometheusStatus } from '@/actions/prometheus-status'
import { getMemberNotice } from '@/lib/member/notice'
import { noticeShownOn, pickNotice, type MemberNotice } from '@/lib/member/notice-rules'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/actions/prometheus-status', () => ({ getPrometheusStatus: jest.fn() }))

const mockStatus = getPrometheusStatus as jest.MockedFunction<typeof getPrometheusStatus>

type Subscription = Awaited<ReturnType<typeof prismaMock.subscription.findUnique>>

function prometheus(overallStatus: 'operational' | 'issues' | 'down' | 'unknown') {
  mockStatus.mockResolvedValue({
    success: true,
    data: { isConfigured: true, serviceName: 'Plex', segments: [], overallStatus },
  })
}

function stripe(enabled: boolean, subscription: { status: string; plexInviteStatus: string | null } | null) {
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ stripeEnabled: enabled }))
  prismaMock.subscription.findUnique.mockResolvedValue(subscription as Subscription)
}

beforeEach(() => {
  mockReset(prismaMock)
  mockStatus.mockReset()
  prometheus('operational')
})

describe('pickNotice', () => {
  const pastDue: MemberNotice = { kind: 'past-due' }
  const invite: MemberNotice = { kind: 'pending-invite' }
  const outage: MemberNotice = { kind: 'outage', serviceName: 'Plex' }
  const rewind: MemberNotice = { kind: 'rewind-ready', year: 2026 }

  it.each([
    [[rewind, outage, invite, pastDue], pastDue],
    [[rewind, outage, invite], invite],
    [[rewind, outage], outage],
    [[null, rewind], rewind],
    [[null, null], null],
  ])('picks the highest of %j', (candidates, expected) => {
    expect(pickNotice(candidates)).toEqual(expected)
  })
})

describe('noticeShownOn', () => {
  it('hides the Rewind notice on home only', () => {
    const rewind: MemberNotice = { kind: 'rewind-ready', year: 2026 }
    expect(noticeShownOn(rewind, '/')).toBe(false)
    expect(noticeShownOn(rewind, '/discord/link')).toBe(true)
    expect(noticeShownOn({ kind: 'past-due' }, '/')).toBe(true)
  })
})

describe('getMemberNotice', () => {
  it('shows past due over the pending invite and an outage', async () => {
    stripe(true, { status: 'PAST_DUE', plexInviteStatus: 'pending' })
    prometheus('down')

    await expect(getMemberNotice('u1')).resolves.toEqual({ kind: 'past-due' })
  })

  it('shows the pending invite over an outage', async () => {
    stripe(true, { status: 'ACTIVE', plexInviteStatus: 'pending' })
    prometheus('down')

    await expect(getMemberNotice('u1')).resolves.toEqual({ kind: 'pending-invite' })
  })

  it('shows nothing from the subscription while Stripe is off', async () => {
    stripe(false, { status: 'PAST_DUE', plexInviteStatus: 'pending' })

    await expect(getMemberNotice('u1')).resolves.toBeNull()
    expect(prismaMock.subscription.findUnique).not.toHaveBeenCalled()
  })

  it('shows an outage only when Prometheus reports down', async () => {
    stripe(false, null)
    prometheus('down')
    await expect(getMemberNotice('u1')).resolves.toEqual({ kind: 'outage', serviceName: 'Plex' })

    prometheus('issues')
    await expect(getMemberNotice('u1')).resolves.toBeNull()
  })

  it('shows nothing when the status cannot be read', async () => {
    stripe(true, null)
    mockStatus.mockResolvedValue({ success: false, code: 'INTERNAL', error: 'Failed to load the server status' })

    await expect(getMemberNotice('u1')).resolves.toBeNull()
  })
})
