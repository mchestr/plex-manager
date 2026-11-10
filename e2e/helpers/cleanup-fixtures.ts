import { createHash } from 'node:crypto';

import type { Prisma } from '../../lib/generated/prisma/client';
import type { GlobalProtectionId, ItemClass, Verdict } from '../../lib/cleanup/engine/types';
import type { CleanupRuntime } from '../../lib/cleanup/schema/runtime';
import type { RequestFact, SnapshotFacts, SnapshotItem, SourceStatus, Viewer } from '../../lib/cleanup/schema/snapshot';
import type { RuleStats, RunRuleEntry } from '../../lib/cleanup/schema/stats';
import type { WhySnapshot } from '../../lib/cleanup/schema/why';
import { addDays } from '../../lib/ui/date-range';
import { dayKey } from '../../lib/utils/zoned-time';
import type { Condition, RuleDefinition } from '../../lib/validations/cleanup-rule';
import { GiB, TiB, UNIT_DAYS, type Level, type Mode } from '../../lib/validations/cleanup-vocabulary';

/**
 * The one source of the media cleanup E2E data (TS 16.4 data rules,
 * delivery-r2-2). `buildCleanupWorld(now)` makes the library that every mock
 * serves (`world.answers`) and the snapshot that the seeds store
 * (`world.snapshot`), so the two cannot drift. `cleanupSeedRows()`,
 * `cleanupA11ySeedRows()` and `cleanupPipelineSeedRows()` turn a world into
 * the rows that `e2e/helpers/seed-cleanup.ts` writes.
 *
 * - Every time comes from `now`. No fixed date decides a stop or a verdict,
 *   so the data passes the safety stops of TS 8.2 on any day.
 * - Pure: no clock, database or network. Jest
 *   (`__tests__/e2e-helpers/seed-cleanup.test.ts`), the mocks in the global
 *   setup process and the seed in the workers import it.
 * - Every title, name, path and id is invented.
 *
 * The world in short:
 *
 * - Plex section 1 "Movies" (`/data/movies`, Radarr) and section 2 "TV
 *   Shows" (`/data/tv`, Sonarr), on the machine `e2e-cleanup-machine`.
 * - 72 movies: the pipeline movie, a kept title, 54 batch movies that one
 *   Review first rule holds, and titles that each global protection, a near
 *   miss and each Cannot delete cause keep out.
 * - 8 shows with 1 to 4 seasons each, for the show rule, the season rule, an
 *   entry batch, an exclusion and the season protections G11 and G12.
 * - Tautulli history from about 760 days ago to 1 day ago. Overseerr holds 6
 *   requests. plex.tv shares the server with `e2e-cleanup-member` (no
 *   filter) and `e2e-cleanup-filtered` (`label!=Untranscodable`).
 *
 * @module e2e/helpers/cleanup-fixtures
 */

const DAY_S = 86_400;
const DAY_MS = DAY_S * 1000;

/* ---------------------------------------------------------------- Constants */

/** The prefix of `seedCleanup()`'s row ids when a spec names none. */
export const CLEANUP_PREFIX = 'e2e-cleanup';

/** The Plex mock: the token the plex.tv mock answers, its identifier and the owner's plex.tv id (a digit string, delivery-r3-2). */
export const CLEANUP_PLEX = {
  token: 'e2e-cleanup-plex-token',
  machineIdentifier: 'e2e-cleanup-machine',
  ownerPlexId: '9400000',
  serverName: 'Cleanup Test Server',
} as const;

/** The API keys the arr and Overseerr mocks accept. Any other key gets 401 (Radarr, Sonarr) or 403 (Overseerr). */
export const CLEANUP_API_KEYS = {
  radarr: 'e2e-cleanup-radarr-key',
  sonarr: 'e2e-cleanup-sonarr-key',
  overseerr: 'e2e-cleanup-overseerr-key',
  tautulli: 'e2e-tautulli-key',
} as const;

export const CLEANUP_SECTIONS = { movies: '1', shows: '2' } as const;
export const CLEANUP_ROOTS = { radarr: '/data/movies', sonarr: '/data/tv' } as const;

/** The fixed rule ids of the axe routes (TS 16.5). */
export const CLEANUP_A11Y_RULE_IDS = { dry: 'a11y-cleanup-rule-dry', live: 'a11y-cleanup-rule-live' } as const;
/** The prefix of every other row of `seedCleanupA11y()`. */
export const CLEANUP_A11Y_PREFIX = 'a11y-cleanup';

/** The admin of the E2E database (`TEST_USERS.ADMIN`), who made the rules and approved the batches. */
const ADMIN_ID = 'admin-user-id';

/** Every plex.tv account of the world. */
export const CLEANUP_PEOPLE = {
  owner: CLEANUP_PLEX.ownerPlexId,
  member: '9400101',
  filtered: '9400102',
  noshare: '9400103',
  /** A managed Home user: access without a share. */
  home: '9400104',
  /** A pending invite: no access. */
  pending: '9400105',
  /** Played and requested, but no longer has access. */
  former: '9400201',
  /** One short play only, which does not count. */
  brief: '9400202',
} as const;
export type CleanupPerson = keyof typeof CLEANUP_PEOPLE;

/**
 * The three cleanup members (TS 16.4): copies of `TEST_USERS.REGULAR` with
 * numeric Plex ids, because the snapshot keys users by digits.
 */
export const CLEANUP_MEMBERS = {
  member: { id: 'e2e-cleanup-member', plexUserId: CLEANUP_PEOPLE.member, name: 'Cleanup Member', email: 'e2e-cleanup-member@example.com' },
  filtered: { id: 'e2e-cleanup-filtered', plexUserId: CLEANUP_PEOPLE.filtered, name: 'Cleanup Filtered Member', email: 'e2e-cleanup-filtered@example.com' },
  noshare: { id: 'e2e-cleanup-noshare', plexUserId: CLEANUP_PEOPLE.noshare, name: 'Cleanup Unshared Member', email: 'e2e-cleanup-noshare@example.com' },
} as const;

/** The label that `e2e-cleanup-filtered`'s share filter hides. */
export const UNTRANSCODABLE = 'Untranscodable';

/** The Leaving soon collection that the Plex mock and every seed's `runtime.collections` hold (TS 16.4 pipeline step 1). */
export const CLEANUP_COLLECTION = { ratingKey: '90001', sectionId: CLEANUP_SECTIONS.movies, title: 'Movies leaving soon' } as const;

const KEEP_TAG = 1;
const IMPORT_TAG = 2;

/* -------------------------------------------------------------- Catalogue */

type PlayKind = 'finished' | 'partial' | 'brief';
interface PlaySpec {
  who: CleanupPerson;
  days: number;
  kind?: PlayKind;
}
type MovieArr = 'ok' | 'missing' | 'outside' | 'noFile';
interface MovieSpec {
  role: string;
  title: string;
  year: number;
  /** Days before `now` that Plex and Radarr added it. */
  added: number;
  gib: number;
  labels?: string[];
  arr?: MovieArr;
  tags?: number[];
  plays?: PlaySpec[];
}
interface EpisodePlaySpec extends PlaySpec {
  season: number;
  episode: number;
}
interface ShowSpec {
  role: string;
  title: string;
  year: number;
  status: 'ended' | 'continuing';
  added: number;
  seasons: { episodes: number; added: number }[];
  plays?: EpisodePlaySpec[];
  tags?: number[];
  labels?: string[];
  arr?: 'ok' | 'missing';
}

const NAMED_MOVIES: MovieSpec[] = [
  // Pipeline step 1: due, waits for approval, plays older than the seed, and it still matches
  { role: 'pipeline', title: 'Lanterns over Quill Bay', year: 2011, added: 700, gib: 9, plays: [{ who: 'member', days: 500 }] },
  // Matches the Review first rule, and a member Keep protects it (G1). Its play is the oldest Tautulli row,
  // older than the 2 years of the Dry run rules, so their history check passes (TS 8.2)
  { role: 'kept', title: 'The Orchard Ledger', year: 2009, added: 820, gib: 14, plays: [{ who: 'former', days: 760 }] },
  { role: 'approved-a', title: 'Copper Tide', year: 2013, added: 640, gib: 6 },
  { role: 'approved-b', title: 'The Ninth Lighthouse', year: 2006, added: 900, gib: 11, plays: [{ who: 'owner', days: 650 }] },
  { role: 'deleting', title: 'Saltmarsh Requiem', year: 2004, added: 990, gib: 18 },
  { role: 'postponed', title: 'A Map of Small Rivers', year: 2015, added: 520, gib: 5, plays: [{ who: 'home', days: 480 }] },
  { role: 'later-a', title: 'Glass Orchard Nights', year: 2017, added: 450, gib: 7 },
  { role: 'later-b', title: 'Paper Kites', year: 2012, added: 600, gib: 4, plays: [{ who: 'former', days: 430 }] },
  // The newest Tautulli row: 1 day ago (data rule 2). G4 protects it
  { role: 'recent', title: 'Signal at Dawn', year: 2019, added: 640, gib: 8, plays: [{ who: 'filtered', days: 1 }] },
  // Requested 20 days ago by a member with access who has not finished it (G7)
  { role: 'requested', title: 'Ferry to Norrow', year: 2020, added: 500, gib: 10 },
  // The Radarr tag "keep" (G9)
  { role: 'tagged', title: 'The Copper Atlas', year: 2008, added: 900, gib: 12, tags: [KEEP_TAG] },
  // Added 10 days ago (G6)
  { role: 'new', title: 'Brass Meadow', year: 2021, added: 10, gib: 6 },
  // A member is part-way through, 100 days ago (G5)
  { role: 'partway', title: 'Quiet Compass', year: 2016, added: 760, gib: 9, plays: [{ who: 'member', days: 100, kind: 'partial' }] },
  // Played 300 days ago: fails "more than 1 year" alone (a near miss)
  { role: 'near', title: 'Velvet Harbor', year: 2014, added: 600, gib: 7, plays: [{ who: 'owner', days: 300 }] },
  // Cannot delete: no Radarr record, a Plex file outside the Radarr folder, no Radarr file
  { role: 'no-arr', title: 'Hollow Signal', year: 2010, added: 650, gib: 5, arr: 'missing' },
  { role: 'outside', title: 'Misty Ferry Road', year: 2003, added: 680, gib: 6, arr: 'outside' },
  { role: 'no-file', title: 'Opal Garden', year: 2018, added: 720, gib: 3, arr: 'noFile' },
  // Matches the Review first rule, and an admin exclusion protects it (G3)
  { role: 'excluded', title: 'The Pale Atlas', year: 2005, added: 870, gib: 13, plays: [{ who: 'former', days: 520 }] },
];

const BATCH_WORDS = ['Amber', 'Birch', 'Cobalt', 'Driftwood', 'Ember', 'Fennel', 'Granite', 'Heron', 'Indigo', 'Juniper', 'Kestrel', 'Linen', 'Marigold', 'Nettle',
  'Oakmoss', 'Pebble', 'Quarry', 'Russet', 'Sorrel', 'Thistle', 'Umber', 'Vesper', 'Willow', 'Yarrow', 'Zephyr', 'Saffron', 'Tamarind'];
const BATCH_NOUNS = ['Crossing', 'Letters'];
/** The batch movies that the members' reasons need (TS 13.3): played, started, requested, and played by the filtered member. */
const BATCH_PLAYS: Record<number, PlaySpec[]> = {
  1: [{ who: 'member', days: 450 }],
  2: [{ who: 'member', days: 420, kind: 'partial' }],
  3: [{ who: 'brief', days: 380, kind: 'brief' }],
  4: [{ who: 'filtered', days: 460 }],
};
const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** Batch movie `n` (1 to 54): never played, or played 400 to 680 days ago. Every sixth carries the label "Untranscodable". */
function batchMovie(n: number): MovieSpec {
  const i = n - 1;
  const usual: PlaySpec[] = n % 3 === 0 ? [] : n % 3 === 1 ? [{ who: 'former', days: 400 + n * 5 }] : [{ who: n % 2 === 1 ? 'owner' : 'home', days: 420 + n * 4 }];
  return {
    role: `batch-${pad(n)}`,
    title: `${BATCH_WORDS[i % BATCH_WORDS.length]} ${BATCH_NOUNS[Math.floor(i / BATCH_WORDS.length)]}`,
    year: 1995 + (n % 25),
    added: 400 + n * 7,
    gib: 2 + ((n * 5) % 36),
    ...(n % 6 === 0 ? { labels: [UNTRANSCODABLE] } : {}),
    ...(n % 10 === 5 ? { tags: [IMPORT_TAG] } : {}),
    plays: BATCH_PLAYS[n] ?? usual,
  };
}
/** The batch movies of the Review first rule, with the pipeline movie: 55, above the typed approval limit of 50. */
export const BATCH_MOVIE_COUNT = 54;
const MOVIE_SPECS: MovieSpec[] = [...NAMED_MOVIES, ...Array.from({ length: BATCH_MOVIE_COUNT }, (_, i) => batchMovie(i + 1))];

