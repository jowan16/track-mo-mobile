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
import { CategoryIcon, CATEGORY_ICON_OPTIONS } from '@/components/CategoryIcon'
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
  const [iconSearch, setIconSearch] = useState('')
  const previewColor = draft?.color && /^#[0-9a-fA-F]{6}$/.test(draft.color) ? draft.color : '#0F766E'

  const loadCategories = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: queryError } = await supabase
      .from('categories')
      .select('id, slug, name, icon, color, bg, is_active, show_in_picker, sort_order')
      .is('user_id', null)
      .order('sort_order', { ascending: false })
    if (queryError) {
      setError(queryError.message)
      setCategories([])
    } else {
      setCategories((data ?? []) as Category[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadCategories()
    const channel = supabase
      .channel('admin-default-categories')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => {
        void loadCategories()
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [loadCategories])

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
    setIconSearch('')
    setDraft({ ...emptyDraft })
  }

  const openEdit = (category: Category) => {
    setNameError('')
    setColorError('')
    setShowError('')
    setIconSearch('')
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


  const softDeleteCategory = (category: Category) => {
    if (category.is_active && categories.filter((item) => item.id !== category.id && item.is_active && item.show_in_picker).length === 0) {
      Alert.alert('Keep one category available', 'At least one active category must remain available to users.')
      return
    }
    Alert.alert('Delete category?', '“' + category.name + '” will be hidden from category selection. Existing expenses and budgets will be preserved.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => { void (async () => {
        setSaving(true)
        const { error: deleteError } = await supabase.from('categories').update({ is_active: false }).eq('id', category.id).is('user_id', null)
        if (deleteError) Alert.alert('Unable to delete category', deleteError.message)
        else { await writeAudit('Removed category "' + category.name + '" (soft delete)'); await loadCategories(); Alert.alert('Category deleted', 'The category is hidden. Historical records remain unchanged.') }
        setSaving(false)
      })() } },
    ])
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
            <CategoryIcon icon={category.icon} color={category.color || adminColors.primary} size={40} />
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
          <Pressable style={styles.removeButton} onPress={() => softDeleteCategory(category)} disabled={saving}>
            <Text style={styles.removeText}>Delete</Text>
          </Pressable>
        </View>
      ))}

      <Modal transparent visible={!!draft} animationType="slide" onRequestClose={() => { if (!saving) setDraft(null) }}>
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

              <Text style={styles.fieldLabel}>Color palette</Text>
              <View style={styles.colorPreviewRow}>
                <View style={[styles.colorPreview, { backgroundColor: previewColor }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.previewTitle}>Live preview</Text>
                  <Text style={styles.previewHex}>{draft?.color?.toUpperCase() || '#0F766E'}</Text>
                </View>
              </View>
              <View style={styles.colorPalette}>
                {['#0F766E','#0D9488','#14B8A6','#2563EB','#3B82F6','#6366F1','#7C3AED','#A855F7','#DB2777','#E11D48','#DC2626','#EA580C','#D97706','#CA8A04','#65A30D','#16A34A','#475569','#334155','#1F2937','#111827','#F97316','#F43F5E','#06B6D4','#84CC16'].map((color) => (
                  <Pressable key={color} onPress={() => setDraft((current) => current ? { ...current, color } : current)} style={[styles.colorSwatch, { backgroundColor: color }, draft?.color?.toUpperCase() === color && styles.colorSwatchActive]} />
                ))}
              </View>
              <Text style={styles.fieldLabel}>Custom HEX color</Text>
              <TextInput
                value={draft?.color ?? ''}
                onChangeText={(value) => setDraft((current) => current ? { ...current, color: value } : current)}
                placeholder="#0F766E"
                autoCapitalize="characters"
                style={styles.input}
                maxLength={7}
              />
              {colorError ? <Text style={styles.fieldError}>{colorError}</Text> : null}

              <Text style={styles.fieldLabel}>Icon library</Text>
              <View style={styles.iconPreviewRow}>
                <CategoryIcon icon={draft?.icon ?? 'coins'} color={previewColor} size={48} backgroundColor={previewColor + '22'} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.previewTitle}>Selected icon preview</Text>
                  <Text style={styles.previewHex}>{draft?.icon?.startsWith('custom:') ? 'Custom uploaded image' : CATEGORY_ICON_OPTIONS.find((item) => item.key === draft?.icon)?.name || 'Icon'}</Text>
                </View>
              </View>
              <TextInput value={iconSearch} onChangeText={setIconSearch} placeholder="Search icons by name or category" placeholderTextColor="#94A3B8" style={styles.input} autoCapitalize="none" />
              <View style={styles.iconLibrary}>
                {Array.from(new Set(CATEGORY_ICON_OPTIONS.map((item) => item.group))).map((group) => {
                  const groupItems = CATEGORY_ICON_OPTIONS.filter((item) => item.group === group && (item.name + ' ' + item.group + ' ' + item.key).toLowerCase().includes(iconSearch.trim().toLowerCase()))
                  if (groupItems.length === 0) return null
                  return (
                    <View key={group} style={styles.iconGroup}>
                      <Text style={styles.iconGroupTitle}>{group}</Text>
                      <View style={styles.iconChoices}>
                        {groupItems.map((item) => (
                          <Pressable key={item.key} onPress={() => setDraft((current) => current ? { ...current, icon: item.key } : current)} style={[styles.iconChoice, draft?.icon === item.key && styles.iconChoiceActive]} accessibilityLabel={item.name + ', ' + item.group}>
                            <Text style={styles.iconChoiceText}>{item.glyph}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  )
                })}
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


    </AdminShell>
  )
}

const styles = StyleSheet.create({
  newButton: { alignSelf: 'flex-start', backgroundColor: adminColors.primary, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 11 },
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
  removeButton: { paddingHorizontal: 7, paddingVertical: 8 },
  removeText: { color: adminColors.danger, fontSize: 10, fontWeight: '900' },
  modalBackdrop: { flex: 1, backgroundColor: '#0F172A88', justifyContent: 'center', padding: 17 },
  modalScroll: { flexGrow: 1, justifyContent: 'center' },
  modalCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, gap: 9 },
  modalTitle: { color: adminColors.text, fontSize: 17, fontWeight: '900', marginBottom: 4 },
  fieldLabel: { color: adminColors.text, fontSize: 11, fontWeight: '800', marginTop: 4 },
  input: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: adminColors.border, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10, color: adminColors.text, fontSize: 12 },
  fieldError: { color: adminColors.danger, fontSize: 10 },
  iconLibrary: { gap: 12 },
  iconGroup: { gap: 7 },
  iconGroupTitle: { color: adminColors.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
  iconChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  colorPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 11, backgroundColor: '#F6F7FB' },
  colorPreview: { width: 42, height: 42, borderRadius: 12, borderWidth: 1, borderColor: '#00000018' },
  previewTitle: { color: adminColors.text, fontSize: 11, fontWeight: '900' },
  previewHex: { color: adminColors.muted, fontSize: 10, marginTop: 3 },
  colorPalette: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, paddingVertical: 5 },
  colorSwatch: { width: 28, height: 28, borderRadius: 15, borderWidth: 1, borderColor: '#00000018' },
  colorSwatchActive: { borderWidth: 3, borderColor: adminColors.text, transform: [{ scale: 1.12 }] },
  iconPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 11, backgroundColor: '#F6F7FB' },
  iconChoice: { width: 39, height: 39, borderRadius: 9, borderWidth: 1, borderColor: adminColors.border, alignItems: 'center', justifyContent: 'center' },
  iconChoiceActive: { borderWidth: 2, borderColor: adminColors.primary, backgroundColor: '#EEF0FF' },
  iconChoiceText: { fontSize: 20, fontWeight: '900' },
  switchRow: { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
  switchHint: { color: adminColors.muted, fontSize: 9, marginTop: 2 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 9, marginTop: 10 },
  cancelButton: { borderWidth: 1, borderColor: adminColors.border, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 11 },
  cancelText: { color: adminColors.text, fontSize: 11, fontWeight: '800' },
})
