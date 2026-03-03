/**
 * Edge TTS — Synthèse vocale neurale gratuite via proxy WebSocket
 *
 * Le navigateur se connecte au proxy local (/tts-proxy) qui relaie
 * vers Microsoft Edge TTS avec les headers requis (Origin, User-Agent).
 */

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
 * En prod, on passe par /tts-proxy (Nginx reverse proxy)
 */
function getProxyUrl() {
  const loc = window.location
  if (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') {
    // Dev : proxy direct
    return `ws://${loc.hostname}:3001`
  }
  // Prod : via Nginx reverse proxy
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
    const audioChunks = []
    let resolved = false

    const wsUrl = getProxyUrl()

    let ws
    try {
      ws = new WebSocket(wsUrl)
    } catch (e) {
      reject(new Error('WebSocket non disponible'))
      return
    }

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        ws.close()
        reject(new Error('Edge TTS timeout'))
      }
    }, 30000)

    ws.onopen = () => {
      ws.send(buildConfigMessage())
      ws.send(buildSSMLMessage(requestId, text, voice, rate))
    }

    ws.onmessage = (event) => {
      if (event.data instanceof Blob) {
        event.data.arrayBuffer().then(buffer => {
          const view = new DataView(buffer)
          const headerSize = view.getUint16(0)
          const audioData = buffer.slice(2 + headerSize)
          if (audioData.byteLength > 0) {
            audioChunks.push(audioData)
          }
        })
      } else if (typeof event.data === 'string') {
        if (event.data.includes('Path:turn.end')) {
          clearTimeout(timeout)
          if (!resolved) {
            resolved = true
            ws.close()
            const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
            const result = new Uint8Array(totalLength)
            let offset = 0
            for (const chunk of audioChunks) {
              result.set(new Uint8Array(chunk), offset)
              offset += chunk.byteLength
            }
            resolve(result.buffer)
          }
        }
      }
    }

    ws.onerror = () => {
      clearTimeout(timeout)
      if (!resolved) {
        resolved = true
        reject(new Error('Edge TTS: erreur de connexion au proxy'))
      }
    }

    ws.onclose = () => {
      clearTimeout(timeout)
      if (!resolved) {
        resolved = true
        if (audioChunks.length > 0) {
          const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
          const result = new Uint8Array(totalLength)
          let offset = 0
          for (const chunk of audioChunks) {
            result.set(new Uint8Array(chunk), offset)
            offset += chunk.byteLength
          }
          resolve(result.buffer)
        } else {
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
  try {
    const audio = await synthesize('Test', { voice: DEFAULT_VOICE, rate: 1.0 })
    return audio.byteLength > 100
  } catch {
    return false
  }
}

export { EDGE_VOICES, DEFAULT_VOICE }
