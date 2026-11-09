import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'

import { AdminShell, adminColors } from '@/components/admin/AdminShell'
import { useAuth } from '@/context/AuthContext'
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
type Draft = { id: number | null; name: string; color: string; icon: string; show: boolean }

const ICON_OPTIONS = ['bus', 'plus-square', 'utensils', 'zap', 'play', 'shopping-bag', 'home', 'coins', 'piggy-bank']
const ICON_GLYPHS: Record<string, string> = {
  coins: '◉', bus: '↔', 'plus-square': '+', utensils: '♨', zap: 'ϟ',
  play: '▶', 'shopping-bag': '▣', home: '⌂', 'piggy-bank': '●', wallet: '▤',
}
const emptyDraft: Draft = { id: null, name: '', color: '#0F766E', icon: 'coins', show: true }

export default function AdminCategoriesScreen() {
  const { profile } = useAuth()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [nameError, setNameError] = useState('')
  const [colorError, setColorError] = useState('')
  const [showError, setShowError] = useState('')
  const [saving, setSaving] = useState(false)
  const [toggleTarget, setToggleTarget] = useState<Category | null>(null)
  const [trackedCount, setTrackedCount] = useState(0)

  const loadCategories = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: queryError } = await supabase
      .from('categories')
      .select('id, slug, name, icon, color, bg, is_active, show_in_picker, sort_order')
      .order('sort_order')
    if (queryError) {
      setError(queryError.message)
      setCategories([])
    } else {
      setCategories((data ?? []) as Category[])
    }
    setLoading(false)
  }, [])

  useEffect(() => { void loadCategories() }, [loadCategories])

  const writeAudit = async (action: string) => {
    if (!profile) return
    const { error: auditError } = await supabase.from('audit_log').insert({
      actor_id: profile.id,
      actor_name: profile.full_name || profile.email,
      action,
    })
    if (auditError) console.warn('Unable to write audit entry:', auditError.message)
  }

  const openNew = () => {
    setNameError('')
    setColorError('')
    setShowError('')
    setDraft({ ...emptyDraft })
  }

  const openEdit = (category: Category) => {
    setNameError('')
    setColorError('')
    setShowError('')
    setDraft({
      id: category.id,
      name: category.name,
      color: category.color,
      icon: category.icon,
      show: category.show_in_picker,
    })
  }

  const saveDraft = async () => {
    if (!draft || saving) return
    let valid = true
    setNameError('')
    setColorError('')
    setShowError('')

    if (!draft.name.trim()) {
      setNameError('Enter a category name.')
      valid = false
    } else if (draft.name.trim().length > 30) {
      setNameError('Name is too long (30 characters max).')
      valid = false
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(draft.color)) {
      setColorError('Enter a valid hex color, for example #0F766E.')
      valid = false
    }
    if (!draft.show && categories.filter((c) => c.id !== draft.id && c.is_active && c.show_in_picker).length === 0) {
      setShowError('At least one category must stay visible in the picker.')
      valid = false
    }
    if (!valid) return

    setSaving(true)
    const name = draft.name.trim()
    const color = draft.color.toUpperCase()
    const row = {
      name,
      color,
      bg: `${color}22`,
      icon: draft.icon,
      show_in_picker: draft.show,
    }

    try {
      if (draft.id === null) {
        const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        const slug = `${slugBase}-${Date.now().toString(36)}`
        const sort_order = Math.max(0, ...categories.map((c) => c.sort_order)) + 1
        const { error: insertError } = await supabase.from('categories').insert({ ...row, slug, sort_order })
        if (insertError) throw insertError
        await writeAudit(`Added category "${name}"`)
      } else {
        const { error: updateError } = await supabase.from('categories').update(row).eq('id', draft.id)
        if (updateError) throw updateError
        await writeAudit(`Updated category "${name}"`)
      }
      setDraft(null)
      await loadCategories()
      Alert.alert('Saved', 'Category changes have been saved.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to save category.'
      if (message.toLowerCase().includes('duplicate') || message.includes('23505')) {
        setNameError('This category already exists.')
      } else {
        Alert.alert('Save failed', message)
      }
    } finally {
      setSaving(false)
    }
  }

  const askToggle = async (category: Category) => {
    if (!category.is_active) {
      await toggleCategory(category)
      return
    }
    const { count, error: countError } = await supabase
      .from('user_categories')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', category.id)
    if (countError) {
      Alert.alert('Unable to check category usage', countError.message)
      return
    }
    setTrackedCount(count ?? 0)
    setToggleTarget(category)
  }

  const toggleCategory = async (category: Category) => {
    setSaving(true)
    const { error: updateError } = await supabase
      .from('categories')
      .update({ is_active: !category.is_active })
      .eq('id', category.id)
    if (updateError) {
      Alert.alert('Update failed', updateError.message)
    } else {
      await writeAudit(`${category.is_active ? 'Disabled' : 'Enabled'} category "${category.name}"`)
      setToggleTarget(null)
      await loadCategories()
    }
    setSaving(false)
  }

  return (
    <AdminShell title="Default categories" subtitle="Manage the category options users can select after their first login.">
      <Pressable style={styles.newButton} onPress={openNew}>
        <Text style={styles.newButtonText}>+ New category</Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? (
        <ActivityIndicator color={adminColors.primary} style={{ margin: 28 }} />
      ) : categories.length === 0 ? (
        <Text style={styles.empty}>No categories found.</Text>
      ) : categories.map((category) => (
        <View key={category.id} style={[styles.categoryCard, !category.is_active && styles.disabledCard]}>
          <View style={[styles.iconBox, { backgroundColor: category.bg || '#EEF0FB' }]}>
            <Text style={[styles.iconGlyph, { color: category.color || adminColors.primary }]}>
              {ICON_GLYPHS[category.icon] || '◉'}
            </Text>
          </View>
          <View style={styles.categoryInfo}>
            <Text style={styles.categoryName}>{category.name}</Text>
            <Text style={styles.categoryMeta}>
              {!category.is_active ? 'Disabled' : category.show_in_picker ? 'Shown in picker' : 'Hidden from picker'}
            </Text>
          </View>
          <Pressable style={styles.editButton} onPress={() => openEdit(category)}>
            <Text style={styles.editText}>Edit</Text>
          </Pressable>
          <Pressable
            style={[styles.toggleButton, category.is_active ? styles.disableButton : styles.enableButton]}
            onPress={() => void askToggle(category)}
            disabled={saving}
          >
            <Text style={[styles.toggleText, { color: category.is_active ? adminColors.danger : adminColors.success }]}>
              {category.is_active ? 'Disable' : 'Enable'}
            </Text>
          </Pressable>
        </View>
      ))}

      <Modal transparent visible={!!draft} animationType="slide" onRequestClose={() => !saving && setDraft(null)}>
        <View style={styles.modalBackdrop}>
          <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{draft?.id === null ? 'New category' : 'Edit category'}</Text>
              <Text style={styles.fieldLabel}>Name</Text>
              <TextInput
                value={draft?.name ?? ''}
                onChangeText={(value) => setDraft((current) => current ? { ...current, name: value } : current)}
                placeholder="Category name"
                style={styles.input}
                maxLength={60}
              />
              {nameError ? <Text style={styles.fieldError}>{nameError}</Text> : null}

              <Text style={styles.fieldLabel}>Color (hex)</Text>
              <TextInput
                value={draft?.color ?? ''}
                onChangeText={(value) => setDraft((current) => current ? { ...current, color: value } : current)}
                placeholder="#0F766E"
                autoCapitalize="characters"
                style={styles.input}
              />
              {colorError ? <Text style={styles.fieldError}>{colorError}</Text> : null}

              <Text style={styles.fieldLabel}>Icon</Text>
              <View style={styles.iconChoices}>
                {ICON_OPTIONS.map((icon) => (
                  <Pressable
                    key={icon}
                    onPress={() => setDraft((current) => current ? { ...current, icon } : current)}
                    style={[styles.iconChoice, draft?.icon === icon && styles.iconChoiceActive]}
                  >
                    <Text style={[styles.iconChoiceText, { color: draft?.color || adminColors.primary }]}>
                      {ICON_GLYPHS[icon]}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Show in first-login picker</Text>
                  <Text style={styles.switchHint}>Users can select this category during onboarding.</Text>
                </View>
                <Switch
                  value={draft?.show ?? false}
                  onValueChange={(value) => setDraft((current) => current ? { ...current, show: value } : current)}
                  trackColor={{ true: adminColors.primary }}
                />
              </View>
              {showError ? <Text style={styles.fieldError}>{showError}</Text> : null}

              <View style={styles.modalActions}>
                <Pressable style={styles.cancelButton} onPress={() => setDraft(null)} disabled={saving}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.newButton} onPress={saveDraft} disabled={saving}>
                  <Text style={styles.newButtonText}>{saving ? 'Saving…' : 'Save changes'}</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal transparent visible={!!toggleTarget} animationType="fade" onRequestClose={() => !saving && setToggleTarget(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.confirmCard}>
            <Text style={styles.modalTitle}>Disable {toggleTarget?.name}?</Text>
            <Text style={styles.modalMessage}>
              {trackedCount.toLocaleString()} users track this category. Disabling hides it from new users only. Existing records stay.
            </Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelButton} onPress={() => setToggleTarget(null)} disabled={saving}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.newButton, { backgroundColor: adminColors.danger }]} onPress={() => toggleTarget && void toggleCategory(toggleTarget)} disabled={saving}>
                <Text style={styles.newButtonText}>{saving ? 'Please wait…' : 'Disable'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </AdminShell>
  )
}

