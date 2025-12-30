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

  // Dynamically import Node.js-specific instrumentation
  // This prevents Edge Runtime from analyzing Node.js-only dependencies
  const { startNodeInstrumentation } = await import("./lib/instrumentation/node")
  await startNodeInstrumentation()
}
