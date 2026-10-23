/**
 * The first-run claim (SEC-30): until setup completes, only a browser that
 * entered the setup code may run a setup action.
 *
 * ## Flow
 *
 * ```
 * boot (setup incomplete, no SETUP_TOKEN)
 *   -> issueSetupCode(): new code, SHA-256 in Setup.claimCodeHash,
 *      "Setup code: K7QM-4WZD-P2HX" on stdout
 * claimServer({ code })            (actions/setup-claim.ts, 5 tries a minute per IP)
 *   -> redeemSetupCode(): digests compared with timingSafeEqual; a code is
 *      cleared once used, SETUP_TOKEN stays valid while it is set
 *   -> Setup.claimId = random, cookie pm-setup = signValue({ claimId }, "setup-claim", 12 h)
 * every setup action                (defineAction's auth: "setup")
 *   -> requireSetupClaim(): the cookie's claimId equals Setup.claimId
 * completeSetup
 *   -> claimId and claimCodeHash cleared, clearSetupClaimCookie()
 * ```
 *
 * Every boot while setup is incomplete issues a new code, so the newest one in
 * the log is valid. A new code does not end a claim already made.
 *
 * @module lib/setup/claim
 */

import "server-only"

import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"
import { z } from "zod"

import { getEnv, SETUP_TOKEN_MIN_LENGTH, usesSecureCookies } from "@/lib/env"
import { prisma } from "@/lib/prisma"
import { signValue, verifyValue } from "@/lib/security/signed-cookie"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("SETUP_CLAIM")

const SETUP_CLAIM_COOKIE = "pm-setup"
const PURPOSE = "setup-claim"
const CLAIM_TTL_SEC = 12 * 60 * 60

/** `[A-HJ-NP-Z2-9]`: no I, O, 0 or 1 to misread. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const CODE_LENGTH = 12

const claimCookieSchema = z.object({ claimId: z.string().min(1).max(100) })

export type SetupClaimCheck = { ok: true } | { ok: false; code: "SETUP_UNCLAIMED" }

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex")

/** Compares two SHA-256 hex digests in constant time. */
function sameDigest(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex")
  const right = Buffer.from(b, "hex")
  return left.length === right.length && timingSafeEqual(left, right)
}

/** Upper-cased, without dashes or whitespace: "k7qm 4wzd-p2hx" is "K7QM4WZDP2HX". */
const normalizeCode = (input: string) => input.toUpperCase().replace(/[\s-]/g, "")

/**
 * A new code, formatted like `K7QM-4WZD-P2HX`.
 *
 * @internal
 */
export function generateSetupCode(): string {
  const chars = Array.from({ length: CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)])
  return [0, 4, 8].map((start) => chars.slice(start, start + 4).join("")).join("-")
}

/** `SETUP_TOKEN` when it is long enough to replace the generated code. */
function setupToken(): string | undefined {
  const token = getEnv().SETUP_TOKEN
  return token !== undefined && token.length >= SETUP_TOKEN_MIN_LENGTH ? token : undefined
}

const latestSetup = () => prisma.setup.findFirst({ orderBy: { createdAt: "desc" } })

/** Writes `data` to the wizard's row, creating it when the wizard has none yet. */
async function writeSetup(id: string | undefined, data: { claimCodeHash?: string | null; claimCodeIssuedAt?: Date; claimId?: string; claimedAt?: Date }) {
  if (id) await prisma.setup.update({ where: { id }, data })
  else await prisma.setup.create({ data })
}

/**
 * Issues this boot's setup code while setup is incomplete and `SETUP_TOKEN` is
 * unset: stores its hash and prints it. The banner is the one deliberate
 * output that bypasses the logger, so log redaction never masks it.
 */
export async function issueSetupCode(): Promise<void> {
  if (setupToken()) {
    logger.info("Setup claim uses SETUP_TOKEN")
    return
  }
  if (getEnv().SETUP_TOKEN !== undefined) {
    logger.warn(`SETUP_TOKEN is shorter than ${SETUP_TOKEN_MIN_LENGTH} characters and is ignored`)
  }
  const setup = await latestSetup()
  if (setup?.isComplete) return

  const code = generateSetupCode()
  await writeSetup(setup?.id, { claimCodeHash: sha256(normalizeCode(code)), claimCodeIssuedAt: new Date() })
  process.stdout.write(`Setup code: ${code}\n`)
}

/**
 * Claims the server with `input`, the setup code or `SETUP_TOKEN`. On a match
 * it records a new claim id (ending any earlier claim) and clears the code, so
 * a code works once. The caller sets the cookie with {@link setupClaimCookie}.
 */
export async function redeemSetupCode(input: string): Promise<{ ok: true; claimId: string; method: "code" | "token" } | { ok: false }> {
  const setup = await latestSetup()
  const claim = { claimId: randomBytes(32).toString("base64url"), claimedAt: new Date(), claimCodeHash: null }
  const token = setupToken()

  if (token) {
    if (!sameDigest(sha256(input.trim()), sha256(token))) return { ok: false }
    await writeSetup(setup?.id, claim)
    return { ok: true, claimId: claim.claimId, method: "token" }
  }

  const stored = setup?.claimCodeHash
  if (!setup || !stored || !sameDigest(sha256(normalizeCode(input)), stored)) return { ok: false }
  // Only the request that clears this hash wins, so two racing uses of one code cannot both claim
  const { count } = await prisma.setup.updateMany({ where: { id: setup.id, claimCodeHash: stored }, data: claim })
  return count === 1 ? { ok: true, claimId: claim.claimId, method: "code" } : { ok: false }
}

/** The `pm-setup` cookie for a claim: httpOnly, SameSite=Lax, Secure on https, 12 hours. */
export function setupClaimCookie(claimId: string) {
  return {
    name: SETUP_CLAIM_COOKIE,
    value: signValue({ claimId }, PURPOSE, CLAIM_TTL_SEC),
    httpOnly: true,
    sameSite: "lax" as const,
    secure: usesSecureCookies(),
    path: "/",
    maxAge: CLAIM_TTL_SEC,
  }
}

/**
 * Whether this request carries the current claim: a valid `pm-setup` cookie
 * whose claim id equals the wizard row's, compared in constant time.
 */
export async function requireSetupClaim(): Promise<SetupClaimCheck> {
  const unclaimed = { ok: false, code: "SETUP_UNCLAIMED" } as const
  const cookie = claimCookieSchema.safeParse(verifyValue((await cookies()).get(SETUP_CLAIM_COOKIE)?.value, PURPOSE))
  if (!cookie.success) return unclaimed

  const setup = await latestSetup()
  if (!setup?.claimId || setup.isComplete) return unclaimed
  return sameDigest(sha256(cookie.data.claimId), sha256(setup.claimId)) ? { ok: true } : unclaimed
}

/** Deletes the `pm-setup` cookie; `completeSetup` clears the claim from the row in the same write that completes it. */
export async function clearSetupClaimCookie(): Promise<void> {
  ;(await cookies()).delete(SETUP_CLAIM_COOKIE)
}
