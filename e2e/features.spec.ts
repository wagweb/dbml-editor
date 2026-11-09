import { expect, test, type Page } from '@playwright/test'
import { openSchema } from './fixtures.ts'

const table = (page: Page, name: string) => page.locator(`article[data-table-id="${name}"]`)
const details = (page: Page, name: string) =>
  page.getByRole('complementary', { name: `Details of table ${name}` })
const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

/**
 * Text of the open diagram as saved in the browser. The editor only renders the lines in
 * view, so its DOM is no place to look for text near the end of the document.
 */
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

/** Selects a table and frames the whole diagram again, so other tables stay clickable. */
async function select(page: Page, name: string) {
  await table(page, name).click()
  await expect(details(page, name)).toBeVisible()
  await page.keyboard.press('1')
  await page.waitForTimeout(400)
}

test.beforeEach(async ({ page }) => {
  await openSchema(page, 'storefront')
  await expect(table(page, 'orders')).toBeVisible()
})

test.describe('relations at a glance', () => {
  test.skip(({ isMobile }) => isMobile)

  test('shows the path between two tables and clears it with Escape', async ({ page }) => {
    await select(page, 'orders')
    await table(page, 'countries').click({ modifiers: ['Shift'] })

    const panel = details(page, 'orders')
    await expect(panel.getByRole('heading', { name: 'Path to countries' })).toBeVisible()
    await expect(panel.getByText('2 steps', { exact: false })).toBeVisible()
    await expect(panel.getByRole('button', { name: 'addresses', exact: true })).toBeVisible()
    await expect(table(page, 'countries')).toHaveAttribute('data-path-end', 'true')
    await expect(table(page, 'addresses')).toHaveAttribute('data-dimmed', 'false')
    await expect(table(page, 'customers')).toHaveAttribute('data-dimmed', 'true')
    await expect(page.locator('.edge[data-active="true"]')).toHaveCount(2)

    // One Escape clears the path, the next closes the details.
    await page.keyboard.press('Escape')
    await expect(panel.getByRole('heading', { name: 'Path to countries' })).toHaveCount(0)
    await expect(panel).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('complementary')).toHaveCount(0)
  })

  test('picks the far end of a path from a list', async ({ page }) => {
    await select(page, 'reviews')
    await details(page, 'reviews').getByRole('button', { name: 'Path to another table' }).click()
    await page.getByPlaceholder('Type to filter').fill('countr')
    await page.keyboard.press('Enter')
    await expect(
      details(page, 'reviews').getByRole('heading', { name: 'Path to countries' }),
    ).toBeVisible()
    await expect(details(page, 'reviews').getByText(/3 steps/)).toBeVisible()
  })

  test('widens the focus to two steps', async ({ page }) => {
    await select(page, 'countries')
    await expect(table(page, 'customers')).toHaveAttribute('data-dimmed', 'true')
    await page.getByRole('radio', { name: '2 steps' }).click()
    await expect(table(page, 'customers')).toHaveAttribute('data-dimmed', 'false')
    await expect(table(page, 'orders')).toHaveAttribute('data-dimmed', 'false')
    await expect(table(page, 'products')).toHaveAttribute('data-dimmed', 'true')
  })

  test('draws enums and notes as cards and lists their details', async ({ page }) => {
    await expect(table(page, 'enum:order_status')).toContainText('cancelled')
    await expect(table(page, 'note:conventions')).toContainText('Money is stored in cents')
    await expect(page.locator('.edge[data-kind="enum"]')).toHaveCount(2)

    await table(page, 'enum:order_status').click()
    const panel = page.getByRole('complementary', { name: 'Details of enum order_status' })
    await expect(panel).toBeVisible()
    await expect(panel.getByRole('heading', { name: 'Used by' })).toBeVisible()
    await expect(panel.getByRole('button', { name: /orders/ })).toBeVisible()

    // Cards can be switched off; the diagram then shows tables only.
    await page.getByRole('button', { name: 'View options' }).click()
    await page.getByRole('menuitemcheckbox', { name: 'Enums as cards' }).click()
    await expect(page.locator('article[data-kind="enum"]')).toHaveCount(0)
  })

  test('shows sample rows from Records', async ({ page }) => {
    await table(page, 'countries').click()
    const panel = details(page, 'countries')
    await expect(panel.getByRole('heading', { name: 'Sample rows' })).toBeVisible()
    await expect(panel.getByRole('cell', { name: 'Germany' })).toBeVisible()
  })

  test('finds columns through search', async ({ page }) => {
    await page.keyboard.press(`${mod}+k`)
    await page.getByPlaceholder('Search tables, columns and actions').fill('tracking')
    await expect(page.getByRole('option', { name: /shipments.tracking_code/ })).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(details(page, 'shipments')).toBeVisible()
    await expect(table(page, 'shipments').locator('[data-column="tracking_code"]')).toHaveAttribute(
      'data-spotlight',
      'true',
    )
  })

  test('lists schema hints and can switch them off', async ({ page }) => {
    const button = page.getByRole('button', { name: /\d+ hints? about the schema/ })
    await expect(button).toBeVisible()
    await button.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Schema hints' })).toBeVisible()
    await expect(
      dialog.getByRole('heading', { name: /Foreign keys without an index/ }),
    ).toBeVisible()
    await dialog.getByRole('button', { name: 'addresses.customer_id' }).click()
    await expect(page.getByRole('complementary')).toBeVisible()

    // One click writes the index into the code and the hint goes away.
    await button.click()
    await dialog
      .getByRole('listitem')
      .filter({ hasText: 'addresses.customer_id' })
      .getByRole('button', { name: 'Add index' })
      .click()
    await expect(page.getByText('Added an index')).toBeVisible()
    await expect.poll(() => savedSource(page)).toMatch(/indexes \{\s+customer_id\s+\}/)

    await page.getByRole('button', { name: 'View options' }).click()
    await page.getByRole('menuitemcheckbox', { name: 'Schema hints' }).click()
    await expect(button).toHaveCount(0)
  })
})

