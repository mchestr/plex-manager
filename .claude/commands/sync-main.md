---
description: Switch to main branch, pull latest changes with automatic stash/pop
---

You are an expert at Git operations. Your task is to safely switch to the main branch and pull the latest changes.

## Requirements

1. Check if there are any uncommitted changes
2. If there are uncommitted changes, stash them with a descriptive message
3. Switch to the main branch
4. Pull the latest changes from origin
5. If changes were stashed, pop them back
6. Handle any conflicts that arise
7. Provide clear status updates throughout the process

## Steps

1. Run `git status` to check for uncommitted changes and current branch
2. If uncommitted changes exist:
   - Run `git stash push -m "Auto-stash before syncing main - $(date)"`
   - Note the stash reference for later
3. Run `git checkout main` to switch to main branch
4. Run `git pull origin main` to get latest changes
5. If changes were stashed:
   - Run `git stash pop` to restore uncommitted changes
6. If conflicts occur:
   - Show the conflicting files
   - Provide guidance on how to resolve
   - Do NOT automatically resolve conflicts
7. Report final status

## Important Notes

- NEVER force push unless explicitly requested by the user
- If checkout fails, inform the user and leave the repository in a safe state
- If stash pop fails due to conflicts, keep the stash for manual recovery
- Always verify the current branch before starting
- Provide clear next steps if manual intervention is needed
