import { describe, expect, it } from '@jest/globals'
import { parseReceiptQR, parseReceiptText } from '@/services/receiptParser'

describe('receipt parsing', () => {
  it('extracts merchant, date, total, and payment method from OCR text', () => {
    const parsed = parseReceiptText('SM SUPERMARKET\nDate: 2026-02-03\nTOTAL PHP 125.50\nGCASH')
    expect(parsed.merchant_name).toMatch(/SM Supermarket/i)
    expect(parsed.receipt_date).toBe('2026-02-03')
    expect(parsed.total).toBe(125.5)
    expect(parsed.payment_method).toBe('E-wallet')
  })

  it('does not mistake subtotal for the printed receipt total', () => {
    expect(parseReceiptText('Store\nSUBTOTAL 125.00').total).toBeNull()
  })

  it('classifies an ordinary merchant QR as a merchant receipt', () => {
    const parsed = parseReceiptQR('https://merchant.example/pay?amount=50')
    expect(parsed.receipt_type).toBe('merchant')
  })

  it('recognizes a successful payment QR and normalizes bank aliases', () => {
    const parsed = parseReceiptQR(JSON.stringify({ bank: 'BDO', amount: '500', status: 'SUCCESS', transactionId: 'abc' }))
    expect(parsed.receipt_type).toBe('payment')
    expect(parsed.bank_name).toBe('BDO Unibank')
    expect(parsed.total).toBe(500)
  })
})
