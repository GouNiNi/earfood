/**
 * Test direct de la connexion à Microsoft Edge TTS avec DRM Sec-MS-GEC
 * Usage: node test-connection.js
 */

import { WebSocket } from 'ws'
import crypto from 'crypto'

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
const CHROMIUM_FULL_VERSION = '143.0.3650.75'
const CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split('.')[0]
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`

const BASE_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1'
const EDGE_ORIGIN = 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold'
const EDGE_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`
const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3'
const WIN_EPOCH = 11644473600
const S_TO_NS = 1e9

function generateSecMsGec() {
  let ticks = Date.now() / 1000
  ticks += WIN_EPOCH
  ticks -= ticks % 300
  ticks *= S_TO_NS / 100
  const strToHash = `${ticks.toFixed(0)}${TRUSTED_CLIENT_TOKEN}`
  return crypto.createHash('sha256').update(strToHash, 'ascii').digest('hex').toUpperCase()
}

function generateMuid() {
  return crypto.randomBytes(16).toString('hex').toUpperCase()
}

const connectionId = crypto.randomUUID().replace(/-/g, '')
const secMsGec = generateSecMsGec()
const muid = generateMuid()
const requestId = crypto.randomUUID().replace(/-/g, '')

const targetUrl = `${BASE_URL}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}&ConnectionId=${connectionId}`

console.log('=== Edge TTS Direct Connection Test (with DRM) ===')
console.log(`Sec-MS-GEC: ${secMsGec}`)
console.log(`Sec-MS-GEC-Version: ${SEC_MS_GEC_VERSION}`)
console.log(`MUID: ${muid}`)
console.log(`URL: ${targetUrl.substring(0, 100)}...`)
console.log()

const ws = new WebSocket(targetUrl, {
  headers: {
    'Origin': EDGE_ORIGIN,
    'User-Agent': EDGE_UA,
    'Pragma': 'no-cache',
    'Cache-Control': 'no-cache',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cookie': `muid=${muid};`,
  }
})

ws.on('open', () => {
  console.log('✓ Connected to Microsoft Edge TTS')

  const configMsg = `X-Timestamp:${new Date().toISOString()}\r\n` +
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

  console.log('Sending config...')
  ws.send(configMsg)

  const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='fr-FR'>` +
    `<voice name='fr-FR-DeniseNeural'>` +
    `<prosody rate='+0%'>Bonjour, ceci est un test.</prosody></voice></speak>`

  const ssmlMsg = `X-RequestId:${requestId}\r\n` +
    `Content-Type:application/ssml+xml\r\n` +
    `X-Timestamp:${new Date().toISOString()}\r\n` +
    `Path:ssml\r\n\r\n` +
    ssml

  console.log('Sending SSML...')
  ws.send(ssmlMsg)
  console.log('Waiting for response...')
})

let audioBytes = 0
let chunks = 0

ws.on('message', (data, isBinary) => {
  if (isBinary) {
    chunks++
    audioBytes += data.length
    console.log(`  Audio chunk #${chunks}: ${data.length} bytes (total: ${audioBytes})`)
  } else {
    const str = data.toString()
    console.log(`  Text: ${str.substring(0, 150)}`)
    if (str.includes('Path:turn.end')) {
      console.log()
      console.log(`✓ SUCCESS: ${chunks} chunks, ${audioBytes} bytes`)
      ws.close()
    }
  }
})

ws.on('error', (err) => {
  console.error('✗ ERROR:', err.message)
})

ws.on('close', (code, reason) => {
  console.log(`Closed: code=${code}, reason=${reason.toString()}`)
  process.exit(audioBytes > 0 ? 0 : 1)
})

setTimeout(() => {
  console.error('✗ TIMEOUT')
  ws.close()
  process.exit(1)
}, 15000)
