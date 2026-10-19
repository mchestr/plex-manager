/**
 * The raw value of every fact a member has, read off their stats. A fact
 * whose stat is missing or ineligible is left out, never set to null, so a
 * page or a slot can test for it by presence.
 *
 * Shares are 0-1 ratios, dates `YYYY-MM-DD` keys in the member's zone,
 * months 1-12, clock times minutes after midnight and hours whole hours,
 * floored once from minutes.
 *
 * @module lib/wrapped/facts/values
 * @internal Read through `buildFacts`.
 */

import type { MemberStats } from "@/lib/wrapped/stats/compute"
import type { TitleKey } from "@/lib/wrapped/stats/keys"

import type { FactId } from "./catalogue"
import type { FactValue } from "./display"

export type FactValues = Partial<Record<FactId, FactValue>>

const hours = (minutes: number) => Math.floor(minutes / 60)
const clock = (t: { hour: number; minute: number }) => t.hour * 60 + t.minute

/** Copies only the entries whose value is not null or undefined. */
function present(entries: Record<string, FactValue | undefined>): FactValues {
  return Object.fromEntries(Object.entries(entries).filter(([, v]) => v !== null && v !== undefined)) as FactValues
}

function timeAndCounts({ totals, milestones }: MemberStats): FactValues {
  const any = totals.totalMinutes > 0
  return present({
    "time.totalMinutes": any ? totals.totalMinutes : null,
    "time.totalHours": totals.totalMinutes >= 60 ? hours(totals.totalMinutes) : null,
    "time.daysHours": totals.totalMinutes >= 1440 ? totals.totalMinutes : null,
    "time.perDay": any ? totals.perDay : null,
    "time.seriesHours": totals.seriesMinutes >= 60 ? hours(totals.seriesMinutes) : null,
    "time.seriesShare": any ? totals.seriesShare : null,
    "time.filmsHours": totals.filmMinutes >= 60 ? hours(totals.filmMinutes) : null,
    "time.filmsShare": any ? totals.filmShare : null,
    "time.vsLastYear": totals.vsLastYear,
    "time.liveHours": totals.liveMinutes >= 60 ? hours(totals.liveMinutes) : null,
    ...Object.fromEntries(milestones.flatMap((m, i) => [[`time.milestones[${i + 1}].hours`, m.hours], [`time.milestones[${i + 1}].date`, m.date]])),
    "counts.episodes": totals.counts.episodes,
    "counts.series": totals.counts.series,
    "counts.films": totals.counts.films,
    "counts.seasons": totals.counts.seasons,
  })
}

function daysAndHours({ calendar, sessions, time }: MemberStats): FactValues {
  const counted = time.peak !== null
  return present({
    "days.active": calendar.active,
    "days.biggest.date": calendar.biggest?.date,
    "days.biggest.minutes": calendar.biggest?.minutes,
    "days.longestGap.days": calendar.longestGap?.days,
    "days.longestGap.month": calendar.longestGap?.month,
    "streak.longest.days": calendar.streak?.days,
    "streak.longest.from": calendar.streak?.from,
    "streak.longest.to": calendar.streak?.to,
    "days.biggestWeek": sessions.biggestWeek?.minutes,
    "days.biggestWeek.from": sessions.biggestWeek?.from,
    "hours.peak": time.peak,
    "hours.quietest": time.quietest,
    "hours.afterDarkShare": counted ? time.afterDarkShare : null,
    "hours.goldenShare": counted ? time.goldenShare : null,
    "hours.medianStart": time.medianStart && clock(time.medianStart),
    "hours.latestStart.time": time.latestStart && clock(time.latestStart),
    "hours.latestStart.weekday": time.latestStart?.weekday,
    "days.weekendShare": counted ? time.weekendShare : null,
  })
}

function lists({ titles, sessions, community }: MemberStats): FactValues {
  const ranks = community.eligible ? community.viewerRanks : {}
  const nights: Partial<Record<TitleKey, { date: string; episodes: number }>> = sessions.biggestNight
  return present({
    ...Object.fromEntries(
      titles.series.flatMap((s, i) => {
        const n = `series[${i + 1}]`
        const rank = ranks[s.key]
        return Object.entries({
          title: s.title,
          minutes: s.minutes,
          episodes: s.episodes,
          seasons: s.seasons,
          monthsActive: s.monthsActive,
          rewatched: s.rewatched,
          "biggestNight.date": nights[s.key]?.date,
          "biggestNight.episodes": nights[s.key]?.episodes,
          viewerRank: rank?.rank,
          viewerCount: rank?.viewers,
        }).map(([field, value]) => [`${n}.${field}`, value])
      })
    ),
    ...Object.fromEntries(
      titles.films.flatMap((f, i) => [
        [`films[${i + 1}].title`, f.title],
        [`films[${i + 1}].plays`, f.plays],
        [`films[${i + 1}].minutes`, f.minutes],
      ])
    ),
    "series.top3Share": titles.top3SeriesShare,
    "films.finishedShare": titles.filmsFinished?.share,
    "films.longest.title": titles.longestFilm?.title,
    "films.longest.minutes": titles.longestFilm?.minutes,
    "quiz.gapMinutes": titles.quiz?.gapMinutes,
    "counts.titles": titles.distinctTitles,
  })
}

