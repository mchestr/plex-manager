import "server-only"

import { serviceErrorMessage, type ServiceResult } from "@/lib/connections/http"

type BypassEnv = { NODE_ENV?: string; SKIP_CONNECTION_TESTS?: string; E2E_TEST_MODE?: string }

/**
 * True when connection tests (and the plex.tv user lookup) are skipped: under
 * Jest (`NODE_ENV=test`), or for an E2E server that sets both
 * `SKIP_CONNECTION_TESTS=true` and `E2E_TEST_MODE=true`. The E2E suite runs
 * against a production build, so the pair also works under
 * `NODE_ENV=production`; `SKIP_CONNECTION_TESTS` alone never does, and a real
 * deployment never sets `E2E_TEST_MODE` (see `example.env`).
 *
 * @example
 * ```ts
 * isConnectionTestBypassed({ NODE_ENV: "production", SKIP_CONNECTION_TESTS: "true" }) // false
 * isConnectionTestBypassed({ NODE_ENV: "test" })                                      // true
 * ```
 */
export function isConnectionTestBypassed(env: BypassEnv = process.env): boolean {
  return env.NODE_ENV === "test" || (env.SKIP_CONNECTION_TESTS === "true" && env.E2E_TEST_MODE === "true")
}

/**
 * Run a service's connection check and turn the result into the setup forms'
 * `{ success, error }` shape, with fixed messages only. Skipped when
 * {@link isConnectionTestBypassed}.
 */
export async function testServiceConnection(
  service: string,
  check: () => Promise<ServiceResult<unknown, string>>,
  messages: { unauthorized?: string } = {}
): Promise<{ success: boolean; error?: string }> {
  if (isConnectionTestBypassed()) return { success: true }

  const result = await check()
  if (result.ok) return { success: true }
  if (result.code === "HTTP" && (result.status === 401 || result.status === 403)) {
    return { success: false, error: messages.unauthorized ?? "Invalid API key" }
  }
  if (result.code === "HTTP" && result.status === 404) {
    return { success: false, error: `${service} server not found at this address` }
  }
  if (result.code === "TIMEOUT") {
    return { success: false, error: "Connection timeout - check your hostname and port" }
  }
  return { success: false, error: serviceErrorMessage(service, result) }
}
