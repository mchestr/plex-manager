import { TEST_USERS } from '../fixtures/auth';
import { createE2EPrismaClient } from '../helpers/prisma';
import { clearVisualFixtures, seedVisualFixtures, VISUAL_REWIND_ID } from '../helpers/seed-fixtures';

/**
 * The axe spec's seed: P1.6's visual seed plus the rows only the axe routes
 * read (a share link on the seeded Rewind and one chat conversation).
 */

/** 43 base64url characters, the shape `generateShareToken` makes. */
export const A11Y_SHARE_TOKEN = 'a11y-share-token'.padEnd(43, '0');

export const A11Y_CONVERSATION_ID = 'a11y-conversation';

/** Starts with `visual-llm-usage-`, so `clearVisualFixtures` removes it. */
export const A11Y_CHAT_USAGE_ID = 'visual-llm-usage-chat';

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
          provider: 'openai',
          model: 'gpt-5-mini',
          promptTokens: 320,
          completionTokens: 140,
          totalTokens: 460,
          cost: 0.0004,
          createdAt: new Date('2026-10-15T10:01:00Z'),
        },
      }),
    ]);
  } finally {
    await prisma.$disconnect();
  }
}

export async function clearA11yFixtures(): Promise<void> {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.chatConversation.deleteMany({ where: { id: A11Y_CONVERSATION_ID } });
  } finally {
    await prisma.$disconnect();
  }
  await clearVisualFixtures();
}
