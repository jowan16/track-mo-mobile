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

const cleanLine = (value: string) =>
  value.replace(/[|¦]/g, ' ').replace(/\s+/g, ' ').trim()

const money = (value: string): number | null => {
  const cleaned = value.replace(/[₱$€£,\s]/g, '').replace(/[Oo](?=\d)/g, '0').replace(/[Il](?=\d)/g, '1')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

const amountTokens = (line: string) => {
  if (/[-+]?\s*\d+(?:\.\d+)?\s*%/.test(line)) return []
  const pattern = /(?:₱|PHP\s*|P\s*)?(\d[\d,]*\.\d{2})/gi
  return [...line.matchAll(pattern)].map((match) => ({
    raw: match[1],
    index: match.index ?? 0,
  }))
}

const toIsoDate = (yearValue: string, monthValue: string, dayValue: string) => {
  const shortYear = Number(yearValue)
  const year = yearValue.length === 2 ? (shortYear <= 79 ? 2000 + shortYear : 1900 + shortYear) : shortYear
  const month = Number(monthValue)
  const day = Number(dayValue)
  const date = new Date(year, month - 1, day)
  if (month < 1 || month > 12 || day < 1 || day > 31 || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return ''
  return String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0')
}

const dateFromText = (text: string) => {
  const iso = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/)
  if (iso) return toIsoDate(iso[1], iso[2], iso[3])

  const numeric = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2}|\d{2})\b/)
  if (numeric) return toIsoDate(numeric[3], numeric[1], numeric[2])

  const months: Record<string, string> = {
    JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
    JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
  }
  const named = text.match(/\b(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER|JAN|FEB|MAR|APR|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{1,2}),?\s+(20\d{2}|\d{2})\b/i)
  if (named) return toIsoDate(named[3], months[named[1].slice(0, 3).toUpperCase()], named[2])
  return ''
}

const merchantFromLines = (lines: string[]) => {
  const header = lines.slice(0, 15).join(' ')
  const known = header.match(/\b(la\s+nueva\s+pharmacy|watsons|mercury\s+drug|rose\s+pharmacy|southstar\s+drug|generika|the\s+generic\s+pharmacy|tgp|medexpress|sm\s+(?:supermarket|hypermarket|store)|puregold|robinsons(?:\s+supermarket)?|gaisano|7[\s-]?eleven|alfamart|savemore|metro\s+supermarket|rustan'?s|jollibee|mcdonald'?s|mang\s+inasal|chowking|cebuana|lbc)\b/i)
  if (known) return known[0].replace(/\s+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
  const ignored = /\b(receipt|invoice|sales|serial|tin|cashier|terminal|date|time|address|transaction|customer|thank|bir|pos)\b/i
  const candidate = lines.slice(0, 8).find((line) => {
    const letters = (line.match(/[A-Za-z]/g) ?? []).length
    return letters >= 5 && line.length <= 70 && !ignored.test(line) && !/\d{5,}/.test(line)
  })
  return candidate ?? ''
}

const totalFromReceiptLines = (lines: string[]) => {
  const labels = /^(?:(?:grand\s+)?total(?:\s+due|\s+amount)?|amount\s+due|net\s+(?:amount|total)|balance\s+due)\b/i
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (!labels.test(line)) continue
    const label = labels.exec(line)
    const sameLine = amountTokens(line.slice(label?.[0].length ?? 0))
    if (sameLine.length) return money(sameLine[0].raw)
    for (let j = i + 1; j < Math.min(lines.length, i + 4); j += 1) {
      if (/\b(cash|change|vat|tax|non[- ]taxable|vatable|transaction|customer|cashier)\b/i.test(lines[j])) continue
      const values = amountTokens(lines[j])
      if (values.length) return money(values[0].raw)
    }
  }
  return null
}

