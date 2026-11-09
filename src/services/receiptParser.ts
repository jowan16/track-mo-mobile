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

const money = (value: string) => {
  const cleaned = value.replace(/[₱$€£,\s]/g, '').replace(/[Oo](?=\d)/g, '0').replace(/[Il](?=\d)/g, '1')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

const toIsoDate = (yearValue: string, monthValue: string, dayValue: string) => {
  const shortYear = Number(yearValue)
  const year = yearValue.length === 2 ? (shortYear <= 79 ? 2000 + shortYear : 1900 + shortYear) : shortYear
  const month = Number(monthValue)
  const day = Number(dayValue)
  const date = new Date(year, month - 1, day)
  if (month < 1 || month > 12 || day < 1 || day > 31 || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return ''
  return String(year) + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0')
}

const dateFromText = (text: string) => {
  const iso = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/)
  if (iso) return toIsoDate(iso[1], iso[2], iso[3])

  // Philippine retail receipts commonly use MM/DD/YY or MM/DD/YYYY.
  const numeric = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2}|\d{2})\b/)
  if (numeric) {
    const parsed = toIsoDate(numeric[3], numeric[1], numeric[2])
    if (parsed) return parsed
  }

  const months: Record<string, string> = {
    JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
    JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
  }
  const named = text.match(/\b(?:(\d{1,2})[\s,/-]+([A-Z]{3,9})|([A-Z]{3,9})[\s,/-]+(\d{1,2})),?[\s,/-]+(20\d{2}|\d{2})\b/i)
  if (named) {
    const day = named[1] ?? named[4]
    const monthName = named[2] ?? named[3]
    const month = months[monthName.slice(0, 3).toUpperCase()]
    if (month) return toIsoDate(named[5], month, day)
  }

  const shortNumeric = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})\b/)
  if (shortNumeric) return toIsoDate(shortNumeric[3], shortNumeric[1], shortNumeric[2])
  return ''
}

const merchantFromLines = (lines: string[]) => {
  const knownMerchant = /\b(la\s+nueva\s+pharmacy|watsons|mercury\s+drug|rose\s+pharmacy|southstar\s+drug|generika|the\s+generic\s+pharmacy|tgp|medexpress|med\s+plus|healthway|farmacia|sm\s+(?:supermarket|hypermarket|store)|puregold|robinsons(?:\s+supermarket)?|gaisano|7[\s-]?eleven|seven[\s-]?eleven|alfamart|savemore|metro\s+supermarket|rustan'?s|jollibee|mcdonald'?s|mang\s+inasal|chowking|cebuana|lbc)\b/i
  const headerLines = lines.slice(0, 12)

  const explicit = headerLines.find((line) => /^(?:merchant|store\s+name|store|establishment)\s*[:：-]\s*.+/i.test(line))
  if (explicit) return explicit.replace(/^(?:merchant|store\s+name|store|establishment)\s*[:：-]\s*/i, '').trim().slice(0, 100)

  const brandMatch = headerLines.join(' ').match(knownMerchant)
  if (brandMatch) return brandMatch[0].replace(/\s+/g, ' ').trim().replace(/\b\w/g, (letter) => letter.toUpperCase())

  const ignored = /\b(receipt|invoice|official\s+receipt|sales\s+invoice|vat\s+reg|tin|cashier|terminal|date|time|tel|telephone|address|branch\s+no|transaction|customer|thank\s+you|bir|pos|serial|order\s+no|table\s+no|queue)\b/i
  const candidates = headerLines
    .map((line) => ({ line }))
    .filter(({ line }) => {
      const letters = (line.match(/[A-Za-z]/g) ?? []).length
      return line.length >= 3 && line.length <= 70 && letters >= 3 && !ignored.test(line) && !/\d{4,}/.test(line) && !/^(?:www\.|https?:|[a-z0-9._%+-]+@[a-z0-9.-]+)/i.test(line)
    })

  const preferred = candidates.find(({ line }) => /\b(inc|corp|corporation|company|store|supermarket|market|pharmacy|drug|restaurant|cafe|café|foods|food|trading)\b/i.test(line))
  return (preferred ?? candidates[0])?.line.slice(0, 100) ?? ''
}

const amountTokens = (line: string) => {
  if (/[-+]?\s*\d+(?:\.\d+)?\s*%/.test(line)) return []
  const pattern = /(?:₱|PHP\s*|P\s*)(\d[\d,]*(?:\.\d{1,2})?)|(\d[\d,]*(?:\.\d{1,2})?)/gi
  return [...line.matchAll(pattern)].map((match) => ({
    raw: match[1] ?? match[2],
    index: match.index ?? 0,
    full: match[0],
  }))
}

