/**
 * @jest-environment node
 */
import { refresh, revalidateTag, updateTag } from 'next/cache'
import type { Session } from 'next-auth'

import { expireTag, refreshView } from '@/lib/actions/invalidate'
import { runAsPrincipal } from '@/lib/mcp/principal'

jest.mock('next/cache', () => ({ refresh: jest.fn(), revalidateTag: jest.fn(), updateTag: jest.fn() }))

const session: Session = { user: { id: 'admin-1', isAdmin: true }, expires: '' }

beforeEach(() => jest.clearAllMocks())

describe('in a Server Action', () => {
  it('expires a tag with updateTag and refreshes the page', () => {
    expireTag('app-settings')
    refreshView()
    expect(updateTag).toHaveBeenCalledWith('app-settings')
    expect(refresh).toHaveBeenCalled()
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})

describe('in an MCP tool call', () => {
  it('expires a tag at once with revalidateTag and refreshes nothing', () => {
    runAsPrincipal(session, () => {
      expireTag('app-settings')
      refreshView()
    })
    expect(revalidateTag).toHaveBeenCalledWith('app-settings', { expire: 0 })
    expect(updateTag).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })
})
