/**
 * Script to profile maintenance rule query performance
 * Issue #39: Investigate potential N+1 query in maintenance rule fetching
 *
 * Usage:
 *   npx tsx scripts/profile-maintenance-query.ts [--seed] [--cleanup]
 *
 * Options:
 *   --seed     Create synthetic test data (100 rules, 10 scans each)
 *   --cleanup  Remove synthetic test data after profiling
 */

import { PrismaClient } from "../lib/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not defined")
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
})

const prisma = new PrismaClient({
  adapter,
  log: [
    { emit: "event", level: "query" },
    { emit: "stdout", level: "info" },
    { emit: "stdout", level: "warn" },
    { emit: "stdout", level: "error" },
  ],
})

const TEST_DATA_PREFIX = "__PERF_TEST__"
// Default test sizes - Issue #39 specified 100+ rules, 1000+ scans
const RULE_COUNT = 100
const SCANS_PER_RULE = 10

interface QueryLog {
  query: string
  params: string
  duration: number
  timestamp: Date
}

const queryLogs: QueryLog[] = []

// Log all queries for analysis
prisma.$on("query", (e) => {
  queryLogs.push({
    query: e.query,
    params: e.params,
    duration: e.duration,
    timestamp: new Date(),
  })
})

async function seedTestData() {
  console.log(`\nSeeding test data: ${RULE_COUNT} rules with ${SCANS_PER_RULE} scans each...`)

  const start = Date.now()

  for (let i = 0; i < RULE_COUNT; i++) {
    const rule = await prisma.maintenanceRule.create({
      data: {
        name: `${TEST_DATA_PREFIX} Rule ${i + 1}`,
        description: `Performance test rule ${i + 1}`,
        enabled: i % 2 === 0,
        mediaType: i % 2 === 0 ? "MOVIE" : "TV_SERIES",
        criteria: {
          minDaysUnwatched: 30 + i,
          minDaysSinceAdded: 90 + i,
        },
        actionType: "FLAG_FOR_REVIEW",
        schedule: "0 0 * * *",
      },
    })

    // Create scans for this rule
    for (let j = 0; j < SCANS_PER_RULE; j++) {
      await prisma.maintenanceScan.create({
        data: {
          ruleId: rule.id,
          status: "COMPLETED",
          startedAt: new Date(Date.now() - (SCANS_PER_RULE - j) * 86400000),
          completedAt: new Date(Date.now() - (SCANS_PER_RULE - j) * 86400000 + 60000),
          itemsScanned: 100 + j * 10,
          itemsFlagged: j * 2,
        },
      })
    }
  }

  const duration = Date.now() - start
  console.log(`Seeded ${RULE_COUNT * (1 + SCANS_PER_RULE)} records in ${duration}ms`)
}

async function cleanupTestData() {
  console.log("\nCleaning up test data...")

  const rules = await prisma.maintenanceRule.findMany({
    where: { name: { startsWith: TEST_DATA_PREFIX } },
    select: { id: true },
  })

  // Cascading delete will handle scans
  await prisma.maintenanceRule.deleteMany({
    where: { name: { startsWith: TEST_DATA_PREFIX } },
  })

  console.log(`Deleted ${rules.length} test rules and their scans`)
}

async function runCurrentQuery(): Promise<{ duration: number; resultCount: number }> {
  queryLogs.length = 0 // Clear previous logs

  const start = Date.now()

  const rules = await prisma.maintenanceRule.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      scans: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          itemsScanned: true,
          itemsFlagged: true,
          completedAt: true,
        },
      },
      _count: {
        select: {
          scans: true,
        },
      },
    },
  })

  const duration = Date.now() - start

  return { duration, resultCount: rules.length }
}

async function runOptimizedQuery(): Promise<{
  duration: number
  resultCount: number
  scanFetched: number
}> {
  queryLogs.length = 0 // Clear previous logs

  const start = Date.now()

  // Fetch rules without relations first
  const rules = await prisma.maintenanceRule.findMany({
    orderBy: { createdAt: "desc" },
  })

  const ruleIds = rules.map((r) => r.id)

  // Fetch latest scans using Prisma's distinct to avoid N+1
  const latestScans = await prisma.maintenanceScan.findMany({
    where: {
      ruleId: { in: ruleIds },
    },
    orderBy: { createdAt: "desc" },
    distinct: ["ruleId"],
    select: {
      id: true,
      ruleId: true,
      status: true,
      itemsScanned: true,
      itemsFlagged: true,
      completedAt: true,
    },
  })

  // Get scan counts per rule
  const scanCounts = await prisma.maintenanceScan.groupBy({
    by: ["ruleId"],
    where: { ruleId: { in: ruleIds } },
    _count: { id: true },
  })

  const duration = Date.now() - start

  // Create a map for easy lookup
  const scansByRuleId = new Map(latestScans.map((s) => [s.ruleId, s]))
  const countsByRuleId = new Map(scanCounts.map((c) => [c.ruleId, c._count.id]))

  // Combine results (for demonstration)
  const combinedResults = rules.map((rule) => ({
    ...rule,
    latestScan: scansByRuleId.get(rule.id) || null,
    scanCount: countsByRuleId.get(rule.id) || 0,
  }))

  return {
    duration,
    resultCount: combinedResults.length,
    scanFetched: latestScans.length,
  }
}

