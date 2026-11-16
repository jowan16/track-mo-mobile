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

  it('extracts payment provider, successful status, amount, and merchant from a photographed receipt', () => {
    const parsed = parseReceiptText([
      'BDO Pay',
      'PAYMENT SUCCESSFUL',
      'THE SM STORE',
      'Amount Paid: PHP 500.00',
      'Reference No: 123456789',
      '2026-11-17',
    ].join('\n'))

    expect(parsed.bank_name).toBe('BDO Pay')
    expect(parsed.transaction_status).toBe('Successful')
    expect(parsed.total).toBe(500)
    expect(parsed.merchant_name).toMatch(/SM Store/i)
    expect(parsed.receipt_type).toBe('payment')
    expect(parsed.suggestedCategory).toBe('Shopping')
  })

  it('does not label a pending QR payment as successful', () => {
    const parsed = parseReceiptQR(JSON.stringify({
      bank: 'Maya',
      amount: '125.50',
      status: 'PENDING',
      transactionId: 'pending-123',
    }))

    expect(parsed.bank_name).toBe('Maya')
    expect(parsed.transaction_status).toBe('Pending')
    expect(parsed.receipt_type).toBe('payment')
  })

  it('recognizes failed payment status from OCR text', () => {
    const parsed = parseReceiptText('GCash\nPayment Failed\nAmount: PHP 75.00')
    expect(parsed.bank_name).toBe('GCash')
    expect(parsed.transaction_status).toBe('Failed')
  })
})
