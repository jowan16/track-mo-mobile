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
  const cleaned = value.replace(/[₱$€£,\s]/g, '').replace(/[Oo](?=\d)/g, '0').replace(/[Il](?=\d)/g, '1').replace(/[A-Za-z]+$/g, '')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

const amountTokens = (line: string) => {
  if (/[-+]?\s*\d+(?:\.\d+)?\s*%/.test(line)) return []
  const pattern = /(?:₱|PHP\s*|P\s*)?(\d[\d,]*\.\d{2})(?=[A-Za-z]|\b)/gi
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
  const months: Record<string, string> = { JAN:'01', FEB:'02', MAR:'03', APR:'04', MAY:'05', JUN:'06', JUL:'07', AUG:'08', SEP:'09', OCT:'10', NOV:'11', DEC:'12' }
  const named = text.match(/\b(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER|JAN|FEB|MAR|APR|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{1,2}),?\s+(20\d{2}|\d{2})\b/i)
  return named ? toIsoDate(named[3], months[named[1].slice(0, 3).toUpperCase()], named[2]) : ''
}

const merchantFromLines = (lines: string[]) => {
  const header = lines.slice(0, 18).join(' ')
  const known = header.match(/\b(la\s+nueva\s+pharmacy|watsons|mercury\s+drug|rose\s+pharmacy|southstar\s+drug|generika|the\s+generic\s+pharmacy|tgp|medexpress|sm\s+(?:supermarket|hypermarket|store)|puregold|robinsons(?:\s+supermarket)?|gaisano|7[\s-]?eleven|alfamart|savemore|metro\s+supermarket|rustan'?s|jollibee|mcdonald'?s|mang\s+inasal|chowking|cebuana|lbc)\b/i)
  if (known) return known[0].replace(/\s+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
  const ignored = /\b(receipt|invoice|sales|serial|tin|cashier|terminal|date|time|address|transaction|customer|thank|bir|pos)\b/i
  return lines.slice(0, 8).find((line) => (line.match(/[A-Za-z]/g) ?? []).length >= 5 && line.length <= 70 && !ignored.test(line) && !/\d{5,}/.test(line)) ?? ''
}

const isPercentLine = (line: string) => /^[-+]?\s*\d+(?:\.\d+)?\s*%$/.test(line)
const isQuantityLine = (line: string) => /^\d+(?:\.\d+)?\s*(?:PCS?|PIECES?)$/i.test(line)

const extractItems = (lines: string[]): ParsedReceiptItem[] => {
  const items: ParsedReceiptItem[] = []
  const seen = new Set<string>()
  const ignored = /\b(sub\s*total|subtotal|grand\s+total|total\s+due|amount\s+due|net\s+total|total\s+amount|total|vat|tax|change|cash|tendered|discount|receipt|invoice|cashier|terminal|date|time|address|phone|thank\s+you|balance|payment|tin|vatable|senior|pwd|approval|reference|auth\s+code|card\s+no|transaction)\b/i

  const addItem = (nameValue: string, quantity: number, priceLine: string) => {
    const name = cleanLine(nameValue).replace(/^[\d.,\s]+/, '').replace(/[-:]+$/g, '').trim()
    if (name.length < 2 || (name.match(/[A-Za-z]/g) ?? []).length < 2 || ignored.test(name)) return
    const prices = amountTokens(priceLine)
    if (prices.length < 2) return
    const unitPrice = money(prices[0].raw)
    const printedLineTotal = money(prices[prices.length - 1].raw)
    if (unitPrice === null || printedLineTotal === null || unitPrice <= 0 || quantity <= 0) return
    // Use unit price × quantity when OCR has confused the final digit of the
    // printed extension (common with letters such as V/N beside the amount).
    const calculated = Math.round(unitPrice * quantity * 100) / 100
    const lineTotal = Math.abs(calculated - printedLineTotal) <= 0.02 ? calculated : printedLineTotal
    const key = name.toLowerCase() + '|' + lineTotal.toFixed(2)
    if (seen.has(key)) return
    seen.add(key)
    items.push({ item_name: name.slice(0, 200), quantity, unit_price: unitPrice, line_total: lineTotal })
  }

  for (let i = 0; i < lines.length; i += 1) {
    // Layout A: product name, discount, quantity, then unit price + extension.
    if (isQuantityLine(lines[i])) {
      let nameIndex = i - 1
      while (nameIndex >= 0 && isPercentLine(lines[nameIndex])) nameIndex -= 1
      let priceIndex = i + 1
      while (priceIndex < Math.min(lines.length, i + 4) && isPercentLine(lines[priceIndex])) priceIndex += 1
      if (nameIndex >= 0 && priceIndex < lines.length) {
        addItem(lines[nameIndex], Number(lines[i].match(/^\d+(?:\.\d+)?/)?.[0] ?? 1), lines[priceIndex])
      }
      continue
    }

    // Layout B: OCR occasionally merges the name and quantity onto one line.
    const combined = lines[i].match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*(?:PCS?|PIECES?)\s*$/i)
    if (combined) {
      let priceIndex = i + 1
      while (priceIndex < Math.min(lines.length, i + 4) && isPercentLine(lines[priceIndex])) priceIndex += 1
      if (priceIndex < lines.length) addItem(combined[1], Number(combined[2]), lines[priceIndex])
    }
  }

  // Fallback only accepts rows with a clear product name and two prices;
  // this avoids mistaking VAT rates, invoice numbers, or random OCR fragments.
  if (!items.length) {
    for (const line of lines) {
      if (ignored.test(line) || isPercentLine(line)) continue
      const prices = amountTokens(line)
      if (prices.length < 2) continue
      const name = line.slice(0, prices[0].index).trim()
      const values = prices.map((entry) => money(entry.raw))
      if (name.length < 2 || (name.match(/[A-Za-z]/g) ?? []).length < 2 || values.some((value) => value === null)) continue
      const unit = values[0] as number
      const total = values[values.length - 1] as number
      if (unit <= 0 || total <= 0) continue
      const key = name.toLowerCase() + '|' + total.toFixed(2)
      if (seen.has(key)) continue
      seen.add(key)
      items.push({ item_name: name.slice(0, 200), quantity: Math.max(1, Math.round(total / unit)), unit_price: unit, line_total: total })
    }
  }
  return items
}

