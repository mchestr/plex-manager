import { PrismaClient } from '@/lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not defined')
  }

  // Prisma v7 with the new client-module generator requires an adapter for PostgreSQL
  // The current schema is configured for PostgreSQL, so SQLite support would require
  // regenerating the client with a different provider configuration
  if (
    !process.env.DATABASE_URL.startsWith('postgres://') &&
    !process.env.DATABASE_URL.startsWith('postgresql://')
  ) {
    throw new Error(
      'Only PostgreSQL is supported with the current Prisma configuration. ' +
      'DATABASE_URL must start with postgres:// or postgresql://'
    )
  }

  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  })
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
