import wrongCount from '../../evals/judge/fixtures/wrong-count.json';
import { expect, test, TEST_USERS } from '../fixtures/auth';
import { createE2EPrismaClient } from '../helpers/prisma';
import { WAIT_TIMEOUTS } from '../helpers/test-utils';
import { JUDGE_MODEL, type JudgeRequest } from '../mocks/llm-server';

/**
 * The conversation judge end to end: Review on a seeded admin assistant
 * conversation queues a job the worker runs against the judge stub in
 * `e2e/mocks/llm-server.ts`, which answers with the recorded output of
 * `evals/judge/fixtures/wrong-count.json`. The seeded conversation is that
 * fixture's, tool log included, so the finding verifies against it. Triage
 * then moves the Findings tab's false alarm rate, and the stub's request log
 * shows the prompt the judge was sent. Any other active judge provider is
 * turned off for the spec, so the stub is the judge, and turned back on after,
 * even when the cleanup fails.
 */
const JUDGE_PROVIDER_ID = 'e2e-conversation-review-judge';
const CONVERSATION_ID = 'e2e-conversation-review';
const USAGE_ID = 'e2e-conversation-review-usage';

/** The judge's job and the review section's 5 s poll take longer than a page load. */
const REVIEW_TIMEOUT = 60_000;

/** Everything the spec seeds, and the judge's usage row, which outlives its review. */
async function clean() {
  const prisma = createE2EPrismaClient();
  await prisma.lLMUsage.deleteMany({
    where: { OR: [{ id: USAGE_ID }, { conversationReview: { conversationId: CONVERSATION_ID } }] },
  });
  await prisma.chatConversation.deleteMany({ where: { id: CONVERSATION_ID } });
  await prisma.lLMProvider.deleteMany({ where: { id: JUDGE_PROVIDER_ID } });
  await prisma.$disconnect();
}

/** Active judge providers the spec turned off in beforeAll, turned back on in afterAll. */
let otherJudges: string[] = [];

/** Turns `otherJudges` back on. The stub goes off first: only one judge row can be active, and a failed clean() leaves it. */
async function restoreOtherJudges() {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.lLMProvider.updateMany({ where: { id: JUDGE_PROVIDER_ID }, data: { isActive: false } });
    await prisma.lLMProvider.updateMany({ where: { id: { in: otherJudges } }, data: { isActive: true } });
  } finally {
    await prisma.$disconnect();
  }
}

/** The judge requests the stub has answered in this run. */
async function judgeRequests(): Promise<JudgeRequest[]> {
  const response = await fetch(new URL('/__judge-requests', process.env.E2E_LLM_URL));
  return (await response.json()) as JudgeRequest[];
}

test.describe('Conversation review', () => {
  test.beforeAll(async () => {
    await clean();
    const prisma = createE2EPrismaClient();
    const active = await prisma.lLMProvider.findMany({ where: { isActive: true, purpose: 'judge' }, select: { id: true } });
    otherJudges = active.map((row) => row.id);
    await prisma.lLMProvider.updateMany({ where: { id: { in: otherJudges } }, data: { isActive: false } });
    await prisma.lLMProvider.create({
      data: {
        id: JUDGE_PROVIDER_ID,
        provider: 'openai-compatible',
        purpose: 'judge',
        apiKey: '',
        model: JUDGE_MODEL,
        baseUrl: process.env.E2E_LLM_URL,
      },
    });
    // Stored as plaintext; the app reads non-ciphertext back unchanged
    const start = Date.now() - 10 * 60_000;
    const at = (index: number) => new Date(start + index * 60_000);
    await prisma.chatConversation.create({
      data: {
        id: CONVERSATION_ID,
        userId: TEST_USERS.ADMIN.id,
        title: wrongCount.messages[0].content,
        lastMessageAt: at(wrongCount.messages.length - 1),
        messages: {
          create: wrongCount.messages.map((message, index) => ({
            role: message.role === 'assistant' ? 'assistant' : 'user',
            content: message.content,
            toolLog: message.toolLog === null ? null : JSON.stringify(message.toolLog),
            createdAt: at(index),
          })),
        },
      },
    });
    await prisma.lLMUsage.create({
      data: {
        id: USAGE_ID,
        userId: TEST_USERS.ADMIN.id,
        chatConversationId: CONVERSATION_ID,
        groupKey: CONVERSATION_ID,
        provider: 'openai-compatible',
        model: 'gpt-e2e',
        prompt: null,
        response: null,
        promptTokens: 120,
        completionTokens: 40,
        totalTokens: 160,
        cost: 0,
        createdAt: at(1),
      },
    });
    await prisma.$disconnect();
  });

  test.afterAll(async () => {
    try {
      await clean();
    } finally {
      await restoreOtherJudges();
    }
  });

  test('reviews a conversation with the stubbed judge and triages its finding', async ({ adminPage: page }) => {
    test.setTimeout(120_000);
    const earlierRequests = (await judgeRequests()).length;

    await page.goto(`/admin/ai/conversation/${CONVERSATION_ID}`);
    const review = page.getByTestId('conversation-review-button');
    await expect(review).toBeEnabled({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await review.click();

    const card = page.locator('[data-testid^="finding-card-"]');
    await expect(card).toHaveCount(1, { timeout: REVIEW_TIMEOUT });
    await expect(page.getByTestId('conversation-review-status')).toContainText('Reviewed');
    const findingId = (await card.getAttribute('data-testid'))?.replace('finding-card-', '') ?? '';
    // The quote matches the seeded tool log, so the finding is verified
    await expect(page.getByTestId(`finding-unverified-${findingId}`)).toHaveCount(0);

    // The status Select's popup is inert until open: wait for the option before choosing it
    await page.getByTestId(`finding-status-select-${findingId}`).click();
    const falseAlarm = page.getByTestId('finding-status-option-false_alarm');
    await expect(falseAlarm).toBeVisible();
    await expect(falseAlarm).toBeEnabled();
    await falseAlarm.click();
    await expect(page.getByTestId(`finding-status-select-${findingId}`)).toHaveText('False alarm');

    const prisma = createE2EPrismaClient();
    await expect
      .poll(async () => (await prisma.conversationFinding.findUnique({ where: { id: findingId }, select: { status: true } }))?.status)
      .toBe('false_alarm');
    await prisma.$disconnect();

    await page.goto('/admin/ai?view=findings');
    const rate = page.getByTestId('findings-stat-false-alarm');
    await expect(rate).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    // The one triaged finding is a false alarm
    await expect(rate).toContainText(/100[.,]0\s?%/);

    // The judge was sent one fenced prompt with the transcript and its tool log
    const requests = (await judgeRequests()).slice(earlierRequests);
    expect(requests).toHaveLength(1);
    expect(requests[0].model).toBe(JUDGE_MODEL);
    expect(requests[0].prompt).toContain('<transcript>');
    expect(requests[0].prompt).toContain('<tool_result');
  });
});
