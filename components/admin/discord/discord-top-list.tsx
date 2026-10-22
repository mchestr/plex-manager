import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface TopListItem {
  id: string
  label: string
  value: string
  /** A second line, such as a sample error. */
  sub?: string
}

interface DiscordTopListProps {
  title: string
  items: TopListItem[]
  /** Each row's test id is `${rowTestIdPrefix}-${id}`. */
  rowTestIdPrefix: string
  "data-testid"?: string
}

/** A short ranked list beside the Discord charts: repeat requesters, frequent clearers, failing commands. */
export function DiscordTopList({ title, items, rowTestIdPrefix, ...props }: DiscordTopListProps) {
  if (items.length === 0) return null
  return (
    <Card data-testid={props["data-testid"]}>
      <CardHeader>
        <CardTitle as="h2">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-1 py-2" data-testid={`${rowTestIdPrefix}-${item.id}`}>
              <div className="flex items-center justify-between gap-4 text-ui">
                <span className="truncate text-foreground">{item.label}</span>
                <span className="shrink-0 font-medium tabular-nums">{item.value}</span>
              </div>
              {item.sub && <p className="truncate text-label text-muted-foreground">{item.sub}</p>}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
