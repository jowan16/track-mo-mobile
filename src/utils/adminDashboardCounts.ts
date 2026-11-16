export type AdminStats = {
  total_users: number
  active_users: number
  admins: number
  expenses_count: number
}

export type ReportStats = {
  new_users: number
  expenses_count: number
  active_users: number
}

export type TopCategory = { category_id: number; uses: number }
export type GrowthPoint = { label: string; total: number }
export type CategorySummary = { id: number; name: string; icon: string | null; color: string | null }

function singleRpcRow(rows: unknown): Record<string, unknown> | null {
  if (!Array.isArray(rows) || rows.length !== 1) return null

  const row: unknown = rows[0]
  if (typeof row !== 'object' || row === null || Array.isArray(row)) return null
  return row as Record<string, unknown>
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export function registeredAccountCount(rows: unknown): number | null {
  const row = singleRpcRow(rows)
  if (!row || !Object.prototype.hasOwnProperty.call(row, 'total_users')) return null

  return isCount(row.total_users) ? row.total_users : null
}

export function reportStatsFromRpc(rows: unknown): ReportStats | null {
  const row = singleRpcRow(rows)
  if (!row ||
    !Object.prototype.hasOwnProperty.call(row, 'new_users') ||
    !Object.prototype.hasOwnProperty.call(row, 'expenses_count') ||
    !Object.prototype.hasOwnProperty.call(row, 'active_users') ||
    !isCount(row.new_users) ||
    !isCount(row.expenses_count) ||
    !isCount(row.active_users)) {
    return null
  }

  return {
    new_users: row.new_users,
    expenses_count: row.expenses_count,
    active_users: row.active_users,
  }
}

export function adminStatsFromRpc(rows: unknown): AdminStats | null {
  const row = singleRpcRow(rows)
  if (!row ||
    !Object.prototype.hasOwnProperty.call(row, 'total_users') ||
    !Object.prototype.hasOwnProperty.call(row, 'active_users') ||
    !Object.prototype.hasOwnProperty.call(row, 'admins') ||
    !Object.prototype.hasOwnProperty.call(row, 'expenses_count') ||
    !isCount(row.total_users) ||
    !isCount(row.active_users) ||
    !isCount(row.admins) ||
    !isCount(row.expenses_count)) {
    return null
  }

  return {
    total_users: row.total_users,
    active_users: row.active_users,
    admins: row.admins,
    expenses_count: row.expenses_count,
  }
}

/** admin_top_categories returns category_id and uses as PostgreSQL bigint. */
export function topCategoriesFromRpc(rows: unknown): TopCategory[] | null {
  if (!Array.isArray(rows) || rows.length > 5) return null

  const result: TopCategory[] = []
  for (const value of rows) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    const row = value as Record<string, unknown>
    if (!Object.prototype.hasOwnProperty.call(row, 'category_id') ||
      !Object.prototype.hasOwnProperty.call(row, 'uses') ||
      !isCount(row.category_id) || !isCount(row.uses)) {
      return null
    }
    result.push({ category_id: row.category_id, uses: row.uses })
  }

  return result
}

/** admin_user_growth returns one cumulative regular-user count per month. */
export function userGrowthFromRpc(rows: unknown): GrowthPoint[] | null {
  // The RPC always returns the six-month window, even when all counts are zero.
  if (!Array.isArray(rows) || rows.length !== 6) return null

  const result: GrowthPoint[] = []
  for (const value of rows) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    const row = value as Record<string, unknown>
    if (!Object.prototype.hasOwnProperty.call(row, 'label') ||
      !Object.prototype.hasOwnProperty.call(row, 'total') ||
      typeof row.label !== 'string' || row.label.trim().length === 0 || !isCount(row.total)) {
      return null
    }
    result.push({ label: row.label, total: row.total })
  }

  return result
}

export function categorySummariesFromQuery(rows: unknown): CategorySummary[] | null {
  if (!Array.isArray(rows)) return null

  const result: CategorySummary[] = []
  for (const value of rows) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    const row = value as Record<string, unknown>
    if (!Object.prototype.hasOwnProperty.call(row, 'id') ||
      !Object.prototype.hasOwnProperty.call(row, 'name') ||
      !isCount(row.id) || row.id === 0 || typeof row.name !== 'string' ||
      (row.icon !== null && typeof row.icon !== 'string') ||
      (row.color !== null && typeof row.color !== 'string')) {
      return null
    }
    result.push({
      id: row.id,
      name: row.name,
      icon: row.icon,
      color: row.color,
    })
  }

  return result
}
