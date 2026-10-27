/**
 * The member layout (P6.3): the guards run first, so a gated member goes to
 * `/subscribe`; signed out the page renders bare; signed in it sits in the
 * AppShell with the notice.
 */

import { render, screen } from '@testing-library/react'
import { getServerSession } from 'next-auth'

import AppGuardLayout from '@/app/(app)/layout'
import { ensureSubscriptionOrAccess } from '@/lib/guards'
import { getMemberNotice } from '@/lib/member/notice'
import { getAppShellData } from '@/lib/member/shell'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/guards', () => ({
  ensureSetupComplete: jest.fn(),
  ensureOnboardingComplete: jest.fn(),
  ensureSubscriptionOrAccess: jest.fn(),
}))
jest.mock('@/lib/member/notice', () => ({ getMemberNotice: jest.fn() }))
jest.mock('@/lib/member/shell', () => ({ getAppShellData: jest.fn() }))
jest.mock('@/components/shell/app-shell', () => ({
  AppShell: ({ children, notice }: { children: React.ReactNode; notice?: { kind: string } | null }) => (
    <div data-testid="app-shell">
      {notice && <div data-testid="app-notice">{notice.kind}</div>}
      {children}
    </div>
  ),
}))

const mockSession = getServerSession as jest.Mock
const mockGate = ensureSubscriptionOrAccess as jest.Mock
const mockNotice = getMemberNotice as jest.Mock
const mockShell = getAppShellData as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  mockShell.mockResolvedValue({ serverName: 'Northfield Plex', user: {}, nav: [] })
  mockNotice.mockResolvedValue(null)
})

async function renderLayout() {
  render(await AppGuardLayout({ children: <p data-testid="page">Page</p> }))
}

describe('AppGuardLayout', () => {
  it('renders bare children when signed out', async () => {
    mockSession.mockResolvedValue(null)
    await renderLayout()

    expect(screen.getByTestId('page')).toBeInTheDocument()
    expect(screen.queryByTestId('app-shell')).not.toBeInTheDocument()
    expect(mockShell).not.toHaveBeenCalled()
  })

  it('sends a gated member to /subscribe before rendering anything', async () => {
    mockSession.mockResolvedValue({ user: { id: 'u1', isAdmin: false } })
    mockGate.mockRejectedValue(new Error('NEXT_REDIRECT:/subscribe'))

    await expect(AppGuardLayout({ children: <p /> })).rejects.toThrow('NEXT_REDIRECT:/subscribe')
    expect(mockShell).not.toHaveBeenCalled()
  })

  it('renders the AppShell with the notice for a signed-in member', async () => {
    mockGate.mockResolvedValue(undefined)
    mockSession.mockResolvedValue({ user: { id: 'u1', isAdmin: false, role: 'support' } })
    mockNotice.mockResolvedValue({ kind: 'past-due' })
    await renderLayout()

    expect(mockShell).toHaveBeenCalledWith({ id: 'u1', isAdmin: false, role: 'support' })
    expect(screen.getByTestId('app-shell')).toContainElement(screen.getByTestId('page'))
    expect(screen.getByTestId('app-notice')).toHaveTextContent('past-due')
  })
})
