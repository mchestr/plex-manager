import { Spinner } from "@/components/ui/spinner"

/**
 * The one full-screen spinner the app keeps (ui-design-system 6.7): the Plex
 * callback's loader and its waiting state, inside the auth PublicShell.
 */
export function FinishingSignIn({ "data-testid": testId }: { "data-testid": string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-4 text-center" data-testid={testId}>
      <Spinner size={24} className="text-muted-foreground" />
      <h1 className="text-h2 text-foreground">Finishing sign-in</h1>
      <p className="text-ui text-muted-foreground">Approve access on plex.tv if you haven&apos;t yet.</p>
    </div>
  )
}
