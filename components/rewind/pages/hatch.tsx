/**
 * Rewind's hatch as an SVG pattern in `currentColor` (design 5.2, 5.7): the
 * texture that means "the others" in a graphic. Unlike the CSS `.rw-hatch`,
 * a pattern keeps its lines under forced colours. Put it in the graphic's
 * `<svg>` and fill with `url(#id)`.
 */
export function HatchDefs({ id }: { id: string }) {
  return (
    <defs>
      <pattern id={id} width={4.5} height={4.5} patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
        <line x1={0} y1={0} x2={0} y2={4.5} stroke="currentColor" strokeWidth={1.5} />
      </pattern>
    </defs>
  )
}
