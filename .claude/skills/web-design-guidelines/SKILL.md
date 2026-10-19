---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
metadata:
  author: vercel
  version: "1.0.0"
  argument-hint: <file-or-pattern>
paths:
  - "app/**"
  - "components/**"
---

<!-- Modified by plex-manager: reads the local `guidelines/command.md` instead of fetching it from `main`, and added the `paths:` frontmatter. Upstream source and SHA: .claude/skills/THIRD_PARTY.md. -->

# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines.

## How It Works

1. Read the guidelines in [guidelines/command.md](guidelines/command.md), next to this file
2. Read the specified files (or prompt user for files/pattern)
3. Check against all rules in the guidelines
4. Output findings in the terse `file:line` format

## Guidelines Source

The rules and output format live in the local copy at `guidelines/command.md`,
vendored from `vercel-labs/web-interface-guidelines` at a pinned commit. Do not
fetch the guidelines from the network; update the local copy through
`.claude/skills/THIRD_PARTY.md` instead.

## Usage

When a user provides a file or pattern argument:
1. Read `guidelines/command.md`
2. Read the specified files
3. Apply all rules from the guidelines
4. Output findings using the format specified in the guidelines

If no files specified, ask the user which files to review.
