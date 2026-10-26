/**
 * The metrics `/api/metrics` serves (BP-17, P11.4), in the Prometheus text
 * format, from five sources:
 *
 * | Source         | Metric                                               |
 * |----------------|------------------------------------------------------|
 * | `queues`       | `plex_manager_queue_jobs{queue,state}`               |
 * | `job_failures` | `plex_manager_job_failures_total{queue,job}`         |
 * | `llm_spend`    | `plex_manager_llm_spend_usd{purpose,period}` (60 s cache) |
 * | `discord`      | `plex_manager_discord_*`: gateway logins (total, last 24 h), disconnects, last close code, health |
 * | the process    | `plex_manager_build_info`, `process_resident_memory_bytes`, `plex_manager_event_loop_delay_p99_seconds` |
 *
 * Each source has 2 s. One that fails or times out sets
 * `plex_manager_scrape_error{source}` to 1 and is left out; the body never
 * holds error text. The queue counts are the ones the admin queues page shows.
 *
 * @module lib/observability/metrics
 */

import "server-only"

import { monitorEventLoopDelay, type IntervalHistogram } from "node:perf_hooks"

import { getEnv } from "@/lib/env"
import { llmSpendSince } from "@/lib/llm/usage-totals"
import { readGatewayStats } from "@/lib/discord/login-ledger"
import { readJobFailures } from "@/lib/observability/job-failures"
import { renderMetrics, type Metric, type Sample } from "@/lib/observability/prometheus-text"
import { getQueueStats, QUEUE_NAME } from "@/lib/queue/client"
import { getRequestPathRedis, isRedisConfigured, readyWithin } from "@/lib/queue/connection"
import { getRewindQueue } from "@/lib/queue/rewind-producers"
import { serverZone } from "@/lib/utils/server-zone"
import { dayKey, wallTimeToInstant } from "@/lib/utils/zoned-time"
import packageJson from "@/package.json"

const SOURCE_TIMEOUT_MS = 2000
const SPEND_CACHE_MS = 60_000
const REWIND_QUEUES = ["rewind-batch", "rewind-gen", "rewind-aux"] as const
const JOB_STATES = ["waiting", "active", "completed", "failed", "delayed", "prioritized"] as const

type Source = "queues" | "job_failures" | "llm_spend"

function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timed out")), ms)
  })
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer))
}

async function redisReady() {
  if (!(await readyWithin(getRequestPathRedis(), SOURCE_TIMEOUT_MS))) throw new Error("Redis is not ready")
  return getRequestPathRedis()
}

async function queueSamples(): Promise<Sample[]> {
  await redisReady()
  const counts = await Promise.all([
    getQueueStats().then((stats) => [QUEUE_NAME, stats] as const),
    ...REWIND_QUEUES.map(async (name) => [name, await getRewindQueue(name).getJobCounts(...JOB_STATES)] as const),
  ])
  return counts.flatMap(([queue, byState]) =>
    JOB_STATES.map((state) => ({ labels: { queue, state }, value: (byState as Record<string, number>)[state] ?? 0 }))
  )
}

async function failureSamples(): Promise<Sample[]> {
  const failures = await readJobFailures(await redisReady())
  return failures.map(({ queue, job, count }) => ({ labels: { queue, job }, value: count }))
}

/** The Discord gateway's login and disconnect counts; empty until the bot has logged in once. */
async function discordMetrics(): Promise<Metric[]> {
  const stats = await readGatewayStats()
  if (!stats) return []
  const one = (name: string, help: string, type: Metric["type"], value: number): Metric => ({
    name: `plex_manager_discord_${name}`,
    help,
    type,
    samples: [{ value }],
  })
  return [
    one("gateway_logins_total", "Gateway login (IDENTIFY) attempts.", "counter", stats.loginsTotal),
    one("gateway_logins_24h", "Gateway login attempts in the last 24 hours; Discord resets the token near 1000.", "gauge", stats.logins24h),
    one("gateway_disconnects_total", "Gateway disconnects.", "counter", stats.disconnectsTotal),
    ...(stats.lastCloseCode === null
      ? []
      : [one("gateway_last_close_code", "Close code of the latest gateway disconnect.", "gauge", stats.lastCloseCode)]),
    one("bot_healthy", "1 unless the bot is blocked by a rejected token, backoff or the daily login cap.", "gauge", stats.health === "ok" ? 1 : 0),
  ]
}

