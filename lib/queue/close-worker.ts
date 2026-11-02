/**
 * Closes BullMQ Workers at shutdown without waiting on a Redis connection
 * that is not connected.
 *
 * A graceful `Worker.close()` lets active jobs finish, and it needs both of
 * the Worker's connections: its main one, the shared BullMQ connection
 * (`lib/queue/connection.ts`) that jobs record their results on, and its own
 * blocking connection, a duplicate it fetches jobs on, which BullMQ
 * disconnects and then waits to end. After a Redis restart that duplicate
 * reconnects on its own schedule, so it can still be connecting or waiting to
 * retry when the shared connection is back, and ioredis may then never end it:
 *
 * - waiting to retry, `disconnect()` cancels the retry and has no socket to
 *   close, so no `end` follows;
 * - connecting, the connection completes after the disconnect and ioredis
 *   marks the client ready with its socket already closed, so BullMQ's next
 *   disconnect waits for an `end` that never comes.
 *
 * Either held shutdown past its deadline in the image smoke test. So the close
 * is graceful only while both connections are ready, and forced otherwise: no
 * job could record its result anyway, and the stall check hands any active
 * job to the next worker. The statuses are read and BullMQ's disconnect starts
 * in the same tick, so neither connection can change state in between; Redis
 * dropping during a graceful close is left to the shutdown deadline, which
 * names the task.
 *
 * @module
 */

import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("QUEUE_WORKER")

type Status = { status: string }

/** The parts of a BullMQ Worker that {@link closeWorker} reads. */
interface ClosableWorker {
  name: string
  close(force?: boolean): Promise<void>
  getBackend(): {
    connection: Status
    client: Promise<Status>
    blockingConnection?: Status
    blockingClient: Promise<Status> | undefined
  }
}

/**
 * The status of one of a Worker's connections. BullMQ marks a connection
 * ready once it first connects, and only then does its client settle, so a
 * connection that never connected is not waited on.
 */
async function statusOf(connection: Status | undefined, client: Promise<Status> | undefined): Promise<string> {
  if (connection?.status !== "ready" || !client) return connection?.status ?? "none"
  return (await client).status
}

/** Closes `worker`: gracefully while both of its connections are ready, forced otherwise. */
export async function closeWorker(worker: ClosableWorker): Promise<void> {
  const backend = worker.getBackend()
  const shared = await statusOf(backend.connection, backend.client)
  const blocking = await statusOf(backend.blockingConnection, backend.blockingClient)
  const connected = shared === "ready" && blocking === "ready"
  if (!connected) {
    logger.info("Closing a queue worker without waiting for its jobs: Redis is not connected", {
      queue: worker.name,
      shared,
      blocking,
    })
  }
  await worker.close(!connected)
}
