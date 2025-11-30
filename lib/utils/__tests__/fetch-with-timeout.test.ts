import { fetchWithTimeout, isTimeoutError } from '../fetch-with-timeout'

// Mock global fetch
const mockFetch = jest.fn()
global.fetch = mockFetch

describe('fetch-with-timeout', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('fetchWithTimeout', () => {
    it('should call fetch with the provided URL and options', async () => {
      const mockResponse = new Response(JSON.stringify({ data: 'test' }), { status: 200 })
      mockFetch.mockResolvedValueOnce(mockResponse)

      const promise = fetchWithTimeout('https://api.example.com/data', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      })

      // Fast-forward timers to ensure any pending operations complete
      jest.runAllTimers()
      const response = await promise

      expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/data', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: expect.any(AbortSignal),
      })
      expect(response).toBe(mockResponse)
    })

    it('should use default timeout of 10000ms', async () => {
      const abortSpy = jest.spyOn(AbortController.prototype, 'abort')
      mockFetch.mockImplementation(() => new Promise(() => {})) // Never resolves

      fetchWithTimeout('https://api.example.com/data')

      // Should not abort before 10000ms
      jest.advanceTimersByTime(9999)
      expect(abortSpy).not.toHaveBeenCalled()

      // Should abort at 10000ms
      jest.advanceTimersByTime(1)
      expect(abortSpy).toHaveBeenCalled()

      abortSpy.mockRestore()
    })

    it('should use custom timeout when provided', async () => {
      const abortSpy = jest.spyOn(AbortController.prototype, 'abort')
      mockFetch.mockImplementation(() => new Promise(() => {})) // Never resolves

      fetchWithTimeout('https://api.example.com/data', { timeoutMs: 5000 })

      // Should not abort before 5000ms
      jest.advanceTimersByTime(4999)
      expect(abortSpy).not.toHaveBeenCalled()

      // Should abort at 5000ms
      jest.advanceTimersByTime(1)
      expect(abortSpy).toHaveBeenCalled()

      abortSpy.mockRestore()
    })

    it('should clear timeout when fetch succeeds', async () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout')
      const mockResponse = new Response('ok', { status: 200 })
      mockFetch.mockResolvedValueOnce(mockResponse)

      const promise = fetchWithTimeout('https://api.example.com/data')
      jest.runAllTimers()
      await promise

      expect(clearTimeoutSpy).toHaveBeenCalled()
      clearTimeoutSpy.mockRestore()
    })

    it('should clear timeout when fetch fails', async () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout')
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const promise = fetchWithTimeout('https://api.example.com/data')
      jest.runAllTimers()

      await expect(promise).rejects.toThrow('Network error')
      expect(clearTimeoutSpy).toHaveBeenCalled()
      clearTimeoutSpy.mockRestore()
    })

    it('should pass through all fetch options except signal', async () => {
      const mockResponse = new Response('ok', { status: 200 })
      mockFetch.mockResolvedValueOnce(mockResponse)

      const promise = fetchWithTimeout('https://api.example.com/data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': 'secret',
        },
        body: JSON.stringify({ key: 'value' }),
        credentials: 'include',
        timeoutMs: 15000,
      })

      jest.runAllTimers()
      await promise

      expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': 'secret',
        },
        body: JSON.stringify({ key: 'value' }),
        credentials: 'include',
        signal: expect.any(AbortSignal),
      })
    })

    it('should work with empty options', async () => {
      const mockResponse = new Response('ok', { status: 200 })
      mockFetch.mockResolvedValueOnce(mockResponse)

      const promise = fetchWithTimeout('https://api.example.com/data')
      jest.runAllTimers()
      const response = await promise

      expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/data', {
        signal: expect.any(AbortSignal),
      })
      expect(response).toBe(mockResponse)
    })

    it('should throw AbortError when timeout is reached', async () => {
      const abortError = new Error('Aborted')
      abortError.name = 'AbortError'
      mockFetch.mockImplementation((_url, options) => {
        return new Promise((_, reject) => {
          options?.signal?.addEventListener('abort', () => {
            reject(abortError)
          })
        })
      })

      const promise = fetchWithTimeout('https://api.example.com/data', { timeoutMs: 1000 })

      jest.advanceTimersByTime(1000)

      await expect(promise).rejects.toThrow('Aborted')
      await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    })
  })

  describe('isTimeoutError', () => {
    it('should return true for AbortError', () => {
      const error = new Error('Aborted')
      error.name = 'AbortError'
      expect(isTimeoutError(error)).toBe(true)
    })

    it('should return false for other errors', () => {
      const error = new Error('Network error')
      expect(isTimeoutError(error)).toBe(false)
    })

    it('should return false for TypeError', () => {
      const error = new TypeError('Invalid URL')
      expect(isTimeoutError(error)).toBe(false)
    })

    it('should return false for non-Error objects', () => {
      expect(isTimeoutError('AbortError')).toBe(false)
      expect(isTimeoutError({ name: 'AbortError' })).toBe(false)
      expect(isTimeoutError(null)).toBe(false)
      expect(isTimeoutError(undefined)).toBe(false)
    })
  })
})
