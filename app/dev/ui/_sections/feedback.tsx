import { Button } from "@/components/ui/button"
import { Alert } from "@/components/ui/alert"
import { HomeSkeleton } from "@/components/dashboard/home-skeleton"
import { ErrorState } from "@/components/ui/error-state"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { PageHeaderSkeleton, Skeleton, StatGridSkeleton, TableSkeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { StatusScreen } from "@/components/ui/status-screen"
import { icons } from "@/lib/ui/icons"

import { Row, Specimen } from "./specimen"

export function AlertSpecimen() {
  return (
    <Specimen id="alert" title="Alert">
      <Alert tone="info" title="Check your email">
        We sent a sign-in link to the address on your Plex account.
      </Alert>
      <Alert tone="success" title="Settings saved" />
      <Alert tone="warning" title="Payment failed">
        Your last payment didn&apos;t go through. Update your card to keep your access.
      </Alert>
      <Alert
        tone="destructive"
        title="Tautulli isn't answering"
        action={
          <Button variant="secondary" size="sm">
            Retry
          </Button>
        }
      >
        History and Rewind stats are paused until it is back.
      </Alert>
      <Alert tone="info" icon={null}>
        An alert without an icon.
      </Alert>
    </Specimen>
  )
}

export function SpinnerSpecimen() {
  return (
    <Specimen id="spinner" title="Spinner">
      <Row label="Spinner">
        <Spinner size={12} />
        <Spinner />
        <Spinner size={20} />
        <Spinner size={24} label="Loading" />
      </Row>
      <Row label="LoadingSpinner">
        <LoadingSpinner size="sm" />
        <LoadingSpinner size="md" />
        <LoadingSpinner size="lg" />
        <LoadingSpinner size="xl" label="Loading users" />
      </Row>
    </Specimen>
  )
}

export function SkeletonSpecimen() {
  return (
    <Specimen id="skeleton" title="Skeleton">
      <Row label="Blocks">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="size-10 rounded-full" />
      </Row>
      <PageHeaderSkeleton />
      <StatGridSkeleton count={4} />
      <TableSkeleton rows={3} columns={4} />
      <p className="text-label text-muted-foreground">Home loading</p>
      <div className="rounded-lg border">
        <HomeSkeleton />
      </div>
    </Specimen>
  )
}

/** The status screen and the in-card error (P10.17). */
export function StatusSpecimens() {
  return (
    <Specimen id="status-screen" title="StatusScreen and ErrorState">
      <div className="flex justify-center rounded-lg border px-4 py-10">
        <StatusScreen
          icon={icons.notFound}
          code="404"
          title="This page doesn't exist"
          description="The link may be old, or the page may have moved."
          primaryAction={<Button size="lg">Go to home</Button>}
          secondaryAction={
            <Button size="lg" variant="secondary">
              Ask for help on Discord
            </Button>
          }
        />
      </div>
      <ErrorState secondaryAction={<Button variant="secondary">Back to users</Button>} />
    </Specimen>
  )
}
