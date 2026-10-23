import { TEST_USERS } from '../fixtures/auth';
import { generateMockWrappedData } from '../../lib/wrapped/mock-data';
import type { WrappedStatistics } from '../../types/wrapped';
import { VISUAL_NOW } from './deterministic';
import { createE2EPrismaClient } from './prisma';

/**
 * The deterministic seed the screenshot specs (visual, axe) share.
 *
 * It resets every table a photographed screen reads to the same rows, so the
 * images do not depend on which specs ran before (the setup wizard spec, for
 * one, leaves service configs behind). The server clock is not frozen:
 * dates shown relative to it are offsets from seed time, and dates shown in
 * full are fixed (and masked). Only ever runs against the `_test`
 * database `createE2EPrismaClient` allows.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export const VISUAL_ONBOARDING_USER = {
  id: 'visual-onboarding-user',
  plexUserId: 'visual-onboarding-plex-id',
  name: 'Visual Onboarding User',
  email: 'visual-onboarding@example.com',
} as const;

/** `Config.locale` in the shared seed; the screenshots' dates and numbers are in it. */
export const SEEDED_LOCALE = 'en-US';

export const VISUAL_INVITES ={ valid: 'VISUALOK', expired: 'VISUALEXP' } as const;

/** Fixed row ids, for the detail routes the axe spec visits. */
export const VISUAL_INVITE_IDS = { valid: 'visual-invite-ok', expired: 'visual-invite-expired' } as const;

/** The Rewind year seeded for the regular user. */
export const VISUAL_REWIND_YEAR = 2026;

/** The id of the regular user's seeded Rewind. */
export const VISUAL_REWIND_ID = 'visual-rewind';

/** The seeded Plex server, and the unreachable address the Plex-down shot uses. */
export const VISUAL_PLEX_SERVER = {
  id: 'visual-plex-server',
  url: 'http://localhost:32400',
  downUrl: 'http://127.0.0.1:9',
} as const;

const SEEDED_USER_IDS = [TEST_USERS.ADMIN.id, TEST_USERS.REGULAR.id, VISUAL_ONBOARDING_USER.id];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const REWIND_STATISTICS: WrappedStatistics = {
  totalWatchTime: { total: 12840, movies: 4560, shows: 8280 },
  moviesWatched: 38,
  showsWatched: 12,
  episodesWatched: 184,
  topMovies: [
    { title: 'The Long Night Shift', watchTime: 240, playCount: 2, year: 2024 },
    { title: 'Harbour Lights', watchTime: 130, playCount: 1, year: 2019 },
    { title: 'A Quiet Orbit', watchTime: 118, playCount: 1, year: 2022 },
  ],
  topShows: [
    { title: 'Northern Line', watchTime: 1620, playCount: 36, episodesWatched: 36, year: 2021 },
    { title: 'Kitchen Brigade', watchTime: 980, playCount: 28, episodesWatched: 28, year: 2023 },
    { title: 'Small Hours', watchTime: 610, playCount: 14, episodesWatched: 14, year: 2018 },
  ],
  watchTimeByMonth: MONTH_NAMES.map((monthName, index) => ({
    month: index + 1,
    monthName,
    watchTime: 600 + ((index * 7) % 5) * 180,
  })),
};

function daysAgo(from: number, days: number): Date {
  return new Date(from - days * DAY_MS);
}

/**
 * Resets the database to the visual seed. Idempotent: every spec file calls
 * it in `beforeAll`.
 */
