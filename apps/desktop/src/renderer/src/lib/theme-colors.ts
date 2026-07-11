/**
 * Hub Space / Collection theme color names → OKLCH.
 * Shared so Space cards and collection theme dots stay in sync.
 */
const HUB_THEME_COLORS: Record<string, string> = {
  red: 'oklch(0.62 0.2 25)',
  yellow: 'oklch(0.76 0.15 85)',
  orange: 'oklch(0.7 0.17 55)',
  green: 'oklch(0.64 0.16 150)',
  blue: 'oklch(0.56 0.17 255)',
  indigo: 'oklch(0.51 0.19 275)',
  purple: 'oklch(0.54 0.2 300)',
  pink: 'oklch(0.63 0.19 350)',
  gray: 'oklch(0.5 0.02 260)'
}

const FALLBACK_THEME_COLOR = 'oklch(0.5 0.02 260)'

/** Resolve a Hub color/theme name to an OKLCH string. */
export function hubThemeColor(name: string | undefined): string {
  return (name && HUB_THEME_COLORS[name.toLowerCase()]) || FALLBACK_THEME_COLOR
}
