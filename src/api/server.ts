import express from 'express'
import cors from 'cors'
import * as SessionManager from '../whatsapp/sessionManager.js'
import fs from 'fs'
import path from 'path'

export const startServer = () => {
    const app = express()
    const PORT = process.env.PORT || 3001

    app.use(cors({ origin: '*' }))
    app.use(express.json())

    app.get('/status', (req, res) => {
        const userId = req.query.user_id as string
        if (!userId) return res.status(400).json({ error: 'user_id required' })
        res.json({ connected: SessionManager.isConnected(userId), hasQR: !!SessionManager.getQR(userId) })
    })

    app.get('/qr', (req, res) => {
        const userId = req.query.user_id as string
        if (!userId) return res.status(400).json({ error: 'user_id required' })
        res.json({ qr: SessionManager.getQR(userId) || null })
    })

    app.post('/connect', async (req, res) => {
        const { user_id } = req.body
        if (!user_id) return res.status(400).json({ error: 'user_id obrigatório' })
        
        try {
            await SessionManager.createUserSession(user_id)
            res.json({ ok: true })
        } catch (err) {
            res.status(500).json({ error: 'Erro ao conectar' })
        }
    })

    app.get('/sessions', (req, res) => {
        const base = process.env.RAILWAY_VOLUME_MOUNT_PATH || './'
        const authBase = path.join(base, 'auth')
        if (!fs.existsSync(authBase)) {
            return res.json([])
        }
        const folders = fs.readdirSync(authBase).filter(name => {
            return fs.statSync(path.join(authBase, name)).isDirectory()
        })
        const sessionList = folders.map(userId => {
            const folderPath = path.join(authBase, userId)
            const stats = fs.statSync(folderPath)
            
            return {
                userId,
                connected: SessionManager.isConnected(userId),
                hasQR: !!SessionManager.getQR(userId),
                lastActivity: stats.mtime
            }
        })
        res.json(sessionList)
    })

    app.listen(PORT, () => console.log(`API rodando na porta ${PORT}`))
}