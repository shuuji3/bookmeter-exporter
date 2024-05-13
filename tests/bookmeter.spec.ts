import { createWriteStream, existsSync } from 'node:fs'
import { Readable } from 'node:stream'
import { writeFile, mkdir } from 'node:fs/promises'
import { stringify } from 'csv-stringify/sync'
import { test, expect, errors, type Locator, type Page } from '@playwright/test'
import { type Book, type BookWithReview, Profile } from './types'
import { finished } from 'node:stream/promises'

const EMAIL = process.env.EMAIL
const PASSWORD = process.env.PASSWORD

let page: Page
let USER_ID: string

test.beforeAll('login to the account', async ({ browser }) => {
  page = await browser.newPage()

  await page.goto('https://bookmeter.com/login')
  await page.getByPlaceholder('sample@bookmeter.com').fill(EMAIL)
  await page.getByLabel('パスワード').fill(PASSWORD)
  await page.getByRole('button', { name: 'ログイン' }).click()
  await page.getByRole('link', { name: / さんのマイページ/ }).click()
  USER_ID = await page.evaluate(
    () => window.location.href.split('/').slice(-1)[0]
  )
})

async function downloadImage(iconUrl: string) {
  const extension = iconUrl.split('.').slice(-1)[0]
  const res = await fetch(iconUrl)
  const writeStream = createWriteStream(`export/profile.${extension}`)
  await finished(
    // @ts-ignore
    Readable.fromWeb(res.body).pipe(writeStream)
  )
}

test('プロフィールのデータをエクスポート', async () => {
  const img = page.getByRole('figure').getByRole('img')
  const name = await img.getAttribute('alt')
  const iconUrl = await img.getAttribute('src')

  const registrationDate = (
    await page.locator('.userdata dl > dd:nth-child(2)').textContent()
  ).replace(/^(\d+)\/(\d+)\/(\d+)（.+$/, '$1-$2-$3')

  const firstRecordingDate = (
    await page.locator('.userdata dl > dd:nth-child(4)').textContent()
  ).replace(/^(\d+)\/(\d+)\/(\d+)（.+$/, '$1-$2-$3')

  const profile: Profile = {
    id: USER_ID,
    name,
    iconUrl,
    registrationDate,
    firstRecordingDate,
  }

  await saveProfile(profile)
  await downloadImage(iconUrl)
})

test('「読んだ本」ページのデータをエクスポート', async () => {
  await page.goto(
    `https://bookmeter.com/users/${USER_ID}/books/read?display_type=list`
  )
  expect(page.getByText('読了日', { exact: true }))
  expect(page.getByText('編集する', { exact: true }))

  const getBooksFromPage = async () => {
    const bookRows = page.locator('.book-list__group .book__detail')
    return getBooksFromBookRows(bookRows)
  }
  const books =
    await getBooksFromPaginatedPages<BookWithReview>(getBooksFromPage)

  await saveBooks('finished-books', books)
})

test('「読んでる本」ページのデータをエクスポート', async () => {
  await page.goto(`https://bookmeter.com/users/${USER_ID}/books/reading`)

  const getBooksFromPage = async () => {
    const bookThumbnails = page.locator('.books .book__thumbnail')
    return getBooksFromBookThumbnails(bookThumbnails)
  }
  const books = await getBooksFromPaginatedPages<Book>(getBooksFromPage)

  await saveBooks('reading-books', books)
})

test('「積読本」ページのデータをエクスポート', async () => {
  await page.goto(`https://bookmeter.com/users/${USER_ID}/books/stacked`)

  const getBooksFromPage = async () => {
    const bookThumbnails = page.locator('.books .book__thumbnail')
    return getBooksFromBookThumbnails(bookThumbnails)
  }
  const books = await getBooksFromPaginatedPages<Book>(getBooksFromPage)

  await saveBooks('reading-list-books', books)
})

test('「読みたい本」ページのデータをエクスポート', async () => {
  await page.goto(`https://bookmeter.com/users/${USER_ID}/books/wish`)

  const getBooksFromPage = async () => {
    const bookThumbnails = page.locator('.books .book__thumbnail')
    return getBooksFromBookThumbnails(bookThumbnails)
  }
  const books = await getBooksFromPaginatedPages<Book>(getBooksFromPage)

  await saveBooks('wish-list-books', books)
})

function getBooksFromBookRows(bookRows: Locator) {
  return bookRows.evaluateAll((bookRows) =>
    bookRows.map((bookRow) => {
      const data = JSON.parse(
        bookRow.querySelector<HTMLDivElement>('.detail__edit > div').dataset
          .modal
      )
      const {
        author: bookAuthor,
        pages: bookPage,
        book: {
          id: bookId,
          asin: bookAsin,
          title: bookTitle,
          image_url: bookImageUrl,
        },
        review: {
          text: reviewText,
          is_netabare: reviewIsSpoiler,
          read_at: reviewDate,
          is_draft: reviewIsDraft,
        },
        bookcases: bookcaseNames,
      } = data

      return {
        bookAuthor,
        bookPage,
        bookId,
        bookAsin,
        bookTitle,
        bookImageUrl,
        reviewDate,
        reviewText,
        reviewIsSpoiler,
        reviewIsDraft,
        bookcaseNames,
      }
    })
  )
}

async function getBooksFromBookThumbnails(bookList: Locator): Promise<Book[]> {
  return bookList.evaluateAll((bookList) =>
    bookList.map((bookThumbnail) => {
      const data = JSON.parse(
        bookThumbnail.querySelector<HTMLDivElement>('.thumbnail__action > div')
          .dataset.modal
      )
      const {
        book: {
          id: bookId,
          asin: bookAsin,
          title: bookTitle,
          author: bookAuthor,
          image_url: bookImageUrl,
          page: bookPage,
        },
      } = data

      return {
        bookAuthor,
        bookPage,
        bookId,
        bookAsin,
        bookTitle,
        bookImageUrl,
      }
    })
  )
}

async function saveBooks(basename: string, data: Book[]) {
  if (!existsSync('export')) {
    await mkdir('export')
  }
  await writeFile(`export/${basename}.json`, JSON.stringify(data, null, 2))
  await writeFile(
    `export/${basename}.csv`,
    stringify(data, { header: true, columns: Object.keys(data[0]) })
  )
}

async function saveProfile(data: Profile) {
  if (!existsSync('export')) {
    await mkdir('export')
  }
  await writeFile('export/profile.json', JSON.stringify(data, null, 2))
  await writeFile(
    'export/profile.csv',
    stringify([data], { header: true, columns: Object.keys(data) })
  )
}

// Get all books from paginated pages.
// getBooksFromPage - a function to extract books from a page
async function getBooksFromPaginatedPages<BookType>(
  getBooksFromPage: () => Promise<BookType[]>
) {
  const books: BookType[] = []
  while (true) {
    books.push(...(await getBooksFromPage()))

    try {
      await page
        .getByRole('link', { name: '次', exact: true })
        .click({ timeout: 10_000 })
      await expect(page.getByText('読み込み中です')).toBeHidden()
      await page.waitForTimeout(1_000)
    } catch (e) {
      // expected timeout when no more next link
      if (e instanceof errors.TimeoutError) {
        break
      }
    }
  }
  return books
}
