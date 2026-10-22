/**
 * `/rewind` and `/rewind/[year]` (P5.1, FR-1): the index opens a year from
 * data, an invalid year is a 404, only the member's own row is read, and each
 * state of that row renders its branch: the v3 issue, the v1/v2 archive
 * article (P7.13), or a status panel with copy from a code.
 *
 * It keeps the guarantees of the `/wrapped` pages it replaces: fixed copy for
 * a failed generation, never the stored error text (P0.9), and "Stop sharing"
 * for live links on other years (P0.19: SEC-16).
 *
 * The real `getUserPlexWrapped` and `deriveRewindStatus` run against a small
 * in-memory table, so the ownership check and the status rule are exercised.
 */

import { render, screen } from '@testing-library/react'
import { getServerSession } from 'next-auth'

import RewindResolverPage from '@/app/(app)/rewind/page'
import RewindYearPage, { generateMetadata } from '@/app/(app)/rewind/[year]/(story)/page'
import RewindArticlePage from '@/app/(app)/rewind/[year]/read/page'
import { ToastProvider } from '@/components/ui/toast'
import { prisma } from '@/lib/prisma'
import { checkRewindInfra } from '@/lib/queue/rewind-infra'
import { generationBlocker } from '@/lib/rewind/generation-guards'
import { buildStoredV1Json, buildStoredV2Json } from '@/lib/wrapped/__tests__/fixtures'
import { minimalV3 } from '@/lib/wrapped/data/__tests__/v3-row'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/admin', () => ({ assertAdmin: jest.fn() }))
jest.mock('@/lib/connections/plex', () => ({}))
jest.mock('@/lib/connections/tautulli', () => ({ findTautulliUser: jest.fn() }))

