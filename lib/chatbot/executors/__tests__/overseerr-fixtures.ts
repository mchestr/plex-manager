/**
 * Overseerr replies of a large server: about 500 members and 500 requests,
 * long-running shows and big casts. Each is shaped like the API's own reply,
 * with the fields the projections drop (emails, Plex tokens, avatars, profile
 * and folder settings, every credit, release date, video and keyword), so the
 * size tests measure what a real server would send.
 */

export const MEMBERS = 500
export const REQUESTS = 500

const AT = "2026-10-01T12:00:00.000Z"
const MACHINE = "0123456789abcdef0123456789abcdef01234567"
/** About 3,000 characters, a long TMDB overview. */
export const OVERVIEW = "A sentence of plot summary, repeated to the length of a long TMDB overview. ".repeat(40)

/** A user as `/user` and every request carry them, with a display name past the 64-character cap. */
export function overseerrUser(id: number) {
  return {
    id,
    email: `member${id}@example.invalid`,
    plexUsername: `member${id}`,
    username: null,
    displayName: `Member ${id} with a display name long enough to reach the cap`.padEnd(70, "!"),
    userType: 1,
    plexId: 1_000_000 + id,
    plexToken: `plex-token-${id}`,
    avatar: `https://plex.tv/users/${id}/avatar?c=1700000000`,
    permissions: 1_048_576,
    requestCount: 12,
    createdAt: AT,
    updatedAt: AT,
    settings: { locale: "en", region: "US", originalLanguage: null },
  }
}

/** A title's Overseerr record (`mediaInfo`), sent to Sonarr or Radarr and with a copy in Plex. */
export function overseerrMedia(i: number, type: "movie" | "tv") {
  const ratingKey = 50_000 + i
  const slug = `a-title-slug-of-ordinary-length-${i}`
  return {
    id: i,
    mediaType: type,
    tmdbId: 100_000 + i,
    tvdbId: type === "tv" ? 300_000 + i : null,
    imdbId: `tt${9_000_000 + i}`,
    status: 3,
    status4k: 1,
    createdAt: AT,
    updatedAt: AT,
    lastSeasonChange: AT,
    mediaAddedAt: null,
    serviceId: 0,
    serviceId4k: null,
    externalServiceId: 2_000 + i,
    externalServiceId4k: null,
    externalServiceSlug: slug,
    externalServiceSlug4k: null,
    ratingKey: String(ratingKey),
    ratingKey4k: null,
    plexUrl: `https://app.plex.tv/desktop#!/server/${MACHINE}/details?key=%2Flibrary%2Fmetadata%2F${ratingKey}`,
    iOSPlexUrl: `plex://preplay/?metadataKey=%2Flibrary%2Fmetadata%2F${ratingKey}&server=${MACHINE}`,
    serviceUrl: type === "tv" ? `http://sonarr.lan:8989/series/${slug}` : `http://radarr.lan:7878/movie/${slug}`,
    downloadStatus: [],
    downloadStatus4k: [],
  }
}

/** Request `i`: even ones are TV requests for `seasons` seasons of mixed status, odd ones movies. */
export function overseerrRequest(i: number, seasons = 12) {
  const type = i % 2 === 0 ? "tv" : "movie"
  return {
    id: 1_000 + i,
    status: (i % 4) + 1,
    createdAt: AT,
    updatedAt: AT,
    type,
    is4k: i % 9 === 0,
    serverId: 0,
    profileId: 4,
    rootFolder: "/data/media/library",
    languageProfileId: 1,
    tags: [],
    isAutoRequest: i % 5 === 0,
    media: overseerrMedia(i, type),
    seasons:
      type === "tv"
        ? Array.from({ length: seasons }, (_, s) => ({ id: s + 1, seasonNumber: s + 1, status: s % 3 === 0 ? 1 : 2, createdAt: AT, updatedAt: AT }))
        : [],
    seasonCount: type === "tv" ? seasons : 0,
    requestedBy: overseerrUser((i % MEMBERS) + 1),
    modifiedBy: i % 4 === 1 ? overseerrUser(1) : null,
  }
}

