export function toggleSelection(current: Set<number>, id: number) {
  const next = new Set(current)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

export function retainValidSelections(current: Set<number>, validIds: number[]) {
  const valid = new Set(validIds)
  return new Set([...current].filter((id) => valid.has(id)))
}

export const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`

export const htmlText = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character] || character)

export function validateProfileChanges(nameValue: string, password: string, confirmation: string) {
  const name = nameValue.trim()
  if (!name) return 'Please enter your full name.'
  if (name.length > 60) return 'Your name must not exceed 60 characters.'
  if (!password && !confirmation) return ''
  if (!password || !confirmation) return 'Enter and confirm your new password, or leave both password fields empty.'
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'Use at least 8 characters, including a letter and a number.'
  }
  if (password !== confirmation) return 'Your new password and confirmation do not match.'
  return ''
}

export function archiveDateLabel(value: string) {
  const date = new Date(`${value}T00:00:00`)
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function archiveMonthLabel(month: number, year: number) {
  return new Date(year, month - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
}
