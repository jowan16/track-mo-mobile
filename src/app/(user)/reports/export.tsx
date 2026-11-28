import { useAppTheme } from '@/context/ThemeContext'
import React, { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import * as FileSystem from 'expo-file-system/legacy'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import { UserPageHeader } from '@/components/user-navigation'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/services/supabase'
import { csvCell, htmlText } from '@/utils/userHelpers'

type ExportKind = 'detailed' | 'category' | 'monthly'

type ExpenseRow = {
  id: string
  category_id: number
  amount: number
  spent_on: string
  payment_method: string | null
  note: string | null
  is_archived: boolean
}

type ExportRow = {
  id: string
  date: string
  category: string
  note: string
  payment: string
  amount: number
  archived: boolean
}

type CategoryTotal = {
  category: string
  total: number
  count: number
}

type PeriodTotal = {
  period: string
  total: number
  count: number
}

type ExportTable = {
  headers: string[]
  data: (string | number)[][]
}

type CategoryRow = {
  id: number
  name: string
}

const LIGHT_C = {
  background: '#f6f7f5',
  card: '#ffffff',
  ink: '#14201c',
  muted: '#64716c',
  line: '#e4e8e5',
  brand: '#0f766e',
}
function getC(dark: boolean) { return dark ? {
  background: '#101a18',
  card: '#1b2a26',
  ink: '#edf5f1',
  muted: '#a9b8b1',
  line: '#30413a',
  brand: '#55c6b0',
} : LIGHT_C }

const money = (value: number) =>
  '₱' + Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const dateKey = (date: Date) =>
  date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')

const dateLabel = (value: string, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) =>
  new Date(value + 'T00:00:00').toLocaleDateString('en-PH', options)

export default function ReportExportScreen() {
  const { resolvedTheme } = useAppTheme()
  const dark = resolvedTheme === 'dark'
  const C = getC(dark)
  const styles = makeStyles(dark, C)

  const { profile } = useAuth()
  const params = useLocalSearchParams<{ format?: string; mode?: string; year?: string; month?: string; weekStart?: string }>()
  const format = params.format === 'pdf' ? 'pdf' : 'csv'
  const reportMode = params.mode === 'weekly' || params.mode === 'yearly' ? params.mode : 'monthly'
  const currentDate = new Date()
  const reportYear = Number(params.year) || currentDate.getFullYear()
  const reportMonth = Math.min(12, Math.max(1, Number(params.month) || currentDate.getMonth() + 1))
  const currentWeekStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate())
  currentWeekStart.setDate(currentWeekStart.getDate() - ((currentWeekStart.getDay() + 6) % 7))
  const parsedWeekStart = params.weekStart && /^\d{4}-\d{2}-\d{2}$/.test(params.weekStart)
    ? new Date(params.weekStart + 'T00:00:00')
    : currentWeekStart
  const reportWeekStart = Number.isNaN(parsedWeekStart.getTime()) ? currentWeekStart : parsedWeekStart
  const reportPeriodLabel = reportMode === 'weekly'
    ? (() => {
        const end = new Date(reportWeekStart)
        end.setDate(end.getDate() + 6)
        return reportWeekStart.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) + ' – ' + end.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
      })()
    : reportMode === 'monthly'
      ? new Date(reportYear, reportMonth - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
      : String(reportYear)

  const [kind, setKind] = useState<ExportKind>('detailed')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [loading, setLoading] = useState(false)

  const loadRows = async (): Promise<ExportRow[]> => {
    if (!profile?.id) throw new Error('Please sign in again.')

    const start = reportMode === 'weekly'
      ? new Date(reportWeekStart)
      : reportMode === 'monthly'
        ? new Date(reportYear, reportMonth - 1, 1)
        : new Date(reportYear, 0, 1)
    const end = reportMode === 'weekly'
      ? new Date(reportWeekStart)
      : reportMode === 'monthly'
        ? new Date(reportYear, reportMonth, 1)
        : new Date(reportYear + 1, 0, 1)
    if (reportMode === 'weekly') end.setDate(end.getDate() + 7)

    const from = dateKey(start)
    const to = dateKey(end)

    const [categoryResult, trackedResult, expenseResult] = await Promise.all([
      supabase.from('categories').select('id,name'),
      supabase.from('user_categories').select('category_id').eq('user_id', profile.id),
      supabase.from('expenses')
        .select('id,category_id,amount,spent_on,payment_method,note,is_archived')
        .eq('user_id', profile.id)
        .gte('spent_on', from)
        .lt('spent_on', to)
        .order('spent_on', { ascending: true })
        .order('id', { ascending: true }),
    ])

    if (categoryResult.error) throw categoryResult.error
    if (trackedResult.error) throw trackedResult.error
    if (expenseResult.error) throw expenseResult.error

    const categories = (categoryResult.data || []) as CategoryRow[]
    const trackedIds = new Set<number>(
      (trackedResult.data || []).map((item: { category_id: number }) => item.category_id),
    )
    const categoryNames = new Map<number, string>(categories.map((item): [number, string] => [item.id, item.name]))

    const expenses = ((expenseResult.data || []) as ExpenseRow[])
      .filter((item) => trackedIds.has(item.category_id))
      .filter((item) => includeArchived || !item.is_archived)

    return expenses.map((item) => {
      const parsedAmount = Number(item.amount)
      return {
        id: item.id,
        date: item.spent_on,
        category: categoryNames.get(item.category_id) || 'Uncategorized',
        note: item.note || '',
        payment: item.payment_method || '',
        amount: Number.isFinite(parsedAmount) ? parsedAmount : 0,
        archived: Boolean(item.is_archived),
      }
    })
  }

  const buildCategoryTotals = (rows: ExportRow[]): CategoryTotal[] => {
    const grouped = new Map<string, CategoryTotal>()
    rows.forEach((row) => {
      const current = grouped.get(row.category) || { category: row.category, total: 0, count: 0 }
      current.total += row.amount
      current.count += 1
      grouped.set(row.category, current)
    })
    return [...grouped.values()].sort((a, b) => b.total - a.total || a.category.localeCompare(b.category))
  }

  const buildPeriodTotals = (rows: ExportRow[]): PeriodTotal[] => {
    if (reportMode === 'yearly') {
      return Array.from({ length: 12 }, (_, monthIndex) => {
        const monthRows = rows.filter((row) => Number(row.date.slice(5, 7)) === monthIndex + 1)
        return {
          period: new Date(reportYear, monthIndex, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }),
          total: monthRows.reduce((sum, row) => sum + row.amount, 0),
          count: monthRows.length,
        }
      })
    }

    if (reportMode === 'weekly') {
      return Array.from({ length: 7 }, (_, index) => {
        const date = new Date(reportWeekStart)
        date.setDate(date.getDate() + index)
        const key = dateKey(date)
        const dayRows = rows.filter((row) => row.date === key)
        return {
          period: date.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' }),
          total: dayRows.reduce((sum, row) => sum + row.amount, 0),
          count: dayRows.length,
        }
      })
    }

    const daysInMonth = new Date(reportYear, reportMonth, 0).getDate()
    const weeks = Math.ceil(daysInMonth / 7)
    return Array.from({ length: weeks }, (_, index) => {
      const firstDay = (index * 7) + 1
      const lastDay = Math.min(firstDay + 6, daysInMonth)
      const weekRows = rows.filter((row) => {
        const day = Number(row.date.slice(8, 10))
        return day >= firstDay && day <= lastDay
      })
      return {
        period: 'Days ' + firstDay + '–' + lastDay,
        total: weekRows.reduce((sum, row) => sum + row.amount, 0),
        count: weekRows.length,
      }
    })
  }

  const buildCsvReportData = (rows: ExportRow[]): ExportTable => {
    if (kind === 'detailed') {
      return {
        headers: ['Expense ID', 'Date (YYYY-MM-DD)', 'Category', 'Description', 'Payment Method', 'Amount (PHP)', 'Archived'],
        data: rows.map((row) => [
          row.id,
          row.date,
          row.category,
          row.note,
          row.payment,
          row.amount.toFixed(2),
          row.archived ? 'Yes' : 'No',
        ]),
      }
    }

    if (kind === 'category') {
      const total = rows.reduce((sum, row) => sum + row.amount, 0)
      return {
        headers: ['Category', 'Total Amount (PHP)', 'Share (%)', 'Expense Count'],
        data: buildCategoryTotals(rows).map((item) => [
          item.category,
          item.total.toFixed(2),
          total > 0 ? ((item.total / total) * 100).toFixed(1) : '0.0',
          item.count,
        ]),
      }
    }

    if (reportMode === 'yearly' || reportMode === 'weekly') {
      return {
        headers: ['Period', 'Total Amount (PHP)', 'Expense Count'],
        data: buildPeriodTotals(rows).map((item) => [item.period, item.total.toFixed(2), item.count]),
      }
    }

    const total = rows.reduce((sum, row) => sum + row.amount, 0)
    return {
      headers: ['Report Period', 'Total Amount (PHP)', 'Expense Count'],
      data: [[reportPeriodLabel, total.toFixed(2), rows.length]],
    }
  }

  const getExportFileBase = () => {
    const period = reportMode === 'weekly'
      ? 'week-' + reportWeekStart.getFullYear() + '-' + String(reportWeekStart.getMonth() + 1).padStart(2, '0') + '-' + String(reportWeekStart.getDate()).padStart(2, '0')
      : reportMode === 'monthly'
        ? reportYear + '-' + String(reportMonth).padStart(2, '0')
        : String(reportYear)
    return 'trackmo-' + kind + '-' + period + '-' + Date.now()
  }

  const exportCsv = async () => {
    setLoading(true)
    try {
      const rows = await loadRows()
      if (!rows.length) {
        Alert.alert('No records', 'There are no expenses to export for ' + reportPeriodLabel + '.')
        return
      }

      const { headers, data } = buildCsvReportData(rows)
      const csv = [headers, ...data]
        .map((line) => line.map(csvCell).join(','))
        .join('\r\n')

      if (!FileSystem.cacheDirectory) throw new Error('File storage is unavailable on this device.')
      const uri = FileSystem.cacheDirectory + getExportFileBase() + '.csv'
      await FileSystem.writeAsStringAsync(uri, '\uFEFF' + csv, { encoding: FileSystem.EncodingType.UTF8 })

      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing unavailable', 'File sharing is not available on this device.')
        return
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'text/csv',
        UTI: 'public.comma-separated-values-text',
        dialogTitle: 'Share your Track Mo CSV report',
      })
    } catch (error) {
      Alert.alert('CSV export failed', error instanceof Error ? error.message : 'Unable to create the CSV file.')
    } finally {
      setLoading(false)
    }
  }

  const buildPdfTable = (
    headers: string[],
    data: (string | number)[][],
    rightAlignedColumns: number[] = [],
  ) => {
    const rightAligned = new Set(rightAlignedColumns)
    const heading = '<thead><tr>' + headers.map((header, index) =>
      '<th' + (rightAligned.has(index) ? ' class="numeric"' : '') + '>' + htmlText(header) + '</th>',
    ).join('') + '</tr></thead>'
    const body = '<tbody>' + data.map((row) =>
      '<tr>' + row.map((cell, index) =>
        '<td' + (rightAligned.has(index) ? ' class="numeric"' : '') + '>' + htmlText(cell) + '</td>',
      ).join('') + '</tr>',
    ).join('') + '</tbody>'
    return '<table>' + heading + body + '</table>'
  }

  const exportPdf = async () => {
    setLoading(true)
    try {
      const rows = await loadRows()
      if (!rows.length) {
        Alert.alert('No records', 'There are no expenses to export for ' + reportPeriodLabel + '.')
        return
      }

      const total = rows.reduce((sum, row) => sum + row.amount, 0)
      const count = rows.length
      const average = count > 0 ? total / count : 0
      const largest = [...rows].sort((a, b) => b.amount - a.amount)[0]
      const categories = buildCategoryTotals(rows)
      const categoryTotalRows = categories.map((item) => [
        item.category,
        money(item.total),
        total > 0 ? ((item.total / total) * 100).toFixed(1) + '%' : '0.0%',
        String(item.count),
      ])

      const topCategoryLimit = kind === 'category' ? 12 : 8
      const visibleCategoryRows = categoryTotalRows.slice(0, topCategoryLimit)
      if (categoryTotalRows.length > topCategoryLimit) {
        const remaining = categories.slice(topCategoryLimit)
        const otherTotal = remaining.reduce((sum, item) => sum + item.total, 0)
        const otherCount = remaining.reduce((sum, item) => sum + item.count, 0)
        visibleCategoryRows.push([
          'Other categories',
          money(otherTotal),
          total > 0 ? ((otherTotal / total) * 100).toFixed(1) + '%' : '0.0%',
          String(otherCount),
        ])
      }

      const periodTotals = buildPeriodTotals(rows)
      const generatedAt = new Date().toLocaleString('en-PH', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
      const contentSections: string[] = []

      if (kind === 'monthly') {
        contentSections.push(
          '<section><h2>Spending by period</h2><p class="section-note">A time-based summary of expenses in the selected reporting period.</p>' +
          buildPdfTable(
            ['Period', 'Total Spent', 'Transactions'],
            periodTotals.map((item) => [item.period, money(item.total), String(item.count)]),
            [1, 2],
          ) + '</section>',
        )
      } else {
        contentSections.push(
          '<section><h2>Spending by category</h2><p class="section-note">Categories are limited to the categories currently tracked by your account.</p>' +
          buildPdfTable(
            ['Category', 'Total Spent', 'Share', 'Transactions'],
            visibleCategoryRows,
            [1, 2, 3],
          ) + '</section>',
        )
      }

      if (kind === 'detailed') {
        const largestRows = [...rows]
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 3)
          .map((row) => [dateLabel(row.date), row.category, money(row.amount)])
        contentSections.push(
          '<section><h2>Largest transactions</h2><p class="section-note">The three highest-value expenses in this report.</p>' +
          buildPdfTable(['Date', 'Category', 'Amount'], largestRows, [2]) + '</section>',
        )
      }

      const kindTitle = kind === 'detailed'
        ? 'Spending Overview'
        : kind === 'category'
          ? 'Category Summary'
          : 'Period Breakdown'
      const archiveLabel = includeArchived ? 'Active and archived expenses' : 'Active expenses only'
      const html = [
        '<!doctype html>',
        '<html><head><meta charset="utf-8" />',
        '<meta name="viewport" content="width=device-width, initial-scale=1" />',
        '<title>Track Mo, Pake Ko! — ' + htmlText(kindTitle) + '</title>',
        '<style>',
        '@page { size: A4; margin: 18mm 15mm 20mm; }',
        '@page { @bottom-right { content: "Page " counter(page) " of " counter(pages); font-family: Arial, sans-serif; font-size: 8pt; color: #718078; } }',
        '* { box-sizing: border-box; }',
        'body { margin: 0; color: #17231f; font-family: Arial, Helvetica, sans-serif; font-size: 10pt; line-height: 1.45; }',
        '.header { border-bottom: 2px solid #0f766e; padding-bottom: 14px; margin-bottom: 18px; }',
        '.brand { color: #0f766e; font-size: 9pt; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; }',
        'h1 { font-size: 22pt; line-height: 1.2; margin: 5px 0 4px; color: #14201c; }',
        '.subtitle { color: #64716c; font-size: 10pt; margin: 0; }',
        '.meta { display: flex; flex-wrap: wrap; gap: 8px 28px; margin-top: 13px; color: #64716c; font-size: 8.5pt; }',
        '.meta strong { display: block; color: #263831; font-size: 8pt; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 2px; }',
        '.metrics { display: flex; flex-wrap: wrap; gap: 9px; margin: 18px 0 20px; }',
        '.metric { flex: 1 1 22%; min-width: 115px; border: 1px solid #e1e8e4; border-radius: 7px; padding: 11px 10px; background: #f7faf8; }',
        '.metric.primary { background: #eaf5f1; border-color: #cfe5dc; }',
        '.metric-label { color: #64716c; text-transform: uppercase; font-size: 7.5pt; letter-spacing: .6px; font-weight: 700; }',
        '.metric-value { color: #14201c; font-size: 14pt; font-weight: 700; margin-top: 5px; overflow-wrap: anywhere; }',
        'section { margin-top: 17px; page-break-inside: avoid; }',
        'h2 { margin: 0 0 4px; color: #14201c; font-size: 12pt; }',
        '.section-note { margin: 0 0 8px; color: #718078; font-size: 8.5pt; }',
        'table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 8.5pt; }',
        'thead { display: table-header-group; }',
        'tr { page-break-inside: avoid; }',
        'th { background: #edf5f2; color: #25453c; font-weight: 700; text-align: left; }',
        'th, td { border-bottom: 1px solid #e2e9e5; padding: 8px 7px; vertical-align: top; }',
        'tbody tr:nth-child(even) { background: #fafcfb; }',
        '.numeric { text-align: right; white-space: nowrap; }',
        '.highlight { margin-top: 16px; border-left: 3px solid #0f766e; background: #f4f8f6; padding: 10px 12px; color: #46554e; font-size: 9pt; }',
        '.footer { position: fixed; bottom: -13mm; left: 0; right: 0; border-top: 1px solid #e2e9e5; padding-top: 6px; color: #87938d; font-size: 7.5pt; text-align: center; }',
        '</style></head><body>',
        '<header class="header">',
        '<div class="brand">Track Mo, Pake Ko!</div>',
        '<h1>' + htmlText(kindTitle) + '</h1>',
        '<p class="subtitle">Personal spending statement</p>',
        '<div class="meta">',
        '<div><strong>Reporting period</strong>' + htmlText(reportPeriodLabel) + '</div>',
        '<div><strong>Expense records</strong>' + String(count) + '</div>',
        '<div><strong>Included records</strong>' + htmlText(archiveLabel) + '</div>',
        '<div><strong>Generated</strong>' + htmlText(generatedAt) + '</div>',
        '</div></header>',
        '<div class="metrics">',
        '<div class="metric primary"><div class="metric-label">Total spent</div><div class="metric-value">' + htmlText(money(total)) + '</div></div>',
        '<div class="metric"><div class="metric-label">Transactions</div><div class="metric-value">' + String(count) + '</div></div>',
        '<div class="metric"><div class="metric-label">Average expense</div><div class="metric-value">' + htmlText(money(average)) + '</div></div>',
        '<div class="metric"><div class="metric-label">Largest expense</div><div class="metric-value">' + htmlText(money(largest.amount)) + '</div></div>',
        '</div>',
        contentSections.join(''),
        '<div class="highlight"><strong>Report scope:</strong> Includes expenses from your tracked categories for the selected period. ' +
          'The figures are calculated from the expense records available to your signed-in account.</div>',
        '<div class="footer">Track Mo, Pake Ko! · Personal financial report · ' + htmlText(reportPeriodLabel) + '</div>',
        '</body></html>',
      ].join('')

      const printed = await Print.printToFileAsync({ html, width: 595, height: 842 })
      if (!FileSystem.cacheDirectory) throw new Error('File storage is unavailable on this device.')
      const uri = FileSystem.cacheDirectory + getExportFileBase() + '.pdf'
      await FileSystem.copyAsync({ from: printed.uri, to: uri })

      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing unavailable', 'File sharing is not available on this device.')
        return
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
        dialogTitle: 'Share your Track Mo PDF report',
      })
    } catch (error) {
      Alert.alert('PDF export failed', error instanceof Error ? error.message : 'Unable to create the PDF file.')
    } finally {
      setLoading(false)
    }
  }

  const exportReport = format === 'csv' ? exportCsv : exportPdf
  const reportOptions: { value: ExportKind; title: string; description: string }[] = format === 'csv'
    ? [
        { value: 'detailed', title: 'Transaction details', description: 'One row per expense, including its ID, date, category, payment method and archive status' },
        { value: 'category', title: 'Category summary', description: 'Totals, percentage share and transaction count for each category' },
        { value: 'monthly', title: reportMode === 'yearly' ? 'Monthly breakdown' : reportMode === 'weekly' ? 'Daily breakdown' : 'Period summary', description: reportMode === 'yearly' ? 'Expense totals for each month of the selected year' : reportMode === 'weekly' ? 'Expense totals for each day of the selected week' : 'One summary row for the selected month' },
      ]
    : [
        { value: 'detailed', title: 'Spending overview', description: 'Key financial totals, category summary and the largest transactions' },
        { value: 'category', title: 'Category summary', description: 'A concise category comparison with totals and percentage shares' },
        { value: 'monthly', title: reportMode === 'yearly' ? 'Monthly breakdown' : reportMode === 'weekly' ? 'Daily breakdown' : 'Period breakdown', description: reportMode === 'yearly' ? 'Compare spending across the 12 months' : reportMode === 'weekly' ? 'Compare daily spending for the selected week' : 'Compare spending in weekly groups within the selected month' },
      ]

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <UserPageHeader title="Export report" subtitle="Create a file you can share" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.introCard}>
          <View style={styles.introIcon}>
            <Text style={styles.introIconText}>{format === 'csv' ? 'CSV' : 'PDF'}</Text>
          </View>
          <View style={styles.introCopy}>
            <Text style={styles.introTitle}>Prepare your report</Text>
            <Text style={styles.introDescription}>
              {format === 'csv'
                ? 'Choose a structured dataset for spreadsheets.'
                : 'Choose a concise financial statement for sharing or printing.'}
            </Text>
          </View>
          <View style={styles.periodPill}>
            <Text style={styles.periodPillText}>{reportPeriodLabel}</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>1. Report content</Text>
            <Text style={styles.sectionHint}>Select the information to include</Text>
          </View>
          {reportOptions.map((item) => (
            <Pressable
              key={item.value}
              accessibilityRole="button"
              accessibilityState={{ selected: kind === item.value }}
              onPress={() => setKind(item.value)}
              style={[styles.reportType, kind === item.value && styles.reportTypeSelected]}
            >
              <View style={styles.reportTypeCopy}>
                <Text style={[styles.reportTypeTitle, kind === item.value && styles.selectedText]}>{item.title}</Text>
                <Text style={styles.reportTypeDescription}>{item.description}</Text>
              </View>
              <View style={[styles.radioOuter, kind === item.value && styles.radioOuterSelected]}>
                {kind === item.value ? <View style={styles.radioInner} /> : null}
              </View>
            </Pressable>
          ))}
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>2. Archived expenses</Text>
            <Text style={styles.sectionHint}>Choose whether archived transactions are included</Text>
          </View>
          <View style={styles.archiveOptions}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: !includeArchived }}
              onPress={() => setIncludeArchived(false)}
              style={[styles.archiveOption, !includeArchived && styles.archiveOptionSelected]}
            >
              <Text style={[styles.archiveOptionTitle, !includeArchived && styles.selectedText]}>Exclude</Text>
              <Text style={styles.archiveOptionHint}>Active expenses only</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: includeArchived }}
              onPress={() => setIncludeArchived(true)}
              style={[styles.archiveOption, includeArchived && styles.archiveOptionSelected]}
            >
              <Text style={[styles.archiveOptionTitle, includeArchived && styles.selectedText]}>Include</Text>
              <Text style={styles.archiveOptionHint}>Active and archived</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.periodCard}>
          <Text style={styles.periodCardTitle}>Report period</Text>
          <Text style={styles.periodCardValue}>{reportPeriodLabel}</Text>
          <Text style={styles.periodCardDescription}>
            Only expenses from your tracked categories are included. Archived expenses are {includeArchived ? 'included' : 'excluded'}.
          </Text>
        </View>

        <Pressable
          disabled={loading}
          onPress={exportReport}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed, loading && styles.disabledButton]}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <Text style={styles.primaryButtonText}>Generate {format.toUpperCase()} report</Text>
              <Text style={styles.primaryButtonHint}>Create and share your file</Text>
            </>
          )}
        </Pressable>

        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>Back to Reports</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}