let spendCache: { samples: Sample[]; expiresAt: number } | null = null

/** Today's and this month's spend, both from midnight in the server zone. */
async function spendSamples(): Promise<Sample[]> {
  const now = Date.now()
  if (spendCache && spendCache.expiresAt > now) return spendCache.samples
  const zone = await serverZone()
  const today = dayKey(now, zone)
  const periods = [
    ["day", wallTimeToInstant(`${today}T00:00`, zone)],
    ["month", wallTimeToInstant(`${today.slice(0, 8)}01T00:00`, zone)],
  ] as const
  const spends = await Promise.all(periods.map(async ([period, since]) => [period, await llmSpendSince(since)] as const))
  const samples = spends.flatMap(([period, byPurpose]) =>
    Object.entries(byPurpose).map(([purpose, usd]) => ({ labels: { purpose, period }, value: usd }))
  )
  spendCache = { samples, expiresAt: now + SPEND_CACHE_MS }
  return samples
}

let loopDelay: IntervalHistogram | null = null

/** The p99 event-loop delay since the last scrape, in seconds; the histogram starts on the first scrape. */
function eventLoopDelayP99(): number {
  if (!loopDelay) {
    loopDelay = monitorEventLoopDelay({ resolution: 20 })
    loopDelay.enable()
  }
  const p99 = loopDelay.percentile(99) / 1e9
  loopDelay.reset()
  return p99
}

/** The whole exposition body; never throws. */
export async function collectMetrics(): Promise<string> {
  // Without Redis there are no queues to count
  const reads: Record<Source, () => Promise<Sample[]>> = {
    queues: queueSamples,
    job_failures: failureSamples,
    llm_spend: spendSamples,
  }
  const sources = (Object.keys(reads) as Source[])
    .filter((source) => isRedisConfigured() || source === "llm_spend")
    .map((source) => [source, reads[source]] as const)
  const results = await Promise.all(
    sources.map(async ([source, read]) => {
      try {
        return { source, samples: await within(read(), SOURCE_TIMEOUT_MS) }
      } catch {
        return { source, samples: null }
      }
    })
  )
  const discord = isRedisConfigured()
    ? await within(discordMetrics(), SOURCE_TIMEOUT_MS).catch(() => null)
    : []
  const samplesOf = (source: Source) => results.find((r) => r.source === source)?.samples ?? []

  const metrics: Metric[] = [
    { name: "plex_manager_queue_jobs", help: "Jobs in each queue by state.", type: "gauge", samples: samplesOf("queues") },
    {
      name: "plex_manager_job_failures_total",
      help: "Failed job attempts by queue and job type.",
      type: "counter",
      samples: samplesOf("job_failures"),
    },
    {
      name: "plex_manager_llm_spend_usd",
      help: "LLM spend in USD for the server-zone day and month.",
      type: "gauge",
      samples: samplesOf("llm_spend"),
    },
    {
      name: "plex_manager_scrape_error",
      help: "1 when a source failed or timed out in this scrape.",
      type: "gauge",
      samples: [
        ...results.map(({ source, samples }) => ({ labels: { source }, value: samples ? 0 : 1 })),
        ...(discord ? [] : [{ labels: { source: "discord" }, value: 1 }]),
      ],
    },
    ...(discord ?? []),
    {
      name: "plex_manager_build_info",
      help: "The running build.",
      type: "gauge",
      samples: [{ labels: { version: packageJson.version, commit: getEnv().BUILD_COMMIT ?? "unknown" }, value: 1 }],
    },
    {
      name: "process_resident_memory_bytes",
      help: "Resident memory size in bytes.",
      type: "gauge",
      samples: [{ value: process.memoryUsage.rss() }],
    },
    {
      name: "plex_manager_event_loop_delay_p99_seconds",
      help: "p99 event-loop delay since the previous scrape.",
      type: "gauge",
      samples: [{ value: eventLoopDelayP99() }],
    },
  ]
  return renderMetrics(metrics)
}
