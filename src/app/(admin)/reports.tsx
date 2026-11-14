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
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/services/supabase'

type Period = 'this' | 'last' | 'year'
type ReportStats = { new_users: number; expenses_count: number; active_users: number }
type TopCategory = { category_id: number; uses: number }
type Growth = { label: string; total: number }
type Category = { id: number; name: string; icon: string; color: string }

function manilaDateParts() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  return { year: value('year'), month: value('month') - 1, day: value('day') }
}

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function addCalendarDays(year: number, month: number, day: number, amount: number) {
  const date = new Date(Date.UTC(year, month, day + amount))
  return dateKey(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

function formatReportDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, day, 12)))
}

function escapeHtml(value: string) {
  return value.replace(/[&<>\"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;',
  })[character] || character)
}

export default function AdminReportsScreen() {
  const { profile } = useAuth()
  const [period, setPeriod] = useState<Period>('this')
  const [stats, setStats] = useState<ReportStats | null>(null)
  const [top, setTop] = useState<TopCategory[]>([])
  const [growth, setGrowth] = useState<Growth[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [totalUsers, setTotalUsers] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)

  const today = manilaDateParts()
  const year = today.year
  const month = today.month
  const { start, end } = useMemo(() => {
    const firstOfThisMonth = dateKey(year, month, 1)
    const todayExclusive = addCalendarDays(year, month, today.day, 1)

    if (period === 'year') {
      return { start: dateKey(year, 0, 1), end: todayExclusive }
    }
    if (period === 'last') {
      const previousMonth = new Date(Date.UTC(year, month - 1, 1))
      return {
        start: dateKey(previousMonth.getUTCFullYear(), previousMonth.getUTCMonth(), 1),
        end: firstOfThisMonth,
      }
    }
    return { start: firstOfThisMonth, end: todayExclusive }
  }, [period, year, month, today.day])

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      setError('')
      const [s, t, g, c, users] = await Promise.all([
        supabase.rpc('admin_period_stats', { p_start: start, p_end: end }),
        supabase.rpc('admin_top_categories', { p_start: start, p_end: end }),
        supabase.rpc('admin_user_growth'),
        supabase.from('categories').select('id, name, icon, color'),
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
      ])
      const failure = s.error || t.error || g.error || c.error || users.error
      if (failure) {
        if (active) setError(failure.message)
      } else if (active) {
        setStats((s.data?.[0] ?? null) as ReportStats | null)
        setTop((t.data ?? []) as TopCategory[])
        setGrowth((g.data ?? []) as Growth[])
        setCategories((c.data ?? []) as Category[])
        setTotalUsers(users.count ?? 0)
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
      const inclusiveEnd = addCalendarDays(
        Number(end.slice(0, 4)),
        Number(end.slice(5, 7)) - 1,
        Number(end.slice(8, 10)),
        -1,
      )
      const generatedAt = new Intl.DateTimeFormat('en-PH', {
        timeZone: 'Asia/Manila',
        dateStyle: 'long',
        timeStyle: 'short',
      }).format(new Date())
      const categoryUsageTotal = top.reduce((sum, item) => sum + Number(item.uses || 0), 0)
      const categoryRows = top.map((item) => {
        const name = categoryById.get(item.category_id)?.name ?? 'Category'
        const percentage = categoryUsageTotal > 0 ? (item.uses / categoryUsageTotal) * 100 : 0
        return `<tr><td>${escapeHtml(name)}</td><td class="number">${item.uses.toLocaleString()}</td><td class="number">${percentage.toFixed(1)}%</td></tr>`
      }).join('')
      const growthRows = growth.map((item) =>
        `<tr><td>${escapeHtml(item.label)}</td><td class="number">${item.total.toLocaleString()}</td></tr>`,
      ).join('')
      const newUserLabel = period === 'this' ? 'New users this month' : period === 'last' ? 'New users last month' : 'New users this year'
      const expenseLabel = period === 'this' ? 'Expenses recorded this month' : period === 'last' ? 'Expenses recorded last month' : 'Expenses recorded this year'
      const activeLabel = 'Active users (current)'
      const observations = [
        totalUsers === 0 ? 'No registered user records were found.' : `The system has ${totalUsers.toLocaleString()} registered user account(s), of which ${stats.active_users.toLocaleString()} are currently active.`,
        stats.expenses_count === 0 ? 'No expenses were recorded during the selected reporting period.' : `${stats.expenses_count.toLocaleString()} expense record(s) were recorded during the selected reporting period.`,
        top.length === 0 ? 'There is no category usage data for the selected reporting period.' : `The most frequently used category is ${categoryById.get(top[0].category_id)?.name ?? 'Category'} with ${top[0].uses.toLocaleString()} use(s).`,
      ]
      const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>
        @page{size:A4;margin:18mm 16mm 20mm}body{font-family:Arial,sans-serif;color:#172033;font-size:11px;line-height:1.5}
        h1{color:#4F46E5;font-size:23px;margin:0}h2{font-size:15px;margin:22px 0 8px;color:#172033}
        .eyebrow{color:#64748B;font-size:10px;letter-spacing:2px;font-weight:bold;margin:0 0 6px}
        .subtitle{color:#64748B;margin:4px 0 16px}.meta{background:#F6F7FB;padding:12px;border-radius:8px}
        .meta p{margin:3px 0}.cards{width:100%;border-collapse:separate;border-spacing:7px 0;margin:14px 0}
        .cards td{background:#F6F7FB;border:0;padding:12px;width:33%;vertical-align:top}
        .metric{font-size:22px;font-weight:bold;color:#4F46E5}.metric-label{font-size:9px;color:#64748B}
        table.data{width:100%;border-collapse:collapse;margin:8px 0 14px}
        .data td,.data th{padding:8px;border-bottom:1px solid #E2E8F0;text-align:left}
        .data th{background:#F1F5F9;color:#334155;font-size:10px}
        .number{text-align:right!important;font-variant-numeric:tabular-nums}
        .note{background:#F8FAFC;border-left:3px solid #4F46E5;padding:10px 12px;margin:7px 0}
        .muted{color:#64748B;font-size:9px}.footer{border-top:1px solid #E2E8F0;margin-top:28px;padding-top:9px;color:#64748B;font-size:9px}
        tr{page-break-inside:avoid}
      </style></head><body>
        <p class="eyebrow">TRACK MO, PAKE KO!</p><h1>System Report</h1>
        <p class="subtitle">Administrative overview of system-wide usage and activity</p>
        <div class="meta">
          <p><strong>Reporting period:</strong> ${escapeHtml(formatReportDate(start))} – ${escapeHtml(formatReportDate(inclusiveEnd))}</p>
          <p><strong>Filter:</strong> ${period === 'this' ? 'This Month' : period === 'last' ? 'Last Month' : 'This Year'}</p>
          <p><strong>Date generated:</strong> ${escapeHtml(generatedAt)} (Philippine Time)</p>
          <p><strong>Generated by:</strong> ${escapeHtml(profile?.full_name || profile?.email || 'Administrator')}</p>
        </div>

        <h2>1. System Overview</h2>
        <table class="cards"><tr>
          <td><div class="metric">${totalUsers.toLocaleString()}</div><div class="metric-label">Total registered users</div></td>
          <td><div class="metric">${stats.active_users.toLocaleString()}</div><div class="metric-label">${activeLabel}</div></td>
          <td><div class="metric">${stats.new_users.toLocaleString()}</div><div class="metric-label">${newUserLabel}</div></td>
        </tr></table>
        <div class="note"><strong>${stats.expenses_count.toLocaleString()}</strong> ${expenseLabel.toLowerCase()}.</div>

        <h2>2. User Growth Statistics</h2>
        <p class="muted">Total registered users by month over the last six months.</p>
        ${growthRows ? `<table class="data"><tr><th>Month</th><th class="number">Total registered users</th></tr>${growthRows}</table>` : '<p class="muted">No user growth data available.</p>'}

        <h2>3. Expense Statistics</h2>
        <table class="data"><tr><th>Metric</th><th class="number">Count</th></tr>
          <tr><td>${escapeHtml(expenseLabel)}</td><td class="number">${stats.expenses_count.toLocaleString()}</td></tr>
        </table>
        <p class="muted">Expense statistics represent non-archived system records within the selected date range. Individual transaction details are not included.</p>

        <h2>4. Most Used Expense Categories</h2>
        ${categoryRows ? `<table class="data"><tr><th>Category</th><th class="number">Usage count</th><th class="number">Share</th></tr>${categoryRows}</table>` : '<p class="muted">No category usage data for this reporting period.</p>'}

        <h2>5. Summary and Observations</h2>
        ${observations.map((item) => `<p class="note">${escapeHtml(item)}</p>`).join('')}

        <div class="footer">
          <strong>Track Mo, Pake Ko! — System Generated Report</strong><br>
          Prepared by: ${escapeHtml(profile?.full_name || profile?.email || 'Administrator')}<br>
          Generated: ${escapeHtml(generatedAt)} · All figures are aggregated system-wide statistics.
        </div>
      </body></html>`
      const file = await Print.printToFileAsync({ html })
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: 'Share system report PDF' })
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

          <View style={styles.exportRow}>
            <Pressable style={styles.exportButton} onPress={exportPdf} disabled={loading || exporting || !stats}>
              <Text style={styles.exportText}>{exporting ? 'Preparing…' : 'Export PDF'}</Text>
            </Pressable>
            <Pressable style={[styles.exportButton, styles.csvButton]} onPress={exportCsv} disabled={loading || exporting || !stats}>
              <Text style={styles.exportText}>{exporting ? 'Preparing…' : 'Export CSV'}</Text>
            </Pressable>
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
