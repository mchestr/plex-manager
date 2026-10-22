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

// Browser APIs Base UI calls that jsdom lacks (P3.4). The node-environment
// suites have no window, so only stub them where one exists.
if (typeof window !== 'undefined') {
  if (typeof global.ResizeObserver === 'undefined') {
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
  // jsdom lays nothing out, so Recharts' ResponsiveContainer (ChartCard's
  // body, P10.9) would measure 0 x 0 and draw nothing. Give only that
  // container a fixed size; every other element keeps jsdom's empty rect.
  const getBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
  HTMLElement.prototype.getBoundingClientRect = function () {
    if (!this.classList.contains('recharts-responsive-container')) return getBoundingClientRect.call(this)
    return { x: 0, y: 0, top: 0, left: 0, right: 640, bottom: 256, width: 640, height: 256, toJSON() {} }
  }
  if (!Element.prototype.getAnimations) Element.prototype.getAnimations = () => []
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false
  if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {}
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {}
  // Base UI's Checkbox re-dispatches a click on its hidden input as a
  // PointerEvent (P3.5).
  if (typeof window.PointerEvent === 'undefined') {
    window.PointerEvent = class PointerEvent extends MouseEvent {
      constructor(type, init = {}) {
        super(type, init)
        this.pointerId = init.pointerId ?? 0
        this.pointerType = init.pointerType ?? ''
      }
    }
  }
  if (!window.matchMedia) {
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    })
  }
}

// Mock motion to avoid animation issues in tests. `animate` and the motion
// value hooks stay real (CountUp drives a motion value); a test that needs the
// reduced-motion branch sets `useReducedMotion`'s return value. The elements
// expose their `animate` and `transition` props as JSON in `data-animate` and
// `data-transition` (Infinity serialises as null).
jest.mock('motion/react', () => {
  const actual = jest.requireActual('motion/react')
  const element = (Tag) =>
    function MotionElement({ children, animate, transition, ...props }) {
      return (
        <Tag {...props} data-animate={JSON.stringify(animate)} data-transition={JSON.stringify(transition)}>
          {children}
        </Tag>
      )
    }
  const elements = {
    div: element('div'),
    h1: element('h1'),
    h2: element('h2'),
    p: element('p'),
    span: element('span'),
    li: element('li'),
  }
  return {
    animate: actual.animate,
    useMotionValue: actual.useMotionValue,
    motion: elements,
    m: elements,
    AnimatePresence: ({ children }) => <>{children}</>,
    LazyMotion: ({ children }) => <>{children}</>,
    MotionConfig: jest.fn(({ children }) => <>{children}</>),
    useAnimation: () => ({
      start: jest.fn(),
      stop: jest.fn(),
    }),
    useReducedMotion: jest.fn(() => false),
  }
})

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

