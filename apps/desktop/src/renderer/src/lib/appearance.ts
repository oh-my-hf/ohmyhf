import type { AccentPreset, AppSettings } from '@oh-my-huggingface/shared'

const ACCENT_FOCUS: Record<AccentPreset, string> = {
  default: 'oklch(0.623 0.214 259.815)',
  blue: 'oklch(0.623 0.214 259.815)',
  green: 'oklch(0.723 0.192 149.579)',
  orange: 'oklch(0.705 0.197 46)',
  violet: 'oklch(0.606 0.25 292.717)'
}

const ACCENT_SELECT: Record<AccentPreset, string> = {
  default: 'oklch(0.511 0.262 276.966)',
  blue: 'oklch(0.546 0.245 262.881)',
  green: 'oklch(0.627 0.194 149.214)',
  orange: 'oklch(0.666 0.179 58.318)',
  violet: 'oklch(0.541 0.281 293.009)'
}

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
