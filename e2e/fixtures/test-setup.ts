/**
 * Extended Playwright test with MSW network fixture
 *
 * This file provides:
 * - `test` - Extended test with network mocking
 * - `network` - MSW network fixture for API mocking
 * - `adminPage` - Pre-authenticated admin user page
 * - `regularUserPage` - Pre-authenticated regular user page
 *
 * Note: Authentication uses test tokens that the server recognizes when
 * ENABLE_TEST_AUTH=true. MSW is used for mocking client-side API calls only.
 *
 * Usage:
 * ```ts
 * import { test, expect } from './fixtures/test-setup'
 *
 * test('my test', async ({ page, network }) => {
 *   network.use(
 *     http.get('/api/custom', () => HttpResponse.json({ data: 'test' }))
 *   )
 *   await page.goto('/my-page')
 * })
 * ```
 */

import { test as base, expect as baseExpect, type Page, type BrowserContext, type Browser } from '@playwright/test'
import { createNetworkFixture, type NetworkFixture } from '@msw/playwright'
import { http, HttpResponse } from 'msw'
import { handlers } from '../mocks/handlers'
import { TEST_USERS, toSessionUser } from './factories'

/**
 * Custom fixtures for E2E tests
 */
interface TestFixtures {
  /**
   * MSW network fixture for mocking API calls.
   * Default handlers are automatically applied.
   * Use `network.use()` to add test-specific overrides.
   */
  network: NetworkFixture

  /**
   * Page authenticated as admin user.
   * Uses test token authentication - server must have ENABLE_TEST_AUTH=true.
   */
  adminPage: Page

  /**
   * Page authenticated as regular (non-admin) user.
   * Uses test token authentication - server must have ENABLE_TEST_AUTH=true.
   */
  regularUserPage: Page
}

/**
 * Authenticate a page using test tokens
 * This replicates the existing authentication flow but without database dependency
 */
async function authenticateAs(
  page: Page,
  testToken: string,
  expectedUser: typeof TEST_USERS.ADMIN | typeof TEST_USERS.REGULAR
): Promise<void> {
  console.log(`[E2E Auth] Authenticating with token: ${testToken}`)

  // Listen to console messages for debugging
  page.on('console', msg => {
    if (msg.text().includes('[AUTH]')) {
      console.log(`[Browser Console] ${msg.text()}`)
    }
  })

  // Navigate to the callback URL with the test token
  await page.goto(`/auth/callback/plex?testToken=${testToken}`, { waitUntil: 'load' })
  console.log(`[E2E Auth] Callback page loaded`)

  // Wait for redirect to home or onboarding
  try {
    await page.waitForURL((url) => {
      const isHome = url.pathname === '/' || url.pathname === ''
      const isOnboarding = url.pathname === '/onboarding'
      return isHome || isOnboarding
    }, { timeout: 30000 })
    console.log(`[E2E Auth] Redirected to: ${page.url()}`)

    // If redirected to onboarding, complete the wizard
    if (page.url().includes('/onboarding')) {
      console.log(`[E2E Auth] User redirected to onboarding, completing wizard...`)

      // Complete onboarding by clicking through all steps
      const maxSteps = 5
      for (let step = 0; step < maxSteps; step++) {
        // Look for "Let's Go", "Next", "Continue", or "Complete" buttons
        const nextButton = page.getByRole('button', { name: /Let's Go|Next|Continue|Complete|Get Started/i }).first()
        const isVisible = await nextButton.isVisible({ timeout: 2000 }).catch(() => false)

        if (isVisible) {
          await nextButton.click()
          await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})

          // Check if we're now on home page
          if (!page.url().includes('/onboarding')) {
            console.log(`[E2E Auth] Onboarding completed, now at: ${page.url()}`)
            break
          }
        } else {
          // No more buttons, try navigating to home
          break
        }
      }

      // Ensure we end up on home page
      if (page.url().includes('/onboarding')) {
        console.log(`[E2E Auth] Still on onboarding, forcing navigation to home`)
        await page.goto('/')
        await page.waitForLoadState('networkidle')
      }
    }
  } catch (error) {
    const currentUrl = page.url()
    console.error(`[E2E Auth] Failed to redirect. Current URL: ${currentUrl}`)
    try {
      if (!page.isClosed()) {
        await page.screenshot({ path: 'test-results/auth-redirect-failure.png' })
      }
    } catch (screenshotError) {
      console.error(`[E2E Auth] Could not take screenshot:`, screenshotError)
    }
    throw error
  }

  // Wait for DOM to be ready
  await page.waitForLoadState('domcontentloaded', { timeout: 10000 })

  // Verify session was created by checking the session API
  let session: { user?: unknown } | null = null
  let attempts = 0
  const maxAttempts = 20

  while (attempts < maxAttempts) {
    attempts++
    try {
      const sessionResponse = await page.request.get('/api/auth/session')
      session = await sessionResponse.json()

      if (session && session.user) {
        console.log(`[E2E Auth] Session established on attempt ${attempts}`)
        break
      }
    } catch (err) {
      console.log(`[E2E Auth] Session check failed on attempt ${attempts}, retrying...`)
    }

    await new Promise(resolve => setTimeout(resolve, 500))
  }

  if (!session || !session.user) {
    const cookies = await page.context().cookies()
    const authCookies = cookies.filter(c => c.name.includes('next-auth'))

    throw new Error(
      `Failed to create session for test token: ${testToken}.\n` +
      `Session: ${JSON.stringify(session)}\n` +
      `Auth cookies: ${JSON.stringify(authCookies.map(c => c.name))}\n` +
      `Attempts: ${attempts}/${maxAttempts}`
    )
  }

  console.log(`[E2E Auth] Successfully authenticated as: ${expectedUser.email}`)
}

