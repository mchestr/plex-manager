/**
 * @jest-environment node
 */

/**
 * app/api/metrics/route.ts (BP-17, P11.4): 404 without METRICS_TOKEN, 401
 * with a wrong bearer, and a Prometheus body whose failed sources show as
 * `plex_manager_scrape_error` with status 200 and no error text.
 */

import { NextRequest } from 'next/server'

import { GET } from '@/app/api/metrics/route'
import { llmSpendSince } from '@/lib/llm/usage-totals'
import { getQueueStats } from '@/lib/queue/client'
import { isRedisConfigured, readyWithin } from '@/lib/queue/connection'

const mockHgetall = jest.fn()
const mockRewindCounts = jest.fn()

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/queue/client', () => ({ QUEUE_NAME: 'plex-wrapped', getQueueStats: jest.fn() }))
jest.mock('@/lib/queue/connection', () => ({
  getRequestPathRedis: jest.fn(() => ({ hgetall: mockHgetall })),
  isRedisConfigured: jest.fn(),
  readyWithin: jest.fn(),
}))
jest.mock('@/lib/queue/rewind-producers', () => ({
  getRewindQueue: jest.fn(() => ({ getJobCounts: mockRewindCounts })),
}))
jest.mock('@/lib/llm/usage-totals', () => ({ llmSpendSince: jest.fn() }))
jest.mock('@/lib/utils/server-zone', () => ({ serverZone: jest.fn(async () => 'UTC') }))

const TOKEN = 'metrics-token-0123456789abcdef'
const SECRET_ERROR = 'connect ECONNREFUSED redis.internal:6379 password=hunter2'

/** `name{labels}` -> value, from the exposition body; comments must be HELP or TYPE. */
function parse(body: string): Map<string, number> {
  const samples = new Map<string, number>()
  for (const line of body.trimEnd().split('\n')) {
    if (line.startsWith('#')) {
      expect(line).toMatch(/^# (HELP|TYPE) [a-z_][a-z0-9_]* .+$/)
      continue
    }
    const match = /^([a-z_][a-z0-9_]*(?:\{[^}]*\})?) (\S+)$/.exec(line)
    expect(match).not.toBeNull()
    samples.set(match![1], Number(match![2]))
  }
  return samples
}

function scrape(authorization?: string) {
  return GET(
    new NextRequest('http://localhost/api/metrics', { headers: authorization ? { authorization } : {} })
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.METRICS_TOKEN = TOKEN
  jest.mocked(isRedisConfigured).mockReturnValue(true)
  jest.mocked(readyWithin).mockResolvedValue(true)
  jest.mocked(getQueueStats).mockResolvedValue({
    waiting: 3, active: 1, completed: 10, failed: 2, delayed: 0, paused: 0, prioritized: 0,
  })
  mockRewindCounts.mockResolvedValue({ waiting: 120, active: 4, completed: 0, failed: 1, delayed: 0, prioritized: 0 })
  mockHgetall.mockResolvedValue({ 'plex-wrapped:stripe:webhook': '5', 'rewind-gen:rewind:generate:user': '2' })
  jest.mocked(llmSpendSince).mockResolvedValue({ wrapped: 1.25, chat: 0.5 })
})

afterAll(() => {
  delete process.env.METRICS_TOKEN
})

describe('/api/metrics auth', () => {
  it('answers 404 without METRICS_TOKEN configured', async () => {
    delete process.env.METRICS_TOKEN

    expect((await scrape(`Bearer ${TOKEN}`)).status).toBe(404)
  })

  it.each([undefined, 'Bearer wrong-token', `Basic ${TOKEN}`, TOKEN])('answers 401 to authorization %s', async (auth) => {
    const response = await scrape(auth)

    expect(response.status).toBe(401)
    expect(response.headers.get('WWW-Authenticate')).toBe('Bearer')
    expect(getQueueStats).not.toHaveBeenCalled()
  })
})

describe('/api/metrics body', () => {
  it('reports queue depth, job failures, LLM spend and the process in the 0.0.4 text format', async () => {
    const response = await scrape(`Bearer ${TOKEN}`)

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/plain; version=0.0.4; charset=utf-8')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    const samples = parse(await response.text())
    expect(samples.get('plex_manager_queue_jobs{queue="plex-wrapped",state="waiting"}')).toBe(3)
    expect(samples.get('plex_manager_queue_jobs{queue="rewind-gen",state="waiting"}')).toBe(120)
    expect(samples.get('plex_manager_job_failures_total{queue="plex-wrapped",job="stripe:webhook"}')).toBe(5)
    expect(samples.get('plex_manager_job_failures_total{queue="rewind-gen",job="rewind:generate:user"}')).toBe(2)
    expect(samples.get('plex_manager_llm_spend_usd{purpose="wrapped",period="day"}')).toBe(1.25)
    expect(samples.get('plex_manager_llm_spend_usd{purpose="chat",period="month"}')).toBe(0.5)
    expect(samples.get('plex_manager_scrape_error{source="queues"}')).toBe(0)
    expect(samples.get('process_resident_memory_bytes')).toBeGreaterThan(0)
    expect(samples.has('plex_manager_event_loop_delay_p99_seconds')).toBe(true)
    expect([...samples.keys()].some((key) => key.startsWith('plex_manager_build_info{version="'))).toBe(true)
  })

  it('reports a failed source as scrape_error with status 200 and no error text', async () => {
    mockHgetall.mockRejectedValue(new Error(SECRET_ERROR))

    const response = await scrape(`Bearer ${TOKEN}`)
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(body).not.toMatch(/ECONNREFUSED|hunter2|redis\.internal/)
    const samples = parse(body)
    expect(samples.get('plex_manager_scrape_error{source="job_failures"}')).toBe(1)
    expect(samples.get('plex_manager_scrape_error{source="queues"}')).toBe(0)
    expect(body).not.toContain('plex_manager_job_failures_total')
  })

  it('times a hanging source out after 2 s', async () => {
    jest.useFakeTimers()
    try {
      mockRewindCounts.mockReturnValue(new Promise(() => {}))

      const pending = scrape(`Bearer ${TOKEN}`)
      await jest.advanceTimersByTimeAsync(2000)
      const samples = parse(await (await pending).text())

      expect(samples.get('plex_manager_scrape_error{source="queues"}')).toBe(1)
      expect(samples.get('plex_manager_scrape_error{source="job_failures"}')).toBe(0)
    } finally {
      jest.useRealTimers()
    }
  })

  it('leaves the queue sources out without Redis', async () => {
    jest.mocked(isRedisConfigured).mockReturnValue(false)

    const samples = parse(await (await scrape(`Bearer ${TOKEN}`)).text())

    expect(samples.has('plex_manager_scrape_error{source="queues"}')).toBe(false)
    expect(samples.get('plex_manager_scrape_error{source="llm_spend"}')).toBe(0)
  })
})
