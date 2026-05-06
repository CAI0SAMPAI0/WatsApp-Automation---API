import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import express from 'express'
import qrcode from 'qrcode'
import P from 'pino'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3001
const API_KEY = process.env.API_KEY || 'minha-chave-secreta'

app.use(express.json({ limit: '50mb' }))

// ── auth middleware ────────────────────────────────────────────────────────
app.use((req, res, next) => {
  if (req.path === '/qrcode' || req.path === '/status') return next()
  const key = req.headers['x-api-key'] || req.query.apikey
  if (key !== API_KEY) return res.status(401).json({ error: 'Unauthorized' })
  next()
})

// ── estado global multi-sessão ──────────────────────────────────────────────
const sessions = new Map()

// Helper para pegar o diretório de auth de cada usuário
const getAuthDir = (sessionId) => {
  const dir = path.join(__dirname, 'sessions', sessionId)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

async function connectToWhatsApp(sessionId) {
  if (sessions.has(sessionId)) return sessions.get(sessionId)

  const authDir = getAuthDir(sessionId)
  const { state, saveCreds } = await useMultiFileAuthState(authDir)
  const { version } = await fetchLatestBaileysVersion()

  console.log(`[Baileys] Iniciando sessão: ${sessionId}`)

  const sock = makeWASocket({
    version,
    auth: state,
    logger: P({ level: 'silent' }),
    browser: Browsers.macOS('Desktop'),
    syncFullHistory: false,
  })

  const sessionData = { sock, isConnected: false, qr: null }
  sessions.set(sessionId, sessionData)

  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update
    if (qr) sessionData.qr = await qrcode.toDataURL(qr)
    if (connection === 'open') {
      sessionData.isConnected = true
      sessionData.qr = null
      console.log(`[Baileys] ✅ Sessão ${sessionId} conectada!`)
    }
    if (connection === 'close') {
      sessionData.isConnected = false
      const shouldReconnect = (new Boom(lastDisconnect?.error)?.output?.statusCode) !== DisconnectReason.loggedOut
      if (shouldReconnect) connectToWhatsApp(sessionId)
      else {
        sessions.delete(sessionId)
        fs.rmSync(authDir, { recursive: true, force: true })
      }
    }
  })

  return sessionData
}

// ── middleware de sessão ──────────────────────────────────────────────────
app.use(async (req, res, next) => {
  if (req.path === '/health' || req.path === '/qrcode') return next()
  const sessionId = req.headers['x-session-id'] || req.query.sessionId
  if (!sessionId) {
    if (req.path.includes('/status')) return next()
    return res.status(400).json({ error: 'x-session-id header é obrigatório' })
  }
  req.sessionId = sessionId
  next()
})

app.get('/health', (req, res) => res.json({ status: 'ok' }))

app.get('/status', async (req, res) => {
  const sessionId = req.sessionId || req.query.sessionId
  if (!sessionId) return res.status(400).json({ error: 'sessionId necessário' })
  
  let session = sessions.get(sessionId)
  if (!session && fs.existsSync(getAuthDir(sessionId))) {
    session = await connectToWhatsApp(sessionId)
  }

  res.json({
    connected: session?.isConnected || false,
    hasQR: !!session?.qr,
    sessionId: sessionId
  })
})

