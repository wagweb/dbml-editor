/**
 * Reads a key that comes from user input (a table name) from a plain object. A table called
 * `constructor` or `__proto__` must not resolve to something inherited from Object.
 */
export function getOwn<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined
}
