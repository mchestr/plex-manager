import { expect, test, TEST_USERS } from '../fixtures/auth';
import { createE2EPrismaClient } from '../helpers/prisma';

/**
 * The admin audit trail (P11.16, GAP-33): opening a member's conversation
 * page writes a MEMBER_CONTENT_VIEWED row naming the surface. The member is
 * new on each run, so the hourly de-duplication of an earlier run (in Redis
 * or in the server's memory) never hides the row.
 */
const RUN = Date.now().toString(36);
const MEMBER_ID = `e2e-audit-member-${RUN}`;
const CONVERSATION_ID = `e2e-audit-conversation-${RUN}`;

test.describe('Admin audit trail', () => {
  test.beforeAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.user.create({ data: { id: MEMBER_ID, name: 'Audit Member' } });
      await prisma.chatConversation.create({ data: { id: CONVERSATION_ID, userId: MEMBER_ID } });
      await prisma.lLMUsage.create({
        data: {
          id: `e2e-audit-usage-${RUN}`,
          userId: MEMBER_ID,
          chatConversationId: CONVERSATION_ID,
          provider: 'openai',
          model: 'gpt-5-mini',
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
          cost: 0.001,
          prompt: JSON.stringify([{ role: 'user', content: 'Is Plex up?' }]),
          response: 'Plex is up.',
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  test.afterAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      // The usage and the conversation go with the member
      await prisma.user.deleteMany({ where: { id: MEMBER_ID } });
    } finally {
      await prisma.$disconnect();
    }
  });

  test("opening a member's conversation adds a MEMBER_CONTENT_VIEWED row", async ({ adminPage }) => {
    await adminPage.goto(`/admin/llm-usage/conversation/${CONVERSATION_ID}`);
    await expect(adminPage.getByTestId('admin-llm-conversation-summary')).toBeVisible();

    const prisma = createE2EPrismaClient();
    try {
      // The row is written without holding up the page, so poll for it
      await expect
        .poll(
          async () =>
            prisma.auditLog.findMany({
              where: { type: 'MEMBER_CONTENT_VIEWED', targetUserId: MEMBER_ID },
              select: { actorUserId: true, details: true },
            }),
          { timeout: 10_000 }
        )
        .toEqual([{ actorUserId: TEST_USERS.ADMIN.id, details: { surface: 'llm-conversation' } }]);
    } finally {
      await prisma.$disconnect();
    }
  });
});
