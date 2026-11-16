import { describe, expect, it } from '@jest/globals'
import {
  adminStatsFromRpc,
  categorySummariesFromQuery,
  registeredAccountCount,
  reportStatsFromRpc,
  topCategoriesFromRpc,
  userGrowthFromRpc,
} from '@/utils/adminDashboardCounts'

const validReportStats = { new_users: 3, expenses_count: 12, active_users: 2 }
const validAdminStats = { total_users: 4, active_users: 2, admins: 1, expenses_count: 12 }

describe('registered account count from the shared admin statistics RPC', () => {
  it('accepts a valid numeric account total, including admins', () => {
    expect(registeredAccountCount([{ total_users: 4 }])).toBe(4)
  })

  it('preserves a genuine numeric zero', () => {
    expect(registeredAccountCount([{ total_users: 0 }])).toBe(0)
  })

  it.each([
    ['undefined rows', undefined],
    ['null rows', null],
    ['empty rows', []],
    ['multiple rows', [{ total_users: 4 }, { total_users: 5 }]],
    ['null count', [{ total_users: null }]],
    ['undefined count', [{ total_users: undefined }]],
    ['missing count property', [{}]],
    ['malformed row', [null]],
    ['malformed response object', { total_users: 4 }],
    ['string count', [{ total_users: '4' }]],
    ['negative count', [{ total_users: -1 }]],
    ['NaN count', [{ total_users: Number.NaN }]],
    ['infinite count', [{ total_users: Number.POSITIVE_INFINITY }]],
    ['fractional count', [{ total_users: 1.5 }]],
  ])('rejects %s', (_case, rows) => {
    expect(registeredAccountCount(rows)).toBeNull()
  })
})

describe('System Reports period statistics RPC validation', () => {
  it('accepts exactly one complete report-statistics row', () => {
    expect(reportStatsFromRpc([validReportStats])).toEqual(validReportStats)
  })

  it('preserves genuine zero values', () => {
    const zeroStats = { new_users: 0, expenses_count: 0, active_users: 0 }
    expect(reportStatsFromRpc([zeroStats])).toEqual(zeroStats)
  })

  it.each([
    ['undefined response', undefined],
    ['null response', null],
    ['empty response', []],
    ['multiple rows', [validReportStats, validReportStats]],
    ['malformed response object', validReportStats],
    ['malformed row', [null]],
    ['array row', [[3, 12, 2]]],
  ])('rejects %s', (_case, rows) => {
    expect(reportStatsFromRpc(rows)).toBeNull()
  })

  it.each(['new_users', 'expenses_count', 'active_users'])('rejects a missing %s field', (field) => {
    const row = { ...validReportStats }
    delete row[field as keyof typeof row]
    expect(reportStatsFromRpc([row])).toBeNull()
  })

  it.each(['new_users', 'expenses_count', 'active_users'])('rejects a null %s field', (field) => {
    expect(reportStatsFromRpc([{ ...validReportStats, [field]: null }])).toBeNull()
  })

  it.each([
    ['undefined', undefined],
    ['string', '3'],
    ['negative', -1],
    ['fractional', 1.5],
    ['NaN', Number.NaN],
    ['infinite', Number.POSITIVE_INFINITY],
    ['object', {}],
  ])('rejects %s values in each metric', (_case, value) => {
    for (const field of ['new_users', 'expenses_count', 'active_users'] as const) {
      expect(reportStatsFromRpc([{ ...validReportStats, [field]: value }])).toBeNull()
    }
  })
})

