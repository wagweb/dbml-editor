import type { PersistStorage, StorageValue } from 'zustand/middleware'

const WRITE_DELAY = 400

/**
 * localStorage adapter for zustand's persist that batches both serialising and writing.
 * Typing and dragging update state many times a second; turning every document into JSON
 * on each change would be wasted work.
 */
export function createDebouncedStorage<T>(onError?: () => void): PersistStorage<T> {
  const pending = new Map<string, StorageValue<T>>()
  let timer: ReturnType<typeof setTimeout> | undefined

  const flush = () => {
    if (timer) clearTimeout(timer)
    timer = undefined
    for (const [key, value] of pending) {
      try {
        localStorage.setItem(key, JSON.stringify(value))
      } catch (error) {
        // Quota or privacy mode: the session keeps working, it just is not saved.
        console.warn('Could not save to local storage', error)
        onError?.()
      }
    }
    pending.clear()
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush()
    })
  }

  return {
    getItem: (key) => {
      const waiting = pending.get(key)
      if (waiting) return waiting
      try {
        const raw = localStorage.getItem(key)
        return raw === null ? null : (JSON.parse(raw) as StorageValue<T>)
      } catch (error) {
        // Unreadable data must not take the app down; it starts fresh instead.
        console.warn('Could not read saved diagrams', error)
        return null
      }
    },
    setItem: (key, value) => {
      pending.set(key, value)
      if (timer) clearTimeout(timer)
      timer = setTimeout(flush, WRITE_DELAY)
    },
    removeItem: (key) => {
      pending.delete(key)
      localStorage.removeItem(key)
    },
  }
}
