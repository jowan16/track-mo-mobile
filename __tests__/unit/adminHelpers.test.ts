import { describe, expect, it } from '@jest/globals'
import {
  adminStatCards,
  escapeHtml,
  filterAccounts,
  filterAuditActions,
  formatLastActive,
  isAccountOnline,
  paginate,
  validateCategoryDraft,
} from '@/utils/adminHelpers'

describe('admin dashboard and account helpers', () => {
  it('maps server statistics to the dashboard cards and tolerates missing data', () => {
    expect(adminStatCards({ total_users: 12, active_users: 8, admins: 2, expenses_count: 47 })).toEqual([
      { label: 'Registered users', value: 12 },
      { label: 'Active users', value: 8 },
      { label: 'Admins', value: 2 },
      { label: 'Expenses logged', value: 47 },
    ])
    expect(adminStatCards(null)[0].value).toBeUndefined()
  })

  it('marks only active accounts with a fresh, unexpired matching session online', () => {
    const now = Date.parse('2026-11-17T00:00:00Z')
    const session = { session_id: 's1', user_id: 'u1', last_seen_at: new Date(now - 30_000).toISOString(), token_expires_at: new Date(now + 60_000).toISOString() }
    expect(isAccountOnline({ id: 'u1', status: 'active' }, [session], now)).toBe(true)
    expect(isAccountOnline({ id: 'u1', status: 'suspended' }, [session], now)).toBe(false)
    expect(isAccountOnline({ id: 'u2', status: 'active' }, [session], now)).toBe(false)
    expect(isAccountOnline({ id: 'u1', status: 'active' }, [{ ...session, last_seen_at: new Date(now - 91_000).toISOString() }], now)).toBe(false)
  })

  it('filters managed accounts by role, status, and case-insensitive search', () => {
    const accounts = [
      { id: '1', role: 'user', status: 'active', full_name: 'Kai Santos', email: 'kai@example.com' },
      { id: '2', role: 'user', status: 'suspended', full_name: 'Mina Cruz', email: 'mina@example.com' },
      { id: '3', role: 'admin', status: 'active', full_name: 'Admin One', email: 'admin@example.com' },
    ]
    expect(filterAccounts(accounts, 'user', 'active', ' KAI ').map((item) => item.id)).toEqual(['1'])
    expect(filterAccounts(accounts, 'admin', 'all', '').map((item) => item.id)).toEqual(['3'])
  })

  it('formats recent activity and missing timestamps', () => {
    const now = Date.parse('2026-11-17T00:00:00Z')
    expect(formatLastActive(new Date(now - 60_000).toISOString(), now)).toBe('1 minute ago')
    expect(formatLastActive(null, now)).toBe('Never active')
    expect(formatLastActive('invalid', now)).toBe('Unavailable')
  })
})

describe('admin audit and report helpers', () => {
  const logs = [
    { id: 1, action: 'User account suspended' },
    { id: 2, action: 'Category updated' },
    { id: 3, action: 'Export completed' },
  ]

  it('filters audit actions by user and category keywords', () => {
    expect(filterAuditActions(logs, 'users').map((log) => log.id)).toEqual([1])
    expect(filterAuditActions(logs, 'categories').map((log) => log.id)).toEqual([2])
    expect(filterAuditActions(logs, 'all')).toHaveLength(3)
  })

  it('paginates a filtered audit list', () => {
    expect(paginate([1, 2, 3, 4, 5], 2, 2)).toEqual([3, 4])
  })

  it('escapes report text before inserting it into HTML', () => {
    expect(escapeHtml(`<Admin & 'Team'>`)).toBe('&lt;Admin &amp; &#39;Team&#39;&gt;')
  })

  it('validates default category names, colors, and picker visibility', () => {
    expect(validateCategoryDraft(
      { id: null, name: ' ', color: 'teal', show: false },
      [],
    )).toEqual({
      name: 'Enter a category name.',
      color: 'Enter a valid hex color, for example #0F766E.',
      show: 'At least one category must stay visible in the picker.',
    })
    expect(validateCategoryDraft(
      { id: null, name: 'Transport', color: '#0f766e', show: true },
      [],
    )).toEqual({})
    expect(validateCategoryDraft(
      { id: null, name: '  transportation  ', color: '#0f766e', show: true },
      [{ id: 1, name: 'Transportation', is_active: true, show_in_picker: true }],
    )).toEqual({ name: 'This category already exists. Please enter a different name.' })
    expect(validateCategoryDraft(
      { id: 1, name: ' transportation ', color: '#0f766e', show: true },
      [{ id: 1, name: 'Transportation', is_active: true, show_in_picker: true }],
    )).toEqual({})
  })
})
