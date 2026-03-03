import { useState, useEffect } from 'react'
import { BookOpen, Loader, Play, RefreshCw, AlertCircle } from 'lucide-react'
import { getSummaries, saveSummary } from '../stores'
import { detectChapters, generateSummary, isGeminiReady } from '../utils/gemini'
import { TTSEngine } from '../utils/tts'

const SummaryPanel = ({ documentId, documentContent, onConfigureApi }) => {
  const [chapters, setChapters] = useState([])
  const [summaries, setSummaries] = useState({})
  const [loadingChapter, setLoadingChapter] = useState(null)
  const [error, setError] = useState(null)
  const [playingIndex, setPlayingIndex] = useState(null)
  const summaryTtsRef = { current: null }

  useEffect(() => {
    if (documentContent) {
      const detected = detectChapters(documentContent)
      setChapters(detected)
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
    // Arrêter si déjà en lecture
    if (playingIndex === index) {
      window.speechSynthesis.cancel()
      setPlayingIndex(null)
      return
    }

    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(summary.summary)
    utterance.lang = 'fr-FR'
    utterance.rate = 1.0

    const voices = window.speechSynthesis.getVoices()
    const frVoice = voices.find(v => v.lang.startsWith('fr'))
    if (frVoice) utterance.voice = frVoice

    utterance.onend = () => setPlayingIndex(null)
    utterance.onerror = () => setPlayingIndex(null)

    setPlayingIndex(index)
    window.speechSynthesis.speak(utterance)
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

export default SummaryPanel
