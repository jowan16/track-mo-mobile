import { useAppTheme } from '@/context/ThemeContext'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'

import { UserPageHeader } from '@/components/user-navigation'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/services/supabase'

type Mode = 'monthly' | 'yearly'

type Category = {
  id: number
  name: string
  icon: string
  color: string
}

type Expense = {
  id: string
  category_id: number
  amount: number
  spent_on: string
  is_archived: boolean
}

type Budget = {
  category_id: number
  amount: number
}

const LIGHT_C = {
  canvas: '#f6f7f5',
  white: '#ffffff',
  ink: '#14201c',
  muted: '#68756f',
  line: '#e4e8e5',
  brand: '#0f766e',
  pale: '#e6f4f1',
  orange: '#c2410c',
  red: '#b42318',
}
function getC(dark: boolean) { return dark ? {
  canvas: '#101a18',
  white: '#1b2a26',
  ink: '#edf5f1',
  muted: '#a9b8b1',
  line: '#30413a',
  brand: '#55c6b0',
  pale: '#203d36',
  orange: '#ffad70',
  red: '#ff8178',
} : LIGHT_C }


const peso = (value: number) =>
  `₱ ${value.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function monthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleDateString('en-PH', {
    month: 'short',
  })
}

export default function ReportsScreen() {
  const { resolvedTheme } = useAppTheme()
  const dark = resolvedTheme === 'dark'
  const C = getC(dark)
  const styles = makeStyles(dark, C)

  const { profile } = useAuth()
  const today = new Date()

  const [mode, setMode] = useState<Mode>('monthly')
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [categories, setCategories] = useState<Category[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const loadReport = useCallback(async () => {
    if (!profile?.id) return

    setError('')

    const from = mode === 'monthly'
      ? dateKey(new Date(year, month - 2, 1))
      : `${year - 1}-01-01`

    const to = mode === 'monthly'
      ? dateKey(new Date(year, month, 1))
      : `${year + 1}-01-01`

    try {
      const [categoryResult, trackedResult, expenseResult, budgetResult] =
        await Promise.all([
          supabase.from('categories').select('id,name,icon,color')
            .eq('is_active', true).order('sort_order'),
          supabase.from('user_categories').select('category_id')
            .eq('user_id', profile.id),
          supabase.from('expenses').select('id,category_id,amount,spent_on,is_archived')
            .eq('user_id', profile.id).eq('is_archived', false)
            .gte('spent_on', from).lt('spent_on', to)
            .order('spent_on', { ascending: true }),
          supabase.from('budgets').select('category_id,amount')
            .eq('user_id', profile.id).eq('is_archived', false)
            .eq('month', month).eq('year', year),
        ])

      if (categoryResult.error) throw categoryResult.error
      if (trackedResult.error) throw trackedResult.error
      if (expenseResult.error) throw expenseResult.error
      if (budgetResult.error) throw budgetResult.error

      const trackedIds = new Set(
        (trackedResult.data ?? []).map((item) => Number(item.category_id)),
      )

      setCategories(
        ((categoryResult.data ?? []) as Category[])
          .filter((item) => trackedIds.has(item.id)),
      )

      setExpenses(
        ((expenseResult.data ?? []) as Expense[])
          .filter((item) => trackedIds.has(item.category_id))
          .map((item) => ({ ...item, amount: Number(item.amount) })),
      )

      setBudgets(
        ((budgetResult.data ?? []) as Budget[])
          .filter((item) => trackedIds.has(item.category_id))
          .map((item) => ({ ...item, amount: Number(item.amount) })),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load reports.')
    }
  }, [profile?.id, mode, year, month])

  useEffect(() => {
    let active = true
    setLoading(true)
    loadReport().finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [loadReport])

  const refresh = async () => {
    setRefreshing(true)
    await loadReport()
    setRefreshing(false)
  }

  const currentExpenses = useMemo(
    () => expenses.filter((item) => {
      const d = new Date(`${item.spent_on}T00:00:00`)
      return mode === 'monthly'
        ? d.getFullYear() === year && d.getMonth() + 1 === month
        : d.getFullYear() === year
    }),
    [expenses, mode, year, month],
  )

  const previousExpenses = useMemo(
    () => expenses.filter((item) => {
      const d = new Date(`${item.spent_on}T00:00:00`)
      return mode === 'monthly'
        ? new Date(year, month - 2, 1).getFullYear() === d.getFullYear()
          && new Date(year, month - 2, 1).getMonth() + 1 === d.getMonth() + 1
        : d.getFullYear() === year - 1
    }),
    [expenses, mode, year, month],
  )

  const total = currentExpenses.reduce((sum, item) => sum + item.amount, 0)
  const previousTotal = previousExpenses.reduce((sum, item) => sum + item.amount, 0)
  const change = previousTotal > 0
    ? ((total - previousTotal) / previousTotal) * 100
    : null

  const categoryTotals = useMemo(() => {
    const totals = new Map<number, number>()
    currentExpenses.forEach((item) => {
      totals.set(item.category_id, (totals.get(item.category_id) ?? 0) + item.amount)
    })
    return categories
      .map((category) => ({
        ...category,
        total: totals.get(category.id) ?? 0,
      }))
      .filter((item) => item.total > 0)
      .sort((a, b) => b.total - a.total)
  }, [currentExpenses, categories])

  const topCategory = categoryTotals[0]
  const maxCategory = Math.max(...categoryTotals.map((item) => item.total), 1)

  const chartData = useMemo(() => {
    if (mode === 'monthly') {
      const days = new Date(year, month, 0).getDate()
      return Array.from({ length: days }, (_, index) => {
        const day = index + 1
        const amount = currentExpenses
          .filter((item) => Number(item.spent_on.slice(8, 10)) === day)
          .reduce((sum, item) => sum + item.amount, 0)
        return { label: String(day), amount }
      })
    }

    return Array.from({ length: 12 }, (_, index) => {
      const amount = currentExpenses
        .filter((item) => Number(item.spent_on.slice(5, 7)) === index + 1)
        .reduce((sum, item) => sum + item.amount, 0)
      return { label: monthLabel(year, index + 1), amount }
    })
  }, [currentExpenses, mode, year, month])

  const chartMax = Math.max(...chartData.map((item) => item.amount), 1)
  const periodName = mode === 'monthly'
    ? new Date(year, month - 1, 1).toLocaleDateString('en-PH', {
        month: 'long', year: 'numeric',
      })
    : String(year)

  const insights = useMemo(() => {
    const result: string[] = []

    if (topCategory) {
      result.push(`${topCategory.name} is your highest spending category at ${peso(topCategory.total)}.`)
    }

    if (change !== null) {
      result.push(
        `Your spending ${change > 0 ? 'increased' : change < 0 ? 'decreased' : 'stayed the same'} by ${Math.abs(change).toFixed(1)}% compared with the previous ${mode === 'monthly' ? 'month' : 'year'}.`,
      )
    }

    budgets.forEach((budget) => {
      const spent = currentExpenses
        .filter((item) => item.category_id === budget.category_id)
        .reduce((sum, item) => sum + item.amount, 0)

      const category = categories.find((item) => item.id === budget.category_id)

      if (budget.amount > 0 && spent < budget.amount * 0.5) {
        result.push(`${category?.name ?? 'A category'} is still below 50% of its budget.`)
      }
    })

    if (result.length === 0) {
      result.push('Add expenses and budgets to see more spending insights.')
    }

    return result
  }, [topCategory, change, mode, budgets, currentExpenses, categories])

  return (
    <SafeAreaView style={styles.safe}>
      <UserPageHeader title="Reports" subtitle="Understand where your money goes." />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        showsVerticalScrollIndicator={false}
      >
                <View style={styles.toggle}>
          {(['monthly', 'yearly'] as Mode[]).map((item) => (
            <Pressable
              key={item}
              onPress={() => setMode(item)}
              style={[styles.toggleButton, mode === item && styles.toggleActive]}
            >
              <Text style={[styles.toggleText, mode === item && styles.toggleTextActive]}>
                {item === 'monthly' ? 'Monthly' : 'Yearly'}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.periodRow}>
          <Pressable
            style={styles.periodButton}
            onPress={() => {
              if (mode === 'monthly') {
                if (month === 1) {
                  setMonth(12)
                  setYear((value) => value - 1)
                } else {
                  setMonth((value) => value - 1)
                }
              } else {
                setYear((value) => value - 1)
              }
            }}
          >
            <Text style={styles.periodArrow}>‹</Text>
          </Pressable>
          <Text style={styles.periodText}>{periodName}</Text>
          <Pressable
            style={styles.periodButton}
            onPress={() => {
              if (mode === 'monthly') {
                if (month === 12) {
                  setMonth(1)
                  setYear((value) => value + 1)
                } else {
                  setMonth((value) => value + 1)
                }
              } else {
                setYear((value) => value + 1)
              }
            }}
          >
            <Text style={styles.periodArrow}>›</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={C.brand} style={styles.loader} />
        ) : error ? (
          <View style={styles.card}>
            <Text style={styles.error}>{error}</Text>
            <Pressable onPress={refresh}><Text style={styles.link}>Try again</Text></Pressable>
          </View>
        ) : (
          <>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>TOTAL SPENT</Text>
              <Text style={styles.summaryAmount}>{peso(total)}</Text>
              <Text style={styles.summaryPeriod}>{periodName}</Text>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Vs. previous {mode === 'monthly' ? 'month' : 'year'}</Text>
                <Text style={[
                  styles.statValue,
                  change !== null && change > 0 ? styles.negative : styles.positive,
                ]}>
                  {change === null ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(1)}%`}
                </Text>
                <Text style={styles.statHint}>
                  {previousTotal > 0 ? peso(previousTotal) : 'No previous data'}
                </Text>
              </View>

              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Top category</Text>
                <Text style={styles.statValue} numberOfLines={1}>
                  {topCategory?.name ?? '—'}
                </Text>
                <Text style={styles.statHint}>
                  {topCategory ? peso(topCategory.total) : 'No expenses yet'}
                </Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Spending over the {mode === 'monthly' ? 'month' : 'year'}</Text>
              <Text style={styles.muted}>Daily spending totals</Text>
              <View style={styles.chart}>
                {chartData.map((item, index) => (
                  <View key={`${item.label}-${index}`} style={styles.barColumn}>
                    <View style={styles.barTrack}>
                      <View style={[
                        styles.bar,
                        { height: `${Math.max((item.amount / chartMax) * 100, item.amount > 0 ? 4 : 0)}%` },
                      ]} />
                    </View>
                    {(mode === 'yearly' || index % 5 === 0 || index === chartData.length - 1) && (
                      <Text style={styles.barLabel}>{item.label}</Text>
                    )}
                  </View>
                ))}
              </View>
              <Text style={styles.chartTotal}>{peso(total)} total</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Spending by category</Text>
              {categoryTotals.length === 0 ? (
                <Text style={styles.muted}>No spending recorded for this period.</Text>
              ) : categoryTotals.map((item) => (
                <View key={item.id} style={styles.categoryRow}>
                  <View style={styles.categoryInfo}>
                    <Text style={styles.categoryName}>{item.name}</Text>
                    <Text style={styles.categoryAmount}>{peso(item.total)}</Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View style={[
                      styles.progressFill,
                      { width: `${(item.total / maxCategory) * 100}%` },
                    ]} />
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Insights</Text>
              {insights.map((item, index) => (
                <View key={index} style={styles.insightRow}>
                  <Text style={styles.insightBullet}>•</Text>
                  <Text style={styles.insightText}>{item}</Text>
                </View>
              ))}
            </View>

            <View style={styles.exportCard}>
              <View style={styles.exportHeader}>
                <View style={styles.exportHeadingIcon}>
                  <Text style={styles.exportHeadingIconText}>⇩</Text>
                </View>
                <View style={styles.exportHeadingCopy}>
                  <Text style={styles.cardTitle}>Export your report</Text>
                  <Text style={styles.muted}>Export your spending activity for {periodName}.</Text>
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/(user)/reports/export' as any, params: { format: 'csv', mode, year: String(year), month: String(month) } })}
                style={({ pressed }) => [styles.exportAction, pressed && styles.exportActionPressed]}
              >
                <View style={styles.exportFormatIcon}><Text style={styles.csvIconText}>CSV</Text></View>
                <View style={styles.exportActionCopy}>
                  <Text style={styles.exportActionTitle}>Export CSV</Text>
                  <Text style={styles.exportActionHint}>Spreadsheet format · Easy to sort and analyze</Text>
                </View>
                <Text style={styles.exportChevron}>›</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/(user)/reports/export' as any, params: { format: 'pdf', mode, year: String(year), month: String(month) } })}
                style={({ pressed }) => [styles.exportAction, pressed && styles.exportActionPressed]}
              >
                <View style={[styles.exportFormatIcon, styles.pdfFormatIcon]}><Text style={styles.pdfIconText}>PDF</Text></View>
                <View style={styles.exportActionCopy}>
                  <Text style={styles.exportActionTitle}>Export PDF</Text>
                  <Text style={styles.exportActionHint}>Printable document · Ready to share</Text>
                </View>
                <Text style={styles.exportChevron}>›</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function makeStyles(dark: boolean, C: any) { return StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.canvas },
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
  headerSpacer: { width: 44, height: 44 },
  headerText: { position: 'absolute', left: 72, right: 72, alignItems: 'center' },
  brand: { color: C.ink, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: C.muted, fontSize: 12, marginTop: 3, textAlign: 'center' },
  content: { padding: 18, paddingBottom: 40, gap: 14 },
  headingRow: { marginBottom: 2 },
  title: { color: C.ink, fontSize: 25, fontWeight: '900' },
  muted: { color: C.muted, fontSize: 13, lineHeight: 19 },
  toggle: {
    flexDirection: 'row', backgroundColor: (dark ? '#2a3a34' : '#e9eeeb'),
    padding: 4, borderRadius: 12,
  },
  toggleButton: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  toggleActive: { backgroundColor: C.white },
  toggleText: { color: C.muted, fontSize: 13, fontWeight: '700' },
  toggleTextActive: { color: C.brand },
  periodRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  periodButton: {
    width: 38, height: 38, borderRadius: 11, backgroundColor: C.white,
    alignItems: 'center', justifyContent: 'center',
  },
  periodArrow: { color: C.brand, fontSize: 27, lineHeight: 30 },
  periodText: { color: C.ink, fontSize: 15, fontWeight: '800' },
  loader: { marginTop: 50 },
  card: {
    backgroundColor: C.white, borderRadius: 16, padding: 17,
    borderWidth: 1, borderColor: C.line, gap: 12,
  },
  summaryCard: {
    backgroundColor: C.brand, borderRadius: 17, padding: 20, gap: 7,
  },
  summaryLabel: { color: (dark ? '#1f403a' : '#c9e9e3'), fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  summaryAmount: { color: C.white, fontSize: 29, fontWeight: '900' },
  summaryPeriod: { color: (dark ? '#1f403a' : '#d8efeb'), fontSize: 12 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1, minWidth: 0, backgroundColor: C.white,
    borderRadius: 15, padding: 14, borderWidth: 1, borderColor: C.line, gap: 7,
  },
  statLabel: { color: C.muted, fontSize: 11, fontWeight: '600' },
  statValue: { color: C.ink, fontSize: 17, fontWeight: '900' },
  statHint: { color: C.muted, fontSize: 11 },
  negative: { color: C.red },
  positive: { color: C.brand },
  cardTitle: { color: C.ink, fontSize: 16, fontWeight: '800' },
  chart: {
    height: 145, flexDirection: 'row', alignItems: 'flex-end',
    gap: 3, paddingTop: 10,
  },
  barColumn: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end' },
  barTrack: {
    width: '100%', height: 112, justifyContent: 'flex-end',
    backgroundColor: (dark ? '#2a3a34' : '#f0f4f1'), borderRadius: 4, overflow: 'hidden',
  },
  bar: { width: '100%', backgroundColor: C.brand, borderRadius: 4 },
  barLabel: { color: C.muted, fontSize: 8, marginTop: 5 },
  chartTotal: { color: C.muted, fontSize: 12, textAlign: 'right' },
  categoryRow: { gap: 7 },
  categoryInfo: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  categoryName: { color: C.ink, fontSize: 13, fontWeight: '700', flex: 1 },
  categoryAmount: { color: C.muted, fontSize: 12, fontWeight: '700' },
  progressTrack: { height: 8, backgroundColor: (dark ? '#2a3a34' : '#edf1ee'), borderRadius: 8, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: C.brand, borderRadius: 8 },
  insightRow: { flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
  insightBullet: { color: C.brand, fontSize: 20, lineHeight: 21 },
  insightText: { color: C.muted, fontSize: 13, lineHeight: 19, flex: 1 },
  exportCard: { backgroundColor: C.white, borderRadius: 16, padding: 17, borderWidth: 1, borderColor: C.line, gap: 13 },
  exportHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  exportHeadingIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: C.pale, alignItems: 'center', justifyContent: 'center' },
  exportHeadingIconText: { color: C.brand, fontSize: 25, fontWeight: '900' },
  exportHeadingCopy: { flex: 1, gap: 3 },
  exportAction: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 13, borderWidth: 1, borderColor: C.line, backgroundColor: C.white },
  exportActionPressed: { backgroundColor: C.pale, borderColor: C.brand },
  exportFormatIcon: { width: 44, height: 44, borderRadius: 11, backgroundColor: C.pale, alignItems: 'center', justifyContent: 'center' },
  csvIconText: { color: C.brand, fontSize: 12, fontWeight: '900', letterSpacing: 0.4 },
  pdfFormatIcon: { backgroundColor: dark ? '#452b2b' : '#fff0ee' },
  pdfIconText: { color: C.red, fontSize: 12, fontWeight: '900', letterSpacing: 0.4 },
  exportActionCopy: { flex: 1, gap: 4 },
  exportActionTitle: { color: C.ink, fontSize: 14, fontWeight: '800' },
  exportActionHint: { color: C.muted, fontSize: 11, lineHeight: 15 },
  exportChevron: { color: C.muted, fontSize: 25, fontWeight: '500', marginLeft: 2 },
  error: { color: C.red, fontSize: 13 },
  link: { color: C.brand, fontWeight: '800' },
}) }
