/**
 * Producer handles for the Rewind queues: requests and jobs add work here.
 *
 * The queues run on the fail-fast request-path client (`getRequestPathRedis`),
 * so an add while Redis is down fails within about two seconds instead of
 * hanging the request (BP-20, FR-50). The Workers that consume these queues
 * live in `lib/queue/rewind-queues.ts`.
 *
 * @module
 */

import { Queue } from "bullmq"

import { onShutdown } from "@/lib/instrumentation/shutdown"
import { getRequestPathRedis } from "@/lib/queue/connection"
import type { RewindQueueName } from "@/lib/queue/rewind-queues"

const queues = new Map<RewindQueueName, Queue>()

/** The producer for one Rewind queue, created on first use and closed on shutdown. */
export function getRewindQueue(name: RewindQueueName): Queue {
  let queue = queues.get(name)
  if (!queue) {
    queue = new Queue(name, {
      connection: getRequestPathRedis(),
      defaultJobOptions: {
        removeOnComplete: { age: 24 * 60 * 60 },
        removeOnFail: { age: 7 * 24 * 60 * 60 },
      },
    })
    if (queues.size === 0) {
      onShutdown("rewind-producers", "close", async () => {
        const open = [...queues.values()]
        queues.clear()
        await Promise.allSettled(open.map((q) => q.close()))
      })
    }
    queues.set(name, queue)
  }
  return queue
}
