import { useState, useEffect, useRef, memo } from 'react'
import { BookOpen, Loader, Play, RefreshCw, AlertCircle } from 'lucide-react'
import { getSummaries, saveSummary, getSettings } from '../stores'
import { generateSummary, isGeminiReady } from '../utils/gemini'
import { TTSEngine } from '../utils/tts'

const SummaryPanel = ({ documentId, documentContent, chapters: chaptersProp, onConfigureApi }) => {
  const [summaries, setSummaries] = useState({})
  const [loadingChapter, setLoadingChapter] = useState(null)
  const [error, setError] = useState(null)
  const [playingIndex, setPlayingIndex] = useState(null)
  const summaryTtsRef = useRef(null)

  // Initialize TTS engine for summaries
  useEffect(() => {
    const initTts = async () => {
      summaryTtsRef.current = new TTSEngine()
      const settings = await getSettings()
      summaryTtsRef.current.setMode(settings.ttsMode || 'local')
      if (settings.edgeVoice) summaryTtsRef.current.setEdgeVoice(settings.edgeVoice)
      if (settings.sherpaVoice) summaryTtsRef.current.setSherpaVoice(settings.sherpaVoice)
      summaryTtsRef.current.setTrimEndMs(settings.trimEndMs ?? 200)
    }
    initTts()

    const handleSettingsChanged = async () => {
      if (!summaryTtsRef.current) return
      const settings = await getSettings()
      summaryTtsRef.current.setMode(settings.ttsMode || 'local')
      if (settings.edgeVoice) summaryTtsRef.current.setEdgeVoice(settings.edgeVoice)
      if (settings.sherpaVoice) summaryTtsRef.current.setSherpaVoice(settings.sherpaVoice)
      summaryTtsRef.current.setTrimEndMs(settings.trimEndMs ?? 200)
    }
    window.addEventListener('earfood-settings-changed', handleSettingsChanged)

    return () => {
      window.removeEventListener('earfood-settings-changed', handleSettingsChanged)
      if (summaryTtsRef.current) summaryTtsRef.current.stop()
    }
  }, [])

  const chapters = chaptersProp || []

  useEffect(() => {
    if (documentContent) {
      loadCachedSummaries()
    }
  }, [documentContent])

  const loadCachedSummaries = async () => {
    const cached = await getSummaries(documentId)
    const map = {}
    cached.forEach(s => { map[s.chapterStart] = s })
    setSummaries(map)
  }

  const handleGenerateSummary = async (chapter, index) => {
    if (!isGeminiReady()) {
      setError('Clé API Gemini non configurée.')
      return
    }

    setLoadingChapter(index)
    setError(null)

    try {
      const segment = documentContent.slice(chapter.start, chapter.end)
      console.log(`[Summary] Chapter "${chapter.title}" start=${chapter.start} end=${chapter.end} length=${segment.length}`)
      if (!segment || segment.trim().length < 20) {
        setError(`Le chapitre "${chapter.title}" ne contient pas assez de texte (${segment.length} caractères).`)
        setLoadingChapter(null)
        return
      }
      const summaryText = await generateSummary(segment, chapter.title)

      const summary = {
        documentId,
        chapterStart: chapter.start,
        chapterTitle: chapter.title,
        summary: summaryText,
        duration: Math.ceil(summaryText.split(/\s+/).length / 150 * 60),
        createdAt: Date.now(),
      }

      await saveSummary(summary)
      setSummaries(prev => ({ ...prev, [chapter.start]: summary }))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoadingChapter(null)
    }
  }

  const handlePlaySummary = (summary, index) => {
    if (!summaryTtsRef.current) return

    // Stop if already playing
    if (playingIndex === index) {
      summaryTtsRef.current.stop()
      setPlayingIndex(null)
      return
    }

    summaryTtsRef.current.stop()
    summaryTtsRef.current.loadText(summary.summary)
    summaryTtsRef.current.onEnd = () => setPlayingIndex(null)
    setPlayingIndex(index)
    summaryTtsRef.current.play()
  }

  const geminiReady = isGeminiReady()

  return (
    <div className="panel">
      <div className="panel-header">
        <h3 className="serif" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BookOpen size={18} />
          Résumés IA
        </h3>
        {!geminiReady && (
          <button className="panel-action-btn" onClick={onConfigureApi}>
            Configurer API
          </button>
        )}
      </div>

      {error && (
        <div style={{
          padding: '0.6rem 1rem',
          background: '#fef2f2',
          borderBottom: '1px solid #fca5a5',
          color: '#dc2626',
          fontSize: '0.8rem',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {!geminiReady ? (
        <div className="panel-empty">
          <BookOpen size={24} style={{ opacity: 0.3 }} />
          <p>Configurez votre clé API Gemini pour générer des résumés intelligents.</p>
          <button className="primary" onClick={onConfigureApi} style={{ marginTop: '0.5rem', padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
            Configurer
          </button>
        </div>
      ) : chapters.length === 0 ? (
        <div className="panel-empty">
          <p>Aucun chapitre détecté</p>
        </div>
      ) : (
        <div className="summary-list">
          {chapters.map((chapter, index) => {
            const cached = summaries[chapter.start]
            const isLoading = loadingChapter === index
            const isCurrentlyPlaying = playingIndex === index

            return (
              <div key={index} className="summary-item">
                <div className="summary-item-header">
                  <span className="summary-item-title">{chapter.title}</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {cached && (
                      <button
                        className="summary-play-btn"
                        onClick={() => handlePlaySummary(cached, index)}
                        title={isCurrentlyPlaying ? 'Arrêter' : 'Écouter le résumé'}
                      >
                        <Play size={14} fill={isCurrentlyPlaying ? 'var(--accent-gold)' : 'none'} />
                      </button>
                    )}
                    <button
                      className="summary-gen-btn"
                      onClick={() => handleGenerateSummary(chapter, index)}
                      disabled={isLoading}
                      title={cached ? 'Régénérer' : 'Générer le résumé'}
                    >
                      {isLoading ? (
                        <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                      ) : cached ? (
                        <RefreshCw size={14} />
                      ) : (
                        <BookOpen size={14} />
                      )}
                    </button>
                  </div>
                </div>
                {cached && (
                  <div className="summary-item-text">
                    {cached.summary}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default memo(SummaryPanel)
