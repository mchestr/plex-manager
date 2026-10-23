import { CreateInviteDialog } from "@/components/admin/invites/create-invite-dialog"
import { InvitesTable } from "@/components/admin/invites/invites-table"
import { PageHeader } from "@/components/ui/page-header"
import { INVITES_DEFAULT_SORT, INVITES_SORTS, parseInviteFilter } from "@/lib/admin/invites/filter"
import { jellyfinLibraryListing, plexLibraryListing } from "@/lib/admin/invites/libraries"
import { listInvites } from "@/lib/admin/invites/queries"
import { parseTableParams } from "@/lib/ui/table-params"

type Params = Record<string, string | string[] | undefined>

/**
 * The admin invites list (P10.1), on the users page's pattern: filters, sort
 * and page come from the URL and the rows load here. The library listings
 * start without being awaited and reach the dialog as promises, so the list
 * never waits for Plex or Jellyfin.
 */
export default async function InvitesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams
  const plexLibraries = plexLibraryListing()
  const jellyfinLibraries = jellyfinLibraryListing()

  const filter = parseInviteFilter(params)
  const table = parseTableParams(params, { sortable: INVITES_SORTS, defaultSort: INVITES_DEFAULT_SORT })
  const { rows, total, all } = await listInvites({ ...filter, page: table.page, pageSize: table.pageSize, sort: table.sort })
  const page = Math.min(table.page, Math.max(1, Math.ceil(total / table.pageSize)))

  const create = (testId: string, openFromParam = false) => (
    <CreateInviteDialog
      plexLibraries={plexLibraries}
      jellyfinLibraries={jellyfinLibraries}
      openFromParam={openFromParam}
      data-testid={testId}
    />
  )

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6" data-testid="admin-invites-page">
      <PageHeader
        title="Invites"
        description="Links that let someone join your Plex or Jellyfin server."
        actions={create("generate-invite-button", true)}
        data-testid="admin-invites-header"
      />
      <InvitesTable
        rows={rows}
        total={total}
        all={all}
        page={page}
        pageSize={table.pageSize}
        sort={table.sort}
        createAction={create("admin-invites-empty-create")}
      />
    </div>
  )
}
