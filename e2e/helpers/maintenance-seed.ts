import { createE2EPrismaClient } from './prisma';
import type { PrismaClient } from '../../lib/generated/prisma/client';

/**
 * Test data constants for maintenance tests
 */
export const MAINTENANCE_TEST_DATA = {
  RULE: {
    id: 'test-maintenance-rule-id',
    name: 'Test Maintenance Rule',
    description: 'A test rule for E2E testing',
  },
  SCAN: {
    id: 'test-maintenance-scan-id',
  },
  CANDIDATES: [
    {
      id: 'test-candidate-1',
      title: 'Test Movie Alpha',
      year: 2020,
      plexRatingKey: 'plex-rating-1',
      mediaType: 'MOVIE' as const,
      playCount: 0,
      fileSize: BigInt(5368709120), // 5GB
      filePath: '/media/movies/test-movie-alpha.mkv',
    },
    {
      id: 'test-candidate-2',
      title: 'Test Movie Beta',
      year: 2019,
      plexRatingKey: 'plex-rating-2',
      mediaType: 'MOVIE' as const,
      playCount: 2,
      fileSize: BigInt(3221225472), // 3GB
      filePath: '/media/movies/test-movie-beta.mkv',
    },
    {
      id: 'test-candidate-3',
      title: 'Test Series Gamma',
      year: 2021,
      plexRatingKey: 'plex-rating-3',
      mediaType: 'TV_SERIES' as const,
      playCount: 1,
      fileSize: BigInt(10737418240), // 10GB
      filePath: '/media/tv/test-series-gamma',
    },
  ],
  DELETION_LOG: {
    id: 'test-deletion-log-id',
    title: 'Deleted Test Movie',
    year: 2018,
    mediaType: 'MOVIE' as const,
    fileSize: BigInt(4294967296), // 4GB
  },
} as const;

/**
 * Seeds maintenance test data into the database
 * Creates a rule, scan, and candidates for testing
 */
export async function seedMaintenanceData(prisma?: PrismaClient): Promise<void> {
  const client = prisma || createE2EPrismaClient();

  try {
    console.log('[E2E Maintenance Seed] Starting maintenance data seeding...');

    // Create a maintenance rule
    await client.maintenanceRule.upsert({
      where: { id: MAINTENANCE_TEST_DATA.RULE.id },
      create: {
        id: MAINTENANCE_TEST_DATA.RULE.id,
        name: MAINTENANCE_TEST_DATA.RULE.name,
        description: MAINTENANCE_TEST_DATA.RULE.description,
        enabled: true,
        mediaType: 'MOVIE',
        actionType: 'FLAG_FOR_REVIEW',
        criteria: {
          type: 'group',
          id: 'root-group',
          operator: 'AND',
          conditions: [
            {
              type: 'condition',
              id: 'cond-1',
              field: 'playCount',
              operator: 'equals',
              value: 0,
            }
          ],
        },
      },
      update: {
        name: MAINTENANCE_TEST_DATA.RULE.name,
        enabled: true,
      },
    });
    console.log('[E2E Maintenance Seed] Created maintenance rule');

    // Create a completed scan
    await client.maintenanceScan.upsert({
      where: { id: MAINTENANCE_TEST_DATA.SCAN.id },
      create: {
        id: MAINTENANCE_TEST_DATA.SCAN.id,
        ruleId: MAINTENANCE_TEST_DATA.RULE.id,
        status: 'COMPLETED',
        startedAt: new Date(Date.now() - 3600000), // 1 hour ago
        completedAt: new Date(),
        itemsScanned: 100,
        itemsFlagged: MAINTENANCE_TEST_DATA.CANDIDATES.length,
      },
      update: {
        status: 'COMPLETED',
        completedAt: new Date(),
        itemsFlagged: MAINTENANCE_TEST_DATA.CANDIDATES.length,
      },
    });
    console.log('[E2E Maintenance Seed] Created maintenance scan');

    // Create candidates
    for (const candidate of MAINTENANCE_TEST_DATA.CANDIDATES) {
      await client.maintenanceCandidate.upsert({
        where: {
          scanId_plexRatingKey: {
            scanId: MAINTENANCE_TEST_DATA.SCAN.id,
            plexRatingKey: candidate.plexRatingKey,
          }
        },
        create: {
          id: candidate.id,
          scanId: MAINTENANCE_TEST_DATA.SCAN.id,
          title: candidate.title,
          year: candidate.year,
          plexRatingKey: candidate.plexRatingKey,
          mediaType: candidate.mediaType,
          playCount: candidate.playCount,
          fileSize: candidate.fileSize,
          filePath: candidate.filePath,
          reviewStatus: 'PENDING',
          matchedRules: [{ ruleName: MAINTENANCE_TEST_DATA.RULE.name }],
          addedAt: new Date(Date.now() - 86400000 * 180), // 180 days ago
        },
        update: {
          title: candidate.title,
          reviewStatus: 'PENDING',
        },
      });
    }
    console.log(`[E2E Maintenance Seed] Created ${MAINTENANCE_TEST_DATA.CANDIDATES.length} candidates`);

    // Create a deletion log entry for history tests
    await client.maintenanceDeletionLog.upsert({
      where: { id: MAINTENANCE_TEST_DATA.DELETION_LOG.id },
      create: {
        id: MAINTENANCE_TEST_DATA.DELETION_LOG.id,
        title: MAINTENANCE_TEST_DATA.DELETION_LOG.title,
        year: MAINTENANCE_TEST_DATA.DELETION_LOG.year,
        mediaType: MAINTENANCE_TEST_DATA.DELETION_LOG.mediaType,
        fileSize: MAINTENANCE_TEST_DATA.DELETION_LOG.fileSize,
        deletedBy: 'admin-user-id',
        deletedAt: new Date(Date.now() - 86400000), // 1 day ago
        deletedFrom: 'Radarr',
        filesDeleted: true,
        ruleNames: [MAINTENANCE_TEST_DATA.RULE.name],
      },
      update: {
        title: MAINTENANCE_TEST_DATA.DELETION_LOG.title,
      },
    });
    console.log('[E2E Maintenance Seed] Created deletion log entry');

    console.log('[E2E Maintenance Seed] Maintenance data seeding complete');
  } finally {
    if (!prisma) {
      await client.$disconnect();
    }
  }
}

