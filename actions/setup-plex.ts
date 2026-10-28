"use server"

/**
 * Setup's Connect with Plex (P10.25, UI-03): the owner signs in to plex.tv
 * through the same PIN flow as member sign-in, picks one of their own
 * servers, and Plex Manager saves it with that server's token. Every action
 * needs the setup claim (P11.32).
 *
 * ```
 * startSetupPlexConnect   a strong PIN in the signed pm-setup-plex-pin cookie
 *                         (purpose setup-plex-pin); returns the app.plex.tv URL
 * pollSetupPlexConnect    idle | waiting | expired | ready, with the account
 *                         name and its servers, every token stripped
 * chooseSetupPlexServer   re-reads the servers on the server, requires an
 *                         owned one, saves it as the active Plex server with
 *                         the PIN account as adminPlexUserId, and advances
 * ```
 *
 * The plex.tv account token and the servers' tokens never reach the browser:
 * each action reads the PIN again on the server.
 */

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { setupAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { getPlexUserInfo, testPlexConnection } from "@/lib/connections/plex"
import { createPin, readPin } from "@/lib/connections/plex-pin"
import { readSetupPinCookie, SETUP_PLEX_PIN_COOKIE, setupPinCookie, type SetupPlexPinCookie } from "@/lib/plex-pin-cookie"
import { browserClientId, plexAuthUrl } from "@/lib/plex-pin-flow"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { configDiff } from "@/lib/security/config-diff"
import { saveActiveService } from "@/lib/services/service-config"
import { probeConnection } from "@/lib/settings/probe"
import { readPlexResources, toPickerServer } from "@/lib/setup/plex-resources"
import { advanceSetup } from "@/lib/setup/progress"
import { connectionTestCopy } from "@/lib/ui/error-copy"
import { plexServerSchema } from "@/lib/validations/plex"
import type { SetupPlexPoll } from "@/types/setup"

const START_FAILED = "Plex did not answer. Try again in a few seconds."
const RECONNECT = "The Plex sign-in expired. Connect with Plex again."
const LIST_FAILED = "plex.tv didn't list your servers. Try again in a moment."

async function setupPin(): Promise<SetupPlexPinCookie | null> {
  return readSetupPinCookie((await cookies()).get(SETUP_PLEX_PIN_COOKIE)?.value)
}

/** The account token plex.tv issued for this browser's PIN, or null while it is not ready. */
async function approvedToken(pin: SetupPlexPinCookie): Promise<string | null> {
  const status = await readPin(pin.pinId, pin.code, pin.clientId)
  return status.status === "ready" ? status.authToken : null
}

/** Starts Connect with Plex: plex.tv sends the browser back to the Plex step. */
export const startSetupPlexConnect = setupAction({
  input: z.undefined(),
  rateLimit: { name: "plex:pin:create" },
  fallbackError: START_FAILED,
  handler: async () => {
    const clientId = await browserClientId()
    const pin = await createPin(clientId)
    if (!pin.ok) return fail("UPSTREAM_UNAVAILABLE", START_FAILED)

    ;(await cookies()).set(setupPinCookie({ pinId: pin.data.id, code: pin.data.code, clientId }))
    return ok({ authUrl: plexAuthUrl(clientId, pin.data.code, "/setup?step=plex") })
  },
})

/** Whether plex.tv has approved this browser's PIN and, once it has, the account's servers without tokens. */
export const pollSetupPlexConnect = setupAction({
  input: z.undefined(),
  rateLimit: { name: "plex:pin:poll" },
  fallbackError: LIST_FAILED,
  handler: async () => {
    const pin = await setupPin()
    if (!pin) return ok<SetupPlexPoll>({ status: "idle" })

    const status = await readPin(pin.pinId, pin.code, pin.clientId)
    if (status.status === "expired") {
      ;(await cookies()).delete(SETUP_PLEX_PIN_COOKIE)
      return ok<SetupPlexPoll>({ status: "expired" })
    }
    if (status.status !== "ready") return ok<SetupPlexPoll>({ status: "waiting" })

    const [account, resources] = await Promise.all([getPlexUserInfo(status.authToken), readPlexResources(status.authToken, pin.clientId)])
    if (!account.success || !account.data || !resources.ok) return fail("UPSTREAM_UNAVAILABLE", LIST_FAILED)
    return ok<SetupPlexPoll>({
      status: "ready",
      account: { username: account.data.username },
      servers: resources.data.map(toPickerServer),
    })
  },
})

/**
 * Saves the chosen server. It is looked up again on plex.tv with the PIN's
 * token, so only a server the account owns, at one of its own addresses, is
 * saved, with that server's own token.
 */
export const chooseSetupPlexServer = setupAction({
  input: z.strictObject({ machineIdentifier: z.string().min(1).max(200), uri: z.string().min(1).max(2048) }),
  rateLimit: { name: "setup:plex:choose" },
  fallbackError: "Couldn't save this Plex server",
  handler: async ({ machineIdentifier, uri }, { actor }) => {
    const pin = await setupPin()
    const authToken = pin && (await approvedToken(pin))
    if (!pin || !authToken) return fail("CONFLICT", RECONNECT)

    const resources = await readPlexResources(authToken, pin.clientId)
    if (!resources.ok) return fail("UPSTREAM_UNAVAILABLE", LIST_FAILED)
    const server = resources.data.find((resource) => resource.machineIdentifier === machineIdentifier)
    if (!server) return fail("NOT_FOUND", "That server isn't on this Plex account")
    if (!server.owned || !server.accessToken) return fail("FORBIDDEN", "Only its owner can set it up")
    if (!server.connections.some((connection) => connection.uri === uri)) {
      return fail("VALIDATION", "Choose one of this server's addresses", { fieldErrors: { uri: ["Choose one of this server's addresses"] } })
    }

    const account = await getPlexUserInfo(authToken)
    if (!account.success || !account.data) return fail("UPSTREAM_UNAVAILABLE", LIST_FAILED)

    const adminPlexUserId = account.data.id

    const parsed = plexServerSchema.safeParse({ name: server.name || "Plex", url: uri, token: server.accessToken })
    if (!parsed.success) return fail("VALIDATION", "Choose one of this server's addresses", { fieldErrors: { uri: ["Choose one of this server's addresses"] } })
    const config = parsed.data

    const probe = await probeConnection("plex", () => testPlexConnection(config))
    if (probe.status !== "ok") {
      const copy = connectionTestCopy(probe.code, "Plex token")
      return fail("UPSTREAM_UNAVAILABLE", `${copy.title}. ${copy.fix}`, { fieldErrors: { uri: [copy.fieldError] } })
    }

    await prisma.$transaction(async (tx) => {
      await saveActiveService("plex", { ...config, adminPlexUserId, machineIdentifier, isActive: true }, { tx })
      await advanceSetup(tx, "plex")
    })
    ;(await cookies()).delete(SETUP_PLEX_PIN_COOKIE)

    logAuditEvent(
      AuditEventType.CONFIG_CHANGED,
      actor,
      configDiff("setup.plex", null, { name: config.name, url: config.url, secret: config.token, method: "plex-connect" }, { secretFields: ["secret"], urlFields: ["url"] })
    )
    revalidatePath("/setup")
    return ok(null)
  },
})
