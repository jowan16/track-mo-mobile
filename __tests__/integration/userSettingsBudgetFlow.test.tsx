import React, { act } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals'

const mockFrom = jest.fn<(...args: any[]) => any>()
const mockProfileUpdate = jest.fn<(...args: any[]) => any>()
const mockRefreshProfile = jest.fn<(...args: any[]) => any>()
const mockAlert = jest.fn<(...args: any[]) => any>()
const mockQueries: Array<{ table: string; method: string; args: unknown[] }> = []
const mockData: Record<string, unknown> = {}
const mockChannel = { on: jest.fn(() => mockChannel), subscribe: jest.fn(() => mockChannel) }

jest.mock('@/services/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: { updateUser: jest.fn(async () => ({ error: null })) },
    channel: () => mockChannel,
    removeChannel: jest.fn(),
  },
}))
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ profile: { id: 'owner-9', full_name: 'Kai Santos', email: 'kai@example.com', warn_80: true, warn_100: true, email_alerts: true }, refreshProfile: (...args: unknown[]) => mockRefreshProfile(...args), signOut: jest.fn() }) }))
jest.mock('@/context/ThemeContext', () => ({ useAppTheme: () => ({ preference: 'system', resolvedTheme: 'light', setPreference: jest.fn() }) }))
jest.mock('@/components/CategoryIcon', () => ({ CategoryIcon: () => null }))
jest.mock('@/components/user-navigation', () => ({ UserPageHeader: () => null, UserMenuButton: () => null }))
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }))
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
    Switch: ({ value, onValueChange }: { value: boolean; onValueChange?: (value: boolean) => void }) => ReactModule.createElement('input', { type: 'checkbox', checked: value, onChange: (event: { target: { checked: boolean } }) => onValueChange?.(event.target.checked) }),
    Text: ({ children }: { children: React.ReactNode }) => ReactModule.createElement('span', null, children),
    TextInput: ({ value, placeholder, onChangeText }: { value?: string; placeholder?: string; onChangeText?: (value: string) => void }) => ReactModule.createElement('input', { value, placeholder, onChange: (event: { target: { value: string } }) => onChangeText?.(event.target.value) }),
    View: ({ children }: { children: React.ReactNode }) => ReactModule.createElement('div', null, children),
  }
})

type Root = { render(node: React.ReactNode): void; unmount(): void }
let host: HTMLDivElement
let root: Root
let createRoot: (node: Element) => Root

function query(table: string) {
  let mode = 'select'
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'order', 'gte', 'lt', 'limit']) {
    builder[method] = (...args: unknown[]) => { if (method === 'select') mode = 'select'; mockQueries.push({ table, method, args }); return builder }
  }
  builder.update = (...args: unknown[]) => { mode = 'update'; mockProfileUpdate(...args); return builder }
  builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(mode === 'select' ? mockData[table] : { data: null, error: null }).then(resolve, reject)
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
  const now = new Date()
  mockData.categories = { data: [{ id: 4, name: 'Food', icon: 'food', color: '#123456', bg: '#eeeeee', is_active: true, sort_order: 1 }], error: null }
  mockData.user_categories = { data: [{ category_id: 4 }], error: null }
  mockData.budgets = { data: [{ id: 'budget-4', user_id: 'owner-9', category_id: 4, amount: '1000', month: now.getMonth() + 1, year: now.getFullYear(), is_archived: false }], error: null }
  mockData.expenses = { data: [{ id: 'expense-4', user_id: 'owner-9', category_id: 4, amount: '800', spent_on: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, is_archived: false }], error: null }
  mockData.budget_alert_notifications = { data: [{ id: 'alert-4', budget_id: 'budget-4', category_id: 4, threshold: 80, budget_month: now.getMonth() + 1, budget_year: now.getFullYear(), budget_amount: '1000', spent_amount: '800', remaining_amount: '200', percentage: '80', title: 'Budget is nearly used', message: '80% used', created_at: now.toISOString() }], error: null }
  mockQueries.length = 0
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

describe('user settings and budget alert workflows', () => {
  it('saves a validated account name to profiles and refreshes the Auth profile', async () => {
    const { default: Settings } = require('@/app/(user)/settings') as typeof import('@/app/(user)/settings')
    await act(async () => root.render(React.createElement(Settings)))
    const save = [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('Save Changes'))
    await act(async () => { save?.click(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
    expect(mockProfileUpdate).toHaveBeenCalledWith({ full_name: 'Kai Santos' })
    expect(mockQueries).toContainEqual({ table: 'profiles', method: 'eq', args: ['id', 'owner-9'] })
    expect(mockRefreshProfile).toHaveBeenCalled()
    expect(mockAlert).toHaveBeenCalledWith('Success', 'Your profile has been updated.')
  })

  it('combines current expenses and saved threshold notifications in the budget warning', async () => {
    const { default: Budgets } = require('@/app/(user)/budgets') as typeof import('@/app/(user)/budgets')
    await act(async () => { root.render(React.createElement(Budgets)); await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
    expect(host.textContent).toContain('Food')
    expect(host.textContent).toContain('Approaching budget limit')
    expect(host.textContent).toContain('80% used')
    expect(host.textContent).toContain('80%')
    expect(mockQueries).toContainEqual({ table: 'budget_alert_notifications', method: 'eq', args: ['user_id', 'owner-9'] })
    expect(mockQueries).toContainEqual({ table: 'expenses', method: 'eq', args: ['is_archived', false] })
  })
})
