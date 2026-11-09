import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import { router } from 'expo-router'

import { useAuth } from '@/context/AuthContext'
import {
  deleteReceipt,
  getUserReceipts,
  uploadReceipt,
  recognizeReceipt,
  type ReceiptRecord,
  type ReceiptOCRResult,
} from '@/services/receiptStorage'
import { UserMenuButton } from '@/components/user-navigation'

const COLORS = {
  canvas: '#f6f7f5',
  white: '#ffffff',
  ink: '#14201c',
  muted: '#68756f',
  line: '#e4e8e5',
  brand: '#0f766e',
  brandLight: '#e6f4f1',
  danger: '#b42318',
}

export default function ScanReceiptScreen() {
  const { profile } = useAuth()

  const [image, setImage] =
    useState<ImagePicker.ImagePickerAsset | null>(null)

  const [uploading, setUploading] = useState(false)
  const [uploadedPath, setUploadedPath] = useState<string | null>(null)

  const [recognizing, setRecognizing] = useState(false)
  const [ocrResult, setOcrResult] = useState<ReceiptOCRResult | null>(null)
  const [ocrError, setOcrError] = useState<string | null>(null)

  const [receipts, setReceipts] = useState<ReceiptRecord[]>([])
  const [loadingReceipts, setLoadingReceipts] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [deletingPath, setDeletingPath] = useState<string | null>(null)

  const loadReceipts = useCallback(async () => {
    if (!profile?.id) {
      setReceipts([])
      setLoadingReceipts(false)
      return
    }

    try {
      const result = await getUserReceipts(profile.id)
      setReceipts(result)
    } catch (error) {
      Alert.alert(
        'Unable to load receipts',
        error instanceof Error
          ? error.message
          : 'Please try again.',
      )
    } finally {
      setLoadingReceipts(false)
      setRefreshing(false)
    }
  }, [profile?.id])

  useEffect(() => {
    setLoadingReceipts(true)
    void loadReceipts()
  }, [loadReceipts])

  const handleRefresh = () => {
    setRefreshing(true)
    void loadReceipts()
  }

  const handleDeleteReceipt = (receipt: ReceiptRecord) => {
    Alert.alert(
      'Delete receipt?',
      'This will permanently delete this uploaded receipt image.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingPath(receipt.path)

            try {
              await deleteReceipt(receipt.path)

              setReceipts((current) =>
                current.filter((item) => item.path !== receipt.path),
              )

              if (uploadedPath === receipt.path) {
                setUploadedPath(null)
                setImage(null)
              }

              Alert.alert('Receipt deleted', 'The receipt was successfully deleted.')
            } catch (error) {
              Alert.alert(
                'Delete failed',
                error instanceof Error
                  ? error.message
                  : 'Unable to delete this receipt.',
              )
            } finally {
              setDeletingPath(null)
            }
          },
        },
      ],
    )
  }

  const formatReceiptDate = (value: string | null) => {
    if (!value) return 'Upload date unavailable'

    const date = new Date(value)

    if (Number.isNaN(date.getTime())) {
      return 'Upload date unavailable'
    }

    return date.toLocaleString()
  }

  const chooseImage = async (
    source: 'camera' | 'gallery',
  ) => {
    try {
      let result: ImagePicker.ImagePickerResult

      if (source === 'camera') {
        const permission =
          await ImagePicker.requestCameraPermissionsAsync()

        if (!permission.granted) {
          Alert.alert(
            'Camera permission required',
            'Allow Track Mo to access your camera to take a receipt photo.',
          )
          return
        }

        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [3, 4],
          quality: 0.85,
        })
      } else {
        const permission =
          await ImagePicker.requestMediaLibraryPermissionsAsync()

        if (!permission.granted) {
          Alert.alert(
            'Gallery permission required',
            'Allow Track Mo to access your photos to select a receipt.',
          )
          return
        }

        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [3, 4],
          quality: 0.85,
        })
      }

      if (result.canceled || !result.assets?.length) {
        return
      }

      const selectedImage = result.assets[0]

      if (
        selectedImage.mimeType &&
        !selectedImage.mimeType.startsWith('image/')
      ) {
        Alert.alert('Invalid file', 'Please select an image.')
        return
      }

      if (
        selectedImage.fileSize &&
        selectedImage.fileSize > 10 * 1024 * 1024
      ) {
        Alert.alert(
          'Image too large',
          'Please select a receipt image smaller than 10 MB.',
        )
        return
      }

      setImage(selectedImage)
      setUploadedPath(null)
    } catch (error) {
      Alert.alert(
        'Unable to select image',
        error instanceof Error
          ? error.message
          : 'Please try again.',
      )
    }
  }

  const runOCR = async (path: string) => {
    if (!path) return

    setRecognizing(true)
    setOcrError(null)
    setOcrResult(null)

    try {
      const result = await recognizeReceipt(path)
      setOcrResult(result)

      if (!result.text.trim()) {
        setOcrError(
          'No readable text was detected. Try a clearer receipt image.',
        )
      }
    } catch (error) {
      setOcrError(
        error instanceof Error
          ? error.message
          : 'Unable to recognize this receipt. Please try again.',
      )
    } finally {
      setRecognizing(false)
    }
  }

  const handleUpload = async () => {
    if (!profile?.id || !image) {
      Alert.alert(
        'Missing information',
        'Please select a receipt image first.',
      )
      return
    }

    setUploading(true)

    try {
      const result = await uploadReceipt(profile.id, image)

      setUploadedPath(result.path)
      await loadReceipts()

      // OCR is a separate operation. An OCR failure does not undo
      // or delete the successfully uploaded receipt.
      await runOCR(result.path)

      Alert.alert(
        'Receipt uploaded!',
        'Your receipt image has been securely stored. Check the recognition results on this screen.',
      )
    } catch (error) {
      Alert.alert(
        'Upload failed',
        error instanceof Error
          ? error.message
          : 'Unable to upload receipt. Please try again.',
      )
    } finally {
      setUploading(false)
    }
  }

  const resetSelection = () => {
    setImage(null)
    setUploadedPath(null)
    setOcrResult(null)
    setOcrError(null)
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <UserMenuButton />

        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Scan Receipt</Text>
          <Text style={styles.headerSubtitle}>
            AI-powered expense recognition
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.brand}
          />
        }
      >
        <View style={styles.intro}>
          <View style={styles.introIcon}>
            <Text style={styles.introIconText}>✦</Text>
          </View>

          <Text style={styles.title}>
            Let AI organize your expenses
          </Text>

          <Text style={styles.description}>
            Take a photo or upload your receipt. Track Mo will
            extract the receipt details and suggest the appropriate
            expense category.
          </Text>
        </View>

        {!image ? (
          <View style={styles.selectionCard}>
            <View style={styles.receiptIcon}>
              <Text style={styles.receiptIconText}>▤</Text>
            </View>

            <Text style={styles.selectionTitle}>
              Add your receipt
            </Text>

            <Text style={styles.selectionDescription}>
              Make sure the receipt is clear, readable, and
              completely visible.
            </Text>

            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.pressed,
              ]}
              onPress={() => chooseImage('camera')}
            >
              <Text style={styles.primaryButtonIcon}>▣</Text>
              <Text style={styles.primaryButtonText}>
                Take a Photo
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.pressed,
              ]}
              onPress={() => chooseImage('gallery')}
            >
              <Text style={styles.secondaryButtonIcon}>▧</Text>
              <Text style={styles.secondaryButtonText}>
                Upload from Gallery
              </Text>
            </Pressable>

            <Text style={styles.fileHint}>
              JPG, PNG, WEBP or HEIC · Maximum 10 MB
            </Text>
          </View>
        ) : (
          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <Text style={styles.previewTitle}>
                Receipt Preview
              </Text>

              <Pressable
                onPress={resetSelection}
                disabled={uploading}
              >
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
            </View>

            <Image
              source={{ uri: image.uri }}
              style={styles.previewImage}
              resizeMode="contain"
            />

            <Text style={styles.fileName} numberOfLines={2}>
              {image.fileName || 'Selected receipt image'}
            </Text>

            {uploadedPath ? (
              <View style={styles.successContainer}>
                <Text style={styles.successTitle}>
                  ✓ Receipt securely uploaded
                </Text>
                <Text style={styles.successDescription}>
                  Your receipt is stored securely. OCR can be run again
                  without uploading the image again.
                </Text>

                <Pressable
                  style={styles.ocrButton}
                  onPress={() => void runOCR(uploadedPath)}
                  disabled={recognizing || uploading}
                >
                  {recognizing ? (
                    <>
                      <ActivityIndicator color="#ffffff" />
                      <Text style={styles.ocrButtonText}>
                        Reading receipt...
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.ocrButtonText}>
                      {ocrResult ? 'Recognize Again' : 'Recognize Receipt'}
                    </Text>
                  )}
                </Pressable>

                {ocrError ? (
                  <View style={styles.ocrErrorContainer}>
                    <Text style={styles.ocrErrorTitle}>
                      Recognition needs attention
                    </Text>
                    <Text style={styles.ocrErrorText}>
                      {ocrError}
                    </Text>
                  </View>
                ) : null}

                {ocrResult?.text ? (
                  <View style={styles.ocrResultContainer}>
                    <Text style={styles.ocrResultTitle}>
                      Extracted Receipt Text
                    </Text>
                    <Text style={styles.ocrModel}>
                      Model: {ocrResult.model}
                    </Text>
                    <Text style={styles.ocrResultText} selectable>
                      {ocrResult.text}
                    </Text>
                    <Text style={styles.ocrDetectionCount}>
                      {ocrResult.detections.length} text detections
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <>
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => chooseImage('camera')}
                  disabled={uploading}
                >
                  <Text style={styles.secondaryButtonText}>
                    Retake Photo
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.primaryButton}
                  onPress={handleUpload}
                  disabled={uploading}
                >
                  {uploading ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      Upload Receipt
                    </Text>
                  )}
                </Pressable>
              </>
            )}
          </View>
        )}

        <View style={styles.historyCard}>
          <View style={styles.historyHeader}>
            <View>
              <Text style={styles.historyTitle}>My Uploaded Receipts</Text>
              <Text style={styles.historySubtitle}>
                {receipts.length} {receipts.length === 1 ? 'receipt' : 'receipts'} stored securely
              </Text>
            </View>

            <Pressable
              onPress={handleRefresh}
              disabled={refreshing || loadingReceipts}
              style={styles.refreshButton}
            >
              <Text style={styles.refreshButtonText}>
                {refreshing ? 'Refreshing...' : '↻ Refresh'}
              </Text>
            </Pressable>
          </View>

          {loadingReceipts ? (
            <View style={styles.historyMessage}>
              <ActivityIndicator color={COLORS.brand} />
              <Text style={styles.historyEmptyText}>
                Loading your receipts...
              </Text>
            </View>
          ) : receipts.length === 0 ? (
            <View style={styles.historyMessage}>
              <Text style={styles.historyEmptyIcon}>▤</Text>
              <Text style={styles.historyEmptyTitle}>
                No uploaded receipts yet
              </Text>
              <Text style={styles.historyEmptyText}>
                Receipts you upload will appear here.
              </Text>
            </View>
          ) : (
            receipts.map((receipt) => (
              <View style={styles.receiptRow} key={receipt.path}>
                <Image
                  source={{ uri: receipt.signedUrl }}
                  style={styles.historyImage}
                  resizeMode="cover"
                />

                <View style={styles.receiptDetails}>
                  <Text style={styles.receiptName} numberOfLines={2}>
                    {receipt.fileName}
                  </Text>

                  <Text style={styles.receiptDate}>
                    {formatReceiptDate(receipt.createdAt)}
                  </Text>

                  <Text style={styles.receiptPrivate}>
                    ✓ Privately stored
                  </Text>
                </View>

                <Pressable
                  onPress={() => handleDeleteReceipt(receipt)}
                  disabled={deletingPath === receipt.path}
                  style={styles.deleteButton}
                >
                  {deletingPath === receipt.path ? (
                    <ActivityIndicator color={COLORS.danger} size="small" />
                  ) : (
                    <Text style={styles.deleteButtonText}>Delete</Text>
                  )}
                </Pressable>
              </View>
            ))
          )}
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>
            How receipt scanning works
          </Text>

          {[
            ['01', 'Capture or upload', 'Select a clear receipt image.'],
            ['02', 'AI reads your receipt', 'Extract merchant, items, date and total.'],
            ['03', 'Automatic categorization', 'AI suggests the matching expense category.'],
            ['04', 'Review and confirm', 'Edit details and approve before saving.'],
          ].map(([number, title, description]) => (
            <View style={styles.stepRow} key={number}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{number}</Text>
              </View>

              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>{title}</Text>
                <Text style={styles.stepDescription}>
                  {description}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={styles.privacyText}>
          Your receipt images are stored in private Supabase
          Storage. Only the authenticated owner can access
          their files.
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.canvas,
  },
  header: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 13,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: COLORS.ink,
  },
  headerSubtitle: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 3,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
    gap: 18,
  },
  intro: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  introIcon: {
    width: 54,
    height: 54,
    borderRadius: 17,
    backgroundColor: COLORS.brandLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 13,
  },
  introIconText: {
    color: COLORS.brand,
    fontSize: 30,
    fontWeight: '800',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.ink,
    textAlign: 'center',
  },
  description: {
    color: COLORS.muted,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 22,
    marginTop: 9,
  },
  selectionCard: {
    backgroundColor: COLORS.white,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 23,
    alignItems: 'center',
  },
  receiptIcon: {
    width: 76,
    height: 76,
    borderRadius: 20,
    backgroundColor: COLORS.brandLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  receiptIconText: {
    fontSize: 43,
    color: COLORS.brand,
  },
  selectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.ink,
  },
  selectionDescription: {
    fontSize: 13,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 22,
  },
  primaryButton: {
    minHeight: 51,
    width: '100%',
    borderRadius: 12,
    backgroundColor: COLORS.brand,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 9,
    marginTop: 10,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  primaryButtonIcon: {
    color: '#ffffff',
    fontSize: 19,
  },
  secondaryButton: {
    minHeight: 49,
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 9,
    marginTop: 11,
  },
  secondaryButtonText: {
    color: COLORS.brand,
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButtonIcon: {
    color: COLORS.brand,
    fontSize: 20,
  },
  fileHint: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 17,
  },
  previewCard: {
    backgroundColor: COLORS.white,
    borderRadius: 17,
    padding: 17,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.ink,
  },
  removeText: {
    color: COLORS.danger,
    fontSize: 13,
    fontWeight: '700',
  },
  previewImage: {
    width: '100%',
    height: 340,
    borderRadius: 12,
    backgroundColor: '#f1f5f3',
  },
  fileName: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 12,
    marginBottom: 5,
  },
  successContainer: {
    backgroundColor: COLORS.brandLight,
    borderRadius: 12,
    padding: 14,
    marginTop: 15,
  },
  successTitle: {
    color: COLORS.brand,
    fontSize: 14,
    fontWeight: '800',
  },
  successDescription: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 5,
  },
  ocrButton: {
    minHeight: 46,
    borderRadius: 10,
    backgroundColor: COLORS.brand,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 9,
    marginTop: 14,
    paddingHorizontal: 14,
  },
  ocrButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  ocrErrorContainer: {
    backgroundColor: '#fff1f0',
    borderRadius: 10,
    padding: 12,
    marginTop: 13,
  },
  ocrErrorTitle: {
    color: COLORS.danger,
    fontSize: 13,
    fontWeight: '800',
  },
  ocrErrorText: {
    color: COLORS.ink,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  ocrResultContainer: {
    backgroundColor: COLORS.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 12,
    marginTop: 14,
  },
  ocrResultTitle: {
    color: COLORS.ink,
    fontSize: 14,
    fontWeight: '800',
  },
  ocrModel: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 4,
    marginBottom: 10,
  },
  ocrResultText: {
    color: COLORS.ink,
    fontSize: 12,
    lineHeight: 20,
  },
  ocrDetectionCount: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 10,
  },
  historyCard: {
    backgroundColor: COLORS.white,
    borderRadius: 17,
    padding: 17,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 10,
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.ink,
  },
  historySubtitle: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 4,
  },
  refreshButton: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: COLORS.brandLight,
  },
  refreshButtonText: {
    color: COLORS.brand,
    fontSize: 12,
    fontWeight: '700',
  },
  historyMessage: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  historyEmptyIcon: {
    fontSize: 32,
    color: COLORS.brand,
    marginBottom: 8,
  },
  historyEmptyTitle: {
    color: COLORS.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  historyEmptyText: {
    color: COLORS.muted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
  },
  receiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    gap: 11,
  },
  historyImage: {
    width: 62,
    height: 76,
    borderRadius: 9,
    backgroundColor: '#f1f5f3',
  },
  receiptDetails: {
    flex: 1,
    minWidth: 0,
  },
  receiptName: {
    color: COLORS.ink,
    fontSize: 12,
    fontWeight: '700',
  },
  receiptDate: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 5,
  },
  receiptPrivate: {
    color: COLORS.brand,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 5,
  },
  deleteButton: {
    paddingVertical: 8,
    paddingHorizontal: 9,
    borderRadius: 8,
    backgroundColor: '#fff1f0',
  },
  deleteButtonText: {
    color: COLORS.danger,
    fontSize: 11,
    fontWeight: '700',
  },
  infoCard: {
    backgroundColor: COLORS.white,
    borderRadius: 17,
    padding: 19,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.ink,
    marginBottom: 18,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 13,
    marginBottom: 17,
  },
  stepNumber: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: COLORS.brandLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    color: COLORS.brand,
    fontSize: 12,
    fontWeight: '800',
  },
  stepContent: {
    flex: 1,
    paddingTop: 1,
  },
  stepTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.ink,
  },
  stepDescription: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 4,
    lineHeight: 18,
  },
  privacyText: {
    fontSize: 11,
    lineHeight: 18,
    color: COLORS.muted,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  pressed: {
    opacity: 0.75,
  },
})
