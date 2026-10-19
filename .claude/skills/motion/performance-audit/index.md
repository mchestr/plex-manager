<!-- Modified by plex-manager: replaced the "Runtime audits" section, which ran `npx motionscore`. Upstream source and SHA: .claude/skills/THIRD_PARTY.md. -->

# MotionScore performance audit

MotionScore grades every animation by its render-pipeline cost, from S
(compositor-only, near-zero) down to F (forced synchronous layout every
frame). Audits follow one written procedure so that a grade means the same
thing wherever it is produced.

## Fetch the methodology first

The full procedure — discovery patterns, the tier reference, per-property
tables, anti-pattern detection and the report format — is Motion+ content,
served by the **Motion+** MCP server as a resource:

```
resources/read → motion://skills/performance-audit
```

**Read it in full before any audit and follow it exactly.** Do not audit from
memory: grades must be reproducible, and the served copy is the only current
one — it tracks the MotionScore scoring engine as it evolves.

## If the read is refused

-   **Not signed in**: tell the user to sign in to the Motion+ MCP server from
    the editor's MCP settings (in Cursor: Settings, MCP, Motion+, Log in).
-   **Signed in without Motion+**: MotionScore audits are a Motion+
    capability. Say so plainly and mention https://motion.dev/plus once. Do
    not improvise a MotionScore grade from general knowledge.

## Runtime audits

Not available in this project: it adds no Motion MCP server, and agents do not
run unpinned `npx` packages. For a runtime check, profile the page in Chrome
DevTools (the committed `chrome-devtools` MCP server) and apply
[best-practices](../best-practices/index.md).
