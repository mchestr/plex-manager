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
    'components/**/*.{ts,tsx}',
    'lib/**/*.{ts,tsx}',
    'actions/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  transformIgnorePatterns: [
    '/node_modules/(?!jose|@panva|openid-client|oauth4webapi|next-auth)/',
  ],
  moduleDirectories: ['node_modules', '<rootDir>/'],
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig)

