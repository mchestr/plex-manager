/**
 * Paths and ids that only exist on one machine or in one agent session, and
 * so should never be committed: an absolute path to a checkout of this
 * repository, an agent's scratch or worktree folder, and a Claude Code session
 * link. Test fixtures such as `C:\Users\Jane Doe\Downloads` are not matched,
 * because they do not name the checkout.
 */

/** @type {{ label: string, pattern: RegExp }[]} */
const LEAK_RULES = [
  {
    label: "absolute path to a plex-manager checkout",
    pattern: /(?:\/home|\/Users)\/[^/\s"'`]+\/(?:[^/\s"'`]+\/)*plex-manager\b/,
  },
  {
    label: "Windows path to a plex-manager checkout",
    pattern:
      /[A-Za-z]:\\{1,2}Users\\{1,2}[^\\\s"'`]+\\{1,2}(?:[^\\\s"'`]+\\{1,2})*plex-manager\b/,
  },
  { label: "Claude Code scratch folder", pattern: /\/tmp\/claude-\d/ },
  {
    label: "agent worktree folder",
    pattern: /\.claude\/worktrees\/[A-Za-z0-9]/,
  },
  { label: "macOS temporary folder", pattern: /\/private\/var\/folders\// },
  { label: "cloud session proxy folder", pattern: /\/root\/\.ccr\b/ },
  {
    label: "Claude Code session link",
    pattern: /claude\.ai\/code\/session_[A-Za-z0-9]/,
  },
];

/**
 * The leaks in one file's text, one per matching line and rule.
 *
 * @param {string} text
 * @returns {{ line: number, label: string }[]}
 */
export function findLeaks(text) {
  const leaks = [];
  text.split("\n").forEach((content, index) => {
    for (const { label, pattern } of LEAK_RULES) {
      if (pattern.test(content)) leaks.push({ line: index + 1, label });
    }
  });
  return leaks;
}