/** `GET /request?take=&skip=` on a server with `total` requests, newest first. */
export function requestPage(url: URL, total = REQUESTS) {
  const take = Number(url.searchParams.get("take"))
  const skip = Number(url.searchParams.get("skip") ?? 0)
  const count = Math.max(0, Math.min(take, total - skip))
  return {
    pageInfo: { pages: Math.ceil(total / take), pageSize: take, results: total, page: Math.ceil(skip / take) + 1 },
    results: Array.from({ length: count }, (_, k) => overseerrRequest(total - skip - k)),
  }
}

/** `GET /user?take=&skip=` on a server with `total` users. */
export function userPage(url: URL, total = MEMBERS) {
  const take = Number(url.searchParams.get("take"))
  const skip = Number(url.searchParams.get("skip"))
  const count = Math.max(0, Math.min(take, total - skip))
  return {
    pageInfo: { pages: Math.ceil(total / take), pageSize: take, results: total, page: skip / take + 1 },
    results: Array.from({ length: count }, (_, k) => overseerrUser(skip + k + 1)),
  }
}

function person(i: number) {
  return { id: 5_000_000 + i, gender: 2, profilePath: `/profile-${i}.jpg`, creditId: `52fe4${i}c3c3a36847f80c9b`, name: `Actor Number ${i} With A Fairly Long Stage Name` }
}

/** Cast in reverse billing order, so a projection has to sort it. */
function cast(size: number) {
  return Array.from({ length: size }, (_, c) => ({ ...person(c), castId: c, character: `Character ${c} / Another Alias`, order: size - 1 - c }))
}

function crew(size: number, director: string) {
  return Array.from({ length: size }, (_, c) => ({ ...person(10_000 + c), department: c < 2 ? "Directing" : "Crew", job: c < 2 ? director : "Grip" }))
}

const many = <T>(count: number, item: (index: number) => T) => Array.from({ length: count }, (_, index) => item(index))

const extras = {
  backdropPath: "/backdrop.jpg",
  posterPath: "/poster.jpg",
  originalLanguage: "en",
  popularity: 512.5,
  homepage: "https://example.invalid/title",
  relatedVideos: many(40, (v) => ({ url: `https://www.youtube.com/watch?v=video${v}`, key: `video${v}`, name: `Trailer ${v}`, size: 1080, type: "Trailer", site: "YouTube" })),
  productionCountries: [{ iso_3166_1: "US", name: "United States of America" }],
  spokenLanguages: [{ iso_639_1: "en", name: "English", englishName: "English" }],
  keywords: many(100, (k) => ({ id: k, name: `keyword ${k}` })),
  watchProviders: many(50, (w) => ({ iso_3166_1: `C${w}`, link: "https://www.themoviedb.org/watch", flatrate: [{ displayPriority: 1, logoPath: "/l.jpg", id: 8, name: "Streaming Service" }] })),
}

const issues = (count: number) => many(count, (n) => ({ id: n, issueType: 1, status: 1, problemSeason: 0, problemEpisode: 0, createdBy: overseerrUser(n + 1), comments: [] }))

/** `GET /movie/{id}`: a blockbuster with 300 cast, 1,500 crew, release dates in 100 countries and 30 requests. */
export function movieDetails(id: number, castSize = 300) {
  return {
    ...extras,
    id,
    imdbId: `tt${id}`,
    adult: false,
    budget: 190_000_000,
    genres: [{ id: 878, name: "Science Fiction" }, { id: 12, name: "Adventure" }],
    originalTitle: "Synthetic Movie",
    overview: OVERVIEW,
    productionCompanies: many(12, (c) => ({ id: c, name: `Production Company ${c}`, originCountry: "US", logoPath: "/logo.png" })),
    releaseDate: "2026-03-01",
    releases: { results: many(100, (c) => ({ iso_3166_1: `C${c}`, release_dates: many(6, (r) => ({ certification: "PG-13", note: "Premiere", release_date: AT, type: r + 1 })) })) },
    revenue: 700_000_000,
    runtime: 166,
    status: "Released",
    tagline: "A tagline.",
    title: "Synthetic Movie",
    video: false,
    voteAverage: 8.236,
    voteCount: 6_000,
    credits: { cast: cast(castSize), crew: crew(1_500, "Director") },
    collection: { id: 1, name: "Synthetic Collection", posterPath: "/c.jpg", backdropPath: "/c.jpg" },
    externalIds: { imdbId: `tt${id}`, facebookId: "fb", instagramId: "ig", twitterId: "tw" },
    mediaInfo: { ...overseerrMedia(id, "movie"), status: 5, requests: many(30, (r) => overseerrRequest(2 * r + 1)), issues: issues(20) },
  }
}

