export type ParsedReceiptItem = {
  item_name: string
  quantity: number
  unit_price: number | null
  line_total: number | null
}

export type ParsedReceipt = {
  merchant_name: string
  receipt_date: string
  subtotal: number | null
  tax: number | null
  total: number | null
  items: ParsedReceiptItem[]
  suggestedCategory: string
  payment_method: string
}

const money = (value: string) => {
  const cleaned = value.replace(/[₱$€£,\s]/g, '').replace(/[Oo](?=\d)/g, '0')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

const dateFromText = (text: string) => {
  const patterns = [
    /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/,
    /\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (!match) continue
    const year = pattern === patterns[0] ? Number(match[1]) : Number(match[3])
    const month = pattern === patterns[0] ? Number(match[2]) : Number(match[1])
    const day = pattern === patterns[0] ? Number(match[3]) : Number(match[2])
    const date = new Date(year, month - 1, day)
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }
  const monthMatch = text.match(/\b(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+(\d{1,2}),?\s+(20\d{2})\b/i)
  if (monthMatch) {
    const month = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'].indexOf(monthMatch[1].toUpperCase()) + 1
    return `${monthMatch[3]}-${String(month).padStart(2, '0')}-${String(Number(monthMatch[2])).padStart(2, '0')}`
  }
  return new Date().toISOString().slice(0, 10)
}

export function parseReceiptText(rawText: string): ParsedReceipt {
  const lines = rawText.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const full = lines.join('\n')
  const date = dateFromText(full)
  const findAmount = (patterns: RegExp[]) => {
    for (const line of lines) {
      if (!patterns.some((pattern) => pattern.test(line))) continue
      const matches = line.match(/(?:₱|PHP\s*)?\d[\d,]*(?:\.\d{2})?/gi)
      if (matches?.length) {
        const amount = money(matches[matches.length - 1])
        if (amount !== null) return amount
      }
    }
    return null
  }
  const total = findAmount([/\b(grand\s+total|total\s+due|amount\s+due|total)\b/i])
  const subtotal = findAmount([/\b(sub\s*total|subtotal)\b/i])
  const tax = findAmount([/\b(vat|tax)\b/i])
  const payment_method = /\b(GCASH|MAYA|PAYMAYA|E-WALLET)\b/i.test(full) ? 'E-wallet'
    : /\b(VISA|MASTERCARD|MASTER CARD|DEBIT|CREDIT)\b/i.test(full) ? 'Card'
    : /\b(BANK TRANSFER|ONLINE TRANSFER)\b/i.test(full) ? 'Bank transfer'
    : /\b(CASH|CHANGE|TENDERED)\b/i.test(full) ? 'Cash' : ''

  const itemLines: ParsedReceiptItem[] = []
  const ignored = /\b(sub\s*total|subtotal|grand\s+total|total\s+due|amount\s+due|\btotal\b|vat|tax|change|cash|tendered|discount|receipt|invoice|cashier|terminal|date|time|address|phone|thank you|balance|payment)\b/i
  for (const line of lines) {
    if (ignored.test(line) || line.length < 3) continue
    const amountMatches = [...line.matchAll(/(?:₱|PHP\s*)?([0-9][0-9,]*\.\d{2})\s*$/gi)]
    if (!amountMatches.length) continue
    const match = amountMatches[amountMatches.length - 1]
    const lineTotal = money(match[1])
    const name = line.slice(0, match.index).replace(/[|*•-]+$/g, '').trim()
    if (!name || name.length < 2 || lineTotal === null || lineTotal <= 0) continue
    const qtyMatch = name.match(/^([0-9]+(?:\.[0-9]+)?)\s*[xX]\s*(.+)$/)
    const quantity = qtyMatch ? Number(qtyMatch[1]) : 1
    const itemName = (qtyMatch ? qtyMatch[2] : name).replace(/\s{2,}/g, ' ').trim()
    if (/^(cash|change|tendered|balance)$/i.test(itemName)) continue
    itemLines.push({ item_name: itemName.slice(0, 200), quantity: quantity > 0 ? quantity : 1, unit_price: quantity > 0 ? Math.round((lineTotal! / quantity) * 100) / 100 : lineTotal, line_total: lineTotal })
  }

  const merchant = lines.find((line) =>
    line.length >= 3 && line.length <= 70 &&
    !/\d{2,}/.test(line) &&
    !/\b(receipt|invoice|official receipt|vat reg|tin|cashier|terminal|date|time|tel|address)\b/i.test(line)
  ) ?? ''

  const categoryText = full.toLowerCase()
  const suggestedCategory =
    /pharmacy|drugstore|medicine|medical|watsons|mercury drug|rose pharmacy/.test(categoryText) ? 'Medicine'
    : /supermarket|grocery|groceries|rice|milk|bread|eggs|vegetable|meat|fish|market/.test(categoryText) ? 'Food & Water'
    : /clothing|apparel|shirt|pants|shoes|department store|school supplies|notebook|stationery/.test(categoryText) ? 'Shopping'
    : /restaurant|cafe|coffee|fast food|foodpanda|grabfood/.test(categoryText) ? 'Food & Water'
    : 'Others'

  return { merchant_name: merchant, receipt_date: date, subtotal, tax, total, items: itemLines, suggestedCategory, payment_method }
}
