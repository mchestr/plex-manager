import { PreviewTable } from "@/components/admin/inactivity/preview-table"
import { Alert } from "@/components/ui/alert"
import type { InactivityPreview } from "@/lib/data/inactivity-preview"
import { inactivityBlockLabel } from "@/lib/inactivity/blocks"
import { INACTIVITY_SKIPS, SKIP_LABELS } from "@/lib/inactivity/rules"
import type { InactivitySettingsValues } from "@/lib/inactivity/settings"
import type { BoundFormat } from "@/lib/utils/format"

interface PreviewSectionProps {
  preview: InactivityPreview
  settings: InactivitySettingsValues
  f: BoundFormat
  /** The server's clock at render. */
  now: number
}

/** Every member with a Plex account who is not in the list, by why: active, protected by a rule, or without access. */
function NotListed({ preview, thresholdDays }: { preview: InactivityPreview; thresholdDays: number }) {
  const counts = [
    { key: "active", label: `Played, joined or got access back in the last ${thresholdDays} days`, count: preview.active },
    ...INACTIVITY_SKIPS.map((skip) => ({ key: skip, label: SKIP_LABELS[skip], count: preview.skips[skip] })),
    { key: "no-access", label: "No access to the server", count: preview.noAccess },
  ].filter((item) => item.count > 0)
  if (counts.length === 0) return null

  return (
    <div className="flex flex-col gap-2" data-testid="admin-inactivity-not-listed">
      <h3 className="text-ui font-medium text-foreground">Not in this list</h3>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
        {counts.map((item) => (
          <div key={item.key} className="flex justify-between gap-3 text-ui" data-testid={`admin-inactivity-not-listed-${item.key}`}>
            <dt className="text-muted-foreground">{item.label}</dt>
            <dd className="text-foreground tabular-nums">{item.count}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/**
 * Whom a run would remove now, from the newest read of Tautulli: the members
 * with access and no play for the threshold, under the same rules as the
 * sweep (`lib/data/inactivity-preview.ts`), then the count of everyone left
 * out and why. Says when the Plex shares could not be read, since the list
 * can then hold members who already lost access.
 */
export function PreviewSection({ preview, settings, f, now }: PreviewSectionProps) {
  return (
    <section aria-labelledby="admin-inactivity-preview-heading" className="flex flex-col gap-3" data-testid="admin-inactivity-preview-section">
      <div className="flex flex-col gap-1">
        <h2 id="admin-inactivity-preview-heading" className="text-h3">
          Who a run would remove
        </h2>
        <p className="text-ui text-muted-foreground">
          Members with access and no play in {settings.thresholdDays} days, the longest inactive first.
          {preview.readSince && (
            <>
              {" "}From the Tautulli read on{" "}
              <span data-testid="admin-inactivity-read-timestamp">{f.dateTime(preview.readSince, { zoneLabel: true })}</span>.
            </>
          )}
          {!settings.enabled && " Automatic removal is off, so no run removes them."}
        </p>
      </div>
      {preview.shareCheck && (
        <Alert tone="warning" title={inactivityBlockLabel(preview.shareCheck)} data-testid="admin-inactivity-share-check">
          The list can include members who no longer have access. Runs remove no one until this is fixed.
        </Alert>
      )}
      <PreviewTable rows={preview.rows} read={preview.readSince !== null} now={now} />
      <NotListed preview={preview} thresholdDays={settings.thresholdDays} />
    </section>
  )
}
