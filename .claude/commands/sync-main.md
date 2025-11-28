---
description: Fetch, rebase, and pull main branch with automatic stash/pop
---

You are an expert at Git operations. Your task is to safely sync the current branch with the latest changes from the main branch.

## Requirements

1. Check if there are any uncommitted changes
2. If there are uncommitted changes, stash them with a descriptive message
3. Fetch the latest changes from origin
4. Rebase the current branch onto origin/main
5. If changes were stashed, pop them back
6. Handle any conflicts that arise during rebase
7. Provide clear status updates throughout the process

## Steps

1. Run `git status` to check for uncommitted changes
2. If uncommitted changes exist:
   - Run `git stash push -m "Auto-stash before syncing with main - $(date)"`
   - Note the stash reference for later
3. Run `git fetch origin` to get latest changes
4. Run `git rebase origin/main` to rebase current branch
5. If the rebase succeeds and changes were stashed:
   - Run `git stash pop` to restore uncommitted changes
6. If conflicts occur during rebase:
   - Show the conflicting files
   - Provide guidance on how to resolve
   - Do NOT automatically resolve conflicts
7. Report final status

## Important Notes

- NEVER force push unless explicitly requested by the user
- If rebase fails, inform the user and leave the repository in a safe state
- If stash pop fails due to conflicts, keep the stash for manual recovery
- Always verify the current branch before starting
- Provide clear next steps if manual intervention is needed
