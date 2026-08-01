/**
 * The shared 8-theme preset library — common across every app in this folder.
 * Values are copied from apps-shared/css-best-practices.md verbatim; add new
 * presets there first so every app gets them.
 */

export type ThemePreset = {
  label: string
  dark?: boolean
  panelBg: string
  a: { name: string; bg: string; border: string }
  b: { name: string; bg: string; border: string }
}

export const THEMES: Record<string, ThemePreset> = {
  classic: {
    label: 'Classic', panelBg: '#eaf0f7',
    a: { name: 'Blue', bg: '#6a8ca8', border: '#4a6882' },
    b: { name: 'Green', bg: '#7a9c78', border: '#5a7658' },
  },
  ocean: {
    label: 'Ocean', panelBg: '#e6f2f5',
    a: { name: 'Teal', bg: '#5a7898', border: '#3c5872' },
    b: { name: 'Coral', bg: '#b87c68', border: '#8a5444' },
  },
  sunset: {
    label: 'Sunset', panelBg: '#fdf0e0',
    a: { name: 'Amber', bg: '#c49a6c', border: '#927244' },
    b: { name: 'Violet', bg: '#9478a8', border: '#6c5280' },
  },
  forest: {
    label: 'Forest', panelBg: '#e8f2e8',
    a: { name: 'Sage', bg: '#5a8460', border: '#3a6040' },
    b: { name: 'Rust', bg: '#9c6450', border: '#724030' },
  },
  dusk: {
    label: 'Dusk', panelBg: '#ede8f5',
    a: { name: 'Indigo', bg: '#8878a8', border: '#645684' },
    b: { name: 'Rose', bg: '#ac748c', border: '#845a6a' },
  },
  night: {
    label: 'Night', dark: true, panelBg: '#192635',
    a: { name: 'Azure', bg: '#6a8eaa', border: '#486a84' },
    b: { name: 'Jade', bg: '#5a8a7a', border: '#386858' },
  },
  midnight: {
    label: 'Midnight', dark: true, panelBg: '#1a1830',
    a: { name: 'Violet', bg: '#7868a0', border: '#564878' },
    b: { name: 'Plum', bg: '#9c6878', border: '#744858' },
  },
  ember: {
    label: 'Ember', dark: true, panelBg: '#1e1508',
    a: { name: 'Amber', bg: '#b87040', border: '#7a4820' },
    b: { name: 'Teal', bg: '#3d8c7a', border: '#255c50' },
  },
}

export const DEFAULT_THEME_KEY = 'ember'

/**
 * Tag palette. Muted and dusty by construction — these are fills people look at
 * for a long time. Hue never carries meaning alone: bars also differ by
 * position, stripe and outline (§8.2), so the palette only has to stay
 * distinguishable, not self-explanatory.
 */
export const TAG_PALETTE = [
  '#b87040', // amber
  '#3d8c7a', // teal
  '#8878a8', // indigo
  '#9c6450', // rust
  '#6a8ca8', // steel blue
  '#7a9c78', // sage
  '#ac748c', // rose
  '#c49a6c', // caramel
  '#5a8a7a', // pine
  '#9478a8', // mauve
  '#b87c68', // coral
  '#5a8460', // moss
]

export function nextPaletteColor(usedColors: string[]): string {
  const counts = new Map(TAG_PALETTE.map((c) => [c, 0]))
  for (const c of usedColors) counts.set(c, (counts.get(c) ?? 0) + 1)
  let best = TAG_PALETTE[0]
  let bestCount = Infinity
  for (const c of TAG_PALETTE) {
    const n = counts.get(c) ?? 0
    if (n < bestCount) {
      bestCount = n
      best = c
    }
  }
  return best
}
