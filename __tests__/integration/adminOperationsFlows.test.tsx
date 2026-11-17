import React, { act } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals'

const mockFrom = jest.fn<(...args: any[]) => any>()
const mockRpc = jest.fn<(...args: any[]) => any>()
const mockAlert = jest.fn<(...args: any[]) => any>()
const mockCalls: Array<{ table: string; operation: string; payload?: unknown; filters: unknown[] }> = []
let mockProfiles: Array<Record<string, unknown>> = []
let mockCategories: Array<Record<string, unknown>> = []
let mockAudit: Array<Record<string, unknown>> = []
const mockChannel = { on: jest.fn(() => mockChannel), subscribe: jest.fn(() => mockChannel) }

jest.mock('@/services/supabase', () => ({ supabase: { from: (...args: unknown[]) => mockFrom(...args), rpc: (...args: unknown[]) => mockRpc(...args), channel: () => mockChannel, removeChannel: jest.fn() } }))
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ profile: { id: 'admin-1', full_name: 'Admin One', email: 'admin@example.com' } }) }))
jest.mock('@/components/CategoryIcon', () => ({ CategoryIcon: () => null, CATEGORY_ICON_OPTIONS: [{ key: 'coins', name: 'Coins', group: 'Financial' }] }))
jest.mock('@/components/admin/AdminShell', () => {
  const ReactModule = require('react')
  return { AdminShell: ({ title, children }: { title: string; children: React.ReactNode }) => ReactModule.createElement('main', null, ReactModule.createElement('h1', null, title), children), adminColors: { primary: '#123456', muted: '#666', danger: '#c00', border: '#ddd', text: '#111' } }
})
jest.mock('react-native', () => {
  const ReactModule = require('react')
  return {
    ActivityIndicator: () => ReactModule.createElement('span', null, 'Loading'),
    Alert: { alert: (...args: unknown[]) => mockAlert(...args) },
    Modal: ({ children, visible }: { children: React.ReactNode; visible: boolean }) => visible ? ReactModule.createElement('div', null, children) : null,
    Pressable: ({ children, onPress, disabled, accessibilityLabel }: { children: React.ReactNode; onPress?: () => void; disabled?: boolean; accessibilityLabel?: string }) => ReactModule.createElement('button', { onClick: onPress, disabled, 'aria-label': accessibilityLabel }, children),
    ScrollView: ({ children }: { children: React.ReactNode }) => ReactModule.createElement('section', null, children),
    StyleSheet: { create: (styles: unknown) => styles },
    Switch: ({ value, onValueChange }: { value: boolean; onValueChange?: (value: boolean) => void }) => ReactModule.createElement('input', { type: 'checkbox', checked: value, onChange: (event: { target: { checked: boolean } }) => onValueChange?.(event.target.checked) }),
    Text: ({ children }: { children: React.ReactNode }) => ReactModule.createElement('span', null, children),
    TextInput: ({ value, placeholder, onChangeText, accessibilityLabel }: { value?: string; placeholder?: string; onChangeText?: (value: string) => void; accessibilityLabel?: string }) => ReactModule.createElement('input', { value, placeholder, 'aria-label': accessibilityLabel, onChange: (event: { target: { value: string } }) => onChangeText?.(event.target.value) }),
    View: ({ children }: { children: React.ReactNode }) => ReactModule.createElement('div', null, children),
  }
})

type Root = { render(node: React.ReactNode): void; unmount(): void }
let host: HTMLDivElement
let root: Root
let createRoot: (node: Element) => Root

