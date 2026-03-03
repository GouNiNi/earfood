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

// Health check HTTP server
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', service: 'edge-tts-proxy' }))
  } else {
    res.writeHead(404)
    res.end()
  }
})

// Accept WebSocket on any path (noServer mode)
const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', (request, socket, head) => {
  console.log(`WS upgrade request on path: ${request.url}`)
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request)
  })
})

function handleConnection(clientWs) {
  const connectionId = crypto.randomUUID().replace(/-/g, '')
  const targetUrl = `${EDGE_TTS_URL}?TrustedClientToken=${TRUSTED_TOKEN}&ConnectionId=${connectionId}`

  console.log(`New TTS connection ${connectionId}`)

  // Connecter à Microsoft Edge TTS avec les bons headers
  const edgeWs = new WebSocket(targetUrl, {
    headers: {
      'Origin': EDGE_ORIGIN,
      'User-Agent': EDGE_UA,
    }
  })

  let edgeReady = false
  const pendingMessages = []

  edgeWs.on('open', () => {
    console.log(`Edge TTS connected for ${connectionId}`)
    edgeReady = true
    for (const msg of pendingMessages) {
      edgeWs.send(msg)
    }
    pendingMessages.length = 0
  })

  // Relayer : client → Edge TTS
  clientWs.on('message', (data) => {
    if (edgeReady) {
      edgeWs.send(data)
    } else {
      pendingMessages.push(data)
    }
  })

  // Relayer : Edge TTS → client
  edgeWs.on('message', (data, isBinary) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data, { binary: isBinary })
    }
  })

  // Gestion des fermetures
  edgeWs.on('close', (code, reason) => {
    console.log(`Edge TTS closed for ${connectionId}: ${code} ${reason}`)
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close()
    }
  })

  edgeWs.on('error', (err) => {
    console.error(`Edge TTS error for ${connectionId}:`, err.message)
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close()
    }
  })

  clientWs.on('close', () => {
    if (edgeWs.readyState === WebSocket.OPEN) {
      edgeWs.close()
    }
  })

  clientWs.on('error', () => {
    if (edgeWs.readyState === WebSocket.OPEN) {
      edgeWs.close()
    }
  })
}

wss.on('connection', handleConnection)

server.listen(PORT, () => {
  console.log(`Edge TTS proxy listening on port ${PORT}`)
})
