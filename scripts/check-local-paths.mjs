#!/usr/bin/env node
/**
 * Fails when a tracked file (or, with --staged, a staged file) holds a local
 * absolute path, an agent scratch or worktree folder, or a Claude Code session
 * link. The rules live in `scripts/local-paths/rules.mjs`. CI's Lint job runs
 * it over the tree; `.githooks/pre-commit` runs it on staged files
 * (`npm run hooks:install` turns the hook on).
 *
 *   node scripts/check-local-paths.mjs [--staged]
 */

import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";

import { findLeaks } from "./local-paths/rules.mjs";

const staged = process.argv.includes("--staged");
// This checker and its rules name the patterns they look for.
const SKIP = new Set([
  "scripts/check-local-paths.mjs",
  "scripts/local-paths/rules.mjs",
  "scripts/__tests__/check-local-paths.test.ts",
]);

const git = (args) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

const files = (
  staged
    ? git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"])
    : git(["ls-files", "-z"])
)
  .split("\0")
  .filter((file) => file && !SKIP.has(file));

let failed = 0;
for (const file of files) {
  let text;
  if (staged) {
    text = git(["show", `:${file}`]);
  } else {
    let stat;
    try {
      stat = lstatSync(file);
    } catch (error) {
      if (error.code === "ENOENT") continue; // deleted but not yet staged
      throw error;
    }
    // A symlink's target is checked as its own file (CLAUDE.md -> AGENTS.md);
    // a submodule is a folder.
    if (!stat.isFile()) continue;
    text = readFileSync(file, "utf8");
  }
  if (text.includes("\0")) continue; // binary
  for (const { line, label } of findLeaks(text)) {
    console.error(`${file}:${line}: ${label}`);
    failed += 1;
  }
}

if (failed > 0) {
  console.error(
    `\n${failed} local path(s) found. Use a repository-relative path or a placeholder instead.`,
  );
  process.exit(1);
}
