import { PrismaClient, ServiceType } from '../lib/generated/prisma/client'
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
  await prisma.service.deleteMany()
  await prisma.setup.deleteMany()

  // Create setup completed
  await prisma.setup.create({
    data: {
      isComplete: true,
      currentStep: 5,
      completedAt: new Date(),
    },
  })

  // Create dummy Plex service
  await prisma.service.create({
    data: {
      type: ServiceType.PLEX,
      name: 'Test Plex Server',
      url: 'http://localhost:32400',
      isActive: true,
      config: {
        token: 'test-token',
        adminPlexUserId: 'admin-plex-id',
      },
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
      onboardingCompleted: true,
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
      onboardingCompleted: true,
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
