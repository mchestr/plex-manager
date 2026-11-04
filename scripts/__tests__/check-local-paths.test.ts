/**
 * @jest-environment node
 */

/**
 * The local path check (scripts/check-local-paths.mjs): a checkout path, an
 * agent scratch or worktree folder or a session link fails; the Windows and
 * Unix paths the arr-path tests use as fixtures do not.
 */

import { findLeaks } from "../local-paths/rules.mjs";

describe("findLeaks", () => {
  it.each([
    [
      "/home/jane/src/plex-manager/lib/env.ts",
      "absolute path to a plex-manager checkout",
    ],
    [
      "see /Users/jane/plex-manager",
      "absolute path to a plex-manager checkout",
    ],
    [
      "C:\\Users\\Jane\\code\\plex-manager\\README.md",
      "Windows path to a plex-manager checkout",
    ],
    ["wrote /tmp/claude-0/notes.md", "Claude Code scratch folder"],
    ["open .claude/worktrees/feature-x/app", "agent worktree folder"],
    ["/private/var/folders/xy/T/out.json", "macOS temporary folder"],
    ["see /root/.ccr/README.md", "cloud session proxy folder"],
    ["https://claude.ai/code/session_011abc", "Claude Code session link"],
  ])("flags %s", (text, label) => {
    expect(findLeaks(text)).toEqual([{ line: 1, label }]);
  });

  it.each([
    "C:\\Users\\J. R. Smith\\Downloads\\complete\\Show.S01",
    "/home/jane/Downloads",
    "/Users/sean/Downloads/Radarr.app",
    "http://jellyfin.local:8096/Users/jf-1/Policy",
    "/.claude/worktrees/",
    "lib/env.ts",
  ])("passes %s", (text) => {
    expect(findLeaks(text)).toEqual([]);
  });

  it("reports the line of each leak", () => {
    expect(findLeaks("ok\n/tmp/claude-1/x\nok")).toEqual([
      { line: 2, label: "Claude Code scratch folder" },
    ]);
  });
});