// Next's redirect() and notFound() throw to stop rendering; the mocks do the same.
jest.mock('next/navigation', () => ({
  redirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`)
  }),
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

jest.mock('@/actions/user-queries', () => ({ getUserPlexWrapped: jest.requireActual('@/actions/user-queries').getUserPlexWrapped }))
jest.mock('@/components/rewind/rewind-generating-watch', () => ({
  RewindGeneratingWatch: () => <p data-testid="generating-watch" />,
}))
// The story itself is tested in components/rewind; here only the branch matters.
jest.mock('@/components/rewind/rewind-issue', () => ({
  RewindIssue: ({ data }: { data: { pages: Array<{ type: string }> } }) => (
    <ol data-testid="rewind-issue">
      {data.pages.map((page) => (
        <li key={page.type}>{page.type}</li>
      ))}
    </ol>
  ),
}))
jest.mock('@/actions/wrapped-share-link', () => ({ disableWrappedShareLink: jest.fn() }))
jest.mock('@/lib/queue/rewind-infra', () => ({ checkRewindInfra: jest.fn() }))
jest.mock('@/lib/rewind/generation-guards', () => ({ generationBlocker: jest.fn() }))
jest.mock('@/lib/brand', () => ({
  serverName: async () => 'Chester Family Plex',
  rewindName: async (year: number) => `Chester Family Plex Rewind ${year}`,
}))
jest.mock('@/lib/settings/app-settings', () => ({
  getAppSettings: async () => ({ locale: 'en-US', timeZone: 'UTC', serverName: 'Chester Family Plex' }),
}))

interface MockRow {
  id: string
  userId: string
  year: number
  status: string
  data: string | null
  error: string | null
  shareToken: string | null
}

interface MockGeneration {
  userId: string
  year: number
  status: string
  error: unknown
}

const mockRows: MockRow[] = []
const mockGenerations: MockGeneration[] = []

type MockWhere = { userId: string; status?: string; shareToken?: { not: null } }

jest.mock('@/lib/prisma', () => ({
  prisma: {
    config: { findUnique: jest.fn() },
    user: { findUnique: jest.fn(async () => ({ id: 'user-1', plexUserId: 'plex-1' })) },
    rewindGeneration: {
      findFirst: jest.fn(async ({ where }: { where: { userId: string; year: number } }) => {
        const found = mockGenerations.filter((g) => g.userId === where.userId && g.year === where.year).at(-1)
        return found ? { status: found.status, error: found.error, startedAt: null } : null
      }),
    },
    plexWrapped: {
      findUnique: jest.fn(async ({ where }: { where: { userId_year: { userId: string; year: number } } }) => {
        const { userId, year } = where.userId_year
        const row = mockRows.find((r) => r.userId === userId && r.year === year)
        return row ? { ...row, user: { id: userId, name: 'Member', email: null, image: null } } : null
      }),
      findFirst: jest.fn(async ({ where }: { where: MockWhere }) => {
        const [latest] = mockRows
          .filter((r) => r.userId === where.userId && r.status === where.status)
          .sort((a, b) => b.year - a.year)
        return latest ? { year: latest.year } : null
      }),
      findMany: jest.fn(async ({ where }: { where: MockWhere }) =>
        mockRows
          .filter((r) => r.userId === where.userId)
          .filter((r) => where.status === undefined || r.status === where.status)
          .filter((r) => where.shareToken === undefined || r.shareToken !== null)
          .sort((a, b) => b.year - a.year)
          .map((r) => ({ year: r.year }))
      ),
    },
  },
}))

const mockFindUnique = prisma.plexWrapped.findUnique as jest.Mock
const mockConfig = prisma.config.findUnique as jest.Mock
const mockInfra = checkRewindInfra as jest.Mock
const mockBlocker = generationBlocker as jest.Mock

const V3 = { ...minimalV3(), pages: [{ type: 'cover', data: {} }, { type: 'number', data: {} }] }

function row(year: number, overrides: Partial<MockRow> = {}): MockRow {
  return {
    id: `wrapped-${year}`,
    userId: 'user-1',
    year,
    status: 'completed',
    data: JSON.stringify({ year }),
    error: null,
    shareToken: null,
    ...overrides,
  }
}

function seed(...rows: MockRow[]) {
  mockRows.splice(0, mockRows.length, ...rows)
}

function config(flags: { rewindEnabled?: boolean; rewindAudience?: string } = {}) {
  mockConfig.mockResolvedValue({
    rewindSeasonOpens: '12-01',
    rewindSeasonCloses: '01-31',
    timezone: null,
    rewindEnabled: false,
    rewindAudience: 'admins',
    ...flags,
  })
}

function signIn(isAdmin = false) {
  ;(getServerSession as jest.Mock).mockResolvedValue({ user: { id: 'user-1', isAdmin } })
}

async function renderYear(year: string, search: Record<string, string> = {}) {
  const ui = await RewindYearPage({ params: Promise.resolve({ year }), searchParams: Promise.resolve(search) })
  return render(<ToastProvider>{ui}</ToastProvider>)
}

function panel() {
  return screen.getByTestId('rewind-status-panel')
}

beforeEach(() => {
  jest.clearAllMocks()
  signIn()
  // The default 12-01 to 01-31 window on 2 January 2027: the season is 2026.
  jest
    .useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval'] })
    .setSystemTime(new Date('2027-01-02T12:00:00Z'))
  config()
  mockInfra.mockResolvedValue({ ok: true })
  mockBlocker.mockResolvedValue(null)
  seed()
  mockGenerations.splice(0)
})

afterEach(() => {
  jest.useRealTimers()
})

describe('/rewind resolver', () => {
  const resolve = (search: Record<string, string> = {}) => RewindResolverPage({ searchParams: Promise.resolve(search) })

  it('opens the latest completed year when the season year has no row', async () => {
    seed(row(2024), row(2025))

    await expect(resolve()).rejects.toThrow('NEXT_REDIRECT /rewind/2025')
  })

  it('opens the season year when it is completed, not the calendar year', async () => {
    seed(row(2025), row(2026))

    await expect(resolve()).rejects.toThrow('NEXT_REDIRECT /rewind/2026')
  })

  it('falls back to the season year with nothing completed', async () => {
    await expect(resolve()).rejects.toThrow('NEXT_REDIRECT /rewind/2026')
  })

  it('keeps from and sheet, and drops other keys', async () => {
    seed(row(2026))

    await expect(resolve({ from: '/account', sheet: 'share', other: 'x' })).rejects.toThrow(
      'NEXT_REDIRECT /rewind/2026?from=%2Faccount&sheet=share'
    )
  })

  it('sends a signed-out visitor home', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(null)

    await expect(resolve()).rejects.toThrow(/^NEXT_REDIRECT \/$/)
  })
})

describe('/rewind/[year] route year and ownership', () => {
  it.each(['abc', '0x7EA', '2026.0', '1999', '2101', '20260'])('calls notFound for %s', async (param) => {
    await expect(RewindYearPage({ params: Promise.resolve({ year: param }), searchParams: Promise.resolve({}) })).rejects.toThrow(
      'NEXT_NOT_FOUND'
    )
    expect(mockFindUnique).not.toHaveBeenCalled()
  })

  it("never reads another member's row", async () => {
    seed(row(2026), row(2025, { id: 'other-2025', userId: 'user-2' }))

    await renderYear('2025')

    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_year: { userId: 'user-1', year: 2025 } } })
    )
    expect(screen.queryByTestId('rewind-article-mode')).not.toBeInTheDocument()
    expect(panel()).toHaveAttribute('data-kind', 'not-found')
    expect(screen.getByTestId('rewind-year-link-2026')).toHaveAttribute('href', '/rewind/2026')
  })

  it('titles the page with the server name, absolutely, and keeps it out of search', async () => {
    await expect(generateMetadata({ params: Promise.resolve({ year: '2026' }), searchParams: Promise.resolve({}) })).resolves.toEqual({
      title: { absolute: 'Chester Family Plex Rewind 2026' },
      robots: { index: false },
    })
  })
})

describe('/rewind/[year] branches', () => {
  it('renders the v3 issue for a member once Rewind is open to everyone', async () => {
    config({ rewindEnabled: true, rewindAudience: 'all' })
    seed(row(2026, { data: JSON.stringify(V3) }))

    await renderYear('2026')

    expect(screen.getByTestId('rewind-issue')).toHaveTextContent('cover')
    expect(screen.getByTestId('rewind-issue')).toHaveTextContent('number')
  })

  it('keeps a v3 issue closed to members while the flags are off, but not to admins', async () => {
    seed(row(2026, { data: JSON.stringify(V3) }))

    await renderYear('2026')
    expect(panel()).toHaveAttribute('data-kind', 'unavailable')
    expect(screen.getByTestId('rewind-status-title')).toHaveTextContent("Your Rewind isn't open yet")

    signIn(true)
    await renderYear('2026')
    expect(screen.getByTestId('rewind-issue')).toBeInTheDocument()
  })

  it.each([
    ['v1', buildStoredV1Json],
    ['v2', buildStoredV2Json],
  ])('always opens a stored %s year for its owner as an archive article, flags off', async (_version, build) => {
    seed(row(2025, { data: build() }), row(2024))

    await renderYear('2025')

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chester Family Plex Rewind 2025')
    expect(screen.getByTestId('rewind-article-mode')).toHaveTextContent('From the archive')
    expect(screen.getAllByTestId('rewind-article-section')[0]).toHaveTextContent('The year in numbers')
    expect(screen.queryByTestId('rewind-issue')).not.toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(/Wrapped/)
    expect(screen.getByTestId('rewind-year-link-2024')).toHaveAttribute('href', '/rewind/2024')
    expect(screen.queryByTestId('rewind-year-link-2025')).not.toBeInTheDocument()
    expect(screen.getByTestId('rewind-article-close')).toHaveAttribute('href', '/')
  })

  it('renders the same archive article at /read for a legacy year', async () => {
    seed(row(2025, { data: buildStoredV2Json() }))

    const ui = await RewindArticlePage({ params: Promise.resolve({ year: '2025' }), searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chester Family Plex Rewind 2025')
    expect(screen.getByTestId('rewind-article-mode')).toHaveTextContent('Your most watched films')
  })

  it('shows parse-error for a completed row that does not parse', async () => {
    seed(row(2025, { data: '{not json' }))

    await renderYear('2025')

    expect(panel()).toHaveAttribute('data-kind', 'parse-error')
    expect(screen.queryByTestId('rewind-article-mode')).not.toBeInTheDocument()
  })

  it('shows generating, and polls, while a run is queued', async () => {
    seed(row(2026, { status: 'generating', data: null }))
    mockGenerations.push({ userId: 'user-1', year: 2026, status: 'queued', error: null })

    await renderYear('2026')

    expect(panel()).toHaveAttribute('data-kind', 'generating')
    expect(screen.getByTestId('rewind-status-title')).toHaveTextContent('Setting your pages')
    expect(screen.getByTestId('generating-watch')).toBeInTheDocument()
  })

  it('shows failed with the copy for its code, never the stored text', async () => {
    const roster = 'User not found in Tautulli. Available users: mona_plex (mona.private@example.com)'
    seed(row(2026, { status: 'failed', data: null, error: roster }))
    mockGenerations.push({ userId: 'user-1', year: 2026, status: 'failed', error: { code: 'TAUTULLI_USER_NOT_FOUND' } })

    await renderYear('2026')

    expect(panel()).toHaveAttribute('data-kind', 'failed')
    expect(screen.getByTestId('rewind-status-message')).toHaveTextContent(
      "We couldn't find your account in Tautulli yet. Ask the server admin to refresh Tautulli's user list."
    )
    expect(document.body).not.toHaveTextContent('mona')
  })

  it('shows not-eligible for a member Rewind cannot be made for (FR-48)', async () => {
    mockBlocker.mockResolvedValue('REWIND_NOT_ELIGIBLE')

    await renderYear('2026')

    expect(panel()).toHaveAttribute('data-kind', 'not-eligible')
  })

  it('shows unavailable when Redis is missing (FR-50), with the admin copy for admins', async () => {
    mockInfra.mockResolvedValue({ ok: false, code: 'REDIS_NOT_CONFIGURED' })

    await renderYear('2026')
    expect(panel()).toHaveAttribute('data-kind', 'unavailable')
    expect(screen.getByTestId('rewind-status-message')).toHaveTextContent("Rewind isn't available on this server yet")

    signIn(true)
    await renderYear('2026')
    expect(screen.getAllByTestId('rewind-status-message')[1]).toHaveTextContent('Rewind needs Redis (REDIS_URL)')
  })

  it('says the season year is not made yet when the member can have one', async () => {
    await renderYear('2026')

    expect(panel()).toHaveAttribute('data-kind', 'not-found')
    expect(screen.getByTestId('rewind-status-title')).toHaveTextContent("Your Rewind isn't made yet")
  })

  it('checks neither Redis nor eligibility for a past year with nothing', async () => {
    await renderYear('2019')

    expect(panel()).toHaveAttribute('data-kind', 'not-found')
    expect(mockInfra).not.toHaveBeenCalled()
    expect(mockBlocker).not.toHaveBeenCalled()
  })
})

describe('/rewind/[year] Close and share links', () => {
  it.each([
    [{ from: '/discord/link' }, '/discord/link'],
    [{ from: '//evil.example' }, '/'],
    [{}, '/'],
  ])('points Close at a safe ?from= (%j)', async (search, href) => {
    await renderYear('2019', search)

    expect(screen.getByTestId('rewind-close')).toHaveAttribute('href', href)
    expect(screen.getByTestId('rewind-close')).toHaveAccessibleName('Close')
  })

  it('offers "Stop sharing" for other years on a status panel', async () => {
    seed(row(2025, { shareToken: 'old-token' }))

    await renderYear('2026')

    expect(panel()).toContainElement(screen.getByTestId('rewind-share-stop-2025'))
  })

  it('offers "Stop sharing" for the archive year on screen too, which has no share controls', async () => {
    seed(row(2025, { data: buildStoredV2Json(), shareToken: 'current' }), row(2024, { shareToken: 'old' }))

    await renderYear('2025')

    expect(screen.getByTestId('rewind-article-mode')).toContainElement(screen.getByTestId('rewind-share-stop-2025'))
    expect(screen.getByTestId('rewind-share-stop-2024')).toBeInTheDocument()
  })
})
