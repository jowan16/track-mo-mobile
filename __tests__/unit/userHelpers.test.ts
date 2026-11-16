import { describe, expect, it } from '@jest/globals'
import { archiveDateLabel, archiveMonthLabel, csvCell, htmlText, retainValidSelections, toggleSelection, validateProfileChanges } from '@/utils/userHelpers'

describe('category selection helpers', () => {
  it('toggles a category without mutating the original set', () => {
    const current = new Set([1])
    expect([...toggleSelection(current, 2)]).toEqual([1, 2])
    expect([...toggleSelection(current, 1)]).toEqual([])
    expect([...current]).toEqual([1])
  })

  it('removes selected ids that are no longer available', () => {
    expect([...retainValidSelections(new Set([1, 2, 3]), [2, 3, 4])]).toEqual([2, 3])
  })
})

describe('report export formatting', () => {
  it('quotes CSV values and doubles embedded quotes', () => {
    expect(csvCell('a,"b')).toBe('"a,""b"')
    expect(csvCell(null)).toBe('""')
  })

  it('escapes HTML report values', () => {
    expect(htmlText(`<A & 'B'>`)).toBe('&lt;A &amp; &#39;B&#39;&gt;')
  })
})

describe('settings profile validation', () => {
  it('requires a name and enforces the maximum name length', () => {
    expect(validateProfileChanges('  ', '', '')).toBe('Please enter your full name.')
    expect(validateProfileChanges('x'.repeat(61), '', '')).toBe('Your name must not exceed 60 characters.')
  })

  it('allows unchanged passwords or validates a requested password change', () => {
    expect(validateProfileChanges('Kai', '', '')).toBe('')
    expect(validateProfileChanges('Kai', 'short', 'short')).toMatch(/at least 8 characters/)
    expect(validateProfileChanges('Kai', 'Password1', 'Password2')).toMatch(/do not match/)
    expect(validateProfileChanges('Kai', 'Password1', 'Password1')).toBe('')
  })
})

describe('archive date labels', () => {
  it('formats expense dates and archived budget months for display', () => {
    expect(archiveDateLabel('2026-11-17')).toContain('Nov')
    expect(archiveMonthLabel(2, 2026)).toContain('February')
    expect(archiveMonthLabel(2, 2026)).toContain('2026')
  })
})
