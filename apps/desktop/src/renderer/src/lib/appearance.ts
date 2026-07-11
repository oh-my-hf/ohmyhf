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
}
