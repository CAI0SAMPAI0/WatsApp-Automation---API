import express from 'express'
import cors from 'cors'

let currentQR: string | null = null
let isConnected = false
let currentUserId: string | null = null

export const setQR = (qr: string) => { currentQR = qr }
export const setConnected = (status: boolean) => { 
    isConnected = status
    if (status) currentQR = null 
}
export const getCurrentUserId = () => currentUserId

export const startServer = () => {
    const app = express()
    const PORT = process.env.PORT || 3001

    app.use(cors({ origin: '*' }))
    app.use(express.json())

    app.get('/status', (req, res) => {
        res.json({ connected: isConnected, hasQR: !!currentQR })
    })

    app.get('/qr', (req, res) => {
        if (!currentQR) return res.json({ qr: null })
        res.json({ qr: currentQR })
    })

    app.post('/connect', (req, res) => {
        const { user_id } = req.body
        if (!user_id) return res.status(400).json({ error: 'user_id obrigatório' })
        currentUserId = user_id
        console.log(`Usuário ${user_id} iniciou conexão`)
        res.json({ ok: true })
    })

    app.listen(PORT, () => console.log(`API rodando na porta ${PORT}`))
}