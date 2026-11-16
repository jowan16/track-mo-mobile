const LIGHT_COLORS = {
  canvas: '#f6f7f5',
  ink: '#14201c',
  muted: '#4b5754',
  line: '#e4e8e5',
  brand: '#0f766e',
  danger: '#b42318',
  orange: '#c2410c',
}

export function getCOLORS(dark: boolean) {
  return dark
    ? {
        canvas: '#101a18',
        ink: '#edf5f1',
        muted: '#a9b8b1',
        line: '#30413a',
        brand: '#55c6b0',
        danger: '#ff8178',
        orange: '#ffad70',
      }
    : LIGHT_COLORS
}

export function peso(value: number) {
  return `₱ ${value.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function categorySymbol(icon: string) {
  const symbols: Record<string, string> = {
    bus: '↔',
    'plus-square': '+',
    utensils: '♨',
    zap: 'ϟ',
    play: '▶',
    'shopping-bag': '▣',
    home: '⌂',
    coins: '◉',
    'piggy-bank': '●',
  }

  return symbols[icon] ?? '●'
}

export function cleanAmount(value: string) {
  let cleaned = value.replace(/[^\d.]/g, '')
  const firstDot = cleaned.indexOf('.')

  if (firstDot !== -1) {
    cleaned =
      cleaned.slice(0, firstDot + 1) +
      cleaned.slice(firstDot + 1).replace(/\./g, '')
  }

  const parts = cleaned.split('.')

  if (parts.length === 2) {
    cleaned = `${parts[0]}.${parts[1].slice(0, 2)}`
  }

  return cleaned
}

export function monthRange(year: number, month: number) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const nextMonth = new Date(year, month, 1)
  const to = `${nextMonth.getFullYear()}-${String(
    nextMonth.getMonth() + 1,
  ).padStart(2, '0')}-01`

  return { from, to }
}
