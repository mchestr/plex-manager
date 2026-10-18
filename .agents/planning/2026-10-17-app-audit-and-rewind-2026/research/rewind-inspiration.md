# Rewind 2026 Inspiration: Best-in-Class Year-in-Review Experiences and a Stat Catalogue

- **Date:** 2026-10-17
- **Scope:** Research input for the "Rewind 2026" redesign (the user-facing name of the existing Wrapped feature in `components/wrapped/**`, `lib/wrapped/**`, `actions/wrapped-generation.ts`)
- **Author:** research subagent (rewind-inspiration)

## Question

What does a best-in-class "year in review" look like in 2025-2026, and what stats and formats should our Plex "Rewind 2026" offer? Specifically: (1) a stat catalogue grouped by theme, each tagged NEW or EXISTING with its data source and feasibility; (2) narrative and format patterns; (3) 2025-2026 visual design trends for recaps; (4) share mechanics; (5) privacy pitfalls and how good products handle them.

## TL;DR

- **The 2025 bar moved from "stats slideshow" to "social, interactive, and deterministic".** Spotify Wrapped 2025 added a live multiplayer "Wrapped Party" (up to 10 people), a Top Song guessing quiz, a month-by-month "Top Artist Sprint", Clubs (6 listening-style groups with roles), and "Listening Age". It was well received after the 2024 edition was panned for AI-generated, opaque content. YouTube shipped its first Recap (up to 12 cards, 14 personality types with rarity). Apple Replay added Discovery, Loyalty and Comebacks. The lesson for us: compute the numbers in code, let the LLM write the copy, and add one or two playful interactive or social beats.
- **Our data is richer than our stats.** Every Tautulli `get_history` row we already download carries `percent_complete`, `watched_status`, `paused_counter`, `stopped`, `platform`, `player`, `product`, `transcode_decision`, `location`, `live` and `originally_available_at`. We use none of them. Using them unlocks completion and abandonment, binge sessions, devices and quality, premiere-chasing, and real scorers for the two archetypes that score 0 today (`credits-roller`, `premiere-chaser`). This needs no new API calls.
- **Genres, actors and directors are the biggest missing stats.** Letterboxd, Trakt, Steam and finstats all show them. Tautulli `get_metadata` returns `genres`, `directors`, `actors`, `writers`, `studio` and `collections` for each `rating_key`. Today `topGenre` is an LLM "best inference" from titles (`lib/wrapped/prompt-template.ts:245`). Rewind 2026 should compute it, using a cached metadata lookup.
- **Several existing integrations read field names the APIs do not return, so check them before building on top.** `get_item_user_stats` returns `total_plays` and `total_time`, but `lib/wrapped/tautulli-leaderboards.ts` reads `total_duration`, `duration`, `time` and `plays`. It also passes a `time_range` the command does not accept, so these "yearly" per-title leaderboards are all-time. Overseerr request status `3` means declined (and `5` means completed), but `lib/wrapped/overseerr-statistics.ts` counts `3` as approved and ignores `5`. Its genre counts read `media.genres`, a field that is not in the MediaRequest/MediaInfo schema. Hour-of-day buckets use the Node process timezone, which is UTC in our Alpine image unless `TZ` is set.
- **Privacy is the one area where we are behind the open-source tools, and it is fixable.** The public share endpoint `app/api/wrapped/share/[token]/route.ts` returns the full `data` JSON. That JSON includes `statistics.leaderboards` with other users' usernames, friendly names and watch times, and the display name falls back to the user's email. Share tokens are created automatically and can be neither revoked nor expired. finstats sets the pattern to follow: users see only their own recap, share cards never name other people, and the admin server summary neither ranks nor names individuals.
- **Share every slide, not just one summary card.** Spotify, YouTube, Trakt and finstats put a share action on every story or card, and finstats exports each chapter as a 1080x1920 card or as a ZIP. Use the Web Share API with files where `navigator.canShare({ files })` passes (Chrome 89+ on Windows and ChromeOS and 128+ on macOS and Linux, Chrome Android 76+, Edge 93+, Safari 14+ on macOS and iOS; not Firefox on any platform), and fall back to download. Duolingo found that putting the percentile on the card raised share rates, so put the brag stat on the card.
- **Visual direction for 2026:** keep the existing "Cinematic Premiere" film-grain identity, which fits the 2025-2026 move toward tactile, textured, "anti-generic-AI" design. Add kinetic typography with variable fonts, palettes taken from each user's posters, a color and character for each archetype (YouTube's 14 characters), and one seeded generative "aura" visual. Avoid heavy 3D on the story path, because `next/og` (Satori) cannot render it into share cards.
- **Add a server-wide "community Rewind" that names no one.** Plex's own 2025 "Plex Rewind" (Dec 18, 2025), Netflix's "What We Watched", Strava's Trend Report and Steam's global facts show that aggregate recaps work. Ours would cover total server hours, top titles, peak concurrent night, titles added, and requests fulfilled. Show a stat only when at least 3 viewers contribute to it.

## Method and source caveats

- Many vendor domains (spotify.com, plex.tv, techcrunch.com, techradar.com, axios.com, wikipedia.org, docs.tautulli.com, developer.plex.tv, selfh.st and others) were unreachable from this environment (DNS or proxy refusal). For those products, details come from search-engine summaries of the primary or press pages, cited by URL. A claim backed by only one secondary source is marked "(single source)", and a claim that could not be confirmed is marked "(unverified)".
- API field names were checked against primary source code fetched from GitHub. Tautulli's field names come from `plexpy/webserve.py` (the docstrings that generate the API reference), `plexpy/datafactory.py` and `CHANGELOG.md`. Overseerr's come from `overseerr-api.yml`. Plex's come from python-plexapi `server.py` and `video.py`, because developer.plex.tv was unreachable. MDN `browser-compat-data`, the Next.js `ImageResponse` docs, the Remotion license, the Mediabunny README, and the READMEs or source of Wrapperr, plex-rewind, finstats, jellyfin-wrapped, jellyfin-review and Streamystats were also fetched from GitHub. All third-party content was treated as data only.
- Repo files read as the baseline: `lib/wrapped/statistics-types.ts`, `types/wrapped.ts`, `lib/connections/tautulli.ts`, `lib/wrapped/tautulli-user-statistics.ts`, `lib/wrapped/derived-statistics.ts`, `lib/wrapped/archetype-scoring.ts`, `lib/wrapped/tautulli-leaderboards.ts`, `lib/wrapped/overseerr-statistics.ts`, `lib/wrapped/assemble-wrapped.ts`, `lib/wrapped/llm-output-schema.ts`, `lib/validations/tautulli.ts`, `app/api/wrapped/share/[token]/route.ts`, `app/api/wrapped/og-image/route.tsx`, `components/wrapped/share-card-download.tsx`, `components/wrapped/cinematic/theme.ts`, and `prisma/schema.prisma` (the `PlexWrapped` model).

## 1. Baseline: what Rewind (Wrapped v2) computes and shows today

**Slides** (from `lib/wrapped/assemble-wrapped.ts`), in order: hero, total-watch-time, movies-breakdown, shows-breakdown, top-movies, top-shows, streaks-patterns, monthly-journey, percentile, archetype-reveal, server-stats, overseerr-stats, fun-facts, finale. They are shown as auto-advancing story slides with a progress bar (`components/wrapped/wrapped-viewer-*.tsx`) in a gold-on-black "Cinematic Premiere" theme: film grain, letterbox, spotlight, marquee text, gold count-up and confetti (`components/wrapped/cinematic/*`).

**Statistics that exist today:**

| Group | Fields | Source |
|---|---|---|
| Totals | total, movie and show minutes; distinct movies and shows (keyed by title); episode play count | Tautulli `get_history` (all history fetched, then filtered to the year in code) |
| Top lists | top 10 movies (by plays, then minutes) and top 10 shows (by minutes), with year, rating and ratingKey | same |
| Monthly | minutes per month, plus each month's top movie and top show | same |
| Derived | longest streak, peak hour, 24-hour histogram, day-of-week histogram, most active day, weekend percentage | `computeDerivedStatistics` |
| Percentile | "Top X%" by server watch time | leaderboard position |
| Leaderboards | rank for overall watch time; per-title leaderboards for top items | `get_home_stats`, `get_item_user_stats` |
| Server | storage, library counts | Plex `/library/sections/*/all`, Tautulli fallback |
| Requests | total, approved, pending, top requested genres | Overseerr `/request` |
| Archetype | 12 curated archetypes ranked deterministically; the LLM picks from the top 3 and writes the copy | `archetype-scoring.ts`, `llm-output-schema.ts` |
| LLM-only | `insights.topGenre` (inferred from titles), `bingeWatcher`, `discoveryScore`, `funFacts` | `prompt-template.ts` |

**Field-level findings from checking the APIs.** Fix these before building new stats.

