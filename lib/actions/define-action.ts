/**
 * One wrapper for every Server Action: auth guard, Zod input, rate limit,
 * handler and error mapping, in that order.
 *
 * ## Overview
 *
 * ```
 * call(input)
 *   -> guard        public | member | admin | permission   (UNAUTHENTICATED, FORBIDDEN)
 *                   setup: a claim before setup completes, then admin   (SETUP_UNCLAIMED)
 *   -> entitlement  member: full | read       (NOT_ENTITLED)
 *   -> safeParse    the input schema          (VALIDATION + fieldErrors)
 *   -> consume()    the optional named limit  (RATE_LIMITED + retryAfterSec)
 *   -> handler      returns ok(data) or fail(code, message)
 *   -> catch        toActionError(error, fallbackError)   (INTERNAL, never error.message)
 * ```
 *
 * All of it runs in a request context (`lib/utils/log-context.ts`) with the
 * proxy's `x-request-id`, and the handler's with the caller's user id too, so
 * every log line and enqueued job carries them (P11.4).
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

import type { Session } from "next-auth"
import { unstable_rethrow } from "next/navigation"
import { z } from "zod"

import { hasEntitlement, NOT_ENTITLED_MESSAGE, type Entitlement } from "@/lib/actions/entitlement"
import { fail, toActionError, type ActionErrorCode, type ActionResult } from "@/lib/actions/result"
import { hasPermission, type Permission } from "@/lib/permissions"
import { getRequestId } from "@/lib/observability/request-context"
import { actionClientIp, consume, type LimitName } from "@/lib/security/rate-limit"
import { RATE_LIMITED_MESSAGE } from "@/lib/security/rate-limit-messages"
import { generateRequestId, runWithRequestContext } from "@/lib/utils/log-context"
import { getSession } from "@/lib/data/session"

type AuthLevel = "public" | "member" | "admin" | "setup" | "permission"

/**
 * What a handler receives besides its input. A setup action's `actor` is
 * `setup` during the first run and the admin's id after it.
 */
type ActionContext<A extends AuthLevel> = A extends "public"
  ? { session: Session | null }
  : A extends "setup"
    ? { session: Session | null; actor: string }
    : { session: Session; userId: string }

interface RateLimitOption {
  name: LimitName
  /** Key the limit by the caller's address (the default for public actions) or user id. */
  by?: "ip" | "user"
}

interface Definition<A extends AuthLevel, S extends z.ZodType | undefined, T, C extends string> {
  auth: A
  /** Permission actions only: the permission the caller must hold (admins hold all). */
  permission?: Permission
  /**
   * Member actions only: `full` needs an active membership, `read` also lets a
   * lapsed member through (FR-51). With Stripe gating off, every enabled user passes.
   */
  entitlement?: Entitlement
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
const SETUP_UNCLAIMED_MESSAGE = "Enter the setup code from the server log to continue setup."

/**
 * Marks a function this module built (P11.5). Every export of a `'use server'`
 * module must carry it (`__tests__/security/use-server-exports.test.ts`), so a
 * raw read helper can never be exposed as an endpoint again.
 */
const ACTION_BRAND = Symbol.for("__pmAction")

/** Carries what an action requires of its caller: its auth level, `permission:<name>` for a permission action. */
const ACTION_AUTH = Symbol.for("__pmActionAuth")

/** Carries an action's input schema, which the MCP endpoint turns into a tool's JSON Schema. */
const ACTION_INPUT = Symbol.for("__pmActionInput")

/**
 * Brands `fn` with a non-enumerable {@link ACTION_BRAND}; `formAction` brands its adapters too.
 * `auth` records the requirement, which `actionAuthOf` reads back.
 */
export function brandAction<F extends (...args: never[]) => unknown>(fn: F, auth?: string): F {
  Object.defineProperty(fn, ACTION_BRAND, { value: true, enumerable: false })
  if (auth) Object.defineProperty(fn, ACTION_AUTH, { value: auth, enumerable: false })
  return fn
}

/**
 * The requirement an action declared (`public`, `member`, `admin`, `setup` or
 * `permission:<name>`), or undefined for a function that is not one.
 */
export function actionAuthOf(value: unknown): string | undefined {
  if (typeof value !== "function") return undefined
  const auth = (value as unknown as Record<symbol, unknown>)[ACTION_AUTH]
  return typeof auth === "string" ? auth : undefined
}

/**
 * The input schema an action declared, null for an action that takes no
 * input, or undefined for a function that is not one built by {@link defineAction}.
 */
export function actionInputOf(value: unknown): z.ZodType | null | undefined {
  if (typeof value !== "function") return undefined
  const record = value as unknown as Record<symbol, unknown>
  if (!(ACTION_INPUT in record)) return undefined
  return (record[ACTION_INPUT] as z.ZodType | null) ?? null
}

/**
 * Whether `value` was built by {@link defineAction} or `formAction`.
 *
 * @internal
 */
export function isBrandedAction(value: unknown): boolean {
  return typeof value === "function" && (value as unknown as Record<symbol, unknown>)[ACTION_BRAND] === true
}

async function guard<A extends AuthLevel>(
  auth: A,
  permission: Permission | undefined,
  entitlement: Entitlement | undefined
): Promise<{ ok: true; ctx: ActionContext<A> } | { ok: false; result: ActionResult<never> }> {
  const session = await getSession()
  if (auth === "public") {
    return { ok: true, ctx: { session } as ActionContext<A> }
  }
  if (auth === "setup") {
    // Loaded here, so the many actions that never reach this path never load the setup modules
    const [{ getSetupStatus }, { requireSetupClaim }] = await Promise.all([
      import("@/lib/setup/status"),
      import("@/lib/setup/claim"),
    ])
    if (!(await getSetupStatus()).isComplete) {
      if (!(await requireSetupClaim()).ok) {
        return { ok: false, result: fail("SETUP_UNCLAIMED", SETUP_UNCLAIMED_MESSAGE) }
      }
      return { ok: true, ctx: { session, actor: "setup" } as ActionContext<A> }
    }
  }
  if (!session?.user?.id) {
    return { ok: false, result: fail("UNAUTHENTICATED", "Sign in to continue.") }
  }
  if ((auth === "admin" || auth === "setup") && !session.user.isAdmin) {
    return { ok: false, result: fail("FORBIDDEN", "Admins only.") }
  }
  if (auth === "permission" && !hasPermission(session.user, permission as Permission)) {
    return { ok: false, result: fail("FORBIDDEN", "You do not have access to this.") }
  }
  if (entitlement && !(await hasEntitlement(session.user.id, entitlement))) {
    return { ok: false, result: fail("NOT_ENTITLED", NOT_ENTITLED_MESSAGE) }
  }
  const ctx = auth === "setup" ? { session, actor: session.user.id } : { session, userId: session.user.id }
  return { ok: true, ctx: ctx as ActionContext<A> }
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
    const requestId = (await getRequestId()) ?? generateRequestId()
    return runWithRequestContext(requestId, undefined, () => run(requestId, raw))
  }

