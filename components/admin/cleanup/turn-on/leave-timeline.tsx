import { sizeText } from "@/components/admin/cleanup/preview/sizes"
import { isChangeMode } from "@/components/admin/cleanup/turn-on/turn-on-words"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { plural } from "@/lib/cleanup/action-words"
import { NOUNS } from "@/lib/cleanup/fields/words"
import type { CleanupTurnOnData } from "@/lib/cleanup/types/screens"
import { cn } from "@/lib/utils"
import type { BoundFormat } from "@/lib/utils/format"

const DAY_MS = 86_400_000

/** The days from `from` to `to`, both counted: day keys "2026-12-08". @internal Exported for tests. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1
}

interface Point {
  id: string
  label: string
  text: string
  /** The dot: today is filled, the leave date is a ring in the brand colour, the pace a muted ring. */
  dot: string
}

/** The three points of UX 4.6 "When they leave", with the words of UX 8.7 "Timeline". @internal Exported for tests. */
export function timelinePoints(data: CleanupTurnOnData, f: BoundFormat): Point[] {
  const change = isChangeMode(data)
  const level = data.rule.level
  const points: Point[] = [
    {
      id: "today",
      label: `Today, ${f.dayKey(data.today, "day-month-short")}`,
      text: `${change ? "They stay in Leaving soon." : "They join Leaving soon."} Members see them and can keep them.`,
      dot: "border-primary bg-primary",
    },
    {
      id: "leave",
      label: f.dayKey(data.leaveAt, "short"),
      text: `The ${change ? "first leave date" : "leave date"}. Review first: the batch waits for you. Automatic: deletions start.`,
      dot: "border-primary bg-card",
    },
  ]
  const pace = data.automaticPace
  if (pace) {
    const from = f.dayKey(pace.from, "day-month-short")
    const days = daysBetween(pace.from, pace.to)
    const take = `${plural(data.count, level)} ${data.count === 1 ? "takes" : "take"} ${days === 1 ? "1 day" : `${days} days`}`
    points.push({
      id: "pace",
      label: pace.from === pace.to ? from : `${from} to ${f.dayKey(pace.to, "day-month-short")}`,
      text: `Automatic only: at most ${plural(pace.perDay.items, level)} or ${sizeText(pace.perDay.bytes)} a day, so ${take}.`,
      dot: "border-border-strong bg-card",
    })
  }
  return points
}

/**
 * "When they leave" (UX 4.6, 8.7): a three-point timeline from today to
 * the leave date, and the Automatic pace that the daily budget gives. Then
 * the line on what takes a title out before it goes. Across from `sm`,
 * down below it.
 */
export function LeaveTimeline({ data, f }: { data: CleanupTurnOnData; f: BoundFormat }) {
  const [item] = NOUNS[data.rule.level]
  const points = timelinePoints(data, f)
  return (
    <Card data-testid="admin-cleanup-turn-on-timeline">
      <CardHeader>
        <CardTitle as="h2">When they leave</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ol
          className={cn(
            "relative grid gap-4 sm:gap-6",
            points.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2",
            "before:absolute before:top-2 before:bottom-2 before:left-[7px] before:w-px before:bg-border-strong",
            "sm:before:top-[7px] sm:before:right-2 sm:before:bottom-auto sm:before:left-2 sm:before:h-px sm:before:w-auto"
          )}
        >
          {points.map((point) => (
            <li key={point.id} className="relative flex gap-3 sm:flex-col sm:gap-2" data-testid={`admin-cleanup-turn-on-timeline-${point.id}`}>
              <span aria-hidden="true" className={cn("relative z-10 mt-0.5 size-4 shrink-0 rounded-full border-2 sm:mt-0", point.dot)} />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-ui font-semibold text-foreground">{point.label}</span>
                <span className="text-label text-muted-foreground">{point.text}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="text-label text-muted-foreground">
          A play, a Keep, a new protection or a rule change takes a {item} out on any day before it goes. Each {item} is read again just before it is
          deleted. A leave date never moves earlier.
        </p>
      </CardContent>
    </Card>
  )
}