test.describe('views and groups', () => {
  test.skip(({ isMobile }) => isMobile)

  test('switches between the views of a schema and remembers the choice', async ({ page }) => {
    await openSchema(page, 'saas')
    await expect(table(page, 'invoices')).toBeVisible()
    await expect(page.locator('article[data-kind="table"]')).toHaveCount(18)

    await page.getByRole('button', { name: 'View: All tables' }).click()
    await page.getByRole('menuitemradio', { name: 'Billing' }).click()
    await expect(page.locator('article[data-kind="table"]')).toHaveCount(5)
    await expect(table(page, 'tasks')).toHaveCount(0)
    await expect(page.getByText('5 of 18 tables, 28 relations')).toBeVisible()
    // Only the enum the shown tables use comes along.
    await expect(table(page, 'enum:subscription_status')).toBeVisible()
    await expect(table(page, 'enum:task_state')).toHaveCount(0)

    await page.reload()
    await expect(table(page, 'invoices')).toBeVisible()
    await expect(page.getByRole('button', { name: 'View: Billing' })).toBeVisible()
    await expect(page.locator('article[data-kind="table"]')).toHaveCount(5)
  })

  test('suggests groups for a schema without any and can write them to the code', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await openSchema(page, 'saas')
    await expect(table(page, 'invoices')).toBeVisible()

    // Strip the groups and views from the sample and paste it back.
    await expect.poll(() => savedSource(page)).toContain('TableGroup Billing')
    const flat = (await savedSource(page))
      .replace(/TableGroup[^{]*\{[^}]*\}\n*/g, '')
      .replace(/DiagramView[\s\S]*$/, '')
    await page.evaluate((text) => navigator.clipboard.writeText(text), flat)
    await page.locator('.cm-content').click()
    await page.keyboard.press(`${mod}+a`)
    await page.keyboard.press(`${mod}+v`)

    const chip = page.getByRole('button', { name: /\d suggested groups/ })
    await expect(chip).toBeVisible()
    await expect(page.locator('.group-region[data-suggested="true"]').first()).toBeVisible()
    await expect(page.getByText('suggested').first()).toBeVisible()

    await chip.click()
    await page.getByRole('menuitem', { name: 'Add groups to the code' }).click()
    await expect(page.getByText(/Added \d groups to the code/)).toBeVisible()
    await expect.poll(() => savedSource(page)).toContain('TableGroup')
    await expect(chip).toHaveCount(0)
    await expect(page.locator('.group-region[data-suggested="true"]')).toHaveCount(0)
  })
})

