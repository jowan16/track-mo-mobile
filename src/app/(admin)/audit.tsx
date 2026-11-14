import { StaticLoader } from '@/components/StaticLoader'
import { StaticLoader } from '@/components/StaticLoader'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import { AdminShell, adminColors } from '@/components/admin/AdminShell'
import { supabase } from '@/services/supabase'

type AuditRow = {
  id: number
  actor_id: string | null
  actor_name: string | null
  action: string
  created_at: string
}
type Filter = 'all' | 'users' | 'categories'
const PAGE_SIZE = 10

export default function AdminAuditScreen() {
  const [logs, setLogs] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [page, setPage] = useState(1)

  const loadLogs = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: queryError } = await supabase
      .from('audit_log')
      .select('id, actor_id, actor_name, action, created_at')
      .order('created_at', { ascending: false })
      .limit(200)
    if (queryError) {
      setError(queryError.message)
      setLogs([])
    } else {
      setLogs((data ?? []) as AuditRow[])
    }
    setPage(1)
    setLoading(false)
  }, [])

  useEffect(() => { void loadLogs() }, [loadLogs])

  const filtered = useMemo(() => logs.filter((log) => {
    const text = `${log.actor_name ?? ''} ${log.action}`.toLowerCase()
    const matchesSearch = text.includes(search.trim().toLowerCase())
    const matchesFilter =
      filter === 'all' ||
      (filter === 'users' && /user|admin|password|account/i.test(log.action)) ||
      (filter === 'categories' && /categor/i.test(log.action))
    return matchesSearch && matchesFilter
  }), [logs, search, filter])

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <AdminShell title="Audit log" subtitle="Review recorded administrative actions. Audit entries cannot be edited or deleted.">
      <View style={styles.summary}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Total recorded activities</Text>
          <Text style={styles.summaryValue}>{logs.length}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Activities today</Text>
          <Text style={styles.summaryValue}>
            {logs.filter((log) => new Date(log.created_at).toDateString() === new Date().toDateString()).length}
          </Text>
        </View>
      </View>

      <TextInput
        value={search}
        onChangeText={(value) => { setSearch(value); setPage(1) }}
        placeholder="Search actions or admins"
        placeholderTextColor="#94A3B8"
        style={styles.search}
      />

      <View style={styles.filters}>
        {([
          ['all', 'All actions'],
          ['users', 'User changes'],
          ['categories', 'Categories'],
        ] as [Filter, string][]).map(([value, label]) => (
          <Pressable key={value} onPress={() => { setFilter(value); setPage(1) }} style={[styles.filterButton, filter === value && styles.filterActive]}>
            <Text style={[styles.filterText, filter === value && styles.filterTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? (
        <StaticLoader color={adminColors.primary} style={{ margin: 30 }} />
      ) : visible.length === 0 ? (
        <View style={styles.emptyCard}><Text style={styles.emptyText}>No audit entries found.</Text></View>
      ) : visible.map((log) => (
        <View key={log.id} style={styles.logCard}>
          <View style={styles.logTop}>
            <Text style={styles.action}>{log.action}</Text>
            <Text style={styles.time}>
              {new Date(log.created_at).toLocaleString('en-PH', {
                month: 'short', day: 'numeric', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </Text>
          </View>
          <Text style={styles.actor}>By {log.actor_name || 'Unknown administrator'}</Text>
        </View>
      ))}

      {!loading && filtered.length > 0 ? (
        <View style={styles.pagination}>
          <Pressable style={[styles.pageButton, page <= 1 && styles.pageDisabled]} disabled={page <= 1} onPress={() => setPage((value) => Math.max(1, value - 1))}>
            <Text style={styles.pageText}>Previous</Text>
          </Pressable>
          <Text style={styles.pageCount}>Page {page} of {pages}</Text>
          <Pressable style={[styles.pageButton, page >= pages && styles.pageDisabled]} disabled={page >= pages} onPress={() => setPage((value) => Math.min(pages, value + 1))}>
            <Text style={styles.pageText}>Next</Text>
          </Pressable>
        </View>
      ) : null}
    </AdminShell>
  )
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', gap: 9 },
  summaryCard: { flex: 1, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: adminColors.border, borderRadius: 12, padding: 12 },
  summaryLabel: { color: adminColors.muted, fontSize: 10 },
  summaryValue: { color: adminColors.text, fontSize: 24, fontWeight: '900', marginTop: 8 },
  search: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: adminColors.border, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11, color: adminColors.text, fontSize: 12 },
  filters: { flexDirection: 'row', gap: 6 },
  filterButton: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center', backgroundColor: '#E9EBF4' },
  filterActive: { backgroundColor: adminColors.primary },
  filterText: { color: adminColors.muted, fontSize: 9, fontWeight: '800' },
  filterTextActive: { color: '#FFFFFF' },
  error: { color: adminColors.danger, backgroundColor: '#FEECEC', padding: 11, borderRadius: 9, fontSize: 11 },
  emptyCard: { backgroundColor: '#FFFFFF', padding: 25, borderRadius: 12, alignItems: 'center' },
  emptyText: { color: adminColors.muted, fontSize: 11 },
  logCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: adminColors.border, borderRadius: 11, padding: 13, gap: 8 },
  logTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  action: { flex: 1, color: adminColors.text, fontSize: 11, fontWeight: '900' },
  time: { color: adminColors.muted, fontSize: 9 },
  actor: { color: adminColors.muted, fontSize: 10 },
  pagination: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7 },
  pageButton: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: adminColors.border, backgroundColor: '#FFFFFF' },
  pageDisabled: { opacity: 0.4 },
  pageText: { color: adminColors.text, fontSize: 10, fontWeight: '800' },
  pageCount: { color: adminColors.muted, fontSize: 10 },
})
