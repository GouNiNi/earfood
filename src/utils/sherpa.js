/**
 * Sherpa-ONNX TTS Orchestrator (main thread)
 * Lazy-loads the Web Worker and provides a simple API for the TTSEngine.
 */

let worker = null
let audioCtx = null
let ready = false
let currentVoiceId = null
let msgIdCounter = 0

const SHERPA_VOICES = {
  'fr-FR-siwis': 'Siwis (Féminin)',
  'fr-FR-tom': 'Tom (Masculin)',
}

/**
 * Initialize the Sherpa worker (lazy, only on first call)
 */
function init() {
  if (worker) return Promise.resolve()

  return new Promise((resolve, reject) => {
    // Worker loaded from public/ to avoid Vite ES module wrapping
    // (importScripts doesn't work in ES module workers)
    worker = new Worker('/sherpa/sherpa-worker.js', { type: 'classic' })

    const onWasmReady = (e) => {
      if (e.data.type === 'wasm-ready') {
        worker.removeEventListener('message', onWasmReady)
        resolve()
      } else if (e.data.type === 'error') {
        worker.removeEventListener('message', onWasmReady)
        reject(new Error(e.data.error))
      }
    }

    worker.addEventListener('message', onWasmReady)

    worker.onerror = (err) => {
      worker.removeEventListener('message', onWasmReady)
      reject(new Error('Sherpa worker failed: ' + err.message))
    }
  })
}

/**
 * Load a voice model in the worker
 */
function loadVoice(voiceId) {
  if (!worker) throw new Error('Worker not initialized')
  if (currentVoiceId === voiceId && ready) return Promise.resolve()

  ready = false
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      worker.removeEventListener('message', handler)
      reject(new Error('Timeout chargement voix Sherpa'))
    }, 30000)

    const handler = (e) => {
      if (e.data.type === 'ready') {
        clearTimeout(timeout)
        worker.removeEventListener('message', handler)
        currentVoiceId = voiceId
        ready = true
        resolve()
      } else if (e.data.type === 'error') {
        clearTimeout(timeout)
        worker.removeEventListener('message', handler)
        reject(new Error(e.data.error))
      }
    }

    worker.addEventListener('message', handler)
    worker.postMessage({ command: 'load', payload: { voiceId, noiseScale: 0.667 } })
  })
}

/**
 * Generate audio samples from text
 * @returns Promise<{samples: Float32Array, sampleRate: number}|null>
 */
function generate(text, speed = 1.0) {
  if (!worker) throw new Error('Worker not initialized')

  return new Promise((resolve, reject) => {
    const id = ++msgIdCounter

    const handler = (e) => {
      if (e.data.id !== id) return
      worker.removeEventListener('message', handler)

      if (e.data.type === 'audio') {
        resolve({ samples: e.data.samples, sampleRate: e.data.sampleRate })
      } else if (e.data.type === 'skip') {
        resolve(null)
      } else if (e.data.type === 'error') {
        reject(new Error(e.data.error))
      }
    }

    worker.addEventListener('message', handler)
    worker.postMessage({ command: 'generate', payload: { text, speed }, id })
  })
}

/**
 * Play audio samples via AudioContext
 * @returns Promise that resolves when playback ends, with a stop() handle
 */
function playBuffer(samples, sampleRate, trimEndMs = 0) {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume()
  }

  const buffer = audioCtx.createBuffer(1, samples.length, sampleRate)
  const channelData = buffer.getChannelData(0)
  for (let i = 0; i < samples.length; i++) {
    channelData[i] = samples[i]
  }

  // Calculate trimmed duration
  const fullDuration = buffer.duration
  const trimSec = trimEndMs / 1000
  const playDuration = Math.max(0.1, fullDuration - trimSec)

  const source = audioCtx.createBufferSource()
  source.buffer = buffer
  source.connect(audioCtx.destination)

  return {
    promise: new Promise((resolve) => {
      // If trimming, stop early via setTimeout
      if (trimSec > 0 && playDuration < fullDuration) {
        setTimeout(() => {
          try { source.stop() } catch (e) {}
          resolve()
        }, playDuration * 1000)
      }
      source.onended = () => resolve()
      source.start(0, 0, trimSec > 0 ? playDuration : undefined)
    }),
    stop: () => {
      try { source.stop() } catch (e) {}
    }
  }
}

function isReady() {
  return ready
}

function getVoices() {
  return SHERPA_VOICES
}

function suspend() {
  if (audioCtx && audioCtx.state === 'running') {
    audioCtx.suspend()
  }
}

function resume() {
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume()
  }
}

export const sherpaAPI = {
  init,
  loadVoice,
  generate,
  playBuffer,
  isReady,
  getVoices,
  suspend,
  resume,
}
