import { useState, useEffect, useRef } from 'react'
import localforage from 'localforage'
import { Plus, Book, Trash2, Headphones, Play, History } from 'lucide-react'
import './App.css'

// Configuration de localforage
localforage.config({
  name: 'EarFood',
  storeName: 'documents'
})

function App() {
  const [documents, setDocuments] = useState([])
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const fileInputRef = useRef(null)

  // Charger les documents au démarrage
  useEffect(() => {
    loadDocuments()
  }, [])

  const loadDocuments = async () => {
    try {
      const keys = await localforage.keys()
      const docs = await Promise.all(keys.map(key => localforage.getItem(key)))
      // Trier par date de mise à jour (plus récent en premier)
      setDocuments(docs.sort((a, b) => b.updatedAt - a.updatedAt))
    } catch (error) {
      console.error("Erreur lors du chargement des documents:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setIsLoading(true)
    setIsImportModalOpen(false)

    try {
      // Mock de l'extraction de texte (Sera implémenté avec pdf.js / mammoth / epubjs)
      const id = crypto.randomUUID()
      const newDoc = {
        id,
        title: file.name.replace(/\.[^/.]+$/, ""),
        author: "Auteur inconnu",
        filename: file.name,
        type: file.name.split('.').pop().toLowerCase(),
        content: `Ceci est un mock du contenu extrais du fichier ${file.name}. Nous ajouterons le support réel de pdf.js, epubjs et mammoth au sprint suivant.`,
        duration: Math.floor(Math.random() * 7200) + 1800, // Mock: entre 30min et 2h30
        createdAt: Date.now(),
        updatedAt: Date.now(),
        size: file.size,
        progress: 0
      }

      await localforage.setItem(id, newDoc)
      await loadDocuments()
    } catch (error) {
      console.error("Erreur lors de l'import :", error)
      alert("Erreur lors de l'importation du fichier.")
    } finally {
      setIsLoading(false)
    }
  }

  const deleteDocument = async (id, e) => {
    e.stopPropagation()
    if (!confirm("Voulez-vous supprimer ce document ?")) return
    
    try {
      await localforage.removeItem(id)
      await loadDocuments()
    } catch (error) {
      console.error("Erreur lors de la suppression :", error)
    }
  }

  const formatDuration = (seconds) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }

  return (
    <div className="app-container">
      <header className="header">
        <div className="logo-section">
          <Headphones size={28} color="var(--accent-gold)" />
          <h1 className="app-title">EarFood</h1>
        </div>
        <button className="primary" onClick={() => setIsImportModalOpen(true)}>
          <Plus size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
          Importer
        </button>
      </header>

      <main>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '5rem' }}>Chargement de la bibliothèque...</div>
        ) : documents.length === 0 ? (
          <div className="empty-state">
            <Book size={48} style={{ marginBottom: '1rem', opacity: 0.3 }} />
            <p className="serif" style={{ fontSize: '1.2rem' }}>Votre bibliothèque est vide.</p>
            <p>Ajoutez un document PDF, EPUB ou DOCX pour commencer l'écoute.</p>
          </div>
        ) : (
          <div className="library-grid">
            {documents.map((doc) => (
              <div key={doc.id} className="doc-card" onClick={() => alert(`Lecture de ${doc.title}`)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <h3 className="doc-title">{doc.title}</h3>
                  <button 
                    onClick={(e) => deleteDocument(doc.id, e)}
                    style={{ padding: '4px', border: 'none', background: 'transparent' }}
                  >
                    <Trash2 size={16} color="var(--text-muted)" />
                  </button>
                </div>
                <div className="doc-meta">
                  <span>{doc.author}</span>
                  <span>•</span>
                  <span>{formatDuration(doc.duration)}</span>
                </div>
                
                <div className="progress-container">
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${doc.progress || 0}%` }}></div>
                  </div>
                  <span className="progress-text">{doc.progress || 0}% écouté</span>
                </div>
                
                <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--accent-gold)' }}>
                  <Play size={12} fill="var(--accent-gold)" />
                  <span className="serif">Continuer l'écoute</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {isImportModalOpen && (
        <div className="modal-overlay" onClick={() => setIsImportModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2 className="serif">Importer un document</h2>
            <p>Formats supportés : PDF, EPUB, DOCX</p>
            
            <div className="file-input-wrapper" onClick={() => fileInputRef.current.click()}>
              <Plus size={32} color="var(--accent-gold)" style={{ marginBottom: '1rem' }} />
              <p>Cliquez pour choisir un fichier</p>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                style={{ display: 'none' }}
                accept=".pdf,.epub,.docx"
              />
            </div>
            
            <button onClick={() => setIsImportModalOpen(false)} style={{ width: '100%' }}>
              Annuler
            </button>
          </div>
        </div>
      )}

      <footer style={{ marginTop: '5rem', borderTop: '1px solid var(--border-color)', paddingTop: '2rem', textAlign: 'center', opacity: 0.5 }}>
        <p style={{ fontSize: '0.8rem' }}>EarFood v0.1.0 • Design Académique Raffiné</p>
      </footer>
    </div>
  )
}

export default App
