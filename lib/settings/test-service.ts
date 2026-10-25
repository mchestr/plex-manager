/**
 * Test connection with the values typed into a form, before they are saved
 * (P10.20). Settings calls it through `testServiceConnection`
 * (`actions/admin/test-connection.ts`); setup (P10.25) calls it behind its
 * own claim check.
 *
 * ## Order
 *
 * 1. Resolve the secret with `resolveSecretForOrigin` against the service's
 *    active row: a blank secret reuses the stored one only for the origin it
 *    was saved with. Otherwise the result is `SECRET_REQUIRED`, before any
 *    request leaves the server, so a stored key never reaches a new address
 *    (SEC-31).
 * 2. Validate the values with the service's own schema (`VALIDATION`).
 * 3. Run the service's tester through `probeConnection`, cut off at 5 s, and
 *    return `{ status, code }`. The tester's message never leaves the server.
 * 4. Prometheus only: once it answers, run the query. A query Prometheus
 *    rejects is a `VALIDATION` error on `query` with Prometheus's own
 *    `errorType: error` (GAP-09), so the form shows the parse error inline.
 *
 * @module lib/settings/test-service
 */

import "server-only"

import type { z } from "zod"

import { testJellyfinConnection } from "@/lib/connections/jellyfin-connection"
import { testOverseerrConnection } from "@/lib/connections/overseerr"
import { testPlexConnection } from "@/lib/connections/plex-connection"
import { testPrometheusConnection, validatePrometheusQuery } from "@/lib/connections/prometheus"
import { testRadarrConnection } from "@/lib/connections/radarr"
import { testSonarrConnection } from "@/lib/connections/sonarr"
import { testTautulliConnection } from "@/lib/connections/tautulli"
import { prisma } from "@/lib/prisma"
import { resolveSecretForOrigin } from "@/lib/security/secret-reuse"
import { PROBE_TIMEOUT_MS, probeConnection, type Probe } from "@/lib/settings/probe"
import { jellyfinServerSchema } from "@/lib/validations/jellyfin"
import { overseerrSchema } from "@/lib/validations/overseerr"
import { plexServerSchema } from "@/lib/validations/plex"
import { prometheusSchema } from "@/lib/validations/prometheus"
import { radarrSchema } from "@/lib/validations/radarr"
import { sonarrSchema } from "@/lib/validations/sonarr"
import { tautulliSchema } from "@/lib/validations/tautulli"

export const TESTABLE_SERVICES = ["plex", "jellyfin", "tautulli", "overseerr", "sonarr", "radarr", "prometheus"] as const
type TestableService = (typeof TESTABLE_SERVICES)[number]

export interface ServiceTestInput {
  service: TestableService
  url: string
  /** As typed; blank asks to reuse the stored secret. Prometheus takes none. */
  secret?: string
  /** Prometheus only. */
  query?: string
}

/** The stored secret and the URL it was saved with, or null without an active row. */
export interface StoredSecret {
  secret: string | null
  url: string
}

export type ServiceTestResult =
  | { ok: true; probe: Probe }
  | { ok: false; code: "SECRET_REQUIRED" }
  | { ok: false; code: "VALIDATION"; field: "url" | "secret" | "query"; message: string }

type Tester = () => Promise<{ success: boolean; error?: string }>

/** The name the testers' schemas require; a test never stores it. */
const TEST_NAME = "Connection test"

function storedRow(service: TestableService): Promise<StoredSecret | null> {
  const where = { where: { isActive: true }, orderBy: { updatedAt: "desc" } } as const
  switch (service) {
    case "plex":
      return prisma.plexServer.findFirst({ ...where, select: { url: true, token: true } }).then((row) => row && { url: row.url, secret: row.token })
    case "prometheus":
      return Promise.resolve(null)
    case "jellyfin":
      return prisma.jellyfinServer.findFirst({ ...where, select: { url: true, apiKey: true } }).then(apiKeyRow)
    case "tautulli":
      return prisma.tautulli.findFirst({ ...where, select: { url: true, apiKey: true } }).then(apiKeyRow)
    case "overseerr":
      return prisma.overseerr.findFirst({ ...where, select: { url: true, apiKey: true } }).then(apiKeyRow)
    case "sonarr":
      return prisma.sonarr.findFirst({ ...where, select: { url: true, apiKey: true } }).then(apiKeyRow)
    case "radarr":
      return prisma.radarr.findFirst({ ...where, select: { url: true, apiKey: true } }).then(apiKeyRow)
  }
}

function apiKeyRow(row: { url: string; apiKey: string } | null): StoredSecret | null {
  return row && { url: row.url, secret: row.apiKey }
}

/** The service's schema parse, as a tester or the field that failed. */
function parsed<S extends z.ZodType>(schema: S, values: z.input<S>, run: (config: z.output<S>) => Tester): Tester | ServiceTestResult {
  const result = schema.safeParse(values)
  if (result.success) return run(result.data)
  const issue = result.error.issues[0]
  const path = issue?.path[0]
  const field = path === "query" ? "query" : path === "url" ? "url" : "secret"
  return { ok: false, code: "VALIDATION", field, message: issue?.message ?? "Invalid value" }
}

function testerFor(service: TestableService, url: string, secret: string, query: string): Tester | ServiceTestResult {
  const base = { name: TEST_NAME, url }
  switch (service) {
    case "plex":
      return parsed(plexServerSchema, { ...base, token: secret }, (config) => () => testPlexConnection(config))
    case "jellyfin":
      return parsed(jellyfinServerSchema, { ...base, apiKey: secret }, (config) => () => testJellyfinConnection(config))
    case "tautulli":
      return parsed(tautulliSchema, { ...base, apiKey: secret }, (config) => () => testTautulliConnection(config))
    case "overseerr":
      return parsed(overseerrSchema, { ...base, apiKey: secret }, (config) => () => testOverseerrConnection(config))
    case "sonarr":
      return parsed(sonarrSchema, { ...base, apiKey: secret }, (config) => () => testSonarrConnection(config))
    case "radarr":
      return parsed(radarrSchema, { ...base, apiKey: secret }, (config) => () => testRadarrConnection(config))
    case "prometheus":
      return parsed(prometheusSchema, { ...base, query }, (config) => () => testPrometheusConnection(config))
  }
}

/**
 * Tests a service with typed values. `stored` defaults to the service's
 * active row; setup passes its own.
 */
export async function testService(input: ServiceTestInput, stored?: StoredSecret | null): Promise<ServiceTestResult> {
  let secret = ""
  if (input.service !== "prometheus") {
    // A typed secret is used as it is; only a blank one reads the stored row
    const row = input.secret?.trim() ? null : stored === undefined ? await storedRow(input.service) : stored
    const resolution = resolveSecretForOrigin({ submitted: input.secret, stored: row, submittedUrl: input.url })
    if (!resolution.ok) return { ok: false, code: "SECRET_REQUIRED" }
    secret = resolution.secret
  }

  const tester = testerFor(input.service, input.url, secret, input.query ?? "")
  if (typeof tester !== "function") return tester
  const probe = await probeConnection(input.service, tester)
  if (input.service === "prometheus" && probe.status === "ok") {
    // Parsed again for the normalised URL; the tester above already passed this parse
    const config = prometheusSchema.parse({ name: TEST_NAME, url: input.url, query: input.query ?? "" })
    const query = await validatePrometheusQuery(config, { timeoutMs: PROBE_TIMEOUT_MS })
    if (!query.success) return { ok: false, code: "VALIDATION", field: "query", message: query.error }
  }
  return { ok: true, probe }
}
