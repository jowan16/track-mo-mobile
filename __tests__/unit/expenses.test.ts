import { describe, expect, it } from '@jest/globals'
import {
  localDateString,
  cleanAmount,
  getAmountError,
  getDateError,
} from '@/utils/expenseValidation'

describe('Expense Validation - Unit Tests', () => {
  describe('localDateString()', () => {
    it('should format a date as YYYY-MM-DD', () => {
      expect(localDateString(new Date(2026, 0, 5))).toBe('2026-01-05')
    })
  })

  describe('cleanAmount()', () => {
    it('should remove currency symbols and commas', () => {
      expect(cleanAmount('₱1,500')).toBe('1500')
    })

    it('should preserve valid decimal amounts', () => {
      expect(cleanAmount('1500.75')).toBe('1500.75')
    })

    it('should limit decimal places to two', () => {
      expect(cleanAmount('1500.756')).toBe('1500.75')
    })

    it('should remove additional decimal points', () => {
      expect(cleanAmount('100.50.25')).toBe('100.50')
    })
  })

  describe('getAmountError()', () => {
    it('should reject an empty amount', () => {
      expect(getAmountError('')).toBe('Enter an amount.')
    })

    it('should reject zero', () => {
      expect(getAmountError('0')).toBe(
        'Amount must be greater than zero.',
      )
    })

    it('should reject invalid characters', () => {
      expect(getAmountError('abc')).toBe(
        'Enter a valid amount with up to 2 decimal places.',
      )
    })

    it('should reject more than two decimal places', () => {
      expect(getAmountError('100.999')).toBe(
        'Enter a valid amount with up to 2 decimal places.',
      )
    })

    it('should reject amounts exceeding the maximum', () => {
      expect(getAmountError('10000000')).toBe(
        'Amount is too large.',
      )
    })

    it('should accept a valid amount', () => {
      expect(getAmountError('1500.50')).toBe('')
    })
  })

  describe('getDateError()', () => {
    it('should reject an incorrectly formatted date', () => {
      expect(getDateError('17-11-2026')).toBe(
        'Enter a valid date in YYYY-MM-DD format.',
      )
    })

    it('should reject an invalid calendar date', () => {
      expect(getDateError('2026-02-30')).toBe(
        'Enter a valid calendar date.',
      )
    })

    it('should reject a future date', () => {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)

      expect(getDateError(localDateString(tomorrow))).toBe(
        'Date cannot be in the future.',
      )
    })

    it('should accept today as a valid date', () => {
      expect(getDateError(localDateString(new Date()))).toBe('')
    })
  })
})
