import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock dependencies BEFORE importing components

jest.mock('@/actions/invite', () => ({
  getInviteDetails: jest.fn(),
  deleteInvite: jest.fn(),
}))

// The SEC-18 test runs the real getInviteDetails behind the mock, so the
// modules it imports are faked: Prisma answers from fixture rows, and nothing
// reaches Plex, Jellyfin or Redis.
jest.mock('@/lib/admin', () => ({
  requireAdmin: jest.fn(),
}))

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

jest.mock('@/lib/connections/plex', () => ({}))
jest.mock('@/lib/connections/jellyfin', () => ({}))
jest.mock('@/lib/security/audit-log', () => ({ logAuditEvent: jest.fn(), AuditEventType: {} }))
jest.mock('@/lib/security/rate-limit', () => ({ consume: jest.fn(), actionClientIp: jest.fn() }))

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
}))
jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, ...props }: any) => <img src={src} alt={alt} {...props} />,
}))

// Mock toast
const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock('@/components/ui/toast', () => ({
  useToast: () => ({
    showSuccess: mockShowSuccess,
    showError: mockShowError,
  }),
}))

// Mock ConfirmModal
jest.mock('@/components/admin/shared/confirm-modal', () => ({
  ConfirmModal: ({ isOpen, onConfirm, onClose, title, message }: any) =>
    isOpen ? (
      <div data-testid="confirm-modal">
        <h2>{title}</h2>
        <p>{message}</p>
        <button onClick={onConfirm} data-testid="modal-confirm">
          Confirm
        </button>
        <button onClick={onClose} data-testid="modal-cancel">
          Cancel
        </button>
      </div>
    ) : null,
}))

// Import after mocks
import * as inviteActions from '@/actions/invite'
import { requireAdmin } from '@/lib/admin'
import { prisma } from '@/lib/prisma'
import { assertNoSecretKeys } from '@/__tests__/utils/assert-no-secret-keys'
import { applyPrismaShape } from '@/__tests__/utils/prisma-shape'
import { makePrismaInviteWithUsages, INVITEE_PLEX_AUTH_TOKEN } from '@/__tests__/utils/test-builders'
import { InviteDetailsClient } from '@/components/admin/invites/invite-details-client'
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'

