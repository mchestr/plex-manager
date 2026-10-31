/**
 * Paths in Sonarr and Radarr messages cut to their last part for the shared
 * Discord channel. A path used to be cut only up to its first space, so the
 * rest of a Windows profile, a share or a mount with a space in its name
 * reached Discord.
 */

import { healthWithoutPaths, withoutPaths } from "../arr-paths"

describe("withoutPaths", () => {
  it.each([
    [
      "a Windows profile with a space",
      "Import failed, path does not exist or is not accessible by Sonarr: C:\\Users\\John Smith\\Downloads\\complete\\Show.S01E01. Ensure the path exists",
      "Import failed, path does not exist or is not accessible by Sonarr: …/Show.S01E01. Ensure the path exists",
    ],
    [
      "a Windows profile with an initial",
      "Remote download client SABnzbd places downloads in C:\\Users\\J. Smith\\Downloads\\complete but this directory does not appear to exist.",
      "Remote download client SABnzbd places downloads in …/complete but this directory does not appear to exist.",
    ],
    ["a Windows profile with a comma", "Placed in C:\\Users\\Smith, John\\Downloads\\Show.S01, see the wiki", "Placed in …/Show.S01, see the wiki"],
    ["an Unraid share with a space", "No files found are eligible for import in /mnt/user/Media Downloads/complete/tv/Show.S01", "No files found are eligible for import in …/Show.S01"],
    ["a Unix home with a space", "Import failed: /home/jane doe/downloads/Heat.1995", "Import failed: …/Heat.1995"],
    ["a UNC share with a space", "Couldn't read \\\\NAS\\Media Share\\tv\\Show.S01", "Couldn't read …/Show.S01"],
    ["a UNC share written with forward slashes", "Couldn't read //nas/Media Share/tv/Show.S01", "Couldn't read …/Show.S01"],
    ["a path in brackets", "[C:\\Downloads\\Complete\\Show.S02] is not a valid local path. You may need a Remote Path Mapping.", "[…/Show.S02] is not a valid local path. You may need a Remote Path Mapping."],
    ["a path in quotes", "Error: [Errno 2] No such file or directory: '/downloads/incomplete/Show.S01'", "Error: [Errno 2] No such file or directory: '…/Show.S01'"],
    [
      "a path before a comma and a link",
      "Couldn't read \\\\nas\\media\\tv\\Show (US)\\Season 1, see https://wiki.servarr.com/sonarr/faq and/or retry",
      "Couldn't read …/Season 1, see https://wiki.servarr.com/sonarr/faq and/or retry",
    ],
    ["two paths in one message", "Moving /a b/c.mkv to /d e/f.mkv failed", "Moving …/c.mkv to …/f.mkv failed"],
    ["folders that end in a separator", "Missing root folders: /data/media/tv/, /data/media/anime/", "Missing root folders: …/tv/, …/anime/"],
    ["a path at the end", "Missing root folder: /data/media/tv", "Missing root folder: …/tv"],
  ])("cuts %s to its last part", (_case, message, cut) => {
    expect(withoutPaths(message)).toBe(cut)
  })

  it("leaves text that names no absolute path", () => {
    for (const text of ["Speed 5 MB / s, 1/2 done and/or more", "See https://wiki.servarr.com/sonarr/faq#why-are-downloads-stuck", "a /, b", "Not an upgrade for existing episode file(s)"]) {
      expect(withoutPaths(text)).toBe(text)
    }
  })

  it("cuts the known path whole, where its shape alone reads the text after it as more of the path", () => {
    const message =
      "Import failed, path does not exist or is not accessible by Sonarr: /downloads/Show Name S01 1080p Ensure the path exists and the user running Sonarr has the correct permissions to access this file/folder"

    expect(withoutPaths(message, "/downloads/Show Name S01 1080p")).toBe(
      "Import failed, path does not exist or is not accessible by Sonarr: …/Show Name S01 1080p Ensure the path exists and the user running Sonarr has the correct permissions to access this file/folder"
    )
    // Without it, text is lost, never a folder shown
    expect(withoutPaths(message)).toBe("Import failed, path does not exist or is not accessible by Sonarr: …/folder")
  })

  it("cuts the known path whatever its names hold, with a trailing separator or not", () => {
    const known = "C:\\Users\\J. R. Smith\\Downloads\\Show. Part 2\\"

    expect(withoutPaths("No files found are eligible for import in C:\\Users\\J. R. Smith\\Downloads\\Show. Part 2", known)).toBe(
      "No files found are eligible for import in …/Show. Part 2"
    )
    expect(withoutPaths("Couldn't import C:\\Users\\J. R. Smith\\Downloads\\Show. Part 2\\Show.S01E01.mkv", known)).toBe("Couldn't import …/Show. Part 2\\Show.S01E01.mkv")
    // By shape alone, ". R. Smith" reads as a sentence (the module's special cases)
    expect(withoutPaths("Couldn't read C:\\Users\\J. R. Smith\\Downloads")).toBe("Couldn't read …/J. R. Smith\\Downloads")
  })

  it("takes no root, and no relative path, as the known path", () => {
    expect(withoutPaths("Speed 5 MB / s", "/")).toBe("Speed 5 MB / s")
    expect(withoutPaths("Show.S01 in Show.S01", "Show.S01")).toBe("Show.S01 in Show.S01")
    expect(withoutPaths("Read C:\\Downloads\\x", "C:\\")).toBe("Read …/x")
  })
})

describe("healthWithoutPaths", () => {
  it("cuts the paths in each check's message and keeps the rest", () => {
    const checks = [
      { source: "RootFolderCheck", type: "error", message: "Missing root folder: /mnt/user/TV Shows/", wikiUrl: "https://wiki.servarr.com/sonarr/system#missing-root-folder" },
      { source: "IndexerStatusCheck", type: "warning", message: "Indexers unavailable due to failures: NZBgeek" },
      "not a check",
    ]

    expect(healthWithoutPaths(checks)).toEqual([
      { source: "RootFolderCheck", type: "error", message: "Missing root folder: …/TV Shows/", wikiUrl: "https://wiki.servarr.com/sonarr/system#missing-root-folder" },
      { source: "IndexerStatusCheck", type: "warning", message: "Indexers unavailable due to failures: NZBgeek" },
      "not a check",
    ])
  })

  it("gives none for anything but a list", () => {
    expect(healthWithoutPaths({ message: "Missing root folder: /home/jane doe/tv" })).toEqual([])
  })
})
