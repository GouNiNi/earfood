import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { ArrowLeft, Bookmark, Highlighter, BookOpen, MessageCircle, Settings, List } from 'lucide-react'
import { getDocument, getProgress, saveProgress, getBookmarks, getHighlights, updateAnalytics, getSettings } from '../stores'
import { TTSEngine } from '../utils/tts'
import Player from './Player'
import BookmarkPanel from './BookmarkPanel'
import HighlightPanel from './HighlightPanel'
import SummaryPanel from './SummaryPanel'
import ChatPanel from './ChatPanel'
import ChapterPanel from './ChapterPanel'

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
  const [ttsMode, setTtsMode] = useState('')

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

  // Sync TTS engine with saved settings
  const syncTtsSettings = useCallback(async () => {
    if (!ttsRef.current) return
    const settings = await getSettings()
    ttsRef.current.setMode(settings.ttsMode || 'local')
    if (settings.edgeVoice) {
      ttsRef.current.setEdgeVoice(settings.edgeVoice)
    }
    if (settings.sherpaVoice) {
      ttsRef.current.setSherpaVoice(settings.sherpaVoice)
    }
    ttsRef.current.setTrimEndMs(settings.trimEndMs ?? 200)
    const modeLabels = { hybrid: 'Edge TTS', sherpa: 'Sherpa IA', local: 'Local' }
    setTtsMode(modeLabels[settings.ttsMode] || 'Local')
  }, [])

  // Initialize TTS engine
  useEffect(() => {
    const initTts = async () => {
      ttsRef.current = new TTSEngine()

      // Charger le mode TTS depuis les réglages
      await syncTtsSettings()

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
      tts.onModeInfo = (info) => {
        setTtsMode(info)
      }
    }

    initTts()
    updateAnalytics({ newSession: true })

    return () => {
      if (ttsRef.current) {
        ttsRef.current.stop()
      }
    }
  }, [])

  // Re-sync TTS settings when settings panel closes
  useEffect(() => {
    const handler = () => syncTtsSettings()
    window.addEventListener('earfood-settings-changed', handler)
    return () => window.removeEventListener('earfood-settings-changed', handler)
  }, [syncTtsSettings])

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

  const refreshBookmarks = useCallback(async () => {
    const bm = await getBookmarks(documentId)
    setBookmarks(bm)
  }, [documentId])

  const refreshHighlights = useCallback(async () => {
    const hl = await getHighlights(documentId)
    setHighlights(hl)
  }, [documentId])

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

  // Auto-scroll to current sentence (deferred to avoid forced reflow during audio transition)
  useEffect(() => {
    if (currentSentenceIndex >= 0 && sentenceRefs.current[currentSentenceIndex]) {
      requestAnimationFrame(() => {
        sentenceRefs.current[currentSentenceIndex]?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
      })
    }
  }, [currentSentenceIndex])

  // Handle text selection for highlights
  const handleTextSelection = useCallback(() => {
    if (!isHighlightMode) return
    const selection = window.getSelection()
    const text = selection.toString().trim()
    if (text) {
      const range = selection.getRangeAt(0)
      // Find the sentence span containing the selection start
      let node = range.startContainer
      while (node && (!node.dataset || node.dataset.start === undefined)) {
        node = node.parentElement
      }
      if (node && node.dataset.start !== undefined) {
        const spanStart = parseInt(node.dataset.start, 10)
        // Offset within the span's text content
        const preRange = document.createRange()
        preRange.setStart(node, 0)
        preRange.setEnd(range.startContainer, range.startOffset)
        const offsetInSpan = preRange.toString().length
        const startPos = spanStart + offsetInSpan

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

  const handleJumpToBookmark = useCallback((position) => {
    const pct = totalDuration > 0 ? (position / totalDuration) * 100 : 0
    handleSeek(pct)
  }, [totalDuration])

  const handleJumpToHighlight = useCallback((highlight) => {
    if (!ttsRef.current || !doc) return
    ttsRef.current.seekToCharPosition(highlight.startPos)
  }, [doc])

  const handleJumpToChapter = useCallback((charPos) => {
    if (!ttsRef.current || !doc) return
    ttsRef.current.seekToCharPosition(charPos)
    const pct = (charPos / doc.content.length) * 100
    setPercentage(pct)
    setCurrentTime(Math.floor((pct / 100) * totalDuration))
  }, [doc, totalDuration])

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

  // Render rich HTML text with sentence highlighting
  const renderRichText = useMemo(() => {
    if (!doc?.htmlContent || sentencePositions.length === 0) return null

    const parser = new DOMParser()
    const parsed = parser.parseFromString(doc.htmlContent, 'text/html')
    let keyCounter = 0
    let charOffset = 0

    // Build a map of charOffset → sentence index for quick lookup
    const findSentenceAt = (offset) => {
      for (let i = 0; i < sentencePositions.length; i++) {
        const pos = sentencePositions[i]
        if (pos && offset >= pos.start && offset < pos.end) return i
      }
      return -1
    }

    const processNode = (node) => {
      if (node.nodeType === 3) {
        // Text node - split at sentence boundaries
        const text = node.textContent
        if (!text) return null
        const fragments = []
        let localOffset = 0

        while (localOffset < text.length) {
          const globalPos = charOffset + localOffset
          const sentIdx = findSentenceAt(globalPos)

          if (sentIdx >= 0) {
            const pos = sentencePositions[sentIdx]
            const sentEnd = pos.end - charOffset
            const sliceEnd = Math.min(sentEnd, text.length)
            const slice = text.slice(localOffset, sliceEnd)

            if (slice) {
              const isCurrent = sentIdx === currentSentenceIndex
              const overlapping = highlights.filter(hl =>
                hl.startPos < pos.end && hl.endPos > pos.start
              )
              const hlColor = overlapping.length > 0 ? overlapping[0].color : null

              fragments.push(
                <span
                  key={keyCounter++}
                  data-start={pos.start}
                  data-end={pos.end}
                  ref={(el) => { if (el) sentenceRefs.current[sentIdx] = el }}
                  className={`reader-sentence ${isCurrent ? 'reader-sentence-active' : ''}`}
                  style={{
                    backgroundColor: isCurrent
                      ? 'var(--color-highlight-1)'
                      : hlColor ? hlColor + '80' : 'transparent',
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
                  {slice}
                </span>
              )
            }
            localOffset = sliceEnd
          } else {
            // No sentence match, output char by char until we find one
            let nextMatch = localOffset + 1
            while (nextMatch < text.length && findSentenceAt(charOffset + nextMatch) < 0) {
              nextMatch++
            }
            fragments.push(<span key={keyCounter++}>{text.slice(localOffset, nextMatch)}</span>)
            localOffset = nextMatch
          }
        }

        charOffset += text.length
        return fragments.length === 1 ? fragments[0] : fragments
      }

      if (node.nodeType !== 1) return null

      const el = node
      const tag = el.tagName.toLowerCase()

      // Skip script/style
      if (tag === 'script' || tag === 'style') return null

      // Allowed tags
      const allowedTags = ['p', 'div', 'span', 'strong', 'b', 'em', 'i', 'u',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'blockquote', 'br', 'hr', 'img', 'a', 'sup', 'sub']

      const children = []
      for (const child of el.childNodes) {
        const result = processNode(child)
        if (result !== null) {
          if (Array.isArray(result)) {
            children.push(...result)
          } else {
            children.push(result)
          }
        }
      }

      if (tag === 'br') return <br key={keyCounter++} />
      if (tag === 'hr') return <hr key={keyCounter++} />
      if (tag === 'img') {
        return <img key={keyCounter++} src={el.getAttribute('src')} alt={el.getAttribute('alt') || ''} />
      }

      const useTag = allowedTags.includes(tag) ? tag : 'span'
      return React.createElement(useTag, { key: keyCounter++ }, ...children)
    }

    const bodyChildren = []
    for (const child of parsed.body.childNodes) {
      const result = processNode(child)
      if (result !== null) {
        if (Array.isArray(result)) {
          bodyChildren.push(...result)
        } else {
          bodyChildren.push(result)
        }
      }
    }

    return bodyChildren
  }, [doc, sentencePositions, currentSentenceIndex, highlights, isPlaying])

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
              data-start={pos?.start}
              data-end={pos?.end}
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
        <button className="reader-back-btn" onClick={onOpenSettings} title="Réglages">
          <Settings size={20} />
        </button>
      </header>

      {/* Zone de texte */}
      <div className="reader-text-view">
        {doc?.htmlContent && renderRichText ? (
          <div
            ref={textViewRef}
            className="reader-text-content reader-rich-text"
            onMouseUp={handleTextSelection}
            onTouchEnd={handleTextSelection}
          >
            {renderRichText}
          </div>
        ) : (
          renderText()
        )}
      </div>

      {/* Barre d'actions */}
      <div className="reader-actions">
        <button
          className={`reader-action-btn ${activePanel === 'chapters' ? 'active' : ''}`}
          onClick={() => togglePanel('chapters')}
        >
          <List size={16} />
          <span>Chapitres</span>
        </button>
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
      </div>

      {/* Panneaux contextuels */}
      {activePanel === 'chapters' && (
        <ChapterPanel
          chapters={doc.chapters || []}
          currentCharPos={sentencePositions[currentSentenceIndex]?.start || 0}
          onJumpToChapter={handleJumpToChapter}
        />
      )}
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
          documentTitle={doc.title}
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

      {/* Player */}
      <Player
        isPlaying={isPlaying}
        currentTime={currentTime}
        totalDuration={totalDuration}
        percentage={percentage}
        rate={rate}
        ttsMode={ttsMode}
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
