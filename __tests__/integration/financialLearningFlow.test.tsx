import React, { act } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals'

jest.mock('@/context/ThemeContext', () => ({ useAppTheme: () => ({ resolvedTheme: 'light' }) }))
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }))
jest.mock('react-native', () => {
  const ReactModule = require('react')
  return {
    Pressable: ({ children, onPress, disabled }: { children: React.ReactNode; onPress?: () => void; disabled?: boolean }) => ReactModule.createElement('button', { onClick: onPress, disabled }, children),
    SafeAreaView: ({ children }: { children: React.ReactNode }) => ReactModule.createElement('main', null, children),
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
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  if (root) await act(async () => root.unmount())
  document.body.innerHTML = ''
})

describe('financial literacy quiz interaction', () => {
  it('grades an answer once, displays learning feedback, and carries score into the next question', async () => {
    const { default: Quiz } = require('@/app/(user)/learn/financial-qa') as typeof import('@/app/(user)/learn/financial-qa')
    await act(async () => root.render(React.createElement(Quiz)))
    expect(host.textContent).toContain('QUESTION 1 OF 12')
    const correct = [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('Plan needs, savings, and wants'))
    await act(async () => correct?.click())
    expect(host.textContent).toContain('Correct answer!')
    expect(host.textContent).toContain('Score: 1')
    expect(correct?.disabled).toBe(true)
    const next = [...host.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Next question')
    await act(async () => next?.click())
    expect(host.textContent).toContain('QUESTION 2 OF 12')
    expect(host.textContent).toContain('Score: 1')
    expect(host.textContent).toContain('pay yourself first')
  })

  it('shows corrective feedback for an incorrect answer without awarding a point', async () => {
    const { default: Quiz } = require('@/app/(user)/learn/financial-qa') as typeof import('@/app/(user)/learn/financial-qa')
    await act(async () => root.render(React.createElement(Quiz)))
    const wrong = [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('Spend on wants immediately'))
    await act(async () => wrong?.click())
    expect(host.textContent).toContain('Not quite. Keep learning!')
    expect(host.textContent).toContain('Score: 0')
    expect(host.textContent).toContain('A simple plan helps you cover important needs')
  })
})
