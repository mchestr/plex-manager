import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { icons } from "@/lib/ui/icons"

interface RequestsGuideProps {
  /** The request site's public URL, already passed through `safeHref`. Hosts hide the guide without one. */
  requestsUrl: string
}

/**
 * How to ask for a missing title (6.1). It never names the request software
 * (7.1) and gives no admin hints; hosts render it only with a public URL.
 * Server-safe: no hooks and no server imports.
 */
export function RequestsGuide({ requestsUrl }: RequestsGuideProps) {
  return (
    <div className="flex flex-col gap-3 text-ui text-foreground" data-testid="requests-guide">
      <p className="text-muted-foreground">
        When a title that you request is available, it shows in the library. Sign in with the account that you use
        to watch.
      </p>
      <div>
        <Button
          variant="secondary"
          size="sm"
          nativeButton={false}
          render={<a href={requestsUrl} target="_blank" rel="noopener noreferrer" />}
          data-testid="requests-guide-link"
        >
          Request a title
          <Icon icon={icons.externalLink} />
          <span className="sr-only">(opens in a new tab)</span>
        </Button>
      </div>
    </div>
  )
}
