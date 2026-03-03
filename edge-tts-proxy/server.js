/**
 * Edge TTS WebSocket Proxy
 *
 * Relaie les messages entre le navigateur et le service Edge TTS de Microsoft.
 * Nécessaire car le navigateur ne peut pas définir les headers Origin/User-Agent
 * requis par le service Microsoft.
 */

import { WebSocketServer, WebSocket } from 'ws'
import http from 'http'
import crypto from 'crypto'

const PORT = process.env.PORT || 3001

const EDGE_TTS_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1'
const TRUSTED_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
const EDGE_ORIGIN = 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold'
const EDGE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0'

function log(...args) {
  console.log(`[${new Date().toISOString()}] [TTS-PROXY]`, ...args)
}

function logError(...args) {
  console.error(`[${new Date().toISOString()}] [TTS-PROXY ERROR]`, ...args)
}

log('=== Edge TTS Proxy starting ===')
log(`PORT=${PORT}`)
log(`EDGE_TTS_URL=${EDGE_TTS_URL}`)

// Health check HTTP server
const server = http.createServer((req, res) => {
  log(`HTTP ${req.method} ${req.url} from ${req.socket.remoteAddress}`)
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
  log(`>>> WS UPGRADE request: path=${request.url}, origin=${request.headers.origin}, host=${request.headers.host}, from=${socket.remoteAddress}`)
  log(`    Headers: ${JSON.stringify(request.headers)}`)

  wss.handleUpgrade(request, socket, head, (ws) => {
    log(`>>> WS UPGRADE accepted on path=${request.url}`)
    wss.emit('connection', ws, request)
  })
})

function handleConnection(clientWs, request) {
  const connectionId = crypto.randomUUID().replace(/-/g, '')
  const targetUrl = `${EDGE_TTS_URL}?TrustedClientToken=${TRUSTED_TOKEN}&ConnectionId=${connectionId}`

  log(`[${connectionId}] New client connection from path=${request?.url}`)
  log(`[${connectionId}] Connecting to Microsoft Edge TTS...`)
  log(`[${connectionId}] Target URL: ${targetUrl}`)

  const edgeWs = new WebSocket(targetUrl, {
    headers: {
      'Origin': EDGE_ORIGIN,
      'User-Agent': EDGE_UA,
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
    const preview = typeof data === 'string' ? data.substring(0, 100) : `[binary ${data.length} bytes]`
    log(`[${connectionId}] Client → Edge: ${preview}`)
    if (edgeReady) {
      edgeWs.send(data)
    } else {
      pendingMessages.push(data)
      log(`[${connectionId}] (queued, edge not ready)`)
    }
  })

  edgeWs.on('message', (data, isBinary) => {
    if (isBinary) {
      log(`[${connectionId}] Edge → Client: [binary ${data.length} bytes]`)
    } else {
      const str = data.toString()
      log(`[${connectionId}] Edge → Client: ${str.substring(0, 120)}`)
    }
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data, { binary: isBinary })
    } else {
      log(`[${connectionId}] Client not open (state=${clientWs.readyState}), dropping message`)
    }
  })

  edgeWs.on('close', (code, reason) => {
    log(`[${connectionId}] Edge TTS closed: code=${code} reason=${reason}`)
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close()
    }
  })

  edgeWs.on('error', (err) => {
    logError(`[${connectionId}] Edge TTS error: ${err.message}`)
    logError(`[${connectionId}] Error details:`, err.code, err.errno)
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close()
    }
  })

  clientWs.on('close', (code, reason) => {
    log(`[${connectionId}] Client closed: code=${code} reason=${reason}`)
    if (edgeWs.readyState === WebSocket.OPEN) {
      edgeWs.close()
    }
  })

  clientWs.on('error', (err) => {
    logError(`[${connectionId}] Client error: ${err.message}`)
    if (edgeWs.readyState === WebSocket.OPEN) {
      edgeWs.close()
    }
  })
}

wss.on('connection', handleConnection)

// Log unhandled errors
process.on('uncaughtException', (err) => {
  logError('Uncaught exception:', err.message, err.stack)
})

process.on('unhandledRejection', (reason) => {
  logError('Unhandled rejection:', reason)
})

server.listen(PORT, '0.0.0.0', () => {
  log(`=== Edge TTS proxy listening on 0.0.0.0:${PORT} ===`)
  log(`Health check: http://localhost:${PORT}/health`)
})
