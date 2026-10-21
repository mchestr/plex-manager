import { Spinner } from "@/components/ui/spinner"

/** The one spinner screen the app keeps (ui-design-system 6.7); P10.27 finishes it. */
export default function Loading() {
  return (
    <div role="status" className="flex flex-col items-center gap-4" data-testid="plex-callback-loading">
      <Spinner size={24} className="text-muted-foreground" />
      <p className="text-ui text-muted-foreground">Finishing sign-in</p>
    </div>
  )
}
