import { render, screen } from '@testing-library/react'
import { ActivityTrendChart } from '../activity-trend-chart'
import type { ActivityTrendPoint } from '@/actions/admin'

// Mock Chart.js and react-chartjs-2
jest.mock('chart.js', () => ({
  Chart: {
    register: jest.fn(),
  },
  CategoryScale: jest.fn(),
  LinearScale: jest.fn(),
  PointElement: jest.fn(),
  LineElement: jest.fn(),
  Tooltip: jest.fn(),
  Legend: jest.fn(),
}))

jest.mock('react-chartjs-2', () => ({
  Line: ({ data, options }: { data: unknown; options: unknown }) => (
    <div data-testid="line-chart">
      <div data-testid="chart-data">{JSON.stringify(data)}</div>
      <div data-testid="chart-options">{JSON.stringify(options)}</div>
    </div>
  ),
}))

describe('ActivityTrendChart', () => {
  const mockData: ActivityTrendPoint[] = [
    { date: '2024-01-15', requests: 100, cost: 1.5, tokens: 5000 },
    { date: '2024-01-16', requests: 150, cost: 2.25, tokens: 7500 },
    { date: '2024-01-17', requests: 120, cost: 1.8, tokens: 6000 },
  ]

  describe('Rendering', () => {
    it('should render chart with valid data', () => {
      render(<ActivityTrendChart data={mockData} />)

      expect(screen.getByTestId('activity-trend-chart')).toBeInTheDocument()
      expect(screen.getByTestId('line-chart')).toBeInTheDocument()
    })

    it('should show "No activity data available" message when data is empty', () => {
      render(<ActivityTrendChart data={[]} />)

      expect(screen.getByText('No activity data available')).toBeInTheDocument()
      expect(screen.queryByTestId('line-chart')).not.toBeInTheDocument()
    })

    it('should render chart container with proper styling', () => {
      const { container } = render(<ActivityTrendChart data={mockData} />)

      const chartContainer = container.querySelector('.w-full.h-full')
      expect(chartContainer).toBeInTheDocument()
    })
  })

  describe('Data Processing', () => {
    it('should include requests data in chart', () => {
      render(<ActivityTrendChart data={mockData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].data).toEqual([100, 150, 120])
      expect(parsedData.datasets[0].label).toBe('Requests')
    })

    it('should include cost data in chart', () => {
      render(<ActivityTrendChart data={mockData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[1].data).toEqual([1.5, 2.25, 1.8])
      expect(parsedData.datasets[1].label).toBe('Cost ($)')
    })

    it('should format dates as "Mon DD"', () => {
      render(<ActivityTrendChart data={mockData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.labels).toHaveLength(3)
      expect(parsedData.labels[0]).toMatch(/Jan 1\d/)
    })

    it('should handle single data point', () => {
      const singlePoint = [mockData[0]]

      render(<ActivityTrendChart data={singlePoint} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].data).toEqual([100])
      expect(parsedData.labels).toHaveLength(1)
    })
  })

  describe('Chart Configuration', () => {
    it('should set responsive and maintainAspectRatio options', () => {
      render(<ActivityTrendChart data={mockData} />)

      const chartOptions = screen.getByTestId('chart-options')
      const parsedOptions = JSON.parse(chartOptions.textContent || '{}')

      expect(parsedOptions.responsive).toBe(true)
      expect(parsedOptions.maintainAspectRatio).toBe(false)
    })

    it('should display legend at top', () => {
      render(<ActivityTrendChart data={mockData} />)

      const chartOptions = screen.getByTestId('chart-options')
      const parsedOptions = JSON.parse(chartOptions.textContent || '{}')

      expect(parsedOptions.plugins.legend.display).toBe(true)
      expect(parsedOptions.plugins.legend.position).toBe('top')
    })

    it('should configure dual y-axes', () => {
      render(<ActivityTrendChart data={mockData} />)

      const chartOptions = screen.getByTestId('chart-options')
      const parsedOptions = JSON.parse(chartOptions.textContent || '{}')

      expect(parsedOptions.scales.y).toBeDefined()
      expect(parsedOptions.scales.y1).toBeDefined()
      expect(parsedOptions.scales.y.position).toBe('left')
      expect(parsedOptions.scales.y1.position).toBe('right')
    })

    it('should configure tooltip with custom styling', () => {
      render(<ActivityTrendChart data={mockData} />)

      const chartOptions = screen.getByTestId('chart-options')
      const parsedOptions = JSON.parse(chartOptions.textContent || '{}')

      expect(parsedOptions.plugins.tooltip.backgroundColor).toBe('#1e293b')
      expect(parsedOptions.plugins.tooltip.titleColor).toBe('#cbd5e1')
      expect(parsedOptions.plugins.tooltip.bodyColor).toBe('#e2e8f0')
    })
  })

  describe('Chart Styling', () => {
    it('should use purple color for requests line', () => {
      render(<ActivityTrendChart data={mockData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].borderColor).toBe('#a855f7')
    })

    it('should use green color for cost line', () => {
      render(<ActivityTrendChart data={mockData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[1].borderColor).toBe('#22c55e')
    })

    it('should configure smooth line tension', () => {
      render(<ActivityTrendChart data={mockData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].tension).toBe(0.4)
      expect(parsedData.datasets[1].tension).toBe(0.4)
    })
  })

  describe('Edge Cases', () => {
    it('should handle zero values', () => {
      const zeroData: ActivityTrendPoint[] = [
        { date: '2024-01-15', requests: 0, cost: 0, tokens: 0 },
      ]

      render(<ActivityTrendChart data={zeroData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].data).toEqual([0])
      expect(parsedData.datasets[1].data).toEqual([0])
    })

    it('should handle large numbers', () => {
      const largeData: ActivityTrendPoint[] = [
        { date: '2024-01-15', requests: 1000000, cost: 9999.99, tokens: 50000000 },
      ]

      render(<ActivityTrendChart data={largeData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].data).toEqual([1000000])
      expect(parsedData.datasets[1].data).toEqual([9999.99])
    })
  })
})
