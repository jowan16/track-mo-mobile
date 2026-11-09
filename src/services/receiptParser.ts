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
  const ignored = /\b(sub\s*total|subtotal|grand\s+total|total\s+due|amount\s+due|net\s+total|total\s+amount|total|vat|tax|change|cash|tendered|discount|receipt|invoice|cashier|terminal|date|time|address|phone|thank\s+you|balance|payment|tin|vatable|senior|pwd|approval|reference|auth\s+code|card\s+no|transaction|serial|min#)\b/i
  const isPercent = (line: string) => /^[-+]?\s*\d+(?:\.\d+)?\s*%$/.test(line)
  const isQuantity = (line: string) => /^\d+(?:\.\d+)?\s*(?:PCS?|PIECES?|EA|EACH|UNIT|UNITS)?$/i.test(line)

  const isLikelyItemName = (value: string) => {
    const candidate = cleanLine(value)
    const letters = candidate.match(/[A-Za-z]/g) ?? []
    const digits = candidate.match(/\d/g) ?? []
    if (candidate.length < 3 || letters.length < 3 || letters.length < digits.length) return false
    if (ignored.test(candidate)) return false
    if (/\b\d{1,2}:\d{2}(?::\d{2})?\b|\b(?:AM|PM)\b/i.test(candidate)) return false
    if (/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/.test(candidate)) return false
    if (/^[-+\d.,\s:]+$/.test(candidate)) return false
    return true
  }

  const add = (nameValue: string, quantity: number, priceLine: string) => {
    const name = cleanLine(nameValue)
      .replace(/\b\d+(?:\.\d+)?\s*(?:PCS?|PIECES?)\b/ig, '')
      .replace(/^[\d.,\s]+/, '')
      .replace(/[-:]+$/g, '')
      .trim()
    if (!isLikelyItemName(name)) return
    const prices = amountTokens(priceLine)
    if (prices.length < 2) return
    const unit = money(prices[0].raw)
    const printed = money(prices[prices.length - 1].raw)
    if (unit === null || printed === null || unit <= 0 || printed <= 0 || quantity <= 0 || quantity > 100) return
    const calculated = Math.round(unit * quantity * 100) / 100
    const lineTotal = Math.abs(calculated - printed) <= 0.05 ? calculated : printed
    const key = name.toLowerCase() + '|' + lineTotal.toFixed(2)
    if (seen.has(key)) return
    seen.add(key)
    items.push({ item_name: name.slice(0, 200), quantity, unit_price: unit, line_total: lineTotal })
  }

  // First pass: pharmacy/POS layout where quantity is its own OCR line and
  // the following line contains unit price and extended price.
  for (let i = 0; i < lines.length; i += 1) {
    if (!isQuantity(lines[i]) || isPercent(lines[i])) continue
    let nameIndex = i - 1
    while (nameIndex >= 0 && (isPercent(lines[nameIndex]) || isQuantity(lines[nameIndex]))) nameIndex -= 1
    let priceIndex = i + 1
    while (priceIndex < lines.length && isPercent(lines[priceIndex])) priceIndex += 1
    if (nameIndex >= 0 && priceIndex < lines.length && amountTokens(lines[priceIndex]).length >= 2) {
      add(lines[nameIndex], Number(lines[i].match(/^\d+(?:\.\d+)?/)?.[0] ?? 1), lines[priceIndex])
    }
  }

  // Second pass: OCR may put the product name and quantity together, or may
  // separate the product name from a row containing two prices.
  for (let i = 0; i < lines.length; i += 1) {
    const current = lines[i]
    if (ignored.test(current) || isPercent(current)) continue
    const inline = current.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*(?:PCS?|PIECES?|EA|EACH)\s*$/i)
    if (inline) {
      let priceIndex = i + 1
      while (priceIndex < lines.length && isPercent(lines[priceIndex])) priceIndex += 1
      if (priceIndex < lines.length) add(inline[1], Number(inline[2]), lines[priceIndex])
    }

    if (amountTokens(current).length >= 2) {
      const prices = amountTokens(current)
      const prefix = current.slice(0, prices[0].index).trim()
      let name = prefix
      if (name.length < 3 || (name.match(/[A-Za-z]/g) ?? []).length < 3) {
        for (let back = i - 1; back >= Math.max(0, i - 4); back -= 1) {
          if (isPercent(lines[back]) || isQuantity(lines[back]) || !isLikelyItemName(lines[back])) continue
          name = lines[back]
          break
        }
      }
      add(name, 1, current)
    }
  }

  // Do not create guessed item names from arbitrary numbers when no product
  // label was detected. The review form lets the user correct real OCR text.
  return items
}

const totalFromReceiptLines = (lines: string[]) => {
  // Only a printed receipt-total label can populate the Receipt Total field.
  // Never substitute an item price or a sum of extracted item prices.
  const labels = [
    /\bGRAND\s+TOTAL\b/i,
    /\bTOTAL\s+DUE\b/i,
    /\bAMOUNT\s+DUE\b/i,
    /\bBALANCE\s+DUE\b/i,
    /\bNET\s+TOTAL\b/i,
    /\bTOTAL\s+AMOUNT\b/i,
    /\bTOTAL\b/i,
  ]

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (/\bSUB\s*TOTAL\b/i.test(line)) continue

    for (const label of labels) {
      const match = label.exec(line)
      if (!match) continue

      const afterLabel = line.slice((match.index ?? 0) + match[0].length)
      const sameLineAmounts = amountTokens(afterLabel)
      if (sameLineAmounts.length > 0) {
        const value = money(sameLineAmounts[0].raw)
        if (value !== null && value > 0) return value
      }

      // Some receipt OCR layouts put the total amount on the next line.
      // Accept only a single amount on that line to avoid mistaking item rows
      // containing unit price + line price for the receipt total.
      for (let next = i + 1; next <= Math.min(i + 2, lines.length - 1); next += 1) {
        if (/\b(?:CASH|CHANGE|TENDERED|VAT|TAX|SUB\s*TOTAL)\b/i.test(lines[next])) break
        const nextAmounts = amountTokens(lines[next])
        if (nextAmounts.length === 1) {
          const value = money(nextAmounts[0].raw)
          if (value !== null && value > 0) return value
        }
        if (nextAmounts.length > 1) break
      }
    }
  }

  return null
}

export const parseReceiptText = (text: string): ParsedReceipt => {
  const full = text.replace(/\r/g, '\n')
  const lines = full.split('\n').map(cleanLine).filter(Boolean)
  const merchant_name = merchantFromLines(lines)
  const receipt_date = dateFromText(full)
  const items = extractItems(lines)
  const total = totalFromReceiptLines(lines)
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
