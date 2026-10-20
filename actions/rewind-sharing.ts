"use server"

/**
 * Opt-in public links for a v3 Rewind (design 6.2, SEC-16) and the member's
 * share sheet choices (6.3).
 *
 * ## Links
 *
 * | Action | Effect |
 * |---|---|
 * | `enableRewindShare` | A new `RewindShare`: a 32-byte token (base64url) of which only the SHA-256 hex is stored, a separate 16-byte asset key, and the URL returned once |
 * | `updateRewindShare` | Changes what a link publishes; the URL stays |
 * | `rotateRewindShare` | Revokes the link and creates one with the same settings and a new token and asset key (`rotatedFromId`); the old URL is a 404 at once. An expired link is refused while the Rewind has another live one |
 * | `disableRewindShare` | Sets `revokedAt`; the URL is a 404 at once |
 *
 * Each checks the session and that the link is the member's own, spends a
 * point of `rw:share-actions` (10 an hour per member) and writes one audit
 * entry holding the share id and pages, never the token. Enable and update
 * need a completed v3 Rewind and, with Stripe on, an active membership;
 * rotate and disable skip the membership check, so a lapsed member can still
 * withdraw a link (FR-51). Enable is refused while `Config.rewindPublicLinks`
 * is off.
 *
 * Expiry defaults to `'season-close'`: the last second of the season's close
 * day in the server zone (`getSeasonState()`), never a hard-coded date.
 * `'never'` is a deliberate choice in the confirm step.
 *
 * @module actions/rewind-sharing
 */

