/**
 * The one save flow for a connected service (P10.24, DUP-05), shared by the
 * setup wizard (`actions/setup.ts`) and settings (`actions/admin/admin-servers.ts`).
 *
 * ## Order
 *
 * 1. Resolve the secret against the active row (`resolveSecretForOrigin`,
 *    P4.6): a blank secret reuses the stored one only for the address it was
 *    saved with, before any request leaves the server (SEC-31).
 * 2. Run the service's tester with the 5 s cut-off. A failure is
 *    `UPSTREAM_UNAVAILABLE` with code copy on the URL or secret field, never
 *    the tester's message (P10.20).
 * 3. Build the row (`toRow`: the Plex owner and machine id, the Prometheus
 *    query check).
 * 4. In one transaction, {@link saveActiveService} plus the caller's own
 *    writes (`within`: the wizard's step).
 * 5. Audit `CONFIG_CHANGED` with a redacted diff (SEC-55).
 *
 * Nothing is written when a step before 4 fails.
 *
 * @module lib/services/service-save
 */

import "server-only"

import { ok, type ActionFailure, type ActionResult } from "@/lib/actions/result"
import { prisma, type PrismaTransactionClient } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { configDiff } from "@/lib/security/config-diff"
import { resolveSecretForOrigin, SECRET_REQUIRED_MESSAGE, type SecretRequiredCode } from "@/lib/security/secret-reuse"
import { SERVICE_DESCRIPTORS, type ServiceInput, type ServiceKind } from "@/lib/services/descriptors"
import { saveActiveService } from "@/lib/services/service-config"
import { probeConnection } from "@/lib/settings/probe"
import { connectionTestCopy } from "@/lib/ui/error-copy"

export type ServiceSaveResult = ActionResult<null, "SECRET_REQUIRED" | ActionFailure["code"]>

export interface ServiceSaveOptions {
  /** The audit actor: the admin's id, or `setup` during the first run. */
  actor: string
  /** The audit section, e.g. `tautulli` or `setup.tautulli`. */
  section: string
  /** More writes in the save's transaction. */
  within?: (tx: PrismaTransactionClient) => Promise<unknown>
}

type Audited = { name: string; url: string; publicUrl?: string | null; query?: string }

/** A row's audited fields, so the stored and saved states compare like with like. */
function audited(values: Audited, secret: string | undefined): Record<string, unknown> {
  if (secret === undefined) return { name: values.name, url: values.url, query: values.query }
  return { name: values.name, url: values.url, publicUrl: values.publicUrl ?? null, secret }
}

function secretRefusal(field: string, missing: boolean): ActionFailure<SecretRequiredCode | "VALIDATION"> {
  const message = missing ? (field === "token" ? "Plex token is required" : "API key is required") : SECRET_REQUIRED_MESSAGE
  return { success: false, code: missing ? "VALIDATION" : "SECRET_REQUIRED", error: message, fieldErrors: { [field]: [message] } }
}

/** Tests, then saves `input` as the kind's one active row; see the module notes for the order. */
export async function saveServiceConnection<K extends ServiceKind>(
  kind: K,
  input: ServiceInput<K>,
  { actor, section, within }: ServiceSaveOptions
): Promise<ServiceSaveResult> {
  const service = SERVICE_DESCRIPTORS[kind]
  const stored = await service.delegate(prisma).findFirst({ where: { isActive: true }, orderBy: { updatedAt: "desc" } })
  const storedSecret = stored ? service.secretOf(stored) : undefined

  let secret: string | undefined
  if (service.secretField) {
    const resolution = resolveSecretForOrigin({
      submitted: service.secretOf(input),
      stored: stored && storedSecret !== undefined ? { secret: storedSecret, url: stored.url } : null,
      submittedUrl: input.url,
    })
    if (!resolution.ok) return secretRefusal(service.secretField, !stored)
    secret = resolution.secret
  }
  const config = service.withSecret(input, secret ?? "")

  const probe = await probeConnection(kind, () => service.test(config))
  if (probe.status !== "ok") {
    const copy = connectionTestCopy(probe.code, service.secretField === "token" ? "Plex token" : "API key")
    const field = copy.field === "secret" && service.secretField ? service.secretField : "url"
    return { success: false, code: "UPSTREAM_UNAVAILABLE", error: `${copy.title}. ${copy.fix}`, fieldErrors: { [field]: [copy.fieldError] } }
  }

  const built = await service.toRow(config)
  if (!built.ok) return built.failure

  await prisma.$transaction(async (tx) => {
    await saveActiveService(kind, built.row, { tx })
    await within?.(tx)
  })

  logAuditEvent(
    AuditEventType.CONFIG_CHANGED,
    actor,
    configDiff(section, stored && audited(stored, storedSecret), audited(config, secret), {
      secretFields: ["secret"],
      urlFields: service.secretField ? ["url", "publicUrl"] : ["url"],
    })
  )
  return ok(null)
}