const SHOW_SPECS: ShowSpec[] = [
  { role: 'ended-a', title: 'The Quill Street Archive', year: 2012, status: 'ended', added: 900, seasons: [{ episodes: 3, added: 900 }, { episodes: 3, added: 880 }] },
  { role: 'ended-b', title: 'Northgate Kitchen', year: 2014, status: 'ended', added: 880, tags: [IMPORT_TAG],
    seasons: [{ episodes: 3, added: 880 }, { episodes: 2, added: 860 }], plays: [{ who: 'former', days: 500, season: 1, episode: 1 }] },
  { role: 'ended-c', title: 'Harrow Valley Rangers', year: 2010, status: 'ended', added: 950, labels: ['Kids'],
    seasons: [{ episodes: 2, added: 950 }, { episodes: 2, added: 940 }],
    plays: [{ who: 'member', days: 451, season: 1, episode: 1 }, { who: 'member', days: 450, season: 1, episode: 2 }] },
  { role: 'excluded', title: 'The Marble Kitchen', year: 2016, status: 'ended', added: 800, seasons: [{ episodes: 3, added: 800 }, { episodes: 3, added: 790 }] },
  { role: 'auto-a', title: 'Tidewater Junction', year: 2015, status: 'continuing', added: 800,
    seasons: [{ episodes: 2, added: 800 }, { episodes: 3, added: 500 }, { episodes: 2, added: 60 }], plays: [{ who: 'filtered', days: 400, season: 1, episode: 1 }] },
  { role: 'auto-b', title: 'Cedar Line Radio', year: 2017, status: 'continuing', added: 700,
    seasons: [{ episodes: 2, added: 700 }, { episodes: 2, added: 600 }, { episodes: 2, added: 400 }, { episodes: 2, added: 90 }] },
  { role: 'recent', title: 'Night Ferry Diaries', year: 2020, status: 'continuing', added: 600,
    seasons: [{ episodes: 2, added: 600 }, { episodes: 2, added: 300 }], plays: [{ who: 'member', days: 2, season: 2, episode: 1, kind: 'partial' }] },
  { role: 'no-sonarr', title: 'Lamplight Detectives', year: 2011, status: 'ended', added: 700, arr: 'missing', seasons: [{ episodes: 2, added: 700 }] },
];

interface RequestSpec {
  id: number;
  type: 'movie' | 'tv';
  role: string;
  by: 'owner' | 'member' | 'filtered' | 'former';
  days: number;
  is4k?: boolean;
  seasons?: number[];
}
const REQUEST_SPECS: RequestSpec[] = [
  { id: 101, type: 'movie', role: 'requested', by: 'member', days: 20 },
  { id: 102, type: 'movie', role: 'batch-03', by: 'member', days: 300 },
  { id: 103, type: 'tv', role: 'ended-b', by: 'former', days: 700, seasons: [1, 2] },
  { id: 104, type: 'movie', role: 'kept', by: 'owner', days: 790 },
  { id: 105, type: 'tv', role: 'auto-a', by: 'filtered', days: 200, seasons: [1] },
  { id: 106, type: 'movie', role: 'recent', by: 'filtered', days: 600, is4k: true },
];
/** Overseerr user ids, by person. */
const SEERR_USER_IDS = { owner: 1, member: 2, filtered: 3, former: 4 } as const;

/* ------------------------------------------------------------------ World */

export interface WorldMovie {
  role: string;
  title: string;
  year: number;
  ratingKey: string;
  tmdb: number;
  imdb: string;
  guid: string;
  addedAt: number;
  bytes: number;
  file: string;
  labels: string[];
  arr: { id: number; titleSlug: string; path: string; hasFile: boolean; fileId: number | null; tags: number[] } | null;
  key: string;
}
export interface WorldEpisode {
  number: number;
  ratingKey: string;
  guid: string;
  addedAt: number;
  file: string;
  bytes: number;
  fileId: number;
  episodeId: number;
}
export interface WorldSeason {
  number: number;
  ratingKey: string;
  guid: string;
  addedAt: number;
  episodes: WorldEpisode[];
  bytes: number;
  key: string;
}
export interface WorldShow {
  role: string;
  title: string;
  year: number;
  status: 'ended' | 'continuing';
  ratingKey: string;
  tvdb: number;
  tmdb: number;
  imdb: string;
  guid: string;
  addedAt: number;
  labels: string[];
  arr: { id: number; titleSlug: string; path: string; tags: number[] } | null;
  seasons: WorldSeason[];
  key: string;
}
/** One Tautulli history row, as the mock serves it. */
export interface WorldPlay {
  row_id: number;
  reference_id: number;
  id: number;
  date: number;
  started: number;
  stopped: number;
  duration: number;
  play_duration: number;
  paused_counter: number;
  user_id: number;
  user: string;
  friendly_name: string;
  platform: string;
  product: string;
  player: string;
  live: 0;
  machine_id: string;
  location: string;
  secure: number;
  relayed: number;
  media_type: 'movie' | 'episode';
  rating_key: number;
  parent_rating_key: number | '';
  grandparent_rating_key: number | '';
  full_title: string;
  title: string;
  parent_title: string;
  grandparent_title: string;
  original_title: string;
  year: number;
  media_index: number | '';
  parent_media_index: number | '';
  thumb: string;
  originally_available_at: string;
  guid: string;
  transcode_decision: string;
  percent_complete: number;
  watched_status: number;
  group_count: number;
  group_ids: string;
  state: null;
  session_key: null;
}

/** A Plex collection as the Plex mock keeps it in memory. */
export interface WorldCollection {
  ratingKey: string;
  sectionId: string;
  title: string;
  subtype: 'movie' | 'show';
  summary: string;
  addedAt: number;
  items: string[];
}
/** A collection hub as the Plex mock keeps it. */
export interface WorldHub {
  identifier: string;
  sectionId: string;
  ratingKey: string;
  title: string;
  promotedToRecommended: boolean;
  promotedToOwnHome: boolean;
  promotedToSharedHome: boolean;
}
export interface PlexTvUserSpec {
  id: string;
  username: string;
  title: string;
  email: string | null;
  home: boolean;
  restricted: boolean;
  /** The share of the mock's server, or null (a managed Home user). */
  share: { id: string; pending: boolean } | null;
}
export interface SharedServerSpec {
  id: string;
  userId: string;
  username: string;
  email: string;
  filterMovies: string;
  sections: { key: string; title: string; type: 'movie' | 'show'; shared: boolean }[];
}

/** Every answer of the mocks, in the shapes of the `w1-conn-read` fixtures. */
export interface CleanupAnswers {
  plex: {
    sections: Record<string, unknown>[];
    /** The listing rows by section id and listing type (1 movie, 2 show, 3 season, 4 episode). */
    rows: Record<string, Record<number, Record<string, unknown>[]>>;
    /** `/library/metadata/{ratingKey}`: the item, with its section. */
    metadata: Record<string, { sectionId: string; entry: Record<string, unknown> }>;
    /** `/library/metadata/{ratingKey}/children`. */
    children: Record<string, Record<string, unknown>[]>;
    collections: WorldCollection[];
    hubs: WorldHub[];
  };
  radarr: { rootfolder: unknown[]; movies: Record<string, unknown>[]; tags: unknown[]; importlists: unknown[]; diskspace: unknown[] };
  sonarr: {
    rootfolder: unknown[];
    series: Record<string, unknown>[];
    tags: unknown[];
    importlists: unknown[];
    diskspace: unknown[];
    episodefiles: Record<string, unknown>[];
    episodes: Record<string, unknown>[];
  };
  overseerr: { users: Record<string, unknown>[]; requests: Record<string, unknown>[] };
  tautulli: { history: WorldPlay[] };
  plexTv: { users: PlexTvUserSpec[]; sharedServers: SharedServerSpec[] };
}

export interface CleanupWorld {
  now: number;
  timeZone: string;
  movies: WorldMovie[];
  shows: WorldShow[];
  answers: CleanupAnswers;
  snapshot: { sources: SourceStatus[]; facts: SnapshotFacts; parts: Record<Level, SnapshotItem[]> };
}

const iso = (s: number) => new Date(s * 1000).toISOString();
const slug = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

const MOVIE_SECONDS = 6000;
const EPISODE_SECONDS = 1500;

function buildMovies(nowS: number): WorldMovie[] {
  return MOVIE_SPECS.map((spec, i) => {
    const ratingKey = String(1001 + i);
    const tmdb = 770001 + i;
    const folder = `${CLEANUP_ROOTS.radarr}/${spec.title} (${spec.year})`;
    const plexFolder = spec.arr === 'outside' ? `${folder} Extended` : folder;
    const arrState = spec.arr ?? 'ok';
    return {
      role: spec.role,
      title: spec.title,
      year: spec.year,
      ratingKey,
      tmdb,
      imdb: `tt${7700001 + i}`,
      guid: `plex://movie/e2ecleanup${ratingKey}`,
      addedAt: nowS - spec.added * DAY_S,
      bytes: spec.gib * GiB,
      file: `${plexFolder}/${spec.title} (${spec.year}).mkv`,
      labels: spec.labels ?? [],
      arr: arrState === 'missing' ? null : {
        id: 1 + i,
        titleSlug: `${slug(spec.title)}-${tmdb}`,
        path: folder,
        hasFile: arrState !== 'noFile',
        fileId: arrState === 'noFile' ? null : 30001 + i,
        tags: spec.tags ?? [],
      },
      key: `movie:tmdb:${tmdb}`,
    };
  });
}

function buildShows(nowS: number): WorldShow[] {
  let seasonKey = 3001;
  let episodeKey = 4001;
  let fileId = 50001;
  let episodeId = 60001;
  return SHOW_SPECS.map((spec, j) => {
    const tvdb = 880001 + j;
    const path = `${CLEANUP_ROOTS.sonarr}/${spec.title}`;
    const ratingKey = String(2001 + j);
    const seasons = spec.seasons.map((season, s): WorldSeason => {
      const number = s + 1;
      const rk = String(seasonKey++);
      const episodes = Array.from({ length: season.episodes }, (_, e): WorldEpisode => {
        const ek = String(episodeKey++);
        return {
          number: e + 1,
          ratingKey: ek,
          guid: `plex://episode/e2ecleanup${ek}`,
          addedAt: nowS - season.added * DAY_S + e * 3600,
          file: `${path}/Season ${pad(number)}/${spec.title} - S${pad(number)}E${pad(e + 1)}.mkv`,
          bytes: [GiB, 1.5 * GiB, 2 * GiB][(e + number) % 3],
          fileId: fileId++,
          episodeId: episodeId++,
        };
      });
      return {
        number,
        ratingKey: rk,
        guid: `plex://season/e2ecleanup${rk}`,
        addedAt: nowS - season.added * DAY_S,
        episodes,
        bytes: sum(episodes.map((ep) => ep.bytes)),
        key: `season:tvdb:${tvdb}:${number}`,
      };
    });
    return {
      role: spec.role,
      title: spec.title,
      year: spec.year,
      status: spec.status,
      ratingKey,
      tvdb,
      tmdb: 881001 + j,
      imdb: `tt${8800001 + j}`,
      guid: `plex://show/e2ecleanup${ratingKey}`,
      addedAt: nowS - spec.added * DAY_S,
      labels: spec.labels ?? [],
      arr: spec.arr === 'missing' ? null : { id: 1 + j, titleSlug: slug(spec.title), path, tags: spec.tags ?? [] },
      seasons,
      key: `show:tvdb:${tvdb}`,
    };
  });
}

/** A play's numbers: a finished play reaches 97 %, a partial one 40 %, a brief one lasts 60 s and does not count. */
function playNumbers(kind: PlayKind, length: number) {
  if (kind === 'brief') return { play: 60, percent: 1, watched: 0 };
  if (kind === 'partial') return { play: Math.round(length * 0.4), percent: 40, watched: 0 };
  return { play: Math.round(length * 0.97), percent: 97, watched: 1 };
}

