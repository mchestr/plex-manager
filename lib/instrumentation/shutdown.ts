/**
 * The one shutdown coordinator for the server process (BP-15).
 *
 * On SIGTERM or SIGINT it aborts {@link shutdownSignal} first, so long jobs
 * stop at their next checkpoint, then runs the registered tasks in two phases
 * under one deadline of `SHUTDOWN_GRACE_MS` (default 8000, below Docker's 10 s
 * stop timeout):
 *
 * ```
 * signal ─► abort shutdownSignal ─► drain (workers, bot, polling) ─► close (queue, Redis, Prisma) ─► exit 0
 *                                   └──────────── deadline passes ─────────────────────────────────► exit 1
 * ```
 *
 * Tasks inside a phase run together (`Promise.allSettled`). A task still
 * running at the deadline is abandoned: a BullMQ worker cut off that way leaves
 * its job locked, and BullMQ's stall check hands it to the next worker. (A
 * second `worker.close(true)` cannot help, because BullMQ returns the graceful
 * close already in progress.) The process exits last, so in-flight HTTP
 * requests get the grace window too: with `NEXT_MANUAL_SIG_HANDLE=true`, Next
 * no longer closes the HTTP server itself.
 *
 * @module
 */

import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("SHUTDOWN")

type Phase = "drain" | "close"
type ShutdownTask = () => Promise<unknown>

const DEFAULT_GRACE_MS = 8000
const PHASES: readonly Phase[] = ["drain", "close"]

const controller = new AbortController()

/** Aborts as soon as shutdown begins: the `workerShutdownSignal` of the Rewind design (9.1). */
export const shutdownSignal = controller.signal

const tasks: Record<Phase, Array<{ name: string; fn: ShutdownTask }>> = { drain: [], close: [] }
let installed = false
let started = false

/** Registers a task to run in `phase` when the process shuts down. */
export function onShutdown(name: string, phase: Phase, fn: ShutdownTask): void {
  tasks[phase].push({ name, fn })
}

function graceMs(): number {
  const parsed = Number.parseInt(process.env.SHUTDOWN_GRACE_MS ?? "", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_GRACE_MS
}

async function runPhase(phase: Phase): Promise<void> {
  await Promise.allSettled(
    tasks[phase].map(async ({ name, fn }) => {
      const startedAt = Date.now()
      try {
        await fn()
        logger.info(`shutdown.task ${name} done`, { task: name, phase, durationMs: Date.now() - startedAt })
      } catch (error) {
        logger.error(`shutdown.task ${name} failed`, error, { task: name, phase, durationMs: Date.now() - startedAt })
      }
    })
  )
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (started) {
    logger.info("Shutdown already in progress", { signal })
    return
  }
  started = true
  const grace = graceMs()
  logger.info("Shutting down", { signal, graceMs: grace })
  controller.abort()

  let timer: NodeJS.Timeout | undefined
  const timedOut = new Promise<true>((resolve) => {
    timer = setTimeout(() => resolve(true), grace)
  })
  const finished = (async () => {
    for (const phase of PHASES) {
      await runPhase(phase)
    }
    return false as const
  })()

  const cutOff = await Promise.race([finished, timedOut])
  clearTimeout(timer)
  if (cutOff) {
    logger.error("Shutdown deadline passed; exiting with tasks still running", undefined, { graceMs: grace })
  } else {
    logger.info("Shutdown complete")
  }
  process.exit(cutOff ? 1 : 0)
}

/**
 * Handles SIGTERM and SIGINT once per process. Skipped under Jest
 * (`NODE_ENV=test`). A second signal during shutdown is logged and ignored, so
 * the drain is never cut short by Node's default handler.
 */
export function installShutdownHandlers(): void {
  if (installed || process.env.NODE_ENV === "test") return
  installed = true
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => void shutdown(signal))
  }
}
