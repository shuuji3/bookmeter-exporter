export type Book = {
  bookAuthor: string | null
  bookPage: number
  bookId: number
  bookAsin: string
  bookTitle: string
  bookImageUrl: string
}

export type BookWithReview = Book & {
  reviewDate: string
  reviewText: string | null
  reviewIsSpoiler: boolean | null
  reviewIsDraft: boolean
  bookcaseNames: string[]
}
