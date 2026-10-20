import { afterRewindCompleted, onRewindCompleted, type CompletedRewind } from '@/lib/wrapped/pipeline/after-complete'
import { memberSerial } from '@/lib/wrapped/pipeline/load-context'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const REWIND: CompletedRewind = {
  userId: 'user-1', year: 2026, wrappedId: 'w1', generationId: 'g1', factsHash: 'f', edition: 'full', first: true,
}

describe('afterRewindCompleted', () => {
  it('runs every registered hook, and a failing hook never stops the others', async () => {
    const prewarm = jest.fn(async () => {
      throw new Error('card render failed')
    })
    const notify = jest.fn(async () => undefined)
    onRewindCompleted('prewarm', prewarm)
    onRewindCompleted('notify', notify)

    await expect(afterRewindCompleted(REWIND)).resolves.toBeUndefined()

    expect(prewarm).toHaveBeenCalledWith(REWIND)
    expect(notify).toHaveBeenCalledWith(REWIND)
  })
})

describe('memberSerial (design G10)', () => {
  it('is 4 Crockford base32 characters, stable for the member and year', () => {
    const serial = memberSerial('key', 'user-1', 2026)
    expect(serial).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}$/)
    expect(memberSerial('key', 'user-1', 2026)).toBe(serial)
    expect(new Set(['user-2', 'user-3', 'user-4'].map((id) => memberSerial('key', id, 2026))).size).toBeGreaterThan(1)
  })
})
