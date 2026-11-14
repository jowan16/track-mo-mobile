import { useAppTheme } from '@/context/ThemeContext'
import { router } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useAuth } from '@/context/AuthContext'
import { CategoryIcon } from '@/components/CategoryIcon'
import { supabase } from '@/services/supabase'

type Category = {
  id: number
  slug: string
  name: string
  icon: string
  color: string
  bg: string
  is_active: boolean
  show_in_picker: boolean
  sort_order: number
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

const HINTS: Record<string, string> = {
  transportation: 'Fare, fuel, commute',
  medicine: 'Meds, checkups',
  'food-water': 'Meals, groceries, water',
  'bills-utilities': 'Electric, internet, water bill',
  entertainment: 'Movies, games, outings',
  shopping: 'Clothes, gadgets, other items',
  rent: 'Housing and dorm',
  'others-savings': 'Other costs and savings',
}

export default function CategoryDashboardScreen() {
  const { resolvedTheme } = useAppTheme()
  const dark = resolvedTheme === 'dark'
  const styles = makeStyles(dark)

  const { profile } = useAuth()
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')

  const firstName = profile?.full_name?.trim().split(/\s+/)[0]
  const allSelected = categories.length > 0 && selectedIds.size === categories.length

  useEffect(() => {
    let mounted = true

    const loadCategories = async () => {
      setLoading(true)
      setLoadError('')

      const { data, error } = await supabase
        .from('categories')
        .select('id, slug, name, icon, color, bg, is_active, show_in_picker, sort_order')
        .eq('is_active', true)
        .eq('show_in_picker', true)
        .order('sort_order')

      if (!mounted) return

      if (error) {
        console.error('Unable to load category options:', error)
        setLoadError('Unable to load categories. Please try again.')
        setCategories([])
      } else {
        setCategories((data ?? []) as Category[])
      }

      setLoading(false)
    }

    void loadCategories()

    return () => {
      mounted = false
    }
  }, [])

  const selectedCount = useMemo(() => selectedIds.size, [selectedIds])

  const toggleCategory = (id: number) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelectedIds(
      allSelected ? new Set() : new Set(categories.map((category) => category.id)),
    )
  }

  const handleContinue = async () => {
    if (!profile?.id || saving) return

    if (selectedIds.size === 0) {
      Alert.alert('Select a category', 'Select at least one category to continue.')
      return
    }

    setSaving(true)

    try {
      const rows = [...selectedIds].map((category_id) => ({
        user_id: profile.id,
        category_id,
      }))

      const { error } = await supabase.from('user_categories').insert(rows)

      if (error) throw error

      router.replace('/(user)')
    } catch (error) {
      console.error('Unable to save selected categories:', error)
      Alert.alert(
        'Unable to save categories',
        error instanceof Error ? error.message : 'Please try again.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brand}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>₱</Text>
          </View>
          <Text style={styles.brandName}>Track Mo, Pake Ko!</Text>
        </View>

        <View style={styles.heading}>
          <Text style={styles.title}>What do you want to track?</Text>
          <Text style={styles.subtitle}>
            Welcome{firstName ? `, ${firstName}` : ''}. Choose the categories you spend on.
            You can change them anytime in your dashboard.
          </Text>
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color="#0F766E" />
            <Text style={styles.loadingText}>Loading categories...</Text>
          </View>
        ) : loadError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{loadError}</Text>
            <Pressable
              style={styles.retryButton}
              onPress={() => {
                setLoadError('')
                setLoading(true)
                void supabase
                  .from('categories')
                  .select('id, slug, name, icon, color, bg, is_active, show_in_picker, sort_order')
                  .eq('is_active', true)
                  .eq('show_in_picker', true)
                  .order('sort_order')
                  .then(({ data, error }) => {
                    if (error) {
                      setLoadError('Unable to load categories. Please try again.')
                    } else {
                      setCategories((data ?? []) as Category[])
                    }
                    setLoading(false)
                  })
              }}
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : categories.length === 0 ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>
              No categories are available right now. Please try again later.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.selectionSummary}>
              <Text style={styles.selectionCount}>
                {selectedCount} {selectedCount === 1 ? 'category' : 'categories'} selected
              </Text>
              <Pressable onPress={toggleAll} disabled={saving}>
                <Text style={styles.selectAllText}>
                  {allSelected ? 'Clear all' : 'Select all'}
                </Text>
              </Pressable>
            </View>

            <View style={styles.grid}>
              {categories.map((category) => {
                const selected = selectedIds.has(category.id)
                const symbol = CATEGORY_SYMBOLS[category.icon] ?? '●'

                return (
                  <Pressable
                    key={category.id}
                    onPress={() => toggleCategory(category.id)}
                    disabled={saving}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={category.name}
                    style={[
                      styles.categoryCard,
                      selected && styles.categoryCardSelected,
                    ]}
                  >
                    <View style={styles.cardTop}>
                      <View
                        style={[
                          styles.categoryIcon,
                          { backgroundColor: category.bg || '#E6F4F1' },
                        ]}
                      >
                        <CategoryIcon icon={category.icon} color={category.color || '#0F766E'} size={38} />
                      </View>
                      <View
                        style={[
                          styles.checkbox,
                          selected && styles.checkboxSelected,
                        ]}
                      >
                        {selected ? <Text style={styles.checkmark}>✓</Text> : null}
                      </View>
                    </View>

                    <Text style={styles.categoryName}>{category.name}</Text>
                    <Text style={styles.categoryHint}>
                      {HINTS[category.slug] ?? 'Track this type of spending'}
                    </Text>
                    {selected ? (
                      <Text style={styles.selectedLabel}>Selected</Text>
                    ) : null}
                  </Pressable>
                )
              })}
            </View>
          </>
        )}

        <View style={styles.footer}>
          <Pressable
            style={[
              styles.continueButton,
              (saving || loading || categories.length === 0 || !!loadError) &&
                styles.continueButtonDisabled,
            ]}
            onPress={handleContinue}
            disabled={saving || loading || categories.length === 0 || !!loadError}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.continueButtonText}>Continue to dashboard</Text>
            )}
          </Pressable>
          <Text style={styles.footerNote}>
            You can add or edit your tracked categories later.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function makeStyles(dark: boolean) { return StyleSheet.create({
  screen: { flex: 1, backgroundColor: (dark ? '#101a18' : '#F6F7F5') },
  content: { padding: 20, paddingBottom: 36, flexGrow: 1 },
  brand: { alignItems: 'center', marginBottom: 28 },
  brandMark: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: (dark ? '#55c6b0' : '#0F766E'),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 9,
  },
  brandMarkText: { color: (dark ? '#1b2a26' : '#FFFFFF'), fontSize: 25, fontWeight: '900' },
  brandName: { color: (dark ? '#edf5f1' : '#14201C'), fontSize: 18, fontWeight: '800' },
  heading: { marginBottom: 22 },
  title: { color: (dark ? '#edf5f1' : '#14201C'), fontSize: 24, lineHeight: 31, fontWeight: '800' },
  subtitle: { color: (dark ? '#a9b8b1' : '#64716B'), fontSize: 13, lineHeight: 20, marginTop: 8 },
  loading: { minHeight: 190, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: (dark ? '#a9b8b1' : '#64716B'), fontSize: 13 },
  errorCard: {
    padding: 18,
    borderRadius: 14,
    backgroundColor: (dark ? '#1b2a26' : '#FFFFFF'),
    borderWidth: 1,
    borderColor: (dark ? '#30413a' : '#E4E8E5'),
    gap: 12,
  },
  errorText: { color: (dark ? '#ff8178' : '#B42318'), fontSize: 13, lineHeight: 20 },
  retryButton: { alignSelf: 'flex-start', paddingVertical: 8 },
  retryText: { color: (dark ? '#55c6b0' : '#0F766E'), fontSize: 13, fontWeight: '800' },
  selectionSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  selectionCount: { color: (dark ? '#a9b8b1' : '#64716B'), fontSize: 12, fontWeight: '600' },
  selectAllText: { color: (dark ? '#55c6b0' : '#0F766E'), fontSize: 12, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  categoryCard: {
    width: '48%',
    minHeight: 145,
    padding: 13,
    borderRadius: 13,
    backgroundColor: (dark ? '#1b2a26' : '#FFFFFF'),
    borderWidth: 1,
    borderColor: (dark ? '#46564f' : '#CBD3CF'),
  },
  categoryCardSelected: {
    borderWidth: 2,
    borderColor: (dark ? '#55c6b0' : '#0F766E'),
    backgroundColor: (dark ? '#203d36' : '#E6F4F1'),
    padding: 12,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 11,
  },
  categoryIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categorySymbol: { fontSize: 23, fontWeight: '800' },
  checkbox: {
    width: 21,
    height: 21,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: (dark ? '#46564f' : '#AAB6B0'),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: (dark ? '#1b2a26' : '#FFFFFF'),
  },
  checkboxSelected: { backgroundColor: (dark ? '#55c6b0' : '#0F766E'), borderColor: (dark ? '#55c6b0' : '#0F766E') },
  checkmark: { color: (dark ? '#1b2a26' : '#FFFFFF'), fontSize: 14, fontWeight: '900', lineHeight: 17 },
  categoryName: { color: (dark ? '#edf5f1' : '#14201C'), fontSize: 13, fontWeight: '800' },
  categoryHint: { color: (dark ? '#a9b8b1' : '#64716B'), fontSize: 10, lineHeight: 15, marginTop: 4 },
  selectedLabel: { color: (dark ? '#55c6b0' : '#0F766E'), fontSize: 10, fontWeight: '800', marginTop: 7 },
  footer: { marginTop: 24 },
  continueButton: {
    minHeight: 50,
    borderRadius: 11,
    backgroundColor: (dark ? '#55c6b0' : '#0F8A72'),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  continueButtonDisabled: { opacity: 0.55 },
  continueButtonText: { color: (dark ? '#1b2a26' : '#FFFFFF'), fontSize: 14, fontWeight: '800' },
  footerNote: { color: (dark ? '#9aaba3' : '#718078'), fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 11 },
}) }
