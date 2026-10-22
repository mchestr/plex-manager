/**
 * @jest-environment node
 */

import { checkEligibility, type EligibilityDeps, type EligibilityInput } from '@/lib/wrapped/pipeline/eligibility'
import { RewindGenerationError } from '@/lib/wrapped/pipeline/generation-error'

const TAUTULLI = { url: 'http://tautulli', apiKey: 'key' }

function input(overrides: { kind?: EligibilityInput['kind']; member?: Partial<EligibilityInput['member']>; config?: Partial<EligibilityInput['config']> } = {}): EligibilityInput {
  return {
    kind: overrides.kind ?? 'member',
    member: { userId: 'user-1', plexUserId: 'plex-1', isAdmin: false, ...overrides.member },
    config: { rewindEnabled: true, rewindAudience: 'all', rewindIncludeManagedUsers: false, stripeEnabled: false, ...overrides.config },
    tautulli: TAUTULLI,
  }
}

function deps(overrides: Partial<EligibilityDeps> = {}): EligibilityDeps {
  return {
    checkInfra: jest.fn(async () => ({ ok: true as const })),
    findTautulliUser: jest.fn(async () => ({ ok: true as const, user: { user_id: 1, username: 'member', is_restricted: 0 } })),
    accessLevel: jest.fn(async () => 'full' as const),
    ...overrides,
  }
}

describe('checkEligibility', () => {
  it('passes an entitled member in the audience', async () => {
    await expect(checkEligibility(input(), deps())).resolves.toEqual({ ok: true })
  })

  it('skips REDIS_UNAVAILABLE first, for admins too', async () => {
    const d = deps({ checkInfra: jest.fn(async () => ({ ok: false as const, code: 'REDIS_UNAVAILABLE' as const })) })
    await expect(checkEligibility(input({ kind: 'admin' }), d)).resolves.toEqual({ ok: false, reason: 'REDIS_UNAVAILABLE' })
    expect(d.findTautulliUser).not.toHaveBeenCalled()
  })

  it('skips REWIND_DISABLED and NOT_IN_AUDIENCE, which admin regenerations bypass', async () => {
    await expect(checkEligibility(input({ config: { rewindEnabled: false } }), deps())).resolves.toEqual({ ok: false, reason: 'REWIND_DISABLED' })
    await expect(checkEligibility(input({ config: { rewindAudience: 'admins' } }), deps())).resolves.toEqual({
      ok: false,
      reason: 'NOT_IN_AUDIENCE',
    })
    await expect(checkEligibility(input({ config: { rewindAudience: 'admins' }, member: { isAdmin: true } }), deps())).resolves.toEqual({ ok: true })
    await expect(
      checkEligibility(input({ kind: 'admin', config: { rewindEnabled: false, rewindAudience: 'admins' } }), deps())
    ).resolves.toEqual({ ok: true })
  })

  it('never bypasses identity: NO_PLEX_IDENTITY and TAUTULLI_USER_NOT_FOUND hold for admin regenerations', async () => {
    await expect(checkEligibility(input({ kind: 'admin', member: { plexUserId: null } }), deps())).resolves.toEqual({
      ok: false,
      reason: 'NO_PLEX_IDENTITY',
    })
    const missing = deps({ findTautulliUser: jest.fn(async () => ({ ok: false as const, code: 'TAUTULLI_USER_NOT_FOUND' as const, candidates: 3 })) })
    await expect(checkEligibility(input({ kind: 'admin' }), missing)).resolves.toEqual({ ok: false, reason: 'TAUTULLI_USER_NOT_FOUND' })
  })

  it('throws a retryable UPSTREAM_ERROR when Tautulli fails, and NOT_CONFIGURED without one', async () => {
    const down = deps({ findTautulliUser: jest.fn(async () => ({ ok: false as const, code: 'TAUTULLI_ERROR' as const })) })
    await expect(checkEligibility(input(), down)).rejects.toMatchObject({ code: 'UPSTREAM_ERROR', retryable: true })
    await expect(checkEligibility({ ...input(), tautulli: null }, deps())).rejects.toBeInstanceOf(RewindGenerationError)
  })

  it('skips MANAGED_ACCOUNT unless managed accounts are included', async () => {
    const managed = deps({ findTautulliUser: jest.fn(async () => ({ ok: true as const, user: { user_id: 1, is_restricted: 1 } })) })
    await expect(checkEligibility(input(), managed)).resolves.toEqual({ ok: false, reason: 'MANAGED_ACCOUNT' })
    await expect(checkEligibility(input({ config: { rewindIncludeManagedUsers: true } }), managed)).resolves.toEqual({ ok: true })
  })

  it('checks entitlement only with Stripe on, and never bypasses it for admins', async () => {
    const lapsed = deps({ accessLevel: jest.fn(async () => 'lapsed' as const) })
    await expect(checkEligibility(input(), lapsed)).resolves.toEqual({ ok: true })
    expect(lapsed.accessLevel).not.toHaveBeenCalled()
    await expect(checkEligibility(input({ config: { stripeEnabled: true } }), lapsed)).resolves.toEqual({ ok: false, reason: 'NOT_ENTITLED' })
    await expect(checkEligibility(input({ kind: 'admin', config: { stripeEnabled: true } }), lapsed)).resolves.toEqual({
      ok: false,
      reason: 'NOT_ENTITLED',
    })
    await expect(checkEligibility(input({ config: { stripeEnabled: true } }), deps())).resolves.toEqual({ ok: true })
  })

  it('generates a member under payload audience all while rewindAudience is admins, and skips them under config (P7.8)', async () => {
    const admins = { config: { rewindAudience: 'admins' } }
    await expect(checkEligibility({ ...input(admins), audience: 'all' }, deps())).resolves.toEqual({ ok: true })
    await expect(checkEligibility({ ...input(admins), audience: 'config' }, deps())).resolves.toEqual({
      ok: false,
      reason: 'NOT_IN_AUDIENCE',
    })
    await expect(checkEligibility(input(admins), deps())).resolves.toEqual({ ok: false, reason: 'NOT_IN_AUDIENCE' })
  })

  it('still skips REWIND_DISABLED under payload audience all', async () => {
    await expect(checkEligibility({ ...input({ config: { rewindEnabled: false } }), audience: 'all' }, deps())).resolves.toEqual({
      ok: false,
      reason: 'REWIND_DISABLED',
    })
  })
})
