/**
 * queueReportAlert: one alert job per new report, nothing without Redis, and
 * a queue that is down costs only the alert.
 */

import { queueReportAlert } from '@/lib/problem-reports/alerts'
import { isRedisConfigured } from '@/lib/queue/connection'
import { enqueueFromRequest } from '@/lib/queue/request-path'

jest.mock('@/lib/queue/connection', () => ({ isRedisConfigured: jest.fn() }))
jest.mock('@/lib/queue/request-path', () => ({ enqueueFromRequest: jest.fn() }))
const mockWarn = jest.fn()
jest.mock('@/lib/utils/logger', () => ({ createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: (...args: unknown[]) => mockWarn(...args), error: jest.fn() }) }))

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(isRedisConfigured).mockReturnValue(true)
  jest.mocked(enqueueFromRequest).mockResolvedValue({ ok: true, jobId: 'job-1' })
})

describe('queueReportAlert', () => {
  it('queues the alert job for the report, with retries', async () => {
    await queueReportAlert('r1')

    expect(enqueueFromRequest).toHaveBeenCalledWith('problem-report:notify', { reportId: 'r1' }, { attempts: 3, backoff: { type: 'exponential', delay: 60_000 } })
  })

  it('queues nothing without Redis', async () => {
    jest.mocked(isRedisConfigured).mockReturnValue(false)

    await queueReportAlert('r1')

    expect(enqueueFromRequest).not.toHaveBeenCalled()
  })

  it('logs a queue that is down, and does not throw', async () => {
    jest.mocked(enqueueFromRequest).mockResolvedValue({ ok: false, code: 'QUEUE_UNAVAILABLE' })

    await expect(queueReportAlert('r1')).resolves.toBeUndefined()
    expect(mockWarn).toHaveBeenCalledWith('Could not queue the problem report alert', { reportId: 'r1' })
  })
})
