import { renderCopy, type TokenSource } from "@/lib/wrapped/copy/render-copy"

import { axes } from "./units"

/**
 * Rewind copy with its `{{fact:id}}` tokens filled in (design 8.3): numbers
 * and other facts set as `.tok` (Archivo 760 at width 87.5, tabular, never
 * wrapping), titles in italics. Every value is inserted as text.
 */
export function CopyText({ text, source }: { text: string; source: TokenSource }) {
  return renderCopy(text, source).map((segment, i) => {
    if (segment.kind === "text") return segment.text
    if (segment.kind === "title") return <i key={i}>{segment.text}</i>
    return (
      <span
        key={i}
        className="tok whitespace-nowrap font-display not-italic"
        style={{ fontVariationSettings: axes(87.5, 760), fontFeatureSettings: '"tnum" 1, "lnum" 1', fontSize: "0.93em" }}
      >
        {segment.text}
      </span>
    )
  })
}
