import { StaticLoader } from '@/components/StaticLoader'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
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
}
type PendingAction = { kind: 'suspend' | 'reactivate' | 'reset'; target: Account } | null

export default function AdminUsersScreen() {
  const { profile } = useAuth()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<Role>('user')
  const [pending, setPending] = useState<PendingAction>(null)
  const [working, setWorking] = useState(false)
  const [blocked, setBlocked] = useState('')
  const [addAdminOpen, setAddAdminOpen] = useState(false)
  const [adminEmail, setAdminEmail] = useState('')
  const [adminError, setAdminError] = useState('')

  const loadAccounts = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: queryError } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, status, created_at')
      .order('created_at', { ascending: false })

    if (queryError) {
      console.error('Admin accounts error:', queryError)
      setError(queryError.message)
      setAccounts([])
    } else {
      setAccounts((data ?? []) as Account[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadAccounts()
  }, [loadAccounts])

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

  const askAction = (kind: 'suspend' | 'reactivate' | 'reset', target: Account) => {
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

      if (pending.kind === 'reset') {
        if (!pending.target.email) throw new Error('This account has no email address.')
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(
          pending.target.email,
          { redirectTo: 'trackmomobile://reset-password' },
        )
        if (resetError) throw resetError
        await writeAudit(`Sent password reset to ${targetName}`)
        Alert.alert('Reset link sent', `A password reset email was sent to ${pending.target.email}.`)
      } else {
        const status = pending.kind === 'suspend' ? 'suspended' : 'active'
        const { error: statusError } = await supabase.rpc('admin_set_account_status', {
          p_target_user_id: pending.target.id,
          p_status: status,
        })
        if (statusError) throw statusError
        await writeAudit(`${pending.kind === 'suspend' ? 'Suspended' : 'Reactivated'} ${pending.target.role} ${targetName}`)
        Alert.alert('Account updated', pending.kind === 'suspend' ? 'The account has been suspended.' : 'The account has been reactivated.')
        await loadAccounts()
      }
      setPending(null)
    } catch (err) {
      Alert.alert('Action failed', err instanceof Error ? err.message : 'Please try again.')
    } finally {
      setWorking(false)
    }
  }

  const addAdmin = async () => {
    const normalized = adminEmail.trim()
    if (!/^\S+@\S+\.\S+$/.test(normalized)) {
      setAdminError('Enter a valid email address.')
      return
    }
    setWorking(true)
    setAdminError('')
    try {
      const { error: roleError } = await supabase.rpc('admin_set_role', {
        p_email: normalized,
        p_role: 'admin',
      })
      if (roleError) throw roleError
      await writeAudit(`Promoted ${normalized} to admin`)
      setAddAdminOpen(false)
      setAdminEmail('')
      Alert.alert('Admin added', 'The existing account is now an administrator.')
      await loadAccounts()
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : 'Unable to add admin.')
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

      <View style={styles.topActions}>
        <Pressable style={styles.primaryButton} onPress={() => { setAdminError(''); setAddAdminOpen(true) }}>
          <Text style={styles.primaryButtonText}>+ Add admin</Text>
        </Pressable>
      </View>

      {blocked ? <Text style={styles.error}>{blocked}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? (
        <StaticLoader color={adminColors.primary} style={{ margin: 30 }} />
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
                {account.status}
              </Text>
            </View>
          </View>
          <View style={styles.accountDetails}>
            <Text style={styles.detailText}>{account.role === 'admin' ? 'Administrator' : 'User'}</Text>
            <Text style={styles.detailText}>
              Joined {new Date(account.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
            </Text>
          </View>
          <View style={styles.actions}>
            {account.role === 'user' ? (
              <Pressable style={styles.secondaryAction} onPress={() => askAction('reset', account)}>
                <Text style={styles.secondaryActionText}>Send reset link</Text>
              </Pressable>
            ) : null}
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

      <Modal transparent visible={!!pending} animationType="none" onRequestClose={() => { if (!working) setPending(null) }}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {pending?.kind === 'suspend' ? 'Suspend this account?' : pending?.kind === 'reactivate' ? 'Reactivate this account?' : 'Reset password?'}
            </Text>
            <Text style={styles.modalMessage}>
              {pending?.kind === 'reset'
                ? `Send a password reset link to ${pending.target.email}?`
                : pending?.kind === 'suspend'
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

      <Modal transparent visible={addAdminOpen} animationType="none" onRequestClose={() => { if (!working) setAddAdminOpen(false) }}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add admin</Text>
            <Text style={styles.modalMessage}>The person must already have a Track Mo account. Enter their registered email address.</Text>
            <TextInput
              value={adminEmail}
              onChangeText={setAdminEmail}
              placeholder="Email address"
              placeholderTextColor="#94A3B8"
              keyboardType="email-address"
              autoCapitalize="none"
              style={styles.search}
            />
            {adminError ? <Text style={styles.error}>{adminError}</Text> : null}
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelButton} onPress={() => setAddAdminOpen(false)} disabled={working}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.primaryButton} onPress={addAdmin} disabled={working}>
                <Text style={styles.primaryButtonText}>{working ? 'Saving…' : 'Make admin'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </AdminShell>
  )
}

const styles = StyleSheet.create({
  topActions: { flexDirection: 'row', justifyContent: 'flex-start', marginTop: 2, marginBottom: 4 },
  primaryButton: { backgroundColor: adminColors.primary, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 11 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  search: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: adminColors.border, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11, color: adminColors.text, fontSize: 12 },
  tabs: { flexDirection: 'row', backgroundColor: '#E9EBF4', borderRadius: 10, padding: 4, gap: 4, marginBottom: 2 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8 },
  tabActive: { backgroundColor: '#FFFFFF' },
  tabText: { color: adminColors.muted, fontSize: 11, fontWeight: '700' },
  tabTextActive: { color: adminColors.primary },
  error: { color: adminColors.danger, backgroundColor: '#FEECEC', padding: 11, borderRadius: 9, fontSize: 11 },
  emptyCard: { backgroundColor: '#FFFFFF', padding: 28, borderRadius: 12, alignItems: 'center' },
  emptyText: { color: adminColors.muted, fontSize: 12 },
  accountCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: adminColors.border, borderRadius: 13, padding: 13, gap: 11 },
  accountHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  accountAvatar: { width: 37, height: 37, borderRadius: 19, backgroundColor: '#E8EAFE', alignItems: 'center', justifyContent: 'center' },
  accountAvatarText: { color: adminColors.primary, fontWeight: '900', fontSize: 14 },
  accountName: { color: adminColors.text, fontWeight: '900', fontSize: 12 },
  accountEmail: { color: adminColors.muted, fontSize: 10, marginTop: 3 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 20 },
  activePill: { backgroundColor: '#DCFCE7' },
  suspendedPill: { backgroundColor: '#FEE2E2' },
  statusText: { fontSize: 9, fontWeight: '900', textTransform: 'capitalize' },
  activeText: { color: '#166534' },
  suspendedText: { color: '#B42318' },
  accountDetails: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#EEF0F5', paddingTop: 9 },
  detailText: { color: adminColors.muted, fontSize: 10 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  secondaryAction: { borderWidth: 1, borderColor: adminColors.border, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 8 },
  secondaryActionText: { color: adminColors.text, fontSize: 10, fontWeight: '800' },
  dangerAction: { backgroundColor: '#FEE2E2', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8 },
  dangerActionText: { color: adminColors.danger, fontSize: 10, fontWeight: '900' },
  successAction: { backgroundColor: '#DCFCE7', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8 },
  successActionText: { color: '#166534', fontSize: 10, fontWeight: '900' },
  modalBackdrop: { flex: 1, backgroundColor: '#0F172A88', justifyContent: 'center', padding: 22 },
  modalCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 19, gap: 12 },
  modalTitle: { color: adminColors.text, fontSize: 17, fontWeight: '900' },
  modalMessage: { color: adminColors.muted, fontSize: 12, lineHeight: 19 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9, marginTop: 4 },
  cancelButton: { borderWidth: 1, borderColor: adminColors.border, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 11 },
  cancelText: { color: adminColors.text, fontSize: 11, fontWeight: '800' },
})
