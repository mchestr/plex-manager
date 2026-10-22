/**
 * @jest-environment node
 */

/**
 * `onRequestError` (BP-17, P11.4): one `request.unhandled_error` line with the
 * digest, the route and the request id, and the path masked.
 */

import { captureProductionLogs } from "@/__tests__/helpers/log-capture"

const { lines, loaded } = captureProductionLogs(
  () =>
    require("@/lib/instrumentation/on-request-error") as typeof import("@/lib/instrumentation/on-request-error")
)
const { logUnhandledRequestError } = loaded

const TOKEN = "Kf-qkQFsJ4E6X_vMSKq1PiT624JyrVJtTNbepCgWYl8"

beforeEach(() => {
  lines.length = 0
})

it("logs the digest, route path and request id, with the path masked and no query", async () => {
  const error = Object.assign(new Error("Database exploded"), { digest: "1234567890" })

  await logUnhandledRequestError(
    error,
    { path: `/rewind/s/${TOKEN}?code=oauth-code`, method: "GET", headers: { "x-request-id": "demo-1234abcd" } },
    { routerKind: "App Router", routePath: "/rewind/s/[token]", routeType: "render", renderSource: "server-rendering", revalidateReason: undefined }
  )

  expect(lines).toHaveLength(1)
  const [line] = lines
  expect(line.level).toBe("error")
  expect(line.message).toBe("request.unhandled_error")
  expect(line.metadata).toMatchObject({
    digest: "1234567890",
    method: "GET",
    path: "/rewind/s/[masked]",
    // The redaction masks the share segment of the route pattern too
    routePath: "/rewind/s/[masked]",
    routeType: "render",
    renderSource: "server-rendering",
    requestId: "demo-1234abcd",
    err: expect.objectContaining({ message: "Database exploded", stack: expect.any(String) }),
  })
  expect(JSON.stringify(line)).not.toMatch(/Kf-qkQ|oauth-code/)
})

it("leaves out a digest the error lacks and an invalid request id", async () => {
  await logUnhandledRequestError(
    "not an Error",
    { path: "/api/x", method: "POST", headers: { "x-request-id": ["<script>", "demo-1234abcd"] } },
    { routerKind: "App Router", routePath: "/api/x", routeType: "route", revalidateReason: undefined }
  )

  expect(lines[0].metadata).toMatchObject({ error: "not an Error", path: "/api/x", routeType: "route" })
  expect(lines[0].metadata).not.toHaveProperty("digest")
  expect(lines[0].metadata).not.toHaveProperty("requestId")
})
