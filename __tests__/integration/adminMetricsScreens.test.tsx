import React, { act } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals'

type TestRoot = { render(node: React.ReactNode): void; unmount(): void }

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mockRpc = jest.fn<(...args: any[]) => any>()
const mockFrom = jest.fn<(...args: any[]) => any>()
const mockWriteFile = jest.fn<(...args: any[]) => any>()
const mockPrint = jest.fn<(...args: any[]) => any>()
const mockShare = jest.fn<(...args: any[]) => any>()
const mockAlert = jest.fn<(...args: any[]) => any>()
let mockRpcQueues: Record<string, unknown[]> = {}
let mockTableResults: Record<string, unknown> = {}
let createRoot: (container: Element) => TestRoot

jest.mock('@/services/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  },
}))

jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ profile: { full_name: 'Test Admin' } }) }))

jest.mock('expo-router', () => {
  const ReactModule = require('react')
  return { useFocusEffect: (callback: () => void) => ReactModule.useEffect(callback, [callback]) }
})

jest.mock('@/components/admin/AdminShell', () => {
  const ReactModule = require('react')
  return {
    AdminShell: ({ title, children }: { title: string; children: React.ReactNode }) =>
      ReactModule.createElement('main', null,
        ReactModule.createElement('h1', null, title), children),
    adminColors: { primary: '#000', muted: '#666', danger: '#c00', border: '#ddd', text: '#111' },
  }
})

jest.mock('react-native', () => {
  const ReactModule = require('react')
  return {
    ActivityIndicator: () => ReactModule.createElement('span', null, 'Loading'),
    Alert: { alert: (...args: unknown[]) => mockAlert(...args) },
    Pressable: ({ children, onPress, disabled, accessibilityLabel }: {
      children: React.ReactNode; onPress?: () => void; disabled?: boolean; accessibilityLabel?: string
    }) => ReactModule.createElement('button', { onClick: onPress, disabled, 'aria-label': accessibilityLabel }, children),
    Share: { share: (...args: unknown[]) => mockShare(...args) },
    StyleSheet: { create: (styles: unknown) => styles },
    Text: ({ children }: { children: React.ReactNode }) => ReactModule.createElement('span', null, children),
    View: ({ children }: { children: React.ReactNode }) => ReactModule.createElement('div', null, children),
  }
})

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: '/tmp/',
  EncodingType: { UTF8: 'utf8' },
  writeAsStringAsync: (...args: unknown[]) => mockWriteFile(...args),
}))
jest.mock('expo-print', () => ({ printToFileAsync: (...args: unknown[]) => mockPrint(...args) }))
jest.mock('expo-sharing', () => ({ isAvailableAsync: async () => false, shareAsync: jest.fn() }))

const validReport = [{ new_users: 3, expenses_count: 12, active_users: 2 }]
const validTop = [{ category_id: 7, uses: 4 }]
const validGrowth = [
  { label: 'Jan 2026', total: 1 },
  { label: 'Feb 2026', total: 2 },
  { label: 'Mar 2026', total: 3 },
  { label: 'Apr 2026', total: 4 },
  { label: 'May 2026', total: 5 },
  { label: 'Jun 2026', total: 6 },
]
const validAdmin = [{ total_users: 9, active_users: 2, admins: 1, expenses_count: 20 }]
const validCategories = [{ id: 7, name: 'Food', icon: 'restaurant', color: '#123456' }]