export async function seedVisualFixtures(): Promise<void> {
  const prisma = createE2EPrismaClient();
  // Dates the screens print in full are masked, but their text width still
  // moves table columns, so they sit at fixed days before VISUAL_NOW. Only
  // dates shown relative to the server clock ("Yesterday", "Expired") are
  // offsets from now.
  const now = Date.now();
  const shown = VISUAL_NOW.getTime();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.setup.deleteMany();
      await tx.setup.create({ data: { isComplete: true, currentStepId: 'summary', completedAt: daysAgo(shown, 30) } });

      // Service configs: only the Plex server and the Discord integration.
      await tx.tautulli.deleteMany();
      await tx.overseerr.deleteMany();
      await tx.sonarr.deleteMany();
      await tx.radarr.deleteMany();
      await tx.prometheus.deleteMany();
      await tx.lLMProvider.deleteMany();
      await tx.jellyfinServer.deleteMany();
      await tx.plexServer.deleteMany();
      await tx.plexServer.create({
        data: {
          id: VISUAL_PLEX_SERVER.id,
          name: 'Visual Test Server',
          url: VISUAL_PLEX_SERVER.url,
          token: 'test-token',
          adminPlexUserId: TEST_USERS.ADMIN.plexUserId,
          isActive: true,
        },
      });
      const discord = {
        isEnabled: true,
        botEnabled: false,
        clientId: 'visual-client-id',
        clientSecret: 'visual-client-secret',
        serverInviteCode: 'visualinvite',
        platformName: 'Plex Wrapped',
        instructions: null,
      };
      await tx.discordIntegration.upsert({
        where: { id: 'discord' },
        create: { id: 'discord', ...discord },
        update: discord,
      });
      const config = {
        llmDisabled: false,
        wrappedEnabled: true,
        // A season open all year, so the screenshots do not change on 1 December
        rewindSeasonOpens: '01-01',
        rewindSeasonCloses: '12-31',
        timezone: null,
        // `<html lang>` follows it (P11.17, e2e/accessibility.spec.ts)
        locale: SEEDED_LOCALE,
        watchlistSyncEnabled: false,
        watchlistSyncIntervalMinutes: 60,
        stripeEnabled: false,
        stripeSecretKey: null,
        stripeWebhookSecret: null,
        stripePriceIds: [],
      };
      await tx.config.upsert({ where: { id: 'config' }, create: { id: 'config', ...config }, update: config });

      // Users: the two E2E users and the onboarding-incomplete member.
      await tx.user.deleteMany({ where: { id: { notIn: SEEDED_USER_IDS } } });
      for (const user of [TEST_USERS.ADMIN, TEST_USERS.REGULAR]) {
        const data = {
          plexUserId: user.plexUserId,
          name: user.name,
          email: user.email,
          image: null,
          isAdmin: user.isAdmin,
          isExempt: false,
          exemptReason: null,
          primaryAuthService: user.primaryAuthService,
          onboardingStatus: user.onboardingStatus,
          createdAt: daysAgo(shown, user.isAdmin ? 120 : 60),
        };
        await tx.user.upsert({ where: { id: user.id }, create: { id: user.id, ...data }, update: data });
      }
      const onboarding = {
        plexUserId: VISUAL_ONBOARDING_USER.plexUserId,
        name: VISUAL_ONBOARDING_USER.name,
        email: VISUAL_ONBOARDING_USER.email,
        isAdmin: false,
        primaryAuthService: 'plex' as const,
        onboardingStatus: { plex: false, jellyfin: false },
        createdAt: daysAgo(shown, 3),
      };
      await tx.user.upsert({
        where: { id: VISUAL_ONBOARDING_USER.id },
        create: { id: VISUAL_ONBOARDING_USER.id, ...onboarding },
        update: onboarding,
      });
      await tx.subscription.deleteMany();
      await tx.discordConnection.deleteMany();

      // Invites
      await tx.invite.deleteMany();
      await tx.invite.create({
        data: {
          id: VISUAL_INVITE_IDS.valid,
          code: VISUAL_INVITES.valid,
          maxUses: 5,
          useCount: 1,
          expiresAt: new Date('2099-01-01T00:00:00Z'),
          createdAt: daysAgo(shown, 3),
          createdBy: TEST_USERS.ADMIN.id,
        },
      });
      await tx.invite.create({
        data: {
          id: VISUAL_INVITE_IDS.expired,
          code: VISUAL_INVITES.expired,
          maxUses: 1,
          expiresAt: daysAgo(now, 1),
          createdAt: daysAgo(shown, 10),
          createdBy: TEST_USERS.ADMIN.id,
        },
      });

      // Rewind, LLM usage, prompts and the announcement
      await tx.plexWrapped.deleteMany();
      const rewindData = generateMockWrappedData({
        promptName: TEST_USERS.REGULAR.name,
        displayName: TEST_USERS.REGULAR.name,
        year: VISUAL_REWIND_YEAR,
        userId: TEST_USERS.REGULAR.id,
        statistics: REWIND_STATISTICS,
      });
      const generatedAt = daysAgo(shown, 2);
      const rewind = await tx.plexWrapped.create({
        data: {
          id: VISUAL_REWIND_ID,
          userId: TEST_USERS.REGULAR.id,
          year: VISUAL_REWIND_YEAR,
          status: 'completed',
          data: JSON.stringify({ ...rewindData, generatedAt: generatedAt.toISOString() }),
          archetype: rewindData.archetype?.name ?? null,
          summary: rewindData.summary ?? null,
          generatedAt,
          createdAt: generatedAt,
        },
      });

      await tx.lLMUsage.deleteMany();
      await tx.chatConversation.deleteMany();
      const usages = [
        { userId: TEST_USERS.REGULAR.id, wrappedId: rewind.id, model: 'gpt-5-mini', promptTokens: 4200, completionTokens: 1800, cost: 0.0123, days: 2 },
        { userId: TEST_USERS.ADMIN.id, wrappedId: null, model: 'gpt-5-mini', promptTokens: 950, completionTokens: 420, cost: 0.0021, days: 4 },
        { userId: TEST_USERS.ADMIN.id, wrappedId: null, model: 'gpt-5', promptTokens: 3100, completionTokens: 2600, cost: 0.0457, days: 6 },
      ];
      for (const [index, usage] of usages.entries()) {
        await tx.lLMUsage.create({
          data: {
            id: `visual-llm-usage-${index + 1}`,
            userId: usage.userId,
            wrappedId: usage.wrappedId,
            provider: 'openai',
            model: usage.model,
            prompt: null,
            response: null,
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.promptTokens + usage.completionTokens,
            cost: usage.cost,
            createdAt: daysAgo(shown, usage.days),
          },
        });
      }

      await tx.promptTemplate.deleteMany();
      await tx.promptTemplate.create({
        data: {
          id: 'visual-prompt-active',
          name: 'Rewind narrator',
          description: 'Warm, cinematic copy for the yearly Rewind.',
          template: 'Write the Rewind for {{userName}} covering {{year}}.',
          isActive: true,
          version: 3,
          createdAt: daysAgo(shown, 20),
          updatedAt: daysAgo(shown, 5),
        },
      });
      await tx.promptTemplate.create({
        data: {
          id: 'visual-prompt-draft',
          name: 'Short and dry',
          description: 'A terse alternative for testing.',
          template: 'Summarise {{year}} for {{userName}} in three lines.',
          isActive: false,
          version: 1,
          createdAt: daysAgo(shown, 8),
          updatedAt: daysAgo(shown, 8),
        },
      });

      await tx.announcement.deleteMany();
      await tx.announcement.create({
        data: {
          id: 'visual-announcement',
          title: 'Maintenance on Sunday',
          content: 'The server restarts at **02:00** for upgrades. Expect ten minutes of downtime.',
          priority: 1,
          isActive: true,
          createdAt: daysAgo(now, 1),
          createdBy: TEST_USERS.ADMIN.id,
        },
      });
    }, { timeout: 30000 }); // dozens of writes: past the 5 s interactive default on a slow CI runner
  } finally {
    await prisma.$disconnect();
  }
}

