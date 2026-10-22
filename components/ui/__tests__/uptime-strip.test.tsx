/**
 * UptimeStrip (P10.21, ui-design-system 5.5): 168 hours fold into 84
 * worst-of bars, the strip is aria-hidden, the summary and an sr-only
 * incident list carry it, and it hides without Prometheus.
 */

import { render, screen } from '@testing-library/react'

import type { StatusData, StatusSegment } from '@/actions/prometheus-status'
import { UptimeStrip } from '@/components/ui/uptime-strip'
import { foldSegments } from '@/lib/ui/uptime'

const SETTINGS = { timeZone: 'UTC', locale: 'en-US' }
const START = Date.UTC(2026, 9, 12, 0) / 1000

function hours(statuses: StatusSegment['status'][]): StatusSegment[] {
  return statuses.map((status, i) => ({ timestamp: START + i * 3600, status }))
}

function week(down: number[] = []): StatusSegment[] {
  return hours(Array.from({ length: 168 }, (_, i) => (down.includes(i) ? 'down' : 'up')))
}

function status(segments: StatusSegment[], isConfigured = true): StatusData {
  return { isConfigured, serviceName: 'Plex', segments, overallStatus: 'operational' }
}

describe('foldSegments', () => {
  it('folds 168 hours into 84 worst-of pairs', () => {
    expect(foldSegments(week())).toHaveLength(84)
  })

  it('reads one down hour as degraded, two as down, and unknown over up', () => {
    const bars = foldSegments(hours(['up', 'up', 'up', 'down', 'down', 'down', 'unknown', 'up', 'down']))

    expect(bars.map((bar) => bar.status)).toEqual(['up', 'degraded', 'down', 'unknown', 'down'])
    expect(bars[1].timestamp).toBe(START + 2 * 3600)
  })
})

describe('UptimeStrip', () => {
  it('hides when Prometheus is not configured', () => {
    const { container } = render(<UptimeStrip status={status([], false)} settings={SETTINGS} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('draws an aria-hidden strip of 84 bars that differ by state', () => {
    render(<UptimeStrip status={status(week([10, 20, 21]))} settings={SETTINGS} />)

    const strip = screen.getByTestId('uptime-strip-bars')
    expect(strip).toHaveAttribute('aria-hidden', 'true')
    expect(strip.children).toHaveLength(84)
    expect(strip.querySelector('[data-status="degraded"]')).toHaveClass('h-1/2')
    expect(strip.querySelector('[data-status="down"]')?.className).toMatch(/repeating-linear-gradient/)
  })

  it('summarises the week and lists each incident for screen readers', () => {
    render(<UptimeStrip status={status(week([20, 21]))} settings={SETTINGS} />)

    // 166 of 168 hours up
    expect(screen.getByTestId('uptime-strip-summary')).toHaveTextContent('98.8% uptime over 7 days')
    const incidents = screen.getByTestId('uptime-strip-incidents')
    expect(incidents).toHaveClass('sr-only')
    expect(incidents).toHaveTextContent('Plex was down for 2 hours from Oct 12, 2026, 8:00 PM.')
  })

  it('says so when no hour has a known status', () => {
    render(<UptimeStrip status={status(hours(['unknown', 'unknown']))} settings={SETTINGS} />)

    expect(screen.getByTestId('uptime-strip-summary')).toHaveTextContent('No uptime data for the last 7 days')
    expect(screen.queryByTestId('uptime-strip-incidents')).not.toBeInTheDocument()
  })
})
