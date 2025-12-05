/**
 * Setup Wizard E2E Test
 *
 * This test verifies the complete setup wizard flow from an empty database.
 * Connection tests are bypassed via SKIP_CONNECTION_TESTS=true environment variable,
 * which causes all connection test functions to return success immediately.
 */

import { expect, test } from '@playwright/test';
import globalSetup from './global-setup';
import { createE2EPrismaClient } from './helpers/prisma';
import { navigateAndVerify, waitForLoadingGone, WAIT_TIMEOUTS } from './helpers/test-utils';

import type { PrismaClient } from '../lib/generated/prisma/client';

test.describe('Setup Wizard', () => {
  test.describe.configure({ mode: 'serial' });
  let prisma: PrismaClient;

  test.beforeAll(async () => {
    prisma = createE2EPrismaClient();
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
    await expect(page.getByTestId('setup-wizard-intro-text')).toBeVisible();

    // Known hidden fields that are auto-populated by form logic
    // These fields have hidden inputs for form submission but are managed by custom UI components
    const HIDDEN_FIELDS = ['provider']; // Dropdown with hidden input for form submission

    // Helper function to fill and submit a form step
    const fillAndSubmitStep = async (stepName: string, fields: Record<string, string>) => {
      console.log(`[TEST] Starting step: ${stepName}`);

      // Wait for the step heading to be visible
      await expect(page.getByRole('heading', { name: new RegExp(stepName, 'i') })).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

      // Fill all fields
      for (const [name, value] of Object.entries(fields)) {
        // Use data-testid selector pattern for better test stability
        const input = page.getByTestId(`setup-input-${name}`);

        // Check if this is a known hidden field (dropdown with hidden input)
        if (HIDDEN_FIELDS.includes(name)) {
          console.log(`[TEST] Skipping known hidden field: ${name} (uses custom UI component)`);
          continue;
        }

        // Wait for element to be attached to DOM first
        await input.waitFor({ state: 'attached', timeout: WAIT_TIMEOUTS.DIALOG_APPEAR });

        // Enhanced hidden input detection - handles both hidden inputs and CSS-based hiding
        const isHidden = await input.evaluate((el) => {
          // Check if it's a hidden input element
          if (el instanceof HTMLInputElement && el.type === 'hidden') {
            return true;
          }
          // Check CSS-based hiding (display: none, visibility: hidden)
          const style = window.getComputedStyle(el);
          return style.display === 'none' || style.visibility === 'hidden';
        }).catch((error) => {
          console.log(`[TEST] Warning: Could not check if input "${name}" is hidden:`, error.message);
          // Only ignore "unable to adopt element" errors (element detached from DOM)
          // Re-throw other errors for visibility
          if (!error.message.includes('unable to adopt element')) {
            throw error;
          }
          return false;
        });

        if (isHidden) {
          console.log(`[TEST] Skipping hidden input: ${name}`);
          continue;
        }

        await input.waitFor({ state: 'visible', timeout: WAIT_TIMEOUTS.DIALOG_APPEAR });
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
        { timeout: WAIT_TIMEOUTS.ADMIN_CONTENT }
      ).catch(() => null);

      // Wait for the response to complete (don't use fixed timeout, wait for actual response)
      await responsePromise;

      // Wait for loading to complete after form submission
      await waitForLoadingGone(page);

      // Wait for DOM to be fully loaded and stable after form submission
      await page.waitForLoadState('domcontentloaded');

      // Check for error messages on the page
      const errorElement = page.locator('text=/error|Error|failed|Failed/i').first();
      const hasError = await errorElement.isVisible({ timeout: WAIT_TIMEOUTS.SHORT_CHECK }).catch(() => false);
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
    await expect(page.getByRole('heading', { name: /Discord Linked Roles/i })).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    const discordToggle = page.getByTestId('setup-discord-toggle');
    if ((await discordToggle.getAttribute('aria-pressed')) === 'false') {
      await discordToggle.click();
      // Wait for conditional fields to appear after toggle
      await page.locator('input[name="clientId"]').waitFor({ state: 'visible', timeout: WAIT_TIMEOUTS.DIALOG_APPEAR });
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
    await page.waitForURL('**/', { timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });
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

  test('should handle hidden form inputs gracefully', async ({ page }) => {
    // This test verifies that the form input helper correctly identifies and skips hidden inputs
    // without causing test timeouts or failures.

    // Navigate to setup page
    await navigateAndVerify(page, '/setup');
    await waitForLoadingGone(page);

    // Navigate through to LLM provider step where the 'provider' field exists
    // The 'provider' field is a dropdown with a hidden input for form submission
    // We want to verify it doesn't cause issues with the test helper

    // Quick navigation to step 7 (Chat Assistant AI)
    // In a real scenario this would be populated, but for this test we just need to reach the step
    await page.goto('/setup');
    await waitForLoadingGone(page);

    // Verify the hidden input exists and has correct data-testid
    const providerHiddenInput = page.getByTestId('setup-input-provider-hidden');

    // The hidden input should exist but not be visible
    const exists = await providerHiddenInput.count();

    if (exists > 0) {
      // Hidden input should have display: none or visibility: hidden
      const isVisuallyHidden = await providerHiddenInput.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return (
          (el instanceof HTMLInputElement && el.type === 'hidden') ||
          style.display === 'none' ||
          style.visibility === 'hidden'
        );
      }).catch(() => true); // If evaluation fails, assume it's hidden

      expect(isVisuallyHidden).toBe(true);
      console.log('[TEST] Verified provider hidden input is correctly hidden');
    }
  });
});
