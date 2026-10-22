import { render, screen } from '@testing-library/react'
import { UsersStatsSummary } from '@/components/admin/users/users-stats-summary'
import { makeAdminUserWithStats, makeLlmUsageStats } from '../../__tests__/utils/test-builders'

describe('UsersStatsSummary', () => {
  it('should render total users count', () => {
    const users = [
      makeAdminUserWithStats({ wrappedStatus: 'completed', totalLlmUsage: null }),
      makeAdminUserWithStats({ wrappedStatus: 'generating', totalLlmUsage: null }),
    ]
    render(<UsersStatsSummary users={users} />)

    expect(screen.getByText('Total Users')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('should count completed wrapped users', () => {
    const users = [
      makeAdminUserWithStats({ wrappedStatus: 'completed', totalLlmUsage: null }),
      makeAdminUserWithStats({ wrappedStatus: 'completed', totalLlmUsage: null }),
      makeAdminUserWithStats({ wrappedStatus: 'generating', totalLlmUsage: null }),
    ]
    render(<UsersStatsSummary users={users} />)

    expect(screen.getByText('Completed Wrapped')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('should count generating users', () => {
    const users = [
      makeAdminUserWithStats({ wrappedStatus: 'generating', totalLlmUsage: null }),
      makeAdminUserWithStats({ wrappedStatus: 'generating', totalLlmUsage: null }),
      makeAdminUserWithStats({ wrappedStatus: 'completed', totalLlmUsage: null }),
    ]
    render(<UsersStatsSummary users={users} />)

    expect(screen.getByText('Generating')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('should count not generated users', () => {
    const users = [
      makeAdminUserWithStats({ wrappedStatus: null, totalLlmUsage: null }),
      makeAdminUserWithStats({ wrappedStatus: null, totalLlmUsage: null }),
      makeAdminUserWithStats({ wrappedStatus: 'completed', totalLlmUsage: null }),
    ]
    render(<UsersStatsSummary users={users} />)

    expect(screen.getByText('Not Generated')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('should calculate total tokens', () => {
    const users = [
      makeAdminUserWithStats({
        wrappedStatus: 'completed',
        totalLlmUsage: makeLlmUsageStats({ totalTokens: 1000, cost: 0.01 }),
      }),
      makeAdminUserWithStats({
        wrappedStatus: 'completed',
        totalLlmUsage: makeLlmUsageStats({ totalTokens: 2000, cost: 0.02 }),
      }),
    ]
    render(<UsersStatsSummary users={users} />)

    expect(screen.getByText('Total Tokens')).toBeInTheDocument()
    expect(screen.getByText('3,000')).toBeInTheDocument()
  })

  it('should calculate total cost', () => {
    const users = [
      makeAdminUserWithStats({
        wrappedStatus: 'completed',
        totalLlmUsage: makeLlmUsageStats({ totalTokens: 1000, cost: 0.015 }),
      }),
      makeAdminUserWithStats({
        wrappedStatus: 'completed',
        totalLlmUsage: makeLlmUsageStats({ totalTokens: 2000, cost: 0.025 }),
      }),
    ]
    render(<UsersStatsSummary users={users} />)

    expect(screen.getByText('Total Cost')).toBeInTheDocument()
    expect(screen.getByText('$0.040')).toBeInTheDocument()
  })

  it('should handle users without LLM usage', () => {
    const users = [
      makeAdminUserWithStats({ wrappedStatus: 'completed', totalLlmUsage: null }),
      makeAdminUserWithStats({ wrappedStatus: 'generating', totalLlmUsage: null }),
    ]
    render(<UsersStatsSummary users={users} />)

    expect(screen.getByText('Total Tokens')).toBeInTheDocument()
    expect(screen.getByTestId('users-stat-total-tokens')).toHaveTextContent('Total Tokens0')
    expect(screen.getByText('Total Cost')).toBeInTheDocument()
    expect(screen.getByText('$0.00')).toBeInTheDocument()
  })

  it('should handle empty users array', () => {
    render(<UsersStatsSummary users={[]} />)

    expect(screen.getByText('Total Users')).toBeInTheDocument()
    const zeros = screen.getAllByText('0')
    expect(zeros.length).toBeGreaterThan(0)
  })

  it('should format large token numbers with commas', () => {
    const users = [
      makeAdminUserWithStats({
        wrappedStatus: 'completed',
        totalLlmUsage: makeLlmUsageStats({ totalTokens: 1234567, cost: 1.23 }),
      }),
    ]
    render(<UsersStatsSummary users={users} />)

    expect(screen.getByText('1,234,567')).toBeInTheDocument()
  })

  it('should show helper text for tokens and cost', () => {
    const users = [
      makeAdminUserWithStats({
        wrappedStatus: 'completed',
        totalLlmUsage: makeLlmUsageStats({ totalTokens: 1000, cost: 0.01 }),
      }),
    ]
    render(<UsersStatsSummary users={users} />)

    const helperTexts = screen.getAllByText('Across all years & regenerations')
    expect(helperTexts.length).toBe(2)
  })
})