const totalFromReceiptLines = (lines: string[]) => {
  const totalLabel = /^(?:grand\s+)?total\b/i
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (!totalLabel.test(line) || /\b(items?|qty|quantity|discount)\b/i.test(line)) continue
    const sameLine = amountTokens(line.replace(totalLabel, ''))
    if (sameLine.length) return money(sameLine[0].raw)
    for (let j = i + 1; j < Math.min(lines.length, i + 4); j += 1) {
      if (/\b(cash|change|vat|tax|non[- ]taxable|vatable|transaction|customer|cashier)\b/i.test(lines[j]) || isPercentLine(lines[j])) continue
      const values = amountTokens(lines[j])
      if (values.length) return money(values[0].raw)
    }
  }

  // Last-resort receipt arithmetic: cash received less change equals total.
  let cash: number | null = null
  let change: number | null = null
  for (const line of lines) {
    const values = amountTokens(line)
    if (/\bCASH\b/i.test(line) && values.length) cash = money(values[0].raw)
    if (/\bCHANGE\b/i.test(line) && values.length) change = money(values[0].raw)
  }
  return cash !== null && change !== null && cash >= change
    ? Math.round((cash - change) * 100) / 100
    : null
}

export const parseReceiptText = (text: string): ParsedReceipt => {
  const full = text.replace(/\r/g, '\n')
  const lines = full.split('\n').map(cleanLine).filter(Boolean)
  const merchant_name = merchantFromLines(lines)
  const receipt_date = dateFromText(full)
  const total = totalFromReceiptLines(lines)
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

  return { merchant_name, receipt_date, subtotal: null, tax: null, total, items, suggestedCategory, payment_method }
}
