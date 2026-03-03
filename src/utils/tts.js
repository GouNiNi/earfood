/**
 * Moteur TTS basé sur la Web Speech API
 * Gère la lecture par phrases avec suivi de position
 */

// Découper le texte en phrases
export function splitIntoSentences(text) {
  if (!text) return []
  // Découper sur les points, points d'exclamation, points d'interrogation, et sauts de ligne doubles
  const raw = text.split(/(?<=[.!?])\s+|(?:\n\s*\n)/)
  return raw
    .map(s => s.trim())
    .filter(s => s.length > 0)
}

// Calculer les positions de début de chaque phrase dans le texte original
export function getSentencePositions(text, sentences) {
  const positions = []
  let searchFrom = 0
  for (const sentence of sentences) {
    const idx = text.indexOf(sentence, searchFrom)
    positions.push({
      start: idx >= 0 ? idx : searchFrom,
      end: (idx >= 0 ? idx : searchFrom) + sentence.length,
      text: sentence
    })
    if (idx >= 0) searchFrom = idx + sentence.length
  }
  return positions
}

export class TTSEngine {
  constructor() {
    this.synth = window.speechSynthesis
    this.utterance = null
    this.sentences = []
    this.sentencePositions = []
    this.currentSentenceIndex = 0
    this.isPlaying = false
    this.isPaused = false
    this.rate = 1.0
    this.voice = null
    this.fullText = ''

    // Callbacks
    this.onSentenceChange = null  // (index, sentencePosition) => void
    this.onEnd = null             // () => void
    this.onProgressUpdate = null  // (charPosition, percentage) => void

    // Charger les voix françaises
    this._loadVoices()
  }

