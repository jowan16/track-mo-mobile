import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'

const mockUpload = jest.fn<(...args: any[]) => any>()
const mockRemove = jest.fn<(...args: any[]) => any>()
const mockList = jest.fn<(...args: any[]) => any>()
const mockCreateSignedUrl = jest.fn<(...args: any[]) => any>()
const mockInvoke = jest.fn<(...args: any[]) => any>()
const mockStorageFrom = jest.fn((..._args: unknown[]) => ({
  upload: (...args: unknown[]) => mockUpload(...args),
  remove: (...args: unknown[]) => mockRemove(...args),
  list: (...args: unknown[]) => mockList(...args),
  createSignedUrl: (...args: unknown[]) => mockCreateSignedUrl(...args),
}))

jest.mock('@/services/supabase', () => ({
  supabase: {
    storage: { from: (...args: unknown[]) => mockStorageFrom(...args) },
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  },
}))

import { deleteReceipt, getUserReceipts, recognizeReceipt, uploadReceipt } from '@/services/receiptStorage'

const asset = (overrides: Record<string, unknown> = {}) => ({ uri: 'file:///receipt.jpg', ...overrides }) as never

describe('receipt storage and OCR service', () => {
  beforeEach(() => {
    mockUpload.mockResolvedValue({ data: { path: 'user-1/receipt.jpg' }, error: null })
    mockRemove.mockResolvedValue({ data: [], error: null })
    mockList.mockResolvedValue({ data: [{ id: 'file-1', name: 'receipt.jpg', created_at: '2026-11-17' }], error: null })
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://example.invalid/signed' }, error: null })
    mockInvoke.mockResolvedValue({ data: { success: true, model: 'test', text: 'TOTAL 12.00', detections: [], usage: null }, error: null })
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as Response)
  })

  afterEach(() => { jest.restoreAllMocks() })

  it('uploads a supported image into the authenticated user folder with its content type', async () => {
    const result = await uploadReceipt('user-1', asset({ mimeType: 'image/png' }))
    expect(result).toMatchObject({ bucket: 'receipts', contentType: 'image/png' })
    expect(result.path).toMatch(/^user-1\/.+\.png$/)
    expect(mockUpload).toHaveBeenCalledWith(result.path, expect.any(ArrayBuffer), expect.objectContaining({ contentType: 'image/png', upsert: false }))
  })

  it.each([
    ['', 'You must be signed in to upload a receipt.'],
    ['user-1', 'No receipt image was selected.'],
  ])('rejects missing upload input (%s)', async (userId, message) => {
    await expect(uploadReceipt(userId, userId ? ({} as never) : asset())).rejects.toThrow(message)
  })

  it('rejects unsupported and oversized images before storage upload', async () => {
    await expect(uploadReceipt('user-1', asset({ uri: 'file:///receipt.gif' }))).rejects.toThrow('Unsupported receipt image format.')
    await expect(uploadReceipt('user-1', asset({ fileSize: 10 * 1024 * 1024 + 1 }))).rejects.toThrow('Receipt image must not exceed 10 MB.')
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('lists only files with identifiers and signs each user-scoped receipt', async () => {
    mockList.mockResolvedValue({ data: [
      { id: 'file-1', name: 'receipt.jpg', created_at: '2026-11-17' },
      { name: 'placeholder' },
    ], error: null })
    await expect(getUserReceipts('user-1')).resolves.toEqual([
      { path: 'user-1/receipt.jpg', fileName: 'receipt.jpg', signedUrl: 'https://example.invalid/signed', createdAt: '2026-11-17' },
    ])
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('user-1/receipt.jpg', 3600)
  })

  it('deletes a selected receipt and treats an empty path as a no-op', async () => {
    await deleteReceipt('user-1/receipt.jpg')
    expect(mockRemove).toHaveBeenCalledWith(['user-1/receipt.jpg'])
    mockRemove.mockClear()
    await deleteReceipt('')
    expect(mockRemove).not.toHaveBeenCalled()
  })

  it('invokes the recognition function and rejects missing paths or invalid service responses', async () => {
    await expect(recognizeReceipt('user-1/receipt.jpg')).resolves.toMatchObject({ success: true, text: 'TOTAL 12.00' })
    expect(mockInvoke).toHaveBeenCalledWith('recognize-receipt', { body: { path: 'user-1/receipt.jpg' } })
    await expect(recognizeReceipt('')).rejects.toThrow('A receipt path is required for OCR.')
    mockInvoke.mockResolvedValueOnce({ data: null, error: null })
    await expect(recognizeReceipt('user-1/no-result.jpg')).rejects.toThrow('invalid response')
  })
})
