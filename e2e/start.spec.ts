import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { schemaSource, skipTips } from './fixtures.ts'

const table = (page: Page, name: string) => page.locator(`article[data-table-id="${name}"]`)
const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
const start = (page: Page) => page.getByRole('heading', { name: 'Start a diagram' })

/** Sends text the way a paste from the clipboard arrives. */
async function paste(page: Page, text: string) {
  await page.evaluate((value) => {
    const data = new DataTransfer()
    data.setData('text/plain', value)
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
  }, text)
}

/** Drops a file onto the page, with the drag over it first so the overlay can show. */
async function drop(page: Page, name: string, text: string, check?: () => Promise<void>) {
  const transfer = await page.evaluateHandle(
    ({ fileName, content }) => {
      const data = new DataTransfer()
      data.items.add(new File([content], fileName, { type: 'text/plain' }))
      return data
    },
    { fileName: name, content: text },
  )
  await page.dispatchEvent('main', 'dragenter', { dataTransfer: transfer })
  if (check) await check()
  await page.dispatchEvent('main', 'drop', { dataTransfer: transfer })
}

test.beforeEach(async ({ page }) => {
  await skipTips(page)
  await page.goto('/')
  await expect(start(page)).toBeVisible()
})

test.describe('start screen', () => {
  test('greets a first visit without examples and starts a new diagram', async ({ page }) => {
    await expect(page.getByRole('button', { name: /New diagram/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Open a DBML file/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Import from SQL/ })).toBeVisible()
    // Nothing that only makes sense with a diagram.
    await expect(page.getByRole('button', { name: 'Export' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Code panel' })).toHaveCount(0)

    await page.getByRole('button', { name: /New diagram/ }).click()
    await expect(table(page, 'users')).toBeVisible()
    await expect(table(page, 'posts')).toBeVisible()
    await expect(page.locator('.cm-content')).toBeFocused()

    // Deleting the only diagram leads back here; undo brings it back.
    await page.getByRole('button', { name: 'Untitled diagram' }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await expect(start(page)).toBeVisible()
    await page.getByRole('button', { name: /Undo/ }).click()
    await expect(table(page, 'users')).toBeVisible()
  })

  test('turns pasted DBML into a diagram named after its project', async ({ page }) => {
    await paste(page, schemaSource('storefront'))
    await expect(table(page, 'orders')).toBeVisible()
    await expect(page.getByRole('button', { name: 'storefront' })).toBeVisible()
  })

  test('keeps the indentation pasted code comes with', async ({ page }) => {
    await paste(page, 'Table users {\n    id int [pk]\n    name text\n}\n')
    await expect(table(page, 'users')).toBeVisible()
    await page.getByRole('button', { name: 'View options' }).click()
    await expect(page.getByRole('menuitem', { name: /Indentation/ })).toContainText('4 spaces')
  })

  test('sends pasted SQL through the import with the database guessed', async ({ page }) => {
    await paste(page, 'CREATE TABLE `authors` (\n  `id` INT PRIMARY KEY\n) ENGINE=InnoDB;')
    const dialog = page.getByRole('dialog', { name: 'Import from SQL' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('SQL statements')).toHaveValue(/CREATE TABLE `authors`/)
    await expect(dialog.getByRole('radio', { name: 'MySQL' })).toHaveAttribute('data-state', 'on')
    await dialog.getByRole('button', { name: 'Create diagram' }).click()
    await expect(table(page, 'authors')).toBeVisible({ timeout: 20_000 })
  })

  test('opens a dropped DBML file', async ({ page }) => {
    await drop(page, 'library.dbml', 'Table books {\n  id int [pk]\n}\n', async () => {
      await expect(page.getByText('Drop to open')).toBeVisible()
    })
    await expect(table(page, 'books')).toBeVisible()
    await expect(page.getByRole('button', { name: 'library' })).toBeVisible()
    await expect(page.getByText('Drop to open')).toHaveCount(0)
  })

  test('says so when the pasted text is neither DBML nor SQL', async ({ page }) => {
    await paste(page, 'just some words')
    await expect(page.getByText('That does not look like DBML or SQL')).toBeVisible()
    await expect(start(page)).toBeVisible()
  })

  for (const theme of ['light', 'dark'] as const) {
    test(`has no detectable accessibility violations in the ${theme} theme`, async ({ page }) => {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value
      }, theme)
      await page.waitForTimeout(1200)
      const results = await new AxeBuilder({ page }).analyze()
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
    })
  }
})

test.describe('files', () => {
  test.skip(({ isMobile }) => isMobile)

  test('opens a DBML file and saves changes back to it', async ({ page }) => {
    // A fake File System Access API: one file that remembers what was written to it.
    await page.addInitScript(() => {
      const state = { text: 'Table files_demo {\n  id int [pk]\n}\n', written: [] as string[] }
      const handle = {
        kind: 'file',
        name: 'schema.dbml',
        getFile: async () => new File([state.text], 'schema.dbml', { lastModified: 1 }),
        createWritable: async () => ({
          write: async (text: string) => {
            state.text = text
            state.written.push(text)
          },
          close: async () => undefined,
        }),
        isSameEntry: async (other: unknown) => other === handle,
        queryPermission: async () => 'granted',
        requestPermission: async () => 'granted',
      }
      Object.setPrototypeOf(handle, FileSystemFileHandle.prototype)
      Object.assign(window, {
        showOpenFilePicker: async () => [handle],
        showSaveFilePicker: async () => handle,
        __fileState: state,
      })
    })
    // Fresh browser, no diagrams: the file opens from the start screen.
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Start a diagram' })).toBeVisible()

    await page.keyboard.press(`${mod}+o`)
    await expect(table(page, 'files_demo')).toBeVisible()
    await expect(page.getByRole('button', { name: /schema/ })).toBeVisible()

    await page.locator('.cm-content').click()
    await page.keyboard.press(`${mod}+End`)
    await page.keyboard.insertText('\nTable extra {\n  id int [pk]\n}\n')
    await expect(table(page, 'extra')).toBeVisible()
    await expect(page.getByText(', unsaved changes')).toBeAttached()

    await page.keyboard.press(`${mod}+s`)
    await expect(page.getByText('Saved schema.dbml')).toBeVisible()
    await expect(page.getByText(', unsaved changes')).toHaveCount(0)
    const written = await page.evaluate(
      () => (window as unknown as { __fileState: { written: string[] } }).__fileState.written,
    )
    expect(written).toHaveLength(1)
    expect(written[0]).toContain('Table extra')
  })
})
