# Contributing to Plex Manager

Thank you for your work on Plex Manager. This guide tells you how to prepare a development
environment, which checks to do, and how to send a pull request.
[CLAUDE.md](../CLAUDE.md) gives the architecture and the code conventions. Read
it before you change the code.

If you are not sure about a change, open an
[issue](https://github.com/mchestr/plex-manager/issues) first.

## Before you start

You must have these items:

- Node.js 24 and npm. Node.js 22.13 or a later 22.x release also works.
- Docker with Docker Compose, for PostgreSQL 16 and Redis 7. You can also use
  your own PostgreSQL and Redis.
- A Plex Media Server that you own, and Tautulli, to use the app with real
  data.

## Prepare a development environment

1. Get the code. Then install the dependencies:

   ```bash
   git clone https://github.com/mchestr/plex-manager.git
   cd plex-manager
   npm install
   ```

2. Make a `.env` file from the example:

   ```bash
   cp example.env .env
   ```

3. Set these values in `.env`. Replace each `<openssl ...>` value with the
   output of that command. Use the same two passwords in `DATABASE_URL` and
   `REDIS_URL`.

   ```env
   POSTGRES_PASSWORD="<openssl rand -hex 16>"
   REDIS_PASSWORD="<openssl rand -hex 16>"
   DATABASE_URL="postgresql://postgres:<POSTGRES_PASSWORD>@localhost:5432/plex_wrapped?schema=public"
   REDIS_URL="redis://:<REDIS_PASSWORD>@localhost:6379"
   NEXTAUTH_SECRET="<openssl rand -base64 32>"
   PLEX_CLIENT_IDENTIFIER="<openssl rand -hex 16>"
   ENCRYPTION_KEYS="k1:<openssl rand -base64 32>"
   ```

4. Start PostgreSQL and Redis:

   ```bash
   docker compose up -d db redis
   ```

5. Make the Prisma client. Then update the database:

   ```bash
   npm run db:generate
   npm run db:deploy
   ```

6. Start the development server:

   ```bash
   npm run dev
   ```

7. Open <http://localhost:3000>. Type the setup code from the output of
   `npm run dev`.

To put your own values in the setup wizard, set the `DEV_*` variables and
`DEV_SETUP_PREFILL="true"` in `.env`. The app reads them only in development,
until the setup is complete.

## Checks

Do these checks before you send a pull request. CI also does them.
`.github/workflows/build.yml` lists the other checks that CI does.

| Command | Check |
| --- | --- |
| `npm run lint` | The ESLint rules |
| `npm run typecheck` | The TypeScript types of the app and the tests |
| `npm test` | The unit tests |
| `npm run test:coverage` | The unit tests and the coverage floors |
| `npm run knip` | Unused files, exports and dependencies |
| `npm run design:check` | The rules of the design system |
| `npm run env:docs -- --check` | That `docs/environment.md` and `example.env` show the variables of `lib/env.ts`. To change them, type `npm run env:docs`. |

There are two more test suites:

- `npm run test:e2e` starts the Playwright tests. [e2e/README.md](../e2e/README.md)
  tells you how to prepare them.
- `npm run test:integration` starts the PostgreSQL and Redis suites. Set
  `TEST_DATABASE_URL` and `TEST_REDIS_URL` first. The name of the test
  database must end in `_test`. Before the suites, update that database with
  `DATABASE_URL="$TEST_DATABASE_URL" npm run db:deploy`.

The [performance guide](../docs/performance-testing.md) tells you where CI
measures performance.

## Database changes

To change the database schema:

1. Change `prisma/schema.prisma`.
2. Make a migration against a database whose name ends in `_test`:

   ```bash
   npx prisma migrate dev --create-only --name <descriptive_name>
   ```

3. Read the new `migration.sql`.
4. Update the database with `npm run db:deploy`.

Prisma puts the current time at the start of the folder name. That timestamp
must be later than the timestamp of each folder in `prisma/migrations`. Some
folders have dates in 2027, from the project plan. If the new timestamp is not
later, change it in the folder name before step 4. Do not change a migration
after it merges. CI makes sure that each schema change has a migration, that
each migration name has two or more words, and that the timestamps increase.

> [!CAUTION]
> Use the contributor-only commands `npm run db:push` and `npm run db:migrate`
> only on a database that you can lose. These commands can delete the data in
> that database.

> [!CAUTION]
> Use `npm run db:seed` only on a local database or on a database whose name
> ends in `_test`. It deletes all users, Rewinds and service settings, and then
> makes test users. It does not start without `E2E_TEST_MODE=true`.

## Pull requests

- Add a line under "Unreleased" in [CHANGELOG.md](../CHANGELOG.md) for each
  change that affects operators. The Changelog check fails a pull request that
  changes `prisma/migrations/**`, `lib/env.ts`, `docker/entrypoint.sh`,
  `Dockerfile` or `deploy/**` without that line.
- Answer each item in the pull request template.
- For a change to `.claude/skills/**` or `.mcp.json`, do a `/security-review`
  before the merge.
- [docs/releasing.md](../docs/releasing.md) tells you how to make a release.

## Project layout

```text
app/          Next.js routes: pages, layouts and API routes
actions/      Server Actions
components/   React components (components/ui/ holds the shared primitives)
hooks/        Client hooks and the TanStack Query keys
types/        Shared TypeScript types
lib/          Business logic, service clients, jobs and the Rewind pipeline
prisma/       The database schema and the migrations
docs/         Guides for operators
e2e/          Playwright tests
__tests__/    The shared test helpers, and the tests that are not next to their module
evals/        Rewind fixtures and the eval harness
scripts/      Build, CI and maintenance scripts
docker/       The image entrypoint and the pinned Prisma CLI
deploy/       The production Compose file
```

[CLAUDE.md](../CLAUDE.md) tells you more about the source folders.
`package.json` lists each npm script. The [Rewind runbook](../docs/rewind.md)
tells you when to use `rewind:freeze`, `rewind:season-open` and
`rewind:validate`. The other `rewind:*` scripts give their options at the top
of their files.

## Tech stack

| Area | Tools |
| --- | --- |
| App | Next.js 16 (App Router), React 19 and TypeScript |
| Data | Prisma 7 with PostgreSQL, and BullMQ with Redis |
| UI | Tailwind CSS 4, Base UI, Motion and Recharts |
| AI | The Vercel AI SDK, for OpenAI, Anthropic, Google and OpenAI-compatible servers |
| Tests | Jest, Testing Library and Playwright |
