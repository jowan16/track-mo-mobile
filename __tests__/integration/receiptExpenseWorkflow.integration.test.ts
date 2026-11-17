import { describe, expect, it } from '@jest/globals'
import { parseReceiptQR, parseReceiptText } from '@/services/receiptParser'
import { getAmountError, getDateError } from '@/utils/expenseValidation'

/**
 * Workflow-level integration coverage for the receipt recognition output that
 * is handed to the expense form. These tests use the real parser and validators;
 * they do not call a camera, OCR provider, Supabase, or production service.
 */
describe('receipt recognition to expense form workflow', () => {
  it('accepts a normal OCR receipt when the parsed amount and date are valid', () => {
    const receipt = parseReceiptText([
      'SM SUPERMARKET',
      'Date: 2026-02-03',
      'TOTAL PHP 125.50',
      'Cash',
    ].join('\n'))

    expect(receipt.merchant_name).toMatch(/SM Supermarket/i)
    expect(receipt.total).toBe(125.5)
    expect(receipt.receipt_date).toBe('2026-02-03')
    expect(getAmountError(String(receipt.total))).toBe('')
    expect(getDateError(receipt.receipt_date)).toBe('')
  })

  it('accepts a confirmed QR payment payload through expense amount and date validation', () => {
    const receipt = parseReceiptQR(JSON.stringify({
      bank: 'BDO',
      amount: '500.00',
      status: 'SUCCESS',
      transactionId: 'test-reference-001',
      date: '2026-02-03',
    }))

    expect(receipt.receipt_type).toBe('payment')
    expect(receipt.bank_name).toBe('BDO Unibank')
    expect(receipt.transaction_status).toBe('Successful')
    expect(receipt.total).toBe(500)
    expect(getAmountError(String(receipt.total))).toBe('')
    expect(getDateError(receipt.receipt_date)).toBe('')
  })

  it('does not convert an ordinary merchant QR into a successful payment', () => {
    const receipt = parseReceiptQR('https://merchant.example/pay?amount=50')

    expect(receipt.receipt_type).toBe('merchant')
    expect(receipt.transaction_status).toBe('')
    expect(receipt.bank_name).toBe('')
  })

  it('keeps missing or unrecognized receipt totals invalid for expense entry', () => {
    const receipt = parseReceiptText('SM STORE\nDate: 2026-02-03\nSubtotal 125.50')

    expect(receipt.total).toBeNull()
    expect(getAmountError(receipt.total === null ? '' : String(receipt.total))).toBe('Enter an amount.')
  })

  it('does not treat a future receipt date as a valid expense date', () => {
    const receipt = parseReceiptText('SM STORE\nDate: 2099-02-03\nTOTAL PHP 125.50')

    expect(receipt.receipt_date).toBe('2099-02-03')
    expect(getDateError(receipt.receipt_date)).toBe('Date cannot be in the future.')
  })
})
