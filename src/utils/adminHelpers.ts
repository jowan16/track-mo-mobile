export type ActivitySession = {
  session_id: string
  user_id: string
  last_seen_at: string
  token_expires_at: string | null
}

export type AdminAccount = {
  id: string
  status: 'active' | 'suspended'
}

const ONLINE_WINDOW_MS = 90_000

export function isAccountOnline(account: AdminAccount, sessions: ActivitySession[], now: number) {
  if (account.status !== 'active') return false
  return sessions.some((session) => {
    if (session.user_id !== account.id) return false
    const lastSeen = new Date(session.last_seen_at).getTime()
    const expiresAt = session.token_expires_at ? new Date(session.token_expires_at).getTime() : null
    const age = now - lastSeen
    return Number.isFinite(lastSeen) && age >= 0 && age <= ONLINE_WINDOW_MS &&
      (expiresAt === null || (Number.isFinite(expiresAt) && expiresAt > now))
  })
}

export function manilaDateKey(value: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value)
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function formatLastActive(lastSeenAt: string | null, now: number) {
  if (!lastSeenAt) return 'Never active'
  const date = new Date(lastSeenAt)
  const timestamp = date.getTime()
  if (!Number.isFinite(timestamp)) return 'Unavailable'
  const elapsed = Math.max(0, now - timestamp)
  if (elapsed < 60_000) return 'Just now'
  if (elapsed < 60 * 60_000) {
    const minutes = Math.floor(elapsed / 60_000)
    return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`
  }
  if (elapsed < 24 * 60 * 60_000) {
    const hours = Math.floor(elapsed / (60 * 60_000))
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  }
  const yesterday = new Date(now - 24 * 60 * 60_000)
  if (manilaDateKey(date) === manilaDateKey(yesterday)) return 'Yesterday'
  return date.toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila', month: 'long', day: 'numeric', year: 'numeric',
  })
}

export type AuditAction = { action: string }
export type AuditFilter = 'all' | 'users' | 'categories'

export function filterAuditActions<T extends AuditAction>(logs: T[], filter: AuditFilter) {
  return logs.filter((log) => filter === 'all' ||
    (filter === 'users' && /user|admin|password|account/i.test(log.action)) ||
    (filter === 'categories' && /categor/i.test(log.action)))
}

export function paginate<T>(items: T[], page: number, pageSize: number) {
  return items.slice((page - 1) * pageSize, page * pageSize)
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] || character)
}

export function adminStatCards(stats: { total_users: number; active_users: number; admins: number; expenses_count: number } | null) {
  return [
    { label: 'Registered users', value: stats?.total_users },
    { label: 'Active users', value: stats?.active_users },
    { label: 'Admins', value: stats?.admins },
    { label: 'Expenses logged', value: stats?.expenses_count },
  ]
}

export function filterAccounts<T extends { role: string; status: string; full_name: string | null; email: string | null }>(
  accounts: T[], role: string, status: 'all' | 'active' | 'suspended', search: string,
) {
  const query = search.trim().toLowerCase()
  return accounts.filter((account) => account.role === role &&
    (status === 'all' || account.status === status) &&
    `${account.full_name ?? ''} ${account.email ?? ''}`.toLowerCase().includes(query))
}

export type CategoryDraft = { id: number | null; name: string; color: string; show: boolean }
export type ExistingCategory = { id: number; name: string; is_active: boolean; show_in_picker: boolean }

export function validateCategoryDraft(draft: CategoryDraft, categories: ExistingCategory[]) {
  const errors: { name?: string; color?: string; show?: string } = {}
  const name = draft.name.trim()
  if (!name) errors.name = 'Enter a category name.'
  else if (name.length > 30) errors.name = 'Name is too long (30 characters max).'
  else if (categories.some((category) => category.id !== draft.id && category.is_active && category.name.trim().toLowerCase() === name.toLowerCase())) {
    errors.name = 'This category already exists. Please enter a different name.'
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(draft.color)) errors.color = 'Enter a valid hex color, for example #0F766E.'
  if (!draft.show && categories.filter((category) => category.id !== draft.id && category.is_active && category.show_in_picker).length === 0) {
    errors.show = 'At least one category must stay visible in the picker.'
  }
  return errors
}
