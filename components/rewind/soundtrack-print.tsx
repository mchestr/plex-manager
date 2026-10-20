import type { SoundtrackGeometry } from "@/lib/rewind/home-card-state"

/**
 * The home RewindCard strip's print (Rewind 4.4): the weekly soundtrack in
 * the strip's ink, or, on paper, only the dotted centre line. Decorative.
 */
export function SoundtrackPrint({ soundtrack }: { soundtrack: SoundtrackGeometry | null }) {
  const width = soundtrack?.width ?? 480
  const height = soundtrack?.height ?? 80
  const centre = soundtrack?.centre ?? height / 2
  const dotted = soundtrack ? soundtrack.dotted : { x1: 0, x2: width }
  return (
    <svg aria-hidden="true" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block size-full" data-testid="rewind-card-soundtrack">
      {soundtrack && <path d={soundtrack.d} fill="currentColor" />}
      {dotted && (
        <line x1={dotted.x1} x2={dotted.x2} y1={centre} y2={centre} stroke="currentColor" strokeWidth={1.5} strokeDasharray="1.5 3" vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  )
}
