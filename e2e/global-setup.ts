import { createE2EPrismaClient } from './helpers/prisma';
import { clearRateLimits, redisAnswers } from './helpers/rate-limits';
import { JELLYFIN_MEMBERS } from './helpers/jellyfin-members';
import { startMockJellyfin } from './mocks/jellyfin-server';
import { startMockLlm } from './mocks/llm-server';

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
          onboardingStatus: { plex: true, jellyfin: false },
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
          onboardingStatus: { plex: true, jellyfin: false },
        },
      });
      console.log('[E2E Setup] Created regular user');
    }

    // A Jellyfin-only member and one with both identities (P11.10). Their
    // Jellyfin accounts live on the mock server started below.
    for (const member of JELLYFIN_MEMBERS) {
      await prisma.user.upsert({ where: { id: member.id }, create: member, update: member });
    }
    console.log('[E2E Setup] Seeded the Jellyfin members');

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

  // The app calls Jellyfin from the server, so specs point a JellyfinServer
  // row at this mock; workers inherit the URL through the environment.
  const jellyfin = await startMockJellyfin();
  process.env.E2E_JELLYFIN_URL = jellyfin.url;
  console.log(`[E2E Setup] Mock Jellyfin listening at ${jellyfin.url}`);
  // The same for the assistant's chat model: specs point an openai-compatible provider at it
  const llm = await startMockLlm();
  process.env.E2E_LLM_URL = llm.url;
  console.log(`[E2E Setup] Mock LLM listening at ${llm.url}`);
  return async () => {
    await Promise.all(
      [jellyfin.server, llm.server].map((server) => new Promise<void>((resolve) => server.close(() => resolve())))
    );
  };
}

export default globalSetup;

