import express from 'express'
import cors from 'cors'

let currentQR: string | null = null
let isConnected = false

export const setQR = (qr: string) => { currentQR = qr }
export const setConnected = (status: boolean) => { isConnected = status; if (status) currentQR = null }

export const startServer = () => {
    const app = express()
    const PORT = process.env.PORT || 3001

    app.use(cors({
        origin: '*'
    }))

    app.get('/status', (req, res) => {
        res.json({ connected: isConnected, hasQR: !!currentQR })
    })

    app.get('/qr', (req, res) => {
        if (!currentQR) return res.json({ qr: null })
        res.json({ qr: currentQR })
    })

    app.listen(PORT, () => console.log(`API rodando na porta ${PORT}`))
}