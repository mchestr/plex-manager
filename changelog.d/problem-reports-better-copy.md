### Added

- **Problem reports, a better copy:** a member who reports a blurry or low-quality movie or episode gets a better copy when Radarr's or Sonarr's quality profile wants one: the search runs with the file in place, and the old copy keeps playing until the new one imports. A file the profile already counts as good enough gets "This is the best copy the server keeps", and the member can still send it to the server admin. A play their Plex app converted gets the playback tip first. A search that finds nothing closes the report as "No better copy right now", with **Ask the server admin** on Your reports.
- **Problem reports, one-tap fixes:** the server admin can run Look for a better copy from a report about a movie or an episode. It counts against the daily search cap.

### Changed

- **Discord `/report`:** the confirm now says what sending does, as on the web: **Look for them**, **Look for a better copy**, or **Send to the server admin**.