/** The history rows of the world, oldest first, with ascending `row_id`s. */
function buildHistory(nowS: number, movies: WorldMovie[], shows: WorldShow[]): WorldPlay[] {
  const drafts: Omit<WorldPlay, 'row_id' | 'reference_id' | 'id' | 'group_ids'>[] = [];
  const row = (play: PlaySpec, length: number, fields: Pick<WorldPlay, 'media_type' | 'rating_key' | 'parent_rating_key' | 'grandparent_rating_key' |
    'full_title' | 'title' | 'parent_title' | 'grandparent_title' | 'year' | 'media_index' | 'parent_media_index' | 'guid'>) => {
    const { play: seconds, percent, watched } = playNumbers(play.kind ?? 'finished', length);
    const user = CLEANUP_PEOPLE[play.who];
    // Two hours before the clock, and one minute apart, so no two rows start in the same second
    const started = nowS - play.days * DAY_S - 7200 - drafts.length * 60;
    drafts.push({
      date: started, started, stopped: started + seconds, duration: seconds, play_duration: seconds, paused_counter: 0,
      user_id: Number(user), user: `viewer-${user}`, friendly_name: `Viewer ${user}`,
      platform: 'Android', product: 'Plex for Android (TV)', player: 'Living room', live: 0, machine_id: 'e2e-cleanup-player', location: 'lan',
      secure: 1, relayed: 0, original_title: '', thumb: `/library/metadata/${fields.rating_key}/thumb/${started}`, originally_available_at: `${fields.year}-05-01`,
      transcode_decision: 'direct play', percent_complete: percent, watched_status: watched, group_count: 1, state: null, session_key: null,
      ...fields,
    });
  };
  for (const movie of movies) {
    for (const play of MOVIE_SPECS.find((spec) => spec.role === movie.role)?.plays ?? []) {
      row(play, MOVIE_SECONDS, {
        media_type: 'movie', rating_key: Number(movie.ratingKey), parent_rating_key: '', grandparent_rating_key: '', full_title: movie.title,
        title: movie.title, parent_title: '', grandparent_title: '', year: movie.year, media_index: '', parent_media_index: '', guid: movie.guid,
      });
    }
  }
  for (const show of shows) {
    for (const play of SHOW_SPECS.find((spec) => spec.role === show.role)?.plays ?? []) {
      const season = show.seasons[play.season - 1];
      const episode = season.episodes[play.episode - 1];
      row(play, EPISODE_SECONDS, {
        media_type: 'episode', rating_key: Number(episode.ratingKey), parent_rating_key: Number(season.ratingKey),
        grandparent_rating_key: Number(show.ratingKey), full_title: `${show.title} - Episode ${episode.number}`, title: `Episode ${episode.number}`,
        parent_title: `Season ${season.number}`, grandparent_title: show.title, year: show.year, media_index: episode.number,
        parent_media_index: season.number, guid: episode.guid,
      });
    }
  }
  return drafts
    .sort((a, b) => a.started - b.started)
    .map((draft, i) => ({ ...draft, row_id: 70001 + i, reference_id: 70001 + i, id: 70001 + i, group_ids: String(70001 + i) }));
}

/** A counted play (E15, `isCountedPlay`): 120 s or 90 %. @internal Exported for `seed-cleanup.test.ts`. */
export const isCountedRow = (row: Pick<WorldPlay, 'play_duration' | 'percent_complete'>) => row.play_duration >= 120 || row.percent_complete >= 90;
/** A finished play (E15, `isFinished`): marked watched, or 90 %. @internal Exported for `seed-cleanup.test.ts`. */
export const isFinishedRow = (row: Pick<WorldPlay, 'watched_status' | 'percent_complete'>) => row.watched_status >= 1 || row.percent_complete >= 90;

/** The `plays` of an item from its rows (TS 7.6 steps 5 and 8). `episodes`: the episode keys on disk (show, season), or null (movie). */
function aggregatePlays(rows: readonly WorldPlay[], episodes: readonly string[] | null): NonNullable<SnapshotItem['plays']> {
  const viewers = new Map<string, Viewer & { finishedSet: Set<string>; newest: number }>();
  const countedAt: number[] = [];
  for (const row of rows) {
    const counted = isCountedRow(row);
    const finished = isFinishedRow(row);
    if (!counted && !finished) continue;
    const user = String(row.user_id);
    const viewer = viewers.get(user) ?? { user, lastCountedAt: null, lastCountedFinished: false, counted: 0, finished: false, finishedEpisodes: 0,
      finishedSet: new Set<string>(), newest: -1 };
    if (counted) {
      countedAt.push(row.started);
      viewer.counted += 1;
      if (row.started > viewer.newest) {
        viewer.newest = row.started;
        viewer.lastCountedAt = row.started;
        viewer.lastCountedFinished = finished;
      }
    }
    if (finished) {
      if (episodes === null) viewer.finished = true;
      else viewer.finishedSet.add(String(row.rating_key));
    }
    viewers.set(user, viewer);
  }
  const list = [...viewers.values()].map(({ finishedSet, newest: _newest, ...viewer }) => {
    if (episodes === null) return viewer;
    const finishedEpisodes = episodes.filter((key) => finishedSet.has(key)).length;
    return { ...viewer, finishedEpisodes, finished: episodes.length > 0 && finishedEpisodes >= episodes.length };
  });
  countedAt.sort((a, b) => a - b);
  return { lastCountedAt: countedAt.length > 0 ? countedAt[countedAt.length - 1] : null, countedAt, viewers: list.sort((a, b) => a.user.localeCompare(b.user)) };
}

/** Builds the world at `now` (epoch ms). `timeZone` is the server zone of the seed's day keys (leave dates, hold dates). */
export function buildCleanupWorld(now: number, timeZone = 'UTC'): CleanupWorld {
  const nowS = Math.floor(now / 1000);
  const movies = buildMovies(nowS);
  const shows = buildShows(nowS);
  const history = buildHistory(nowS, movies, shows);
  const answers = buildAnswers(nowS, movies, shows, history);
  const snapshot = buildSnapshot(nowS, movies, shows, history);
  return { now, timeZone, movies, shows, answers, snapshot };
}

/* ---------------------------------------------------------------- Answers */

function plexMovieRow(movie: WorldMovie): Record<string, unknown> {
  return {
    ratingKey: movie.ratingKey, key: `/library/metadata/${movie.ratingKey}`, guid: movie.guid, slug: slug(movie.title), type: 'movie', title: movie.title,
    librarySectionTitle: 'Movies', librarySectionID: Number(CLEANUP_SECTIONS.movies), librarySectionKey: `/library/sections/${CLEANUP_SECTIONS.movies}`,
    summary: 'An invented film for the cleanup end-to-end tests.', year: movie.year, thumb: `/library/metadata/${movie.ratingKey}/thumb/${movie.addedAt}`,
    duration: MOVIE_SECONDS * 1000, addedAt: movie.addedAt, updatedAt: movie.addedAt,
    Media: [{ id: Number(movie.ratingKey) * 10, duration: MOVIE_SECONDS * 1000, container: 'mkv', videoResolution: '1080',
      Part: [{ id: Number(movie.ratingKey) * 100, key: `/library/parts/${Number(movie.ratingKey) * 100}/file.mkv`, file: movie.file, size: movie.bytes, container: 'mkv' }] }],
    Guid: [{ id: `imdb://${movie.imdb}` }, { id: `tmdb://${movie.tmdb}` }],
    ...(movie.labels.length > 0 ? { Label: movie.labels.map((tag) => ({ tag })) } : {}),
  };
}

function plexShowRow(show: WorldShow): Record<string, unknown> {
  const episodes = show.seasons.flatMap((season) => season.episodes);
  return {
    ratingKey: show.ratingKey, key: `/library/metadata/${show.ratingKey}/children`, guid: show.guid, slug: slug(show.title), type: 'show', title: show.title,
    librarySectionTitle: 'TV Shows', librarySectionID: Number(CLEANUP_SECTIONS.shows), summary: 'An invented series for the cleanup end-to-end tests.',
    year: show.year, leafCount: episodes.length, childCount: show.seasons.length, thumb: `/library/metadata/${show.ratingKey}/thumb/${show.addedAt}`,
    addedAt: show.addedAt, updatedAt: show.addedAt,
    Guid: [{ id: `imdb://${show.imdb}` }, { id: `tmdb://${show.tmdb}` }, { id: `tvdb://${show.tvdb}` }],
    ...(show.labels.length > 0 ? { Label: show.labels.map((tag) => ({ tag })) } : {}),
  };
}

function plexSeasonRow(show: WorldShow, season: WorldSeason): Record<string, unknown> {
  return {
    ratingKey: season.ratingKey, key: `/library/metadata/${season.ratingKey}/children`, parentRatingKey: show.ratingKey, guid: season.guid,
    parentGuid: show.guid, type: 'season', title: `Season ${season.number}`, parentKey: `/library/metadata/${show.ratingKey}`, parentTitle: show.title,
    librarySectionID: Number(CLEANUP_SECTIONS.shows), index: season.number, parentIndex: 1, leafCount: season.episodes.length,
    thumb: `/library/metadata/${season.ratingKey}/thumb/${season.addedAt}`, addedAt: season.addedAt, updatedAt: season.addedAt,
  };
}

function plexEpisodeRow(show: WorldShow, season: WorldSeason, episode: WorldEpisode): Record<string, unknown> {
  return {
    ratingKey: episode.ratingKey, key: `/library/metadata/${episode.ratingKey}`, parentRatingKey: season.ratingKey, grandparentRatingKey: show.ratingKey,
    guid: episode.guid, parentGuid: season.guid, grandparentGuid: show.guid, type: 'episode', title: `Episode ${episode.number}`,
    grandparentTitle: show.title, parentTitle: `Season ${season.number}`, librarySectionID: Number(CLEANUP_SECTIONS.shows), index: episode.number,
    parentIndex: season.number, year: show.year, duration: EPISODE_SECONDS * 1000, addedAt: episode.addedAt, updatedAt: episode.addedAt,
    Media: [{ id: Number(episode.ratingKey) * 10, duration: EPISODE_SECONDS * 1000, container: 'mkv', videoResolution: '1080',
      Part: [{ id: Number(episode.ratingKey) * 100, key: `/library/parts/${Number(episode.ratingKey) * 100}/file.mkv`, file: episode.file, size: episode.bytes, container: 'mkv' }] }],
  };
}

const plexSection = (key: string, type: 'movie' | 'show', title: string, path: string, agent: string, nowS: number) => ({
  allowSync: true, art: `/:/resources/${type}-fanart.jpg`, filters: true, refreshing: false, thumb: `/:/resources/${type}.png`, key, type, title, agent,
  scanner: type === 'movie' ? 'Plex Movie' : 'Plex TV Series', language: 'en-US', uuid: `e2e-cleanup-section-${key}`, updatedAt: nowS - DAY_S,
  createdAt: nowS - 2000 * DAY_S, scannedAt: nowS - DAY_S, content: true, directory: true, hidden: 0, Location: [{ id: Number(key), path }],
});

function radarrMovie(movie: WorldMovie, nowS: number): Record<string, unknown> | null {
  const arr = movie.arr;
  if (!arr) return null;
  const bytes = arr.hasFile ? movie.bytes : 0;
  return {
    title: movie.title, originalTitle: movie.title, sortTitle: movie.title.toLowerCase(), sizeOnDisk: bytes, status: 'released',
    overview: 'An invented film.', year: movie.year, path: arr.path, qualityProfileId: 4, hasFile: arr.hasFile,
    ...(arr.fileId === null ? {} : { movieFileId: arr.fileId }), monitored: true, minimumAvailability: 'released', isAvailable: true,
    folderName: arr.path, runtime: 100, cleanTitle: slug(movie.title).replace(/-/g, ''), tmdbId: movie.tmdb, imdbId: movie.imdb,
    titleSlug: arr.titleSlug, rootFolderPath: CLEANUP_ROOTS.radarr, genres: [], tags: arr.tags, added: iso(movie.addedAt),
    statistics: { movieFileCount: arr.hasFile ? 1 : 0, sizeOnDisk: bytes, releaseGroups: [] }, id: arr.id,
    images: [], alternateTitles: [], ratings: {}, popularity: 1, inCinemas: `${movie.year}-05-01T00:00:00Z`, lastSearchTime: iso(nowS - DAY_S),
  };
}

function seasonStatistics(season: WorldSeason) {
  return {
    previousAiring: iso(season.addedAt), episodeFileCount: season.episodes.length, episodeCount: season.episodes.length,
    totalEpisodeCount: season.episodes.length, sizeOnDisk: season.bytes, releaseGroups: [], percentOfEpisodes: 100,
  };
}

function sonarrSeries(show: WorldShow): Record<string, unknown> | null {
  const arr = show.arr;
  if (!arr) return null;
  const episodes = show.seasons.flatMap((season) => season.episodes);
  return {
    title: show.title, sortTitle: show.title.toLowerCase(), status: show.status, ended: show.status === 'ended', overview: 'An invented series.',
    network: 'Invented Network', airTime: '21:00', images: [], originalLanguage: { id: 1, name: 'English' },
    seasons: show.seasons.map((season) => ({ seasonNumber: season.number, monitored: true, statistics: seasonStatistics(season) })),
    year: show.year, path: arr.path, qualityProfileId: 4, seasonFolder: true, monitored: true, monitorNewItems: 'all', useSceneNumbering: false,
    runtime: 25, tvdbId: show.tvdb, tvRageId: 0, tvMazeId: 0, tmdbId: show.tmdb, imdbId: show.imdb, seriesType: 'standard',
    cleanTitle: arr.titleSlug.replace(/-/g, ''), titleSlug: arr.titleSlug, rootFolderPath: CLEANUP_ROOTS.sonarr, genres: [], tags: arr.tags,
    added: iso(show.addedAt), ratings: {},
    statistics: { seasonCount: show.seasons.length, episodeFileCount: episodes.length, episodeCount: episodes.length, totalEpisodeCount: episodes.length,
      sizeOnDisk: sum(show.seasons.map((season) => season.bytes)), releaseGroups: [], percentOfEpisodes: 100 },
    id: arr.id,
  };
}

