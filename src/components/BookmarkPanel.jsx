import { useState } from 'react'
import { Bookmark, Plus, Trash2, MapPin } from 'lucide-react'
import { formatTime } from '../utils/formatTime'
import { saveBookmark, deleteBookmark as deleteBm } from '../stores'

const BookmarkPanel = ({ documentId, bookmarks, currentTime, onJumpTo, onRefresh }) => {
  const [isAdding, setIsAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')

  const handleAdd = async () => {
    if (!newTitle.trim()) return
    const bookmark = {
      id: crypto.randomUUID(),
      documentId,
      position: currentTime,
      title: newTitle.trim(),
      createdAt: Date.now(),
    }
    await saveBm(bookmark)
    setNewTitle('')
    setIsAdding(false)
    onRefresh()
  }

  const saveBm = async (bm) => {
    await saveBookmark(bm)
  }

  const handleDelete = async (id) => {
    await deleteBm(id)
    onRefresh()
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h3 className="serif" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bookmark size={18} />
          Marque-pages
        </h3>
        <button
          className="panel-action-btn"
          onClick={() => setIsAdding(!isAdding)}
        >
          <Plus size={16} />
          Ajouter
        </button>
      </div>

      {isAdding && (
        <div className="bookmark-add-form">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Titre du marque-page..."
            className="bookmark-input"
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            autoFocus
          />
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button className="primary" onClick={handleAdd} style={{ flex: 1, padding: '0.5rem' }}>
              Ajouter a {formatTime(currentTime)}
            </button>
            <button onClick={() => { setIsAdding(false); setNewTitle('') }} style={{ padding: '0.5rem' }}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {bookmarks.length === 0 ? (
        <div className="panel-empty">
          <MapPin size={24} style={{ opacity: 0.3 }} />
          <p>Aucun marque-page</p>
        </div>
      ) : (
        <div className="bookmark-list">
          {bookmarks.map((bm) => (
            <div key={bm.id} className="bookmark-item" onClick={() => onJumpTo(bm.position)}>
              <div className="bookmark-item-info">
                <span className="bookmark-item-title">{bm.title}</span>
                <span className="bookmark-item-time">{formatTime(bm.position)}</span>
              </div>
              <button
                className="bookmark-item-delete"
                onClick={(e) => { e.stopPropagation(); handleDelete(bm.id) }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default BookmarkPanel
