### Added

- **Test-only plex.tv mock:** `E2E_PLEX_TV_URL` and `E2E_PLEX_TV_PORT` let the Playwright suite read the library share list from a local plex.tv mock, so member specs can pass the library check without plex.tv. The app uses the mock only while `E2E_TEST_MODE` is `true` and only at a loopback `http://` address. A deployment sets neither, and reads plex.tv as before.
