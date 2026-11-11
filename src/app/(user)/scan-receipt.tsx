import { useAppTheme } from '@/context/ThemeContext'
import { useState } from 'react'
import {
  ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet,
  Text, View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import { router } from 'expo-router'

import { useAuth } from '@/context/AuthContext'
import { UserMenuButton } from '@/components/user-navigation'
import { recognizeReceipt, uploadReceipt } from '@/services/receiptStorage'
import { parseReceiptText } from '@/services/receiptParser'

const LIGHT_COLORS = {
  canvas: '#f6f7f5', white: '#ffffff', ink: '#14201c', muted: '#68756f',
  line: '#e4e8e5', brand: '#0f766e', brandLight: '#e6f4f1', danger: '#b42318',
}
function getCOLORS(dark: boolean) { return dark ? {
  canvas: '#101a18', white: '#1b2a26', ink: '#edf5f1', muted: '#a9b8b1',
  line: '#30413a', brand: '#55c6b0', brandLight: '#203d36', danger: '#ff8178',
} : LIGHT_COLORS }


export default function ScanReceiptScreen() {
  const { resolvedTheme } = useAppTheme()
  const dark = resolvedTheme === 'dark'
  const COLORS = getCOLORS(dark)
  const styles = makeStyles(dark, COLORS)

  const { profile } = useAuth()
  const [image, setImage] = useState<ImagePicker.ImagePickerAsset | null>(null)
  const [processing, setProcessing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

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
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [3, 4],
            quality: 1,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [3, 4],
            quality: 1,
          })

      if (result.canceled || !result.assets?.length) return

      const selected = result.assets[0]
      if (selected.fileSize && selected.fileSize > 10 * 1024 * 1024) {
        Alert.alert('Image too large', 'Please choose an image smaller than 10 MB.')
        return
      }

      setImage(selected)
      setErrorMessage('')
      await uploadAndRecognize(selected)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to select or read this receipt.')
    }
  }

  const uploadAndRecognize = async (asset: ImagePicker.ImagePickerAsset) => {
    if (!profile?.id) {
      setErrorMessage('Please sign in again before scanning a receipt.')
      return
    }

    setProcessing(true)
    setErrorMessage('')
    try {
      const uploaded = await uploadReceipt(profile.id, asset)
      const result = await recognizeReceipt(uploaded.path)

      // Temporary OCR diagnostics: capture the provider's exact text and
      // word boxes so we can distinguish OCR recognition errors from parsing.
      console.log('[Receipt OCR] model:', result.model)
      console.log('[Receipt OCR] raw text:\n' + result.text)
      console.log('[Receipt OCR] detections:', JSON.stringify(
        (result.detections ?? []).map((detection) => ({
          text: detection.text_prediction?.text ?? '',
          confidence: detection.text_prediction?.confidence ?? null,
          bounding_box: detection.bounding_box ?? null,
        })),
        null,
        2,
      ))

      if (!result.text?.trim()) {
        throw new Error('No readable text was detected. Try a clearer receipt photo.')
      }

      const draft = parseReceiptText(result.text)
      router.push({
        pathname: '/(user)/expenses',
        params: {
          receiptPath: uploaded.path,
          receiptDraft: JSON.stringify(draft),
          receiptModel: result.model || 'unknown',
          receiptRawText: result.text,
        },
      })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to recognize this receipt. Please try again.')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <UserMenuButton />
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Scan Receipt</Text>
          <Text style={styles.headerSubtitle}>AI-powered expense recognition</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.intro}>
          <View style={styles.introIcon}>
            <Text style={styles.introIconText}>✦</Text>
          </View>
          <Text style={styles.title}>Turn receipts into expenses</Text>
          <Text style={styles.description}>
            Take a photo or choose a receipt image, then crop it to include the full receipt. Track Mo will read it and show the recognized text in Receipt Details for review.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.selectionTitle}>Add your receipt</Text>
          <Text style={styles.cardDescription}>Keep the receipt clear and well lit. Crop the image to include the entire receipt, especially its date and total.</Text>

          <Pressable
            style={[styles.primaryButton, processing && styles.disabled]}
            onPress={() => void chooseImage('camera')}
            disabled={processing}
          >
            <Text style={styles.primaryText}>▣  Take a Photo</Text>
          </Pressable>
          <Pressable
            style={[styles.secondaryButton, processing && styles.disabled]}
            onPress={() => void chooseImage('gallery')}
            disabled={processing}
          >
            <Text style={styles.secondaryText}>▧  Upload from Gallery</Text>
          </Pressable>

          <Text style={styles.hint}>JPG or PNG · Maximum 10 MB</Text>
        </View>

        {image ? (
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>Selected Receipt</Text>
            <Image source={{ uri: image.uri }} style={styles.previewImage} resizeMode="contain" />
            <Text style={styles.fileName} numberOfLines={1}>{image.fileName || 'Receipt image'}</Text>
          </View>
        ) : null}

        {processing ? (
          <View style={styles.processingCard}>
            <ActivityIndicator size="large" color={COLORS.brand} />
            <Text style={styles.processingTitle}>Reading your receipt…</Text>
            <Text style={styles.processingText}>Your expense form will open automatically when recognition is complete.</Text>
          </View>
        ) : null}

        {errorMessage ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Unable to read receipt</Text>
            <Text style={styles.errorText}>{errorMessage}</Text>
            {image ? (
              <Pressable style={styles.retryButton} onPress={() => void uploadAndRecognize(image)}>
                <Text style={styles.retryText}>Try Again</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}

function makeStyles(dark: boolean, COLORS: any) { return StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.canvas },
  header: { position: 'relative', minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  headerText: { position: 'absolute', left: 72, right: 72, alignItems: 'center' },
  headerTitle: { fontSize: 24, lineHeight: 29, fontWeight: '800', color: COLORS.ink, textAlign: 'center' },
  headerSubtitle: { color: COLORS.muted, fontSize: 12, lineHeight: 16, marginTop: 3, textAlign: 'center' },
  content: { padding: 20, paddingBottom: 44, gap: 17 },
  intro: { alignItems: 'center', paddingVertical: 16 },
  introIcon: { width: 58, height: 58, borderRadius: 18, backgroundColor: COLORS.brandLight, alignItems: 'center', justifyContent: 'center', marginBottom: 13 },
  introIconText: { color: COLORS.brand, fontSize: 30, fontWeight: '800' },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.ink, textAlign: 'center' },
  description: { color: COLORS.muted, textAlign: 'center', fontSize: 13, lineHeight: 21, marginTop: 8 },
  card: { backgroundColor: COLORS.white, borderRadius: 17, padding: 18, borderWidth: 1, borderColor: COLORS.line },
  selectionTitle: { fontSize: 18, fontWeight: '800', color: COLORS.ink, textAlign: 'center' },
  cardDescription: { color: COLORS.muted, fontSize: 12, lineHeight: 19, textAlign: 'center', marginTop: 6, marginBottom: 8 },
  primaryButton: { minHeight: 49, borderRadius: 11, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15, marginTop: 13 },
  primaryText: { color: COLORS.white, fontSize: 13, fontWeight: '800' },
  secondaryButton: { minHeight: 49, borderRadius: 11, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15, marginTop: 10 },
  secondaryText: { color: COLORS.ink, fontSize: 13, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  hint: { color: COLORS.muted, fontSize: 10, textAlign: 'center', marginTop: 12 },
  previewCard: { backgroundColor: COLORS.white, borderRadius: 17, padding: 16, borderWidth: 1, borderColor: COLORS.line },
  previewTitle: { color: COLORS.ink, fontSize: 14, fontWeight: '800', marginBottom: 10 },
  previewImage: { width: '100%', height: 300, backgroundColor: (dark ? '#101a18' : '#f8faf9'), borderRadius: 10 },
  fileName: { color: COLORS.muted, fontSize: 11, marginTop: 9 },
  processingCard: { backgroundColor: COLORS.white, borderRadius: 17, padding: 22, alignItems: 'center', borderWidth: 1, borderColor: COLORS.line },
  processingTitle: { color: COLORS.ink, fontSize: 15, fontWeight: '800', marginTop: 13 },
  processingText: { color: COLORS.muted, fontSize: 12, lineHeight: 19, textAlign: 'center', marginTop: 6 },
  errorCard: { backgroundColor: (dark ? '#402725' : '#fff0ef'), borderRadius: 13, borderWidth: 1, borderColor: (dark ? '#75423e' : '#f4c7c3'), padding: 14 },
  errorTitle: { color: COLORS.danger, fontSize: 13, fontWeight: '800' },
  errorText: { color: (dark ? '#ffaaa3' : '#7f1d1d'), fontSize: 12, lineHeight: 18, marginTop: 5 },
  retryButton: { alignSelf: 'flex-start', marginTop: 12, paddingVertical: 8, paddingHorizontal: 13, borderRadius: 9, backgroundColor: COLORS.white },
  retryText: { color: COLORS.brand, fontSize: 12, fontWeight: '800' },
}) }
