import { render, screen } from '@testing-library/react'
import { CostModelChart } from '@/components/admin/cost-analysis/cost-model-chart'

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

describe('CostModelChart', () => {
  const mockModelData = [
    {
      model: 'gpt-4',
      cost: 150.5,
      requests: 1000,
      tokens: 50000,
    },
    {
      model: 'gpt-3.5-turbo',
      cost: 45.25,
      requests: 2000,
      tokens: 80000,
    },
    {
      model: 'claude-3-opus',
      cost: 120.75,
      requests: 800,
      tokens: 40000,
    },
  ]

  describe('Rendering', () => {
    it('should render chart with valid data', () => {
      render(<CostModelChart data={mockModelData} />)

      expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
    })

    it('should show "No data available" message when data is empty', () => {
      render(<CostModelChart data={[]} />)

      expect(screen.getByText('No data available')).toBeInTheDocument()
      expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument()
    })

    it('should render chart container with proper styling', () => {
      const { container } = render(<CostModelChart data={mockModelData} />)

      const chartContainer = container.querySelector('.w-full.h-full')
      expect(chartContainer).toBeInTheDocument()
    })

    it('should display empty state with proper styling', () => {
      render(<CostModelChart data={[]} />)

      const emptyState = screen.getByText('No data available')
      expect(emptyState).toHaveClass('text-muted-foreground', 'text-sm')
    })
  })

  describe('Data Processing', () => {
    it('should limit display to top 10 models', () => {
      const manyModels = Array.from({ length: 15 }, (_, i) => ({
        model: `model-${i}`,
        cost: 100 - i,
        requests: 1000,
        tokens: 50000,
      }))

      render(<CostModelChart data={manyModels} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      // Should only have 10 labels
      expect(parsedData.labels).toHaveLength(10)
    })

    it('should truncate long model names', () => {
      const longNameData = [
        {
          model: 'this-is-a-very-long-model-name-that-should-be-truncated',
          cost: 100,
          requests: 1000,
          tokens: 50000,
        },
      ]

      render(<CostModelChart data={longNameData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      // Should be truncated with ellipsis
      expect(parsedData.labels[0]).toMatch(/\.\.\./)
      expect(parsedData.labels[0].length).toBeLessThanOrEqual(20)
    })

    it('should not truncate short model names', () => {
      const shortNameData = [
        {
          model: 'gpt-4',
          cost: 100,
          requests: 1000,
          tokens: 50000,
        },
      ]

      render(<CostModelChart data={shortNameData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.labels[0]).toBe('gpt-4')
    })

    it('should handle model with null name', () => {
      const nullNameData = [
        {
          model: null as any,
          cost: 100,
          requests: 1000,
          tokens: 50000,
        },
      ]

      render(<CostModelChart data={nullNameData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.labels[0]).toBe('unknown')
    })

    it('should handle model with undefined name', () => {
      const undefinedNameData = [
        {
          model: undefined as any,
          cost: 100,
          requests: 1000,
          tokens: 50000,
        },
      ]

      render(<CostModelChart data={undefinedNameData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.labels[0]).toBe('unknown')
    })
  })

  describe('Chart Configuration', () => {
    it('should configure horizontal bar chart', () => {
      render(<CostModelChart data={mockModelData} />)

      const chartOptions = screen.getByTestId('chart-options')
      const parsedOptions = JSON.parse(chartOptions.textContent || '{}')

      expect(parsedOptions.indexAxis).toBe('y')
    })

    it('should set responsive and maintainAspectRatio options', () => {
      render(<CostModelChart data={mockModelData} />)

      const chartOptions = screen.getByTestId('chart-options')
      const parsedOptions = JSON.parse(chartOptions.textContent || '{}')

      expect(parsedOptions.responsive).toBe(true)
      expect(parsedOptions.maintainAspectRatio).toBe(false)
    })

    it('should hide legend', () => {
      render(<CostModelChart data={mockModelData} />)

      const chartOptions = screen.getByTestId('chart-options')
      const parsedOptions = JSON.parse(chartOptions.textContent || '{}')

      expect(parsedOptions.plugins.legend.display).toBe(false)
    })

    it('should configure tooltip with custom styling', () => {
      render(<CostModelChart data={mockModelData} />)

      const chartOptions = screen.getByTestId('chart-options')
      const parsedOptions = JSON.parse(chartOptions.textContent || '{}')

      expect(parsedOptions.plugins.tooltip.backgroundColor).toBe('#1e293b')
      expect(parsedOptions.plugins.tooltip.borderColor).toBe('#475569')
      expect(parsedOptions.plugins.tooltip.borderWidth).toBe(1)
    })

    it('should configure x-axis to begin at zero', () => {
      render(<CostModelChart data={mockModelData} />)

      const chartOptions = screen.getByTestId('chart-options')
      const parsedOptions = JSON.parse(chartOptions.textContent || '{}')

      expect(parsedOptions.scales.x.beginAtZero).toBe(true)
    })

    it('should configure x-axis ticks styling', () => {
      render(<CostModelChart data={mockModelData} />)

      const chartOptions = screen.getByTestId('chart-options')
      const parsedOptions = JSON.parse(chartOptions.textContent || '{}')

      expect(parsedOptions.scales.x.ticks.color).toBe('#94a3b8')
      expect(parsedOptions.scales.x.ticks.font.size).toBe(11)
    })
  })

  describe('Chart Data', () => {
    it('should include all model costs in dataset', () => {
      render(<CostModelChart data={mockModelData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].data).toEqual([150.5, 45.25, 120.75])
    })

    it('should set proper colors for bars', () => {
      render(<CostModelChart data={mockModelData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].backgroundColor).toBe('rgba(34, 197, 94, 0.8)')
      expect(parsedData.datasets[0].borderColor).toBe('#22c55e')
      expect(parsedData.datasets[0].borderWidth).toBe(1)
    })

    it('should set border radius for bars', () => {
      render(<CostModelChart data={mockModelData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].borderRadius).toBe(4)
    })

    it('should label dataset as "Cost"', () => {
      render(<CostModelChart data={mockModelData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].label).toBe('Cost')
    })
  })

  describe('Tooltip Configuration', () => {
    it('should configure tooltip callbacks', () => {
      render(<CostModelChart data={mockModelData} />)

      const chartOptions = screen.getByTestId('chart-options')
      const parsedOptions = JSON.parse(chartOptions.textContent || '{}')

      // Verify tooltip callbacks exist (functions can't be serialized to JSON)
      expect(parsedOptions.plugins.tooltip.callbacks).toBeDefined()
    })
  })

  describe('Edge Cases', () => {
    it('should handle single model data', () => {
      const singleModel = [mockModelData[0]]

      render(<CostModelChart data={singleModel} />)

      expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
    })

    it('should handle zero cost', () => {
      const zeroCostData = [
        {
          model: 'free-model',
          cost: 0,
          requests: 100,
          tokens: 1000,
        },
      ]

      render(<CostModelChart data={zeroCostData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].data).toEqual([0])
    })

    it('should handle zero requests', () => {
      const zeroRequestsData = [
        {
          model: 'unused-model',
          cost: 100,
          requests: 0,
          tokens: 0,
        },
      ]

      render(<CostModelChart data={zeroRequestsData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      // Should render without crashing
      expect(parsedData.datasets[0].data).toEqual([100])
    })

    it('should handle very large numbers', () => {
      const largeNumberData = [
        {
          model: 'expensive-model',
          cost: 999999.99,
          requests: 1000000,
          tokens: 50000000,
        },
      ]

      render(<CostModelChart data={largeNumberData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].data).toEqual([999999.99])
    })

    it('should handle negative costs', () => {
      const negativeCostData = [
        {
          model: 'refund-model',
          cost: -50,
          requests: 100,
          tokens: 1000,
        },
      ]

      render(<CostModelChart data={negativeCostData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].data).toEqual([-50])
    })
  })
})

