/**
 * @jest-environment node
 */

import { readFileSync } from "node:fs"
import path from "node:path"

import { parse } from "yaml"

// The production compose file (P11.24, GAP-16) runs the published image with
// every app setting from .env: no `environment:` override can pin a URL the
// operator did not choose. Ports bind to loopback, and Postgres and Redis
// refuse to start without their passwords.

interface Service {
  image?: string
  build?: unknown
  restart?: string
  env_file?: string[]
  ports?: string[]
  environment?: string[]
  command?: string
  depends_on?: Record<string, { condition: string }>
}

const ROOT = path.resolve(__dirname, "../..")
const text = readFileSync(path.join(ROOT, "deploy/docker-compose.yml"), "utf8")
const compose = parse(text) as { services: Record<string, Service>; volumes: Record<string, unknown> }
const { app, db, redis } = compose.services

describe("deploy/docker-compose.yml", () => {
  it("parses with the app, db and redis services", () => {
    expect(Object.keys(compose.services).sort()).toEqual(["app", "db", "redis"])
  })

  it("runs the image docker-publish pushes, at a pinnable version", () => {
    expect(app.image).toBe("ghcr.io/mchestr/plex-manager:${PLEX_MANAGER_VERSION:-latest}")
    expect(app.build).toBeUndefined()
    const publish = readFileSync(path.join(ROOT, ".github/workflows/docker-publish.yml"), "utf8")
    expect(publish).toMatch(/images: \$\{\{ env\.REGISTRY \}\}\/\$\{\{ env\.IMAGE_NAME \}\}/)
    expect(publish).toMatch(/REGISTRY: ghcr\.io/)
  })

  it("reads the app's settings from .env with no environment override", () => {
    expect(app.env_file).toEqual([".env"])
    expect(app.environment).toBeUndefined()
    expect(text).not.toMatch(/(NEXTAUTH_URL|NEXT_PUBLIC_APP_URL|DATABASE_URL|REDIS_URL)=/)
  })

  it("restarts every service and starts the app once db and redis are healthy", () => {
    for (const service of [app, db, redis]) expect(service.restart).toBe("unless-stopped")
    expect(app.depends_on).toEqual({ db: { condition: "service_healthy" }, redis: { condition: "service_healthy" } })
  })

  it("binds every published port to 127.0.0.1, and publishes none for db and redis", () => {
    expect(app.ports).toEqual(["127.0.0.1:3000:3000"])
    expect(db.ports).toBeUndefined()
    expect(redis.ports).toBeUndefined()
  })

  it("requires both passwords with :?", () => {
    expect(db.image).toBe("postgres:16-alpine")
    expect(db.environment).toContain("POSTGRES_PASSWORD=${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}")
    expect(redis.image).toBe("redis:7-alpine")
    expect(redis.command).toBe(
      "redis-server --appendonly yes --requirepass ${REDIS_PASSWORD:?set REDIS_PASSWORD in .env}"
    )
    expect(redis.environment).toContain("REDISCLI_AUTH=${REDIS_PASSWORD:?set REDIS_PASSWORD in .env}")
  })
})

describe("docker-compose.yml", () => {
  it("says it is for development only", () => {
    const dev = readFileSync(path.join(ROOT, "docker-compose.yml"), "utf8")
    expect(dev.split("\n")[0]).toMatch(/^# Development only\./)
    expect(dev).toContain("deploy/docker-compose.yml")
  })
})
