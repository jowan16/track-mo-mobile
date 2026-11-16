export type AppRole = 'admin' | 'user'

export function normalizeAppRole(role: string | null | undefined): AppRole | null {
  const normalized = role?.toLowerCase()
  return normalized === 'admin' || normalized === 'user' ? normalized : null
}

export function isAdminRole(role: string | null | undefined) {
  return normalizeAppRole(role) === 'admin'
}
