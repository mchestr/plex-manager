---
description: Automatically fix failing GitHub workflow builds with log analysis
allowed-tools: [Bash, Read, Edit, Write, TodoWrite]
model: sonnet
---

# GitHub Workflow Fixer Agent

Automated CI/CD repair workflow that diagnoses and fixes failing GitHub Actions builds.

## Usage

- `/fix-workflow` - Fix the latest failing workflow run
- `/fix-workflow [workflow-name]` - Fix specific workflow (e.g., "CI", "E2E Tests")
- `/fix-workflow [run-id]` - Fix specific workflow run by ID

## Workflow

This command runs an automated agent that:

1. **Discovery Phase**
   - Fetch latest workflow runs: `gh run list --limit 10`
   - Identify failed workflow runs
   - Download failure logs: `gh run view [run-id] --log-failed`
   - Parse logs to identify failure types
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
   - Push to remote branch
   - Link commit to workflow run in message

5. **Verification Phase**
   - Check if workflow can be re-run: `gh run rerun [run-id]`
   - If applicable, offer to re-trigger workflow
   - Monitor new run status
   - Report success or remaining failures

6. **Documentation Phase**
   - Summary of all fixes applied
   - Workflow run URL with results
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

1. **Fetch Logs**: Use `gh run view [run-id] --log-failed` to get detailed failure logs
2. **Parse Errors**: Extract specific error messages and file paths
3. **Reproduce Locally**: Run the same command that failed in CI
4. **Fix Iteratively**: Address each error one-by-one
5. **Verify Each Fix**: Run local verification before committing
6. **Batch Commit**: Group related fixes in single commit
7. **Re-run Workflow**: Use `gh run rerun` to verify fixes

## GitHub CLI Commands

The agent uses these `gh` commands:

```bash
# List recent workflow runs
gh run list --limit 10

# View specific run details
gh run view [run-id]

# Download failed logs
gh run view [run-id] --log-failed

# Re-run failed jobs
gh run rerun [run-id]

# Re-run only failed jobs
gh run rerun [run-id] --failed

# Watch workflow run in real-time
gh run watch [run-id]

# List workflows
gh workflow list

# View workflow file
gh workflow view [workflow-name]
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
- 🔗 Workflow run URLs

Final report includes:
- Total issues fixed
- Commands run for verification
- Commit SHA with fixes
- Workflow run status (passed/failed)
- Remaining issues requiring manual review

## Arguments

`$ARGUMENTS` can specify:
- Workflow name to target (e.g., "CI", "Test")
- Specific run ID to fix
- If not specified, fixes latest failing run

## Error Handling

- If workflow logs can't be fetched, guide user to authenticate: `gh auth login`
- If issue can't be fixed after 2 attempts, mark for manual review
- If local verification fails after fix, document the error
- If workflow re-run still fails, provide detailed next steps

## Safety

- Always verify fixes locally before pushing
- Create clear commit messages linking to workflow run
- Don't force-push unless explicitly requested by user
- Preserve workflow logs for manual debugging
- Ask before re-triggering expensive workflows (E2E tests)

## Example Usage

```bash
# Fix latest failing workflow
/fix-workflow

# Fix specific workflow by name
/fix-workflow "CI"

# Fix specific run by ID
/fix-workflow 12345678
```

## Multi-Job Workflows

For workflows with multiple jobs:
- Identify which jobs failed
- Prioritize fixing based on dependencies
- Fix blocking jobs first (e.g., build before test)
- Track each job failure separately in todo list

## Integration with Other Commands

This command works well with:
- `/fix-tests` - If workflow failed due to unit test failures
- `/fix-e2e` - If workflow failed due to E2E test failures
- `/build` - If workflow failed during build step
- `/lint` - If workflow failed during lint step

## Limitations

- Requires `gh` CLI to be installed and authenticated
- Can only fix issues reproducible locally
- May not fix environment-specific issues (CI-only failures)
- Cannot fix issues requiring secrets/credentials changes
