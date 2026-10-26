/**
 * The Discord gateway's login count and health, kept where a restart does not
 * clear them: Redis when `REDIS_URL` is set (a sorted set of login times, plus
 * a hash of counters), else this process's memory.
 *
 * `/api/metrics` and Admin, Settings, Discord read it through
 * {@link readGatewayStats}.
 *
 * @module lib/discord/login-ledger
 */

import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("discord-ledger")

const WINDOW_MS = 24 * 60 * 60 * 1000
const LOGINS_KEY = "pm:discord:logins"
const STATS_KEY = "pm:discord:gateway"

export type GatewayHealth = "ok" | "backoff" | "fatal" | "daily_cap"

export interface GatewayStats {
  /** IDENTIFY attempts in the last 24 hours. */
  logins24h: number
  loginsTotal: number
  disconnectsTotal: number
  /** The close code of the latest disconnect, null before any. */
  lastCloseCode: number | null
  health: GatewayHealth
  /** Why the bot is not healthy, for the admin; never holds the token. */
  healthMessage: string | null
}

interface RedisLike {
  zadd(key: string, score: number, member: string): Promise<unknown>
  zremrangebyscore(key: string, min: number | string, max: number | string): Promise<unknown>
  zcard(key: string): Promise<number>
  hincrby(key: string, field: string, by: number): Promise<unknown>
  hset(key: string, values: Record<string, string>): Promise<unknown>
  hgetall(key: string): Promise<Record<string, string>>
  expire(key: string, seconds: number): Promise<unknown>
}

async function redis(): Promise<RedisLike | null> {
  const { isRedisConfigured, getRequestPathRedis, getRedisConnection } = await import("@/lib/queue/connection")
  if (!isRedisConfigured()) return null
  // The bot runs in a worker or all-in-one process; the request path client is for web.
  return (process.env.PROCESS_ROLE === "web" ? getRequestPathRedis() : getRedisConnection()) as unknown as RedisLike
}

/** Logins in a rolling 24 hours. Redis errors fall back to the in-process list rather than failing a login. */
export class LoginLedger {
  private local: number[] = []
  private memberSeq = 0

  async count(now: number): Promise<number> {
    this.local = this.local.filter((at) => at > now - WINDOW_MS)
    try {
      const client = await redis()
      if (!client) return this.local.length
      await client.zremrangebyscore(LOGINS_KEY, 0, now - WINDOW_MS)
      return Math.max(await client.zcard(LOGINS_KEY), this.local.length)
    } catch (error) {
      logger.warn("discord.ledger_read_failed", { error: String(error) })
      return this.local.length
    }
  }

  async record(now: number): Promise<void> {
    this.local.push(now)
    try {
      const client = await redis()
      if (!client) return
      await client.zadd(LOGINS_KEY, now, `${now}:${process.pid}:${this.memberSeq++}`)
      await client.hincrby(STATS_KEY, "loginsTotal", 1)
      await client.expire(LOGINS_KEY, WINDOW_MS / 1000)
    } catch (error) {
      logger.warn("discord.ledger_write_failed", { error: String(error) })
    }
  }
}

/** Counts a gateway disconnect and keeps its close code. Never throws. */
export async function recordGatewayDisconnect(code: number): Promise<void> {
  try {
    const client = await redis()
    if (!client) return
    await client.hincrby(STATS_KEY, "disconnectsTotal", 1)
    await client.hset(STATS_KEY, { lastCloseCode: String(code) })
  } catch (error) {
    logger.warn("discord.ledger_write_failed", { error: String(error) })
  }
}

/** Publishes the bot's health for the admin page and metrics. Never throws. */
export async function recordGatewayHealth(health: GatewayHealth, message: string | null): Promise<void> {
  try {
    const client = await redis()
    if (!client) return
    await client.hset(STATS_KEY, { health, healthMessage: message ?? "" })
  } catch (error) {
    logger.warn("discord.ledger_write_failed", { error: String(error) })
  }
}

/** Null when there is no Redis to read. */
export async function readGatewayStats(): Promise<GatewayStats | null> {
  const client = await redis()
  if (!client) return null
  await client.zremrangebyscore(LOGINS_KEY, 0, Date.now() - WINDOW_MS)
  const [logins24h, hash] = await Promise.all([client.zcard(LOGINS_KEY), client.hgetall(STATS_KEY)])
  const health = hash.health
  return {
    logins24h,
    loginsTotal: Number(hash.loginsTotal ?? 0),
    disconnectsTotal: Number(hash.disconnectsTotal ?? 0),
    lastCloseCode: hash.lastCloseCode ? Number(hash.lastCloseCode) : null,
    health: health === "backoff" || health === "fatal" || health === "daily_cap" ? health : "ok",
    healthMessage: hash.healthMessage || null,
  }
}
