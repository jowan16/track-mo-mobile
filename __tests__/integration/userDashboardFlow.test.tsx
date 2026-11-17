import React, { act } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals'

const mockFrom = jest.fn<(...args: any[]) => any>()
const mockRows: Record<string, unknown> = {}
const mockQueryCalls: Array<{ table: string; method: string; args: unknown[] }> = []
const mockChannel = { on: jest.fn(() => mockChannel), subscribe: jest.fn(() => mockChannel) }
const mockWithValidSession = async (request: () => Promise<unknown>) => request()

jest.mock('@/services/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    channel: jest.fn(() => mockChannel),
    removeChannel: jest.fn(),
  },
  withValidSession: (request: () => Promise<unknown>) => mockWithValidSession(request),
}))
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ profile: { id: 'owner-7', full_name: 'Kai Santos' }, signOut: jest.fn() }) }))
jest.mock('@/context/ThemeContext', () => ({ useAppTheme: () => ({ resolvedTheme: 'light' }) }))
jest.mock('@/components/CategoryIcon', () => ({ CategoryIcon: () => null }))
jest.mock('@/components/user-navigation', () => {
  const ReactModule = require('react')
  return { UserPageHeader: ({ title }: { title: string }) => ReactModule.createElement('h1', null, title) }
})
jest.mock('expo-linear-gradient', () => {
  const ReactModule = require('react')
  return { LinearGradient: ({ children }: { children: React.ReactNode }) => ReactModule.createElement('div', null, children) }
})
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }))
jest.mock('react-native-safe-area-context', () => {
  const ReactModule = require('react')
  return { SafeAreaView: ({ children }: { children: React.ReactNode }) => ReactModule.createElement('main', null, children) }
})
jest.mock('react-native', () => {
  const ReactModule = require('react')
  return {
    ActivityIndicator: () => ReactModule.createElement('span', null, 'Loading'),
    Alert: { alert: jest.fn() },
    Modal: ({ children, visible }: { children: React.ReactNode; visible: boolean }) => visible ? ReactModule.createElement('div', null, children) : null,
    Pressable: ({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) => ReactModule.createElement('button', { onClick: onPress }, children),
    RefreshControl: () => null,
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

function query(table: string) {
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'order', 'gte', 'lt']) {
    builder[method] = (...args: unknown[]) => {
      mockQueryCalls.push({ table, method, args })
      return builder
    }
  }
  builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(mockRows[table]).then(resolve, reject)
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
  const today = new Date()
  const spentOn = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  mockRows.categories = { data: [
    { id: 1, name: 'Food', icon: 'food', color: '#123456', bg: '#eeeeee', is_active: true, sort_order: 1, show_in_picker: true },
    { id: 2, name: 'Transport', icon: 'bus', color: '#234567', bg: '#eeeeee', is_active: true, sort_order: 2, show_in_picker: true },
  ], error: null }
  mockRows.user_categories = { data: [{ category_id: 1 }, { category_id: 2 }], error: null }
  mockRows.expenses = { data: [
    { id: 'e1', user_id: 'owner-7', category_id: 1, amount: '400', spent_on: spentOn, is_archived: false, created_at: `${spentOn}T10:00:00Z` },
    { id: 'e2', user_id: 'owner-7', category_id: 2, amount: '300', spent_on: spentOn, is_archived: false, created_at: `${spentOn}T11:00:00Z` },
  ], error: null }
  mockRows.budgets = { data: [{ id: 'b1', user_id: 'owner-7', category_id: 1, amount: '1000', is_archived: false }], error: null }
  mockQueryCalls.length = 0
  mockFrom.mockImplementation((table: string) => query(table))
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  if (root) await act(async () => root.unmount())
  document.body.innerHTML = ''
  jest.clearAllMocks()
})

describe('user dashboard and budget data flow', () => {
  it('combines tracked categories, non-archived expenses, and current budgets into dashboard totals', async () => {
    const { default: Dashboard } = require('@/app/(user)/index') as typeof import('@/app/(user)/index')
    await act(async () => { root.render(React.createElement(Dashboard)); await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })

    const text = host.textContent ?? ''
    expect(text).toContain('Total Expense')
    expect(text).toContain('₱ 700.00')
    expect(text).toContain('Budget Remaining')
    expect(text).toContain('₱ 600.00')
    expect(text).toContain('Tracked Categories')
    expect(mockQueryCalls).toContainEqual({ table: 'expenses', method: 'eq', args: ['user_id', 'owner-7'] })
    expect(mockQueryCalls).toContainEqual({ table: 'expenses', method: 'eq', args: ['is_archived', false] })
    expect(mockQueryCalls).toContainEqual({ table: 'budgets', method: 'eq', args: ['user_id', 'owner-7'] })
  })
})
