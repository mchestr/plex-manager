import { PrismaClient } from '../../lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { assertTestDatabaseUrl } from '../../lib/security/test-mode'

/**
 * Prisma client for E2E specs, global setup and fixtures. Refuses any database
 * whose name does not end in _test, and any DATABASE_URL that differs from
 * E2E_DATABASE_URL, so a spec can never reach the database `.env` points at.
 */
export function createE2EPrismaClient(): PrismaClient {
  const connectionString = assertTestDatabaseUrl(process.env.DATABASE_URL)
  if (connectionString !== process.env.E2E_DATABASE_URL) {
    throw new Error(
      'Refusing to use the database: DATABASE_URL must equal E2E_DATABASE_URL during E2E runs (playwright.config.ts sets it).'
    )
  }
  const adapter = new PrismaPg({ connectionString })
  return new PrismaClient({ adapter })
}
