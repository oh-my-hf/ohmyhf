import type { AccentPreset, AppSettings } from '@oh-my-huggingface/shared'

/** Focus-ring / ::selection hue per accent. `default` keeps the app's stock blue-500. */
export const ACCENT_FOCUS: Record<AccentPreset, string> = {
  default: 'oklch(0.623 0.214 259.815)', // blue-500 (stock)
  blue: 'oklch(0.685 0.169 237.323)', // sky-500 — distinct from stock
  green: 'oklch(0.723 0.192 149.579)',
  orange: 'oklch(0.705 0.197 46)',
  violet: 'oklch(0.606 0.25 292.717)'
}

/** Sidebar active mark / switch / progress hue (slightly deeper than focus). */
export const ACCENT_SELECT: Record<AccentPreset, string> = {
  default: 'oklch(0.511 0.262 276.966)', // indigo-600 (stock)
  blue: 'oklch(0.588 0.158 241.966)', // sky-600
  green: 'oklch(0.627 0.194 149.214)',
  orange: 'oklch(0.666 0.179 58.318)',
  violet: 'oklch(0.541 0.281 293.009)'
}

/** Mono-title hover recolor in dark mode. Light follows ACCENT_SELECT; dark needs
 * a brighter 400 shade to read on near-black. `default` keeps the signature yellow. */
export const ACCENT_HOVER_DARK: Record<AccentPreset, string> = {
  default: 'oklch(0.795 0.184 86.047)', // yellow-500 — the signature dark recolor
  blue: 'oklch(0.746 0.16 232.661)', // sky-400
  green: 'oklch(0.792 0.209 151.711)', // green-400
  orange: 'oklch(0.75 0.183 55.934)', // orange-400
  violet: 'oklch(0.702 0.183 293.541)' // violet-400
}

/** Swatch fill shown in Settings (matches focus hue). */
export const ACCENT_SWATCH = ACCENT_FOCUS

export function applyAppearance(
  settings: Pick<AppSettings, 'uiDensity' | 'accent' | 'fontScale'>
): void {
  const root = document.documentElement
  root.dataset.density = settings.uiDensity
  root.dataset.accent = settings.accent
  root.style.setProperty('--font-scale', String(settings.fontScale / 100))
  root.style.setProperty('--c-focus', ACCENT_FOCUS[settings.accent])
  root.style.setProperty('--c-select', ACCENT_SELECT[settings.accent])
  root.style.setProperty('--c-hover-title-dark', ACCENT_HOVER_DARK[settings.accent])
}
