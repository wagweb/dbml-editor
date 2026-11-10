import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { openSchema } from './fixtures.ts'

const table = (page: Page, name: string) => page.locator(`article[data-table-id="${name}"]`)
const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

async function savedSource(page: Page): Promise<string> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('keyline:documents')
    if (!raw) return ''
    const state = JSON.parse(raw).state as {
      activeId: string
      documents: Record<string, { source: string }>
    }
    return state.documents[state.activeId]?.source ?? ''
  })
}

async function position(page: Page, name: string) {
  const box = (await table(page, name).boundingBox())!
  return { x: Math.round(box.x), y: Math.round(box.y) }
}

test.beforeEach(async ({ page }) => {
  await openSchema(page, 'storefront')
  await expect(table(page, 'orders')).toBeVisible()
})

test.describe('several tables at once', () => {
  test.skip(({ isMobile }) => isMobile)

  test('selects tables inside a rectangle drawn with Shift', async ({ page }) => {
    const a = (await table(page, 'payments').boundingBox())!
    const b = (await table(page, 'shipments').boundingBox())!
    const left = Math.min(a.x, b.x) - 12
    const top = Math.min(a.y, b.y) - 12
    const right = Math.max(a.x + a.width, b.x + b.width) + 12
    const bottom = Math.max(a.y + a.height, b.y + b.height) + 12
    await page.keyboard.down('Shift')
    await page.mouse.move(left, top)
    await page.mouse.down()
    await page.mouse.move(right, bottom, { steps: 10 })
    await expect(page.locator('.marquee')).toBeVisible()
    await page.mouse.up()
    await page.keyboard.up('Shift')

    await expect(page.locator('.marquee')).toHaveCount(0)
    await expect(table(page, 'payments')).toHaveAttribute('data-selected', 'true')
    await expect(table(page, 'shipments')).toHaveAttribute('data-selected', 'true')
    const bar = page.getByRole('toolbar', { name: 'Selected tables' })
    await expect(bar).toContainText(/\d+ tables/)
    // Several tables have no details panel.
    await expect(page.getByRole('complementary')).toHaveCount(0)
  })

  test('adds tables with Cmd or Ctrl and moves them together', async ({ page }) => {
    await table(page, 'countries').click()
    await table(page, 'categories').click({ modifiers: [mod] })
    const bar = page.getByRole('toolbar', { name: 'Selected tables' })
    await expect(bar).toContainText('2 tables')

    const before = [await position(page, 'countries'), await position(page, 'categories')]
    await table(page, 'countries').focus()
    await page.keyboard.press('Shift+ArrowDown')
    await expect
      .poll(async () => (await position(page, 'categories')).y)
      .toBeGreaterThan(before[1]!.y)
    expect((await position(page, 'countries')).y).toBeGreaterThan(before[0]!.y)

    await table(page, 'categories').click({ modifiers: [mod] })
    // One left: an ordinary selection with its details.
    await expect(bar).toHaveCount(0)
    await expect(page.getByRole('complementary', { name: /countries/ })).toBeVisible()
  })

  test('aligns the selection and writes it into the code as a group and a view', async ({
    page,
  }) => {
    await table(page, 'countries').click()
    await table(page, 'products').click({ modifiers: [mod] })
    await page.getByRole('button', { name: 'Arrange' }).click()
    await page.getByRole('menuitem', { name: 'Align left edges' }).click()
    await expect(page.getByText('Tables aligned')).toBeVisible()
    await expect
      .poll(async () => (await position(page, 'countries')).x)
      .toBe((await position(page, 'products')).x)

    await page.getByRole('button', { name: 'Make group' }).click()
    await page.getByRole('textbox', { name: 'Group name' }).fill('Reference')
    await page.keyboard.press('Enter')
    await expect(page.getByText('Added group Reference with 2 tables')).toBeVisible()
    await expect.poll(() => savedSource(page)).toContain('TableGroup Reference {')

    await table(page, 'countries').click()
    await table(page, 'products').click({ modifiers: [mod] })
    await page.getByRole('button', { name: 'Make view' }).click()
    await page.getByRole('textbox', { name: 'View name' }).fill('Lookup')
    await page.keyboard.press('Enter')
    await expect(page.getByText(/Added view Lookup/)).toBeVisible()
    await expect.poll(() => savedSource(page)).toContain('DiagramView Lookup {')
  })

  test('selects all tables with Cmd or Ctrl + A and clears with Escape', async ({ page }) => {
    await page.locator('.canvas-viewport').focus()
    await page.keyboard.press(`${mod}+KeyA`)
    await expect(page.getByRole('toolbar', { name: 'Selected tables' })).toContainText('11 tables')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('toolbar', { name: 'Selected tables' })).toHaveCount(0)
    await expect(page.locator('article[data-selected="true"]')).toHaveCount(0)
  })
})

