---
description: Automatically fix failing status checks on a PR
allowed-tools: [Bash, Read, Edit, Write, TodoWrite]
model: sonnet
---

# PR Status Checks Fixer Agent

Automated PR status check repair workflow that diagnoses and fixes failing GitHub Actions checks on pull requests.

## Usage

- `/fix-pr-status-checks <pr-number>` - Fix all failing status checks on the specified PR
- `/fix-pr-status-checks <pr-number> [check-name]` - Fix specific check on the PR (e.g., "build", "lint")

## Workflow

This command runs an automated agent that:

1. **Discovery Phase**
   - Validate PR number argument is provided
   - Fetch PR status checks: `gh pr checks <pr-number>`
   - Identify failing status checks
   - Get PR branch: `gh pr view <pr-number> --json headRefName`
   - Checkout PR branch locally: `gh pr checkout <pr-number>`
   - For each failing check, get run details and logs
   - Create todo list tracking all failures

2. **Analysis Phase**
   For each failure:
   - Categorize failure type (build, test, lint, type error, dependency, etc.)
   - Extract specific error messages and file locations
   - Identify root cause (changed APIs, missing dependencies, test failures, etc.)
   - Prioritize fixes (blocking issues first)

3. **Fix Phase** (Iterative)
   For each identified issue:
   - Mark as "in_progress" in todo list
   - Apply appropriate fix based on failure type
   - Run local verification command (build, test, lint, etc.)
   - If verification passes:
     - Mark as "completed"
     - Move to next issue
   - If verification fails:
     - Analyze new error
     - Try alternative fix
     - Maximum 2 retry attempts per issue

4. **Commit Phase**
   - Stage all fixes
   - Create descriptive commit message with all fixes
   - Push to PR branch
   - Link commit to PR in message: "Fixes failing status checks for PR #<pr-number>"

5. **Verification Phase**
   - Wait for status checks to update after push
   - Check PR status: `gh pr checks <pr-number>`
   - Verify which checks now pass
   - For any checks that can be manually re-run, offer to trigger them
   - Report success or remaining failures

6. **Documentation Phase**
   - Summary of all fixes applied
   - PR URL with current status check results
   - Any issues requiring manual intervention
   - Clear audit trail in todo list

## Fix Strategies

### Common Workflow Failures

**Build Failures**:
- TypeScript compilation errors
- Missing imports or broken references
- Invalid configuration files
- Fix: Run `npm run build` locally and address type errors

**Test Failures**:
- Unit tests failing (Jest)
- E2E tests failing (Playwright)
- Test environment issues
- Fix: Run `npm test` or `npm run test:e2e` locally and fix failures

**Lint Failures**:
- ESLint violations
- Code style issues
- Unused imports/variables
- Fix: Run `npm run lint` locally, use `npm run lint -- --fix` for auto-fixable issues

**Dependency Issues**:
- Missing dependencies in package.json
- Version conflicts
- Lock file out of sync
- Fix: Run `npm install`, update package.json, regenerate lock file

**Type Check Failures**:
- TypeScript strict mode violations
- Missing type definitions
- Invalid type usage
- Fix: Run `npx tsc --noEmit` locally and fix type errors

**Environment/Configuration**:
- Missing environment variables in workflow
- Invalid workflow YAML syntax
- Docker/container issues
- Fix: Update `.github/workflows/` files with correct configuration

**Database/Migration Issues**:
- Prisma schema changes without migration
- Failed database migrations
- Schema sync issues
- Fix: Run `npm run db:generate` or `npm run db:migrate`

### Approach

1. **Checkout PR**: Use `gh pr checkout <pr-number>` to work on the PR branch
2. **Identify Failures**: Use `gh pr checks <pr-number>` to see failing checks
3. **Fetch Logs**: Get run IDs from checks and use `gh run view [run-id] --log-failed` for detailed logs
4. **Parse Errors**: Extract specific error messages and file paths
5. **Reproduce Locally**: Run the same command that failed in CI
6. **Fix Iteratively**: Address each error one-by-one
7. **Verify Each Fix**: Run local verification before committing
8. **Push to PR**: Push fixes to PR branch, triggering new check runs

## GitHub CLI Commands

The agent uses these `gh` commands:

```bash
# View PR status checks
gh pr checks <pr-number>

# View PR details
gh pr view <pr-number>

# Checkout PR branch locally
gh pr checkout <pr-number>

# Get PR branch name
gh pr view <pr-number> --json headRefName

# View specific run details (from check run IDs)
gh run view [run-id]

# Download failed logs
gh run view [run-id] --log-failed

# Re-run failed jobs (if available)
gh run rerun [run-id]

# Watch workflow run in real-time
gh run watch [run-id]
```

## Local Verification Commands

Before pushing fixes, verify locally:

```bash
# Build check
npm run build

# Type check
npx tsc --noEmit

# Unit tests
npm test

# E2E tests
npm run test:e2e

# Lint check
npm run lint

# Lint with auto-fix
npm run lint -- --fix

# Database migrations
npm run db:generate
npm run db:migrate
```

## Output

The agent maintains a todo list showing:
- ✅ Issues fixed successfully
- 🔄 Issue currently being fixed
- ⏳ Issues pending
- ❌ Issues needing manual intervention
- 🔗 PR URL and check status

Final report includes:
- Total issues fixed
- Commands run for verification
- Commit SHA with fixes
- PR check status (passed/failed/pending)
- Remaining issues requiring manual review

## Arguments

`$ARGUMENTS` must include:
- **PR number** (required): The pull request number to fix checks for
- **Check name** (optional): Specific check to fix (e.g., "build", "lint", "test")
- If check name not specified, fixes all failing checks on the PR

## Error Handling

- If PR not found, verify PR number is correct
- If PR checks can't be fetched, guide user to authenticate: `gh auth login`
- If PR branch can't be checked out, provide troubleshooting steps
- If issue can't be fixed after 2 attempts, mark for manual review
- If local verification fails after fix, document the error
- If checks still fail after push, provide detailed next steps

## Safety

- Always verify fixes locally before pushing
- Create clear commit messages linking to PR
- Don't force-push unless explicitly requested by user
- Preserve workflow logs for manual debugging
- Ask before re-triggering expensive workflows (E2E tests)
- Ensure you're on the correct PR branch before making changes

## Example Usage

```bash
# Fix all failing checks on PR #42
/fix-pr-status-checks 42

# Fix only the build check on PR #42
/fix-pr-status-checks 42 build

# Fix only the lint check on PR #15
/fix-pr-status-checks 15 lint
```

## Multi-Check PRs

For PRs with multiple failing checks:
- Identify which checks failed
- Prioritize fixing based on dependencies
- Fix blocking checks first (e.g., build before test)
- Track each check failure separately in todo list
- Push all fixes together to avoid triggering checks multiple times

## Integration with Other Commands

This command works well with:
- `/fix-tests` - If workflow failed due to unit test failures
- `/fix-e2e` - If workflow failed due to E2E test failures
- `/build` - If workflow failed during build step
- `/lint` - If workflow failed during lint step

## Limitations

- Requires `gh` CLI to be installed and authenticated
- Requires PR number to be provided as argument
- Can only fix issues reproducible locally
- May not fix environment-specific issues (CI-only failures)
- Cannot fix issues requiring secrets/credentials changes
- Cannot fix required checks that are external or from other repositories