  _loadVoices() {
    const setVoice = () => {
      const voices = this.synth.getVoices()
      // Préférer une voix française
      this.voice = voices.find(v => v.lang.startsWith('fr')) ||
                   voices.find(v => v.lang.startsWith('en')) ||
                   voices[0]
    }
    setVoice()
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = setVoice
    }
  }

  /**
   * Charger un texte pour lecture
   */
  loadText(text) {
    this.stop()
    this.fullText = text
    this.sentences = splitIntoSentences(text)
    this.sentencePositions = getSentencePositions(text, this.sentences)
    this.currentSentenceIndex = 0
  }

  /**
   * Lancer la lecture depuis la phrase courante
   */
  play() {
    if (this.sentences.length === 0) return
    if (this.isPaused) {
      this.synth.resume()
      this.isPaused = false
      this.isPlaying = true
      return
    }
    this.isPlaying = true
    this._speakSentence(this.currentSentenceIndex)
  }

  /**
   * Mettre en pause
   */
  pause() {
    if (!this.isPlaying) return
    this.synth.pause()
    this.isPaused = true
    this.isPlaying = false
  }

  /**
   * Arrêter la lecture
   */
  stop() {
    this.synth.cancel()
    this.isPlaying = false
    this.isPaused = false
  }

  /**
   * Aller à une position en caractères dans le texte
   */
  seekToCharPosition(charPos) {
    const wasPlaying = this.isPlaying
    this.stop()

    // Trouver la phrase correspondant à cette position
    let targetIndex = 0
    for (let i = 0; i < this.sentencePositions.length; i++) {
      if (this.sentencePositions[i].start <= charPos) {
        targetIndex = i
      } else {
        break
      }
    }
    this.currentSentenceIndex = targetIndex

    if (this.onSentenceChange && this.sentencePositions[targetIndex]) {
      this.onSentenceChange(targetIndex, this.sentencePositions[targetIndex])
    }
    this._emitProgress()

    if (wasPlaying) {
      this.play()
    }
  }

  /**
   * Avancer/reculer d'un nombre de phrases
   */
  skipSentences(count) {
    const wasPlaying = this.isPlaying
    this.stop()

    this.currentSentenceIndex = Math.max(0,
      Math.min(this.sentences.length - 1, this.currentSentenceIndex + count)
    )

    if (this.onSentenceChange && this.sentencePositions[this.currentSentenceIndex]) {
      this.onSentenceChange(this.currentSentenceIndex, this.sentencePositions[this.currentSentenceIndex])
    }
    this._emitProgress()

    if (wasPlaying) {
      this.play()
    }
  }

  /**
   * Avancer/reculer d'environ N secondes (estimé)
   */
  skip(seconds) {
    // Estimer ~15 mots/seconde à vitesse 1x, ajusté par le rate
    const wordsToSkip = Math.abs(seconds) * 2.5 * this.rate
    const direction = seconds > 0 ? 1 : -1

    let wordsCount = 0
    let sentencesToSkip = 0

    const startIdx = this.currentSentenceIndex
    let idx = startIdx

    while (wordsCount < wordsToSkip && idx >= 0 && idx < this.sentences.length) {
      idx += direction
      if (idx >= 0 && idx < this.sentences.length) {
        wordsCount += this.sentences[idx].split(/\s+/).length
        sentencesToSkip++
      }
    }

    this.skipSentences(direction * Math.max(1, sentencesToSkip))
  }

  /**
   * Changer la vitesse de lecture
   */
  setRate(rate) {
    this.rate = Math.max(0.5, Math.min(2, rate))
    if (this.isPlaying) {
      // Relancer à la phrase courante avec la nouvelle vitesse
      const wasPlaying = true
      this.stop()
      if (wasPlaying) this.play()
    }
  }

  /**
   * Obtenir la position actuelle en caractères
   */
  getCurrentCharPosition() {
    if (this.sentencePositions[this.currentSentenceIndex]) {
      return this.sentencePositions[this.currentSentenceIndex].start
    }
    return 0
  }

  /**
   * Obtenir le pourcentage de progression
   */
  getPercentage() {
    if (this.fullText.length === 0) return 0
    return Math.round((this.getCurrentCharPosition() / this.fullText.length) * 100)
  }

  /**
   * Obtenir la durée estimée totale en secondes
   */
  getEstimatedDuration() {
    const words = this.fullText.split(/\s+/).length
    return Math.ceil((words / 150) * 60)
  }

  /**
   * Obtenir le temps estimé actuel en secondes
   */
  getEstimatedCurrentTime() {
    if (this.sentences.length === 0) return 0
    let wordsSoFar = 0
    for (let i = 0; i < this.currentSentenceIndex; i++) {
      wordsSoFar += this.sentences[i].split(/\s+/).length
    }
    return Math.ceil((wordsSoFar / 150) * 60)
  }

  // === Méthodes internes ===

  _speakSentence(index) {
    if (index >= this.sentences.length) {
      this.isPlaying = false
      if (this.onEnd) this.onEnd()
      return
    }

    this.currentSentenceIndex = index
    const sentence = this.sentences[index]

    if (this.onSentenceChange && this.sentencePositions[index]) {
      this.onSentenceChange(index, this.sentencePositions[index])
    }
    this._emitProgress()

    this.utterance = new SpeechSynthesisUtterance(sentence)
    this.utterance.rate = this.rate
    this.utterance.lang = 'fr-FR'
    if (this.voice) this.utterance.voice = this.voice

    this.utterance.onend = () => {
      if (this.isPlaying && !this.isPaused) {
        this._speakSentence(index + 1)
      }
    }

    this.utterance.onerror = (e) => {
      if (e.error !== 'canceled' && e.error !== 'interrupted') {
        console.error('TTS error:', e.error)
        // Tenter la phrase suivante
        if (this.isPlaying) {
          this._speakSentence(index + 1)
        }
      }
    }

    this.synth.speak(this.utterance)
  }

  _emitProgress() {
    if (this.onProgressUpdate) {
      this.onProgressUpdate(this.getCurrentCharPosition(), this.getPercentage())
    }
  }
}
