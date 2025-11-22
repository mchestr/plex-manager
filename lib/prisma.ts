import { PrismaClient } from '@prisma/client'

// Validate environment variables on startup
// This ensures required env vars are set before the app starts
if (typeof window === "undefined" && process.env.NODE_ENV !== 'test') {
  require('@/lib/security/env-validation')
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

