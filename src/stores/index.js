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

// Store pour les résumés
export const summariesStore = localforage.createInstance({
  name: 'EarFood',
  storeName: 'summaries'
})

// Store pour les réglages
export const settingsStore = localforage.createInstance({
  name: 'EarFood',
  storeName: 'settings'
})

// Store pour l'historique de chat
export const chatStore = localforage.createInstance({
  name: 'EarFood',
  storeName: 'chat'
})

// Store pour les analytics
export const analyticsStore = localforage.createInstance({
  name: 'EarFood',
  storeName: 'analytics'
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

// === Summaries API ===

export async function getSummaries(documentId) {
  const summaries = []
  await summariesStore.iterate((value) => {
    if (value.documentId === documentId) summaries.push(value)
  })
  return summaries.sort((a, b) => a.chapterStart - b.chapterStart)
}

export async function saveSummary(summary) {
  const key = `${summary.documentId}_${summary.chapterStart}`
  await summariesStore.setItem(key, summary)
  return summary
}

// === Settings API ===

export async function getSettings() {
  const settings = await settingsStore.getItem('app_settings')
  return settings || {
    geminiApiKey: '',
    ttsMode: 'hybrid',
    edgeVoice: 'fr-FR-HenriNeural',
    sherpaVoice: 'fr-FR-siwis',
    trimEndMs: 200,
    darkMode: false,
  }
}

export async function saveSettings(settings) {
  await settingsStore.setItem('app_settings', settings)
  return settings
}

// === Chat API ===

export async function getChatHistory(documentId) {
  return (await chatStore.getItem(documentId)) || []
}

export async function saveChatHistory(documentId, messages) {
  await chatStore.setItem(documentId, messages)
}

export async function clearChatHistory(documentId) {
  await chatStore.removeItem(documentId)
}

// === Analytics API ===

export async function getAnalytics() {
  return (await analyticsStore.getItem('stats')) || {
    totalListeningTime: 0,
    sessionsCount: 0,
    documentsCompleted: 0,
    dailyStats: {},
  }
}

export async function updateAnalytics(update) {
  const stats = await getAnalytics()
  const today = new Date().toISOString().split('T')[0]
  if (!stats.dailyStats[today]) {
    stats.dailyStats[today] = { listeningTime: 0, sessions: 0 }
  }
  if (update.listeningTime) {
    stats.totalListeningTime += update.listeningTime
    stats.dailyStats[today].listeningTime += update.listeningTime
  }
  if (update.newSession) {
    stats.sessionsCount++
    stats.dailyStats[today].sessions++
  }
  if (update.documentCompleted) {
    stats.documentsCompleted++
  }
  await analyticsStore.setItem('stats', stats)
  return stats
}

// === Cache Management ===

export async function clearAllData() {
  await documentsStore.clear()
  await progressStore.clear()
  await bookmarksStore.clear()
  await highlightsStore.clear()
  await summariesStore.clear()
  await chatStore.clear()
  await analyticsStore.clear()
}

export async function getCacheSize() {
  let count = 0
  for (const store of [documentsStore, progressStore, bookmarksStore, highlightsStore, summariesStore, chatStore]) {
    count += await store.length()
  }
  return count
}
