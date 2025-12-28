import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock dependencies BEFORE importing components
jest.mock('@/actions/invite', () => ({
  getInvites: jest.fn(),
  createInvite: jest.fn(),
  deleteInvite: jest.fn(),
}))

jest.mock('@/actions/server-info', () => ({
  getAvailableLibraries: jest.fn(),
}))

jest.mock('@/actions/admin/admin-servers', () => ({
  getJellyfinLibraries: jest.fn(),
}))

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
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
import * as serverInfo from '@/actions/server-info'
import * as adminServers from '@/actions/admin/admin-servers'
import { InvitesPageClient } from '@/components/admin/invites/invites-page-client'

describe('InvitesPageClient', () => {
  const mockGetInvites = inviteActions.getInvites as jest.MockedFunction<typeof inviteActions.getInvites>
  const mockCreateInvite = inviteActions.createInvite as jest.MockedFunction<typeof inviteActions.createInvite>
  const mockDeleteInvite = inviteActions.deleteInvite as jest.MockedFunction<typeof inviteActions.deleteInvite>
  const mockGetAvailableLibraries = serverInfo.getAvailableLibraries as jest.MockedFunction<typeof serverInfo.getAvailableLibraries>
  const mockGetJellyfinLibraries = adminServers.getJellyfinLibraries as jest.MockedFunction<typeof adminServers.getJellyfinLibraries>
  const mockInvites = [
    {
      id: 'invite-1',
      code: 'TEST1234',
      maxUses: 5,
      useCount: 2,
      expiresAt: new Date('2025-12-31'),
      createdAt: new Date('2025-01-01'),
      usages: [],
    },
    {
      id: 'invite-2',
      code: 'DEMO5678',
      maxUses: 1,
      useCount: 1,
      expiresAt: null,
      createdAt: new Date('2025-01-15'),
      usages: [],
    },
  ]

  const mockLibraries = [
    { id: 1, title: 'Movies', type: 'movie' },
    { id: 2, title: 'TV Shows', type: 'show' },
    { id: 3, title: 'Music', type: 'artist' },
  ]

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

    // Mock Jellyfin libraries to return empty by default
    mockGetJellyfinLibraries.mockResolvedValue({ success: true, data: [] })

    // Mock window.location
    delete (window as any).location
    window.location = { origin: 'http://localhost:3000' } as any
  })

  describe('Loading State', () => {
    it('should display loading spinner initially', () => {
      mockGetInvites.mockImplementation(() => new Promise(() => {}))

      render(<InvitesPageClient />)

      expect(screen.getByRole('img', { hidden: true })).toBeInTheDocument()
    })
  })

  describe('Empty State', () => {
    it('should display empty state when no invites exist', async () => {
      mockGetInvites.mockResolvedValue({
        success: true,
        data: [],
      })

      render(<InvitesPageClient />)

      await waitFor(() => {
        expect(screen.getByText('No invites yet')).toBeInTheDocument()
        expect(screen.getByText('Generate an invite code to get started.')).toBeInTheDocument()
      })
    })
  })

  describe('Invites List Display', () => {
    beforeEach(() => {
      mockGetInvites.mockResolvedValue({
        success: true,
        data: mockInvites as any,
      })
    })

    it('should display list of invites', async () => {
      render(<InvitesPageClient />)

      await waitFor(() => {
        expect(screen.getByText('TEST1234')).toBeInTheDocument()
        expect(screen.getByText('DEMO5678')).toBeInTheDocument()
      })
    })

    it('should display invite codes as links', async () => {
      render(<InvitesPageClient />)

      await waitFor(() => {
        const link = screen.getByRole('link', { name: 'TEST1234' })
        expect(link).toHaveAttribute('href', '/admin/invites/invite-1')
      })
    })

    it('should display usage progress bars', async () => {
      render(<InvitesPageClient />)

      await waitFor(() => {
        expect(screen.getByText('2 / 5')).toBeInTheDocument()
        expect(screen.getByText('1 / 1')).toBeInTheDocument()
      })
    })

    it('should display expiration dates', async () => {
      render(<InvitesPageClient />)

      await waitFor(() => {
        const expirationDates = screen.getAllByText(new Date('2025-12-31').toLocaleDateString())
        expect(expirationDates.length).toBeGreaterThan(0)
        const neverTexts = screen.getAllByText('Never')
        expect(neverTexts.length).toBeGreaterThan(0)
      })
    })

    it('should display creation dates', async () => {
      render(<InvitesPageClient />)

      await waitFor(() => {
        const firstDate = screen.getAllByText(new Date('2025-01-01').toLocaleDateString())
        expect(firstDate.length).toBeGreaterThan(0)
        const secondDate = screen.getAllByText(new Date('2025-01-15').toLocaleDateString())
        expect(secondDate.length).toBeGreaterThan(0)
      })
    })

    it('should show red progress bar for fully used invites', async () => {
      render(<InvitesPageClient />)

      await waitFor(() => {
        const progressBars = document.querySelectorAll('.bg-red-500')
        expect(progressBars.length).toBeGreaterThan(0)
      })
    })

    it('should show expired status for expired invites', async () => {
      mockGetInvites.mockResolvedValue({
        success: true,
        data: [
          {
            ...mockInvites[0],
            expiresAt: new Date('2020-01-01'),
          },
        ] as any,
      })

      render(<InvitesPageClient />)

      await waitFor(() => {
        const expiredTexts = screen.getAllByText('Expired')
        expect(expiredTexts.length).toBeGreaterThan(0)
      })
    })
  })


  describe('Delete Invite', () => {
    beforeEach(() => {
      mockGetInvites.mockResolvedValue({
        success: true,
        data: mockInvites as any,
      })
    })

    it('should show delete confirmation modal when delete button clicked', async () => {
      const user = userEvent.setup()
      render(<InvitesPageClient />)

      await waitFor(() => {
        expect(screen.getByText('TEST1234')).toBeInTheDocument()
      })

      const deleteButtons = screen.getAllByRole('button', { name: /Delete invite/i })
      await user.click(deleteButtons[0])

      expect(screen.getByTestId('confirm-modal')).toBeInTheDocument()
      expect(screen.getByText('Delete Invite')).toBeInTheDocument()
    })

    it('should close modal when cancel is clicked', async () => {
      const user = userEvent.setup()
      render(<InvitesPageClient />)

      await waitFor(() => {
        expect(screen.getByText('TEST1234')).toBeInTheDocument()
      })

      const deleteButtons = screen.getAllByRole('button', { name: /Delete invite/i })
      await user.click(deleteButtons[0])

      const cancelButton = screen.getByTestId('modal-cancel')
      await user.click(cancelButton)

      await waitFor(() => {
        expect(screen.queryByTestId('confirm-modal')).not.toBeInTheDocument()
      })
    })

    it('should delete invite and reload list on successful deletion', async () => {
      const user = userEvent.setup()
      mockDeleteInvite.mockResolvedValue({ success: true })

      render(<InvitesPageClient />)

      await waitFor(() => {
        expect(screen.getByText('TEST1234')).toBeInTheDocument()
      })

      const deleteButtons = screen.getAllByRole('button', { name: /Delete invite/i })
      await user.click(deleteButtons[0])

      const confirmButton = screen.getByTestId('modal-confirm')
      await user.click(confirmButton)

      await waitFor(() => {
        expect(mockDeleteInvite).toHaveBeenCalledWith('invite-1')
        expect(mockShowSuccess).toHaveBeenCalledWith('Invite deleted successfully')
        expect(mockGetInvites).toHaveBeenCalledTimes(2) // Initial load + reload
      })
    })

    it('should show error message on failed deletion', async () => {
      const user = userEvent.setup()
      mockDeleteInvite.mockResolvedValue({ success: false })

      render(<InvitesPageClient />)

      await waitFor(() => {
        expect(screen.getByText('TEST1234')).toBeInTheDocument()
      })

      const deleteButtons = screen.getAllByRole('button', { name: /Delete invite/i })
      await user.click(deleteButtons[0])

      const confirmButton = screen.getByTestId('modal-confirm')
      await user.click(confirmButton)

      await waitFor(() => {
        expect(mockShowError).toHaveBeenCalledWith('Failed to delete invite')
      })
    })
  })

  describe('Create Invite Modal', () => {
    beforeEach(() => {
      mockGetInvites.mockResolvedValue({
        success: true,
        data: [] as any,
      })
      mockGetAvailableLibraries.mockResolvedValue({
        success: true,
        data: mockLibraries,
      })
    })

    it('should open create modal when Generate Invite button clicked', async () => {
      const user = userEvent.setup()
      render(<InvitesPageClient />)

      await waitFor(() => {
        expect(screen.getByText('No invites yet')).toBeInTheDocument()
      })

      const generateButton = screen.getByText('Generate Invite')
      await user.click(generateButton)

      expect(screen.getByRole('heading', { name: 'Create Invite' })).toBeInTheDocument()
    })

    it('should close modal when close button clicked', async () => {
      const user = userEvent.setup()
      render(<InvitesPageClient />)

      await waitFor(() => {
        expect(screen.getByText('No invites yet')).toBeInTheDocument()
      })

      const generateButton = screen.getByText('Generate Invite')
      await user.click(generateButton)

      const closeButton = screen.getByRole('button', { name: /Close modal/i })
      await user.click(closeButton)

      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: 'Create Invite' })).not.toBeInTheDocument()
      })
    })

    it('should load libraries when modal opens', async () => {
      const user = userEvent.setup()
      render(<InvitesPageClient />)

      await waitFor(() => {
        expect(screen.getByText('No invites yet')).toBeInTheDocument()
      })

      const generateButton = screen.getByText('Generate Invite')
      await user.click(generateButton)

      await waitFor(() => {
        expect(mockGetAvailableLibraries).toHaveBeenCalled()
      })
    })


    it('should handle library loading errors', async () => {
      const user = userEvent.setup()
      const consoleError = jest.spyOn(console, 'error').mockImplementation()
      mockGetAvailableLibraries.mockResolvedValue({
        success: false,
        error: 'Failed to load libraries',
      })

      render(<InvitesPageClient />)

      await waitFor(() => {
        expect(screen.getByText('No invites yet')).toBeInTheDocument()
      })

      const generateButton = screen.getByText('Generate Invite')
      await user.click(generateButton)

      await waitFor(() => {
        expect(mockShowError).toHaveBeenCalledWith('Failed to load libraries')
      })

      consoleError.mockRestore()
    })
  })

  describe('Create Invite Form', () => {
    beforeEach(() => {
      mockGetInvites.mockResolvedValue({
        success: true,
        data: [] as any,
      })
      mockGetAvailableLibraries.mockResolvedValue({
        success: true,
        data: mockLibraries,
      })
    })

    it('should have default form values', async () => {
      const user = userEvent.setup()
      render(<InvitesPageClient />)

      await waitFor(() => {
        expect(screen.getByText('No invites yet')).toBeInTheDocument()
      })

      const generateButton = screen.getByText('Generate Invite')
      await user.click(generateButton)

      await waitFor(() => {
        const maxUsesInput = screen.getByLabelText('Max Uses') as HTMLInputElement
        expect(maxUsesInput.value).toBe('1')

        const expirationSelect = screen.getByLabelText('Expiration') as HTMLSelectElement
        expect(expirationSelect.value).toBe('48h')
      })
    })

    it('should allow entering custom invite code', async () => {
      const user = userEvent.setup()
      render(<InvitesPageClient />)

      await waitFor(() => {
        expect(screen.getByText('No invites yet')).toBeInTheDocument()
      })

      const generateButton = screen.getByText('Generate Invite')
      await user.click(generateButton)

      const codeInput = screen.getByPlaceholderText('Leave blank to auto-generate')
      await user.type(codeInput, 'custom')

      expect(codeInput).toHaveValue('CUSTOM')
    })

    it('should convert custom code to uppercase', async () => {
      const user = userEvent.setup()
      render(<InvitesPageClient />)

      await waitFor(() => {
        expect(screen.getByText('No invites yet')).toBeInTheDocument()
      })

      const generateButton = screen.getByText('Generate Invite')
      await user.click(generateButton)

      const codeInput = screen.getByPlaceholderText('Leave blank to auto-generate')
      await user.type(codeInput, 'lowercase')

      expect(codeInput).toHaveValue('LOWERCASE')
    })

    it('should allow changing max uses', async () => {
      const user = userEvent.setup()
      render(<InvitesPageClient />)

      await waitFor(() => {
        expect(screen.getByText('No invites yet')).toBeInTheDocument()
      })

      const generateButton = screen.getByText('Generate Invite')
      await user.click(generateButton)

      const maxUsesInput = screen.getByLabelText('Max Uses') as HTMLInputElement
      await user.tripleClick(maxUsesInput)
      await user.keyboard('10')

      expect(maxUsesInput).toHaveValue(10)
    })

    it('should allow changing expiration', async () => {
      const user = userEvent.setup()
      render(<InvitesPageClient />)

      await waitFor(() => {
        expect(screen.getByText('No invites yet')).toBeInTheDocument()
      })

      const generateButton = screen.getByText('Generate Invite')
      await user.click(generateButton)

      const expirationSelect = screen.getByLabelText('Expiration')
      await user.selectOptions(expirationSelect, '7d')

      expect(expirationSelect).toHaveValue('7d')
    })


    it('should allow toggling allow downloads', async () => {
      const user = userEvent.setup()
      render(<InvitesPageClient />)

      await waitFor(() => {
        expect(screen.getByText('No invites yet')).toBeInTheDocument()
      })

      const generateButton = screen.getByText('Generate Invite')
      await user.click(generateButton)

      const downloadsCheckbox = screen.getByLabelText('Allow Downloads')
      expect(downloadsCheckbox).not.toBeChecked()

      await user.click(downloadsCheckbox)
      expect(downloadsCheckbox).toBeChecked()
    })
  })

  describe('Create Invite Submission', () => {
    beforeEach(() => {
      mockGetInvites.mockResolvedValue({
        success: true,
        data: [] as any,
      })
      mockGetAvailableLibraries.mockResolvedValue({
        success: true,
        data: mockLibraries,
      })
    })

    it('should create invite with default values', async () => {
      const user = userEvent.setup()
      mockCreateInvite.mockResolvedValue({
        success: true,
        data: { id: 'new-invite', code: 'GENERATED' } as any,
      })

      render(<InvitesPageClient />)

      await waitFor(() => {
        expect(screen.getByText('No invites yet')).toBeInTheDocument()
      })

      const generateButton = screen.getByText('Generate Invite')
      await user.click(generateButton)

      const createButton = screen.getByRole('button', { name: 'Create Invite' })
      await user.click(createButton)

      await waitFor(() => {
        expect(mockCreateInvite).toHaveBeenCalledWith({
          code: undefined,
          maxUses: 1,
          expiresIn: '48h',
          librarySectionIds: undefined,
          jellyfinLibraryIds: undefined,
          serverType: 'PLEX',
          allowDownloads: false,
        })
        expect(mockShowSuccess).toHaveBeenCalledWith('Invite created successfully!')
      })
    })

    it('should create invite with custom values', async () => {
      const user = userEvent.setup()
      mockCreateInvite.mockResolvedValue({
        success: true,
        data: { id: 'new-invite', code: 'CUSTOM' } as any,
      })

      render(<InvitesPageClient />)

      await waitFor(() => {
        expect(screen.getByText('No invites yet')).toBeInTheDocument()
      })

      const generateButton = screen.getByText('Generate Invite')
      await user.click(generateButton)

      // Set custom code
      const codeInput = screen.getByPlaceholderText('Leave blank to auto-generate')
      await user.type(codeInput, 'CUSTOM')

      // Set max uses
      const maxUsesInput = screen.getByLabelText('Max Uses') as HTMLInputElement
      await user.tripleClick(maxUsesInput)
      await user.keyboard('5')

      // Set expiration
      const expirationSelect = screen.getByLabelText('Expiration')
      await user.selectOptions(expirationSelect, '7d')

      // Enable downloads
      const downloadsCheckbox = screen.getByLabelText('Allow Downloads')
      await user.click(downloadsCheckbox)

      const createButton = screen.getByRole('button', { name: 'Create Invite' })
      await user.click(createButton)

      await waitFor(() => {
        expect(mockCreateInvite).toHaveBeenCalledWith({
          code: 'CUSTOM',
          maxUses: 5,
          expiresIn: '7d',
          librarySectionIds: undefined,
          jellyfinLibraryIds: undefined,
          serverType: 'PLEX',
          allowDownloads: true,
        })
      })
    })


    it('should show loading state during creation', async () => {
      const user = userEvent.setup()
      mockCreateInvite.mockImplementation(() => new Promise(() => {}))

      render(<InvitesPageClient />)

      await waitFor(() => {
        expect(screen.getByText('No invites yet')).toBeInTheDocument()
      })

      const generateButton = screen.getByText('Generate Invite')
      await user.click(generateButton)

      const createButton = screen.getByRole('button', { name: 'Create Invite' })
      await user.click(createButton)

      await waitFor(() => {
        expect(screen.getByText('Creating...')).toBeInTheDocument()
      })
    })

    it('should handle creation errors', async () => {
      const user = userEvent.setup()
      mockCreateInvite.mockResolvedValue({
        success: false,
        error: 'Code already exists',
      })

      render(<InvitesPageClient />)

      await waitFor(() => {
        expect(screen.getByText('No invites yet')).toBeInTheDocument()
      })

      const generateButton = screen.getByText('Generate Invite')
      await user.click(generateButton)

      const createButton = screen.getByRole('button', { name: 'Create Invite' })
      await user.click(createButton)

      await waitFor(() => {
        expect(mockShowError).toHaveBeenCalledWith('Code already exists')
      })
    })

    it('should close modal and reset form after successful creation', async () => {
      const user = userEvent.setup()
      mockCreateInvite.mockResolvedValue({
        success: true,
        data: { id: 'new-invite', code: 'GENERATED' } as any,
      })

      render(<InvitesPageClient />)

      await waitFor(() => {
        expect(screen.getByText('No invites yet')).toBeInTheDocument()
      })

      const generateButton = screen.getByText('Generate Invite')
      await user.click(generateButton)

      const codeInput = screen.getByPlaceholderText('Leave blank to auto-generate')
      await user.type(codeInput, 'TEST')

      const createButton = screen.getByRole('button', { name: 'Create Invite' })
      await user.click(createButton)

      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: 'Create Invite' })).not.toBeInTheDocument()
      })

      // Open modal again to verify form was reset
      await user.click(screen.getByText('Generate Invite'))

      await waitFor(() => {
        const resetCodeInput = screen.getByPlaceholderText('Leave blank to auto-generate')
        expect(resetCodeInput).toHaveValue('')
      })
    })
  })

  describe('Error Handling', () => {
    it('should handle loading errors gracefully', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation()
      mockGetInvites.mockRejectedValue(new Error('Network error'))

      render(<InvitesPageClient />)

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalled()
      })

      consoleError.mockRestore()
    })
  })

  describe('Accessibility', () => {
    beforeEach(() => {
      mockGetInvites.mockResolvedValue({
        success: true,
        data: mockInvites as any,
      })
    })

    it('should have proper heading hierarchy', async () => {
      render(<InvitesPageClient />)

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Invites' })).toBeInTheDocument()
      })
    })

    it('should have accessible table structure', async () => {
      render(<InvitesPageClient />)

      await waitFor(() => {
        const table = screen.getByRole('table')
        expect(table).toBeInTheDocument()
      })
    })

    it('should have accessible form labels', async () => {
      const user = userEvent.setup()
      mockGetAvailableLibraries.mockResolvedValue({
        success: true,
        data: mockLibraries,
      })

      render(<InvitesPageClient />)

      await waitFor(() => {
        expect(screen.getByText('TEST1234')).toBeInTheDocument()
      })

      const generateButton = screen.getByText('Generate Invite')
      await user.click(generateButton)

      await waitFor(() => {
        expect(screen.getByLabelText('Max Uses')).toBeInTheDocument()
        expect(screen.getByLabelText('Expiration')).toBeInTheDocument()
        expect(screen.getByLabelText('Allow Downloads')).toBeInTheDocument()
      })
    })
  })

  describe('Responsive Design', () => {
    beforeEach(() => {
      mockGetInvites.mockResolvedValue({
        success: true,
        data: mockInvites as any,
      })
    })

    it('should render table with responsive classes', async () => {
      render(<InvitesPageClient />)

      await waitFor(() => {
        const table = screen.getByRole('table')
        expect(table.parentElement).toHaveClass('overflow-x-auto')
      })
    })
  })
})