/** Points the seeded Plex server at `url` (the Plex-down shot and its restore). */
export async function setVisualPlexServerUrl(url: string): Promise<void> {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.plexServer.update({ where: { id: VISUAL_PLEX_SERVER.id }, data: { url } });
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Removes what the visual seed adds beyond the global E2E seed (the Discord
 * integration, the extra rows and the onboarding member), so specs that run
 * after the visual projects see the state global-setup.ts leaves.
 */
export async function clearVisualFixtures(): Promise<void> {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.$transaction([
      prisma.discordIntegration.deleteMany(),
      prisma.announcement.deleteMany({ where: { id: 'visual-announcement' } }),
      prisma.promptTemplate.deleteMany({ where: { id: { in: ['visual-prompt-active', 'visual-prompt-draft'] } } }),
      prisma.lLMUsage.deleteMany({ where: { id: { startsWith: 'visual-llm-usage-' } } }),
      prisma.invite.deleteMany({ where: { code: { in: [VISUAL_INVITES.valid, VISUAL_INVITES.expired] } } }),
      prisma.plexWrapped.deleteMany({ where: { userId: TEST_USERS.REGULAR.id, year: VISUAL_REWIND_YEAR } }),
      prisma.user.deleteMany({ where: { id: VISUAL_ONBOARDING_USER.id } }),
    ]);
  } finally {
    await prisma.$disconnect();
  }
}
