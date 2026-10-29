import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  approveAffiliate,
  refuseAffiliate,
  revokeAffiliateStatus,
  setAffiliateOverride,
  unblockAffiliateAccount,
} from '@/actions/admin/affiliates'
import { ApproveDialog, OverrideDialog, RefuseDialog, RevokeDialog, UnblockDialog } from '@/components/admin/affiliates/affiliate-dialogs'

jest.mock('next/navigation', () => require('@/__tests__/helpers/url-router').navigationModule)
jest.mock('@/actions/admin/affiliates', () => ({
  approveAffiliate: jest.fn(),
  refuseAffiliate: jest.fn(),
  revokeAffiliateStatus: jest.fn(),
  setAffiliateOverride: jest.fn(),
  unblockAffiliateAccount: jest.fn(),
}))
const mockShowSuccess = jest.fn()
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: jest.fn() }) }))

const SAM = { id: 'app-1', name: 'Sam' }

beforeEach(() => jest.clearAllMocks())

describe('ApproveDialog', () => {
  it('approves, and shows a refusal inside the dialog', async () => {
    jest.mocked(approveAffiliate).mockResolvedValueOnce({ success: false, code: 'NOT_ELIGIBLE', error: 'This member no longer has access to the server.' })
    const user = userEvent.setup()
    render(<ApproveDialog application={SAM} />)

    await user.click(screen.getByTestId('admin-affiliates-approve-app-1'))
    await user.click(await screen.findByTestId('admin-affiliates-approve-confirm'))
    expect(await screen.findByRole('alert')).toHaveTextContent('This member no longer has access to the server.')

    jest.mocked(approveAffiliate).mockResolvedValueOnce({ success: true, data: { paused: false } })
    await user.click(screen.getByTestId('admin-affiliates-approve-confirm'))
    expect(approveAffiliate).toHaveBeenLastCalledWith({ applicationId: 'app-1' })
    await waitFor(() => expect(screen.queryByTestId('admin-affiliates-approve-dialog')).not.toBeInTheDocument())
    expect(mockShowSuccess).toHaveBeenCalledWith('Sam is an affiliate')
  })
})

describe('RefuseDialog and RevokeDialog', () => {
  it('sends the typed reason with a refusal', async () => {
    jest.mocked(refuseAffiliate).mockResolvedValue({ success: true, data: null })
    const user = userEvent.setup()
    render(<RefuseDialog application={SAM} />)

    await user.click(screen.getByTestId('admin-affiliates-refuse-app-1'))
    await user.type(await screen.findByTestId('admin-affiliates-refuse-reason'), 'Watch a bit more first')
    await user.click(screen.getByTestId('admin-affiliates-refuse-confirm'))

    expect(refuseAffiliate).toHaveBeenCalledWith({ applicationId: 'app-1', reason: 'Watch a bit more first' })
  })

  it('says invitees stay members, and sends the reason with a revoke', async () => {
    jest.mocked(revokeAffiliateStatus).mockResolvedValue({ success: true, data: { invitesCancelled: 1 } })
    const user = userEvent.setup()
    render(<RevokeDialog affiliate={SAM} />)

    await user.click(screen.getByTestId('admin-affiliates-revoke-app-1'))
    expect(await screen.findByTestId('admin-affiliates-revoke-dialog')).toHaveTextContent('The people they invited stay members.')
    await user.click(screen.getByTestId('admin-affiliates-revoke-confirm'))
    expect(revokeAffiliateStatus).toHaveBeenCalledWith({ applicationId: 'app-1', reason: '' })
  })
})

describe('OverrideDialog', () => {
  it('sets 0', async () => {
    jest.mocked(setAffiliateOverride).mockResolvedValue({ success: true, data: null })
    const user = userEvent.setup()
    render(<OverrideDialog affiliate={SAM} current={null} />)

    await user.click(screen.getByTestId('admin-affiliates-override-app-1'))
    await user.type(await screen.findByTestId('admin-affiliates-override-input'), '0')
    await user.click(screen.getByTestId('admin-affiliates-override-confirm'))
    expect(setAffiliateOverride).toHaveBeenCalledWith({ applicationId: 'app-1', override: 0 })
  })

  it('clears an override back to the tiers', async () => {
    jest.mocked(setAffiliateOverride).mockResolvedValue({ success: true, data: null })
    const user = userEvent.setup()
    render(<OverrideDialog affiliate={SAM} current={3} />)

    await user.click(screen.getByTestId('admin-affiliates-override-app-1'))
    expect(await screen.findByTestId('admin-affiliates-override-input')).toHaveValue(3)
    await user.click(screen.getByTestId('admin-affiliates-override-clear'))
    await user.click(screen.getByTestId('admin-affiliates-override-confirm'))
    expect(setAffiliateOverride).toHaveBeenCalledWith({ applicationId: 'app-1', override: null })
  })

  it('refuses a number over 10 without calling the action', async () => {
    const user = userEvent.setup()
    render(<OverrideDialog affiliate={SAM} current={null} />)

    await user.click(screen.getByTestId('admin-affiliates-override-app-1'))
    await user.type(await screen.findByTestId('admin-affiliates-override-input'), '11')
    await user.click(screen.getByTestId('admin-affiliates-override-confirm'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a number from 0 to 10.')
    expect(setAffiliateOverride).not.toHaveBeenCalled()
  })
})

describe('UnblockDialog', () => {
  it('unblocks the account', async () => {
    jest.mocked(unblockAffiliateAccount).mockResolvedValue({ success: true, data: null })
    const user = userEvent.setup()
    render(<UnblockDialog blockId="b1" />)

    await user.click(screen.getByTestId('admin-affiliates-unblock-b1'))
    await user.click(await screen.findByTestId('admin-affiliates-unblock-confirm'))
    expect(unblockAffiliateAccount).toHaveBeenCalledWith({ blockId: 'b1' })
  })
})
