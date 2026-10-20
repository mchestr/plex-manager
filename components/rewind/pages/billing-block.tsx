import { CONNECTOR_SCALE, type BillingEntry, type BillingLine } from "@/lib/rewind/billing-block"

import { axes, u } from "./units"

const SAFE_STACK = '"Noto Sans", "Noto Sans CJK JP", system-ui, sans-serif'

/**
 * The billing block (design 4.3 page 18, G3): each line spread edge to edge
 * at the size `billingBlock` set, capitals in Archivo width 62 and italic
 * connectors, static at rest. Screen readers get the same credits as a
 * definition list; the printed lines are hidden from them.
 */
export function BillingBlock({ lines, entries }: { lines: readonly BillingLine[]; entries: readonly BillingEntry[] }) {
  return (
    <div data-testid="rewind-billing">
      <dl className="sr-only" data-testid="rewind-billing-list">
        {entries.map((entry) => (
          <div key={entry.term}>
            <dt>{entry.term}</dt>
            <dd>{entry.detail}</dd>
          </div>
        ))}
      </dl>
      <div aria-hidden className="flex flex-col" style={{ gap: u(3) }}>
        {lines.map((line, i) => (
          <p
            key={i}
            className="rw-bill-line flex items-baseline justify-between whitespace-nowrap"
            style={{ animationDelay: `${420 + i * 50}ms`, lineHeight: 1 }}
            data-testid="rewind-billing-line"
          >
            {line.parts.map((part, p) =>
              part.kind === "caps" ? (
                <span
                  key={p}
                  className={line.safe ? undefined : "font-display tabular-nums"}
                  style={line.safe ? { fontFamily: SAFE_STACK, fontSize: u(line.size), fontWeight: 800 } : { fontSize: u(line.size), fontVariationSettings: axes(62, 850) }}
                  dir="auto"
                >
                  {part.text}
                </span>
              ) : (
                <span key={p} className="font-text italic" style={{ fontSize: u(line.size * CONNECTOR_SCALE) }}>
                  {part.text}
                </span>
              )
            )}
          </p>
        ))}
      </div>
    </div>
  )
}
