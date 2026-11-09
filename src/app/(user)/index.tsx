
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Image,
  Modal,
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/services/supabase'
import { UserMenuButton } from '@/components/user-navigation'

// --------------------------------------------------
// TYPES
// --------------------------------------------------

type Category = {
  id: number
  slug: string
  name: string
  icon: string
  color: string
  bg: string
  is_active: boolean
  sort_order: number
  show_in_picker: boolean
}

type Expense = {
  id: string
  user_id: string
  category_id: number
  amount: number
  spent_on: string
  payment_method: string
  note: string | null
  is_archived: boolean
  created_at: string
}

type Budget = {
  id: string
  user_id: string
  category_id: number
  month: number
  year: number
  amount: number
  is_archived: boolean
}

type DashboardData = {
  categories: Category[]
  expenses: Expense[]
  budgets: Budget[]
}

type SummaryCardProps = {
  title: string
  amount: string
  description: string
  symbol: string
  color: string
  background: string
}

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

const COLORS = {
  canvas: '#f6f7f5',
  ink: '#14201c',
  muted: '#4b5754',
  line: '#e4e8e5',
  brand: '#0f766e',
  danger: '#b42318',
}

const CATEGORY_SYMBOLS: Record<string, string> = {
  bus: '↔',
  'plus-square': '+',
  utensils: '♨',
  zap: 'ϟ',
  play: '▶',
  'shopping-bag': '▣',
  home: '⌂',
  coins: '◉',
  'piggy-bank': '●',
}

