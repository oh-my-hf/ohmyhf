import type { ThemeSetting } from '@oh-my-huggingface/shared'

const media = window.matchMedia('(prefers-color-scheme: dark)')
let current: ThemeSetting = 'system'

function apply(): void {
  const dark = current === 'dark' || (current === 'system' && media.matches)
  document.documentElement.classList.toggle('dark', dark)
}

media.addEventListener('change', apply)

export function setTheme(theme: ThemeSetting): void {
  current = theme
  apply()
}
