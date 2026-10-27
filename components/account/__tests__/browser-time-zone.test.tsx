/**
 * The member layout's zone capture (Rewind 7.7): it sends the browser's zone
 * once and draws nothing.
 */

import { render, waitFor } from '@testing-library/react'

import { adoptBrowserTimezone } from '@/actions/account'
import { BrowserTimeZone } from '@/components/account/browser-time-zone'

jest.mock('@/actions/account', () => ({ adoptBrowserTimezone: jest.fn() }))

const realResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(function (this: Intl.DateTimeFormat) {
    return { ...realResolvedOptions.call(this), timeZone: 'America/Los_Angeles' }
  })
  jest.mocked(adoptBrowserTimezone).mockResolvedValue({ success: true, data: null })
})

afterEach(() => jest.restoreAllMocks())

describe('BrowserTimeZone', () => {
  it('saves the browser zone once and renders nothing', async () => {
    const { container, rerender } = render(<BrowserTimeZone />)
    rerender(<BrowserTimeZone />)

    await waitFor(() => expect(adoptBrowserTimezone).toHaveBeenCalledWith({ timeZone: 'America/Los_Angeles' }))
    expect(adoptBrowserTimezone).toHaveBeenCalledTimes(1)
    expect(container).toBeEmptyDOMElement()
  })
})
