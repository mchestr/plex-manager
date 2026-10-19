/**
 * The polled Rewind status (P2.17): which state wins, and that Redis is only
 * asked when nothing is running or completed.
 */

import { deriveRewindStatus, failureCode, infraCode } from '@/lib/rewind/rewind-status'

const ok = async () => ({ ok: true }) as const
const down = async () => ({ ok: false, code: 'REDIS_UNAVAILABLE' }) as const

describe('deriveRewindStatus', () => {
  it('matches the documented example', async () => {
    await expect(deriveRewindStatus({ wrapped: null, latest: null, infra: ok })).resolves.toEqual({
      state: 'none',
      errorCode: null,
      startedAt: null,
      hasCompleted: false,
    })
  })

  it('reports a queued run before anything else, and never asks Redis', async () => {
    const infra = jest.fn(down)

    const status = await deriveRewindStatus({
      wrapped: { status: 'completed', error: null },
      latest: { status: 'queued', error: null, startedAt: null },
      infra,
    })

    expect(status).toMatchObject({ state: 'queued', hasCompleted: true })
    expect(infra).not.toHaveBeenCalled()
  })

  it('reports a completed Rewind whatever Redis is doing', async () => {
    const status = await deriveRewindStatus({
      wrapped: { status: 'completed', error: null },
      latest: { status: 'failed', error: { code: 'TIMEOUT' }, startedAt: null },
      infra: down,
    })

    expect(status).toMatchObject({ state: 'completed', hasCompleted: true })
  })

  it('reports Redis being down over a failure', async () => {
    const status = await deriveRewindStatus({
      wrapped: { status: 'failed', error: null },
      latest: { status: 'failed', error: { code: 'TIMEOUT' }, startedAt: null },
      infra: down,
    })

    expect(status).toMatchObject({ state: 'unavailable', errorCode: 'REDIS_UNAVAILABLE' })
  })

  it('reports the latest failure by its code', async () => {
    const status = await deriveRewindStatus({
      wrapped: { status: 'failed', error: '{"code":"TIMEOUT"}' },
      latest: { status: 'failed', error: { code: 'UPSTREAM_ERROR' }, startedAt: null },
      infra: ok,
    })

    expect(status).toMatchObject({ state: 'failed', errorCode: 'UPSTREAM_ERROR' })
  })

  it('reads a row left by the in-request generation: generating as running, failed by its stored code', async () => {
    await expect(
      deriveRewindStatus({ wrapped: { status: 'generating', error: null }, latest: null, infra: ok })
    ).resolves.toMatchObject({ state: 'running' })
    await expect(
      deriveRewindStatus({ wrapped: { status: 'failed', error: 'Available users: alice' }, latest: null, infra: ok })
    ).resolves.toMatchObject({ state: 'failed', errorCode: 'GENERATION_FAILED' })
  })
})

describe('infraCode and failureCode', () => {
  it('split a status code into its FR-50 or failure meaning', () => {
    expect(infraCode('REDIS_NOT_CONFIGURED')).toBe('REDIS_NOT_CONFIGURED')
    expect(infraCode('TIMEOUT')).toBeNull()
    expect(failureCode('TIMEOUT')).toBe('TIMEOUT')
    expect(failureCode('REDIS_UNAVAILABLE')).toBe('GENERATION_FAILED')
    expect(failureCode(null)).toBe('GENERATION_FAILED')
  })
})
