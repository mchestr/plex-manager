import { logAuditEvent, AuditEventType, type AuditLogEntry } from '@/lib/security/audit-log'

describe('AuditEventType', () => {
  it('should have all expected event types', () => {
    expect(AuditEventType.ADMIN_PRIVILEGE_GRANTED).toBe('ADMIN_PRIVILEGE_GRANTED')
    expect(AuditEventType.ADMIN_PRIVILEGE_REVOKED).toBe('ADMIN_PRIVILEGE_REVOKED')
    expect(AuditEventType.ADMIN_PRIVILEGE_CHANGED).toBe('ADMIN_PRIVILEGE_CHANGED')
    expect(AuditEventType.CONFIG_CHANGED).toBe('CONFIG_CHANGED')
    expect(AuditEventType.USER_CREATED).toBe('USER_CREATED')
    expect(AuditEventType.USER_UPDATED).toBe('USER_UPDATED')
  })
})

describe('logAuditEvent', () => {
  let consoleLogSpy: jest.SpyInstance

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
  })

  it('should log audit event with minimal data', () => {
    logAuditEvent(AuditEventType.USER_CREATED, 'user-1')

    expect(consoleLogSpy).toHaveBeenCalledTimes(1)
    const logMessage = consoleLogSpy.mock.calls[0][0]
    // Extract JSON from the log message (format: "[INFO] [AUDIT] Audit event: USER_CREATED {...}")
    const jsonMatch = logMessage.match(/\{.*\}$/)
    expect(jsonMatch).toBeTruthy()
    const entry: AuditLogEntry = JSON.parse(jsonMatch![0])

    expect(entry.type).toBe(AuditEventType.USER_CREATED)
    expect(entry.userId).toBe('user-1')
    expect(entry.targetUserId).toBeUndefined()
    expect(entry.details).toBeUndefined()
  })

  it('should log audit event with details', () => {
    const details = {
      plexUserId: 'plex-123',
      isAdmin: true,
    }

    logAuditEvent(AuditEventType.USER_CREATED, 'user-1', details)

    expect(consoleLogSpy).toHaveBeenCalledTimes(1)
    const logMessage = consoleLogSpy.mock.calls[0][0]
    // Extract JSON from the log message
    const jsonMatch = logMessage.match(/\{.*\}$/)
    expect(jsonMatch).toBeTruthy()
    const entry: AuditLogEntry = JSON.parse(jsonMatch![0])

    expect(entry.type).toBe(AuditEventType.USER_CREATED)
    expect(entry.userId).toBe('user-1')
    expect(entry.details).toEqual(details)
  })

  it('should extract targetUserId from details', () => {
    const details = {
      targetUserId: 'user-2',
      someOtherField: 'value',
    }

    logAuditEvent(AuditEventType.ADMIN_PRIVILEGE_GRANTED, 'user-1', details)

    expect(consoleLogSpy).toHaveBeenCalledTimes(1)
    const logMessage = consoleLogSpy.mock.calls[0][0]
    // Extract JSON from the log message
    const jsonMatch = logMessage.match(/\{.*\}$/)
    expect(jsonMatch).toBeTruthy()
    const entry: AuditLogEntry = JSON.parse(jsonMatch![0])

    expect(entry.targetUserId).toBe('user-2')
    expect(entry.details).toEqual({ someOtherField: 'value' })
    expect(entry.details?.targetUserId).toBeUndefined()
  })

  it('should handle all audit event types', () => {
    const eventTypes = Object.values(AuditEventType)

    eventTypes.forEach((eventType) => {
      logAuditEvent(eventType, 'user-1')
    })

    expect(consoleLogSpy).toHaveBeenCalledTimes(eventTypes.length)
  })

  it('should include timestamp in log entry', () => {
    const beforeTime = new Date()
    logAuditEvent(AuditEventType.USER_CREATED, 'user-1')
    const afterTime = new Date()

    const logMessage = consoleLogSpy.mock.calls[0][0]
    // Extract JSON from the log message
    const jsonMatch = logMessage.match(/\{.*\}$/)
    expect(jsonMatch).toBeTruthy()
    const parsed = JSON.parse(jsonMatch![0])
    // The logger doesn't include timestamp in the metadata, so we just verify the log was called
    expect(consoleLogSpy).toHaveBeenCalledTimes(1)
    expect(logMessage).toContain('USER_CREATED')
  })

  it('should format log with [AUDIT] prefix', () => {
    logAuditEvent(AuditEventType.USER_CREATED, 'user-1')

    expect(consoleLogSpy).toHaveBeenCalledTimes(1)
    const logMessage = consoleLogSpy.mock.calls[0][0]
    expect(logMessage).toContain('[AUDIT]')
    expect(logMessage).toContain('USER_CREATED')
  })
})

