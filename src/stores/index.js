import localforage from 'localforage'

// Store pour les documents
export const documentsStore = localforage.createInstance({
  name: 'EarFood',
  storeName: 'documents'
})

// Store pour la progression
export const progressStore = localforage.createInstance({
  name: 'EarFood',
  storeName: 'progress'
})

// Store pour les marque-pages
export const bookmarksStore = localforage.createInstance({
  name: 'EarFood',
  storeName: 'bookmarks'
})

// Store pour les surlignages
export const highlightsStore = localforage.createInstance({
  name: 'EarFood',
  storeName: 'highlights'
})

// Store pour les résumés (Phase 2)
export const summariesStore = localforage.createInstance({
  name: 'EarFood',
  storeName: 'summaries'
})

// === Documents API ===

export async function getAllDocuments() {
  const docs = []
  await documentsStore.iterate((value) => {
    docs.push(value)
  })
  return docs.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getDocument(id) {
  return documentsStore.getItem(id)
}

export async function saveDocument(doc) {
  doc.updatedAt = Date.now()
  await documentsStore.setItem(doc.id, doc)
  return doc
}

export async function deleteDocument(id) {
  await documentsStore.removeItem(id)
  await progressStore.removeItem(id)
  // Supprimer les bookmarks associés
  const bmKeys = []
  await bookmarksStore.iterate((value, key) => {
    if (value.documentId === id) bmKeys.push(key)
  })
  for (const key of bmKeys) await bookmarksStore.removeItem(key)
  // Supprimer les highlights associés
  const hlKeys = []
  await highlightsStore.iterate((value, key) => {
    if (value.documentId === id) hlKeys.push(key)
  })
  for (const key of hlKeys) await highlightsStore.removeItem(key)
}

// === Progress API ===

export async function getProgress(documentId) {
  return progressStore.getItem(documentId)
}

export async function saveProgress(documentId, data) {
  const existing = await progressStore.getItem(documentId) || {
    documentId,
    currentPosition: 0,
    percentage: 0,
    lastReadAt: Date.now(),
    totalTimeListened: 0
  }
  const updated = { ...existing, ...data, lastReadAt: Date.now() }
  await progressStore.setItem(documentId, updated)
  return updated
}

// === Bookmarks API ===

export async function getBookmarks(documentId) {
  const bookmarks = []
  await bookmarksStore.iterate((value) => {
    if (value.documentId === documentId) bookmarks.push(value)
  })
  return bookmarks.sort((a, b) => a.position - b.position)
}

export async function saveBookmark(bookmark) {
  await bookmarksStore.setItem(bookmark.id, bookmark)
  return bookmark
}

export async function deleteBookmark(id) {
  await bookmarksStore.removeItem(id)
}

// === Highlights API ===

export async function getHighlights(documentId) {
  const highlights = []
  await highlightsStore.iterate((value) => {
    if (value.documentId === documentId) highlights.push(value)
  })
  return highlights.sort((a, b) => a.startPos - b.startPos)
}

export async function saveHighlight(highlight) {
  await highlightsStore.setItem(highlight.id, highlight)
  return highlight
}

export async function deleteHighlight(id) {
  await highlightsStore.removeItem(id)
}
