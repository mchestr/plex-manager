/**
 * The connected services setup and settings both save (P10.24, DUP-05): each
 * kind's labels, schemas, tester, secret field, the row a save writes, and
 * the Prisma delegate that holds it. `lib/services/service-save.ts` runs the
 * one save flow over them.
 *
 * @module lib/services/descriptors
 */

import "server-only"

import { z } from "zod"

import type { ActionFailure } from "@/lib/actions/result"
import { testJellyfinConnection } from "@/lib/connections/jellyfin"
import { testOverseerrConnection } from "@/lib/connections/overseerr"
import { getPlexServerIdentity, getPlexUserInfo, testPlexConnection } from "@/lib/connections/plex"
import { testRadarrConnection } from "@/lib/connections/radarr"
import { testSonarrConnection } from "@/lib/connections/sonarr"
import { testTautulliConnection } from "@/lib/connections/tautulli"
import type { JellyfinServer, PlexServer } from "@/lib/generated/prisma/client"
import type { PrismaTransactionClient } from "@/lib/prisma"
import { connectionTestCopy } from "@/lib/ui/error-copy"
import { jellyfinServerSchema } from "@/lib/validations/jellyfin"
import { overseerrSchema } from "@/lib/validations/overseerr"
import { plexServerSchema, type PlexServerParsed } from "@/lib/validations/plex"
import { radarrSchema } from "@/lib/validations/radarr"
import type { ServiceParsed } from "@/lib/validations/shared-schemas"
import { sonarrSchema } from "@/lib/validations/sonarr"
import { tautulliSchema } from "@/lib/validations/tautulli"

export type ServiceKind = "plex" | "jellyfin" | "tautulli" | "overseerr" | "sonarr" | "radarr"
type ApiKeyKind = Exclude<ServiceKind, "plex">
type ApiKeyRow = Omit<JellyfinServer, "adminUserId" | "enabledForLogin">

/** A form as sent: its secret may be blank, to keep the stored one for the same address. */
const SECRET_INPUT = z.string().max(500).optional()
type PlexInput = Omit<PlexServerParsed, "token"> & { token?: string }
type ApiKeyInput = Omit<ServiceParsed, "apiKey"> & { apiKey?: string }

interface Kinds {
  plex: { input: PlexInput; config: PlexServerParsed; stored: PlexServer; row: PlexServerParsed & Pick<PlexServer, "adminPlexUserId" | "machineIdentifier"> }
}
type Kind<K extends ServiceKind> = K extends keyof Kinds ? Kinds[K] : { input: ApiKeyInput; config: ServiceParsed; stored: ApiKeyRow; row: ServiceParsed }

export type ServiceInput<K extends ServiceKind> = Kind<K>["input"]
type ServiceConfig<K extends ServiceKind> = Kind<K>["config"]
export type StoredService<K extends ServiceKind> = Kind<K>["stored"]
/** What a save writes: the form's fields, anything the save looked up, and `isActive`. */
export type ServiceRow<K extends ServiceKind> = Kind<K>["row"] & { isActive: true }

/** The delegate calls a save makes; structural, so each model's delegate (or a transaction's) fits. */
interface ActiveRowDelegate<D, S> {
  findFirst(args: { where: { isActive: true } | { url: string }; orderBy?: { updatedAt: "desc" } }): Promise<S | null>
  updateMany(args: { where: { isActive: true }; data: { isActive: false } }): Promise<unknown>
  update(args: { where: { id: string }; data: D }): Promise<S>
  create(args: { data: D }): Promise<S>
}

export interface ServiceDescriptor<K extends ServiceKind> {
  label: string
  /** The row's secret field. */
  secretField: "token" | "apiKey"
  /** The full form, for client-side checks. */
  schema: z.ZodType<ServiceConfig<K>>
  /** The action input: the form with its secret optional. */
  input: z.ZodType<ServiceInput<K>>
  /** The submitted secret, and the stored row's. */
  secretOf(values: ServiceInput<K> | StoredService<K>): string | undefined
  /** The input with its resolved secret. */
  withSecret(input: ServiceInput<K>, secret: string): ServiceConfig<K>
  test(config: ServiceConfig<K>): Promise<{ success: boolean; error?: string }>
  /** After a passing test: the row to save, or why not (the Plex owner). */
  toRow(config: ServiceConfig<K>): Promise<{ ok: true; row: ServiceRow<K> } | { ok: false; failure: ActionFailure }>
  delegate(db: PrismaTransactionClient): ActiveRowDelegate<ServiceRow<K>, StoredService<K>>
}

const plainRow = async <C>(config: C) => ({ ok: true as const, row: { ...config, isActive: true as const } })

function apiKeyService<K extends ApiKeyKind>(
  label: string,
  schema: typeof tautulliSchema,
  test: (config: ServiceParsed) => Promise<{ success: boolean; error?: string }>,
  delegate: (db: PrismaTransactionClient) => ActiveRowDelegate<ServiceRow<K>, StoredService<K>>
): ServiceDescriptor<K> {
  return {
    label,
    secretField: "apiKey",
    schema,
    input: schema.extend({ apiKey: SECRET_INPUT }),
    secretOf: (values) => values.apiKey,
    withSecret: (input, apiKey) => ({ ...input, apiKey }),
    test,
    toRow: plainRow,
    delegate,
  }
}

export const SERVICE_DESCRIPTORS: { [K in ServiceKind]: ServiceDescriptor<K> } = {
  plex: {
    label: "Plex",
    secretField: "token",
    schema: plexServerSchema,
    input: plexServerSchema.extend({ token: SECRET_INPUT }),
    secretOf: (values) => values.token,
    withSecret: (input, token) => ({ ...input, token }),
    test: testPlexConnection,
    // The token's own account owns the server, and every sign-in by it is an admin's
    toRow: async (config) => {
      const owner = await getPlexUserInfo(config.token)
      if (!owner.success || !owner.data) {
        const copy = connectionTestCopy("UNAUTHORIZED", "Plex token")
        return { ok: false, failure: { success: false, code: "UPSTREAM_UNAVAILABLE", error: `${copy.title}. ${copy.fix}`, fieldErrors: { token: [copy.fieldError] } } }
      }
      // Stored so sign-in and invites need no /identity call; filled later if the PMS does not say now
      const identity = await getPlexServerIdentity(config)
      return { ok: true, row: { ...config, adminPlexUserId: owner.data.id, machineIdentifier: identity.machineIdentifier ?? null, isActive: true } }
    },
    delegate: (db) => db.plexServer,
  },
  jellyfin: apiKeyService("Jellyfin", jellyfinServerSchema, testJellyfinConnection, (db) => db.jellyfinServer),
  tautulli: apiKeyService("Tautulli", tautulliSchema, testTautulliConnection, (db) => db.tautulli),
  overseerr: apiKeyService("Overseerr", overseerrSchema, testOverseerrConnection, (db) => db.overseerr),
  sonarr: apiKeyService("Sonarr", sonarrSchema, testSonarrConnection, (db) => db.sonarr),
  radarr: apiKeyService("Radarr", radarrSchema, testRadarrConnection, (db) => db.radarr),
}
