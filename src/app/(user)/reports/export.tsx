import { StaticLoader } from '@/components/StaticLoader'
import { useAppTheme } from '@/context/ThemeContext'
import React, { useState } from 'react'
import {
  Alert,
  Pressable,
  SafeAreaView,
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
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/services/supabase'

type ExportKind = 'detailed' | 'category' | 'monthly'

type ExpenseRow = {
  id: string
  category_id: string
  amount: number
  spent_on: string
  payment_method: string | null
  note: string | null
  is_archived: boolean
}

type CategoryRow = {
  id: string
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
  `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const csvCell = (value: unknown) =>
  `"${String(value ?? '').replace(/"/g, '""')}"`

const htmlText = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] || character)

export default function ReportExportScreen() {
  const { resolvedTheme } = useAppTheme()
  const dark = resolvedTheme === 'dark'
  const C = getC(dark)
  const styles = makeStyles(dark, C)

  const { profile } = useAuth()
  const params = useLocalSearchParams<{ format?: string; mode?: string; year?: string; month?: string }>()
  const initialFormat = params.format === 'pdf' ? 'pdf' : 'csv'
  const reportMode = params.mode === 'yearly' ? 'yearly' : 'monthly'
  const currentDate = new Date()
  const reportYear = Number(params.year) || currentDate.getFullYear()
  const reportMonth = Math.min(12, Math.max(1, Number(params.month) || currentDate.getMonth() + 1))
  const reportPeriodLabel = reportMode === 'monthly'
    ? new Date(reportYear, reportMonth - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
    : String(reportYear)

  const [format, setFormat] = useState<'csv' | 'pdf'>(initialFormat)
  const [kind, setKind] = useState<ExportKind>('detailed')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [loading, setLoading] = useState(false)

  const loadRows = async () => {
    if (!profile?.id) throw new Error('Please sign in again.')

    const start = reportMode === 'monthly'
      ? new Date(reportYear, reportMonth - 1, 1)
      : new Date(reportYear, 0, 1)
    const end = reportMode === 'monthly'
      ? new Date(reportYear, reportMonth, 1)
      : new Date(reportYear + 1, 0, 1)
    const from = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`
    const to = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-01`

    const [categoryResult, trackedResult, expenseResult] = await Promise.all([
      supabase.from('categories').select('id,name'),
      supabase.from('user_categories').select('category_id').eq('user_id', profile.id),
      supabase.from('expenses')
        .select('id,category_id,amount,spent_on,payment_method,note,is_archived')
        .eq('user_id', profile.id)
        .gte('spent_on', from)
        .lt('spent_on', to)
        .order('spent_on', { ascending: true }),
    ])

    if (categoryResult.error) throw categoryResult.error
    if (trackedResult.error) throw trackedResult.error
    if (expenseResult.error) throw expenseResult.error

    const categories = (categoryResult.data || []) as CategoryRow[]
    const trackedIds = new Set(
      (trackedResult.data || []).map((item: { category_id: string }) => item.category_id),
    )
    const categoryNames = new Map(categories.map((item) => [item.id, item.name]))

    const expenses = ((expenseResult.data || []) as ExpenseRow[])
      .filter((item) => trackedIds.has(item.category_id))
      .filter((item) => includeArchived || !item.is_archived)

    return expenses.map((item) => ({
      date: item.spent_on,
      category: categoryNames.get(item.category_id) || 'Uncategorized',
      note: item.note || '',
      payment: item.payment_method || '',
      amount: Number(item.amount) || 0,
    }))
  }

  const exportReport = async () => {
    setLoading(true)

    try {
      const rows = await loadRows()

      if (!rows.length) {
        Alert.alert('No records', `There are no expenses to export for ${reportPeriodLabel}.`)
        return
      }

      const now = new Date()
      const monthLabel = reportPeriodLabel

      let headers: string[]
      let data: (string | number)[][]

      if (kind === 'detailed') {
        headers = ['Date', 'Category', 'Note', 'Payment method', 'Amount']
        data = rows.map((row) => [
          row.date,
          row.category,
          row.note,
          row.payment,
          row.amount.toFixed(2),
        ])
      } else if (kind === 'category') {
        headers = ['Category', 'Total', 'Share (%)', 'Number of expenses']
        const grouped = new Map<string, { total: number; count: number }>()
        rows.forEach((row) => {
          const current = grouped.get(row.category) || { total: 0, count: 0 }
          current.total += row.amount
          current.count += 1
          grouped.set(row.category, current)
        })
        const total = rows.reduce((sum, row) => sum + row.amount, 0)
        data = [...grouped.entries()]
          .sort((a, b) => b[1].total - a[1].total)
          .map(([name, value]) => [
            name,
            value.total.toFixed(2),
            total ? ((value.total / total) * 100).toFixed(1) : '0',
            value.count,
          ])
      } else {
        headers = ['Month', 'Total', 'Number of expenses']
        if (reportMode === 'yearly') {
          const grouped = new Map<string, { total: number; count: number }>()
          rows.forEach((row) => {
            const date = new Date(`${row.date}T00:00:00`)
            const label = date.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
            const current = grouped.get(label) || { total: 0, count: 0 }
            current.total += row.amount
            current.count += 1
            grouped.set(label, current)
          })
          data = [...grouped.entries()].map(([label, value]) => [label, value.total.toFixed(2), value.count])
        } else {
          const total = rows.reduce((sum, row) => sum + row.amount, 0)
          data = [[monthLabel, total.toFixed(2), rows.length]]
        }
      }

      const csv = [headers, ...data]
        .map((line) => line.map(csvCell).join(','))
        .join('\n')

      if (format === 'csv') {
        const uri = `${FileSystem.cacheDirectory}trackmo-${kind}-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.csv`
        await FileSystem.writeAsStringAsync(uri, csv, {
          encoding: FileSystem.EncodingType.UTF8,
        })

        const canShare = await Sharing.isAvailableAsync()
        if (!canShare) {
          Alert.alert('Sharing unavailable', 'File sharing is not available on this device.')
          return
        }
        await Sharing.shareAsync(uri, {
          mimeType: 'text/csv',
          dialogTitle: 'Share your Track Mo report',
        })
      } else {
        const tableRows = data.map((line) =>
          `<tr>${line.map((cell) => `<td>${htmlText(cell)}</td>`).join('')}</tr>`,
        ).join('')

        const html = `
          <html>
            <head>
              <meta name="viewport" content="width=device-width, initial-scale=1" />
              <style>
                body { font-family: Arial, sans-serif; padding: 24px; color: #14201c; }
                h1 { color: #0f766e; }
                p { color: #64716c; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #dfe5e1; padding: 9px; text-align: left; }
                th { background: #edf5f2; }
              </style>
            </head>
            <body>
              <h1>Track Mo, Pake Ko!</h1>
              <h2>${htmlText(kind.charAt(0).toUpperCase() + kind.slice(1))} Report</h2>
              <p>Period: ${htmlText(monthLabel)}</p>
              <table>
                <thead><tr>${headers.map((head) => `<th>${htmlText(head)}</th>`).join('')}</tr></thead>
                <tbody>${tableRows}</tbody>
              </table>
              <p>Generated by Track Mo, Pake Ko!</p>
            </body>
          </html>
        `

        const result = await Print.printToFileAsync({ html })
        const canShare = await Sharing.isAvailableAsync()
        if (!canShare) {
          Alert.alert('Sharing unavailable', 'File sharing is not available on this device.')
          return
        }
        await Sharing.shareAsync(result.uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Share your Track Mo PDF report',
        })
      }
    } catch (error) {
      Alert.alert(
        'Export failed',
        error instanceof Error ? error.message : 'Something went wrong while exporting.',
      )
    } finally {
      setLoading(false)
    }
  }



  return (
    <SafeAreaView style={styles.safe}>
      <UserPageHeader title="Export report" subtitle="Create a file you can share" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.introCard}>
          <View style={styles.introIcon}>
            <Text style={styles.introIconText}>{format === 'csv' ? 'CSV' : 'PDF'}</Text>
          </View>
          <View style={styles.introCopy}>
            <Text style={styles.introTitle}>Prepare your report</Text>
            <Text style={styles.introDescription}>Choose how your spending information should be organized.</Text>
          </View>
          <View style={styles.periodPill}>
            <Text style={styles.periodPillText}>{reportPeriodLabel}</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>1. File format</Text>
            <Text style={styles.sectionHint}>Choose an export file type</Text>
          </View>
          <View style={styles.formatGrid}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: format === 'csv' }}
              onPress={() => setFormat('csv')}
              style={[styles.formatCard, format === 'csv' && styles.formatCardSelected]}
            >
              <View style={[styles.formatIcon, styles.csvIcon]}>
                <Text style={styles.formatIconText}>CSV</Text>
              </View>
              <Text style={[styles.formatName, format === 'csv' && styles.selectedText]}>CSV Spreadsheet</Text>
              <Text style={styles.formatDescription}>For spreadsheets and data analysis</Text>
              <View style={[styles.selectionMark, format === 'csv' && styles.selectionMarkActive]}>
                {format === 'csv' ? <Text style={styles.checkMark}>✓</Text> : null}
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: format === 'pdf' }}
              onPress={() => setFormat('pdf')}
              style={[styles.formatCard, format === 'pdf' && styles.formatCardSelected]}
            >
              <View style={[styles.formatIcon, styles.pdfIcon]}>
                <Text style={[styles.formatIconText, styles.pdfText]}>PDF</Text>
              </View>
              <Text style={[styles.formatName, format === 'pdf' && styles.selectedText]}>PDF Document</Text>
              <Text style={styles.formatDescription}>For printing and sharing</Text>
              <View style={[styles.selectionMark, format === 'pdf' && styles.selectionMarkActive]}>
                {format === 'pdf' ? <Text style={styles.checkMark}>✓</Text> : null}
              </View>
            </Pressable>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>2. Report content</Text>
            <Text style={styles.sectionHint}>Select the information to include</Text>
          </View>
          {([
            { value: 'detailed', title: 'Detailed report', description: 'Every expense with date, category, note and payment method' },
            { value: 'category', title: 'Category summary', description: 'Spending totals grouped by category with percentage share' },
            { value: 'monthly', title: reportMode === 'yearly' ? 'Monthly breakdown' : 'Period summary', description: reportMode === 'yearly' ? 'Expense totals grouped by month' : 'One summary of total expenses for this month' },
          ] as { value: ExportKind; title: string; description: string }[]).map((item) => (
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
            <Text style={styles.sectionTitle}>3. Archived expenses</Text>
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
          style={[styles.primaryButton, loading && styles.disabledButton]}
        >
          {loading ? (
            <StaticLoader color="#ffffff" />
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
  disabledButton: { opacity: 0.65 },
  primaryButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  primaryButtonHint: { color: '#d8efeb', fontSize: 10, fontWeight: '600' },
  backButton: { alignItems: 'center', padding: 12 },
  backText: { color: C.brand, fontWeight: '800', fontSize: 13 },
}) }
