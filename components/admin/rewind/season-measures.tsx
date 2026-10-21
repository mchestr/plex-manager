import { StatTile } from "@/components/ui/stat-tile"
import type { RewindSuccessMeasures } from "@/lib/wrapped/admin/measures"

/** The success measures (design 1.4, P7.14): opened, reached the centrefold, and shared. */
export function SeasonMeasures({ measures }: { measures: RewindSuccessMeasures }) {
  const { completed, opened, fullOpeners, reachedCentrefold, shared } = measures
  return (
    <section aria-labelledby="season-measures-heading" className="flex flex-col gap-3" data-testid="admin-rewind-measures">
      <h2 id="season-measures-heading" className="text-h3">
        Readers
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Opened their Rewind" value={opened} unit={`of ${completed} completed`} data-testid="admin-rewind-measure-opened" />
        <StatTile
          label="Reached the centrefold"
          value={reachedCentrefold}
          unit={`of ${fullOpeners} full-edition readers`}
          data-testid="admin-rewind-measure-centrefold"
        />
        <StatTile label="Shared a card or link" value={shared} unit={`of ${opened} readers`} data-testid="admin-rewind-measure-shared" />
      </div>
    </section>
  )
}
