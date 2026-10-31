/**
 * A large Sonarr and Radarr server for the tool output size tests: 1,500
 * series, 3,000 movies, long titles and release names, and every record as
 * heavy as the v3 API sends it (nested series, movies, files, images, custom
 * formats). Built from the shapes in Sonarr's and Radarr's API resources.
 */

const SHOW_TITLES = [
  "The Lord of the Rings: The Rings of Power",
  "Marvel's Agents of S.H.I.E.L.D.",
  "It's Always Sunny in Philadelphia",
  "Law & Order: Special Victims Unit",
  "The Marvelous Mrs. Maisel",
  "Star Wars: The Clone Wars",
  "Avatar: The Last Airbender",
  "Brooklyn Nine-Nine",
  "Slow Horses",
  "Severance",
]

const MOVIE_TITLES = [
  "The Lord of the Rings: The Fellowship of the Ring",
  "Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb",
  "Everything Everywhere All at Once",
  "Spider-Man: Across the Spider-Verse",
  "Mission: Impossible - Dead Reckoning Part One",
  "Dune: Part Two",
  "Heat",
]

const LONG_TEXT = "A long synopsis from the metadata provider, sent whole on every record. ".repeat(12)

export const showTitle = (i: number) => `${SHOW_TITLES[i % SHOW_TITLES.length]} ${Math.floor(i / SHOW_TITLES.length) + 1}`
export const movieTitle = (i: number) => `${MOVIE_TITLES[i % MOVIE_TITLES.length]} ${Math.floor(i / MOVIE_TITLES.length) + 1}`
const slug = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-")
const release = (title: string, tag: string) => `${title.replace(/[^A-Za-z0-9]+/g, ".")}.${tag}.2160p.AMZN.WEB-DL.DDP5.1.Atmos.DV.HDR10Plus.H.265-FLUX`

const images = (id: number) =>
  ["poster", "banner", "fanart", "clearlogo"].map((coverType) => ({
    coverType,
    url: `/MediaCover/${id}/${coverType}.jpg?lastWrite=638123456789012345`,
    remoteUrl: `https://artworks.thetvdb.com/banners/v4/series/${id}/${coverType}s/64a1b2c3d4e5f.jpg`,
  }))

const quality = { quality: { id: 19, name: "WEBDL-2160p", source: "web", resolution: 2160 }, revision: { version: 1, real: 0, isRepack: false } }
const customFormats = ["DV HDR10+", "AMZN", "Atmos", "Repack/Proper", "x265 (HD)"].map((name, id) => ({
  id,
  name,
  includeCustomFormatWhenRenaming: false,
  specifications: [{ name, implementation: "ReleaseTitleSpecification", negate: false, required: false, fields: [{ order: 0, name: "value", label: "Regular Expression", value: "\\b(DV|HDR10P)\\b" }] }],
}))

/** A series as `/api/v3/series` sends it. */
export function sonarrSeries(i: number) {
  const title = showTitle(i)
  return {
    id: i + 1,
    title,
    alternateTitles: [{ title: `${title} (US)`, seasonNumber: -1 }],
    sortTitle: title.toLowerCase(),
    status: i % 3 === 0 ? "ended" : "continuing",
    ended: i % 3 === 0,
    overview: LONG_TEXT,
    network: "Prime Video",
    airTime: "21:00",
    images: images(i + 1),
    originalLanguage: { id: 1, name: "English" },
    seasons: Array.from({ length: 8 }, (_, s) => ({
      seasonNumber: s + 1,
      monitored: true,
      statistics: { episodeFileCount: 10, episodeCount: 10, totalEpisodeCount: 10, sizeOnDisk: 21474836480, releaseGroups: ["FLUX", "NTb"], percentOfEpisodes: 100 },
    })),
    year: 2010 + (i % 15),
    path: `/data/media/tv/${title}`,
    qualityProfileId: 1 + (i % 4),
    seasonFolder: true,
    monitored: true,
    monitorNewItems: "all",
    useSceneNumbering: false,
    runtime: 55,
    tvdbId: 300000 + i,
    tvRageId: 0,
    tvMazeId: 10000 + i,
    tmdbId: 60000 + i,
    firstAired: "2010-01-01T00:00:00Z",
    lastAired: "2026-10-01T00:00:00Z",
    seriesType: "standard",
    cleanTitle: slug(title).replace(/-/g, ""),
    imdbId: `tt${7000000 + i}`,
    titleSlug: slug(title),
    rootFolderPath: "/data/media/tv/",
    certification: "TV-MA",
    genres: ["Drama", "Thriller", "Mystery"],
    tags: [1, 2],
    added: "2023-05-01T12:34:56.1234567Z",
    ratings: { votes: 1234, value: 8.4 },
    statistics: { seasonCount: 8, episodeFileCount: 76, episodeCount: 80, totalEpisodeCount: 82, sizeOnDisk: 171798691840, releaseGroups: ["FLUX", "NTb"], percentOfEpisodes: 95 },
  }
}

