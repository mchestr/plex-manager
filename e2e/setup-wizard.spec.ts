/**
 * Setup Wizard E2E Test
 *
 * This test verifies the complete setup wizard flow from an empty database.
 * Connection tests are bypassed via SKIP_CONNECTION_TESTS=true environment variable,
 * which causes all connection test functions to return success immediately.
 */

import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import globalSetup from './global-setup';
import { navigateAndVerify, waitForLoadingGone } from './helpers/test-utils';

test.describe('Setup Wizard', () => {
  test.describe.configure({ mode: 'serial' });
  let prisma: PrismaClient;

  test.beforeAll(async () => {
    prisma = new PrismaClient();
  });

  test.afterAll(async () => {
    // Restore the global E2E seed state (admin/regular users, setup completion, etc.)
    // so that other specs can rely on consistent fixtures after this destructive test.
    await globalSetup();
    await prisma.$disconnect();
  });

  test('should complete setup wizard from empty database', async ({ page }) => {
    // Set a longer timeout for this test since it goes through the entire wizard
    test.setTimeout(120000); // 2 minutes

    // Connection tests are bypassed via SKIP_CONNECTION_TESTS=true in Playwright config
    // The connection test functions check for NODE_ENV=test or SKIP_CONNECTION_TESTS=true
    // and return success immediately without making actual API calls

    // Clear all setup-related data to start fresh
    await prisma.lLMUsage.deleteMany();
    await prisma.wrappedShareVisit.deleteMany();
    await prisma.plexWrapped.deleteMany();
    await prisma.inviteUsage.deleteMany();
    await prisma.invite.deleteMany();
    await prisma.user.deleteMany();
    await prisma.lLMProvider.deleteMany();
    await prisma.discordIntegration.deleteMany();
    await prisma.radarr.deleteMany();
    await prisma.sonarr.deleteMany();
    await prisma.overseerr.deleteMany();
    await prisma.tautulli.deleteMany();
    await prisma.plexServer.deleteMany();
    await prisma.setup.deleteMany();

    // No route interception needed - connection tests are bypassed via SKIP_CONNECTION_TESTS=true
    // The connection test functions check for NODE_ENV=test or SKIP_CONNECTION_TESTS=true
    // and return success immediately without making actual API calls

    // Navigate to setup page
    await navigateAndVerify(page, '/setup');
    await waitForLoadingGone(page);

    // Verify we're on the setup wizard
    await expect(page.getByRole('heading', { name: /Welcome to Plex Manager/i })).toBeVisible();
    await expect(page.getByText(/Let's get your Plex Manager setup configured/i).first()).toBeVisible();

    // Helper function to fill and submit a form step
    const fillAndSubmitStep = async (stepName: string, fields: Record<string, string>) => {
      console.log(`[TEST] Starting step: ${stepName}`);

      // Wait for the step heading to be visible
      await expect(page.getByRole('heading', { name: new RegExp(stepName, 'i') })).toBeVisible({ timeout: 10000 });

      // Fill all fields
      for (const [name, value] of Object.entries(fields)) {
        const input = page.locator(`input[name="${name}"], select[name="${name}"], textarea[name="${name}"]`).first();

        // Check if input is hidden and skip if so
        const isHidden = await input.evaluate((el) => {
          return el instanceof HTMLInputElement && el.type === 'hidden';
        }).catch(() => false);

        if (isHidden) {
          console.log(`[TEST] Skipping hidden input: ${name}`);
          continue;
        }

        await input.waitFor({ state: 'visible', timeout: 5000 });
        const tagName = await input.evaluate((el) => el.tagName);
        if (tagName === 'SELECT') {
          await input.selectOption(value);
        } else {
          await input.fill(value);
        }
      }

      // Submit form
      const submitButton = page.getByTestId('setup-form-submit');

      console.log(`[TEST] Clicking submit button for ${stepName}`);

      // Wait for any pending requests to complete before submitting
      await page.waitForLoadState('networkidle');

      await submitButton.click();

      // Wait for the server action to complete
      // Listen for the response
      const responsePromise = page.waitForResponse(
        (response) => {
          const url = response.url();
          const method = response.request().method();
          return method === 'POST' && (url.includes('/setup') || url.includes('/_next/'));
        },
        { timeout: 15000 }
      ).catch(() => null);

      // Wait for the response to complete (don't use fixed timeout, wait for actual response)
      await responsePromise;

      // Wait for loading to complete after form submission
      await waitForLoadingGone(page);

      // Small delay to ensure UI has updated
      await page.waitForTimeout(500);

      // Check for error messages on the page
      const errorElement = page.locator('text=/error|Error|failed|Failed/i').first();
      const hasError = await errorElement.isVisible({ timeout: 2000 }).catch(() => false);
      if (hasError) {
        const errorText = await errorElement.textContent();
        console.log(`[TEST] Error visible on page for ${stepName}:`, errorText);
        // Take a screenshot for debugging
        await page.screenshot({ path: `test-results/error-${stepName}-${Date.now()}.png` });
      }
    };

    // Step 1: Plex Server Configuration
    await fillAndSubmitStep('Plex Server', {
      name: 'Test Plex Server',
      url: 'http://localhost:32400',
      token: 'test-plex-token-12345',
      publicUrl: 'http://localhost:32400',
    });

    // Step 2: Tautulli Configuration
    await fillAndSubmitStep('Tautulli', {
      name: 'Test Tautulli',
      url: 'http://localhost:8181',
      apiKey: 'test-tautulli-api-key',
      publicUrl: 'http://localhost:8181',
    });

    // Step 3: Overseerr Configuration
    await fillAndSubmitStep('Overseerr', {
      name: 'Test Overseerr',
      url: 'http://localhost:5055',
      apiKey: 'test-overseerr-api-key',
      publicUrl: 'http://localhost:5055',
    });

    // Step 4: Sonarr Configuration
    await fillAndSubmitStep('Sonarr', {
      name: 'Test Sonarr',
      url: 'http://localhost:8989',
      apiKey: 'test-sonarr-api-key',
      publicUrl: 'http://localhost:8989',
    });

    // Step 5: Radarr Configuration
    await fillAndSubmitStep('Radarr', {
      name: 'Test Radarr',
      url: 'http://localhost:7878',
      apiKey: 'test-radarr-api-key',
      publicUrl: 'http://localhost:7878',
    });

    // Step 6: Discord Linked Roles
    await expect(page.getByRole('heading', { name: /Discord Linked Roles/i })).toBeVisible({ timeout: 10000 });
    const discordToggle = page.getByTestId('setup-discord-toggle');
    if ((await discordToggle.getAttribute('aria-pressed')) === 'false') {
      await discordToggle.click();
    }
    await fillAndSubmitStep('Discord Linked Roles', {
      clientId: 'discord-client-id',
      clientSecret: 'discord-client-secret',
      guildId: '1234567890',
      platformName: 'Plex Wrapped Test',
      instructions: 'Use this Discord app for linked roles.',
    });

    // Step 7: Chat Assistant AI Configuration
    await fillAndSubmitStep('Chat Assistant AI Configuration', {
      provider: 'openai',
      apiKey: 'sk-chat-openai-api-key',
      model: 'gpt-4o-mini',
      temperature: '0.6',
      maxTokens: '1200',
    });

    // Step 8: Wrapped Generation AI Configuration
    await fillAndSubmitStep('Wrapped Generation AI Configuration', {
      provider: 'openai',
      apiKey: 'sk-wrapped-openai-api-key',
      model: 'gpt-4o-mini',
      temperature: '0.8',
      maxTokens: '6000',
    });

    // Wait for final success animation and redirect to home
    await page.waitForURL('**/', { timeout: 15000 });
    await waitForLoadingGone(page);

    // Verify setup is complete in database
    const setup = await prisma.setup.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    expect(setup).toBeTruthy();
    expect(setup?.isComplete).toBe(true);
    expect(setup?.completedAt).toBeTruthy();

    // Verify all configurations were saved
    const plexServer = await prisma.plexServer.findFirst();
    expect(plexServer).toBeTruthy();
    expect(plexServer?.name).toBe('Test Plex Server');

    const tautulli = await prisma.tautulli.findFirst();
    expect(tautulli).toBeTruthy();
    expect(tautulli?.name).toBe('Test Tautulli');

    const overseerr = await prisma.overseerr.findFirst();
    expect(overseerr).toBeTruthy();
    expect(overseerr?.name).toBe('Test Overseerr');

    const sonarr = await prisma.sonarr.findFirst();
    expect(sonarr).toBeTruthy();
    expect(sonarr?.name).toBe('Test Sonarr');

    const radarr = await prisma.radarr.findFirst();
    expect(radarr).toBeTruthy();
    expect(radarr?.name).toBe('Test Radarr');

    const discordIntegration = await prisma.discordIntegration.findFirst();
    expect(discordIntegration).toBeTruthy();
    expect(discordIntegration?.isEnabled).toBe(true);
    expect(discordIntegration?.clientId).toBe('discord-client-id');

    const chatLLMProvider = await prisma.lLMProvider.findFirst({
      where: { purpose: 'chat' },
    });
    expect(chatLLMProvider).toBeTruthy();
    expect(chatLLMProvider?.provider).toBe('openai');
    expect(chatLLMProvider?.purpose).toBe('chat');

    const wrappedLLMProvider = await prisma.lLMProvider.findFirst({
      where: { purpose: 'wrapped' },
    });
    expect(wrappedLLMProvider).toBeTruthy();
    expect(wrappedLLMProvider?.provider).toBe('openai');
    expect(wrappedLLMProvider?.purpose).toBe('wrapped');
  });
});