test.describe('editing in the diagram', () => {
  test.skip(({ isMobile }) => isMobile)

  test('renames a table with F2 and keeps the selection', async ({ page }) => {
    await table(page, 'shipments').focus()
    await page.keyboard.press('F2')
    const field = page.getByRole('textbox', { name: 'Table name' })
    await expect(field).toBeFocused()
    await field.fill('deliveries')
    await page.keyboard.press('Enter')

    await expect(page.getByText('Renamed shipments to deliveries')).toBeVisible()
    await expect(table(page, 'deliveries')).toBeVisible()
    await expect(table(page, 'shipments')).toHaveCount(0)
    await expect.poll(() => savedSource(page)).toContain('Table deliveries')
    await expect(page.locator('.edge:not(.edge-preview)')).toHaveCount(15)

    // The edit sits in the editor's history.
    await page.getByRole('button', { name: /Undo/ }).click()
    await expect(table(page, 'shipments')).toBeVisible()
  })

  test('renames a column from the card and from the details', async ({ page }) => {
    // Without the code panel the fitted diagram is large enough to show column rows.
    await page.keyboard.press(`${mod}+\\`)
    await select(page, 'orders')
    await table(page, 'orders').locator('[data-column="total_cents"]').dblclick()
    const field = page.getByRole('textbox', { name: 'Column name' })
    await expect(field).toBeFocused()
    await field.fill('amount_cents')
    await page.keyboard.press('Enter')
    await expect(page.getByText('Renamed total_cents to amount_cents')).toBeVisible()
    await expect(table(page, 'orders')).toContainText('amount_cents')

    const panel = details(page, 'orders')
    await panel.getByRole('button', { name: 'Rename placed_at' }).click()
    await page.getByRole('textbox', { name: 'Column name' }).fill('ordered_at')
    await page.keyboard.press('Enter')
    await expect(page.getByText('Renamed placed_at to ordered_at')).toBeVisible()
    await expect.poll(() => savedSource(page)).toContain('ordered_at timestamptz')

    // A name that is already taken is refused.
    await panel.getByRole('button', { name: 'Rename ordered_at' }).click()
    await page.getByRole('textbox', { name: 'Column name' }).fill('id')
    await page.keyboard.press('Enter')
    await expect(page.getByText('id cannot be used as a column name here')).toBeVisible()
  })

  test('adds a relation by dragging from one column to another', async ({ page }) => {
    const source = table(page, 'payments').locator('[data-column="provider"]')
    await source.hover()
    const handle = (await source.locator('.relation-handle').boundingBox())!
    const target = (await table(page, 'countries').locator('[data-column="code"]').boundingBox())!

    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
    await page.mouse.down()
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 })
    await expect(page.locator('.edge-preview')).toHaveAttribute('data-snapped', 'true')
    await page.mouse.up()

    await expect(page.getByText('Added relation payments.provider to countries.code')).toBeVisible()
    await expect.poll(() => savedSource(page)).toContain('Ref: payments.provider > countries.code')
    await expect(page.locator('.edge:not(.edge-preview)')).toHaveCount(16)
  })

  test('adds a relation from the details without dragging', async ({ page }) => {
    await table(page, 'reviews').click()
    await details(page, 'reviews').getByRole('button', { name: 'Add relation from rating' }).click()
    await page.getByPlaceholder('Type to filter').fill('countries.code')
    await page.keyboard.press('Enter')
    await expect(page.getByText('Added relation reviews.rating to countries.code')).toBeVisible()
  })

  test('routes lines around tables after a table was moved by hand', async ({ page }) => {
    const crossing = () =>
      page.evaluate(() => {
        const cards = [...document.querySelectorAll<HTMLElement>('article[data-kind="table"]')]
        const rects = cards.map((card) => ({
          id: card.dataset.tableId,
          box: card.getBoundingClientRect(),
        }))
        let count = 0
        for (const line of document.querySelectorAll<SVGPathElement>(
          '.edge:not(.edge-preview) .edge-line',
        )) {
          const refId = line.parentElement?.getAttribute('data-ref-id') ?? ''
          const length = line.getTotalLength()
          const matrix = line.getScreenCTM()!
          for (let at = 2; at < length - 2; at += 4) {
            const p = line.getPointAtLength(at).matrixTransform(matrix)
            const hit = rects.find(
              ({ id, box }) =>
                id &&
                !refId.includes(id) &&
                p.x > box.left + 1 &&
                p.x < box.right - 1 &&
                p.y > box.top + 1 &&
                p.y < box.bottom - 1,
            )
            if (hit) {
              count += 1
              break
            }
          }
        }
        return count
      })

    // Drop categories on the far side of product_images: its relation must go around.
    const from = (await table(page, 'categories').boundingBox())!
    const blocker = (await table(page, 'product_images').boundingBox())!
    await page.mouse.move(from.x + 40, from.y + 12)
    await page.mouse.down()
    await page.mouse.move(blocker.x + blocker.width + 90, blocker.y + 30, { steps: 10 })
    await page.mouse.up()
    await expect(page.getByRole('button', { name: /Tidy up/ })).toBeVisible()
    expect(await crossing()).toBe(0)
  })
})
