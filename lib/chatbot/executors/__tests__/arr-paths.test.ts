/**
 * Paths in Sonarr and Radarr messages cut to their last part for the shared
 * Discord channel. A path used to be cut only up to its first space, so the
 * rest of a Windows profile, a share or a mount with a space in its name
 * reached Discord; and only where English puts one, so a translated message
 * showed its paths, and an update check its account.
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
    [
      "a Windows profile with an apostrophe",
      "Import failed, path does not exist or is not accessible by Sonarr: C:\\Users\\Sean O'Brien\\Downloads\\Show.S01E01. Ensure the path exists",
      "Import failed, path does not exist or is not accessible by Sonarr: …/Show.S01E01. Ensure the path exists",
    ],
    ["a share with an apostrophe", "Import failed: /Volumes/Jane's Media/movies/Heat.1995", "Import failed: …/Heat.1995"],
    ["a home with an apostrophe", "Couldn't read /home/o'brien/tv/Show.S01", "Couldn't read …/Show.S01"],
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

describe("withoutPaths in the server's UI language", () => {
  // Sonarr v4 and Radarr v5 send messages in the server's UI language, which puts a path right after other characters
  it.each([
    [
      "a drive after ב- (Hebrew)",
      "לקוח ההורדות המרוחק SABnzbd ממקם הורדות ב-C:\\Users\\Sean O'Brien\\Downloads\\complete אך נראה שתיקייה זו אינה קיימת.",
      "לקוח ההורדות המרוחק SABnzbd ממקם הורדות ב-…/complete אך נראה שתיקייה זו אינה קיימת.",
    ],
    [
      "a Unix path after ב- (Hebrew)",
      "לקוח ההורדות המרוחק SABnzbd ממקם הורדות ב-/home/jane doe/Downloads/complete אך נראה שתיקייה זו אינה קיימת.",
      "לקוח ההורדות המרוחק SABnzbd ממקם הורדות ב-…/complete אך נראה שתיקייה זו אינה קיימת.",
    ],
    ["a path after the fullwidth colon (Japanese)", "ルートフォルダがありません：/mnt/user/Jane Doe/Movies", "ルートフォルダがありません：…/Movies"],
    ["a path after the fullwidth colon (Chinese)", "缺少根目錄資料夾：\\\\JANE-NAS\\Media Share\\Movies", "缺少根目錄資料夾：…/Movies"],
    [
      "a path in typographic quotes (Chinese)",
      "无法安装更新，因为启动文件夹 “C:\\Users\\Sean O'Brien\\AppData\\Local\\Radarr” 位于 App Translocation 文件夹中。",
      "无法安装更新，因为启动文件夹 “…/Radarr” 位于 App Translocation 文件夹中。",
    ],
    [
      "a drive right after a Han character",
      "远程下载客户端SABnzbd将文件下载在C:\\Users\\Sean O'Brien\\Downloads中，但此目录似乎不存在。",
      "远程下载客户端SABnzbd将文件下载在…/Downloads中，但此目录似乎不存在。",
    ],
    ["a Unix path right after a Han character", "远程下载客户端SABnzbd将文件下载在/home/jane/Downloads中，但此目录似乎不存在。", "远程下载客户端SABnzbd将文件下载在…/Downloads中，但此目录似乎不存在。"],
    ["a share right after a Han character", "远程下载客户端SABnzbd将文件下载在\\\\JANE-NAS\\Media Share\\tv中", "远程下载客户端SABnzbd将文件下载在…/tv中"],
    ["a path after a colon that follows a Han character", "无法写入配置的回收站文件夹:/home/jane doe/.Trash。确保此路径存在", "无法写入配置的回收站文件夹:…/.Trash。确保此路径存在"],
    [
      "a path in „“ (Bulgarian)",
      "Не може да се инсталира актуализация, защото стартовата папка „C:\\Users\\Sean O'Brien\\AppData\\Local\\Radarr“ е в папка за преместване на приложения.",
      "Не може да се инсталира актуализация, защото стартовата папка „…/Radarr“ е в папка за преместване на приложения.",
    ],
    [
      "a path in „“ (Czech)",
      "Aktualizaci nelze nainstalovat, protože spouštěcí složka „/home/jane doe/Radarr“ je ve složce Translocation aplikace.",
      "Aktualizaci nelze nainstalovat, protože spouštěcí složka „…/Radarr“ je ve složce Translocation aplikace.",
    ],
    ["a path in „” (Hungarian)", "A(z) „/Volumes/Jane Doe/Movies/Heat (1995)” filmmappa és annak minden tartalma törlődik.", "A(z) „…/Heat (1995)” filmmappa és annak minden tartalma törlődik."],
    [
      "a path in „” (Polish)",
      "Nie można zainstalować aktualizacji, ponieważ folder startowy „\\\\JANE-NAS\\Apps\\Radarr” znajduje się w folderze translokacji aplikacji.",
      "Nie można zainstalować aktualizacji, ponieważ folder startowy „…/Radarr” znajduje się w folderze translokacji aplikacji.",
    ],
    ["a path in »« (Danish)", "Filmmappen »/home/jane doe/Movies/Heat (1995)« og alt dens indhold slettes.", "Filmmappen »…/Heat (1995)« og alt dens indhold slettes."],
    ["a path in corner brackets", "ルートフォルダ「/mnt/user/Jane Doe/Movies」がありません", "ルートフォルダ「…/Movies」がありません"],
    ["a path in backticks", "The series folder `/home/jane doe/tv/Show (2020)` and all of its content will be deleted.", "The series folder `…/Show (2020)` and all of its content will be deleted."],
    // A typographic closing quote ends a name, so the last part before it stays
    ["a folder in „“ that ends in a separator", "Der Ordner „/home/jane doe/tv/“ fehlt", "Der Ordner „…/tv/“ fehlt"],
    ["a folder in corner brackets that ends in a separator", "フォルダ「/mnt/user/Jane Doe/Movies/」がありません", "フォルダ「…/Movies/」がありません"],
    // A Korean particle after a closing quote is not part of the name
    ["two quoted paths with Korean particles", "'/data/jane/Show'을 '/backup/jane/Show'로 이동할 수 없습니다", "'…/Show'을 '…/Show'로 이동할 수 없습니다"],
  ])("cuts %s to its last part", (_case, message, cut) => {
    expect(withoutPaths(message)).toBe(cut)
  })

  it("leaves words joined by a slash as they are", () => {
    for (const text of [
      // A "-" opens a path only after a Hebrew letter
      "Zeige Symbol für Serien-/Staffelfinale basierend auf verfügbaren Folgeninformationen",
      // After CJK, a root needs a first name that starts in ASCII and ends at a separator
      "端口、SSL、用户名/密码、代理、分析、更新",
      "列表将每 {refreshInterval} （秒/分/时/天）刷新一次",
      "导入集文件后导入匹配的额外文件(字幕/nfo等)",
      "インポート/再スキャン時にファイルの日付を変更する",
      "하드 링크/파일 복사",
      // A root that no name follows is not a path
      "Appending `+` (eg `:EN+`) will output `[EN]`/`[EN+--]`/`[--]` depending on excluded languages.",
      "Map the drive root `C:\\`, or `/`, in the remote path mapping",
    ]) {
      expect(withoutPaths(text)).toBe(text)
    }
  })
})

describe("withoutPaths with apostrophes in names", () => {
  it.each([
    ["an accented letter before an apostrophe", "Import failed: /Volumes/Zoë's Media/Downloads/complete/Show.S01E01", "Import failed: …/Show.S01E01"],
    [
      "an accented letter after an apostrophe",
      "Cannot install update because startup folder 'C:\\Users\\Ana D'Ávila\\AppData\\Local\\Sonarr' is not writable",
      "Cannot install update because startup folder '…/Sonarr' is not writable",
    ],
    ["a letter with a combining mark before an apostrophe", "Import failed: /Volumes/Zoe\u0308's Media/Downloads/Show.S01E01", "Import failed: …/Show.S01E01"],
    ["an apostrophe that ends a name", "Import failed: /Volumes/James' Drive/Downloads/incomplete/Show.S01E01", "Import failed: …/Show.S01E01"],
    ["an apostrophe that starts a name", "Missing root folder: /mnt/'90s Movies/HD", "Missing root folder: …/HD"],
    ["an apostrophe that starts the last part", "Missing root folder: /mnt/'90s Movies", "Missing root folder: …/'90s Movies"],
    ["apostrophes beside '_' in one name", "Import failed: /data/Rock_'n'_Roll/Downloads/Show.S01", "Import failed: …/Show.S01"],
    ["a quoted word in a name", "Import failed: C:\\Users\\Robert 'Bob' Smith\\Downloads\\Show.S01", "Import failed: …/Show.S01"],
    ["a quoted word at a name's start", "Missing root folder: /Volumes/'Our' Media/Movies", "Missing root folder: …/Movies"],
    [
      "a closing quote after the path",
      "Cannot install update because startup folder 'C:\\Users\\Sean O'Brien\\AppData\\Local\\Sonarr' is not writable by the user 'Sean'.",
      "Cannot install update because startup folder '…/Sonarr' is not writable by the user 'Sean'.",
    ],
  ])("cuts a path with %s to its last part", (_case, message, cut) => {
    expect(withoutPaths(message)).toBe(cut)
  })

  it("loses the text after a path up to a separator after a contraction, never showing a directory", () => {
    // An apostrophe between letters stays in a name (the module's special cases)
    expect(withoutPaths("Unpacking failed, write error in /data/usenet/Show.S01E01 (it's on a read-only mount; check the user/group)")).toBe(
      "Unpacking failed, write error in …/group)"
    )
  })
})

describe("withoutPaths on 100,000 characters", () => {
  const LENGTH = 100_000
  const long = (unit: string, prefix = "") => (prefix + unit.repeat(Math.ceil(LENGTH / unit.length))).slice(0, LENGTH)

  it.each([
    ["one name after a root", long("a", "Import failed: /")],
    ["paths back to back", long("Moving /a b/c.mkv to /d e/f.mkv failed. ")],
    ["paths in typographic quotes", long("„/home/jane doe/tv“ ")],
    ["roots after corner brackets", long("「/a")],
    ["slashes after Han characters", long("在/")],
    ["roots after Han characters with ASCII names", long("在/a")],
    ["an ASCII name after a Han character with no separator", long("a", "下载在/")],
    ["roots after a Hebrew hyphen", long("ב-/a ")],
    ["drives back to back", long("C:\\")],
    ["backticks around slashes", long("`/`")],
    ["apostrophes between letters", long("a'", "Import failed: /x/")],
    ["apostrophes far from a separator", long(`'${"a".repeat(999)}`, "Import failed: /x/")],
    ["a sentence stop before a long word", long("c", "Import failed: /x/b. ")],
    // Each apostrophe fits one rule only: with two, a failed cut retried them both ways, 2^k times
    ["contractions before separators after a path", long("it's/ ", "Unpacking failed in /data/usenet/Show.S01E01 ")],
    ["quoted words before separators after a path", long("'a' b/ ", "Unpacking failed in /data/usenet/Show.S01E01 ")],
    ["apostrophes between letters before separators", long("O'B/ ", "Import failed: /x/")],
  ])("cuts %s in well under 100 ms", (_case, message) => {
    const start = performance.now()
    withoutPaths(message)
    expect(performance.now() - start).toBeLessThan(100)
  })

  it("cuts a known path in well under 100 ms", () => {
    const known = "C:\\Users\\Jane Doe\\Downloads\\Show.S01"
    const start = performance.now()
    withoutPaths(long(`${known} `), known)
    expect(performance.now() - start).toBeLessThan(100)
  })

  it("reads a known path that ends in a long run of separators in well under 100 ms", () => {
    // /[\\/]+$/ retried from every separator of the run: quadratic
    const start = performance.now()
    withoutPaths("Import failed", `${"/".repeat(LENGTH)}\u0000/`)
    expect(performance.now() - start).toBeLessThan(100)
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

  it("gives an update check error fixed English by its wiki anchor, since it names the account in the server's language", () => {
    const sonarr = "https://wiki.servarr.com/sonarr/system#"
    const radarr = "https://wiki.servarr.com/radarr/system#"
    const checks = [
      {
        id: 1,
        source: "UpdateCheck",
        type: "error",
        message: 'Update kann nicht installiert werden, da der Startordner "C:\\Users\\Sean O\'Brien\\AppData\\Local\\Sonarr" für den Benutzer "Sean O\'Brien" nicht beschreibbar ist.',
        wikiUrl: `${sonarr}cannot-install-update-because-startup-folder-is-not-writable-by-the-user`,
      },
      {
        id: 2,
        source: "UpdateCheck",
        type: "error",
        // Finnish does not quote the account
        message: 'Päivityksen asennus ei onnistu, koska käyttäjällä Sean O\'Brien ei ole kirjoitusoikeutta käyttöliittymäkansioon "C:\\Users\\Sean O\'Brien\\AppData\\Local\\Radarr\\UI".',
        wikiUrl: `${radarr}cannot-install-update-because-ui-folder-is-not-writable-by-the-user`,
      },
      {
        id: 3,
        source: "UpdateCheck",
        type: "error",
        message: "无法安装更新，因为启动文件夹 “/Users/sean/Downloads/Radarr.app/Contents/MacOS” 位于 App Translocation 文件夹中。",
        wikiUrl: `${radarr}cannot-install-update-because-startup-folder-is-in-an-app-translocation-folder.`,
      },
    ]

    expect(healthWithoutPaths(checks)).toEqual([
      { ...checks[0], message: "Cannot install updates: the startup folder is not writable by the account the app runs as." },
      { ...checks[1], message: "Cannot install updates: the UI folder is not writable by the account the app runs as." },
      { ...checks[2], message: "Cannot install updates: the startup folder is in a macOS App Translocation folder." },
    ])
  })

  it("gives an update check error with an unknown anchor, or none, a generic message", () => {
    const message = "Update kann nicht installiert werden, da der Startordner '/home/sean/Sonarr' vom Benutzer 'Sean O'Brien' nicht beschreibbar ist."
    const checks = [
      { source: "UpdateCheck", type: "error", message, wikiUrl: "https://wiki.servarr.com/sonarr/system#a-check-from-a-later-version" },
      { source: "UpdateCheck", type: "error", message, wikiUrl: "https://wiki.servarr.com/sonarr/system#constructor" },
      { source: "UpdateCheck", type: "error", message },
    ]

    for (const check of healthWithoutPaths(checks) as { message: string }[]) {
      expect(check.message).toBe("Cannot install updates; the wiki page for this check says why.")
    }
  })

  it("keeps an update check's warning, a new version, as Sonarr sent it", () => {
    const check = { source: "UpdateCheck", type: "warning", message: "Neue Version verfügbar: v4.0.15.2941", wikiUrl: "https://wiki.servarr.com/sonarr/system#new-update-is-available" }

    expect(healthWithoutPaths([check])).toEqual([check])
  })

  it("gives none for anything but a list", () => {
    expect(healthWithoutPaths({ message: "Missing root folder: /home/jane doe/tv" })).toEqual([])
  })

  it("reads checks of 100,000 characters in well under 100 ms", () => {
    const message = `Missing root folder: ${"„/home/jane doe/tv“ ".repeat(5_000)}`
    const start = performance.now()
    healthWithoutPaths([{ source: "RootFolderCheck", type: "error", message }, { source: "UpdateCheck", type: "error", message }])
    expect(performance.now() - start).toBeLessThan(100)
  })
})
