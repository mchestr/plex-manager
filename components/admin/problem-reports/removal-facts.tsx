import { getRemovalFacts } from "@/lib/data/problem-removal"

/** What the confirm for Remove the file and search says it will do, read when the report's page renders. */
export async function RemovalFacts({ reportId }: { reportId: string }) {
  const facts = await getRemovalFacts(reportId)
  if (!facts) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="admin-problem-report-removal-facts">
        Radarr, Sonarr or Plex couldn&apos;t be read just now. The fix checks the file again when it runs.
      </p>
    )
  }

  const { service } = facts
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-sm" data-testid="admin-problem-report-removal-facts">
      <li data-testid="admin-problem-report-removal-blocklist">
        {facts.blocklists ? (
          <>
            {service} marks <span className="font-medium wrap-anywhere">{facts.blocklists}</span> failed first, so it isn&apos;t grabbed again.
          </>
        ) : (
          `${service} has no download of this file in its history, so nothing is blocklisted and the same release could come back.`
        )}
      </li>
      <li data-testid="admin-problem-report-removal-recycle-bin">
        {facts.recycleBin === null
          ? `${service}'s recycle bin couldn't be checked.`
          : facts.recycleBin
            ? `${service} moves the file to its recycle bin.`
            : `${service} has no recycle bin set, so the file is deleted for good.`}
      </li>
      {facts.emptiesTrash && (
        <li data-testid="admin-problem-report-removal-trash">
          Plex empties its trash after every scan, so the title may come back as a new item, without anyone&apos;s watched status.
        </li>
      )}
    </ul>
  )
}
