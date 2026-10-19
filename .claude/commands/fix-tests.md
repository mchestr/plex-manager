---
description: Automatically fix failing unit tests with iterative verification
allowed-tools: [Bash, Read, Edit, Write, TodoWrite]
model: sonnet
---

# Test Fixer Agent

Automated test repair workflow that systematically fixes failing unit tests one-by-one.

## Usage

- `/fix-tests` - Fix all failing unit tests
- `/fix-tests [pattern]` - Fix tests matching specific pattern
- `/fix-tests [file]` - Fix tests in specific file

## Workflow

This command runs an automated agent that:

1. **Discovery Phase**
   - Run all unit tests: `npm test`
   - Capture failures and error details
   - Create a todo list tracking all failing tests

2. **Fix Phase** (Iterative)
   For each failing test:
   - Mark test as "in_progress" in todo list
   - Read the test file to understand context
   - Read the source file being tested
   - Analyze the error message and stack trace
   - Apply fix to either test file or source code
   - Verify fix by running the specific test: `npm test -- [test-file]`
   - If test passes:
     - Mark as "completed" in todo list
     - Move to next failing test
   - If test still fails:
     - Analyze new error
     - Attempt alternative fix
     - Maximum 2 retry attempts per test

3. **Verification Phase**
   - Run full test suite: `npm test`
   - Confirm no regressions introduced
   - Report final results

4. **Documentation Phase**
   - Summary of tests fixed
   - Summary of tests that couldn't be fixed (manual intervention needed)
   - Clear audit trail in todo list

## Fix Strategies

### Common Test Failures

**Mock Issues**:
- Missing or incorrect mock implementations
- Mock return values don't match expected types
- Async mocks not properly awaited

**Type Errors**:
- TypeScript types changed in source code
- Mock types need updating
- Test assertions using wrong types
- Check with `npm run typecheck`; Jest (SWC) does not type-check

**Standard for new and fixed tests**:
- Mock `@/lib/prisma` with the typed helper: `jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)` plus `beforeEach(() => mockReset(prismaMock))`
- Build rows with the factories in `__tests__/helpers/factories.ts` instead of partial objects
- Never silence a type error with `@ts-ignore`, `@ts-expect-error` or `as any`

**Component Changes**:
- Props changed/renamed/removed
- Component structure changed
- Missing data-testid attributes for Playwright tests

**Logic Errors**:
- Test expectations don't match new behavior
- Edge cases not handled
- Timing issues with async operations

### Approach

1. **Read First**: Always read both test file and source file
2. **Understand Intent**: Determine what the test is trying to verify
3. **Minimal Changes**: Make smallest change to fix test
4. **Verify Immediately**: Run specific test after each fix
5. **No Over-Engineering**: Fix what's broken, don't refactor unnecessarily

## Output

The agent maintains a todo list showing:
- ✅ Tests fixed successfully
- 🔄 Test currently being fixed
- ⏳ Tests pending
- ❌ Tests that need manual intervention

Final report includes:
- Total tests fixed
- Tests requiring manual review
- Any patterns noticed (e.g., "5 tests failed due to missing mocks")

## Arguments

$ARGUMENTS can specify:
- A test file pattern to focus on
- A specific test file path
- If not specified, fixes all failing tests

## Error Handling

- If a test can't be fixed after 2 attempts, mark it for manual review
- If full test suite fails after fixes, report regression details
- If npm test command fails to run, diagnose and report issue

## Safety

- Creates git commit before starting (if user confirms)
- Runs full suite at end to catch regressions
- Clear documentation of all changes made
