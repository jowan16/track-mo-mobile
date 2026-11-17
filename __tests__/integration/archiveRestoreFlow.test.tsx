import React, { act } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals'

const mockAlert = jest.fn<(...args: any[]) => any>()
const mockFrom = jest.fn<(...args: any[]) => any>()
let mockExpenseSelections: unknown[] = []
const mockOperations: Array<{ table: string; operation: string; filters: unknown[] }> = []

jest.mock('@/services/supabase', () => ({ supabase: { from: (...args: unknown[]) => mockFrom(...args), channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel: jest.fn() } }))
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ profile: { id: 'owner-1' } }) }))
jest.mock('@/context/ThemeContext', () => ({ useAppTheme: () => ({ resolvedTheme: 'light' }) }))
jest.mock('@/components/CategoryIcon', () => ({ CategoryIcon: () => null }))
jest.mock('@/components/user-navigation', () => {
  const ReactModule = require('react')
  return { UserPageHeader: ({ title }: { title: string }) => ReactModule.createElement('h1', null, title) }
})
jest.mock('react-native-safe-area-context', () => {
  const ReactModule = require('react')
  return { SafeAreaView: ({ children }: { children: React.ReactNode }) => ReactModule.createElement('main', null, children) }
})
jest.mock('react-native', () => {
  const ReactModule = require('react')
  return {
    ActivityIndicator: () => ReactModule.createElement('span', null, 'Loading'),
    Alert: { alert: (...args: unknown[]) => mockAlert(...args) },
    Pressable: ({ children, onPress, disabled, accessibilityRole }: { children: React.ReactNode; onPress?: () => void; disabled?: boolean; accessibilityRole?: string }) => ReactModule.createElement('button', { onClick: onPress, disabled, role: accessibilityRole }, children),
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

function createQuery(table: string) {
  let operation = 'select'
  const filters: unknown[] = []
  const query = {
    select: jest.fn(() => { operation = 'select'; return query }),
    order: jest.fn(() => query),
    eq: jest.fn((...args: unknown[]) => { filters.push(args); return query }),
    update: jest.fn(() => { operation = 'update'; return query }),
    delete: jest.fn(() => { operation = 'delete'; return query }),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
      mockOperations.push({ table, operation, filters: [...filters] })
      const value = operation === 'select'
        ? (table === 'categories' ? { data: [{ id: 5, name: 'Food', icon: 'food', color: '#123456', bg: '#eeeeee' }], error: null }
          : table === 'expenses' ? { data: mockExpenseSelections.shift() ?? [], error: null }
            : { data: [], error: null })
        : { data: null, error: null }
      return Promise.resolve(value).then(resolve, reject)
    },
  }
  return query
}

beforeAll(() => {
  const { JSDOM } = require('jsdom') as { JSDOM: new (html: string, options: { url: string }) => { window: Window & typeof globalThis } }
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' })
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, navigator: dom.window.navigator })
  ;({ createRoot } = require('react-dom/client') as { createRoot: (node: Element) => Root })
})

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  mockExpenseSelections = [[{ id: 'expense-1', user_id: 'owner-1', category_id: 5, amount: 245, spent_on: '2026-11-16', payment_method: 'Cash', note: 'Archived lunch', is_archived: true }], []]
  mockOperations.length = 0
  mockFrom.mockImplementation((table: string) => createQuery(table))
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  if (root) await act(async () => root.unmount())
  document.body.innerHTML = ''
  jest.clearAllMocks()
})

describe('archive restore workflow', () => {
  it('loads only the signed-in user archive and restores an expense through the filtered update', async () => {
    const { default: Archive } = require('@/app/(user)/archive') as typeof import('@/app/(user)/archive')
    await act(async () => { root.render(React.createElement(Archive)); await Promise.resolve(); await Promise.resolve() })
    expect(host.textContent).toContain('Archived expenses')
    expect(host.textContent).toContain('Archived lunch')

    const restore = [...host.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Restore')
    await act(async () => { restore?.click(); await Promise.resolve() })
    const dialogButtons = mockAlert.mock.calls[0]?.[2] as Array<{ text: string; onPress?: () => unknown }>
    const confirm = dialogButtons.find((button) => button.text === 'Restore')
    await act(async () => { await confirm?.onPress?.(); await Promise.resolve(); await Promise.resolve() })

    const update = mockOperations.find((entry) => entry.table === 'expenses' && entry.operation === 'update')
    expect(update).toBeDefined()
    expect(update?.filters).toEqual([['id', 'expense-1'], ['user_id', 'owner-1'], ['is_archived', true]])
    expect(host.textContent).toContain('No archived expenses.')
    expect(mockAlert).toHaveBeenCalledWith('Restored', expect.stringContaining('successfully'))
  })
})
