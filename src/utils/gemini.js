import { GoogleGenerativeAI } from '@google/generative-ai'

let genAI = null
let model = null

/**
 * Initialiser le client Gemini avec une clé API
 */
export function initGemini(apiKey) {
  if (!apiKey) return false
  try {
    genAI = new GoogleGenerativeAI(apiKey)
    model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
    return true
  } catch (e) {
    console.error('Erreur initialisation Gemini:', e)
    return false
  }
}

/**
 * Vérifier si Gemini est configuré
 */
export function isGeminiReady() {
  return model !== null
}

/**
 * Détecter les chapitres dans un texte
 * Utilise une heuristique simple : lignes courtes en majuscules ou numérotées
 */
export function detectChapters(text, nativeChapters) {
  if (!text) return [{ title: 'Document complet', start: 0, end: text?.length || 0 }]

  // Utiliser les chapitres natifs s'ils existent
  if (nativeChapters && nativeChapters.length > 0) return nativeChapters

  const lines = text.split('\n')
  const chapters = []
  let currentPos = 0

  // Patterns de titres de chapitres (strict)
  const chapterPatterns = [
    /^(chapitre|chapter|partie|part|section|acte|livre|tome)\s+[\dIVXLCDM]+/i,
    /^(prologue|épilogue|epilogue|préface|preface|introduction|conclusion|avant-propos|postface)/i,
    /^(I{1,3}|IV|V|VI{0,3}|IX|X{1,3})[.\s\-–—:]/,
    /^\d{1,3}[.\s\-–—:]\s*[A-ZÀ-Ü]/,
    /^#{1,3}\s+/,
  ]

  // Patterns plus souples: ligne courte précédée/suivie d'une ligne vide
  const softTitlePattern = (line, prevLine, nextLine) => {
    if (line.length < 4 || line.length > 120) return false
    const isIsolated = (!prevLine || prevLine.trim() === '') && (!nextLine || nextLine.trim() === '')
    if (!isIsolated) return false
    // Starts with uppercase, not a regular sentence (no period at end)
    if (/^[A-ZÀ-Ü]/.test(line) && !line.endsWith('.') && !line.endsWith(',')) return true
    return false
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    const lineStart = text.indexOf(lines[i], currentPos)

    const isStrictChapter = line.length > 2 && line.length < 120 &&
      (chapterPatterns.some(p => p.test(line)) ||
       (line === line.toUpperCase() && line.length > 4 && line.length < 80 && /[A-ZÀ-Ü]/.test(line)))

    const isSoftChapter = !isStrictChapter &&
      softTitlePattern(line, i > 0 ? lines[i - 1] : null, i < lines.length - 1 ? lines[i + 1] : null)

    if (isStrictChapter || isSoftChapter) {
      chapters.push({
        title: line.replace(/^#+\s*/, '').trim(),
        start: lineStart >= 0 ? lineStart : currentPos,
      })
    }

    currentPos = lineStart >= 0 ? lineStart + lines[i].length : currentPos + lines[i].length + 1
  }

  // Si aucun chapitre détecté, créer des segments à chaque double saut de ligne (~5000 chars min)
  if (chapters.length === 0) {
    const MIN_SEGMENT = 5000
    let lastStart = 0
    const doubleNewlines = [...text.matchAll(/\n\s*\n/g)]

    for (const match of doubleNewlines) {
      if (match.index - lastStart >= MIN_SEGMENT) {
        // Use the first meaningful words after this break as title
        const after = text.slice(match.index).replace(/^\s+/, '')
        const firstLine = after.split('\n')[0].trim()
        const title = firstLine.length > 60
          ? firstLine.slice(0, 57) + '…'
          : firstLine || `Passage ${chapters.length + 1}`

        chapters.push({ title, start: match.index + match[0].length })
        lastStart = match.index
      }
    }

    // Ensure first segment always exists
    if (chapters.length === 0 || chapters[0].start > 0) {
      const firstLine = text.split('\n').find(l => l.trim())?.trim() || 'Début'
      const title = firstLine.length > 60 ? firstLine.slice(0, 57) + '…' : firstLine
      chapters.unshift({ title, start: 0 })
    }
  }

  // Ajouter les positions de fin
  for (let i = 0; i < chapters.length; i++) {
    chapters[i].end = i < chapters.length - 1
      ? chapters[i + 1].start
      : text.length
  }

  return chapters
}

/**
 * Détecter les chapitres via Gemini AI
 * Retourne un tableau [{title, start, end}] ou null si échec
 */
export async function detectChaptersWithAI(text) {
  if (!model || !text) return null

  // Send enough text for Gemini to see the full table of contents / structure
  // Many books have the TOC or all chapter headings within the first portion
  const truncated = text.slice(0, 50000)

  const prompt = `Analyse ce texte et identifie les chapitres, parties ou sections principales.
Pour chaque chapitre trouvé, retourne son titre EXACT tel qu'il apparaît dans le texte (caractère pour caractère, y compris la ponctuation et les accents).

IMPORTANT : Retourne UNIQUEMENT un JSON valide, sans texte autour, au format :
[{"title": "Titre exact du chapitre"}]

Si tu ne trouves aucun chapitre clair, retourne : []

Texte :
"""
${truncated}
"""`

  try {
    const result = await model.generateContent(prompt)
    const raw = result.response.text().trim()
    // Extraire le JSON du résultat
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return null
    const parsed = JSON.parse(jsonMatch[0])
    if (!Array.isArray(parsed) || parsed.length === 0) return null

    // Retrouver les positions dans le texte COMPLET (pas le tronqué)
    const chapters = []
    for (const ch of parsed) {
      if (!ch.title) continue
      // Try exact match first
      let idx = text.indexOf(ch.title)
      // If not found, try case-insensitive search
      if (idx < 0) {
        const lower = text.toLowerCase()
        idx = lower.indexOf(ch.title.toLowerCase())
      }
      // If still not found, try partial match (first 30 chars of title)
      if (idx < 0 && ch.title.length > 30) {
        idx = text.indexOf(ch.title.slice(0, 30))
      }
      if (idx >= 0) {
        chapters.push({ title: ch.title, start: idx })
      }
    }

    if (chapters.length === 0) return null

    // Trier et ajouter les fins
    chapters.sort((a, b) => a.start - b.start)
    for (let i = 0; i < chapters.length; i++) {
      chapters[i].end = i < chapters.length - 1
        ? chapters[i + 1].start
        : text.length
    }

    return chapters
  } catch (e) {
    console.warn('Détection chapitres IA échouée:', e.message)
    return null
  }
}

/**
 * Générer un résumé pour un segment de texte via Gemini
 */
export async function generateSummary(textSegment, chapterTitle) {
  if (!model) throw new Error('Gemini non configuré. Ajoutez votre clé API dans les réglages.')

  if (!textSegment || textSegment.trim().length < 20) {
    throw new Error(`Le chapitre "${chapterTitle || '?'}" semble vide ou trop court pour être résumé.`)
  }

  // Gemini 2.5 Flash supporte de larges contextes, on envoie jusqu'à 30000 chars
  const truncated = textSegment.slice(0, 30000)

  const prompt = `Tu es un assistant de lecture intelligent et cultivé. Résume le texte ci-dessous en français, lisible à voix haute en environ 60 secondes.

IMPORTANT : Le texte à résumer est fourni intégralement ci-dessous. Base-toi UNIQUEMENT sur ce texte. Ne dis jamais que tu n'as pas le contenu.

Structure attendue :
1. Un paragraphe de synthèse (5-8 phrases) qui capture l'essentiel
2. Une liste à puces des idées principales (3-5 points clés)
3. 1-2 citations ou termes clés remarquables (entre guillemets)

${chapterTitle ? `Titre du chapitre : "${chapterTitle}"` : ''}

TEXTE DU CHAPITRE (${truncated.length} caractères) :
"""
${truncated}
"""

Résumé enrichi en français :`

  try {
    const result = await model.generateContent(prompt)
    const response = result.response
    return response.text().trim()
  } catch (e) {
    console.error('Erreur Gemini:', e)
    throw new Error('Erreur lors de la génération du résumé. Vérifiez votre clé API.')
  }
}

/**
 * Poser une question sur le contenu d'un document (pour le chat RAG)
 */
export async function askAboutDocument(question, documentContent, chatHistory = []) {
  if (!model) throw new Error('Gemini non configuré. Ajoutez votre clé API dans les réglages.')

  // Limiter le contexte du document (Gemini 2.5 Flash gère de larges contextes)
  const context = documentContent.slice(0, 50000)

  const messages = [
    {
      role: 'user',
      parts: [{
        text: `Tu es un assistant de lecture savant et élégant. Tu aides l'utilisateur à comprendre le document suivant. Réponds toujours en français, de manière claire et structurée.

CONTENU DU DOCUMENT :
"""
${context}
"""

Réponds aux questions de l'utilisateur en te basant uniquement sur le contenu ci-dessus. Si la réponse n'est pas dans le document, dis-le clairement.`
      }]
    },
    {
      role: 'model',
      parts: [{ text: "Je suis prêt à vous aider à comprendre ce document. Posez-moi vos questions !" }]
    },
    ...chatHistory.flatMap(msg => [
      { role: 'user', parts: [{ text: msg.question }] },
      { role: 'model', parts: [{ text: msg.answer }] },
    ]),
    {
      role: 'user',
      parts: [{ text: question }]
    }
  ]

  try {
    const chat = model.startChat({ history: messages.slice(0, -1) })
    const result = await chat.sendMessage(question)
    return result.response.text().trim()
  } catch (e) {
    console.error('Erreur Gemini chat:', e)
    throw new Error('Erreur lors de la communication avec Gemini.')
  }
}
