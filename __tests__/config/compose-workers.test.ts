/**
 * @jest-environment node
 */

import { readFileSync } from "node:fs"
import path from "node:path"

import { parse } from "yaml"

// The web and worker example (P11.3): one image, one worker that applies the
// migrations and publishes no port, and web containers that skip them.

interface Service {
  image?: string
  env_file?: string[]
  environment?: string[]
  ports?: string[]
  healthcheck?: unknown
  deploy?: { replicas?: number }
  depends_on?: Record<string, { condition: string }>
}

const compose = parse(readFileSync(path.resolve(__dirname, "../../docs/examples/docker-compose.workers.yml"), "utf8"), {
  merge: true,
}) as { services: Record<string, Service> }

const roleOf = (service: Service) => service.environment?.find((entry) => entry.startsWith("PROCESS_ROLE="))?.split("=")[1]
const appServices = Object.entries(compose.services).filter(([, service]) => roleOf(service) !== undefined)

describe("docs/examples/docker-compose.workers.yml", () => {
  it("parses and runs exactly one worker", () => {
    const workers = appServices.filter(([, service]) => roleOf(service) === "worker")

    expect(workers).toHaveLength(1)
    expect(workers[0][1].deploy?.replicas ?? 1).toBe(1)
  })

  it("runs every app container from the same image and .env", () => {
    const images = new Set(appServices.map(([, service]) => service.image))

    expect(images.size).toBe(1)
    for (const [, service] of appServices) expect(service.env_file).toEqual([".env"])
  })

  it("lets the worker apply the migrations without a published port", () => {
    const worker = compose.services.worker

    expect(worker.environment).not.toContain("SKIP_MIGRATIONS=true")
    expect(worker.ports).toBeUndefined()
  })

  it("has the web service skip migrations and wait for a healthy worker", () => {
    const web = compose.services.web

    expect(roleOf(web)).toBe("web")
    expect(web.environment).toContain("SKIP_MIGRATIONS=true")
    expect(web.depends_on?.worker).toEqual({ condition: "service_healthy" })
  })

  it("keeps the image's healthcheck and shares one database and Redis", () => {
    for (const [, service] of appServices) {
      expect(service.healthcheck).toBeUndefined()
    }
    const urls = (name: string) => new Set(appServices.map(([, s]) => s.environment?.find((e) => e.startsWith(`${name}=`))))
    expect(urls("DATABASE_URL").size).toBe(1)
    expect(urls("REDIS_URL").size).toBe(1)
  })
})