describe('Admin Overview statistics RPC validation', () => {
  it('accepts a complete valid statistics row', () => {
    expect(adminStatsFromRpc([validAdminStats])).toEqual(validAdminStats)
  })

  it('preserves valid zero metrics', () => {
    const zeroStats = { total_users: 0, active_users: 0, admins: 0, expenses_count: 0 }
    expect(adminStatsFromRpc([zeroStats])).toEqual(zeroStats)
  })

  it.each(['total_users', 'active_users', 'admins', 'expenses_count'])('rejects a missing %s field', (field) => {
    const row = { ...validAdminStats }
    delete row[field as keyof typeof row]
    expect(adminStatsFromRpc([row])).toBeNull()
  })

  it('rejects malformed count values instead of passing them to the dashboard', () => {
    expect(adminStatsFromRpc([{ ...validAdminStats, total_users: '4' }])).toBeNull()
    expect(adminStatsFromRpc([{ ...validAdminStats, expenses_count: Number.NaN }])).toBeNull()
    expect(adminStatsFromRpc([{ ...validAdminStats, active_users: -1 }])).toBeNull()
  })
})

describe('Admin System Reports chart data validation', () => {
  it('accepts well-formed bigint category IDs and usage counts', () => {
    expect(topCategoriesFromRpc([{ category_id: 7, uses: 4 }])).toEqual([{ category_id: 7, uses: 4 }])
    expect(topCategoriesFromRpc([{ category_id: 0, uses: 4 }])).toEqual([{ category_id: 0, uses: 4 }])
    expect(topCategoriesFromRpc([])).toEqual([])
  })

  it.each([
    undefined,
    null,
    {},
    [null],
    [[7, 4]],
    [{ category_id: '7', uses: 4 }],
    [{ category_id: Number.MAX_SAFE_INTEGER + 1, uses: 4 }],
    [{ category_id: -1, uses: 4 }],
    [{ category_id: 7, uses: '4' }],
    [{ category_id: 7, uses: -1 }],
    [{ category_id: 7, uses: 1.5 }],
    [{ category_id: 7, uses: Number.NaN }],
    [{ category_id: 7, uses: Number.POSITIVE_INFINITY }],
  ])('rejects malformed top-category responses: %p', (rows) => {
    expect(topCategoriesFromRpc(rows)).toBeNull()
  })

  const validGrowthRows = [
    { label: 'Jan 2026', total: 1 },
    { label: 'Feb 2026', total: 2 },
    { label: 'Mar 2026', total: 3 },
    { label: 'Apr 2026', total: 4 },
    { label: 'May 2026', total: 5 },
    { label: 'Jun 2026', total: 6 },
  ]

  it('accepts the six-month growth window and preserves cumulative zero values', () => {
    const zeroGrowth = validGrowthRows.map((row) => ({ ...row, total: 0 }))
    expect(userGrowthFromRpc(zeroGrowth)).toEqual(zeroGrowth)
  })

  it.each([
    undefined,
    null,
    {},
    [],
    [null, ...validGrowthRows.slice(1)],
    [[ 'Jun 2026', 2 ], ...validGrowthRows.slice(1)],
    validGrowthRows.slice(1),
    [...validGrowthRows, validGrowthRows[5]],
  ])('rejects malformed growth responses: %p', (rows) => {
    expect(userGrowthFromRpc(rows)).toBeNull()
  })

  it.each([
    ['empty label', 'label', ''],
    ['whitespace label', 'label', '   '],
    ['string total', 'total', '2'],
    ['negative total', 'total', -1],
    ['fractional total', 'total', 1.5],
    ['NaN total', 'total', Number.NaN],
    ['infinite total', 'total', Number.POSITIVE_INFINITY],
  ])('rejects a growth row with %s', (_case, field, value) => {
    const rows = validGrowthRows.map((row) => ({ ...row }))
    Object.assign(rows[0], { [field]: value })
    expect(userGrowthFromRpc(rows)).toBeNull()
  })

  it('validates category lookup rows used by charts and exports', () => {
    expect(categorySummariesFromQuery([{ id: 7, name: 'Food', icon: 'fork', color: '#fff' }])).toEqual([
      { id: 7, name: 'Food', icon: 'fork', color: '#fff' },
    ])
    expect(categorySummariesFromQuery([{ id: '7', name: 'Food', icon: 'fork', color: '#fff' }])).toBeNull()
  })
})
