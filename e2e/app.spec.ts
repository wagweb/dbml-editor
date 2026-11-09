import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const table = (page: Page, name: string) => page.locator(`article[data-table-id="${name}"]`)
const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

/** Types at the end of the document without triggering bracket auto-closing. */
async function appendCode(page: Page, text: string) {
  await page.locator('.cm-content').click()
  await page.keyboard.press(`${mod}+End`)
  await page.keyboard.insertText(text)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(table(page, 'orders')).toBeVisible()
})

test.describe('desktop', () => {
  test.skip(({ isMobile }) => isMobile)

  test('draws the example schema on first visit', async ({ page }) => {
    await expect(page.locator('article[data-table-id]')).toHaveCount(11)
    await expect(page.locator('.edge')).toHaveCount(13)
    await expect(page.getByText('11 tables, 13 relations')).toBeVisible()
    await expect(page).toHaveTitle(/Storefront/)
  })

  test('adds a table to the diagram while typing', async ({ page }) => {
    await appendCode(
      page,
      '\nTable coupons {\n  id uuid [pk]\n  order_id uuid [ref: > orders.id]\n}\n',
    )
    await expect(table(page, 'coupons')).toBeVisible()
    await expect(page.locator('.edge')).toHaveCount(14)
    await expect(page.getByText('12 tables, 14 relations')).toBeVisible()
  })

  test('keeps the last valid diagram and points to the problem when the code breaks', async ({
    page,
  }) => {
    await appendCode(page, '\nRef: orders.customer_id > nowhere.id\n')
    await expect(page.getByText('Showing the last version without errors')).toBeVisible()
    await expect(page.getByRole('button', { name: /1 error/ })).toBeVisible()
    await expect(page.locator('article[data-table-id]')).toHaveCount(11)

    await page.getByRole('button', { name: 'Go to problem' }).click()
    await expect(page.locator('.cm-content')).toBeFocused()
  })

  test('shows details and highlights relations for a selected table', async ({ page }) => {
    await table(page, 'orders').click()
    const details = page.getByRole('complementary', { name: 'Details of table orders' })
    await expect(details).toBeVisible()
    await expect(details.getByRole('button', { name: /^shipping_address_id uuid/ })).toBeVisible()
    await expect(page.locator('.edge[data-active="true"]')).toHaveCount(5)
    await expect(table(page, 'categories')).toHaveAttribute('data-dimmed', 'true')
    await expect(table(page, 'customers')).toHaveAttribute('data-dimmed', 'false')

    // Walking a relation from the panel moves the selection.
    await details.getByRole('button', { name: /customers/ }).click()
    await expect(
      page.getByRole('complementary', { name: 'Details of table customers' }),
    ).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByRole('complementary')).toHaveCount(0)
  })

  test('finds a table through search', async ({ page }) => {
    await page.keyboard.press(`${mod}+k`)
    await page.getByPlaceholder('Search tables and actions').fill('review')
    await page.keyboard.press('Enter')
    await expect(
      page.getByRole('complementary', { name: 'Details of table reviews' }),
    ).toBeVisible()
    await expect(table(page, 'reviews')).toHaveAttribute('data-selected', 'true')
  })

  test('hands layout control to the user after a drag and takes it back on tidy up', async ({
    page,
  }) => {
    await expect(page.getByRole('button', { name: /Auto layout is on/ })).toBeVisible()

    const box = (await table(page, 'countries').boundingBox())!
    await page.mouse.move(box.x + 30, box.y + 12)
    await page.mouse.down()
    await page.mouse.move(box.x + 30, box.y + 160, { steps: 8 })
    await page.mouse.up()

    const moved = (await table(page, 'countries').boundingBox())!
    expect(moved.y).toBeGreaterThan(box.y + 80)
    const tidy = page.getByRole('button', { name: /Tidy up/ })
    await expect(tidy).toBeVisible()

    await tidy.click()
    await expect(page.getByText('Diagram tidied up')).toBeVisible()
    await expect(page.getByRole('button', { name: /Auto layout is on/ })).toBeVisible()
    await page.getByRole('button', { name: /Undo/ }).click()
    await expect(page.getByRole('button', { name: /Tidy up/ })).toBeVisible()
  })

  test('moves a table without dragging', async ({ page }) => {
    const before = (await table(page, 'countries').boundingBox())!
    await table(page, 'countries').focus()
    await page.keyboard.press('Shift+ArrowDown')
    await page.keyboard.press('Shift+ArrowDown')
    await expect
      .poll(async () => (await table(page, 'countries').boundingBox())!.y)
      .toBeGreaterThan(before.y + 10)
    await expect(page.getByRole('button', { name: /Tidy up/ })).toBeVisible()

    await page.keyboard.press('Enter')
    const details = page.getByRole('complementary', { name: 'Details of table countries' })
    await expect(details).toBeFocused()
    const x = (await table(page, 'countries').boundingBox())!.x
    await details.getByRole('button', { name: 'Move table right' }).click()
    await expect
      .poll(async () => (await table(page, 'countries').boundingBox())!.x)
      .toBeGreaterThan(x)

    // Closing the panel hands focus back to the table.
    await page.keyboard.press('Escape')
    await expect(table(page, 'countries')).toBeFocused()
  })

  test('reduces tables to their keys', async ({ page }) => {
    await page.getByRole('radio', { name: 'Keys' }).click()
    await expect(table(page, 'customers')).toContainText('4 more columns')
    await expect(table(page, 'customers')).not.toContainText('full_name')
  })

  test('remembers edits after a reload', async ({ page }) => {
    await appendCode(page, '\nTable audit_log {\n  id int [pk]\n}\n')
    await expect(table(page, 'audit_log')).toBeVisible()
    // Saving is debounced.
    await page.waitForTimeout(700)
    await page.reload()
    await expect(table(page, 'audit_log')).toBeVisible()
  })

  test('manages several diagrams', async ({ page }) => {
    await page.getByRole('button', { name: 'Storefront' }).click()
    await page.getByRole('menuitem', { name: 'Blog' }).click()
    await expect(table(page, 'posts')).toBeVisible()
    await expect(table(page, 'orders')).toHaveCount(0)

    await page.getByRole('button', { name: 'Blog' }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await expect(table(page, 'orders')).toBeVisible()
    await page.getByRole('button', { name: /Undo/ }).click()
    await expect(table(page, 'posts')).toBeVisible()
  })

  test('exports SQL for the chosen database', async ({ page }) => {
    await page.getByRole('button', { name: 'Export' }).click()
    await page.getByRole('menuitem', { name: 'SQL script' }).click()
    const dialog = page.getByRole('dialog', { name: 'Export as SQL' })
    await expect(dialog.getByLabel('SQL script')).toContainText('CREATE TABLE "customers"', {
      timeout: 20_000,
    })
    await dialog.getByRole('radio', { name: 'MySQL' }).click()
    await expect(dialog.getByLabel('SQL script')).toContainText('CREATE TABLE `customers`', {
      timeout: 20_000,
    })
  })

  test('turns pasted SQL into a new diagram', async ({ page }) => {
    await page.getByRole('button', { name: 'Storefront' }).click()
    await page.getByRole('menuitem', { name: 'Import from SQL' }).click()
    const dialog = page.getByRole('dialog', { name: 'Import from SQL' })
    await dialog
      .getByLabel('SQL statements')
      .fill(
        'CREATE TABLE authors (id INT PRIMARY KEY);\nCREATE TABLE books (id INT PRIMARY KEY, author_id INT REFERENCES authors(id));',
      )
    await dialog.getByRole('button', { name: 'Create diagram' }).click()
    await expect(table(page, 'books')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('.edge')).toHaveCount(1)
  })

  test('opens a diagram from a share link', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.getByRole('button', { name: 'Share' }).click()
    await expect(page.getByText(/Link copied/)).toBeVisible()
    const link = await page.evaluate(() => navigator.clipboard.readText())
    expect(link).toContain('#d=')

    const visitor = await context.newPage()
    await visitor.addInitScript(() => window.localStorage.clear())
    await visitor.goto(link)
    await expect(table(visitor, 'orders')).toBeVisible()
    await expect(visitor).toHaveURL(/^[^#]*$/)
  })

  test('switches between light, dark and the system theme', async ({ page }) => {
    const html = page.locator('html')
    const view = page.getByRole('button', { name: 'View', exact: true })

    await view.click()
    await expect(page.getByRole('menuitemradio', { name: 'Match system' })).toBeChecked()
    await page.getByRole('menuitemradio', { name: 'Dark' }).click()
    await expect(html).toHaveAttribute('data-theme', 'dark')

    await view.click()
    await page.getByRole('menuitemradio', { name: 'Light' }).click()
    await expect(html).toHaveAttribute('data-theme', 'light')
  })

  test('marks the active menu entry with a ring for keyboard users only', async ({ page }) => {
    await page.getByRole('button', { name: 'Storefront' }).click()
    const item = page.getByRole('menuitem', { name: 'New diagram' })
    const shadow = () => item.evaluate((element) => getComputedStyle(element).boxShadow)

    await item.hover()
    await expect(item).toHaveAttribute('data-highlighted', '')
    expect(await shadow()).toBe('none')

    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowUp')
    await expect(item).toHaveAttribute('data-highlighted', '')
    expect(await shadow()).not.toBe('none')
  })

  test('shows the overview map only while part of the diagram is out of view', async ({ page }) => {
    const map = page.getByRole('img', { name: 'Overview map of the diagram', includeHidden: true })
    await expect(map).toHaveAttribute('data-visible', 'false')
    await page.getByRole('button', { name: 'Zoom in' }).click()
    await page.getByRole('button', { name: 'Zoom in' }).click()
    await page.getByRole('button', { name: 'Zoom in' }).click()
    await expect(map).toHaveAttribute('data-visible', 'true')
    await page.getByRole('button', { name: 'Fit diagram to screen' }).click()
    await expect(map).toHaveAttribute('data-visible', 'false')
  })

  test('can be operated from the keyboard', async ({ page }) => {
    await table(page, 'customers').focus()
    await page.keyboard.press('Enter')
    await expect(
      page.getByRole('complementary', { name: 'Details of table customers' }),
    ).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('complementary')).toHaveCount(0)

    await page.keyboard.press('?')
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
  })

  for (const theme of ['light', 'dark'] as const) {
    test(`has no detectable accessibility violations in the ${theme} theme`, async ({ page }) => {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value
      }, theme)
      await table(page, 'orders').click()
      await expect(page.getByRole('complementary')).toBeVisible()
      // Entrance animations fade content in; contrast is only meaningful once they finish.
      await page.waitForTimeout(500)
      const results = await new AxeBuilder({ page }).analyze()
      const summary = results.violations.map(
        (v) =>
          `${v.id}: ${v.help}\n` +
          v.nodes
            .slice(0, 6)
            .map((n) => `  ${n.target.join(' ')}: ${n.any[0]?.message ?? n.failureSummary}`)
            .join('\n'),
      )
      expect(summary).toEqual([])
    })
  }
})

test.describe('mobile @mobile', () => {
  test.skip(({ isMobile }) => !isMobile)

  test('shows one panel at a time', async ({ page }) => {
    await expect(page.locator('.cm-content')).toBeHidden()
    await page.getByRole('button', { name: 'Show code' }).click()
    await expect(page.locator('.cm-content')).toBeVisible()
    await expect(table(page, 'orders')).toBeHidden()
    await page.getByRole('button', { name: 'Show diagram' }).click()
    await expect(table(page, 'orders')).toBeVisible()
  })
})