  const run = async (requestId: string, raw: unknown): Promise<ActionResult<T, C | ActionErrorCode>> => {
    try {
      const guarded = await guard(def.auth, def.permission, def.entitlement)
      if (!guarded.ok) return guarded.result
      const userId = (guarded.ctx as { session: Session | null }).session?.user?.id

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

      // The handler's log lines, and the jobs it enqueues, carry the id and the user
      return await runWithRequestContext(requestId, userId, () =>
        def.handler(input as Parameters<typeof def.handler>[0], guarded.ctx)
      )
    } catch (error) {
      unstable_rethrow(error)
      return toActionError(error, def.fallbackError ?? DEFAULT_FALLBACK)
    }
  }
  Object.defineProperty(action, ACTION_INPUT, { value: def.input ?? null, enumerable: false })
  return brandAction(action, def.auth === "permission" ? `permission:${def.permission}` : def.auth) as Action<S, T, C>
}

type AliasDefinition<A extends AuthLevel, S extends z.ZodType | undefined, T, C extends string> = Omit<
  Definition<A, S, T, C>,
  "auth" | "entitlement"
>

/** An action anyone may call; `ctx.session` may be null. */
export function publicAction<T, S extends z.ZodType | undefined = undefined, C extends string = ActionErrorCode>(
  def: AliasDefinition<"public", S, T, C>
): Action<S, T, C> {
  return defineAction({ ...def, auth: "public" })
}

/**
 * An action for a signed-in user; refuses with `UNAUTHENTICATED` otherwise, and
 * with `NOT_ENTITLED` when `entitlement` is set and the member falls short.
 */
export function memberAction<T, S extends z.ZodType | undefined = undefined, C extends string = ActionErrorCode>(
  def: AliasDefinition<"member", S, T, C> & Pick<Definition<"member", S, T, C>, "entitlement">
): Action<S, T, C> {
  return defineAction({ ...def, auth: "member" })
}

/** An action for an admin; refuses with `UNAUTHENTICATED` or `FORBIDDEN` otherwise. */
export function adminAction<T, S extends z.ZodType | undefined = undefined, C extends string = ActionErrorCode>(
  def: AliasDefinition<"admin", S, T, C>
): Action<S, T, C> {
  return defineAction({ ...def, auth: "admin" })
}

/**
 * An action for a signed-in user who holds `permission` (an admin holds every
 * permission, a role only its own); refuses with `UNAUTHENTICATED` or `FORBIDDEN` otherwise.
 */
export function permissionAction<T, S extends z.ZodType | undefined = undefined, C extends string = ActionErrorCode>(
  def: AliasDefinition<"permission", S, T, C> & { permission: Permission }
): Action<S, T, C> {
  return defineAction({ ...def, auth: "permission" })
}

/**
 * A first-run setup action (SEC-30): before setup completes, only a browser
 * holding the current claim (`lib/setup/claim.ts`) may call it
 * (`SETUP_UNCLAIMED` otherwise); after it, only an admin.
 */
export function setupAction<T, S extends z.ZodType | undefined = undefined, C extends string = ActionErrorCode>(
  def: AliasDefinition<"setup", S, T, C>
): Action<S, T, C> {
  return defineAction({ ...def, auth: "setup" })
}
