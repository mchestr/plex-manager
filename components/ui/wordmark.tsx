import { cn } from "@/lib/utils"

/** Names longer than this set in the 85% width before they truncate (ui-design-system 7.5). */
const CONDENSE_AFTER = 22

interface WordmarkProps {
  serverName: string
  /** `sm` for the 56px mobile bars, `md` (15px) everywhere else. */
  size?: "sm" | "md"
  className?: string
}

/**
 * The brand mark (ui-design-system 7.5): the 8px amber pip and the server
 * name in Plex Sans 600. Past 22 characters the name sets condensed, then
 * truncates with the full name in `title`.
 */
export function Wordmark({ serverName, size = "md", className }: WordmarkProps) {
  const long = serverName.length > CONDENSE_AFTER
  return (
    <span data-slot="wordmark" className={cn("flex min-w-0 items-center gap-2", className)}>
      <span aria-hidden="true" className="size-2 shrink-0 rounded-[2px] bg-primary" />
      <span
        title={long ? serverName : undefined}
        className={cn(
          "truncate font-semibold text-foreground",
          size === "md" ? "text-body" : "text-ui",
          long && "font-stretch-85%"
        )}
        style={{ letterSpacing: "-0.01em" }}
      >
        {serverName}
      </span>
    </span>
  )
}
