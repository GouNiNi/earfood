/**
 * Sherpa-ONNX TTS Web Worker
 * Handles heavy WASM computations off the main thread.
 * Supports 2 French voices: Tom (masculin) and Siwis (féminin).
 */

// Polyfill for libraries expecting window/document (Sherpa JS wrappers)
self.window = self
self.document = {
  createElement: () => ({ src: '' }),
  body: { appendChild: () => {} }
}

const SHERPA_BASE = '/sherpa/'
let tts = null
let currentVoiceId = null
let isWasmReady = false
let msgQueue = []
let globalFS = null

// --- Emscripten Module Setup ---
self.Module = {
  onRuntimeInitialized: () => {
    console.log('[Sherpa Worker] WASM Runtime Initialized')

    if (self.Module && self.Module.FS) globalFS = self.Module.FS
    else if (self.FS) globalFS = self.FS

    isWasmReady = true
    postMessage({ type: 'wasm-ready' })

    // Process queued messages
    while (msgQueue.length > 0) {
      const e = msgQueue.shift()
      processMessage(e)
    }
  },
  print: (text) => console.log('[Sherpa WASM]', text),
  printErr: (text) => console.error('[Sherpa WASM Err]', text),
  locateFile: (path) => {
    if (path.endsWith('.data')) return SHERPA_BASE + 'sherpa-onnx-wasm-main-tts.data'
    if (path.endsWith('.wasm')) return SHERPA_BASE + 'sherpa-onnx-wasm-main-tts.wasm'
    return SHERPA_BASE + path
  }
}

// Load WASM scripts synchronously
try {
  importScripts(SHERPA_BASE + 'sherpa-onnx-wasm-main-tts.js')
  importScripts(SHERPA_BASE + 'sherpa-onnx-tts.js')
} catch (e) {
  console.error('[Sherpa Worker] Script import failed:', e)
}

// --- Voice Configuration ---

const VOICES = {
  'fr-FR-tom': {
    id: 'fr-FR-tom',
    dir: 'vits-piper-fr_FR-tom-medium',
    file: 'fr_FR-tom-medium.onnx',
    tokens: 'tokens.txt',
    dataDir: 'espeak-ng-data'
  },
  'fr-FR-siwis': {
    id: 'fr-FR-siwis',
    dir: 'vits-piper-fr_FR-siwis-medium',
    file: 'fr_FR-siwis-medium.onnx',
    tokens: 'tokens.txt',
    dataDir: 'espeak-ng-data'
  }
}

function getFS() {
  if (globalFS) return globalFS
  if (self.Module && self.Module.FS) return self.Module.FS
  if (self.FS) return self.FS
  return null
}

async function downloadFile(url, fsPath) {
  const FS = getFS()
  if (!FS) throw new Error('FS not available')

  try {
    const existing = FS.analyzePath(fsPath)
    if (existing.exists) return
  } catch (e) {}

  const parent = fsPath.substring(0, fsPath.lastIndexOf('/'))
  if (parent) {
    try { FS.mkdirTree(parent) } catch (e) {}
  }

  console.log(`[Sherpa Worker] Downloading ${url}...`)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch ${url}`)
  const buffer = await response.arrayBuffer()

  FS.writeFile(fsPath, new Uint8Array(buffer))
  console.log(`[Sherpa Worker] Wrote ${fsPath} (${buffer.byteLength} bytes)`)
}

async function loadVoice(voiceId, noiseScale = 0.667) {
  if (!VOICES[voiceId]) throw new Error(`Unknown voice: ${voiceId}`)

  if (tts) {
    try {
      if (tts.free) tts.free()
      if (tts.delete) tts.delete()
    } catch (e) {}
    tts = null
  }

  const voiceConfig = VOICES[voiceId]

  const modelUrl = SHERPA_BASE + voiceConfig.dir + '/' + voiceConfig.file
  const tokensUrl = SHERPA_BASE + voiceConfig.dir + '/' + voiceConfig.tokens

  const modelFsPath = voiceConfig.dir + '/' + voiceConfig.file
  const tokensFsPath = voiceConfig.dir + '/' + voiceConfig.tokens

  await downloadFile(modelUrl, modelFsPath)
  await downloadFile(tokensUrl, tokensFsPath)

  const FS = getFS()
  const dataStat = FS.analyzePath(voiceConfig.dataDir)
  if (!dataStat.exists) {
    throw new Error('TTS Data missing (espeak-ng-data). Please reload.')
  }

  const config = {
    offlineTtsModelConfig: {
      offlineTtsVitsModelConfig: {
        model: './' + modelFsPath,
        tokens: './' + tokensFsPath,
        dataDir: './' + voiceConfig.dataDir,
        lengthScale: 1.0,
        noiseScale: noiseScale,
        noiseScaleW: 0.8
      },
      numThreads: 1,
      debug: 0,
      provider: 'cpu'
    }
  }

  const OfflineTts = self.OfflineTts || self.window.OfflineTts
  if (!OfflineTts) throw new Error('OfflineTts class not found')

  tts = new OfflineTts(config, self.Module)
  currentVoiceId = voiceId

  console.log(`[Sherpa Worker] Voice ${voiceId} loaded.`)
  postMessage({ type: 'ready', voiceId })
}

function generate(text, speed = 1.0) {
  if (!tts) throw new Error('Model not loaded')

  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return null

  const start = performance.now()
  const result = tts.generate({ text: clean, speed, sid: 0 })
  const elapsed = Math.round(performance.now() - start)

  console.log(`[Sherpa Worker] Generated "${clean.substring(0, 30)}..." in ${elapsed}ms`)

  return { samples: result.samples, sampleRate: result.sampleRate }
}

// --- Message Handler ---

async function processMessage(e) {
  const { command, payload, id } = e.data

  try {
    if (command === 'load') {
      await loadVoice(payload.voiceId, payload.noiseScale)
    } else if (command === 'generate') {
      const audioData = generate(payload.text, payload.speed)
      if (audioData) {
        postMessage(
          { type: 'audio', id, samples: audioData.samples, sampleRate: audioData.sampleRate },
          [audioData.samples.buffer] // Transferable
        )
      } else {
        postMessage({ type: 'skip', id })
      }
    }
  } catch (err) {
    console.error('[Sherpa Worker Error]', err)
    postMessage({ type: 'error', error: err.message, id })
  }
}

self.onmessage = (e) => {
  if (!isWasmReady) {
    console.log('[Sherpa Worker] Queuing message (WASM not ready):', e.data.command)
    msgQueue.push(e)
    return
  }
  processMessage(e)
}
