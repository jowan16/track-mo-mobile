import { useAppTheme } from '@/context/ThemeContext'
import { useRef, useState } from 'react'
import { Camera, CameraView, useCameraPermissions } from 'expo-camera'
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
import { parseReceiptQR, parseReceiptText } from '@/services/receiptParser'

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
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraPermission, requestCameraPermission] = useCameraPermissions()
  const cameraRef = useRef<CameraView>(null)

  const openReceiptCamera = async () => {
    try {
      const permission = cameraPermission?.granted
        ? cameraPermission
        : await requestCameraPermission()
      if (!permission?.granted) {
        Alert.alert('Permission required', 'Allow camera access to take a receipt photo.')
        return
      }
      setCameraReady(false)
      setErrorMessage('')
      setCameraOpen(true)
    } catch {
      Alert.alert('Camera unavailable', 'Unable to open the camera. Please try uploading a receipt image instead.')
    }
  }

  const captureReceiptPhoto = async () => {
    if (!cameraReady || processing) return
    try {
      const picture = await cameraRef.current?.takePictureAsync({ quality: 1 })
      if (!picture?.uri) throw new Error('The camera could not capture this receipt.')
      setCameraOpen(false)
      const asset = {
        uri: picture.uri,
        width: picture.width,
        height: picture.height,
        type: 'image',
        fileName: 'receipt.jpg',
        mimeType: 'image/jpeg',
        fileSize: undefined,
        assetId: null,
        base64: null,
        duration: null,
      } as ImagePicker.ImagePickerAsset
      setImage(asset)
      await uploadAndRecognize(asset)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to capture this receipt.')
    }
  }

  const chooseImage = async (source: 'camera' | 'gallery') => {
    try {
      if (source === 'camera') {
        await openReceiptCamera()
        return
      }

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted) {
        Alert.alert('Permission required', 'Allow photo library access to select a receipt.')
        return
      }

      const result = await ImagePicker.launchImageLibraryAsync({
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

      // Decode QR from the captured/selected image itself. This supports
      // printed QR payment receipts without requiring a separate live scanner.
      const [qrResults, ocrResult] = await Promise.all([
        Camera.scanFromURLAsync(asset.uri, ['qr']).catch((error) => {
          console.warn('[Receipt QR] image decoding failed:', error)
          return []
        }),
        recognizeReceipt(uploaded.path).catch((error) => {
          console.warn('[Receipt OCR] recognition failed:', error)
          return null
        }),
      ])

      const qrPayload = qrResults.find((result) => result.data?.trim())?.data?.trim() ?? ''
      const ocrText = ocrResult?.text?.trim() ?? ''
      if (!qrPayload && !ocrText) {
        throw new Error('No readable QR code or receipt text was detected. Try a clearer, closer photo.')
      }

      const qrDraft = qrPayload ? parseReceiptQR(qrPayload) : null
      const textDraft = ocrText ? parseReceiptText(ocrText) : null
      const baseDraft = textDraft ?? qrDraft!
      const draft = {
        ...baseDraft,
        merchant_name: textDraft?.merchant_name || qrDraft?.merchant_name || '',
        receipt_date: textDraft?.receipt_date || qrDraft?.receipt_date || '',
        total: textDraft?.total ?? qrDraft?.total ?? null,
        suggestedCategory:
          textDraft?.suggestedCategory && textDraft.suggestedCategory !== 'Others'
            ? textDraft.suggestedCategory
            : qrDraft?.suggestedCategory || textDraft?.suggestedCategory || 'Others',
        payment_method: textDraft?.payment_method || qrDraft?.payment_method || '',
        bank_name: textDraft?.bank_name || qrDraft?.bank_name || '',
        transaction_status: textDraft?.transaction_status || qrDraft?.transaction_status || '',
        receipt_type:
          textDraft?.receipt_type === 'payment' || qrDraft?.receipt_type === 'payment'
            ? 'payment' as const
            : 'merchant' as const,
      }

      console.log('[Receipt Recognition] source:', qrPayload ? 'photo+qr' : 'photo+ocr')
      console.log('[Receipt Recognition] provider:', draft.bank_name || 'Unknown')
      console.log('[Receipt Recognition] status:', draft.transaction_status || 'Unknown')

      router.push({
        pathname: '/(user)/expenses',
        params: {
          receiptPath: uploaded.path,
          receiptDraft: JSON.stringify(draft),
          receiptSource: qrPayload ? 'qr' : 'image',
          receiptModel: ocrResult?.model || (qrPayload ? 'qr-code' : 'unknown'),
          receiptRawText: ocrText || qrPayload,
          receiptQrPayload: qrPayload,
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
            Take a photo of a receipt or payment QR code, or choose an image. Track Mo will recognize the available details and let you review them before saving the expense.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.selectionTitle}>Add your receipt</Text>
          <Text style={styles.cardDescription}>Keep the receipt clear and well lit. Crop the image to include the entire receipt, especially its date and total.</Text>

          <Pressable
            style={[styles.primaryButton, (processing || cameraOpen) && styles.disabled]}
            onPress={() => void chooseImage('camera')}
            disabled={processing || cameraOpen}
          >
            <Text style={styles.primaryText}>▣  Take a Photo / Scan QR</Text>
          </Pressable>
          <Pressable
            style={[styles.secondaryButton, processing && styles.disabled]}
            onPress={() => void chooseImage('gallery')}
            disabled={processing}
          >
            <Text style={styles.secondaryText}>▧  Upload from Gallery</Text>
          </Pressable>

          <Text style={styles.hint}>JPG or PNG · Maximum 10 MB · QR receipt codes supported</Text>
        </View>

        {cameraOpen ? (
          <View style={styles.qrCard}>
            <View style={styles.qrHeader}>
              <View style={styles.qrHeaderText}>
                <Text style={styles.previewTitle}>Take Receipt Photo</Text>
                <Text style={styles.qrDescription}>Frame the full receipt or payment confirmation, then capture it. Track Mo will check the photo for a QR code and read its printed text.</Text>
              </View>
              <Pressable
                style={styles.qrCloseButton}
                onPress={() => setCameraOpen(false)}
              >
                <Text style={styles.qrCloseText}>×</Text>
              </Pressable>
            </View>
            <View style={styles.qrCameraFrame}>
              <CameraView
                ref={cameraRef}
                style={styles.qrCamera}
                facing="back"
                onCameraReady={() => setCameraReady(true)}
              />
            </View>
            <Text style={styles.qrFooter}>After capture, Track Mo checks the image for a QR code and reads the receipt text. No separate scanner is needed.</Text>
            <Pressable
              style={[styles.primaryButton, (!cameraReady || processing) && styles.disabled]}
              onPress={() => void captureReceiptPhoto()}
              disabled={!cameraReady || processing}
            >
              <Text style={styles.primaryText}>●  Capture Receipt</Text>
            </Pressable>
          </View>
        ) : null}

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
  headerTitle: { fontSize: 24, fontWeight: '800', color: COLORS.ink, textAlign: 'center' },
  headerSubtitle: { color: COLORS.muted, fontSize: 12, marginTop: 3, textAlign: 'center' },
  headerSpacer: { width: 44, height: 44 },
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
  qrCard: { backgroundColor: COLORS.white, borderRadius: 17, padding: 15, borderWidth: 1, borderColor: COLORS.line },
  qrHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  qrHeaderText: { flex: 1 },
  qrDescription: { color: COLORS.muted, fontSize: 11, marginTop: 4 },
  qrCloseButton: { width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.brandLight, alignItems: 'center', justifyContent: 'center' },
  qrCloseText: { color: COLORS.brand, fontSize: 24, lineHeight: 27 },
  qrCameraFrame: { width: '100%', height: 320, overflow: 'hidden', borderRadius: 12, backgroundColor: '#000000' },
  qrCamera: { flex: 1 },
  qrFooter: { color: COLORS.muted, fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 10 },
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
