/**
 * Maintenance Rule Scheduler
 *
 * Manages BullMQ job schedulers for maintenance rules with cron schedules.
 * Uses BullMQ's upsertJobScheduler API to create repeatable jobs.
 */

import { maintenanceQueue, type ScanJobData } from "./queue"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("maintenance-scheduler")

/** Prefix for maintenance rule scheduler IDs */
const SCHEDULER_ID_PREFIX = "maintenance-rule-" as const

/**
 * Generate a unique scheduler ID for a rule
 */
function getSchedulerId(ruleId: string): string {
  return `${SCHEDULER_ID_PREFIX}${ruleId}`
}

/**
 * Extract rule ID from a scheduler ID
 * @returns The rule ID if valid, null otherwise
 */
function getRuleIdFromSchedulerId(schedulerId: string): string | null {
  if (schedulerId.startsWith(SCHEDULER_ID_PREFIX)) {
    return schedulerId.slice(SCHEDULER_ID_PREFIX.length)
  }
  return null
}

/**
 * Sync a rule's schedule with BullMQ
 *
 * If the rule has a schedule and is enabled, creates/updates a job scheduler.
 * If the rule has no schedule or is disabled, removes any existing scheduler.
 */
export async function syncRuleSchedule(
  ruleId: string,
  schedule: string | null | undefined,
  enabled: boolean
): Promise<void> {
  const schedulerId = getSchedulerId(ruleId)

  try {
    if (schedule && enabled) {
      // Create or update the job scheduler with the cron pattern
      const jobData: ScanJobData = {
        ruleId,
        manualTrigger: false,
      }

      await maintenanceQueue.upsertJobScheduler(
        schedulerId,
        {
          pattern: schedule,
          // Prevent duplicate jobs if worker is slow
          immediately: false,
        },
        {
          name: "scheduled-scan",
          data: jobData,
        }
      )

      logger.info("Job scheduler created/updated", {
        ruleId,
        schedulerId,
        schedule,
      })
    } else {
      // Remove the job scheduler if it exists
      await removeRuleSchedule(ruleId)
    }
  } catch (error) {
    logger.error("Failed to sync rule schedule", {
      ruleId,
      schedule,
      enabled,
      error,
    })
    throw error
  }
}

/**
 * Remove a rule's job scheduler
 */
export async function removeRuleSchedule(ruleId: string): Promise<void> {
  const schedulerId = getSchedulerId(ruleId)

  try {
    const removed = await maintenanceQueue.removeJobScheduler(schedulerId)
    if (removed) {
      logger.info("Job scheduler removed", { ruleId, schedulerId })
    }
  } catch (error) {
    // Log but don't throw - scheduler might not exist
    logger.debug("Failed to remove job scheduler (may not exist)", {
      ruleId,
      schedulerId,
      error,
    })
  }
}

/**
 * Sync all enabled rules with schedules to BullMQ
 *
 * Call this on worker startup to ensure all scheduled rules are registered.
 */
export async function syncAllRuleSchedules(): Promise<void> {
  try {
    const rules = await prisma.maintenanceRule.findMany({
      where: {
        enabled: true,
        schedule: { not: null },
      },
      select: {
        id: true,
        name: true,
        schedule: true,
        enabled: true,
      },
    })

    logger.info(`Syncing ${rules.length} rule schedules with BullMQ`)

    for (const rule of rules) {
      try {
        await syncRuleSchedule(rule.id, rule.schedule, rule.enabled)
      } catch (error) {
        logger.error("Failed to sync rule schedule", {
          ruleId: rule.id,
          ruleName: rule.name,
          error,
        })
        // Continue with other rules
      }
    }

    logger.info("Rule schedule sync complete")
  } catch (error) {
    logger.error("Failed to sync all rule schedules", { error })
    throw error
  }
}

/**
 * Get all active job schedulers for maintenance rules
 */
export async function getActiveSchedulers(): Promise<
  Array<{
    id: string
    ruleId: string
    pattern: string | null
    next: Date | null
  }>
> {
  try {
    const schedulers = await maintenanceQueue.getJobSchedulers()

    return schedulers
      .filter((s): s is typeof s & { id: string } => {
        if (typeof s.id !== "string") return false
        return getRuleIdFromSchedulerId(s.id) !== null
      })
      .map((s) => ({
        id: s.id,
        ruleId: getRuleIdFromSchedulerId(s.id)!,
        pattern: s.pattern ?? null,
        next: s.next ? new Date(s.next) : null,
      }))
  } catch (error) {
    logger.error("Failed to get active schedulers", { error })
    return []
  }
}
