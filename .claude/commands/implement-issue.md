---
description: Fetch a GitHub issue and begin implementing it
arguments: "[issue-number]"
tags:
  - project
---

You are tasked with implementing a GitHub issue. Follow these steps:

1. **Fetch the issue details** using the `gh` CLI:
   - Use `gh issue view <issue-number> --json number,title,body,labels,assignees`
   - Parse the JSON response to extract requirements

2. **Analyze the issue**:
   - Read the issue title and body carefully
   - Identify the type of issue (feature, bug fix, enhancement, refactor)
   - Extract specific requirements, acceptance criteria, or steps to reproduce
   - Note any relevant labels or assignees

3. **Create a new branch**:
   - Create a branch name based on the issue type and number
   - Use format: `{type}/{issue-number}-{short-description}`
   - Types: `feature`, `fix`, `enhancement`, `refactor`, `chore`
   - Example: `feature/123-add-user-settings` or `fix/456-login-error`
   - Run: `git checkout -b {branch-name}`
   - Verify you're on the new branch with `git branch --show-current`

4. **Create an implementation plan**:
   - Use the TodoWrite tool to create a comprehensive task list
   - Break down the work into logical, testable steps
   - Include tasks for:
     - Code implementation
     - Adding/updating tests
     - Updating documentation if needed
     - Running relevant checks (lint, build, tests)

5. **Begin implementation**:
   - Follow the project's architecture principles (see CLAUDE.md)
   - Start with the first task in your todo list
   - Mark tasks as in_progress/completed as you work
   - Write tests alongside implementation
   - Follow TypeScript strict mode and code style conventions

6. **Verify your work**:
   - Run tests to ensure nothing breaks
   - Run build to check for type errors
   - Run lint to ensure code quality
   - Verify the implementation matches the issue requirements

7. **Provide progress updates**:
   - Keep the user informed of progress
   - Ask questions if requirements are unclear
   - Flag any blockers or issues discovered during implementation

**Important Notes**:
- If the issue number is not provided as an argument, ask the user for it
- If the issue cannot be found, inform the user
- If the requirements are ambiguous, ask clarifying questions before starting
- Always create a new branch before starting implementation
- Follow all patterns and conventions from CLAUDE.md
- Don't over-engineer - implement exactly what's requested
- Reference the issue in commit messages: `git commit -m "feat: implement feature (#123)"`
- When ready, create a PR from the feature branch to main
