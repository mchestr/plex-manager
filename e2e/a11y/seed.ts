import { TEST_USERS } from '../fixtures/auth';
import { createE2EPrismaClient } from '../helpers/prisma';
import { clearVisualFixtures, seedVisualFixtures, VISUAL_REWIND_ID } from '../helpers/seed-fixtures';

/**
 * The axe spec's seed: P1.6's visual seed plus the rows only the axe routes
 * read (a share link on the seeded Rewind, one chat conversation and a few
 * watchlist titles).
 */

/** 43 base64url characters, the shape `generateShareToken` makes. */
export const A11Y_SHARE_TOKEN = 'a11y-share-token'.padEnd(43, '0');

export const A11Y_CONVERSATION_ID = 'a11y-conversation';

/** Starts with `visual-llm-usage-`, so `clearVisualFixtures` removes it. */
export const A11Y_CHAT_USAGE_ID = 'visual-llm-usage-chat';

const A11Y_WATCHLIST_PREFIX = 'a11y-watchlist-';

/**
 * One title per status tone for `/admin/watchlist`, on the admin's own
 * watchlist so the member's Your data list on `/account` stays as it was.
 */
const A11Y_WATCHLIST = (['REQUESTED', 'ALREADY_AVAILABLE', 'NOT_PERMITTED', 'FAILED', 'REMOVED_FROM_WATCHLIST'] as const).map(
  (status, index) => ({
    id: `${A11Y_WATCHLIST_PREFIX}${index}`,
    userId: TEST_USERS.ADMIN.id,
    plexRatingKey: `${A11Y_WATCHLIST_PREFIX}${index}`,
    guid: `plex://movie/${A11Y_WATCHLIST_PREFIX}${index}`,
    mediaType: 'MOVIE' as const,
    title: `Watchlist title ${index + 1}`,
    year: 2020 + index,
    status,
    syncedAt: new Date(`2026-10-1${index}T12:00:00Z`),
    requestedAt: status === 'REQUESTED' ? new Date('2026-10-10T12:05:00Z') : null,
  })
);

export async function seedA11yFixtures(): Promise<void> {
  await seedVisualFixtures();
  const prisma = createE2EPrismaClient();
  try {
    await prisma.$transaction([
      prisma.plexWrapped.update({ where: { id: VISUAL_REWIND_ID }, data: { shareToken: A11Y_SHARE_TOKEN } }),
      prisma.chatConversation.create({
        data: { id: A11Y_CONVERSATION_ID, userId: TEST_USERS.ADMIN.id, createdAt: new Date('2026-10-15T10:00:00Z') },
      }),
      prisma.lLMUsage.create({
        data: {
          id: A11Y_CHAT_USAGE_ID,
          userId: TEST_USERS.ADMIN.id,
          chatConversationId: A11Y_CONVERSATION_ID,
          groupKey: A11Y_CONVERSATION_ID,
          provider: 'openai',
          model: 'gpt-5-mini',
          promptTokens: 320,
          completionTokens: 140,
          totalTokens: 460,
          cost: 0.0004,
          createdAt: new Date('2026-10-15T10:01:00Z'),
        },
      }),
      prisma.watchlistSyncHistory.deleteMany({ where: { id: { startsWith: A11Y_WATCHLIST_PREFIX } } }),
      prisma.watchlistSyncHistory.createMany({ data: A11Y_WATCHLIST }),
    ]);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Deletes the seeded Rewind's share visits. Opening the public share route
 * records one (after its response), and a re-seed after a failed test drops
 * it, so `/admin/shares` would otherwise show one visit or none depending on
 * which tests ran before it.
 */
export async function clearA11yShareVisits(): Promise<void> {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.wrappedShareVisit.deleteMany({ where: { wrappedId: VISUAL_REWIND_ID } });
  } finally {
    await prisma.$disconnect();
  }
}

export async function clearA11yFixtures(): Promise<void> {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.chatConversation.deleteMany({ where: { id: A11Y_CONVERSATION_ID } });
    await prisma.watchlistSyncHistory.deleteMany({ where: { id: { startsWith: A11Y_WATCHLIST_PREFIX } } });
  } finally {
    await prisma.$disconnect();
  }
  await clearVisualFixtures();
}
