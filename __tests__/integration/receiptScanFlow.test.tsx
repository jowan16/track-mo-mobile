import React, { act } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals'

const mockRequestLibrary = jest.fn<(...args: any[]) => any>()
const mockLaunchLibrary = jest.fn<(...args: any[]) => any>()
const mockScanImage = jest.fn<(...args: any[]) => any>()
const mockStorageUpload = jest.fn<(...args: any[]) => any>()
const mockInvoke = jest.fn<(...args: any[]) => any>()
const mockRouterPush = jest.fn<(...args: any[]) => any>()
const mockAlert = jest.fn<(...args: any[]) => any>()
const mockFetch = jest.fn<(...args: any[]) => any>()
const mockStorage = { upload: (...args: unknown[]) => mockStorageUpload(...args) }

jest.mock('@/services/supabase', () => ({
  supabase: {
    storage: { from: jest.fn(() => mockStorage) },
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  },
}))
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestMediaLibraryPermissionsAsync: (...args: unknown[]) => mockRequestLibrary(...args),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchLibrary(...args),
}))
jest.mock('expo-camera', () => ({ Camera: { scanFromURLAsync: (...args: unknown[]) => mockScanImage(...args) } }))
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockRouterPush(...args) } }))
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ profile: { id: 'user-42' } }) }))
jest.mock('@/context/ThemeContext', () => ({ useAppTheme: () => ({ resolvedTheme: 'light' }) }))
jest.mock('@/components/user-navigation', () => ({ UserMenuButton: () => null }))
jest.mock('react-native-safe-area-context', () => {
  const ReactModule = require('react')
  return { SafeAreaView: ({ children }: { children: React.ReactNode }) => ReactModule.createElement('div', null, children) }
})
jest.mock('react-native', () => {
  const ReactModule = require('react')
  return {
    ActivityIndicator: () => ReactModule.createElement('span', null, 'Loading'),
    Alert: { alert: (...args: unknown[]) => mockAlert(...args) },
    Image: () => ReactModule.createElement('img'),
    Pressable: ({ children, onPress, disabled }: { children: React.ReactNode; onPress?: () => void; disabled?: boolean }) => ReactModule.createElement('button', { onClick: onPress, disabled }, children),
    ScrollView: ({ children }: { children: React.ReactNode }) => ReactModule.createElement('section', null, children),
    StyleSheet: { create: (styles: unknown) => styles },
    Text: ({ children }: { children: React.ReactNode }) => ReactModule.createElement('span', null, children),
    View: ({ children }: { children: React.ReactNode }) => ReactModule.createElement('div', null, children),
  }
})

type Root = { render(node: React.ReactNode): void; unmount(): void }
let host: HTMLDivElement
let root: Root
let createRoot: (node: Element) => Root

beforeAll(() => {
  const { JSDOM } = require('jsdom') as { JSDOM: new (html: string, options: { url: string }) => { window: Window & typeof globalThis } }
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' })
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, navigator: dom.window.navigator })
  ;({ createRoot } = require('react-dom/client') as { createRoot: (node: Element) => Root })
})

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  mockRequestLibrary.mockResolvedValue({ granted: true })
  mockLaunchLibrary.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///receipt.jpg', mimeType: 'image/jpeg', fileName: 'receipt.jpg', fileSize: 100 }] })
  mockScanImage.mockResolvedValue([{ data: JSON.stringify({ bank: 'GCash', amount: '450.00', status: 'SUCCESS', merchant: 'Tindahan' }) }])
  mockStorageUpload.mockResolvedValue({ data: { path: 'user-42/receipt.jpg' }, error: null })
  mockInvoke.mockResolvedValue({ data: { success: true, model: 'mock-ocr', text: 'THE SM STORE\nPAYMENT SUCCESSFUL\nAmount Paid PHP 450.00\n2026-11-17', detections: [], usage: null }, error: null })
  Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: mockFetch })
  mockFetch.mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(12) })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  if (root) await act(async () => root.unmount())
  document.body.innerHTML = ''
  jest.restoreAllMocks()
  jest.clearAllMocks()
})

async function renderScreen() {
  const { default: ScanReceipt } = require('@/app/(user)/scan-receipt') as typeof import('@/app/(user)/scan-receipt')
  await act(async () => root.render(React.createElement(ScanReceipt)))
}

describe('receipt scan to expense review flow', () => {
  it('connects gallery selection, receipt upload, QR/OCR recognition, parsing, and expense review navigation', async () => {
    await renderScreen()
    const gallery = [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('Upload from Gallery'))
    await act(async () => { gallery?.click(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })

    expect(mockLaunchLibrary).toHaveBeenCalledWith(expect.objectContaining({ allowsEditing: true, quality: 1 }))
    expect(mockStorageUpload).toHaveBeenCalledWith(expect.stringMatching(/^user-42\//), expect.any(ArrayBuffer), expect.objectContaining({ contentType: 'image/jpeg' }))
    expect(mockInvoke).toHaveBeenCalledWith('recognize-receipt', { body: { path: expect.stringMatching(/^user-42\//) } })
    expect(mockScanImage).toHaveBeenCalledWith('file:///receipt.jpg', ['qr'])
    expect(mockRouterPush).toHaveBeenCalledWith(expect.objectContaining({
      pathname: '/(user)/expenses',
      params: expect.objectContaining({ receiptSource: 'qr', receiptModel: 'mock-ocr' }),
    }))
    const routeParams = mockRouterPush.mock.calls[0][0].params as Record<string, string>
    expect(JSON.parse(routeParams.receiptDraft)).toMatchObject({
      receipt_type: 'payment',
      transaction_status: 'Successful',
      total: 450,
    })
  })

  it('shows a permission prompt and does not launch the picker when access is denied', async () => {
    mockRequestLibrary.mockResolvedValueOnce({ granted: false })
    await renderScreen()
    const gallery = [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('Upload from Gallery'))
    await act(async () => { gallery?.click(); await Promise.resolve() })
    expect(mockAlert).toHaveBeenCalledWith('Permission required', expect.stringContaining('photo library'))
    expect(mockLaunchLibrary).not.toHaveBeenCalled()
    expect(mockStorageUpload).not.toHaveBeenCalled()
  })
})