const arrTags = [{ label: 'keep', id: KEEP_TAG }, { label: 'from-list', id: IMPORT_TAG }];
const importList = (root: string) => [{ enableAuto: true, rootFolderPath: root, qualityProfileId: 4, searchOnAdd: false, listType: 'trakt', listOrder: 1,
  name: 'Invented list', fields: [], implementationName: 'Trakt List', implementation: 'TraktListImport', configContract: 'TraktListSettings', tags: [IMPORT_TAG],
  enabled: true, id: 1 }];
const DISK = { path: '/data', label: 'data', freeSpace: 2 * TiB, totalSpace: 16 * TiB };
const rootFolder = (path: string) => [{ path, accessible: true, freeSpace: DISK.freeSpace, unmappedFolders: [], id: 1 }];

function seerrUser(who: keyof typeof SEERR_USER_IDS, nowS: number) {
  const plexId = CLEANUP_PEOPLE[who];
  return {
    permissions: 32, id: SEERR_USER_IDS[who], email: `viewer-${plexId}@example.test`, plexUsername: `viewer-${plexId}`, jellyfinUsername: null,
    username: null, userType: 1, plexId: Number(plexId), avatar: '/avatarproxy/invented', createdAt: iso(nowS - 1000 * DAY_S), updatedAt: iso(nowS - 100 * DAY_S),
    requestCount: REQUEST_SPECS.filter((spec) => spec.by === who).length, displayName: `viewer-${plexId}`,
  };
}

function seerrRequest(spec: RequestSpec, nowS: number, movies: WorldMovie[], shows: WorldShow[]) {
  const at = iso(nowS - spec.days * DAY_S);
  const movie = spec.type === 'movie' ? movies.find((m) => m.role === spec.role) : undefined;
  const show = spec.type === 'tv' ? shows.find((s) => s.role === spec.role) : undefined;
  if (!movie && !show) throw new Error(`No title for request ${spec.id}`);
  return {
    id: spec.id, status: 2, createdAt: at, updatedAt: at, type: spec.type, is4k: spec.is4k ?? false, serverId: 0, profileId: 4,
    rootFolder: spec.type === 'movie' ? CLEANUP_ROOTS.radarr : CLEANUP_ROOTS.sonarr, languageProfileId: null, tags: [], isAutoRequest: false,
    media: {
      downloadStatus: [], downloadStatus4k: [], id: 500 + spec.id, mediaType: spec.type, tmdbId: movie?.tmdb ?? show?.tmdb ?? null,
      tvdbId: show?.tvdb ?? null, imdbId: null, status: 5, status4k: 1, createdAt: at, updatedAt: at, ratingKey: movie?.ratingKey ?? show?.ratingKey,
    },
    seasons: (spec.seasons ?? []).map((seasonNumber) => ({ id: spec.id * 10 + seasonNumber, seasonNumber, status: 2, createdAt: at, updatedAt: at })),
    modifiedBy: seerrUser('owner', nowS),
    requestedBy: seerrUser(spec.by, nowS),
  };
}

