import { useState, useEffect, useRef, memo } from 'react'
import { MessageCircle, Send, Mic, MicOff, Volume2, Trash2, Loader, BookOpen } from 'lucide-react'
import { getChatHistory, saveChatHistory, clearChatHistory, getSummaries, getSettings } from '../stores'
import { askAboutDocument, isGeminiReady, detectChapters } from '../utils/gemini'
import { TTSEngine } from '../utils/tts'

const ChatPanel = ({ documentId, documentContent, onConfigureApi }) => {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState(null)
  const messagesEndRef = useRef(null)
  const recognitionRef = useRef(null)
  const chatTtsRef = useRef(null)

  // Summaries sidebar state
  const [summaries, setSummaries] = useState({})
  const [chapters, setChapters] = useState([])
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Initialize TTS engine for chat voice
  useEffect(() => {
    const initChatTts = async () => {
      chatTtsRef.current = new TTSEngine()
      const settings = await getSettings()
      chatTtsRef.current.setMode(settings.ttsMode || 'local')
      if (settings.edgeVoice) chatTtsRef.current.setEdgeVoice(settings.edgeVoice)
      if (settings.sherpaVoice) chatTtsRef.current.setSherpaVoice(settings.sherpaVoice)
      chatTtsRef.current.setTrimEndMs(settings.trimEndMs ?? 200)
    }
    initChatTts()

    const handleSettingsChanged = async () => {
      if (!chatTtsRef.current) return
      const settings = await getSettings()
      chatTtsRef.current.setMode(settings.ttsMode || 'local')
      if (settings.edgeVoice) chatTtsRef.current.setEdgeVoice(settings.edgeVoice)
      if (settings.sherpaVoice) chatTtsRef.current.setSherpaVoice(settings.sherpaVoice)
      chatTtsRef.current.setTrimEndMs(settings.trimEndMs ?? 200)
    }
    window.addEventListener('earfood-settings-changed', handleSettingsChanged)

    return () => {
      window.removeEventListener('earfood-settings-changed', handleSettingsChanged)
      if (chatTtsRef.current) chatTtsRef.current.stop()
    }
  }, [])

  useEffect(() => {
    loadHistory()
    // Load chapters and summaries for sidebar
    if (documentContent) {
      const detected = detectChapters(documentContent)
      setChapters(detected)
      loadSummaries()
    }
    return () => {
      if (recognitionRef.current) recognitionRef.current.stop()
    }
  }, [documentId])

  const loadSummaries = async () => {
    const cached = await getSummaries(documentId)
    const map = {}
    cached.forEach(s => { map[s.chapterStart] = s })
    setSummaries(map)
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadHistory = async () => {
    const history = await getChatHistory(documentId)
    setMessages(history)
  }

  const handleSend = async () => {
    if (!input.trim() || isLoading) return
    if (!isGeminiReady()) {
      setError('Clé API Gemini non configurée.')
      return
    }

    const question = input.trim()
    setInput('')
    setError(null)

    const newMessages = [...messages, { role: 'user', text: question, timestamp: Date.now() }]
    setMessages(newMessages)
    setIsLoading(true)

    try {
      const chatHistory = messages
        .reduce((acc, msg, i, arr) => {
          if (msg.role === 'user' && arr[i + 1]?.role === 'assistant') {
            acc.push({ question: msg.text, answer: arr[i + 1].text })
          }
          return acc
        }, [])

      const answer = await askAboutDocument(question, documentContent, chatHistory)

      const withAnswer = [...newMessages, { role: 'assistant', text: answer, timestamp: Date.now() }]
      setMessages(withAnswer)
      await saveChatHistory(documentId, withAnswer)
    } catch (e) {
      setError(e.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSpeak = (text) => {
    if (!chatTtsRef.current) return
    chatTtsRef.current.stop()
    chatTtsRef.current.loadText(text)
    chatTtsRef.current.play()
  }

  const toggleDictation = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setError('La dictée vocale n\'est pas supportée par ce navigateur.')
      return
    }

    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    recognition.lang = 'fr-FR'
    recognition.continuous = false
    recognition.interimResults = true

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map(r => r[0].transcript)
        .join('')
      setInput(transcript)
    }

    recognition.onend = () => setIsListening(false)
    recognition.onerror = () => setIsListening(false)

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }

  const handleClear = async () => {
    if (!confirm('Supprimer l\'historique de cette conversation ?')) return
    await clearChatHistory(documentId)
    setMessages([])
  }

  const handleInsertSummaryContext = (chapter, summary) => {
    const prefix = `À propos de "${chapter.title}" : ${summary.summary.slice(0, 200)}...\n\nMa question : `
    setInput(prefix)
    setSidebarOpen(false)
  }

  const geminiReady = isGeminiReady()
  const hasSummaries = Object.keys(summaries).length > 0

  return (
    <div className="panel chat-panel">
      <div className="panel-header">
        <h3 className="serif" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MessageCircle size={18} />
          Discussion
        </h3>
        <div style={{ display: 'flex', gap: '4px' }}>
          {hasSummaries && (
            <button
              className={`panel-action-btn ${sidebarOpen ? 'active' : ''}`}
              onClick={() => setSidebarOpen(!sidebarOpen)}
              title="Résumés des chapitres"
            >
              <BookOpen size={14} />
            </button>
          )}
          {messages.length > 0 && (
            <button className="panel-action-btn" onClick={handleClear} title="Effacer la conversation">
              <Trash2 size={14} />
            </button>
          )}
          {!geminiReady && (
            <button className="panel-action-btn" onClick={onConfigureApi}>
              Configurer API
            </button>
          )}
        </div>
      </div>

      {!geminiReady ? (
        <div className="panel-empty">
          <MessageCircle size={24} style={{ opacity: 0.3 }} />
          <p>Configurez votre clé API Gemini pour discuter avec votre document.</p>
          <button className="primary" onClick={onConfigureApi} style={{ marginTop: '0.5rem', padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
            Configurer
          </button>
        </div>
      ) : (
        <div className="chat-layout">
          {/* Sidebar résumés */}
          {hasSummaries && (
            <div className={`chat-sidebar ${sidebarOpen ? 'chat-sidebar-open' : ''}`}>
              <div style={{ padding: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                Résumés
              </div>
              <div className="chat-sidebar-list">
                {chapters.map((ch, i) => {
                  const summary = summaries[ch.start]
                  if (!summary) return null
                  return (
                    <div
                      key={i}
                      className="chat-sidebar-item"
                      onClick={() => handleInsertSummaryContext(ch, summary)}
                      title="Cliquez pour utiliser comme contexte"
                    >
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-gold)', marginBottom: '2px' }}>
                        {ch.title}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.3 }}>
                        {summary.summary.length > 120 ? summary.summary.slice(0, 120) + '...' : summary.summary}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Main chat area */}
          <div className="chat-main">
            {/* Messages */}
            <div className="chat-messages">
              {messages.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  <p>Posez une question sur le document.</p>
                  <p style={{ fontSize: '0.75rem' }}>L'IA répondra en se basant sur le contenu.</p>
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`chat-message chat-message-${msg.role}`}>
                  <div className="chat-bubble">
                    {msg.text}
                    {msg.role === 'assistant' && (
                      <button
                        className="chat-speak-btn"
                        onClick={() => handleSpeak(msg.text)}
                        title="Écouter"
                      >
                        <Volume2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="chat-message chat-message-assistant">
                  <div className="chat-bubble chat-bubble-loading">
                    <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    <span>Réflexion...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {error && (
              <div style={{ padding: '0.4rem 1rem', fontSize: '0.75rem', color: '#dc2626', background: '#fef2f2' }}>
                {error}
              </div>
            )}

            {/* Input */}
            <div className="chat-input-row">
              <button
                className={`chat-mic-btn ${isListening ? 'active' : ''}`}
                onClick={toggleDictation}
                title="Dictée vocale"
              >
                {isListening ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Posez une question..."
                className="chat-input"
                disabled={isLoading}
              />
              <button
                className="chat-send-btn"
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default memo(ChatPanel)
