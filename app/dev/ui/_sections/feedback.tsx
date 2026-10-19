import { Button } from "@/components/ui/button"
import { Alert } from "@/components/ui/alert"
import { LoadingScreen } from "@/components/ui/loading-screen"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { PageHeaderSkeleton, Skeleton, StatGridSkeleton, TableSkeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"

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
      <p className="text-label text-muted-foreground">LoadingScreen</p>
      <LoadingScreen message="Loading your Rewind" className="min-h-0 rounded-lg border py-8" />
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
    </Specimen>
  )
}
