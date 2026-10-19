/**
 * @jest-environment node
 */

import { readFileSync } from "node:fs"
import path from "node:path"

import { parse } from "yaml"

// The development compose file publishes Postgres and Redis on loopback only and
// refuses to start without their passwords (SEC-04).

interface Service {
  ports?: string[]
  environment?: string[]
  command?: string
}

const compose = parse(readFileSync(path.resolve(__dirname, "../../docker-compose.yml"), "utf8")) as {
  services: Record<string, Service>
}
const services = Object.entries(compose.services)
const postgresServices = services.filter(([, service]) =>
  service.environment?.some((entry) => entry.startsWith("POSTGRES_USER="))
)
const REQUIRED_POSTGRES = "${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}"
const REQUIRED_REDIS = "${REDIS_PASSWORD:?set REDIS_PASSWORD in .env}"

describe("docker-compose.yml", () => {
  it.each(services)("%s binds every published port to 127.0.0.1", (_name, service) => {
    for (const port of service.ports ?? []) {
      expect(port).toMatch(/^127\.0\.0\.1:\d+:\d+$/)
    }
  })

  it("has both Postgres services", () => {
    expect(postgresServices.map(([name]) => name)).toEqual(["db", "db-playwright"])
  })

  it.each(postgresServices)("%s requires POSTGRES_PASSWORD", (_name, service) => {
    expect(service.environment).toContain(`POSTGRES_PASSWORD=${REQUIRED_POSTGRES}`)
  })

  it("requires REDIS_PASSWORD for the Redis server", () => {
    expect(compose.services.redis.command).toContain(`--requirepass ${REQUIRED_REDIS}`)
  })

  it("builds the app's connection strings from the required passwords", () => {
    const env = compose.services.app.environment ?? []
    expect(env.find((entry) => entry.startsWith("DATABASE_URL="))).toContain(`postgres:${REQUIRED_POSTGRES}@db:5432`)
    expect(env.find((entry) => entry.startsWith("REDIS_URL="))).toBe(`REDIS_URL=redis://:${REQUIRED_REDIS}@redis:6379`)
  })
})