/**
 * Cleans up maintenance test data from the database
 * Removes all test rules, scans, candidates, and deletion logs
 */
export async function cleanupMaintenanceData(prisma?: PrismaClient): Promise<void> {
  const client = prisma || createE2EPrismaClient();

  try {
    console.log('[E2E Maintenance Cleanup] Starting maintenance data cleanup...');

    // Delete in order due to foreign key constraints
    await client.maintenanceCandidate.deleteMany({
      where: {
        scanId: MAINTENANCE_TEST_DATA.SCAN.id,
      },
    });
    console.log('[E2E Maintenance Cleanup] Deleted candidates');

    await client.maintenanceScan.deleteMany({
      where: {
        id: MAINTENANCE_TEST_DATA.SCAN.id,
      },
    });
    console.log('[E2E Maintenance Cleanup] Deleted scans');

    await client.maintenanceRule.deleteMany({
      where: {
        id: MAINTENANCE_TEST_DATA.RULE.id,
      },
    });
    console.log('[E2E Maintenance Cleanup] Deleted rules');

    await client.maintenanceDeletionLog.deleteMany({
      where: {
        id: MAINTENANCE_TEST_DATA.DELETION_LOG.id,
      },
    });
    console.log('[E2E Maintenance Cleanup] Deleted deletion logs');

    console.log('[E2E Maintenance Cleanup] Maintenance data cleanup complete');
  } finally {
    if (!prisma) {
      await client.$disconnect();
    }
  }
}

/**
 * Resets candidate review statuses back to PENDING
 * Useful for tests that modify candidate statuses
 */
export async function resetCandidateStatuses(prisma?: PrismaClient): Promise<void> {
  const client = prisma || createE2EPrismaClient();

  try {
    await client.maintenanceCandidate.updateMany({
      where: {
        scanId: MAINTENANCE_TEST_DATA.SCAN.id,
      },
      data: {
        reviewStatus: 'PENDING',
        reviewedAt: null,
        reviewedBy: null,
        reviewNote: null,
      },
    });
    console.log('[E2E Maintenance Reset] Reset candidate statuses to PENDING');
  } finally {
    if (!prisma) {
      await client.$disconnect();
    }
  }
}

/**
 * Gets the current state of test candidates
 * Useful for debugging and assertions
 */
export async function getTestCandidates(prisma?: PrismaClient) {
  const client = prisma || createE2EPrismaClient();

  try {
    return await client.maintenanceCandidate.findMany({
      where: {
        scanId: MAINTENANCE_TEST_DATA.SCAN.id,
      },
      select: {
        id: true,
        title: true,
        reviewStatus: true,
        reviewedAt: true,
      },
    });
  } finally {
    if (!prisma) {
      await client.$disconnect();
    }
  }
}
