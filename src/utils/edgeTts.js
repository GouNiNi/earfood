/**
 * Edge TTS — Synthèse vocale neurale gratuite via WebSocket Microsoft
 *
 * Protocole : WebSocket vers le service "Read Aloud" de Microsoft Edge.
 * Envoie du SSML, reçoit de l'audio MP3 en chunks binaires.
 */

const EDGE_TTS_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1'
const TRUSTED_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
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

function buildConfigMessage(requestId) {
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
  // Convertir rate (0.5-2.0) en pourcentage Edge TTS (-50% à +100%)
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
 * Synthétiser du texte via Edge TTS
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

    const wsUrl = `${EDGE_TTS_URL}?TrustedClientToken=${TRUSTED_TOKEN}&ConnectionId=${requestId}`

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
      // Envoyer la config
      ws.send(buildConfigMessage(requestId))
      // Envoyer le SSML
      ws.send(buildSSMLMessage(requestId, text, voice, rate))
    }

    ws.onmessage = (event) => {
      if (event.data instanceof Blob) {
        // Message binaire : contient un header texte + données audio
        event.data.arrayBuffer().then(buffer => {
          // Le header se termine par "Path:audio\r\n"
          const view = new DataView(buffer)
          // Les 2 premiers octets indiquent la taille du header
          const headerSize = view.getUint16(0)
          // L'audio commence après le header (2 bytes de taille + header)
          const audioData = buffer.slice(2 + headerSize)
          if (audioData.byteLength > 0) {
            audioChunks.push(audioData)
          }
        })
      } else if (typeof event.data === 'string') {
        // Message texte : métadonnées ou signal de fin
        if (event.data.includes('Path:turn.end')) {
          // Fin de la synthèse
          clearTimeout(timeout)
          if (!resolved) {
            resolved = true
            ws.close()
            // Concaténer les chunks audio
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
        reject(new Error('Edge TTS: erreur WebSocket'))
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
 * Tester si Edge TTS est disponible
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
