import { render, screen } from '@testing-library/react'
import { CostTrendChart } from '@/components/admin/cost-analysis/cost-trend-chart'
import { chartTheme } from '@/lib/charts/theme'

// Mock Chart.js and react-chartjs-2
jest.mock('chart.js', () => ({
  Chart: {
    register: jest.fn(),
  },
}))

jest.mock('react-chartjs-2', () => ({
  Line: ({ data, options }: any) => (
    <div data-testid="line-chart">
      <div data-testid="chart-data">{JSON.stringify(data)}</div>
      <div data-testid="chart-options">{JSON.stringify(options)}</div>
    </div>
  ),
}))

describe('CostTrendChart', () => {
  const mockTrendData = [
    {
      date: '2024-01-15',
      cost: 45.5,
      requests: 500,
      tokens: 25000,
    },
    {
      date: '2024-01-16',
      cost: 52.25,
      requests: 600,
      tokens: 30000,
    },
    {
      date: '2024-01-17',
      cost: 38.75,
      requests: 450,
      tokens: 22000,
    },
  ]

  describe('Rendering', () => {
    it('should render chart with valid data', () => {
      render(<CostTrendChart data={mockTrendData} />)

      expect(screen.getByTestId('line-chart')).toBeInTheDocument()
    })

    it('should show "No data available" message when data is empty', () => {
      render(<CostTrendChart data={[]} />)

      expect(screen.getByText('No data available')).toBeInTheDocument()
      expect(screen.queryByTestId('line-chart')).not.toBeInTheDocument()
    })

    it('should render chart container with proper styling', () => {
      const { container } = render(<CostTrendChart data={mockTrendData} />)

      const chartContainer = container.querySelector('.w-full.h-full')
      expect(chartContainer).toBeInTheDocument()
    })

    it('should display empty state with proper styling', () => {
      render(<CostTrendChart data={[]} />)

      const emptyState = screen.getByText('No data available')
      expect(emptyState).toHaveClass('text-muted-foreground', 'text-sm')
    })
  })

  describe('Data Processing', () => {
    it('should sort data by date in ascending order', () => {
      const unsortedData = [
        { date: '2024-01-17', cost: 38.75, requests: 450, tokens: 22000 },
        { date: '2024-01-15', cost: 45.5, requests: 500, tokens: 25000 },
        { date: '2024-01-16', cost: 52.25, requests: 600, tokens: 30000 },
      ]

      render(<CostTrendChart data={unsortedData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      // Costs should be in order: 45.5, 52.25, 38.75
      expect(parsedData.datasets[0].data).toEqual([45.5, 52.25, 38.75])
    })

    it('should format dates as "Mon DD"', () => {
      render(<CostTrendChart data={mockTrendData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      // Should be formatted like "Jan 15", "Jan 16", "Jan 17"
      expect(parsedData.labels[0]).toMatch(/Jan 1\d/)
      expect(parsedData.labels).toHaveLength(3)
    })

    it('should handle single data point', () => {
      const singlePoint = [mockTrendData[0]]

      render(<CostTrendChart data={singlePoint} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].data).toEqual([45.5])
      expect(parsedData.labels).toHaveLength(1)
    })

    it('should handle data spanning multiple months', () => {
      const multiMonthData = [
        { date: '2024-01-15', cost: 45.5, requests: 500, tokens: 25000 },
        { date: '2024-02-15', cost: 52.25, requests: 600, tokens: 30000 },
        { date: '2024-03-15', cost: 38.75, requests: 450, tokens: 22000 },
      ]

      render(<CostTrendChart data={multiMonthData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.labels[0]).toContain('Jan')
      expect(parsedData.labels[1]).toContain('Feb')
      expect(parsedData.labels[2]).toContain('Mar')
    })

    it('should not mutate original data array', () => {
      const originalData = [...mockTrendData]

      render(<CostTrendChart data={mockTrendData} />)

      expect(mockTrendData).toEqual(originalData)
    })
  })

  describe('Chart Configuration', () => {
    it('should set responsive and maintainAspectRatio options', () => {
      render(<CostTrendChart data={mockTrendData} />)

      const chartOptions = screen.getByTestId('chart-options')
      const parsedOptions = JSON.parse(chartOptions.textContent || '{}')

      expect(parsedOptions.responsive).toBe(true)
      expect(parsedOptions.maintainAspectRatio).toBe(false)
    })

    it('has no legend, because its one series is named by the card title', () => {
      render(<CostTrendChart data={mockTrendData} />)

      const chartOptions = screen.getByTestId('chart-options')
      const parsedOptions = JSON.parse(chartOptions.textContent || '{}')

      expect(parsedOptions.plugins.legend.display).toBe(false)
    })

    it('should style the tooltip as a popover from the chart theme', () => {
      render(<CostTrendChart data={mockTrendData} />)

      const chartOptions = screen.getByTestId('chart-options')
      const parsedOptions = JSON.parse(chartOptions.textContent || '{}')
      const theme = chartTheme('dark')

      expect(parsedOptions.plugins.tooltip.backgroundColor).toBe(theme.tooltip.background)
      expect(parsedOptions.plugins.tooltip.titleColor).toBe(theme.tooltip.text)
      expect(parsedOptions.plugins.tooltip.bodyColor).toBe(theme.tooltip.text)
      expect(parsedOptions.plugins.tooltip.borderColor).toBe(theme.tooltip.border)
      expect(parsedOptions.plugins.tooltip.borderWidth).toBe(1)
      expect(parsedOptions.plugins.tooltip.padding).toBe(12)
      expect(parsedOptions.plugins.tooltip.cornerRadius).toBe(6)
    })

    it('takes the light theme when the mode is light', () => {
      render(<CostTrendChart data={mockTrendData} mode="light" />)

      const parsedData = JSON.parse(screen.getByTestId('chart-data').textContent || '{}')
      expect(parsedData.datasets[0].borderColor).toBe(chartTheme('light').series[0])
    })

    it('should configure y-axis to begin at zero', () => {
      render(<CostTrendChart data={mockTrendData} />)

      const chartOptions = screen.getByTestId('chart-options')
      const parsedOptions = JSON.parse(chartOptions.textContent || '{}')

      expect(parsedOptions.scales.y.beginAtZero).toBe(true)
    })

    it('should configure y-axis ticks styling', () => {
      render(<CostTrendChart data={mockTrendData} />)

      const chartOptions = screen.getByTestId('chart-options')
      const parsedOptions = JSON.parse(chartOptions.textContent || '{}')

      expect(parsedOptions.scales.y.ticks.color).toBe(chartTheme('dark').tick)
      expect(parsedOptions.scales.y.grid.color).toBe(chartTheme('dark').grid)
      expect(parsedOptions.scales.y.ticks.font.size).toBe(11)
    })

    it('should configure x-axis tick rotation', () => {
      render(<CostTrendChart data={mockTrendData} />)

      const chartOptions = screen.getByTestId('chart-options')
      const parsedOptions = JSON.parse(chartOptions.textContent || '{}')

      expect(parsedOptions.scales.x.ticks.maxRotation).toBe(45)
      expect(parsedOptions.scales.x.ticks.minRotation).toBe(45)
    })
  })

  describe('Chart Data', () => {
    it('should label dataset as "Daily Cost"', () => {
      render(<CostTrendChart data={mockTrendData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].label).toBe('Daily Cost')
    })

    it('should include all costs in dataset', () => {
      render(<CostTrendChart data={mockTrendData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].data).toEqual([45.5, 52.25, 38.75])
    })

    it('should set proper line styling', () => {
      render(<CostTrendChart data={mockTrendData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].borderColor).toBe('#cb8315')
      expect(parsedData.datasets[0].backgroundColor).toBe('#cb831529')
      expect(parsedData.datasets[0].borderWidth).toBe(2)
      expect(parsedData.datasets[0].fill).toBe(true)
      expect(parsedData.datasets[0].tension).toBe(0.4)
    })

    it('should configure point styling', () => {
      render(<CostTrendChart data={mockTrendData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].pointRadius).toBe(3)
      expect(parsedData.datasets[0].pointHoverRadius).toBe(5)
      expect(parsedData.datasets[0].pointBackgroundColor).toBe('#cb8315')
      expect(parsedData.datasets[0].pointBorderColor).toBe('#cb8315')
    })
  })

  describe('Tooltip Configuration', () => {
    it('should configure tooltip callbacks', () => {
      render(<CostTrendChart data={mockTrendData} />)

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
          date: '2024-01-15',
          cost: 0,
          requests: 100,
          tokens: 1000,
        },
      ]

      render(<CostTrendChart data={zeroCostData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].data).toEqual([0])
    })

    it('should handle very large numbers', () => {
      const largeNumberData = [
        {
          date: '2024-01-15',
          cost: 999999.99,
          requests: 1000000,
          tokens: 50000000,
        },
      ]

      render(<CostTrendChart data={largeNumberData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].data).toEqual([999999.99])
    })

    it('should handle negative costs', () => {
      const negativeCostData = [
        {
          date: '2024-01-15',
          cost: -50,
          requests: 100,
          tokens: 1000,
        },
      ]

      render(<CostTrendChart data={negativeCostData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].data).toEqual([-50])
    })

    it('labels a day key as that day, with no UTC shift', () => {
      render(<CostTrendChart data={[{ date: '2024-01-15', cost: 45.5, requests: 500, tokens: 25000 }]} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.labels[0]).toBe('Jan 15')
    })

    it('should handle duplicate dates', () => {
      const duplicateDateData = [
        { date: '2024-01-15', cost: 45.5, requests: 500, tokens: 25000 },
        { date: '2024-01-15', cost: 52.25, requests: 600, tokens: 30000 },
      ]

      render(<CostTrendChart data={duplicateDateData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      // Should include both data points
      expect(parsedData.datasets[0].data).toHaveLength(2)
    })

    it('should handle data with gaps in dates', () => {
      const gappedData = [
        { date: '2024-01-01', cost: 45.5, requests: 500, tokens: 25000 },
        { date: '2024-01-15', cost: 52.25, requests: 600, tokens: 30000 },
        { date: '2024-01-30', cost: 38.75, requests: 450, tokens: 22000 },
      ]

      render(<CostTrendChart data={gappedData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      // Should include all data points
      expect(parsedData.datasets[0].data).toHaveLength(3)
    })

    it('should handle very small decimal costs', () => {
      const smallCostData = [
        {
          date: '2024-01-15',
          cost: 0.0001,
          requests: 10,
          tokens: 100,
        },
      ]

      render(<CostTrendChart data={smallCostData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].data).toEqual([0.0001])
    })
  })
})