function query(table: string) {
  let operation = 'select'
  let payload: unknown
  const filters: unknown[] = []
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'order', 'eq', 'is']) {
    builder[method] = (...args: unknown[]) => { if (method !== 'select') filters.push([method, ...args]); return builder }
  }
  builder.insert = (value: unknown) => { operation = 'insert'; payload = value; return builder }
  builder.update = (value: unknown) => { operation = 'update'; payload = value; return builder }
  builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
    mockCalls.push({ table, operation, payload, filters })
    let data: unknown = null
    if (operation === 'select') {
      data = table === 'profiles' ? mockProfiles : table === 'categories' ? mockCategories : table === 'audit_log' ? mockAudit : []
    } else if (operation === 'insert' && table === 'categories') {
      const row = payload as Record<string, unknown>
      mockCategories = [...mockCategories, { id: 8, slug: 'transport-test', icon: 'coins', bg: '#0F766E22', is_active: true, sort_order: 2, ...row }]
    } else if (operation === 'insert' && table === 'audit_log') {
      mockAudit = [...mockAudit, payload as Record<string, unknown>]
    }
    return Promise.resolve({ data, error: null }).then(resolve, reject)
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
  mockProfiles = [{ id: 'user-1', full_name: 'Kai Santos', email: 'kai@example.com', role: 'user', status: 'active', created_at: '2026-11-01T00:00:00Z', last_seen_at: null }]
  mockCategories = [{ id: 5, slug: 'food', name: 'Food', icon: 'coins', color: '#0F766E', bg: '#0F766E22', is_active: true, show_in_picker: true, sort_order: 1, user_id: null }]
  mockAudit = [{ id: 1, actor_id: 'admin-1', actor_name: 'Admin One', action: 'Suspended user Kai Santos', created_at: new Date().toISOString() }, { id: 2, actor_id: 'admin-1', actor_name: 'Admin One', action: 'Category updated', created_at: new Date().toISOString() }]
  mockCalls.length = 0
  mockFrom.mockImplementation((table: string) => query(table))
  mockRpc.mockImplementation(async (name: string, args?: Record<string, unknown>) => {
    if (name === 'admin_get_user_activity_sessions') return { data: [], error: null }
    if (name === 'admin_set_account_status') {
      mockProfiles = mockProfiles.map((profile) => profile.id === args?.p_target_user_id ? { ...profile, status: args?.p_status } : profile)
    }
    return { data: null, error: null }
  })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  if (root) await act(async () => root.unmount())
  document.body.innerHTML = ''
  jest.clearAllMocks()
})

async function renderModule(path: string) {
  const { default: Screen } = require(path) as { default: React.ComponentType }
  await act(async () => { root.render(React.createElement(Screen)); await Promise.resolve(); await Promise.resolve() })
}

describe('administrator management and audit integrations', () => {
  it('suspends a selected account through the admin RPC and records an audit entry', async () => {
    await renderModule('@/app/(admin)/users')
    expect(host.textContent).toContain('Kai Santos')
    const suspend = host.querySelector<HTMLButtonElement>('button[aria-label="Suspend Kai Santos"]')
    await act(async () => suspend?.click())
    const confirm = [...host.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Confirm')
    await act(async () => { confirm?.click(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
    expect(mockRpc).toHaveBeenCalledWith('admin_set_account_status', { p_target_user_id: 'user-1', p_status: 'suspended' })
    expect(mockCalls).toContainEqual(expect.objectContaining({ table: 'audit_log', operation: 'insert', payload: expect.objectContaining({ actor_id: 'admin-1', action: 'Suspended user Kai Santos' }) }))
    expect(host.textContent).toContain('Suspended')
  })

  it('creates a default category and records the administrator action', async () => {
    await renderModule('@/app/(admin)/categories')
    const add = [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('New category'))
    await act(async () => add?.click())
    const input = host.querySelector<HTMLInputElement>('input[placeholder="Category name"]')
    await act(async () => {
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set
        setter?.call(input, 'Transport')
        const InputEventConstructor = input.ownerDocument.defaultView?.Event
        if (InputEventConstructor) {
          input.dispatchEvent(new InputEventConstructor('input', { bubbles: true }))
          input.dispatchEvent(new InputEventConstructor('change', { bubbles: true }))
        }
      }
    })
    const save = [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('Save changes'))
    await act(async () => { save?.click(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
    expect(mockCalls).toContainEqual(expect.objectContaining({ table: 'categories', operation: 'insert', payload: expect.objectContaining({ name: 'Transport', show_in_picker: true }) }))
    expect(mockCalls).toContainEqual(expect.objectContaining({ table: 'audit_log', operation: 'insert', payload: expect.objectContaining({ action: 'Added category "Transport"' }) }))
    expect(mockAlert).toHaveBeenCalledWith('Saved', 'Category changes have been saved.')
  })

  it('filters audit records between user and category actions', async () => {
    await renderModule('@/app/(admin)/audit')
    expect(host.textContent).toContain('Suspended user Kai Santos')
    const categories = [...host.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Categories')
    await act(async () => categories?.click())
    expect(host.textContent).toContain('Category updated')
    expect(host.textContent).not.toContain('Suspended user Kai Santos')
  })
})