function thenableQuery(table: string) {
  const query = {
    select: jest.fn(() => query),
    order: jest.fn(() => query),
    limit: jest.fn(() => query),
    eq: jest.fn(() => query),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(mockTableResults[table]).then(resolve, reject),
  }
  return query
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

function setupResponses() {
  mockRpcQueues = {
    admin_period_stats: [{ data: validReport, error: null }],
    admin_top_categories: [{ data: validTop, error: null }],
    admin_user_growth: [{ data: validGrowth, error: null }],
    admin_stats: [{ data: validAdmin, error: null }],
  }
  mockTableResults = {
    categories: { data: validCategories, error: null },
    profiles: { data: [], error: null },
  }
  mockRpc.mockImplementation((name: string) => {
    const queue = mockRpcQueues[name]
    const defaults: Record<string, unknown> = {
      admin_period_stats: { data: validReport, error: null },
      admin_top_categories: { data: validTop, error: null },
      admin_user_growth: { data: validGrowth, error: null },
      admin_stats: { data: validAdmin, error: null },
    }
    const next = queue?.length ? queue.shift() : defaults[name] ?? { data: [], error: null }
    return Promise.resolve(next)
  })
  mockFrom.mockImplementation((table: string) => thenableQuery(table))
  mockWriteFile.mockResolvedValue(undefined)
  mockPrint.mockResolvedValue({ uri: '/tmp/report.pdf' })
  mockShare.mockResolvedValue(undefined)
}

let host: HTMLDivElement
let root: TestRoot

beforeAll(() => {
  const { JSDOM } = require('jsdom') as { JSDOM: new (html: string, options: { url: string }) => { window: Window & typeof globalThis } }
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' })
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
  })
  ;({ createRoot } = require('react-dom/client') as { createRoot: (container: Element) => TestRoot })
})

