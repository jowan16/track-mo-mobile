export function localDateString(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
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

export function getAmountError(value: string) {
  const amount = value.trim()

  if (!amount) return 'Enter an amount.'

  if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
    return 'Enter a valid amount with up to 2 decimal places.'
  }

  if (Number(amount) <= 0) {
    return 'Amount must be greater than zero.'
  }

  if (Number(amount) > 9999999.99) {
    return 'Amount is too large.'
  }

  return ''
}

export function getDateError(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return 'Enter a valid date in YYYY-MM-DD format.'
  }

  const date = new Date(`${value}T00:00:00`)

  if (
    Number.isNaN(date.getTime()) ||
    localDateString(date) !== value
  ) {
    return 'Enter a valid calendar date.'
  }

  if (value > localDateString(new Date())) {
    return 'Date cannot be in the future.'
  }

  return ''
}
