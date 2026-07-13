import type { AppSettings } from '@oh-my-huggingface/shared'
import { DEFAULT_SETTINGS } from '@oh-my-huggingface/shared'
import type { AppDatabase } from './db'

type Listener = (settings: AppSettings) => void

export class SettingsStore {
  private cached: AppSettings
  private listeners = new Set<Listener>()

  constructor(private readonly db: AppDatabase) {
    this.cached = this.load()
  }

  private load(): AppSettings {
    const row = this.db.prepare('SELECT value FROM kv WHERE key = ?').get('settings') as
      { value: string } | undefined
    if (!row) return { ...DEFAULT_SETTINGS }
    try {
      return { ...DEFAULT_SETTINGS, ...(JSON.parse(row.value) as Partial<AppSettings>) }
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  }

  get(): AppSettings {
    return this.cached
  }

  set(patch: Partial<AppSettings>): AppSettings {
    this.cached = { ...this.cached, ...patch }
    this.db
      .prepare(
        'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      )
      .run('settings', JSON.stringify(this.cached))
    for (const listener of this.listeners) listener(this.cached)
    return this.cached
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}