async function renderScreen(Screen: React.ComponentType) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root.render(React.createElement(Screen))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function clickButton(label: string) {
  const button = [...host.querySelectorAll('button')].find((item) =>
    item.getAttribute('aria-label') === label || item.textContent?.includes(label))
  if (!button) throw new Error(`Button not found: ${label}`)
  await act(async () => {
    button.click()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

afterEach(async () => {
  if (root) await act(async () => root.unmount())
  document.body.innerHTML = ''
  jest.clearAllMocks()
})

beforeEach(() => setupResponses())

describe('Admin System Reports screen validation and retry', () => {
  it.each([
    ['admin_top_categories', [{ category_id: '7', uses: 4 }]],
    ['admin_user_growth', validGrowth.map((row, index) => index === 0 ? { label: '   ', total: row.total } : row)],
  ])('hides report data and blocks both exports for invalid %s data', async (rpcName, rows) => {
    mockRpcQueues[rpcName] = [{ data: rows, error: null }]
    const { default: Reports } = require('@/app/(admin)/reports') as typeof import('@/app/(admin)/reports')
    await renderScreen(Reports)

    expect(host.textContent).toContain('invalid report data')
    expect(host.textContent).not.toContain('New users')
    expect(host.querySelector('button[aria-label="Export CSV"]')).toBeNull()
    expect(host.querySelector('button[aria-label="Export PDF"]')).toBeNull()
    expect(mockWriteFile).not.toHaveBeenCalled()
    expect(mockPrint).not.toHaveBeenCalled()
  })

  it('retries the currently selected period and displays valid report data', async () => {
    let resolveRetry!: (value: unknown) => void
    mockRpcQueues.admin_period_stats = [
      { data: null, error: { message: 'temporary failure' } },
      new Promise((resolve) => { resolveRetry = resolve }),
    ]
    const { default: Reports } = require('@/app/(admin)/reports') as typeof import('@/app/(admin)/reports')
    await renderScreen(Reports)
    const firstPeriodCall = mockRpc.mock.calls.find(([name]) => name === 'admin_period_stats')
    expect(firstPeriodCall).toBeDefined()
    const retryButton = host.querySelector<HTMLButtonElement>('button[aria-label="Retry system reports"]')
    expect(retryButton).not.toBeNull()
    await act(async () => {
      retryButton?.click()
      retryButton?.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const periodCalls = mockRpc.mock.calls.filter(([name]) => name === 'admin_period_stats')
    expect(periodCalls).toHaveLength(2)
    expect(periodCalls[1]).toEqual(firstPeriodCall)
    expect(host.textContent).toContain('Loading')
    expect(host.querySelector('button[aria-label="Retry system reports"]')).toBeNull()

    await act(async () => {
      resolveRetry({ data: validReport, error: null })
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(host.textContent).toContain('New users')
    expect(host.textContent).toContain('12')
    expect(host.textContent).toContain('Food')
    expect(host.textContent).toContain('Jun 2026')
  })

  it('keeps newer period results when overlapping requests resolve out of order', async () => {
    const periodA = deferred<unknown>()
    const periodB = deferred<unknown>()
    mockRpcQueues.admin_period_stats = [periodA.promise, periodB.promise]
    const { default: Reports } = require('@/app/(admin)/reports') as typeof import('@/app/(admin)/reports')

    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => {
      root.render(React.createElement(Reports))
    })

    const periodButtons = [...host.querySelectorAll('button')]
    const periodAButton = periodButtons.find((button) => button.textContent === 'This month')
    const periodBButton = periodButtons.find((button) => button.textContent === 'Last month')
    expect(periodAButton).toBeDefined()
    expect(periodBButton).toBeDefined()

    let periodCalls = mockRpc.mock.calls.filter(([name]) => name === 'admin_period_stats')
    expect(periodCalls).toHaveLength(1)

    await act(async () => {
      periodBButton?.click()
    })

    periodCalls = mockRpc.mock.calls.filter(([name]) => name === 'admin_period_stats')
    expect(periodCalls).toHaveLength(2)
    expect(periodCalls[0][1]).not.toEqual(periodCalls[1][1])

    await act(async () => {
      periodB.resolve({
        data: [{ new_users: 222, expenses_count: 23, active_users: 4 }],
        error: null,
      })
      await periodB.promise
    })
    expect(host.textContent).toContain('222')
    expect(host.textContent).toContain('23')
    expect(host.textContent).not.toContain('111')

    await act(async () => {
      periodA.resolve({
        data: [{ new_users: 111, expenses_count: 11, active_users: 1 }],
        error: null,
      })
      await periodA.promise
    })

    expect(host.textContent).toContain('Last month')
    expect(host.textContent).toContain('222')
    expect(host.textContent).toContain('23')
    expect(host.textContent).not.toContain('111')
    expect(host.textContent).not.toContain('11')
  })

  it('exports the same validated summary and chart data shown on screen', async () => {
    const { default: Reports } = require('@/app/(admin)/reports') as typeof import('@/app/(admin)/reports')
    await renderScreen(Reports)
    expect(host.textContent).toContain('12')
    expect(host.textContent).toContain('Food')

    await clickButton('Export CSV')
    expect(mockWriteFile).toHaveBeenCalledTimes(1)
    expect(String(mockWriteFile.mock.calls[0][1])).toContain('"Expenses recorded this month","12"')
    expect(String(mockWriteFile.mock.calls[0][1])).toContain('"Jun 2026","6"')
    expect(String(mockWriteFile.mock.calls[0][1])).toContain('"Food","4"')

    await clickButton('Export PDF')
    expect(mockPrint).toHaveBeenCalledTimes(1)
    const html = String((mockPrint.mock.calls[0][0] as { html: string }).html)
    expect(html).toContain('>12</strong>')
    expect(html).toContain('Jun 2026')
    expect(html).toContain('Food')
  })
})

describe('Admin Overview stale metrics', () => {
  it('suppresses stale counts on a query failure and restores them after retry succeeds', async () => {
    const { default: Overview } = require('@/app/(admin)/index') as typeof import('@/app/(admin)/index')
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    await renderScreen(Overview)
    expect(host.textContent).toContain('9')

    mockTableResults.profiles = { data: null, error: { message: 'profiles unavailable' } }
    await clickButton('Refresh overview')
    expect(host.textContent).toContain('Unable to load admin overview.')
    expect(host.textContent).not.toContain('20')

    mockTableResults.profiles = { data: [], error: null }
    await clickButton('Refresh overview')
    expect(host.textContent).not.toContain('Unable to load admin overview.')
    expect(host.textContent).toContain('9')
    expect(host.textContent).toContain('20')
  })

  it.each(['admin_stats', 'categories'])('suppresses counts when the %s query fails', async (queryName) => {
    const { default: Overview } = require('@/app/(admin)/index') as typeof import('@/app/(admin)/index')
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    await renderScreen(Overview)
    expect(host.textContent).toContain('20')

    if (queryName === 'admin_stats') {
      mockRpcQueues.admin_stats = [{ data: null, error: { message: 'statistics unavailable' } }]
    } else {
      mockTableResults.categories = { data: null, error: { message: 'categories unavailable' } }
    }
    await clickButton('Refresh overview')
    expect(host.textContent).toContain('Unable to load admin overview.')
    expect(host.textContent).not.toContain('20')
  })
})
