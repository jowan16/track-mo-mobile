
import { useCallback, useEffect, useState } from 'react'
import {
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

import { UserMenuButton } from '@/components/user-navigation'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/services/supabase'

type Category = {
  id: number
  name: string
  icon: string
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

type Tab = 'expenses' | 'budgets'

const C = {
  canvas: '#f6f7f5',
  card: '#ffffff',
  ink: '#14201c',
  muted: '#4b5754',
  line: '#e4e8e5',
  brand: '#0f766e',
  danger: '#b42318',
}

function peso(value: number) {
  return `₱ ${value.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function dateLabel(value: string) {
  const date = new Date(`${value}T00:00:00`)
  return date.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function monthLabel(month: number, year: number) {
  return new Date(year, month - 1, 1).toLocaleDateString('en-PH', {
    month: 'long',
    year: 'numeric',
  })
}

export default function ArchiveScreen() {
  const { profile } = useAuth()

  const [tab, setTab] = useState<Tab>('expenses')
  const [categories, setCategories] = useState<Category[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const categoryMap = new Map(
    categories.map((category) => [category.id, category]),
  )

  const loadArchive = useCallback(async () => {
    if (!profile?.id) {
      setLoading(false)
      return
    }

    try {
      const [categoryResult, expenseResult, budgetResult] =
        await Promise.all([
          supabase
            .from('categories')
            .select('id, name, icon')
            .order('sort_order'),

          supabase
            .from('expenses')
            .select('*')
            .eq('user_id', profile.id)
            .eq('is_archived', true)
            .order('spent_on', { ascending: false }),

          supabase
            .from('budgets')
            .select('*')
            .eq('user_id', profile.id)
            .eq('is_archived', true)
            .order('year', { ascending: false })
            .order('month', { ascending: false }),
        ])

      if (categoryResult.error) throw categoryResult.error
      if (expenseResult.error) throw expenseResult.error
      if (budgetResult.error) throw budgetResult.error

      setCategories(categoryResult.data ?? [])
      setExpenses(expenseResult.data ?? [])
      setBudgets(budgetResult.data ?? [])
    } catch (error) {
      Alert.alert(
        'Unable to load archive',
        error instanceof Error ? error.message : 'Please try again.',
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [profile?.id])

  useEffect(() => {
    loadArchive()
  }, [loadArchive])

  const onRefresh = () => {
    setRefreshing(true)
    loadArchive()
  }

  const performAction = async (
    table: 'expenses' | 'budgets',
    id: string,
    action: 'restore' | 'delete',
  ) => {
    if (!profile?.id) return

    setBusyId(id)

    try {
      const result =
        action === 'restore'
          ? await supabase
              .from(table)
              .update({ is_archived: false })
              .eq('id', id)
              .eq('user_id', profile.id)
              .eq('is_archived', true)
          : await supabase
              .from(table)
              .delete()
              .eq('id', id)
              .eq('user_id', profile.id)
              .eq('is_archived', true)

      if (result.error) throw result.error

      Alert.alert(
        action === 'restore' ? 'Restored' : 'Deleted',
        action === 'restore'
          ? 'The item has been restored successfully.'
          : 'The item has been permanently deleted.',
      )

      await loadArchive()
    } catch (error) {
      Alert.alert(
        'Action failed',
        error instanceof Error ? error.message : 'Please try again.',
      )
    } finally {
      setBusyId(null)
    }
  }

  const confirmAction = (
    table: 'expenses' | 'budgets',
    id: string,
    action: 'restore' | 'delete',
  ) => {
    const deleting = action === 'delete'

    Alert.alert(
      deleting ? 'Permanently delete?' : 'Restore item?',
      deleting
        ? 'This item will be permanently removed. This cannot be undone.'
        : 'This item will return to your active records.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: deleting ? 'Delete permanently' : 'Restore',
          style: deleting ? 'destructive' : 'default',
          onPress: () => performAction(table, id, action),
        },
      ],
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <UserMenuButton />
        <View style={styles.headerText}>
          <Text style={styles.title}>Archive</Text>
          <Text style={styles.subtitle}>
            Manage your archived records
          </Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.tabs}>
        <Pressable
          onPress={() => setTab('expenses')}
          style={[
            styles.tab,
            tab === 'expenses' && styles.activeTab,
          ]}
        >
          <Text
            style={[
              styles.tabText,
              tab === 'expenses' && styles.activeTabText,
            ]}
          >
            Expenses ({expenses.length})
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setTab('budgets')}
          style={[
            styles.tab,
            tab === 'budgets' && styles.activeTab,
          ]}
        >
          <Text
            style={[
              styles.tabText,
              tab === 'budgets' && styles.activeTabText,
            ]}
          >
            Budgets ({budgets.length})
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.brand} />
          <Text style={styles.muted}>Loading archive...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
            />
          }
        >
          <View style={styles.summary}>
            <Text style={styles.summaryLabel}>
              {tab === 'expenses'
                ? 'Archived expenses'
                : 'Archived budgets'}
            </Text>

            <Text style={styles.summaryValue}>
              {tab === 'expenses'
                ? expenses.length
                : budgets.length}
            </Text>

            <Text style={styles.muted}>
              Pull down to refresh your archived records.
            </Text>
          </View>

          {tab === 'expenses' ? (
            expenses.length === 0 ? (
              <EmptyState message="No archived expenses. Expenses you archive will appear here." />
            ) : (
              expenses.map((item) => {
                const category = categoryMap.get(item.category_id)

                return (
                  <View key={item.id} style={styles.item}>
                    <View style={styles.itemTop}>
                      <View style={styles.itemInfo}>
                        <Text style={styles.itemTitle}>
                          {category?.icon
                            ? `${category.icon} `
                            : ''}
                          {category?.name ?? 'Unknown category'}
                        </Text>

                        <Text style={styles.muted}>
                          {dateLabel(item.spent_on)} · {item.payment_method}
                        </Text>

                        {!!item.note && (
                          <Text style={styles.note}>
                            {item.note}
                          </Text>
                        )}
                      </View>

                      <Text style={styles.amount}>
                        {peso(Number(item.amount))}
                      </Text>
                    </View>

                    <ActionButtons
                      busy={busyId === item.id}
                      onRestore={() =>
                        confirmAction(
                          'expenses',
                          item.id,
                          'restore',
                        )
                      }
                      onDelete={() =>
                        confirmAction(
                          'expenses',
                          item.id,
                          'delete',
                        )
                      }
                    />
                  </View>
                )
              })
            )
          ) : budgets.length === 0 ? (
            <EmptyState message="No archived budgets. Budgets you archive will appear here." />
          ) : (
            budgets.map((item) => {
              const category = categoryMap.get(item.category_id)

              return (
                <View key={item.id} style={styles.item}>
                  <View style={styles.itemTop}>
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemTitle}>
                        {category?.icon
                          ? `${category.icon} `
                          : ''}
                        {category?.name ?? 'Unknown category'}
                      </Text>

                      <Text style={styles.muted}>
                        {monthLabel(item.month, item.year)}
                      </Text>
                    </View>

                    <Text style={styles.amount}>
                      {peso(Number(item.amount))}
                    </Text>
                  </View>

                  <ActionButtons
                    busy={busyId === item.id}
                    onRestore={() =>
                      confirmAction(
                        'budgets',
                        item.id,
                        'restore',
                      )
                    }
                    onDelete={() =>
                      confirmAction(
                        'budgets',
                        item.id,
                        'delete',
                      )
                    }
                  />
                </View>
              )
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>▣</Text>
      <Text style={styles.emptyTitle}>Nothing here yet</Text>
      <Text style={styles.muted}>{message}</Text>
    </View>
  )
}

function ActionButtons({
  busy,
  onRestore,
  onDelete,
}: {
  busy: boolean
  onRestore: () => void
  onDelete: () => void
}) {
  return (
    <View style={styles.actions}>
      <Pressable
        disabled={busy}
        onPress={onRestore}
        style={[styles.actionButton, styles.restoreButton]}
      >
        <Text style={styles.restoreText}>
          {busy ? 'Please wait...' : 'Restore'}
        </Text>
      </Pressable>

      <Pressable
        disabled={busy}
        onPress={onDelete}
        style={[styles.actionButton, styles.deleteButton]}
      >
        <Text style={styles.deleteText}>Delete</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: C.canvas,
  },
  header: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 18,
    minHeight: 80,
  },
  headerSpacer: { width: 44, height: 44 },
  headerText: {
    position: 'absolute',
    left: 72,
    right: 72,
    alignItems: 'center',
  },
  title: {
    color: C.ink,
    fontSize: 24,
    fontWeight: '800',
   textAlign: 'center' },
  subtitle: {
    color: C.muted,
    fontSize: 13,
    marginTop: 3,
   textAlign: 'center' },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: C.brand,
    borderRadius: 9,
  },
  tabText: {
    color: C.muted,
    fontWeight: '700',
  },
  activeTabText: {
    color: '#ffffff',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  muted: {
    color: C.muted,
    fontSize: 12,
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 35,
  },
  summary: {
    backgroundColor: C.card,
    padding: 18,
    borderRadius: 14,
    gap: 5,
  },
  summaryLabel: {
    color: C.muted,
    fontSize: 13,
  },
  summaryValue: {
    color: C.ink,
    fontSize: 28,
    fontWeight: '800',
  },
  item: {
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: C.line,
  },
  itemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  itemInfo: {
    flex: 1,
    gap: 5,
  },
  itemTitle: {
    color: C.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  note: {
    color: C.muted,
    fontSize: 12,
  },
  amount: {
    color: C.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    padding: 11,
    alignItems: 'center',
    borderRadius: 9,
  },
  restoreButton: {
    backgroundColor: '#e0f2ef',
  },
  restoreText: {
    color: C.brand,
    fontWeight: '800',
  },
  deleteButton: {
    backgroundColor: '#fce8e6',
  },
  deleteText: {
    color: C.danger,
    fontWeight: '800',
  },
  empty: {
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 28,
    alignItems: 'center',
    gap: 8,
  },
  emptyIcon: {
    color: C.brand,
    fontSize: 35,
  },
  emptyTitle: {
    color: C.ink,
    fontSize: 16,
    fontWeight: '800',
  },
})
