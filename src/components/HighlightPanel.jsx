import { useState } from 'react'
import { Highlighter, Trash2, Palette } from 'lucide-react'
import { saveHighlight, deleteHighlight as deleteHl } from '../stores'

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
  const handleAddHighlight = async () => {
    if (!selectedText || !selectionRange) return
    const highlight = {
      id: crypto.randomUUID(),
      documentId,
      startPos: selectionRange.start,
      endPos: selectionRange.end,
      text: selectedText,
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

  return (
    <div className="panel">
      <div className="panel-header">
        <h3 className="serif" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Highlighter size={18} />
          Surlignage
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

      {highlights.length === 0 ? (
        <div className="panel-empty">
          <Highlighter size={24} style={{ opacity: 0.3 }} />
          <p>Aucun surlignage</p>
        </div>
      ) : (
        <div className="highlight-list">
          {highlights.map((hl) => (
            <div
              key={hl.id}
              className="highlight-item"
              onClick={() => onJumpToHighlight(hl)}
            >
              <div
                className="highlight-item-color"
                style={{ background: hl.color }}
              />
              <div className="highlight-item-text">
                {hl.text.length > 80 ? hl.text.slice(0, 80) + '...' : hl.text}
              </div>
              <button
                className="highlight-item-delete"
                onClick={(e) => { e.stopPropagation(); handleDelete(hl.id) }}
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

export { HIGHLIGHT_COLORS }
export default HighlightPanel
