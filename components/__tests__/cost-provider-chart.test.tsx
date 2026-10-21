import { render, screen } from '@testing-library/react'
import { CostProviderChart } from '@/components/admin/cost-analysis/cost-provider-chart'

// Mock Chart.js and react-chartjs-2
jest.mock('chart.js', () => ({
  Chart: {
    register: jest.fn(),
  },
  ArcElement: jest.fn(),
  Tooltip: jest.fn(),
  Legend: jest.fn(),
}))

jest.mock('react-chartjs-2', () => ({
  Doughnut: ({ data, options }: any) => (
    <div data-testid="doughnut-chart">
      <div data-testid="chart-data">{JSON.stringify(data)}</div>
      <div data-testid="chart-options">{JSON.stringify(options)}</div>
    </div>
  ),
}))

describe('CostProviderChart', () => {
  const mockProviderData = [
    {
      provider: 'openai',
      cost: 250.5,
      requests: 3000,
      tokens: 150000,
    },
    {
      provider: 'mock',
      cost: 0,
      requests: 500,
      tokens: 10000,
    },
  ]

  describe('Rendering', () => {
    it('should render chart with valid data', () => {
      render(<CostProviderChart data={mockProviderData} />)

      expect(screen.getByTestId('doughnut-chart')).toBeInTheDocument()
    })

    it('should show "No data available" message when data is empty', () => {
      render(<CostProviderChart data={[]} />)

      expect(screen.getByText('No data available')).toBeInTheDocument()
      expect(screen.queryByTestId('doughnut-chart')).not.toBeInTheDocument()
    })

    it('should render chart container with proper styling', () => {
      const { container } = render(<CostProviderChart data={mockProviderData} />)

      const chartContainer = container.querySelector('.w-full.h-full')
      expect(chartContainer).toBeInTheDocument()
    })

    it('should display empty state with proper styling', () => {
      render(<CostProviderChart data={[]} />)

      const emptyState = screen.getByText('No data available')
      expect(emptyState).toHaveClass('text-muted-foreground', 'text-sm')
    })
  })

  describe('Data Processing', () => {
    it('should include all provider names as labels', () => {
      render(<CostProviderChart data={mockProviderData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.labels).toEqual(['openai', 'mock'])
    })

    it('should include all provider costs in dataset', () => {
      render(<CostProviderChart data={mockProviderData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].data).toEqual([250.5, 0])
    })

    it('should handle single provider', () => {
      const singleProvider = [mockProviderData[0]]

      render(<CostProviderChart data={singleProvider} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.labels).toEqual(['openai'])
      expect(parsedData.datasets[0].data).toEqual([250.5])
    })

    it('should handle multiple providers', () => {
      const multipleProviders = [
        ...mockProviderData,
        {
          provider: 'anthropic',
          cost: 180.25,
          requests: 2000,
          tokens: 100000,
        },
      ]

      render(<CostProviderChart data={multipleProviders} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.labels).toHaveLength(3)
      expect(parsedData.datasets[0].data).toHaveLength(3)
    })
  })

  describe('Provider Colors', () => {
    it('should apply predefined color for openai provider', () => {
      const openaiData = [
        {
          provider: 'openai',
          cost: 100,
          requests: 1000,
          tokens: 50000,
        },
      ]

      render(<CostProviderChart data={openaiData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].backgroundColor[0]).toBe('rgba(16, 185, 129, 0.8)')
      expect(parsedData.datasets[0].borderColor[0]).toBe('#10b981')
    })

    it('should apply predefined color for mock provider', () => {
      const mockData = [
        {
          provider: 'mock',
          cost: 0,
          requests: 100,
          tokens: 1000,
        },
      ]

      render(<CostProviderChart data={mockData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].backgroundColor[0]).toBe('rgba(100, 116, 139, 0.8)')
      expect(parsedData.datasets[0].borderColor[0]).toBe('#64748b')
    })

    it('should apply default color for unknown provider', () => {
      const unknownProviderData = [
        {
          provider: 'unknown-provider',
          cost: 50,
          requests: 500,
          tokens: 25000,
        },
      ]

      render(<CostProviderChart data={unknownProviderData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].backgroundColor[0]).toBe('rgba(100, 116, 139, 0.8)')
      expect(parsedData.datasets[0].borderColor[0]).toBe('#64748b')
    })

    it('should set border width for all providers', () => {
      render(<CostProviderChart data={mockProviderData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].borderWidth).toBe(2)
    })
  })

  describe('Chart Configuration', () => {
    it('should set responsive and maintainAspectRatio options', () => {
      render(<CostProviderChart data={mockProviderData} />)

      const chartOptions = screen.getByTestId('chart-options')
      const parsedOptions = JSON.parse(chartOptions.textContent || '{}')

      expect(parsedOptions.responsive).toBe(true)
      expect(parsedOptions.maintainAspectRatio).toBe(false)
    })

    it('should position legend at bottom', () => {
      render(<CostProviderChart data={mockProviderData} />)

      const chartOptions = screen.getByTestId('chart-options')
      const parsedOptions = JSON.parse(chartOptions.textContent || '{}')

      expect(parsedOptions.plugins.legend.position).toBe('bottom')
    })

    it('should configure legend labels with proper styling', () => {
      render(<CostProviderChart data={mockProviderData} />)

      const chartOptions = screen.getByTestId('chart-options')
      const parsedOptions = JSON.parse(chartOptions.textContent || '{}')

      expect(parsedOptions.plugins.legend.labels.color).toBe('#94a3b8')
      expect(parsedOptions.plugins.legend.labels.font.size).toBe(12)
      expect(parsedOptions.plugins.legend.labels.usePointStyle).toBe(true)
      expect(parsedOptions.plugins.legend.labels.padding).toBe(15)
    })

    it('should configure tooltip with custom styling', () => {
      render(<CostProviderChart data={mockProviderData} />)

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
  })

  describe('Tooltip Configuration', () => {
    it('should configure tooltip callbacks', () => {
      render(<CostProviderChart data={mockProviderData} />)

      const chartOptions = screen.getByTestId('chart-options')
      const parsedOptions = JSON.parse(chartOptions.textContent || '{}')

      // Verify tooltip callbacks exist (functions can't be serialized to JSON)
      expect(parsedOptions.plugins.tooltip.callbacks).toBeDefined()
    })
  })

  describe('Edge Cases', () => {
    it('should handle zero cost', () => {
      const zeroCostData = [
        {
          provider: 'free-provider',
          cost: 0,
          requests: 100,
          tokens: 1000,
        },
      ]

      render(<CostProviderChart data={zeroCostData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].data).toEqual([0])
    })

    it('should handle all providers with zero cost', () => {
      const allZeroCostData = [
        { provider: 'provider1', cost: 0, requests: 100, tokens: 1000 },
        { provider: 'provider2', cost: 0, requests: 200, tokens: 2000 },
      ]

      render(<CostProviderChart data={allZeroCostData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      // Should render without crashing
      expect(parsedData.datasets[0].data).toEqual([0, 0])
    })

    it('should handle very large numbers', () => {
      const largeNumberData = [
        {
          provider: 'expensive-provider',
          cost: 999999.99,
          requests: 1000000,
          tokens: 50000000,
        },
      ]

      render(<CostProviderChart data={largeNumberData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].data).toEqual([999999.99])
    })

    it('should handle negative costs', () => {
      const negativeCostData = [
        {
          provider: 'refund-provider',
          cost: -50,
          requests: 100,
          tokens: 1000,
        },
      ]

      render(<CostProviderChart data={negativeCostData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].data).toEqual([-50])
    })

    it('should handle provider with empty string name', () => {
      const emptyNameData = [
        {
          provider: '',
          cost: 100,
          requests: 1000,
          tokens: 50000,
        },
      ]

      render(<CostProviderChart data={emptyNameData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.labels).toEqual([''])
    })

    it('should handle decimal costs correctly', () => {
      const decimalData = [
        { provider: 'provider1', cost: 33.33, requests: 1000, tokens: 50000 },
        { provider: 'provider2', cost: 66.67, requests: 2000, tokens: 100000 },
      ]

      render(<CostProviderChart data={decimalData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].data).toEqual([33.33, 66.67])
    })
  })
})

