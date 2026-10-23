/**
 * @jest-environment node
 */

/**
 * Tests for app/api/health/route.ts (P4.17, BP-16, BP-17): the readiness body
 * checks the database and Redis within 2 s each and answers 503 when a
 * configured dependency fails; `?probe=live` touches neither; no body carries
 * error text.
 */

import { GET } from '@/app/api/health/route'
import { getRequestPathRedis, isRedisConfigured, readyWithin } from '@/lib/queue/connection'
import { NextRequest } from 'next/server'
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { buildConfig } from '@/__tests__/helpers/factories'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

const mockPing = jest.fn()

jest.mock('@/lib/queue/connection', () => ({
  getRequestPathRedis: jest.fn(() => ({ ping: mockPing })),
  isRedisConfigured: jest.fn(),
  readyWithin: jest.fn(),
}))

const SECRET_ERROR = 'connect ECONNREFUSED db.internal.example:5432 password=hunter2'

function healthRequest(query = '') {
  return new NextRequest(`http://localhost/api/health${query}`)
}

async function body(response: Response): Promise<string> {
  return response.text()
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  prismaMock.config.findUnique.mockResolvedValue(buildConfig())
  jest.mocked(isRedisConfigured).mockReturnValue(true)
  jest.mocked(readyWithin).mockResolvedValue(true)
  mockPing.mockResolvedValue('PONG')
})

describe('GET /api/health', () => {
  it('answers 200 when the database and Redis are up', async () => {
    const response = await GET(healthRequest())

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({ status: 'ok', role: 'all', checks: { database: 'ok', redis: 'ok' } })
    expect(prismaMock.config.findUnique).toHaveBeenCalledWith({ where: { id: 'config' }, select: { id: true } })
    expect(mockPing).toHaveBeenCalledTimes(1)
  })

  it('counts a database with no Config row yet as up', async () => {
    prismaMock.config.findUnique.mockResolvedValue(null)

    expect((await GET(healthRequest())).status).toBe(200)
  })

  it('answers 503 without the error text when the database fails', async () => {
    prismaMock.config.findUnique.mockRejectedValue(new Error(SECRET_ERROR))

    const response = await GET(healthRequest())
    const text = await body(response)

    expect(response.status).toBe(503)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(JSON.parse(text)).toEqual({ status: 'fail', role: 'all', checks: { database: 'fail', redis: 'ok' } })
    expect(text).not.toMatch(/ECONNREFUSED|example|hunter2/)
  })

  it('answers 503 without the error text when a configured Redis fails its ping', async () => {
    mockPing.mockRejectedValue(new Error(SECRET_ERROR))

    const response = await GET(healthRequest())
    const text = await body(response)

    expect(response.status).toBe(503)
    expect(JSON.parse(text)).toEqual({ status: 'fail', role: 'all', checks: { database: 'ok', redis: 'fail' } })
    expect(text).not.toMatch(/ECONNREFUSED|example|hunter2/)
  })

  it('answers 503 when a configured Redis never becomes ready', async () => {
    jest.mocked(readyWithin).mockResolvedValue(false)

    const response = await GET(healthRequest())

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ status: 'fail', role: 'all', checks: { database: 'ok', redis: 'fail' } })
    expect(mockPing).not.toHaveBeenCalled()
  })

  it('answers 200 with Redis not_configured when REDIS_URL is unset', async () => {
    jest.mocked(isRedisConfigured).mockReturnValue(false)

    const response = await GET(healthRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok', role: 'all', checks: { database: 'ok', redis: 'not_configured' } })
    expect(getRequestPathRedis).not.toHaveBeenCalled()
  })

  it('names the container role (P11.3)', async () => {
    process.env.PROCESS_ROLE = 'worker'
    try {
      const response = await GET(healthRequest('?probe=live'))

      expect(await response.json()).toEqual({ status: 'ok', role: 'worker' })
    } finally {
      delete process.env.PROCESS_ROLE
    }
  })

  it('answers the liveness probe with 200 while the database and Redis are both down', async () => {
    prismaMock.config.findUnique.mockRejectedValue(new Error(SECRET_ERROR))
    mockPing.mockRejectedValue(new Error(SECRET_ERROR))

    const response = await GET(healthRequest('?probe=live'))

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({ status: 'ok', role: 'all' })
    expect(prismaMock.config.findUnique).not.toHaveBeenCalled()
    expect(getRequestPathRedis).not.toHaveBeenCalled()
  })

  describe('with fake timers', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it('fails a check that hangs past 2 s instead of waiting for it', async () => {
      prismaMock.config.findUnique.mockReturnValue(new Promise(() => {}) as never)
      mockPing.mockReturnValue(new Promise(() => {}))

      const pending = GET(healthRequest())
      await jest.advanceTimersByTimeAsync(1999)
      let settled = false
      void pending.then(() => {
        settled = true
      })
      await Promise.resolve()
      expect(settled).toBe(false)

      await jest.advanceTimersByTimeAsync(1)
      const response = await pending

      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({ status: 'fail', role: 'all', checks: { database: 'fail', redis: 'fail' } })
    })
  })
})
