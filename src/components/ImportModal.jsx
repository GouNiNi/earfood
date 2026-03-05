import { useRef, useState } from 'react'
import { Plus, FileText, Loader } from 'lucide-react'
import { extractText } from '../utils/extractText'
import { estimateDuration } from '../utils/formatTime'
import { saveDocument } from '../stores'
import { detectChapters } from '../utils/gemini'

const ImportModal = ({ onClose, onImported }) => {
  const fileInputRef = useRef(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState(null)
  const [progress, setProgress] = useState('')

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setIsProcessing(true)
    setError(null)
    setProgress('Extraction du texte...')

    try {
      const { text, title, author, chapters, htmlContent } = await extractText(file)

      if (!text || text.length < 10) {
        throw new Error('Le document semble vide ou illisible.')
      }

      // Détecter les chapitres (heuristique locale, pas d'IA)
      setProgress('Détection des chapitres...')
      const finalChapters = detectChapters(text, chapters)

      setProgress('Recherche des métadonnées et couverture...')

      // Fetch cover + metadata from Open Library (for Chicago-style citations)
      let coverUrl = null
      let citation = null
      let enrichedAuthor = author
      try {
        const query = encodeURIComponent(title + (author !== 'Auteur inconnu' ? ' ' + author : ''))
        const resp = await fetch(`https://openlibrary.org/search.json?q=${query}&limit=3&fields=key,title,author_name,first_publish_year,publisher,publish_place,isbn,edition_count,cover_i,number_of_pages_median,subject,language`)
        if (resp.ok) {
          const data = await resp.json()
          const match = data.docs?.[0]
          if (match) {
            if (match.cover_i) {
              coverUrl = `https://covers.openlibrary.org/b/id/${match.cover_i}-M.jpg`
            }
            // Enrich author from API if local extraction gave nothing
            if (match.author_name?.length > 0 && author === 'Auteur inconnu') {
              enrichedAuthor = match.author_name.join(', ')
            }
            // Build Chicago-style citation metadata
            citation = {
              authors: match.author_name || (author !== 'Auteur inconnu' ? [author] : []),
              title: match.title || title,
              publisher: match.publisher?.[0] || null,
              placeOfPublication: match.publish_place?.[0] || null,
              year: match.first_publish_year || null,
              isbn: match.isbn?.[0] || null,
              pages: match.number_of_pages_median || null,
              subjects: match.subject?.slice(0, 5) || [],
              language: match.language?.[0] || null,
            }
          }
        }
      } catch (e) {
        // Metadata search failed, continue without
      }

      setProgress('Sauvegarde du document...')

      const id = crypto.randomUUID()
      const newDoc = {
        id,
        title,
        author: enrichedAuthor,
        filename: file.name,
        type: file.name.split('.').pop().toLowerCase(),
        content: text,
        htmlContent: htmlContent || undefined,
        chapters: finalChapters || undefined,
        coverUrl: coverUrl || undefined,
        citation: citation || undefined,
        duration: estimateDuration(text),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        size: file.size,
      }

      await saveDocument(newDoc)
      onImported()
      onClose()
    } catch (err) {
      console.error("Erreur lors de l'import :", err)
      setError(err.message || "Erreur lors de l'importation du fichier.")
    } finally {
      setIsProcessing(false)
      setProgress('')
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2 className="serif">Importer un document</h2>
        <p style={{ color: 'var(--text-muted)' }}>Formats supportés : PDF, EPUB, DOCX</p>

        {error && (
          <div style={{
            padding: '0.75rem 1rem',
            background: '#fef2f2',
            border: '1px solid #fca5a5',
            borderRadius: '4px',
            color: '#dc2626',
            fontSize: '0.85rem',
            margin: '1rem 0'
          }}>
            {error}
          </div>
        )}

        {isProcessing ? (
          <div style={{
            padding: '3rem',
            textAlign: 'center',
            color: 'var(--text-muted)'
          }}>
            <Loader size={32} style={{ animation: 'spin 1s linear infinite', marginBottom: '1rem' }} />
            <p>{progress}</p>
          </div>
        ) : (
          <div className="file-input-wrapper" onClick={() => fileInputRef.current.click()}>
            <Plus size={32} color="var(--accent-gold)" style={{ marginBottom: '0.5rem' }} />
            <p style={{ margin: '0.5rem 0 0' }}>Cliquez pour choisir un fichier</p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>
              <FileText size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
              PDF, EPUB, DOCX
            </p>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              style={{ display: 'none' }}
              accept=".pdf,.epub,.docx"
            />
          </div>
        )}

        <button onClick={onClose} style={{ width: '100%', marginTop: '0.5rem' }}>
          Annuler
        </button>
      </div>
    </div>
  )
}

export default ImportModal
