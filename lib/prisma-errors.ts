import { Prisma } from "@/lib/generated/prisma/client"
import { z } from "zod"

/**
 * Where the pg driver adapter reports a unique-constraint violation (P2002):
 * `{ index: "User_email_key" }`, or `{ fields: ["email"] }` when PostgreSQL
 * names no constraint. Prisma 7 with `@prisma/adapter-pg` sends no
 * `meta.target`; this shape is undocumented, so the classic one is accepted too.
 */
const driverAdapterMetaSchema = z.object({
  driverAdapterError: z.object({
    cause: z.object({
      constraint: z.object({
        index: z.string().optional(),
        fields: z.array(z.string()).optional(),
      }),
    }),
  }),
})

/** Prisma's classic P2002 shape: the columns, or the constraint name. */
const targetMetaSchema = z.object({
  target: z.union([z.array(z.string()), z.string()]),
})

/**
 * True when `error` is a unique-constraint violation (P2002) on `User.email`.
 *
 * Callers use it around a `User` write that stores an email address, to retry
 * the write without the address when another row already holds it.
 *
 * @example
 * ```ts
 * try {
 *   await prisma.user.create({ data: { name, email } })
 * } catch (error) {
 *   if (!isUniqueEmailConflict(error)) throw error
 *   await prisma.user.create({ data: { name } })
 * }
 * ```
 */
export function isUniqueEmailConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false
  }

  const adapter = driverAdapterMetaSchema.safeParse(error.meta)
  if (adapter.success) {
    const { index, fields } = adapter.data.driverAdapterError.cause.constraint
    return index === "User_email_key" || fields?.includes("email") === true
  }

  const classic = targetMetaSchema.safeParse(error.meta)
  if (classic.success) {
    const { target } = classic.data
    return Array.isArray(target) ? target.includes("email") : target === "User_email_key"
  }

  return false
}
