import { useState } from 'react'
import { Highlighter, Trash2, Palette, Search, Edit3, Check, X } from 'lucide-react'
import { saveHighlight, deleteHighlight as deleteHl } from '../stores'
import Fuse from 'fuse.js'

const HIGHLIGHT_COLORS = [
  { name: 'Jaune', value: '#fef08a' },
  { name: 'Rose', value: '#fca5a5' },
  { name: 'Vert', value: '#a7f3d0' },
  { name: 'Bleu', value: '#bfdbfe' },
]

const HighlightPanel = ({
  documentId,
  highlights,
  selectedText,
  selectionRange,
  onRefresh,
  onJumpToHighlight,
  activeColor,
  onColorChange,
  isHighlightMode,
  onToggleHighlightMode,
}) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editTitle, setEditTitle] = useState('')

  const handleAddHighlight = async () => {
    if (!selectedText || !selectionRange) return
    const highlight = {
      id: crypto.randomUUID(),
      documentId,
      startPos: selectionRange.start,
      endPos: selectionRange.end,
      text: selectedText,
      title: '',
      color: activeColor,
      createdAt: Date.now(),
    }
    await saveHighlight(highlight)
    onRefresh()
  }

  const handleDelete = async (id) => {
    await deleteHl(id)
    onRefresh()
  }

  const handleStartEdit = (hl) => {
    setEditingId(hl.id)
    setEditTitle(hl.title || '')
  }

  const handleSaveTitle = async (hl) => {
    await saveHighlight({ ...hl, title: editTitle.trim() })
    setEditingId(null)
    setEditTitle('')
    onRefresh()
  }

  // Filtrer les highlights avec Fuse.js si recherche active
  const filteredHighlights = searchQuery.trim()
    ? new Fuse(highlights, {
        keys: ['text', 'title'],
        threshold: 0.4,
      }).search(searchQuery).map(r => r.item)
    : highlights

  return (
    <div className="panel">
      <div className="panel-header">
        <h3 className="serif" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Highlighter size={18} />
          Surlignage
          {highlights.length > 0 && (
            <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}>
              ({highlights.length})
            </span>
          )}
        </h3>
        <button
          className={`panel-action-btn ${isHighlightMode ? 'active' : ''}`}
          onClick={onToggleHighlightMode}
        >
          <Palette size={16} />
          {isHighlightMode ? 'Actif' : 'Surligner'}
        </button>
      </div>

      {isHighlightMode && (
        <div className="highlight-toolbar">
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Couleur :</span>
          <div className="highlight-colors">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.value}
                className={`highlight-color-btn ${activeColor === c.value ? 'selected' : ''}`}
                style={{ background: c.value }}
                onClick={() => onColorChange(c.value)}
                title={c.name}
              />
            ))}
          </div>
          {selectedText && (
            <button className="primary" onClick={handleAddHighlight} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
              Surligner la sélection
            </button>
          )}
        </div>
      )}

      {/* Barre de recherche */}
      {highlights.length > 2 && (
        <div className="highlight-search">
          <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher dans les surlignages..."
            className="highlight-search-input"
          />
          {searchQuery && (
            <button
              style={{ padding: '2px', border: 'none', background: 'transparent', cursor: 'pointer' }}
              onClick={() => setSearchQuery('')}
            >
              <X size={14} color="var(--text-muted)" />
            </button>
          )}
        </div>
      )}

      {highlights.length === 0 ? (
        <div className="panel-empty">
          <Highlighter size={24} style={{ opacity: 0.3 }} />
          <p>Aucun surlignage</p>
        </div>
      ) : filteredHighlights.length === 0 ? (
        <div className="panel-empty">
          <Search size={24} style={{ opacity: 0.3 }} />
          <p>Aucun résultat pour "{searchQuery}"</p>
        </div>
      ) : (
        <div className="highlight-list">
          {filteredHighlights.map((hl) => (
            <div
              key={hl.id}
              className="highlight-item"
              onClick={() => onJumpToHighlight(hl)}
            >
              <div
                className="highlight-item-color"
                style={{ background: hl.color }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Titre / annotation */}
                {editingId === hl.id ? (
                  <div className="highlight-edit-row" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Titre de l'annotation..."
                      className="highlight-edit-input"
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle(hl)}
                      autoFocus
                    />
                    <button
                      style={{ padding: '2px', border: 'none', background: 'transparent', cursor: 'pointer' }}
                      onClick={() => handleSaveTitle(hl)}
                    >
                      <Check size={14} color="var(--color-success)" />
                    </button>
                    <button
                      style={{ padding: '2px', border: 'none', background: 'transparent', cursor: 'pointer' }}
                      onClick={() => setEditingId(null)}
                    >
                      <X size={14} color="var(--text-muted)" />
                    </button>
                  </div>
                ) : (
                  hl.title && (
                    <div className="highlight-item-title">{hl.title}</div>
                  )
                )}
                <div className="highlight-item-text">
                  {hl.text.length > 100 ? hl.text.slice(0, 100) + '...' : hl.text}
                </div>
              </div>
              <div className="highlight-item-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  className="highlight-item-action-btn"
                  onClick={() => handleStartEdit(hl)}
                  title="Annoter"
                >
                  <Edit3 size={13} />
                </button>
                <button
                  className="highlight-item-action-btn highlight-item-action-btn-delete"
                  onClick={() => handleDelete(hl.id)}
                  title="Supprimer"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export { HIGHLIGHT_COLORS }
export default HighlightPanel