function records({ sessions, titles, totals }: MemberStats): FactValues {
  return present({
    "records.longestBinge.episodes": sessions.longestBinge?.episodes,
    "records.longestBinge.title": sessions.longestBinge?.title,
    "records.longestBinge.date": sessions.longestBinge?.date,
    "records.deepestBinge.episodes": sessions.deepestBinge?.episodes,
    "records.deepestBinge.title": sessions.deepestBinge?.title,
    "records.mostEpisodesDay": sessions.mostEpisodesDay?.episodes,
    "records.completionShare": titles.completion?.share,
    "records.mostPaused.title": sessions.mostPaused?.title,
    "records.rewatchShare": titles.distinctTitles > 0 ? titles.rewatchShare : null,
    "records.rewatchedTitles": titles.rewatchedTitles,
    "counts.titlesPer10Hours":
      totals.totalMinutes >= 60 ? Math.round((titles.distinctTitles / (totals.totalMinutes / 60)) * 100) / 10 : null,
  })
}

function tasteAndPeople({ taste, people, freshShare }: MemberStats): FactValues {
  return present({
    "taste.freshShare": freshShare,
    ...(taste.eligible
      ? {
          ...Object.fromEntries(taste.genres.flatMap((g, i) => [[`taste.genre[${i + 1}].name`, g.name], [`taste.genre[${i + 1}].share`, g.share]])),
          ...Object.fromEntries(taste.genreByMonth.map((m) => [`taste.genreByMonth[${m.month}]`, m.genre])),
          "taste.medianYear": taste.medianYear,
          "taste.oldest.title": taste.oldest?.title,
          "taste.oldest.year": taste.oldest?.year,
        }
      : {}),
    ...(people.eligible
      ? {
          ...Object.fromEntries(people.actors.flatMap((p, i) => [[`people.actor[${i + 1}].name`, p.name], [`people.actor[${i + 1}].minutes`, p.minutes]])),
          ...Object.fromEntries(people.directors.map((p, i) => [`people.director[${i + 1}].name`, p.name])),
        }
      : {}),
  })
}

function server({ race, devices, requests, community, nextYear }: MemberStats): FactValues {
  const titleOf = race.eligible ? new Map(race.series.map((s) => [s.key, s.title])) : new Map<string, string>()
  return present({
    ...(race.eligible
      ? {
          ...Object.fromEntries(race.months.map((month, m) => [`race.leader[${month}]`, race.leader[m] && titleOf.get(race.leader[m]!)])),
          "race.leadChanges": race.leadChanges,
          "race.overtakeMonth": race.overtakeMonth,
          "race.closestGapMinutes": race.closestGapMinutes,
        }
      : {}),
    ...(devices.eligible
      ? {
          "setup.directPlayShare": devices.directPlayShare,
          "setup.homeShare": devices.homeShare,
          "setup.topPlatform": devices.topPlatform,
          "setup.topProduct": devices.topProduct,
          "setup.fourKShare": devices.fourKShare,
        }
      : {}),
    ...(requests.eligible
      ? {
          "requests.made": requests.made,
          "requests.approved": requests.approved,
          "requests.available": requests.available,
          "requests.pending": requests.pending,
          "requests.declined": requests.declined,
          "requests.watched": requests.watched,
          ...Object.fromEntries(requests.genres.map((g, i) => [`requests.genre[${i + 1}]`, g.name])),
        }
      : {}),
    ...(community.eligible
      ? {
          "standing.percentile": community.standing?.percentile,
          "standing.members": community.standing?.members,
          "community.hours": community.community.hours?.value,
          "community.topSeries": community.community.topSeries?.title,
          "community.busiestNight": community.community.busiestNight?.day,
          "community.peakConcurrent": community.community.peakConcurrent?.value,
          "community.requestsFulfilled": community.community.requestsFulfilled?.value,
          "community.titlesAdded": community.community.titlesAdded.total,
        }
      : {}),
    ...Object.fromEntries(nextYear.leftForLater.map((t, i) => [`next.leftForLater[${i + 1}].title`, t.title])),
    ...Object.fromEntries(nextYear.picks.map((t, i) => [`next.picks[${i + 1}].title`, t.title])),
  })
}

/** Every stats-derived fact of the member. */
export function statFacts(stats: MemberStats): FactValues {
  return {
    ...timeAndCounts(stats),
    ...daysAndHours(stats),
    ...lists(stats),
    ...records(stats),
    ...tasteAndPeople(stats),
    ...server(stats),
  }
}