function localDateString(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function peso(value: number) {
  return `₱ ${value.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function shortDate(value: string) {
  const date = new Date(`${value}T00:00:00`)

  return date.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
  })
}

function getGreeting() {
  const hour = new Date().getHours()

  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'

  return 'Good evening'
}

function getCurrentMonth() {
  return new Date().toLocaleDateString('en-PH', {
    month: 'long',
    year: 'numeric',
  })
}

function getCategorySymbol(icon: string) {
  return CATEGORY_SYMBOLS[icon] ?? '●'
}

function SummaryCard({
  title,
  amount,
  description,
  symbol,
  color,
  background,
}: SummaryCardProps) {
  return (
    <View style={styles.summaryCard}>
      <View style={[styles.summaryIcon, { backgroundColor: background }]}>
        <Text style={[styles.summarySymbol, { color }]}>{symbol}</Text>
      </View>

      <Text style={styles.summaryTitle}>{title}</Text>
      <Text style={styles.summaryAmount} numberOfLines={1}>
        {amount}
      </Text>
      <Text style={styles.summaryDescription}>{description}</Text>
    </View>
  )
}

function SectionHeader({
  title,
  subtitle,
}: {
  title: string
  subtitle?: string
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  )
}

// --------------------------------------------------
// DASHBOARD
// --------------------------------------------------

export default function UserDashboard() {
  const { profile, signOut } = useAuth()

  const [data, setData] = useState<DashboardData>({
    categories: [],
    expenses: [],
    budgets: [],
  })

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [availableCategories, setAvailableCategories] = useState<Category[]>([])
  const [categoryModalVisible, setCategoryModalVisible] = useState(false)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<number>>(new Set())
  const [savingCategories, setSavingCategories] = useState(false)

  // ------------------------------------------------
  // FETCH DASHBOARD DATA
  // ------------------------------------------------

  const loadDashboard = useCallback(async () => {
    if (!profile?.id) return

    setErrorMessage('')

    const now = new Date()

    const firstDayOfSixMonthsAgo = new Date(
      now.getFullYear(),
      now.getMonth() - 5,
      1,
    )

    const firstDayOfNextMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      1,
    )

    const from = localDateString(firstDayOfSixMonthsAgo)
    const toExclusive = localDateString(firstDayOfNextMonth)

    try {
      const [
        categoriesResult,
        userCategoriesResult,
        expensesResult,
        budgetsResult,
      ] = await Promise.all([
        supabase
          .from('categories')
          .select('*')
          .eq('is_active', true)
          .order('sort_order'),

        supabase
          .from('user_categories')
          .select('category_id')
          .eq('user_id', profile.id),

        supabase
          .from('expenses')
          .select('*')
          .eq('user_id', profile.id)
          .eq('is_archived', false)
          .gte('spent_on', from)
          .lt('spent_on', toExclusive)
          .order('spent_on', { ascending: false })
          .order('created_at', { ascending: false }),

        supabase
          .from('budgets')
          .select('*')
          .eq('user_id', profile.id)
          .eq('is_archived', false)
          .eq('month', now.getMonth() + 1)
          .eq('year', now.getFullYear()),
      ])

      if (categoriesResult.error) throw categoriesResult.error
      if (userCategoriesResult.error) throw userCategoriesResult.error
      if (expensesResult.error) throw expensesResult.error
      if (budgetsResult.error) throw budgetsResult.error

      const selectedCategoryIds = new Set(
        (userCategoriesResult.data ?? []).map(
          (item) => Number(item.category_id),
        ),
      )

      const allActiveCategories = (categoriesResult.data ?? []) as Category[]
      setAvailableCategories(allActiveCategories)

      const trackedCategories = allActiveCategories.filter((category) =>
        selectedCategoryIds.has(category.id),
      )

      const trackedIds = new Set(
        trackedCategories.map((category) => category.id),
      )

      const trackedExpenses = (
        (expensesResult.data ?? []) as Expense[]
      )
        .filter((expense) => trackedIds.has(expense.category_id))
        .map((expense) => ({
          ...expense,
          amount: Number(expense.amount),
        }))

      const activeBudgets = ((budgetsResult.data ?? []) as Budget[])
        .filter((budget) => trackedIds.has(budget.category_id))
        .map((budget) => ({
          ...budget,
          amount: Number(budget.amount),
        }))

      setData({
        categories: trackedCategories,
        expenses: trackedExpenses,
        budgets: activeBudgets,
      })
    } catch (error) {
      console.error('Dashboard loading error:', error)

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to load your dashboard.',
      )
    }
  }, [profile?.id])

  useEffect(() => {
    let mounted = true

    const initialize = async () => {
      setLoading(true)

      await loadDashboard()

      if (mounted) setLoading(false)
    }

    void initialize()

    return () => {
      mounted = false
    }
  }, [loadDashboard])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadDashboard()
    setRefreshing(false)
  }, [loadDashboard])

  // ------------------------------------------------
  // CALCULATIONS
  // ------------------------------------------------

  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()

  const currentMonthExpenses = useMemo(
    () =>
      data.expenses.filter((expense) => {
        const date = new Date(`${expense.spent_on}T00:00:00`)

        return (
          date.getMonth() === currentMonth &&
          date.getFullYear() === currentYear
        )
      }),
    [data.expenses, currentMonth, currentYear],
  )

  const totalExpense = currentMonthExpenses.reduce(
    (total, expense) => total + expense.amount,
    0,
  )

  const totalBudget = data.budgets.reduce(
    (total, budget) => total + budget.amount,
    0,
  )

  const budgetRemaining = totalBudget - totalExpense

  const categorySpending = useMemo(() => {
    return data.categories.map((category) => {
      const spent = currentMonthExpenses
        .filter((expense) => expense.category_id === category.id)
        .reduce((total, expense) => total + expense.amount, 0)

      const budget = data.budgets.find(
        (item) => item.category_id === category.id,
      )

      return {
        category,
        spent,
        budget: budget?.amount ?? 0,
        percentage: budget?.amount
          ? (spent / budget.amount) * 100
          : 0,
      }
    })
  }, [data.categories, data.budgets, currentMonthExpenses])

  const monthLabels = useMemo(() => {
    return Array.from({ length: 6 }, (_, index) => {
      const date = new Date(currentYear, currentMonth - 5 + index, 1)

      return {
        month: date.toLocaleDateString('en-PH', { month: 'short' }),
        year: date.getFullYear(),
        total: data.expenses
          .filter((expense) => {
            const expenseDate = new Date(`${expense.spent_on}T00:00:00`)

            return (
              expenseDate.getMonth() === date.getMonth() &&
              expenseDate.getFullYear() === date.getFullYear()
            )
          })
          .reduce((total, expense) => total + expense.amount, 0),
      }
    })
  }, [data.expenses, currentMonth, currentYear])

  const maximumMonthlyExpense = Math.max(
    ...monthLabels.map((item) => item.total),
    1,
  )

  const trackedCategoryCount = data.categories.length
  const expenseEntryCount = currentMonthExpenses.length

  // ------------------------------------------------
  // CATEGORY PICKER (MATCHES WEB CATEGORY PICKER LOGIC)
  // ------------------------------------------------

  const pickerOptions = availableCategories.filter(
    (category) => category.is_active && category.show_in_picker,
  )

  const openCategoryPicker = () => {
    const pickerIds = new Set(pickerOptions.map((category) => category.id))
    setSelectedCategoryIds(
      new Set(data.categories.filter((category) => pickerIds.has(category.id)).map((category) => category.id)),
    )
    setCategoryModalVisible(true)
  }

  const handleToggleCategory = (categoryId: number) => {
    setSelectedCategoryIds((current) => {
      const next = new Set(current)
      if (next.has(categoryId)) next.delete(categoryId)
      else next.add(categoryId)
      return next
    })
  }

  const handleSaveCategories = async () => {
    if (!profile?.id || savingCategories) return
    if (selectedCategoryIds.size === 0) {
      Alert.alert('Select a category', 'Select at least one category to continue.')
      return
    }

    const selectableIds = new Set(pickerOptions.map((category) => category.id))
    const currentlySelected = data.categories
      .filter((category) => selectableIds.has(category.id))
      .map((category) => category.id)
    const toAdd = [...selectedCategoryIds].filter((id) => !currentlySelected.includes(id))
    const toRemove = currentlySelected.filter((id) => !selectedCategoryIds.has(id))

    if (toAdd.length === 0 && toRemove.length === 0) {
      setCategoryModalVisible(false)
      return
    }

    setSavingCategories(true)
    try {
      if (toAdd.length > 0) {
        const { error } = await supabase.from('user_categories').insert(
          toAdd.map((category_id) => ({ user_id: profile.id, category_id })),
        )
        if (error) throw error
      }

      if (toRemove.length > 0) {
        const { error } = await supabase
          .from('user_categories')
          .delete()
          .eq('user_id', profile.id)
          .in('category_id', toRemove)
        if (error) throw error
      }

      await loadDashboard()
      setCategoryModalVisible(false)
    } catch (error) {
      await loadDashboard()
      Alert.alert(
        'Unable to save categories',
        error instanceof Error ? error.message : 'Please try again.',
      )
    } finally {
      setSavingCategories(false)
    }
  }

  // ------------------------------------------------
  // SIGN OUT
  // ------------------------------------------------

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut()
              router.replace('/(auth)/login')
            } catch (error) {
              Alert.alert(
                'Sign Out Failed',
                error instanceof Error
                  ? error.message
                  : 'Unable to sign out. Please try again.',
              )
            }
          },
        },
      ],
    )
  }

  // ------------------------------------------------
  // LOADING
  // ------------------------------------------------

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.brand} />
        <Text style={styles.loadingText}>Preparing your dashboard...</Text>
      </SafeAreaView>
    )
  }

  // ------------------------------------------------
  // MAIN UI
  // ------------------------------------------------

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.brand}
          />
        }
      >
        {/* HEADER */}

        <View style={styles.header}>
          <View style={styles.brandContainer}>
            <View style={styles.brandMark}>
              <Image source={require('../../../assets/trackmo-logo.png')} style={{ width: 38, height: 38 }} resizeMode="contain" />
            </View>

            <View>
              <Text style={styles.brandName}>Track Mo, Pake Ko!</Text>
              <Text style={styles.brandTagline}>Your money. Your control.</Text>
            </View>
          </View>

          <UserMenuButton />
        </View>

        {/* WELCOME PANEL */}

        <LinearGradient
          colors={['#0b3d36', '#0f766e', '#14a193']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.welcomeCard}
        >
          <Text style={styles.welcomeEyebrow}>YOUR FINANCIAL OVERVIEW</Text>

          <Text style={styles.welcomeTitle}>
            {getGreeting()},{'\n'}
            {profile?.full_name?.trim().split(' ')[0] || 'there'}!
          </Text>

          <Text style={styles.welcomeSubtitle}>
            Here's how your money is doing this month.
          </Text>

          <View style={styles.welcomeFooter}>
            <View>
              <Text style={styles.welcomeMonth}>{getCurrentMonth()}</Text>
              <Text style={styles.welcomeSmall}>Monthly overview</Text>
            </View>

            <View style={styles.welcomeBadge}>
              <Text style={styles.welcomeBadgeText}>● Active</Text>
            </View>
          </View>
        </LinearGradient>

        {/* ERROR */}

        {errorMessage ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Unable to load some data</Text>
            <Text style={styles.errorMessage}>{errorMessage}</Text>
            <Pressable onPress={onRefresh} style={styles.retryButton}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : null}

        {/* SUMMARY CARDS */}

        <SectionHeader
          title="Your Overview"
          subtitle="A quick look at your finances"
        />

        <View style={styles.summaryGrid}>
          <SummaryCard
            title="Total Expense"
            amount={peso(totalExpense)}
            description="Spent this month"
            symbol="₱"
            color="#dc2626"
            background="#fee8ea"
          />

          <SummaryCard
            title="Budget Remaining"
            amount={peso(budgetRemaining)}
            description={
              totalBudget > 0 ? 'From your monthly budgets' : 'No budget set'
            }
            symbol="◉"
            color="#0f766e"
            background="#e6f4f1"
          />

          <SummaryCard
            title="Tracked Categories"
            amount={String(trackedCategoryCount)}
            description="Active categories"
            symbol="▦"
            color="#4338ca"
            background="#eaedff"
          />

          <SummaryCard
            title="Expense Entries"
            amount={String(expenseEntryCount)}
            description="Entries this month"
            symbol="↗"
            color="#c2410c"
            background="#fff1e0"
          />
        </View>

        {/* QUICK ACTIONS */}

        <View style={{ marginBottom: 26 }}>
          <SectionHeader
            title="Quick Actions"
            subtitle="Manage your daily spending"
          />

          <Pressable
            onPress={() => router.push('/(user)/expenses' as any)}
            accessibilityRole="button"
            accessibilityLabel="Open expenses"
            style={{
              backgroundColor: '#ffffff',
              borderWidth: 1,
              borderColor: COLORS.line,
              borderRadius: 16,
              padding: 17,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 13,
                  backgroundColor: '#e6f4f1',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: COLORS.brand, fontSize: 25, fontWeight: '800' }}>
                  +
                </Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.ink, fontSize: 15, fontWeight: '800' }}>
                  Add / View Expenses
                </Text>
                <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 4 }}>
                  Record and manage your transactions
                </Text>
              </View>
            </View>

            <Text style={{ color: COLORS.brand, fontSize: 24, fontWeight: '700' }}>
              ›
            </Text>
          </Pressable>

          {/* RECEIPT SCANNER SHORTCUT */}

          <Pressable
            onPress={() => router.push('/(user)/scan-receipt' as any)}
            accessibilityRole="button"
            accessibilityLabel="Scan your receipt"
            style={{
              marginTop: 11,
              backgroundColor: '#e6f4f1',
              borderWidth: 1,
              borderColor: '#c9e6df',
              borderRadius: 16,
              padding: 17,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  backgroundColor: '#0f766e',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    color: '#ffffff',
                    fontSize: 27,
                    fontWeight: '800',
                  }}
                >
                  ▧
                </Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: '#0b3d36',
                    fontSize: 15,
                    fontWeight: '800',
                  }}
                >
                  Scan Your Receipt
                </Text>
                <Text
                  style={{
                    color: '#456b63',
                    fontSize: 12,
                    marginTop: 4,
                  }}
                >
                  Capture a receipt to add an expense
                </Text>
              </View>
            </View>

            <Text
              style={{
                color: '#0f766e',
                fontSize: 24,
                fontWeight: '700',
              }}
            >
              ›
            </Text>
          </Pressable>
        </View>

        {/* QUICK CATEGORY PICKER - MATCHES THE WEB DASHBOARD */}

        <View style={{ marginBottom:  26 }}>
          <SectionHeader
            title="Your Categories"
            subtitle="Tap an icon to view expenses in that category"
          />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 18, paddingVertical: 5, paddingRight: 8 }}
          >
            {categorySpending.map((item) => (
              <Pressable
                key={item.category.id}
                onPress={() => router.push({
                  pathname: '/(user)/expenses',
                  params: { category: String(item.category.id) },
                } as any)}
                accessibilityRole="button"
                accessibilityLabel={`${item.category.name}, ${peso(item.spent)} spent this month. Open category expenses.`}
                style={{ width: 76, alignItems: 'center' }}
              >
                <View
                  style={{
                    width: 68,
                    height: 68,
                    borderRadius: 34,
                    backgroundColor: item.category.bg || '#e6f4f1',
                    borderWidth: 1,
                    borderColor: item.category.color || '#c9e6df',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: item.category.color || COLORS.brand, fontSize: 27, fontWeight: '800' }}>
                    {getCategorySymbol(item.category.icon)}
                  </Text>
                </View>
                <Text
                  numberOfLines={1}
                  style={{ color: COLORS.ink, fontSize: 11, fontWeight: '700', marginTop: 8, width: '100%', textAlign: 'center' }}
                >
                  {item.category.name}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{ color: COLORS.muted, fontSize: 9, marginTop: 3, width: '100%', textAlign: 'center' }}
                >
                  {peso(item.spent)}
                </Text>
              </Pressable>
            ))}

            <Pressable
              onPress={openCategoryPicker}
              accessibilityRole="button"
              accessibilityLabel="Add or edit categories"
              style={{ width: 76, alignItems: 'center' }}
            >
              <View
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: 34,
                  borderWidth: 1.5,
                  borderStyle: 'dashed',
                  borderColor: '#0f766e',
                  backgroundColor: '#ffffff',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: COLORS.brand, fontSize: 29, fontWeight: '500' }}>＋</Text>
              </View>
              <Text style={{ color: COLORS.brand, fontSize: 11, fontWeight: '700', marginTop: 8, textAlign: 'center' }}>
                Add category
              </Text>
              <Text style={{ color: COLORS.muted, fontSize: 9, marginTop: 3, textAlign: 'center' }}>
                Choose
              </Text>
            </Pressable>

          </ScrollView>
        </View>

        {/* BUDGET HEALTH */}

        <View style={styles.healthCard}>
          <View style={styles.healthTop}>
            <View>
              <Text style={styles.healthLabel}>MONTHLY BUDGET HEALTH</Text>
              <Text style={styles.healthAmount}>
                {peso(Math.max(budgetRemaining, 0))}
              </Text>
              <Text style={styles.healthDescription}>
                {budgetRemaining < 0
                  ? 'You have exceeded your total budget.'
                  : 'Remaining from your active budgets.'}
              </Text>
            </View>

            <View
              style={[
                styles.healthIcon,
                {
                  backgroundColor:
                    totalBudget > 0 && totalExpense / totalBudget >= 0.8
                      ? '#fff1e0'
                      : '#e6f4f1',
                },
              ]}
            >
              <Text style={styles.healthIconText}>
                {totalBudget === 0
                  ? '—'
                  : totalExpense / totalBudget >= 1
                    ? '!'
                    : totalExpense / totalBudget >= 0.8
                      ? '!'
                      : '✓'}
              </Text>
            </View>
          </View>

          {totalBudget > 0 ? (
            <>
              <View style={styles.healthTrack}>
                <View
                  style={[
                    styles.healthProgress,
                    {
                      width: `${Math.min(
                        (totalExpense / totalBudget) * 100,
                        100,
                      )}%`,
                      backgroundColor:
                        totalExpense / totalBudget >= 1
                          ? '#dc2626'
                          : totalExpense / totalBudget >= 0.8
                            ? '#d97706'
                            : '#0f766e',
                    },
                  ]}
                />
              </View>

              <View style={styles.healthFooter}>
                <Text style={styles.healthFooterText}>
                  {peso(totalExpense)} spent
                </Text>
                <Text style={styles.healthFooterText}>
                  {peso(totalBudget)} budget
                </Text>
              </View>
            </>
          ) : (
            <Text style={styles.emptyHint}>
              Create a budget to start tracking your spending.
            </Text>
          )}
        </View>

        {/* CATEGORY SPENDING */}

        <View style={styles.section}>
          <SectionHeader
            title="Spending by Category"
            subtitle="Your spending this month"
          />

          {categorySpending.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptySymbol}>▦</Text>
              <Text style={styles.emptyTitle}>No tracked categories yet</Text>
              <Text style={styles.emptyDescription}>
                Your selected categories will appear here.
              </Text>
            </View>
          ) : (
            <View style={styles.listCard}>
              {categorySpending.map((item) => {
                const progress = item.budget
                  ? Math.min(item.percentage, 100)
                  : 0

                return (
                  <View key={item.category.id} style={styles.categoryRow}>
                    <View
                      style={[
                        styles.categoryIcon,
                        { backgroundColor: item.category.bg || '#e6f4f1' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.categorySymbol,
                          { color: item.category.color || COLORS.brand },
                        ]}
                      >
                        {getCategorySymbol(item.category.icon)}
                      </Text>
                    </View>

                    <View style={styles.categoryContent}>
                      <View style={styles.categoryHeading}>
                        <Text style={styles.categoryName} numberOfLines={1}>
                          {item.category.name}
                        </Text>
                        <Text style={styles.categoryAmount}>
                          {peso(item.spent)}
                        </Text>
                      </View>

                      <View style={styles.categoryTrack}>
                        <View
                          style={[
                            styles.categoryProgress,
                            {
                              width: `${progress}%`,
                              backgroundColor:
                                item.percentage >= 100
                                  ? '#dc2626'
                                  : item.percentage >= 80
                                    ? '#d97706'
                                    : item.category.color || COLORS.brand,
                            },
                          ]}
                        />
                      </View>

                      <Text style={styles.categoryMeta}>
                        {item.budget > 0
                          ? `${peso(item.spent)} of ${peso(item.budget)}`
                          : 'No budget assigned'}
                      </Text>
                    </View>
                  </View>
                )
              })}
            </View>
          )}
        </View>

        {/* SIX-MONTH SPENDING TREND */}

        <View style={styles.section}>
          <SectionHeader
            title="Spending Trend"
            subtitle="Your expenses over the last six months"
          />

          <View style={styles.chartCard}>
            <View style={styles.chartTop}>
              <Text style={styles.chartTitle}>Monthly expenses</Text>
              <Text style={styles.chartUnit}>PHP (₱)</Text>
            </View>

            <View style={styles.barChart}>
              {monthLabels.map((item, index) => {
                const height = Math.max(
                  (item.total / maximumMonthlyExpense) * 130,
                  item.total > 0 ? 5 : 3,
                )

                const isCurrentMonth =
                  index === monthLabels.length - 1

                return (
                  <View key={`${item.year}-${item.month}`} style={styles.barColumn}>
                    <Text style={styles.barValue}>
                      {item.total > 0
                        ? item.total >= 1000
                          ? `${(item.total / 1000).toFixed(1)}k`
                          : Math.round(item.total).toString()
                        : '—'}
                    </Text>

                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.bar,
                          {
                            height,
                            backgroundColor: isCurrentMonth
                              ? '#0f766e'
                              : '#a8d8d1',
                          },
                        ]}
                      />
                    </View>

                    <Text
                      style={[
                        styles.barLabel,
                        isCurrentMonth && styles.currentBarLabel,
                      ]}
                    >
                      {item.month}
                    </Text>
                  </View>
                )
              })}
            </View>
          </View>
        </View>

        {/* RECENT TRANSACTIONS */}

        <View style={styles.section}>
          <SectionHeader
            title="Recent Transactions"
            subtitle="Your latest expense entries"
          />

          {currentMonthExpenses.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptySymbol}>₱</Text>
              <Text style={styles.emptyTitle}>No expenses this month</Text>
              <Text style={styles.emptyDescription}>
                Your transactions will appear here when you start recording
                expenses.
              </Text>
            </View>
          ) : (
            <View style={styles.listCard}>
              {currentMonthExpenses.slice(0, 5).map((expense) => {
                const category = data.categories.find(
                  (item) => item.id === expense.category_id,
                )

                return (
                  <View key={expense.id} style={styles.transactionRow}>
                    <View
                      style={[
                        styles.categoryIcon,
                        {
                          backgroundColor: category?.bg || '#e6f4f1',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.categorySymbol,
                          { color: category?.color || COLORS.brand },
                        ]}
                      >
                        {getCategorySymbol(category?.icon ?? 'coins')}
                      </Text>
                    </View>

                    <View style={styles.transactionContent}>
                      <Text style={styles.transactionName} numberOfLines={1}>
                        {expense.note?.trim() ||
                          category?.name ||
                          'Expense'}
                      </Text>

                      <Text style={styles.transactionMeta}>
                        {category?.name ?? 'Uncategorized'} ·{' '}
                        {shortDate(expense.spent_on)}
                      </Text>
                    </View>

                    <Text style={styles.transactionAmount}>
                      -{peso(expense.amount)}
                    </Text>
                  </View>
                )
              })}
            </View>
          )}
        </View>

        {/* BUDGET PROGRESS */}

        <View style={styles.section}>
          <SectionHeader
            title="Budget Progress"
            subtitle="How each category is doing"
          />

          {categorySpending.filter((item) => item.budget > 0).length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptySymbol}>◉</Text>
              <Text style={styles.emptyTitle}>No active budgets</Text>
              <Text style={styles.emptyDescription}>
                Your active category budgets will appear here.
              </Text>
            </View>
          ) : (
            <View style={styles.listCard}>
              {categorySpending
                .filter((item) => item.budget > 0)
                .map((item) => (
                  <View key={item.category.id} style={styles.budgetRow}>
                    <View style={styles.budgetHeading}>
                      <Text style={styles.budgetName}>
                        {item.category.name}
                      </Text>

                      <Text style={styles.budgetPercentage}>
                        {Math.round(item.percentage)}%
                      </Text>
                    </View>

                    <View style={styles.categoryTrack}>
                      <View
                        style={[
                          styles.categoryProgress,
                          {
                            width: `${Math.min(item.percentage, 100)}%`,
                            backgroundColor:
                              item.percentage >= 100
                                ? '#dc2626'
                                : item.percentage >= 80
                                  ? '#d97706'
                                  : COLORS.brand,
                          },
                        ]}
                      />
                    </View>

                    <View style={styles.budgetFooter}>
                      <Text style={styles.budgetSpent}>
                        {peso(item.spent)} spent
                      </Text>

                      <Text style={styles.budgetLimit}>
                        {peso(item.budget)} limit
                      </Text>
                    </View>

                    {item.percentage >= 100 ? (
                      <Text style={styles.warningText}>
                        Over budget
                      </Text>
                    ) : item.percentage >= 80 ? (
                      <Text style={styles.warningText}>
                        Nearing budget limit
                      </Text>
                    ) : null}
                  </View>
                ))}
            </View>
          )}
        </View>

        {/* FOOTER */}

        <View style={styles.footer}>
          <Text style={styles.footerBrand}>Track Mo, Pake Ko!</Text>
          <Text style={styles.footerText}>Your money. Your control.</Text>
        </View>
      </ScrollView>

      <Modal
        visible={categoryModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCategoryModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(10, 25, 20, 0.48)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#ffffff', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24, maxHeight: '88%' }}>
            <View style={{ alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: '#d8e0dc', marginBottom: 18 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ color: COLORS.ink, fontSize: 20, fontWeight: '800' }}>What do you want to track?</Text>
              <Pressable onPress={() => setCategoryModalVisible(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close category picker" disabled={savingCategories}>
                <Text style={{ color: COLORS.muted, fontSize: 26, lineHeight: 30 }}>×</Text>
              </Pressable>
            </View>
            <Text style={{ color: COLORS.muted, fontSize: 13, marginBottom: 14 }}>Choose the categories you spend on. You can change them anytime.</Text>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 8 }}>
              {pickerOptions.map((category) => {
                const isSelected = selectedCategoryIds.has(category.id)
                return (
                  <Pressable
                    key={category.id}
                    onPress={() => handleToggleCategory(category.id)}
                    disabled={savingCategories}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isSelected, disabled: savingCategories }}
                    accessibilityLabel={category.name}
                    style={{ flexDirection: 'row', alignItems: 'center', padding: 13, borderRadius: 14, borderWidth: isSelected ? 2 : 1, borderColor: isSelected ? COLORS.brand : '#cbd3cf', backgroundColor: isSelected ? '#e6f4f1' : '#ffffff', opacity: savingCategories ? 0.65 : 1 }}
                  >
                    <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: category.bg || '#e6f4f1', alignItems: 'center', justifyContent: 'center', marginRight: 11 }}>
                      <Text style={{ color: category.color || COLORS.brand, fontSize: 22, fontWeight: '800' }}>{getCategorySymbol(category.icon)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: COLORS.ink, fontSize: 14, fontWeight: '800' }}>{category.name}</Text>
                      <Text style={{ color: COLORS.muted, fontSize: 11, marginTop: 3 }}>
                        {category.slug === 'transportation' ? 'Fare, fuel, commute' :
                          category.slug === 'medicine' ? 'Meds, checkups' :
                          category.slug === 'food-water' ? 'Meals, groceries, water' :
                          category.slug === 'bills-utilities' ? 'Electric, internet, water bill' :
                          category.slug === 'entertainment' ? 'Movies, games, outings' :
                          category.slug === 'shopping' ? 'Clothes, gadgets, other items' :
                          category.slug === 'rent' ? 'Housing and dorm' :
                          category.slug === 'others-savings' ? 'Other costs and savings' : ''}
                      </Text>
                      {isSelected ? <Text style={{ color: COLORS.brand, fontSize: 11, fontWeight: '800', marginTop: 3 }}>Selected</Text> : null}
                    </View>
                    <View style={{ width: 22, height: 22, borderRadius: 4, borderWidth: 1.5, borderColor: isSelected ? COLORS.brand : '#87938e', backgroundColor: isSelected ? COLORS.brand : '#ffffff', alignItems: 'center', justifyContent: 'center' }}>
                      {isSelected ? <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '800', lineHeight: 18 }}>✓</Text> : null}
                    </View>
                  </Pressable>
                )
              })}
              {pickerOptions.length === 0 ? <Text style={{ color: COLORS.muted, fontSize: 12, paddingVertical: 12 }}>No categories are currently available.</Text> : null}
            </ScrollView>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 14 }}>
              <Text style={{ color: COLORS.muted, fontSize: 12 }}>{selectedCategoryIds.size} categories selected</Text>
              <Pressable onPress={() => setSelectedCategoryIds(new Set(pickerOptions.map((category) => category.id)))} disabled={savingCategories}>
                <Text style={{ color: COLORS.brand, fontSize: 13, fontWeight: '800', textDecorationLine: 'underline' }}>Select all</Text>
              </Pressable>
            </View>
            <Pressable onPress={handleSaveCategories} disabled={savingCategories} style={{ backgroundColor: COLORS.brand, borderRadius: 13, paddingVertical: 14, alignItems: 'center', opacity: savingCategories ? 0.65 : 1 }}>
              {savingCategories ? <ActivityIndicator color="#ffffff" /> : <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '800' }}>Save categories</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

// --------------------------------------------------
// STYLES
// --------------------------------------------------

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.canvas,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.canvas,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: COLORS.muted,
    fontSize: 14,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 22,
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandMark: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: '#0f766e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandMarkText: {
    color: '#ffffff',
    fontSize: 25,
    fontWeight: '800',
  },
  brandName: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.ink,
  },
  brandTagline: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 2,
  },
  signOutButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: COLORS.line,
    justifyContent: 'center',
    alignItems: 'center',
  },
  signOutSymbol: {
    fontSize: 24,
    color: COLORS.danger,
  },
  welcomeCard: {
    borderRadius: 22,
    padding: 22,
    marginBottom: 28,
  },
  welcomeEyebrow: {
    color: '#b8e5dc',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.3,
  },
  welcomeTitle: {
    color: '#ffffff',
    fontSize: 29,
    fontWeight: '800',
    lineHeight: 36,
    marginTop: 12,
  },
  welcomeSubtitle: {
    color: '#d4efea',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
  },
  welcomeFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 23,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  welcomeMonth: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  welcomeSmall: {
    color: '#c5e6e0',
    fontSize: 11,
    marginTop: 3,
  },
  welcomeBadge: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  welcomeBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  sectionHeader: {
    marginBottom: 13,
  },
  sectionTitle: {
    color: COLORS.ink,
    fontSize: 19,
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 4,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 22,
  },
  summaryCard: {
    width: '48%',
    minHeight: 154,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 14,
  },
  summaryIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 11,
  },
  summarySymbol: {
    fontSize: 19,
    fontWeight: '800',
  },
  summaryTitle: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  summaryAmount: {
    color: COLORS.ink,
    fontSize: 19,
    fontWeight: '800',
    marginTop: 6,
  },
  summaryDescription: {
    color: '#84908b',
    fontSize: 10,
    marginTop: 5,
  },
  healthCard: {
    backgroundColor: '#ffffff',
    borderRadius: 19,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 17,
    marginBottom: 27,
  },
  healthTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  healthLabel: {
    fontSize: 10,
    color: COLORS.muted,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  healthAmount: {
    fontSize: 25,
    fontWeight: '800',
    color: COLORS.ink,
    marginTop: 7,
  },
  healthDescription: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 4,
  },
  healthIcon: {
    width: 43,
    height: 43,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  healthIconText: {
    fontSize: 21,
    fontWeight: '800',
    color: COLORS.brand,
  },
  healthTrack: {
    height: 9,
    borderRadius: 10,
    backgroundColor: '#edf0ed',
    overflow: 'hidden',
    marginTop: 19,
  },
  healthProgress: {
    height: '100%',
    borderRadius: 10,
  },
  healthFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 9,
  },
  healthFooterText: {
    color: COLORS.muted,
    fontSize: 10,
  },
  emptyHint: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 15,
  },
  section: {
    marginBottom: 27,
  },
  listCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 18,
    paddingHorizontal: 14,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f2f0',
  },
  categoryIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categorySymbol: {
    fontSize: 21,
    fontWeight: '800',
  },
  categoryContent: {
    flex: 1,
  },
  categoryHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  categoryName: {
    flex: 1,
    color: COLORS.ink,
    fontSize: 12,
    fontWeight: '700',
  },
  categoryAmount: {
    color: COLORS.ink,
    fontSize: 12,
    fontWeight: '700',
  },
  categoryTrack: {
    height: 6,
    backgroundColor: '#edf0ed',
    borderRadius: 10,
    overflow: 'hidden',
    marginTop: 9,
  },
  categoryProgress: {
    height: '100%',
    borderRadius: 10,
  },
  categoryMeta: {
    color: '#84908b',
    fontSize: 10,
    marginTop: 5,
  },
  chartCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 18,
    padding: 16,
  },
  chartTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chartTitle: {
    fontSize: 13,
    color: COLORS.ink,
    fontWeight: '700',
  },
  chartUnit: {
    color: COLORS.muted,
    fontSize: 10,
  },
  barChart: {
    height: 190,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    marginTop: 15,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  barValue: {
    color: COLORS.muted,
    fontSize: 9,
    marginBottom: 7,
  },
  barTrack: {
    height: 135,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: {
    width: 19,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  barLabel: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 8,
  },
  currentBarLabel: {
    color: COLORS.brand,
    fontWeight: '800',
  },
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f2f0',
  },
  transactionContent: {
    flex: 1,
  },
  transactionName: {
    color: COLORS.ink,
    fontSize: 12,
    fontWeight: '700',
  },
  transactionMeta: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 4,
  },
  transactionAmount: {
    color: COLORS.ink,
    fontSize: 12,
    fontWeight: '800',
  },
  budgetRow: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f2f0',
  },
  budgetHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  budgetName: {
    color: COLORS.ink,
    fontSize: 12,
    fontWeight: '700',
  },
  budgetPercentage: {
    color: COLORS.brand,
    fontSize: 12,
    fontWeight: '800',
  },
  budgetFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 7,
  },
  budgetSpent: {
    color: COLORS.muted,
    fontSize: 10,
  },
  budgetLimit: {
    color: COLORS.muted,
    fontSize: 10,
  },
  warningText: {
    color: COLORS.danger,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 8,
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 25,
    alignItems: 'center',
  },
  emptySymbol: {
    color: COLORS.brand,
    fontSize: 29,
    fontWeight: '800',
    marginBottom: 9,
  },
  emptyTitle: {
    color: COLORS.ink,
    fontSize: 14,
    fontWeight: '800',
  },
  emptyDescription: {
    color: COLORS.muted,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 6,
  },
  errorCard: {
    backgroundColor: '#fff1f0',
    borderRadius: 15,
    padding: 15,
    marginBottom: 22,
  },
  errorTitle: {
    color: COLORS.danger,
    fontSize: 13,
    fontWeight: '800',
  },
  errorMessage: {
    color: '#7f1d1d',
    fontSize: 11,
    marginTop: 5,
  },
  retryButton: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 9,
    backgroundColor: '#fee2e2',
  },
  retryText: {
    color: COLORS.danger,
    fontSize: 11,
    fontWeight: '800',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  footerBrand: {
    color: COLORS.brand,
    fontSize: 13,
    fontWeight: '800',
  },
  footerText: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 4,
  },
})
