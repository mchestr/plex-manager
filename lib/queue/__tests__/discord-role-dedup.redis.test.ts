/**
 * @jest-environment node
 */

/**
 * `roleSyncJobOptions` against the server in TEST_REDIS_URL (P4.18): role
 * syncs for one member collapse into one pending job, whatever their reason,
 * while another member's sync is its own job.
 */

import { randomUUID } from "node:crypto"
import { Queue } from "bullmq"
import type Redis from "ioredis"

import { roleSyncJobOptions } from "@/lib/discord/role-sync"
import { createFailFastRedis, readyWithin } from "@/lib/queue/connection"
import { JOB_TYPES } from "@/lib/queue/types"
import { describeRedis } from "@/__tests__/helpers/integration"

jest.mock("@/lib/discord/integration", () => ({
  getDiscordIntegration: jest.fn(),
  syncDiscordRoleConnection: jest.fn(),
}))
jest.mock("@/lib/prisma", () => ({ prisma: {} }))

describeRedis("Discord role sync deduplication", (redisUrl) => {
  let connection: Redis
  let queue: Queue

  beforeAll(async () => {
    connection = createFailFastRedis(redisUrl)
    expect(await readyWithin(connection, 2000)).toBe(true)
    queue = new Queue(`discord-role-test-${randomUUID()}`, { connection })
  })

  afterAll(async () => {
    await queue.obliterate({ force: true })
    await queue.close()
    await connection.quit()
  })

  it("keeps one pending sync per member", async () => {
    const member = randomUUID()
    const other = randomUUID()
    const add = (userId: string, reason: string, jobId: string) =>
      queue.add(JOB_TYPES.DISCORD_ROLE_SYNC, { userId, reason, refreshHours: false }, { ...roleSyncJobOptions(userId), jobId })

    const first = await add(member, "unshared", "a")
    const second = await add(member, "subscription_changed", "b")
    const third = await add(other, "unshared", "c")

    expect(second.id).toBe(first.id)
    expect(third.id).toBe("c")
    expect(await queue.getWaitingCount()).toBe(2)
  })
})