app.get('/contacts', async (req, res) => {
  const session = sessions.get(req.sessionId)
  if (!session?.isConnected) return res.status(503).json({ error: 'Sessão não conectada' })
  
  try {
    const contacts = await session.sock.store?.contacts || {}
    res.json(Object.values(contacts))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/groups', async (req, res) => {
  const session = sessions.get(req.sessionId)
  if (!session?.isConnected) return res.status(503).json({ error: 'Sessão não conectada' })
  
  try {
    const groups = await session.sock.groupFetchAllParticipating()
    res.json(Object.values(groups))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/qrcode', async (req, res) => {
  const sessionId = req.query.sessionId || req.sessionId
  if (!sessionId) return res.status(400).send('Session ID necessário')
  
  const session = await connectToWhatsApp(sessionId)
  
  if (session.isConnected) {
    return res.send(`<h2>✅ Conectado! (Sessão: ${sessionId})</h2>`)
  }
  if (!session.qr) {
    return res.send(`<h2>⏳ Gerando QR...</h2><script>setTimeout(()=>location.reload(),3000)</script>`)
  }
  res.send(`<html><body style="background:#111;color:#fff;text-align:center;padding:50px">
    <h3>Escaneie para Sessão: ${sessionId}</h3>
    <img src="${session.qr}" />
    <script>setInterval(async()=>{ const r=await fetch('/status?sessionId=${sessionId}'); const d=await r.json(); if(d.connected) location.reload(); }, 3000)</script>
  </body></html>`)
})

app.post('/send/text', async (req, res) => {
  const session = sessions.get(req.sessionId)
  if (!session?.isConnected) return res.status(503).json({ error: 'Sessão não conectada' })
  const { number, message } = req.body
  try {
    await session.sock.sendMessage(formatJID(number), { text: message })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/send/media', async (req, res) => {
  const session = sessions.get(req.sessionId)
  if (!session?.isConnected) return res.status(503).json({ error: 'Sessão não conectada' })
  
  const { number, media_url, media_base64, mimetype, filename, caption, media_type } = req.body
  if (!number) return res.status(400).json({ error: 'number é obrigatório' })
  
  try {
    const jid = formatJID(number)
    const msgType = media_type || 'document'
    let content = {}
    
    if (media_base64) {
      const buffer = Buffer.from(media_base64, 'base64')
      content = buildMediaContent(msgType, buffer, mimetype, filename, caption)
    } else if (media_url) {
      content = buildMediaContent(msgType, { url: media_url }, mimetype, filename, caption)
    } else {
      return res.status(400).json({ error: 'media_url ou media_base64 é obrigatório' })
    }
    
    await session.sock.sendMessage(jid, content)
    console.log(`[OK] Mídia (${msgType}) enviada para ${number}`)
    res.json({ ok: true, jid })
  } catch (e) {
    console.error(`[ERRO] ${e.message}`)
    res.status(500).json({ error: e.message })
  }
})

app.delete('/logout', async (req, res) => {
  const sessionId = req.sessionId
  const session = sessions.get(sessionId)
  const authDir = getAuthDir(sessionId)

  try { 
    if (session?.sock) await session.sock.logout() 
  } catch (_) { }
  
  if (fs.existsSync(authDir)) {
    fs.rmSync(authDir, { recursive: true, force: true })
  }
  
  sessions.delete(sessionId)
  res.json({ ok: true, message: 'Sessão encerrada.' })
})

// ── helpers ───────────────────────────────────────────────────────────────
function formatJID(number) {
  if (number.includes('@')) return number
  const clean = number.replace(/\D/g, '')
  return `${clean}@s.whatsapp.net`
}

function buildMediaContent(type, source, mimetype, filename, caption) {
  const base = (typeof source === 'object' && source.url) ? { url: source.url } : source
  if (type === 'image') return { image: base, caption: caption || '', mimetype }
  if (type === 'video') return { video: base, caption: caption || '', mimetype }
  if (type === 'audio') return { audio: base, mimetype: mimetype || 'audio/mp4', ptt: false }
  return {
    document: base,
    mimetype: mimetype || 'application/octet-stream',
    fileName: filename || 'arquivo',
    caption: caption || '',
  }
}

// Auto-reconnect sessions on boot
const sessionsDir = path.join(__dirname, 'sessions')
if (fs.existsSync(sessionsDir)) {
  const folders = fs.readdirSync(sessionsDir)
  for (const sessionId of folders) {
    console.log(`[Boot] Rehidratando sessão: ${sessionId}`)
    connectToWhatsApp(sessionId).catch(e => console.error(`Erro ao reconectar ${sessionId}:`, e))
  }
}

app.listen(PORT, () => {
  console.log(`[Baileys API] Rodando na porta ${PORT}`)
  console.log(`[Baileys API] QR Code: http://localhost:${PORT}/qrcode`)
})