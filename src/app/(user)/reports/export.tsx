import { useAppTheme } from '@/context/ThemeContext'
import React, { useState } from 'react'
import {
  ActivityIndicator,
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
  const params = useLocalSearchParams<{ format?: string }>()
  const initialFormat = params.format === 'pdf' ? 'pdf' : 'csv'

  const [format, setFormat] = useState<'csv' | 'pdf'>(initialFormat)
  const [kind, setKind] = useState<ExportKind>('detailed')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [loading, setLoading] = useState(false)

  const loadRows = async () => {
    if (!profile?.id) throw new Error('Please sign in again.')

    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
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
        Alert.alert('No records', 'There are no expenses to export for this month.')
        return
      }

      const now = new Date()
      const monthLabel = now.toLocaleDateString('en-PH', {
        month: 'long',
        year: 'numeric',
      })

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
        const total = rows.reduce((sum, row) => sum + row.amount, 0)
        data = [[monthLabel, total.toFixed(2), rows.length]]
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

  const Option = ({
    label,
    selected,
    onPress,
  }: {
    label: string
    selected: boolean
    onPress: () => void
  }) => (
    <Pressable
      onPress={onPress}
      style={[styles.option, selected && styles.optionSelected]}
    >
      <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
        {label}
      </Text>
    </Pressable>
  )

  return (
    <SafeAreaView style={styles.safe}>
      <UserPageHeader title="Export report" subtitle="Create a file you can share" />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>File format</Text>
          <View style={styles.optionsRow}>
            <Option label="CSV spreadsheet" selected={format === 'csv'} onPress={() => setFormat('csv')} />
            <Option label="PDF document" selected={format === 'pdf'} onPress={() => setFormat('pdf')} />
          </View>

          <Text style={styles.sectionTitle}>Report type</Text>
          <Option label="Detailed report" selected={kind === 'detailed'} onPress={() => setKind('detailed')} />
          <Option label="Category summary" selected={kind === 'category'} onPress={() => setKind('category')} />
          <Option label="Monthly summary" selected={kind === 'monthly'} onPress={() => setKind('monthly')} />

          <Text style={styles.sectionTitle}>Include archived expenses</Text>
          <View style={styles.optionsRow}>
            <Option label="No" selected={!includeArchived} onPress={() => setIncludeArchived(false)} />
            <Option label="Yes" selected={includeArchived} onPress={() => setIncludeArchived(true)} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Report period</Text>
          <Text style={styles.description}>
            This export currently covers {new Date().toLocaleDateString('en-PH', {
              month: 'long',
              year: 'numeric',
            })}.
          </Text>
          <Text style={styles.description}>
            Only expenses from your tracked categories are included.
          </Text>
        </View>

        <Pressable
          disabled={loading}
          onPress={exportReport}
          style={[styles.primaryButton, loading && styles.disabledButton]}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.primaryButtonText}>
              Generate {format.toUpperCase()} report
            </Text>
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
  header: {
      position: 'relative',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 18,
      paddingVertical: 14,
      minHeight: 72,
      backgroundColor: dark ? '#1b2a26' : '#ffffff',
      borderBottomWidth: 1,
      borderBottomColor: dark ? '#30413a' : '#e4e8e5',
    },
  headerText: { position: 'absolute', left: 72, right: 72, alignItems: 'center' },
  headerSpacer: { width: 44, height: 44 },
  subtitle: { color: C.muted, fontSize: 12, marginTop: 3, textAlign: 'center' },
  title: { color: C.ink, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  sectionTitle: {
    color: C.ink,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 7,
    marginBottom: 3,
  },
  optionsRow: { flexDirection: 'row', gap: 8 },
  option: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 13,
    marginBottom: 4,
    flex: 1,
  },
  optionSelected: { backgroundColor: (dark ? '#203d36' : '#e5f3ef'), borderColor: C.brand },
  optionText: { color: C.muted, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  optionTextSelected: { color: C.brand, fontWeight: '800' },
  description: { color: C.muted, fontSize: 13, lineHeight: 20 },
  primaryButton: {
    backgroundColor: C.brand,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  disabledButton: { opacity: 0.65 },
  primaryButtonText: { color: (dark ? '#1b2a26' : '#ffffff'), fontSize: 15, fontWeight: '800' },
  backButton: { alignItems: 'center', padding: 12 },
  backText: { color: C.brand, fontWeight: '700' },
}) }