/** An episode as `/api/v3/episode` sends it, with its whole series when `withSeries`. */
export function sonarrEpisode(i: number, { seriesIndex = i % 1500, season = 1 + (i % 8), number = 1 + (i % 24), withSeries = true } = {}) {
  return {
    id: 100000 + i,
    seriesId: seriesIndex + 1,
    tvdbId: 9000000 + i,
    episodeFileId: i % 2 === 0 ? 50000 + i : 0,
    seasonNumber: season,
    episodeNumber: number,
    title: `An Episode Title That Runs Long, Part ${number}`,
    airDate: "2026-11-02",
    airDateUtc: "2026-11-02T02:00:00Z",
    lastSearchTime: "2026-10-30T08:15:00.5Z",
    runtime: 55,
    overview: LONG_TEXT,
    hasFile: i % 2 === 0,
    monitored: true,
    absoluteEpisodeNumber: i + 1,
    sceneAbsoluteEpisodeNumber: i + 1,
    sceneEpisodeNumber: number,
    sceneSeasonNumber: season,
    unverifiedSceneNumbering: false,
    endTime: "2026-11-02T02:55:00Z",
    grabDate: "2026-11-02T03:30:00Z",
    images: images(100000 + i),
    ...(withSeries && { series: sonarrSeries(seriesIndex) }),
  }
}

const statusMessages = [{ title: "One or more episodes expected in this release were not imported", messages: ["No files found are eligible for import in /data/downloads/complete/tv/release"] }]

/** A history record as `/api/v3/history` sends it with `includeSeries` and `includeEpisode`. */
export function sonarrHistory(i: number) {
  const episode = sonarrEpisode(i, { withSeries: false })
  return {
    id: 900000 - i,
    episodeId: episode.id,
    seriesId: episode.seriesId,
    sourceTitle: release(showTitle(i % 1500), `S0${episode.seasonNumber}E${episode.episodeNumber}`),
    languages: [{ id: 1, name: "English" }],
    quality,
    customFormats,
    customFormatScore: 1500,
    qualityCutoffNotMet: false,
    date: "2026-10-30T21:04:11Z",
    downloadId: `SABnzbd_nzo_${i}abcdef`,
    eventType: i % 5 === 0 ? "downloadFailed" : "grabbed",
    data: {
      indexer: "NZBgeek (Prowlarr)",
      releaseGroup: "FLUX",
      downloadClient: "SABnzbd",
      downloadUrl: `http://prowlarr:9696/1/api?t=get&id=${i}&apikey=0123456789abcdef`,
      message: i % 5 === 0 ? "Import failed, path does not exist or is not accessible by Sonarr: /data/downloads/complete/tv/release" : undefined,
      size: "5368709120",
    },
    episode,
    series: sonarrSeries(i % 1500),
  }
}

/** A queue item as `/api/v3/queue` sends it with `includeSeries` and `includeEpisode`. */
export function sonarrQueueItem(i: number) {
  const episode = sonarrEpisode(i, { withSeries: false })
  return {
    id: 70000 + i,
    seriesId: episode.seriesId,
    episodeId: episode.id,
    seasonNumber: episode.seasonNumber,
    series: sonarrSeries(i % 1500),
    episode,
    languages: [{ id: 1, name: "English" }],
    quality,
    customFormats,
    customFormatScore: 1500,
    size: 5368709120,
    title: release(showTitle(i % 1500), `S0${episode.seasonNumber}E${episode.episodeNumber}`),
    sizeleft: 2147483648,
    timeleft: "00:12:30",
    estimatedCompletionTime: "2026-10-31T15:12:30Z",
    added: "2026-10-31T14:00:00Z",
    status: "downloading",
    trackedDownloadStatus: i % 4 === 0 ? "warning" : "ok",
    trackedDownloadState: i % 4 === 0 ? "importBlocked" : "downloading",
    statusMessages: i % 4 === 0 ? statusMessages : [],
    errorMessage: i % 7 === 0 ? "The download is stalled with no connections" : undefined,
    downloadId: `SABnzbd_nzo_${i}abcdef`,
    protocol: "usenet",
    downloadClient: "SABnzbd",
    downloadClientHasPostImportCategory: false,
    indexer: "NZBgeek (Prowlarr)",
    outputPath: "/data/downloads/complete/tv/release",
    episodeHasFile: false,
  }
}

/** A series lookup result, as `/api/v3/series/lookup` sends it. */
export function sonarrLookup(i: number) {
  const { id: _id, statistics: _statistics, path: _path, ...series } = sonarrSeries(i)
  return { ...series, remotePoster: "https://artworks.thetvdb.com/banners/posters/1.jpg", folder: series.title }
}

