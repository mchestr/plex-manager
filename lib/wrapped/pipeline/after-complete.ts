/**
 * Hooks that run after a v3 Rewind commits (design 9.2 step 9).
 *
 * The pipeline's final transaction never enqueues anything itself: once it
 * has committed, `afterRewindCompleted()` runs every registered hook. P5.10
 * registers the card prewarm and P7.14 the "ready" notification. A hook that
 * fails is logged and never fails the generation, whose data is already
 * stored.
 *
 * @module lib/wrapped/pipeline/after-complete
 */

import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("REWIND_AFTER_COMPLETE")

export interface CompletedRewind {
  userId: string
  year: number
  wrappedId: string
  generationId: string
  factsHash: string
  edition: "full" | "pocket" | "postcard"
  /** True when this generation replaced no completed Rewind. */
  first: boolean
}

type Hook = (rewind: CompletedRewind) => Promise<void>

const hooks = new Map<string, Hook>()

/** Registers `hook` under `name`; registering a name again replaces it. @public P5.10 and P7.14 */
export function onRewindCompleted(name: string, hook: Hook): void {
  hooks.set(name, hook)
}

/** Runs every registered hook; failures are logged, never thrown. */
export async function afterRewindCompleted(rewind: CompletedRewind): Promise<void> {
  for (const [name, hook] of hooks) {
    try {
      await hook(rewind)
    } catch (error) {
      logger.warn("A post-completion hook failed", { hook: name, generationId: rewind.generationId, error: String(error) })
    }
  }
}
