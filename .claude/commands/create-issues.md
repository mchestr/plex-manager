---
description: Convert improvement ideas from a tracking doc (e.g. IMPROVEMENTS.md) to GitHub issues
allowed-tools: [Read, Edit, Bash, AskUserQuestion]
model: sonnet
---

# GitHub Issue Creator

You are tasked with converting improvement ideas from the project's improvement tracking document into properly formatted GitHub issues.

## Workflow

### 1. Read the Improvements Document
- Read the file that contains improvement ideas (likely named something like `IMPROVEMENTS.md`, `TODO.md`, or similar in the project root)
- If you can't find it, ask the user for the file path
- Parse all sections: Bug Fixes, New Features, Refactoring, Documentation, Testing, DevOps, and "Ready to Action"

### 2. Present Items for Selection
- Use the AskUserQuestion tool to let the user select which items to convert to issues
- Group items by section/category for easier selection
- Allow the user to select multiple items (set multiSelect: true)
- Provide clear descriptions of each item

### 3. Confirm Issue Details
For each selected item:
- Extract all context from the improvement document
- Determine appropriate labels based on section:
  - Bug Fixes → `bug`
  - New Features → `enhancement`
  - Refactoring & Technical Debt → `refactor`
  - Documentation → `documentation`
  - Testing → `testing`
  - DevOps & Infrastructure → `devops`
- Create a well-formatted issue body with:
  - Context from the document
  - Acceptance criteria (if available)
  - References to API docs or conventions (if mentioned)
  - Checklist for multi-step items
- Show the user a preview of the issue title, body, and labels
- Ask for confirmation before creating

### 4. Create Issues Using GitHub CLI
- Use the `gh issue create` command:
  ```bash
  gh issue create \
    --title "Issue Title" \
    --body "Issue body with context" \
    --label "label1,label2"
  ```
- Capture the issue number from the response
- Handle errors gracefully (e.g., if gh CLI is not authenticated)

### 5. Update the Improvements Document
- After successfully creating an issue, update the original document
- Mark the item as completed by moving it to the "✅ Completed" section
- Add a note like: `Created: Issue #123` with a link to the issue
- Preserve all other content in the document

### 6. Summary
- Provide a summary of all issues created with links
- Note any failures or items that couldn't be converted
- Remind the user that items have been moved to the Completed section

## Arguments

The command supports optional arguments:
- `$ARGUMENTS` can specify:
  - A specific section to focus on (e.g., `/create-issues documentation`)
  - A specific item by keyword (e.g., `/create-issues discord bot`)
  - `--all` to process all items marked as `[READY]` without prompting

## Error Handling

- If `gh` CLI is not installed, provide installation instructions
- If not authenticated with GitHub, provide authentication instructions
- If the improvements document doesn't exist, ask the user for the correct path
- If issue creation fails, do not modify the improvements document

## Best Practices

- Always show previews before creating issues
- Preserve all formatting and context from the original document
- Use proper markdown formatting in issue bodies
- Link related issues if they have dependencies
- Add appropriate labels for easier issue management
- Keep the improvements document clean and up-to-date