function buildAnswers(nowS: number, movies: WorldMovie[], shows: WorldShow[], history: WorldPlay[]): CleanupAnswers {
  const metadata: CleanupAnswers['plex']['metadata'] = {};
  const children: CleanupAnswers['plex']['children'] = {};
  const seasonRows: Record<string, unknown>[] = [];
  const episodeRows: Record<string, unknown>[] = [];
  for (const movie of movies) metadata[movie.ratingKey] = { sectionId: CLEANUP_SECTIONS.movies, entry: plexMovieRow(movie) };
  for (const show of shows) {
    metadata[show.ratingKey] = { sectionId: CLEANUP_SECTIONS.shows, entry: plexShowRow(show) };
    children[show.ratingKey] = show.seasons.map((season) => plexSeasonRow(show, season));
    for (const season of show.seasons) {
      const row = plexSeasonRow(show, season);
      seasonRows.push(row);
      metadata[season.ratingKey] = { sectionId: CLEANUP_SECTIONS.shows, entry: row };
      children[season.ratingKey] = season.episodes.map((episode) => plexEpisodeRow(show, season, episode));
      for (const episode of season.episodes) {
        const episodeRow = plexEpisodeRow(show, season, episode);
        episodeRows.push(episodeRow);
        metadata[episode.ratingKey] = { sectionId: CLEANUP_SECTIONS.shows, entry: episodeRow };
      }
    }
  }
  const role = (name: string) => movies.find((movie) => movie.role === name)?.ratingKey ?? '';
  const collections: WorldCollection[] = [
    { ...CLEANUP_COLLECTION, subtype: 'movie', addedAt: nowS - 20 * DAY_S, items: [role('pipeline')],
      summary: `These titles leave ${CLEANUP_PLEX.serverName} soon, the soonest first. To keep one, open Leaving soon in the app.` },
    { ratingKey: '90002', sectionId: CLEANUP_SECTIONS.movies, title: 'Rainy Sunday Picks', subtype: 'movie', addedAt: nowS - 400 * DAY_S,
      items: [role('later-a'), role('later-b')], summary: '' },
  ];
  const showFiles = shows.flatMap((show) => (show.arr ? show.seasons.flatMap((season) => season.episodes.map((episode) => ({ show, season, episode }))) : []));
  return {
    plex: {
      sections: [
        plexSection(CLEANUP_SECTIONS.movies, 'movie', 'Movies', CLEANUP_ROOTS.radarr, 'tv.plex.agents.movie', nowS),
        plexSection(CLEANUP_SECTIONS.shows, 'show', 'TV Shows', CLEANUP_ROOTS.sonarr, 'tv.plex.agents.series', nowS),
      ],
      rows: {
        [CLEANUP_SECTIONS.movies]: { 1: movies.map(plexMovieRow) },
        [CLEANUP_SECTIONS.shows]: { 2: shows.map(plexShowRow), 3: seasonRows, 4: episodeRows },
      },
      metadata,
      children,
      collections,
      hubs: [{ identifier: `custom.collection.${CLEANUP_COLLECTION.sectionId}.${CLEANUP_COLLECTION.ratingKey}`, sectionId: CLEANUP_COLLECTION.sectionId,
        ratingKey: CLEANUP_COLLECTION.ratingKey, title: CLEANUP_COLLECTION.title, promotedToRecommended: false, promotedToOwnHome: true, promotedToSharedHome: true }],
    },
    radarr: {
      rootfolder: rootFolder(CLEANUP_ROOTS.radarr),
      movies: movies.map((movie) => radarrMovie(movie, nowS)).filter((row): row is Record<string, unknown> => row !== null),
      tags: arrTags,
      importlists: importList(CLEANUP_ROOTS.radarr),
      diskspace: [DISK],
    },
    sonarr: {
      rootfolder: rootFolder(CLEANUP_ROOTS.sonarr),
      series: shows.map(sonarrSeries).filter((row): row is Record<string, unknown> => row !== null),
      tags: arrTags,
      importlists: importList(CLEANUP_ROOTS.sonarr),
      diskspace: [DISK],
      episodefiles: showFiles.map(({ show, season, episode }) => ({
        seriesId: show.arr?.id, seasonNumber: season.number, relativePath: episode.file.slice((show.arr?.path.length ?? 0) + 1), path: episode.file,
        size: episode.bytes, dateAdded: iso(episode.addedAt), releaseGroup: 'INVENTED', languages: [{ id: 1, name: 'English' }],
        quality: { quality: { id: 3, name: 'WEBDL-1080p', source: 'web', resolution: 1080 }, revision: { version: 1, real: 0, isRepack: false } }, id: episode.fileId,
      })),
      episodes: showFiles.map(({ show, season, episode }) => ({
        seriesId: show.arr?.id, tvdbId: 6600000 + episode.episodeId, episodeFileId: episode.fileId, seasonNumber: season.number, episodeNumber: episode.number,
        title: `Episode ${episode.number}`, airDate: iso(episode.addedAt).slice(0, 10), hasFile: true, monitored: true, id: episode.episodeId,
      })),
    },
    overseerr: {
      users: (Object.keys(SEERR_USER_IDS) as (keyof typeof SEERR_USER_IDS)[]).map((who) => seerrUser(who, nowS)),
      requests: REQUEST_SPECS.map((spec) => seerrRequest(spec, nowS, movies, shows)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    },
    tautulli: { history },
    plexTv: buildPlexTv(),
  };
}

function buildPlexTv(): CleanupAnswers['plexTv'] {
  const sections: SharedServerSpec['sections'] = [
    { key: CLEANUP_SECTIONS.movies, title: 'Movies', type: 'movie', shared: true },
    { key: CLEANUP_SECTIONS.shows, title: 'TV Shows', type: 'show', shared: true },
  ];
  const member = CLEANUP_MEMBERS.member;
  const filtered = CLEANUP_MEMBERS.filtered;
  return {
    users: [
      { id: member.plexUserId, username: 'cleanup-member', title: 'cleanup-member', email: member.email, home: false, restricted: false, share: { id: '8100001', pending: false } },
      { id: filtered.plexUserId, username: 'cleanup-filtered', title: 'cleanup-filtered', email: filtered.email, home: false, restricted: false,
        share: { id: '8100002', pending: false } },
      { id: CLEANUP_PEOPLE.home, username: '', title: 'Den screen', email: null, home: true, restricted: true, share: null },
      { id: CLEANUP_PEOPLE.pending, username: 'cleanup-invitee', title: 'cleanup-invitee', email: 'e2e-cleanup-invitee@example.com', home: false,
        restricted: false, share: { id: '8100005', pending: true } },
    ],
    sharedServers: [
      { id: '8100001', userId: member.plexUserId, username: 'cleanup-member', email: member.email, filterMovies: '', sections },
      { id: '8100002', userId: filtered.plexUserId, username: 'cleanup-filtered', email: filtered.email, filterMovies: `label!=${UNTRANSCODABLE}`, sections },
      { id: '8100005', userId: '0', username: '', email: 'e2e-cleanup-invitee@example.com', filterMovies: '', sections: [sections[0]] },
    ],
  };
}

const xmlEscape = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const attributes = (values: Record<string, string | number>) =>
  Object.entries(values).map(([name, value]) => `${name}="${xmlEscape(String(value))}"`).join(' ');

/** plex.tv `GET /api/users` of the world's owner, as XML. */
export function plexTvUsersXml(world: CleanupWorld): string {
  const users = world.answers.plexTv.users.map((user) => {
    const head = attributes({ id: user.id, title: user.title, username: user.username, email: user.email ?? '', recommendationsPlaylistId: '',
      thumb: `https://plex.tv/users/e2e${user.id}/avatar`, protected: user.restricted ? 1 : 0, home: user.home ? 1 : 0, allowTuners: 0, allowSync: 0,
      allowCameraUpload: 0, allowChannels: 0, allowSubtitleAdmin: 0, filterAll: '', filterMovies: '', filterMusic: '', filterPhotos: '',
      filterTelevision: '', restricted: user.restricted ? 1 : 0 });
    if (!user.share) return `  <User ${head}/>`;
    const server = attributes({ id: user.share.id, serverId: '7100001', machineIdentifier: CLEANUP_PLEX.machineIdentifier, name: CLEANUP_PLEX.serverName,
      lastSeenAt: Math.floor(world.now / 1000) - DAY_S, numLibraries: 2, allLibraries: 0, owned: 0, pending: user.share.pending ? 1 : 0 });
    return `  <User ${head}>\n    <Server ${server}/>\n  </User>`;
  });
  const container = attributes({ friendlyName: 'myPlex', identifier: 'com.plexapp.plugins.myplex', machineIdentifier: CLEANUP_PLEX.machineIdentifier,
    totalSize: users.length, size: users.length });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<MediaContainer ${container}>\n${users.join('\n')}\n</MediaContainer>\n`;
}

/** plex.tv `GET /api/servers/{machineIdentifier}/shared_servers` of the mock's server, as XML. */
export function sharedServersXml(world: CleanupWorld): string {
  const nowS = Math.floor(world.now / 1000);
  const shares = world.answers.plexTv.sharedServers.map((share) => {
    const head = attributes({ id: share.id, username: share.username, email: share.email, userID: share.userId, accessToken: `redacted-${share.id}`,
      name: CLEANUP_PLEX.serverName, acceptedAt: share.userId === '0' ? 0 : nowS - 300 * DAY_S, invitedAt: nowS - 301 * DAY_S, allowSync: 0,
      allowCameraUpload: 0, allowChannels: 0, allowTuners: 0, allowSubtitleAdmin: 0, owned: 0, allLibraries: 0, filterAll: '',
      filterMovies: share.filterMovies, filterMusic: '', filterPhotos: '', filterTelevision: '' });
    const sections = share.sections.map((section, i) =>
      `    <Section ${attributes({ id: 6100001 + i, key: section.key, title: section.title, type: section.type, shared: section.shared ? 1 : 0 })}/>`);
    return `  <SharedServer ${head}>\n${sections.join('\n')}\n  </SharedServer>`;
  });
  const container = attributes({ friendlyName: 'myPlex', identifier: 'com.plexapp.plugins.myplex', machineIdentifier: CLEANUP_PLEX.machineIdentifier,
    size: shares.length });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<MediaContainer ${container}>\n${shares.join('\n')}\n</MediaContainer>\n`;
}

/* --------------------------------------------------------------- Snapshot */

interface SnapshotContext {
  nowS: number;
  history: WorldPlay[];
  requests: { spec: RequestSpec; fact: RequestFact }[];
  movies: WorldMovie[];
  shows: WorldShow[];
}

const ACCESS: readonly CleanupPerson[] = ['owner', 'member', 'filtered', 'home'];

function requestsOf(ctx: SnapshotContext, type: 'movie' | 'tv', role: string, season?: number): RequestFact[] {
  return ctx.requests
    .filter(({ spec }) => spec.type === type && spec.role === role)
    .filter(({ fact }) => season === undefined || fact.seasons === null || fact.seasons.includes(season))
    .map(({ fact }) => fact);
}

function movieItem(movie: WorldMovie, ctx: SnapshotContext): SnapshotItem {
  const arr = movie.arr;
  const match: SnapshotItem['match'] = !arr ? { state: 'unmatched', cause: 'noArrRecord' }
    : !arr.hasFile ? { state: 'notManaged', cause: 'noArrFile', by: 'tmdb' }
    : !movie.file.startsWith(`${arr.path}/`) ? { state: 'notManaged', cause: 'outsideArrPath', by: 'tmdb' }
    : { state: 'matched', by: 'tmdb' };
  return {
    key: movie.key, level: 'movie', titleKey: `tmdb:${movie.tmdb}`, title: movie.title, year: movie.year, seasonNumber: null, showKey: null,
    sectionId: CLEANUP_SECTIONS.movies, ratingKey: movie.ratingKey, copies: [{ ratingKey: movie.ratingKey, sectionId: CLEANUP_SECTIONS.movies }], episodeKeys: [],
    ids: { tmdb: movie.tmdb, imdb: movie.imdb, plex: movie.guid },
    added: { plex: movie.addedAt, arr: arr ? movie.addedAt : null },
    sizeBytes: arr ? (arr.hasFile ? movie.bytes : 0) : movie.bytes,
    episodeCount: null,
    match,
    arr: arr ? { service: 'radarr', id: arr.id, titleSlug: arr.titleSlug, path: arr.path, root: CLEANUP_ROOTS.radarr,
      tags: arr.tags.map((id) => arrTags.find((tag) => tag.id === id)?.label ?? String(id)), importList: arr.tags.includes(IMPORT_TAG), monitored: true,
      ...(arr.fileId === null ? {} : { fileId: arr.fileId }) } : null,
    show: null,
    position: null,
    plays: aggregatePlays(ctx.history.filter((row) => row.media_type === 'movie' && String(row.rating_key) === movie.ratingKey), null),
    requests: requestsOf(ctx, 'movie', movie.role),
    collections: [],
    labels: movie.labels.map((label) => label.toLowerCase()),
  };
}

function showItems(show: WorldShow, ctx: SnapshotContext): SnapshotItem[] {
  const arr = show.arr;
  const episodes = show.seasons.flatMap((season) => season.episodes);
  const rowsOf = (keys: Set<string>) => ctx.history.filter((row) => row.media_type === 'episode' && keys.has(String(row.rating_key)));
  const newest = (list: readonly WorldEpisode[]) => Math.max(...list.map((episode) => episode.addedAt));
  const status: NonNullable<SnapshotItem['show']>['status'] = show.status;
  // Without a Sonarr record, Plex still gives the newest episode (as the snapshot builder reads it)
  const showFacts = (lastEpisodeAddedAt: number): SnapshotItem['show'] => arr
    ? { status, seasonsOnDisk: show.seasons.length, newestSeasonOnDisk: show.seasons.length, lastEpisodeAddedAt }
    : { status: null, seasonsOnDisk: null, newestSeasonOnDisk: null, lastEpisodeAddedAt };
  const match: SnapshotItem['match'] = arr ? { state: 'matched', by: 'tvdb' } : { state: 'unmatched', cause: 'noArrRecord' };
  const arrRef = (fileCount: number): SnapshotItem['arr'] => arr ? { service: 'sonarr', id: arr.id, titleSlug: arr.titleSlug, path: arr.path,
    root: CLEANUP_ROOTS.sonarr, tags: arr.tags.map((id) => arrTags.find((tag) => tag.id === id)?.label ?? String(id)), importList: arr.tags.includes(IMPORT_TAG),
    monitored: true, fileCount } : null;
  const ids = { tmdb: show.tmdb, tvdb: show.tvdb, imdb: show.imdb, plex: show.guid };
  const item: SnapshotItem = {
    key: show.key, level: 'show', titleKey: `tvdb:${show.tvdb}`, title: show.title, year: show.year, seasonNumber: null, showKey: null,
    sectionId: CLEANUP_SECTIONS.shows, ratingKey: show.ratingKey, copies: [{ ratingKey: show.ratingKey, sectionId: CLEANUP_SECTIONS.shows }],
    episodeKeys: episodes.map((episode) => episode.ratingKey), ids, added: { plex: show.addedAt, arr: arr ? show.addedAt : null },
    sizeBytes: sum(show.seasons.map((season) => season.bytes)), episodeCount: episodes.length, match, arr: arrRef(episodes.length),
    show: showFacts(newest(episodes)), position: null,
    plays: aggregatePlays(rowsOf(new Set(episodes.map((episode) => episode.ratingKey))), episodes.map((episode) => episode.ratingKey)),
    requests: requestsOf(ctx, 'tv', show.role), collections: [], labels: show.labels.map((label) => label.toLowerCase()),
  };
  const seasons = show.seasons.map((season): SnapshotItem => {
    const keys = season.episodes.map((episode) => episode.ratingKey);
    return {
      key: season.key, level: 'season', titleKey: `tvdb:${show.tvdb}`, title: show.title, year: show.year, seasonNumber: season.number, showKey: show.key,
      sectionId: CLEANUP_SECTIONS.shows, ratingKey: season.ratingKey, copies: [{ ratingKey: season.ratingKey, sectionId: CLEANUP_SECTIONS.shows }],
      episodeKeys: keys, ids, added: { plex: season.addedAt, arr: arr ? show.addedAt : null }, sizeBytes: season.bytes, episodeCount: season.episodes.length,
      match, arr: arrRef(season.episodes.length), show: showFacts(newest(season.episodes)),
      position: arr ? show.seasons.length - season.number + 1 : null,
      plays: aggregatePlays(rowsOf(new Set(keys)), keys), requests: requestsOf(ctx, 'tv', show.role, season.number), collections: [], labels: [],
    };
  });
  return [item, ...seasons];
}

function buildSnapshot(nowS: number, movies: WorldMovie[], shows: WorldShow[], history: WorldPlay[]): CleanupWorld['snapshot'] {
  const requests = REQUEST_SPECS.map((spec) => ({
    spec,
    fact: { at: nowS - spec.days * DAY_S, by: CLEANUP_PEOPLE[spec.by], status: 2, is4k: spec.is4k ?? false, seasons: spec.type === 'tv' ? (spec.seasons ?? []) : null },
  }));
  const ctx: SnapshotContext = { nowS, history, requests, movies, shows };
  const movieItems = movies.map((movie) => movieItem(movie, ctx));
  const showParts = shows.flatMap((show) => showItems(show, ctx));
  const parts: Record<Level, SnapshotItem[]> = {
    movie: movieItems,
    show: showParts.filter((item) => item.level === 'show'),
    season: showParts.filter((item) => item.level === 'season'),
  };

  // facts.users (TS 7.6 "Users"): every id seen in history or requests, the access list and the owner
  const lastPlay = new Map<string, number>();
  for (const row of history) {
    const user = String(row.user_id);
    if (!lastPlay.has(user)) lastPlay.set(user, -1);
    if (isCountedRow(row)) lastPlay.set(user, Math.max(lastPlay.get(user) ?? -1, row.started));
  }
  const seen = new Set<string>([...lastPlay.keys(), ...requests.map(({ fact }) => fact.by ?? ''), ...ACCESS.map((who) => CLEANUP_PEOPLE[who])]);
  seen.delete('');
  const access = new Set<string>(ACCESS.map((who) => CLEANUP_PEOPLE[who]));
  const users: SnapshotFacts['users'] = {};
  for (const id of [...seen].sort()) {
    const last = lastPlay.get(id) ?? -1;
    users[id] = { hasAccess: access.has(id), lastPlayAt: last >= 0 ? last : null, owner: id === CLEANUP_PLEX.ownerPlexId };
  }
  const counted = history.filter(isCountedRow);
  const usersWithPlay = new Set(counted.map((row) => String(row.user_id))).size;
  const takenAt = iso(nowS);
  const managed = (items: SnapshotItem[]) => items.filter((item) => item.match.state === 'matched');
  const growth = sum([
    ...movies.filter((movie) => movie.addedAt >= nowS - 182 * DAY_S).map((movie) => movie.bytes),
    ...shows.flatMap((show) => show.seasons.flatMap((season) => season.episodes)).filter((episode) => episode.addedAt >= nowS - 182 * DAY_S)
      .map((episode) => episode.bytes),
  ]);
  const radarrRows = movies.filter((movie) => movie.arr).length;
  const sonarrRows = shows.filter((show) => show.arr).length;
  const facts: SnapshotFacts = {
    version: 1,
    takenAt,
    history: { startAt: history[0]?.started ?? null, newestAt: history[history.length - 1]?.started ?? null, rows: history.length, orphans: 0, usersWithPlay },
    users,
    libraries: [
      { sectionId: CLEANUP_SECTIONS.movies, title: 'Movies', type: 'movie', agent: 'tv.plex.agents.movie', locations: [CLEANUP_ROOTS.radarr], arr: 'radarr',
        noIds: false, items: managed(parts.movie).length, seasons: 0, bytes: sum(managed(parts.movie).map((item) => item.sizeBytes ?? 0)) },
      { sectionId: CLEANUP_SECTIONS.shows, title: 'TV Shows', type: 'show', agent: 'tv.plex.agents.series', locations: [CLEANUP_ROOTS.sonarr], arr: 'sonarr',
        noIds: false, items: managed(parts.show).length, seasons: managed(parts.season).length, bytes: sum(managed(parts.show).map((item) => item.sizeBytes ?? 0)) },
    ],
    disk: { freeBytes: DISK.freeSpace, totalBytes: DISK.totalSpace },
    growthBytesPerMonth: Math.floor(growth / 6),
    collections: [
      { sectionId: CLEANUP_COLLECTION.sectionId, ratingKey: CLEANUP_COLLECTION.ratingKey, title: CLEANUP_COLLECTION.title, childCount: 1, smart: false },
      { sectionId: CLEANUP_SECTIONS.movies, ratingKey: '90002', title: 'Rainy Sunday Picks', childCount: 2, smart: false },
    ],
    membersRead: [],
    importListCount: {
      radarr: movies.filter((movie) => movie.arr?.tags.includes(IMPORT_TAG)).length,
      sonarr: shows.filter((show) => show.arr?.tags.includes(IMPORT_TAG)).length,
    },
    machineIdentifier: CLEANUP_PLEX.machineIdentifier,
    labelsRead: [CLEANUP_SECTIONS.movies, CLEANUP_SECTIONS.shows],
    rowBaseline: { overseerrRequests: REQUEST_SPECS.length, tautulliRows: history.length, usersWithPlay },
  };
  const ok = (service: SourceStatus['service'], rows?: number, part?: SourceStatus['part']): SourceStatus => ({
    service, state: 'ok', readAt: takenAt, ...(rows === undefined ? {} : { rows }), ...(part ? { part } : {}),
  });
  const sources: SourceStatus[] = [
    ok('plex', parts.movie.length + parts.show.length, 'server'),
    ok('plex', undefined, 'shares'),
    ok('tautulli', history.length),
    ok('overseerr', REQUEST_SPECS.length),
    ok('radarr', radarrRows),
    ok('sonarr', sonarrRows),
  ];
  return { sources, facts, parts };
}

/** The item of the world with this key, at any level. */
export function worldItem(world: CleanupWorld, key: string): SnapshotItem {
  const item = [...world.snapshot.parts.movie, ...world.snapshot.parts.show, ...world.snapshot.parts.season].find((candidate) => candidate.key === key);
  if (!item) throw new Error(`No world item ${key}`);
  return item;
}

/** The key of a movie of the catalogue by its role (`pipeline`, `kept`, `batch-07`). */
export function movieKey(world: CleanupWorld, role: string): string {
  const movie = world.movies.find((candidate) => candidate.role === role);
  if (!movie) throw new Error(`No movie ${role}`);
  return movie.key;
}

/** The key of a show of the catalogue by its role, or of its season `season`. */
export function showKey(world: CleanupWorld, role: string, season?: number): string {
  const show = world.shows.find((candidate) => candidate.role === role);
  if (!show) throw new Error(`No show ${role}`);
  if (season === undefined) return show.key;
  const found = show.seasons.find((candidate) => candidate.number === season);
  if (!found) throw new Error(`No season ${season} of ${role}`);
  return found.key;
}

/* ------------------------------------------------------ Rule check (light) */

const duration = (amount: number, unit: 'months' | 'years') => ({ amount, unit });

/** The rule definitions of the seeds. Each passes `ruleDefinitionSchema`. */
export const CLEANUP_RULE_DEFINITIONS = {
  dry: {
    schemaVersion: 1, level: 'movie', libraries: [CLEANUP_SECTIONS.movies],
    conditions: [
      { id: 'c1', field: 'watch.lastPlayed', op: 'moreThan', value: { duration: duration(2, 'years'), orNever: true } },
      { id: 'a1', kind: 'anyOf', conditions: [
        { id: 'c2', field: 'file.size', op: 'moreThan', value: { bytes: 10 * GiB, unit: 'GB' } },
        { id: 'c3', field: 'request.exists', op: 'is', value: { exists: false } },
      ] },
    ],
    protections: [],
    then: { graceDays: 30, action: 'movie.delete', importListExclusion: true },
  },
  review: {
    schemaVersion: 1, level: 'movie', libraries: [CLEANUP_SECTIONS.movies],
    conditions: [
      { id: 'c1', field: 'watch.lastPlayed', op: 'moreThan', value: { duration: duration(1, 'years'), orNever: true } },
      { id: 'c2', field: 'library.added', op: 'moreThan', value: { duration: duration(1, 'years') } },
    ],
    protections: [{ id: 'p1', field: 'watch.plays', op: 'atLeast', value: { count: 5, window: { kind: 'total' } } }],
    then: { graceDays: 30, action: 'movie.delete', importListExclusion: true },
  },
  shows: {
    schemaVersion: 1, level: 'show', libraries: [CLEANUP_SECTIONS.shows],
    conditions: [
      { id: 'c1', field: 'show.status', op: 'is', value: { status: 'ended' } },
      { id: 'c2', field: 'watch.lastPlayed', op: 'moreThan', value: { duration: duration(1, 'years'), orNever: true } },
    ],
    protections: [],
    then: { graceDays: 30, action: 'show.delete', importListExclusion: true },
  },
  seasons: {
    schemaVersion: 1, level: 'season', libraries: [CLEANUP_SECTIONS.shows],
    conditions: [
      { id: 'c1', field: 'season.position', op: 'notNewest', value: { count: 1 } },
      { id: 'c2', field: 'show.status', op: 'is', value: { status: 'continuing' } },
      { id: 'c3', field: 'watch.lastPlayed', op: 'moreThan', value: { duration: duration(6, 'months'), orNever: true } },
    ],
    protections: [],
    then: { graceDays: 30, action: 'season.unmonitorDeleteFiles', importListExclusion: false },
  },
  a11yDry: {
    schemaVersion: 1, level: 'movie', libraries: [CLEANUP_SECTIONS.movies],
    conditions: [
      { id: 'c1', field: 'watch.lastPlayed', op: 'moreThan', value: { duration: duration(2, 'years'), orNever: true } },
      { id: 'c2', field: 'file.size', op: 'moreThan', value: { bytes: 10 * GiB, unit: 'GB' } },
    ],
    protections: [],
    then: { graceDays: 30, action: 'movie.delete', importListExclusion: true },
  },
} as const satisfies Record<string, RuleDefinition>;

/** The explicit protections of a seed, for the light rule check: the item keys that a Keep or an exclusion holds. */
export interface SeedProtections {
  keeps: readonly string[];
  excludes: readonly string[];
}

const daysOf = (value: { amount: number; unit: keyof typeof UNIT_DAYS }) => value.amount * UNIT_DAYS[value.unit];

/** A condition's verdict on an item, for the fields the seeds use (TS 4.3). */
function conditionVerdict(condition: Condition, item: SnapshotItem, nowS: number): Verdict {
  const before = (t: number, days: number) => t < nowS - days * DAY_S;
  switch (condition.field) {
    case 'watch.lastPlayed': {
      if (!item.plays) return 'unknown';
      const v = item.plays.lastCountedAt;
      const days = daysOf(condition.value.duration);
      if (condition.op === 'never') return v === null ? 'pass' : 'fail';
      if (condition.op === 'lessThan') return v !== null && !before(v, days) ? 'pass' : 'fail';
      return (v === null && condition.value.orNever) || (v !== null && before(v, days)) ? 'pass' : 'fail';
    }
    case 'watch.plays': {
      if (!item.plays) return 'unknown';
      const window = condition.value.window;
      const n = item.plays.countedAt.filter((t) => window.kind === 'total' || !before(t, daysOf(window.duration))).length;
      return (condition.op === 'atLeast' ? n >= condition.value.count : n < condition.value.count) ? 'pass' : 'fail';
    }
    case 'library.added': {
      const dates = [item.added.plex, item.added.arr].filter((t): t is number => t !== null);
      if (dates.length === 0) return 'unknown';
      const days = daysOf(condition.value.duration);
      return dates.every((t) => (condition.op === 'moreThan' ? before(t, days) : !before(t, days))) ? 'pass' : 'fail';
    }
    case 'file.size':
      if (item.sizeBytes === null) return 'unknown';
      return (condition.op === 'moreThan' ? item.sizeBytes > condition.value.bytes : item.sizeBytes < condition.value.bytes) ? 'pass' : 'fail';
    case 'request.exists':
      if (!item.requests) return 'unknown';
      return (item.requests.length > 0) === condition.value.exists ? 'pass' : 'fail';
    case 'show.status':
      if (!item.show?.status) return 'unknown';
      return item.show.status === condition.value.status ? 'pass' : 'fail';
    case 'season.position':
      if (!item.show) return 'unknown';
      if (item.position === null) return 'fail';
      return (condition.op === 'notNewest' ? item.position > condition.value.count : item.position <= condition.value.count) ? 'pass' : 'fail';
    default:
      throw new Error(`The light rule check does not read ${condition.field}`);
  }
}

/** The global protections that protect an item under the default options (TS 5.3). G2, G8, G10 and G13 have no data in the world. */
function globalProtections(world: CleanupWorld, item: SnapshotItem, protections: SeedProtections): GlobalProtectionId[] {
  const nowS = Math.floor(world.now / 1000);
  const recent = (t: number | null, days: number) => t !== null && t >= nowS - days * DAY_S;
  const users = world.snapshot.facts.users;
  const cascade = item.level === 'show' ? [item.key, ...world.snapshot.parts.season.filter((s) => s.showKey === item.key).map((s) => s.key)]
    : item.level === 'season' ? [item.key, item.showKey ?? ''] : [item.key];
  const found: GlobalProtectionId[] = [];
  if (cascade.some((key) => protections.keeps.includes(key))) found.push('g1');
  if (cascade.some((key) => protections.excludes.includes(key))) found.push('g3');
  if (recent(item.plays?.lastCountedAt ?? null, 30)) found.push('g4');
  const unfinished = (viewer: Viewer) => (item.level === 'movie' ? !viewer.lastCountedFinished : viewer.finishedEpisodes < (item.episodeCount ?? 0));
  if (item.plays?.viewers.some((viewer) => recent(viewer.lastCountedAt, 180) && unfinished(viewer))) found.push('g5');
  if ([item.added.plex, item.added.arr, item.show?.lastEpisodeAddedAt ?? null].some((t) => recent(t, 30))) found.push('g6');
  const finishedBy = (user: string) => item.plays?.viewers.find((viewer) => viewer.user === user)?.finished ?? false;
  if (item.requests?.some((r) => recent(r.at, 90) && r.by !== null && users[r.by]?.hasAccess === true && !finishedBy(r.by))) found.push('g7');
  if (item.arr?.tags.includes('keep')) found.push('g9');
  if (item.level === 'season' && item.show && (item.show.status === 'continuing' || item.show.status === 'upcoming')
    && item.seasonNumber !== null && item.show.newestSeasonOnDisk !== null && item.seasonNumber >= item.show.newestSeasonOnDisk) found.push('g11');
  if (item.level === 'season') {
    const show = worldItem(world, item.showKey ?? '');
    const active = show.plays?.viewers.filter((viewer) => recent(viewer.lastCountedAt, 365)) ?? [];
    if (active.some((viewer) => (item.plays?.viewers.find((own) => own.user === viewer.user)?.finishedEpisodes ?? 0) < (item.episodeCount ?? 0))) found.push('g12');
  }
  return found;
}

export interface RuleCheck {
  key: string;
  class: ItemClass;
  failing?: string;
  protectedBy: string[];
}

/**
 * A light copy of `classify()` (TS 6.3) for the seeds' rule stats and for
 * `seed-cleanup.test.ts`: the clauses of the fields that the seeds use, the
 * rule protections and the global protections of `globalProtections()`. The
 * real engine checks the same data in `seed-cleanup-blocks.test.ts` (D17).
 */
export function checkRule(world: CleanupWorld, definition: RuleDefinition, protections: SeedProtections): RuleCheck[] {
  const nowS = Math.floor(world.now / 1000);
  return world.snapshot.parts[definition.level]
    .filter((item) => definition.libraries.includes(item.sectionId))
    .map((item) => {
      const clauses = definition.conditions.map((clause) => {
        if (!('kind' in clause)) return { id: clause.id, verdict: conditionVerdict(clause, item, nowS) };
        const verdicts = clause.conditions.map((member) => conditionVerdict(member, item, nowS));
        return { id: clause.id, verdict: verdicts.includes('pass') ? 'pass' : verdicts.includes('unknown') ? 'unknown' : 'fail' } as const;
      });
      const protectedBy = [
        ...globalProtections(world, item, protections),
        ...definition.protections.filter((p) => conditionVerdict(p, item, nowS) === 'pass').map((p) => p.id),
      ];
      const failed = clauses.filter((clause) => clause.verdict === 'fail');
      const unknown = clauses.some((clause) => clause.verdict === 'unknown') || item.match.state === 'unknown';
      let itemClass: ItemClass;
      if (failed.length >= 2) itemClass = 'notListed';
      else if (failed.length === 1) itemClass = protectedBy.length === 0 && !unknown && item.match.state === 'matched' ? 'nearMiss' : 'notListed';
      else if (protectedBy.length > 0) itemClass = 'protected';
      else if (unknown) itemClass = 'missing';
      else itemClass = item.match.state === 'matched' ? 'match' : 'cannotDelete';
      return { key: item.key, class: itemClass, ...(itemClass === 'nearMiss' ? { failing: failed[0].id } : {}), protectedBy };
    });
}

/* ------------------------------------------------------------------ Seeds */

/** The rows one seed writes, in Prisma's create shapes. `seed-cleanup.ts` writes them, and `seed-cleanup.test.ts` parses them. */
export interface CleanupSeedRows {
  settings: Prisma.CleanupSettingsCreateInput & { id: 'cleanup' };
  rules: (Prisma.CleanupRuleCreateManyInput & { id: string })[];
  snapshot: Prisma.CleanupSnapshotCreateManyInput & { id: string };
  parts: Prisma.CleanupSnapshotPartCreateManyInput[];
  items: Prisma.CleanupItemCreateManyInput[];
  protections: Prisma.CleanupProtectionCreateManyInput[];
  runs: Prisma.CleanupRunCreateManyInput[];
  outcomes: Prisma.CleanupOutcomeCreateManyInput[];
}

/** The ids of `seedCleanup(prefix)`'s rules, snapshot and batches, so a spec can name them without a seed. */
export function cleanupSeedIds(prefix: string = CLEANUP_PREFIX) {
  const rules = { dry: `${prefix}-dry`, review: `${prefix}-review`, shows: `${prefix}-shows`, seasons: `${prefix}-seasons` };
  return {
    rules,
    snapshot: `${prefix}-snapshot`,
    batches: { review: `deletion-${rules.review}`, shows: `deletion-${rules.shows}`, entry: `entry-${rules.seasons}` },
    keep: `${prefix}-keep`,
    services: { radarr: `${prefix}-radarr`, sonarr: `${prefix}-sonarr`, overseerr: `${prefix}-overseerr`, tautulli: `${prefix}-tautulli` },
  };
}

/** `seedCleanupA11y()`'s fixed ids (TS 16.5). */
export function cleanupA11ySeedIds() {
  return {
    rules: CLEANUP_A11Y_RULE_IDS,
    snapshot: `${CLEANUP_A11Y_PREFIX}-snapshot`,
    batches: { live: `deletion-${CLEANUP_A11Y_RULE_IDS.live}` },
  };
}

/** `seedCleanupPipeline(prefix)`'s ids. */
export function cleanupPipelineSeedIds(prefix: string = CLEANUP_PREFIX) {
  return { rule: `${prefix}-pipeline`, snapshot: `${prefix}-snapshot`, batch: `deletion-${prefix}-pipeline`, keep: `${prefix}-keep` };
}

const json = (value: unknown) => value as Prisma.InputJsonValue;
const RULE_ID = /^[A-Za-z0-9_-]{1,40}$/;

/** SHA-256 of the definition with sorted keys, first 16 hex (TS 3.4 `definitionHash`). @internal Exported for `seed-cleanup.test.ts`. */
export function definitionHash(definition: unknown): string {
  const stable = (value: unknown): unknown =>
    Array.isArray(value) ? value.map(stable)
      : value !== null && typeof value === 'object'
        ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable((value as Record<string, unknown>)[key])]))
        : value;
  return createHash('sha256').update(JSON.stringify(stable(definition))).digest('hex').slice(0, 16);
}