test.describe('small helpers', () => {
  test.skip(({ isMobile }) => isMobile)

  test('walks back and forward along the tables chosen', async ({ page }) => {
    await table(page, 'orders').click()
    const panel = page.getByRole('complementary')
    await panel.getByRole('tab', { name: /Relations/ }).click()
    await panel.getByRole('button', { name: /^customers/ }).click()
    await expect(page.getByRole('complementary', { name: /customers/ })).toBeVisible()

    await page.getByRole('button', { name: 'Back to orders' }).click()
    await expect(page.getByRole('complementary', { name: /orders/ })).toBeVisible()
    await page.locator('.canvas-viewport').focus()
    await page.keyboard.press('Alt+ArrowRight')
    await expect(page.getByRole('complementary', { name: /customers/ })).toBeVisible()
    await page.keyboard.press('Alt+ArrowLeft')
    await expect(page.getByRole('complementary', { name: /orders/ })).toBeVisible()
  })

  test('tells what a column is when the pointer rests on it', async ({ page }) => {
    await table(page, 'orders').locator('[data-column="customer_id"]').hover()
    const tip = page.getByRole('tooltip').filter({ hasText: 'customer_id' })
    await expect(tip).toBeVisible()
    await expect(tip).toContainText('references customers.id')
    await expect(tip).toContainText('not null')
  })

  test('shows how much has notes and goes to the next place without one', async ({ page }) => {
    const notes = page.getByRole('button', { name: /^\d+% noted\. Notes on \d+ of 11 tables/ })
    await expect(notes).toBeVisible()
    await expect(notes).toContainText('%')
    await notes.click()
    await expect(page.locator('.cm-content')).toBeFocused()
    await expect(page.getByRole('complementary')).toBeVisible()
  })

  test('asks every table for a required column and offers to add it', async ({ page }) => {
    await page.getByRole('button', { name: 'View options' }).click()
    await page.getByRole('menuitem', { name: 'Hint rules' }).click()
    const dialog = page.getByRole('dialog', { name: 'Schema hint rules' })
    await dialog.getByRole('textbox', { name: 'Columns every table needs' }).fill('created_at')
    await dialog.getByRole('button', { name: 'Done' }).click()

    await page.getByRole('button', { name: /hints? about the schema/ }).click()
    const hints = page.getByRole('dialog', { name: 'Schema hints' })
    await expect(
      hints.getByRole('heading', { name: /Tables missing a required column/ }),
    ).toBeVisible()
    await hints.getByRole('button', { name: 'Add created_at' }).first().click()
    await expect(page.getByText('Added created_at')).toBeVisible()
  })

  test('lays the diagram out top to bottom when asked', async ({ page }) => {
    // Left to right: the referenced table sits left of the one that references it.
    expect((await position(page, 'customers')).x).toBeLessThan((await position(page, 'orders')).x)
    await page.getByRole('button', { name: 'View options' }).click()
    await page.getByRole('menuitem', { name: /Layout/ }).press('ArrowRight')
    await page.getByRole('menuitemradio', { name: 'Top to bottom' }).press('Enter')
    await expect
      .poll(async () => (await position(page, 'orders')).y - (await position(page, 'customers')).y)
      .toBeGreaterThan(0)
  })

  test('exports a PNG at the chosen resolution', async ({ page }) => {
    await page.getByRole('button', { name: 'Export' }).click()
    await page.getByRole('menuitem', { name: /^Image/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Export image' })
    await dialog.getByRole('radio', { name: '1x' }).click()
    const size = await dialog.getByText(/× \d+ pixels/).innerText()
    const [width] = size.split(' ').map(Number)
    await dialog.getByRole('radio', { name: '3x' }).click()

    const download = page.waitForEvent('download')
    await dialog.getByRole('button', { name: 'Download PNG' }).click()
    const png = await readFile((await (await download).path())!)
    // Width and height sit in the PNG header, big-endian, right after the signature.
    expect(png.readUInt32BE(16)).toBe(width! * 3)
  })
})
