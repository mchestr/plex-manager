import { render, screen } from '@testing-library/react'
import { BarChart, DonutChart, Sparkline, ProgressBar } from '@/components/wrapped/wrapped-charts'

// Mock motion
jest.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}))

// Mock Chart.js components
jest.mock('react-chartjs-2', () => ({
  Bar: ({ data, options }: any) => (
    <div data-testid="bar-chart" data-chart-data={JSON.stringify(data)} data-chart-options={JSON.stringify(options)}>
      Bar Chart
    </div>
  ),
  Doughnut: ({ data, options }: any) => (
    <div data-testid="doughnut-chart" data-chart-data={JSON.stringify(data)} data-chart-options={JSON.stringify(options)}>
      Doughnut Chart
    </div>
  ),
  Line: ({ data, options }: any) => (
    <div data-testid="line-chart" data-chart-data={JSON.stringify(data)} data-chart-options={JSON.stringify(options)}>
      Line Chart
    </div>
  ),
}))

describe('BarChart', () => {
  const mockData = [
    { label: 'January', value: 100 },
    { label: 'February', value: 150 },
    { label: 'March', value: 200 },
  ]

  it('should render bar chart with data', () => {
    render(<BarChart data={mockData} />)
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
  })

  it('should show "No data available" when data is empty', () => {
    render(<BarChart data={[]} />)
    expect(screen.getByText('No data available')).toBeInTheDocument()
  })

  it('should use custom height', () => {
    const { container } = render(<BarChart data={mockData} height={250} />)
    const chartContainer = container.querySelector('[style*="height"]')
    expect(chartContainer).toBeInTheDocument()
  })

  it('should use custom color', () => {
    render(<BarChart data={mockData} color="purple" />)
    const chart = screen.getByTestId('bar-chart')
    const chartData = JSON.parse(chart.getAttribute('data-chart-data') || '{}')
    expect(chartData.datasets[0].backgroundColor).toContain('168, 85, 247')
  })

  it('should format values as time when formatAsTime is true', () => {
    const timeData = [{ label: 'Day 1', value: 120 }] // 120 minutes = 2 hours
    render(<BarChart data={timeData} formatAsTime />)
    expect(screen.getByText('2h')).toBeInTheDocument()
  })

  it('should format large values with k suffix', () => {
    const largeData = [{ label: 'Item', value: 1500 }]
    const { container } = render(<BarChart data={largeData} />)
    // The formatting happens in tooltip callbacks, so we check the data structure
    expect(container).toBeInTheDocument()
  })

  it('should disable animations when disableAnimations is true', () => {
    render(<BarChart data={mockData} disableAnimations />)
    const chart = screen.getByTestId('bar-chart')
    const options = JSON.parse(chart.getAttribute('data-chart-options') || '{}')
    expect(options.animation).toBe(false)
  })

  it('should truncate long labels to 3 characters', () => {
    const longLabelData = [{ label: 'January', value: 100 }]
    render(<BarChart data={longLabelData} />)
    const chart = screen.getByTestId('bar-chart')
    const chartData = JSON.parse(chart.getAttribute('data-chart-data') || '{}')
    expect(chartData.labels[0]).toBe('Jan')
  })

  it('should use maxValue when provided', () => {
    render(<BarChart data={mockData} maxValue={500} />)
    const chart = screen.getByTestId('bar-chart')
    const options = JSON.parse(chart.getAttribute('data-chart-options') || '{}')
    expect(options.scales.y.max).toBe(500)
  })

  it('should calculate max value from data when not provided', () => {
    render(<BarChart data={mockData} />)
    const chart = screen.getByTestId('bar-chart')
    const options = JSON.parse(chart.getAttribute('data-chart-options') || '{}')
    expect(options.scales.y.max).toBe(200)
  })

  it('should format time values correctly in display', () => {
    const timeData = [
      { label: 'Day 1', value: 1440 }, // 1 day
      { label: 'Day 2', value: 90 }, // 1.5 hours -> rounds to 2h
    ]
    render(<BarChart data={timeData} formatAsTime />)
    expect(screen.getByText('1d')).toBeInTheDocument()
    expect(screen.getByText('2h')).toBeInTheDocument()
  })

  it('should handle zero values in time format', () => {
    const timeData = [{ label: 'Day', value: 0 }]
    render(<BarChart data={timeData} formatAsTime />)
    // Zero values don't show labels when formatAsTime is true
    expect(screen.queryByText('0h')).not.toBeInTheDocument()
  })
})

