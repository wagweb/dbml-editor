import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { openSchema } from './fixtures.ts'

const table = (page: Page, name: string) => page.locator(`article[data-table-id="${name}"]`)
const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

/** Types at the end of the document without triggering bracket auto-closing. */
async function appendCode(page: Page, text: string) {
  await page.locator('.cm-content').click()
  await page.keyboard.press(`${mod}+End`)
  await page.keyboard.insertText(text)
}

test.beforeEach(async ({ page }) => {
  await openSchema(page, 'storefront')
  await expect(table(page, 'orders')).toBeVisible()
})

test.describe('desktop', () => {
  test.skip(({ isMobile }) => isMobile)

  test('draws a schema opened from a link', async ({ page }) => {
    // 11 tables, two enums and one sticky note; 13 relations plus two enum links.
    await expect(page.locator('article[data-kind="table"]')).toHaveCount(11)
    await expect(page.locator('article[data-kind="enum"]')).toHaveCount(2)
    await expect(page.locator('article[data-kind="note"]')).toHaveCount(1)
    await expect(page.locator('.edge:not(.edge-preview)')).toHaveCount(15)
    await expect(page.getByText('11 tables, 13 relations')).toBeVisible()
    await expect(page).toHaveTitle(/Storefront/)
  })

  test('adds a table to the diagram while typing', async ({ page }) => {
    await appendCode(
      page,
      '\nTable coupons {\n  id uuid [pk]\n  order_id uuid [ref: > orders.id]\n}\n',
    )
    await expect(table(page, 'coupons')).toBeVisible()
    await expect(page.locator('.edge:not(.edge-preview)')).toHaveCount(16)
    await expect(page.getByText('12 tables, 14 relations')).toBeVisible()
  })

  test('keeps the last valid diagram and points to the problem when the code breaks', async ({
    page,
  }) => {
    await appendCode(page, '\nRef: orders.customer_id > nowhere.id\n')
    await expect(page.getByText('Showing the last version without errors')).toBeVisible()
    await expect(page.getByRole('button', { name: /1 error/ })).toBeVisible()
    await expect(page.locator('article[data-kind="table"]')).toHaveCount(11)

    await page.getByRole('button', { name: 'Go to problem' }).click()
    await expect(page.locator('.cm-content')).toBeFocused()
  })

  test('shows details and highlights relations for a selected table', async ({ page }) => {
    await table(page, 'orders').click()
    const details = page.getByRole('complementary', { name: 'Details of table orders' })
    await expect(details).toBeVisible()
    await expect(details.getByRole('button', { name: /^shipping_address_id uuid/ })).toBeVisible()
    // Five relations plus the link from status to its enum.
    await expect(page.locator('.edge[data-active="true"]')).toHaveCount(6)
    await expect(table(page, 'categories')).toHaveAttribute('data-dimmed', 'true')
    await expect(table(page, 'customers')).toHaveAttribute('data-dimmed', 'false')

    // Walking a relation from the panel moves the selection.
    await details.getByRole('tab', { name: /Relations/ }).click()
    await details.getByRole('button', { name: /customers/ }).click()
    await expect(
      page.getByRole('complementary', { name: 'Details of table customers' }),
    ).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByRole('complementary')).toHaveCount(0)
  })

  test('finds a table through search', async ({ page }) => {
    await page.keyboard.press(`${mod}+k`)
    await page.getByPlaceholder('Search tables, columns and actions').fill('review')
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
    await details.getByRole('button', { name: 'Move right' }).click()
    await expect
      .poll(async () => (await table(page, 'countries').boundingBox())!.x)
      .toBeGreaterThan(x)

    // Closing the panel hands focus back to the table.
    await page.keyboard.press('Escape')
    await expect(table(page, 'countries')).toBeFocused()
  })

  test('keeps the zoom when a table is clicked far out', async ({ page }) => {
    const world = page.locator('.canvas-world')
    const toolbar = page.getByRole('group', { name: 'Diagram view' })
    const scale = () =>
      world.evaluate((element) => /scale\(([\d.]+)\)/.exec(element.style.transform)?.[1])
    const near = (await toolbar.boundingBox())!.width
    for (let step = 0; step < 3; step += 1) {
      await page.getByRole('button', { name: 'Zoom out' }).click()
      await page.waitForTimeout(400)
    }
    await expect(world).toHaveAttribute('data-lod', 'far')
    // "Show columns" takes the place of the detail switch without changing the width.
    await expect(page.getByRole('button', { name: 'Show columns' })).toBeVisible()
    await expect(page.getByRole('radio', { name: 'Keys' })).toBeHidden()
    expect((await toolbar.boundingBox())!.width).toBe(near)
    const before = await scale()

    // Zooming in on a click switched every card to rows mid-move, which read as a flicker.
    await table(page, 'orders').click()
    await expect(page.getByRole('complementary', { name: 'Details of table orders' })).toBeVisible()
    await page.waitForTimeout(700)
    expect(await scale()).toBe(before)
    await expect(world).toHaveAttribute('data-lod', 'far')
  })

  test('does not flicker while the pointer crosses the diagram', async ({ page }) => {
    await table(page, 'orders').click()
    await expect(page.getByRole('complementary', { name: 'Details of table orders' })).toBeVisible()
    await page.waitForTimeout(500)

    // Count every change of a highlight while the pointer sweeps over other tables.
    await page.evaluate(() => {
      const state = window as unknown as { highlightChanges: number }
      state.highlightChanges = 0
      new MutationObserver((records) => {
        state.highlightChanges += records.length
      }).observe(document.querySelector('.canvas-world')!, {
        attributes: true,
        attributeFilter: ['data-active'],
        subtree: true,
      })
    })
    const from = (await table(page, 'countries').boundingBox())!
    const to = (await table(page, 'categories').boundingBox())!
    await page.mouse.move(from.x + 20, from.y + 20)
    await page.mouse.move(to.x + 20, to.y + 20, { steps: 25 })
    const changes = await page.evaluate(
      () => (window as unknown as { highlightChanges: number }).highlightChanges,
    )
    expect(changes).toBe(0)

    // With a table selected, resting on another one changes nothing either; the next
    // click decides. Without a selection, resting on a table lights its relations.
    await page.waitForTimeout(300)
    await expect(page.locator('.edge[data-active="true"]')).toHaveCount(6)
    await page.keyboard.press('Escape')
    await expect(page.locator('.edge[data-active="true"]')).not.toHaveCount(0)
  })

  test('selecting tables does not spawn GPU layers', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'The layer tree is a Chrome DevTools feature')
    // An opacity animation gives an element its own GPU layer, and everything above it
    // follows. A click once doubled the layers for a moment and Chrome showed a frame
    // without content.
    const cdp = await page.context().newCDPSession(page)
    let latest = 0
    let largest = 0
    cdp.on('LayerTree.layerTreeDidChange', (event) => {
      latest = event.layers?.length ?? 0
      largest = Math.max(largest, latest)
    })
    await cdp.send('LayerTree.enable')
    for (const name of ['orders', 'customers', 'countries']) {
      await table(page, name).click()
      await page.waitForTimeout(400)
    }
    await page.waitForTimeout(400)
    // While a selection changes, the layer count stays where it settles afterwards.
    expect(largest - latest).toBeLessThanOrEqual(3)
  })

  test('reduces tables to their keys', async ({ page }) => {
    await page.getByRole('radio', { name: 'Keys' }).click()
    await expect(table(page, 'customers')).toContainText('4 more columns')
    await expect(table(page, 'customers')).not.toContainText('full_name')
  })

  test('slides the switch thumb onto the chosen segment', async ({ page }) => {
    const detail = page.getByRole('radiogroup', { name: 'Column detail' })
    const thumb = detail.locator('span[aria-hidden]')
    const names = detail.getByRole('radio', { name: 'Names' })
    await names.click()
    await expect(names).toHaveAttribute('data-state', 'on')
    // Settled, the thumb covers exactly the chosen segment.
    await expect(async () => {
      const [a, b] = [(await thumb.boundingBox())!, (await names.boundingBox())!]
      expect(Math.abs(a.x - b.x)).toBeLessThan(0.5)
      expect(Math.abs(a.width - b.width)).toBeLessThan(0.5)
    }).toPass()
  })

  test('slides the code panel shut and open like a drawer', async ({ page }) => {
    const pane = page.locator('section.editor-pane')
    const full = (await pane.boundingBox())!.width
    const toggle = page.getByRole('button', { name: 'Code panel' })
    // Measured inside the page, a frame after the click, so the motion is surely running.
    const midway = () =>
      toggle.evaluate(async (button: HTMLElement) => {
        const section = document.querySelector<HTMLElement>('section.editor-pane')!
        const body = section.querySelector<HTMLElement>('.editor-pane-body')!
        button.click()
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
        return {
          motion: section.dataset.motion,
          inert: section.inert,
          pane: section.getBoundingClientRect().width,
          body: body.getBoundingClientRect().width,
        }
      })

    const closing = await midway()
    expect(closing.motion).toBe('closing')
    // Out of reach at once, and the code keeps its width, so no line re-wraps on the way.
    expect(closing.inert).toBe(true)
    expect(closing.pane).toBeLessThan(full)
    expect(closing.body).toBeCloseTo(full, 0)
    await expect(pane).toBeHidden()

    const opening = await midway()
    expect(opening.motion).toBe('opening')
    expect(opening.inert).toBe(false)
    expect(opening.pane).toBeLessThan(full)
    expect(opening.body).toBeCloseTo(full, 0)
    await expect(pane).not.toHaveAttribute('data-motion')
    expect((await pane.boundingBox())!.width).toBeCloseTo(full, 0)
  })

  test('shows and hides the code at once with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const pane = page.locator('section.editor-pane')
    await page.getByRole('button', { name: 'Code panel' }).click()
    await expect(pane).toBeHidden()
    await expect(pane).not.toHaveAttribute('data-motion')
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
    await page.getByRole('menuitem', { name: 'New diagram' }).click()
    await expect(table(page, 'posts')).toBeVisible()
    await expect(table(page, 'orders')).toHaveCount(0)

    await page.getByRole('button', { name: 'Untitled diagram' }).click()
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
    const view = page.getByRole('button', { name: 'View options' })
    const choose = async (theme: string) => {
      await view.click()
      // Arrow right enters the submenu, as in any native menu.
      await page.getByRole('menuitem', { name: /Theme/ }).focus()
      await page.keyboard.press('ArrowRight')
      await page.getByRole('menuitemradio', { name: theme }).press('Enter')
    }

    await view.click()
    await page.getByRole('menuitem', { name: /Theme/ }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('menuitemradio', { name: 'Match system' })).toBeChecked()
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')

    await choose('Dark')
    await expect(html).toHaveAttribute('data-theme', 'dark')
    await choose('Light')
    await expect(html).toHaveAttribute('data-theme', 'light')
  })

  test('marks the active menu entry with a ring for keyboard users only', async ({ page }) => {
    await page.getByRole('button', { name: 'Storefront' }).click()
    const item = page.getByRole('menuitem', { name: 'New diagram' })
    const shadow = () => item.evaluate((element) => getComputedStyle(element).boxShadow)

    await item.hover()
    await expect(item).toHaveAttribute('data-highlighted')
    expect(await shadow()).toBe('none')

    // Radix moves focus a task after the key, so each step is awaited before the next.
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('menuitem', { name: /Open DBML file/ })).toHaveAttribute(
      'data-highlighted',
    )
    await page.keyboard.press('ArrowUp')
    await expect(item).toHaveAttribute('data-highlighted')
    // The highlight moves on the next frame; poll instead of reading once.
    await expect.poll(shadow).toContain('inset')
  })

  test('keeps a menu button highlighted while its menu is open', async ({ page }) => {
    // While a menu is open the rest of the page is hidden from assistive technology,
    // so the buttons are found by their label attribute instead of their role.
    for (const label of ['View options', 'Storefront']) {
      const trigger = page
        .locator(`button[aria-label="${label}"], button:has-text("${label}")`)
        .first()
      const rest = await trigger.evaluate((element) => getComputedStyle(element).backgroundColor)
      await trigger.click()
      await page.mouse.move(5, 400)
      await expect(trigger).toHaveAttribute('data-state', 'open')
      expect(
        await trigger.evaluate((element) => getComputedStyle(element).backgroundColor),
      ).not.toBe(rest)
      await page.keyboard.press('Escape')
    }
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

  test('keeps zoomed-out names inside their table and labels groups in the overview', async ({
    page,
  }) => {
    const world = page.locator('.canvas-world')
    const zoomOut = page.getByRole('button', { name: 'Zoom out' })
    /** Labels whose text reaches outside the table they belong to. */
    const spilling = () =>
      page.evaluate(
        () =>
          [...document.querySelectorAll('article[data-table-id]')].filter((table) => {
            const label = table.querySelector('.table-lod')
            if (!label || getComputedStyle(label).visibility === 'hidden') return false
            const box = table.getBoundingClientRect()
            return [...label.children].some((line) => {
              const text = line.getBoundingClientRect()
              return text.left < box.left - 0.5 || text.right > box.right + 0.5
            })
          }).length,
      )

    /** Zooms out step by step; each step is animated, so it waits before the next one. */
    const zoomOutUntil = async (level: string) => {
      for (let step = 0; step < 14; step += 1) {
        if ((await world.getAttribute('data-lod')) === level) return
        await zoomOut.click()
        await page.waitForTimeout(400)
      }
    }

    await zoomOutUntil('far')
    await expect(world).toHaveAttribute('data-lod', 'far')
    await expect(table(page, 'product_images').locator('.table-lod')).toBeVisible()
    expect(await spilling()).toBe(0)

    await zoomOutUntil('overview')
    await expect(world).toHaveAttribute('data-lod', 'overview')
    expect(await spilling()).toBe(0)
    await expect(page.locator('.group-overview', { hasText: 'Catalog' })).toBeVisible()
    await expect(table(page, 'product_images').locator('.table-lod')).toBeHidden()
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
