/**
 * Clears app-local SQLite data. Does not touch the HF cache directory on disk.
 */
import type { AppDatabase } from './db'

export function clearLocalAppData(
  db: AppDatabase,
  options: { signOut: boolean }
): { signedOut: boolean } {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM favorites').run()
    db.prepare('DELETE FROM history').run()
    db.prepare('DELETE FROM downloads').run()
    db.prepare('DELETE FROM follows').run()
    db.prepare('DELETE FROM inbox').run()
    db.prepare(`DELETE FROM kv WHERE key != 'settings'`).run()
    if (options.signOut) {
      db.prepare('DELETE FROM auth WHERE id = 1').run()
    }
  })
  tx()
  return { signedOut: options.signOut }
}
