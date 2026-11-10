### Added

- **Problem reports, Fix the Plex match:** when Plex matched a movie or show to another title than the one Radarr or Sonarr has for its file, the server admin can match it to the right title from the report. The fix searches Plex's agent by TMDB id, then by title and year, leaves Plex alone when another item already has that match (matching would merge the two), and matches back to what Plex had when the right ids don't show within a minute.
- **Problem reports, wrong details:** a member's report of a wrong title, poster or description on a movie Radarr has, or a show or episode Sonarr has, no longer waits for the server admin. It checks Plex's match against Radarr or Sonarr, then asks Plex to read the details again and messages the member. A match that differs, or an episode order Plex and Sonarr don't share, goes to the server admin.
- **Problem reports, Plex changes:** matches and refreshes share a cap of 20 an hour across every fix and trigger.
