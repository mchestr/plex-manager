---
description: Automatically fix failing Playwright E2E tests with screenshots and traces
allowed-tools: [Bash, Read, Edit, Write, TodoWrite]
model: sonnet
---

# Playwright E2E Test Fixer Agent

Automated E2E test repair workflow that systematically fixes failing Playwright tests with visual debugging support.

## Usage

- `/fix-e2e` - Fix all failing E2E tests
- `/fix-e2e [pattern]` - Fix tests matching specific pattern
- `/fix-e2e [file]` - Fix tests in specific file

## Workflow

This command runs an automated agent that:

1. **Discovery Phase**
   - Run all E2E tests: `npm run test:e2e`
   - Capture failures with screenshots and traces
   - Parse Playwright's output for failure details
   - Create a todo list tracking all failing tests

2. **Analysis Phase**
   For each failing test:
   - Extract test name, file location, and error message
   - Check for screenshots in `test-results/` directory
   - Check for traces if available (on retry failures)
   - Identify failure category (see Fix Strategies below)

3. **Fix Phase** (Iterative)
   For each failing test:
   - Mark test as "in_progress" in todo list
   - Read the test file to understand intent
   - Read any related component/page files
   - Analyze error message and stack trace
   - If screenshot available, examine it for visual clues
   - Apply appropriate fix (test code or application code)
   - Verify fix by running specific test: `npx playwright test [test-file] --project=chromium`
   - If test passes:
     - Mark as "completed" in todo list
     - Move to next failing test
   - If test still fails:
     - Analyze new error/screenshot
     - Try alternative fix
     - Maximum 2 retry attempts per test

4. **Verification Phase**
   - Run full E2E suite: `npm run test:e2e`
   - Confirm no regressions introduced
   - Check that previously passing tests still pass
   - Report final results

5. **Documentation Phase**
   - Summary of tests fixed
   - Summary of tests requiring manual intervention
   - Screenshots/traces for unresolved failures
   - Clear audit trail in todo list

## Fix Strategies

### Common E2E Failures

**Selector Issues** (Most Common):
- Element not found or selector changed
- Missing `data-testid` attributes
- Text content changed breaking text-based selectors
- Fix: Add `data-testid` to components, update selectors in tests

```typescript
// ❌ Fragile selectors (avoid)
page.locator('.btn-primary')                    // CSS class can change
page.getByText('Submit')                        // Text can change
page.locator('div > button:nth-child(2)')       // Structure can change

// ✅ Stable selectors (prefer)
page.getByTestId('submit-button')               // data-testid is stable
page.getByRole('button', { name: /submit/i })   // Semantic and flexible
```

If `data-testid` is missing:
1. Add it to the component: `<button data-testid="submit-button">Submit</button>`
2. Update the test to use it: `page.getByTestId('submit-button')`

**Timing Issues**:
- Element not visible when expected
- Page not fully loaded before interaction
- Animation or transition interference
- Fix: Add proper waits, use `navigateAndVerify`, wait for specific elements

**Authentication Failures**:
- Test token not working
- Session not persisted correctly
- Redirect loops
- Fix: Verify test auth setup, check fixtures, ensure database seeded

**UI State Mismatches**:
- Expected element in wrong state (disabled, hidden, etc.)
- Modal or dialog blocking interaction
- Toast notifications blocking clicks
- Fix: Handle UI state properly, dismiss overlays, wait for animations

**Network/API Failures**:
- API calls timing out or failing
- Mock data not matching expectations
- Database state not as expected
- Fix: Verify database seeds, check API endpoints, add retry logic

**Browser-Specific Issues**:
- Works in one browser but not another
- Browser-specific timing differences
- CSS rendering differences
- Fix: Use cross-browser compatible selectors, adjust timeouts

### Test ID Naming Convention

When adding test IDs:
- Use descriptive, stable names: `data-testid="sonarr-series-add-button"`
- Follow pattern: `[feature]-[component]-[action]`
- Don't use dynamic values or random suffixes
- Keep them semantic and maintainable

### Approach

1. **Understand the Test**: Read test file to understand what it's trying to verify
2. **Check Screenshots**: If available, examine `test-results/` for visual debugging
3. **Reproduce Locally**: Run the specific failing test in headed mode: `npx playwright test [file] --headed`
4. **Identify Root Cause**: Is it test code, app code, or timing?
5. **Minimal Fix**: Make the smallest change to fix the issue
6. **Verify Immediately**: Run specific test after each fix
7. **Add data-testid**: When adding new selectors, prefer `data-testid`

## Commands Reference

```bash
# Run all E2E tests
npm run test:e2e

# Run specific test file
npx playwright test admin-functionality.spec.ts

# Run specific test by name
npx playwright test -g "admin can access settings"

# Run in headed mode (see browser)
npx playwright test [file] --headed

# Run in debug mode (step through)
npx playwright test [file] --debug

# Run in UI mode (interactive)
npx playwright test --ui

# Show HTML report
npx playwright show-report

# View trace file
npx playwright show-trace test-results/[test-name]/trace.zip
```

## Output

The agent maintains a todo list showing:
- ✅ Tests fixed successfully
- 🔄 Test currently being fixed
- ⏳ Tests pending
- ❌ Tests needing manual intervention

Final report includes:
- Total tests fixed
- Tests requiring manual review
- Patterns noticed (e.g., "3 tests failed due to missing data-testid")
- Links to screenshots/traces for unresolved failures

## Arguments

$ARGUMENTS can specify:
- A test file pattern to focus on (e.g., `admin-*.spec.ts`)
- A specific test file path (e.g., `e2e/admin-functionality.spec.ts`)
- A test name pattern with `-g` (e.g., `-g "admin can"`)
- If not specified, fixes all failing tests

## Project-Specific Notes

### Test Structure
- Tests located in `e2e/` directory
- Fixtures in `e2e/fixtures/auth.ts`
- Helpers in `e2e/helpers/test-utils.ts`
- Config in `playwright.config.ts`

### Authentication
- Uses test tokens (`TEST_ADMIN_TOKEN`, `TEST_REGULAR_TOKEN`)
- Fixtures: `adminPage`, `regularUserPage`, `authenticatedPage`
- Only works when `NODE_ENV !== 'production'`

### Common Files to Check
- `e2e/fixtures/auth.ts` - Auth setup issues
- `e2e/helpers/test-utils.ts` - Utility function issues
- `e2e/global-setup.ts` - Database seeding issues
- `playwright.config.ts` - Configuration issues

### Screenshot Location
After test failures, check:
- `test-results/` - Contains screenshots and traces
- `playwright-report/` - HTML report with embedded screenshots

## Error Handling

- If a test can't be fixed after 2 attempts, mark it for manual review
- If full suite fails after fixes, report regression details
- If Playwright can't start, diagnose environment issues
- If database isn't seeded, run seed and retry

## Safety

- Runs full suite at end to catch regressions
- Clear documentation of all changes made
- Screenshots preserved for debugging
- Component changes use `data-testid` (minimal impact)

## Example Debugging Session

```bash
# 1. See what's failing
npm run test:e2e

# 2. Run specific failing test in headed mode
npx playwright test e2e/admin-functionality.spec.ts --headed

# 3. Or use debug mode to step through
npx playwright test e2e/admin-functionality.spec.ts --debug

# 4. View the HTML report for failure details
npx playwright show-report

# 5. After fixing, verify the specific test
npx playwright test e2e/admin-functionality.spec.ts

# 6. Then run full suite to check for regressions
npm run test:e2e
```
