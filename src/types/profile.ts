export type Role = 'user' | 'admin'

export type AccountStatus = 'active' | 'suspended'

export interface Profile {
  id: string
  full_name: string | null
  email: string | null
  role: Role
  status: AccountStatus
  currency: string
  warn_80: boolean
  warn_100: boolean
  email_alerts: boolean
  daily_reminder: boolean
  daily_reminder_time: string
  daily_reminder_timezone: string
  created_at: string
  last_seen_at: string | null
}