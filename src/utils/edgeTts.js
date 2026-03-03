/**
 * Edge TTS — Synthèse vocale neurale gratuite via proxy WebSocket
 *
 * Le navigateur se connecte au proxy local (/tts-proxy) qui relaie
 * vers Microsoft Edge TTS avec les headers requis (Origin, User-Agent).
 */

const LOG_PREFIX = '[EdgeTTS]'

function log(...args) {
  console.log(LOG_PREFIX, ...args)
}

function logError(...args) {
  console.error(LOG_PREFIX, ...args)
}

const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3'

// Voix Edge TTS françaises de qualité
const EDGE_VOICES = {
  'fr-FR-DeniseNeural': 'Denise (femme)',
  'fr-FR-HenriNeural': 'Henri (homme)',
  'fr-FR-EloiseNeural': 'Eloise (femme)',
  'fr-FR-RemyMultilingualNeural': 'Rémy (homme)',
}

const DEFAULT_VOICE = 'fr-FR-DeniseNeural'

function generateRequestId() {
  return crypto.randomUUID().replace(/-/g, '')
}

/**
 * Construire l'URL du proxy WebSocket
 * En dev (Vite), on cible localhost:3001
 * En prod, on passe par /tts-proxy (Traefik reverse proxy)
 */
function getProxyUrl() {
  const loc = window.location
  const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${loc.host}/tts-proxy`
}

function buildConfigMessage() {
  return `X-Timestamp:${new Date().toISOString()}\r\n` +
    'Content-Type:application/json; charset=utf-8\r\n' +
    `Path:speech.config\r\n\r\n` +
    JSON.stringify({
      context: {
        synthesis: {
          audio: {
            metadataoptions: { sentenceBoundaryEnabled: 'true', wordBoundaryEnabled: 'false' },
            outputFormat: OUTPUT_FORMAT
          }
        }
      }
    })
}

function buildSSMLMessage(requestId, text, voice, rate) {
  const ratePercent = Math.round((rate - 1) * 100)
  const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`

  const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='fr-FR'>` +
    `<voice name='${voice}'>` +
    `<prosody rate='${rateStr}'>` +
    escapeXml(text) +
    `</prosody></voice></speak>`

  return `X-RequestId:${requestId}\r\n` +
    `Content-Type:application/ssml+xml\r\n` +
    `X-Timestamp:${new Date().toISOString()}\r\n` +
    `Path:ssml\r\n\r\n` +
    ssml
}

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Extraire les données audio d'un buffer binaire Edge TTS
 * Format: [2 bytes headerSize][header][audioData]
 */
function extractAudioFromBuffer(buffer) {
  if (buffer.byteLength < 2) return null
  const view = new DataView(buffer)
  const headerSize = view.getUint16(0)
  if (2 + headerSize >= buffer.byteLength) return null
  const audioData = buffer.slice(2 + headerSize)
  return audioData.byteLength > 0 ? audioData : null
}

/**
 * Synthétiser du texte via Edge TTS (via proxy)
 * @param {string} text - Texte à synthétiser
 * @param {object} options - { voice, rate }
 * @returns {Promise<ArrayBuffer>} Audio MP3
 */
export function synthesize(text, options = {}) {
  const voice = options.voice || DEFAULT_VOICE
  const rate = options.rate || 1.0

  return new Promise((resolve, reject) => {
    const requestId = generateRequestId()
    // Stocker les Blobs bruts de façon SYNCHRONE (pas de .then() pendant la réception)
    const rawBlobs = []
    let resolved = false

    const wsUrl = getProxyUrl()
    log(`Connecting: voice=${voice}, rate=${rate}, text="${text.substring(0, 50)}..."`)

    let ws
    try {
      ws = new WebSocket(wsUrl)
    } catch (e) {
      logError('WebSocket constructor failed:', e.message)
      reject(new Error('WebSocket non disponible'))
      return
    }

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        logError(`TIMEOUT after 30s`)
        ws.close()
        reject(new Error('Edge TTS timeout'))
      }
    }, 30000)

    ws.onopen = () => {
      log(`✓ Connected`)
      ws.send(buildConfigMessage())
      ws.send(buildSSMLMessage(requestId, text, voice, rate))
      log('Config + SSML sent')
    }

    ws.onmessage = (event) => {
      if (event.data instanceof Blob) {
        // Stocker le Blob brut immédiatement (synchrone, pas de race condition)
        rawBlobs.push(event.data)
      } else if (typeof event.data === 'string') {
        if (event.data.includes('Path:turn.end')) {
          clearTimeout(timeout)
          if (!resolved) {
            resolved = true
            ws.close()
            // Maintenant convertir TOUS les blobs en ArrayBuffers
            log(`turn.end reçu, conversion de ${rawBlobs.length} blobs...`)
            Promise.all(rawBlobs.map(b => b.arrayBuffer()))
              .then(buffers => {
                const audioChunks = []
                for (const buffer of buffers) {
                  const audio = extractAudioFromBuffer(buffer)
                  if (audio) audioChunks.push(audio)
                }
                const totalLength = audioChunks.reduce((sum, c) => sum + c.byteLength, 0)
                log(`✓ Audio: ${audioChunks.length} chunks, ${totalLength} bytes`)
                const result = new Uint8Array(totalLength)
                let offset = 0
                for (const chunk of audioChunks) {
                  result.set(new Uint8Array(chunk), offset)
                  offset += chunk.byteLength
                }
                resolve(result.buffer)
              })
              .catch(err => {
                logError('Erreur conversion blobs:', err)
                reject(err)
              })
          }
        }
      }
    }

    ws.onerror = () => {
      logError(`WebSocket ERROR`)
      clearTimeout(timeout)
      if (!resolved) {
        resolved = true
        reject(new Error('Edge TTS: erreur de connexion au proxy'))
      }
    }

    ws.onclose = (event) => {
      log(`WebSocket CLOSED: code=${event.code}, wasClean=${event.wasClean}`)
      clearTimeout(timeout)
      if (!resolved) {
        resolved = true
        if (rawBlobs.length > 0) {
          log(`Closed before turn.end, converting ${rawBlobs.length} blobs...`)
          Promise.all(rawBlobs.map(b => b.arrayBuffer()))
            .then(buffers => {
              const audioChunks = []
              for (const buffer of buffers) {
                const audio = extractAudioFromBuffer(buffer)
                if (audio) audioChunks.push(audio)
              }
              const totalLength = audioChunks.reduce((sum, c) => sum + c.byteLength, 0)
              if (totalLength > 0) {
                log(`✓ Audio (partial): ${audioChunks.length} chunks, ${totalLength} bytes`)
                const result = new Uint8Array(totalLength)
                let offset = 0
                for (const chunk of audioChunks) {
                  result.set(new Uint8Array(chunk), offset)
                  offset += chunk.byteLength
                }
                resolve(result.buffer)
              } else {
                reject(new Error('Edge TTS: pas de données audio'))
              }
            })
            .catch(err => reject(err))
        } else {
          logError(`Connection closed without data (code=${event.code})`)
          reject(new Error('Edge TTS: connexion fermée sans audio'))
        }
      }
    }
  })
}

/**
 * Tester si Edge TTS est disponible (via proxy)
 */
export async function testEdgeTts() {
  log('Testing Edge TTS connectivity...')
  try {
    const audio = await synthesize('Test', { voice: DEFAULT_VOICE, rate: 1.0 })
    const ok = audio.byteLength > 100
    log(`Test: ${ok ? '✓ OK' : '✗ FAIL'} (${audio.byteLength} bytes)`)
    return ok
  } catch (err) {
    logError('Test failed:', err.message)
    return false
  }
}

export { EDGE_VOICES, DEFAULT_VOICE }
