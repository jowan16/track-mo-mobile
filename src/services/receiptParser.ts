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

  // Many local receipts print dates with a two-digit year or an abbreviated
  // month name (for example 11/09/26 or 09 NOV 2026).
  const shortNumeric = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})\b/)
  if (shortNumeric) {
    const month = Number(shortNumeric[1])
    const day = Number(shortNumeric[2])
    const shortYear = Number(shortNumeric[3])
    const year = shortYear <= 79 ? 2000 + shortYear : 1900 + shortYear
    const date = new Date(year, month - 1, day)
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  const monthNames = 'JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER'
  const namedDate = text.match(new RegExp(`\\b(\\d{1,2})[\\s,/-]+(${monthNames})[\\s,/-]+(20\\d{2}|\\d{2})\\b`, 'i'))
    ?? text.match(new RegExp(`\\b(${monthNames})[\\s,/-]+(\\d{1,2}),?[\\s,/-]+(20\\d{2}|\\d{2})\\b`, 'i'))
  if (namedDate) {
    const monthToken = namedDate[2] && /^\\d/.test(namedDate[2]) ? namedDate[1] : namedDate[1]
    const dayToken = namedDate[2] && /^\\d/.test(namedDate[2]) ? namedDate[2] : namedDate[2]
    const yearToken = namedDate[3]
    const monthIndex = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'].findIndex((month) => month === monthToken.slice(0, 3).toUpperCase()) + 1
    const yearNumber = Number(yearToken)
    const year = yearToken.length === 2 ? (yearNumber <= 79 ? 2000 + yearNumber : 1900 + yearNumber) : yearNumber
    const day = Number(dayToken)
    const date = new Date(year, monthIndex - 1, day)
    if (monthIndex > 0 && date.getFullYear() === year && date.getMonth() === monthIndex - 1 && date.getDate() === day) {
      return `${year}-${String(monthIndex).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }
  return ''
}

const merchantFromLines = (lines: string[]) => {
  const pharmacyBrand = /\b(watsons|mercury\s+drug|rose\s+pharmacy|southstar\s+drug|generika|the\s+generic\s+pharmacy|tgp|medexpress|med\s+plus|healthway|farmacia)\b/i
  const explicit = lines.find((line) => /^(?:merchant|store|branch|establishment)\s*[:：-]\s*.+/i.test(line))
  if (explicit) return explicit.replace(/^(?:merchant|store|branch|establishment)\s*[:：-]\s*/i, '').trim().slice(0, 100)
  const knownPharmacy = lines.find((line) => pharmacyBrand.test(line))
  if (knownPharmacy) return knownPharmacy.replace(/\s{2,}/g, ' ').trim().slice(0, 100)

  const ignored = /\b(receipt|invoice|official|sales\s+invoice|vat\s+reg|tin|cashier|terminal|date|time|tel|telephone|address|branch\s+no|transaction|customer|thank\s+you|bir|pos|serial)\b/i
  const candidates = lines.filter((line) => {
    const letters = (line.match(/[A-Za-z]/g) ?? []).length
    return line.length >= 3 && line.length <= 70 && letters >= 3 &&
      !ignored.test(line) && !/\d{3,}/.test(line) &&
      !/^[\W_]+$/.test(line)
  })
  // Merchant names are normally in the first few header lines, before item rows.
  return candidates.slice(0, 5).sort((a, b) => {
    const score = (value: string) => {
      const words = value.trim().split(/\s+/).length
      return (words <= 5 ? 3 : 0) + (value.length <= 40 ? 2 : 0) +
        (/\b(inc|corp|corporation|store|pharmacy|drug|clinic)\b/i.test(value) ? 4 : 0)
    }
    return score(b) - score(a)
  })[0]?.trim().slice(0, 100) ?? ''
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
  const ignored = /\b(sub\s*total|subtotal|grand\s+total|total\s+due|amount\s+due|\btotal\b|vat|tax|change|cash|tendered|discount|receipt|invoice|cashier|terminal|date|time|address|phone|thank you|balance|payment|tin|vatable|senior|pwd|cashier)\b/i
  for (const line of lines) {
    if (ignored.test(line) || line.length < 3) continue
    const amountMatches = [...line.matchAll(/(?:₱|PHP\s*)?([0-9][0-9,]*(?:\.\d{2})?)\s*$/gi)]
    if (!amountMatches.length) continue
    const match = amountMatches[amountMatches.length - 1]
    const lineTotal = money(match[1])
    const name = line.slice(0, match.index).replace(/[|*•-]+$/g, '').trim()
    if (!name || name.length < 2 || lineTotal === null || lineTotal <= 0) continue
    const qtyPrefix = name.match(/^([0-9]+(?:\.[0-9]+)?)\s*[xX]\s*(.+)$/)
    const qtySuffix = name.match(/^(.+?)\s+([0-9]+(?:\.[0-9]+)?)$/)
    const quantity = qtyPrefix ? Number(qtyPrefix[1]) : qtySuffix ? Number(qtySuffix[2]) : 1
    const itemName = (qtyPrefix ? qtyPrefix[2] : qtySuffix ? qtySuffix[1] : name).replace(/\s{2,}/g, ' ').trim()
    if (/^(cash|change|tendered|balance)$/i.test(itemName)) continue
    itemLines.push({ item_name: itemName.slice(0, 200), quantity: quantity > 0 ? quantity : 1, unit_price: quantity > 0 ? Math.round((lineTotal / quantity) * 100) / 100 : lineTotal, line_total: lineTotal })
  }

  // Some OCR responses put the item name and its price on separate lines.
  // Pair a plausible product line with the following standalone amount when
  // the normal same-line receipt-item parser found nothing.
  if (itemLines.length === 0) {
    const standaloneAmount = /^(?:₱|PHP\s*)?([0-9][0-9,]*(?:\.\d{2})?)$/i
    const itemHeader = /\b(sub\s*total|subtotal|grand\s+total|total|vat|tax|change|cash|tendered|discount|receipt|invoice|cashier|terminal|date|time|address|phone|thank you|balance|payment|tin|vatable|senior|pwd|store|branch|official|transaction)\b/i
    for (let index = 0; index < lines.length - 1; index += 1) {
      const name = lines[index].trim()
      const amountMatch = lines[index + 1].trim().match(standaloneAmount)
      const letterCount = (name.match(/[A-Za-z]/g) ?? []).length
      if (!amountMatch || letterCount < 3 || name.length > 100 || itemHeader.test(name)) continue
      const lineTotal = money(amountMatch[1])
      if (lineTotal === null || lineTotal <= 0) continue
      itemLines.push({
        item_name: name.slice(0, 200),
        quantity: 1,
        unit_price: lineTotal,
        line_total: lineTotal,
      })
      index += 1
    }
  }

  const merchant = merchantFromLines(lines)
  const categoryText = `${merchant}\n${full}`.toLowerCase()
  const medicineTerms = /\b(pharmacy|drugstore|drug\s+store|medicine|medicines|medical|pharmaceutical|watsons|mercury\s+drug|rose\s+pharmacy|southstar|generika|tgp|medexpress|biogesic|neozep|bioflu|medicol|alaxan|kremil[- ]?s|dolfenal|paracetamol|acetaminophen|ibuprofen|mefenamic|amoxicillin|antibiotic|antihistamine|cetirizine|loratadine|lagundi|antacid|capsule|capsules|tablet|tablets|syrup|ointment|vitamin\s+[a-z])\b/i
  const suggestedCategory =
    medicineTerms.test(categoryText) ? 'Medicine'
    : /\b(supermarket|grocery|groceries|rice|milk|bread|eggs|vegetable|meat|fish|market)\b/i.test(categoryText) ? 'Food & Water'
    : /\b(clothing|apparel|shirt|pants|shoes|department store|school supplies|notebook|stationery)\b/i.test(categoryText) ? 'Shopping'
    : /\b(restaurant|cafe|coffee|fast food|foodpanda|grabfood)\b/i.test(categoryText) ? 'Food & Water'
    : 'Others'

  return { merchant_name: merchant, receipt_date: date, subtotal, tax, total, items: itemLines, suggestedCategory, payment_method }
}
