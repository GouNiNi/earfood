import { useState, useEffect, useRef, memo } from 'react'
import { MessageCircle, Send, Mic, MicOff, Volume2, Trash2, Loader, BookOpen } from 'lucide-react'
import { getChatHistory, saveChatHistory, clearChatHistory, getSettings } from '../stores'
import { askAboutDocument, isGeminiReady, detectChapters } from '../utils/gemini'
import { TTSEngine } from '../utils/tts'

// Simple markdown to JSX renderer for chat bubbles
function renderMarkdown(text) {
  if (!text) return null
  const lines = text.split('\n')
  const elements = []
  let key = 0
  let inList = false
  let listItems = []
  let listType = 'ul'

  const flushList = () => {
    if (listItems.length > 0) {
      const Tag = listType
      elements.push(<Tag key={key++}>{listItems}</Tag>)
      listItems = []
      inList = false
    }
  }

  const formatInline = (str) => {
    // Bold **text** or __text__
    const parts = []
    let remaining = str
    let ik = 0
    const regex = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3|`([^`]+)`|("([^"]+)")/g
    let lastIndex = 0
    let match
    while ((match = regex.exec(remaining)) !== null) {
      if (match.index > lastIndex) {
        parts.push(remaining.slice(lastIndex, match.index))
      }
      if (match[2]) {
        parts.push(<strong key={ik++}>{match[2]}</strong>)
      } else if (match[4]) {
        parts.push(<em key={ik++}>{match[4]}</em>)
      } else if (match[5]) {
        parts.push(<code key={ik++} style={{ background: 'rgba(197,160,89,0.15)', padding: '1px 4px', borderRadius: '3px', fontSize: '0.8em' }}>{match[5]}</code>)
      } else if (match[7]) {
        parts.push(<q key={ik++}>{match[7]}</q>)
      }
      lastIndex = match.index + match[0].length
    }
    if (lastIndex < remaining.length) {
      parts.push(remaining.slice(lastIndex))
    }
    return parts.length > 0 ? parts : str
  }

  for (const line of lines) {
    const trimmed = line.trim()

    // Empty line
    if (!trimmed) {
      flushList()
      continue
    }

    // Headings
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)/)
    if (headingMatch) {
      flushList()
      const level = headingMatch[1].length
      const Tag = `h${Math.min(level + 2, 6)}` // h3-h6 in chat
      elements.push(<Tag key={key++} style={{ margin: '0.4em 0 0.2em', fontSize: level === 1 ? '1em' : '0.9em' }}>{formatInline(headingMatch[2])}</Tag>)
      continue
    }

    // Bullet list
    const bulletMatch = trimmed.match(/^[-*•]\s+(.+)/)
    if (bulletMatch) {
      if (!inList || listType !== 'ul') flushList()
      inList = true
      listType = 'ul'
      listItems.push(<li key={key++}>{formatInline(bulletMatch[1])}</li>)
      continue
    }

    // Numbered list
    const numMatch = trimmed.match(/^\d+[.)]\s+(.+)/)
    if (numMatch) {
      if (!inList || listType !== 'ol') flushList()
      inList = true
      listType = 'ol'
      listItems.push(<li key={key++}>{formatInline(numMatch[1])}</li>)
      continue
    }

    // Regular paragraph
    flushList()
    elements.push(<p key={key++} style={{ margin: '0 0 0.4em' }}>{formatInline(trimmed)}</p>)
  }

  flushList()
  return elements
}

const ChatPanel = ({ documentId, documentContent, onConfigureApi }) => {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState(null)
  const messagesEndRef = useRef(null)
  const recognitionRef = useRef(null)
  const chatTtsRef = useRef(null)
  const [speakingIndex, setSpeakingIndex] = useState(null)

  // Chapters dropdown state
  const [chapters, setChapters] = useState([])
  const [chaptersOpen, setChaptersOpen] = useState(false)

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
    // Load chapters for dropdown
    if (documentContent) {
      const detected = detectChapters(documentContent)
      setChapters(detected)
    }
    return () => {
      if (recognitionRef.current) recognitionRef.current.stop()
    }
  }, [documentId])

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

  const handleSpeak = (text, index) => {
    if (!chatTtsRef.current) return
    // Toggle: if already speaking this message, stop
    if (speakingIndex === index) {
      chatTtsRef.current.stop()
      setSpeakingIndex(null)
      return
    }
    chatTtsRef.current.stop()
    chatTtsRef.current.loadText(text)
    chatTtsRef.current.onEnd = () => setSpeakingIndex(null)
    setSpeakingIndex(index)
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

  const handleSelectChapter = (chapter) => {
    setInput(`Résume le chapitre "${chapter.title}"`)
    setChaptersOpen(false)
  }

  const geminiReady = isGeminiReady()

  return (
    <div className="panel chat-panel">
      <div className="panel-header">
        <h3 className="serif" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MessageCircle size={18} />
          Discussion
        </h3>
        <div style={{ display: 'flex', gap: '4px' }}>
          {chapters.length > 0 && (
            <button
              className={`panel-action-btn ${chaptersOpen ? 'active' : ''}`}
              onClick={() => setChaptersOpen(!chaptersOpen)}
              title="Résumer un chapitre"
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
        <>
          {/* Chapters dropdown */}
          {chaptersOpen && chapters.length > 0 && (
            <div className="chat-chapters-dropdown">
              {chapters.map((ch, i) => (
                <button
                  key={i}
                  className="chat-chapter-item"
                  onClick={() => handleSelectChapter(ch)}
                >
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', minWidth: '1.5rem' }}>{i + 1}</span>
                  <span>{ch.title}</span>
                </button>
              ))}
            </div>
          )}

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
                    {msg.role === 'assistant' ? renderMarkdown(msg.text) : msg.text}
                    {msg.role === 'assistant' && (
                      <button
                        className={`chat-speak-btn ${speakingIndex === i ? 'active' : ''}`}
                        onClick={() => handleSpeak(msg.text, i)}
                        title={speakingIndex === i ? 'Arrêter' : 'Écouter'}
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
        </>
      )}
    </div>
  )
}

export default memo(ChatPanel)