/** A movie as `/api/v3/movie` sends it, with its file and media info. */
export function radarrMovie(i: number) {
  const title = movieTitle(i)
  return {
    id: i + 1,
    title,
    originalTitle: title,
    originalLanguage: { id: 1, name: "English" },
    alternateTitles: Array.from({ length: 20 }, (_, n) => ({ sourceType: "tmdb", movieMetadataId: i + 1, title: `${title} (alternate ${n})`, cleanTitle: `${slug(title)}${n}` })),
    secondaryYearSourceId: 0,
    sortTitle: title.toLowerCase(),
    sizeOnDisk: 64424509440,
    status: "released",
    overview: LONG_TEXT,
    inCinemas: "2024-02-27T00:00:00Z",
    physicalRelease: "2024-05-14T00:00:00Z",
    digitalRelease: "2024-04-16T00:00:00Z",
    releaseDate: "2024-04-16T00:00:00Z",
    images: images(i + 1),
    website: "https://www.example.com/movie",
    year: 1990 + (i % 35),
    youTubeTrailerId: "Way9Dexny3w",
    studio: "Legendary Pictures",
    path: `/data/media/movies/${title} (2024)`,
    qualityProfileId: 1 + (i % 4),
    hasFile: i % 3 !== 0,
    movieFileId: i % 3 !== 0 ? 80000 + i : 0,
    monitored: true,
    minimumAvailability: "released",
    isAvailable: true,
    folderName: `/data/media/movies/${title} (2024)`,
    runtime: 166,
    cleanTitle: slug(title).replace(/-/g, ""),
    imdbId: `tt${15000000 + i}`,
    tmdbId: 690000 + i,
    titleSlug: `${slug(title)}-${690000 + i}`,
    rootFolderPath: "/data/media/movies/",
    certification: "PG-13",
    genres: ["Science Fiction", "Adventure"],
    keywords: ["desert", "prophecy", "sequel", "based on novel or book", "spice"],
    tags: [3],
    added: "2024-05-20T09:30:00Z",
    ratings: { imdb: { votes: 500000, value: 8.6, type: "user" }, tmdb: { votes: 5000, value: 8.2, type: "user" }, rottenTomatoes: { votes: 0, value: 92, type: "user" } },
    movieFile: {
      id: 80000 + i,
      movieId: i + 1,
      relativePath: `${title} (2024) WEBDL-2160p.mkv`,
      path: `/data/media/movies/${title} (2024)/${title} (2024) WEBDL-2160p.mkv`,
      size: 64424509440,
      dateAdded: "2024-05-20T10:00:00Z",
      languages: [{ id: 1, name: "English" }],
      quality,
      customFormats,
      mediaInfo: { audioBitrate: 768000, audioChannels: 7.1, audioCodec: "EAC3 Atmos", audioLanguages: "eng/fre/ger/ita/spa", audioStreamCount: 5, videoBitDepth: 10, videoBitrate: 25000000, videoCodec: "x265", videoDynamicRangeType: "DV HDR10Plus", videoFps: 23.976, resolution: "3840x1600", runTime: "2:46:00", scanType: "Progressive", subtitles: "eng/fre/ger/ita/spa/por/dut/swe/nor/dan/fin" },
      releaseGroup: "FLUX",
    },
    collection: { title: `${title} Collection`, tmdbId: 726871 },
    popularity: 250.5,
    statistics: { movieFileCount: i % 3 !== 0 ? 1 : 0, sizeOnDisk: 64424509440, releaseGroups: ["FLUX"] },
  }
}

/** A history record as `/api/v3/history` sends it with `includeMovie`. */
export function radarrHistory(i: number) {
  const movie = radarrMovie(i % 3000)
  return {
    id: 600000 - i,
    movieId: movie.id,
    sourceTitle: release(movie.title, "2024"),
    languages: [{ id: 1, name: "English" }],
    quality,
    customFormats,
    customFormatScore: 1500,
    qualityCutoffNotMet: false,
    date: "2026-10-30T21:04:11Z",
    downloadId: `qbittorrent_${i}0123456789abcdef0123456789abcdef`,
    eventType: i % 5 === 0 ? "downloadFailed" : "grabbed",
    data: { indexer: "TorrentLeech (Prowlarr)", releaseGroup: "FLUX", torrentInfoHash: "0123456789abcdef0123456789abcdef01234567", message: i % 5 === 0 ? "Import failed: not enough free space on /data/media/movies" : undefined },
    movie,
  }
}

