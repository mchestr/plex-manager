import { Badge } from "@/components/ui/badge"
import { Icon } from "@/components/ui/icon"
import { Poster } from "@/components/ui/poster"
import { icons } from "@/lib/ui/icons"

const LIFECYCLE = [
  { title: "Harbour Lights", status: "Requested", variant: "neutral" },
  { title: "Northbound", status: "Processing", variant: "info" },
  { title: "The Long Field", status: "Available", variant: "success" },
] as const

/**
 * A request's lifecycle (ui-design-system 6.5): Requested, Processing and
 * Available on poster-palette title cards. Decorative: the guide says the
 * same in text.
 */
export function RequestsIllustration() {
  return (
    <div
      aria-hidden="true"
      className="flex items-center justify-center gap-1.5 rounded-lg border border-border-strong bg-background px-4 pt-4.5 pb-4"
      data-testid="requests-illustration"
    >
      {LIFECYCLE.map((item, index) => (
        <div key={item.title} className="flex items-center gap-1.5">
          {index > 0 && <Icon icon={icons.chevronRight} className="text-muted-foreground" />}
          <div className="flex flex-col items-center gap-2">
            <Poster ratingKey={null} title={item.title} size="sm" decorative style={{ width: 76 }} />
            <Badge variant={item.variant}>{item.status}</Badge>
          </div>
        </div>
      ))}
    </div>
  )
}
