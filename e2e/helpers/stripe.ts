import { createE2EPrismaClient } from './prisma';

/**
 * Shared Stripe subscription E2E state helpers.
 *
 * These mutate the `Config` singleton and per-user subscription/exempt state via
 * the raw E2E Prisma client so specs can exercise the gate and admin surfaces
 * WITHOUT touching real Stripe. Test secrets are written as plaintext — the
 * encryption extension reads legacy plaintext unchanged, and the enable check
 * only asserts presence — so no live Stripe/`ENCRYPTION_KEY` is required.
 *
 * Every spec MUST restore state (see {@link resetStripeState}) in an afterAll so
 * the serial suite (workers: 1) does not leak Stripe gating into other specs.
 */

const CONFIG_ID = 'config';

/** Plaintext test values — never hit Stripe; only presence is checked. */
export const TEST_STRIPE_CONFIG = {
  secretKey: 'sk_test_e2e_placeholder',
  webhookSecret: 'whsec_test_e2e_placeholder',
  priceIds: ['price_e2e_test'],
} as const;

/**
 * Sets `Config.stripeEnabled` and (optionally) seeds fully-configured Stripe
 * credentials so the admin toggle can be flipped on.
 */
export async function setStripeEnabled(
  enabled: boolean,
  options?: { configure?: boolean }
): Promise<void> {
  const prisma = createE2EPrismaClient();
  try {
    const data: Record<string, unknown> = { stripeEnabled: enabled };
    if (options?.configure) {
      data.stripeSecretKey = TEST_STRIPE_CONFIG.secretKey;
      data.stripeWebhookSecret = TEST_STRIPE_CONFIG.webhookSecret;
      data.stripePriceIds = TEST_STRIPE_CONFIG.priceIds;
    }
    await prisma.config.upsert({
      where: { id: CONFIG_ID },
      update: data,
      create: { id: CONFIG_ID, ...data },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Seeds fully-configured (but disabled) Stripe credentials — the pre-condition
 * for testing the "enable unlocks once configured" admin flow.
 */
export async function seedStripeConfigDisabled(): Promise<void> {
  await setStripeEnabled(false, { configure: true });
}

/**
 * Forces a user into the "gated non-member" state: not admin, not exempt, and
 * with no access-granting subscription. This is what the gate redirects to
 * `/subscribe`.
 */
export async function makeUserGatedNonMember(userId: string): Promise<void> {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.subscription.deleteMany({ where: { userId } });
    await prisma.user.update({
      where: { id: userId },
      data: { isExempt: false, exemptReason: null },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Restores default (feature-off) Stripe state and clears any per-user Stripe
 * artifacts created by a spec. Call in afterAll so other specs see pre-feature
 * behavior.
 */
export async function resetStripeState(userIds: string[] = []): Promise<void> {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.config.upsert({
      where: { id: CONFIG_ID },
      update: {
        stripeEnabled: false,
        stripeSecretKey: null,
        stripeWebhookSecret: null,
        stripePriceIds: [],
      },
      create: { id: CONFIG_ID, stripeEnabled: false },
    });
    for (const userId of userIds) {
      await prisma.subscription.deleteMany({ where: { userId } });
      await prisma.user.update({
        where: { id: userId },
        data: { isExempt: false, exemptReason: null },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}
