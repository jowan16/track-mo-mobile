import { useAppTheme } from '@/context/ThemeContext'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Image,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { UserMenuButton } from '@/components/user-navigation'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/services/supabase'

type Category = {
  id: number
  name: string
  icon: string
  color: string
  bg: string
  is_active: boolean
  sort_order: number
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

type Expense = {
  id: string
  user_id: string
  category_id: number
  amount: number
  spent_on: string
  is_archived: boolean
}

const LIGHT_COLORS = {
  canvas: '#f6f7f5',
  ink: '#14201c',
  muted: '#4b5754',
  line: '#e4e8e5',
  brand: '#0f766e',
  danger: '#b42318',
  orange: '#c2410c',
}
function getCOLORS(dark: boolean) { return dark ? {
  canvas: '#101a18',
  ink: '#edf5f1',
  muted: '#a9b8b1',
  line: '#30413a',
  brand: '#55c6b0',
  danger: '#ff8178',
  orange: '#ffad70',
} : LIGHT_COLORS }


function peso(value: number) {
  return `₱ ${value.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function categorySymbol(icon: string) {
  const symbols: Record<string, string> = {
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

  return symbols[icon] ?? '●'
}

function cleanAmount(value: string) {
  let cleaned = value.replace(/[^\d.]/g, '')
  const firstDot = cleaned.indexOf('.')

  if (firstDot !== -1) {
    cleaned =
      cleaned.slice(0, firstDot + 1) +
      cleaned.slice(firstDot + 1).replace(/\./g, '')
  }

  const parts = cleaned.split('.')

  if (parts.length === 2) {
    cleaned = `${parts[0]}.${parts[1].slice(0, 2)}`
  }

  return cleaned
}

function monthRange(year: number, month: number) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const nextMonth = new Date(year, month, 1)
  const to = `${nextMonth.getFullYear()}-${String(
    nextMonth.getMonth() + 1,
  ).padStart(2, '0')}-01`

  return { from, to }
}

export default function BudgetsScreen() {
  const { resolvedTheme } = useAppTheme()
  const dark = resolvedTheme === 'dark'
  const COLORS = getCOLORS(dark)
  const styles = makeStyles(dark, COLORS)

  const { profile } = useAuth()

  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  const monthName = now.toLocaleDateString('en-PH', {
    month: 'long',
    year: 'numeric',
  })

  const [categories, setCategories] = useState<Category[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const [formVisible, setFormVisible] = useState(false)
  const [editing, setEditing] = useState<Budget | null>(null)
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [amount, setAmount] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [archivingId, setArchivingId] = useState<string | null>(null)

  // LOAD DATA

  const loadBudgets = useCallback(async () => {
    if (!profile?.id) return

    setErrorMessage('')

    try {
      const { from, to } = monthRange(year, month)

      const [
        categoriesResult,
        userCategoriesResult,
        budgetsResult,
        expensesResult,
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
          .from('budgets')
          .select('*')
          .eq('user_id', profile.id)
          .eq('is_archived', false)
          .eq('month', month)
          .eq('year', year),

        supabase
          .from('expenses')
          .select('*')
          .eq('user_id', profile.id)
          .eq('is_archived', false)
          .gte('spent_on', from)
          .lt('spent_on', to)
          .order('spent_on', { ascending: false }),
      ])

      if (categoriesResult.error) throw categoriesResult.error
      if (userCategoriesResult.error) throw userCategoriesResult.error
      if (budgetsResult.error) throw budgetsResult.error
      if (expensesResult.error) throw expensesResult.error

      const selectedIds = new Set(
        (userCategoriesResult.data ?? []).map((item) =>
          Number(item.category_id),
        ),
      )

      const trackedCategories = (
        (categoriesResult.data ?? []) as Category[]
      ).filter((category) => selectedIds.has(category.id))

      const trackedIds = new Set(
        trackedCategories.map((category) => category.id),
      )

      const activeBudgets = (
        (budgetsResult.data ?? []) as Budget[]
      )
        .filter((budget) => trackedIds.has(budget.category_id))
        .map((budget) => ({
          ...budget,
          amount: Number(budget.amount),
        }))

      const trackedExpenses = (
        (expensesResult.data ?? []) as Expense[]
      )
        .filter((expense) => trackedIds.has(expense.category_id))
        .map((expense) => ({
          ...expense,
          amount: Number(expense.amount),
        }))

      setCategories(trackedCategories)
      setBudgets(activeBudgets)
      setExpenses(trackedExpenses)
    } catch (error) {
      console.error('Budgets loading error:', error)

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to load your budgets.',
      )
    }
  }, [profile?.id, month, year])

  useEffect(() => {
    let mounted = true

    const initialize = async () => {
      setLoading(true)
      await loadBudgets()

      if (mounted) setLoading(false)
    }

    void initialize()

    return () => {
      mounted = false
    }
  }, [loadBudgets])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadBudgets()
    setRefreshing(false)
  }, [loadBudgets])

  // CALCULATIONS

  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  )

  const spent = useMemo(() => {
    const totals = new Map<number, number>()

    expenses.forEach((expense) => {
      totals.set(
        expense.category_id,
        (totals.get(expense.category_id) ?? 0) + expense.amount,
      )
    })

    return totals
  }, [expenses])

  const monthlyAllowance = budgets.reduce(
    (total, budget) => total + budget.amount,
    0,
  )

  const totalSpent = expenses.reduce(
    (total, expense) => total + expense.amount,
    0,
  )

  const budgetUsed = budgets.reduce(
    (total, budget) =>
      total + (spent.get(budget.category_id) ?? 0),
    0,
  )

  const remainingBudget = monthlyAllowance - budgetUsed

  const freeCategories = categories.filter(
    (category) =>
      !budgets.some(
        (budget) => budget.category_id === category.id,
      ),
  )

  // FORM ACTIONS

  const openAdd = () => {
    if (freeCategories.length === 0) {
      Alert.alert(
        'No available categories',
        'All your tracked categories already have an active budget this month.',
      )
      return
    }

    setEditing(null)
    setCategoryId(null)
    setAmount('')
    setFormError('')
    setFormVisible(true)
  }

  const openEdit = (budget: Budget) => {
    setEditing(budget)
    setCategoryId(budget.category_id)
    setAmount(String(budget.amount))
    setFormError('')
    setFormVisible(true)
  }

  const closeForm = () => {
    if (saving) return

    setFormVisible(false)
    setEditing(null)
    setCategoryId(null)
    setAmount('')
    setFormError('')
  }

  const saveBudget = async () => {
    if (!profile?.id || saving) return

    if (
      categoryId === null ||
      !categories.some((category) => category.id === categoryId)
    ) {
      setFormError('Please select a tracked category.')
      return
    }

    const trimmedAmount = amount.trim()

    if (!/^\d+(\.\d{1,2})?$/.test(trimmedAmount)) {
      setFormError(
        'Enter a valid monthly limit with up to 2 decimal places.',
      )
      return
    }

    const numericAmount = Number(trimmedAmount)

    if (numericAmount <= 0) {
      setFormError('Monthly limit must be greater than zero.')
      return
    }

    if (numericAmount > 9999999.99) {
      setFormError('Monthly limit is too large.')
      return
    }

    setSaving(true)
    setFormError('')

    try {
      const result = editing
        ? await supabase
            .from('budgets')
            .update({
              category_id: categoryId,
              amount: numericAmount,
            })
            .eq('id', editing.id)
            .eq('user_id', profile.id)
            .eq('is_archived', false)
        : await supabase.from('budgets').insert({
            user_id: profile.id,
            category_id: categoryId,
            month,
            year,
            amount: numericAmount,
            is_archived: false,
          })

      if (result.error) {
        if (result.error.code === '23505') {
          const categoryName =
            categoryMap.get(categoryId)?.name ?? 'This category'

          setFormError(
            `An active budget for ${categoryName} already exists this month.`,
          )
          return
        }

        throw result.error
      }

      setFormVisible(false)
      setEditing(null)
      setCategoryId(null)
      setAmount('')

      await loadBudgets()

      Alert.alert(
        'Success',
        editing ? 'Budget updated successfully.' : 'Budget created successfully.',
      )
    } catch (error) {
      console.error('Budget save error:', error)

      setFormError(
        error instanceof Error
          ? error.message
          : 'Unable to save this budget.',
      )
    } finally {
      setSaving(false)
    }
  }

  // ARCHIVE BUDGET

  const archiveBudget = (budget: Budget) => {
    const categoryName =
      categoryMap.get(budget.category_id)?.name ?? 'this category'

    Alert.alert(
      'Move budget to archive?',
      `The ${categoryName} budget will be moved to your archive. Its recorded expenses will remain unchanged.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Move to archive',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              if (!profile?.id) return

              setArchivingId(budget.id)

              try {
                const { error } = await supabase
                  .from('budgets')
                  .update({ is_archived: true })
                  .eq('id', budget.id)
                  .eq('user_id', profile.id)
                  .eq('is_archived', false)

                if (error) throw error

                await loadBudgets()
              } catch (error) {
                console.error('Budget archive error:', error)

                Alert.alert(
                  'Unable to archive',
                  error instanceof Error
                    ? error.message
                    : 'Please try again.',
                )
              } finally {
                setArchivingId(null)
              }
            })()
          },
        },
      ],
    )
  }

  // LOADING

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.brand} />
        <Text style={styles.loadingText}>Loading your budgets...</Text>
      </SafeAreaView>
    )
  }

  // MAIN SCREEN

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
          <UserMenuButton />
          <View style={styles.headerText}>
            <Text style={styles.pageTitle}>Budgets</Text>
            <Text style={styles.pageSubtitle}>
              Manage your monthly spending limits.
            </Text>
          </View>

          <View style={styles.headerSpacer} />
        </View>

        {/* MONTH */}

        <View style={styles.monthBadge}>
          <Text style={styles.monthBadgeText}>{monthName}</Text>
        </View>

        {/* ADD BUDGET */}

        <Pressable
          style={styles.addButton}
          onPress={openAdd}
          accessibilityRole="button"
        >
          <Text style={styles.addButtonText}>＋ New Budget</Text>
        </Pressable>

        {/* ERROR */}

        {errorMessage ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Unable to load budgets</Text>
            <Text style={styles.errorMessage}>{errorMessage}</Text>
            <Pressable onPress={onRefresh}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : null}

        {/* SUMMARY */}

        <Text style={styles.sectionTitle}>Monthly Overview</Text>

        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>MONTHLY ALLOWANCE</Text>
            <Text style={styles.summaryAmount}>
              {peso(monthlyAllowance)}
            </Text>
            <Text style={styles.summaryDescription}>
              Total active budgets
            </Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>TOTAL SPENT</Text>
            <Text style={styles.summaryAmount}>
              {peso(totalSpent)}
            </Text>
            <Text style={styles.summaryDescription}>
              All tracked categories
            </Text>
          </View>

          <View style={[styles.summaryCard, styles.summaryCardFull]}>
            <Text style={styles.summaryLabel}>REMAINING BUDGET</Text>
            <Text
              style={[
                styles.summaryAmount,
                remainingBudget < 0 && styles.negativeAmount,
              ]}
            >
              {peso(remainingBudget)}
            </Text>
            <Text style={styles.summaryDescription}>
              Spending in categories with active budgets deducted
            </Text>
          </View>
        </View>

        {/* CATEGORY BUDGETS */}

        <View style={styles.listHeader}>
          <View>
            <Text style={styles.sectionTitle}>Category Budgets</Text>
            <Text style={styles.sectionSubtitle}>
              Spending progress for each active budget
            </Text>
          </View>
          <Text style={styles.budgetCount}>
            {budgets.length} active
          </Text>
        </View>

        {budgets.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptySymbol}>₱</Text>
            <Text style={styles.emptyTitle}>No budgets yet</Text>
            <Text style={styles.emptyDescription}>
              Set a monthly limit for one of your tracked categories to
              monitor your spending.
            </Text>
            {freeCategories.length > 0 ? (
              <Pressable
                style={styles.emptyButton}
                onPress={openAdd}
              >
                <Text style={styles.emptyButtonText}>
                  Create your first budget
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={styles.budgetList}>
            {budgets.map((budget) => {
              const category = categoryMap.get(budget.category_id)
              const categorySpent = spent.get(budget.category_id) ?? 0
              const percent =
                budget.amount > 0
                  ? (categorySpent / budget.amount) * 100
                  : 0

              const progressColor =
                percent >= 100
                  ? COLORS.danger
                  : percent >= 80
                    ? COLORS.orange
                    : COLORS.brand

              return (
                <View key={budget.id} style={styles.budgetCard}>
                  <View style={styles.budgetTopRow}>
                    <View style={styles.categoryInfo}>
                      <View
                        style={[
                          styles.categoryIcon,
                          {
                            backgroundColor:
                              category?.bg ?? '#e6f4f1',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.categorySymbol,
                            { color: category?.color ?? COLORS.brand },
                          ]}
                        >
                          {categorySymbol(category?.icon ?? '')}
                        </Text>
                      </View>

                      <View style={styles.categoryText}>
                        <Text style={styles.categoryName}>
                          {category?.name ?? 'Category'}
                        </Text>
                        <Text style={styles.categoryLimit}>
                          Limit: {peso(budget.amount)}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.percentText}>
                      {Math.round(percent)}%
                    </Text>
                  </View>

                  <View style={styles.spendingRow}>
                    <Text style={styles.spentAmount}>
                      {peso(categorySpent)}
                    </Text>
                    <Text style={styles.spendingOf}>of</Text>
                    <Text style={styles.limitAmount}>
                      {peso(budget.amount)}
                    </Text>
                  </View>

                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.min(percent, 100)}%`,
                          backgroundColor: progressColor,
                        },
                      ]}
                    />
                  </View>

                  {percent >= 100 ? (
                    <Text style={styles.dangerAlert}>
                      Over budget
                    </Text>
                  ) : percent >= 80 ? (
                    <Text style={styles.warningAlert}>
                      Alert at 80% reached
                    </Text>
                  ) : (
                    <Text style={styles.normalAlert}>
                      Within budget
                    </Text>
                  )}

                  <View style={styles.actionRow}>
                    <Pressable
                      style={styles.editButton}
                      onPress={() => openEdit(budget)}
                      accessibilityRole="button"
                    >
                      <Text style={styles.editButtonText}>
                        ✎ Edit budget
                      </Text>
                    </Pressable>

                    <Pressable
                      style={styles.archiveButton}
                      onPress={() => archiveBudget(budget)}
                      disabled={archivingId === budget.id}
                      accessibilityRole="button"
                    >
                      <Text style={styles.archiveButtonText}>
                        {archivingId === budget.id
                          ? 'Archiving...'
                          : '↗ Move to archive'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )
            })}
          </View>
        )}

        {/* AVAILABLE CATEGORIES */}

        <View style={styles.availableCard}>
          <Text style={styles.availableTitle}>
            Categories without a budget
          </Text>
          <Text style={styles.availableDescription}>
            You can create budgets for these tracked categories.
          </Text>

          {freeCategories.length === 0 ? (
            <Text style={styles.noAvailableText}>
              All tracked categories already have an active budget.
            </Text>
          ) : (
            <View style={styles.availableChips}>
              {freeCategories.map((category) => (
                <View key={category.id} style={styles.availableChip}>
                  <Text style={styles.availableChipText}>
                    {category.name}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* FOOTER */}

        <View style={styles.footer}>
          <Text style={styles.footerBrand}>Track Mo, Pake Ko!</Text>
          <Text style={styles.footerText}>
            Every peso has a purpose.
          </Text>
        </View>
      </ScrollView>

      {/* ADD / EDIT MODAL */}

      <Modal
        visible={formVisible}
        transparent
        animationType="slide"
        onRequestClose={closeForm}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  {editing ? 'Edit Budget' : 'New Budget'}
                </Text>
                <Text style={styles.modalSubtitle}>
                  {editing
                    ? 'Update your category spending limit.'
                    : `Set a monthly limit for ${monthName}.`}
                </Text>
              </View>

              <Pressable
                style={styles.closeButton}
                onPress={closeForm}
                disabled={saving}
              >
                <Text style={styles.closeButtonText}>×</Text>
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.formContent}
            >
              <Text style={styles.fieldLabel}>CATEGORY</Text>

              <View style={styles.categoryChoices}>
                {(editing
                  ? categories.filter(
                      (category) => category.id === editing.category_id,
                    )
                  : freeCategories
                ).map((category) => {
                  const selected = categoryId === category.id

                  return (
                    <Pressable
                      key={category.id}
                      style={[
                        styles.categoryChoice,
                        selected && styles.categoryChoiceActive,
                      ]}
                      onPress={() => {
                        setCategoryId(category.id)
                        setFormError('')
                      }}
                    >
                      <View
                        style={[
                          styles.choiceIcon,
                          { backgroundColor: category.bg || '#e6f4f1' },
                        ]}
                      >
                        <Text
                          style={{
                            color: category.color || COLORS.brand,
                            fontSize: 18,
                            fontWeight: '800',
                          }}
                        >
                          {categorySymbol(category.icon)}
                        </Text>
                      </View>

                      <Text
                        style={[
                          styles.categoryChoiceText,
                          selected && styles.categoryChoiceTextActive,
                        ]}
                      >
                        {category.name}
                      </Text>

                      {selected ? (
                        <Text style={styles.selectedCheck}>✓</Text>
                      ) : null}
                    </Pressable>
                  )
                })}
              </View>

              <Text style={styles.fieldLabel}>
                MONTHLY LIMIT (₱)
              </Text>

              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={(value) => {
                  setAmount(cleanAmount(value))
                  setFormError('')
                }}
                placeholder="Enter monthly limit"
                placeholderTextColor="#84908b"
                keyboardType="decimal-pad"
                maxLength={12}
              />

              <Text style={styles.fieldHint}>
                Enter an amount greater than zero, with up to 2 decimal
                places.
              </Text>

              {formError ? (
                <View style={styles.formErrorCard}>
                  <Text style={styles.formErrorText}>{formError}</Text>
                </View>
              ) : null}

              <Pressable
                style={[
                  styles.saveButton,
                  saving && styles.disabledButton,
                ]}
                onPress={() => void saveBudget()}
                disabled={saving}
              >
                <Text style={styles.saveButtonText}>
                  {saving
                    ? 'Saving...'
                    : editing
                      ? 'Update Budget'
                      : 'Save Budget'}
                </Text>
              </Pressable>

              <Pressable
                style={styles.cancelButton}
                onPress={closeForm}
                disabled={saving}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  )
}

function makeStyles(dark: boolean, COLORS: any) { return StyleSheet.create({
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
    paddingTop: 15,
    paddingBottom: 36,
  },
  header: {
      position: 'relative',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 18,
      paddingVertical: 14,
      minHeight: 72,
      backgroundColor: COLORS.white,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.line,
    },
  headerText: { position: 'absolute', left: 72, right: 72, alignItems: 'center' },
  pageTitle: { fontSize: 24, lineHeight: 29, fontWeight: '800', color: COLORS.ink, textAlign: 'center' },
  brandMarkText: {
    color: (dark ? '#1b2a26' : '#ffffff'),
    fontSize: 25,
    fontWeight: '800',
  },
  monthBadge: {
    alignSelf: 'flex-start',
    backgroundColor: (dark ? '#203d36' : '#e6f4f1'),
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 15,
  },
  monthBadgeText: {
    color: COLORS.brand,
    fontSize: 12,
    fontWeight: '800',
  },
  addButton: {
    backgroundColor: COLORS.brand,
    borderRadius: 13,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 20,
  },
  addButtonText: {
    color: (dark ? '#1b2a26' : '#ffffff'),
    fontSize: 14,
    fontWeight: '800',
  },
  errorCard: {
    backgroundColor: (dark ? '#402725' : '#fff0ef'),
    borderColor: (dark ? '#75423e' : '#f3c3bf'),
    borderWidth: 1,
    borderRadius: 15,
    padding: 15,
    marginBottom: 16,
  },
  errorTitle: {
    color: COLORS.danger,
    fontWeight: '800',
    fontSize: 14,
  },
  errorMessage: {
    color: (dark ? '#ffaaa3' : '#7f1d1d'),
    fontSize: 12,
    marginTop: 5,
    marginBottom: 9,
  },
  retryText: {
    color: COLORS.brand,
    fontSize: 13,
    fontWeight: '800',
  },
  sectionTitle: {
    color: COLORS.ink,
    fontSize: 19,
    fontWeight: '800',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
    marginBottom: 23,
  },
  summaryCard: {
    flex: 1,
    minWidth: '46%',
    backgroundColor: (dark ? '#1b2a26' : '#ffffff'),
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 14,
  },
  summaryCardFull: {
    flexBasis: '100%',
  },
  summaryLabel: {
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  summaryAmount: {
    color: COLORS.ink,
    fontSize: 19,
    fontWeight: '800',
    marginTop: 8,
  },
  negativeAmount: {
    color: COLORS.danger,
  },
  summaryDescription: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 5,
    lineHeight: 15,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 13,
  },
  sectionSubtitle: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 4,
  },
  budgetCount: {
    color: COLORS.brand,
    fontSize: 11,
    fontWeight: '800',
  },
  budgetList: {
    gap: 12,
  },
  budgetCard: {
    backgroundColor: (dark ? '#1b2a26' : '#ffffff'),
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 17,
    padding: 15,
  },
  budgetTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  categoryIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categorySymbol: {
    fontSize: 20,
    fontWeight: '800',
  },
  categoryText: {
    flex: 1,
  },
  categoryName: {
    color: COLORS.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  categoryLimit: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 4,
  },
  percentText: {
    color: COLORS.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  spendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 15,
    marginBottom: 9,
  },
  spentAmount: {
    color: COLORS.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  spendingOf: {
    color: COLORS.muted,
    fontSize: 11,
  },
  limitAmount: {
    color: COLORS.muted,
    fontSize: 11,
  },
  progressTrack: {
    height: 9,
    backgroundColor: (dark ? '#2a3a34' : '#edf0ee'),
    borderRadius: 20,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 20,
  },
  normalAlert: {
    color: COLORS.brand,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 8,
  },
  warningAlert: {
    color: COLORS.orange,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 8,
  },
  dangerAlert: {
    color: COLORS.danger,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 8,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    marginTop: 13,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f2f0',
  },
  editButton: {
    backgroundColor: (dark ? '#2b3155' : '#eef0ff'),
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  editButtonText: {
    color: (dark ? '#aab4ff' : '#3b49df'),
    fontSize: 11,
    fontWeight: '700',
  },
  archiveButton: {
    backgroundColor: (dark ? '#453020' : '#fff1e8'),
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  archiveButtonText: {
    color: (dark ? '#ffad70' : '#c2410c'),
    fontSize: 11,
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: (dark ? '#1b2a26' : '#ffffff'),
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 18,
    padding: 25,
    alignItems: 'center',
  },
  emptySymbol: {
    fontSize: 35,
    color: (dark ? '#9aaba3' : '#a8b5ae'),
    fontWeight: '800',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.ink,
    marginTop: 10,
  },
  emptyDescription: {
    fontSize: 12,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 6,
  },
  emptyButton: {
    marginTop: 15,
    backgroundColor: COLORS.brand,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 10,
  },
  emptyButtonText: {
    color: (dark ? '#1b2a26' : '#ffffff'),
    fontSize: 11,
    fontWeight: '800',
  },
  availableCard: {
    backgroundColor: (dark ? '#1b2a26' : '#ffffff'),
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 16,
    padding: 15,
    marginTop: 18,
  },
  availableTitle: {
    color: COLORS.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  availableDescription: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 5,
  },
  availableChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 12,
  },
  availableChip: {
    backgroundColor: (dark ? '#2a3a34' : '#f0f3f1'),
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  availableChipText: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '700',
  },
  noAvailableText: {
    color: COLORS.brand,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 12,
  },
  footer: {
    alignItems: 'center',
    marginTop: 30,
  },
  footerBrand: {
    color: COLORS.brand,
    fontWeight: '800',
    fontSize: 12,
  },
  footerText: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 4,
  },

  // MODAL

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 25, 20, 0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: COLORS.canvas,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 21,
    paddingHorizontal: 20,
    paddingBottom: 20,
    maxHeight: '94%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  modalTitle: {
    color: COLORS.ink,
    fontSize: 21,
    fontWeight: '800',
  },
  modalSubtitle: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 4,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: (dark ? '#1b2a26' : '#ffffff'),
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: COLORS.muted,
    fontSize: 25,
  },
  formContent: {
    paddingBottom: 22,
  },
  fieldLabel: {
    color: COLORS.ink,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 14,
    marginBottom: 8,
  },
  input: {
    backgroundColor: (dark ? '#1b2a26' : '#ffffff'),
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 11,
    minHeight: 48,
    paddingHorizontal: 13,
    color: COLORS.ink,
    fontSize: 14,
  },
  fieldHint: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 6,
    lineHeight: 15,
  },
  categoryChoices: {
    gap: 8,
  },
  categoryChoice: {
    backgroundColor: (dark ? '#1b2a26' : '#ffffff'),
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 11,
    minHeight: 53,
    padding: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  categoryChoiceActive: {
    borderColor: COLORS.brand,
    backgroundColor: (dark ? '#203d36' : '#edf8f5'),
  },
  choiceIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryChoiceText: {
    color: COLORS.ink,
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  categoryChoiceTextActive: {
    color: COLORS.brand,
    fontWeight: '800',
  },
  selectedCheck: {
    color: COLORS.brand,
    fontSize: 17,
    fontWeight: '800',
  },
  formErrorCard: {
    backgroundColor: (dark ? '#402725' : '#fff0ef'),
    borderColor: (dark ? '#75423e' : '#f3c3bf'),
    borderWidth: 1,
    borderRadius: 10,
    padding: 11,
    marginTop: 14,
  },
  formErrorText: {
    color: COLORS.danger,
    fontSize: 11,
    lineHeight: 16,
  },
  saveButton: {
    backgroundColor: COLORS.brand,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 22,
  },
  saveButtonText: {
    color: (dark ? '#1b2a26' : '#ffffff'),
    fontSize: 13,
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.6,
  },
  cancelButton: {
    backgroundColor: (dark ? '#1b2a26' : '#ffffff'),
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 9,
  },
  cancelButtonText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '700',
  },
}) }