/** A queue item as `/api/v3/queue` sends it with `includeMovie`. */
export function radarrQueueItem(i: number) {
  const movie = radarrMovie(i % 3000)
  return {
    id: 40000 + i,
    movieId: movie.id,
    movie,
    languages: [{ id: 1, name: "English" }],
    quality,
    customFormats,
    customFormatScore: 1500,
    size: 64424509440,
    title: release(movie.title, "2024"),
    sizeleft: 32212254720,
    timeleft: "01:40:00",
    estimatedCompletionTime: "2026-10-31T16:40:00Z",
    added: "2026-10-31T14:00:00Z",
    status: "downloading",
    trackedDownloadStatus: i % 4 === 0 ? "warning" : "ok",
    trackedDownloadState: i % 4 === 0 ? "importPending" : "downloading",
    statusMessages: i % 4 === 0 ? statusMessages : [],
    errorMessage: i % 7 === 0 ? "qBittorrent is reporting an error" : undefined,
    downloadId: `qbittorrent_${i}0123456789abcdef0123456789abcdef`,
    protocol: "torrent",
    downloadClient: "qBittorrent",
    indexer: "TorrentLeech (Prowlarr)",
    outputPath: "/data/downloads/complete/movies/release",
  }
}

/** A movie lookup result, as `/api/v3/movie/lookup` sends it. */
export function radarrLookup(i: number) {
  const { id: _id, movieFile: _movieFile, path: _path, ...movie } = radarrMovie(i)
  return { ...movie, remotePoster: "https://image.tmdb.org/t/p/original/poster.jpg", folder: movie.title }
}

/** A quality profile with groups and a score for every custom format, as `/api/v3/qualityProfile` sends it. */
export function qualityProfile(i: number) {
  const single = (id: number, name: string, allowed: boolean) => ({ quality: { id, name, source: "web", resolution: 1080 }, items: [], allowed })
  return {
    id: i + 1,
    name: `Profile ${i + 1} for 4K HDR and 1080p fallbacks`,
    upgradeAllowed: true,
    cutoff: 1001,
    items: [
      single(1, "SDTV", false),
      single(4, "HDTV-720p", false),
      single(9, "HDTV-1080p", true),
      { id: 1001, name: "WEB 1080p", items: [single(3, "WEBDL-1080p", true), single(15, "WEBRip-1080p", true)], allowed: true },
      single(7, "Bluray-1080p", true),
      { id: 1002, name: "WEB 2160p", items: [single(18, "WEBDL-2160p", true), single(17, "WEBRip-2160p", true)], allowed: i % 2 === 0 },
      single(19, "Bluray-2160p", i % 2 === 0),
      single(20, "Bluray-2160p Remux", false),
    ],
    minFormatScore: 0,
    cutoffFormatScore: 10000,
    minUpgradeFormatScore: 1,
    formatItems: Array.from({ length: 120 }, (_, n) => ({ format: n + 1, name: `Custom format number ${n + 1}`, score: n % 3 === 0 ? 100 : 0 })),
    language: { id: 1, name: "English" },
  }
}

/** A root folder that names 3,000 folders the library does not hold. */
export function rootFolder(i: number) {
  return {
    id: i + 1,
    path: `/data/media/root-${i + 1}/`,
    accessible: true,
    freeSpace: 4398046511104,
    unmappedFolders: Array.from({ length: 3000 }, (_, n) => ({ name: `Unmapped Folder ${n}`, path: `/data/media/root-${i + 1}/Unmapped Folder ${n}`, relativePath: `Unmapped Folder ${n}` })),
  }
}

export function range<T>(count: number, build: (i: number) => T): T[] {
  return Array.from({ length: count }, (_, i) => build(i))
}

const mockFetch = jest.fn()

function respond(body: unknown) {
  return { ok: true, status: 200, headers: new Headers(), json: async () => body }
}

/**
 * Answers by path like a Sonarr or Radarr server: an array route is sent
 * whole; a paged route (`{ paged: records, totalRecords }`) sends the page
 * and pageSize asked for.
 */
export function serveArr(routes: Record<string, unknown>) {
  global.fetch = mockFetch as unknown as typeof fetch
  mockFetch.mockReset()
  mockFetch.mockImplementation(async (url: string) => {
    const { pathname, searchParams } = new URL(url)
    if (!(pathname in routes)) throw new Error(`unexpected ${pathname}`)
    const route = routes[pathname]
    if (typeof route !== "object" || route === null || !("paged" in route) || !Array.isArray(route.paged)) return respond(route)
    const page = Number(searchParams.get("page"))
    const pageSize = Number(searchParams.get("pageSize"))
    const totalRecords = "totalRecords" in route && typeof route.totalRecords === "number" ? route.totalRecords : route.paged.length
    return respond({ page, pageSize, totalRecords, records: route.paged.slice((page - 1) * pageSize, page * pageSize) })
  })
  return mockFetch
}

/** A paged route of `records`, out of `totalRecords` on the server. */
export function paged(records: unknown[], totalRecords = records.length) {
  return { paged: records, totalRecords }
}
