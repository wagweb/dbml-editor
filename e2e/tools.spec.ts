import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { openSchema } from './fixtures.ts'

const table = (page: Page, name: string) => page.locator(`article[data-table-id="${name}"]`)
const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

async function open(page: Page, options: { tips?: boolean } = {}) {
  await openSchema(page, 'storefront', options)
  await expect(table(page, 'orders')).toBeVisible()
}

/** Types at the end of the document without triggering bracket auto-closing. */
async function appendCode(page: Page, text: string) {
  await page.locator('.cm-content').click()
  await page.keyboard.press(`${mod}+End`)
  await page.keyboard.insertText(text)
}

const code = (page: Page) => page.locator('.cm-content').innerText()

test.describe('tools', () => {
  test.skip(({ isMobile }) => isMobile)

  test('copies a query that joins the tables of a path', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await open(page)
    await table(page, 'order_items').click()
    await table(page, 'customers').click({ modifiers: ['Shift'] })
    await page.getByRole('button', { name: 'Copy SQL query' }).click()
    await expect(page.getByText('Query copied')).toBeVisible()
    const query = await page.evaluate(() => navigator.clipboard.readText())
    expect(query).toContain('FROM order_items oi')
    expect(query).toContain('JOIN orders o ON o.id = oi.order_id')
    expect(query).toContain('JOIN customers c ON c.id = o.customer_id')
  })

  test('formats the code in the chosen indentation', async ({ page }) => {
    await open(page)
    await appendCode(page, '\nTable messy {\nid int [pk]\n      long_name varchar\n}\n')
    await expect(table(page, 'messy')).toBeVisible()
    await page.keyboard.press('Shift+Alt+KeyF')
    await expect(page.getByText('Code formatted')).toBeVisible()
    expect(await code(page)).toContain(
      'Table messy {\n  id        int [pk]\n  long_name varchar\n}',
    )

    await page.getByRole('button', { name: 'View options' }).click()
    await page.getByRole('menuitem', { name: /Indentation/ }).press('ArrowRight')
    await page.getByRole('menuitemradio', { name: 'Tabs' }).press('Enter')
    await expect(page.getByText('Indenting with tabs')).toBeVisible()
    await page.getByRole('button', { name: 'Format code' }).click()
    expect(await code(page)).toContain(
      'Table messy {\n\tid        int [pk]\n\tlong_name varchar\n}',
    )
  })

  test('fixes a schema hint from the code', async ({ page }) => {
    await open(page)
    await page.locator('.cm-content').click()
    await page.keyboard.press(`${mod}+Shift+KeyM`)
    const panel = page.locator('.cm-panel-lint')
    await expect(panel).toBeVisible()
    await panel.getByRole('button', { name: 'Add index' }).first().click()
    await expect(page.getByText('Added an index')).toBeVisible()
  })

  test('expands a block template with Tab', async ({ page }) => {
    await open(page)
    await appendCode(page, '\n\n')
    await page.keyboard.type('Tabl')
    // The block template, not the bare keyword.
    // Completion asks the language service, which takes longer when the machine is busy.
    await expect(
      page.locator('.cm-tooltip-autocomplete [aria-selected="true"]', { hasText: 'block' }),
    ).toBeVisible({ timeout: 15_000 })
    // CodeMirror takes a suggestion only 75 ms after its list last changed, so a key
    // pressed right after typing is not taken as a choice by accident.
    await page.waitForTimeout(150)
    await page.keyboard.press('Tab')
    await page.keyboard.type('audit_log')
    await expect(table(page, 'audit_log')).toBeVisible({ timeout: 15_000 })
    await expect(table(page, 'audit_log')).toContainText('id')
  })

  test('wraps long lines unless that is turned off', async ({ page }) => {
    await open(page)
    const content = page.locator('.cm-content')
    await expect(content).toHaveClass(/cm-lineWrapping/)
    await page.getByRole('button', { name: 'View options' }).click()
    await page.getByRole('menuitemcheckbox', { name: 'Wrap long lines' }).click()
    await expect(content).not.toHaveClass(/cm-lineWrapping/)
    // The setting outlives a reload.
    await page.waitForTimeout(300)
    await page.reload()
    await expect(page.locator('.cm-content')).not.toHaveClass(/cm-lineWrapping/)
  })

  test('shows fold arrows only on lines that open a block', async ({ page }) => {
    await open(page)
    await page.locator('.cm-gutters').hover()
    const arrows = page.locator('.cm-foldMarker')
    // The gutter's zero-height spacer carries an arrow too; it must stay out of sight.
    const visible = await arrows.evaluateAll(
      (markers) =>
        markers.filter((marker) => {
          const box = marker.getBoundingClientRect()
          const cell = marker.parentElement!.getBoundingClientRect()
          return box.height > 0 && cell.height > 0
        }).length,
    )
    expect(visible).toBeGreaterThan(0)
    const spacer = page.locator('.cm-foldGutter .cm-gutterElement').first()
    expect(await spacer.evaluate((cell) => cell.getBoundingClientRect().height)).toBe(0)
    expect(await spacer.evaluate((cell) => getComputedStyle(cell).overflow)).toBe('hidden')
  })

  test('folds a block in the code', async ({ page }) => {
    await open(page)
    await page.locator('.cm-line', { hasText: 'Table customers {' }).click()
    await page.keyboard.press(
      process.platform === 'darwin' ? 'Meta+Alt+BracketLeft' : 'Control+Shift+BracketLeft',
    )
    await expect(page.locator('.cm-foldPlaceholder')).toBeVisible()
    await expect(page.locator('.cm-line', { hasText: 'full_name' })).toHaveCount(0)
  })

  test('marks the column and relation the code cursor is in', async ({ page }) => {
    await open(page)
    // Lines far down are only rendered once the editor scrolls to them.
    await page.locator('.cm-content').click()
    await page.keyboard.press(`${mod}+KeyF`)
    // Typed, not inserted: the search field takes its query on key up.
    await page.keyboard.type('shipping_address_id uuid')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Escape')
    await page.locator('.cm-line', { hasText: 'shipping_address_id' }).first().click()
    await expect(
      table(page, 'orders').locator('[data-column="shipping_address_id"]'),
    ).toHaveAttribute('data-cursor', 'true')
    await expect(page.locator('.edge[data-cursor="true"]')).toHaveCount(1)
  })

  test('exports Markdown and copies Mermaid for documentation', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await open(page)
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export' }).click()
    await page.getByRole('menuitem', { name: 'Markdown document' }).click()
    const file = await download
    expect(file.suggestedFilename()).toBe('storefront.md')
    const markdown = await readFile((await file.path())!, 'utf8')
    expect(markdown).toContain('# Storefront')
    expect(markdown).toContain('```mermaid\nerDiagram')

    await page.getByRole('button', { name: 'Export' }).click()
    await page.getByRole('menuitem', { name: 'Mermaid diagram' }).click()
    await expect(page.getByText('Mermaid diagram copied')).toBeVisible()
    const mermaid = await page.evaluate(() => navigator.clipboard.readText())
    expect(mermaid).toMatch(/^```mermaid\nerDiagram\n/)
  })

  test('opens a view-only link without code and edits a copy', async ({
    page,
    context,
    browser,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await open(page)
    await page.getByRole('button', { name: 'Export' }).click()
    await page.getByRole('menuitem', { name: 'Copy view-only link' }).click()
    const link = await page.evaluate(() => navigator.clipboard.readText())

    const visitorContext = await browser.newContext()
    const visitor = await visitorContext.newPage()
    await visitor.goto(link)
    await expect(table(visitor, 'orders')).toBeVisible()
    await expect(visitor.getByText('View only')).toBeVisible()
    await expect(visitor.locator('.cm-editor')).toHaveCount(0)
    // Nothing is stored until the visitor asks for a copy.
    await visitor.waitForTimeout(600)
    expect(await visitor.evaluate(() => localStorage.getItem('keyline:documents'))).toBeNull()
    await table(visitor, 'orders').dblclick()
    await expect(visitor.locator('.inline-edit')).toHaveCount(0)

    await visitor.getByRole('button', { name: 'Open in editor' }).click()
    await expect(visitor.locator('.cm-editor')).toBeVisible()
    await expect(visitor.getByText('View only')).toHaveCount(0)
    await visitorContext.close()
  })

  test('presents the diagram group by group', async ({ page }) => {
    await open(page)
    await page.locator('.canvas-viewport').focus()
    await page.keyboard.press('p')
    const bar = page.getByRole('group', { name: 'Presentation' })
    await expect(bar).toContainText('1 of 4')
    await expect(page.getByRole('button', { name: 'View options' })).toBeHidden()
    await page.keyboard.press('ArrowRight')
    await expect(bar).toContainText('2 of 4')
    await expect(bar).toContainText('Customers')
    await page.keyboard.press('Escape')
    await expect(bar).toBeHidden()
    await expect(page.getByRole('button', { name: 'View options' })).toBeVisible()
  })

  test('teaches one gesture per visit, each only once', async ({ page }) => {
    await open(page, { tips: true })
    await table(page, 'orders').click()
    const tip = page.getByRole('status').filter({ hasText: 'click another table' })
    await expect(tip).toBeVisible()
    await page.getByRole('button', { name: 'Got it' }).click()
    await expect(tip).toBeHidden()
    // Saving is debounced; the next visit starts from storage.
    await page.waitForTimeout(700)
    await page.reload()
    await table(page, 'orders').click()
    await expect(page.getByRole('status').filter({ hasText: 'Double-click' })).toBeVisible()
  })
})