interface SeedRule {
  id: string;
  name: string;
  mode: Mode;
  definition: RuleDefinition;
  /** Days before `now` of the rule's dry runs (the newest last). */
  dryRuns?: number[];
}

type ItemState = 'held' | 'leaving' | 'approved' | 'deleting';
interface ItemPlan {
  key: string;
  rule: SeedRule;
  state: ItemState;
  /** Days from today of `leaveOn`: negative is due. Held items have none. */
  leaveIn?: number;
  postponed?: boolean;
  holdCode?: string;
  failCode?: string;
}

/** The seed's clock: `now`, its Unix seconds and today's day key in the server zone. */
function clock(world: CleanupWorld) {
  const nowS = Math.floor(world.now / 1000);
  return { nowS, today: dayKey(world.now, world.timeZone), at: (days: number) => new Date(world.now - days * DAY_MS) };
}

function whyOf(world: CleanupWorld, snapshotId: string, rule: SeedRule, item: SnapshotItem): WhySnapshot {
  const users = world.snapshot.facts.users;
  const flat = rule.definition.conditions.flatMap((clause) => ('kind' in clause ? clause.conditions : [clause]));
  return {
    v: 1, snapshotId, takenAt: world.snapshot.facts.takenAt, checkedAt: new Date(world.now).toISOString(), ruleId: rule.id,
    conditions: flat.map((condition) => ({ id: condition.id, field: condition.field, verdict: 'pass' as const })),
    protections: rule.definition.protections.map((protection) => ({ id: protection.id, verdict: 'clear' as const })),
    facts: {
      lastCountedAt: item.plays?.lastCountedAt ?? null, countedTotal: item.plays ? item.plays.countedAt.length : null,
      addedPlex: item.added.plex, addedArr: item.added.arr, sizeBytes: item.sizeBytes,
      requests: (item.requests ?? []).map((request) => ({
        at: request.at,
        requester: request.by === null ? 'unknown' as const : users[request.by]?.owner ? 'owner' as const : users[request.by]?.hasAccess ? 'member' as const : 'former' as const,
      })),
      importList: item.arr?.importList ?? false, showStatus: item.show?.status ?? null, seasonsOnDisk: item.show?.seasonsOnDisk ?? null,
      position: item.position, lastEpisodeAddedAt: item.show?.lastEpisodeAddedAt ?? null, historyStartAt: world.snapshot.facts.history.startAt,
    },
    match: { state: item.match.state, ...(item.match.by ? { by: item.match.by } : {}),
      ...(item.match.by && item.ids[item.match.by] !== undefined ? { externalId: String(item.ids[item.match.by]) } : {}),
      ...(item.arr ? { service: item.arr.service, arrId: item.arr.id, path: item.arr.path } : {}) },
    sources: world.snapshot.sources,
  };
}

