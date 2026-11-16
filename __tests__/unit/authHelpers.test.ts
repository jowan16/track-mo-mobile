import { describe, expect, it } from '@jest/globals'
import { isAdminRole, normalizeAppRole } from '@/utils/authHelpers'

describe('authentication role helpers', () => {
  it('normalizes supported roles without case sensitivity', () => {
    expect(normalizeAppRole('ADMIN')).toBe('admin')
    expect(normalizeAppRole('User')).toBe('user')
  })

  it('rejects unsupported or missing roles and identifies admins', () => {
    expect(normalizeAppRole('owner')).toBeNull()
    expect(normalizeAppRole(null)).toBeNull()
    expect(isAdminRole('ADMIN')).toBe(true)
    expect(isAdminRole('user')).toBe(false)
  })
})
