import { PrismaClient } from '@/lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { poolConfigFor, processRole } from '@/lib/db/pool-config'
import { pgAdapterOptionsFor } from '@/lib/db/schema-param'
import { ENCRYPTED_FIELDS } from '@/lib/db/encrypted-fields'
import { encryptionQuery } from '@/lib/db/encryption-extension'

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined
}

/**
 * Secret-bearing columns encrypted at rest (`lib/db/encrypted-fields.ts`).
 * The query extension (`lib/db/encryption-extension.ts`) encrypts them on
 * every write and decrypts them on every read, nested relations included, and
 * turns a value it cannot decrypt into null (P11.1). `where` clauses are never
 * transformed, so never filter on these columns.
 *
 * @internal
 */
export { ENCRYPTED_FIELDS }

/**
 * The app's Prisma client: the pg adapter with the role's pool limits and the
 * `?schema=` of `DATABASE_URL` (P11.6), plus the encryption extension.
 *
 * @internal
 */
export function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not defined')
  }
  const adapter = new PrismaPg(
    { connectionString, ...poolConfigFor(processRole()) },
    pgAdapterOptionsFor(connectionString)
  )

  return new PrismaClient({ adapter }).$extends({
    query: {
      $allModels: {
        $allOperations: encryptionQuery,
      },
    },
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

/**
 * The extended Prisma client type (with the encryption query extension applied).
 */
type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>

/**
 * Interactive-transaction client type for the extended client. Because `$extends`
 * changes the client type, the `tx` passed to `prisma.$transaction(async (tx) => ...)`
 * is NOT assignable to the base `Prisma.TransactionClient`. Helper functions that
 * receive a transaction client should type their parameter as this instead.
 *
 * Derived by removing the top-level-only client methods (the same shape Prisma's
 * own transaction client has), which avoids relying on `$transaction`'s
 * overloaded signature.
 */
export type PrismaTransactionClient = Omit<
  ExtendedPrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>
