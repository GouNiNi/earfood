import { useState, useEffect, memo } from 'react'
import { Highlighter, Trash2, Search, Edit3, Check, X, Download, Copy } from 'lucide-react'
import { saveHighlight, deleteHighlight as deleteHl } from '../stores'
import { formatTime } from '../utils/formatTime'
import Fuse from 'fuse.js'

const HIGHLIGHT_COLORS = [
  { name: 'Aucune', value: null },
  { name: 'Jaune', value: '#fef08a' },
  { name: 'Rose', value: '#fca5a5' },
  { name: 'Vert', value: '#a7f3d0' },
  { name: 'Bleu', value: '#bfdbfe' },
]

const HighlightPanel = ({
  documentId,
  documentTitle,
  highlights,
  selectedText,
  selectionRange,
  currentSentenceIndex,
  sentencePositions,
  sentences,
  onRefresh,
  onJumpToHighlight,
  activeColor,
  onColorChange,
}) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [copied, setCopied] = useState(false)

  // Auto-apply highlight when a color is clicked
  // Mode 1: text selection exists → highlight the selection
  // Mode 2: no selection but active sentence → highlight the active sentence
  const handleColorClick = async (colorValue) => {
    onColorChange(colorValue)
    if (!colorValue) return

    if (selectedText && selectionRange) {
      // Mode 1: highlight the manual text selection
      const highlight = {
        id: crypto.randomUUID(),
        documentId,
        startPos: selectionRange.start,
        endPos: selectionRange.end,
        text: selectedText,
        title: '',
        color: colorValue,
        createdAt: Date.now(),
      }
      await saveHighlight(highlight)
      onRefresh()
    } else if (currentSentenceIndex >= 0 && sentencePositions?.[currentSentenceIndex] && sentences?.[currentSentenceIndex]) {
      // Mode 2: highlight the currently active sentence
      const pos = sentencePositions[currentSentenceIndex]
      const highlight = {
        id: crypto.randomUUID(),
        documentId,
        startPos: pos.start,
        endPos: pos.end,
        text: sentences[currentSentenceIndex],
        title: '',
        color: colorValue,
        createdAt: Date.now(),
      }
      await saveHighlight(highlight)
      onRefresh()
    }
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

  // Export markdown
  const generateMarkdown = () => {
    if (highlights.length === 0) return ''
    let md = `# Document : ${documentTitle}\n## Passages surlignés\n\n`
    highlights.forEach((hl, i) => {
      const estimatedSeconds = Math.floor(hl.startPos / 15)
      const title = hl.title ? ` — ${hl.title}` : ''
      md += `**Passage ${i + 1}${title}** (position: ${formatTime(estimatedSeconds)})\n`
      md += `> ${hl.text}\n\n`
    })
    return md.trim()
  }

  const handleCopy = async () => {
    const md = generateMarkdown()
    try {
      await navigator.clipboard.writeText(md)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = md
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleDownload = () => {
    const md = generateMarkdown()
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${documentTitle} - Passages surlignés.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
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
        <div className="highlight-colors">
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c.name}
              className={`highlight-color-btn ${activeColor === c.value ? 'selected' : ''}`}
              style={{
                background: c.value || 'transparent',
                border: c.value ? '2px solid transparent' : '2px solid var(--border-color)',
                position: 'relative',
              }}
              onClick={() => handleColorClick(c.value)}
              title={c.name}
            >
              {!c.value && (
                <span style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%) rotate(45deg)',
                  width: '16px',
                  height: '2px',
                  background: 'var(--text-muted)',
                }} />
              )}
            </button>
          ))}
        </div>
      </div>

      {(selectedText || (currentSentenceIndex >= 0 && sentences?.[currentSentenceIndex])) && (
        <div style={{
          padding: '0.5rem 1rem',
          borderBottom: '1px solid var(--border-color)',
          fontSize: '0.8rem',
          color: 'var(--text-muted)',
          fontStyle: 'italic',
        }}>
          {selectedText
            ? <>Sélection : « {selectedText.length > 60 ? selectedText.slice(0, 60) + '...' : selectedText} »</>
            : <>Phrase active : « {sentences[currentSentenceIndex].length > 60 ? sentences[currentSentenceIndex].slice(0, 60) + '...' : sentences[currentSentenceIndex]} »</>
          }
          <span style={{ color: 'var(--accent-gold)', marginLeft: '6px' }}>— cliquez une couleur</span>
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
          <p style={{ fontSize: '0.8rem' }}>Cliquez une phrase ou sélectionnez du texte, puis choisissez une couleur.</p>
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

      {/* Export buttons */}
      {highlights.length > 0 && (
        <div className="export-actions">
          <button onClick={handleCopy} style={{ flex: 1 }}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            <span style={{ marginLeft: '8px' }}>{copied ? 'Copié !' : 'Copier .md'}</span>
          </button>
          <button onClick={handleDownload} className="primary" style={{ flex: 1 }}>
            <Download size={16} />
            <span style={{ marginLeft: '8px' }}>Télécharger .md</span>
          </button>
        </div>
      )}
    </div>
  )
}

export { HIGHLIGHT_COLORS }
export default memo(HighlightPanel)
