// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Set test environment variables
process.env.NEXTAUTH_SECRET = 'test-secret-key-for-hashing-ip-addresses-min-32-chars'
process.env.NODE_ENV = 'test'
// next/jest loads .env, where a developer may have set E2E_TEST_MODE. Unit
// tests never inherit it; the tests that need it set it themselves.
delete process.env.E2E_TEST_MODE
// Nor do they reach a developer's Redis through the rate limiter: without
// REDIS_URL it uses its in-process store. The Redis-backed tests read
// TEST_REDIS_URL instead.
delete process.env.REDIS_URL
delete process.env.TRUSTED_PROXY_HOPS

// Polyfill TextEncoder/TextDecoder for Node.js test environment
const { TextEncoder, TextDecoder } = require('util')
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder

// jsdom has no web streams; the AI SDK builds a TransformStream when it loads
if (typeof global.TransformStream === 'undefined') {
  const { ReadableStream, TransformStream, WritableStream } = require('node:stream/web')
  Object.assign(global, { ReadableStream, TransformStream, WritableStream })
}

// Mock framer-motion to avoid animation issues in tests
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }) => <div {...props}>{children}</div>,
    h1: ({ children, ...props }) => <h1 {...props}>{children}</h1>,
    h2: ({ children, ...props }) => <h2 {...props}>{children}</h2>,
    p: ({ children, ...props }) => <p {...props}>{children}</p>,
    span: ({ children, ...props }) => <span {...props}>{children}</span>,
    li: ({ children, ...props }) => <li {...props}>{children}</li>,
  },
  AnimatePresence: ({ children }) => <>{children}</>,
  useAnimation: () => ({
    start: jest.fn(),
    stop: jest.fn(),
  }),
  useReducedMotion: () => false,
}))

// Mock react-countup
jest.mock('react-countup', () => ({
  __esModule: true,
  default: ({ end, ...props }) => <span {...props}>{end}</span>,
}))

// Mock Web APIs for Next.js API route tests
// Note: NextRequest extends Request and has read-only url property
// We'll let Next.js handle Request creation, but provide a basic mock if needed
if (typeof global.Request === 'undefined') {
  global.Request = class Request {
    constructor(input, init = {}) {
      // Don't set url directly - it's read-only in real Request
      // Store it in a way that NextRequest can access
      const urlString = typeof input === 'string' ? input : input?.url || ''
      Object.defineProperty(this, 'url', {
        get: () => urlString,
        enumerable: true,
        configurable: true,
      })
      this.method = init.method || 'GET'
      this.headers = new Headers(init.headers || {})
    }
  }
}

if (typeof global.Headers === 'undefined') {
  global.Headers = class Headers {
    constructor(init) {
      this.headers = new Map()
      if (init) {
        if (init instanceof Headers) {
          init.forEach((value, key) => this.headers.set(key, value))
        } else if (Array.isArray(init)) {
          init.forEach(([key, value]) => this.headers.set(key, value))
        } else {
          Object.entries(init).forEach(([key, value]) => this.headers.set(key, value))
        }
      }
    }

    get(name) {
      return this.headers.get(name.toLowerCase()) || null
    }

    set(name, value) {
      this.headers.set(name.toLowerCase(), value)
    }

    has(name) {
      return this.headers.has(name.toLowerCase())
    }

    forEach(callback) {
      this.headers.forEach(callback)
    }
  }
}

if (typeof global.Response === 'undefined') {
  global.Response = class Response {
    constructor(body, init = {}) {
      this._body = body
      this.status = init.status || 200
      this.statusText = init.statusText || 'OK'
      this.headers = new Headers(init.headers || {})
    }

    json() {
      return Promise.resolve(typeof this._body === 'string' ? JSON.parse(this._body) : this._body)
    }

    text() {
      return Promise.resolve(typeof this._body === 'string' ? this._body : JSON.stringify(this._body))
    }
  }
}

