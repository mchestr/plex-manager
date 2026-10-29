import { Suspense, use } from "react"

function Count({ count }: { count: Promise<number | null> }) {
  const value = use(count)
  return <>{value === null ? "Plex did not answer, so the number of shared users is not known." : `The Plex server shares with ${value} ${value === 1 ? "user" : "users"} now.`}</>
}

/** How many users the Plex server shares with now, streamed: the page never waits for plex.tv. */
export function ShareCount({ count }: { count: Promise<number | null> }) {
  return (
    <span data-testid="settings-affiliates-share-count">
      <Suspense fallback="Counting the users the Plex server shares with.">
        <Count count={count} />
      </Suspense>
    </span>
  )
}