describe('InviteDetailsClient', () => {
  const mockGetInviteDetailsFn = inviteActions.getInviteDetails as jest.MockedFunction<
    typeof inviteActions.getInviteDetails
  >
  const mockDeleteInviteFn = inviteActions.deleteInvite as jest.MockedFunction<
    typeof inviteActions.deleteInvite
  >

  const mockInviteData = {
    id: 'invite-1',
    code: 'TEST1234',
    maxUses: 5,
    useCount: 2,
    expiresAt: new Date('2025-12-31'),
    createdAt: new Date('2025-01-01'),
    allowDownloads: true,
    librarySectionIds: JSON.stringify([1, 2]),
    usages: [
      {
        id: 'usage-1',
        usedAt: new Date('2025-01-15'),
        user: {
          id: 'user-1',
          name: 'John Doe',
          email: 'john@example.com',
          image: 'https://example.com/avatar.jpg',
        },
      },
      {
        id: 'usage-2',
        usedAt: new Date('2025-01-20'),
        user: {
          id: 'user-2',
          name: 'Jane Smith',
          email: 'jane@example.com',
          image: null,
        },
      },
    ],
  }

  const mockClipboardWriteText = jest.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    jest.clearAllMocks()
    mockClipboardWriteText.mockClear()

    // Mock clipboard API
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: mockClipboardWriteText,
      },
      writable: true,
      configurable: true,
    })

    // Mock window.location
    delete (window as any).location
    window.location = { origin: 'http://localhost:3000' } as any
  })

  describe('Loading State', () => {
    it('should display loading spinner initially', () => {
      mockGetInviteDetailsFn.mockImplementation(() => new Promise(() => {}))

      render(<InviteDetailsClient id="invite-1" />)

      expect(screen.getByRole('img', { hidden: true })).toBeInTheDocument()
    })
  })

  describe('Successful Data Loading', () => {
    beforeEach(() => {
      mockGetInviteDetailsFn.mockResolvedValue({
        success: true,
        data: mockInviteData as any,
      })
    })

    it('should load and display invite details', async () => {
      render(<InviteDetailsClient id="invite-1" />)

      await waitFor(() => {
        expect(screen.getByText('TEST1234')).toBeInTheDocument()
      })

      expect(screen.getByText('Invite Details')).toBeInTheDocument()
      expect(screen.getByText('View usage history and configuration')).toBeInTheDocument()
    })

    it('should display invite code prominently', async () => {
      render(<InviteDetailsClient id="invite-1" />)

      await waitFor(() => {
        const codeElement = screen.getByText('TEST1234')
        expect(codeElement).toBeInTheDocument()
        expect(codeElement).toHaveClass('text-4xl', 'font-mono', 'font-bold')
      })
    })

    it('should display creation and expiration dates', async () => {
      render(<InviteDetailsClient id="invite-1" />)

      await waitFor(() => {
        // createdAt renders as a literal date; expiresAt (2025-12-31) is in the
        // past, so the component renders "Expired" instead of the date.
        expect(screen.getByText('Jan 1, 2025')).toBeInTheDocument()
        expect(screen.getByText('Expired')).toBeInTheDocument()
      })
    })

    it('should display library access information', async () => {
      render(<InviteDetailsClient id="invite-1" />)

      await waitFor(() => {
        expect(screen.getByText('2 libraries')).toBeInTheDocument()
      })
    })

    it('should display download permission status', async () => {
      render(<InviteDetailsClient id="invite-1" />)

      await waitFor(() => {
        expect(screen.getByText('Allowed')).toBeInTheDocument()
      })
    })

    it('should display usage statistics', async () => {
      render(<InviteDetailsClient id="invite-1" />)

      await waitFor(() => {
        expect(screen.getByText('2')).toBeInTheDocument()
        expect(screen.getByText('of 5')).toBeInTheDocument()
      })
    })

    it('should display Active badge when not fully used', async () => {
      render(<InviteDetailsClient id="invite-1" />)

      await waitFor(() => {
        expect(screen.getByText('Active')).toBeInTheDocument()
      })
    })

    it('should display usage history table', async () => {
      render(<InviteDetailsClient id="invite-1" />)

      await waitFor(() => {
        expect(screen.getByText('Usage History')).toBeInTheDocument()
        expect(screen.getByText('John Doe')).toBeInTheDocument()
        expect(screen.getByText('john@example.com')).toBeInTheDocument()
        expect(screen.getByText('Jane Smith')).toBeInTheDocument()
        expect(screen.getByText('jane@example.com')).toBeInTheDocument()
      })
    })


    it('should display initials for users without avatars', async () => {
      render(<InviteDetailsClient id="invite-1" />)

      await waitFor(() => {
        expect(screen.getByText('J')).toBeInTheDocument()
      })
    })
  })

  describe('Invite Status Variations', () => {
    it('should show "Never" for invites without expiration', async () => {
      mockGetInviteDetailsFn.mockResolvedValue({
        success: true,
        data: { ...mockInviteData, expiresAt: null } as any,
      })

      render(<InviteDetailsClient id="invite-1" />)

      await waitFor(() => {
        expect(screen.getByText('Never')).toBeInTheDocument()
      })
    })

    it('should show "Expired" for expired invites', async () => {
      mockGetInviteDetailsFn.mockResolvedValue({
        success: true,
        data: { ...mockInviteData, expiresAt: new Date('2020-01-01') } as any,
      })

      render(<InviteDetailsClient id="invite-1" />)

      await waitFor(() => {
        expect(screen.getByText('Expired')).toBeInTheDocument()
      })
    })

    it('should show "Fully Used" badge when max uses reached', async () => {
      mockGetInviteDetailsFn.mockResolvedValue({
        success: true,
        data: { ...mockInviteData, useCount: 5, maxUses: 5 } as any,
      })

      render(<InviteDetailsClient id="invite-1" />)

      await waitFor(() => {
        expect(screen.getByText('Fully Used')).toBeInTheDocument()
      })
    })

    it('should display "All libraries" when no specific libraries set', async () => {
      mockGetInviteDetailsFn.mockResolvedValue({
        success: true,
        data: { ...mockInviteData, librarySectionIds: null } as any,
      })

      render(<InviteDetailsClient id="invite-1" />)

      await waitFor(() => {
        expect(screen.getByText('All libraries')).toBeInTheDocument()
      })
    })

    it('should display "Not allowed" for downloads when disabled', async () => {
      mockGetInviteDetailsFn.mockResolvedValue({
        success: true,
        data: { ...mockInviteData, allowDownloads: false } as any,
      })

      render(<InviteDetailsClient id="invite-1" />)

      await waitFor(() => {
        expect(screen.getByText('Not allowed')).toBeInTheDocument()
      })
    })

    it('should display singular "library" for single library', async () => {
      mockGetInviteDetailsFn.mockResolvedValue({
        success: true,
        data: { ...mockInviteData, librarySectionIds: JSON.stringify([1]) } as any,
      })

      render(<InviteDetailsClient id="invite-1" />)

      await waitFor(() => {
        expect(screen.getByText('1 library')).toBeInTheDocument()
      })
    })
  })

  describe('Empty Usage History', () => {
    it('should display message when no one has used the invite', async () => {
      mockGetInviteDetailsFn.mockResolvedValue({
        success: true,
        data: { ...mockInviteData, usages: [] } as any,
      })

      render(<InviteDetailsClient id="invite-1" />)

      await waitFor(() => {
        expect(screen.getByText('No one has used this invite yet.')).toBeInTheDocument()
      })
    })
  })


  describe('Delete Invite', () => {
    beforeEach(() => {
      mockGetInviteDetailsFn.mockResolvedValue({
        success: true,
        data: mockInviteData as any,
      })
    })

    it('should show delete confirmation modal when delete button clicked', async () => {
      const user = userEvent.setup()
      render(<InviteDetailsClient id="invite-1" />)

      await waitFor(() => {
        expect(screen.getByText('TEST1234')).toBeInTheDocument()
      })

      const deleteButton = screen.getByRole('button', { name: 'Delete Invite' })
      await user.click(deleteButton)

      expect(screen.getByTestId('confirm-modal')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Delete Invite' })).toBeInTheDocument()
      expect(
        screen.getByText('Are you sure you want to delete this invite? This action cannot be undone.')
      ).toBeInTheDocument()
    })

    it('should close modal when cancel is clicked', async () => {
      const user = userEvent.setup()
      render(<InviteDetailsClient id="invite-1" />)

      await waitFor(() => {
        expect(screen.getByText('TEST1234')).toBeInTheDocument()
      })

      const deleteButton = screen.getByText('Delete Invite')
      await user.click(deleteButton)

      const cancelButton = screen.getByTestId('modal-cancel')
      await user.click(cancelButton)

      await waitFor(() => {
        expect(screen.queryByTestId('confirm-modal')).not.toBeInTheDocument()
      })
    })

    it('should delete invite and redirect on successful deletion', async () => {
      const user = userEvent.setup()
      mockDeleteInviteFn.mockResolvedValue({ success: true })

      render(<InviteDetailsClient id="invite-1" />)

      await waitFor(() => {
        expect(screen.getByText('TEST1234')).toBeInTheDocument()
      })

      const deleteButton = screen.getByText('Delete Invite')
      await user.click(deleteButton)

      const confirmButton = screen.getByTestId('modal-confirm')
      await user.click(confirmButton)

      await waitFor(() => {
        expect(mockDeleteInviteFn).toHaveBeenCalledWith('invite-1')
        expect(mockShowSuccess).toHaveBeenCalledWith('Invite deleted successfully')
        // Router push is called but we can't easily verify the argument since it's mocked as a function
      })
    })

    it('should show error message on failed deletion', async () => {
      const user = userEvent.setup()
      mockDeleteInviteFn.mockResolvedValue({ success: false })

      render(<InviteDetailsClient id="invite-1" />)

      await waitFor(() => {
        expect(screen.getByText('TEST1234')).toBeInTheDocument()
      })

      const deleteButton = screen.getByText('Delete Invite')
      await user.click(deleteButton)

      const confirmButton = screen.getByTestId('modal-confirm')
      await user.click(confirmButton)

      await waitFor(() => {
        expect(mockShowError).toHaveBeenCalledWith('Failed to delete invite')
      })
    })

    it('should handle deletion errors gracefully', async () => {
      const user = userEvent.setup()
      const consoleError = jest.spyOn(console, 'error').mockImplementation()
      mockDeleteInviteFn.mockRejectedValue(new Error('Network error'))

      render(<InviteDetailsClient id="invite-1" />)

      await waitFor(() => {
        expect(screen.getByText('TEST1234')).toBeInTheDocument()
      })

      const deleteButton = screen.getByText('Delete Invite')
      await user.click(deleteButton)

      const confirmButton = screen.getByTestId('modal-confirm')
      await user.click(confirmButton)

      await waitFor(() => {
        expect(mockShowError).toHaveBeenCalledWith('Failed to delete invite')
        expect(consoleError).toHaveBeenCalled()
      })

      consoleError.mockRestore()
    })
  })

  describe('Navigation', () => {
    beforeEach(() => {
      mockGetInviteDetailsFn.mockResolvedValue({
        success: true,
        data: mockInviteData as any,
      })
    })

    it('should have back button linking to invites list', async () => {
      render(<InviteDetailsClient id="invite-1" />)

      await waitFor(() => {
        expect(screen.getByText('TEST1234')).toBeInTheDocument()
      })

      const backLink = screen.getByRole('link', { name: /Back to invites/i })
      expect(backLink).toHaveAttribute('href', '/admin/invites')
    })
  })

  describe('Error Handling', () => {
    it('should redirect to invites list when invite not found', async () => {
      mockGetInviteDetailsFn.mockResolvedValue({
        success: false,
        error: 'Invite not found',
      })

      render(<InviteDetailsClient id="invalid-id" />)

      await waitFor(() => {
        // Component should attempt to redirect (router.push is called)
        // We can't easily verify the call since it's mocked as a function
        expect(mockGetInviteDetailsFn).toHaveBeenCalledWith('invalid-id')
      })
    })

    it('should handle loading errors gracefully', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation()
      mockGetInviteDetailsFn.mockRejectedValue(new Error('Network error'))

      render(<InviteDetailsClient id="invite-1" />)

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalled()
      })

      consoleError.mockRestore()
    })

    it('should return null when invite data is not available', async () => {
      mockGetInviteDetailsFn.mockResolvedValue({
        success: true,
        data: null as any,
      })

      const { container } = render(<InviteDetailsClient id="invite-1" />)

      await waitFor(() => {
        expect(container.firstChild).toBeNull()
      })
    })
  })

  describe('Accessibility', () => {
    beforeEach(() => {
      mockGetInviteDetailsFn.mockResolvedValue({
        success: true,
        data: mockInviteData as any,
      })
    })

    it('should have proper heading hierarchy', async () => {
      render(<InviteDetailsClient id="invite-1" />)

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Invite Details' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Usage History' })).toBeInTheDocument()
      })
    })

    it('should have accessible table structure', async () => {
      render(<InviteDetailsClient id="invite-1" />)

      await waitFor(() => {
        const table = screen.getByRole('table')
        expect(table).toBeInTheDocument()
      })
    })

    it('should have accessible buttons with proper labels', async () => {
      render(<InviteDetailsClient id="invite-1" />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Copy invite link/i })).toBeInTheDocument()
        expect(screen.getByText('Delete Invite')).toBeInTheDocument()
      })
    })
  })

  describe('No invitee secrets reach the page (SEC-18)', () => {
    afterEach(() => {
      mockGetInviteDetailsFn.mockReset()
    })

    it('stores and renders the invite from the real getInviteDetails without any token field', async () => {
      const actual = jest.requireActual<typeof import('@/actions/invite')>('@/actions/invite')
      jest.mocked(requireAdmin).mockResolvedValue({ user: { id: 'admin-1', isAdmin: true }, expires: '' } as never)
      // Prisma answers with a row whose user holds plexAuthToken, shaped by the query's own select.
      jest.mocked(prisma.invite.findUnique).mockImplementation(((args: Parameters<typeof applyPrismaShape>[1]) =>
        Promise.resolve(applyPrismaShape(makePrismaInviteWithUsages(), args))) as never)
      mockGetInviteDetailsFn.mockImplementation(actual.getInviteDetails)

      const props = { id: 'invite-1' }
      const { container } = render(<InviteDetailsClient {...props} />)

      // The usage row still shows what the page needs: name, email and avatar.
      expect(await screen.findByText('Invited Member')).toBeInTheDocument()
      expect(screen.getByText('member@example.com')).toBeInTheDocument()
      expect(screen.getByAltText('Invited Member')).toHaveAttribute('src', 'https://plex.tv/users/member/avatar')

      // What the page put in its `invite` state: the action's resolved result.
      const stored = await mockGetInviteDetailsFn.mock.results[0].value
      expect(stored.success).toBe(true)
      assertNoSecretKeys({ props, stored })
      expect(JSON.stringify(stored)).not.toContain(INVITEE_PLEX_AUTH_TOKEN)
      expect(container.innerHTML).not.toContain(INVITEE_PLEX_AUTH_TOKEN)
    })
  })
})

