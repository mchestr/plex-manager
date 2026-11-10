/**
 * /report: a 404 while problem reports are off; otherwise Find a title, Your
 * reports, and the sheet for `?item=`, with the search kept for closing it.
 */

import { render, screen } from '@testing-library/react'
import { getServerSession } from 'next-auth'
import { notFound } from 'next/navigation'

import ReportPage from '@/app/(app)/report/page'
import { getReportPageData } from '@/lib/member/problem-reports'
import { hasReportPage } from '@/lib/problem-reports/settings'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({ prisma: {} }))
jest.mock('@/lib/problem-reports/settings', () => ({ hasReportPage: jest.fn() }))
jest.mock('@/lib/member/problem-reports', () => ({ getReportPageData: jest.fn() }))
jest.mock('@/actions/problem-reports', () => ({ reportProblem: jest.fn(), followProblemReport: jest.fn(), cancelProblemReport: jest.fn() }))
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ showSuccess: jest.fn(), showError: jest.fn() }) }))
jest.mock('next/form', () => ({ __esModule: true, default: ({ children, ...props }: { children: React.ReactNode }) => <form {...props}>{children}</form> }))
jest.mock('next/navigation', () => ({
  ...require('@/__tests__/helpers/url-router').navigationModule,
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  redirect: jest.fn(() => {
    throw new Error('NEXT_REDIRECT')
  }),
}))

const params = (values: Record<string, string | string[]>) => Promise.resolve(values)

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: 'member-1' } })
  jest.mocked(hasReportPage).mockResolvedValue(true)
  jest.mocked(getReportPageData).mockResolvedValue({ reports: [], watching: null, recent: [], search: null, selected: null })
})

describe('ReportPage', () => {
  it('is a 404 while problem reports are off', async () => {
    jest.mocked(hasReportPage).mockResolvedValue(false)

    await expect(ReportPage({ searchParams: params({}) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalled()
    expect(getReportPageData).not.toHaveBeenCalled()
  })

  it('renders Find a title and Your reports', async () => {
    render(await ReportPage({ searchParams: params({}) }))

    expect(screen.getByRole('heading', { level: 1, name: 'Report a problem' })).toBeInTheDocument()
    expect(screen.getByTestId('report-find')).toBeInTheDocument()
    expect(screen.getByTestId('report-list-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('report-sheet')).not.toBeInTheDocument()
  })

  it('reads the first search and item, and drops an item that is not a rating key', async () => {
    await ReportPage({ searchParams: params({ q: ['heat', 'up'], item: '../1' }) })

    expect(getReportPageData).toHaveBeenCalledWith('member-1', { q: 'heat', item: undefined })
  })

  it('lists the search results as links that open the sheet', async () => {
    jest.mocked(getReportPageData).mockResolvedValue({
      reports: [],
      watching: null,
      recent: [],
      search: { results: [{ ratingKey: '555', type: 'movie', title: 'Heat (1995)', posterKey: '555' }], error: null },
      selected: null,
    })

    render(await ReportPage({ searchParams: params({ q: 'heat' }) }))

    expect(screen.getByTestId('report-result-555')).toHaveAttribute('href', '/report?q=heat&item=555')
    expect(screen.getByTestId('report-search-input')).toHaveValue('heat')
  })

  it('shows Watching now only while the member streams, and says when recent plays cannot load', async () => {
    jest.mocked(getReportPageData).mockResolvedValue({
      reports: [],
      watching: [{ ratingKey: '7001', type: 'episode', title: 'The Office S1E1: Pilot', posterKey: '6999' }],
      recent: null,
      search: null,
      selected: null,
    })

    render(await ReportPage({ searchParams: params({}) }))

    expect(screen.getByTestId('report-watching-title-7001')).toHaveAttribute('href', '/report?item=7001')
    expect(screen.getByTestId('report-recent-unavailable')).toBeInTheDocument()
  })

  it('hides Watching now when the member streams nothing', async () => {
    render(await ReportPage({ searchParams: params({}) }))

    expect(screen.queryByTestId('report-watching')).not.toBeInTheDocument()
    expect(screen.getByTestId('report-recent-empty')).toBeInTheDocument()
  })
})
