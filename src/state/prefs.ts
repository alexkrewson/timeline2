/**
 * Appearance preferences. Persisted to localStorage immediately on change and
 * independent of anything else — customising the app never requires saving a
 * document first.
 *
 * Light/dark is an explicit, persistent user setting, never a
 * `prefers-color-scheme` follower: spatial memory should not depend on what
 * time of day you opened the app.
 */

import type { RecMode } from '../model/types'
import { DEFAULT_THEME_KEY, THEMES } from '../styles/themes'

export type Density = 'compact' | 'comfortable' | 'spacious'

export type Prefs = {
  mode: 'dark' | 'light'
  theme: string
  density: Density
  corpusOn: boolean
  recMode: RecMode
}

const KEY = 'timeline.prefs'

export const DEFAULT_PREFS: Prefs = {
  mode: 'dark',
  theme: DEFAULT_THEME_KEY,
  density: 'comfortable',
  corpusOn: false,
  recMode: 'prefer-matching',
}

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_PREFS
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) }
  } catch {
    return DEFAULT_PREFS
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    /* private mode — the app still works, it just won't remember */
  }
}

function mix(hex: string, toward: string, amount: number): string {
  const parse = (h: string) => {
    const m = /^#?([\da-f]{6})$/i.exec(h.trim())
    if (!m) return null
    const n = parseInt(m[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const a = parse(hex)
  const b = parse(toward)
  if (!a || !b) return hex
  const out = a.map((c, i) => Math.round(c + (b[i] - c) * amount))
  return `#${((out[0] << 16) | (out[1] << 8) | out[2]).toString(16).padStart(6, '0')}`
}

function rgba(hex: string, alpha: number): string {
  const m = /^#?([\da-f]{6})$/i.exec(hex.trim())
  if (!m) return hex
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

/** Apply a preference set to the document root. Safe to call on every change. */
export function applyPrefs(prefs: Prefs, previewTheme?: string | null): void {
  const root = document.documentElement
  const preset = THEMES[previewTheme ?? prefs.theme] ?? THEMES[DEFAULT_THEME_KEY]

  root.dataset.theme = prefs.mode
  root.dataset.density = prefs.density

  const s = root.style
  s.setProperty('--accent-amber', preset.a.bg)
  s.setProperty('--accent-amber-border', preset.a.border)
  s.setProperty('--accent-teal', preset.b.bg)
  s.setProperty('--accent-teal-border', preset.b.border)
  s.setProperty('--accent', preset.b.bg)
  s.setProperty('--accent-glow', rgba(preset.b.bg, 0.18))

  if (prefs.mode === 'dark') {
    // Dark presets bring their own canvas; light presets get a dark equivalent.
    const canvas = preset.dark ? preset.panelBg : mix(preset.panelBg, '#000000', 0.88)
    s.setProperty('--bg-canvas', canvas)
    s.setProperty('--bg-surface', mix(canvas, '#ffffff', 0.07))
    s.setProperty('--bg-raised', mix(canvas, '#ffffff', 0.13))
    s.setProperty('--border', mix(canvas, '#ffffff', 0.2))
    s.setProperty('--border-strong', mix(canvas, '#ffffff', 0.32))
  } else {
    for (const prop of ['--bg-canvas', '--bg-surface', '--bg-raised', '--border', '--border-strong'])
      s.removeProperty(prop)
  }
}
