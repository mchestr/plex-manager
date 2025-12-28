import { createE2EPrismaClient } from './helpers/prisma';

/**
 * Global setup for Playwright tests
 * This runs once before all tests to ensure the database is seeded with test data
 */
async function globalSetup() {
  console.log('[E2E Setup] Starting E2E test setup...');

  const databaseUrl = process.env.DATABASE_URL;

  console.log('[E2E Setup] Database URL:', databaseUrl?.replace(/\/\/[^:]+:[^@]+@/, '//***:***@') || 'not set');
  console.log('[E2E Setup] Test auth enabled:', process.env.NEXT_PUBLIC_ENABLE_TEST_AUTH);

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
          currentStep: 5,
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

    console.log('[E2E Setup] Database setup complete');
    console.log('[E2E Setup] Verifying test users...');

    // Verify test users exist
    const adminCount = await prisma.user.count({ where: { email: 'admin@example.com' } });
    const regularCount = await prisma.user.count({ where: { email: 'regular@example.com' } });
    console.log(`[E2E Setup] Admin users: ${adminCount}, Regular users: ${regularCount}`);

  } catch (error) {
    console.error('[E2E Setup] Error setting up database:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
    console.log('[E2E Setup] Database connection closed');
  }
}

export default globalSetup;

