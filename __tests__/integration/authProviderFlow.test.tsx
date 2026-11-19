import React, { act } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals'

const mockGetSession = jest.fn<(...args: any[]) => any>()
const mockSignIn = jest.fn<(...args: any[]) => any>()
const mockSignOut = jest.fn<(...args: any[]) => any>()
const mockRefresh = jest.fn<(...args: any[]) => any>()
const mockRpc = jest.fn<(...args: any[]) => any>()
const mockMaybeSingle = jest.fn<(...args: any[]) => any>()
let mockAuthListener: ((event: string, session: unknown) => void) | null = null
let mockSession: any = null
let mockProfile: Record<string, unknown> | null = null
let mockProfileError: unknown = null

const mockProfileQuery = {
  select: jest.fn(() => mockProfileQuery),
  eq: jest.fn(() => mockProfileQuery),
  maybeSingle: (...args: unknown[]) => mockMaybeSingle(...args),
}
const mockChannel = {
  on: jest.fn(() => mockChannel),
  subscribe: jest.fn(() => mockChannel),
}

jest.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      signInWithPassword: (...args: unknown[]) => mockSignIn(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
      refreshSession: (...args: unknown[]) => mockRefresh(...args),
      onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
        mockAuthListener = callback
        return { data: { subscription: { unsubscribe: jest.fn() } } }
      },
    },
    from: jest.fn(() => mockProfileQuery),
    rpc: (...args: unknown[]) => mockRpc(...args),
    channel: jest.fn(() => mockChannel),
    removeChannel: jest.fn(),
  },
}))

jest.mock('react-native', () => {
  return { AppState: { currentState: 'background', addEventListener: () => ({ remove: jest.fn() }) } }
})

import { AuthProvider, useAuth } from '@/context/AuthContext'

type Root = { render(node: React.ReactNode): void; unmount(): void }
let host: HTMLDivElement
let root: Root
let createRoot: (node: Element) => Root

function Probe() {
  const auth = useAuth()
  return React.createElement('div', null,
    React.createElement('span', { 'data-testid': 'status' }, auth.loading ? 'loading' : 'ready'),
    React.createElement('span', { 'data-testid': 'role' }, auth.profile?.role ?? 'signed-out'),
    React.createElement('button', { onClick: () => void auth.signIn(' user@example.com ', 'Passw0rd').catch(() => undefined) }, 'Sign in'),
  )
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
}

beforeAll(() => {
  const { JSDOM } = require('jsdom') as { JSDOM: new (html: string, options: { url: string }) => { window: Window & typeof globalThis } }
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' })
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, navigator: dom.window.navigator })
  ;({ createRoot } = require('react-dom/client') as { createRoot: (node: Element) => Root })
})

beforeEach(() => {
  mockProfile = {
    id: 'user-1',
    role: 'user',
    status: 'active',
    full_name: 'Kai',
  }

  mockProfileError = null
  mockAuthListener = null
  mockSession = null

  mockGetSession.mockImplementation(async () => ({
    data: { session: mockSession },
    error: null,
  }))

  mockSignIn.mockImplementation(async () => {
    const session = {
      user: { id: 'user-1' },
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    }

    mockSession = session
    mockAuthListener?.('SIGNED_IN', session)

    return {
      data: {
        user: {
          id: 'user-1',
          email_confirmed_at: '2026-11-17T00:00:00Z',
        },
        session,
      },
      error: null,
    }
  })

  mockMaybeSingle.mockImplementation(async () => ({
    data: mockProfile,
    error: mockProfileError,
  }))

  mockSignOut.mockImplementation(async () => {
    mockSession = null
    return { error: null }
  })

  mockRefresh.mockResolvedValue({
    data: { session: null },
    error: null,
  })

  mockRpc.mockResolvedValue({ error: null })

  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  if (root) await act(async () => root.unmount())
  document.body.innerHTML = ''
  jest.clearAllMocks()
})

describe('authentication and account access flow', () => {
  it('signs in through Supabase, validates the active profile, and exposes the authorized role', async () => {
    await act(async () => root.render(React.createElement(AuthProvider, null, React.createElement(Probe))))
    await flush()
    await act(async () => { host.querySelector('button')?.click(); await Promise.resolve(); await Promise.resolve() })
    await flush()

    expect(mockSignIn).toHaveBeenCalledWith({ email: 'user@example.com', password: 'Passw0rd' })
    expect(mockMaybeSingle).toHaveBeenCalled()
    expect(host.querySelector('[data-testid="role"]')?.textContent).toBe('user')
  })

  it('rejects a suspended profile and closes its local Auth session', async () => {
    mockProfile = { id: 'user-1', role: 'user', status: 'suspended', full_name: 'Kai' }
    await act(async () => root.render(React.createElement(AuthProvider, null, React.createElement(Probe))))
    await flush()
    await act(async () => { host.querySelector('button')?.click(); await Promise.resolve(); await Promise.resolve() })
    await flush()

    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(host.querySelector('[data-testid="role"]')?.textContent).toBe('signed-out')
  })
})
