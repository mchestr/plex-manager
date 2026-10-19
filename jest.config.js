const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
})

// The integration suites (*.pg.test.ts and *.redis.test.ts) share one
// TEST_DATABASE_URL and one TEST_REDIS_URL, and some of them empty and count
// whole tables, so they must run one at a time and apart from the other suites.
// `npm run test:integration` sets JEST_INTEGRATION=1, which stops ignoring them,
// and selects only them in a serial run; every other run leaves them out. See
// test/helpers/integration.ts for how a missing variable is handled.
const integrationRun = process.env.JEST_INTEGRATION === '1'

// Coverage floors that only rise: `node scripts/coverage-ratchet.mjs --update`
// raises them after a run with coverage, and never lowers one.
const coverageThreshold = require('./jest.coverage-thresholds.json')
const INTEGRATION_SUITES = '\\.(pg|redis)\\.test\\.ts$'

// Add any custom config to be passed to Jest
const customJestConfig = {
  ...(integrationRun ? { maxWorkers: 1 } : {}),
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: [
    '**/__tests__/**/*.test.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)',
  ],
  testPathIgnorePatterns: [
    '<rootDir>/e2e/',
    '<rootDir>/.claude/worktrees/',
    ...(integrationRun ? [] : [INTEGRATION_SUITES]),
  ],
  collectCoverageFrom: [
    'app/**/*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    'hooks/**/*.{ts,tsx}',
    'lib/**/*.{ts,tsx}',
    'actions/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!lib/generated/**',
  ],
  // json-summary feeds scripts/coverage-ratchet.mjs.
  coverageReporters: ['json-summary', 'lcov', 'text-summary'],
  // The integration run measures only its own few suites.
  ...(integrationRun ? {} : { coverageThreshold }),
  transformIgnorePatterns: [
    '/node_modules/(?!jose|@panva|openid-client|oauth4webapi|next-auth)/',
  ],
  moduleDirectories: ['node_modules', '<rootDir>/'],
}

// The AI SDK and its dependencies ship ES modules only, so Jest must transform
// them. next/jest ignores all of node_modules except its own transpiled
// packages (a custom pattern can only add to that list), so these join its
// exception here rather than the app's transpilePackages.
const ESM_ONLY_PACKAGES = ['ai', '@ai-sdk', '@standard-schema', '@workflow/serde', 'eventsource-parser']
const NEXT_EXCEPTION = '/node_modules/(?!.pnpm)(?!('

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = async () => {
  const config = await createJestConfig(customJestConfig)()
  config.transformIgnorePatterns = config.transformIgnorePatterns.map((pattern) =>
    pattern.startsWith(NEXT_EXCEPTION)
      ? pattern.replace(NEXT_EXCEPTION, `${NEXT_EXCEPTION}${ESM_ONLY_PACKAGES.join('|')}|`)
      : pattern
  )
  return config
}

