import { useRef, useState, useEffect } from 'react'
import { Plus, FileText, Loader, AlertTriangle, Settings } from 'lucide-react'
import { extractText } from '../utils/extractText'
import { estimateDuration } from '../utils/formatTime'
import { saveDocument, getSettings } from '../stores'
import { initGemini, isGeminiReady, detectChaptersWithAI, detectChapters } from '../utils/gemini'

const ImportModal = ({ onClose, onImported, onOpenSettings }) => {
  const fileInputRef = useRef(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState(null)
  const [progress, setProgress] = useState('')
  const [hasApiKey, setHasApiKey] = useState(true) // optimistic

  useEffect(() => {
    getSettings().then(s => setHasApiKey(!!s.geminiApiKey))
  }, [])

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

      // Détecter les chapitres si pas de chapitres natifs
      let finalChapters = chapters
      if (!finalChapters || finalChapters.length === 0) {
        setProgress('Détection des chapitres...')
        // Essayer avec Gemini d'abord
        if (!isGeminiReady()) {
          const settings = await getSettings()
          if (settings.geminiApiKey) initGemini(settings.geminiApiKey)
        }
        if (isGeminiReady()) {
          const aiChapters = await detectChaptersWithAI(text)
          if (aiChapters && aiChapters.length > 0) {
            finalChapters = aiChapters
          }
        }
        // Fallback heuristique local
        if (!finalChapters || finalChapters.length === 0) {
          finalChapters = detectChapters(text, null)
        }
      }

      setProgress('Recherche de la couverture...')

      // Try to fetch cover from Open Library
      let coverUrl = null
      try {
        const query = encodeURIComponent(title)
        const resp = await fetch(`https://openlibrary.org/search.json?q=${query}&limit=3`)
        if (resp.ok) {
          const data = await resp.json()
          const doc = data.docs?.find(d => d.cover_i)
          if (doc?.cover_i) {
            coverUrl = `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
          }
        }
      } catch (e) {
        // Cover search failed, continue without
      }

      setProgress('Sauvegarde du document...')

      const id = crypto.randomUUID()
      const newDoc = {
        id,
        title,
        author,
        filename: file.name,
        type: file.name.split('.').pop().toLowerCase(),
        content: text,
        htmlContent: htmlContent || undefined,
        chapters: finalChapters || undefined,
        coverUrl: coverUrl || undefined,
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

        {!hasApiKey && (
          <div style={{
            padding: '0.75rem 1rem',
            background: 'rgba(197, 160, 89, 0.1)',
            border: '1px solid var(--accent-gold)',
            borderRadius: '4px',
            fontSize: '0.85rem',
            margin: '1rem 0',
            color: 'var(--text-main)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
              <AlertTriangle size={16} color="var(--accent-gold)" />
              <strong>Clé API Gemini manquante</strong>
            </div>
            <p style={{ margin: '0 0 0.5rem', lineHeight: 1.4 }}>
              Certaines fonctionnalités (résumés IA, chat, détection de chapitres) ne fonctionneront pas sans clé API.
            </p>
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); onOpenSettings() }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '0.4rem 0.8rem', fontSize: '0.8rem',
                border: '1px solid var(--accent-gold)', borderRadius: '4px',
                background: 'transparent', color: 'var(--accent-gold)', cursor: 'pointer',
              }}
            >
              <Settings size={14} />
              Configurer la clé API
            </button>
          </div>
        )}

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
