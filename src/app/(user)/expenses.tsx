import { useAppTheme } from '@/context/ThemeContext'



import { useCallback, useEffect, useMemo, useState } from 'react'
import { router, useLocalSearchParams } from 'expo-router'
import {
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

import { useAuth } from '@/context/AuthContext'
import { CategoryIcon } from '@/components/CategoryIcon'
import { supabase, withValidSession } from '@/services/supabase'

// --------------------------------------------------
// TYPES
// --------------------------------------------------

type Category = {
  id: number
  name: string
  icon: string
  color: string
  bg: string
  is_active: boolean
  sort_order: number
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

type ExpenseForm = {
  amount: string
  spent_on: string
  category_id: number | null
  payment_method: string
  note: string
}

const METHODS = ['Cash', 'E-wallet', 'Card', 'Bank transfer']
const PAGE_SIZE = 10

import { UserPageHeader } from '@/components/user-navigation'

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


// --------------------------------------------------
// RECEIPT CATEGORY MATCHING
// --------------------------------------------------

const RECEIPT_CATEGORY_ALIASES: Record<string, string[]> = {
  'Food & Water': ['food & water', 'food and water', 'food', 'grocery', 'groceries', 'dining'],
  Shopping: ['shopping', 'clothing', 'apparel', 'clothes'],
  Rent: ['rent', 'housing'],
  Entertainment: ['entertainment', 'leisure'],
  'Bills & Utilities': ['bills & utilities', 'bills and utilities', 'utilities', 'bills'],
  Transportation: ['transportation', 'transport', 'commute'],
  Medicine: ['medicine', 'medical', 'health'],
  Others: ['others', 'other', 'others/savings', 'other/savings', 'savings'],
}

function normalizeCategoryName(value: string) {
  return value.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim()
}

function findReceiptCategory(
  categories: Category[],
  suggestedCategory: string,
  receiptText = '',
) {
  const suggested = normalizeCategoryName(suggestedCategory)
  const aliases = Object.entries(RECEIPT_CATEGORY_ALIASES).find(([canonical]) =>
    normalizeCategoryName(canonical) === suggested,
  )?.[1] ?? [suggestedCategory]

  const acceptedNames = new Set([suggested, ...aliases.map(normalizeCategoryName)])
  const directMatch = categories.find((category) =>
    acceptedNames.has(normalizeCategoryName(category.name)),
  )
  if (directMatch) return directMatch

  // Also recognize user-enabled/custom category names found in the OCR text.
  const normalizedReceipt = normalizeCategoryName(receiptText)
  const textMatch = categories.find((category) => {
    const categoryName = normalizeCategoryName(category.name)
    return categoryName.length >= 3 && normalizedReceipt.includes(categoryName)
  })
  if (textMatch) return textMatch

  // If the receipt cannot be confidently classified, use the user's
  // catch-all category when it is enabled in their category picker.
  return categories.find((category) =>
    ['others', 'other', 'others savings', 'other savings'].includes(
      normalizeCategoryName(category.name),
    ),
  ) ?? null
}


// --------------------------------------------------
// HELPERS
// --------------------------------------------------

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
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
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

function emptyForm(): ExpenseForm {
  return {
    amount: '',
    spent_on: localDateString(new Date()),
    category_id: null,
    payment_method: 'Cash',
    note: '',
  }
}

function formatReceiptDetails(value: string) {
  return value
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[\t ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 10000)
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

function getAmountError(value: string) {
  const amount = value.trim()

  if (!amount) return 'Enter an amount.'

  if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
    return 'Enter a valid amount with up to 2 decimal places.'
  }

  if (Number(amount) <= 0) {
    return 'Amount must be greater than zero.'
  }

  if (Number(amount) > 9999999.99) {
    return 'Amount is too large.'
  }

  return ''
}

function getDateError(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return 'Enter a valid date in YYYY-MM-DD format.'
  }

  const date = new Date(`${value}T00:00:00`)

  if (
    Number.isNaN(date.getTime()) ||
    localDateString(date) !== value
  ) {
    return 'Enter a valid calendar date.'
  }

  if (value > localDateString(new Date())) {
    return 'Date cannot be in the future.'
  }

  return ''
}

// --------------------------------------------------
// MAIN SCREEN
// --------------------------------------------------

export default function ExpensesScreen() {
  const { resolvedTheme } = useAppTheme()
  const dark = resolvedTheme === 'dark'
  const COLORS = getCOLORS(dark)
  const styles = makeStyles(dark, COLORS)

  const { profile } = useAuth()
  const params = useLocalSearchParams<{ openForm?: string; category?: string; receiptDraft?: string; receiptPath?: string; receiptModel?: string; receiptRawText?: string }>()

  const [categories, setCategories] = useState<Category[]>([])
  const [availableCategories, setAvailableCategories] = useState<Category[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<number | null>(
    null,
  )
  const [page, setPage] = useState(1)
  const [expandedExpenseId, setExpandedExpenseId] = useState<string | null>(null)

  const [formVisible, setFormVisible] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [form, setForm] = useState<ExpenseForm>(emptyForm())
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [budgetWarning, setBudgetWarning] = useState(false)
  const [receiptContext, setReceiptContext] = useState<{ path: string; draft: import('@/services/receiptParser').ParsedReceipt; model: string; rawText: string; detections: unknown[] } | null>(null)

  // ------------------------------------------------
  // LOAD EXPENSES, TRACKED CATEGORIES AND BUDGETS
  // ------------------------------------------------

  const loadExpenses = useCallback(async () => {
    if (!profile?.id) return

    setErrorMessage('')

    try {
      const now = new Date()
      const month = now.getMonth() + 1
      const year = now.getFullYear()

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
          .order('spent_on', { ascending: false })
          .order('created_at', { ascending: false }),

        supabase
          .from('budgets')
          .select('*')
          .eq('user_id', profile.id)
          .eq('is_archived', false)
          .eq('month', month)
          .eq('year', year),
      ])

      if (categoriesResult.error) throw categoriesResult.error
      if (userCategoriesResult.error) throw userCategoriesResult.error
      if (expensesResult.error) throw expensesResult.error
      if (budgetsResult.error) throw budgetsResult.error

      const selectedIds = new Set(
        (userCategoriesResult.data ?? []).map((item) =>
          Number(item.category_id),
        ),
      )

      const allActiveCategories = (categoriesResult.data ?? []) as Category[]
      const trackedCategories = allActiveCategories.filter((category) => selectedIds.has(category.id))

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

      setAvailableCategories(trackedCategories)
      setCategories(trackedCategories)
      setExpenses(trackedExpenses)
      setBudgets(activeBudgets)
    } catch (error) {
      console.error('Expenses loading error:', error)

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to load your expenses.',
      )
    }
  }, [profile?.id])

  useEffect(() => {
    let mounted = true
    const channel = supabase
      .channel('user-expenses-categories')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => {
        void loadExpenses()
      })
      .subscribe()

    const initialize = async () => {
      setLoading(true)
      await loadExpenses()

      if (mounted) setLoading(false)
    }

    void initialize()

    return () => {
      mounted = false
      void supabase.removeChannel(channel)
    }
  }, [loadExpenses])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadExpenses()
    setRefreshing(false)
  }, [loadExpenses])

  // ------------------------------------------------
  // CATEGORY LOOKUP AND SEARCH
  // ------------------------------------------------

  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  )

  const filteredExpenses = useMemo(() => {
    const query = search.trim().toLowerCase()

    return expenses.filter((expense) => {
      if (
        selectedCategory !== null &&
        expense.category_id !== selectedCategory
      ) {
        return false
      }

      if (!query) return true

      const categoryName =
        categoryMap.get(expense.category_id)?.name ?? ''

      const searchable = [
        expense.note ?? '',
        categoryName,
        expense.spent_on,
        String(expense.amount),
        expense.payment_method,
      ]
        .join(' ')
        .toLowerCase()

      return searchable.includes(query)
    })
  }, [expenses, search, selectedCategory, categoryMap])

  const totalPages = Math.max(
    1,
    Math.ceil(filteredExpenses.length / PAGE_SIZE),
  )

  const currentPage = Math.min(page, totalPages)

  const visibleExpenses = filteredExpenses.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  )

  useEffect(() => {
    setPage(1)
  }, [search, selectedCategory])

  useEffect(() => {
    const categoryId = Number(params.category)
    if (params.category && Number.isInteger(categoryId) && categoryId > 0) {
      setSelectedCategory(categoryId)
    }
  }, [params.category])

  // ------------------------------------------------
  // FORM ACTIONS
  // ------------------------------------------------

  const openAdd = () => {
    setEditing(null)
    setReceiptContext(null)
    setForm(emptyForm())
    setFormError('')
    setBudgetWarning(false)
    setFormVisible(true)
  }

  // Open the existing Add Expense form when requested by the sidebar.
  useEffect(() => {
    if (params.openForm === '1') {
      openAdd()
      router.setParams({ openForm: undefined })
    }
  }, [params.openForm])

  // Receipt OCR hands its parsed draft to this screen so it can reuse
  // the exact same Add Expense modal and validation as manual entry.
  useEffect(() => {
    if (loading || !params.receiptDraft || !params.receiptPath) return

    try {
      const draft = JSON.parse(params.receiptDraft) as import('@/services/receiptParser').ParsedReceipt
      // Match the OCR suggestion against the user's active, selected categories.
      // The form remains editable if no matching category is available.
      const category = findReceiptCategory(availableCategories, draft.suggestedCategory, params.receiptRawText || '')
      // Preserve the complete OCR text in the Receipt Details field.
      // Keep each detected receipt line separate for easier reading and editing.
      const note = formatReceiptDetails(params.receiptRawText || '')

      setEditing(null)
      setReceiptContext({
        path: params.receiptPath,
        draft,
        model: params.receiptModel || 'unknown',
        rawText: params.receiptRawText || '',
        detections: [],
      })
      setForm({
        amount: draft.total === null ? '' : String(draft.total),
        spent_on: draft.receipt_date,
        category_id: category?.id ?? null,
        payment_method: METHODS.includes(draft.payment_method) ? draft.payment_method : '',
        note,
      })
      setFormError('')
      setBudgetWarning(false)
      setFormVisible(true)
    } catch (error) {
      Alert.alert(
        'Unable to prepare expense',
        error instanceof Error ? error.message : 'The scanned receipt could not be opened.',
      )
    } finally {
      router.setParams({ receiptDraft: undefined, receiptPath: undefined, receiptModel: undefined, receiptRawText: undefined })
    }
  }, [loading, params.receiptDraft, params.receiptPath, params.receiptModel, params.receiptRawText, availableCategories])

  const openEdit = (expense: Expense) => {
    setEditing(expense)
    setReceiptContext(null)

    setForm({
      amount: String(expense.amount),
      spent_on: expense.spent_on,
      category_id: expense.category_id,
      payment_method: expense.payment_method,
      note: expense.note ?? '',
    })

    setFormError('')
    setBudgetWarning(false)
    setFormVisible(true)
  }

  const closeForm = () => {
    if (saving) return

    setFormVisible(false)
    setEditing(null)
    setReceiptContext(null)
    setFormError('')
    setBudgetWarning(false)
  }

  const updateForm = (values: Partial<ExpenseForm>) => {
    setForm((previous) => ({
      ...previous,
      ...values,
    }))

    setFormError('')
    setBudgetWarning(false)
  }

  // ------------------------------------------------
  // BUDGET CHECK
  // ------------------------------------------------

  const projectedBudget = useMemo(() => {
    if (!form.category_id) return null

    const budget = budgets.find(
      (item) => item.category_id === form.category_id,
    )

    if (!budget || budget.amount <= 0) return null

    const amount = /^\d+(\.\d{1,2})?$/.test(form.amount)
      ? Number(form.amount)
      : 0

    let spent = expenses
      .filter(
        (expense) => expense.category_id === budget.category_id,
      )
      .filter((expense) => {
        const date = new Date(`${expense.spent_on}T00:00:00`)

        return (
          date.getMonth() === new Date().getMonth() &&
          date.getFullYear() === new Date().getFullYear()
        )
      })
      .reduce((total, expense) => total + expense.amount, 0)

    if (
      editing &&
      editing.category_id === budget.category_id
    ) {
      const oldDate = new Date(`${editing.spent_on}T00:00:00`)
      const now = new Date()

      if (
        oldDate.getMonth() === now.getMonth() &&
        oldDate.getFullYear() === now.getFullYear()
      ) {
        spent -= editing.amount
      }
    }

    return Math.round(((spent + amount) / budget.amount) * 100)
  }, [form.category_id, form.amount, budgets, expenses, editing])

  // ------------------------------------------------
  // SAVE EXPENSE
  // ------------------------------------------------

  const saveExpense = async (skipWarning = false) => {
    if (!profile?.id) return

    const amountError = getAmountError(form.amount)
    const dateError = getDateError(form.spent_on)

    if (amountError) {
      setFormError(amountError)
      return
    }

    if (dateError) {
      setFormError(dateError)
      return
    }

    if (!form.category_id) {
      setFormError('Please select a category.')
      return
    }

    const selectableCategories = categories
    if (!selectableCategories.some((item) => item.id === form.category_id)) {
      setFormError('Please select a valid category.')
      return
    }

    if (!METHODS.includes(form.payment_method)) {
      setFormError('Please select a payment method.')
      return
    }

    if (form.note.length > (receiptContext ? 10000 : 200)) {
      setFormError(receiptContext ? 'Receipt details are too long.' : 'Note cannot exceed 200 characters.')
      return
    }

    if (
      !skipWarning &&
      projectedBudget !== null &&
      projectedBudget > 100
    ) {
      setBudgetWarning(true)
      return
    }

    setSaving(true)
    setFormError('')

    try {
      const row = {
        category_id: form.category_id,
        amount: Number(form.amount),
        spent_on: form.spent_on,
        payment_method: form.payment_method,
        note: form.note.trim() || null,
      }

      const result = await withValidSession(async () => {
        if (receiptContext && !editing) {
          return await supabase.rpc('save_receipt_expense', {
            p_storage_path: receiptContext.path,
            p_merchant_name: receiptContext.draft.merchant_name.trim(),
            p_receipt_date: form.spent_on,
            p_subtotal: receiptContext.draft.subtotal,
            p_tax: receiptContext.draft.tax,
            p_total: Number(form.amount),
            p_currency: 'PHP',
            p_category_id: form.category_id,
            p_amount: Number(form.amount),
            p_spent_on: form.spent_on,
            p_payment_method: form.payment_method,
            p_note: form.note.trim() || null,
            p_items: receiptContext.draft.items.filter((item) => item.item_name.trim()).map((item) => ({
              item_name: item.item_name.trim(),
              quantity: item.quantity,
              unit_price: item.unit_price,
              line_total: item.line_total,
            })),
            p_recognition_data: {
              model: receiptContext.model,
              raw_text: receiptContext.rawText,
              confirmed_at: new Date().toISOString(),
            },
          })
        }

        return editing
          ? await supabase
              .from('expenses')
              .update(row)
              .eq('id', editing.id)
              .eq('user_id', profile.id)
          : await supabase
              .from('expenses')
              .insert({
                ...row,
                user_id: profile.id,
              })
      })

      if (result.error) throw result.error

      setFormVisible(false)
      setEditing(null)
      setReceiptContext(null)
      setBudgetWarning(false)
      setForm(emptyForm())

      await loadExpenses()

      Alert.alert(
        'Success',
        editing
          ? 'Your expense has been updated.'
          : receiptContext
            ? 'Your scanned receipt and expense have been saved.'
            : 'Your expense has been recorded.',
      )
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'object' &&
              error !== null &&
              'message' in error &&
              typeof error.message === 'string'
            ? error.message
            : 'Unable to save your expense. Please try again.'

      console.error('Expense save error:', error)
      setFormError(message)
    } finally {
      setSaving(false)
    }
  }

  // ------------------------------------------------
  // ARCHIVE EXPENSE
  // ------------------------------------------------

  const archiveExpense = (expense: Expense) => {
    Alert.alert(
      'Archive Expense',
      `Move this ${peso(expense.amount)} expense to your archive?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('expenses')
                .update({ is_archived: true })
                .eq('id', expense.id)
                .eq('user_id', profile!.id)
                .eq('is_archived', false)

              if (error) throw error

              await loadExpenses()
            } catch (error) {
              Alert.alert(
                'Archive Failed',
                error instanceof Error
                  ? error.message
                  : 'Unable to archive this expense.',
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
        <Text style={styles.loadingText}>Loading your expenses...</Text>
      </SafeAreaView>
    )
  }

  // ------------------------------------------------
  // MAIN UI
  // ------------------------------------------------

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <UserPageHeader title="Expenses" subtitle="Keep track of your spending and transactions." />
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
        {/* EXPENSE ACTIONS */}

        <View style={styles.expenseActions}>
          <Pressable
            style={[styles.expenseActionCard, styles.addExpenseCard]}
            onPress={openAdd}
            accessibilityRole="button"
          >
            <Text style={styles.expenseActionIcon}>＋</Text>
            <Text style={styles.expenseActionTitle}>Add Expense</Text>
            <Text style={styles.expenseActionDescription}>
              Record an expense manually
            </Text>
          </Pressable>

          <Pressable
            style={[styles.expenseActionCard, styles.scanReceiptCard]}
            onPress={() => router.push('/(user)/scan-receipt')}
            accessibilityRole="button"
          >
            <Text style={styles.expenseActionIcon}>▧</Text>
            <Text style={styles.expenseActionTitle}>Scan Receipts</Text>
            <Text style={styles.expenseActionDescription}>
              Scan or upload a receipt
            </Text>
          </Pressable>
        </View>

        {/* ERROR */}

        {errorMessage ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>
              Unable to load expenses
            </Text>
            <Text style={styles.errorMessage}>{errorMessage}</Text>

            <Pressable onPress={onRefresh}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : null}

        {/* SUMMARY */}

        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>EXPENSE RECORDS</Text>
          <Text style={styles.summaryCount}>
            {filteredExpenses.length}
          </Text>
          <Text style={styles.summaryDescription}>
            Transaction(s) found
          </Text>
        </View>

        {/* SEARCH */}

        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>⌕</Text>

          <TextInput
            style={styles.searchInput}
            placeholder="Search expenses..."
            placeholderTextColor="#84908b"
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />

          {search.length > 0 ? (
            <Pressable onPress={() => setSearch('')}>
              <Text style={styles.clearSearch}>×</Text>
            </Pressable>
          ) : null}
        </View>

        {/* CATEGORY FILTER */}

        <Text style={styles.filterLabel}>Filter by category</Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterList}
        >
          <Pressable
            style={[
              styles.filterChip,
              selectedCategory === null && styles.filterChipActive,
            ]}
            onPress={() => setSelectedCategory(null)}
          >
            <Text
              style={[
                styles.filterChipText,
                selectedCategory === null && styles.filterChipTextActive,
              ]}
            >
              All
            </Text>
          </Pressable>

          {categories.map((category) => {
            const active = selectedCategory === category.id

            return (
              <Pressable
                key={category.id}
                style={[
                  styles.filterChip,
                  active && styles.filterChipActive,
                ]}
                onPress={() =>
                  setSelectedCategory(active ? null : category.id)
                }
              >
                <Text
                  style={[
                    styles.filterChipText,
                    active && styles.filterChipTextActive,
                  ]}
                >
                  {category.name}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>

        {/* EXPENSE LIST */}

        <View style={styles.listHeader}>
          <View>
            <Text style={styles.sectionTitle}>Your Transactions</Text>
            <Text style={styles.sectionSubtitle}>
              Your recorded expenses
            </Text>
          </View>
        </View>

        {visibleExpenses.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptySymbol}>₱</Text>

            <Text style={styles.emptyTitle}>
              {expenses.length === 0
                ? 'No expenses yet'
                : 'No expenses found'}
            </Text>

            <Text style={styles.emptyDescription}>
              {expenses.length === 0
                ? 'Add your first expense to start tracking your spending.'
                : 'Try changing your search or category filter.'}
            </Text>

            {expenses.length > 0 ? (
              <Pressable
                onPress={() => {
                  setSearch('')
                  setSelectedCategory(null)
                }}
                style={styles.clearFiltersButton}
              >
                <Text style={styles.clearFiltersText}>Clear filters</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={styles.listCard}>
            {visibleExpenses.map((expense) => {
              const category = categoryMap.get(expense.category_id)
              const expanded = expandedExpenseId === expense.id
              const note = expense.note?.trim() ?? ''
              const isReceiptDetails = note.length > 200 || note.includes('\n')

              return (
                <View key={expense.id} style={styles.expenseRow}>
                  <Pressable
                    style={styles.expenseRecordHeader}
                    onPress={() => setExpandedExpenseId(expanded ? null : expense.id)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                  >
                    <View
                      style={[
                        styles.categoryIcon,
                        { backgroundColor: category?.bg || '#e6f4f1' },
                      ]}
                    >
                      <CategoryIcon icon={category?.icon ?? 'coins'} color={category?.color || COLORS.brand} size={28} />
                    </View>

                    <View style={styles.expenseContent}>
                      <Text style={styles.expenseName}>
                        {category?.name ?? 'Expense'}
                      </Text>
                      <Text style={styles.expenseMeta}>
                        {shortDate(expense.spent_on)} · {expense.payment_method}
                      </Text>
                    </View>

                    <View style={styles.expenseSummaryRight}>
                      <Text style={styles.expenseAmount}>
                        -{peso(expense.amount)}
                      </Text>
                      <Text style={styles.expandHint}>
                        {expanded ? 'Hide details －' : 'View details ＋'}
                      </Text>
                    </View>
                  </Pressable>

                  {expanded ? (
                    <View style={styles.expandedExpenseDetails}>
                      <View style={styles.detailsDivider} />
                      <View style={styles.detailLine}>
                        <Text style={styles.detailLabel}>Category</Text>
                        <Text style={styles.detailValue}>{category?.name ?? 'Expense'}</Text>
                      </View>
                      <View style={styles.detailLine}>
                        <Text style={styles.detailLabel}>Date</Text>
                        <Text style={styles.detailValue}>{shortDate(expense.spent_on)}</Text>
                      </View>
                      <View style={styles.detailLine}>
                        <Text style={styles.detailLabel}>Payment method</Text>
                        <Text style={styles.detailValue}>{expense.payment_method}</Text>
                      </View>
                      <View style={styles.detailLine}>
                        <Text style={styles.detailLabel}>Amount</Text>
                        <Text style={styles.detailAmount}>-{peso(expense.amount)}</Text>
                      </View>

                      {note ? (
                        <View style={styles.expandedNoteBlock}>
                          <Text style={styles.detailLabel}>
                            {isReceiptDetails ? 'Receipt Details' : 'Note'}
                          </Text>
                          <Text style={styles.expandedNoteText}>{note}</Text>
                        </View>
                      ) : (
                        <Text style={styles.noNoteText}>
                          No additional notes for this expense.
                        </Text>
                      )}

                      <View style={styles.actionRow}>
                        <Pressable
                          style={styles.editButton}
                          onPress={() => openEdit(expense)}
                        >
                          <Text style={styles.editButtonText}>✎ Edit</Text>
                        </Pressable>

                        <Pressable
                          style={styles.archiveButton}
                          onPress={() => archiveExpense(expense)}
                        >
                          <Text style={styles.archiveButtonText}>▣ Archive</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                </View>
              )
            })}
          </View>
        )}

        {/* PAGINATION */}

        {filteredExpenses.length > 0 ? (
          <View style={styles.pagination}>
            <Text style={styles.paginationInfo}>
              Showing {(currentPage - 1) * PAGE_SIZE + 1}–
              {Math.min(
                currentPage * PAGE_SIZE,
                filteredExpenses.length,
              )}{' '}
              of {filteredExpenses.length}
            </Text>

            <View style={styles.paginationControls}>
              <Pressable
                disabled={currentPage <= 1}
                style={[
                  styles.pageButton,
                  currentPage <= 1 && styles.pageButtonDisabled,
                ]}
                onPress={() => setPage((value) => Math.max(1, value - 1))}
              >
                <Text style={styles.pageButtonText}>‹</Text>
              </Pressable>

              <Text style={styles.pageNumber}>
                {currentPage} / {totalPages}
              </Text>

              <Pressable
                disabled={currentPage >= totalPages}
                style={[
                  styles.pageButton,
                  currentPage >= totalPages && styles.pageButtonDisabled,
                ]}
                onPress={() =>
                  setPage((value) => Math.min(totalPages, value + 1))
                }
              >
                <Text style={styles.pageButtonText}>›</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* FOOTER */}

        <View style={styles.footer}>
          <Text style={styles.footerBrand}>Track Mo, Pake Ko!</Text>
          <Text style={styles.footerText}>
            Your money. Your control.
          </Text>
        </View>
      </ScrollView>

      {/* ADD / EDIT MODAL */}

      <Modal
        visible={formVisible}
        animationType="slide"
        transparent
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
                  {editing ? 'Edit Expense' : 'Add Expense'}
                </Text>

                <Text style={styles.modalSubtitle}>
                  {editing
                    ? 'Update your expense information.'
                    : receiptContext
                      ? 'Review and edit the receipt details before saving.'
                      : 'Enter the details of your expense.'}
                </Text>
              </View>

              <Pressable
                onPress={closeForm}
                disabled={saving}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>×</Text>
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.formContent}
            >
              {receiptContext ? (
                <>
                  {/* RECEIPT MERCHANT */}
                  <Text style={styles.fieldLabel}>Merchant</Text>
                  <TextInput
                    style={styles.input}
                    value={receiptContext.draft.merchant_name}
                    onChangeText={(value) => setReceiptContext((current) => current ? ({
                      ...current,
                      draft: { ...current.draft, merchant_name: value },
                    }) : current)}
                    placeholder="Enter merchant name"
                    placeholderTextColor="#84908b"
                    editable={!saving}
                  />

                  {/* CATEGORY */}
                  <Text style={styles.fieldLabel}>Category</Text>
                  {availableCategories.length === 0 ? (
                    <Text style={styles.fieldHint}>No active categories are available right now.</Text>
                  ) : (
                    <View style={styles.categoryChoices}>
                      {availableCategories.map((category) => {
                        const active = form.category_id === category.id
                        return (
                          <Pressable
                            key={category.id}
                            style={[styles.categoryChoice, active && styles.categoryChoiceActive]}
                            onPress={() => updateForm({ category_id: category.id })}
                            disabled={saving}
                          >
                            <View style={[styles.choiceIcon, { backgroundColor: category.bg || '#e6f4f1' }]}>
                              <CategoryIcon icon={category.icon} color={category.color || COLORS.brand} size={26} />
                            </View>
                            <Text style={[styles.categoryChoiceText, active && styles.categoryChoiceTextActive]}>{category.name}</Text>
                            {active ? <Text style={styles.selectedCheck}>✓</Text> : null}
                          </Pressable>
                        )
                      })}
                    </View>
                  )}
                  <Text style={styles.fieldHint}>
                    Only categories you selected on your dashboard are available here. The closest matching selected category is preselected when detected.
                  </Text>

                  {/* DATE */}
                  <Text style={styles.fieldLabel}>Date</Text>
                  <TextInput
                    style={styles.input}
                    value={form.spent_on}
                    onChangeText={(value) => updateForm({ spent_on: value })}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#84908b"
                    keyboardType="numbers-and-punctuation"
                    editable={!saving}
                    maxLength={10}
                  />
                  <Text style={styles.fieldHint}>Use YYYY-MM-DD format. Future dates are not allowed.</Text>

                  {/* AMOUNT */}
                  <Text style={styles.fieldLabel}>Receipt Total Amount (₱)</Text>
                  <TextInput
                    style={styles.input}
                    value={form.amount}
                    onChangeText={(value) => updateForm({ amount: cleanAmount(value) })}
                    placeholder="0.00"
                    placeholderTextColor="#84908b"
                    keyboardType="decimal-pad"
                    editable={!saving}
                  />

                  {/* PAYMENT METHOD */}
                  <Text style={styles.fieldLabel}>Payment Method</Text>
                  <View style={styles.methodChoices}>
                    {METHODS.map((method) => {
                      const active = form.payment_method === method
                      return (
                        <Pressable
                          key={method}
                          style={[styles.methodChip, active && styles.methodChipActive]}
                          onPress={() => updateForm({ payment_method: method })}
                          disabled={saving}
                        >
                          <Text style={[styles.methodText, active && styles.methodTextActive]}>{method}</Text>
                        </Pressable>
                      )
                    })}
                  </View>

                  {/* RECEIPT DETAILS */}
                  <Text style={styles.fieldLabel}>Receipt Details</Text>
                  <TextInput
                    style={[styles.input, styles.noteInput, styles.receiptDetailsInput]}
                    value={form.note}
                    onChangeText={(value) => updateForm({ note: value.slice(0, 10000) })}
                    placeholder="The recognized receipt details will appear here..."
                    placeholderTextColor="#84908b"
                    multiline
                    textAlignVertical="top"
                    editable={!saving}
                    maxLength={10000}
                  />
                  <Text style={styles.characterCount}>{form.note.length}/10000 characters</Text>
                </>
              ) : (
                <>
                  {/* AMOUNT */}
                  <Text style={styles.fieldLabel}>Amount (₱)</Text>
                  <TextInput
                    style={styles.input}
                    value={form.amount}
                    onChangeText={(value) => updateForm({ amount: cleanAmount(value) })}
                    placeholder="0.00"
                    placeholderTextColor="#84908b"
                    keyboardType="decimal-pad"
                    editable={!saving}
                  />
                  <Text style={styles.fieldHint}>Enter a positive amount. Up to 2 decimal places.</Text>

                  {/* DATE */}
                  <Text style={styles.fieldLabel}>Date</Text>
                  <TextInput
                    style={styles.input}
                    value={form.spent_on}
                    onChangeText={(value) => updateForm({ spent_on: value })}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#84908b"
                    keyboardType="numbers-and-punctuation"
                    editable={!saving}
                    maxLength={10}
                  />
                  <Text style={styles.fieldHint}>Use YYYY-MM-DD format. Future dates are not allowed.</Text>

                  {/* CATEGORY */}
                  <Text style={styles.fieldLabel}>Category</Text>
                  {categories.length === 0 ? (
                    <Text style={styles.fieldHint}>You have no tracked categories. Select categories in your account settings first.</Text>
                  ) : (
                    <View style={styles.categoryChoices}>
                      {categories.map((category) => {
                        const active = form.category_id === category.id
                        return (
                          <Pressable
                            key={category.id}
                            style={[styles.categoryChoice, active && styles.categoryChoiceActive]}
                            onPress={() => updateForm({ category_id: category.id })}
                            disabled={saving}
                          >
                            <View style={[styles.choiceIcon, { backgroundColor: category.bg || '#e6f4f1' }]}>
                              <CategoryIcon icon={category.icon} color={category.color || COLORS.brand} size={26} />
                            </View>
                            <Text style={[styles.categoryChoiceText, active && styles.categoryChoiceTextActive]}>{category.name}</Text>
                            {active ? <Text style={styles.selectedCheck}>✓</Text> : null}
                          </Pressable>
                        )
                      })}
                    </View>
                  )}

                  {/* PAYMENT METHOD */}
                  <Text style={styles.fieldLabel}>Payment Method</Text>
                  <View style={styles.methodChoices}>
                    {METHODS.map((method) => {
                      const active = form.payment_method === method
                      return (
                        <Pressable
                          key={method}
                          style={[styles.methodChip, active && styles.methodChipActive]}
                          onPress={() => updateForm({ payment_method: method })}
                          disabled={saving}
                        >
                          <Text style={[styles.methodText, active && styles.methodTextActive]}>{method}</Text>
                        </Pressable>
                      )
                    })}
                  </View>

                  {/* NOTE */}
                  <Text style={styles.fieldLabel}>Note (Optional)</Text>
                  <TextInput
                    style={[styles.input, styles.noteInput]}
                    value={form.note}
                    onChangeText={(value) => updateForm({ note: value.slice(0, 200) })}
                    placeholder="Add a short description..."
                    placeholderTextColor="#84908b"
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    editable={!saving}
                    maxLength={200}
                  />
                  <Text style={styles.characterCount}>{form.note.length}/200 characters</Text>
                </>
              )}

              {/* BUDGET CHECK */}

              <View style={styles.budgetCheckCard}>
                <Text style={styles.budgetCheckTitle}>
                  ◉ Budget Check
                </Text>

                {projectedBudget === null ? (
                  <Text style={styles.budgetCheckDescription}>
                    {form.category_id
                      ? 'No monthly budget is set for this category.'
                      : 'Choose a category to check its monthly budget.'}
                  </Text>
                ) : (
                  <Text style={styles.budgetCheckDescription}>
                    Saving this expense will bring{' '}
                    {categoryMap.get(form.category_id ?? 0)?.name}{' '}
                    to {projectedBudget}% of its monthly budget.
                  </Text>
                )}
              </View>

              {/* BUDGET WARNING */}

              {budgetWarning ? (
                <View style={styles.warningCard}>
                  <Text style={styles.warningTitle}>
                    ⚠ Budget Warning
                  </Text>

                  <Text style={styles.warningDescription}>
                    This expense will bring{' '}
                    {categoryMap.get(form.category_id ?? 0)?.name}{' '}
                    to {projectedBudget}% of its monthly budget. Do you
                    still want to record it?
                  </Text>

                  <View style={styles.warningActions}>
                    <Pressable
                      style={styles.cancelButton}
                      onPress={() => setBudgetWarning(false)}
                      disabled={saving}
                    >
                      <Text style={styles.cancelButtonText}>
                        Go Back
                      </Text>
                    </Pressable>

                    <Pressable
                      style={styles.recordAnywayButton}
                      onPress={() => void saveExpense(true)}
                      disabled={saving}
                    >
                      <Text style={styles.recordAnywayText}>
                        {saving ? 'Saving...' : 'Save Anyway'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              {/* FORM ERROR */}

              {formError ? (
                <View style={styles.formErrorCard}>
                  <Text style={styles.formErrorText}>
                    {formError}
                  </Text>
                </View>
              ) : null}

              {/* ACTION BUTTONS */}

              {!budgetWarning ? (
                <View style={styles.formActions}>
                  <Pressable
                    style={styles.cancelButton}
                    onPress={closeForm}
                    disabled={saving}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.saveButton,
                      saving && styles.disabledButton,
                    ]}
                    onPress={() => void saveExpense()}
                    disabled={saving}
                  >
                    <Text style={styles.saveButtonText}>
                      {saving
                        ? 'Saving...'
                        : editing
                          ? 'Save Changes'
                          : 'Add Expense'}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  )
}

// --------------------------------------------------
// STYLES
// --------------------------------------------------

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
      backgroundColor: dark ? '#1b2a26' : '#ffffff',
      borderBottomWidth: 1,
      borderBottomColor: dark ? '#30413a' : '#e4e8e5',
    },
  headerText: { position: 'absolute', left: 72, right: 72, alignItems: 'center' },
  headerSpacer: { width: 44, height: 44 },
  brandMarkText: {
    color: (dark ? '#1b2a26' : '#ffffff'),
    fontSize: 25,
    fontWeight: '800',
  },
  expenseActions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 17,
  },
  expenseActionCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 132,
    borderRadius: 15,
    padding: 13,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  addExpenseCard: {
    backgroundColor: COLORS.brand,
    borderColor: COLORS.brand,
  },
  scanReceiptCard: {
    backgroundColor: COLORS.brand,
    borderColor: COLORS.brand,
  },
  expenseActionIcon: {
    color: (dark ? '#1b2a26' : '#ffffff'),
    fontSize: 25,
    fontWeight: '800',
    marginBottom: 7,
  },
  expenseActionTitle: {
    color: (dark ? '#1b2a26' : '#ffffff'),
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  expenseActionDescription: {
    color: '#e6fffb',
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
    marginTop: 5,
  },
  addButton: {
    backgroundColor: COLORS.brand,
    borderRadius: 13,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 17,
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
  summaryCard: {
    backgroundColor: (dark ? '#1b2a26' : '#ffffff'),
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 17,
    marginBottom: 16,
  },
  summaryLabel: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  summaryCount: {
    color: COLORS.ink,
    fontSize: 29,
    fontWeight: '800',
    marginTop: 6,
  },
  summaryDescription: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 2,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: (dark ? '#1b2a26' : '#ffffff'),
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 13,
    paddingHorizontal: 13,
    marginBottom: 18,
  },
  searchIcon: {
    color: COLORS.muted,
    fontSize: 25,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    minHeight: 48,
    color: COLORS.ink,
    fontSize: 13,
  },
  clearSearch: {
    fontSize: 23,
    color: COLORS.muted,
    paddingHorizontal: 5,
  },
  filterLabel: {
    color: COLORS.ink,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
  },
  filterList: {
    gap: 8,
    paddingBottom: 20,
  },
  filterChip: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: (dark ? '#1b2a26' : '#ffffff'),
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  filterChipActive: {
    backgroundColor: COLORS.brand,
    borderColor: COLORS.brand,
  },
  filterChipText: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: (dark ? '#1b2a26' : '#ffffff'),
    fontWeight: '800',
  },
  listHeader: {
    marginBottom: 13,
  },
  sectionTitle: {
    color: COLORS.ink,
    fontSize: 19,
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 4,
  },
  listCard: {
    backgroundColor: (dark ? '#1b2a26' : '#ffffff'),
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 18,
    paddingHorizontal: 14,
  },
  expenseRow: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },
  expenseRecordHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 14,
  },
  expenseSummaryRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 5,
  },
  expandHint: {
    color: COLORS.brand,
    fontSize: 9,
    fontWeight: '800',
  },
  expandedExpenseDetails: {
    paddingLeft: 54,
    paddingRight: 2,
    paddingBottom: 14,
  },
  detailsDivider: {
    height: 1,
    backgroundColor: COLORS.line,
    marginBottom: 10,
  },
  detailLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
  },
  detailLabel: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  detailValue: {
    color: COLORS.ink,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'right',
    flexShrink: 1,
  },
  detailAmount: {
    color: COLORS.ink,
    fontSize: 13,
    fontWeight: '900',
  },
  expandedNoteBlock: {
    backgroundColor: dark ? '#202f2a' : '#f7faf8',
    borderRadius: 10,
    padding: 11,
    marginTop: 9,
  },
  expandedNoteText: {
    color: COLORS.ink,
    fontSize: 11,
    lineHeight: 18,
    marginTop: 6,
  },
  noNoteText: {
    color: COLORS.muted,
    fontSize: 10,
    fontStyle: 'italic',
    marginTop: 9,
  },
  categoryIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categorySymbol: {
    fontSize: 21,
    fontWeight: '800',
  },
  expenseContent: {
    flex: 1,
  },
  expenseName: {
    color: COLORS.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  expenseNoteContainer: {
    marginTop: 5,
  },
  expenseNoteLabel: {
    color: COLORS.brand,
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 3,
  },
  expenseNote: {
    color: COLORS.muted,
    fontSize: 11,
    lineHeight: 16,
  },
  expenseMeta: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 4,
  },
  expenseAmount: {
    color: COLORS.ink,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 8,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 9,
    marginTop: 10,
  },
  editButton: {
    backgroundColor: (dark ? '#2b3155' : '#eef0ff'),
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
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
    paddingVertical: 7,
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
  clearFiltersButton: {
    marginTop: 14,
    backgroundColor: (dark ? '#203d36' : '#e6f4f1'),
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 9,
  },
  clearFiltersText: {
    color: COLORS.brand,
    fontSize: 12,
    fontWeight: '800',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  paginationInfo: {
    color: COLORS.muted,
    fontSize: 10,
  },
  paginationControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pageButton: {
    width: 34,
    height: 34,
    backgroundColor: (dark ? '#1b2a26' : '#ffffff'),
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageButtonDisabled: {
    opacity: 0.35,
  },
  pageButtonText: {
    color: COLORS.ink,
    fontSize: 22,
  },
  pageNumber: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  footer: {
    alignItems: 'center',
    marginTop: 32,
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
  receiptItemsEditor: {
    marginTop: 12,
  },
  receiptItemsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addReceiptItemText: {
    color: COLORS.brand,
    fontSize: 12,
    fontWeight: '800',
  },
  receiptEditableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 8,
  },
  receiptEditableName: {
    flex: 1,
    minWidth: 0,
    minHeight: 43,
    fontSize: 11,
    paddingHorizontal: 9,
  },
  receiptEditableAmount: {
    width: 100,
    minHeight: 43,
    fontSize: 11,
    paddingHorizontal: 8,
    textAlign: 'right',
  },
  receiptRemoveColumn: {
    width: 28,
  },
  removeReceiptItem: {
    width: 28,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: (dark ? '#402725' : '#fff0ef'),
  },
  removeReceiptItemText: {
    color: COLORS.danger,
    fontSize: 21,
    fontWeight: '700',
  },
  receiptReview: {
    backgroundColor: (dark ? '#1b2a26' : '#ffffff'),
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 14,
    padding: 14,
    marginBottom: 5,
  },
  receiptSectionTitle: {
    color: COLORS.ink,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 12,
  },
  receiptTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 9,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },
  receiptTableHeading: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '800',
  },
  receiptItemColumn: {
    flex: 1,
  },
  receiptAmountColumn: {
    width: 105,
    textAlign: 'right',
  },
  receiptTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#eef1ef',
  },
  receiptItemName: {
    color: COLORS.ink,
    fontSize: 12,
    fontWeight: '600',
  },
  receiptItemQuantity: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 3,
  },
  receiptItemAmount: {
    color: COLORS.ink,
    fontSize: 12,
    fontWeight: '700',
  },
  receiptEmptyItems: {
    color: COLORS.muted,
    fontSize: 11,
    lineHeight: 17,
    paddingVertical: 13,
  },
  receiptTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 13,
    paddingBottom: 15,
  },
  receiptTotalLabel: {
    color: COLORS.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  receiptTotalValue: {
    color: COLORS.brand,
    fontSize: 16,
    fontWeight: '900',
  },
  receiptInfoHeading: {
    marginTop: 2,
  },
  receiptInfoCard: {
    backgroundColor: (dark ? '#202f2a' : '#f7faf8'),
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  receiptInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },
  receiptInfoLastRow: {
    borderBottomWidth: 0,
  },
  receiptInfoLabel: {
    color: COLORS.muted,
    fontSize: 11,
    flex: 1,
  },
  receiptInfoValue: {
    color: COLORS.ink,
    fontSize: 11,
    fontWeight: '800',
    flex: 1.5,
    textAlign: 'right',
  },
  receiptEditHint: {
    color: COLORS.muted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 10,
  },
  fieldLabel: {
    color: COLORS.ink,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 14,
    marginBottom: 8,
  },
  input: {
    backgroundColor: (dark ? '#1b2a26' : '#ffffff'),
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 11,
    minHeight: 47,
    paddingHorizontal: 13,
    color: COLORS.ink,
    fontSize: 13,
  },
  fieldHint: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 6,
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
  methodChoices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  methodChip: {
    backgroundColor: (dark ? '#1b2a26' : '#ffffff'),
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  methodChipActive: {
    backgroundColor: COLORS.brand,
    borderColor: COLORS.brand,
  },
  methodText: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  methodTextActive: {
    color: (dark ? '#1b2a26' : '#ffffff'),
    fontWeight: '800',
  },
  noteInput: {
    minHeight: 85,
    paddingTop: 12,
  },
  receiptDetailsInput: {
    minHeight: 180,
    lineHeight: 19,
    paddingVertical: 12,
  },
  characterCount: {
    textAlign: 'right',
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 5,
  },
  budgetCheckCard: {
    backgroundColor: (dark ? '#1b2a26' : '#ffffff'),
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 12,
    padding: 13,
    marginTop: 18,
  },
  budgetCheckTitle: {
    color: COLORS.ink,
    fontSize: 12,
    fontWeight: '800',
  },
  budgetCheckDescription: {
    color: COLORS.muted,
    fontSize: 11,
    lineHeight: 18,
    marginTop: 6,
  },
  warningCard: {
    backgroundColor: (dark ? '#3b3020' : '#fff7e8'),
    borderWidth: 1,
    borderColor: (dark ? '#68512b' : '#f2d39c'),
    borderRadius: 12,
    padding: 14,
    marginTop: 14,
  },
  warningTitle: {
    color: (dark ? '#f6c17b' : '#92400e'),
    fontSize: 13,
    fontWeight: '800',
  },
  warningDescription: {
    color: (dark ? '#f6c17b' : '#92400e'),
    fontSize: 11,
    lineHeight: 18,
    marginTop: 7,
  },
  warningActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 9,
    marginTop: 13,
  },
  formErrorCard: {
    backgroundColor: (dark ? '#402725' : '#fff0ef'),
    borderRadius: 10,
    padding: 11,
    marginTop: 13,
  },
  formErrorText: {
    color: COLORS.danger,
    fontSize: 11,
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 9,
    marginTop: 20,
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: (dark ? '#1b2a26' : '#ffffff'),
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  cancelButtonText: {
    color: COLORS.ink,
    fontSize: 12,
    fontWeight: '700',
  },
  saveButton: {
    backgroundColor: COLORS.brand,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  saveButtonText: {
    color: (dark ? '#1b2a26' : '#ffffff'),
    fontSize: 12,
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.5,
  },
  recordAnywayButton: {
    backgroundColor: '#b45309',
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  recordAnywayText: {
    color: (dark ? '#1b2a26' : '#ffffff'),
    fontSize: 12,
    fontWeight: '800',
  },
}) }