/** `GET /tv/{id}`: a long-running show with every season's cast (2,500), `seasons` seasons and 40 requests. */
export function tvDetails(id: number, { castSize = 2_500, seasons = 60 } = {}) {
  const episode = (episodeNumber: number, airDate: string) => ({
    id: episodeNumber,
    name: "An Episode Title",
    airDate,
    episodeNumber,
    overview: OVERVIEW,
    productionCode: "",
    seasonNumber: seasons,
    showId: id,
    stillPath: "/still.jpg",
    voteAverage: 8,
    voteCount: 50,
  })
  return {
    ...extras,
    id,
    contentRatings: { results: many(40, (c) => ({ iso_3166_1: `C${c}`, rating: "TV-MA" })) },
    createdBy: many(7, (c) => ({ id: c, name: `Creator ${c}`, gender: 1, profilePath: "/p.jpg" })),
    episodeRunTime: [52, 60],
    firstAirDate: "1966-01-01",
    genres: [{ id: 18, name: "Drama" }, { id: 80, name: "Crime" }],
    inProduction: true,
    languages: ["en"],
    lastAirDate: "2026-10-30",
    lastEpisodeToAir: episode(8, "2026-10-30"),
    name: "Synthetic Long-Running Show",
    nextEpisodeToAir: episode(9, "2026-11-06"),
    networks: many(3, (n) => ({ id: n, name: `Network ${n}`, originCountry: "US", logoPath: "/n.png" })),
    numberOfEpisodes: seasons * 22,
    numberOfSeasons: seasons,
    originCountry: ["US"],
    originalName: "Synthetic Long-Running Show",
    overview: OVERVIEW,
    productionCompanies: many(10, (c) => ({ id: c, name: `Studio ${c}`, originCountry: "US", logoPath: "/s.png" })),
    seasons: many(seasons + 1, (s) => ({ airDate: `${1966 + s}-01-01`, episodeCount: 22, id: s, name: s === 0 ? "Specials" : `Season ${s}`, overview: OVERVIEW.slice(0, 500), posterPath: "/s.jpg", seasonNumber: s })),
    status: "Returning Series",
    tagline: "",
    type: "Scripted",
    voteAverage: 8.44,
    voteCount: 20_000,
    credits: { cast: cast(castSize), crew: crew(1_000, "Executive Producer") },
    externalIds: { imdbId: `tt${id}`, tvdbId: 300_000 + id, facebookId: "fb", instagramId: "ig", twitterId: "tw" },
    mediaInfo: {
      ...overseerrMedia(id, "tv"),
      status: 4,
      seasons: many(seasons, (s) => ({ id: s, seasonNumber: s + 1, status: s < seasons - 1 ? 5 : 3, status4k: 1, createdAt: AT, updatedAt: AT })),
      requests: many(40, (r) => overseerrRequest(2 * r, seasons)),
      issues: issues(20),
    },
  }
}

/** `GET /discover/movies` or `/discover/tv`: page `page` of 500, 20 titles with long overviews; every fourth is available. */
export function discoverPage(page: number, kind: "movie" | "tv") {
  return {
    page,
    totalPages: 500,
    totalResults: 10_000,
    keywords: [],
    results: many(20, (r) => {
      const id = page * 100 + r
      const common = { id, mediaType: kind, popularity: 100 - r, posterPath: "/p.jpg", backdropPath: "/b.jpg", voteCount: 1_000, voteAverage: 7.25, genreIds: [18, 80], overview: OVERVIEW, originalLanguage: "en" }
      const mediaInfo = r % 4 === 0 ? { mediaInfo: { ...overseerrMedia(id, kind), status: 5 } } : {}
      return kind === "movie"
        ? { ...common, title: `Discovered Movie ${id}`, originalTitle: `Original ${id}`, releaseDate: "2026-05-01", adult: false, video: false, ...mediaInfo }
        : { ...common, name: `Discovered Show ${id}`, originalName: `Original ${id}`, originCountry: ["US"], firstAirDate: "2026-05-01", ...mediaInfo }
    }),
  }
}
