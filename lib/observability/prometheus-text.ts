/**
 * Writes the Prometheus text exposition format 0.0.4 by hand (no client
 * library): one `# HELP` and `# TYPE` per metric, then a line per sample.
 *
 * @example
 * ```ts
 * renderMetrics([{ name: "up", help: "Up.", type: "gauge", samples: [{ labels: { source: "db" }, value: 1 }] }])
 * // '# HELP up Up.\n# TYPE up gauge\nup{source="db"} 1\n'
 * ```
 *
 * @module lib/observability/prometheus-text
 */

export const PROMETHEUS_CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8"

export interface Sample {
  labels?: Record<string, string>
  value: number
}

export interface Metric {
  name: string
  help: string
  type: "gauge" | "counter"
  samples: Sample[]
}

/** A label value with `\`, `"` and newlines escaped. */
function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")
}

function formatValue(value: number): string {
  if (Number.isNaN(value)) return "NaN"
  if (value === Infinity) return "+Inf"
  if (value === -Infinity) return "-Inf"
  return String(value)
}

function sampleLine(name: string, { labels, value }: Sample): string {
  const pairs = Object.entries(labels ?? {}).map(([key, label]) => `${key}="${escapeLabel(label)}"`)
  return `${name}${pairs.length > 0 ? `{${pairs.join(",")}}` : ""} ${formatValue(value)}`
}

/** The exposition body; a metric without samples is left out. */
export function renderMetrics(metrics: readonly Metric[]): string {
  return metrics
    .filter((metric) => metric.samples.length > 0)
    .map((metric) =>
      [
        `# HELP ${metric.name} ${metric.help.replace(/\\/g, "\\\\").replace(/\n/g, "\\n")}`,
        `# TYPE ${metric.name} ${metric.type}`,
        ...metric.samples.map((sample) => sampleLine(metric.name, sample)),
      ].join("\n") + "\n"
    )
    .join("")
}
