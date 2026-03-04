import { memo } from 'react'
import { List } from 'lucide-react'

const ChapterPanel = memo(function ChapterPanel({ chapters, currentCharPos, onJumpToChapter }) {
  if (!chapters || chapters.length === 0) {
    return (
      <div className="panel-container">
        <h3 className="serif" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 1rem' }}>
          <List size={18} />
          Chapitres
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Aucun chapitre détecté dans ce document.
        </p>
      </div>
    )
  }

  const activeIndex = chapters.findIndex((ch, i) => {
    const next = chapters[i + 1]
    return currentCharPos >= ch.start && (!next || currentCharPos < next.start)
  })

  return (
    <div className="panel-container">
      <h3 className="serif" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 1rem' }}>
        <List size={18} />
        Chapitres ({chapters.length})
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {chapters.map((ch, index) => (
          <button
            key={index}
            onClick={() => onJumpToChapter(ch.start)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '0.5rem 0.75rem',
              background: index === activeIndex ? 'var(--accent-gold-light, rgba(197, 160, 89, 0.15))' : 'transparent',
              border: 'none',
              borderLeft: index === activeIndex ? '3px solid var(--accent-gold)' : '3px solid transparent',
              borderRadius: '4px',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: '0.85rem',
              color: index === activeIndex ? 'var(--accent-gold)' : 'var(--text-main)',
              fontWeight: index === activeIndex ? 600 : 400,
              transition: 'all 0.15s',
            }}
          >
            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', minWidth: '1.5rem' }}>
              {index + 1}
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ch.title}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
})

export default ChapterPanel