const styles = StyleSheet.create({
  newButton: { alignSelf: 'flex-end', backgroundColor: adminColors.primary, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 11 },
  newButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  error: { color: adminColors.danger, backgroundColor: '#FEECEC', padding: 11, borderRadius: 9, fontSize: 11 },
  empty: { color: adminColors.muted, textAlign: 'center', padding: 25, backgroundColor: '#FFFFFF', borderRadius: 12 },
  categoryCard: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: adminColors.border, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 8 },
  disabledCard: { opacity: 0.6 },
  iconBox: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  iconGlyph: { fontSize: 21, fontWeight: '900' },
  categoryInfo: { flex: 1 },
  categoryName: { color: adminColors.text, fontSize: 12, fontWeight: '900' },
  categoryMeta: { color: adminColors.muted, fontSize: 9, marginTop: 4 },
  editButton: { paddingHorizontal: 8, paddingVertical: 8 },
  editText: { color: adminColors.primary, fontSize: 10, fontWeight: '900' },
  toggleButton: { paddingHorizontal: 9, paddingVertical: 8, borderRadius: 8 },
  disableButton: { backgroundColor: '#FEECEC' },
  enableButton: { backgroundColor: '#DCFCE7' },
  toggleText: { fontSize: 10, fontWeight: '900' },
  modalBackdrop: { flex: 1, backgroundColor: '#0F172A88', justifyContent: 'center', padding: 17 },
  modalScroll: { flexGrow: 1, justifyContent: 'center' },
  modalCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, gap: 9 },
  confirmCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 19, gap: 12 },
  modalTitle: { color: adminColors.text, fontSize: 17, fontWeight: '900', marginBottom: 4 },
  modalMessage: { color: adminColors.muted, fontSize: 12, lineHeight: 19 },
  fieldLabel: { color: adminColors.text, fontSize: 11, fontWeight: '800', marginTop: 4 },
  input: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: adminColors.border, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10, color: adminColors.text, fontSize: 12 },
  fieldError: { color: adminColors.danger, fontSize: 10 },
  iconChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconChoice: { width: 39, height: 39, borderRadius: 9, borderWidth: 1, borderColor: adminColors.border, alignItems: 'center', justifyContent: 'center' },
  iconChoiceActive: { borderWidth: 2, borderColor: adminColors.primary, backgroundColor: '#EEF0FF' },
  iconChoiceText: { fontSize: 20, fontWeight: '900' },
  switchRow: { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
  switchHint: { color: adminColors.muted, fontSize: 9, marginTop: 2 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 9, marginTop: 10 },
  cancelButton: { borderWidth: 1, borderColor: adminColors.border, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 11 },
  cancelText: { color: adminColors.text, fontSize: 11, fontWeight: '800' },
})
