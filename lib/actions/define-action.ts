/**
 * One wrapper for every Server Action: auth guard, Zod input, rate limit,
 * handler and error mapping, in that order.
 *
 * ## Overview
 *
 * ```
 * call(input)
 *   -> guard        public | member | admin   (UNAUTHENTICATED, FORBIDDEN)
 *   -> safeParse    the input schema          (VALIDATION + fieldErrors)
 *   -> consume()    the optional named limit  (RATE_LIMITED + retryAfterSec)
 *   -> handler      returns ok(data) or fail(code, message)
 *   -> catch        toActionError(error, fallbackError)   (INTERNAL, never error.message)
 * ```
 *
 * Nothing on this path throws, except Next's own control-flow errors
 * (`redirect()`, `notFound()`), which are rethrown so they keep working.
 *
 * The returned value is an async function, so `export const x = memberAction(...)`
 * is a valid export of a `'use server'` file.
 *
 * @example
 * ```ts
 * export const renameThing = memberAction({
 *   input: z.object({ name: z.string().min(1).max(80) }),
 *   handler: async ({ name }, { userId }) => {
 *     await prisma.thing.update({ where: { userId }, data: { name } })
 *     return ok(null)
 *   },
 * })
 * ```
 *
 * @module lib/actions/define-action
 */

import "server-only"

import { getServerSession, type Session } from "next-auth"
import { unstable_rethrow } from "next/navigation"
import { z } from "zod"

import { fail, toActionError, type ActionErrorCode, type ActionResult } from "@/lib/actions/result"
import { authOptions } from "@/lib/auth"
import { actionClientIp, consume, type LimitName } from "@/lib/security/rate-limit"
import { RATE_LIMITED_MESSAGE } from "@/lib/security/rate-limit-messages"

type AuthLevel = "public" | "member" | "admin"

/** What a handler receives besides its input. */
type ActionContext<A extends AuthLevel> = A extends "public"
  ? { session: Session | null }
  : { session: Session; userId: string }

interface RateLimitOption {
  name: LimitName
  /** Key the limit by the caller's address (the default for public actions) or user id. */
  by?: "ip" | "user"
}

interface Definition<A extends AuthLevel, S extends z.ZodType | undefined, T, C extends string> {
  auth: A
  input?: S
  rateLimit?: RateLimitOption
  /** Copy returned when the handler throws. */
  fallbackError?: string
  handler: (
    input: S extends z.ZodType ? z.output<S> : undefined,
    ctx: ActionContext<A>
  ) => Promise<ActionResult<T, C>>
}

/** The callable: no argument without a schema, an optional one when the schema accepts `undefined`. */
type Action<S extends z.ZodType | undefined, T, C extends string> = S extends z.ZodType
  ? undefined extends z.input<S>
    ? (input?: z.input<S>) => Promise<ActionResult<T, C | ActionErrorCode>>
    : (input: z.input<S>) => Promise<ActionResult<T, C | ActionErrorCode>>
  : () => Promise<ActionResult<T, C | ActionErrorCode>>

const DEFAULT_FALLBACK = "Something went wrong. Please try again."

async function guard<A extends AuthLevel>(
  auth: A
): Promise<{ ok: true; ctx: ActionContext<A> } | { ok: false; result: ActionResult<never> }> {
  const session = await getServerSession(authOptions)
  if (auth === "public") {
    return { ok: true, ctx: { session } as ActionContext<A> }
  }
  if (!session?.user?.id) {
    return { ok: false, result: fail("UNAUTHENTICATED", "Please sign in to continue.") }
  }
  if (auth === "admin" && !session.user.isAdmin) {
    return { ok: false, result: fail("FORBIDDEN", "Admins only.") }
  }
  return { ok: true, ctx: { session, userId: session.user.id } as ActionContext<A> }
}

/**
 * Builds a Server Action from its auth level, input schema and handler.
 * Modules use the {@link publicAction}, {@link memberAction} and
 * {@link adminAction} aliases.
 *
 * @internal
 */
export function defineAction<
  A extends AuthLevel,
  T,
  S extends z.ZodType | undefined = undefined,
  C extends string = ActionErrorCode,
>(def: Definition<A, S, T, C>): Action<S, T, C> {
  const action = async (raw?: unknown): Promise<ActionResult<T, C | ActionErrorCode>> => {
    try {
      const guarded = await guard(def.auth)
      if (!guarded.ok) return guarded.result

      let input: unknown = undefined
      if (def.input) {
        const parsed = def.input.safeParse(raw)
        if (!parsed.success) {
          const { fieldErrors } = z.flattenError(parsed.error)
          return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid input", {
            fieldErrors: fieldErrors as Record<string, string[]>,
          })
        }
        input = parsed.data
      }

      if (def.rateLimit) {
        const ctx = guarded.ctx as { session: Session | null }
        const byUser = (def.rateLimit.by ?? (def.auth === "public" ? "ip" : "user")) === "user"
        const subject = byUser && ctx.session?.user?.id ? ctx.session.user.id : await actionClientIp()
        const limit = await consume(def.rateLimit.name, subject)
        if (!limit.ok) {
          return fail("RATE_LIMITED", RATE_LIMITED_MESSAGE, { retryAfterSec: limit.retryAfterSec })
        }
      }

      return await def.handler(input as Parameters<typeof def.handler>[0], guarded.ctx)
    } catch (error) {
      unstable_rethrow(error)
      return toActionError(error, def.fallbackError ?? DEFAULT_FALLBACK)
    }
  }
  return action as Action<S, T, C>
}

type AliasDefinition<A extends AuthLevel, S extends z.ZodType | undefined, T, C extends string> = Omit<
  Definition<A, S, T, C>,
  "auth"
>

/** An action anyone may call; `ctx.session` may be null. */
export function publicAction<T, S extends z.ZodType | undefined = undefined, C extends string = ActionErrorCode>(
  def: AliasDefinition<"public", S, T, C>
): Action<S, T, C> {
  return defineAction({ ...def, auth: "public" })
}

/** An action for a signed-in user; refuses with `UNAUTHENTICATED` otherwise. */
export function memberAction<T, S extends z.ZodType | undefined = undefined, C extends string = ActionErrorCode>(
  def: AliasDefinition<"member", S, T, C>
): Action<S, T, C> {
  return defineAction({ ...def, auth: "member" })
}

/** An action for an admin; refuses with `UNAUTHENTICATED` or `FORBIDDEN` otherwise. */
export function adminAction<T, S extends z.ZodType | undefined = undefined, C extends string = ActionErrorCode>(
  def: AliasDefinition<"admin", S, T, C>
): Action<S, T, C> {
  return defineAction({ ...def, auth: "admin" })
}