const amountAfterLabel = (lines: string[], label: RegExp) => {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]
    const match = label.exec(line)
    if (!match) continue
    const afterLabel = line.slice((match.index ?? 0) + match[0].length)
    const sameLine = amountTokens(afterLabel)
    if (sameLine.length) return money(sameLine[sameLine.length - 1].raw)
    for (let next = index + 1; next < Math.min(lines.length, index + 3); next += 1) {
      const nextAmounts = amountTokens(lines[next])
      if (nextAmounts.length) return money(nextAmounts[nextAmounts.length - 1].raw)
    }
  }
  return null
}

const totalFromReceiptLines = (lines: string[]) => {
  const paymentOrTax = /\b(cash|change|tendered|vat|tax|non[- ]taxable|vatable|transaction|customer|cashier)\b/i
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!/^total\b/i.test(line) || /\b(items?|qty|quantity|discount|savings|before\s+tax)\b/i.test(line)) continue
    const sameLine = amountTokens(line.replace(/^total\b/i, ''))
    if (sameLine.length) return money(sameLine[0].raw)
    for (let next = index + 1; next < Math.min(lines.length, index + 4); next += 1) {
      if (paymentOrTax.test(lines[next])) continue
      const values = amountTokens(lines[next])
      if (values.length) return money(values[0].raw)
    }
  }
  return null
}

const extractItems = (lines: string[]): ParsedReceiptItem[] => {
  const ignored = /\b(sub\s*total|subtotal|grand\s+total|total\s+due|amount\s+due|net\s+total|total\s+amount|total|vat|tax|change|cash|tendered|discount|receipt|invoice|cashier|terminal|date|time|address|phone|thank\s+you|balance|payment|tin|vatable|senior|pwd|approval|reference|auth\s+code|card\s+no|transaction)\b/i
  const items: ParsedReceiptItem[] = []
  const seen = new Set<string>()

  for (const line of lines) {
    if (ignored.test(line) || line.length < 3) continue
    if (/[-+]?\\s*\\d+(?:\\.\\d+)?\\s*%/.test(line)) continue
    if (/[-+]?\s*\d+(?:\.\d+)?\s*%/.test(line)) continue
    const amounts = amountTokens(line)
    if (!amounts.length) continue
    const last = amounts[amounts.length - 1]
    const total =
    amountAfterLabel(lines, /\\b(?:grand\\s+total|total\\s+due|amount\\s+due|balance\\s+due|net\\s+amount|net\\s+total|total\\s+amount)\\b\\s*[:：-]?/i) ??
    totalFromReceiptLines(lines)

  const subtotal = amountAfterLabel(lines, /\b(?:sub\s*total|subtotal)\b\s*[:：-]?/i)
  const tax = amountAfterLabel(lines, /\b(?:vat|tax)\b\s*[:：-]?/i)
  const merchant = merchantFromLines(lines)
  const items = extractItems(lines)

  const payment_method =
    /\b(GCASH|MAYA|PAYMAYA|E-WALLET)\b/i.test(full) ? 'E-wallet'
    : /\b(VISA|MASTERCARD|MASTER CARD|DEBIT|CREDIT)\b/i.test(full) ? 'Card'
    : /\b(BANK TRANSFER|ONLINE TRANSFER)\b/i.test(full) ? 'Bank transfer'
    : /\b(CASH|CHANGE|TENDERED)\b/i.test(full) ? 'Cash'
    : ''

  const categoryText = (merchant + '\n' + full).toLowerCase()
  const medicineTerms = /\b(pharmacy|drugstore|drug\s+store|medicine|medicines|medical|pharmaceutical|watsons|mercury\s+drug|rose\s+pharmacy|southstar|generika|tgp|medexpress|biogesic|neozep|bioflu|medicol|alaxan|kremil[- ]?s|dolfenal|paracetamol|acetaminophen|ibuprofen|mefenamic|amoxicillin|antibiotic|antihistamine|cetirizine|loratadine|lagundi|antacid|capsule|capsules|tablet|tablets|syrup|ointment|vitamin\s+[a-z])\b/i
  const suggestedCategory =
    medicineTerms.test(categoryText) ? 'Medicine'
    : /\b(supermarket|grocery|groceries|rice|milk|bread|eggs|vegetable|meat|fish|market)\b/i.test(categoryText) ? 'Food & Water'
    : /\b(clothing|apparel|shirt|pants|shoes|department store|school supplies|notebook|stationery)\b/i.test(categoryText) ? 'Shopping'
    : /\b(restaurant|cafe|coffee|fast food|foodpanda|grabfood|jollibee|mcdonald)\b/i.test(categoryText) ? 'Food & Water'
    : 'Others'

  return {
    merchant_name: merchant,
    receipt_date: receiptDate,
    subtotal,
    tax,
    total,
    items,
    suggestedCategory,
    payment_method,
  }
}