/**
 * Verify that a user is properly authenticated
 */
async function verifyAuthentication(page: Page, isAdmin: boolean): Promise<void> {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  if (isAdmin) {
    await page.goto('/admin')
    // Verify no 401 error is shown
    const unauthorizedError = page.getByText('401', { exact: true })
    await baseExpect(unauthorizedError).not.toBeVisible()
  }
}

/**
 * Extended test with MSW network fixture and authenticated pages
 */
export const test = base.extend<TestFixtures>({
  // Network fixture with default handlers
  network: createNetworkFixture({
    initialHandlers: handlers,
  }),

  // Admin authenticated page
  adminPage: async ({ browser }, use) => {
    const context = await browser.newContext({ acceptDownloads: true })
    const page = await context.newPage()

    await authenticateAs(page, TEST_USERS.ADMIN.testToken, TEST_USERS.ADMIN)
    await verifyAuthentication(page, true)

    await use(page)

    await context.close()
  },

  // Regular user authenticated page
  regularUserPage: async ({ browser }, use) => {
    const context = await browser.newContext({ acceptDownloads: true })
    const page = await context.newPage()

    await authenticateAs(page, TEST_USERS.REGULAR.testToken, TEST_USERS.REGULAR)
    await verifyAuthentication(page, false)

    await use(page)

    await context.close()
  },
})

export { baseExpect as expect }

// Re-export commonly used MSW utilities for convenience
export { http, HttpResponse } from 'msw'

// Re-export factories for test data creation
export * from './factories'

// Re-export handler utilities for test-specific overrides
export {
  createSessionHandler,
  createAdminSessionHandler,
  createRegularUserSessionHandler,
  createNoSessionHandler,
  setWrappedForToken,
  clearWrappedStore,
  createWrappedHandler,
  createNotFoundWrappedHandler,
  createAndStoreInvite,
  clearInviteStore,
  createValidInviteHandler,
  createInvalidInviteHandler,
  setAnnouncements,
  clearAnnouncementsStore,
} from '../mocks/handlers'
