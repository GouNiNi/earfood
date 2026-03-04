import { useState, useEffect } from 'react'
import { Plus, Book, Trash2, Headphones, Play, Clock, Settings } from 'lucide-react'
import { getAllDocuments, deleteDocument as deleteDoc, getProgress } from '../stores'
import { formatDuration, formatRelativeTime } from '../utils/formatTime'
import ImportModal from './ImportModal'

const Library = ({ onOpenDocument, onOpenSettings }) => {
  const [documents, setDocuments] = useState([])
  const [progressMap, setProgressMap] = useState({})
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadDocuments()
  }, [])

  const loadDocuments = async () => {
    try {
      const docs = await getAllDocuments()
      setDocuments(docs)

      // Charger la progression pour chaque document en parallèle
      const progEntries = await Promise.all(
        docs.map(async (doc) => {
          const prog = await getProgress(doc.id)
          return prog ? [doc.id, prog] : null
        })
      )
      const progMap = Object.fromEntries(progEntries.filter(Boolean))
      setProgressMap(progMap)
    } catch (error) {
      console.error("Erreur lors du chargement:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (id, e) => {
    e.stopPropagation()
    if (!confirm("Voulez-vous supprimer ce document ?")) return

    try {
      await deleteDoc(id)
      await loadDocuments()
    } catch (error) {
      console.error("Erreur lors de la suppression:", error)
    }
  }

  const getProgressPercentage = (docId) => {
    return progressMap[docId]?.percentage || 0
  }

  const getLastRead = (docId) => {
    return progressMap[docId]?.lastReadAt
  }

  return (
    <>
      <header className="header">
        <div className="logo-section">
          <Headphones size={28} color="var(--accent-gold)" />
          <h1 className="app-title">EarFood</h1>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onOpenSettings} style={{ padding: '0.6rem' }}>
            <Settings size={18} />
          </button>
          <button className="primary" onClick={() => setIsImportModalOpen(true)}>
            <Plus size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
            Importer
          </button>
        </div>
      </header>

      <main>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '5rem', color: 'var(--text-muted)' }}>
            Chargement de la bibliothèque...
          </div>
        ) : documents.length === 0 ? (
          <div className="empty-state">
            <Book size={48} style={{ marginBottom: '1rem', opacity: 0.3 }} />
            <p className="serif" style={{ fontSize: '1.2rem' }}>Votre bibliothèque est vide.</p>
            <p>Ajoutez un document PDF, EPUB ou DOCX pour commencer l'écoute.</p>
            <button
              className="primary"
              style={{ marginTop: '1.5rem' }}
              onClick={() => setIsImportModalOpen(true)}
            >
              <Plus size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
              Importer un document
            </button>
          </div>
        ) : (
          <div className="library-grid">
            {documents.map((doc) => {
              const pct = getProgressPercentage(doc.id)
              const lastRead = getLastRead(doc.id)
              return (
                <div
                  key={doc.id}
                  className="doc-card"
                  onClick={() => onOpenDocument(doc.id)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <h3 className="doc-title serif">{doc.title}</h3>
                    <button
                      onClick={(e) => handleDelete(doc.id, e)}
                      style={{ padding: '4px', border: 'none', background: 'transparent', flexShrink: 0 }}
                    >
                      <Trash2 size={16} color="var(--text-muted)" />
                    </button>
                  </div>
                  <div className="doc-meta">
                    <span>{doc.author}</span>
                    <span style={{ opacity: 0.4 }}>|</span>
                    <span>{formatDuration(doc.duration)}</span>
                    <span style={{ opacity: 0.4 }}>|</span>
                    <span style={{ textTransform: 'uppercase', fontSize: '0.75rem' }}>{doc.type}</span>
                  </div>

                  <div className="progress-container">
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ transform: `scaleX(${pct / 100})` }}></div>
                    </div>
                    <span className="progress-text">{pct}% écouté</span>
                  </div>

                  <div style={{
                    marginTop: '0.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.8rem',
                  }}>
                    <span style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      color: 'var(--accent-gold)'
                    }}>
                      <Play size={12} fill="var(--accent-gold)" />
                      <span className="serif">{pct > 0 ? "Continuer l'écoute" : "Commencer l'écoute"}</span>
                    </span>
                    {lastRead && (
                      <span style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        color: 'var(--text-muted)',
                        fontSize: '0.75rem'
                      }}>
                        <Clock size={11} />
                        {formatRelativeTime(lastRead)}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {isImportModalOpen && (
        <ImportModal
          onClose={() => setIsImportModalOpen(false)}
          onImported={loadDocuments}
        />
      )}

      <footer style={{
        marginTop: '5rem',
        borderTop: '1px solid var(--border-color)',
        paddingTop: '2rem',
        textAlign: 'center',
        opacity: 0.5
      }}>
        <p style={{ fontSize: '0.8rem' }}>EarFood v0.1.0</p>
      </footer>
    </>
  )
}

export default Library
