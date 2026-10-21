import extreme from '../fixtures/rewind/extreme.v3.json';
import heavy from '../fixtures/rewind/heavy.v3.json';
import light from '../fixtures/rewind/light.v3.json';
import median from '../fixtures/rewind/median.v3.json';
import { createE2EPrismaClient } from './prisma';

/**
 * The Rewind seed for the story, visual, axe and performance specs (P5.4).
 *
 * Four members (heavy, median, light and extreme) each get a stored v3
 * Rewind for {@link REWIND_YEAR}, read from `e2e/fixtures/rewind/<id>.v3.json`
 * (built from P2.10's golden fixtures by `npm run rewind:e2e-fixtures`,
 * checked in Jest). Seeding turns Rewind on for everyone (`rewindEnabled`,
 * `rewindAudience = 'all'`), and {@link clearRewindSeed} puts the flags back
 * and removes the members, so screens of other specs never list them.
 *
 * The E2E Plex server is unreachable, so posters render as title cards.
 *
 * @module e2e/helpers/seed-rewind
 */

export const REWIND_YEAR = 2026;

export const REWIND_ISSUES = { heavy, median, light, extreme } as const;

export type RewindFixtureId = keyof typeof REWIND_ISSUES;

export const REWIND_FIXTURE_IDS = Object.keys(REWIND_ISSUES) as RewindFixtureId[];

/** The seeded member who owns each fixture's Rewind. */
export const REWIND_MEMBERS: Record<RewindFixtureId, { id: string; plexUserId: string; name: string; email: string }> =
  Object.fromEntries(
    REWIND_FIXTURE_IDS.map((id) => [
      id,
      { id: `rewind-${id}-user-id`, plexUserId: `rewind-${id}-plex-id`, name: `Rewind ${id}`, email: `rewind-${id}@example.com` },
    ])
  ) as Record<RewindFixtureId, { id: string; plexUserId: string; name: string; email: string }>;

/** The flags as they were before {@link seedRewind}, restored by {@link clearRewindSeed}. */
let savedFlags: { rewindEnabled: boolean; rewindAudience: string } | null = null;

/** Writes `userId`'s completed v3 Rewind for {@link REWIND_YEAR} from a fixture, replacing any row there. */
export async function seedRewindIssue(userId: string, fixture: RewindFixtureId): Promise<void> {
  const data = REWIND_ISSUES[fixture];
  const prisma = createE2EPrismaClient();
  try {
    await prisma.plexWrapped.deleteMany({ where: { userId, year: REWIND_YEAR } });
    await prisma.plexWrapped.create({
      data: {
        userId,
        year: REWIND_YEAR,
        status: 'completed',
        dataVersion: 3,
        edition: data.edition,
        factsHash: data.factsHash,
        data: JSON.stringify(data),
        generatedAt: new Date(data.generatedAt),
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/** Removes `userId`'s Rewind for {@link REWIND_YEAR}. */
export async function clearRewindIssue(userId: string): Promise<void> {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.plexWrapped.deleteMany({ where: { userId, year: REWIND_YEAR } });
  } finally {
    await prisma.$disconnect();
  }
}

/** Creates the four members with their Rewinds and opens Rewind to everyone. */
export async function seedRewind(): Promise<void> {
  const prisma = createE2EPrismaClient();
  try {
    const config = await prisma.config.upsert({ where: { id: 'config' }, create: { id: 'config' }, update: {} });
    savedFlags ??= { rewindEnabled: config.rewindEnabled, rewindAudience: config.rewindAudience };
    await prisma.config.update({ where: { id: 'config' }, data: { rewindEnabled: true, rewindAudience: 'all' } });
    for (const member of Object.values(REWIND_MEMBERS)) {
      const row = { ...member, isAdmin: false, primaryAuthService: 'plex', onboardingStatus: { plex: true, jellyfin: false } };
      await prisma.user.upsert({ where: { id: member.id }, create: row, update: row });
    }
  } finally {
    await prisma.$disconnect();
  }
  for (const id of REWIND_FIXTURE_IDS) await seedRewindIssue(REWIND_MEMBERS[id].id, id);
}

/** Removes the members (their Rewinds go with them) and restores the flags. */
export async function clearRewindSeed(): Promise<void> {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.user.deleteMany({ where: { id: { in: Object.values(REWIND_MEMBERS).map((member) => member.id) } } });
    if (savedFlags) await prisma.config.update({ where: { id: 'config' }, data: savedFlags });
    savedFlags = null;
  } finally {
    await prisma.$disconnect();
  }
}

/** The year of the stored v2 Rewind {@link seedArchiveRewind} writes (P7.13). */
export const ARCHIVE_YEAR = 2025;

/** A stored v2 Rewind as generation wrote it before 2026, "Wrapped" copy included. */
function archiveData(userId: string) {
  return {
    version: 2,
    year: ARCHIVE_YEAR,
    userId,
    userName: 'Archive member',
    generatedAt: '2025-12-05T12:00:00.000Z',
    archetype: { id: 'midnight-marathoner', name: 'The Midnight Marathoner', tagline: 'The night belongs to you', dedication: 'For the late shows.' },
    statistics: {
      totalWatchTime: { total: 60480, movies: 20160, shows: 40320 },
      moviesWatched: 85,
      showsWatched: 23,
      episodesWatched: 412,
      topMovies: [{ title: 'Dune: Part Two', watchTime: 166, playCount: 1, year: 2024, ratingKey: '101' }],
      topShows: [{ title: 'Severance', watchTime: 900, playCount: 18, episodesWatched: 18, year: 2022, ratingKey: '202' }],
      watchTimeByMonth: [
        { month: 1, monthName: 'January', watchTime: 5040 },
        { month: 2, monthName: 'February', watchTime: 4200 },
      ],
    },
    sections: [
      { id: 'hero', type: 'hero', title: 'Your 2025 Wrapped', content: 'Your <highlight>2025</highlight> Wrapped is here.' },
      { id: 'finale', type: 'finale', title: 'The end', content: 'See you next year.' },
    ],
    insights: { funFacts: ['Your busiest night was a Tuesday.'] },
    metadata: { totalSections: 2, generationTime: 5 },
  };
}

/** Writes `userId`'s completed v2 Rewind for {@link ARCHIVE_YEAR}, replacing any row there. */
export async function seedArchiveRewind(userId: string): Promise<void> {
  const prisma = createE2EPrismaClient();
  try {
    const row = { status: 'completed', data: JSON.stringify(archiveData(userId)), generatedAt: new Date('2025-12-05T12:00:00Z') };
    await prisma.plexWrapped.upsert({
      where: { userId_year: { userId, year: ARCHIVE_YEAR } },
      create: { userId, year: ARCHIVE_YEAR, ...row },
      update: row,
    });
  } finally {
    await prisma.$disconnect();
  }
}
