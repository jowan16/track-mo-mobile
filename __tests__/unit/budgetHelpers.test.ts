import { describe, expect, it } from '@jest/globals'
import { categorySymbol, cleanAmount, monthRange, peso } from '@/utils/budgetHelpers'

describe('budget helpers', () => {
  it('formats amounts in Philippine pesos with two decimals', () => {
    expect(peso(1250)).toBe('₱ 1,250.00')
  })

  it('uses a fallback symbol for unknown category icons', () => {
    expect(categorySymbol('bus')).toBe('↔')
    expect(categorySymbol('missing')).toBe('●')
  })

  it('cleans an amount while preserving at most two decimals', () => {
    expect(cleanAmount('₱1,200.459')).toBe('1200.45')
  })

  it('returns a half-open month range and handles December rollover', () => {
    expect(monthRange(2026, 12)).toEqual({ from: '2026-12-01', to: '2027-01-01' })
  })
})
