import type { ImagePickerAsset } from 'expo-image-picker'

import { supabase } from '@/services/supabase'

const BUCKET_NAME = 'receipts'
const MAX_FILE_SIZE = 10 * 1024 * 1024

export type ReceiptUploadResult = {
  path: string
  bucket: string
  contentType: string
}

function getContentType(asset: ImagePickerAsset) {
  const mimeType = asset.mimeType?.toLowerCase()

  if (
    mimeType &&
    [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
    ].includes(mimeType)
  ) {
    return mimeType
  }

  const extension = asset.uri.split('?')[0].split('.').pop()?.toLowerCase()

  const extensions: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
  }

  const result = extension ? extensions[extension] : undefined

  if (!result) {
    throw new Error('Unsupported receipt image format.')
  }

  return result
}

function getExtension(contentType: string) {
  const extensions: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
  }

  return extensions[contentType]
}

export async function uploadReceipt(
  userId: string,
  asset: ImagePickerAsset,
): Promise<ReceiptUploadResult> {
  if (!userId) {
    throw new Error('You must be signed in to upload a receipt.')
  }

  if (!asset?.uri) {
    throw new Error('No receipt image was selected.')
  }

  if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE) {
    throw new Error('Receipt image must not exceed 10 MB.')
  }

  const contentType = getContentType(asset)
  const extension = getExtension(contentType)

  const response = await fetch(asset.uri)

  if (!response.ok) {
    throw new Error('Unable to read the selected receipt image.')
  }

  const fileData = await response.arrayBuffer()

  if (fileData.byteLength > MAX_FILE_SIZE) {
    throw new Error('Receipt image must not exceed 10 MB.')
  }

  const filename = `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}.${extension}`

  // The first folder must match the authenticated user's ID.
  const path = `${userId}/${filename}`

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(path, fileData, {
      contentType,
      cacheControl: '3600',
      upsert: false,
    })

  if (error) {
    throw new Error(`Receipt upload failed: ${error.message}`)
  }

  return {
    path,
    bucket: BUCKET_NAME,
    contentType,
  }
}

export async function deleteReceipt(path: string) {
  if (!path) return

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .remove([path])

  if (error) {
    throw new Error(`Unable to delete receipt: ${error.message}`)
  }
}


export type ReceiptRecord = {
  path: string
  fileName: string
  signedUrl: string
  createdAt: string | null
}

export async function getUserReceipts(
  userId: string,
): Promise<ReceiptRecord[]> {
  if (!userId) {
    throw new Error('You must be signed in to view receipts.')
  }

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .list(userId, {
      limit: 100,
      sortBy: {
        column: 'created_at',
        order: 'desc',
      },
    })

  if (error) {
    throw new Error(`Unable to retrieve receipts: ${error.message}`)
  }

  const files = (data ?? []).filter(
    (file) => file.name && file.id,
  )

  const receipts = await Promise.all(
    files.map(async (file) => {
      const path = `${userId}/${file.name}`

      const { data: signedData, error: signedError } =
        await supabase.storage
          .from(BUCKET_NAME)
          .createSignedUrl(path, 3600)

      if (signedError) {
        throw new Error(
          `Unable to open receipt ${file.name}: ${signedError.message}`,
        )
      }

      return {
        path,
        fileName: file.name,
        signedUrl: signedData.signedUrl,
        createdAt: file.created_at ?? null,
      }
    }),
  )

  return receipts
}
