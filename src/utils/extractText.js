import * as pdfjsLib from 'pdfjs-dist'
import mammoth from 'mammoth'
import ePub from 'epubjs'

// Configurer le worker PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString()

/**
 * Extrait le texte d'un fichier selon son type
 * @param {File} file
 * @returns {Promise<{text: string, title: string, author: string}>}
 */
export async function extractText(file) {
  const ext = file.name.split('.').pop().toLowerCase()

  switch (ext) {
    case 'pdf':
      return extractFromPDF(file)
    case 'epub':
      return extractFromEPUB(file)
    case 'docx':
      return extractFromDOCX(file)
    default:
      throw new Error(`Format non supporté : .${ext}`)
  }
}

/**
 * Extrait le texte d'un PDF avec pdf.js
 */
async function extractFromPDF(file) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  let fullText = ''
  let title = file.name.replace(/\.pdf$/i, '')

  // Essayer de récupérer les métadonnées
  try {
    const metadata = await pdf.getMetadata()
    if (metadata.info?.Title) title = metadata.info.Title
  } catch (e) {
    // Pas de métadonnées, on garde le nom du fichier
  }

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map(item => item.str)
      .join(' ')
    fullText += pageText + '\n\n'
  }

  return {
    text: fullText.trim(),
    title,
    author: 'Auteur inconnu'
  }
}

/**
 * Extrait le texte d'un EPUB avec epubjs
 */
async function extractFromEPUB(file) {
  const arrayBuffer = await file.arrayBuffer()
  const book = ePub(arrayBuffer)
  await book.ready

  let title = file.name.replace(/\.epub$/i, '')
  let author = 'Auteur inconnu'

  // Métadonnées
  try {
    const metadata = book.package?.metadata
    if (metadata?.title) title = metadata.title
    if (metadata?.creator) author = metadata.creator
  } catch (e) {
    // Pas de métadonnées
  }

  let fullText = ''

  // Parcourir les sections du livre
  const spine = book.spine
  for (const section of spine.items) {
    try {
      const doc = await section.load(book.load.bind(book))
      if (doc && doc.body) {
        fullText += doc.body.textContent + '\n\n'
      }
    } catch (e) {
      // Section illisible, on continue
    }
  }

  book.destroy()

  return {
    text: fullText.trim() || `Contenu extrait de ${file.name}`,
    title,
    author
  }
}

/**
 * Extrait le texte d'un DOCX avec mammoth
 */
async function extractFromDOCX(file) {
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })

  return {
    text: result.value.trim(),
    title: file.name.replace(/\.docx?$/i, ''),
    author: 'Auteur inconnu'
  }
}
