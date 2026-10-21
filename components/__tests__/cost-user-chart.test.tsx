import { render, screen } from '@testing-library/react'
import { CostUserChart } from '@/components/admin/cost-analysis/cost-user-chart'

// Mock Chart.js and react-chartjs-2
jest.mock('chart.js', () => ({
  Chart: {
    register: jest.fn(),
  },
  CategoryScale: jest.fn(),
  LinearScale: jest.fn(),
  BarElement: jest.fn(),
  Tooltip: jest.fn(),
  Legend: jest.fn(),
}))

jest.mock('react-chartjs-2', () => ({
  Bar: ({ data, options }: any) => (
    <div data-testid="bar-chart">
      <div data-testid="chart-data">{JSON.stringify(data)}</div>
      <div data-testid="chart-options">{JSON.stringify(options)}</div>
    </div>
  ),
}))

describe('CostUserChart', () => {
  const mockUserData = [
    {
      userId: 'user-1',
      userName: 'John Doe',
      cost: 150.5,
      requests: 1000,
      tokens: 50000,
    },
    {
      userId: 'user-2',
      userName: 'Jane Smith',
      cost: 125.25,
      requests: 800,
      tokens: 40000,
    },
    {
      userId: 'user-3',
      userName: 'Bob Johnson',
      cost: 95.75,
      requests: 600,
      tokens: 30000,
    },
  ]

  describe('Rendering', () => {
    it('should render chart with valid data', () => {
      render(<CostUserChart data={mockUserData} />)

      expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
    })

    it('should show "No data available" message when data is empty', () => {
      render(<CostUserChart data={[]} />)

      expect(screen.getByText('No data available')).toBeInTheDocument()
      expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument()
    })

    it('should render chart container with proper styling', () => {
      const { container } = render(<CostUserChart data={mockUserData} />)

      const chartContainer = container.querySelector('.w-full.h-full')
      expect(chartContainer).toBeInTheDocument()
    })

    it('should display empty state with proper styling', () => {
      render(<CostUserChart data={[]} />)

      const emptyState = screen.getByText('No data available')
      expect(emptyState).toHaveClass('text-muted-foreground', 'text-sm')
    })
  })

  describe('Data Processing', () => {
    it('should limit display to top 10 users', () => {
      const manyUsers = Array.from({ length: 15 }, (_, i) => ({
        userId: `user-${i}`,
        userName: `User ${i}`,
        cost: 100 - i,
        requests: 1000,
        tokens: 50000,
      }))

      render(<CostUserChart data={manyUsers} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      // Should only have 10 labels
      expect(parsedData.labels).toHaveLength(10)
    })

    it('should truncate long user names', () => {
      const longNameData = [
        {
          userId: 'user-1',
          userName: 'This is a very long user name that should be truncated',
          cost: 100,
          requests: 1000,
          tokens: 50000,
        },
      ]

      render(<CostUserChart data={longNameData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      // Should be truncated with ellipsis
      expect(parsedData.labels[0]).toMatch(/\.\.\./)
      expect(parsedData.labels[0].length).toBeLessThanOrEqual(20)
    })

    it('should not truncate short user names', () => {
      const shortNameData = [
        {
          userId: 'user-1',
          userName: 'John',
          cost: 100,
          requests: 1000,
          tokens: 50000,
        },
      ]

      render(<CostUserChart data={shortNameData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.labels[0]).toBe('John')
    })

    it('should handle user with null name', () => {
      const nullNameData = [
        {
          userId: 'user-1',
          userName: null,
          cost: 100,
          requests: 1000,
          tokens: 50000,
        },
      ]

      render(<CostUserChart data={nullNameData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.labels[0]).toBe('Unknown User')
    })

    it('should handle user with undefined name', () => {
      const undefinedNameData = [
        {
          userId: 'user-1',
          userName: undefined as any,
          cost: 100,
          requests: 1000,
          tokens: 50000,
        },
      ]

      render(<CostUserChart data={undefinedNameData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.labels[0]).toBe('Unknown User')
    })

    it('should handle user with empty string name', () => {
      const emptyNameData = [
        {
          userId: 'user-1',
          userName: '',
          cost: 100,
          requests: 1000,
          tokens: 50000,
        },
      ]

      render(<CostUserChart data={emptyNameData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.labels[0]).toBe('Unknown User')
    })
  })

  describe('Chart Configuration', () => {
    it('should configure horizontal bar chart', () => {
      render(<CostUserChart data={mockUserData} />)

      const chartOptions = screen.getByTestId('chart-options')
      const parsedOptions = JSON.parse(chartOptions.textContent || '{}')

      expect(parsedOptions.indexAxis).toBe('y')
    })

    it('should set responsive and maintainAspectRatio options', () => {
      render(<CostUserChart data={mockUserData} />)

      const chartOptions = screen.getByTestId('chart-options')
      const parsedOptions = JSON.parse(chartOptions.textContent || '{}')

      expect(parsedOptions.responsive).toBe(true)
      expect(parsedOptions.maintainAspectRatio).toBe(false)
    })

    it('should hide legend', () => {
      render(<CostUserChart data={mockUserData} />)

      const chartOptions = screen.getByTestId('chart-options')
      const parsedOptions = JSON.parse(chartOptions.textContent || '{}')

      expect(parsedOptions.plugins.legend.display).toBe(false)
    })

    it('should configure tooltip with custom styling', () => {
      render(<CostUserChart data={mockUserData} />)

      const chartOptions = screen.getByTestId('chart-options')
      const parsedOptions = JSON.parse(chartOptions.textContent || '{}')

      expect(parsedOptions.plugins.tooltip.backgroundColor).toBe('#1e293b')
      expect(parsedOptions.plugins.tooltip.titleColor).toBe('#cbd5e1')
      expect(parsedOptions.plugins.tooltip.bodyColor).toBe('#e2e8f0')
      expect(parsedOptions.plugins.tooltip.borderColor).toBe('#475569')
      expect(parsedOptions.plugins.tooltip.borderWidth).toBe(1)
      expect(parsedOptions.plugins.tooltip.padding).toBe(12)
      expect(parsedOptions.plugins.tooltip.cornerRadius).toBe(6)
      expect(parsedOptions.plugins.tooltip.displayColors).toBe(true)
    })

    it('should configure x-axis to begin at zero', () => {
      render(<CostUserChart data={mockUserData} />)

      const chartOptions = screen.getByTestId('chart-options')
      const parsedOptions = JSON.parse(chartOptions.textContent || '{}')

      expect(parsedOptions.scales.x.beginAtZero).toBe(true)
    })

    it('should configure x-axis ticks styling', () => {
      render(<CostUserChart data={mockUserData} />)

      const chartOptions = screen.getByTestId('chart-options')
      const parsedOptions = JSON.parse(chartOptions.textContent || '{}')

      expect(parsedOptions.scales.x.ticks.color).toBe('#94a3b8')
      expect(parsedOptions.scales.x.ticks.font.size).toBe(11)
    })

    it('should hide y-axis grid', () => {
      render(<CostUserChart data={mockUserData} />)

      const chartOptions = screen.getByTestId('chart-options')
      const parsedOptions = JSON.parse(chartOptions.textContent || '{}')

      expect(parsedOptions.scales.y.grid.display).toBe(false)
    })
  })

  describe('Chart Data', () => {
    it('should include all user costs in dataset', () => {
      render(<CostUserChart data={mockUserData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].data).toEqual([150.5, 125.25, 95.75])
    })

    it('should set proper colors for bars', () => {
      render(<CostUserChart data={mockUserData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].backgroundColor).toBe('rgba(139, 92, 246, 0.8)')
      expect(parsedData.datasets[0].borderColor).toBe('#8b5cf6')
      expect(parsedData.datasets[0].borderWidth).toBe(1)
    })

    it('should set border radius for bars', () => {
      render(<CostUserChart data={mockUserData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].borderRadius).toBe(4)
    })

    it('should label dataset as "Cost"', () => {
      render(<CostUserChart data={mockUserData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].label).toBe('Cost')
    })
  })

  describe('Tooltip Configuration', () => {
    it('should configure tooltip callbacks', () => {
      render(<CostUserChart data={mockUserData} />)

      const chartOptions = screen.getByTestId('chart-options')
      const parsedOptions = JSON.parse(chartOptions.textContent || '{}')

      // Verify tooltip callbacks exist (functions can't be serialized to JSON)
      expect(parsedOptions.plugins.tooltip.callbacks).toBeDefined()
    })
  })

  describe('Edge Cases', () => {
    it('should handle single user data', () => {
      const singleUser = [mockUserData[0]]

      render(<CostUserChart data={singleUser} />)

      expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
    })

    it('should handle zero cost', () => {
      const zeroCostData = [
        {
          userId: 'user-1',
          userName: 'Free User',
          cost: 0,
          requests: 100,
          tokens: 1000,
        },
      ]

      render(<CostUserChart data={zeroCostData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].data).toEqual([0])
    })

    it('should handle zero requests', () => {
      const zeroRequestsData = [
        {
          userId: 'user-1',
          userName: 'Inactive User',
          cost: 100,
          requests: 0,
          tokens: 0,
        },
      ]

      render(<CostUserChart data={zeroRequestsData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      // Should render without crashing
      expect(parsedData.datasets[0].data).toEqual([100])
    })

    it('should handle very large numbers', () => {
      const largeNumberData = [
        {
          userId: 'user-1',
          userName: 'Power User',
          cost: 999999.99,
          requests: 1000000,
          tokens: 50000000,
        },
      ]

      render(<CostUserChart data={largeNumberData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].data).toEqual([999999.99])
    })

    it('should handle negative costs', () => {
      const negativeCostData = [
        {
          userId: 'user-1',
          userName: 'Refunded User',
          cost: -50,
          requests: 100,
          tokens: 1000,
        },
      ]

      render(<CostUserChart data={negativeCostData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].data).toEqual([-50])
    })

    it('should handle user names with special characters', () => {
      const specialCharData = [
        {
          userId: 'user-1',
          userName: "O'Brien & Sons <test>",
          cost: 100,
          requests: 1000,
          tokens: 50000,
        },
      ]

      render(<CostUserChart data={specialCharData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.labels[0]).toContain("O'Brien")
    })

    it('should handle exactly 20 character user names without truncation', () => {
      const exactLengthData = [
        {
          userId: 'user-1',
          userName: '12345678901234567890', // Exactly 20 characters
          cost: 100,
          requests: 1000,
          tokens: 50000,
        },
      ]

      render(<CostUserChart data={exactLengthData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.labels[0]).toBe('12345678901234567890')
      expect(parsedData.labels[0]).not.toContain('...')
    })

    it('should handle 21 character user names with truncation', () => {
      const overLengthData = [
        {
          userId: 'user-1',
          userName: '123456789012345678901', // 21 characters
          cost: 100,
          requests: 1000,
          tokens: 50000,
        },
      ]

      render(<CostUserChart data={overLengthData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.labels[0]).toContain('...')
      expect(parsedData.labels[0].length).toBe(20) // 17 chars + '...'
    })

    it('should handle users with same costs', () => {
      const sameCostData = [
        { userId: 'user-1', userName: 'User 1', cost: 100, requests: 1000, tokens: 50000 },
        { userId: 'user-2', userName: 'User 2', cost: 100, requests: 1000, tokens: 50000 },
        { userId: 'user-3', userName: 'User 3', cost: 100, requests: 1000, tokens: 50000 },
      ]

      render(<CostUserChart data={sameCostData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].data).toEqual([100, 100, 100])
    })
  })
})

