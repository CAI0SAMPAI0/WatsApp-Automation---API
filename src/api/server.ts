import express from 'express'
import cors from 'cors'
import * as SessionManager from '../whatsapp/sessionManager.js'
import fs from 'fs'
import path from 'path'
import { supabase } from '../supabase/client.js'

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

    app.get('/sessions', async (req, res) => {
        const base = process.env.RAILWAY_VOLUME_MOUNT_PATH || './'
        const authBase = path.join(base, 'auth')
        if (!fs.existsSync(authBase)) {
            return res.json([])
        }
        
        const folders = fs.readdirSync(authBase).filter(name => {
            return fs.statSync(path.join(authBase, name)).isDirectory()
        })

        // Buscar nomes dos usuários no banco de dados para cruzar os dados
        let usernamesMap: Record<string, string> = {}
        try {
            const { data: profiles, error } = await supabase
                .from('user_profiles')
                .select('id, username')

            if (!error && profiles) {
                profiles.forEach(p => {
                    usernamesMap[p.id] = p.username
                })
            }
        } catch (dbErr) {
            console.error('Erro ao buscar perfis no banco de dados:', dbErr)
        }

        const sessionList = folders.map(userId => {
            const folderPath = path.join(authBase, userId)
            const stats = fs.statSync(folderPath)
            
            // Formatando data para o fuso horário de Brasília (UTC-3)
            const lastActivityBRT = stats.mtime.toLocaleString('pt-BR', {
                timeZone: 'America/Sao_Paulo'
            })

            return {
                userId,
                username: usernamesMap[userId] || 'desconhecido/inativo',
                connected: SessionManager.isConnected(userId),
                hasQR: !!SessionManager.getQR(userId),
                lastActivity: lastActivityBRT
            }
        })
        
        res.json(sessionList)
    })

    app.post('/disconnect', async (req, res) => {
        const { user_id } = req.body
        if (!user_id) return res.status(400).json({ error: 'user_id obrigatório' })
        
        try {
            await SessionManager.disconnectUserSession(user_id)
            res.json({ ok: true, message: `Sessão do usuário ${user_id} removida com sucesso.` })
        } catch (err) {
            res.status(500).json({ error: 'Erro ao desconectar sessão' })
        }
    })

    app.listen(PORT, () => console.log(`API rodando na porta ${PORT}`))
}