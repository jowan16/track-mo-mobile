import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { AdminShell, adminColors } from '@/components/admin/AdminShell'
import { supabase } from '@/services/supabase'

type Stats = {
  total_users: number
  active_users: number
  admins: number
  expenses_count: number
}

type Account = {
  id: string
  full_name: string | null
  email: string | null
  role: string
  status: string
  created_at: string
}

type Category = {
  id: number
  name: string
  icon: string
  color: string
}

export default function AdminOverviewScreen() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [statsResult, accountsResult, categoriesResult] = await Promise.all([
        supabase.rpc('admin_stats'),
        supabase
          .from('profiles')
          .select('id, full_name, email, role, status, created_at')
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('categories')
          .select('id, name, icon, color, is_active')
          .eq('is_active', true)
          .order('sort_order')
          .limit(4),
      ])

      if (statsResult.error) throw statsResult.error
      if (accountsResult.error) throw accountsResult.error
      if (categoriesResult.error) throw categoriesResult.error

      setStats((statsResult.data?.[0] ?? null) as Stats | null)
      setAccounts((accountsResult.data ?? []) as Account[])
      setCategories((categoriesResult.data ?? []) as Category[])
    } catch (err) {
      console.error('Admin overview error:', err)
      setError(err instanceof Error ? err.message : 'Unable to load admin overview.')
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void loadData()
    }, [loadData]),
  )

  const cards = [
    { label: 'Registered users', value: stats?.total_users },
    { label: 'Active users', value: stats?.active_users },
    { label: 'Admins', value: stats?.admins },
    { label: 'Expenses logged', value: stats?.expenses_count },
  ]

  return (
    <AdminShell title="Overview" subtitle="A summary of Track Mo, Pake Ko! system activity.">
      <View style={styles.toolbar}>
        <Text style={styles.toolbarHint}>Live system summary</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh overview"
          disabled={loading}
          onPress={() => void loadData()}
          style={({ pressed }) => [
            styles.refreshButton,
            (pressed || loading) && styles.refreshButtonPressed,
          ]}
        >
          {loading
            ? <ActivityIndicator size="small" color={adminColors.primary} />
            : <Text style={styles.refreshText}>↻ Refresh</Text>}
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.grid}>
        {cards.map((card) => (
          <View key={card.label} style={styles.statCard}>
            <Text style={styles.statLabel}>{card.label}</Text>
            <Text style={styles.statValue}>
              {loading ? '—' : (card.value ?? '—').toLocaleString()}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent registered accounts</Text>
        <Text style={styles.sectionHint}>The five most recently registered accounts.</Text>
        {loading ? (
          <ActivityIndicator color={adminColors.primary} style={{ margin: 22 }} />
        ) : accounts.length === 0 ? (
          <Text style={styles.empty}>No registered accounts available.</Text>
        ) : accounts.map((account) => (
          <View key={account.id} style={styles.accountRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(account.full_name || account.email || '?').slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={styles.accountInfo}>
              <Text style={styles.accountName}>{account.full_name || 'No name provided'}</Text>
              <Text style={styles.accountEmail}>{account.email || 'No email'}</Text>
              <Text style={styles.accountMeta}>
                {account.role === 'admin' ? 'Administrator' : 'User'} · {account.status}
              </Text>
            </View>
            <Text style={styles.accountDate}>
              {new Date(account.created_at).toLocaleDateString('en-PH', {
                timeZone: 'Asia/Manila',
                month: 'short', day: 'numeric', year: 'numeric',
              })}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Default categories</Text>
        {categories.length === 0 && !loading ? (
          <Text style={styles.empty}>No active categories.</Text>
        ) : categories.map((category) => (
          <View key={category.id} style={styles.categoryRow}>
            <View style={[styles.categoryDot, { backgroundColor: category.color || adminColors.primary }]} />
            <Text style={styles.categoryName}>{category.name}</Text>
          </View>
        ))}
      </View>
    </AdminShell>
  )
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  toolbarHint: { color: adminColors.muted, fontSize: 11, fontWeight: '600' },
  refreshButton: { minHeight: 34, paddingHorizontal: 12, borderRadius: 9, borderWidth: 1, borderColor: adminColors.border, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  refreshButtonPressed: { opacity: 0.55 },
  refreshText: { color: adminColors.primary, fontSize: 11, fontWeight: '800' },
  error: { color: adminColors.danger, backgroundColor: '#FEECEC', padding: 12, borderRadius: 9, fontSize: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { flexGrow: 1, flexBasis: '45%', minWidth: 130, minHeight: 104, backgroundColor: '#FFFFFF', borderRadius: 13, borderWidth: 1, borderColor: adminColors.border, padding: 14 },
  statLabel: { color: adminColors.muted, fontSize: 11, fontWeight: '600' },
  statValue: { color: adminColors.text, fontSize: 27, fontWeight: '900', marginTop: 12 },
  section: { backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: adminColors.border, padding: 15 },
  sectionTitle: { color: adminColors.text, fontSize: 15, fontWeight: '900' },
  sectionHint: { color: adminColors.muted, fontSize: 11, marginTop: 4, marginBottom: 8 },
  empty: { color: adminColors.muted, fontSize: 12, paddingVertical: 18, textAlign: 'center' },
  accountRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderTopWidth: 1, borderTopColor: '#EEF0F5', gap: 9 },
  avatar: { width: 35, height: 35, borderRadius: 18, backgroundColor: '#E8EAFE', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: adminColors.primary, fontSize: 14, fontWeight: '900' },
  accountInfo: { flex: 1 },
  accountName: { color: adminColors.text, fontSize: 12, fontWeight: '800' },
  accountEmail: { color: adminColors.muted, fontSize: 10, marginTop: 2 },
  accountMeta: { color: adminColors.muted, fontSize: 10, marginTop: 3, textTransform: 'capitalize' },
  accountDate: { color: adminColors.muted, fontSize: 9 },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 12 },
  categoryDot: { width: 11, height: 11, borderRadius: 6 },
  categoryName: { color: adminColors.text, fontSize: 12, fontWeight: '700' },
})
