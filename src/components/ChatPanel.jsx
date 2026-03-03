import { useState, useEffect, useRef } from 'react'
import { MessageCircle, Send, Mic, MicOff, Volume2, Trash2, Loader } from 'lucide-react'
import { getChatHistory, saveChatHistory, clearChatHistory } from '../stores'
import { askAboutDocument, isGeminiReady } from '../utils/gemini'

const ChatPanel = ({ documentId, documentContent, onConfigureApi }) => {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState(null)
  const messagesEndRef = useRef(null)
  const recognitionRef = useRef(null)

  useEffect(() => {
    loadHistory()
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
      // Construire l'historique pour le contexte
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
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'fr-FR'
    const voices = window.speechSynthesis.getVoices()
    const frVoice = voices.find(v => v.lang.startsWith('fr'))
    if (frVoice) utterance.voice = frVoice
    window.speechSynthesis.speak(utterance)
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

  const geminiReady = isGeminiReady()

  return (
    <div className="panel chat-panel">
      <div className="panel-header">
        <h3 className="serif" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MessageCircle size={18} />
          Discussion
        </h3>
        <div style={{ display: 'flex', gap: '4px' }}>
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
        </>
      )}
    </div>
  )
}

export default ChatPanel
