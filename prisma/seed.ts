import { PrismaClient } from '../lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

// Allow skipping seed via environment variable (useful for migrations)
if (process.env.SKIP_SEED === 'true') {
  console.log('Skipping seed (SKIP_SEED=true)')
  process.exit(0)
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not defined')
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
})
const prisma = new PrismaClient({ adapter })

async function main() {
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

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
