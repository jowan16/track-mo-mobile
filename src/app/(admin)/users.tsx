import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import { AdminShell, adminColors } from '@/components/admin/AdminShell'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/services/supabase'

type Role = 'user' | 'admin'
type Account = {
  id: string
  full_name: string | null
  email: string | null
  role: Role
  status: 'active' | 'suspended'
  created_at: string
  last_seen_at: string | null
}
type PendingAction = { kind: 'suspend' | 'reactivate'; target: Account } | null
type ActivitySession = {
  session_id: string
  user_id: string
  last_seen_at: string
  token_expires_at: string | null
}

const ONLINE_WINDOW_MS = 90_000

function isAccountOnline(account: Account, sessions: ActivitySession[], now: number) {
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

function manilaDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function formatLastActive(lastSeenAt: string | null, now: number) {
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

export default function AdminUsersScreen() {
  const { profile } = useAuth()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [activitySessions, setActivitySessions] = useState<ActivitySession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<Role>('user')
  const [pending, setPending] = useState<PendingAction>(null)
  const [working, setWorking] = useState(false)
  const [blocked, setBlocked] = useState('')
  const [activityClock, setActivityClock] = useState(Date.now())

  const loadAccounts = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    setError('')
    const [profilesResult, sessionsResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, email, role, status, created_at, last_seen_at')
        .order('created_at', { ascending: false }),
      supabase.rpc('admin_get_user_activity_sessions'),
    ])

    if (profilesResult.error || sessionsResult.error) {
      const queryError = profilesResult.error ?? sessionsResult.error
      console.error('Admin account activity error:', queryError)
      setError(queryError?.message ?? 'Unable to load user activity information.')
      if (showLoading) {
        setAccounts([])
        setActivitySessions([])
      }
    } else {
      setAccounts((profilesResult.data ?? []) as Account[])
      setActivitySessions((sessionsResult.data ?? []) as ActivitySession[])
    }
    if (showLoading) setLoading(false)
  }, [])

  useEffect(() => {
    void loadAccounts()
  }, [loadAccounts])

  // Reconcile periodically in case the admin's Realtime connection was interrupted.
  useEffect(() => {
    const interval = setInterval(() => {
      void loadAccounts(false)
    }, 60_000)
    return () => clearInterval(interval)
  }, [loadAccounts])


  // Keep profile timestamps and each authenticated session synchronized in real time.
  useEffect(() => {
    const channel = supabase
      .channel('admin-user-activity')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload) => {
          const updated = payload.new as Account
          if (!updated?.id) return
          setAccounts((current) => current.map((account) =>
            account.id === updated.id
              ? { ...account, status: updated.status, last_seen_at: updated.last_seen_at }
              : account,
          ))
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_activity_sessions' },
        (payload) => {
          const updated = payload.new as ActivitySession
          const previous = payload.old as Partial<ActivitySession>
          const sessionId = updated?.session_id ?? previous?.session_id
          if (!sessionId) return
          if (payload.eventType === 'DELETE') {
            setActivitySessions((current) => current.filter((item) => item.session_id !== sessionId))
          } else if (updated?.session_id && updated.user_id) {
            setActivitySessions((current) => [
              ...current.filter((item) => item.session_id !== updated.session_id),
              updated,
            ])
          }
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [])

  // This local clock only refreshes the Online/Offline label as heartbeats age.
  useEffect(() => {
    const interval = setInterval(() => setActivityClock(Date.now()), 15_000)
    return () => clearInterval(interval)
  }, [])

  const filtered = useMemo(() => accounts.filter((account) => {
    const matchesRole = account.role === tab
    const haystack = `${account.full_name ?? ''} ${account.email ?? ''}`.toLowerCase()
    return matchesRole && haystack.includes(search.trim().toLowerCase())
  }), [accounts, tab, search])

  const writeAudit = async (action: string) => {
    if (!profile) return
    const { error: auditError } = await supabase.from('audit_log').insert({
      actor_id: profile.id,
      actor_name: profile.full_name || profile.email,
      action,
    })
    if (auditError) console.warn('Unable to write audit entry:', auditError.message)
  }

  const askAction = (kind: 'suspend' | 'reactivate', target: Account) => {
    setBlocked('')
    if (kind === 'suspend') {
      if (target.id === profile?.id) {
        setBlocked('You cannot suspend your own account.')
        return
      }
      if (target.role === 'admin' &&
        accounts.filter((account) => account.role === 'admin' && account.status === 'active').length <= 1) {
        setBlocked('At least one active admin is required.')
        return
      }
    }
    setPending({ kind, target })
  }

  const runPending = async () => {
    if (!pending || working) return
    setWorking(true)
    try {
      const targetName = pending.target.full_name || pending.target.email || 'account'
      const status = pending.kind === 'suspend' ? 'suspended' : 'active'
      const { error: statusError } = await supabase.rpc('admin_set_account_status', {
        p_target_user_id: pending.target.id,
        p_status: status,
      })
      if (statusError) throw statusError
      await writeAudit(`${pending.kind === 'suspend' ? 'Suspended' : 'Reactivated'} ${pending.target.role} ${targetName}`)

      // Reflect the confirmed database update immediately in the admin list.
      setAccounts((current) =>
        current.map((account) =>
          account.id === pending.target.id ? { ...account, status } : account,
        ),
      )

      Alert.alert(
        pending.kind === 'suspend' ? 'Account suspended' : 'Account reactivated',
        pending.kind === 'suspend'
          ? 'The account has been suspended. The user can no longer access the application.'
          : 'The account has been reactivated. The user can log in again using their existing credentials.',
      )
      await loadAccounts()
      setPending(null)
    } catch (err) {
      Alert.alert('Action failed', err instanceof Error ? err.message : 'Please try again.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <AdminShell title="Users" subtitle="Manage registered user and administrator accounts.">
      <View style={styles.tabs}>
        {(['user', 'admin'] as Role[]).map((value) => (
          <Pressable key={value} onPress={() => setTab(value)} style={[styles.tab, tab === value && styles.tabActive]}>
            <Text style={[styles.tabText, tab === value && styles.tabTextActive]}>
              {value === 'user' ? 'Users' : 'Admins'} ({accounts.filter((a) => a.role === value).length})
            </Text>
          </Pressable>
        ))}
      </View>

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search by name or email"
        placeholderTextColor="#94A3B8"
        style={styles.search}
        autoCapitalize="none"
      />

      {blocked ? <Text style={styles.error}>{blocked}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? (
        <ActivityIndicator color={adminColors.primary} style={{ margin: 30 }} />
      ) : filtered.length === 0 ? (
        <View style={styles.emptyCard}><Text style={styles.emptyText}>No accounts found.</Text></View>
      ) : filtered.map((account) => (
        <View key={account.id} style={styles.accountCard}>
          <View style={styles.accountHeader}>
            <View style={styles.accountAvatar}>
              <Text style={styles.accountAvatarText}>
                {(account.full_name || account.email || '?').slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.accountName}>{account.full_name || 'No name provided'}</Text>
              <Text style={styles.accountEmail}>{account.email || 'No email'}</Text>
            </View>
            <View style={[styles.statusPill, account.status === 'active' ? styles.activePill : styles.suspendedPill]}>
              <Text style={[styles.statusText, account.status === 'active' ? styles.activeText : styles.suspendedText]}>
                {`Account: ${account.status}`}
              </Text>
            </View>
          </View>
          <View style={styles.activityDetails}>
            <View style={styles.activityColumn}>
              <Text style={styles.activityLabel}>Activity Status</Text>
              <View style={[styles.activityPill, isAccountOnline(account, activitySessions, activityClock) ? styles.onlinePill : styles.offlinePill]}>
                <Text style={[styles.activityText, isAccountOnline(account, activitySessions, activityClock) ? styles.onlineText : styles.offlineText]}>
                  {isAccountOnline(account, activitySessions, activityClock) ? 'Online' : 'Offline'}
                </Text>
              </View>
            </View>
            <View style={styles.lastActiveColumn}>
              <Text style={styles.activityLabel}>Last Active</Text>
              <Text style={styles.lastActiveText}>{formatLastActive(account.last_seen_at, activityClock)}</Text>
            </View>
          </View>
          <View style={styles.accountDetails}>
            <Text style={styles.detailText}>{account.role === 'admin' ? 'Administrator' : 'User'}</Text>
            <Text style={styles.detailText}>
              Joined {new Date(account.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
            </Text>
          </View>
          <View style={styles.actions}>
            {account.status === 'active' ? (
              <Pressable style={styles.dangerAction} onPress={() => askAction('suspend', account)}>
                <Text style={styles.dangerActionText}>Suspend</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.successAction} onPress={() => askAction('reactivate', account)}>
                <Text style={styles.successActionText}>Reactivate</Text>
              </Pressable>
            )}
          </View>
        </View>
      ))}

      <Modal transparent visible={!!pending} animationType="fade" onRequestClose={() => { if (!working) setPending(null) }}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {pending?.kind === 'suspend' ? 'Suspend this account?' : 'Reactivate this account?'}
            </Text>
            <Text style={styles.modalMessage}>
              {pending?.kind === 'suspend'
                ? `${pending.target.full_name || pending.target.email} will not be able to log in until reactivated.`
                : `${pending?.target.full_name || pending?.target.email} will be able to log in again.`}
            </Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelButton} onPress={() => setPending(null)} disabled={working}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.primaryButton} onPress={runPending} disabled={working}>
                <Text style={styles.primaryButtonText}>{working ? 'Please wait…' : 'Confirm'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

    </AdminShell>
  )
}

const styles = StyleSheet.create({
  introRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 2 },
  introCopy: { flex: 1, gap: 4 },
  eyebrow: { color: adminColors.primary, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  sectionTitle: { color: adminColors.text, fontSize: 21, fontWeight: '900', letterSpacing: -0.4 },
  sectionSubtitle: { color: adminColors.muted, fontSize: 11, lineHeight: 16 },
  totalBadge: { minWidth: 62, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: '#EEF2FF', alignItems: 'center' },
  totalValue: { color: adminColors.primary, fontSize: 18, fontWeight: '900' },
  totalLabel: { color: adminColors.primary, fontSize: 8, fontWeight: '900', letterSpacing: 0.8, marginTop: 1 },
  statsRow: { flexDirection: 'row', gap: 8 },
  statCard: { flex: 1, minWidth: 0, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: adminColors.border, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 12, gap: 5 },
  statDot: { width: 7, height: 7, borderRadius: 4 },
  statValue: { color: adminColors.text, fontSize: 19, fontWeight: '900' },
  statLabel: { color: adminColors.muted, fontSize: 9, fontWeight: '700' },
  directoryCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: adminColors.border, borderRadius: 15, padding: 13, gap: 12 },
  directoryTitle: { color: adminColors.text, fontSize: 15, fontWeight: '900' },
  directorySubtitle: { color: adminColors.muted, fontSize: 10, marginTop: 3 },
  tabs: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 10, padding: 4, gap: 4 },
  tab: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, paddingVertical: 9, borderRadius: 8 },
  tabActive: { backgroundColor: '#EEF2FF' },
  tabText: { color: adminColors.muted, fontSize: 11, fontWeight: '800' },
  tabTextActive: { color: adminColors.primary },
  tabCount: { minWidth: 19, height: 19, borderRadius: 10, backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  tabCountActive: { backgroundColor: '#DDE3FF' },
  tabCountText: { color: '#64748B', fontSize: 9, fontWeight: '900' },
  tabCountTextActive: { color: adminColors.primary },
  controlPressed: { opacity: 0.75 },
  searchWrap: { minHeight: 43, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: adminColors.border, borderRadius: 10, backgroundColor: '#FFFFFF', paddingHorizontal: 11 },
  searchIcon: { color: '#64748B', fontSize: 22, marginRight: 8 },
  search: { flex: 1, minWidth: 0, paddingVertical: 10, color: adminColors.text, fontSize: 11 },
  clearSearch: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  clearSearchText: { color: '#64748B', fontSize: 19, lineHeight: 22 },
  error: { color: adminColors.danger, backgroundColor: '#FEECEC', borderWidth: 1, borderColor: '#FECACA', padding: 11, borderRadius: 10, fontSize: 11, lineHeight: 16 },
  resultsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 2 },
  resultsTitle: { color: adminColors.text, fontSize: 14, fontWeight: '900' },
  resultsSubtitle: { color: adminColors.muted, fontSize: 10, marginTop: 2 },
  liveIndicator: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F0FDF4', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#16A34A' },
  liveText: { color: '#166534', fontSize: 8, fontWeight: '800' },
  loadingCard: { minHeight: 110, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: adminColors.border, borderRadius: 13, alignItems: 'center', justifyContent: 'center', gap: 9 },
  loadingText: { color: adminColors.muted, fontSize: 10, fontWeight: '600' },
  emptyCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: adminColors.border, borderRadius: 13, padding: 25, alignItems: 'center', gap: 6 },
  emptyIcon: { color: '#94A3B8', fontSize: 25 },
  emptyTitle: { color: adminColors.text, fontSize: 13, fontWeight: '900' },
  emptyText: { color: adminColors.muted, fontSize: 10, textAlign: 'center', lineHeight: 15 },
  accountCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: adminColors.border, borderRadius: 14, padding: 13, gap: 11, shadowColor: '#0F172A', shadowOpacity: 0.035, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  accountHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  accountAvatar: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  accountAvatarText: { color: adminColors.primary, fontWeight: '900', fontSize: 15 },
  identity: { flex: 1, minWidth: 0, gap: 3 },
  accountName: { color: adminColors.text, fontWeight: '900', fontSize: 12 },
  accountEmail: { color: adminColors.muted, fontSize: 10, lineHeight: 14 },
  accountRole: { color: '#94A3B8', fontSize: 8, fontWeight: '900', letterSpacing: 0.8, marginTop: 2 },
  statusPill: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 20, flexShrink: 0 },
  activePill: { backgroundColor: '#DCFCE7' },
  suspendedPill: { backgroundColor: '#FEE2E2' },
  statusText: { fontSize: 9, fontWeight: '900' },
  activeText: { color: '#166534' },
  suspendedText: { color: '#B42318' },
  cardDivider: { height: 1, backgroundColor: '#EEF2F6' },
  activityDetails: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 13 },
  activityColumn: { minWidth: 82, gap: 6 },
  lastActiveColumn: { flex: 1, minWidth: 105, gap: 6 },
  joinedColumn: { minWidth: 75, gap: 6 },
  activityLabel: { color: '#94A3B8', fontSize: 8, fontWeight: '900', letterSpacing: 0.6 },
  activityStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  activityDot: { width: 7, height: 7, borderRadius: 4 },
  onlineDot: { backgroundColor: '#16A34A' },
  offlineDot: { backgroundColor: '#94A3B8' },
  activityText: { fontSize: 10, fontWeight: '900' },
  onlineText: { color: '#15803D' },
  offlineText: { color: '#64748B' },
  lastActiveText: { color: adminColors.text, fontSize: 10, fontWeight: '700', lineHeight: 14 },
  joinedText: { color: adminColors.text, fontSize: 9, fontWeight: '700' },
  cardFooter: { borderTopWidth: 1, borderTopColor: '#EEF2F6', paddingTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  actionHint: { color: '#94A3B8', fontSize: 8, fontWeight: '900', letterSpacing: 0.7 },
  dangerAction: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#FFF1F0', borderWidth: 1, borderColor: '#FECACA', paddingHorizontal: 12, borderRadius: 9 },
  dangerActionIcon: { color: adminColors.danger, fontSize: 14, fontWeight: '900' },
  dangerActionText: { color: adminColors.danger, fontSize: 10, fontWeight: '900' },
  successAction: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0', paddingHorizontal: 12, borderRadius: 9 },
  successActionIcon: { color: '#15803D', fontSize: 14, fontWeight: '900' },
  successActionText: { color: '#166534', fontSize: 10, fontWeight: '900' },
  actionPressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.52)', justifyContent: 'center', padding: 22 },
  modalCard: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 20, gap: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  modalIconWrap: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#FFF1F0', alignItems: 'center', justifyContent: 'center' },
  modalIcon: { color: adminColors.danger, fontSize: 18, fontWeight: '900' },
  modalTitle: { color: adminColors.text, fontSize: 16, fontWeight: '900' },
  modalMessage: { color: adminColors.muted, fontSize: 11, lineHeight: 18 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9, marginTop: 4 },
  primaryButton: { minHeight: 38, backgroundColor: adminColors.primary, borderRadius: 9, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  cancelButton: { minHeight: 38, borderWidth: 1, borderColor: adminColors.border, borderRadius: 9, paddingHorizontal: 14, justifyContent: 'center' },
  cancelText: { color: adminColors.text, fontSize: 10, fontWeight: '800' },
})