1. **History duration fields.** Tautulli v2.12.3 (2023-04-14) renamed `duration` to `play_duration` in `get_history`. `datafactory.py` still emits `'duration': item['play_duration']`, with the comment "Keep for backwards compatibility". So `duration` is time actually watched, not media length. `viewed_duration`, which our type and comments describe as "actual time watched", does not exist. The code works because it falls back to `duration`, but `lib/validations/tautulli.ts` and the comments in `tautulli-user-statistics.ts` describe the fields incorrectly. Media length is only available from `get_metadata.duration`.
2. **Unused history fields we already download:** `started`, `stopped`, `paused_counter`, `percent_complete`, `watched_status` (1, 0.75, 0.5, 0.25 or 0, based on the server's watched-percent settings), `platform`, `product`, `player`, `transcode_decision`, `location`, `live`, `originally_available_at`, `guid`, `group_count`, `media_index`, `parent_media_index`, `full_title`, and `ip_address` (do not use).
3. **Per-title leaderboards.** `get_item_user_stats(rating_key, media_type, grouping)` returns `friendly_name, user_id, user_thumb, username, total_plays, total_time` and accepts no `time_range`, `before` or `after`. `fetchItemLeaderboard` reads `total_duration || duration || time` and `plays`, so it probably yields 0 minutes and 0 plays for every user and then sorts on those zeros. The results are also all-time, not yearly. (Likely bug: confirm against a live server.)
4. **Overall leaderboard.** `get_home_stats` takes `stats_type` (`plays` or `duration`), `stat_id`, `stats_count`, `time_range` (days), `before`/`after` (`YYYY-MM-DD`, added in v2.14.2, made to work in v2.18.0 on 2026-08-25), `user_id` and `section_id`. Our code sends `type=duration`, which is not a documented parameter. Its `time_range` runs from Jan 1 of the target year to now, so a past-year Rewind includes the current year.
5. **Overseerr.** In the MediaRequest schema, `status` 1 = pending approval, 2 = approved, 3 = declined. The server's `MediaRequestStatus` enum (`server/constants/media.ts`, same in Overseerr and Seerr) also has 4 = FAILED and 5 = COMPLETED, which the OpenAPI description leaves out. Media availability lives on `media.status` (5 = AVAILABLE; in Overseerr 6 = DELETED, in Seerr 6 = BLOCKLISTED and 7 = DELETED). Our code treats `3` as "available" and counts it as approved, and it never counts `5` (completed) as approved. Neither MediaRequest nor MediaInfo has `genres`; genres exist only on `/movie/{id}` and `/tv/{id}`. `topRequestedGenres` is therefore probably always empty. When no Overseerr user matches, the email fallback keeps requests that have no email, which can attribute other users' requests to the viewer. `/request` supports `requestedBy=<userId>`, so we do not need to download every request on the server.
6. **Timezone.** `derived-statistics.ts` buckets times with `Date#getHours()` in the process timezone. The Dockerfile is `node:25.8-alpine` with no `TZ`, so the default is UTC. For a US user, a 9 PM viewing session is counted at 01:00-05:00 UTC. That distorts `peakHour` and the `midnight-marathoner` and `golden-hour-viewer` archetypes.
7. **Dead type.** `WrappedStatistics.longestBinge` is declared but never computed.
8. **Identity keys.** Movies and shows are keyed by title, so remakes with the same title merge (e.g. "Dune" 1984 and 2021). Key by `rating_key` or `guid` instead.
9. **Security note for operators.** Tautulli v2.17.0 (2026-03-27) fixed a SQL injection in the `get_home_stats` API command (CVE-2026-31799), plus several other CVEs; its changelog says versions up to and including 2.16.1 are affected. The app holds the Tautulli API key and calls this command, so the setup or health page should warn when Tautulli is older than 2.17.0. The latest release is v2.18.2 (2026-09-28).

## 2. The 2025-2026 landscape

### 2.1 Product-by-product

| Product (2025 edition) | What was new or notable | Stats and formats | Share mechanics | Reception |
|---|---|---|---|---|
| **Spotify Wrapped 2025** (Dec 3, 2025) | Wrapped Party: a live, mobile-only multiplayer mode for up to 9 invited friends. It awards group titles such as "most obsessed fan", "early bird", "picky listener" and "dinner table explainer", which change with each session and with who joins. Listening Age, estimated from the release years of top tracks. Clubs: 6 listening-style groups, plus a role such as leader, scout or archivist (role names vary by outlet). Top Albums (first time). Fan Leaderboard (rank among an artist's listeners, shown only to top fans). Top Song Quiz (guess before the reveal). Top Artist Sprint (top-5 rankings month by month). An AI "Listening Archive" of up to 5 reports on memorable listening days (English only, select markets). | Minutes (music, podcasts and audiobooks), top artists, songs, albums and genres, clubs, age, archive | A share card on every data story, sent through Spotify Messages or social apps | Broadly positive after the 2024 backlash. 200M users in 24h (+19% year on year, Fast Company). Shared 500M times on day 1 (RouteNote citing TechCrunch). Listening Age was divisive: many users got ages in their 60s and 70s |
| **Spotify Wrapped 2024** (counter-example) | NotebookLM AI podcast; "Music Evolution" with month labels such as "Pink Pilates Princess Strut Pop" | Dropped top genres, albums and Sound Town | n/a | Widely criticized: missing classic stats, opaque AI labels, AI-looking visuals |
| **Apple Music Replay 2025** (Dec 2, 2025) | Discovery (new artists), Loyalty (artists returned to year after year), Comebacks (artists back in rotation). Native in-app dashboard on iOS 26 | Minutes, artist count, longest artist streak, top genres; artist-facing Replay | In-app dashboard (exact share flow not confirmed) | Positive (press) |
| **YouTube Recap 2025** (Dec 2, 2025; first edition) | Up to 12 cards. 14 personality types, each with an animated character; rarity reported (e.g. Philosopher at 0.1%, single source). YouTube Music adds AI "ask about your listening" cards, a Musical Passport (artist locations), and a day-by-day artist history | Top channels, interests, habits. Music stats need 10+ hours | Share button on each card | Mostly positive; some users criticized inaccurate data and the missing total watch time (Business Insider, via NetInfluencer). Eligibility: watch history Jan to late Oct; paused or auto-deleted history is excluded; supervised and under-13 accounts are excluded |
| **Letterboxd Year in Review 2025** (personal summary emailed Jan 2, 2026; community round-up Jan 12, single source) | Personal headline summary for everyone who logged 10+ films; year-round stats pages for Pro and Patron | Films, hours, most-watched actor and director, most-watched week and weekday, first and last film, 5-star films, genres, countries, languages, ratings compared with everyone | Summary page and email | Loved by film fans; waiting until January means the data is complete |
| **Plex (official)** | The 2021 (Dec 23, 2021) and 2022 "Year in Review" blog posts are company-wide retrospectives (product milestones, month-by-month popular titles), not personal recaps. Search summaries show a "premium feature, requires Plex Pass" label on those pages and on the 2025 post, which looks like a site-wide badge (unverified). The 2025 edition is "2025 Plex Rewind" (blog, Dec 18, 2025), a platform-wide report of top titles by month, viewing habits, actors and genres. No personal Plex recap for any year was found | Aggregate only | Blog | n/a. Plex now uses the name "Plex Rewind" itself (see naming note in Section 8) |
| **Trakt Year in Review 2025** (Dec 18, 2025) | Billed as "a cinematic recap of how you watched" (Dec 2025 product roundup). Work on the 2026 edition has started (changelog, unverified). Each user's page is at `trakt.tv/users/<username>/year/2025`, so anyone can view anyone's review by changing the username | Totals, first and last play, hourly, weekly, monthly and day-of-week breakdowns, most plays, networks, studios, highest rated, most-watched actors, actresses and directors. Genre and country-map stats from earlier editions were missing at the 2025 launch; staff said the country map would return | "Shareable snapshots" of movies and shows (2025 changelog) | Mixed: the official feedback thread complained of fewer stats than 2024; some views are VIP-gated |
| **Netflix** | No official personal recap. Published the aggregate "What We Watched" engagement report twice a year through H1 2026 (released July 2026); Netflix said it will publish one annual report each first quarter from 2027 (Hollywood Reporter, July 2026). H2 2025 came to about 96B hours (released Jan 20, 2026; one outlet gives 97.1B, so the exact figure is unverified). Third-party "Netflix Wrapped" tools build a recap from a user's own data export | Aggregate only | n/a | Users fill the gap with third-party tools |
| **Steam Replay 2025** (Dec 16, 2025; data through Dec 14) | Comparison with the average Steam user; split between new, recent and classic releases (14% of all playtime went to 2025 releases) | Top games with share of playtime, games played, longest sessions, longest streak, achievements including rare ones, genres, controller vs keyboard and mouse, Steam Deck share | Several summary image formats, a language dropdown, Save Image, a link to the Replay | Positive; seen as a steady, data-honest format |
| **Reddit Recap** | 2022: "Special Abilities" personality badges and a Rare/Epic/Legendary tier. **Option to swap your username and avatar for a generic "Redditor" label on share cards.** 2025 details not confirmed (unverified) | Top communities, upvotes, streaks, time of day | Personalized share cards | n/a |
| **Strava Year in Sport 2025** | Personal recap moved behind the subscription (about $80/yr) for the first time; separate global Trend Report on Dec 3, 2025 | Progress, milestones | n/a | Backlash from free users (Ars Technica, Dec 19, 2025); some subscribers never got a "ready" notification (unverified) |
| **Duolingo Year in Review 2025** | Lessons, XP, minutes, streak, comparison with other learners; ends on a share card that bundles everything. Learner "styles" were added after the 2021 percentile card (exact years unverified) | as listed | Share card. Duolingo's behind-the-scenes post: in 2020 the top 10% of XP earners produced more than half of all shares, and adding the XP percentile to the card in 2021 raised share rates | Steady |
| **Goodreads Year in Books 2025** (Dec 2025) | Annual stats page plus an email for members who read 3+ books. Books kept private on Kindle are excluded | Pages, shortest and longest book, average length, most and least shelved, average rating, highest rated | Page and email | Steady |

### 2.2 Open-source and self-hosted equivalents

| Project | Platform | What it computes | Notable patterns |
|---|---|---|---|
| **Wrapperr** (aunefyren/wrapperr) | Plex via Tautulli | Movies, shows, music; most-paused movie; oldest movie (pre-1950, 1975 and 2000 variants); movie completion percentage; "birth decade" or viewing age (movies and shows); top show; **show buddy** (the user you share your top show with); oldest album; yearly server stats for movies, shows and music; yearly leaderboard, with a toggle to hide the numbers; ordering by plays or duration; top-list length | Custom date range; optional Plex auth; **share links with expiration**; pre-caching; admin can view any user's wrap; admin pages can be disabled |
| **plex-rewind** (RaunoT/plex-rewind) | Plex via Tautulli and Overseerr | Personal Rewind over a custom period, server dashboard, live activity, Overseerr request totals | Next.js and Tailwind; **can anonymize user information**; Rewind can be switched off; PWA; i18n (English, Estonian, French, German). Note: this open-source project's own name is "Plex Rewind" |
| **finstats** (finstats/finstats) | Jellyfin | Hours; top shows, movies, music and genres; **actors and directors**; "viewing personality" (night owl, weekend warrior, binge watcher); a **calendar of the year**; top weekday; records (biggest binge, longest daily streak, most rewatched, oldest film). Since 2.0: **who you watched with**, **shows finished vs left for later**, request outcomes, **comparison with last year** | **Each chapter exports as a 1080x1920 card, singly or as a ZIP; cards never name other people; users see only their own recap (administrators can open anyone's recap); the admin server summary neither ranks nor names individuals**; optional public profile; December "ready" notification |
| **Jellyfin Wrapped** (johnpc/jellyfin-wrapped) | Jellyfin and the Playback Reporting plugin | Top movies, shows and music; total time; habits | Processing appears to happen in the browser (inferred from the README, not stated). The README warns that an API key set at build time is visible in the frontend bundle |
| **jellyfin-review** ("Jellyfin Wrapped 2025", lotrez) | Jellyfin | Hours, plays, average session length, server ranking, top shows, **binge score** (from session length), **loyalty badge** | Instagram-style swipeable stories with Framer Motion; shareable image cards |
| **Streamystats** | Jellyfin | Dashboard, per-user and per-library stats, client stats; **"Wrapped design for yearly stats"** in v2.18.0 (2026-03-15, per release notes); AI chat with 13 tools; embedding-based recommendations that explain "because you watched X" | Recommendations that show why an item was picked are a good model for a "looking ahead" slide |
| **Jellystat** | Jellyfin | Dashboard: session monitoring and logging, per-library and per-user stats, watch history (README). Playback method breakdown and device and codec logs come from the JellyWatch blog, not the README (unverified) | No year-in-review feature found. The README says a ground-up rebuild is planned and updates are paused apart from major bug fixes |

### 2.3 What users love and what they complain about (synthesis)

**Users love:**
- The classic stats done reliably: top titles, total time, top genre.
- One surprising "identity" beat (personality, club, age), framed playfully.
- Comparison with friends or with everyone else.
- One interactive moment (quiz, party).
- A share card for every story.
- A clear cutoff and an honest data window.

**Users complain about:**
- Missing classics (Spotify 2024).
- Opaque AI labels and AI-looking art (Spotify 2024).
- Results that feel wrong, such as Listening Age (Spotify 2025).
- Paywalling a feature that used to be free (Strava 2025).
- Exposure of friends' viewing they never opted into (Plex Discover Together, 2023).
- Missing "ready" notifications (Strava, unverified).
- Late releases (Spotify 2024 on Dec 4, versus late November in earlier years).

## 3. Stat catalogue for Rewind 2026

**Legend.** EXISTING = computed today (possibly needs a fix). NEW = not computed today. Feasibility: **H** = data already in the `get_history` rows we download (no new API calls); **M** = needs extra, cacheable API calls (e.g. `get_metadata` per title) or server-wide history; **L** = data missing or unreliable for per-user results, or a heavy lift.

Field names are verified against Tautulli source (`webserve.py`, `datafactory.py`), Overseerr `overseerr-api.yml` and python-plexapi. "Server-wide history" means one paginated `get_history` call without `user_id` for the year, cached once per generation batch and reused for every user.

### 3.1 Time

| Stat | Tag | Data source and fields | Feas. | Notes and inspiration |
|---|---|---|---|---|
| Total hours, split into movies and shows | EXISTING | `get_history.play_duration` (alias `duration`), `media_type` | H | Hero stat; add an "equal to N days" line |
| Live TV hours | NEW | `get_history.live` = 1 | H | Show only when > 0 |
| Month-by-month minutes, top movie and top show per month | EXISTING | `date` / `started` | H | Turn into a bar-chart race (Spotify Top Artist Sprint) |
| Biggest and quietest month | NEW | derived from monthly | H | One-liner copy |
| Calendar heatmap of the year (365 cells) | NEW | per-day minutes (the `dailyMinutes` map already exists in `derived-statistics.ts`) | H | finstats calendar; GitHub-style grid; also makes a good share card |
| Biggest week | NEW | per-day minutes | H | Letterboxd "most-watched week" |
| Year-over-year change (hours, titles, top genre) | NEW | the same all-history fetch already returns earlier years; or the previous `PlexWrapped` row | H | finstats 2.0, Apple Loyalty; "+38% vs 2025" |
| First and last watch of the year | NEW | min and max `started` | H | Letterboxd, Trakt |
| Member since and lifetime hours | NEW | earliest history row (already downloaded) | H | "Your 4th Rewind" |

### 3.2 Taste and genres

| Stat | Tag | Data source and fields | Feas. | Notes |
|---|---|---|---|---|
| Top genres (by minutes) | NEW (replaces LLM-inferred `insights.topGenre`) | Tautulli `get_metadata(rating_key).genres`. Use `grandparent_rating_key` for episodes. Or Plex `Genre` tags (python-plexapi `Movie.genres`) | M | Biggest gap compared with competitors. Cache per `rating_key` in the DB. Limit lookups to titles that cover about 95% of minutes |
| Genre timeline (dominant genre per month) | NEW | genres + monthly | M | Use plain genre names, not invented labels (the Spotify 2024 lesson) |
| Decades and "viewing age" | NEW | `get_history.year` / `originally_available_at` | H | Wrapperr "birth decade", Spotify Listening Age. Frame it playfully and show the median release year so the number does not feel arbitrary |
| Oldest title watched | NEW | `year` / `originally_available_at` | H | Wrapperr, finstats |
| Share of new releases ("premiere chaser") | NEW | `originally_available_at` (episode air date or movie release) vs `started`, e.g. watched within 14 days of release | H | Gives `premiere-chaser` a real scorer (it scores 0 today) |
| Studios (movies) and networks (shows) | NEW | `get_metadata.studio` | M | Trakt shows networks and studios |
| Countries and languages | NEW | Plex `Country` tags (python-plexapi `Movie.countries`); audio language from the media streams (unverified field path) | M/L | Letterboxd, Trakt country map |
| Taste vs. the crowd (average audience rating of what you watched) | NEW | `get_metadata.audience_rating` | M | Letterboxd "ratings vs everyone" |
| User's own ratings | NEW | `get_metadata.user_rating` | **L** | Tautulli queries Plex with the admin token, so `user_rating` is the **admin's** rating, not the viewer's (inferred; verify). Skip for per-user results |
| Hidden gem (a title few others on the server watched) | NEW | server-wide history, count distinct `user_id` per `rating_key` | M | Spotify Clubs "scout" vibe; show only if at least 1 other viewer exists, and never name them |
| Collections completed (e.g. "you finished the whole MCU on the server") | NEW | `get_metadata.collections` + library contents | L/M | Satisfying milestone; heavier |

### 3.3 People (directors, actors, writers)

| Stat | Tag | Data source and fields | Feas. | Notes |
|---|---|---|---|---|
| Top actors by minutes | NEW | `get_metadata.actors` (Plex `Role` tags) | M | Letterboxd, Trakt, finstats. For shows, weight by series-level cast |
| Top directors | NEW | `get_metadata.directors` (Plex `Director`) | M | Movies only |
| Top writers | NEW | `get_metadata.writers` | M | Lower appeal; good as a fun fact |
| Actor headshots | NEW | Plex `Role` thumb (python-plexapi `Role.thumb`). Tautulli's `get_metadata` docstring shows `actors` as a list of names only | M | Proxy through a route like `app/api/wrapped/poster/[ratingKey]` |

### 3.4 Habits: time of day, binges, streaks, completion

| Stat | Tag | Data source and fields | Feas. | Notes |
|---|---|---|---|---|
| Peak hour, hour histogram, day-of-week histogram, weekend share, most active day | EXISTING | `started` | H | **Fix the timezone first** (Section 1, item 6) |
| Longest streak | EXISTING | per-day | H | Also show the current streak going into December |
| Late-night share | EXISTING (archetype input only) | hour histogram | H | Surface it as its own stat ("31% after 10 PM") |
| Longest binge session | NEW (typed, never computed) | consecutive episodes of one `grandparent_rating_key` where the gap from `stopped` to the next `started` is under 30-45 min | H | finstats "biggest binge"; fill `longestBinge` |
| Most episodes in one day | NEW | per-day + episode rows | H | |
| Average session length and binge score | NEW | group rows into sessions with `started` / `stopped` | H | jellyfin-review |
| Completion rate ("credits roller") | NEW | `watched_status == 1` or `percent_complete >= 90` | H | Gives `credits-roller` a real scorer (scores 0 today) |
| Abandoned or "left for later" | NEW | movies with best `percent_complete < 50`; shows started but stalled | H/M | finstats 2.0. Phrase it kindly |
| Most paused title and total pause time | NEW | `paused_counter` (seconds paused, inferred from how `play_duration` is computed) | H | Wrapperr "most paused movie" |
| Most rewatched title | EXISTING (partly, via `playCount`) | count of watched rows per `rating_key` | H | finstats, Letterboxd rewatch split; feeds `comfort-rewatcher` |
| Holiday watching (Dec 25, Halloween, your birthday if known) | NEW | `started` | H | Light fun facts |
| Shows completed this year (series finished) | NEW | episodes watched vs episode count (`get_metadata` children counts, or Plex `leafCount`) | M/L | Plex `viewedLeafCount` reflects the token owner, so compute from history instead |

### 3.5 Devices and quality

| Stat | Tag | Data source and fields | Feas. | Notes |
|---|---|---|---|---|
| Top devices and apps | NEW | `get_history.platform`, `player`, `product` (year-scoped). `get_user_player_stats` exists but is all-time (`platform_name, player_name, total_plays, total_time`) | H | Steam "controller vs KB/M", "Deck share" |
| Direct play vs transcode | NEW | `transcode_decision` | H | "92% Direct Play: your setup is dialed in" |
| Home vs away | NEW | `location` (lan / wan) | H | Show as a percentage only. **Never use `ip_address` or `get_user_ips`** |
| 4K and HDR share | NEW | `get_metadata.media_info[].video_full_resolution`, `parts[].streams[].video_dynamic_range`; or `get_plays_by_source_resolution(time_range=days, user_id, y_axis=duration)` | M | Dolby Vision and Atmos fields were added in v2.14.2 and v2.18.0 |
| Peak concurrent streams on the server | NEW (server) | `get_home_stats` `stat_id=most_concurrent` + `after`/`before` | M | Community slide |

### 3.6 Social and server-wide comparisons

| Stat | Tag | Data source and fields | Feas. | Notes |
|---|---|---|---|---|
| Server percentile ("Top 5%") | EXISTING | overall leaderboard | H | Put it on the share card (Duolingo lesson) |
| Rank on overall watch time | EXISTING (fix) | `get_home_stats` `stat_id=top_users&stats_type=duration&after=YYYY-01-01&before=YYYY-12-31` (Tautulli 2.18.0 or later), else compute from server-wide history | M | Show only your own rank; never list other names on shared output |
| "You were #N of M watchers" for a title | EXISTING (broken: wrong fields, all-time) | compute from server-wide history for the year instead of `get_item_user_stats` | M | Spotify Fan Leaderboard; show only when M >= 3 |
| First on the server to watch X ("trendsetter") | NEW | earliest `started` per `rating_key` in server-wide history | M | Spotify Clubs "leader" and "scout" roles |
| Watch buddy (shares your top show) | NEW | server-wide history, user overlap on `grandparent_rating_key` | M | Wrapperr "show buddy". **Opt-in on both sides** |
| Watched together (simultaneous sessions) | NEW | overlapping `started`/`stopped` windows on the same `rating_key` for different users | M | finstats "Together". Opt-in on both sides |
| Server community recap | NEW | server-wide history; `get_home_stats` (`top_movies`, `popular_movies`, `top_tv`, `popular_tv`, `top_platforms`, `most_concurrent`) with `after`/`before`; Plex `addedAt` or Tautulli `get_recently_added`; Overseerr `/request/count` (`total, movie, tv, pending, approved, declined, processing, available`) | M | Plex 2025 Plex Rewind, Netflix What We Watched, Strava Trend Report. Aggregated, at least 3 contributors per stat, no names |
| Library growth this year | EXISTING (size only) -> NEW (added this year) | Plex `addedAt` per item / Tautulli `get_library_media_info` | M | "The server grew by 412 movies" |

### 3.7 Milestones

| Stat | Tag | Data source | Feas. | Notes |
|---|---|---|---|---|
| Lifetime milestone hit this year (100th movie, 1,000th episode, 1,000th hour) | NEW | all-history rows (already downloaded) | H | Duolingo and Strava style badges |
| Date you crossed N hours this year | NEW | cumulative minutes | H | "You passed 500 hours on Oct 3" |
| Personal records: biggest day, week, binge, streak | EXISTING (day, streak) + NEW (week, binge) | as above | H | Group them on one "records" slide |

### 3.8 Personality and archetypes

| Stat | Tag | Data source | Feas. | Notes |
|---|---|---|---|---|
| Archetype (12 curated, scored deterministically, copy written by the LLM) | EXISTING | `archetype-scoring.ts` | H | Keep code-first selection; it already follows the 2025 lesson |
| Real scorers for `credits-roller` and `premiere-chaser` | NEW | `percent_complete` / `watched_status`; `originally_available_at` | H | Both score 0 today |
| Archetype rarity on this server ("only 7% of viewers here") | NEW | distribution of stored archetypes across `PlexWrapped` rows for the year | H | YouTube rarity. Show only with at least 10 Rewinds on the server |
| Secondary trait or role (e.g. "Midnight Marathoner, the Scout") | NEW | second-best archetype, or a role from the social stats | H | Spotify Clubs + roles |
| Viewing age | NEW | decades | H | Playful; show the median release year beside it |
| Taste "aura" (generative visual seeded from the genre mix and time of day) | NEW | genres + hour histogram | M | Spotify Audio Aura (2021) precedent |

### 3.9 Requests (Overseerr / Seerr)

| Stat | Tag | Data source and fields | Feas. | Notes |
|---|---|---|---|---|
| Requests made, approved, declined, pending | EXISTING (fix the mapping) | `/request?requestedBy=<id>&filter=all&take&skip`; `status` 1 pending, 2 approved, 3 declined, 4 failed, 5 completed | H | Overseerr and Jellyseerr have merged into "Seerr" (first release Feb 2026, docs.seerr.dev); keep the client compatible. Seerr renumbers `media.status` above 5 (6 = BLOCKLISTED, 7 = DELETED) |
| Requests that became available | NEW | `media.status == 5` | H | |
| Requested and then actually watched | NEW | match `media.tmdbId` to Tautulli `get_metadata.guids` (`tmdb://...`) for history rows | M | Strong story: "You asked for 12, watched 9" |
| Top requested genres | EXISTING (broken) | `/movie/{tmdbId}` and `/tv/{tmdbId}` `genres` (MovieDetails schema) | M | Cache by tmdbId |
| Average wait from request to available | NEW | `createdAt` vs `media.mediaAddedAt`. That column exists on the `Media` entity in both the Overseerr and Seerr source but is not in the OpenAPI schema, so confirm it appears in live `/request` responses; fall back to `media.updatedAt` (approximate) | L/M | Admin-flattering stat; keep it optional |

### 3.10 Looking ahead

| Stat | Tag | Data source | Feas. | Notes |
|---|---|---|---|---|
| Unfinished shows to pick up in January | NEW | abandoned and partial detection (3.4) | H | finstats "left for later" |
| New seasons of your top shows coming in 2027 | NEW | Sonarr `/api/v3/calendar` (Sonarr is already integrated); TMDB via Overseerr `/tv/{id}` (`nextEpisodeToAir` in the TvDetails schema) | M | Gives the end of the story some momentum |
| "Three picks for 2027" from this server's library that you have not watched | NEW | genre and people affinity against library items with no history for this user; optionally the LLM picks from a code-built shortlist | M | Streamystats-style "because you watched X" explanations |
| 2027 challenge (e.g. "Watch 52 films") | NEW | none (user goal) | H | Goodreads Reading Challenge pattern; optional |

## 4. Narrative and format patterns

1. **Story slides with a clear arc (EXISTING; tighten it).**
   - Arc: hook number, then taste, then people, then habits, then records, then a social comparison, then the identity reveal, then the community, then looking ahead, then the finale and share.
   - Keep 10-16 slides. Spotify, YouTube (12 cards) and Duolingo all close on one bundled share card.
2. **Guess-first interactions (NEW).**
   - Spotify 2025's Top Song Quiz asks you to guess before the reveal.
   - Rewind version: "Which show did you watch most?" with four poster choices drawn from the top 4. A "How many hours do you think?" slider can come before the hero number.
   - Implement as a slide variant with a deterministic answer and no LLM involvement.
3. **Animated ranking over time (NEW).** A bar-chart race of the top 5 shows by month, like Spotify's Top Artist Sprint. The monthly data already exists.
4. **Identity reveal at the climax (EXISTING).**
   - Add rarity, a matching character or illustration, and a palette for each archetype (YouTube's 14 characters).
   - Show the evidence line already produced by `rankArchetypes`. Users accept a label they can see the reason for, and the Listening Age backlash came from labels that felt arbitrary.
5. **Friend and group mode (NEW, P2).**
   - Spotify's Wrapped Party works because it is live, opt-in and awards-based, not a table of numbers.
   - Rewind version: a "Watch Party" room that opted-in users join with a link. It computes group awards such as "Night owl of the group", "First to finish <show>", "Most episodes" and "Most eclectic". Only aggregates of the people present are shown.
6. **Server-wide community recap (NEW).**
   - A separate page and slide in the style of Plex's platform Rewind or Netflix's What We Watched.
   - Content: the server's year in hours, top titles, peak night, titles added, and requests fulfilled. Facts in the style of Steam's "14% of playtime went to this year's releases".
7. **Comparison with the average viewer (NEW).** "You watched 2.1x the server average" (Steam's comparison with the average Steam user; Duolingo's percentile).
8. **Honest data windows and timing (NEW).**
   - Steam counts through Dec 14, YouTube through late October, and Letterboxd waits until Jan 2.
   - Recommendation: open Rewind 2026 on about Dec 1 with "data through Nov 30" shown on the hero slide. Offer an automatic "final cut" regeneration on Jan 1-2.
   - Send a "your Rewind is ready" notification. Strava's subscribers complained when theirs never arrived.
9. **Eligibility and light-year variants (NEW).**
   - Every major product sets a minimum: Spotify 30 songs and 5 artists, YouTube Music 10 hours, Letterboxd 10 films, Goodreads 3 books.
   - Rewind version: under about 5 hours or 10 plays, generate a shorter "light year" Rewind instead of failing or padding the slides.
10. **AI narration and video (optional, P2).**
    - Spotify's 2024 NotebookLM podcast drew mixed to negative reactions.
    - YouTube Music 2025's "ask about your listening" cards and Spotify's AI Archive were accepted because they sit on top of real stats.
    - Lesson: keep AI as narrator or answerer, never the source of numbers, which is already the v2 architecture in `llm-output-schema.ts` and `assemble-wrapped.ts`. A text-to-speech voice-over of the finale, or "ask your Rewind" through the existing chat assistant, are optional extras.

## 5. Visual design trends for recaps (2025-2026)

| Trend | Concrete 2025-2026 example | How it maps to Rewind 2026 |
|---|---|---|
| Bold, layered, **textured** analog-meets-digital design | Spotify Wrapped 2025: Spotify's newsroom described a bold, dynamic "visual mixtape", layered with texture and mixing analog and digital aesthetics. The exact quote "bold, layered, textured, and full of life", the reimagined logo and Vucko's credit for the 2025 motion identity could not be confirmed (unverified; Vucko's confirmed Wrapped motion work is from 2021 and 2023) | The existing film grain, letterbox and spotlight already fit. Add paper and poster textures, layered cut-out posters, and print-style halftones |
| Rejecting the "generic AI" look | Spotify 2024's AI-looking visuals were criticized. 2026 trend roundups list "generic AI-default aesthetics" as out and hand-made imperfection, paper texture and CSS noise as in (trade blogs) | Use no AI-generated imagery for people or posters. Use real Plex artwork and hand-tuned motion |
| Kinetic typography and variable fonts | Most-cited 2026 trend (trade blogs); variable fonts make weight and width animation cheap on the web | Animate the hero numbers through the weight and width axes (the existing `gold-count-up.tsx`), with marquee titles. Load fonts with `next/font` (none is used today) |
| A character or mascot per personality | YouTube Recap 2025: 14 personalities, each with an animated character | One illustration, palette and motion motif per archetype (12 exist in `ARCHETYPES`) |
| Translucent "glass" surfaces | Apple's iOS 26 Liquid Glass (shipped Sep 15, 2025); Replay became a native view in iOS 26 | Use glass panels sparingly over poster backdrops for UI chrome (controls, share sheet), not for the data |
| Personal generative art | Spotify Audio Aura (2021) turned each user's mood into a gradient; Spotify 2023 drew the genre mix as a stacked "burger" (unverified) | Seeded generative backdrop (SVG or canvas) from the genre mix and hour histogram; the same seed produces the share-card version |
| Colors taken from content | Common recap practice | Extract a palette from the user's top poster (e.g. with `sharp` image stats on the server). Use it per slide, keeping gold as the brand accent |
| Data drawn as an object | Spotify Top Artist Sprint (rankings over time); Trakt country maps | Bar-chart race, calendar heatmap, a clock-face hour radial, a decade timeline |
| 3D | Used selectively across recaps | Keep 3D (e.g. React Three Fiber) off the critical path. Satori cannot render it, mid-range phones struggle, and every 3D slide needs a 2D share-card version |
| Motion accessibility | Product standard | Several cinematic components already call `useReducedMotion`. Make it universal, plus tap and keyboard control and manual pacing |

## 6. Share mechanics

| Mechanic | Best practice and evidence | Status in repo | Recommendation |
|---|---|---|---|
| Per-slide share cards | Spotify (share card on every data story), YouTube (share button on each card), Trakt (shareable snapshots), finstats (each chapter as 1080x1920, plus a ZIP) | One 1080x1920 summary card (`/api/wrapped/og-image?format=card`) and a copy-link button | Add `slide=<type>` to the OG route, generate a card for each slide type, and add "download all" |
| 9:16 story format and safe zones | 1080x1920. Meta publishes no official safe zone; community guidance is about 250 px clear at the top and 250-340 px at the bottom (unverified) | 1080x1920 exists | Keep text and stats inside about 1080x1340 in the center; put branding at the edges |
| Native share sheet with the image file | `navigator.share({ files })` after `navigator.canShare({ files })`. Needs a secure context, a user gesture and the `web-share` permissions policy. Files support (MDN browser-compat-data): Chrome 89+ on Windows and ChromeOS, all desktop platforms from 128; Chrome Android 76+; Edge 81+ on Windows, all platforms from 93; Safari 14+ (macOS and iOS); Samsung Internet 11+; not Firefox on desktop or Android (Firefox Android shares text and URLs only) | Not used | Make the image file the main share action on mobile; fall back to download and copy-link |
| OG link previews | `next/og` `ImageResponse`: flexbox only (no grid), ttf/otf/woff fonts, 500 KB bundle limit, 1200x630 default | Exists (1200x630) | Include the archetype, hero number and poster collage; strip other users' data (Section 7) |
| Brag stat on the card | Duolingo: adding the XP percentile to the card raised share rates | Card shows the archetype, hours and counts | Add "Top X% on <server>" when it is flattering (for example, top 25% or better) |
| Several formats and languages | Steam: several summary image formats and a language dropdown | n/a | Offer square (1080x1080) and story (1080x1920) versions; i18n later |
| Anonymous share | Reddit 2022: replace your username and avatar with a generic "Redditor" label | Name or email shown | Add a "hide my name" toggle on cards and the public page |
| Link control | Wrapperr: share links with expiration | Token created automatically at generation, no revoke or expiry | Make sharing opt-in, and let users rotate or revoke the token and set an optional expiry |
| Video export | Spotify-style animated stories; GitHub Unwrapped renders a personal video for each user with Remotion on AWS Lambda | None | P2. Either render in the browser (canvas frames to MP4 through WebCodecs with **Mediabunny**, MPL-2.0, from about 5 kB gzipped) or render on the server with **Remotion**. Remotion is free for individuals, non-profits and for-profit companies of up to 3 employees; larger companies need a Company License. Check how that applies to a redistributed self-hosted app |

## 7. Privacy pitfalls and how good products handle them

**Pitfalls seen in the field:**
- **Plex Discover Together (late 2023).** "Week in Review" emails showed friends' viewing, including adult content. Users said they never opted in; Plex said the email "was enabled by default and caught some of our users by surprise". Lesson: social exposure must be opt-in, and the default must be private. Plex also does not create activities for titles flagged as adult (unverified). After the backlash Plex said it would add the email setting to its Privacy Settings page (The Register, updated).
- **Spotify 2024's AI podcast was not offered in the EU**, reportedly over data-privacy concerns (single source).
- **Jellyfin Wrapped's README** warns that an API key set at build time ends up in the frontend bundle. Keep server keys on the server, as we already do.

**How good products handle it:**
- **finstats:** users see only their own recap. Admins can open individual recaps and see a server summary that neither ranks nor names individuals. Share cards never name other people.
- **plex-rewind:** an anonymization option. **Reddit:** a generic-label option for share cards. **Wrapperr:** share links are optional and can expire, and the admin pages can be disabled.
- **Spotify:** Private Session and "exclude from taste profile" for playlists and tracks. Excluded tracks drop out of the top lists but still count toward minutes (secondary source).
- **YouTube:** paused or auto-deleted history is excluded, and supervised and under-13 accounts are not eligible. **Goodreads:** books kept private on Kindle are excluded.
- **Spotify Wrapped Party:** friends must join the room themselves, so the comparison exists only between people who opted in.

**Our gaps, verified in code:**
1. `GET /api/wrapped/share/[token]` is public. It returns `data: JSON.parse(wrapped.data)`, which contains `statistics.leaderboards.topContent.*.leaderboard[]` and `statistics.leaderboards.watchTime.leaderboard[]` with other users' `username`, `friendlyName` and watch times. The response also sets `userName: wrapped.user.name || wrapped.user.email`, so the owner's email is published when no name is set.
2. `shareToken` is created automatically at generation (`actions/wrapped-generation.ts:136`), so every Rewind is shareable by default, with no revoke or expiry.
3. Admins can open any user's Rewind (`app/admin/users/[userId]/wrapped/page.tsx`). That is acceptable for an operator, but users should be told (Wrapperr is open about the same capability).

**Recommended privacy model for Rewind 2026:**
- **Private by default.** A user's Rewind is visible only to that user and to admins, and the UI discloses admin visibility.
- **Sharing is a deliberate act.** The user switches on "make shareable" (which creates the token) and can rotate or revoke it, with an optional expiry.
- **The share projection is built by an allow-list.** A `toShareSafe(wrapped)` function emits only the owner's own stats and narrative, never `leaderboards` and never an email. It is used by the share API, the share page and the OG route.
- **Social features need opt-in on both sides.** This covers buddy, watched-together, Watch Party and appearing by name in anyone else's Rewind. Add a per-user setting such as `rewindSocialOptIn` (default false) and a server-level admin toggle.
- **Aggregation thresholds.**
  - Server or community stats appear only with at least 3 contributors.
  - Archetype rarity appears only with at least 10 Rewinds on the server.
  - "#N of M watchers" appears only when M is at least 3, and other names are never shown.
- **Exclusions.**
  - A user-level "hide from my Rewind" list of titles, matching Spotify's exclude-from-taste-profile.
  - An admin-level filter by library or content rating (for example, adult or kids libraries) and by label, matching Plex's adult exclusion.
  - Managed or kids accounts are excluded by default, matching YouTube.
- **Data minimization.** Never read `ip_address`, `get_user_ips` or exact geography. `location` appears only as a lan/wan percentage.
- **Hashed share-visit tracking.** `WrappedShareVisit` already hashes IPs; keep that.

## 8. Recommendations for this repo

Ordered so that correctness and privacy land before the new stats and visuals. Target: feature-complete by about Dec 1, 2026, about 6 weeks from today.

### P0: correctness and privacy (week 1-2)

1. **Validate Tautulli history at the boundary.**
   - In `lib/validations/tautulli.ts`, replace the hand-written `TautulliHistoryItem` with a Zod schema covering the verified fields: `date, started, stopped, play_duration, duration (alias), paused_counter, percent_complete, watched_status, media_type, rating_key, parent_rating_key, grandparent_rating_key, title, grandparent_title, full_title, year, originally_available_at, guid, platform, product, player, transcode_decision, location, live, group_count, user_id`.
   - Drop `viewed_duration`. Parse with `safeParse` and log rows that are skipped.
2. **Make the history fetch year-aware in `lib/wrapped/tautulli-user-statistics.ts`.**
   - Key aggregates by `rating_key` (episodes by `grandparent_rating_key`), not by title.
   - Pass `grouping=1` explicitly, so that resumed plays count once.
   - Keep the all-history fetch, which already returns earlier years for year-over-year comparison and milestones, or switch to `after=YYYY-01-01&before=YYYY-12-31` (supported since v2.8.0). Keep the in-code filter as a guard either way.
   - Fix the comments that call `duration` "total media length".
3. **Fix the leaderboards in `lib/wrapped/tautulli-leaderboards.ts`.**
   - Read `total_time` and `total_plays`.
   - Better: compute per-title yearly leaderboards from one cached server-wide `get_history` for the year, because `get_item_user_stats` is all-time.
   - For the overall board, call `get_home_stats` with `stat_id=top_users&stats_type=duration&after&before` on Tautulli 2.18.0 or later, falling back to `time_range`. Add a test fixture that uses the real field names.
4. **Fix the Overseerr mapping in `lib/wrapped/overseerr-statistics.ts`.**
   - Use `/request?requestedBy=<id>&filter=all` with pagination, and paginate `/user` (`take`/`skip`).
   - Map request `status` 1 to pending, 2 and 5 (COMPLETED) to approved, 3 to declined and 4 to failed, and read availability from `media.status === 5` (4 = partially available). Do not treat `media.status` values above 5 as one fixed meaning, because Seerr inserted BLOCKLISTED at 6.
   - Fetch genres from `/movie/{tmdbId}` or `/tv/{tmdbId}`, cached.
   - Remove the "no email, so include it" fallback, and replace the `any` types with Zod schemas, as CLAUDE.md requires.
5. **Add a timezone.**
   - Add `Config.timezone` (IANA name; default `process.env.TZ ?? "UTC"`, settable in admin).
   - Bucket hours and days in `lib/wrapped/derived-statistics.ts` with `Intl.DateTimeFormat(..., { timeZone, hour: "numeric", hourCycle: "h23" })`. Document `TZ` in `example.env` and `docker-compose.yml`.
6. **Close the share privacy gap.**
   - Add `lib/wrapped/share-safe.ts` (`toShareSafe`). Use it in `app/api/wrapped/share/[token]/route.ts`, `app/(app)/wrapped/share/[token]/page.tsx` and `app/api/wrapped/og-image/route.tsx`.
   - Stop falling back to email for the display name.
   - Stop creating tokens automatically in `actions/wrapped-generation.ts`. Add Server Actions `enableRewindSharing`, `rotateRewindShareToken` and `disableRewindSharing`, with an optional `shareExpiresAt` on `PlexWrapped`.
7. **Operator safety.** Warn on the setup or health check when Tautulli is older than v2.17.0 (the `get_home_stats` SQL injection fix).

### P1: new stats engine (week 2-4)

8. **Bump the data version.** Set `WRAPPED_DATA_VERSION = 3` in `assemble-wrapped.ts`, and add new optional fields to `types/wrapped.ts` so v2 data still renders. Add pure, tested modules (each about 150 lines or less, per CLAUDE.md):
   - `lib/wrapped/stats/sessions.ts`: session grouping, longest binge (fills `longestBinge`), most episodes in a day, average session length, completion rate, abandoned titles, most-paused title.
   - `lib/wrapped/stats/time.ts`: calendar heatmap array, biggest week, first and last watch, Live TV hours, year-over-year deltas, lifetime milestones.
   - `lib/wrapped/stats/taste.ts`: genres, genre timeline, decades and viewing age, oldest title, new-release share, studios and networks, top actors, directors and writers.
   - `lib/wrapped/stats/devices.ts`: platforms, players, transcode share, lan/wan share; optional 4K and HDR from metadata.
   - `lib/wrapped/stats/requests.ts`: request outcomes and "requested and then watched" (tmdbId to `get_metadata.guids`).
   - `lib/wrapped/stats/community.ts`: server aggregates with an `minContributors = 3` guard.
   - `lib/wrapped/stats/social.ts`: buddy, watched-together and first-to-watch, run only for opted-in pairs.
9. **Add a metadata cache.** Create `lib/wrapped/metadata-cache.ts` plus a Prisma model (e.g. `MediaMetadataCache { ratingKey @id, genres Json, directors Json, actors Json, studio, year, originallyAvailableAt, guids Json, fetchedAt }`).
   - Fill it from Tautulli `get_metadata` with a concurrency limit, or from Plex `/library/metadata/{id}`, before the December rush. A BullMQ job already exists under `lib/queue/jobs/`.
   - Pre-warm it when an admin opens the Rewind season, in the style of Wrapperr's pre-caching.
10. **Update archetypes in `lib/wrapped/archetype-scoring.ts`.**
    - Implement the `credits-roller` scorer (completion rate) and the `premiere-chaser` scorer (new-release share).
    - Add rarity by counting archetypes across the year's `PlexWrapped` rows, shown only with at least 10 Rewinds.
    - Pass the evidence line through to the reveal slide.
11. **Update the LLM prompt (`lib/wrapped/prompt-template.ts`).** Pass the computed `topGenre`, people and records, and remove "your best inference of their most-watched genre". The LLM should narrate numbers, never estimate them.
12. **Gate eligibility.** Set the light-year threshold in code (for example, under 5 hours or 10 plays) with a shorter slide list in `assemble-wrapped.ts`. Show "data through <date>" on the hero slide. Add an automatic final-cut regeneration job on Jan 1-2 and a "Rewind ready" notification (the Discord integration or email if configured).

### P1: formats and visuals (week 3-6)

13. **Add slide types.** Add the following to `WrappedSectionType`, to `SLIDE_DURATIONS` in `components/wrapped/cinematic/theme.ts`, and as components under `components/wrapped/wrapped-sections/cinematic/`:
    - `taste-profile` (genres and decades)
    - `people` (actors and directors with headshots)
    - `binge-records`
    - `devices-quality`
    - `year-over-year`
    - `calendar-heatmap`
    - `quiz-top-show` (guess first)
    - `ranking-race` (monthly top-5 race)
    - `community` (server, aggregate only)
    - `looking-ahead`

    Load the dataviz skill before building the charts.
14. **Per-slide sharing.**
    - Extend `app/api/wrapped/og-image/route.tsx` with `slide=<type>&size=story|square`, keeping inside the safe zone and the 500 KB ImageResponse budget.
    - Upgrade `components/wrapped/share-card-download.tsx` to share files with the Web Share API (`canShare({ files })`) and fall back to download. Add "download all" as a ZIP and an "anonymous card" toggle.
15. **Visual refresh within the cinematic identity.**
    - Variable display font through `next/font`, used for kinetic numbers.
    - Per-user palette from the top poster: server-side `sharp` stats inside the existing poster proxy `app/api/wrapped/poster/[ratingKey]/route.ts`.
    - Per-archetype palette and illustration set.
    - Seeded generative "aura" (SVG) reused on the finale and the share card.
    - Universal `useReducedMotion`, and tap and keyboard pacing.
16. **Server community page.** Add a new `app/(app)/rewind/server/page.tsx` (Server Component) that renders `community` stats for signed-in members only. The admin view uses the same no-names rule as finstats.
17. **Naming.** Plex now publishes an official platform-wide "Plex Rewind" (Dec 2025). Brand ours as "<server name> Rewind 2026" through `Config.platformName` (currently defaulting to "Plex Wrapped") rather than "Plex Rewind", to avoid implying an official Plex product and to avoid a clash with the open-source RaunoT/plex-rewind project, which also uses that name.

### P2: after the core ships (or 2027)

18. **Watch Party.** Opt-in group room with dynamic awards, computed only over the people present (Spotify Wrapped Party pattern).
19. **Video export.** Client-side MP4 with Mediabunny (WebCodecs) from the slide canvases, or server-side Remotion after a license review.
20. **"Ask your Rewind".** Route questions to the existing chat assistant with the computed statistics as context (YouTube Music 2025 pattern). An optional text-to-speech voice-over of the finale.
21. **Looking-ahead integrations.** Sonarr calendar for returning shows; "three picks for 2027" from an unwatched shortlist built in code.

## 9. Open questions and unverified items

- Confirm against a live Tautulli (v2.18.x) that `get_item_user_stats` returns `total_time` and `total_plays` and that our current leaderboards show zeros. Source code says it does; we have no live check.
- Confirm that `get_home_stats` `before`/`after` work on the versions our operators run. They were fixed in v2.18.0; decide on a fallback for older versions.
- Tautulli's `get_metadata.actors` is a list of names in the docstring, so headshots will most likely need Plex `/library/metadata/{id}` (`Role` thumb). Confirm on a live server.
- `paused_counter` semantics (seconds paused) is inferred, not read from documentation.
- Spotify Clubs names and roles differ between outlets. YouTube personality rarity figures differ between outlets. The 2025 contents of Reddit Recap and Duolingo Year in Review are mostly unconfirmed.
- Remotion license terms when the app is redistributed as a self-hosted product.
- Whether `media.mediaAddedAt` (present on the `Media` entity in Overseerr and Seerr source, absent from the OpenAPI schema) is returned in live `/request` responses.

## Sources

**APIs and platform documentation (primary)**
- Tautulli API reference (canonical; unreachable from this environment, verified through source): https://docs.tautulli.com/extending-tautulli/api-reference
- Tautulli `plexpy/webserve.py` (API docstrings: `get_history`, `get_home_stats`, `get_metadata`, `get_item_user_stats`, `get_plays_by_*`, `get_user_player_stats`, `get_user_ips`): https://raw.githubusercontent.com/Tautulli/Tautulli/master/plexpy/webserve.py (master, fetched 2026-10-17)
- Tautulli `plexpy/datafactory.py` (history row fields, `duration` alias, `percent_complete`/`watched_status` logic): https://raw.githubusercontent.com/Tautulli/Tautulli/master/plexpy/datafactory.py
- Tautulli CHANGELOG (v2.12.3 2023-04-14 rename; v2.14.2 home-stats before/after; v2.17.0 2026-03-27 SQL injection fix; v2.18.0 2026-08-25; v2.18.2 2026-09-28): https://raw.githubusercontent.com/Tautulli/Tautulli/master/CHANGELOG.md
- Overseerr OpenAPI spec (`/request`, `/user/{id}/requests`, `/request/count`, MediaRequest and MediaInfo schemas): https://raw.githubusercontent.com/sct/overseerr/develop/overseerr-api.yml
- Overseerr API docs: https://api-docs.overseerr.dev
- python-plexapi `server.py` (`/status/sessions/history/all` params): https://raw.githubusercontent.com/pkkid/python-plexapi/master/plexapi/server.py
- python-plexapi `video.py` (Genre, Director, Role, Writer, Country tags; `originallyAvailableAt`, `audienceRating`): https://raw.githubusercontent.com/pkkid/python-plexapi/master/plexapi/video.py
- Plex developer docs (canonical; unreachable from this environment): https://developer.plex.tv
- Plex forum: API play history: https://forums.plex.tv/t/api-users-play-history/796964.md
- MDN `navigator.share()`: https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/navigator/share/index.md
- MDN browser-compat-data `Navigator.json` (canShare and files support): https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Navigator.json
- Next.js `ImageResponse` docs: https://raw.githubusercontent.com/vercel/next.js/canary/docs/01-app/03-api-reference/04-functions/image-response.mdx
- Remotion license: https://raw.githubusercontent.com/remotion-dev/remotion/main/LICENSE.md
- Mediabunny README: https://raw.githubusercontent.com/Vanilagy/mediabunny/main/README.md
- GitHub Unwrapped README: https://raw.githubusercontent.com/remotion-dev/github-unwrapped/main/README.md

**Spotify Wrapped**
- Spotify Newsroom, 2025 Wrapped user experience (2025-12-03): https://newsroom.spotify.com/2025-12-03/2025-wrapped-user-experience/
- Spotify Newsroom, Wrapped Clubs overview (2025-12-03): https://newsroom.spotify.com/2025-12-03/wrapped-clubs-overview/
- Spotify Newsroom, 2025 Wrapped: https://newsroom.spotify.com/?p=37765 and https://newsroom.spotify.com/?p=37865
- Spotify Newsroom, Wrapped Party: https://newsroom.spotify.com/?p=37757
- Spotify Newsroom, Top Artist Sprint tag: https://newsroom.spotify.com/tag/top-artist-sprint/
- Spotify Newsroom, Fan Leaderboard tag: https://newsroom.spotify.com/tag/fan-leaderboard/
- Spotify for Artists, 2025 Wrapped: https://artists.spotify.com/blog/2025-wrapped-is-here
- Spotify Newsroom, Decade of Wrapped: https://newsroom.spotify.com/?p=32167
- Spotify Newsroom, Sound Town tag: https://newsroom.spotify.com/tag/sound-town
- TechCrunch, "Spotify's 2025 Wrapped becomes a multiplayer experience" (2025-12-03): https://techcrunch.com/2025/12/03/spotifys-2025-wrapped-becomes-a-multiplayer-experience/
- Axios, Wrapped 2025 features (2025-12-03): https://www.axios.com/2025/12/03/spotify-wrapped-2025-new-features
- Tom's Guide, Wrapped 2025: https://www.tomsguide.com/entertainment/music-streaming/spotify-wrapped-2025-has-landed-now-with-more-stats-more-fun-and-additional-social-features
- TechRadar, Wrapped 2025 features: https://www.techradar.com/audio/spotify/spotify-wrapped-2025-has-landed-heres-how-to-find-it-plus-the-best-new-features-this-year
- TechRadar, Listening Age: https://www.techradar.com/audio/spotify/surprised-by-spotify-wrapped-2025s-new-listening-age-feature-youre-not-alone-heres-how-yours-compares
- Fast Company, Listening Age and 200M users: https://www.fastcompany.com/91454685/spotify-wrapped-2025-eagerly-checking-your-listening-age-everyone-else-is-too
- NPR via WGCU, Listening Age (2025-12-04): https://www.wgcu.org/2025-12-04/how-old-is-your-music-taste-spotify-will-tell-you-though-you-may-not-like-it
- RouteNote, Wrapped 2025 record launch: https://routenote.com/blog/spotify-wrapped-2025-record-breaking-launch/
- RouteNote, Wrapped 2025: https://routenote.com/blog/spotify-wrapped-2025-is-here/
- Her Campus, Clubs and roles: https://www.hercampus.com/culture/spotify-wrapped-clubs-feature-2025/
- The Tab, Clubs: https://thetab.com/2025/12/03/spotify-wrapped-2025-explaining-the-club-and-role-feature-you-get-assigned-this-year
- WERSM, Wrapped Party: https://wersm.com/spotify-wrapped-2025-adds-its-first-multiplayer-feature-with-wrapped-party/
- 9to5Mac, Wrapped Party: https://9to5mac.com/2025/12/03/spotify-wrapped-arrives-after-apple-music-replay-with-a-new-party-feature/
- Spotify design Substack, "Designing 2025 Wrapped": https://spotifynews.substack.com/p/designing-2025-wrapped-turning-a
- Vucko, Wrapped 2025 motion identity: https://vucko.co/work/spotify-wrapped-2025
- Salon, Wrapped 2024 complaints (2024-12-04): https://salon.com/2024/12/04/why-spotify-users-are-complaining-that-spotify-wrapped-is-sucky-this-year
- Tom's Guide, Wrapped 2024 controversy: https://tomsguide.com/audio/spotify-wrapped-2024-controversy-explained-what-you-need-to-know
- DesignRush, Wrapped 2024 AI results: https://news.designrush.com/spotify-wrapped-2024-disappoints-fans-with-ai-generated-results
- TechRadar, exclude songs from taste profile: https://www.techradar.com/audio/spotify/spotify-finally-lets-you-remove-individual-songs-from-your-algorithm-and-now-i-can-stop-myself-getting-side-tracked-by-my-guilty-pleasure-listens
- Spotify Community, Private Sessions and Wrapped: https://community.spotify.com/t5/Content-Questions/Private-Sessions-to-be-excluded-from-Spotify-Wrapped/m-p/5352381

**Apple, YouTube, Letterboxd, Plex, Trakt, Netflix**
- SoundGuys, Apple Music Replay 2025: https://www.soundguys.com/apple-music-replay-2025-149823/
- RouteNote, Apple Music Replay 2025: https://routenote.com/blog/apple-music-replay-2025/
- BGR, Replay in iOS 26: https://bgr.com/tech/apple-music-replay-looks-stunning-in-ios-26/
- Gulf News, iOS 26 Liquid Glass release: https://gulfnews.com/technology/liquid-glass-apple-rolls-out-ios-26-how-to-download-1.500271292
- Google Support, Find and share your YouTube Recap: https://support.google.com/youtube/answer/16723638
- PPC Land, YouTube Recap launch: https://ppc.land/youtube-launches-personalized-recap-feature-for-north-american-users/
- Android Authority, YouTube Recap personality rarity: https://www.androidauthority.com/how-rare-youtube-recap-personality-3623345
- Storyboard18, YouTube Recap: https://www.storyboard18.com/digital/youtube-launches-personalised-recap-experience-for-users-in-india-85268.htm
- Digital Music News, YouTube Recap (2025-12-02): https://www.digitalmusicnews.com/2025/12/02/youtube-recap-debuts-spotify-wrapped-style-stats/
- Dexerto, YouTube Music Recap 2025: https://www.dexerto.com/youtube/how-to-get-your-2025-youtube-music-recap-3289280
- Letterboxd, 2025 Year in Review FAQ: https://letterboxd.com/journal/2025-letterboxd-year-in-review-faq/
- Letterboxd, 2025 Year in Review: https://letterboxd.com/journal/2025-year-in-review/
- Letterboxd, Welcome (Pro stats): https://letterboxd.com/welcome/
- Red94, Letterboxd Wrapped 2025 timing: https://www.red94.net/news/27673-letterboxd-wrapped-2025-drops-today-here-s-how-to-see-your-personalized-film-sta/
- Plex Blog, 2025 Plex Rewind (2025-12-18): https://www.plex.tv/blog/2025-plex-rewind/
- Plex Blog, 2022 Year in Review: https://www.plex.tv/blog/2022-year-in-review/
- Plex Blog, 2021 Year in Review: https://www.plex.tv/blog/year-in-review/
- Plex Support, Profile and watch history: https://support.plex.tv/articles/profile/
- Trakt Forums, Year in Review (VIP): https://forums.trakt.tv/t/year-in-review/19085
- Trakt Forums, 2025 Year in Review is here: https://forums.trakt.tv/t/your-trakt-year-in-review-is-here/92275
- Trakt on X, 2025 recap: https://x.com/trakt/status/2001765709517377840
- Trakt Roadmap changelog: https://roadmap.trakt.tv/changelog
- Netflix, What We Watched H2 2025: https://about.netflix.com/en/news/what-we-watched-the-second-half-of-2025
- Kapwing, unofficial Netflix Wrapped: https://www.kapwing.com/netflix-wrapped

**Steam, Reddit, Strava, Duolingo, Goodreads**
- PCWorld, Steam Replay 2025: https://www.pcworld.com/article/3015881/steam-replay-2025-is-here-see-your-year-on-steam-stats-and-all.html
- GamingOnLinux, Steam Replay 2025 (14% new releases): https://gamingonlinux.com/2025/12/steam-replay-is-live-and-notes-only-14-of-playtime-spent-by-all-steam-users-was-for-2025-releases
- Fdaytalk, Steam Replay sharing: https://www.fdaytalk.com/steam-replay-2025-where-to-find-and-how-to-share-it/
- TechCrunch, Reddit Recap 2022: https://techcrunch.com/2022/12/08/reddits-end-of-year-recap-experience-rolls-out-with-personalized-shareable-cards/
- Campaign Live, Reddit Recap personality badges: https://www.campaignlive.com/article/reddit-expands-its-end-of-year-recap-campaign-new-mediums/1807565
- road.cc, Strava Year in Sport subscribers only: https://road.cc/content/news/strava-year-sport-now-only-subscribers-317425
- Ars Technica via Harvard TagTeam, Strava paywall (2025-12-19): https://tagteam.harvard.edu/hub_feeds/3415/feed_items/17132945/content
- PR Newswire via Adnkronos, Strava 12th Year in Sport Trend Report (2025-12-03): https://www.adnkronos.com/immediapress/eng/strava-releases-12th-annual-year-in-sport-trend-report-revealing-that-doomscrolling-is-out-movement-is-in_iPmltuOBI6UULjUCMcmDr
- Android Authority, Duolingo Year in Review 2025: https://www.androidauthority.com/duolingo-year-in-review-2025-3621782
- Duolingo Blog, Year in Review behind the scenes (percentile on the share card): https://blog.duolingo.com/year-in-review-behind-the-scenes
- Goodreads Blog, Get Ready for Year in Books 2025: https://www.goodreads.com/blog/show/3064

**Self-hosted and open source**
- Wrapperr: https://github.com/aunefyren/wrapperr (README https://raw.githubusercontent.com/aunefyren/wrapperr/main/README.md; customization struct https://raw.githubusercontent.com/aunefyren/wrapperr/main/models/models.go)
- plex-rewind: https://github.com/RaunoT/plex-rewind (README https://raw.githubusercontent.com/RaunoT/plex-rewind/main/README.md)
- finstats: https://github.com/finstats/finstats
- Jellyfin Wrapped: https://github.com/johnpc/jellyfin-wrapped (README https://raw.githubusercontent.com/johnpc/jellyfin-wrapped/main/README.md)
- jellyfin-review (Jellyfin Wrapped 2025): https://github.com/lotrez/jellyfin-review
- Streamystats: https://github.com/fredrikburmester/streamystats (releases https://github.com/fredrikburmester/streamystats/releases)
- Jellyfin forum, Jellyfin Wrapped 2024 announcement: https://forum.jellyfin.org/t-happy-new-year-introducing-jellyfin-wrapped-your-2024-year-in-review
- JellyWatch, Jellystat guide (2026; competitor source): https://jellywatch.app/blog/jellystat-tautulli-alternative-jellyfin-statistics-setup-2026
- selfh.st, 2025 Wrapped: self-hosted year-in-review tools: https://selfh.st/post/wrapped-year-in-review/
- Seerr merge discussion: https://piefed.jeena.net/post/327497/comment/5281225

**Privacy incidents**
- The Register, Plex sharing streaming habits (2023-11-28): https://www.theregister.com/2023/11/28/plex_privacy/
- TechHive, Plex Discover Together privacy concerns: https://www.techhive.com/article/2157803/plex-discover-together-privacy-concerns.html
- Plex Forum, "Do not share my watch history": https://forums.plex.tv/t/do-not-share-my-watch-history/861012
- Plex Forum, Weekly review emails data leak: https://forums.plex.tv/t/weekly-review-emails-data-leak/860206/17

**Design trends (trade blogs; signals, not measurements)**
- Fireart, Web Design Trends 2026: https://fireart.studio/blog/the-best-web-design-trends/
- Krumzi, 12 Graphic Design Trends 2026: https://www.krumzi.com/blog/12-graphic-design-trends-shaping-2026-and-how-ai-is-changing-the-game
- Made Good Designs, Graphic Design Trends 2026: https://madegooddesigns.com/graphic-design-trends-2026/
- Wannathis, Typography trends 2026: https://wannathis.one/blog/top-typography-trends-2026-for-designers
- Envato, Spotify Wrapped design aesthetic 2025: https://elements.envato.com/learn/spotify-wrapped-design-aesthetic
- Design Compass, Spotify Wrapped 2022 (Listening Personality): https://designcompass.org/en/2022/12/02/spotify-wrapped-2022
- Inro, Instagram Story size guide 2026 (safe zones, community guidance): https://www.inro.social/blog/instagram-story-size

**Added during fact-check (2026-10-17)**
- Overseerr `server/constants/media.ts` (`MediaRequestStatus` 1-5, `MediaStatus` 1-6): https://raw.githubusercontent.com/sct/overseerr/develop/server/constants/media.ts
- Seerr `server/constants/media.ts` (`MediaStatus` adds BLOCKLISTED = 6, DELETED = 7): https://raw.githubusercontent.com/seerr-team/seerr/develop/server/constants/media.ts
- Overseerr `server/entity/Media.ts` (`mediaAddedAt` column): https://raw.githubusercontent.com/sct/overseerr/develop/server/entity/Media.ts
- Seerr `server/entity/Media.ts` (`mediaAddedAt` column): https://raw.githubusercontent.com/seerr-team/seerr/develop/server/entity/Media.ts
- Seerr release announcement (Feb 2026): https://docs.seerr.dev/blog/seerr-release
- Streamystats v2.18.0 release (2026-03-15, "Wrapped design for yearly stats"): https://github.com/fredrikburmester/streamystats/releases/tag/v2.18.0
- Streamystats README (recommendation explanations): https://raw.githubusercontent.com/fredrikburmester/streamystats/main/README.md
- finstats README: https://raw.githubusercontent.com/finstats/finstats/main/README.md
- Jellystat README: https://raw.githubusercontent.com/CyferShepard/Jellystat/main/README.md
- jellyfin-review `package.json` (framer-motion dependency): https://raw.githubusercontent.com/lotrez/jellyfin-review/main/package.json
- TechCrunch, Wrapped 2025 biggest yet with 200M users in its first day (2025-12-04): https://techcrunch.com/2025/12/04/spotify-says-wrapped-2025-is-its-biggest-yet-with-200m-users-in-its-first-day
- Music Business Worldwide, Wrapped 200M engaged users in 24 hours, +19% YoY: https://www.musicbusinessworldwide.com/spotify-wrapped-campaign-hit-200m-engaged-users-in-24-hours-a-19-yoy-increase
- Spotify Newsroom, Listening Archive tag: https://newsroom.spotify.com/tag/listening-archive/
- TechCrunch, YouTube releases its first-ever Recap (2025-12-02): https://techcrunch.com/2025/12/02/youtube-releases-its-first-ever-recap-of-videos-youve-watched
- NetInfluencer, YouTube Recap launch and criticism: https://www.netinfluencer.com/youtube-launches-recap-feature-to-showcase-user-annual-viewing-habits/
- Google Support, YouTube Music Recap (10 hours of listening for the end-of-year Recap): https://support.google.com/youtubemusic/answer/11418178
- 9to5Mac, iOS 26 makes Apple Music Replay fully native (2025-06-12): https://9to5mac.com/2025/06/12/ios-26-makes-apple-music-replay-fully-native-inside-the-app/
- Trakt Forums, Year in Review 2025 feedback (2025-12-18): https://forums.trakt.tv/t/year-in-review-2025-feedback/92282
- Trakt Forums, Product Roundup December 2025: https://forums.trakt.tv/t/trakt-product-roundup-december-2025/94358
- Hollywood Reporter, Netflix H1 2026 data release and move to annual reports (July 2026): https://www.hollywoodreporter.com/business/business-news/his-and-hers-netflix-data-release-january-june-2026-1236650481/
- Steam on X, Steam Replay 2025 is now available (2025-12-16): https://x.com/Steam/status/2001013695598747896
- GameSpot, Steam Replay 2025 is now live (data window and exclusions): https://www.gamespot.com/articles/steam-replay-2025-is-now-live-letting-players-look-back-at-their-gaming-year/1100-6537030/
- PC Gamer, Plex says Discover Together emails are opt-in: https://www.pcgamer.com/plex-says-controversial-service-that-emails-your-anime-habits-to-your-mates-is-opt-in-actually-pointing-at-a-screen-where-you-still-have-to-turn-it-off/

## Fact-check notes (2026-10-17)

Checked by an independent fact-checker against primary sources where reachable: Tautulli `webserve.py`, `datafactory.py` and `CHANGELOG.md`; Overseerr `overseerr-api.yml`, `server/constants/media.ts` and `server/entity/Media.ts` (and the Seerr equivalents); python-plexapi `video.py` and `media.py`; MDN browser-compat-data `Navigator.json`; the Next.js `ImageResponse` docs; the Remotion `LICENSE.md`; the Mediabunny README and LICENSE; the GitHub Unwrapped, Wrapperr (`README.md`, `models/models.go`), plex-rewind, finstats, Jellyfin Wrapped, jellyfin-review, Streamystats and Jellystat READMEs; and the repo files the report cites. Vendor and press sites that were unreachable from this environment (spotify.com, plex.tv, netflix.com, theregister.com, trakt.tv, duolingo.com, support.google.com) were checked through search results. No Anthropic or Claude facts appear in this report, so the `claude-api` skill was not needed.

**Confirmed without change (selection):** every Tautulli version and date cited (v2.8.0 history `before`/`after`; v2.12.3 2023-04-14 `play_duration` rename; v2.14.2 2024-05-18 home-stats `before`/`after` and Dolby Vision; v2.17.0 2026-03-27 `get_home_stats` SQL injection fix; v2.18.0 2026-08-25 `before`/`after` fix and Dolby Atmos; v2.18.2 2026-09-28 as the latest); the `get_item_user_stats`, `get_home_stats`, `get_history`, `get_metadata`, `get_user_player_stats` and `get_plays_by_source_resolution` parameter and field names; Overseerr `requestedBy`, `filter=all`, `take`/`skip`, `/request/count` fields and MediaInfo status 5 = AVAILABLE; Next.js `ImageResponse` limits (flexbox only, ttf/otf/woff, 500 KB, 1200x630 default); Remotion free tier (individuals, non-profits, for-profits with up to 3 employees); Mediabunny MPL-2.0 and "as small as 5 kB gzipped"; Spotify Wrapped 2025 (Dec 3; Wrapped Party up to 9 invited friends; 6 Clubs with roles; Top Albums new; Top Artist Sprint; 200M users in 24 hours, +19%; 500M+ day-one shares; 30 songs and 5 artists minimum); Apple Music Replay 2025 (Dec 2; Discovery, Loyalty, Comebacks; native in iOS 26); YouTube Recap (Dec 2, 2025; up to 12 cards; 14 personalities; eligibility rules; YouTube Music's 10-hour minimum); Letterboxd (Jan 2, 2026; 10 films); 2025 Plex Rewind (Dec 18, 2025); Steam Replay 2025 (Dec 16, data through Dec 14; 14% of playtime on 2025 releases); Strava (paywall at about $80/yr, Dec 2025; Trend Report Dec 3, 2025); Goodreads (3 books; private Kindle books excluded); Duolingo (top 10% of XP earners produced more than half of shares in 2020; the percentile on the 2021 card raised share rates); Reddit Recap 2022 ("Redditor" label option; Rare, Epic and Legendary tiers); the Seerr merger; Streamystats v2.18.0 (2026-03-15) and its recommendation explanations; and all repo file paths, line references (`prompt-template.ts:245`, `wrapped-generation.ts:136`), identifiers (`WRAPPED_DATA_VERSION = 2`, `SLIDE_DURATIONS`, `platformName` default "Plex Wrapped", hashed `WrappedShareVisit` IPs, no `next/font`, `node:25.8-alpine` with no `TZ`).

**Corrections made:**
1. **Overseerr request status (Section 1 item 5, Section 3.9, TL;DR, Recommendation 4).** The OpenAPI description lists only 1-3, but the server enum also has 4 = FAILED and 5 = COMPLETED. Seerr also inserts `media.status` 6 = BLOCKLISTED, which moves DELETED to 7. **Recommendation 4 was updated**: count 2 and 5 as approved and 4 as failed, and do not hard-code `media.status` values above 5.
2. **`mediaAddedAt` (Section 3.9, Section 9).** It is not in the OpenAPI schema but does exist on the `Media` entity in both Overseerr and Seerr. The stat now uses it, with `updatedAt` as the fallback.
3. **TV next-air field (Section 3.10).** `nextEpisodeToAir` is in the Overseerr TvDetails schema; it is no longer marked unverified.
4. **Plex official recaps (Section 2.1).** The 2021 and 2022 "Year in Review" posts are company-wide retrospectives, not personal recaps that required Plex Pass. The Plex Pass label seen in search summaries looks like a site-wide badge (unverified).
5. **Trakt 2025 (Section 2.1).** Launched Dec 18, 2025, not "late Dec". Genre and country-map stats were missing at launch and the feedback thread was critical, so reception is now "Mixed". Review pages are viewable for any username.
6. **Netflix (Section 2.1).** The twice-yearly report ends after H1 2026; Netflix moves to one annual report from 2027. The H2 2025 figure (about 96B hours) is now marked unverified because sources differ.
7. **Spotify "Archive" (Section 2.1).** The feature is the "Listening Archive": up to 5 AI-written reports on memorable listening days, English only, select markets.
8. **YouTube Recap reception (Section 2.1).** Changed from "Positive" to "Mostly positive", noting criticism of inaccurate data and the missing total watch time.
9. **Spotify 2025 design credit (Section 5).** The quote "bold, layered, textured, and full of life" and Vucko's credit for 2025 could not be confirmed. The row now uses Spotify's verified wording and marks the rest unverified.
10. **Web Share file support (TL;DR, Section 6).** Restated precisely from MDN: desktop Chrome 89+ was Windows and ChromeOS only until 128, and Edge 81+ was Windows only until 93. Firefox Android supports `navigator.share` but not files.
11. **Recommendation 17 (naming).** Removed the claim that CLAUDE.md has guidance against imitating real organizations; it has none. The recommendation itself stands, now justified by the official Plex Rewind and by the open-source RaunoT/plex-rewind project, which also uses that name.
12. **Self-hosted tools (Section 2.2).** finstats administrators can open anyone's recap (the README says so). Jellyfin Wrapped's in-browser processing is an inference. Jellystat's playback-method and codec claims come from a third-party blog (unverified), and its README says development is paused for a rebuild.
13. **Tautulli security note (Section 1 item 9).** Added CVE-2026-31799 and the changelog's statement that versions up to and including 2.16.1 are affected.
14. **Actor headshots (Section 3.3, Section 9).** The Tautulli `get_metadata` docstring shows `actors` as names only, so headshots need Plex `Role.thumb`.

**Newly marked (unverified):** Strava subscribers missing the "ready" notification; Duolingo learner-style years; Spotify 2023 "burger" genre visual; Plex excluding adult titles from activities; the exact Netflix H2 2025 hours figure; the Plex Pass label on Plex's Year in Review posts.
