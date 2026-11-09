import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet,
  Text, TextInput, View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import { router } from 'expo-router'

import { useAuth } from '@/context/AuthContext'
import { UserMenuButton } from '@/components/user-navigation'
import { supabase } from '@/services/supabase'
import { recognizeReceipt, uploadReceipt, type ReceiptOCRResult } from '@/services/receiptStorage'
import { parseReceiptText, type ParsedReceipt, type ParsedReceiptItem } from '@/services/receiptParser'

const COLORS = {
  canvas: '#f6f7f5', white: '#ffffff', ink: '#14201c', muted: '#68756f',
  line: '#e4e8e5', brand: '#0f766e', brandLight: '#e6f4f1', danger: '#b42318',
}
type Category = { id: number; name: string; icon: string; color: string; bg: string }

const METHODS = ['Cash', 'E-wallet', 'Card', 'Bank transfer']
const today = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const amountText = (value: number | null) => value === null ? '' : String(value)

export default function ScanReceiptScreen() {
  const { profile } = useAuth()
  const [image, setImage] = useState<ImagePicker.ImagePickerAsset | null>(null)
  const [storagePath, setStoragePath] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [recognizing, setRecognizing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [ocrResult, setOcrResult] = useState<ReceiptOCRResult | null>(null)
  const [ocrError, setOcrError] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [loadingCategories, setLoadingCategories] = useState(true)
  const [draft, setDraft] = useState<ParsedReceipt | null>(null)
  const [amount, setAmount] = useState('')
  const [formError, setFormError] = useState('')

  useEffect(() => {
    let active = true
    const load = async () => {
      if (!profile?.id) { setLoadingCategories(false); return }
      try {
        const [categoryResult, trackedResult] = await Promise.all([
          supabase.from('categories').select('id,name,icon,color,bg,is_active,show_in_picker,sort_order').eq('is_active', true).eq('show_in_picker', true).order('sort_order'),
          supabase.from('user_categories').select('category_id').eq('user_id', profile.id),
        ])
        if (categoryResult.error) throw categoryResult.error
        if (trackedResult.error) throw trackedResult.error
        const tracked = new Set((trackedResult.data ?? []).map((row) => Number(row.category_id)))
        if (active) setCategories(((categoryResult.data ?? []) as Category[]).filter((category) => tracked.has(category.id)))
      } catch (error) {
        if (active) Alert.alert('Unable to load categories', error instanceof Error ? error.message : 'Please try again.')
      } finally {
        if (active) setLoadingCategories(false)
      }
    }
    void load()
    return () => { active = false }
  }, [profile?.id])

  const selectedCategory = useMemo(
    () => categories.find((category) => category.name === draft?.suggestedCategory) ?? null,
    [categories, draft?.suggestedCategory],
  )

  const chooseImage = async (source: 'camera' | 'gallery') => {
    try {
      const permission = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted) {
        Alert.alert('Permission required', source === 'camera'
          ? 'Allow camera access to take a receipt photo.'
          : 'Allow photo library access to select a receipt.')
        return
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [3, 4], quality: 0.85 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [3, 4], quality: 0.85 })
      if (result.canceled || !result.assets?.length) return
      const selected = result.assets[0]
      if (selected.fileSize && selected.fileSize > 10 * 1024 * 1024) {
        Alert.alert('Image too large', 'Please choose an image smaller than 10 MB.')
        return
      }
      setImage(selected)
      setStoragePath(null)
      setOcrResult(null)
      setOcrError('')
      setDraft(null)
      setFormError('')
    } catch (error) {
      Alert.alert('Unable to select image', error instanceof Error ? error.message : 'Please try again.')
    }
  }

  const runRecognition = async (path: string) => {
    setRecognizing(true)
    setOcrError('')
    setDraft(null)
    try {
      const result = await recognizeReceipt(path)
      setOcrResult(result)
      if (!result.text.trim()) throw new Error('No readable text was detected. Try a clearer receipt image.')
      const parsed = parseReceiptText(result.text)
      setDraft(parsed)
      setAmount(amountText(parsed.total))
      if (!parsed.total) setFormError('The total was not confidently detected. Enter the receipt total before saving.')
    } catch (error) {
      setOcrError(error instanceof Error ? error.message : 'Unable to recognize this receipt.')
    } finally {
      setRecognizing(false)
    }
  }

  const handleUpload = async () => {
    if (!profile?.id || !image) return
    setUploading(true)
    setFormError('')
    try {
      const uploaded = await uploadReceipt(profile.id, image)
      setStoragePath(uploaded.path)
      await runRecognition(uploaded.path)
    } catch (error) {
      Alert.alert('Upload failed', error instanceof Error ? error.message : 'Unable to upload receipt.')
    } finally {
      setUploading(false)
    }
  }

  const updateItem = (index: number, patch: Partial<ParsedReceiptItem>) => {
    setDraft((current) => current ? ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    }) : current)
  }

  const saveConfirmedExpense = async () => {
    if (!profile?.id || !storagePath || !draft) return
    const parsedAmount = Number(amount)
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || parsedAmount > 9999999.99) {
      setFormError('Enter a valid total amount greater than zero.')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.receipt_date) || draft.receipt_date > today()) {
      setFormError('Enter a valid receipt date that is not in the future.')
      return
    }
    if (!selectedCategory) {
      setFormError('Choose an active category that you are tracking.')
      return
    }
    if (!METHODS.includes(draft.payment_method)) {
      setFormError('Please select the payment method shown on your receipt or choose the correct one.')
      return
    }
    if (draft.items.some((item) => !item.item_name.trim() || item.quantity <= 0)) {
      setFormError('Check each item name and quantity before saving.')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const { data, error } = await supabase.rpc('save_receipt_expense', {
        p_storage_path: storagePath,
        p_merchant_name: draft.merchant_name,
        p_receipt_date: draft.receipt_date,
        p_subtotal: draft.subtotal,
        p_tax: draft.tax,
        p_total: parsedAmount,
        p_currency: 'PHP',
        p_category_id: selectedCategory.id,
        p_amount: parsedAmount,
        p_spent_on: draft.receipt_date,
        p_payment_method: draft.payment_method,
        p_note: draft.items.map((item) => item.item_name.trim()).filter(Boolean).join(', ').slice(0, 200) || draft.merchant_name.slice(0, 200),
        p_items: draft.items.map((item) => ({
          item_name: item.item_name.trim(),
          quantity: item.quantity,
          unit_price: item.unit_price,
          line_total: item.line_total,
        })),
        p_recognition_data: {
          model: ocrResult?.model ?? 'unknown',
          raw_text: ocrResult?.text ?? '',
          detections: ocrResult?.detections ?? [],
          confirmed_at: new Date().toISOString(),
        },
      })
      if (error) throw error
      Alert.alert('Expense saved', 'Your confirmed receipt and expense have been saved.', [
        { text: 'View Expenses', onPress: () => router.replace('/(user)/expenses') },
      ])
      setImage(null)
      setStoragePath(null)
      setOcrResult(null)
      setDraft(null)
      setAmount('')
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to save this receipt. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    if (saving || uploading || recognizing) return
    setImage(null); setStoragePath(null); setOcrResult(null); setOcrError(''); setDraft(null); setAmount(''); setFormError('')
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <UserMenuButton />
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Scan Receipt</Text>
          <Text style={styles.headerSubtitle}>AI-powered expense recognition</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.intro}>
          <View style={styles.introIcon}><Text style={styles.introIconText}>✦</Text></View>
          <Text style={styles.title}>Let AI organize your expenses</Text>
          <Text style={styles.description}>Take a photo or upload a receipt. Review and edit the extracted details before anything is added to your expenses.</Text>
        </View>

        {!image ? (
          <View style={styles.card}>
            <Text style={styles.selectionTitle}>Add your receipt</Text>
            <Text style={styles.description}>Use a clear, readable photo with the full receipt visible.</Text>
            <Pressable style={styles.primaryButton} onPress={() => void chooseImage('camera')}><Text style={styles.primaryText}>▣  Take a Photo</Text></Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => void chooseImage('gallery')}><Text style={styles.secondaryText}>▧  Upload from Gallery</Text></Pressable>
            <Text style={styles.hint}>JPG, PNG, WEBP or HEIC · Maximum 10 MB</Text>
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>Receipt Preview</Text>
              <Pressable onPress={reset}><Text style={styles.removeText}>Remove</Text></Pressable>
            </View>
            <Image source={{ uri: image.uri }} style={styles.previewImage} resizeMode="contain" />
            <Text style={styles.fileName}>{image.fileName || 'Selected receipt image'}</Text>
            {!storagePath ? (
              <Pressable style={[styles.primaryButton, uploading && styles.disabled]} onPress={() => void handleUpload()} disabled={uploading}>
                {uploading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Upload & Read Receipt</Text>}
              </Pressable>
            ) : (
              <>
                <Text style={styles.successText}>✓ Receipt securely uploaded</Text>
                <Pressable style={[styles.secondaryButton, recognizing && styles.disabled]} onPress={() => void runRecognition(storagePath)} disabled={recognizing || uploading}>
                  {recognizing ? <ActivityIndicator color={COLORS.brand} /> : <Text style={styles.secondaryText}>{ocrResult ? 'Recognize Again' : 'Recognize Receipt'}</Text>}
                </Pressable>
              </>
            )}
            {ocrError ? <View style={styles.errorCard}><Text style={styles.errorText}>{ocrError}</Text></View> : null}
          </View>
        )}

        {recognizing ? <View style={styles.card}><ActivityIndicator color={COLORS.brand} /><Text style={styles.centerText}>Reading receipt text...</Text></View> : null}

        {draft && storagePath ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Review extracted details</Text>
            <Text style={styles.sectionHint}>OCR suggestions can be inaccurate. Check every field before confirming.</Text>

            <Text style={styles.label}>Merchant / Store</Text>
            <TextInput style={styles.input} value={draft.merchant_name} onChangeText={(value) => setDraft((current) => current ? { ...current, merchant_name: value } : current)} placeholder="Store name" />

            <Text style={styles.label}>Receipt Date (YYYY-MM-DD)</Text>
            <TextInput style={styles.input} value={draft.receipt_date} onChangeText={(value) => setDraft((current) => current ? { ...current, receipt_date: value } : current)} placeholder="2026-11-08" />

            <Text style={styles.label}>Total Amount (₱)</Text>
            <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />

            <Text style={styles.label}>Suggested Category</Text>
            {loadingCategories ? <ActivityIndicator color={COLORS.brand} /> : (
              <View style={styles.chips}>
                {categories.map((category) => {
                  const active = selectedCategory?.id === category.id
                  return <Pressable key={category.id} style={[styles.chip, active && styles.chipActive]} onPress={() => setDraft((current) => current ? { ...current, suggestedCategory: category.name } : current)}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{category.name}</Text>
                  </Pressable>
                })}
              </View>
            )}

            <Text style={styles.label}>Payment Method</Text>
            <Text style={styles.sectionHint}>{draft.payment_method ? 'Detected from receipt. Change if incorrect.' : 'Not detected. Please select the correct method.'}</Text>
            <View style={styles.chips}>
              {METHODS.map((method) => <Pressable key={method} style={[styles.chip, draft.payment_method === method && styles.chipActive]} onPress={() => setDraft((current) => current ? { ...current, payment_method: method } : current)}>
                <Text style={[styles.chipText, draft.payment_method === method && styles.chipTextActive]}>{method}</Text>
              </Pressable>)}
            </View>

            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>Purchased Items</Text>
              <Pressable onPress={() => setDraft((current) => current ? { ...current, items: [...current.items, { item_name: '', quantity: 1, unit_price: null, line_total: null }] } : current)}><Text style={styles.addText}>+ Add item</Text></Pressable>
            </View>
            {draft.items.length === 0 ? <Text style={styles.sectionHint}>No line items could be confidently extracted. Add them manually if you want item-level receipt details.</Text> : null}
            {draft.items.map((item, index) => (
              <View key={index} style={styles.itemCard}>
                <TextInput style={[styles.input, styles.itemName]} value={item.item_name} onChangeText={(value) => updateItem(index, { item_name: value })} placeholder="Item name" />
                <View style={styles.itemFields}>
                  <View style={styles.itemField}><Text style={styles.smallLabel}>Qty</Text><TextInput style={styles.input} value={String(item.quantity)} keyboardType="decimal-pad" onChangeText={(value) => updateItem(index, { quantity: Number(value) || 0 })} /></View>
                  <View style={styles.itemField}><Text style={styles.smallLabel}>Unit price</Text><TextInput style={styles.input} value={amountText(item.unit_price)} keyboardType="decimal-pad" onChangeText={(value) => updateItem(index, { unit_price: value ? Number(value) : null })} placeholder="0.00" /></View>
                  <View style={styles.itemField}><Text style={styles.smallLabel}>Line total</Text><TextInput style={styles.input} value={amountText(item.line_total)} keyboardType="decimal-pad" onChangeText={(value) => updateItem(index, { line_total: value ? Number(value) : null })} placeholder="0.00" /></View>
                </View>
                <Pressable onPress={() => setDraft((current) => current ? { ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) } : current)}><Text style={styles.removeText}>Remove item</Text></Pressable>
              </View>
            ))}

            <Text style={styles.label}>Subtotal (₱)</Text>
            <TextInput style={styles.input} value={amountText(draft.subtotal)} keyboardType="decimal-pad" onChangeText={(value) => setDraft((current) => current ? { ...current, subtotal: value ? Number(value) : null } : current)} placeholder="Not detected" />
            <Text style={styles.label}>Tax (₱)</Text>
            <TextInput style={styles.input} value={amountText(draft.tax)} keyboardType="decimal-pad" onChangeText={(value) => setDraft((current) => current ? { ...current, tax: value ? Number(value) : null } : current)} placeholder="Not detected" />

            {formError ? <View style={styles.errorCard}><Text style={styles.errorText}>{formError}</Text></View> : null}
            <Pressable style={[styles.primaryButton, saving && styles.disabled]} onPress={() => void saveConfirmedExpense()} disabled={saving || loadingCategories}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Confirm & Save Expense</Text>}
            </Pressable>
            <Text style={styles.privacyNote}>Nothing is added to your expenses until you press Confirm & Save. The receipt image remains privately stored.</Text>
          </View>
        ) : null}

        {ocrResult?.text ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Original OCR Text</Text>
            <Text style={styles.sectionHint}>Reference only — edit the extracted fields above if anything is incorrect.</Text>
            <Text selectable style={styles.ocrText}>{ocrResult.text}</Text>
          </View>
        ) : null}
        <Text style={styles.privacyNote}>Receipt images are stored in private Supabase Storage. Only the authenticated owner can access their files.</Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.canvas },
  header: { minHeight: 76, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 13, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 19, fontWeight: '800', color: COLORS.ink },
  headerSubtitle: { color: COLORS.muted, fontSize: 12, marginTop: 3 },
  content: { padding: 20, paddingBottom: 44, gap: 17 },
  intro: { alignItems: 'center', paddingVertical: 12 },
  introIcon: { width: 54, height: 54, borderRadius: 17, backgroundColor: COLORS.brandLight, alignItems: 'center', justifyContent: 'center', marginBottom: 13 },
  introIconText: { color: COLORS.brand, fontSize: 30, fontWeight: '800' },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.ink, textAlign: 'center' },
  description: { color: COLORS.muted, textAlign: 'center', fontSize: 13, lineHeight: 21, marginTop: 8 },
  card: { backgroundColor: COLORS.white, borderRadius: 17, padding: 17, borderWidth: 1, borderColor: COLORS.line },
  selectionTitle: { fontSize: 18, fontWeight: '800', color: COLORS.ink, textAlign: 'center', marginBottom: 4 },
  primaryButton: { minHeight: 49, borderRadius: 11, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15, marginTop: 13 },
  primaryText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  secondaryButton: { minHeight: 47, borderRadius: 11, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15, marginTop: 10 },
  secondaryText: { color: COLORS.brand, fontSize: 13, fontWeight: '800' },
  hint: { color: COLORS.muted, fontSize: 10, textAlign: 'center', marginTop: 14 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 },
  sectionTitle: { color: COLORS.ink, fontSize: 16, fontWeight: '800' },
  sectionHint: { color: COLORS.muted, fontSize: 11, lineHeight: 17, marginTop: 5, marginBottom: 5 },
  previewImage: { width: '100%', height: 300, borderRadius: 11, backgroundColor: '#f1f5f3' },
  fileName: { color: COLORS.muted, fontSize: 11, marginTop: 9 },
  removeText: { color: COLORS.danger, fontSize: 12, fontWeight: '700' },
  successText: { color: COLORS.brand, fontWeight: '800', fontSize: 12, marginTop: 12 },
  disabled: { opacity: 0.55 },
  centerText: { color: COLORS.muted, textAlign: 'center', marginTop: 10, fontSize: 12 },
  label: { color: COLORS.ink, fontSize: 12, fontWeight: '800', marginTop: 15, marginBottom: 7 },
  input: { minHeight: 45, borderWidth: 1, borderColor: COLORS.line, borderRadius: 10, backgroundColor: '#fff', paddingHorizontal: 11, color: COLORS.ink, fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 6 },
  chip: { borderWidth: 1, borderColor: COLORS.line, backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 11, paddingVertical: 9 },
  chipActive: { borderColor: COLORS.brand, backgroundColor: COLORS.brand },
  chipText: { color: COLORS.muted, fontSize: 11, fontWeight: '700' },
  chipTextActive: { color: '#fff' },
  addText: { color: COLORS.brand, fontSize: 12, fontWeight: '800' },
  itemCard: { backgroundColor: '#f8faf9', borderWidth: 1, borderColor: COLORS.line, borderRadius: 12, padding: 10, marginTop: 10 },
  itemName: { marginBottom: 8 },
  itemFields: { flexDirection: 'row', gap: 8 },
  itemField: { flex: 1 },
  smallLabel: { color: COLORS.muted, fontSize: 10, fontWeight: '700', marginBottom: 5 },
  errorCard: { backgroundColor: '#fff1f0', borderRadius: 10, borderWidth: 1, borderColor: '#f2c4c0', padding: 11, marginTop: 12 },
  errorText: { color: COLORS.danger, fontSize: 12, lineHeight: 18 },
  privacyNote: { color: COLORS.muted, fontSize: 10, lineHeight: 16, textAlign: 'center', marginTop: 12 },
  ocrText: { color: COLORS.ink, fontSize: 11, lineHeight: 18, marginTop: 10 },
})