import { createHash, randomBytes } from "node:crypto"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { memberAction } from "@/lib/actions/define-action"
import { hasEntitlement } from "@/lib/actions/entitlement"
import { fail, ok } from "@/lib/actions/result"
import { getBaseUrl } from "@/lib/env"
import { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { serverZone } from "@/lib/utils/server-zone"
import { wallTimeToInstant } from "@/lib/utils/zoned-time"
import { yearSchema } from "@/lib/validations/shared-schemas"
import { parseStoredRewind, readWrappedStatus } from "@/lib/wrapped/data/parse-stored"
import type { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"
import { CardFactIdSchema, ShareOptions } from "@/lib/wrapped/data/share-safe-schema"
import { getSeasonState } from "@/lib/wrapped/season"

/** What a lapsed member reads when sharing needs a membership; the sheet links it to `/subscribe`. */
const NEEDS_MEMBERSHIP = "Sharing needs an active membership"
const NOT_READY = "Your Rewind for this year is not ready to share"
const NO_LINK = "That link was not found"
const LIVE_LINK = "You already have a public link. Rotate it for a new address."

const ExpirySchema = z.union([z.literal("season-close"), z.literal("never"), z.iso.date()])
type Expiry = z.infer<typeof ExpirySchema>

const optionFields = {
  pages: ShareOptions.shape.pages,
  signed: z.boolean(),
  includeArt: z.boolean(),
  dailyDetail: z.boolean(),
  cardFacts: ShareOptions.shape.cardFacts,
}

const enableSchema = z.strictObject({ year: yearSchema, ...optionFields, expiresAt: ExpirySchema.default("season-close") })
const shareIdSchema = z.string().min(1).max(64)
const updateSchema = z.strictObject({
  shareId: shareIdSchema,
  ...z.strictObject(optionFields).partial().shape,
  expiresAt: ExpirySchema.optional(),
})
const byIdSchema = z.strictObject({ shareId: shareIdSchema })
const prefsSchema = z.strictObject({ year: yearSchema, signed: z.boolean(), includeArt: z.boolean(), dailyDetail: z.boolean(), cardFacts: z.array(CardFactIdSchema).max(3) })

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex")

/** A new token (returned once) with its stored hash, and a new asset key. */
function mintCredentials() {
  const token = randomBytes(32).toString("base64url")
  return { token, tokenHash: sha256(token), assetKey: randomBytes(16).toString("base64url") }
}

/**
 * `'season-close'` is the last second before the season closes, and a date is
 * the last second of that day, both in the server zone.
 */
async function resolveExpiry(expiry: Expiry): Promise<Date | null> {
  if (expiry === "never") return null
  if (expiry === "season-close") {
    // After a season that ends within its year has closed, the next close is a year on.
    const close = new Date((await getSeasonState()).closesAt)
    if (close.getTime() <= Date.now()) close.setUTCFullYear(close.getUTCFullYear() + 1)
    return new Date(close.getTime() - 1000)
  }
  return new Date(wallTimeToInstant(`${expiry}T23:59`, await serverZone()).getTime() + 59_000)
}

const PAST_EXPIRY = "Pick an expiry date that has not passed"
const isPast = (expiresAt: Date | null) => expiresAt !== null && expiresAt.getTime() <= Date.now()

/** Thrown inside a transaction when another request already replaced the link. */
class LinkChanged extends Error {}
/** Thrown inside rotate when the Rewind already has another live link; rolls the revoke back. */
class LinkExists extends Error {}

/** The stored v3 Rewind of a completed row, or null. */
function completedV3(row: { id: string; status: string; data: string | null }): RewindDataV3 | null {
  if (readWrappedStatus(row.status, row.id) !== "completed") return null
  const stored = parseStoredRewind(row.data)
  return stored.version === 3 ? stored.data : null
}

/** Every page must be one the issue printed. */
const printsAll = (rewind: RewindDataV3, pages: readonly string[]) => pages.every((type) => rewind.pages.some((page) => page.type === type))

const shareSelect = {
  id: true,
  wrappedId: true,
  pages: true,
  signed: true,
  includeArt: true,
  dailyDetail: true,
  cardFacts: true,
  expiresAt: true,
  revokedAt: true,
  wrapped: { select: { id: true, userId: true, year: true, status: true, data: true } },
} as const

/** The member's own link by id, live or not, or null. */
async function ownShare(shareId: string, userId: string) {
  const share = await prisma.rewindShare.findUnique({ where: { id: shareId }, select: shareSelect })
  return share && share.wrapped.userId === userId ? share : null
}

/**
 * The link's address prefix. `getBaseUrl()` throws when no app URL is set, so
 * it is read before any write: a failure cannot leave a live link unseen.
 */
const linkBase = () => `${getBaseUrl()}/rewind/s/`

function revalidateShares() {
  revalidatePath("/rewind", "layout")
}

/**
 * Creates a public link for the member's completed v3 Rewind of `year`. Only
 * one live link exists per Rewind: with one already live, rotate it instead.
 *
 * @returns `data: { shareId, url, expiresAt }`; the URL is never shown again.
 */
export const enableRewindShare = memberAction({
  input: enableSchema,
  rateLimit: { name: "rw:share-actions" },
  fallbackError: "Could not create the link",
  handler: async ({ year, expiresAt: expiry, ...options }, { userId }) => {
    const config = await prisma.config.findUnique({ where: { id: "config" }, select: { rewindPublicLinks: true } })
    if (config?.rewindPublicLinks === false) return fail("FORBIDDEN", "Public links are turned off on this server")
    if (!(await hasEntitlement(userId, "full"))) return fail("NOT_ENTITLED", NEEDS_MEMBERSHIP)

    const row = await prisma.plexWrapped.findUnique({ where: { userId_year: { userId, year } }, select: { id: true, status: true, data: true } })
    const rewind = row && completedV3(row)
    if (!row || !rewind) return fail("CONFLICT", NOT_READY)
    if (!printsAll(rewind, options.pages)) return fail("VALIDATION", "Those pages are not in your Rewind")

    const expiresAt = await resolveExpiry(expiry)
    if (isPast(expiresAt)) return fail("VALIDATION", PAST_EXPIRY)

    const base = linkBase()
    const { token, tokenHash, assetKey } = mintCredentials()
    // Serializable, so two requests at once cannot both see no live link and
    // both create one: the losing one fails with P2034 and is told a link exists.
    const share = await prisma
      .$transaction(
        async (tx) => {
          const live = await tx.rewindShare.findFirst({
            where: { wrappedId: row.id, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
            select: { id: true },
          })
          if (live) return null
          return tx.rewindShare.create({
            data: { wrappedId: row.id, tokenHash, assetKey, ...options, expiresAt },
            select: { id: true, expiresAt: true },
          })
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      )
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return null
        throw error
      })
    if (!share) return fail("CONFLICT", LIVE_LINK)
    logAuditEvent(AuditEventType.REWIND_SHARE_CREATED, userId, { shareId: share.id, year, pages: options.pages })
    revalidateShares()
    return ok({ shareId: share.id, url: `${base}${token}`, expiresAt: share.expiresAt?.toISOString() ?? null })
  },
})

/** Changes what the member's live link publishes, keeping its URL. @public P7.5's "Change cards" calls it. */
export const updateRewindShare = memberAction({
  input: updateSchema,
  rateLimit: { name: "rw:share-actions" },
  fallbackError: "Could not change the link",
  handler: async ({ shareId, expiresAt: expiry, ...changes }, { userId }) => {
    const share = await ownShare(shareId, userId)
    if (!share || share.revokedAt) return fail("NOT_FOUND", NO_LINK)
    if (!(await hasEntitlement(userId, "full"))) return fail("NOT_ENTITLED", NEEDS_MEMBERSHIP)
    const rewind = completedV3(share.wrapped)
    if (!rewind) return fail("CONFLICT", NOT_READY)
    if (changes.pages && !printsAll(rewind, changes.pages)) return fail("VALIDATION", "Those pages are not in your Rewind")

    const expiresAt = expiry ? await resolveExpiry(expiry) : undefined
    if (expiresAt !== undefined && isPast(expiresAt)) return fail("VALIDATION", PAST_EXPIRY)
    const updated = await prisma.rewindShare.update({
      where: { id: share.id },
      data: { ...changes, ...(expiresAt !== undefined ? { expiresAt } : {}) },
      select: { id: true, pages: true, expiresAt: true },
    })
    logAuditEvent(AuditEventType.REWIND_SHARE_UPDATED, userId, { shareId: share.id, year: share.wrapped.year, pages: updated.pages })
    revalidateShares()
    return ok({ shareId: updated.id, expiresAt: updated.expiresAt?.toISOString() ?? null })
  },
})

/**
 * Replaces the member's link with a new one on the same settings: the old
 * token and asset key stop working at once.
 *
 * @returns `data: { shareId, url, expiresAt }` of the new link; the URL is never shown again.
 */
export const rotateRewindShare = memberAction({
  input: byIdSchema,
  rateLimit: { name: "rw:share-actions" },
  fallbackError: "Could not rotate the link",
  handler: async ({ shareId }, { userId }) => {
    const share = await ownShare(shareId, userId)
    if (!share || share.revokedAt) return fail("NOT_FOUND", NO_LINK)
    if (!completedV3(share.wrapped)) return fail("CONFLICT", NOT_READY)

    const options = ShareOptions.safeParse({
      pages: share.pages,
      signed: share.signed,
      includeArt: share.includeArt,
      dailyDetail: share.dailyDetail,
      cardFacts: share.cardFacts,
    })
    if (!options.success) return fail("CONFLICT", "That link cannot be rotated. Stop it and create a new one.")

    // An expired link comes back with the default expiry, not a dead one.
    const expiresAt = isPast(share.expiresAt) ? await resolveExpiry("season-close") : share.expiresAt
    const base = linkBase()
    const { token, tokenHash, assetKey } = mintCredentials()
    let created: { id: string; expiresAt: Date | null }
    try {
      // Serializable, as enable is: an expired link's successor is live, so
      // rotating one must not run alongside an enable that creates another.
      created = await prisma.$transaction(
        async (tx) => {
          // Only the request that revokes the link creates its successor.
          const revoked = await tx.rewindShare.updateMany({ where: { id: share.id, revokedAt: null }, data: { revokedAt: new Date() } })
          if (revoked.count === 0) throw new LinkChanged()
          const live = await tx.rewindShare.findFirst({
            where: { wrappedId: share.wrappedId, id: { not: share.id }, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
            select: { id: true },
          })
          if (live) throw new LinkExists()
          return tx.rewindShare.create({
            data: { wrappedId: share.wrappedId, tokenHash, assetKey, ...options.data, expiresAt, rotatedFromId: share.id },
            select: { id: true, expiresAt: true },
          })
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      )
    } catch (error) {
      if (error instanceof LinkExists) return fail("CONFLICT", LIVE_LINK)
      const raced = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034"
      if (error instanceof LinkChanged || raced) return fail("CONFLICT", "That link just changed. Refresh and try again.")
      throw error
    }
    logAuditEvent(AuditEventType.REWIND_SHARE_ROTATED, userId, { shareId: created.id, rotatedFromId: share.id, year: share.wrapped.year, pages: share.pages })
    revalidateShares()
    return ok({ shareId: created.id, url: `${base}${token}`, expiresAt: created.expiresAt?.toISOString() ?? null })
  },
})

/** Stops the member's link: its URL, cards and posters are a 404 at once. */
export const disableRewindShare = memberAction({
  input: byIdSchema,
  rateLimit: { name: "rw:share-actions" },
  fallbackError: "Could not stop sharing",
  handler: async ({ shareId }, { userId }) => {
    const share = await ownShare(shareId, userId)
    if (!share) return fail("NOT_FOUND", NO_LINK)
    if (!share.revokedAt) {
      await prisma.rewindShare.update({ where: { id: share.id }, data: { revokedAt: new Date() } })
      logAuditEvent(AuditEventType.REWIND_SHARE_REVOKED, userId, { shareId: share.id, year: share.wrapped.year, pages: share.pages })
    }
    revalidateShares()
    return ok(null)
  },
})

/**
 * Saves the share sheet's choices for the member's Rewind of `year`
 * (`RewindPrefs`): what the next card or link starts from, and what the back
 * cover's privacy line reads.
 */
export const saveRewindSharePrefs = memberAction({
  input: prefsSchema,
  fallbackError: "Could not save your choices",
  handler: async ({ year, ...choices }, { userId }) => {
    await prisma.rewindPrefs.upsert({
      where: { userId_year: { userId, year } },
      create: { userId, year, ...choices },
      update: choices,
    })
    return ok(null)
  },
})
