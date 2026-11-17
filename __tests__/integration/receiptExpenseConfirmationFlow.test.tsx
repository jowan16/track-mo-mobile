import React, { act } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals'

const mockFrom = jest.fn<(...args: any[]) => any>()
const mockRpc = jest.fn<(...args: any[]) => any>()
const mockAlert = jest.fn<(...args: any[]) => any>()
const mockQueries: Array<{ table: string; mode: string; payload?: unknown; filters: unknown[] }> = []
const mockQueryData: Record<string, unknown> = {}
const mockParams: Record<string, string> = {}
const mockChannel = { on: jest.fn(() => mockChannel), subscribe: jest.fn(() => mockChannel) }
const mockWithValidSession = (request: () => Promise<unknown>) => request()

jest.mock('@/services/supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args), rpc: (...args: unknown[]) => mockRpc(...args), channel: () => mockChannel, removeChannel: jest.fn() },
  withValidSession: (request: () => Promise<unknown>) => mockWithValidSession(request),
}))
jest.mock('expo-router', () => ({ router: { setParams: jest.fn() }, useLocalSearchParams: () => mockParams }))
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ profile: { id: 'owner-2' } }) }))
jest.mock('@/context/ThemeContext', () => ({ useAppTheme: () => ({ resolvedTheme: 'light' }) }))
jest.mock('@/components/CategoryIcon', () => ({ CategoryIcon: () => null }))
jest.mock('@/components/user-navigation', () => ({ UserPageHeader: () => null }))
jest.mock('react-native-safe-area-context', () => {
  const ReactModule = require('react')
  return { SafeAreaView: ({ children }: { children: React.ReactNode }) => ReactModule.createElement('main', null, children) }
})
jest.mock('react-native', () => {
  const ReactModule = require('react')
  return {
    ActivityIndicator: () => ReactModule.createElement('span', null, 'Loading'),
    Alert: { alert: (...args: unknown[]) => mockAlert(...args) },
    KeyboardAvoidingView: ({ children }: { children: React.ReactNode }) => ReactModule.createElement('div', null, children),
    Modal: ({ children, visible }: { children: React.ReactNode; visible: boolean }) => visible ? ReactModule.createElement('div', null, children) : null,
    Platform: { OS: 'web' },
    Pressable: ({ children, onPress, disabled }: { children: React.ReactNode; onPress?: () => void; disabled?: boolean }) => ReactModule.createElement('button', { onClick: onPress, disabled }, children),
    RefreshControl: () => null,
    ScrollView: ({ children }: { children: React.ReactNode }) => ReactModule.createElement('section', null, children),
    StyleSheet: { create: (styles: unknown) => styles },
    Text: ({ children }: { children: React.ReactNode }) => ReactModule.createElement('span', null, children),
    TextInput: ({ value, placeholder }: { value?: string; placeholder?: string }) => ReactModule.createElement('input', { value, placeholder, readOnly: true }),
    View: ({ children }: { children: React.ReactNode }) => ReactModule.createElement('div', null, children),
  }
})

type Root = { render(node: React.ReactNode): void; unmount(): void }
let host: HTMLDivElement
let root: Root
let createRoot: (node: Element) => Root

function query(table: string) {
  let mode = 'select'
  let payload: unknown
  const filters: unknown[] = []
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'order', 'gte', 'lt', 'is']) {
    builder[method] = (...args: unknown[]) => { if (method !== 'select') filters.push([method, ...args]); return builder }
  }
  builder.insert = (value: unknown) => { mode = 'insert'; payload = value; return builder }
  builder.update = (value: unknown) => { mode = 'update'; payload = value; return builder }
  builder.single = () => builder
  builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
    mockQueries.push({ table, mode, payload, filters })
    return Promise.resolve(mode === 'select' ? mockQueryData[table] : { data: null, error: null }).then(resolve, reject)
  }
  return builder
}

beforeAll(() => {
  const { JSDOM } = require('jsdom') as { JSDOM: new (html: string, options: { url: string }) => { window: Window & typeof globalThis } }
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' })
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, navigator: dom.window.navigator })
  ;({ createRoot } = require('react-dom/client') as { createRoot: (node: Element) => Root })
})

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  Object.assign(mockParams, {
    receiptDraft: JSON.stringify({ merchant_name: 'SM Store', receipt_date: '2026-11-17', subtotal: null, tax: null, total: 125.5, items: [], suggestedCategory: 'Shopping', payment_method: 'E-wallet', bank_name: 'GCash', transaction_status: 'Successful', receipt_type: 'payment' }),
    receiptSource: 'qr', receiptPath: 'owner-2/receipt.jpg', receiptModel: 'qr-code', receiptRawText: '{"bank":"GCash"}', receiptQrPayload: '{"bank":"GCash"}',
  })
  mockQueryData.categories = { data: [{ id: 3, name: 'Shopping', icon: 'bag', color: '#123456', bg: '#eeeeee', is_active: true, sort_order: 1 }], error: null }
  mockQueryData.user_categories = { data: [{ category_id: 3 }], error: null }
  mockQueryData.expenses = { data: [], error: null }
  mockQueryData.budgets = { data: [], error: null }
  mockFrom.mockImplementation((table: string) => query(table))
  mockRpc.mockResolvedValue({ data: 'receipt-1', error: null })
  mockQueries.length = 0
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  if (root) await act(async () => root.unmount())
  document.body.innerHTML = ''
  Object.keys(mockParams).forEach((key) => delete mockParams[key])
  jest.clearAllMocks()
})

describe('receipt review and confirmed expense save', () => {
  it('validates the recognized draft and sends the confirmed receipt and expense to the save RPC', async () => {
    const { default: Expenses } = require('@/app/(user)/expenses') as typeof import('@/app/(user)/expenses')
    await act(async () => { root.render(React.createElement(Expenses)); await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
    expect(host.textContent).toContain('Review and edit the receipt details')
    expect([...host.querySelectorAll('input')].map((input) => input.value)).toEqual(expect.arrayContaining(['GCash', '125.5']))

    const save = [...host.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Add Expense')
    await act(async () => { save?.click(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
    expect(mockRpc).toHaveBeenCalledWith('save_receipt_expense', expect.objectContaining({
      p_storage_path: 'owner-2/receipt.jpg',
      p_category_id: 3,
      p_amount: 125.5,
      p_payment_method: 'E-wallet',
      p_recognition_data: expect.objectContaining({ source: 'qr', model: 'qr-code', bank_name: 'GCash', transaction_status: 'Successful' }),
    }))
    expect(mockAlert).toHaveBeenCalledWith('Success', 'Your scanned receipt and expense have been saved.')
  })
})
