import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { skipSetupStep } from '@/actions/setup'
import { SkipStepButton } from '@/components/setup/setup-wizard/skip-step-button'

const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
jest.mock('@/actions/setup', () => ({ skipSetupStep: jest.fn() }))

beforeEach(() => jest.clearAllMocks())

describe('SkipStepButton', () => {
  it('skips the step and opens the next one', async () => {
    jest.mocked(skipSetupStep).mockResolvedValue({ success: true, data: null })
    render(<SkipStepButton stepId="sonarr" />)

    await userEvent.setup().click(screen.getByTestId('setup-skip-step'))

    expect(skipSetupStep).toHaveBeenCalledWith({ stepId: 'sonarr' })
    expect(push).toHaveBeenCalledWith('/setup?step=radarr')
  })

  it('shows a refusal and stays on the step', async () => {
    jest.mocked(skipSetupStep).mockResolvedValue({ success: false, code: 'CONFLICT', error: 'Finish the earlier steps first' })
    render(<SkipStepButton stepId="prometheus" />)

    await userEvent.setup().click(screen.getByRole('button', { name: 'Skip for now' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Finish the earlier steps first')
    expect(push).not.toHaveBeenCalled()
  })
})
