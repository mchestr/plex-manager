/**
 * One connection check as a status and a code (P10.19, P10.20): the tester
 * runs with a 5 s cut-off, and its message is classified here and goes no
 * further. `getConnectionHealth()` probes the saved settings; the settings
 * saves and `testService()` probe typed values.
 *
 * @module lib/settings/probe
 */

import "server-only"

import type { ProbeFailureCode } from "@/lib/settings/connection-status"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("CONNECTION_HEALTH")

/** A tester that has not answered by now counts as `unreachable` with `TIMEOUT` (P2.3's budget).
 * @internal
 */
export const PROBE_TIMEOUT_MS = 5000

export type Tester = () => Promise<{ success: boolean; error?: string }>

/** `ok`, or `unreachable` with why; never the tester's message. */
export type Probe = { status: "ok"; code: null } | { status: "unreachable"; code: ProbeFailureCode }

/** Classifies a tester's fixed message into a code; the message itself stops here. */
function failureCode(error: string | undefined): ProbeFailureCode {
  if (!error) return "UNREACHABLE"
  if (/timeout/i.test(error)) return "TIMEOUT"
  if (/invalid|privilege|unauthori/i.test(error)) return "UNAUTHORIZED"
  if (/not found/i.test(error)) return "NOT_FOUND"
  return "UNREACHABLE"
}

/**
 * `ok`, or `unreachable` with a code, cut off at {@link PROBE_TIMEOUT_MS}; a
 * thrown tester is logged (with `id`) without reaching the result.
 */
export async function probeConnection(id: string, test: Tester): Promise<Probe> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<Probe>((resolve) => {
    timer = setTimeout(() => resolve({ status: "unreachable", code: "TIMEOUT" }), PROBE_TIMEOUT_MS)
  })
  const run = test().then(
    (result): Probe =>
      result.success ? { status: "ok", code: null } : { status: "unreachable", code: failureCode(result.error) },
    (error: unknown): Probe => {
      logger.warn("Connection test threw", { id, error })
      return { status: "unreachable", code: "UNREACHABLE" }
    }
  )
  try {
    return await Promise.race([run, timeout])
  } finally {
    clearTimeout(timer)
  }
}
