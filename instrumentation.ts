export async function register() {
  // Only run on Node.js runtime (not Edge)
  // Also check if process.on is available (not available in Edge Runtime)
  if (
    typeof process === "undefined" ||
    typeof process.on !== "function" ||
    process.env.NEXT_RUNTIME !== "nodejs"
  ) {
    return
  }

  // Refuse to start a production server with an unsafe environment, before
  // anything else runs.
  const { assertBootEnv } = await import("./lib/env")
  assertBootEnv()

  // Start the background work without awaiting it: Next awaits register()
  // before serving, so a down Redis or a slow Discord login must not sit in
  // front of the return (BP-13). The dynamic import keeps the Edge runtime from
  // analysing Node-only dependencies.
  void import("./lib/instrumentation/node")
    .then((m) => m.startNodeInstrumentation())
    .catch(logBootError)
}

async function logBootError(error: unknown) {
  const { createLogger } = await import("./lib/utils/logger")
  createLogger("INSTRUMENTATION").error("Background start failed", error)
}
