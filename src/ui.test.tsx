/**
 * Mount smoke test. The time core and model layer are tested headlessly
 * elsewhere; this one exists to catch the failure mode those can't — the whole
 * app throwing on first render.
 *
 * @vitest-environment jsdom
 */

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import App from './App'

beforeAll(() => {
  // jsdom ships none of these; the app uses all three.
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver

  globalThis.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof matchMedia

  Element.prototype.scrollIntoView ??= () => {}
  // jsdom has no 2d context; measureText falls back to an estimate by design.
  HTMLCanvasElement.prototype.getContext = () => null
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

let root: Root | null = null
let host: HTMLDivElement | null = null

function mount() {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => {
    root!.render(<App />)
  })
  return host
}

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

describe('app mounts', () => {
  it('renders the toolbar, axis and starter rows without throwing', () => {
    const el = mount()
    expect(el.querySelector('.toolbar')).toBeTruthy()
    expect(el.querySelector('.axis__svg')).toBeTruthy()
    expect(el.querySelectorAll('.row').length).toBeGreaterThan(0)
  })

  it('draws bars for the starter document', () => {
    const el = mount()
    const polys = el.querySelectorAll('.bar polygon')
    expect(polys.length).toBeGreaterThan(0)
    for (const p of polys) expect(p.getAttribute('points')).toMatch(/^[\d.,\-\s]+$/)
  })

  it('labels the axis with real tick text', () => {
    const el = mount()
    const texts = [...el.querySelectorAll('.axis__tick text')].map((t) => t.textContent)
    expect(texts.length).toBeGreaterThan(2)
    expect(texts.some((t) => /\d/.test(t ?? ''))).toBe(true)
  })

  it('renders the frozen gutter with row identity', () => {
    const el = mount()
    const labels = [...el.querySelectorAll('.row__label')].map((n) => n.textContent?.trim())
    expect(labels).toContain('home')
    expect(labels).toContain('work')
  })

  it('shows the pinned backdrop strip for the era row', () => {
    const el = mount()
    expect(el.querySelector('.chart__pinned .strip')).toBeTruthy()
  })

  it('opens the event dialog on the N shortcut', () => {
    const el = mount()
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }))
    })
    expect(el.querySelector('[aria-label="New event"]')).toBeTruthy()
  })

  it('opens the side panel from the Search button', () => {
    const el = mount()
    const search = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Search')!
    act(() => search.click())
    expect(el.querySelector('.side')).toBeTruthy()
  })
})
