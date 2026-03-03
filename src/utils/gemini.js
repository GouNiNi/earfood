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
    model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
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
export function detectChapters(text) {
  if (!text) return [{ title: 'Document complet', start: 0, end: text?.length || 0 }]

  const lines = text.split('\n')
  const chapters = []
  let currentPos = 0

  // Patterns de titres de chapitres
  const chapterPatterns = [
    /^(chapitre|chapter|partie|part)\s+\d+/i,
    /^(I{1,3}|IV|V|VI{0,3}|IX|X{0,3})[.\s]/,
    /^\d+[.\s]+[A-Z]/,
    /^#{1,3}\s+/,
  ]

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    const lineStart = text.indexOf(lines[i], currentPos)

    const isChapterTitle = line.length > 2 && line.length < 100 &&
      (chapterPatterns.some(p => p.test(line)) ||
       (line === line.toUpperCase() && line.length > 5 && line.length < 80))

    if (isChapterTitle) {
      chapters.push({
        title: line.replace(/^#+\s*/, '').trim(),
        start: lineStart >= 0 ? lineStart : currentPos,
      })
    }

    currentPos = lineStart >= 0 ? lineStart + lines[i].length : currentPos + lines[i].length + 1
  }

  // Si aucun chapitre détecté, créer des segments de ~3000 caractères
  if (chapters.length === 0) {
    const segmentSize = 3000
    for (let i = 0; i < text.length; i += segmentSize) {
      const segEnd = Math.min(i + segmentSize, text.length)
      // Trouver la fin de phrase la plus proche
      const snippet = text.slice(i, Math.min(i + 50, text.length))
      chapters.push({
        title: `Section ${Math.floor(i / segmentSize) + 1}`,
        start: i,
      })
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
 * Générer un résumé pour un segment de texte via Gemini
 */
export async function generateSummary(textSegment, chapterTitle) {
  if (!model) throw new Error('Gemini non configuré. Ajoutez votre clé API dans les réglages.')

  // Limiter le texte envoyé (Gemini Flash supporte beaucoup mais on reste raisonnable)
  const truncated = textSegment.slice(0, 8000)

  const prompt = `Tu es un assistant de lecture intelligent. Résume le passage suivant en français, de manière concise et claire (3-5 phrases maximum). Le résumé doit capturer les idées clés et être prêt à être lu à voix haute en 30 secondes maximum.

${chapterTitle ? `Titre du chapitre : "${chapterTitle}"` : ''}

Texte à résumer :
"""
${truncated}
"""

Résumé concis en français :`

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

  // Limiter le contexte
  const context = documentContent.slice(0, 15000)

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
