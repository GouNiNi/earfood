/**
 * Edge TTS WebSocket Proxy
 *
 * Relaie les messages entre le navigateur et le service Edge TTS de Microsoft.
 * Nécessaire car le navigateur ne peut pas définir les headers Origin/User-Agent
 * requis par le service Microsoft.
 *
 * Implémente le DRM Sec-MS-GEC (SHA256 token basé sur le temps)
 * requis depuis fin 2024 par Microsoft.
 */

import { WebSocketServer, WebSocket } from 'ws'
import http from 'http'
import crypto from 'crypto'

const PORT = process.env.PORT || 3001

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
const CHROMIUM_FULL_VERSION = '143.0.3650.75'
const CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split('.')[0]
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`

const BASE_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1'

const EDGE_ORIGIN = 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold'
const EDGE_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`

// Windows file time epoch offset (seconds between 1601-01-01 and 1970-01-01)
const WIN_EPOCH = 11644473600
const S_TO_NS = 1e9

function log(...args) {
  console.log(`[${new Date().toISOString()}] [TTS-PROXY]`, ...args)
}

function logError(...args) {
  console.error(`[${new Date().toISOString()}] [TTS-PROXY ERROR]`, ...args)
}

/**
 * Génère le token Sec-MS-GEC (DRM Microsoft)
 * Algorithme : SHA256( windowsFileTimeTicks + TrustedClientToken )
 * avec le temps arrondi aux 5 minutes inférieures
 */
function generateSecMsGec() {
  // Timestamp Unix en secondes
  let ticks = Date.now() / 1000

  // Convertir en epoch Windows (1601-01-01)
  ticks += WIN_EPOCH

  // Arrondir aux 5 minutes inférieures (300 secondes)
  ticks -= ticks % 300

  // Convertir en intervalles de 100 nanosecondes (format Windows file time)
  ticks *= S_TO_NS / 100

  // Concaténer avec le token et hasher en SHA256
  const strToHash = `${ticks.toFixed(0)}${TRUSTED_CLIENT_TOKEN}`
  return crypto.createHash('sha256').update(strToHash, 'ascii').digest('hex').toUpperCase()
}

/**
 * Génère un MUID aléatoire (cookie requis)
 */
function generateMuid() {
  return crypto.randomBytes(16).toString('hex').toUpperCase()
}

/**
 * Construit l'URL complète avec tous les paramètres DRM
 */
function buildTargetUrl(connectionId) {
  const secMsGec = generateSecMsGec()
  return `${BASE_URL}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}&ConnectionId=${connectionId}`
}

log('=== Edge TTS Proxy starting ===')
log(`PORT=${PORT}`)
log(`CHROMIUM_VERSION=${CHROMIUM_FULL_VERSION}`)

// Health check HTTP server
const server = http.createServer((req, res) => {
  log(`HTTP ${req.method} ${req.url}`)
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', service: 'edge-tts-proxy', uptime: process.uptime() }))
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('Edge TTS Proxy is running')
  }
})

// Accept WebSocket on any path (noServer mode)
const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', (request, socket, head) => {
  log(`WS UPGRADE: path=${request.url}, from=${socket.remoteAddress}`)
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request)
  })
})

function handleConnection(clientWs, request) {
  const connectionId = crypto.randomUUID().replace(/-/g, '')
  const targetUrl = buildTargetUrl(connectionId)
  const muid = generateMuid()

  log(`[${connectionId}] New client from path=${request?.url}`)
  log(`[${connectionId}] Target: ${targetUrl.substring(0, 120)}...`)
  log(`[${connectionId}] Sec-MS-GEC generated, MUID=${muid.substring(0, 8)}...`)

  const edgeWs = new WebSocket(targetUrl, {
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

  let edgeReady = false
  const pendingMessages = []

  edgeWs.on('open', () => {
    log(`[${connectionId}] ✓ Connected to Microsoft Edge TTS`)
    edgeReady = true
    log(`[${connectionId}] Flushing ${pendingMessages.length} pending messages`)
    for (const msg of pendingMessages) {
      edgeWs.send(msg)
    }
    pendingMessages.length = 0
  })

  clientWs.on('message', (data) => {
    const preview = typeof data === 'string' ? data.substring(0, 80) : `[binary ${data.length}B]`
    log(`[${connectionId}] Client → Edge: ${preview}`)
    if (edgeReady) {
      edgeWs.send(data)
    } else {
      pendingMessages.push(data)
    }
  })

  edgeWs.on('message', (data, isBinary) => {
    if (isBinary) {
      log(`[${connectionId}] Edge → Client: [binary ${data.length}B]`)
    } else {
      const str = data.toString()
      log(`[${connectionId}] Edge → Client: ${str.substring(0, 100)}`)
    }
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data, { binary: isBinary })
    }
  })

  edgeWs.on('close', (code, reason) => {
    log(`[${connectionId}] Edge closed: code=${code} reason=${reason}`)
    if (clientWs.readyState === WebSocket.OPEN) clientWs.close()
  })

  edgeWs.on('error', (err) => {
    logError(`[${connectionId}] Edge error: ${err.message}`)
    if (clientWs.readyState === WebSocket.OPEN) clientWs.close()
  })

  clientWs.on('close', (code, reason) => {
    log(`[${connectionId}] Client closed: code=${code} reason=${reason}`)
    if (edgeWs.readyState === WebSocket.OPEN) edgeWs.close()
  })

  clientWs.on('error', (err) => {
    logError(`[${connectionId}] Client error: ${err.message}`)
    if (edgeWs.readyState === WebSocket.OPEN) edgeWs.close()
  })
}

wss.on('connection', handleConnection)

process.on('uncaughtException', (err) => {
  logError('Uncaught exception:', err.message, err.stack)
})

process.on('unhandledRejection', (reason) => {
  logError('Unhandled rejection:', reason)
})

server.listen(PORT, '0.0.0.0', () => {
  log(`=== Edge TTS proxy listening on 0.0.0.0:${PORT} ===`)
})