async function printQueryAnalysis(label: string) {
  console.log(`\n--- Query Analysis: ${label} ---`)
  console.log(`Total queries: ${queryLogs.length}`)

  const totalDuration = queryLogs.reduce((sum, q) => sum + q.duration, 0)
  console.log(`Total query time: ${totalDuration}ms`)

  // Group queries by type
  const queryTypes = new Map<string, number>()
  for (const log of queryLogs) {
    const type = log.query.split(" ")[0]
    queryTypes.set(type, (queryTypes.get(type) || 0) + 1)
  }

  console.log("Query breakdown:")
  for (const [type, count] of queryTypes) {
    console.log(`  ${type}: ${count}`)
  }

  // Show slowest queries
  const slowest = [...queryLogs].sort((a, b) => b.duration - a.duration).slice(0, 3)
  if (slowest.length > 0) {
    console.log("Slowest queries:")
    for (const q of slowest) {
      console.log(`  ${q.duration}ms: ${q.query.substring(0, 100)}...`)
    }
  }
}

async function main() {
  const args = process.argv.slice(2)
  const shouldSeed = args.includes("--seed")
  const shouldCleanup = args.includes("--cleanup")

  console.log("=== Maintenance Query Performance Profiling ===")
  console.log(`Issue #39: Investigate potential N+1 query`)

  try {
    if (shouldSeed) {
      await seedTestData()
    }

    // Get data counts for profiling
    const [ruleCount, scanCount] = await Promise.all([
      prisma.maintenanceRule.count(),
      prisma.maintenanceScan.count(),
    ])

    console.log(`\nData for profiling: ${ruleCount} rules, ${scanCount} scans`)

    // Profile current implementation
    console.log("\n========================================")
    console.log("CURRENT IMPLEMENTATION (with include)")
    console.log("========================================")

    const iterations = 5
    const currentTimes: number[] = []

    for (let i = 0; i < iterations; i++) {
      const result = await runCurrentQuery()
      currentTimes.push(result.duration)
      console.log(`  Run ${i + 1}: ${result.duration}ms (${result.resultCount} rules)`)
    }

    await printQueryAnalysis("Current Implementation")

    const avgCurrent = currentTimes.reduce((a, b) => a + b, 0) / currentTimes.length
    console.log(`\nAverage: ${avgCurrent.toFixed(2)}ms`)
    console.log(`Min: ${Math.min(...currentTimes)}ms`)
    console.log(`Max: ${Math.max(...currentTimes)}ms`)

    // Profile optimized implementation
    console.log("\n========================================")
    console.log("OPTIMIZED IMPLEMENTATION (separate queries)")
    console.log("========================================")

    const optimizedTimes: number[] = []

    for (let i = 0; i < iterations; i++) {
      const result = await runOptimizedQuery()
      optimizedTimes.push(result.duration)
      console.log(
        `  Run ${i + 1}: ${result.duration}ms (${result.resultCount} rules, ${result.scanFetched} scans)`
      )
    }

    await printQueryAnalysis("Optimized Implementation")

    const avgOptimized = optimizedTimes.reduce((a, b) => a + b, 0) / optimizedTimes.length
    console.log(`\nAverage: ${avgOptimized.toFixed(2)}ms`)
    console.log(`Min: ${Math.min(...optimizedTimes)}ms`)
    console.log(`Max: ${Math.max(...optimizedTimes)}ms`)

    // Summary
    console.log("\n========================================")
    console.log("PERFORMANCE SUMMARY")
    console.log("========================================")
    console.log(`Current implementation: ${avgCurrent.toFixed(2)}ms avg`)
    console.log(`Optimized implementation: ${avgOptimized.toFixed(2)}ms avg`)

    const improvement = ((avgCurrent - avgOptimized) / avgCurrent) * 100
    if (improvement > 0) {
      console.log(`Improvement: ${improvement.toFixed(1)}% faster`)
    } else {
      console.log(`Change: ${Math.abs(improvement).toFixed(1)}% slower (optimization not needed)`)
    }

    const threshold = 1000 // 1 second
    console.log(`\nThreshold: ${threshold}ms`)
    if (avgCurrent > threshold) {
      console.log(`RECOMMENDATION: Current query exceeds threshold, optimization recommended`)
    } else {
      console.log(
        `RECOMMENDATION: Current query is within acceptable limits (< ${threshold}ms)`
      )
    }

    if (shouldCleanup) {
      await cleanupTestData()
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
