import { PrismaClient } from '../../lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

export function createE2EPrismaClient(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not defined')
  }
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  })
  return new PrismaClient({ adapter })
}