function makeStyles(dark: boolean, C: any) { return StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  content: { padding: 16, paddingBottom: 36, gap: 14 },
  introCard: { backgroundColor: C.card, borderRadius: 17, borderWidth: 1, borderColor: C.line, padding: 16, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  introIcon: { width: 48, height: 48, borderRadius: 13, backgroundColor: dark ? '#203d36' : '#e5f3ef', alignItems: 'center', justifyContent: 'center' },
  introIconText: { color: C.brand, fontSize: 12, fontWeight: '900' },
  introCopy: { flex: 1, minWidth: 150, gap: 4 },
  introTitle: { color: C.ink, fontSize: 17, fontWeight: '900' },
  introDescription: { color: C.muted, fontSize: 12, lineHeight: 17 },
  periodPill: { backgroundColor: dark ? '#203d36' : '#e5f3ef', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  periodPillText: { color: C.brand, fontSize: 11, fontWeight: '800' },
  sectionCard: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 15, gap: 12 },
  sectionHeading: { gap: 4 },
  sectionTitle: { color: C.ink, fontSize: 15, fontWeight: '900' },
  sectionHint: { color: C.muted, fontSize: 11, lineHeight: 16 },
  formatGrid: { flexDirection: 'row', gap: 10 },
  formatCard: { flex: 1, minWidth: 0, minHeight: 142, borderWidth: 1, borderColor: C.line, borderRadius: 13, padding: 11, gap: 7, backgroundColor: C.background },
  formatCardSelected: { borderColor: C.brand, backgroundColor: dark ? '#203d36' : '#f0f8f5' },
  formatIcon: { width: 40, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  csvIcon: { backgroundColor: dark ? '#29483f' : '#e0f2eb' },
  pdfIcon: { backgroundColor: dark ? '#4a302d' : '#fff0ed' },
  formatIconText: { color: C.brand, fontSize: 11, fontWeight: '900' },
  pdfText: { color: dark ? '#ff9b8e' : '#bd3e32' },
  formatName: { color: C.ink, fontSize: 12, fontWeight: '800' },
  formatDescription: { color: C.muted, fontSize: 10, lineHeight: 14 },
  selectionMark: { position: 'absolute', top: 9, right: 9, width: 19, height: 19, borderRadius: 10, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  selectionMarkActive: { backgroundColor: C.brand, borderColor: C.brand },
  checkMark: { color: '#ffffff', fontSize: 12, fontWeight: '900' },
  reportType: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 12, backgroundColor: C.background },
  reportTypeSelected: { borderColor: C.brand, backgroundColor: dark ? '#203d36' : '#f0f8f5' },
  reportTypeCopy: { flex: 1, gap: 4 },
  reportTypeTitle: { color: C.ink, fontSize: 13, fontWeight: '800' },
  reportTypeDescription: { color: C.muted, fontSize: 11, lineHeight: 16 },
  radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  radioOuterSelected: { borderColor: C.brand },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.brand },
  archiveOptions: { flexDirection: 'row', gap: 10 },
  archiveOption: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 12, gap: 4, backgroundColor: C.background },
  archiveOptionSelected: { borderColor: C.brand, backgroundColor: dark ? '#203d36' : '#f0f8f5' },
  archiveOptionTitle: { color: C.ink, fontSize: 13, fontWeight: '800' },
  archiveOptionHint: { color: C.muted, fontSize: 10, lineHeight: 14 },
  selectedText: { color: C.brand },
  periodCard: { backgroundColor: C.card, borderRadius: 15, borderWidth: 1, borderColor: C.line, padding: 15, gap: 5 },
  periodCardTitle: { color: C.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  periodCardValue: { color: C.ink, fontSize: 19, fontWeight: '900' },
  periodCardDescription: { color: C.muted, fontSize: 11, lineHeight: 17 },
  primaryButton: { backgroundColor: C.brand, borderRadius: 13, paddingVertical: 15, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 58 },
  primaryButtonPressed: { opacity: 0.88 },
  disabledButton: { opacity: 0.65 },
  primaryButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  primaryButtonHint: { color: '#d8efeb', fontSize: 10, fontWeight: '600' },
  backButton: { alignItems: 'center', padding: 12 },
  backText: { color: C.brand, fontWeight: '800', fontSize: 13 },
}) }
