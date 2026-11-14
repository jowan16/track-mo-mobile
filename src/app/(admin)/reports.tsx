import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Platform,
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
type CurrencyTotal = { currency_code: string; total_amount: number | string }
type TopCategory = {
  category_id: number
  category_name: string
  category_icon: string
  category_color: string
  uses: number
  percentage: number
}
type Growth = { label: string; total: number }
type ExpenseRow = {
  expense_id: string
  spent_on: string
  amount: number | string
  currency_code: string
  category_name: string
  payment_method: string
  note: string
  created_at: string
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`)
  return new Intl.DateTimeFormat('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function formatAmount(value: number | string, currency: string) {
  const amount = Number(value) || 0
  try {
    if (currency !== 'UNSPECIFIED') {
      return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount)
    }
  } catch {
    // Fall back to an explicit currency code for unexpected currency values.
  }
  return `${currency} ${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function escapeHtml(value: unknown) {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }
  return String(value ?? '').replace(/[&<>"']/g, (character) => entities[character] ?? character)
}

function csvCell(value: unknown) {
  let text = String(value ?? '')
  // Prevent spreadsheet formula execution from free-text notes or category names.
  if (/^\s*[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

function downloadWebFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function AdminReportsScreen() {
  const [period, setPeriod] = useState<Period>('this')
  const [stats, setStats] = useState<ReportStats | null>(null)
  const [currencyTotals, setCurrencyTotals] = useState<CurrencyTotal[]>([])
  const [top, setTop] = useState<TopCategory[]>([])
  const [growth, setGrowth] = useState<Growth[]>([])
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)

  const { start, end, periodLabel } = useMemo(() => {
    const today = new Date()
    const todayKey = dateKey(today)
    const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1)

    if (period === 'year') {
      return {
        start: `${today.getFullYear()}-01-01`,
        end: dateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)),
        periodLabel: `This year (Jan 1 – ${formatDate(todayKey)}, ${today.getFullYear()})`,
      }
    }

    if (period === 'last') {
      const previousMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      return {
        start: dateKey(previousMonthStart),
        end: dateKey(currentMonthStart),
        periodLabel: `Last month (${formatDate(dateKey(previousMonthStart))} – ${formatDate(dateKey(new Date(today.getFullYear(), today.getMonth(), 0)))})`,
      }
    }

    return {
      start: dateKey(currentMonthStart),
      end: dateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)),
      periodLabel: `This month (${formatDate(dateKey(currentMonthStart))} – ${formatDate(todayKey)})`,
    }
  }, [period])

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      setError('')
      const [s, totals, t, g, e] = await Promise.all([
        supabase.rpc('admin_period_stats', { p_start: start, p_end: end }),
        supabase.rpc('admin_period_currency_totals', { p_start: start, p_end: end }),
        supabase.rpc('admin_top_categories', { p_start: start, p_end: end }),
        supabase.rpc('admin_user_growth'),
        supabase.rpc('admin_period_expenses', { p_start: start, p_end: end }),
      ])

      const failure = s.error || totals.error || t.error || g.error || e.error
      if (failure) {
        if (active) {
          setError(failure.message)
          setStats(null)
          setCurrencyTotals([])
          setTop([])
          setGrowth([])
          setExpenses([])
        }
      } else if (active) {
        setStats((s.data?.[0] ?? null) as ReportStats | null)
        setCurrencyTotals((totals.data ?? []) as CurrencyTotal[])
        setTop((t.data ?? []) as TopCategory[])
        setGrowth((g.data ?? []) as Growth[])
        setExpenses((e.data ?? []) as ExpenseRow[])
      }
      if (active) setLoading(false)
    }

    void load()
    return () => { active = false }
  }, [start, end])

  const totalCards = [
    { label: 'New users', value: stats?.new_users ?? 0 },
    { label: 'Expenses recorded', value: stats?.expenses_count ?? 0 },
    { label: 'Active users', value: stats?.active_users ?? 0 },
  ]
  const expenseTotalLabel = currencyTotals.length
    ? currencyTotals.map((item) => formatAmount(item.total_amount, item.currency_code)).join(' · ')
    : '—'
  const maxGrowth = Math.max(1, ...growth.map((item) => item.total))

  const exportCsv = async () => {
    if (!stats || exporting) return
    setExporting(true)
    try {
      const rows: unknown[][] = [
        ['Record Type', 'Report Period', 'Metric', 'Value', 'Percentage', 'Expense ID', 'Transaction Date', 'Category', 'Currency', 'Amount', 'Payment Method', 'Note'],
        ...totalCards.map((card) => ['SUMMARY', periodLabel, card.label, card.value, '', '', '', '', '', '', '', '']),
        ...currencyTotals.map((item) => ['SUMMARY', periodLabel, 'Expense total', '', '', '', '', '', item.currency_code, Number(item.total_amount).toFixed(2), '', '']),
        ...top.map((item) => ['CATEGORY', periodLabel, item.category_name, item.uses, `${Number(item.percentage).toFixed(2)}%`, '', '', item.category_name, '', '', '', '']),
        ...expenses.map((item) => ['TRANSACTION', periodLabel, '', '', '', item.expense_id, item.spent_on, item.category_name, item.currency_code, Number(item.amount).toFixed(2), item.payment_method, item.note]),
      ]
      const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`
      const filename = `trackmo-system-report-${start}-to-${end}.csv`

      if (Platform.OS === 'web') {
        downloadWebFile(filename, csv, 'text/csv;charset=utf-8')
      } else {
        if (!FileSystem.cacheDirectory) throw new Error('File storage is unavailable.')
        const uri = `${FileSystem.cacheDirectory}${filename}`
        await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 })
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: 'Export system report CSV' })
        } else {
          Alert.alert('CSV created', `The CSV file was saved to: ${uri}`)
        }
      }
    } catch (err) {
      Alert.alert('CSV export failed', err instanceof Error ? err.message : 'Unable to export CSV.')
    } finally {
      setExporting(false)
    }
  }

  const exportPdf = async () => {
    if (!stats || exporting) return
    setExporting(true)
    try {
      const summaryRows = [
        ...totalCards.map((card) => `<tr><td>${escapeHtml(card.label)}</td><td>${card.value.toLocaleString()}</td></tr>`),
        ...currencyTotals.map((item) => `<tr><td>Expense total (${escapeHtml(item.currency_code)})</td><td>${escapeHtml(formatAmount(item.total_amount, item.currency_code))}</td></tr>`),
      ].join('')

      const categoryRows = top.length
        ? top.map((item, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(item.category_name)}</td><td>${Number(item.uses).toLocaleString()}</td><td>${Number(item.percentage).toFixed(2)}%</td></tr>`).join('')
        : '<tr><td colspan="4">No categorized expenses in this period.</td></tr>'

      const expenseRows = expenses.length
        ? expenses.map((item) => `<tr><td>${escapeHtml(formatDate(item.spent_on))}</td><td>${escapeHtml(item.category_name)}</td><td>${escapeHtml(formatAmount(item.amount, item.currency_code))}</td><td>${escapeHtml(item.payment_method || '—')}</td><td>${escapeHtml(item.note || '—')}</td><td>${escapeHtml(item.expense_id)}</td></tr>`).join('')
        : '<tr><td colspan="6">No transactions in this period.</td></tr>'

      const growthRows = growth.map((item) => `<tr><td>${escapeHtml(item.label)}</td><td>${item.total.toLocaleString()}</td></tr>`).join('')
      const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  @page{size:A4 landscape;margin:14mm}
  *{box-sizing:border-box}
  body{font-family:Arial,sans-serif;color:#172033;font-size:10px;line-height:1.45}
  h1{font-size:22px;color:#3730A3;margin:0 0 5px}
  h2{font-size:14px;color:#172033;margin:22px 0 8px}
  .sub{color:#64748B;margin:0 0 16px}
  .summary{width:100%;max-width:520px}
  table{width:100%;border-collapse:collapse;margin:8px 0 18px;table-layout:auto}
  th,td{padding:7px 8px;border:1px solid #E2E8F0;text-align:left;vertical-align:top;overflow-wrap:anywhere}
  th{background:#EEF2FF;color:#312E81;font-weight:700}
  tr{page-break-inside:avoid}
  .muted{color:#64748B;font-size:9px}
  .section{page-break-inside:avoid}
</style></head><body>
<h1>Track Mo, Pake Ko! — System Report</h1>
<p class="sub">${escapeHtml(periodLabel)}<br>Generated: ${escapeHtml(new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date()))}</p>
<div class="section"><h2>Report Summary</h2><table class="summary"><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>${summaryRows}</tbody></table></div>
<div class="section"><h2>Most Used Categories</h2><p class="muted">Percentages are calculated from all non-archived transactions with a category assigned in the selected period. Disabled categories remain included for historical accuracy.</p>
<table><thead><tr><th>Rank</th><th>Category</th><th>Transactions</th><th>Share</th></tr></thead><tbody>${categoryRows}</tbody></table></div>
<div class="section"><h2>Transactions (${expenses.length.toLocaleString()})</h2>
<table><thead><tr><th>Date</th><th>Category</th><th>Amount</th><th>Payment Method</th><th>Note</th><th>Expense ID</th></tr></thead><tbody>${expenseRows}</tbody></table></div>
<div class="section"><h2>User Growth</h2><table><thead><tr><th>Month</th><th>Total Registered Users</th></tr></thead><tbody>${growthRows}</tbody></table></div>
<p class="muted">System-wide report. Archived transactions are excluded from expense counts, currency totals, category statistics, and transaction details.</p>
</body></html>`

      if (Platform.OS === 'web') {
        // On web, Expo Print opens the browser print dialog; choose "Save as PDF".
        await Print.printToFileAsync({ html })
      } else {
        const file = await Print.printToFileAsync({ html })
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: 'Export system report PDF' })
        } else {
          await Share.share({ message: `System report PDF created: ${file.uri}` })
        }
      }
    } catch (err) {
      Alert.alert('PDF export failed', err instanceof Error ? err.message : 'Unable to export report.')
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
            {totalCards.map((card) => (
              <View key={card.label} style={styles.statCard}>
                <Text style={styles.statLabel}>{card.label}</Text>
                <Text style={styles.statValue}>{card.value.toLocaleString()}</Text>
              </View>
            ))}
            <View style={[styles.statCard, styles.totalCard]}>
              <Text style={styles.statLabel}>Expense total</Text>
              <Text style={styles.totalValue}>{expenseTotalLabel}</Text>
            </View>
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
            <Text style={styles.sectionHint}>Ranked by non-archived transactions. Percentages use all categorized transactions in the selected period; disabled categories are retained for historical accuracy.</Text>
            {top.length === 0 ? <Text style={styles.empty}>No categorized transactions in the selected period.</Text> : top.map((item, index) => (
              <View key={item.category_id} style={styles.topRow}>
                <View style={[styles.rank, { backgroundColor: item.category_color || adminColors.primary }]}>
                  <Text style={styles.rankText}>{index + 1}</Text>
                </View>
                <View style={styles.categoryDetails}>
                  <Text style={styles.topName}>{item.category_name || 'Category'}</Text>
                  <Text style={styles.topMeta}>{Number(item.uses).toLocaleString()} uses · {Number(item.percentage).toFixed(2)}%</Text>
                </View>
              </View>
            ))}
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
  statCard: { width: '47%', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: adminColors.border, borderRadius: 12, padding: 12, minHeight: 88, justifyContent: 'space-between' },
  totalCard: { width: '100%' },
  statLabel: { color: adminColors.muted, fontSize: 10, fontWeight: '700' },
  statValue: { color: adminColors.text, fontSize: 23, fontWeight: '900', marginTop: 12 },
  totalValue: { color: adminColors.text, fontSize: 16, fontWeight: '900', marginTop: 10 },
  section: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: adminColors.border, borderRadius: 13, padding: 14 },
  sectionTitle: { color: adminColors.text, fontSize: 14, fontWeight: '900' },
  sectionHint: { color: adminColors.muted, fontSize: 10, lineHeight: 15, marginTop: 4, marginBottom: 12 },
  empty: { color: adminColors.muted, fontSize: 11, textAlign: 'center', paddingVertical: 16 },
  growthRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  growthLabel: { color: adminColors.muted, width: 58, fontSize: 10 },
  barTrack: { flex: 1, height: 9, backgroundColor: '#EEF0F7', borderRadius: 10, overflow: 'hidden' },
  barFill: { height: 9, backgroundColor: adminColors.primary, borderRadius: 10 },
  growthValue: { color: adminColors.text, width: 28, textAlign: 'right', fontSize: 10, fontWeight: '800' },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 12 },
  rank: { width: 25, height: 25, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rankText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  categoryDetails: { flex: 1, gap: 3 },
  topName: { color: adminColors.text, fontSize: 11, fontWeight: '800' },
  topMeta: { color: adminColors.muted, fontSize: 10 },
})
