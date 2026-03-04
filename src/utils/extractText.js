import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'
import mammoth from 'mammoth'
import ePub from 'epubjs'

// Configurer le worker PDF.js — Vite gère le hash via ?url
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

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

  // Comptage cumulatif des positions par page (avant nettoyage)
  const pageCharOffsets = [] // charOffset au début de chaque page
  for (let i = 1; i <= pdf.numPages; i++) {
    pageCharOffsets.push(fullText.length)
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map(item => item.str)
      .join(' ')
    fullText += pageText + '\n\n'
  }

  // Extraire la TOC native via getOutline
  let chapters = []
  try {
    const outline = await pdf.getOutline()
    if (outline && outline.length > 0) {
      for (const item of outline) {
        const dest = item.dest
        if (!dest) continue
        try {
          const resolved = typeof dest === 'string'
            ? await pdf.getDestination(dest)
            : dest
          if (!resolved) continue
          const pageIndex = await pdf.getPageIndex(resolved[0])
          chapters.push({
            title: item.title,
            start: pageCharOffsets[pageIndex] || 0,
          })
        } catch (e) {
          // Destination non résolue, on skip
        }
      }
      // Trier par position et ajouter les fins
      chapters.sort((a, b) => a.start - b.start)
      for (let i = 0; i < chapters.length; i++) {
        chapters[i].end = i < chapters.length - 1
          ? chapters[i + 1].start
          : fullText.length
      }
    }
  } catch (e) {
    // Pas de TOC
  }

  return {
    text: cleanPdfText(fullText.trim()),
    title,
    author: 'Auteur inconnu',
    chapters: chapters.length > 0 ? chapters : undefined,
  }
}

/**
 * Nettoie les artefacts courants de l'extraction PDF
 */
function cleanPdfText(text) {
  return text
    // Mots coupés en fin de ligne : "compré-\nhension" → "compréhension"
    .replace(/(\w)-\s*\n\s*(\w)/g, '$1$2')
    // Lettres isolées : "d es" → "des", "l a" → "la" (lettre isolée suivie d'un espace et d'une lettre)
    .replace(/\b(\w) (\w{2,})/g, '$1$2')
    // Tirets espacés entre lettres : "bien - être" → "bien-être"
    .replace(/(\w) - (\w)/g, '$1-$2')
    // Ponctuation décollée : " ." " ," " ;" " :"
    .replace(/ ([.,;:!?])/g, '$1')
    // Espaces multiples → espace simple
    .replace(/ {2,}/g, ' ')
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
  const htmlParts = []

  // Map section href → char offset for TOC mapping
  const sectionOffsets = {}
  const spine = book.spine
  for (const section of spine.items) {
    sectionOffsets[section.href] = fullText.length
    try {
      const doc = await section.load(book.load.bind(book))
      if (doc && doc.body) {
        fullText += doc.body.textContent + '\n\n'

        // Resolve images to inline base64
        const imgs = doc.body.querySelectorAll('img')
        for (const img of imgs) {
          const src = img.getAttribute('src')
          if (src) {
            try {
              const blob = await book.archive.getBlob(src)
              if (blob) {
                const dataUrl = await new Promise((resolve) => {
                  const reader = new FileReader()
                  reader.onload = () => resolve(reader.result)
                  reader.onerror = () => resolve('')
                  reader.readAsDataURL(blob)
                })
                if (dataUrl) img.setAttribute('src', dataUrl)
              }
            } catch (e) {
              // Image non résolue, on laisse le src original
            }
          }
        }

        htmlParts.push(doc.body.innerHTML)
      }
    } catch (e) {
      // Section illisible, on continue
    }
  }

  // Extraire la TOC native
  let chapters = []
  try {
    const toc = book.navigation?.toc
    if (toc && toc.length > 0) {
      for (const item of toc) {
        const href = item.href?.split('#')[0] // Retirer l'ancre
        const offset = sectionOffsets[href]
        if (offset !== undefined) {
          chapters.push({ title: item.label?.trim(), start: offset })
        }
      }
      chapters.sort((a, b) => a.start - b.start)
      for (let i = 0; i < chapters.length; i++) {
        chapters[i].end = i < chapters.length - 1
          ? chapters[i + 1].start
          : fullText.length
      }
    }
  } catch (e) {
    // Pas de TOC
  }

  book.destroy()

  return {
    text: fullText.trim() || `Contenu extrait de ${file.name}`,
    htmlContent: htmlParts.length > 0 ? htmlParts.join('<hr/>') : undefined,
    title,
    author,
    chapters: chapters.length > 0 ? chapters : undefined,
  }
}

/**
 * Extrait le texte d'un DOCX avec mammoth
 */
async function extractFromDOCX(file) {
  const arrayBuffer = await file.arrayBuffer()

  // Extract HTML for rich rendering
  const htmlResult = await mammoth.convertToHtml({ arrayBuffer })
  const html = htmlResult.value

  // Extract plain text from the HTML
  const parser = new DOMParser()
  const parsed = parser.parseFromString(html, 'text/html')
  const text = parsed.body.textContent || ''

  return {
    text: text.trim(),
    htmlContent: html || undefined,
    title: file.name.replace(/\.docx?$/i, ''),
    author: 'Auteur inconnu'
  }
}
