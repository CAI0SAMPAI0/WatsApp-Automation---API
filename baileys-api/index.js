const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const express = require('express')
const qrcode  = require('qrcode')
const P       = require('pino')
const fs      = require('fs')
const path    = require('path')

const app  = express()
const PORT = process.env.PORT || 3000
const API_KEY = process.env.API_KEY || 'minha-chave-secreta'

app.use(express.json({ limit: '50mb' }))

// ── auth middleware ────────────────────────────────────────────────────────
app.use((req, res, next) => {
  if (req.path === '/qrcode' || req.path === '/status') return next()
  const key = req.headers['x-api-key'] || req.query.apikey
  if (key !== API_KEY) return res.status(401).json({ error: 'Unauthorized' })
  next()
})

// ── estado global ─────────────────────────────────────────────────────────
let sock        = null
let qrCodeData  = null   // base64 da imagem PNG do QR
let isConnected = false
let isConnecting = false

const AUTH_DIR = process.env.AUTH_DIR || path.join(__dirname, 'auth_info')

// ── conectar ao WhatsApp ──────────────────────────────────────────────────
async function connectToWhatsApp() {
  if (isConnecting) return
  isConnecting = true

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
  const { version } = await fetchLatestBaileysVersion()

  console.log(`[Baileys] Usando versão WA: ${version.join('.')}`)

  sock = makeWASocket({
    version,
    auth:   state,
    logger: P({ level: 'silent' }),
    printQRInTerminal: true,
    browser: ['Chrome (Linux)', 'Chrome', '121.0.0'],
    syncFullHistory: false,
  })

  // salva credenciais sempre que atualizar
  sock.ev.on('creds.update', saveCreds)

  // QR Code
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      console.log('[Baileys] QR Code gerado — acesse /qrcode para escanear')
      qrCodeData = await qrcode.toDataURL(qr)
      isConnected = false
    }

    if (connection === 'open') {
      console.log('[Baileys] ✅ Conectado ao WhatsApp!')
      isConnected = true
      isConnecting = false
      qrCodeData   = null
    }

    if (connection === 'close') {
      isConnected  = false
      isConnecting = false
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode

      console.log(`[Baileys] Conexão fechada. Razão: ${reason}`)

      // reconecta em tudo, exceto logout
      if (reason === DisconnectReason.loggedOut) {
        console.log('[Baileys] Logout detectado — removendo sessão...')
        fs.rmSync(AUTH_DIR, { recursive: true, force: true })
        setTimeout(connectToWhatsApp, 2000)
      } else {
        setTimeout(connectToWhatsApp, 3000)
      }
    }
  })
}

// ── inicializa ────────────────────────────────────────────────────────────
connectToWhatsApp()

// ══════════════════════════════════════════════════════════════════════════
// ROTAS
// ══════════════════════════════════════════════════════════════════════════

// GET /status — verificar conexão
app.get('/status', (req, res) => {
  res.json({
    connected:   isConnected,
    hasQR:       !!qrCodeData,
    phone:       sock?.user?.id || null,
  })
})

// GET /qrcode — retorna página HTML com QR Code para escanear
app.get('/qrcode', (req, res) => {
  if (isConnected) {
    return res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:40px">
      <h2 style="color:green">✅ WhatsApp Conectado!</h2>
      <p>Número: ${sock?.user?.id || 'desconhecido'}</p>
    </body></html>`)
  }
  if (!qrCodeData) {
    return res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:40px">
      <h2>⏳ Gerando QR Code...</h2>
      <p>Aguarde e recarregue a página em 3 segundos.</p>
      <script>setTimeout(()=>location.reload(),3000)</script>
    </body></html>`)
  }
  res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#111;color:#fff">
    <h2>📱 Escaneie o QR Code</h2>
    <p>Abra o WhatsApp → Dispositivos conectados → Conectar dispositivo</p>
    <img src="${qrCodeData}" style="border-radius:12px;margin:20px auto;display:block"/>
    <p style="color:#aaa;font-size:12px">A página atualiza automaticamente após conexão</p>
    <script>
      setInterval(async()=>{
        const r = await fetch('/status')
        const d = await r.json()
        if(d.connected) location.reload()
      }, 3000)
    </script>
  </body></html>`)
})

// POST /send/text — enviar texto
app.post('/send/text', async (req, res) => {
  if (!isConnected) return res.status(503).json({ error: 'WhatsApp não conectado' })

  const { number, message } = req.body
  if (!number || !message) return res.status(400).json({ error: 'number e message são obrigatórios' })

  try {
    const jid = formatJID(number)
    await sock.sendMessage(jid, { text: message })
    console.log(`[OK] Texto enviado para ${number}`)
    res.json({ ok: true, jid })
  } catch (e) {
    console.error(`[ERRO] ${e.message}`)
    res.status(500).json({ error: e.message })
  }
})

// POST /send/media — enviar mídia (imagem, vídeo, documento, áudio)
app.post('/send/media', async (req, res) => {
  if (!isConnected) return res.status(503).json({ error: 'WhatsApp não conectado' })

  const { number, media_url, media_base64, mimetype, filename, caption, media_type } = req.body
  if (!number) return res.status(400).json({ error: 'number é obrigatório' })

  try {
    const jid      = formatJID(number)
    const msgType  = media_type || 'document'
    let   content  = {}

    if (media_base64) {
      const buffer = Buffer.from(media_base64, 'base64')
      content = buildMediaContent(msgType, buffer, mimetype, filename, caption)
    } else if (media_url) {
      content = buildMediaContent(msgType, { url: media_url }, mimetype, filename, caption)
    } else {
      return res.status(400).json({ error: 'media_url ou media_base64 é obrigatório' })
    }

    await sock.sendMessage(jid, content)
    console.log(`[OK] Mídia (${msgType}) enviada para ${number}`)
    res.json({ ok: true, jid })
  } catch (e) {
    console.error(`[ERRO] ${e.message}`)
    res.status(500).json({ error: e.message })
  }
})

// DELETE /logout — desconectar e limpar sessão
app.delete('/logout', async (req, res) => {
  try {
    await sock?.logout()
  } catch (_) {}
  fs.rmSync(AUTH_DIR, { recursive: true, force: true })
  isConnected = false
  res.json({ ok: true, message: 'Sessão encerrada. Reconectando...' })
  setTimeout(connectToWhatsApp, 2000)
})

// ── helpers ───────────────────────────────────────────────────────────────
function formatJID(number) {
  // aceita: "5511999999999", "5511999999999@s.whatsapp.net", "NomeGrupo@g.us"
  if (number.includes('@')) return number
  const clean = number.replace(/\D/g, '')
  return `${clean}@s.whatsapp.net`
}

function buildMediaContent(type, source, mimetype, filename, caption) {
  const base = typeof source === 'object' && source.url
    ? { url: source.url }
    : source   // Buffer

  if (type === 'image')    return { image:    base, caption: caption || '', mimetype }
  if (type === 'video')    return { video:    base, caption: caption || '', mimetype }
  if (type === 'audio')    return { audio:    base, mimetype: mimetype || 'audio/mp4', ptt: false }
  // default: document
  return {
    document: base,
    mimetype: mimetype || 'application/octet-stream',
    fileName: filename || 'arquivo',
    caption:  caption  || '',
  }
}

// ── start ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[Baileys API] Rodando na porta ${PORT}`)
  console.log(`[Baileys API] QR Code: http://localhost:${PORT}/qrcode`)
})