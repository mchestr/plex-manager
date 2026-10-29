import { Skeleton } from "@/components/ui/skeleton"

export default function InvitesLoading() {
  return (
    <div className="px-4 py-10 sm:px-6" aria-busy="true" aria-label="Loading invites" data-testid="invites-loading">
      <div className="mx-auto flex w-full max-w-160 flex-col gap-8">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  )
}
