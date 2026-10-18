const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
})

// The Postgres-backed suites (*.pg.test.ts) share one TEST_DATABASE_URL, and
// some of them empty and count whole tables, so they must run one at a time and
// apart from the other suites. `npm run test:pg` sets JEST_PG=1, which loads
// them and makes the run serial; every other run leaves them out. See
// test/helpers/integration.ts for how a missing TEST_DATABASE_URL is handled.
const pgRun = process.env.JEST_PG === '1'

// Add any custom config to be passed to Jest
const customJestConfig = {
  ...(pgRun ? { maxWorkers: 1 } : {}),
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: [
    '**/__tests__/**/*.test.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)',
  ],
  // The Redis-backed suites need a server: they run when TEST_REDIS_URL is
  // set, and always in CI, where a missing URL fails them.
  testPathIgnorePatterns: [
    '<rootDir>/e2e/',
    ...(process.env.TEST_REDIS_URL || process.env.CI ? [] : ['\\.redis\\.test\\.ts$']),
    ...(pgRun ? [] : ['\\.pg\\.test\\.ts$']),
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

