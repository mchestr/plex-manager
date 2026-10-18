import { PrismaClient } from '../lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { assertSeedTarget, isE2ETestMode } from '../lib/security/test-mode'

/**
 * The seed wipes users, Rewinds and service configuration, then creates a
 * hardcoded admin@example.com admin. It runs only with the explicit
 * E2E_TEST_MODE=true flag (never in production) and only against a local host
 * or a database whose name ends in _test.
 */
function resolveSeedTarget(): string {
  if (!isE2ETestMode()) {
    throw new Error(
      'Refusing to seed: set E2E_TEST_MODE=true (never in production) to confirm this is a disposable database.'
    )
  }
  const target = assertSeedTarget(process.env.DATABASE_URL)
  console.log(`Seeding database "${target.database}" on host "${target.host}"`)
  return target.url
}

async function main() {
  const connectionString = resolveSeedTarget()
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
  try {
    await seed(prisma)
  } finally {
    await prisma.$disconnect()
  }
}

async function seed(prisma: PrismaClient) {
  // Cleanup existing data
  await prisma.lLMUsage.deleteMany()
  await prisma.wrappedShareVisit.deleteMany()
  await prisma.plexWrapped.deleteMany()
  await prisma.user.deleteMany()
  await prisma.plexServer.deleteMany()
  await prisma.setup.deleteMany()
  await prisma.lLMProvider.deleteMany()
  await prisma.tautulli.deleteMany()
  await prisma.overseerr.deleteMany()

  // Create setup completed
  await prisma.setup.create({
    data: {
      isComplete: true,
      currentStep: 5,
      completedAt: new Date(),
    },
  })

  // Create dummy Plex server
  await prisma.plexServer.create({
    data: {
      name: 'Test Plex Server',
      url: 'http://localhost:32400',
      token: 'test-token',
      adminPlexUserId: 'admin-plex-id',
      isActive: true,
    },
  })

  // Create admin user
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
  })

  // Create regular user
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
  })

  console.log('Database seeded!')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
