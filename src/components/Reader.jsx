import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { ArrowLeft, Bookmark, Highlighter, FileText, BookOpen, MessageCircle } from 'lucide-react'
import { getDocument, getProgress, saveProgress, getBookmarks, getHighlights, updateAnalytics } from '../stores'
import { TTSEngine } from '../utils/tts'
import Player from './Player'
import BookmarkPanel from './BookmarkPanel'
import HighlightPanel from './HighlightPanel'
import ExportPanel from './ExportPanel'
import SummaryPanel from './SummaryPanel'
import ChatPanel from './ChatPanel'

const Reader = ({ documentId, onBack, onOpenSettings }) => {
  const [doc, setDoc] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  // TTS state
  const ttsRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(-1)
  const [currentTime, setCurrentTime] = useState(0)
  const [totalDuration, setTotalDuration] = useState(0)
  const [percentage, setPercentage] = useState(0)
  const [rate, setRate] = useState(1.0)

  // Bookmarks & highlights
  const [bookmarks, setBookmarks] = useState([])
  const [highlights, setHighlights] = useState([])

  // Panel visibility
  const [activePanel, setActivePanel] = useState(null)

  // Highlight mode
  const [isHighlightMode, setIsHighlightMode] = useState(false)
  const [activeColor, setActiveColor] = useState('#fef08a')
  const [selectedText, setSelectedText] = useState('')
  const [selectionRange, setSelectionRange] = useState(null)

  // Text view ref for auto-scroll
  const textViewRef = useRef(null)
  const sentenceRefs = useRef({})

  // Analytics: track session
  const sessionStartRef = useRef(null)

  // Initialize TTS engine
  useEffect(() => {
    ttsRef.current = new TTSEngine()

    const tts = ttsRef.current
    tts.onSentenceChange = (index, pos) => {
      setCurrentSentenceIndex(index)
      setCurrentTime(tts.getEstimatedCurrentTime())
      setPercentage(tts.getPercentage())
    }
    tts.onEnd = () => {
      setIsPlaying(false)
      handleSaveProgress()
      updateAnalytics({ documentCompleted: true })
    }
    tts.onProgressUpdate = (charPos, pct) => {
      setCurrentTime(tts.getEstimatedCurrentTime())
      setPercentage(pct)
    }

    // Track session start
    updateAnalytics({ newSession: true })

    return () => {
      if (ttsRef.current) {
        ttsRef.current.stop()
      }
    }
  }, [])

  // Load document
  useEffect(() => {
    loadDocument()
  }, [documentId])

  const loadDocument = async () => {
    setIsLoading(true)
    try {
      const document = await getDocument(documentId)
      if (!document) {
        onBack()
        return
      }
      setDoc(document)
      setTotalDuration(document.duration)

      // Charger le texte dans le TTS
      if (ttsRef.current) {
        ttsRef.current.loadText(document.content)
      }

      // Restaurer la progression
      const progress = await getProgress(documentId)
      if (progress && ttsRef.current) {
        ttsRef.current.seekToCharPosition(
          Math.floor((progress.percentage / 100) * document.content.length)
        )
        setPercentage(progress.percentage)
        setCurrentTime(Math.floor((progress.percentage / 100) * document.duration))
      }

      // Charger bookmarks et highlights
      await refreshBookmarks()
      await refreshHighlights()
    } catch (error) {
      console.error("Erreur chargement document:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const refreshBookmarks = async () => {
    const bm = await getBookmarks(documentId)
    setBookmarks(bm)
  }

  const refreshHighlights = async () => {
    const hl = await getHighlights(documentId)
    setHighlights(hl)
  }

  const handleSaveProgress = useCallback(async () => {
    if (!ttsRef.current || !doc) return
    const tts = ttsRef.current
    await saveProgress(documentId, {
      currentPosition: tts.getEstimatedCurrentTime(),
      percentage: tts.getPercentage(),
    })
  }, [documentId, doc])

  // Save progress periodically while playing + track listening time
  useEffect(() => {
    if (!isPlaying) return
    sessionStartRef.current = Date.now()
    const interval = setInterval(() => {
      handleSaveProgress()
      // Track listening time every 5s
      updateAnalytics({ listeningTime: 5 })
    }, 5000)
    return () => clearInterval(interval)
  }, [isPlaying, handleSaveProgress])

  // Auto-scroll to current sentence
  useEffect(() => {
    if (currentSentenceIndex >= 0 && sentenceRefs.current[currentSentenceIndex]) {
      sentenceRefs.current[currentSentenceIndex].scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }
  }, [currentSentenceIndex])

  // Handle text selection for highlights
  const handleTextSelection = useCallback(() => {
    if (!isHighlightMode) return
    const selection = window.getSelection()
    const text = selection.toString().trim()
    if (text) {
      const textView = textViewRef.current
      if (textView) {
        const range = selection.getRangeAt(0)
        const preRange = document.createRange()
        preRange.setStart(textView, 0)
        preRange.setEnd(range.startContainer, range.startOffset)
        const startPos = preRange.toString().length

        setSelectedText(text)
        setSelectionRange({ start: startPos, end: startPos + text.length })
      }
    } else {
      setSelectedText('')
      setSelectionRange(null)
    }
  }, [isHighlightMode])

  // Player controls
  const handlePlayPause = () => {
    if (!ttsRef.current) return
    if (isPlaying) {
      ttsRef.current.pause()
      setIsPlaying(false)
      handleSaveProgress()
    } else {
      ttsRef.current.play()
      setIsPlaying(true)
    }
  }

  const handleSkipBack = () => {
    if (ttsRef.current) ttsRef.current.skip(-15)
  }

  const handleSkipForward = () => {
    if (ttsRef.current) ttsRef.current.skip(15)
  }

  const handleRateChange = (newRate) => {
    setRate(newRate)
    if (ttsRef.current) ttsRef.current.setRate(newRate)
  }

  const handleSeek = (pct) => {
    if (!ttsRef.current || !doc) return
    const charPos = Math.floor((pct / 100) * doc.content.length)
    ttsRef.current.seekToCharPosition(charPos)
    setPercentage(pct)
    setCurrentTime(Math.floor((pct / 100) * totalDuration))
  }

  const handleJumpToBookmark = (position) => {
    const pct = totalDuration > 0 ? (position / totalDuration) * 100 : 0
    handleSeek(pct)
  }

  const handleJumpToHighlight = (highlight) => {
    if (!ttsRef.current || !doc) return
    ttsRef.current.seekToCharPosition(highlight.startPos)
  }

  const togglePanel = (panel) => {
    setActivePanel(activePanel === panel ? null : panel)
  }

  // Memoize sentences from TTS
  const sentences = useMemo(() => {
    if (!ttsRef.current) return []
    return ttsRef.current.sentences
  }, [doc])

  const sentencePositions = useMemo(() => {
    if (!ttsRef.current) return []
    return ttsRef.current.sentencePositions
  }, [doc])

  // Render text with highlights
  const renderText = () => {
    if (!doc) return null

    return (
      <div
        ref={textViewRef}
        className="reader-text-content"
        onMouseUp={handleTextSelection}
        onTouchEnd={handleTextSelection}
      >
        {sentences.map((sentence, index) => {
          const pos = sentencePositions[index]
          const isCurrent = index === currentSentenceIndex

          const overlappingHighlights = highlights.filter(hl =>
            pos && hl.startPos < pos.end && hl.endPos > pos.start
          )

          const highlightColor = overlappingHighlights.length > 0
            ? overlappingHighlights[0].color
            : null

          return (
            <span
              key={index}
              ref={(el) => { sentenceRefs.current[index] = el }}
              className={`reader-sentence ${isCurrent ? 'reader-sentence-active' : ''}`}
              style={{
                backgroundColor: isCurrent
                  ? 'var(--color-highlight-1)'
                  : highlightColor
                    ? highlightColor + '80'
                    : 'transparent',
              }}
              onClick={() => {
                if (ttsRef.current && pos) {
                  ttsRef.current.seekToCharPosition(pos.start)
                  if (!isPlaying) {
                    ttsRef.current.play()
                    setIsPlaying(true)
                  }
                }
              }}
            >
              {sentence}{' '}
            </span>
          )
        })}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '5rem', color: 'var(--text-muted)' }}>
        Chargement du document...
      </div>
    )
  }

  if (!doc) return null

  return (
    <div className="reader-container">
      {/* Header */}
      <header className="reader-header">
        <button className="reader-back-btn" onClick={() => { if (ttsRef.current) ttsRef.current.stop(); handleSaveProgress(); onBack() }}>
          <ArrowLeft size={20} />
        </button>
        <h2 className="reader-title serif">{doc.title}</h2>
      </header>

      {/* Zone de texte */}
      <div className="reader-text-view">
        {renderText()}
      </div>

      {/* Barre d'actions */}
      <div className="reader-actions">
        <button
          className={`reader-action-btn ${activePanel === 'bookmarks' ? 'active' : ''}`}
          onClick={() => togglePanel('bookmarks')}
        >
          <Bookmark size={16} />
          <span>Marque-pages</span>
        </button>
        <button
          className={`reader-action-btn ${activePanel === 'highlights' ? 'active' : ''}`}
          onClick={() => togglePanel('highlights')}
        >
          <Highlighter size={16} />
          <span>Surligner</span>
        </button>
        <button
          className={`reader-action-btn ${activePanel === 'summaries' ? 'active' : ''}`}
          onClick={() => togglePanel('summaries')}
        >
          <BookOpen size={16} />
          <span>Résumés</span>
        </button>
        <button
          className={`reader-action-btn ${activePanel === 'chat' ? 'active' : ''}`}
          onClick={() => togglePanel('chat')}
        >
          <MessageCircle size={16} />
          <span>Chat</span>
        </button>
        <button
          className={`reader-action-btn ${activePanel === 'export' ? 'active' : ''}`}
          onClick={() => togglePanel('export')}
        >
          <FileText size={16} />
          <span>Export</span>
        </button>
      </div>

      {/* Panneaux contextuels */}
      {activePanel === 'bookmarks' && (
        <BookmarkPanel
          documentId={documentId}
          bookmarks={bookmarks}
          currentTime={currentTime}
          onJumpTo={handleJumpToBookmark}
          onRefresh={refreshBookmarks}
        />
      )}
      {activePanel === 'highlights' && (
        <HighlightPanel
          documentId={documentId}
          highlights={highlights}
          selectedText={selectedText}
          selectionRange={selectionRange}
          onRefresh={refreshHighlights}
          onJumpToHighlight={handleJumpToHighlight}
          activeColor={activeColor}
          onColorChange={setActiveColor}
          isHighlightMode={isHighlightMode}
          onToggleHighlightMode={() => setIsHighlightMode(!isHighlightMode)}
        />
      )}
      {activePanel === 'summaries' && (
        <SummaryPanel
          documentId={documentId}
          documentContent={doc.content}
          onConfigureApi={onOpenSettings}
        />
      )}
      {activePanel === 'chat' && (
        <ChatPanel
          documentId={documentId}
          documentContent={doc.content}
          onConfigureApi={onOpenSettings}
        />
      )}
      {activePanel === 'export' && (
        <ExportPanel
          documentTitle={doc.title}
          highlights={highlights}
        />
      )}

      {/* Player */}
      <Player
        isPlaying={isPlaying}
        currentTime={currentTime}
        totalDuration={totalDuration}
        percentage={percentage}
        rate={rate}
        onPlayPause={handlePlayPause}
        onSkipBack={handleSkipBack}
        onSkipForward={handleSkipForward}
        onRateChange={handleRateChange}
        onSeek={handleSeek}
      />
    </div>
  )
}

export default Reader
