"use server"

import { createHash } from "node:crypto"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { expireTag } from "@/lib/actions/invalidate"
import { adminAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import {
  acceptsType,
  BRAND_ASSET_MAX_BYTES,
  BRAND_ASSETS,
  brandAssetKindSchema,
  brandAssetUrl,
  formatList,
  sniffImageType,
} from "@/lib/branding/assets"
import { BRANDING_TAG } from "@/lib/branding/settings"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"

const uploadSchema = z.object({
  kind: brandAssetKindSchema,
  file: z
    .instanceof(File, { message: "Choose an image to upload" })
    .refine((file) => file.size > 0, "The file is empty")
    .refine((file) => file.size <= BRAND_ASSET_MAX_BYTES, `Images can be at most ${BRAND_ASSET_MAX_BYTES / 1024} KB`),
})

function changed(kind: string) {
  expireTag(BRANDING_TAG)
  revalidatePath("/", "layout")
  return kind
}

/**
 * Upload one brand image (admin only): the wordmark, the icon, the favicon or
 * the login background. The type comes from the file's bytes, never its name;
 * a type the slot does not take is refused. It replaces the slot's image.
 */
export const uploadBrandAsset = adminAction({
  input: uploadSchema,
  rateLimit: { name: "admin" },
  fallbackError: "Could not upload the image",
  handler: async ({ kind, file }, { userId }) => {
    const data = new Uint8Array(await file.arrayBuffer())
    const contentType = sniffImageType(data)
    if (!contentType || !acceptsType(kind, contentType)) {
      return fail("VALIDATION", `${BRAND_ASSETS[kind].label} must be a ${formatList(kind)} image`)
    }
    const sha256 = createHash("sha256").update(data).digest("hex")
    const row = { contentType, data, sha256, size: data.byteLength, updatedBy: userId }
    await prisma.brandAsset.upsert({ where: { kind }, update: row, create: { kind, ...row }, select: { kind: true } })

    logAuditEvent(AuditEventType.CONFIG_CHANGED, userId, {
      section: "branding.assets",
      changedFields: [kind],
      secretChanged: false,
    })
    changed(kind)
    return ok({ kind, url: brandAssetUrl(kind, sha256) })
  },
})

/** Remove one brand image (admin only); the app goes back to its default for that slot. */
export const removeBrandAsset = adminAction({
  input: brandAssetKindSchema,
  fallbackError: "Could not remove the image",
  handler: async (kind, { userId }) => {
    const { count } = await prisma.brandAsset.deleteMany({ where: { kind } })
    if (count > 0) {
      logAuditEvent(AuditEventType.CONFIG_CHANGED, userId, {
        section: "branding.assets",
        changedFields: [kind],
        secretChanged: false,
      })
    }
    changed(kind)
    return ok({ kind })
  },
})
