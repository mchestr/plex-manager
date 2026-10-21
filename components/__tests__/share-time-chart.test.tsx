import { render, screen } from '@testing-library/react'
import { ShareTimeChart } from '@/components/admin/shares/share-time-chart'
import { ShareTimeSeriesData } from '@/actions/share-analytics'

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

describe('ShareTimeChart', () => {
  const mockData: ShareTimeSeriesData[] = [
    {
      date: '2024-01-15',
      shares: 5,
      visits: 25,
    },
    {
      date: '2024-01-16',
      shares: 8,
      visits: 40,
    },
    {
      date: '2024-01-17',
      shares: 3,
      visits: 15,
    },
  ]

  describe('Rendering', () => {
    it('should render chart with valid data', () => {
      render(<ShareTimeChart data={mockData} />)

      expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
    })

    it('should show "No data available" message when data is empty', () => {
      render(<ShareTimeChart data={[]} />)

      expect(screen.getByText('No data available')).toBeInTheDocument()
      expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument()
    })

    it('should render chart container with proper styling', () => {
      const { container } = render(<ShareTimeChart data={mockData} />)

      const chartContainer = container.querySelector('.w-full')
      expect(chartContainer).toBeInTheDocument()
      expect(chartContainer).toHaveStyle({ height: '250px' })
    })

    it('should display empty state with proper styling and height', () => {
      const { container } = render(<ShareTimeChart data={[]} />)

      const emptyState = screen.getByText('No data available')
      expect(emptyState).toHaveClass('text-muted-foreground', 'text-sm')

      const emptyContainer = container.querySelector('.flex.items-center.justify-center')
      expect(emptyContainer).toBeInTheDocument()
      expect(emptyContainer).toHaveStyle({ height: '250px' })
    })

    it('should apply custom height prop', () => {
      const { container } = render(<ShareTimeChart data={mockData} height={400} />)

      const chartContainer = container.querySelector('.w-full')
      expect(chartContainer).toHaveStyle({ height: '400px' })
    })

    it('should apply custom height to empty state', () => {
      const { container } = render(<ShareTimeChart data={[]} height={400} />)

      const emptyContainer = container.querySelector('.flex.items-center.justify-center')
      expect(emptyContainer).toHaveStyle({ height: '400px' })
    })
  })

  describe('Data Processing', () => {
    it('should format dates as "Mon DD"', () => {
      render(<ShareTimeChart data={mockData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      // Should be formatted like "Jan 15", "Jan 16", "Jan 17"
      expect(parsedData.labels[0]).toMatch(/Jan 1\d/)
      expect(parsedData.labels).toHaveLength(3)
    })

    it('should handle single data point', () => {
      const singlePoint = [mockData[0]]

      render(<ShareTimeChart data={singlePoint} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].data).toEqual([25])
      expect(parsedData.datasets[1].data).toEqual([5])
      expect(parsedData.labels).toHaveLength(1)
    })

    it('should handle data spanning multiple months', () => {
      const multiMonthData: ShareTimeSeriesData[] = [
        { date: '2024-01-15', shares: 5, visits: 25 },
        { date: '2024-02-15', shares: 8, visits: 40 },
        { date: '2024-03-15', shares: 3, visits: 15 },
      ]

      render(<ShareTimeChart data={multiMonthData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.labels[0]).toContain('Jan')
      expect(parsedData.labels[1]).toContain('Feb')
      expect(parsedData.labels[2]).toContain('Mar')
    })

    it('should not mutate original data array', () => {
      const originalData = [...mockData]

      render(<ShareTimeChart data={mockData} />)

      expect(mockData).toEqual(originalData)
    })

    it('labels a day key as that day, with no UTC shift', () => {
      render(<ShareTimeChart data={[{ date: '2024-01-15', shares: 5, visits: 25 }]} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.labels[0]).toBe('Jan 15')
    })
  })

  describe('Chart Configuration', () => {
    it('should set responsive and maintainAspectRatio options', () => {
      render(<ShareTimeChart data={mockData} />)

      const chartOptions = screen.getByTestId('chart-options')
      const parsedOptions = JSON.parse(chartOptions.textContent || '{}')

      expect(parsedOptions.responsive).toBe(true)
      expect(parsedOptions.maintainAspectRatio).toBe(false)
    })

    it('should display legend at top', () => {
      render(<ShareTimeChart data={mockData} />)

      const chartOptions = screen.getByTestId('chart-options')
      const parsedOptions = JSON.parse(chartOptions.textContent || '{}')

      expect(parsedOptions.plugins.legend.position).toBe('top')
    })

    it('should configure legend labels with proper styling', () => {
      render(<ShareTimeChart data={mockData} />)

      const chartOptions = screen.getByTestId('chart-options')
      const parsedOptions = JSON.parse(chartOptions.textContent || '{}')

      expect(parsedOptions.plugins.legend.labels.color).toBe('#94a3b8')
      expect(parsedOptions.plugins.legend.labels.font.size).toBe(12)
      expect(parsedOptions.plugins.legend.labels.usePointStyle).toBe(true)
      expect(parsedOptions.plugins.legend.labels.padding).toBe(15)
    })

    it('should configure tooltip with custom styling', () => {
      render(<ShareTimeChart data={mockData} />)

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

    it('should configure y-axis to begin at zero', () => {
      render(<ShareTimeChart data={mockData} />)

      const chartOptions = screen.getByTestId('chart-options')
      const parsedOptions = JSON.parse(chartOptions.textContent || '{}')

      expect(parsedOptions.scales.y.beginAtZero).toBe(true)
    })

    it('should configure y-axis ticks styling', () => {
      render(<ShareTimeChart data={mockData} />)

      const chartOptions = screen.getByTestId('chart-options')
      const parsedOptions = JSON.parse(chartOptions.textContent || '{}')

      expect(parsedOptions.scales.y.ticks.color).toBe('#94a3b8')
      expect(parsedOptions.scales.y.ticks.font.size).toBe(11)
    })

    it('should configure x-axis tick rotation', () => {
      render(<ShareTimeChart data={mockData} />)

      const chartOptions = screen.getByTestId('chart-options')
      const parsedOptions = JSON.parse(chartOptions.textContent || '{}')

      expect(parsedOptions.scales.x.ticks.maxRotation).toBe(45)
      expect(parsedOptions.scales.x.ticks.minRotation).toBe(45)
    })

    it('should enable stacked mode for both axes', () => {
      render(<ShareTimeChart data={mockData} />)

      const chartOptions = screen.getByTestId('chart-options')
      const parsedOptions = JSON.parse(chartOptions.textContent || '{}')

      expect(parsedOptions.scales.x.stacked).toBe(true)
      expect(parsedOptions.scales.y.stacked).toBe(true)
    })

    it('should configure grid styling', () => {
      render(<ShareTimeChart data={mockData} />)

      const chartOptions = screen.getByTestId('chart-options')
      const parsedOptions = JSON.parse(chartOptions.textContent || '{}')

      expect(parsedOptions.scales.x.grid.color).toBe('rgba(71, 85, 105, 0.3)')
      expect(parsedOptions.scales.y.grid.color).toBe('rgba(71, 85, 105, 0.3)')
    })

    it('should hide axis borders', () => {
      render(<ShareTimeChart data={mockData} />)

      const chartOptions = screen.getByTestId('chart-options')
      const parsedOptions = JSON.parse(chartOptions.textContent || '{}')

      expect(parsedOptions.scales.x.border.display).toBe(false)
      expect(parsedOptions.scales.y.border.display).toBe(false)
    })
  })

  describe('Chart Data - Visits Dataset', () => {
    it('should label first dataset as "Visits"', () => {
      render(<ShareTimeChart data={mockData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].label).toBe('Visits')
    })

    it('should include all visits in first dataset', () => {
      render(<ShareTimeChart data={mockData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].data).toEqual([25, 40, 15])
    })

    it('should set proper visits bar styling', () => {
      render(<ShareTimeChart data={mockData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].backgroundColor).toBe('#22c55e')
      expect(parsedData.datasets[0].borderColor).toBe('#16a34a')
      expect(parsedData.datasets[0].borderWidth).toBe(0)
    })

    it('should set flat border radius for visits bars', () => {
      render(<ShareTimeChart data={mockData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].borderRadius).toEqual({
        topLeft: 0,
        topRight: 0,
        bottomLeft: 0,
        bottomRight: 0,
      })
    })
  })

  describe('Chart Data - Shares Dataset', () => {
    it('should label second dataset as "Shares"', () => {
      render(<ShareTimeChart data={mockData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[1].label).toBe('Shares')
    })

    it('should include all shares in second dataset', () => {
      render(<ShareTimeChart data={mockData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[1].data).toEqual([5, 8, 3])
    })

    it('should set proper shares bar styling', () => {
      render(<ShareTimeChart data={mockData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[1].backgroundColor).toBe('#06b6d4')
      expect(parsedData.datasets[1].borderColor).toBe('#0891b2')
      expect(parsedData.datasets[1].borderWidth).toBe(0)
    })

    it('should set rounded top border radius for shares bars', () => {
      render(<ShareTimeChart data={mockData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[1].borderRadius).toEqual({
        topLeft: 4,
        topRight: 4,
        bottomLeft: 0,
        bottomRight: 0,
      })
    })
  })

  describe('Edge Cases', () => {
    it('should handle zero shares and visits', () => {
      const zeroData: ShareTimeSeriesData[] = [
        {
          date: '2024-01-15',
          shares: 0,
          visits: 0,
        },
      ]

      render(<ShareTimeChart data={zeroData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].data).toEqual([0])
      expect(parsedData.datasets[1].data).toEqual([0])
    })

    it('should handle very large numbers', () => {
      const largeNumberData: ShareTimeSeriesData[] = [
        {
          date: '2024-01-15',
          shares: 999999,
          visits: 5000000,
        },
      ]

      render(<ShareTimeChart data={largeNumberData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].data).toEqual([5000000])
      expect(parsedData.datasets[1].data).toEqual([999999])
    })

    it('should handle data with gaps in dates', () => {
      const gappedData: ShareTimeSeriesData[] = [
        { date: '2024-01-01', shares: 5, visits: 25 },
        { date: '2024-01-15', shares: 8, visits: 40 },
        { date: '2024-01-30', shares: 3, visits: 15 },
      ]

      render(<ShareTimeChart data={gappedData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      // Should include all data points
      expect(parsedData.datasets[0].data).toHaveLength(3)
      expect(parsedData.datasets[1].data).toHaveLength(3)
    })

    it('should handle shares without visits', () => {
      const sharesOnlyData: ShareTimeSeriesData[] = [
        {
          date: '2024-01-15',
          shares: 10,
          visits: 0,
        },
      ]

      render(<ShareTimeChart data={sharesOnlyData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].data).toEqual([0])
      expect(parsedData.datasets[1].data).toEqual([10])
    })

    it('should handle visits without shares', () => {
      const visitsOnlyData: ShareTimeSeriesData[] = [
        {
          date: '2024-01-15',
          shares: 0,
          visits: 50,
        },
      ]

      render(<ShareTimeChart data={visitsOnlyData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].data).toEqual([50])
      expect(parsedData.datasets[1].data).toEqual([0])
    })

    it('should handle data with same date multiple times', () => {
      const duplicateDateData: ShareTimeSeriesData[] = [
        { date: '2024-01-15', shares: 5, visits: 25 },
        { date: '2024-01-15', shares: 8, visits: 40 },
      ]

      render(<ShareTimeChart data={duplicateDateData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      // Should include both data points
      expect(parsedData.datasets[0].data).toHaveLength(2)
      expect(parsedData.datasets[1].data).toHaveLength(2)
    })

    it('should handle negative values gracefully', () => {
      const negativeData: ShareTimeSeriesData[] = [
        {
          date: '2024-01-15',
          shares: -5,
          visits: -25,
        },
      ]

      render(<ShareTimeChart data={negativeData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].data).toEqual([-25])
      expect(parsedData.datasets[1].data).toEqual([-5])
    })

    it('should handle very small height values', () => {
      const { container } = render(<ShareTimeChart data={mockData} height={50} />)

      const chartContainer = container.querySelector('.w-full')
      expect(chartContainer).toHaveStyle({ height: '50px' })
    })

    it('should handle very large height values', () => {
      const { container } = render(<ShareTimeChart data={mockData} height={2000} />)

      const chartContainer = container.querySelector('.w-full')
      expect(chartContainer).toHaveStyle({ height: '2000px' })
    })
  })

  describe('Integration', () => {
    it('should render both datasets with correct data', () => {
      render(<ShareTimeChart data={mockData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets).toHaveLength(2)
      expect(parsedData.datasets[0].label).toBe('Visits')
      expect(parsedData.datasets[1].label).toBe('Shares')
      expect(parsedData.datasets[0].data).toEqual([25, 40, 15])
      expect(parsedData.datasets[1].data).toEqual([5, 8, 3])
    })

    it('should maintain data order consistency', () => {
      render(<ShareTimeChart data={mockData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      // Ensure labels and data are in same order
      expect(parsedData.labels).toHaveLength(3)
      expect(parsedData.datasets[0].data).toHaveLength(3)
      expect(parsedData.datasets[1].data).toHaveLength(3)
    })

    it('should apply all configuration options correctly', () => {
      render(<ShareTimeChart data={mockData} height={300} />)

      const chartOptions = screen.getByTestId('chart-options')
      const parsedOptions = JSON.parse(chartOptions.textContent || '{}')

      // Verify key configuration options
      expect(parsedOptions.responsive).toBe(true)
      expect(parsedOptions.maintainAspectRatio).toBe(false)
      expect(parsedOptions.scales.x.stacked).toBe(true)
      expect(parsedOptions.scales.y.stacked).toBe(true)
      expect(parsedOptions.scales.y.beginAtZero).toBe(true)
      expect(parsedOptions.plugins.legend.position).toBe('top')
    })

    it('should handle re-render with different data', () => {
      const { rerender } = render(<ShareTimeChart data={mockData} />)

      const newData: ShareTimeSeriesData[] = [
        { date: '2024-02-01', shares: 10, visits: 50 },
      ]

      rerender(<ShareTimeChart data={newData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.datasets[0].data).toEqual([50])
      expect(parsedData.datasets[1].data).toEqual([10])
    })

    it('should handle re-render from data to empty', () => {
      const { rerender } = render(<ShareTimeChart data={mockData} />)

      rerender(<ShareTimeChart data={[]} />)

      expect(screen.getByText('No data available')).toBeInTheDocument()
      expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument()
    })

    it('should handle re-render from empty to data', () => {
      const { rerender } = render(<ShareTimeChart data={[]} />)

      rerender(<ShareTimeChart data={mockData} />)

      expect(screen.queryByText('No data available')).not.toBeInTheDocument()
      expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
    })

    it('should handle re-render with different height', () => {
      const { container, rerender } = render(<ShareTimeChart data={mockData} height={250} />)

      rerender(<ShareTimeChart data={mockData} height={400} />)

      const chartContainer = container.querySelector('.w-full')
      expect(chartContainer).toHaveStyle({ height: '400px' })
    })
  })

  describe('Accessibility', () => {
    it('should have proper text contrast in empty state', () => {
      render(<ShareTimeChart data={[]} />)

      const message = screen.getByText('No data available')
      expect(message).toHaveClass('text-muted-foreground')
    })

    it('should render chart in a container with proper structure', () => {
      const { container } = render(<ShareTimeChart data={mockData} />)

      const chartContainer = container.querySelector('.w-full')
      expect(chartContainer).toBeInTheDocument()
    })

    it('should maintain consistent styling across renders', () => {
      const { rerender } = render(<ShareTimeChart data={mockData} />)

      const chartData1 = screen.getByTestId('chart-data')
      const parsedData1 = JSON.parse(chartData1.textContent || '{}')

      rerender(<ShareTimeChart data={mockData} />)

      const chartData2 = screen.getByTestId('chart-data')
      const parsedData2 = JSON.parse(chartData2.textContent || '{}')

      expect(parsedData1.datasets[0].backgroundColor).toBe(parsedData2.datasets[0].backgroundColor)
      expect(parsedData1.datasets[1].backgroundColor).toBe(parsedData2.datasets[1].backgroundColor)
    })
  })

  describe('Date Formatting', () => {
    it('should format dates with short month names', () => {
      const monthData: ShareTimeSeriesData[] = [
        { date: '2024-01-15', shares: 1, visits: 5 },
        { date: '2024-02-15', shares: 2, visits: 10 },
        { date: '2024-03-15', shares: 3, visits: 15 },
        { date: '2024-04-15', shares: 4, visits: 20 },
        { date: '2024-05-15', shares: 5, visits: 25 },
        { date: '2024-06-15', shares: 6, visits: 30 },
        { date: '2024-07-15', shares: 7, visits: 35 },
        { date: '2024-08-15', shares: 8, visits: 40 },
        { date: '2024-09-15', shares: 9, visits: 45 },
        { date: '2024-10-15', shares: 10, visits: 50 },
        { date: '2024-11-15', shares: 11, visits: 55 },
        { date: '2024-12-15', shares: 12, visits: 60 },
      ]

      render(<ShareTimeChart data={monthData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      // Check that all months are represented
      expect(parsedData.labels).toHaveLength(12)
      expect(parsedData.labels[0]).toContain('Jan')
      expect(parsedData.labels[11]).toContain('Dec')
    })

    it('should handle year boundaries', () => {
      const yearBoundaryData: ShareTimeSeriesData[] = [
        { date: '2023-12-15', shares: 5, visits: 25 },
        { date: '2024-01-15', shares: 8, visits: 40 },
      ]

      render(<ShareTimeChart data={yearBoundaryData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      expect(parsedData.labels).toHaveLength(2)
      expect(parsedData.labels[0]).toContain('Dec')
      expect(parsedData.labels[1]).toContain('Jan')
    })

    it('should use en-US locale for date formatting', () => {
      render(<ShareTimeChart data={mockData} />)

      const chartData = screen.getByTestId('chart-data')
      const parsedData = JSON.parse(chartData.textContent || '{}')

      // en-US format should be "Jan 15" not "15 Jan"
      expect(parsedData.labels[0]).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/)
    })
  })
})