const extractItems = (lines: string[]): ParsedReceiptItem[] => {
  const items: ParsedReceiptItem[] = []
  const seen = new Set<string>()
  const ignored = /\b(sub\s*total|subtotal|grand\s+total|total\s+due|amount\s+due|net\s+total|total\s+amount|total|vat|tax|change|cash|tendered|discount|receipt|invoice|cashier|terminal|date|time|address|phone|thank\s+you|balance|payment|tin|vatable|senior|pwd|approval|reference|auth\s+code|card\s+no|transaction)\b/i

  // Pharmacy receipts commonly print name, discount, quantity, then two prices.
  for (let i = 0; i < lines.length; i += 1) {
    const qty = lines[i].match(/^(\d+(?:\.\d+)?)\s*(?:PCS?|PIECES?)$/i)
    if (!qty) continue
    const quantity = Number(qty[1])
    let nameIndex = i - 1
    while (nameIndex >= 0 && /^[-+]?\s*\d+(?:\.\d+)?\s*%$/.test(lines[nameIndex])) nameIndex -= 1
    if (nameIndex < 0) continue
    const name = lines[nameIndex].replace(/^[\d.,\s]+/, '').trim()
    if (name.length < 2 || (name.match(/[A-Za-z]/g) ?? []).length < 2 || ignored.test(name)) continue

    let priceIndex = i + 1
    while (priceIndex < Math.min(lines.length, i + 3) && /^[-+]?\s*\d+(?:\.\d+)?\s*%$/.test(lines[priceIndex])) priceIndex += 1
    if (priceIndex >= lines.length) continue
    const prices = amountTokens(lines[priceIndex])
    if (prices.length < 2) continue
    const unitPrice = money(prices[0].raw)
    const lineTotal = money(prices[prices.length - 1].raw)
    if (unitPrice === null || lineTotal === null || lineTotal <= 0) continue
    const key = name.toLowerCase() + '|' + lineTotal.toFixed(2)
    if (seen.has(key)) continue
    seen.add(key)
    items.push({ item_name: name.slice(0, 200), quantity, unit_price: unitPrice, line_total: lineTotal })
  }

  // Fallback for conventional one-line item/price rows.
  if (!items.length) {
    for (const line of lines) {
      if (ignored.test(line) || /[-+]?\s*\d+(?:\.\d+)?\s*%/.test(line)) continue
      const prices = amountTokens(line)
      if (!prices.length) continue
      const last = prices[prices.length - 1]
      const name = line.slice(0, last.index).replace(/[|*•\-:]+$/g, '').trim()
      if (name.length < 2 || (name.match(/[A-Za-z]/g) ?? []).length < 2 || ignored.test(name)) continue
      const total = money(last.raw)
      if (total === null || total <= 0) continue
      const key = name.toLowerCase() + '|' + total.toFixed(2)
      if (seen.has(key)) continue
      seen.add(key)
      items.push({ item_name: name.slice(0, 200), quantity: 1, unit_price: total, line_total: total })
    }
  }
  return items
}

export const parseReceiptText = (text: string): ParsedReceipt => {
  const full = text.replace(/\r/g, '\n')
  const lines = full.split('\n').map(cleanLine).filter(Boolean)
  const merchant_name = merchantFromLines(lines)
  const receipt_date = dateFromText(full)
  const total = totalFromReceiptLines(lines)
  const subtotal = totalFromReceiptLines(lines.filter((line) => !/^total\b/i.test(line)))
  const tax = null
  const items = extractItems(lines)

  const payment_method =
    /\b(GCASH|MAYA|PAYMAYA|E-WALLET)\b/i.test(full) ? 'E-wallet'
    : /\b(VISA|MASTERCARD|MASTER CARD|DEBIT|CREDIT)\b/i.test(full) ? 'Card'
    : /\b(BANK TRANSFER|ONLINE TRANSFER)\b/i.test(full) ? 'Bank transfer'
    : /\b(CASH|CHANGE|TENDERED)\b/i.test(full) ? 'Cash'
    : ''

  const categoryText = (merchant_name + ' ' + full).toLowerCase()
  const suggestedCategory =
    /\b(pharmacy|drugstore|drug\s+store|medicine|medicines|medical|pharmaceutical|watsons|mercury\s+drug|la\s+nueva|tablet|tablets|capsule|capsules)\b/i.test(categoryText) ? 'Medicine'
    : /\b(supermarket|grocery|groceries|rice|milk|bread|eggs|vegetable|meat|fish|market)\b/i.test(categoryText) ? 'Food & Water'
    : /\b(clothing|apparel|shirt|pants|shoes|department store|school supplies|notebook|stationery)\b/i.test(categoryText) ? 'Shopping'
    : /\b(restaurant|cafe|coffee|fast food|foodpanda|grabfood|jollibee|mcdonald)\b/i.test(categoryText) ? 'Food & Water'
    : 'Others'

  return { merchant_name, receipt_date, subtotal, tax, total, items, suggestedCategory, payment_method }
}
