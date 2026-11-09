import type { Page } from '@playwright/test'
import LZString from 'lz-string'
import { SAMPLES } from '../src/test/schemas.ts'

export type SchemaId = 'storefront' | 'blog' | 'saas'

export function schemaSource(id: SchemaId): string {
  return SAMPLES.find((sample) => sample.id === id)!.source
}

/** Same format as `src/share/encode.ts`, which Node cannot load as is (lz-string is CommonJS). */
function shareFragment(name: string, source: string): string {
  return `d=${LZString.compressToEncodedURIComponent(JSON.stringify({ n: name, s: source }))}`
}

/**
 * The app ships no examples, so tests open their schema the way a visitor would: through a
 * share link, which creates the diagram in a fresh browser.
 */
/**
 * The one-time gesture tips would pop up over the diagram in the middle of a test. Tests
 * start as someone who has seen them; the tips have their own test.
 */
export async function skipTips(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('keyline:tips', JSON.stringify(['path', 'rename', 'link']))
  })
}

export async function openSchema(
  page: Page,
  id: SchemaId,
  options: { tips?: boolean } = {},
): Promise<void> {
  if (!options.tips) await skipTips(page)
  const sample = SAMPLES.find((entry) => entry.id === id)!
  await page.goto(`/#${shareFragment(sample.name, sample.source)}`)
}