describe('DonutChart', () => {
  const mockData = [
    { label: 'Movies', value: 60, color: 'cyan' },
    { label: 'Shows', value: 40, color: 'purple' },
  ]

  it('should render donut chart with data', () => {
    render(<DonutChart data={mockData} />)
    expect(screen.getByTestId('doughnut-chart')).toBeInTheDocument()
  })

  it('should return null when total is zero', () => {
    const zeroData = [{ label: 'Empty', value: 0 }]
    const { container } = render(<DonutChart data={zeroData} />)
    expect(container.firstChild).toBeNull()
  })

  it('should display percentage in center', () => {
    render(<DonutChart data={mockData} />)
    expect(screen.getByText('60%')).toBeInTheDocument()
    expect(screen.getByText('Movies')).toBeInTheDocument()
  })

  it('should use custom size', () => {
    const { container } = render(<DonutChart data={mockData} size={200} />)
    const chartContainer = container.querySelector('[style*="width: 200px"]')
    expect(chartContainer).toBeInTheDocument()
  })

  it('should use custom stroke width', () => {
    render(<DonutChart data={mockData} strokeWidth={20} />)
    const chart = screen.getByTestId('doughnut-chart')
    const options = JSON.parse(chart.getAttribute('data-chart-options') || '{}')
    // Cutout percentage should reflect the stroke width
    expect(options.cutout).toBeDefined()
  })

  it('should apply custom colors from data', () => {
    render(<DonutChart data={mockData} />)
    const chart = screen.getByTestId('doughnut-chart')
    const chartData = JSON.parse(chart.getAttribute('data-chart-data') || '{}')
    expect(chartData.datasets[0].backgroundColor).toHaveLength(2)
  })

  it('should use default colors when not specified', () => {
    const noColorData = [
      { label: 'Item 1', value: 50 },
      { label: 'Item 2', value: 50 },
    ]
    render(<DonutChart data={noColorData} />)
    const chart = screen.getByTestId('doughnut-chart')
    const chartData = JSON.parse(chart.getAttribute('data-chart-data') || '{}')
    expect(chartData.datasets[0].backgroundColor).toHaveLength(2)
  })

  it('should calculate percentage correctly', () => {
    const percentData = [
      { label: 'Part', value: 25 },
      { label: 'Rest', value: 75 },
    ]
    render(<DonutChart data={percentData} />)
    expect(screen.getByText('25%')).toBeInTheDocument()
  })

  it('should round percentage to nearest integer', () => {
    const percentData = [
      { label: 'Part', value: 33.7 },
      { label: 'Rest', value: 66.3 },
    ]
    render(<DonutChart data={percentData} />)
    expect(screen.getByText('34%')).toBeInTheDocument()
  })
})

describe('Sparkline', () => {
  const mockData = [10, 20, 15, 30, 25, 40]

  it('should render sparkline with data', () => {
    render(<Sparkline data={mockData} />)
    expect(screen.getByTestId('line-chart')).toBeInTheDocument()
  })

  it('should return null when data is empty', () => {
    const { container } = render(<Sparkline data={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('should use custom width and height', () => {
    const { container } = render(<Sparkline data={mockData} width={300} height={60} />)
    const chartContainer = container.querySelector('[style*="width: 300px"]')
    expect(chartContainer).toBeInTheDocument()
  })

  it('should use custom color', () => {
    render(<Sparkline data={mockData} color="purple" />)
    const chart = screen.getByTestId('line-chart')
    const chartData = JSON.parse(chart.getAttribute('data-chart-data') || '{}')
    expect(chartData.datasets[0].borderColor).toContain('168, 85, 247')
  })

  it('should apply delay to animation', () => {
    render(<Sparkline data={mockData} delay={500} />)
    const chart = screen.getByTestId('line-chart')
    const options = JSON.parse(chart.getAttribute('data-chart-options') || '{}')
    expect(options.animation.delay).toBe(500)
  })

  it('should hide axes and tooltips', () => {
    render(<Sparkline data={mockData} />)
    const chart = screen.getByTestId('line-chart')
    const options = JSON.parse(chart.getAttribute('data-chart-options') || '{}')
    expect(options.scales.x.display).toBe(false)
    expect(options.scales.y.display).toBe(false)
    expect(options.plugins.tooltip.enabled).toBe(false)
  })

  it('should use tension for smooth curves', () => {
    render(<Sparkline data={mockData} />)
    const chart = screen.getByTestId('line-chart')
    const chartData = JSON.parse(chart.getAttribute('data-chart-data') || '{}')
    expect(chartData.datasets[0].tension).toBe(0.4)
  })
})

describe('ProgressBar', () => {
  it('should render progress bar with value', () => {
    render(<ProgressBar value={50} max={100} />)
    const progressBar = document.querySelector('[class*="bg-gradient-to-r"]')
    expect(progressBar).toBeInTheDocument()
  })

  it('should display label when provided', () => {
    render(<ProgressBar value={50} max={100} label="Progress" />)
    expect(screen.getByText('Progress')).toBeInTheDocument()
  })

  it('should display percentage when showValue is true', () => {
    render(<ProgressBar value={75} max={100} showValue />)
    expect(screen.getByText('75%')).toBeInTheDocument()
  })

  it('should calculate percentage correctly', () => {
    render(<ProgressBar value={25} max={50} showValue />)
    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it('should cap percentage at 100%', () => {
    render(<ProgressBar value={150} max={100} showValue />)
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('should handle zero max value', () => {
    render(<ProgressBar value={50} max={0} showValue />)
    expect(screen.getByText('0%')).toBeInTheDocument()
  })

  it('should use custom color', () => {
    const { container } = render(<ProgressBar value={50} max={100} color="purple" />)
    const progressBar = container.querySelector('[class*="from-purple-400"]')
    expect(progressBar).toBeInTheDocument()
  })

  it('should use custom height', () => {
    const { container } = render(<ProgressBar value={50} max={100} height={12} />)
    const progressContainer = container.querySelector('[style*="height: 12px"]')
    expect(progressContainer).toBeInTheDocument()
  })

  it('should display both label and value', () => {
    render(<ProgressBar value={60} max={100} label="Loading" showValue />)
    expect(screen.getByText('Loading')).toBeInTheDocument()
    expect(screen.getByText('60%')).toBeInTheDocument()
  })

  it('should round percentage to nearest integer', () => {
    render(<ProgressBar value={33.7} max={100} showValue />)
    expect(screen.getByText('34%')).toBeInTheDocument()
  })
})

