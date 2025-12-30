/**
 * Redis Connection Manager for BullMQ
 *
 * Provides shared Redis connections for all queue operations.
 * Uses lazy initialization to avoid connecting during build.
 */

import Redis, { RedisOptions } from "ioredis"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("QUEUE_CONNECTION")

let redisConnection: Redis | null = null

/**
 * Get Redis connection options from environment
 */
export function getRedisOptions(): RedisOptions {
  return {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
    lazyConnect: true,
  }
}

/**
 * Get the Redis URL from environment
 * @throws Error if REDIS_URL is not configured
 */
export function getRedisUrl(): string {
  const url = process.env.REDIS_URL
  if (!url) {
    throw new Error("REDIS_URL environment variable is required for queue operations")
  }
  return url
}

/**
 * Check if Redis is configured
 */
export function isRedisConfigured(): boolean {
  return !!process.env.REDIS_URL
}

/**
 * Get or create the shared Redis connection
 * Uses lazy initialization - connection is only created when first accessed
 */
export function getRedisConnection(): Redis {
  if (!redisConnection) {
    const url = getRedisUrl()
    redisConnection = new Redis(url, getRedisOptions())

    redisConnection.on("error", (err) => {
      logger.error("Redis connection error", err)
    })

    redisConnection.on("connect", () => {
      logger.info("Redis connected")
    })

    redisConnection.on("close", () => {
      logger.debug("Redis connection closed")
    })

    redisConnection.on("reconnecting", () => {
      logger.debug("Redis reconnecting")
    })
  }

  return redisConnection
}

/**
 * Close the Redis connection gracefully
 * Should be called during application shutdown
 */
export async function closeRedisConnection(): Promise<void> {
  const connection = redisConnection
  if (connection) {
    redisConnection = null
    try {
      await connection.quit()
      logger.info("Redis connection closed gracefully")
    } catch (error) {
      logger.error("Error closing Redis connection", error)
      // Force disconnect if quit fails
      connection.disconnect()
    }
  }
}

/**
 * Check if Redis connection is healthy
 */
export async function isRedisHealthy(): Promise<boolean> {
  if (!redisConnection) {
    return false
  }

  try {
    const result = await redisConnection.ping()
    return result === "PONG"
  } catch {
    return false
  }
}
