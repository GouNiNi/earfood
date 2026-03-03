/**
 * Moteur TTS unifié
 * - Mode "local" : Web Speech API (navigateur)
 * - Mode "hybrid" : Edge TTS Neural (WebSocket) avec fallback Web Speech API
 * - Mode "sherpa" : Sherpa-ONNX WASM (voix neurale offline)
 */

import { synthesize, DEFAULT_VOICE } from './edgeTts'

// Découper le texte en phrases
export function splitIntoSentences(text) {
  if (!text) return []
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

    // Mode : 'local' | 'hybrid' | 'sherpa'
    this.mode = 'local'
    this.edgeVoice = DEFAULT_VOICE
    // Audio element pour Edge TTS
    this._audioEl = null
    this._edgeFallbackActive = false

    // Edge TTS pre-cache: Map<sentenceIndex, Promise<ArrayBuffer>>
    this._edgeCache = new Map()
    this._PRECACHE_AHEAD = 3

    // Sherpa-ONNX state
    this.sherpaVoice = 'fr-FR-siwis'
    this._sherpaAPI = null       // lazy-loaded sherpa module
    this._sherpaCache = new Map() // Map<sentenceIndex, Promise<{samples, sampleRate}>>
    this._sherpaStop = null       // stop handle for current playback
    this._sherpaFallbackActive = false

    // Trim trailing silence (ms)
    this.trimEndMs = 200

    // Callbacks
    this.onSentenceChange = null
    this.onEnd = null
    this.onProgressUpdate = null
    this.onModeInfo = null  // (info: string) => void — feedback mode utilisé

    // Charger les voix Web Speech
    this._loadVoices()
  }

  _loadVoices() {
    const setVoice = () => {
      const voices = this.synth.getVoices()
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
   * Définir le mode TTS
   */
  setMode(mode) {
    if (mode === 'hybrid') this.mode = 'hybrid'
    else if (mode === 'sherpa') this.mode = 'sherpa'
    else this.mode = 'local'
    this._edgeFallbackActive = false
    this._sherpaFallbackActive = false
    this._clearEdgeCache()
    this._clearSherpaCache()
  }

  /**
   * Définir la voix Edge TTS
   */
  setEdgeVoice(voice) {
    this.edgeVoice = voice || DEFAULT_VOICE
    this._clearEdgeCache()
  }

  /**
   * Définir la voix Sherpa-ONNX
   */
  setSherpaVoice(voice) {
    if (voice && voice !== this.sherpaVoice) {
      this.sherpaVoice = voice
      this._clearSherpaCache()
      // Force reload voice on next speak
      if (this._sherpaAPI) {
        this._sherpaAPI.loadVoice(voice).catch(() => {})
      }
    }
  }

  /**
   * Définir le trim de fin d'audio (ms)
   */
  setTrimEndMs(ms) {
    this.trimEndMs = Math.max(0, Math.min(1000, Number(ms) || 200))
  }

  /**
   * Charger un texte pour lecture
   */
  loadText(text) {
    this.stop()
    this._clearEdgeCache()
    this._clearSherpaCache()
    this.fullText = text
    this.sentences = splitIntoSentences(text)
    this.sentencePositions = getSentencePositions(text, this.sentences)
    this.currentSentenceIndex = 0
  }

  /**
   * Lancer la lecture
   */
  play() {
    if (this.sentences.length === 0) return
    if (this.isPaused && this.mode === 'local') {
      this.synth.resume()
      this.isPaused = false
      this.isPlaying = true
      return
    }
    if (this.isPaused && this._audioEl) {
      this._audioEl.play()
      this.isPaused = false
      this.isPlaying = true
      return
    }
    if (this.isPaused && this.mode === 'sherpa' && this._sherpaAPI) {
      this._sherpaAPI.resume()
      this.isPaused = false
      this.isPlaying = true
      return
    }
    this.isPlaying = true
    this.isPaused = false
    // Lancer le pré-cache dès le play
    if (this.mode === 'hybrid' && !this._edgeFallbackActive) {
      this._prefetchAhead(this.currentSentenceIndex - 1)
    }
    if (this.mode === 'sherpa' && !this._sherpaFallbackActive) {
      this._prefetchAheadSherpa(this.currentSentenceIndex - 1)
    }
    this._speakSentence(this.currentSentenceIndex)
  }

  /**
   * Mettre en pause
   */
  pause() {
    if (!this.isPlaying) return
    if (this.mode === 'sherpa' && this._sherpaAPI) {
      if (this._sherpaStop) { this._sherpaStop(); this._sherpaStop = null }
      this._sherpaAPI.suspend()
    } else if (this._audioEl && !this._audioEl.paused) {
      this._audioEl.pause()
    } else {
      this.synth.pause()
    }
    this.isPaused = true
    this.isPlaying = false
  }

  /**
   * Arrêter la lecture
   */
  stop() {
    this.synth.cancel()
    if (this._audioEl) {
      this._audioEl.pause()
      this._audioEl.src = ''
      this._audioEl = null
    }
    if (this._sherpaStop) {
      this._sherpaStop()
      this._sherpaStop = null
    }
    this.isPlaying = false
    this.isPaused = false
    // Ne PAS vider le cache ici — il est réutilisé lors de play()/seek/skip
  }

  seekToCharPosition(charPos) {
    const wasPlaying = this.isPlaying
    this.stop()

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

  skip(seconds) {
    const wordsToSkip = Math.abs(seconds) * 2.5 * this.rate
    const direction = seconds > 0 ? 1 : -1
    let wordsCount = 0
    let sentencesToSkip = 0
    let idx = this.currentSentenceIndex

    while (wordsCount < wordsToSkip && idx >= 0 && idx < this.sentences.length) {
      idx += direction
      if (idx >= 0 && idx < this.sentences.length) {
        wordsCount += this.sentences[idx].split(/\s+/).length
        sentencesToSkip++
      }
    }

    this.skipSentences(direction * Math.max(1, sentencesToSkip))
  }

  setRate(rate) {
    this.rate = Math.max(0.5, Math.min(2, rate))
    this._clearEdgeCache()
    this._clearSherpaCache()
    if (this.isPlaying) {
      this.stop()
      this.play()
    }
  }

  getCurrentCharPosition() {
    if (this.sentencePositions[this.currentSentenceIndex]) {
      return this.sentencePositions[this.currentSentenceIndex].start
    }
    return 0
  }

  getPercentage() {
    if (this.fullText.length === 0) return 0
    return Math.round((this.getCurrentCharPosition() / this.fullText.length) * 100)
  }

  getEstimatedDuration() {
    const words = this.fullText.split(/\s+/).length
    return Math.ceil((words / 150) * 60)
  }

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

    // Choisir le mode de synthèse
    if (this.mode === 'sherpa' && !this._sherpaFallbackActive) {
      this._speakSherpa(sentence, index)
    } else if (this.mode === 'hybrid' && !this._edgeFallbackActive) {
      this._speakEdge(sentence, index)
    } else {
      this._speakLocal(sentence, index)
    }
  }

  /**
   * Lecture via Web Speech API (local)
   */
  _speakLocal(sentence, index) {
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
        console.error('TTS local error:', e.error)
        if (this.isPlaying) {
          this._speakSentence(index + 1)
        }
      }
    }

    this.synth.speak(this.utterance)
  }

  /**
   * Pré-charger l'audio Edge TTS pour une phrase donnée
   * Retourne une Promise<{audio, url}> avec un Audio element PRÉ-CHARGÉ
   */
  _precacheSentence(index) {
    if (index >= this.sentences.length) return null

    if (this._edgeCache.has(index)) {
      return this._edgeCache.get(index)
    }

    console.log(`[TTS-Cache] #${index} → MISS, synthèse: "${this.sentences[index].substring(0, 50)}..."`)
    const startTime = performance.now()

    const promise = synthesize(this.sentences[index], {
      voice: this.edgeVoice,
      rate: this.rate,
    }).then(buffer => {
      // Créer et pré-charger l'Audio element MAINTENANT (pas au moment du play)
      const blob = new Blob([buffer], { type: 'audio/mpeg' })
      const url = URL.createObjectURL(blob)
      const audio = new Audio()
      audio.preload = 'auto'
      audio.src = url

      return new Promise((resolve) => {
        const done = () => {
          const elapsed = (performance.now() - startTime).toFixed(0)
          console.log(`[TTS-Cache] #${index} → PRELOADED en ${elapsed}ms (${buffer.byteLength}B)`)
          resolve({ audio, url })
        }
        // canplaythrough = le navigateur estime pouvoir jouer sans interruption
        audio.addEventListener('canplaythrough', done, { once: true })
        // Fallback si canplaythrough ne se déclenche pas
        audio.addEventListener('error', done, { once: true })
        audio.load()
      })
    }).catch(err => {
      const elapsed = (performance.now() - startTime).toFixed(0)
      console.error(`[TTS-Cache] #${index} → ERREUR en ${elapsed}ms:`, err.message)
      this._edgeCache.delete(index)
      throw err
    })

    this._edgeCache.set(index, promise)
    return promise
  }

  /**
   * Lancer le pré-cache des N prochaines phrases
   */
  _prefetchAhead(fromIndex) {
    for (let i = 1; i <= this._PRECACHE_AHEAD; i++) {
      const idx = fromIndex + i
      if (idx < this.sentences.length && !this._edgeCache.has(idx)) {
        this._precacheSentence(idx)
      }
    }
    // Nettoyer les entrées trop anciennes et révoquer les URLs
    for (const [key, promise] of this._edgeCache.entries()) {
      if (key < fromIndex) {
        promise.then(({ url }) => URL.revokeObjectURL(url)).catch(() => {})
        this._edgeCache.delete(key)
      }
    }
  }

  /**
   * Vider le cache Edge TTS (changement de rate, voix, etc.)
   */
  _clearEdgeCache() {
    for (const [, promise] of this._edgeCache.entries()) {
      promise.then(({ url }) => URL.revokeObjectURL(url)).catch(() => {})
    }
    this._edgeCache.clear()
  }

  /**
   * Lecture via Edge TTS (hybrid) avec fallback automatique et pré-cache
   */
  async _speakEdge(sentence, index) {
    try {
      console.log(`[TTS] ▶ #${index}: "${sentence.substring(0, 60)}..."`)

      // Lancer le pré-cache des prochaines phrases en parallèle
      this._prefetchAhead(index)

      // Récupérer l'Audio PRÉ-CHARGÉ (depuis le cache ou en synthétisant)
      const t0 = performance.now()
      const { audio, url } = await this._precacheSentence(index)
      const waitMs = (performance.now() - t0).toFixed(0)

      console.log(`[TTS] #${index} prêt en ${waitMs}ms ${waitMs < 10 ? '⚡ cache' : ''}`)

      // Vérifier qu'on est toujours en lecture et sur la bonne phrase
      if (!this.isPlaying || this.currentSentenceIndex !== index) return

      if (this._audioEl) {
        this._audioEl.pause()
      }

      this._audioEl = audio

      // Couper la lecture XX ms avant la fin pour éliminer le blanc de trailing silence
      const TRIM_END_MS = this.trimEndMs
      const goNext = () => {
        URL.revokeObjectURL(url)
        this._edgeCache.delete(index)
        this._audioEl = null
        console.log(`[TTS] #${index} terminée → #${index + 1}`)
        if (this.isPlaying && !this.isPaused) {
          this._speakSentence(index + 1)
        }
      }

      audio.ontimeupdate = () => {
        if (audio.duration && audio.currentTime >= audio.duration - TRIM_END_MS / 1000) {
          audio.ontimeupdate = null
          audio.pause()
          goNext()
        }
      }
      audio.onended = goNext
      audio.onerror = () => {
        URL.revokeObjectURL(url)
        this._edgeCache.delete(index)
        this._audioEl = null
        if (this.isPlaying) this._speakSentence(index + 1)
      }

      audio.play().catch(() => {
        URL.revokeObjectURL(url)
        this._edgeCache.delete(index)
        this._audioEl = null
        this._activateFallback()
        this._speakLocal(sentence, index)
      })

      if (this.onModeInfo) this.onModeInfo('Edge TTS')
    } catch (err) {
      console.warn(`[TTS] Edge échoué #${index}, fallback:`, err.message)
      this._activateFallback()
      this._speakLocal(sentence, index)
    }
  }

  // === Sherpa-ONNX methods ===

  /**
   * Lazy-load the sherpa module
   */
  async _ensureSherpa() {
    if (!this._sherpaAPI) {
      const { sherpaAPI } = await import('./sherpa.js')
      this._sherpaAPI = sherpaAPI
      await sherpaAPI.init()
      await sherpaAPI.loadVoice(this.sherpaVoice)
    } else if (!this._sherpaAPI.isReady()) {
      await this._sherpaAPI.loadVoice(this.sherpaVoice)
    }
  }

  /**
   * Pré-générer l'audio Sherpa pour une phrase
   */
  _precacheSherpa(index) {
    if (index >= this.sentences.length) return null

    if (this._sherpaCache.has(index)) {
      return this._sherpaCache.get(index)
    }

    console.log(`[TTS-Sherpa] #${index} → génération: "${this.sentences[index].substring(0, 50)}..."`)
    const startTime = performance.now()

    const promise = this._ensureSherpa().then(() => {
      return this._sherpaAPI.generate(this.sentences[index], this.rate)
    }).then(result => {
      const elapsed = (performance.now() - startTime).toFixed(0)
      console.log(`[TTS-Sherpa] #${index} → prêt en ${elapsed}ms`)
      return result
    }).catch(err => {
      console.error(`[TTS-Sherpa] #${index} → erreur:`, err.message)
      this._sherpaCache.delete(index)
      throw err
    })

    this._sherpaCache.set(index, promise)
    return promise
  }

  /**
   * Pré-cache des prochaines phrases Sherpa
   */
  _prefetchAheadSherpa(fromIndex) {
    for (let i = 1; i <= this._PRECACHE_AHEAD; i++) {
      const idx = fromIndex + i
      if (idx < this.sentences.length && !this._sherpaCache.has(idx)) {
        this._precacheSherpa(idx)
      }
    }
    // Nettoyer les anciennes entrées
    for (const key of this._sherpaCache.keys()) {
      if (key < fromIndex) {
        this._sherpaCache.delete(key)
      }
    }
  }

  /**
   * Vider le cache Sherpa
   */
  _clearSherpaCache() {
    this._sherpaCache.clear()
  }

  /**
   * Lecture via Sherpa-ONNX avec pré-cache et fallback local
   */
  async _speakSherpa(sentence, index) {
    try {
      console.log(`[TTS-Sherpa] ▶ #${index}: "${sentence.substring(0, 60)}..."`)

      // Pré-cache des prochaines phrases
      this._prefetchAheadSherpa(index)

      const t0 = performance.now()
      const audioData = await this._precacheSherpa(index)
      const waitMs = (performance.now() - t0).toFixed(0)

      console.log(`[TTS-Sherpa] #${index} prêt en ${waitMs}ms ${waitMs < 10 ? '⚡ cache' : ''}`)

      // Vérifier qu'on est toujours en lecture et sur la bonne phrase
      if (!this.isPlaying || this.currentSentenceIndex !== index) return

      if (!audioData) {
        // Phrase vide, passer à la suivante
        if (this.isPlaying && !this.isPaused) {
          this._speakSentence(index + 1)
        }
        return
      }

      // Jouer via AudioContext
      const { promise, stop } = this._sherpaAPI.playBuffer(
        audioData.samples, audioData.sampleRate, this.trimEndMs
      )
      this._sherpaStop = stop

      if (this.onModeInfo) this.onModeInfo('Sherpa IA')

      await promise

      this._sherpaStop = null
      this._sherpaCache.delete(index)

      if (this.isPlaying && !this.isPaused) {
        this._speakSentence(index + 1)
      }
    } catch (err) {
      console.warn(`[TTS-Sherpa] Erreur #${index}, fallback local:`, err.message)
      this._sherpaFallbackActive = true
      if (this.onModeInfo) this.onModeInfo('Local (fallback)')
      // Réessayer Sherpa dans 60 secondes
      setTimeout(() => { this._sherpaFallbackActive = false }, 60000)
      this._speakLocal(sentence, index)
    }
  }

  _activateFallback() {
    this._edgeFallbackActive = true
    if (this.onModeInfo) this.onModeInfo('Local (fallback)')
    // Réessayer Edge TTS dans 60 secondes
    setTimeout(() => {
      this._edgeFallbackActive = false
    }, 60000)
  }

  _emitProgress() {
    if (this.onProgressUpdate) {
      this.onProgressUpdate(this.getCurrentCharPosition(), this.getPercentage())
    }
  }
}
