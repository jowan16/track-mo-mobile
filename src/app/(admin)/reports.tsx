import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import * as FileSystem from 'expo-file-system/legacy'

import { AdminShell, adminColors } from '@/components/admin/AdminShell'
import { supabase } from '@/services/supabase'

type Period = 'this' | 'last' | 'year'
type ReportStats = { new_users: number; expenses_count: number; active_users: number }
type TopCategory = { category_id: number; uses: number }
type Growth = { label: string; total: number }
type Category = { id: number; name: string; icon: string; color: string }

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export default function AdminReportsScreen() {
  const [period, setPeriod] = useState<Period>('this')
  const [stats, setStats] = useState<ReportStats | null>(null)
  const [top, setTop] = useState<TopCategory[]>([])
  const [growth, setGrowth] = useState<Growth[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)

  const year = new Date().getFullYear()
  const month = new Date().getMonth()
  const { start, end } = useMemo(() => {
    if (period === 'year') return { start: `${year}-01-01`, end: `${year + 1}-01-01` }
    if (period === 'last') {
      const first = new Date(year, month - 1, 1)
      const next = new Date(year, month, 1)
      return { start: dateKey(first), end: dateKey(next) }
    }
    return { start: dateKey(new Date(year, month, 1)), end: dateKey(new Date(year, month + 1, 1)) }
  }, [period, year, month])

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      setError('')
      const [s, t, g, c] = await Promise.all([
        supabase.rpc('admin_period_stats', { p_start: start, p_end: end }),
        supabase.rpc('admin_top_categories', { p_start: start, p_end: end }),
        supabase.rpc('admin_user_growth'),
        supabase.from('categories').select('id, name, icon, color'),
      ])
      const failure = s.error || t.error || g.error || c.error
      if (failure) {
        if (active) setError(failure.message)
      } else if (active) {
        setStats((s.data?.[0] ?? null) as ReportStats | null)
        setTop((t.data ?? []) as TopCategory[])
        setGrowth((g.data ?? []) as Growth[])
        setCategories((c.data ?? []) as Category[])
      }
      if (active) setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [start, end])

  const categoryById = new Map(categories.map((category) => [category.id, category]))
  const cards = [
    { label: 'New users', value: stats?.new_users ?? 0 },
    { label: 'Expenses recorded', value: stats?.expenses_count ?? 0 },
    { label: 'Active users', value: stats?.active_users ?? 0 },
  ]
  const maxGrowth = Math.max(1, ...growth.map((item) => item.total))

  const exportCsv = async () => {
    if (!stats || exporting) return
    setExporting(true)
    try {
      const rows = [
        ['Metric', 'Value'],
        ...cards.map((card) => [card.label, String(card.value)]),
      ]
      const csv = rows
        .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
        .join('\\n')
      if (!FileSystem.cacheDirectory) throw new Error('File storage is unavailable.')
      const uri = `${FileSystem.cacheDirectory}trackmo-system-report-${start}.csv`
      await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 })
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: 'Share system report CSV' })
      } else {
        Alert.alert('CSV created', uri)
      }
    } catch (err) {
      Alert.alert('Export failed', err instanceof Error ? err.message : 'Unable to export CSV.')
    } finally {
      setExporting(false)
    }
  }

  const exportPdf = async () => {
    if (!stats || exporting) return
    setExporting(true)
    try {
      const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>
        body{font-family:Arial,sans-serif;padding:28px;color:#172033}h1{color:#4F46E5}p{color:#64748B}
        table{width:100%;border-collapse:collapse;margin:18px 0}td,th{padding:10px;border-bottom:1px solid #E2E8F0;text-align:left}
        th{background:#F6F7FB}.muted{color:#64748B;font-size:12px}
      </style></head><body><h1>Track Mo, Pake Ko! — System Report</h1>
        <p>Reporting period: ${start} to ${end}</p><table><tr><th>Metric</th><th>Value</th></tr>
        ${cards.map((card) => `<tr><td>${card.label}</td><td>${card.value}</td></tr>`).join('')}
        </table><h2>User growth</h2><table><tr><th>Month</th><th>Total users</th></tr>
        ${growth.map((item) => `<tr><td>${item.label}</td><td>${item.total}</td></tr>`).join('')}
        </table><h2>Most used categories</h2><table><tr><th>Category</th><th>Uses</th></tr>
        ${top.map((item) => `<tr><td>${categoryById.get(item.category_id)?.name ?? 'Category'}</td><td>${item.uses}</td></tr>`).join('')}
        </table><p class="muted">Generated by Track Mo, Pake Ko! administration.</p></body></html>`
      const file = await Print.printToFileAsync({ html })
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: 'Share system report' })
      } else {
        await Share.share({ message: `System report PDF created: ${file.uri}` })
      }
    } catch (err) {
      Alert.alert('Export failed', err instanceof Error ? err.message : 'Unable to export report.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <AdminShell title="System reports" subtitle="Review system-wide user activity and category usage.">
      <View style={styles.periodRow}>
        {([
          ['this', 'This month'],
          ['last', 'Last month'],
          ['year', 'This year'],
        ] as [Period, string][]).map(([value, label]) => (
          <Pressable key={value} onPress={() => setPeriod(value)} style={[styles.periodButton, period === value && styles.periodActive]}>
            <Text style={[styles.periodText, period === value && styles.periodTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? <ActivityIndicator color={adminColors.primary} style={{ margin: 30 }} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!loading && !error && stats ? (
        <>
          <View style={styles.statGrid}>
            {cards.map((card) => (
              <View key={card.label} style={styles.statCard}>
                <Text style={styles.statLabel}>{card.label}</Text>
                <Text style={styles.statValue}>{card.value.toLocaleString()}</Text>
              </View>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>User growth</Text>
            <Text style={styles.sectionHint}>Total registered users over the last six months.</Text>
            {growth.length === 0 ? <Text style={styles.empty}>No growth data available.</Text> : growth.map((item) => (
              <View key={item.label} style={styles.growthRow}>
                <Text style={styles.growthLabel}>{item.label}</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${Math.max(3, (item.total / maxGrowth) * 100)}%` }]} />
                </View>
                <Text style={styles.growthValue}>{item.total}</Text>
              </View>
            ))}
          </View>

      <View style={styles.exportRow}>
        <Pressable style={styles.exportButton} onPress={exportPdf} disabled={loading || exporting || !stats}>
          <Text style={styles.exportText}>{exporting ? 'Preparing…' : 'Export PDF'}</Text>
        </Pressable>
        <Pressable style={[styles.exportButton, styles.csvButton]} onPress={exportCsv} disabled={loading || exporting || !stats}>
          <Text style={styles.exportText}>{exporting ? 'Preparing…' : 'Export CSV'}</Text>
        </Pressable>
      </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Most used categories</Text>
            {top.length === 0 ? <Text style={styles.empty}>No data for the selected period.</Text> : top.map((item, index) => {
              const category = categoryById.get(item.category_id)
              return (
                <View key={item.category_id} style={styles.topRow}>
                  <View style={[styles.rank, { backgroundColor: category?.color || adminColors.primary }]}>
                    <Text style={styles.rankText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.topName}>{category?.name || 'Category'}</Text>
                  <Text style={styles.topUses}>{item.uses.toLocaleString()} uses</Text>
                </View>
              )
            })}
          </View>
        </>
      ) : null}
    </AdminShell>
  )
}