function itemRow(world: CleanupWorld, prefix: string, snapshotId: string, plan: ItemPlan): Prisma.CleanupItemCreateManyInput {
  const { today, at } = clock(world);
  const item = worldItem(world, plan.key);
  const { then } = plan.rule.definition;
  const held = plan.state === 'held';
  const leaveOn = held ? null : addDays(today, plan.leaveIn ?? 0);
  // Entered a grace period before the leave date; a postponed item first left 4 days ago
  const enteredDays = held ? 0 : then.graceDays - (plan.postponed ? -4 : plan.leaveIn ?? 0);
  const firstLeaveOn = plan.postponed ? addDays(today, -4) : leaveOn;
  const approved = plan.state === 'approved' || plan.state === 'deleting';
  return {
    id: `${prefix}-item-${plan.key.replace(/:/g, '-')}`,
    itemKey: item.key, level: item.level, titleKey: item.titleKey, sectionId: item.sectionId, ratingKey: item.ratingKey, title: item.title, year: item.year,
    seasonNumber: item.seasonNumber, episodeCount: item.level === 'movie' ? null : item.episodeCount, seasonCount: item.level === 'show' ? item.show?.seasonsOnDisk ?? null : null,
    sizeBytes: BigInt(item.sizeBytes ?? 0),
    arr: json(item.arr ? { service: item.arr.service, id: item.arr.id, titleSlug: item.arr.titleSlug, path: item.arr.path } : null),
    state: plan.state, ruleIds: [plan.rule.id], action: then.action, importListExclusion: then.importListExclusion,
    needsApproval: plan.rule.mode === 'reviewFirst',
    heldAt: held ? at(1) : null, enteredAt: held ? null : at(enteredDays), leaveOn, firstLeaveOn,
    postponedAt: plan.postponed ? at(1) : null, postponedBy: plan.postponed ? ADMIN_ID : null,
    approvedAt: approved ? at(plan.state === 'deleting' ? 1 / 24 : 2 / 24) : null, approvedBy: approved ? ADMIN_ID : null,
    holdCode: plan.holdCode ?? null, failCode: plan.failCode ?? null, failCount: plan.failCode ? 1 : 0,
    why: json(whyOf(world, snapshotId, plan.rule, item)), lastRunId: null, checkedAt: new Date(world.now),
  };
}

function ruleRow(world: CleanupWorld, rule: SeedRule, snapshotId: string, runId: string, protections: SeedProtections): Prisma.CleanupRuleCreateManyInput & { id: string } {
  if (!RULE_ID.test(rule.id)) throw new Error(`The seeded rule id ${rule.id} does not match RULE_ID_PATTERN: use a shorter prefix`);
  const { at } = clock(world);
  const checks = checkRule(world, rule.definition, protections);
  const byKey = new Map(Object.values(world.snapshot.parts).flat().map((item) => [item.key, item]));
  const matches = checks.filter((check) => check.class === 'match').map((check) => byKey.get(check.key)).filter((item): item is SnapshotItem => !!item);
  const bytes = sum(matches.map((item) => item.sizeBytes ?? 0));
  const count = (cls: ItemClass) => checks.filter((check) => check.class === cls).length;
  const hash = definitionHash(rule.definition);
  const stats: RuleStats = {
    v: 1,
    lastEval: {
      runId, at: at(1).toISOString(), snapshotId, checked: checks.length, matches: matches.length, bytes, nearMisses: count('nearMiss'),
      protected: count('protected'), missing: count('missing'), cannotDelete: count('cannotDelete'),
      largest: [...matches].sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0)).slice(0, 5).map((item) => item.ratingKey),
      overlaps: [], blocks: [],
    },
    dryRuns: (rule.dryRuns ?? []).map((days, i) => ({
      at: at(days).toISOString(), runId: `${rule.id}-dry-${i + 1}`, snapshotId: `${rule.id}-snap-${i + 1}`, matches: matches.length, bytes, definitionHash: hash,
    })),
  };
  const live = rule.mode !== 'dryRun';
  return {
    id: rule.id, name: rule.name, mode: rule.mode, revision: live ? 3 : 1, definition: json(rule.definition), schemaVersion: 1, origin: json({ kind: 'blank' }),
    stats: json(stats), turnedOnAt: live ? at(40) : null, lastDryRunAt: rule.dryRuns?.length ? at(Math.min(...rule.dryRuns)) : null,
    createdAt: at(70), createdBy: ADMIN_ID, updatedBy: ADMIN_ID,
  };
}

function protectionRow(world: CleanupWorld, id: string, kind: 'memberKeep' | 'adminExclude', key: string, options: { ended?: boolean; note?: string } = {}):
  Prisma.CleanupProtectionCreateManyInput {
  const { at } = clock(world);
  const item = worldItem(world, key);
  const memberId = kind === 'memberKeep' ? CLEANUP_MEMBERS.member.id : null;
  return {
    id, kind, itemKey: item.key, level: item.level, titleKey: item.titleKey, title: item.title, year: item.year, seasonNumber: item.seasonNumber,
    sectionId: item.sectionId, ratingKey: item.ratingKey, externalIds: json({ tmdb: item.ids.tmdb, tvdb: item.ids.tvdb, imdb: item.ids.imdb }),
    memberId, createdBy: memberId ?? ADMIN_ID, note: options.note ?? null,
    expiresAt: kind === 'memberKeep' ? new Date(world.now + (options.ended ? 60 : 87) * DAY_MS) : null,
    status: options.ended ? 'ended' : 'active', endedAt: options.ended ? at(2) : null, endedBy: options.ended ? 'admin' : null,
    endedByUserId: options.ended ? ADMIN_ID : null,
    activeKey: options.ended ? null : kind === 'memberKeep' ? `keep:${item.key}:${memberId}` : `exclude:${item.key}`,
    createdAt: at(options.ended ? 30 : 3),
  };
}

function runRow(world: CleanupWorld, id: string, kind: 'dryRun' | 'run' | 'act', days: number, values: Partial<Prisma.CleanupRunCreateManyInput>):
  Prisma.CleanupRunCreateManyInput {
  const { at } = clock(world);
  return {
    id, kind, trigger: kind === 'run' ? 'scheduled' : kind === 'act' ? 'approval' : 'create', actorId: kind === 'run' ? null : ADMIN_ID,
    startedAt: at(days), finishedAt: new Date(at(days).getTime() + 4 * 60_000), ruleIds: [], blocks: json([]), entries: json([]),
    outcome: kind === 'dryRun' ? 'dryRun' : 'finished', ...values,
  };
}

interface OutcomePlan {
  id: string;
  key?: string;
  /** A title that left the library: not in the world. */
  gone?: { title: string; year: number; tmdb: number; gib: number };
  kind: 'deleted' | 'failed' | 'rescued' | 'released';
  reason: string;
  detail?: Record<string, string>;
  rule: SeedRule;
  runId: string;
  days: number;
}

function outcomeRow(world: CleanupWorld, snapshotId: string, plan: OutcomePlan): Prisma.CleanupOutcomeCreateManyInput {
  const { at, today } = clock(world);
  const goneItem = (gone: NonNullable<OutcomePlan['gone']>): SnapshotItem => ({
    ...worldItem(world, movieKey(world, 'batch-01')), key: `movie:tmdb:${gone.tmdb}`, titleKey: `tmdb:${gone.tmdb}`, title: gone.title, year: gone.year,
    ratingKey: String(gone.tmdb).slice(-4), copies: [{ ratingKey: String(gone.tmdb).slice(-4), sectionId: CLEANUP_SECTIONS.movies }],
    ids: { tmdb: gone.tmdb }, sizeBytes: gone.gib * GiB, plays: { lastCountedAt: null, countedAt: [], viewers: [] }, requests: [], labels: [],
  });
  const item = plan.gone ? goneItem(plan.gone) : worldItem(world, plan.key ?? '');
  const deleted = plan.kind === 'deleted';
  return {
    id: plan.id, itemKey: item.key, level: item.level, titleKey: item.titleKey, sectionId: item.sectionId, ratingKey: item.ratingKey, title: item.title,
    year: item.year, seasonNumber: item.seasonNumber, kind: plan.kind, reason: plan.reason, ...(plan.detail ? { detail: json(plan.detail) } : {}),
    ruleIds: [plan.rule.id], action: plan.rule.definition.then.action, sizeBytes: BigInt(item.sizeBytes ?? 0), freedBytes: BigInt(deleted ? item.sizeBytes ?? 0 : 0),
    alreadyGone: false, approvedBy: deleted || plan.kind === 'failed' ? ADMIN_ID : null, enteredAt: at(plan.days + 31), leaveOn: addDays(today, -plan.days - 1),
    why: json(whyOf(world, snapshotId, plan.rule, item)), runId: plan.runId, actedAt: at(plan.days),
  };
}

function snapshotRows(world: CleanupWorld, id: string): Pick<CleanupSeedRows, 'snapshot' | 'parts'> {
  const at = new Date(world.now);
  return {
    snapshot: { id, status: 'complete', trigger: 'scheduled', actorId: null, startedAt: at, finishedAt: at, sources: json(world.snapshot.sources),
      facts: json(world.snapshot.facts) },
    parts: (['movie', 'show', 'season'] as const).map((level) => ({
      id: `${id}-${level}`, snapshotId: id, level, itemCount: world.snapshot.parts[level].length, items: json(world.snapshot.parts[level]),
    })),
  };
}

