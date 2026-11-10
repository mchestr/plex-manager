import { createE2EPrismaClient } from './helpers/prisma';
import { clearRateLimits, redisAnswers } from './helpers/rate-limits';
import { startMockLlm } from './mocks/llm-server';
import { startMockPlexTv } from './mocks/plex-tv-server';
import { startSmtpSink } from './mocks/smtp-server';
import { startMockTautulli } from './mocks/tautulli-server';

/**
 * Global setup for Playwright tests
 * This runs once before all tests to ensure the database is seeded with test data
 */
async function globalSetup() {
  console.log('[E2E Setup] Starting E2E test setup...');

  const databaseUrl = process.env.DATABASE_URL;

  console.log('[E2E Setup] Database URL:', databaseUrl?.replace(/\/\/[^:]+:[^@]+@/, '//***:***@') || 'not set');

  const prisma = createE2EPrismaClient();

  try {
    // Test database connection
    await prisma.$connect();
    console.log('[E2E Setup] Database connection successful');
    // Check if setup is already complete
    const setup = await prisma.setup.findFirst();

    if (!setup || !setup.isComplete) {
      // Create setup completed
      await prisma.setup.deleteMany();
      await prisma.setup.create({
        data: {
          isComplete: true,
          currentStepId: 'summary',
          completedAt: new Date(),
        },
      });
      console.log('[E2E Setup] Created setup record');
    }

    // Check if Plex server exists
    const plexServer = await prisma.plexServer.findFirst({ where: { isActive: true } });

    if (!plexServer) {
      await prisma.plexServer.create({
        data: {
          name: 'Test Server',
          url: 'http://localhost:32400',
          token: 'test-token',
          adminPlexUserId: 'admin-plex-id',
          isActive: true,
        },
      });
      console.log('[E2E Setup] Created Plex server');
    }

    // Check if admin user exists
    const adminUser = await prisma.user.findUnique({
      where: { email: 'admin@example.com' },
    });

    if (!adminUser) {
      await prisma.user.create({
        data: {
          id: 'admin-user-id',
          plexUserId: 'admin-plex-id',
          name: 'Admin User',
          email: 'admin@example.com',
          isAdmin: true,
          primaryAuthService: 'plex',
          onboardingStatus: { plex: true },
        },
      });
      console.log('[E2E Setup] Created admin user');
    }

    // Check if regular user exists
    const regularUser = await prisma.user.findUnique({
      where: { email: 'regular@example.com' },
    });

    if (!regularUser) {
      await prisma.user.create({
        data: {
          id: 'regular-user-id',
          plexUserId: 'regular-plex-id',
          name: 'Regular User',
          email: 'regular@example.com',
          isAdmin: false,
          primaryAuthService: 'plex',
          onboardingStatus: { plex: true },
        },
      });
      console.log('[E2E Setup] Created regular user');
    }

    console.log('[E2E Setup] Database setup complete');
    console.log('[E2E Setup] Verifying test users...');

    // Verify test users exist
    const adminCount = await prisma.user.count({ where: { email: 'admin@example.com' } });
    const regularCount = await prisma.user.count({ where: { email: 'regular@example.com' } });
    console.log(`[E2E Setup] Admin users: ${adminCount}, Regular users: ${regularCount}`);

    // Rewind's checkRewindInfra() fails without Redis (FR-50), and every
    // Rewind spec would then screenshot or scan the unavailable panel.
    if (!(await redisAnswers(process.env.REDIS_URL))) {
      throw new Error('[E2E Setup] Redis does not answer at REDIS_URL; Rewind needs it (FR-50). Start Redis or set REDIS_URL.');
    }

    // The web server inherits REDIS_URL from .env, so limiter counts from an
    // earlier run would otherwise carry over into this one.
    if (process.env.REDIS_URL) {
      const deleted = await clearRateLimits(process.env.REDIS_URL);
      if (deleted !== null) {
        console.log(`[E2E Setup] Cleared ${deleted} rate-limit counters from Redis`);
      }
    }

  } catch (error) {
    console.error('[E2E Setup] Error setting up database:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
    console.log('[E2E Setup] Database connection closed');
  }

  // The app calls the assistant's chat model from the server, so specs point an
  // openai-compatible provider at this mock; workers inherit the URL through the environment.
  const llm = await startMockLlm();
  process.env.E2E_LLM_URL = llm.url;
  console.log(`[E2E Setup] Mock LLM listening at ${llm.url}`);
  // And for Tautulli, which making an affiliate invite reads live: specs point an active Tautulli row at it
  const tautulli = await startMockTautulli();
  process.env.E2E_TAUTULLI_URL = tautulli.url;
  console.log(`[E2E Setup] Mock Tautulli listening at ${tautulli.url}`);
  // And a mail server: the web server's SMTP_URL names its fixed port (playwright.config.ts).
  // The setup specs run this setup again in a worker, where the runner's sink still holds
  // that port and E2E_SMTP_INBOX_URL is already set, so only the first run starts it.
  const smtp = process.env.E2E_SMTP_INBOX_URL ? null : await startSmtpSink();
  if (smtp) {
    process.env.E2E_SMTP_INBOX_URL = smtp.inboxUrl;
    console.log(`[E2E Setup] SMTP sink listening, inbox at ${smtp.inboxUrl}`);
  }
  // And plex.tv's share list, at the fixed port the web server's E2E_PLEX_TV_URL names.
  // Like the sink, only the first run starts it; E2E_PLEX_TV_MOCK marks that it runs.
  const plexTv = process.env.E2E_PLEX_TV_MOCK ? null : await startMockPlexTv();
  if (plexTv) {
    process.env.E2E_PLEX_TV_MOCK = '1';
    console.log('[E2E Setup] Mock plex.tv listening');
  }
  return async () => {
    await Promise.all(
      [llm.server, tautulli.server, ...(smtp ? [smtp.smtp, smtp.http] : []), ...(plexTv ? [plexTv] : [])].map(
        (server) => new Promise<void>((resolve) => server.close(() => resolve()))
      )
    );
  };
}

export default globalSetup;

