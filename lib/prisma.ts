import { PrismaClient } from '@/lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { decryptSecret, encryptSecret } from '@/lib/security/crypto'

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined
}

/**
 * Secret-bearing columns to encrypt at rest, keyed by Prisma model name.
 *
 * A single Prisma query extension (below) transparently encrypts these on write
 * and decrypts them on read, so no call site needs to know about encryption.
 * Encryption is a no-op unless ENCRYPTION_KEY is set, and reads of legacy
 * plaintext pass through unchanged — see lib/security/crypto.ts.
 *
 * IMPORTANT: the extension transforms write `data`/`create`/`update` payloads and
 * decrypts read results, but NOT `where` clauses. Encryption uses a random IV per
 * write (GCM), so ciphertext is non-deterministic — a plaintext equality filter on
 * an encrypted column can never match. Never filter these fields in a `where`;
 * match on non-secret columns and compare the decrypted value in application code.
 */
export const ENCRYPTED_FIELDS: Record<string, readonly string[]> = {
  User: ['plexAuthToken'],
  PlexServer: ['token'],
  JellyfinServer: ['apiKey'],
  Tautulli: ['apiKey'],
  Overseerr: ['apiKey'],
  Sonarr: ['apiKey'],
  Radarr: ['apiKey'],
  LLMProvider: ['apiKey'],
  DiscordIntegration: ['clientSecret', 'botToken'],
  DiscordConnection: ['accessToken', 'refreshToken'],
  Config: ['stripeSecretKey', 'stripeWebhookSecret'],
}

/** Encrypt any configured secret fields present on a write-args `data` object. */
function encryptData(fields: readonly string[], data: unknown): void {
  if (!data || typeof data !== 'object') return
  const record = data as Record<string, unknown>
  for (const field of fields) {
    const value = record[field]
    if (typeof value === 'string') {
      record[field] = encryptSecret(value)
    } else if (
      // Prisma update operator form, e.g. { set: "..." }.
      value &&
      typeof value === 'object' &&
      typeof (value as Record<string, unknown>).set === 'string'
    ) {
      const op = value as Record<string, unknown>
      op.set = encryptSecret(op.set as string)
    }
  }
}

/** Decrypt any configured secret fields present on a read result row. */
function decryptRow(fields: readonly string[], row: unknown): void {
  if (!row || typeof row !== 'object') return
  const record = row as Record<string, unknown>
  for (const field of fields) {
    const value = record[field]
    if (typeof value === 'string') {
      record[field] = decryptSecret(value)
    }
  }
}

function createPrismaClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not defined')
  }
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  })

  return new PrismaClient({ adapter }).$extends({
    query: {
      $allModels: {
        async $allOperations({ model, args, query }) {
          const fields = model ? ENCRYPTED_FIELDS[model] : undefined
          if (!fields) {
            return query(args)
          }

          // Encrypt secrets in write payloads before they reach the DB.
          const writeArgs = args as {
            data?: unknown
            create?: unknown
            update?: unknown
          }
          if (writeArgs.data !== undefined) {
            if (Array.isArray(writeArgs.data)) {
              // createMany
              for (const entry of writeArgs.data) encryptData(fields, entry)
            } else {
              encryptData(fields, writeArgs.data)
            }
          }
          // upsert carries separate create/update payloads.
          if (writeArgs.create !== undefined) encryptData(fields, writeArgs.create)
          if (writeArgs.update !== undefined) encryptData(fields, writeArgs.update)

          const result = await query(args)

          // Decrypt secrets in read/returned rows.
          if (Array.isArray(result)) {
            for (const row of result) decryptRow(fields, row)
          } else {
            decryptRow(fields, result)
          }

          return result
        },
      },
    },
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

/**
 * The extended Prisma client type (with the encryption query extension applied).
 */
export type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>

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
