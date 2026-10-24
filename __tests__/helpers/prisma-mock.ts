/**
 * Typed Prisma mock for Jest.
 *
 * Every model delegate and client method is a deep `jest.fn()` typed from the
 * generated `PrismaClient`, so `prismaMock.user.findUnique.mockResolvedValue(...)`
 * is checked against the real return shape. Use the factories in
 * `./factories` to build full rows from partial overrides.
 *
 * The base `PrismaClient` is mocked rather than the extended client from
 * `lib/prisma.ts`: the encryption extension changes no model method
 * signature, and the `$extends` type can exceed TypeScript's depth limit.
 *
 * @example
 * ```ts
 * import { mockReset } from 'jest-mock-extended'
 * import { prismaMock } from '@/__tests__/helpers/prisma-mock'
 *
 * jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
 *
 * beforeEach(() => mockReset(prismaMock))
 * ```
 */
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended'
import type { Prisma, PrismaClient } from '@/lib/generated/prisma/client'

export const prismaMock: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>()

export const prismaModule = { prisma: prismaMock }

/**
 * Types a hand-built transaction client for a `$transaction` callback. Only
 * the delegates the test stubs exist at runtime; the code under test must
 * not reach for anything else.
 */
export function asTransactionClient(partial: object): Prisma.TransactionClient {
  return partial as unknown as Prisma.TransactionClient
}

/**
 * One delegate of {@link prismaMock} by its client name (`"lLMUsage"`), with
 * its methods as plain `jest.Mock`s, for tests that back every model the
 * same way.
 */
export function delegateMock(name: string): Record<string, jest.Mock> {
  return (prismaMock as unknown as Record<string, Record<string, jest.Mock>>)[name]
}