/** The settings row: on, not paused, the hold of the last turn-on over, and the Plex collection of TS 16.4 pipeline step 1. */
function settingsRow(world: CleanupWorld): CleanupSeedRows['settings'] {
  const { at, today } = clock(world);
  const runtime: CleanupRuntime = {
    collections: {
      [`${CLEANUP_COLLECTION.sectionId}:movie`]: { ratingKey: CLEANUP_COLLECTION.ratingKey, title: CLEANUP_COLLECTION.title, createdAt: at(20).toISOString(),
        lastSyncAt: at(1 / 24).toISOString(), count: 1, hub: { ownHome: true, sharedHome: true, recommended: false } },
    },
    lastSync: { at: at(1 / 24).toISOString(), ok: true },
    notices: [],
  };
  return { id: 'cleanup', enabled: true, enabledAt: at(60), pausedAt: null, pausedBy: null, holdUntil: addDays(today, -53), runClaimAt: null, readClaimAt: null,
    collectionsClaimAt: null, collectionsDirtyAt: null, options: json({}), runtime: json(runtime), updatedBy: ADMIN_ID };
}

/** A run's counts over `rules`, from the light rule check: `checked`, `matched` and one entry per rule with `counts` added. */
function runCounts(world: CleanupWorld, rules: SeedRule[], protections: SeedProtections, counts: Record<string, Partial<RunRuleEntry>> = {}) {
  const checks = rules.map((rule) => checkRule(world, rule.definition, protections));
  const list = rules.map((rule, i): RunRuleEntry => ({ ruleId: rule.id, mode: rule.mode, matches: checks[i].filter((check) => check.class === 'match').length,
    joined: 0, held: 0, rescued: 0, deleted: 0, failed: 0, blocks: [], ...counts[rule.id] }));
  return {
    ruleIds: rules.map((rule) => rule.id),
    checked: sum(checks.map((list) => list.length)),
    matched: sum(list.map((entry) => entry.matches)),
    entries: json(list),
  };
}

/**
 * The rows of `seedCleanup(prefix)` (TS 16.4): a rule in each mode, items in
 * each state, a deletion batch of 55 movies (above 50, so the approval needs
 * the typed count) and one of 3 shows, an entry batch of 3 seasons, a Keep,
 * an ended Keep, two exclusions, runs and outcomes. Pure.
 */
export function cleanupSeedRows(prefix: string, world: CleanupWorld): CleanupSeedRows {
  const ids = cleanupSeedIds(prefix);
  const d = CLEANUP_RULE_DEFINITIONS;
  const dry: SeedRule = { id: ids.rules.dry, name: 'Movies nobody played in two years', mode: 'dryRun', definition: d.dry, dryRuns: [3, 2, 1] };
  const review: SeedRule = { id: ids.rules.review, name: 'Old movies to review', mode: 'reviewFirst', definition: d.review };
  const shows: SeedRule = { id: ids.rules.shows, name: 'Ended shows nobody plays', mode: 'reviewFirst', definition: d.shows };
  const seasons: SeedRule = { id: ids.rules.seasons, name: 'Old seasons of running shows', mode: 'automatic', definition: d.seasons };
  const movie = (role: string) => movieKey(world, role);
  const batch = Array.from({ length: BATCH_MOVIE_COUNT }, (_, i) => movie(`batch-${pad(i + 1)}`));
  const items: ItemPlan[] = [
    { key: movie('pipeline'), rule: review, state: 'leaving', leaveIn: -1 },
    ...batch.map((key, i): ItemPlan => ({ key, rule: review, state: 'leaving', leaveIn: -1 - (i % 5), ...(i === 8 ? { holdCode: 'sourceFailed:tautulli' } : {}) })),
    { key: movie('approved-a'), rule: review, state: 'approved', leaveIn: -1 },
    { key: movie('approved-b'), rule: review, state: 'approved', leaveIn: -2, failCode: 'HTTP' },
    { key: movie('deleting'), rule: review, state: 'deleting', leaveIn: -1 },
    { key: movie('postponed'), rule: review, state: 'leaving', leaveIn: 10, postponed: true },
    { key: movie('later-a'), rule: review, state: 'leaving', leaveIn: 5 },
    { key: movie('later-b'), rule: review, state: 'leaving', leaveIn: 12 },
    ...['ended-a', 'ended-b', 'ended-c'].map((role): ItemPlan => ({ key: showKey(world, role), rule: shows, state: 'leaving', leaveIn: -2 })),
    { key: showKey(world, 'auto-a', 1), rule: seasons, state: 'leaving', leaveIn: 7 },
    { key: showKey(world, 'auto-a', 2), rule: seasons, state: 'leaving', leaveIn: 7 },
    ...[1, 2, 3].map((n): ItemPlan => ({ key: showKey(world, 'auto-b', n), rule: seasons, state: 'held' })),
  ];
  const protections: SeedProtections = { keeps: [movie('kept')], excludes: [movie('excluded'), showKey(world, 'excluded')] };
  const runs = { nightly: `${prefix}-run-nightly`, dry: `${prefix}-run-dry`, act: `${prefix}-run-act` };
  const live = [review, shows, seasons];
  const { snapshot, parts } = snapshotRows(world, ids.snapshot);
  return {
    settings: settingsRow(world),
    rules: [dry, ...live].map((rule) => ruleRow(world, rule, ids.snapshot, rule.mode === 'dryRun' ? runs.dry : runs.nightly, protections)),
    snapshot,
    parts,
    items: items.map((plan) => itemRow(world, prefix, ids.snapshot, plan)),
    protections: [
      protectionRow(world, ids.keep, 'memberKeep', movie('kept')),
      protectionRow(world, `${prefix}-keep-ended`, 'memberKeep', movie('near'), { ended: true }),
      protectionRow(world, `${prefix}-exclude-movie`, 'adminExclude', movie('excluded'), { note: 'A favourite of the house.' }),
      protectionRow(world, `${prefix}-exclude-show`, 'adminExclude', showKey(world, 'excluded'), { note: 'The family watches it every winter.' }),
    ],
    runs: [
      runRow(world, runs.nightly, 'run', 1, { snapshotId: ids.snapshot, joined: 3, held: 3, rescued: 1,
        ...runCounts(world, live, protections, { [review.id]: { joined: 1, rescued: 1 }, [seasons.id]: { joined: 2, held: 3 } }) }),
      runRow(world, runs.dry, 'dryRun', 1, { snapshotId: ids.snapshot, ...runCounts(world, [dry], protections) }),
      runRow(world, runs.act, 'act', 2, { ruleIds: [review.id], deleted: 1, failed: 1, freedBytes: BigInt(12 * GiB) }),
    ],
    outcomes: [
      outcomeRow(world, ids.snapshot, { id: `${prefix}-out-deleted`, gone: { title: 'The Gilded Orchard', year: 2002, tmdb: 779901, gib: 12 }, kind: 'deleted',
        reason: 'deleted', rule: review, runId: runs.act, days: 2 }),
      outcomeRow(world, ids.snapshot, { id: `${prefix}-out-failed`, key: movie('approved-b'), kind: 'failed', reason: 'failed', detail: { code: 'HTTP', service: 'radarr' },
        rule: review, runId: runs.act, days: 2 }),
      outcomeRow(world, ids.snapshot, { id: `${prefix}-out-played`, key: movie('recent'), kind: 'rescued', reason: 'played', rule: review, runId: runs.nightly, days: 1 }),
      outcomeRow(world, ids.snapshot, { id: `${prefix}-out-tagged`, key: movie('tagged'), kind: 'rescued', reason: 'protected', detail: { protectionId: 'g9' },
        rule: review, runId: runs.nightly, days: 5 }),
      outcomeRow(world, ids.snapshot, { id: `${prefix}-out-released`, key: movie('later-b'), kind: 'released', reason: 'ruleOff', rule: dry, runId: runs.nightly, days: 6 }),
    ],
  };
}

/**
 * The rows of `seedCleanupA11y()` (TS 16.5): the fixed rules
 * `a11y-cleanup-rule-dry` (Dry run) and `a11y-cleanup-rule-live` (Review
 * first) with a deletion batch of 6 movies and 3 later ones, a Keep of
 * `e2e-cleanup-member`, an exclusion, runs and outcomes. Pure.
 */
export function cleanupA11ySeedRows(world: CleanupWorld): CleanupSeedRows {
  const ids = cleanupA11ySeedIds();
  const p = CLEANUP_A11Y_PREFIX;
  const dry: SeedRule = { id: ids.rules.dry, name: 'Big movies nobody played', mode: 'dryRun', definition: CLEANUP_RULE_DEFINITIONS.a11yDry, dryRuns: [2, 1] };
  const live: SeedRule = { id: ids.rules.live, name: 'Old movies to review', mode: 'reviewFirst', definition: CLEANUP_RULE_DEFINITIONS.review };
  const movie = (role: string) => movieKey(world, role);
  const items: ItemPlan[] = [
    ...['pipeline', 'batch-01', 'batch-03', 'batch-06', 'batch-09', 'batch-12'].map((role, i): ItemPlan => ({ key: movie(role), rule: live, state: 'leaving', leaveIn: -1 - (i % 3) })),
    { key: movie('later-a'), rule: live, state: 'leaving', leaveIn: 5 },
    { key: movie('later-b'), rule: live, state: 'leaving', leaveIn: 12 },
    { key: movie('postponed'), rule: live, state: 'leaving', leaveIn: 10, postponed: true },
  ];
  const protections: SeedProtections = { keeps: [movie('kept')], excludes: [movie('excluded')] };
  const runs = { nightly: `${p}-run-nightly`, dry: `${p}-run-dry` };
  const { snapshot, parts } = snapshotRows(world, ids.snapshot);
  return {
    settings: settingsRow(world),
    rules: [ruleRow(world, dry, ids.snapshot, runs.dry, protections), ruleRow(world, live, ids.snapshot, runs.nightly, protections)],
    snapshot,
    parts,
    items: items.map((plan) => itemRow(world, p, ids.snapshot, plan)),
    protections: [
      protectionRow(world, `${p}-keep`, 'memberKeep', movie('kept')),
      protectionRow(world, `${p}-exclude`, 'adminExclude', movie('excluded'), { note: 'A favourite of the house.' }),
    ],
    runs: [
      runRow(world, runs.nightly, 'run', 1, { snapshotId: ids.snapshot, joined: 2, rescued: 1,
        ...runCounts(world, [live], protections, { [live.id]: { joined: 2, rescued: 1 } }) }),
      runRow(world, runs.dry, 'dryRun', 1, { snapshotId: ids.snapshot, ...runCounts(world, [dry], protections) }),
    ],
    outcomes: [
      outcomeRow(world, ids.snapshot, { id: `${p}-out-deleted`, gone: { title: 'The Gilded Orchard', year: 2002, tmdb: 779901, gib: 12 }, kind: 'deleted',
        reason: 'deleted', rule: live, runId: runs.nightly, days: 2 }),
      outcomeRow(world, ids.snapshot, { id: `${p}-out-played`, key: movie('recent'), kind: 'rescued', reason: 'played', rule: live, runId: runs.nightly, days: 1 }),
    ],
  };
}

/**
 * The rows of `seedCleanupPipeline(prefix)` (TS 16.4 pipeline step 1): the
 * feature on, one Review first rule over the movie section, the pipeline
 * movie due and waiting for approval (a deletion batch of one), the kept title
 * with an active Keep, and the snapshot. Pure.
 */
export function cleanupPipelineSeedRows(prefix: string, world: CleanupWorld): CleanupSeedRows {
  const ids = cleanupPipelineSeedIds(prefix);
  const rule: SeedRule = { id: ids.rule, name: 'Old movies to review', mode: 'reviewFirst', definition: CLEANUP_RULE_DEFINITIONS.review };
  const protections: SeedProtections = { keeps: [movieKey(world, 'kept')], excludes: [] };
  const { snapshot, parts } = snapshotRows(world, ids.snapshot);
  return {
    settings: settingsRow(world),
    rules: [ruleRow(world, rule, ids.snapshot, `${prefix}-run-nightly`, protections)],
    snapshot,
    parts,
    items: [itemRow(world, prefix, ids.snapshot, { key: movieKey(world, 'pipeline'), rule, state: 'leaving', leaveIn: -1 })],
    protections: [protectionRow(world, ids.keep, 'memberKeep', movieKey(world, 'kept'))],
    runs: [],
    outcomes: [],
  };
}

/** The Keeps and exclusions of seed rows, for `checkRule()`. @internal Exported for `seed-cleanup.test.ts`. */
export function seedProtections(rows: CleanupSeedRows): SeedProtections {
  const active = rows.protections.filter((row) => row.status !== 'ended');
  return {
    keeps: active.filter((row) => row.kind === 'memberKeep').map((row) => row.itemKey),
    excludes: active.filter((row) => row.kind === 'adminExclude').map((row) => row.itemKey),
  };
}
