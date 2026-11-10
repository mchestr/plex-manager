/**
 * The delete failure words (TS 8.9, 11.3, 11.4) that the audit summary,
 * Leaving soon and History share.
 */

import { failureWords } from "@/lib/cleanup/failure-words"

it("words each kind of failure code, and never shows an unknown code raw", () => {
  expect(failureWords("sourceFailed:plex", "sonarr")).toBe("Plex did not answer")
  expect(failureWords("sourceFailed:nas", "sonarr")).toBe("The delete failed")
  expect(failureWords("noSeasonNumber", "sonarr")).toBe("The season has no number")
  expect(failureWords("noArrSeason", "sonarr")).toBe("Sonarr has no such season")
  expect(failureWords("outsideArrPath", "radarr")).toBe("The file is outside Radarr's root folders")
  expect(failureWords("TIMEOUT", "radarr")).toBe("Radarr did not respond in time")
  expect(failureWords("SOMETHING_NEW", "radarr")).toBe("The delete failed")
})

it("names the HTTP status when the caller has it", () => {
  expect(failureWords("HTTP", "radarr", 500)).toBe("Radarr returned HTTP 500")
  expect(failureWords("HTTP", "sonarr")).toBe("Sonarr returned HTTP error")
})