const styles = StyleSheet.create({
  periodRow: { flexDirection: 'row', gap: 6, backgroundColor: '#E9EBF4', padding: 4, borderRadius: 10 },
  periodButton: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8 },
  periodActive: { backgroundColor: '#FFFFFF' },
  periodText: { color: adminColors.muted, fontSize: 10, fontWeight: '700' },
  periodTextActive: { color: adminColors.primary },
  exportRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  exportButton: { backgroundColor: adminColors.primary, borderRadius: 9, paddingHorizontal: 13, paddingVertical: 10 },
  csvButton: { backgroundColor: '#334155' },
  exportText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  error: { color: adminColors.danger, backgroundColor: '#FEECEC', padding: 11, borderRadius: 9, fontSize: 11 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  statCard: { width: '31.5%', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: adminColors.border, borderRadius: 12, padding: 10, minHeight: 90 },
  statLabel: { color: adminColors.muted, fontSize: 9, fontWeight: '700' },
  statValue: { color: adminColors.text, fontSize: 23, fontWeight: '900', marginTop: 13 },
  section: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: adminColors.border, borderRadius: 13, padding: 14 },
  sectionTitle: { color: adminColors.text, fontSize: 14, fontWeight: '900' },
  sectionHint: { color: adminColors.muted, fontSize: 10, marginTop: 4, marginBottom: 12 },
  empty: { color: adminColors.muted, fontSize: 11, textAlign: 'center', paddingVertical: 16 },
  growthRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  growthLabel: { color: adminColors.muted, width: 45, fontSize: 10 },
  barTrack: { flex: 1, height: 9, backgroundColor: '#EEF0F7', borderRadius: 10, overflow: 'hidden' },
  barFill: { height: 9, backgroundColor: adminColors.primary, borderRadius: 10 },
  growthValue: { color: adminColors.text, width: 28, textAlign: 'right', fontSize: 10, fontWeight: '800' },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 12 },
  rank: { width: 25, height: 25, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rankText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  topName: { flex: 1, color: adminColors.text, fontSize: 11, fontWeight: '800' },
  topUses: { color: adminColors.muted, fontSize: 10 },
})
